import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { ProxyAgent, fetch as undiciFetch } from "undici";

const root = process.cwd();
loadEnv();

const db = new PrismaClient();
const workspaceRoot = path.join(root, "uploads", "employee-workspace");
const imageRoot = path.join(workspaceRoot, "images");
const documentRoot = path.join(workspaceRoot, "documents");
const skillRoot = path.join(root, "skills", "deck-generation");
const pollMs = Math.max(1200, Number(process.env.DECK_GENERATION_POLL_MS || 2500));
const deckGenerationConcurrency = Math.min(4, Math.max(1, Number(process.env.DECK_GENERATION_CONCURRENCY || 2)));
const openAiBaseUrl = trimSlash(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1");
const openAiTextModel = process.env.OPENAI_TEXT_MODEL || process.env.OPENAI_RESPONSES_MODEL || "gpt-5.5";
const openAiImageModel = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5";
const openAiImageSize = process.env.OPENAI_IMAGE_SIZE?.split(",").map(item => item.trim()).find(Boolean) || "1536x864";
const codiaBaseUrl = trimSlash(process.env.CODIA_BASE_URL || "https://api.codia.ai");
let proxyAgent;

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

function nowName(extension) {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
}

async function ensureDirs() {
  await Promise.all([
    mkdir(imageRoot, { recursive: true }),
    mkdir(documentRoot, { recursive: true })
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
    readSkill("regeneration-controls.md")
  ].join("\n\n---\n\n");
}

function getOpenAiFetch() {
  const proxy = process.env.OPENAI_PROXY_URL;
  if (proxy && !proxyAgent) proxyAgent = new ProxyAgent(proxy);
  return async (url, init, timeoutMs = 300000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (proxyAgent) {
        return await undiciFetch(url, { ...init, signal: controller.signal, dispatcher: proxyAgent });
      }
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };
}

function providerError(result, fallback) {
  return result?.error?.message || result?.message || fallback;
}

function codiaConfig() {
  const key = process.env.CODIA_API_KEY?.replace(/^["']|["']$/g, "").trim();
  if (!key) throw new Error("尚未配置 CODIA_API_KEY，无法将 PDF 转换为 PPT。请在 .env 里补全 CODIA_API_KEY。");
  return { key };
}

function textFromResponse(result) {
  if (typeof result?.output_text === "string" && result.output_text.trim()) return result.output_text.trim();
  const chunks = result?.output?.flatMap(item => item.content || [])
    .map(item => item.text || item.value || "")
    .filter(Boolean);
  return chunks?.join("\n").trim() || "";
}

async function openAiText(prompt) {
  if (!process.env.OPENAI_API_KEY) throw new Error("尚未配置 OPENAI_API_KEY");
  const request = getOpenAiFetch();
  const response = await request(`${openAiBaseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: openAiTextModel,
      input: prompt
    })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(providerError(result, "OpenAI 文本生成失败"));
  const text = textFromResponse(result);
  if (!text) throw new Error("OpenAI 没有返回可读文本");
  return text;
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
  if (!process.env.OPENAI_API_KEY) throw new Error("尚未配置 OPENAI_API_KEY");
  const request = getOpenAiFetch();
  const response = await request(`${openAiBaseUrl}/images/generations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: openAiImageModel,
      prompt,
      n: 1,
      size: openAiImageSize,
      quality: "medium",
      output_format: "png"
    })
  });
  const result = await response.json();
  if (!response.ok || !result.data?.[0]) throw new Error(providerError(result, "OpenAI 图片生成失败"));
  const image = result.data[0];
  if (image.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image.url) {
    const download = await request(image.url, {}, 120000);
    if (!download.ok) throw new Error("OpenAI 生成图下载失败");
    return Buffer.from(await download.arrayBuffer());
  }
  throw new Error("OpenAI 图片接口没有返回图片内容");
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
      content_summary: String(slide.content_summary || "").slice(0, 500),
      composition: String(slide.composition || "").slice(0, 700),
      main_visual: String(slide.main_visual || "").slice(0, 700),
      inherited_elements: normalizeArray(slide.inherited_elements).map(String).slice(0, 8),
      changed_elements: normalizeArray(slide.changed_elements).map(String).slice(0, 8),
      text_density: String(slide.text_density || "low"),
      white_space: String(slide.white_space || "").slice(0, 300),
      must_include: normalizeArray(slide.must_include).map(String).slice(0, 10),
      must_avoid: normalizeArray(slide.must_avoid).map(String).slice(0, 10)
    }));
  while (slides.length < run.pageCount) {
    const index = slides.length;
    slides.push({
      slide_index: index + 1,
      title: index === 0 ? run.projectName : `Page ${index + 1}`,
      role: normalizedSlideRole(index, run.pageCount),
      content_summary: run.brief,
      composition: "完整 16:9 PPT 页面，标题清晰，内容区有层级，保留高级留白。",
      main_visual: run.projectName,
      inherited_elements: [],
      changed_elements: [],
      text_density: "low",
      white_space: "保留清楚的阅读空间。",
      must_include: [],
      must_avoid: []
    });
  }
  return {
    outline: normalizeOutline(plan, run, slides),
    visual_identity: plan.visual_identity || {},
    visual_storyboard: normalizeStoryboard(plan, slides),
    slide_image_specs: { slides }
  };
}

function planPrompt(run) {
  return `${skillBundle()}

你是 WZLCF 的 PPT 图组导演。请根据下面输入，先生成方案，不要生成图片。

项目名称：${run.projectName}
用途/类型：${run.projectType || "未填写"}
页数：${run.pageCount}
风格包：${run.stylePack}（${stylePackName(run.stylePack)}）
统一元素选项：${run.unityOptionsJson}
项目简介：
${run.brief}

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
- 避免大段乱码文字，文字密度 low 或 medium。
- 必须体现组图连续性和风格统一。`;
}

async function planRun(run) {
  await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "planning", startedAt: new Date(), error: null }
  });
  const plan = normalizePlan(await openAiJson(planPrompt(run)), run);
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
  await db.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
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
    throw new Error(`Codia API error ${response.status}: ${message}`);
  }
  return result;
}

async function codiaUploadPdf(pdfBuffer, fileName) {
  const { key } = codiaConfig();
  const request = getOpenAiFetch();
  const multipart = multipartFileBody("file", fileName, "application/pdf", pdfBuffer);
  const response = await request(`${codiaBaseUrl}/v2/open/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
      "Content-Length": String(multipart.body.length)
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
  const request = getOpenAiFetch();
  const response = await request(`${codiaBaseUrl}/v2/open/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Idempotency-Key": `deck-pdf-to-ppt-${run.id}`
    },
    body: JSON.stringify({
      operation: "pdf_to_ppt",
      input: {
        upload_id: uploadId,
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
  const request = getOpenAiFetch();
  const response = await request(`${codiaBaseUrl}/v2/open/tasks/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${key}` }
  }, 45000);
  return readCodiaJson(response, "Codia 任务状态读取失败");
}

async function downloadCodiaPpt(pptUrl) {
  const request = getOpenAiFetch();
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
      await db.deckGenerationRun.update({
        where: { id: ppt.id },
        data: { status: "review_ready", error: error instanceof Error ? error.message : String(error) }
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
