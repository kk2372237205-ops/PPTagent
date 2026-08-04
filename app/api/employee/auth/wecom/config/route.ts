import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { WECOM_STATE_COOKIE } from "@/lib/employee-auth";
import {
  getWeComOrganizationConfig,
  getWeComOrganizationConfigs,
  isWeComConfigured,
  syncWeComOrganizations,
  weComAuthorizationUrl,
  weComCallbackUrl
} from "@/lib/wecom";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  await syncWeComOrganizations();
  const requestedSlug = request.nextUrl.searchParams.get("org");
  const configs = getWeComOrganizationConfigs();
  const selected = getWeComOrganizationConfig(requestedSlug || configs[0]?.slug || "");
  const organizations = configs.map((item) => ({
    slug: item.slug,
    name: item.name,
    configured: isWeComConfigured(item)
  }));
  const developmentBypassAvailable =
    process.env.NODE_ENV !== "production" && process.env.WECOM_DEV_BYPASS === "1";

  if (!selected || !isWeComConfigured(selected)) {
    return NextResponse.json({
      organizations,
      selectedOrganization: selected?.slug || null,
      configured: false,
      developmentBypassAvailable
    });
  }

  const state = `${selected.slug}.${randomBytes(24).toString("hex")}`;
  const redirectUri = weComCallbackUrl(request.url);
  const response = NextResponse.json({
    organizations,
    selectedOrganization: selected.slug,
    configured: true,
    corpId: selected.corpId,
    agentId: selected.agentId,
    redirectUri,
    state,
    authorizationUrl: weComAuthorizationUrl(selected, redirectUri, state),
    developmentBypassAvailable
  });
  response.cookies.set(WECOM_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: redirectUri.startsWith("https://"),
    maxAge: 10 * 60,
    path: "/"
  });
  return response;
}
