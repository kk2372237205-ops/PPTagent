import { randomBytes } from "crypto";
import path from "path";
import { copyFile } from "fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { appendExplodedImageSlide, type ExplodedSlidePart } from "@/lib/pptx-design-slide";
import { documentRoot, imageRoot, uniqueStoredName, versionRoot } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "imageTools");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await db.imageExplodeRun.findFirst({
    where: { id: runId, serviceId: id, status: "completed" },
    include: { parts: { where: { selected: true }, orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: { orderBy: { createdAt: "asc" } }, service: { include: { workDocument: { include: { versions: true } } } } }
  });
  if (!run?.service.workDocument) return NextResponse.json({ error: "请先创建工作 PPT，再导入拆解部件" }, { status: 400 });
  if (run.appliedAt) return NextResponse.json({ ok: true, alreadyApplied: true, slideNumber: run.appliedSlideNumber });
  if (!run.parts.length) return NextResponse.json({ error: "请至少勾选一个部件后再导入" }, { status: 400 });
  const backgrounds = run.parts.filter(part => part.kind === "background");
  if (backgrounds.length !== 1) return NextResponse.json({ error: "请只保留一个背景层，避免导入后出现整页重影。" }, { status: 400 });
  const selectedGroupIds = new Set(run.parts.filter(part => ["group", "panel-group"].includes(part.kind)).map(part => part.semanticId));
  if (run.parts.some(part => part.parentSemanticId && selectedGroupIds.has(part.parentSemanticId))) {
    return NextResponse.json({ error: "整组候选与其子部件不能同时导入，请只保留一种颗粒度。" }, { status: 400 });
  }
  const duplicateVariants = new Map<string, number>();
  for (const part of run.parts.filter(part => part.groupKey && part.kind !== "background")) {
    duplicateVariants.set(part.groupKey!, (duplicateVariants.get(part.groupKey!) || 0) + 1);
  }
  if ([...duplicateVariants.values()].some(count => count > 1)) return NextResponse.json({ error: "同一部件的无字版与原字效果版不能同时导入。" }, { status: 400 });
  const document = run.service.workDocument;
  const parts: ExplodedSlidePart[] = run.parts.filter(part => !["crop-part", "raw-part-prepared"].includes(part.variant)).map(part => ({
    label: part.label, kind: part.kind, textContent: part.textContent,
    imagePath: part.textContent ? null : path.join(imageRoot, part.refinedName || part.storedName || ""),
    x: part.x, y: part.y, width: part.width, height: part.height, zIndex: part.zIndex
  })).filter(part => part.textContent || part.imagePath);
  const originalTextGroups = new Set(run.parts.filter(part => part.variant === "original-text" && part.groupKey).map(part => part.groupKey));
  const parentZIndex = new Map(run.parts.filter(part => part.groupKey).map(part => [part.groupKey!, part.zIndex]));
  const textLayers = run.textLayers
    .filter(layer => layer.selected && layer.mode === "native" && !originalTextGroups.has(layer.groupKey || ""))
    .map(layer => ({
      label: `可编辑文字：${layer.content.slice(0, 24)}`,
      kind: "text",
      textContent: layer.content,
      imagePath: null,
      rotation: layer.rotation,
      textStyle: parseStyle(layer.styleJson),
      x: layer.x, y: layer.y, width: layer.width, height: layer.height,
      zIndex: (parentZIndex.get(layer.groupKey || "") || 900) + 1
    }));
  parts.push(...textLayers);
  const nextVersion = document.versions.length + 1;
  const backupName = uniqueStoredName("pptx");
  await copyFile(path.join(documentRoot, document.storedName), path.join(versionRoot, backupName));
  const nextName = uniqueStoredName("pptx");
  const slideNumber = await appendExplodedImageSlide(path.join(documentRoot, document.storedName), path.join(documentRoot, nextName), parts);
  await db.$transaction([
    db.workVersion.create({ data: { workDocumentId: document.id, createdById: employee.id, version: nextVersion, label: `图片炸开前备份 ${nextVersion}`, storedName: backupName } }),
    db.workDocument.update({ where: { id: document.id }, data: { storedName: nextName, documentKey: `explode-${Date.now()}-${randomBytes(6).toString("hex")}` } }),
    db.imageExplodeRun.update({ where: { id: run.id }, data: { appliedAt: new Date(), appliedSlideNumber: slideNumber } }),
    db.imageExplodeEvent.create({ data: { runId: run.id, stage: "apply", status: "completed", detail: `已在文稿末尾新增第 ${slideNumber} 页，保留 ${parts.length} 个独立部件。` } }),
    db.serviceActivity.create({ data: { serviceId: id, employeeId: employee.id, action: "图片炸开", detail: `已新增第 ${slideNumber} 页可编辑零部件。` } })
  ]);
  return NextResponse.json({ ok: true, slideNumber });
}

function parseStyle(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as { color?: string; fontSize?: number; bold?: boolean; italic?: boolean; align?: string } : {};
  } catch {
    return {};
  }
}
