import { readFile, writeFile } from "fs/promises";
import JSZip from "jszip";

type DesignPlan = {
  title?: string;
  subtitle?: string;
  palette?: string[];
  accentLabel?: string;
  body?: string[];
  composition?: "text-left-hero-right" | "hero-left-text-right";
};

export type DesignSlideAssets = {
  /** A full-bleed, opaque atmospheric canvas. */
  backgroundImagePath?: string | null;
  /** An isolated hero asset. It may contain alpha; it is never used as a full page. */
  heroImagePath?: string | null;
};

export type ExplodedSlidePart = {
  label: string;
  kind: string;
  imagePath?: string | null;
  textContent?: string | null;
  rotation?: number;
  textStyle?: {
    color?: string;
    fontSize?: number;
    bold?: boolean;
    italic?: boolean;
    align?: string;
  } | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

const presentationPath = "ppt/presentation.xml";
const presentationRelsPath = "ppt/_rels/presentation.xml.rels";
const contentTypesPath = "[Content_Types].xml";
const emuPerInch = 914400;

export async function appendEditableDesignSlide(inputPath: string, outputPath: string, assets: DesignSlideAssets, plan: DesignPlan) {
  const zip = await JSZip.loadAsync(await readFile(inputPath));
  await repairPresentationSlideIndexInZip(zip);
  const { cx, cy } = await slideSize(zip);
  const slideNumber = nextSlideNumber(zip);
  const imageNames: { background?: string; hero?: string } = {};
  if (assets.backgroundImagePath) {
    imageNames.background = `wzlcf-agent-background-${Date.now()}.png`;
    zip.file(`ppt/media/${imageNames.background}`, await readFile(assets.backgroundImagePath));
  }
  if (assets.heroImagePath) {
    imageNames.hero = `wzlcf-agent-hero-${Date.now()}.png`;
    zip.file(`ppt/media/${imageNames.hero}`, await readFile(assets.heroImagePath));
  }
  await ensurePngType(zip);

  const slideRelId = await addPresentationRelationship(zip, slideNumber);
  await addPresentationSlideId(zip, slideRelId);
  zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, imageRelationshipXml(imageNames));
  zip.file(`ppt/slides/slide${slideNumber}.xml`, slideXml(cx, cy, plan, imageNames));
  await addSlideContentType(zip, slideNumber);

  await writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return slideNumber;
}

export async function appendExplodedImageSlide(inputPath: string, outputPath: string, parts: ExplodedSlidePart[]) {
  const zip = await JSZip.loadAsync(await readFile(inputPath));
  await repairPresentationSlideIndexInZip(zip);
  const { cx, cy } = await slideSize(zip);
  const slideNumber = nextSlideNumber(zip);
  await ensurePngType(zip);

  const ordered = parts.slice().sort((left, right) => left.zIndex - right.zIndex);
  const imageParts = ordered.filter(part => part.imagePath);
  const rels: string[] = [];
  let imageIndex = 1;
  for (const part of imageParts) {
    const mediaName = `wzlcf-exploded-${Date.now()}-${imageIndex}.png`;
    zip.file(`ppt/media/${mediaName}`, await readFile(part.imagePath!));
    rels.push(`<Relationship Id="rId${imageIndex}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`);
    imageIndex += 1;
  }

  const slideRelId = await addPresentationRelationship(zip, slideNumber);
  await addPresentationSlideId(zip, slideRelId);
  zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join("")}</Relationships>`);
  zip.file(`ppt/slides/slide${slideNumber}.xml`, explodedSlideXml(cx, cy, ordered));
  await addSlideContentType(zip, slideNumber);
  await writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  return slideNumber;
}

export async function repairPresentationSlideIndex(inputPath: string, outputPath: string) {
  const zip = await JSZip.loadAsync(await readFile(inputPath));
  const result = await repairPresentationSlideIndexInZip(zip);
  if (result.repaired) {
    await writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  }
  return result;
}

async function slideSize(zip: JSZip) {
  const xml = await zip.file(presentationPath)?.async("string") || "";
  const match = xml.match(/<p:sldSz[^>]*\scx="(\d+)"[^>]*\scy="(\d+)"/);
  return match ? { cx: Number(match[1]), cy: Number(match[2]) } : { cx: 12192000, cy: 6858000 };
}
function nextSlideNumber(zip: JSZip) {
  const matches = Object.keys(zip.files).map(file => file.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1]).filter(Boolean).map(Number);
  return Math.max(0, ...matches) + 1;
}
async function ensurePngType(zip: JSZip) {
  const file = zip.file(contentTypesPath);
  if (!file) return;
  const xml = await file.async("string");
  if (!/<Default\s+Extension="png"/i.test(xml)) zip.file(contentTypesPath, xml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>'));
}
async function addPresentationRelationship(zip: JSZip, slideNumber: number) {
  const file = zip.file(presentationRelsPath);
  if (!file) throw new Error("PPT 缺少演示关系文件");
  const xml = await file.async("string");
  const ids = Array.from(xml.matchAll(/Id="rId(\d+)"/g)).map(match => Number(match[1]));
  const relId = `rId${Math.max(0, ...ids) + 1}`;
  const relationship = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNumber}.xml"/>`;
  zip.file(presentationRelsPath, xml.replace("</Relationships>", `${relationship}</Relationships>`));
  return relId;
}
async function addPresentationSlideId(zip: JSZip, relationId: string) {
  const file = zip.file(presentationPath);
  if (!file) throw new Error("PPT 缺少演示文件");
  const xml = await file.async("string");
  const ids = Array.from(xml.matchAll(/<p:sldId\s+id="(\d+)"/g)).map(match => Number(match[1]));
  const slideId = Math.max(255, ...ids) + 1;
  const tag = `<p:sldId id="${slideId}" r:id="${relationId}"/>`;
  if (xml.includes("</p:sldIdLst>")) zip.file(presentationPath, xml.replace("</p:sldIdLst>", `${tag}</p:sldIdLst>`));
  else zip.file(presentationPath, xml.replace("</p:presentation>", `<p:sldIdLst>${tag}</p:sldIdLst></p:presentation>`));
}
async function addSlideContentType(zip: JSZip, slideNumber: number) {
  const file = zip.file(contentTypesPath);
  if (!file) return false;
  const xml = await file.async("string");
  if (new RegExp(`<Override\\s+PartName="/ppt/slides/slide${slideNumber}\\.xml"`, "i").test(xml)) return false;
  const override = `<Override PartName="/ppt/slides/slide${slideNumber}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
  zip.file(contentTypesPath, xml.replace("</Types>", `${override}</Types>`));
  return true;
}

async function repairPresentationSlideIndexInZip(zip: JSZip) {
  const slideNumbers = Object.keys(zip.files)
    .map(file => file.match(/^ppt\/slides\/slide(\d+)\.xml$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .sort((left, right) => left - right);
  let repaired = false;
  for (const slideNumber of slideNumbers) {
    repaired = (await addSlideContentType(zip, slideNumber)) || repaired;
  }

  const relsFile = zip.file(presentationRelsPath);
  const presentationFile = zip.file(presentationPath);
  if (!relsFile || !presentationFile) throw new Error("PPT 缺少演示文稿关系或目录文件");
  let relsXml = await relsFile.async("string");
  const slideRelations = () => Array.from(relsXml.matchAll(/<Relationship\b([^>]*?)(?:\/?)>/g))
    .map(match => ({
      id: match[1].match(/\bId="([^"]+)"/)?.[1] || "",
      type: match[1].match(/\bType="([^"]+)"/)?.[1] || "",
      target: match[1].match(/\bTarget="([^"]+)"/)?.[1] || ""
    }))
    .map(relation => ({ ...relation, slideNumber: relation.type.endsWith("/slide") ? Number(relation.target.match(/slide(\d+)\.xml$/)?.[1] || 0) : 0 }))
    .filter(relation => relation.slideNumber > 0 && slideNumbers.includes(relation.slideNumber));

  const knownTargets = new Set(slideRelations().map(relation => relation.slideNumber));
  let relationIds = Array.from(relsXml.matchAll(/\bId="rId(\d+)"/g)).map(match => Number(match[1]));
  for (const slideNumber of slideNumbers) {
    if (knownTargets.has(slideNumber)) continue;
    const relationId = `rId${Math.max(0, ...relationIds) + 1}`;
    relationIds = [...relationIds, Number(relationId.slice(3))];
    const relation = `<Relationship Id="${relationId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${slideNumber}.xml"/>`;
    relsXml = relsXml.replace("</Relationships>", `${relation}</Relationships>`);
    repaired = true;
  }
  if (repaired) zip.file(presentationRelsPath, relsXml);

  const relations = slideRelations().sort((left, right) => left.slideNumber - right.slideNumber);
  let presentationXml = await presentationFile.async("string");
  const listedRelationIds = new Set(Array.from(presentationXml.matchAll(/<p:sldId\b[^>]*\br:id="([^"]+)"/g)).map(match => match[1]));
  const missingRelations = relations.filter(relation => !listedRelationIds.has(relation.id));
  if (missingRelations.length) {
    const existingIds = Array.from(presentationXml.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"/g)).map(match => Number(match[1]));
    let nextId = Math.max(255, ...existingIds) + 1;
    const tags = missingRelations.map(relation => `<p:sldId id="${nextId++}" r:id="${relation.id}"/>`).join("");
    if (presentationXml.includes("</p:sldIdLst>")) {
      presentationXml = presentationXml.replace("</p:sldIdLst>", `${tags}</p:sldIdLst>`);
    } else {
      presentationXml = presentationXml.replace("</p:presentation>", `<p:sldIdLst>${tags}</p:sldIdLst></p:presentation>`);
    }
    zip.file(presentationPath, presentationXml);
    repaired = true;
  }
  return { repaired, slideCount: relations.length };
}
function imageRelationshipXml(names: { background?: string; hero?: string }) {
  const relationships = [
    names.background ? `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${names.background}"/>` : "",
    names.hero ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${names.hero}"/>` : ""
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`;
}
function slideXml(cx: number, cy: number, plan: DesignPlan, images: { background?: string; hero?: string }) {
  const palette = (plan.palette || []).filter(color => /^#[0-9A-Fa-f]{6}$/.test(color));
  const [navy = "092D66", blue = "1B73D1", gold = "F5B544", paper = "F3F7FC"] = palette.map(color => color.replace("#", ""));
  const title = escapeXml(plan.title || "PPT 美化方案");
  const subtitle = escapeXml(plan.subtitle || "专业呈现，清晰传达核心价值");
  const label = escapeXml(plan.accentLabel || "智能美化方案");
  const body = (plan.body || ["提炼核心信息", "建立视觉层级", "保留可编辑结构"]).slice(0, 3);
  const heroLeft = plan.composition === "hero-left-text-right";
  const left = Math.round(cx * (heroLeft ? 0.55 : 0.08));
  const top = Math.round(cy * 0.13);
  const contentWidth = Math.round(cx * 0.39);
  const imageX = Math.round(cx * (heroLeft ? 0.07 : 0.55));
  const imageY = Math.round(cy * 0.15);
  const imageW = Math.round(cx * 0.38);
  const imageH = Math.round(cy * 0.70);
  const cardY = Math.round(cy * 0.67);
  const cardW = Math.round(contentWidth / 3) - Math.round(cx * 0.01);
  const shapes = [
    images.background ? picture(1, "AI 氛围背景", 0, 0, cx, cy, "rId1") : rect(1, "背景", 0, 0, cx, cy, navy),
    rect(2, "背景柔化层", 0, 0, cx, cy, navy, "34"),
    rect(3, "顶部亮线", 0, 0, cx, Math.round(cy * 0.018), gold),
    text(4, "方案标签", label, left, Math.round(cy * 0.075), Math.round(cx * 0.25), Math.round(cy * 0.05), gold, 1600, true),
    text(5, "主标题", title, left, top, contentWidth, Math.round(cy * 0.20), paper, 3300, true),
    text(6, "副标题", subtitle, left, Math.round(cy * 0.36), contentWidth, Math.round(cy * 0.12), "DDEBFA", 1750, false),
    ...(images.hero ? [picture(7, "AI 主视觉", imageX, imageY, imageW, imageH, "rId2")] : []),
    rect(8, "主视觉装饰", heroLeft ? imageX + imageW + Math.round(cx * 0.01) : imageX - Math.round(cx * 0.015), imageY + Math.round(cy * 0.06), Math.round(cx * 0.012), Math.round(cy * 0.42), blue),
    ...body.map((item, index) => {
      const x = left + index * (cardW + Math.round(cx * 0.012));
      return [rect(9 + index * 2, `信息卡${index + 1}`, x, cardY, cardW, Math.round(cy * 0.15), "FFFFFF", "18"), text(10 + index * 2, `信息${index + 1}`, escapeXml(item), x + Math.round(cx * 0.014), cardY + Math.round(cy * 0.045), cardW - Math.round(cx * 0.028), Math.round(cy * 0.07), navy, 1500, true)];
    }).flat()
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
function rect(id: number, name: string, x: number, y: number, w: number, h: number, color: string, transparency?: string) {
  const alpha = transparency ? `<a:alpha val="${Number(transparency) * 1000}"/>` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}">${alpha}</a:srgbClr></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}
function text(id: number, name: string, value: string, x: number, y: number, w: number, h: number, color: string, size: number, bold: boolean, rotation = 0, italic = false, align = "left") {
  const safeColor = /^[0-9A-F]{6}$/i.test(color) ? color.toUpperCase() : "FFFFFF";
  const safeSize = Math.max(800, Math.min(9600, Math.round(size)));
  const rotationValue = Math.round(Math.max(-180, Math.min(180, rotation)) * 60000);
  const paragraphAlign = align === "center" ? "ctr" : align === "right" ? "r" : "l";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm${rotationValue ? ` rot="${rotationValue}"` : ""}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p><a:pPr algn="${paragraphAlign}"/><a:r><a:rPr lang="zh-CN" sz="${safeSize}"${bold ? " b=\"1\"" : ""}${italic ? " i=\"1\"" : ""}><a:solidFill><a:srgbClr val="${safeColor}"/></a:solidFill></a:rPr><a:t>${value}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></p:txBody></p:sp>`;
}
function picture(id: number, name: string, x: number, y: number, w: number, h: number, relationshipId: string) {
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${name}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
}
function explodedSlideXml(cx: number, cy: number, parts: ExplodedSlidePart[]) {
  let imageRel = 1;
  let shapeId = 2;
  const objects = parts.map(part => {
    const x = Math.round(Math.max(0, Math.min(1, part.x)) * cx);
    const y = Math.round(Math.max(0, Math.min(1, part.y)) * cy);
    const w = Math.max(1, Math.round(Math.max(0.001, Math.min(1, part.width)) * cx));
    const h = Math.max(1, Math.round(Math.max(0.001, Math.min(1, part.height)) * cy));
    if (part.imagePath) {
      const relId = imageRel++;
      const id = shapeId++;
      return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXml(part.label)}" descr="${escapeXml(part.kind)}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rId${relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
    }
    if (part.textContent) {
      const style = part.textStyle || {};
      const color = String(style.color || "#FFFFFF").replace("#", "");
      const fontSize = Number(style.fontSize) || 18;
      return text(shapeId++, part.label, escapeXml(part.textContent), x, y, w, h, color, fontSize * 100, Boolean(style.bold), Number(part.rotation) || 0, Boolean(style.italic), String(style.align || "left"));
    }
    return "";
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${objects}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}
function escapeXml(value: string) { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
export const pptInchToEmu = emuPerInch;
