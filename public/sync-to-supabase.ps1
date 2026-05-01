# sync-to-supabase.ps1 v14
# 完全耐障害版 - MT4/MT5 → Supabase 同期 + AutoTrading 制御
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

# ── Single-instance guard ─────────────────────────────────────────
$mutex    = New-Object System.Threading.Mutex($false, "Global\MTExportSyncMutex")
$acquired = $false
try    { $acquired = $mutex.WaitOne(0) }
catch  [System.Threading.AbandonedMutexException] { $acquired = $true }
if (-not $acquired) { exit 0 }

# ── 定数 ─────────────────────────────────────────────────────────
$LOOP_WAIT_MS        = 2000   # WaitForChanged タイムアウト
$CTRL_E_COOLDOWN_SEC = 20     # Ctrl+E 送信後の最小待機秒数
$CTRL_E_MAX_RETRY    = 3      # 最大リトライ回数（超えたらリセット）
$FILE_LOCK_RETRY     = 3      # ファイル読み込みリトライ回数
$FILE_STABILITY_MS   = 200    # ファイルサイズ安定確認待機
$SCAN_INTERVAL_SEC   = 5      # 定期スキャン間隔（FSW補完）
$TOKEN_REFRESH_SEC   = 300    # トークン有効期限の何秒前に更新するか

# ── ログ ──────────────────────────────────────────────────────────
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

# ── Win32 API (Ctrl+E 送信用) ─────────────────────────────────────
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

# ── Auth ──────────────────────────────────────────────────────────
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
            Log "[Auth] Attempt $($i+1)/$maxRetry failed: $($_.Exception.Message). Retry in ${wait}s" -level WARN
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

# ── 安全なファイル読み込み ────────────────────────────────────────
# ・サイズ安定確認（書き込み途中を除外）
# ・ロック時リトライ
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

# ── MT JSON から autoTrading 実際値を取得 ─────────────────────────
function Get-ActualTradingState {
    param([string]$acct)
    $text = Read-FileWithRetry (Join-Path $Folder "mt4_report_$acct.json")
    if ($null -eq $text) { return $null }
    try {
        if ($text -match '"autoTrading"\s*:\s*(true|false)') { return ($Matches[1] -eq 'true') }
    } catch {}
    return $null
}

# ── Supabase から desired 状態を取得 ─────────────────────────────
function Get-DesiredStates {
    try {
        $wc = New-Object System.Net.WebClient
        $wc.Headers.Add("apikey",        $AnonKey)
        $wc.Headers.Add("Authorization", "Bearer $script:jwt")
        $wc.Headers.Add("Accept",        "application/json")
        $rows = $wc.DownloadString("$Url/rest/v1/ea_controls?select=account_number,desired_enabled") | ConvertFrom-Json
        $result = @{}
        foreach ($row in $rows) {
            if ($null -eq $row) { continue }
            $n = [string]($row.account_number)
            if ($n) { $result[$n] = [bool]($row.desired_enabled) }
        }
        Log "[DB] ea_controls loaded: $($result.Count) row(s)"
        return $result
    } catch {
        Log "[DB] Get-DesiredStates failed: $($_.Exception.Message)" -level WARN
        return $null
    }
}

# ── MT 手動変更を DB へ反映 ───────────────────────────────────────
function Sync-ActualToDb {
    param([string]$acct, [bool]$actualState)
    try {
        $body = @{
            p_account_number       = [long]$acct
            p_desired_enabled      = $actualState
            p_last_applied_enabled = $actualState
        } | ConvertTo-Json -Compress
        Invoke-RestMethod "$Url/rest/v1/rpc/upsert_ea_control" `
            -Method Post -Headers (New-Headers) -Body $body -ErrorAction Stop | Out-Null
        Log "[DB] account=$acct synced actual→desired ($actualState)"
    } catch {
        Log "[DB] Sync-ActualToDb failed account=$acct : $($_.Exception.Message)" -level WARN
    }
}

# ── レポートを Supabase にアップロード ───────────────────────────
function Send-Report {
    param([string]$filePath)
    $text = Read-FileWithRetry $filePath
    if ($null -eq $text) { return }
    try {
        $parsed  = $text | ConvertFrom-Json
        $acctNum = [long]$parsed.account
        $fname   = [IO.Path]::GetFileName($filePath)
        $body = @{
            p_account_number = $acctNum
            p_filename       = $fname
            p_data           = $parsed
        } | ConvertTo-Json -Depth 20 -Compress
        Invoke-RestMethod "$Url/rest/v1/rpc/upsert_report" `
            -Method Post -Headers (New-Headers) -Body $body -ErrorAction Stop | Out-Null
        Log "[Upload] OK: $fname (account: $acctNum)"
    } catch {
        Log "[Upload] FAILED: $([IO.Path]::GetFileName($filePath)): $($_.Exception.Message)" -level WARN
    }
}

# ── Ctrl+E を MT ウィンドウへ送信 ────────────────────────────────
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

# ── 状態機械 per account ─────────────────────────────────────────
# $accountStates[$acct] = @{
#   prevDesired = $null|bool   前回ループの desired
#   prevActual  = $null|bool   前回ループの actual
#   lastCmdTime = $null|datetime  最後に Ctrl+E を送った時刻
#   retryCount  = int           現在の連続リトライ数
# }
$accountStates = @{}

function Get-AccountState {
    param([string]$acct)
    if (-not $accountStates.ContainsKey($acct)) {
        $accountStates[$acct] = @{
            prevDesired = $null
            prevActual  = $null
            lastCmdTime = $null
            retryCount  = 0
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
            $actual  = Get-ActualTradingState $acct
            $st      = Get-AccountState $acct

            $prevDesired = $st.prevDesired
            $prevActual  = $st.prevActual

            Log "[State] account=$acct desired=$desired actual=$actual prevDesired=$prevDesired prevActual=$prevActual retry=$($st.retryCount)"

            # actual 不明（JSON未存在または読み込み失敗）→ skip
            if ($null -eq $actual) {
                $st.prevDesired = $desired
                continue
            }

            $desiredChanged = ($null -ne $prevDesired -and $prevDesired -ne $desired)
            $actualChanged  = ($null -ne $prevActual  -and $prevActual  -ne $actual)

            # ── 同期済み ──────────────────────────────────────────
            if ($actual -eq $desired) {
                if ($st.retryCount -gt 0) {
                    Log "[State] account=${acct}: CONFIRMED (retry=$($st.retryCount) succeeded)"
                }
                $st.retryCount  = 0
                $st.lastCmdTime = $null
                $st.prevDesired = $desired
                $st.prevActual  = $actual
                continue
            }

            # ── 不一致 ────────────────────────────────────────────

            # MT 手動変更（desired は変わっておらず actual だけ変わった）→ DB 更新
            if ($actualChanged -and -not $desiredChanged -and $null -ne $prevDesired) {
                Log "[State] account=${acct}: reason=manual_change actual=$actual -> DB sync"
                Sync-ActualToDb $acct $actual
                $st.retryCount  = 0
                $st.lastCmdTime = $null
                $st.prevDesired = $desired
                $st.prevActual  = $actual
                continue
            }

            # クールダウン中
            if ($null -ne $st.lastCmdTime) {
                $elapsed = ((Get-Date) - $st.lastCmdTime).TotalSeconds
                if ($elapsed -lt $CTRL_E_COOLDOWN_SEC) {
                    Log "[State] account=${acct}: cooldown ${elapsed}s / ${CTRL_E_COOLDOWN_SEC}s"
                    $st.prevDesired = $desired
                    $st.prevActual  = $actual
                    continue
                }
            }

            # リトライ上限到達 → リセットして次サイクルへ
            if ($st.retryCount -ge $CTRL_E_MAX_RETRY) {
                Log "[State] account=${acct}: max retries ($CTRL_E_MAX_RETRY) reached, resetting" -level WARN
                $st.retryCount  = 0
                $st.lastCmdTime = $null
                $st.prevDesired = $desired
                $st.prevActual  = $actual
                continue
            }

            # 実行理由
            $reason = if ($null -eq $prevDesired) { 'initial' }
                      elseif ($desiredChanged -and -not $actualChanged) { 'web_change' }
                      else { 'retry' }

            Log "[State] account=${acct}: reason=$reason -> Ctrl+E (desired=$desired retry=$($st.retryCount+1)/$CTRL_E_MAX_RETRY)"
            $sent = Send-CtrlE $acct
            if ($sent) {
                $st.retryCount++
                $st.lastCmdTime = Get-Date
            }
            $st.prevDesired = $desired
            $st.prevActual  = $actual

        } catch {
            Log "[State] account=${acct}: UNHANDLED: $($_.Exception.Message)" -level ERROR
        }
    }
}

# ── 定期スキャン（FSW 取りこぼし補完） ───────────────────────────
$lastScanTime = [datetime]::MinValue
$lastUpload   = @{}  # name → LastWriteTime.Ticks

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

# ── メイン ────────────────────────────────────────────────────────
Log "==== sync-to-supabase.ps1 v14 started ===="
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
            # トークン有効性確保
            Ensure-ValidToken

            # AutoTrading 状態機械
            $desiredMap = Get-DesiredStates
            if ($null -ne $desiredMap -and $desiredMap.Count -gt 0) {
                Invoke-AutoTradingSync $desiredMap
            }

            # FileSystemWatcher（リアルタイム検知）
            if ($null -ne $watcher) {
                try {
                    $change = $watcher.WaitForChanged([IO.WatcherChangeTypes]::Changed, $LOOP_WAIT_MS)
                    if (-not $change.TimedOut -and $change.Name) {
                        Start-Sleep -Milliseconds 500
                        Send-Report (Join-Path $Folder $change.Name)
                    }
                } catch {
                    Log "[Watch] WaitForChanged error: $($_.Exception.Message)" -level WARN
                    Start-Sleep -Milliseconds $LOOP_WAIT_MS
                }
            } else {
                Start-Sleep -Milliseconds $LOOP_WAIT_MS
            }

            # 定期スキャン（FSW 補完）
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
    Log "==== sync-to-supabase.ps1 v14 stopped ===="
}
