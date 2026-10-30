@echo off
title PPTagent 一键启动
cd /d "%~dp0.."

echo ============================================
echo   PPTagent 服务启动（网站 + 后台脚本组）
echo ============================================
echo.

rem ---------- 1. 检查 Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
  ) else (
    echo [错误] 找不到 Node.js，请先安装 Node.js 24。
    pause
    exit /b 1
  )
)
for /f "delims=" %%v in ('node --version') do echo [1/4] Node.js %%v

rem ---------- 2. 启动 Docker Desktop（ONLYOFFICE 在线编辑器要用） ----------
set "DOCKER_EXE=C:\Users\PC\AppData\Local\Programs\DockerDesktop\Docker Desktop.exe"
tasklist /fi "imagename eq Docker Desktop.exe" 2>nul | find /i "Docker Desktop.exe" >nul
if errorlevel 1 (
  if exist "%DOCKER_EXE%" (
    echo [2/4] 启动 Docker Desktop...
    start "" "%DOCKER_EXE%"
  ) else (
    echo [2/4] [警告] 没找到 Docker Desktop，ONLYOFFICE 在线编辑可能不可用。
  )
) else (
  echo [2/4] Docker Desktop 已在运行
)

rem ---------- 3. 拉起 ONLYOFFICE 容器并等待就绪 ----------
echo [3/4] 检查 / 启动 ONLYOFFICE 容器（首次启动要等 1-3 分钟）...
node scripts\ensure-onlyoffice.mjs
if errorlevel 1 (
  echo [警告] ONLYOFFICE 没起来，网站和后台脚本仍会继续启动；
  echo        等你把 Docker Desktop 打开后，重新运行本脚本即可。
)

rem ---------- 4. 启动网站主进程 + 后台脚本组 ----------
echo.
echo [4/4] 启动网站主进程和后台脚本组...
wscript.exe "%~dp0start-app.vbs"
wscript.exe "%~dp0start-workers.vbs"
ping -n 5 127.0.0.1 >nul

echo.
echo ============================================
echo   启动完成，地址如下（同一局域网都能打开）
echo ============================================
echo   网站首页   : http://10.20.73.49:3000
echo   员工工作台 : http://10.20.73.49:3000/employee
echo   本机访问   : http://localhost:3000
echo.
echo   日志目录   : .runtime\logs
echo   停止服务   : 双击 server\stop.cmd
echo.
echo 提示：如果网站打不开，先等 10 秒再刷新；
echo       还是不行就看 .runtime\logs\app.err.log
echo.
pause
