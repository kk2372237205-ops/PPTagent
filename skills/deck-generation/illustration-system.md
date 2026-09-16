# Illustration System

本文件是**插图的可执行规则**，用于修补三个已确认的产出缺陷：插图过小、几乎没有插图、插图很假。

长版参考（版式库、风格包、外部资源）在仓库根目录 `PPTskills汇总/`，本文件只保留**必须进入提示词的部分**。

---

## 一、三个缺陷的成因（一句话版）

| 缺陷 | 成因 |
| --- | --- |
| 插图过小 | 提示词只描述"画什么"，从不规定"占多大"。 |
| 几乎没有插图 | 规则允许"0 个画面单元"，且禁令远多于正向要求，模型选了最省事的合规解。 |
| 插图很假 | 没有插画语言，模型只能用默认审美填空：渐变球、发光网格、玻璃面板、通用图标。 |

---

## 二、插图合同（每一页都必须满足）

把下面这段作为 `visual_identity.image_language` 的落地要求，并**用散文形式写进 `composition` 与 `main_visual_brief`**（只有这两个字段会到达图片模型）。

### 1. 面积

- 正文页插图面积 **不得低于 25%**；一般正文页 35–55%；机制/场景/对比页 45–70%。
- 封面 55–100%；结尾页 35–60%。
- 插图必须是页面上**最大的单一元素**，高度跨度不低于画布高度的 **75%**。
- **至少出血一条边。** 出血是让插图显大的最低成本手段。
- 面积规则见 `slide-image-specs.md`；整套节奏见 `advanced-layout-profiles.md`。

### 2. 数量

- **默认 1 个主导画面单元。** 只有内容确实是并列的多阶段、多对比时才增加到 2–3 个。
- 3 个各占 8% 的小图，效果远差于 1 个占 45% 的主画面。
- 禁止用一排小图标代替一个主画面：把 5 个 1% 的图标合并成 1 个 40%+ 的插图。

### 3. 主体必须是具体名词

- 每个插图 brief 至少包含 **3 个具体名词**。
- `growth`、`innovation`、`synergy`、`future`、`科技感`、`高级感` **不是有效的插图主体**。
- 正确写法示例：
  - ❌ `an illustration about digital transformation`
  - ✅ `a flat vector illustration of a paper document feeding through a scanner with two visible rollers, three lines of text on the page, and a tray of finished pages`
- **如果一个页面写不出 3 个具体名词**，说明它应该是图表页或数据表页——那就明确声明它是，而不是画一团装饰。

### 4. 插画语言（禁止留空）

使用 `visual_identity.image_language`：

```
style:          具体画法，例如 flat vector editorial illustration /
                isometric line-art technical illustration /
                annotated technical cutaway diagram
stroke:         uniform 2px, consistent across all elements
fills:          solid flat fills only
gradients:      forbidden
shadows:        forbidden
color_count:    3–5 flat colors from the deck palette
view:           straight-on orthographic OR isometric 30-degree, consistent across all pages
complexity:     no more than 5 distinct objects, no more than 2 levels of depth
material:       matte printed finish, flat ink coverage, no specular highlight
subject_rule:   concrete nouns from page content; abstract nouns are not valid subjects
```

**视角必须在整套图里保持一致。** 一页正面、一页斜 45°、一页带透视，观感立刻散。
**`view` 与 `style` 每页都要重申**，否则模型会逐页漂移。

### 5. 文字与插图的比例

- 插图面积 ≥ 70%：正文 ≤ 25 词，1 个文字块。
- 插图面积 55–69%：正文 ≤ 45 词，≤ 2 个文字块。
- 插图面积 45–54%：正文 ≤ 70 词，≤ 3 个文字块。
- **空间不够时删文字，不缩插图。**

### 6. 让插图承担信息

- 插图必须展示本页正文描述的具体机制/对比/流程。
- 插图上每个标注部件，都要对应正文里的一个具名元素。
- **不要画正文没有提到的任何物体。**

---

## 三、正负配对（必须同时给出）

只给负面清单，画面会变空；只给正面要求，画面会变花。**两段必须同时出现。**

### 正向（每页都要有）

```
POSITIVE: one dominant illustration; flat solid fills; uniform stroke weight;
a concrete recognizable subject drawn from this page's content;
silhouette readable at 25% zoom; generous internal negative space;
matte printed finish.
```

### 负向（每页都要有）

```
NEGATIVE — never include: glowing spheres, gradient mesh backgrounds,
neural-network node graphs, circuit board traces, binary code, matrix rain,
holographic UI panels, floating translucent glass cards, glassmorphism,
frosted glass, particle constellations, sparkles, lens flare, bokeh,
light trails, abstract swirling ribbons, digital brains, robot hands,
cyberpunk cities, faceless business silhouettes in offices,
generic isometric cities, stock-photo people, clip art, emoji, cartoon mascots,
3D beveled charts, glossy plastic, chrome, reflective surfaces, drop shadows,
neon outlines, watermark, model signature, paper grain, noise texture,
readable certificates, contracts, reports, patent pages, invoices,
official logos, institution signage, real brand marks, QR codes,
photorealistic depictions of real campuses, labs, factories or customers.
```

**自检句（写进提示词）**：

```
For every decorative element, state in one clause what information it carries.
If it carries none, remove it.
```

---

## 四、合法性框架（让插图不违反真实性硬规则）

真实性规则禁止伪造证书、合同、报告、机构招牌、客户现场和真人照片——**这一条绝对有效，不受本文件影响**。

本文件补上它一直缺失的那个出口：**画成一眼就能看出是"画"的插画。**

```
Legal frame: this is a clearly conceptual, non-documentary illustration.
It is not a photograph, screenshot, certificate, record or real event.
Render it so it cannot be mistaken for documentary evidence.
```

**两类东西必须分开，不能混在同一批禁令里：**

| 绝对禁止 | 要求绘制 |
| --- | --- |
| 伪造证书、合同、报告、专利页、试验记录 | 概念插画 |
| 伪造客户现场、真实校园照片 | 机制示意图 |
| 伪造机构招牌、校徽、真人肖像 | 隐喻场景、几何构成 |
| 伪造数据看板、仿真截图 | 标注式原理图、剖面图 |

混在一起的后果是模型一刀切：**全不画。**

---

## 五、成图后自检（30 秒）

| 检查项 | 不合格的样子 | 补哪一条 |
| --- | --- | --- |
| 面积 | 目测 < 25%，像装饰角标 | 二.1 |
| 出血 | 四周有边距，像卡片里的小图 | 二.1 |
| 缩略图可辨认 | 25% 缩放下看不出画的是什么 | 二.1 / 二.3 |
| 具体性 | 只有球、网格、光、丝带 | 二.3 |
| 渐变/发光 | 有明显发光边缘或渐变过渡 | 二.4 |
| 色数 | 数一数超过 5 种颜色 | 二.4 |
| 视角一致 | 上一页正面，这一页斜视 | 二.4 |
| 与文字的关系 | 把插图换成别的图也不影响理解 | 二.6 |
| 像不像证据 | 一眼像官方文件或真实照片 | 四 |
| 整套节奏 | 前后页插图忽大忽小 | 二.1 / 版式档位 |
