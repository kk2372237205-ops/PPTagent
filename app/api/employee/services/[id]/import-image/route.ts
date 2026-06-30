import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { imageRoot, saveFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

const maxImageSize = 20 * 1024 * 1024;

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const form = await request.formData();
  const file = form.get("image");
  const addToMaterial = String(form.get("addToMaterial") ?? "false") === "true";

  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "请拖入图片文件" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "只支持图片文件" }, { status: 400 });
  }
  if (file.size > maxImageSize) {
    return NextResponse.json({ error: "图片不能超过 20MB" }, { status: 400 });
  }

  const extension = extensionFor(file);
  const storedName = await saveFile(file, imageRoot, extension);
  const job = await db.generationJob.create({
    data: {
      prompt: file.name || "本地拖入图片",
      status: "completed",
      serviceId: id,
      employeeId: employee.id,
      provider: "upload",
      model: "local-file"
    }
  });
  const image = await db.generatedImage.create({
    data: { jobId: job.id, storedName },
    include: {
      job: { include: { employee: { select: { id: true, name: true } } } }
    }
  });

  let materialItem = null;
  if (addToMaterial) {
    const maxOrder = await db.materialItem.aggregate({
      where: { serviceId: id, employeeId: employee.id },
      _max: { materialOrder: true }
    });
    materialItem = await db.materialItem.create({
      data: {
        serviceId: id,
        employeeId: employee.id,
        imageId: image.id,
        materialOrder: (maxOrder._max.materialOrder ?? 0) + 1
      },
      include: {
        employee: { select: { id: true, name: true } },
        image: {
          include: {
            job: {
              include: { employee: { select: { id: true, name: true } } }
            }
          }
        }
      }
    });
  }

  return NextResponse.json({ image, materialItem });
}

function extensionFor(file: File) {
  const byName = path.extname(file.name).slice(1).toLowerCase();
  if (byName) return byName;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  return "png";
}
