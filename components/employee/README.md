# components/employee 模块索引

这个目录是从 `components/employee-app.tsx`（原 3753 行）拆出来的**树枝**。
每一块都可以单独派人修改，互不影响。

> 主干（不要随便动的）在 `lib/`：接口、类型、权限、智能模式 Hook。
> 详情见根目录 `AGENTS.md` 的「目录职责」。

## 面板与页面（可以直接派人改）

| 文件 | 职责 | 涉及的后端 |
| --- | --- | --- |
| `employee-login.tsx` | 微信/企业微信双扫码登录页 + 手机端阻断页 + 品牌标志 + 加载态 | `/api/employee/auth/*` |
| `workbench-chrome.tsx` | 待审批页、左侧导航、订单任务、客户消息、客户需求面板、团队协作、设置页 | `/api/employee/me` |
| `order-management-modal.tsx` | 平台管理员的新建、修改与删除订单确认窗口 | `/api/employee/admin/services/**` |
| `employee-admin.tsx` | 管理控制台：成员审批/停用、角色与逐项权限、学校筛选、使用统计 | `/api/employee/admin/*` |
| `onlyoffice-editor.tsx` | ONLYOFFICE 在线编辑器外壳，支持拖入 PPT/PPTX 替换当前文稿 | `/api/employee/work-documents/*` |
| `ai-assistant-panel.tsx` | **生图 / AI 创作助手**：订单级 AI 会话（文字助手）与生图、两条中转的健康检查、任务轮询、图片预览与存入素材库 | `/api/employee/services/[id]/ai`、`…/ai/chat`、`…/generate-images`、`/api/employee/generated-images/[id]` |
| `image-tools-panel.tsx` | **图片工具**：智能抠图（佐糖）、图片转 PPT（Codia）、从当前 PPT 提取图片 | `/api/employee/services/[id]/image-tools/segmentation`、`…/image-to-pptx`、`/api/employee/work-documents/[id]/extract-images` |
| `tools-ai-shared.ts` | 上面两个面板共用的小工具（只放真正共用的） | — |
| `material-rail.tsx` | 底部素材栏：个人素材分页、批量导入、订单素材总库 | `/api/employee/images` |
| `ppt-paste-tray.tsx` | PPT 粘贴托盘：把图片放进剪贴板，在 PPT 当前页 Ctrl+V 插图 | `/api/employee/images` |
| `deck-generation-form.tsx` | 生成 PPT 的创建表单（快速版/高级版、大纲、资料、配色、统一元素） | `/api/employee/services/[id]/deck-generation/runs/**` |
| `deck-run-panels.tsx` | 生成 PPT 的运行面板与高级版逐页复核、资料编辑、内联执行区 | `/api/employee/deck` |
| `deck-summary.tsx` | 资料读取报告 + 高级版逐页内容复核 | —（纯展示） |
| `polish-ppt-planner.tsx` | 美化 PPT 的方案表单（来源、风格、整套方向、逐页要求） | `/api/employee/services/[id]/ppt-polish/runs/**` |
| `polish-inline-run.tsx` | 美化 PPT 的运行面板：预览、单页返工、转 PPT / 下载 | `/api/employee/polish` |
| `design-run-panel.tsx` | 单页智能设计任务的运行面板（阶段事件流、成品/背景预览、重建提示） | 回调注入 |
| `explode-studio.tsx` | 图片炸开/组件拆图页面（**当前入口被停用，后端在线**） | `/api/employee/services/[id]/image-explode/runs/**`（入口停用） |
| `image-preview-modal.tsx` | AI 图片放大预览弹窗 | — |
| `explode-image-preview.tsx` | 拆图重建结果大图预览弹窗 | — |

## 只放类型的文件

| 文件 | 内容 |
| --- | --- |
| `admin-types.ts` | 管理控制台读取的学校/成员/统计结构 |
| `polish-types.ts` | 美化任务的 slide / run / 页级要求结构 |
| `tools-ai-types.ts` | 图片工具来源、图片转 PPT 结果、PPT 提取图片结构 |
| `employee-login-types.ts` | 登录方式与登录配置结构 |

## 修改约定

1. 每个文件顶部都有「职责 / 谁可以改 / 依赖 / 被谁用 / 验证方式」，先读它。
2. 需要跨模块的请求走 `lib/employee-api.ts`，**不要在新代码里手写 `fetch("/api/...")`**。
3. 需要跨模块的类型从 `lib/employee-api-types.ts` 取，**不要 import `employee-app.tsx`**（会形成循环依赖）。
4. 用到 `<img>` 的文件沿用文件级 `eslint-disable @next/next/no-img-element`（与主文件一致）。
5. 改完必须跑 `npm run verify`；其中 `--max-warnings 0` 会拦住任何新增警告（2026-09-27 收紧，历史 11 条已清理）。
