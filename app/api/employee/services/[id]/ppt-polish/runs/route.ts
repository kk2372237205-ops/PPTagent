import path from "path";
import { randomUUID } from "crypto";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { pptPolishWorkerHealth } from "@/lib/ppt-polish-worker-health";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";
import { documentRoot, ensureWorkspaceDirectories, saveFile, workspaceRoot } from "@/lib/workspace-storage";

export const runtime = "nodejs";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");
const allowedStylePacks = new Set([
  "blue-gold-tech",
  "white-green-tech",
  "black-gold-business",
  "blue-purple-ai",
  "red-white-government",
  "minimal-academic",
  "vivid-roadshow"
]);

type PolishRun = {
  id: string;
  serviceId: string;
  employeeId: string;
  status: "plan_ready" | "queued" | "confirmed" | "planning" | "generating" | "review_ready" | "pdf_queued" | "pdf_ready" | "ppt_queued" | "ppt_processing" | "ppt_ready" | "failed";
  sourceMode: "current" | "upload";
  sourceName: string;
  sourceStoredName: string;
  stylePack: string;
  note: string;
  options: Record<string, boolean>;
  pageNotes: { id: string; pages: string; note: string }[];
  pageCount: number;
  sourceSnapshot?: { pageCount: number; pages: { pageIndex: number; storedName: string; width: number; height: number; format: string }[]; createdAt: string; manifest: string };
  slides: { slideIndex: number; title: string; originalText: string; note: string; status: string; storedName?: string; prompt?: string; lastInstruction?: string; error?: string; updatedAt: string }[];
  pdfStoredName?: string;
  pptStoredName?: string;
  coverStoredName?: string;
  codiaTaskId?: string;
  confirmedAt?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const runs = await readRuns(id, employee.id);
  return NextResponse.json({ runs, workerHealth: pptPolishWorkerHealth() });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const service = await db.service.findUnique({ where: { id }, include: { workDocument: true } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const form = await request.formData();
  const sourceMode = String(form.get("sourceMode") || "current") === "upload" ? "upload" : "current";
  const stylePack = String(form.get("stylePack") || "blue-gold-tech");
  const note = cleanText(String(form.get("note") || ""), 3000);
  const options = normalizeOptions(String(form.get("options") || "{}"));
  const pageNotes = normalizePageNotes(String(form.get("pageNotes") || "[]"));
  if (!allowedStylePacks.has(stylePack)) return NextResponse.json({ error: "目标风格无效" }, { status: 400 });
  if (!note && pageNotes.length === 0) return NextResponse.json({ error: "请填写整套修改方向或逐页修改想法" }, { status: 400 });

  await ensurePolishDirectories();
  let sourceName = "";
  let sourceStoredName = "";

  if (sourceMode === "current") {
    if (!service.workDocument) return NextResponse.json({ error: "当前订单还没有工作文稿，请先上传 PPT" }, { status: 400 });
    sourceName = service.workDocument.originalName;
    sourceStoredName = service.workDocument.storedName;
  } else {
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: "请上传需要美化的 PPT 文件" }, { status: 400 });
    const ext = path.extname(file.name).toLowerCase();
    const isPresentation = ext === ".pptx" || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (!isPresentation) return NextResponse.json({ error: "请上传 PPTX 文件" }, { status: 400 });
    if (file.size > workPresentationMaxBytes) return NextResponse.json({ error: `PPT 文件不能超过 ${workPresentationMaxLabel}` }, { status: 400 });
    sourceName = file.name || "待美化PPT.pptx";
    sourceStoredName = await saveFile(file, documentRoot, "pptx");
  }

  const now = new Date().toISOString();
  const run: PolishRun = {
    id: randomUUID(),
    serviceId: id,
    employeeId: employee.id,
    status: "plan_ready",
    sourceMode,
    sourceName: cleanText(sourceName, 180),
    sourceStoredName,
    stylePack,
    note,
    options,
    pageNotes,
    pageCount: 0,
    slides: [],
    createdAt: now,
    updatedAt: now
  };
  await writeFile(path.join(polishRunRoot, `${run.id}.json`), JSON.stringify(run, null, 2), "utf8");
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: employee.id,
      action: "ppt-polish",
      detail: `提交美化方案：${run.sourceName}`
    }
  });
  return NextResponse.json({ run }, { status: 202 });
}

async function ensurePolishDirectories() {
  await ensureWorkspaceDirectories();
  await mkdir(polishRunRoot, { recursive: true });
}

async function readRuns(serviceId: string, employeeId: string) {
  await ensurePolishDirectories();
  const entries = await readdir(polishRunRoot, { withFileTypes: true }).catch(() => []);
  const runs: PolishRun[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const content = await readFile(path.join(polishRunRoot, entry.name), "utf8");
      const run = JSON.parse(content) as PolishRun;
      if (isUnstartedLegacyRun(run)) run.status = "plan_ready";
      if (run.serviceId === serviceId && run.employeeId === employeeId) runs.push(run);
    } catch {
      // Ignore a single malformed run file so the panel can still load.
    }
  }
  return runs.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 8);
}

function isUnstartedLegacyRun(run: PolishRun) {
  return ["queued", "confirmed", "planning", "generating"].includes(run.status) && !run.pageCount && !run.slides?.length;
}

function cleanText(value: string, maxLength: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizeOptions(value: string) {
  const defaults = {
    keepText: true,
    keepNumbers: true,
    mainColor: true,
    headerFooter: true,
    backgroundTexture: true,
    cardStyle: false,
    decorativeElements: false,
    reduceText: true,
    sourcePageReference: false
  };
  try {
    const parsed = JSON.parse(value);
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => [key, Boolean(parsed?.[key] ?? fallback)]));
  } catch {
    return defaults;
  }
}

function normalizePageNotes(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => ({
        id: cleanText(String(item?.id || `note-${index}`), 60),
        pages: cleanText(String(item?.pages || ""), 40),
        note: cleanText(String(item?.note || ""), 1000)
      }))
      .filter(item => item.pages && item.note)
      .slice(0, 30);
  } catch {
    return [];
  }
}
