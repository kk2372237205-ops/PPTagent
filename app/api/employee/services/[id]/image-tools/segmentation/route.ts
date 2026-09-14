import path from "path";
import { writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { techszImageToolById } from "@/lib/techsz-image-tools";
import { ensureWorkspaceDirectories, imageRoot, readStoredFile, uniqueStoredName } from "@/lib/workspace-storage";

export const runtime = "nodejs";

const endpointBase = "https://techsz.aoscdn.com/api/tasks";
const maxImageSize = 20 * 1024 * 1024;
const pollIntervalMs = 1000;
const pollTimeoutMs = 30000;

type SourceImage = {
  buffer: Buffer;
  filename: string;
  contentType: string;
  prompt: string;
};

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "imageTools");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  if (!configuredApiKey()) {
    return NextResponse.json({ error: "请先在服务端 .env 配置 TECHSZ_API_KEY" }, { status: 503 });
  }

  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  try {
    const form = await request.formData();
    const tool = techszImageToolById(String(form.get("tool") || "segmentation"));
    const source = await sourceImageFromForm(form, id);
    if ("error" in source) return NextResponse.json({ error: source.error }, { status: source.status });

    const resultUrls = await createAndPollImageTool(source, tool.endpointPaths);
    const resultDownload = await downloadResultImage(resultUrls);
    if ("error" in resultDownload) {
      return NextResponse.json({ error: resultDownload.error }, { status: 502 });
    }

    const resultBuffer = Buffer.from(await resultDownload.response.arrayBuffer());
    const extension = extensionFromResult(resultDownload.url, resultDownload.response.headers.get("content-type"));
    await ensureWorkspaceDirectories();
    const storedName = uniqueStoredName(extension);
    await writeFile(path.join(imageRoot, storedName), resultBuffer);

    const job = await db.generationJob.create({
      data: {
        prompt: `佐糖${tool.label}：${source.prompt}`,
        status: "completed",
        serviceId: id,
        employeeId: employee.id,
        provider: "techsz",
        model: tool.model
      }
    });
    const image = await db.generatedImage.create({
      data: { jobId: job.id, storedName, originalUrl: resultDownload.url },
      include: {
        job: { include: { employee: { select: { id: true, name: true } } } }
      }
    });

    return NextResponse.json({ image, imageUrl: `/api/employee/generated-images/${image.id}` });
  } catch (reason) {
    return NextResponse.json({
      error: reason instanceof Error ? reason.message : "佐糖图片处理失败，请稍后重试"
    }, { status: 502 });
  }
}

function configuredApiKey() {
  const key = (process.env.TECHSZ_API_KEY || "").trim();
  return Boolean(key && !/^your[_-]?api[_-]?key$/i.test(key));
}

async function sourceImageFromForm(form: FormData, serviceId: string): Promise<SourceImage | { error: string; status: number }> {
  const imageId = String(form.get("imageId") || "");
  const file = form.get("image");

  if (imageId) {
    const image = await db.generatedImage.findUnique({ where: { id: imageId }, include: { job: true } });
    if (!image) return { error: "图片不存在", status: 404 };
    if (image.job.serviceId !== serviceId) return { error: "这张图片不属于当前订单", status: 400 };
    const extension = path.extname(image.storedName).slice(1).toLowerCase();
    return {
      buffer: await readStoredFile(imageRoot, image.storedName),
      filename: `wzlcf-material-${image.id}.${extension || "png"}`,
      contentType: contentTypeForExtension(extension),
      prompt: image.job.prompt || "素材图片"
    };
  }

  if (!(file instanceof File) || file.size <= 0) return { error: "请拖入要处理的图片", status: 400 };
  if (!file.type.startsWith("image/")) return { error: "只支持图片文件", status: 400 };
  if (file.size > maxImageSize) return { error: "图片不能超过 20MB", status: 400 };
  return {
    buffer: Buffer.from(await file.arrayBuffer()),
    filename: file.name || "wzlcf-image.png",
    contentType: file.type || contentTypeForExtension(path.extname(file.name).slice(1)),
    prompt: file.name || "本地拖入图片"
  };
}

async function createAndPollImageTool(source: SourceImage, endpointPaths: string[]) {
  let lastError: Error | null = null;
  for (const endpointPath of endpointPaths) {
    try {
      return await createAndPollAtEndpoint(source, endpointPath);
    } catch (reason) {
      lastError = reason instanceof Error ? reason : new Error("佐糖图片处理失败");
    }
  }
  throw lastError || new Error("佐糖图片处理失败，请检查接口路径");
}

async function createAndPollAtEndpoint(source: SourceImage, endpointPath: string) {
  const endpoint = `${endpointBase}/${endpointPath}`;
  const form = new FormData();
  form.set("sync", "0");
  form.set("image_file", new Blob([new Uint8Array(source.buffer)], { type: source.contentType }), source.filename);

  const createJson = await techszJson(endpoint, { method: "POST", body: form });
  const createUrls = findImageUrls(createJson);
  if (createUrls.length) return createUrls;

  const taskId = taskIdFrom(createJson);
  if (!taskId) throw new Error(`佐糖未返回任务编号，请检查 ${endpointPath} 接口参数或 image_file 字段名`);

  const startedAt = Date.now();
  while (Date.now() - startedAt < pollTimeoutMs) {
    await wait(pollIntervalMs);
    const pollJson = await techszJson(`${endpoint}/${encodeURIComponent(taskId)}`, { method: "GET" });
    const resultUrls = findImageUrls(pollJson);
    if (resultUrls.length) return resultUrls;
    const state = taskStateFrom(pollJson);
    if (typeof state === "number" && state < 0) throw new Error(messageFrom(pollJson) || "佐糖图片处理任务失败");
  }
  throw new Error("佐糖图片处理超时，请稍后重试");
}

async function techszJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "X-API-KEY": process.env.TECHSZ_API_KEY || "",
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("佐糖返回了无法解析的响应");
  }
  const status = Number((json as { status?: number }).status);
  if (!response.ok || (Number.isFinite(status) && status !== 200)) {
    throw new Error(messageFrom(json) || "佐糖图片处理请求失败，请检查 TECHSZ_API_KEY 或接口路径");
  }
  return json;
}

function taskIdFrom(value: unknown): string {
  const data = (value as { data?: Record<string, unknown> }).data || {};
  return String(data.task_id || data.taskId || (value as { task_id?: string }).task_id || "");
}

function taskStateFrom(value: unknown) {
  const data = (value as { data?: Record<string, unknown> }).data || {};
  const state = data.state ?? data.task_state ?? data.status;
  return Number.isFinite(Number(state)) ? Number(state) : null;
}

function findImageUrls(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const urls: { key: string; url: string }[] = [];
  const stack: unknown[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") continue;
    for (const [key, child] of Object.entries(current)) {
      if (typeof child === "string" && /^https?:\/\//i.test(child) && /(^|_|-)(url|image|result|output)|url$/i.test(key)) {
        urls.push({ key, url: child });
      }
      if (child && typeof child === "object") stack.push(child);
    }
  }
  return Array.from(new Set(urls
    .sort((a, b) => imageUrlPriority(b.key, b.url) - imageUrlPriority(a.key, a.url))
    .map(item => item.url)));
}

function imageUrlPriority(key: string, url: string) {
  let score = 0;
  if (/result|output/i.test(key)) score += 6;
  if (/image|url/i.test(key)) score += 3;
  if (/\.(png|jpe?g|webp)(\?|$)/i.test(url)) score += 2;
  if (/wxtech\.aoscdn\.com/i.test(url)) score -= 1;
  return score;
}

async function downloadResultImage(resultUrls: string[]): Promise<{ response: Response; url: string } | { error: string }> {
  const candidates = resultUrls.flatMap(resultDownloadCandidates);
  let lastError = "";
  for (const url of candidates) {
    try {
      const response = await fetch(url);
      if (response.ok) return { response, url };
      lastError = `下载失败 ${response.status}`;
    } catch (reason) {
      lastError = reason instanceof Error ? reason.message : "结果图片地址无法访问";
    }
  }
  if (resultUrls.some(url => /wxtech\.aoscdn\.com/i.test(url))) {
    return { error: "佐糖返回的结果图片域名 wxtech.aoscdn.com 当前无法访问，已尝试自动修正并尝试其它结果地址但仍下载失败。可能需要按佐糖文档校准该工具的接口路径或结果字段。" };
  }
  return { error: lastError || "佐糖结果图片下载失败，请稍后重试" };
}

function resultDownloadCandidates(resultUrl: string) {
  const candidates = [resultUrl];
  try {
    const url = new URL(resultUrl);
    if (url.hostname === "wxtech.aoscdn.com") {
      url.hostname = "techsz.aoscdn.com";
      candidates.push(url.toString());
    }
  } catch {
    return candidates;
  }
  return Array.from(new Set(candidates));
}

function messageFrom(value: unknown) {
  const data = (value as { data?: Record<string, unknown> }).data || {};
  const message = String((value as { message?: string }).message || (value as { msg?: string }).msg || data.message || data.error || "");
  if (/mask[_\s-]*image/i.test(message)) return "该佐糖功能需要画笔蒙版，请先标出要处理的区域";
  return message;
}

function extensionFromResult(url: string, contentType: string | null) {
  if (contentType?.includes("jpeg")) return "jpg";
  if (contentType?.includes("webp")) return "webp";
  if (contentType?.includes("png")) return "png";
  const byUrl = path.extname(new URL(url).pathname).slice(1).toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(byUrl) ? (byUrl === "jpeg" ? "jpg" : byUrl) : "png";
}

function contentTypeForExtension(extension: string) {
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/png";
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
