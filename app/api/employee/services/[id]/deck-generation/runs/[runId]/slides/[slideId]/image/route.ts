import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string; slideId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId, slideId } = await context.params;
  const slide = await db.deckGenerationSlide.findFirst({
    where: {
      id: slideId,
      run: { id: runId, serviceId: id, employeeId: employee.id }
    }
  });
  if (!slide?.storedName) return NextResponse.json({ error: "页面图片尚未生成" }, { status: 404 });
  const file = await readStoredFile(imageRoot, slide.storedName);
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store"
    }
  });
}
