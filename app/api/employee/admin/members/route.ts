import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployeeAccess, employeeFeatures, isEmployeeAdministrator } from "@/lib/employee-auth";
import { hashEmployeePassword, normalizeEmployeeUsername } from "@/lib/employee-password";

function permissionsFrom(body: { permissions?: Record<string, unknown>; role: string }) {
  if (body.role === "platform_admin") {
    return Object.fromEntries(employeeFeatures.map((feature) => [feature, true]));
  }
  return Object.fromEntries(employeeFeatures.map((feature) => [feature, body.permissions?.[feature] !== false]));
}

export async function POST(request: NextRequest) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅平台管理员可以新增员工" }, { status: 403 });
  }
  try {
    const body = await request.json() as { name?: unknown; username?: unknown; password?: unknown; role?: unknown; permissions?: Record<string, unknown> };
    const name = String(body.name || "").trim();
    if (!name || name.length > 60) return NextResponse.json({ error: "员工姓名需为 1–60 个字符" }, { status: 400 });
    const username = normalizeEmployeeUsername(body.username);
    const passwordHash = await hashEmployeePassword(body.password);
    const existing = await db.employee.findUnique({ where: { username }, select: { id: true } });
    if (existing) return NextResponse.json({ error: "该用户名已被使用" }, { status: 409 });
    const role = body.role === "platform_admin" ? "platform_admin" : "member";
    const employee = await db.employee.create({
      data: {
        code: `EMP-${randomBytes(5).toString("hex").toUpperCase()}`,
        name,
        username,
        passwordHash,
        passwordChangedAt: new Date(),
        isAdmin: role === "platform_admin",
        enabled: true,
        memberships: {
          create: {
            organizationId: access.organization.id,
            identityProvider: "password",
            externalUserId: username,
            unionId: "",
            wecomUserId: `password:${username}`,
            role,
            status: "active",
            permissionsJson: JSON.stringify(permissionsFrom({ permissions: body.permissions, role }))
          }
        }
      },
      include: { memberships: true }
    });
    return NextResponse.json({ ok: true, employee: { id: employee.id, name: employee.name, username: employee.username, membershipId: employee.memberships[0]?.id } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "新增员工失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
