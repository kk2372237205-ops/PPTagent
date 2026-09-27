# 功能 → 文件 对照表

> 用途：想知道「某个模式到底有哪些文件」时查这份，不用再翻目录。
> 生成时间：2026-09-26。配套 `docs/project-map.md`（目录地图）与 `components/employee/README.md`（界面模块索引）。
>
> **本文件只做索引，不是状态清单。** 功能是否可用看 `docs/current-project-memory.md`。

---

## 一、先说清楚：哪些分了，哪些混了

| 层 | 是否按模式分开 | 说明 |
| --- | --- | --- |
| **`app/api/employee/services/[id]/`** | ✅ **分得很干净** | 一条链路一个目录：`deck-generation/`、`ppt-polish/`、`generate-images/`、`design-agent/`、`image-explode/`、`image-tools/`、`image-to-pptx/` |
| `components/employee/` | 🟡 **命名分了，目录没分** | 16 个面板平铺在一个目录，靠**文件名前缀**区分（`deck-*` / `polish-*` / `explode-*`） |
| `scripts/` | ❌ **混在一起** | 8 个脚本平铺，不按模式分目录 |
| `skills/deck-generation/` | ⚠️ **名字已不准** | 原属"生成 PPT"，**本话题起"美化 PPT"也读它**，所以它是两条链路共用 |
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
| **提示词规则** | `skills/deck-generation/**`（14 份，含子目录 `advanced-single-slide-director/`） |
| **共享代码** | `lib/employee-deck-shared.ts`、`lib/employee-deck-constants.ts`、`lib/employee-api.ts`（`deck` 分组） |
| **数据表** | `DeckGenerationRun` / `Source` / `Evidence` / `VisualEvidence` / `PagePlan` / `Slide` / `ImageCall` |
| **产物落盘** | `uploads/employee-workspace/deck-generation/{sources,themes,evidence}/` + `images/`（成图） |

**两个容易踩的点**：
- `skills/deck-generation/style-packs.md` **只在「内置配色」模式被读取**；「参考图配色」模式读的是 `advanced-layout-profiles.md`。改一个不影响另一个。
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
| **提示词规则** | ⚠️ **`skills/deck-generation/**`（本话题起与生成 PPT 共用）** + 自身硬编码字符串 |
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
| **外部技能文件** | ~~`抠图准备工作skill/`~~ 已于 2026-09-26 删除（只被死代码引用，运行时从不读取）。`scripts/workers/design-agent/design-agent-worker.mjs` 里还留着一个指向它的路径常量，属于死代码 |

**注意**：`design-agent-worker.mjs` **同时服务本模式与生图**；2026-09-26 已清掉 **31 个零引用声明**（文件从 1695 行降到 1282 行），现在 eslint 警告为 **0**。文件里仍保留 ~~5~~ 处**前任作者特意标注"为后续工作流保留"**的旧代码（图片炸开 / 拆图重建那条路，如 `buildSmartExplodeRun`、`decomposeMaster`、`generateCleanBackground`、`smartCleanPrompt`、`legacyProcessRun`），它们各自带着 `eslint-disable-next-line` 注释，**不是遗漏，不要当成垃圾清掉**。

---

## 六、图片工具（智能抠图 / 图片转 PPT / PPT 提取图片）

| 层 | 文件 |
| --- | --- |
| **界面** | `components/employee/image-tools-panel.tsx`（`ImageToolsPanel`，2026-09-26 起与生图分开） |
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
2. **找脚本**：看 `scripts/workers/<模式>/`，**2026-09-26 已按模式分目录**（`deck-generation/` / `ppt-polish/` / `design-agent/` / `image-explode/` / `shared/`）。`scripts/` 顶层现在只剩启动与运维脚本。
3. **找界面**：看 `components/employee/`，靠文件名前缀（`deck-*` / `polish-*` / `image-tools-*`）区分。`tools-ai-panels.tsx` 已于 2026-09-26 拆成 `ai-assistant-panel.tsx`（生图）与 `image-tools-panel.tsx`（图片工具）。

---

## 十、⚠️ 剩下的"共享"**决定不拆**（2026-09-26 决策，勿再重提）

`skills/deck-generation/` 里有两个文件（`style-packs.md`、`illustration-system.md`）**生成 PPT 与美化 PPT 都读**，所以目录名严格讲已不准。**但决定保持现状，理由如下**：

1. **拆它不会提升出图质量**，纯属目录美观。
2. **风险性质和其他拆分不同**：`readSkill()` 是 `readFileSync`，**没有 try/catch、没有存在性检查**。路径写错 `npm run verify` **查不出来**，只会在真实生成任务跑到一半时抛错——正好砸在已验证有效的高级生成 PPT 链路上。
3. 当前的共享不是"结构混乱"，而是**成熟链路给未成熟功能提供可靠底座**：美化 PPT 直接复用生成 PPT 已经调好的配色与画面规则，比让它各写一套更安全。
4. 正确时机是：等**美化 PPT 或生图模式真正开发完整**时，再从现有规则里抽出"确实共用"的部分，那时才建立共享规则文件。

**同样不拆的还有**：`scripts/workers/design-agent/design-agent-skills.mjs` **不能**搬到 `skills/image-generation/`。
它 7 个常量里 6 个是**拆图 / 抠图 / 重建**规则，只有 1 个是单页渲染规则；而且**普通生图根本不用任何 skills**。搬过去会造成概念混淆。

> 2026-09-26 已完成且**已验证**的拆分：UI 按模式拆（`ai-assistant-panel` / `image-tools-panel`）、`scripts/` 按模式分目录。
> 这两项的验证方式是 43 条路径引用全部存在 + 真实启动确认 worker 按新路径拉起，**不是只跑 verify**。
> 未做的：`design-agent-worker.mjs` 清掉 31 个零引用声明、eslint 基线收紧到 0。

**下一步优先级（高于继续整理目录）**：把资源投入真实功能与出图验证——快速版、美化 PPT、生图三个模式的实跑效果，比目录整齐更能改善产品。
