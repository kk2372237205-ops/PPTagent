# Advanced Layout Profiles

These profiles are used only by advanced deck generation when an uploaded palette reference controls all color. The legacy IDs are compatibility keys; they do not imply any color.

## Shared Rules

### 渲染路线（所有档位共用，先读这一条）

A layout profile decides **information organization, area and rhythm only** — never the rendering style. The rendering style is fixed for the whole deck and is **realistic by default**:

- 设备、工具、线缆、机械结构、自然环境、作业场地、工艺流程一律走**写实**：真实材质、自然光、诚实纹理、轻微颗粒。
- **禁止**卡通、扁平矢量吉祥物、Q 版、厚描边插画、纸片剪贴、clip art。
- 也要避免**假精致**：不要影棚灯光、不要商业摆拍、不要过度磨皮的塑料感。
- 讲机制、结构、流程、数据的页面改用**精密技术图解**（均匀细线、测量式间距、5–8 处直接标注），**不是**卡通示意图。
- 正式汇报里母题只保留**制图语言**：细线、网格、刻度、标注、剖切线、尺寸线。
  **不要**扫描线、光轨、数据粒子、星点、半透明玻璃卡片、发光边缘——它们削弱严谨感。
- 写实**不等于**放开配色：背景、文字、线条、几何和强调色仍只服从参考图配色合同。

> 详细画面体系（RS-1 ～ RS-5）见 `illustration-system.md` 与 `PPTskills汇总/01-风格库-Style-Library.md` 第 1.5 节。

### 版式规则

- Choose information organization, visual weight, whitespace, reading rhythm, **illustration area, and bleed** only. Never introduce palette names or colors.
- Compose text and generated visuals as one semantic page. Do not reserve a fixed bottom, right, or background image slot across the deck.
- **Every profile below carries an illustration area range and a bleed rule. Those numbers are binding.** A body page may use one to four generated visual units when they clarify the content; each unit must support a named claim, stage, comparison, mechanism, context, or result.
- **Default to one dominant unit at the profile's area range.** Several small units at 5–10% each are not a substitute and must be consolidated into one larger visual.
- Multiple visuals must form one reading path and one hierarchy. Avoid unrelated collages and equal-weight card grids — instead use a labeled process chain, one annotated mechanism, a before/after split, or a dominant chart with a narrow insight rail.
- Density remains a per-page decision. A layout profile does not force every page to be sparse, standard, or compact. **But an illustration-led page (area ≥ 55%) must stay at `low` or `medium` density.**
- **Every "Avoid" below is paired with what to use instead.** A prohibition without a replacement is what produces text-only pages.
- Repeat the area number in the page's `composition` and `main_visual_brief`. The image model only receives those free-text fields, not the numeric field.

## blue-gold-tech: Visual Narrative

- Use for balanced, image-rich reports and competition decks.
- **Illustration area: 45%–65%** on body pages; cover 70%–100%.
- **Bleed: at least one edge on every body page** (typically right plus top or bottom); the cover bleeds on all four edges.
- Prefer one primary claim with one to three supporting visual units woven into the reading path, with the primary unit at least 2× the area of any supporting unit.
- Allow asymmetric editorial composition, image-supported chronology, chart plus context, and problem-solution-result storytelling.
- Avoid detached media strips and decorative stock imagery — instead integrate the visual into the reading path so that text wraps toward it and the two share one flow.
- Text budget at 65% illustration area: at most 2 text blocks, 45 words.

## white-green-tech: Clear Technical Explanation

- Use for mechanisms, methods, product logic, and implementation explanations.
- **Illustration area: 50%–68%** on mechanism pages; 35%–45% on ordinary body pages.
- **Bleed: bottom plus one side** for mechanism pages (a wide annotated view); no bleed on ordinary body pages.
- Prefer a clear mechanism, process, or object view with concise annotations and generous breathing room, with **5 to 7 callout labels placed directly on the illustration** with thin leader lines ending in small filled dots.
- Let visuals sit next to the exact step or explanation they clarify.
- Avoid dense dashboards and ornamental interface chrome — instead replace a dashboard-like cluster of small panels with one annotated mechanism view.
- Avoid a row of unrelated feature icons — instead consolidate the features into one labeled process chain at 50%+.

## black-gold-business: Executive Conclusion First

- Use for executive summaries, strategy, business proof, and decision pages.
- **Illustration area: 40%–55%** on body pages; 60%–75% on conclusion pages.
- **Bleed: right edge, plus the bottom edge on conclusion pages.**
- Lead with the conclusion or key metric, then connect one dominant visual and compact supporting evidence.
- Prefer strong asymmetry and a controlled number of supporting elements (at most 3).
- Avoid weak mood imagery that does not explain the business point — instead draw the business mechanism itself as a diagram with named parts.
- Avoid repeated pill, badge and button shapes used as the main composition — instead give the page one dominant diagram and let the shapes stay subordinate.

## blue-purple-ai: System Relationship

- Use for architecture, intelligent systems, data flows, and interconnected capabilities.
- **Illustration area: 50%–70%** (the system map *is* the illustration on this profile).
- **Bleed: no bleed on system maps** (they need clear margins and labels); 55%+ with bottom bleed on architecture overview pages.
- Prefer one central system relationship with clear inputs, transformations, and outputs, with named components and directional connectors.
- Generated technical imagery may support the system map but must remain subordinate to the confirmed logic.
- Avoid generic neural-network decoration and repeated feature icons — instead name the real components and draw the actual data flow between them.
- Avoid glowing edges, particle fields and code rain; use uniform strokes and flat fills from `image_language`.

## red-white-government: Formal Hierarchy

- Use for institutional, government, school, and formal reporting.
- **Illustration area: 35%–50%** on body pages; 40%–55% on the cover.
- **Bleed: no bleed on body pages** (formal pages keep a clear frame and stable margins); the cover may bleed on the bottom edge only.
- Prefer stable hierarchy, restrained alignment, clear evidence order, and deliberate emphasis.
- Use generated visuals when they clarify context, progression, or mechanism — as a clearly illustrative diagram, never as a simulation of an official document.
- Avoid theatrical poster composition and fabricated documentary proof — instead draw a process or progression diagram using only confirmed facts.
- Avoid fake emblems, seals, ribbons or medals; the replacement is plain geometry and typography.

## minimal-academic: Academic Argument

- Use for research, validation, literature, and analytical explanation.
- **Illustration area: 45%–60% when the page's argument is a chart; 30%–45% for an annotated mechanism.**
- **Bleed: no bleed.** Academic pages keep full margins so nothing is cut.
- Prefer chart, comparison, annotated mechanism, or typography-led evidence with disciplined whitespace.
- Keep labels and values traceable to confirmed facts.
- Avoid decorative scenes that compete with the argument — but **do not remove the visual entirely on a chart page**: the chart is the illustration, and it must occupy 45%+ with direct labels rather than a legend box.
- Never add a decorative illustration to a chart page; a chart page's `visual_strategy` is `fact-based-chart` and its illustration share is the chart's own area.

## vivid-roadshow: Dynamic Storytelling

- Use for roadshows, project stories, market narratives, and growth plans.
- **Illustration area: 55%–75%** on body pages; 80%–100% on the cover and section openers.
- **Bleed: at least two edges on every page**; full bleed on the cover.
- Prefer visual-led sequences, contextual scenes, progression, before-after logic, and memorable metrics.
- Vary visual scale and placement according to the story rather than repeating a template, while keeping adjacent pages within ±25% illustration area of each other.
- Avoid empty spectacle, generic arrows, and unsupported growth imagery — instead draw the concrete subject of each story beat (the object, the place, the action) and label the real stages.
- Avoid more than one illustration per page; consolidate rather than multiply.

## Deck Rhythm (applies across profiles)

- Adjacent pages must not differ in illustration area by more than ±25%.
- At least one page in every three must reach 60% illustration area or more.
- No content page may fall below 25%.
- At least one third of all pages must be above 60%.
