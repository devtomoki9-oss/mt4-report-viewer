# MTExport フォルダの JSON ファイルを GitHub プライベートリポジトリへ同期
#
# 使い方:
#   Unblock-File ".\sync-to-github.ps1"
#   .\sync-to-github.ps1 -Token "ghp_xxxx" -Owner "ユーザー名" -Repo "mt4-report-data"
#
# タスクスケジューラ登録（5分ごと自動実行）:
#   schtasks /create /tn "MTExportSync" /sc minute /mo 5 /f ^
#     /tr "powershell -NonInteractive -File \"%USERPROFILE%\Downloads\sync-to-github.ps1\" -Token ghp_xxxx -Owner yourname -Repo mt4-report-data"

param(
    [Parameter(Mandatory)][string]$Token,
    [Parameter(Mandatory)][string]$Owner,
    [Parameter(Mandatory)][string]$Repo,
    [string]$Folder = "$env:USERPROFILE\MTExport"
)

$headers = @{
    Authorization = "token $Token"
    "User-Agent"  = "MTExporter-Sync/1.0"
    Accept        = "application/vnd.github.v3+json"
}

$files = Get-ChildItem -Path $Folder -Filter "*.json" -ErrorAction SilentlyContinue
if (-not $files) {
    Write-Host "JSON ファイルが見つかりません: $Folder"
    exit 0
}

foreach ($file in $files) {
    $b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($file.FullName))
    $sha = $null
    try {
        $existing = Invoke-RestMethod "https://api.github.com/repos/$Owner/$Repo/contents/$($file.Name)" `
            -Headers $headers -ErrorAction Stop
        $sha = $existing.sha
    } catch {}

    $body = @{ message = "sync: $($file.Name)"; content = $b64 }
    if ($sha) { $body.sha = $sha }

    try {
        Invoke-RestMethod "https://api.github.com/repos/$Owner/$Repo/contents/$($file.Name)" `
            -Method Put -Headers $headers `
            -Body ($body | ConvertTo-Json -Depth 3) `
            -ContentType "application/json" | Out-Null
        Write-Host "[OK] $($file.Name)"
    } catch {
        Write-Warning "[NG] $($file.Name): $($_.Exception.Message)"
    }
}

Write-Host "同期完了"
