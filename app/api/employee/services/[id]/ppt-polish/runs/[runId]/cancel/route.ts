import path from "path";
import { readFile, writeFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { workspaceRoot } from "@/lib/workspace-storage";

const polishRunRoot = path.join(workspaceRoot, "ppt-polish-runs");
const cancellableStatuses = new Set(["plan_ready", "confirmed", "planning", "source_ready", "generating"]);

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string; runId: string }> }) {
  const { id, runId } = await context.params;
  const authorization = await authorizeEmployeeService(id, "smartPpt");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
  const filePath = path.join(polishRunRoot, `${path.basename(runId)}.json`);
  let run;
  try { run = JSON.parse(await readFile(filePath, "utf8")); } catch { return NextResponse.json({ error: "美化任务不存在" }, { status: 404 }); }
  if (run.serviceId !== id || run.employeeId !== employee.id) return NextResponse.json({ error: "美化任务不存在" }, { status: 404 });
  if (!cancellableStatuses.has(run.status)) return NextResponse.json({ error: "当前任务不能取消" }, { status: 400 });
  const now = new Date().toISOString();
  const updated = { ...run, status: "cancelled", cancelledAt: now, error: "任务已由员工紧急取消", updatedAt: now };
  await writeFile(filePath, JSON.stringify(updated, null, 2), "utf8");
  return NextResponse.json({ run: updated });
}
