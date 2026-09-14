import { existsSync, readFileSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PrismaClient } from "@prisma/client";
import { aiImageConfig, createServiceFetch, requireImageEdits } from "./ai-service-client.mjs";

const root = process.cwd();
loadEnv();
const db = new PrismaClient();
const workspaceRoot = path.join(root, "uploads", "employee-workspace");
const imageService = aiImageConfig();
const imageRequest = createServiceFetch(imageService);
const imageRoot = path.join(workspaceRoot, "images");
const referenceRoot = path.join(workspaceRoot, "references");
const extractorUrl = (process.env.COMPONENT_EXTRACTOR_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
const pollMs = Math.max(1200, Number(process.env.IMAGE_EXPLODE_POLL_MS || 2400));
const arkEndpoint = process.env.ARK_RESPONSES_ENDPOINT || "https://ark.cn-beijing.volces.com/api/v3/responses";
const visionModel = process.env.DOUBAO_VISION_MODEL || process.env.DOUBAO_TEXT_MODEL || "doubao-seed-2-0-pro-260215";

function loadEnv() {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(root, fileName);
    if (!existsSync(filePath)) continue;
    for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match || match[1].startsWith("#") || process.env[match[1]]) continue;
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function nowName() { return `${Date.now()}-${Math.random().toString(16).slice(2)}.png`; }
function mime(name) { const ext = path.extname(name).toLowerCase(); return ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png"; }
function jsonFromText(text) {
  const clean = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] || text;
  const start = clean.indexOf("{"); const end = clean.lastIndexOf("}");
  return start >= 0 && end > start ? JSON.parse(clean.slice(start, end + 1)) : {};
}
function outputText(result) {
  if (typeof result?.output_text === "string") return result.output_text;
  return result?.output?.flatMap(item => item.content || []).map(item => item.text || item.value || "").filter(Boolean).join("\n") || "";
}
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function normalBox(box) {
  const [x, y, width, height] = Array.isArray(box) ? box : [];
  return { x: clamp(x, 0, 1000), y: clamp(y, 0, 1000), width: clamp(width, 1, 1000), height: clamp(height, 1, 1000) };
}
async function cleanBackgroundWithOpenAi(source, plan) {
  try {
    requireImageEdits(imageService);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: `${message} 已保留本地候选供人工确认。` };
  }
  const labels = plan.components.map(item => String(item.label || item.kind || "视觉主体")).slice(0, 12).join("、");
  const form = new FormData();
  form.set("model", imageService.model);
  form.set("image", new Blob([new Uint8Array(source.buffer)], { type: mime(source.name) }), `background-${source.name}`);
  form.set("prompt", `Create a clean PPT background from this image. Remove these foreground layers completely: ${labels}. Also remove every readable title, subtitle, label, card and logo. Preserve only the abstract atmospheric background, canvas size, palette, lighting direction, subtle particles and non-semantic texture. Do not add text, subjects, cards, icons, borders or new decorations. Return a clean background image only.`);
  const response = await imageRequest(`${imageService.baseUrl}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${imageService.apiKey}` },
    body: form
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result?.data?.[0]) return { error: result?.error?.message || result?.message || `${imageService.serviceName} 背景清图没有返回可用图片。` };
  const image = result.data[0];
  if (image.b64_json) return { buffer: Buffer.from(image.b64_json, "base64") };
  if (!image.url) return { error: `${imageService.serviceName} 背景清图未返回图片数据。` };
  const download = await imageRequest(image.url, {}, 300000);
  return download.ok ? { buffer: Buffer.from(await download.arrayBuffer()) } : { error: `${imageService.serviceName} 背景清图结果下载失败。` };
}

async function event(runId, stage, status, detail) {
  await db.imageExplodeEvent.create({ data: { runId, stage, status, detail: String(detail || "").slice(0, 1000) } });
}
async function ensureRunActive(runId) {
  const latest = await db.imageExplodeRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (latest?.status === "cancelled") {
    const error = new Error("图片拆解已取消");
    error.code = "IMAGE_EXPLODE_CANCELLED";
    throw error;
  }
}
async function sourceBuffer(run) {
  if (run.sourceImage) return { buffer: await readFile(path.join(imageRoot, path.basename(run.sourceImage.storedName))), name: run.sourceImage.storedName };
  if (!run.sourceStoredName) throw new Error("找不到原始图片，请重新选择图片后再拆解");
  const referencePath = path.join(referenceRoot, path.basename(run.sourceStoredName));
  const imagePath = path.join(imageRoot, path.basename(run.sourceStoredName));
  return { buffer: await readFile(existsSync(referencePath) ? referencePath : imagePath), name: run.sourceStoredName };
}
async function analyze(buffer, fileName) {
  if (!process.env.ARK_API_KEY) return { components: [], texts: [], warning: "未配置视觉模型，先提供背景与原图候选；可配置 ARK_API_KEY 后获得自动主体、卡片和文字候选。" };
  const prompt = `You are a semantic layer planner for decomposing a finished PPT sample PNG into movable PPT parts. Return JSON only.
Schema: {"components":[{"semanticId":"stable-id","parentId":null,"label":"short Chinese name","kind":"subject|title-art|wordart|frame|card|panel|icon|decoration|group","box":[x,y,width,height],"confidence":0-1,"zIndex":1,"removeFromBackground":true,"containsText":false,"recommended":true,"maskHint":"short English segmentation hint"}],"texts":[{"semanticRole":"title|subtitle|body|card-label|logo|unknown","text":"only readable text","box":[x,y,width,height],"rotation":0,"confidence":0-1,"editable":true,"style":{"color":"#RRGGBB","fontSize":12,"bold":false,"italic":false,"align":"left","effect":"plain|outline|gradient|shadow|perspective|curved|texture"}}]}
Coordinates are 0-1000.
Critical rules:
1. Output only foreground layers that a PPT editor would reasonably move: main robot/person/product/vehicle, title artwork, logo frame, information cards, icons, decorative frame lines. Do not output abstract background, code texture, particles, gradients, vignettes, halos, random network lines, or full-page background pieces.
2. Boxes must be tight around the visible pixels of that object. Include a small glow if it is visually attached, but do not include large surrounding blue background. Bad boxes ruin SAM3 masks.
3. Large decorative/3D/glowing title text must be one complete title-art or wordart component, not split into separate characters, and not ordinary editable text. Ordinary small text can appear in texts only when truly readable.
4. If there is a group plus child parts, set the group recommended=false and children recommended=true. Never recommend both the group and its children.
5. Do not add invented text, logos, names or phone numbers. Prefer recall over silence: if an important foreground object is uncertain, still output it with lower confidence and recommended=true so the reviewer can decide. Max 18 components, 10 texts.`;
  const response = await fetch(arkEndpoint, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.ARK_API_KEY}` },
    body: JSON.stringify({ model: visionModel, input: [{ role: "user", content: [{ type: "input_image", image_url: `data:${mime(fileName)};base64,${buffer.toString("base64")}` }, { type: "input_text", text: prompt }] }] })
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || result?.message || "视觉识别服务暂时不可用");
  const parsed = jsonFromText(outputText(result));
  return { components: Array.isArray(parsed.components) ? parsed.components.slice(0, 18) : [], texts: Array.isArray(parsed.texts) ? parsed.texts.slice(0, 12) : [] };
}
async function extract(run, source, plan) {
  const response = await fetch(`${extractorUrl}/explode`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image: source.buffer.toString("base64"), components: plan.components, texts: plan.texts })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "本地拆图服务未就绪，请确认 npm run dev 正在运行");
  return result;
}
async function processRun(run) {
  await db.imageExplodeRun.update({ where: { id: run.id }, data: { status: "running", startedAt: new Date(), error: null } });
  await event(run.id, "analyze", "running", "正在理解图片中的主体、装饰、卡片和文字");
  try {
    await Promise.all([mkdir(imageRoot, { recursive: true }), mkdir(referenceRoot, { recursive: true })]);
    const source = await sourceBuffer(run);
    const info = await sharp(source.buffer).metadata();
    const plan = await analyze(source.buffer, source.name);
    await ensureRunActive(run.id);
    if (plan.warning) await event(run.id, "analyze", "warning", plan.warning);
    else await event(run.id, "analyze", "completed", `已识别 ${plan.components.length} 个视觉候选和 ${plan.texts.length} 个文字候选`);
    await event(run.id, "extract", "running", "本地正在生成透明部件和背景候选");
    const result = await extract(run, source, plan);
    await ensureRunActive(run.id);
    const parts = [];
    for (const candidate of Array.isArray(result.parts) ? result.parts : []) {
      let storedName = null;
      const pngBase64 = candidate.pngBase64 || candidate.image;
      if (pngBase64) {
        storedName = nowName();
        await writeFile(path.join(imageRoot, storedName), Buffer.from(pngBase64, "base64"));
      }
      const box = normalBox(candidate.box || [Number(candidate.x) * 1000, Number(candidate.y) * 1000, Number(candidate.width) * 1000, Number(candidate.height) * 1000]);
      const textContent = candidate.textContent || candidate.text;
      parts.push({
        runId: run.id,
        label: String(candidate.label || "未命名部件").slice(0, 80),
        kind: String(candidate.kind || "decoration").slice(0, 30),
        variant: String(candidate.variant || "semantic").slice(0, 30),
        semanticId: String(candidate.semanticId || "").slice(0, 80),
        parentSemanticId: candidate.parentSemanticId ? String(candidate.parentSemanticId).slice(0, 80) : null,
        groupKey: candidate.groupKey ? String(candidate.groupKey).slice(0, 80) : null,
        storedName,
        textContent: textContent ? String(textContent).slice(0, 800) : null,
        x: box.x / 1000,
        y: box.y / 1000,
        width: box.width / 1000,
        height: box.height / 1000,
        zIndex: Number(candidate.zIndex) || 0,
        confidence: clamp(candidate.confidence, 0, 1),
        maskQuality: clamp(candidate.maskQuality ?? candidate.confidence, 0, 1),
        extractMode: String(candidate.extractMode || "local-mask").slice(0, 40),
        recommended: Boolean(candidate.recommended ?? candidate.selected),
        selected: candidate.selected !== false
      });
    }
    const textLayers = (Array.isArray(result.textLayers) ? result.textLayers : []).map(candidate => {
      const box = normalBox(candidate.box || [Number(candidate.x) * 1000, Number(candidate.y) * 1000, Number(candidate.width) * 1000, Number(candidate.height) * 1000]);
      const style = candidate.style && typeof candidate.style === "object" ? candidate.style : {};
      return {
        runId: run.id,
        content: String(candidate.content || "").slice(0, 800),
        groupKey: candidate.groupKey ? String(candidate.groupKey).slice(0, 80) : null,
        x: box.x / 1000, y: box.y / 1000, width: box.width / 1000, height: box.height / 1000,
        rotation: clamp(candidate.rotation, -180, 180), styleJson: JSON.stringify(style),
        complexity: candidate.complexity === "complex" ? "complex" : "simple",
        mode: candidate.mode === "artwork" || candidate.mode === "skip" ? candidate.mode : "native",
        confidence: clamp(candidate.confidence, 0, 1), selected: candidate.selected !== false
      };
    }).filter(layer => layer.content);
    const qa = result.qa && typeof result.qa === "object" ? { ...result.qa } : { status: "needs-review", message: "本地拆图未返回重建质量报告。" };
    let reconstructionName = null;
    if (result.reconstruction) {
      reconstructionName = nowName();
      await writeFile(path.join(imageRoot, reconstructionName), Buffer.from(result.reconstruction, "base64"));
    }
    let backgroundStrategy = "local-mask-inpaint";
    let cloudCleanupUsed = false;
    if (qa.status === "needs-cloud-cleanup") {
      await event(run.id, "background-clean", "running", "本地重建检测到残影风险，正在执行一次受预算限制的 AI 背景清图。");
      const cloud = await cleanBackgroundWithOpenAi(source, plan);
      if (cloud.buffer) {
        const background = parts.find(part => part.kind === "background" && part.variant === "inpainted");
        if (background) {
          const storedName = nowName();
          await writeFile(path.join(imageRoot, storedName), cloud.buffer);
          background.storedName = storedName;
          background.extractMode = "openai-background-cleanup";
          background.confidence = Math.max(background.confidence || 0, 0.72);
          backgroundStrategy = "openai-background-cleanup";
          cloudCleanupUsed = true;
          qa.status = "cloud-cleaned";
          qa.message = "本地重建存在残影风险，已使用一次 AI 背景清图；导入前请查看重建预览。";
          await event(run.id, "background-clean", "completed", "已完成一次 AI 背景清图，原始候选仍被保留。 ");
        }
      } else {
        qa.status = "needs-review";
        qa.message = cloud.error || "AI 背景清图未成功，已保留本地候选供人工确认。";
        await event(run.id, "background-clean", "warning", qa.message);
      }
    }
    parts.forEach((part, index) => Object.assign(part, {
      semanticId: String(part.semanticId || `candidate-${index + 1}`).slice(0, 80),
      parentSemanticId: part.parentSemanticId ? String(part.parentSemanticId).slice(0, 80) : null,
      maskQuality: clamp(part.maskQuality ?? part.confidence, 0, 1),
      extractMode: String(part.extractMode || "local-mask").slice(0, 40),
      recommended: Boolean(part.recommended ?? part.selected)
    }));
    textLayers.forEach((layer, index) => Object.assign(layer, {
      ocrConfidence: clamp(result.textLayers?.[index]?.ocrConfidence ?? layer.confidence, 0, 1),
      visionConfidence: clamp(result.textLayers?.[index]?.visionConfidence ?? 0, 0, 1),
      semanticRole: String(result.textLayers?.[index]?.semanticRole || "unknown").slice(0, 40)
    }));
    if (!parts.length) throw new Error("没有生成可用候选，请换一张清晰度更高的图片重试");
    await db.$transaction([
      db.imageExplodeTextLayer.deleteMany({ where: { runId: run.id } }),
      db.imageExplodePart.deleteMany({ where: { runId: run.id } }),
      db.imageExplodePart.createMany({ data: parts }),
      ...(textLayers.length ? [db.imageExplodeTextLayer.createMany({ data: textLayers })] : []),
      db.imageExplodeRun.update({ where: { id: run.id }, data: { status: "completed", width: info.width || 0, height: info.height || 0, finishedAt: new Date() } }),
      db.imageExplodeEvent.create({ data: { runId: run.id, stage: "text-recover", status: textLayers.length ? "completed" : "warning", detail: textLayers.length ? `已恢复 ${textLayers.length} 段文字：普通文字可编辑，复杂字效保留原效果候选。` : (result.ocrWarning ? `本地 OCR 暂未可用，已使用视觉识别降级：${String(result.ocrWarning).slice(0, 120)}` : "未识别到可恢复文字。") } }),
      db.imageExplodeEvent.create({ data: { runId: run.id, stage: "extract", status: "completed", detail: `已生成 ${parts.length} 个候选部件；请勾选需要的部件后再导入 PPT。` } })
    ]);
    await event(run.id, "extract", "completed", `拆图执行器：${result.backend || "unknown"}；${result.segmentation?.reason || "已完成语义拆图。"}`);
    await db.imageExplodeRun.update({ where: { id: run.id }, data: {
      layerPlanJson: JSON.stringify(result.layerPlan || plan),
      qaReportJson: JSON.stringify(qa),
      reconstructionName,
      backgroundStrategy,
      cloudCleanupUsed,
      recommendedPartIds: JSON.stringify(parts.filter(part => part.recommended).map(part => part.semanticId)),
      needsReview: qa.status === "needs-review"
    } });
    await event(run.id, "reconstruction-qa", qa.status === "local-pass" || qa.status === "cloud-cleaned" ? "completed" : "warning", String(qa.message || "已完成重建质量检查。"));
  } catch (error) {
    if (error?.code === "IMAGE_EXPLODE_CANCELLED") return;
    const message = error instanceof Error ? error.message : "拆图失败，请稍后重试";
    await db.imageExplodeRun.update({ where: { id: run.id }, data: { status: "failed", error: message, finishedAt: new Date() } });
    await event(run.id, "failed", "failed", message);
  }
}
async function tick() {
  const run = await db.imageExplodeRun.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" }, include: { sourceImage: true } });
  if (run) await processRun(run);
}
console.log("Image explode worker started.");
while (true) { try { await tick(); } catch (error) { console.error("Image explode worker error:", error); } await sleep(pollMs); }
