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
    "rendering": "photorealistic documentary photograph",
    "lighting": "",
    "materials": "",
    "camera": "",
    "depth": "",
    "finish": "",
    "view": "",
    "subject_rule": "concrete nouns from the page content; abstract nouns are not valid subjects",
    "forbidden_motifs": ["cartoon", "flat vector mascot", "clip art", ""]
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

- `rendering`：**画面路线，默认写实**。二选一：
  - `photorealistic documentary photograph`（设备、工具、现场、工艺、产品、自然环境）
  - `technical diagram or annotated sectional view`（只在页面讲机制、结构、流程、数据时用）
  **不要写 `modern`、`clean`、`premium`、`科技感` 这类形容词**——它们不是画法。
  **绝对不要写 `flat vector`、`cartoon`、`illustration-style`**——那会得到卡通风，与"严谨、实事求是"相反。
- `lighting`：写实类必填，例如 `natural available light, slight unevenness, realistic shadow falloff`。
  不要 `studio lighting`、不要 `commercial beauty light`——那会显得摆拍。
- `materials`：写实类必填，点名真实材质：`metal, concrete, fabric, cable, worn surfaces, dust`。
- `camera`：写实类必填，例如 `35mm-equivalent field of view, eye-level, restrained framing`。
  **整套固定同一机位与焦段**，否则每页像不同人拍的。
- `depth`：景深与层次，例如 `shallow depth of field on the subject, background readable but not busy`。
- `finish`：例如 `true-to-life color, subtle grain, no heavy retouching`。
  **不要"过度磨皮的塑料感"**——那比扁平更容易显得假。
- `color_count`：整套配色仍受 `palette` 约束（写实不等于放开配色）。
- `view`：视角。写实类＝固定机位与焦段；图解类＝固定等距角度。
  视角漂移是整套图显得不专业的主要隐形原因。
- `subject_rule`：主体规则。**必须要求"具体名词"**。抽象名词（growth / innovation / synergy / future）不是有效的画面主体，模型只能把它们画成一团装饰。
- `forbidden_motifs`：逐条列出禁止出现的默认填充物，建议直接采用：
  `cartoon`、`flat vector mascot`、`chibi`、`cel shading`、`clip art`、`paper-cut collage`、
  `glowing spheres`、`gradient mesh backgrounds`、`neural-network node graphs`、
  `circuit board traces`、`binary code`、`holographic UI panels`、
  `floating translucent glass cards`、`particle constellations`、`lens flare`、
  `light trails`、`abstract swirling ribbons`、`digital brains`、
  `faceless business silhouettes`、`generic isometric cities`、`studio-staged posing`。

### 与真实性强规则的关系

`advanced-single-slide-director/references/evidence-and-authenticity.md` 禁止伪造**公文与身份类证据**（证书、合同、检测报告、专利页、盖章文件、机构招牌、logo、可辨认真人），**这条绝对规则不受本文件影响**。

写实路线放开的只是**画面质感**，没有放开**伪造证据**。所以 `image_language.rendering` 走写实，同时每页重申这句：

```
Rendering frame: this is a realistic rendering that communicates what the subject looks like.
It is not a documentary record of a specific real event, site, or person.
Never render official documents, seals, institution signage, logos, or identifiable portraits.
```

