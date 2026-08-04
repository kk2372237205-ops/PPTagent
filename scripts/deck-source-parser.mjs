import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";

const MAX_EXTRACTED_CHARACTERS = 2_000_000;
const MAX_EVIDENCE_CHUNKS = 500;

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

function trimExtracted(text) {
  const normalized = String(text || "").replace(/\u0000/g, "").trim();
  return normalized.length > MAX_EXTRACTED_CHARACTERS
    ? `${normalized.slice(0, MAX_EXTRACTED_CHARACTERS)}\n\n[资料过长，已保留前 ${MAX_EXTRACTED_CHARACTERS} 个字符]`
    : normalized;
}

async function parseDocx(buffer) {
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
  return { kind: "docx", sections, metadata: { sectionCount: sections.length } };
}

async function parsePptx(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => naturalNumber(a) - naturalNumber(b));
  const sections = [];
  for (const name of slideNames) {
    const xml = await zip.file(name)?.async("string");
    const slideIndex = naturalNumber(name);
    const text = xmlText(xml || "", ["a:p"]);
    if (text) sections.push({ locator: `第 ${slideIndex} 页`, text });
  }
  return { kind: "pptx", sections, metadata: { slideCount: slideNames.length } };
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

async function parseXlsx(buffer) {
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
  return { kind: "xlsx", sections, metadata: { sheetCount: sheets.length } };
}

async function parsePdf(buffer) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
    isEvalSupported: false,
    useSystemFonts: true
  });
  const document = await task.promise;
  const sections = [];
  for (let pageIndex = 1; pageIndex <= document.numPages; pageIndex += 1) {
    const page = await document.getPage(pageIndex);
    const content = await page.getTextContent();
    const text = content.items.map(item => typeof item.str === "string" ? item.str : "").filter(Boolean).join(" ");
    if (text.trim()) sections.push({ locator: `第 ${pageIndex} 页`, text: text.trim() });
  }
  await document.destroy();
  return { kind: "pdf", sections, metadata: { pageCount: document.numPages } };
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

export async function parseDeckSourceFile(filePath, originalName, mimeType = "") {
  const extension = path.extname(originalName || filePath).toLowerCase();
  const buffer = await readFile(filePath);
  let parsed;
  if (extension === ".pdf" || mimeType === "application/pdf") parsed = await parsePdf(buffer);
  else if (extension === ".docx") parsed = await parseDocx(buffer);
  else if (extension === ".pptx") parsed = await parsePptx(buffer);
  else if (extension === ".xlsx") parsed = await parseXlsx(buffer);
  else if ([".txt", ".md", ".csv", ".json"].includes(extension)) {
    parsed = { kind: extension.slice(1), sections: [{ locator: "全文", text: plainText(buffer, extension) }], metadata: {} };
  } else if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension) || mimeType.startsWith("image/")) {
    parsed = { kind: "image", sections: [], metadata: { needsVision: true } };
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

