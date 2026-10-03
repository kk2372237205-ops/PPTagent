import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";

const instructions: Record<string, string> = {
  reroll: "重新生成本页：必须产生一张新的页面图，保留整套视觉身份、本页角色和故事目标，但重新组织构图、主视觉和局部信息呈现，不要复用上一版的画面布局。",
  closer_previous: "更贴近上一页：系统会把上一页真实成图交给 Image2。只让页眉、页脚、主色、背景纹理、卡片边框、光效层级和装饰节奏更接近上一页；不要复制上一页的正文内容、主视觉、数据、图表或页面构图。当前页标题、角色和信息重点必须保持不变。"
};

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; runId: string; slideId: string }> }) {
  const { id, runId, slideId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const body = await request.json().catch(() => ({})) as { action?: string };
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id },
    include: { slides: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (!["review_ready", "pdf_ready", "ppt_ready", "generating"].includes(run.status)) {
    return NextResponse.json({ error: "当前任务还不能局部重生" }, { status: 400 });
  }
  const slide = run.slides.find(item => item.id === slideId);
  if (!slide) return NextResponse.json({ error: "页面不存在" }, { status: 404 });
  if (run.generationMode === "advanced" && ["queued", "generating", "quality_checking", "quality_retry", "correcting"].includes(slide.status)) {
    return NextResponse.json({ error: "本页已有生成请求正在处理，请勿重复提交" }, { status: 409 });
  }
  const baseInstruction = instructions[body.action || ""] || instructions.reroll;
  const instruction = `${baseInstruction}\nRegeneration request id: ${Date.now()}.`;
  const requestKey = `manual:${run.id}:${slide.id}:${randomUUID()}`;

  const updated = await db.$transaction(async tx => {
    if (run.generationMode === "advanced") {
      await tx.deckGenerationImageCall.create({
        data: { requestKey, kind: "manual", runId: run.id, slideId: slide.id }
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
        error: null,
        ...(run.generationMode === "advanced" ? {} : { storedName: null }),
        lastInstruction: instruction
      }
    });
    await tx.deckGenerationRun.update({
      where: { id: run.id },
      data: {
        status: "generating",
        ...(run.generationMode === "advanced" ? { deckQualityStatus: "pending", deckQualityReportJson: "{}", deckQualityAttempts: 0 } : {}),
        finishedAt: null,
        pdfStoredName: null,
        pptStoredName: null,
        codiaTaskId: null,
        codiaResponseJson: "{}",
        pdfGeneratedAt: null,
        pptGeneratedAt: null,
        error: null
      }
    });
    return tx.deckGenerationRun.findUnique({
      where: { id: run.id },
      include: { slides: { orderBy: { slideIndex: "asc" } } }
    });
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}
