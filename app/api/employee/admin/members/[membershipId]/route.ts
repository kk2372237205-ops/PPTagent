import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  currentEmployeeAccess,
  employeeFeatures,
  employeeRoles,
  isEmployeeAdministrator
} from "@/lib/employee-auth";
import { hashEmployeePassword, normalizeEmployeeUsername } from "@/lib/employee-password";

const allowedStatuses = ["pending", "active", "disabled"] as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> }
) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅平台管理员可以修改成员权限" }, { status: 403 });
  }
  const { membershipId } = await context.params;
  const target = await db.employeeMembership.findUnique({
    where: { id: membershipId },
    include: { employee: true }
  });
  if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });

  const body = await request.json() as {
    role?: string;
    status?: string;
    permissions?: Record<string, unknown>;
    name?: unknown;
    username?: unknown;
    password?: unknown;
  };
  const isSelf = target.id === access.membership.id;
  if (isSelf && (body.role !== undefined || body.status !== undefined || body.permissions !== undefined)) {
    return NextResponse.json({ error: "请在个人账户设置中修改自己的用户名或密码；不能在这里改写自己的管理员身份" }, { status: 400 });
  }
  const role = employeeRoles.includes(body.role as typeof employeeRoles[number])
    ? body.role as typeof employeeRoles[number]
    : target.role;
  const status = allowedStatuses.includes(body.status as typeof allowedStatuses[number])
    ? body.status as typeof allowedStatuses[number]
    : target.status;
  const removesActivePlatformAdmin = target.role === "platform_admin" && target.status === "active" &&
    (role !== "platform_admin" || status !== "active");
  if (removesActivePlatformAdmin) {
    const activePlatformAdminCount = await db.employeeMembership.count({
      where: { role: "platform_admin", status: "active", employee: { enabled: true } }
    });
    if (activePlatformAdminCount <= 1) {
      return NextResponse.json({ error: "平台至少需要保留一位启用中的平台管理员" }, { status: 400 });
    }
  }
  const submittedPermissions = Object.fromEntries(
    employeeFeatures
      .filter((key) => typeof body.permissions?.[key] === "boolean")
      .map((key) => [key, body.permissions?.[key]])
  );
  const permissionsJson = body.permissions === undefined
    ? target.permissionsJson
    : JSON.stringify(submittedPermissions);
  const name = body.name === undefined ? target.employee.name : String(body.name).trim();
  if (!name || name.length > 60) return NextResponse.json({ error: "员工姓名需为 1–60 个字符" }, { status: 400 });
  let username = target.employee.username;
  try {
    if (body.username !== undefined) username = normalizeEmployeeUsername(body.username);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "用户名不符合要求" }, { status: 400 });
  }
  if (username && username !== target.employee.username) {
    const duplicate = await db.employee.findUnique({ where: { username }, select: { id: true } });
    if (duplicate) return NextResponse.json({ error: "该用户名已被使用" }, { status: 409 });
  }
  let passwordHash: string | undefined;
  try {
    if (body.password !== undefined && String(body.password)) passwordHash = await hashEmployeePassword(body.password);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "密码不符合要求" }, { status: 400 });
  }
  const [updated] = await db.$transaction([
    db.employeeMembership.update({
      where: { id: target.id },
      data: {
        role,
        status,
        permissionsJson
      }
    }),
    db.employee.update({
      where: { id: target.employeeId },
      data: {
        name,
        username,
        ...(passwordHash ? { passwordHash, passwordChangedAt: new Date() } : {}),
        isAdmin: role === "platform_admin",
        enabled: status !== "disabled"
      }
    })
  ]);
  if (status === "disabled") {
    await db.employeeSession.deleteMany({ where: { membershipId: target.id } });
  }
  if (passwordHash) {
    await db.employeeSession.deleteMany({ where: { employeeId: target.employeeId } });
  }
  return NextResponse.json({ ok: true, membership: updated });
}

/**
 * 将成员移出当前工作区，而非硬删除 Employee 历史档案：
 * 已交付项目、版本和操作记录仍须可追溯；当前登录、项目派遣和协作关系会立刻撤销。
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ membershipId: string }> }
) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅平台管理员可以移除员工" }, { status: 403 });
  }
  const { confirm } = await request.json().catch(() => ({})) as { confirm?: unknown };
  if (confirm !== true) return NextResponse.json({ error: "请在确认窗口中再次确认移除" }, { status: 400 });

  const { membershipId } = await context.params;
  const target = await db.employeeMembership.findUnique({
    where: { id: membershipId },
    include: { employee: { select: { id: true, name: true } } }
  });
  if (!target) return NextResponse.json({ error: "成员不存在或已被移除" }, { status: 404 });
  if (target.id === access.membership.id) {
    return NextResponse.json({ error: "不能移除当前登录的管理员，请由另一位平台管理员操作" }, { status: 400 });
  }
  if (target.role === "platform_admin" && target.status === "active") {
    const activePlatformAdminCount = await db.employeeMembership.count({
      where: { role: "platform_admin", status: "active", employee: { enabled: true } }
    });
    if (activePlatformAdminCount <= 1) {
      return NextResponse.json({ error: "平台至少需要保留一位启用中的平台管理员" }, { status: 400 });
    }
  }

  const [otherEnabledMembershipCount, otherPlatformAdminCount] = await Promise.all([
    db.employeeMembership.count({
      where: { employeeId: target.employeeId, id: { not: target.id }, status: { not: "disabled" } }
    }),
    db.employeeMembership.count({
      where: { employeeId: target.employeeId, id: { not: target.id }, role: "platform_admin", status: "active" }
    })
  ]);
  await db.$transaction([
    db.employeeSession.deleteMany({ where: { membershipId: target.id } }),
    db.serviceCollaborator.deleteMany({
      where: { employeeId: target.employeeId, service: { organizationId: target.organizationId } }
    }),
    db.service.updateMany({
      where: { assigneeId: target.employeeId, organizationId: target.organizationId },
      data: { assigneeId: null }
    }),
    db.employeeMembership.delete({ where: { id: target.id } }),
    db.employee.update({
      where: { id: target.employeeId },
      data: {
        enabled: otherEnabledMembershipCount > 0,
        isAdmin: otherPlatformAdminCount > 0
      }
    })
  ]);
  return NextResponse.json({
    ok: true,
    removed: { id: target.id, name: target.employee.name },
    message: "员工已移出工作区，当前登录和项目派遣已撤销；历史交付记录已保留。"
  });
}
