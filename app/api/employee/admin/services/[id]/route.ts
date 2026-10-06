import { NextRequest, NextResponse } from "next/server";
import { currentEmployeeAccess, hasEmployeeFeature, isEmployeeAdministrator } from "@/lib/employee-auth";
import { db } from "@/lib/db";
import { customerForManagedOrder, parseManagedServiceInput } from "@/lib/employee-order-management";

async function requirePlatformOrderManager() {
  const access = await currentEmployeeAccess();
  if (!access) return { response: NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 }) };
  if (!hasEmployeeFeature(access, "orders") || !isEmployeeAdministrator(access)) {
    return { response: NextResponse.json({ error: "仅平台管理员可以管理订单" }, { status: 403 }) };
  }
  return { access };
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requirePlatformOrderManager();
  if ("response" in authorization) return authorization.response;
  const { id } = await context.params;
  const current = await db.service.findUnique({ where: { id }, select: { id: true, title: true, userId: true } });
  if (!current) return NextResponse.json({ error: "订单不存在或已被删除" }, { status: 404 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const parsed = parseManagedServiceInput(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const value = parsed.value;
    const customer = await customerForManagedOrder(value.customerInfo, current.userId);
    const service = await db.service.update({
      where: { id },
      data: {
        title: value.title,
        category: value.category,
        purchasedAt: value.purchasedAt,
        priceCents: value.priceCents,
        status: value.status,
        progress: value.progress,
        customerInfo: value.customerInfo,
        userId: customer.id
      }
    });
    await db.serviceActivity.create({
      data: {
        serviceId: id,
        employeeId: authorization.access.employee.id,
        action: "edit",
        detail: `平台管理员修改订单「${current.title}」`
      }
    });
    return NextResponse.json({ ok: true, service });
  } catch (error) {
    const message = error instanceof Error ? error.message : "修改订单失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const authorization = await requirePlatformOrderManager();
  if ("response" in authorization) return authorization.response;
  const { confirm } = await request.json().catch(() => ({})) as { confirm?: unknown };
  if (confirm !== true) return NextResponse.json({ error: "请在确认窗口中再次确认删除" }, { status: 400 });

  const { id } = await context.params;
  const current = await db.service.findUnique({ where: { id }, select: { id: true, number: true, title: true } });
  if (!current) return NextResponse.json({ error: "订单不存在或已被删除" }, { status: 404 });
  await db.service.delete({ where: { id } });
  return NextResponse.json({ ok: true, deleted: { number: current.number, title: current.title } });
}
