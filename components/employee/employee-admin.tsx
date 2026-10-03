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

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Activity, Bot, ImagePlus, KeyRound, LoaderCircle, Plus, RefreshCw, School, ShieldCheck, UserCheck, UserPlus, UserX, Users } from "lucide-react";
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
  const [drafts, setDrafts] = useState<Record<string, { name: string; username: string; password: string; role: string; status: string; permissions: EmployeePermissions }>>({});
  const [creating, setCreating] = useState(false);
  const [newMember, setNewMember] = useState({ name: "", username: "", password: "", role: "member" });
  const [ownCredentials, setOwnCredentials] = useState({ username: employee.username || "", currentPassword: "", newPassword: "" });
  const [currentAccountReady, setCurrentAccountReady] = useState(Boolean(employee.username && employee.hasPassword));

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
      name: member.employee.name,
      username: member.employee.username || "",
      password: "",
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
    const { password, ...rest } = value;
    const response = await employeeApi.admin.updateMember(member.id, { ...rest, ...(password ? { password } : {}) });
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

  async function createMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true);
    const response = await employeeApi.admin.createMember(newMember);
    const result = await response.json();
    setCreating(false);
    if (!response.ok) return notify(result.error || "新增员工失败");
    setNewMember({ name: "", username: "", password: "", role: "member" });
    notify(result.employee?.username ? `已开通 ${result.employee.username} 的账号` : "员工账号已开通");
    await loadOverview();
  }

  async function saveOwnCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await employeeApi.session.updateOwnCredentials({
      username: ownCredentials.username,
      currentPassword: ownCredentials.currentPassword,
      newPassword: ownCredentials.newPassword || undefined
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error || "个人账户保存失败");
    setOwnCredentials((current) => ({ ...current, currentPassword: "", newPassword: "" }));
    setCurrentAccountReady(true);
    notify("个人用户名和密码已更新");
    await loadOverview();
  }

  const members = (overview?.members || []).filter((member) => {
    if (organizationId !== "all" && member.organizationId !== organizationId) return false;
    const keyword = search.trim().toLowerCase();
    return !keyword || member.employee.name.toLowerCase().includes(keyword) ||
      (member.employee.username || "").toLowerCase().includes(keyword) ||
      member.externalUserId.toLowerCase().includes(keyword) ||
      member.organizationName.toLowerCase().includes(keyword);
  });

  return <div className="employee-page employee-control-page">
    <header className="employee-page-head">
      <div><span>PLATFORM CONTROL</span><h1>管理控制台</h1><p>管理平台管理员与员工账号、项目派遣和功能权限；平台管理员拥有全局访问权。</p></div>
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
        <div><School/><span><b>平台工作区</b><small>工作区仅用于数据归属；管理员不受工作区和项目范围限制</small></span></div>
        {overview.organizations.map((organization) => <article key={organization.id}>
          <span><b>{organization.name}</b><small>{organization.memberCount} 位成员</small></span>
          <div className="employee-org-login-status">
            <em className={organization.weChatConfigured ? "configured" : ""}>微信{organization.weChatConfigured ? "已接通" : "待配置"}</em>
            <em className={organization.weComConfigured ? "configured" : ""}>企业微信{organization.weComConfigured ? "已接通" : "待配置"}</em>
          </div>
        </article>)}
      </section>
      <section className="employee-account-control">
        <form onSubmit={saveOwnCredentials}>
          <header><KeyRound/><span><b>我的平台账户</b><small>{currentAccountReady ? "这是当前登录的管理员账号；修改密码后会退出其他登录设备。" : "当前为本机开发引导身份，尚未完成账号确认。请设置只有你知道的登录用户名和密码。"}</small></span></header>
          <label>登录用户名<input value={ownCredentials.username} onChange={(event) => setOwnCredentials((current) => ({ ...current, username: event.target.value }))} autoComplete="username" placeholder="例如 zhangsan" required/></label>
          <label>当前登录密码<input value={ownCredentials.currentPassword} onChange={(event) => setOwnCredentials((current) => ({ ...current, currentPassword: event.target.value }))} autoComplete="current-password" type="password" placeholder={currentAccountReady ? "修改时填写" : "首次设置无需填写"}/></label>
          <label>{currentAccountReady ? "新登录密码" : "设置登录密码"}<input value={ownCredentials.newPassword} onChange={(event) => setOwnCredentials((current) => ({ ...current, newPassword: event.target.value }))} autoComplete="new-password" type="password" placeholder="至少 10 个字符" required={!currentAccountReady}/></label>
          <button>{currentAccountReady ? "保存我的账户" : "确认这是我的平台账户"}</button>
        </form>
        <form onSubmit={createMember}>
          <header><UserPlus/><span><b>开通员工账号</b><small>员工只有项目内的负责人或普通员工身份；平台管理员是全局例外。</small></span></header>
          <label>姓名<input value={newMember.name} onChange={(event) => setNewMember((current) => ({ ...current, name: event.target.value }))} placeholder="员工姓名" required/></label>
          <label>登录用户名<input value={newMember.username} onChange={(event) => setNewMember((current) => ({ ...current, username: event.target.value }))} placeholder="例如 zhangsan" required/></label>
          <label>设置登录密码<input value={newMember.password} onChange={(event) => setNewMember((current) => ({ ...current, password: event.target.value }))} type="password" placeholder="至少 10 个字符" required/></label>
          <label>平台身份<select value={newMember.role} onChange={(event) => setNewMember((current) => ({ ...current, role: event.target.value }))}><option value="member">普通员工</option><option value="platform_admin">平台管理员</option></select></label>
          <button disabled={creating}>{creating ? <LoaderCircle className="spin"/> : <Plus/>}{creating ? "正在开通" : "开通账号"}</button>
        </form>
      </section>
      <div className="employee-control-tools">
        <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
          <option value="all">全部工作区</option>
          {overview.organizations.map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}
        </select>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索姓名、用户名或工作区"/>
        <span>{members.length} 位成员</span>
      </div>
      <section className="employee-member-list">
        {members.map((member) => {
          const value = draft(member);
          const isSelf = member.id === employee.membership.id;
          return <article className={`employee-member-row status-${value.status}`} key={member.id}>
            <div className="employee-member-main">
              <div className="employee-member-avatar">{member.avatarUrl ? <img src={member.avatarUrl} alt=""/> : member.employee.name.slice(0, 1)}</div>
              <span className="employee-member-identity"><b>{member.employee.name}</b><small title={member.employee.username || member.externalUserId}>{member.employee.username ? `登录用户名 · ${member.employee.username}` : member.externalUserId === "bootstrap-unbound" ? "尚未设置登录账户或绑定扫码身份" : `${member.organizationName} · ${identityProviderLabel(member.identityProvider)} · ${compactIdentity(member.externalUserId)}`}</small></span>
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
                {expandedId === member.id ? "收起设置" : "账户与权限"}
              </button>
              <button className="employee-member-save" disabled={isSelf || !drafts[member.id]} onClick={() => void save(member)}>保存</button>
            </div>
            {expandedId === member.id && <div className="employee-permission-grid">
              {!isSelf && <div className="employee-member-account-fields">
                <label>姓名<input value={value.name} onChange={(event) => patchDraft(member, { name: event.target.value })}/></label>
                <label>用户名<input value={value.username} onChange={(event) => patchDraft(member, { username: event.target.value })}/></label>
                <label>重置密码<input value={value.password} onChange={(event) => patchDraft(member, { password: event.target.value })} type="password" placeholder="留空则不修改"/></label>
              </div>}
              {(overview.features || Object.keys(featureLabels) as EmployeeFeature[]).map((feature) => <label key={feature}>
                <input type="checkbox" checked={value.permissions[feature]} disabled={isSelf} onChange={(event) => patchDraft(member, {
                  permissions: { ...value.permissions, [feature]: event.target.checked }
                })}/>
                <i/>
                <span>{featureLabels[feature]}</span>
              </label>)}
              <p>最后登录：{member.lastLoginAt ? formatDateTime(member.lastLoginAt) : "尚未登录"} · 最近操作 {member.employee.counts.activities} 次</p>
              {!isSelf && <button className="employee-member-account-save" disabled={!drafts[member.id]} onClick={() => void save(member)}>保存账户与权限</button>}
            </div>}
          </article>;
        })}
        {!members.length && <div className="employee-control-empty">没有符合条件的成员</div>}
      </section>
    </>}
  </div>;
}
