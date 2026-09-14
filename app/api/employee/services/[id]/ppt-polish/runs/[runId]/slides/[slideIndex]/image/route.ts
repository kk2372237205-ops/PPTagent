import path from "path";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { imageRoot, workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string; slideIndex: string }> }) {
  const { id, runId, slideIndex } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  const slide = (run.slides || []).find((item: { slideIndex: number }) => item.slideIndex === Number(slideIndex));
  if (!slide?.storedName) return NextResponse.json({ error: "页面图片尚未生成" }, { status: 404 });
  const file = await readFile(path.join(imageRoot, path.basename(slide.storedName)));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, no-store"
    }
  });
}

async function readPolishRun(runId: string) {
  try {
    return JSON.parse(await readFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), "utf8"));
  } catch {
    return null;
  }
}
