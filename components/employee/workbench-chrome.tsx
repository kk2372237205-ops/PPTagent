/**
 * 员工工作台基础界面件（可复用 UI 组件）
 *
 * 职责：待审批页、左侧导航、订单任务列表、客户消息、客户需求面板、团队协作、设置页。
 * 谁可以改：本模块单独维护；改动不要顺手改订单工作台与智能模式。
 * 依赖：@/lib/employee-api、@/lib/employee-api-types、@/lib/employee-permissions、
 *       @/lib/employee-format、./employee-login、lucide-react。
 * 被谁用：components/employee-app.tsx。
 * 验证方式：npm run verify。
 */

import { useState } from "react";
import { Activity, ArrowRight, BriefcaseBusiness, FileText, LayoutDashboard, LogOut, MessageCircle, Pencil, Plus, RefreshCw, Send, Settings, ShieldCheck, Trash2, UserCheck, UserCog, UserPlus, Users, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { Consultation, Employee, EmployeeFeature, Message, Service } from "@/lib/employee-api-types";
import { canAssignOrders, canOpenEmployeeAdmin, compactIdentity, identityProviderLabel, roleLabels } from "@/lib/employee-permissions";
import { formatDate, formatDateTime, maskPhone, statusSlug } from "@/lib/employee-format";
import { EmployeeBrand } from "./employee-login";
import { OrderManagementModal, type OrderManagementMode } from "./order-management-modal";

/** 左侧导航项；feature 为空表示始终可见 */
const navItems: { id: string; label: string; icon: typeof BriefcaseBusiness; feature?: EmployeeFeature }[] = [
  { id: "orders", label: "订单任务", icon: BriefcaseBusiness, feature: "orders" },
  { id: "messages", label: "客户消息", icon: MessageCircle, feature: "customerMessages" },
  { id: "team", label: "团队协作", icon: Users, feature: "team" },
  { id: "settings", label: "设置", icon: Settings }
];

const statusOptions = ["待开始", "制作中", "待客户确认", "修改中", "已完成"];


/**
 * 接口返回应当是 JSON，但开发热更新期间偶尔会返回空的 500 响应。
 * 这里与 employee-app.tsx 保持同一策略，保证界面可恢复。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responseJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text.trim()) return { error: "服务暂时没有返回内容（HTTP " + response.status + "），请刷新或重启开发服务后重试。" };
  try { return JSON.parse(text); } catch { return { error: "服务返回了无法识别的内容（HTTP " + response.status + "）。" }; }
}

function consultationBudgets(consultation: Pick<Consultation, "budget" | "selectedBudgets">) {
  try {
    const parsed = JSON.parse(consultation.selectedBudgets || "[]");
    if (Array.isArray(parsed)) {
      const values = parsed.filter((item) => typeof item === "string" && item.trim().length > 0);
      return Array.from(new Set([...values, consultation.budget]));
    }
  } catch {
    // Old consultations only have the single budget field.
  }
  return [consultation.budget];
}

function budgetSummary(consultation: Pick<Consultation, "budget" | "selectedBudgets">) {
  return consultationBudgets(consultation).join(" / ");
}

function pendingCustomerMessageCount(messages: Message[]) {
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role === "advisor" && message.employee?.id) break;
    if (message.role === "customer") count += 1;
  }
  return count;
}

export function EmployeePending({ employee, logout }: { employee: Employee; logout: () => void }) {
  const provider = identityProviderLabel(employee.membership.identityProvider);
  return <div className="employee-pending">
    <EmployeeBrand/>
    <div className="employee-pending-mark"><UserCheck/></div>
    <span>身份已验证</span>
    <h1>等待管理员开通工作台</h1>
    <p>{employee.name}，你的{provider}身份已提交至 <b>{employee.membership.organization.name}</b>。管理员确认成员资格后，会为你分配角色和具体功能。</p>
    <dl>
      <div><dt>{provider}身份标识</dt><dd title={employee.membership.externalUserId}>{compactIdentity(employee.membership.externalUserId)}</dd></div>
      <div><dt>当前状态</dt><dd>待审批</dd></div>
    </dl>
    <button onClick={() => window.location.reload()}><RefreshCw/>刷新审批状态</button>
    <button className="secondary" onClick={logout}><LogOut/>退出登录</button>
  </div>;
}

export function EmployeeSidebar({ active, setActive, employee, services, logout }: {
  active: string; setActive: (value: string) => void; employee: Employee; services: Service[]; logout: () => void;
}) {
  return <aside className="employee-sidebar">
    <EmployeeBrand/>
    <nav>{navItems.filter((item) => !item.feature || employee.permissions[item.feature]).map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><item.icon/><span>{item.label}</span>{item.id === "orders" && <em>{services.length}</em>}</button>)}
      {canOpenEmployeeAdmin(employee) && <button className={active === "admin" ? "active" : ""} onClick={() => setActive("admin")}><UserCog/><span>管理控制台</span></button>}
    </nav>
    <div className="employee-side-spacer"/>
    <div className="employee-team-card"><Activity/><div><b>团队在线协作</b><span>文档保存与操作日志已开启</span></div><i/></div>
    <div className="employee-profile"><div>{employee.name.slice(0, 1)}</div><span><b>{employee.name}</b><small>{employee.membership.organization.name} · {roleLabels[employee.membership.role] || "成员"}</small></span><button onClick={logout} title="退出"><LogOut/></button></div>
  </aside>;
}

export function Orders({ services, employees, employee, enterWorkspace, refresh, notify }: {
  services: Service[]; employees: Employee[]; employee: Employee; enterWorkspace: (service: Service) => void;
  refresh: () => Promise<void>; notify: (text: string) => void;
}) {
  const [filter, setFilter] = useState("全部");
  const [memberDrafts, setMemberDrafts] = useState<Record<string, { employeeId: string; role: "lead" | "member" }>>({});
  const [orderModal, setOrderModal] = useState<{ mode: OrderManagementMode; service?: Service } | null>(null);
  const canManageOrders = canOpenEmployeeAdmin(employee);
  const visible = filter === "全部" ? services : services.filter(service => service.status === filter);
  async function assign(serviceId: string, assigneeId: string) {
    const response = await employeeApi.orders.setAssignee(serviceId, assigneeId);
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error);
    notify("负责人已更新"); await refresh();
  }
  function memberDraft(service: Service) {
    return memberDrafts[service.id] || { employeeId: "", role: "member" as const };
  }
  async function addProjectMember(service: Service) {
    const value = memberDraft(service);
    if (!value.employeeId) return notify("请先选择要派遣的员工");
    const response = await employeeApi.orders.addCollaborator(service.id, value.employeeId, value.role);
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "派遣员工失败");
    setMemberDrafts((current) => ({ ...current, [service.id]: { employeeId: "", role: "member" } }));
    notify(value.role === "lead" ? "负责人已更新" : "员工已加入项目");
    await refresh();
  }
  async function removeProjectMember(service: Service, employeeId: string) {
    const response = await employeeApi.orders.removeCollaborator(service.id, employeeId);
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "移出项目失败");
    notify("员工已移出项目");
    await refresh();
  }
  return <div className="employee-page">
    <header className="employee-page-head"><div><span>ORDER OPERATIONS</span><h1>把每一份托付，推进为作品</h1></div><div className="employee-head-stat"><div><b>{services.length}</b><span>项订单正在流转</span></div>{canManageOrders && <button className="employee-order-create" onClick={() => setOrderModal({ mode: "create" })}><Plus/>新增订单</button>}</div></header>
    <div className="employee-filters">{["全部", ...statusOptions].map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "全部" ? services.length : services.filter(service => service.status === item).length}</span></button>)}</div>
    <div className="employee-order-list">{visible.map((service, index) => <article className="employee-order-card" key={service.id}>
      <div className={`employee-order-cover cover-${(index % 4) + 1}`}><small>{service.category}</small><strong>{service.title}</strong><span>WZLCF / {service.number.slice(0, 8)}</span></div>
      <div className="employee-order-content">
        <div className="employee-order-title"><div><span className={`employee-status status-${statusSlug(service.status)}`}>{service.status}</span><h3>{service.title}</h3></div><div className="employee-order-title-side"><span className="employee-customer">客户 {service.customerInfo || maskPhone(service.user.phone)}</span>{canManageOrders && <div className="employee-order-admin-actions"><button onClick={() => setOrderModal({ mode: "edit", service })} title="修改订单"><Pencil/>修改</button><button className="danger" onClick={() => setOrderModal({ mode: "delete", service })} title="删除订单"><Trash2/>删除</button></div>}</div></div>
        <div className="employee-order-meta"><span>服务编号<b>{service.number}</b></span><span>服务类型<b>{service.category}</b></span><span>购买时间<b>{formatDate(service.purchasedAt)}</b></span><span>服务价格<b>￥{(service.priceCents / 100).toLocaleString()}</b></span><span>负责人{canAssignOrders(employee) ? <select value={service.assigneeId || ""} onChange={event => assign(service.id, event.target.value)}><option value="">待分配</option>{employees.filter(item => item.enabled && item.membership.status === "active" && item.permissions.orders).map(item => <option value={item.id} key={item.membership.id}>{item.name}</option>)}</select> : <b>{service.assignee?.name || "待管理员分配"}</b>}</span></div>
        <div className="employee-progress"><div><i style={{ width: `${service.progress}%` }}/></div><b>{service.progress}%</b></div>
        {canAssignOrders(employee) && <div className="employee-project-members">
          <span>项目成员</span>
          <div className="employee-project-member-chips">{(service.collaborators?.length ? service.collaborators : service.assignee ? [{ id: `legacy-${service.assignee.id}`, role: "lead", employee: service.assignee }] : []).map((member) => <b key={member.id} className={member.role === "lead" ? "lead" : ""}>{member.employee.name}<em>{member.role === "lead" ? "负责人" : "普通员工"}</em>{!member.id.startsWith("legacy-") && <button title="移出项目" onClick={() => void removeProjectMember(service, member.employee.id)}><X/></button>}</b>)}</div>
          <div className="employee-project-member-add"><select value={memberDraft(service).employeeId} onChange={(event) => setMemberDrafts((current) => ({ ...current, [service.id]: { ...memberDraft(service), employeeId: event.target.value } }))}><option value="">选择员工</option>{employees.filter((item) => item.enabled && item.membership.status === "active" && item.permissions.orders).map((item) => <option value={item.id} key={item.id}>{item.name}{item.username ? ` · ${item.username}` : ""}</option>)}</select><select value={memberDraft(service).role} onChange={(event) => setMemberDrafts((current) => ({ ...current, [service.id]: { ...memberDraft(service), role: event.target.value === "lead" ? "lead" : "member" } }))}><option value="member">普通员工</option><option value="lead">负责人</option></select><button onClick={() => void addProjectMember(service)}><UserPlus/>派遣</button></div>
        </div>}
        <div className="employee-order-actions"><span>{service.workDocument ? `工作文件 · ${service.workDocument.versions.length} 个版本` : "尚未创建工作文件"}</span><button onClick={() => enterWorkspace(service)}><LayoutDashboard/>进入工作台<ArrowRight/></button></div>
      </div>
    </article>)}{visible.length === 0 && <div className="employee-orders-empty">当前筛选下没有订单</div>}</div>
    {orderModal && <OrderManagementModal mode={orderModal.mode} service={orderModal.service} onClose={() => setOrderModal(null)} onDone={async (message) => { await refresh(); setOrderModal(null); notify(message); }}/>}
  </div>;
}

export function CustomerMessages({ consultations, refresh, notify }: { consultations: Consultation[]; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
  const [selectedId, setSelectedId] = useState(consultations[0]?.id || "");
  const [text, setText] = useState("");
  const selected = consultations.find(item => item.id === selectedId) || consultations[0];
  async function send() {
    if (!selected || !text.trim()) return;
    const response = await employeeApi.orders.replyToCustomer(selected.id, text);
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    setText(""); await refresh(true);
  }
  return <div className="employee-page employee-message-page">
    <header className="employee-page-head"><div><span>CUSTOMER CONVERSATIONS</span><h1>客户消息</h1><p>集中处理咨询、需求补充和修改反馈。</p></div></header>
    <div className="employee-messenger">
      <aside className="employee-conversation-list">{consultations.map(item => {
        const tail = item.user.phone.slice(-4);
        const lastMessage = item.messages.at(-1)?.content || "暂无消息";
        const pendingCount = pendingCustomerMessageCount(item.messages);
        return <button key={item.id} className={`${selected?.id === item.id ? "active" : ""} ${pendingCount ? "has-new" : ""}`} onClick={() => setSelectedId(item.id)}>
          <div className="employee-conversation-avatar"><span>{tail.slice(-2)}</span>{pendingCount > 0 && <em>{pendingCount > 99 ? "99+" : pendingCount}</em>}</div>
          <span>
            <b>套餐咨询 / 尾号 {tail}</b>
            <small>{maskPhone(item.user.phone)} · {budgetSummary(item)} · {lastMessage}</small>
          </span>
        </button>;
      })}</aside>
      {selected ? <>
        <section><header><div><b>套餐咨询 / 尾号 {selected.user.phone.slice(-4)}</b><span>{selected.number} · {maskPhone(selected.user.phone)} · {budgetSummary(selected)}</span></div><i>在线会话</i></header><div className="employee-message-feed">{selected.messages.map(message => <div key={message.id} className={`employee-message ${message.role === "advisor" ? "mine" : message.role}`}><small>{message.role === "advisor" ? message.employee?.name || "WZLCF 服务团队" : message.role === "customer" ? "客户" : "系统"}</small><div>{message.content}{message.attachments.map(file => <span className="employee-message-file" key={file.id}><FileText/>{file.originalName}</span>)}</div><time>{new Date(message.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>)}</div><footer><textarea value={text} onChange={event => setText(event.target.value)} placeholder="回复客户，Enter 发送，Shift + Enter 换行" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}/><button onClick={send}><Send/></button></footer></section>
        <EmployeeCustomerNeedsPanel consultation={selected} />
      </> : <div className="employee-empty">暂无客户会话</div>}
    </div>
  </div>;
}

export function EmployeeCustomerNeedsPanel({ consultation }: { consultation: Consultation }) {
  const selectedBudgets = consultationBudgets(consultation);
  return <aside className="employee-customer-panel">
    <h3>客户需求</h3>
    <div className="employee-customer-budget">
      <span>已选择预算</span>
      <div>{selectedBudgets.map((budget) => <b key={budget}>¥ {budget}</b>)}</div>
    </div>
    <dl>
      <div><dt>咨询状态</dt><dd>{consultation.status}</dd></div>
      <div><dt>服务方式</dt><dd>团队协同服务</dd></div>
      <div><dt>材料支持</dt><dd>PPT / PDF / ZIP</dd></div>
    </dl>
    <div className="employee-privacy-box">
      <ShieldCheck/>
      <div><b>资料安全保障</b><span>仅你和服务团队有权访问本次咨询材料。</span></div>
    </div>
  </aside>;
}

export function TeamView({ employees, services }: { employees: Employee[]; services: Service[] }) {
  const activities = services.flatMap(service => service.activities.map(item => ({ ...item, service }))).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 12);
  return <div className="employee-page"><header className="employee-page-head"><div><span>TEAM COLLABORATION</span><h1>团队协作</h1><p>查看成员状态、负责订单与最近操作。</p></div></header>
    <div className="employee-team-grid">{employees.map(item => <article key={item.membership.id}><div>{item.name.slice(0, 1)}</div><span><b>{item.name}</b><small>{roleLabels[item.membership.role] || "成员"} · {item.membership.position || item.membership.organization.name}</small></span><em className={item.membership.status === "active" ? "online" : ""}>{item.membership.status === "active" ? "已开通" : item.membership.status === "pending" ? "待审批" : "已停用"}</em><p>负责 {services.filter(service => service.assigneeId === item.id).length} 个订单 · 登录 {item.membership.loginCount} 次</p></article>)}</div>
    <section className="employee-activity-panel"><h2>最近操作</h2>{activities.length ? activities.map(item => <div key={item.id}><Activity/><span><b>{item.employee.name}</b>{item.detail}<small>{item.service.number} · {formatDateTime(item.createdAt)}</small></span></div>) : <p>团队操作记录将在这里出现。</p>}</section>
  </div>;
}

export function EmployeeSettings({ employee, logout }: { employee: Employee; logout: () => void }) {
  const enabledFeatures = Object.entries(employee.permissions).filter(([, enabled]) => enabled).length;
  return <div className="employee-page"><header className="employee-page-head"><div><span>EMPLOYEE SETTINGS</span><h1>账户设置</h1><p>查看登录身份、学校工作区和当前权限。</p></div></header><div className="employee-settings-card"><div className="employee-settings-avatar">{employee.name.slice(0, 1)}</div><div><span>成员姓名</span><b>{employee.name}</b></div><div><span>学校工作区</span><b>{employee.membership.organization.name}</b></div><div><span>登录身份</span><b title={employee.membership.externalUserId}>{identityProviderLabel(employee.membership.identityProvider)} · {compactIdentity(employee.membership.externalUserId)}</b></div><div><span>角色</span><b>{roleLabels[employee.membership.role] || "成员"}</b></div><div><span>已开通功能</span><b>{enabledFeatures} / {Object.keys(employee.permissions).length}</b></div><button onClick={logout}><LogOut/>退出员工模式</button></div></div>;
}
