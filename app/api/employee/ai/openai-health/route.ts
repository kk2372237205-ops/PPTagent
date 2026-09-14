import { NextResponse } from "next/server";
import { currentEmployeeAccess, hasEmployeeFeature } from "@/lib/employee-auth";
import { openAiDiagnosticsConfig } from "@/lib/ai-providers";

export const runtime = "nodejs";

export async function GET() {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  if (!hasEmployeeFeature(access, "aiAssistant")) {
    return NextResponse.json({ error: "你的账号未开通 AI 助手权限" }, { status: 403 });
  }

  const services = openAiDiagnosticsConfig();
  const text = {
    ...services.text,
    ok: services.text.configured,
    error: services.text.configured ? "" : "尚未配置 AI_TEXT_API_KEY"
  };
  const image = {
    ...services.image,
    ok: services.image.configured,
    error: services.image.configured ? "" : "尚未配置 AI_IMAGE_API_KEY"
  };
  const errors = [text.error, image.error].filter(Boolean);

  return NextResponse.json({
    ok: text.ok && image.ok,
    text,
    image,
    error: errors.join("；")
  });
}
