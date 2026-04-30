# sync-to-supabase.ps1
# Upload MT4/MT5 JSON reports to Supabase (Realtime mode)
#
# Watches the MTExport folder and uploads immediately on file change.
# Uses a mutex so only one instance runs at a time.
# Task scheduler can keep calling every minute - extras exit instantly.
#
# Also polls Supabase for AutoTrading toggle commands (ea_controls where account_number=0)
# and sends Ctrl+E to all running MetaTrader windows when the state changes.
#
# Usage A (direct):
#   .\sync-to-supabase.ps1 -Url "https://xxxx.supabase.co" -AnonKey "eyJ..." -Email "you@example.com" -Password "pass"
#
# Usage B (via run-sync.vbs, no args needed - credentials embedded in vbs):
#   wscript run-sync.vbs

param(
    [string]$Url      = '',
    [string]$AnonKey  = '',
    [string]$Email    = '',
    [string]$Password = '',
    [string]$Folder   = "$env:USERPROFILE\MTExport"
)

$Url      = $Url.Trim()
$AnonKey  = $AnonKey.Trim()
$Email    = $Email.Trim()
$Password = $Password.Trim()

if (-not $Url -or -not $AnonKey -or -not $Email -or -not $Password) {
    Write-Error "Missing credentials. Provide -Url -AnonKey -Email -Password or use run-sync.vbs."
    exit 1
}

# ── Single-instance guard ─────────────────────────────────────────
$mutex = New-Object System.Threading.Mutex($false, "Global\MTExportSyncMutex")
if (-not $mutex.WaitOne(0)) {
    exit 0
}

# ── Win32 API for AutoTrading toggle (Ctrl+E) ─────────────────────
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class Win32 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
    [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
    public const uint KEYEVENTF_KEYUP = 0x0002;
    public const byte VK_CONTROL = 0x11;
    public const byte VK_E = 0x45;
}
"@

# ── Auth helpers ──────────────────────────────────────────────────
function Get-Auth {
    $body = @{ email = $Email; password = $Password } | ConvertTo-Json
    $res = Invoke-RestMethod "$Url/auth/v1/token?grant_type=password" `
        -Method Post `
        -Headers @{ "apikey" = $AnonKey; "Content-Type" = "application/json" } `
        -Body $body -ErrorAction Stop
    return $res
}

function New-Headers($jwt) {
    return @{
        "apikey"        = $AnonKey
        "Authorization" = "Bearer $jwt"
        "Content-Type"  = "application/json"
        "Prefer"        = "resolution=merge-duplicates"
    }
}

# ── Upload single file ────────────────────────────────────────────
function Send-Report($filePath, $headers) {
    $text   = [IO.File]::ReadAllText($filePath, [Text.Encoding]::UTF8)
    $parsed = $text | ConvertFrom-Json
    $accountNumber = [long]$parsed.account
    $filename = [IO.Path]::GetFileName($filePath)
    $body = @{
        p_account_number = $accountNumber
        p_filename       = $filename
        p_data           = $parsed
    } | ConvertTo-Json -Depth 20 -Compress
    Invoke-RestMethod "$Url/rest/v1/rpc/upsert_report" `
        -Method Post -Headers $headers -Body $body -ErrorAction Stop | Out-Null
    Write-Host "[OK] $filename (account: $accountNumber)"
}

# ── AutoTrading toggle helpers ────────────────────────────────────
function Get-TradingStates($jwt) {
    $states = @{}
    try {
        $resp = Invoke-RestMethod "$Url/rest/v1/ea_controls?select=account_number,enabled" `
            -Method Get `
            -Headers @{ "apikey" = $AnonKey; "Authorization" = "Bearer $jwt" } `
            -ErrorAction Stop
        foreach ($row in @($resp)) {
            if ($row -ne $null -and $row.PSObject.Properties['account_number']) {
                $states[[string]$row.account_number] = [bool]$row.enabled
            }
        }
        Write-Host "[AutoTrading] ea_controls loaded: $($states.Count) row(s)"
    }
    catch {
        Write-Warning "[AutoTrading] ERROR: $_"
        try { Add-Content "$env:TEMP\sync_debug.log" "[$(Get-Date -Format 'HH:mm:ss')] $_" } catch {}
        return $null
    }
    return $states
}

function Set-TradingState($accountNumber, $enabled, $jwt) {
    $body = @{
        p_account_number = [long]$accountNumber
        p_enabled        = [bool]$enabled
    } | ConvertTo-Json -Compress
    try {
        Invoke-RestMethod "$Url/rest/v1/rpc/upsert_ea_control" `
            -Method Post `
            -Headers @{ "apikey" = $AnonKey; "Authorization" = "Bearer $jwt"; "Content-Type" = "application/json" } `
            -Body $body -ErrorAction Stop | Out-Null
        Write-Host "[AutoTrading] Synced ea_controls: account=$accountNumber enabled=$enabled"
    } catch {
        Write-Warning "[AutoTrading] Set-TradingState error: $_"
    }
}

function Get-ActualTradingState($accountNumber) {
    $jsonPath = Join-Path $Folder "mt4_report_$accountNumber.json"
    if (-not (Test-Path $jsonPath)) { return $null }
    try {
        $data = [IO.File]::ReadAllText($jsonPath, [Text.Encoding]::UTF8) | ConvertFrom-Json
        if ($data.PSObject.Properties.Name -contains 'autoTrading') {
            return [bool]$data.autoTrading
        }
        return $null
    }
    catch {
        return $null
    }
}

function Send-AutoTradingToggle($accountNumber) {
    $allMt = @(Get-Process | Where-Object {
        $_.MainWindowHandle -ne [IntPtr]::Zero -and
        $_.ProcessName -match '^terminal'
    })
    if ($allMt.Count -eq 0) {
        Write-Warning "[AutoTrading] No MetaTrader windows found"
        return
    }
    # 口座番号でウィンドウタイトルを検索、見つからなければフォールバック
    $targets = @($allMt | Where-Object { $_.MainWindowTitle -match "\b$accountNumber\b" })
    if ($targets.Count -eq 0) {
        if ($allMt.Count -eq 1) {
            $targets = $allMt
            Write-Host "[AutoTrading] Account ${accountNumber}: title match failed, using only MT window"
        } else {
            Write-Warning "[AutoTrading] Cannot identify window for account ${accountNumber} ($($allMt.Count) windows open)"
            return
        }
    }
    # AttachThreadInput でバックグラウンドからでも SetForegroundWindow を成功させる
    $fgHwnd   = [Win32]::GetForegroundWindow()
    $dummy    = [uint32]0
    $fgThread = if ($fgHwnd -ne [IntPtr]::Zero) { [Win32]::GetWindowThreadProcessId($fgHwnd, [ref]$dummy) } else { 0 }
    $myThread = [Win32]::GetCurrentThreadId()

    foreach ($proc in $targets) {
        $hwnd = $proc.MainWindowHandle
        if ($fgThread -ne 0 -and $fgThread -ne $myThread) {
            [Win32]::AttachThreadInput($myThread, $fgThread, $true) | Out-Null
        }
        [Win32]::ShowWindow($hwnd, 9) | Out-Null   # SW_RESTORE
        [Win32]::SetForegroundWindow($hwnd) | Out-Null
        [Win32]::BringWindowToTop($hwnd) | Out-Null
        if ($fgThread -ne 0 -and $fgThread -ne $myThread) {
            [Win32]::AttachThreadInput($myThread, $fgThread, $false) | Out-Null
        }
        Start-Sleep -Milliseconds 300
        [Win32]::keybd_event([Win32]::VK_CONTROL, 0, 0, 0)
        [Win32]::keybd_event([Win32]::VK_E, 0, 0, 0)
        [Win32]::keybd_event([Win32]::VK_E, 0, [Win32]::KEYEVENTF_KEYUP, 0)
        [Win32]::keybd_event([Win32]::VK_CONTROL, 0, [Win32]::KEYEVENTF_KEYUP, 0)
        Start-Sleep -Milliseconds 300
    }
    Write-Host "[AutoTrading] Ctrl+E sent to account $accountNumber ($($targets.Count) window(s))"
}

try {
    # ── Initial sign-in ───────────────────────────────────────────
    $auth        = Get-Auth
    $jwt         = $auth.access_token
    $tokenExpiry = (Get-Date).AddSeconds($auth.expires_in - 300)
    $headers     = New-Headers $jwt
    Write-Host "[Auth] Signed in as $Email"

    # ── Initial upload of all existing files ─────────────────────
    if (Test-Path $Folder) {
        $files = Get-ChildItem -Path $Folder -Filter "mt4_report_*.json" -ErrorAction SilentlyContinue
        foreach ($file in $files) {
            try   { Send-Report $file.FullName $headers }
            catch { Write-Warning "[NG] $($file.Name): $($_.Exception.Message)" }
        }
    } else {
        New-Item -ItemType Directory -Path $Folder -Force | Out-Null
    }

    # ── Ctrl+E 送信後のクールダウン（EA が JSON を更新するまで待つ） ──
    $ctrlECooldown     = @{}  # { accountNumber: datetime }
    $prevDesiredStates = @{}  # 前回ループ時の desired 状態
    $prevActualStates  = @{}  # 前回ループ時の actual 状態

    # ── FileSystemWatcher ─────────────────────────────────────────
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path   = $Folder
    $watcher.Filter = "mt4_report_*.json"
    $watcher.NotifyFilter = [IO.NotifyFilters]'LastWrite'
    $watcher.EnableRaisingEvents = $true

    # Debounce: track last upload time per file (avoid double-fire)
    $lastUpload = @{}

    Write-Host "[Watch] Monitoring $Folder ..."

    while ($true) {
        # Token refresh (5 min before expiry)
        if ((Get-Date) -gt $tokenExpiry) {
            try {
                $auth        = Get-Auth
                $jwt         = $auth.access_token
                $tokenExpiry = (Get-Date).AddSeconds($auth.expires_in - 300)
                $headers     = New-Headers $jwt
                Write-Host "[Auth] Token refreshed"
            } catch {
                Write-Warning "[Auth] Token refresh failed: $($_.Exception.Message)"
            }
        }

        # AutoTrading 状態同期（希望値 vs JSON実際値）
        $desired = Get-TradingStates $jwt
        if ($desired -eq $null) {
            Write-Warning "[AutoTrading] Get-TradingStates returned null (API error?)"
        } elseif ($desired.Count -eq 0) {
            Write-Host "[AutoTrading] ea_controls is empty (no rows)"
        } else {
            foreach ($acct in $desired.Keys) {
                $desiredState = $desired[$acct]
                $actualState  = Get-ActualTradingState $acct
                $prevDesired  = $prevDesiredStates[$acct]
                $prevActual   = $prevActualStates[$acct]
                $prevDesiredStates[$acct] = $desiredState
                $prevActualStates[$acct]  = $actualState
                Write-Host "[AutoTrading] Account ${acct}: desired=$desiredState actual=$actualState"
                if ($actualState -eq $null) { continue }
                if ($actualState -eq $desiredState) { continue }

                $lastSent = $ctrlECooldown[$acct]
                if ($lastSent -ne $null -and ((Get-Date) - $lastSent).TotalSeconds -lt 15) {
                    Write-Host "[AutoTrading] Account ${acct}: cooldown, skipping"
                    continue
                }

                if ($prevDesired -eq $null -or $prevDesired -ne $desiredState) {
                    # 初回起動 or Web が desired を変更 → Ctrl+E で MT に適用
                    Write-Host "[AutoTrading] Account ${acct}: applying desired=$desiredState -> Ctrl+E"
                    Send-AutoTradingToggle $acct
                    $ctrlECooldown[$acct] = Get-Date
                } else {
                    # desired 変化なし、actual が変化 → MT 手動変更 → ea_controls を同期
                    Write-Host "[AutoTrading] Account ${acct}: MT manual change -> syncing ea_controls"
                    Set-TradingState $acct $actualState $jwt
                }
            }
        }

        # Wait up to 5 seconds for a file change
        $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]::Changed, 5000)
        if ($change.TimedOut) { continue }

        $name = $change.Name
        $now  = [long]((Get-Date) - [datetime]'1970-01-01').TotalSeconds

        # Debounce: skip if same file uploaded within last 2 seconds
        if ($lastUpload.ContainsKey($name) -and ($now - $lastUpload[$name]) -lt 2) { continue }
        $lastUpload[$name] = $now

        # Wait briefly for the file write to complete
        Start-Sleep -Milliseconds 500

        $filePath = Join-Path $Folder $name
        try   { Send-Report $filePath $headers }
        catch { Write-Warning "[NG] $name : $($_.Exception.Message)" }
    }
} finally {
    if ($watcher) { $watcher.Dispose() }
    $mutex.ReleaseMutex()
}
