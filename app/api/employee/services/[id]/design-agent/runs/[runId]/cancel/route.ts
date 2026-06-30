import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id, runId } = await context.params;
  const result = await db.designAgentRun.updateMany({
    where: { id: runId, serviceId: id, employeeId: employee.id, status: { in: ["queued", "running"] } },
    data: { status: "cancelled", finishedAt: new Date(), error: "员工已取消任务" }
  });
  if (!result.count) return NextResponse.json({ error: "该任务当前不能取消" }, { status: 400 });
  await db.designAgentEvent.create({ data: { runId, stage: "cancelled", status: "cancelled", detail: "员工已取消任务" } });
  return NextResponse.json({ ok: true });
}
