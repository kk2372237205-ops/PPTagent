import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "员工手机号登录已停用，请使用微信扫码登录" },
    { status: 410 }
  );
}
