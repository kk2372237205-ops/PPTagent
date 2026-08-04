import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeEmployeeService } from "@/lib/employee-auth";
import { copyStoredFile, documentRoot, versionRoot } from "@/lib/workspace-storage";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const document = await db.workDocument.findUnique({
    where: { id },
    include: { service: true, versions: { orderBy: { version: "desc" }, take: 1 } }
  });
  if (!document) return NextResponse.json({ error: "工作文件不存在" }, { status: 404 });
  const authorization = await authorizeEmployeeService(document.serviceId, "officeEditor");
  if (!authorization.ok) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
  const employee = authorization.access.employee;
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
