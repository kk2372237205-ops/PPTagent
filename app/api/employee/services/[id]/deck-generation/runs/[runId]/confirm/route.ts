import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (run.status !== "plan_ready") return NextResponse.json({ error: "请等待视觉方案生成完成后再确认" }, { status: 400 });
  if (!run.slides.length) return NextResponse.json({ error: "视觉方案缺少页面规格，请重新生成方案" }, { status: 400 });

  await db.deckGenerationSlide.updateMany({
    where: { runId: run.id, status: "waiting" },
    data: { status: "queued", error: null }
  });
  const updated = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "generating", confirmedAt: new Date(), error: null },
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
