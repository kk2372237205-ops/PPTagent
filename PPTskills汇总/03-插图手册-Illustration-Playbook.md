# 插图手册 · Illustration Playbook

> 这份文件只解决一个问题：**为什么生图模型画出来的 PPT 页面里，插图要么太小、要么干脆没有、要么一看就是假的，以及怎么用提示词修好它。**

---

## 一、先把三个症状分开归因

你把三个症状说在一起，但它们的成因完全不同，混在一起改会互相打架。

### 症状 A：插图过小

**真实成因：提示词从来没有规定过面积。**

现有链路里，描述插图的字段是 `main_visual`（自由文本）和 `visual_units`（0–4 个）。这两个字段描述的是**内容**（画什么），不是**尺寸**（占多大）。

生图模型在没有尺寸约束时，会执行一个内部默认策略：**文字优先**。理由是它检测到画面里全是需要精确渲染的中文字，就会把绝大多数像素预算分配给文字区域，把插图压缩成"装饰"级别。

> 证据（现有项目 `skills/deck-generation/slide-image-specs.md` 第 44 行）：
> "高级版每个适合图像表达的正文页优先规划 1-3 个有语义作用的画面单元；高密度页最多 4 个，纯文字页可以为 0 个。"
>
> 这句话给了模型"画 3 个小单元"和"一个都不画"两个合法出口，**没有给"画一个大的"这个出口**。

**修法**：加"面积合同"（本文件第二节）。

### 症状 B：几乎没有插图

**真实成因：整套提示词的语法是"禁止式"的，模型被教成了"插图很危险"。**

现有规则里，与画面有关的句子绝大多数是禁令。粗略统计 `advanced-single-slide-director/SKILL.md` 的 Hard Boundaries 一节：**15 条约束里有 12 条是 "Never / Do not / Avoid"**。而正向要求只有一条半。

更关键的是这几句：

> `SKILL.md` 第 53 行："Do not force a visual unit when typography or a grounded chart is clearer."
> `SKILL.md` 第 37 行："Default generic decorative icons to zero in serious reports and competitions."
> `evidence-and-authenticity.md` 第 34 行："When no grounded diagram or honest conceptual visual is appropriate, use typography and neutral geometry."
> `evidence-and-authenticity.md` 第 38 行："Generic decorative icon count is zero by default."

**模型读到的是**：插图是"除非极其必要否则不要做"的东西。于是它在规划阶段就选了 `text-led` + 0 个画面单元——这个选择完全合规，你没有任何一句话能反驳它。等提示词送到图片模型时，插图已经不存在了。

**修法**：把"不要做插图"的默认值改成"默认做插图，只有在明确不适合时才退回排版"，并且**给模型一个具体的替代品**（不能只禁不给）。见第四节。

### 症状 C：插图很假

**真实成因：提示词里没有插画语言，模型只能用默认审美兜底。**

现有项目的 `visual_identity.json` 字段是：

```
style_name / palette / background_system / layout_system / card_system /
typography_feel / motifs / header_footer_rules / white_space_rules / forbidden
```

**十个字段里没有一个是描述"插图怎么画"的。** `motifs` 只定义"可复用装饰元素"，而装饰元素又被 `evidence-and-authenticity.md` 判为"默认零个"。

所以当模型真的决定画一张插图时，它手上只有"画什么"（内容），没有"怎么画"（风格）。这时它会调用训练数据里最高频的"科技感插图"模板：

```
蓝紫渐变球 / 发光神经网络 / 半透明玻璃面板 / 悬浮粒子 / 数字大脑 /
无脸西装剪影 / 光轨 / 镜头炫光
```

这些不是插图，是**没有内容时的填充物**。它们看起来假，是因为它们**不表达任何东西**——它们只是为了填满一块区域而被生成的。

**修法**：给风格库加 `illustration_system` 字段（见 `01-风格库-Style-Library.md`），并且明确禁止那一批默认填充物。

---

## 二、让插图"变大"的 12 条技术

> 全部是可直接粘贴的英文提示词。核心思想：**把"画什么"换成"占多大"。**

### T-1 面积下限（最有效的一条）

```
The illustration is the single largest element on this page and occupies
at least 45% of the total canvas area — larger than the headline block
and larger than the entire body-text block combined.
```

### T-2 高度跨度

```
The illustration's tallest element spans at least 75% of the canvas height.
```

> 面积容易被模型"理解但不执行"，**高度跨度更难糊弄**——它必须真的把东西画高。

### T-3 出血（Bleed）

```
The illustration bleeds off the right edge and the bottom edge of the canvas,
running edge to edge with no margin, no frame and no border.
```

> 出血是**最廉价的"显大"手段**：一张出血的插图在视觉上永远大于同样大小但留了边距的插图。只要允许，就让主视觉至少出血一条边。

### T-4 明确分区尺寸

```
The canvas is split into two zones: the text zone occupies the left 40%
and the illustration zone occupies the right 56%, with a 4% gutter between them.
Nothing crosses the gutter.
```

> 不要写"左文右图"。要写**百分比 + gutter**。

### T-5 压文字的预算

```
TEXT BUDGET: at most 3 text blocks, each at most 2 lines,
total body copy under 45 words. The headline is at most 9 words.
```

> 文字不压下去，插图永远大不了。这是**根因级**的一条。

### T-6 禁止缩小

```
Do NOT shrink the illustration to fit the text. If space is tight,
reduce the text, not the illustration.
```

> 这条要单独写。模型的默认妥协方式是"两边都缩"。

### T-7 数量收敛

```
One single dominant illustration. Do not split the visual into several small
decorative icons or a row of small pictures.
```

> "1–3 个画面单元"这种写法会让模型选择 3 个小图（更容易画）。改成"1 个大的"。

### T-8 视觉重心位置

```
The visual center of mass of the illustration sits on the right third line
of the canvas, at the vertical center, with the subject's silhouette clearly
readable when the page is viewed at 25% zoom.
```

> `readable at 25% zoom`（缩略图可辨认）是一个非常好用的约束，它等价于"画大、画清楚"。

### T-9 主体占比

```
Within the illustration zone, the main subject fills at least 70% of the zone.
No large empty background inside the illustration zone.
```

> 防的是"画了一个大框，框里一个小东西"。

### T-10 前景化

```
The illustration is composed as a foreground layer, not as a background texture.
The main subject sits in front, at full opacity and full saturation.
```

> 防的是"插图退成背景纹理"，那是另一种"没有插图"。

### T-11 与标题的层级关系

```
The illustration must be visually heavier than the headline:
larger area, stronger contrast, or both.
```

### T-12 全套面积下限

```
Across the entire deck, no content page has an illustration smaller than
25% of the canvas. At least one third of the pages have an illustration
larger than 60%.
```

---

## 三、让插图"不假"的 10 条技术

> 核心思想：**假 = 没有具体所指。** 让模型画一个**具体的名词**，而不是一个"关于 X 的插图"。

### T-13 用具体名词替换抽象主题

```
❌ an illustration about digital transformation
✅ a flat vector illustration of a paper document being scanned by a
   desktop scanner, showing the document feeding through two rollers,
   with three lines of text visible on the page
```

> 抽象主题 → 模型只能用抽象图形（球、网格、光）。具体名词 → 模型必须画出结构，结构一出来就不假了。
> **执行规则：每个插图 brief 里至少要有 3 个具体名词。**

### T-14 写死线宽与填充方式

```
uniform 2px stroke, solid flat fills only, no gradients, no drop shadows,
no glow, no 3D rendering, no transparency
```

> "假"有很大一部分来自渐变与发光。禁用之后，模型必须靠形体和构图取胜。

### T-15 写死色数

```
limited to exactly 4 flat colors taken from the deck palette,
plus white; no tints, no shades, no gradient stops
```

> 色数一放开，模型就开始调渐变。

### T-16 写死视角

```
straight-on orthographic view, no perspective, consistent across all pages
```
或
```
isometric 30-degree axonometric projection, no perspective distortion
```

> 视角漂移是"整套图看着不专业"的隐形杀手。一页正面、一页斜 45°、一页带透视，观感立刻散。

### T-17 写死复杂度

```
no more than 5 distinct objects in the illustration,
no more than 2 levels of depth, no decorative filler elements
```

> 模型爱堆细节来"显得丰富"，堆多了必假。

### T-18 禁止具体的 AI 味元素（清单式）

```
Do not include any of: glowing spheres, gradient mesh backgrounds,
neural-network node graphs, circuit board traces, binary code,
holographic UI panels, floating translucent glass cards,
particle constellations, lens flare, bokeh, light trails,
faceless business silhouettes, generic isometric cities,
digital brains, robot hands, or abstract swirling ribbons.
```

> **这份清单要逐字粘贴。** 它比"不要 AI 味"有效一百倍，因为"AI 味"不是一个模型能执行的概念，而"发光球"是。

### T-19 给材质一个具体的物理描述

```
matte uncoated paper feel, flat ink coverage, no specular highlight,
no reflective surface, no subsurface scattering
```

> 写"matte / flat ink / paper"会把输出拉向印刷品；写"glossy / reflective"会拉向 3D 渲染——后者更容易假。

### T-20 让插图承担信息

```
The illustration must show the specific mechanism described in the text:
<把正文里的机制用一句英文写出来>.
Every labeled part of the illustration corresponds to a named element
in the text. Do not add any object that the text does not mention.
```

> 这是**治本**的一条：插图一旦必须"解释正文"，它就不可能是一团装饰性的光。
> 反过来，**如果这段话写不出来，说明这一页本来就不该有插图——那才是真的应该退回排版的情况。**

### T-21 概念插画的合法性声明（重要）

```
This is a clearly conceptual, non-documentary illustration.
It is not a photograph, not a screenshot, not a certificate, not a record
of a real event. Render it in a flat illustrative style that cannot be
mistaken for documentary evidence.
```

> 现有项目的真实性规则（禁止伪造证书、现场、机构招牌）**本身完全正确**，但它没有告诉模型"那你该画什么"。这句话补上了那个出口：**画成一眼就能看出是"画"的插画**，既避开了伪造风险，又允许插图很大很醒目。
> 这是解决"真实性规则把插图全禁掉"这个死结的关键一句。

### T-22 人名/机构名不进插图

```
Do not depict any real person, organization, campus, product or logo.
If a human is needed, use a simplified geometric figure with no facial features
and no identifying uniform.
```

> 把"不能画真人"从"不能画人"里分离出来，是让插图有人物场景但不违规的前提。

---

## 四、让插图"不被跳过"的 8 条技术

> 这一节治的是**症状 B**（规划阶段就把插图砍掉）。改的是**文字模型**的规划规则，不是图片提示词。

### T-23 反转默认值

```
❌ Do not force a visual unit when typography or a grounded chart is clearer.
✅ Default to one dominant illustration on every content page.
   Fall back to typography only when the page contains no depictable subject.
   When you fall back, state the concrete reason in one sentence.
```

> **必须要求模型"说出理由"**。不要求理由时，它会静默省略（这就是你现在遇到的情况）；要求理由后，省略变成一个需要主动辩护的决定，省略率会大幅下降。

### T-24 禁止 0 个画面单元

```
❌ A plain-text page may have zero visual units.
✅ Every content page has at least one visual unit occupying 25% or more.
   Zero is allowed only on the cover and the closing page.
```

### T-25 给"禁止"配上"替代"

现有规则说 "Never default to equal-weight card grids"，但没说用什么替代，模型只好用"什么都没有"替代。要写成：

```
❌ Never default to equal-weight card grids.
✅ Never use equal-weight card grids. Instead use one of:
   a labeled process chain, a single annotated mechanism, a before/after split,
   a dominant chart with a narrow insight rail, or one full-bleed visual.
```

> **规则：每写一条禁令，必须同时给一个可执行的替代品。** 这是现有 skills 里系统性缺失的写法。

### T-26 拆开"伪造证据"与"装饰插图"

现有规则把两类东西混在同一批禁令里：
- **必须禁止**：伪造证书、合同、报告、专利页、客户现场、机构招牌、真人照片；
- **不该禁止**：概念插画、机制示意、隐喻场景、几何构成。

要显式分成两段：

```
FABRICATION BAN (absolute): never render certificates, contracts, reports,
patent pages, test records, invoices, awards, official signage, logos,
product labels, documentary screenshots, or photorealistic scenes of
real institutions, laboratories, factories, customers or experiments.

ILLUSTRATION POLICY (encouraged): conceptual, mechanism, metaphor and
geometric illustrations are required on content pages. They must be
unmistakably illustrative — flat, simplified, non-photographic —
so they can never be confused with documentary evidence.
```

> 混在一起的后果就是模型"一刀切全不画"。分开之后，两类规则各自成立，不再互相抵消。

### T-27 把"零图标"改成"零图标 + 一插图"

```
❌ Generic decorative icon count is zero by default.
✅ Generic decorative icon count is zero. This does not reduce illustration:
   replace any row of small icons with one larger illustration of the
   underlying subject.
```

> "禁止小图标"和"要有插图"不矛盾，但必须写出来模型才知道。

### T-28 用具体名词驱动规划

```
For each content page, name the single physical subject the illustration
will depict, using a concrete noun phrase. Abstract nouns
(growth, innovation, synergy, empowerment, future) are not acceptable
as illustration subjects.
```

> 规划阶段就要求具体名词，图片阶段才有东西可画。

### T-29 计划里带面积字段

```
Add `illustration_share` to each page plan: a percentage between 25 and 100
stating how much of the canvas the illustration occupies.
Validate that no content page is below 25% and that at least one third
of the pages are above 60%.
```

> **把面积变成结构化字段**，模型才会认真对待。放在自由文本里它会被忽略。

### T-30 明确"这一页不需要插图"的合法条件

```
A page may have no illustration only if it is one of:
(a) a chart page where the chart itself is the visual,
(b) a pure data table page,
(c) the closing page.
Any other page without an illustration fails the plan and must be revised.
```

> 给"例外"设定一个**封闭清单**，而不是开放式判断。开放式判断 = 模型永远选最省事的。

---

## 五、负面提示词总表（可直接整段粘贴）

```text
NEGATIVE — never include any of the following:
glowing spheres, gradient mesh backgrounds, neural network node graphs,
circuit board traces, binary code, matrix rain, holographic UI panels,
floating translucent glass cards, glassmorphism, frosted glass,
particle constellations, sparkles, lens flare, bokeh, light trails,
abstract swirling ribbons, digital brains, robot hands, cyberpunk cities,
faceless business silhouettes in offices, generic isometric cities,
stock-photo people, clip art, emoji, cartoon mascots,
3D beveled charts, glossy plastic, chrome, reflective surfaces,
drop shadows, neon outlines, watermark, model signature,
readable certificates, contracts, reports, patent pages, invoices,
official logos, institution signage, real brand marks,
photorealistic depictions of real campuses, labs, factories or customers.
```

**同时使用正向替代句**（只给负面清单会让模型退到"空"）：

```text
POSITIVE — always include:
one dominant illustration, flat solid fills, uniform stroke weight,
a concrete recognizable subject drawn from the page content,
clear silhouette readable at thumbnail size,
generous internal negative space, matte printed finish.
```

> **正负配对是必须的。** 只给负面 → 画面变空；只给正面 → 画面变花。

---

## 六、完整的"插图合同"模板（粘贴到现有链路用）

把下面这段作为一个整体字段（建议命名 `illustration_contract`）注入到每一页的图片提示词里，替换掉现在分散的 `main_visual` / `visual_units`：

```text
ILLUSTRATION CONTRACT

Subject: <a concrete noun phrase, at least 3 specific nouns, from this page's confirmed content>
Role: this illustration explains <the specific claim / mechanism / comparison on this page>.
      Every labeled part corresponds to a named element in the text.
      Do not add any object the text does not mention.

Style: <从 01-风格库-Style-Library.md 选一个 IS-x，整段粘贴>
Scale: the illustration occupies <N>% of the canvas area and is the single
       largest element on the page. Its tallest element spans at least 75%
       of the canvas height. Bleed: <which edges>.
Composition: <从 02-版式库-Layout-Library.md 选一个 L-xx，写明分区百分比>

Text budget: at most <N> text blocks, <N> lines each, under <N> words total.

Legal frame: this is a clearly conceptual, non-documentary illustration.
It is not a photograph, screenshot, certificate, record or real event.
Render it so it cannot be mistaken for documentary evidence.

Positive: one dominant illustration, flat solid fills, uniform stroke,
concrete recognizable subject, readable silhouette at 25% zoom, matte finish.

Negative: <整段粘贴第五节的 NEGATIVE 清单>

Do NOT shrink the illustration to fit the text. If space is tight, reduce the text.
```

---

## 七、自检清单（出图后 30 秒判断）

| 检查项 | 不合格的样子 | 提示词该补哪条 |
| --- | --- | --- |
| 插图面积 | 目测小于 25%，像装饰角标 | T-1 / T-2 |
| 是否出血 | 四周都有边距，像个卡片里的小图 | T-3 |
| 主体可辨认度 | 缩略图下看不出画的是什么 | T-8 / T-13 |
| 是否具体 | 只有球、网格、光、丝带 | T-13 / T-18 |
| 是否有渐变/发光 | 有明显的发光边缘或渐变过渡 | T-14 / T-15 |
| 色数 | 数一数超过 5 种颜色 | T-15 |
| 视角一致性 | 上一页正面，这一页斜视 | T-16 |
| 与文字的关系 | 插图换成别的图也不影响理解 | T-20 |
| 是否像证书/截图 | 一眼像官方文件 | T-21 |
| 整套面积曲线 | 前后页忽大忽小 | T-12 / 版式库第二节 |

---

## 八、一句话总结

> **插图小，是因为提示词没写面积；插图没有，是因为规则教模型"图很危险"；插图假，是因为提示词只说了画什么、没说怎么画。**
>
> 三个问题三条独立的修法：**面积合同 / 正负配对 + 替代品 / 插画语言（illustration_system）**。
