# components 目录说明

这个目录目前只有两个主要前端入口：

- `client-app.tsx`
  - 客户端网站主界面。
  - 包含登录后的客户侧服务介绍、咨询、交付、资产等页面。

- `employee-app.tsx`
  - 员工工作台主界面。
  - 包含 ONLYOFFICE 工作台、素材库、AI 助手、图片工具、智能模式、生成 PPT、生图等功能。

## 维护原则

- 不要整文件替换 `employee-app.tsx`。
- 修改员工工作台时，优先定位到具体组件函数，例如 `DesignStudio`、`SmartStudio`、`DeckInlineRun`。
- 单次只改一个小功能，并运行 `npx tsc --noEmit`。
- 如果未来拆分文件，先拆纯 UI 组件，不同时改状态逻辑和样式。

