# sync-to-supabase.ps1 v22
# Full fault-tolerant edition - MT4/MT5 -> Supabase sync + AutoTrading control
#
# Usage A (direct):
#   .\sync-to-supabase.ps1 -Url "https://xxxx.supabase.co" -AnonKey "eyJ..." -Email "you@example.com" -Password "pass"
#
# Usage B (via run-sync.vbs):
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

# -- Single-instance guard ----------------------------------------------------
$mutex    = New-Object System.Threading.Mutex($false, "Global\MTExportSyncMutex")
$acquired = $false
try    { $acquired = $mutex.WaitOne(0) }
catch  [System.Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) { exit 0 }

# -- Constants ----------------------------------------------------------------
$LOOP_WAIT_MS              = 2000
$CTRL_E_MAX_RETRY          = 3
$CTRL_E_PENDING_TIMEOUT_SEC = 8  # if MT4 does not update JSON within this time, retry Ctrl+E
$FILE_LOCK_RETRY           = 3
$FILE_STABILITY_MS         = 200
$SCAN_INTERVAL_SEC         = 5
$TOKEN_REFRESH_SEC         = 300

# -- Logging ------------------------------------------------------------------
if (-not (Test-Path $Folder)) {
    New-Item -ItemType Directory -Path $Folder -Force | Out-Null
}
$LogFile = Join-Path $Folder "sync.log"

function Log {
    param([string]$msg, [string]$level = "INFO")
    $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [$level] $msg"
    Write-Host $line
    try { Add-Content -Path $LogFile -Value $line -Encoding UTF8 -ErrorAction SilentlyContinue } catch {}
}

# -- Win32 API for Ctrl+E -----------------------------------------------------
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
"@ -ErrorAction SilentlyContinue

# -- Auth ---------------------------------------------------------------------
$script:jwt         = $null
$script:tokenExpiry = [datetime]::MinValue

function Invoke-Auth {
    param([int]$maxRetry = 3)
    for ($i = 0; $i -lt $maxRetry; $i++) {
        try {
            $body = @{ email = $Email; password = $Password } | ConvertTo-Json
            $res = Invoke-RestMethod "$Url/auth/v1/token?grant_type=password" `
                -Method Post `
                -Headers @{ "apikey" = $AnonKey; "Content-Type" = "application/json" } `
                -Body $body -ErrorAction Stop
            $script:jwt         = $res.access_token
            $script:tokenExpiry = (Get-Date).AddSeconds($res.expires_in - $TOKEN_REFRESH_SEC)
            Log "[Auth] Signed in OK (expires in $($res.expires_in)s)"
            return $true
        } catch {
            $wait = [math]::Pow(2, $i) * 5
            $errBody = ''
            try {
                $resp = $_.Exception.Response
                if ($resp) {
                    $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
                    $errBody = $reader.ReadToEnd()
                    $reader.Close()
                }
            } catch {}
            Log "[Auth] Attempt $($i+1)/$maxRetry failed: $($_.Exception.Message) | $errBody. Retry in ${wait}s" -level WARN
            if ($i -lt ($maxRetry - 1)) { Start-Sleep -Seconds ([int]$wait) }
        }
    }
    Log "[Auth] All retries exhausted - continuing with existing token" -level ERROR
    return $false
}

function Ensure-ValidToken {
    if ($null -eq $script:jwt -or (Get-Date) -gt $script:tokenExpiry) {
        Invoke-Auth | Out-Null
    }
}

function New-Headers {
    return @{
        "apikey"        = $AnonKey
        "Authorization" = "Bearer $script:jwt"
        "Content-Type"  = "application/json"
        "Prefer"        = "resolution=merge-duplicates"
    }
}

# RPC-only headers (no Prefer header to avoid PostgREST 409 conflict)
function New-RpcHeaders {
    return @{
        "apikey"        = $AnonKey
        "Authorization" = "Bearer $script:jwt"
        "Content-Type"  = "application/json"
    }
}

# -- Safe file read (size stability check + lock retry) -----------------------
function Read-FileWithRetry {
    param([string]$path)
    if (-not (Test-Path $path)) { return $null }
    try {
        $size1 = (Get-Item $path -ErrorAction Stop).Length
        Start-Sleep -Milliseconds $FILE_STABILITY_MS
        $size2 = (Get-Item $path -ErrorAction Stop).Length
        if ($size1 -ne $size2) {
            Log "[File] $([IO.Path]::GetFileName($path)): size unstable, skipping" -level WARN
            return $null
        }
    } catch { return $null }
    for ($i = 0; $i -lt $FILE_LOCK_RETRY; $i++) {
        try { return [IO.File]::ReadAllText($path, [Text.Encoding]::UTF8) }
        catch { if ($i -lt ($FILE_LOCK_RETRY - 1)) { Start-Sleep -Milliseconds 300 } }
    }
    Log "[File] $([IO.Path]::GetFileName($path)): locked after $FILE_LOCK_RETRY retries" -level WARN
    return $null
}

# -- Get autoTrading actual state + JSON mod time from MT JSON ----------------
function Get-ActualTradingState {
    param([string]$acct)
    $path    = Join-Path $Folder "mt4_report_$acct.json"
    $modTime = [long]0
    try {
        if (Test-Path $path) { $modTime = (Get-Item $path -ErrorAction Stop).LastWriteTime.Ticks }
    } catch {}
    $text = Read-FileWithRetry $path
    if ($null -eq $text) { return @{ State = $null; ModTime = $modTime } }
    try {
        if ($text -match '"autoTrading"\s*:\s*(true|false)') {
            return @{ State = ($Matches[1] -eq 'true'); ModTime = $modTime }
        }
    } catch {}
    return @{ State = $null; ModTime = $modTime }
}

# -- Load desired states from Supabase ----------------------------------------
function Get-DesiredStates {
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("apikey",        $AnonKey)
        $wc.Headers.Add("Authorization", "Bearer $script:jwt")
        $wc.Headers.Add("Accept",        "application/json")
        $rows = $wc.DownloadString("$Url/rest/v1/ea_controls?select=account_number,enabled") | ConvertFrom-Json
        $result = @{}
        foreach ($row in $rows) {
            if ($null -eq $row) { continue }
            $n = [string]($row.account_number)
            if ($n) { $result[$n] = [bool]($row.enabled) }
        }
        Log "[DB] ea_controls loaded: $($result.Count) row(s)"
        return $result
    } catch {
        Log "[DB] Get-DesiredStates failed: $($_.Exception.Message)" -level WARN
        return $null
    }
}

# -- Sync MT manual change back to DB -----------------------------------------
function Sync-ActualToDb {
    param([string]$acct, [bool]$actualState)
    try {
        $body = @{
            p_account_number = [long]$acct
            p_enabled        = $actualState
        } | ConvertTo-Json -Compress
        Invoke-RestMethod "$Url/rest/v1/rpc/upsert_ea_control" `
            -Method Post -Headers (New-RpcHeaders) -Body $body -ErrorAction Stop | Out-Null
        Log "[DB] account=$acct synced actual->desired ($actualState)"
    } catch {
        Log "[DB] Sync-ActualToDb failed account=$acct : $($_.Exception.Message)" -level WARN
    }
}

# -- Upload report file to Supabase -------------------------------------------
function Send-Report {
    param([string]$filePath)
    $text = Read-FileWithRetry $filePath
    if ($null -eq $text) { return }
    $parsed  = $null
    try { $parsed = $text | ConvertFrom-Json } catch { return }
    $acctNum = [long]$parsed.account
    $fname   = [IO.Path]::GetFileName($filePath)
    $body = @{
        p_account_number = $acctNum
        p_filename       = $fname
        p_data           = $parsed
    } | ConvertTo-Json -Depth 20 -Compress

    for ($attempt = 1; $attempt -le 2; $attempt++) {
        try {
            Invoke-RestMethod "$Url/rest/v1/rpc/upsert_report" `
                -Method Post -Headers (New-RpcHeaders) -Body $body -ErrorAction Stop | Out-Null
            Log "[Upload] OK: $fname (account: $acctNum)"
            return
        } catch {
            $statusCode = 0
            try { $statusCode = [int]$_.Exception.Response.StatusCode } catch {}
            if (($statusCode -eq 401 -or $statusCode -eq 403) -and $attempt -eq 1) {
                Log "[Upload] Auth error ($statusCode), forcing re-auth and retry..." -level WARN
                $script:jwt = $null
                $script:tokenExpiry = [datetime]::MinValue
                Ensure-ValidToken
                continue
            }
            $errBody = ''
            try {
                $stream = $_.Exception.Response.GetResponseStream()
                $reader = New-Object IO.StreamReader($stream)
                $errBody = $reader.ReadToEnd()
                $reader.Close()
            } catch {}
            Log "[Upload] FAILED: ${fname}: $($_.Exception.Message) | $errBody" -level WARN
        }
    }
}

# -- Send Ctrl+E to MetaTrader window -----------------------------------------
function Send-CtrlE {
    param([string]$acct)
    try {
        $allMt = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
            $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.ProcessName -match '^terminal'
        })
        if ($allMt.Count -eq 0) {
            Log "[CtrlE] account=${acct}: No MetaTrader window found" -level WARN
            return $false
        }
        $targets = @($allMt | Where-Object { $_.MainWindowTitle -match "\b$acct\b" })
        if ($targets.Count -eq 0) {
            if ($allMt.Count -eq 1) {
                $targets = $allMt
                Log "[CtrlE] account=${acct}: title match failed, using only MT window"
            } else {
                Log "[CtrlE] account=${acct}: cannot identify window ($($allMt.Count) windows open)" -level WARN
                return $false
            }
        }
        $fgHwnd   = [Win32]::GetForegroundWindow()
        $dummy    = [uint32]0
        $fgThread = if ($fgHwnd -ne [IntPtr]::Zero) { [Win32]::GetWindowThreadProcessId($fgHwnd, [ref]$dummy) } else { 0 }
        $myThread = [Win32]::GetCurrentThreadId()
        foreach ($proc in $targets) {
            $hwnd = $proc.MainWindowHandle
            try {
                if ($fgThread -ne 0 -and $fgThread -ne $myThread) {
                    [Win32]::AttachThreadInput($myThread, $fgThread, $true) | Out-Null
                }
                [Win32]::ShowWindow($hwnd, 9) | Out-Null
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
            } catch {
                Log "[CtrlE] account=${acct}: keybd_event error: $($_.Exception.Message)" -level WARN
            }
        }
        Log "[CtrlE] account=${acct}: sent to $($targets.Count) window(s)"
        return $true
    } catch {
        Log "[CtrlE] account=${acct}: unexpected error: $($_.Exception.Message)" -level ERROR
        return $false
    }
}

# -- State machine per account ------------------------------------------------
# $accountStates[$acct] = @{
#   prevDesired = $null|bool
#   prevActual  = $null|bool
#   lastCmdTime = $null|datetime
#   retryCount  = int
# }
$accountStates = @{}

function Get-AccountState {
    param([string]$acct)
    if (-not $accountStates.ContainsKey($acct)) {
        $accountStates[$acct] = @{
            prevDesired       = $null
            prevActual        = $null
            lastCmdTime       = $null
            retryCount        = 0
            cmdPending        = $false
            jsonModAtCmd      = $null
            stableConfirmedAt = $null
        }
    }
    return $accountStates[$acct]
}

function Invoke-AutoTradingSync {
    param([hashtable]$desiredMap)
    $keys = @($desiredMap.Keys)
    foreach ($acct in $keys) {
        try {
            $desired = $desiredMap[$acct]
            $info    = Get-ActualTradingState $acct
            $actual  = $info.State
            $modTime = $info.ModTime
            $st      = Get-AccountState $acct

            $prevDesired = $st.prevDesired
            $prevActual  = $st.prevActual

            Log "[State] account=$acct desired=$desired actual=$actual modTime=$modTime jsonModAtCmd=$($st.jsonModAtCmd) retry=$($st.retryCount)"

            if ($null -eq $actual) {
                $st.prevDesired = $desired
                continue
            }

            $desiredChanged = ($null -ne $prevDesired -and $prevDesired -ne $desired)
            $actualChanged  = ($null -ne $prevActual  -and $prevActual  -ne $actual)

            # -- Stable: actual matches desired --------------------------------
            if ($actual -eq $desired) {
                if ($st.retryCount -gt 0) {
                    Log "[State] account=${acct}: CONFIRMED (retry=$($st.retryCount) succeeded)"
                }
                $st.retryCount        = 0
                $st.cmdPending        = $false
                $st.jsonModAtCmd      = $null
                $st.stableConfirmedAt = Get-Date
                $st.prevDesired       = $desired
                $st.prevActual        = $actual
                continue
            }

            # -- MT4 manual change detection -----------------------------------
            # actualChanged + desired unchanged + no pending command = manual MT4 change
            if ($actualChanged -and -not $desiredChanged -and $null -ne $prevDesired) {
                $fromOurCmd    = $null -ne $st.jsonModAtCmd -and $modTime -gt $st.jsonModAtCmd
                # Within 120s of stable confirmation, treat revert as a retry target (not manual)
                $recentlyStable = $null -ne $st.stableConfirmedAt -and ((Get-Date) - $st.stableConfirmedAt).TotalSeconds -lt 120
                if (-not $fromOurCmd -and -not $recentlyStable) {
                    Log "[State] account=${acct}: manual MT4 change detected (actual=$actual) -> DB sync"
                    Sync-ActualToDb $acct $actual
                    $st.retryCount        = 0
                    $st.cmdPending        = $false
                    $st.lastCmdTime       = $null
                    $st.jsonModAtCmd      = $null
                    $st.stableConfirmedAt = $null
                    $st.prevDesired       = $desired
                    $st.prevActual        = $actual
                    continue
                }
                if ($recentlyStable) {
                    Log "[State] account=${acct}: actual reverted within stable window, will retry Ctrl+E"
                }
                # JSON updated after our Ctrl+E but state is still wrong - fall through to retry
                if (-not $recentlyStable) {
                    Log "[State] account=${acct}: actual changed after our Ctrl+E, state still wrong, will retry"
                }
                $st.cmdPending = $false
            }

            # -- Wait for MT4 to process our Ctrl+E (JSON not yet updated) ----
            if ($st.cmdPending) {
                $jsonUpdated = $null -ne $st.jsonModAtCmd -and $modTime -gt $st.jsonModAtCmd
                if (-not $jsonUpdated) {
                    $elapsed = if ($st.lastCmdTime) { [int]((Get-Date) - $st.lastCmdTime).TotalSeconds } else { 0 }
                    if ($elapsed -lt $CTRL_E_PENDING_TIMEOUT_SEC) {
                        Log "[State] account=${acct}: waiting for JSON update (${elapsed}s)"
                        $st.prevDesired = $desired
                        $st.prevActual  = $actual
                        continue
                    }
                    # EA did not write JSON within timeout - clear pending and retry Ctrl+E
                    Log "[State] account=${acct}: JSON not updated after ${elapsed}s, retrying Ctrl+E" -level WARN
                    $st.cmdPending = $false
                }
            }

            # -- Max retry guard -----------------------------------------------
            if ($st.retryCount -ge $CTRL_E_MAX_RETRY) {
                Log "[State] account=${acct}: max retries ($CTRL_E_MAX_RETRY) reached, resetting" -level WARN
                $st.retryCount   = 0
                $st.cmdPending   = $false
                $st.lastCmdTime  = $null
                $st.jsonModAtCmd = $null
                $st.prevDesired  = $desired
                $st.prevActual   = $actual
                continue
            }

            # -- Send Ctrl+E ---------------------------------------------------
            if ($null -eq $prevDesired) {
                $reason = 'initial'
            } elseif ($desiredChanged -and -not $actualChanged) {
                $reason = 'web_change'
            } else {
                $reason = 'retry'
            }

            Log "[State] account=${acct}: reason=$reason -> Ctrl+E (desired=$desired retry=$($st.retryCount+1)/$CTRL_E_MAX_RETRY)"
            $sent = Send-CtrlE $acct
            if ($sent) {
                $st.retryCount++
                $st.lastCmdTime  = Get-Date
                $st.cmdPending   = $true
                $st.jsonModAtCmd = $modTime   # record JSON mod time at command send
            }
            $st.prevDesired = $desired
            $st.prevActual  = $actual

        } catch {
            Log "[State] account=${acct}: UNHANDLED: $($_.Exception.Message)" -level ERROR
        }
    }
}

# -- Periodic scan (FSW fallback) ---------------------------------------------
$lastScanTime = [datetime]::MinValue
$lastUpload   = @{}

function Invoke-FileScan {
    try {
        $files = Get-ChildItem -Path $Folder -Filter "mt4_report_*.json" -ErrorAction SilentlyContinue
        if ($null -eq $files) { return }
        foreach ($file in $files) {
            $n     = $file.Name
            $ticks = $file.LastWriteTime.Ticks
            if ($lastUpload.ContainsKey($n) -and $lastUpload[$n] -eq $ticks) { continue }
            $lastUpload[$n] = $ticks
            Send-Report $file.FullName
        }
    } catch {
        Log "[Scan] periodic scan error: $($_.Exception.Message)" -level WARN
    }
}

# -- Main ---------------------------------------------------------------------
Log "==== sync-to-supabase.ps1 v22 started ===="
Log "Folder: $Folder"

Invoke-Auth | Out-Null
Invoke-FileScan

$watcher = $null
try {
    $watcher = New-Object System.IO.FileSystemWatcher
    $watcher.Path                = $Folder
    $watcher.Filter              = "mt4_report_*.json"
    $watcher.NotifyFilter        = [IO.NotifyFilters]'LastWrite'
    $watcher.EnableRaisingEvents = $true
    Log "[Watch] FileSystemWatcher started"
} catch {
    Log "[Watch] FileSystemWatcher init failed: $($_.Exception.Message) - scan-only mode" -level WARN
}

try {
    while ($true) {
        try {
            Ensure-ValidToken

            $desiredMap = Get-DesiredStates
            if ($null -ne $desiredMap -and $desiredMap.Count -gt 0) {
                Invoke-AutoTradingSync $desiredMap
            }

            if ($null -ne $watcher) {
                try {
                    $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]::Changed, $LOOP_WAIT_MS)
                    if (-not $change.TimedOut -and $change.Name) {
                        Start-Sleep -Milliseconds 500
                        $fswPath = Join-Path $Folder $change.Name
                        Send-Report $fswPath
                        try { $lastUpload[$change.Name] = (Get-Item $fswPath -ErrorAction Stop).LastWriteTime.Ticks } catch {}
                    }
                } catch {
                    Log "[Watch] WaitForChanged error: $($_.Exception.Message)" -level WARN
                    Start-Sleep -Milliseconds $LOOP_WAIT_MS
                }
            } else {
                Start-Sleep -Milliseconds $LOOP_WAIT_MS
            }

            if (((Get-Date) - $lastScanTime).TotalSeconds -ge $SCAN_INTERVAL_SEC) {
                $lastScanTime = Get-Date
                Invoke-FileScan
            }

        } catch {
            Log "[Loop] Unhandled: $($_.Exception.Message) (line $($_.InvocationInfo.ScriptLineNumber))" -level ERROR
            Start-Sleep -Milliseconds 1000
        }
    }
} finally {
    if ($null -ne $watcher) { try { $watcher.Dispose() } catch {} }
    try { $mutex.ReleaseMutex() } catch {}
    Log "==== sync-to-supabase.ps1 v22 stopped ===="
}
