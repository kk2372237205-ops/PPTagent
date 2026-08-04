import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: true, pagePlans: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (run.status !== "plan_ready") return NextResponse.json({ error: "请等待视觉方案生成完成后再确认" }, { status: 400 });
  if (!run.slides.length) return NextResponse.json({ error: "视觉方案缺少页面规格，请重新生成方案" }, { status: 400 });

  if (run.generationMode === "advanced" && !run.pagePlans.length) {
    return NextResponse.json({ error: "高级版缺少已确认的逐页内容方案" }, { status: 400 });
  }
  await db.deckGenerationSlide.updateMany({
    where: { runId: run.id, status: "waiting" },
    data: { status: "queued", error: null }
  });
  const updated = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "generating", confirmedAt: new Date(), error: null },
    include: { slides: { orderBy: { slideIndex: "asc" } }, sources: true, pagePlans: { orderBy: { pageIndex: "asc" } } }
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
