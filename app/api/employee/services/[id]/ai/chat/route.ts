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
      assignee: { select: { name: true } },
      user: { select: { phone: true } },
      workDocument: { select: { originalName: true, updatedAt: true } }
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
      summary: conversation.summary,
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
    await db.aiConversation.update({
      where: { id: conversation.id },
      data: { summary: buildRollingSummary(conversation.summary, [...conversation.messages, userMessage, assistantMessage]) }
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
  summary,
  messages,
  employeeName
}: {
  service: {
    number: string;
    title: string;
    category: string;
    status: string;
    progress: number;
    priceCents: number;
    customerInfo: string;
    user: { phone: string };
    assignee: { name: string } | null;
    workDocument: { originalName: string; updatedAt: Date } | null;
  };
  summary: string;
  messages: Array<{ role: string; content: string }>;
  employeeName: string;
}) {
  const history = messages.slice(-18).map(message => `${message.role === "assistant" ? "AI" : employeeName}：${message.content}`).join("\n");
  return [
    "你是 WZLCF Presentation Studio 的员工侧 AI 助手，帮助员工分析客户需求、整理 PPT 文案、构思页面结构和生成可执行建议。",
    "请用中文回答，语气专业、简洁，避免编造不存在的客户信息。",
    `订单：${service.number} / ${service.title}`,
    `类型：${service.category}，状态：${service.status}，进度：${service.progress}%`,
    `客户信息：${service.customerInfo || service.user.phone}，负责人：${service.assignee?.name || "待分配"}`,
    service.workDocument ? `当前 PPT：${service.workDocument.originalName}` : "当前 PPT：尚未载入工作文件",
    summary ? `历史摘要：${summary}` : "",
    "对话历史：",
    history
  ].filter(Boolean).join("\n");
}

function buildRollingSummary(existing: string, messages: Array<{ role: string; content: string }>) {
  const latest = messages.slice(-6).map(message => `${message.role}:${message.content.slice(0, 300)}`).join(" | ");
  return [existing, latest].filter(Boolean).join(" || ").slice(-3000);
}
