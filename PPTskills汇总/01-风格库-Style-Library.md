# 风格库 · Style Library

> 用途：给生图模型（gpt-image-2 / nano-banana / Seedream 等）直接生成 **16:9 整页 PPT 图片**时使用的风格合同。
> 每个风格包都包含一个**现有项目里完全缺失的字段：`illustration_system`（插图体系）**——这是解决"插图过小 / 没有插图 / 插图很假"的关键。
>
> 使用方式：把 `PROMPT BLOCK` 整段（英文）粘进你的图片提示词，**不要只写风格名**。
> 只写 "Swiss style" 模型会自由发挥；写上具体的线宽、比例、禁止项，输出才稳定。

---

## 0. 先理解一件事：为什么只写风格名没用

生图模型对风格名的理解是一个**宽泛的聚类中心**。"minimal" 会同时激活"大留白""无装饰""灰度""细线""空旷"五种互相冲突的倾向，于是每次采样落在不同点上——这就是"整套图风格不统一"的根源。

可复用风格合同必须把风格拆成**七个可执行维度**：

| 维度 | 必须写清的 | 写不清的后果 |
| --- | --- | --- |
| `palette` | 具体色值 + **面积比例** | 颜色漂移，第 6 页突然变紫 |
| `typography` | 字重、字距、标题/正文字号比 | 标题时大时小 |
| `background` | 底色 + 材质 + 是否有纹理 | 前 3 页白底，后 5 页渐变 |
| `layout_grid` | 栏数、边距、对齐方式 | 每页版心都不一样 |
| **`illustration_system`** | **插画风格 + 线宽 + 是否渐变 + 视角 + 复杂度** | **← 插图很假的直接原因** |
| `motifs` | 可复用的 2–3 个图形母题 | 每页换一套装饰 |
| `forbidden` | 明确禁止的视觉漂移 | 模型回退到默认 AI 审美 |

**现有项目的 `style-packs.md` 有 palette / layout / motifs / typography / forbidden，唯独没有 `illustration_system`。** 所以模型画插图时只能靠默认审美——默认审美就是"蓝紫渐变球 + 发光网格 + 半透明玻璃面板"，也就是你说的"很假"。

---

## 1. 插图体系（Illustration System）—— 先选这一层，再选配色

风格库的正确用法是**两层组合**：

```
最终风格 = 插图体系（怎么画图） × 配色风格（什么颜色）
```

插图体系决定"插图长什么样"，这是决定"假不假"的唯一变量。以下 8 种是最稳定、最容易被生图模型正确执行的插画语言：

### IS-1 `flat-vector-editorial` 扁平矢量编辑插画 ★最稳

```
illustration_system: flat vector editorial illustration, uniform 2px stroke,
solid fills only, NO gradients, NO drop shadows, NO 3D rendering,
limited to 4 flat colors from the palette, geometric simplification,
clean silhouette shapes, generous negative space inside the illustration,
matte finish, printed-look, no texture overlay
```
- **为什么不易假**：禁用渐变和阴影后，模型无法用"发光"掩盖结构不清；纯色块迫使它画出可辨认的形体。
- **适合**：企业汇报、方案说明、流程页、场景页。

### IS-2 `isometric-line-tech` 等距线稿技术插画

```
illustration_system: isometric line-art illustration, 1.5px uniform stroke,
30-degree axonometric projection, no perspective distortion, no shading,
single accent color fills on 20% of surfaces, white or paper background,
technical drawing discipline, precise parallel hatching for depth,
no gradients, no glow, no lens flare
```
- **适合**：系统架构、设备原理、数据流、产品结构。
- **要点**：必须写死角度（30°）和线宽，否则模型会混用透视，一眼假。

### IS-3 `annotated-mechanism` 标注式原理剖视图

```
illustration_system: annotated technical cutaway diagram, cross-section view,
flat vector rendering with thin leader lines and small square callout labels,
component parts clearly separated and recognizable,
consistent stroke weight across all parts, no photorealistic rendering,
no glow, no bokeh, schematic but elegant, engineering-manual aesthetic
```
- **适合**：技术原理、机制解释、实验装置。
- **要点**：这是唯一可以合法画"图表之外的结构图"的体系，因为它天然是**示意图而非伪造证据**。

### IS-4 `editorial-collage` 拼贴编辑插画

```
illustration_system: editorial collage illustration, cut-paper shapes,
halftone dot texture at 15% opacity, torn edge accents,
two-color duotone imagery treatment, screen-print misregistration of 1px,
matte paper texture, bold flat shapes, no photographic realism,
no gradients, no glow
```
- **适合**：品牌提案、趋势分析、市场叙事。
- **要点**：纹理要写百分比，否则模型会把纹理糊满整页。

### IS-5 `conceptual-metaphor` 概念隐喻插画

```
illustration_system: conceptual metaphor illustration, one single unambiguous
metaphor rendered as physical objects (not abstract shapes),
flat vector with 2px stroke, three flat colors, isometric or straight-on view,
objects must be concrete recognizable nouns, no abstract floating orbs,
no glowing spheres, no faceless silhouettes, no generic network graphs,
limited to 5 distinct objects maximum
```
- **适合**：封面、章节页、痛点页、结尾页。
- **要点**："concrete recognizable nouns" 这句是关键——它把"成长"这种抽象词逼成一个具体物件（阶梯/年轮/幼苗），而不是一团光。

### IS-6 `data-illustration` 数据可视化插画

```
illustration_system: editorial data illustration, clean flat chart forms,
2px axis strokes, solid color fills for series, direct labeling on the chart
instead of a legend box, generous plot area with thin gridlines at 10% opacity,
rounded bar caps of 2px, no 3D charts, no bevels, no drop shadows on bars,
no gratuitous gradients inside bars
```
- **适合**：数据页、成果页、对比页。
- **要点**：`no 3D charts` 必须写。模型默认爱画 3D 柱状图，这是最典型的"假"。

### IS-7 `hand-sketch` 手绘草图

```
illustration_system: hand-drawn sketch illustration, single-weight ink line
(2px, slight natural wobble), cross-hatching for depth only where needed,
off-white paper background, one accent color used sparingly,
annotations in a consistent handwritten style,
no digital gradients, no glow, no photorealism, no clip-art cleanliness
```
- **适合**：工作坊、共创、早期构想、教学页。

### IS-8 `soft-3d-clay` 柔和 3D 黏土质感

```
illustration_system: soft 3D clay render, matte subsurface material,
single soft key light from upper left, ambient occlusion only (no harsh shadows),
pastel palette from the deck palette, rounded geometry,
no glossy plastic, no chrome, no glass refraction, no lens flare,
plain seamless background, consistent camera focal length across all pages
```
- **适合**：产品介绍、C 端方案、轻松场合。
- **要点**：`consistent camera focal length across all pages` 是整套一致性的保险。
- **警告**：这是最容易滑向"AI 味"的体系，正式汇报不要用。

### ❌ 不要使用的插图体系（这些就是"很假"的来源）

```
abstract gradient mesh, glowing neural network, holographic UI panels,
floating translucent glass cards, particle constellation, digital brain,
blue glowing sphere, circuit-board overlay, binary code rain,
faceless business silhouettes in an office, generic isometric city,
random light trails, lens flare, bokeh dots
```
> 这些不是"风格"，是**没有内容时的填充物**。它们出现在页面上，唯一原因是提示词没给模型一个具体的、必须画出来的物体。

---

## 2. 风格包（12 个）· 每个都含插图体系

> 用法：`[IS-x] × [SP-x]`。例如技术方案 = `IS-2 × SP-04`。

---

### SP-01 Swiss Editorial 瑞士国际主义

**何时用**：学术、研究报告、严肃提案。最不容易翻车的一套。

```
STYLE: Swiss International Typographic Style, editorial grid, photograph-free.
PALETTE: background #FFFFFF, text #111111, secondary text #6B6B6B,
accent #D62828 used on less than 8% of the canvas, one light grey #F2F2F2 for panels.
TYPOGRAPHY: single sans-serif family (Helvetica-like), tight optical letter spacing
on headlines, headline weight bold, body weight regular, headline-to-body size ratio 3:1,
flush-left ragged-right, never centered, never justified.
BACKGROUND: flat matte white, no texture, no gradient, no vignette.
GRID: 12-column grid, 6% outer margin, all elements snapped to the grid,
generous whitespace, max 2 content blocks per page.
ILLUSTRATION: flat vector editorial illustration, uniform 2px stroke, solid fills only,
NO gradients, NO drop shadows, NO 3D, limited to 4 flat colors from the palette,
geometric simplification, clean silhouettes, matte printed look.
MOTIFS: thin horizontal rule, small square index marker, single hairline frame.
FORBIDDEN: gradients, glow, drop shadows, rounded pills, emoji, 3D charts, clip art,
stock photography, centered body text, decorative icons of people or documents.
```

---

### SP-02 Consulting Deck 咨询顾问风（麦肯锡/BCG 感）

**何时用**：领导汇报、战略、商业计划。信息密度高但仍然精致。

```
STYLE: top-tier management consulting presentation, "one message per page" discipline.
PALETTE: background #FFFFFF, deep navy #0B2545 for headlines and chart axis,
mid blue #2E6F9E for primary series, light blue #D6E4F0 for secondary panels,
warm grey #8A8F98 for annotations, accent amber #E8A33D under 5% of canvas.
TYPOGRAPHY: serif headline optional (Georgia-like) with sans-serif body,
headline bold, subheadline 60% of headline size, body 40%,
left aligned, strict baseline alignment, numbers in a tabular figure style.
BACKGROUND: pure white, absolutely no decoration, no border, no texture.
GRID: strict two-column or three-column structure, aligned tops, 5% margin,
every page carries a small footer with a thin rule above it.
ILLUSTRATION: annotated conceptual diagram or flat vector illustration,
2px stroke, 3 flat colors, no gradients, schematic and restrained,
illustration must sit inside the grid, never bleed off the edge.
MOTIFS: thin rule under the headline, small source note in the bottom left,
square-cornered cards with a 1px hairline border and no shadow.
FORBIDDEN: rounded corners above 4px, drop shadows, gradients, icons as bullets,
photographs, decorative backgrounds, illustration that bleeds off the page.
```

---

### SP-03 Apple Keynote 发布会极简

**何时用**：产品发布、品牌故事、需要"高级感"的场合。**一页只讲一件事。**

```
STYLE: premium product launch keynote, cinematic minimalism, one idea per page.
PALETTE: near-black background #0A0A0C, pure white text,
single vivid accent (choose one: #2F6BFF or #FF4D2E or #00C08B),
grey #7A7A80 for secondary text, accent covers under 6% of the canvas.
TYPOGRAPHY: one geometric sans-serif, extremely tight headline tracking,
headline size at least 3.5x body size, body is short (max 25 words),
abundant whitespace, text never fills more than 45% of the canvas.
BACKGROUND: seamless near-black, smooth subtle radial lift of 4% brightness
behind the main visual only, no visible gradient banding, no texture.
GRID: single centered or single left-aligned axis, 8% margins, massive negative space.
ILLUSTRATION: ONE dominant hero visual, occupies 45% to 65% of the canvas,
readable silhouette at thumbnail size, either flat vector with 2px stroke
or a clean isolated 3D object with matte material,
no gradients inside the illustration, no glow, no lens flare, no reflections.
MOTIFS: at most one thin accent line or one small accent dot.
FORBIDDEN: more than one visual per page, gradients in the background,
glow around the illustration, glass morphism panels, screenshots, icons rows.
```

---

### SP-04 Technical Blueprint 技术蓝图

**何时用**：系统架构、工程方案、技术评审。**插图天生合法，不会假。**

```
STYLE: modern engineering blueprint, technical documentation aesthetic.
PALETTE: background #0E1726 deep slate, grid lines #1E3A5F at 25% opacity,
primary stroke #7FB2E5, secondary stroke #4A7BA7, text #E6EDF5,
one status accent #FFB020 for highlighted paths only.
TYPOGRAPHY: monospace for labels and values, sans-serif for prose,
labels are small (60% of body size) and placed adjacent to the element they name,
never a legend box when direct labeling is possible.
BACKGROUND: deep slate with a fine 24px technical grid at 25% opacity,
plus 4px major gridlines at 12% opacity, no noise texture, no vignette.
GRID: 12 columns, 5% margin, elements align to the technical grid.
ILLUSTRATION: isometric line-art technical illustration, 1.5px uniform stroke,
30-degree axonometric projection, no perspective distortion, no shading,
single accent fill on no more than 20% of surfaces, precise parallel hatching
for depth, no gradients, no glow, no lens flare.
MOTIFS: dimension lines with tick ends, small circled numbers, dashed flow paths,
corner brackets.
FORBIDDEN: photorealistic renders, glass morphism, neon glow, 3D perspective,
clip-art icons, gradient fills, drop shadows, decorative people.
```

---

### SP-05 Dark Tech Blue 深色科技（现代版，不赛博）

**何时用**：AI/数据/科技产品，需要深色但不想廉价霓虹。

```
STYLE: contemporary dark-mode technology report, restrained and premium.
PALETTE: background #0F1419, surface #181F27, hairline #2A3540,
text #F2F5F8, secondary text #9AA6B2, primary accent #4C8DFF under 10%,
secondary accent #46D0A0 under 4% for positive status only.
TYPOGRAPHY: one humanist sans-serif, headline semibold, body regular,
body line height 1.6, numbers in tabular figures, left aligned.
BACKGROUND: flat dark surface, one very subtle 8% lighter panel behind content,
no gradient mesh, no glow, no stars, no particles, no noise.
GRID: 12 columns, 5% margin, content in one or two clearly bounded panels.
ILLUSTRATION: flat vector or isometric illustration on dark surface,
2px stroke in light grey, fills from the accent colors at full opacity,
illustration occupies 35% to 55% of the canvas,
strictly limited to 3 colors, no glow, no bloom, no gradient inside shapes.
MOTIFS: 1px hairline panel borders, small square status dots, thin connector lines.
FORBIDDEN: neon glow, purple-blue gradient mesh, holographic panels,
particle constellations, circuit board textures, binary code, glass refraction,
cyberpunk cityscapes, glowing brains.
```

---

### SP-06 Editorial Magazine 杂志编辑风

**何时用**：品牌、文化、人物、行业观察。插图最出彩的一套。

```
STYLE: high-end editorial magazine spread, art-directed and typographically bold.
PALETTE: warm off-white #FAF7F2 background, ink #1A1A1A,
two-color accent pair (e.g. #C8452F + #1F4E79), accent total under 18%,
one tint #E8E1D6 for panels.
TYPOGRAPHY: one high-contrast display serif for headlines (very large, tight leading),
one neutral sans-serif for body, headline may overlap the illustration slightly,
body text in narrow measure (max 45 characters per line),
occasional all-caps letterspaced kicker above the headline.
BACKGROUND: warm off-white with a very subtle 3% paper grain, no gradient.
GRID: asymmetric two-column editorial grid, 6% margin,
one column narrow (38%) one wide (62%), alternately swap sides between pages.
ILLUSTRATION: editorial collage illustration, cut-paper shapes,
halftone dot texture at 15% opacity, torn edge accents,
two-color duotone treatment, screen-print misregistration of 1px,
matte paper texture, bold flat shapes, no photographic realism,
illustration bleeds off at least one edge on 60% of pages.
MOTIFS: oversized drop-cap or numeral, thin rules, kicker labels.
FORBIDDEN: gradients, drop shadows, glossy 3D, stock photos,
centered symmetric layouts, generic icons, glow.
```

---

### SP-07 Geometric Bauhaus 包豪斯几何

**何时用**：创意提案、教育、需要强记忆点的场合。形状即插图。

```
STYLE: Bauhaus-inspired geometric composition, primary-shape vocabulary.
PALETTE: background #F4F1EA, primary red #D93025, primary blue #1A56DB,
primary yellow #F5B301, black #111111, each color under 25% of the canvas.
TYPOGRAPHY: geometric sans-serif, headline in heavy weight,
labels in small letterspaced uppercase, generous leading, strict left alignment.
BACKGROUND: flat warm neutral, no texture, no gradient.
GRID: modular grid where visible shapes ARE the layout structure.
ILLUSTRATION: composition built from circles, semicircles, triangles and bars,
flat solid fills, hard edges, no outlines unless 2px black,
overlapping shapes with 100% opacity (no transparency blending),
the composition itself occupies 40% to 60% of the canvas,
no gradients, no shadows, no gradients, no 3D.
MOTIFS: concentric circles, quarter arcs, thick bars, primary color blocks.
FORBIDDEN: photographs, gradients, drop shadows, rounded organic blobs,
clip art, 3D renders, glow, decorative icons.
```

---

### SP-08 Government Formal 政企庄重（现代化版）

**何时用**：政府、学校、事业单位汇报。保留庄重，去掉土味。

```
STYLE: formal institutional report, dignified, contemporary, restrained.
PALETTE: background #FFFFFF, deep red #A4262C used under 10% of the canvas,
navy #1B3A5C for structure lines and headlines, text #1F2328,
light grey #EEF1F4 panels, gold accent #B08D3F under 3% for emphasis only.
TYPOGRAPHY: one serif or semi-serif for headlines (dignified, no decorative flourishes),
sans-serif body, headline centered ONLY on cover and section divider pages,
body strictly left aligned, no letterspacing on Chinese text.
BACKGROUND: clean white, optional very light grey band behind the headline zone,
no texture, no gradient, no imagery behind text.
GRID: symmetric and stable, 7% margin, three-part vertical rhythm
(header rule, content, footer rule), consistent header on every page.
ILLUSTRATION: flat vector illustration or annotated diagram,
2px stroke, restrained palette, no gradients, no glow,
illustration is placed in a clearly bounded content zone and never bleeds,
subject matter must be concrete and non-documentary
(a diagram of a process, not a fake certificate or emblem).
MOTIFS: thin double rule, small square bullet, subtle five-pointed geometry
used as a graphic accent only if the subject warrants it.
FORBIDDEN: gradients, glow, 3D, cartoon characters, foreign corporate logos,
fake official seals, ribbons, medals, fireworks, national emblems,
photographs of real buildings.
```

---

### SP-09 Academic Journal 学术论文图版

**何时用**：科研、论文答辩、实验报告。

```
STYLE: academic journal figure plate, precise and understated.
PALETTE: background #FFFFFF, text #1A1A1A, series colors
#2C6E9B / #C0504D / #4F8A5B / #8064A2 with consistent meaning across pages,
axis and rule lines #4D4D4D, panel tint #F5F5F5.
TYPOGRAPHY: one serif for prose, one sans-serif for labels and numbers,
figure captions in 70% of body size, all labels adjacent to what they name.
BACKGROUND: pure white, no decoration.
GRID: two-panel or three-panel horizontal arrangement with aligned baselines,
small panel letters (a) (b) (c) in bold in the upper left of each panel.
ILLUSTRATION: annotated mechanism diagram or clean flat chart,
1.5px strokes, no gradients, no drop shadows, no 3D, no glow,
error bars, scale bars and units drawn explicitly where relevant,
schematic clarity valued over visual richness.
MOTIFS: panel letters, scale bars, thin rules, dotted baseline guides.
FORBIDDEN: decorative background, gradients, 3D charts, drop shadows,
clip art, stock photography, glow, rounded playful shapes,
untraceable gauges or invented dashboards.
```

---

### SP-10 Vivid Roadshow 活力路演

**何时用**：创业路演、市场故事、增长叙事。插图最大、最有动势。

```
STYLE: energetic startup roadshow, confident and image-led.
PALETTE: background #FFFFFF or #0B1220 (pick one and hold it),
primary #2F6BFF, secondary #00C2A8, warm accent #FF7A3D under 8%,
text #0D1117, tint #EAF0FF.
TYPOGRAPHY: bold geometric sans-serif, oversized headlines,
key numbers at 4x body size, short punchy lines, left aligned.
BACKGROUND: flat, one large soft color field behind the main visual
at 8% opacity maximum, no gradient mesh, no glow, no texture.
GRID: dynamic asymmetry, one dominant visual zone at 50% to 65% of the canvas,
text in the remaining band, intentionally uneven column widths.
ILLUSTRATION: flat vector scene illustration with 2px stroke,
3 to 4 flat colors, clear action and direction,
characters drawn as simplified geometric figures with no facial detail,
one dominant illustration per page, no gradients, no glow, no 3D,
no realistic human faces, no photographic scenes.
MOTIFS: directional arrows as thick flat shapes, upward progression bars,
one accent underline.
FORBIDDEN: clip-art people, emoji, gradients, glow, glass panels,
3D charts, stock photography, more than one illustration per page.
```

---

### SP-11 Riso Duotone 孔版双色印刷

**何时用**：文化、设计、年轻品牌、需要强烈统一感的整套输出。

```
STYLE: risograph two-color print, tactile and consistent.
PALETTE: paper #F7F3EC, ink A #1F4E79, ink B #E4572E,
overprint areas where the two inks meet appear as a third blended tone,
at most 3 visible tones on the entire page.
TYPOGRAPHY: one bold grotesque for headlines, one regular for body,
slight ink-spread feel on large type, left aligned, tight leading.
BACKGROUND: uncoated paper color with 4% grain, no white.
GRID: poster-like grid, 6% margin, large type locked to the grid.
ILLUSTRATION: single-weight line illustration or solid silhouette shapes,
printed with visible 1px misregistration between the two ink layers,
coarse halftone dots at 20% density in mid-tones,
one dominant illustration at 40% to 60% of the canvas,
no gradients (halftone replaces gradients), no shadows, no 3D.
MOTIFS: halftone dot fields, registration marks, overprinted overlaps.
FORBIDDEN: full-color photography, gradients, glossy highlights,
drop shadows, neon, more than 3 tones.
```

---

### SP-12 Soft Clay 柔和黏土（轻松场合）

**何时用**：内部培训、C 端产品、儿童教育、轻松向汇报。

```
STYLE: friendly soft 3D clay illustration, approachable and rounded.
PALETTE: background #F6F1EA, clay bodies in muted pastels
#E8A87C / #8FBF9F / #7FA8D9 / #D9A5B3, text #3A3A3A,
each clay object uses exactly one body color.
TYPOGRAPHY: rounded humanist sans-serif, semibold headlines, generous leading.
BACKGROUND: flat warm neutral, no gradient, no texture, no floor plane.
GRID: centered or single-axis left, 8% margin, plenty of air.
ILLUSTRATION: soft 3D clay render, matte subsurface material,
single soft key light from upper left, ambient occlusion only,
rounded geometry, no glossy plastic, no chrome, no glass,
plain seamless background, consistent camera focal length across all pages,
one to three clay objects per page forming one composition,
occupying 40% to 60% of the canvas.
MOTIFS: rounded pill labels, soft circular shadows directly under objects
(contact shadow only, 20% opacity).
FORBIDDEN: glossy materials, chrome, glass refraction, lens flare,
photorealistic humans, gradients in the background, cluttered props,
inconsistent camera angle between pages.
```

---

## 3. 三层组合用法（直接抄）

```
[插图体系] + [风格包] + [版式] + [插图面积合同] + [禁止项]

示例（技术方案正文页）：
IS-2 isometric-line-tech
× SP-04 Technical Blueprint
× L-05 Left-text-right-visual
× "the illustration occupies 50% of the canvas width and 78% of its height"
× "no glow, no gradient fills, no 3D perspective, no clip-art icons"
```

**必须每次都带上"插图面积合同"**（见 `03-插图手册-Illustration-Playbook.md`），否则模型会把插图缩到 15% 当装饰图标用。

---

## 4. 一致性地板（整套图不跑偏的保险）

无论选哪个风格包，都要在**每一页**重复这几句，才能保证 12 页像一套：

```
CONSISTENCY LOCK (repeat on every page):
same typeface family, same headline weight, same headline-to-body size ratio,
same outer margin, same header and footer treatment,
same illustration style, stroke weight, and color set,
same background treatment, same corner radius, same shadow policy.
Vary only: layout silhouette, illustration size and placement, content density.
```

---

## 5. 与现有项目的映射

| 本文件 | 现有项目 | 差异 |
| --- | --- | --- |
| SP-01 Swiss | 无 | 新增 |
| SP-02 Consulting | 近似 `minimal-academic` | 补插图体系 |
| SP-03 Keynote | 无 | 新增 |
| SP-04 Technical Blueprint | 近似 `blue-purple-ai` | 换成蓝图语言，去掉神经网络 |
| SP-05 Dark Tech | 近似 `blue-gold-tech` | 去霓虹 + 去渐变 |
| SP-06 Editorial | 无 | 新增 |
| SP-07 Bauhaus | 无 | 新增 |
| SP-08 Government | 对应 `red-white-government` | 现代化 + 禁伪造印章 |
| SP-09 Academic | 对应 `minimal-academic` | 补图表与标注规范 |
| SP-10 Roadshow | 对应 `vivid-roadshow` | 禁 clip-art 与假照片 |
| SP-11 Riso | 无 | 新增 |
| SP-12 Soft Clay | 无 | 新增 |

**关键差异**：现有 7 个风格包**全部没有 `illustration_system`**，且 `forbidden` 里只写了"不要卡通""不要霓虹"这类模糊词，没有写死线宽、色数、是否渐变。这就是同一套风格包在不同页面出来的插图质量波动很大的原因。
