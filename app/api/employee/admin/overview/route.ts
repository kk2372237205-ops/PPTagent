import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  currentEmployeeAccess,
  employeeFeatures,
  isEmployeeAdministrator,
  resolveEmployeePermissions
} from "@/lib/employee-auth";
import { openAiDiagnosticsConfig } from "@/lib/ai-providers";
import { isWeChatConfigured } from "@/lib/wechat";
import {
  getWeComOrganizationConfig,
  isWeComConfigured
} from "@/lib/wecom";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const access = await currentEmployeeAccess();
  if (!access) return NextResponse.json({ error: "请先登录员工工作台" }, { status: 401 });
  if (!isEmployeeAdministrator(access)) {
    return NextResponse.json({ error: "仅学校管理员可以打开管理控制台" }, { status: 403 });
  }

  const isPlatformAdmin = access.employee.isAdmin || access.membership.role === "platform_admin";
  const requestedOrganizationId = request.nextUrl.searchParams.get("organizationId");
  const organizationWhere = isPlatformAdmin
    ? requestedOrganizationId ? { id: requestedOrganizationId } : {}
    : { id: access.organization.id };
  const organizations = await db.organization.findMany({
    where: organizationWhere,
    orderBy: { createdAt: "asc" }
  });
  const organizationIds = organizations.map((item) => item.id);
  const memberships = await db.employeeMembership.findMany({
    where: { organizationId: { in: organizationIds } },
    include: {
      employee: {
        include: {
          _count: {
            select: {
              assignedServices: true,
              generationJobs: true,
              activities: true,
              deckGenerationRuns: true
            }
          }
        }
      },
      organization: true
    },
    orderBy: [{ status: "asc" }, { lastLoginAt: "desc" }, { createdAt: "desc" }]
  });

  const now = Date.now();
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const loginEvents7d = await db.employeeLoginEvent.count({
    where: {
      organizationId: { in: organizationIds },
      createdAt: { gte: sevenDaysAgo }
    }
  });
  const aiServices = openAiDiagnosticsConfig();
  const weChatConfigured = isWeChatConfigured();
  return NextResponse.json({
    organizations: organizations.map((organization) => {
      const weComConfig = getWeComOrganizationConfig(organization.slug);
      const weComConfigured = Boolean(weComConfig && isWeComConfigured(weComConfig));
      return {
        ...organization,
        configured: weChatConfigured || weComConfigured,
        weChatConfigured,
        weComConfigured,
        memberCount: memberships.filter((item) => item.organizationId === organization.id).length
      };
    }),
    members: memberships.map((membership) => ({
      id: membership.id,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      identityProvider: membership.identityProvider,
      externalUserId: membership.externalUserId,
      unionId: membership.unionId,
      role: membership.role,
      status: membership.status,
      permissions: resolveEmployeePermissions(membership, membership.employee.isAdmin),
      position: membership.position,
      avatarUrl: membership.avatarUrl,
      lastLoginAt: membership.lastLoginAt,
      loginCount: membership.loginCount,
      createdAt: membership.createdAt,
      employee: {
        id: membership.employee.id,
        name: membership.employee.name,
        code: membership.employee.code,
        isAdmin: membership.employee.isAdmin,
        counts: membership.employee._count
      }
    })),
    aiServices,
    stats: {
      total: memberships.length,
      pending: memberships.filter((item) => item.status === "pending").length,
      active: memberships.filter((item) => item.status === "active").length,
      disabled: memberships.filter((item) => item.status === "disabled").length,
      active7d: memberships.filter((item) => item.lastLoginAt && item.lastLoginAt >= sevenDaysAgo).length,
      loginEvents7d
    },
    features: employeeFeatures
  });
}
