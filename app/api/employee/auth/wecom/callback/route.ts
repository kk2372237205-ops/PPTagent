import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createEmployeeSession,
  EMPLOYEE_SESSION_COOKIE,
  ensureEmployeeBootstrap,
  WECOM_STATE_COOKIE
} from "@/lib/employee-auth";
import {
  fetchWeComMember,
  getWeComOrganizationConfig,
  isWeComConfigured,
  syncWeComOrganizations
} from "@/lib/wecom";

export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/employee", request.url);
  url.searchParams.set("wecom_error", message);
  const response = NextResponse.redirect(url);
  response.cookies.set(WECOM_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

async function uniqueEmployeeCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `WX-${randomBytes(5).toString("hex").toUpperCase()}`;
    if (!await db.employee.findUnique({ where: { code } })) return code;
  }
  throw new Error("无法生成企业微信成员编号");
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const expectedState = request.cookies.get(WECOM_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "登录二维码已过期，请刷新后重新扫码");
  }

  const separator = state.indexOf(".");
  const organizationSlug = separator > 0 ? state.slice(0, separator) : "";
  const config = getWeComOrganizationConfig(organizationSlug);
  if (!config || !isWeComConfigured(config)) {
    return redirectWithError(request, "该学校的企业微信登录尚未配置完成");
  }

  try {
    const profile = await fetchWeComMember(config, code);
    const organizations = await syncWeComOrganizations();
    const organization = organizations.find((item) => item.slug === organizationSlug);
    if (!organization?.enabled) return redirectWithError(request, "该学校工作区已停用");

    const platformAdminUserId = config.platformAdminUserId || process.env.WECOM_PLATFORM_ADMIN_USERID?.trim();
    const isPlatformAdmin = Boolean(platformAdminUserId && profile.userId === platformAdminUserId);
    let membership = await db.employeeMembership.findUnique({
      where: {
        organizationId_wecomUserId: {
          organizationId: organization.id,
          wecomUserId: profile.userId
        }
      },
      include: { employee: true }
    });

    if (isPlatformAdmin && !membership) {
      const { admin } = await ensureEmployeeBootstrap();
      const adminMembership = await db.employeeMembership.findFirst({
        where: { employeeId: admin.id, organizationId: organization.id }
      });
      membership = adminMembership
        ? await db.employeeMembership.update({
          where: { id: adminMembership.id },
          data: {
            wecomUserId: profile.userId,
            identityProvider: "wecom",
            externalUserId: profile.userId,
            role: "platform_admin",
            status: "active",
            avatarUrl: profile.avatarUrl,
            position: profile.position,
            departmentIdsJson: JSON.stringify(profile.departmentIds)
          },
          include: { employee: true }
        })
        : await db.employeeMembership.create({
          data: {
            organizationId: organization.id,
            employeeId: admin.id,
            wecomUserId: profile.userId,
            identityProvider: "wecom",
            externalUserId: profile.userId,
            role: "platform_admin",
            status: "active",
            avatarUrl: profile.avatarUrl,
            position: profile.position,
            departmentIdsJson: JSON.stringify(profile.departmentIds)
          },
          include: { employee: true }
        });
    }

    if (isPlatformAdmin && membership) {
      const [promotedMembership] = await db.$transaction([
        db.employeeMembership.update({
          where: { id: membership.id },
          data: { role: "platform_admin", status: "active" },
          include: { employee: true }
        }),
        db.employee.update({
          where: { id: membership.employeeId },
          data: { isAdmin: true, enabled: true }
        })
      ]);
      membership = promotedMembership;
    }

    if (!membership) {
      const employee = await db.employee.create({
        data: {
          code: await uniqueEmployeeCode(),
          name: profile.name,
          enabled: true
        }
      });
      membership = await db.employeeMembership.create({
        data: {
          organizationId: organization.id,
          employeeId: employee.id,
          wecomUserId: profile.userId,
          identityProvider: "wecom",
          externalUserId: profile.userId,
          role: "designer",
          status: config.autoApprove ? "active" : "pending",
          avatarUrl: profile.avatarUrl,
          position: profile.position,
          departmentIdsJson: JSON.stringify(profile.departmentIds)
        },
        include: { employee: true }
      });
    }

    if (membership.status === "disabled" || !membership.employee.enabled) {
      return redirectWithError(request, "该账号已被管理员停用");
    }

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const now = new Date();
    const updatedMembership = await db.employeeMembership.update({
      where: { id: membership.id },
      data: {
        avatarUrl: profile.avatarUrl,
        position: profile.position,
        departmentIdsJson: JSON.stringify(profile.departmentIds),
        identityProvider: "wecom",
        externalUserId: profile.userId,
        lastLoginAt: now,
        loginCount: { increment: 1 }
      }
    });
    await db.employee.update({
      where: { id: membership.employeeId },
      data: { name: profile.name }
    });
    await db.employeeLoginEvent.create({
      data: {
        employeeId: membership.employeeId,
        organizationId: organization.id,
        ip,
        userAgent: request.headers.get("user-agent") || ""
      }
    });

    const session = await createEmployeeSession(membership.employeeId, updatedMembership.id, true, ip);
    const response = NextResponse.redirect(new URL("/employee", request.url));
    response.cookies.set(EMPLOYEE_SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
      maxAge: session.maxAge,
      path: "/"
    });
    response.cookies.set(WECOM_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "企业微信登录失败";
    return redirectWithError(request, message);
  }
}
