import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  clearEmployeeLoginFailures,
  assertEmployeeLoginAllowed,
  normalizeEmployeeUsername,
  recordEmployeeLoginFailure,
  verifyEmployeePassword
} from "@/lib/employee-password";
import {
  createEmployeeSession,
  EMPLOYEE_SESSION_COOKIE,
  ensureEmployeeBootstrap
} from "@/lib/employee-auth";

export const dynamic = "force-dynamic";

function requestIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

export async function POST(request: NextRequest) {
  let username = "";
  try {
    const body = await request.json() as { username?: unknown; password?: unknown; remember?: unknown };
    username = normalizeEmployeeUsername(body.username);
    const ip = requestIp(request);
    const attemptKey = `${ip || "unknown"}:${username}`;
    assertEmployeeLoginAllowed(attemptKey);

    await ensureEmployeeBootstrap();
    const employee = await db.employee.findUnique({
      where: { username },
      include: {
        memberships: {
          where: { status: "active" },
          include: { organization: true },
          orderBy: { createdAt: "asc" },
          take: 1
        }
      }
    });
    const membership = employee?.memberships[0];
    const valid = Boolean(employee && membership && membership.organization.enabled && employee.enabled) &&
      await verifyEmployeePassword(body.password, employee?.passwordHash || null);
    if (!valid || !employee || !membership) {
      recordEmployeeLoginFailure(attemptKey);
      return NextResponse.json({ error: "用户名或密码不正确" }, { status: 401 });
    }

    clearEmployeeLoginFailures(attemptKey);
    const now = new Date();
    await db.$transaction([
      db.employeeMembership.update({
        where: { id: membership.id },
        data: { lastLoginAt: now, loginCount: { increment: 1 } }
      }),
      db.employeeLoginEvent.create({
        data: {
          employeeId: employee.id,
          organizationId: membership.organizationId,
          ip,
          userAgent: request.headers.get("user-agent") || ""
        }
      })
    ]);
    const session = await createEmployeeSession(
      employee.id,
      membership.id,
      body.remember !== false,
      ip,
      "账号密码 · 当前浏览器"
    );
    const response = NextResponse.json({ ok: true });
    response.cookies.set(EMPLOYEE_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: session.maxAge,
      path: "/"
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "账号登录失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
