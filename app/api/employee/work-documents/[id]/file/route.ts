import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyFileToken } from "@/lib/office";
import { documentRoot, readStoredFile } from "@/lib/workspace-storage";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!verifyFileToken(id, request.nextUrl.searchParams.get("token"))) {
    return NextResponse.json({ error: "文件链接无效或已过期" }, { status: 403 });
  }
  const document = await db.workDocument.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });
  const file = await readStoredFile(documentRoot, document.storedName);
  const contentType = document.fileType === "ppt"
    ? "application/vnd.ms-powerpoint"
    : "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.originalName)}`
    }
  });
}
