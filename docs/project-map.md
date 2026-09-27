# PPTagent 目录地图与项目管理手册

> 生成时间：2026-09-14（模块化改造 20 轮之后）
> 本文档的目标：让你打开任何一个文件夹都知道它是干什么的、能不能动、动了影响谁。
> 配套文档：`AGENTS.md`（规则）、`docs/current-project-memory.md`（当前功能状态）、
> `components/employee/README.md`（员工端模块索引）。
>
> ⭐ **想知道"某个模式有哪些文件"请看 `docs/feature-file-map.md`（功能 → 文件对照表）。**
> 本文件按**目录**组织（一个文件夹是干什么的）；那份按**功能**组织（一个模式涉及哪些文件）。两者互补。

---

## 一、先用一句话记住这个项目

**一个 PPT 代做服务系统**：客户在官网下单咨询 → 员工在工作台做 PPT（在线编辑 + AI 生成/美化）→ 交付给客户 → 客户存成资产。

技术上它分成三层，看目录时永远按这三层归类：

```
【界面层】app/ + components/     ← 用户看得到的页面
【业务层】lib/ + prisma/         ← 规则与数据（谁能干什么、数据长什么样）
【后台层】scripts/ + skills/     ← 真正干活的重活（生成 PPT、转格式、拆图）
```

再加三类"非代码"目录：`public/`（静态资源）、`docs/`（文档）、部署与配置文件（根目录散文件）。

---

## 二、顶层全景图（16 个目录 + 22 个根文件）

> 数字核对时间：2026-09-14。目录 16 个、根文件 22 个、`lib` 26 个文件、
> `scripts` 29 个、`components\employee` 23 个、`app\employee\styles` 9 个、
> `docs` 8 个（含本文件）、`skills` 递归 17 个、`app\api` 下 74 个 `route.ts`。

```
D:\PPTagent
│
├─ 【界面层】
│   ├─ app\                     Next.js 页面与 74 条接口  ← 3 文件 + api/ + employee/
│   ├─ components\              前端界面代码（2 个入口 + employee/ 23 个模块）
│   └─ public\                  浏览器直接访问的静态文件（品牌图、插件）
│
├─ 【业务层】
│   ├─ lib\                     26 个文件：权限、接口定义、类型、格式工具
│   └─ prisma\                  数据库模型定义 + 真实数据库文件
│
├─ 【后台层】
│   ├─ scripts\                 29 个文件：启动脚本 + 5 个后台执行脚本
│   └─ skills\                  生成 PPT 的 AI 提示词规则（13 份 Markdown）
│
├─ 【文档】
│   └─ docs\                    7 份 + archive\ 1 份
│
├─ 【部署配置】
│   ├─ onlyoffice\              ONLYOFFICE 容器的限额配置（1 个 json）
│   ├─ Caddyfile                HTTPS 反向代理规则
│   ├─ Dockerfile               主应用镜像
│   ├─ Dockerfile.components    拆图服务镜像
│   ├─ docker-compose.production.yml   生产 5 服务编排
│   ├─ docker-compose.onlyoffice.yml   本机单容器编排
│   ├─ .dockerignore .gitignore .editorconfig
│   ├─ next.config.ts           Next 配置（含开发缓存目录、允许的局域网来源）
│   ├─ tsconfig.json            TypeScript 配置
│   ├─ eslint.config.mjs        代码规范配置
│   └─ package.json             依赖与所有 npm 命令
│
├─ 【数据与运行产物】（不是源码，但很重要）
│   ├─ uploads\                 6.41 GB 真实业务文件 ★必须单独备份
│   ├─ prisma\dev.db            14.6 MB 真实数据库 ★必须单独备份
│   └─ .git\                    版本历史（30 个提交，可回退）
│
├─ 【可再生缓存】（删了会重新生成，不用心疼）
│   ├─ node_modules\            846 MB 依赖
│   ├─ .next\                   442 MB 生产构建产物
│   ├─ .next-dev\               247 MB 开发构建产物
│   └─ .npm-cache\              792 MB 下载缓存
│
├─ 【遗留 / 旁支】
│   └─ supabase\                另一套"报名+预约"业务的建表脚本（未接主链路）
│                               ⚠️ 不要删：scripts\supabase-migrate.mjs 会读它，package.json 有 supabase:migrate / supabase:sync
│       （原 抠图准备工作skill\ 已于 2026-09-26 删除：只被死代码引用）
│
└─ 根目录散文件（清单见第七节）
```

---

## 三、界面层：`app/`（Web 页面与接口）

### 3.1 `app/` 的直接文件（3 个）

| 路径 | 作用 |
| --- | --- |
| `app\page.tsx` | **客户端首页**。服务端先读登录会话，再一次性把该用户的订单、资产、咨询都查出来交给前端 |
| `app\layout.tsx` | **全站根布局**，引入 `app\globals.css`（客户端站点的样式） |
| `app\globals.css` | 客户端站点的样式（藏青/浅蓝 → 樱桃红/宝石蓝三层叠加，746 行） |

### 3.2 `app\employee\`（员工端外壳，2 个文件）

| 路径 | 作用 |
| --- | --- |
| `app\employee\page.tsx` | 员工端入口，只做一件事：读员工会话 → 交给 `components/employee-app.tsx` |
| `app\employee\employee.css` | **员工端样式入口，只有 11 行 `@import`** |
| `app\employee\styles\` | ⭐ **9 个样式层**，见 3.3 |

### 3.3 `app\employee\styles\`（9 个样式层，按顺序覆盖）

> ⚠️ 顺序不能改：后面的层按设计覆盖前面的层。

| 顺序 | 文件 | 行数 | 管什么 |
| --- | --- | --- | --- |
| 1 | `00-tokens-and-base.css` | 468 | 颜色变量（`--bg-app` 等）、基础重置、手机端"仅支持电脑端"阻断页 |
| 2 | `10-theme-navy-lightblue.css` | 247 | 最早的藏青浅蓝主题（**相当一部分是亮色**） |
| 3 | `20-graphite-workbench.css` | 345 | ⭐ **石墨黑工作台主题**，只覆盖 `.ppt-workspace / .design-studio / .explode-studio` |
| 4 | `25-color-refinement.css` | 228 | 石墨黑精修（更柔和的按钮与边框） |
| 5 | `30-identity-and-admin.css` | 634 | 登录页、待审批页、管理控制台 |
| 6 | `40-polish-and-deck-forms.css` | 36 | 美化/生成 PPT 的表单小修 |
| 7 | `50-deck-source-and-review.css` | 282 | 生成 PPT 的资料区与逐页复核 |
| 8 | `60-deck-handoff-and-quality.css` | 553 | 高级版交付与质检面板 |
| 9 | `70-tail.css` | 642 | 最后的历史补丁层（内容较杂，是以后整理的重点） |

**改样式的规则**：先找到对应模块的文件改，不要往入口堆规则。
**想知道某段样式属于谁**：在 `styles\` 里搜类名即可。

### 3.4 `app\api\`（74 条服务端接口）

这是全项目最"标准化"的地方：**一条接口 = 一个文件夹 + 一个 `route.ts`**。

```
app\api\
├─ auth\                       客户端登录
│   ├─ send-code\route.ts      发短信验证码
│   ├─ verify\route.ts         校验验证码并建立会话
│   └─ logout\route.ts         退出
├─ me\route.ts                 客户端个人信息
├─ settings\route.ts           动画/提醒开关
├─ sessions\[id]\route.ts      撤销某台设备的登录
├─ consultations\              预算咨询
│   ├─ route.ts                建/复用咨询会话
│   └─ [id]\messages\route.ts  发消息（含附件）
├─ services\[id]\              客户订单
│   ├─ asset\route.ts          转为资产
│   ├─ download\route.ts       下载交付文件
│   └─ revision\route.ts       申请修改
└─ employee\                   ⭐ 员工端全部接口（约 64 条）
    ├─ me\route.ts             工作台首屏数据
    ├─ auth\                   登录
    │   ├─ wechat\{config,callback,dev}\route.ts   普通微信
    │   ├─ wecom\{config,callback,dev}\route.ts    企业微信
    │   ├─ logout\route.ts
    │   └─ verify\route.ts     已废弃，固定返回 410
    ├─ admin\                  管理控制台
    │   ├─ overview\route.ts   统计与成员列表
    │   └─ members\[membershipId]\route.ts   改角色/权限/状态
    ├─ ai\openai-health\route.ts   两条 AI 中转的配置检查
    ├─ employees\[id]\route.ts     已废弃，固定返回 410
    ├─ generated-images\[id]\route.ts   读图 / 加入素材库
    ├─ image-explode\parts\[partId]\route.ts   读拆图候选部件
    ├─ consultations\[id]\messages\route.ts    员工回复客户
    ├─ onlyoffice\
    │   ├─ callback\[id]\route.ts      编辑器保存回调
    │   ├─ image-bridge\route.ts       拖拽插图命令队列
    │   ├─ image-bridge\images\[id]\route.ts
    │   └─ image-bridge\plugin-config\route.ts
    ├─ work-documents\[id]\         工作文稿
    │   ├─ config\route.ts         给编辑器下发配置与令牌
    │   ├─ file\route.ts           读工作 PPTX
    │   ├─ versions\route.ts       保存版本
    │   ├─ replace\route.ts        替换文件
    │   ├─ insert-image\route.ts   插图片进 PPTX
    │   └─ extract-images\route.ts 从 PPTX 抽图片
    └─ services\[id]\              ⭐ 单个订单下的所有生产工具
        ├─ workspace\route.ts     建/载入工作 PPTX
        ├─ status\route.ts        改订单状态与进度
        ├─ assignee\route.ts      分配负责人
        ├─ import-image\route.ts  本地图片入库
        ├─ generate-images\route.ts   生图（**进程内异步，见风险**）
        ├─ image-tools\segmentation\route.ts  佐糖抠图/变清晰
        ├─ image-to-pptx\route.ts 图片转 PPT（Codia）
        ├─ ai\route.ts / ai\chat\route.ts     AI 助手会话
        ├─ design-agent\runs\                    单页智能设计
        │   ├─ route.ts                          建/列任务
        │   └─ [runId]\{route,apply,cancel}\route.ts
        ├─ deck-generation\runs\                 ⭐ 生成 PPT（14 个端点）
        │   ├─ route.ts                          建/列任务
        │   └─ [runId]\
        │       ├─ confirm\route.ts              确认方案开始生图
        │       ├─ replan\route.ts               换风格重整方案
        │       ├─ pages\route.ts                高级版逐页结构/内容（11.5 KB，最复杂）
        │       ├─ settings\route.ts             返回修改任务资料（10.5 KB）
        │       ├─ images\route.ts               打包图组 ZIP
        │       ├─ pdf\route.ts                  生成/下载 PDF
        │       ├─ ppt\route.ts                  转 PPTX（Codia）
        │       ├─ slides\[slideId]\{image,regenerate}\route.ts   单页图 / 单页返工
        │       └─ visual-evidence\[evidenceId]\image\route.ts    资料图缩略图
        ├─ ppt-polish\runs\                      ⭐ 美化 PPT（9 个端点）
        │   ├─ route.ts
        │   └─ [runId]\{confirm,retry,pdf,ppt}\route.ts
        │       └─ slides\[slideIndex]\{image,regenerate}\route.ts
        └─ image-explode\runs\                   图片炸开（7 个端点）
            ├─ route.ts
            └─ [runId]\
                ├─ route.ts                      读/改/取消
                ├─ apply\route.ts                写入 PPT
                ├─ reconstruction\route.ts       重建预览
                └─ parts\[partId]\{clean-text,refine}\route.ts
```

**看接口目录的三条规律**
1. `[方括号]` = 动态参数（`[id]` 是订单号，`[runId]` 是任务号）。带方括号的目录里才有真正干活的 `route.ts`。
2. 不带方括号、又没有 `route.ts` 的父目录，**只是分组用的壳**（例如 `app\api\employee\admin\`），不要以为它是空目录就删。
3. 唯一真正完全空的是 `app\api\employee\deck-generation\`（历史残留，真实接口在 `services\[id]\deck-generation\`）。

---

## 四、界面层：`components/`（前端代码）

### 4.1 两个入口

| 路径 | 行数 | 作用 |
| --- | --- | --- |
| `components\client-app.tsx` | 486 | ⭐ **客户端全站**（登录、服务介绍、套餐咨询、交付、资产、设置）都在这一个文件里 |
| `components\employee-app.tsx` | 422 | ⭐ **员工工作台外壳**（改造前 3753 行，现在只剩骨架 + 常量 + `DesignStudio`） |
| `components\README.md` | — | 目录说明，改代码前先读 |

### 4.2 `components\employee\`（23 个模块：17 个 .tsx 面板 + 5 个 .ts + README）

这是本项目模块化改造的核心成果。**每一块可以单独派人改，互不影响。**

```
components\employee\
├─ README.md                  ⭐ 模块索引表（哪个文件管什么、对应哪些接口）——改代码前必看
│
├─ 【登录与外壳】
│   ├─ employee-login.tsx          微信/企业微信双扫码登录页 + 手机端阻断页 + 品牌标志 + 加载态
│   ├─ employee-login-types.ts     登录方式与登录配置的类型
│   └─ workbench-chrome.tsx        待审批页、左侧导航、订单任务、客户消息、团队协作、设置
│
├─ 【管理台】
│   ├─ employee-admin.tsx          成员审批/停用、角色与逐项权限、学校筛选、使用统计
│   └─ admin-types.ts              管理台的数据类型
│
├─ 【工作台主界面】
│   ├─ onlyoffice-editor.tsx       ONLYOFFICE 在线编辑器外壳（可拖入 PPTX 替换）
│   ├─ material-rail.tsx           底部素材栏（分页、批量导入、订单素材总库）
│   ├─ ppt-paste-tray.tsx          粘贴托盘（把图片放进剪贴板，在 PPT 里 Ctrl+V）
│   ├─ ai-assistant-panel.tsx      生图 / AI 创作助手（2026-09-26 按模式拆出）
│   ├─ image-tools-panel.tsx       图片工具（抠图 / 图片转 PPT / 提取图片）
│   ├─ tools-ai-shared.ts          上面两个面板共用的小工具
│   └─ tools-ai-types.ts           图片工具面板的类型
│
├─ 【生成 PPT 链路】
│   ├─ deck-generation-form.tsx    创建表单（快速版/高级版、大纲、资料、配色、统一元素）
│   ├─ deck-run-panels.tsx         高级版逐页复核 + 资料编辑 + 内联执行区（497 行，最大一块）
│   └─ deck-summary.tsx            资料读取报告 + 逐页内容复核
│
├─ 【美化 PPT 链路】
│   ├─ polish-ppt-planner.tsx      美化方案表单
│   ├─ polish-inline-run.tsx       运行面板（预览、单页返工、转 PPT）
│   └─ polish-types.ts             美化任务的类型
│
├─ 【单页智能设计与图片炸开】
│   ├─ design-run-panel.tsx        单页设计任务的运行面板
│   ├─ explode-studio.tsx          图片炸开页面（**入口当前被停用，后端在线**）
│   ├─ explode-image-preview.tsx   拆图重建结果大图预览
│   └─ image-preview-modal.tsx     AI 图片放大预览
```

**改组件时的三条铁律**
1. 先读文件顶部的注释块（职责 / 谁可以改 / 依赖 / 被谁用 / 验证方式）。
2. 要调接口 → 用 `lib\employee-api.ts`；**不要在组件里手写 `fetch("/api/...")`**。
3. 要共享类型 → 从 `lib\employee-api-types.ts` 取；**不要 import `employee-app.tsx`**（会形成循环依赖）。

---

## 五、业务层：`lib\` + `prisma\`

### 5.1 `lib\`（26 个文件，全部是服务端逻辑与共享定义）

按作用分成四组：

**A 组｜主干层（改动影响面最大，一次只允许一个人改）**

| 文件 | 行数 | 作用 |
| --- | --- | --- |
| `employee-auth.ts` | 274 | ⭐ **权限的唯一判断处**：员工会话、学校边界、6 种角色、9 项功能权限 |
| `employee-api.ts` | 211 | ⭐ **员工端接口主干**：51 个方法，44 条接口路径只在这里定义 |
| `employee-api-types.ts` | 119 | ⭐ 35 个共享数据类型 |
| `use-smart-studio-runs.ts` | 258 | ⭐ 智能模式三条链路（设计/生成/美化）的状态与请求编排 |
| `employee-permissions.ts` | 63 | 角色与功能的中文名、各角色默认权限 |
| `employee-deck-shared.ts` | 118 | 生成 PPT 面板共用：状态文案、文件体积格式化、逐页草稿构造 |
| `employee-deck-packs.mjs` | 80 | ⭐ **风格包 id 的唯一真源**（4 个风格包 + 4 个版式语言 + 默认值）。`.mjs` 是为了让 `.tsx`/`.ts` 与 `.mjs` worker 都能直接 import；`lib/employee-deck-constants.ts` 只做重新导出 |
| `employee-deck-constants.ts` | 46 | 界面用常量：从 `employee-deck-packs.mjs` 重新导出风格包/版式语言清单、合法 id `Set`、默认风格包 id，外加"统一元素"默认勾选项 |
| `ai-providers.ts` | 比较长 | 文字/图片两条 AI 中转的服务端配置边界 |
| `wechat.ts` / `wecom.ts` | — | 微信、企业微信身份读取（密钥只在服务端） |
| `employee-workspaces.ts` | 78 | 单学校 / 多学校工作区配置 |
| `auth.ts` / `db.ts` | 短 | 客户端会话、数据库连接单例 |

**B 组｜工具层（谁都能用）**

| 文件 | 作用 |
| --- | --- |
| `employee-format.ts` | 日期格式化、手机号脱敏、订单状态转类名、阶段名转中文 |
| `employee-image-urls.ts` | 生成图片的地址拼装 |
| `employee-image-tools.ts` | 图片格式转换、剪贴板、拖拽协议 |
| `upload-limits.ts` | 上传大小限制常量 |
| `techsz-image-tools.ts` | 佐糖抠图/变清晰的工具定义 |

**C 组｜外部服务接入**

| 文件 | 作用 |
| --- | --- |
| `office.ts` | ONLYOFFICE 配置、JWT 与文件令牌 |
| `onlyoffice-image-bridge.ts` | 编辑器拖拽插图的命令队列（**在进程内存里**） |
| `sms.ts` | 短信（mock / 阿里云） |
| `supabase-postgres.ts` | 外部 Postgres 影子同步（**未接主链路**） |
| `ppt-polish-worker-health.ts` | 美化 PPT 后台脚本的心跳检查 |

**D 组｜PPTX 文件操作**

| 文件 | 作用 |
| --- | --- |
| `pptx-design-slide.ts` | 把生成的图片写成一个可编辑 PPT 页 |
| `pptx-image-insert.ts` | 往 PPTX 指定页插图片 |
| `workspace-storage.ts` | 上传文件的目录与命名规则（**所有文件都在扁平目录里**） |

### 5.2 `prisma\`（2 个文件）

| 路径 | 大小 | 作用 |
| --- | --- | --- |
| `prisma\schema.prisma` | 763 行 / 33 个模型 | ⭐ **数据库结构定义**。改数据结构只能改这里 + `scripts\init-db.mjs` 两处 |
| `prisma\dev.db` | 14.6 MB | ⭐ **真实业务数据库**（28 个订单、24 次生成 PPT 等）——**绝对不要当缓存删** |

> 注意：本项目用的是 SQLite + 手写建表脚本（`scripts\init-db.mjs`），不是 Prisma migrate。
> 所以**改字段要同时改 `schema.prisma` 和 `init-db.mjs`**，只改一处会不一致。

---

## 六、后台层：`scripts\` + `skills\`

### 6.1 `scripts\`（顶层 23 项 + `workers\` 下 7 个脚本）

**A 组｜启动脚本（你日常要用的）**

| 文件 | 对应命令 | 作用 |
| --- | --- | --- |
| `dev.mjs` | `npm run dev` | 完整开发：检查 ONLYOFFICE → 建库 → 启动 Next + 4 个后台脚本 + 拆图服务 |
| `dev-lite.mjs` | `npm run dev:lite` | 轻量开发：只启动 Next + 设计/生成/美化三个后台脚本（**不需要 Docker**） |
| `agent-workers.mjs` | `npm run agent:workers` | 只启动全部后台脚本，不启动 Next |
| `ensure-onlyoffice.mjs` | `npm run office:up` | 单独排查 ONLYOFFICE |
| `dev-port.mjs` | — | 自动挑一个可用端口（避开 Windows 保留端口段） |
| `process-group.mjs` | — | Windows 下按进程树正确关闭所有子进程（解决 Ctrl+C 后残留） |
| `next-with-env-proxy.mjs` | — | 用项目环境变量启动 Next 的包装 |
| `init-db.mjs` | `npm run db:init` | ⭐ **建表脚本**（只建表，不塞演示数据） |

**B 组｜后台执行脚本 `scripts\workers\`（按模式分目录，互相不 import，可以分别派人改）**

> 2026-09-26 起按**模式**分目录。加脚本时放进对应模式目录，不要平铺回 `scripts\`。

```
scripts\workers\
├─ shared\ai-service-client.mjs                    172 行   ⭐ 共用网络层（allowH2:false 在这里）
├─ deck-generation\
│   ├─ deck-generation-worker.mjs                  ⭐ 生成 PPT 全流程：读资料 → GPT 规划 → Image2 逐页出图 → PDF → Codia 转 PPTX
│   └─ deck-source-parser.mjs                      解析 PDF / Word / Excel / PPTX / 文本，保留来源页码
├─ ppt-polish\ppt-polish-worker.mjs                美化 PPT：逐页重绘并出预览图（只共享 skills 的 style-packs.md，画面规则在自己脚本里）
├─ design-agent\
│   ├─ design-agent-worker.mjs                     单页智能设计与生图链路
│   └─ design-agent-skills.mjs                     设计脚本的技能文档读取工具
└─ image-explode\image-explode-worker.mjs          图片炸开/组件拆图任务
```

`shared\` 的改动要回归全部 worker；模式目录内的改动只看自己那条链路。

**C 组｜图片拆解相关的本地工具（可选，需要时才用）**

`component-extractor.mjs` / `component-extractor.py` /
`setup-sam3-weights.mjs` / `check-sam3.mjs` /
`setup-grounded-sam2.mjs` / `check-grounded-sam2.mjs` / `check-image-gpu.mjs`

**D 组｜运维、检查与测试脚本**

`check-style-packs.mjs`（⭐ 风格包一致性检查，已接入 `npm run verify:check`）、
`storage-report.mjs`（只读体积报告）、`visual-test.mjs`、`employee-visual-test.mjs`、
`theme-visual-test.mjs`、`supabase-migrate.mjs`、`supabase-sync-existing.mjs`、`README.md`

### 6.2 `skills\`（递归 17 个文件 / 13 份 Markdown 规则）

这里是**给 AI 读的提示词规则**，不是代码。改生成效果优先改这里，不要改脚本里的长字符串。
每个文件被哪条链路读取、以及"哪些文件读了不生效"，看 `skills\README.md` 的对照表。

```
skills\
├─ README.md                              规则总览 + 逐文件读取对照表
└─ deck-generation\
    ├─ SKILL.md                           总规则
    ├─ style-packs.md                     内置配色的颜色与版式定义（4 个风格包，仅内置配色模式读）
    ├─ advanced-layout-profiles.md        高级版"版式语言"（不含颜色，仅参考图配色模式读）
    ├─ illustration-system.md             ⭐ 插图体系：写实、面积合同、负面清单（生成链路无条件读，美化不读）
    ├─ visual-identity.md                 整套 PPT 的视觉身份
    ├─ visual-storyboard.md               页与页之间的连贯性
    ├─ slide-image-specs.md               单页怎么生成
    ├─ source-grounding.md                事实与数字必须带来源
    ├─ outline-control.md                 高级版大纲解析与两次确认
    ├─ content-density.md                 正文页信息密度
    ├─ palette-reference.md               参考图只取颜色关系（不把原图交给 Image2）
    ├─ quality-audit.md                   整套完成后的交付安全检查
    ├─ regeneration-controls.md           单页返工规则
    └─ advanced-single-slide-director\    高级版单页导演 Skill
        ├─ SKILL.md
        ├─ agents\openai.yaml             （⚠️ 没有任何代码读取它）
        └─ references\{evidence-and-authenticity,page-archetypes}.md
```


---

## 七、静态资源、文档与配置

### 7.1 `public\`（浏览器直接访问）

```
public\
├─ brand\wzlcf-mark.png                     ⭐ 品牌标志（代码引用 /brand/wzlcf-mark.png）
├─ agent\ppt-design-mentor.png              ⭐ 智能模式数字人头像（2.3 MB）
├─ agent\.gitkeep
└─ onlyoffice-plugins\wzlcf-image-bridge\   ⭐ 自研编辑器插件（拖拽插图用）
    ├─ config.json
    └─ index.html
```

### 7.2 `docs\`（7 个文件，另有 `archive\` 1 个）

| 文件 | 什么时候看 |
| --- | --- |
| `current-project-memory.md` | ⭐ **想知道"现在有什么、能不能跑"就看这份** |
| `project-map.md` | ⭐ 本文件——目录地图与项目管理手册（**按目录**组织） |
| `feature-file-map.md` | ⭐ **功能 → 文件对照表（按功能组织）**：某个模式涉及哪些界面/接口/脚本/提示词 |
| `model-handoff.md` | 换模型/换人接手时的阅读顺序 |
| `project-control-workflows.md` | 你验收业务流程时看（含每个确认点与交付物） |
| `readonly-audit-2026-09-14.md` | 完整审计报告（目录脉络、74 条接口、问题清单、改造结果）。**历史快照，里面的路径引用按当时状态保留** |
| `README.md` | 文档阅读顺序 |
| `archive\agents-history.md` | ⭐ 全部历史变更记录（从 `AGENTS.md` 拆出来的，69 KB）。**历史快照** |

> 2026-09-26 减法：删除了 `project-archive-2026-07-03.md` 与 `maintenance-audit-2026-07-03.md`
> （两者描述的都是**改造前**的状态，文档自己就标着"会误导"；需要追溯可查 git 历史）。

### 7.3 根目录 22 个文件怎么归类

| 类别 | 文件 | 说明 |
| --- | --- | --- |
| **项目说明** | `README.md`（11.9 KB）、`AGENTS.md`（18.6 KB）、`使用说明`（32 字节） | `AGENTS.md` 是规则，`README.md` 是产品概览 |
| **依赖与命令** | `package.json`、`package-lock.json` | 所有 `npm run xxx` 都在 `package.json` 里定义 |
| **语言/规范配置** | `tsconfig.json`、`eslint.config.mjs`、`.editorconfig` | 改代码规范时动这里 |
| **Next 配置** | `next.config.ts`、`next-env.d.ts` | `next.config.ts` 里定义了开发缓存目录和允许的局域网来源 |
| **环境变量** | `.env`（**含真实密钥，不要外传**）、`.env.example`、`.env.production.example` | 三份对照着看，`.env.example` 应该是"完整模板"（目前它与代码有脱节，见改进建议） |
| **部署** | `Dockerfile`、`Dockerfile.components`、`docker-compose.production.yml`、`docker-compose.onlyoffice.yml`、`Caddyfile`、`.dockerignore` | 生产 5 个服务：app / onlyoffice / agent-worker / component-extractor / caddy |
| **Python 依赖** | `requirements-components.txt` | 拆图服务可选依赖（PaddleOCR） |
| **构建产物** | `tsconfig.tsbuildinfo`（162 KB） | 可再生产物，已在 `.gitignore` 里 |

### 7.4 三个"大而不在 Git 里"的目录（必须单独备份）

| 路径 | 体积 | 内容 | 说明 |
| --- | --- | --- | --- |
| `uploads\employee-workspace\documents\` | **3.12 GB** / 69 文件 | 工作文稿、PDF、PPTX | 客户交付相关 |
| `uploads\employee-workspace\versions\` | **1.86 GB** / 18 文件 | 保存的历史版本 | |
| `uploads\employee-workspace\images\` | 962 MB / 717 文件 | 生成图片、拆图候选 | |
| `uploads\employee-workspace\deck-generation\` | 457 MB / 325 文件 | 生成 PPT 的资料与证据 | |
| `uploads\employee-workspace\references\` | 8.2 MB / 8 文件 | 参考图 | |
| `uploads\employee-workspace\ppt-polish-runs\` | 0.1 MB / 10 文件 | 美化任务 JSON | |
| `uploads\`（顶层散文件 3 个） | 2.9 MB | 早期遗留的上传文件 | |
| `prisma\dev.db` | 14.6 MB | 全部业务数据 | |

**⚠️ 这两处（uploads + dev.db）不在 Git 里、也没有备份。** Git 能帮你回退代码，但救不了这些数据。建议立刻拷一份到别的盘。

---

## 八、哪些文件夹其实是一个整体（分组心智模型）

看目录时，把下面这些"跨目录的组合"当成一个整体来理解：

| 整体 | 由哪些目录组成 | 一句话 |
| --- | --- | --- |
| **① 客户端（客户侧）** | `app\page.tsx` + `app\globals.css` + `components\client-app.tsx` + `app\api\auth|me|settings|sessions|consultations|services` | 客户能看到的全部功能 |
| **② 员工端外壳** | `app\employee\page.tsx` + `app\employee\employee.css` + `app\employee\styles\` + `components\employee-app.tsx` | 员工端的入口与样式 |
| **③ 员工端界面模块** | `components\employee\`（23 个文件） | 拆出来的 17 个界面块 |
| **④ 员工端主干** | `lib\employee-auth.ts` + `employee-api.ts` + `employee-api-types.ts` + `employee-permissions.ts` + `use-smart-studio-runs.ts` | 权限、接口、类型、状态编排 |
| **⑤ 生成 PPT 一条链路** | `app\api\...\deck-generation\` + `components\employee\deck-*.tsx` + `lib\employee-deck-*.ts` + `lib\employee-deck-packs.mjs` + `scripts\workers\deck-generation\` + `skills\deck-generation\` | **改生成效果要同时想到这 7 处**；只加/删风格包则只改 `.mjs` + 两份 Markdown |
| **⑥ 美化 PPT 一条链路** | `app\api\...\ppt-polish\` + `components\employee\polish-*.tsx` + `scripts\workers\ppt-polish\ppt-polish-worker.mjs` + `lib\ppt-polish-worker-health.ts` | 同上，4 处；与生成 PPT 的共享边界只有风格包定义（见 `docs\feature-file-map.md` 第十节） |
| **⑦ 图片炸开一条链路** | `app\api\employee\services\[id]\image-explode\` + `app\api\employee\image-explode\` + `components\employee\explode-*.tsx` + `scripts\workers\image-explode\image-explode-worker.mjs` + `component-extractor.*` | 后端全在，**入口被停用** |
| **⑧ 单页智能设计与生图** | `app\api\...\design-agent\` + `app\api\...\generate-images\` + `scripts\workers\design-agent\` + `components\employee\design-run-panel.tsx` | 普通生图不读 `skills\` |

| **⑨ ONLYOFFICE 在线编辑** | `app\api\employee\onlyoffice\` + `app\api\employee\work-documents\` + `lib\office.ts` + `lib\onlyoffice-image-bridge.ts` + `lib\pptx-*.ts` + `lib\workspace-storage.ts` + `components\employee\onlyoffice-editor.tsx` + `public\onlyoffice-plugins\` + `onlyoffice\` + `docker-compose.onlyoffice.yml` | 11 处协作，**改动风险最高** |
| **⑩ AI 服务接入** | `lib\ai-providers.ts` + `scripts\workers\shared\ai-service-client.mjs` + `.env` 里的 `AI_TEXT_*` / `AI_IMAGE_*` / `CODIA_*` / `ARK_*` / `TECHSZ_*` | **两把 Key 不能混用** |
| **⑪ 权限与多学校** | `lib\employee-auth.ts` + `lib\employee-workspaces.ts` + `lib\wechat.ts` + `lib\wecom.ts` + `app\api\employee\auth\` + `app\api\employee\admin\` + `components\employee\employee-admin.tsx` | 改权限只能从 `employee-auth.ts` 入手 |
| **⑫ 部署** | 根目录 Docker/Caddy 文件 + `onlyoffice\` + `Dockerfile*` + `docker-compose*.yml` | 5 个容器 |

**记住这张表的用法**：当你接到"改生成 PPT 的某某"这种需求时，先查表找到对应的整体（⑤），就知道要同时看哪几个目录，不会漏。

---

## 九、教你以后怎么管理这个项目（能教的都在这）

### 9.1 每天开工前：三条命令

```powershell
# 0) 本机 PowerShell 默认禁止跑 npm 脚本，先开一次
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

# 1) 只调界面/智能模式（不需要 Docker）
npm run dev:lite

# 2) 需要在线编辑 PPT 时（先启动 Docker Desktop）
npm run office:up
npm run dev
```

终端会打印真实端口，**不要假定是 3000**（脚本会自动避开被 Windows 保留的端口）。

### 9.2 改完任何东西：一条命令定生死

```powershell
npm run verify        # check-style-packs + tsc + eslint(--max-warnings 0) + prisma validate + next build
npm run verify:check  # 只跑静态检查，秒级，改代码过程中随时跑
npm run verify:build  # 只跑生产构建，交付前必跑
```

`verify:check` 的第一项 `node scripts/check-style-packs.mjs` 专门守"风格包清单漂移"：它逐 id 比对 `lib\employee-deck-packs.mjs`（真源）与 `skills\deck-generation\` 的两份 Markdown，还会揪出**已经删掉的风格包 id 在代码里复活**、以及**任何消费者文件里又抄了一份 id 字面量**。删风格包时只要漏改一处，这条命令就会带着"该改哪个文件"的提示失败。

**为什么是 `--max-warnings 0`**：2026-09-26 之前基线是 11 条（全在 `scripts\workers\design-agent\design-agent-worker.mjs`），那天把 31 个零引用声明清掉后收紧到 **0**。数字写死的意思是——**不许添新账**。它会拦住未使用的 import 和删代码留下的孤儿函数，这正是它能防止代码腐坏的原因。

> ⚠️ `scripts\workers\design-agent\design-agent-worker.mjs` 里仍有 **5 处前任作者特意标注"为后续工作流保留"** 的旧代码，各带 `eslint-disable-next-line`。**它们是有意保留的，不是垃圾。**

### 9.3 版本控制：你的"后悔药"

```powershell
git log --oneline              # 看改过什么（每条都写了改了什么、怎么验证）
git status                     # 看当前有没有没提交的东西
git diff --stat                # 看改了多少行
git reset --hard baseline      # ★ 一键退回所有改造之前的原始状态
git reset --hard HEAD          # 丢弃当前未提交的改动
```

**规矩**：每完成一件小事就提交一次，提交信息写清楚"改了什么 + 怎么验证的"。这样任何时候都能退回上一个能跑的状态。

### 9.4 判断"这个文件能不能删"

按这个顺序问自己四个问题：

1. **它在 `.gitignore` 里吗？** 在 → 是缓存或数据，删了可能丢数据（`uploads\`、`prisma\dev.db`）。
2. **`grep` 全仓，有人 import 它吗？** 没有 → 可能是废物，但先确认它不是**被路径字符串**调用（例如 `scripts\supabase-migrate.mjs` 按路径读取 `supabase\migrations\*.sql`，`grep` 名字能搜到，但 import 关系里看不到）。
3. **删了之后 `npm run verify` 还过吗？** 不过说明还在用。
4. **它是"空目录"吗？** 空目录也可能是有意义的**分组壳**（如 `app\api\employee\admin\`），删了会让路由结构变乱。

**本项目铁律**：一次只删一个明确路径，禁止 `Remove-Item -Recurse`、`rm -rf` 这类批量删除。

### 9.5 怎么派活给 AI（这是你最关心的）

**核心原则：一次只让一个 agent 碰一个模块，并且明确告诉它不许碰什么。**

派活模板（`AGENTS.md` 里也有）：

```
任务：只修改【美化 PPT 的某某按钮】
允许改：components/employee/polish-inline-run.tsx 第 N-M 行
        app/employee/styles/40-polish-and-deck-forms.css 末尾追加（不得改已有规则）
禁止改：prisma/ lib/employee-auth.ts scripts/ 其他模块目录 任何 .env
验证：npm run verify 必须全绿，并把输出贴出来
交付：改了哪几行 + 一行 diff 摘要 + 你确认没动的东西清单
```

**哪些能并行、哪些必须串行**

| 可以并行（互不影响） | 必须串行（一次一个人） |
| --- | --- |
| `components\employee\` 里不同的组件文件 | `lib\employee-auth.ts`（权限） |
| 不同的 `scripts\*.mjs`（它们互相不 import） | `lib\employee-api.ts`（接口主干） |
| `app\api\employee\services\[id]\` 下不同的功能目录 | `prisma\schema.prisma` + `scripts\init-db.mjs`（要一起改） |
| 不同的 `skills\*.md` | `components\employee-app.tsx`（同一个文件） |

### 9.6 遇到问题时的排查顺序（这个项目特有）

| 现象 | 先查哪里 |
| --- | --- |
| 页面白屏 / 打开报错 | `git status` 看有没有改坏；`npm run verify:check` |
| 生成 PPT 卡住不动 | ① 后台脚本是否在跑（终端有没有 worker 日志）② `docs\current-project-memory.md` 的状态说明 |
| AI 报余额/额度错误 | `.env` 里的 `AI_TEXT_API_KEY` / `AI_IMAGE_API_KEY` 是否配了**对应分组**的额度（两把 Key 不能混） |
| 在线编辑器打不开 | ① Docker Desktop 启动了吗 ② `npm run office:up` 单独排查 |
| 端口占用起不来 | 看终端打印的实际端口；`.next-dev\dev\lock` 是否残留 |
| 图片炸开点了没反应 | **这是已知的**：入口被停用，后端在线 |
| 样式不生效 | 改错层了——样式分 9 层按顺序覆盖，先看 `app\employee\styles\` 里哪一层管这个类名 |

### 9.7 新增一个功能时的标准动作（照这个顺序做）

1. **先定层**：这是界面、业务规则、还是后台任务？（用第二节的三层判断）
2. **找整体**：查第八节的表，看它属于哪个"跨目录组合"，列出所有可能要改的目录。
3. **接口先行**：如果涉及新接口，先在 `app\api\` 加 `route.ts`，并在 `lib\employee-api.ts` 加一个方法。
4. **类型同步**：新数据结构加到 `lib\employee-api-types.ts`。
5. **界面放对位置**：员工端的界面加到 `components\employee\<模块>.tsx`，**不要往 `employee-app.tsx` 里加**。
6. **样式放对层**：加到 `app\employee\styles\` 里对应的模块文件。
7. **跑 `npm run verify`**，全绿才提交。
8. **更新文档**：`docs\current-project-memory.md` 记状态，`docs\project-control-workflows.md` 记业务验收流程。

### 9.8 三条最容易被忽略但最重要的纪律

1. **`uploads\` 和 `prisma\dev.db` 不在 Git 里** —— 你的代码有后悔药，数据没有。**定期备份。**
2. **`.env` 里是真实密钥** —— 不要截图、不要复制给别人、不要提交。项目历史上已经发生过多次密钥暴露。
3. **主干层一次只让一个人改** —— `employee-auth.ts`、`employee-api.ts`、`schema.prisma`、`employee-app.tsx` 这四个文件，两个 agent 同时改必然冲突。

---

## 十、当前目录结构与改进建议的对应关系（改造已完成的部分）

作为对照，20 轮改造前后的变化（**下表是 2026-09-14 的数字，其中"现在"一列已是历史**；
2026-09-26 拆 UI 后 `components\employee\` 为 23 个文件，见 §4.2）：

| 目录 | 改造前 | 现在 |
| --- | --- | --- |
| `components\employee-app.tsx` | 3753 行单文件 | 422 行（只剩壳与常量） |
| `components\employee\` | 不存在 | 21 个文件（16 个界面块 + 4 个类型 + README） |
| `lib\` | 17 个文件 | 26 个（新增 9 个主干/共享模块） |
| `app\employee\styles\` | 不存在（样式全在 1 个 3426 行文件里） | 9 个按层拆分的文件 |
| `AGENTS.md` | 87,965 字节（超出指令预算、会被截断） | 18.6 KB（可完整读入） |
| `docs\archive\` | 不存在 | 1 个文件（历史变更记录） |
| Git | 无仓库 | 30 个提交 + `baseline` 标签 |

**还没做、需要你决策的**：P0 六条安全项（在 `docs\readonly-audit-2026-09-14.md` 第十二节）、员工端侧栏等仍是亮色、图片炸开入口是否接回、`lib\` 里只有 4 处 design-agent 的 `fetch` 还没迁到主干。
