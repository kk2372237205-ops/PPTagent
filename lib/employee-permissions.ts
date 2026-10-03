/**
 * 员工权限与身份的共享常量（主干层）
 *
 * 职责：集中定义角色中文名、9 项功能权限的中文名、各角色默认权限，
 *       以及"能不能进管理台 / 能不能分配订单"这两个判断。
 * 谁可以改：主干层，影响所有员工端界面；改完必须跑 `npm run verify`。
 * 依赖：`@/lib/employee-api-types`（仅类型）。
 * 被谁用：`components/employee-app.tsx`、`components/employee/employee-admin.tsx`。
 * 验证方式：`npm run verify`。
 *
 * 注意：这里的默认权限只用于界面展示与新建成员时的初值。
 * 服务端真正的判断在 `lib/employee-auth.ts`，两处口径必须一致。
 */

import type { Employee, EmployeeFeature, EmployeePermissions } from "@/lib/employee-api-types";

export const featureLabels: Record<EmployeeFeature, string> = {
  orders: "订单任务",
  customerMessages: "客户消息",
  team: "团队协作",
  officeEditor: "在线编辑",
  aiAssistant: "AI 助手",
  smartPpt: "智能 PPT",
  materials: "素材库",
  imageTools: "图片工具",
  exports: "文件导出"
};

export const roleLabels: Record<string, string> = {
  platform_admin: "平台管理员",
  member: "普通员工"
};

export const rolePermissionDefaults: Record<string, EmployeePermissions> = {
  platform_admin: Object.fromEntries(Object.keys(featureLabels).map((feature) => [feature, true])) as EmployeePermissions,
  member: {
    orders: true, customerMessages: false, team: true, officeEditor: true, aiAssistant: true,
    smartPpt: true, materials: true, imageTools: true, exports: true
  }
};

export function canOpenEmployeeAdmin(employee: Employee) {
  return employee.isAdmin || employee.membership.role === "platform_admin";
}

export function canAssignOrders(employee: Employee) {
  return employee.isAdmin || employee.membership.role === "platform_admin";
}

export function identityProviderLabel(provider: string) {
  if (provider === "wechat") return "微信";
  if (provider === "wecom") return "企业微信";
  if (provider === "password") return "账号密码";
  if (provider === "local") return "本地引导";
  return "外部账号";
}

/** 外部身份编号过长时截断显示，中间用省略号 */
export function compactIdentity(value: string) {
  if (value.length <= 20) return value;
  return `${value.slice(0, 9)}...${value.slice(-7)}`;
}
