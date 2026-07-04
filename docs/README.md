# PPTagent 文档入口

这个目录是当前项目的新文档入口。以后优先看这里，不再依赖根目录旧轮次对话存档。

## 推荐阅读顺序

1. `project-archive-2026-07-03.md`
   - 当前项目完整存档。
   - 记录智能模式、生成 PPT、Codia 转 PPT、OpenAI 生图和协作边界。

2. `maintenance-audit-2026-07-03.md`
   - 瘦身、提速、可读性审计。
   - 记录哪些文件已清理，哪些目录不能乱删，后续如何继续瘦身。

## 当前运行入口

完整开发模式：

```powershell
npm run dev
```

轻量开发模式：

```powershell
npm run dev:lite
```

`dev:lite` 只启动 Next、旧生图 worker、生成 PPT worker，适合日常改智能模式。需要 ONLYOFFICE 检查、图片炸开、组件拆图时仍使用 `npm run dev`。

查看项目体积来源：

```powershell
npm run storage:report
```

## 当前核心文件地图

- `components/employee-app.tsx`
  - 员工工作台主前端。
  - 包含 SmartStudio、DesignStudio、小 W 面板、图片工具等。

- `scripts/deck-generation-worker.mjs`
  - 生成 PPT 的核心 worker。
  - 负责方案规划、逐页生图、PDF 合成、Codia 转 PPT。

- `skills/deck-generation/`
  - 生成 PPT 的可读 Markdown 技能规则。
  - 这里是“图组导演层”的人类可读版本。

- `scripts/design-agent-worker.mjs`
  - 单页生图和旧智能设计任务 worker。

- `app/api/employee/services/[id]/deck-generation/`
  - 生成 PPT 相关 API。

更多目录说明：

- `components/README.md`
- `scripts/README.md`
- `skills/README.md`

## 已移除的旧资料

根目录旧轮次 Markdown 和旧 AGENTS 版本已经从当前主干移除，原因是它们会让后续开发误读旧上下文。

如需追溯，可以从 Git 历史恢复，例如：

```powershell
git show 0d87e61:0626.md
```

不要直接把旧文件覆盖回当前项目。
