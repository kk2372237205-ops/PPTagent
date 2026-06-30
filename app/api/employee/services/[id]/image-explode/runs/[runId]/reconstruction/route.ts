import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const run = await db.imageExplodeRun.findFirst({
    where: { id: runId, serviceId: id, employeeId: employee.id },
    select: { reconstructionName: true }
  });
  if (!run?.reconstructionName) return NextResponse.json({ error: "重建预览尚未生成" }, { status: 404 });
  const file = await readStoredFile(imageRoot, run.reconstructionName);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" }
  });
}
