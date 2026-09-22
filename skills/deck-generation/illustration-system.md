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

本文件同时服务两条链路：**生成 PPT** 与 **美化 PPT**。区别只在于"面积数字写在哪里"：

- **生成 PPT**：写进 `composition` 与 `main_visual_brief`（后台的 `normalizePlan` 是严格白名单，只有这几个自由文本字段会到达图片模型）。
- **美化 PPT**：直接写进本次单页提示词即可。

两条链路都必须给出面积数字，否则模型会把插图压成装饰角标。

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
  - ✅ `a documentary photograph of a technician in a hi-vis vest inspecting a damaged overhead power line with a handheld device, overcast daylight, real field conditions`
- **如果一个页面写不出 3 个具体名词**，说明它应该是图表页或数据表页——那就明确声明它是，而不是画一团装饰。

### 4. 画面语言（禁止留空）——**默认写实**

**默认走写实路线。** 用 `visual_identity.image_language` 指定，按页面内容二选一：

**A. 写实影像（默认，适用于设备、现场、产品、工艺、实验、场景）**

```
rendering:      photorealistic documentary photograph, shot on location, not a designed image
lighting:       natural available light, slight unevenness, realistic shadow falloff
materials:      real material texture — metal, concrete, fabric, cable, worn surfaces, dust
camera:         35mm-equivalent field of view, eye-level or slightly low, restrained framing
depth:          shallow depth of field on the subject, background readable but not busy
finish:         true-to-life color, subtle grain, no heavy retouching
subject_rule:   concrete nouns from page content; abstract nouns are not valid subjects
```

**B. 技术图解（仅当页面在讲机制、结构、流程、数据时使用）**

```
rendering:      technical diagram or annotated sectional view, engineering-drawing discipline
line:           fine precise lines, uniform weight, measured spacing
depth:          flat or isometric, consistent across the whole deck
labels:         5–8 direct callouts with leader lines, all traceable to confirmed facts
```

两条路线都**必须**遵守：

```
view:           同一视角贯穿整套（写实类固定机位与焦段；图解类固定等距角度）
consistency:    全套共用同一镜头语言 / 同一制图规范，逐页重申
```

**绝对不要出现**：卡通、扁平矢量吉祥物、Q 版、厚描边描边插画、纸片剪贴、发光渐变球、通用图标拼贴。
**"写实"不等于"假精致"**：不要影棚灯光、不要商业摆拍、不要过度磨皮的塑料感，那反而更假。

> ⚠️ 写实渲染的边界（与真实性硬规则一致，必须逐页重申）：
> **可以**写实描绘设备、工具、线缆、机械结构、自然环境、工艺流程、概念场景。
> **不可以**生成伪造的公文（证书、合同、检测报告、专利页、盖章文件、软件截图）、
> 可识别的机构招牌与 logo、以及可辨认的真实人物肖像。
> 写实画面表达的是"这个概念/装置长什么样"，**不是**"这是我们现场的实拍记录"。


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
POSITIVE: one dominant visual; a concrete recognizable subject taken from this page's content;
photorealistic and true to life by default — real materials, natural light, honest textures;
if the page is a mechanism or process, a precise technical diagram instead;
full-bleed or edge-anchored so it reads large; silhouette readable at 25% zoom;
restrained color; no decorative filler.
```

### 负向（每页都要有）

```
NEGATIVE — never include: cartoon, flat vector mascot, chibi, cel-shaded or thick-outline
illustration, paper-cut collage, clip art, emoji, cute character art, glossy 3D plastic look,
glowing spheres, gradient mesh backgrounds, neural-network node graphs, circuit board traces,
binary code, matrix rain, holographic UI panels, floating translucent glass cards,
glassmorphism, frosted glass, particle constellations, sparkles, lens flare, bokeh,
light trails, abstract swirling ribbons, digital brains, cyberpunk cities,
faceless business silhouettes in offices, generic isometric cities,
studio-staged stock-photo posing, over-retouched plastic skin, heavy vignette,
3D beveled charts, chrome, neon outlines, watermark, model signature,
readable certificates, contracts, reports, patent pages, invoices, official stamps,
official logos, institution signage, real brand marks, QR codes,
identifiable portraits of real people, fake software screenshots or dashboards.
```

**注意最后三条与写实的关系**：写实**可以**画设备、现场、线缆、机械、自然环境；
**不可以**画成公文、公章、可识别机构招牌或真人肖像——那三类是"声明"而不是"画面"。

**自检句（写进提示词）**：

```
For every element, state in one clause what information it carries.
If it carries none, remove it.
```

---

## 四、真实性边界（写实路线下的红线）

真实性规则禁止伪造**公文与身份类证据**——这一条绝对有效，不受本文件影响。

写实路线放开的只是"画面的质感"，**没有放开"伪造证据"**。两者必须分清：

| 可以写实描绘 | 绝不可以生成 |
| --- | --- |
| 设备、工具、线缆、机械结构、零部件 | 证书、合同、检测报告、专利页、盖章文件 |
| 自然环境、天气、作业场地氛围 | 可识别的机构招牌、校名、logo、铭牌 |
| 工艺流程、装配过程、概念场景 | 可辨认的真实人物肖像、真人合影 |
| 通用仪表、通用软件界面轮廓 | 仿真软件截图、假数据看板、假订单、假发票 |

**可以写实，但不能把生成画面说成"实拍记录"。** 每页重申这句：

```
Rendering frame: this is a realistic rendering that communicates what the subject looks like.
It is not a documentary record of a specific real event, site, or person.
Never render official documents, seals, institution signage, logos, or identifiable portraits.
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
