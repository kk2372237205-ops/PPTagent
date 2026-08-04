import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hash } from "@/lib/auth";
import { syncEmployeeWorkspaces } from "@/lib/employee-workspaces";

export const EMPLOYEE_SESSION_COOKIE = "wzlcf_employee_session";
export const WECOM_STATE_COOKIE = "wzlcf_wecom_state";
export const WECHAT_STATE_COOKIE = "wzlcf_wechat_state";

export const employeeFeatures = [
  "orders",
  "customerMessages",
  "team",
  "officeEditor",
  "aiAssistant",
  "smartPpt",
  "materials",
  "imageTools",
  "exports"
] as const;

export type EmployeeFeature = typeof employeeFeatures[number];
export type EmployeePermissions = Record<EmployeeFeature, boolean>;

export const employeeRoles = [
  "platform_admin",
  "org_admin",
  "manager",
  "designer",
  "reviewer",
  "member"
] as const;

export type EmployeeRole = typeof employeeRoles[number];

type EmployeeAccessContext = {
  employee: {
    id: string;
    code: string;
    name: string;
    phone: string | null;
    isAdmin: boolean;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  membership: {
    id: string;
    organizationId: string;
    employeeId: string;
    identityProvider: string;
    externalUserId: string;
    unionId: string;
    wecomUserId: string;
    role: string;
    status: string;
    permissionsJson: string;
    departmentIdsJson: string;
    position: string;
    avatarUrl: string;
    lastLoginAt: Date | null;
    loginCount: number;
    createdAt: Date;
    updatedAt: Date;
  };
  organization: {
    id: string;
    slug: string;
    name: string;
    corpId: string;
    enabled: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  permissions: EmployeePermissions;
};

const allPermissions = Object.fromEntries(employeeFeatures.map((key) => [key, true])) as EmployeePermissions;
const noPermissions = Object.fromEntries(employeeFeatures.map((key) => [key, false])) as EmployeePermissions;

const rolePermissions: Record<EmployeeRole, EmployeePermissions> = {
  platform_admin: { ...allPermissions },
  org_admin: { ...allPermissions },
  manager: { ...allPermissions },
  designer: {
    orders: true,
    customerMessages: false,
    team: true,
    officeEditor: true,
    aiAssistant: true,
    smartPpt: true,
    materials: true,
    imageTools: true,
    exports: true
  },
  reviewer: {
    orders: true,
    customerMessages: false,
    team: true,
    officeEditor: true,
    aiAssistant: false,
    smartPpt: false,
    materials: false,
    imageTools: false,
    exports: true
  },
  member: { ...noPermissions }
};

function asRole(role: string): EmployeeRole {
  return employeeRoles.includes(role as EmployeeRole) ? role as EmployeeRole : "member";
}

export function resolveEmployeePermissions(
  membership: { role: string; status: string; permissionsJson: string },
  isPlatformAdmin = false
) {
  if (membership.status !== "active") return { ...noPermissions };
  const base = isPlatformAdmin ? allPermissions : rolePermissions[asRole(membership.role)];
  let overrides: Partial<EmployeePermissions> = {};
  try {
    const parsed = JSON.parse(membership.permissionsJson || "{}");
    if (parsed && typeof parsed === "object") overrides = parsed;
  } catch {
    overrides = {};
  }
  return Object.fromEntries(employeeFeatures.map((key) => [
    key,
    typeof overrides[key] === "boolean" ? overrides[key] : base[key]
  ])) as EmployeePermissions;
}

export async function ensureEmployeeBootstrap() {
  const organizations = await syncEmployeeWorkspaces();
  let admin = await db.employee.findFirst({
    where: { isAdmin: true },
    orderBy: { createdAt: "asc" }
  });
  if (!admin) {
    admin = await db.employee.create({
      data: {
        code: "PLATFORM-ADMIN",
        name: "平台管理员",
        isAdmin: true,
        enabled: true
      }
    });
  } else if (!admin.enabled) {
    admin = await db.employee.update({ where: { id: admin.id }, data: { enabled: true } });
  }

  const primaryOrganization = organizations[0];
  if (primaryOrganization) {
    const existing = await db.employeeMembership.findFirst({
      where: { employeeId: admin.id },
      orderBy: { createdAt: "asc" }
    });
    if (!existing) {
      await db.employeeMembership.create({
        data: {
          organizationId: primaryOrganization.id,
          employeeId: admin.id,
          identityProvider: "local",
          externalUserId: "bootstrap-platform-admin",
          unionId: "",
          wecomUserId: "bootstrap-unbound",
          role: "platform_admin",
          status: "active"
        }
      });
    }
  }
  return { admin, organizations };
}

export async function currentEmployeeAccess(): Promise<EmployeeAccessContext | null> {
  await ensureEmployeeBootstrap();
  const token = (await cookies()).get(EMPLOYEE_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.employeeSession.findUnique({
    where: { tokenHash: hash(token) },
    include: {
      employee: true,
      membership: { include: { organization: true } }
    }
  });
  if (!session || session.expiresAt < new Date() || !session.employee.enabled) return null;
  const membership = session.membership || await db.employeeMembership.findFirst({
    where: { employeeId: session.employeeId },
    include: { organization: true },
    orderBy: { createdAt: "asc" }
  });
  if (!membership || !membership.organization.enabled) return null;
  const permissions = resolveEmployeePermissions(membership, session.employee.isAdmin);
  return {
    employee: session.employee,
    membership,
    organization: membership.organization,
    permissions
  };
}

export async function currentEmployee() {
  const access = await currentEmployeeAccess();
  return access?.membership.status === "active" ? access.employee : null;
}

export async function createEmployeeSession(
  employeeId: string,
  membershipId: string,
  remember: boolean,
  ip: string | null
) {
  const token = randomBytes(32).toString("hex");
  const maxAge = remember ? 60 * 24 * 60 * 60 : 24 * 60 * 60;
  await db.employeeSession.create({
    data: {
      tokenHash: hash(token),
      employeeId,
      membershipId,
      remember,
      deviceLabel: "微信扫码 · 当前浏览器",
      ip,
      expiresAt: new Date(Date.now() + maxAge * 1000)
    }
  });
  return { token, maxAge };
}

export function hasEmployeeFeature(
  context: Pick<EmployeeAccessContext, "membership" | "permissions">,
  feature: EmployeeFeature
) {
  return context.membership.status === "active" && context.permissions[feature];
}

export function isEmployeeAdministrator(context: Pick<EmployeeAccessContext, "employee" | "membership">) {
  return context.employee.isAdmin || context.membership.role === "platform_admin" || context.membership.role === "org_admin";
}

export function canAccessService(
  context: Pick<EmployeeAccessContext, "employee" | "membership">,
  service: { assigneeId: string | null; organizationId?: string | null }
) {
  if (context.employee.isAdmin || context.membership.role === "platform_admin") return true;
  if (!service.organizationId || service.organizationId !== context.membership.organizationId) return false;
  if (context.membership.role === "org_admin" || context.membership.role === "manager") return true;
  return service.assigneeId === context.employee.id;
}

export async function authorizeEmployeeService(serviceId: string, feature: EmployeeFeature) {
  const access = await currentEmployeeAccess();
  if (!access) return { ok: false as const, status: 401, error: "请先登录员工工作台" };
  if (!hasEmployeeFeature(access, feature)) {
    return { ok: false as const, status: 403, error: "你的账号未开通该功能" };
  }
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: { id: true, assigneeId: true, organizationId: true }
  });
  if (!service) return { ok: false as const, status: 404, error: "订单不存在" };
  if (!canAccessService(access, service)) {
    return { ok: false as const, status: 403, error: "你无权操作该订单" };
  }
  return { ok: true as const, access, service };
}

export function canManageService(
  employee: { id: string; isAdmin: boolean },
  service: { assigneeId: string | null }
) {
  return employee.isAdmin || service.assigneeId === employee.id;
}
