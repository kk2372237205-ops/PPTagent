import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const actor = await currentEmployee();
  if (!actor?.isAdmin) return NextResponse.json({ error: "仅管理员可以管理员工" }, { status: 403 });
  const { id } = await context.params;
  const target = await db.employee.findUnique({ where: { id } });
  if (!target) return NextResponse.json({ error: "员工不存在" }, { status: 404 });

  const { name, phone, enabled } = await request.json();
  if (target.isAdmin && enabled === false) {
    return NextResponse.json({ error: "不能停用首位管理员" }, { status: 400 });
  }
  if (phone && !/^1[3-9]\d{9}$/.test(phone)) {
    return NextResponse.json({ error: "请输入正确的中国大陆手机号" }, { status: 400 });
  }

  try {
    const changedPhone = phone !== undefined && phone !== target.phone;
    const employee = await db.employee.update({
      where: { id },
      data: {
        ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 30) } : {}),
        ...(phone !== undefined ? { phone: phone || null } : {}),
        ...(typeof enabled === "boolean" ? { enabled } : {})
      }
    });
    if (changedPhone || enabled === false) {
      await db.employeeSession.deleteMany({ where: { employeeId: id } });
    }
    return NextResponse.json({ employee });
  } catch {
    return NextResponse.json({ error: "该手机号已绑定其他员工" }, { status: 409 });
  }
}
