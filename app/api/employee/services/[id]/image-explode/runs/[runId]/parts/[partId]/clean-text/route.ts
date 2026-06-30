import path from "path";
import { writeFile } from "fs/promises";
import sharp from "sharp";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import { openAiBaseUrl, openAiFetch, readProviderError } from "@/lib/ai-providers";
import { imageRoot, readStoredFile, referenceRoot, uniqueStoredName } from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string; runId: string; partId: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  if (!(process.env.OPENAI_API_KEY || "").trim()) return NextResponse.json({ error: "未配置 OPENAI_API_KEY，暂时不能使用 AI 清字精修" }, { status: 503 });
  const { id, runId, partId } = await context.params;
  const part = await db.imageExplodePart.findFirst({
    where: { id: partId, runId, variant: "clean-text", run: { serviceId: id, employeeId: employee.id } },
    include: {
      run: {
        include: {
          sourceImage: true,
          textLayers: { where: { groupKey: { not: null } } }
        }
      }
    }
  });
  if (!part) return NextResponse.json({ error: "只能对含文字的无字可编辑版进行 AI 清字精修" }, { status: 400 });
  const targetTexts = part.run.textLayers.filter(layer => layer.groupKey === part.groupKey).map(layer => layer.content).filter(Boolean);
  if (!targetTexts.length) return NextResponse.json({ error: "这个框没有可定位的文字，无法安全执行 AI 清字" }, { status: 400 });
  try {
    const crop = await originalCrop(part);
    const form = new FormData();
    form.set("model", process.env.OPENAI_IMAGE_MODEL || "gpt-image-1.5");
    form.set("image", new Blob([new Uint8Array(crop)], { type: "image/png" }), `clean-text-${part.id}.png`);
    form.set("prompt", `Remove only these readable text elements from this presentation component: ${targetTexts.join(", ")}. Preserve the frame, colors, gradients, lighting, borders, icons, spacing, aspect ratio, and every non-text visual detail. Do not add any new text, logos, objects, or decorations. Return the same component with the text area clean.`);
    form.set("output_format", "png");
    const response = await openAiFetch(`${openAiBaseUrl()}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form }, 300000);
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.data?.[0]) throw new Error(readProviderError(result, "AI 清字精修失败"));
    const output = result.data[0];
    const buffer = output.b64_json ? Buffer.from(output.b64_json, "base64") : output.url ? await download(output.url) : null;
    if (!buffer) throw new Error("AI 清字没有返回图片结果");
    const storedName = uniqueStoredName("png");
    await writeFile(path.join(imageRoot, storedName), buffer);
    await db.$transaction([
      db.imageExplodePart.update({ where: { id: part.id }, data: { refinedName: storedName } }),
      db.imageExplodeEvent.create({ data: { runId, stage: "text-clean", status: "completed", detail: `已生成“${part.label}”的 AI 清字精修预览；确认后导入时会使用这张无字版。` } })
    ]);
    return NextResponse.json({ ok: true, previewUrl: `/api/employee/image-explode/parts/${part.id}?refined=1` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI 清字精修失败";
    await db.imageExplodeEvent.create({ data: { runId, stage: "text-clean", status: "failed", detail: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function originalCrop(part: { x: number; y: number; width: number; height: number; run: { sourceStoredName: string | null; sourceImage: { storedName: string } | null } }) {
  const name = part.run.sourceImage?.storedName || part.run.sourceStoredName;
  if (!name) throw new Error("找不到原图，无法执行 AI 清字精修");
  const source = await readStoredFile(part.run.sourceImage ? imageRoot : referenceRoot, name);
  const metadata = await sharp(source).metadata();
  const imageWidth = metadata.width || 1;
  const imageHeight = metadata.height || 1;
  const left = Math.max(0, Math.min(imageWidth - 1, Math.round(part.x * imageWidth)));
  const top = Math.max(0, Math.min(imageHeight - 1, Math.round(part.y * imageHeight)));
  const width = Math.max(1, Math.min(imageWidth - left, Math.round(part.width * imageWidth)));
  const height = Math.max(1, Math.min(imageHeight - top, Math.round(part.height * imageHeight)));
  return sharp(source).extract({ left, top, width, height }).png().toBuffer();
}

async function download(url: string) {
  const response = await openAiFetch(url, {}, 300000);
  if (!response.ok) throw new Error("AI 清字结果下载失败");
  return Buffer.from(await response.arrayBuffer());
}
