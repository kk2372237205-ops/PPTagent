import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { canManageService, currentEmployee } from "@/lib/employee-auth";
import { copyStoredFile, documentRoot, versionRoot } from "@/lib/workspace-storage";

const statuses = ["待开始", "制作中", "待客户确认", "修改中", "已完成"];

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const employee = await currentEmployee();
  if (!employee) return NextResponse.json({ error: "请先登录员工模式" }, { status: 401 });
  const { id } = await context.params;
  const service = await db.service.findUnique({
    where: { id },
    include: {
      workDocument: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
      versions: { orderBy: { version: "desc" }, take: 1 }
    }
  });
  if (!service) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  if (!canManageService(employee, service)) {
    return NextResponse.json({ error: "仅负责人或管理员可以推进订单" }, { status: 403 });
  }
  const { status, progress } = await request.json();
  if (!statuses.includes(status)) return NextResponse.json({ error: "订单状态无效" }, { status: 400 });
  const normalizedProgress = Math.max(0, Math.min(100, Number(progress)));
  await db.service.update({
    where: { id },
    data: { status, progress: status === "已完成" ? 100 : normalizedProgress }
  });
  if (
    service.status !== status &&
    ["待客户确认", "已完成"].includes(status) &&
    service.workDocument
  ) {
    const workVersionNumber = (service.workDocument.versions[0]?.version ?? 0) + 1;
    const deliveryVersionNumber = (service.versions[0]?.version ?? 0) + 1;
    const label = status === "已完成" ? "最终交付稿" : "客户确认稿";
    const storedName = await copyStoredFile(
      documentRoot,
      service.workDocument.storedName,
      versionRoot,
      "pptx"
    );
    await db.$transaction([
      db.workVersion.create({
        data: {
          version: workVersionNumber,
          label,
          storedName,
          workDocumentId: service.workDocument.id,
          createdById: employee.id
        }
      }),
      db.deliveryVersion.create({
        data: {
          version: deliveryVersionNumber,
          label,
          note: `${employee.name} 于员工工作台发布`,
          serviceId: service.id
        }
      })
    ]);
  }
  await db.serviceActivity.create({
    data: {
      serviceId: id,
      employeeId: employee.id,
      action: "status",
      detail: `状态更新为“${status}”，进度 ${status === "已完成" ? 100 : normalizedProgress}%`
    }
  });
  return NextResponse.json({ ok: true });
}
