# WZLCF 话题记忆 3：员工 AI、素材库、OpenAI 与 PPT 插图

## 本轮主要目标

本轮围绕员工工作台右侧 AI、图片生成、素材库、以及素材拖入 ONLYOFFICE PPT 的体验升级展开。

核心方向：

- 右侧 AI 不再是 Seedream，改为员工独立 AI 助手。
- 文本模型支持 DeepSeek、Doubao、OpenAI。
- 图片生成只保留 OpenAI。
- 每个员工的 AI 对话和个人素材库互相隔离。
- 底部素材库默认显示“我的素材库”，另有订单级“大素材库”。
- 希望素材/AI 图片/本地图片可以拖到 PPT 中使用。

## AI 模型与密钥

文本模型：

- 默认：`deepseek-v4-pro-260425`
- 可选：
  - `deepseek-v4-pro-260425`
  - `doubao-seed-2-0-pro-260215`
  - OpenAI 文本模型

Doubao 和 DeepSeek 共用火山方舟接口：

- endpoint：`https://ark.cn-beijing.volces.com/api/v3/responses`
- env：`ARK_API_KEY`

OpenAI 单独使用：

- `OPENAI_API_KEY`
- `OPENAI_TEXT_MODEL`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_PROXY_URL`

不要在回复或日志里暴露完整 API key。

## OpenAI 问题与修复

一开始 OpenAI 文本和图片都失败，表现为“发送了又退回来”或 `fetch failed`。

定位结果：

- Doubao/DeepSeek 走方舟，网络正常。
- OpenAI 需要走本地代理。
- 不能依赖 Next 启动时是否读到代理变量，改成 OpenAI 请求运行时显式使用代理。

已做方向：

- OpenAI 文本已能正常回复。
- OpenAI 图片生成改成异步任务，避免前端长连接 90-180 秒超时。
- 生图任务会创建 `GenerationJob`，后台处理，前端轮询状态。

## 员工独立 AI 与上下文

已设计/实现方向：

- `AiConversation` 按 `serviceId + employeeId` 隔离。
- `AiMessage` 保存员工自己的 AI 对话、模型、供应商等。
- 同一订单里员工 A/B 互相看不到对方 AI 对话。
- 切换模型后仍读取当前员工自己的历史上下文。

UI 方向：

- 右侧 AI 面板分为：
  - 文本助手
  - OpenAI 图片
- 删除 Seedream 文案。
- 文本和图片生成时输入框内容保留。
- 生成中要有状态卡/动效，不要像提示词被吞掉。
- 对话和图片记录默认滚动到最新位置。
- 图片点击打开小窗预览，不再打开新标签页。

## 素材库设计

底部素材库分两层：

### 我的素材库

- 默认显示当前员工自己的素材。
- 员工之间个人素材库隔离。
- 支持本地图片多选导入。
- 支持拖入本地多张图片。
- 支持分页。
- 页码语义最终定为：
  - 第 1 页是旧素材。
  - 最后一页是最新素材。
  - 默认打开最后一页，例如 `第 8 / 8 页`。
- 曾修复过翻页点不动问题：原因是内部页码用了 `Number.MAX_SAFE_INTEGER` 代表最后页，点击上一页只是巨大数字减 1，显示仍被 clamp 成最后页。修复为按钮基于当前 `safePage` 翻页。

### 订单素材总库

- 点击“素材总库”打开大面板。
- 可查看同一订单所有员工收录的素材。
- 图片卡片显示员工名字。
- 可把别人的素材“加入我的素材库”，不改变对方素材库。

## 拖拽体验

用户期望：

- AI 图片拖到底部素材库时是复制，AI 原记录不消失。
- 素材库图片拖到 PPT 时是复制，素材库原图不消失。
- 本地图片拖到素材库或 PPT 时，原本地文件不变。
- 有蓝色拖拽提示。

已做过的拖拽稳定性修复：

- 图片缩略图设置 `draggable={false}`，避免浏览器原生图片拖拽绕过自定义 payload。
- 素材卡用 `onDragStartCapture` 写入自定义拖拽数据。
- 拖拽 payload 使用 `application/x-wzlcf-image` 等内部数据。

## ONLYOFFICE 插件桥接尝试

最初计划是通过 ONLYOFFICE 插件桥接实现图片插入当前幻灯片。

做过的尝试：

- 新增桥接队列：
  - `lib/onlyoffice-image-bridge.ts`
  - `/api/employee/onlyoffice/image-bridge`
  - `/api/employee/onlyoffice/image-bridge/images/[id]`
  - `/api/employee/onlyoffice/image-bridge/plugin-config`
- 插件文件：
  - `public/onlyoffice-plugins/wzlcf-image-bridge/index.html`
  - `public/onlyoffice-plugins/wzlcf-image-bridge/config.json`
- 插件尝试用 `Asc.plugin.callCommand`、`Api.CreateImage`、`slide.AddObject` 插入图片。
- 发现 `8080` 端口在 Windows 上实际打开的是 CEF remote debugging，不是 DocumentServer。
- 将 ONLYOFFICE 端口改为 `18080`：
  - `docker-compose.onlyoffice.yml` 端口改为 `18080:80`
  - `.env` 增加 `ONLYOFFICE_URL=http://127.0.0.1:18080`
- 重建了 `wzlcf-onlyoffice` 容器。
- 验证过：
  - `http://127.0.0.1:18080/web-apps/apps/api/documents/api.js` 可访问。
  - `http://127.0.0.1:18080/sdkjs-plugins/v1/plugins.js` 可访问。
- 也尝试过把插件挂进容器内部：
  - 挂载到 `/var/www/onlyoffice/documentserver/sdkjs-plugins/wzlcf-image-bridge`
  - 插件 index/config 都能 200。

最终问题：

- 插件仍然未响应，用户持续看到：
  `ONLYOFFICE 图片桥接插件未响应，请刷新编辑器后再试`
- 推测 ONLYOFFICE 当前插件加载机制或插件自动启动仍不稳定。
- 用户明确表示“不行，进行下一步计划”。

## 当前最终方案：服务端直接写 PPTX

为绕开 ONLYOFFICE 插件不响应，已切换到“不依赖插件”的兜底方案：

拖图到 PPT 区域时：

1. 父页面接住拖拽图片。
2. 调用新接口：
   `/api/employee/work-documents/[id]/insert-image`
3. 服务端直接修改当前 `.pptx` 文件。
4. 把图片写进 PPT 包：
   - `ppt/media/...`
   - slide rels
   - slide XML 中追加 `p:pic`
5. 更新 `WorkDocument.storedName` 和 `documentKey`。
6. 前端销毁并重新初始化 ONLYOFFICE，让编辑器加载新 PPT。

新增文件：

- `lib/pptx-image-insert.ts`
- `app/api/employee/work-documents/[id]/insert-image/route.ts`

前端改动：

- `components/employee-app.tsx`
- 拖图片到 PPT 时调用 `/insert-image`。
- 成功后：
  - `editorRef.current?.destroyEditor?.()`
  - `refresh(true)`
  - `setReloadKey(value => value + 1)`
- 提示改为：
  - “松开后写入 PPT 第 1 页”
  - “正在写入 PPT 文件并刷新编辑器...”

当前限制：

- 服务端写入方案目前固定写入 PPT 第 1 页。
- 位置按拖拽点换算到幻灯片坐标，但页码固定第 1 页。
- 这是为了先保证“图片能进 PPT”。
- 后续可扩展为：
  - 选择插入第几页。
  - 根据当前 ONLYOFFICE 缩略图选中页推断页码。
  - 或在父页面提供页码输入/选择器。

## 验证命令

本轮多次验证通过：

```powershell
npm run lint
npx tsc --noEmit
npm run build -- --webpack
```

服务端写 PPTX 方案最后也已通过：

- `npm run lint`
- `npm run build -- --webpack`

## 本地运行提醒

当前 ONLYOFFICE 应使用：

```env
ONLYOFFICE_URL=http://127.0.0.1:18080
```

Docker compose 已改为：

```yaml
ports:
  - "18080:80"
```

如果 ONLYOFFICE 不通：

```powershell
docker compose -f docker-compose.onlyoffice.yml up -d --force-recreate
```

然后重启 Next：

```powershell
npm run dev
```

## 用户偏好与交互要求

- 用户希望功能“能用、流畅、看得懂”，不喜欢反复失败的隐式状态。
- 出错时要给明确原因，而不是只提示失败。
- 右侧 AI 字体、素材库字体要比最初更大、更舒服，但不能挤爆 450px 面板。
- 用户准备开启新话题，新话题应优先读 `AGENTS3.md` 接续上下文。

