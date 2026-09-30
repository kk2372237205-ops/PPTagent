import path from "path";
import { randomUUID } from "crypto";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (run.status !== "source_ready") return NextResponse.json({ error: "请先完成 PPT 转 PNG，再添加逐页修改要求。" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const rawPageIndexes: unknown[] = Array.isArray(body.pageIndexes) ? body.pageIndexes : [];
  const pageIndexes = Array.from(new Set<number>(rawPageIndexes
    .map(item => Number(item))
    .filter((index): index is number => Number.isInteger(index) && index >= 1 && index <= Number(run.pageCount || 0))))
    .sort((a, b) => a - b)
    .slice(0, 30);
  const note = cleanText(String(body.note || ""), 1000);
  if (!pageIndexes.length || !note) return NextResponse.json({ error: "请选择页面并填写这一页的修改想法。" }, { status: 400 });

  const now = new Date().toISOString();
  const pageNotes = body.replace === true
    ? replacePageNotes(run.pageNotes || [], pageIndexes, note)
    : [...(run.pageNotes || []), { id: randomUUID(), pages: pageIndexes.join(","), note }];
  const slides = (run.slides || []).map((slide: { slideIndex: number }) => ({ ...slide, note: pageNoteFor(slide.slideIndex, pageNotes) }));
  const updated = { ...run, pageNotes, slides, updatedAt: now };
  await writeFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), JSON.stringify(updated, null, 2), "utf8");
  return NextResponse.json({ run: updated });
}

/**
 * 竖向逐页工作台每次只保存该页的最新要求。旧版允许一次选多页，
 * 因此替换时需要保留同一旧条目里未被覆盖的其他页。
 */
function replacePageNotes(current: { id?: string; pages?: string; note?: string }[], pageIndexes: number[], note: string) {
  const replacing = new Set(pageIndexes);
  const kept: { id: string; pages: string; note: string }[] = [];
  for (const item of current) {
    const pages = parsePages(item.pages);
    const remaining = pages.filter(page => !replacing.has(page));
    if (remaining.length) kept.push({ id: String(item.id || randomUUID()), pages: remaining.join(","), note: cleanText(String(item.note || ""), 1000) });
  }
  return [...kept, ...pageIndexes.map(page => ({ id: randomUUID(), pages: String(page), note }))];
}

function parsePages(value: unknown) {
  return Array.from(new Set(String(value || "").split(/[，,;；、\s]+/).map(Number).filter(page => Number.isInteger(page) && page >= 1))).sort((a, b) => a - b);
}

async function readPolishRun(runId: string) {
  try {
    return JSON.parse(await readFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), "utf8"));
  } catch {
    return null;
  }
}

function pageNoteFor(index: number, pageNotes: { pages?: string; note?: string }[]) {
  const matched = (pageNotes || []).filter(item => String(item.pages || "").split(/[，,;；、\s]+/).map(Number).includes(index));
  return cleanText(matched.map(item => item.note).join("；"), 800);
}

function cleanText(value: string, maxLength: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}
