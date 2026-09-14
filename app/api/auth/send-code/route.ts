import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash } from "@/lib/auth";
import { sendVerificationSms } from "@/lib/sms";

const phonePattern = /^1[3-9]\d{9}$/;

export async function POST(request: NextRequest) {
  const { phone } = await request.json();
  if (!phonePattern.test(phone ?? "")) {
    return NextResponse.json({ error: "请输入正确的中国大陆手机号" }, { status: 400 });
  }

  const recent = await db.verificationCode.findFirst({
    where: { phone, createdAt: { gt: new Date(Date.now() - 60_000) } }
  });
  if (recent) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ok: true,
        mode: "mock",
        devCode: process.env.DEV_SMS_CODE ?? "123456",
        cooldown: true
      });
    }
    return NextResponse.json({ error: "验证码发送太频繁，请稍后再试" }, { status: 429 });
  }

  const code = process.env.DEV_SMS_CODE ?? "123456";
  await db.verificationCode.create({
    data: {
      phone,
      codeHash: hash(code),
      ip: request.headers.get("x-forwarded-for"),
      expiresAt: new Date(Date.now() + 5 * 60_000)
    }
  });

  try {
    const result = await sendVerificationSms(phone, code);

    return NextResponse.json({
      ok: true,
      mode: result.mode,
      ...(result.mode === "mock" && process.env.NODE_ENV !== "production" ? { devCode: code } : {})
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "短信发送失败，请稍后重试" },
      { status: 502 }
    );
  }
}
