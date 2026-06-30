import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";
import { documentRoot, saveFile } from "@/lib/workspace-storage";

const allowedExtensions = new Set([".ppt", ".pptx"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });

  const { id } = await context.params;
  const document = await db.workDocument.findUnique({
    where: { id },
    include: { service: true }
  });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "请选择 PPT 或 PPTX 文件" }, { status: 400 });
  }
  const extension = path.extname(file.name).toLowerCase();
  if (!allowedExtensions.has(extension)) {
    return NextResponse.json({ error: "仅支持 PPT 和 PPTX 文件" }, { status: 400 });
  }
  if (file.size > workPresentationMaxBytes) {
    return NextResponse.json({ error: `PPT 文件不能超过 ${workPresentationMaxLabel}` }, { status: 400 });
  }

  const fileType = extension.slice(1);
  const storedName = await saveFile(file, documentRoot, fileType);
  const updated = await db.workDocument.update({
    where: { id },
    data: {
      originalName: file.name,
      storedName,
      fileType,
      documentKey: `${document.service.number}-${Date.now()}`
    }
  });
  if (document.service.status === "待开始") {
    await db.service.update({
      where: { id: document.serviceId },
      data: { status: "制作中", progress: Math.max(5, document.service.progress) }
    });
  }
  await db.serviceActivity.create({
    data: {
      serviceId: document.serviceId,
      employeeId: employee.id,
      action: "replace-work-file",
      detail: `载入工作文件：${file.name}`
    }
  });
  return NextResponse.json({ workDocument: updated });
}
