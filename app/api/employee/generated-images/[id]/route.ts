import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canAccessService, currentEmployeeAccess, hasEmployeeFeature } from "@/lib/employee-auth";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!["aiAssistant", "smartPpt", "materials", "imageTools"].some(feature => hasEmployeeFeature(access, feature as "aiAssistant" | "smartPpt" | "materials" | "imageTools"))) {
    return NextResponse.json({ error: "你的账号未开通图片预览功能" }, { status: 403 });
  }
  const { id } = await context.params;
  const image = await db.generatedImage.findUnique({
    where: { id },
    include: {
      job: {
        include: {
          service: { select: { assigneeId: true, organizationId: true } }
        }
      }
    }
  });
  if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  if (!canAccessService(access, image.job.service)) return NextResponse.json({ error: "你无权查看这张图片" }, { status: 403 });
  const file = await readStoredFile(imageRoot, image.storedName);
  const extension = image.storedName.split(".").pop()?.toLowerCase();
  const contentType = extension === "jpg" || extension === "jpeg"
    ? "image/jpeg"
    : extension === "webp"
      ? "image/webp"
      : "image/png";
  const disposition = request.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="wzlcf-ai-${id}.${extension || "png"}"`,
      "Cache-Control": "private, max-age=3600"
    }
  });
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!hasEmployeeFeature(access, "materials")) return NextResponse.json({ error: "你的账号未开通素材库" }, { status: 403 });
  const employee = access.employee;
  const { id } = await context.params;
  const image = await db.generatedImage.findUnique({
    where: { id },
    include: {
      job: {
        include: {
          service: { select: { assigneeId: true, organizationId: true } }
        }
      }
    }
  });
  if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  if (!canAccessService(access, image.job.service)) return NextResponse.json({ error: "你无权管理这张图片" }, { status: 403 });
  const { isMaterial, materialOrder } = await request.json();
  if (isMaterial === false) {
    await db.materialItem.deleteMany({ where: { imageId: id, employeeId: employee.id } });
    return NextResponse.json({ ok: true });
  }
  const order = Number.isFinite(Number(materialOrder)) ? Number(materialOrder) : 0;
  const item = await db.materialItem.upsert({
    where: { employeeId_imageId: { employeeId: employee.id, imageId: id } },
    create: {
      imageId: id,
      employeeId: employee.id,
      serviceId: image.job.serviceId,
      materialOrder: order
    },
    update: { materialOrder: order }
  });
  return NextResponse.json({ materialItem: item });
}
