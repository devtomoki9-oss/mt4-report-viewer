import { writeFileSync, readFileSync } from 'fs'

const installBatContent = `\
@echo off
setlocal enabledelayedexpansion

set "MQ=%APPDATA%\\MetaQuotes\\Terminal"
set "EA=MT4ReportExporter.mq4"

echo ============================================
echo   MT4ReportExporter Setup
echo ============================================
echo.

REM --- Check EA file exists ---
if not exist "%~dp0%EA%" (
    echo ERROR: %EA% not found.
    echo Place install.bat and MT4ReportExporter.mq4
    echo in the same folder, then run again.
    echo.
    pause & exit /b 1
)

REM --- Check MetaQuotes folder exists ---
if not exist "%MQ%" (
    echo ERROR: MT4 not found.
    echo Launch MT4 once, then run this script again.
    echo.
    pause & exit /b 1
)

REM --- Pre-create MT4Export output folder ---
mkdir "%USERPROFILE%\\MT4Export" 2>nul

REM --- Get actual Desktop path (handles OneDrive redirection) ---
set "DESKTOP="
for /f "tokens=2,*" %%A in ('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Desktop 2^>nul') do set "DESKTOP=%%B"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\\Desktop"
set "BAT=!DESKTOP!\\MT4_Exporter.bat"

REM --- Initialize launcher batch (profile-based launch) ---
(
    echo @echo off
) > "!BAT!"

set COUNT=0

for /d %%D in ("%MQ%\\*") do (
    if exist "%%D\\origin.txt" (

        REM --- Read install path from origin.txt (UTF-16), append terminal.exe if needed ---
        set "EXE="
        for /f "tokens=* delims=" %%L in ('type "%%D\\origin.txt"') do (
            if not defined EXE set "EXE=%%L"
        )
        if defined EXE if exist "!EXE!\\" set "EXE=!EXE!\\terminal.exe"

        if defined EXE (
            if exist "!EXE!" (

                REM --- Copy EA to Experts folder ---
                mkdir "%%D\\MQL4" 2>nul
                mkdir "%%D\\MQL4\\Experts" 2>nul
                copy /y "%~dp0%EA%" "%%D\\MQL4\\Experts\\%EA%" >nul 2>&1

                REM --- .ex4 is auto-compiled by MT4 on first launch ---
                if exist "%%D\\MQL4\\Experts\\%EA%" (
                    echo      EA copy  : OK
                ) else (
                    echo      EA copy  : FAILED
                )

                REM --- Create MT4Exporter profile directory ---
                mkdir "%%D\\profiles" 2>nul
                mkdir "%%D\\profiles\\charts" 2>nul
                mkdir "%%D\\profiles\\charts\\MT4Exporter" 2>nul

                REM --- Copy charts from any existing profile so /expert: has a chart to attach to ---
                set "COPIED=0"
                for /d %%P in ("%%D\\profiles\\charts\\*") do (
                    if /i not "%%~nxP"=="MT4Exporter" if "!COPIED!"=="0" (
                        if exist "%%P\\*.chr" (
                            copy /y "%%P\\*.chr" "%%D\\profiles\\charts\\MT4Exporter\\" >nul 2>&1
                            set "COPIED=1"
                        )
                    )
                )

                REM --- Add to launcher bat with profile ---
                (
                    echo start "" "!EXE!" /profile:MT4Exporter
                ) >> "!BAT!"

                set /a COUNT+=1
                echo [!COUNT!] !EXE!
                echo.
            )
        )
    )
)

if !COUNT! gtr 0 (
    echo ============================================
    echo   Launching MT4 for one-time profile setup
    echo ============================================
    echo.

    REM --- Close any running MT4 before setup launch ---
    taskkill /im terminal.exe 2>nul
    timeout /t 5 /nobreak >nul

    for /d %%D in ("%MQ%\\*") do (
        if exist "%%D\\origin.txt" (
            set "EXE="
            for /f "tokens=* delims=" %%L in ('type "%%D\\origin.txt"') do (
                if not defined EXE set "EXE=%%L"
            )
            if defined EXE if exist "!EXE!\\" set "EXE=!EXE!\\terminal.exe"
            if defined EXE if exist "!EXE!" (
                start "" "!EXE!" /profile:MT4Exporter /expert:MT4ReportExporter
            )
        )
    )

    echo For EACH MT4 window that opens:
    echo   1. Wait for MT4 to fully load
    echo   2. Drag MT4ReportExporter onto any chart
    echo   3. Click OK in the EA settings dialog
    echo   4. File -^> Profiles -^> Save As... -^> type: MT4Exporter -^> OK
    echo   5. Close MT4 ^(File -^> Exit^)
    echo.
    echo After doing this for ALL MT4 windows, setup is complete.
    echo Use MT4_Exporter.bat on Desktop for all future launches.
    echo ^(EA loads automatically via profile on every launch^)
)

echo ============================================
if !COUNT!==0 (
    echo No MT4 installation found.
    echo Launch MT4 once, then run this script again.
) else (
    echo Setup complete ^(!COUNT! instance^(s^)^)
    echo Launcher: !BAT!
)
echo ============================================
echo.
pause
`

writeFileSync('public/install.bat', installBatContent, { encoding: 'utf8' })

// MT4ReportExporter.mq4 を読み込む
const mq4Content = readFileSync('public/MT4ReportExporter.mq4', 'utf8')

// src/lib/downloadFiles.js を生成（Blob ダウンロード用）
const downloadFilesJs = `// auto-generated by scripts/gen-install-bat.js
export const INSTALL_BAT = ${JSON.stringify(installBatContent)}
export const MQ4_CONTENT = ${JSON.stringify(mq4Content)}
`
writeFileSync('src/lib/downloadFiles.js', downloadFilesJs, { encoding: 'utf8' })

console.log('install.bat + downloadFiles.js を生成しました')
