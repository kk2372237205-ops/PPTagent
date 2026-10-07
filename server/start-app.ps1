# 常驻启动脚本：Next 生产服务（网站主进程，端口 3000，监听 0.0.0.0）
# 由 server\start.cmd 或 server\restart-app.cmd 调用（经 start-app.vbs 隐藏窗口启动）。
# 手动重启：双击 server\restart-app.cmd；停止：server\stop.cmd

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location -LiteralPath $root
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$logDir = Join-Path $root ".runtime\logs"
if (-not (Test-Path -LiteralPath $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }

$log       = Join-Path $logDir "app.log"
$errLog    = Join-Path $logDir "app.err.log"
$lock      = Join-Path $logDir "app.lock"
$stamp     = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# 同一时刻只允许一个主进程
if (Test-Path -LiteralPath $lock) {
  $owner = Get-Content -LiteralPath $lock -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($owner -and (Get-Process -Id $owner -ErrorAction SilentlyContinue)) {
    "[$stamp] another app server (pid $owner) is already running; exit." |
      Out-File -FilePath $log -Append -Encoding UTF8
    exit 0
  }
}
$PID | Out-File -FilePath $lock -Encoding ASCII

Add-Content -LiteralPath $log -Encoding UTF8 -Value @(
  "",
  "================ $stamp  start-app.ps1 (pid $PID) ================"
)

# 这台机器上 Node.js 的安装位置（配置在环境变量里，换路径不用改脚本）
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

# 服务间互访地址：ONLYOFFICE 在 Docker 里，通过 host.docker.internal 回来取文件
$env:APP_INTERNAL_URL = "http://host.docker.internal:3000"
$env:APP_BASE_URL     = "http://host.docker.internal:3000"
$env:NODE_ENV         = "production"

& $node --version | Out-File -FilePath $log -Append -Encoding UTF8

# 数据库结构自检（幂等，不会删除已有数据）
& $node "scripts\init-db.mjs" *>> $log
if ($LASTEXITCODE -ne 0) {
  Add-Content -LiteralPath $errLog -Encoding UTF8 -Value "[$stamp] init-db.mjs failed with $LASTEXITCODE; abort."
  Remove-Item -LiteralPath $lock -Force -ErrorAction SilentlyContinue
  exit 1
}

# 重启循环：只有进程真的挂掉才重来，正常退出会停在这里
while ($true) {
  $start = Get-Date
  Add-Content -LiteralPath $log -Encoding UTF8 -Value ("[{0}] starting next start on 0.0.0.0:3000" -f $start.ToString("yyyy-MM-dd HH:mm:ss"))

  & $node "scripts\next-with-env-proxy.mjs" start *>> $log
  $code = $LASTEXITCODE
  $ran = [int]((Get-Date) - $start).TotalSeconds

  Add-Content -LiteralPath $log -Encoding UTF8 -Value ("[{0}] server exited code={1} after {2}s" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $code, $ran)
  Add-Content -LiteralPath $errLog -Encoding UTF8 -Value ("[{0}] server exited code={1} after {2}s" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $code, $ran)

  # 启动即失败（例如端口被占、构建缺失）不要疯狂重试
  if ($code -ne 0 -and $ran -lt 20) {
    Add-Content -LiteralPath $log -Encoding UTF8 -Value "quick failure; waiting 30s before retry"
    Start-Sleep -Seconds 30
  } else {
    Start-Sleep -Seconds 3
  }
}
