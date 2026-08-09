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
  if (run.generationMode === "advanced" && run.pagePlans.length !== run.slides.length) {
    return NextResponse.json({ error: "高级版整套方案与页面规格数量不一致，请重新整理方案后再确认" }, { status: 400 });
  }
  const updated = await db.$transaction(async tx => {
    for (const slide of run.slides) {
      const requestKey = `initial:${run.id}:${slide.id}`;
      if (run.generationMode === "advanced") {
        await tx.deckGenerationImageCall.create({
          data: { requestKey, kind: "initial", runId: run.id, slideId: slide.id }
        });
      }
      await tx.deckGenerationSlide.update({
        where: { id: slide.id },
        data: {
          status: "queued",
          ...(run.generationMode === "advanced" ? {
            qualityStatus: "not_applicable",
            qualityReportJson: "{}",
            qualityAttempts: 0,
            qualityCheckedAt: null,
            pendingImageCallKey: requestKey
          } : {}),
          error: null
        }
      });
    }
    await tx.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "generating",
        ...(run.generationMode === "advanced" ? {
          deckQualityStatus: "pending",
          deckQualityReportJson: "{}",
          deckQualityAttempts: 0,
          initialImageBudget: run.slides.length,
          imageCallsStarted: 0,
          imageCallsCompleted: 0,
          manualImageCalls: 0,
          automaticRedraws: 0
        } : {}),
        confirmedAt: new Date(),
        finishedAt: null,
        error: null
      }
    });
    return tx.deckGenerationRun.findUnique({
      where: { id: run.id },
      include: { slides: { orderBy: { slideIndex: "asc" } }, sources: true, pagePlans: { orderBy: { pageIndex: "asc" } } }
    });
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
