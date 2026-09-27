import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { deckStylePackIds } from "@/lib/employee-deck-constants";
import { deckSourceRoot, deckThemeRoot, saveFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

const deckRunInclude = {
  slides: { orderBy: { slideIndex: "asc" as const } },
  sources: { orderBy: { createdAt: "asc" as const } },
  pagePlans: { orderBy: { pageIndex: "asc" as const } }
};

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { sources: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (run.generationMode !== "advanced") return NextResponse.json({ error: "只有高级版可以返回修改任务资料" }, { status: 400 });
  if (!["sources_queued", "source_processing", "outline_ready", "matching_queued", "matching", "plan_ready", "failed"].includes(run.status)) {
    return NextResponse.json({ error: "页面预览已经开始生成，不能再修改初始任务资料；请使用单页返工。" }, { status: 400 });
  }

  const form = await request.formData();
  const projectName = String(form.get("projectName") || "").trim();
  const projectType = String(form.get("projectType") || "").trim();
  const brief = String(form.get("brief") || "").trim();
  const referenceText = String(form.get("referenceText") || "").trim();
  const outlineText = String(form.get("outlineText") || "").trim();
  const stylePack = String(form.get("stylePack") || run.stylePack);
  const paletteMode = form.get("paletteMode") === "reference" ? "reference" : "preset";
  const unityOptionsJson = normalizeUnityOptions(String(form.get("unityOptions") || run.unityOptionsJson || "{}"));
  const removedSourceIds = new Set(parseStringArray(String(form.get("removedSourceIds") || "[]")));
  const referenceFiles = form.getAll("references").filter(isUploadedFile);
  const outlineFile = isUploadedFile(form.get("outlineFile")) ? form.get("outlineFile") as File : null;
  const themeReference = isUploadedFile(form.get("themeReference")) ? form.get("themeReference") as File : null;
  const newFiles = [...referenceFiles, ...(outlineFile ? [outlineFile] : []), ...(themeReference ? [themeReference] : [])];

  if (!projectName) return NextResponse.json({ error: "请填写项目名称" }, { status: 400 });
  if (!brief) return NextResponse.json({ error: "请填写项目简介" }, { status: 400 });
  if (!deckStylePackIds.has(stylePack)) return NextResponse.json({ error: "风格包无效" }, { status: 400 });
  if (referenceText.length > 50_000) return NextResponse.json({ error: "粘贴的补充要求不能超过 5 万字" }, { status: 400 });
  if (referenceFiles.length > 30) return NextResponse.json({ error: "一次最多新增 30 份内容资料" }, { status: 400 });

  const ownedRemovedIds = new Set(run.sources.filter(source => removedSourceIds.has(source.id)).map(source => source.id));
  if (outlineFile) run.sources.filter(source => source.kind === "outline").forEach(source => ownedRemovedIds.add(source.id));
  if (themeReference || paletteMode === "preset") run.sources.filter(source => source.kind === "theme").forEach(source => ownedRemovedIds.add(source.id));
  const remainingSources = run.sources.filter(source => !ownedRemovedIds.has(source.id));
  const remainingReferences = remainingSources.filter(source => source.kind === "reference");
  const remainingOutline = remainingSources.find(source => source.kind === "outline") || null;
  const remainingTheme = remainingSources.find(source => source.kind === "theme") || null;

  if (remainingReferences.length + referenceFiles.length < 1) {
    return NextResponse.json({ error: "高级版至少保留或新增一份内容资料；大纲和配色参考图不算内容资料" }, { status: 400 });
  }
  if (!outlineText && !outlineFile && !remainingOutline) {
    return NextResponse.json({ error: "请保留文字大纲、已有大纲文件，或上传新的大纲文件" }, { status: 400 });
  }
  if (paletteMode === "reference" && !themeReference && !remainingTheme) {
    return NextResponse.json({ error: "参考图配色模式需要保留或上传一张配色参考图" }, { status: 400 });
  }
  if (remainingReferences.length + referenceFiles.length > 30) {
    return NextResponse.json({ error: "内容资料最多保留 30 份" }, { status: 400 });
  }
  if (remainingSources.reduce((total, source) => total + source.size, 0) + newFiles.reduce((total, file) => total + file.size, 0) > 500 * 1024 * 1024) {
    return NextResponse.json({ error: "本次全部资料合计不能超过 500MB" }, { status: 400 });
  }
  for (const file of newFiles) {
    if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "单个资料不能超过 200MB" }, { status: 400 });
    if (!isSupportedSource(file, file === themeReference)) {
      return NextResponse.json({ error: "暂不支持 " + file.name }, { status: 400 });
    }
  }

  const savedReferences = await Promise.all(referenceFiles.map(async file => ({
    kind: "reference",
    originalName: file.name.slice(0, 240),
    storedName: await saveFile(file, deckSourceRoot),
    mimeType: file.type || "",
    size: file.size
  })));
  const savedOutline = outlineFile ? {
    kind: "outline",
    originalName: outlineFile.name.slice(0, 240),
    storedName: await saveFile(outlineFile, deckSourceRoot),
    mimeType: outlineFile.type || "",
    size: outlineFile.size
  } : null;
  const savedTheme = themeReference ? {
    kind: "theme",
    originalName: themeReference.name.slice(0, 240),
    storedName: await saveFile(themeReference, deckThemeRoot),
    mimeType: themeReference.type || "",
    size: themeReference.size
  } : null;
  const createdSources = [...savedReferences, ...(savedOutline ? [savedOutline] : []), ...(savedTheme ? [savedTheme] : [])];
  const nextThemeStoredName = paletteMode === "reference"
    ? savedTheme?.storedName || remainingTheme?.storedName || null
    : null;

  await db.$transaction(async tx => {
    await tx.deckGenerationEvidence.deleteMany({ where: { runId: run.id } });
    await tx.deckGenerationVisualEvidence.deleteMany({ where: { runId: run.id } });
    await tx.deckGenerationPagePlan.deleteMany({ where: { runId: run.id } });
    await tx.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
    if (ownedRemovedIds.size) {
      await tx.deckGenerationSource.deleteMany({ where: { runId: run.id, id: { in: Array.from(ownedRemovedIds) } } });
    }
    await tx.deckGenerationSource.updateMany({
      where: { runId: run.id },
      data: { status: "queued", extractedText: "", metadataJson: "{}", error: null }
    });
    if (createdSources.length) {
      await tx.deckGenerationSource.createMany({
        data: createdSources.map(source => ({ runId: run.id, ...source }))
      });
    }
    await tx.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        projectName: projectName.slice(0, 80),
        projectType: projectType.slice(0, 80),
        brief: brief.slice(0, 12_000),
        referenceText: referenceText.slice(0, 50_000),
        stylePack,
        paletteMode,
        paletteContractJson: "{}",
        outlineInputJson: JSON.stringify({ text: outlineText.slice(0, 80_000) }),
        analysisSummaryJson: "{}",
        themeReferenceStoredName: nextThemeStoredName,
        sourceCount: remainingSources.length + createdSources.length,
        unityOptionsJson,
        outlineJson: "{}",
        visualIdentityJson: "{}",
        visualStoryboardJson: "{}",
        slideImageSpecsJson: "{}",
        styleFingerprintJson: "{}",
        styleStripStoredName: null,
        deckQualityStatus: "pending",
        deckQualityReportJson: "{}",
        deckQualityAttempts: 0,
        initialImageBudget: 0,
        imageCallsStarted: 0,
        imageCallsCompleted: 0,
        manualImageCalls: 0,
        automaticRedraws: 0,
        status: "sources_queued",
        pdfStoredName: null,
        pptStoredName: null,
        coverStoredName: null,
        codiaTaskId: null,
        codiaResponseJson: "{}",
        startedAt: null,
        planReadyAt: null,
        confirmedAt: null,
        finishedAt: null,
        pdfGeneratedAt: null,
        pptGeneratedAt: null,
        error: null
      }
    });
  });

  const updated = await db.deckGenerationRun.findUnique({ where: { id: run.id }, include: deckRunInclude });
  return NextResponse.json({ run: updated }, { status: 202 });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

function isSupportedSource(file: File, themeOnly = false) {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  if (themeOnly) return [".png", ".jpg", ".jpeg", ".webp"].includes(extension) || file.type.startsWith("image/");
  return [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"].includes(extension);
}

function parseStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(item => String(item || "")) : [];
  } catch {
    return [];
  }
}

function normalizeUnityOptions(value: string) {
  try {
    const parsed = JSON.parse(value);
    return JSON.stringify({
      mainColor: Boolean(parsed.mainColor ?? true),
      headerFooter: Boolean(parsed.headerFooter ?? true),
      backgroundTexture: Boolean(parsed.backgroundTexture ?? true),
      cardStyle: Boolean(parsed.cardStyle ?? false),
      decorativeElements: Boolean(parsed.decorativeElements ?? false)
    });
  } catch {
    return JSON.stringify({
      mainColor: true,
      headerFooter: true,
      backgroundTexture: true,
      cardStyle: false,
      decorativeElements: false
    });
  }
}
