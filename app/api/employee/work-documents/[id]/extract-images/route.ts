import path from "path";
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { documentRoot, readStoredFile } from "@/lib/workspace-storage";

export const runtime = "nodejs";

type ExtractedPptImage = {
  id: string;
  slideNumber: number;
  name: string;
  extension: string;
  contentType: string;
  dataUrl: string;
  crop: { left: number; top: number; right: number; bottom: number };
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const document = await db.workDocument.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });
  const authorization = await authorizeEmployeeService(document.serviceId, "imageTools");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  if (document.fileType !== "pptx") {
    return NextResponse.json({ error: "当前工作文件不是 PPTX，暂时无法提取图片" }, { status: 400 });
  }

  const zip = await JSZip.loadAsync(await readStoredFile(documentRoot, document.storedName));
  const requestedSlide = Number(new URL(request.url).searchParams.get("slide") || 0);
  const slides = zip.file(/^ppt\/slides\/slide\d+\.xml$/)
    .map(file => ({
      path: file.name,
      number: Number(file.name.match(/slide(\d+)\.xml$/)?.[1] || 0),
      file
    }))
    .filter(item => item.number > 0)
    .sort((a, b) => a.number - b.number);
  const targetSlides = requestedSlide > 0 ? slides.filter(item => item.number === requestedSlide) : slides;

  const images: ExtractedPptImage[] = [];
  for (const slide of targetSlides) {
    const slideXml = await slide.file.async("string");
    const rels = await slideRels(zip, slide.number);
    const pics = Array.from(slideXml.matchAll(/<p:pic\b[\s\S]*?<\/p:pic>/g)).map(match => match[0]);
    for (const [index, picXml] of pics.entries()) {
      const relId = picXml.match(/\br:embed="([^"]+)"/)?.[1];
      const target = relId ? rels.get(relId) : null;
      if (!target) continue;
      const mediaPath = resolveMediaTarget(target);
      const file = zip.file(mediaPath);
      if (!file) continue;
      const extension = extensionFor(mediaPath);
      const contentType = contentTypeForExtension(extension);
      images.push({
        id: `${slide.number}-${index}-${relId}`,
        slideNumber: slide.number,
        name: picXml.match(/<p:cNvPr[^>]*\bname="([^"]+)"/)?.[1] || `第 ${slide.number} 页图片 ${index + 1}`,
        extension,
        contentType,
        dataUrl: `data:${contentType};base64,${await file.async("base64")}`,
        crop: cropFrom(picXml)
      });
      if (images.length >= 40) {
        return NextResponse.json({ images, truncated: true });
      }
    }
  }

  return NextResponse.json({
    images,
    truncated: false,
    slideNumber: requestedSlide > 0 ? requestedSlide : null,
    slideCount: slides.length
  });
}

async function slideRels(zip: JSZip, slideNumber: number) {
  const rels = new Map<string, string>();
  const file = zip.file(`ppt/slides/_rels/slide${slideNumber}.xml.rels`);
  if (!file) return rels;
  const xml = await file.async("string");
  for (const match of xml.matchAll(/<Relationship\b([^>]+?)\/?>/g)) {
    const attrs = match[1];
    const id = attrs.match(/\bId="([^"]+)"/)?.[1];
    const type = attrs.match(/\bType="([^"]+)"/)?.[1] || "";
    const target = attrs.match(/\bTarget="([^"]+)"/)?.[1];
    if (id && target && type.includes("/image")) rels.set(id, target);
  }
  return rels;
}

function resolveMediaTarget(target: string) {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  return path.posix.normalize(path.posix.join("ppt/slides", target));
}

function cropFrom(picXml: string) {
  const attrs = picXml.match(/<a:srcRect\b([^>]*)\/?>/)?.[1] || "";
  return {
    left: percentAttr(attrs, "l"),
    top: percentAttr(attrs, "t"),
    right: percentAttr(attrs, "r"),
    bottom: percentAttr(attrs, "b")
  };
}

function percentAttr(attrs: string, name: string) {
  return Math.max(0, Math.min(1, Number(attrs.match(new RegExp(`\\b${name}="(-?\\d+)"`))?.[1] || 0) / 100000));
}

function extensionFor(filePath: string) {
  const extension = path.posix.extname(filePath).slice(1).toLowerCase();
  if (extension === "jpeg") return "jpg";
  return ["png", "jpg", "webp", "gif"].includes(extension) ? extension : "png";
}

function contentTypeForExtension(extension: string) {
  if (extension === "jpg") return "image/jpeg";
  if (extension === "webp") return "image/webp";
  if (extension === "gif") return "image/gif";
  return "image/png";
}
