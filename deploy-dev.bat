@echo off
echo [1/2] Deploying to Vercel Preview...
npx vercel --yes > deploy_output.tmp 2>&1
for /f "tokens=*" %%i in ('findstr "Preview:" deploy_output.tmp') do set PREVIEW_LINE=%%i
del deploy_output.tmp

for /f "tokens=2" %%u in ("%PREVIEW_LINE%") do set PREVIEW_URL=%%u
echo Preview URL: %PREVIEW_URL%

echo [2/2] Assigning alias...
npx vercel alias %PREVIEW_URL% mt4-report-viewer-dev.vercel.app

echo Done! https://mt4-report-viewer-dev.vercel.app
