Set shell = CreateObject("WScript.Shell")
root = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & root & "\start-workers.ps1""", 0, False
