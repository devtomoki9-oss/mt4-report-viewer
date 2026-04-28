' Silent launcher for sync-to-supabase.ps1
' sync-to-supabase.ps1 / sync-config.json と同じフォルダに置いてください
Dim WshShell, scriptDir, ps1Path
Set WshShell = CreateObject("WScript.Shell")
scriptDir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\"))
ps1Path = scriptDir & "sync-to-supabase.ps1"
WshShell.Run "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File """ & ps1Path & """", 0, False
Set WshShell = Nothing
