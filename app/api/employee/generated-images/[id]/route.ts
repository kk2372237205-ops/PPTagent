import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const image = await db.generatedImage.findUnique({ where: { id } });
  if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
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
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const image = await db.generatedImage.findUnique({ where: { id }, include: { job: true } });
  if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  const { isMaterial, materialOrder } = await request.json();
  const result = await db.generatedImage.update({
    where: { id },
    data: {
      ...(typeof isMaterial === "boolean" ? { isMaterial } : {}),
      ...(Number.isFinite(Number(materialOrder)) ? { materialOrder: Number(materialOrder) } : {})
    }
  });
  return NextResponse.json({ image: result });
}
