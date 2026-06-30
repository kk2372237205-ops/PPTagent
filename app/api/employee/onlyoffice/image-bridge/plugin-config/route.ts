import { NextRequest, NextResponse } from "next/server";
import { verifyFileToken } from "@/lib/office";

export const runtime = "nodejs";

const pluginGuid = "asc.{57E9D4B6-03B4-4DDC-9C12-57E9D4B60001}";

export async function GET(request: NextRequest) {
  const documentId = request.nextUrl.searchParams.get("documentId") || "";
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!documentId || !verifyFileToken(documentId, token)) {
    return NextResponse.json({ error: "plugin token invalid" }, { status: 403 });
  }

  const baseUrl = (request.nextUrl.searchParams.get("baseUrl") || request.nextUrl.origin).replace(/\/$/, "");
  const officeUrl = (request.nextUrl.searchParams.get("officeUrl") || process.env.ONLYOFFICE_PUBLIC_URL || process.env.ONLYOFFICE_URL || "http://localhost:8080").replace(/\/$/, "");
  const params = new URLSearchParams({ documentId, token, officeUrl, baseUrl });

  return NextResponse.json({
    guid: pluginGuid,
    version: "1.0.0",
    name: "WZLCF Image Bridge",
    nameLocale: { "zh-CN": "WZLCF 图片桥接" },
    loader: true,
    variations: [
      {
        description: "Insert dragged WZLCF images into the current presentation slide.",
        descriptionLocale: { "zh-CN": "把 WZLCF 拖拽图片插入当前演示文稿。" },
        url: `${officeUrl}/sdkjs-plugins/wzlcf-image-bridge/index.html?${params.toString()}`,
        icons: [],
        isViewer: false,
        EditorsSupport: ["slide"],
        isVisual: false,
        isModal: false,
        isInsideMode: false,
        initDataType: "none",
        initData: "",
        buttons: []
      }
    ]
  }, { headers: { "Access-Control-Allow-Origin": "*" } });
}
