import { NextResponse } from "next/server";

export async function PATCH() {
  return NextResponse.json(
    { error: "旧员工席位接口已停用，请在管理控制台按企业微信成员管理权限" },
    { status: 410 }
  );
}
