import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const consultation = await db.consultation.findUnique({ where: { id } });
  if (!consultation) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  const { content } = await request.json();
  const text = String(content ?? "").trim();
  if (!text) return NextResponse.json({ error: "请输入回复内容" }, { status: 400 });

  const message = await db.message.create({
    data: {
      consultationId: id,
      content: text.slice(0, 5000),
      role: "advisor",
      employeeId: employee.id
    },
    include: { attachments: true, employee: { select: { id: true, name: true } } }
  });
  return NextResponse.json({ message });
}
