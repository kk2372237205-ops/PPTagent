import path from "path";
import { writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentEmployee } from "@/lib/employee-auth";
import {
  ensureWorkspaceDirectories,
  imageRoot,
  referenceRoot,
  saveFile,
  uniqueStoredName
} from "@/lib/workspace-storage";

export const runtime = "nodejs";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({ where: { id } });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });

  const recentCount = await db.generatedImage.count({
    where: {
      job: { employeeId: employee.id },
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) }
    }
  });
  const form = await request.formData();
  const prompt = String(form.get("prompt") ?? "").trim();
  const count = Math.max(1, Math.min(4, Number(form.get("count") ?? 1)));
  const reference = form.get("reference");
  if (!prompt) return NextResponse.json({ error: "请输入图片描述" }, { status: 400 });
  if (recentCount + count > 20) {
    return NextResponse.json({ error: "每名员工每小时最多生成 20 张图片" }, { status: 429 });
  }
  if (reference instanceof File && reference.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "参考图不能超过 10MB" }, { status: 400 });
  }

  const apiKey = process.env.ARK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "尚未配置 ARK_API_KEY，请先在服务端配置新的豆包密钥" }, { status: 503 });
  }

  let referenceStoredName: string | null = null;
  let referenceDataUrl: string | null = null;
  if (reference instanceof File && reference.size) {
    if (!reference.type.startsWith("image/")) {
      return NextResponse.json({ error: "参考文件必须是图片" }, { status: 400 });
    }
    referenceStoredName = await saveFile(reference, referenceRoot);
    referenceDataUrl = `data:${reference.type};base64,${Buffer.from(await reference.arrayBuffer()).toString("base64")}`;
  }

  const job = await db.generationJob.create({
    data: {
      prompt: prompt.slice(0, 3000),
      referenceStoredName,
      serviceId: id,
      employeeId: employee.id
    }
  });

  try {
    await ensureWorkspaceDirectories();
    const generateOne = async () => {
      const response = await fetch("https://ark.cn-beijing.volces.com/api/v3/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: process.env.ARK_IMAGE_MODEL || "doubao-seedream-5-0-260128",
          prompt,
          ...(referenceDataUrl ? { image: referenceDataUrl } : {}),
          sequential_image_generation: "disabled",
          response_format: "url",
          size: "2K",
          stream: false,
          watermark: true
        })
      });
      const result = await response.json();
      if (!response.ok || !result.data?.[0]?.url) {
        throw new Error(result.error?.message || result.message || "豆包图片生成失败");
      }
      const imageUrl = String(result.data[0].url);
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) throw new Error("生成图片下载失败");
      const contentType = imageResponse.headers.get("content-type") || "image/png";
      const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
      const storedName = uniqueStoredName(extension);
      await writeFile(path.join(imageRoot, storedName), Buffer.from(await imageResponse.arrayBuffer()));
      return db.generatedImage.create({
        data: { jobId: job.id, storedName, originalUrl: imageUrl }
      });
    };
    const images = [];
    for (let index = 0; index < count; index += 2) {
      const batchSize = Math.min(2, count - index);
      images.push(...await Promise.all(Array.from({ length: batchSize }, generateOne)));
    }
    await db.generationJob.update({ where: { id: job.id }, data: { status: "completed" } });
    return NextResponse.json({ job: { ...job, status: "completed", images } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片生成失败";
    await db.generationJob.update({ where: { id: job.id }, data: { status: "failed", error: message } });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
