import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyFileToken } from "@/lib/office";
import { imageRoot, readStoredFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const token = request.nextUrl.searchParams.get("token");
  if (!verifyFileToken(id, token)) {
    return NextResponse.json({ error: "图片链接无效或已过期" }, { status: 403 });
  }
  const image = await db.generatedImage.findUnique({ where: { id } });
  if (!image) return NextResponse.json({ error: "图片不存在" }, { status: 404 });
  const file = await readStoredFile(imageRoot, image.storedName);
  const extension = image.storedName.split(".").pop()?.toLowerCase();
  const contentType = extension === "jpg" || extension === "jpeg"
    ? "image/jpeg"
    : extension === "webp"
      ? "image/webp"
      : "image/png";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, max-age=1800"
    }
  });
}
