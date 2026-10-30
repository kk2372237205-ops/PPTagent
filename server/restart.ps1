# 停止 / 重启常驻服务
# 用法：
#   powershell -ExecutionPolicy Bypass -File server\restart.ps1            # 重启网站主进程 + 后台脚本组
#   powershell -ExecutionPolicy Bypass -File server\restart.ps1 -Target app
#   powershell -ExecutionPolicy Bypass -File server\restart.ps1 -Target workers
#   powershell -ExecutionPolicy Bypass -File server\restart.ps1 -StopOnly

param(
  [ValidateSet("all", "app", "workers")]
  [string]$Target = "all",
  [switch]$StopOnly
)

$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$logDir = Join-Path $root ".runtime\logs"
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Stop-Tracked([string]$lockName) {
  $lock = Join-Path $logDir $lockName
  if (-not (Test-Path -LiteralPath $lock)) { return }
  $owner = Get-Content -LiteralPath $lock -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) {
    Write-Host "stopping $lockName owner pid $owner (and its child processes)"
    & taskkill.exe /PID $owner /T /F 2>&1 | Out-Null
  }
  Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
}

# 兜底：还有 node 进程的工作目录/命令行指向本项目的，一并结束
function Stop-StrayProjectNode() {
  $needle = $root.ToLower()
  $stray = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { ($_.CommandLine -and $_.CommandLine.ToLower().Contains($needle)) }
  foreach ($p in $stray) {
    Write-Host ("stopping stray node pid {0}" -f $p.ProcessId)
    & taskkill.exe /PID $p.ProcessId /T /F 2>&1 | Out-Null
  }
}

if ($Target -eq "all" -or $Target -eq "app")     { Stop-Tracked "app.lock" }
if ($Target -eq "all" -or $Target -eq "workers") { Stop-Tracked "workers.lock" }
Start-Sleep -Seconds 2

if ($Target -eq "all" -or $Target -eq "app")     { Stop-StrayProjectNode }

if ($StopOnly) { Write-Host "[$stamp] stopped ($Target)."; exit 0 }

Start-Sleep -Seconds 1
if ($Target -eq "all" -or $Target -eq "app") {
  Write-Host "starting web server..."
  & wscript.exe (Join-Path $root "server\start-app.vbs")
}
if ($Target -eq "all" -or $Target -eq "workers") {
  Write-Host "starting background workers..."
  & wscript.exe (Join-Path $root "server\start-workers.vbs")
}
Write-Host "[$stamp] restart requested ($Target). 日志：$logDir"
