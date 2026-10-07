Set shell = CreateObject("WScript.Shell")
root = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & root & "\start-app.ps1""", 0, False
