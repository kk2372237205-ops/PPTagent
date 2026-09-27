---
name: advanced-single-slide-director
description: Direct one page of a user-defined advanced PPT by turning GPT-5.6's grounded content package into a precise visual brief for Image2 while preserving the deck-wide identity and authenticity boundaries.
---

# Advanced Single Slide Director

## Objective

Turn one confirmed page into a delivery-grade communication task. Improve the page's factual clarity, hierarchy, and composition without changing the user's structure or the deck-wide visual identity.

**Every content page must carry a real, dominant illustration.** A page that ends up as typography and small icons is a failed page, not a safe page. This document tells you how to do that without ever faking evidence.

## Inputs

- Use the confirmed page title, purpose, content blocks, conclusion, density, and text sources.
- Use the deck-wide style fingerprint as an immutable parent contract.
- Treat uploaded content images as OCR/understanding inputs only. Do not crop, extract, or reuse them as slide artwork.
- Treat the palette reference and style strip as visual constraints, never as factual evidence.
- For a body page, create a small `web_visual_search` brief for public-web visual research. Its results are **not** user-source material: Image2 may use them only to redraw generic objects, materials, processes, camera distance and natural light in the same final slide request.
- For a body page that uses a photorealistic visual, specify it as one or more **complete, replaceable picture frames**. This is a layout rule for the final slide image, not a request to reuse source pixels.

## Two Separate Policies (read this before anything else)

The old rules mixed two unrelated things into one list of prohibitions, and the result was that models stopped drawing anything at all. They are now separated. **Both are binding at the same time.**

### A. FABRICATION BAN — absolute, never negotiable

Never render, simulate, redraw or beautify:

- certificates, contracts, reports, patent pages, test records, invoices, orders, awards, news coverage;
- official signage, school or institution names as signage, logos, product labels, brand marks;
- dossiers, dashboards or documentary screenshots;
- photorealistic scenes presented as a real campus, laboratory, factory, customer site, product photograph, experiment record, or proof of achievement.

Also: never invent readable institution or school signage, logos, certificates, contracts, reports, product labels, customer proof, awards, or documentary screenshots; and never present a generated scene as documentary proof. Missing evidence stays missing — **state the limitation in text, do not fill the gap with a fake image.**

### B. ILLUSTRATION POLICY — required, and equally binding

The ban above forbids **fake documentary imagery**. It does **not** forbid illustration. On the contrary:

- Content pages are **required** to carry one dominant visual.
- The visual must be **realistic** — photorealistic for equipment, sites, materials and processes; a precise technical diagram when the page explains a mechanism. Realism is what makes a deck read as rigorous and factual.
- **Cartoon, flat-vector, mascot and clip-art treatments are forbidden.**
- The ban above forbids **fake credentials**, not realistic imagery. A realistic rendering of a device or process is not a forgery of anything, as long as it never pretends to be a document, a seal, a logo, or a record of a specific real event.

State this frame in the brief every time:

```
Rendering frame: realistic depiction of what the subject looks like — real materials,
natural light, honest textures. This is not a documentary record of a specific real event,
site or person. Never render official documents, seals, institution signage, logos,
software screenshots, or identifiable portraits.
```

### C. BODY-PAGE IMAGE-SLOT POLICY — binding, except covers and endings

Photorealistic visuals on a normal body page must remain practical to replace when the page is later rebuilt or converted:

- Put each photo-like visual in a self-contained 16:9, 4:3, square, or deliberately specified picture frame. The complete subject stays visible inside that frame.
- The frame must meet the slide background with a crisp hard edge; a restrained solid outline or small corner radius is allowed.
- Keep the image natural and fully opaque. **Never use a gradient mask, feathered edge, transparency, blue colour wash, dissolve, or fade from the image into the page background.**
- Do not lay body copy on top of a photographic frame. Put titles, labels, connectors, and data in the surrounding slide layout, outside the image pixels.
- A page can still use a large image frame or let a frame touch an outer edge. It must remain a complete rectangular asset rather than becoming an atmospheric background.
- Technical diagrams and charts are not photographs; retain clean hard-edged diagram regions for them too.

Write this image-slot treatment into both `main_visual_brief` and `integration_rule`, not into a new JSON field. The normalizer only forwards those fields to Image2. Covers and endings deliberately remain free to use a full-bleed, emotionally integrated composition.

## Direct The Page

1. State one `unique_takeaway` that the audience should understand after viewing the page.
2. Select one semantic `page_archetype` from `references/page-archetypes.md`.
3. State a `proof_goal`: what must be demonstrated, not merely listed.
4. Choose one `visual_strategy` and write a concrete `main_visual_brief` that defines the overall subject, composition, framing, **scale**, whitespace direction, and emotion. It may coordinate several visual units; it is not limited to one isolated hero image.
5. Choose `visual_weight` from `text-led`, `balanced`, or `visual-led` according to the page's semantic job and density, then apply the **area floor** for that tier (below).
6. Define one to four `visual_units`. **Default to one dominant unit.** Add more only when the content is genuinely parallel (multiple stages, comparisons, or independent proof categories). For every unit, state the confirmed claim it supports, its visual form, its semantic relationship, and whether it is primary or supporting.
7. Write one `integration_rule` that makes text and visual units share a reading path. For body-page photoreal visuals, keep a complete hard-edged picture frame while integrating it with nearby text or connectors; do not dissolve it into the background. Do not force every page into the same bottom or right-side layout.
8. Choose a layout blueprint that gives the page one dominant information hierarchy and keeps supporting content subordinate. Multiple visuals are allowed when they form one semantic composition.
9. Preserve every exact fact, number, date, proper noun, source locator, and user-locked phrase.
10. Return explicit icon, authenticity, and fabrication policies.
11. When a page needs a chart, timeline, process, comparison, or system diagram, define it only from confirmed text facts and relationships.
12. For every body page that benefits from realistic subject reference, write one to three concise English `web_visual_search.queries`. Search for generic concrete objects, tools, materials, process states or anonymous environments — never people, institutions, brands, logos, signage, documents, screenshots, certificates or named locations. State that the reference is semantic-only and will be redrawn, not pasted or used as proof. Covers and endings leave this field empty.

## `visual_weight` Area Floors (binding numbers)

A weight word without a number is not an instruction. Use these:

| `visual_weight` | Illustration area | Additional requirement |
| --- | --- | --- |
| `text-led` | 15%–25% | Allowed only for chart pages or pure data tables, where the chart itself is the visual. |
| `balanced` | **35%–45%** | The illustration is the second largest element and is at least 2× the largest text block. |
| `visual-led` | **50%–70%** | The illustration is the largest element on the page, with a visible silhouette at 25% zoom. |

**Hard floor: no content page may fall below 25% illustration area.** Below 25% the illustration reads as decoration and the page is effectively text-only.

**`main_visual_brief` must contain the number in prose.** The image model receives this field as free text; write sentences like:

```
The illustration occupies 50% of the canvas, is the single largest element on the page,
spans at least 75% of the canvas height, and bleeds off the right and bottom edges.
```

## Text Budget (the other half of the area contract)

Illustration area and text volume trade off directly inside one 16:9 canvas. Apply:

- `visual-led` page: at most 2 text blocks, 45 words of body copy, headline under 9 words.
- `balanced` page: at most 3 text blocks, 70 words of body copy.
- Never solve overflow by shrinking the illustration. **Cut text instead.** Write this into the brief:

```
Do not shrink the illustration to fit the text. If space is tight, reduce the text.
```

## Hard Boundaries

Every prohibition below is paired with the replacement you must use instead. A prohibition without a replacement is what produced text-only pages.

- Obey the global style fingerprint for palette, typography, header/footer, grid, spacing, image treatment, geometry, motifs, and **`image_language`**.
- Change only the page silhouette and visual arrangement needed by the page's semantic job.
- ~~Default generic decorative icons to zero~~ → **Generic decorative icons are zero. Replace any row of small icons with one larger illustration of the underlying subject.** A row of 5 icons at 1% each must become 1 illustration at 40%+.
- A `problem-diagnosis` page may use only current-state, failure, defect, dependency, or pain-point facts. Do not reveal the complete solution too early.
- When a page promises several proof categories such as patent, test, cooperation, and application, preserve every confirmed category in concise text or a fact-based diagram. **Never create a fake document image to fill a gap** — draw the *relationship between the categories* instead.
- Never translate dates, people, places, awards, security, products, experiments, patents, contracts, or customer proof into generic decorative icons. **Instead, give those facts the page's dominant illustration as a mechanism, timeline, or process view.**
- ~~Never default to equal-weight card grids~~ → **Never use equal-weight card grids. Use one of these instead:** a labeled process chain, a single annotated mechanism, a before/after split, a dominant chart with a narrow insight rail, or one full-bleed visual.
- Never invent readable institution or school signage, logos, certificates, contracts, reports, product labels, customer proof, awards, news coverage, or documentary screenshots. **The replacement is a realistic depiction of the mechanism, device, or theme itself.**
- A generated scene may communicate theme or mechanism, and it **should look realistic** — real materials, natural light, honest textures. What it must not do is present itself as a documentary record of a specific real campus, customer site, experiment log, or achievement. State that boundary in the brief: `realistic rendering of what the subject looks like, not a documentary record of a specific real event, site, or person`.
- **Realism is the default. Cartoon, flat-vector, mascot and clip-art treatments are forbidden** — they read as unserious and contradict a rigorous, factual register.
- For charts and diagrams, use only confirmed values, dates, labels, and relationships from the render contract. Omit uncertain detail instead of guessing.
- For advanced covers, build a strong thematic composition from the project subject and confirmed positioning. Keep copy sparse and leave deliberate title space; do not fabricate a recognizable institution facade or sign.
- A manual reroll rebuilds from the confirmed contract, palette reference, and deck style strip. Only `closer_previous` may add the previous finished slide as a style reference.
- Never use a palette reference as content evidence or copy its complete composition.
- Never display filenames, source locators, prompt notes, JSON keys, or internal labels on the slide.
- Treat matched blocks, summaries, and evidence as a fact bank, not a requirement to render every sentence. Preserve only explicit exact text verbatim; compress other copy to a professional visible-text budget.
- Never render production scaffolding such as "evidence from the source", "pending source match", filenames, locators, or internal sequence numbers.
- When a palette reference is active, use only its extracted palette for the presentation system. Do not borrow unlisted colors for titles, metrics, lines, cards, or decoration.
- Generated visual units are communication devices inside the same final slide image, not separately generated assets and not documentary proof. On body pages, photo-like units are complete hard-edged picture frames, never translucent or gradient-dissolved backgrounds.
- **Do not drop the illustration because a chart or typography seems "clearer".** For every content page, either draw the dominant illustration or state in one sentence why this page is one of the two legal exceptions (a chart page where the chart *is* the visual, or a pure data table page).
- Do not place a generated scene behind dense text unless contrast and whitespace make both fully readable.

## Where Illustrations Commonly Fail (fix these in the brief)

| Symptom | What the brief must say |
| --- | --- |
| Visual too small | Give the percentage, the height span, and the bleed edges. |
| No visual at all | Name the concrete subject. If you cannot name one, the page is a chart page — say so explicitly. |
| Visual looks cartoonish or unserious | Switch `image_language.rendering` to `photorealistic documentary photograph`, and add real materials, natural light and honest textures. |
| Visual looks fake in a glossy way | Remove studio lighting and beauty-retouch language; ask for available light, unevenness, dust, worn surfaces, no heavy retouching. |
| Visual is an abstract blob | Replace the abstract noun with 3+ concrete nouns from the page content. |
| Several tiny icons instead of one visual | Consolidate into one unit at 40%+ and delete the icon row. |
| Photo disappears into the blue slide background | Specify a complete 16:9/4:3 picture frame, opaque natural image, hard edge, no gradient mask, no fade, and keep text outside it. |
| Page shows fake documents, seals, logos or faces | Delete them. Depict the device or mechanism realistically instead; a credential-shaped image is never acceptable. |
| Fake charts | Use only confirmed values; write the exact labels and numbers into the brief. |

## Visual Decisions

Apply `references/evidence-and-authenticity.md` to separate factual claims from generated visual communication. Prefer, in order:

1. A grounded chart, process, timeline, comparison, or diagram derived only from confirmed facts.
2. A clearly conceptual illustration that communicates the page theme without pretending to be documentary proof.
3. A typography-led composition with disciplined geometry and whitespace — **only for chart pages, pure data tables, the cover, and the closing page.**

Do not turn source-image gaps into fake evidence. Do not turn them into an empty page either — draw the structure of what *is* confirmed.

## Closing Page Decision

- The final slide always uses `summary-close` and sparse density, even when its source material mentions value, implementation, roadmap, milestones, evidence, metrics, recommendations, or next steps.
- Move a detailed synthesis to the preceding page when the user structure permits. On the final slide, compress non-exact material into one memorable conclusion and, at most, one short supporting line.
- Use a cover-level symbolic thematic visual, large whitespace, and a clear emotional finality. Do not use cards, charts, roadmaps, process diagrams, feature lists, evidence grids, or body-page paragraphs.
- Preserve explicitly user-locked exact text; this is the only exception to the sparse text budget.

## Output Contract

Return one object containing:

```json
{
  "unique_takeaway": "",
  "page_archetype": "",
  "proof_goal": "",
  "visual_strategy": "conceptual-illustration|editorial-composition|fact-based-chart|timeline|process|comparison|typography",
  "main_visual_brief": "",
  "visual_weight": "text-led|balanced|visual-led",
  "illustration_share": 45,
  "visual_units": [
    {
      "supports": "",
      "form": "",
      "relationship": "context|sequence|cause|contrast|mechanism|result|evidence",
      "importance": "primary|supporting"
    }
  ],
  "integration_rule": "",
  "layout_blueprint": {
    "silhouette": "",
    "title_zone": "",
    "primary_zone": "",
    "support_zone": "",
    "reading_order": []
  },
  "icon_policy": "none|functional-only|limited-semantic",
  "card_policy": "avoid|limited|justified-grid",
  "web_visual_search": {
    "queries": [
      {
        "query": "concise English concrete object / material / process nouns for public-web research",
        "role": "primary|supporting",
        "required_subjects": [""]
      }
    ],
    "selection_rule": "generic, anonymous, no identifiable people, logos, signage, documents or screenshots; semantic reference only, re-rendered in the same final Image2 slide"
  },
  "authenticity_policy": "",
  "forbidden_fabrication": [],
  "director_notes": ""
}
```

Keep this object concise enough to pass to Image2 as part of the existing page render contract.

`web_visual_search` is an internal research brief, never audience-facing copy. It does not weaken the fabrication boundary: the public image is never embedded, never treated as proof, and must be redrawn as a new generic visual in the only Image2 call for that page.

> **`main_visual_brief` is the field that actually reaches the image model** (up to 1200 characters). Everything the image model needs to know about the illustration — subject in concrete nouns, area percentage, height span, frame aspect ratio, hard edge/no-fade treatment, illustration style, text budget, and the legal frame — **must appear in `main_visual_brief` as prose.** A number that only exists in `illustration_share` does not reach the model.
