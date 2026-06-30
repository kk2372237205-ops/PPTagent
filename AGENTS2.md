# WZLCF 本轮话题记忆

## 本轮目标概览

本轮主要围绕 WZLCF 网站的登录稳定性、客户账号隔离、客户咨询群、员工端客户消息工作流、ONLYOFFICE/Docker 依赖和开发环境访问问题进行修复与增强。

用户希望系统逐步变成：

- 每个手机号都是一个独立客户账号。
- 每个客户账号只有一个独立咨询群。
- 所有启用员工都能看到并回复所有客户咨询，像一个团队围绕客户服务。
- 员工端消息列表要清晰显示客户新消息数量。
- 员工在某个客户窗口聊天时，不能因为刷新或回复跳回列表第一条。

## 账号与登录

- 当前继续使用本地账号体系：`User.phone @unique`，手机号只是登录身份，真正账号 ID 是本地 `User.id`。
- 新手机号首次登录会创建独立 `User`，但不再自动生成同名演示咨询或演示订单，避免不同手机号看起来像共享数据。
- Supabase 暂时不作为登录系统，不接入 Supabase Auth。
- Supabase 只作为同步备份：
  - 登录成功同步 `registered_users`。
  - 创建咨询时同步 `appointments`。
- 客户端和员工端登录框都修过自动填充/浏览器状态不同步的问题：
  - 输入框使用 ref 同步真实 DOM 值。
  - 按钮启用状态不再因为浏览器自动填充或恢复旧页面状态而卡住。

## 开发环境与 Network 地址问题

- 曾出现 Edge/Chrome 用 Network 地址访问时按钮失效，但 Codex/VS Code 内置浏览器正常。
- 根因是 Next.js dev 的跨源开发资源保护，终端出现：
  `Blocked cross-origin request ... from "172.22.192.1"`
- 已修改 `next.config.ts`：
  - 保留 `localhost`、`127.0.0.1`、`10.130.178.92`、`192.168.128.1`。
  - 自动读取本机私有 IPv4 地址加入 `allowedDevOrigins`。
  - 覆盖常见私有网段：`10.x.x.x`、`172.16.x.x ~ 172.31.x.x`、`192.168.x.x`。
- 修改 `next.config.ts` 后必须重启 `npm run dev` 才生效。

## Docker Desktop 与 ONLYOFFICE

- 员工工作台左侧 PPT 编辑区域提示“编辑器暂未连接 / ONLYOFFICE 尚未启动”时，通常是 Docker Desktop 没打开。
- 已增加 `npm run office:up`：
  - 脚本位置：`scripts/ensure-onlyoffice.mjs`
  - 作用：检查 Docker Desktop 是否运行，尝试启动 Docker Desktop，并启动/检查 `wzlcf-onlyoffice` 容器。
- ONLYOFFICE 用于员工端 PPT 在线编辑，不影响客户登录和普通咨询。
- 如果 Docker Desktop 没有启动，员工端 ONLYOFFICE 编辑器会不可用，但网站其他部分仍可工作。

## 每个客户一个独立咨询群

- `Consultation` 新增字段：
  - `isCustomerGroup Boolean @default(false)`
  - `selectedBudgets String @default("[]")`
  - 索引：`@@index([userId, isCustomerGroup])`
- SQLite 初始化脚本 `scripts/init-db.mjs` 已同步补列：
  - `selectedBudgets`
  - `isCustomerGroup`
- `/api/consultations` 已从“每次按预算创建/复用”改为：
  - 先查当前 `user.id` 下 `isCustomerGroup=true` 的客户总咨询群。
  - 如果存在，复用这个咨询群。
  - 如果点击了新预算，只追加到 `selectedBudgets`，并写一条系统消息。
  - 如果不存在，创建新的客户专属咨询群。
- 旧咨询不自动迁移、不合并、不删除。
- 新逻辑只保证后续咨询按“每客户一个群”运行。

## 客户端咨询 UI

- 套餐入口继续保留“开启咨询 / 继续咨询”体验。
- 同一客户点击不同预算，会进入同一个客户专属咨询群。
- 客户聊天页右侧从“本次咨询”改为“客户需求”：
  - 显示多个已选预算标签。
  - 显示咨询状态、服务方式、材料支持。
  - 显示资料安全保障提示。
- 预算标签采用樱桃红 + 宝石蓝方向，和当前视觉系统保持一致。

## 员工端客户消息

- 员工端 `/api/employee/me` 继续返回全部客户咨询，不按员工过滤。
- 所有已登录且启用的员工都能看到所有客户咨询，并回复任意客户群。
- 员工回复仍使用现有 `Message` 模型：
  - 客户消息：`role = "customer"`
  - 员工回复：`role = "advisor"`，并带 `employeeId`
  - 系统/机器人消息不能当作员工回复

### 员工端右侧客户需求栏

- 员工端“客户消息”页面已从两栏变为三栏：
  - 左侧客户列表
  - 中间聊天区
  - 右侧客户需求说明栏
- 右侧栏显示：
  - `客户需求`
  - 已选择预算标签
  - 咨询状态
  - 服务方式：团队协同服务
  - 材料支持：PPT / PDF / ZIP
  - 资料安全保障
- 窄屏时右侧客户需求栏会隐藏，避免聊天区域被挤压。

### 新消息红点规则

- 员工端客户列表头像右上角有红色数字角标。
- 红点亮起条件：
  - 客户发来消息后亮起。
  - 客户连续发多少条，数字就是多少。
- 清零条件：
  - 只有真人员工回复才清零。
  - 判断标准：`message.role === "advisor"` 且存在 `message.employee?.id`。
  - 机器人回复、系统消息、无员工 ID 的 advisor 消息都不算员工回复，不能熄灭红点。
- 点开会话不清零，只有员工真正回复后清零。

### 当前聊天不跳回第一条

- 曾出现员工在列表下面某个客户窗口回复后，页面自动跳回列表第一条客户。
- 根因：
  - 员工发送消息后调用普通 `refresh()`，触发整页 loading。
  - `CustomerMessages` 组件被卸载重挂载，`selectedId` 恢复为第一条咨询。
- 已修复：
  - 员工发送消息后改为 `refresh(true)` 静默刷新。
  - 当前选中的客户窗口不会因为回复被重置。
- 同时在 `loadData` 中保留本地咨询列表顺序：
  - 刷新只更新消息内容、红点数字和右侧需求栏。
  - 不因为 `updatedAt desc` 把正在聊天的客户挪到顶部。
  - 新咨询会追加进列表。

## 已运行过的验证命令

本轮多次运行并通过：

```powershell
npm run lint
npx tsc --noEmit
npm run build -- --webpack
```

部分数据库/Prisma 相关操作：

```powershell
npm run db:push
```

注意：曾遇到 `prisma generate` 因 dev server 占用 Prisma query engine 文件而报 `EPERM`，但后续类型与构建验证通过。本地 SQLite 表结构已确认存在 `selectedBudgets` 和 `isCustomerGroup`。

## 当前使用提醒

- 修改配置、数据库结构或依赖后，建议重启：

```powershell
Ctrl+C
npm run dev
```

- 使用员工 PPT 在线编辑前，先运行：

```powershell
npm run office:up
```

- 本地验证码仍是开发验证码：`123456`。

## 协作偏好与约束

- 禁止批量删除文件或目录。
- 不得使用：
  - `del /s`
  - `rd /s`
  - `rmdir /s`
  - `Remove-Item -Recurse`
  - `rm -rf`
- 删除文件只能一次删除一个明确路径。
- 视觉风格优先延续 WZLCF 的藏青、宝石蓝、樱桃红方向。
- 用户偏好简短直接的回答，但代码任务应完整实现并验证。
