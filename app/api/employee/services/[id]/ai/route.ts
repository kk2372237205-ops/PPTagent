import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { defaultTextModelId, imageModelOptions, textModelOptions } from "@/lib/ai-providers";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({ where: { id }, select: { id: true } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const conversation = await db.aiConversation.upsert({
    where: { serviceId_employeeId: { serviceId: id, employeeId: employee.id } },
    create: { serviceId: id, employeeId: employee.id },
    update: {},
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 80 }
    }
  });

  return NextResponse.json({
    conversation,
    models: {
      text: textModelOptions(),
      image: imageModelOptions(),
      defaultTextModelId: defaultTextModelId()
    }
  });
}
