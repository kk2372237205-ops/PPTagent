import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hash } from "@/lib/auth";
import { currentEmployeeAccess, EMPLOYEE_SESSION_COOKIE } from "@/lib/employee-auth";
import { hashEmployeePassword, normalizeEmployeeUsername, verifyEmployeePassword } from "@/lib/employee-password";

export async function PATCH(request: NextRequest) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  try {
    const body = await request.json() as { username?: unknown; currentPassword?: unknown; newPassword?: unknown };
    const changingUsername = body.username !== undefined;
    const changingPassword = Boolean(body.newPassword);
    if (!changingUsername && !changingPassword) return NextResponse.json({ error: "请填写要修改的用户名或密码" }, { status: 400 });
    if (!access.employee.passwordHash && (!changingUsername || !changingPassword)) {
      return NextResponse.json({ error: "首次设置账号时，请同时填写用户名和新密码" }, { status: 400 });
    }
    if (access.employee.passwordHash) {
      const currentPasswordValid = await verifyEmployeePassword(body.currentPassword, access.employee.passwordHash);
      if (!currentPasswordValid) return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }
    const username = changingUsername ? normalizeEmployeeUsername(body.username) : access.employee.username;
    if (username && username !== access.employee.username) {
      const duplicate = await db.employee.findUnique({ where: { username }, select: { id: true } });
      if (duplicate) return NextResponse.json({ error: "该用户名已被使用" }, { status: 409 });
    }
    const passwordHash = changingPassword ? await hashEmployeePassword(body.newPassword) : undefined;
    await db.employee.update({
      where: { id: access.employee.id },
      data: {
        username,
        ...(passwordHash ? { passwordHash, passwordChangedAt: new Date() } : {})
      }
    });
    if (passwordHash) {
      const token = (await cookies()).get(EMPLOYEE_SESSION_COOKIE)?.value;
      if (token) {
        await db.employeeSession.deleteMany({
          where: { employeeId: access.employee.id, NOT: { tokenHash: hash(token) } }
        });
      }
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "账户资料保存失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
