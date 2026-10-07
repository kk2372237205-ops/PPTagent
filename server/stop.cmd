@echo off
title PPTagent 停止服务
cd /d "%~dp0.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0restart.ps1" -StopOnly
echo.
echo 已停止网站主进程和后台脚本组。
echo （ONLYOFFICE 容器仍在后台运行；如需停止：docker stop wzlcf-onlyoffice）
pause
