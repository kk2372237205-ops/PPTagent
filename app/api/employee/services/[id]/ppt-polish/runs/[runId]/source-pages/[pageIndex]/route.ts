import path from "path";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string; pageIndex: string }> }) {
  const { id, runId, pageIndex } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await readPolishRun(runId);
  const index = Number(pageIndex);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id || !Number.isInteger(index) || index < 1) {
    return NextResponse.json({ error: "源页面不存在" }, { status: 404 });
  }
  const page = run.sourceSnapshot?.pages?.find((item: { pageIndex?: number }) => item.pageIndex === index);
  if (!page?.storedName) return NextResponse.json({ error: "源页面尚未固化完成" }, { status: 404 });
  try {
    const filePath = path.join(polishRunRoot, path.basename(runId), "source-pages", path.basename(page.storedName));
    const image = await readFile(filePath);
    return new NextResponse(new Uint8Array(image), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "源页面图片不存在" }, { status: 404 });
  }
}

async function readPolishRun(runId: string) {
  try {
    return JSON.parse(await readFile(path.join(polishRunRoot, `${path.basename(runId)}.json`), "utf8"));
  } catch {
    return null;
  }
}
