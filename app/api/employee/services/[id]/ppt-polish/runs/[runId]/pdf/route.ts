import path from "path";
import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { documentRoot, workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "exports");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const run = await readPolishRun(runId);
  if (!run || run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (!run.pdfStoredName) return NextResponse.json({ error: "PDF 尚未生成完成" }, { status: 404 });
  const file = await readFile(path.join(documentRoot, path.basename(run.pdfStoredName)));
  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${baseName(run.sourceName)}-美化版.pdf`)}`,
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

function baseName(value: string) {
  return String(value || "PPT").replace(/\.(pptx?|pdf)$/i, "").slice(0, 80) || "PPT";
}
