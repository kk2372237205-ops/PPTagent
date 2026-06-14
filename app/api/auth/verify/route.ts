import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash, makeNumber, SESSION_COOKIE } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { phone, code, remember = true } = await request.json();
  const record = await db.verificationCode.findFirst({
    where: {
      phone,
      codeHash: hash(code ?? ""),
      usedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: { createdAt: "desc" }
  });
  if (!record) {
    return NextResponse.json({ error: "验证码错误或已过期" }, { status: 400 });
  }

  const user = await db.user.upsert({
    where: { phone },
    update: {},
    create: { phone }
  });

  await db.verificationCode.update({ where: { id: record.id }, data: { usedAt: new Date() } });

  const hasServices = await db.service.count({ where: { userId: user.id } });
  if (!hasServices) {
    const consultation = await db.consultation.create({
      data: {
        number: makeNumber("WZ"),
        budget: "5000~8000",
        userId: user.id,
        messages: {
          create: [
            { role: "system", content: "需求已确认，项目已进入制作流程。" },
            { role: "customer", content: "希望整体更有科技感，同时保持商务和克制。" }
          ]
        }
      }
    });

    const services = [
      { title: "新能源品牌年度发布会", category: "发布会演示", priceCents: 680000, status: "制作中", progress: 42 },
      { title: "城市更新项目路演方案", category: "商业路演", priceCents: 360000, status: "待客户确认", progress: 86 },
      { title: "AI 产品融资演示文稿", category: "融资路演", priceCents: 880000, status: "修改中", progress: 72 },
      { title: "新消费品牌策略提案", category: "品牌策略", priceCents: 520000, status: "已完成", progress: 100 }
    ];

    for (const [index, service] of services.entries()) {
      await db.service.create({
        data: {
          ...service,
          number: makeNumber(`SV${index + 1}`),
          purchasedAt: new Date(Date.now() - (index + 2) * 86400000 * 7),
          userId: user.id,
          consultationId: consultation.id,
          versions: {
            create: service.status === "已完成"
              ? [
                  { version: 1, label: "初稿", note: "完成整体结构与视觉方向" },
                  { version: 2, label: "终稿", note: "根据反馈完成数据页与结尾页优化" }
                ]
              : []
          }
        }
      });
    }
  }

  const token = randomBytes(32).toString("hex");
  const maxAge = remember ? 60 * 24 * 60 * 60 : 24 * 60 * 60;
  await db.session.create({
    data: {
      tokenHash: hash(token),
      userId: user.id,
      remember,
      deviceLabel: "Windows · 当前浏览器",
      ip: request.headers.get("x-forwarded-for"),
      expiresAt: new Date(Date.now() + maxAge * 1000)
    }
  });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: remember ? maxAge : undefined,
    path: "/"
  });
  return response;
}
