import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { enqueueOfficeImageCommand, finishOfficeImageCommand, getOfficeImageCommand, takeNextOfficeImageCommand } from "@/lib/onlyoffice-image-bridge";
import { signFileToken, verifyFileToken } from "@/lib/office";

export const runtime = "nodejs";

const slideWidthMm = 254;
const slideHeightMm = 143;
const imageWidthMm = 122;
const imageHeightMm = 72;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, {
    ...init,
    headers: { ...corsHeaders, ...(init?.headers || {}) }
  });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  const employee = await currentEmployee();
  if (!employee) return json({ error: "请先登录员工模式" }, { status: 401 });

  const body = await request.json().catch(() => null) as {
    documentId?: string;
    token?: string;
    imageId?: string;
    xRatio?: number;
    yRatio?: number;
  } | null;
  if (!body?.documentId || !body.token || !body.imageId) {
    return json({ error: "插图参数不完整" }, { status: 400 });
  }
  if (!verifyFileToken(body.documentId, body.token)) {
    return json({ error: "PPT 插图桥接已过期，请刷新页面后重试" }, { status: 403 });
  }

  const [document, image] = await Promise.all([
    db.workDocument.findUnique({ where: { id: body.documentId }, include: { service: true } }),
    db.generatedImage.findUnique({ where: { id: body.imageId }, include: { job: true } })
  ]);
  if (!document) return json({ error: "工作文件不存在" }, { status: 404 });
  if (!image) return json({ error: "图片不存在" }, { status: 404 });
  if (image.job.serviceId !== document.serviceId) {
    return json({ error: "这张图片不属于当前订单" }, { status: 400 });
  }

  // This URL is consumed inside the employee's browser by the optional
  // editor plugin, so it must never point at the Docker-only app hostname.
  const baseUrl = process.env.APP_PUBLIC_URL || request.nextUrl.origin;
  const imageToken = signFileToken(image.id);
  const xRatio = clamp(Number(body.xRatio), 0, 1, 0.5);
  const yRatio = clamp(Number(body.yRatio), 0, 1, 0.5);
  const xMm = clamp(xRatio * slideWidthMm - imageWidthMm / 2, 5, slideWidthMm - imageWidthMm - 5, 24);
  const yMm = clamp(yRatio * slideHeightMm - imageHeightMm / 2, 5, slideHeightMm - imageHeightMm - 5, 24);

  const command = enqueueOfficeImageCommand({
    documentId: body.documentId,
    imageUrl: `${baseUrl}/api/employee/onlyoffice/image-bridge/images/${image.id}?token=${encodeURIComponent(imageToken)}`,
    xMm,
    yMm,
    widthMm: imageWidthMm,
    heightMm: imageHeightMm
  });

  return json({ commandId: command.id });
}

export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("documentId") || "";
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!documentId || !verifyFileToken(documentId, token)) {
    return json({ error: "bridge token invalid" }, { status: 403 });
  }
  const commandId = request.nextUrl.searchParams.get("commandId");
  if (commandId) {
    const command = getOfficeImageCommand(documentId, commandId);
    return json({ command });
  }
  const command = takeNextOfficeImageCommand(documentId);
  return json({ command });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null) as {
    documentId?: string;
    token?: string;
    commandId?: string;
    error?: string;
  } | null;
  if (!body?.documentId || !body.token || !body.commandId || !verifyFileToken(body.documentId, body.token)) {
    return json({ error: "bridge token invalid" }, { status: 403 });
  }
  finishOfficeImageCommand(body.documentId, body.commandId, body.error);
  return json({ ok: true });
}

function clamp(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}
