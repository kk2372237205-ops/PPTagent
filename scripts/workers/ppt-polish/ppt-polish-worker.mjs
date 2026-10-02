import { existsSync, readFileSync } from "fs";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { createHmac } from "crypto";
import { spawnSync } from "child_process";
import path from "path";
import sharp from "sharp";
import JSZip from "jszip";
import { FormData } from "undici";
import {
  aiImageConfig,
  createServiceFetch,
  requireImageEdits
} from "../shared/ai-service-client.mjs";
import { createPptPolishSourcePages } from "./ppt-polish-source-pages.mjs";

const root = process.cwd();
loadEnv();

const workspaceRoot = path.join(root, "uploads", "employee-workspace");
const documentRoot = path.join(workspaceRoot, "documents");
const imageRoot = path.join(workspaceRoot, "images");
const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");
// 只共享风格包定义（用户可见选项的唯一含义）；画面工程规则不共享，见下方说明。
const workerHeartbeatPath = path.join(root, ".next-dev", "ppt-polish-worker-heartbeat.json");
const pollMs = Math.max(600, Number(process.env.PPT_POLISH_POLL_MS || 1200));
const staleGeneratingMs = Math.max(60_000, Number(process.env.PPT_POLISH_STALE_GENERATING_MS || 60_000));
const polishConcurrency = Math.min(4, Math.max(1, Number(process.env.PPT_POLISH_CONCURRENCY || 2)));
// 任务级并发（默认关闭，保持既有串行行为）。
// 打开后：一个任务在逐页重绘时，第二个任务也能同时开始，不再排队等前一个跑完。
const parallelRunsEnabled = process.env.PPT_POLISH_PARALLEL_RUNS === "1";
const parallelRunLimit = Math.max(1, Math.min(6, Number(process.env.PPT_POLISH_PARALLEL_RUN_LIMIT || 2)));
// 全局图片闸门：所有任务加起来，同时在跑的 Image2 调用不超过这个数。
// 每个任务自己的并发上限是 polishConcurrency；并行后总张数会翻倍，必须再有一道全局上限。
const globalImageConcurrency = Math.max(1, Math.min(8, Number(process.env.PPT_POLISH_GLOBAL_IMAGE_CONCURRENCY || 3)));
const imageService = aiImageConfig();
const imageRequest = createServiceFetch(imageService);
const externalRequest = createServiceFetch({ serviceName: "Codia", proxyUrl: process.env.CODIA_PROXY_URL || "" });
const codiaBaseUrl = trimSlash(process.env.CODIA_BASE_URL || "https://openapi.codia.ai");
// Image2 的全局闸门（与生成 PPT 那边同一套做法）。
// 为什么需要：processGenerating 的并发上限是「每个任务」polishConcurrency 张；
// 串行调度时全局最多就是这么多，一旦允许多个任务同时出图就会成倍打到中转站。
function createImageSemaphore(limit) {
  let active = 0;
  const waiters = [];
  return async function withImageSlot(task) {
    if (active >= limit) await new Promise(resolve => waiters.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  };
}
// 串行模式下不设闸门（保持既有行为一字不差）；并行模式下按全局上限收敛。
const imageSlot = parallelRunsEnabled ? createImageSemaphore(globalImageConcurrency) : async task => task();
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

async function openAiImage(prompt, sourcePage) {
  // 所有美化出图都从这里走，所以全局闸门挂在这一处即可。
  return imageSlot(() => requestOpenAiImage(prompt, sourcePage));
}

async function requestOpenAiImage(prompt, sourcePage) {
  // 美化是“原页 PNG + 该页要求”的一对一图片编辑，不允许在参考页缺失时
  // 静默降级成纯文字生图；那样无法让模型看见原来的图片、版式与文字。
  requireImageEdits(imageService);
  const form = new FormData();
  form.set("model", imageService.model);
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("size", imageService.size);
  form.set("image", new Blob([new Uint8Array(sourcePage.buffer)], { type: "image/png" }), sourcePage.name);
  const response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${imageService.apiKey}` },
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.data?.[0]) {
    throw new Error(`${providerError(result, "图片中转服务生成失败")}（图片编辑接口 HTTP ${response.status}）`);
  }
  const image = result.data[0];
  if (image.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image.url) {
    const download = await imageRequest(image.url, {}, 120000);
    if (!download.ok) throw new Error("图片中转服务生成图下载失败");
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("图片中转服务没有返回图片内容");
}

/**
 * 美化 PPT 与生成 PPT 的规则边界（2026-09-27 owner 决定；2026-09-30 两轮收紧）
 *
 * 生成 PPT、美化 PPT、生图是三条独立产品线，不互相黏连。
 * 现在的状态：**美化不读任何外部规则文件**，既不读 `skills/deck-generation/`，
 * 也不读自己曾经的 `skills/ppt-polish/visual-redraw-system.md`（已删除）。
 * 美化每页的提示词只由三样东西组成：用户写的要求、这一页原有的文字、本页在整套里的位置。
 *
 * 为什么连自己的规则也删掉（2026-09-30 owner 原话："这些提示词我都不需要用到这里，
 * 只听用户的提示词命令"）：那些规则会和用户自己写的指令直接打架，例如
 *   - 规则说"不要锁定任何风格/不要强制配色"，用户说"用蓝白色科技风"；
 *   - 规则说"每页必须有 ≥25% 主导插图并出血"，用户说"文字图片内容不变"；
 *   - 规则说"默认写实摄影、禁扁平矢量"，用户要的是设计感科技风；
 *   - 规则说封面/结尾"文字极少"、"降低文字密度"，用户说"内容不变"。
 * 模型会听更长更具体的规则，而不是听用户那两行——这就是"不听话"的根因。
 *
 * 要恢复任何一条旧规则，看 git 历史（c484d36 及更早）。
 */
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

/**
 * 美化单页提示词只包含用户的要求，**不掺任何我们自己的画面规则**。
 *
 * 2026-09-30 owner 决定：删掉以前偷偷加进去的那一整套规则
 *（"不要锁定风格/不要强制配色"、"每页必须有 ≥25% 主导插图并出血"、"默认写实摄影、禁扁平"、
 *  封面/结尾"文字极少"、"降低文字密度"、"不确定中文就用短标签"、"把并列项改成流程链" 等），
 * 理由是它们和用户自己写的"文字图片内容不变 / 用蓝白科技风"直接打架，模型会听规则不听用户。
 *
 * 本页原始 PNG 会作为 /images/edits 的图片输入；原文、前后页文字和位置
 * 不再塞进提示词。要恢复任何一条旧规则，看 git 历史（c484d36 及更早）。
 */
function slidePrompt(run, slide) {
  const requirements = [
    run.note,
    slide.note,
    slide.lastInstruction
  ].filter(Boolean).join("\n");
  if (!requirements.trim()) {
    throw new Error(`第 ${slide.slideIndex} 页没有可提交的美化要求。请先填写整套或本页修改要求，再开始生成。`);
  }
  // 这里刻意不再拼接原页文字、前后页文字或任何预设画面规则。
  // 原页 PNG 已作为 /images/edits 的唯一视觉与内容参考；文本只来自用户写入/勾选的要求。
  return requirements;
}

async function prepareRun(run) {
  run = await writeRun(run, { status: "planning", error: "" });
  const sourcePath = path.join(documentRoot, path.basename(run.sourceStoredName));
  // 原页 PNG 是美化重绘的必需输入，而不是可关闭的仅供预览附件。
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
  const extracted = run.slides?.length ? run.slides : await extractPptxSlides(run.sourceStoredName);
  const slides = extracted.map(slide => ({
    ...slide,
    note: pageNoteFor(slide.slideIndex, run.pageNotes)
  }));
  return writeRun(run, {
    status: "source_ready",
    pageCount: slides.length,
    slides,
    sourceSnapshot,
    error: ""
  });
}

async function generateSlideAsset(run, slide) {
  const prompt = slidePrompt(run, slide);
  let normalized;
  try {
    const sourcePage = await sourcePageForSlide(run, slide);
    const raw = await openAiImage(prompt, sourcePage);
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

async function sourcePageForSlide(run, slide) {
  const sourcePage = run.sourceSnapshot?.pages?.find(item => Number(item.pageIndex) === Number(slide.slideIndex));
  if (!sourcePage?.storedName) {
    throw new Error(`第 ${slide.slideIndex} 页缺少原始页面 PNG，不能改为纯文字生图。请重新确认任务以生成源页图片。`);
  }
  const sourcePath = path.join(polishRunRoot, path.basename(run.id), "source-pages", path.basename(sourcePage.storedName));
  try {
    return {
      buffer: await readFile(sourcePath),
      name: `source-page-${slide.slideIndex}.png`
    };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      throw new Error(`第 ${slide.slideIndex} 页的原始页面 PNG 已丢失，不能改为纯文字生图。请重新确认任务以生成源页图片。`);
    }
    throw error;
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
    if (latest.status === "cancelled") return latest;
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

/**
 * 并行调度器（PPT_POLISH_PARALLEL_RUNS=1 时才用）。
 *
 * 串行版 tick() 一次只挑一个任务，而且要 await 完整个 processRun（可能几十页）才轮到下一个；
 * 于是「第一个任务没画完，第二个任务根本不会开始」。
 * 这里改成：每轮挑最多 parallelRunLimit 个任务，各自在后台跑；
 * inFlight 保证同一个任务不会被重复认领（同一页的重复计费由 staleGeneratingMs 与
 * run 文件里的 slides 状态兜底）。
 */
const inFlight = new Map();

function launchRun(run) {
  if (inFlight.has(run.id)) return;
  const promise = processRun(run)
    .catch(error => { console.error(`PPT polish run ${run.id} failed:`, error); })
    .finally(() => { inFlight.delete(run.id); });
  inFlight.set(run.id, promise);
}

async function tickParallel() {
  const activeStatuses = new Set(["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"]);
  const runs = (await listRuns()).filter(item => activeStatuses.has(item.status) && canProcessRun(item));
  const selected = runs.slice(0, parallelRunLimit);
  if (!selected.length) {
    await writeWorkerHeartbeat(parallelRunsEnabled ? "parallel-idle" : "idle");
    return;
  }
  for (const run of selected) launchRun(run);
  await writeWorkerHeartbeat(`parallel:${inFlight.size}/${parallelRunLimit}`);
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
console.log(
  parallelRunsEnabled
    ? `PPT polish parallel mode ON: 最多同时推进 ${parallelRunLimit} 个任务，全局最多 ${globalImageConcurrency} 张图同时生成。`
    : "PPT polish parallel mode OFF: 一次只处理一个任务（设 PPT_POLISH_PARALLEL_RUNS=1 打开）。"
);
// PPT 转 PNG 依赖外部程序 pdftoppm。启动时就把结果打出来：
// 这个报错以前只在任务跑到一半时才出现，而且原文是 "spawn pdftoppm ENOENT"，很难定位。
{
  const pdfToPpm = process.env.PDFTOPPM_PATH || "pdftoppm";
  const probe = spawnSync(pdfToPpm, ["-v"], { stdio: "ignore", windowsHide: true });
  const available = !probe.error && probe.status === 0;
  console.log(
    available
      ? `PPT 转 PNG: 可用（${pdfToPpm}）`
      : `PPT 转 PNG: 不可用 —— 找不到 ${pdfToPpm}。请在 .env 里把 PDFTOPPM_PATH 设为 pdftoppm.exe 的绝对路径后重启本脚本。`
  );
}
await writeWorkerHeartbeat("started");
startWorkerHeartbeat();
for (;;) {
  try {
    await (parallelRunsEnabled ? tickParallel() : tick());
  } catch (error) {
    console.error("PPT polish worker tick failed:", error);
  }
  await sleep(pollMs);
}
