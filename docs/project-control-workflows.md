# PPTagent 项目掌控手册

这份文档给项目 owner 使用，目的不是解释技术细节，而是让你能检查“我让 Codex 做的功能，最后到底按什么流程交付给用户”。

当前功能状态、第三方依赖和本机验证结果统一记录在 `docs/current-project-memory.md`。本手册只负责业务流程和验收步骤；其中带日期的故障记录属于历史背景，不能单独证明当前环境已经可运行。

以后新增或修改关键流程时，优先用这里的词：

- 用户可见入口：用户在哪里点。
- 用户填写内容：用户必须提供什么。
- 中间确认点：系统是否先给方案、是否需要用户确认。
- 页面预览：是否先给图片预览，用户能否逐页检查。
- 返工按钮：用户能否重做单页，按钮应该触发什么。
- 最终交付物：最终给 PDF、PPTX，还是只给图片。
- 后台执行脚本：代码里常叫 `worker`，意思是“在后台不断检查任务并执行的脚本”，不是神秘模块。
- API 接口：前端按钮请求的后端入口。
- 存储位置：任务记录、图片、PPTX 文件落在哪里。

## 关键词对照

| 我之前常说的词 | 以后文档里的说法 | 当前真实文件 |
| --- | --- | --- |
| worker | 后台执行脚本 | `scripts/workers/deck-generation/deck-generation-worker.mjs`、`scripts/workers/ppt-polish/ppt-polish-worker.mjs` |
| run | 一次生成任务 / 一次美化任务 | 数据库记录或 `workspace/ppt-polish-runs/*.json` |
| slide | 单页预览图任务 | 生成 PPT 存数据库，美化 PPT 存 JSON |
| plan_ready | 方案待确认 | 用户还没点“确认生成/确认方案” |
| generating | 正在生成页面预览 | 后台正在出 16:9 图片 |
| review_ready | 预览待确认 | 页面图已出完，用户可以检查 |
| ppt_ready | PPTX 已生成 | 可以下载 PPTX |

## 员工账号登录、扫码登录与管理控制台

### 这次改造解决什么

员工打开 `/employee` 后，默认使用由平台管理员开通的“用户名 + 密码”登录；微信和企业微信扫码保留为可选入口。账号密码只以安全哈希保存，重置密码由平台管理员在管理控制台完成，忘记密码不提供邮件或短信绕过。

平台管理员不属于员工项目角色，拥有全局访问权。其他账号统一是普通员工；被派到具体项目后才获得“负责人”或“普通员工”项目身份。

系统能取得并保存的是用户授权后由微信开放平台返回的：

- 微信 OpenID
- 同一开放平台主体下可能返回的 UnionID
- 微信昵称
- 头像
- 最近登录时间和登录次数

系统不会从扫码流程取得微信号、手机号、密码、聊天记录或联系人，也不能凭 OpenID 直接添加用户微信。账号密码仅在服务端校验，绝不返回密码或密码哈希。

普通微信只能证明“这个微信账号完成了授权”，不能证明用户属于哪个工作区。因此用户选择工作区后仍默认进入待审批，归属必须由平台管理员人工核对。

企业微信在工作区提供自建应用授权后，可以取得通讯录 UserID、姓名、头像、职务和部门编号，能够证明该账号属于所选工作区的授权通讯录范围。首次登录仍进入待审批，由平台管理员决定是否开通和具体功能。

### 真实扫码前必须具备什么

普通微信需要在微信开放平台创建“网站应用”并开通微信登录，提供：

- 网站应用 `AppID`
- 网站应用 `AppSecret`
- 已在微信开放平台登记的公网 HTTPS 回调域名

企业微信需要每所学校的企业微信管理员创建自建应用，提供：

- `CorpID`
- `AgentID`
- 应用 `Secret`
- 企业微信后台登记的可信 HTTPS 回调域名

普通微信不需要学校企业微信管理员，但仍不是“生成一个任意二维码就能识别微信身份”。任一登录方式没有对应真实凭据时，该标签页会明确显示尚未接通，不展示假二维码；另一种已配置的登录方式仍可正常使用。

服务端配置示例在：

- `.env.example`
- `.env.production.example`

核心配置：

- `WECHAT_OPEN_APP_ID`
- `WECHAT_OPEN_APP_SECRET`
- `WECHAT_CALLBACK_ORIGIN`
- `EMPLOYEE_ORG_SLUG` / `EMPLOYEE_ORG_NAME`
- `EMPLOYEE_BOOTSTRAP_USERNAME` / `EMPLOYEE_BOOTSTRAP_PASSWORD`（仅首次部署、管理员还未设置账号密码时使用一次；真实值不能提交）
- 多学校使用 `EMPLOYEE_ORGANIZATIONS_JSON`
- 企业微信单学校使用 `WECOM_CORP_ID`、`WECOM_AGENT_ID`、`WECOM_SECRET`
- 企业微信多学校使用 `WECOM_ORGANIZATIONS_JSON`

建议保持 `WECHAT_AUTO_APPROVE=0`。首次部署优先在不提交的环境变量中设置管理员初始用户名和密码；也可通过已有平台管理员的扫码/本地开发会话进入控制台后设置。扫码 owner 绑定仍可用 `WECHAT_PLATFORM_ADMIN_OPENID` / `WECHAT_PLATFORM_ADMIN_UNIONID` 配置。

### 员工首次进入的完整过程

1. 平台管理员在“管理控制台”开通姓名、初始用户名与初始密码，并选择普通员工或平台管理员。
2. 员工用账号密码直接登录；连续失败会被短时限制，忘记密码由平台管理员重置。
3. 平台管理员将员工派遣到项目，指定负责人或普通员工；未派遣的普通员工看不到该项目。
4. 员工在同一项目内共同使用文稿、PPT 生成/美化/生图及项目共享素材；个人 AI 对话、夹子和未共享素材保持私有。
5. 微信/企业微信仍可作为可选登录方式。首次扫码建立待审批成员，平台管理员核对归属后开通账号与功能。

真实文件：

- 登录前端：`components/employee/employee-login.tsx`
- 工作区配置：`lib/employee-workspaces.ts`
- 普通微信接口：`lib/wechat.ts`
- 企业微信接口：`lib/wecom.ts`
- 普通微信登录配置与回调：`app/api/employee/auth/wechat/`
- 企业微信登录配置与回调：`app/api/employee/auth/wecom/`
- 登录会话、角色和权限：`lib/employee-auth.ts`
- 密码哈希与登录失败保护：`lib/employee-password.ts`
- 账号、成员身份、项目成员与登录记录：`prisma/schema.prisma`

### 管理员怎样控制成员

平台管理员进入左侧“管理控制台”，可以：

- 查看待审批、已启用、已停用成员。
- 按工作区、状态、姓名和用户名筛选。
- 批准或停用成员。
- 新增员工和平台管理员，修改姓名、初始用户名和密码；员工忘记密码可由平台管理员重置。
- 在“账户与权限”中移除非当前登录员工。移除会立即撤销该工作区登录、订单负责人和项目协作关系，但保留历史交付版本、生成记录和操作日志；系统不允许移除自己，也会阻止移除最后一位启用中的平台管理员。
- 派遣员工到项目，并在项目内设置负责人或普通员工。
- 单独开关订单、客户消息、团队、在线编辑、AI 助手、智能 PPT、素材库、图片工具和导出。
- 查看最近登录、负责订单数、生成任务数和操作次数。

### 平台管理员怎样管理订单

当前业务以人工一对一接单、交付为主，客户端尚未承担自动下单。因此平台管理员可以直接在员工端的“订单任务”页维护订单：

1. 在页面右上方订单总数下点击“新增订单”。
2. 在悬浮窗口填写订单名称、服务类型、客户信息、金额、下单时间、状态和完成进度。客户信息可记录姓名、微信、手机号或其他已有联系线索；其中含有效手机号时系统会复用该手机号已有的客户账户，否则仅建立不对外展示的内部关联账户。不会凭空建立咨询会话。
3. 新订单自动进入当前平台工作区，随后可使用既有“派遣”功能安排负责人和普通员工。
4. 每张订单卡仅对平台管理员显示“修改”“删除”。修改会保留服务编号与现有协作关系；删除前会再显示订单名称、编号、状态和不可撤销提示，必须第二次点击“确认删除订单”。
5. 删除会级联清除该订单在数据库中的项目成员、活动、工作文稿记录、生成记录和交付版本；不会删除客户账户，也不会直接删除服务器本地已生成文件。本地文件由后续受控清理流程处理，避免误删其他订单的文件。

新增、修改、删除接口均由服务端再次确认当前会话是具备订单权限的平台管理员；普通员工既没有入口，也不能绕过界面调用接口。

控制台前端：

- `components/employee-app.tsx` 中的 `EmployeeAdmin`

控制台后端：

- `GET /api/employee/admin/overview`
- `PATCH /api/employee/admin/members/[membershipId]`
- `POST /api/employee/admin/services`
- `PATCH`、`DELETE /api/employee/admin/services/[id]`
- 文件目录：`app/api/employee/admin/`

权限不是只在界面隐藏。关键订单、消息、在线编辑、AI、生图、生成 PPT、美化 PPT、图片工具和导出接口都会再次检查：

1. 当前会话是否有效。
2. 成员是否已审批且未停用。
3. 对应功能是否已开启。
4. 成员是否属于该订单所在工作区。
5. 普通员工是否已被派遣到该项目；平台管理员不受项目范围限制。

统一检查位置：

- `lib/employee-auth.ts` 中的 `authorizeEmployeeService`

### 多工作区怎样复用

当前实现按“工作区”隔离项目和员工数据。新增工作区时：

1. 在服务端 `EMPLOYEE_ORGANIZATIONS_JSON` 中新增工作区名称和唯一标识。
2. 重启网站。
3. 登录页出现工作区选择。
4. 该工作区用户可以继续使用共用的普通微信入口；若该工作区提供企业微信自建应用，再把其凭据写入 `WECOM_ORGANIZATIONS_JSON`。
5. 普通微信扫码只提交加入申请；企业微信扫码会额外验证该用户属于工作区授权通讯录。
6. 平台管理员批准并分配功能权限，再派遣员工进入具体项目。

普通微信网站应用可以由整套产品共用，不需要每个工作区提供密钥。企业微信凭据必须按工作区配置，不能拿 A 工作区的 Secret 验证 B 工作区成员。没有“学校管理员”角色；只有平台管理员可以跨工作区查看和管理。

数据库升级前已经存在的订单，会在第一次同步工作区配置时自动归到配置列表中的第一个工作区。后续新订单必须带工作区归属；没有工作区归属的订单不会授权给普通员工。

### 当前验收点

- `/employee` 不再出现员工手机号、验证码和员工码输入框。
- 登录页默认选择微信，并提供可切换的企业微信标签。
- 未配置微信开放平台时，页面明确显示缺少配置，不伪造可用二维码。
- 未配置企业微信的学校在企业微信标签明确显示待配置，不影响普通微信入口。
- 普通微信登录不会宣称已经验证学校身份。
- 企业微信只有在学校真实应用授权后才宣称验证通讯录身份。
- 未审批成员不能看到订单和客户信息。
- 停用成员已有会话会被注销。
- 管理员关闭某项功能后，左侧入口和工作台按钮消失，对应后端接口也返回无权限。
- 学校 A 的普通管理员和成员不能查看学校 B 的成员、订单和文件。
- `WECHAT_OPEN_APP_SECRET` 与 `WECOM_SECRET` 只存在服务端环境变量，不能返回浏览器。
- 尚未上线、没有公网 HTTPS 回调域名时，可在本机 `.env` 设置 `WECHAT_DEV_BYPASS=1`。员工扫码页会出现“暂不扫码，进入本地工作台”按钮，点击后以平台管理员进入；该入口只用于本机开发，生产环境的服务端接口会直接拒绝。

本次已经执行：

- `npx prisma validate`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build -- --webpack`
- `node scripts/employee-visual-test.mjs`

## 生成 PPT：当前交付流程

### 用户可见入口

员工进入 `/employee`，打开某个订单的工作台，点击右下角“小 W · PPT 智能模式”，选择“生成 PPT”。

生成 PPT 现在分为两个入口：

- 快速版：少填写，由系统从资料中自动整理整套结构，适合普通任务和快速提案。
- 高级版：用户掌握每一页讲什么，系统负责读取大量资料、按页找证据并生成内容完整的预览，适合领导汇报、学校介绍等重要任务。

本次只修改生成 PPT。美化 PPT 和生图的入口、表单和后台流程没有改动。

相关前端文件：

- `components/employee-app.tsx`
- `app/employee/employee.css`

### 两种模式共用的输入与资料规则

两种模式都填写项目名称、汇报类型/用途和项目简介，也都可以：

- 一次拖入最多 30 份参考资料，总计不超过 500MB，单个文件不超过 200MB。
- 上传 PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV、JSON 和常见图片。
- 粘贴最多 5 万字的补充要求。
- 使用内置配色，或上传一张不超过 20MB 的 PNG、JPEG、WebP 作为配色参考。
- 勾选主色、页眉页脚、背景质感、卡片样式和装饰元素等统一要求。
- 卡片样式统一和装饰元素统一默认不勾选。
- 高级版至少必须上传一份真正的内容资料；大纲文件和配色参考图不算内容资料。前端和服务端都会检查。

“参考图配色”由本地程序提取背景色、正文色、强调色、辅助色和大致使用比例；Image2 只收到这份色值清单、文字规则和本地生成的风格条带，**绝不收到用户上传的配色原图**。两边都不能照抄参考图的文字、事实或完整页面布局。选择参考图配色但没有上传图片时，前端和接口都会阻止提交。

创建一次生成任务的接口：

- `POST /api/employee/services/[id]/deck-generation/runs`
- 文件：`app/api/employee/services/[id]/deck-generation/runs/route.ts`

上传资料保存位置：

- 内容资料和大纲：`uploads/employee-workspace/deck-generation/sources/`
- 配色参考图：`uploads/employee-workspace/deck-generation/themes/`

### 系统怎样读取大量资料

用户只负责把资料拖进页面，不需要自己做格式转换或摘要。

资料读取脚本：

- `scripts/workers/deck-generation/deck-source-parser.mjs`

当前读取规则：

- PDF：按页提取文字。
- Word：读取标题、段落和表格。
- Excel：按工作表和行保留内容。
- PPTX：按幻灯片提取文字和表格。
- 文本、Markdown、CSV、JSON：保留原始段落或行。
- 图片：交给视觉模型识别文字、图表和画面信息。

系统不会只生成一篇短摘要，而是同时保存：

1. 原始资料记录：文件名、文件类型、保存位置和解析状态。
2. 可检索证据：事实、数字、日期、专名、结论，以及“来自哪个文件、哪一页、哪一张幻灯片或哪个工作表”。
3. 页面内容包：只把当前页面需要的证据交给页面规划和生图，不相关资料不会塞进该页。

相关数据库记录：

- `DeckGenerationSource`：一份原始资料。
- `DeckGenerationEvidence`：一条带来源位置的证据。
- `DeckGenerationPagePlan`：用户确认后的单页结构和该页内容包。

### 快速版交付流程

#### 第一步：填写最少信息并提交

快速版保留页数滑杆，范围为 2 到 30 页。用户提供简介、资料和配色后点击“生成快速方案”。

后台执行脚本（工程文件 `scripts/workers/deck-generation/deck-generation-worker.mjs`）会：

1. 读取全部资料并保留来源位置。
2. 识别汇报对象、任务目标、必须回答的问题和资料中的可靠事实。
3. 自动组织封面、目录/过渡、正文和结尾页。
4. 为每页决定信息密度、版式类型、核心结论和可使用的数字。
5. 避免正文页只有几个空卡片；正文允许标准或紧凑信息密度。
6. 让封面和结尾页保持强情绪、少文字，中间页保持内容完整和视觉连贯。

#### 第二步：用户确认快速方案

任务进入“方案待确认”后，中间区域显示整套逐页方案。用户可以：

- 调整风格并重新整理方案。
- 检查每页标题、用途、信息密度和内容摘要。
- 确认方案后再开始生成页面预览。

确认前不会生成最终 PPTX，也不会无提示直接跳过方案。

### 高级版交付流程

#### 第一步：用户提交自己掌握的 PPT 结构

高级版不显示固定页数滑杆，页数由用户结构决定。用户可以：

- 直接填写每页大标题。
- 继续填写每页小标题、想讲的内容、必须出现的结论。
- 上传 PDF、DOCX、XLSX、PPTX、TXT 或 Markdown 大纲文件。
- 同时把全部背景资料一次拖入资料区；至少需要一份内容资料。
- 在“整套高优先级要求”中规定受众、禁用表达、必须强调的结论和整套视觉偏好。这里适合写“正文页优先图文相辅、不使用固定图片区”等强要求；它是制作约束，不作为独立事实来源。

系统先读取文字资料和大纲。高级版最多同时读取 3 份资料，仍完整保存每一份资料和来源位置，不会把资料拆成不同版本。普通解析无法取得足够文字时，才把 PDF/PPT 页面交给 GPT-5.6 做 OCR 补救；不会提取、裁切或复用内容资料图片。

#### 第二步：GPT-5.6 生成一份完整逐页方案，用户只确认一次

GPT-5.6 按每页标题、小标题和想讲的内容，从全部文字证据中匹配资料，并一次组成完整逐页方案。由于这一步必须同时审阅整份 PPT 的页序、页眉页脚、配色职责和视觉节奏，后台为它保留最长 15 分钟；HTTP 首包等待和响应正文等待也使用同一上限，避免 Undici 默认 300 秒先行中断。浏览器不会被卡住，用户可以离开后返回查看任务状态。若这一步最终仍触发首包超时，系统保留任务并直接报错，不会连续进行三次长等待。其他文字请求仍使用较短上限，避免网络故障长期占用任务。

页面会显示：

- 页面标题和匹配后的完整正文；正文可以直接修改。
- 关键数字、事实和结论。
- 每条证据的来源文件。
- 页码、幻灯片号、工作表或行等来源位置。
- 资料不足、来源冲突或数字风险提示。
- GPT-5.6 为 Image2 写好的画面执行方向，包括视觉策略、主体、构图、景别、留白方向和情绪。
- 每页的画面比重、画面单元及图文融合方式。每个画面单元会说明它服务哪条正文、阶段、对比、机制、背景或结果，用户可以在一次确认页核对。

用户可以直接修改页面任务、正文和结论，也可以返回修改任务资料，或按新版式重整整套方案。只有点击“确认整套方案并生成预览”后才进入生图。历史 `outline_ready` 任务显示“继续整理完整方案”，用于兼容旧任务；新任务不再出现第一份结构确认表单。

方案保存接口：

- `PATCH /api/employee/services/[id]/deck-generation/runs/[runId]/pages`
- 文件：`app/api/employee/services/[id]/deck-generation/runs/[runId]/pages/route.ts`

#### 第三步：逐页生成完整 16:9 图片

快速版确认方案后，或高级版确认整套逐页方案后，后台执行脚本开始生成完整 16:9 PNG。

生成规范位于：

- `skills/deck-generation/SKILL.md`
- `skills/deck-generation/source-grounding.md`
- `skills/deck-generation/outline-control.md`
- `skills/deck-generation/content-density.md`
- `skills/deck-generation/palette-reference.md`
- `skills/deck-generation/slide-image-specs.md`
- `skills/deck-generation/advanced-single-slide-director/SKILL.md`

这些规范要求图片模型：

- 只能使用内容包中允许的事实、数字和专名。
- 逐页内容包是事实素材库，不等于全部文字必须上屏；只有用户锁定的原文逐字保留，其他内容按页面密度压缩成受众可读短句，避免为了“信息完整”把整段资料缩成小字。
- “资料中的明确证据、资料中的现场照片、待匹配资料”等制作备注不能出现在最终页面；没有用户要求时也不能自行添加步骤编号或重复标题。
- 正文页根据资料量采用标准或紧凑信息密度，减少无意义留白和模板化 AI 卡片。
- 整套 PPT 共享配色职责、字体层级、页眉页脚和视觉母题。
- 封面和最后一页都少文字、强视觉。最后一页无论原资料包含价值、落地、路线、指标或下一步，非逐字锁定内容都压缩为一句有情绪力量的结论和最多一条短支撑语；详细内容应在前一页完成，最后一页只负责收束。
- Image2 可以生成概念视觉，也可以按已确认的数字、日期、标签和关系绘制图表、路线、流程与对比；信息不够时必须省略，不能猜测。
- 高级版所说的“插图”是可以单独替换的完整照片类图片框，不是流程图、时间线、图表、图标或装饰几何。只要正文有具体物体、材料、工艺、环境或应用情境，默认安排至少两张不同插图：一张主视图加一张不同的细节、工序或语境图，不能把同一场景裁两次凑数；两个或三个并列的具名痛点、阶段、案例或应用情境，分别使用两到三张插图并各自连到对应内容块。纯事实图表、纯数据表或已经完整标注的技术机制图可以少于两张；照片类图片框最多三个，不能用一张无关配图装饰多个独立论点，也不能随机拼贴。每页在主图加细节、三联故事带、照片锚点流程、双图对照、全景加证据带、图解加照片嵌图、纵向图片脊柱等轮廓中按内容选择，相邻正文不重复“左侧图解或卡片＋右侧一张竖图”。
- 高级版正文页会从用户填写的“PPT 结构”、本页画面合同和具体物体名自动形成公开视觉检索词；系统只接受许可明确的普通栅格图片作为语义参考，并以检索词和文件元信息排除人物、品牌、机构招牌、公文、截图与文档。参考图只帮助 Image2 理解通用物体、材料、工艺、景别与自然光，在这一次整页请求中重绘融合；不贴原图、不当资料证据、不读取其文字或事实。封面和结尾页不检索网络图，继续强情绪、少文字。
- 所有文字、图表和生成画面仍由 Image2 在一次请求中直接生成成同一张完整 16:9 页面图，不增加二次生图、后插图或自动返工。
- 多个画面必须共同服务一条阅读路径，不能拼贴无关图片，也不能把整套页面固定成左文右图、上文下图或统一底部图片区。
- 禁止伪造可识别学校/机构招牌、logo、证书、合同、报告、产品标签、客户现场、官方截图或任何看起来像真实证明的素材。

快速版当前同时生成 2 张；高级版默认同时生成 3 张，部署环境可按中转站实测容量调高，但最多 6 张。高级版单次 Image2 请求最长等待 10 分钟，避免上游排队超过 300 秒后迫使用户重新付费生成；达到上限后直接报告失败，不自动发起第二次 Image2 请求。高级版默认每页只调用一次 Image2，返回后立即保存成图，不再逐页调用 GPT-5.6 看图或自动返工。用户只看到排队、生成、完成或失败状态，Image2 调用统计会显示初次预计、已发起、已完成、人工重生和自动重绘次数。

高级版每一页使用 `/v1/images/edits` 接收整套共用的本地风格条带；参考图配色原图与内容资料图片都不会被加入参考图。正文页如找到合规公开视觉参考，可与风格条带在同一次请求中共同输入。所有页面从第一张开始共享同一份视觉指纹，不依赖某一张“锚点页”，因此不会把 6 并发重新变成串行。只有用户主动点击“更贴近上一页”时，才额外把上一页真实成图作为视觉语言约束纳入输入。

普通文档先由本地解析程序读取文字。只有解析文字少于安全阈值时，PDF/PPT 页面才短暂交给 GPT-5.6 做 OCR 补救；这些页面不会保存为高级版视觉素材，也不会建立视觉证据索引。封面根据整份 PPT 的主题与定位生成强主视觉，正文根据每页大标题和已确认内容执行，最后一页始终负责强情绪、少文字的收束。

高级版全部页面完成后**不再有任何额外模型调用**：Image2 成图保存后直接进入预览，可以马上逐页查看、放大、单页返工或转 PDF/PPT。（原先这里有一次"后台交付安全检查"——把整套缩略图交给 GPT-5.6 找空白页、乱码、伪造证明等问题；它只在通过时静默、发现问题也只提示不重绘，却要占用后台脚本 30–90 秒，已于 2026-09-30 按 owner 要求删除。防伪造的要求仍然生效，写在生成规则 `skills/deck-generation/illustration-system.md`。）

单页人工返工从已确认任务包、整套风格条带和配色规则重新开始，不把当前失败草稿继续传给 Image2。用户主动点击“更贴近上一页”时可额外输入上一页成图，但只用于对齐视觉语言。

单页预览和返工接口：

- `GET /api/employee/services/[id]/deck-generation/runs/[runId]/slides/[slideId]/image`
- `POST /api/employee/services/[id]/deck-generation/runs/[runId]/slides/[slideId]/regenerate`
- `action = reroll`：重新生成本页。
- `action = closer_previous`：把上一页真实成图交给 Image2，保留本页内容，只对齐视觉语言。

页面图片可以点击放大检查。

#### 第四步：用户确认预览后生成 PPTX

全部页面完成后，任务进入“预览待确认”。用户可以继续单页返工；确认整套预览后点击“生成 PPT”。

页图全部完成后，标题栏从左到右提供“下载图组”“生成 PDF”“生成 PPT”。下载图组会按页面顺序打包成一个 ZIP 文件夹，图片命名为 `01.png`、`02.png`……，便于用户直接交付、归档或交给其他工具继续处理。

- 图组 ZIP：`GET /api/employee/services/[id]/deck-generation/runs/[runId]/images`
- 生成 PDF：`POST /api/employee/services/[id]/deck-generation/runs/[runId]/pdf`
- 下载 PDF：`GET /api/employee/services/[id]/deck-generation/runs/[runId]/pdf`
- Codia 转 PPTX：`POST /api/employee/services/[id]/deck-generation/runs/[runId]/ppt`
- 下载 PPTX：`GET /api/employee/services/[id]/deck-generation/runs/[runId]/ppt`

生成 PPT 的 Codia 转换严格使用官方 v2 任务链路：先向 `https://openapi.codia.ai/v2/open/uploads` 以 `file` 字段上传已经确认的图片型 PDF，再向 `/v2/open/tasks` 提交 `operation: pdf_to_ppt`、`upload_id`、从 0 开始的全部 `page_no` 和项目标题。后台轮询任务成功后读取 `data.result.ppt_url`，下载并保存最终 PPTX。

`pdf_to_design` 与 `image_to_design` 返回的是可编辑设计树，不是 PPTX 文件，因此不用于这里的最终交付。生成 PPT 与美化 PPT 各自保存转换任务状态和最终文件，不互相覆盖；本次只调整生成 PPT 的后台转换脚本，没有改动美化 PPT 业务代码。

Codia 返回 402 表示余额或订阅不可用，403 表示当前 Key 或套餐无权调用对应接口，400 表示请求字段缺失或格式错误。`fetch failed`、TLS、socket 等表示没有收到 HTTP 状态码，属于网络连接问题，生成 PPT 后台转换脚本只会对这类瞬时连接失败自动重试一次，不能误报为 402/403。无论哪类失败，预览图和已生成 PDF 都保留，用户处理外部问题后直接点击“重试生成 PPT”，不需要重新分析资料或重新生图。

最终交付物：

- 完整页面预览图。
- PPTX。
- 按页顺序合成的 PDF。
- 高级版额外保留逐页结构、页面内容包和证据来源，便于追查内容为什么出现在这一页。

### 当前验收点

- 快速版仍然少填写，但必须真正读取资料并自动组织完整方案。
- 高级版必须支持大标题、小标题和“本页想讲什么”，不能只接收一句简介。
- 高级版必须至少上传一份内容资料，并能返回修改初始任务、保留/移除/新增资料。
- 大量资料由系统整理，用户不需要先转格式或写摘要。
- 高级版只显示一份完整逐页方案，不能再出现内容近似的两份确认表单。
- 用户在完整方案中能看到页面任务、正文、结论、画面方向、来源文件和来源位置。
- 用户在画面方向中能看到文字主导、图文均衡或视觉主导，以及每个画面服务的内容和整页图文关系。
- 未确认方案或内容前，不能直接生成页面或最终 PPTX。
- 参考配色图由本地程序提取颜色职责；原图不交给 Image2，只能通过色值清单、文字规则和本地风格条带控制颜色关系与视觉气质，也不额外消耗一次 GPT-5.6 配色分析请求。
- 参考图模式只显示“版式语言（不含配色）”，不能把“蓝金、黑金、红白”等内置配色名称混进最终任务。
- 参考图模式的版式选项使用独立无配色规则，描述图文叙事、技术说明、结论先行、系统关系、庄重层级、学术论证或路演叙事；它不是整套文字密度选项，密度仍由每页内容决定。
- 卡片样式统一和装饰元素统一默认不勾选。
- 高级版至少必须上传一份真正的内容资料；大纲文件和配色参考图不算内容资料。前端和服务端都会检查。
- 正文页不能只剩大量留白和几个空卡片。
- 页面预览图能点击放大。
- “重新生成本页”和“更贴近上一页”必须真实重新出图。
- 每页必须保存 GPT-5.6 到 Image2 的任务包和实际参考图传递记录；不再保存逐页质检报告，自动重绘次数固定为 0。
- 全部页面完成后不再做任何后台检查或额外模型调用，直接进入预览；是否返工完全由用户决定，系统不能自动消耗 Image2 额度（交付安全检查已于 2026-09-30 删除）。
- 右侧任务列表显示最新生成 PPT 任务，点击后能回到当前步骤。
- 快速版和高级版都使用同一条完整图片生图路线；高级版的区别是 GPT-5.6 按用户结构逐页取材、写画面合同，并用一次完整方案确认控制 Image2。

### 高级版返回修改与双模型职责

#### 返回修改初始任务资料

从资料排队、资料读取、逐页取材到完整方案待确认的全部生图前阶段，用户都可以点击“返回修改任务资料”，修改项目名称、用途、简介、大纲、版式、配色和统一要求，也可以保留、取消或新增已上传资料。页面把“内容资料”“PPT 结构”“视觉参考”分开显示，配色图不能混入内容资料列表。

- 保存后重新读取本次任务资料，重新生成逐页结构和下游视觉方案。
- 取消资料只删除本次任务里的关联记录，不删除磁盘上的原始上传文件。
- 高级版始终至少保留一份内容资料。
- 接口：`PATCH /api/employee/services/[id]/deck-generation/runs/[runId]/settings`。
- 文件：`app/api/employee/services/[id]/deck-generation/runs/[runId]/settings/route.ts`。
- 内容资料真实目录：`uploads/employee-workspace/deck-generation/sources/`。
- 配色参考图真实目录：`uploads/employee-workspace/deck-generation/themes/`。

#### 三方职责固定

- `AI_TEXT_API_KEY + gpt-5.6-sol`：真正的大脑。读取文字资料，必要时 OCR，按大纲匹配事实和来源，一次形成完整逐页方案、全局视觉指纹与每页画面执行合同。
- `AI_IMAGE_API_KEY + gpt-image-2`：唯一负责生成最终 PPT 页面图片。它只执行 GPT-5.6 已确认的单页任务包，不直接理解几十份原始资料，也不决定事实。
- 本地程序：保存资料、来源、任务包、Image2 调用记录和状态，编排两个模型；不自行拆图、裁图、补造产品、人物、场景或证明材料。

#### GPT-5.6 怎样把信息完整交给 Image2

每页生成前，GPT-5.6 的已确认结果会固化成一份单页任务包，包含：

- 必须原样出现的标题、数字、日期、专名和原文。
- 允许压缩表达的内容，以及只规定方向的内容。
- 页面结论、证据文件和页码、幻灯片号或工作表位置。
- `visual_strategy`、具体的 `main_visual_brief`、`visual_weight`、`visual_units`、`integration_rule`、版式意图、信息密度和前后页连续关系。
- 整套共用的配色、字体气质、页眉页脚、背景、卡片、装饰和图片语言指纹。
- 禁止新增、删除、改写或猜测的内容。

Image2 接收这份任务包和整套视觉规则条带。内容资料图片与配色参考图原文件不进入 Image2；配色只通过本地提取色值和文字规则传递。正文页如有合规公开视觉参考，会在同一次请求中作为“重绘语义参考”输入，禁止复制其文字、事实、logo、人物或完整构图。任务包保存在 `DeckGenerationSlide.renderContractJson`；整套视觉指纹保存在 `DeckGenerationRun.styleFingerprintJson`。

#### 谁来监督 Image2

单页图片生成后立即保存，不再调用 GPT-5.6 做逐页看图检查，也不出现“重新质检”或“按质检建议修正”。这避免每页多一次文字模型调用和额外等待，更不会触发自动 Image2 返工。

所有页面完成后**不再调用任何模型**，Image2 成图直接进入预览（原先的"交付安全检查"已于 2026-09-30 删除，见上文）。字段 `DeckGenerationRun.deckQualityStatus` 现在固定为 `disabled`，只作为历史字段保留。

它不是新的确认步骤；用户查看整套预览后，可以主动“重新生成本页”“更贴近上一页”，也可以直接生成 PDF/PPTX。

## 美化 PPT：当前交付流程

### 用户可见入口

员工进入 `/employee`，打开某个订单的工作台，点击右下角“小 W · PPT 智能模式”，选择“美化 PPT”。

相关前端文件：

- `components/employee-app.tsx`

### 用户填写内容

用户选择：

- 美化来源：当前文稿，或上传 PPTX
- 原页图片参考为必经步骤：确认后系统将整份 PPTX 在本地固化为按页 PNG。生成某页预览时，后台会把该页 PNG 与该页的用户要求一对一发送给图片模型；不会用提取文字替代原始页面图。
- 逐页修改想法不在创建方案时显示。确认按钮会先进入“正在准备逐页工作台”的等待阶段；转换完成时直接点击页面缩略图，再填写该页怎么改；页码由系统自动记录。

当前限制：

- 美化模式只支持 PPTX。
- 美化模式不提供关闭“原页图片参考”的开关；直接上传 PNG 图片集的入口尚未开放。

创建任务接口：

- `POST /api/employee/services/[id]/ppt-polish/runs`
- 文件：`app/api/employee/services/[id]/ppt-polish/runs/route.ts`

### 第一步：先生成“待确认方案”，不直接重绘

用户提交后，系统保存一次“美化 PPT 任务”，状态为 `plan_ready`。

任务记录保存位置：

- `workspace/ppt-polish-runs/[runId].json`

这个阶段不应该出现一堆空白转圈页面。

### 第二步：用户确认或返回修改美化方案

方案待确认时，页面只展示来源文件和即将进入的原页图片参考流程；不再展示或提交隐藏的默认勾选要求。

用户有两个明确选择：

- 返回修改：回到美化表单，恢复勾选要求；若来源是本地上传 PPTX，浏览器安全限制下需要重新选择文件。
- 确认并转换页面：系统先固化原稿页 PNG，随后停在缩略图选择页；用户可点击页面、填写该页要求并保存。再次点击“开始生成页面”才会逐页重绘。

用户确认后，前端请求：

- `POST /api/employee/services/[id]/ppt-polish/runs/[runId]/confirm`
- 文件：`app/api/employee/services/[id]/ppt-polish/runs/[runId]/confirm/route.ts`

确认时系统会：

1. 检查后台执行脚本是否有心跳。
2. 读取 PPTX。
3. 先由本机 ONLYOFFICE 转成 PDF，再固化为本次任务私有的逐页 PNG 图片集和页面清单；此步骤本身不调用图片模型。
4. 解析 `ppt/slides/slide*.xml`，识别每页文字，并把逐页修改想法匹配到对应页。
5. 页面图和清单会保存在 `uploads/employee-workspace/ppt-polish-runs/[runId]/source-pages/` 与同级 `source-pages-manifest.json`。任务展示全部缩略图，员工点选页面后再填写本页要求，页码由系统自动保存，不依赖文件夹名称或人工抄页码。
6. 页面图固化成功后，任务停在“请选择需要逐页修改的页面”。员工可以直接开始生成，也可以先为任意页面添加要求；之后才进入逐页生成预览。固化失败会明确报错，不会假装开始重绘。
7. 生成任一页时，后台只将“这一页原始 PNG”与用户在逐页工作台填写或通过“夹子”追加的要求交给图片模型；不把原始页文字、前后页文字或预设画面规则偷偷追加到提示词。若原页 PNG 缺失或图片编辑接口不可用，任务会明确失败，绝不退回纯文字生图。
8. “夹子”是员工级可复用提示词包，包含名称、颜色和提示词。可在任意单页右侧的胶囊入口中创建、编辑、保存或一键套用；已套用的夹子只在文本框下显示名称标签，可随时取消，完整提示词仍会随该页要求交给后台；它不绑定某一份客户 PPT。
9. 在方案确认、页面转换、页面点选和生成预览阶段，任务头部提供“取消任务（紧急）”。取消会立刻停止后续页面排队；已经提交给 Image2 的少量并发页面无法撤回，但其结果不会继续推进该任务。

后台执行脚本：

- `scripts/workers/ppt-polish/ppt-polish-worker.mjs`

健康检查文件：

- `lib/ppt-polish-worker-health.ts`

心跳文件：

- `.next-dev/ppt-polish-worker-heartbeat.json`

### 第三步：生成美化后的页面预览图

后台执行脚本会按页生成 16:9 PNG。

当前并发：

- 同时生成 2 张。

用户在中间区域看到多张预览卡，每张卡包含：

- 页面标题
- 当前状态
- 美化后的图片预览
- 该页要求说明
- “重新生成本页”
- “更贴近上一页”

单页预览图接口：

- `GET /api/employee/services/[id]/ppt-polish/runs/[runId]/slides/[slideIndex]/image`

单页返工接口：

- `POST /api/employee/services/[id]/ppt-polish/runs/[runId]/slides/[slideIndex]/regenerate`
- `action = reroll`：重新生成本页
- `action = closer_previous`：更贴近上一页

### 第四步：用户确认预览后转 PPTX

当所有页面图完成后，任务进入 `review_ready`。

用户点击“转化 PPT”后，系统请求：

- `POST /api/employee/services/[id]/ppt-polish/runs/[runId]/ppt`
- 文件：`app/api/employee/services/[id]/ppt-polish/runs/[runId]/ppt/route.ts`

当前目标是把美化后的页面图合成为 PPTX，并可配合 Codia 转化。

PDF 接口：

- `GET /api/employee/services/[id]/ppt-polish/runs/[runId]/pdf`

最终交付物：

- 美化后的 PPTX
- 可选 PDF
- 页面预览图

### 当前验收点

- 用户没写要求时，不能自动出现“生成页面中”的旧任务栏。
- 用户没确认方案前，不应自动重绘页面。
- 方案待确认时必须同时提供“返回修改”和“确认生成”。
- 方案标签必须横向显示并在卡片内换行，不能出现单字竖排或溢出。
- 右侧任务列表应显示最新美化 PPT 任务，并点击后回到该任务。
- 排队中的页面也应该有动态反馈，不应像卡死。
- 同时最多两张页面处于生成状态。
- 封面页和结尾页应更强情绪、少文字、风格突出。
- 生成结果色彩风格要统一，不能每页突兀。
- 页面预览图能点击放大。

## 单页生图：当前交付流程

### 用户可见入口

员工进入 `/employee`，打开订单工作台，点击右下角“小 W · PPT 智能模式”，选择“生图”。

### 两种模式的边界

1. **文生图模式**只显示文字要求与“夹子”入口，不显示“上传参考图”、缩略图或素材选择；接口也会拒绝任何携带图片的文生图请求，不能只依赖界面隐藏。
2. **混合模式**才显示参考图入口，可一次添加多张 PNG、JPEG 或 WebP 图片，最多 6 张、单张不超过 10MB、合计不超过 40MB。图片会直接随该次图片编辑请求发送给图片模型。
3. 夹子与美化 PPT 读取、编辑同一份员工级数据。已套用时只在文字框下显示夹子名称，可以随时点叉取消；完整夹子内容会和本次手写要求一起提交，但不会回填到可见文字框。
4. 生图后台只发送“员工手写要求 + 员工明确套用的夹子”。不得追加订单标题、默认版式、风格包、候选差异化、所谓高级感或其他预设画面规则。多图接口不兼容时可以把图片合成为一张传输板，但也不得修改提示词文本。

创建任务接口与后台执行脚本：

- `POST /api/employee/services/[id]/design-agent/runs`
- `app/api/employee/services/[id]/design-agent/runs/route.ts`
- `scripts/workers/design-agent/design-agent-worker.mjs`

## 图片转 PPT：当前交付流程

### 用户可见入口

员工工作台底部图片工具或智能模式入口中，选择“图片转 PPT”。

相关前端文件：

- `components/employee-app.tsx`

### 用户操作

用户拖入图片或选择本地图片。

系统把图片传给后端接口：

- `POST /api/employee/services/[id]/image-to-pptx`
- 文件：`app/api/employee/services/[id]/image-to-pptx/route.ts`

后端调用 Codia，把图片转为 PPTX。

最终交付物：

- PPTX 下载链接

### 当前验收点

- 上传区应该明确显示正在转换或已完成。
- 成功后应显示文件名和下载入口。
- 失败时应明确提示 Codia 或网络错误。

## 启动命令对应关系

| 命令 | 适用场景 | 会启动什么 |
| --- | --- | --- |
| `npm run dev` | 完整员工工作台联调 | Next、ONLYOFFICE 检查、生成 PPT 后台执行脚本、美化 PPT 后台执行脚本、生图/设计后台执行脚本、图片炸开相关脚本 |
| `npm run dev:lite` | 只调智能模式 | Next、设计/生图后台执行脚本、生成 PPT 后台执行脚本、美化 PPT 后台执行脚本 |
| `npm run agent:workers` | 单独排查后台执行脚本 | 设计/生图、生成 PPT、美化 PPT、图片炸开后台执行脚本 |
| `npm run ppt-polish:worker` | 只排查美化 PPT | 美化 PPT 后台执行脚本 |
| `npm run office:up` | 只排查 ONLYOFFICE | ONLYOFFICE 容器 |

## 以后修改流程的文档要求

以后 Codex 修改生成 PPT、美化 PPT、图片转 PPT、图片工具、订单工作台等核心流程时，必须同步更新本文件，并按下面格式说明：

1. 用户入口是否变了。
2. 用户需要填写的内容是否变了。
3. 是否增加或删除中间确认点。
4. 页面预览图是否仍可逐页检查。
5. 返工按钮是否仍可用。
6. 最终交付物是否变了。
7. 涉及哪些前端文件、接口文件、后台执行脚本。
8. 用什么命令验证过。

这份文档优先服务项目掌控，不追求技术词准确漂亮。项目 owner 看得懂，比工程词更重要。

## YZStudio 双中转：当前 AI 交付链路

### 用户可见变化

- 生成 PPT、美化 PPT、AI 图片、资料分析和方案规划仍沿用原来的入口、确认点、预览与返工按钮。
- 管理控制台新增“文字中转”和“生图中转”两张状态卡，只显示服务名、模型、地址和是否已配置，不显示密钥。
- 如果只配置文字 Key，文字分析可用、生图会明确提示缺少图片 Key；反过来也一样，不再用一把 Key 模糊兜底。

### 系统现在怎样调用

1. 资料分析、大纲、逐页内容和结构化 JSON 使用 `AI_TEXT_API_KEY`，默认请求 `https://yzstudio.vip/v1/chat/completions`。全局 `AI_TEXT_MODEL` 统一为 `gpt-5.6-sol`，覆盖快速版、高级版、AI 助手、美化 PPT 和其他文字功能；高级版仍可通过 `DECK_ADVANCED_TEXT_MODEL` 独立覆盖，当前同样为 `gpt-5.6-sol`。
2. 生成 PPT 页面、美化 PPT 页面、AI 图片和主视觉图使用 `AI_IMAGE_API_KEY`，模型为 `gpt-image-2`。普通文生图仍请求 `https://yzstudio.vip/v1/images/generations`；高级版生成 PPT 通过 `/v1/images/edits` 输入本地风格条带；美化 PPT 也通过 `/v1/images/edits` 一对一输入当前原页 PNG 和本页用户要求。
3. 两条链路默认直接连接 YZStudio；只有明确填写 `AI_TEXT_PROXY_URL` 或 `AI_IMAGE_PROXY_URL` 时才额外经过本地代理。
4. Codia、方舟豆包、DeepSeek 和本地图片拆解仍使用各自独立配置，因为它们不是原 ChatGPT Key 所承载的功能。
5. YZStudio 已公开同步和异步接口，但当前没有提供异步状态查询返回格式。系统暂时使用公开的同步接口，并继续由项目自己的后台任务队列控制并发和恢复，避免猜测轮询协议。

### 图片编辑能力边界

- 2026-08-05 已验证 YZStudio 的 `POST /v1/images/edits` 路由存在并进入图片字段校验；生成 PPT 高级版单独使用 `DECK_ADVANCED_REFERENCE_IMAGES=1` 传递整套风格条带，正文页可附加合规公开视觉参考；不传内容资料图片或配色参考原图。
- 生成 PPT 高级版的参考图开关不等于美化 PPT 的图片编辑能力；美化 PPT 和其他需要图片编辑的功能仍由 `AI_IMAGE_SUPPORTS_EDITS` 独立控制。
- 现在美化 PPT 必须设置 `AI_IMAGE_SUPPORTS_EDITS=1`，否则确认操作会在生成前明确提示配置问题，不会偷偷回退旧 Key 或纯文字生图。

### 真实文件位置

- 服务端统一配置与网页接口调用：`lib/ai-providers.ts`。
- 后台执行脚本统一调用：`scripts/workers/shared/ai-service-client.mjs`。
- 生成 PPT：`scripts/workers/deck-generation/deck-generation-worker.mjs`。
- 美化 PPT：`scripts/workers/ppt-polish/ppt-polish-worker.mjs`。
- 单页生图/设计与图片炸开：`scripts/workers/design-agent/design-agent-worker.mjs`、`scripts/workers/image-explode/image-explode-worker.mjs`。
- 普通 AI 图片与 AI 清字接口：`app/api/employee/services/[id]/generate-images/route.ts`、`app/api/employee/services/[id]/image-explode/runs/[runId]/parts/[partId]/clean-text/route.ts`。
- 管理控制台状态：`app/api/employee/admin/overview/route.ts`、`components/employee-app.tsx`。

### 全局文字模型统一与高级版覆盖（2026-08-08）

- 生成 PPT 高级版的 OCR 补救、逐页结构整理、按页文字证据匹配、完整视觉方案和最终一次交付安全检查，统一读取 `DECK_ADVANCED_TEXT_MODEL`；当前配置为已由同一文字 Key 验证可用的 `gpt-5.6-sol`。
- 裸模型名 `gpt-5.6` 在当前文字 Key 所属分组返回上游 `502`，而 `gpt-5.6-sol` 使用相同地址、Key 和最小请求体可以正常返回，因此高级版不再依赖不可用的裸别名。
- 全局 `AI_TEXT_MODEL` 已统一为 `gpt-5.6-sol`，快速版、AI 助手、美化 PPT 和其他文字功能都不再请求裸 `gpt-5.6`。高级版保留独立覆盖变量只是为了以后按功能切换模型，当前与全局完全一致。这个修复不增加表单、确认步骤、GPT 请求轮次或 Image2 生图次数。
- 高级版不再建立视觉证据索引，也不保存来源图片裁片；普通解析文字不足时才进行 OCR 补救。普通 502、503、网络断线仍按短暂故障重试。
- 前端轮询按请求顺序接收任务状态，旧响应不能覆盖新状态；进入“完整方案待确认”后不会继续显示旧的中转站中止错误。
- 修改 `.env` 或 `scripts/workers/deck-generation/deck-generation-worker.mjs` 后必须重启本项目的生成 PPT 后台执行脚本；只刷新网页不会加载新模型配置。

### 配置与验收

1. 在 `.env` 填写 `AI_TEXT_API_KEY` 与 `AI_IMAGE_API_KEY`，两把 Key 不要互换。
2. 保持两个 Proxy 变量为空即可直接连接中转站。
3. 重启 `npm run dev`，进入管理控制台确认两张中转状态卡都显示“已配置”。
4. 先做一次文字助手请求，再做 1 张 AI 图片，最后用 2 到 3 页的小型生成 PPT/美化 PPT 任务验证完整链路。
5. 旧的 `OPENAI_API_KEY`、`OPENAI_BASE_URL`、`OPENAI_PROXY_URL` 已不再被实际功能读取。

## 本地开发启动端口

### 项目 owner 怎样启动

1. 在项目目录执行 `npm run dev`。
2. ONLYOFFICE 准备完成后，终端会打印 `Development server will use http://localhost:端口`。
3. 如果 Windows/Docker 保留了 `3000`，系统会自动选择其他可用端口；直接打开终端打印的地址即可，不需要先结束所有 Node 进程。
4. 如果提示已有 Next 开发服务，则先使用现有地址，或停止原来的项目终端后重新启动；不要批量结束电脑上的全部 Node 进程。

### 真实代码位置

- `scripts/dev-port.mjs`：检查候选端口并在必要时请求 Windows 自动分配端口。
- `scripts/dev.mjs`：完整开发环境使用该选择器，并同步设置 ONLYOFFICE 回调地址。
- `scripts/dev-lite.mjs`：轻量智能模式开发环境使用同一选择器。

### 验收标准

- Docker/Hyper-V 保留 `3000` 时，`npm run dev` 仍能启动并打印新的本机地址。
- 首页与 `/employee` 均能返回页面。
- 停止启动终端后，实际开发端口、组件服务端口和 `.next-dev/dev/lock` 都会释放。
## 高级版主题色参考图与余额故障恢复

### 实际调用关系

1. Word、PDF、Excel、PPT 等资料先由本地解析程序读取正文、表格和来源位置，不调用生图账户。
2. 用户上传的主题色参考图由本地程序直接提取背景、正文、强调色、辅助色和使用职责，不再为配色单独调用 GPT-5.6。原始参考图不会交给 Image2；图片模型只收到色值关系、结构化配色合同与本地风格条带。
3. 逐页结构整理、按页匹配资料和正文方案同样使用 `AI_TEXT_API_KEY`。
   - 高级版的大纲整理、资料匹配和视觉方案遇到同类临时上游错误时，也会进行两次短暂重试；余额、权限或配置错误不会被当成临时故障吞掉。
   - 如果 PPT/PDF 的普通解析文字不足，本地程序会把渲染页交给 GPT-5.6 只恢复标题、关键结论、数字和专名；不会同时提取视觉素材或建立图片证据索引。
4. 只有用户确认一次完整逐页方案、开始生成 16:9 页面预览图时，才使用 `AI_IMAGE_API_KEY` 和 `gpt-image-2`。参考图模式只把本地提取的颜色规则写入任务包并输入本地风格条带，主题图原文件绝不传入 `/v1/images/edits`。

### 余额不足时怎样恢复

1. 页面出现“GPT-5.6 文字中转账户余额不足”时，应检查 YZStudio 文字 Key 所属账户或分组的余额，不要给图片 Key 充值。
2. 补充余额后，在原高级版任务右上角点击“重新分析资料”。
3. 系统复用原任务中已经上传的资料、大纲和主题色参考图，重新进入资料分析，不要求用户重新填写表单。
   - 高级版存在读取失败的资料，或“参考图配色”没有成功读取的主题图时，“重新分析资料”必须回到资料读取阶段，真实重试失败资料，不能直接跳到逐页匹配。
4. 如果进入页面预览生成后出现“gpt-image-2 图片中转账户余额不足”，才检查图片 Key 所属账户或分组。

### 真实代码位置

- 文字/图片账户选择和余额提示：`scripts/workers/deck-generation/deck-generation-worker.mjs`
- 失败任务的“重新分析资料”入口：`components/employee-app.tsx`
- 原任务恢复接口：`app/api/employee/services/[id]/deck-generation/runs/[runId]/replan/route.ts`
## YZStudio 地址误填与余额排查（2026-08-03）

### 本次为什么失败

1. `.env` 中的 `AI_TEXT_BASE_URL` 与 `AI_IMAGE_BASE_URL` 按管理员口径填写官网根地址 `https://yzstudio.vip`；程序会统一补成 API 根地址 `/v1`。
2. 同一个地址曾被误填进 `AI_TEXT_PROXY_URL` 与 `AI_IMAGE_PROXY_URL`。这两个字段只接受代理服务器地址，例如 `http://127.0.0.1:7897`；直连 YZStudio 时必须留空。
3. 错误代理地址会让生成 PPT、美化 PPT、设计生图和图片拆解的后台执行脚本在启动时抛出 `InvalidArgumentError: invalid url`，随后开发服务管理程序会停止整组服务。
4. 清空两个代理字段后，本机对 YZStudio 的 DNS、HTTPS 和 GPT-5.6 接口均可到达。
5. 使用当前文字 Key 发送最小 GPT-5.6 请求，YZStudio 明确返回 `403 / INSUFFICIENT_BALANCE`。这证明 Key、模型和接口地址已经生效，剩余问题是该文字 Key 所属分组没有可用额度，不是用户漏填表单或环境变量。

### 用户怎样恢复

1. 登录 YZStudio，检查文字 Key 绑定的分组、订阅有效期、每日额度和永久额度。
2. 如余额为 0，先兑换卡密、充值或给该文字分组补充可用额度。
3. `AI_TEXT_BASE_URL` 填 `https://yzstudio.vip` 即可，不要手工拼接口路径，也不要把 YZStudio 地址填入代理字段。
4. 额度恢复后重启 `npm run dev`，在原失败任务右上角点击“重新分析资料”；已上传的 Word、图片和大纲会继续复用。
5. 只有进入预览图生成阶段后出现图片余额不足，才检查 `AI_IMAGE_API_KEY` 所属生图分组。

### 本次代码保护

- `scripts/workers/shared/ai-service-client.mjs`：后台执行脚本创建代理连接前先校验地址；误把 `/v1` API 地址填入代理字段时显示中文配置说明。
- `lib/ai-providers.ts`：网页服务端请求使用相同校验，避免同类误填变成难理解的 `invalid url`。
- `.env`：两个 `BASE_URL` 统一保存官网根地址 `https://yzstudio.vip`，两个 `PROXY_URL` 保持为空；代码自动补 `/v1`。
- `scripts/workers/deck-generation/deck-generation-worker.mjs`：余额提示明确说明“请求已到达 YZStudio、不是配置缺项”，并指出应检查文字分组额度。
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
- `scripts/workers/shared/ai-service-client.mjs` 与 `lib/ai-providers.ts` 会把官网根地址标准化为 `https://yzstudio.vip/v1`；如果以后填写的旧值本身已经带 `/v1`，也不会重复拼接。
- 最终文字请求仍为 `https://yzstudio.vip/v1/chat/completions`，最终图片请求仍为 `https://yzstudio.vip/v1/images/generations`。`*_PROXY_URL` 继续留空。
- 这次修改解决的是“后台页面填写官网、代码需要 API 路径”的口径差异，不会伪装修复供应商计费。当前两把 Key 直连 `/v1/models` 以及各自正式接口仍返回 `403 / INSUFFICIENT_BALANCE`，需要 YZStudio 检查账户余额与 Key 分组的计费绑定。
- 真实改动文件：`.env`、`.env.example`、`.env.production.example`、`scripts/workers/shared/ai-service-client.mjs`、`lib/ai-providers.ts`、`README.md`、`docs/project-control-workflows.md`、`AGENTS.md`。
## YZStudio Key 鉴权与余额绑定复核（2026-08-03）

- 新截图显示的“Base URL + 文本接口”容易被误读为无 `/v1`：实测 `POST https://yzstudio.vip/chat/completions` 返回 `405`，而 `POST https://yzstudio.vip/v1/chat/completions` 进入 YZStudio API 并返回结构化 `403 / INSUFFICIENT_BALANCE`。因此官网输入框实际应与 `/v1` API 根路径组合，当前程序自动补 `/v1` 的写法正确。
- 对只读接口 `GET https://yzstudio.vip/v1/models` 做了三组鉴别：当前文字 Key 返回 `403 / INSUFFICIENT_BALANCE`；假 Key 返回 `401 / INVALID_API_KEY`；不带 Key 返回 `401 / API_KEY_REQUIRED`。
- 这证明 YZStudio 已正确识别当前文字 Key，`Authorization: Bearer <key>` 写法正确，失败发生在鉴权之后、模型调用之前的计费检查；不是 PPTagent 请求体、Base URL、模型名或 Header 写错。
- 本次可交给 YZStudio 管理员的文字请求编号：`273f5589-f9b0-4a45-9747-08ea11d2c904`；同一 Key 的最小生成请求编号：`96bf82a2-3ea4-4f96-ba97-68ea251c56cc`。
- 管理员需要检查账户钱包余额是否已同步到 API 计费账户、文字 Key 尾号对应的分组/订阅是否有永久额度或日额度、以及充值后旧 Key 是否需要重新生成。项目端无法绕过供应商返回的余额拦截。
- 用户截图已经显示过完整文字 Key，此前也显示过完整图片 Key；两把 Key 都应在 YZStudio 重新生成并更新 `.env`，避免密钥泄露。

### 按官方手册重新执行账户侧接入

1. 购买卡密后进入 https://yzstudio.vip/redeem 完成兑换。
2. 打开“我的订阅”或“仪表盘”，确认对应永久额度或日额度已经到账；右上角钱包金额不作为 API 可用额度的唯一验收依据。
3. 额度到账后重新创建文字 Key 和图片 Key，分别选择文字分组与生图分组，不要限制模型。
4. 将两把新 Key 分别写入 AI_TEXT_API_KEY 与 AI_IMAGE_API_KEY，重启开发服务。
5. 先用一条短文本和一张测试图验收；文字请求应进入 `gpt-5.6-sol`，图片请求应进入 `gpt-image-2`。
6. 当前旧 Key 已在截图中暴露，即使额度恢复也必须废弃并重新生成。
## Codia 交付故障怎样验收（2026-08-04）

1. 生成 PPT、美化 PPT 和图片转 PPT 都默认连接 `https://openapi.codia.ai`。
2. 用户点击转换后，系统先上传已经确认的 PDF，再创建 `pdf_to_ppt` 转换任务，查询完成状态并下载 PPTX。
3. 如果只是瞬时断网、连接重置、DNS、TLS 或 socket 超时，系统会短暂等待并自动再试，最多共三次。
4. 如果 Codia 已返回 400、401、402 或 403，系统保留原状态码与文字，不把业务错误伪装成网络错误，也不重复扣费式重试。
5. 即使转 PPT 失败，已经确认的 PNG 图组和 PDF 必须继续可下载；修复网络、Key、订阅或额度后，从原任务重试即可。
6. 美化 PPT 使用相同的 Codia 连接保护，但方案确认、逐页预览、单页重生和转 PPT 的原操作顺序没有变化。
7. 修改后台执行脚本或 `.env` 后必须重启 `npm run dev`；只刷新网页不能让旧的生成 PPT/美化 PPT 后台进程加载新代码。

真实代码位置：

- 外部网络错误详情：`scripts/workers/shared/ai-service-client.mjs`
- 生成 PPT 转换：`scripts/workers/deck-generation/deck-generation-worker.mjs`
- 美化 PPT 转换：`scripts/workers/ppt-polish/ppt-polish-worker.mjs`
- 图片转 PPT：`app/api/employee/services/[id]/image-to-pptx/route.ts`

### `invalid content-length header` 的最终处理（2026-08-04）

- 页面看到 `UND_ERR_INVALID_ARG · invalid content-length header` 时，代表文件上传请求在本机被 Node 拒绝，尚未发送到 Codia；不要让用户充值或更换 Key。
- 生成 PPT、美化 PPT、图片转 PPT 的 multipart 上传均不得手写 `Content-Length`。代码只提供 `Authorization`、multipart `Content-Type` 和二进制请求体，长度由 `fetch` 自动生成。
- 无效测试 Key 已能收到 Codia 官方上传接口的结构化 401，说明地址、DNS、TLS、multipart 结构和服务端到达性通过。
- 验收顺序：重启 `npm run dev` -> 打开原任务 -> 点击“重试生成 PPT” -> 成功则下载 PPTX；只有明确收到 402/403 时才检查 Codia 额度或 Key 权限。
