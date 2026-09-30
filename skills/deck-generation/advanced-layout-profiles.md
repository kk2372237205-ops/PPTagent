# Advanced Layout Profiles

These profiles are used only by advanced deck generation when an uploaded palette reference controls all color. The IDs are compatibility keys shared with `lib/employee-deck-packs.mjs` (`DECK_LAYOUT_PACKS`); they do not imply any color. `scripts/check-style-packs.mjs` compares both files section by section, so change the `.mjs` first and sync this file after.

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

> 详细画面体系（RS-1 ～ RS-5）见同目录 `illustration-system.md`（它会随本文件一起注入）。根目录 `PPTskills汇总/` 只是维护者资料，模型无需也无法读取。

### 版式规则

- Choose information organization, visual weight, whitespace, reading rhythm, **illustration area, and bleed** only. Never introduce palette names or colors.
- Compose text and generated visuals as one semantic page. Do not reserve a fixed bottom, right, or background image slot across the deck.
- **Every profile below carries an illustration area range and a bleed rule. Those numbers are binding.** A body page may use one to four generated visual units when they clarify the content; each unit must support a named claim, stage, comparison, mechanism, context, or result.
- **A photo insert means a distinct, complete, hard-edged photo-like picture frame — not a diagram, chart, timeline node, icon or geometry.** On an ordinary body page with concrete subject matter, use a primary photo insert plus a different context/process/detail insert; when two or three independent cases, stages, or parallel claims exist, use two or three distinct photo inserts instead. A pure confirmed chart/data table or a fully annotated technical mechanism may use zero or one photo insert.
- Multiple visuals must form one reading path and one hierarchy. Avoid unrelated collages and decorative equal-weight card grids — instead use a labeled process chain with photo anchors, a parallel case comparison with one picture frame per named case, a panorama plus evidence band, a photo-led before/after split, a vertical image spine, or a dominant chart with a narrow insight rail.
- Rotate body-page silhouettes. Do not repeat “left diagram/cards + one tall right photo” on adjacent pages; choose a different semantic family such as hero plus detail inset, three-frame story rail, photo-led process path, comparison diptych, panorama plus evidence band, diagram with photo insets, or vertical image spine.
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

## minimal-academic: Academic Argument

- Use for research, validation, literature, and analytical explanation.
- **Illustration area: 45%–60% when the page's argument is a chart; 30%–45% for an annotated mechanism.**
- **Bleed: no bleed.** Academic pages keep full margins so nothing is cut.
- Prefer chart, comparison, annotated mechanism, or typography-led evidence with disciplined whitespace.
- Keep labels and values traceable to confirmed facts.
- Avoid decorative scenes that compete with the argument — but **do not remove the visual entirely on a chart page**: the chart is the illustration, and it must occupy 45%+ with direct labels rather than a legend box.
- Never add a decorative illustration to a chart page; a chart page's `visual_strategy` is `fact-based-chart` and its illustration share is the chart's own area.

## Deck Rhythm (applies across profiles)

- Adjacent pages must not differ in illustration area by more than ±25%.
- At least one page in every three must reach 60% illustration area or more.
- No content page may fall below 25%.
- At least one third of all pages must be above 60%.
