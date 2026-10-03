import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployeeAccess, hasEmployeeFeature, isEmployeeAdministrator } from "@/lib/employee-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!hasEmployeeFeature(access, "orders") || !isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅平台管理员可以指定项目负责人" }, { status: 403 });
  }
  const { id } = await context.params;
  const currentService = await db.service.findUnique({ where: { id } });
  if (!currentService) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  const { assigneeId } = await request.json();
  const assigneeMembership = assigneeId
    ? await db.employeeMembership.findFirst({
      where: {
        employeeId: assigneeId,
        organizationId: currentService.organizationId || access.organization.id,
        status: "active",
        employee: { enabled: true }
      },
      include: { employee: true }
    })
    : null;
  if (assigneeId && !assigneeMembership) return NextResponse.json({ error: "负责人不可用或不属于该项目工作区" }, { status: 400 });

  const service = await db.$transaction(async (transaction) => {
    await transaction.serviceCollaborator.updateMany({
      where: { serviceId: id, role: "lead" },
      data: { role: "member" }
    });
    if (assigneeMembership) {
      await transaction.serviceCollaborator.upsert({
        where: { serviceId_employeeId: { serviceId: id, employeeId: assigneeMembership.employee.id } },
        update: { role: "lead" },
        create: { serviceId: id, employeeId: assigneeMembership.employee.id, role: "lead" }
      });
    }
    return transaction.service.update({
      where: { id },
      data: {
        assigneeId: assigneeMembership?.employee.id ?? null,
        organizationId: currentService.organizationId || access.organization.id
      }
    });
  });
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: access.employee.id,
      action: "assign",
      detail: assigneeMembership ? `指定 ${assigneeMembership.employee.name} 为项目负责人` : "取消项目负责人"
    }
  });
  return NextResponse.json({ service });
}
