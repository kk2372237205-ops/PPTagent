import path from "path";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { imageRoot, readStoredFile, referenceRoot } from "@/lib/workspace-storage";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ partId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { partId } = await context.params;
  const part = await db.imageExplodePart.findFirst({ where: { id: partId, run: { employeeId: employee.id } }, include: { run: { include: { sourceImage: true } } } });
  const showSource = request.nextUrl.searchParams.get("source") === "1";
  const showRefined = request.nextUrl.searchParams.get("refined") === "1";
  const showPrepared = request.nextUrl.searchParams.get("prepared") === "1";
  if (showSource && part) {
    const sourceName = part.run.sourceImage?.storedName || part.run.sourceStoredName;
    if (!sourceName) return NextResponse.json({ error: "找不到原始图片" }, { status: 404 });
    const sourceDirectory = part.run.sourceImage ? imageRoot : referenceRoot;
    const source = await readStoredFile(sourceDirectory, sourceName);
    const metadata = await sharp(source).metadata();
    const imageWidth = metadata.width || 1;
    const imageHeight = metadata.height || 1;
    const left = Math.max(0, Math.min(imageWidth - 1, Math.round(part.x * imageWidth)));
    const top = Math.max(0, Math.min(imageHeight - 1, Math.round(part.y * imageHeight)));
    const width = Math.max(1, Math.min(imageWidth - left, Math.round(part.width * imageWidth)));
    const height = Math.max(1, Math.min(imageHeight - top, Math.round(part.height * imageHeight)));
    const crop = await sharp(source).extract({ left, top, width, height }).png().toBuffer();
    return new NextResponse(new Uint8Array(crop), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  }
  const storedName = showPrepared ? part?.storedName : (showRefined || part?.variant === "cutout-part" ? part?.refinedName || part?.storedName : part?.storedName);
  if (!part || !storedName) return NextResponse.json({ error: "该候选没有图片预览" }, { status: 404 });
  const file = await readStoredFile(imageRoot, storedName);
  const ext = path.extname(storedName).toLowerCase();
  return new NextResponse(new Uint8Array(file), { headers: { "Content-Type": ext === ".webp" ? "image/webp" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png", "Cache-Control": "private, max-age=3600" } });
}
