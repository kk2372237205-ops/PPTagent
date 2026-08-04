# scripts 目录说明

这个目录包含开发启动脚本、后台执行脚本和图片工具脚本。代码里常用 `worker` 命名，本项目文档里优先称为“后台执行脚本”。

## 启动脚本

- `dev.mjs`
  - 完整开发模式。
  - 会检查 ONLYOFFICE，初始化数据库，启动 Next、设计/生图后台执行脚本、生成 PPT 后台执行脚本、美化 PPT 后台执行脚本、组件拆图服务和图片炸开后台执行脚本。

- `dev-lite.mjs`
  - 轻量开发模式。
  - 只启动 Next、设计/生图后台执行脚本、生成 PPT 后台执行脚本和美化 PPT 后台执行脚本。
  - 适合日常调智能模式，不替代完整 `npm run dev`。

- `agent-workers.mjs`
  - 单独启动后台执行脚本组合。

以上三个入口共用 `process-group.mjs` 管理子进程。在 Windows 终端按
`Ctrl+C` 时，会关闭整组 Next/后台执行脚本并等待退出，避免第二次启动
仍被 `.next-dev/dev/lock` 拦截。

## 当前核心后台执行脚本

- `deck-generation-worker.mjs`
  - 生成 PPT 核心链路。
  - 负责方案规划、图组导演层、逐页生图、PDF 合成、Codia 转 PPT。

- `deck-source-parser.mjs`
  - 生成 PPT 的资料读取脚本。
  - 按页、幻灯片、工作表或文本行解析 PDF、Word、Excel、PPTX 和文本资料，为快速版与高级版保留可追溯来源。

- `ppt-polish-worker.mjs`
  - 美化 PPT 核心链路。
  - 负责确认方案后逐页生成 16:9 美化预览图，并配合最终转 PDF/PPT。

- `design-agent-worker.mjs`
  - 单页智能生图和旧智能设计链路。

- `image-explode-worker.mjs`
  - 图片炸开相关任务。

- `ai-service-client.mjs`
  - 后台执行脚本共用的 YZStudio 文字/生图中转调用层。
  - 分别读取 `AI_TEXT_*` 与 `AI_IMAGE_*`，避免两把 Key、模型和超时配置互相串用。
  - 默认直接连接中转站；只有对应的 `AI_TEXT_PROXY_URL` 或 `AI_IMAGE_PROXY_URL` 非空时才额外走本地代理。

## 可选本地工具

- `component-extractor.mjs`
- `component-extractor.py`
- `setup-sam3-weights.mjs`
- `setup-grounded-sam2.mjs`
- `check-sam3.mjs`
- `check-grounded-sam2.mjs`

这些主要服务图片拆解/抠图能力。只做生成 PPT 或生图时，不一定需要启动。

## 开发端口选择

- `scripts/dev-port.mjs` 是 `npm run dev` 与 `npm run dev:lite` 共用的开发端口选择器。
- 它会先尝试用户指定端口和常用端口，再尝试 `3200–3249`、`4200–4249`；如果 Docker/Hyper-V 把这些端口也保留，最后让 Windows 自动分配可监听端口。
- 启动时以终端打印的 `http://localhost:端口` 为准，不应假定永远是 `3000`。