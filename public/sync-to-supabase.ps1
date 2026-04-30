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
function Get-TradingEnabled($headers) {
    try {
        $getHeaders = @{ "apikey" = $AnonKey; "Authorization" = $headers["Authorization"] }
        $data = Invoke-RestMethod "$Url/rest/v1/ea_controls?account_number=eq.0&select=enabled&limit=1" `
            -Method Get -Headers $getHeaders -ErrorAction Stop
        if ($data.Count -gt 0) { return [bool]$data[0].enabled }
        return $null
    } catch {
        Write-Warning "[AutoTrading] Failed to read state: $($_.Exception.Message)"
        return $null
    }
}

function Send-AutoTradingToggle {
    $mtProcesses = @(Get-Process | Where-Object {
        $_.MainWindowHandle -ne [IntPtr]::Zero -and
        ($_.ProcessName -match '^terminal' -or $_.MainWindowTitle -match 'MetaTrader')
    })
    if ($mtProcesses.Count -eq 0) {
        Write-Warning "[AutoTrading] No MetaTrader windows found"
        return
    }
    $prev = [Win32]::GetForegroundWindow()
    foreach ($proc in $mtProcesses) {
        $hwnd = $proc.MainWindowHandle
        [Win32]::ShowWindow($hwnd, 1)  | Out-Null
        [Win32]::SetForegroundWindow($hwnd) | Out-Null
        Start-Sleep -Milliseconds 150
        [Win32]::keybd_event([Win32]::VK_CONTROL, 0, 0, 0)
        [Win32]::keybd_event([Win32]::VK_E, 0, 0, 0)
        [Win32]::keybd_event([Win32]::VK_E, 0, [Win32]::KEYEVENTF_KEYUP, 0)
        [Win32]::keybd_event([Win32]::VK_CONTROL, 0, [Win32]::KEYEVENTF_KEYUP, 0)
        Start-Sleep -Milliseconds 150
    }
    if ($prev -ne [IntPtr]::Zero) { [Win32]::SetForegroundWindow($prev) | Out-Null }
    Write-Host "[AutoTrading] Ctrl+E sent to $($mtProcesses.Count) MetaTrader window(s)"
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

    # ── Read initial AutoTrading state (track without applying) ──
    $lastTradingEnabled = Get-TradingEnabled $headers
    Write-Host "[AutoTrading] Initial state from Supabase: $lastTradingEnabled"

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

        # AutoTrading state poll (every ~5s via WaitForChanged timeout)
        $desired = Get-TradingEnabled $headers
        if ($desired -ne $null -and $desired -ne $lastTradingEnabled) {
            Write-Host "[AutoTrading] State changed: $lastTradingEnabled -> $desired"
            Send-AutoTradingToggle
            $lastTradingEnabled = $desired
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
