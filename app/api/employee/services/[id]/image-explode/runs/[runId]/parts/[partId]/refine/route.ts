import path from "path";
import { writeFile } from "fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { imageRoot, readStoredFile, referenceRoot, uniqueStoredName } from "@/lib/workspace-storage";

export const runtime = "nodejs";
const endpoint = "https://techsz.aoscdn.com/api/tasks/visual/segmentation";

export async function POST(request: Request, context: { params: Promise<{ id: string; runId: string; partId: string }> }) {
  const { id, runId, partId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "imageTools");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const part = await db.imageExplodePart.findFirst({ where: { id: partId, runId, run: { serviceId: id, employeeId: employee.id } }, include: { run: { include: { sourceImage: true } } } });
  if (!part?.storedName || part.textContent) return NextResponse.json({ error: "只能对图片候选进行抠图精修" }, { status: 400 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  if (body.action === "accept") {
    if (!part.refinedName) return NextResponse.json({ error: "请先生成精修预览，再添加到候选列表" }, { status: 400 });
    const last = await db.imageExplodePart.findFirst({ where: { runId }, orderBy: { zIndex: "desc" }, select: { zIndex: true } });
    const refinedPart = await db.$transaction(async transaction => {
      const next = await transaction.imageExplodePart.create({ data: {
        runId, label: `${part.label}（抠图精修）`, kind: part.kind, variant: "refined", storedName: part.refinedName,
        x: part.x, y: part.y, width: part.width, height: part.height, zIndex: (last?.zIndex || 0) + 1,
        confidence: Math.min(1, part.confidence + 0.01), selected: false
      } });
      await transaction.imageExplodeEvent.create({ data: { runId, stage: "refine-accept", status: "completed", detail: `已将“${part.label}”的抠图精修版添加到候选列表末尾，原候选保留。` } });
      return next;
    });
    return NextResponse.json({ ok: true, refinedPart });
  }
  if (!(process.env.TECHSZ_API_KEY || "").trim()) return NextResponse.json({ error: "未配置 TECHSZ_API_KEY，暂时不能使用抠图精修" }, { status: 503 });
  try {
    const source = await originalCropForRefinement(part);
    const form = new FormData();
    form.set("sync", "0");
    form.set("image_file", new Blob([new Uint8Array(source)], { type: "image/png" }), `recut-${part.id}.png`);
    const response = await fetch(endpoint, { method: "POST", headers: { "X-API-KEY": process.env.TECHSZ_API_KEY || "" }, body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result.status || 200) !== 200) throw new Error(String(result.message || result.msg || "抠图精修请求失败"));
    const resultUrl = await resultImageUrl(result);
    if (!resultUrl) throw new Error("抠图精修暂未返回结果，请稍后重试");
    const imageResponse = await fetch(resultUrl);
    if (!imageResponse.ok) throw new Error("佐糖精修结果下载失败");
    const name = uniqueStoredName(extension(imageResponse.headers.get("content-type")));
    await writeFile(path.join(imageRoot, name), Buffer.from(await imageResponse.arrayBuffer()));
    await db.$transaction([
      db.imageExplodePart.update({ where: { id: part.id }, data: { refinedName: name } }),
      db.imageExplodeEvent.create({ data: { runId, stage: "refine", status: "completed", detail: `已生成“${part.label}”的抠图精修预览；确认后可添加为新候选，原候选不会删除。` } })
    ]);
    return NextResponse.json({ ok: true, partId: part.id, previewReady: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "抠图精修失败，请稍后重试";
    await db.imageExplodeEvent.create({ data: { runId, stage: "refine", status: "failed", detail: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function originalCropForRefinement(part: { x: number; y: number; width: number; height: number; run: { sourceStoredName: string | null; sourceImage: { storedName: string } | null } }) {
  const sourceName = part.run.sourceImage?.storedName || part.run.sourceStoredName;
  if (!sourceName) throw new Error("找不到这张候选对应的原始样品图，无法重新抠图");
  const source = await readStoredFile(part.run.sourceImage ? imageRoot : referenceRoot, sourceName);
  const metadata = await sharp(source).metadata();
  const imageWidth = metadata.width || 1;
  const imageHeight = metadata.height || 1;
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(part.x * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(part.y * imageHeight)));
  const width = Math.max(1, Math.min(imageWidth - left, Math.round(part.width * imageWidth)));
  const height = Math.max(1, Math.min(imageHeight - top, Math.round(part.height * imageHeight)));
  return sharp(source).extract({ left, top, width, height }).png().toBuffer();
}

function extension(type: string | null) { return type?.includes("webp") ? "webp" : type?.includes("jpeg") ? "jpg" : "png"; }
async function resultImageUrl(initial: Record<string, unknown>) {
  const direct = firstUrl(initial);
  if (direct) return direct;
  const taskId = taskIdFrom(initial);
  if (!taskId) return null;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 35000) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const response = await fetch(`${endpoint}/${encodeURIComponent(taskId)}`, { headers: { "X-API-KEY": process.env.TECHSZ_API_KEY || "" } });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || Number(result.status || 200) !== 200) throw new Error(String(result.message || result.msg || "抠图精修任务失败"));
    const url = firstUrl(result);
    if (url) return url;
    const state = Number(((result.data as Record<string, unknown> | undefined)?.state) ?? ((result.data as Record<string, unknown> | undefined)?.task_state) ?? 0);
    if (Number.isFinite(state) && state < 0) throw new Error(String(result.message || result.msg || "抠图精修任务失败"));
  }
  throw new Error("抠图精修等待超时，请稍后重试");
}
function taskIdFrom(value: Record<string, unknown>) {
  const data = value.data as Record<string, unknown> | undefined;
  return String(data?.task_id || data?.taskId || value.task_id || "");
}
function firstUrl(value: unknown): string | null {
  const stack: unknown[] = [value];
  while (stack.length) { const item = stack.pop(); if (!item || typeof item !== "object") continue; for (const child of Object.values(item)) { if (typeof child === "string" && /^https?:\/\//.test(child) && /\.(png|jpe?g|webp)(\?|$)/i.test(child)) return child; if (child && typeof child === "object") stack.push(child); } }
  return null;
}
