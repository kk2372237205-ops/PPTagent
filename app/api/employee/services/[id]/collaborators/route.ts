import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployeeAccess, hasEmployeeFeature, isEmployeeAdministrator } from "@/lib/employee-auth";

const projectRoles = ["lead", "member"] as const;

async function authorizeProjectAdministration(serviceId: string) {
  const access = await currentEmployeeAccess();
  if (!access) return { error: "请先登录员工工作台", status: 401 as const };
  if (!hasEmployeeFeature(access, "orders") || !isEmployeeAdministrator(access)) {
    return { error: "仅平台管理员可以派遣项目成员", status: 403 as const };
  }
  const service = await db.service.findUnique({ where: { id: serviceId } });
  if (!service) return { error: "订单不存在", status: 404 as const };
  return { access, service };
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorized = await authorizeProjectAdministration(id);
  if ("error" in authorized) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
  const [collaborators, employees] = await Promise.all([
    db.serviceCollaborator.findMany({
      where: { serviceId: id },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: { employee: { select: { id: true, name: true, code: true, username: true, enabled: true } } }
    }),
    db.employeeMembership.findMany({
      where: {
        organizationId: authorized.service.organizationId || authorized.access.organization.id,
        status: "active",
        employee: { enabled: true }
      },
      include: { employee: { select: { id: true, name: true, code: true, username: true, enabled: true } } },
      orderBy: { employee: { name: "asc" } }
    })
  ]);
  return NextResponse.json({ collaborators, employees: employees.map((membership) => membership.employee) });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorized = await authorizeProjectAdministration(id);
  if ("error" in authorized) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
  const body = await request.json() as { employeeId?: unknown; role?: unknown };
  const employeeId = String(body.employeeId || "");
  const role = projectRoles.includes(body.role as typeof projectRoles[number]) ? body.role as typeof projectRoles[number] : "member";
  if (!employeeId) return NextResponse.json({ error: "请选择要派遣的员工" }, { status: 400 });
  const membership = await db.employeeMembership.findFirst({
    where: {
      employeeId,
      organizationId: authorized.service.organizationId || authorized.access.organization.id,
      status: "active",
      employee: { enabled: true }
    },
    include: { employee: true }
  });
  if (!membership) return NextResponse.json({ error: "该员工不可用或不属于该项目工作区" }, { status: 400 });
  const collaborator = await db.$transaction(async (transaction) => {
    if (role === "lead") {
      await transaction.serviceCollaborator.updateMany({ where: { serviceId: id, role: "lead" }, data: { role: "member" } });
    }
    const saved = await transaction.serviceCollaborator.upsert({
      where: { serviceId_employeeId: { serviceId: id, employeeId } },
      update: { role },
      create: { serviceId: id, employeeId, role },
      include: { employee: { select: { id: true, name: true, code: true, username: true } } }
    });
    if (role === "lead") {
      await transaction.service.update({ where: { id }, data: { assigneeId: employeeId } });
    }
    return saved;
  });
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: authorized.access.employee.id,
      action: "project-collaborator",
      detail: `派遣 ${membership.employee.name} 为${role === "lead" ? "负责人" : "普通员工"}`
    }
  });
  return NextResponse.json({ ok: true, collaborator });
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorized = await authorizeProjectAdministration(id);
  if ("error" in authorized) return NextResponse.json({ error: authorized.error }, { status: authorized.status });
  const body = await request.json() as { employeeId?: unknown };
  const employeeId = String(body.employeeId || "");
  if (!employeeId) return NextResponse.json({ error: "请选择要移出项目的员工" }, { status: 400 });
  await db.$transaction([
    db.serviceCollaborator.deleteMany({ where: { serviceId: id, employeeId } }),
    ...(authorized.service.assigneeId === employeeId
      ? [db.service.update({ where: { id }, data: { assigneeId: null } })]
      : [])
  ]);
  await db.serviceActivity.create({
    data: { serviceId: id, employeeId: authorized.access.employee.id, action: "project-collaborator", detail: "移出一名项目成员" }
  });
  return NextResponse.json({ ok: true });
}
