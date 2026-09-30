export const masterRenderSkill = `
You are producing the visual truth for one 16:9 PPT slide.
Create one complete, polished presentation sample image from the employee brief.
The image is called master. It may contain designed text, title art, cards,
subjects, icons, lighting and decoration because later steps will decompose
everything into movable image parts.
Do not make a generic template. Follow the user's intent literally.
Output must be a single 16:9 slide image with strong commercial presentation quality.
`;

export const cleanBackgroundSkill = `
Create a clean background plate from the master sample.
Think of it as the same PPT page before any content modules were added.
Remove every foreground subject, person, product, robot, vehicle, title,
subtitle, label, logo, icon, card, panel, number, readable text, table,
photo frame, screenshot frame, chart frame, label slot, content container,
summary bar, footer box, side title plate and decorative box that marks a
content position.
Preserve only the underlying page backdrop: color palette, broad gradient,
ambient lighting, subtle texture, depth, atmospheric glow and empty
presentation space.
Do not preserve rectangular placeholders, card outlines, blue neon frames,
HUD boxes, panel borders, label backgrounds, title underlines or content
slots, even if they look decorative in the master.
Fill removed areas with a continuous natural background that matches the
surrounding backdrop. The result must have no ghost silhouettes, no text
residue, no logos, no numbers, no cards, no frames and no focal subject.
`;

export const partDecompositionSkill = `
You decompose a finished PPT sample PNG into movable image parts.
Return JSON only.
Schema:
{"components":[{"semanticId":"part-001","label":"short Chinese label","kind":"subject|title-art|wordart|text-art|rect-card|photo-card|image-card|framed-image|card|panel|icon|decoration|light|group","box":[x,y,width,height],"zIndex":1,"confidence":0.9,"containsText":false,"recommended":true,"rebuildPolicy":"overlay|skip","maskHint":"short English isolation hint"}]}
Coordinates are 0-1000 relative to the full 16:9 image.
Rules:
1. Every visible foreground element that should move in PPT is a part.
2. Text, artistic title text, small labels, cards, icons, subjects, decorations and light effects are all image parts.
3. Do not output the background. The clean background is generated separately and will already contain the atmosphere, skyline, roads, water, sky, floor, landscape, light trails, broad geometric plates, background panels and other scene-level structures.
4. If an element is a large background-like region with no readable information, set recommended=false and rebuildPolicy="skip"; do not make it an overlay part. This includes city skyline, roads, bridges, water, sky, solar panels, energy facilities, background vehicles, dark navy geometric boards, empty decorative frames and large scene chunks unless the employee explicitly asks to move that exact object.
5. Use three rebuild classes:
   - background-owned: already visible in the clean background and carries no text, number, logo, photo, card label or important information; set recommended=false and rebuildPolicy="skip".
   - rect-card: a photo/screenshot/data image with its frame, label slot, border or bound caption; output it as one single rectangular card part.
   - content-panel: a summary bar, conclusion box, info panel or labeled container with text/numbers; output it as one single rectangular fidelity part.
   - overlay-cutout: a true transparent movable overlay such as title art, logo, isolated icon, foreground subject or independent decoration.
6. Only output true foreground pieces that should remain independently movable in PPT: title block, subtitle block, logo, icon groups, photo cards, content panels, small labels, foreground subject, independent decoration and small highlight lines.
7. A framed photo/card must include the photo, blue frame, label slot and label text in one part. Do not isolate only the mechanical object inside the photo.
7b. A bottom summary bar or information panel with numbers/text must include the panel frame, glow, labels and all text in one part. Do not mark it as background-owned.
8. One readable text block must be one complete image part, including its shadow, stroke and glow. Do not split the same text into duplicate white text, shadow, outline or glow parts.
9. Do not invent, OCR-rewrite, approximate, simplify or correct Chinese/English text, logos or school names.
10. Prefer 6-18 meaningful parts. Merge tiny noise into nearby larger parts.
11. Assign stable sequential ids: part-001, part-002...
12. Boxes must tightly cover the visible part with 2-4 percent safety margin; rect-card boxes should cover the entire rectangular card.
13. zIndex must match visual stacking order from back to front.
14. If an element is readable text but stylized, keep it as an image part instead of OCR text.
`;

export const partCutoutSkill = `
Each raw part is first isolated by OpenAI onto a cutout-friendly flat background,
then sent to Techsz visual/segmentation for transparent cutout.
Keep the entire target subject intact. Do not crop off glow, strokes, shadows,
thin lines, letter edges or small icons that belong to the target.
`;

export const textArtCutoutSkill = `
Special rule for text, title art, word art, white text, glowing text, metallic text,
outlined text and semi-transparent effect text:
1. Treat the text as an image asset, never as editable OCR text.
2. Preserve the full glyph body, bevel, stroke, shadow, glow, flying-white gaps,
semi-transparent edges, highlights and texture exactly as in the source crop.
3. Do not redraw, simplify, thicken, sharpen, restyle, replace, stretch, squeeze or warp the words.
4. Place the isolated text on a solid matte background with strong contrast.
   White or light text must use a dark neutral matte background, never white.
   Dark text must use a light neutral matte background.
5. The matte background must be flat, texture-free, pattern-free, shadow-free,
   reflection-free and particle-free so the next cutout stage can remove it cleanly.
6. Leave enough empty padding around the entire text effect; no glyph, glow, underline, shadow or light streak may touch the image edge.
7. The output must contain only this one text-art part and the flat matte background.
`;

export const rebuildAlignmentSkill = `
Rebuild the slide by placing cutout parts back on the clean background according
to their original 0-1000 boxes. Preserve the zIndex order. The rebuilt preview
is a QA image, while the final PPT stores the clean background and each cutout
as separate movable images.
`;

export const partRepairSkill = `
If a cutout part is badly damaged after segmentation, repair at most four parts.
Prioritize larger area parts first. Discard the damaged Techsz cutout, ask OpenAI
to place the raw part on a segmentation-friendly pure flat background while
preserving the whole subject, then send it to Techsz again. User-initiated reruns
must not trigger this OpenAI repair loop.
`;
