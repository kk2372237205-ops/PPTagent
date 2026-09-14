import { readFile, writeFile } from "fs/promises";
import JSZip from "jszip";

const contentTypesPath = "[Content_Types].xml";
const defaultSlideCx = 9144000;
const defaultSlideCy = 5143500;

export async function insertImageIntoPptxFile(inputPath: string, outputPath: string, options: {
  imagePath: string;
  imageExtension: string;
  slideNumber?: number;
  xRatio?: number;
  yRatio?: number;
}) {
  const zip = await JSZip.loadAsync(await readFile(inputPath));
  const slideNumber = Math.max(1, Math.floor(options.slideNumber || 1));
  const slidePath = `ppt/slides/slide${slideNumber}.xml`;
  const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
  const slideFile = zip.file(slidePath);
  if (!slideFile) throw new Error(`第 ${slideNumber} 页不存在，无法插入图片`);

  const extension = normalizeImageExtension(options.imageExtension);
  const mediaName = `wzlcf-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  const mediaPath = `ppt/media/${mediaName}`;
  zip.file(mediaPath, await readFile(options.imagePath));

  await ensureImageContentType(zip, extension);
  const relId = await addSlideImageRelationship(zip, relsPath, mediaName);
  const { cx: slideCx, cy: slideCy } = await slideSize(zip);
  const width = Math.round(slideCx * 0.34);
  const height = Math.round(slideCy * 0.34);
  const x = clamp(Math.round(slideCx * clampRatio(options.xRatio, 0.5) - width / 2), 0, slideCx - width);
  const y = clamp(Math.round(slideCy * clampRatio(options.yRatio, 0.5) - height / 2), 0, slideCy - height);

  const slideXml = await slideFile.async("string");
  zip.file(slidePath, addPictureToSlideXml(slideXml, { relId, name: mediaName, x, y, width, height }));

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(outputPath, buffer);
}

function normalizeImageExtension(extension: string) {
  const value = extension.replace(/^\./, "").toLowerCase();
  if (value === "jpeg") return "jpg";
  if (["png", "jpg", "gif"].includes(value)) return value;
  return "png";
}

async function ensureImageContentType(zip: JSZip, extension: string) {
  const file = zip.file(contentTypesPath);
  if (!file) return;
  const xml = await file.async("string");
  if (new RegExp(`<Default\\s+Extension="${escapeRegExp(extension)}"`, "i").test(xml)) return;
  const contentType = extension === "jpg" ? "image/jpeg" : extension === "gif" ? "image/gif" : "image/png";
  zip.file(contentTypesPath, xml.replace("</Types>", `<Default Extension="${extension}" ContentType="${contentType}"/></Types>`));
}

async function addSlideImageRelationship(zip: JSZip, relsPath: string, mediaName: string) {
  const file = zip.file(relsPath);
  const emptyRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const xml = file ? await file.async("string") : emptyRels;
  const ids = Array.from(xml.matchAll(/Id="rId(\d+)"/g)).map(match => Number(match[1]));
  const relId = `rId${Math.max(0, ...ids) + 1}`;
  const relationship = `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/${mediaName}"/>`;
  zip.file(relsPath, xml.replace("</Relationships>", `${relationship}</Relationships>`));
  return relId;
}

async function slideSize(zip: JSZip) {
  const file = zip.file("ppt/presentation.xml");
  if (!file) return { cx: defaultSlideCx, cy: defaultSlideCy };
  const xml = await file.async("string");
  const match = xml.match(/<p:sldSz[^>]*\scx="(\d+)"[^>]*\scy="(\d+)"/);
  return match ? { cx: Number(match[1]), cy: Number(match[2]) } : { cx: defaultSlideCx, cy: defaultSlideCy };
}

function addPictureToSlideXml(slideXml: string, picture: {
  relId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const nextId = Math.max(1000, ...Array.from(slideXml.matchAll(/<p:cNvPr[^>]*\sid="(\d+)"/g)).map(match => Number(match[1]))) + 1;
  const picXml = `<p:pic><p:nvPicPr><p:cNvPr id="${nextId}" name="${xmlAttr(picture.name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${picture.relId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${picture.x}" y="${picture.y}"/><a:ext cx="${picture.width}" cy="${picture.height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  const insertBefore = slideXml.indexOf("</p:spTree>");
  if (insertBefore < 0) throw new Error("PPT 页面结构异常，无法插入图片");
  return slideXml.slice(0, insertBefore) + picXml + slideXml.slice(insertBefore);
}

function clampRatio(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Math.min(0.92, Math.max(0.08, Number(value))) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function xmlAttr(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
