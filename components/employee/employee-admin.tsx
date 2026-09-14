/* eslint-disable @next/next/no-img-element */
/**
 * 管理控制台（可复用 UI 组件）
 *
 * 职责：成员审批与停用、角色与逐项功能权限设置、学校筛选、使用情况统计，
 *       以及两条 AI 中转链路的配置状态展示（不显示任何密钥）。
 * 谁可以改：本模块单独维护；权限口径改动必须同时检查 `lib/employee-auth.ts`。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-permissions`、
 *       `./admin-types`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx`。
 * 验证方式：`npm run verify`。
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, Bot, ImagePlus, LoaderCircle, RefreshCw, School, ShieldCheck, UserCheck, UserX, Users } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { Employee, EmployeeFeature, EmployeePermissions } from "@/lib/employee-api-types";
import { compactIdentity, featureLabels, identityProviderLabel, roleLabels, rolePermissionDefaults } from "@/lib/employee-permissions";
import { formatDateTime } from "@/lib/employee-format";
import type { AdminMember, AdminOverview } from "./admin-types";

export function EmployeeAdmin({ employee, notify }: { employee: Employee; notify: (text: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { role: string; status: string; permissions: EmployeePermissions }>>({});

  const loadOverview = useCallback(async () => {
    setLoading(true);
    const response = await employeeApi.admin.overview();
    const result = await response.json();
    setLoading(false);
    if (!response.ok) return notify(result.error || "控制台数据读取失败");
    setOverview(result);
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadOverview(), 0);
    return () => window.clearTimeout(timer);
  }, [loadOverview]);

  function draft(member: AdminMember) {
    return drafts[member.id] || {
      role: member.role,
      status: member.status,
      permissions: member.permissions
    };
  }

  function patchDraft(member: AdminMember, change: Partial<ReturnType<typeof draft>>) {
    setDrafts((current) => ({ ...current, [member.id]: { ...draft(member), ...change } }));
  }

  async function save(member: AdminMember) {
    const value = draft(member);
    const response = await employeeApi.admin.updateMember(member.id, value);
    const result = await response.json();
    if (!response.ok) return notify(result.error || "成员权限保存失败");
    setDrafts((current) => {
      const next = { ...current };
      delete next[member.id];
      return next;
    });
    notify(value.status === "active" ? "成员权限已开通" : value.status === "disabled" ? "成员已停用" : "成员设置已保存");
    await loadOverview();
  }

  const members = (overview?.members || []).filter((member) => {
    if (organizationId !== "all" && member.organizationId !== organizationId) return false;
    const keyword = search.trim().toLowerCase();
    return !keyword || member.employee.name.toLowerCase().includes(keyword) ||
      member.externalUserId.toLowerCase().includes(keyword) ||
      member.organizationName.toLowerCase().includes(keyword);
  });

  return <div className="employee-page employee-control-page">
    <header className="employee-page-head">
      <div><span>PLATFORM CONTROL</span><h1>管理控制台</h1><p>审批微信与企业微信登录申请，核对学校归属，分配角色与功能权限并查看实际使用情况。</p></div>
      <button className="employee-control-refresh" onClick={() => void loadOverview()} disabled={loading}><RefreshCw className={loading ? "spin" : ""}/>刷新数据</button>
    </header>
    {loading && !overview ? <div className="employee-control-loading"><LoaderCircle className="spin"/>正在读取成员与使用记录</div> : overview && <>
      <section className="employee-control-stats">
        <article><Users/><span><b>{overview.stats.total}</b>全部成员</span></article>
        <article className="pending"><UserCheck/><span><b>{overview.stats.pending}</b>等待审批</span></article>
        <article className="active"><Activity/><span><b>{overview.stats.active7d}</b>近 7 天活跃</span></article>
        <article><ShieldCheck/><span><b>{overview.stats.loginEvents7d}</b>近 7 天登录</span></article>
        <article className="disabled"><UserX/><span><b>{overview.stats.disabled}</b>已停用</span></article>
      </section>
      <section className="employee-ai-service-strip">
        <article className={overview.aiServices.text.configured ? "configured" : ""}>
          <Bot/>
          <span>
            <small>文字中转服务</small>
            <b>{overview.aiServices.text.serviceName}</b>
            <em>{overview.aiServices.text.model} · {overview.aiServices.text.apiMode === "chat-completions" ? "Chat Completions" : "Responses"}</em>
            <code>{overview.aiServices.text.baseUrl}</code>
          </span>
          <strong>{overview.aiServices.text.configured ? "已配置" : "缺少 Key"}</strong>
        </article>
        <article className={overview.aiServices.image.configured ? "configured" : ""}>
          <ImagePlus/>
          <span>
            <small>图片中转服务</small>
            <b>{overview.aiServices.image.serviceName}</b>
            <em>{overview.aiServices.image.model} · {overview.aiServices.image.size}</em>
            <code>{overview.aiServices.image.baseUrl}</code>
          </span>
          <strong>{overview.aiServices.image.configured ? "已配置" : "缺少 Key"}</strong>
        </article>
      </section>
      <section className="employee-organization-strip">
        <div><School/><span><b>学校工作区</b><small>普通微信需人工核验学校，企业微信可核验通讯录身份</small></span></div>
        {overview.organizations.map((organization) => <article key={organization.id}>
          <span><b>{organization.name}</b><small>{organization.memberCount} 位成员</small></span>
          <div className="employee-org-login-status">
            <em className={organization.weChatConfigured ? "configured" : ""}>微信{organization.weChatConfigured ? "已接通" : "待配置"}</em>
            <em className={organization.weComConfigured ? "configured" : ""}>企业微信{organization.weComConfigured ? "已接通" : "待配置"}</em>
          </div>
        </article>)}
      </section>
      <div className="employee-control-tools">
        <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
          <option value="all">全部学校</option>
          {overview.organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}
        </select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索昵称、登录身份标识或学校"/>
        <span>{members.length} 位成员</span>
      </div>
      <section className="employee-member-list">
        {members.map((member) => {
          const value = draft(member);
          const isSelf = member.id === employee.membership.id;
          return <article className={`employee-member-row status-${value.status}`} key={member.id}>
            <div className="employee-member-main">
              <div className="employee-member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt=""/> : member.employee.name.slice(0, 1)}</div>
              <span className="employee-member-identity"><b>{member.employee.name}</b><small title={member.externalUserId}>{member.organizationName} · {identityProviderLabel(member.identityProvider)} · {compactIdentity(member.externalUserId)}</small></span>
              <select value={value.role} disabled={isSelf} onChange={(event) => {
                const role = event.target.value;
                patchDraft(member, {
                  role,
                  permissions: { ...(rolePermissionDefaults[role] || rolePermissionDefaults.member) }
                });
              }}>
                {Object.entries(roleLabels).filter(([role]) => employee.isAdmin || employee.membership.role === "platform_admin" || role !== "platform_admin").map(([role, label]) => <option value={role} key={role}>{label}</option>)}
              </select>
              <select value={value.status} disabled={isSelf} onChange={(event) => patchDraft(member, { status: event.target.value })}>
                <option value="pending">待审批</option>
                <option value="active">正常使用</option>
                <option value="disabled">已停用</option>
              </select>
              <div className="employee-member-usage">
                <span><b>{member.employee.counts.assignedServices}</b>订单</span>
                <span><b>{member.employee.counts.generationJobs + member.employee.counts.deckGenerationRuns}</b>AI 任务</span>
                <span><b>{member.loginCount}</b>登录</span>
              </div>
              <button className="employee-member-expand" onClick={() => setExpandedId(expandedId === member.id ? "" : member.id)}>
                {expandedId === member.id ? "收起权限" : "功能权限"}
              </button>
              <button className="employee-member-save" disabled={isSelf || !drafts[member.id]} onClick={() => void save(member)}>保存</button>
            </div>
            {expandedId === member.id && <div className="employee-permission-grid">
              {(overview.features || Object.keys(featureLabels) as EmployeeFeature[]).map((feature) => <label key={feature}>
                <input type="checkbox" checked={value.permissions[feature]} disabled={isSelf} onChange={(event) => patchDraft(member, {
                  permissions: { ...value.permissions, [feature]: event.target.checked }
                })}/>
                <i/>
                <span>{featureLabels[feature]}</span>
              </label>)}
              <p>最后登录：{member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "尚未登录"} · 最近操作 {member.employee.counts.activities} 次</p>
            </div>}
          </article>;
        })}
        {!members.length && <div className="employee-control-empty">没有符合条件的成员</div>}
      </section>
    </>}
  </div>;
}