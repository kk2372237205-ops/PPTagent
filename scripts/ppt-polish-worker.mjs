import { existsSync, readFileSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { createHmac } from "crypto";
import path from "path";
import sharp from "sharp";
import JSZip from "jszip";
import {
  aiImageConfig,
  createServiceFetch,
  imageGenerationBody,
  requireImageService
} from "./ai-service-client.mjs";
import { createPptPolishSourcePages } from "./ppt-polish-source-pages.mjs";

const root = process.cwd();
loadEnv();

const workspaceRoot = path.join(root, "uploads", "employee-workspace");
const documentRoot = path.join(workspaceRoot, "documents");
const imageRoot = path.join(workspaceRoot, "images");
const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");
const workerHeartbeatPath = path.join(root, ".next-dev", "ppt-polish-worker-heartbeat.json");
const pollMs = Math.max(1500, Number(process.env.PPT_POLISH_POLL_MS || 3000));
const staleGeneratingMs = Math.max(60_000, Number(process.env.PPT_POLISH_STALE_GENERATING_MS || 60_000));
const polishConcurrency = Math.min(4, Math.max(1, Number(process.env.PPT_POLISH_CONCURRENCY || 2)));
const imageService = aiImageConfig();
const imageRequest = createServiceFetch(imageService);
// Separate from AI_IMAGE_SUPPORTS_EDITS: source pages must never start being
// uploaded to Image2 because another feature enables image editing.
const sourcePageReferenceEditsEnabled = process.env.PPT_POLISH_SOURCE_EDITS_ENABLED === "1";
const externalRequest = createServiceFetch({ serviceName: "Codia", proxyUrl: process.env.CODIA_PROXY_URL || "" });
const codiaBaseUrl = trimSlash(process.env.CODIA_BASE_URL || "https://openapi.codia.ai");
let workerHeartbeatState = "starting";
let workerHeartbeatTimer;

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

function sourceFileToken(runId, expiresAt = Date.now() + 10 * 60 * 1000) {
  const secret = process.env.ONLYOFFICE_JWT_SECRET || "development-onlyoffice-secret";
  const value = `${runId}.${expiresAt}`;
  const signature = createHmac("sha256", secret).update(value).digest("base64url");
  return `${expiresAt}.${signature}`;
}

function sourceUrlForRun(run) {
  const baseUrl = trimSlash(process.env.PPT_POLISH_APP_INTERNAL_URL || process.env.APP_INTERNAL_URL || process.env.APP_BASE_URL || "http://host.docker.internal:3000");
  const token = sourceFileToken(run.id);
  return `${baseUrl}/api/employee/services/${encodeURIComponent(run.serviceId)}/ppt-polish/runs/${encodeURIComponent(run.id)}/source?token=${encodeURIComponent(token)}`;
}

async function ensureDirs() {
  await Promise.all([
    mkdir(documentRoot, { recursive: true }),
    mkdir(imageRoot, { recursive: true }),
    mkdir(polishRunRoot, { recursive: true }),
    mkdir(path.dirname(workerHeartbeatPath), { recursive: true })
  ]);
}

async function writeWorkerHeartbeat(state = "idle") {
  workerHeartbeatState = state;
  try {
    await mkdir(path.dirname(workerHeartbeatPath), { recursive: true });
    await writeFile(workerHeartbeatPath, JSON.stringify({ pid: process.pid, state: workerHeartbeatState, updatedAt: new Date().toISOString() }, null, 2), "utf8");
  } catch {}
}

function startWorkerHeartbeat() {
  if (workerHeartbeatTimer) return;
  workerHeartbeatTimer = setInterval(() => {
    void writeWorkerHeartbeat(workerHeartbeatState);
  }, 5000);
}

function runPath(runId) {
  return path.join(polishRunRoot, `${path.basename(runId)}.json`);
}

async function readRunFile(fileName) {
  const content = await readFile(path.join(polishRunRoot, fileName), "utf8");
  return JSON.parse(content);
}

async function writeRun(run, patch = {}) {
  const next = {
    ...run,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await writeFile(runPath(next.id), JSON.stringify(next, null, 2), "utf8");
  return next;
}

async function listRuns() {
  await ensureDirs();
  const entries = await readdir(polishRunRoot, { withFileTypes: true }).catch(() => []);
  const runs = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      runs.push(await readRunFile(entry.name));
    } catch (error) {
      console.warn(`Skip malformed polish run ${entry.name}: ${error.message}`);
    }
  }
  return runs.sort((a, b) => Date.parse(b.updatedAt || b.createdAt || "") - Date.parse(a.updatedAt || a.createdAt || ""));
}


function providerError(result, fallback) {
  return result?.error?.message || result?.message || fallback;
}

function readableExternalFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "AbortError") return "图片中转服务等待超时，请稍后重试。";
  if (/fetch failed|network|connect|socket|econn|enotfound|etimedout|tls|ssl/i.test(message)) {
    return `无法直连图片中转服务：${message}。请检查 AI_IMAGE_BASE_URL 和中转站状态。`;
  }
  if (/401|invalid_api_key|incorrect api key|unauthorized/i.test(message)) return "图片中转服务授权异常，请检查 AI_IMAGE_API_KEY。";
  if (/403|forbidden|permission|not have access|does not have access|not authorized/i.test(message)) return "图片中转服务没有当前模型权限，请检查 AI_IMAGE_MODEL。";
  if (/quota|billing|credits|balance|insufficient/i.test(message)) return "图片中转站额度或余额不足，请检查中转站账户。";
  if (/rate limit|too many requests|429/i.test(message)) return "图片中转站当前请求较多，请稍后重试。";
  return message || "图片中转服务暂时不可用，请稍后重试。";
}

function multipartBody(fields, files) {
  const boundary = `----WzlcFPolish${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const cleanHeaderValue = value => String(value).replace(/[\r\n"]/g, "_");
  const chunks = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${cleanHeaderValue(name)}"\r\n\r\n${String(value)}\r\n`));
  }
  for (const file of files) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${cleanHeaderValue(file.field)}"; filename="${cleanHeaderValue(file.name)}"\r\nContent-Type: ${cleanHeaderValue(file.mime)}\r\n\r\n`));
    chunks.push(file.buffer);
    chunks.push(Buffer.from("\r\n"));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

async function imageBufferFromResult(image) {
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const download = await imageRequest(image.url, {}, 120000);
    if (!download.ok) throw new Error("图片中转服务生成图下载失败");
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("图片中转服务没有返回图片内容");
}

async function openAiImage(prompt, sourcePagePath = "") {
  requireImageService(imageService);
  const headers = { Authorization: `Bearer ${imageService.apiKey}` };
  let response;
  if (sourcePagePath) {
    if (!sourcePageReferenceEditsEnabled) throw new Error("原稿页视觉依据仍处于关闭的试验开关中，尚未向 Image2 上传原稿页面。");
    const sourceImage = await readFile(sourcePagePath);
    const multipart = multipartBody(imageGenerationBody(imageService, prompt), [{ field: "image", buffer: sourceImage, name: path.basename(sourcePagePath), mime: "image/png" }]);
    response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
      method: "POST",
      headers: { ...headers, "Content-Type": multipart.contentType },
      body: multipart.body
    });
  } else {
    response = await imageRequest(`${imageService.baseUrl}/images/generations`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(imageGenerationBody(imageService, prompt))
    });
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.data?.[0]) throw new Error(providerError(result, "图片中转服务生成失败"));
  return imageBufferFromResult(result.data[0]);
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

function stylePackDirection(id) {
  return ({
    "blue-gold-tech": "deep navy, bright blue, technology gold, cool white; title at top left, hero visual on the right, restrained grid and light-trail details; no purple neon, cartoon, or red government styling",
    "white-green-tech": "white background, pale green, deep green, dark gray; generous white space, rounded cards, lightweight header and bottom step bar; no black-gold luxury, heavy shadows, or cyber neon",
    "black-gold-business": "black, charcoal, gold, ivory white; high-contrast structure, vertical columns and refined metallic hairlines; no cartoon illustration, green eco styling, or cheap gradients",
    "blue-purple-ai": "deep blue, indigo purple, electric blue, cool white; centered hero visual, modular cards and circular data structures; no excessive neon, game UI, or flashy buttons",
    "red-white-government": "red, white, dark gray with sparse gold; formal stable hierarchy and clear information blocks; no cyber styling, entertainment mood, or cartoon treatment",
    "minimal-academic": "white, light gray, black and one restrained accent color only; generous white space, strict grid, fine annotation lines and a small number of charts; no complex background, strong glow, dense decoration, blue-gold palette, or dark technology canvas",
    "vivid-roadshow": "blue, cyan, white with restrained orange accents; energetic business story, image-and-text balance and prominent key numbers; no gloomy government styling or academic-paper feeling"
  })[id] || "apply the selected target style only; keep the palette restrained and consistent";
}

function xmlText(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function cleanText(value, maxLength = 2200) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

async function extractPptxSlides(storedName) {
  const filePath = path.join(documentRoot, path.basename(storedName));
  if (path.extname(filePath).toLowerCase() !== ".pptx") {
    throw new Error("美化 worker 目前只支持 PPTX 自动逐页重绘；请先把 PPT 另存为 PPTX。");
  }
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0));
  if (!slideFiles.length) throw new Error("没有从 PPTX 中识别到幻灯片页面。");
  const slides = [];
  for (const [index, fileName] of slideFiles.entries()) {
    const xml = await zip.file(fileName)?.async("text");
    const texts = Array.from(String(xml || "").matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map(match => cleanText(xmlText(match[1]), 180))
      .filter(Boolean);
    const uniqueTexts = Array.from(new Set(texts));
    slides.push({
      slideIndex: index + 1,
      title: uniqueTexts.find(item => item.length >= 2) || `第 ${index + 1} 页`,
      originalText: cleanText(uniqueTexts.join(" / "), 1800),
      note: "",
      status: "queued",
      updatedAt: new Date().toISOString()
    });
  }
  return slides;
}

function pageNoteFor(index, pageNotes = []) {
  const matched = [];
  for (const item of pageNotes) {
    const pages = String(item.pages || "");
    const parts = pages.split(/[,\uFF0C;；、\s]+/).filter(Boolean);
    for (const part of parts) {
      const range = part.match(/^(\d+)\s*[-~至到]\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (index >= Math.min(start, end) && index <= Math.max(start, end)) matched.push(item.note);
      } else if (Number(part) === index) {
        matched.push(item.note);
      }
    }
  }
  return cleanText(matched.join("；"), 800);
}

function optionLines(options = {}) {
  const labels = {
    keepText: "尽量保留原文字与原语义",
    keepNumbers: "保留数字、年份、百分比和单位",
    mainColor: "统一主色",
    headerFooter: "统一页眉页脚",
    backgroundTexture: "统一背景质感",
    cardStyle: "统一卡片样式",
    decorativeElements: "统一装饰元素",
    reduceText: "降低文字密度，改成更清晰的信息层级",
    sourcePageReference: "以本地固化的原稿页面作视觉依据，重绘时优先保留原有阅读顺序"
  };
  return Object.entries(labels).filter(([key]) => options[key]).map(([, label]) => `- ${label}`).join("\n") || "- 保持页面专业、清晰、统一";
}

function slideRole(run, slide) {
  if (slide.slideIndex === 1) return "cover";
  if (slide.slideIndex === run.pageCount) return "ending";
  return "content";
}

function visualSystemPrompt(run, slide) {
  const role = slideRole(run, slide);
  const base = [
    "Global visual system lock:",
    `- Apply this selected target style only: ${stylePackDirection(run.stylePack)}. Do not borrow colors, motifs, or background treatment from another style pack.`,
    "- Keep background texture, header micro-labels, footer rhythm, page numbers, card radius, detail intensity, and spacing language consistent with adjacent pages.",
    "- Do not abruptly switch to a different palette, illustration style, or poster-only treatment. Any warning color must be a small accent and still follow the selected target style.",
    "- Prefer fewer larger visual ideas over many small blocks. Avoid scattered decorations, mismatched illustration styles, and overloaded tiny text.",
    "- Treat the deck as one premium conference keynote, not independent posters."
  ];
  if (role === "cover") {
    base.push(
      "Cover page special direction:",
      "- Make the cover emotionally strong and eye-catching: one cinematic hero visual, strong depth, confident lighting, and clear focal point.",
      "- Use very little text: main title, optional short subtitle, and at most three tiny metadata chips. Avoid dense timelines, paragraph cards, and explanatory blocks on the cover.",
      "- The title should feel memorable and central; the visual should carry most of the impact."
    );
  } else if (role === "ending") {
    base.push(
      "Ending page special direction:",
      "- Make the ending page emotional, spacious, and memorable. Use one large closing sentence or slogan as the main focus.",
      "- Keep text minimal. If supporting points are needed, use no more than three short chips or cards.",
      "- Use a stronger atmosphere than middle pages while still matching the selected target style."
    );
  } else {
    base.push(
      "Content page direction:",
      "- Make the page readable and structured with clear hierarchy, but keep visual energy aligned with the cover and ending.",
      "- Use charts, cards, timelines, or diagrams only when they help the detected content; avoid unnecessary text-heavy boxes."
    );
  }
  return base.join("\n");
}

function previousVisualAnchor(slide) {
  if (!slide?.prompt) return "No generated previous-page style anchor yet; follow the global deck visual system.";
  const prompt = cleanText(slide.prompt, 1200);
  return [
    "Use this previous generated page prompt as a visual style anchor only.",
    "Borrow its palette discipline, density, header/footer rhythm, card language, detail accents, and icon style.",
    "Do not copy previous-page text, data, charts, characters, or exact composition.",
    prompt
  ].join("\n");
}

function slidePrompt(run, slide, previous, next) {
  const wantsPreviousAnchor = /Action:\s*closer_previous/i.test(slide.lastInstruction || "");
  return `Create one complete premium 16:9 PowerPoint slide image.

This is a PPT polish/redesign task. Rebuild the current slide as a polished presentation page, not a poster and not a screenshot.

Deck source file: ${run.sourceName}
Target style: ${stylePackName(run.stylePack)}
Slide: ${slide.slideIndex}/${run.pageCount}
Detected slide title/text:
${slide.originalText || slide.title}

Overall polish direction:
${run.note || "Make the deck more polished, consistent, readable, and presentation-ready."}

Current slide specific request:
${slide.note || "No extra page-level request."}

Regeneration instruction:
${slide.lastInstruction || "None."}

Selected requirements:
${optionLines(run.options)}

Visual consistency requirements:
${visualSystemPrompt(run, slide)}

Previous generated page visual anchor:
${wantsPreviousAnchor ? previousVisualAnchor(previous) : "Use the previous page only for broad continuity; prioritize the current slide request."}

Previous slide context:
${previous?.originalText || "start"}

Next slide context:
${next?.originalText || "end"}

Source-page visual context:
${run.options?.sourcePageReference ? "A local snapshot of this same source page is supplied only as visual context. Preserve its reading order, major grouping, and useful visual hierarchy where possible, but redesign it into the selected target style. This is an AI redraw, not pixel-perfect editing: Chinese text, logos, photographs, diagrams, and tiny labels can change and must be reviewed." : "No source-page image is supplied. Rebuild from extracted text and the selected target style."}

Hard requirements:
- Output exactly one full 16:9 PPT page with refined layout, title hierarchy, content blocks, background, and safe margins.
- Preserve the original meaning. If numbers, dates, names, or important labels exist in the detected text, keep them readable and do not invent conflicting data.
- Avoid dense paragraphs. Use concise designed text, cards, diagrams, timelines, charts, or structured blocks where appropriate.
- Keep all important text and visuals inside a 6% safe area. Nothing important may touch or be cut off by the canvas edge.
- Keep continuity across pages: same palette, header/footer rhythm, typography feeling, card language, icon style, detail treatment, and decorative language.
- For regeneration, obey the requested redesign route. The new page must be visibly different from the previous generated version unless the instruction explicitly asks only for closer continuity.
- Do not include watermarks, model signatures, browser UI, chat UI, random logos, or unrelated characters.
- If exact Chinese text is uncertain, use short legible Chinese labels based on the detected text rather than gibberish.`;
}

async function prepareRun(run) {
  run = await writeRun(run, { status: "planning", error: "" });
  const sourcePath = path.join(documentRoot, path.basename(run.sourceStoredName));
  const sourceSnapshot = run.sourceSnapshot?.pageCount
    ? run.sourceSnapshot
    : await createPptPolishSourcePages({
      run,
      sourcePath,
      sourceUrl: sourceUrlForRun(run),
      runRoot: polishRunRoot,
      onlyOfficeUrl: process.env.PPT_POLISH_ONLYOFFICE_URL || process.env.ONLYOFFICE_URL || "http://localhost:18080",
      onlyOfficeSecret: process.env.ONLYOFFICE_JWT_SECRET || "development-onlyoffice-secret"
    });
  if (run.options?.sourcePageReference && !sourcePageReferenceEditsEnabled) {
    throw new Error("已固化原稿页，但“原稿页视觉依据”试验开关尚未开启；系统没有向 Image2 上传原稿页面。");
  }
  const extracted = run.slides?.length ? run.slides : await extractPptxSlides(run.sourceStoredName);
  const slides = extracted.map(slide => ({
    ...slide,
    note: pageNoteFor(slide.slideIndex, run.pageNotes)
  }));
  return writeRun(run, {
    status: "generating",
    pageCount: slides.length,
    slides,
    sourceSnapshot,
    error: ""
  });
}

function sourcePagePathFor(run, slide) {
  const page = run.sourceSnapshot?.pages?.find(item => item.pageIndex === slide.slideIndex);
  if (!page?.storedName) throw new Error(`未找到第 ${slide.slideIndex} 页的原稿页面图。`);
  const sourcePagePath = path.join(polishRunRoot, path.basename(run.id), "source-pages", path.basename(page.storedName));
  if (!existsSync(sourcePagePath)) throw new Error(`第 ${slide.slideIndex} 页原稿页面图已不存在。`);
  return sourcePagePath;
}

async function generateSlideAsset(run, slide) {
  const slides = run.slides || [];
  const currentIndex = slides.findIndex(item => item.slideIndex === slide.slideIndex);
  const previous = currentIndex > 0 ? slides[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < slides.length - 1 ? slides[currentIndex + 1] : null;
  const prompt = slidePrompt(run, slide, previous, next);
  let normalized;
  try {
    const sourcePagePath = run.options?.sourcePageReference ? sourcePagePathFor(run, slide) : "";
    const raw = await openAiImage(prompt, sourcePagePath);
    normalized = await sharp(raw)
      .resize(1920, 1080, { fit: "contain", background: "#061525" })
      .png()
      .toBuffer();
  } catch (error) {
    return { ok: false, slideIndex: slide.slideIndex, prompt, error: readableExternalFailure(error), updatedAt: new Date().toISOString() };
  }
  try {
    const storedName = nowName("png");
    await writeFile(path.join(imageRoot, storedName), normalized);
    return { ok: true, slideIndex: slide.slideIndex, storedName, prompt, updatedAt: new Date().toISOString() };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, slideIndex: slide.slideIndex, prompt, error: message, updatedAt: new Date().toISOString() };
  }
}

async function processGenerating(run) {
  if (!run.slides?.length) return prepareRun(run);
  const staleSlides = run.slides.filter(slide => slide.status === "generating" && Date.now() - Date.parse(slide.updatedAt || run.updatedAt || run.createdAt || "") > staleGeneratingMs);
  if (staleSlides.length) {
    const recoveredAt = new Date().toISOString();
    const staleIndexes = new Set(staleSlides.map(slide => slide.slideIndex));
    run = await writeRun(run, {
      slides: run.slides.map(slide => staleIndexes.has(slide.slideIndex) ? { ...slide, status: "queued", error: "", updatedAt: recoveredAt } : slide),
      error: ""
    });
  }
  const activeCount = run.slides.filter(slide => slide.status === "generating").length;
  const slots = Math.max(0, polishConcurrency - activeCount);
  const nextSlides = run.slides.filter(slide => ["queued", "waiting"].includes(slide.status)).slice(0, slots);
  if (nextSlides.length) {
    const started = new Date().toISOString();
    const activeIndexes = new Set(nextSlides.map(slide => slide.slideIndex));
    run = await writeRun(run, {
      slides: run.slides.map(slide => activeIndexes.has(slide.slideIndex) ? { ...slide, status: "generating", error: "", updatedAt: started } : slide),
      error: ""
    });
    const activeSlides = run.slides.filter(slide => activeIndexes.has(slide.slideIndex));
    const results = await Promise.all(activeSlides.map(slide => generateSlideAsset(run, slide)));
    const latest = await readRunFile(`${run.id}.json`).catch(() => run);
    const resultMap = new Map(results.map(result => [result.slideIndex, result]));
    const mergedSlides = (latest.slides || []).map(slide => {
      const result = resultMap.get(slide.slideIndex);
      if (!result) return slide;
      if (result.ok) return { ...slide, status: "completed", storedName: result.storedName, prompt: result.prompt, error: "", updatedAt: result.updatedAt };
      return { ...slide, status: "failed", prompt: result.prompt, error: result.error, updatedAt: result.updatedAt };
    });
    const firstFailure = results.find(result => !result.ok);
    const coverResult = results.find(result => result.ok && result.slideIndex === 1);
    let status = "generating";
    let error = "";
    if (firstFailure) {
      status = "failed";
      error = firstFailure.error;
    } else if (mergedSlides.every(slide => slide.status === "completed" && slide.storedName)) {
      status = "review_ready";
    }
    return writeRun(latest, {
      status,
      slides: mergedSlides,
      coverStoredName: coverResult?.storedName || latest.coverStoredName,
      error
    });
  }
  if (run.slides.every(slide => slide.status === "completed" && slide.storedName)) {
    return writeRun(run, { status: "review_ready", error: "" });
  }
  if (run.slides.some(slide => slide.status === "failed")) {
    return writeRun(run, { status: "failed", error: "部分页面生成失败，请检查页面错误后重新提交。" });
  }
  return run;
}

function pdfString(value) {
  return Buffer.from(value, "binary");
}

function makeObject(id, body) {
  return { id, body: Buffer.isBuffer(body) ? body : pdfString(String(body)) };
}

function streamObject(id, dict, stream) {
  return makeObject(id, Buffer.concat([pdfString(`${dict}\nstream\n`), stream, pdfString("\nendstream")]));
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
  for (let id = 1; id <= maxId; id += 1) chunks.push(pdfString(`${String(offsets[id] || 0).padStart(10, "0")} 00000 n \n`));
  chunks.push(pdfString(`trailer\n<< /Size ${maxId + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`));
  return Buffer.concat(chunks);
}

async function createPdf(run) {
  const images = [];
  for (const slide of run.slides || []) {
    if (!slide.storedName || slide.status !== "completed") throw new Error("还有页面没有生成完成，暂时不能合成 PDF。");
    const file = await readFile(path.join(imageRoot, path.basename(slide.storedName)));
    const jpeg = await sharp(file)
      .resize(1920, 1080, { fit: "contain", background: "#061525" })
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    images.push(jpeg);
  }
  const storedName = nowName("pdf");
  await writeFile(path.join(documentRoot, storedName), makeImagePdf(images, 960, 540));
  return writeRun(run, {
    status: "ppt_queued",
    pdfStoredName: storedName,
    coverStoredName: run.coverStoredName || run.slides?.[0]?.storedName,
    error: ""
  });
}

function codiaConfig() {
  const key = process.env.CODIA_API_KEY?.replace(/^["']|["']$/g, "").trim();
  if (!key) throw new Error("尚未配置 CODIA_API_KEY，PDF 已生成，但无法自动转 PPTX。");
  return { key };
}

async function readCodiaJson(response, fallback) {
  const text = await response.text();
  let result = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok || result.code) throw new Error(`Codia API error ${response.status}: ${result?.message || fallback}`);
  return result;
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

async function codiaCreatePdfToPptTask(run, uploadId) {
  const { key } = codiaConfig();
  const request = codiaRequest;
  const response = await request(`${codiaBaseUrl}/v2/open/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Idempotency-Key": `ppt-polish-${run.id}`
    },
    body: JSON.stringify({
      operation: "pdf_to_ppt",
      input: {
        upload_id: uploadId,
        title: `${run.sourceName.replace(/\.(pptx?|pdf)$/i, "")}-美化版`
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

async function processPpt(run) {
  if (!run.pdfStoredName) return createPdf(run);
  if (!run.codiaTaskId) {
    const pdfBuffer = await readFile(path.join(documentRoot, path.basename(run.pdfStoredName)));
    const upload = await codiaUploadPdf(pdfBuffer, `${run.sourceName.replace(/\.(pptx?|pdf)$/i, "")}-美化版.pdf`);
    const task = await codiaCreatePdfToPptTask(run, upload.uploadId);
    return writeRun(run, {
      status: "ppt_processing",
      codiaTaskId: task.taskId,
      codiaResponse: { upload: upload.response, task: task.response },
      error: ""
    });
  }
  const result = await codiaGetTask(run.codiaTaskId);
  const task = result?.data || {};
  if (["pending", "processing"].includes(task.status)) {
    return writeRun(run, { codiaResponse: result, error: "" });
  }
  if (task.status === "failed" || task.status === "canceled") {
    throw new Error(task.error || `Codia PDF 转 PPT 任务${task.status === "canceled" ? "已取消" : "失败"}`);
  }
  if (task.status !== "succeeded") throw new Error(`Codia 返回了未知任务状态：${task.status || "empty"}`);
  const pptUrl = task.result?.ppt_url;
  if (!pptUrl) throw new Error("Codia 任务成功但没有返回 result.ppt_url");
  const ppt = await downloadCodiaPpt(pptUrl);
  const storedName = nowName("pptx");
  await writeFile(path.join(documentRoot, storedName), ppt);
  return writeRun(run, {
    status: "ppt_ready",
    pptStoredName: storedName,
    codiaResponse: result,
    error: ""
  });
}

async function failRun(run, error) {
  const message = readableExternalFailure(error);
  if (["ppt_queued", "ppt_processing"].includes(run.status) && run.pdfStoredName) {
    return writeRun(run, { status: "pdf_ready", error: message });
  }
  if (run.status === "generating" && run.slides?.length) {
    let marked = false;
    const nextSlides = run.slides.map(slide => {
      if (slide.status === "generating" || (!marked && ["queued", "waiting"].includes(slide.status))) {
        marked = true;
        return { ...slide, status: "failed", error: message, updatedAt: new Date().toISOString() };
      }
      return slide;
    });
    return writeRun(run, { status: "failed", slides: nextSlides, error: message });
  }
  return writeRun(run, { status: "failed", error: message });
}

async function processRun(run) {
  try {
    if (run.status === "confirmed") return await prepareRun(run);
    if (run.status === "planning") return await prepareRun(run);
    if (run.status === "generating") return await processGenerating(run);
    if (run.status === "pdf_queued") return await createPdf(run);
    if (run.status === "pdf_ready" || run.status === "ppt_queued" || run.status === "ppt_processing") return await processPpt(run);
    return run;
  } catch (error) {
    console.error(`PPT polish run ${run.id} failed:`, error);
    return failRun(run, error);
  }
}

async function tick() {
  const activeStatuses = new Set(["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"]);
  const runs = await listRuns();
  const run = runs.find(item => activeStatuses.has(item.status) && canProcessRun(item));
  if (!run) {
    await writeWorkerHeartbeat("idle");
    return;
  }
  await writeWorkerHeartbeat(`running:${run.id}:${run.status}`);
  await processRun(run);
  await writeWorkerHeartbeat("polling");
}

function canProcessRun(run) {
  if (run.status === "confirmed") return true;
  if (["planning", "generating"].includes(run.status) && !run.confirmedAt && !run.pageCount && !run.slides?.length) return false;
  return true;
}

console.log(`PPT polish worker polling ${polishRunRoot}`);
await writeWorkerHeartbeat("started");
startWorkerHeartbeat();
for (;;) {
  try {
    await tick();
  } catch (error) {
    console.error("PPT polish worker tick failed:", error);
  }
  await sleep(pollMs);
}
