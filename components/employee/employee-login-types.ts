/**
 * 员工登录页的数据类型
 *
 * 职责：定义登录方式与登录配置的返回结构。
 * 谁可以改：与 components/employee/employee-login.tsx 一起维护。
 * 依赖：无（纯类型）。
 * 被谁用：components/employee/employee-login.tsx。
 * 验证方式：npm run verify。
 */

export type EmployeeLoginProvider = "wechat" | "wecom";
export type EmployeeLoginConfig = {
  organizations: { slug: string; name: string; configured: boolean }[];
  selectedOrganization: string | null;
  configured: boolean;
  appId?: string;
  corpId?: string;
  agentId?: string;
  redirectUri?: string;
  state?: string;
  authorizationUrl?: string;
  developmentBypassAvailable: boolean;
};
