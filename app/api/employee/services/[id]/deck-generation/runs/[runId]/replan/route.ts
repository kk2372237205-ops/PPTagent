import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { deckStylePackIds } from "@/lib/employee-deck-constants";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const body = await request.json().catch(() => ({})) as { stylePack?: string };
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: true, pagePlans: true, sources: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (!["plan_ready", "failed"].includes(run.status)) {
    return NextResponse.json({ error: "只有方案阶段可以重新生成方案" }, { status: 400 });
  }
  const stylePack = String(body.stylePack || run.stylePack);
  if (!deckStylePackIds.has(stylePack)) return NextResponse.json({ error: "风格包无效" }, { status: 400 });

  await db.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
  const advancedNeedsSourceRetry = run.generationMode === "advanced" && (
    run.sources.some(source => source.status === "failed")
    || (run.paletteMode === "reference" && !run.sources.some(source => source.kind === "theme" && source.status === "completed"))
  );
  const nextStatus = run.generationMode === "advanced"
    ? (advancedNeedsSourceRetry || !run.pagePlans.length ? "sources_queued" : "matching_queued")
    : "queued";
  const updated = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: nextStatus,
      stylePack,
      outlineJson: "{}",
      visualIdentityJson: "{}",
      visualStoryboardJson: "{}",
      slideImageSpecsJson: "{}",
      ...(run.generationMode === "advanced" ? {
        styleFingerprintJson: "{}",
        styleStripStoredName: null,
        deckQualityStatus: "pending",
        deckQualityReportJson: "{}",
        deckQualityAttempts: 0,
        initialImageBudget: 0,
        imageCallsStarted: 0,
        imageCallsCompleted: 0,
        manualImageCalls: 0,
        automaticRedraws: 0
      } : {}),
      pdfStoredName: null,
      pptStoredName: null,
      coverStoredName: null,
      codiaTaskId: null,
      codiaResponseJson: "{}",
      error: null,
      startedAt: null,
      planReadyAt: null,
      confirmedAt: null,
      finishedAt: null,
      pdfGeneratedAt: null,
      pptGeneratedAt: null
    },
    include: { slides: { orderBy: { slideIndex: "asc" } }, sources: true, pagePlans: { orderBy: { pageIndex: "asc" } } }
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
