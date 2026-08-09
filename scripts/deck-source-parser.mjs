import { mkdir, readFile, unlink } from "fs/promises";
import { spawn } from "child_process";
import path from "path";
import JSZip from "jszip";

const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MAX_EVIDENCE_CHUNKS = 500;
const MAX_VISUAL_ASSETS_PER_SOURCE = 80;
const RASTER_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"]);

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function xmlText(xml, paragraphTags = ["w:p", "a:p", "si", "row"]) {
  let value = String(xml || "");
  for (const tag of paragraphTags) {
    value = value.replace(new RegExp(`</${tag}>`, "gi"), "\n");
  }
  return decodeXml(value
    .replace(/<w:tab\s*\/>/gi, "\t")
    .replace(/<w:br\s*\/>/gi, "\n")
    .replace(/<a:br\s*\/>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function naturalNumber(value) {
  return Number(String(value).match(/(\d+)/)?.[1] || 0);
}

function rasterMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".bmp") return "image/bmp";
  if (extension === ".tif" || extension === ".tiff") return "image/tiff";
  return "image/png";
}

async function zipVisualAsset(zip, zipPath, locator, index) {
  const entry = zip.file(zipPath);
  if (!entry || !RASTER_EXTENSIONS.has(path.extname(zipPath).toLowerCase())) return null;
  return {
    locator,
    originalName: path.posix.basename(zipPath) || `image-${index + 1}.png`,
    mimeType: rasterMimeType(zipPath),
    buffer: await entry.async("nodebuffer")
  };
}

function resolvedZipTarget(baseFile, target) {
  const baseDirectory = path.posix.dirname(baseFile);
  return path.posix.normalize(path.posix.join(baseDirectory, String(target || "").replace(/^\//, "")));
}

function trimExtracted(text) {
  const normalized = String(text || "").replace(/\u0000/g, "").trim();
  return normalized.length > MAX_EXTRACTED_CHARACTERS
    ? `${normalized.slice(0, MAX_EXTRACTED_CHARACTERS)}\n\n[资料过长，已保留前 ${MAX_EXTRACTED_CHARACTERS} 个字符]`
    : normalized;
}

async function parseDocx(buffer, extractVisualAssets) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files)
    .filter(name => /^word\/(document|header\d+|footer\d+)\.xml$/i.test(name))
    .sort((a, b) => a.localeCompare(b));
  const sections = [];
  for (const name of names) {
    const xml = await zip.file(name)?.async("string");
    const text = xmlText(xml || "", ["w:p", "w:tr"]);
    if (text) sections.push({ locator: name.includes("document") ? "正文" : path.basename(name, ".xml"), text });
  }
  const mediaNames = extractVisualAssets ? Object.keys(zip.files)
    .filter(name => /^word\/media\//i.test(name) && RASTER_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b))
    .slice(0, MAX_VISUAL_ASSETS_PER_SOURCE) : [];
  const visualAssets = (await Promise.all(mediaNames.map((name, index) => zipVisualAsset(zip, name, `正文 · 图片 ${index + 1}`, index)))).filter(Boolean);
  return { kind: "docx", sections, visualAssets, metadata: { sectionCount: sections.length, visualAssetCount: visualAssets.length } };
}

async function parsePptx(buffer, extractVisualAssets) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b));
  const sections = [];
  const visualAssets = [];
  for (const name of slideNames) {
    const xml = await zip.file(name)?.async("string");
    const slideIndex = naturalNumber(name);
    const text = xmlText(xml || "", ["a:p"]);
    if (text) sections.push({ locator: `第 ${slideIndex} 页`, text });
    if (!extractVisualAssets) continue;
    const relationshipXml = await zip.file(`ppt/slides/_rels/${path.posix.basename(name)}.rels`)?.async("string") || "";
    const relationships = parseRelationships(relationshipXml);
    const embeddedIds = Array.from(String(xml || "").matchAll(/\br:embed="([^"]+)"/gi)).map(match => match[1]);
    for (const relationId of Array.from(new Set(embeddedIds))) {
      if (visualAssets.length >= MAX_VISUAL_ASSETS_PER_SOURCE) break;
      const target = relationships.get(relationId);
      if (!target) continue;
      const zipPath = resolvedZipTarget(name, target);
      const asset = await zipVisualAsset(zip, zipPath, `第 ${slideIndex} 页`, visualAssets.length);
      if (asset) visualAssets.push(asset);
    }
  }
  return { kind: "pptx", sections, visualAssets, metadata: { slideCount: slideNames.length, visualAssetCount: visualAssets.length } };
}

function parseSharedStrings(xml) {
  return Array.from(String(xml || "").matchAll(/<si[\s>][\s\S]*?<\/si>/gi))
    .map(match => xmlText(match[0], ["si"]));
}

function parseRelationships(xml) {
  const result = new Map();
  for (const match of String(xml || "").matchAll(/<Relationship\b([^>]+)\/>/gi)) {
    const attrs = match[1];
    const id = attrs.match(/\bId="([^"]+)"/i)?.[1];
    const target = attrs.match(/\bTarget="([^"]+)"/i)?.[1];
    if (id && target) result.set(id, target);
  }
  return result;
}

function workbookSheets(xml) {
  return Array.from(String(xml || "").matchAll(/<sheet\b([^>]+)\/>/gi)).map((match, index) => {
    const attrs = match[1];
    return {
      name: decodeXml(attrs.match(/\bname="([^"]+)"/i)?.[1] || `Sheet${index + 1}`),
      relationId: attrs.match(/\br:id="([^"]+)"/i)?.[1] || ""
    };
  });
}

function xlsxCellValue(cellXml, sharedStrings) {
  const type = cellXml.match(/\bt="([^"]+)"/i)?.[1] || "";
  if (type === "inlineStr") return xmlText(cellXml.match(/<is[\s>][\s\S]*?<\/is>/i)?.[0] || "", ["is"]);
  const raw = decodeXml(cellXml.match(/<v>([\s\S]*?)<\/v>/i)?.[1] || "");
  if (type === "s") return sharedStrings[Number(raw)] || raw;
  if (type === "b") return raw === "1" ? "TRUE" : "FALSE";
  return raw;
}

async function parseXlsx(buffer, extractVisualAssets) {
  const zip = await JSZip.loadAsync(buffer);
  const sharedXml = await zip.file("xl/sharedStrings.xml")?.async("string");
  const sharedStrings = parseSharedStrings(sharedXml || "");
  const workbookXml = await zip.file("xl/workbook.xml")?.async("string") || "";
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("string") || "";
  const relations = parseRelationships(relsXml);
  const sheets = workbookSheets(workbookXml);
  const sections = [];
  for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex += 1) {
    const sheet = sheets[sheetIndex];
    const target = relations.get(sheet.relationId) || `worksheets/sheet${sheetIndex + 1}.xml`;
    const normalized = target.replace(/^\//, "").replace(/^xl\//, "");
    const sheetPath = `xl/${normalized}`;
    const xml = await zip.file(sheetPath)?.async("string") || "";
    const rows = [];
    for (const rowMatch of xml.matchAll(/<row\b[^>]*r="?(\d+)"?[^>]*>([\s\S]*?)<\/row>/gi)) {
      const values = [];
      for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/gi)) {
        const reference = cellMatch[1].match(/\br="([^"]+)"/i)?.[1] || "";
        const value = xlsxCellValue(cellMatch[0], sharedStrings);
        if (value) values.push(`${reference}: ${value}`);
      }
      if (values.length) rows.push(`第 ${rowMatch[1]} 行 | ${values.join(" | ")}`);
    }
    if (rows.length) sections.push({ locator: `工作表「${sheet.name}」`, text: rows.join("\n") });
  }
  const mediaNames = extractVisualAssets ? Object.keys(zip.files)
    .filter(name => /^xl\/media\//i.test(name) && RASTER_EXTENSIONS.has(path.extname(name).toLowerCase()))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b))
    .slice(0, MAX_VISUAL_ASSETS_PER_SOURCE) : [];
  const visualAssets = (await Promise.all(mediaNames.map((name, index) => zipVisualAsset(zip, name, `工作簿图片 ${index + 1}`, index)))).filter(Boolean);
  return { kind: "xlsx", sections, visualAssets, metadata: { sheetCount: sheets.length, visualAssetCount: visualAssets.length } };
}

async function renderPdfPage(filePath, pageIndex, outputDirectory) {
  const command = process.env.PDFTOPPM_PATH || "pdftoppm";
  const resolvedDirectory = path.resolve(outputDirectory || path.dirname(filePath));
  await mkdir(resolvedDirectory, { recursive: true });
  const outputRoot = path.join(resolvedDirectory, `pdf-page-${process.pid}-${Date.now()}-${pageIndex}`);
  const outputPath = `${outputRoot}.png`;
  const args = ["-f", String(pageIndex), "-l", String(pageIndex), "-singlefile", "-scale-to", "1280", "-png", filePath, outputRoot];
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: process.platform === "win32" && /\.cmd$/i.test(command), windowsHide: true });
    const errors = [];
    child.stderr.on("data", chunk => errors.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", code => code === 0
      ? resolve()
      : reject(new Error(Buffer.concat(errors).toString("utf8") || `pdftoppm exited with ${code}`)));
  });
  try {
    return await readFile(outputPath);
  } finally {
    await unlink(outputPath).catch(() => {});
  }
}

async function parsePdf(buffer, filePath, extractVisualAssets, visualOutputDirectory) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await task.promise;
  const sections = [];
  const visualAssets = [];
  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items.map(item => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ");
    if (text.trim()) sections.push({ locator: `第 ${pageIndex} 页`, text: text.trim() });
    if (extractVisualAssets && visualAssets.length < MAX_VISUAL_ASSETS_PER_SOURCE) {
      try {
        visualAssets.push({
          locator: `第 ${pageIndex} 页`,
          originalName: `page-${pageIndex}.png`,
          mimeType: "image/png",
          buffer: await renderPdfPage(filePath, pageIndex, visualOutputDirectory)
        });
      } catch (error) {
        if (pageIndex === 1) console.warn("[deck-source-parser] PDF visual rendering unavailable:", error instanceof Error ? error.message : String(error));
      }
    }
  }
  await task.destroy();
  return { kind: "pdf", sections, visualAssets, metadata: { pageCount: document.numPages, visualAssetCount: visualAssets.length } };
}

function plainText(buffer, extension) {
  const text = buffer.toString("utf8");
  if (extension === ".json") {
    try {
      return JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      return text;
    }
  }
  return text;
}

export async function parseDeckSourceFile(filePath, originalName, mimeType = "", options = {}) {
  const extension = path.extname(originalName || filePath).toLowerCase();
  const buffer = await readFile(filePath);
  const extractVisualAssets = options.extractVisualAssets === true;
  let parsed;
  if (extension === ".pdf" || mimeType === "application/pdf") parsed = await parsePdf(buffer, filePath, extractVisualAssets, options.visualOutputDirectory);
  else if (extension === ".docx") parsed = await parseDocx(buffer, extractVisualAssets);
  else if (extension === ".pptx") parsed = await parsePptx(buffer, extractVisualAssets);
  else if (extension === ".xlsx") parsed = await parseXlsx(buffer, extractVisualAssets);
  else if ([".txt", ".md", ".csv", ".json"].includes(extension)) {
    parsed = { kind: extension.slice(1), sections: [{ locator: "全文", text: plainText(buffer, extension) }], metadata: {} };
  } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension) || mimeType.startsWith("image/")) {
    parsed = {
      kind: "image",
      sections: [],
      visualAssets: extractVisualAssets ? [{ locator: "整张图片", originalName: originalName || path.basename(filePath), mimeType: mimeType || rasterMimeType(originalName || filePath), buffer }] : [],
      metadata: { needsVision: true, visualAssetCount: extractVisualAssets ? 1 : 0 }
    };
  } else {
    throw new Error("暂不支持该文件格式，请使用 PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV、JSON 或常见图片");
  }
  const sections = parsed.sections.map(section => ({ ...section, text: trimExtracted(section.text) })).filter(section => section.text);
  return {
    ...parsed,
    sections,
    text: trimExtracted(sections.map(section => `[${section.locator}]\n${section.text}`).join("\n\n")),
    metadata: { ...parsed.metadata, originalName, mimeType, size: buffer.length }
  };
}

function splitText(text, maxLength) {
  const lines = String(text || "").split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const line of lines) {
    if (current && current.length + line.length + 1 > maxLength) {
      chunks.push(current);
      current = "";
    }
    if (line.length > maxLength) {
      for (let offset = 0; offset < line.length; offset += maxLength) chunks.push(line.slice(offset, offset + maxLength));
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function buildEvidenceChunks(parsed, maxLength = 1800) {
  const chunks = [];
  for (const section of parsed.sections || []) {
    const parts = splitText(section.text, maxLength);
    parts.forEach((content, index) => {
      chunks.push({
        locator: parts.length > 1 ? `${section.locator} · 片段 ${index + 1}` : section.locator,
        content
      });
    });
    if (chunks.length >= MAX_EVIDENCE_CHUNKS) break;
  }
  return chunks.slice(0, MAX_EVIDENCE_CHUNKS);
}

