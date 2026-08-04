import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await db.designAgentRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { references: { orderBy: { sortOrder: "asc" }, include: { generatedImage: true } }, events: { orderBy: { createdAt: "asc" } }, evaluations: { orderBy: { createdAt: "asc" } }, generatedJob: { include: { images: true } } }
  });
  if (!run) return NextResponse.json({ error: "智能美化任务不存在" }, { status: 404 });
  return NextResponse.json({ run });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const body = await request.json().catch(() => ({})) as { selectedBatchIndex?: number };
  const selectedBatchIndex = Number(body.selectedBatchIndex);
  if (!Number.isInteger(selectedBatchIndex) || selectedBatchIndex < 0 || selectedBatchIndex > 3) {
    return NextResponse.json({ error: "候选份数选择无效" }, { status: 400 });
  }
  const run = await db.designAgentRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { references: { orderBy: { sortOrder: "asc" }, include: { generatedImage: true } }, events: { orderBy: { createdAt: "asc" } }, evaluations: { orderBy: { createdAt: "asc" } }, generatedJob: { include: { images: true } } }
  });
  if (!run) return NextResponse.json({ error: "智能模式任务不存在" }, { status: 404 });
  const plan = safeJson(run.layoutPlan, {}) as { batches?: Array<{ assetFiles?: Record<string, unknown>; qa?: unknown }>; assetFiles?: Record<string, unknown>; qa?: unknown };
  const batch = Array.isArray(plan.batches) ? plan.batches[selectedBatchIndex] : null;
  if (!batch?.assetFiles) return NextResponse.json({ error: "这份候选尚未生成完成" }, { status: 400 });
  const nextPlan = {
    ...plan,
    assetFiles: { ...batch.assetFiles, batchIndex: selectedBatchIndex },
    qa: batch.qa || plan.qa
  };
  const updated = await db.designAgentRun.update({
    where: { id: run.id },
    data: {
      layoutPlan: JSON.stringify(nextPlan),
      selectedImageId: typeof batch.assetFiles.masterImageId === "string" ? batch.assetFiles.masterImageId : run.selectedImageId
    },
    include: { references: { orderBy: { sortOrder: "asc" }, include: { generatedImage: true } }, events: { orderBy: { createdAt: "asc" } }, evaluations: { orderBy: { createdAt: "asc" } }, generatedJob: { include: { images: true } } }
  });
  return NextResponse.json({ run: updated });
}

function safeJson(value: string, fallback: unknown) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
