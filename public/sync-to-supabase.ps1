# MT4/MT5 Export JSON を Supabase へ同期するスクリプト
#
# 【使い方】
#   .\sync-to-supabase.ps1 -Url "https://xxxx.supabase.co" -AnonKey "eyJ..." -Email "you@example.com" -Password "yourpass"
#
# 【タスクスケジューラ登録（1分ごと・サイレント）】
#   schtasks /create /tn "MTExportSync" /sc minute /mo 1 /f /tr "wscript /b %USERPROFILE%\Downloads\run-sync.vbs"
#   ※ run-sync.vbs はアプリの「セットアップ」画面からダウンロードできます
#
# 【出力先フォルダ】
#   %USERPROFILE%\MTExport\mt4_report_*.json

param(
    [Parameter(Mandatory)][string]$Url,
    [Parameter(Mandatory)][string]$AnonKey,
    [Parameter(Mandatory)][string]$Email,
    [Parameter(Mandatory)][string]$Password,
    [string]$Folder = "$env:USERPROFILE\MTExport"
)

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
