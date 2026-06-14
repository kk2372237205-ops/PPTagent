import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { documentRoot, readStoredFile } from "@/lib/workspace-storage";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findFirst({
    where: { id, userId: user.id, status: "已完成" },
    include: { workDocument: true }
  });
  if (!service) return NextResponse.json({ error: "交付文件不存在或无权访问" }, { status: 404 });

  if (service.workDocument) {
    const file = await readStoredFile(documentRoot, service.workDocument.storedName);
    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${service.title}-最终交付.pptx`)}`,
        "Cache-Control": "private, no-store"
      }
    });
  }

  const content = [
    "WZLCF DEMO DELIVERY",
    `Service: ${service.number}`,
    `Project: ${service.title}`,
    "",
    "This is a first-release demo delivery manifest.",
    "Replace this response with an authorized object-storage download after deployment."
  ].join("\r\n");
  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${service.number}-delivery.txt"`,
      "Cache-Control": "private, no-store"
    }
  });
}
