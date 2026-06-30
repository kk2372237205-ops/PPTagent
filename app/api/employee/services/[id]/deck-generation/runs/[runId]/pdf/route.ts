import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { documentRoot, readStoredFile } from "@/lib/workspace-storage";

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    include: { slides: true }
  });
  if (!run) return NextResponse.json({ error: "生成 PPT 任务不存在" }, { status: 404 });
  if (run.status === "pdf_ready") return NextResponse.json({ run });
  if (run.status !== "review_ready") return NextResponse.json({ error: "请等待全部页面生成完成后再生成 PDF" }, { status: 400 });
  if (!run.slides.length || run.slides.some(slide => slide.status !== "completed" || !slide.storedName)) {
    return NextResponse.json({ error: "还有页面没有生成完成" }, { status: 400 });
  }
  const updated = await db.deckGenerationRun.update({
    where: { id: run.id },
    data: { status: "pdf_queued", error: null },
    include: { slides: { orderBy: { slideIndex: "asc" } } }
  });
  return NextResponse.json({ run: updated }, { status: 202 });
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const run = await db.deckGenerationRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id }
  });
  if (!run?.pdfStoredName || run.status !== "pdf_ready") {
    return NextResponse.json({ error: "PDF 尚未生成完成" }, { status: 404 });
  }
  const file = await readStoredFile(documentRoot, run.pdfStoredName);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${run.projectName}.pdf`)}`,
      "Cache-Control": "private, no-store"
    }
  });
}
