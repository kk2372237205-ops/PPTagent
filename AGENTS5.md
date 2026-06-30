# WZLCF 当前版本记忆（代码审阅于 2026-06-20）

## 版本基线

- 当前工作区相对初始提交 `d05bb1a` 有 24 个已跟踪文件修改，并新增 AI、Supabase、ONLYOFFICE、图片工具与 PPT 解析模块。
- 本文件以当前源码为准；`AGENTS1.md` 到 `AGENTS4.md` 是此前阶段记忆，存在少量已被当前代码替代的描述。
- 不要重置、回退或批量删除当前未提交内容。

## 登录、客户与咨询

- 客户端和员工端登录框均通过 `ref + onInput + onChange` 读取真实输入值，避免浏览器自动填充后按钮仍禁用。
- 默认验证码仍为 `123456`，短信默认 `SMS_PROVIDER="mock"`；生产短信适配已改为阿里云配置，不再走腾讯云。
- 每个客户后续只复用一个 `Consultation.isCustomerGroup=true` 的专属咨询群；点选多个预算会写入 `selectedBudgets`，并追加系统消息。
- 客户聊天页和员工聊天页都显示多预算需求标签与资料安全说明。
- 员工端所有启用员工都能查看客户咨询；列表红色未读数只会在真实员工（`advisor` 且有 `employeeId`）回复后清零。静默刷新会保持当前会话，不跳回首项。

## Supabase 同步

- SQLite / Prisma 仍是业务主库和登录来源，Supabase 不参与 Supabase Auth。
- 服务端把已验证用户同步到 `registered_users`，把咨询同步到 `appointments`。
- 相关文件：`lib/supabase-postgres.ts`、`supabase/migrations/20260614_create_registration_and_appointments.sql`、`scripts/supabase-migrate.mjs`、`scripts/supabase-sync-existing.mjs`。
- 可用命令：`npm run supabase:migrate`、`npm run supabase:sync`。连接串只能保存在 `.env`，不得写入浏览器或回复中。

## 员工工作台与 AI

- 工作台为 ONLYOFFICE 编辑区 + 可收起的 AI 侧栏 + 底部个人素材库，手机端仍只展示电脑端使用提示。
- AI 文本对话按 `serviceId + employeeId` 隔离，历史和滚动摘要保存在 `AiConversation` / `AiMessage`；支持方舟 DeepSeek、方舟 Doubao 和 OpenAI 文本模型。
- 图片生成是异步 `GenerationJob`：前端轮询任务状态；当前代码支持方舟 Seedream 5.0 和 OpenAI 图片模型，OpenAI 可带参考图。
- OpenAI 运行时可以使用 `OPENAI_PROXY_URL`，`/api/employee/ai/openai-health` 提供员工登录后的连通性检查。
- 个人素材库按员工隔离；订单素材总库可查看其他员工素材并复制到自己的库。支持本地多图导入、分页、预览、下载与拖拽复制。

## 图片工具与 PPT 素材回流

- 底部有 `PPT 粘贴托盘`：优先写 `image/png` 到网页剪贴板，失败时降级 HTML 图片复制。网页到 ONLYOFFICE 仍可能出现空图片框，不能承诺等同 Windows 文件剪贴板。
- 图片工具面板包含：`智能抠图`、`图片变清晰` 和 `PPT 提取`。
- `智能抠图` / `图片变清晰` 调用佐糖 `TECHSZ_API_KEY`；结果先写入生成图片，用户点击后才收录进个人素材库。
- `PPT 提取` 从当前服务端保存的 `.pptx` 解析普通图片与 `a:srcRect` 基础裁剪，前端 canvas 生成可见区域预览；最多返回 40 张。复杂蒙版、旋转、阴影、组合对象暂不保证还原。
- PPT 提取网格已补齐父级高度约束与内部纵向滚动：鼠标滚轮/触控板应可继续浏览更多图片。
- ONLYOFFICE 画布不再捕获图片拖拽；只在拖入 `.ppt/.pptx` 时显示加载提示。图片桥接插件与服务端 `insert-image` PPTX 写入接口仍保留在仓库，但当前主界面没有以它们作为图片插入主路径。

## ONLYOFFICE 与运行配置

- ONLYOFFICE Docker 映射端口为 `18080:80`，通过 `npm run office:up` 检查/启动 Docker Desktop 和容器。
- 单份工作 PPT 上限提高到 1GB；可从空白、新上传 PPTX 或客户附件创建工作文件。
- `next.config.ts` 会自动加入本机私有 IPv4 到 `allowedDevOrigins`；开发/构建/启动命令统一经 `scripts/next-with-env-proxy.mjs` 注入代理环境。
- 修改 `.env`、`next.config.ts` 或 Docker 配置后，需要重启 `npm run dev`，浏览器用 `Ctrl + F5` 刷新。

## 数据模型新增重点

- `Consultation.selectedBudgets`、`Consultation.isCustomerGroup`。
- `Service` 增加负责人、工作文档、活动、生成任务、AI 会话、素材关联。
- 新增/扩展 `WorkDocument`、`WorkVersion`、`ServiceActivity`、`GenerationJob`、`GeneratedImage`、`MaterialItem`、`AiConversation`、`AiMessage`。
- `scripts/init-db.mjs` 已补齐 SQLite 创建和补列逻辑。

## 当前校验与注意项

- 已在本次审阅完成：`npm run lint`、`npx tsc --noEmit`，均通过。
- `git diff --check` 仅报告 `components/employee-app.tsx` 两处 JSX 行尾空格（约第 1000、1405 行），没有功能错误；本轮未擅自改动用户文件。
- `README.md` 的“腾讯云短信”标题仍是旧文案，和当前阿里云短信实现不一致，后续可单独整理文档。
- 继续遵守：不得批量删除文件或目录；不要使用递归删除命令。
