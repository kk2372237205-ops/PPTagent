import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { signFileToken, signJwt } from "@/lib/office";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const document = await db.workDocument.findUnique({
    where: { id },
    include: { service: true }
  });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });

  const baseUrl = process.env.APP_BASE_URL || "http://host.docker.internal:3000";
  const fileToken = signFileToken(document.id);
  const config = {
    document: {
      fileType: document.fileType,
      key: document.documentKey,
      title: document.originalName,
      url: `${baseUrl}/api/employee/work-documents/${document.id}/file?token=${encodeURIComponent(fileToken)}`,
      permissions: { edit: true, download: true, print: true, review: true }
    },
    documentType: "slide",
    editorConfig: {
      callbackUrl: `${baseUrl}/api/employee/onlyoffice/callback/${document.id}`,
      lang: "zh-CN",
      mode: "edit",
      user: { id: employee.id, name: employee.name },
      customization: {
        autosave: true,
        forcesave: true,
        compactHeader: false,
        feedback: false,
        help: false
      }
    }
  };
  return NextResponse.json({
    scriptUrl: `${process.env.ONLYOFFICE_URL || "http://localhost:8080"}/web-apps/apps/api/documents/api.js`,
    config: { ...config, token: signJwt(config) }
  });
}
