import { randomBytes } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const allowed = new Set([".ppt", ".pptx", ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg", ".zip"]);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const consultation = await db.consultation.findFirst({ where: { id, userId: user.id } });
  if (!consultation) return NextResponse.json({ error: "咨询不存在" }, { status: 404 });

  const form = await request.formData();
  const content = String(form.get("content") ?? "").trim();
  const files = form.getAll("files").filter((item): item is File => item instanceof File);
  if (!content && !files.length) return NextResponse.json({ error: "请输入消息或选择附件" }, { status: 400 });
  if (files.length > 5) return NextResponse.json({ error: "每次最多上传 5 个文件" }, { status: 400 });
  if (files.reduce((sum, file) => sum + file.size, 0) > 100 * 1024 * 1024) {
    return NextResponse.json({ error: "附件总大小不能超过 100MB" }, { status: 400 });
  }
  for (const file of files) {
    if (!allowed.has(path.extname(file.name).toLowerCase())) {
      return NextResponse.json({ error: `不支持文件：${file.name}` }, { status: 400 });
    }
  }

  const message = await db.message.create({
    data: { consultationId: id, content: content || "已上传需求材料", role: "customer" }
  });
  const uploadDir = path.join(process.cwd(), "uploads");
  await mkdir(uploadDir, { recursive: true });
  for (const file of files) {
    const storedName = `${randomBytes(18).toString("hex")}${path.extname(file.name).toLowerCase()}`;
    await writeFile(path.join(uploadDir, storedName), Buffer.from(await file.arrayBuffer()));
    await db.attachment.create({
      data: {
        originalName: file.name,
        storedName,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        messageId: message.id
      }
    });
  }

  const result = await db.message.findUnique({ where: { id: message.id }, include: { attachments: true } });
  return NextResponse.json({ message: result });
}
