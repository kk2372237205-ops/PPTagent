# components 目录说明

这个目录放前端入口与员工端拆出来的各个模块。

## 顶层入口

- `client-app.tsx`
  - 客户端网站主界面。
  - 包含登录后的客户侧服务介绍、咨询、交付、资产等页面。

- `employee-app.tsx`
  - 员工工作台的**外壳**。
  - 2026-09-14 已完成拆分：从 3753 行降到 400 行出头，只剩骨架、常量和少量尚未迁出的动作。
  - 具体业务面板都在 `components/employee/` 下，见该目录的 `README.md`。

## 拆分现状（2026-09-14）

```
components/
├── client-app.tsx          客户端全站
├── employee-app.tsx        员工工作台外壳（壳 + DesignStudio + 常量）
└── employee/               31 个模块，逐个可独立修改
    ├── README.md           ← 模块索引，改代码前先看这里
    ├── employee-login.tsx  登录页与手机端阻断
    ├── workbench-chrome.tsx 订单/消息/团队/设置
    ├── employee-admin.tsx  管理控制台
    ├── onlyoffice-editor.tsx
    ├── ai-assistant-panel.tsx 生图 / AI 创作助手（2026-09-26 从 tools-ai-panels.tsx 拆出）
    ├── image-tools-panel.tsx  图片工具（抠图 / 图片转 PPT / 提取图片）
    ├── tools-ai-shared.ts     上面两个面板共用的小工具
    ├── material-rail.tsx / ppt-paste-tray.tsx
    ├── deck-*.tsx          生成 PPT 表单与运行面板
    ├── polish-*.tsx        美化 PPT 表单与运行面板
    ├── design-run-panel.tsx 单页设计运行面板
    └── explode-*.tsx       图片炸开页面与预览
```

主干逻辑（接口、类型、权限、智能模式状态）在 `lib/`，不在这个目录。

## 维护原则

- **不要整文件替换**任何组件文件；按行范围改。
- 修改前先读目标文件顶部的「职责 / 谁可以改 / 依赖 / 被谁用 / 验证方式」注释。
- 需要接口调用走 `lib/employee-api.ts`，不要在组件里手写 `fetch("/api/...")`。
- 需要共享类型从 `lib/employee-api-types.ts` 取，不要 import `employee-app.tsx`。
- 单次只改一个模块，改完跑 `npm run verify`（会拦住新增的 lint 警告）。
- 拆分已经做过，**不要再往 `employee-app.tsx` 里加新功能**。
