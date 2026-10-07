# 常驻启动脚本：后台执行脚本组（生成 PPT / 美化 PPT / 生图 / 图片炸开）
# 由 server\start.cmd 或 server\restart-all.cmd 调用（经 start-workers.vbs 隐藏窗口启动）。
# 这些脚本负责轮询数据库里的任务并真正干活，网站主进程不含它们，必须单独常驻。

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $root
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$logDir = Join-Path $root ".runtime\logs"
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$log    = Join-Path $logDir "workers.log"
$errLog = Join-Path $logDir "workers.err.log"
$lock   = Join-Path $logDir "workers.lock"
$stamp  = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

if (Test-Path -LiteralPath $lock) {
  $owner = Get-Content -LiteralPath $lock -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) {
    "[$stamp] another worker group (pid $owner) is already running; exit." |
      Out-File -FilePath $log -Append -Encoding UTF8
    exit 0
  }
}
$PID | Out-File -FilePath $lock -Encoding ASCII

Add-Content -LiteralPath $log -Encoding UTF8 -Value @(
  "",
  "================ $stamp  start-workers.ps1 (pid $PID) ================"
)

$nodeHome = $env:WZLCF_NODE_HOME
if (-not $nodeHome) { $nodeHome = "C:\Program Files\nodejs" }
$node = Join-Path $nodeHome "node.exe"
if (-not (Test-Path -LiteralPath $node)) {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { $node = $cmd.Source }
}
if (-not (Test-Path -LiteralPath $node)) {
  Add-Content -LiteralPath $errLog -Encoding UTF8 -Value "[$stamp] node.exe not found; abort."
  Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
  exit 1
}

$env:NODE_ENV = "production"
# 图片炸开服务默认地址（组件提取服务没装 Python 依赖时不生效，会走内置降级逻辑）
$env:COMPONENT_EXTRACTOR_PORT = "8765"
$env:COMPONENT_EXTRACTOR_URL  = "http://127.0.0.1:8765"

& $node --version | Out-File -FilePath $log -Append -Encoding UTF8

while ($true) {
  $start = Get-Date
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ("[{0}] starting agent workers" -f $start.ToString("yyyy-MM-dd HH:mm:ss"))

  & $node "scripts\agent-workers.mjs" *>> $log
  $code = $LASTEXITCODE
  $ran = [int]((Get-Date) - $start).TotalSeconds

  Add-Content -LiteralPath $log -Encoding UTF8 -Value ("[{0}] workers exited code={1} after {2}s" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $code, $ran)
  Add-Content -LiteralPath $errLog -Encoding UTF8 -Value ("[{0}] workers exited code={1} after {2}s" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $code, $ran)
  Start-Sleep -Seconds 10
}
