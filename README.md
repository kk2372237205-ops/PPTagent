# WZLCF · PPTagent

面向 PPT 定制交付团队的生产工作台。它把客户咨询、订单协作、在线编辑、素材管理、AI 方案规划、逐页预览与文件交付串成一条可检查、可返工的流程，而不是把生成结果直接交给用户。

项目有两类界面：

- **客户端**：服务介绍、预算咨询、资料上传、交付跟进、修改申请和资产归档。
- **员工工作台**：成员与权限、订单协作、ONLYOFFICE 在线编辑、素材库，以及「小 W · PPT 智能模式」。

> 仓库不包含真实密钥、数据库或业务上传文件。接入第三方服务前，请先配置本地 `.env`。

## 现在能做什么

### 生成 PPT

- 快速版可从简短需求开始（测试阶段，勿用）；高级版可读取 PDF、Word、Excel、PPT、文本和图片资料，整理为逐页方案。
- 用户先审阅并确认方案，再生成 16:9 单页预览图；预览图支持放大、单页重新生成和贴近上一页。
- 用户确认预览后，才进入 PDF / PPTX 转换。高级版资料最多 30 份、合计 500MB，页面生成并发由环境变量控制。

### 美化 PPT

- 上传 PPTX 或使用当前文稿，填写整体方向和逐页修改要求，先生成方案、确认后再逐页美化。
- 系统将原始 PPT 转为对应页 PNG；每次美化会把**该页原图**与用户填写的要求一对一提交给图片模型，避免只靠抽取文字重绘。
- 美化提示词只来自用户主动提供的整体方向、逐页要求、保护项、夹子和返工指令；代码不会额外塞入“默认写实”“强插图”等隐藏画面要求。
- 全部预览通过后，可导出 PDF 或 PPTX；失败页面可单独重新生成。

### 生图

生图分为两种明确模式：

- **文生图模式**：只使用用户文字要求和主动套用的夹子；界面不显示参考图上传入口，服务端也会拒绝携带参考图的请求。
- **混合模式**：必须上传参考图，支持一次上传 1–6 张 PNG、JPEG 或 WebP 图片。

两种模式都共用「夹子」：在美化 PPT 中创建的夹子会在生图中出现，反之亦然。界面只显示已套用夹子的名称，实际生成时会带上对应内容；用户可随时取消套用。当前生图任务提交给图片模型的文字就是用户输入加上所选夹子的内容，不会再自动附加画面规则。

### 其他生产工具

- 图片转 PPT：将图片交给 Codia 转为 PPTX。
- 图片工具：智能抠图、PPT 图片提取、图片变清晰等。
- 图片炸开：将页面拆成背景、主体、装饰、卡片和文字层；员工可决定是否重建、清字或回填，不会自动破坏原图。

### 团队与数据边界

- 员工端支持普通微信与企业微信扫码；首次加入默认待审批。
- 支持整套软件管理员、学校管理员、负责人、设计师、审核员和普通成员，以及逐项功能权限。
- 学校工作区彼此隔离；所有 AI 密钥和第三方凭据只保留在服务端。

## 关键流程

```text
填写需求 / 上传资料
        ↓
生成或美化方案
        ↓ 用户确认
逐页 16:9 预览图生成
        ↓ 用户检查、返工或确认
PDF / PPTX 转换与交付
```

生成 PPT、美化 PPT 都必须经过方案确认和预览确认。生成中的任务会显示排队、处理中、成功或失败状态；失败不应被伪装成“已完成”。

## 技术结构

```text
Next.js 16 + React 19 页面与接口
        ↓
Prisma + SQLite（订单、成员、权限、任务状态）
        ↓
后台执行脚本（生成 PPT / 美化 PPT / 生图 / 图片炸开）
        ↓
YZStudio（文字与图片）/ Codia / ONLYOFFICE / 可选本地图像能力
```

- `app/api/**`：服务端接口。
- `components/employee/**`：员工工作台各业务面板。
- `lib/employee-api.ts`：员工端接口路径、方法和请求体的统一入口。
- `lib/use-smart-studio-runs.ts`：智能模式任务状态与请求编排。
- `scripts/workers/`：按生成 PPT、美化 PPT、生图和图片炸开拆分的后台执行脚本。
- `skills/deck-generation/`：只服务于「生成 PPT」的提示词规则；美化 PPT 与生图不读取该目录的画面规则。

## 本地启动

### 前置条件

- Node.js、npm 与项目依赖。
- 完整员工工作台联调需要 Docker Desktop（用于 ONLYOFFICE）。
- 需要把 PPT 本地转为页面 PNG 时，配置 Poppler 的 `pdftoppm` 绝对路径。

### 第一次运行

```powershell
Copy-Item .env.example .env
npm install --cache .npm-cache --registry=https://registry.npmmirror.com
npm run db:init
npm run dev
```

打开 `http://localhost:3000`，员工工作台为 `http://localhost:3000/employee`。开发环境客户端验证码默认是 `123456`。

`npm run dev` 会检查并启动 ONLYOFFICE；Docker 未安装或编辑器不可用时会明确失败。若只调智能模式，可使用：

```powershell
npm run dev:lite
```

轻量模式启动 Next、生图、生成 PPT 和美化 PPT 的后台执行脚本，但不替代带 ONLYOFFICE 与图片炸开检查的完整开发模式。

常用独立命令：

```powershell
npm run office:up            # 检查 / 启动 ONLYOFFICE
npm run agent:workers        # 启动全部后台执行脚本
npm run ppt-polish:worker    # 只排查美化 PPT 后台执行脚本
npm run components:worker    # 只排查图片炸开后台执行脚本
```

## 必要配置

`.env.example` 是完整模板；不要提交真实 `.env`、`prisma/dev.db`、`uploads/` 或构建缓存。

| 配置项 | 用途 |
| --- | --- |
| `DATABASE_URL` | 本地 SQLite 数据库地址。 |
| `AI_TEXT_API_KEY` / `AI_TEXT_BASE_URL` | 文字资料分析、方案与结构化规划。默认模型为 `gpt-5.6-sol`。 |
| `AI_IMAGE_API_KEY` / `AI_IMAGE_BASE_URL` | 页面生图、生成 PPT 预览图与美化 PPT 预览图。默认模型为 `gpt-image-2`。 |
| `AI_IMAGE_SUPPORTS_EDITS=1` | 美化 PPT 必需；确认中转站已支持 `/images/edits` 后才开启。 |
| `CODIA_API_KEY` | 图片转 PPT、确认预览后的 PPTX 转换。 |
| `ONLYOFFICE_URL` / `ONLYOFFICE_INTERNAL_URL` | 浏览器与容器访问 ONLYOFFICE 的地址。 |
| `PDFTOPPM_PATH` | Poppler `pdftoppm` 的绝对路径，用于 PPT 转 PNG。 |
| `WECHAT_*` / `WECOM_*` | 员工微信 / 企业微信扫码登录与学校工作区配置。 |

文字和图片中转使用两把不同的 Key，不能混用。`*_BASE_URL` 填服务根地址，`*_PROXY_URL` 只有确实需要本地代理时才填写；不要把 API 服务地址错误填入代理变量。

本地演示管理员控制台可临时设置 `WECHAT_DEV_BYPASS=1`；生产环境必须关闭。真实扫码还需要在微信开放平台或企业微信中配置 HTTPS 回调域名。

## 验证与交付

开发中可先执行静态检查：

```powershell
npm run verify:check
```

提交或合并前必须执行完整验证：

```powershell
npm run verify
```

这会检查风格包一致性、TypeScript、ESLint（零警告）、Prisma 和 Webpack 生产构建。涉及界面时，还应使用以下脚本和实际浏览器完成视觉验收：

```powershell
npm run visual:employee
npm run visual:themes
```

生产部署使用 `.env.production.example` 配置环境变量，并通过 `docker-compose.production.yml` 启动网站、ONLYOFFICE 与反向代理。员工电脑只需浏览器，不需要安装 Docker。

## 文档导航

- [当前功能与运行条件](docs/current-project-memory.md)
- [项目 owner 验收流程](docs/project-control-workflows.md)
- [新模型接手说明](docs/model-handoff.md)
- [目录地图](docs/project-map.md)
- [功能到文件对照](docs/feature-file-map.md)
- [历史记录](docs/archive/agents-history.md)

## 协作与版本控制

- `main` 只保存已经验证、可随时恢复的版本；新功能或独立修复使用 `codex/<功能名>` 分支。
- 合并前至少运行 `npm run verify`；界面改动还需完成功能与视觉验收。
- `lib/employee-api.ts`、共享类型、权限与智能模式编排属于主干层，同一时间只由一人修改；业务面板和按模式拆分的后台执行脚本可分别开发。
- 不要将 `.env`、真实密钥、数据库、上传文件或生成缓存提交到 Git。

详细协作边界见 [AGENTS.md](AGENTS.md)。
