# PPTagent 当前项目记忆

> 当前状态核对日期：2026-09-14
>
> 这是项目功能状态的唯一当前入口。内容以源码、配置结构、数据库模型和本机验证为依据；文档中写“已实现”不等于第三方服务已经配置，也不等于每条业务链路都在本机端到端跑通。

## 文档职责

- `AGENTS.md`：必须遵守的协作、安全和编辑规则，同时保留历史变更记录；不是当前功能清单的唯一依据。
- `docs/current-project-memory.md`：当前功能、运行条件、验证结果和已知风险，后续优先更新这里。
- `docs/model-handoff.md`：新模型或新任务的阅读顺序和接手方式。
- `docs/project-control-workflows.md`：项目 owner 用来验收用户流程的业务手册。
- `docs/project-archive-2026-07-03.md`、`docs/maintenance-audit-2026-07-03.md`：历史存档和历史维护审计，只用于追溯，不代表当前状态。

## 项目定位

PPTagent/WZLCF 是一套 PPT 定制交付系统，包含两类界面：

1. 客户端：服务介绍、预算咨询、资料上传、交付跟进、修改申请和资产归档。
2. 员工工作台：学校工作区、成员审批、订单协作、在线编辑、素材库、AI 助手和 PPT 生产工具。

核心入口是 `app/page.tsx`、`app/employee/page.tsx`、`components/client-app.tsx` 和 `components/employee-app.tsx`。服务端页面与 API 在 `app/`，业务库在 `lib/`，后台执行脚本在 `scripts/`，数据模型在 `prisma/schema.prisma`。

## 当前本机基线

已确认：

- Node.js `v24.21.0`、npm `11.19.0`。
- `node_modules` 已恢复，Prisma Client 已生成。
- Python `3.10.11`，当前可以导入 OpenCV `5.0.0`。
- `prisma/dev.db` 和本地上传目录仍在，不能当作可随意清理的缓存。
- `npm run verify:check` 通过（= `tsc --noEmit` + `eslint . --max-warnings 11` + `prisma validate`），`npm run verify:build` 通过（= `next build --webpack`，74 条接口路由 + `/employee`）。
- 本机 PowerShell 执行策略禁止直接运行 `npm`/`npx` 脚本；需要时可改用 `node node_modules/<工具>/bin/...` 直调，或先执行 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`。
- Git 已初始化（2026-09-14）：基线提交 `8e2f313`，标签 `baseline`，提交 183 个文件，仓库体积约 3.29 MB。`.env`、`prisma/dev.db`、`uploads/`、构建缓存均未纳入版本控制。
- 模块化改造第 2 轮（2026-09-14）已完成 P1 清死代码：提交 `968ccc5`。`components/employee-app.tsx` 从 3753 行降到 3539 行（净删除 217 行、改写 3 行）。删除内容为不可达的 `SmartStudio` 组件（182 行，`setWorkspaceMode("smart")` 在全仓没有任何调用点，且它没有任何 CSS 规则）、`DesignStudio` 内 `{false && mentorTool === "deck" && …}` 死分支（3408 字符）、该分支专用的 7 个 `deck*` state 与 `createDeckFromMentor()`，以及 `workspaceMode` 联合类型里的 `"smart"`。业务代码路径未改动。
- 模块化改造第 3 轮（2026-09-14）已建立 P2 主干层：提交 `812be37`，新增 `lib/employee-api.ts`。它把员工端全部接口的路径、HTTP 方法与 body 形态集中到唯一入口 `employeeApi`（含 `session` / `admin` / `orders` / `documents` / `deck` / `polish` / `design` / `explode` / `ai` / `images` / `tools` / `urls` 分组，共 51 个方法）。只导出一个命名空间对象，避免与组件内同名 state 遮蔽（首版导出 15 个同名对象时，`deckRuns` / `polishRuns` 正好被 `DesignStudio` 的局部数组变量遮蔽）。
- **本轮 `components/employee-app.tsx` 未改动**，仍在直接调用 `fetch`。调用点迁移改为在 P3–P5 拆组件时按模块增量完成 —— 原因见下条。
- 失败教训（2026-09-14）：尝试用正则脚本一次性改写 `employee-app.tsx` 的全部 60 处 `fetch` 调用时，脚本截断了跨行的 `JSON.stringify(...)` 实参、误删了 `lucide-react` 与 `react` 两个 import、并破坏了两处 `cancelRun` / `saveSelection` 调用。该文件已用 `git restore` 整体还原，未提交任何残缺状态。**结论：对 3000 行以上、含超长单行的文件，禁止用正则全量改写；必须按行范围局部编辑并逐步 `tsc` 验证。**
- 模块化改造第 4 轮（2026-09-14）已完成 P3 第一批抽取：提交 `1eab9ef`。新建 `lib/employee-image-urls.ts`（图片地址拼装）、`lib/employee-image-tools.ts`（blob/dataURL/PNG/canvas 转换与剪贴板）、`components/employee/image-preview-modal.tsx`（图片放大预览弹窗）。`components/employee-app.tsx` 从 3539 行降到 3422 行，diff 为**新增 3 行（import）+ 删除 113 行**，无逻辑改动。
- `components/employee/` 目录就此建立，作为后续所有从员工工作台拆出的组件（树枝）的落点。每个新组件文件顶部都写明「职责 / 谁可以改 / 依赖 / 被谁用 / 验证方式」，新增组件若使用 `<img>` 需沿用文件级 `eslint-disable @next/next/no-img-element`。
- 本轮两次修正值得记住：① 抽取前必须逐个确认工具函数的**真实引用面**，`PptPasteTray` 就是因依赖被别处共用而暂缓；② 新组件引入的 `no-img-element` 警告会被 `--max-warnings 11` 这道门拦住（本轮确实拦到了），这是预期行为。
- 第 3 轮的验证方式（可复用）：用 `node --experimental-strip-types` 直接加载 `lib/employee-api.ts`，替换 `globalThis.fetch` 后逐个调用全部方法，断言 URL、HTTP 方法与 `cache: "no-store"` 是否符合预期；再把生成的路径与 `app/api/**/route.ts` 的真实路由对账。
- 本轮运行验证：临时启动 Next 开发服务（独立 `NEXT_DIST_DIR=.next-smoke`、端口 3211），`/` 与 `/employee` 均返回 200，`brand/wzlcf-mark.png` 与 `agent/ppt-design-mentor.png` 均返回 200；页面中已不再出现「即将接入」等死分支文案。验证后已停止服务、删除 `.next-smoke/`，并还原被开发服务自动改写的 `tsconfig.json` 与 `next-env.d.ts`。
- 已知格式问题：仓库内有 15 个文件是 CRLF 与 LF 混用（`employee.css` 48 处、`deck-generation-worker.mjs` 110 处等）。用脚本改写这些文件时会触发整文件 diff 噪音；比对差异应使用 `git diff --ignore-cr-at-eol`。`employee-app.tsx` 已在第 2 轮统一为 LF。
- 当前 `docker info` 不能连接 Docker daemon；因此完整 `npm run dev` 会在 `scripts/ensure-onlyoffice.mjs` 阶段失败，原因是 ONLYOFFICE 前置服务未就绪，不是 Next.js 编译错误。

本机改动后的统一验证门（任何改动都必须先跑这一条）：

```powershell
npm run verify
```

拆开使用：

```powershell
npm run verify:check   # 静态检查，秒级，改代码过程中随时跑
npm run verify:build   # 生产构建，分钟级，交付前跑
```

本机恢复依赖后的基础验证命令：

```powershell
npm ci --cache .npm-cache --registry=https://registry.npmmirror.com
npm run db:init
npx prisma generate
npm run verify
```

只调 Next、设计任务、生成 PPT 和美化 PPT 时使用：

```powershell
npm run dev:lite
```

需要在线编辑、图片炸开和组件拆图时，先启动 Docker Desktop，再使用：

```powershell
npm run dev
```

## 功能状态

状态含义：

- **代码已实现**：页面、API、数据库或后台脚本存在。
- **本机已验证**：本次或已有自动化验证实际通过。
- **外部条件**：还依赖 Docker、API 密钥、公网回调、模型权重或第三方额度。

### 客户端

- **代码已实现**：手机号验证码登录、五档预算咨询、文字消息、资料附件、服务交付、修改申请、资产归档和设置。
- **后端约束已实现**：附件数量/大小、完成订单才可转资产、资产唯一性、修改消息和服务权限检查。
- **限制**：开发环境可使用测试验证码；正式短信、对象存储、病毒扫描、短期授权下载仍需生产配置。没有真实工作文稿时，下载接口仍有演示占位文件逻辑。

### 员工登录与权限

- **代码已实现**：普通微信与企业微信双入口、学校选择、待审批成员、角色、逐项功能权限、停用会话清理和管理员控制台。
- **权限边界已实现**：服务端会检查成员状态、学校边界、负责人范围和功能权限，不能只依赖前端隐藏按钮。
- **外部条件**：真实扫码需要微信开放平台/企业微信凭据、HTTPS 回调域名和相应通讯录配置；本地 `WECHAT_DEV_BYPASS` 只能用于开发，生产必须关闭。
- **设备范围**：员工工作台目前在小于 900px 的屏幕上阻止进入，不是完整移动端工作台。

### 工作台与 ONLYOFFICE

- **代码已实现**：工作文稿、版本保存、PPTX 上传/替换、交付版本复制、ONLYOFFICE 配置回调、图片提取/插入和图片桥接插件。
- **外部条件**：本机必须有 Docker Desktop 和 ONLYOFFICE 容器；生产必须配置 `ONLYOFFICE_JWT_SECRET`，不能依赖开发默认值。
- **已知风险**：图片桥接队列在进程内存中，多实例或重启可能丢任务；文件目前主要保存在本地卷。

### AI 助手、生图和素材

- **代码已实现**：订单关联 AI 会话、生图任务、预览/下载、素材收藏和拖入工作区。
- **代码中的供应商**：ARK/DeepSeek/Doubao、YZStudio 文字中转、ARK Seedream、YZStudio 图片中转；文字 Key 与图片 Key 分离且只在服务端读取。
- **限制**：普通生图仍由 Next 请求触发进程内异步执行，不是可靠的持久化队列；重启或多实例可能留下 `processing` 任务。图片编辑/AI 清字还受 `AI_IMAGE_SUPPORTS_EDITS` 和供应商接口支持限制。

### 生成 PPT

- **代码已实现**：PDF、DOCX、XLSX、PPTX、文本和图片资料解析；来源证据；快速/高级方案；方案确认；逐页 16:9 预览图；单页重生成；贴近上一页；PDF 和 PPTX 导出。
- **真实路线**：资料解析和 GPT 文字规划 → Image2 页面 PNG → PDF → Codia `pdf_to_ppt`。最终 PPTX 不是原生排版，文字和元素可编辑性取决于 Codia 转换结果。
- **限制**：需要 YZStudio/图片模型/Codia 配置和额度；模型、网络或余额失败不能算作代码链路已完成。部分旧 UI 的页数提示仍需继续核对。

### 美化 PPT

- **代码已实现**：PPTX 上传或使用当前文稿、整体与逐页要求、方案确认、逐页预览、单页重生成、贴近上一页、PDF/PPTX 导出。
- **后台脚本**：`scripts/ppt-polish-worker.mjs`；接口位于 `app/api/employee/services/[id]/ppt-polish/`。
- **限制**：目前主要使用 JSON 任务文件而非统一 Prisma 任务表；心跳和任务目录的生产路径、锁、清理和恢复机制仍需加强；只支持 `.pptx`。

### 图片工具、图片转 PPT、图片炸开

- **代码已实现**：智能抠图、PPTX 图片提取、图片导入、图片转 PDF/PPTX、图片炸开任务、候选部件、OCR 文字层、精修、清字和重建回写接口。
- **当前入口事实**：独立图片炸开后端和后台脚本存在，但员工智能模式中的旧 `openExplode()` 入口曾被停用，不能仅凭后端存在就宣称用户能从当前界面完成完整流程。
- **可选后端**：OpenCV 基线、PaddleOCR、SAM3、Grounded-SAM2/SAM2；高级后端依赖 Python 包、模型权重、GPU 或外部服务。
- **优先风险**：图片转 PPT 下载应进一步绑定数据库中的订单/文件记录或一次性签名令牌，不能只凭客户端传入的文件名读取目录。

## 外部配置状态

代码和 `.env` 模板支持 AI、Codia、ONLYOFFICE、微信/企业微信、短信和图片处理配置。密钥不在本文记录。判断功能是否可用时分四层：

1. 代码路径是否存在。
2. 本地 npm/Python/Docker 依赖是否存在。
3. `.env` 是否配置且重启后生效。
4. 第三方网络、模型权限、额度和回调是否真实可用。

任何一层未满足，都只能写“代码已实现”或“待配置”，不能写成“生产可用”。

## 当前改进优先级

1. 让完整开发模式先恢复 Docker/ONLYOFFICE，并补一次端到端验证。
2. 将普通生图和美化任务改为可恢复、可超时、可清理的持久化任务系统。
3. 修正图片转 PPT 的文件归属与下载令牌，强化生产文件访问控制。
4. 整理图片炸开、旧 SmartStudio 和历史死代码入口，明确当前可用入口。
5. 统一员工端视觉主题，并决定是否正式支持移动端。
6. 建立上传文件、孤儿文件、失败任务、过期任务和本地数据库的备份/清理策略。
7. 将客户重新验证手机号和正式对象存储/病毒扫描补成真实生产流程。

## 更新规则

- 新功能完成后先更新本文件的状态和验证日期，再更新详细业务验收手册。
- 历史故障放到对应文档的日期记录，不要把旧结论改写成当前状态。
- 任何“已完成/可用”必须注明是源码存在、本机验证，还是外部服务已验收。
- 不在本文件写真实 API Key、手机号、客户正文、上传文件内容或可复用令牌。
