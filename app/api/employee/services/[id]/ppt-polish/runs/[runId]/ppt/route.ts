import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { pptPolishWorkerHealth } from "@/lib/ppt-polish-worker-health";
import { documentRoot, workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (run.status === "ppt_ready") return NextResponse.json({ run });
  const workerHealth = pptPolishWorkerHealth();
  if (!workerHealth.ok) {
    return NextResponse.json({ error: workerHealth.message || "PPT 美化 Worker 未运行/已停止，请重启 npm run dev:lite 或 npm run dev" }, { status: 503 });
  }
  if (["pdf_queued", "ppt_queued", "ppt_processing"].includes(run.status)) return NextResponse.json({ run }, { status: 202 });
  if (!["review_ready", "pdf_ready"].includes(run.status)) {
    return NextResponse.json({ error: "请等待全部页面预览图生成完成后再转 PPT" }, { status: 400 });
  }
  if (!run.slides?.length || run.slides.some((slide: { status?: string; storedName?: string }) => slide.status !== "completed" || !slide.storedName)) {
    return NextResponse.json({ error: "还有页面没有生成完成" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const updated = run.status === "pdf_ready"
    ? { ...run, status: "ppt_queued", pptStoredName: undefined, codiaTaskId: undefined, codiaResponse: undefined, error: "", updatedAt: now }
    : { ...run, status: "pdf_queued", pdfStoredName: undefined, pptStoredName: undefined, codiaTaskId: undefined, codiaResponse: undefined, error: "", updatedAt: now };
  await writePolishRun(runId, updated);
  return NextResponse.json({ run: updated }, { status: 202 });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (!run.pptStoredName || run.status !== "ppt_ready") return NextResponse.json({ error: "PPT 尚未生成完成" }, { status: 404 });
  const file = await readFile(path.join(documentRoot, path.basename(run.pptStoredName)));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName(run.sourceName)}-美化版.pptx`)}`,
      "Cache-Control": "private, no-store"
    }
  });
}

async function readPolishRun(runId: string) {
  try {
    return JSON.parse(await readFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function writePolishRun(runId: string, run: unknown) {
  await writeFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), JSON.stringify(run, null, 2), "utf8");
}

function baseName(value: string) {
  return String(value || "PPT").replace(/\.(pptx?|pdf)$/i, "").slice(0, 80) || "PPT";
}
