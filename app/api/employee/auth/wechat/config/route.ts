import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { syncEmployeeWorkspaces } from "@/lib/employee-workspaces";
import { WECHAT_STATE_COOKIE, isEmployeeLocalBypassEnabled } from "@/lib/employee-auth";
import {
  getWeChatLoginConfig,
  getWeChatWorkspaceOptions,
  isWeChatConfigured,
  weChatAuthorizationUrl,
  weChatCallbackUrl
} from "@/lib/wechat";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await syncEmployeeWorkspaces();
  const workspaces = getWeChatWorkspaceOptions();
  const requestedSlug = request.nextUrl.searchParams.get("org");
  const selected = workspaces.find((item) => item.slug === requestedSlug) || workspaces[0] || null;
  const loginConfig = getWeChatLoginConfig();
  const configured = isWeChatConfigured(loginConfig);
  const developmentBypassAvailable = isEmployeeLocalBypassEnabled();

  if (!selected || !configured) {
    return NextResponse.json({
      organizations: workspaces.map((item) => ({ ...item, configured })),
      selectedOrganization: selected?.slug || null,
      configured: false,
      developmentBypassAvailable
    });
  }

  const state = `${selected.slug}.${randomBytes(24).toString("hex")}`;
  const redirectUri = weChatCallbackUrl(request.url);
  const response = NextResponse.json({
    organizations: workspaces.map((item) => ({ ...item, configured: true })),
    selectedOrganization: selected.slug,
    configured: true,
    appId: loginConfig.appId,
    redirectUri,
    state,
    authorizationUrl: weChatAuthorizationUrl(redirectUri, state),
    developmentBypassAvailable
  });
  response.cookies.set(WECHAT_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUri.startsWith("https://"),
    maxAge: 10 * 60,
    path: "/"
  });
  return response;
}
