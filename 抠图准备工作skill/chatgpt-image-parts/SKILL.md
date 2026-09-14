---
name: chatgpt-image-parts
description: Create cutout-friendly ChatGPT image-generation instructions for decomposing uploaded flat design images into separate reusable picture parts. Use when the user uploads or references PNG, JPG, WebP, PPT cover images, posters, web visuals, promotional graphics, composite images, or screenshots and asks to split them into components, materials, PPT-ready assets, reusable image parts, or elements convenient for manual cutout. This skill preserves text as image, separates artistic lettering, white text, glowing text, calligraphy, small details, objects, decorations, effects, and useful background fragments, avoids redesign, and requires each part to use a plain matte background with strong color contrast for later one-click background removal.
---

# ChatGPT Image Parts

## Goal

Turn a flat image into a detailed decomposition plan and per-part ChatGPT image-generation prompts. The user wants independent picture materials, not editable text, PPT text boxes, vector reconstruction, or a redesigned full poster.

The core output is a set of high-fidelity, standalone image parts. Consider every visible element with reuse value, including text, artistic lettering, white text, glowing text, calligraphy, objects, decorations, effects, and useful background fragments.

## Core Rules

- Treat every element as an image asset.
- Treat all text as image, including main titles, subtitles, small text, numbers, English, labels, logo text, artistic lettering, calligraphy, brush lettering, outline text, metallic text, gradient text, white text, black text, and glowing text.
- Do not suggest that the user retype text unless they explicitly ask for editable text.
- Do not convert text into PPT text boxes.
- Do not prioritize PPT shape reconstruction.
- Do not regenerate one complete cover, poster, or composite image as the main result.
- Do not change theme, style, palette, composition, typography, lighting, or visual language.
- Do not add elements that are absent from the original image.
- Do not add card frames, outline frames, display borders, rounded panels, decorative bases, or new embellishments.
- Put each part on a cutout-friendly plain matte background by default.
- Make the background a functional cutout aid, not a design choice.
- For text, artistic lettering, white text, glowing text, and translucent effect text, choose a background that preserves both the letter body and the weakest edge detail.
- State flat-image limits honestly: PNG/JPG/WebP uploads usually do not contain real source layers, so perfect source-layer recovery cannot be guaranteed.

## User Intent

Interpret phrases like these as a request for picture-part decomposition:

- "拆成 PPT 组件"
- "拆成素材"
- "方便我抠图"
- "每个细节都拆出来"
- "字就是字，背景就是背景"
- "艺术字也要抠出来"
- "白色字也要抠出来"
- "特效字也要保留效果"
- "我后面自己 P 图"
- "全部当图片"
- "不要让我重新打字"
- "我只要零件图"
- "后续我自己再抠图"

Understand the real goal as: produce a set of separate picture materials that the user can later cut out, edit, and place into PPT.

## Output Strategy

Organize the answer around image parts. Each part should be:

- standalone;
- clear and high resolution;
- as complete as possible;
- faithful to the original style, color, lighting, texture, and detail;
- free of unrelated elements;
- free of added frames, cards, panels, bases, or decorations;
- placed on a plain matte background with obvious color contrast;
- suitable for later one-click background removal or manual cutout.

## Cutout-Friendly Background Rules

Every generated part should use a plain matte background that helps later cutout software separate the subject.

The background must be:

- solid color;
- matte;
- textureless;
- patternless;
- shadowless;
- reflection-free;
- glare-free;
- particle-free;
- clutter-free;
- clearly different from the subject color;
- surrounded by enough blank space;
- not touching or swallowing the subject edge.

Do not use:

- gradients;
- misty or complex soft backgrounds;
- texture;
- paper grain;
- rice-paper texture;
- technology backgrounds;
- dreamlike backgrounds;
- light effects;
- particles;
- shadows;
- reflections;
- decorative scenes;
- card backgrounds;
- rounded panels;
- display panels;
- glowing bases;
- colors close to the subject;
- backgrounds that swallow text strokes, glow edges, brush texture, dry-brush gaps, or translucent edges.

## Text And Effect Text Rules

Text parts must also use cutout-friendly solid matte backgrounds.

For normal text, artistic lettering, calligraphy, brush lettering, white text, black text, metallic text, glowing text, and translucent effect text:

- Preserve the text as a complete image material.
- Do not ask the user to retype it.
- Do not convert it into editable PPT text.
- Choose a background clearly different from the letter body.
- If the text has glow, soft light, outer glow, smoke, or translucent edges, choose a background clearly different from those edge effects too.
- Keep the thinnest strokes, weakest edges, faintest glow, dry-brush texture, rough brush edges, broken ink, and small text readable.
- Do not use rice-paper texture, ink texture, technology texture, light-effect backgrounds, gradient backgrounds, or decorative backgrounds to "showcase" text.
- Use the background only to support later cutout, not to beautify the part.

## Background Color Selection

Choose background color by subject color and edge readability.

For dark subjects, use light gray, warm off-white, or pale blue-gray solid matte backgrounds.

For light subjects, use dark gray, dark blue-gray, black-gray, or dark purple-gray solid matte backgrounds.

For white text, white artistic lettering, or white line art, use dark gray, dark blue-gray, or black-gray solid matte backgrounds. Do not use white, light gray, off-white, pale blue, or any light background that swallows white edges.

For black text, black line art, or dark icons, use light gray, warm off-white, or pale blue-gray solid matte backgrounds. Do not use dark gray, black, dark blue, or any background that swallows dark edges.

For gold subjects, gold artistic lettering, or gold decorations, use dark blue, dark gray, or deep green solid matte backgrounds.

For metallic or gradient text, choose a neutral solid matte background that separates from both the lightest and darkest parts of the lettering. Prefer dark blue-gray, black-gray, or neutral gray.

For glowing or effect text, choose by glow color:

- white glow: dark gray, dark blue-gray, or black-gray;
- blue glow: dark gray, black-gray, or dark purple-gray;
- gold glow: dark blue, dark gray, or deep green;
- red glow: neutral light gray or dark gray;
- purple glow: dark gray or black-gray.

Avoid same-hue high-saturation backgrounds that merge with the glow.

For brush lettering or calligraphy:

- dark ink: light gray, warm off-white, or pale blue-gray;
- light calligraphy: dark gray, dark blue-gray, or black-gray;
- never use rice-paper texture, ink texture, gradient, ornament, or any complex background that interferes with dry-brush gaps and rough edges.

For small text:

- separate it when visible;
- keep it high resolution;
- give it extra blank space;
- use strong contrast between background and strokes;
- never allow the background to swallow strokes;
- avoid blur caused by over-scaling.

For colorful complex subjects, use neutral light gray or neutral dark gray solid matte backgrounds, whichever creates clearer subject edges.

For light effects, smoke, mist, or translucent elements, use dark gray, black-gray, or dark blue-gray solid matte backgrounds that reveal the transparent edge without becoming visually complex.

Background color must serve cutout clarity, not visual beauty.

## Workflow

### 1. Confirm The Task

Briefly confirm that the task is picture-part decomposition, not editable text, PPT reconstruction, or redesign.

Use this wording when appropriate:

```text
明白，你要的是“图片零件拆解”，不是可编辑文字，也不是重新设计整张图。

我会把原图里的文字、艺术字、白色字、特效字、物体、装饰、光效、背景局部都尽量当作图片素材拆出来。每个素材尽量高清清晰，并放在与主体颜色明显不同的纯色哑光背景上。背景必须无纹理、无图案、无阴影、无反光、无光斑、无粒子、无杂物，方便你后续自己二次抠图和放进 PPT。

下面先给出这张图的零件拆解清单。
```

### 2. Inspect The Image

Identify actual visible elements instead of applying a fixed template:

- what text exists;
- what artistic lettering exists;
- what white text, glowing text, or translucent effect text exists;
- what main subjects exist;
- what decorations exist;
- what effects exist;
- what useful background fragments exist;
- what small details exist;
- which elements can be separated independently;
- which elements are occluded, blended, translucent, or fused;
- whether each element needs a light or dark contrast background.

### 3. Produce A Decomposition Table

Create a table based on actual image contents:

| 编号 | 零件名称 | 类型 | 内容说明 | 输出形式 | 背景 |
| --- | --- | --- | --- | --- | --- |
| 01 | 主标题艺术字 | 文字图片 | 原图主标题 | 高清图片 | 与文字本体和特效边缘明显不同的纯色哑光背景 |
| 02 | 副标题 | 文字图片 | 原图副标题 | 高清图片 | 与文字颜色明显不同的纯色哑光背景 |
| 03 | 小字 | 文字图片 | 原图说明小字 | 高清图片 | 与笔画颜色明显不同的纯色哑光背景 |
| 04 | 主体对象 | 主体图片 | 核心视觉物体 | 高清图片 | 与主体颜色明显不同的纯色哑光背景 |
| 05 | 装饰线条 | 装饰图片 | 原图装饰线 | 高清图片 | 与线条颜色明显不同的纯色哑光背景 |
| 06 | 光效元素 | 特效图片 | 原图光晕/粒子 | 高清图片 | 能看清半透明边缘的深色纯色哑光背景 |

Add or remove rows according to the image. Do not force this exact template.

### 4. Split Finely

Do not stop at broad groups like "text", "background", and "subject". Split separately whenever the element has independent reuse value:

- main title;
- subtitle;
- small text;
- each artistic lettering group;
- each effect-text group;
- each icon;
- each important decorative line;
- each ornament;
- each main object;
- each group of effects;
- each foreground mask or overlay;
- each useful background fragment.

### 5. Write Per-Part Generation Prompts

For every listed part, write a prompt that can be pasted into ChatGPT image generation. Use this structure:

```text
请从用户上传的原图中提取【零件名称】作为单独图片素材。

要求：
1. 只保留【零件名称】本身；
2. 不要包含其他无关元素；
3. 不要重新设计；
4. 不要添加原图没有的新元素；
5. 保持原图的颜色、风格、光影、质感和细节；
6. 输出为高清、清晰、独立的图片素材；
7. 背景使用与主体颜色明显不同的纯色哑光背景；
8. 背景必须干净平整，无纹理、无图案、无渐变、无阴影、无反光、无光斑、无粒子、无杂物；
9. 主体边缘必须清晰，不能缺斤少两，不能连带背景杂边碎块；
10. 主体不要贴边，四周留有足够空白；
11. 不要添加边框、卡片、底板或新装饰；
12. 如果该零件是文字、艺术字、白色字、书法字、毛笔字、金属字或发光特效字，也必须作为图片素材完整保留；
13. 如果该零件带有发光、柔光、半透明边缘、飞白、毛边或细碎笔画，背景必须能清楚显示这些边缘细节；
14. 让该素材适合用户后续自行使用一键抠图软件抠出并放入 PPT。
```

Add part-specific details after the template, such as exact position in the original image, color, shape, texture, lighting, occlusion, and recommended contrast background.

## Naming Convention

Suggest filenames in this format:

```text
编号_类型_名称.png
```

Examples:

```text
01_文字_主标题艺术字.png
02_文字_副标题.png
03_文字_页脚小字.png
04_文字_白色发光字.png
05_文字_金色书法字.png
06_主体_产品本体.png
07_主体_人物.png
08_装饰_左上角线条.png
09_装饰_底部波浪.png
10_特效_蓝色光晕.png
11_特效_粒子光点.png
12_背景_局部纹理.png
```

## Prohibited Behavior

Do not:

- generate only one complete image;
- rearrange parts into a new poster;
- tell the user to retype text;
- convert text into PPT text boxes;
- extract only the subject while ignoring text;
- extract only text while ignoring decorations and effects;
- ignore small text, small icons, or small ornaments;
- ignore white text, glowing text, or effect text;
- combine multiple unrelated parts into one material;
- add new frames, cards, bases, panels, or decorations;
- change the original style;
- add arbitrary new elements;
- replace original elements with similar stock-like materials;
- apply a fixed scene template;
- promise 100% lossless source-layer recovery from a flat PNG/JPG/WebP;
- use gradients, textures, light effects, shadows, reflections, particles, complex backgrounds, or backgrounds close to the subject color;
- use light backgrounds that swallow white text edges;
- use dark backgrounds that swallow dark text edges;
- use textured backgrounds that interfere with brush-lettering dry strokes;
- use same-color backgrounds that swallow glowing text halos.

## Quality Check

Before finishing, verify:

- Text is treated as image.
- Artistic lettering is separated when visible.
- Small text is separated when visible.
- White text uses a dark solid matte background.
- Black or dark text uses a light solid matte background.
- Glowing text backgrounds reveal halo edges.
- Brush lettering backgrounds avoid texture interference.
- Small text remains readable.
- Main subjects are separated.
- Decorations are separated.
- Effects are separated as much as reasonably possible.
- The decomposition is detailed enough.
- The answer avoids "retype it yourself" suggestions.
- Every part uses a cutout-friendly solid matte background.
- Backgrounds are solid, matte, textureless, patternless, shadowless, reflection-free, glare-free, particle-free, and clutter-free.
- Background color is clearly different from the subject.
- Subject edges are clear.
- Each subject has enough blank space and does not touch the edge.
- No extra frame, card, panel, or base has been added.
- Original style and detail are preserved.
- The result is convenient for later cutout and PPT use.

## Summary Principle

Turn any flat composite image into a set of high-resolution, standalone, clear image-part materials on cutout-friendly solid matte backgrounds.

Text is image. Artistic lettering, small text, white text, glowing text, effect text, calligraphy, and brush lettering must be treated as picture materials. Objects, decorations, effects, and useful background fragments should be extracted as much as possible. Do not ask the user to retype. Do not redesign. Do not add frames. Keep every part on a solid matte background that differs clearly from the subject and preserves strokes, dry-brush gaps, rough edges, glow, translucent edges, and other fine details for later cutout.
