import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { aiImageConfig, aiImageFetch, fetchWithReadableNetworkError, readProviderError, resolveImageModel } from "@/lib/ai-providers";
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

const activeJobs = new Set<string>();

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
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
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
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
  const imageService = aiImageConfig();
  const apiKey = model.provider === "ark" ? process.env.ARK_API_KEY : imageService.apiKey;
  if (!apiKey) {
    return NextResponse.json({ error: `尚未配置 ${model.provider === "ark" ? "ARK_API_KEY" : "AI_IMAGE_API_KEY"}，请先在服务端环境变量中配置密钥` }, { status: 503 });
  }
  if (model.provider === "ark" && reference instanceof File && reference.size) {
    return NextResponse.json({ error: "Seedream 5.0 暂不支持参考图，请先移除参考图后生成" }, { status: 400 });
  }

  if (model.provider === "openai" && reference instanceof File && reference.size && !imageService.supportsEdits) {
    return NextResponse.json({
      error: `${imageService.serviceName} 当前只接通文字生图，尚未提供参考图编辑接口。请移除参考图后生成；确认中转站支持 /images/edits 后再设置 AI_IMAGE_SUPPORTS_EDITS=1。`
    }, { status: 400 });
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
  const imageService = aiImageConfig();
  const hasReference = Boolean(referenceStoredName);
  if (hasReference && !imageService.supportsEdits) {
    throw new Error(`${imageService.serviceName} 尚未接通参考图编辑接口`);
  }

  const response = await aiImageFetch(
    hasReference ? `${imageService.baseUrl}/images/edits` : `${imageService.baseUrl}/images/generations`,
    hasReference
      ? await relayImageEditRequest(apiKey, model, prompt, referenceStoredName!)
      : relayImageGenerationRequest(apiKey, model, prompt),
    300000
  );
  const result = await response.json();
  if (!response.ok || !result.data?.[0]) {
    throw new Error(readProviderError(result, `${imageService.serviceName} 图片生成失败`));
  }

  const image = result.data[0] as { b64_json?: string; url?: string };
  if (image.b64_json) {
    return { buffer: Buffer.from(image.b64_json, "base64"), contentType: "image/png", originalUrl: null };
  }
  if (image.url) {
    const imageResponse = await aiImageFetch(image.url, {}, 90000);
    if (!imageResponse.ok) throw new Error(`${imageService.serviceName} 生成图片下载失败`);
    return {
      buffer: Buffer.from(await imageResponse.arrayBuffer()),
      contentType: imageResponse.headers.get("content-type") || "image/png",
      originalUrl: image.url
    };
  }
  throw new Error(`${imageService.serviceName} 没有返回图片内容`);
}

function relayImageGenerationRequest(apiKey: string, model: string, prompt: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024" })
  };
}

async function relayImageEditRequest(apiKey: string, model: string, prompt: string, referenceStoredName: string): Promise<RequestInit> {
  const reference = await storedReferenceFile(referenceStoredName);
  const form = new FormData();
  form.set("model", model);
  form.set("prompt", prompt);
  form.set("n", "1");
  form.set("size", "1024x1024");
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
