import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { pptPolishWorkerHealth } from "@/lib/ppt-polish-worker-health";
import { workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (!["failed", "generating"].includes(run.status)) {
    return NextResponse.json({ error: "当前美化任务不需要继续生成" }, { status: 400 });
  }

  const workerHealth = pptPolishWorkerHealth();
  if (!workerHealth.ok) {
    return NextResponse.json({ error: workerHealth.message || "PPT 美化 Worker 未运行/已停止，请重启 npm run dev" }, { status: 503 });
  }

  const now = new Date().toISOString();
  const slides = Array.isArray(run.slides) ? run.slides : [];
  const nextSlides = slides.map((slide: { status?: string; storedName?: string; [key: string]: unknown }) => {
    if (slide.status === "completed" && slide.storedName) return slide;
    return { ...slide, status: "queued", error: "", updatedAt: now };
  });
  const completed = nextSlides.filter((slide: { status?: string; storedName?: string }) => slide.status === "completed" && slide.storedName).length;
  const updated = {
    ...run,
    status: completed >= nextSlides.length && nextSlides.length > 0 ? "review_ready" : "generating",
    slides: nextSlides,
    error: "",
    updatedAt: now
  };
  await writePolishRun(runId, updated);
  return NextResponse.json({ run: updated }, { status: 202 });
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
