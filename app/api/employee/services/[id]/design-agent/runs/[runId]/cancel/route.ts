import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const result = await db.designAgentRun.updateMany({
    where: { id: runId, serviceId: id, status: { in: ["queued", "running"] } },
    data: { status: "cancelled", finishedAt: new Date(), error: "员工已取消任务" }
  });
  if (!result.count) return NextResponse.json({ error: "该任务当前不能取消" }, { status: 400 });
  await db.designAgentEvent.create({ data: { runId, stage: "cancelled", status: "cancelled", detail: "员工已取消任务" } });
  return NextResponse.json({ ok: true });
}
