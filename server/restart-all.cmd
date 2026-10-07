@echo off
title PPTagent 重启全部服务
cd /d "%~dp0.."
rem 重启网站主进程 + 后台脚本组
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1"
pause
