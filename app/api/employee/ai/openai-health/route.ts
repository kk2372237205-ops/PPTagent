import { NextResponse } from "next/server";
import { currentEmployee } from "@/lib/employee-auth";
import { openAiDiagnosticsConfig, openAiFetch, readProviderError } from "@/lib/ai-providers";

export const runtime = "nodejs";

export async function GET() {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });

  const config = openAiDiagnosticsConfig();
  if (!config.keyConfigured) {
    return NextResponse.json({
      ok: false,
      ...config,
      error: "尚未配置 OPENAI_API_KEY"
    });
  }

  try {
    const response = await openAiFetch(`${config.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
    }, 20000);
    const result = await response.json();
    if (!response.ok) {
      return NextResponse.json({
        ok: false,
        ...config,
        status: response.status,
        error: classifyOpenAiError(response.status, readProviderError(result, "OpenAI 检查失败"))
      });
    }

    const ids = Array.isArray(result.data) ? result.data.map((item: { id?: string }) => item.id).filter(Boolean) : [];
    const textModelAvailable = ids.includes(config.textModel);
    const imageModelAvailable = ids.includes(config.imageModel);
    return NextResponse.json({
      ok: textModelAvailable && imageModelAvailable,
      ...config,
      textModelAvailable,
      imageModelAvailable,
      error: !textModelAvailable
        ? `当前项目暂不可用文本模型 ${config.textModel}`
        : !imageModelAvailable
          ? `当前项目暂不可用图片模型 ${config.imageModel}`
          : ""
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      ...config,
      error: error instanceof Error ? error.message : "OpenAI 健康检查失败"
    });
  }
}

function classifyOpenAiError(status: number, message: string) {
  if (status === 401) return `OpenAI API Key 无效或未授权：${message}`;
  if (status === 403) return `当前项目或密钥没有访问权限：${message}`;
  if (status === 429) return `OpenAI 额度、限速或账单限制：${message}`;
  return message;
}
