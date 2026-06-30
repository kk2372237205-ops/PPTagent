import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash, SESSION_COOKIE } from "@/lib/auth";
import { syncRegisteredUser } from "@/lib/supabase-postgres";

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
  const supabaseSynced = await syncRegisteredUser({
    localUserId: user.id,
    phone: user.phone,
    registeredAt: user.createdAt,
    ip: request.headers.get("x-forwarded-for"),
    userAgent: request.headers.get("user-agent")
  });

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

  const response = NextResponse.json({ ok: true, supabaseSynced });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: remember ? maxAge : undefined,
    path: "/"
  });
  return response;
}
