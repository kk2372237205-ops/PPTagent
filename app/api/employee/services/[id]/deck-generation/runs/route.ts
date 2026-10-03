import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { deckDefaultStylePackId, deckStylePackIds } from "@/lib/employee-deck-constants";
import { deckSourceRoot, deckThemeRoot, saveFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

const deckRunInclude = {
  slides: { orderBy: { slideIndex: "asc" as const } },
  sources: { orderBy: { createdAt: "asc" as const } },
  pagePlans: { orderBy: { pageIndex: "asc" as const } }
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const runs = await db.deckGenerationRun.findMany({
    where: { serviceId: id },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: deckRunInclude
  });
  return NextResponse.json({ runs });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const form = await request.formData();
  const projectName = String(form.get("projectName") || "").trim();
  const projectType = String(form.get("projectType") || "").trim();
  const brief = String(form.get("brief") || "").trim();
  const referenceText = String(form.get("referenceText") || "").trim();
  const generationMode = form.get("generationMode") === "advanced" ? "advanced" : "quick";
  const outlineText = String(form.get("outlineText") || "").trim();
  const pageCount = Math.max(2, Math.min(30, Number(form.get("pageCount") || 12) || 12));
  const paletteMode = form.get("paletteMode") === "reference" ? "reference" : "preset";
  const requestedStylePack = String(form.get("stylePack") || deckDefaultStylePackId);
  const stylePack = paletteMode === "reference" ? deckDefaultStylePackId : requestedStylePack;
  const unityOptionsJson = normalizeUnityOptions(String(form.get("unityOptions") || "{}"));
  const referenceFiles = form.getAll("references").filter(isUploadedFile);
  const outlineFile = isUploadedFile(form.get("outlineFile")) ? form.get("outlineFile") as File : null;
  const themeReference = isUploadedFile(form.get("themeReference")) ? form.get("themeReference") as File : null;
  const allFiles = [...referenceFiles, ...(outlineFile ? [outlineFile] : []), ...(themeReference ? [themeReference] : [])];

  if (!projectName) return NextResponse.json({ error: "请填写项目名称" }, { status: 400 });
  if (!brief) return NextResponse.json({ error: "请填写项目简介" }, { status: 400 });
  if (generationMode === "advanced" && !outlineText && !outlineFile) {
    return NextResponse.json({ error: "高级版需要填写 PPT 结构，或上传一份大纲文件" }, { status: 400 });
  }
  if (generationMode === "advanced" && referenceFiles.length === 0) {
    return NextResponse.json({ error: "高级版至少需要上传一份内容资料；大纲文件和配色参考图不算内容资料" }, { status: 400 });
  }
  if (paletteMode === "reference" && !themeReference) {
    return NextResponse.json({ error: "选择参考图配色后，请上传一张配色参考图" }, { status: 400 });
  }
  if (!deckStylePackIds.has(stylePack)) return NextResponse.json({ error: "风格包无效" }, { status: 400 });
  if (referenceText.length > 50_000) return NextResponse.json({ error: "粘贴的参考资料不能超过 5 万字，可改为上传文件" }, { status: 400 });
  if (referenceFiles.length > 30) return NextResponse.json({ error: "参考资料最多上传 30 个文件" }, { status: 400 });
  if (allFiles.reduce((total, file) => total + file.size, 0) > 500 * 1024 * 1024) {
    return NextResponse.json({ error: "本次全部资料合计不能超过 500MB" }, { status: 400 });
  }
  for (const file of allFiles) {
    if (file.size > 200 * 1024 * 1024) return NextResponse.json({ error: "单个资料不能超过 200MB" }, { status: 400 });
    if (!isSupportedSource(file, file === themeReference)) {
      return NextResponse.json({ error: `暂不支持 ${file.name}，请使用 PDF、DOCX、XLSX、PPTX、TXT、Markdown、CSV、JSON 或常见图片` }, { status: 400 });
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
  const sources = [...savedReferences, ...(savedOutline ? [savedOutline] : []), ...(savedTheme ? [savedTheme] : [])];

  const run = await db.deckGenerationRun.create({
    data: {
      serviceId: id,
      employeeId: employee.id,
      generationMode,
      projectName: projectName.slice(0, 80),
      projectType: projectType.slice(0, 80),
      brief: brief.slice(0, 12_000),
      referenceText: referenceText.slice(0, 50_000),
      pageCount,
      stylePack,
      paletteMode,
      outlineInputJson: JSON.stringify({ text: outlineText.slice(0, 80_000) }),
      themeReferenceStoredName: savedTheme?.storedName || null,
      sourceCount: sources.length,
      unityOptionsJson,
      status: generationMode === "advanced" || sources.length ? "sources_queued" : "queued",
      sources: { create: sources }
    },
    include: deckRunInclude
  });
  return NextResponse.json({ run }, { status: 202 });
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

function isSupportedSource(file: File, themeOnly = false) {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  if (themeOnly) return [".png", ".jpg", ".jpeg", ".webp"].includes(extension) || file.type.startsWith("image/");
  return [".pdf", ".docx", ".xlsx", ".pptx", ".txt", ".md", ".csv", ".json", ".png", ".jpg", ".jpeg", ".webp"].includes(extension);
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
