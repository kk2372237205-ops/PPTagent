import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hash } from "@/lib/auth";

export const EMPLOYEE_SESSION_COOKIE = "wzlcf_employee_session";
export const EMPLOYEE_CODES = ["12345678", "10000002", "10000003", "10000004", "10000005"] as const;

export async function ensureEmployeeSlots() {
  const initialAdminPhone = process.env.INITIAL_ADMIN_PHONE || "15875754338";
  const legacyAdmin = await db.employee.findFirst({
    where: { isAdmin: true },
    orderBy: { createdAt: "asc" }
  });
  const desiredAdmin = await db.employee.findUnique({ where: { code: EMPLOYEE_CODES[0] } });
  if (legacyAdmin && desiredAdmin && legacyAdmin.id !== desiredAdmin.id) {
    await db.$transaction([
      db.employeeSession.updateMany({ where: { employeeId: desiredAdmin.id }, data: { employeeId: legacyAdmin.id } }),
      db.service.updateMany({ where: { assigneeId: desiredAdmin.id }, data: { assigneeId: legacyAdmin.id } }),
      db.message.updateMany({ where: { employeeId: desiredAdmin.id }, data: { employeeId: legacyAdmin.id } }),
      db.serviceActivity.updateMany({ where: { employeeId: desiredAdmin.id }, data: { employeeId: legacyAdmin.id } }),
      db.workVersion.updateMany({ where: { createdById: desiredAdmin.id }, data: { createdById: legacyAdmin.id } }),
      db.generationJob.updateMany({ where: { employeeId: desiredAdmin.id }, data: { employeeId: legacyAdmin.id } }),
      db.employee.delete({ where: { id: desiredAdmin.id } }),
      db.employee.update({
        where: { id: legacyAdmin.id },
        data: { code: EMPLOYEE_CODES[0], phone: initialAdminPhone, isAdmin: true, enabled: true }
      })
    ]);
  } else if (legacyAdmin) {
    await db.employee.update({
      where: { id: legacyAdmin.id },
      data: { code: EMPLOYEE_CODES[0], phone: initialAdminPhone, isAdmin: true, enabled: true }
    });
  }
  for (const [index, code] of EMPLOYEE_CODES.entries()) {
    await db.employee.upsert({
      where: { code },
      update: index === 0 ? { isAdmin: true } : {},
      create: {
        code,
        name: index === 0 ? "工作室管理员" : `设计师 ${index + 1}`,
        phone: index === 0 ? initialAdminPhone : null,
        isAdmin: index === 0
      }
    });
  }
}

export async function currentEmployee() {
  await ensureEmployeeSlots();
  const token = (await cookies()).get(EMPLOYEE_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.employeeSession.findUnique({
    where: { tokenHash: hash(token) },
    include: { employee: true }
  });
  if (!session || session.expiresAt < new Date() || !session.employee.enabled) return null;
  return session.employee;
}

export async function createEmployeeSession(employeeId: string, remember: boolean, ip: string | null) {
  const token = randomBytes(32).toString("hex");
  const maxAge = remember ? 60 * 24 * 60 * 60 : 24 * 60 * 60;
  await db.employeeSession.create({
    data: {
      tokenHash: hash(token),
      employeeId,
      remember,
      deviceLabel: "Windows · 当前浏览器",
      ip,
      expiresAt: new Date(Date.now() + maxAge * 1000)
    }
  });
  return { token, maxAge };
}

export function canManageService(employee: { id: string; isAdmin: boolean }, service: { assigneeId: string | null }) {
  return employee.isAdmin || service.assigneeId === employee.id;
}
