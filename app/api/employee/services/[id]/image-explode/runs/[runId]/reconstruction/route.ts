import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "imageTools");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const run = await db.imageExplodeRun.findFirst({
    where: { id: runId, serviceId: id },
    select: { reconstructionName: true }
  });
  if (!run?.reconstructionName) return NextResponse.json({ error: "重建预览尚未生成" }, { status: 404 });
  const file = await readStoredFile(imageRoot, run.reconstructionName);
  return new NextResponse(new Uint8Array(file), {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" }
  });
}
