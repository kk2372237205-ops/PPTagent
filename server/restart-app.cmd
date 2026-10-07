@echo off
title PPTagent 重启网站
cd /d "%~dp0.."
rem 只重启网站主进程（改了网页/接口后用这个）
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1" -Target app
pause
