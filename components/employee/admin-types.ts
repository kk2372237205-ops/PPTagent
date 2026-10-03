/**
 * 管理控制台的数据类型
 *
 * 职责：定义管理员控制台读取的学校、成员与使用统计结构。
 * 谁可以改：与 `components/employee/employee-admin.tsx` 一起维护。
 * 依赖：`@/lib/employee-api-types`（仅类型）。
 * 被谁用：`components/employee/employee-admin.tsx`。
 * 验证方式：`npm run verify`。
 */

import type { EmployeeFeature, EmployeePermissions } from "@/lib/employee-api-types";

export type AdminMember = {
  id: string; organizationId: string; organizationName: string;
  identityProvider: string; externalUserId: string; unionId: string;
  role: string; status: string; permissions: EmployeePermissions; position: string;
  avatarUrl: string; lastLoginAt: string | null; loginCount: number; createdAt: string;
  employee: {
    id: string; name: string; code: string; username: string | null; isAdmin: boolean;
    counts: { assignedServices: number; generationJobs: number; activities: number; deckGenerationRuns: number };
  };
};
export type AdminOverview = {
  organizations: {
    id: string; slug: string; name: string; configured: boolean;
    weChatConfigured: boolean; weComConfigured: boolean; memberCount: number;
  }[];
  members: AdminMember[];
  stats: { total: number; pending: number; active: number; disabled: number; active7d: number; loginEvents7d: number };
  features: EmployeeFeature[];
  aiServices: {
    text: {
      serviceName: string; baseUrl: string; model: string; apiMode: string;
      configured: boolean; proxyConfigured: boolean;
    };
    image: {
      serviceName: string; baseUrl: string; model: string; size: string;
      configured: boolean; proxyConfigured: boolean; supportsEdits: boolean;
    };
  };
};
