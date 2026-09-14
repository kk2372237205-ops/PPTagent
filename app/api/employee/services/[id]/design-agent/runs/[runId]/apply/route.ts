import { randomBytes } from "crypto";
import path from "path";
import { copyFile } from "fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { appendEditableDesignSlide, appendExplodedImageSlide, repairPresentationSlideIndex, type ExplodedSlidePart } from "@/lib/pptx-design-slide";
import { documentRoot, imageRoot, uniqueStoredName, versionRoot } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await db.designAgentRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id, status: "completed" },
    include: { generatedJob: { include: { images: true } }, evaluations: { orderBy: { createdAt: "desc" }, take: 1 }, service: { include: { workDocument: { include: { versions: true } } } } }
  });
  if (!run?.service.workDocument) return NextResponse.json({ error: "请先创建工作 PPT，再应用智能美化方案" }, { status: 400 });
  const document = run.service.workDocument;
  if (run.appliedAt) {
    const repairedName = uniqueStoredName("pptx");
    const repair = await repairPresentationSlideIndex(
      path.join(documentRoot, document.storedName),
      path.join(documentRoot, repairedName)
    );
    if (repair.repaired) {
      await db.$transaction([
        db.workDocument.update({ where: { id: document.id }, data: { storedName: repairedName, documentKey: `repair-${Date.now()}-${randomBytes(6).toString("hex")}` } }),
        db.designAgentEvent.create({ data: { runId: run.id, stage: "apply-sync", status: "completed", detail: `已修复并同步 PPT 幻灯片目录，共 ${repair.slideCount} 页` } })
      ]);
    }
    return NextResponse.json({ ok: true, alreadyApplied: true, repaired: repair.repaired, slideNumber: run.appliedSlideNumber || repair.slideCount });
  }
  const plan = JSON.parse(run.layoutPlan || "{}");
  const assetFiles = plan?.assetFiles && typeof plan.assetFiles === "object" ? plan.assetFiles : {};
  if (assetFiles.renderMode === "openai-smart-image-v1") {
    return NextResponse.json({ error: "当前智能模式只生成精美 PNG，后续写入 PPT 的流程已暂时关闭。" }, { status: 400 });
  }
  if (assetFiles.renderMode === "master-render-rebuild" || assetFiles.renderMode === "openai-smart-mode-v1") {
    const cleanBackgroundStoredName = typeof assetFiles.cleanBackgroundStoredName === "string" ? path.basename(assetFiles.cleanBackgroundStoredName) : null;
    const reconstructionRunId = typeof assetFiles.reconstructionRunId === "string" ? assetFiles.reconstructionRunId : "";
    if (!cleanBackgroundStoredName || !reconstructionRunId) {
      return NextResponse.json({ error: "该智能美化任务还没有完成“干净背景 + 拆图重建”，请等待任务完成后再新增到 PPT。" }, { status: 400 });
    }
    const explodeRun = await db.imageExplodeRun.findFirst({
      where: { id: reconstructionRunId, serviceId: id, employeeId: employee.id, status: "completed" },
      include: { parts: { where: { selected: true }, orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: { orderBy: { createdAt: "asc" } } }
    });
    if (!explodeRun) return NextResponse.json({ error: "图片炸开重建尚未完成，请稍后刷新后再试。" }, { status: 400 });
    const selectedGroupIds = new Set(explodeRun.parts.filter(part => ["group", "panel-group"].includes(part.kind)).map(part => part.semanticId));
    if (explodeRun.parts.some(part => part.parentSemanticId && selectedGroupIds.has(part.parentSemanticId))) {
      return NextResponse.json({ error: "整组候选与子部件不能同时导入，请先在图片炸开页只保留一种颗粒度。" }, { status: 400 });
    }
    const duplicateVariants = new Map<string, number>();
    for (const part of explodeRun.parts.filter(part => part.groupKey && part.kind !== "background")) {
      duplicateVariants.set(part.groupKey!, (duplicateVariants.get(part.groupKey!) || 0) + 1);
    }
    if ([...duplicateVariants.values()].some(count => count > 1)) {
      return NextResponse.json({ error: "同一部件的无字版与原字效果版不能同时导入，请先在图片炸开页确认文字策略。" }, { status: 400 });
    }
    const parts: ExplodedSlidePart[] = [{
      label: "AI 干净背景",
      kind: "clean-background",
      imagePath: path.join(imageRoot, cleanBackgroundStoredName),
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      zIndex: -1000
    }];
    for (const part of explodeRun.parts.filter(part => part.kind !== "background" && !["crop-part", "raw-part-prepared"].includes(part.variant))) {
      const storedName = part.refinedName || part.storedName;
      if (!storedName && !part.textContent) continue;
      parts.push({
        label: part.label,
        kind: part.kind,
        textContent: part.textContent,
        imagePath: part.textContent ? null : path.join(imageRoot, path.basename(storedName || "")),
        x: part.x,
        y: part.y,
        width: part.width,
        height: part.height,
        zIndex: part.zIndex
      });
    }
    const originalTextGroups = new Set(explodeRun.parts.filter(part => part.variant === "original-text" && part.groupKey).map(part => part.groupKey));
    const parentZIndex = new Map(explodeRun.parts.filter(part => part.groupKey).map(part => [part.groupKey!, part.zIndex]));
    for (const layer of explodeRun.textLayers.filter(layer => layer.selected && layer.mode === "native" && !originalTextGroups.has(layer.groupKey || ""))) {
      parts.push({
        label: `可编辑文字：${layer.content.slice(0, 24)}`,
        kind: "text",
        textContent: layer.content,
        imagePath: null,
        rotation: layer.rotation,
        textStyle: parseStyle(layer.styleJson),
        x: layer.x,
        y: layer.y,
        width: layer.width,
        height: layer.height,
        zIndex: (parentZIndex.get(layer.groupKey || "") || 900) + 1
      });
    }
    if (parts.length <= 1) return NextResponse.json({ error: "没有可导入的拆图部件，请先在图片炸开页勾选至少一个部件。" }, { status: 400 });
    const nextVersion = document.versions.length + 1;
    const backupName = uniqueStoredName("pptx");
    await copyFile(path.join(documentRoot, document.storedName), path.join(versionRoot, backupName));
    const nextName = uniqueStoredName("pptx");
    const slideNumber = await appendExplodedImageSlide(path.join(documentRoot, document.storedName), path.join(documentRoot, nextName), parts);
    const evaluation = run.evaluations[0] || null;
    await db.$transaction([
      db.workVersion.create({ data: { workDocumentId: document.id, createdById: employee.id, version: nextVersion, label: `智能美化重建前备份 ${nextVersion}`, storedName: backupName } }),
      db.workDocument.update({ where: { id: document.id }, data: { storedName: nextName, originalName: document.originalName, documentKey: `agent-${Date.now()}-${randomBytes(6).toString("hex")}` } }),
      db.designAgentRun.update({ where: { id: run.id }, data: { appliedAt: new Date(), appliedSlideNumber: slideNumber } }),
      db.designPreferenceMemory.create({ data: {
        serviceId: id, employeeId: employee.id, industry: run.service.category || "", pageType: String(plan.pageType || "single-slide"),
        style: String(plan.visualDirection || plan.imageDirection || plan.backgroundDirection || "").slice(0, 500), paletteJson: JSON.stringify(Array.isArray(plan.palette) ? plan.palette : []),
        informationTone: String(plan.informationTone || "balanced").slice(0, 80), outcome: "accepted",
        signalsJson: JSON.stringify({
          runId: run.id,
          score: evaluation?.totalScore || null,
          scores: evaluation ? JSON.parse(evaluation.scoresJson || "{}") : null,
          reasons: evaluation ? JSON.parse(evaluation.reasonsJson || "[]") : null,
          generationMode: run.generationMode,
          generationAttempts: run.generationAttempts,
          selectedImageId: run.selectedImageId,
          reconstructionRunId,
          acceptedSlideNumber: slideNumber
        })
      } }),
      db.designAgentEvent.create({ data: { runId: run.id, stage: "apply", status: "completed", detail: `已在文稿末尾新增第 ${slideNumber} 页可编辑重建页。` } }),
      db.serviceActivity.create({ data: { serviceId: id, employeeId: employee.id, action: "智能美化", detail: `已追加第 ${slideNumber} 页可编辑重建页。` } })
    ]);
    return NextResponse.json({ ok: true, slideNumber });
  }
  const image = run.generatedJob?.images[0];
  if (!image) return NextResponse.json({ error: "智能美化预览图不存在" }, { status: 400 });
  const nextVersion = document.versions.length + 1;
  const backupName = uniqueStoredName("pptx");
  await copyFile(path.join(documentRoot, document.storedName), path.join(versionRoot, backupName));
  const nextName = uniqueStoredName("pptx");
  const backgroundStoredName = typeof assetFiles.backgroundStoredName === "string" ? path.basename(assetFiles.backgroundStoredName) : null;
  const heroStoredName = typeof assetFiles.heroStoredName === "string" ? path.basename(assetFiles.heroStoredName) : null;
  const slideNumber = await appendEditableDesignSlide(
    path.join(documentRoot, document.storedName),
    path.join(documentRoot, nextName),
    {
      backgroundImagePath: backgroundStoredName ? path.join(imageRoot, backgroundStoredName) : null,
      heroImagePath: path.join(imageRoot, heroStoredName || image.storedName)
    },
    plan
  );
  const evaluation = run.evaluations[0] || null;
  await db.$transaction([
    db.workVersion.create({ data: { workDocumentId: document.id, createdById: employee.id, version: nextVersion, label: `智能美化前备份 ${nextVersion}`, storedName: backupName } }),
    db.workDocument.update({ where: { id: document.id }, data: { storedName: nextName, originalName: document.originalName, documentKey: `agent-${Date.now()}-${randomBytes(6).toString("hex")}` } }),
    db.designAgentRun.update({ where: { id: run.id }, data: { appliedAt: new Date(), appliedSlideNumber: slideNumber } }),
    db.designPreferenceMemory.create({ data: {
      serviceId: id, employeeId: employee.id, industry: run.service.category || "", pageType: String(plan.pageType || "single-slide"),
      style: String(plan.visualDirection || plan.imageDirection || plan.backgroundDirection || "").slice(0, 500), paletteJson: JSON.stringify(Array.isArray(plan.palette) ? plan.palette : []),
      informationTone: String(plan.informationTone || "balanced").slice(0, 80), outcome: "accepted",
      signalsJson: JSON.stringify({
        runId: run.id,
        score: evaluation?.totalScore || null,
        scores: evaluation ? JSON.parse(evaluation.scoresJson || "{}") : null,
        reasons: evaluation ? JSON.parse(evaluation.reasonsJson || "[]") : null,
        generationMode: run.generationMode,
        generationAttempts: run.generationAttempts,
        selectedImageId: run.selectedImageId,
        layout: plan.composition || plan.layout || "",
        title: plan.title || "",
        subtitle: plan.subtitle || "",
        heroSubject: plan.heroSubject || "",
        backgroundDirection: plan.backgroundDirection || "",
        visualDirection: plan.visualDirection || "",
        acceptedSlideNumber: slideNumber
      })
    } }),
    db.designAgentEvent.create({ data: { runId: run.id, stage: "apply", status: "completed", detail: `已在文稿末尾新增第 ${slideNumber} 页可编辑美化页` } }),
    db.serviceActivity.create({ data: { serviceId: id, employeeId: employee.id, action: "智能美化", detail: `已追加第 ${slideNumber} 页可编辑美化页` } })
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
