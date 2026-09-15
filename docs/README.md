# PPTagent 文档入口

这个目录是当前项目的新文档入口。以后优先看这里，不再依赖根目录旧轮次对话存档。

## 推荐阅读顺序

1. `current-project-memory.md`
   - 当前功能状态、运行条件、验证结果和已知风险的唯一入口。
   - 所有“现在到底有什么、能不能运行”的判断优先看这里。

2. `model-handoff.md`
   - 新模型或新任务的最短接手说明。
   - 规定阅读顺序、安全边界和任务开始前应向项目 owner 汇报的内容。

3. `project-control-workflows.md`
   - 项目掌控手册。
   - 用非工程黑话说明微信/企业微信双扫码登录、管理员控制台、生成 PPT、美化 PPT、图片转 PPT 的用户流程、验收点和真实文件位置。

4. `README.md`
   - 面向开发者的产品概览、本地启动、部署和外部服务配置。

5. `project-archive-2026-07-03.md`
   - 历史完整存档。
   - 用于追溯早期方案；不能覆盖当前记忆。

6. `maintenance-audit-2026-07-03.md`
   - 瘦身、提速、可读性审计。
   - 记录哪些文件已清理，哪些目录不能乱删，后续如何继续瘦身。

7. `archive/agents-history.md`
   - 2026-09-14 从 `AGENTS.md` 拆出的全部历史变更记录（第八个话题起）。
   - 只用于追溯“当初为什么这么做”，**不代表当前状态**。
   - `AGENTS.md` 现在只保留必须遵守的规则，已短到能被 AI 完整读入。

8. `readonly-audit-2026-09-14.md`
   - 一次完整的只读审计：目录脉络、74 条接口逐条盘点、前端可达性、功能真伪与改进优先级。

9. `project-map.md`
   - ⭐ **目录地图与项目管理手册**（2026-09-14 生成）。
   - 逐层讲清每个文件夹与子目录的作用、哪些文件夹是一个整体，以及日常怎么管理这个项目：
     三条常用命令、验证门、版本控制与回退、怎么判断文件能不能删、怎么派活给 AI、
     出问题时的排查顺序、新增功能的标准动作。
   - 想快速看懂整个项目结构，从这份开始。

根目录的 `AGENTS.md` 是必须遵守的协作规则；它不是功能清单，历史已移到 `docs/archive/`。

## 代码模块怎么找

员工端已经从单文件拆成 21 个模块文件。**改任何员工端代码前先看 `components/employee/README.md`**，
里面有"哪个文件负责什么、对应哪些接口"的索引表，以及派活的注意事项。
更完整的目录结构与协作方式见 `docs/project-map.md`。

## 当前运行入口

完整开发模式：

```powershell
npm run dev
```

轻量开发模式：

```powershell
npm run dev:lite
```

`dev:lite` 只启动 Next、设计/生图后台执行脚本、生成 PPT 后台执行脚本和美化 PPT 后台执行脚本，适合日常改智能模式。需要 ONLYOFFICE 检查、图片炸开、组件拆图时仍使用 `npm run dev`。

查看项目体积来源：

```powershell
npm run storage:report
```

## 当前核心文件地图

- `components/employee-app.tsx`
  - 员工工作台主前端。
  - 包含默认微信、可切企业微信的双扫码入口、管理员控制台、小 W 面板、图片工具等。

- `lib/wechat.ts`
  - 微信开放平台配置、扫码地址、微信身份读取。

- `lib/employee-workspaces.ts`
  - 单学校与多学校工作区配置，不依赖微信或企业微信。

- `lib/wecom.ts`
  - 企业微信学校应用配置、扫码地址和通讯录成员身份读取；没有学校凭据时入口显示待配置。

- `lib/employee-auth.ts`
  - 员工登录会话、学校边界、角色和功能权限的统一判断。

- `app/api/employee/admin/`
  - 管理员控制台读取成员、统计使用情况和修改权限的后端入口。

- `scripts/deck-generation-worker.mjs`
  - 生成 PPT 的后台执行脚本。
  - 负责方案规划、逐页生图、PDF 合成、Codia 转 PPT。

- `scripts/ppt-polish-worker.mjs`
  - 美化 PPT 的后台执行脚本。
  - 负责确认方案后逐页重绘、生成预览图，并配合转 PDF/PPT。

- `skills/deck-generation/`
  - 生成 PPT 的可读 Markdown 技能规则。
  - 这里是“图组导演层”的人类可读版本。

- `scripts/design-agent-worker.mjs`
  - 单页生图和旧智能设计任务后台执行脚本。

- `app/api/employee/services/[id]/deck-generation/`
  - 生成 PPT 相关 API。

- `app/api/employee/services/[id]/ppt-polish/`
  - 美化 PPT 相关 API。

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
