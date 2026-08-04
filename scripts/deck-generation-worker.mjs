import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
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
const skillRoot = path.join(root, "skills", "deck-generation");
const pollMs = Math.max(1200, Number(process.env.DECK_GENERATION_POLL_MS || 2500));
const deckGenerationConcurrency = Math.min(4, Math.max(1, Number(process.env.DECK_GENERATION_CONCURRENCY || 2)));
const textService = aiTextConfig();
const imageService = aiImageConfig();
const textRequest = createServiceFetch(textService);
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
    mkdir(deckThemeRoot, { recursive: true })
  ]);
}

function readSkill(name) {
  return readFileSync(path.join(skillRoot, name), "utf8").trim();
}

function skillBundle() {
  return [
    readSkill("SKILL.md"),
    readSkill("style-packs.md"),
    readSkill("visual-identity.md"),
    readSkill("visual-storyboard.md"),
    readSkill("slide-image-specs.md"),
    readSkill("regeneration-controls.md"),
    readSkill("source-grounding.md"),
    readSkill("outline-control.md"),
    readSkill("content-density.md"),
    readSkill("palette-reference.md"),
    readSkill("quality-audit.md")
  ].join("\n\n---\n\n");
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


async function openAiInput(input) {
  requireTextService(textService);
  const response = await textRequest(textEndpoint(textService), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${textService.apiKey}`
    },
    body: JSON.stringify(textRequestBody(textService, input))
  });
  const result = await response.json();
  if (!response.ok) throw new Error(providerError(result, "文字中转服务生成失败"));
  const text = textFromResponse(result);
  if (!text) throw new Error("文字中转服务没有返回可读文本");
  return text;
}

async function openAiText(prompt) {
  return openAiInput(prompt);
}

function jsonFromText(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回可用 JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}

async function openAiJson(prompt) {
  let text = await openAiText(prompt);
  try {
    return jsonFromText(text);
  } catch {
    text = await openAiText(`${prompt}\n\n你上一次没有返回合法 JSON。请只返回一个 JSON object，不要 Markdown，不要解释。`);
    return jsonFromText(text);
  }
}

async function openAiImage(prompt) {
  requireImageService(imageService);
  const response = await imageRequest(`${imageService.baseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${imageService.apiKey}`
    },
    body: JSON.stringify(imageGenerationBody(imageService, prompt))
  });
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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
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
      must_avoid: normalizeArray(slide.must_avoid).map(String).slice(0, 10)
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
      must_avoid: []
    });
  }
  const finalSlide = slides[slides.length - 1];
  if (finalSlide) {
    slides[slides.length - 1] = {
      ...finalSlide,
      role: "ending",
      content_summary: String(finalSlide.content_summary || "Close the deck with one memorable conclusion and emotional payoff.").slice(0, 260),
      composition: [
        finalSlide.composition,
        "FINAL ENDING SLIDE RULE: make this feel like a cover-level closing page, not another content page. Use sparse content, strong emotional closure, strong visual focus, and one memorable takeaway. Avoid dense cards, charts, process diagrams, multi-column explanations, or new information."
      ].filter(Boolean).join(" "),
      main_visual: String(finalSlide.main_visual || `${run.projectName} closing key visual`).slice(0, 520),
      text_density: "low",
      white_space: "High whitespace. One headline-level closing statement, optional short subtitle, and minimal supporting marks only.",
      must_include: Array.from(new Set([
        ...normalizeArray(finalSlide.must_include).map(String).slice(0, 2),
        "one memorable closing statement"
      ])).slice(0, 3),
      must_avoid: Array.from(new Set([
        ...normalizeArray(finalSlide.must_avoid).map(String),
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


async function openAiVisionJson(source, instruction) {
  const raw = await readFile(sourceFilePath(source));
  const resized = await sharp(raw).resize(1800, 1800, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
  const text = await openAiInput([{
    role: "user",
    content: [
      { type: "input_text", text: instruction },
      { type: "input_image", image_url: `data:image/png;base64,${resized.toString("base64")}` }
    ]
  }]);
  return jsonFromText(text);
}

async function extractOneSource(source) {
  await db.deckGenerationSource.update({
    where: { id: source.id },
    data: { status: "processing", error: null }
  });
  try {
    let parsed;
    if (source.kind === "theme") {
      const palette = await openAiVisionJson(source, `分析这张 PPT 配色参考图。只返回 JSON object：
{
  "palette":["#RRGGBB"],
  "background":"#RRGGBB",
  "surface":"#RRGGBB",
  "primary_text":"#RRGGBB",
  "secondary_text":"#RRGGBB",
  "accent":"#RRGGBB",
  "accent_secondary":"#RRGGBB",
  "usage_rules":[""],
  "avoid":[""],
  "visual_tone":""
}
要求提取 5-8 个真实可复用颜色，并说明每种颜色在 PPT 页面里的职责。不要分析页面内容。所有字段必须有值。`);
      parsed = {
        kind: "theme",
        text: "",
        sections: [],
        metadata: { palette }
      };
    } else {
      parsed = await parseDeckSourceFile(sourceFilePath(source), source.originalName, source.mimeType);
      if (parsed.kind === "image") {
        const vision = await openAiVisionJson(source, `读取这张参考资料图片。只返回 JSON object：
{
  "transcription":"尽量完整抄录图片中的可读文字和数字",
  "facts":["图片中明确表达的事实、数字、日期、人物、结论"],
  "description":"对图表、照片、结构和视觉信息的客观说明",
  "warnings":["无法确认或模糊的信息"]
}
不要猜测看不清的内容，不要补造数字。`);
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
          metadataJson: JSON.stringify(parsed.metadata || {}),
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
- exact 表示原样保留，polish 表示允许润色，direction 表示只作方向。
- 封面和结尾默认 sparse；资料型正文允许 compact。
- 不要输出视觉方案，不要开始生图。`;
}

async function processSourcesRun(run) {
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "source_processing", startedAt: run.startedAt || new Date(), error: null }
  });
  const sources = await db.deckGenerationSource.findMany({
    where: { runId: run.id },
    orderBy: { createdAt: "asc" }
  });
  const results = [];
  for (const source of sources) results.push(await extractOneSource(source));

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
  const theme = refreshedSources.find(source => source.kind === "theme" && source.status === "completed");
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

  const pages = normalizeAdvancedOutline(await openAiJson(outlinePrompt(run, outlineMaterial)), run);
  await db.$transaction([
    db.deckGenerationPagePlan.deleteMany({ where: { runId: run.id } }),
    db.deckGenerationPagePlan.createMany({
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
    }),
    db.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "outline_ready",
        pageCount: pages.length,
        analysisSummaryJson: JSON.stringify(analysisSummary),
        paletteContractJson: JSON.stringify(themeMetadata.palette || {}),
        error: analysisSummary.failedCount ? "部分资料读取失败，请在逐页匹配前检查资料状态。" : null
      }
    })
  ]);
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

function matchingPrompt(run, pages, candidates) {
  return `${readSkill("source-grounding.md")}

你是领导汇报 PPT 的资料编辑。用户已经决定每一页讲什么，你只负责从证据候选中选择可靠内容并整理成逐页内容包。

项目：${run.projectName}
用途：${run.projectType || "未填写"}
项目说明：${run.brief}
用户粘贴的补充资料：${run.referenceText || "无"}

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
- 每个事实块必须填写 evidence_ids；资料不足就在 warnings 写明，不要硬凑。
- 保持用户的页序、大标题、小标题和约束模式。
- compact 页面可以信息紧凑，但必须有层级，不堆成长段。
- 第 1 页和最后一页少文字、强情绪；正文页根据内容密度组织。
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
    warnings: jsonArray(page.warningsJson),
    locked: page.locked
  };
}

async function persistDeckPlan(run, plan) {
  await db.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: "plan_ready",
      outlineJson: JSON.stringify(plan.outline),
      visualIdentityJson: JSON.stringify(plan.visual_identity),
      visualStoryboardJson: JSON.stringify(plan.visual_storyboard),
      slideImageSpecsJson: JSON.stringify(plan.slide_image_specs),
      planReadyAt: new Date(),
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

async function planAdvancedRun(run) {
  const pages = await db.deckGenerationPagePlan.findMany({
    where: { runId: run.id },
    orderBy: { pageIndex: "asc" }
  });
  const pagePayload = pages.map(pagePlanPayload);
  const prompt = `${skillBundle()}

请把下面已经由用户确认、并且已匹配资料依据的逐页内容包，转成整套 PPT 视觉方案。不要改页序，不要删除用户指定的小标题、事实和结论。

项目：${run.projectName}
用途：${run.projectType || "未填写"}
风格包：${stylePackName(run.stylePack)}
主题配色合同：${run.paletteContractJson}
统一元素选项：${run.unityOptionsJson}
逐页内容包：${JSON.stringify(pagePayload)}

只返回 JSON object：
{
  "outline":{"title":"","slides":[]},
  "visual_identity":{},
  "visual_storyboard":{"slides":[]},
  "slide_image_specs":{"slides":[]}
}

要求：
- 页数必须是 ${pages.length}，标题、页序和 role 与逐页内容包一致。
- exact 内容必须原样进入 must_include；polish 只允许压缩表达，不得改变事实；direction 可以转成合适的版式表达。
- sparse 用于封面/结尾；standard 为普通正文；compact 必须做成高密度但有清楚分区的专业汇报页。
- 所有数字、日期和专名只能来自逐页内容包的 evidence。
- 使用主题参考图时严格遵守 paletteContractJson 的色彩职责，不照抄参考图版式。`;
  const normalized = normalizePlan(await openAiJson(prompt), { ...run, pageCount: pages.length });
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
      must_include: Array.from(new Set([...mustInclude.map(String), ...normalizeArray(slide.must_include).map(String)])).slice(0, 30),
      evidence: jsonArray(page.evidenceJson),
      warnings: jsonArray(page.warningsJson)
    };
  });
  normalized.outline = normalizeOutline(normalized, run, normalized.slide_image_specs.slides);
  normalized.visual_storyboard = normalizeStoryboard(normalized, normalized.slide_image_specs.slides);
  await persistDeckPlan(run, normalized);
}

async function matchAdvancedRun(run) {
  await db.deckGenerationRun.update({
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
  const result = await openAiJson(matchingPrompt(run, pages.map(pagePlanPayload), candidates));
  const returned = normalizeArray(result.pages);
  const evidenceById = new Map(candidates.map(item => [item.id, item]));

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
    await db.deckGenerationPagePlan.update({
      where: { id: page.id },
      data: {
        title: cleanSlideTitle(item.title, page.title),
        purpose: String(item.purpose || page.purpose).slice(0, 1200),
        blocksJson: JSON.stringify(blocks.length ? blocks : jsonArray(page.blocksJson)),
        mustIncludeJson: JSON.stringify(cleanStringList(item.must_include, 30).length ? cleanStringList(item.must_include, 30) : jsonArray(page.mustIncludeJson)),
        conclusion: String(item.conclusion || page.conclusion).slice(0, 1000),
        density: ["sparse", "standard", "compact"].includes(item.density) ? item.density : page.density,
        layoutType: String(item.layout_type || page.layoutType || "auto").slice(0, 80),
        evidenceJson: JSON.stringify(matchedEvidence),
        warningsJson: JSON.stringify(cleanStringList(item.warnings, 20))
      }
    });
  }
  const refreshed = await db.deckGenerationRun.findUnique({ where: { id: run.id } });
  if (!refreshed) throw new Error("生成 PPT 任务不存在");
  await planAdvancedRun(refreshed);
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

function slidePrompt(run, slide, instruction = "") {
  const identity = safeJson(run.visualIdentityJson, {});
  const storyboard = safeJson(run.visualStoryboardJson, {});
  const allSpecs = safeJson(run.slideImageSpecsJson, {});
  const spec = safeJson(slide.specJson, {});
  const previous = allSpecs.slides?.find(item => item.slide_index === slide.slideIndex - 1) || null;
  const next = allSpecs.slides?.find(item => item.slide_index === slide.slideIndex + 1) || null;
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
- If this is the final slide or Role is ending, it must be a minimal emotional closing page like a cover: sparse content, strong closure, strong memory point, one headline-level takeaway, optional short subtitle, and no dense cards, charts, feature lists, process diagrams, or new arguments.
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
        data: { status: "outline_ready", error: error instanceof Error ? error.message : String(error) }
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
      await processGeneratingRun(generating);
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

console.log("Deck generation worker started.");
while (true) {
  try {
    await tick();
  } catch (error) {
    console.error("Deck generation worker tick failed:", error);
  }
  await sleep(pollMs);
}
