import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessService, currentEmployeeAccess, hasEmployeeFeature } from "@/lib/employee-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!hasEmployeeFeature(access, "orders") || !["platform_admin", "org_admin", "manager"].includes(access.membership.role)) {
    return NextResponse.json({ error: "仅管理员或项目主管可以指定负责人" }, { status: 403 });
  }
  const { id } = await context.params;
  const currentService = await db.service.findUnique({ where: { id } });
  if (!currentService) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  if (!canAccessService(access, currentService)) {
    return NextResponse.json({ error: "不能管理其他学校的订单" }, { status: 403 });
  }
  const { assigneeId } = await request.json();
  const assigneeMembership = assigneeId
    ? await db.employeeMembership.findFirst({
      where: {
        employeeId: assigneeId,
        organizationId: access.organization.id,
        status: "active",
        employee: { enabled: true }
      },
      include: { employee: true }
    })
    : null;
  if (assigneeId && !assigneeMembership) return NextResponse.json({ error: "负责人不可用或不属于当前学校" }, { status: 400 });

  const service = await db.service.update({
    where: { id },
    data: {
      assigneeId: assigneeMembership?.employee.id ?? null,
      organizationId: access.organization.id
    }
  });
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: access.employee.id,
      action: "assign",
      detail: assigneeMembership ? `指定 ${assigneeMembership.employee.name} 为负责人` : "取消订单负责人"
    }
  });
  return NextResponse.json({ service });
}
