# MT4/MT5 Export JSON を Supabase へ同期するスクリプト
#
# 【使い方 A: 直接実行】
#   .\sync-to-supabase.ps1 -Url "https://xxxx.supabase.co" -AnonKey "eyJ..." -Email "you@example.com" -Password "yourpass"
#
# 【使い方 B: 設定ファイル経由（タスクスケジューラ推奨）】
#   1. sync-config.json を同じフォルダに作成して接続情報を記入
#   2. run-sync.vbs を同じフォルダに置いてタスクスケジューラに登録
#   schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\Downloads\run-sync.vbs"
#
# 【出力先フォルダ】
#   %USERPROFILE%\MTExport\mt4_report_*.json

param(
    [string]$Url      = '',
    [string]$AnonKey  = '',
    [string]$Email    = '',
    [string]$Password = '',
    [string]$Folder   = "$env:USERPROFILE\MTExport"
)

# ── 0. パラメータ未指定なら sync-config.json から読み込む ────
if (-not $Url -or -not $AnonKey -or -not $Email -or -not $Password) {
    $scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
    $configPath = Join-Path $scriptDir "sync-config.json"
    if (Test-Path $configPath) {
        $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
        if (-not $Url)      { $Url      = $cfg.url }
        if (-not $AnonKey)  { $AnonKey  = $cfg.anonKey }
        if (-not $Email)    { $Email    = $cfg.email }
        if (-not $Password) { $Password = $cfg.password }
    }
}

if (-not $Url -or -not $AnonKey -or -not $Email -or -not $Password) {
    Write-Error "接続情報が不足しています。パラメータを指定するか sync-config.json を作成してください。"
    exit 1
}

# ── 1. Supabase にサインイン → JWT 取得 ───────────────────────
$authBody = @{ email = $Email; password = $Password } | ConvertTo-Json
try {
    $auth = Invoke-RestMethod "$Url/auth/v1/token?grant_type=password" `
        -Method Post `
        -Headers @{ "apikey" = $AnonKey; "Content-Type" = "application/json" } `
        -Body $authBody -ErrorAction Stop
} catch {
    Write-Warning "[Auth Error] $($_.Exception.Message)"
    exit 1
}

$jwt = $auth.access_token
$headers = @{
    "apikey"        = $AnonKey
    "Authorization" = "Bearer $jwt"
    "Content-Type"  = "application/json"
    "Prefer"        = "resolution=merge-duplicates"
}

# ── 2. JSON ファイルをアップロード ────────────────────────────
$files = Get-ChildItem -Path $Folder -Filter "mt4_report_*.json" -ErrorAction SilentlyContinue
if (-not $files) {
    Write-Host "No JSON files found in: $Folder"
    exit 0
}

foreach ($file in $files) {
    try {
        $text = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
        $parsed = $text | ConvertFrom-Json

        $accountNumber = [long]$parsed.account
        $body = @{
            account_number = $accountNumber
            filename       = $file.Name
            data           = $parsed
        } | ConvertTo-Json -Depth 20 -Compress

        Invoke-RestMethod "$Url/rest/v1/reports" `
            -Method Post `
            -Headers $headers `
            -Body $body `
            -ErrorAction Stop | Out-Null

        Write-Host "[OK] $($file.Name) (account: $accountNumber)"
    } catch {
        Write-Warning "[NG] $($file.Name): $($_.Exception.Message)"
    }
}

Write-Host "Sync complete"
