# PPTagent 服务器运维说明（这台电脑）

> 建立日期：2026-10-07　适用机器：`PC-20231009001`（Windows 10 企业版 19045，i7-9700K / 32GB）
> 项目目录：`D:\PPTagent\PPTagent`　　Git 仓库：`https://github.com/kk2372237205-ops/PPTagent.git`

---

## 一、给队友的访问地址

| 用途 | 地址 |
| --- | --- |
| 网站首页（客户端） | **http://10.20.73.49:3000** |
| 员工工作台 | **http://10.20.73.49:3000/employee** |
| 本机自己访问 | http://localhost:3000 |
| 客户端开发验证码 | `123456` |

- 必须在**同一个局域网**里（连同一个网段）。本机 IP 是 `10.20.73.49`（以太网 6，网关 10.20.64.1）。
- 如果队友打不开：先确认他电脑能 `ping 10.20.73.49`；再确认他和你连的是同一个网络。
- 换了网络环境（比如换了路由器/网线）IP 会变，那时要改 `.env` 里的 `ONLYOFFICE_PUBLIC_URL`
  并用新 IP 访问，见第四节。

---

## 二、每天怎么用（一键启停）

这台电脑**不关机**，所以不需要开机自启。重启电脑后、或想重启服务时，双击：

| 脚本 | 作用 |
| --- | --- |
| `server\start.cmd` | **一键启动**：检查 Node → 拉起 Docker Desktop → 启动 ONLYOFFICE 容器 → 启动网站 + 后台脚本组 |
| `server\stop.cmd` | 停止网站主进程和后台脚本组（ONLYOFFICE 容器继续留着） |
| `server\restart-all.cmd` | 重启网站 + 后台脚本组 |
| `server\restart-app.cmd` | 只重启网站（改了网页/接口后用这个） |

启动后服务的实际形态（都是隐藏窗口在后台跑，任务管理器能看到 `node.exe`）：

- **网站主进程**：生产模式 Next.js，监听 `0.0.0.0:3000`
- **后台脚本组**：生成 PPT / 美化 PPT / 生图 / 图片炸开 四个后台任务
- **ONLYOFFICE 容器**：`wzlcf-onlyoffice`，占用 `18080` 端口，员工在线编辑 PPT 用

日志都在 **`.runtime\logs\`**：

| 文件 | 内容 |
| --- | --- |
| `app.log` / `app.err.log` | 网站主进程日志、报错 |
| `workers.log` / `workers.err.log` | 后台脚本组日志、报错 |
| `app.lock` / `workers.lock` | 记录当前进程号，用于防止重复启动 |

**网站打不开时的排查顺序**：看 `app.err.log` 最后几十行 → 确认 3000 端口在监听
（`netstat -ano | findstr :3000`）→ 双击 `restart-app.cmd` 重启一次。

---

## 三、这套东西装在哪

| 组件 | 版本 | 位置 |
| --- | --- | --- |
| Node.js | **v24.21.0**（与旧开发机同版本） | `C:\Program Files\nodejs` |
| npm | 11.19.0，镜像源 `registry.npmmirror.com` | 缓存 `D:\PPTagent-setup\npm-cache` |
| 项目依赖 | 420 个包，`package-lock.json` 未改动 | `D:\PPTagent\PPTagent\node_modules` |
| 生产构建产物 | Next.js 16.2.9 | `D:\PPTagent\PPTagent\.next` |
| Docker Desktop | 4.94.0，WSL2 后端 | `C:\Users\PC\AppData\Local\Programs\DockerDesktop` |
| WSL2 内核 | 5.10.16 | 已随 Docker 一起启用 |
| poppler（`pdftoppm`） | 25.07.0，美化 PPT 的"PPT 转 PNG"要用 | WinGet 包目录，路径写在 `.env` 的 `PDFTOPPM_PATH` |
| Python | 3.12.10 + OpenCV 5.0 + numpy | `图片炸开/组件拆图` 的本地抠图能力 |
| Git | 2.56.0 | `D:\Git` |
| 安装包备份 | Node / WSL 内核 / 日志 | `D:\PPTagent-setup` |

数据库是 SQLite 单文件：`prisma\dev.db`（22MB，旧机器的数据已完整带过来）。

---

## 四、关键配置文件

### `.env`（不提交到 Git，含密钥，改动前先备份）

本次换机只改了这两项，其余保持旧机器的值：

```ini
ONLYOFFICE_URL=http://127.0.0.1:18080                        # 服务器自己内部用
ONLYOFFICE_PUBLIC_URL=http://10.20.73.49:18080               # ★ 队友的浏览器要访问这个
PDFTOPPM_PATH="C:\Users\PC\AppData\Local\Microsoft\WinGet\Packages\...\pdftoppm.exe"
```

`ONLYOFFICE_PUBLIC_URL` 是**换网络时唯一必须改的一行**：它必须是"别人电脑也能访问到"的地址，
写成 `localhost` 的话，只有服务器自己能用在线编辑，队友那边编辑器加载不出来。

改完 `.env` 后必须双击 `server\restart-all.cmd` 才生效（`.env` 只在启动时读取）。

### `server\` 目录（本次新建）

| 文件 | 作用 |
| --- | --- |
| `start.cmd` | 一键启动（队友/你日常用的入口） |
| `stop.cmd` | 一键停止 |
| `restart-all.cmd` / `restart-app.cmd` | 重启 |
| `start-app.ps1` / `start-workers.ps1` | 真正干活的启动脚本，带崩溃自动重启循环 |
| `start-app.vbs` / `start-workers.vbs` | 让 PowerShell 在隐藏窗口里跑，不弹黑框 |
| `restart.ps1` | 停止/重启的底层实现 |

### ⚠️ 改这些脚本时注意编码和换行（踩过的坑）
这台机器上为了这些脚本踩了 **三个坑**，改脚本时请照做，否则服务会静默起不来或报一堆
"不是内部或外部命令"：

| 文件类型 | 必须的编码 | 必须的换行 |
| --- | --- | --- |
| `.cmd` | **GBK(936)**，且**不要写 `chcp 65001`** | **CRLF** |
| `.ps1` | **UTF-8 带 BOM** | **CRLF** |
| `.vbs` | **纯 ASCII（不要写中文注释）** | **CRLF** |

**最关键的是换行符**：`.cmd` 必须是 CRLF。如果被存成 LF（很多编辑器/工具/Rsync 会这样），
cmd.exe 解析时会丢字符，报出一堆 `'el' 不是内部或外部命令`、`'ttp:' 不是内部或外部命令`
这种碎片错误——**看起来像编码问题，其实是换行问题**（这个坑花了最久才定位）。

另外 `.cmd` 里**不要用 `chcp 65001`**：切代码页会让 cmd.exe 读取批处理文件后续内容时字节偏移错位，
同样解析失败。这台机器控制台默认就是 936(GBK)，所以 `.cmd` 直接按 GBK 存、不加 chcp 才是对的做法。

`.cmd` 里也别用 `timeout /t`，它在输入被重定向时会直接报错退出；用 `ping -n 5 127.0.0.1 >nul` 代替。

一键自检（全部应显示"正确"）：

```powershell
$gbk=[Text.Encoding]::GetEncoding(936)
foreach ($f in (Get-ChildItem D:\PPTagent\PPTagent\server -File | Sort-Object Name)) {
  $b=[IO.File]::ReadAllBytes($f.FullName)
  $crlf=0;$lf=0; for($i=0;$i -lt $b.Length;$i++){ if($b[$i] -eq 13 -and $i+1 -lt $b.Length -and $b[$i+1] -eq 10){$crlf++} elseif($b[$i] -eq 10 -and ($i -eq 0 -or $b[$i-1] -ne 13)){$lf++} }
  $bom=($b[0] -eq 0xEF); $na=($b|Where-Object{$_ -gt 127}|Measure-Object).Count
  $verdict = switch ($f.Extension) {
    ".ps1" { if($bom){"UTF8+BOM"}else{"缺BOM ✗"} }
    ".vbs" { if($na -eq 0 -and -not $bom){"纯ASCII"}else{"含非ASCII ✗"} }
    ".cmd" { if(-not $bom -and ([Text.Encoding]::GetEncoding(936).GetString($b) -notmatch '(?im)^\s*chcp')){"GBK无BOM"}else{"✗"} }
  }
  $eol = if($lf -eq 0){"CRLF"}else{"裸LF=$lf ✗"}
  "{0,-20} {1,-12} {2}" -f $f.Name,$verdict,$eol
}
```

---

## 五、几个需要知道的运维事实

### 1. Docker Hub 直连不通，已配好国内镜像加速
这个网络**直连 Docker Hub 会超时**（`registry-1.docker.io` 连不上）。已经配置了 5 个国内镜像源：

配置文件：`C:\Users\PC\.docker\daemon.json`

```json
"registry-mirrors": [
  "https://docker.m.daocloud.io",
  "https://docker.1ms.run",
  "https://docker.xuanyuan.me",
  "https://hub.rat.dev",
  "https://dockerproxy.net"
]
```

改过这个文件后必须**重启 Docker Desktop** 才生效（看 `docker info` 里有没有 `Registry Mirrors` 一段来确认）。

实测结论：
- ✅ `onlyoffice/documentserver:latest`（4.86GB）已通过镜像源拉取成功
- ⚠️ 厂商仓库 `registry.onlyoffice.com` 虽然能连上，但拉大镜像会中断（返回 HTML 错误页），**不要用它**
- ⚠️ 拉取偶发卡在 `Pulling fs layer` 不动：**Ctrl+C 结束再重新 `docker pull` 一次**即可（镜像层有缓存，重试很快）

要更新 ONLYOFFICE 镜像时：

```powershell
docker pull onlyoffice/documentserver:latest
docker compose -f docker-compose.onlyoffice.yml up -d
```

### 2. ONLYOFFICE 必须开着，否则员工在线编辑不可用
容器 `wzlcf-onlyoffice` 设了 `restart: unless-stopped`，只要 Docker Desktop 在跑就会自己起来。
**Docker Desktop 已设成"开机（登录）后自动启动"**，所以机器不关机的情况下不用管它。

已实测打通的链路（在线编辑必需）：
- 队友浏览器 → `http://10.20.73.49:18080` 加载编辑器脚本 ✅
- 容器内部 → `http://host.docker.internal:3000` 取文件/回调 ✅（HTTP 200）

如果在线编辑打不开，先测这两个地址，再 `docker ps` 看容器在不在。

### 3. 构建与代码更新
这台是**生产模式**（`next build` + `next start`），改了代码必须重新构建才生效：

```powershell
cd D:\PPTagent\PPTagent
npm install                     # 依赖有变化时
npm run db:push                 # 数据库结构有变化时
npm run build                   # 重新构建（约 1 分钟）
server\restart-app.cmd          # 重启网站
```

### 4. 崩溃会自动重启（已内置，不需要额外看门狗）
`start-app.ps1` 和 `start-workers.ps1` 内部各有一个 `while ($true)` 重启循环：
里面的 node 进程挂掉后，3 秒自动重来；如果是启动即失败（例如构建坏了、端口被占），
等 30 秒再重试，避免疯狂重启。

覆盖的情况：
- 网站主进程崩溃 / 后台执行脚本崩溃 → ✅ 自动重启
- 整个电脑重启 → ⚠️ 需要有人登录桌面后双击 `server\start.cmd`（按你的要求没做开机自启）
- 启动器自己被杀（任务管理器里结束掉 `powershell.exe`）→ ❌ 不会自动恢复，双击 `start.cmd` 即可

### 5. 换了网络 / IP 变了怎么办
本机 IP 由路由器分配，**换网络或过一段时间可能变**。查当前 IP：

```powershell
ipconfig | findstr /i "IPv4"
```

如果变了，改 `.env` 里这两处（`ONLYOFFICE_PUBLIC_URL` 必须改成新 IP），然后双击
`server\restart-all.cmd`：

```ini
ONLYOFFICE_PUBLIC_URL=http://新IP:18080
```

并把这个新地址告诉队友。想让 IP 固定下来，可以在路由器里给这台机器做 MAC 绑定（保留 IP）。

### 6. 已知的历史数据问题
旧开发机的 `uploads\` 文件夹（约 6.4GB 的客户资料、生成的 PPT/PDF/预览图）**没有搬过来，按你的决定放弃了**。
数据库里历史订单的记录还在，但点开旧订单的文档会提示文件缺失；**新建的订单不受影响**。

### 7. 电源与稳定性设置（已配置好）
- 永不睡眠、硬盘不关、显示器 15 分钟关闭（不影响服务）
- 已关闭休眠和快速启动
- 电源键、睡眠键都改成"关机"
- 如果这台机器要接不间断电源（UPS）或希望断电恢复后自动开机：需要在 **BIOS** 里把
  `Restore on AC Power Loss` / `AC Back` 设成 **Power On**（软件层面设不了）

---

## 六、Git 与代码同步

仓库已连好（`D:\Git` + HTTPS + Git Credential Manager），当前在 `main` 分支且与远程一致。

```powershell
cd D:\PPTagent\PPTagent
git status
git pull
```

按项目规则：**不要在 `main` 上直接开发新功能**，新功能开 `codex/<功能名>` 分支，
跑通 `npm run verify` 后再合并。首次 `git push` 会弹出 GitHub 登录窗口，用有该仓库权限的账号登录一次即可长期记住。

---

## 七、为什么这些服务必须"登录桌面后才跑得起来"

按你的要求**没有配置开机自动登录**，所以：**重启电脑后需要有人登录一次桌面**，
然后双击 `server\start.cmd`。平时不关机就一直跑，不受影响。

如果以后想要"重启后无人值守自动恢复"，两种做法（任选）：

1. 配置 Windows 自动登录（把密码存进注册表）：之后开机自动进桌面，再把 `start.cmd` 做成计划任务即可；
2. 把 `server\start.cmd` 加进「启动」文件夹：登录后自动运行，但仍需有人登录。
