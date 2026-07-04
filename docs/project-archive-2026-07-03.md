# PPTagent 新存档（2026-07-03）

这份存档用于替代前面七轮话题里分散、混乱、情绪负担很重的上下文。以后继续开发时，以这份文档作为新的稳定记忆入口。

核心原则只有一句：先保护现有能跑的项目，再小步改进。

## 当前基线

- 当前仓库：`https://github.com/kk2372237205-ops/PPTagent.git`
- 当前分支：`main`
- 当前远端基线提交：`0d87e61 Improve smart deck generation workflow`
- 当前 Git 状态：工作区干净，`main` 已和 `origin/main` 对齐。

这意味着：后续所有改动都应该建立在 `0d87e61` 之后，不能再用旧存档或旧 Git HEAD 覆盖当前项目。

## 协作边界

任何后续任务都必须遵守：

- 不做整站重构。
- 不整文件覆盖核心文件。
- 不批量删除文件或目录。
- 不使用 `git restore`、`git reset`、`git checkout` 回退用户成果，除非用户明确要求。
- 不使用 `Set-Content`、`Copy-Item` 覆盖正式源码。
- 核心页面只允许小范围 patch。
- 每次功能改动后至少运行 `npx tsc --noEmit`。
- 对可能影响运行的清理、迁移、拆分，先出方案，用户确认后再做。

## 项目定位

PPTagent 是一个 PPT 代做服务网站，当前重点是员工工作台与智能 PPT 生成能力。

项目不是单纯的后台管理系统，而是带有设计感的 PPT 工作流工具。视觉基调是藏青色、浅蓝色、深色玻璃面板，整体要精致、可信、像品牌官网和专业设计工具的结合。

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Prisma 6
- SQLite
- Framer Motion
- Sharp
- ONLYOFFICE
- OpenAI API
- Codia API

常用命令：

```powershell
npm run db:init
npm run dev
npm run dev:lite
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

开发地址：

```text
http://localhost:3000
```

员工工作台地址：

```text
http://localhost:3000/employee
```

## 当前主要功能

### 客户端

客户端包括登录、服务介绍、预算咨询、文件上传、服务交付、修改申请、资产归档和设置页面。

这些功能是早期稳定底座，后续开发智能体时不要随意动客户端主流程。

### 员工工作台

员工工作台是当前重点。主要包括：

- ONLYOFFICE PPT 编辑器。
- 左侧 PPT 缩略图。
- 底部素材库。
- 图片工具入口。
- 右侧 AI 助手。
- 右下角小 W 智能模式入口。
- 智能模式页面。

顶部按钮在不同模式下行为不同：

- PPT 编辑工作台：显示“返回订单”，回订单列表。
- 智能模式：显示“返回工作台”，回 PPT 编辑工作台。

## 智能模式现状

智能模式目前有三个入口：

- 生成 PPT
- 美化 PPT
- 生图

### 生成 PPT

当前“生成 PPT”不是直接生成可编辑 PPTX，而是先生成一组 16:9 高质量页面图，再合成 PDF，最后通过 Codia API 把 PDF 转成 PPTX。

流程是：

1. 用户填写项目名称、比赛类型/用途、页数、风格包、项目简介、参考资料、统一元素。
2. 后台调用 OpenAI 文本模型做方案规划。
3. 先生成结构总览，不直接生图。
4. 用户确认后，后台按页生成组图。
5. 每页生成完成后可预览。
6. 每页下方有两个按钮：
   - 重新生成本页
   - 更贴近上一页
7. 右上角“生成 PPT”会先把组图合成 PDF，再调用 Codia 转 PPTX。

当前已接入的核心文件：

- `components/employee-app.tsx`
- `scripts/deck-generation-worker.mjs`
- `skills/deck-generation/SKILL.md`
- `skills/deck-generation/visual-identity.md`
- `skills/deck-generation/visual-storyboard.md`
- `skills/deck-generation/slide-image-specs.md`
- `skills/deck-generation/style-packs.md`
- `skills/deck-generation/regeneration-controls.md`
- `app/api/employee/services/[id]/deck-generation/runs/route.ts`
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/confirm/route.ts`
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/slides/[slideId]/regenerate/route.ts`
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/pdf/route.ts`
- `app/api/employee/services/[id]/deck-generation/runs/[runId]/ppt/route.ts`

### 图组导演层

生成 PPT 的核心不是“批量生图”，而是“先规划，再按导演层生成”。

后台先生成三层控制文件：

- `visual_identity.json`
- `visual_storyboard.json`
- `slide_image_specs.json`

作用如下：

- `visual_identity.json` 负责整套 PPT 的统一视觉身份，包括色板、背景系统、版式规则、卡片样式、装饰元素、字体感觉和禁止项。
- `visual_storyboard.json` 负责上下页连贯性，包括每页角色、上一页关系、下一页过渡、继承元素和视觉节奏。
- `slide_image_specs.json` 负责每一页具体怎么画，包括标题、页面角色、构图、主视觉、继承元素、变化元素、留白区域、必须出现的信息和必须避免的内容。

每页生图时都会注入：

- 全局视觉身份。
- 全局页面节奏。
- 当前页规格。
- 上一页摘要。
- 下一页摘要。

这样模型知道当前页属于哪套风格，也知道上下页要怎么接。

### 结尾页规则

结尾页不能像内容页一样信息很满。当前规则要求最后一页必须：

- 少内容。
- 强情绪。
- 强收束。
- 强记忆点。
- 像封面一样简洁。
- 禁止三栏卡片、流程图、功能点列表、复杂图表和大段解释。

### 局部重生按钮

当前每页有两个按钮：

- `重新生成本页`：使用 `reroll` 指令重新生成当前页。
- `更贴近上一页`：使用 `closer_previous` 指令，要求只贴近上一页的页眉页脚、主色、背景纹理、卡片外观和装饰节奏，不复制上一页内容。

这两个按钮调用同一个后端接口：

```text
/api/employee/services/${service.id}/deck-generation/runs/${run.id}/slides/${slide.id}/regenerate
```

### 并发

组图生成默认并发为 2 页：

```text
DECK_GENERATION_CONCURRENCY=2
```

`scripts/deck-generation-worker.mjs` 会读取该配置，并限制最大并发为 4。

### 生图

“生图”入口继续保留单页 PNG 链路。

当前规则：

- 输出固定为 16:9 PNG。
- 文生图模式只能输入文字，不把参考图交给 OpenAI。
- 混合模式可以使用参考图和提示词。
- 上传的参考图可以取消。
- 素材库图片可以作为参考加入。

### 美化 PPT

“美化 PPT”目前只保留 UI 入口，不自动启动真实后端链路。

之前尝试过把美化 PPT 接成真实链路，但引入过事故，因此当前策略是：

- 先保留入口。
- 不自动处理原 PPT。
- 不启动重绘工作流。
- 后续如果要做，必须单独立项、先写方案、再小步实现。

## 外部依赖

### OpenAI

OpenAI 用于：

- 生成 PPT 方案。
- 生成每页 16:9 页面图。
- 生图模式生成单页 PNG。

相关环境变量：

```text
OPENAI_API_KEY
OPENAI_PROXY_URL
OPENAI_BASE_URL
OPENAI_TEXT_MODEL
OPENAI_IMAGE_MODEL
OPENAI_IMAGE_SIZE
```

### Codia

Codia 用于：

- PDF 转 PPTX。
- 图片转 PPTX 工具的高级转换。

相关环境变量：

```text
CODIA_API_KEY
CODIA_BASE_URL
```

注意：Codia 可能因为额度、套餐或接口权限返回 402，这不是本地代码必然错误。

### ONLYOFFICE

ONLYOFFICE 用于员工工作台里的 PPT 编辑。

`npm run dev` 会先检查 ONLYOFFICE，再启动开发服务。

`npm run dev:lite` 是轻量开发模式，只启动 Next、旧生图 worker 和生成 PPT worker，适合日常调智能模式。需要 ONLYOFFICE 检查、图片炸开或组件拆图时仍使用完整的 `npm run dev`。

## 当前已知限制

- `components/employee-app.tsx` 约 2020 行，功能集中，后续维护压力大。
- `scripts/design-agent-worker.mjs` 约 1683 行，历史功能多，可读性一般。
- `scripts/deck-generation-worker.mjs` 约 744 行，是当前生成 PPT 核心，暂时不要大拆。
- `npm run dev` 会同时启动多个 worker，因此启动会偏慢。
- Codia 免费额度或套餐限制会导致转 PPT 失败。
- 部分中文文件在普通 PowerShell 读取时会显示乱码，需要统一用 UTF-8 读取或补充维护说明。
- 历史 Markdown 和 AGENTS 多版本已经从当前主干清理，旧内容仍可从 Git 历史追溯。

## 后续开发顺序建议

1. 先保护当前生成 PPT 和生图链路。
2. 优先修明显体验问题，不动底层大结构。
3. 再做可读性文档化。
4. 最后才考虑拆分大文件或清理旧资料。

任何下一阶段都应遵循：

- 先列文件。
- 先说明影响。
- 用户确认。
- 小 patch。
- 跑验证。
- 再提交。
