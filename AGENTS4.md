# WZLCF 话题记忆 4：PPT 素材回流、图片工具面板、佐糖抠图与 PPT 提取

## 本轮主要目标

本轮围绕员工工作台底部素材库、ONLYOFFICE PPT 图片复用、佐糖抠图工具、以及 PPT 内图片回流到素材库展开。

核心方向：

- 不再引导用户把素材图片拖到 ONLYOFFICE 编辑器区域。
- 底部素材库旁保留 `PPT 粘贴托盘`，用于尝试无刷新粘贴图片。
- 新增可上拉的 `图片工具` 面板，与素材库同时工作。
- 图片工具第一版接入佐糖智能抠图。
- 新增 `PPT 提取`，可以从当前工作 PPTX 里提取图片，并存入素材库或再送去佐糖抠图。

## 当前重要结论

### 浏览器剪贴板方案限制

用户测试发现：

- 从 Windows 文件夹复制图片，再到 ONLYOFFICE 里 `Ctrl+V` 可以正常粘贴。
- 但从网页素材库复制/托盘复制，ONLYOFFICE 可能只粘贴出一个空图片框。

已尝试：

- `navigator.clipboard.write` 写入 `image/png`。
- 同时写入 `text/html`，使用 `data:image/png;base64`。
- 如果原生剪贴板不可用，降级到隐藏可编辑区域 `document.execCommand("copy")` 复制 HTML 图片。

现状：

- 这条路仍受浏览器和 ONLYOFFICE 剪贴板格式限制。
- 如果继续空框，说明 ONLYOFFICE 更依赖系统文件剪贴板格式，网页无法可靠伪造。
- 因此后续更稳定方向是服务端解析/生成文件，或继续探索 ONLYOFFICE 官方插件/API。

### 移除错误拖拽引导

用户指出 ONLYOFFICE 编辑区的大范围拖拽吸附提示会误导使用者。

已修改：

- 删除图片拖过 ONLYOFFICE 编辑区时出现的整屏蓝色遮罩。
- 删除透明捕获层 `office-image-drop-catcher`。
- 图片拖过编辑器区域时不再提示、不再拦截。
- 只有拖入真正的 `.ppt/.pptx` 文件时，才显示“松开即可载入 PPT”。

涉及文件：

- `components/employee-app.tsx`
- `app/employee/employee.css`

## 图片工具面板

新增可上拉的 `图片工具` 面板：

- 面板位于底部素材库上方。
- 点击 `图片工具 / 收起图片工具` 把手展开或收起。
- 与底部素材库、PPT 粘贴托盘同时存在。
- 拖入工具面板的事件会 `stopPropagation`，避免误触发底部素材库导入。
- 面板整体已上移，避免底部文字和按钮被素材栏遮挡。

目前左侧工具列表：

- `智能抠图`
- `PPT 提取`

## 佐糖智能抠图

第一版只接入佐糖抠图，不接其它佐糖工具。

后端接口：

```text
POST /api/employee/services/[id]/image-tools/segmentation
```

调用佐糖：

```text
POST https://techsz.aoscdn.com/api/tasks/visual/segmentation
GET  https://techsz.aoscdn.com/api/tasks/visual/segmentation/{task_id}
```

认证：

```text
X-API-KEY: process.env.TECHSZ_API_KEY
```

Key 配置位置：

```env
TECHSZ_API_KEY="你的佐糖API_KEY"
```

填写到：

```text
C:\Users\23722\Desktop\PPTagent\.env
```

并已在 `.env.example` 增加：

```env
TECHSZ_API_KEY=""
```

实现逻辑：

- 支持传 `imageId`，从现有素材库读取图片。
- 支持本地图片文件上传。
- 服务端优先用佐糖 `Image File` 模式，因为本机 `localhost` 图片 URL 外部服务访问不到。
- 当前默认上传字段名是 `image_file`。
- 如果佐糖返回参数错误或未返回任务编号，优先检查实际文档中的 Image File 字段名是否不同。
- 创建任务后轮询，默认 1 秒一次，最多 30 秒。
- 成功后把结果保存到 `imageRoot`。
- 创建 `GenerationJob(provider="techsz", model="visual/segmentation")` 和 `GeneratedImage`。
- 结果默认只显示在工具面板，点击 `存入素材库` 才进入当前员工的“我的素材库”。

重要提醒：

- `PPT 提取` 不消耗佐糖额度。
- 只有点击 `佐糖抠图` 或在 `智能抠图` 中拖图处理时，才会调用佐糖 API 并消耗额度。

涉及文件：

- `app/api/employee/services/[id]/image-tools/segmentation/route.ts`
- `components/employee-app.tsx`
- `app/employee/employee.css`
- `.env.example`

## PPT 提取素材

用户需求：

- 在 ONLYOFFICE/PPT 中图片可以被裁剪。
- 希望把 PPT 里已经摆放/裁剪好的图片放回素材库。
- 再从素材库拖到图片工具面板继续佐糖抠图或其它处理。

实现方式：

- 不从 ONLYOFFICE iframe 里直接拖回网页。
- 走服务端解析当前工作 `.pptx`。
- 解析每页图片对象。
- 读取图片关系 `r:embed` 和 slide rels，定位 `ppt/media/...` 图片。
- 读取 PPT 裁剪参数 `a:srcRect`。
- 前端用 canvas 按 `a:srcRect` 生成裁剪后可见区域预览。
- 列表中每张图片可：
  - `存入素材库`
  - `佐糖抠图`

后端接口：

```text
GET /api/employee/work-documents/[id]/extract-images
```

返回：

- `images`
- `truncated`

每个图片包含：

- `slideNumber`
- `name`
- `extension`
- `contentType`
- `dataUrl`
- `crop`

前端行为：

- 切到 `PPT 提取` 时，如果还没有结果，会自动提取一次。
- 也可点击 `重新提取`。
- 提取结果区域已加纵向滚动条。
- 最多返回前 40 张，避免大 PPT 一次性塞爆页面。
- 提取完成后提示：`已提取 N 张 PPT 图片，提取不消耗佐糖额度。`

限制：

- 第一版支持 PPTX 内普通图片对象。
- 可按 `a:srcRect` 处理基础裁剪。
- 暂不支持复杂效果完全还原，例如阴影、蒙版、旋转、组合对象、透明渐变、形状裁剪等。
- 读取的是服务端当前保存的 PPTX；用户在 ONLYOFFICE 里刚裁剪完时，需要等自动保存后再点 `PPT 提取`。

涉及文件：

- `app/api/employee/work-documents/[id]/extract-images/route.ts`
- `components/employee-app.tsx`
- `app/employee/employee.css`

## 当前 UI 注意点

图片工具面板：

- 当前高度约 308px。
- 面板 bottom 已上移，避免底部内容被素材库遮挡。
- `PPT 提取` 网格有滚动条。
- `PPT 提取` 列表按钮文案已改成 `佐糖抠图`，避免用户误以为提取会自动消耗佐糖额度。

底部素材库：

- 仍然是“我的素材库”优先。
- 可导入本地图片。
- 可打开“素材总库”。
- 可拖图片到 `PPT 粘贴托盘`。
- 可拖图片到 `图片工具` 面板。

ONLYOFFICE 编辑区：

- 不再吸附图片拖拽。
- 不再显示“拖到下方 PPT 粘贴托盘”的整屏遮罩。
- 仍支持拖 `.ppt/.pptx` 载入工作文档。

## 验证命令

本轮多次验证通过：

```powershell
npm run lint
npx tsc --noEmit
npm run build -- --webpack
```

## 后续建议

可继续优化方向：

- 如果网页剪贴板仍粘贴空框，考虑放弃网页剪贴板路径，改成更明确的“下载临时文件/打开文件夹复制”或稳定插件方案。
- `PPT 提取` 可增加筛选：按页码、只看当前页、只看裁剪图片。
- `PPT 提取` 可增加批量存入素材库。
- 佐糖 API 可继续扩展其它功能，但必须先拿到完整 API 文档和字段名。
- 若想真实还原旋转/形状裁剪/组合对象，可能需要用 PPT 渲染截图或引入更强的 Office/PPT 渲染能力。

