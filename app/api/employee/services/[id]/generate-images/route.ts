import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { fetchWithReadableNetworkError, openAiBaseUrl, openAiFetch, readProviderError, resolveImageModel } from "@/lib/ai-providers";
import {
  ensureWorkspaceDirectories,
  imageRoot,
  referenceRoot,
  saveFile,
  uniqueStoredName
} from "@/lib/workspace-storage";

export const runtime = "nodejs";

type GeneratedOpenAiImage = {
  buffer: Buffer;
  contentType: string;
  originalUrl: string | null;
};

type ImageGenerationTask = {
  apiKey: string;
  jobId: string;
  provider: "ark" | "openai";
  model: string;
  prompt: string;
  count: number;
  referenceStoredName: string | null;
};

type OpenAiFetchResponse = Awaited<ReturnType<typeof openAiFetch>>;

const activeJobs = new Set<string>();

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const jobs = await db.generationJob.findMany({
    where: { serviceId: id, employeeId: employee.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: {
      employee: { select: { id: true, name: true } },
      images: { orderBy: [{ isMaterial: "desc" }, { materialOrder: "asc" }, { createdAt: "desc" }] }
    }
  });
  return NextResponse.json({ jobs });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const recentCount = await db.generatedImage.count({
    where: {
      job: { employeeId: employee.id },
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) }
    }
  });
  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  const count = Math.max(1, Math.min(4, Number(form.get("count") ?? 1)));
  const reference = form.get("reference");
  if (!prompt) return NextResponse.json({ error: "请输入图片描述" }, { status: 400 });
  if (recentCount + count > 20) {
    return NextResponse.json({ error: "每名员工每小时最多生成 20 张图片" }, { status: 429 });
  }
  if (reference instanceof File && reference.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "参考图不能超过 10MB" }, { status: 400 });
  }

  const model = resolveImageModel(String(form.get("modelId") || ""));
  const apiKey = model.provider === "ark" ? process.env.ARK_API_KEY : process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: `尚未配置 ${model.provider === "ark" ? "ARK_API_KEY" : "OPENAI_API_KEY"}，请先在服务端环境变量中配置密钥` }, { status: 503 });
  }
  if (model.provider === "ark" && reference instanceof File && reference.size) {
    return NextResponse.json({ error: "Seedream 5.0 暂不支持参考图，请先移除参考图后生成" }, { status: 400 });
  }

  let referenceStoredName: string | null = null;
  if (reference instanceof File && reference.size) {
    if (!reference.type.startsWith("image/")) {
      return NextResponse.json({ error: "参考文件必须是图片" }, { status: 400 });
    }
    referenceStoredName = await saveFile(reference, referenceRoot);
  }

  const job = await db.generationJob.create({
    data: {
      prompt: prompt.slice(0, 3000),
      referenceStoredName,
      serviceId: id,
      employeeId: employee.id,
      provider: model.provider,
      model: model.model
    }
  });

  try {
    void runImageGenerationJob({
      apiKey,
      jobId: job.id,
      provider: model.provider,
      model: model.model,
      prompt,
      count,
      referenceStoredName
    });
    return NextResponse.json({ job: { ...job, status: "processing", images: [] } }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片生成失败";
    await db.generationJob.update({ where: { id: job.id }, data: { status: "failed", error: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function runImageGenerationJob(task: ImageGenerationTask) {
  if (activeJobs.has(task.jobId)) return;
  activeJobs.add(task.jobId);
  try {
    await ensureWorkspaceDirectories();
    for (let index = 0; index < task.count; index += 1) {
      const generated = task.provider === "ark" ? await generateArkImage(task) : await generateOpenAiImage(task);
      const extension = generated.contentType.includes("jpeg") ? "jpg" : generated.contentType.includes("webp") ? "webp" : "png";
      const storedName = uniqueStoredName(extension);
      await writeFile(path.join(imageRoot, storedName), generated.buffer);
      await db.generatedImage.create({
        data: { jobId: task.jobId, storedName, originalUrl: generated.originalUrl }
      });
    }
    await db.generationJob.update({ where: { id: task.jobId }, data: { status: "completed", error: null } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片生成失败";
    await db.generationJob.update({ where: { id: task.jobId }, data: { status: "failed", error: message } });
  } finally {
    activeJobs.delete(task.jobId);
  }
}

async function generateArkImage({
  apiKey,
  model,
  prompt
}: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<GeneratedOpenAiImage> {
  const response = await fetchWithReadableNetworkError("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      prompt,
      sequential_image_generation: "disabled",
      response_format: "url",
      size: "2K",
      stream: false,
      watermark: true
    })
  }, 300000);
  const result = await response.json();
  if (!response.ok || !result.data?.[0]) {
    throw new Error(readProviderError(result, "Seedream 5.0 图片生成失败"));
  }
  const image = result.data[0] as { url?: string; b64_json?: string };
  if (image.b64_json) {
    return { buffer: Buffer.from(image.b64_json, "base64"), contentType: "image/png", originalUrl: null };
  }
  if (!image.url) throw new Error("Seedream 5.0 没有返回图片地址");
  const imageResponse = await fetchWithReadableNetworkError(image.url, {}, 90000);
  if (!imageResponse.ok) throw new Error("Seedream 5.0 生成图片下载失败");
  return {
    buffer: Buffer.from(await imageResponse.arrayBuffer()),
    contentType: imageResponse.headers.get("content-type") || "image/png",
    originalUrl: image.url
  };
}

async function generateOpenAiImage({
  apiKey,
  model,
  prompt,
  referenceStoredName
}: {
  apiKey: string;
  model: string;
  prompt: string;
  referenceStoredName: string | null;
}): Promise<GeneratedOpenAiImage> {
  const hasReference = Boolean(referenceStoredName);
  const baseUrl = openAiBaseUrl();
  const response = await openAiFetch(
    hasReference ? `${baseUrl}/images/edits` : `${baseUrl}/images/generations`,
    hasReference
      ? await openAiImageEditRequest(apiKey, model, prompt, referenceStoredName!, true)
      : openAiImageGenerationRequest(apiKey, model, prompt, true),
    300000
  );
  if (isStreamResponse(response)) {
    return readOpenAiImageStream(response);
  }
  const result = await response.json();
  if (!response.ok && isStreamParameterError(result)) {
    return generateOpenAiImageWithoutStream({ apiKey, model, prompt, referenceStoredName });
  }
  if (!response.ok || !result.data?.[0]) {
    throw new Error(readProviderError(result, "OpenAI 图片生成失败"));
  }
  const image = result.data[0] as { b64_json?: string; url?: string };
  if (image.b64_json) {
    return { buffer: Buffer.from(image.b64_json, "base64"), contentType: "image/png", originalUrl: null as string | null };
  }
  if (image.url) {
    const imageResponse = await openAiFetch(image.url, {}, 90000);
    if (!imageResponse.ok) throw new Error("生成图片下载失败");
    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") || "image/png",
      originalUrl: image.url
    };
  }
  throw new Error("OpenAI 图片接口没有返回图片内容");
}

async function generateOpenAiImageWithoutStream(task: Pick<ImageGenerationTask, "apiKey" | "model" | "prompt" | "referenceStoredName">): Promise<GeneratedOpenAiImage> {
  const hasReference = Boolean(task.referenceStoredName);
  const baseUrl = openAiBaseUrl();
  const response = await openAiFetch(
    hasReference ? `${baseUrl}/images/edits` : `${baseUrl}/images/generations`,
    hasReference
      ? await openAiImageEditRequest(task.apiKey, task.model, task.prompt, task.referenceStoredName!, false)
      : openAiImageGenerationRequest(task.apiKey, task.model, task.prompt, false),
    300000
  );
  const result = await response.json();
  if (!response.ok || !result.data?.[0]) {
    throw new Error(readProviderError(result, "OpenAI 图片生成失败"));
  }
  const image = result.data[0] as { b64_json?: string; url?: string };
  if (image.b64_json) {
    return { buffer: Buffer.from(image.b64_json, "base64"), contentType: "image/png", originalUrl: null };
  }
  if (image.url) {
    const imageResponse = await openAiFetch(image.url, {}, 90000);
    if (!imageResponse.ok) throw new Error("生成图片下载失败");
    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") || "image/png",
      originalUrl: image.url
    };
  }
  throw new Error("OpenAI 图片接口没有返回图片内容");
}

function openAiImageGenerationRequest(apiKey: string, model: string, prompt: string, stream: boolean): RequestInit {
  const body: Record<string, string | number | boolean> = {
    model,
    prompt,
    n: 1,
    size: "1024x1024",
    quality: "medium",
    output_format: "png"
  };
  if (stream) {
    body.stream = true;
    body.partial_images = 1;
  }
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  };
}

async function openAiImageEditRequest(apiKey: string, model: string, prompt: string, referenceStoredName: string, stream: boolean): Promise<RequestInit> {
  const reference = await storedReferenceFile(referenceStoredName);
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("size", "1024x1024");
  form.set("quality", "medium");
  form.set("output_format", "png");
  if (stream) {
    form.set("stream", "true");
    form.set("partial_images", "1");
  }
  form.set("image", reference);
  return {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  };
}

async function storedReferenceFile(storedName: string) {
  const buffer = await readFile(path.join(referenceRoot, path.basename(storedName)));
  return new File([buffer], path.basename(storedName), { type: imageMimeType(storedName) });
}

function imageMimeType(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function isStreamResponse(response: OpenAiFetchResponse) {
  return response.headers.get("content-type")?.includes("text/event-stream");
}

async function readOpenAiImageStream(response: OpenAiFetchResponse): Promise<GeneratedOpenAiImage> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(readProviderError(safeJson(text), "OpenAI 图片生成失败"));
  }
  if (!response.body) throw new Error("OpenAI 图片流没有返回内容");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalImage: { b64_json?: string; url?: string } | null = null;
  let finalError = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\n\n/);
    buffer = parts.pop() || "";
    for (const part of parts) {
      const event = parseOpenAiStreamEvent(part);
      if (!event) continue;
      const error = readStreamError(event);
      if (error) finalError = error;
      if (isCompletedImageEvent(event)) {
        const image = findImagePayload(event);
        if (image) finalImage = image;
      }
    }
  }

  if (finalImage?.b64_json) {
    return { buffer: Buffer.from(finalImage.b64_json, "base64"), contentType: "image/png", originalUrl: null };
  }
  if (finalImage?.url) {
    const imageResponse = await openAiFetch(finalImage.url, {}, 90000);
    if (!imageResponse.ok) throw new Error("生成图片下载失败");
    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") || "image/png",
      originalUrl: finalImage.url
    };
  }
  throw new Error(finalError || "OpenAI 图片流没有返回最终图片");
}

function parseOpenAiStreamEvent(part: string) {
  const dataLines = part.split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trim());
  const data = dataLines.join("\n");
  if (!data || data === "[DONE]") return null;
  return safeJson(data);
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function isStreamParameterError(result: unknown) {
  const message = readProviderError(result, "").toLowerCase();
  return Boolean(message) &&
    (message.includes("stream") || message.includes("partial_images")) &&
    (message.includes("unknown") || message.includes("unsupported") || message.includes("not support"));
}

function isCompletedImageEvent(event: unknown) {
  if (!event || typeof event !== "object") return false;
  const type = "type" in event ? String((event as { type?: unknown }).type || "") : "";
  return type.includes("completed") || type.includes("complete") || type === "";
}

function readStreamError(event: unknown) {
  if (!event || typeof event !== "object") return "";
  const data = event as { error?: { message?: string } | string; message?: string };
  if (typeof data.error === "string") return data.error;
  return data.error?.message || data.message || "";
}

function findImagePayload(value: unknown): { b64_json?: string; url?: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.b64_json === "string") return { b64_json: record.b64_json };
  if (typeof record.url === "string") return { url: record.url };
  for (const item of Object.values(record)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        const found = findImagePayload(child);
        if (found) return found;
      }
    } else {
      const found = findImagePayload(item);
      if (found) return found;
    }
  }
  return null;
}
