import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  const service = await db.service.findFirst({
    where: { id, userId: user.id, status: "已完成" }
  });
  if (!service) {
    return NextResponse.json({ error: "只有已完成的服务才能转为资产" }, { status: 400 });
  }

  const existing = await db.asset.findUnique({ where: { serviceId: service.id } });
  if (existing) {
    return NextResponse.json({ error: "该订单已经转为资产，不能重复保存" }, { status: 409 });
  }

  const asset = await db.asset.create({
    data: {
      title: service.title,
      format: "PPTX · PDF",
      userId: user.id,
      serviceId: service.id
    }
  });
  return NextResponse.json({ asset });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

  const { id } = await context.params;
  await db.asset.deleteMany({ where: { serviceId: id, userId: user.id } });
  return NextResponse.json({ ok: true });
}
