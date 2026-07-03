import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

const instructions: Record<string, string> = {
  reroll: "重新生成本页：必须产生一张新的页面图，保留整套视觉身份、本页角色和故事目标，但重新组织构图、主视觉和局部信息呈现，不要复用上一版的画面布局。",
  closer_previous: "更贴近上一页：只让页眉、页脚、主色、背景纹理、卡片边框、光效层级和装饰节奏更接近上一页；不要复制上一页的正文内容、主视觉、数据、图表或页面构图。当前页标题、角色和信息重点必须保持不变。"
};

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; runId: string; slideId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId, slideId } = await context.params;
  const body = await request.json().catch(() => ({})) as { action?: string };
  const instruction = `${instructions[body.action || ""] || instructions.reroll}\nRegeneration request id: ${Date.now()}.`;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (!["review_ready", "pdf_ready", "ppt_ready", "generating"].includes(run.status)) {
    return NextResponse.json({ error: "当前任务还不能局部重生" }, { status: 400 });
  }
  const slide = run.slides.find(item => item.id === slideId);
  if (!slide) return NextResponse.json({ error: "页面不存在" }, { status: 404 });

  await db.deckGenerationSlide.update({
    where: { id: slide.id },
    data: { status: "queued", error: null, storedName: null, lastInstruction: instruction }
  });
  const updated = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: {
      status: "generating",
      pdfStoredName: null,
      pptStoredName: null,
      codiaTaskId: null,
      codiaResponseJson: "{}",
      pdfGeneratedAt: null,
      pptGeneratedAt: null,
      error: null
    },
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
