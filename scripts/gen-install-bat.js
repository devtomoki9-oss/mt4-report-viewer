import { writeFileSync, readFileSync } from 'fs'

const installBatContent = `\
@echo off
setlocal enabledelayedexpansion

set "MQ=%APPDATA%\\MetaQuotes\\Terminal"

echo ============================================
echo   MT4/MT5 ReportExporter Setup
echo ============================================
echo.

REM --- Check MetaQuotes folder exists ---
if not exist "%MQ%" (
    echo ERROR: MetaTrader not found.
    echo Launch MT4 or MT5 once, then run this script again.
    echo.
    pause & exit /b 1
)

REM --- Pre-create MTExport output folder ---
mkdir "%USERPROFILE%\\MTExport" 2>nul

REM --- Get actual Desktop path (handles OneDrive redirection) ---
set "DESKTOP="
for /f "tokens=2,*" %%A in ('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Shell Folders" /v Desktop 2^>nul') do set "DESKTOP=%%B"
if not defined DESKTOP set "DESKTOP=%USERPROFILE%\\Desktop"
set "BAT=!DESKTOP!\\MT_Exporter.bat"

REM --- Initialize launcher batch ---
(
    echo @echo off
) > "!BAT!"

set COUNT=0

for /d %%D in ("%MQ%\\*") do (
    if exist "%%D\\origin.txt" (

        REM --- Read install path from origin.txt ---
        set "BASEPATH="
        for /f "tokens=* delims=" %%L in ('type "%%D\\origin.txt"') do (
            if not defined BASEPATH set "BASEPATH=%%L"
        )

        if defined BASEPATH (
            if exist "!BASEPATH!\\" (

                REM --- Detect MT4 vs MT5 by executable name ---
                set "EXE="
                set "MQLDIR="
                set "EAFILE="
                set "MQVER="

                if exist "!BASEPATH!\\terminal64.exe" (
                    set "EXE=!BASEPATH!\\terminal64.exe"
                    set "MQLDIR=MQL5"
                    set "EAFILE=MT5ReportExporter.mq5"
                    set "MQVER=MT5"
                ) else if exist "!BASEPATH!\\terminal.exe" (
                    set "EXE=!BASEPATH!\\terminal.exe"
                    set "MQLDIR=MQL4"
                    set "EAFILE=MT4ReportExporter.mq4"
                    set "MQVER=MT4"
                )

                if defined EXE (
                    if exist "%~dp0!EAFILE!" (

                        REM --- Copy EA to Experts folder ---
                        mkdir "%%D\\!MQLDIR!" 2>nul
                        mkdir "%%D\\!MQLDIR!\\Experts" 2>nul
                        copy /y "%~dp0!EAFILE!" "%%D\\!MQLDIR!\\Experts\\!EAFILE!" >nul 2>&1

                        if exist "%%D\\!MQLDIR!\\Experts\\!EAFILE!" (
                            echo      EA copy  : OK
                        ) else (
                            echo      EA copy  : FAILED
                        )

                        REM --- Compile EA with MetaEditor ---
                        set "METAED="
                        if exist "!BASEPATH!\\metaeditor64.exe" set "METAED=!BASEPATH!\\metaeditor64.exe"
                        if exist "!BASEPATH!\\metaeditor.exe"   set "METAED=!BASEPATH!\\metaeditor.exe"
                        if defined METAED (
                            "!METAED!" /compile:"%%D\\!MQLDIR!\\Experts\\!EAFILE!" /log
                            echo      EA compile: OK
                        ) else (
                            echo      EA compile: SKIPPED ^(MetaEditor not found^)
                        )

                        REM --- Create MTExporter profile directory ---
                        mkdir "%%D\\profiles" 2>nul
                        mkdir "%%D\\profiles\\charts" 2>nul
                        mkdir "%%D\\profiles\\charts\\MTExporter" 2>nul

                        REM --- Copy charts from any existing profile ---
                        set "COPIED=0"
                        for /d %%P in ("%%D\\profiles\\charts\\*") do (
                            if /i not "%%~nxP"=="MTExporter" if "!COPIED!"=="0" (
                                if exist "%%P\\*.chr" (
                                    copy /y "%%P\\*.chr" "%%D\\profiles\\charts\\MTExporter\\" >nul 2>&1
                                    set "COPIED=1"
                                )
                            )
                        )

                        REM --- Add to launcher bat ---
                        (
                            echo start "" "!EXE!" /profile:MTExporter
                        ) >> "!BAT!"

                        set /a COUNT+=1
                        echo [!COUNT!] [!MQVER!] !EXE!
                        echo.

                    ) else (
                        echo      SKIP: !EAFILE! not found next to install.bat
                    )
                )
            )
        )
    )
)

if !COUNT! gtr 0 (
    echo ============================================
    echo   Launching for one-time profile setup
    echo ============================================
    echo.

    REM --- Close any running terminals before setup launch ---
    taskkill /im terminal.exe   2>nul
    taskkill /im terminal64.exe 2>nul
    timeout /t 5 /nobreak >nul

    for /d %%D in ("%MQ%\\*") do (
        if exist "%%D\\origin.txt" (
            set "BASEPATH="
            for /f "tokens=* delims=" %%L in ('type "%%D\\origin.txt"') do (
                if not defined BASEPATH set "BASEPATH=%%L"
            )
            if defined BASEPATH if exist "!BASEPATH!\\" (
                set "EXE="
                set "EAFILE="
                if exist "!BASEPATH!\\terminal64.exe" (
                    set "EXE=!BASEPATH!\\terminal64.exe"
                    set "EAFILE=MT5ReportExporter"
                ) else if exist "!BASEPATH!\\terminal.exe" (
                    set "EXE=!BASEPATH!\\terminal.exe"
                    set "EAFILE=MT4ReportExporter"
                )
                if defined EXE (
                    start "" "!EXE!" /profile:MTExporter /expert:!EAFILE!
                )
            )
        )
    )

    echo For EACH terminal window that opens:
    echo   1. Wait for it to fully load
    echo   2. Drag the ReportExporter EA onto any chart
    echo   3. Click OK in the EA settings dialog
    echo   4. File -^> Profiles -^> Save As... -^> type: MTExporter -^> OK
    echo   5. Close the terminal ^(File -^> Exit^)
    echo.
    echo After doing this for ALL windows, setup is complete.
    echo Use MT_Exporter.bat on Desktop for all future launches.
)

echo ============================================
if !COUNT!==0 (
    echo No MT4/MT5 installation found.
    echo Launch MT4 or MT5 once, then run this script again.
    echo Make sure MT4ReportExporter.mq4 and/or
    echo MT5ReportExporter.mq5 are in the same folder.
) else (
    echo Setup complete ^(!COUNT! instance^(s^)^)
    echo Launcher: !BAT!
)
echo ============================================
echo.
pause
`

writeFileSync('public/install.bat', installBatContent, { encoding: 'utf8' })

const mq4Content      = readFileSync('public/MT4ReportExporter.mq4',  'utf8')
const mq5Content      = readFileSync('public/MT5ReportExporter.mq5',  'utf8')
const syncPs1Content  = readFileSync('public/sync-to-supabase.ps1',   'utf8')
const runVbsContent   = readFileSync('public/run-sync.vbs',            'utf8')

const downloadFilesJs = `// auto-generated by scripts/gen-install-bat.js
export const INSTALL_BAT      = ${JSON.stringify(installBatContent)}
export const MQ4_CONTENT      = ${JSON.stringify(mq4Content)}
export const MQ5_CONTENT      = ${JSON.stringify(mq5Content)}
export const SYNC_PS1_CONTENT = ${JSON.stringify(syncPs1Content)}
export const RUN_VBS_CONTENT  = ${JSON.stringify(runVbsContent)}
`
writeFileSync('src/lib/downloadFiles.js', downloadFilesJs, { encoding: 'utf8' })

console.log('install.bat + downloadFiles.js を生成しました')
