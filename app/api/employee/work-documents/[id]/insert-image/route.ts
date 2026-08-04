import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { documentRoot, imageRoot, uniqueStoredName } from "@/lib/workspace-storage";
import { insertImageIntoPptxFile } from "@/lib/pptx-image-insert";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as {
    imageId?: string;
    xRatio?: number;
    yRatio?: number;
    slideNumber?: number;
  } | null;
  if (!body?.imageId) return NextResponse.json({ error: "请选择要插入的图片" }, { status: 400 });

  const [document, image] = await Promise.all([
    db.workDocument.findUnique({ where: { id }, include: { service: true } }),
    db.generatedImage.findUnique({ where: { id: body.imageId }, include: { job: true } })
  ]);
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });
  const authorization = await authorizeEmployeeService(document.serviceId, "officeEditor");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  if (document.fileType !== "pptx") {
    return NextResponse.json({ error: "当前工作文件不是 PPTX，暂时无法自动写入图片" }, { status: 400 });
  }
  if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  if (image.job.serviceId !== document.serviceId) {
    return NextResponse.json({ error: "这张图片不属于当前订单" }, { status: 400 });
  }

  const nextStoredName = uniqueStoredName("pptx");
  await insertImageIntoPptxFile(
    path.join(documentRoot, path.basename(document.storedName)),
    path.join(documentRoot, nextStoredName),
    {
      imagePath: path.join(imageRoot, path.basename(image.storedName)),
      imageExtension: path.extname(image.storedName).slice(1),
      slideNumber: body.slideNumber || 1,
      xRatio: body.xRatio,
      yRatio: body.yRatio
    }
  );

  const updated = await db.workDocument.update({
    where: { id },
    data: {
      storedName: nextStoredName,
      fileType: "pptx",
      documentKey: `${document.service.number}-${Date.now()}`
    }
  });

  await db.serviceActivity.create({
    data: {
      serviceId: document.serviceId,
      employeeId: employee.id,
      action: "insert-image",
      detail: `插入素材图片到 PPT：${image.id}`
    }
  });

  return NextResponse.json({ workDocument: updated });
}
