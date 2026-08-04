import { getEmployeeWorkspaceConfigs } from "@/lib/employee-workspaces";

export type WeChatLoginConfig = {
  appId: string;
  appSecret: string;
  callbackOrigin: string;
  platformAdminOpenId: string;
  platformAdminUnionId: string;
  autoApprove: boolean;
  firstUserIsAdmin: boolean;
};

export type WeChatProfile = {
  openId: string;
  unionId: string;
  nickname: string;
  avatarUrl: string;
};

type WeChatTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  openid?: string;
  scope?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

type WeChatUserResponse = {
  openid?: string;
  nickname?: string;
  headimgurl?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

export function getWeChatLoginConfig(): WeChatLoginConfig {
  return {
    appId: process.env.WECHAT_OPEN_APP_ID?.trim() || "",
    appSecret: process.env.WECHAT_OPEN_APP_SECRET?.trim() || "",
    callbackOrigin: process.env.WECHAT_CALLBACK_ORIGIN?.trim().replace(/\/+$/, "") || "",
    platformAdminOpenId: process.env.WECHAT_PLATFORM_ADMIN_OPENID?.trim() || "",
    platformAdminUnionId: process.env.WECHAT_PLATFORM_ADMIN_UNIONID?.trim() || "",
    autoApprove: process.env.WECHAT_AUTO_APPROVE === "1",
    firstUserIsAdmin: process.env.WECHAT_FIRST_USER_IS_ADMIN === "1"
  };
}

export function isWeChatConfigured(config = getWeChatLoginConfig()) {
  return Boolean(config.appId && config.appSecret);
}

export function weChatCallbackUrl(requestUrl: string) {
  const request = new URL(requestUrl);
  const config = getWeChatLoginConfig();
  return `${config.callbackOrigin || request.origin}/api/employee/auth/wechat/callback`;
}

export function weChatAuthorizationUrl(redirectUri: string, state: string) {
  const config = getWeChatLoginConfig();
  const url = new URL("https://open.weixin.qq.com/connect/qrconnect");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "snsapi_login");
  url.searchParams.set("state", state);
  return `${url.toString()}#wechat_redirect`;
}

async function weChatJson<T extends { errcode?: number; errmsg?: string }>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`微信接口请求失败（HTTP ${response.status}）`);
  const result = await response.json() as T;
  if (result.errcode) {
    throw new Error(`微信接口返回错误 ${result.errcode}: ${result.errmsg || "未知错误"}`);
  }
  return result;
}

export async function fetchWeChatProfile(code: string) {
  const config = getWeChatLoginConfig();
  if (!isWeChatConfigured(config)) throw new Error("微信开放平台登录尚未配置完成");

  const tokenUrl = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  tokenUrl.searchParams.set("appid", config.appId);
  tokenUrl.searchParams.set("secret", config.appSecret);
  tokenUrl.searchParams.set("code", code);
  tokenUrl.searchParams.set("grant_type", "authorization_code");
  const token = await weChatJson<WeChatTokenResponse>(tokenUrl.toString());
  if (!token.access_token || !token.openid) throw new Error("微信没有返回用户身份");

  const userUrl = new URL("https://api.weixin.qq.com/sns/userinfo");
  userUrl.searchParams.set("access_token", token.access_token);
  userUrl.searchParams.set("openid", token.openid);
  userUrl.searchParams.set("lang", "zh_CN");
  const user = await weChatJson<WeChatUserResponse>(userUrl.toString());
  return {
    openId: user.openid || token.openid,
    unionId: user.unionid || token.unionid || "",
    nickname: user.nickname?.trim() || "微信用户",
    avatarUrl: user.headimgurl?.trim() || ""
  } satisfies WeChatProfile;
}

export function getWeChatWorkspaceOptions() {
  return getEmployeeWorkspaceConfigs();
}
