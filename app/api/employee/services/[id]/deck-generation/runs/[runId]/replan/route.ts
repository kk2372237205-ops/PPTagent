import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

const allowedStylePacks = new Set([
  "blue-gold-tech",
  "white-green-tech",
  "black-gold-business",
  "blue-purple-ai",
  "red-white-government",
  "minimal-academic",
  "vivid-roadshow"
]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const body = await request.json().catch(() => ({})) as { stylePack?: string };
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (!["plan_ready", "failed"].includes(run.status)) {
    return NextResponse.json({ error: "只有方案阶段可以重新生成方案" }, { status: 400 });
  }
  const stylePack = String(body.stylePack || run.stylePack);
  if (!allowedStylePacks.has(stylePack)) return NextResponse.json({ error: "风格包无效" }, { status: 400 });

  await db.deckGenerationSlide.deleteMany({ where: { runId: run.id } });
  const updated = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: "queued",
      stylePack,
      outlineJson: "{}",
      visualIdentityJson: "{}",
      visualStoryboardJson: "{}",
      slideImageSpecsJson: "{}",
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
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
