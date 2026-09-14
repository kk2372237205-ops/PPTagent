import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { pptPolishWorkerHealth } from "@/lib/ppt-polish-worker-health";
import { workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");
const regenerateRoutes = [
  "路线 A：全屏电影级主视觉 + 少量悬浮信息芯片，去掉密集卡片堆叠。",
  "路线 B：左侧强标题/右侧大视觉焦点，用斜向光轨和纵深空间组织画面。",
  "路线 C：中心符号或核心物体放大，周围用少量玻璃态模块形成秩序。",
  "路线 D：发布会大屏风格，留白更大胆，标题更有冲击力，信息压缩成短句。"
];

const closerRoutes = [
  "贴近路线 A：严格学习上一页的页眉、页脚、蓝金光效、玻璃卡片和图标线条节奏。",
  "贴近路线 B：保留当前页语义，但把版式密度、标题位置、卡片尺寸和背景纵深向上一页靠拢。",
  "贴近路线 C：用上一页的视觉秩序重排本页，不复制上一页正文、人物、图表或数据。"
];

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; runId: string; slideIndex: string }> }) {
  const { id, runId, slideIndex } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (!["generating", "review_ready", "pdf_ready", "ppt_ready", "failed"].includes(run.status)) {
    return NextResponse.json({ error: "当前美化任务还不能局部重生" }, { status: 400 });
  }
  const workerHealth = pptPolishWorkerHealth();
  if (!workerHealth.ok) {
    return NextResponse.json({ error: workerHealth.message || "PPT 美化 Worker 未运行/已停止，请重启 npm run dev:lite 或 npm run dev" }, { status: 503 });
  }
  const targetIndex = Number(slideIndex);
  const slide = run.slides?.find((item: { slideIndex: number }) => item.slideIndex === targetIndex);
  if (!slide) return NextResponse.json({ error: "页面不存在" }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { action?: string };
  const now = new Date().toISOString();
  const requestId = Date.now();
  const action = body.action === "closer_previous" ? "closer_previous" : "reroll";
  const instruction = buildInstruction(action, requestId);
  const updated = {
    ...run,
    status: "generating",
    pdfStoredName: undefined,
    pptStoredName: undefined,
    codiaTaskId: undefined,
    codiaResponse: undefined,
    error: "",
    updatedAt: now,
    slides: run.slides.map((item: { slideIndex: number }) => item.slideIndex === targetIndex
      ? { ...item, status: "queued", storedName: undefined, prompt: undefined, error: "", lastInstruction: instruction, updatedAt: now }
      : item)
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

function buildInstruction(action: "reroll" | "closer_previous", requestId: number) {
  const routes = action === "closer_previous" ? closerRoutes : regenerateRoutes;
  const route = routes[requestId % routes.length];
  if (action === "closer_previous") {
    return [
      "Action: closer_previous",
      "更贴近上一页：重新生成本页，不是复用旧图。让页眉页脚、主色、背景质感、卡片边框、光效和装饰节奏明显接近上一页。",
      "保留本页语义和关键信息，但必须重排当前页面，不要复制上一页正文、图表、数据、人物或主视觉。",
      route,
      "输出应肉眼可见地不同于当前版本；如果只是轻微改色或局部挪动，视为失败。",
      `Regeneration request id: ${requestId}.`
    ].join("\n");
  }
  return [
    "Action: reroll",
    "重新生成本页：保持原页语义、标题和关键信息，但必须大幅改变画面构图、视觉焦点、信息层级和版式路线。",
    "不要复用上一版的主视觉位置、卡片排列、标题比例、背景路径或装饰结构。",
    route,
    "输出应肉眼可见地不同于当前版本；如果只是轻微改色或局部挪动，视为失败。",
    `Regeneration request id: ${requestId}.`
  ].join("\n");
}
