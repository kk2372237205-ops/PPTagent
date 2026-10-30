import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createEmployeeSession,
  EMPLOYEE_SESSION_COOKIE,
  ensureEmployeeBootstrap,
  isEmployeeLocalBypassEnabled
} from "@/lib/employee-auth";

export async function POST(request: NextRequest) {
  if (!isEmployeeLocalBypassEnabled()) {
    return NextResponse.json({ error: "开发管理员入口未启用" }, { status: 404 });
  }
  const { admin, organizations } = await ensureEmployeeBootstrap();
  const organization = organizations[0];
  const membership = organization ? await db.employeeMembership.findFirst({
    where: { employeeId: admin.id, organizationId: organization.id }
  }) : null;
  if (!membership) {
    return NextResponse.json({ error: "本地学校组织尚未初始化" }, { status: 500 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const session = await createEmployeeSession(admin.id, membership.id, true, ip);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(EMPLOYEE_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: session.maxAge,
    path: "/"
  });
  return response;
}
