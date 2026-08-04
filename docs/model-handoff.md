# 新模型接手说明

这份文档用于在更换 AI 模型或新开任务时，用最短路径恢复 PPTagent 的当前上下文。它不是历史记录，而是接手顺序和安全边界。

## 开始前只读这四份

按顺序阅读，读完后先复述理解，不要立刻改代码：

1. `AGENTS.md`：项目硬性规则、当前功能状态、最近改动和不可破坏的边界。
2. `docs/model-handoff.md`：本文件，确认阅读顺序、系统骨架和接手方式。
3. `docs/project-control-workflows.md`：用户可验收的登录、权限、生成 PPT、美化 PPT 和导出流程。
4. `README.md`：产品概览、本地启动、外部服务配置和验证命令。

当前任务涉及特定模块时，再继续读：

- 生成 PPT：`skills/README.md`、`skills/deck-generation/`、`scripts/README.md`
- 员工工作台 UI：`components/README.md`，再读 `components/employee-app.tsx`
- 后台执行与启动：`scripts/README.md`
- 历史与维护审计：先读 `docs/README.md`，不要把归档方案当成当前方案

## 当前系统骨架

- `app/`：Next.js 页面和服务端接口。
- `components/employee-app.tsx`：员工工作台主界面和智能模式交互。
- `app/employee/employee.css`：员工工作台石墨黑视觉主题。
- `lib/employee-auth.ts`：员工会话、学校隔离、角色和功能权限。
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

## 新模型接手后的第一条回复

先向项目 owner 汇报：当前目标和用户流程；预计读取、修改和明确不会修改的文件；验证方式；是否会调用收费的外部服务。确认理解没有偏差后再修改。

## 常用验证

```powershell
npx tsc --noEmit
npm run lint
npm run build -- --webpack
```

视觉或交互改动还应按模块运行现有视觉测试，并检查桌面与手机布局。外部 AI、Codia、微信和 ONLYOFFICE 的失败要区分代码、配置、网络和额度问题，不能用假成功掩盖。

## 当前优先原则

- 生成 PPT 和美化 PPT 都遵循：填写要求 → 生成方案 → 用户确认 → 生成预览 → 单页返工 → 最终导出。
- 高级版生成 PPT 必须保留资料来源位置，用户可规定大标题、小标题和每页内容。
- 文字分析使用 `AI_TEXT_API_KEY`，图片生成使用 `AI_IMAGE_API_KEY`，两把密钥不得混用。
- Codia 转换前保留可独立下载的图组和 PDF；Codia 不可用也不能丢失已确认预览。
