import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";

export const runtime = "nodejs";

async function mine(id: string, runId: string) {
  const authorization = await authorizeEmployeeService(id, "imageTools");
  if (!authorization.ok) return { error: NextResponse.json({ error: authorization.error }, { status: authorization.status }) };
  const employee = authorization.access.employee;
  const run = await db.imageExplodeRun.findFirst({ where: { id: runId, serviceId: id, employeeId: employee.id }, include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } }, sourceImage: true } });
  if (!run) return { error: NextResponse.json({ error: "拆图任务不存在或不属于当前员工" }, { status: 404 }) };
  return { run };
}
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params; const result = await mine(id, runId);
  return result.error || NextResponse.json({ run: result.run });
}
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params; const result = await mine(id, runId);
  if (result.error) return result.error;
  const body = await request.json().catch(() => ({}));
  if (body.retry === true) {
    if (!["failed", "cancelled"].includes(result.run!.status)) return NextResponse.json({ error: "当前任务不需要重新拆解" }, { status: 400 });
    await db.$transaction([
      db.imageExplodeTextLayer.deleteMany({ where: { runId: result.run!.id } }),
      db.imageExplodePart.deleteMany({ where: { runId: result.run!.id } }),
      db.imageExplodeRun.update({ where: { id: result.run!.id }, data: { status: "queued", error: null, startedAt: null, finishedAt: null } }),
      db.imageExplodeEvent.create({ data: { runId: result.run!.id, stage: "retry", status: "queued", detail: "已重新加入图片拆解队列。" } })
    ]);
    return NextResponse.json({ ok: true, retried: true });
  }
  if (body.cancel === true) {
    if (["completed", "failed", "cancelled"].includes(result.run!.status)) return NextResponse.json({ error: "当前任务不能再取消" }, { status: 400 });
    await db.$transaction([
      db.imageExplodeRun.update({ where: { id: result.run!.id }, data: { status: "cancelled", finishedAt: new Date() } }),
      db.imageExplodeEvent.create({ data: { runId: result.run!.id, stage: "cancelled", status: "cancelled", detail: "员工已取消拆图任务。" } })
    ]);
    return NextResponse.json({ ok: true, cancelled: true });
  }
  const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds.filter((value: unknown): value is string => typeof value === "string") : null;
  if (!selectedIds) return NextResponse.json({ error: "请选择要保留的候选部件" }, { status: 400 });
  const ids = new Set(selectedIds);
  const lastByVariantGroup = new Map<string, string>();
  for (const partId of selectedIds) {
    const part = result.run!.parts.find(item => item.id === partId);
    if (part?.groupKey) lastByVariantGroup.set(part.groupKey, part.id);
  }
  for (const part of result.run!.parts) {
    if (part.groupKey && ids.has(part.id) && lastByVariantGroup.get(part.groupKey) !== part.id) ids.delete(part.id);
  }
  const updates: unknown[] = Array.isArray(body.textLayers) ? body.textLayers : [];
  const ownedTextIds = new Set(result.run!.textLayers.map(layer => layer.id));
  const textUpdates = updates
    .filter((item: unknown): item is { id: string; content?: string; mode?: string; selected?: boolean } => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && ownedTextIds.has((item as { id: string }).id)))
    .map(item => db.imageExplodeTextLayer.update({ where: { id: item.id }, data: {
      content: typeof item.content === "string" ? item.content.trim().slice(0, 800) : undefined,
      mode: item.mode === "artwork" || item.mode === "skip" ? item.mode : "native",
      selected: typeof item.selected === "boolean" ? item.selected : undefined
    } }));
  await db.$transaction([
    ...result.run!.parts.map(part => db.imageExplodePart.update({ where: { id: part.id }, data: { selected: ids.has(part.id) } })),
    ...textUpdates
  ]);
  return NextResponse.json({ ok: true });
}
