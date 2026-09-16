# 新模型接手说明

这份文档用于在更换 AI 模型或新开任务时，用最短路径恢复 PPTagent 的当前上下文。它不是功能状态清单，而是接手顺序和安全边界。当前功能事实以 `docs/current-project-memory.md` 为准。

## 开始前按这个顺序读（前 4 份必读，约 5 分钟）

读完先复述理解，**不要立刻改代码**。`AGENTS.md` 会被自动加载，其余需要主动读。

| 顺序 | 文档 | 多大 | 读完你会知道 |
| --- | --- | --- | --- |
| 0（自动） | `AGENTS.md` | 18.6 KB / 192 行 | 必须遵守的规则、目录职责表、派活模板、分支规则 |
| 1 | `docs/current-project-memory.md` | 15 KB / 83 行 | ⭐ **现在有什么、能不能跑**、本机基线、验证命令 |
| 2 | `docs/project-map.md` | 34.5 KB / 443 行 | ⭐ **目录地图 + 管理手册**：每个文件夹干什么、哪些文件夹是一个整体、怎么派活、怎么排查 |
| 3 | `docs/model-handoff.md` | 本文件 | 接手顺序、系统骨架、绝对不要先做的事 |
| 4 | `README.md` | 11.9 KB / 180 行 | 产品概览、本地启动、外部服务配置 |

前 4 份合计约 80 KB，**能一次读完，不要跳**。

## 涉及具体模块时再读（按需，不要全读）

| 你要改什么 | 读这些 |
| --- | --- |
| 员工端任何界面 | `components/employee/README.md`（21 个模块索引表），再看对应的单个 `.tsx` |
| 生成 PPT | `skills/README.md` + `skills/deck-generation/` + `scripts/README.md` |
| 美化 PPT / 生图 / 图片工具 | `components/employee/` 里对应的那个文件 + `scripts/README.md` |
| 后台执行与启动脚本 | `scripts/README.md` |
| 业务验收流程（给项目 owner 看） | `docs/project-control-workflows.md`（53 KB，只在需要验收时读） |
| 历史问题与安全清单 | `docs/readonly-audit-2026-09-14.md`（56 KB，按需跳读，不要通读） |

## ⚠️ 不要读这些（会误导你）

| 文档 | 为什么不要读 |
| --- | --- |
| `docs/archive/agents-history.md`（69 KB） | 是**历史记录**，里面很多结论已经过时（例如"美化 PPT 只有 UI"、"用 OpenAI Key"）。只在需要追溯"当初为什么这么做"时查 |
| `docs/project-archive-2026-07-03.md` | 2026-07-03 的存档，描述的是**改造前**的方案（那时 `employee-app.tsx` 还是 3754 行） |
| `docs/maintenance-audit-2026-07-03.md` | 同上是历史审计，里面"约 2020 行"等数字都已过时 |
| `AGENTS.md` 里不带日期的"已实现功能"段落 | 是业务**意图**规则，不等于当前实现；判断实现请看 `lib/` 与 `app/api/` 的真实代码 |

## 当前系统骨架

> 员工端已于 2026-09-14 完成模块化拆分。**动手前先读 `components/employee/README.md`**，
> 那里有"哪个文件负责什么、对应哪些接口"的索引表。

- `app/`：Next.js 页面和服务端接口（74 条路由）。
- `components/employee-app.tsx`：员工工作台**外壳**（原 3753 行，现 400 行出头，只剩骨架与常量）。
- `components/employee/*.tsx`：31 个业务面板，每块一个文件，可以分别派人改。
- `app/employee/employee.css`：样式**入口**，只有 `@import` 列表。
- `app/employee/styles/*.css`：按模块拆开的 9 个样式层，顺序由入口文件固定。
- `lib/employee-auth.ts`：员工会话、学校隔离、角色和功能权限（**权限只能改这里**）。
- `lib/employee-api.ts`：员工端接口主干，路径与方法只在这里定义。
- `lib/employee-api-types.ts`：35 个共享数据类型。
- `lib/employee-permissions.ts`：角色/功能中文名与默认权限。
- `lib/use-smart-studio-runs.ts`：智能模式三条链路的状态与请求编排。
- `lib/ai-providers.ts`：文字模型与图片模型的服务端配置边界。
- `scripts/deck-generation-worker.mjs`：生成 PPT 的后台执行脚本。
- `scripts/ppt-polish-worker.mjs`：美化 PPT 的后台执行脚本。
- `skills/deck-generation/`：资料引用、结构控制、信息密度、配色和质量规则。
- `prisma/schema.prisma`：业务数据结构。

## 绝对不要先做的事

- 不要批量删除文件、目录、数据库或上传资料。
- 不要把 `.env`、真实 API Key、数据库、用户上传文件或生成缓存提交到 Git。
- 不要只根据截图猜流程；先在掌控手册找到用户入口、确认点和交付物。
- 不要只说“worker”“run”“slide”；同时说明中文业务含义和真实文件路径。
- 不要修改用户没有授权的模块。
- 不要在方案确认前自动生图，也不要用前端隐藏代替服务端权限检查。
- 不要往 `employee-app.tsx` 里加新功能；也不要往 `app/employee/employee.css` 里加规则。
- 不要在组件里手写 `fetch("/api/...")`；走 `lib/employee-api.ts`。
- 不要为了取一个类型而 import `employee-app.tsx`（会形成循环依赖）。

## 新模型接手后的第一条回复

先向项目 owner 汇报：当前目标和用户流程；预计读取、修改和明确不会修改的文件；验证方式；是否会调用收费的外部服务。确认理解没有偏差后再修改。

## 上一个话题做到哪了（2026-09-14）

**已完成：模块化改造 20 轮（P1–P7 全部落地）**，31 个提交，工作区干净，标签 `baseline` 是改造**之前**的原始状态。

| 指标 | 改造前 | 现在 |
| --- | --- | --- |
| `components/employee-app.tsx` | 3753 行 | **422 行** |
| 员工端结构 | 1 个巨型文件 | 16 个组件 + 11 个主干模块 + 9 个样式层 |
| 组件内手写 `fetch("/api/…")` | 60 处 | 4 处 |
| `employee.css` | 3426 行单文件 | 11 行入口 + `styles/` 9 层 |
| `AGENTS.md` | 87,965 字节（超预算会被截断） | 19,015 字节（可完整读入） |
| Git | 无仓库 | 31 个提交 + `baseline` 标签 |

改造过程中顺带修掉两个真实 bug：美化 PPT 表单预填的两条伪造逐页要求（用户没填也会被提交）、7 处"OpenAI 生图"过时文案。

**下一步最该做的（按优先级，都需要项目 owner 授权）**：

1. 🔴 **P0 六条安全项一条都没改**——清单在 `docs/readonly-audit-2026-09-14.md` 第十二节：OnlyOffice 回调 SSRF、硬编码默认 JWT 密钥、匿名请求批量改写订单归属、下载未绑定订单、SQLite 被两个容器同时读写、`.env` 密钥轮换。**这是目前风险最高的部分。**
2. 员工端侧栏/订单/消息/团队/设置仍是旧浅色配色（石墨黑只覆盖工作台）。改它是视觉决策，对应样式层是 `styles/10-theme-navy-lightblue.css`。
3. 图片炸开的入口是否接回（后端 9 个接口 + worker 全在线，改 `workspaceMode` 即可）。
4. P5 收尾：`employee-app.tsx` 里还剩 4 处 design-agent 的 `fetch` 与 9 个内部函数未迁到 `lib/use-smart-studio-runs.ts`，迁移模式已跑通。

**回退方式**：`git reset --hard baseline` 回到改造前；`git reset --hard HEAD` 丢弃当前未提交改动。

**必须提醒项目 owner 的一件事**：`uploads\`（6.41 GB 业务文件）与 `prisma\dev.db` **不在 Git 里、也没有备份**。Git 能回退代码，救不了这些数据。

## 常用验证

```powershell
npm run verify          # tsc + eslint(--max-warnings 11) + prisma validate + next build
npm run verify:check    # 只跑静态检查，改代码过程中随时可用
npm run verify:build    # 只跑生产构建，交付前必跑
```

`--max-warnings 11` 是基线（11 条历史警告都在 `scripts/design-agent-worker.mjs`），**任何新增警告都会让这条命令失败**——包括未使用的 import。这是刻意的。

本机 PowerShell 默认禁止跑 `npm` 脚本，需要先：
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

运行时验证的可复用做法：临时起 Next 开发服务（`NEXT_DIST_DIR=.next-smoke` + 一个空闲端口），请求 `/` 与 `/employee` 确认 HTTP 200，**用后必须停服务、删临时目录、`git restore tsconfig.json next-env.d.ts`**（dev server 会自动改写这两个文件）。

视觉或交互改动还应按模块运行现有视觉测试，并检查桌面与手机布局。外部 AI、Codia、微信和 ONLYOFFICE 的失败要区分代码、配置、网络和额度问题，不能用假成功掩盖。

## 当前优先原则

- 生成 PPT 和美化 PPT 都遵循：填写要求 → 生成方案 → 用户确认 → 生成预览 → 单页返工 → 最终导出。
- 高级版生成 PPT 必须保留资料来源位置，用户可规定大标题、小标题和每页内容。
- 文字分析使用 `AI_TEXT_API_KEY`，图片生成使用 `AI_IMAGE_API_KEY`，两把密钥不得混用。
- Codia 转换前保留可独立下载的图组和 PDF；Codia 不可用也不能丢失已确认预览。
