import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { defaultTextModelId, imageModelOptions, textModelOptions } from "@/lib/ai-providers";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;

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
