# 功能 → 文件 对照表

> 用途：想知道「某个模式到底有哪些文件」时查这份，不用再翻目录。
> 生成时间：2026-09-27。配套 `docs/project-map.md`（目录地图）与 `components/employee/README.md`（界面模块索引）。
>
> **本文件只做索引，不是状态清单。** 功能是否可用看 `docs/current-project-memory.md`。

---

## 一、先说清楚：哪些分了，哪些混了

| 层 | 是否按模式分开 | 说明 |
| --- | --- | --- |
| **`app/api/employee/services/[id]/`** | ✅ **分得很干净** | 一条链路一个目录：`deck-generation/`、`ppt-polish/`、`generate-images/`、`design-agent/`、`image-explode/`、`image-tools/`、`image-to-pptx/` |
| `components/employee/` | 🟡 **命名分了，目录没分** | 16 个面板平铺在一个目录，靠**文件名前缀**区分（`deck-*` / `polish-*` / `explode-*`） |
| `scripts/` | ✅ **已按模式分目录** | 后台脚本在 `scripts/workers/<模式>/`（`deck-generation/` / `ppt-polish/` / `design-agent/` / `image-explode/` / `shared/`），顶层只剩启动与运维脚本 |
| `skills/deck-generation/` | ✅ **边界已划清** | 只服务生成 PPT；美化读自己的 `skills/ppt-polish/`，生图不读任何 skill（见第十节） |
| `uploads/employee-workspace/` | 🟡 **部分共用** | 生成 PPT 有自己的子目录；**图片产物三条链路共用 `images/`**（按时间戳命名） |
| `app/employee/styles/` | ❌ **不按模式分** | 9 层样式按"覆盖顺序"分，不是按功能分 |

**结论**：**接口层是分得最清楚的一层**——如果你只是想找"某个模式的后端在哪"，直接看 `app/api/employee/services/[id]/<模式名>/`。混的主要是脚本、提示词和产物目录。

---

## 二、生成 PPT（快速版 + 高级版）

| 层 | 文件 |
| --- | --- |
| **界面表单** | `components/employee/deck-generation-form.tsx`（快速版/高级版、页数、大纲、资料、配色、统一元素） |
| **界面运行面板** | `components/employee/deck-run-panels.tsx`（高级版逐页复核 + 资料编辑 + 内联执行区，497 行） |
| **界面展示** | `components/employee/deck-summary.tsx`（资料读取报告 + 逐页内容复核） |
| **挂载点** | `components/employee-app.tsx`（小 W 智能模式的壳） |
| **接口（11 条）** | `app/api/employee/services/[id]/deck-generation/runs/route.ts`<br>`…/runs/[runId]/{confirm,replan,pages,settings,images,pdf,ppt}/route.ts`<br>`…/runs/[runId]/slides/[slideId]/{image,regenerate}/route.ts`<br>`…/runs/[runId]/visual-evidence/[evidenceId]/image/route.ts` |
| **后台执行脚本** | ⭐ `scripts/workers/deck-generation/deck-generation-worker.mjs`（**242 KB，全项目最大的一个文件**） |
| **资料解析** | `scripts/workers/deck-generation/deck-source-parser.mjs`（PDF/Word/Excel/PPTX/文本，保留来源页码） |
| **提示词规则** | `skills/deck-generation/**`（14 份，含子目录 `advanced-single-slide-director/`）；读取清单看 `skills/README.md` |
| **风格包真源（新）** | ⭐ `lib/employee-deck-packs.mjs`（4 个风格包 + 4 个版式语言 id，界面/接口/两个 worker 全部 import 它，见第十一节） |
| **共享代码** | `lib/employee-deck-shared.ts`、`lib/employee-deck-constants.ts`、`lib/employee-api.ts`（`deck` 分组） |
| **数据表** | `DeckGenerationRun` / `Source` / `Evidence` / `VisualEvidence` / `PagePlan` / `Slide` / `ImageCall` |
| **产物落盘** | `uploads/employee-workspace/deck-generation/{sources,themes,evidence}/` + `images/`（成图） |

**两个容易踩的点**：
- `skills/deck-generation/style-packs.md` **只在「内置配色」模式被读取**；「参考图配色」模式读的是 `advanced-layout-profiles.md`。改一个不影响另一个。`illustration-system.md` 在生成链路的两种配色模式下**都读**；美化链路只读 `style-packs.md`，**不读** `illustration-system.md`。
- `normalizePlan`（worker 内）是**严格白名单**，往逐页方案 JSON 里加新字段不会进图片提示词。

---

## 三、美化 PPT

| 层 | 文件 |
| --- | --- |
| **界面表单** | `components/employee/polish-ppt-planner.tsx`（来源、风格、整套方向、逐页要求） |
| **界面运行面板** | `components/employee/polish-inline-run.tsx`（预览、单页返工、转 PPT / 下载） |
| **类型** | `components/employee/polish-types.ts` |
| **接口（7 条）** | `app/api/employee/services/[id]/ppt-polish/runs/route.ts`<br>`…/runs/[runId]/{confirm,retry,pdf,ppt}/route.ts`<br>`…/runs/[runId]/slides/[slideIndex]/{image,regenerate}/route.ts` |
| **后台执行脚本** | ⭐ `scripts/workers/ppt-polish/ppt-polish-worker.mjs`（33.6 KB） |
| **心跳检查** | `lib/ppt-polish-worker-health.ts` |
| **提示词规则** | 共享 1 份：`skills/deck-generation/style-packs.md`（"目标风格"选项的定义，与生成同一份列表）。**画面工程规则不共享**，美化的画面合同在本脚本内的硬性要求里（见第十节） |
| **风格包（共用 id 契约）** | ⭐ `lib/employee-deck-packs.mjs`（中文名映射，不再自带副本，见第十一节） |
| **接口校验** | `app/api/employee/services/[id]/ppt-polish/runs/route.ts` 用 `deckStylePackIds` 校验 `stylePack` |
| **产物落盘** | `uploads/employee-workspace/ppt-polish-runs/*.json`（任务状态）+ `images/`（成图） |

**三个与生成 PPT 不同的地方**：
- **没有 Prisma 任务表**，任务状态存在 JSON 文件里（生产可靠性待加强）。
- **全链路没有文字模型**——方案只是用户输入的回显。
- **看不到原页面**：只从 PPTX 抽取文字，不把原图交给 Image2，所以是"按文字重画"而非"保留版式美化"。

---

## 四、生图（AI 创作助手 → AI 图片）

| 层 | 文件 |
| --- | --- |
| **界面** | `components/employee/ai-assistant-panel.tsx`（`AiPanel`：AI 会话 + 生图） |
| **接口** | `app/api/employee/services/[id]/generate-images/route.ts`<br>`app/api/employee/generated-images/[id]/route.ts`（读图 / 加入素材库） |
| **执行方式** | ⚠️ **没有独立后台脚本**——在 Next 进程内异步执行（重启会留下 `processing` 任务） |
| **供应商与模型** | `lib/ai-providers.ts`（`imageModelOptions`：ARK Seedream 5.0 默认 / YZStudio gpt-image-2） |
| **提示词** | ❌ **无风格库、无模板**，员工输入框原文直接当提示词；**不读 `skills/`** |
| **产物落盘** | `uploads/employee-workspace/images/`（**不做 resize**，原始字节直存） |

**已知不符**：界面文案写"生成 16:9 PNG"，但 `size` 硬编码 `1024x1024`，所以实际是正方形；`AI_IMAGE_SIZE` 对这条链路无效。

---

## 五、单页智能设计（小 W → 生图）

| 层 | 文件 |
| --- | --- |
| **界面** | `components/employee/design-run-panel.tsx`（阶段事件流、成品/背景预览） |
| **接口（4 条）** | `app/api/employee/services/[id]/design-agent/runs/route.ts`<br>`…/runs/[runId]/{route,apply,cancel}.ts` |
| **后台执行脚本** | `scripts/workers/design-agent/design-agent-worker.mjs`（98.9 KB） |
| **提示词** | `scripts/workers/design-agent/design-agent-skills.mjs`（写成 JS 字符串，不在 `skills/` 目录里）。**注意它的实际归属**：7 个常量里 **6 个是"拆图 / 抠图 / 重建"规则**（`cleanBackgroundSkill`、`partDecompositionSkill`、`partCutoutSkill`、`textArtCutoutSkill`、`rebuildAlignmentSkill`、`partRepairSkill`），**只有 `masterRenderSkill` 是单页渲染规则**。`partRepairSkill` 全仓零引用。 |
| **外部技能文件** | ~~`抠图准备工作skill/`~~ 已于 2026-09-27 删除（只被死代码引用，运行时从不读取）。`scripts/workers/design-agent/design-agent-worker.mjs` 里还留着一个指向它的路径常量，属于死代码 |

**注意**：`design-agent-worker.mjs` **同时服务本模式与生图**；2026-09-27 已清掉 **31 个零引用声明**（文件从 1695 行降到 1282 行），现在 eslint 警告为 **0**。文件里仍保留 ~~5~~ 处**前任作者特意标注"为后续工作流保留"**的旧代码（图片炸开 / 拆图重建那条路，如 `buildSmartExplodeRun`、`decomposeMaster`、`generateCleanBackground`、`smartCleanPrompt`、`legacyProcessRun`），它们各自带着 `eslint-disable-next-line` 注释，**不是遗漏，不要当成垃圾清掉**。

---

## 六、图片工具（智能抠图 / 图片转 PPT / PPT 提取图片）

| 层 | 文件 |
| --- | --- |
| **界面** | `components/employee/image-tools-panel.tsx`（`ImageToolsPanel`，2026-09-27 起与生图分开） |
| **类型** | `components/employee/tools-ai-types.ts` |
| **接口** | `app/api/employee/services/[id]/image-tools/segmentation/route.ts`（佐糖抠图/变清晰）<br>`…/image-to-pptx/route.ts`（Codia 图片转 PPTX）<br>`…/import-image/route.ts`（本地图片入库）<br>`app/api/employee/work-documents/[id]/extract-images/route.ts`（从 PPTX 抽图） |
| **工具定义** | `lib/techsz-image-tools.ts` |

---

## 七、图片炸开 / 组件拆图（**入口已停用，后端在线**）

| 层 | 文件 |
| --- | --- |
| **界面** | `components/employee/explode-studio.tsx`、`explode-image-preview.tsx` |
| **接口（6+1 条）** | `app/api/employee/services/[id]/image-explode/runs/route.ts`<br>`…/runs/[runId]/{route,apply,reconstruction}/route.ts`<br>`…/runs/[runId]/parts/[partId]/{clean-text,refine}/route.ts`<br>`app/api/employee/image-explode/parts/[partId]/route.ts` |
| **后台执行脚本** | `scripts/workers/image-explode/image-explode-worker.mjs`（18.2 KB） |
| **本地拆图服务** | `scripts/component-extractor.mjs` / `component-extractor.py`、`Dockerfile.components`、`requirements-components.txt` |
| **可选后端** | OpenCV（基线）/ PaddleOCR / SAM3 / Grounded-SAM2，配置见 `.env` 与 `README.md` |
| **入口状态** | `components/employee-app.tsx` 的 `openExplode()` **只弹提示**，不进入 |

---

## 八、共享层（这些文件被多条链路共用，改它要同时想到所有调用方）

| 文件 | 被谁用 | 改动风险 |
| --- | --- | --- |
| ⭐ `scripts/workers/shared/ai-service-client.mjs` | **生成 PPT + 美化 PPT + 生图 + 单页设计**（全部 AI 调用） | 🔴 高。网络层：超时、重试、`allowH2: false`。**这三条链路的稳定性都靠它** |
| `lib/ai-providers.ts` | 文字/图片两条中转的配置边界 | 🔴 高。两把 Key 不得混用 |
| `lib/employee-api.ts` | **所有前端请求**的唯一入口（含 `deck`/`polish`/`design`/`images`/`explode` 分组） | 🔴 主干层，一次只允许 1 人改 |
| `lib/employee-api-types.ts` | 35 个共享类型 | 🔴 主干层 |
| `lib/employee-auth.ts` | 权限、学校边界、角色、功能权限 | 🔴 **改权限只能改这里** |
| `app/employee/styles/`（9 层） | 所有员工端界面 | 🟡 按覆盖顺序分，改错层不生效 |
| `uploads/employee-workspace/images/` | 生成 PPT + 美化 PPT + 生图 + 拆图 **四条链路的成图都落这里**，按时间戳命名 | 🟡 清理前必须确认归属 |
| `prisma/schema.prisma` + `scripts/init-db.mjs` | 全部数据模型 | 🔴 **改字段必须同时改这两处** |

---

## 九、三句话总结

1. **找后端**：看 `app/api/employee/services/[id]/<模式名>/`，一条链路一个目录，最清楚。
2. **找脚本**：看 `scripts/workers/<模式>/`，**2026-09-27 已按模式分目录**（`deck-generation/` / `ppt-polish/` / `design-agent/` / `image-explode/` / `shared/`）。`scripts/` 顶层现在只剩启动与运维脚本。
3. **找界面**：看 `components/employee/`，靠文件名前缀（`deck-*` / `polish-*` / `image-tools-*`）区分。`tools-ai-panels.tsx` 已于 2026-09-27 拆成 `ai-assistant-panel.tsx`（生图）与 `image-tools-panel.tsx`（图片工具）。

---

## 十、按模式隔离：规则边界（2026-09-27 决定，2026-09-30 合并后收紧）

**owner 的判断（以此为准）**：生成 PPT、美化 PPT、生图是**三个不同的模式，不应该存在黏连**。

| | 内容 | 为什么 |
| --- | --- | --- |
| ❌ **不共享** | `skills/deck-generation/**` 全部（含 `style-packs.md`、`illustration-system.md`） | 生成链路是"从零画整页"，美化是"改造已有页面"，画面合同本来就会越走越远。共享一份规则，生成那边的改动就会无声改掉美化的产出 |
| ✅ **美化自己的** | `skills/ppt-polish/visual-redraw-system.md` | 美化的页面重绘边界、信息保真要求、封面/正文/结尾规则，由美化 worker 直接读自己目录 |
| ✅ **仍然共用（但只被生成用）** | `lib/employee-deck-packs.mjs`（风格包 id 清单） | 界面与接口之间的 id 契约。**2026-09-30 起美化表单不再有"目标风格"**，所以它现在只服务生成链路。详见第十一节 |
| ❌ **不共享** | 生图链路的提示词 | 普通生图的提示词全在 `design-agent-worker.mjs` 代码里，本来就不读 skills |

**演变过程（避免以后又走回头路）**：
1. 最早：美化注入 `style-packs.md` + `illustration-system.md`（两条链路焊在一起）。
2. 2026-09-27：按"性质"划线——`style-packs.md` 保留共享（因为美化当时也有"目标风格"下拉框，同一个 id 必须同一个含义）。
3. 2026-09-30：美化改成"保护要求 + 逐页修改要求"，**表单里的风格包被移除**，于是连 `style-packs.md` 也不再需要共享。边界收紧为：**美化只读自己的 `skills/ppt-polish/`，不读 `skills/deck-generation/` 的任何文件。**

**已执行**：`ppt-polish-worker.mjs` 里 `readSkill()` / `styleRoot` 那段与 `style-packs.md` 的注入已全部删除，只保留 `polishVisualRules`（读自己的 `skills/ppt-polish/visual-redraw-system.md`）。**生成 PPT 的读取面一个字节都没动。**

**生图链路同理**：`scripts/workers/design-agent/design-agent-skills.mjs` **不能**搬到 `skills/image-generation/`。
它 7 个常量里 6 个是**拆图 / 抠图 / 重建**规则，只有 1 个是单页渲染规则；搬过去会造成概念混淆。

---

## 十一、风格包清单：一处真源 + 一道自动闸门（2026-09-27）

**问题**：同一份风格包 id 列表曾在 **8 处**重复定义——`lib/employee-deck-constants.ts`、4 个接口路由（`deck-generation/runs`、`runs/[runId]/settings`、`runs/[runId]/replan`、`ppt-polish/runs`）、`deck-generation-worker.mjs` 里的 2 个映射表、`ppt-polish-worker.mjs` 里的 1 个。改一处漏一处就是"界面上能选、后台认不出"。

**现在**：

| 角色 | 文件 | 说明 |
| --- | --- | --- |
| ⭐ **唯一真源** | `lib/employee-deck-packs.mjs` | 4 个风格包（`DECK_STYLE_PACKS`）+ 4 个版式语言（`DECK_LAYOUT_PACKS`）。做 `.mjs` 是因为它是**唯一能同时被 TypeScript 和 Node worker import** 的格式 |
| 界面入口 | `lib/employee-deck-constants.ts` | 只做重新导出（`deckStylePacks` / `deckAdvancedLayoutPacks` / `deckStylePackIds` / `deckDefaultStylePackId` / `deckDefaultLayoutLabel`） |
| 接口校验与缺省值 | 4 个 `route.ts` | `import { deckStylePackIds, deckDefaultStylePackId }`，不再各留一份 `new Set([...])`，也不再写死 `|| "blue-gold-tech"` |
| 表单初始值 | `deck-generation-form.tsx`、`polish-ppt-planner.tsx`、`employee-app.tsx` | 用 `deckDefaultStylePackId`，不写字面量 |
| 提示词中文名 | 2 个 worker | `import { DECK_STYLE_PACK_NAMES, DECK_LAYOUT_PACK_NAMES }`，兜底文案用 `DECK_DEFAULT_STYLE_PACK_LABEL` / `DECK_DEFAULT_LAYOUT_PROMPT_LABEL` |
| 规则文字 | `skills/deck-generation/style-packs.md`（4 段）+ `advanced-layout-profiles.md`（4 段） | 提示词实际注入的内容 |
| ⭐ **自动闸门** | `scripts/check-style-packs.mjs` | 已接入 `npm run verify:check` 的**第一项** |

**一个必须区分开的细节**：版式语言的界面名和提示词名**不是同一个字符串**。界面上第一个档位显示"图文叙事版式（推荐）"，但写进提示词必须是"图文叙事版式"——"（推荐）"是给员工看的，喂给模型就是噪音。所以 `DECK_LAYOUT_PACKS` 每条都带 `label`（界面）和 `promptLabel`（提示词）两个字段，`DECK_LAYOUT_PACK_NAMES` 取的是 `promptLabel`。

闸门检查四件事：① 两份 Markdown 的小节 id 与 `.mjs` **完全一致**（多一个少一个都失败）；② 每个风格包都有配对的版式语言；③ **已删除的 id 不得在 `app/` `components/` `lib/` `scripts/` `skills/` 里复活**；④ **消费者文件里不得再出现任何风格包 id 字面量**（`lib/employee-deck-packs.mjs`、检查脚本和两份 Markdown 之外一律失败，整行注释不计）。`docs/` 与归档文档豁免，因为它们要记录历史。

**顺带做了减法**：风格包由 7 个精简为 4 个，删掉 `blue-purple-ai`（蓝紫 AI）、`red-white-government`（红白政企）、`vivid-roadshow`（活力路演）。依据是数据库 24 次历史生成任务的真实使用分布：`blue-gold-tech` 22 次、`black-gold-business` 4 次、`minimal-academic` 4 次、`white-green-tech` 1 次，**被删的 3 个是 0 次**。保留的 4 个是仅剩的有真实使用记录的包。

**以后新增 / 删除风格包只要改两处**（参考图配色模式还要改第三处）：
`lib/employee-deck-packs.mjs` → `skills/deck-generation/style-packs.md` → （参考图配色）`skills/deck-generation/advanced-layout-profiles.md`。
界面、接口、后台执行脚本都不用动——它们只 import 真源。改完跑 `npm run verify:check`，漏改会自动失败并告诉你该改哪个文件。

> 2026-09-27 已完成且**已验证**的拆分：UI 按模式拆（`ai-assistant-panel` / `image-tools-panel`）、`scripts/` 按模式分目录、风格包清单收敛为单真源。
> 前两项的验证方式是 43 条路径引用全部存在 + 真实启动确认 worker 按新路径拉起，**不是只跑 verify**；
> 风格包收敛的验证方式是 `scripts/check-style-packs.mjs` 正反两个方向都试过（正常通过、故意塞回一个已删 id 就失败）+ 两个 worker 的具名 import 在真实 Node 下能加载。
> 未做的：`design-agent-worker.mjs` 清掉 31 个零引用声明、eslint 基线收紧到 0。

**下一步优先级（高于继续整理目录）**：把资源投入真实功能与出图验证——快速版、美化 PPT、生图三个模式的实跑效果，比目录整齐更能改善产品。
