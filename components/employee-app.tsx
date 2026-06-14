"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import {
  Activity, ArrowRight, Bot, BriefcaseBusiness, Check, ChevronLeft,
  Download, FileText, ImagePlus, LayoutDashboard, LoaderCircle,
  LogOut, MessageCircle, Monitor, Paperclip, Save, Send,
  Settings, ShieldCheck, Sparkles, Upload, UserCog, Users, WandSparkles, X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Employee = {
  id: string; code: string; name: string; phone: string | null; isAdmin: boolean; enabled: boolean; createdAt: string;
};
type Attachment = { id: string; originalName: string; storedName?: string; size: number };
type Message = {
  id: string; role: string; content: string; createdAt: string; attachments: Attachment[];
  employee?: { id: string; name: string } | null;
};
type Consultation = {
  id: string; number: string; budget: string; status: string; updatedAt: string;
  user: { phone: string }; services: { id: string; number: string; title: string }[]; messages: Message[];
};
type GeneratedImage = {
  id: string; isMaterial: boolean; materialOrder: number; createdAt: string;
};
type GenerationJob = {
  id: string; prompt: string; status: string; error?: string | null; createdAt: string;
  employee: { name: string }; images: GeneratedImage[];
};
type WorkDocument = {
  id: string; originalName: string; updatedAt: string;
  versions: { id: string; version: number; label: string; createdAt: string }[];
};
type ActivityItem = { id: string; action: string; detail: string; createdAt: string; employee: { name: string } };
type Service = {
  id: string; number: string; title: string; category: string; purchasedAt: string;
  priceCents: number; status: string; progress: number; assigneeId: string | null;
  assignee: { id: string; name: string; code: string } | null;
  user: { phone: string }; workDocument: WorkDocument | null; activities: ActivityItem[];
  consultation: (Consultation & { messages: Message[] }) | null; generationJobs: GenerationJob[];
};
type EmployeeData = {
  employee: Employee | null; employees: Employee[]; services: Service[]; consultations: Consultation[];
};

const emptyData: EmployeeData = { employee: null, employees: [], services: [], consultations: [] };
const navItems = [
  { id: "orders", label: "订单任务", icon: BriefcaseBusiness },
  { id: "messages", label: "客户消息", icon: MessageCircle },
  { id: "team", label: "团队协作", icon: Users },
  { id: "settings", label: "设置", icon: Settings }
];
const statusOptions = ["待开始", "制作中", "待客户确认", "修改中", "已完成"];

export default function EmployeeApp({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [data, setData] = useState<EmployeeData>(emptyData);
  const [loading, setLoading] = useState(initialAuthenticated);
  const [active, setActive] = useState("orders");
  const [workspace, setWorkspace] = useState<Service | null>(null);
  const [toast, setToast] = useState("");

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const response = await fetch("/api/employee/me", { cache: "no-store" });
    const result = await response.json();
    setData(result.employee ? result : emptyData);
    setLoading(false);
    setWorkspace((current) => current ? result.services?.find((item: Service) => item.id === current.id) ?? null : null);
  }, []);

  useEffect(() => {
    if (!initialAuthenticated) return;
    const timer = setTimeout(() => void loadData(), 0);
    return () => clearTimeout(timer);
  }, [initialAuthenticated, loadData]);
  useEffect(() => {
    if (!data.employee || workspace) return;
    const timer = setInterval(() => void loadData(true), 3000);
    return () => clearInterval(timer);
  }, [data.employee, loadData, workspace]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  async function logout() {
    await fetch("/api/employee/auth/logout", { method: "POST" });
    setData(emptyData); setWorkspace(null);
  }
  async function enterWorkspace(service: Service) {
    if (service.workDocument) return setWorkspace(service);
    const form = new FormData();
    form.set("source", "blank");
    const response = await fetch(`/api/employee/services/${service.id}/workspace`, {
      method: "POST",
      body: form
    });
    const result = await response.json();
    if (!response.ok) return setToast(result.error);
    const latestResponse = await fetch("/api/employee/me", { cache: "no-store" });
    const latest = await latestResponse.json();
    setData(latest);
    const next = latest.services.find((item: Service) => item.id === service.id);
    if (next) setWorkspace(next);
  }

  if (loading) return <div className="employee-root"><MobileBlock/><EmployeeLoading /></div>;
  if (!data.employee) return <div className="employee-root"><MobileBlock/><EmployeeLogin onLogin={loadData} /></div>;

  return <div className="employee-root">
    <MobileBlock/>
    {workspace ? <Workspace service={workspace} employee={data.employee} refresh={loadData} back={() => { setWorkspace(null); void loadData(); }} notify={setToast} /> :
      <div className="employee-shell">
        <EmployeeSidebar active={active} setActive={setActive} employee={data.employee} services={data.services} logout={logout} />
        <main className="employee-main">
          {active === "orders" && <Orders services={data.services} employees={data.employees} employee={data.employee} enterWorkspace={enterWorkspace} refresh={loadData} notify={setToast} />}
          {active === "messages" && <CustomerMessages consultations={data.consultations} refresh={loadData} notify={setToast} />}
          {active === "team" && <TeamView employees={data.employees} services={data.services} />}
          {active === "settings" && <EmployeeSettings employee={data.employee} logout={logout} />}
          {active === "admin" && data.employee.isAdmin && <EmployeeAdmin employees={data.employees} refresh={loadData} notify={setToast} />}
        </main>
      </div>}
    {toast && <div className="employee-toast"><Check size={16}/>{toast}</div>}
  </div>;
}

function MobileBlock() {
  return <div className="employee-mobile-block"><Monitor/><h2>员工工作台仅支持电脑端</h2><p>请使用桌面浏览器进入订单与 PPT 协同制作工作台。</p><Link href="/">返回客户端</Link></div>;
}

function EmployeeBrand() {
  return <div className="employee-brand"><div><Image src="/brand/wzlcf-mark.png" width={38} height={38} alt="WZLCF" /></div><span><b>WZLCF</b><small>Employee Studio</small></span></div>;
}

function EmployeeLoading() {
  return <div className="employee-loading"><div>W</div><LoaderCircle className="spin"/><span>正在进入员工工作台</span></div>;
}

function EmployeeLogin({ onLogin }: { onLogin: () => Promise<void> }) {
  const [phone, setPhone] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);
  async function sendCode() {
    setBusy(true); setError("");
    const response = await fetch("/api/auth/send-code", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone })
    });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(result.error);
    setSent(true); setCountdown(60); setDevCode(result.devCode || "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) return void sendCode();
    setBusy(true); setError("");
    const response = await fetch("/api/employee/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, employeeCode, code, remember: true })
    });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return setError(result.error);
    await onLogin();
  }
  return <div className="employee-login">
    <header><EmployeeBrand/><Link href="/">客户端模式 <ArrowRight size={14}/></Link></header>
    <section className="employee-login-art">
      <span className="employee-login-kicker"><Sparkles size={14}/> WZLCF CREATIVE OPERATIONS</span>
      <h1>让灵感成为<br/><em>可靠的交付。</em></h1>
      <p>订单、沟通、协同编辑与 AI 素材，在同一处有序发生。</p>
      <div className="employee-art-cards"><i/><i/><i/></div>
    </section>
    <section className="employee-login-panel">
      <form onSubmit={submit}>
        <div className="employee-login-mark">W</div>
        <h2>员工工作台</h2><p>仅限已绑定手机号的 WZLCF 团队成员</p>
        <label>手机号码</label><div className="employee-input"><span>+86</span><input value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="请输入绑定手机号" inputMode="numeric"/></div>
        <label>员工码</label><div className="employee-input"><UserCog/><input value={employeeCode} onChange={event => setEmployeeCode(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="8 位员工码" inputMode="numeric"/></div>
        {sent && <><label>验证码</label><div className="employee-input employee-code"><input value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6 位验证码" inputMode="numeric"/><button type="button" onClick={sendCode} disabled={countdown > 0}>{countdown ? `${countdown}s` : "重新获取"}</button></div></>}
        {devCode && <div className="employee-dev-code">本地演示验证码：<b>{devCode}</b></div>}
        {error && <div className="employee-error">{error}</div>}
        <button className="employee-login-button" disabled={busy || phone.length !== 11 || employeeCode.length !== 8 || (sent && code.length !== 6)}>{busy ? <LoaderCircle className="spin"/> : sent ? "验证并进入员工工作台" : "获取短信验证码"}<ArrowRight/></button>
        <small><ShieldCheck size={14}/> 员工身份与客户账户完全隔离</small>
      </form>
    </section>
  </div>;
}

function EmployeeSidebar({ active, setActive, employee, services, logout }: {
  active: string; setActive: (value: string) => void; employee: Employee; services: Service[]; logout: () => void;
}) {
  return <aside className="employee-sidebar">
    <EmployeeBrand/><span className="employee-side-caption">员工协同中心</span>
    <nav>{navItems.map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><item.icon/><span>{item.label}</span>{item.id === "orders" && <em>{services.length}</em>}</button>)}
      {employee.isAdmin && <button className={active === "admin" ? "active" : ""} onClick={() => setActive("admin")}><UserCog/><span>员工管理</span></button>}
    </nav>
    <div className="employee-side-spacer"/>
    <div className="employee-team-card"><Activity/><div><b>团队在线协作</b><span>文档保存与操作日志已开启</span></div><i/></div>
    <div className="employee-profile"><div>{employee.name.slice(0, 1)}</div><span><b>{employee.name}</b><small>{employee.code} · {employee.isAdmin ? "管理员" : "设计师"}</small></span><button onClick={logout} title="退出"><LogOut/></button></div>
  </aside>;
}

function Orders({ services, employees, employee, enterWorkspace, refresh, notify }: {
  services: Service[]; employees: Employee[]; employee: Employee; enterWorkspace: (service: Service) => void;
  refresh: () => Promise<void>; notify: (text: string) => void;
}) {
  const [filter, setFilter] = useState("全部");
  const visible = filter === "全部" ? services : services.filter(service => service.status === filter);
  async function assign(serviceId: string, assigneeId: string) {
    const response = await fetch(`/api/employee/services/${serviceId}/assignee`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assigneeId: assigneeId || null })
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify("负责人已更新"); await refresh();
  }
  return <div className="employee-page">
    <header className="employee-page-head"><div><span>ORDER OPERATIONS</span><h1>把每一份托付，推进为作品</h1><p>查看全部客户订单，分配负责人并进入协同制作工作台。</p></div><div className="employee-head-stat"><b>{services.length}</b><span>项订单正在流转</span></div></header>
    <div className="employee-filters">{["全部", ...statusOptions].map(item => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}<span>{item === "全部" ? services.length : services.filter(service => service.status === item).length}</span></button>)}</div>
    <div className="employee-order-list">{visible.map((service, index) => <article className="employee-order-card" key={service.id}>
      <div className={`employee-order-cover cover-${(index % 4) + 1}`}><small>{service.category}</small><strong>{service.title}</strong><span>WZLCF / {service.number.slice(0, 8)}</span></div>
      <div className="employee-order-content">
        <div className="employee-order-title"><div><span className={`employee-status status-${statusSlug(service.status)}`}>{service.status}</span><h3>{service.title}</h3></div><span className="employee-customer">客户 {maskPhone(service.user.phone)}</span></div>
        <div className="employee-order-meta"><span>服务编号<b>{service.number}</b></span><span>购买时间<b>{formatDate(service.purchasedAt)}</b></span><span>服务价格<b>￥{(service.priceCents / 100).toLocaleString()}</b></span><span>负责人{employee.isAdmin ? <select value={service.assigneeId || ""} onChange={event => assign(service.id, event.target.value)}><option value="">待分配</option>{employees.filter(item => item.enabled && item.phone).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select> : <b>{service.assignee?.name || "待管理员分配"}</b>}</span></div>
        <div className="employee-progress"><div><i style={{ width: `${service.progress}%` }}/></div><b>{service.progress}%</b></div>
        <div className="employee-order-actions"><span>{service.workDocument ? `工作文件 · ${service.workDocument.versions.length} 个版本` : "尚未创建工作文件"}</span><button onClick={() => enterWorkspace(service)}><LayoutDashboard/>进入工作台<ArrowRight/></button></div>
      </div>
    </article>)}</div>
  </div>;
}

function CustomerMessages({ consultations, refresh, notify }: { consultations: Consultation[]; refresh: () => Promise<void>; notify: (text: string) => void }) {
  const [selectedId, setSelectedId] = useState(consultations[0]?.id || "");
  const [text, setText] = useState("");
  const selected = consultations.find(item => item.id === selectedId) || consultations[0];
  async function send() {
    if (!selected || !text.trim()) return;
    const response = await fetch(`/api/employee/consultations/${selected.id}/messages`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: text })
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    setText(""); await refresh();
  }
  return <div className="employee-page employee-message-page">
    <header className="employee-page-head"><div><span>CUSTOMER CONVERSATIONS</span><h1>客户消息</h1><p>集中处理咨询、需求补充和修改反馈。</p></div></header>
    <div className="employee-messenger">
      <aside>{consultations.map(item => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><div>{item.user.phone.slice(-2)}</div><span><b>{item.services[0]?.title || `${item.budget} 咨询`}</b><small>{maskPhone(item.user.phone)} · {item.messages.at(-1)?.content || "暂无消息"}</small></span></button>)}</aside>
      {selected ? <section><header><div><b>{selected.services[0]?.title || "套餐咨询"}</b><span>{selected.number} · {maskPhone(selected.user.phone)}</span></div><i>在线会话</i></header><div className="employee-message-feed">{selected.messages.map(message => <div key={message.id} className={`employee-message ${message.role === "advisor" ? "mine" : message.role}`}><small>{message.role === "advisor" ? message.employee?.name || "WZLCF 服务团队" : message.role === "customer" ? "客户" : "系统"}</small><div>{message.content}{message.attachments.map(file => <span className="employee-message-file" key={file.id}><FileText/>{file.originalName}</span>)}</div><time>{new Date(message.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div>)}</div><footer><textarea value={text} onChange={event => setText(event.target.value)} placeholder="回复客户，Enter 发送，Shift + Enter 换行" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}/><button onClick={send}><Send/></button></footer></section> : <div className="employee-empty">暂无客户会话</div>}
    </div>
  </div>;
}

function TeamView({ employees, services }: { employees: Employee[]; services: Service[] }) {
  const activities = services.flatMap(service => service.activities.map(item => ({ ...item, service }))).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 12);
  return <div className="employee-page"><header className="employee-page-head"><div><span>TEAM COLLABORATION</span><h1>团队协作</h1><p>查看成员状态、负责订单与最近操作。</p></div></header>
    <div className="employee-team-grid">{employees.map(item => <article key={item.id}><div>{item.name.slice(0, 1)}</div><span><b>{item.name}</b><small>{item.code} · {item.isAdmin ? "管理员" : "设计师"}</small></span><em className={item.enabled && item.phone ? "online" : ""}>{item.enabled ? item.phone ? "已启用" : "待绑定" : "已停用"}</em><p>负责 {services.filter(service => service.assigneeId === item.id).length} 个订单</p></article>)}</div>
    <section className="employee-activity-panel"><h2>最近操作</h2>{activities.length ? activities.map(item => <div key={item.id}><Activity/><span><b>{item.employee.name}</b>{item.detail}<small>{item.service.number} · {formatDateTime(item.createdAt)}</small></span></div>) : <p>团队操作记录将在这里出现。</p>}</section>
  </div>;
}

function EmployeeSettings({ employee, logout }: { employee: Employee; logout: () => void }) {
  return <div className="employee-page"><header className="employee-page-head"><div><span>EMPLOYEE SETTINGS</span><h1>账户设置</h1><p>查看员工身份和当前登录信息。</p></div></header><div className="employee-settings-card"><div className="employee-settings-avatar">{employee.name.slice(0, 1)}</div><div><span>员工姓名</span><b>{employee.name}</b></div><div><span>员工码</span><b>{employee.code}</b></div><div><span>绑定手机号</span><b>{employee.phone ? maskPhone(employee.phone) : "未绑定"}</b></div><div><span>权限</span><b>{employee.isAdmin ? "管理员" : "设计师"}</b></div><button onClick={logout}><LogOut/>退出员工模式</button></div></div>;
}

function EmployeeAdmin({ employees, refresh, notify }: { employees: Employee[]; refresh: () => Promise<void>; notify: (text: string) => void }) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; phone: string; enabled: boolean }>>({});
  function draft(item: Employee) { return drafts[item.id] || { name: item.name, phone: item.phone || "", enabled: item.enabled }; }
  async function save(item: Employee) {
    const value = draft(item);
    const response = await fetch(`/api/employee/employees/${item.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value)
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify("员工资料已保存"); setDrafts(current => { const next = { ...current }; delete next[item.id]; return next; }); await refresh();
  }
  return <div className="employee-page"><header className="employee-page-head"><div><span>STAFF ADMINISTRATION</span><h1>员工管理</h1><p>系统固定五个员工身份号，管理员负责绑定手机号和启停账号。</p></div><div className="employee-head-stat"><b>5</b><span>个固定员工席位</span></div></header>
    <div className="employee-admin-table"><header><span>员工身份</span><span>姓名</span><span>绑定手机号</span><span>状态</span><span>操作</span></header>{employees.map(item => { const value = draft(item); return <div key={item.id}><span><b>{item.code}</b><small>{item.isAdmin ? "首位管理员" : "员工席位"}</small></span><input value={value.name} onChange={event => setDrafts(current => ({ ...current, [item.id]: { ...value, name: event.target.value } }))}/><input value={value.phone} onChange={event => setDrafts(current => ({ ...current, [item.id]: { ...value, phone: event.target.value.replace(/\D/g, "").slice(0, 11) } }))} placeholder="输入 11 位手机号"/><label><input type="checkbox" checked={value.enabled} disabled={item.isAdmin} onChange={event => setDrafts(current => ({ ...current, [item.id]: { ...value, enabled: event.target.checked } }))}/><i/>{value.enabled ? "启用" : "停用"}</label><button onClick={() => save(item)}>保存</button></div>; })}</div>
  </div>;
}

function Workspace({ service, employee, refresh, back, notify }: {
  service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; back: () => void; notify: (text: string) => void;
}) {
  const canManage = employee.isAdmin || service.assigneeId === employee.id;
  const [rightOpen, setRightOpen] = useState(true);
  async function saveVersion() {
    const label = window.prompt("为这个版本填写名称", `工作版本 ${(service.workDocument?.versions.length || 0) + 1}`);
    if (!label || !service.workDocument) return;
    const response = await fetch(`/api/employee/work-documents/${service.workDocument.id}/versions`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label })
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify("正式版本已保存"); await refresh(true);
  }
  async function updateStatus(status: string, progress = service.progress) {
    const response = await fetch(`/api/employee/services/${service.id}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, progress })
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify(`订单已更新为${status}`); await refresh(true);
  }
  return <div className={`ppt-workspace ${rightOpen ? "" : "ai-collapsed"}`}>
    <header className="workspace-header"><button onClick={back}><ChevronLeft/>返回订单</button><div><span>{service.number}</span><b>{service.title}</b></div><div className="workspace-responsible">负责人：{service.assignee?.name || "待分配"}</div><div className="workspace-actions">{canManage && <><button onClick={saveVersion}><Save/>保存版本</button><button onClick={() => updateStatus("待客户确认", Math.max(90, service.progress))}><Send/>发布确认稿</button><button className="finish" onClick={() => updateStatus("已完成", 100)}><Check/>完成订单</button></>}<button className="toggle-ai" onClick={() => setRightOpen(value => !value)}><Bot/>{rightOpen ? "收起 AI" : "打开 AI"}</button></div></header>
    <main className="workspace-main"><section className="onlyoffice-stage">{service.workDocument ? <OnlyOfficeEditor documentId={service.workDocument.id} refresh={refresh} notify={notify}/> : <div className="office-placeholder">正在创建空白工作文件...</div>}</section>{rightOpen && <AiPanel service={service} refresh={refresh} notify={notify}/>}</main>
    <MaterialRail service={service} refresh={refresh} notify={notify}/>
  </div>;
}

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor?: () => void } };
  }
}

function OnlyOfficeEditor({ documentId, refresh, notify }: {
  documentId: string;
  refresh: (silent?: boolean) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostId = `onlyoffice-${documentId}`;
  async function loadPresentation(file: File) {
    if (!/\.(ppt|pptx)$/i.test(file.name)) return notify("请拖入 PPT 或 PPTX 文件");
    if (file.size > 100 * 1024 * 1024) return notify("PPT 文件不能超过 100MB");
    const form = new FormData();
    form.set("file", file);
    setUploading(true);
    const response = await fetch(`/api/employee/work-documents/${documentId}/replace`, {
      method: "POST",
      body: form
    });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return notify(result.error);
    setError("");
    editorRef.current?.destroyEditor?.();
    await refresh(true);
    setReloadKey(value => value + 1);
    notify(`已载入 ${file.name}`);
  }
  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await fetch(`/api/employee/work-documents/${documentId}/config`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        let script = document.querySelector<HTMLScriptElement>(`script[data-onlyoffice="${result.scriptUrl}"]`);
        if (!script) {
          script = document.createElement("script"); script.src = result.scriptUrl; script.dataset.onlyoffice = result.scriptUrl;
          document.body.appendChild(script);
          await new Promise<void>((resolve, reject) => { script!.onload = () => resolve(); script!.onerror = () => reject(new Error("无法连接 ONLYOFFICE 文档服务器")); });
        } else if (!window.DocsAPI) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!cancelled && window.DocsAPI) editorRef.current = new window.DocsAPI.DocEditor(hostId, result.config);
        else if (!window.DocsAPI) throw new Error("ONLYOFFICE 尚未启动，请先运行文档服务器");
      } catch (reason) { if (!cancelled) setError(reason instanceof Error ? reason.message : "编辑器加载失败"); }
    }
    void start();
    return () => { cancelled = true; editorRef.current?.destroyEditor?.(); };
  }, [documentId, hostId, reloadKey]);
  return <div className={`onlyoffice-host ${dragging ? "is-dragging" : ""}`}
    onDragEnter={event => { event.preventDefault(); setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => {
      event.preventDefault();
      setDragging(false);
      const file = Array.from(event.dataTransfer.files).find(item => /\.(ppt|pptx)$/i.test(item.name));
      if (file) void loadPresentation(file);
      else notify("请拖入 PPT 或 PPTX 文件");
    }}>
    <input ref={fileRef} hidden type="file" accept=".ppt,.pptx" onChange={event => { const file = event.target.files?.[0]; if (file) void loadPresentation(file); event.currentTarget.value = ""; }}/>
    <div className="office-file-entry"><button onClick={() => fileRef.current?.click()} disabled={uploading}><Upload/>{uploading ? "正在载入..." : "选择 PPT 文件"}</button><span>也可将 PPT / PPTX 直接拖到画布</span></div>
    {error ? <div className="office-placeholder"><Monitor/><h3>编辑器暂未连接</h3><p>{error}</p><button className="office-placeholder-upload" onClick={() => fileRef.current?.click()}><Upload/>先选择一份 PPT</button><small>启动 ONLYOFFICE Docker 服务后即可在线修改。</small></div> : <div id={hostId}/>}
    {dragging && <div className="office-drop-overlay"><Upload/><h3>松开即可载入 PPT</h3><p>支持 .ppt 和 .pptx，最大 100MB</p></div>}
    {uploading && <div className="office-uploading-overlay"><LoaderCircle className="spin"/><span>正在载入演示文稿...</span></div>}
  </div>;
}

function AiPanel({ service, refresh, notify }: { service: Service; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [reference, setReference] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const images = service.generationJobs.flatMap(job => job.images.map(image => ({ ...image, job }))).filter(image => !image.isMaterial);
  async function generate() {
    if (!prompt.trim()) return;
    const form = new FormData(); form.set("prompt", prompt); form.set("count", String(count)); if (reference) form.set("reference", reference);
    setBusy(true);
    const response = await fetch(`/api/employee/services/${service.id}/generate-images`, { method: "POST", body: form });
    const result = await response.json(); setBusy(false);
    if (!response.ok) return notify(result.error);
    notify(`已生成 ${result.job.images.length} 张图片`); await refresh(true);
  }
  async function collect(imageId: string) {
    const response = await fetch(`/api/employee/generated-images/${imageId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isMaterial: true, materialOrder: service.generationJobs.flatMap(job => job.images).length + 1 })
    });
    const result = await response.json(); if (!response.ok) return notify(result.error);
    notify("已加入共享素材"); await refresh(true);
  }
  return <aside className="ai-panel"><header><div><WandSparkles/><span><b>Seedream 创意助手</b><small>豆包 2K 图片生成</small></span></div><i>AI</i></header>
    <div className="ai-feed">{images.length ? images.map(image => <article key={image.id} draggable onDragStart={event => event.dataTransfer.setData("text/wzlcf-image", image.id)}><button className="ai-image-preview" onClick={() => window.open(`/api/employee/generated-images/${image.id}`, "_blank")}><img src={`/api/employee/generated-images/${image.id}`} alt={image.job.prompt}/></button><p>{image.job.prompt}</p><div><span>{image.job.employee.name}</span><a href={`/api/employee/generated-images/${image.id}?download=1`}><Download/></a><button onClick={() => collect(image.id)}><ImagePlus/>收录素材</button></div></article>) : <div className="ai-welcome"><Bot/><h3>为当前演示生成视觉素材</h3><p>描述画面，也可以粘贴或上传一张参考图进行图生图。</p></div>}</div>
    <div className="ai-composer">{reference && <div className="ai-reference"><span><ImagePlus/>{reference.name}</span><button onClick={() => setReference(null)}><X/></button></div>}<textarea value={prompt} onChange={event => setPrompt(event.target.value)} onPaste={event => { const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith("image/")); if (image) setReference(image); }} placeholder="例如：宝石蓝与樱桃红的抽象流体背景，商务、高级、留白充足..."/><div><input ref={fileRef} hidden type="file" accept="image/*" onChange={event => setReference(event.target.files?.[0] || null)}/><button onClick={() => fileRef.current?.click()}><Paperclip/>参考图</button><label>生成<select value={count} onChange={event => setCount(Number(event.target.value))}>{[1,2,3,4].map(value => <option key={value}>{value}</option>)}</select>张</label><button className="ai-generate" onClick={generate} disabled={busy || !prompt.trim()}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}生成</button></div></div>
  </aside>;
}

function MaterialRail({ service, refresh, notify }: { service: Service; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
  const materials = useMemo(() => service.generationJobs.flatMap(job => job.images).filter(image => image.isMaterial).sort((a, b) => a.materialOrder - b.materialOrder), [service.generationJobs]);
  async function setMaterial(id: string, isMaterial: boolean, materialOrder = materials.length + 1) {
    const response = await fetch(`/api/employee/generated-images/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isMaterial, materialOrder })
    });
    const result = await response.json(); if (!response.ok) return notify(result.error);
    await refresh(true);
  }
  async function reorder(draggedId: string, targetId: string) {
    const reordered = [...materials]; const from = reordered.findIndex(item => item.id === draggedId); const to = reordered.findIndex(item => item.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = reordered.splice(from, 1); reordered.splice(to, 0, item);
    await Promise.all(reordered.map((image, index) => fetch(`/api/employee/generated-images/${image.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ materialOrder: index + 1 })
    })));
    await refresh(true);
  }
  return <footer className="material-rail" onDragOver={event => event.preventDefault()} onDrop={event => { const id = event.dataTransfer.getData("text/wzlcf-image"); if (id) void setMaterial(id, true); }}><div><ImagePlus/><span><b>共享素材</b><small>拖入满意的图片，左右滚动查看</small></span></div><section>{materials.length ? materials.map(image => <article key={image.id} draggable onDragStart={event => event.dataTransfer.setData("text/wzlcf-material", image.id)} onDragOver={event => event.preventDefault()} onDrop={event => { event.stopPropagation(); const dragged = event.dataTransfer.getData("text/wzlcf-material"); if (dragged) void reorder(dragged, image.id); }}><img src={`/api/employee/generated-images/${image.id}`} alt="共享素材"/><a href={`/api/employee/generated-images/${image.id}?download=1`}><Download/></a><button onClick={() => setMaterial(image.id, false)}><X/></button></article>) : <p>将右侧生成结果拖到这里，建立本订单的共享视觉素材库。</p>}</section></footer>;
}

function maskPhone(phone: string) { return `${phone.slice(0, 3)}****${phone.slice(-4)}`; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("zh-CN"); }
function formatDateTime(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function statusSlug(status: string) {
  return ({ "待开始": "waiting", "制作中": "making", "待客户确认": "confirm", "修改中": "revision", "已完成": "done" } as Record<string, string>)[status] || "making";
}
