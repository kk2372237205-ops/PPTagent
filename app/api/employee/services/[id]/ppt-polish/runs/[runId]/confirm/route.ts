import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { aiImageConfig } from "@/lib/ai-providers";
import { pptPolishWorkerHealth } from "@/lib/ppt-polish-worker-health";
import { documentRoot, workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  const canConfirm = run.status === "plan_ready" || run.status === "source_ready" || (["queued", "confirmed", "planning", "generating"].includes(run.status) && !run.pageCount && !run.slides?.length);
  if (!canConfirm) {
    return NextResponse.json({ error: "当前美化任务不能重复确认" }, { status: 400 });
  }
  const workerHealth = pptPolishWorkerHealth();
  if (!workerHealth.ok) {
    return NextResponse.json({ error: workerHealth.message || "PPT 美化 Worker 未运行/已停止，请重启 npm run dev:lite 或 npm run dev" }, { status: 503 });
  }
  const imageService = aiImageConfig();
  if (!imageService.configured) {
    return NextResponse.json({ error: "尚未配置 AI_IMAGE_API_KEY，无法按原页图片重绘。" }, { status: 503 });
  }
  if (!imageService.supportsEdits) {
    return NextResponse.json({ error: "美化 PPT 需要把原页 PNG 连同本页要求发送给图片模型。请确认图片中转站支持 /images/edits，并将 AI_IMAGE_SUPPORTS_EDITS 设为 1 后重启服务。" }, { status: 503 });
  }
  const now = new Date().toISOString();
  if (run.status === "source_ready") {
    const slides = await extractPptxSlides(run.sourceStoredName, run.pageNotes);
    const updated = { ...run, status: "generating", pageCount: slides.length, slides, error: "", updatedAt: now };
    await writeFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), JSON.stringify(updated, null, 2), "utf8");
    return NextResponse.json({ run: updated }, { status: 202 });
  }
  let slides;
  try {
    slides = await extractPptxSlides(run.sourceStoredName, run.pageNotes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "PPTX 解析失败";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  // The local background script first turns this PPTX into a private per-page
  // PNG set. Image generation begins only after that snapshot stage succeeds.
  const updated = { ...run, status: "confirmed", confirmedAt: now, pageCount: slides.length, slides, error: "", updatedAt: now };
  await writeFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), JSON.stringify(updated, null, 2), "utf8");
  return NextResponse.json({ run: updated }, { status: 202 });
}

async function readPolishRun(runId: string) {
  try {
    return JSON.parse(await readFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), "utf8"));
  } catch {
    return null;
  }
}

async function extractPptxSlides(storedName: string, pageNotes: { pages?: string; note?: string }[] = []) {
  const filePath = path.join(documentRoot, path.basename(storedName));
  if (path.extname(filePath).toLowerCase() !== ".pptx") {
    throw new Error("美化模式目前只支持 PPTX，请先另存为 PPTX。");
  }
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const slideFiles = Object.keys(zip.files)
    .filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] || 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] || 0));
  if (!slideFiles.length) throw new Error("没有从 PPTX 中识别到幻灯片页面。");
  const now = new Date().toISOString();
  const slides = [];
  for (const [index, fileName] of slideFiles.entries()) {
    const xml = await zip.file(fileName)?.async("text");
    const texts = Array.from(String(xml || "").matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g))
      .map(match => cleanText(xmlText(match[1]), 180))
      .filter(Boolean);
    const uniqueTexts = Array.from(new Set(texts));
    const slideIndex = index + 1;
    slides.push({
      slideIndex,
      title: uniqueTexts.find(item => item.length >= 2) || `第 ${slideIndex} 页`,
      originalText: cleanText(uniqueTexts.join(" / "), 1800),
      note: pageNoteFor(slideIndex, pageNotes),
      status: "queued",
      updatedAt: now
    });
  }
  return slides;
}

function pageNoteFor(index: number, pageNotes: { pages?: string; note?: string }[]) {
  const matched: string[] = [];
  for (const item of pageNotes || []) {
    const pages = String(item.pages || "");
    const parts = pages.split(/[,\uFF0C;；、\s]+/).filter(Boolean);
    for (const part of parts) {
      const range = part.match(/^(\d+)\s*[-~至到]\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (index >= Math.min(start, end) && index <= Math.max(start, end)) matched.push(String(item.note || ""));
      } else if (Number(part) === index) {
        matched.push(String(item.note || ""));
      }
    }
  }
  return cleanText(matched.join("；"), 800);
}

function cleanText(value: string, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function xmlText(value: string) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}
