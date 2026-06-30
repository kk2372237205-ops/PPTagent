import path from "path";
import { copyFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";
import {
  documentRoot,
  ensureWorkspaceDirectories,
  saveFile,
  uniqueStoredName
} from "@/lib/workspace-storage";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({
    where: { id },
    include: { workDocument: true }
  });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  if (service.workDocument) return NextResponse.json({ workDocument: service.workDocument });

  const form = await request.formData();
  const source = String(form.get("source") ?? "blank");
  const file = form.get("file");
  const attachmentId = String(form.get("attachmentId") ?? "");
  await ensureWorkspaceDirectories();

  let storedName = "";
  let originalName = `${service.title}.pptx`;

  if (source === "upload") {
    if (!(file instanceof File) || path.extname(file.name).toLowerCase() !== ".pptx") {
      return NextResponse.json({ error: "请上传 PPTX 文件" }, { status: 400 });
    }
    if (file.size > workPresentationMaxBytes) {
      return NextResponse.json({ error: `工作文件不能超过 ${workPresentationMaxLabel}` }, { status: 400 });
    }
    storedName = await saveFile(file, documentRoot, "pptx");
    originalName = file.name;
  } else if (source === "attachment") {
    const attachment = await db.attachment.findFirst({
      where: {
        id: attachmentId,
        message: { consultationId: service.consultationId ?? "__none__" }
      }
    });
    if (!attachment || path.extname(attachment.originalName).toLowerCase() !== ".pptx") {
      return NextResponse.json({ error: "请选择该订单客户上传的 PPTX 文件" }, { status: 400 });
    }
    storedName = uniqueStoredName("pptx");
    await copyFile(
      path.join(process.cwd(), "uploads", path.basename(attachment.storedName)),
      path.join(documentRoot, storedName)
    );
    originalName = attachment.originalName;
  } else {
    storedName = uniqueStoredName("pptx");
    const PptxGenJS = (await import("pptxgenjs")).default;
    const presentation = new PptxGenJS();
    presentation.layout = "LAYOUT_WIDE";
    presentation.author = "WZLCF Presentation Studio";
    presentation.subject = service.title;
    presentation.title = service.title;
    presentation.addSlide();
    await presentation.writeFile({ fileName: path.join(documentRoot, storedName) });
  }

  const workDocument = await db.workDocument.create({
    data: {
      serviceId: id,
      originalName,
      storedName,
      fileType: "pptx",
      documentKey: `${service.number}-${Date.now()}`
    }
  });
  if (service.status === "待开始") {
    await db.service.update({ where: { id }, data: { status: "制作中", progress: Math.max(5, service.progress) } });
  }
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: employee.id,
      action: "workspace",
      detail: source === "blank" ? "创建空白 16:9 工作文件" : `创建工作文件：${originalName}`
    }
  });
  return NextResponse.json({ workDocument });
}
