import { db } from "@/lib/db";
import { getEmployeeWorkspaceConfigs } from "@/lib/employee-workspaces";

export type WeComOrganizationConfig = {
  slug: string;
  name: string;
  corpId: string;
  agentId: string;
  secret: string;
  platformAdminUserId: string;
  autoApprove: boolean;
};

export type WeComMemberProfile = {
  userId: string;
  name: string;
  avatarUrl: string;
  position: string;
  departmentIds: number[];
};

type WeComApiResult = {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
  UserId?: string;
  user_ticket?: string;
  name?: string;
  avatar?: string;
  position?: string;
  department?: number[];
};

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

function normalizeSlug(value: unknown, fallback: string) {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return normalized || fallback;
}

function fromSingleOrganization(): WeComOrganizationConfig {
  const workspace = getEmployeeWorkspaceConfigs()[0] || { slug: "school", name: "学校工作区" };
  const slug = normalizeSlug(process.env.WECOM_ORG_SLUG, workspace.slug);
  return {
    slug,
    name: process.env.WECOM_ORG_NAME?.trim() || workspace.name,
    corpId: process.env.WECOM_CORP_ID?.trim() || `unconfigured:${slug}`,
    agentId: process.env.WECOM_AGENT_ID?.trim() || "",
    secret: process.env.WECOM_SECRET?.trim() || "",
    platformAdminUserId: process.env.WECOM_PLATFORM_ADMIN_USERID?.trim() || "",
    autoApprove: process.env.WECOM_AUTO_APPROVE === "1"
  };
}

export function getWeComOrganizationConfigs() {
  const raw = process.env.WECOM_ORGANIZATIONS_JSON?.trim();
  if (!raw) {
    const workspaces = getEmployeeWorkspaceConfigs();
    const single = fromSingleOrganization();
    return workspaces.map((workspace) => workspace.slug === single.slug
      ? { ...single, name: workspace.name }
      : {
        slug: workspace.slug,
        name: workspace.name,
        corpId: `unconfigured:${workspace.slug}`,
        agentId: "",
        secret: "",
        platformAdminUserId: "",
        autoApprove: false
      });
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) return [fromSingleOrganization()];
    return parsed.map((item, index) => {
      const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
      const slug = normalizeSlug(record.slug, `school-${index + 1}`);
      return {
        slug,
        name: String(record.name || `学校 ${index + 1}`).trim(),
        corpId: String(record.corpId || `unconfigured:${slug}`).trim(),
        agentId: String(record.agentId || "").trim(),
        secret: String(record.secret || "").trim(),
        platformAdminUserId: String(record.platformAdminUserId || "").trim(),
        autoApprove: record.autoApprove === true
      };
    });
  } catch {
    return [fromSingleOrganization()];
  }
}

export function isWeComConfigured(config: WeComOrganizationConfig) {
  return Boolean(
    config.corpId &&
    !config.corpId.startsWith("unconfigured:") &&
    config.agentId &&
    config.secret
  );
}

export function getWeComOrganizationConfig(slug: string) {
  return getWeComOrganizationConfigs().find((item) => item.slug === slug) || null;
}

export async function syncWeComOrganizations() {
  const configs = getWeComOrganizationConfigs();
  const organizations = [];
  for (const config of configs) {
    const configured = isWeComConfigured(config);
    const organization = await db.organization.upsert({
      where: { slug: config.slug },
      update: {
        name: config.name,
        ...(configured ? { corpId: config.corpId } : {}),
        enabled: true
      },
      create: {
        slug: config.slug,
        name: config.name,
        corpId: configured ? config.corpId : `workspace:${config.slug}`
      }
    });
    organizations.push(organization);
  }
  if (organizations.length > 0) {
    await db.service.updateMany({
      where: { organizationId: null },
      data: { organizationId: organizations[0].id }
    });
  }
  return organizations;
}

export function weComCallbackUrl(requestUrl: string) {
  const request = new URL(requestUrl);
  const configuredOrigin = process.env.WECOM_CALLBACK_ORIGIN?.trim().replace(/\/+$/, "");
  const origin = configuredOrigin || request.origin;
  return `${origin}/api/employee/auth/wecom/callback`;
}

export function weComAuthorizationUrl(
  config: WeComOrganizationConfig,
  redirectUri: string,
  state: string
) {
  const url = new URL("https://open.work.weixin.qq.com/wwopen/sso/qrConnect");
  url.searchParams.set("appid", config.corpId);
  url.searchParams.set("agentid", config.agentId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}

async function weComJson(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`企业微信接口请求失败（HTTP ${response.status}）`);
  const result = await response.json() as WeComApiResult;
  if (result.errcode && result.errcode !== 0) {
    throw new Error(`企业微信接口返回错误 ${result.errcode}: ${result.errmsg || "未知错误"}`);
  }
  return result;
}

async function accessToken(config: WeComOrganizationConfig) {
  const cached = tokenCache.get(config.slug);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;
  const url = new URL("https://qyapi.weixin.qq.com/cgi-bin/gettoken");
  url.searchParams.set("corpid", config.corpId);
  url.searchParams.set("corpsecret", config.secret);
  const result = await weComJson(url.toString());
  if (!result.access_token) throw new Error("企业微信没有返回 access_token");
  tokenCache.set(config.slug, {
    token: result.access_token,
    expiresAt: Date.now() + Math.max(300, result.expires_in || 7200) * 1000
  });
  return result.access_token;
}

export async function fetchWeComMember(config: WeComOrganizationConfig, code: string) {
  const token = await accessToken(config);
  const identityUrl = new URL("https://qyapi.weixin.qq.com/cgi-bin/auth/getuserinfo");
  identityUrl.searchParams.set("access_token", token);
  identityUrl.searchParams.set("code", code);
  const identity = await weComJson(identityUrl.toString());
  if (!identity.UserId) {
    throw new Error("该账号不是当前学校企业微信通讯录内的成员");
  }

  const memberUrl = new URL("https://qyapi.weixin.qq.com/cgi-bin/user/get");
  memberUrl.searchParams.set("access_token", token);
  memberUrl.searchParams.set("userid", identity.UserId);
  const member = await weComJson(memberUrl.toString());
  return {
    userId: identity.UserId,
    name: member.name?.trim() || identity.UserId,
    avatarUrl: member.avatar?.trim() || "",
    position: member.position?.trim() || "",
    departmentIds: Array.isArray(member.department) ? member.department : []
  } satisfies WeComMemberProfile;
}
