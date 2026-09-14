# WZLCF · PPTagent

面向 PPT 定制交付团队的一体化生产工作台。项目把客户咨询、订单协作、在线编辑、素材管理、AI 生成、美化重绘、预览确认和最终交付放在同一套可控流程中，重点不是“一键生成”，而是让员工和负责人在每个关键节点都能查看、修改、确认和返工。

当前项目同时包含两个产品界面：

- **客户端**：服务介绍、预算咨询、资料上传、交付确认、修改申请与资产归档。
- **员工工作台**：微信/企业微信登录、成员审批与权限、订单协作、ONLYOFFICE 在线编辑、素材库和小 W 智能模式。

## 核心能力

- **生成 PPT**：快速版适合普通任务；高级版由 GPT-5.6 按用户逐页结构整理大量文字资料，一次确认完整方案后由 Image2 最多 6 页并发成图。
- **美化 PPT**：先提交整套与逐页修改要求，再确认美化方案、生成预览图、单页重做，最后导出 PDF 或 PPT。
- **生图与图片工具**：16:9 页面生图、智能抠图、图片拆分、PPT 图片提取和素材回填。
- **可控交付**：预览图可放大，页面可单独重新生成或贴近上一页，确认后再进入最终文件转换。
- **多学校工作区**：微信与企业微信双入口、待审批成员、角色与逐项功能权限、学校数据隔离和管理员控制台。
- **服务端 AI 接入**：文字与生图使用独立中转密钥；Codia、ONLYOFFICE 等外部服务均由服务端调用，不向浏览器暴露密钥。

## 系统骨架

```text
客户端与员工工作台
        ↓
Next.js 页面与服务端接口
        ↓
订单 / 成员 / 权限 / 任务状态（Prisma + SQLite）
        ↓
后台执行脚本：资料解析、方案规划、逐页生图、美化重绘、文件转换
        ↓
YZStudio / Codia / ONLYOFFICE / 可选本地图像能力
```

项目仍处于持续开发阶段。真实扫码、AI 生成、在线编辑与 PPT 转换需要配置对应的第三方服务；仓库只提供环境变量模板，不包含任何真实密钥或业务资料。

## 本地启动

```powershell
npm install --cache .npm-cache --registry=https://registry.npmmirror.com
npm run db:init
npm run dev
```

打开 `http://localhost:3000`。开发环境默认验证码为 `123456`。

如果只调员工智能模式，可以用更轻的启动命令：

```powershell
npm run dev:lite
```

`dev:lite` 不替代完整开发模式，它只启动 Next、设计/生图后台执行脚本、生成 PPT 后台执行脚本和美化 PPT 后台执行脚本。需要 ONLYOFFICE 检查、图片炸开或组件拆图时仍使用 `npm run dev`。

当前项目的唯一功能状态入口是 `docs/current-project-memory.md`。详细业务验收流程在 `docs/project-control-workflows.md`；新模型接手顺序在 `docs/model-handoff.md`。以下两份文件只用于历史追溯：

- `docs/project-archive-2026-07-03.md`
- `docs/maintenance-audit-2026-07-03.md`

`npm run dev` 会先自动检查 Docker Desktop、启动 ONLYOFFICE 容器并确认编辑器可访问，然后才启动 Next.js。首次运行可能较慢，因为 Docker 需要拉取并初始化 ONLYOFFICE 镜像；Docker 未安装或无法启动时，命令会明确失败，不会启动一个缺少 PPT 编辑器的开发环境。

## 员工模式

- 地址：`http://localhost:3000/employee`
- 登录方式：微信与企业微信双扫码入口，默认显示普通微信；不再使用员工手机号、短信验证码或员工码。
- 普通微信用户先选择申请加入的学校再扫码；微信身份不等于学校身份，第一次扫码后默认进入“待审批”。
- 已接入企业微信的学校可切换到“企业微信”，由学校通讯录验证成员身份。
- 软件管理员在“管理控制台”审批成员，并分配角色和具体功能。
- 每个学校是独立工作区；普通学校管理员和成员不能查看其他学校的数据。

本地可先在 `.env` 设置 `WECHAT_DEV_BYPASS=1` 测试控制台。普通微信真实扫码需要微信开放平台“网站应用”的 `AppID`、`AppSecret` 与 HTTPS 回调域名；企业微信真实扫码需要学校管理员提供自建应用的 `CorpID`、`AgentID`、`Secret` 与可信回调域名。

单学校使用 `EMPLOYEE_ORG_SLUG` 与 `EMPLOYEE_ORG_NAME`；多学校使用 `EMPLOYEE_ORGANIZATIONS_JSON`。同一套微信网站应用可以服务多个学校，用户扫码前选择学校，管理员再核验其学校归属。可用 `WECHAT_PLATFORM_ADMIN_OPENID` 或 `WECHAT_PLATFORM_ADMIN_UNIONID` 绑定整套软件管理员。所有 `AppSecret` 只能保存在服务端环境变量中。

管理员控制台当前支持：

- 批准、停用成员。
- 设置整套软件管理员、学校管理员、负责人、设计师、审核员、普通成员。
- 逐项开关订单、客户消息、团队、在线编辑、AI 助手、智能 PPT、素材库、图片工具和导出权限。
- 查看成员最近登录、负责订单、生成任务和操作次数。

复制 `.env.example` 中的微信、可选企业微信、ONLYOFFICE 和 AI 配置到 `.env`。所有密钥只能配置在服务端。

## AI 中转配置

所有原先使用 ChatGPT Key 的文字分析、方案规划、逐页内容整理和生图功能，现已改走 YZStudio 中转站，并使用两把互不混用的服务端密钥：

- `AI_TEXT_API_KEY`：文字、资料分析、大纲、方案和 JSON 规划；按中转站要求填写 `AI_TEXT_BASE_URL=https://yzstudio.vip`，程序自动请求 `/v1/chat/completions`，默认模型为 `gpt-5.6-sol`。
- `AI_IMAGE_API_KEY`：生成 PPT、美化 PPT、AI 图片和相关页面预览图；按中转站要求填写 `AI_IMAGE_BASE_URL=https://yzstudio.vip`，普通生图请求 `/v1/images/generations`，生成 PPT 高级版的配色参考图/风格条带链路请求 `/v1/images/edits`，默认模型为 `gpt-image-2`。内容资料图片不会作为高级版成图素材。
- 两个 Base URL 同时兼容带 `/v1` 的旧写法，程序会统一处理，不会重复拼接 `/v1`。
- `AI_TEXT_PROXY_URL`、`AI_IMAGE_PROXY_URL` 默认留空，表示 Node.js 直接连接中转站；只有部署环境确实需要额外代理时才填写。
- 旧的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_PROXY_URL` 已不再被功能代码读取。
- 生成 PPT 高级版已单独验证并启用 `/images/edits`，由 `DECK_ADVANCED_REFERENCE_IMAGES=1` 控制；这不会打开 AI 清字或其他图片编辑功能。其他功能仍需独立确认后设置 `AI_IMAGE_SUPPORTS_EDITS=1`，默认不会偷偷回退到旧 Key。

管理控制台只显示两条中转链路的服务名、模型、地址和是否已配置，不会向浏览器返回密钥。修改 `.env` 后需要重新启动 `npm run dev`。

如需单独排查 ONLYOFFICE，可运行：

```powershell
npm run office:up
```

该命令会先检查 `http://localhost:18080`，未连接时会自动尝试启动 Docker Desktop，再启动 ONLYOFFICE 容器。默认访问地址为 `http://localhost:18080`。修改 `docker-compose.onlyoffice.yml` 后重新执行该命令，会自动更新容器配置。容器已允许访问本机私有地址，以便读取工作区中的 PPT 文件。

## 线上部署

员工电脑不需要安装 Docker Desktop。生产环境在一台服务器上集中运行网站与一套 ONLYOFFICE，员工只通过浏览器访问。

1. 复制 `.env.production.example` 为服务器上的 `.env.production`，填写真实域名、密钥和服务凭据。
2. 将网站域名和 ONLYOFFICE 子域名解析到同一台服务器，例如 `app.example.com` 和 `office.example.com`。
3. 在服务器执行：

```bash
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

`docker-compose.production.yml` 使用 Caddy 自动签发 HTTPS 证书。ONLYOFFICE 不直接映射宿主机端口，只经 `https://office.example.com` 由反向代理提供服务。`ONLYOFFICE_PUBLIC_URL` 与 `APP_PUBLIC_URL` 供员工浏览器访问；`APP_INTERNAL_URL` 仅供 ONLYOFFICE 容器读取 PPT 和回调保存，二者不能混用。

智能美化数字人和“图片炸开”由独立后台执行脚本处理。`npm run dev` 与生产 Compose 都会自动启动它；需要单独排查时可运行 `npm run agent:workers`。混合模式会使用方舟豆包视觉模型分析参考图、DeepSeek 规划版式、YZStudio 图片中转生成主视觉图，所有密钥仍只保留在服务端环境变量。

## 图片炸开

员工在 PPT 工作台右上角点击“图片炸开”，从 AI 预成品、素材库或本地上传中选择任意图片。系统会先给出背景、主体、装饰、卡片（整组与逐张）和文字还原层；含文字的框同时提供“无字可编辑版”和“保留原字效版”，员工可修改 OCR 文字、切换可编辑重建或保留字效，再按原坐标导入一个新 PPT 页，不会擅自增加标题或重新排版。

`npm run dev` 会启动本机拆图服务。基础服务使用 OpenCV 生成透明候选；安装 `python -m pip install -r requirements-components.txt` 后，PaddleOCR 会提供更可靠的中文文字、旋转角度和四点坐标。未安装时系统自动退回豆包视觉文字识别，不会阻断拆图。没有 GPU 时仍可查看候选，并按需点击“抠图精修”处理单个边缘；“AI 清字精修”只有在图片中转站明确支持 `/images/edits` 且员工主动点击时才可用。

### SAM3 本地分割

SAM3 是可选的本地高质量分割执行器。它的代码环境可以安装在 `.venv-sam3`，但官方权重 `facebook/sam3` 是 Hugging Face gated model，必须先登录并同意模型许可后才能下载。

```powershell
npm run components:sam3:check
.\\.venv-sam3\\Scripts\\huggingface-cli.exe login
npm run components:sam3:setup
npm run components:sam3:load-check
```

`components:sam3:setup` 下载成功后会把本机缓存中的 `sam3.pt` 路径写入 `.env` 的 `SAM3_CHECKPOINT`。如果未授权，它会明确提示去 `https://huggingface.co/facebook/sam3` 申请访问；系统不会把未生效的 SAM3 伪装成默认拆图后端。配置成功并重启 `npm run dev` 后，拆图服务会优先尝试 SAM3，失败时自动回退 OpenCV。

### Grounded-SAM2 替代后端

如果 SAM3 权重授权失败，可以先使用 Grounded-SAM2/SAM2 路线。当前系统会把豆包/视觉图层计划给出的语义框作为 grounding，再交给 SAM2 生成高质量蒙版；未来可继续接入 Grounding DINO、Florence-2 或 DINO-X 来自动修正这些框。

```powershell
npm run components:gsam2:setup
npm run components:gsam2:check
```

`components:gsam2:setup` 会安装 SAM2、下载公开 SAM2.1 checkpoint，并写入 `.env`。如果你要手动安装，也可以在 `.env` 配置：

```env
COMPONENT_EXTRACTOR_BACKEND=auto
SAM2_CHECKPOINT=C:\path\to\sam2.1_hiera_large.pt
SAM2_MODEL_CFG=configs/sam2.1/sam2.1_hiera_l.yaml
GROUNDED_SAM2_GROUNDER=vision-boxes
```

配置成功后运行 `npm run components:gsam2:load-check`。拆图服务的后端顺序是：SAM3 可用则用 SAM3；否则 Grounded-SAM2/SAM2 可用则用 SAM2；都不可用时回退 OpenCV。

开发模式会在首次访问和代码修改后现场编译。需要通过局域网流畅演示时，使用生产模式：

```powershell
npm run build -- --webpack
npm start
```

本机访问使用 `http://localhost:3000`，同一局域网的其他设备使用终端显示的 Network 地址。

## 短信配置

将 `.env.example` 中的阿里云配置填写到 `.env`。需要审核通过的短信签名、模板及访问密钥。

未配置阿里云时，只有非生产环境会返回并展示开发验证码。

## 验证

```powershell
npm run lint
npm run build -- --webpack
node scripts/visual-test.mjs
```

演示下载接口返回交付清单占位文件。正式部署时应替换为对象存储的短期授权下载地址，并为 ZIP 等客户附件接入病毒扫描。
