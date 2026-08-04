import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
const root = process.cwd();
import { aiImageConfig, aiTextConfig, createServiceFetch, imageGenerationBody, requireImageEdits, requireImageService, requireTextService, textEndpoint, textFromResponse as textFromServiceResponse, textRequestBody } from "./ai-service-client.mjs";
import { cleanBackgroundSkill, masterRenderSkill, partCutoutSkill, partDecompositionSkill, rebuildAlignmentSkill, textArtCutoutSkill } from "./design-agent-skills.mjs";

loadEnv();

const db = new PrismaClient();
const workspaceRoot = path.join(root, "uploads", "employee-workspace");
const imageRoot = path.join(workspaceRoot, "images");
const referenceRoot = path.join(workspaceRoot, "references");
const projectCutoutSkillPath = path.join(root, "\u62a0\u56fe\u51c6\u5907\u5de5\u4f5cskill", "skill.txt");
const arkEndpoint = process.env.ARK_RESPONSES_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/responses";
const deepseekModel = process.env.DEEPSEEK_TEXT_MODEL || "deepseek-v4-pro-260425";
const doubaoVisionModel = process.env.DOUBAO_VISION_MODEL || process.env.DOUBAO_TEXT_MODEL || "doubao-seed-2-0-pro-260215";
const textService = aiTextConfig();
const imageService = aiImageConfig();
const textRequest = createServiceFetch(textService);
const imageRequest = createServiceFetch(imageService);
const openAiImageModel = imageService.model;
const openAiImageSizes = [imageService.size];
const openAiPrimaryImageSize = openAiImageSizes[0] || "1536x1024";
const pollMs = Math.max(1000, Number(process.env.DESIGN_AGENT_POLL_MS || 2500));
const workerHeartbeatPath = path.join(root, ".next-dev", "design-agent-worker-heartbeat.json");
let cachedProjectCutoutSkill = null;
let workerHeartbeatState = "booting";
let workerHeartbeatTimer = null;

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
function projectCutoutPreparationSkill() {
  if (cachedProjectCutoutSkill !== null) return cachedProjectCutoutSkill;
  try {
    cachedProjectCutoutSkill = readFileSync(projectCutoutSkillPath, "utf8").trim();
  } catch {
    cachedProjectCutoutSkill = "";
  }
  return cachedProjectCutoutSkill;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function nowName(extension = "png") { return `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`; }
function imageMime(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  return ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
}
function safeJson(value, fallback) { try { return JSON.parse(value); } catch { return fallback; } }
function textFromResponse(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  const chunks = result?.output?.flatMap(item => item.content || []).map(item => item.text || item.value || "").filter(Boolean);
  return chunks?.join("\n").trim() || "";
}
function providerError(result, fallback) { return result?.error?.message || result?.message || fallback; }
function providerHttpError(provider, response, result, fallback) {
  return new Error(`${provider} API error (${response.status}): ${providerError(result, fallback)}`);
}
function jsonFromModel(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("妯″瀷娌℃湁杩斿洖鍙敤鐨勭増寮?JSON");
  return JSON.parse(fenced.slice(start, end + 1));
}
function compactBriefTitle(brief) {
  const raw = String(brief || "").replace(/\s+/g, " ").trim();
  const named = raw.match(/(?:main title|title|标题|主题|名称)[:：\s"“”']+([^,，。；;\n"“”']{2,28})/i)?.[1]
    || raw.match(/["“”'《](.{2,28})["“”'》]/)?.[1];
  if (named) return named.trim();
  return raw
    .replace(/PPT|ppt|cover|slide|presentation|页面|封面|设计|生成|美化|帮我|请你/g, " ")
    .split(/[,，。；;\n]/)
    .map(item => item.trim())
    .find(item => item.length >= 2)?.slice(0, 22) || "智能视觉方案";
}
function looksLikePlaceholder(value) {
  const text = String(value || "").trim();
  return !text
    || /^(PPT\s*)?(title|subtitle|text|headline|placeholder|xxx|xxxx)$/i.test(text)
    || /主标题|副标题|请输入|待补充|汇报人|所属部门|汇报日期/.test(text);
}
function cleanDesignText(value, fallback, max = 60) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const safeFallback = String(fallback || "").replace(/\s+/g, " ").trim();
  return (looksLikePlaceholder(text) ? safeFallback : text).slice(0, max);
}
function briefBullets(brief) {
  const items = String(brief || "")
    .split(/[。；;\n]/)
    .map(item => item.replace(/^\d+[.、\s]*/, "").trim())
    .filter(item => item.length >= 6 && !looksLikePlaceholder(item))
    .slice(0, 3)
    .map(item => item.slice(0, 42));
  return items.length ? items : ["突出核心主题", "强化视觉层级", "保留可编辑结构"];
}
function normalizePlan(value, brief) {
  const plan = value && typeof value === "object" ? value : {};
  const fallbackTitle = compactBriefTitle(brief);
  const title = cleanDesignText(plan.title, fallbackTitle, 42);
  const subtitle = cleanDesignText(plan.subtitle, "专业呈现，清晰传达核心价值", 80);
  const palette = Array.isArray(plan.palette) ? plan.palette.filter(color => /^#[0-9A-Fa-f]{6}$/.test(String(color))).slice(0, 4) : [];
  const body = Array.isArray(plan.body)
    ? plan.body.map(item => cleanDesignText(item, "", 42)).filter(Boolean).filter(item => !looksLikePlaceholder(item)).slice(0, 3)
    : [];
  return {
    title: title || "PPT 美化方案",
    subtitle,
    palette: palette.length >= 2 ? palette : ["#092D66", "#1B73D1", "#F5B544", "#F3F7FC"],
    accentLabel: cleanDesignText(plan.accentLabel, "WZLCF DESIGN", 22),
    body: body.length ? body : briefBullets(brief),
    pageType: ["cover", "section", "content", "comparison", "timeline"].includes(String(plan.pageType)) ? String(plan.pageType) : "cover",
    composition: String(plan.composition) === "hero-left-text-right" ? "hero-left-text-right" : "text-left-hero-right",
    heroSubject: String(plan.heroSubject || "与主题相关的单一主视觉对象").slice(0, 260),
    backgroundDirection: String(plan.backgroundDirection || "低饱和、干净、有空间层次的氛围背景；不含主体、文字或信息卡").slice(0, 900),
    visualDirection: String(plan.visualDirection || "克制、专业、具有清晰视觉焦点的 16:9 商务演示页").slice(0, 900),
    imageDirection: String(plan.imageDirection || "抽象科技主视觉，留出标题与信息区，不生成可读文字").slice(0, 900),
    requirements: Array.isArray(plan.requirements) ? plan.requirements.map(item => String(item).slice(0, 160)).filter(Boolean).slice(0, 8) : []
  };
}

async function logEvent(runId, stage, status, detail = "") {
  await db.designAgentEvent.create({ data: { runId, stage, status, detail: String(detail).slice(0, 1000) } });
}
async function writeWorkerHeartbeat(state = "idle") {
  workerHeartbeatState = state;
  try {
    await mkdir(path.dirname(workerHeartbeatPath), { recursive: true });
    await writeFile(workerHeartbeatPath, JSON.stringify({ pid: process.pid, state: workerHeartbeatState, updatedAt: new Date().toISOString() }));
  } catch {}
}
function startWorkerHeartbeat() {
  if (workerHeartbeatTimer) return;
  workerHeartbeatTimer = setInterval(() => {
    void writeWorkerHeartbeat(workerHeartbeatState);
  }, 5000);
}
async function setRun(runId, data) { await db.designAgentRun.update({ where: { id: runId }, data }); }
async function ensureRunActive(runId) {
  const run = await db.designAgentRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (run?.status === "cancelled") {
    const error = new Error("任务已取消");
    error.code = "DESIGN_AGENT_CANCELLED";
    throw error;
  }
}
async function ensureDirs() { await Promise.all([mkdir(imageRoot, { recursive: true }), mkdir(referenceRoot, { recursive: true })]); }
async function referenceBuffer(reference) {
  if (reference.generatedImage) {
    const filePath = path.join(imageRoot, path.basename(reference.generatedImage.storedName));
    return { buffer: await readFile(filePath), name: reference.generatedImage.storedName, mime: imageMime(reference.generatedImage.storedName) };
  }
  if (!reference.storedName) throw new Error("参考图文件不存在");
  const filePath = path.join(referenceRoot, path.basename(reference.storedName));
  return { buffer: await readFile(filePath), name: reference.storedName, mime: imageMime(reference.storedName) };
}
async function arkResponse(model, content) {
  if (!process.env.ARK_API_KEY) throw new Error("尚未配置 ARK_API_KEY");
  const response = await fetch(arkEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ARK_API_KEY}` },
    body: JSON.stringify({ model, input: [{ role: "user", content }] })
  });
  const result = await response.json();
  if (!response.ok) throw providerHttpError("ARK", response, result, "ARK model call failed");
  const text = textFromResponse(result);
  if (!text) throw new Error("鏂硅垷妯″瀷娌℃湁杩斿洖鍙鍐呭");
  return text;
}
async function analyzeVision(references, brief) {
  const content = [];
  for (const reference of references) {
    const file = await referenceBuffer(reference);
    content.push({ type: "input_image", image_url: `data:${file.mime};base64,${file.buffer.toString("base64")}` });
  }
  content.push({ type: "input_text", text: `Analyze these references for PPT visual direction. Employee brief: ${brief}\nReturn JSON only: {"style":"","palette":["#RRGGBB"],"layout":"","visualFocus":"","avoid":[""],"keywords":[""]}. Do not copy names, phone numbers, school names, logos or sensitive text from the images.` });
  const text = await arkResponse(doubaoVisionModel, content);
  const parsed = safeJson(text.match(/\{[\s\S]*\}/)?.[0] || "{}", {});
  return {
    style: String(parsed.style || "professional presentation style"),
    palette: Array.isArray(parsed.palette) ? parsed.palette.filter(color => /^#[0-9A-Fa-f]{6}$/.test(String(color))).slice(0, 4) : [],
    layout: String(parsed.layout || "clear title and visual focus layout"),
    visualFocus: String(parsed.visualFocus || "highlight the core topic"),
    avoid: Array.isArray(parsed.avoid) ? parsed.avoid.map(String).slice(0, 6) : [],
    keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).slice(0, 8) : []
  };
}
async function makePlan(run, vision) {
  const prompt = `You are WZLCF's senior PPT art director. Convert the employee brief into one editable 16:9 PPT production blueprint, not a generic image prompt.
Order: ${run.service.title}
Employee brief: ${run.brief}
Vision analysis: ${JSON.stringify(vision)}
Return JSON only, no Markdown:
{"pageType":"cover|section|content|comparison|timeline","composition":"text-left-hero-right|hero-left-text-right","title":"","subtitle":"","palette":["#RRGGBB","#RRGGBB"],"accentLabel":"","body":["","",""],"heroSubject":"single subject description","backgroundDirection":"background layer with no text or subject","visualDirection":"overall page direction","imageDirection":"hero image composition/material/lighting","requirements":["important constraints from brief"]}`;
  let text = await arkResponse(deepseekModel, [{ type: "input_text", text: prompt }]);
  try { return normalizePlan(jsonFromModel(text), run.brief); } catch {
    text = await arkResponse(deepseekModel, [{ type: "input_text", text: `${prompt}\nYour previous answer was not valid JSON. Return only the corrected JSON object.` }]);
    return normalizePlan(jsonFromModel(text), run.brief);
  }
}
function visualPrompt(plan, vision, mode) {
  return `Create one premium isolated presentation hero asset, not a complete slide and not a layout. Subject: ${plan.heroSubject}. Visual direction: ${plan.visualDirection}. Subject rendering: ${plan.imageDirection}. Palette: ${plan.palette.join(", ")}. ${mode === "mixed" ? `Use supplied references only for non-identifying mood, composition and color; do not copy them. Visual analysis: ${vision.style}; ${vision.layout}.` : "Create a fresh original asset from the production blueprint."} Include exactly one coherent visual subject with high-end commercial key-visual quality, crisp detail, elegant lighting, clean silhouette, and no cheap stock-template feeling. Do not add title text, letters, numbers, logos, watermarks, UI panels, cards, labels, borders, frames, charts, or a complete presentation page. Only include vehicles, robots, products, or characters when they are explicitly part of the subject. Keep the full subject visible with clean margins and separable edges for placement in an editable PPT.`;
}
function backgroundPrompt(plan, vision, mode) {
  return `Create an original 16:9 premium presentation background layer only. This is not a finished slide. Background direction: ${plan.backgroundDirection}. Overall mood: ${plan.visualDirection}. Palette: ${plan.palette.join(", ")}. ${mode === "mixed" ? `Use supplied references only as non-identifying inspiration for palette, lighting and atmosphere. Visual analysis: ${vision.style}; ${vision.layout}.` : "Use the text production blueprint only."} The result must be a fully opaque atmospheric canvas with generous quiet space, cinematic depth, subtle gradients, refined particles or texture only when useful, and no generic blue PowerPoint template look. Absolutely no text, letters, numbers, logos, watermarks, people, robots, products, vehicles, cards, panels, frames, borders, iconography, charts, title effects, or focal subjects. Do not leave transparent/checkerboard areas. Keep visual texture subtle so editable PPT text remains readable.`;
}
function summaryBackgroundPrompt(plan, vision) {
  const palette = (vision.palette?.length ? vision.palette : plan.palette).join(", ");
  return `Create an original opaque 16:9 presentation background only. Use only this neutral visual summary: mood ${vision.style}; composition atmosphere ${vision.layout}; palette ${palette}; background direction ${plan.backgroundDirection}. No readable text, logos, people, products, robots, vehicles, cards, frames, panels, borders, icons, charts or focal subjects. No transparency.`;
}
function summaryHeroPrompt(plan, vision) {
  const palette = (vision.palette?.length ? vision.palette : plan.palette).join(", ");
  return `Create one original isolated presentation hero asset: ${plan.heroSubject}. Use only this neutral visual summary: mood ${vision.style}; palette ${palette}; rendering ${plan.imageDirection}. Do not include readable text, logos, watermarks, UI, cards, panels, borders, a complete slide, unrelated subjects, or cropped-off body parts. Keep the full subject clearly separated from its surroundings.`;
}
function multipartBody(fields, files) {
  const boundary = `----WzlcFDesign${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  const cleanHeaderValue = (value) => String(value).replace(/[\r\n"]/g, "_");
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
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
}
async function toContactSheet(files) {
  const tileWidth = 720;
  const tileHeight = 460;
  const columns = Math.min(3, files.length);
  const rows = Math.ceil(files.length / columns);
  const tiles = await Promise.all(files.map(async (file, index) => {
    const label = `<svg width="${tileWidth}" height="${tileHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="52" height="52" x="14" y="14" rx="14" fill="#0d2c59"/><text x="40" y="50" text-anchor="middle" font-family="Arial" font-size="28" fill="white">${index + 1}</text></svg>`;
    const image = await sharp(file.buffer).resize(tileWidth, tileHeight, { fit: "contain", background: "#eef3f9" }).png().toBuffer();
    return { input: image, left: (index % columns) * tileWidth, top: Math.floor(index / columns) * tileHeight, blend: "over", overlay: label };
  }));
  const canvas = sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 4, background: "#eef3f9" } });
  let output = canvas;
  for (const tile of tiles) {
    output = output.composite([{ input: tile.input, left: tile.left, top: tile.top }, { input: Buffer.from(tile.overlay), left: tile.left, top: tile.top }]);
  }
  return await output.png().toBuffer();
}
async function openAiImageRaw(plan, vision, mode, references, promptOverride = "") {
  requireImageService(imageService);
  const prompt = promptOverride || visualPrompt(plan, vision, mode);
  const headers = { Authorization: `Bearer ${imageService.apiKey}` };
  let response;

  if (mode === "mixed" && references.length) {
    requireImageEdits(imageService);
    const orderedReferences = [...references].sort((a, b) => {
      const primary = Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
      if (primary) return primary;
      return Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    });
    const files = await Promise.all(orderedReferences.map(referenceBuffer));
    const primary = multipartBody(
      { model: openAiImageModel, prompt, n: "1", size: openAiPrimaryImageSize },
      files.map((file, index) => ({
        field: files.length === 1 ? "image" : "image[]",
        buffer: file.buffer,
        name: `reference-${index + 1}.${file.name.split(".").pop() || "png"}`,
        mime: file.mime
      }))
    );
    response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
      method: "POST",
      headers: { ...headers, "Content-Type": primary.contentType },
      body: primary.body
    });
    let result = safeJson(await response.text(), {});
    if (!response.ok && files.length > 1 && !isOpenAiSafetyRejection(result)) {
      const contactSheet = await toContactSheet(files);
      const fallback = multipartBody(
        { model: openAiImageModel, prompt: `${prompt}\nThe supplied image is a numbered reference board. Consider every tile.`, n: "1", size: openAiPrimaryImageSize },
        [{ field: "image", buffer: contactSheet, name: "all-references.png", mime: "image/png" }]
      );
      response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
        method: "POST",
        headers: { ...headers, "Content-Type": fallback.contentType },
        body: fallback.body
      });
      result = safeJson(await response.text(), {});
    }
    if (!response.ok || !result.data?.[0]) throw providerHttpError(imageService.serviceName, response, result, "图片中转生成失败");
    return imageBufferFromServiceResult(result.data[0]);
  }

  response = await imageRequest(`${imageService.baseUrl}/images/generations`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(imageGenerationBody(imageService, prompt))
  });
  const result = safeJson(await response.text(), {});
  if (!response.ok || !result.data?.[0]) throw providerHttpError(imageService.serviceName, response, result, "图片中转生成失败");
  return imageBufferFromServiceResult(result.data[0]);
}

async function imageBufferFromServiceResult(image) {
  if (image.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image.url) {
    const download = await imageRequest(image.url, {});
    if (!download.ok) throw new Error(`${imageService.serviceName} 生成图下载失败`);
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error(`${imageService.serviceName} 没有返回图片内容`);
}
function isOpenAiSafetyRejection(error) {
  const message = error && typeof error === "object" && !(error instanceof Error)
    ? providerError(error, "")
    : error instanceof Error ? error.message : String(error);
  return /rejected by the safety system|safety system|safety policy/i.test(message);
}
function summaryVisualPrompt(plan, vision) {
  const palette = (vision.palette?.length ? vision.palette : plan.palette).join(", ");
  return `Create an original 16:9 presentation slide hero visual only. Do not use, reproduce, or infer any supplied reference image, logo, brand, readable text, watermark, phone number, person identity, character, product, or copyrighted artwork. Use only this neutral style summary: professional presentation mood ${vision.style}; composition ${vision.layout}; visual emphasis ${vision.visualFocus}; palette ${palette}. Visual direction: ${plan.visualDirection}. Image direction: ${plan.imageDirection}. Leave generous clean space for editable PPT title and content blocks.`;
}
function readableOpenAiFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof Error && error.name === "AbortError") return new Error("OpenAI 图片生成等待超过 5 分钟，已停止本次请求；请稍后重试");
  if (/fetch failed|network|connect|socket|econn|enotfound/i.test(message)) return new Error(`无法连接 OpenAI 图片服务：${message}`);
  return error instanceof Error ? error : new Error(message);
}
function employeeFacingFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/safety system|safety policy/i.test(message)) return "参考图或提示词触发 OpenAI 安全审核，请更换参考图或改用更通用的原创描述。";
  if (/超过 5 分钟|timeout|timed out/i.test(message)) return "OpenAI 图片生成超时，请稍后重试。";
  if (/Techsz|TECHSZ|佐糖|X-API-KEY/i.test(message)) {
    if (/quota|exceeded|积分|额度|insufficient/i.test(message)) return "佐糖抠图额度或积分不足，请补充额度或更换 TECHSZ_API_KEY。";
    if (/401|403|api key|unauthorized|forbidden/i.test(message)) return "佐糖抠图服务授权异常，请检查 TECHSZ_API_KEY 配置。";
    return "佐糖抠图服务暂时不可用，已保留 OpenAI 准备图供人工确认。";
  }
  if (/无法连接 OpenAI|OpenAI API error/i.test(message) && /fetch failed|network|connect|socket|econn|enotfound/i.test(message)) return "暂时无法连接 OpenAI 图片服务，请检查网络或代理后重试。";
  if (/OpenAI API error/i.test(message) && /insufficient_quota|quota|billing|credits|balance/i.test(message)) return "OpenAI API 额度或余额不足，请检查 API 计费与额度。";
  if (/OpenAI API error/i.test(message) && /rate limit|too many requests|429/i.test(message)) return "OpenAI 请求较多，请稍后再试。";
  if (/OpenAI API error/i.test(message) && /model_not_found|not have access|does not have access|not authorized to access model|permission|forbidden|403/i.test(message)) return "OpenAI 模型或项目权限异常，请检查模型、Project 与组织权限配置。";
  if (/OpenAI API error/i.test(message) && /401|invalid_api_key|incorrect api key|api key|unauthorized/i.test(message)) return "OpenAI 服务端授权异常，请检查 API Key 配置。";
  if (/fetch failed|network|connect|socket|econn|enotfound/i.test(message)) return "暂时无法连接外部图片服务，请检查网络或代理后重试。";
  if (/rate limit|too many requests|429/i.test(message)) return "外部图片服务请求较多，请稍后再试。";
  return "图片暂未生成成功，请稍后重试。";
}
function safeFailureDetail(error) {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .slice(0, 240);
}
async function openAiImage(plan, vision, mode, references, onStage = async () => {}, configuration = {}) {
  const stage = String(configuration.stage || "image");
  const targetName = String(configuration.targetName || "主视觉预览");
  const initialPrompt = String(configuration.initialPrompt || visualPrompt(plan, vision, mode));
  const fallbackPrompt = String(configuration.fallbackPrompt || summaryVisualPrompt(plan, vision));
  if (mode !== "mixed" || !references.length) {
    await onStage(`${stage}_text`, "running", `OpenAI 正在生成${targetName}`);
    try {
      return { buffer: await openAiImageRaw(plan, vision, mode, references, initialPrompt), finalPrompt: initialPrompt, usedSafetyFallback: false };
    } catch (error) {
      throw readableOpenAiFailure(error);
    }
  }

  await onStage(`${stage}_reference`, "running", `OpenAI 正在读取参考图并生成${targetName}`);
  try {
    return { buffer: await openAiImageRaw(plan, vision, mode, references, initialPrompt), finalPrompt: initialPrompt, usedSafetyFallback: false };
  } catch (error) {
    if (!isOpenAiSafetyRejection(error)) throw readableOpenAiFailure(error);
  }

  await onStage(`${stage}_safety_fallback`, "running", "参考图触发 OpenAI 安全审核，正在移除原图并保留风格摘要");
  await onStage(`${stage}_summary_retry`, "running", `OpenAI 正在根据参考图风格摘要重新生成${targetName}，不再传递原始参考图`);
  try {
    return { buffer: await openAiImageRaw(plan, vision, "text", [], fallbackPrompt), finalPrompt: fallbackPrompt, usedSafetyFallback: true };
  } catch (error) {
    if (isOpenAiSafetyRejection(error)) {
      throw new Error("OpenAI 对参考图和风格摘要两次安全审核均未通过。请改用文生图模式，或移除可能包含 Logo、人物、影视角色或版权内容的参考图后重试。");
    }
    throw readableOpenAiFailure(error);
  }
}
function safeSvgText(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function validColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || "")) ? String(value) : fallback;
}
async function normalizeBackgroundAsset(buffer, plan) {
  const backdrop = validColor(plan.palette?.[0], "#092D66");
  return sharp(buffer)
    .rotate()
    .flatten({ background: backdrop })
    .resize(1920, 1080, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
}
async function normalizeHeroAsset(buffer) {
  return sharp(buffer)
    .rotate()
    .resize(900, 1260, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}
async function composeDesignPreview(plan, background, hero) {
  const navy = validColor(plan.palette?.[0], "#092D66");
  const blue = validColor(plan.palette?.[1], "#1B73D1");
  const gold = validColor(plan.palette?.[2], "#F5B544");
  const paper = validColor(plan.palette?.[3], "#F3F7FC");
  const heroLeft = plan.composition === "hero-left-text-right";
  const contentX = heroLeft ? 1040 : 135;
  const heroX = heroLeft ? 95 : 1050;
  const heroTop = 190;
  const title = safeSvgText(plan.title);
  const subtitle = safeSvgText(plan.subtitle);
  const accent = safeSvgText(plan.accentLabel);
  const cards = (plan.body || []).slice(0, 3).map((item, index) => {
    const y = 705 + index * 82;
    return `<g opacity=".94"><rect x="${contentX}" y="${y}" width="560" height="58" rx="17" fill="#04152D" fill-opacity=".40" stroke="${blue}" stroke-opacity=".34"/><circle cx="${contentX + 29}" cy="${y + 29}" r="5" fill="${gold}"/><text x="${contentX + 56}" y="${y + 38}" font-family="Microsoft YaHei, Arial" font-size="23" font-weight="650" fill="${paper}">${safeSvgText(item)}</text></g>`;
  }).join("");
  const lineX = heroLeft ? 975 : 930;
  const overlay = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="textScrim" x1="0" x2="1">
        <stop offset="0" stop-color="${navy}" stop-opacity="${heroLeft ? ".08" : ".72"}"/>
        <stop offset=".55" stop-color="${navy}" stop-opacity=".40"/>
        <stop offset="1" stop-color="${navy}" stop-opacity="${heroLeft ? ".72" : ".08"}"/>
      </linearGradient>
      <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#textScrim)"/>
    <path d="M${contentX} 146 H${contentX + 510}" stroke="${blue}" stroke-opacity=".55" stroke-width="2"/>
    <circle cx="${contentX}" cy="146" r="5" fill="${gold}" filter="url(#softGlow)"/>
    <text x="${contentX}" y="116" font-family="Microsoft YaHei, Arial" font-size="22" font-weight="700" fill="${gold}" letter-spacing="5">${accent}</text>
    <text x="${contentX}" y="270" font-family="Microsoft YaHei, Arial" font-size="78" font-weight="800" fill="${paper}">${title}</text>
    <text x="${contentX}" y="350" font-family="Microsoft YaHei, Arial" font-size="30" fill="#DDEBFA" opacity=".92">${subtitle}</text>
    <rect x="${lineX}" y="206" width="3" height="525" rx="2" fill="${gold}" fill-opacity=".72"/>
    ${cards}
  </svg>`;
  const preparedHero = await sharp(hero)
    .resize(690, 720, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp(background)
    .resize(1920, 1080, { fit: "cover", position: "attention" })
    .composite([{ input: preparedHero, left: heroX, top: heroTop }, { input: Buffer.from(overlay), left: 0, top: 0 }])
    .png()
    .toBuffer();
}
async function produceDesignAssets(run, plan, vision, correction = "", stagePrefix = "") {
  const adjustedPlan = correction ? {
    ...plan,
    backgroundDirection: `${plan.backgroundDirection}. Correct these issues: ${correction}`.slice(0, 1100),
    imageDirection: `${plan.imageDirection}. Correct these issues: ${correction}`.slice(0, 1100)
  } : plan;
  const background = await openAiImage(
    adjustedPlan,
    vision,
    run.generationMode,
    run.references,
    async (stage, status, detail) => logEvent(run.id, `${stagePrefix}${stage}`, status, detail),
    { stage: "background", targetName: "无字背景层", initialPrompt: backgroundPrompt(adjustedPlan, vision, run.generationMode), fallbackPrompt: summaryBackgroundPrompt(adjustedPlan, vision) }
  );
  const hero = await openAiImage(
    adjustedPlan,
    vision,
    "text",
    [],
    async (stage, status, detail) => logEvent(run.id, `${stagePrefix}${stage}`, status, detail),
    { stage: "hero", targetName: "独立主视觉", initialPrompt: visualPrompt(adjustedPlan, vision, "text"), fallbackPrompt: summaryHeroPrompt(adjustedPlan, vision) }
  );
  return {
    plan: adjustedPlan,
    background: await normalizeBackgroundAsset(background.buffer, adjustedPlan),
    hero: await normalizeHeroAsset(hero.buffer),
    finalPrompt: `${background.finalPrompt}\n\n--- HERO ASSET ---\n${hero.finalPrompt}`,
    usedSafetyFallback: background.usedSafetyFallback || hero.usedSafetyFallback
  };
}
async function persistDesignCandidate(run, assets) {
  const backgroundStoredName = nowName("png");
  const heroStoredName = nowName("png");
  const previewStoredName = nowName("png");
  await writeFile(path.join(imageRoot, backgroundStoredName), assets.background);
  await writeFile(path.join(imageRoot, heroStoredName), assets.hero);
  const plan = {
    ...assets.plan,
    assetFiles: { backgroundStoredName, heroStoredName, renderMode: "separate-background-and-hero" }
  };
  const preview = await composeDesignPreview(plan, assets.background, assets.hero);
  await writeFile(path.join(imageRoot, previewStoredName), preview);
  const job = await db.generationJob.create({ data: { prompt: assets.finalPrompt, status: "completed", provider: "openai", model: openAiImageModel, serviceId: run.serviceId, employeeId: run.employeeId } });
  const generatedImage = await db.generatedImage.create({ data: { jobId: job.id, storedName: previewStoredName, originalUrl: null } });
  return { plan, preview, job, generatedImage, usedSafetyFallback: assets.usedSafetyFallback };
}
async function normalizeSlidePng(buffer, background = "#08244f") {
  return sharp(buffer)
    .rotate()
    .flatten({ background })
    .resize(1920, 1080, { fit: "contain", background })
    .png()
    .toBuffer();
}
function masterRenderPrompt(plan, vision, mode, brief) {
  const palette = (vision.palette?.length ? vision.palette : plan.palette).join(", ");
  return `Create one complete, high-end 16:9 PowerPoint slide design as a polished presentation sample PNG. Treat the following employee brief as the source of truth and follow it directly, without replacing it with a generic template: ${brief}

Structured design intent: ${JSON.stringify({
    pageType: plan.pageType,
    visualDirection: plan.visualDirection,
    imageDirection: plan.imageDirection,
    requirements: plan.requirements,
    palette
  })}

${mode === "mixed" ? `Use the supplied reference images only for broad mood, palette, layout rhythm and material quality. Do not copy private logos, names, phone numbers or exact customer imagery. Vision summary: ${JSON.stringify(vision)}.` : "No reference images are required; create a fresh original presentation sample from the brief."}

Important production rules:
- This is the master visual truth for later layer reconstruction, so compose the whole slide beautifully in one image.
- Use a professional B2B presentation aesthetic: strong hierarchy, generous spacing, coherent light, premium technology/business polish.
- If the brief asks for placeholder text, render it as part of the slide sample. Do not invent extra long paragraphs.
- Do not create cheap blue template blocks, random bullet strips, broken cropped subjects, messy panels, watermarks, or UI screenshots.
- Keep important visual elements separable: clean silhouettes, clear title artwork, distinct cards/panels, and a readable layout.
- Output only the finished slide image.`;
}
function cleanBackgroundPromptFromMaster(plan, vision, brief) {
  const palette = (vision.palette?.length ? vision.palette : plan.palette).join(", ");
  return `Using the provided PPT sample image as style reference, create a clean 16:9 background plate for rebuilding the slide.

Remove all foreground subjects, robots, people, products, trains, title text, subtitles, logos, icons, information cards, panels, labels, numbers, readable text, photo frames, screenshot frames, chart frames, label slots, content containers, summary bars, footer boxes, side title plates and any rectangular frame that marks a content position.
Preserve only the atmospheric background style: color palette (${palette}), broad gradient, subtle particles, code/grid texture, lighting direction, depth and tasteful business/technology mood.

The background must be usable as the bottom layer of an editable PPT page before content modules are placed. It should not contain obvious erased silhouettes, holes, ghost shapes, checkerboard transparency, cards, card outlines, neon panel borders, label backgrounds, title underlines, placeholders, text residue or focal objects.

Original employee brief for style context only: ${brief}
Background direction: ${plan.backgroundDirection || ""}
Return only the clean background image.`;
}
async function openAiEditPng(buffer, prompt, name = "source.png") {
  requireImageEdits(imageService);
  const body = multipartBody(
    { model: openAiImageModel, prompt, n: "1", size: openAiPrimaryImageSize },
    [{ field: "image", buffer, name, mime: "image/png" }]
  );
  const response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${imageService.apiKey}`, "Content-Type": body.contentType },
    body: body.body
  });
  const result = safeJson(await response.text(), {});
  if (!response.ok || !result.data?.[0]) throw providerHttpError(imageService.serviceName, response, result, "图片中转编辑没有返回可用结果");
  const image = result.data[0];
  if (image.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image.url) {
    const download = await imageRequest(image.url, {});
    if (!download.ok) throw new Error(`${imageService.serviceName} 图片编辑结果下载失败`);
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error(`${imageService.serviceName} 图片编辑没有返回图片内容`);
}
// Legacy rebuild helper retained for the later downstream workflow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateCleanBackground(masterBuffer, cleanPrompt) {
  try {
    const edited = await openAiEditPng(masterBuffer, cleanPrompt, "master-render.png");
    return { buffer: edited, prompt: cleanPrompt, usedFallback: false };
  } catch (error) {
    if (isOpenAiSafetyRejection(error)) throw error;
    const fallbackPrompt = `${cleanPrompt}\n\nGenerate from text only if image editing is unavailable. Do not include any foreground subject or text.`;
    const fallback = await openAiImageRaw({ palette: ["#08244f"] }, {}, "text", [], fallbackPrompt);
    return { buffer: fallback, prompt: fallbackPrompt, usedFallback: true, warning: error instanceof Error ? error.message : String(error) };
  }
}
async function persistMasterRebuildCandidate(run, plan, master, cleanBackground, finalPrompt) {
  const masterStoredName = nowName("png");
  const cleanBackgroundStoredName = nowName("png");
  await writeFile(path.join(imageRoot, masterStoredName), master);
  await writeFile(path.join(imageRoot, cleanBackgroundStoredName), cleanBackground);
  const job = await db.generationJob.create({
    data: { prompt: finalPrompt, status: "completed", provider: "openai", model: openAiImageModel, serviceId: run.serviceId, employeeId: run.employeeId }
  });
  const masterImage = await db.generatedImage.create({ data: { jobId: job.id, storedName: masterStoredName, originalUrl: null } });
  const cleanImage = await db.generatedImage.create({ data: { jobId: job.id, storedName: cleanBackgroundStoredName, originalUrl: null } });
  const nextPlan = {
    ...plan,
    assetFiles: {
      renderMode: "master-render-rebuild",
      masterImageId: masterImage.id,
      masterStoredName,
      cleanBackgroundImageId: cleanImage.id,
      cleanBackgroundStoredName
    }
  };
  return { job, masterImage, cleanImage, plan: nextPlan };
}
async function createExplodeRunForMaster(run, masterImageId) {
  const existing = await db.imageExplodeRun.findUnique({ where: { sourceImageId: masterImageId } });
  if (existing) return existing;
  return db.imageExplodeRun.create({
    data: {
      serviceId: run.serviceId,
      employeeId: run.employeeId,
      sourceImageId: masterImageId,
      events: { create: { stage: "queued", status: "queued", detail: "Master Render 已进入旧图片炸开队列" } }
    }
  });
}
async function waitForExplodeRun(runId, timeoutMs = 10 * 60 * 1000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await db.imageExplodeRun.findUnique({
      where: { id: runId },
      include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: true, events: true }
    });
    if (!run) throw new Error("图片炸开任务不存在");
    if (["completed", "failed", "cancelled"].includes(run.status)) return run;
    await sleep(2000);
  }
  return await db.imageExplodeRun.findUnique({
    where: { id: runId },
    include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: true, events: true }
  });
}
async function composeCleanReconstruction(cleanBackgroundBuffer, parts) {
  const composites = [];
  for (const part of parts.filter(item => item.selected && !isPipelinePreviewPart(item) && !shouldSkipPartForRebuild(item) && item.kind !== "background" && !item.textContent && (item.refinedName || item.storedName))) {
    const filePath = path.join(imageRoot, path.basename(part.refinedName || part.storedName));
    if (!existsSync(filePath)) continue;
    const width = Math.max(1, Math.round(part.width * 1920));
    const height = Math.max(1, Math.round(part.height * 1080));
    const source = await readFile(filePath);
    composites.push({
      input: await preparePartForComposite(source, part, width, height),
      left: Math.round(part.x * 1920),
      top: Math.round(part.y * 1080)
    });
  }
  return sharp(cleanBackgroundBuffer).resize(1920, 1080, { fit: "cover" }).composite(composites).png().toBuffer();
}
async function preparePartForComposite(buffer, part, width, height) {
  const exactSourceVariants = ["source-rect-card", "source-panel-fidelity", "source-effect-fidelity", "source-text-fidelity"];
  const exactSource = exactSourceVariants.includes(String(part.variant || ""))
    || exactSourceVariants.includes(String(part.extractMode || ""));
  if (exactSource) {
    return sharp(buffer)
      .resize(width, height, { fit: "fill" })
      .png()
      .toBuffer();
  }
  return fitCutoutToBox(buffer, width, height, isTextLikePart(part));
}
async function fitCutoutToBox(buffer, width, height, textLike = false) {
  const trimmed = await trimTransparentPadding(buffer, textLike ? 0.1 : 0.045).catch(() => buffer);
  return sharp(trimmed)
    .resize(width, height, {
      fit: "contain",
      withoutEnlargement: false,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
}
async function trimTransparentPadding(buffer, paddingRatio = 0.05) {
  const image = sharp(buffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];
      if (alpha <= 3) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return buffer;
  const visibleWidth = right - left + 1;
  const visibleHeight = bottom - top + 1;
  const padX = Math.max(2, Math.round(visibleWidth * paddingRatio));
  const padY = Math.max(2, Math.round(visibleHeight * paddingRatio));
  const extractLeft = Math.max(0, left - padX);
  const extractTop = Math.max(0, top - padY);
  const extractRight = Math.min(info.width - 1, right + padX);
  const extractBottom = Math.min(info.height - 1, bottom + padY);
  return sharp(buffer)
    .extract({
      left: extractLeft,
      top: extractTop,
      width: Math.max(1, extractRight - extractLeft + 1),
      height: Math.max(1, extractBottom - extractTop + 1)
    })
    .png()
    .toBuffer();
}
function partArea(part) {
  const width = Array.isArray(part.box) ? Number(part.box[2]) / 1000 : Number(part.width);
  const height = Array.isArray(part.box) ? Number(part.box[3]) / 1000 : Number(part.height);
  return Math.max(0, width || 0) * Math.max(0, height || 0);
}
function boxIoU(a, b) {
  const ax = Number(a.x), ay = Number(a.y), aw = Number(a.width), ah = Number(a.height);
  const bx = Number(b.x), by = Number(b.y), bw = Number(b.width), bh = Number(b.height);
  const left = Math.max(ax, bx);
  const top = Math.max(ay, by);
  const right = Math.min(ax + aw, bx + bw);
  const bottom = Math.min(ay + ah, by + bh);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = Math.max(0.0001, aw * ah + bw * bh - intersection);
  return intersection / union;
}
function isBackgroundLikePart(part) {
  const text = `${part.label || ""} ${part.kind || ""} ${part.maskHint || ""}`.toLowerCase();
  if (part.rebuildPolicy === "skip") return true;
  if (/(background|backdrop|skyline|city|road|bridge|water|river|sky|solar|energy|facility|facilities|vehicle|car|panel|plate|board|geometry|geometric|landscape|building|buildings|light trail|scene|horizon)/i.test(text)) {
    return true;
  }
  if (/(鑳屾櫙|搴曞浘|搴曟澘|鍑犱綍|闈㈡澘|鍩庡競|澶╅檯绾縷閬撹矾|妗姘撮潰|娌硘澶╃┖|鍏夎建|澶槼鑳絴鑳芥簮|璁炬柦|杞﹁締|姹借溅|寤虹瓚|妤肩兢|鍦烘櫙|鍦板钩绾縷澶у潡)/.test(text)) {
    return true;
  }
  return false;
}
function shouldSkipPartForRebuild(part) {
  if (!part || part.kind === "background") return true;
  if (String(part.variant || "") === "background-owned" || String(part.extractMode || "") === "background-owned") return true;
  if (hasProtectedContent(part)) return false;
  if (part.rebuildPolicy === "skip") return true;
  const area = partArea(part);
  const text = `${part.label || ""} ${part.kind || ""} ${part.maskHint || ""}`.toLowerCase();
  const sceneChunk = /(skyline|city|road|bridge|water|river|solar|energy|facility|facilities|vehicle|car|building|buildings|light trail|scene|鍩庡競|澶╅檯绾縷閬撹矾|妗姘撮潰|娌硘澶槼鑳絴鑳芥簮|璁炬柦|杞﹁締|姹借溅|寤虹瓚|妤肩兢|鍦烘櫙|鍏夎建)/i.test(text);
  return isBackgroundLikePart(part) && area >= (sceneChunk ? 0.08 : 0.18);
}
function isPipelinePreviewPart(part) {
  return ["crop-part", "raw-part-prepared"].includes(String(part?.variant || ""));
}
function isRectCardLikePart(part) {
  if (!part) return false;
  const area = partArea(part);
  const width = Array.isArray(part.box) ? Number(part.box[2]) / 1000 : Number(part.width);
  const height = Array.isArray(part.box) ? Number(part.box[3]) / 1000 : Number(part.height);
  const text = `${part.label || ""} ${part.kind || ""} ${part.maskHint || ""}`.toLowerCase();
  if (/(rect-card|photo-card|image-card|screenshot-card|framed-image|thumbnail|screenshot|photo|picture|image card|framed|thermal|infrared|lidar|radar)/i.test(text)) return true;
  if (containsAny(text, ["\u7167\u7247", "\u56fe\u7247", "\u56fe\u50cf", "\u70ed\u6210\u50cf", "\u7ea2\u5916", "\u96f7\u8fbe", "\u89c6\u89c9\u7167\u7247", "\u622a\u56fe", "\u6846\u56fe", "\u5361\u7247\u56fe", "\u63d2\u56fe"]) && area >= 0.012) return true;
  return area >= 0.025 && width >= 0.08 && height >= 0.05 && /(card|rect-card|photo-card|image-card|framed-image|screenshot-card)/i.test(String(part.kind || ""));
}
function isContentPanelLikePart(part) {
  if (!part) return false;
  const area = partArea(part);
  const text = `${part.label || ""} ${part.kind || ""} ${part.maskHint || ""}`.toLowerCase();
  const kind = String(part.kind || "").toLowerCase();
  if (!/(panel|card|banner|container|footer|label|caption|text-art|title-art)/i.test(kind) && !/(summary|conclusion|info|data|label|caption|footer|banner|panel|container|bar|strip|框|栏|条|总结|结论|标签|底部|信息|数据|面板)/i.test(text)) return false;
  if (!isTextLikePart(part) && !/\d|%|<|>|summary|conclusion|info|data|label|caption|footer|banner|panel|container/i.test(text)) return false;
  return area >= 0.035 && /(panel|container|banner|summary|conclusion|footer|info|data|label|caption|bottom|strip|bar|框|栏|条|总结|结论|标签|底部|信息|数据|面板)/i.test(text);
}
function isEffectLikePart(part) {
  if (!part || isTextLikePart(part) || isLogoLikePart(part) || isRectCardLikePart(part) || isContentPanelLikePart(part)) return false;
  const text = `${part.label || ""} ${part.kind || ""} ${part.maskHint || ""}`.toLowerCase();
  return /(light|glow|beam|spotlight|searchlight|ray|route|path|map pin|pin|marker|line|trail|ring|halo|target|effect|particle)/i.test(text)
    || containsAny(text, ["\u5149\u675f", "\u63a2\u7167", "\u5149\u6548", "\u5149\u7ebf", "\u8def\u7ebf", "\u8def\u5f84", "\u5b9a\u4f4d", "\u56fe\u6807", "\u5149\u5708", "\u5149\u8f68", "\u8fde\u7ebf", "\u6807\u8bb0"]);
}
function hasProtectedContent(part) {
  if (!part || part.kind === "background") return false;
  return isTextLikePart(part) || isLogoLikePart(part) || isRectCardLikePart(part) || isContentPanelLikePart(part) || isEffectLikePart(part);
}
function isLogoLikePart(part) {
  const text = `${part?.label || ""} ${part?.kind || ""} ${part?.maskHint || ""}`.toLowerCase();
  return /(logo|logotype|brand mark|school mark|seal|emblem|badge)/i.test(text)
    || containsAny(text, ["\u6807\u8bc6", "\u6821\u5fbd", "\u5fbd\u6807", "\u5b66\u9662", "\u5b66\u6821", "\u54c1\u724c"]);
}
function isBackgroundOwnedCandidate(part) {
  if (!part || isTextLikePart(part)) return false;
  const text = `${part.label || ""} ${part.kind || ""} ${part.maskHint || ""}`.toLowerCase();
  return /(background|backdrop|frame|border|grid|container|decoration|ornament|line|light|panel|plate|board|geometry|geometric|divider|footer|header|corner|dot|dots|circuit|tech line|blue frame)/i.test(text)
    || containsAny(text, ["\u80cc\u666f", "\u5e95\u56fe", "\u5e95\u677f", "\u8fb9\u6846", "\u6846\u7ebf", "\u5916\u6846", "\u5bb9\u5668", "\u7f51\u683c", "\u70b9\u9635", "\u88c5\u9970", "\u7ebf\u6761", "\u5149\u6548", "\u9762\u677f", "\u5e95\u680f", "\u9876\u90e8", "\u89d2\u6807", "\u79d1\u6280\u7ebf", "\u84dd\u8272\u6846"]);
}
function containsAny(value, terms) {
  return terms.some(term => value.includes(term));
}
async function compareComponentRegions(masterBuffer, cleanBuffer, component) {
  const [masterRegion, cleanRegion] = await Promise.all([
    cropComponentRegion(masterBuffer, component, 0),
    cropComponentRegion(cleanBuffer, component, 0)
  ]);
  const [masterRaw, cleanRaw] = await Promise.all([
    sharp(masterRegion).resize(96, 96, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(cleanRegion).resize(96, 96, { fit: "fill" }).removeAlpha().raw().toBuffer()
  ]);
  let sum = 0;
  let changed = 0;
  const pixels = Math.max(1, masterRaw.length / 3);
  for (let index = 0; index < masterRaw.length; index += 3) {
    const delta = (Math.abs(masterRaw[index] - cleanRaw[index]) + Math.abs(masterRaw[index + 1] - cleanRaw[index + 1]) + Math.abs(masterRaw[index + 2] - cleanRaw[index + 2])) / 3;
    sum += delta;
    if (delta > 20) changed += 1;
  }
  const meanAbsDiff = sum / pixels;
  return {
    similarity: Math.max(0, Math.min(1, 1 - meanAbsDiff / 255)),
    meanAbsDiff,
    changedRatio: changed / pixels
  };
}
function isOwnedByCleanBackground(component, metrics) {
  if (!metrics || isTextLikePart(component)) return false;
  if (isBackgroundOwnedCandidate(component)) return metrics.similarity >= 0.925 && metrics.changedRatio <= 0.2;
  return metrics.similarity >= 0.965 && metrics.changedRatio <= 0.055;
}
function isTextLikePart(part) {
  const text = `${part?.label || ""} ${part?.kind || ""} ${part?.maskHint || ""}`.toLowerCase();
  return Boolean(part?.containsText)
    || /(title|text|wordart|subtitle|caption|footer|letter|typography)/i.test(text)
    || containsAny(text, ["\u6807\u9898", "\u6587\u5b57", "\u5b57\u5e55", "\u526f\u6807\u9898", "\u9875\u811a", "\u5b57\u6548", "\u827a\u672f\u5b57"]);
}
function filterTextOverlaps(rows) {
  const sorted = [...rows].sort((a, b) => (b.confidence - a.confidence) || (partArea(b) - partArea(a)));
  const kept = [];
  const skipped = new Set();
  for (const row of sorted) {
    if (!row.containsText || !row.selected) {
      kept.push(row);
      continue;
    }
    const duplicate = kept.some(existing => existing.containsText && existing.selected && boxIoU(row, existing) > 0.32);
    if (duplicate) {
      row.selected = false;
      row.recommended = false;
      row.extractMode = "openai-smart-text-overlap-skip";
      skipped.add(row.semanticId);
    }
    kept.push(row);
  }
  return { rows, skippedTextIds: [...skipped] };
}
function normalizeEvaluation(value) {
  const raw = value && typeof value === "object" ? value : {};
  const scores = raw.scores && typeof raw.scores === "object" ? raw.scores : {};
  const read = key => Math.max(0, Math.min(100, Number(scores[key]) || 0));
  const normalized = {
    briefFit: read("briefFit"), hierarchy: read("hierarchy"), layout: read("layout"),
    brand: read("brand"), readability: read("readability"), editability: read("editability"),
    fidelity: read("fidelity")
  };
  const weighted = normalized.briefFit * .24 + normalized.hierarchy * .16 + normalized.layout * .20 + normalized.brand * .12 + normalized.readability * .16 + normalized.editability * .06 + normalized.fidelity * .06;
  const reasons = Array.isArray(raw.reasons) ? raw.reasons.map(item => String(item).slice(0, 180)).filter(Boolean).slice(0, 5) : [];
  const corrections = Array.isArray(raw.corrections) ? raw.corrections.map(item => String(item).slice(0, 220)).filter(Boolean).slice(0, 4) : [];
  const critical = Boolean(raw.critical) || normalized.readability < 55 || normalized.layout < 55 || normalized.briefFit < 55;
  return { scores: normalized, totalScore: Math.round(weighted * 10) / 10, reasons, corrections, critical };
}
async function evaluateCandidate(run, imageBuffer, plan, vision, candidateId) {
  if (!process.env.ARK_API_KEY) {
    const fallback = { scores: { briefFit: 75, hierarchy: 75, layout: 75, brand: 75, readability: 75, editability: 75, fidelity: 75 }, totalScore: 75, reasons: ["未配置视觉评估模型，已按固定工作流继续。"], corrections: [], critical: false };
    await db.designAgentEvaluation.create({ data: { runId: run.id, candidateId, stage: "aesthetic", totalScore: fallback.totalScore, scoresJson: JSON.stringify(fallback.scores), reasonsJson: JSON.stringify(fallback.reasons) } });
    return fallback;
  }
  const prompt = `You are a strict presentation design reviewer. Evaluate a 16:9 hero visual against the structured plan. Do not praise it. Return JSON only: {"scores":{"briefFit":0-100,"hierarchy":0-100,"layout":0-100,"brand":0-100,"readability":0-100,"editability":0-100,"fidelity":0-100},"critical":true|false,"reasons":["short Chinese reason"],"corrections":["short concrete correction"]}. A score below 55 means an obvious delivery problem. Detect text-safe-zone obstruction, clutter, weak hierarchy, irrelevant elements, excessive decoration, and visual elements that cannot be reconstructed cleanly. Plan: ${JSON.stringify(plan)}. Visual reference summary: ${JSON.stringify(vision)}. Employee request: ${run.brief}`;
  const text = await arkResponse(doubaoVisionModel, [
    { type: "input_image", image_url: `data:image/png;base64,${imageBuffer.toString("base64")}` },
    { type: "input_text", text: prompt }
  ]);
  const evaluation = normalizeEvaluation(safeJson(text.match(/\{[\s\S]*\}/)?.[0] || "{}", {}));
  await db.designAgentEvaluation.create({ data: { runId: run.id, candidateId, stage: "aesthetic", totalScore: evaluation.totalScore, scoresJson: JSON.stringify(evaluation.scores), reasonsJson: JSON.stringify({ reasons: evaluation.reasons, corrections: evaluation.corrections, critical: evaluation.critical }) } });
  return evaluation;
}
async function preferenceHints(industry) {
  const where = industry
    ? { outcome: "accepted", OR: [{ industry }, { industry: "" }] }
    : { outcome: "accepted" };
  const items = await db.designPreferenceMemory.findMany({ where, orderBy: { createdAt: "desc" }, take: 16 });
  if (!items.length) return [];
  return items.map(item => {
    const signals = safeJson(item.signalsJson, {});
    return {
      industry: item.industry,
      pageType: item.pageType,
      style: item.style,
      palette: safeJson(item.paletteJson, []),
      tone: item.informationTone,
      layout: signals.layout || "",
      heroSubject: signals.heroSubject || "",
      backgroundDirection: signals.backgroundDirection || "",
      score: signals.score || null,
      acceptedAt: item.createdAt
    };
  }).slice(0, 6);
}
async function claimRun() {
  const candidate = await db.designAgentRun.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return null;
  const claimed = await db.designAgentRun.updateMany({ where: { id: candidate.id, status: "queued" }, data: { status: "running", startedAt: new Date(), error: null } });
  if (!claimed.count) return null;
  return await db.designAgentRun.findUnique({ where: { id: candidate.id }, include: { service: true, employee: true, references: { orderBy: { sortOrder: "asc" }, include: { generatedImage: true } } } });
}
// Kept only as an explicit guard for the retired split-background/hero workflow.
// The active smart mode must use processRun() below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function legacyProcessRun(_run) {
  throw new Error("Legacy design-agent workflow is disabled. Use openai-smart-mode-v1.");
}
function clampBatchCount(value) {
  return Math.max(1, Math.min(4, Number(value) || 1));
}
function smartMasterPrompt(run, batchIndex, batchCount) {
  const referenceSummary = (run.references || [])
    .sort((a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)) || Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((reference, index) => `${index + 1}. ${reference.isPrimary ? "PRIMARY" : "secondary"} reference: ${reference.label || reference.source || "image"}`)
    .join("\n");
  const mixedRules = run.generationMode === "mixed" ? `
Mixed mode reference contract:
- The supplied images are direct visual inputs to OpenAI for creating this master image.
- The first supplied image is the PRIMARY reference. Follow its core subject, information intent, rough layout relationships and user-requested content priority.
- Secondary references only provide supporting style, material, atmosphere, composition hints or detail inspiration.
- Generate one new complete 16:9 PPT sample image from the prompt plus references. Do not output a collage, contact sheet, screenshot board, pasted image block, raw reference crop, white selection handles or UI screenshot.
- Do not simply copy the primary reference pixel-for-pixel. Recreate and beautify it as a polished presentation page according to the employee brief.
- If the employee asks to beautify an uploaded page, preserve the page's intended content hierarchy and key visual meaning while improving design quality.
Reference order passed to OpenAI:
${referenceSummary || "(no references)"}
` : `
Text-to-image mode: no reference image is passed to OpenAI; create a fresh original presentation sample from the brief.
`;
  return `${masterRenderSkill}

Employee brief:
${run.brief}

Order context:
${run.service?.title || ""} ${run.service?.category || ""}

${mixedRules}

Candidate ${batchIndex + 1} of ${batchCount}. Make this candidate visually distinct in composition or emphasis, while still following the same brief.
The result must be a finished 16:9 PPT slide sample image. UI text may be stylized as image content because it will be decomposed later. Keep it premium, precise, and presentation-ready.`;
}
// Legacy rebuild helper retained for the later downstream workflow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function smartCleanPrompt(run) {
  return `${cleanBackgroundSkill}

Employee brief for style context only:
${run.brief}

Strict output contract:
- Generate only the empty visual backdrop of the sample page.
- Do not include any text, logo, number, card, photo frame, screenshot frame, label slot, summary bar, footer container, side content plate, blue neon box or rectangular content placeholder.
- If the master image has content frames, remove the whole frame and fill the area with continuous matching background.
- The clean background should look like the slide before titles, cards, labels and content panels were added.

Return only the clean 16:9 background plate.`;
}
async function openAiJsonResponse(content, label) {
  requireTextService(textService);
  const response = await textRequest(textEndpoint(textService), {
    method: "POST",
    headers: { Authorization: `Bearer ${textService.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(textRequestBody(textService, [{ role: "user", content }], { json: true }))
  });
  const result = safeJson(await response.text(), {});
  if (!response.ok) throw providerHttpError(textService.serviceName, response, result, `${label} call failed`);
  const text = textFromServiceResponse(result);
  if (!text) throw new Error(`${label} 娌℃湁杩斿洖鍐呭`);
  return jsonFromModel(text);
}
// Legacy rebuild helper retained for the later downstream workflow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function decomposeMaster(masterBuffer, run) {
  const projectSkill = projectCutoutPreparationSkill();
  const parsed = await openAiJsonResponse([
    { type: "input_image", image_url: `data:image/png;base64,${masterBuffer.toString("base64")}` },
    { type: "input_text", text: `${partDecompositionSkill}\n\nPROJECT CUTOUT PREPARATION SKILL FROM REPOSITORY:\n${projectSkill || "(skill file not found)"}\n\nEmployee brief:\n${run.brief}\n\n${rebuildAlignmentSkill}` }
  ], "OpenAI 闆朵欢鎷嗚В");
  const raw = Array.isArray(parsed.components) ? parsed.components : [];
  const components = raw.map((item, index) => normalizeSmartComponent(item, index)).filter(Boolean);
  if (components.length) return components
    .sort((a, b) => a.zIndex - b.zIndex)
    .map((item, index) => ({ ...item, semanticId: `part-${String(index + 1).padStart(3, "0")}`, zIndex: index + 10 }));
  return [{ semanticId: "part-001", label: "瀹屾暣鍓嶆櫙鍏滃簳", kind: "group", box: [0, 0, 1000, 1000], zIndex: 10, confidence: 0.35, containsText: true, recommended: true, rebuildPolicy: "overlay", maskHint: "full slide foreground" }];
}
function normalizeSmartComponent(item, index) {
  if (!item || typeof item !== "object") return null;
  const box = Array.isArray(item.box) ? item.box.map(Number) : [];
  if (box.length !== 4 || box.some(value => !Number.isFinite(value))) return null;
  const x = Math.max(0, Math.min(995, box[0]));
  const y = Math.max(0, Math.min(995, box[1]));
  const width = Math.max(8, Math.min(1000 - x, box[2]));
  const height = Math.max(8, Math.min(1000 - y, box[3]));
  return {
    semanticId: String(item.semanticId || `part-${String(index + 1).padStart(3, "0")}`),
    label: String(item.label || `闆朵欢 ${index + 1}`).slice(0, 48),
    kind: String(item.kind || "decoration").slice(0, 32),
    box: [x, y, width, height],
    zIndex: Number(item.zIndex) || index + 10,
    confidence: Math.max(0, Math.min(1, Number(item.confidence) || 0.75)),
    containsText: Boolean(item.containsText),
    recommended: item.recommended !== false,
    rebuildPolicy: String(item.rebuildPolicy || "").toLowerCase() === "skip" ? "skip" : "overlay",
    maskHint: String(item.maskHint || item.label || "presentation element").slice(0, 160)
  };
}
async function cropComponent(masterBuffer, component) {
  return cropComponentRegion(masterBuffer, component, isTextLikePart(component) ? 0.14 : 0.08);
}
async function cropComponentRegion(buffer, component, paddingRatio = 0) {
  const metadata = await sharp(buffer).metadata();
  const sourceWidth = metadata.width || 1920;
  const sourceHeight = metadata.height || 1080;
  const [x, y, width, height] = component.box;
  const padX = Math.round((width / 1000) * sourceWidth * paddingRatio);
  const padY = Math.round((height / 1000) * sourceHeight * paddingRatio);
  const rawLeft = Math.round((x / 1000) * sourceWidth);
  const rawTop = Math.round((y / 1000) * sourceHeight);
  const rawWidth = Math.round((width / 1000) * sourceWidth);
  const rawHeight = Math.round((height / 1000) * sourceHeight);
  const left = Math.max(0, Math.min(sourceWidth - 1, rawLeft - padX));
  const top = Math.max(0, Math.min(sourceHeight - 1, rawTop - padY));
  const right = Math.min(sourceWidth, rawLeft + rawWidth + padX);
  const bottom = Math.min(sourceHeight, rawTop + rawHeight + padY);
  const cropWidth = Math.max(1, right - left);
  const cropHeight = Math.max(1, bottom - top);
  return sharp(buffer).extract({ left, top, width: cropWidth, height: cropHeight }).png().toBuffer();
}
function previewPartRow(component, variant, suffix, storedName) {
  const [x, y, width, height] = component.box;
  return {
    label: `${component.label} (${suffix})`,
    kind: component.kind,
    variant,
    semanticId: `${component.semanticId}-${variant}`,
    parentSemanticId: component.semanticId,
    groupKey: component.semanticId,
    storedName,
    refinedName: null,
    x: x / 1000,
    y: y / 1000,
    width: width / 1000,
    height: height / 1000,
    zIndex: component.zIndex,
    confidence: component.confidence,
    maskQuality: variant === "raw-part-prepared" ? 1 : 0,
    extractMode: variant,
    recommended: false,
    selected: false
  };
}
function skippedPartRow(component, metrics) {
  const [x, y, width, height] = component.box;
  return {
    label: `${component.label} (background-owned)`,
    kind: component.kind,
    variant: "background-owned",
    semanticId: component.semanticId,
    groupKey: component.semanticId,
    storedName: null,
    refinedName: null,
    x: x / 1000,
    y: y / 1000,
    width: width / 1000,
    height: height / 1000,
    zIndex: component.zIndex,
    confidence: component.confidence,
    maskQuality: metrics ? Math.round(metrics.similarity * 1000) / 1000 : 1,
    extractMode: "background-owned",
    recommended: false,
    selected: false
  };
}
function rectCardPartRow(component, storedName, metrics) {
  const [x, y, width, height] = component.box;
  return {
    label: component.label,
    kind: "rect-card",
    variant: "source-rect-card",
    semanticId: component.semanticId,
    groupKey: component.semanticId,
    storedName,
    refinedName: null,
    x: x / 1000,
    y: y / 1000,
    width: width / 1000,
    height: height / 1000,
    zIndex: component.zIndex,
    confidence: component.confidence,
    maskQuality: metrics ? Math.max(0, Math.min(1, 1 - metrics.changedRatio)) : 1,
    extractMode: "source-rect-card",
    recommended: component.recommended !== false,
    selected: component.recommended !== false
  };
}
function sourcePanelPartRow(component, storedName, metrics) {
  const [x, y, width, height] = component.box;
  return {
    label: component.label,
    kind: component.kind || "panel",
    variant: "source-panel-fidelity",
    semanticId: component.semanticId,
    groupKey: component.semanticId,
    storedName,
    refinedName: null,
    x: x / 1000,
    y: y / 1000,
    width: width / 1000,
    height: height / 1000,
    zIndex: component.zIndex,
    confidence: component.confidence,
    maskQuality: metrics ? Math.max(0, Math.min(1, 1 - metrics.changedRatio)) : 1,
    extractMode: "source-panel-fidelity",
    recommended: component.recommended !== false,
    selected: component.recommended !== false
  };
}
function sourceEffectPartRow(component, storedName, metrics) {
  const [x, y, width, height] = component.box;
  return {
    label: component.label,
    kind: component.kind || "effect",
    variant: "source-effect-fidelity",
    semanticId: component.semanticId,
    groupKey: component.semanticId,
    storedName,
    refinedName: null,
    x: x / 1000,
    y: y / 1000,
    width: width / 1000,
    height: height / 1000,
    zIndex: component.zIndex,
    confidence: component.confidence,
    maskQuality: metrics ? Math.max(0, Math.min(1, 1 - metrics.changedRatio)) : 1,
    extractMode: "source-effect-fidelity",
    recommended: component.recommended !== false,
    selected: component.recommended !== false
  };
}
function sanitizePartRow(row) {
  return {
    label: String(row.label || "part"),
    kind: String(row.kind || "part"),
    variant: String(row.variant || "semantic"),
    semanticId: String(row.semanticId || ""),
    parentSemanticId: row.parentSemanticId ? String(row.parentSemanticId) : null,
    groupKey: row.groupKey ? String(row.groupKey) : null,
    storedName: row.storedName ? String(row.storedName) : null,
    refinedName: row.refinedName ? String(row.refinedName) : null,
    textContent: row.textContent ? String(row.textContent) : null,
    x: Number(row.x) || 0,
    y: Number(row.y) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    zIndex: Number.isFinite(Number(row.zIndex)) ? Math.round(Number(row.zIndex)) : 0,
    confidence: Number(row.confidence) || 0,
    maskQuality: Number(row.maskQuality) || 0,
    extractMode: String(row.extractMode || "local"),
    recommended: Boolean(row.recommended),
    selected: Boolean(row.selected)
  };
}
async function preparePartWithOpenAi(cropBuffer, component) {
  const textLike = isTextLikePart(component);
  const projectSkill = projectCutoutPreparationSkill();
  const prompt = `${partCutoutSkill}
${textLike ? `\n${textArtCutoutSkill}` : ""}

PROJECT CUTOUT PREPARATION SKILL FROM REPOSITORY:
${projectSkill || "(skill file not found)"}

Target part: ${component.label}
Mask hint: ${component.maskHint}
Create a PNG where only this target part remains visible, placed on a flat ${textLike ? "dark neutral matte background (#111827 or #0B1220) if the text is white/light, or a light neutral matte background if the text is dark" : "high-contrast neutral matte background chosen according to the project cutout preparation skill"} that is easy for background removal.
Preserve all strokes, glow, shadows, text shapes and thin details belonging to the target. Do not add new text or redesign the element.
Do not stretch, squeeze, warp, re-proportion or perspective-correct the target. Preserve the original aspect ratio and visual geometry.
${textLike ? "For title art, keep the complete phrase as one intact text image. Do not split the glyph fill, bevel, outline, shadow, underline or glow into separate visual layers. Keep small cyan/blue light effects around the subtitle when they belong to the text block." : ""}`;
  try {
    return { buffer: await openAiEditPng(cropBuffer, prompt, `${component.semanticId}.png`), warning: "", usedOpenAi: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { buffer: null, warning: `${component.semanticId}: OpenAI part preparation failed; skipped Techsz cutout: ${message.slice(0, 220)}`, usedOpenAi: false };
  }
}
async function techszCutout(buffer, name) {
  if (!(process.env.TECHSZ_API_KEY || "").trim()) return { buffer: null, warning: "TECHSZ_API_KEY is not configured; kept the OpenAI prepared part." };
  try {
    const endpoint = "https://techsz.aoscdn.com/api/tasks/visual/segmentation";
    const form = new FormData();
    form.set("sync", "0");
    form.set("image_file", new Blob([new Uint8Array(buffer)], { type: "image/png" }), name);
    const response = await fetch(endpoint, { method: "POST", headers: { "X-API-KEY": process.env.TECHSZ_API_KEY || "" }, body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result.status || 200) !== 200) return { buffer: null, warning: `Techsz API error (${response.status}): ${String(result.message || result.msg || "cutout request failed")}` };
    const url = await techszResultImageUrl(endpoint, result);
    if (!url) return { buffer: null, warning: "Techsz did not return a result image" };
    const file = await downloadTechszImage(url);
    return file ? { buffer: file, warning: "" } : { buffer: null, warning: "Techsz result download failed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { buffer: null, warning: `Techsz cutout failed: ${message.slice(0, 220)}` };
  }
}
function isTechszQuotaOrAuthFailure(message) {
  return /Techsz|TECHSZ|佐糖|X-API-KEY/i.test(String(message || ""))
    && /401|403|quota|exceeded|request quota|api key|unauthorized|forbidden|积分|额度|insufficient/i.test(String(message || ""));
}
async function techszResultImageUrl(endpoint, initial) {
  const direct = firstRemoteImageUrl(initial);
  if (direct) return direct;
  const taskId = String(initial?.data?.task_id || initial?.data?.taskId || initial?.task_id || "");
  if (!taskId) return null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 35000) {
    await sleep(1000);
    const response = await fetch(`${endpoint}/${encodeURIComponent(taskId)}`, { headers: { "X-API-KEY": process.env.TECHSZ_API_KEY || "" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result.status || 200) !== 200) return null;
    const url = firstRemoteImageUrl(result);
    if (url) return url;
    const state = Number(result?.data?.state ?? result?.data?.task_state ?? 0);
    if (Number.isFinite(state) && state < 0) return null;
  }
  return null;
}
function firstRemoteImageUrl(value) {
  const stack = [value];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== "object") continue;
    for (const child of Object.values(item)) {
      if (typeof child === "string" && /^https?:\/\//.test(child) && /\.(png|jpe?g|webp)(\?|$)/i.test(child)) return child;
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return null;
}
async function downloadTechszImage(url) {
  const urls = [url];
  try {
    const parsed = new URL(url);
    if (parsed.hostname === "wxtech.aoscdn.com") {
      parsed.hostname = "techsz.aoscdn.com";
      urls.push(parsed.toString());
    }
  } catch {}
  for (const candidate of urls) {
    try {
      const response = await fetch(candidate);
      if (response.ok) return Buffer.from(await response.arrayBuffer());
    } catch {}
  }
  return null;
}
async function alphaCoverage(buffer) {
  const image = sharp(buffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  let visible = 0;
  for (let index = 3; index < data.length; index += info.channels) if (data[index] > 8) visible += 1;
  return visible / Math.max(1, info.width * info.height);
}
function isBadCutoutQuality(part) {
  if (String(part?.variant || "").startsWith("source-") || String(part?.extractMode || "").startsWith("source-")) return false;
  if (!part?.refinedName) return true;
  const coverage = Number(part.maskQuality) || 0;
  if (coverage <= 0.012 || coverage >= 0.92) return true;
  if (isTextLikePart(part) && coverage <= 0.02) return true;
  return false;
}
async function cleanTextCutoutEdges(buffer) {
  const image = sharp(buffer).ensureAlpha().raw();
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  for (let index = 3; index < data.length; index += info.channels) {
    if (data[index] < 4) data[index] = 0;
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}
async function classifySmartComponents(masterBuffer, cleanBuffer, components, options = {}) {
  const cleanBackgroundReliable = options.cleanBackgroundReliable !== false;
  return mapWithConcurrency(components, 4, async (component) => {
    if (isRectCardLikePart(component)) {
      return { component: { ...component, kind: "rect-card", rebuildPolicy: "overlay" }, role: "rect-card", metrics: null };
    }
    if (isContentPanelLikePart(component)) {
      return { component: { ...component, rebuildPolicy: "overlay" }, role: "source-panel", metrics: null };
    }
    if (isEffectLikePart(component)) {
      return { component: { ...component, rebuildPolicy: "overlay" }, role: "source-effect", metrics: null };
    }
    const metrics = cleanBackgroundReliable ? await compareComponentRegions(masterBuffer, cleanBuffer, component).catch(() => null) : null;
    const backgroundOwned = cleanBackgroundReliable && isOwnedByCleanBackground(component, metrics);
    if (backgroundOwned) {
      return { component: { ...component, recommended: false, rebuildPolicy: "skip" }, role: "background-owned", metrics };
    }
    if (!hasProtectedContent(component) && shouldSkipPartForRebuild(component)) {
      return { component: { ...component, recommended: false, rebuildPolicy: "skip" }, role: "background-owned", metrics };
    }
    return { component, role: "overlay-cutout", metrics };
  });
}
function partRowAsComponent(row) {
  return {
    ...row,
    box: [
      Math.round(Number(row.x || 0) * 1000),
      Math.round(Number(row.y || 0) * 1000),
      Math.round(Number(row.width || 0) * 1000),
      Math.round(Number(row.height || 0) * 1000)
    ]
  };
}
async function assessSmartRebuild(masterBuffer, reconstructionBuffer, partRows) {
  const warnings = [];
  const categories = { duplicateBackground: [], cardFrameLoss: [], contentPanelLoss: [], textFidelity: [] };
  const selectedRows = partRows.filter(part => part.selected && !isPipelinePreviewPart(part) && part.kind !== "background");
  for (const row of selectedRows) {
    if ((String(row.variant || "") === "source-rect-card" || String(row.extractMode || "") === "source-rect-card")) {
      const metrics = await compareComponentRegions(masterBuffer, reconstructionBuffer, partRowAsComponent(row)).catch(() => null);
      if (metrics && (metrics.similarity < 0.88 || metrics.changedRatio > 0.34)) {
        categories.cardFrameLoss.push({ id: row.semanticId, label: row.label, similarity: metrics.similarity, changedRatio: metrics.changedRatio });
      }
    }
    if ((String(row.variant || "") === "source-panel-fidelity" || String(row.extractMode || "") === "source-panel-fidelity")) {
      const metrics = await compareComponentRegions(masterBuffer, reconstructionBuffer, partRowAsComponent(row)).catch(() => null);
      if (metrics && (metrics.similarity < 0.88 || metrics.changedRatio > 0.34)) {
        categories.contentPanelLoss.push({ id: row.semanticId, label: row.label, similarity: metrics.similarity, changedRatio: metrics.changedRatio });
      }
    }
    if ((isTextLikePart(row) || isLogoLikePart(row)) && !String(row.extractMode || "").startsWith("source-") && Number(row.maskQuality || 0) <= 0.025) {
      categories.textFidelity.push({ id: row.semanticId, label: row.label, maskQuality: row.maskQuality });
    }
    if (isBackgroundOwnedCandidate(row) && Number(row.maskQuality || 0) <= 0.025 && !String(row.extractMode || "").startsWith("source-")) {
      categories.duplicateBackground.push({ id: row.semanticId, label: row.label, maskQuality: row.maskQuality });
    }
  }
  if (categories.cardFrameLoss.length) warnings.push(`card-frame-risk:${categories.cardFrameLoss.map(item => item.id).join(",")}`);
  if (categories.contentPanelLoss.length) warnings.push(`content-panel-risk:${categories.contentPanelLoss.map(item => item.id).join(",")}`);
  if (categories.textFidelity.length) warnings.push(`text-fidelity-risk:${categories.textFidelity.map(item => item.id).join(",")}`);
  if (categories.duplicateBackground.length) warnings.push(`background-duplicate-risk:${categories.duplicateBackground.map(item => item.id).join(",")}`);
  return {
    status: warnings.length ? "needs-review" : "completed",
    needsReview: warnings.length > 0,
    message: warnings.length ? "Smart rebuild QA found risks that should be checked before PPT import." : "Smart rebuild QA passed.",
    warnings,
    categories
  };
}
// Legacy rebuild helper retained for the later downstream workflow.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function buildSmartExplodeRun(run, masterImage, masterBuffer, cleanStoredName, cleanBuffer, components, batchIndex, options = {}) {
  const warnings = [];
  const cleanBackgroundReliable = options.cleanBackgroundReliable !== false;
  if (!cleanBackgroundReliable) {
    warnings.push("Clean background fallback was used; background dedupe is disabled for content safety.");
  }
  const classifiedComponents = await classifySmartComponents(masterBuffer, cleanBuffer, components, { cleanBackgroundReliable });
  const normalizedComponents = classifiedComponents.map(item => item.component);
  const skippedClassifications = classifiedComponents.filter(item => item.role === "background-owned");
  const rectCardClassifications = classifiedComponents.filter(item => item.role === "rect-card");
  const sourcePanelClassifications = classifiedComponents.filter(item => item.role === "source-panel");
  const sourceEffectClassifications = classifiedComponents.filter(item => item.role === "source-effect");
  const cutoutClassifications = classifiedComponents.filter(item => item.role === "overlay-cutout");
  const skippedComponents = skippedClassifications.map(item => item.component);
  const rectCardComponents = rectCardClassifications.map(item => item.component);
  const sourcePanelComponents = sourcePanelClassifications.map(item => item.component);
  const sourceEffectComponents = sourceEffectClassifications.map(item => item.component);
  const cutoutComponents = cutoutClassifications.map(item => item.component);
  if (skippedComponents.length) {
    await logEvent(run.id, `batch-${batchIndex + 1}-parts-filter`, "completed", `已自动跳过 ${skippedComponents.length} 个纯背景已承载零件，不进入二次抠图和重建`);
  }
  if (rectCardComponents.length) {
    await logEvent(run.id, `batch-${batchIndex + 1}-rect-card`, "completed", `已识别 ${rectCardComponents.length} 个矩形卡片，采用整卡保真模式`);
  }
  if (sourcePanelComponents.length) {
    await logEvent(run.id, `batch-${batchIndex + 1}-panel-fidelity`, "completed", `已识别 ${sourcePanelComponents.length} 个内容面板，采用整块保真模式`);
  }
  if (sourceEffectComponents.length) {
    await logEvent(run.id, `batch-${batchIndex + 1}-effect-fidelity`, "completed", `已识别 ${sourceEffectComponents.length} 个半透明光效/路线部件，采用原图保真模式`);
  }
  const partRows = [{
    label: "纯背景", kind: "background", variant: "clean-background", semanticId: "background", storedName: cleanStoredName,
    x: 0, y: 0, width: 1, height: 1, zIndex: 0, confidence: 1, maskQuality: 1, extractMode: "openai-clean-background", recommended: true, selected: true
  }];
  const cutoutConcurrency = Math.max(1, Math.min(6, Number(process.env.DESIGN_AGENT_CUTOUT_CONCURRENCY || 4) || 4));
  let completedPreparedParts = 0;
  let completedCutouts = 0;
  let techszUnavailableReason = "";
  let techszUnavailableLogged = false;
  const cropPreviewRows = [];
  const preparedPreviewRows = [];
  const backgroundOwnedRows = skippedClassifications.map(item => skippedPartRow(item.component, item.metrics));
  const rectCardRows = await mapWithConcurrency(rectCardClassifications, Math.min(4, cutoutConcurrency), async (item) => {
    const crop = await cropComponentRegion(masterBuffer, item.component, 0);
    const cropName = nowName("png");
    await writeFile(path.join(imageRoot, cropName), crop);
    cropPreviewRows.push(previewPartRow(item.component, "crop-part", "rect-card-source", cropName));
    return rectCardPartRow(item.component, cropName, item.metrics);
  });
  const sourcePanelRows = await mapWithConcurrency(sourcePanelClassifications, Math.min(4, cutoutConcurrency), async (item) => {
    const crop = await cropComponentRegion(masterBuffer, item.component, 0);
    const cropName = nowName("png");
    await writeFile(path.join(imageRoot, cropName), crop);
    cropPreviewRows.push(previewPartRow(item.component, "crop-part", "panel-source", cropName));
    return sourcePanelPartRow(item.component, cropName, item.metrics);
  });
  const sourceEffectRows = await mapWithConcurrency(sourceEffectClassifications, Math.min(4, cutoutConcurrency), async (item) => {
    const crop = await cropComponentRegion(masterBuffer, item.component, 0);
    const cropName = nowName("png");
    await writeFile(path.join(imageRoot, cropName), crop);
    cropPreviewRows.push(previewPartRow(item.component, "crop-part", "effect-source", cropName));
    return sourceEffectPartRow(item.component, cropName, item.metrics);
  });
  const foregroundRows = await mapWithConcurrency(cutoutComponents, cutoutConcurrency, async (component) => {
    const crop = await cropComponent(masterBuffer, component);
    const cropName = nowName("png");
    await writeFile(path.join(imageRoot, cropName), crop);
    cropPreviewRows.push(previewPartRow(component, "crop-part", "source-crop", cropName));
    const prepared = await preparePartWithOpenAi(crop, component);
    completedPreparedParts += 1;
    if (completedPreparedParts === cutoutComponents.length || completedPreparedParts % 3 === 0) {
      await logEvent(run.id, `batch-${batchIndex + 1}-prepare-progress`, "running", `part preparation progress ${completedPreparedParts}/${cutoutComponents.length}`);
    }
    let preparedName = null;
    if (prepared.buffer) {
      preparedName = nowName("png");
      await writeFile(path.join(imageRoot, preparedName), prepared.buffer);
      preparedPreviewRows.push(previewPartRow(component, "raw-part-prepared", "prepared-cutout-source", preparedName));
    } else {
      warnings.push(prepared.warning);
    }
    let refinedName = null;
    let maskQuality = 0;
    const textLike = isTextLikePart(component);
    let cutout = { buffer: null, warning: "" };
    if (prepared.buffer && !techszUnavailableReason) {
      cutout = await techszCutout(prepared.buffer, `${component.semanticId}.png`);
      if (!cutout.buffer && isTechszQuotaOrAuthFailure(cutout.warning)) {
        techszUnavailableReason = cutout.warning;
        if (!techszUnavailableLogged) {
          techszUnavailableLogged = true;
          await logEvent(run.id, `batch-${batchIndex + 1}-cutout-disabled`, "warning", "佐糖额度/授权不可用，本轮剩余零件切换为原图保真回退。");
        }
      }
    } else if (!prepared.buffer) {
      cutout = { buffer: null, warning: "OpenAI part preparation failed; skipped Techsz cutout" };
    }
    if (cutout.buffer) {
      const refinedBuffer = textLike ? await cleanTextCutoutEdges(cutout.buffer).catch(() => cutout.buffer) : cutout.buffer;
      refinedName = nowName("png");
      await writeFile(path.join(imageRoot, refinedName), refinedBuffer);
      maskQuality = await alphaCoverage(refinedBuffer).catch(() => 0.5);
    }
    let outputVariant = "cutout-part";
    let outputStoredName = preparedName;
    let outputRefinedName = refinedName;
    let outputExtractMode = refinedName ? "openai-prepared-techsz" : (preparedName ? "openai-prepared" : "openai-prepare-failed");
    if (isLogoLikePart(component) || (textLike && (!refinedName || maskQuality <= 0.018))) {
      const sourceCrop = await cropComponentRegion(masterBuffer, component, 0);
      outputStoredName = nowName("png");
      await writeFile(path.join(imageRoot, outputStoredName), sourceCrop);
      outputRefinedName = null;
      outputVariant = "source-text-fidelity";
      outputExtractMode = "source-text-fidelity";
      maskQuality = 1;
    } else if (!refinedName && preparedName) {
      const sourceCrop = await cropComponentRegion(masterBuffer, component, 0);
      outputStoredName = nowName("png");
      await writeFile(path.join(imageRoot, outputStoredName), sourceCrop);
      outputRefinedName = null;
      outputVariant = "source-effect-fidelity";
      outputExtractMode = "source-effect-fidelity";
      maskQuality = 1;
    } else if (cutout.warning) {
      warnings.push(`${component.semanticId}: ${cutout.warning}`);
    }
    completedCutouts += 1;
    if (completedCutouts === cutoutComponents.length || completedCutouts % 3 === 0) {
      await logEvent(run.id, `batch-${batchIndex + 1}-cutout-progress`, "running", `Techsz cutout progress ${completedCutouts}/${cutoutComponents.length}`);
    }
    const [x, y, width, height] = component.box;
    return {
      component, cropName,
      label: component.label, kind: component.kind, variant: outputVariant, semanticId: component.semanticId, groupKey: component.semanticId,
      storedName: outputStoredName, refinedName: outputRefinedName, x: x / 1000, y: y / 1000, width: width / 1000, height: height / 1000,
      zIndex: component.zIndex, confidence: component.confidence, maskQuality, extractMode: outputExtractMode,
      recommended: component.recommended && Boolean(outputStoredName), selected: component.recommended && Boolean(outputStoredName)
    };
  });
  const textFilter = filterTextOverlaps(foregroundRows);
  if (textFilter.skippedTextIds.length) warnings.push(`Skipped ${textFilter.skippedTextIds.length} likely duplicated text part(s): ${textFilter.skippedTextIds.join(", ")}`);
  const repairTargets = foregroundRows
    .filter(part => part.selected && isBadCutoutQuality(part))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))
    .slice(0, 4);
  await mapWithConcurrency(repairTargets, 2, async (part) => {
    if (techszUnavailableReason) return;
    const cropBuffer = await readFile(path.join(imageRoot, part.cropName));
    const prepared = await preparePartWithOpenAi(cropBuffer, part.component);
    if (!prepared.buffer) {
      warnings.push(`${part.semanticId}: repair preparation failed; kept previous cutout result`);
      return;
    }
    const preparedName = nowName("png");
    await writeFile(path.join(imageRoot, preparedName), prepared.buffer);
    preparedPreviewRows.push(previewPartRow(part.component, "raw-part-prepared", "repair-prepared-source", preparedName));
    const cutout = await techszCutout(prepared.buffer, `${part.semanticId}-repair.png`);
    if (!cutout.buffer) return;
    const refinedName = nowName("png");
    const refinedBuffer = isTextLikePart(part.component) ? await cleanTextCutoutEdges(cutout.buffer).catch(() => cutout.buffer) : cutout.buffer;
    await writeFile(path.join(imageRoot, refinedName), refinedBuffer);
    part.storedName = preparedName;
    part.refinedName = refinedName;
    part.maskQuality = await alphaCoverage(refinedBuffer).catch(() => 0.5);
    part.extractMode = "openai-repair-techsz";
  });
  partRows.push(...backgroundOwnedRows, ...cropPreviewRows, ...preparedPreviewRows, ...rectCardRows, ...sourcePanelRows, ...sourceEffectRows);
  for (const row of foregroundRows) {
    const part = { ...row };
    delete part.component;
    delete part.cropName;
    partRows.push(part);
  }
  const riskySelected = partRows.filter(part => part.kind !== "background" && part.selected && shouldSkipPartForRebuild(part));
  if (riskySelected.length) warnings.push(`Found ${riskySelected.length} background-like selected parts; review recommended.`);
  let needsReview = warnings.length > 0 || partRows.length <= 1 || partRows.some(part => part.kind !== "background" && part.selected && !part.refinedName && !String(part.extractMode || "").startsWith("source-")) || riskySelected.length > 0;
  const dbPartRows = partRows.map(sanitizePartRow);
  await logEvent(run.id, `batch-${batchIndex + 1}-rebuild`, "running", `Creating reconstruction layers (${dbPartRows.length} parts).`);
  let explodeRun = await db.imageExplodeRun.create({
    data: {
      serviceId: run.serviceId, employeeId: run.employeeId, status: "completed", sourceImageId: masterImage.id, width: 1920, height: 1080,
      layerPlanJson: JSON.stringify({ workflow: "openai-smart-mode-v1", components: normalizedComponents, skippedComponents, skills: ["project_cutout_preparation_skill", "part_decomposition_skill", "part_cutout_skill", "text_art_cutout_skill", "rebuild_alignment_skill", "part_repair_skill"], batchIndex }),
      qaReportJson: JSON.stringify({
        status: needsReview ? "needs-review" : "completed",
        message: needsReview
          ? "Some parts need review before PPT import."
          : "OpenAI decomposition, Techsz cutout, and reconstruction preview completed.",
        warnings
      }),
      backgroundStrategy: "openai-clean-background", cloudCleanupUsed: foregroundRows.some(part => Boolean(part.refinedName)),
      recommendedPartIds: JSON.stringify(dbPartRows.filter(part => part.selected).map(part => part.semanticId)), needsReview,
      startedAt: new Date(), finishedAt: new Date(), parts: { create: dbPartRows },
      events: { create: [
        {
          stage: "decompose",
          status: "completed",
          detail: `OpenAI decomposed ${components.length} parts; skipped ${skippedComponents.length} background-owned parts.`
        },
        {
          stage: "cutout",
          status: needsReview ? "warning" : "completed",
          detail: warnings.length ? warnings.slice(0, 3).join("; ") : "Techsz cutout completed."
        }
      ] }
    },
    include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] } }
  });
  const reconstructionBuffer = await composeCleanReconstruction(cleanBuffer, explodeRun.parts);
  const reconstructionName = nowName("png");
  await writeFile(path.join(imageRoot, reconstructionName), reconstructionBuffer);
  const rebuildQa = await assessSmartRebuild(masterBuffer, reconstructionBuffer, partRows);
  const finalWarnings = [...warnings, ...rebuildQa.warnings];
  needsReview = needsReview || rebuildQa.needsReview;
  explodeRun = await db.imageExplodeRun.update({
    where: { id: explodeRun.id },
    data: {
      reconstructionName,
      needsReview,
      qaReportJson: JSON.stringify({
        status: needsReview ? "needs-review" : "completed",
        message: needsReview ? "Smart rebuild QA found risks; review parts before PPT import." : "Smart rebuild QA passed.",
        warnings: finalWarnings,
        categories: rebuildQa.categories
      })
    },
    include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] } }
  });
  return { explodeRun, reconstructionName, needsReview, warnings: finalWarnings };
}
async function createSmartBatch(run, job, batchIndex, batchCount) {
  await ensureRunActive(run.id);
  const masterPrompt = smartMasterPrompt(run, batchIndex, batchCount);
  if (run.generationMode === "mixed") {
    const referenceCount = run.references?.length || 0;
    const primary = (run.references || []).find(reference => reference.isPrimary) || run.references?.[0];
    await logEvent(run.id, `batch-${batchIndex + 1}-mixed-master`, "running", `Mixed mode sends ${referenceCount} reference image(s) directly to OpenAI for the master image. Primary: ${primary?.label || "reference 1"}. Downstream pipeline is identical to text-to-image mode.`);
  }
  await logEvent(run.id, `batch-${batchIndex + 1}-master`, "running", `OpenAI is generating master image ${batchIndex + 1}.`);
  const masterBuffer = await normalizeSlidePng(await openAiImageRaw({}, {}, run.generationMode, run.references || [], masterPrompt), "#08244f");
  const masterStoredName = nowName("png");
  await writeFile(path.join(imageRoot, masterStoredName), masterBuffer);
  const masterImage = await db.generatedImage.create({ data: { jobId: job.id, storedName: masterStoredName, originalUrl: null } });
  await logEvent(run.id, `batch-${batchIndex + 1}-master`, "completed", `Master image ${batchIndex + 1} generated.`);
  return {
    index: batchIndex,
    title: `PNG Candidate ${batchIndex + 1}`,
    assetFiles: {
      renderMode: "openai-smart-image-v1",
      batchIndex,
      masterImageId: masterImage.id,
      masterStoredName
    },
    qa: {
      status: "completed",
      message: "PNG candidate generated. Downstream editing workflow is intentionally disabled for now.",
      warnings: []
    }
  };
}
async function processRun(run) {
  await ensureDirs();
  const batchCount = clampBatchCount(run.generationBudget);
  const skills = ["master_render_skill"];
  const promptSummary = `${masterRenderSkill}`;
  await setRun(run.id, { workflowState: "master_render", designIntent: JSON.stringify({ workflow: "openai-smart-image-v1", batchCount, skills }), error: null, generationAttempts: 0, evaluationAttempts: 0 });
  await logEvent(run.id, "context", "completed", "Loaded prompt and references. Smart mode now stops after high-quality PNG generation.");
  const job = await db.generationJob.create({ data: { prompt: `${run.brief}\n\n--- WORKFLOW SKILLS ---\n${promptSummary}`, status: "processing", provider: "openai", model: openAiImageModel, serviceId: run.serviceId, employeeId: run.employeeId } });
  await setRun(run.id, { generatedJobId: job.id, visualPrompt: promptSummary });
  const batches = [];
  for (let index = 0; index < batchCount; index += 1) {
    const batch = await createSmartBatch(run, job, index, batchCount);
    batches.push(batch);
    const first = batches[0];
    await setRun(run.id, { generationAttempts: batches.length, selectedImageId: first.assetFiles.masterImageId, layoutPlan: JSON.stringify({ workflow: "openai-smart-image-v1", title: "Smart mode PNG candidates", batches, assetFiles: first.assetFiles, qa: first.qa }) });
  }
  await db.generationJob.update({ where: { id: job.id }, data: { status: "completed" } });
  const active = batches[0];
  await setRun(run.id, {
    status: "completed",
    workflowState: "awaiting_confirmation",
    finishedAt: new Date(),
    selectedImageId: active.assetFiles.masterImageId,
    layoutPlan: JSON.stringify({ workflow: "openai-smart-image-v1", title: "Smart mode PNG candidates", batches, assetFiles: active.assetFiles, qa: active.qa }),
    error: null
  });
  await logEvent(run.id, "production-ready", "completed", `Smart mode completed ${batches.length} PNG candidate(s).`);
}

async function loop() {
  console.log("Design agent worker started.");
  await writeWorkerHeartbeat("started");
  startWorkerHeartbeat();
  while (true) {
    try {
      await writeWorkerHeartbeat("polling");
      const run = await claimRun();
      if (run) {
        await writeWorkerHeartbeat(`running:${run.id}`);
        try { await processRun(run); }
        catch (error) {
          if (error?.code === "DESIGN_AGENT_CANCELLED") continue;
          const employeeMessage = employeeFacingFailure(error);
          console.error(`Design agent run ${run.id} failed:`, error instanceof Error ? error.message : error);
          await setRun(run.id, { status: "failed", error: employeeMessage, finishedAt: new Date() });
          await logEvent(run.id, "failed", "failed", `${employeeMessage} (${safeFailureDetail(error)})`);
        }
        await writeWorkerHeartbeat("completed-run");
        continue;
      }
    } catch (error) { console.error("Design agent worker error:", error instanceof Error ? error.message : error); }
    await sleep(pollMs);
  }
}

async function shutdown() {
  if (workerHeartbeatTimer) clearInterval(workerHeartbeatTimer);
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
void loop();
