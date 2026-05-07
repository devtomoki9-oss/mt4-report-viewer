' MT Report Viewer - Auto Sync
' Place in the same folder as sync-to-supabase.ps1
Dim WshShell, ps1Path, psArgs
Set WshShell = CreateObject("WScript.Shell")
ps1Path = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\")) & "sync-to-supabase.ps1"
psArgs = " -Url ""https://tiheknpfvlnofrnvpxvo.supabase.co"" -AnonKey ""eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpaGVrbnBmdmxub2ZybnZweHZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczNTY2NDAsImV4cCI6MjA5MjkzMjY0MH0.m7CP5SCfahjqKiERRVZcu1EEd0yWyU4XqRimKu3ZMTg"" -Email ""devtomoki9@gmail.com"" -Password ""Ntnt24194"""
WshShell.Run "powershell.exe -NonInteractive -ExecutionPolicy Bypass -File """ & ps1Path & """" & psArgs, 0, False
Set WshShell = Nothing
