# sync-to-supabase.ps1
# Upload MT4/MT5 JSON reports to Supabase
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

if (-not $Url -or -not $AnonKey -or -not $Email -or -not $Password) {
    Write-Error "Missing credentials. Provide -Url -AnonKey -Email -Password or use run-sync.vbs."
    exit 1
}

# 1. Sign in to Supabase
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

# 2. Upload JSON files
$files = Get-ChildItem -Path $Folder -Filter "mt4_report_*.json" -ErrorAction SilentlyContinue
if (-not $files) {
    Write-Host "No JSON files found in: $Folder"
    exit 0
}

foreach ($file in $files) {
    try {
        $text   = [IO.File]::ReadAllText($file.FullName, [Text.Encoding]::UTF8)
        $parsed = $text | ConvertFrom-Json

        $accountNumber = [long]$parsed.account
        $body = @{
            p_account_number = $accountNumber
            p_filename       = $file.Name
            p_data           = $parsed
        } | ConvertTo-Json -Depth 20 -Compress

        Invoke-RestMethod "$Url/rest/v1/rpc/upsert_report" `
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
