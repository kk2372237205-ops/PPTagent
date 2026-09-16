# 版式库 · Layout Library

> 用途：给生图模型明确"这一页的画面怎么摆"。**版式是插入图大小的直接决定因素**——只要版式里没有写死"插图占多少面积"，模型就会按最保守的方式处理。
>
> 每个版式都带一个 **`插图份额`（illustration share）** 字段，这是本项目现有 `advanced-layout-profiles.md` 完全没有的东西（现有文件只写"一页可用 1–4 个画面单元"，没写占比）。

---

## 0. 为什么"版式"必须量化

现有提示词里的版式指令是这类句子：

> "Prefer one primary claim with one to three supporting visual units woven into the reading path."
> "Do not reserve one fixed media zone for every page."

这两句在**语义层**是对的（不要每页都左文右图），但在**执行层**是空的：模型接到"1–3 个画面单元"，最省事的解法就是画 3 个 60px 的小图标塞在角落——它满足字面要求，却没满足你的期待。

**修正原则：把"几个单元"换成"占多少面积"。**

| 旧写法（现有项目） | 新写法（本文件） |
| --- | --- |
| 每页优先 1–3 个画面单元 | 主视觉占画布 40–65%，且是页面上最大的单一元素 |
| 画面位置由语义决定 | 主视觉占满右侧 52% 并出血；文字仅占左侧 40% |
| 不要固定图片区 | 相邻页的插图面积差异不超过 20%，但轮廓必须不同 |

**面积是模型能执行的指令，"单元"不是。**

---

## 1. 版式清单（20 个）

字段说明：**图文比** = 插图面积 : 文字面积；**出血** = 插图是否延伸到画布边缘。

---

### L-01 `cover-full-bleed-hero` 全出血主视觉封面

```
LAYOUT: full-bleed hero cover.
One single illustration fills 100% of the canvas, bleeding off all four edges.
A large title block sits in the lower-left third, with a soft scrim
(30% opacity dark or light rectangle, no blur) behind the text for contrast.
Subtitle directly beneath the title at 40% of the title size.
No other elements. No footer, no page number, no logos.
ILLUSTRATION SHARE: 100% (background) with the title occupying under 25% of the area.
```
- **图文比** 75:25 ｜ **出血** 四边全出血
- **要点**：`soft scrim ... no blur` 必须写，否则模型会用模糊蒙版糊掉半个画面。
- **适合**：品牌感强的封面、路演、文化类。

### L-02 `cover-split-diagonal` 对角分割封面

```
LAYOUT: cover with a diagonal split.
The canvas is divided by one straight diagonal edge (choose the angle once
and keep it for the whole deck). The illustration fills the larger triangle
completely and bleeds off the top and right edges. The title sits in the
smaller triangle, left aligned, with generous internal padding.
ILLUSTRATION SHARE: 58%. Title zone: 42%.
```
- **图文比** 58:42 ｜ **出血** 右上两处
- **要点**：写死角度（例如 22°）并声明"整套 PPT 用同一角度"。

### L-03 `cover-condensed-band` 中部横带封面

```
LAYOUT: cover with a full-width horizontal illustration band across the middle
40% of the canvas, bleeding off the left and right edges.
Title above the band, subtitle below the band, both flush left with the outer margin.
Top and bottom zones remain empty background.
ILLUSTRATION SHARE: 40%.
```
- **图文比** 40:25 ｜ **出血** 左右两处
- **要点**：上下留白是这套版式的价值，必须写 `remain empty`。

### L-04 `section-divider` 章节过渡页

```
LAYOUT: section divider.
One large numeral or one short section title occupies the left third.
A single symbolic illustration occupies the right 55%, vertically centered,
with at least 12% clear space around it.
No body text, no bullets, no footer.
ILLUSTRATION SHARE: 55%.
```
- **图文比** 55:15 ｜ **出血** 否
- **要点**：整套里最多用 2–3 次，多了会显得空。

### L-05 `left-text-right-visual` 左文右图（最常用正文页）

```
LAYOUT: left text, right visual.
Left 42% of the canvas: headline at the top, then 3 to 4 short text blocks
stacked with consistent 24px gaps, each block a bold lead-in line plus
one supporting line. Right 54%: one single illustration that fills the entire
right zone and bleeds off the right edge and either the top or bottom edge.
A 4% gutter separates the two zones; nothing crosses it.
ILLUSTRATION SHARE: 54%, minimum illustration height 80% of the canvas.
```
- **图文比** 54:42 ｜ **出血** 右侧 + 上下其一
- **要点**：`bleeds off the right edge` 是让插图显大的关键——出血的插图在视觉上永远比留边的大。

### L-06 `right-text-left-visual` 右文左图

```
LAYOUT: right text, left visual. Mirror of the left-text layout.
Left 56%: one illustration filling the zone, bleeding off the left edge.
Right 40%: headline and text blocks, flush left, aligned to the outer margin.
ILLUSTRATION SHARE: 56%.
```
- **要点**：与 L-05 交替使用，是"整套有变化但不散"的最低成本做法。

### L-07 `top-title-full-visual` 上标题下通栏大图

```
LAYOUT: title band on top, full-width visual below.
Top 22%: headline flush left plus an optional one-line deck.
Bottom 74%: one illustration spanning the full canvas width,
bleeding off the left, right and bottom edges.
At most 2 short annotations placed directly on the illustration
with small leader lines; no separate caption block.
ILLUSTRATION SHARE: 74%.
```
- **图文比** 74:22 ｜ **出血** 左右下三处
- **要点**：这是**最容易让插图变大**的版式。文字需求高的页面不要用，但一旦用上，插图必然主导。

### L-08 `full-bleed-visual-with-panel` 全出血图 + 悬浮文字面板

```
LAYOUT: full-bleed visual with one floating text panel.
The illustration covers the entire canvas. One solid rectangular panel
(95% opaque, square corners, no shadow, no blur) holds the headline and
2 to 3 short lines, anchored to the left margin and vertically centered.
ILLUSTRATION SHARE: 100% background; panel covers under 30%.
```
- **图文比** 70:30 ｜ **出血** 四边
- **要点**：面板必须写 `solid` + `no blur`，否则会变成半透明毛玻璃（典型 AI 味）。

### L-09 `big-number-hero` 大数字主导页

```
LAYOUT: single dominant metric.
One number at 5x the body size occupies the left 45%, aligned to the baseline
of a short supporting sentence directly beneath it.
One illustration sits to the right at 45% of the canvas width,
vertically centered, with clear space around it.
ILLUSTRATION SHARE: 45%.
```
- **图文比** 45:40 ｜ **要点**：数字本身也是"视觉"，所以图文比不要超过 50:50。

### L-10 `metric-trio-with-visual` 三指标 + 插图

```
LAYOUT: three metrics with one supporting illustration.
Top 35%: three equal metric blocks across the width, each with a large number,
a 1-line label and a thin divider between them (dividers, not cards).
Bottom 60%: one illustration spanning the full width, bleeding off the bottom edge,
with at most three direct labels pointing to the exact parts of the illustration
that each metric refers to.
ILLUSTRATION SHARE: 60%.
```
- **要点**：`dividers, not cards` 很重要——三个卡片是典型的 AI 默认审美。

### L-11 `timeline-horizontal` 横向时间轴

```
LAYOUT: horizontal timeline.
A single 3px horizontal line runs across the middle of the canvas
at 80% width, with 4 to 5 evenly spaced filled circular nodes.
Each node has a short label above and a one-line note below.
One illustration occupies the full height of the right 25% of the canvas,
showing the end state of the process, bleeding off the right edge.
ILLUSTRATION SHARE: 25% plus the timeline itself as a graphic element.
```
- **要点**：时间轴本身算图形元素，所以插图份额可以降到 25%，但仍要出血。

### L-12 `process-flow-four-step` 四步流程图

```
LAYOUT: four-step process flow.
Four rectangular stages arranged left to right, connected by thick flat arrows
(no thin lines, no chevrons). Each stage: a small illustration inside the box
occupying the upper 60% of the box, a bold stage name, one line of detail.
The four boxes are equal width with 2% gaps, together spanning 88% of the canvas.
ILLUSTRATION SHARE: 4 illustrations, each 10% of the canvas = 40% total.
```
- **要点**：这里必须写 `each 10% of the canvas`，否则每个插图会缩到 3%。

### L-13 `comparison-two-column` 双栏对比

```
LAYOUT: two-column comparison.
A 2px vertical divider runs full height at the canvas center.
Left column: the "before" or "option A" state, headline, 3 short lines,
and one illustration below the text at 45% of the column height.
Right column: same structure, mirrored, showing "after" or "option B".
Both illustrations use identical framing and scale.
ILLUSTRATION SHARE: 2 illustrations, each 22% of the canvas = 44% total.
```
- **要点**：`identical framing and scale` 必须写死，否则两边画风不一致就废了。

### L-14 `matrix-2x2` 四象限矩阵

```
LAYOUT: 2x2 positioning matrix.
One square plot area occupies the left 55% of the canvas with a hairline border,
a horizontal and a vertical axis with short labels and arrow ends,
and 4 to 6 plotted items as filled dots with adjacent text labels.
Right 40%: one illustration vertically centered, 40% of canvas width,
bleeding off the right edge, clarifying the meaning of the two axes.
ILLUSTRATION SHARE: 40%.
```

### L-15 `chart-large-insight-rail` 大图表 + 结论条

```
LAYOUT: dominant chart with a narrow insight rail.
Left 66%: one large chart occupying the full height of the content area,
directly labeled (values written next to the data, no legend box),
thin gridlines at 10% opacity, 2px axis strokes.
Right 30%: a narrow rail with 3 stacked conclusions, each a bold short line
plus one supporting sentence, separated by thin rules.
Chart colors come from the deck palette with consistent meaning.
ILLUSTRATION SHARE: 66% (the chart is the illustration on this page).
```
- **要点**：**图表页不要强塞装饰插图**。图表本身就是插图，硬加插画反而变假。这一条要明确写进提示词：`do not add a decorative illustration to this page`。

### L-16 `annotated-mechanism` 标注式原理图页

```
LAYOUT: full-width annotated mechanism.
The illustration occupies the lower 68% of the canvas, spanning the full width,
bleeding off the left, right and bottom edges.
Headline in the top 20%, flush left.
5 to 7 callout labels placed directly on the illustration with thin leader lines
ending in small filled dots; labels are small, horizontal, and never overlap.
ILLUSTRATION SHARE: 68%.
```

### L-17 `card-grid-three` 三卡片（谨慎使用）

```
LAYOUT: three justified cards.
Three equal square-cornered cards with 1px hairline borders and NO shadow,
occupying 88% of the canvas width, aligned to a common top and bottom.
Each card: a small illustration in its upper half occupying 30% of the card area,
a bold title, two short lines.
The cards must represent genuinely peer-level, modular information.
ILLUSTRATION SHARE: 3 illustrations, each 9% of the canvas = 27% total.
```
- **要点**：这是现有提示词反复禁止的版式（"Never default to equal-weight card grids"）。**禁止是对的，但要给替代品**——本文件的 L-11 / L-12 / L-13 / L-16 就是替代品。只禁不给替代，模型只能退到纯文字。

### L-18 `quote-pull` 大字引述页

```
LAYOUT: pull quote.
One sentence set at 3.5x body size occupies the left 60%, flush left,
hanging punctuation, maximum 14 words.
One illustration occupies the right 34%, vertically centered,
with at least 10% clear space around it, no bleed.
A thin 2px rule separates the quote from a small attribution line below it.
ILLUSTRATION SHARE: 34%.
```

### L-19 `before-after-split` 前后对照（同页）

```
LAYOUT: before / after split.
Each half of the canvas shows the same subject in a different state,
drawn at identical scale, identical camera angle and identical framing.
Left half labeled BEFORE, right half labeled AFTER, both in small caps.
Each halved illustration bleeds off its own outer edge (left and right) and
off the bottom.
ILLUSTRATION SHARE: 2 illustrations, each 38% = 76% total.
```

### L-20 `summary-close-symbolic` 收束页

```
LAYOUT: symbolic close.
One symbolic illustration centered and vertically placed in the upper 55%,
occupying 45% of the canvas width, with generous space around it.
One memorable conclusion line beneath it at 1.8x body size, centered,
maximum 16 words. One short supporting line below that at body size.
Nothing else: no cards, no chart, no roadmap, no list, no footer.
ILLUSTRATION SHARE: 45%.
```

---

## 2. 版式节奏（整套图不呆板的关键）

**问题**：12 页都用 L-05 会呆板；每页都用不同版式会散。

**解法**：用"面积曲线"排节奏，而不是每页重新挑版式。

```
页型               版式            插图面积
封面               L-01 / L-02     75–100%
章节页             L-04            55%
正文 1（问题）     L-05            54%
正文 2（机制）     L-16            68%      ← 高峰
正文 3（数据）     L-15            66%（图表）
正文 4（对比）     L-13            44%
正文 5（方案）     L-07            74%      ← 高峰
正文 6（流程）     L-12            40%
正文 7（场景）     L-08            70%
正文 8（案例）     L-19            76%      ← 高峰
结论页             L-09            45%
收束页             L-20            45%
```

**规则**：
1. 相邻两页的插图面积差 **不超过 ±25%**（避免忽大忽小像拼贴）；
2. 每 3 页至少出现 **1 个面积 ≥65%** 的高峰页（保证整体"图多"的观感）；
3. 高峰页不要连续出现超过 2 页（否则整套压抑）；
4. **任何一页的插图面积不得低于 25%**——这是"没有插图"的硬性防线。

---

## 3. 版式提示词的写法模板

```text
LAYOUT: <英文版式名>
<3–6 句描述：每个区域占多少、谁出血到哪条边、留白在哪、元素之间的间距关系>
ILLUSTRATION SHARE: <百分比>，并写清是否为背景铺满
TEXT BUDGET: <最多几个文字块 / 每块最多几行 / 正文最多多少词>
BLEED: <哪几条边出血>
DO NOT: <本版式最容易出现的错误摆法>
```

**`TEXT BUDGET` 这一行是关键**：模型画不出大插图，往往是因为文字占了太多面积。把正文压到 `max 45 words`，插图自然变大。

---

## 4. 与现有项目的映射

| 现有 `advanced-layout-profiles.md` | 本文件对应 | 差距 |
| --- | --- | --- |
| `blue-gold-tech` 图文叙事版式 | L-05 / L-06 / L-07 轮换 | 现有没有面积与出血要求 |
| `white-green-tech` 清晰技术说明 | L-16 / L-12 | 没有标注数量与位置约束 |
| `black-gold-business` 结论先行 | L-09 / L-15 | 没有图表直标规则 |
| `blue-purple-ai` 系统关系图解 | L-16 / L-14 | 没有禁止神经网络装饰的具体词 |
| `red-white-government` 庄重层级 | L-07 / L-13 | 没有出血与安全区规则 |
| `minimal-academic` 极简学术 | L-15 / SP-09 | 没有 `do not add decorative illustration` |
| `vivid-roadshow` 活力路演 | L-01 / L-08 / L-19 | 没有插图面积下限 |

**一句话总结差距**：现有版式语言写的是**"信息怎么组织"**，本文件补的是**"插图占多大、出血到哪、文字最多多少"**。前者决定内容对不对，后者决定图好不好看。
