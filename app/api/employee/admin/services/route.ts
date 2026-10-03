import { NextRequest, NextResponse } from "next/server";
import { currentEmployeeAccess, hasEmployeeFeature, isEmployeeAdministrator } from "@/lib/employee-auth";
import { db } from "@/lib/db";
import { nextManagedServiceNumber, parseManagedServiceInput } from "@/lib/employee-order-management";

/** 平台管理员手工建立一对一服务订单。 */
export async function POST(request: NextRequest) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!hasEmployeeFeature(access, "orders") || !isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅平台管理员可以新增订单" }, { status: 403 });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const parsed = parseManagedServiceInput(body);
    if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const value = parsed.value;
    const customer = await db.user.upsert({
      where: { phone: value.phone },
      create: { phone: value.phone },
      update: {}
    });
    const service = await db.service.create({
      data: {
        number: await nextManagedServiceNumber(),
        title: value.title,
        category: value.category,
        purchasedAt: value.purchasedAt,
        priceCents: value.priceCents,
        status: value.status,
        progress: value.progress,
        userId: customer.id,
        organizationId: access.organization.id
      }
    });
    await db.serviceActivity.create({
      data: {
        serviceId: service.id,
        employeeId: access.employee.id,
        action: "create",
        detail: `平台管理员新建订单「${service.title}」`
      }
    });
    return NextResponse.json({ ok: true, service }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "新增订单失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
