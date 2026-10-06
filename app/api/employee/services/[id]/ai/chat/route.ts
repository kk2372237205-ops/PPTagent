import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { generateTextResponse, resolveTextModel } from "@/lib/ai-providers";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const authorization = await authorizeEmployeeService(id, "aiAssistant");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const service = await db.service.findUnique({
    where: { id },
    include: {
      workDocument: { select: { originalName: true } }
    }
  });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const { content, modelId } = await request.json();
  const text = String(content || "").trim();
  if (!text) return NextResponse.json({ error: "请输入要发送给 AI 的内容" }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: "单次输入不能超过 6000 字" }, { status: 400 });

  const model = resolveTextModel(String(modelId || ""));
  if (!model.available) {
    return NextResponse.json({ error: `尚未配置 ${model.provider === "ark" ? "ARK_API_KEY" : "AI_TEXT_API_KEY"}` }, { status: 503 });
  }

  const conversation = await db.aiConversation.upsert({
    where: { serviceId_employeeId: { serviceId: id, employeeId: employee.id } },
    create: { serviceId: id, employeeId: employee.id },
    update: {},
    include: {
      messages: { orderBy: { createdAt: "asc" }, take: 24 }
    }
  });

  const userMessage = await db.aiMessage.create({
    data: {
      conversationId: conversation.id,
      employeeId: employee.id,
      role: "user",
      content: text,
      provider: model.provider,
      model: model.model
    }
  });

  try {
    const answer = await generateTextResponse(model, buildPrompt({
      service,
      messages: [...conversation.messages, userMessage],
      employeeName: employee.name
    }));
    const assistantMessage = await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        employeeId: employee.id,
        role: "assistant",
        content: answer,
        provider: model.provider,
        model: model.model
      }
    });
    return NextResponse.json({ messages: [userMessage, assistantMessage] });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 回复失败";
    await db.aiMessage.create({
      data: {
        conversationId: conversation.id,
        employeeId: employee.id,
        role: "assistant",
        content: `生成失败：${message}`,
        provider: model.provider,
        model: model.model,
        metadata: JSON.stringify({ failed: true })
      }
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function buildPrompt({
  service,
  messages,
  employeeName
}: {
  service: {
    number: string;
    title: string;
    category: string;
    status: string;
    progress: number;
    workDocument: { originalName: string } | null;
  };
  messages: Array<{ role: string; content: string }>;
  employeeName: string;
}) {
  const latestMessage = messages.at(-1)?.content || "";
  const base = [
    "你是 WZLCF Presentation Studio 的员工侧 AI 助手。",
    "直接回答用户最新一句话；使用中文、专业且简洁。",
    "只有用户明确询问当前订单或 PPT 工作时才使用订单信息。对问候、闲聊或泛问题，不要主动提订单、PPT、进度、文件、缺少资料或下一步计划。"
  ];
  if (!shouldUseOrderContext(latestMessage)) return [...base, `用户：${latestMessage}`].join("\n");

  const history = messages.slice(-12).map(message => `${message.role === "assistant" ? "AI" : employeeName}：${message.content}`).join("\n");
  return [
    ...base,
    "当前订单工作上下文：",
    `订单：${service.number} / ${service.title}`,
    `类型：${service.category}，状态：${service.status}，进度：${service.progress}%`,
    service.workDocument ? `当前 PPT：${service.workDocument.originalName}` : "当前 PPT：尚未载入工作文件",
    "对话历史：",
    history
  ].join("\n");
}

function shouldUseOrderContext(text: string) {
  return /订单|客户|需求|ppt|文稿|文件|幻灯|页面|页数|大纲|文案|版式|设计|素材|交付|进度|项目|这份/i.test(text);
}
