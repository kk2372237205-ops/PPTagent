# scripts 目录说明

这个目录包含开发启动脚本、worker 和图片工具脚本。

## 启动脚本

- `dev.mjs`
  - 完整开发模式。
  - 会检查 ONLYOFFICE，初始化数据库，启动 Next、设计 worker、生成 PPT worker、组件拆图服务和图片炸开 worker。

- `dev-lite.mjs`
  - 轻量开发模式。
  - 只启动 Next、设计 worker 和生成 PPT worker。
  - 适合日常调智能模式，不替代完整 `npm run dev`。

- `agent-workers.mjs`
  - 单独启动 worker 组合。

## 当前核心 worker

- `deck-generation-worker.mjs`
  - 生成 PPT 核心链路。
  - 负责方案规划、图组导演层、逐页生图、PDF 合成、Codia 转 PPT。

- `design-agent-worker.mjs`
  - 单页智能生图和旧智能设计链路。

- `image-explode-worker.mjs`
  - 图片炸开相关任务。

## 可选本地工具

- `component-extractor.mjs`
- `component-extractor.py`
- `setup-sam3-weights.mjs`
- `setup-grounded-sam2.mjs`
- `check-sam3.mjs`
- `check-grounded-sam2.mjs`

这些主要服务图片拆解/抠图能力。只做生成 PPT 或生图时，不一定需要启动。

