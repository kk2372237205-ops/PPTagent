import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await currentEmployee();
  if (!actor?.isAdmin) return NextResponse.json({ error: "仅管理员可以指定负责人" }, { status: 403 });
  const { id } = await context.params;
  const { assigneeId } = await request.json();
  const assignee = assigneeId
    ? await db.employee.findFirst({ where: { id: assigneeId, enabled: true } })
    : null;
  if (assigneeId && !assignee) return NextResponse.json({ error: "负责人不可用" }, { status: 400 });

  const service = await db.service.update({ where: { id }, data: { assigneeId: assignee?.id ?? null } });
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: actor.id,
      action: "assign",
      detail: assignee ? `指定 ${assignee.name} 为负责人` : "取消订单负责人"
    }
  });
  return NextResponse.json({ service });
}
