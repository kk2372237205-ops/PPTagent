import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { referenceRoot, saveFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";
const maxImageBytes = 20 * 1024 * 1024;

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  try {
    const { id } = await context.params;
    const runs = await db.imageExplodeRun.findMany({
      where: { serviceId: id, employeeId: employee.id },
      orderBy: { createdAt: "desc" }, take: 12,
      include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } }, sourceImage: true }
    });
    return NextResponse.json({ runs });
  } catch (error) {
    console.error("Image explode run list failed:", error);
    return NextResponse.json({ error: "拆图服务正在更新，请停止并重新运行 npm run dev 后重试。" }, { status: 503 });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  try {
  const { id } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  if (!employee.isAdmin && service.assigneeId !== employee.id) return NextResponse.json({ error: "你没有操作这个订单的权限" }, { status: 403 });

  const active = await db.imageExplodeRun.count({ where: { employeeId: employee.id, status: { in: ["queued", "running"] } } });
  if (active >= 2) return NextResponse.json({ error: "已有拆图任务正在处理中，请等待它完成后再提交" }, { status: 429 });

  const form = await request.formData();
  const imageId = String(form.get("imageId") || "");
  const image = form.get("image");
  let sourceImageId: string | undefined;
  let sourceStoredName: string | undefined;
  if (imageId) {
    const generated = await db.generatedImage.findUnique({ where: { id: imageId }, include: { job: true } });
    if (!generated || generated.job.serviceId !== id) return NextResponse.json({ error: "这张图片不属于当前订单" }, { status: 400 });
    sourceImageId = generated.id;
    const existing = await db.imageExplodeRun.findFirst({
      where: { serviceId: id, employeeId: employee.id, sourceImageId: generated.id },
      orderBy: { createdAt: "desc" },
      include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, textLayers: { orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } }, sourceImage: true }
    });
    if (existing) return NextResponse.json({ run: existing, reused: true });
  } else if (image instanceof File && image.size > 0) {
    if (!image.type.startsWith("image/")) return NextResponse.json({ error: "仅支持 PNG、JPEG 或 WebP 图片" }, { status: 400 });
    if (image.size > maxImageBytes) return NextResponse.json({ error: "图片不能超过 20MB" }, { status: 400 });
    sourceStoredName = await saveFile(image, referenceRoot);
  } else {
    return NextResponse.json({ error: "请选择 AI 预成品、素材库图片或上传本地图片" }, { status: 400 });
  }

  const run = sourceImageId
    ? await db.imageExplodeRun.upsert({
      where: { sourceImageId },
      create: { serviceId: id, employeeId: employee.id, sourceImageId, events: { create: { stage: "queued", status: "queued", detail: "图片已加入拆解队列，正在等待本地服务处理。" } } },
      update: {},
      include: { parts: { orderBy: [{ zIndex: "asc" }, { createdAt: "asc" }] }, events: { orderBy: { createdAt: "asc" } }, sourceImage: true }
    })
    : await db.imageExplodeRun.create({
      data: { serviceId: id, employeeId: employee.id, sourceStoredName, events: { create: { stage: "queued", status: "queued", detail: "图片已加入拆解队列，正在等待本地服务处理。" } } },
      include: { parts: true, events: true, sourceImage: true }
    });
  return NextResponse.json({ run }, { status: 202 });
  } catch (error) {
    console.error("Image explode run creation failed:", error);
    return NextResponse.json({ error: "拆图任务暂时无法创建，请停止并重新运行 npm run dev 后重试。" }, { status: 503 });
  }
}
