"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import { DeckGenerationForm } from "@/components/employee/deck-generation-form";
import { DeckGenerationRunPanel } from "@/components/employee/deck-run-panels";
import { PolishPptPlanner } from "@/components/employee/polish-ppt-planner";
import type { LocalDesignReference, PptPolishRun } from "@/components/employee/polish-types";
import { ExplodeImagePreview } from "@/components/employee/explode-image-preview";
import { ImageExplodeStudio } from "@/components/employee/explode-studio";
import { AiPanel, ImageToolsPanel } from "@/components/employee/tools-ai-panels";
import { EmployeeAdmin } from "@/components/employee/employee-admin";
import { MaterialRail } from "@/components/employee/material-rail";
import { OnlyOfficeEditor } from "@/components/employee/onlyoffice-editor";
import { deckStylePacks } from "@/lib/employee-deck-constants";
import { canAssignOrders, canOpenEmployeeAdmin, compactIdentity, identityProviderLabel, roleLabels } from "@/lib/employee-permissions";
import { deckStatusText, type DeckRegenerateAction } from "@/lib/employee-deck-shared";
import { formatDate, formatDateTime, maskPhone, safeJson, stageLabel } from "@/lib/employee-format";
import { generatedImageUrl } from "@/lib/employee-image-urls";
import {
  Activity, ArrowRight, Bot, BriefcaseBusiness, Check, ChevronLeft,
  Download, FileText, ImagePlus, LayoutDashboard, LoaderCircle,
  LogOut, MessageCircle, Monitor, Save, Send,
  Maximize2, QrCode, RefreshCw, School, Settings, ShieldCheck, Sparkles, Upload,
  UserCheck, UserCog, Users, WandSparkles, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Consultation, DeckGenerationRun, DesignAgentRun, Employee, EmployeeData, EmployeeFeature, Message, Service } from "@/lib/employee-api-types";

const emptyData: EmployeeData = { employee: null, employees: [], services: [], consultations: [] };
const navItems: { id: string; label: string; icon: typeof BriefcaseBusiness; feature?: EmployeeFeature }[] = [
  { id: "orders", label: "订单任务", icon: BriefcaseBusiness, feature: "orders" },
  { id: "messages", label: "客户消息", icon: MessageCircle, feature: "customerMessages" },
  { id: "team", label: "团队协作", icon: Users, feature: "team" },
  { id: "settings", label: "设置", icon: Settings }
];

const statusOptions = ["待开始", "制作中", "待客户确认", "修改中", "已完成"];

function consultationBudgets(consultation: Pick<Consultation, "budget" | "selectedBudgets">) {
  try {
    const parsed = JSON.parse(consultation.selectedBudgets || "[]");
    if (Array.isArray(parsed)) {
      const values = parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
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

export default function EmployeeApp({ initialAuthenticated }: { initialAuthenticated: boolean }) {
  const [data, setData] = useState<EmployeeData>(emptyData);
  const [loading, setLoading] = useState(initialAuthenticated);
  const [active, setActive] = useState("orders");
  const [workspace, setWorkspace] = useState<Service | null>(null);
  const [toast, setToast] = useState("");

  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const response = await fetch("/api/employee/me", { cache: "no-store" });
      const body = await response.text();
      if (!body.trim()) return;
      const result = JSON.parse(body);
      setData((current) => {
        if (!result.employee) return emptyData;
        if (!current.consultations.length) return result;
        const latestById = new Map(result.consultations.map((item: Consultation) => [item.id, item]));
        const orderedConsultations = current.consultations
          .map((item) => latestById.get(item.id))
          .filter((item): item is Consultation => Boolean(item));
        const knownIds = new Set(orderedConsultations.map((item) => item.id));
        const newConsultations = result.consultations.filter((item: Consultation) => !knownIds.has(item.id));
        return { ...result, consultations: [...orderedConsultations, ...newConsultations] };
      });
      setWorkspace((current) => current ? result.services?.find((item: Service) => item.id === current.id) ?? null : null);
    } catch {
      if (!silent) setToast("员工数据刷新失败，请稍后重试");
    } finally {
      setLoading(false);
    }
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
  const effectiveActive = useMemo(() => {
    if (!data.employee || data.employee.membership.status !== "active") return active;
    if (active === "admin" && canOpenEmployeeAdmin(data.employee)) return active;
    const allowed = navItems.filter((item) => !item.feature || data.employee?.permissions[item.feature]);
    return allowed.some((item) => item.id === active) ? active : allowed[0]?.id || "settings";
  }, [active, data.employee]);

  async function logout() {
    await fetch("/api/employee/auth/logout", { method: "POST" });
    setData(emptyData); setWorkspace(null);
  }
  async function enterWorkspace(service: Service) {
    if (!data.employee?.permissions.officeEditor) {
      setToast("你的账号未开通在线编辑权限");
      return;
    }
    if (service.workDocument) return setWorkspace(service);
    const form = new FormData();
    form.set("source", "blank");
    const response = await fetch(`/api/employee/services/${service.id}/workspace`, {
      method: "POST",
      body: form
    });
    const result = await responseJson(response);
    if (!response.ok) return setToast(result.error);
    const latestResponse = await fetch("/api/employee/me", { cache: "no-store" });
    const latest = await latestResponse.json();
    setData(latest);
    const next = latest.services.find((item: Service) => item.id === service.id);
    if (next) setWorkspace(next);
  }

  if (loading) return <div className="employee-root"><MobileBlock/><EmployeeLoading /></div>;
  if (!data.employee) return <div className="employee-root"><MobileBlock/><EmployeeLogin onLogin={loadData} /></div>;
  if (data.employee.membership.status !== "active") {
    return <div className="employee-root"><MobileBlock/><EmployeePending employee={data.employee} logout={logout}/></div>;
  }

  return <div className="employee-root">
    <MobileBlock/>
    {workspace ? <Workspace service={workspace} employee={data.employee} refresh={loadData} back={() => { setWorkspace(null); void loadData(); }} notify={setToast} /> :
      <div className="employee-shell">
        <EmployeeSidebar active={effectiveActive} setActive={setActive} employee={data.employee} services={data.services} logout={logout} />
        <main className="employee-main">
          {effectiveActive === "orders" && <Orders services={data.services} employees={data.employees} employee={data.employee} enterWorkspace={enterWorkspace} refresh={loadData} notify={setToast} />}
          {effectiveActive === "messages" && <CustomerMessages consultations={data.consultations} refresh={loadData} notify={setToast} />}
          {effectiveActive === "team" && <TeamView employees={data.employees} services={data.services} />}
          {effectiveActive === "settings" && <EmployeeSettings employee={data.employee} logout={logout} />}
          {effectiveActive === "admin" && canOpenEmployeeAdmin(data.employee) && <EmployeeAdmin employee={data.employee} notify={setToast} />}
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

type EmployeeLoginProvider = "wechat" | "wecom";
type EmployeeLoginConfig = {
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

function EmployeeLogin({ onLogin }: { onLogin: () => Promise<void> }) {
  const [provider, setProvider] = useState<EmployeeLoginProvider>("wechat");
  const [config, setConfig] = useState<EmployeeLoginConfig | null>(null);
  const [selectedOrganization, setSelectedOrganization] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadConfig = useCallback(async (targetProvider: EmployeeLoginProvider, organizationSlug?: string) => {
    setBusy(true);
    setError("");
    try {
      const query = organizationSlug ? `?org=${encodeURIComponent(organizationSlug)}` : "";
      const response = await fetch(`/api/employee/auth/${targetProvider}/config${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `${targetProvider === "wechat" ? "微信" : "企业微信"}登录配置读取失败`);
      setConfig(result);
      setSelectedOrganization(result.selectedOrganization || result.organizations?.[0]?.slug || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "扫码登录配置读取失败");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search);
      const weComError = query.get("wecom_error");
      const weChatError = query.get("wechat_error");
      const initialProvider: EmployeeLoginProvider = weComError ? "wecom" : "wechat";
      const queryError = weComError || weChatError;
      setProvider(initialProvider);
      if (queryError) {
        setError(queryError);
        window.history.replaceState({}, "", "/employee");
      }
      void loadConfig(initialProvider);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadConfig]);

  useEffect(() => {
    if (!config?.configured || !config.redirectUri || !config.state) return;
    let cancelled = false;
    if (provider === "wechat" && config.appId) {
      const options = {
        self_redirect: false,
        id: "employee-wechat-qr",
        appid: config.appId,
        scope: "snsapi_login",
        redirect_uri: encodeURIComponent(config.redirectUri),
        state: config.state,
        style: "black",
        href: ""
      };
      const mount = () => {
        if (cancelled) return;
        const container = document.getElementById(options.id);
        if (container) container.innerHTML = "";
        const Login = (window as unknown as {
          WxLogin?: new (value: typeof options) => unknown;
        }).WxLogin;
        if (!Login) return setError("微信二维码组件加载失败，请使用下方登录链接");
        new Login(options);
      };
      const existing = document.querySelector<HTMLScriptElement>('script[data-wechat-login="true"]');
      if (existing) {
        if ((window as unknown as { WxLogin?: unknown }).WxLogin) mount();
        else existing.addEventListener("load", mount, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://res.wx.qq.com/connect/zh_CN/htmledition/js/wxLogin.js";
        script.async = true;
        script.dataset.wechatLogin = "true";
        script.onload = mount;
        script.onerror = () => setError("微信二维码组件加载失败，请使用下方登录链接");
        document.head.appendChild(script);
      }
    }
    if (provider === "wecom" && config.corpId && config.agentId) {
      const options = {
        id: "employee-wecom-qr",
        appid: config.corpId,
        agentid: config.agentId,
        redirect_uri: encodeURIComponent(config.redirectUri),
        state: config.state,
        href: "",
        lang: "zh"
      };
      const mount = () => {
        if (cancelled) return;
        const container = document.getElementById(options.id);
        if (container) container.innerHTML = "";
        const Login = (window as unknown as {
          WwLogin?: new (value: typeof options) => unknown;
        }).WwLogin;
        if (!Login) return setError("企业微信二维码组件加载失败，请使用下方登录链接");
        new Login(options);
      };
      const existing = document.querySelector<HTMLScriptElement>('script[data-wecom-login="true"]');
      if (existing) {
        if ((window as unknown as { WwLogin?: unknown }).WwLogin) mount();
        else existing.addEventListener("load", mount, { once: true });
      } else {
        const script = document.createElement("script");
        script.src = "https://wwcdn.weixin.qq.com/node/wework/wwopen/js/wwLogin-1.2.7.js";
        script.async = true;
        script.dataset.wecomLogin = "true";
        script.onload = mount;
        script.onerror = () => setError("企业微信二维码组件加载失败，请使用下方登录链接");
        document.head.appendChild(script);
      }
    }
    return () => { cancelled = true; };
  }, [config, provider]);

  useEffect(() => {
    if (!config?.configured) return;
    const timer = window.setInterval(async () => {
      const response = await fetch("/api/employee/me", { cache: "no-store" });
      if (!response.ok) return;
      const result = await response.json();
      if (result.employee) {
        window.clearInterval(timer);
        await onLogin();
      }
    }, 1800);
    return () => window.clearInterval(timer);
  }, [config?.configured, onLogin]);

  async function enterDevelopmentAdmin() {
    setBusy(true);
    setError("");
    const response = await fetch(`/api/employee/auth/${provider}/dev`, { method: "POST" });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return setError(result.error || "开发管理员入口不可用");
    await onLogin();
  }

  function switchProvider(nextProvider: EmployeeLoginProvider) {
    if (nextProvider === provider) return;
    setProvider(nextProvider);
    setConfig(null);
    setError("");
    void loadConfig(nextProvider, selectedOrganization || undefined);
  }

  const providerName = provider === "wechat" ? "微信" : "企业微信";
  const currentOrganization = config?.organizations.find((item) => item.slug === selectedOrganization);

  return <div className="employee-login">
    <header><EmployeeBrand/><Link href="/">客户端模式 <ArrowRight size={14}/></Link></header>
    <section className="employee-login-art">
      <span className="employee-login-kicker"><Sparkles size={14}/> WZLCF CREATIVE OPERATIONS</span>
      <h1>让灵感成为<br/><em>可靠的交付。</em></h1>
      <p>订单、沟通、协同编辑与 AI 素材，在同一处有序发生。</p>
      <div className="employee-art-cards"><i/><i/><i/></div>
    </section>
    <section className="employee-login-panel">
      <div className="employee-wechat-login">
        <div className="employee-login-mark">W</div>
        <h2>扫码登录</h2><p>默认使用微信，也可以使用学校企业微信</p>
        <div className="employee-login-providers" role="tablist" aria-label="登录方式">
          <button className={provider === "wechat" ? "active" : ""} role="tab" aria-selected={provider === "wechat"} onClick={() => switchProvider("wechat")}><QrCode/>微信</button>
          <button className={provider === "wecom" ? "active" : ""} role="tab" aria-selected={provider === "wecom"} onClick={() => switchProvider("wecom")}><School/>企业微信</button>
        </div>
        {config?.organizations && config.organizations.length > 1 ? <label className="employee-wechat-school">
          <span>申请加入</span>
          <select value={selectedOrganization} onChange={(event) => void loadConfig(provider, event.target.value)}>
            {config.organizations.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}
          </select>
        </label> : currentOrganization && <div className="employee-wechat-school employee-wechat-school-static"><span>申请加入</span><b><School/>{currentOrganization.name}</b></div>}
        {busy && !config ? <div className="employee-wechat-loading"><LoaderCircle className="spin"/><span>正在读取微信登录配置</span></div> :
          config?.configured ? <>
            <div className="employee-wechat-qr-shell">
              <div id={`employee-${provider}-qr`}><LoaderCircle className="spin"/></div>
              <span><QrCode/>使用{providerName}扫一扫</span>
            </div>
            <p className="employee-wechat-hint">{provider === "wechat" ? "微信身份不代表学校身份。首次扫码只会提交加入申请，由管理员审核学校与功能权限。" : "企业微信会核验该学校通讯录成员身份；首次登录仍由管理员分配角色和功能权限。"}</p>
            {config.authorizationUrl && <a className="employee-wechat-fallback" href={config.authorizationUrl}>二维码未显示？打开{providerName}登录页 <ArrowRight/></a>}
          </> : <div className="employee-wechat-unconfigured">
            <QrCode/>
            <b>{providerName}扫码登录尚未接通</b>
            <p>{provider === "wechat" ? "需要先在微信开放平台创建网站应用，并配置 AppID、AppSecret 和 HTTPS 回调域名。" : "需要学校企业微信管理员创建自建应用，并配置 CorpID、AgentID、Secret 和可信回调域名。"}</p>
            <button onClick={() => void loadConfig(provider, selectedOrganization)}><RefreshCw/>重新检查配置</button>
          </div>}
        {error && <div className="employee-error">{error}</div>}
        {config?.developmentBypassAvailable && <button className="employee-dev-admin" disabled={busy} onClick={enterDevelopmentAdmin}>暂不扫码，进入本地工作台</button>}
        <small><ShieldCheck size={14}/>{provider === "wechat" ? "只读取授权后的微信昵称、头像和身份标识，不读取密码、聊天记录或联系人" : "只读取学校企业微信授权范围内的成员身份，不读取密码、聊天记录或联系人"}</small>
      </div>
    </section>
  </div>;
}

function EmployeePending({ employee, logout }: { employee: Employee; logout: () => void }) {
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

function EmployeeSidebar({ active, setActive, employee, services, logout }: {
  active: string; setActive: (value: string) => void; employee: Employee; services: Service[]; logout: () => void;
}) {
  return <aside className="employee-sidebar">
    <EmployeeBrand/><span className="employee-side-caption">员工协同中心</span>
    <nav>{navItems.filter((item) => !item.feature || employee.permissions[item.feature]).map(item => <button key={item.id} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}><item.icon/><span>{item.label}</span>{item.id === "orders" && <em>{services.length}</em>}</button>)}
      {canOpenEmployeeAdmin(employee) && <button className={active === "admin" ? "active" : ""} onClick={() => setActive("admin")}><UserCog/><span>管理控制台</span></button>}
    </nav>
    <div className="employee-side-spacer"/>
    <div className="employee-team-card"><Activity/><div><b>团队在线协作</b><span>文档保存与操作日志已开启</span></div><i/></div>
    <div className="employee-profile"><div>{employee.name.slice(0, 1)}</div><span><b>{employee.name}</b><small>{employee.membership.organization.name} · {roleLabels[employee.membership.role] || "成员"}</small></span><button onClick={logout} title="退出"><LogOut/></button></div>
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
    const result = await responseJson(response);
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
        <div className="employee-order-meta"><span>服务编号<b>{service.number}</b></span><span>购买时间<b>{formatDate(service.purchasedAt)}</b></span><span>服务价格<b>￥{(service.priceCents / 100).toLocaleString()}</b></span><span>负责人{canAssignOrders(employee) ? <select value={service.assigneeId || ""} onChange={event => assign(service.id, event.target.value)}><option value="">待分配</option>{employees.filter(item => item.enabled && item.membership.status === "active" && item.permissions.orders).map(item => <option value={item.id} key={item.membership.id}>{item.name}</option>)}</select> : <b>{service.assignee?.name || "待管理员分配"}</b>}</span></div>
        <div className="employee-progress"><div><i style={{ width: `${service.progress}%` }}/></div><b>{service.progress}%</b></div>
        <div className="employee-order-actions"><span>{service.workDocument ? `工作文件 · ${service.workDocument.versions.length} 个版本` : "尚未创建工作文件"}</span><button onClick={() => enterWorkspace(service)}><LayoutDashboard/>进入工作台<ArrowRight/></button></div>
      </div>
    </article>)}</div>
  </div>;
}

function CustomerMessages({ consultations, refresh, notify }: { consultations: Consultation[]; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
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

function EmployeeCustomerNeedsPanel({ consultation }: { consultation: Consultation }) {
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

function TeamView({ employees, services }: { employees: Employee[]; services: Service[] }) {
  const activities = services.flatMap(service => service.activities.map(item => ({ ...item, service }))).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 12);
  return <div className="employee-page"><header className="employee-page-head"><div><span>TEAM COLLABORATION</span><h1>团队协作</h1><p>查看成员状态、负责订单与最近操作。</p></div></header>
    <div className="employee-team-grid">{employees.map(item => <article key={item.membership.id}><div>{item.name.slice(0, 1)}</div><span><b>{item.name}</b><small>{roleLabels[item.membership.role] || "成员"} · {item.membership.position || item.membership.organization.name}</small></span><em className={item.membership.status === "active" ? "online" : ""}>{item.membership.status === "active" ? "已开通" : item.membership.status === "pending" ? "待审批" : "已停用"}</em><p>负责 {services.filter(service => service.assigneeId === item.id).length} 个订单 · 登录 {item.membership.loginCount} 次</p></article>)}</div>
    <section className="employee-activity-panel"><h2>最近操作</h2>{activities.length ? activities.map(item => <div key={item.id}><Activity/><span><b>{item.employee.name}</b>{item.detail}<small>{item.service.number} · {formatDateTime(item.createdAt)}</small></span></div>) : <p>团队操作记录将在这里出现。</p>}</section>
  </div>;
}

function EmployeeSettings({ employee, logout }: { employee: Employee; logout: () => void }) {
  const enabledFeatures = Object.entries(employee.permissions).filter(([, enabled]) => enabled).length;
  return <div className="employee-page"><header className="employee-page-head"><div><span>EMPLOYEE SETTINGS</span><h1>账户设置</h1><p>查看登录身份、学校工作区和当前权限。</p></div></header><div className="employee-settings-card"><div className="employee-settings-avatar">{employee.name.slice(0, 1)}</div><div><span>成员姓名</span><b>{employee.name}</b></div><div><span>学校工作区</span><b>{employee.membership.organization.name}</b></div><div><span>登录身份</span><b title={employee.membership.externalUserId}>{identityProviderLabel(employee.membership.identityProvider)} · {compactIdentity(employee.membership.externalUserId)}</b></div><div><span>角色</span><b>{roleLabels[employee.membership.role] || "成员"}</b></div><div><span>已开通功能</span><b>{enabledFeatures} / {Object.keys(employee.permissions).length}</b></div><button onClick={logout}><LogOut/>退出员工模式</button></div></div>;
}



function Workspace({ service, employee, refresh, back, notify }: {
  service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; back: () => void; notify: (text: string) => void;
}) {
  const canManage = employee.permissions.orders && (
    employee.isAdmin ||
    ["platform_admin", "org_admin", "manager"].includes(employee.membership.role) ||
    service.assigneeId === employee.id
  );
  const [rightOpen, setRightOpen] = useState(employee.permissions.aiAssistant);
  const [workspaceMode, setWorkspaceMode] = useState<"editor" | "design" | "explode">("editor");
  const [editorRevision, setEditorRevision] = useState(0);
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
  const leaveWorkspace = workspaceMode === "editor" ? back : () => setWorkspaceMode("editor");
  return <div className={`ppt-workspace ${rightOpen ? "" : "ai-collapsed"} ${workspaceMode !== "editor" ? "design-view" : ""}`}>
    <header className="workspace-header"><button onClick={leaveWorkspace}><ChevronLeft/>{workspaceMode === "editor" ? "返回订单" : "返回工作台"}</button><div><span>{service.number}</span><b>{service.title}</b></div><div className="workspace-responsible">负责人：{service.assignee?.name || "待分配"}</div><div className="workspace-actions"><button onClick={saveVersion}><Save/>保存版本</button>{canManage && <><button onClick={() => updateStatus("待客户确认", Math.max(90, service.progress))}><Send/>发布确认稿</button><button className="finish" onClick={() => updateStatus("已完成", 100)}><Check/>完成订单</button></>}{workspaceMode === "editor" && employee.permissions.aiAssistant && <button className="toggle-ai" onClick={() => setRightOpen(value => !value)}><Bot/>{rightOpen ? "收起 AI" : "打开 AI"}</button>}</div></header>
    {workspaceMode === "design" ? <DesignStudio service={service} employee={employee} refresh={refresh} notify={notify} back={() => setWorkspaceMode("editor")} openEditor={(slideNumber) => { setEditorRevision(value => value + 1); setWorkspaceMode("editor"); notify(`已新增第 ${slideNumber} 页，请在左侧缩略图最底部查看`); }} /> : workspaceMode === "explode" ? <ImageExplodeStudio service={service} refresh={refresh} notify={notify} back={() => setWorkspaceMode("editor")} openEditor={(slideNumber) => { setEditorRevision(value => value + 1); setWorkspaceMode("editor"); notify(`已新增第 ${slideNumber} 页零部件，请在左侧缩略图最底部查看`); }} /> : <>
      <main className="workspace-main"><section className="onlyoffice-stage">{service.workDocument ? <OnlyOfficeEditor documentId={service.workDocument.id} revision={editorRevision} refresh={refresh} notify={notify}/> : <div className="office-placeholder">正在创建空白工作文件...</div>}</section>{rightOpen && employee.permissions.aiAssistant && <AiPanel service={service} employee={employee} refresh={refresh} notify={notify}/>}</main>
      {workspaceMode === "editor" && employee.permissions.smartPpt && <button className="workspace-smart-mode" onClick={() => setWorkspaceMode("design")}><WandSparkles/>智能模式</button>}
      {employee.permissions.imageTools && <ImageToolsPanel service={service} employee={employee} refresh={refresh} notify={notify}/>}
      {employee.permissions.materials && <MaterialRail service={service} employee={employee} refresh={refresh} notify={notify}/>}
    </>}
  </div>;
}



function DesignStudio({ service, employee, refresh, notify, back, openEditor }: {
  service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void; back: () => void; openEditor: (slideNumber: number) => void;
}) {
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [mentorTool, setMentorTool] = useState<"deck" | "polish" | "image">("deck");
  const [mode, setMode] = useState<"text" | "mixed">("text");
  const [batchCount, setBatchCount] = useState(1);
  const [brief, setBrief] = useState("");
  const [polishRequirement, setPolishRequirement] = useState("");
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const [localReferences, setLocalReferences] = useState<LocalDesignReference[]>([]);
  const [primaryKey, setPrimaryKey] = useState("");
  const [runs, setRuns] = useState<DesignAgentRun[]>([]);
  const [activeRun, setActiveRun] = useState<DesignAgentRun | null>(null);
  const [deckRuns, setDeckRuns] = useState<DeckGenerationRun[]>([]);
  const [activeDeckRun, setActiveDeckRun] = useState<DeckGenerationRun | null>(null);
  const [polishRuns, setPolishRuns] = useState<PptPolishRun[]>([]);
  const [activePolishRun, setActivePolishRun] = useState<PptPolishRun | null>(null);
  const [polishDraftRun, setPolishDraftRun] = useState<PptPolishRun | null>(null);
  const [workerWarning, setWorkerWarning] = useState("");
  const [polishWorkerWarning, setPolishWorkerWarning] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState({ image: false, deck: false, polish: false });
  const [initialHistorySelected, setInitialHistorySelected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const deckLoadSequence = useRef(0);

  const mineMaterials = useMemo(() => service.materialItems.filter(item => item.employee.id === employee.id), [employee.id, service.materialItems]);
  const selectedCount = selectedMaterials.length + localReferences.length;
  const selectedMaterialItems = mineMaterials.filter(item => selectedMaterials.includes(item.image.id));
  const primaryIndex = (() => {
    const materialIndex = selectedMaterials.indexOf(primaryKey.replace(/^material:/, ""));
    if (primaryKey.startsWith("material:") && materialIndex >= 0) return materialIndex;
    const uploadIndex = localReferences.findIndex(item => `local:${item.id}` === primaryKey);
    return uploadIndex >= 0 ? selectedMaterials.length + uploadIndex : 0;
  })();

  const loadRuns = useCallback(async () => {
    const response = await fetch(`/api/employee/services/${service.id}/design-agent/runs`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) return notify(result.error || "智能美化记录读取失败");
    setRuns(result.runs || []);
    setWorkerWarning(result.workerHealth?.ok === false ? (result.workerHealth.message || "后台智能模式 Worker 未运行/已停止") : "");
    setActiveRun(current => current ? (result.runs || []).find((item: DesignAgentRun) => item.id === current.id) || current : current);
    setHistoryLoaded(current => ({ ...current, image: true }));
  }, [notify, service.id]);
  const loadDeckRuns = useCallback(async () => {
    const sequence = ++deckLoadSequence.current;
    const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs`, { cache: "no-store" });
    const result = await response.json();
    if (sequence !== deckLoadSequence.current) return;
    if (!response.ok) return notify(result.error || "生成 PPT 记录读取失败");
    const nextRuns = result.runs || [];
    setDeckRuns(nextRuns);
    setActiveDeckRun(current => current ? nextRuns.find((item: DeckGenerationRun) => item.id === current.id) || current : current);
    setHistoryLoaded(current => ({ ...current, deck: true }));
  }, [notify, service.id]);
  const syncPolishRuns = useCallback((nextRuns: PptPolishRun[]) => {
    setPolishRuns(nextRuns);
    setActivePolishRun(current => current ? nextRuns.find(item => item.id === current.id) || current : current);
    setHistoryLoaded(current => ({ ...current, polish: true }));
  }, []);
  const loadPolishRuns = useCallback(async () => {
    const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs`, { cache: "no-store" });
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "美化 PPT 记录读取失败");
    setPolishWorkerWarning(result.workerHealth?.ok === false ? (result.workerHealth.message || "PPT 美化 Worker 未运行/已停止") : "");
    syncPolishRuns((result.runs || []) as PptPolishRun[]);
  }, [notify, service.id, syncPolishRuns]);
  const focusHistoryTop = useCallback(() => {
    window.setTimeout(() => historyRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 0);
  }, []);
  function setDeckRun(run: DeckGenerationRun) {
    deckLoadSequence.current += 1;
    setActiveRun(null);
    setActivePolishRun(null);
    setActiveDeckRun(run);
    setDeckRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
    focusHistoryTop();
  }
  function setPolishRun(run: PptPolishRun) {
    setActiveRun(null);
    setActiveDeckRun(null);
    setActivePolishRun(run);
    setPolishRuns(current => [run, ...current.filter(item => item.id !== run.id)].slice(0, 8));
    setMentorOpen(false);
    focusHistoryTop();
  }
  function editPolishPlan() {
    if (!activePolishRun || activePolishRun.status !== "plan_ready") return;
    setPolishDraftRun(activePolishRun);
    setPolishRequirement(activePolishRun.note || "");
    setMentorTool("polish");
    setMentorOpen(true);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadRuns]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadDeckRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadDeckRuns]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadPolishRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPolishRuns]);
  useEffect(() => {
    if (initialHistorySelected || !historyLoaded.image || !historyLoaded.deck || !historyLoaded.polish) return;
    const latest = [
      ...deckRuns.map(run => ({ kind: "deck" as const, run, createdAt: run.createdAt })),
      ...polishRuns.map(run => ({ kind: "polish" as const, run, createdAt: run.createdAt })),
      ...runs.map(run => ({ kind: "image" as const, run, createdAt: run.createdAt }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const timer = window.setTimeout(() => {
      if (latest?.kind === "deck") { setActiveRun(null); setActivePolishRun(null); setActiveDeckRun(latest.run); }
      if (latest?.kind === "polish") { setActiveRun(null); setActiveDeckRun(null); setActivePolishRun(latest.run); }
      if (latest?.kind === "image") { setActiveDeckRun(null); setActivePolishRun(null); setActiveRun(latest.run); }
      setInitialHistorySelected(true);
      focusHistoryTop();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deckRuns, focusHistoryTop, historyLoaded, initialHistorySelected, polishRuns, runs]);
  useEffect(() => {
    if (!activeRun || !["queued", "running"].includes(activeRun.status)) return;
    const timer = window.setInterval(() => void loadRuns(), 2200);
    return () => window.clearInterval(timer);
  }, [activeRun, loadRuns]);
  useEffect(() => {
    if (!activeDeckRun || !["sources_queued", "source_processing", "queued", "planning", "matching_queued", "matching", "confirmed", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(activeDeckRun.status)) return;
    const timer = window.setInterval(() => void loadDeckRuns(), 2400);
    return () => window.clearInterval(timer);
  }, [activeDeckRun, loadDeckRuns]);
  useEffect(() => {
    if (!activePolishRun || !["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(activePolishRun.status)) return;
    const timer = window.setInterval(() => void loadPolishRuns(), 2400);
    return () => window.clearInterval(timer);
  }, [activePolishRun, loadPolishRuns]);
  useEffect(() => {
    if (mentorTool !== "image" || mode !== "text" || !selectedCount) return;
    const referencesToClear = localReferences;
    const timer = window.setTimeout(() => {
      referencesToClear.forEach(item => URL.revokeObjectURL(item.previewUrl));
      setSelectedMaterials([]);
      setLocalReferences([]);
      setPrimaryKey("");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [localReferences, mentorTool, mode, selectedCount]);

  function addFiles(files: File[], source: "upload" | "ppt" = "upload") {
    if (mentorTool === "image" && mode === "text") return notify("文生图模式只能文字描述，不能上传参考图");
    const remaining = 6 - selectedCount;
    const accepted = files.filter(file => ["image/png", "image/jpeg", "image/webp"].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, remaining);
    if (!accepted.length) return notify("请添加 PNG、JPEG 或 WebP 图片，单张不超过 10MB");
    const next = accepted.map(file => ({ id: `${Date.now()}-${Math.random()}`, file, previewUrl: URL.createObjectURL(file), source }));
    setLocalReferences(current => [...current, ...next]);
    setPrimaryKey(current => current || `local:${next[0].id}`);
  }
  function toggleMaterial(imageId: string) {
    if (mentorTool === "image" && mode === "text") return notify("文生图模式只能文字描述，不能选择素材图");
    setSelectedMaterials(current => {
      if (current.includes(imageId)) {
        setPrimaryKey(key => key === `material:${imageId}` ? "" : key);
        return current.filter(item => item !== imageId);
      }
      if (current.length + localReferences.length >= 6) { notify("最多选择 6 张参考图"); return current; }
      setPrimaryKey(key => key || `material:${imageId}`);
      return [...current, imageId];
    });
  }
  function removeLocal(id: string) {
    setLocalReferences(current => {
      const target = current.find(item => item.id === id); if (target) URL.revokeObjectURL(target.previewUrl);
      return current.filter(item => item.id !== id);
    });
    setPrimaryKey(key => key === `local:${id}` ? "" : key);
  }
  async function createRun() {
    if (!brief.trim()) return notify("请写下这一页 PPT 的美化想法");
    if (mode === "mixed" && !selectedCount) return notify("混合模式至少需要一张参考图");
    const form = new FormData();
    form.set("brief", brief.trim()); form.set("generationMode", mode); form.set("qualityMode", "standard"); form.set("generatedImageIds", JSON.stringify(mode === "mixed" ? selectedMaterials : [])); form.set("primaryIndex", String(primaryIndex)); form.set("batchCount", String(batchCount));
    if (mode === "mixed") localReferences.forEach(item => form.append("references", item.file));
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/design-agent/runs`, { method: "POST", body: form });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "智能美化任务创建失败");
      setActivePolishRun(null); setActiveDeckRun(null); setActiveRun(result.run); setRuns(current => [result.run, ...current]); setMentorOpen(false); focusHistoryTop(); notify("智能模式任务已开始");
    } finally { setBusy(false); }
  }
  async function confirmDeckRun() {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeDeckRun.id}/confirm`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "确认生成失败");
      setDeckRun(result.run);
      notify("已开始批量生成页面图片");
    } finally { setBusy(false); }
  }
  async function replanDeckRun(stylePack?: string) {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeDeckRun.id}/replan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stylePack: stylePack || activeDeckRun.stylePack })
      });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "重新生成方案失败");
      setDeckRun(result.run);
      notify(stylePack && stylePack !== activeDeckRun.stylePack ? "已按新风格重新生成方案" : "已重新生成方案");
    } finally { setBusy(false); }
  }
  async function createDeckPpt() {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeDeckRun.id}/ppt`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "PPT 生成失败");
      setDeckRun(result.run);
      notify(result.run.status === "ppt_ready" ? "PPT 已生成" : "已进入 PDF 转 PPT 队列");
    } finally { setBusy(false); }
  }
  async function regenerateDeckSlide(slideId: string, action: DeckRegenerateAction) {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeDeckRun.id}/slides/${slideId}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "页面重生失败");
      if (result.run) setDeckRun(result.run);
      else await loadDeckRuns();
      notify(action === "closer_previous" ? "已把上一页真实成图交给 Image2 作为风格参考" : "已重新生成本页");
    } finally { setBusy(false); }
  }
  async function confirmPolishRun() {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs/${activePolishRun.id}/confirm`, { method: "POST" });
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "确认美化方案失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify("已确认方案，后台开始生成逐页预览图。");
    } finally { setBusy(false); }
  }
  async function createPolishPpt() {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs/${activePolishRun.id}/ppt`, { method: "POST" });
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "PPT 转化失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify(result.run.status === "ppt_ready" ? "PPT 已生成" : "已进入 PDF / Codia 转化队列");
    } finally { setBusy(false); }
  }
  async function regeneratePolishSlide(slideIndex: number, action: "reroll" | "closer_previous") {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs/${activePolishRun.id}/slides/${slideIndex}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "页面重生失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify(action === "closer_previous" ? "已按上一页风格重生本页" : "已重新生成本页");
    } finally { setBusy(false); }
  }
  async function retryPolishRun() {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs/${activePolishRun.id}/retry`, { method: "POST" });
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "继续生成失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify("已继续生成未完成页面。");
    } finally { setBusy(false); }
  }
  async function cancelRun() {
    if (!activeRun) return;
    const response = await fetch(`/api/employee/services/${service.id}/design-agent/runs/${activeRun.id}/cancel`, { method: "POST" });
    const result = await response.json();
    if (!response.ok) return notify(result.error || "任务取消失败");
    await loadRuns();
  }
  async function applyRun() {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/design-agent/runs/${activeRun.id}/apply`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "写入 PPT 失败");
      notify(`已在文稿末尾新增第 ${result.slideNumber} 页可编辑美化页`);
      await refresh(true); await loadRuns();
      openEditor(result.slideNumber);
    } finally { setBusy(false); }
  }
  function openExplode() { notify("智能模式已停用旧图片炸开入口"); }
  const plan = safeJson(activeRun?.layoutPlan || "{}", {}) as { title?: string; subtitle?: string; palette?: string[]; body?: string[]; assetFiles?: Record<string, unknown>; qa?: { status?: string; message?: string } };
  const batches = Array.isArray((plan as { batches?: unknown }).batches) ? (plan as { batches: Array<{ assetFiles?: Record<string, unknown>; qa?: { status?: string; message?: string } }> }).batches : [];
  const assetFiles = plan.assetFiles && typeof plan.assetFiles === "object" ? plan.assetFiles : {};
  const selectedBatchIndex = typeof assetFiles.batchIndex === "number" ? assetFiles.batchIndex : 0;
  const preview = activeRun?.generatedJob?.images[0];
  const masterImageId = typeof assetFiles.masterImageId === "string" ? assetFiles.masterImageId : activeRun?.selectedImageId || preview?.id || "";
  const cleanBackgroundImageId = typeof assetFiles.cleanBackgroundImageId === "string" ? assetFiles.cleanBackgroundImageId : "";
  const reconstructionRunId = typeof assetFiles.reconstructionRunId === "string" ? assetFiles.reconstructionRunId : "";
  const reconstructionStatus = typeof assetFiles.reconstructionStatus === "string" ? assetFiles.reconstructionStatus : "";
  const reconstructionReady = activeRun?.status === "completed" && reconstructionStatus === "completed" && Boolean(reconstructionRunId);
  const qaNeedsReview = Boolean(assetFiles.qaNeedsReview) || plan.qa?.status === "needs-review";
  const activeDesignEvents = activeRun?.events || [];
  async function selectBatch(index: number) {
    if (!activeRun || index === selectedBatchIndex) return;
    const response = await fetch(`/api/employee/services/${service.id}/design-agent/runs/${activeRun.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedBatchIndex: index }) });
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "候选切换失败");
    setActiveRun(result.run);
    setRuns(current => current.map(item => item.id === result.run.id ? result.run : item));
  }

  return <main className="design-studio">
    <aside className={"design-material-drawer " + (drawerOpen ? "open" : "")}>{drawerOpen && <><header><div><ImagePlus/><span><b>设计素材</b><small>我的素材库</small></span></div><button onClick={() => setDrawerOpen(false)}><ChevronLeft/></button></header><div className="design-material-grid">{mineMaterials.map(item => <button key={item.id} className={selectedMaterials.includes(item.image.id) ? "selected" : ""} onClick={() => toggleMaterial(item.image.id)}><img src={generatedImageUrl(item.image.id)} alt="参考素材"/><i>{selectedMaterials.includes(item.image.id) ? "已选" : "选择"}</i></button>)}</div></>} {!drawerOpen && <button className="design-drawer-open" onClick={() => setDrawerOpen(true)}><ImagePlus/>素材</button>}</aside>
    <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { addFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }}/>
    <section className="design-board"><header><button onClick={back}><ChevronLeft/>返回 PPT 编辑</button><span>WZLCF · INTELLIGENT SLIDE DESIGN</span><h1>将想法变为产品</h1></header>{activePolishRun ? <PolishInlineRun service={service} run={activePolishRun} busy={busy} workerWarning={polishWorkerWarning} onBack={editPolishPlan} onConfirm={() => void confirmPolishRun()} onCreatePpt={() => void createPolishPpt()} onRegenerate={(slideIndex, action) => void regeneratePolishSlide(slideIndex, action)} onRetry={() => void retryPolishRun()} onPreview={setPreviewImage}/> : activeDeckRun ? <DeckGenerationRunPanel service={service} run={activeDeckRun} busy={busy} onRunUpdate={setDeckRun} onConfirm={() => void confirmDeckRun()} onReplan={(stylePack) => void replanDeckRun(stylePack)} onCreatePpt={() => void createDeckPpt()} onRegenerate={(slideId, action) => void regenerateDeckSlide(slideId, action)} onPreview={setPreviewImage} /> : activeRun ? <section className="design-run"><div className="design-run-head"><div><span className={`design-status ${activeRun.status}`}>{activeRun.status === "completed" ? "方案已完成" : activeRun.status === "failed" ? "任务失败" : activeRun.status === "cancelled" ? "已取消" : "正在设计"}</span><h2>{activeRun.brief}</h2><small>{new Date(activeRun.createdAt).toLocaleString("zh-CN")}</small></div><div>{["queued", "running"].includes(activeRun.status) && <button onClick={() => void cancelRun()}>取消任务</button>}{activeRun.status === "completed" && <button className="design-apply" disabled={busy || (!activeRun.appliedAt && !reconstructionReady)} onClick={() => void applyRun()}>{activeRun.appliedAt ? "同步并打开 PPT" : <><Save/>{!reconstructionReady ? "等待拆图完成" : qaNeedsReview ? "重建需确认，仍可导入" : "新增可编辑重建页"}</>}</button>}</div></div><div className="design-stage-list">{activeDesignEvents.map(event => <article key={event.id} className={event.status}><b>{stageLabel(event.stage)}</b><span>{event.detail || "处理中"}</span></article>)}</div>{activeRun.status === "completed" && <div className={qaNeedsReview ? "auto-explode-status warning" : "auto-explode-status completed"}><div><b>{reconstructionReady ? "图片炸开已自动完成" : "图片炸开正在自动处理"}</b><span>{plan.qa?.message || "完整样片只作为预览和拆解真值；新增 PPT 会使用干净背景 + 独立透明部件。"}</span></div><button onClick={openExplode}>{reconstructionReady ? "查看并选择部件" : "打开图片炸开页"}</button></div>}{activeRun.error && <div className="design-error">{activeRun.error}</div>}{workerWarning && ["queued", "running"].includes(activeRun.status) && <div className="design-error">{workerWarning}</div>}<div className="design-result-grid master-rebuild"><article className="design-preview"><span>完整样片</span>{masterImageId ? <button className="design-preview-open" onClick={() => setPreviewImage({ url: generatedImageUrl(masterImageId), title: "完整样片" })}><img src={generatedImageUrl(masterImageId)} alt="完整 PPT 样片"/><i><Maximize2/>点击放大</i></button> : <div><LoaderCircle className="spin"/><p>正在生成完整样片…</p></div>}</article><article className="design-preview"><span>干净背景</span>{cleanBackgroundImageId ? <button className="design-preview-open" onClick={() => setPreviewImage({ url: generatedImageUrl(cleanBackgroundImageId), title: "干净背景" })}><img src={generatedImageUrl(cleanBackgroundImageId)} alt="干净背景"/><i><Maximize2/>点击放大</i></button> : <div><LoaderCircle className="spin"/><p>正在生成干净背景…</p></div>}</article><article className="design-preview"><span>拆解重建预览</span>{reconstructionReady ? <button className="design-preview-open" onClick={() => setPreviewImage({ url: `/api/employee/services/${service.id}/image-explode/runs/${reconstructionRunId}/reconstruction`, title: "拆解重建预览" })}><img src={`/api/employee/services/${service.id}/image-explode/runs/${reconstructionRunId}/reconstruction`} alt="拆解重建预览"/><i><Maximize2/>点击放大</i></button> : <div><LoaderCircle className="spin"/><p>等待 OpenAI 零件拆解与佐糖二次抠图…</p></div>}</article><article className="design-layout"><span>重建策略</span><h3>{plan.title || "以完整样片为真值"}</h3><p>{plan.subtitle || "不再由系统额外生成丑文字；样片里有什么，就拆什么。"}</p><div>{(plan.palette || []).map(color => <i key={color} style={{ background: color }}/>)}</div><ul><li>完整样片只用于预览、拆解与 QA。</li><li>最终 PPT 底层使用 OpenAI 二次生成的干净背景。</li><li>标题艺术字默认保留原始 PNG 字效，普通文字可选 OCR。</li></ul><small>如果重建 QA 提示风险，建议先点“查看并选择部件”确认后再导入。</small></article></div></section> : <section className="design-empty"><WandSparkles/><h2>从右下角数字人开始</h2><p>选择文生图、生成 PPT 或美化 PPT，提交后可在这里追踪每一步。</p></section>}</section>
    <div ref={historyRef} className="design-run-history">{[...deckRuns.map(run => ({ kind: "deck" as const, run, createdAt: run.createdAt })), ...polishRuns.map(run => ({ kind: "polish" as const, run, createdAt: run.createdAt })), ...runs.map(run => ({ kind: "image" as const, run, createdAt: run.createdAt }))].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8).map(item => item.kind === "deck" ? <button key={`deck-${item.run.id}`} className={activeDeckRun?.id === item.run.id && !activePolishRun ? "active" : ""} onClick={() => { setActiveRun(null); setActivePolishRun(null); setDeckRun(item.run); }}><span>生成 PPT</span><b>{item.run.projectName}</b><small>{deckStatusText(item.run.status)}</small></button> : item.kind === "polish" ? <button key={`polish-${item.run.id}`} className={activePolishRun?.id === item.run.id ? "active" : ""} onClick={() => { setActiveRun(null); setActiveDeckRun(null); setActivePolishRun(item.run); }}><span>美化 PPT</span><b>{item.run.sourceName}</b><small>{deckStatusText(item.run.status)}</small></button> : <button key={`image-${item.run.id}`} className={activeRun?.id === item.run.id && !activeDeckRun && !activePolishRun ? "active" : ""} onClick={() => { setActivePolishRun(null); setActiveDeckRun(null); setActiveRun(item.run); }}><span>{item.run.generationMode === "mixed" ? "混合" : "文生图"}</span><b>{item.run.brief}</b><small>{item.run.status}</small></button>)}</div>
    {batches.length > 1 && <div className="design-batch-picker">{batches.map((batch, index) => <button key={index} className={selectedBatchIndex === index ? "active" : ""} disabled={!batch.assetFiles?.reconstructionRunId} onClick={() => void selectBatch(index)}>第 {index + 1} 份</button>)}</div>}
    <div className="design-mentor"><button className="design-mentor-avatar" onClick={() => setMentorOpen(value => !value)} aria-label="打开 PPT 智能模式"><img src="/agent/ppt-design-mentor.png" alt="PPT 智能模式数字人"/></button>{mentorOpen && <section className="design-mentor-large-panel"><header><div><b>小 W · PPT 智能模式</b><span>选择任务类型，按当前工作流继续生成</span></div><button onClick={() => setMentorOpen(false)} aria-label="关闭智能模式"><X/></button></header><div className="design-tool-tabs"><button className={mentorTool === "deck" ? "active" : ""} onClick={() => setMentorTool("deck")}><FileText/><span><b>生成 PPT</b><small>整套文稿规划</small></span></button><button className={mentorTool === "polish" ? "active" : ""} onClick={() => setMentorTool("polish")}><WandSparkles/><span><b>美化 PPT</b><small>优化当前文稿</small></span></button><button className={mentorTool === "image" ? "active" : ""} onClick={() => setMentorTool("image")}><ImagePlus/><span><b>生图</b><small>生成 16:9 PNG</small></span></button></div>{mentorTool === "deck" && <DeckGenerationForm service={service} notify={notify} onCreated={(run) => { setDeckRun(run); setMentorOpen(false); }}/>} {mentorTool === "polish" && <section className="deck-generation-form"><label>美化范围<select defaultValue="current"><option value="current">当前文稿</option><option value="all">整套 PPT</option><option value="selected">指定页面</option></select></label><label>风格方向<select defaultValue="blue-gold-tech">{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>修改要求<textarea value={polishRequirement} onChange={event => setPolishRequirement(event.target.value)} placeholder="例如：更像发布会、减少文字、强化科技感、统一页眉页脚和图标风格。"/></label><button type="button" onClick={() => notify("美化 PPT 入口已恢复，真实重绘链路暂不自动启动。")}><WandSparkles/>即将接入</button></section>}{mentorTool === "image" && <section className="deck-generation-form"><div className="design-mode"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><Bot/><span>文生图<small>不把参考图交给 OpenAI</small></span></button><button className={mode === "mixed" ? "active" : ""} onClick={() => setMode("mixed")}><ImagePlus/><span>混合模式<small>主参考与提示词直给 OpenAI</small></span></button></div><label>生成要求<textarea value={brief} onChange={event => setBrief(event.target.value)} placeholder="例如：将这一页做成深蓝科技发布会风格，突出列车底盘巡检机器人，保留未来感与大片留白…"/></label>{selectedCount > 0 && <div className="design-reference-strip">{selectedMaterialItems.map(item => <button key={item.id} className={primaryKey === `material:${item.image.id}` ? "primary" : ""} onClick={() => setPrimaryKey(`material:${item.image.id}`)}><img src={generatedImageUrl(item.image.id)} alt="素材参考"/><span>主参考</span></button>)}{localReferences.map(item => <button key={item.id} className={primaryKey === `local:${item.id}` ? "primary" : ""} onClick={() => setPrimaryKey(`local:${item.id}`)}><img src={item.previewUrl} alt={item.file.name}/><span onClick={event => { event.stopPropagation(); removeLocal(item.id); }}><X/></span></button>)}</div>}<div className="design-mentor-actions"><button type="button" onClick={() => fileRef.current?.click()} disabled={selectedCount >= 6}><Upload/>上传参考图</button><label>生成<select value={batchCount} onChange={event => setBatchCount(Number(event.target.value))}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} 份</option>)}</select></label><button type="button" className="design-start-inline" onClick={() => void createRun()} disabled={busy || !brief.trim()}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}开始生成</button></div></section>}</section>}</div>
    {mentorOpen && mentorTool === "polish" && <section className="design-mentor-large-panel polish-only-panel">
      <header><div><b>小 W · PPT 智能模式</b><span>先整理美化方案，再进入逐页重绘工作流</span></div><button onClick={() => setMentorOpen(false)} aria-label="关闭智能模式"><X/></button></header>
      <div className="design-tool-tabs">
        <button onClick={() => setMentorTool("deck")}><FileText/><span><b>生成 PPT</b><small>整套文稿规划</small></span></button>
        <button className={mentorTool === "polish" ? "active" : ""} onClick={() => setMentorTool("polish")}><WandSparkles/><span><b>美化 PPT</b><small>逐页重绘方案</small></span></button>
        <button onClick={() => setMentorTool("image")}><ImagePlus/><span><b>生图</b><small>生成 16:9 PNG</small></span></button>
      </div>
      <PolishPptPlanner key={polishDraftRun?.id || "new-polish-plan"} service={service} note={polishRequirement} setNote={setPolishRequirement} notify={notify} initialRun={polishDraftRun} onRunCreated={run => { setPolishDraftRun(null); setPolishRun(run); }} onRunsLoaded={syncPolishRuns}/>
    </section>}
    {previewImage && <ExplodeImagePreview image={previewImage} onClose={() => setPreviewImage(null)}/>}
  </main>;
}

function PolishInlineRun({ service, run, busy, workerWarning, onBack, onConfirm, onCreatePpt, onRegenerate, onRetry, onPreview }: {
  service: Service;
  run: PptPolishRun;
  busy: boolean;
  workerWarning?: string;
  onBack: () => void;
  onConfirm: () => void;
  onCreatePpt: () => void;
  onRegenerate: (slideIndex: number, action: "reroll" | "closer_previous") => void;
  onRetry: () => void;
  onPreview: (image: { url: string; title: string }) => void;
}) {
  const done = run.slides?.filter(slide => slide.status === "completed").length || 0;
  const total = run.pageCount || run.slides?.length || 0;
  const workerBlocked = Boolean(workerWarning && ["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(run.status));
  const statusText = workerBlocked ? "等待 Worker 启动" : deckStatusText(run.status);
  const styleLabel = deckStylePacks.find(item => item.id === run.stylePack)?.label || run.stylePack;
  const pdfUrl = `/api/employee/services/${service.id}/ppt-polish/runs/${run.id}/pdf`;
  const pptUrl = `/api/employee/services/${service.id}/ppt-polish/runs/${run.id}/ppt`;
  const optionLabels = [
    ["keepText", "保留原文字"],
    ["keepNumbers", "保留数字信息"],
    ["mainColor", "主色统一"],
    ["headerFooter", "页眉页脚统一"],
    ["backgroundTexture", "背景质感统一"],
    ["cardStyle", "卡片样式统一"],
    ["decorativeElements", "装饰元素统一"],
    ["reduceText", "减少文字密度"]
  ].filter(([key]) => run.options?.[key]).map(([, label]) => label);
  return <section className="design-run design-deck-run polish-inline-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{statusText}</span>
        <h2>{run.sourceName}</h2>
        <small>{styleLabel} · {total ? `${done}/${total} 页` : `${run.pageNotes?.length || 0} 条页级要求`} · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      <div>
        {run.status === "plan_ready" && <><button className="design-secondary polish-plan-back" onClick={onBack} disabled={busy}><ChevronLeft/>返回修改</button><button className="design-apply" onClick={onConfirm} disabled={busy}>确认生成</button></>}
        {run.status === "failed" && run.slides?.length > 0 && <button className="design-apply" onClick={onRetry} disabled={busy}>继续生成</button>}
        {["review_ready", "pdf_ready"].includes(run.status) && <button className="design-apply" onClick={onCreatePpt} disabled={busy}>转化 PPT</button>}
        {run.pdfStoredName && <a className="design-secondary" href={pdfUrl}><Download/>下载 PDF</a>}
        {run.status === "ppt_ready" && run.pptStoredName && <a className="design-apply" href={pptUrl}><Download/>下载 PPTX</a>}
      </div>
    </div>
    {run.error && <div className="design-error">{run.error}</div>}
    {workerBlocked && <div className="design-error">{workerWarning}</div>}
    <section className="deck-plan-review inline polish-plan-review">
      <article>
        <span>美化方案</span>
        <h3>{styleLabel}</h3>
        <p>{run.note || "按当前文稿内容进行整体视觉统一、版面优化和逐页重绘。"}</p>
        <div className="polish-plan-tags">{optionLabels.map(label => <i key={label}>{label}</i>)}</div>
      </article>
      <article>
        <span>逐页修改清单</span>
        {run.pageNotes?.length ? <ol>{run.pageNotes.map(item => <li key={item.id}><b>第 {item.pages} 页</b><small>{item.note}</small></li>)}</ol> : <p>暂无单页特殊要求，将按整套修改方向统一处理。</p>}
      </article>
    </section>
    {["generating", "review_ready", "pdf_queued", "pdf_ready", "ppt_queued", "ppt_processing", "ppt_ready", "failed"].includes(run.status) && run.slides?.length > 0 && <section className="deck-slide-review inline polish-slide-review">
      <div className="deck-progress"><b>{done}/{total || "?"}</b><span>{statusText}</span></div>
      <div className="deck-slide-grid">{(run.slides || []).map(slide => {
        const canRegenerate = ["completed", "failed"].includes(slide.status) && !["pdf_queued", "ppt_queued", "ppt_processing"].includes(run.status);
        const slidePending = ["queued", "waiting", "generating"].includes(slide.status);
        return <article key={slide.slideIndex}>
        <header><b>{slide.title || `第 ${slide.slideIndex} 页`}</b><span>{slide.status}</span></header>
        <button className="deck-slide-preview" disabled={!slide.storedName} onClick={() => slide.storedName && onPreview({ url: `/api/employee/services/${service.id}/ppt-polish/runs/${run.id}/slides/${slide.slideIndex}/image?v=${encodeURIComponent(slide.updatedAt)}`, title: slide.title || `第 ${slide.slideIndex} 页` })}>{slide.storedName ? <img src={`/api/employee/services/${service.id}/ppt-polish/runs/${run.id}/slides/${slide.slideIndex}/image?v=${encodeURIComponent(slide.updatedAt)}`} alt={slide.title}/> : <><LoaderCircle className={!workerBlocked && slidePending ? "spin" : ""}/><span>{workerBlocked ? "等待 Worker" : slide.status}</span></>}</button>
        {slide.note && <p>{slide.note}</p>}
        {slide.error && <p>{slide.error}</p>}
        <footer><button onClick={() => onRegenerate(slide.slideIndex, "reroll")} disabled={busy || !canRegenerate}>重新生成本页</button><button onClick={() => onRegenerate(slide.slideIndex, "closer_previous")} disabled={busy || !canRegenerate}>更贴近上一页</button></footer>
      </article>;
      })}</div>
    </section>}
  </section>;
}











// API routes should always return JSON, but development hot reload can briefly
// return an empty 500 response. This keeps the employee UI recoverable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responseJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}），请刷新或重启开发服务后重试。` };
  try { return JSON.parse(text); } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）。` }; }
}











function statusSlug(status: string) {
  return ({ "待开始": "waiting", "制作中": "making", "待客户确认": "confirm", "修改中": "revision", "已完成": "done" } as Record<string, string>)[status] || "making";
}

