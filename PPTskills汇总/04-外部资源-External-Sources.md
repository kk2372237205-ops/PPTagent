# 外部资源 · External Sources

> 本文件是"用生图模型生成整页 PPT 图片"这条路线上的**外部可复用资产清单**。
> 每一条都标注了**可信度**：✅ = 调研时实际抓取并读过原文；⚠️ = 只在搜索结果里出现，正文未读到；❌ = 没找到。
>
> **未验证的条目不要当成结论使用。** 本文件遵守这条纪律。

---

## 一、结论速览

1. **有两个完全对口的开源 skill 可以直接抄**（不是"用代码排版生成 PPTX"那条路线，而是和我们一样"生图出整页 + 组装"）：
   - `stevenjinlong/awesome-ppt-skills`：gpt-image-2 整页生图工作流 + **30 条主题风格提示词库** + 六段式逐页提示词模板
   - `jyoung105/future-slide-skill`：参考图抽 `DESIGN.md` → 出方案 → 写逐页提示词 → 逐页生图，Apache-2.0，**S01–S22 共 22 种版式**
2. **"插图太小"是提示词缺"画面占比"这个维度**，不是模型不会画。可靠来源全部使用**显式百分比**锁版面。（本结论与我们 `05-根因诊断` 的 RC-3/RC-12 完全一致，是独立验证。）
3. **"插图很假"是提示词只给了抽象形容词、没给承载内容的具体名词**。最强解药是 `xiaohuailabs/xiaohu-ip-studio` 的 `anti-ppt-qa.md` —— 一份逐条列出的"绝对不要"清单。
4. **版式库和风格库不用从零写**：`hugohe3/ppt-master` 有 **20 个风格段落，每段 95–100 词、可直接粘贴**；`VoltAgent/awesome-design-md` 有 73 份带 hex 与字体层级的品牌 DESIGN.md（MIT）。
5. **官方指南里最值钱的一条**（OpenAI cookbook）：要让图**不假**，必须**主动写真实瑕疵**，并**避免暗示影棚精修/摆拍的词**。这条直接解释了我们案例 B 里那 5 张"糊图缩略图"为什么假。

---

## 二、可复用资源清单

### ✅ 已实际抓取验证（高可信）

| 资源 | 链接 | 能给我们什么 | 怎么用 |
| --- | --- | --- | --- |
| **awesome-ppt-skills** | https://github.com/stevenjinlong/awesome-ppt-skills | 与本路线最对口的完整 skill；`references/image-prompting.md` 的**六段式逐页模板**（Exact text / Layout / Visual request / Typography / Style / Avoid）；`references/theme-style-prompt-library.md` 的 **30 条英文风格提示词** | 六段式直接当我们提示词骨架；30 条抽成 JSON 风格库 |
| **future-slide-skill** | https://github.com/jyoung105/future-slide-skill | 逐页提示词 **JSON schema**（含 `anti_patterns_to_avoid`、`imagery_rules`、`header/body/footer` 分区）；`templates/DESIGN_TEMPLATE.md` 风格卡模板；**S01–S22 版式命名**。Apache-2.0（fork：https://github.com/humantonylee/future-slide） | schema 是"方案 → 逐页提示词"最值得照抄的结构 |
| **codex-ppt-skill** | https://github.com/Ronnie2025/codex-ppt-skill | **中文场景经验最扎实**：逐页提示词结构、常用版式 13 种、**中文文字控制**、负向约束清单 | 负向段进基础提示词；中文错字策略（减字/放大/重抽）进验收流程 |
| **xiaohu-ip-studio** | https://github.com/xiaohuailabs/xiaohu-ip-studio | `references/anti-ppt-qa.md`：**最强反 AI 味防火墙**（逐条"绝对不要"）；"主体不超过画面约 60%"、"解释图角色占比 25–35% / 结构 65–75%" | "绝对不要"清单原样做成固定 negative block |
| **ppt-master** | https://github.com/hugohe3/ppt-master | MIT。`references/image-generator.md` 是最完整的生图提示词工程文档：**构图原语 A–E**、**20 个 rendering（每个一段 95–100 词可粘贴英文）**、11 个版式模板、§8 症状→病因→修法对照表 | rendering 是**"一段连贯散文而非 tag soup"**的正确写法范本；§8 做成返工诊断表 |
| **power-design** | https://github.com/ItsssssJack/power-design | 把"插图多大才够"变成数字：主导焦点 **≥25% 画面**或 **≥3× 次级元素**；最大元素 ≥1.5× 次大；留白率 正文 ≥40% / hero ≥60%；安全边距 ≥5% | 抽成出图后的**量化验收门槛** |
| **aipoch/medical-research-skills** | https://github.com/aipoch/medical-research-skills | MIT。`slide-deck-images/references/layouts.md`：**10 个页面级版式 + 14 个信息图级版式**；**16 个 style preset × 4 个正交维度**（texture / mood / typography / density） | **笛卡尔积式的风格库结构比单层列表更好用** |
| **guizang-ppt-skill** | https://github.com/op7418/guizang-ppt-skill | "去 AI 味"实证：`chrome`（跨页稳定栏目标签）与 `kicker`（每页不同的钩子）**不能写同一句话**；主题节奏硬规则（禁止连续 3 页同主题） | 节奏规则直接用于逐页提示词 |
| **open-agent-hub → baoyu-slide-deck** | https://github.com/guanyang/open-agent-hub | `references/dimensions/density.md`：minimal / balanced / dense 三档的**逐项数字**（minimal = 1 个主导视觉 + 15%+ 边距 + "Large visuals dominate"） | 密度做成方案里的显式字段 |
| **awesome-design-md** | https://github.com/VoltAgent/awesome-design-md | MIT，**73 份**品牌 DESIGN.md，每份 9 节含 Color Palette（语义名 + hex + 角色）、Typography 层级表、**Do's and Don'ts** | Do's/Don'ts 直接当 negative block |
| **PPT-Design-Prompt** | https://github.com/Russell-cell/PPT-Design-Prompt | DESIGN.md → 演示图片 DESIGN.md 转换器；明确声明"为 slide image systems 服务，不是 deck generator" | 采用 DESIGN.md 格式后用它批量转换。⚠️ 有 `ATTRIBUTION.md` 说明品牌素材法律边界 |
| **gpt-image cheat-sheet（中文）** | https://github.com/PEPETII/gpt-image | 提炼自官方 cookbook 的中文速查：按"背景/场景→主体→关键细节→约束"组织；**信息图/UI/图表/幻灯片避免小字、歧义箭头、无关装饰** | 团队培训材料 |
| **OpenAI 官方 cookbook** | https://github.com/openai/openai-cookbook/blob/main/examples/multimodal/image-gen-models-prompting-guide.ipynb | 官方提示词指南原文（见第四节） | 提示词框架的第一层权威依据 |
| **Google Stitch DESIGN.md 规范** | https://stitch.withgoogle.com/docs/design-md/overview/ | DESIGN.md 格式的官方定义（被上面两个仓库共同采用） | 若做风格卡，用它做格式基准保证可互换 |

### ⚠️ 未验证（在搜索结果里出现，但正文未读到 —— 不要当结论）

| 资源 | 链接 | 状态 |
| --- | --- | --- |
| Google Cloud《Ultimate prompting guide for Nano Banana》 | https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana | 多次抓取 `fetch failed`，**内容未验证** |
| Google《7 tips to get the most out of Nano Banana Pro》 | https://blog.google/products/ai-platforms/products/gemini/prompting-tips-nano-banana-pro/ | HTTP 200 但正文被截断为仅标题，**内容未验证** |
| Google AI Studio 10 条技巧（livemint 转述） | https://www.livemint.com/technology/tech-news/google-ai-studio-explains-complete-guide-to-nano-banana-pro-10-tips-for-professional-asset-production/amp-11764394315069.html | 仅搜索结果，**未验证** |
| baoyu-slide-deck 仓库其他文件 | 同上 open-agent-hub | 只验证了 `density.md` 一个文件 |

### 📌 第三方转述（可用，但不是官方）

- **Nano Banana Pro 五步公式**（Subject + Detailed Description + Environment + Style + Quality Modifiers）：https://www.asus.com/blog/nano-banana-pro-prompts-the-five-step-formula-for-better-ai-images/ —— 已抓取全文，但是 **ASUS 对 Google 视频教程的转述**，**不要标注为 Google 官方结论**。

### ❌ 没找到

- **Black Forest Labs（Flux）官方关于版面/图文关系的提示词指南** —— 没找到，不做推测。
- **Seedream（字节）官方提示词指南** —— 本次未检索，**不能给结论**。
- **名为 "awesome prompts slides" 的 awesome-list** —— 没找到对口仓库（`awesome-ppt-skills` 是 skill 不是 list，别混淆命名）。

---

## 三、官方指南真正可用的四条结论

> 来源：OpenAI cookbook `image-gen-models-prompting-guide.ipynb`（已抓取原文）。

1. **提示词结构顺序**：`background / scene → subject → key details → constraints`。
2. **⭐ 治"假照片"的关键**（原文要求）：照片级真实感要**主动写出真实瑕疵**（皮肤纹理、磨损、灰尘、不均匀光线、轻微动态模糊、不完美的构图），并且 **"avoid words that imply studio polish or staging"**（避免任何暗示影棚精修或摆拍的词）。
   > 这一条直接命中我们案例 B 里那 5 张糊图缩略图：它们假，是因为既没有"真实瑕疵"的正向描述，又在被要求"专业、干净"时滑向了无质感的合成感。
3. **图中文字**：要渲染的文字加引号或全大写 + 精确说明排版；**密集文字/信息图应把质量档设为 `high`**。
4. **gpt-image-2 的 `size` 约束**（据该指南）：长边 < 3840、**两边均为 16 的倍数**、长短边比 ≤ 3:1、总像素 ≤ 8,294,400，**推荐可靠性上限 2560×1440**。

### ⚠️ 这条约束和我们 `.env` 直接冲突，请务必核实

```env
# 当前 .env
AI_IMAGE_SIZE="1920×1080"
```

两个问题叠加：

| 问题 | 说明 |
| --- | --- |
| ① 全角乘号 | 用的是 `×`（U+00D7），不是 ASCII `x`。代码无任何归一化，原样发给中转站。 |
| ② 1080 不是 16 的倍数 | 1080 ÷ 16 = 67.5。按上面第 4 条，**该尺寸可能不被接受**。 |

而**代码里的默认值反而是合规的**：

```ts
// lib/ai-providers.ts:166
size: trimEnv(process.env.AI_IMAGE_SIZE) || "1536x864",
//                                             1536÷16=96 ✓  864÷16=54 ✓  比例 16:9 ✓
```

**建议值**（按第 4 条约束推算，均满足"两边 16 的倍数 + 比例 16:9"）：

| 值 | 校验 | 说明 |
| --- | --- | --- |
| `1536x864` | 96 / 54 ✓ | 代码默认值，最稳 |
| `1920x1088` | 120 / 68 ✓ | 接近现在的 1920 宽度 |
| `2560x1440` | 160 / 90 ✓ | 官方推荐的可靠性上限，画质最好 |

> ⚠️ 第 4 条来自子代理抓取的官方 cookbook 摘要，**建议你自己再确认一次**。但从我们实测产出确实是 1920×1080 来看（见 `05-根因诊断` 的实测表格），当前配置**要么被中转站接受了、要么被静默回落**。改成上面的合规值可以消除这个不确定性。
>
> `.env` 不在 Git 里，属于本机配置，**需要你自己修改**。

---

## 四、外部精华模板（去重后，可直接粘贴）

以下 6 段是从上面资源里挑出的、**我们自己 01/02/03 三份文件里没有覆盖**的部分。

### 模板 A · Composition budget（画面占比锁）

> 来源：`ppt-master` 构图原语 A + `power-design` Fitts 落地规则 + `xiaohu-ip-studio` 占比约束

```text
Composition budget (16:9 canvas — obey these proportions, do not re-balance them):
- The illustration is the single dominant element. It occupies 45-55% of the total canvas area
  and is at least 3x larger than any text block.
- The illustration is placed on the right 55% and bleeds to the top, right and bottom edges.
- Text occupies the left 40% only: one headline (max 8 words) plus at most two short lines.
- Minimum 25% of the canvas stays empty background. Do not fill empty space with decoration.
Composition rule: if the illustration and the text compete for attention, the illustration wins.
Do not shrink the illustration to make room for more text. Cut text instead.
```

### 模板 B · 主视觉"必须存在"硬声明

```text
This slide MUST contain a large visual subject. A text-only or typography-only page is a failure.
Before rendering any text, first establish one concrete visual subject that fills the frame.
The visual subject must be a specific, nameable thing — an object, a scene, a diagram of real
parts, or a person doing a specific action. Never use an abstract gradient, a glowing orb,
a floating geometric shape, or generic icons as the visual subject.
If the content has no natural visual, build one from its real components.
```
> 这一段正好补上我们 `05-根因诊断` RC-1 说的"没有一句话阻止模型选 0 个画面"。

### 模板 C · 反 AI 味负向防火墙（最强的一份）

> 来源：`xiaohu-ip-studio/anti-ppt-qa.md` + `codex-ppt-skill` + `future-slide` anti-generic

```text
Negative constraints — do NOT include any of the following:
- No generic decorative gradient blobs, glowing orbs, abstract waves, particle fields,
  mesh gradients, or bokeh used as filler.
- No floating icons with no semantic role; no icons that are not tied to a specific label
  in this page's content.
- No badge spam, no random ribbons, no empty decorative shapes, no ornamental borders.
- No fake UI screenshots, no fake dashboards, no fake analytics charts with invented legends
  or decorative numbers, no fake logos, no fake brand marks, no QR codes, no watermarks.
- No staged commercial stock-photo posing, no glossy corporate handshake imagery.
- No sci-fi robot, no neon cyber interface, no 3D glassmorphism panels unless the deck style
  explicitly requires it.
- No dense tiny footnotes, no unreadable micro-labels, no cluttered arrows, no unfocused
  overcrowded composition.
- No type-name titles in the corner (do not label the page "Workflow", "Roadmap", "Overview").
- No paper grain, no beige vintage paper texture, no noise, no drop shadows on flat artwork.
Test before finishing: for every decorative element, state in one clause what information it
carries. If it carries none, remove it.
```
> 最后那句自检是整份清单的灵魂：**"每个装饰元素必须能说出它承载什么信息，说不出就删掉。"** 这直接把案例 C 那种"灰色占位条"判死。

### 模板 D · 真实感照片（治"假照片"）

```text
Photorealistic. Prompt this as a real photo captured in the moment, not a designed image.
Include real texture and imperfection: visible skin texture, worn materials, dust, uneven
lighting, slight motion blur, imperfect framing.
Shot on a 35mm film camera, 50mm lens, available light, natural color balance, subtle grain.
Use the word "photorealistic" directly. Do not use language that implies studio polish,
retouching, staging, glamorization, or cinematic color grading.
```

### 模板 E · 解释图（角色"嵌入"结构，不是站着讲解）

```text
Explainer diagram, not an atmosphere image. Accuracy and clarity are the goal.
- The structure is the subject: it occupies 65-75% of the frame.
- Any character is an actor embedded IN the structure (climbing the steps, stuck at the
  bottleneck, operating the machine) — never a mascot standing beside the diagram pointing
  at it. Character occupies 25-35%, maximum.
- Name the real parts of the mechanism explicitly and draw all of them correctly.
- Labels: at most 5-8 labels, each 2-8 words, all correct.
- If you must depict code or a table, show only a skeleton, never full realistic content.
```
> 这条对"插图很假"特别有效：**把角色变成结构里的行动者**，模型就不得不画一个真实场景，而画不出"站在旁边指指点点的吉祥物"。

### 模板 F · 图表诚实性（治"假图表"）

```text
Chart rules:
- Render ONLY the following exact labels and values, with these exact strings:
  <label 1: "exact text">, <value 1: "exact number">, <label 2: "exact text">, …
- Use no other numbers, no invented legends, no decorative data points, no fake precision.
- One chart family only. State which axis carries what. No 3D, no drop shadows on bars,
  no gradient fills, no gridlines unless they carry information.
- Prefer direct labels on the marks over a separate legend.
- If a value is not supplied above, do not draw a number for it.
```

### 另外两条工程细节（踩过坑的经验）

1. **gpt-image 系列没有独立的 `negative_prompt` 参数** —— 负向约束必须写成提示词内的自然语言约束段。
2. **模型会把 hex 色值和颜色名画成画面里的可见标签** —— 所以每段风格描述后面都要追加一句：
   ```text
   Color values are rendering guidance only — do not display HEX codes or color names as text.
   ```

---

## 五、许可证与合规提醒

| 资源 | 许可证 | 注意 |
| --- | --- | --- |
| `ppt-master` | MIT | 可自由使用 |
| `awesome-design-md` | MIT | 可自由使用 |
| `medical-research-skills` | MIT | 可自由使用 |
| `future-slide-skill` | Apache-2.0 | 保留 NOTICE |
| `PPT-Design-Prompt` | 见仓库 `ATTRIBUTION.md` | ⚠️ **涉及第三方品牌素材的法律边界，商用前必须过一遍授权** |
| `awesome-design-md` 内的品牌 DESIGN.md | 仓库 MIT，但**品牌本身有商标权** | 只能当风格参考，**不要生成可识别的真实品牌标识**（这一点与我们现有的真实性规则一致） |

**统一原则**：外部资源只作**提示词写法参考**。任何情况下都不要让模型生成可识别的真实机构招牌、校徽、真实品牌 logo —— 这与项目现有的真实性硬规则一致，也是 `page-archetypes.md` / `evidence-and-authenticity.md` 的既有要求。

---

## 六、和本目录其他文件的配合

```
外部资源（本文件）
   ├─ 风格段落 95–100 词范本  → 补进 01-风格库
   ├─ S01–S22 / 10+14 版式命名 → 补进 02-版式库
   ├─ Composition budget / 反 AI 味清单 → 补进 03-插图手册
   └─ 量化门槛（≥25% / ≥3× / 留白 ≥40%） → 用作出图后的验收标准
```

**下一步**：如果要真正落地，看 `06-接入方案-怎么用到现有链路.md`。
