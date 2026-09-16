# visual_identity.json

## 职责

定义整套图最终看起来是什么风格。它是组图的一致性底盘。

## ⚠️ 字段名必须与后台读取的键完全一致

`scripts/deck-generation-worker.mjs:3006-3013` 按固定键名读取本文件产出的 JSON。**键名写错等于这个字段不存在**，后台拿到的是空对象，图片模型收到一句"请遵循某个空字段"。

| 后台读取的键（`deck-generation-worker.mjs`） | 必须用的字段名 |
| --- | --- |
| `identity.palette \|\| identity.colors`（:3006） | `palette` |
| `identity.typography \|\| identity.type_system`（:3007） | `typography` |
| `identity.background \|\| identity.background_system`（:3008） | `background_system` |
| `identity.header_footer \|\| identity.headerFooter`（:3009） | `header_footer` |
| `identity.card_system \|\| identity.cards \|\| identity.geometry`（:3010） | `card_system` |
| `identity.motifs \|\| identity.decorative_elements`（:3011） | `motifs` |
| **`identity.image_language \|\| identity.imagery`（:3012）** | **`image_language`** |
| `identity.spacing \|\| identity.grid`（:3013） | `spacing` |

同时 `:3576` 明确要求图片模型按这些字段保持一致：

> Use the global_style_fingerprint consistently for palette, typography feel, background, header/footer, card chrome, motifs, grid, and **image language**.

**所以下面这 8 个字段一个都不能少、一个都不能改名。**

## JSON 结构

```json
{
  "style_name": "",
  "palette": {
    "background": "#0B1F3A",
    "surface": "#13294B",
    "text_primary": "#F8FBFF",
    "text_secondary": "#9FB3C8",
    "accent_primary": "#2F80ED",
    "accent_secondary": "#F4B740",
    "accent_area_rule": "强调色合计不超过画面 8%"
  },
  "background_system": "",
  "layout_system": "",
  "card_system": "",
  "typography": "",
  "motifs": ["", ""],
  "image_language": {
    "style": "",
    "stroke": "",
    "fills": "solid flat fills only",
    "gradients": "forbidden",
    "shadows": "forbidden",
    "color_count": 4,
    "view": "",
    "complexity": "",
    "material": "",
    "subject_rule": "concrete nouns from the page content; abstract nouns are not valid subjects",
    "forbidden_motifs": ["", ""]
  },
  "header_footer": "",
  "spacing": "",
  "forbidden": ["", ""]
}
```

## 规则

### 通用

- `palette` 必须稳定，最多 5 个主色，并写出每个颜色的**职责**与**面积上限**。只写色值不写职责，模型会平均使用所有颜色。
- `background_system` 描述背景材质、光感、纹理和深浅。
- `layout_system` 描述标题区、内容区、主视觉区和留白。
- `card_system` 描述卡片圆角、描边、阴影、透明度。
- `typography` 描述字体气质、标题与正文的字号比、字重与字距。
- `spacing` 描述页边距、栏数、网格与留白比例。
- `header_footer` 描述页眉页脚的位置、内容与节奏。
- `motifs` 是可复用装饰元素，不能每页换一套。
- `forbidden` 必须写清楚不要出现的风格漂移。

### `image_language`（插图体系）—— 必须填写，不能留空

这是**整套图"插图长什么样"的唯一合同**。它为空时，图片模型只能用训练数据里的默认审美填空，产出渐变球、发光网格、半透明玻璃面板这类与内容无关的填充物。

- `style`：具体插画语言，必须点名一种明确画法，例如
  `flat vector editorial illustration` / `isometric line-art technical illustration` /
  `annotated technical cutaway diagram` / `editorial collage illustration`。
  **不要写 `modern`、`clean`、`premium`、`科技感` 这类形容词**——它们不是画法。
- `stroke`：线宽与是否统一，例如 `uniform 2px stroke, consistent across all elements`。
- `fills` / `gradients` / `shadows`：固定写 `solid flat fills only` / `forbidden` / `forbidden`。渐变与投影是"假"的主要来源，禁用后模型必须靠形体取胜。
- `color_count`：插图允许使用的平涂色数（建议 3–5），写死之后模型不会靠调渐变凑层次。
- `view`：视角，例如 `straight-on orthographic, consistent across all pages` 或
  `isometric 30-degree axonometric, no perspective distortion`。视角漂移是整套图显得不专业的主要隐形原因。
- `complexity`：复杂度上限，例如 `no more than 5 distinct objects, no more than 2 levels of depth`。
- `material`：材质，例如 `matte printed finish, flat ink coverage, no specular highlight`。
- `subject_rule`：主体规则。**必须要求"具体名词"**。抽象名词（growth / innovation / synergy / future）不是有效的插图主体，模型只能把它们画成通用装饰。
- `forbidden_motifs`：逐条列出禁止出现的默认填充物，建议直接采用：
  `glowing spheres`、`gradient mesh backgrounds`、`neural-network node graphs`、
  `circuit board traces`、`binary code`、`holographic UI panels`、
  `floating translucent glass cards`、`particle constellations`、`lens flare`、
  `light trails`、`abstract swirling ribbons`、`digital brains`、`robot hands`、
  `faceless business silhouettes`、`generic isometric cities`。

### 与真实性强规则的关系

`advanced-single-slide-director/references/evidence-and-authenticity.md` 禁止伪造证书、合同、报告、机构招牌、客户现场和真人照片，**这条绝对规则不受本文件影响**。

`image_language` 的作用是给出那个被漏掉的出口：**画成一眼就能看出是"画"的插画**。因此 `image_language.style` 必须指向明确非写实的画法，并在每次成图时声明：

```
Legal frame: this is a clearly conceptual, non-documentary illustration.
It is not a photograph, screenshot, certificate, record or real event.
Render it so it cannot be mistaken for documentary evidence.
```
