import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { syncEmployeeWorkspaces } from "@/lib/employee-workspaces";
import {
  createEmployeeSession,
  EMPLOYEE_SESSION_COOKIE,
  ensureEmployeeBootstrap,
  WECHAT_STATE_COOKIE
} from "@/lib/employee-auth";
import {
  fetchWeChatProfile,
  getWeChatLoginConfig,
  isWeChatConfigured
} from "@/lib/wechat";

export const dynamic = "force-dynamic";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/employee", request.url);
  url.searchParams.set("wechat_error", message);
  const response = NextResponse.redirect(url);
  response.cookies.set(WECHAT_STATE_COOKIE, "", { maxAge: 0, path: "/" });
  return response;
}

async function uniqueEmployeeCode() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = `WX-${randomBytes(5).toString("hex").toUpperCase()}`;
    if (!await db.employee.findUnique({ where: { code } })) return code;
  }
  throw new Error("无法生成微信成员编号");
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const expectedState = request.cookies.get(WECHAT_STATE_COOKIE)?.value;
  if (!code || !state || !expectedState || state !== expectedState) {
    return redirectWithError(request, "登录二维码已过期，请刷新后重新扫码");
  }

  const separator = state.indexOf(".");
  const organizationSlug = separator > 0 ? state.slice(0, separator) : "";
  const config = getWeChatLoginConfig();
  if (!isWeChatConfigured(config)) {
    return redirectWithError(request, "微信开放平台登录尚未配置完成");
  }

  try {
    const profile = await fetchWeChatProfile(code);
    const organizations = await syncEmployeeWorkspaces();
    const organization = organizations.find((item) => item.slug === organizationSlug);
    if (!organization?.enabled) return redirectWithError(request, "所选学校工作区不存在或已停用");

    const configuredAdmin =
      Boolean(config.platformAdminOpenId && profile.openId === config.platformAdminOpenId) ||
      Boolean(config.platformAdminUnionId && profile.unionId === config.platformAdminUnionId);
    const claimedWechatAdmin = await db.employeeMembership.count({
      where: {
        identityProvider: "wechat",
        role: "platform_admin",
        status: "active"
      }
    });
    const isPlatformAdmin =
      configuredAdmin ||
      (config.firstUserIsAdmin && claimedWechatAdmin === 0);

    let membership = await db.employeeMembership.findUnique({
      where: {
        organizationId_identityProvider_externalUserId: {
          organizationId: organization.id,
          identityProvider: "wechat",
          externalUserId: profile.openId
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
            identityProvider: "wechat",
            externalUserId: profile.openId,
            unionId: profile.unionId,
            wecomUserId: `wechat:${profile.openId}`,
            role: "platform_admin",
            status: "active",
            avatarUrl: profile.avatarUrl,
            position: "平台管理员"
          },
          include: { employee: true }
        })
        : await db.employeeMembership.create({
          data: {
            organizationId: organization.id,
            employeeId: admin.id,
            identityProvider: "wechat",
            externalUserId: profile.openId,
            unionId: profile.unionId,
            wecomUserId: `wechat:${profile.openId}`,
            role: "platform_admin",
            status: "active",
            avatarUrl: profile.avatarUrl,
            position: "平台管理员"
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
      const matchingIdentity = await db.employeeMembership.findFirst({
        where: profile.unionId
          ? { identityProvider: "wechat", unionId: profile.unionId }
          : { identityProvider: "wechat", externalUserId: profile.openId },
        include: { employee: true }
      });
      const employee = matchingIdentity?.employee || await db.employee.create({
        data: {
          code: await uniqueEmployeeCode(),
          name: profile.nickname,
          enabled: true
        }
      });
      membership = await db.employeeMembership.create({
        data: {
          organizationId: organization.id,
          employeeId: employee.id,
          identityProvider: "wechat",
          externalUserId: profile.openId,
          unionId: profile.unionId,
          wecomUserId: `wechat:${profile.openId}`,
          role: "designer",
          status: config.autoApprove ? "active" : "pending",
          avatarUrl: profile.avatarUrl,
          position: "微信扫码申请"
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
        identityProvider: "wechat",
        externalUserId: profile.openId,
        unionId: profile.unionId,
        avatarUrl: profile.avatarUrl,
        lastLoginAt: now,
        loginCount: { increment: 1 }
      }
    });
    await db.employee.update({
      where: { id: membership.employeeId },
      data: { name: profile.nickname }
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
    response.cookies.set(WECHAT_STATE_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "微信登录失败";
    return redirectWithError(request, message);
  }
}
