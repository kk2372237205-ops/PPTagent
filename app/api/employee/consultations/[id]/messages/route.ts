import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessService, currentEmployeeAccess, hasEmployeeFeature } from "@/lib/employee-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  if (!hasEmployeeFeature(access, "customerMessages")) {
    return NextResponse.json({ error: "你的账号未开通客户消息权限" }, { status: 403 });
  }
  const { id } = await context.params;
  const consultation = await db.consultation.findUnique({
    where: { id },
    include: { services: { select: { assigneeId: true, organizationId: true } } }
  });
  if (!consultation) return NextResponse.json({ error: "会话不存在" }, { status: 404 });
  if (!access.employee.isAdmin && !consultation.services.some((service) => canAccessService(access, service))) {
    return NextResponse.json({ error: "你无权回复该客户会话" }, { status: 403 });
  }
  const { content } = await request.json();
  const text = String(content ?? "").trim();
  if (!text) return NextResponse.json({ error: "请输入回复内容" }, { status: 400 });

  const message = await db.message.create({
    data: {
      consultationId: id,
      content: text.slice(0, 5000),
      role: "advisor",
      employeeId: access.employee.id
    },
    include: { attachments: true, employee: { select: { id: true, name: true } } }
  });
  return NextResponse.json({ message });
}
