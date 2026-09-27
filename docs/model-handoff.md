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
| **不确定某个模式有哪些文件** | ⭐ **`docs/feature-file-map.md`**（功能 → 文件对照表：界面 / 接口 / 脚本 / 提示词 / 数据表 / 产物 / 共享层） |
| 员工端任何界面 | `components/employee/README.md`（21 个模块索引表），再看对应的单个 `.tsx` |
| 生成 PPT | `skills/README.md` + `skills/deck-generation/` + `scripts/README.md` |
| **画面/插图质量（写实、面积、风格）** | ⭐ **`PPTskills汇总/README.md`** → 再看 `03-插图手册` 与 `01-风格库` 第 1.5 节 |
| **为什么插图以前画不好** | `PPTskills汇总/05-根因诊断-为什么插图画不好.md`（带行号证据，通读，这是本话题的地基） |
| 美化 PPT / 生图 / 图片工具 | `components/employee/` 里对应的那个文件 + `scripts/README.md` |
| **AI 调用网络层（超时/重试/HTTP2）** | `scripts/workers/shared/ai-service-client.mjs` + `docs/model-handoff.md` 的"网络层"一节 |
| 后台执行与启动脚本 | `scripts/README.md` |
| 业务验收流程（给项目 owner 看） | `docs/project-control-workflows.md`（53 KB，只在需要验收时读） |
| 历史问题与安全清单 | `docs/readonly-audit-2026-09-14.md`（56 KB，按需跳读，不要通读） |

## ⚠️ 不要读这些（会误导你）

| 文档 | 为什么不要读 |
| --- | --- |
| `docs/archive/agents-history.md`（69 KB） | 是**历史记录**，里面很多结论已经过时（例如"美化 PPT 只有 UI"、"用 OpenAI Key"）。只在需要追溯"当初为什么这么做"时查。**历史快照，里面提到的已删文件按当时状态保留** |
| `docs/readonly-audit-2026-09-14.md`（56 KB） | 审计报告。**历史快照**，里面的行号与路径按当时状态保留，不要当现状读 |
| `AGENTS.md` 里不带日期的"已实现功能"段落 | 是业务**意图**规则，不等于当前实现；判断实现请看 `lib/` 与 `app/api/` 的真实代码 |

> 2026-09-26 减法：`docs/project-archive-2026-07-03.md` 与 `docs/maintenance-audit-2026-07-03.md`
> 已删除（它们描述的正是"会误导你"的改造前状态）。需要追溯请查 git 历史。

## 当前系统骨架

> 员工端已于 2026-09-14 完成模块化拆分。**动手前先读 `components/employee/README.md`**，
> 那里有"哪个文件负责什么、对应哪些接口"的索引表。

- `app/`：Next.js 页面和服务端接口（74 条路由）。
- `components/employee-app.tsx`：员工工作台**外壳**（原 3753 行，现 424 行，只剩骨架、常量与 4 处 design-agent 调用）。
  > 注：用 PowerShell `Get-Content | Measure-Object -Line` 数它会得到 422，因为文件里有孤立 CR 换行会被合行。以 read 工具的 424 为准。
- `components/employee/*.tsx`：**16 个业务面板**（另有 4 个纯类型文件和 1 个 README，目录合计 21 个文件），每块一个文件，可以分别派人改。清单见 `components/employee/README.md`。
- `app/employee/employee.css`：样式**入口**，只有 `@import` 列表。
- `app/employee/styles/*.css`：按模块拆开的 9 个样式层，顺序由入口文件固定。
- `lib/employee-auth.ts`：员工会话、学校隔离、角色和功能权限（**权限只能改这里**）。
- `lib/employee-api.ts`：员工端接口主干，路径与方法只在这里定义。
- `lib/employee-api-types.ts`：35 个共享数据类型。
- `lib/employee-permissions.ts`：角色/功能中文名与默认权限。
- `lib/use-smart-studio-runs.ts`：智能模式三条链路的状态与请求编排。
- `lib/ai-providers.ts`：文字模型与图片模型的服务端配置边界。
- `scripts/workers/deck-generation/deck-generation-worker.mjs`：生成 PPT 的后台执行脚本。
- `scripts/workers/ppt-polish/ppt-polish-worker.mjs`：美化 PPT 的后台执行脚本。
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

## 上一个话题做到哪了（2026-09-22 · 画面质量与写实化）

**分支：`codex/illustration-and-style-fix`（10 个提交，未合并 main）。起点是 `main` 的 `a0c5f99`。**

**这一话题只动了两层：提示词（`skills/`）和 AI 调用网络层（`scripts/`）。架构一个字没改。**

```powershell
git diff --stat main...HEAD   # 22 个文件，+4053 / -404
```

| 目录 | 改动文件数 |
| --- | --- |
| `components/`、`lib/`、`app/`、`prisma/`、`docs/` | **0**（架构与界面完全没动） |
| `skills/deck-generation/**` | 10 个（9 改 + 1 新增 `illustration-system.md`） |
| `scripts/` | 3 个（`ai-service-client.mjs`、`deck-generation-worker.mjs`、`ppt-polish-worker.mjs`） |
| `PPTskills汇总/`（新顶层目录） | 8 个纯文档，**代码不读它** |

### 做了什么

1. **查清了"插图过小 / 没有插图 / 很假"的根因**（`PPTskills汇总/05-根因诊断`，带行号证据）。最值钱的一条：`deck-generation-worker.mjs` 在 `image_language` 字段上读了**一个永远为空的值**，因为 `visual-identity.md` 声明的字段名和代码读的键名对不上（4 个字段全军覆没）。
2. **给提示词补上"画面占比"这个维度**：全链路原本没有任何面积约束，模型就把插图缩成装饰角标。
3. **把禁止式规则改成"禁令 + 替代品"**：原来 12/15 条约束都是 Never/Do not，模型选了最省事的合规解——什么都不画。
4. **美化 PPT 链路第一次读 `skills/`**，并去掉了硬编码的蓝金视觉锁（它让员工选的其它风格包完全失效）。
5. **修掉快速版 4 个缺陷**：没有任何正向插图指令、参考图配色模式下仍注入带颜色的风格包、颜色中性判断漏了快速版、参考图配色静默退化成纯文字色值。
6. **修掉一个隐蔽的依赖升级回归**：undici 8 起 `allowH2` 默认变 `true`，AI 调用被静默切到 HTTP/2；高级版 6 页并发复用一条 h2 连接时中转站拒绝新增流（`NGHTTP2_REFUSED_STREAM`），前 6 页全挂。已显式 `allowH2: false`，并给图片调用补上瞬态重试（文字调用一直有，图片调用一直没有）。
7. **画面方向定为"写实"**（详见下面"产品决策"）。

### ⚠️ 本话题必须遵守的既有决策（不要重新讨论）

| 决策 | 内容 |
| --- | --- |
| **参考图配色 ≠ 参考图当素材** | 参考图配色只以**本地提取出的色值清单**（文字硬约束）生效，**两条链路都不把参考图原文件交给 Image2**。曾经有 `palette-reference.md` 写着"必须把原图作为 Image2 输入"，就是它导致误改，已改写并加了警告。 |
| **用户资料图片不作页面素材** | `advancedSourceVisualReuseEnabled` / `protectedEvidenceMasksEnabled` 保持 `false`。owner 实测过让用户图片进渲染，会与后续加工互相干扰。**不要因为 owner 要求"写实"就去打开这两个开关。** |
| **画面默认走写实** | owner 明确否决"卡通风/扁平矢量"。写实指的是**画面质感**（真实材质、自然光、诚实纹理），靠提示词实现。真实性红线只针对**凭证**：证书、合同、检测报告、盖章文件、机构招牌、logo、仿真截图、可辨认真人。 |
| **快速版不加交付安全检查** | owner 决定不加（Q5），快速版保持"便宜"定位，不调用 `auditDeckConsistency`。 |

### 完全没验证的部分（接手须知）

**本话题所有改动都是提示词/网络层，只跑过静态检查（`npm run verify` 全绿），一次真实出图验证都没做过。**

接手后第一件事应该是：起 `npm run dev:lite` → 打开 `/employee` → 点「暂不扫码，进入本地工作台」→ 生成一页或几页 → 按 `PPTskills汇总/07-出图验收单.md` 的 10 项逐页打分。

已知待办：
- `docs/current-project-memory.md` 的功能状态**尚未同步本话题**（接手者可补）。
- 输出质量是否真的变好，**未经视觉验证**。
- 根因诊断里列的 P1/P2 项（代码层的硬编码提示词迁移、风格条带全是矩形等）**没有做**，只做了 P0。

## 更早的话题：模块化改造（2026-09-14）

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

## 本话题踩过的坑（照做能省几小时）

### 工具与流程

1. **`npm run verify` 会改写 `next-env.d.ts`**（把 `.next-dev` 指向 `.next`）。每次跑完 `git restore next-env.d.ts`，否则工作区永远不干净。这是 Next 自动生成的，不是人的改动。
2. **`deck-generation-worker.mjs` 是 CRLF/LF 混用**（约 3991 CRLF + 110 纯 LF）。直接编辑会把 110 行行尾一起改掉，产生纯空白 diff 噪音。**比对差异用 `git diff --ignore-cr-at-eol`**；插入单行时用字节级写入（latin1 往返）保留原行尾。
3. **PowerShell 传多行 commit message 会失败**——含引号时 `git commit -m $msg` 会把后半段当成 pathspec。**写成文件用 `git commit -F 文件`**，用完删掉。
4. **`--max-warnings 0` 会抓出"删代码留下的孤儿函数"**。本话题它抓到两次（`imageMimeType` 变成未使用）。删掉调用点后一定要重跑验证。
5. **`Select-String -Path` 遇到 `[id]` 这种路径会当通配符**，静默找不到文件。用 read/glob 工具，别用 PowerShell 路径。

### 覆盖陷阱（最容易白干）

6. **`style-packs.md` 只在「内置配色」模式被读取；「参考图配色」模式读的是 `advanced-layout-profiles.md`。** 只改其中一个，另一条链路完全不生效。**`illustration-system.md` 是无条件读取的**，跨模式的规则写在那里最保险。
7. **7 个风格包 id 在 8 处重复定义**（`lib/employee-deck-constants.ts`、4 个 API 路由、worker 里 2 个映射表、美化 worker 1 个）。**想新增风格包必须同时改这 8 处**，漏一处就是"界面能选、后台认不出"。
8. **`normalizePlan` 是严格白名单**（`deck-generation-worker.mjs`）。往方案 JSON 里加新字段**不会**进入图片提示词——必须用散文写进 `composition` / `main_visual_brief` 这些自由文本字段。

### 网络层的三条硬事实

9. **`ai-service-client.mjs` 里 `allowH2` 必须保持 `false`。** undici 8 起默认 `true`，中转站只要被 offer h2 就一定选 h2，6 页并发会被拒绝流。**不要删掉这个选项。**
10. **图片调用和文字调用都要有瞬态重试。** 文字调用一直有 `withTransientRetry`，图片调用是本话题才补上的。中转站的容量类错误（`No available compatible accounts`、`上游服务异常`）必须能被 `transientAiFailure` 认出来，否则整页直接判失败。
11. **`.env` 里 `AI_IMAGE_SIZE` 目前是 `2560x1440`**（owner 自己改的，非标准尺寸）。代码默认是 `1536x864`。如果遇到「没有可用兼容账号」类报错，先怀疑尺寸兼容性，退回 `1536x864` 对照。

## 常用验证

```powershell
npm run verify          # tsc + eslint(--max-warnings 0) + prisma validate + next build
npm run verify:check    # 只跑静态检查，改代码过程中随时可用
npm run verify:build    # 只跑生产构建，交付前必跑
```

**eslint 警告基线是 0**（2026-09-26 从 11 收紧）。**任何新增警告都会让这条命令失败**——包括未使用的 import，也包括"删了调用点留下的孤儿函数"。这是刻意的。同一天清掉了 `scripts/workers/design-agent/design-agent-worker.mjs` 里 31 个零引用声明（文件从 1695 行降到 1282 行）。

> 注意：该文件里还留着 **5 处前任作者特意标注"为后续工作流保留"的旧代码**（`buildSmartExplodeRun`、`decomposeMaster`、`generateCleanBackground`、`smartCleanPrompt`、`legacyProcessRun`），各自带 `eslint-disable-next-line` 注释。
> **它们是有意保留的，不是垃圾。** 要删必须单独确认。

本机 PowerShell 默认禁止跑 `npm` 脚本，需要先：
`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

运行时验证的可复用做法：临时起 Next 开发服务（`NEXT_DIST_DIR=.next-smoke` + 一个空闲端口），请求 `/` 与 `/employee` 确认 HTTP 200，**用后必须停服务、删临时目录、`git restore tsconfig.json next-env.d.ts`**（dev server 会自动改写这两个文件）。

视觉或交互改动还应按模块运行现有视觉测试，并检查桌面与手机布局。外部 AI、Codia、微信和 ONLYOFFICE 的失败要区分代码、配置、网络和额度问题，不能用假成功掩盖。

## 当前优先原则

- 生成 PPT 和美化 PPT 都遵循：填写要求 → 生成方案 → 用户确认 → 生成预览 → 单页返工 → 最终导出。
- 高级版生成 PPT 必须保留资料来源位置，用户可规定大标题、小标题和每页内容。
- 文字分析使用 `AI_TEXT_API_KEY`，图片生成使用 `AI_IMAGE_API_KEY`，两把密钥不得混用。
- Codia 转换前保留可独立下载的图组和 PDF；Codia 不可用也不能丢失已确认预览。
