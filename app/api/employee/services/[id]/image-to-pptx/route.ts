import path from "path";
import sharp from "sharp";
import { ProxyAgent, fetch as undiciFetch } from "undici";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { documentRoot, ensureWorkspaceDirectories, imageRoot, readStoredFile, uniqueStoredName } from "@/lib/workspace-storage";
import { writeFile } from "fs/promises";

export const runtime = "nodejs";

let proxyAgent: ProxyAgent | undefined;
let proxyAgentUrl = "";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "imageTools");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const form = await request.formData();
  const title = String(form.get("title") || "图片转 PPT").trim().slice(0, 80) || "图片转 PPT";
  const imageId = String(form.get("imageId") || "").trim();
  const uploaded = form.get("image");
  let imageBuffer: Buffer;
  let imageName = "image.png";

  if (uploaded instanceof File && uploaded.size > 0) {
    if (!uploaded.type.startsWith("image/")) return NextResponse.json({ error: "请上传图片文件" }, { status: 400 });
    if (uploaded.size > 30 * 1024 * 1024) return NextResponse.json({ error: "图片不能超过 30MB" }, { status: 400 });
    imageBuffer = Buffer.from(await uploaded.arrayBuffer());
    imageName = uploaded.name || imageName;
  } else if (imageId) {
    const image = await db.generatedImage.findUnique({ where: { id: imageId }, include: { job: true } });
    if (!image || image.job.serviceId !== id) return NextResponse.json({ error: "素材图片不存在" }, { status: 404 });
    imageBuffer = await readStoredFile(imageRoot, image.storedName);
    imageName = image.storedName;
  } else {
    return NextResponse.json({ error: "请先放入一张图片" }, { status: 400 });
  }

  try {
    const pdfBuffer = await imageToOnePagePdf(imageBuffer);
    const upload = await codiaUploadPdf(pdfBuffer, `${safeName(title)}.pdf`);
    const task = await codiaCreatePdfToPptTask(upload.uploadId, title);
    const finalTask = await pollCodiaTask(task.taskId);
    const pptUrl = finalTask.result?.ppt_url;
    if (!pptUrl) throw new Error("Codia 任务成功但没有返回 PPT 下载链接");
    const pptx = await downloadCodiaPpt(pptUrl);
    const storedName = uniqueStoredName("pptx");
    await ensureWorkspaceDirectories();
    await writeFile(path.join(documentRoot, storedName), pptx);
    return NextResponse.json({
      fileName: `${title}.pptx`,
      downloadUrl: `/api/employee/services/${id}/image-to-pptx?file=${encodeURIComponent(storedName)}&name=${encodeURIComponent(title)}`,
      codiaTaskId: finalTask.task_id,
      sourceName: imageName
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "图片转 PPT 失败" }, { status: 500 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "exports");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  const file = request.nextUrl.searchParams.get("file") || "";
  if (!/^[0-9a-fA-F-]+\.pptx$/.test(file) && !/^\d+-[0-9a-f]+\.pptx$/.test(file)) {
    return NextResponse.json({ error: "文件不存在" }, { status: 404 });
  }
  const title = safeName(request.nextUrl.searchParams.get("name") || "图片转PPT");
  const content = await readStoredFile(documentRoot, file);
  return new NextResponse(new Uint8Array(content), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${title}.pptx`)}`,
      "Cache-Control": "private, no-store"
    }
  });
}

async function imageToOnePagePdf(input: Buffer) {
  const jpeg = await sharp(input)
    .resize(1920, 1080, { fit: "contain", background: "#061525" })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
  return makeImagePdf([jpeg], 960, 540);
}

function codiaConfig() {
  const key = process.env.CODIA_API_KEY?.replace(/^["']|["']$/g, "").trim();
  if (!key) throw new Error("尚未配置 CODIA_API_KEY，请先在 .env 里补全 Codia key。");
  return { key, baseUrl: (process.env.CODIA_BASE_URL || "https://openapi.codia.ai").replace(/\/$/, "") };
}

async function codiaFetch(url: string, init: Parameters<typeof undiciFetch>[1] = {}, timeoutMs = 180000) {
  const proxyUrl = process.env.CODIA_PROXY_URL;
  if (proxyUrl && proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent(proxyUrl);
    proxyAgentUrl = proxyUrl;
  }
  const retryDelays = [1200, 3000];
  let lastError: unknown;
  for (let attempt = 0; attempt <= retryDelays.length; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const undiciInit = proxyAgent ? { ...init, signal: controller.signal, dispatcher: proxyAgent } : { ...init, signal: controller.signal };
      return await undiciFetch(url, undiciInit as Parameters<typeof undiciFetch>[1]);
    } catch (error) {
      lastError = error;
      const cause = error && typeof error === "object" ? (error as { cause?: { code?: string; message?: string } }).cause : undefined;
      const reason = [error instanceof Error ? error.message : String(error), cause?.code, cause?.message]
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .join(" · ");
      const transientNetworkFailure = /fetch failed|enotfound|econn|etimedout|socket|tls|network/i.test(reason);
      if (!transientNetworkFailure || attempt >= retryDelays.length) {
        throw new Error(`Codia 连接失败：${reason}`, { cause: error });
      }
      await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function readCodiaJson(response: Response, fallback: string) {
  const text = await response.text();
  let result: { code?: number; message?: string; data?: Record<string, unknown> } = {};
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }
  if (!response.ok || result.code) throw new Error(`Codia API error ${response.status}: ${result.message || fallback}`);
  return result;
}

async function codiaUploadPdf(pdfBuffer: Buffer, fileName: string) {
  const { key, baseUrl } = codiaConfig();
  const multipart = multipartFileBody("file", fileName, "application/pdf", pdfBuffer);
  const response = await codiaFetch(`${baseUrl}/v2/open/uploads`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": `multipart/form-data; boundary=${multipart.boundary}`,
    },
    body: multipart.body
  });
  const result = await readCodiaJson(response as unknown as Response, "Codia PDF 上传失败");
  const uploadId = result.data?.upload_id;
  if (typeof uploadId !== "string" || !uploadId) throw new Error("Codia 上传成功但没有返回 upload_id");
  return { uploadId };
}

async function codiaCreatePdfToPptTask(uploadId: string, title: string) {
  const { key, baseUrl } = codiaConfig();
  const response = await codiaFetch(`${baseUrl}/v2/open/tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Idempotency-Key": `image-to-ppt-${Date.now()}-${Math.random().toString(16).slice(2)}`
    },
    body: JSON.stringify({
      operation: "pdf_to_ppt",
      input: { upload_id: uploadId, title }
    })
  });
  const result = await readCodiaJson(response as unknown as Response, "Codia PDF 转 PPT 任务创建失败");
  const taskId = result.data?.task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("Codia 任务创建成功但没有返回 task_id");
  return { taskId };
}

async function pollCodiaTask(taskId: string) {
  const { key, baseUrl } = codiaConfig();
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const response = await codiaFetch(`${baseUrl}/v2/open/tasks/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}` }
    }, 45000);
    const result = await readCodiaJson(response as unknown as Response, "Codia 任务状态读取失败");
    const task = result.data as { task_id?: string; status?: string; error?: string; result?: { ppt_url?: string } };
    if (task.status === "succeeded") return task;
    if (task.status === "failed" || task.status === "canceled") throw new Error(task.error || `Codia PDF 转 PPT 任务${task.status === "canceled" ? "已取消" : "失败"}`);
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  throw new Error("Codia 转换仍在处理中，请稍后重试。");
}

async function downloadCodiaPpt(pptUrl: string) {
  const response = await codiaFetch(pptUrl, {}, 180000);
  if (!response.ok) throw new Error(`Codia PPTX 下载失败：HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "").trim().slice(0, 80) || "图片转PPT";
}

function multipartFileBody(fieldName: string, fileName: string, contentType: string, content: Buffer) {
  const boundary = `----wzlcf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const safeFileName = fileName.replace(/["\r\n]/g, "_");
  const head = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="${fieldName}"; filename="${safeFileName}"\r\n` +
    `Content-Type: ${contentType}\r\n\r\n`,
    "utf8"
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return { boundary, body: Buffer.concat([head, content, tail]) };
}

function pdfString(value: string) {
  return Buffer.from(value, "binary");
}

function makeObject(id: number, body: Buffer | string) {
  return { id, body: Buffer.isBuffer(body) ? body : pdfString(String(body)) };
}

function streamObject(id: number, dict: string, stream: Buffer) {
  return makeObject(id, Buffer.concat([pdfString(`${dict}\nstream\n`), stream, pdfString("\nendstream")]));
}

function makeImagePdf(images: Buffer[], width: number, height: number) {
  const objects: { id: number; body: Buffer }[] = [];
  const catalogId = 1;
  const pagesId = 2;
  let nextId = 3;
  const pageIds: number[] = [];
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
  const chunks: Buffer[] = [pdfString("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n")];
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
