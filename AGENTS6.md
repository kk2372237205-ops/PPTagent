# WZLCF 智能体与图片炸开阶段记忆

本文件记录当前话题中围绕“PPT 智能美化智能体、OpenAI 生图、SAM3 拆图、可编辑 PPT 重建”的关键上下文。用于新话题继续开发时快速恢复记忆。

## 当前总体目标

项目从最初的 PPT 代做服务网站，已经扩展出员工端工作台与智能美化智能体。当前最重要的产品目标是：

- 员工输入一页 PPT 或一段完整设计需求。
- 智能体先生成高质量 16:9 PPT 样片 PNG。
- 再把样片拆成可复用、可移动、可缩放、可删除的 PPT 零部件。
- 最终导入 ONLYOFFICE，成为一张尽可能可编辑的新 PPT 页面。

用户的核心诉求不是“生成一张图片”，而是“像专业 PPT 设计软件一样，把好看的样片变成可实际交付、可继续编辑的 PPT 页面”。

## 用户对智能体的期望

用户明确认为：

- 智能体必须尽量自动，不能让员工每一步都手工点。
- 能减少人工就减少人工。
- 员工最终确认可以保留，但智能体应该自动完成大部分判断、生成、拆图、重建。
- 不能把多个模型胡乱串起来就假装智能。
- 最终结果要看起来专业、高级、能交付，而不是“AI 滚雪球越滚问题越多”。

用户目前最不满意的地方：

- OpenAI / ChatGPT 网页端直出 PNG 很好看，但项目 API 链路生成出来经常变丑。
- 拆图后部件东一块西一块，文字、特效和背景容易混乱。
- 有时系统额外生成了丑陋文字、卡片、排版，破坏 ChatGPT 原始审美。
- 背景清理和部件拆分仍然不够稳定。
- 项目文件逐渐变多，用户担心工作流混乱、垃圾文件过多、失控。

## 重要结论：生成质量问题不主要是 OpenAI 本身

用户多次对比：

- 直接在 ChatGPT 里用完整提示词生成的 PPT 封面 PNG，效果明显更好。
- 项目智能体用同样提示词生成的结果较差。

当前判断：

- OpenAI 生图能力本身是强的。
- 项目里此前的“DeepSeek 规划 → 系统拆提示词 → 背景/主视觉/模板合成 → 审美评分重试”的流程，反而破坏了完整提示词的整体审美。
- 豆包、DeepSeek 不应该重新设计版式或强行改写用户提示词。
- 它们更适合做结构化理解、图层识别、坐标/语义标注，而不是替代 OpenAI 做设计审美决策。

## 当前推荐的新生成工作流

新的方向是“以 ChatGPT 整页样片为真值的可编辑 PPT 重建”。

核心链路：

1. `Master Render`
   - OpenAI 直接根据员工完整提示词生成一张完整 PPT 样片 PNG。
   - 样片只作为预览、拆解来源和 QA 对照。
   - 不直接作为最终 PPT 背景。

2. `Clean Background`
   - OpenAI 基于同一风格再次生成干净背景。
   - 要求无主体、无文字、无 Logo、无信息卡，只保留统一风格背景。
   - 避免从原图硬抠背景造成残影。

3. `LayerPlan`
   - 豆包 / DeepSeek 只识别样片里的图层语义和坐标。
   - 不重新设计版式，不生成新文案，不额外添加丑文字。

4. `Semantic Cutout`
   - 使用 SAM3 从 Master Render 拆出机器人、标题字效、Logo 位、卡片、装饰、辅助信息等透明 PNG 部件。
   - OpenCV / GrabCut 只作为兜底，不再当主力。

5. `Rebuild`
   - 底层放 Clean Background。
   - 上层按原坐标放拆出的透明 PNG 部件。
   - 普通小字可选 OCR 成文本层，但默认不覆盖原字效。

6. `QA`
   - 对比 Master Render 与重建预览。
   - 检测残影、缺块、错位、白边、文字重复。
   - QA 不通过时不推荐导入。

7. `PPT Write`
   - 创建版本快照。
   - 新增一页，不覆盖原页。
   - 写入干净背景、透明部件和员工选择的文本层。
   - 写入后自动打开新增页。

## 文字策略

用户已明确：

- ChatGPT 样片里有什么文字，就拆什么文字。
- 不需要系统再额外生成丑陋文字。
- 艺术字、发光字、描边字、立体字、标题字效默认作为透明 PNG 保留。
- 普通小字可以 OCR 成可编辑文本层，但必须可选，不能默认造成重影。
- 选择“原字效果 PNG”时，应自动关闭关联 OCR 文本。
- 选择“无字框 + 可编辑文字”时，才写入原生 PPT 文本。

因此当前文字层策略：

- 标题大字默认 `artwork_png`。
- 普通信息文字可标记为 `ocr_optional`。
- 复杂艺术字不强行转原生文本。
- 不再由 DeepSeek 或前端生成“文字”“PPT 主标题名称”“XXX”之外的任何额外文案。

## 图片炸开当前能力边界

当前所谓“可编辑”默认指：

- 背景是单独一层图片。
- 机器人、人物、列车、城市、装饰框等复杂视觉是独立透明 PNG 图片对象。
- 普通文字可以是原生 PPT 文本框。
- 色块、卡片、线条未来可逐步做成原生形状。

暂不承诺：

- 把机器人每个机械臂、车轮、螺丝全部拆成矢量路径。
- 把复杂渐变艺术字 100% 还原成原生 PPT 字体。
- 完美恢复所有半透明光效。

用户可以接受复杂视觉作为透明 PNG，但不能接受：

- 部件残缺。
- 背景有重影。
- 文字重复。
- 系统额外加奇怪内容。
- 原本好看的整页被拆坏。

## SAM3 当前状态

用户已下载 SAM3 到：

```text
C:\Users\23722\Desktop\SAM3Project\facebook_sam3
```

权重路径：

```text
C:\Users\23722\Desktop\SAM3Project\facebook_sam3\sam3.pt
```

项目 `.env` 已配置：

```text
COMPONENT_EXTRACTOR_BACKEND="sam3"
COMPONENT_EXTRACTOR_DEVICE="auto"
SAM3_CHECKPOINT="C:\\Users\\23722\\Desktop\\SAM3Project\\facebook_sam3\\sam3.pt"
SAM3_LOAD_FROM_HF="0"
COMPONENT_EXTRACTOR_SAM3_CONFIDENCE="0.35"
COMPONENT_EXTRACTOR_SAM3_USE_TEXT="0"
```

注意：不要在回复中打印完整 `.env` 或密钥。

项目实际使用的 SAM3 Python 是：

```text
C:\Users\23722\Desktop\PPTagent\.venv-sam3\Scripts\python.exe
```

不是用户在 `SAM3Project` 目录直接运行的系统 Python。

最近确认结果：

```text
GPU ready: NVIDIA GeForce RTX 4070 Laptop GPU · PyTorch 2.12.1+cu126 · CUDA 12.6
SAM3 model load ready: Sam3Image on cuda
```

说明项目 SAM3 当前可以跑在 RTX 4070 Laptop GPU 上，不是 CPU 硬跑。

已修复：

- `scripts/check-sam3.mjs` 现在会读取 `.env.local` 和 `.env`。
- 以后直接运行：

```powershell
npm run components:sam3:load-check
```

看到 `Sam3Image on cuda` 即表示 GPU 生效。

## SAM3 / 拆图已有修改

相关文件：

- `scripts/component-extractor.mjs`
- `scripts/component-extractor.py`
- `scripts/image-explode-worker.mjs`
- `scripts/check-sam3.mjs`

已做过的重要调整：

- `component-extractor.mjs` 优先使用 `.venv-sam3`。
- `component-extractor.py` 已恢复真实 SAM3 mask 执行路径。
- 使用 `torch.inference_mode()` 和 CUDA bfloat16 autocast，修复 dtype 报错。
- health 状态允许 `sam3-configured`。
- 取消过度过滤：
  - `low_quality_mask` 不再直接取消候选，只标记 `needs-review`。
  - fallback 本地 mask 标记为 `sam3-fallback-local-mask-needs-review`。
- `cleanup_alpha()` 放宽连通域保留数量，避免标题、机器人、列车线条被切碎。
- 为重要部件增加 “整块保真备选”：
  - `subject`
  - `vehicle`
  - `product`
  - `person`
  - `robot`
  - `title-art`
  - `wordart`
  - `card`
  - `panel`
  - `frame`
- 这些备选是 source-crop，保真但不透明，默认不选，只用于兜底。

## Grounded SAM 2 状态

之前尝试过 Grounded-SAM2 / SAM2 作为替代方案。

当前方向：

- SAM3 已能加载并跑 CUDA，因此主线先用 SAM3。
- Grounded-SAM2 / SAM2 不应再作为默认主力。
- OpenCV / GrabCut 只作兜底。
- 不要在 UI 文案里继续误导显示“等待 Grounded-SAM2/SAM2 拆图”，应改成“SAM3 / 本地拆图服务”。

如果后续发现仍有旧文案，可搜索并替换：

```powershell
rg "Grounded-SAM2|SAM2" components scripts app
```

## 智能体里已隐藏 / 简化的东西

用户认为部分智能体功能越做越乱，已倾向先减少干扰。

已做过：

- 员工端 UI 里移除或隐藏质量模式选择。
- `createRun()` 默认发送 `qualityMode: "standard"`。
- 后端强制 `qualityMode = "standard"`。
- `generationBudget` 固定为 `2`。
- 旧审美重试分支保留为 legacy/rollback，但当前主流程不应依赖它。

原因：

- 早期机器审美和多轮修正容易把 OpenAI 好结果改坏。
- 当前更优先保留完整提示词和 OpenAI 整页审美。

## 关于“机器审美”的复审结论

之前写过资深工程复审：

- 不要把多个模型串起来误当成智能体真的会思考。
- 不要把 SSIM 像不像误当成设计好不好。
- 不要在没有离线评估集、成本控制和灰度策略前，让它自动修改真实 PPT。

更成熟方向：

- 固定确定性工作流。
- 模型只在受 JSON Schema 约束的节点输出：
  - 设计意图
  - LayoutPlan
  - 图层计划
  - 候选评分
  - 修正建议
- 机器审美分层评估：
  - 需求适配
  - 版式质量
  - 品牌一致性
  - 交付可编辑性
  - 视觉保真度
- 审美评估只能辅助，不应自动把好图改坏。

当前阶段建议：

- 先稳定 “OpenAI 整页样片 → SAM3 拆图 → Clean Background → 重建 QA”。
- 暂缓复杂审美重试。

## 用户最近要求的文档

已创建：

```text
C:\Users\23722\Desktop\PPTagent\0626.md
```

该文件详细列举了当前项目文件、模块职责、智能体工作流、哪些文件建议保留/隐藏/归档、为什么项目显得庞大。

如果新话题需要恢复对项目结构的掌控，先阅读：

```text
0626.md
```

## 当前项目运行相关

本地开发入口：

```powershell
npm run dev
```

它会启动：

- ONLYOFFICE
- Next.js
- design-agent worker
- component-extractor service
- image-explode worker

如果怀疑 SAM3 是否跑 GPU：

```powershell
npm run components:sam3:load-check
```

如果看到：

```text
Sam3Image on cuda
```

则表示 GPU 生效。

## 最近验证通过的命令

最近曾通过：

```powershell
npm run lint
npx tsc --noEmit
node --check scripts\image-explode-worker.mjs
node --check scripts\design-agent-worker.mjs
node --check scripts\component-extractor.mjs
node --check scripts\check-sam3.mjs
```

在后续修改后仍应重新验证。

## 重要协作约束

继续遵守项目根记忆：

- 禁止批量删除文件或目录。
- 不使用：
  - `del /s`
  - `rd /s`
  - `rmdir /s`
  - `Remove-Item -Recurse`
  - `rm -rf`
- 删除文件时只能一次删除一个明确路径。
- 如果需要批量清理，必须停下来让用户确认或手动删除。

用户目前对“清理无用模块”有需求，但尚未授权批量删除。应先文档化、隐藏、归档建议，不要直接删。

## 下一步优先级建议

如果新话题继续开发，建议优先做：

1. 建立“拆图调试面板”
   - 展示完整样片、干净背景、重建预览。
   - 展示每个候选部件的：
     - semanticId
     - label
     - variant
     - extractMode
     - maskQuality
     - recommended
     - 是否 SAM3 / fallback
   - 让用户明确知道是哪一步把图拆坏。

2. 修正旧 UI 文案
   - 把 Grounded-SAM2/SAM2 文案改成 SAM3 / 本地拆图服务。

3. 拆分巨大的 `components/employee-app.tsx`
   - 至少拆出：
     - `DesignStudio`
     - `ImageExplodeStudio`
     - `Workspace`
     - `MaterialLibrary`
   - 降低维护难度。

4. 继续调 SAM3 组件识别策略
   - 不要默认选中整组和组内子部件。
   - 标题艺术字保持整块。
   - 城市/机器人/列车/卡片尽量使用语义整体。
   - 背景优先用 Clean Background，而不是本地硬抠。

5. 确认最终写入 PPT 的策略
   - 完整样片只用于预览和 QA，不作为最终 PPT 背景。
   - 最终 PPT 底图必须是 Clean Background。
   - 上层必须是从 Master Render 拆出的部件。

## 当前心智模型

正确的产品路线不是：

```text
需求 → 多模型自由发挥 → 系统拼图 → 随机审美修正 → PPT
```

而应是：

```text
需求 → OpenAI 整页样片 → 干净背景 → SAM3 语义拆图 → 重建预览 → QA → 员工确认 → PPT
```

也就是说：

- OpenAI 负责整体审美和完整样片。
- SAM3 负责高质量蒙版。
- 豆包/DeepSeek 负责理解、标注、坐标和约束，不负责随便改设计。
- 系统负责确定性编排、记录、回退、版本快照和 QA。

