# WZLCF 项目记忆

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

## 第八个话题进展记录（2026-07-05 至 2026-07-08）

- 已删除旧冗余文档，仅保留有效的 `AGENTS.md`、`README.md` 和 `docs/`、`components/`、`scripts/`、`skills/` 内入口说明。
- 新增并完善 `docs/README.md`、`docs/project-archive-2026-07-03.md`、`docs/maintenance-audit-2026-07-03.md`、`components/README.md`、`scripts/README.md`、`skills/README.md`。
- 新增 `.editorconfig`，后续文件默认按 UTF-8 维护。
- 新增轻量启动命令 `npm run dev:lite`，用于只启动 Next、设计/生图 worker、生成 PPT worker、美化 PPT worker。
- 员工智能模式新增“图片转 PPT”入口，并支持图片拖拽后调用 Codia 转 PPTX。
- 生成 PPT 和美化 PPT 的预览图片支持点击放大。
- 美化 PPT 改造成可控链路：填写要求 -> 生成方案 -> 用户确认 -> 生成多张预览图 -> 逐页重生成/贴近上一页 -> 转 PPT。
- 美化 PPT worker 健康检查、任务状态、右侧任务列表滚动到最新任务等体验已经做过多轮修复。
- 美化 PPT 生成预览图并发数调整为 2。
- 修复美化 PPT 预览卡描述文字偏红的问题，改为白色。
- 工作台标题由“把想法变成一张精美 PNG”改为“把普通 PPT 变成专业级演示”。
- 工作台调色正在进行：最新方向为石墨黑深色模式，当前主要改动在 `app/employee/employee.css`，已通过 `npm run build -- --webpack`，但尚未提交到 GitHub。
- 上一次已推送到 GitHub 的提交为 `2ea61e6d Add PPT polish workflow`，当前石墨黑配色改动仍是本地未提交状态。

## 第九个话题完成记录（2026-07-26）

### 为什么做这次改造

- 原员工登录依赖手机号、短信验证码和员工码，学校同学使用时身份仍需人工核对，也不利于以后复制给其他学校。
- 项目 owner 缺少一个能直接审批成员、停用账号、分配角色、限制具体功能并查看使用量的控制台。
- 只在前端隐藏按钮不等于真正的权限控制，因此本次同时改了登录、数据库、服务端接口和前端页面。

### 用户现在怎样登录

- `/employee` 已取消员工手机号、短信验证码和员工码输入框，改为学校企业微信扫码。
- 第一次扫码会保存通讯录 UserID、姓名、头像、职务和部门编号，并建立“待审批成员”。
- 待审批成员只能看到等待审批页，不能读取订单、客户资料、PPT 文件或 AI 功能。
- 管理员批准并分配权限后，成员刷新页面才能进入工作台。
- 停用成员时会同时清除其员工登录会话。
- 旧的 `POST /api/employee/auth/verify` 保留为明确返回 410 的废弃入口，避免旧前端继续误用。

### 管理员现在能控制什么

- 左侧新增“管理控制台”。
- 可查看全部成员、待审批人数、近 7 天活跃、登录次数和已停用人数。
- 可按学校筛选并搜索姓名、企业微信 UserID。
- 可设置：平台管理员、学校管理员、负责人、设计师、审核员、普通成员。
- 可逐项开关：订单、客户消息、团队、在线编辑、AI 助手、智能 PPT、素材库、图片工具、导出。
- 可查看每个人负责的订单数、AI 任务数、登录次数和最近操作。
- 管理员不能在控制台里停用或改写自己的管理员身份；学校管理员不能管理其他学校或授予平台管理员。

### 多学校怎样工作

- `Organization` 表示一个学校工作区；`EmployeeMembership` 表示一个人在某所学校的企业微信身份、角色、状态和功能权限。
- 每所学校必须提供自己的企业微信自建应用 `CorpID`、`AgentID` 和 `Secret`，不能共用第一所学校的凭据。
- 少量学校使用 `WECOM_ORGANIZATIONS_JSON` 配置；登录页会出现学校选择。
- 平台管理员可以跨学校管理；学校管理员和普通成员只能看到本校数据。
- 现有老订单在首次同步学校配置时自动归入第一所学校；没有学校归属的订单不会向普通成员开放。
- 后续学校数量很大时，应升级为企业微信第三方应用/服务商授权，不再手工维护多组 Secret。

### 真实改动文件与原因

- `prisma/schema.prisma`、`scripts/init-db.mjs`
  - 新增学校、学校成员身份和登录记录；给员工会话和订单补上学校归属。
  - 原因：登录身份、角色、权限、学校隔离和使用情况都需要可追踪的数据来源。
- `lib/wecom.ts`
  - 读取单学校/多学校配置，生成企业微信授权地址，换取访问令牌并读取通讯录成员。
  - 原因：所有企业微信 Secret 必须只在服务端使用，不能交给浏览器。
- `lib/employee-auth.ts`
  - 统一员工会话、默认角色权限、功能权限、订单负责人和学校边界检查。
  - 原因：权限必须由服务端再次验证，不能只依赖前端按钮是否显示。
- `app/api/employee/auth/wecom/config/route.ts`
  - 给登录页返回可公开的学校、CorpID、AgentID、回调地址和一次性 state，不返回 Secret。
- `app/api/employee/auth/wecom/callback/route.ts`
  - 处理扫码回调、校验 state、读取成员身份、创建待审批成员和员工会话。
- `app/api/employee/auth/wecom/dev/route.ts`
  - 仅本地开发允许进入平台管理员；生产环境始终拒绝。
- `app/api/employee/admin/overview/route.ts`
  - 返回学校、成员、状态和使用统计。
- `app/api/employee/admin/members/[membershipId]/route.ts`
  - 保存成员状态、角色和逐项功能权限，并在停用时注销会话。
- `app/api/employee/me/route.ts`
  - 按成员状态、功能权限、学校和订单负责人返回可见数据。
- `components/employee-app.tsx`
  - 新企业微信扫码页、待审批页、权限化导航和管理员控制台。
- `app/employee/employee.css`
  - 新扫码、待审批和石墨黑管理控制台样式。
- `app/api/employee/services/**`、`app/api/employee/work-documents/**` 及相关 AI/图片接口
  - 接入统一订单授权检查。
  - 原因：防止用户通过直接请求接口绕过界面权限。
- `.env.example`、`.env.production.example`
  - 增加企业微信单学校、多学校、平台管理员和回调配置示例。
- `scripts/employee-visual-test.mjs`、`next.config.ts`
  - 自动验证登录、订单、控制台、工作台和手机端；使用独立缓存目录，不干扰正在运行的 `npm run dev`。
- `docs/project-control-workflows.md`
  - 保存项目 owner 可直接验收的扫码、审批、权限和多学校流程。

### 上线前仍需外部条件

- 学校企业微信管理员创建自建应用并提供 `CorpID`、`AgentID`、应用 `Secret`。
- 应用必须允许访问目标同学所在的通讯录范围。
- 公网网站必须使用 HTTPS，并把回调域名加入企业微信可信域名。
- 你的企业微信通讯录 UserID 必须配置为 `WECOM_PLATFORM_ADMIN_USERID`，真实扫码后才会绑定为平台管理员。
- `WECOM_AUTO_APPROVE` 默认保持 `0`，防止任何成员第一次扫码就直接进入工作台。

### 本次验证

- `npx prisma validate` 通过。
- `npx tsc --noEmit` 通过。
- `npm run lint` 通过，只有旧设计脚本的历史 unused warning。
- `npm run build -- --webpack` 通过。
- `node scripts/employee-visual-test.mjs` 通过，登录、订单、控制台、工作台、手机端拦截和工作台重复进入均已截图检查。

## 第十个话题完成记录（2026-07-27）

> 本节是当前有效登录方案；第九个话题记录了企业微信底座，本节在其上增加普通微信，并将两者整合为双入口。

### 为什么增加普通微信并保留企业微信

- 项目 owner 暂时无法取得学校企业微信管理员提供的应用凭据，因此当前不具备真实企业微信扫码条件。
- 普通微信开放平台网站应用由项目方自己申请，不依赖学校通讯录管理员，更适合先完成产品验证。
- 企业微信仍是更可靠的学校官方身份来源，因此登录页保留可切换入口；默认显示普通微信，取得学校授权后即可接通企业微信。
- 普通微信只能证明用户的微信身份，不能自动证明其属于哪所学校；因此继续保留“选择学校、扫码申请、管理员核验、批准权限”的可控流程。

### 用户当前登录流程

1. 用户进入 `/employee`，默认看到“微信”，也可主动切换“企业微信”。
2. 用户选择申请加入的学校；页面向服务端取得对应登录方式的一次性状态和扫码地址。
3. 普通微信回调读取 OpenID、可用时的 UnionID、昵称和头像；企业微信回调读取学校通讯录 UserID、姓名、头像、职务和部门编号。
4. 两种方式都不读取密码、聊天记录或联系人；普通微信不能自动证明学校归属，企业微信可以证明该账号在授权学校通讯录内。
5. 新用户默认进入待审批页，不能查看订单、客户资料、PPT 文件或 AI 功能。
6. 管理员在管理控制台确认成员资格，批准后分配角色和具体功能权限。
7. 用户刷新后进入对应学校工作区；普通成员和学校管理员不能跨学校读取数据。

### 管理员与多学校规则

- 单学校使用 `EMPLOYEE_ORG_SLUG`、`EMPLOYEE_ORG_NAME`。
- 多学校使用 `EMPLOYEE_ORGANIZATIONS_JSON`；同一套普通微信网站应用可复用到多个学校。
- `WECHAT_PLATFORM_ADMIN_OPENID` 或 `WECHAT_PLATFORM_ADMIN_UNIONID` 用于绑定整套软件管理员。
- 新部署也可临时设置 `WECHAT_FIRST_USER_IS_ADMIN=1`，让第一个真实微信扫码用户成为整套软件管理员；绑定完成后应关闭。
- `WECHAT_AUTO_APPROVE` 默认必须为 `0`，防止扫码用户未经学校身份核验直接进入工作台。
- `WECHAT_DEV_BYPASS=1` 只允许本地开发使用，生产环境始终不能依赖它。

### 真实改动文件与原因

- `lib/wechat.ts`
  - 生成微信开放平台网站应用授权地址，使用回调 code 换取微信身份。
  - 原因：`AppSecret` 必须只在服务端使用，浏览器只能取得公开参数和一次性 state。
- `lib/employee-workspaces.ts`
  - 将学校工作区配置从企业微信配置中拆出。
  - 原因：学校隔离是产品自己的业务边界，不应绑定某一种登录供应商。
- `app/api/employee/auth/wechat/config/route.ts`
  - 返回学校列表、公开 AppID、回调地址、一次性 state 和授权地址；不返回 `AppSecret`。
- `app/api/employee/auth/wechat/callback/route.ts`
  - 校验 state、读取微信身份、创建或匹配成员、建立待审批状态和员工会话。
- `app/api/employee/auth/wechat/dev/route.ts`
  - 仅供本地查看管理员控制台，生产环境不接受开发绕过。
- `prisma/schema.prisma`、`scripts/init-db.mjs`
  - 给学校成员身份增加通用的登录来源、外部用户编号和 UnionID 字段。
  - 原因：权限系统不再绑死 `wecomUserId`，以后恢复企业微信或增加其他登录方式时不用重做成员和权限表。
- `lib/employee-auth.ts`
  - 改为使用通用学校工作区，并继续统一处理员工会话、学校边界、角色和功能权限。
- `components/employee-app.tsx`、`app/employee/employee.css`
  - 登录页改为默认微信、可切企业微信的分段入口；学校选择、二维码、缺失配置提示和隐私说明随登录方式切换。
  - 待审批页按实际登录来源显示微信或企业微信身份。
- `app/api/employee/admin/overview/route.ts`
  - 管理台展示实际身份来源和脱敏外部编号，并分别显示微信、企业微信是否已接通。
- `.env.example`、`.env.production.example`
  - 增加微信开放平台、单学校、多学校、平台管理员和回调配置；同时保留可直接填写的企业微信逐校配置。
- `docs/project-control-workflows.md`
  - 用项目 owner 可直接验收的语言记录扫码、审批、权限、隐私边界和多学校复用流程。
- `app/api/employee/auth/wecom/`、`lib/wecom.ts`
  - 企业微信入口继续可用，未配置学校凭据时显示待配置；同时补齐通用身份字段兼容。
  - 原因：以后取得学校管理员配合后只需填写凭据，不必再改登录页面、成员表或权限系统。

### 上线前仍需外部条件

- 在微信开放平台申请并通过一个“网站应用”，取得 `WECHAT_OPEN_APP_ID` 与 `WECHAT_OPEN_APP_SECRET`。
- 准备公网 HTTPS 网站，把 `WECHAT_CALLBACK_ORIGIN` 配置为该网站域名，并在微信开放平台登记一致的回调域。
- 企业微信入口需逐校取得自建应用的 `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_SECRET`，多学校使用 `WECOM_ORGANIZATIONS_JSON`。
- 当前本地 `.env` 未配置上述真实凭据时，页面会如实显示“微信扫码尚未接通”，不会展示伪造二维码。

### 本次验证

- `npm run db:init` 通过，旧数据库数据保留并补齐通用身份字段。
- `npx prisma validate` 通过。
- Windows 下 Prisma 引擎曾被正在运行的 Next 进程占用；仅停止本项目进程并重新生成后，普通 `npx prisma generate` 通过，SQLite 查询正常。
- `npx tsc --noEmit` 通过。
- `npm run lint` 通过，无错误；仍有 `scripts/design-agent-worker.mjs` 原有的 11 条未使用函数警告。
- `npm run build -- --webpack` 通过。
- `node scripts/employee-visual-test.mjs` 通过；已检查默认微信、切换企业微信、返回微信进入管理台、订单页、工作台重复进入和手机端阻止页面。

## OpenAI 代理瞬断修复记录（2026-07-27）

### 这次实际出了什么问题

- 员工工作台明确使用 `.env` 中的 `OPENAI_PROXY_URL=http://127.0.0.1:7897`，不会自动跟随浏览器是否可以访问外网。
- 本机 `7897` 端口由 `verge-mihomo.exe` 正常监听；使用项目相同的 Node.js `undici ProxyAgent` 实测，Google 返回 `204`、OpenAI 模型接口返回未带密钥时应有的 `401`，说明代理地址、端口和 OpenAI 出口当前都正常。
- 截图中的 `Client network socket disconnected before secure TLS connection was established` 是请求到达 OpenAI 之前的 TLS 连接瞬断，常见于代理核心重连、切换节点或节点临时不稳定，不是 API Key、额度或模型权限报错。
- 原页面只在进入工作台时检查一次 OpenAI；如果这一次恰好遇到瞬断，失败状态会一直保留并阻止使用，即使代理随后恢复也不会自行重查。这才是用户感知上“突然坏了且不恢复”的主要产品问题。

### 本次改了什么

- `app/api/employee/ai/openai-health/route.ts`
  - 仅对只读的 OpenAI 连通性检查增加最多两次短暂重试。
  - 原因：吸收代理节点切换时的瞬时握手失败；不对已经发出的生图或文本生成请求盲目重试，避免重复任务。
- `components/employee-app.tsx`
  - OpenAI 正常时每 60 秒复检，失败时每 10 秒复检。
  - 失败提示旁新增刷新图标，可立即重新检查；检查期间图标旋转并禁止重复点击。
  - 原因：让页面状态能随代理恢复而自动恢复，不再依赖退出并重新进入工作台。
- `app/employee/employee.css`
  - 为健康提示和刷新图标补充布局与状态样式，保持现有石墨黑工作台视觉。

### 后续排查顺序

1. 先检查 `OPENAI_PROXY_URL` 指向的本地端口是否监听。
2. 再用项目相同的 Node.js 和 `undici ProxyAgent` 测试 `https://api.openai.com/v1/models`；不带密钥返回 `401` 代表网络已经通。
3. 如果 Node.js 仍在 TLS 前断线，优先在代理软件中切换稳定节点或重启代理核心；浏览器能访问并不能单独证明 Node.js 指定的代理链路正常。
4. 只有已经收到 OpenAI 的 `401`、`403`、`429` 等 HTTP 响应时，才继续排查密钥、项目权限、额度或限速。

### 开发服务占用补充

- Codex 为验证改动临时启动 `npm run dev` 后，除非项目 owner 明确要求保持运行，否则必须在交付前停止自己启动的整组服务。
- 停止后必须同时确认：`3000` 端口空闲、`8765` 组件服务端口空闲、`.next-dev/dev/lock` 不再被占用。
- 2026-07-27 本次重复启动提示不是产品启动逻辑再次损坏，而是 Codex 验证 OpenAI 修复时启动的后台开发服务尚未完全退出。已仅停止 23:13 启动的本项目 Node 进程；未停止用户更早运行的其他 Node 进程。
- 如果界面服务已经停止但锁仍为 `EBUSY`，说明仍有本项目 Next 子进程残留；应按项目路径、启动时间和进程树精确确认后停止，不能清理所有 `node.exe`。

### 未上线阶段的本机进入方式

- 当前项目尚无公网 HTTPS 官网，微信开放平台网站应用无法完成真实回调配置时，本机 `.env` 可设置 `WECHAT_DEV_BYPASS=1`。
- `/employee` 的扫码登录页会显示“暂不扫码，进入本地工作台”按钮，点击后建立本机平台管理员会话，方便继续开发员工工作台。
- 相关前端位置为 `components/employee-app.tsx`，服务端保护接口为 `app/api/employee/auth/wechat/dev/route.ts`。
- 该入口不是正式登录方式：`NODE_ENV=production` 时服务端始终返回拒绝；上线接通真实微信后应从部署环境中移除 `WECHAT_DEV_BYPASS`。

### Windows 开发服务重复启动修复

- 曾出现第一次 `npm run dev` 后按 `Ctrl+C`，终端看似结束但 Next 与后台执行脚本仍留在后台，第二次启动被 `.next-dev/dev/lock` 拒绝。
- 根因是旧启动脚本只调用 `child.kill("SIGINT")`，Windows 下不能可靠结束子进程树，也没有等待所有子进程退出。
- 新增 `scripts/process-group.mjs`，Windows 下按进程树关闭子进程，等待退出后再结束启动脚本；其他系统使用 `SIGTERM`。
- `scripts/dev.mjs`、`scripts/dev-lite.mjs` 和 `scripts/agent-workers.mjs` 已统一使用该逻辑，确保截停后可以直接再次运行相同命令。

## 美化 PPT 方案确认页修复记录（2026-07-31）

### 用户现在怎样操作

- 美化方案生成后，方案待确认页同时显示“返回修改”和“确认生成”。
- 点击“返回修改”会重新打开美化 PPT 表单，并恢复目标风格、整套修改方向、勾选要求和逐页修改清单。
- 如果原来源是本地上传 PPTX，浏览器不能恢复本地文件对象，返回后需要重新选择一次文件。
- 已勾选要求改为横向标签，在方案卡片内自动换行，不再挤成单字竖排或穿出卡片。

### 改动文件与原因

- components/employee-app.tsx
  - 给美化方案待确认状态增加返回修改操作，并用当前方案重新初始化美化表单。
  - 原因：用户拿到提纲后既可以确认生成，也应能退回修改，保持生产过程可控。
- app/employee/employee.css
  - 仅为美化方案标签和返回按钮增加局部样式。
  - 原因：通用弹性布局会把标签压成单字宽，需要固定为横向内容宽度并允许整组换行。
- docs/project-control-workflows.md
  - 同步记录用户确认点、返回行为与验收标准。

### 本次验证

- npx tsc --noEmit 通过。
- npm run lint 通过，无新增错误；仍有旧设计脚本的 11 条历史未使用函数警告。
- npm run build -- --webpack 通过。
- 本次没有修改生成 PPT、生图、登录、权限、接口或后台执行脚本。

## 第十一个话题完成记录（2026-08-03）

### 本次范围和产品决定

- 本次只修改“生成 PPT”模式，没有修改美化 PPT、生图、登录、权限或图片工具流程。
- 原生成方式保留为“快速版”，但不再只是把简介交给模型：必须先读取用户资料、保留来源、自动组织完整方案，再由用户确认。
- 新增“高级版”：用户掌握每一页讲什么，系统负责从大量资料中按页取材并组织完整内容。
- 快速版和高级版都继续通过 YZStudio 图片中转的 `gpt-image-2` 生成完整 16:9 页面图片；没有改成“AI 图片 + 普通 PPT 文本框”的混合路线。
- 参考配色图只控制颜色职责与比例，不照抄参考图布局。
- 卡片样式统一和装饰元素统一保持默认不勾选。

### 快速版现在怎样交付

1. 用户填写项目名称、用途、页数、简介，拖入资料并选择内置配色或参考图配色。
2. 系统读取所有资料，保留文件名、页码、幻灯片号、工作表或文本位置。
3. 系统自动组织整套逐页方案，并为正文页设置标准或紧凑信息密度，避免大片空白和几个模板卡片。
4. 用户检查逐页标题、内容摘要和页面用途，可以换风格重新整理。
5. 用户确认方案后，才同时按 2 张的并发生成完整页面预览图。
6. 用户可放大预览、重新生成本页、让本页更贴近上一页。
7. 用户确认整套预览后，再生成 PPTX 或 PDF。

### 高级版现在怎样交付

1. 用户直接填写或上传 PPT 大纲，可以只写每页大标题，也可以规定小标题、想讲的内容和必须结论。
2. 用户一次拖入最多 30 份、合计 500MB 的 PDF、Word、Excel、PPT、文本、表格或图片资料，不需要自己先整理摘要。
3. 系统先读取资料并整理可编辑逐页结构；高级版页数由结构决定。
4. 第一次确认只确认“每一页讲什么”。用户能增删页面、改标题、小标题、页面目的、结论、信息密度和版式。
5. 结构确认后，ChatGPT 从证据库中按页匹配事实、数字、日期、图片线索和原话，并显示来源文件与来源位置。
6. 用户可以编辑页面内容、返回结构调整、重新匹配资料或按新风格重整。
7. 第二次确认“逐页内容”后才开始生成页面图片。
8. 后续预览、单页返工和 PPTX/PDF 交付与快速版一致。

### 大量资料在系统里怎样保存

- `DeckGenerationSource`：保存一份原始资料的文件名、类型、路径、解析状态和错误。
- `DeckGenerationEvidence`：保存可检索事实及其来源位置。
- `DeckGenerationPagePlan`：保存用户确认的单页结构、页面内容包、证据选择、风险和视觉说明。
- 原始资料不会因为生成了摘要就被删除；页面内容只引用与当前页面相关的证据。
- `scripts/deck-source-parser.mjs` 负责解析 PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV 和 JSON；图片由视觉模型读取。
- PDF 解析新增 `pdfjs-dist` 依赖。

### 真实改动文件与原因

- `prisma/schema.prisma`、`scripts/init-db.mjs`
  - 给生成任务增加快速/高级模式、参考文字、配色合同、大纲、分析摘要和资料数量；新增资料、证据、逐页计划三类记录。
  - 原因：高级版需要知道内容来自哪里，不能只把几十份文件压成一段不可追溯摘要。
- `lib/workspace-storage.ts`
  - 增加生成 PPT 原始资料和配色参考图的独立保存目录。
  - 原因：让原始资料、配色图和页面结果分开保存，便于检查和清理。
- `scripts/deck-source-parser.mjs`
  - 新增多格式资料读取与来源定位。
  - 原因：用户应该直接丢进多份大资料，不应先自行转格式或整理摘要。
- `scripts/deck-generation-worker.mjs`
  - 后台执行脚本增加资料读取、参考图配色分析、大纲整理、证据匹配、快速版自动规划、高级版内容包和 2 张并发页面生成。
  - 原因：把“读资料、定结构、配内容、再生图”变成可恢复的明确阶段。
- `app/api/employee/services/[id]/deck-generation/runs/route.ts`
  - 创建任务时接收模式、大纲、多文件资料和配色参考图，并校验 30 份、500MB、单文件 200MB、粘贴 5 万字等限制。
  - 原因：前端与服务端必须同时保护上传边界。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/pages/route.ts`
  - 新增高级版逐页结构和内容保存接口，支持保存草稿、确认结构、返回结构调整和重新匹配资料。
  - 原因：高级版必须让用户真正掌控每页内容，不只是看系统结果。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/confirm/route.ts`、`replan/route.ts`
  - 区分快速版方案确认与高级版内容确认，并支持重整方案后继续流程。
  - 原因：未经对应确认不能提前生图。
- `components/employee-app.tsx`
  - 新增快速版/高级版入口、大批量资料区、大纲输入、配色参考图、资料读取状态、两阶段高级版编辑器、来源标签和返回调整结构。
  - 原因：把内部处理变成用户看得见、能确认、能退回的产品流程。
- `app/employee/employee.css`
  - 只增加生成 PPT 的局部表单、资料、结构编辑器、来源标签和响应式样式；修复“上传大纲”按钮窄成竖排。
  - 原因：不影响美化 PPT 和生图，同时保证面板无横向溢出。
- `skills/deck-generation/source-grounding.md`
  - 规定事实、数字、日期、专名必须来自已读取资料并保留来源。
- `skills/deck-generation/outline-control.md`
  - 规定高级版大纲解析、页面锁定和两次确认。
- `skills/deck-generation/content-density.md`
  - 规定正文页标准/紧凑密度，减少空洞、模板化卡片和无意义留白。
- `skills/deck-generation/palette-reference.md`
  - 规定参考图只提取颜色职责和比例。
- `skills/deck-generation/quality-audit.md`、`slide-image-specs.md`、`SKILL.md`
  - 规定生图前后核对标题、关键数字、必须信息、页面连续性，以及封面/结尾强视觉、正文完整表达。
- `docs/project-control-workflows.md`、`scripts/README.md`、`skills/README.md`
  - 用项目 owner 能验收的语言记录入口、确认点、返工、交付物和真实文件位置。

### 本次验证

- `npm run db:init` 通过，SQLite 已补齐生成 PPT 新字段和新表。
- `npx prisma validate` 通过。
- `npx tsc --noEmit` 通过。
- `node --check scripts/deck-source-parser.mjs` 通过。
- `node --check scripts/deck-generation-worker.mjs` 通过。
- 使用 `南科大通用ppt模板.pptx` 做真实解析测试：识别 2 张幻灯片、1111 个字符、2 个证据块，来源位置为“第 1 页”“第 2 页”。
- `npm run lint` 通过，0 个错误；仍只有旧 `scripts/design-agent-worker.mjs` 的 11 条历史未使用函数警告。
- `npm run build -- --webpack` 通过，新增 `pages` 接口和生成 PPT 路由均进入生产构建。
- 在 1600×1000 桌面视口实际进入工作台检查快速版和高级版；高级版上传大纲按钮为 88×34 横排，面板 `clientWidth = scrollWidth = 758`，无横向溢出。
- 视觉截图保存为 `.artifacts/generate-ppt-quick.png`、`.artifacts/generate-ppt-advanced.png` 和 `.artifacts/generate-ppt-advanced-fixed.png`。
- 视觉验证临时使用 3010 端口，结束后已精确关闭本次启动的进程树并确认端口释放。
- 未在本次验证中消耗真实 OpenAI 额度跑完整多页生图；生产编译、资料解析、数据库、前端确认链路和页面视觉均已验证，首次真实任务仍应先用 2 到 3 页小任务检查当前 API 配额、代理和模型输出。

## YZStudio 双中转迁移记录（2026-08-03）

### 为什么做这次迁移

- 项目原先多个文字与生图功能直接读取旧 OpenAI Key，并依赖本地代理；用户现在改用 YZStudio 中转站，并为文字和图片分别购买了不同密钥。
- 两条能力必须彻底分开，避免文字任务误用生图密钥、图片任务误用文字密钥，也避免浏览器接触服务端密钥。
- 默认直接连接中转站，不再依赖 `OPENAI_PROXY_URL`；只有部署环境确实需要额外代理时，才填写新的专用代理变量。

### 用户现在得到的 AI 链路

1. 需求分析、资料整理、快速版/高级版逐页方案、美化方案、文案与对话统一使用 `AI_TEXT_API_KEY`，默认模型为 `gpt-5.6-sol`。
2. 生成 PPT 页面、美化 PPT 页面、单页重新生成、生图和图片清字等图片能力统一使用 `AI_IMAGE_API_KEY`，默认模型为 `gpt-image-2`。
3. 文字请求默认走 `https://yzstudio.vip/v1/chat/completions`，图片请求默认走 `https://yzstudio.vip/v1/images/generations`。
4. 项目自己的“一次生成任务”和后台队列继续负责排队、并发和恢复；没有在缺少中转站异步查询协议时猜测接入 `/async/` 接口。
5. Codia、DeepSeek、豆包/方舟等独立供应商保持原有配置，不会被 YZStudio 密钥替换。
6. 旧 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_PROXY_URL` 已从当前 `.env` 清除，功能代码也不再读取或回退这些变量。

### 图片编辑兼容边界

- 中转站当前已确认普通生图接口，但尚未确认参考图编辑接口的请求格式。
- 默认 `AI_IMAGE_SUPPORTS_EDITS=0`：普通生图可以使用；必须上传参考图进行编辑的操作会明确提示“当前中转未接通图片编辑”，不会悄悄调用旧 OpenAI Key。
- 只有取得中转站正式的图片编辑接口文档并完成联调后，才能把 `AI_IMAGE_SUPPORTS_EDITS` 改为 `1`。

### 真实改动文件与原因

- `lib/ai-providers.ts`
  - 新增文字与图片两套服务配置、请求方法、响应解析和安全诊断信息。
  - 原因：Next.js 服务端接口需要共用同一套中转规则，不能每个页面各自拼接地址。
- `scripts/ai-service-client.mjs`
  - 新增供后台执行脚本共用的文字/图片中转客户端。
  - 原因：生成 PPT、美化 PPT、设计生图和图片炸开均为独立 Node.js 脚本，需要与网页接口使用相同配置。
- `scripts/deck-generation-worker.mjs`、`scripts/ppt-polish-worker.mjs`、`scripts/design-agent-worker.mjs`、`scripts/image-explode-worker.mjs`
  - 将原文字规划与页面生图分别切换到 YZStudio 文字和图片中转。
  - 原因：确保所有后台生成流程都不再读取旧 OpenAI Key。
- `app/api/employee/services/[id]/generate-images/route.ts`、`app/api/employee/services/[id]/clean-text/route.ts`、`app/api/employee/services/[id]/ai/chat/route.ts`
  - 将工作台生图、清字和文字助手接入对应中转，并对未接通的图片编辑能力给出明确错误。
- `app/api/employee/ai/openai-health/route.ts`、`app/api/employee/admin/overview/route.ts`
  - 保留旧健康检查路由名以兼容现有前端，但实际检查改为文字/图片两套中转；管理台分别展示两套配置状态。
- `components/employee-app.tsx`、`app/employee/employee.css`
  - 前端状态提示和管理台改为区分文字中转、图片中转，不再笼统显示“OpenAI 已连通”。
- `scripts/next-with-env-proxy.mjs`
  - 移除用旧 `OPENAI_PROXY_URL` 全局覆盖 Node.js 网络代理的行为。
  - 原因：YZStudio 默认直连，不能让旧代理无意影响所有外部请求。
- `.env`、`.env.example`、`.env.production.example`
  - 改为 `AI_TEXT_*` 与 `AI_IMAGE_*` 两组配置；实际密钥仍需项目 owner 在本机填写完整值。
- `README.md`、`scripts/README.md`、`docs/project-control-workflows.md`、`AGENTS.md`
  - 同步记录真实业务流程、配置方式、兼容边界和代码位置，避免以后继续用旧 OpenAI 配置判断项目状态。

### 本次验证

- 当前功能目录已审计，不再出现对旧 OpenAI Key、Base URL、Proxy URL 或 `api.openai.com` 的活动调用。
- `npx tsc --noEmit` 通过。
- 五个相关后台脚本的 `node --check` 通过。
- `npm run lint` 通过，0 个错误；仍只有 `scripts/design-agent-worker.mjs` 原有的 11 条未使用函数警告。
- `npm run build -- --webpack` 通过。
- 因本机新的 `AI_TEXT_API_KEY`、`AI_IMAGE_API_KEY` 尚未填写完整值，本次没有发送真实付费请求；填写两把完整密钥并重启 `npm run dev` 后，仍需先用一条短文字和一张测试图做最终联通验收。
### 本次 Codex 中断诊断

- 2026-08-03 Windows 应用日志记录了两次 `codex.exe` 原生崩溃，异常码分别为 `0xc0000409` 和 `0xc0000005`，对应的本地转储位于 `%LOCALAPPDATA%\CrashDumps\codex.exe.33588.dmp` 与 `codex.exe.16812.dmp`。
- 同一时段 PowerShell、向日葵、Windows 更新进程和腾讯知识库进程也出现内存访问或堆损坏异常；系统还发生一次 `0x0000003b` 蓝屏。因此本次反复退出不能归因于 PPTagent 代码或 `npm run dev`。
- Codex 应用包状态为 `Ok`，检查时物理内存仍有约 5.9GB 空闲，没有发现单纯内存耗尽证据。
- 当前稳妥处理顺序：先保存项目工作；退出第三方 Codex++；通过 Windows 应用高级选项对 Codex 执行“修复”而不是“重置”；在 Microsoft Store 更新 Codex；再以管理员身份运行 DISM、SFC 与 Windows 内存诊断。
- 如果仍复现，应把崩溃时间、Windows 报告 ID 和两份转储交给 OpenAI 支持；不要为了排查直接清空 Codex 数据或批量结束所有 Node.js 进程。
## Windows Docker 保留端口启动修复（2026-08-03）

### 问题根因

- `npm run dev` 在 ONLYOFFICE 启动后报“找不到可用开发端口”，不是所有端口都被残留 Node 进程占用。
- Windows/Hyper-V 在本次 Docker 启动后把 TCP `2971–3170` 标记为系统保留范围；旧启动脚本只尝试 `3000`、`3001`、`3120–3143`，所有候选端口恰好都落在保留段内。

### 本次改动

- 新增 `scripts/dev-port.mjs`，统一负责开发端口选择。
- `scripts/dev.mjs` 与 `scripts/dev-lite.mjs` 都改为使用同一端口选择逻辑。
- 选择顺序为：用户指定的 `DEV_PORT`/`PORT`、常用的 `3000`/`3001`、`3200–3249`、`4200–4249`；如果仍全部不可用，最后让 Windows 自动分配一个真正可监听的端口。
- 启动日志会打印实际访问地址，Docker/Hyper-V 每次重启改变保留端口范围时不再直接失败。

### 本次验证

- 当前机器实测 `3000` 不可监听，新逻辑自动选择 `3200`。
- 完整执行 `npm run dev` 后，`http://localhost:3200` 与 `http://localhost:3200/employee` 均返回 `200`，组件提取服务在 `8765` 正常监听。
- 验证结束后仅停止本次 18:59 启动的 PPTagent 进程树；确认 `3200`、`8765` 空闲且 `.next-dev/dev/lock` 不存在。
## 高级版主题图文字中转与余额提示修复（2026-08-03）

- 高级版上传的普通文档先由本地解析程序读取；主题色参考图明确交给 `AI_TEXT_API_KEY` 对应的 `gpt-5.6` 进行视觉理解，不使用 `AI_IMAGE_API_KEY`。
- 2026-08-03 的任务中，4 份 Word 均读取完成，主题色参考图分析和后续逐页结构整理因 YZStudio 文字账户返回 `Insufficient account balance` 而失败。
- `scripts/deck-generation-worker.mjs` 已将余额错误按文字账户和图片账户分别翻译为中文，避免用户给错账户充值。
- `components/employee-app.tsx` 已给失败的生成 PPT 任务增加“重新分析资料”，余额恢复后复用原资料和原大纲重新执行，不要求重新上传。
- 本次只修改生成 PPT 链路，没有改美化 PPT、生图或其他工作台模块。
## YZStudio 代理误填与真实余额验证（2026-08-03）

- 用户没有漏填 Key、模型或 Base URL；本次发现 `.env` 曾把 YZStudio API 地址同时误填进 `AI_TEXT_PROXY_URL` 与 `AI_IMAGE_PROXY_URL`。
- `*_BASE_URL` 按管理员口径填写中转站官网根地址，程序自动补 `/v1`；`*_PROXY_URL` 只用于额外的 HTTP 代理服务器。用户当前选择直连中转站，因此两个代理字段已清空。
- 误填会使 `undici.ProxyAgent` 抛出 `InvalidArgumentError: invalid url`，并让多个 AI 后台执行脚本退出；这与高级版页面显示的余额不足是两个独立问题。
- `scripts/ai-service-client.mjs` 与 `lib/ai-providers.ts` 已增加代理地址校验。以后误把带 `/v1` 路径的 API 地址填进代理字段，会直接给出中文纠正说明。
- 清空代理后实测：`yzstudio.vip` DNS 正常，HTTPS 主站返回 200，GPT-5.6 最小请求到达中转站并返回 `403 / INSUFFICIENT_BALANCE`。
- 该 403 证明当前 `AI_TEXT_API_KEY`、`gpt-5.6` 和文字接口地址已生效；剩余阻塞是文字 Key 所属 YZStudio 分组没有可用余额。需要在 YZStudio 检查分组、订阅有效期、每日额度和永久额度，补充后在原任务点击“重新分析资料”。
- `scripts/deck-generation-worker.mjs` 的中文提示已明确“不是配置缺项”，避免用户反复检查已正确填写的字段。
- 验证通过：`node --check scripts/ai-service-client.mjs`、`node --check scripts/deck-generation-worker.mjs`、`npx tsc --noEmit`。
### 补充验证：不是模型或接口模式错误（2026-08-03）

- 已脱敏核对 `.env`：文字 Key 与此前创建的文字分组 Key 一致，图片 Key 与生图分组 Key 一致，两把 Key 没有放反。
- 使用文字 Key 测试 `gpt-5.6 + /chat/completions`，YZStudio 返回 `403 / INSUFFICIENT_BALANCE`。
- 按用户教程测试 `gpt-5.5 + /chat/completions`，仍返回同一个 403。
- 按 Codex 专用配置测试 `gpt-5.5 + /responses + x-openai-actor-authorization`，仍返回同一个 403。
- 因此当前失败不是 PPTagent 请求体、模型名或 Chat/Responses 模式造成，而是 YZStudio 在模型执行前拒绝了该文字 Key 的可用额度。
- YZStudio 账户钱包显示有金额，不等于该 API Key 当前选择的分组拥有可调用额度。应检查文字 Key 所选分组、我的订阅、订阅有效期、日额度和永久额度；全部正常时需向 YZStudio 提交 Key 尾号、请求时间和 `INSUFFICIENT_BALANCE` 错误让其检查计费绑定。
- 用户提供的 Codex 配置截图中展示的是生图分组 Key 的客户端接法，不应直接覆盖 PPTagent 的文字 Key；截图已暴露完整 Key，应在 YZStudio 重新生成该生图 Key并更新 `.env`。
## YZStudio 官网 Base URL 兼容修复（2026-08-03）

- YZStudio 管理员要求 Base URL 填官网 `https://yzstudio.vip`，因此本机 `.env`、`.env.example` 和 `.env.production.example` 已统一采用官网根地址。
- `scripts/ai-service-client.mjs` 与 `lib/ai-providers.ts` 会把官网根地址标准化为 `https://yzstudio.vip/v1`；如果以后填写的旧值本身已经带 `/v1`，也不会重复拼接。
- 最终文字请求仍为 `https://yzstudio.vip/v1/chat/completions`，最终图片请求仍为 `https://yzstudio.vip/v1/images/generations`。`*_PROXY_URL` 继续留空。
- 这次修改解决的是“后台页面填写官网、代码需要 API 路径”的口径差异，不会伪装修复供应商计费。当前两把 Key 直连 `/v1/models` 以及各自正式接口仍返回 `403 / INSUFFICIENT_BALANCE`，需要 YZStudio 检查账户余额与 Key 分组的计费绑定。
- 真实改动文件：`.env`、`.env.example`、`.env.production.example`、`scripts/ai-service-client.mjs`、`lib/ai-providers.ts`、`README.md`、`docs/project-control-workflows.md`、`AGENTS.md`。
## YZStudio Key 鉴权与余额绑定复核（2026-08-03）

- 新截图显示的“Base URL + 文本接口”容易被误读为无 `/v1`：实测 `POST https://yzstudio.vip/chat/completions` 返回 `405`，而 `POST https://yzstudio.vip/v1/chat/completions` 进入 YZStudio API 并返回结构化 `403 / INSUFFICIENT_BALANCE`。因此官网输入框实际应与 `/v1` API 根路径组合，当前程序自动补 `/v1` 的写法正确。
- 对只读接口 `GET https://yzstudio.vip/v1/models` 做了三组鉴别：当前文字 Key 返回 `403 / INSUFFICIENT_BALANCE`；假 Key 返回 `401 / INVALID_API_KEY`；不带 Key 返回 `401 / API_KEY_REQUIRED`。
- 这证明 YZStudio 已正确识别当前文字 Key，`Authorization: Bearer <key>` 写法正确，失败发生在鉴权之后、模型调用之前的计费检查；不是 PPTagent 请求体、Base URL、模型名或 Header 写错。
- 本次可交给 YZStudio 管理员的文字请求编号：`273f5589-f9b0-4a45-9747-08ea11d2c904`；同一 Key 的最小生成请求编号：`96bf82a2-3ea4-4f96-ba97-68ea251c56cc`。
- 管理员需要检查账户钱包余额是否已同步到 API 计费账户、文字 Key 尾号对应的分组/订阅是否有永久额度或日额度、以及充值后旧 Key 是否需要重新生成。项目端无法绕过供应商返回的余额拦截。
- 用户截图已经显示过完整文字 Key，此前也显示过完整图片 Key；两把 Key 都应在 YZStudio 重新生成并更新 `.env`，避免密钥泄露。

### 按官方手册重新执行账户侧接入

- 官方 YZStudio-user-guide.docx 明确要求按“购买卡密 -> 打开 https://yzstudio.vip/redeem 兑换 -> 在‘我的订阅’或‘仪表盘’确认额度到账 -> 创建 API Key -> 选择分组”的顺序操作。
- 因此不能只凭页面右上角的钱包金额判断 API 已有额度；项目验收应以“我的订阅”中对应永久额度或日额度可用、并且 Key 已绑定相符分组为准。
- 创建新 Key 时不要限制模型。文字 Key 绑定允许 `gpt-5.6-sol` 的文字分组，图片 Key 绑定允许 `gpt-image-2` 的生图分组；两把 Key 继续分别写入 `AI_TEXT_API_KEY` 与 `AI_IMAGE_API_KEY`。
- 当前 .env 已脱敏核对：文字 Key 尾号与文字分组一致，图片 Key 尾号与生图分组一致；Base URL、模型和代理字段也正确。下一步不再修改请求代码，而是完成兑换/订阅确认，并在额度到账后重新创建两把已暴露的 Key。
## 生成 PPT 图组/PDF 导出与 Codia 恢复记录（2026-08-04）

### 用户现在怎样交付

- 生成 PPT 的全部预览页完成后，原“生成 PPT”左侧新增“下载图组”和“生成 PDF”。
- “下载图组”按页码顺序打包为一个 ZIP 文件夹，内部使用 `01.png`、`02.png` 等稳定文件名。
- “生成 PDF”先独立生成并保存 PDF；用户既可下载 PDF，也可继续点击“生成 PPT”交给 Codia 转换。

### Codia 与美化 PPT 的关系

- 美化 PPT 原有 Codia 接口已经完成；生成 PPT 继续复用相同的 Codia v2 调用形态：`/v2/open/uploads` 上传 PDF、`/v2/open/tasks` 创建 `pdf_to_ppt` 任务、再轮询任务结果。
- 两个模块共用 Codia 服务配置，但各自保存自己的任务记录和最终文件，没有改动美化 PPT 业务代码。
- Codia 返回 402/403、余额或权限关键字时，系统明确提示账户额度不足或 Key/套餐无权转换；充值或修复权限后可直接重试。
- 截图中的 `fetch failed` 没有收到 HTTP 状态码，不是已确认的 403；系统会按网络连接故障提示检查 `CODIA_BASE_URL`、`CODIA_PROXY_URL` 或网络。

### 真实改动文件与原因

- `components/employee-app.tsx`、`app/employee/employee.css`：增加图组、PDF、PPT 三个有序操作，显示导出错误，并在 Codia 失败后继续显示已有预览。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/images/route.ts`：读取已完成页图并按顺序生成 ZIP。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/pdf/route.ts`：只要 PDF 文件已经存在，即使后续 Codia 失败仍允许下载。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/ppt/route.ts`、`scripts/deck-generation-worker.mjs`：失败后复用现有 PDF 创建新的 Codia 任务；区分额度/权限错误与网络错误，不要求重新生图。

### 恢复原则

- Codia 转换失败不能抹掉已生成的 PNG 或 PDF；用户修复外部问题后点击“重试生成 PPT”即可。
- 402/403 通常可通过充值、续订或修复 Key 权限恢复；`fetch failed` 需要先恢复网络链路，单纯充值不能解决该错误。

### 本次验证

- `node --check scripts/deck-generation-worker.mjs` 通过。
- `npx tsc --noEmit` 通过。
- `npm run lint` 通过，无错误；仍只有 `scripts/design-agent-worker.mjs` 原有的 11 条未使用函数警告。
- `npm run build -- --webpack` 通过，并确认图组 ZIP 接口已进入生产路由清单。

## 生成 PPT Codia 正式接口修复（2026-08-04）

### 官方链路结论

- 生产 API 根地址为 `https://openapi.codia.ai`，不是旧的 `https://api.codia.ai`。
- 生成 PPT 必须走 v2 任务链路：`/v2/open/uploads` 上传图片型 PDF，`/v2/open/tasks` 创建 `pdf_to_ppt` 任务，轮询任务后读取 `data.result.ppt_url`。
- 上传字段固定为 `file`；任务输入包含 `upload_id`、从 0 开始的全部 `page_no` 和项目标题。项目生成的 PDF 每页都是一张完整预览图，符合 Codia 对 PDF 转 PPT 的图片型 PDF 要求。
- `pdf_to_design` 与 `image_to_design` 返回可编辑设计树，不返回最终 PPTX，不能代替 `pdf_to_ppt`。

### 本次改动

- `scripts/deck-generation-worker.mjs`
  - 将 Codia 默认根地址修正为 `https://openapi.codia.ai`。
  - 创建转换任务时明确提交当前整套预览的零基页码数组，避免依赖服务端默认处理范围。
  - 仅对 `fetch failed`、TLS、socket、超时等未收到 HTTP 响应的瞬时网络问题自动重试一次；收到 400、402、403 等业务响应后不盲目重试。
- `.env`、`.env.example`、`.env.production.example`
  - 将 `CODIA_BASE_URL` 统一为正式 API 根地址。
- `docs/project-control-workflows.md`
  - 用项目 owner 可验收的语言记录上传、创建任务、查询、下载和错误分类。

### 范围与恢复方式

- 本次只修改生成 PPT 的 Codia 后台转换链路，没有改美化 PPT、生图或其他工作台业务代码。
- 修改后必须重启 `npm run dev`，让生成 PPT 后台执行脚本重新读取代码和 `.env`；随后在原任务点击“重试生成 PPT”，不需要重新生图或重新生成 PDF。
- 402 表示余额或订阅不可用；403 表示 Key 或套餐权限不足；400 表示请求字段有误；`fetch failed` 表示尚未收到 Codia HTTP 响应，属于网络/DNS/TLS 问题。
### 本次修复验证

- `node --check scripts/deck-generation-worker.mjs` 通过。
- `npx tsc --noEmit` 通过。
- `npm run lint` 通过，无错误；仍只有 `scripts/design-agent-worker.mjs` 原有的 11 条未使用函数警告。
- `npm run build -- --webpack` 通过。
- 不带密钥访问 `https://openapi.codia.ai/v2/open/tasks/connectivity-check` 收到 Codia 结构化 HTTP 401，证明本机到正式域名的 DNS、TLS 和 HTTP 链路已打通。
- 未使用真实 Codia Key 发起付费转换；项目 owner 重启服务后在原任务点击“重试生成 PPT”完成真实账户验收。
## Codia 三条交付链路统一修复（2026-08-04）

### 本次真实问题

- 截图中的 `fetch failed` 表示生成 PPT 后台执行脚本没有收到 Codia 的 HTTP 响应，不等于 Key 缺失，也不能直接判定为 402/403 额度问题。
- `.env` 中存在非空的 `CODIA_API_KEY`；代码缺少 Key 时会显示“尚未配置 CODIA_API_KEY”，与本次错误不同。
- 用户点击重试时，开发服务仍是 11:30 启动的旧进程，而 Codia 修复文件在 11:57 才写入。Next 页面会热更新，但生成 PPT 和美化 PPT 的后台执行脚本不会热更新，因此旧错误仍会重复出现。

### 本次修改

- `scripts/ai-service-client.mjs`：外部服务连接失败时保留底层 `cause`，错误中会带出 `ECONNRESET`、超时、DNS 或 TLS 等真实原因，不再只显示 `fetch failed`。
- `scripts/deck-generation-worker.mjs`：生成 PPT 的 Codia 默认地址统一为 `https://openapi.codia.ai`；未收到 HTTP 响应的瞬时网络故障最多尝试三次，HTTP 400/401/402/403 等业务响应不盲目重试。
- `scripts/ppt-polish-worker.mjs`：美化 PPT 使用相同官方地址、同样的三次短重试和详细网络错误；没有修改美化方案、逐页生图、确认或返工业务。
- `app/api/employee/services/[id]/image-to-pptx/route.ts`：图片转 PPT 的默认地址和瞬时网络重试与前两条链路保持一致。
- 已重启本项目开发服务，使两个 PPT 后台执行脚本真正加载新代码；当前本机入口仍为 `http://localhost:3000`。

### 验收与安全边界

- `node --check`、`npx tsc --noEmit` 通过；`npm run lint` 0 错误，仅有设计脚本原有 11 条未使用警告。
- 未经项目 owner 明确授权，不使用 `.env` 中真实 Codia Key 请求外部接口。零费用的 `GET /v2/open/credits` 仍需明确授权后才能区分“Key/订阅/额度响应”和“真实网络失败”。
- 生成 PPT、美化 PPT、图片转 PPT 三者现在共用一致的 Codia 传输保护，但各自的业务任务、预览文件和最终交付文件仍然隔离。

## Codia `invalid content-length` 最终修复（2026-08-04）

- 用户重试生成 PPT 后出现 `UND_ERR_INVALID_ARG · invalid content-length header`。该错误由 Node/Undici 在本机组装请求时抛出，请求尚未到达 Codia，因此与 `CODIA_API_KEY`、余额、订阅和 Codia HTTP 402/403 无关。
- 根因是项目构造 multipart PDF 上传请求时手动设置了 `Content-Length`；Undici 不接受这条手写长度。修复方式是删除手写请求头，让 `fetch` 根据实际 `Buffer` 请求体自动计算长度。
- 同类代码已在三条交付链路一起修复：`scripts/deck-generation-worker.mjs`（生成 PPT）、`scripts/ppt-polish-worker.mjs`（美化 PPT）、`app/api/employee/services/[id]/image-to-pptx/route.ts`（图片转 PPT）。业务流程、预览图和已有 PDF 均未改动。
- 使用无效测试 Key 向 `https://openapi.codia.ai/v2/open/uploads` 发送最小 multipart 请求后，已收到 Codia 的结构化 `401 verify failed, invalid key`。这证明上传请求现在能到达 Codia，且本机不会再报 `invalid content-length header`；测试没有使用或消耗真实 Key。
- 后台执行脚本不热更新。修改后必须停止旧的项目进程并重新运行 `npm run dev`，再从原任务点击“重试生成 PPT”。若下一次收到 402/403，才按 Codia 额度或权限处理。
## GitHub 发布与模型交接记录（2026-08-04）

- `README.md` 已改为项目主页介绍，说明客户端、员工工作台、生成 PPT、美化 PPT、多学校权限、服务端 AI 接入和系统骨架。
- 新增 `docs/model-handoff.md`，作为更换模型或新开任务时的最短接手说明。
- 新模型应依次只读：`AGENTS.md`、`docs/model-handoff.md`、`docs/project-control-workflows.md`、`README.md`；读完先复述理解、修改范围和验证方式，不要立即改代码。
- 本次发布前必须确认 `.env`、真实 API Key、`prisma/dev.db`、`uploads/`、构建缓存和本地运行产物没有进入 Git。
- 当前仓库主页以 `README.md` 为准；历史归档仅用于追溯，不能覆盖 `AGENTS.md` 和项目掌控手册中的当前规则。

## 生成 PPT 高级版完整改造与故障修复记录（2026-08-05 至 2026-08-09）

> 这一节是本轮“生成 PPT → 高级版”超长话题的完整交接说明。新话题、新模型或后续开发必须先读完本节，再结合 `docs/project-control-workflows.md` 和真实代码判断现状。不要只看早期截图或旧流程猜测当前实现。

### 一、本轮改造的目标与严格范围

- 本轮只允许修改“生成 PPT → 高级版”的功能、页面和后台链路。快速版、美化 PPT、独立生图、图片转 PPT、登录、权限、客户端和其他已经完成的模式不得被顺带重构。
- 用户对模型职责的最终定义是：GPT-5.6 是真正负责理解和决策的“大脑”，Image2 是只负责执行画面的“手”。不能让 Image2 自己阅读几十份原始资料、猜事实或决定整套逻辑。
- 用户提供的逐页大纲决定 PPT 有多少页、每页大标题是什么；用户资料是内容来源。GPT-5.6 必须按大纲逐页从资料中找到对应事实、数字、专名、结论和来源位置，再写成一份可确认的完整逐页方案。
- 用户给出的国家金奖、国家银奖和模板 PPT 是单页质量参照，目标是提高每一页的布局、信息组织、视觉主体、图片素材方向和逻辑表达，不是照抄这些文件的整套结构。
- 严肃汇报页面应避免大量卡通小图标、廉价模板卡片、无意义圆角框和只起装饰作用的小元素。页面需要有明确的视觉重心、结构层级和交付感。
- “效果优于参考作品”属于最终人工审美验收目标，不能仅凭构建通过就宣称已经客观实现；必须以真实成图和项目 owner 的判断为准。

### 二、当前用户实际经历的完整流程

1. 用户进入员工工作台，打开“小 W · PPT 智能模式”，选择“生成 PPT → 高级版”。
2. 用户填写项目名称、用途、简介和逐页结构；可以直接填写每页大标题、小标题和想讲的内容，也可以上传大纲文件。
3. 用户上传至少一份内容资料，并选择内置配色或上传一张配色参考图。界面必须把“内容资料”“PPT 结构”“视觉参考”分开显示，配色图不能混入内容资料列表。
4. 本地资料解析程序读取 PDF、Word、Excel、PPT 和文本中的文字、表格及来源位置；高级版最多同时解析 3 份资料，但不会把文件拆成不同版本，也不会丢失原文件关联。
5. 普通解析确实拿不到足够文字时，才允许 GPT-5.6 对 PDF/PPT 渲染页做 OCR/语义补救；OCR 只恢复标题、正文、数字和专名，不建立视觉素材库。
6. GPT-5.6 按用户逐页结构，从全部文字证据中匹配内容，一次生成整套完整方案。方案包含页面任务、正文、结论、来源、风险和交给 Image2 的画面执行方向。
7. 用户只确认这一份完整逐页方案。旧版“先确认结构、再确认内容、再确认模型处理结果”的多份近似表单已经取消；新任务不能恢复成两次或三次重复确认。
8. 用户在确认前可以直接编辑页面正文、结论和画面方向，也可以“返回修改任务资料”，保留、取消或新增资料后重新整理。
9. 用户点击“确认整套方案并生成预览”后，高级版最多同时向 Image2 发送 6 个单页任务。每一页生成一张完整 16:9 PNG。
10. 全部页面完成后进入预览。用户可以点击放大、主动“重新生成本页”或“更贴近上一页”；系统不会因普通审美差异自动替用户重画。
11. 用户确认整套预览后再生成图组、PDF 和 PPTX。Codia 转换失败不能删除或隐藏已经生成的 PNG 和 PDF。

### 三、本地程序、GPT-5.6 与 Image2 的固定职责

#### 本地程序

- 保存原始文件、资料分类、解析状态、证据、来源位置、逐页任务包、Image2 调用记录和最终文件。
- 负责并发、状态流转、失败恢复、去重和安全检查，不自行创作事实。
- 普通文档优先本地解析文字；不能为了“看起来更智能”把所有资料页都发送给视觉模型。
- 内容资料图片不提取、不裁切、不复用为页面素材，也不交给 Image2；这条规则是用户明确要求的最终方向。

#### GPT-5.6

- 文字服务使用 `AI_TEXT_API_KEY`，当前统一模型名为 `gpt-5.6-sol`；高级版可通过 `DECK_ADVANCED_TEXT_MODEL` 独立覆盖，但当前仍应保持 `gpt-5.6-sol`。
- 负责读取文字资料、必要的 OCR 补救、按页匹配证据、组织正文、保留来源、确定页面结论和写清画面执行合同。
- 每页任务包必须区分：必须原样出现的标题/数字/日期/专名，允许压缩表达的内容，只规定视觉方向的内容，以及禁止猜测的内容。
- 整套方案同时定义统一的配色职责、字体气质、页眉页脚、背景、卡片、装饰和视觉母题，避免 Image2 每页自由发挥成不同模板。

#### Image2

- 图片服务使用独立的 `AI_IMAGE_API_KEY` 和 `gpt-image-2`，两把 Key 不能与文字 Key 混用。
- Image2 只接收 GPT-5.6 已确认的单页任务包、整套风格条带，以及用户上传的配色参考图；它不读取全部原始资料，也不决定事实。
- 参考图模式使用 `/v1/images/edits`。配色参考图只传递背景、文字、强调色、辅助色和比例关系，不能复制其中的文字、logo、事实或完整构图。
- 没有视觉参考时使用 `/v1/images/generations`。两条路径都必须使用高级版自己的等待上限和调用记录。

### 四、页面内容、视觉统一和真实性规则

- 整套 PPT 共享同一份视觉指纹；统一内容包括颜色职责、字体层级、页眉页脚、背景语言、图形语言、卡片边界和装饰克制度。
- 每页的 `visual_strategy` 与 `main_visual_brief` 必须具体说明主体、构图、景别、层级、留白和情绪，不能只写“高级、科技、好看”。
- 逐页内容包是事实素材库，不等于所有文字都要塞上屏。只有用户锁定的原文必须逐字保留，其他内容按页面密度压缩成受众可读的短句。
- 正文页根据资料量采用标准或紧凑信息密度，避免大面积无意义留白，也避免把整段材料缩成不可读小字。
- 封面根据整份 PPT 的主题做强主视觉，少文字、快速建立主题。
- 最后一页必须负责情绪收束。纯结尾页只保留一句有力量的结论和最多一条短支撑语；详细价值、路线和指标应在前一页讲完。内容型结尾仍需保留用户明确锁定的实质信息。
- Image2 可以生成概念视觉和基于已确认事实的图表、时间轴、流程、对比或系统图。
- 禁止生成可识别学校/机构招牌、logo、证书、合同、报告、产品标签、客户现场、官方截图或其他会被误认为真实证明的画面。
- 资料不足时必须省略或提示风险，不能补造数字、日期、专名、项目成果或真实场景。

### 五、成本、并发和自动返工的最终规则

- 高级版初次生成默认每页只调用一次 Image2；10 页 PPT 的正常初始预算就是 10 次图片调用。
- 高级版最多 6 页并发。并发只提升吞吐，不改变每页任务包，也不依赖先生成一张锚点页，因此不会故意把整套任务重新串行化。
- 不做逐页 GPT 看图检查，不做自动 Image2 重绘，不因普通审美问题自动增加费用。
- 全部页面完成后只允许 GPT-5.6 做一次后台交付安全检查，检查空白/损坏、大面积乱码、明显伪造证明、标题与画面直接冲突和核心内容严重裁切。检查不调用 Image2，不自动返工，服务不可用也不阻断预览。
- “重新生成本页”和“更贴近上一页”都必须由用户主动点击；每次点击是一笔明确的人工 Image2 调用。调用次数在任务统计中区分初始、已发起、已完成、人工重生和自动重绘。
- Image2 超时后不自动重试。原因是本机停止等待不等于上游一定停止计费，自动重试可能形成两笔付费请求。

### 六、当前关键配置及含义

| 配置 | 当前默认值 | 只影响什么 |
| --- | --- | --- |
| `DECK_ADVANCED_TEXT_MODEL` | `gpt-5.6-sol` | 生成 PPT 高级版文字大脑 |
| `DECK_ADVANCED_SOURCE_CONCURRENCY` | `3` | 高级版同时解析的资料数 |
| `DECK_ADVANCED_PLAN_TIMEOUT_MS` | `900000` | 最终完整方案单次请求，15 分钟 |
| `DECK_ADVANCED_GENERATION_CONCURRENCY` | `6` | 高级版同时生成的页面数 |
| `DECK_ADVANCED_IMAGE_TIMEOUT_MS` | `600000` | 高级版单次 Image2 请求，10 分钟 |
| `DECK_ADVANCED_REFERENCE_IMAGES` | `1` | 高级版启用真实配色参考图 `/images/edits` |

- 这些配置只用于高级版时，不得顺手改变快速版、美化 PPT 或独立生图的行为。
- `.env.example` 和 `.env.production.example` 只保存空 Key 与示例值；真实 Key 只能存在本机/服务器 `.env`，绝不能进入 Git。

### 七、本轮遇到的关键故障、根因和最终修复

#### 1. 文字模型 502，不是资料问题

- 裸模型名 `gpt-5.6` 在当前 YZStudio 文字 Key 分组曾返回上游 502；相同地址、Key 和最小请求体使用 `gpt-5.6-sol` 可以正常返回。
- 因此全局文字模型和高级版覆盖都统一为 `gpt-5.6-sol`。不要把高级版重新改回未经验证的裸 `gpt-5.6`。

#### 2. 最终完整方案在 300 秒出现 `UND_ERR_HEADERS_TIMEOUT`

- 最终方案需要同时审阅整套 PPT 的页序、来源、视觉节奏和画面合同，原先虽然设置了 15 分钟 `AbortController`，但 Node/Undici 仍有独立的默认 300 秒首包等待，导致实际在 5 分钟先失败。
- `scripts/ai-service-client.mjs` 现在为每个请求创建匹配预算的 Undici `Agent`/`ProxyAgent`，把 `headersTimeout` 和 `bodyTimeout` 放到调用者总预算之后；最终方案总预算仍由 900000 毫秒控制。
- 最终方案遇到 `UND_ERR_HEADERS_TIMEOUT` 时直接失败并保留任务，不再被“fetch failed 属于临时错误”的通用规则连续重试三次。其他短暂 502/503、网络断线仍可按原策略短重试。

#### 3. 参考图生成全部出现 `failed to parse request body`

- 为修复首包超时，直连请求从 Node 全局 `fetch` 切到项目安装的 `undici@8`；但高级版参考图请求当时仍使用 Node 24 内置 Undici 7 的全局 `FormData`。
- `undici@8` 不识别另一版本的 `FormData`，实际把整个请求发成 `Content-Type: text/plain`，正文只有 `[object FormData]`，所以 YZStudio 无法解析图片上传。
- `scripts/deck-generation-worker.mjs` 现在从同一个 `undici` 包导入 `FormData`。本地传输测试已确认请求恢复为带 boundary 和图片字段的 `multipart/form-data`。
- 判断这类故障时应看 `DeckGenerationImageCall`：如果每页都是 `/images/edits`、相同 referenceCount、相同解析错误，优先检查共同传输层，不要归咎于用户资料或逐页提示词。

#### 4. Image2 偶发超过 300 秒，手动重生却成功

- 一次真实 10 页任务中，第 7 页首次 `/images/edits` 从开始到本机终止正好 300 秒；用户手动重生同一页约 68 秒成功。其他页面也曾耗时 173 秒、233 秒，证明 6 并发下上游偶尔会排队。
- 高级版参考图编辑和无参考图文生图现在都使用 `DECK_ADVANCED_IMAGE_TIMEOUT_MS=600000`，单次最多等待 10 分钟。
- 延长等待不会增加正常调用次数，只是让已经发出的付费请求有更多时间返回；达到 10 分钟后直接失败，不自动发出第二次 Image2 请求。

#### 5. 修改代码后页面仍重复旧错误

- Next 页面可以热更新，但 `scripts/deck-generation-worker.mjs` 这类后台执行脚本不会热更新。
- 修改高级版后台代码或 `.env` 后必须精确重启本项目的 `npm run dev` 或 `npm run dev:lite`；只刷新网页不会生效。
- Windows 下只能停止本项目对应的进程树，不能批量结束电脑上全部 `node.exe`。

### 八、已经修复的主要用户体验问题

- 上传区和任务资料展示把内容资料、大纲和配色参考图分组，不再让参考配色图看起来像跑进了内容资料。
- 高级版只保留一份完整方案确认，不再展示肉眼几乎相同的第二份、第三份表单。
- “返回修改任务资料”已经有真实接口，能够修改项目说明、结构、配色、统一要求和资料选择；不能再弹出未完成的空白面板。
- 深色工作台中的表单、按钮、标签和下拉状态已经补充样式，避免白花花的原生控件和只有点击后才出现文字的空白按钮。
- 参考图模式只显示版式语言，不再把“蓝金、黑金、红白”等内置配色名称混入参考图任务。
- 页面显示 Image2 调用统计，让用户能看到初始预算、实际发起、完成、人工重生和自动重绘；自动重绘应保持 0。

### 九、核心文件地图

- `components/employee-app.tsx`：高级版表单、资料分类、返回修改、完整方案确认、任务状态、调用统计和预览交互。
- `app/employee/employee.css`：高级版表单、按钮、方案和预览卡片的石墨黑工作台样式。
- `app/api/employee/services/[id]/deck-generation/runs/`：创建任务和读取任务。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/settings/route.ts`：返回修改并保存初始任务资料。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/pages/route.ts`：保存用户编辑后的完整逐页方案。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/confirm/route.ts`：确认整套方案并进入生图。
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/slides/[slideId]/regenerate/route.ts`：人工重新生成和贴近上一页。
- `scripts/deck-source-parser.mjs`：本地文字解析、来源位置和必要 OCR 输入准备。
- `scripts/ai-service-client.mjs`：YZStudio 文字/图片连接、Undici 首包/正文/总预算和错误详情。
- `scripts/deck-generation-worker.mjs`：高级版资料整理、GPT-5.6 完整方案、Image2 任务包、最多 6 页并发、调用记录、后台安全检查和文件交付。
- `prisma/schema.prisma`、`scripts/init-db.mjs`：高级版任务包、视觉指纹、调用次数和安全检查等持久化字段。
- `skills/deck-generation/advanced-single-slide-director/`：高级版单页导演规则、页面原型与真实性边界。
- `docs/project-control-workflows.md`：项目 owner 可直接验收的完整用户流程。

### 十、当前验证事实与不能夸大的部分

- 已有真实 10 页高级版任务完成 10/10 页面并成功生成 PDF；其中一次 300 秒图片超时经人工重生成功，这次事实直接推动了 10 分钟 Image2 上限。
- 参考图 `/images/edits` 多图输入在真实任务中成功；`FormData` 修复后还通过了不调用外部服务的本地 multipart 图片包验证。
- `npm run lint` 通过，无错误；仍只有 `scripts/design-agent-worker.mjs` 原有的 11 条未使用函数警告。
- `npm run build -- --webpack`、`npx tsc --noEmit`、`npx prisma validate` 通过。
- 员工工作台 `http://localhost:3000/employee` 已验证返回 HTTP 200，生成 PPT 后台执行脚本只运行一份。
- 15 分钟最终方案上限和 10 分钟 Image2 上限已经通过代码、Agent 配置、本地延迟响应和构建检查；没有为了测试极限时长故意触发额外的付费长请求。
- 页面审美仍需项目 owner 对真实 PPT 逐页验收。代码检查通过不能替代“是否达到国家金奖/银奖参考作品水平”的人工判断。

### 十一、新话题接手时的硬性要求

1. 先读 `AGENTS.md` 本节，再读 `docs/project-control-workflows.md` 的“生成 PPT：当前交付流程”，然后检查真实代码和 Git 状态。
2. 先向项目 owner 复述当前高级版流程、准备修改的文件、明确不修改的其他模式、验证方式和是否会产生付费请求；不要读完就直接大改。
3. 必须从最新稳定 `main` 创建新的 `codex/<功能名>` 分支，不得直接在 `main` 开发。
4. 不得恢复多份方案确认，不得重新把内容资料图片作为 Image2 素材，不得让 Image2直接读取整包资料，不得恢复逐页 GPT 看图和自动 Image2 返工。
5. 不得把裸 `gpt-5.6`、默认 300 秒最终方案首包限制或跨版本全局 `FormData` 重新带回高级版。
6. 诊断失败时先查数据库中的任务、页面和 Image2 调用记录，区分文字模型、图片请求体、上游超时、Codia 和前端旧状态；不能只根据界面一句错误猜测。
7. 修改后台执行脚本后必须重启本项目服务，并确认 `/employee` 可访问且只有一个生成 PPT 后台执行脚本。
8. 付费请求要按用户授权执行。不得为了验证而批量重生全部页面；能用本地传输测试、无效 Key 或单页验证解决的问题，不应产生整套重复费用。
9. 完成后运行与风险匹配的检查，先推送功能分支；只有功能和真实体验确认稳定后，才合并并推送 `main`。

## Git 分支发布规则

- `main` 只保存已经完成验证、可以随时恢复和部署的稳定版本；禁止直接在 `main` 上开发新功能。
- 每次开始一个新功能或独立修复，必须先从最新 `main` 创建一个 `codex/<功能名>` 分支，再开始修改。
- 开发过程只提交并推送当前功能分支，不得提前把未验证代码推入 `main`。
- 功能分支至少通过与改动风险相匹配的检查；常规要求为 `npm run lint`、`npm run build -- --webpack` 和 `npx tsc --noEmit`，涉及界面时还要完成对应视觉与交互验收。
- 功能确认稳定后再合并到 `main` 并推送；合并后保留功能分支作为开发记录，除非项目 owner 明确要求删除。
- `.env`、API Key、`prisma/dev.db`、`uploads/`、`.codex-tmp/`、构建缓存和本地生成文件禁止提交或上传。
- 项目 owner 不需要操作 Git 命令。以后只需说明要开发的功能，Codex 负责创建分支、验证、提交、推送，并在准备合并 `main` 时说明验证结果。
