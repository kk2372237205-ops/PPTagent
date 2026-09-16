import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { FormData } from "undici";
import { buildEvidenceChunks, parseDeckSourceFile } from "./deck-source-parser.mjs";
import {
  aiImageConfig,
  aiTextConfig,
  createServiceFetch,
  imageGenerationBody,
  requireImageService,
  requireTextService,
  textEndpoint,
  textFromResponse,
  textRequestBody
} from "./ai-service-client.mjs";

const root = process.cwd();
loadEnv();

const db = new PrismaClient();
const workspaceRoot = path.join(root, "uploads", "employee-workspace");
const imageRoot = path.join(workspaceRoot, "images");
const documentRoot = path.join(workspaceRoot, "documents");
const deckSourceRoot = path.join(workspaceRoot, "deck-generation", "sources");
const deckThemeRoot = path.join(workspaceRoot, "deck-generation", "themes");
const deckEvidenceRoot = path.join(workspaceRoot, "deck-generation", "evidence");
const skillRoot = path.join(root, "skills", "deck-generation");
const pollMs = Math.max(1200, Number(process.env.DECK_GENERATION_POLL_MS || 2500));
const deckGenerationConcurrency = Math.min(4, Math.max(1, Number(process.env.DECK_GENERATION_CONCURRENCY || 2)));
const advancedDeckGenerationConcurrency = Math.min(6, Math.max(1, Number(process.env.DECK_ADVANCED_GENERATION_CONCURRENCY || 6)));
const advancedSourceReadConcurrency = Math.min(3, Math.max(1, Number(process.env.DECK_ADVANCED_SOURCE_CONCURRENCY || 3)));
const maxAdvancedVisualEvidence = 4;
const advancedImageReferencesEnabled = process.env.DECK_ADVANCED_REFERENCE_IMAGES !== "0";
// Advanced mode reads images only when OCR is necessary. Uploaded source images
// are intentionally not reused as final-slide artwork.
const advancedSourceVisualReuseEnabled = false;
const protectedEvidenceMasksEnabled = false;
const advancedVisualTimeoutMs = Math.max(120000, Number(process.env.DECK_ADVANCED_VISUAL_TIMEOUT_MS || 180000));
// The final advanced plan is the only GPT call that must consider every confirmed page together.
// It keeps a longer budget without extending unrelated text requests.
const advancedPlanTimeoutMs = Math.max(300000, Number(process.env.DECK_ADVANCED_PLAN_TIMEOUT_MS || 900000));
// Image2 can queue for more than five minutes under advanced-mode concurrency.
// Wait for the original paid request instead of forcing a manual duplicate call.
const advancedImageTimeoutMs = Math.max(300000, Number(process.env.DECK_ADVANCED_IMAGE_TIMEOUT_MS || 600000));
const textService = aiTextConfig();
// Advanced Generate PPT can still be overridden independently, but follows
// the verified global text model when no dedicated override is configured.
const advancedTextService = {
  ...textService,
  model: String(process.env.DECK_ADVANCED_TEXT_MODEL || "").trim() || textService.model
};
const imageService = aiImageConfig();
const textRequest = createServiceFetch(textService);
const advancedTextRequest = createServiceFetch(advancedTextService);
const imageRequest = createServiceFetch(imageService);
const externalRequest = createServiceFetch({ serviceName: "Codia", proxyUrl: process.env.CODIA_PROXY_URL || "" });
const codiaBaseUrl = trimSlash(process.env.CODIA_BASE_URL || "https://openapi.codia.ai");

function loadEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(root, fileName);
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

function trimSlash(value) {
  return String(value || "").replace(/\/$/, "");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function codiaRequest(url, init = {}, timeoutMs = 300000) {
  let lastError;
  const retryDelays = [1200, 3000];
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    try {
      return await externalRequest(url, init, timeoutMs);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transientNetworkFailure = /fetch failed|enotfound|econn|etimedout|socket|tls|network/i.test(message);
      if (!transientNetworkFailure || attempt >= retryDelays.length) throw error;
      await sleep(retryDelays[attempt]);
    }
  }
  throw lastError;
}

function nowName(extension) {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
}

async function ensureDirs() {
  await Promise.all([
    mkdir(imageRoot, { recursive: true }),
    mkdir(documentRoot, { recursive: true }),
    mkdir(deckSourceRoot, { recursive: true }),
    mkdir(deckThemeRoot, { recursive: true }),
    mkdir(deckEvidenceRoot, { recursive: true })
  ]);
}

function readSkill(name) {
  return readFileSync(path.join(skillRoot, name), "utf8").trim();
}

function skillBundle(options = {}) {
  return [
    readSkill("SKILL.md"),
    ...(options.colorNeutral ? [readSkill("advanced-layout-profiles.md")] : [readSkill("style-packs.md")]),
    readSkill("visual-identity.md"),
    readSkill("visual-storyboard.md"),
    readSkill("slide-image-specs.md"),
    readSkill("illustration-system.md"),
    readSkill("regeneration-controls.md"),
    readSkill("source-grounding.md"),
    readSkill("outline-control.md"),
    readSkill("content-density.md"),
    readSkill("palette-reference.md"),
    readSkill("quality-audit.md")
  ].join("\n\n---\n\n");
}

function advancedDirectorSkillBundle() {
  const directorRoot = path.join(skillRoot, "advanced-single-slide-director");
  return [
    "SKILL.md",
    path.join("references", "page-archetypes.md"),
    path.join("references", "evidence-and-authenticity.md")
  ].map(name => readFileSync(path.join(directorRoot, name), "utf8").trim()).join("\n\n---\n\n");
}


function providerError(result, fallback) {
  const message = String(result?.error?.message || result?.message || fallback);
  if (/insufficient account balance|insufficient balance|account balance/i.test(message)) {
    if (/图片/.test(fallback)) {
      return "gpt-image-2 图片中转账户余额不足。请补充 AI_IMAGE_API_KEY 所属账户或分组的余额后重试本页。";
    }
    return "YZStudio 已收到 GPT-5.6 请求，但返回文字账户余额不足；这不是配置缺项。请在 YZStudio 为 AI_TEXT_API_KEY 所属文字分组兑换或补充额度，确认套餐、每日额度和永久额度可用后，再点击“重新分析资料”。";
  }
  return message;
}

function codiaConfig() {
  const key = process.env.CODIA_API_KEY?.replace(/^["']|["']$/g, "").trim();
  if (!key) throw new Error("尚未配置 CODIA_API_KEY，无法将 PDF 转换为 PPT。请在 .env 里补全 CODIA_API_KEY。");
  return { key };
}


async function openAiInput(input, options = {}) {
  const service = options.service || textService;
  const request = options.request || textRequest;
  requireTextService(service);
  const body = textRequestBody(service, input, { json: Boolean(options.json) });
  if (options.json && service.apiMode !== "responses") {
    body.response_format = { type: "json_object" };
  }
  const response = await request(textEndpoint(service), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${service.apiKey}`
    },
    body: JSON.stringify(body)
  }, options.timeoutMs);
  const result = await response.json();
  if (!response.ok) throw new Error(providerError(result, "文字中转服务生成失败"));
  const text = textFromResponse(result);
  if (!text) throw new Error("文字中转服务没有返回可读文本");
  return text;
}

async function openAiText(prompt, options = {}) {
  return openAiInput(prompt, options);
}

function jsonFromText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可用 JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}

async function openAiJson(prompt, options = {}) {
  let text = await openAiText(prompt, options);
  try {
    return jsonFromText(text);
  } catch {
    text = await openAiText(`${prompt}\n\n你上一次没有返回合法 JSON。请只返回一个 JSON object，不要 Markdown，不要解释。`, options);
    return jsonFromText(text);
  }
}

function advancedTextOptions(options = {}) {
  return { ...options, service: advancedTextService, request: advancedTextRequest };
}

async function openAdvancedAiInput(input, options = {}) {
  return openAiInput(input, advancedTextOptions(options));
}

async function openAdvancedAiJson(prompt, options = {}) {
  return openAiJson(prompt, advancedTextOptions(options));
}

async function openAiImage(prompt, timeoutMs = 300000) {
  requireImageService(imageService);
  const response = await imageRequest(`${imageService.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${imageService.apiKey}`
    },
    body: JSON.stringify(imageGenerationBody(imageService, prompt))
  }, timeoutMs);
  const result = await response.json();
  if (!response.ok || !result.data?.[0]) throw new Error(providerError(result, "图片中转服务生成失败"));
  const image = result.data[0];
  if (image.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image.url) {
    const download = await imageRequest(image.url, {}, 120000);
    if (!download.ok) throw new Error("图片中转服务生成图下载失败");
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("图片中转服务没有返回图片内容");
}

function imageMimeType(fileName) {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function imageBufferFromResult(result) {
  const image = result?.data?.[0];
  if (!image) throw new Error("图片中转服务没有返回图片内容");
  if (image.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image.url) {
    const download = await imageRequest(image.url, {}, 120000);
    if (!download.ok) throw new Error("图片中转服务生成图下载失败");
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("图片中转服务没有返回图片内容");
}

async function referenceContactSheet(references) {
  const tileWidth = 960;
  const tileHeight = 540;
  const columns = references.length > 1 ? 2 : 1;
  const rows = Math.ceil(references.length / columns);
  const composites = [];
  for (let index = 0; index < references.length; index += 1) {
    const image = await sharp(references[index].buffer)
      .resize(tileWidth, tileHeight, { fit: "contain", background: "#f3f4f6" })
      .png()
      .toBuffer();
    composites.push({ input: image, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight });
  }
  return sharp({
    create: { width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#f3f4f6" }
  }).composite(composites).png().toBuffer();
}

function normalizedProtectedRegion(value, fallback) {
  const source = value && typeof value === "object" ? value : {};
  const number = (key, defaultValue) => {
    const parsed = Number(source[key]);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  };
  const x = Math.max(0.06, Math.min(0.88, number("x", fallback.x)));
  const y = Math.max(0.14, Math.min(0.82, number("y", fallback.y)));
  const w = Math.max(0.12, Math.min(0.82, number("w", fallback.w)));
  const h = Math.max(0.12, Math.min(0.70, number("h", fallback.h)));
  return {
    x,
    y,
    w: Math.min(w, 0.94 - x),
    h: Math.min(h, 0.90 - y)
  };
}

function evidenceCapacityForArchetype(value) {
  const archetype = String(value || "").toLowerCase();
  if (archetype === "cover" || archetype === "summary-close") return 1;
  if (archetype === "evidence-wall") return 4;
  if (archetype === "problem-diagnosis") return 2;
  if (["validation", "principle"].includes(archetype)) return 3;
  return 2;
}

function evidenceRenderMode(archetype, evidence) {
  const normalizedArchetype = String(archetype || "").toLowerCase();
  if (String(evidence?.kind || "") === "data-proof" && ["roadmap", "content-close"].includes(normalizedArchetype)) {
    return "grounded-redraw";
  }
  return "pixel-lock";
}

function defaultProtectedEvidenceRegions(contract, count) {
  const archetype = String(contract?.director_contract?.page_archetype || "").toLowerCase();
  const layouts = {
    cover: [
      { x: 0.62, y: 0.15, w: 0.33, h: 0.70 },
      { x: 0.53, y: 0.72, w: 0.25, h: 0.13 },
      { x: 0.79, y: 0.72, w: 0.15, h: 0.13 }
    ],
    "evidence-wall": [
      { x: 0.06, y: 0.22, w: 0.43, h: 0.56 },
      { x: 0.55, y: 0.22, w: 0.37, h: 0.16 },
      { x: 0.55, y: 0.43, w: 0.37, h: 0.16 },
      { x: 0.55, y: 0.64, w: 0.37, h: 0.14 }
    ],
    validation: [
      { x: 0.07, y: 0.24, w: 0.48, h: 0.52 },
      { x: 0.60, y: 0.25, w: 0.32, h: 0.24 },
      { x: 0.60, y: 0.55, w: 0.32, h: 0.21 }
    ],
    "market-analysis": [
      { x: 0.07, y: 0.28, w: 0.42, h: 0.43 },
      { x: 0.56, y: 0.27, w: 0.36, h: 0.20 },
      { x: 0.56, y: 0.53, w: 0.36, h: 0.20 }
    ],
    "content-close": [
      { x: 0.07, y: 0.31, w: 0.42, h: 0.42 },
      { x: 0.56, y: 0.31, w: 0.36, h: 0.20 },
      { x: 0.56, y: 0.57, w: 0.36, h: 0.17 }
    ],
    roadmap: [
      { x: 0.07, y: 0.29, w: 0.43, h: 0.42 },
      { x: 0.56, y: 0.29, w: 0.36, h: 0.20 },
      { x: 0.56, y: 0.55, w: 0.36, h: 0.17 }
    ]
  };
  const fallback = layouts[archetype] || [
    { x: 0.52, y: 0.25, w: 0.41, h: 0.48 },
    { x: 0.07, y: 0.27, w: 0.38, h: 0.20 },
    { x: 0.07, y: 0.54, w: 0.38, h: 0.18 }
  ];
  const supplied = contract?.director_contract?.protected_evidence_layout;
  const suppliedRegions = Array.isArray(supplied)
    ? supplied
    : supplied && typeof supplied === "object"
      ? [supplied.primary, ...(Array.isArray(supplied.secondary) ? supplied.secondary : [])]
      : [];
  return Array.from({ length: count }, (_, index) => normalizedProtectedRegion(
    suppliedRegions[index],
    fallback[index] || fallback[fallback.length - 1]
  ));
}

function protectedEvidenceRegions(contract, evidence) {
  const capacity = evidenceCapacityForArchetype(contract?.director_contract?.page_archetype);
  const regions = defaultProtectedEvidenceRegions(contract, Math.min(capacity, Math.max(0, evidence.length)));
  return regions.map((region, index) => {
    const reference = evidence[index];
    if (!reference?.focusFallback) return region;
    const primary = index === 0;
    const directProof = String(reference.kind || "") === "direct-proof";
    const maximumWidth = primary ? 0.32 : 0.26;
    const maximumHeight = primary ? (directProof ? 0.42 : 0.34) : (directProof ? 0.24 : 0.20);
    const w = Math.min(region.w, maximumWidth);
    const h = Math.min(region.h, maximumHeight);
    return {
      x: Math.max(0.06, Math.min(0.94 - w, region.x + (region.w - w) / 2)),
      y: Math.max(0.14, Math.min(0.90 - h, region.y + (region.h - h) / 2)),
      w,
      h
    };
  });
}

function presentationPalette(contract) {
  const palette = contract?.global_style_fingerprint?.palette_contract || {};
  const colors = contract?.palette_lock?.allowed_presentation_colors || [];
  return {
    background: validHexColor(palette.background, colors[0] || "#111B2E"),
    surface: validHexColor(palette.surface, colors[1] || colors[0] || "#162A4A"),
    primaryText: validHexColor(palette.primary_text, colors[2] || "#F0F0F1"),
    secondaryText: validHexColor(palette.secondary_text, colors[3] || "#A1A2AA"),
    accent: validHexColor(palette.accent, colors[3] || colors[1] || "#5A86C4"),
    line: validHexColor(palette.accent_secondary, colors[4] || colors[2] || "#7288A8")
  };
}

function selectedProtectedEvidenceReferences(contract, references) {
  const archetype = String(contract?.director_contract?.page_archetype || "").toLowerCase();
  const maximum = evidenceCapacityForArchetype(archetype);
  return references
    .filter(reference => /authentic page evidence/i.test(reference.role) && reference.pixelLockRequired !== false && reference.protectedEligible !== false)
    .slice(0, maximum);
}

function isFlattenedSlideReference(reference) {
  const width = Number(reference?.width || 0);
  const height = Number(reference?.height || 0);
  const ratio = height > 0 ? width / height : 0;
  return /\.pptx$/i.test(String(reference?.sourceName || ""))
    && /^第\s*\d+\s*页$/.test(String(reference?.locator || "").trim())
    && ratio >= 1.5
    && ratio <= 1.95;
}

function acceptableEvidenceFocusBox(reference, value) {
  const box = normalizeSourceFocusBox(value);
  if (!box) return null;
  if (!isFlattenedSlideReference(reference)) return box;
  const area = box.w * box.h;
  if (area > 0.52 || (box.w > 0.84 && box.h > 0.58)) return null;
  return box;
}

function localEvidenceCropCandidates(kind) {
  const photoWindows = [0.04, 0.225, 0.41, 0.595, 0.78].flatMap(x => ([
    { x, y: 0.24, w: 0.175, h: 0.25 },
    { x, y: 0.50, w: 0.175, h: 0.26 }
  ]));
  const thirds = [
    { x: 0.04, y: 0.26, w: 0.29, h: 0.36 },
    { x: 0.355, y: 0.26, w: 0.29, h: 0.36 },
    { x: 0.67, y: 0.26, w: 0.29, h: 0.36 },
    { x: 0.04, y: 0.50, w: 0.29, h: 0.34 },
    { x: 0.355, y: 0.50, w: 0.29, h: 0.34 },
    { x: 0.67, y: 0.50, w: 0.29, h: 0.34 }
  ];
  const halves = [
    { x: 0.04, y: 0.27, w: 0.44, h: 0.42 },
    { x: 0.52, y: 0.27, w: 0.44, h: 0.42 },
    { x: 0.04, y: 0.43, w: 0.44, h: 0.40 },
    { x: 0.52, y: 0.43, w: 0.44, h: 0.40 }
  ];
  const portraits = [
    { x: 0.04, y: 0.28, w: 0.24, h: 0.56 },
    { x: 0.28, y: 0.28, w: 0.24, h: 0.56 },
    { x: 0.52, y: 0.28, w: 0.24, h: 0.56 },
    { x: 0.72, y: 0.28, w: 0.24, h: 0.56 }
  ];
  return kind === "direct-proof"
    ? [...portraits, ...halves, ...thirds]
    : kind === "real-world"
      ? [...photoWindows, ...thirds, ...halves]
      : [...halves, ...thirds, ...portraits];
}

async function localEvidenceFocusBox(reference) {
  if (!isFlattenedSlideReference(reference)) {
    return { box: normalizeSourceFocusBox({ x: 0, y: 0, w: 1, h: 1 }), confidence: 1 };
  }
  const metadata = await sharp(reference.buffer, { animated: false }).metadata();
  const width = Number(metadata.width || reference.width || 0);
  const height = Number(metadata.height || reference.height || 0);
  if (!width || !height) return null;
  const kind = String(reference.cropIntent || reference.kind || "context").toLowerCase();
  let best = null;
  for (const candidate of localEvidenceCropCandidates(kind)) {
    const left = Math.max(0, Math.min(width - 1, Math.round(candidate.x * width)));
    const top = Math.max(0, Math.min(height - 1, Math.round(candidate.y * height)));
    const cropWidth = Math.max(1, Math.min(width - left, Math.round(candidate.w * width)));
    const cropHeight = Math.max(1, Math.min(height - top, Math.round(candidate.h * height)));
    const { data, info } = await sharp(reference.buffer, { animated: false })
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .resize(72, 48, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const channels = Math.max(3, Number(info.channels || 3));
    let luminance = 0;
    let luminanceSquared = 0;
    let nearWhite = 0;
    let colorSpread = 0;
    let edge = 0;
    let verticalEdge = 0;
    let edgeCount = 0;
    let verticalEdgeCount = 0;
    const quantizedColors = new Set();
    const pixels = Math.max(1, Math.floor(data.length / channels));
    for (let index = 0; index < pixels; index += 1) {
      const offset = index * channels;
      const red = data[offset] || 0;
      const green = data[offset + 1] || 0;
      const blue = data[offset + 2] || 0;
      const value = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      luminance += value;
      luminanceSquared += value * value;
      if (value > 214 && Math.max(red, green, blue) - Math.min(red, green, blue) < 34) nearWhite += 1;
      colorSpread += Math.max(red, green, blue) - Math.min(red, green, blue);
      quantizedColors.add(`${red >> 4},${green >> 4},${blue >> 4}`);
      if (index % 72 !== 0) {
        const previousOffset = offset - channels;
        const previous = (data[previousOffset] || 0) * 0.2126 + (data[previousOffset + 1] || 0) * 0.7152 + (data[previousOffset + 2] || 0) * 0.0722;
        edge += Math.abs(value - previous);
        edgeCount += 1;
      }
      if (index >= 72) {
        const previousOffset = offset - 72 * channels;
        const previous = (data[previousOffset] || 0) * 0.2126 + (data[previousOffset + 1] || 0) * 0.7152 + (data[previousOffset + 2] || 0) * 0.0722;
        verticalEdge += Math.abs(value - previous);
        verticalEdgeCount += 1;
      }
    }
    const mean = luminance / pixels;
    const deviation = Math.sqrt(Math.max(0, luminanceSquared / pixels - mean * mean)) / 255;
    const whiteRatio = nearWhite / pixels;
    const colorfulness = colorSpread / (pixels * 255);
    const edgeStrength = edge / (Math.max(1, edgeCount) * 255);
    const verticalEdgeStrength = verticalEdge / (Math.max(1, verticalEdgeCount) * 255);
    const colorDiversity = quantizedColors.size / pixels;
    const candidateArea = candidate.w * candidate.h;
    const score = kind === "direct-proof"
      ? whiteRatio * 2.8 + deviation * 1.2 + edgeStrength * 1.5 - candidateArea * 1.6
      : kind === "real-world"
        ? deviation * 1.2
          + colorfulness * 1.1
          + edgeStrength * 0.8
          + verticalEdgeStrength * 0.8
          + colorDiversity * 1.5
          - whiteRatio * 0.4
          - candidateArea * 1.2
          - (candidate.y >= 0.45 ? 0.28 : 0)
        : deviation * 1.5 + edgeStrength * 1.7 + whiteRatio * 0.8 + colorfulness * 0.4;
    if (!best || score > best.score) best = { box: candidate, score };
  }
  if (!best || best.score < 0.12) return null;
  return { box: normalizeSourceFocusBox(best.box), confidence: Math.min(0.79, Math.max(0.45, best.score)) };
}

async function ensureProtectedEvidenceFocusBoxes(contract, references) {
  const selected = selectedProtectedEvidenceReferences(contract, references);
  for (const reference of selected) {
    reference.focusBox = acceptableEvidenceFocusBox(reference, reference.focusBox);
    reference.protectedEligible = Boolean(reference.focusBox);
  }
  const missing = selected.filter(reference => (
    !reference.focusBox
    || reference.focusFallback
    || (reference.coverageLabel && !/coverage-object-crop/.test(String(reference.focusMethod || "")))
  ));
  if (!missing.length) return selected;
  const catalog = missing.map((reference, index) => ({
    index: index + 1,
    evidence_id: reference.evidenceId,
    kind: reference.kind,
    coverage_label: reference.coverageLabel || "",
    crop_intent: reference.cropIntent || reference.kind || "context",
    locator: reference.locator,
    description: reference.description,
    is_primary: /PRIMARY/i.test(reference.role)
  }));
  const instruction = [
    "你是 GPT-5.6，负责给高级版 PPT 的真实视觉证据选取可直接嵌入新页面的裁切区域。每张输入图都来自用户上传资料，顺序与目录一致。",
    `页面标题：${contract?.immutable_content?.title || ""}`,
    `页面证明目标：${contract?.director_contract?.proof_goal || ""}`,
    `目录：${JSON.stringify(catalog)}`,
    "只返回 JSON object：",
    '{"assets":[{"index":1,"focus_box":{"x":0,"y":0,"w":1,"h":1},"confidence":0.0,"contains_source_chrome":false,"reason":""}]}',
    "focus_box 使用 0-1 归一化坐标。只框出能直接证明本页结论的真实产品、设备、人物现场、证书、报告、图表或技术图；必须排除原页标题、页眉页脚、整页背景、装饰和与本页无关的大段文字。",
    "必须遵守目录中的 coverage_label 和 crop_intent：知识产权、检测、合作选择可识别的证书、报告或协议对象；真实应用必须选择现场、列车、产品或设备照片，不能选择同页的协议、指标条、图表或大段文字。",
    "如果输入是扁平化的整张幻灯片，focus_box 面积不得超过原图的 52%，不得把整张幻灯片或大半张幻灯片当作证据。contains_source_chrome 表示裁片是否仍含明显的原幻灯片标题、页眉、页脚或整套边框；有则为 true。",
    "裁切必须保留主体完整和来源身份，不得只截一个无法识别的细节；主证据优先选择最大、最清楚、最适合正式演示的区域。每张图都返回一项。"
  ].join("\n");
  let plannedAssets = [];
  try {
    const result = await withTransientRetry(() => openAiVisionBuffersJson(
      missing.map(reference => reference.buffer),
      instruction,
      advancedTextOptions()
    ));
    plannedAssets = normalizeArray(result.assets);
  } catch (error) {
    console.warn("[deck-generation] evidence focus planning is unavailable; using deterministic source crops:", error instanceof Error ? error.message : String(error));
  }
  const byIndex = new Map(plannedAssets.map(item => [Number(item.index), item]));
  for (let index = 0; index < missing.length; index += 1) {
    const reference = missing[index];
    const planned = byIndex.get(index + 1) || {};
    const plannedFocusBox = Number(planned.confidence || 0) >= 0.55 && planned.contains_source_chrome !== true
      ? acceptableEvidenceFocusBox(reference, planned.focus_box)
      : null;
    const localFocus = plannedFocusBox ? null : await localEvidenceFocusBox(reference);
    const focusBox = plannedFocusBox || acceptableEvidenceFocusBox(reference, localFocus?.box);
    reference.focusBox = focusBox;
    reference.focusFallback = !plannedFocusBox;
    reference.focusMethod = plannedFocusBox
      ? reference.coverageLabel ? "gpt-5.6-coverage-object-crop" : "gpt-5.6-object-crop"
      : focusBox
        ? reference.coverageLabel ? "local-coverage-object-crop" : "local-object-crop"
        : "unavailable";
    reference.protectedEligible = Boolean(focusBox);
    const tags = normalizeArray(reference.tags).filter(tag => !String(tag).startsWith("__focus=") && !String(tag).startsWith("__focus_fallback=") && !String(tag).startsWith("__focus_method="));
    reference.tags = [
      ...tags,
      ...(focusBox ? [sourceFocusTag(focusBox)] : []),
      `__focus_method=${reference.focusMethod}`,
      ...(reference.focusFallback && focusBox ? [`__focus_fallback=v2:${String(reference.cropIntent || reference.kind || "context")}:${Number(localFocus?.confidence || 0).toFixed(3)}`] : [])
    ].filter(Boolean);
    if (reference.evidenceId) {
      try {
        await db.deckGenerationVisualEvidence.update({
          where: { id: reference.evidenceId },
          data: { tagsJson: JSON.stringify(reference.tags) }
        });
      } catch (error) {
        console.warn("[deck-generation] evidence focus crop could not be cached:", reference.evidenceId, error instanceof Error ? error.message : String(error));
      }
    }
  }
  return selected;
}

async function focusedEvidenceBuffer(reference) {
  const focusBox = normalizeSourceFocusBox(reference.focusBox);
  if (!focusBox) return reference.buffer;
  const metadata = await sharp(reference.buffer, { animated: false }).metadata();
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  if (!width || !height) return reference.buffer;
  const left = Math.max(0, Math.min(width - 1, Math.round(focusBox.x * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(focusBox.y * height)));
  const cropWidth = Math.max(1, Math.min(width - left, Math.round(focusBox.w * width)));
  const cropHeight = Math.max(1, Math.min(height - top, Math.round(focusBox.h * height)));
  return sharp(reference.buffer, { animated: false })
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .png()
    .toBuffer();
}

function wrapVisibleText(value, maximumCharacters, maximumLines) {
  const remainingCharacters = Array.from(String(value || "").trim());
  const lines = [];
  while (remainingCharacters.length && lines.length < maximumLines) {
    if (remainingCharacters.length <= maximumCharacters) {
      lines.push(remainingCharacters.splice(0).join(""));
      break;
    }
    const searchStart = Math.max(1, Math.floor(maximumCharacters * 0.58));
    let cut = maximumCharacters;
    for (let index = maximumCharacters - 1; index >= searchStart; index -= 1) {
      if (/[，。；、：,.!?！？\s]/.test(remainingCharacters[index])) {
        cut = index + 1;
        break;
      }
    }
    lines.push(remainingCharacters.splice(0, cut).join("").trim());
  }
  if (remainingCharacters.length && lines.length) {
    const last = Array.from(lines[lines.length - 1]);
    const room = Math.max(0, maximumCharacters - last.length);
    lines[lines.length - 1] = `${lines[lines.length - 1]}${remainingCharacters.splice(0, room).join("")}`;
  }
  return lines.filter(Boolean);
}

function coverTitleLines(value) {
  const title = String(value || "").trim();
  const divider = title.indexOf("——");
  if (divider < 0) return wrapVisibleText(title, 9, 3);
  const prefix = title.slice(0, divider + 2);
  return [prefix, ...wrapVisibleText(title.slice(divider + 2), 6, 2)].filter(Boolean);
}

function deterministicCoverOverlay(run, slide, contract, palette) {
  const titleLines = coverTitleLines(contract?.immutable_content?.title || slide.title || run.projectName);
  const positioning = String(contract?.editable_content?.blocks?.[0]?.content || contract?.editable_content?.conclusion || "").trim();
  const bodyLines = wrapVisibleText(positioning, 24, 3);
  const exactVisible = normalizeArray(contract?.immutable_content?.exact_visible_text).map(String);
  const projectLabel = exactVisible.find(item => item && item !== contract?.immutable_content?.title) || run.projectName;
  const titleMarkup = titleLines.map((line, index) => (
    `<text x="124" y="${220 + index * 100}" fill="${palette.primaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="${index === 0 ? 72 : 82}" font-weight="700">${xmlText(line)}</text>`
  )).join("");
  const bodyMarkup = bodyLines.map((line, index) => (
    `<text x="126" y="${690 + index * 50}" fill="${palette.secondaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="34" font-weight="400">${xmlText(line)}</text>`
  )).join("");
  return Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <rect x="78" y="92" width="1024" height="820" fill="${palette.background}" fill-opacity=".18"/>
    <path d="M124 130H420" stroke="${palette.accent}" stroke-width="10" opacity=".72"/>
    <path d="M124 574H826" stroke="${palette.line}" stroke-width="2" opacity=".58"/>
    ${titleMarkup}
    <text x="126" y="640" fill="${palette.primaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="32" font-weight="700">项目定位</text>
    ${bodyMarkup}
    <path d="M124 1000H760" stroke="${palette.line}" stroke-width="2" opacity=".64"/>
    <text x="126" y="988" fill="${palette.primaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="26" font-weight="600">${xmlText(projectLabel)}</text>
    <text x="796" y="988" fill="${palette.primaryText}" font-family="Arial" font-size="28" font-weight="600">${slide.slideIndex}/${run.pageCount}</text>
  </svg>`);
}

function deterministicEvidenceWallOverlay(run, slide, contract, palette) {
  const titleLines = wrapVisibleText(contract?.immutable_content?.title || slide.title || "", 29, 2);
  const takeaway = String(
    contract?.director_contract?.unique_takeaway
    || contract?.editable_content?.conclusion
    || ""
  ).trim();
  const takeawayLines = wrapVisibleText(takeaway, 48, 2);
  const titleMarkup = titleLines.map((line, index) => (
    `<text x="112" y="${154 + index * 58}" fill="${palette.primaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="50" font-weight="700">${xmlText(line)}</text>`
  )).join("");
  const takeawayMarkup = takeawayLines.map((line, index) => (
    `<text x="122" y="${936 + index * 38}" fill="${palette.secondaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="25" font-weight="500">${xmlText(line)}</text>`
  )).join("");
  return Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <path d="M112 100H1810" stroke="${palette.line}" stroke-width="2" opacity=".6"/>
    <rect x="112" y="118" width="12" height="48" fill="${palette.accent}" opacity=".9"/>
    ${titleMarkup}
    <path d="M112 895H1810" stroke="${palette.line}" stroke-width="2" opacity=".54"/>
    ${takeawayMarkup}
    <text x="1760" y="1006" fill="${palette.primaryText}" font-family="Arial" font-size="26" font-weight="600">${slide.slideIndex}/${run.pageCount}</text>
  </svg>`);
}

function evidenceWallFactCaption(reference) {
  const text = normalizeArray(reference?.facts).join("\n");
  const label = String(reference?.coverageLabel || "");
  const firstMatch = patterns => patterns.map(pattern => text.match(pattern)?.[0]).find(Boolean) || "";
  if (label === "知识产权") {
    const patent = firstMatch([/(?:申请)?专利\s*\d+\s*项/, /\d+\s*项专利/]);
    const softwareCount = text.match(/软件著作权?\s*(\d+)\s*项/)?.[1]
      || text.match(/(\d+)\s*项软件著作权?/)?.[1];
    const software = softwareCount ? `软件著作权${softwareCount}项` : "";
    return [patent, software].filter(Boolean).join(" · ").slice(0, 28);
  }
  if (label === "检测") {
    return firstMatch([
      /各项指标均达到国家标准/,
      /使用寿命\s*[≥＞>]?\s*\d+(?:\.\d+)?\s*万?公里/,
      /(?:第三方)?检测(?:初步)?验收/
    ]).slice(0, 28);
  }
  if (label === "合作") {
    return firstMatch([
      /通过[^。；\n]{0,10}(?:检测)?初步验收/,
      /与[^。；\n]{2,18}(?:开展|合作)/,
      /合作单位为[^。；\n]{2,18}/
    ]).slice(0, 28);
  }
  if (label === "真实应用") {
    const unitCount = text.match(/(?:安装|试装)\s*(\d+)\s*套/)?.[1];
    const monthCount = text.match(/(?:为期|测试为期)\s*(\d+)\s*个?月/)?.[1]
      || text.match(/实车测试[^。；\n]{0,8}(\d+)\s*个?月/)?.[1];
    const units = unitCount ? `${unitCount}套` : "";
    const duration = monthCount ? `${monthCount}个月实车测试` : "";
    return [units, duration].filter(Boolean).join(" · ").slice(0, 28);
  }
  return "";
}

async function protectedEvidenceCanvas(run, slide, contract, references) {
  const evidence = selectedProtectedEvidenceReferences(contract, references);
  if (!evidence.length) return null;
  const width = 1920;
  const height = 1080;
  const palette = presentationPalette(contract);
  const archetype = String(contract?.director_contract?.page_archetype || "").toLowerCase();
  const backgroundFill = archetype === "cover" ? "url(#cover-background)" : palette.background;
  const baseSvg = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cover-background" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${palette.line}"/>
        <stop offset="0.54" stop-color="${palette.background}"/>
        <stop offset="1" stop-color="${palette.surface}"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="${backgroundFill}"/>
    <path d="M120 114H1800 M120 966H1800" stroke="${palette.line}" stroke-width="3" opacity=".52"/>
    <path d="M120 140H720 M120 930H960" stroke="${palette.accent}" stroke-width="10" opacity=".38"/>
    <path d="M120 190H1800 M120 220H1800 M120 250H1800" stroke="${palette.line}" stroke-width="1" opacity=".16"/>
    <path d="M120 870H1800 M120 900H1800" stroke="${palette.line}" stroke-width="1" opacity=".14"/>
  </svg>`);
  let canvas = await sharp(baseSvg).png().toBuffer();
  const layoutLocks = [];
  let postprocess = null;
  if (archetype === "cover") {
    const coverOverlay = deterministicCoverOverlay(run, slide, contract, palette);
    const visualPanel = Buffer.from(`<svg width="710" height="860" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="710" height="860" fill="${palette.surface}" fill-opacity=".32"/>
      <rect x="1.5" y="1.5" width="707" height="857" fill="none" stroke="${palette.primaryText}" stroke-width="2" opacity=".28"/>
      <path d="M32 46H326 M384 814H678" stroke="${palette.accent}" stroke-width="8" opacity=".46"/>
    </svg>`);
    canvas = await sharp(canvas).composite([
      { input: coverOverlay, left: 0, top: 0 },
      { input: visualPanel, left: 1152, top: 92 }
    ]).png().toBuffer();
    postprocess = {
      kind: "deterministic_cover",
      palette,
      coverOverlay,
      visualPanel,
      visualPanelLeft: 1152,
      visualPanelTop: 92,
      evidenceComposites: []
    };
    layoutLocks.push({
      x: 0.04,
      y: 0.08,
      w: 0.54,
      h: 0.78,
      xPx: 76,
      yPx: 86,
      wPx: 1038,
      hPx: 842,
      type: "deterministic_cover_text",
      evidenceId: "",
      locator: "",
      kind: "layout"
    });
    layoutLocks.push({
      x: 0.04,
      y: 0.88,
      w: 0.44,
      h: 0.08,
      xPx: 76,
      yPx: 950,
      wPx: 846,
      hPx: 86,
      type: "deterministic_cover_footer",
      evidenceId: "",
      locator: "",
      kind: "layout"
    });
    layoutLocks.push({
      x: 0.60,
      y: 0.085,
      w: 0.37,
      h: 0.80,
      xPx: 1152,
      yPx: 92,
      wPx: 710,
      hPx: 860,
      type: "protected_visual_barrier",
      evidenceId: "",
      locator: "",
      kind: "layout"
    });
  } else if (archetype === "evidence-wall") {
    const evidenceWallOverlay = deterministicEvidenceWallOverlay(run, slide, contract, palette);
    canvas = await sharp(canvas).composite([{ input: evidenceWallOverlay, left: 0, top: 0 }]).png().toBuffer();
    layoutLocks.push(
      {
        x: 0.03,
        y: 0.085,
        w: 0.94,
        h: 0.115,
        xPx: 58,
        yPx: 92,
        wPx: 1804,
        hPx: 124,
        type: "deterministic_evidence_wall_title",
        evidenceId: "",
        locator: "",
        kind: "layout"
      },
      {
        x: 0.03,
        y: 0.20,
        w: 0.94,
        h: 0.60,
        xPx: 58,
        yPx: 216,
        wPx: 1804,
        hPx: 648,
        type: "protected_evidence_wall_zone",
        evidenceId: "",
        locator: "",
        kind: "layout"
      },
      {
        x: 0.03,
        y: 0.80,
        w: 0.94,
        h: 0.16,
        xPx: 58,
        yPx: 864,
        wPx: 1804,
        hPx: 173,
        type: "deterministic_evidence_wall_footer",
        evidenceId: "",
        locator: "",
        kind: "layout"
      }
    );
  }
  const regions = protectedEvidenceRegions(contract, evidence).map((region, index) => ({
    ...region,
    evidenceId: evidence[index].evidenceId || evidence[index].storedName || `evidence-${index + 1}`,
    locator: evidence[index].locator || "",
    role: evidence[index].role,
    kind: evidence[index].kind || "context",
    focusBox: evidence[index].focusBox || null,
    focusMethod: evidence[index].focusMethod || (evidence[index].focusFallback ? "local-object-crop" : "gpt-5.6-object-crop"),
    focusFallback: Boolean(evidence[index].focusFallback),
    cropIntent: evidence[index].cropIntent || evidence[index].kind || "context",
    coverageLabel: evidence[index].coverageLabel || ""
  }));
  const safetyComposites = [];
  const composites = [];
  for (const region of regions) {
    const x = Math.round(region.x * width);
    const y = Math.round(region.y * height);
    const w = Math.max(160, Math.round(region.w * width));
    const h = Math.max(120, Math.round(region.h * height));
    const safetyPaddingX = Math.max(18, Math.min(28, Math.round(width * 0.012)));
    const safetyPaddingY = Math.max(14, Math.min(22, Math.round(height * 0.016)));
    const safetyX = Math.max(0, x - safetyPaddingX);
    const safetyY = Math.max(0, y - safetyPaddingY);
    const safetyW = Math.min(width - safetyX, w + (x - safetyX) + safetyPaddingX);
    const safetyH = Math.min(height - safetyY, h + (y - safetyY) + safetyPaddingY);
    const safetyBand = Buffer.from(`<svg width="${safetyW}" height="${safetyH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" rx="4" fill="${palette.background}" fill-opacity=".94"/>
      <rect x="1" y="1" width="${Math.max(1, safetyW - 2)}" height="${Math.max(1, safetyH - 2)}" rx="4" fill="${palette.surface}" fill-opacity=".16" stroke="${palette.line}" stroke-width="1" stroke-opacity=".26"/>
    </svg>`);
    safetyComposites.push({ input: safetyBand, left: safetyX, top: safetyY });
    layoutLocks.push({
      x: safetyX / width,
      y: safetyY / height,
      w: safetyW / width,
      h: safetyH / height,
      xPx: safetyX,
      yPx: safetyY,
      wPx: safetyW,
      hPx: safetyH,
      type: "protected_evidence_safety_margin",
      evidenceId: region.evidenceId,
      locator: region.locator,
      kind: "layout"
    });
    const reference = evidence[regions.indexOf(region)];
    const fit = archetype === "cover" || /direct-proof|data-proof/i.test(region.cropIntent) ? "contain" : "cover";
    const focused = await focusedEvidenceBuffer(reference);
    const evidenceLabelHeight = archetype === "evidence-wall" && region.coverageLabel ? 34 : 0;
    const evidenceImage = await sharp(focused, { animated: false })
      .rotate()
      .resize(Math.max(120, w - 12), Math.max(72, h - 12 - evidenceLabelHeight), {
        fit,
        position: "attention",
        background: palette.surface
      })
      .png()
      .toBuffer();
    const frame = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${palette.surface}" opacity=".18" stroke="${palette.line}" stroke-width="1"/>
    </svg>`);
    composites.push({ input: frame, left: x, top: y });
    if (evidenceLabelHeight) {
      const factCaption = evidenceWallFactCaption(reference);
      const labelText = [region.coverageLabel, factCaption].filter(Boolean).join("｜");
      const labelFontSize = labelText.length > 20 ? 19 : labelText.length > 14 ? 20 : 22;
      const label = Buffer.from(`<svg width="${w - 12}" height="${evidenceLabelHeight}" xmlns="http://www.w3.org/2000/svg">
        <text x="6" y="24" fill="${palette.primaryText}" font-family="Microsoft YaHei, SimHei, Arial" font-size="${labelFontSize}" font-weight="700">${xmlText(labelText)}</text>
        <path d="M6 ${evidenceLabelHeight - 2}H${Math.max(12, w - 18)}" stroke="${palette.line}" stroke-width="1" opacity=".54"/>
      </svg>`);
      composites.push({ input: label, left: x + 6, top: y + 4 });
    }
    composites.push({ input: evidenceImage, left: x + 6, top: y + 6 + evidenceLabelHeight });
    if (postprocess?.kind === "deterministic_cover") {
      postprocess.evidenceComposites.push({ input: evidenceImage, left: x + 6, top: y + 6 + evidenceLabelHeight });
    }
    region.xPx = x;
    region.yPx = y;
    region.wPx = w;
    region.hPx = h;
  }
  const cleanInput = await sharp(canvas).composite([...safetyComposites, ...composites]).png().toBuffer();
  const styleGuides = references.filter(reference => /palette reference|deck-wide style strip/i.test(reference.role));
  let input = cleanInput;
  let embeddedStyleGuides = null;
  if (styleGuides.length) {
    const guideHeight = 92;
    const guidePadding = 12;
    const guideGap = 14;
    const paletteReference = styleGuides.find(reference => /palette reference/i.test(reference.role));
    const deckStyleStrip = styleGuides.find(reference => /deck-wide style strip/i.test(reference.role));
    const guideSlots = paletteReference && deckStyleStrip
      ? [
        { reference: paletteReference, left: guidePadding, width: 560, fit: "cover" },
        { reference: deckStyleStrip, left: 560 + guidePadding + guideGap, width: width - 560 - guidePadding * 2 - guideGap, fit: "fill" }
      ]
      : [{ reference: styleGuides[0], left: guidePadding, width: width - guidePadding * 2, fit: /palette reference/i.test(styleGuides[0].role) ? "cover" : "fill" }];
    const guidePanel = Buffer.from(`<svg width="${width}" height="${guideHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${palette.background}"/>
      <rect x="1" y="1" width="${width - 2}" height="${guideHeight - 2}" fill="${palette.surface}" fill-opacity=".16" stroke="${palette.line}" stroke-width="2" stroke-opacity=".5"/>
    </svg>`);
    const guideComposites = [{ input: guidePanel, left: 0, top: 0 }];
    for (const slot of guideSlots) {
      const guide = await sharp(slot.reference.buffer, { animated: false })
        .rotate()
        .resize(slot.width, guideHeight - guidePadding * 2, {
          fit: slot.fit,
          position: "attention",
          background: palette.surface
        })
        .png()
        .toBuffer();
      guideComposites.push({ input: guide, left: slot.left, top: guidePadding });
    }
    input = await sharp(cleanInput).composite(guideComposites).png().toBuffer();
    const guideRegion = {
      x: 0,
      y: 0,
      w: 1,
      h: guideHeight / height,
      xPx: 0,
      yPx: 0,
      wPx: width,
      hPx: guideHeight,
      type: "temporary_style_guides",
      evidenceId: "",
      locator: "",
      kind: "layout"
    };
    layoutLocks.push(guideRegion);
    embeddedStyleGuides = {
      transport: "embedded_style_guides",
      roles: styleGuides.map(reference => reference.role),
      storedNames: styleGuides.map(reference => reference.storedName).filter(Boolean),
      regions: [guideRegion],
      cleanInput
    };
  }
  const lockedRegions = [...layoutLocks, ...regions];
  const maskSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    ${lockedRegions.map(region => `<rect x="${region.xPx}" y="${region.yPx}" width="${region.wPx}" height="${region.hPx}" fill="#ffffff"/>`).join("")}
  </svg>`;
  const mask = await sharp(Buffer.from(maskSvg)).png().toBuffer();
  return {
    input,
    mask,
    regions: lockedRegions,
    evidenceIds: regions.map(region => region.evidenceId),
    base: archetype === "cover" ? "image2_abstract_background+deterministic_cover_content" : "style_canvas",
    postprocess,
    embeddedStyleGuides
  };
}

async function clearTemporaryStyleGuides(output, embeddedStyleGuides) {
  if (!embeddedStyleGuides?.cleanInput || !embeddedStyleGuides.regions?.length) return output;
  const composites = [];
  for (const region of embeddedStyleGuides.regions) {
    const crop = await sharp(embeddedStyleGuides.cleanInput)
      .extract({ left: region.xPx, top: region.yPx, width: region.wPx, height: region.hPx })
      .png()
      .toBuffer();
    composites.push({ input: crop, left: region.xPx, top: region.yPx });
  }
  return sharp(output).composite(composites).png().toBuffer();
}

async function restoreProtectedEvidence(output, input, regions, postprocess = null, embeddedStyleGuides = null) {
  if (!regions?.length) return { buffer: output, restored: false };
  let restored;
  if (postprocess?.kind === "deterministic_cover") {
    const palette = postprocess.palette;
    const abstractBackground = await sharp(output)
      .blur(18)
      .modulate({ brightness: 0.72, saturation: 0.55 })
      .png()
      .toBuffer();
    const veil = Buffer.from(`<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cover-veil" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="${palette.line}" stop-opacity=".78"/>
          <stop offset=".54" stop-color="${palette.background}" stop-opacity=".62"/>
          <stop offset="1" stop-color="${palette.surface}" stop-opacity=".48"/>
        </linearGradient>
      </defs>
      <rect width="1920" height="1080" fill="url(#cover-veil)"/>
      <path d="M120 114H1800 M120 966H1800" stroke="${palette.primaryText}" stroke-width="2" opacity=".18"/>
      <path d="M1040 150L1780 150 M1040 930L1780 930" stroke="${palette.accent}" stroke-width="8" opacity=".28"/>
    </svg>`);
    restored = await sharp(abstractBackground).composite([
      { input: veil, left: 0, top: 0 },
      { input: postprocess.coverOverlay, left: 0, top: 0 },
      { input: postprocess.visualPanel, left: postprocess.visualPanelLeft, top: postprocess.visualPanelTop },
      ...postprocess.evidenceComposites
    ]).png().toBuffer();
  } else {
    const composites = [];
    for (const region of regions) {
      const crop = await sharp(input).extract({ left: region.xPx, top: region.yPx, width: region.wPx, height: region.hPx }).png().toBuffer();
      composites.push({ input: crop, left: region.xPx, top: region.yPx });
    }
    restored = await sharp(output).composite(composites).png().toBuffer();
  }
  return {
    buffer: await clearTemporaryStyleGuides(restored, embeddedStyleGuides),
    restored: true,
    styleGuidesCleared: Boolean(embeddedStyleGuides?.regions?.length)
  };
}

async function openAiImageWithReferences(prompt, references, options = {}) {
  requireImageService(imageService);
  if (!advancedImageReferencesEnabled) {
    throw new Error("高级版参考图输入已被 DECK_ADVANCED_REFERENCE_IMAGES 关闭，不能静默退回文字生图。");
  }
  const requestEdit = async (files, mask = null) => {
    const form = new FormData();
    form.set("model", imageService.model);
    form.set("prompt", prompt);
    form.set("n", "1");
    form.set("size", imageService.size);
    const field = files.length === 1 ? "image" : "image[]";
    files.forEach((reference, index) => {
      form.append(field, new Blob([new Uint8Array(reference.buffer)], { type: reference.mime }), reference.name || `reference-${index + 1}.png`);
    });
    if (mask) {
      form.append("mask", new Blob([new Uint8Array(mask)], { type: "image/png" }), "protected-evidence-mask.png");
    }
    const response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${imageService.apiKey}` },
      body: form
    }, advancedImageTimeoutMs);
    const text = await response.text();
    return { response, result: safeJson(text, {}) };
  };

  if (options.mask && references.length !== 1) {
    throw new Error("受保护证据编辑必须只提交一张合成输入图");
  }
  let transport = options.transport || (references.length > 1 ? "multi_image" : "single_image");
  let attempt = await requestEdit(references, options.mask || null);
  if (!attempt.response.ok && references.length > 1 && [400, 404, 405, 415, 422].includes(attempt.response.status)) {
    const board = await referenceContactSheet(references);
    attempt = await requestEdit([{ buffer: board, mime: "image/png", name: "visual-reference-board.png", role: "numbered visual reference board" }]);
    transport = "contact_sheet";
  }
  if (!attempt.response.ok || !attempt.result.data?.[0]) {
    throw new Error(providerError(attempt.result, "图片中转服务参考图生成失败"));
  }
  return { buffer: await imageBufferFromResult(attempt.result), transport };
}

function stylePackName(id) {
  return ({
    "blue-gold-tech": "蓝金科技",
    "white-green-tech": "白绿科技",
    "black-gold-business": "黑金商务",
    "blue-purple-ai": "蓝紫 AI",
    "red-white-government": "红白政企",
    "minimal-academic": "极简学术",
    "vivid-roadshow": "活力路演"
  })[id] || id || "蓝金科技";
}

function advancedLayoutName(id) {
  return ({
    "blue-gold-tech": "图文叙事版式",
    "white-green-tech": "清晰技术说明版式",
    "black-gold-business": "结论先行商务版式",
    "blue-purple-ai": "系统关系图解版式",
    "red-white-government": "庄重层级汇报版式",
    "minimal-academic": "极简学术论证版式",
    "vivid-roadshow": "活力路演叙事版式"
  })[id] || "图文叙事版式";
}

function runStyleDirection(run) {
  if (run.generationMode === "advanced" && run.paletteMode === "reference") {
    return `${advancedLayoutName(run.stylePack)}；这里只规定信息结构与视觉节奏，颜色完全服从参考图配色合同和实际输入图片`;
  }
  return stylePackName(run.stylePack);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

const internalPlanningTextPattern = /^(?:资料中的(?:行业背景|真实场景|明确指标|明确证据|证书|检测页|现场照片|产品实物)|待匹配资料|视觉证据|证据标签)$/;

function comparableSlideText(value) {
  return String(value || "").toLowerCase().replace(/[\s:：,，。.!！?？、·|｜\-—_（）()《》]/g, "");
}

function audienceMustInclude(values, title) {
  const normalizedTitle = comparableSlideText(title);
  const titleCore = comparableSlideText(String(title || "").split(/[:：]/).slice(1).join(""));
  return Array.from(new Set(normalizeArray(values).map(item => String(item || "").trim()).filter(Boolean)))
    .filter(item => !internalPlanningTextPattern.test(item))
    .filter(item => {
      const normalized = comparableSlideText(item);
      if (!normalized || normalized === normalizedTitle) return false;
      if (normalized.length >= 6 && normalizedTitle.includes(normalized)) return false;
      if (titleCore && normalized.length >= 6 && (normalized === titleCore || titleCore.includes(normalized))) return false;
      return true;
    });
}

const middleRoleSequence = ["problem", "insight", "solution", "architecture", "feature", "scenario", "data", "roadmap"];

function normalizedSlideRole(index, pageCount, proposedRole = "") {
  if (index === 0) return "cover";
  if (index === pageCount - 1) return "ending";
  const role = String(proposedRole || "").trim();
  if (middleRoleSequence.includes(role)) return role;
  return middleRoleSequence[(index - 1) % middleRoleSequence.length];
}

function cleanSlideTitle(value, fallback) {
  const raw = String(value || fallback || "").replace(/\s+/g, " ").trim();
  const cleaned = raw
    .replace(/^\s*(?:第\s*)?\d{1,2}\s*(?:页|page|p)?\s*[:：.、\-]?\s*/i, "")
    .replace(/^\s*\d{1,2}\s*[\|｜]\s*/, "")
    .replace(/^\s*\d{1,2}\s+/, "")
    .trim();
  return (cleaned || raw || fallback || "").slice(0, 80);
}

function normalizeOutline(plan, run, slides) {
  const sourceSlides = normalizeArray(plan.outline?.slides);
  return {
    ...(plan.outline && typeof plan.outline === "object" ? plan.outline : {}),
    title: String(plan.outline?.title || run.projectName),
    slides: slides.map((slide, index) => {
      const source = sourceSlides[index] && typeof sourceSlides[index] === "object" ? sourceSlides[index] : {};
      return {
        ...source,
        slide_index: index + 1,
        title: cleanSlideTitle(source.title || slide.title, index === 0 ? run.projectName : `Page ${index + 1}`).slice(0, 100),
        role: slide.role,
        key_message: String(source.key_message || slide.content_summary || "").slice(0, 500)
      };
    })
  };
}

function normalizeStoryboard(plan, slides) {
  const source = plan.visual_storyboard && typeof plan.visual_storyboard === "object" ? plan.visual_storyboard : {};
  const sourceSlides = normalizeArray(source.slides);
  return {
    ...source,
    rhythm: String(source.rhythm || "cover-content-ending"),
    slides: slides.map((slide, index) => {
      const item = sourceSlides[index] && typeof sourceSlides[index] === "object" ? sourceSlides[index] : {};
      return {
        ...item,
        slide_index: index + 1,
        role: slide.role,
        story_goal: String(item.story_goal || slide.content_summary || slide.title || "").slice(0, 500),
        previous_relation: index === 0 ? "start" : String(item.previous_relation || `continue from slide ${index}`).slice(0, 300),
        next_transition: index === slides.length - 1 ? "end" : String(item.next_transition || `lead to slide ${index + 2}`).slice(0, 300),
        visual_change: String(item.visual_change || "").slice(0, 300),
        reused_elements: normalizeArray(item.reused_elements || slide.inherited_elements).map(String).slice(0, 8)
      };
    })
  };
}

function normalizePlan(plan, run) {
  const slides = normalizeArray(plan.slide_image_specs?.slides || plan.slides)
    .slice(0, run.pageCount)
    .map((slide, index) => ({
      slide_index: index + 1,
      title: cleanSlideTitle(slide.title, index === 0 ? run.projectName : `Page ${index + 1}`),
      role: normalizedSlideRole(index, run.pageCount, slide.role || plan.visual_storyboard?.slides?.[index]?.role),
      content_summary: String(slide.content_summary || "").slice(0, 4000),
      composition: String(slide.composition || "").slice(0, 1600),
      main_visual: String(slide.main_visual || "").slice(0, 700),
      inherited_elements: normalizeArray(slide.inherited_elements).map(String).slice(0, 8),
      changed_elements: normalizeArray(slide.changed_elements).map(String).slice(0, 8),
      text_density: ["low", "medium", "high"].includes(slide.text_density)
        ? slide.text_density
        : (index === 0 || index === run.pageCount - 1 ? "low" : "medium"),
      white_space: String(slide.white_space || "").slice(0, 300),
      must_include: normalizeArray(slide.must_include).map(String).slice(0, 30),
      must_avoid: normalizeArray(slide.must_avoid).map(String).slice(0, 10),
      director_contract: slide.director_contract && typeof slide.director_contract === "object" ? slide.director_contract : {}
    }));
  while (slides.length < run.pageCount) {
    const index = slides.length;
    slides.push({
      slide_index: index + 1,
      title: index === 0 ? run.projectName : `Page ${index + 1}`,
      role: normalizedSlideRole(index, run.pageCount),
      content_summary: [run.brief, run.referenceText].filter(Boolean).join("\n").slice(0, 4000),
      composition: "完整 16:9 PPT 页面，标题清晰，内容区有层级，保留高级留白。",
      main_visual: run.projectName,
      inherited_elements: [],
      changed_elements: [],
      text_density: index === 0 || index === run.pageCount - 1 ? "low" : "medium",
      white_space: "保留清楚的阅读空间。",
      must_include: [],
      must_avoid: [],
      director_contract: {}
    });
  }
  const finalSlide = slides[slides.length - 1];
  if (finalSlide) {
    slides[slides.length - 1] = {
      ...finalSlide,
      role: "ending",
      content_summary: String(finalSlide.content_summary || "Close the deck with one memorable conclusion and emotional payoff.").slice(0, 520),
      composition: [
        finalSlide.composition,
        "FINAL ENDING SLIDE RULE: make this feel like a cover-level closing page, not another content page. Use sparse content, strong emotional closure, a dominant thematic visual, and one memorable takeaway. Compress all non-exact roadmap, value, evidence, metric, and next-step material into at most one concise supporting line. Avoid dense cards, charts, process diagrams, multi-column explanations, paragraphs, or new information."
      ].filter(Boolean).join(" "),
      main_visual: String(finalSlide.main_visual || `${run.projectName} closing key visual`).slice(0, 520),
      text_density: "low",
      white_space: "High whitespace. One headline-level closing statement, optional short supporting line, and minimal supporting marks only. The dominant thematic visual should carry most of the emotional weight.",
      must_include: Array.from(new Set([
        ...normalizeArray(finalSlide.must_include).map(String).slice(0, 2),
        "one memorable closing statement"
      ])).slice(0, 3),
      must_avoid: Array.from(new Set([
        ...normalizeArray(finalSlide.must_avoid).map(String),
        "generic thank-you art",
        "dense information architecture",
        "three-column cards",
        "process flow",
        "feature list",
        "complex chart",
        "large paragraph blocks",
        "new detailed arguments"
      ])).slice(0, 12)
    };
  }
  return {
    outline: normalizeOutline(plan, run, slides),
    visual_identity: plan.visual_identity || {},
    visual_storyboard: normalizeStoryboard(plan, slides),
    slide_image_specs: { slides }
  };
}

function jsonArray(value) {
  const parsed = safeJson(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function cleanStringList(value, limit = 20) {
  return normalizeArray(value).map(item => String(item || "").trim()).filter(Boolean).slice(0, limit);
}

function sourceFilePath(source) {
  const base = source.kind === "theme" ? deckThemeRoot : deckSourceRoot;
  return path.join(base, path.basename(source.storedName));
}

function visualEvidenceFilePath(storedName) {
  return path.join(deckEvidenceRoot, path.basename(storedName));
}

function normalizeSourceFocusBox(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = Number(value.x);
  const y = Number(value.y);
  const w = Number(value.w);
  const h = Number(value.h);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const safeX = Math.max(0, Math.min(0.92, x));
  const safeY = Math.max(0, Math.min(0.92, y));
  const safeW = Math.max(0.08, Math.min(1 - safeX, w));
  const safeH = Math.max(0.08, Math.min(1 - safeY, h));
  return { x: safeX, y: safeY, w: safeW, h: safeH };
}

function sourceFocusTag(box) {
  return box ? `__focus=${[box.x, box.y, box.w, box.h].map(value => Number(value).toFixed(4)).join(",")}` : "";
}

function sourceFocusBoxFromTags(value) {
  const tag = normalizeArray(value).find(item => String(item).startsWith("__focus="));
  if (!tag) return null;
  const numbers = String(tag).slice("__focus=".length).split(",").map(Number);
  return normalizeSourceFocusBox({ x: numbers[0], y: numbers[1], w: numbers[2], h: numbers[3] });
}

function sourceFocusUsesFallback(value) {
  return normalizeArray(value).some(item => String(item).startsWith("__focus_fallback="));
}

function sourceFocusMethodFromTags(value) {
  const tag = normalizeArray(value).find(item => String(item).startsWith("__focus_method="));
  return tag ? String(tag).slice("__focus_method=".length) : "";
}

function normalizeVisualClassification(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = String(value.kind || "");
  if (!["direct-proof", "real-world", "data-proof", "context", "decorative"].includes(kind)) return null;
  return {
    kind,
    description: String(value.description || "").slice(0, 1600),
    tags: cleanStringList(value.tags, 19),
    usefulness: Math.max(0, Math.min(100, Number(value.usefulness || 0))),
    focusBox: normalizeSourceFocusBox(value.focus_box || value.focusBox)
  };
}

async function persistVisualAssets(source, visualAssets) {
  await db.deckGenerationVisualEvidence.deleteMany({ where: { sourceId: source.id } });
  if (source.kind !== "reference" || !Array.isArray(visualAssets) || !visualAssets.length) return 0;
  const existing = await db.deckGenerationVisualEvidence.findMany({
    where: { runId: source.runId },
    select: { contentHash: true }
  });
  const knownHashes = new Set(existing.map(item => item.contentHash));
  let created = 0;
  for (const asset of visualAssets.slice(0, 80)) {
    try {
      const metadata = await sharp(asset.buffer, { animated: false }).metadata();
      const width = Number(metadata.width || 0);
      const height = Number(metadata.height || 0);
      if (width < 120 || height < 120 || width * height < 100_000) continue;
      const normalized = await sharp(asset.buffer, { animated: false })
        .rotate()
        .resize(1600, 1200, { fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const hash = createHash("sha256").update(normalized).digest("hex");
      if (knownHashes.has(hash)) continue;
      const normalizedMetadata = await sharp(normalized).metadata();
      const thumbnail = await sharp(normalized)
        .resize(480, 320, { fit: "contain", background: "#f4f5f6" })
        .png({ compressionLevel: 9 })
        .toBuffer();
      const storedName = nowName("png");
      const thumbnailStoredName = nowName("png");
      const classification = normalizeVisualClassification(asset.classification);
      await Promise.all([
        writeFile(visualEvidenceFilePath(storedName), normalized),
        writeFile(visualEvidenceFilePath(thumbnailStoredName), thumbnail)
      ]);
      await db.deckGenerationVisualEvidence.create({
        data: {
          runId: source.runId,
          sourceId: source.id,
          kind: classification?.kind || "context",
          locator: String(asset.locator || "").slice(0, 240),
          originalName: String(asset.originalName || source.originalName).slice(0, 240),
          storedName,
          thumbnailStoredName,
          mimeType: "image/png",
          width: Number(normalizedMetadata.width || width),
          height: Number(normalizedMetadata.height || height),
          size: normalized.length,
          contentHash: hash,
          description: classification?.description || `${source.originalName} · ${asset.locator || "视觉资料"}`.slice(0, 1200),
          tagsJson: JSON.stringify(classification ? [
            ...classification.tags,
            "__gpt56_classified",
            ...(classification.focusBox ? [sourceFocusTag(classification.focusBox)] : [])
          ] : []),
          usefulness: classification?.usefulness ?? 30
        }
      });
      knownHashes.add(hash);
      created += 1;
    } catch (error) {
      console.warn(`[deck-generation] skipped visual evidence from ${source.originalName}:`, error instanceof Error ? error.message : String(error));
    }
  }
  return created;
}

async function visualEvidenceContactSheet(assets) {
  const columns = 4;
  const tileWidth = 400;
  const tileHeight = 260;
  const labelHeight = 34;
  const rows = Math.ceil(assets.length / columns);
  const composites = [];
  for (let index = 0; index < assets.length; index += 1) {
    const image = await sharp(visualEvidenceFilePath(assets[index].thumbnailStoredName))
      .resize(tileWidth, tileHeight, { fit: "contain", background: "#f4f5f6" })
      .png()
      .toBuffer();
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (tileHeight + labelHeight);
    const label = Buffer.from(`<svg width="${tileWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#11161b"/><text x="12" y="24" fill="#f4efe6" font-family="Arial" font-size="18">${assets[index].id}</text></svg>`);
    composites.push({ input: image, left, top });
    composites.push({ input: label, left, top: top + tileHeight });
  }
  return sharp({
    create: { width: columns * tileWidth, height: rows * (tileHeight + labelHeight), channels: 4, background: "#f4f5f6" }
  }).composite(composites).png().toBuffer();
}

async function flattenedPptContactSheets(assets) {
  const sheets = [];
  const catalog = assets.map((asset, index) => ({
    key: `P${index + 1}`,
    locator: String(asset.locator || `第 ${index + 1} 页`)
  }));
  for (let offset = 0; offset < assets.length; offset += 4) {
    const batch = assets.slice(offset, offset + 4);
    const composites = [];
    for (let index = 0; index < batch.length; index += 1) {
      const key = catalog[offset + index].key;
      const left = (index % 2) * 800;
      const top = Math.floor(index / 2) * 500;
      const preview = await sharp(batch[index].buffer)
        .rotate()
        .resize(780, 430, { fit: "contain", background: "#F4F5F6" })
        .jpeg({ quality: 78 })
        .toBuffer();
      const label = Buffer.from(`<svg width="800" height="50" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#11161B"/><text x="18" y="34" fill="#F4EFE6" font-family="Arial" font-size="26" font-weight="700">${key}</text></svg>`);
      composites.push({ input: label, left, top });
      composites.push({ input: preview, left: left + 10, top: top + 60 });
    }
    sheets.push(await sharp({
      create: { width: 1600, height: 1000, channels: 3, background: "#F4F5F6" }
    }).composite(composites).jpeg({ quality: 76 }).toBuffer());
  }
  return { sheets, catalog };
}

async function recoverFlattenedPptText(assets, options = {}) {
  const selected = normalizeArray(assets).slice(0, 80);
  if (!selected.length) return { sections: [], classifications: [], analysis: { method: "none", slideCount: 0, recognizedCount: 0, classifiedCount: 0 } };
  try {
    const { sheets, catalog } = await flattenedPptContactSheets(selected);
    const content = [
      {
        type: "input_text",
        text: `你是 GPT-5.6，负责一次性恢复图片型 PPT 的逐页文字证据，并给同一页视觉证据分类。每张拼图含 4 页，页角标签与目录 key 一一对应。只返回 JSON object：\n{"slides":[{"key":"P1","transcription":"只抄录清晰可读的标题、关键结论、重要数字和专名","facts":["可直接引用的明确事实"],"warnings":["模糊或无法确认的信息"],"visual_kind":"direct-proof|real-world|data-proof|context|decorative","visual_description":"客观说明本页画面是什么以及能证明什么","visual_tags":[""],"visual_usefulness":0,"focus_box":{"x":0,"y":0,"w":1,"h":1}}]}\n规则：严禁猜测看不清的文字、数字、机构、人物、专利号或结论；不要补齐被遮挡内容；保留原始数字、单位和专名；不需要抄录页眉页脚、装饰文字和细小长段落；证书、合同、报告、专利和试验记录属于 direct-proof，产品、设备、现场和真实人物属于 real-world，图表、数据表和技术图属于 data-proof，logo、纹理、小图标和分隔线属于 decorative；usefulness 取 0-100；focus_box 使用 0-1 归一化坐标，只框出最适合直接放入新 PPT 的真实主物体、现场照片、证书、报告或数据图，必须排除原页标题、页眉页脚、整页背景和无关文字；裁片面积不得超过原图的52%，不得返回整页或大半页；每个目录 key 都要返回一项。目录：${JSON.stringify(catalog)}`
      },
      ...sheets.map(sheet => ({ type: "input_image", image_url: `data:image/jpeg;base64,${sheet.toString("base64")}` }))
    ];
    const result = jsonFromText(await openAiInput([{ role: "user", content }], options.aiOptions || {}));
    const byKey = new Map(normalizeArray(result.slides).map(item => [String(item.key || ""), item]));
    const sections = [];
    const classifications = [];
    for (const item of catalog) {
      const recovered = byKey.get(item.key);
      if (!recovered) continue;
      const text = [
        String(recovered.transcription || "").trim(),
        ...cleanStringList(recovered.facts, 24)
      ].filter(Boolean).join("\n");
      if (text) sections.push({ locator: item.locator, text });
      const classification = normalizeVisualClassification({
        kind: recovered.visual_kind,
        description: recovered.visual_description,
        tags: recovered.visual_tags,
        usefulness: recovered.visual_usefulness,
        focus_box: recovered.focus_box
      });
      if (classification) classifications.push({ locator: item.locator, ...classification });
    }
    return {
      sections,
      classifications,
      analysis: {
        method: "gpt-5.6-flattened-ppt-batch-vision",
        slideCount: catalog.length,
        recognizedCount: sections.length,
        classifiedCount: classifications.length
      }
    };
  } catch (error) {
    return {
      sections: [],
      classifications: [],
      analysis: {
        method: "gpt-5.6-flattened-ppt-batch-vision",
        slideCount: selected.length,
        recognizedCount: 0,
        classifiedCount: 0,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1000)
      }
    };
  }
}

async function analyzeRunVisualEvidence(runId) {
  const allAssets = await db.deckGenerationVisualEvidence.findMany({
    where: { runId },
    include: { source: { select: { originalName: true } } },
    orderBy: [{ sourceId: "asc" }, { createdAt: "asc" }]
  });
  const assets = allAssets
    .filter(asset => {
      const tags = jsonArray(asset.tagsJson);
      return !tags.includes("__gpt56_classified") || !sourceFocusBoxFromTags(tags);
    })
    .slice(0, 60);
  if (!assets.length) return;
  const batches = [];
  for (let index = 0; index < assets.length; index += 12) batches.push(assets.slice(index, index + 12));
  const sheets = await Promise.all(batches.map(visualEvidenceContactSheet));
  const catalog = assets.map(item => ({
    id: item.id,
    file: item.source.originalName,
    locator: item.locator,
    width: item.width,
    height: item.height
  }));
  try {
    const content = [
      { type: "input_text", text: `你是 GPT-5.6，负责一次性整理高级版 PPT 的视觉证据索引。下面的拼图标签与目录 id 一一对应。只返回 JSON object：\n{\"assets\":[{\"id\":\"\",\"kind\":\"direct-proof|real-world|data-proof|context|decorative\",\"description\":\"客观说明图中是什么以及能证明什么\",\"tags\":[\"\"],\"usefulness\":0,\"focus_box\":{\"x\":0,\"y\":0,\"w\":1,\"h\":1}}]}\n规则：不得猜测看不清的机构、人物、金额或结论；证书、合同、报告、专利、试验记录属于 direct-proof；产品、设备、现场和真实人物属于 real-world；图表、数据表和技术图属于 data-proof；logo、纹理、小图标和分隔线属于 decorative。usefulness 取 0-100。focus_box 使用 0-1 归一化坐标，只框出最适合直接放入新 PPT 的真实主物体、现场照片、证书、报告或数据图，必须排除原页标题、页眉页脚、整页背景和无关文字；输入若为扁平化幻灯片，裁片面积不得超过原图的52%，不得返回整页或大半页。目录：${JSON.stringify(catalog)}` },
      ...sheets.map(sheet => ({ type: "input_image", image_url: `data:image/png;base64,${sheet.toString("base64")}` }))
    ];
    const result = jsonFromText(await openAdvancedAiInput(
      [{ role: "user", content }],
      advancedTextOptions({ timeoutMs: advancedVisualTimeoutMs })
    ));
    const byId = new Map(normalizeArray(result.assets).map(item => [String(item.id || ""), item]));
    for (const asset of assets) {
      const item = byId.get(asset.id);
      if (!item) continue;
      const kind = ["direct-proof", "real-world", "data-proof", "context", "decorative"].includes(String(item.kind)) ? String(item.kind) : "context";
      const focusBox = acceptableEvidenceFocusBox({
        sourceName: asset.source.originalName,
        locator: asset.locator,
        width: asset.width,
        height: asset.height
      }, item.focus_box);
      await db.deckGenerationVisualEvidence.update({
        where: { id: asset.id },
        data: {
          kind,
          description: String(item.description || asset.description).slice(0, 1600),
          tagsJson: JSON.stringify([
            ...cleanStringList(item.tags, 19),
            "__gpt56_classified",
            ...(focusBox ? [sourceFocusTag(focusBox)] : [])
          ]),
          usefulness: Math.max(0, Math.min(100, Number(item.usefulness || 0)))
        }
      });
    }
  } catch (error) {
    console.warn("[deck-generation] visual evidence indexing fell back to local metadata:", error instanceof Error ? error.message : String(error));
  }
}


async function openAiVisionJson(source, instruction, options = {}) {
  const raw = await readFile(sourceFilePath(source));
  const resized = await sharp(raw).resize(1800, 1800, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const text = await openAiInput([{
    role: "user",
    content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/png;base64,${resized.toString("base64")}` }
    ]
  }], options);
  return jsonFromText(text);
}

function transientAiFailure(error, options = {}) {
  if (error && typeof error === "object" && error.code === "AI_REQUEST_TIMEOUT") return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/This operation was aborted|请求超过\s*\d+\s*秒，本机已停止等待/i.test(message)) return false;
  if (options.noRetryHeadersTimeout && /UND_ERR_HEADERS_TIMEOUT|headers timeout/i.test(message)) return false;
  return /temporar(?:y|ily)|upstream|service unavailable|bad gateway|gateway timeout|request timeout|too many requests|fetch failed|network|socket|tls|econn|enotfound|etimedout|(?:^|\D)(?:408|425|429|500|502|503|504)(?:\D|$)/i.test(message);
}

async function withTransientRetry(operation, delays = [900, 2200], options = {}) {
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!transientAiFailure(error, options) || attempt >= delays.length) throw error;
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
}

function rgbHex(color) {
  return `#${[color.r, color.g, color.b].map(channel => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

function colorDistance(left, right) {
  return Math.hypot(left.r - right.r, left.g - right.g, left.b - right.b);
}

function colorLuminance(color) {
  const channels = [color.r, color.g, color.b].map(channel => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function colorContrast(left, right) {
  const brighter = Math.max(colorLuminance(left), colorLuminance(right));
  const darker = Math.min(colorLuminance(left), colorLuminance(right));
  return (brighter + 0.05) / (darker + 0.05);
}

function colorSaturation(color) {
  const high = Math.max(color.r, color.g, color.b);
  const low = Math.min(color.r, color.g, color.b);
  return high ? (high - low) / high : 0;
}

function mixColor(left, right, rightWeight) {
  return {
    r: left.r * (1 - rightWeight) + right.r * rightWeight,
    g: left.g * (1 - rightWeight) + right.g * rightWeight,
    b: left.b * (1 - rightWeight) + right.b * rightWeight
  };
}

async function extractLocalThemePalette(source) {
  const { data, info } = await sharp(sourceFilePath(source))
    .rotate()
    .resize(144, 144, { fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const bins = new Map();
  const edgeX = Math.max(1, Math.round(info.width * 0.1));
  const edgeY = Math.max(1, Math.round(info.height * 0.1));
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const offset = pixel * 4;
    const alpha = data[offset + 3] / 255;
    if (alpha < 0.08) continue;
    const r = data[offset] * alpha + 255 * (1 - alpha);
    const g = data[offset + 1] * alpha + 255 * (1 - alpha);
    const b = data[offset + 2] * alpha + 255 * (1 - alpha);
    const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
    const x = pixel % info.width;
    const y = Math.floor(pixel / info.width);
    const onEdge = x < edgeX || x >= info.width - edgeX || y < edgeY || y >= info.height - edgeY;
    const bin = bins.get(key) || { r: 0, g: 0, b: 0, count: 0, edgeCount: 0 };
    bin.r += r;
    bin.g += g;
    bin.b += b;
    bin.count += 1;
    if (onEdge) bin.edgeCount += 1;
    bins.set(key, bin);
  }
  const candidates = Array.from(bins.values())
    .map(bin => ({
      r: bin.r / bin.count,
      g: bin.g / bin.count,
      b: bin.b / bin.count,
      count: bin.count,
      edgeCount: bin.edgeCount
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 80);
  if (!candidates.length) throw new Error("配色参考图没有可提取的有效像素");

  const selected = [];
  for (const minimumDistance of [54, 34, 18, 0]) {
    for (const candidate of candidates) {
      if (selected.length >= 8) break;
      if (selected.includes(candidate)) continue;
      if (selected.every(existing => colorDistance(existing, candidate) >= minimumDistance)) selected.push(candidate);
    }
    if (selected.length >= 8) break;
  }
  const background = [...candidates.slice(0, 24)].sort((left, right) =>
    (right.edgeCount * 4 + right.count) - (left.edgeCount * 4 + left.count)
  )[0];
  const neutralContrast = colorLuminance(background) < 0.42
    ? { r: 244, g: 241, b: 234 }
    : { r: 20, g: 24, b: 28 };
  const primaryTextCandidate = [...selected].sort((left, right) => colorContrast(right, background) - colorContrast(left, background))[0];
  const primaryText = primaryTextCandidate && colorContrast(primaryTextCandidate, background) >= 4.5 ? primaryTextCandidate : neutralContrast;
  const surfaceCandidate = selected
    .filter(color => color !== background && colorDistance(color, background) >= 18)
    .sort((left, right) => colorDistance(left, background) - colorDistance(right, background))[0];
  const surface = surfaceCandidate || mixColor(background, primaryText, 0.1);
  const secondaryTextCandidate = selected
    .filter(color => color !== primaryTextCandidate && colorContrast(color, background) >= 3)
    .sort((left, right) => Math.abs(colorContrast(left, background) - 4) - Math.abs(colorContrast(right, background) - 4))[0];
  const secondaryText = secondaryTextCandidate || mixColor(background, primaryText, 0.7);
  const accentCandidates = selected
    .filter(color => colorDistance(color, background) >= 42 && colorDistance(color, primaryText) >= 24)
    .sort((left, right) => {
      const leftScore = colorSaturation(left) * 2 + colorDistance(left, background) / 255 + left.count / candidates[0].count;
      const rightScore = colorSaturation(right) * 2 + colorDistance(right, background) / 255 + right.count / candidates[0].count;
      return rightScore - leftScore;
    });
  const accent = accentCandidates[0] || selected.find(color => color !== background) || primaryText;
  const accentSecondary = accentCandidates.find(color => colorDistance(color, accent) >= 50)
    || selected.find(color => color !== background && color !== accent && colorDistance(color, accent) >= 30)
    || mixColor(accent, primaryText, 0.35);
  const paletteSet = new Set([
    background,
    surface,
    primaryText,
    secondaryText,
    accent,
    accentSecondary,
    ...selected
  ].map(rgbHex));
  for (const weight of [0.22, 0.42, 0.58, 0.82]) {
    if (paletteSet.size >= 5) break;
    paletteSet.add(rgbHex(mixColor(background, primaryText, weight)));
  }
  const palette = Array.from(paletteSet).slice(0, 8);
  const backgroundHex = rgbHex(background);
  const surfaceHex = rgbHex(surface);
  const primaryTextHex = rgbHex(primaryText);
  const secondaryTextHex = rgbHex(secondaryText);
  const accentHex = rgbHex(accent);
  const accentSecondaryHex = rgbHex(accentSecondary);
  return {
    palette,
    background: backgroundHex,
    surface: surfaceHex,
    primary_text: primaryTextHex,
    secondary_text: secondaryTextHex,
    accent: accentHex,
    accent_secondary: accentSecondaryHex,
    usage_rules: [
      `${backgroundHex} 用作整页主背景，${surfaceHex} 用作信息区和卡片层次。`,
      `${primaryTextHex} 承担标题与正文，${secondaryTextHex} 只用于次级说明。`,
      `${accentHex} 用于关键数字和重点结论，${accentSecondaryHex} 仅作少量辅助强调。`
    ],
    avoid: ["不要照抄参考图版式", "不要交换背景色与文字色职责", "不要让强调色大面积覆盖正文"],
    visual_tone: colorLuminance(background) < 0.42 ? "深色、稳重、克制，保持清晰对比" : "明亮、克制、清晰，保持足够文字对比"
  };
}

async function analyzeThemePalette(source) {
  const palette = await extractLocalThemePalette(source);
  return { palette, analysis: { method: "local-color-extraction", fallback: false } };
}

async function extractOneSource(source, options = {}) {
  await db.deckGenerationSource.update({
    where: { id: source.id },
    data: { status: "processing", error: null }
  });
  try {
    let parsed;
    if (source.kind === "theme") {
      const { palette, analysis } = await analyzeThemePalette(source);
      parsed = {
        kind: "theme",
        text: "",
        sections: [],
        metadata: { palette, paletteAnalysis: analysis }
      };
    } else {
      parsed = await parseDeckSourceFile(sourceFilePath(source), source.originalName, source.mimeType, {
        extractVisualAssets: false,
        visualOutputDirectory: deckEvidenceRoot
      });
      if (options.visualTextFallback === true && ["pptx", "pdf"].includes(parsed.kind) && parsed.text.length < 200) {
        parsed = await parseDeckSourceFile(sourceFilePath(source), source.originalName, source.mimeType, {
          extractVisualAssets: true,
          visualOutputDirectory: deckEvidenceRoot
        });
      }
      if (["pptx", "pdf"].includes(parsed.kind) && parsed.text.length < 200 && normalizeArray(parsed.visualAssets).length >= 1) {
        const recovered = await recoverFlattenedPptText(parsed.visualAssets, { aiOptions: options.aiOptions });
        const classificationByLocator = new Map(recovered.classifications.map(item => [item.locator, item]));
        const visualAssets = normalizeArray(parsed.visualAssets).map(asset => ({
          ...asset,
          classification: classificationByLocator.get(String(asset.locator || "")) || null
        }));
        if (recovered.sections.length) {
          const merged = new Map(recovered.sections.map(section => [section.locator, section]));
          for (const section of parsed.sections) merged.set(section.locator, section);
          const sections = Array.from(merged.values());
          parsed = {
            ...parsed,
            sections,
            text: sections.map(section => `[${section.locator}]\n${section.text}`).join("\n\n"),
            visualAssets,
            metadata: { ...parsed.metadata, flattenedPptTextRecovery: recovered.analysis }
          };
        } else {
          parsed = {
            ...parsed,
            visualAssets,
            metadata: { ...parsed.metadata, flattenedPptTextRecovery: recovered.analysis }
          };
        }
      }
      if (parsed.kind === "image") {
        const vision = await openAiVisionJson(source, `读取这张参考资料图片。只返回 JSON object：
{
  "transcription":"尽量完整抄录图片中的可读文字和数字",
  "facts":["图片中明确表达的事实、数字、日期、人物、结论"],
  "description":"对图表、照片、结构和视觉信息的客观说明",
  "warnings":["无法确认或模糊的信息"]
}
不要猜测看不清的内容，不要补造数字。`, options.aiOptions || {});
        parsed = {
          ...parsed,
          text: [vision.transcription, ...cleanStringList(vision.facts), vision.description].filter(Boolean).join("\n"),
          sections: [{
            locator: "整张图片",
            text: [vision.transcription, ...cleanStringList(vision.facts), vision.description].filter(Boolean).join("\n")
          }],
          metadata: { ...parsed.metadata, vision }
        };
      }
    }

    const chunks = source.kind === "theme" ? [] : buildEvidenceChunks(parsed);
    const visualAssetCount = options.persistVisualAssets === false
      ? 0
      : await persistVisualAssets(source, parsed.visualAssets || []);
    await db.$transaction([
      db.deckGenerationEvidence.deleteMany({ where: { sourceId: source.id } }),
      ...(chunks.length ? [db.deckGenerationEvidence.createMany({
        data: chunks.map(chunk => ({
          runId: source.runId,
          sourceId: source.id,
          locator: chunk.locator,
          content: chunk.content,
          summary: chunk.content.slice(0, 240)
        }))
      })] : []),
      db.deckGenerationSource.update({
        where: { id: source.id },
        data: {
          status: "completed",
          extractedText: String(parsed.text || "").slice(0, 2_000_000),
          metadataJson: JSON.stringify({ ...(parsed.metadata || {}), visualAssetCount }),
          error: null
        }
      })
    ]);
    return { source, parsed, chunkCount: chunks.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.deckGenerationSource.update({
      where: { id: source.id },
      data: { status: "failed", error: message }
    });
    return { source, error: message, chunkCount: 0 };
  }
}

function normalizeAdvancedOutline(result, run) {
  const rawPages = normalizeArray(result.pages || result.slides);
  const requestedCount = Math.max(2, Math.min(30, rawPages.length || run.pageCount));
  const pages = rawPages.slice(0, requestedCount).map((page, index) => {
    const rawBlocks = normalizeArray(page.blocks || page.sections || page.subtitles);
    const blocks = rawBlocks.map((block, blockIndex) => typeof block === "string"
      ? { id: `block-${blockIndex + 1}`, subtitle: block, instruction: "", constraintMode: "polish", content: "", evidenceIds: [] }
      : {
        id: String(block.id || `block-${blockIndex + 1}`),
        subtitle: String(block.subtitle || block.title || "").slice(0, 120),
        instruction: String(block.instruction || block.intent || block.content || "").slice(0, 1200),
        constraintMode: ["exact", "polish", "direction"].includes(block.constraintMode || block.constraint_mode)
          ? String(block.constraintMode || block.constraint_mode)
          : "polish",
        content: String(block.content || "").slice(0, 2000),
        evidenceIds: cleanStringList(block.evidenceIds || block.evidence_ids, 20)
      });
    return {
      pageIndex: index + 1,
      title: cleanSlideTitle(page.title, index === 0 ? run.projectName : `第 ${index + 1} 页`),
      role: normalizedSlideRole(index, requestedCount, page.role),
      purpose: String(page.purpose || page.intent || page.key_message || "").slice(0, 1200),
      blocks,
      mustInclude: cleanStringList(page.must_include || page.mustInclude, 30),
      conclusion: String(page.conclusion || page.takeaway || "").slice(0, 1000),
      density: ["sparse", "standard", "compact"].includes(page.density) ? page.density : (index === 0 || index === requestedCount - 1 ? "sparse" : "standard"),
      layoutType: String(page.layout_type || page.layoutType || "auto").slice(0, 80),
      constraintMode: ["exact", "polish", "direction"].includes(page.constraint_mode || page.constraintMode)
        ? String(page.constraint_mode || page.constraintMode)
        : "polish",
      evidence: [],
      warnings: [],
      locked: Boolean(page.locked)
    };
  });
  while (pages.length < requestedCount) {
    const index = pages.length;
    pages.push({
      pageIndex: index + 1,
      title: index === 0 ? run.projectName : index === requestedCount - 1 ? "结语" : `第 ${index + 1} 页`,
      role: normalizedSlideRole(index, requestedCount),
      purpose: "",
      blocks: [],
      mustInclude: [],
      conclusion: "",
      density: index === 0 || index === requestedCount - 1 ? "sparse" : "standard",
      layoutType: "auto",
      constraintMode: "polish",
      evidence: [],
      warnings: ["该页来自页数补位，请确认标题和内容意图"],
      locked: false
    });
  }
  return pages;
}

function outlinePrompt(run, outlineMaterial) {
  return `${readSkill("outline-control.md")}

你正在把用户已经决定的大标题框架整理成可编辑的逐页结构，不能擅自改写汇报逻辑。
项目：${run.projectName}
用途：${run.projectType || "未填写"}
项目说明：${run.brief}

用户提供的大纲：
${outlineMaterial.slice(0, 120_000)}

只返回 JSON object：
{
  "pages":[{
    "title":"",
    "role":"cover|problem|insight|solution|architecture|feature|scenario|data|roadmap|ending",
    "purpose":"这一页要回答什么",
    "blocks":[{"subtitle":"","instruction":"","constraint_mode":"exact|polish|direction"}],
    "must_include":[],
    "conclusion":"",
    "density":"sparse|standard|compact",
    "layout_type":"auto|overview|comparison|timeline|data-dashboard|matrix|process|case-study"
  }]
}

规则：
- 用户写明“第几页”的顺序必须保留；没有页码时按原大纲顺序拆分。
- 用户只给大标题时，可补“待匹配资料”的内容块，但不能凭空补事实。
- 用户给了小标题和想讲的内容时必须完整保留。
- 只有用户明确要求“原文保留、逐字保留、不可改写”或给出必须逐字出现的引文时才使用 exact；不能因为段落里有数字就把整段设为 exact。普通内容默认 polish，表达意图使用 direction，数字和专名通过证据字段锁定。
- 不要把“资料中的明确证据、资料中的现场照片、待匹配资料”这类制作备注写成观众可见内容块或必须上屏文字。
- 封面和最后一页默认 sparse。最后一页必须以强情绪、少文字完成叙事收束；价值、落地、路线、证据、指标或下一步等非逐字锁定内容应压缩为一句结论或移到前一页，不得把最后一页做成普通内容页。
- 不要输出视觉方案，不要开始生图。`;
}

async function processSourcesRun(run) {
  const processingRun = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "source_processing", startedAt: run.startedAt || new Date(), error: null }
  });
  const sources = await db.deckGenerationSource.findMany({
    where: { runId: run.id },
    orderBy: { createdAt: "asc" }
  });
  if (run.generationMode === "advanced") {
    await db.deckGenerationVisualEvidence.deleteMany({ where: { runId: run.id } });
  }
  const advancedRun = run.generationMode === "advanced";
  const sourceConcurrency = advancedRun ? advancedSourceReadConcurrency : 1;
  await mapWithConcurrency(sources, sourceConcurrency, source => extractOneSource(source, {
    visualTextFallback: advancedRun,
    persistVisualAssets: !advancedRun,
    aiOptions: advancedRun ? advancedTextOptions() : {}
  }));
  if (advancedRun && advancedSourceVisualReuseEnabled) await analyzeRunVisualEvidence(run.id);

  const refreshedSources = await db.deckGenerationSource.findMany({
    where: { runId: run.id },
    orderBy: { createdAt: "asc" }
  });
  const evidence = await db.deckGenerationEvidence.findMany({
    where: { runId: run.id },
    include: { source: { select: { originalName: true } } },
    orderBy: { createdAt: "asc" },
    take: 160
  });
  const visualEvidence = [];
  const theme = run.paletteMode === "reference" ? refreshedSources.find(source => source.kind === "theme" && source.status === "completed") : null;
  const themeMetadata = theme ? safeJson(theme.metadataJson, {}) : {};
  const sourceCatalog = refreshedSources.map(source => ({
    id: source.id,
    kind: source.kind,
    name: source.originalName,
    status: source.status,
    error: source.error,
    characters: source.extractedText.length
  }));
  const analysisSummary = {
    sourceCatalog,
    evidencePreview: evidence.map(item => ({
      id: item.id,
      source: item.source.originalName,
      locator: item.locator,
      content: item.content.slice(0, 1200)
    })),
    visualEvidencePreview: visualEvidence.map(item => ({
      id: item.id,
      source: item.source.originalName,
      locator: item.locator,
      kind: item.kind,
      description: item.description,
      usefulness: item.usefulness
    })),
    failedCount: refreshedSources.filter(source => source.status === "failed").length,
    completedCount: refreshedSources.filter(source => source.status === "completed").length
  };

  if (run.generationMode !== "advanced") {
    await db.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "queued",
        analysisSummaryJson: JSON.stringify(analysisSummary),
        paletteContractJson: JSON.stringify(themeMetadata.palette || {}),
        error: analysisSummary.failedCount ? "部分资料读取失败，方案将使用其余已成功读取的资料。" : null
      }
    });
    return;
  }

  const outlineInput = safeJson(run.outlineInputJson, {});
  const outlineSources = refreshedSources.filter(source => source.kind === "outline" && source.status === "completed");
  const outlineMaterial = [
    String(outlineInput.text || "").trim(),
    ...outlineSources.map(source => `[${source.originalName}]\n${source.extractedText}`)
  ].filter(Boolean).join("\n\n");
  if (!outlineMaterial) throw new Error("没有读取到可用的 PPT 结构，请返回并重新填写或上传大纲");

  const pages = normalizeAdvancedOutline(await withTransientRetry(() => openAdvancedAiJson(outlinePrompt(run, outlineMaterial))), run);
  await db.$transaction(async tx => {
    const claimed = await tx.deckGenerationRun.updateMany({
      where: { id: run.id, status: "source_processing", updatedAt: processingRun.updatedAt },
      data: {
        status: "matching_queued",
        pageCount: pages.length,
        analysisSummaryJson: JSON.stringify(analysisSummary),
        paletteContractJson: JSON.stringify(themeMetadata.palette || {}),
        error: analysisSummary.failedCount ? "部分资料读取失败，请在逐页匹配前检查资料状态。" : null
      }
    });
    if (!claimed.count) return;
    await tx.deckGenerationPagePlan.deleteMany({ where: { runId: run.id } });
    await tx.deckGenerationPagePlan.createMany({
      data: pages.map(page => ({
        runId: run.id,
        pageIndex: page.pageIndex,
        title: page.title,
        role: page.role,
        purpose: page.purpose,
        blocksJson: JSON.stringify(page.blocks),
        mustIncludeJson: JSON.stringify(page.mustInclude),
        conclusion: page.conclusion,
        density: page.density,
        layoutType: page.layoutType,
        constraintMode: page.constraintMode,
        evidenceJson: "[]",
        warningsJson: JSON.stringify(page.warnings),
        locked: page.locked
      }))
    });
  });
}

function searchTokens(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  const tokens = new Set();
  for (const word of String(value || "").toLowerCase().match(/[a-z0-9]{2,}|[\p{Script=Han}]{2,}/gu) || []) tokens.add(word);
  for (let index = 0; index < normalized.length - 1; index += 1) tokens.add(normalized.slice(index, index + 2));
  return tokens;
}

function evidenceScore(queryTokens, evidence) {
  const contentTokens = searchTokens(`${evidence.locator} ${evidence.summary} ${evidence.content.slice(0, 1000)}`);
  let score = 0;
  for (const token of queryTokens) if (contentTokens.has(token)) score += token.length > 2 ? 3 : 1;
  return score;
}

function visualEvidenceScore(queryTokens, evidence) {
  const contentTokens = searchTokens(`${evidence.source?.originalName || ""} ${evidence.locator} ${evidence.description} ${evidence.tagsJson}`);
  let score = Math.round(Number(evidence.usefulness || 0) / 12);
  for (const token of queryTokens) if (contentTokens.has(token)) score += token.length > 2 ? 4 : 1;
  if (evidence.kind === "direct-proof") score += 5;
  else if (evidence.kind === "real-world" || evidence.kind === "data-proof") score += 3;
  else if (evidence.kind === "decorative") score -= 20;
  return score;
}

function pageSemanticText(page) {
  return [page.title, page.purpose, page.conclusion, page.blocksJson, page.mustIncludeJson]
    .map(value => typeof value === "string" ? value : JSON.stringify(value || ""))
    .join(" ");
}

function visualEvidenceTextForPage(page, evidence) {
  const sameLocatorFacts = jsonArray(page.evidenceJson)
    .filter(item => String(item.locator || "") === String(evidence.locator || ""))
    .map(item => String(item.content || ""));
  return [evidence.kind, evidence.description, normalizeArray(evidence.tags).join(" "), ...normalizeArray(evidence.facts), ...sameLocatorFacts].join(" ");
}

function visualEvidenceMetadata(evidence) {
  return [evidence.kind, evidence.description, normalizeArray(evidence.tags).join(" ")].join(" ");
}

function visualEvidenceAllowedForPage(page, evidence) {
  const archetype = fallbackPageArchetype(page);
  const evidenceText = visualEvidenceTextForPage(page, evidence);
  if (evidence.kind === "decorative") return false;
  if (archetype === "problem-diagnosis") {
    const solutionLed = /创新思路|解决方案|技术路线|核心技术|优化方案|系统方案|材料改进|结构优化|工艺方案/.test(evidenceText);
    if (solutionLed) return false;
    const problemProof = /现场调研|问题发现|失效|磨损|故障|设备现状|现状数据|痛点证据|行业现状|竞品|进口依赖/.test(visualEvidenceMetadata(evidence));
    if (!problemProof) return false;
  }
  if (archetype === "application-case" && !["real-world", "direct-proof"].includes(evidence.kind)) return false;
  if (["evidence-wall", "validation"].includes(archetype) && evidence.kind === "context") return false;
  return true;
}

function visualEvidenceCoverageNeeds(page) {
  const text = pageSemanticText(page);
  const definitions = [
    { label: "知识产权", page: /专利|知识产权|软著|软件著作权/, evidence: /专利|知识产权|软著|软件著作权/ },
    { label: "检测", page: /检测|检验|查新|测试报告/, evidence: /检测报告|检验报告|检测证书|产品检测|性能检测|第三方检测|查新报告/ },
    { label: "合作", page: /合作|协议|客户/, evidence: /合作协议|合作单位|校企合作|客户协议|合作实施/ },
    { label: "真实应用", page: /真实应用|实车|试用|装车|应用案例/, evidence: /真实应用|实车测试|试用案例|现场应用|装车|安装\s*\d+\s*套|场景覆盖|数据监测/ }
  ];
  return definitions.filter(item => item.page.test(text));
}

function visualEvidenceCoverageScore(page, need, evidence) {
  const metadata = visualEvidenceMetadata(evidence);
  const groundedText = visualEvidenceTextForPage(page, evidence);
  let score = Number(evidence.usefulness || 0);
  if (evidence.kind === "direct-proof") score += 18;
  if (need.label === "知识产权") {
    if (/专利|知识产权|软著|软件著作权/.test(metadata)) score += 220;
  } else if (need.label === "检测") {
    if (/检测报告|检验报告|检测证书|产品检测|查新报告/.test(metadata)) score += 260;
    if (/检测报告|检验报告|第三方检测|查新报告/.test(groundedText)) score += 90;
    if (/合作案例|合作协议/.test(metadata)) score -= 120;
  } else if (need.label === "合作") {
    if (/合作协议|合作单位|校企合作|客户协议/.test(metadata)) score += 220;
    if (/合作实施|初步验收/.test(groundedText)) score += 50;
  } else if (need.label === "真实应用") {
    if (/真实应用|实车测试|试用案例|现场应用|安装\s*\d+\s*套/.test(groundedText)) score += 300;
    if (/场景覆盖|数据监测|现场记录/.test(metadata)) score += 80;
    if (/未来展望|发展规划|阶段目标|销售目标|规划|目标为|计划/.test(groundedText)) score -= 260;
  }
  return score;
}

function selectVisualEvidenceForPage(page, requested, candidates, limit) {
  const query = searchTokens(pageSemanticText(page));
  const ranked = candidates
    .filter(candidate => visualEvidenceAllowedForPage(page, candidate))
    .map(candidate => ({
      candidate,
      score: visualEvidenceScore(query, candidate)
        + (jsonArray(page.evidenceJson).some(item => String(item.locator || "") === String(candidate.locator || "")) ? 7 : 0)
    }))
    .sort((left, right) => right.score - left.score)
    .map(item => item.candidate);
  const selected = [];
  const add = candidate => {
    if (!candidate || selected.some(item => item.id === candidate.id) || selected.length >= limit) return;
    selected.push(candidate);
  };
  for (const need of visualEvidenceCoverageNeeds(page)) {
    const coverageMatch = ranked
      .filter(candidate => (
        !selected.some(item => item.id === candidate.id)
        && need.evidence.test(visualEvidenceTextForPage(page, candidate))
      ))
      .sort((left, right) => visualEvidenceCoverageScore(page, need, right) - visualEvidenceCoverageScore(page, need, left))[0];
    add(coverageMatch);
  }
  requested.filter(candidate => visualEvidenceAllowedForPage(page, candidate)).forEach(add);
  ranked.forEach(add);
  return selected.slice(0, limit);
}

function matchingPrompt(run, pages, candidates) {
  return `${readSkill("source-grounding.md")}

你是领导汇报 PPT 的资料编辑。用户已经决定每一页讲什么，你只负责从证据候选中选择可靠内容并整理成逐页内容包。

项目：${run.projectName}
用途：${run.projectType || "未填写"}
项目说明：${run.brief}
用户整套高优先级要求：${run.referenceText || "无"}

逐页结构：
${JSON.stringify(pages)}

证据候选（id、文件、位置、原文）：
${JSON.stringify(candidates)}

只返回 JSON object：
{
  "pages":[{
    "page_index":1,
    "title":"",
    "purpose":"",
    "blocks":[{"subtitle":"","instruction":"","constraint_mode":"exact|polish|direction","content":"","evidence_ids":[]}],
    "must_include":[],
    "conclusion":"",
    "density":"sparse|standard|compact",
    "layout_type":"",
    "evidence_ids":[],
    "warnings":[]
  }]
}

硬规则：
- 不允许编造证据候选中没有的数字、日期、荣誉、姓名或结论。
- 用户整套高优先级要求控制强调重点、受众、禁用表达和视觉偏好，但它本身不是事实证据；涉及事实仍只能使用证据候选。
- 每个事实块必须填写 evidence_ids；资料不足就在 warnings 写明，不要硬凑。
- 用户资料中的图片只用于必要的文字识别和语义理解，不作为最终页面素材。不得输出图片候选、裁片计划或证据墙布局。
- 问题诊断页只能使用现状、现场调研、失效、故障和痛点事实，不得提前混入创新思路、技术路线或完整解决方案。
- 保持用户的页序、大标题、小标题和约束模式。
- compact 页面可以信息紧凑，但必须有层级，不堆成长段。
- 第 1 页和最后一页少文字、强情绪。最后一页只保留一句收束性结论和最多一条简短支撑语；价值、落地、路线、证据、指标或下一步等非逐字锁定内容必须压缩表达，不得变成普通正文页。
- 返回面向最终观众的页面文案，不要把“资料中的明确证据、资料归纳、待匹配资料、系统整理”等制作过程语言写进正文；需要限定来源时用自然的“检测报告显示、查新报告表述”等具体归因。
- 不要输出视觉设计或图片提示词。`;
}

function pagePlanPayload(page) {
  return {
    page_index: page.pageIndex,
    title: page.title,
    role: page.role,
    purpose: page.purpose,
    blocks: jsonArray(page.blocksJson),
    must_include: jsonArray(page.mustIncludeJson),
    conclusion: page.conclusion,
    density: page.density,
    layout_type: page.layoutType,
    constraint_mode: page.constraintMode,
    evidence: jsonArray(page.evidenceJson),
    visual_evidence: jsonArray(page.visualEvidenceJson),
    director_contract: safeJson(page.directorContractJson, {}),
    warnings: jsonArray(page.warningsJson),
    locked: page.locked
  };
}

function fallbackPageArchetype(page) {
  const combined = `${page.title} ${page.purpose} ${page.conclusion} ${page.layoutType}`;
  if (page.role === "cover") return "cover";
  if (page.role === "ending") return "summary-close";
  if (/痛点|问题|现状|挑战|难题|困境|短板/.test(combined)) return "problem-diagnosis";
  if (/合同|专利|证书|报告|资质|荣誉|证明/.test(combined)) return "proof-summary";
  if (/实验|测试|验证|性能|检测|对比/.test(combined)) return "validation";
  if (/客户|应用|案例|落地|现场|交付/.test(combined)) return "application-case";
  if (/营收|订单|融资|商业|市场份额|合作/.test(combined)) return "commercial-proof";
  if (/市场|竞品|行业|规模|趋势/.test(combined)) return "market-analysis";
  if (/团队|导师|成员|背书/.test(combined)) return "team-backing";
  if (/规划|路线|阶段|里程碑|进度/.test(combined)) return "roadmap";
  if (/原理|机理|技术|结构|架构|系统/.test(combined)) return "principle";
  return "solution-system";
}

function normalizeDirectorContract(value, page) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const visualEvidence = jsonArray(page.visualEvidenceJson);
  const visualIds = new Set(visualEvidence.map(item => String(item.id || "")));
  const requestedPrimary = String(source.primary_evidence_id || "");
  const primaryEvidenceId = visualIds.has(requestedPrimary) ? requestedPrimary : String(visualEvidence[0]?.id || "");
  const iconPolicy = ["none", "functional-only", "limited-semantic"].includes(String(source.icon_policy))
    ? String(source.icon_policy)
    : "none";
  const cardPolicy = ["avoid", "limited", "justified-grid"].includes(String(source.card_policy))
    ? String(source.card_policy)
    : "avoid";
  const visualStrategy = String(source.visual_strategy || (page.role === "cover" ? "conceptual-illustration" : "editorial-composition")).slice(0, 80);
  const effectiveVisualStrategy = page.role === "ending" ? "conceptual-illustration" : visualStrategy;
  const visualWeight = page.role === "cover" || page.role === "ending"
    ? "visual-led"
    : ["text-led", "balanced", "visual-led"].includes(String(source.visual_weight))
      ? String(source.visual_weight)
      : effectiveVisualStrategy === "typography" ? "text-led" : "balanced";
  const visualUnits = normalizeArray(source.visual_units).slice(0, 4).map((item, index) => {
    const unit = item && typeof item === "object" && !Array.isArray(item) ? item : {};
    const relationship = ["context", "sequence", "cause", "contrast", "mechanism", "result", "evidence"].includes(String(unit.relationship))
      ? String(unit.relationship)
      : "context";
    return {
      id: String(unit.id || `visual-${index + 1}`).slice(0, 80),
      supports: String(unit.supports || "").slice(0, 500),
      form: String(unit.form || "").slice(0, 500),
      relationship,
      importance: String(unit.importance) === "supporting" ? "supporting" : "primary"
    };
  }).filter(item => item.supports && item.form);
  const fallbackArchetype = fallbackPageArchetype(page);
  const ending = page.role === "ending";
  const requestedArchetypeRaw = String(source.page_archetype || "");
  const requestedArchetype = requestedArchetypeRaw === "evidence-wall" && !visualEvidence.length
    ? "proof-summary"
    : requestedArchetypeRaw;
  const pageArchetype = ending
    ? "summary-close"
    : ["problem-diagnosis", "evidence-wall"].includes(fallbackArchetype)
    ? fallbackArchetype
    : (requestedArchetype || fallbackArchetype);
  const evidenceCapacity = evidenceCapacityForArchetype(pageArchetype);
  const secondaryEvidenceIds = cleanStringList(source.secondary_evidence_ids, maxAdvancedVisualEvidence)
    .filter(id => visualIds.has(id) && id !== primaryEvidenceId)
    .slice(0, Math.max(0, evidenceCapacity - 1));
  const rawProtectedLayout = source.protected_evidence_layout ?? source.evidence_layout;
  const protectedLayoutItems = Array.isArray(rawProtectedLayout)
    ? rawProtectedLayout
    : rawProtectedLayout && typeof rawProtectedLayout === "object"
      ? [rawProtectedLayout.primary, ...normalizeArray(rawProtectedLayout.secondary)]
      : [];
  const protectedEvidenceLayout = protectedLayoutItems
    .slice(0, evidenceCapacity).map((item, index) => normalizedProtectedRegion(item, { x: 0.52, y: 0.25 + index * 0.18, w: 0.40, h: 0.15 }));
  const evidenceCoverage = visualEvidenceCoverageNeeds(page).map(need => {
    const matched = visualEvidence.find(item => need.evidence.test(visualEvidenceTextForPage(page, item)));
    return matched ? { label: need.label, evidence_id: matched.id, locator: matched.locator || "" } : null;
  }).filter(Boolean);
  const requestedBrief = String(source.main_visual_brief || source.director_notes || `${page.title} 的主题化主视觉，服务于本页唯一结论`).slice(0, 1200);
  const endingLayout = {
    silhouette: "cover-level emotional close with one dominant thematic visual",
    title_zone: "标题或收束句置于大留白区，保持克制",
    primary_zone: "主题化主视觉占据大部分画面，承担情绪收束",
    support_zone: "最多一条简短支撑语，不使用信息卡、流程或图表",
    reading_order: ["收束句", "主题主视觉", "可选短支撑语"]
  };
  return {
    unique_takeaway: String(source.unique_takeaway || page.conclusion || page.purpose || page.title).slice(0, 500),
    page_archetype: pageArchetype.slice(0, 80),
    proof_goal: String(source.proof_goal || page.purpose || page.conclusion || "让本页结论得到资料证据支持").slice(0, 700),
    visual_strategy: effectiveVisualStrategy,
    main_visual_brief: ending
      ? `封面级情绪收束：以 ${requestedBrief} 为基础，使用一个有力量的象征性主题画面，主体占据大部分画面；为一句收束性结论留出大面积空白。不得制作信息图、路线图、数据图、卡片或纪实证明场景。`.slice(0, 1400)
      : requestedBrief,
    visual_weight: visualWeight,
    visual_units: visualUnits.length || effectiveVisualStrategy === "typography"
      ? visualUnits
      : [{
        id: "visual-1",
        supports: String(page.conclusion || page.purpose || page.title).slice(0, 500),
        form: effectiveVisualStrategy === "fact-based-chart"
          ? "只依据本页已确认数字与标签绘制的事实图表"
          : "与本页主题直接相关、明确非纪实的概念性或编辑式画面",
        relationship: effectiveVisualStrategy === "comparison" ? "contrast" : effectiveVisualStrategy === "process" || effectiveVisualStrategy === "timeline" ? "sequence" : "context",
        importance: "primary"
      }],
    integration_rule: String(source.integration_rule || "让每个画面单元紧邻或贯穿其所支撑的文字，按本页语义建立一条阅读路径；不得把画面统一塞入固定的底部、右侧或背景图片区。").trim().slice(0, 1200),
    primary_evidence_id: primaryEvidenceId,
    secondary_evidence_ids: secondaryEvidenceIds,
    evidence_priority: cleanStringList(source.evidence_priority, 6),
    required_visual_evidence_count: Math.min(evidenceCapacity, visualEvidence.length),
    evidence_coverage: evidenceCoverage,
    layout_blueprint: ending ? endingLayout : source.layout_blueprint && typeof source.layout_blueprint === "object" ? source.layout_blueprint : {
      silhouette: page.layoutType || "evidence-led",
      title_zone: "统一标题区",
      primary_zone: primaryEvidenceId ? "真实主证据占据页面视觉中心" : "以结论和资料内可验证信息建立视觉中心",
      support_zone: "辅助证据和必要解释从属于主证据",
      reading_order: ["标题", "主证据", "结论", "辅助说明"]
    },
    protected_evidence_layout: protectedEvidenceLayout,
    icon_policy: page.role === "cover" || page.role === "ending" ? "none" : iconPolicy,
    card_policy: ending ? "avoid" : cardPolicy,
    authenticity_policy: String(source.authenticity_policy || "用户资料图片不进入最终页面；生成视觉只能作为主题化表达，不能冒充真实机构、产品、人物、客户现场或证明材料").slice(0, 800),
    forbidden_fabrication: Array.from(new Set([
      ...cleanStringList(source.forbidden_fabrication, 20),
      "fake certificate or contract",
      "fake laboratory or customer scene",
      "fake product, logo, person, award, interface or media coverage",
      "readable institution signage or invented brand marks"
    ])).slice(0, 20),
    director_notes: ending
      ? `${String(source.director_notes || "").slice(0, 760)} 结尾页必须少文字、重情绪，以一句收束性结论和主视觉结束叙事。`.trim()
      : String(source.director_notes || "").slice(0, 1000)
  };
}

async function persistDeckPlan(run, plan) {
  await db.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: "plan_ready",
      pageCount: plan.slide_image_specs.slides.length,
      outlineJson: JSON.stringify(plan.outline),
      visualIdentityJson: JSON.stringify(plan.visual_identity),
      visualStoryboardJson: JSON.stringify(plan.visual_storyboard),
      slideImageSpecsJson: JSON.stringify(plan.slide_image_specs),
      planReadyAt: new Date(),
      finishedAt: null,
      error: null
    }
  });
  await db.deckGenerationSlide.createMany({
    data: plan.slide_image_specs.slides.map(slide => ({
      runId: run.id,
      slideIndex: slide.slide_index,
      title: slide.title,
      role: slide.role,
      specJson: JSON.stringify(slide),
      status: "waiting"
    }))
  });
}

async function planAdvancedRun(run, expectedUpdatedAt = null) {
  const pages = await db.deckGenerationPagePlan.findMany({
    where: { runId: run.id },
    orderBy: { pageIndex: "asc" }
  });
  const pagePayload = pages.map(pagePlanPayload);
  const prompt = `${skillBundle({ colorNeutral: run.paletteMode === "reference" })}

--- 高级版单页导演 ---

${advancedDirectorSkillBundle()}

请把下面已经按用户大纲匹配资料的逐页内容包，转成一份可由用户一次确认的完整 PPT 方案。你是整套内容总编和视觉总监：不要改页序，不要删除用户指定的小标题、事实和结论。

项目：${run.projectName}
用途：${run.projectType || "未填写"}
版式语言：${runStyleDirection(run)}
用户整套高优先级要求：${run.referenceText || "无"}
主题配色合同：${run.paletteContractJson}
统一元素选项：${run.unityOptionsJson}
逐页内容包：${JSON.stringify(pagePayload)}

只返回 JSON object：
{
  "outline":{"title":"","slides":[]},
  "visual_identity":{},
  "visual_storyboard":{"slides":[]},
  "slide_image_specs":{"slides":[{"slide_index":1,"composition":"","main_visual":"","director_contract":{"unique_takeaway":"","page_archetype":"","proof_goal":"","visual_strategy":"conceptual-illustration|editorial-composition|fact-based-chart|timeline|process|comparison|typography","main_visual_brief":"","visual_weight":"text-led|balanced|visual-led","visual_units":[{"supports":"","form":"","relationship":"context|sequence|cause|contrast|mechanism|result|evidence","importance":"primary|supporting"}],"integration_rule":"","layout_blueprint":{},"icon_policy":"none|functional-only|limited-semantic","card_policy":"avoid|limited|justified-grid","authenticity_policy":"","forbidden_fabrication":[],"director_notes":""}}]}
}

要求：
- 页数必须是 ${pages.length}，标题、页序和 role 与逐页内容包一致。
- exact 内容必须原样进入 must_include；polish 只允许压缩表达，不得改变事实；direction 可以转成合适的版式表达。
- sparse 用于封面和最后一页；standard 为普通正文；compact 必须做成高密度但有清楚分区的专业汇报页。最后一页无论包含价值、落地、路线、证据、指标或下一步，都必须压缩为有情绪力量的一句收束性结论和最多一条支撑语；只有用户明确锁定的原文例外。
- 所有数字、日期和专名只能来自逐页内容包的 evidence。
- 每页 director_contract 必须给出明确的 unique_takeaway、visual_strategy、main_visual_brief、visual_weight、visual_units、integration_rule 和版式骨架，让 Image2 只负责执行，不再自行理解原始资料。
- 适合图像表达的正文页优先规划 1-3 个画面单元，高密度页最多 4 个；纯文字论证可以为 0 个。每个 visual_unit 必须明确支撑逐页内容包中的哪条正文、阶段、对比、机制、背景或结果，不能只写“配图”“科技图片”或情绪词。
- 所有画面单元与文字必须在同一次 Image2 请求的一张完整页面图中共同构图。位置由 sequence、cause、contrast、mechanism、context、result 或 evidence 关系决定，不得固定为左文右图、上文下图或统一底部图片区。
- 多个画面单元必须形成一个主次清楚的语义构图，不得拼贴互不相关的图片，也不得默认改成等权卡片阵列。
- 用户上传资料中的图片只用于 GPT-5.6 读取文字和含义，不作为最终页面素材，不得输出 visual_evidence、protected_evidence_layout 或证据裁片计划。
- problem-diagnosis 问题诊断页不得提前使用创新思路、技术路线或完整解决方案。证明、专利、合同和报告页应把已确认事实整理成克制的文字与数据叙事，不生成仿真的证书、合同或报告截图。
- 严肃汇报、比赛和技术页面的通用装饰图标默认设为 none；真实证据不足时使用排版和中性几何，不生成假证据场景。
- 封面必须根据整份 PPT 的主题设计一个强主视觉、少文字的完整封面。可以生成主题化、象征性的场景或概念视觉，但不得生成可读校名、机构招牌、Logo 或冒充真实校园、真实产品和真实客户现场。
- 纯致谢或口号型结尾必须重情绪、少文字、强收束；包含路线、指标、建议或下一步的内容型结尾仍需保留实质信息。
- main_visual_brief 必须具体说明整体主体、构图、景别、留白方向和情绪，并统筹 visual_units；不得只写“科技感”“高级感”或重复页面标题。
- 用户整套高优先级要求必须落实到所有适用页面的内容取舍、visual_weight、visual_units 和 integration_rule；它是制作约束，不得被直接渲染成页面文字，也不能覆盖真实性与配色硬规则。
- director_contract 只决定本页语义任务和布局骨架，不能覆盖 visual_identity 的配色、字体、页眉页脚、网格和图片处理规则。
- 使用主题参考图时严格遵守 paletteContractJson 的色彩职责，不照抄参考图版式。
- 参考图配色模式下，任何风格包自带的颜色名称、颜色建议和配色禁令全部失效；只保留版式结构、信息层级和视觉节奏。`;
  const normalized = normalizePlan(await withTransientRetry(() => openAdvancedAiJson(prompt, {
    timeoutMs: advancedPlanTimeoutMs
  }), [900, 2200], { noRetryHeadersTimeout: true }), { ...run, pageCount: pages.length });
  normalized.slide_image_specs.slides = normalized.slide_image_specs.slides.map((slide, index) => {
    const page = pages[index];
    const blocks = jsonArray(page.blocksJson);
    const mustInclude = [
      ...jsonArray(page.mustIncludeJson),
      ...blocks.filter(block => block.constraintMode === "exact" || block.constraint_mode === "exact").flatMap(block => [block.subtitle, block.content]).filter(Boolean)
    ];
    const density = page.density === "compact" ? "high" : page.density === "sparse" ? "low" : "medium";
    return {
      ...slide,
      title: page.title,
      role: page.role,
      content_summary: [page.purpose, ...blocks.map(block => [block.subtitle, block.content || block.instruction].filter(Boolean).join("：")), page.conclusion].filter(Boolean).join("\n").slice(0, 6000),
      composition: `版式类型：${page.layoutType}；信息密度：${page.density}。 ${slide.composition}`,
      text_density: density,
      must_include: audienceMustInclude(mustInclude.map(String), page.title).slice(0, 30),
      evidence: jsonArray(page.evidenceJson),
      visual_evidence: jsonArray(page.visualEvidenceJson),
      warnings: jsonArray(page.warningsJson),
      director_contract: normalizeDirectorContract(slide.director_contract, page)
    };
  });
  normalized.outline = normalizeOutline(normalized, run, normalized.slide_image_specs.slides);
  normalized.visual_storyboard = normalizeStoryboard(normalized, normalized.slide_image_specs.slides);
  await persistDeckPlanWithContracts(run, normalized, expectedUpdatedAt);
}

async function matchAdvancedRun(run) {
  const matchingRun = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "matching", error: null }
  });
  const pages = await db.deckGenerationPagePlan.findMany({
    where: { runId: run.id },
    orderBy: { pageIndex: "asc" }
  });
  const evidence = await db.deckGenerationEvidence.findMany({
    where: { runId: run.id },
    include: { source: { select: { originalName: true } } },
    take: 2500
  });
  const candidateMap = new Map();
  for (const page of pages) {
    const query = searchTokens([page.title, page.purpose, page.conclusion, page.blocksJson, page.mustIncludeJson].join(" "));
    evidence
      .map(item => ({ item, score: evidenceScore(query, item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .forEach(({ item }) => candidateMap.set(item.id, {
        id: item.id,
        file: item.source.originalName,
        locator: item.locator,
        content: item.content.slice(0, 1400)
      }));
  }
  const candidates = Array.from(candidateMap.values()).slice(0, 120);
  const result = await withTransientRetry(() => openAdvancedAiJson(matchingPrompt(run, pages.map(pagePlanPayload), candidates)));
  const returned = normalizeArray(result.pages);
  const evidenceById = new Map(candidates.map(item => [item.id, item]));

  const updates = [];
  for (const page of pages) {
    if (page.locked) continue;
    const item = returned.find(candidate => Number(candidate.page_index) === page.pageIndex) || {};
    const evidenceIds = Array.from(new Set([
      ...cleanStringList(item.evidence_ids, 30),
      ...normalizeArray(item.blocks).flatMap(block => cleanStringList(block.evidence_ids, 20))
    ])).filter(id => evidenceById.has(id));
    const matchedEvidence = evidenceIds.map(id => evidenceById.get(id));
    const blocks = normalizeArray(item.blocks).map((block, index) => ({
      id: String(block.id || `block-${index + 1}`),
      subtitle: String(block.subtitle || "").slice(0, 120),
      instruction: String(block.instruction || "").slice(0, 1200),
      constraintMode: ["exact", "polish", "direction"].includes(block.constraint_mode) ? block.constraint_mode : "polish",
      content: String(block.content || "").slice(0, 2400),
      evidenceIds: cleanStringList(block.evidence_ids, 20).filter(id => evidenceById.has(id))
    }));
    updates.push({
      id: page.id,
      data: {
        title: cleanSlideTitle(item.title, page.title),
        purpose: String(item.purpose || page.purpose).slice(0, 1200),
        blocksJson: JSON.stringify(blocks.length ? blocks : jsonArray(page.blocksJson)),
        mustIncludeJson: JSON.stringify(cleanStringList(item.must_include, 30).length ? cleanStringList(item.must_include, 30) : jsonArray(page.mustIncludeJson)),
        conclusion: String(item.conclusion || page.conclusion).slice(0, 1000),
        density: ["sparse", "standard", "compact"].includes(item.density) ? item.density : page.density,
        layoutType: String(item.layout_type || page.layoutType || "auto").slice(0, 80),
        evidenceJson: JSON.stringify(matchedEvidence),
        visualEvidenceJson: "[]",
        warningsJson: JSON.stringify(cleanStringList(item.warnings, 20))
      }
    });
  }
  const refreshed = await db.$transaction(async tx => {
    const current = await tx.deckGenerationRun.findUnique({ where: { id: run.id } });
    if (!current || current.status !== "matching" || current.updatedAt.getTime() !== matchingRun.updatedAt.getTime()) return null;
    for (const update of updates) {
      await tx.deckGenerationPagePlan.update({ where: { id: update.id }, data: update.data });
    }
    return tx.deckGenerationRun.update({ where: { id: run.id }, data: { error: null } });
  });
  if (!refreshed) return;
  await planAdvancedRun(refreshed, refreshed.updatedAt);
}

function planPrompt(run, sourceContext = "") {
  return `${skillBundle()}

你是 WZLCF 的 PPT 图组导演。请根据下面输入，先生成方案，不要生成图片。

项目名称：${run.projectName}
用途/类型：${run.projectType || "未填写"}
页数：${run.pageCount}
风格包：${run.stylePack}（${stylePackName(run.stylePack)}）
统一元素选项：${run.unityOptionsJson}
项目简介：
${run.brief}
用户粘贴的补充资料：
${run.referenceText || "无"}

已读取资料中的证据（文件名、页码/工作表位置、原文）：
${sourceContext || "无上传资料"}

主题配色合同：
${run.paletteContractJson || "{}"}


请返回 JSON object，结构必须是：
{
  "outline": {"title":"","slides":[{"slide_index":1,"title":"","role":"","key_message":""}]},
  "visual_identity": {...符合 visual_identity.json...},
  "visual_storyboard": {...符合 visual_storyboard.json...},
  "slide_image_specs": {...符合 slide_image_specs.json...}
}

要求：
- slides 数量必须等于 ${run.pageCount}。
- 硬性结构：第 1 页 role 必须是 cover；第 ${run.pageCount} 页 role 必须是 ending；第 2 到第 ${Math.max(2, run.pageCount - 1)} 页必须是内容页，只能使用 problem / insight / solution / architecture / feature / scenario / data / roadmap，不允许使用 cover 或 ending。
- outline、visual_storyboard、slide_image_specs 三处的 slide_index 和 role 必须完全一致。
- 每页必须是完整 PPT 页面，而不是单独插画。
- title 字段必须是纯标题，不要带页码、序号、"01"、"第 1 页"、"1." 这类数字前缀。
- 不要把页码做成左上角或标题旁的大号数字装饰；如需页码，只能作为统一页脚或角落里的很小辅助信息。
- 所有重要文字、图表和装饰必须在画面安全区内，距离四边至少 6%，不要贴边，不要被裁切。
- 封面和结尾必须 low；普通正文使用 medium；资料丰富、数据或综述页允许 high，但必须分区清楚、层级明确。
- 不能编造资料中没有的数字、日期、人物、荣誉和结论。资料不足时宁可减少事实，也不能猜测。
- 每页内容必须服务于明确结论，避免只有大标题、几个空泛卡片和大量无意义留白。
- 使用配色参考图时只吸收色彩职责和气质，不照抄参考图的版式和内容。
- 必须体现组图连续性和风格统一。`;
}

async function planRun(run) {
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "planning", startedAt: run.startedAt || new Date(), error: null }
  });
  const evidence = await db.deckGenerationEvidence.findMany({
    where: { runId: run.id },
    include: { source: { select: { originalName: true } } },
    orderBy: { createdAt: "asc" },
    take: 180
  });
  const sourceContext = evidence.map(item =>
    `[${item.source.originalName} / ${item.locator}]\n${item.content.slice(0, 1200)}`
  ).join("\n\n").slice(0, 140_000);
  const plan = normalizePlan(await openAiJson(planPrompt(run, sourceContext)), run);
  await persistDeckPlan(run, plan);
}

function safeJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function createPdf(run) {
  const slides = await db.deckGenerationSlide.findMany({
    where: { runId: run.id },
    orderBy: { slideIndex: "asc" }
  });
  if (!slides.length || slides.some(slide => !slide.storedName || slide.status !== "completed")) {
    throw new Error("还有页面没有生成完成，暂时不能生成 PDF");
  }
  const images = [];
  for (const slide of slides) {
    const file = await readFile(path.join(imageRoot, path.basename(slide.storedName)));
    const jpeg = await sharp(file)
      .resize(1920, 1080, { fit: "contain", background: "#061525" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    images.push(jpeg);
  }
  const pdf = makeImagePdf(images, 960, 540);
  const storedName = nowName("pdf");
  await writeFile(path.join(documentRoot, storedName), pdf);
  return { storedName, coverStoredName: slides[0].storedName };
}

async function completePdf(run) {
  const pdf = await createPdf(run);
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: "pdf_ready",
      pdfStoredName: pdf.storedName,
      coverStoredName: pdf.coverStoredName,
      pdfGeneratedAt: new Date(),
      error: null
    }
  });
}

async function ensurePdf(run) {
  if (run.pdfStoredName) return run.pdfStoredName;
  const pdf = await createPdf(run);
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      pdfStoredName: pdf.storedName,
      coverStoredName: pdf.coverStoredName,
      pdfGeneratedAt: new Date()
    }
  });
  return pdf.storedName;
}

function pdfString(value) {
  return Buffer.from(value, "binary");
}

function makeObject(id, body) {
  return { id, body: Buffer.isBuffer(body) ? body : pdfString(String(body)) };
}

function streamObject(id, dict, stream) {
  return makeObject(id, Buffer.concat([
    pdfString(`${dict}\nstream\n`),
    stream,
    pdfString("\nendstream")
  ]));
}

function makeImagePdf(images, width, height) {
  const objects = [];
  const catalogId = 1;
  const pagesId = 2;
  let nextId = 3;
  const pageIds = [];

  for (const image of images) {
    const pageId = nextId++;
    const imageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    objects.push(streamObject(imageId, `<< /Type /XObject /Subtype /Image /Width 1920 /Height 1080 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>`, image));
    const content = Buffer.from(`q\n${width} 0 0 ${height} 0 0 cm\n/Im${imageId} Do\nQ\n`, "binary");
    objects.push(streamObject(contentId, `<< /Length ${content.length} >>`, content));
    objects.push(makeObject(pageId, `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /XObject << /Im${imageId} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`));
  }

  objects.push(makeObject(catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`));
  objects.push(makeObject(pagesId, `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`));
  objects.sort((a, b) => a.id - b.id);

  const chunks = [pdfString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
  const offsets = [0];
  for (const object of objects) {
    offsets[object.id] = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    chunks.push(pdfString(`${object.id} 0 obj\n`), object.body, pdfString("\nendobj\n"));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const maxId = Math.max(...objects.map(object => object.id));
  chunks.push(pdfString(`xref\n0 ${maxId + 1}\n0000000000 65535 f \n`));
  for (let id = 1; id <= maxId; id += 1) {
    chunks.push(pdfString(`${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`));
  }
  chunks.push(pdfString(`trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

async function readCodiaJson(response, fallback) {
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok || result.code) {
    const message = result?.message || fallback;
    const status = Number(response.status || 0);
    const providerCode = String(result?.code || "");
    const detail = `${providerCode} ${message}`.toLowerCase();
    if ([402, 403].includes(status) || /insufficient|balance|quota|credit|payment|余额|额度/.test(detail)) {
      throw new Error(`Codia 返回 HTTP ${status || providerCode || "未知"}：账户额度不足，或当前 API Key/套餐无权执行 PDF 转 PPT。充值或修复权限后，可直接点击“重试生成 PPT”；预览图和 PDF 不会丢失。`);
    }
    throw new Error(`Codia API 返回 HTTP ${status || providerCode || "未知"}：${message}`);
  }
  return result;
}

async function codiaUploadPdf(pdfBuffer, fileName) {
  const { key } = codiaConfig();
  const request = codiaRequest;
  const multipart = multipartFileBody("file", fileName, "application/pdf", pdfBuffer);
  const response = await request(`${codiaBaseUrl}/v2/open/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
    },
    body: multipart.body
  }, 120000);
  const result = await readCodiaJson(response, "Codia PDF 上传失败");
  const uploadId = result?.data?.upload_id;
  if (!uploadId) throw new Error("Codia 上传成功但没有返回 upload_id");
  return { uploadId, response: result };
}

function multipartFileBody(fieldName, fileName, contentType, content) {
  const boundary = `----wzlcf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeFileName = String(fileName || "file.pdf").replace(/["\r\n]/g, "_");
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${safeFileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([head, content, tail]) };
}

async function codiaCreatePdfToPptTask(run, uploadId) {
  const { key } = codiaConfig();
  const pageCount = Number(run.pageCount);
  const pageNumbers = Number.isInteger(pageCount) && pageCount > 0
    ? Array.from({ length: pageCount }, (_, index) => index)
    : null;
  const request = codiaRequest;
  const response = await request(`${codiaBaseUrl}/v2/open/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Idempotency-Key": `deck-pdf-to-ppt-${run.id}-${new Date(run.updatedAt).getTime()}`
    },
    body: JSON.stringify({
      operation: "pdf_to_ppt",
      input: {
        upload_id: uploadId,
        ...(pageNumbers ? { page_no: pageNumbers } : {}),
        title: run.projectName
      }
    })
  }, 120000);
  const result = await readCodiaJson(response, "Codia PDF 转 PPT 任务创建失败");
  const taskId = result?.data?.task_id;
  if (!taskId) throw new Error("Codia 任务创建成功但没有返回 task_id");
  return { taskId, response: result };
}

async function codiaGetTask(taskId) {
  const { key } = codiaConfig();
  const request = codiaRequest;
  const response = await request(`${codiaBaseUrl}/v2/open/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` }
  }, 45000);
  return readCodiaJson(response, "Codia 任务状态读取失败");
}

async function downloadCodiaPpt(pptUrl) {
  const request = codiaRequest;
  const response = await request(pptUrl, {}, 180000);
  if (!response.ok) throw new Error(`Codia PPTX 下载失败：HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

async function processPptRun(run) {
  if (!run.codiaTaskId) {
    const pdfName = await ensurePdf(run);
    const pdfBuffer = await readFile(path.join(documentRoot, path.basename(pdfName)));
    const upload = await codiaUploadPdf(pdfBuffer, `${run.projectName || "deck"}.pdf`);
    const task = await codiaCreatePdfToPptTask(run, upload.uploadId);
    await db.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "ppt_processing",
        codiaTaskId: task.taskId,
        codiaResponseJson: JSON.stringify({ upload: upload.response, task: task.response }),
        error: null
      }
    });
    return;
  }

  const result = await codiaGetTask(run.codiaTaskId);
  const task = result?.data || {};
  if (["pending", "processing"].includes(task.status)) {
    await db.deckGenerationRun.update({
      where: { id: run.id },
      data: { codiaResponseJson: JSON.stringify(result), error: null }
    });
    return;
  }
  if (task.status === "failed" || task.status === "canceled") {
    throw new Error(task.error || `Codia PDF 转 PPT 任务${task.status === "canceled" ? "已取消" : "失败"}`);
  }
  if (task.status !== "succeeded") {
    throw new Error(`Codia 返回了未知任务状态：${task.status || "empty"}`);
  }
  const pptUrl = task.result?.ppt_url;
  if (!pptUrl) throw new Error("Codia 任务成功但没有返回 result.ppt_url");
  const ppt = await downloadCodiaPpt(pptUrl);
  const storedName = nowName("pptx");
  await writeFile(path.join(documentRoot, storedName), ppt);
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: "ppt_ready",
      pptStoredName: storedName,
      pptGeneratedAt: new Date(),
      codiaResponseJson: JSON.stringify(result),
      error: null
    }
  });
}


function buildStyleFingerprint(run, plan) {
  const identity = plan.visual_identity && typeof plan.visual_identity === "object" ? plan.visual_identity : {};
  return {
    version: "wzlcf-style-contract-v1",
    project: run.projectName,
    template: {
      id: run.paletteMode === "reference" ? "reference-palette-layout-only" : run.stylePack,
      version: "built-in-v1",
      layout_language: advancedLayoutName(run.stylePack),
      palette_source: run.paletteMode === "reference" ? "uploaded-reference-image" : "built-in-style-pack"
    },
    style_pack: runStyleDirection(run),
    palette_contract: safeJson(run.paletteContractJson, {}),
    unity_options: safeJson(run.unityOptionsJson, {}),
    palette: identity.palette || identity.colors || {},
    typography: identity.typography || identity.type_system || {},
    background: identity.background || identity.background_system || {},
    header_footer: identity.header_footer || identity.headerFooter || {},
    cards_and_shapes: identity.card_system || identity.cards || identity.geometry || {},
    motifs: normalizeArray(identity.motifs || identity.decorative_elements).filter(item => !/图标|icon/i.test(String(item))),
    image_language: identity.image_language || identity.imagery || {},
    spacing_and_grid: identity.spacing || identity.grid || {},
    locked_system: {
      rule: "所有页面必须共享同一配色职责、字体层级、页眉页脚位置、安全边距、网格、图片处理和几何语言；单页导演不得覆盖这些字段。",
      ...(run.paletteMode === "reference" ? {
        palette_enforcement: "只允许 palette_contract 中列出的颜色承担页面背景、文字、线条、几何和强调职责。不得从版式包、内容证据或模型偏好新增金、黄、橙、红、绿、紫等未列颜色。"
      } : {}),
      generic_icon_default: "zero for serious reports and competitions",
      equal_weight_card_grid_default: "forbidden unless page semantics require peer-level modules"
    },
    full_visual_identity: run.generationMode === "advanced" ? undefined : identity
  };
}

function validHexColor(value, fallback) {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function collectHexColors(value, colors = []) {
  if (typeof value === "string") {
    for (const match of value.match(/#[0-9a-f]{6}/gi) || []) if (!colors.includes(match)) colors.push(match);
  } else if (Array.isArray(value)) {
    value.forEach(item => collectHexColors(item, colors));
  } else if (value && typeof value === "object") {
    Object.values(value).forEach(item => collectHexColors(item, colors));
  }
  return colors;
}

async function createDeckStyleStrip(fingerprint) {
  const palette = fingerprint.palette_contract && typeof fingerprint.palette_contract === "object" ? fingerprint.palette_contract : {};
  const paletteList = collectHexColors([palette, fingerprint.palette, fingerprint.full_visual_identity]).slice(0, 8);
  const background = validHexColor(palette.background, paletteList[0] || "#F4F5F6");
  const surface = validHexColor(palette.surface, paletteList[1] || "#FFFFFF");
  const primaryText = validHexColor(palette.primary_text, paletteList[2] || "#15191E");
  const accent = validHexColor(palette.accent, paletteList[3] || "#2D6B5F");
  const accentSecondary = validHexColor(palette.accent_secondary, paletteList[4] || "#B98A45");
  const svg = Buffer.from(`<svg width="1600" height="360" xmlns="http://www.w3.org/2000/svg">
    <rect width="1600" height="360" fill="${background}"/>
    <rect x="80" y="38" width="1440" height="10" rx="5" fill="${accent}"/>
    <rect x="80" y="72" width="470" height="30" rx="4" fill="${primaryText}" opacity="0.94"/>
    <rect x="80" y="126" width="860" height="170" rx="8" fill="${surface}" stroke="${accent}" stroke-width="3"/>
    <rect x="980" y="126" width="540" height="170" rx="8" fill="${surface}" stroke="${accentSecondary}" stroke-width="3"/>
    <rect x="112" y="156" width="610" height="18" rx="3" fill="${primaryText}" opacity="0.88"/>
    <rect x="112" y="194" width="740" height="10" rx="3" fill="${primaryText}" opacity="0.38"/>
    <rect x="112" y="220" width="670" height="10" rx="3" fill="${primaryText}" opacity="0.25"/>
    <rect x="1016" y="158" width="190" height="104" rx="6" fill="${accent}" opacity="0.2"/>
    <rect x="1232" y="158" width="252" height="18" rx="3" fill="${primaryText}" opacity="0.72"/>
    <rect x="1232" y="194" width="220" height="10" rx="3" fill="${primaryText}" opacity="0.32"/>
    <rect x="80" y="324" width="1440" height="3" fill="${accentSecondary}" opacity="0.7"/>
  </svg>`);
  const buffer = await sharp(svg).png().toBuffer();
  const storedName = nowName("png");
  await writeFile(visualEvidenceFilePath(storedName), buffer);
  return storedName;
}

function pageRenderContract(run, slide, planSlide, pagePlan, fingerprint, allSlides) {
  const blocks = pagePlan ? jsonArray(pagePlan.blocksJson) : [];
  const exactBlocks = blocks.filter(block => (block.constraintMode || block.constraint_mode) === "exact");
  const requiredVisibleText = audienceMustInclude([
    ...normalizeArray(planSlide.must_include).map(String),
    ...(pagePlan ? jsonArray(pagePlan.mustIncludeJson).map(String) : [])
  ], slide.title);
  const exactText = Array.from(new Set([
    slide.title,
    ...requiredVisibleText,
    ...exactBlocks.flatMap(block => [block.subtitle, block.content || block.instruction]).filter(Boolean).map(String)
  ].map(item => String(item || "").trim()).filter(Boolean))).slice(0, 60);
  const previous = allSlides.find(item => item.slide_index === slide.slideIndex - 1) || null;
  const next = allSlides.find(item => item.slide_index === slide.slideIndex + 1) || null;
  const density = String(planSlide.text_density || "medium");
  const endingSlide = slide.role === "ending";
  const visibleTextBudget = endingSlide
    ? { max_body_characters: 70, max_supporting_blocks: 1 }
    : density === "low"
    ? { max_body_characters: 90, max_supporting_blocks: 2 }
    : density === "high"
      ? { max_body_characters: 320, max_supporting_blocks: 6 }
      : { max_body_characters: 220, max_supporting_blocks: 4 };
  const palette = fingerprint.palette_contract && typeof fingerprint.palette_contract === "object" ? fingerprint.palette_contract : {};
  const allowedPalette = collectHexColors(palette).slice(0, 10);
  const rawDirectorContract = planSlide.director_contract && typeof planSlide.director_contract === "object"
    ? planSlide.director_contract
    : (pagePlan ? safeJson(pagePlan.directorContractJson, {}) : {});
  const directorContract = run.generationMode === "advanced" && pagePlan
    ? normalizeDirectorContract(rawDirectorContract, pagePlan)
    : rawDirectorContract;
  const visualEvidence = [];
  const evidenceRenderPolicy = [];
  return {
    version: run.generationMode === "advanced" ? "wzlcf-image2-handoff-v2" : "wzlcf-image2-handoff-v1",
    ownership: {
      content_editor: "gpt-5.6",
      final_slide_renderer: "gpt-image-2",
      quality_supervisor: "gpt-5.6"
    },
    project: {
      name: run.projectName,
      use_case: run.projectType || "presentation",
      slide_index: slide.slideIndex,
      total_slides: allSlides.length,
      role: slide.role
    },
    ...(run.generationMode === "advanced" ? {
      user_priority_requirements: {
        deck_wide: String(run.referenceText || "").slice(0, 6000),
        rule: "这是高优先级制作约束，用于控制强调重点、受众、禁用表达和视觉偏好。除非相同文字也出现在 immutable_content 或 editable_content，否则不得把本字段直接渲染到页面。它不能覆盖事实、真实性、配色和安全边界。"
      }
    } : {}),
    immutable_content: {
      title: slide.title,
      exact_visible_text: exactText,
      facts_and_sources: pagePlan ? jsonArray(pagePlan.evidenceJson) : normalizeArray(planSlide.evidence),
      warnings: pagePlan ? jsonArray(pagePlan.warningsJson) : normalizeArray(planSlide.warnings),
      rule: "不得增加、删除、改写或猜测 exact_visible_text 中的文字、数字、日期与专名。"
    },
    editable_content: {
      purpose: pagePlan?.purpose || "",
      blocks,
      conclusion: pagePlan?.conclusion || "",
      content_summary: planSlide.content_summary || "",
      visible_text_budget: visibleTextBudget,
      rule: "blocks、content_summary 和 facts_and_sources 是事实素材库，不要求逐字全部上屏。exact_visible_text 必须准确出现；polish 与 direction 内容应在不改变数字、日期、专名和事实口径的前提下压缩成受众可读短句，并服从 visible_text_budget。不得渲染制作备注或来源位置。"
    },
    visual_intent: {
      composition: planSlide.composition || "",
      main_visual: planSlide.main_visual || "",
      text_density: planSlide.text_density || "medium",
      white_space: planSlide.white_space || "",
      inherited_elements: normalizeArray(planSlide.inherited_elements),
      changed_elements: normalizeArray(planSlide.changed_elements),
      must_avoid: normalizeArray(planSlide.must_avoid)
    },
    director_contract: directorContract,
    visual_evidence: visualEvidence,
    visual_evidence_render_policy: evidenceRenderPolicy,
    global_style_fingerprint: fingerprint,
    continuity: {
      previous_slide: previous,
      next_slide: next,
      instruction: "只延续全局色彩、字体气质、页眉页脚、背景纹理、卡片与装饰语言；不得复制相邻页内容。"
    },
    visual_reference_policy: {
      palette_reference: run.paletteMode === "reference" ? "实际配色参考图会直接作为 Image2 输入，只学习颜色关系、明暗比例、饱和度和气质，不照抄内容或版式。" : "无上传配色参考图。",
      deck_style_strip: "所有页面使用同一张本地生成的全局风格条带；它只表达配色职责、页眉页脚、网格、线条和几何语言，不含页面内容。",
      page_evidence: "用户资料图片只用于必要的 OCR 和语义理解，不作为 Image2 的页面素材；事实、数字和来源通过文字任务书传递。",
      generated_visuals: run.generationMode === "advanced"
        ? "可以依据 director_contract.main_visual_brief 和 visual_units，在同一次完整页面生成中创建一至多个主题化、象征性或概念性画面，也可以根据已确认数字绘制图表；每个画面必须服务其 supports 内容并遵守 integration_rule，不得冒充真实机构、真实产品、真实人物、真实客户现场或证明材料。"
        : "可以依据 director_contract.main_visual_brief 生成主题化、象征性或概念性视觉，也可以根据已确认数字绘制图表；不得冒充真实机构、真实产品、真实人物、真实客户现场或证明材料。",
      unprotected_area: "完整页面由 Image2 根据文字任务书构图。真实机构名称、Logo、校名招牌、产品型号、证书、合同、报告截图和新闻页面不得由模型虚构。",
      previous_slide: "只有用户点击更贴近上一页时才额外输入上一页成图，只对齐视觉语言。"
    },
    palette_lock: run.paletteMode === "reference" ? {
      mode: "exact-reference-palette",
      allowed_presentation_colors: allowedPalette,
      rule: "页面背景、文字、线条、几何和强调色只能使用 allowed_presentation_colors；证据照片保留自身颜色，但不得从证据中抽取新颜色用于页面系统。禁止任何未列金色、黄色、橙色、红色、绿色或紫色强调。"
    } : { mode: "built-in-style-pack" },
    render_rules: [
      "只生成一张完整 16:9 PPT 页面图片。",
      "标题和重要内容距离四边至少 6%，不得裁切。",
      "不得生成水印、模型签名、随机标志、乱码和资料外文字。",
      "严肃汇报与比赛页面默认不使用通用装饰图标；不得把人物、日期、地点、荣誉、证书、实验、产品或客户证据翻译成卡通图标。",
      "不得默认使用等权卡片阵列；版式必须服从 director_contract 的页面语义任务和主证据层级。",
      ...(run.generationMode === "advanced" ? [
        "visual_weight 决定本页文字与画面的相对比重；visual_units 中的全部画面必须和文字在本次请求的一张完整页面图中共同生成，不存在后续插图步骤。",
        "每个 visual_unit 必须紧邻、贯穿或明确连接它所支撑的文字，并按 relationship 与 integration_rule 形成阅读路径；不得把全部画面集中到固定的底部、右侧或背景图片区。",
        "允许同页出现多个互相关联的画面，但必须保持一个主次清楚的信息层级；不得拼贴无关场景，也不得用画面数量挤压文字可读性。",
        "user_priority_requirements 是制作指令而非可见文案；必须落实其视觉偏好，但不得直接把该字段文字画到页面上。"
      ] : []),
      "不得生成假产品、假人物、假现场、假实验、假合同、假证书、假奖项、假界面、假新闻或假客户证明。",
      "用户资料中的图片不得作为页面裁片或背景复用。概念视觉必须服从 main_visual_brief，并与事实文字明确区分。",
      "不得生成可读的机构招牌、校名、Logo、产品铭牌、证书、合同、报告截图或客户证明；未提供真实图片时只能做象征性表达，不能伪装成纪实照片。",
      endingSlide
        ? "本页是整份 PPT 的结尾：必须封面级强视觉、重情绪、少文字。除 immutable_content 中明确逐字锁定的内容外，只呈现一句收束性结论和最多一条短支撑语；禁止把路线、指标、证据、行动清单或正文段落堆入结尾页。"
        : "封面少文字、强视觉；正文页必须有清楚的信息层级。",
      `正文可见文字服从预算：最多约 ${visibleTextBudget.max_body_characters} 个中文字符、${visibleTextBudget.max_supporting_blocks} 个辅助内容区；先压缩 polish/direction 内容，不得缩成难读小字。`,
      ...(run.paletteMode === "reference" ? [`参考图色板为硬约束：页面系统只允许 ${allowedPalette.join(", ")}。未列颜色不得用于标题、数字、线条、卡片或装饰，尤其不得自行添加金色、黄色、橙色或紫色。`] : []),
      `页码只能是统一页脚或角落的小号辅助信息，若出现必须准确写成 ${slide.slideIndex}/${allSlides.length}，不能成为标题旁的大号装饰。`,
      "只能渲染 immutable_content 和 editable_content 中提供的受众可见内容；不得把 JSON 字段名、证据文件名、来源位置、页面角色、内部说明或“资料中的明确证据/现场照片/待匹配资料”等制作备注画到页面上。",
      "除非 exact_visible_text 明确要求，不得自行添加 1)、2)、5)、6) 等步骤编号、页面内序号或重复标题；页码只能使用规定的小号 n/N 格式。"
    ]
  };
}

async function persistDeckPlanWithContracts(run, plan, expectedUpdatedAt = null) {
  if (run.generationMode !== "advanced") {
    return persistDeckPlan(run, plan);
  }
  const slides = normalizeArray(plan.slide_image_specs?.slides);
  const pagePlans = run.generationMode === "advanced"
    ? await db.deckGenerationPagePlan.findMany({ where: { runId: run.id }, orderBy: { pageIndex: "asc" } })
    : [];
  const fingerprint = buildStyleFingerprint(run, plan);
  const styleStripStoredName = await createDeckStyleStrip(fingerprint);
  const slideData = slides.map(slide => {
      const pagePlan = pagePlans.find(page => page.pageIndex === slide.slide_index) || null;
      const shell = {
        id: "",
        slideIndex: slide.slide_index,
        title: slide.title,
        role: slide.role
      };
      const contract = pageRenderContract(run, shell, slide, pagePlan, fingerprint, slides);
      return {
        runId: run.id,
        slideIndex: slide.slide_index,
        title: slide.title,
        role: slide.role,
        specJson: JSON.stringify(slide),
        renderContractJson: JSON.stringify(contract),
        status: "waiting",
        qualityStatus: "not_applicable",
        qualityReportJson: "{}",
        qualityAttempts: 0
      };
    });
  await db.$transaction(async tx => {
    const claimed = await tx.deckGenerationRun.updateMany({
      where: {
        id: run.id,
        status: "matching",
        ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {})
      },
      data: {
        status: "plan_ready",
        pageCount: slides.length,
        outlineJson: JSON.stringify(plan.outline),
        visualIdentityJson: JSON.stringify(plan.visual_identity),
        visualStoryboardJson: JSON.stringify(plan.visual_storyboard),
        slideImageSpecsJson: JSON.stringify(plan.slide_image_specs),
        styleFingerprintJson: JSON.stringify(fingerprint),
        styleStripStoredName,
        deckQualityStatus: "pending",
        deckQualityReportJson: "{}",
        deckQualityAttempts: 0,
        planReadyAt: new Date(),
        finishedAt: null,
        error: null
      }
    });
    if (!claimed.count) return;
    for (const slide of slides) {
      const pagePlan = pagePlans.find(page => page.pageIndex === slide.slide_index);
      if (!pagePlan) continue;
      await tx.deckGenerationPagePlan.update({
        where: { id: pagePlan.id },
        data: { directorContractJson: JSON.stringify(slide.director_contract || {}) }
      });
    }
    await tx.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
    await tx.deckGenerationSlide.createMany({ data: slideData });
  });
}

async function openAiVisionBuffersJson(rawImages, instruction, options = {}) {
  const resized = await Promise.all(rawImages.map((raw, index) => sharp(raw)
    .resize(index === 0 ? 2200 : 1600, index === 0 ? 2200 : 1600, { fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer()));
  const content = [
    { type: "input_text", text: instruction },
    ...resized.map(image => ({ type: "input_image", image_url: "data:image/png;base64," + image.toString("base64") }))
  ];
  const input = [{ role: "user", content }];
  let text = await openAiInput(input, { ...options, json: true });
  try {
    return jsonFromText(text);
  } catch {
    text = await openAiInput([{
      role: "user",
      content: [
        { type: "input_text", text: instruction + "\n你上一次没有返回合法 JSON。现在只返回一个 JSON object，不要 Markdown，不要解释。" },
        ...resized.map(image => ({ type: "input_image", image_url: "data:image/png;base64," + image.toString("base64") }))
      ]
    }], { ...options, json: true });
    return jsonFromText(text);
  }
}

async function openAiVisionBufferJson(raw, instruction, options = {}) {
  return openAiVisionBuffersJson([raw], instruction, options);
}

function slidePrompt(run, slide, instruction = "") {
  const identity = safeJson(run.visualIdentityJson, {});
  const storyboard = safeJson(run.visualStoryboardJson, {});
  const allSpecs = safeJson(run.slideImageSpecsJson, {});
  const spec = safeJson(slide.specJson, {});
  const previous = allSpecs.slides?.find(item => item.slide_index === slide.slideIndex - 1) || null;
  const next = allSpecs.slides?.find(item => item.slide_index === slide.slideIndex + 1) || null;
  const finalSlideRule = run.generationMode === "advanced" && slide.role === "ending"
    ? "- This is the advanced-mode final slide: make it a cover-level, emotionally conclusive close. Keep it sparse: one memorable closing statement and at most one short support line unless the slide explicitly locks exact text. Use one dominant symbolic thematic visual with generous whitespace. Never turn it into a roadmap, metric, evidence, card, chart, process, or body-content page."
    : "- If this is the final slide or Role is ending, it must be a minimal emotional closing page like a cover: sparse content, strong closure, strong memory point, one headline-level takeaway, optional short subtitle, and no dense cards, charts, feature lists, process diagrams, or new arguments.";
  return `Create one complete, premium 16:9 PPT slide image.

Project: ${run.projectName}
Use case: ${run.projectType || "presentation"}
Style pack: ${stylePackName(run.stylePack)}
Slide ${slide.slideIndex}/${run.pageCount}: ${slide.title}
Role: ${slide.role}

Visual identity for the whole deck:
${JSON.stringify(identity)}

Storyboard for continuity:
${JSON.stringify(storyboard)}

Current slide spec:
${JSON.stringify(spec)}

Previous slide summary:
${previous ? JSON.stringify(previous) : "start"}

Next slide summary:
${next ? JSON.stringify(next) : "end"}

Regeneration instruction:
${instruction || slide.lastInstruction || "none"}

Hard requirements:
- Output a full 16:9 PPT page, not a poster, not an isolated illustration.
- The page must look like a real polished presentation slide with layout, title area, content hierarchy, refined background, and controlled whitespace.
- Keep style consistent with the visual identity, including palette, card system, motifs, header/footer feel, and typography feel.
- Keep continuity with the previous and next slide while still making this page visually distinct.
- The visible slide title must not include page numbers or numeric prefixes. Do not render "05", "Page 5", "第5页", "5.", or similar large number badges beside the title.
- If a page number is needed, make it a tiny consistent footer or corner detail only, never the main title element.
- Keep every important title, chart, icon, and bottom banner inside a safe area at least 6% away from all edges. Nothing important may touch or be cut off by the canvas edge.
- If the regeneration instruction says closer to the previous slide, only align header/footer, palette, background texture, card chrome, and decorative rhythm; never copy the previous slide's content, main visual, chart data, or full layout.
${finalSlideRule}
- Avoid gibberish blocks, watermarks, model signatures, random logos, copyrighted marks, and unrelated characters.
- Use concise designed text only when needed. Prefer clean information blocks over long paragraphs.
- No browser UI, no chat UI, no screenshot frame unless the slide spec explicitly asks for it.`;
}

async function generateSlide(run, slide, instruction = "") {
  const effectiveInstruction = instruction || slide.lastInstruction || "";
  await db.deckGenerationSlide.update({
    where: { id: slide.id },
    data: { status: "generating", error: null, lastInstruction: effectiveInstruction }
  });
  const prompt = slidePrompt(run, slide, effectiveInstruction);
  const raw = await openAiImage(prompt);
  const normalized = await sharp(raw)
    .resize(1920, 1080, { fit: "contain", background: "#061525" })
    .png()
    .toBuffer();
  const storedName = nowName("png");
  await writeFile(path.join(imageRoot, storedName), normalized);
  await db.deckGenerationSlide.update({
    where: { id: slide.id },
    data: {
      status: "completed",
      prompt,
      storedName,
      error: null,
      regenerationCount: effectiveInstruction ? { increment: 1 } : slide.regenerationCount
    }
  });
  if (slide.slideIndex === 1) {
    await db.deckGenerationRun.update({ where: { id: run.id }, data: { coverStoredName: storedName } });
  }
}

async function processGeneratingRun(run) {
  const slides = await db.deckGenerationSlide.findMany({
    where: { runId: run.id },
    orderBy: { slideIndex: "asc" }
  });
  const activeCount = slides.filter(slide => slide.status === "generating").length;
  const slots = Math.max(0, deckGenerationConcurrency - activeCount);
  const queued = slides.filter(slide => ["waiting", "queued"].includes(slide.status)).slice(0, slots);
  if (!queued.length) {
    if (slides.length && slides.every(slide => ["completed", "failed"].includes(slide.status))) {
      await db.deckGenerationRun.update({ where: { id: run.id }, data: { status: "review_ready", finishedAt: new Date(), error: null } });
    }
    return;
  }
  await Promise.all(queued.map(slide => generateSlide(run, slide).catch(async error => {
    await db.deckGenerationSlide.update({
      where: { id: slide.id },
      data: { status: "failed", error: error instanceof Error ? error.message : String(error) }
    });
  })));
}

async function advancedVisualReferences(run, slide, instruction) {
  const references = [];
  if (run.paletteMode === "reference") {
    const theme = await db.deckGenerationSource.findFirst({
      where: { runId: run.id, kind: "theme", status: "completed" },
      orderBy: { createdAt: "desc" }
    });
    if (!theme) throw new Error("高级版选择了参考图配色，但没有可交给 Image2 的有效配色参考图。请返回修改任务资料并重新上传。");
    references.push({
      buffer: await readFile(sourceFilePath(theme)),
      mime: imageMimeType(theme.originalName || theme.storedName),
      name: theme.originalName || "palette-reference.png",
      storedName: theme.storedName,
      role: "palette reference; learn colors, contrast, saturation and visual mood only"
    });
  }

  if (run.styleStripStoredName) {
    references.push({
      buffer: await readFile(visualEvidenceFilePath(run.styleStripStoredName)),
      mime: "image/png",
      name: "deck-style-strip.png",
      storedName: run.styleStripStoredName,
      role: "deck-wide style strip; keep its palette roles, header/footer rhythm, grid, line weight and geometry consistent on every page"
    });
  }

  const contract = safeJson(slide.renderContractJson, {});
  const primaryEvidenceId = String(contract?.director_contract?.primary_evidence_id || "");
  const secondaryEvidenceIds = normalizeArray(contract?.director_contract?.secondary_evidence_ids).map(String);
  const coverageByEvidenceId = new Map(normalizeArray(contract?.director_contract?.evidence_coverage)
    .map(item => [String(item?.evidence_id || ""), String(item?.label || "")]));
  const contractEvidenceById = new Map(normalizeArray(contract.visual_evidence)
    .map(item => [String(item?.id || ""), item]));
  const evidenceRenderPolicy = new Map(normalizeArray(contract.visual_evidence_render_policy)
    .map(item => [String(item?.evidence_id || ""), String(item?.mode || "pixel-lock")]));
  const evidenceCapacity = evidenceCapacityForArchetype(contract?.director_contract?.page_archetype);
  const visualEvidenceIds = normalizeArray(contract.visual_evidence).map(item => String(item?.id || "")).filter(Boolean);
  const evidenceIds = advancedSourceVisualReuseEnabled ? Array.from(new Set([
    primaryEvidenceId,
    ...secondaryEvidenceIds,
    ...visualEvidenceIds
  ].filter(Boolean))).slice(0, evidenceCapacity) : [];
  if (evidenceIds.length) {
    const evidence = await db.deckGenerationVisualEvidence.findMany({
      where: { id: { in: evidenceIds }, runId: run.id },
      include: { source: { select: { originalName: true } } }
    });
    const byId = new Map(evidence.map(item => [item.id, item]));
    for (const evidenceId of evidenceIds) {
      const item = byId.get(evidenceId);
      if (!item) continue;
      const tags = jsonArray(item.tagsJson);
      const renderMode = evidenceRenderPolicy.get(item.id) || evidenceRenderMode(contract?.director_contract?.page_archetype, item);
      references.push({
        buffer: await readFile(visualEvidenceFilePath(item.storedName)),
        mime: item.mimeType || "image/png",
        name: `${item.id === primaryEvidenceId ? "primary" : "secondary"}-authentic-evidence-${item.locator || references.length + 1}.png`,
        storedName: item.storedName,
        evidenceId: item.id,
        kind: item.kind,
        locator: item.locator,
        sourceName: item.source.originalName,
        width: item.width,
        height: item.height,
        description: item.description,
        facts: normalizeArray(contractEvidenceById.get(item.id)?.facts),
        tags,
        focusBox: sourceFocusBoxFromTags(tags),
        focusFallback: sourceFocusUsesFallback(tags),
        focusMethod: sourceFocusMethodFromTags(tags),
        renderMode,
        pixelLockRequired: renderMode === "pixel-lock",
        coverageLabel: coverageByEvidenceId.get(item.id) || "",
        cropIntent: coverageByEvidenceId.get(item.id) === "真实应用"
          ? "real-world"
          : /知识产权|检测|合作/.test(coverageByEvidenceId.get(item.id) || "")
            ? "direct-proof"
            : item.kind,
        role: renderMode === "pixel-lock"
          ? `${item.id === primaryEvidenceId ? "PRIMARY" : "secondary"} authentic page evidence from the user's source material (${item.locator || "source location recorded"}); preserve its exact identity and meaning, crop only for legibility, never recreate or fabricate it`
          : `${item.id === primaryEvidenceId ? "PRIMARY" : "secondary"} authentic page evidence used as grounded data source (${item.locator || "source location recorded"}); its confirmed facts may be redrawn as a clean chart or roadmap, but its source-slide composition and decorative imagery must not be copied`
      });
    }
  }

  if (advancedSourceVisualReuseEnabled && instruction && slide.storedName && !protectedEvidenceMasksEnabled) {
    references.push({
      buffer: await readFile(path.join(imageRoot, path.basename(slide.storedName))),
      mime: "image/png",
      name: `current-slide-${slide.slideIndex}-draft.png`,
      storedName: slide.storedName,
      role: "current slide draft for layout continuity only; do not trust any image, diagram, chart, icon, or claim inside it as evidence; obey the correction instruction and replace every called-out area with the attached authentic evidence"
    });
  }

  if (/更贴近上一页|closer to the previous slide/i.test(instruction) && slide.slideIndex > 1) {
    const previous = await db.deckGenerationSlide.findFirst({
      where: { runId: run.id, slideIndex: slide.slideIndex - 1, status: "completed", storedName: { not: null } }
    });
    if (previous?.storedName) {
      references.push({
        buffer: await readFile(path.join(imageRoot, path.basename(previous.storedName))),
        mime: "image/png",
        name: `previous-slide-${slide.slideIndex - 1}.png`,
        storedName: previous.storedName,
        role: "previous accepted slide; align visual language only, never copy its content or complete layout"
      });
    }
  }

  return Array.from(new Map(references.map(reference => [reference.storedName, reference])).values());
}

function advancedSlidePrompt(run, slide, contract, instruction, references = [], options = {}) {
  const pixelLockedReferences = references.filter(reference => /authentic page evidence/i.test(reference.role) && reference.pixelLockRequired !== false);
  const groundedRedrawReferences = references.filter(reference => reference.renderMode === "grounded-redraw");
  const styleGuideReferences = references.filter(reference => /palette reference|deck-wide style strip/i.test(reference.role));
  const referenceRoles = options.protectedEvidence
    ? [
      "1. protected evidence canvas: its locked areas already contain exact source evidence; do not cover, redraw, recolor, recreate, or replace them.",
      ...(styleGuideReferences.length ? [`The top safety strip of image 1 temporarily embeds these visual guides: ${styleGuideReferences.map(reference => reference.role).join("; ")}. Learn only their palette, contrast, grid, line weight and geometry. Do not render or copy that strip; it will be removed after generation.`] : []),
      ...pixelLockedReferences.map(reference => `Embedded pixel-locked evidence: ${reference.role}`),
      ...groundedRedrawReferences.map(reference => `QA-only grounded-redraw source, not uploaded to Image2 as a separate image: ${reference.role}. Rebuild only from confirmed facts already present in the JSON contract.`)
    ].join("\n")
    : references.length
      ? references.map((reference, index) => `${index + 1}. ${reference.role}`).join("\n")
      : "No image references supplied; follow the JSON style contract.";
  const evidenceWallRule = String(contract?.director_contract?.page_archetype || "").toLowerCase() === "evidence-wall"
    ? "- This is an evidence wall. The complete evidence-wall body zone is already locked and final. Render only a clean title/subtitle above it and at most one concise conclusion/footer below it. Do not create cards, labels, icons, connectors, text, or decoration behind, between, beside, or over the locked evidence body."
    : "";
  const paletteRule = run.generationMode === "advanced" && run.paletteMode === "reference"
    ? "- Palette lock is exact. Use only palette_lock.allowed_presentation_colors for presentation backgrounds, text, lines, geometry, and accents. Evidence photos may retain their own colors, but never borrow gold, yellow, orange, red, green, purple, or any other unlisted color for slide chrome or emphasis."
    : "- Follow the global style fingerprint palette.";
  const roleRule = slide.role === "ending"
    ? "- This is the final slide: make it a cover-level, emotionally conclusive close. Keep it sparse: one memorable closing statement and at most one short support line unless immutable exact text requires more. Use one dominant symbolic thematic visual with generous whitespace. Never turn it into a roadmap, metric, evidence, card, chart, process, or body-content page."
    : slide.role === "cover"
      ? "- This is the cover: keep it minimal and project-identifying, with one strong thematic hero visual and no body-page information grid. The hero may be symbolic or conceptual, but must not impersonate a real campus, product, customer site, institution sign, or logo."
      : "- This is a body slide: honor the contract's density and proof goal; keep enough substantive evidence to support the conclusion instead of forcing a sparse closing-page treatment.";
  const visualCompositionRules = [
    "- Follow director_contract.visual_weight when balancing visible copy and imagery.",
    "- Generate every director_contract.visual_unit as part of this same complete slide image. There is no later image insertion or second visual-generation pass.",
    "- Bind each visual unit to the copy named in supports, and use relationship plus integration_rule to determine placement. Do not collect all visuals into a fixed bottom, right-side, or background media area.",
    "- Multiple visual units are allowed only when they form one semantic composition with a clear primary-secondary hierarchy. Never create an unrelated stock-image collage or an equal card grid by default.",
    "- Treat user_priority_requirements as high-priority production direction, never as audience-facing copy, factual evidence, or permission to violate palette and authenticity rules."
  ];
  return [
    "Create one complete, premium 16:9 PPT slide image.",
    "",
    "This JSON is the complete handoff contract prepared by GPT-5.6. Follow it exactly. Do not reinterpret source documents and do not invent content:",
    JSON.stringify(contract),
    "",
    "Current regeneration or correction instruction:",
    instruction || "none",
    "",
    "Input image reference roles in upload order:",
    referenceRoles,
    "Palette references and the deck style strip are visual constraints only; never copy their text, facts, logos, people, or complete composition.",
    advancedSourceVisualReuseEnabled
      ? "References marked authentic page evidence are factual source material for this page. Preserve their identity and meaning."
      : "Uploaded content-source images are intentionally not supplied. Build the page from the confirmed text contract and art direction; never pretend a generated scene, document, product, person, campus, or customer site is authentic evidence.",
    options.protectedEvidence
      ? "This request uses a protected evidence mask. The opaque masked areas are immutable object-level original evidence already placed on the page. The temporary guide strip occupies only the top outer safety margin: keep the slide title and every audience-facing element below it. Each evidence rectangle also has a narrow locked low-contrast safety band: keep all text, connectors, panels, and generated decoration outside it. Build the surrounding typography, spacing, geometry, and supporting composition around those fixed pixels; do not add another substitute image of the same evidence. Outside the locked evidence, photographic or photorealistic pixels are forbidden: never generate another product, device, train, ship, port, person, laboratory, factory, customer site, certificate, report, chart, screenshot, or real-world scene. Do not illustrate nouns from the copy. Use only audience-facing typography, flat presentation surfaces, background texture, lines, and neutral geometry. Never draw a second slide frame, title bar, browser window, or large bezel around a locked crop."
      : "No source-evidence mask is used. Follow director_contract.visual_strategy, main_visual_brief, visual_weight, visual_units, and integration_rule as the complete visual brief.",
    "Do not reuse a previous draft as factual input. A manual reroll rebuilds from this confirmed contract; only the explicit closer-previous action may use the previous accepted page for visual-language alignment.",
    "",
    "Hard rendering rules:",
    "- Output only a complete 16:9 presentation slide, never a poster, isolated illustration, browser UI, chat UI, or screenshot frame.",
    "- Render immutable_content.title and every applicable immutable_content.exact_visible_text item accurately and legibly.",
    "- Never invent numbers, dates, names, awards, claims, logos, watermarks, signatures, or unrelated characters.",
    "- Make director_contract.unique_takeaway and director_contract.proof_goal visually clear. Execute director_contract.main_visual_brief with a deliberate focal point, framing, scale and whitespace direction.",
    ...visualCompositionRules,
    "- Generated visuals are communication devices, not proof. Never add readable school or institution signage, logos, product labels, certificates, contracts, reports, dashboards, customer photos, awards, or news coverage that were not explicitly supplied as exact visible text.",
    "- Follow director_contract.icon_policy and card_policy. Generic decorative icons are zero by default; equal-weight card grids are not the default composition.",
    "- Only render user-facing text found inside immutable_content or editable_content. Never render JSON keys, evidence filenames, source locators, role names, prompt instructions, or invented navigation labels.",
    "- Do not repeat the slide title in multiple places unless the contract explicitly requires it.",
    "- If a page number is shown, it must be exactly " + slide.slideIndex + "/" + run.pageCount + " in a small consistent footer or corner position.",
    "- Use the global_style_fingerprint consistently for palette, typography feel, background, header/footer, card chrome, motifs, grid, and image language.",
    "- Keep all important content at least 6% away from every edge.",
    "- Preserve continuity without copying adjacent slide content or full layout.",
    evidenceWallRule,
    "- editable_content is a fact bank, not a command to render every sentence. Preserve exact_visible_text, then compress polish/direction copy to editable_content.visible_text_budget. Never solve overflow by shrinking text below professional presentation size.",
    "- Never render production notes such as 资料中的明确证据, 资料中的现场照片, 待匹配资料, source locators, or internal evidence labels.",
    "- Do not add internal sequence labels such as 1), 2), 5), 6), or repeat the title as a second heading unless exact_visible_text explicitly requires it.",
    paletteRule,
    roleRule,
    "- Project: " + run.projectName + "; slide " + slide.slideIndex + "/" + run.pageCount + "."
  ].join("\n");
}

async function claimImageCall(run, slide, endpoint, referenceCount) {
  let requestKey = String(slide.pendingImageCallKey || "");
  if (!requestKey) {
    const kind = slide.lastInstruction ? "manual" : "initial";
    requestKey = `legacy:${kind}:${slide.id}:${slide.regenerationCount}`;
    await db.deckGenerationImageCall.upsert({
      where: { requestKey },
      create: { requestKey, kind, runId: run.id, slideId: slide.id },
      update: {}
    });
    await db.deckGenerationSlide.update({ where: { id: slide.id }, data: { pendingImageCallKey: requestKey } });
  }
  return db.$transaction(async tx => {
    const call = await tx.deckGenerationImageCall.findUnique({ where: { requestKey } });
    if (!call || call.runId !== run.id || call.slideId !== slide.id) throw new Error("当前页面缺少有效的 Image2 调用记录");
    const claimed = await tx.deckGenerationImageCall.updateMany({
      where: { id: call.id, status: "reserved" },
      data: { status: "requesting", endpoint, referenceCount, startedAt: new Date(), error: null }
    });
    if (!claimed.count) throw new Error("这一次 Image2 调用已经发起，系统不会重复扣费请求");
    await tx.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        imageCallsStarted: { increment: 1 },
        ...(call.kind === "manual" ? { manualImageCalls: { increment: 1 } } : {})
      }
    });
    return call;
  });
}

async function finishImageCall(call, data) {
  await db.$transaction([
    db.deckGenerationImageCall.update({
      where: { id: call.id },
      data: {
        status: data.status,
        endpoint: data.endpoint,
        referenceCount: data.referenceCount,
        transport: data.transport || "none",
        error: data.error || null,
        finishedAt: new Date()
      }
    }),
    ...(data.status === "completed" ? [db.deckGenerationRun.update({
      where: { id: call.runId },
      data: { imageCallsCompleted: { increment: 1 } }
    })] : [])
  ]);
}

async function generateAdvancedSlide(run, slide, instruction = "") {
  const contract = safeJson(slide.renderContractJson, {});
  const initialInstruction = instruction || slide.lastInstruction || "";
  const references = await advancedVisualReferences(run, slide, initialInstruction);
  if (protectedEvidenceMasksEnabled) {
    await ensureProtectedEvidenceFocusBoxes(contract, references);
    const evidenceCapacity = evidenceCapacityForArchetype(contract?.director_contract?.page_archetype);
    const requiredEvidence = references
      .filter(reference => /authentic page evidence/i.test(reference.role) && reference.pixelLockRequired !== false)
      .slice(0, evidenceCapacity);
    const unsafeEvidence = requiredEvidence.filter(reference => reference.protectedEligible === false);
    if (unsafeEvidence.length) {
      const locations = unsafeEvidence.map(reference => reference.locator || reference.sourceName || "未命名证据").join("、");
      throw new Error(`真实视觉证据无法安全裁切（${locations}），本页未调用 Image2。请稍后重试，系统不会把整张来源幻灯片嵌入新页面。`);
    }
  }
  const protectedEvidence = protectedEvidenceMasksEnabled
    ? await protectedEvidenceCanvas(run, slide, contract, references)
    : null;
  const image2References = references.filter(reference => reference.renderMode !== "grounded-redraw");
  const image2ReferenceCount = protectedEvidence ? 1 : image2References.length;
  const endpoint = image2ReferenceCount ? "/images/edits" : "/images/generations";
  const imageCall = await claimImageCall(run, slide, endpoint, image2ReferenceCount);
  let referenceTransport = "none";
  let evidencePixelsRestored = false;
  const finalPrompt = advancedSlidePrompt(run, slide, contract, initialInstruction, references, {
    protectedEvidence
  });
  let finalImage;
  try {
    await db.deckGenerationSlide.update({
      where: { id: slide.id },
      data: { status: "generating", qualityStatus: "not_applicable", error: null, lastInstruction: initialInstruction }
    });
    let raw;
    if (protectedEvidence) {
      const edited = await openAiImageWithReferences(finalPrompt, [{
        buffer: protectedEvidence.input,
        mime: "image/png",
        name: `protected-evidence-slide-${slide.slideIndex}.png`,
        role: "protected evidence canvas"
      }], {
        mask: protectedEvidence.mask,
        transport: protectedEvidence.embeddedStyleGuides
          ? "protected_evidence_mask+embedded_style_guides"
          : "protected_evidence_mask"
      });
      raw = edited.buffer;
      referenceTransport = edited.transport;
    } else if (image2References.length) {
      const edited = await openAiImageWithReferences(finalPrompt, image2References);
      raw = edited.buffer;
      referenceTransport = edited.transport;
    } else {
      raw = await openAiImage(finalPrompt, advancedImageTimeoutMs);
    }
    finalImage = await sharp(raw)
      .resize(1920, 1080, { fit: "contain", background: "#061525" })
      .png()
      .toBuffer();
    if (protectedEvidence) {
      const restored = await restoreProtectedEvidence(
        finalImage,
        protectedEvidence.input,
        protectedEvidence.regions,
        protectedEvidence.postprocess,
        protectedEvidence.embeddedStyleGuides
      );
      finalImage = restored.buffer;
      evidencePixelsRestored = restored.restored;
      referenceTransport = `${referenceTransport}+pixel_lock${restored.styleGuidesCleared ? "+guide_cleanup" : ""}`;
    }
    await finishImageCall(imageCall, { status: "completed", endpoint, referenceCount: image2ReferenceCount, transport: referenceTransport });
  } catch (error) {
    await finishImageCall(imageCall, {
      status: "failed",
      endpoint,
      referenceCount: image2ReferenceCount,
      transport: referenceTransport,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  const renderReport = {
    version: "wzlcf-render-trace-v1",
    render_trace: {
      provider: imageService.serviceName,
      model: imageService.model,
      endpoint,
      reference_transport: referenceTransport,
      reference_count: image2ReferenceCount,
      reference_roles: protectedEvidence
        ? ["protected evidence canvas with embedded style guides and pixel-locked evidence"]
        : image2References.map(reference => reference.role),
      logical_reference_count: references.length,
      logical_reference_roles: references.map(reference => reference.role),
      grounded_redraw_sources_qa_only: references
        .filter(reference => reference.renderMode === "grounded-redraw")
        .map(reference => ({ evidence_id: reference.evidenceId, locator: reference.locator, source_name: reference.sourceName })),
      protected_evidence: protectedEvidence ? {
        enabled: true,
        input_base: protectedEvidence.base,
        evidence_ids: protectedEvidence.evidenceIds,
        embedded_style_guides: protectedEvidence.embeddedStyleGuides ? {
          transport: protectedEvidence.embeddedStyleGuides.transport,
          roles: protectedEvidence.embeddedStyleGuides.roles,
          stored_names: protectedEvidence.embeddedStyleGuides.storedNames,
          removed_after_image2: true
        } : null,
        regions: protectedEvidence.regions.map(region => ({
          type: region.type || "source_evidence",
          evidence_id: region.evidenceId,
          locator: region.locator,
          kind: region.kind,
          coverage_label: region.coverageLabel || "",
          crop_intent: region.cropIntent || region.kind || "context",
          focus_box: region.focusBox,
          focus_method: region.focusMethod,
          focus_fallback: region.focusFallback,
          x: region.x,
          y: region.y,
          w: region.w,
          h: region.h
        })),
        pixels_restored_after_image2: evidencePixelsRestored
      } : { enabled: false },
      image_call_id: imageCall.id,
      automatic_redraws: 0
    }
  };
  const storedName = nowName("png");
  await writeFile(path.join(imageRoot, storedName), finalImage);
  await db.deckGenerationSlide.update({
    where: { id: slide.id },
    data: {
      status: "completed",
      prompt: finalPrompt,
      storedName,
      qualityStatus: "not_applicable",
      qualityReportJson: JSON.stringify(renderReport),
      qualityAttempts: slide.qualityAttempts,
      qualityCheckedAt: null,
      error: null,
      regenerationCount: slide.regenerationCount + (initialInstruction ? 1 : 0),
      pendingImageCallKey: ""
    }
  });
  if (slide.slideIndex === 1) {
    await db.deckGenerationRun.update({ where: { id: run.id }, data: { coverStoredName: storedName } });
  }
}

function xmlText(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function buildDeckContactSheet(slides) {
  const columns = Math.min(4, Math.max(1, slides.length));
  const tileWidth = 480;
  const imageHeight = 270;
  const labelHeight = 34;
  const rows = Math.ceil(slides.length / columns);
  const composites = [];
  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index];
    const raw = await readFile(path.join(imageRoot, path.basename(slide.storedName)));
    const thumb = await sharp(raw).resize(tileWidth, imageHeight, { fit: "cover" }).png().toBuffer();
    const left = (index % columns) * tileWidth;
    const top = Math.floor(index / columns) * (imageHeight + labelHeight);
    const label = Buffer.from(
      '<svg width="' + tileWidth + '" height="' + labelHeight + '" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="100%" height="100%" fill="#11161b"/>' +
      '<text x="14" y="23" fill="#f4efe6" font-family="Arial" font-size="16">Slide ' +
      String(slide.slideIndex).padStart(2, "0") + ' · ' + xmlText(slide.title).slice(0, 54) +
      '</text></svg>'
    );
    composites.push({ input: thumb, left, top });
    composites.push({ input: label, left, top: top + imageHeight });
  }
  return sharp({
    create: {
      width: columns * tileWidth,
      height: rows * (imageHeight + labelHeight),
      channels: 4,
      background: "#11161b"
    }
  }).composite(composites).png().toBuffer();
}

function normalizeDeckAudit(result) {
  const requested = String(result?.status || "").toLowerCase();
  const status = requested === "pass" ? "pass" : requested === "manual_review" ? "manual_review" : "revise";
  return {
    version: "wzlcf-deck-audit-v1",
    status,
    score: Math.max(0, Math.min(100, Number(result?.score || 0))),
    checks: result?.checks && typeof result.checks === "object" ? result.checks : {},
    outlier_slides: normalizeArray(result?.outlier_slides).slice(0, 12).map(item => ({
      slide_index: Number(item?.slide_index || 0),
      severity: ["critical", "high", "medium", "low"].includes(String(item?.severity)) ? String(item.severity) : "medium",
      issues: cleanStringList(item?.issues, 12),
      correction_instruction: String(item?.correction_instruction || "").slice(0, 4000)
    })).filter(item => Number.isInteger(item.slide_index) && item.slide_index > 0),
    summary: String(result?.summary || "").slice(0, 2400),
    checked_at: new Date().toISOString()
  };
}

async function auditDeckConsistency(run, slides) {
  const sheet = await buildDeckContactSheet(slides);
  const summary = slides.map(slide => ({
    slide_index: slide.slideIndex,
    title: slide.title,
    role: slide.role
  }));
  const instruction = [
    "你是 GPT-5.6，只负责一次安静的 PPT 交付安全检查。图片已经生成，不得提出审美返工，也不得要求重新调用 Image2。",
    "页面目录：",
    JSON.stringify(summary),
    "",
    "只寻找会让文件无法交付的致命异常：空白或损坏页面、大面积乱码或正文完全不可读、明显伪造的可识别学校/机构招牌与 logo、伪造证书合同报告或产品标签、与页面标题直接冲突的画面、严重裁切导致核心内容消失。",
    "配色、布局变化、文字多少、普通审美偏差、图标或卡片使用不理想都不属于本检查范围，不要标记。封面与结尾允许明显不同于正文页。",
    "只有确认存在上述致命异常时才返回 manual_review，并只列出 critical 页面；其他情况一律 pass。不要给 Image2 修正指令。",
    "只返回 JSON object：",
    '{"status":"pass|manual_review","score":0,"checks":{"delivery_safety":""},"outlier_slides":[{"slide_index":1,"severity":"critical","issues":[],"correction_instruction":""}],"summary":""}'
  ].join("\n");
  return normalizeDeckAudit(await openAiVisionBufferJson(sheet, instruction, advancedTextOptions()));
}

async function processAdvancedGeneratingRun(run) {
  const slides = await db.deckGenerationSlide.findMany({
    where: { runId: run.id },
    orderBy: { slideIndex: "asc" }
  });
  const legacyAuditOnlySlides = slides.filter(slide => slide.status === "quality_retry" && slide.storedName);
  if (legacyAuditOnlySlides.length) {
    await Promise.all(legacyAuditOnlySlides.map(slide => db.deckGenerationSlide.update({
      where: { id: slide.id },
      data: { status: "completed", qualityStatus: "not_applicable", error: null, pendingImageCallKey: "" }
    })));
    return;
  }
  const activeCount = slides.filter(slide => slide.status === "generating").length;
  const slots = Math.max(0, advancedDeckGenerationConcurrency - activeCount);
  const queued = slides
    .filter(slide => ["waiting", "queued"].includes(slide.status))
    .slice(0, slots);
  if (queued.length) {
    await Promise.all(queued.map(slide => generateAdvancedSlide(run, slide).catch(async error => {
      await db.deckGenerationSlide.update({
        where: { id: slide.id },
        data: {
          status: "failed",
          qualityStatus: "manual_review",
          error: error instanceof Error ? error.message : String(error)
        }
      });
    })));
    return;
  }
  if (!slides.length || !slides.every(slide => ["completed", "failed"].includes(slide.status))) return;

  const failedSlides = slides.filter(slide => slide.status === "failed" || !slide.storedName);
  if (failedSlides.length) {
    const report = {
      version: "wzlcf-deck-audit-v1",
      status: "manual_review",
      score: 0,
      outlier_slides: failedSlides.map(slide => ({ slide_index: slide.slideIndex, issues: [slide.error || "页面生成失败"] })),
      summary: "存在未生成完成的页面，请先重新生成异常页。"
    };
    await db.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "review_ready",
        deckQualityStatus: "manual_review",
        deckQualityReportJson: JSON.stringify(report),
        finishedAt: new Date(),
        error: report.summary
      }
    });
    return;
  }

  const freshRun = await db.deckGenerationRun.findUnique({ where: { id: run.id } });
  if (!freshRun) return;
  const attempt = freshRun.deckQualityAttempts + 1;
  const reviewRun = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "review_ready", deckQualityStatus: "checking", finishedAt: new Date(), error: null }
  });
  let report;
  try {
    report = await auditDeckConsistency(freshRun, slides);
  } catch (error) {
    report = {
      version: "wzlcf-deck-audit-v1",
      status: "pass",
      score: 0,
      checks: { delivery_safety: "后台安全检查本次不可用，页面仍按 Image2 成图正常交付。" },
      outlier_slides: [],
      summary: "",
      audit_error: error instanceof Error ? error.message : String(error),
      checked_at: new Date().toISOString()
    };
  }
  const criticalOutliers = report.outlier_slides.filter(outlier => outlier.severity === "critical");
  const finalStatus = criticalOutliers.length ? "manual_review" : "pass";
  const finalReport = {
    ...report,
    status: finalStatus,
    outlier_slides: criticalOutliers
  };
  const criticalMessage = criticalOutliers.length
    ? `后台安全检查发现第 ${criticalOutliers.map(item => item.slide_index).join("、")} 页存在严重异常，请先查看这些页面。`
    : null;
  await db.deckGenerationRun.updateMany({
    where: { id: run.id, status: "review_ready", updatedAt: reviewRun.updatedAt },
    data: {
      deckQualityStatus: finalStatus,
      deckQualityReportJson: JSON.stringify(finalReport),
      deckQualityAttempts: attempt,
      error: criticalMessage
    }
  });
}
async function tick() {
  await ensureDirs();
  const sourceRun = await db.deckGenerationRun.findFirst({
    where: { status: "sources_queued" },
    orderBy: { createdAt: "asc" }
  });
  if (sourceRun) {
    try {
      await processSourcesRun(sourceRun);
    } catch (error) {
      await db.deckGenerationRun.update({
        where: { id: sourceRun.id },
        data: { status: "failed", error: error instanceof Error ? error.message : String(error) }
      });
    }
    return;
  }

  const matching = await db.deckGenerationRun.findFirst({
    where: { status: "matching_queued" },
    orderBy: { createdAt: "asc" }
  });
  if (matching) {
    try {
      await matchAdvancedRun(matching);
    } catch (error) {
      await db.deckGenerationRun.update({
        where: { id: matching.id },
        data: { status: "failed", error: error instanceof Error ? error.message : String(error) }
      });
    }
    return;
  }

  const planning = await db.deckGenerationRun.findFirst({
    where: { status: "queued" },
    orderBy: { createdAt: "asc" }
  });
  if (planning) {
    try {
      await planRun(planning);
    } catch (error) {
      await db.deckGenerationRun.update({
        where: { id: planning.id },
        data: { status: "failed", error: error instanceof Error ? error.message : String(error) }
      });
    }
    return;
  }

  const generating = await db.deckGenerationRun.findFirst({
    where: { status: "generating" },
    orderBy: { confirmedAt: "asc" }
  });
  if (generating) {
    try {
      if (generating.generationMode === "advanced") {
        await processAdvancedGeneratingRun(generating);
      } else {
        await processGeneratingRun(generating);
      }
    } catch (error) {
      await db.deckGenerationRun.update({
        where: { id: generating.id },
        data: { status: "failed", error: error instanceof Error ? error.message : String(error) }
      });
    }
    return;
  }

  const pdf = await db.deckGenerationRun.findFirst({
    where: { status: "pdf_queued" },
    orderBy: { finishedAt: "asc" }
  });
  if (pdf) {
    try {
      await completePdf(pdf);
    } catch (error) {
      await db.deckGenerationRun.update({
        where: { id: pdf.id },
        data: { status: "review_ready", error: error instanceof Error ? error.message : String(error) }
      });
    }
    return;
  }

  const ppt = await db.deckGenerationRun.findFirst({
    where: { status: { in: ["ppt_queued", "ppt_processing"] } },
    orderBy: { finishedAt: "asc" }
  });
  if (ppt) {
    try {
      await processPptRun(ppt);
    } catch (error) {
      const rawError = error instanceof Error ? error.message : String(error);
      const quotaFailure = /insufficient|balance|quota|credit|payment|http 402|http 403|余额|额度/i.test(rawError);
      const networkFailure = /fetch failed|enotfound|econn|etimedout|socket|tls|certificate|network/i.test(rawError);
      const userMessage = quotaFailure
        ? "Codia 账户额度不足，或当前 API Key/套餐无权执行 PDF 转 PPT。充值或修复权限后，可直接点击“重试生成 PPT”；预览图和 PDF 不会丢失。"
        : networkFailure
          ? `Codia 网络连接失败：本次没有收到 402/403 响应，因此不能判断为额度问题。请检查 CODIA_BASE_URL、CODIA_PROXY_URL 或网络后点击“重试生成 PPT”。预览图和 PDF 已保留。原始错误：${rawError}`
          : rawError;
      await db.deckGenerationRun.update({
        where: { id: ppt.id },
        data: { status: "failed", error: userMessage }
      });
    }
  }
}

export {
  evidenceWallFactCaption,
  evidenceRenderMode,
  fallbackPageArchetype,
  localEvidenceFocusBox,
  protectedEvidenceCanvas,
  restoreProtectedEvidence,
  selectVisualEvidenceForPage
};

const skipTick = process.env.DECK_GENERATION_SKIP_TICK === "1";
const runOnce = process.env.DECK_GENERATION_RUN_ONCE === "1";
if (!skipTick) {
  console.log(runOnce ? "Deck generation worker started in one-shot mode." : "Deck generation worker started.");
  while (true) {
    try {
      await tick();
    } catch (error) {
      console.error("Deck generation worker tick failed:", error);
    }
    if (runOnce) break;
    await sleep(pollMs);
  }
}
await db.$disconnect();
