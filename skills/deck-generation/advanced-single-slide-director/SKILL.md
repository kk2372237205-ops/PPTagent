---
name: advanced-single-slide-director
description: Direct one page of a user-defined advanced PPT by turning GPT-5.6's grounded content package into a precise visual brief for Image2 while preserving the deck-wide identity and authenticity boundaries.
---

# Advanced Single Slide Director

## Objective

Turn one confirmed page into a delivery-grade communication task. Improve the page's factual clarity, hierarchy, and composition without changing the user's structure or the deck-wide visual identity.

## Inputs

- Use the confirmed page title, purpose, content blocks, conclusion, density, and text sources.
- Use the deck-wide style fingerprint as an immutable parent contract.
- Treat uploaded content images as OCR/understanding inputs only. Do not crop, extract, or reuse them as slide artwork.
- Treat the palette reference and style strip as visual constraints, never as factual evidence.

## Direct The Page

1. State one `unique_takeaway` that the audience should understand after viewing the page.
2. Select one semantic `page_archetype` from `references/page-archetypes.md`.
3. State a `proof_goal`: what must be demonstrated, not merely listed.
4. Choose one `visual_strategy` and write a concrete `main_visual_brief` that defines the overall subject, composition, framing, scale, whitespace direction, and emotion. It may coordinate several visual units; it is not limited to one isolated hero image.
5. Choose `visual_weight` from `text-led`, `balanced`, or `visual-led` according to the page's semantic job and density.
6. Define zero to four `visual_units`. For every unit, state the confirmed claim it supports, its visual form, its semantic relationship, and whether it is primary or supporting.
7. Write one `integration_rule` that makes text and visual units share a reading path. Never place all visuals in a detached fixed bottom, right, or background slot.
8. Choose a layout blueprint that gives the page one dominant information hierarchy and keeps supporting content subordinate. Multiple visuals are allowed when they form one semantic composition.
9. Preserve every exact fact, number, date, proper noun, source locator, and user-locked phrase.
10. Return explicit icon, authenticity, and fabrication policies.
11. When a page needs a chart, timeline, process, comparison, or system diagram, define it only from confirmed text facts and relationships.

## Hard Boundaries

- Obey the global style fingerprint for palette, typography, header, footer, grid, spacing, image treatment, geometry, and motifs.
- Change only the page silhouette and visual arrangement needed by the page's semantic job.
- Default generic decorative icons to zero in serious reports and competitions.
- A `problem-diagnosis` page may use only current-state, failure, defect, dependency, or pain-point facts. Do not reveal the complete solution too early.
- When a page promises several proof categories such as patent, test, cooperation, and application, preserve every confirmed category in concise text or a fact-based diagram. Never create a fake document image to fill a gap.
- Never translate dates, people, places, awards, security, products, experiments, patents, contracts, or customer proof into generic decorative icons.
- Never default to equal-weight card grids. Use cards only when the information is genuinely modular and peer-level.
- Never invent readable institution or school signage, logos, certificates, contracts, reports, product labels, customer proof, awards, news coverage, or documentary screenshots.
- A generated conceptual scene may communicate theme or mechanism, but it must not be framed as a real campus, customer site, product photograph, experiment record, or proof of achievement.
- For charts and diagrams, use only confirmed values, dates, labels, and relationships from the render contract. Omit uncertain detail instead of guessing.
- For advanced covers, build a strong thematic composition from the project subject and confirmed positioning. Keep copy sparse and leave deliberate title space; do not fabricate a recognizable institution facade or sign.
- A manual reroll rebuilds from the confirmed contract, palette reference, and deck style strip. Only `closer_previous` may add the previous finished slide as a style reference.
- Never use a palette reference as content evidence or copy its complete composition.
- Never display filenames, source locators, prompt notes, JSON keys, or internal labels on the slide.
- Treat matched blocks, summaries, and evidence as a fact bank, not a requirement to render every sentence. Preserve only explicit exact text verbatim; compress other copy to a professional visible-text budget.
- Never render production scaffolding such as "evidence from the source", "pending source match", filenames, locators, or internal sequence numbers.
- When a palette reference is active, use only its extracted palette for the presentation system. Do not borrow unlisted colors for titles, metrics, lines, cards, or decoration.
- Generated visual units are communication devices inside the same final slide image, not separately generated assets and not documentary proof.
- Do not force a visual unit when typography or a grounded chart is clearer. For applicable body pages, prefer one to three meaningful units over empty decoration.
- Do not place a generated scene behind dense text unless contrast and whitespace make both fully readable.

## Visual Decisions

Apply `references/evidence-and-authenticity.md` to separate factual claims from generated visual communication. Prefer, in order:

1. A grounded chart, process, timeline, comparison, or diagram derived only from confirmed facts.
2. A clearly conceptual illustration that communicates the page theme without pretending to be documentary proof.
3. A typography-led composition with disciplined geometry and whitespace.

Do not turn source-image gaps into fake evidence.

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
  "authenticity_policy": "",
  "forbidden_fabrication": [],
  "director_notes": ""
}
```

Keep this object concise enough to pass to Image2 as part of the existing page render contract.
