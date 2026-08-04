import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  currentEmployeeAccess,
  employeeFeatures,
  employeeRoles,
  isEmployeeAdministrator
} from "@/lib/employee-auth";

const allowedStatuses = ["pending", "active", "disabled"] as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> }
) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅学校管理员可以修改成员权限" }, { status: 403 });
  }
  const { membershipId } = await context.params;
  const target = await db.employeeMembership.findUnique({
    where: { id: membershipId },
    include: { employee: true }
  });
  if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });

  const isPlatformAdmin = access.employee.isAdmin || access.membership.role === "platform_admin";
  if (!isPlatformAdmin && target.organizationId !== access.organization.id) {
    return NextResponse.json({ error: "不能管理其他学校的成员" }, { status: 403 });
  }
  if (!isPlatformAdmin && (target.employee.isAdmin || target.role === "platform_admin")) {
    return NextResponse.json({ error: "学校管理员不能修改平台管理员" }, { status: 403 });
  }
  if (target.id === access.membership.id) {
    return NextResponse.json({ error: "不能在这里停用或改写自己的管理员身份" }, { status: 400 });
  }

  const body = await request.json() as {
    role?: string;
    status?: string;
    permissions?: Record<string, unknown>;
  };
  const role = employeeRoles.includes(body.role as typeof employeeRoles[number])
    ? body.role as typeof employeeRoles[number]
    : target.role;
  const status = allowedStatuses.includes(body.status as typeof allowedStatuses[number])
    ? body.status as typeof allowedStatuses[number]
    : target.status;
  if (!isPlatformAdmin && role === "platform_admin") {
    return NextResponse.json({ error: "只有平台管理员可以授予平台管理员身份" }, { status: 403 });
  }

  const permissions = Object.fromEntries(
    employeeFeatures
      .filter((key) => typeof body.permissions?.[key] === "boolean")
      .map((key) => [key, body.permissions?.[key]])
  );
  const [updated] = await db.$transaction([
    db.employeeMembership.update({
      where: { id: target.id },
      data: {
        role,
        status,
        permissionsJson: JSON.stringify(permissions)
      }
    }),
    db.employee.update({
      where: { id: target.employeeId },
      data: {
        isAdmin: role === "platform_admin",
        enabled: status !== "disabled"
      }
    })
  ]);
  if (status === "disabled") {
    await db.employeeSession.deleteMany({ where: { membershipId: target.id } });
  }
  return NextResponse.json({ ok: true, membership: updated });
}
