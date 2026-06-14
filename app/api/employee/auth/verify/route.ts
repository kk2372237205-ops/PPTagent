import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "@/lib/auth";
import {
  createEmployeeSession,
  EMPLOYEE_SESSION_COOKIE,
  ensureEmployeeSlots
} from "@/lib/employee-auth";

export async function POST(request: NextRequest) {
  await ensureEmployeeSlots();
  const { phone, code, employeeCode, remember = true } = await request.json();
  if (!/^1[3-9]\d{9}$/.test(phone ?? "") || !/^\d{8}$/.test(employeeCode ?? "")) {
    return NextResponse.json({ error: "请输入正确的手机号和八位员工码" }, { status: 400 });
  }

  const employee = await db.employee.findUnique({ where: { code: employeeCode } });
  if (!employee || !employee.enabled || employee.phone !== phone) {
    return NextResponse.json({ error: "手机号与员工码不匹配，或该员工账号已停用" }, { status: 403 });
  }

  const record = await db.verificationCode.findFirst({
    where: {
      phone,
      codeHash: hash(code ?? ""),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });
  if (!record) return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });

  await db.verificationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });
  const session = await createEmployeeSession(employee.id, remember, request.headers.get("x-forwarded-for"));
  const response = NextResponse.json({ ok: true });
  response.cookies.set(EMPLOYEE_SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: remember ? session.maxAge : undefined,
    path: "/"
  });
  return response;
}
