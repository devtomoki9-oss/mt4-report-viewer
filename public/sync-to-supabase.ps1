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
$acquired = $false
try {
    $acquired = $mutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
    $acquired = $true  # 前回プロセスが異常終了 → 放棄済みmutexを引き継ぐ
}
if (-not $acquired) {
    exit 0
}

# ── ログ出力（コンソール + ファイル） ────────────────────────────
$LogFile = Join-Path $Folder "sync.log"
function Log($msg) {
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
    Write-Host $line
    Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue
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
    Log "[OK] $filename (account: $accountNumber)"
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
        Log "[AutoTrading] ea_controls loaded: $($states.Count) row(s)"
    }
    catch {
        Log "[AutoTrading] ERROR in Get-TradingStates: $($_.Exception.Message)"
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
        Log "[AutoTrading] Synced ea_controls: account=$accountNumber enabled=$enabled"
    } catch {
        Log "[AutoTrading] Set-TradingState error: $_"
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
        Log "[AutoTrading] No MetaTrader windows found"
        return
    }
    # 口座番号でウィンドウタイトルを検索、見つからなければフォールバック
    $targets = @($allMt | Where-Object { $_.MainWindowTitle -match "\b$accountNumber\b" })
    if ($targets.Count -eq 0) {
        if ($allMt.Count -eq 1) {
            $targets = $allMt
            Log "[AutoTrading] Account ${accountNumber}: title match failed, using only MT window"
        } else {
            Log "[AutoTrading] Cannot identify window for account ${accountNumber} ($($allMt.Count) windows open)"
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
    Log "[AutoTrading] Ctrl+E sent to account $accountNumber ($($targets.Count) window(s))"
}

if (-not (Test-Path $Folder)) {
    New-Item -ItemType Directory -Path $Folder -Force | Out-Null
}

Log "==== sync-to-supabase.ps1 started ===="
Log "Folder: $Folder"
Log "LogFile: $LogFile"

try {
    # ── Initial sign-in ───────────────────────────────────────────
    $auth        = Get-Auth
    $jwt         = $auth.access_token
    $tokenExpiry = (Get-Date).AddSeconds($auth.expires_in - 300)
    $headers     = New-Headers $jwt
    Log "[Auth] Signed in as $Email"

    # ── Initial upload of all existing files ─────────────────────
    $files = Get-ChildItem -Path $Folder -Filter "mt4_report_*.json" -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        try {
            Send-Report $file.FullName $headers
        }
        catch {
            Log "[NG] $($file.Name): $($_.Exception.Message)"
        }
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

    Log "[Watch] Monitoring $Folder ..."

    while ($true) {
        # Token refresh (5 min before expiry)
        if ((Get-Date) -gt $tokenExpiry) {
            try {
                $auth        = Get-Auth
                $jwt         = $auth.access_token
                $tokenExpiry = (Get-Date).AddSeconds($auth.expires_in - 300)
                $headers     = New-Headers $jwt
                Log "[Auth] Token refreshed"
            } catch {
                Log "[Auth] Token refresh failed: $($_.Exception.Message)"
            }
        }

        # AutoTrading 状態同期（希望値 vs JSON実際値）
        $desired = @{}
        try {
            $eaResp = Invoke-RestMethod "$Url/rest/v1/ea_controls?select=account_number,enabled" `
                -Method Get `
                -Headers @{ "apikey" = $AnonKey; "Authorization" = "Bearer $jwt" } `
                -ErrorAction Stop
            # @() は null を 1 要素配列にするため型チェックで安全に配列化
            $eaList = if ($eaResp -is [System.Array]) { $eaResp }
                      elseif ($null -ne $eaResp)       { , @($eaResp) }
                      else                             { @() }
            foreach ($row in $eaList) {
                if ($null -eq $row) { continue }
                $n = "$($row.account_number)"
                if ($n) { $desired[$n] = [bool]$row.enabled }
            }
            Log "[AutoTrading] ea_controls loaded: $($desired.Count) row(s)"
        } catch {
            Log "[AutoTrading] ERROR line=$($_.InvocationInfo.ScriptLineNumber): $($_.Exception.Message)"
        }
        if ($desired.Count -gt 0) {
            foreach ($acct in $desired.Keys) {
                $desiredState = $desired[$acct]
                $actualState  = Get-ActualTradingState $acct
                $prevDesired  = $prevDesiredStates[$acct]
                $prevActual   = $prevActualStates[$acct]
                $prevDesiredStates[$acct] = $desiredState
                $prevActualStates[$acct]  = $actualState

                Log "[AutoTrading] Account ${acct}: desired=$desiredState actual=$actualState"
                if ($null -eq $actualState) { continue }
                if ($actualState -eq $desiredState) { continue }

                $lastSent = $ctrlECooldown[$acct]
                if ($null -ne $lastSent -and ((Get-Date) - $lastSent).TotalSeconds -lt 15) {
                    Log "[AutoTrading] Account ${acct}: cooldown, skipping"
                    continue
                }

                $desiredChanged = ($null -ne $prevDesired -and $prevDesired -ne $desiredState)
                $actualChanged  = ($null -ne $prevActual  -and $prevActual  -ne $actualState)

                if ($null -eq $prevDesired) {
                    # 初回起動: desired を MT に適用
                    Log "[AutoTrading] Account ${acct}: initial -> Ctrl+E (desired=$desiredState)"
                    Send-AutoTradingToggle $acct
                    $ctrlECooldown[$acct] = Get-Date
                } elseif ($desiredChanged -and -not $actualChanged) {
                    # Web が desired を変更 → Ctrl+E で MT に適用
                    Log "[AutoTrading] Account ${acct}: web change -> Ctrl+E (desired=$desiredState)"
                    Send-AutoTradingToggle $acct
                    $ctrlECooldown[$acct] = Get-Date
                } elseif ($actualChanged -and -not $desiredChanged) {
                    # MT が手動変更 → ea_controls を同期
                    Log "[AutoTrading] Account ${acct}: MT manual change -> syncing DB (actual=$actualState)"
                    Set-TradingState $acct $actualState $jwt
                } else {
                    # 持続的な不一致 (Ctrl+E 未応答) → 再送
                    Log "[AutoTrading] Account ${acct}: persistent mismatch, retrying Ctrl+E"
                    Send-AutoTradingToggle $acct
                    $ctrlECooldown[$acct] = Get-Date
                }
            }
        }

        # Wait up to 5 seconds for a file change
        $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]::Changed, 2000)
        if ($change.TimedOut) { continue }

        $name = $change.Name
        $now  = [long]((Get-Date) - [datetime]'1970-01-01').TotalSeconds

        # Debounce: skip if same file uploaded within last 2 seconds
        if ($lastUpload.ContainsKey($name) -and ($now - $lastUpload[$name]) -lt 2) { continue }
        $lastUpload[$name] = $now

        # Wait briefly for the file write to complete
        Start-Sleep -Milliseconds 500

        $filePath = Join-Path $Folder $name
        try {
            Send-Report $filePath $headers
        }
        catch {
            Log "[NG] $name : $($_.Exception.Message)"
        }
    }
} catch {
    Log "[FATAL] $_"
} finally {
    if ($watcher) { $watcher.Dispose() }
    $mutex.ReleaseMutex()
    Log "==== sync-to-supabase.ps1 stopped ===="
}
