# PPTagent 瘦身、提速、可读性审计（2026-07-03）

本文件记录审计结论和已执行的安全改进。本阶段没有修改页面结构、后端业务逻辑、数据库结构或智能模式核心链路。

## 总体判断

项目确实已经变大，但不能用“批量删除”解决。当前最安全的策略是分三类处理：

1. 可再生缓存：可以清，但需要用户明确确认，且不在源码改动里做。
2. 历史资料：先归档、再决定是否移出项目，不直接删除。
3. 正在运行的功能代码：先文档化，再小步拆分。

## 当前体量来源

2026-07-03 复查结果显示，当前 20GB 主要来自：

- `uploads`：约 5.6GB。
- `.venv-sam3`：约 4.9GB。
- `.venv-image-gpu`：约 4.7GB。
- `.git`：约 2.7GB，已经执行普通 `git gc`，目前主要是历史 pack。
- `.models`：约 0.86GB。
- `node_modules`：约 0.78GB。
- `.npm-cache`：约 0.74GB。
- `.next` / `.next-dev`：约 0.24GB。

源码本身很小。项目“大”的根源是运行产物、本地 AI 环境、模型和缓存。

### 代码主干

- `components/employee-app.tsx`：约 2020 行，是员工工作台、智能模式、图片工具等前端核心入口。
- `scripts/design-agent-worker.mjs`：约 1683 行，是旧智能生图和设计任务 worker。
- `scripts/deck-generation-worker.mjs`：约 744 行，是生成 PPT 的核心 worker。
- `scripts/init-db.mjs`：数据库初始化和演示数据较多。

这些文件不能突然拆。要拆也必须从“纯 UI 小组件”或“纯工具函数”开始。

### 已清理的历史 Markdown

当前已经移除根目录多份历史资料：

- `0626.md`
- `062721pm.md`
- `agent and all.md`
- `agentplus.md`
- `all.md`
- `design.md`
- `introdution.md`
- `AGENTS1.md` 到 `AGENTS6.md`
- `agent/all.md`

它们不参与运行，也没有被代码引用。当前以 `docs/project-archive-2026-07-03.md` 作为新的稳定存档入口。旧内容仍可从 Git 历史追溯。

### 可再生目录

以下目录通常不应进入核心维护视野：

- `.next`
- `.next-dev`
- `.npm-cache`
- `.runtime`
- `.artifacts`
- `.models`
- `.venv-image-gpu`
- `.venv-sam3`
- `node_modules`

其中 `.gitignore` 已经包含这些目录。它们多半是缓存、依赖或运行时产物。清理它们可以瘦身磁盘，但会影响再次启动或再次安装的耗时。

注意：根据当前项目协作规则，不能由我直接批量删除目录。如需清理，应由用户手动清理，或单独确认每个目录的处理方式。

### 运行产物

- `uploads`
- `prisma/dev.db`

这些包含本地工作区文档、生成图片、PDF/PPTX 或数据库状态。它们和当前演示、测试、历史任务有关，不能随便删。

## 瘦身建议

### 第一优先级：建立归档索引

新增一个 `docs/` 目录，把新的项目存档和维护审计放进去。根目录旧 Markdown 已清理，避免后续误读旧上下文。

这样不会破坏运行，也能让后续协作不再依赖散乱对话。

### 第二优先级：只清缓存，不清业务数据

可考虑由用户手动清理：

- `.next`
- `.next-dev`
- `.npm-cache`

但清理 `.next-dev` 后，下一次 `npm run dev` 会重新编译，首次启动不一定更快。

不建议清理：

- `uploads`
- `prisma/dev.db`
- `public`
- `skills`
- `scripts`

如果必须进一步瘦身，建议由用户手动处理以下目录：

- 不再需要历史生成结果时，手动迁移或删除 `uploads/employee-workspace`。
- 不再使用本地 SAM3/图片 GPU 分割时，手动迁移或删除 `.venv-sam3`、`.venv-image-gpu`、`.models`。
- 需要重新安装依赖但想释放空间时，手动删除 `.npm-cache`。
- 需要重新编译但想释放缓存时，手动删除 `.next`、`.next-dev`。

这些都是目录级清理，不应由自动脚本直接批量删除。

### 第三优先级：不要再新增散乱根目录文档

后续新存档、审计、恢复说明都放入 `docs/`。根目录只保留真正参与项目启动或标准入口的文件，例如 `README.md`、`AGENTS.md`、`package.json`。

## 提速建议

### 开发启动慢的原因

`npm run dev` 当前会做这些事：

1. 检查 ONLYOFFICE。
2. 生成 Prisma client。
3. 初始化数据库。
4. 启动 Next dev server。
5. 启动 Design agent worker。
6. 启动 Deck generation worker。
7. 启动 Component extractor worker。
8. 启动 Image explode worker。

所以它比普通 Next 项目慢是正常的。

### 最安全的提速方向

已经新增一个轻量开发命令，没有改掉现有 `npm run dev`：

```text
npm run dev:lite
```

它可以只启动：

- Next dev server。
- Deck generation worker。
- Design agent worker。

暂时不启动：

- Component extractor worker。
- Image explode worker。

这样不会影响正式 `npm run dev`，但日常只改智能模式时会快很多。

这个命令适合日常调智能模式；需要 ONLYOFFICE 检查、组件拆图或图片炸开时继续用完整 `npm run dev`。

另有只读体积报告命令：

```powershell
npm run storage:report
```

它只统计体积，不删除文件。

### 前端运行慢的可能原因

- 素材库图片多，左侧/底部列表一次渲染压力大。
- 右侧任务历史、智能模式轮询会重复刷新状态。
- `components/employee-app.tsx` 过大，热更新成本高。
- 智能模式和多个工具都在同一个组件文件里，状态较密。

可选优化：

- 素材库虚拟列表或分页。
- 只轮询当前 active run。
- 浏览器标签不可见时暂停轮询。
- 智能模式大面板用独立组件懒加载。
- 图片预览统一用固定尺寸和懒加载。

这些都应逐项做，不能一次重构。

## 可读性建议

### 现状

已有 `skills/deck-generation/*.md`，这是好的方向。它们把生成 PPT 的规则从 worker 里拆出来，便于人读和后续修改。

但仍有几个问题：

- Windows PowerShell 普通 `Get-Content` 读取部分 UTF-8 中文文件时会显示乱码。
- `components/employee-app.tsx` 仍然承担太多 UI。
- `scripts/design-agent-worker.mjs` 历史逻辑多，不容易判断哪些还在用。
- 旧 Markdown 多版本并存，容易让后续开发误读旧方案。

### 推荐改进顺序

1. 给 `docs/` 建立新的稳定入口文档。
2. 给 `scripts/` 和 `skills/` 加维护说明，明确哪些是当前链路、哪些是历史链路。
3. 把 `components/employee-app.tsx` 里的智能模式纯 UI 子块，逐步拆到小组件。
4. 每拆一小块就跑 `npx tsc --noEmit`。
5. 不同时改样式、逻辑、数据结构。

### 不建议马上做

- 不建议现在大面积重写编码。
- 不建议一次性拆分 `employee-app.tsx`。
- 不建议删除旧 Markdown。
- 不建议把所有 worker 合并或重写。

## 下一步建议

下一阶段可以从三个低风险方向选一个：

1. 观察 `npm run dev:lite` 的实际启动体验。
2. 给 `scripts/` 和 `skills/` 增加维护说明。
3. 给 `components/employee-app.tsx` 增加顶部结构注释，帮助定位 SmartStudio、DesignStudio、ImageToolsPanel。

最推荐先观察第 1 个，因为它能改善运行慢，而且对业务功能影响最小。
