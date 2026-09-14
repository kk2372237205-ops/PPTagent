# WZLCF 项目协作规则

> 本文件只放**必须遵守的规则和安全边界**，力求短到能被 AI 完整读进上下文。
> 历史变更记录已移到 `docs/archive/agents-history.md`；
> 当前功能与运行条件看 `docs/current-project-memory.md`；
> 业务验收流程看 `docs/project-control-workflows.md`；
> 新模型接手顺序看 `docs/model-handoff.md`。

## 目录职责（改代码前先看这里）

| 目录 | 放什么 | 谁可以改 |
| --- | --- | --- |
| `app/api/**` | 74 条服务端接口，一条接口一个 `route.ts` | 按功能分刀，一次一个目录 |
| `lib/employee-api.ts` | 员工端接口主干：路径、方法、body 都只在这里 | **主干层，一次只允许 1 人改** |
| `lib/employee-api-types.ts` | 35 个共享数据类型 | 主干层 |
| `lib/employee-permissions.ts` | 角色/功能中文名与默认权限 | 主干层；改完必须核对 `lib/employee-auth.ts` |
| `lib/employee-auth.ts` | 会话、学校边界、角色、功能权限的唯一判断处 | **主干层，改权限只能改这里** |
| `lib/use-smart-studio-runs.ts` | 智能模式三条链路的状态与请求编排 | 主干层 |
| `components/employee/*.tsx` | 从工作台拆出的各个业务面板（每块一个文件） | **可以分别派人改** |
| `components/employee-app.tsx` | 只剩壳、常量与 4 处 design-agent 调用 | 只做小改，不要再往里堆功能 |
| `app/employee/employee.css` | 样式入口，只有 `@import` 列表 | 不要往这里加规则 |
| `app/employee/styles/*.css` | 按模块拆开的样式，顺序由入口文件固定 | 只改自己模块那份 |
| `scripts/*.mjs` | 后台执行脚本，互相不 import | **可以分别派人改** |
| `skills/deck-generation/**` | 生成 PPT 的提示词规则 | 改提示词优先改这里 |

## 派活模板（给别人或给 AI 派任务时照抄）

```
任务：只修改【某个具体功能】
允许改：components/employee/<模块>.tsx 第 N-M 行
        app/employee/styles/<模块>.css 末尾追加（不得修改已有规则）
禁止改：prisma/ lib/employee-auth.ts scripts/ 其他模块目录 任何 .env
验证：npm run verify 必须全绿，并把输出贴出来
交付：改了哪几行 + 一行 diff 摘要 + 你确认没动的东西清单
```

## 分支规则

- `main` 只保存已验证、可随时恢复的版本；不直接在 `main` 上开发新功能。
- 一个新功能或独立修复开一条分支，开发过程只提交该分支。
- 合并前至少跑 `npm run verify`；涉及界面还要做视觉验收。
- `.env`、`prisma/dev.db`、`uploads/`、构建缓存禁止提交。

# 项目说明与功能边界

> 下面这部分是项目定位、运行方式与各功能的**业务规则**（什么该做、什么不该做）。
> 历史变更记录见 `docs/archive/agents-history.md`。

## 项目目标

这是一个 PPT 代做服务网站，已从客户端模式扩展到员工工作台与智能 PPT 生产工作流。品牌名为 `WZLCF`，客户端仍保持精致、美观、有品牌官网质感；员工工作台当前改为石墨黑深色模式，避免普通后台模板风格，也避免过强的“赛博蓝”观感。

员工模式已进入核心开发阶段，包含订单工作台、ONLYOFFICE 编辑器、素材库、AI 创作助手、智能模式、生成 PPT、美化 PPT、生图、图片转 PPT 和图片工具。

## 技术栈

- Next.js 16、React 19、TypeScript
- Prisma 6、SQLite
- Framer Motion
- npm
- 开发缓存目录为 `.next-dev`，生产构建目录为 `.next`
- `npm run dev` 使用 Webpack，避免当前环境下 Turbopack 水合问题
- ONLYOFFICE 用于员工侧 PPT 在线编辑
- YZStudio 文字/生图中转、DeepSeek、豆包/方舟、Codia 等外部能力均必须经服务端调用，密钥不能暴露到浏览器

## 本地运行

```powershell
npm install --cache .npm-cache --registry=https://registry.npmmirror.com
npm run db:init
npm run dev
```

- 本机访问：`http://localhost:3000`
- 局域网访问：`http://10.130.178.92:3000`
- 客户端开发验证码：`123456`
- 员工模式地址：`http://localhost:3000/employee`
- 员工模式已取消手机号、验证码和员工码登录，当前提供微信/企业微信双扫码入口，默认普通微信。
- 本地调试管理员控制台时可临时设置 `WECHAT_DEV_BYPASS=1`，生产环境禁止开启。
- 只调智能模式时可用轻量命令：

```powershell
npm run dev:lite
```

- `dev:lite` 启动 Next、旧生图 worker、生成 PPT worker、美化 PPT worker；完整联调仍使用 `npm run dev`
- 流畅演示使用：

```powershell
npm run build -- --webpack
npm start
```

## 已实现功能

### 客户登录

- 手机号验证码无密码登录，新手机号验证后自动注册。
- 默认勾选“记住我”，登录会话有效 60 天。
- 腾讯云短信接口已接入统一适配层；未配置凭证时，开发环境显示测试验证码。
- 登录页左侧有多张 PPT 页面从下向上升起并组合的动画。
- 登录状态由服务端首屏读取，避免加载闪屏。
- 已允许 `localhost`、`127.0.0.1` 和 `10.130.178.92` 加载开发交互资源。

### 员工微信扫码登录与权限

- 员工入口 `/employee` 提供普通微信和企业微信双扫码登录，默认显示普通微信；不再接受员工手机号、短信验证码或员工码。
- 真实扫码需要微信开放平台“网站应用”的 `AppID`、`AppSecret` 与 HTTPS 回调域名，不需要学校企业微信管理员。
- 企业微信入口需要学校管理员创建自建应用，提供 `CorpID`、`AgentID`、`Secret` 与可信 HTTPS 回调域名；未配置的学校会明确显示待配置。
- 用户扫码前选择申请加入的学校；普通微信只能证明微信身份，不能自动证明其学校归属。
- 第一次扫码默认建立待审批成员，管理员人工核验学校身份后再批准；审批前不能看到订单、客户资料或生产工具。
- 管理控制台支持成员审批/停用、角色设置、逐项功能权限和使用情况统计。
- 角色包括整套软件管理员、学校管理员、负责人、设计师、审核员和普通成员。
- 功能权限包括订单、客户消息、团队、在线编辑、AI 助手、智能 PPT、素材库、图片工具和导出。
- 普通学校管理员和成员只能访问本校数据；整套软件管理员可跨学校管理。
- 多学校使用 `EMPLOYEE_ORGANIZATIONS_JSON`；同一套微信网站应用可复用，学校身份仍由管理员确认。
- 微信 `AppSecret` 只能保存在服务端环境变量，不能返回浏览器。
- 两种登录方式共用学校成员、审批、角色、功能权限和会话系统，管理台会分别显示两条登录链路的配置状态。
- 关键文件：`lib/wechat.ts`、`lib/wecom.ts`、`lib/employee-workspaces.ts`、`lib/employee-auth.ts`、`app/api/employee/auth/wechat/`、`app/api/employee/auth/wecom/`、`app/api/employee/admin/`。

### 品牌视觉

- 主题色为藏青与浅蓝。
- 左上角品牌槽位已使用：
  `public/brand/wzlcf-mark.png`
- 标志旁显示 `WZLCF / Presentation Studio`。
- 原始标志来自用户提供的橙色 PPT 图标。
- 员工工作台最新方向为石墨黑深色模式：深灰黑背景、暖白文字、低饱和钢蓝/鼠尾草绿按钮、少量香槟金强调。
- 工作台配色修改主要集中在 `app/employee/employee.css` 的 Graphite workbench theme 和后续精修覆盖层。
- 工作台不应回到高饱和亮蓝、紫蓝渐变或满屏香槟金；香槟金只用于品牌小字、少量选中边框和重点提示。

### 左侧导航

- 服务介绍
- 套餐服务
- 服务交付
- 资产
- 左下角设置

### 员工工作台

- 员工入口为 `/employee`，包含订单顶部栏、左侧设计素材库、ONLYOFFICE 编辑区、右侧 AI 创作助手、底部素材栏和智能模式入口。
- `npm run dev` 会检查并启动 ONLYOFFICE；未满足条件时应明确失败，不要静默启动缺少编辑器的模式。
- `npm run office:up` 可单独排查 ONLYOFFICE。
- 工作台页面视觉要求高，任何新增交互都要保持石墨黑分层、暖白文字、低饱和按钮和克制强调色。
- ONLYOFFICE 内部白色画布和原生工具栏不做强行深色化，外壳和自研面板保持工作台主题。
- 关键流程必须同步维护 `docs/project-control-workflows.md`，用项目 owner 能验收的语言说明入口、填写内容、确认点、预览、返工按钮、最终交付物和真实文件位置。

### 智能模式

- 智能模式面板名为 `小 W · PPT 智能模式`。
- 顶部任务类型包括：生成 PPT、美化 PPT、生图、图片转 PPT。
- 生成 PPT 与美化 PPT 都要遵循“先出方案、用户确认、再生成预览图、最后转 PPT”的链路，避免一条龙直接输出导致不可控。
- 生成出来的预览图应支持点击放大预览。
- 预览卡片下方的“重新生成本页”和“更贴近上一页”按钮必须真实触发对应页面重新生成，而不是只转圈。

### 生成 PPT

- 生成 PPT 分为快速版和高级版，但两者最终都继续通过 YZStudio 图片中转的 `gpt-image-2` 生成完整 16:9 页面图片，不改成混合排版路线。
- 快速版保留少填写和页数选择，但必须真实读取上传资料、保留来源位置、自动组织完整且信息密度合理的逐页方案，用户确认方案后才生成预览。
- 高级版由用户决定每页大标题，也可继续规定小标题和想讲的内容；系统读取最多 30 份、合计 500MB 的 PDF、Word、Excel、PPT、文本和图片资料。
- 高级版由 GPT-5.6 按用户大纲从文字资料中逐页取材，一次生成包含页面任务、正文、结论、来源和画面方向的完整方案；用户只确认这一份方案，确认后才开始生图。
- 内容资料图片只在普通解析文字不足时用于 GPT-5.6 OCR/语义补救，不提取、不裁切、不复用为页面素材，也不交给 Image2。配色参考图仍只控制颜色关系。
- 高级版初次生成每页只调用一次 Image2，最多 6 页并发，不做逐页 GPT 看图或自动返工；全部页面完成后只做一次后台交付安全检查，只有致命异常才提示。
- 用户可选择内置配色或上传配色参考图；参考图只提取背景、文字、强调色和比例关系，不照抄版式。
- 页面内容要保留来源文件和页码、幻灯片号或工作表位置，数字、日期和专名不能脱离已读取资料。
- 用户确认预览后再生成 PPT/PDF；不要在方案或内容未确认时直接进入最终转化。
- 卡片样式统一、装饰元素统一默认不勾选，避免用户无感触发过度约束。

### 美化 PPT

- 美化 PPT 已改为区别于生成 PPT 的流程：上传/使用当前 PPTX，填写整体修改方向和逐页修改想法，生成美化方案，经确认后逐页生成 16:9 预览图，再由用户决定转 PPT。
- 美化 PPT 的后端接口位于：
  `app/api/employee/services/[id]/ppt-polish/runs`
  以及其下的 `confirm`、`retry`、`slides/[slideIndex]/image`、`slides/[slideIndex]/regenerate`、`pdf`、`ppt`。
- 美化 PPT worker 为 `scripts/ppt-polish-worker.mjs`，健康检查在 `lib/ppt-polish-worker-health.ts`。
- `npm run dev`、`npm run dev:lite` 和 `npm run agent:workers` 都应包含美化 PPT worker。
- 美化 PPT 生成页图时并发数为 2；排队和生成中的预览卡都要有动态反馈。
- 封面页和结尾页应强情绪、少文字、风格突出；中间页要保持统一色彩、统一版式语言和上下文连贯。
- 预览区不应在用户什么都没写、没有确认方案时展示“生成页面中”的旧占位栏。

### 图片转 PPT

- 智能模式工具栏加入“图片转 PPT”，位置在第二项。
- 入口支持将图片拖拽到上传区域，调用 Codia 进行图片到 PPTX 的转换。
- UI 应与智能模式整体风格统一，上传区清晰、好拖拽、可展示当前文件状态。

### 图片工具与图片炸开

- 图片工具包含智能抠图、PPT 提取、图片变清晰等能力。
- 图片炸开/组件拆图保留独立流程，按需使用 OpenCV、PaddleOCR、SAM3、Grounded-SAM2/SAM2 等后端。
- 任何清字、精修、重建类操作都应由员工主动触发，不能自动破坏原图或原 PPT。

### 服务介绍

- 杂志式服务介绍布局。
- 服务流程、质量保障和在线 PPT 样品。
- 样品有翻页动画和动态水印，不暴露原始 PPT/PDF。

### 套餐与咨询

五档预算：

- `600~2000`
- `2000~5000`
- `5000~8000`
- `8000~10000`
- `10000+`

每档预算进入独立咨询会话，支持文字和附件。附件支持 PPT/PPTX、PDF、Word、Excel、PNG/JPG、ZIP；每次最多 5 个，总计不超过 100MB。

当前是人工客服占位，不自动生成 AI 回复。

### 服务交付

- 展示服务编号、购买时间、价格、进度、状态和 PPT 封面。
- 状态包括：制作中、待客户确认、修改中、已完成。
- 内置演示订单。
- 项目封面根据服务编号固定映射，确保交付页与资产页封面一致。

修改规则：

- 点击“申请修改”进入该服务关联的原咨询会话。
- 服务端自动发送客服消息：
  `您好，了解到您需要修改PPT，麻烦告知一下具体的修改意见，我这边及时调整。`
- 不为客户预填或发送默认文字，输入框必须保持空白。

资产规则：

- 只有状态为“已完成”的订单可以“转为资产”。
- 每个订单只能保存一次资产。
- 数据库中 `Asset.serviceId` 有唯一约束。
- 页面显示“已转为资产”后按钮禁用。
- 后端必须同时拦截未完成订单和重复保存请求，不能只依赖前端。

### 资产

- 保存成功后，点击左侧“资产”即可看到对应订单。
- 显示与服务交付页一致的 PPT 封面预览。
- 显示服务编号、当前状态、保存时间和版本数量。
- 已完成资产支持授权下载占位文件。
- 删除资产不会删除原服务与交付记录。
- 资产在账号有效期间长期保存。

### 设置

- 脱敏手机号与注册时间。
- 重新验证手机号。
- 登录设备与撤销其他会话。
- 页面动画开关。
- 消息提醒开关。
- 退出登录。

## 数据模型

Prisma 模型包括：

- User
- VerificationCode
- Session
- Consultation
- Message
- Attachment
- Service
- DeliveryVersion
- RevisionRequest
- Asset
- Organization
- Employee
- EmployeeMembership
- EmployeeSession
- EmployeeLoginEvent

SQLite 初始化脚本为：

```text
scripts/init-db.mjs
```

## AI 中转 API 方向

项目已经开始在员工智能模式中接入多类 AI 能力。未来继续扩展时仍遵守：

- 原来使用 ChatGPT Key 的文字功能统一使用 YZStudio 文字中转：`AI_TEXT_API_KEY`、`gpt-5.6-sol`。
- 原来使用 ChatGPT Key 的生图功能统一使用 YZStudio 图片中转：`AI_IMAGE_API_KEY`、`gpt-image-2`。
- 两把 Key 不得混用；旧 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_PROXY_URL` 不再作为兼容回退。
- 套餐咨询 AI 客服
- PPT 需求分析
- 文案与大纲生成
- PPT 封面及配图生成
- 生成 PPT 和美化 PPT 的方案规划、页面生成、局部重生成
- 图片工具、图片炸开、图片转 PPT 的辅助分析与转化

API Key 只能放在服务端环境变量中，不能暴露到浏览器前端。中转站没有确认支持的接口不能靠猜测接入，也不能静默回退旧供应商。

## 验证命令

```powershell
npm run lint
npm run build -- --webpack
```

视觉和交互测试脚本：

```powershell
node scripts/visual-test.mjs
node scripts/employee-visual-test.mjs
```

## 协作约束

- 禁止批量删除文件或目录。
- 不得使用 `del /s`、`rd /s`、`rmdir /s`、`Remove-Item -Recurse`、`rm -rf`。
- 删除文件时只能一次删除一个明确路径。
- 页面修饰和美化非常重要，所有新增页面必须延续藏青与浅蓝设计系统。
- 员工工作台新增功能必须延续当前石墨黑深色模式，不要重新引入高饱和赛博蓝或紫蓝渐变。
- 以后描述核心流程时，不要只用 `worker`、`run`、`slide` 等工程词；必须同时给出中文业务说法，例如“后台执行脚本”“一次生成任务”“单页预览图任务”。
- 优先保证桌面与手机响应式效果。
- 不要恢复青绿橙色主题；橙色仅保留在用户提供的品牌图标中。
- 用户偏好简短回答，但实际开发任务应完整实施并验证。


## Git 分支发布规则

- `main` 只保存已经完成验证、可以随时恢复和部署的稳定版本；禁止直接在 `main` 上开发新功能。
- 每次开始一个新功能或独立修复，必须先从最新 `main` 创建一个 `codex/<功能名>` 分支，再开始修改。
- 开发过程只提交并推送当前功能分支，不得提前把未验证代码推入 `main`。
- 功能分支至少通过与改动风险相匹配的检查；**统一使用 `npm run verify`**（= `tsc --noEmit` + `eslint . --max-warnings 11` + `prisma validate` + `next build --webpack`）。涉及界面时还要完成对应视觉与交互验收。
- `npm run verify:check` 只跑静态检查，改代码过程中随时可用；`npm run verify:build` 只跑生产构建，交付前必跑。
- eslint 的 11 条历史警告（全部在 `scripts/design-agent-worker.mjs`）是基线；`--max-warnings 11` 会拦住任何新增警告。
- 功能确认稳定后再合并到 `main` 并推送；合并后保留功能分支作为开发记录，除非项目 owner 明确要求删除。
- `.env`、API Key、`prisma/dev.db`、`uploads/`、`.codex-tmp/`、构建缓存和本地生成文件禁止提交或上传。
- 项目 owner 不需要操作 Git 命令。以后只需说明要开发的功能，Codex 负责创建分支、验证、提交、推送，并在准备合并 `main` 时说明验证结果。

## 版本控制基线（2026-09-14）

- 仓库已于 2026-09-14 初始化：基线提交 `8e2f313`，标签 `baseline`，183 个受控文件，仓库体积约 3.29 MB。
- 基线状态：`npm run verify` 全绿（tsc 通过、eslint 0 error / 11 warning、prisma validate 通过、webpack 生产构建通过）。
- 未纳入版本控制（按 `.gitignore`）：`.env`、`prisma/dev.db`、`uploads/`（约 6.4 GB 业务与创作文件）、`node_modules/`、`.next*`、`.npm-cache/`、`.artifacts/`、`tmp/`、`__pycache__/`。
- **重要**：`uploads/` 不在 Git 里，因此没有版本回退保护；它包含客户资料、工作文稿和生成结果，必须单独做备份（外置硬盘或对象存储），不能依赖 Git 恢复。
- 本机 PowerShell 执行策略禁止直接运行 `npm`/`npx`：如需手工执行，可用 `node node_modules/<工具>/bin/...` 直调，或临时 `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`。
