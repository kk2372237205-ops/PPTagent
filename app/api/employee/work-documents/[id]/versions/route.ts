import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageService, currentEmployee } from "@/lib/employee-auth";
import { copyStoredFile, documentRoot, versionRoot } from "@/lib/workspace-storage";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const document = await db.workDocument.findUnique({
    where: { id },
    include: { service: true, versions: { orderBy: { version: "desc" }, take: 1 } }
  });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });
  if (!canManageService(employee, document.service)) {
    return NextResponse.json({ error: "仅负责人或管理员可以保存正式版本" }, { status: 403 });
  }
  const { label } = await request.json();
  const version = (document.versions[0]?.version ?? 0) + 1;
  const storedName = await copyStoredFile(documentRoot, document.storedName, versionRoot, "pptx");
  const result = await db.workVersion.create({
    data: {
      version,
      label: String(label || `版本 ${version}`).trim().slice(0, 60),
      storedName,
      workDocumentId: id,
      createdById: employee.id
    }
  });
  await db.serviceActivity.create({
    data: {
      serviceId: document.serviceId,
      employeeId: employee.id,
      action: "version",
      detail: `保存工作版本 V${version}：${result.label}`
    }
  });
  return NextResponse.json({ version: result });
}
