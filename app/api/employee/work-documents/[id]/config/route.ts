import path from "path";
import { stat } from "fs/promises";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { signFileToken, signJwt } from "@/lib/office";
import { documentRoot } from "@/lib/workspace-storage";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const document = await db.workDocument.findUnique({
    where: { id },
    include: { service: true }
  });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });
  const authorization = await authorizeEmployeeService(document.serviceId, "officeEditor");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;

  // ONLYOFFICE fetches files and callbacks server-to-server, so it needs an
  // address reachable from its container. APP_BASE_URL remains as a legacy
  // fallback for existing local installations.
  const baseUrl = process.env.APP_INTERNAL_URL || process.env.APP_BASE_URL || "http://host.docker.internal:3000";
  const browserBaseUrl = new URL(_request.url).origin;
  const fileToken = signFileToken(document.id);
  const bridgeToken = signFileToken(document.id);
  const pluginGuid = "asc.{57E9D4B6-03B4-4DDC-9C12-57E9D4B60001}";
  // The browser loads the editor script directly, so this must be a public
  // URL in production. ONLYOFFICE_URL remains supported for local setups.
  const onlyOfficeUrl = process.env.ONLYOFFICE_PUBLIC_URL || process.env.ONLYOFFICE_URL || "http://localhost:18080";
  const pluginParams = new URLSearchParams({
    documentId: document.id,
    token: bridgeToken,
    officeUrl: onlyOfficeUrl,
    baseUrl: browserBaseUrl
  });
  const pluginConfigUrl = `${browserBaseUrl}/api/employee/onlyoffice/image-bridge/plugin-config?${pluginParams.toString()}`;
  // ONLYOFFICE caches by `document.key`. A normal editor callback writes a new
  // file in place; when the user later reopens it, reusing the old key makes the
  // server treat changed bytes as a conflicting version and switch to protection.
  // The stable database key protects against stale callbacks; this short file
  // fingerprint makes each saved file a fresh, editable ONLYOFFICE revision.
  const fileFingerprint = await documentFingerprint(document.storedName, document.updatedAt);
  const editorKey = `${document.documentKey}-${fileFingerprint}`.slice(0, 120);
  const config = {
    document: {
      fileType: document.fileType,
      key: editorKey,
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
      plugins: {
        autostart: [pluginGuid],
        pluginsData: [pluginConfigUrl]
      },
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
    scriptUrl: `${onlyOfficeUrl}/web-apps/apps/api/documents/api.js`,
    bridgeToken,
    config: { ...config, token: signJwt(config) }
  });
}

async function documentFingerprint(storedName: string, updatedAt: Date) {
  try {
    const file = await stat(path.join(documentRoot, path.basename(storedName)));
    return `${Math.floor(file.mtimeMs).toString(36)}-${file.size.toString(36)}`;
  } catch {
    return updatedAt.getTime().toString(36);
  }
}
