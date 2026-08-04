"use client";
/* eslint-disable @next/next/no-img-element */

import Image from "next/image";
import Link from "next/link";
import {
  Activity, ArrowRight, Bot, BriefcaseBusiness, Check, ChevronLeft,
  ChevronRight, Clipboard, Download, FileText, ImagePlus, LayoutDashboard, LoaderCircle,
  LogOut, MessageCircle, Monitor, Paperclip, Save, Scissors, Send,
  Maximize2, QrCode, RefreshCw, School, Settings, ShieldCheck, Sparkles, Trash2, Upload,
  UserCheck, UserCog, Users, UserX, WandSparkles, X
} from "lucide-react";
import { CSSProperties, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { techszImageToolById, techszImageTools, type TechszImageToolId } from "@/lib/techsz-image-tools";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";

type EmployeeFeature =
  "orders" | "customerMessages" | "team" | "officeEditor" | "aiAssistant" |
  "smartPpt" | "materials" | "imageTools" | "exports";
type EmployeePermissions = Record<EmployeeFeature, boolean>;
type EmployeeMembership = {
  id: string; organizationId: string; identityProvider: string; externalUserId: string; unionId: string;
  role: string; status: string;
  permissionsJson: string; departmentIdsJson: string; position: string; avatarUrl: string;
  lastLoginAt: string | null; loginCount: number; createdAt: string; updatedAt: string;
  organization: { id: string; slug: string; name: string; enabled: boolean };
};
type Employee = {
  id: string; code: string; name: string; phone: string | null; isAdmin: boolean; enabled: boolean; createdAt: string;
  membership: EmployeeMembership;
  permissions: EmployeePermissions;
};
type Attachment = { id: string; originalName: string; storedName?: string; size: number };
type Message = {
  id: string; role: string; content: string; createdAt: string; attachments: Attachment[];
  employee?: { id: string; name: string } | null;
};
type Consultation = {
  id: string; number: string; budget: string; selectedBudgets?: string; isCustomerGroup?: boolean; status: string; updatedAt: string;
  user: { phone: string }; services: { id: string; number: string; title: string }[]; messages: Message[];
};
type GeneratedImage = {
  id: string; isMaterial: boolean; materialOrder: number; createdAt: string;
};
type DeckGenerationSlide = {
  id: string; slideIndex: number; title: string; role: string; storedName?: string | null; status: string; error?: string | null;
  regenerationCount: number; updatedAt: string; specJson?: string;
};
type DeckGenerationSource = {
  id: string; kind: string; originalName: string; size: number; status: string; extractedText?: string; error?: string | null;
};
type DeckPageBlock = {
  id: string; subtitle: string; instruction: string; constraintMode: "exact" | "polish" | "direction"; content?: string; evidenceIds?: string[];
};
type DeckGenerationPagePlan = {
  id: string; pageIndex: number; title: string; role: string; purpose: string; blocksJson: string; mustIncludeJson: string;
  conclusion: string; density: "sparse" | "standard" | "compact"; layoutType: string; constraintMode: string;
  evidenceJson: string; warningsJson: string; locked: boolean;
};
type DeckPageDraft = {
  pageIndex: number; title: string; role: string; purpose: string; blocks: DeckPageBlock[]; mustInclude: string[];
  conclusion: string; density: "sparse" | "standard" | "compact"; layoutType: string; constraintMode: string;
  evidence: { id?: string; file?: string; source?: string; locator?: string; content?: string }[]; warnings: string[]; locked: boolean;
};

type DeckGenerationRun = {
  id: string; kind?: string; status: string; generationMode?: "quick" | "advanced"; projectName: string; projectType: string; brief: string; pageCount: number; stylePack: string;
  unityOptionsJson: string; outlineJson: string; visualIdentityJson: string; visualStoryboardJson: string; slideImageSpecsJson: string;
  referenceText?: string; paletteMode?: "preset" | "reference"; paletteContractJson?: string; analysisSummaryJson?: string; sourceCount?: number;
  pdfStoredName?: string | null; pptStoredName?: string | null; coverStoredName?: string | null; error?: string | null; createdAt: string; updatedAt: string;
  slides: DeckGenerationSlide[]; sources?: DeckGenerationSource[]; pagePlans?: DeckGenerationPagePlan[];
};
type GenerationJob = {
  id: string; prompt: string; status: string; error?: string | null; createdAt: string; provider?: string; model?: string;
  employee: { id?: string; name: string }; images: GeneratedImage[];
};
type MaterialImage = GeneratedImage & {
  job: GenerationJob;
};
type MaterialItem = {
  id: string; materialOrder: number; createdAt: string;
  employee: { id: string; name: string };
  image: MaterialImage;
};
type AiMessage = {
  id: string; role: string; content: string; provider: string; model: string; createdAt: string;
};
type AiModelOption = {
  id: string; provider: string; model: string; label: string; available: boolean; default?: boolean;
};
type AiServiceHealth = {
  ok: boolean; configured: boolean; serviceName: string; baseUrl: string; model: string;
  proxyConfigured: boolean; error?: string; apiMode?: string; size?: string; supportsEdits?: boolean;
};
type OpenAiHealth = { ok: boolean; error?: string; text?: AiServiceHealth; image?: AiServiceHealth };
type TrackedImageJob = GenerationJob & { requestedAt?: string };
type DesignAgentReference = { id: string; source: string; label: string; isPrimary: boolean; sortOrder: number; generatedImage?: GeneratedImage | null };
type DesignAgentEvent = { id: string; stage: string; status: string; detail: string; createdAt: string };
type DesignAgentEvaluation = { id: string; stage: string; status: string; totalScore: number; scoresJson: string; reasonsJson: string; candidateId?: string | null; createdAt: string };
type DesignAgentRun = {
  id: string; generationMode: "text" | "mixed"; status: string; brief: string; visionReport: string; layoutPlan: string; visualPrompt: string;
  error?: string | null; createdAt: string; appliedAt?: string | null; appliedSlideNumber?: number | null;
  workflowState?: string; qualityMode?: string; generationAttempts?: number; generationBudget?: number; selectedImageId?: string | null;
  references?: DesignAgentReference[]; events?: DesignAgentEvent[]; evaluations?: DesignAgentEvaluation[]; generatedJob?: { id: string; images: GeneratedImage[] } | null;
};
type ImageExplodePart = { id: string; label: string; kind: string; variant: string; groupKey?: string | null; storedName?: string | null; refinedName?: string | null; textContent?: string | null; selected: boolean; confidence: number; zIndex: number; };
type ImageExplodeTextLayer = { id: string; content: string; groupKey?: string | null; rotation: number; styleJson: string; complexity: "simple" | "complex" | string; mode: "native" | "artwork" | "skip" | string; selected: boolean; confidence: number; };
type ImageExplodeEvent = { id: string; stage: string; status: string; detail: string; createdAt: string; };
type ImageExplodeRun = { id: string; status: string; error?: string | null; createdAt: string; appliedAt?: string | null; appliedSlideNumber?: number | null; reconstructionName?: string | null; qaReportJson?: string; backgroundStrategy?: string; cloudCleanupUsed?: boolean; needsReview?: boolean; parts?: ImageExplodePart[]; textLayers?: ImageExplodeTextLayer[]; events?: ImageExplodeEvent[]; sourceImage?: GeneratedImage | null; };
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
  consultation: (Consultation & { messages: Message[] }) | null; generationJobs: GenerationJob[]; materialItems: MaterialItem[];
};
type EmployeeData = {
  employee: Employee | null; employees: Employee[]; services: Service[]; consultations: Consultation[];
};

const emptyData: EmployeeData = { employee: null, employees: [], services: [], consultations: [] };
const navItems: { id: string; label: string; icon: typeof BriefcaseBusiness; feature?: EmployeeFeature }[] = [
  { id: "orders", label: "订单任务", icon: BriefcaseBusiness, feature: "orders" },
  { id: "messages", label: "客户消息", icon: MessageCircle, feature: "customerMessages" },
  { id: "team", label: "团队协作", icon: Users, feature: "team" },
  { id: "settings", label: "设置", icon: Settings }
];
const featureLabels: Record<EmployeeFeature, string> = {
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
const roleLabels: Record<string, string> = {
  platform_admin: "平台管理员",
  org_admin: "学校管理员",
  manager: "项目主管",
  designer: "设计师",
  reviewer: "审核员",
  member: "普通成员"
};
const rolePermissionDefaults: Record<string, EmployeePermissions> = {
  platform_admin: Object.fromEntries(Object.keys(featureLabels).map((feature) => [feature, true])) as EmployeePermissions,
  org_admin: Object.fromEntries(Object.keys(featureLabels).map((feature) => [feature, true])) as EmployeePermissions,
  manager: Object.fromEntries(Object.keys(featureLabels).map((feature) => [feature, true])) as EmployeePermissions,
  designer: {
    orders: true, customerMessages: false, team: true, officeEditor: true, aiAssistant: true,
    smartPpt: true, materials: true, imageTools: true, exports: true
  },
  reviewer: {
    orders: true, customerMessages: false, team: true, officeEditor: true, aiAssistant: false,
    smartPpt: false, materials: false, imageTools: false, exports: true
  },
  member: Object.fromEntries(Object.keys(featureLabels).map((feature) => [feature, false])) as EmployeePermissions
};
const statusOptions = ["待开始", "制作中", "待客户确认", "修改中", "已完成"];
const deckStylePacks = [
  { id: "blue-gold-tech", label: "蓝金科技" },
  { id: "white-green-tech", label: "白绿科技" },
  { id: "black-gold-business", label: "黑金商务" },
  { id: "blue-purple-ai", label: "蓝紫 AI" },
  { id: "red-white-government", label: "红白政企" },
  { id: "minimal-academic", label: "极简学术" },
  { id: "vivid-roadshow", label: "活力路演" }
];
const defaultDeckUnityOptions = {
  mainColor: true,
  headerFooter: true,
  backgroundTexture: true,
  cardStyle: false,
  decorativeElements: false
};

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

function canOpenEmployeeAdmin(employee: Employee) {
  return employee.isAdmin || ["platform_admin", "org_admin"].includes(employee.membership.role);
}

function canAssignOrders(employee: Employee) {
  return employee.isAdmin || ["platform_admin", "org_admin", "manager"].includes(employee.membership.role);
}

function identityProviderLabel(provider: string) {
  if (provider === "wechat") return "微信";
  if (provider === "wecom") return "企业微信";
  if (provider === "local") return "本地管理员";
  return "外部账号";
}

function compactIdentity(value: string) {
  if (value.length <= 20) return value;
  return `${value.slice(0, 9)}...${value.slice(-7)}`;
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

type AdminMember = {
  id: string; organizationId: string; organizationName: string;
  identityProvider: string; externalUserId: string; unionId: string;
  role: string; status: string; permissions: EmployeePermissions; position: string;
  avatarUrl: string; lastLoginAt: string | null; loginCount: number; createdAt: string;
  employee: {
    id: string; name: string; code: string; isAdmin: boolean;
    counts: { assignedServices: number; generationJobs: number; activities: number; deckGenerationRuns: number };
  };
};
type AdminOverview = {
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

function EmployeeAdmin({ employee, notify }: { employee: Employee; notify: (text: string) => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { role: string; status: string; permissions: EmployeePermissions }>>({});

  const loadOverview = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/employee/admin/overview", { cache: "no-store" });
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
    const response = await fetch(`/api/employee/admin/members/${member.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value)
    });
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

function Workspace({ service, employee, refresh, back, notify }: {
  service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; back: () => void; notify: (text: string) => void;
}) {
  const canManage = employee.permissions.orders && (
    employee.isAdmin ||
    ["platform_admin", "org_admin", "manager"].includes(employee.membership.role) ||
    service.assigneeId === employee.id
  );
  const [rightOpen, setRightOpen] = useState(employee.permissions.aiAssistant);
  const [workspaceMode, setWorkspaceMode] = useState<"editor" | "smart" | "design" | "explode">("editor");
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
    {workspaceMode === "smart" ? <SmartStudio service={service} notify={notify}/> : workspaceMode === "design" ? <DesignStudio service={service} employee={employee} refresh={refresh} notify={notify} back={() => setWorkspaceMode("editor")} openEditor={(slideNumber) => { setEditorRevision(value => value + 1); setWorkspaceMode("editor"); notify(`已新增第 ${slideNumber} 页，请在左侧缩略图最底部查看`); }} /> : workspaceMode === "explode" ? <ImageExplodeStudio service={service} refresh={refresh} notify={notify} back={() => setWorkspaceMode("editor")} openEditor={(slideNumber) => { setEditorRevision(value => value + 1); setWorkspaceMode("editor"); notify(`已新增第 ${slideNumber} 页零部件，请在左侧缩略图最底部查看`); }} /> : <>
      <main className="workspace-main"><section className="onlyoffice-stage">{service.workDocument ? <OnlyOfficeEditor documentId={service.workDocument.id} revision={editorRevision} refresh={refresh} notify={notify}/> : <div className="office-placeholder">正在创建空白工作文件...</div>}</section>{rightOpen && employee.permissions.aiAssistant && <AiPanel service={service} employee={employee} refresh={refresh} notify={notify}/>}</main>
      {workspaceMode === "editor" && employee.permissions.smartPpt && <button className="workspace-smart-mode" onClick={() => setWorkspaceMode("design")}><WandSparkles/>智能模式</button>}
      {employee.permissions.imageTools && <ImageToolsPanel service={service} employee={employee} refresh={refresh} notify={notify}/>}
      {employee.permissions.materials && <MaterialRail service={service} employee={employee} refresh={refresh} notify={notify}/>}
    </>}
  </div>;
}

type LocalDesignReference = { id: string; file: File; previewUrl: string; source: "upload" | "ppt" };
type PolishPageNote = { id: string; pages: string; note: string };
type PptPolishSlide = { slideIndex: number; title: string; originalText: string; note: string; status: string; storedName?: string; prompt?: string; lastInstruction?: string; error?: string; updatedAt: string };
type PptPolishRun = {
  id: string; status: string; sourceMode: "current" | "upload"; sourceName: string; stylePack: string; note: string;
  options: Record<string, boolean>; pageNotes: PolishPageNote[]; pageCount: number; slides: PptPolishSlide[];
  pdfStoredName?: string; pptStoredName?: string; coverStoredName?: string; confirmedAt?: string; error?: string; createdAt: string; updatedAt: string;
};

function PolishPptPlanner({ service, note, setNote, notify, initialRun, onRunCreated, onRunsLoaded }: {
  service: Service;
  note: string;
  setNote: (value: string) => void;
  notify: (text: string) => void;
  initialRun?: PptPolishRun | null;
  onRunCreated?: (run: PptPolishRun) => void;
  onRunsLoaded?: (runs: PptPolishRun[]) => void;
}) {
  const [sourceMode, setSourceMode] = useState<"current" | "upload">(initialRun?.sourceMode || (service.workDocument ? "current" : "upload"));
  const [stylePack, setStylePack] = useState(initialRun?.stylePack || "blue-gold-tech");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pageRange, setPageRange] = useState("");
  const [pageNote, setPageNote] = useState("");
  const [polishRuns, setPolishRuns] = useState<PptPolishRun[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pageNotes, setPageNotes] = useState<PolishPageNote[]>(() => initialRun
    ? initialRun.pageNotes.map(item => ({ ...item }))
    : [
      { id: "cover", pages: "1", note: "封面增强发布会主视觉，保留项目名称和关键信息" },
      { id: "content", pages: "2-5", note: "减少密集文字，重排为更清晰的图文结构" }
    ]);
  const [options, setOptions] = useState({
    keepText: true,
    keepNumbers: true,
    mainColor: true,
    headerFooter: true,
    backgroundTexture: true,
    cardStyle: false,
    decorativeElements: false,
    reduceText: true,
    ...(initialRun?.options || {})
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const latestPollingStatus = polishRuns[0]?.status || "";

  const loadPolishRuns = useCallback(async () => {
    const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs`, { cache: "no-store" });
    const result = await responseJson(response);
    if (response.ok) {
      const nextRuns = (result.runs || []) as PptPolishRun[];
      setPolishRuns(nextRuns);
      onRunsLoaded?.(nextRuns);
    }
  }, [onRunsLoaded, service.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPolishRuns(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPolishRuns]);
  useEffect(() => {
    if (!["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(latestPollingStatus)) return;
    const timer = window.setInterval(() => void loadPolishRuns(), 2400);
    return () => window.clearInterval(timer);
  }, [latestPollingStatus, loadPolishRuns]);

  function acceptPpt(file?: File) {
    if (!file) return;
    const name = file.name || "";
    const ok = /\.pptx$/i.test(name) || file.type === "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    if (!ok) return notify("请放入 PPTX 文件");
    if (file.size > workPresentationMaxBytes) return notify(`PPT 文件不能超过 ${workPresentationMaxLabel}`);
    setSelectedFileName(name);
    setSelectedFile(file);
    setSourceMode("upload");
  }

  function addPageNote() {
    const pages = pageRange.trim();
    const requirement = pageNote.trim();
    if (!pages || !requirement) return notify("请填写页码和这一页的修改想法");
    setPageNotes(current => [...current, { id: `${Date.now()}-${Math.random()}`, pages, note: requirement }]);
    setPageRange("");
    setPageNote("");
  }

  function toggleOption(key: keyof typeof options) {
    setOptions(current => ({ ...current, [key]: !current[key] }));
  }

  async function submitPolishPlan() {
    if (sourceMode === "current" && !service.workDocument) return notify("当前订单还没有工作文稿，请先上传 PPT");
    if (sourceMode === "upload" && !selectedFile) return notify("请先放入需要美化的 PPT 文件");
    if (!note.trim() && pageNotes.length === 0) return notify("请填写整套修改方向或逐页修改想法");
    const form = new FormData();
    form.append("sourceMode", sourceMode);
    form.append("stylePack", stylePack);
    form.append("note", note);
    form.append("options", JSON.stringify(options));
    form.append("pageNotes", JSON.stringify(pageNotes));
    if (sourceMode === "upload" && selectedFile) form.append("file", selectedFile);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/ppt-polish/runs`, { method: "POST", body: form });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "美化方案提交失败");
      const run = result.run as PptPolishRun;
      setPolishRuns(current => [run, ...current.filter(item => item.id !== run.id)].slice(0, 8));
      onRunCreated?.(run);
      notify("美化方案已保存，请确认后再开始逐页重绘。");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="deck-generation-form polish-planner">
    <div className="polish-form-grid">
      <label>美化来源<select value={sourceMode} onChange={event => setSourceMode(event.target.value as "current" | "upload")}><option value="current" disabled={!service.workDocument}>当前文稿</option><option value="upload">上传 PPT</option></select></label>
      <label>目标风格<select value={stylePack} onChange={event => setStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <div className={"polish-upload-zone " + (dragging ? "is-dragging" : "")}
      onClick={() => fileRef.current?.click()}
      onDragEnter={event => { event.preventDefault(); setDragging(true); }}
      onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={event => { event.preventDefault(); setDragging(false); acceptPpt(Array.from(event.dataTransfer.files || [])[0]); }}>
      <input ref={fileRef} hidden type="file" accept=".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={event => { acceptPpt(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/>
      {sourceMode === "current" && service.workDocument ? <FileText/> : <Upload/>}
      <b>{sourceMode === "current" && service.workDocument ? service.workDocument.originalName : selectedFileName || "拖入需要美化的 PPT"}</b>
      <span>{sourceMode === "current" && service.workDocument ? "将从当前工作文稿生成有序页面图。" : "支持点击选择或直接拖拽 PPTX。"}</span>
    </div>
    <label>整套修改方向<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="例如：更像发布会、减少文字、强化科技感、统一页眉页脚和图标风格。"/></label>
    <div className="polish-option-grid">
      <label><input type="checkbox" checked={options.keepText} onChange={() => toggleOption("keepText")}/>保留原文字</label>
      <label><input type="checkbox" checked={options.keepNumbers} onChange={() => toggleOption("keepNumbers")}/>保留数字信息</label>
      <label><input type="checkbox" checked={options.mainColor} onChange={() => toggleOption("mainColor")}/>主色统一</label>
      <label><input type="checkbox" checked={options.headerFooter} onChange={() => toggleOption("headerFooter")}/>页眉页脚统一</label>
      <label><input type="checkbox" checked={options.backgroundTexture} onChange={() => toggleOption("backgroundTexture")}/>背景质感统一</label>
      <label><input type="checkbox" checked={options.cardStyle} onChange={() => toggleOption("cardStyle")}/>卡片样式统一</label>
      <label><input type="checkbox" checked={options.decorativeElements} onChange={() => toggleOption("decorativeElements")}/>装饰元素统一</label>
      <label><input type="checkbox" checked={options.reduceText} onChange={() => toggleOption("reduceText")}/>减少文字密度</label>
    </div>
    <section className="polish-page-notes">
      <header><div><b>逐页修改想法</b><span>{pageNotes.length} 条页级要求</span></div></header>
      <div className="polish-page-note-editor"><input value={pageRange} onChange={event => setPageRange(event.target.value)} placeholder="页码，如 3 或 6-8"/><textarea value={pageNote} onChange={event => setPageNote(event.target.value)} placeholder="这一页怎么改，例如：把流程图改成三步时间线，减少底部小字。"/><button type="button" onClick={addPageNote}><Check/>添加</button></div>
      <div className="polish-page-note-list">{pageNotes.map(item => <article key={item.id}><b>第 {item.pages} 页</b><p>{item.note}</p><button type="button" onClick={() => setPageNotes(current => current.filter(noteItem => noteItem.id !== item.id))}><X/></button></article>)}</div>
    </section>
    <button type="button" disabled={submitting} onClick={submitPolishPlan}><WandSparkles/>{submitting ? "提交中..." : "生成美化方案"}</button>
  </section>;
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
  const [deckProjectName, setDeckProjectName] = useState(service.title);
  const [deckProjectType, setDeckProjectType] = useState("");
  const [deckPageCount, setDeckPageCount] = useState(12);
  const [deckStylePack, setDeckStylePack] = useState("blue-gold-tech");
  const [deckBrief, setDeckBrief] = useState("");
  const [deckReferenceText, setDeckReferenceText] = useState("");
  const [deckUnityOptions, setDeckUnityOptions] = useState({
    ...defaultDeckUnityOptions
  });
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
    const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs`, { cache: "no-store" });
    const result = await response.json();
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
  async function createDeckFromMentor() {
    if (!deckProjectName.trim()) return notify("请填写项目名称");
    if (!deckBrief.trim()) return notify("请填写项目简介");
    const form = new FormData();
    form.set("projectName", deckProjectName.trim());
    form.set("projectType", deckProjectType.trim());
    form.set("brief", deckBrief.trim());
    const materialSummary = selectedMaterialItems.length ? `素材库参考图：${selectedMaterialItems.length} 张，按当前选中素材的风格、色彩和版式气质统一参考。` : "";
    form.set("referenceText", [deckReferenceText.trim(), materialSummary].filter(Boolean).join("\n"));
    form.set("pageCount", String(deckPageCount));
    form.set("stylePack", deckStylePack);
    form.set("unityOptions", JSON.stringify(deckUnityOptions));
    localReferences.forEach(item => form.append("references", item.file));
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "生成方案创建失败");
      setDeckRun(result.run);
      setMentorOpen(false);
      notify("已开始生成大纲和视觉方案");
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
  async function regenerateDeckSlide(slideId: string, action: "reroll" | "closer_previous") {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeDeckRun.id}/slides/${slideId}/regenerate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "页面重生失败");
      if (result.run) setDeckRun(result.run);
      else await loadDeckRuns();
      notify(action === "closer_previous" ? "已按上一页风格重生本页" : "已重新生成本页");
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
    <div className="design-mentor"><button className="design-mentor-avatar" onClick={() => setMentorOpen(value => !value)} aria-label="打开 PPT 智能模式"><img src="/agent/ppt-design-mentor.png" alt="PPT 智能模式数字人"/></button>{mentorOpen && <section className="design-mentor-large-panel"><header><div><b>小 W · PPT 智能模式</b><span>选择任务类型，按当前工作流继续生成</span></div><button onClick={() => setMentorOpen(false)} aria-label="关闭智能模式"><X/></button></header><div className="design-tool-tabs"><button className={mentorTool === "deck" ? "active" : ""} onClick={() => setMentorTool("deck")}><FileText/><span><b>生成 PPT</b><small>整套文稿规划</small></span></button><button className={mentorTool === "polish" ? "active" : ""} onClick={() => setMentorTool("polish")}><WandSparkles/><span><b>美化 PPT</b><small>优化当前文稿</small></span></button><button className={mentorTool === "image" ? "active" : ""} onClick={() => setMentorTool("image")}><ImagePlus/><span><b>生图</b><small>生成 16:9 PNG</small></span></button></div>{mentorTool === "deck" && <DeckGenerationForm service={service} notify={notify} onCreated={(run) => { setDeckRun(run); setMentorOpen(false); }}/>} {false && mentorTool === "deck" && <section className="deck-generation-form"><label>项目名称<input value={deckProjectName} onChange={event => setDeckProjectName(event.target.value)}/></label><label>比赛类型 / 用途<input value={deckProjectType} onChange={event => setDeckProjectType(event.target.value)} placeholder="例如：创新创业大赛 / 商业计划书"/></label><div className="deck-page-slider"><label>PPT 页数</label><div><input type="range" min={2} max={20} value={deckPageCount} onChange={event => setDeckPageCount(Number(event.target.value))} style={{ "--range-progress": `${((deckPageCount - 2) / 18) * 100}%` } as CSSProperties}/><b>{deckPageCount}页</b></div></div><label>风格包<select value={deckStylePack} onChange={event => setDeckStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>项目简介<textarea value={deckBrief} onChange={event => setDeckBrief(event.target.value)} placeholder="描述项目背景、核心内容、目标受众和必须出现的信息。"/></label><label>参考资料摘要（可选）<textarea value={deckReferenceText} onChange={event => setDeckReferenceText(event.target.value)} placeholder="可粘贴评审要求、产品信息、客户资料；图片可拖到下面或点击上传。"/></label><div className="deck-reference-drop" onClick={() => fileRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files || [])); }}><Upload/><b>参考文档 / 参考图片</b><span>点击打开文件夹，或把图片拖到这里；也可以点击左侧素材加入参考。</span></div>{selectedCount > 0 && <div className="design-reference-strip deck-reference-strip">{selectedMaterialItems.map(item => <button key={item.id} className={primaryKey === `material:${item.image.id}` ? "primary" : ""} onClick={() => setPrimaryKey(`material:${item.image.id}`)}><img src={generatedImageUrl(item.image.id)} alt="素材参考"/><span onClick={event => { event.stopPropagation(); setSelectedMaterials(current => current.filter(id => id !== item.image.id)); }}>×</span></button>)}{localReferences.map(item => <button key={item.id} className={primaryKey === `local:${item.id}` ? "primary" : ""} onClick={() => setPrimaryKey(`local:${item.id}`)}><img src={item.previewUrl} alt={item.file.name}/><span onClick={event => { event.stopPropagation(); removeLocal(item.id); }}>×</span></button>)}</div>}<div className="deck-unity-options"><label><input type="checkbox" checked={deckUnityOptions.mainColor} onChange={event => setDeckUnityOptions(current => ({ ...current, mainColor: event.target.checked }))}/>主色统一</label><label><input type="checkbox" checked={deckUnityOptions.headerFooter} onChange={event => setDeckUnityOptions(current => ({ ...current, headerFooter: event.target.checked }))}/>页眉页脚统一</label><label><input type="checkbox" checked={deckUnityOptions.backgroundTexture} onChange={event => setDeckUnityOptions(current => ({ ...current, backgroundTexture: event.target.checked }))}/>背景纹理统一</label><label><input type="checkbox" checked={deckUnityOptions.cardStyle} onChange={event => setDeckUnityOptions(current => ({ ...current, cardStyle: event.target.checked }))}/>卡片样式统一</label><label><input type="checkbox" checked={deckUnityOptions.decorativeElements} onChange={event => setDeckUnityOptions(current => ({ ...current, decorativeElements: event.target.checked }))}/>装饰元素统一</label></div><button type="button" onClick={() => void createDeckFromMentor()} disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}生成方案</button></section>}{mentorTool === "polish" && <section className="deck-generation-form"><label>美化范围<select defaultValue="current"><option value="current">当前文稿</option><option value="all">整套 PPT</option><option value="selected">指定页面</option></select></label><label>风格方向<select defaultValue="blue-gold-tech">{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label>修改要求<textarea value={polishRequirement} onChange={event => setPolishRequirement(event.target.value)} placeholder="例如：更像发布会、减少文字、强化科技感、统一页眉页脚和图标风格。"/></label><button type="button" onClick={() => notify("美化 PPT 入口已恢复，真实重绘链路暂不自动启动。")}><WandSparkles/>即将接入</button></section>}{mentorTool === "image" && <section className="deck-generation-form"><div className="design-mode"><button className={mode === "text" ? "active" : ""} onClick={() => setMode("text")}><Bot/><span>文生图<small>不把参考图交给 OpenAI</small></span></button><button className={mode === "mixed" ? "active" : ""} onClick={() => setMode("mixed")}><ImagePlus/><span>混合模式<small>主参考与提示词直给 OpenAI</small></span></button></div><label>生成要求<textarea value={brief} onChange={event => setBrief(event.target.value)} placeholder="例如：将这一页做成深蓝科技发布会风格，突出列车底盘巡检机器人，保留未来感与大片留白…"/></label>{selectedCount > 0 && <div className="design-reference-strip">{selectedMaterialItems.map(item => <button key={item.id} className={primaryKey === `material:${item.image.id}` ? "primary" : ""} onClick={() => setPrimaryKey(`material:${item.image.id}`)}><img src={generatedImageUrl(item.image.id)} alt="素材参考"/><span>主参考</span></button>)}{localReferences.map(item => <button key={item.id} className={primaryKey === `local:${item.id}` ? "primary" : ""} onClick={() => setPrimaryKey(`local:${item.id}`)}><img src={item.previewUrl} alt={item.file.name}/><span onClick={event => { event.stopPropagation(); removeLocal(item.id); }}><X/></span></button>)}</div>}<div className="design-mentor-actions"><button type="button" onClick={() => fileRef.current?.click()} disabled={selectedCount >= 6}><Upload/>上传参考图</button><label>生成<select value={batchCount} onChange={event => setBatchCount(Number(event.target.value))}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} 份</option>)}</select></label><button type="button" className="design-start-inline" onClick={() => void createRun()} disabled={busy || !brief.trim()}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}开始生成</button></div></section>}</section>}</div>
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

type DeckRunActions = {
  service: Service;
  run: DeckGenerationRun;
  busy: boolean;
  onRunUpdate: (run: DeckGenerationRun) => void;
  onConfirm: () => void;
  onReplan: (stylePack?: string) => void;
  onCreatePpt: () => void;
  onRegenerate: (slideId: string, action: "reroll" | "closer_previous") => void;
  onPreview: (image: { url: string; title: string }) => void;
};

function parseDeckArray<T>(value?: string): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function parseDeckObject(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function deckPageDraft(page: DeckGenerationPagePlan): DeckPageDraft {
  return {
    pageIndex: page.pageIndex,
    title: page.title,
    role: page.role,
    purpose: page.purpose,
    blocks: parseDeckArray<DeckPageBlock>(page.blocksJson).map((block, index) => ({
      id: block.id || `block-${index + 1}`,
      subtitle: block.subtitle || "",
      instruction: block.instruction || "",
      constraintMode: block.constraintMode || "polish",
      content: block.content || "",
      evidenceIds: block.evidenceIds || []
    })),
    mustInclude: parseDeckArray<string>(page.mustIncludeJson),
    conclusion: page.conclusion,
    density: page.density,
    layoutType: page.layoutType,
    constraintMode: page.constraintMode,
    evidence: parseDeckArray<DeckPageDraft["evidence"][number]>(page.evidenceJson),
    warnings: parseDeckArray<string>(page.warningsJson),
    locked: page.locked
  };
}

function deckSourceStatusText(status: string) {
  return ({ queued: "等待读取", processing: "正在读取", completed: "读取完成", failed: "读取失败" } as Record<string, string>)[status] || status;
}

function DeckSourceSummary({ run }: { run: DeckGenerationRun }) {
  const sources = run.sources || [];
  if (!sources.length) return <section className="deck-source-summary empty"><FileText/><div><b>没有上传参考资料</b><span>本次会依据项目简介组织内容，不会虚构具体数字和事实。</span></div></section>;
  const completed = sources.filter(source => source.status === "completed").length;
  const failed = sources.filter(source => source.status === "failed").length;
  return <section className="deck-source-summary">
    <header><div><b>资料读取报告</b><span>{completed}/{sources.length} 份已读取{failed ? ` · ${failed} 份失败` : ""}</span></div></header>
    <div>{sources.map(source => {
      const pending = ["queued", "processing"].includes(source.status);
      return <article key={source.id} className={source.status}>{pending ? <LoaderCircle className="spin"/> : source.status === "completed" ? <Check/> : <X/>}<span><b>{source.originalName}</b><small>{deckSourceStatusText(source.status)}{source.error ? ` · ${source.error}` : ""}</small></span></article>;
    })}</div>
  </section>;
}


function DeckAdvancedPlanRun(props: DeckRunActions) {
  const { service, run, busy, onRunUpdate, onConfirm, onReplan } = props;
  const [drafts, setDrafts] = useState<DeckPageDraft[]>(() => (run.pagePlans || []).map(deckPageDraft));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [nextStylePack, setNextStylePack] = useState(run.stylePack);
  const isOutlineStep = run.status === "outline_ready";
  const isContentStep = run.status === "plan_ready";

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDrafts((run.pagePlans || []).map(deckPageDraft));
      setNextStylePack(run.stylePack);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [run.id, run.status, run.updatedAt, run.stylePack, run.pagePlans]);

  function updatePage(pageIndex: number, values: Partial<DeckPageDraft>) {
    setDrafts(current => current.map(page => page.pageIndex === pageIndex ? { ...page, ...values } : page));
  }

  function updateBlock(pageIndex: number, blockId: string, values: Partial<DeckPageBlock>) {
    setDrafts(current => current.map(page => page.pageIndex === pageIndex ? {
      ...page,
      blocks: page.blocks.map(block => block.id === blockId ? { ...block, ...values } : block)
    } : page));
  }

  function addBlock(pageIndex: number) {
    setDrafts(current => current.map(page => page.pageIndex === pageIndex ? {
      ...page,
      blocks: [...page.blocks, { id: `block-${Date.now()}`, subtitle: "", instruction: "", content: "", constraintMode: "polish", evidenceIds: [] }]
    } : page));
  }

  function removeBlock(pageIndex: number, blockId: string) {
    setDrafts(current => current.map(page => page.pageIndex === pageIndex ? { ...page, blocks: page.blocks.filter(block => block.id !== blockId) } : page));
  }

  function addPage() {
    if (drafts.length >= 30) return setMessage("最多 30 页");
    const pageIndex = drafts.length + 1;
    setDrafts(current => [...current, {
      pageIndex, title: `第 ${pageIndex} 页`, role: pageIndex === 1 ? "cover" : "insight", purpose: "", blocks: [],
      mustInclude: [], conclusion: "", density: "standard", layoutType: "auto", constraintMode: "polish", evidence: [], warnings: [], locked: false
    }]);
  }

  function removePage(pageIndex: number) {
    if (drafts.length <= 2) return setMessage("至少保留 2 页");
    setDrafts(current => current.filter(page => page.pageIndex !== pageIndex).map((page, index, all) => ({
      ...page,
      pageIndex: index + 1,
      role: index === 0 ? "cover" : index === all.length - 1 ? "ending" : page.role
    })));
  }

  async function savePages(action: "save" | "match" | "outline") {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${run.id}/pages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: drafts, action })
      });
      const result = await responseJson(response);
      if (!response.ok) {
        setMessage(result.error || "逐页方案保存失败");
        return false;
      }
      onRunUpdate(result.run as DeckGenerationRun);
      setMessage(action === "match" ? "结构已确认，正在按页查找资料" : action === "outline" ? "已返回结构调整" : "逐页内容已保存");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function confirmFinal() {
    if (!await savePages("save")) return;
    onConfirm();
  }

  async function changeStyle() {
    if (!await savePages("save")) return;
    onReplan(nextStylePack);
  }

  const waitingForSources = ["sources_queued", "source_processing"].includes(run.status);
  const waitingForMatch = ["matching_queued", "matching"].includes(run.status);
  return <section className="design-run design-deck-run deck-advanced-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{deckStatusText(run.status)}</span>
        <h2>{run.projectName}</h2>
        <small>高级版 · {run.pageCount} 页 · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      {isContentStep && <div><button className="design-apply" onClick={() => void confirmFinal()} disabled={busy || saving}>确认内容并生成预览</button></div>}
    </div>
    {run.error && <div className="design-error">{run.error}</div>}
    <DeckSourceSummary run={run}/>
    {waitingForSources && <section className="deck-waiting inline"><LoaderCircle className="spin"/><h3>正在逐份读取资料</h3><p>系统保留文件名、页码、幻灯片号和工作表位置。完成后先给你确认逐页结构，不会直接生成图片。</p></section>}
    {waitingForMatch && <section className="deck-waiting inline"><LoaderCircle className="spin"/><h3>正在按页匹配资料</h3><p>每一页只检索与你确认的标题和内容意图有关的证据，并记录原文件与位置；资料不足会明确标记。</p></section>}
    {(isOutlineStep || isContentStep) && <section className="deck-advanced-editor">
      <header>
        <div><span>{isOutlineStep ? "第一步" : "第二步"}</span><h3>{isOutlineStep ? "确认每一页讲什么" : "核对每一页用了哪些资料"}</h3><p>{isOutlineStep ? "标题、小标题、内容意图和页序都由你决定；确认后系统才开始按页取材。" : "可以修改系统整理的正文，证据标签会显示来源文件和位置。确认后才生成页面图片。"}</p></div>
        {isOutlineStep && <button type="button" onClick={addPage}><FileText/>增加一页</button>}
      </header>
      <div className="deck-page-editor-list">{drafts.map(page => <details key={page.pageIndex} className="deck-page-editor" open={page.pageIndex <= 2}>
        <summary><span>第 {page.pageIndex} 页</span><b>{page.title || "未命名页面"}</b><i>{page.density === "compact" ? "紧凑" : page.density === "sparse" ? "少文字" : "标准"}</i></summary>
        <div className="deck-page-editor-body">
          <div className="deck-page-fields">
            <label>页面大标题<input value={page.title} onChange={event => updatePage(page.pageIndex, { title: event.target.value })}/></label>
            <label>信息密度<select value={page.density} onChange={event => updatePage(page.pageIndex, { density: event.target.value as DeckPageDraft["density"] })}><option value="sparse">少文字 / 强视觉</option><option value="standard">标准汇报页</option><option value="compact">紧凑信息页</option></select></label>
            <label className="wide">这一页要解决什么问题<textarea value={page.purpose} onChange={event => updatePage(page.pageIndex, { purpose: event.target.value })}/></label>
            <label>版式偏好<input value={page.layoutType} onChange={event => updatePage(page.pageIndex, { layoutType: event.target.value })} placeholder="自动 / 数据看板 / 对比 / 时间轴"/></label>
            <label>页末结论<input value={page.conclusion} onChange={event => updatePage(page.pageIndex, { conclusion: event.target.value })} placeholder="这一页希望观众记住什么"/></label>
          </div>
          <section className="deck-block-list">
            <header><b>小标题与内容块</b><button type="button" onClick={() => addBlock(page.pageIndex)}><FileText/>增加内容块</button></header>
            {page.blocks.length ? page.blocks.map((block, blockIndex) => <article key={block.id} className="deck-block-editor">
              <div><span>{blockIndex + 1}</span><input value={block.subtitle} onChange={event => updateBlock(page.pageIndex, block.id, { subtitle: event.target.value })} placeholder="小标题"/><select value={block.constraintMode} onChange={event => updateBlock(page.pageIndex, block.id, { constraintMode: event.target.value as DeckPageBlock["constraintMode"] })}><option value="exact">原文保留</option><option value="polish">可压缩表达</option><option value="direction">只规定方向</option></select><button type="button" onClick={() => removeBlock(page.pageIndex, block.id)} aria-label="删除内容块"><Trash2/></button></div>
              <textarea value={isContentStep ? block.content || "" : block.instruction} onChange={event => updateBlock(page.pageIndex, block.id, isContentStep ? { content: event.target.value } : { instruction: event.target.value })} placeholder={isContentStep ? "从资料中整理出的正文，可在这里修改" : "写清楚这个小标题想讲什么，系统会据此去资料里查找"}/>
            </article>) : <p>这一页暂未规定小标题。可以保持整页主视觉，也可以增加内容块。</p>}
          </section>
          {isContentStep && <section className="deck-evidence-list">
            <b>本页资料依据</b>
            {page.evidence.length ? <div>{page.evidence.map((evidence, index) => <span key={evidence.id || index}><FileText/><b>{evidence.file || evidence.source || "参考资料"}</b><small>{evidence.locator || "未标注位置"}</small></span>)}</div> : <p>没有找到可靠依据。涉及数字、日期、人物和荣誉时请补充资料后重新匹配。</p>}
            {page.warnings.length > 0 && <ul>{page.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          </section>}
          <footer><label><input type="checkbox" checked={page.locked} onChange={event => updatePage(page.pageIndex, { locked: event.target.checked })}/>锁定本页内容</label>{isOutlineStep && drafts.length > 2 && <button type="button" onClick={() => removePage(page.pageIndex)}><Trash2/>删除本页</button>}</footer>
        </div>
      </details>)}</div>
      {message && <div className="deck-editor-message">{message}</div>}
      <footer className="deck-editor-actions">
        {isOutlineStep ? <><button className="design-secondary" onClick={() => void savePages("save")} disabled={saving}>保存草稿</button><button className="design-apply" onClick={() => void savePages("match")} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <Check/>}确认结构并匹配资料</button></> : <><label>生成风格<select value={nextStylePack} onChange={event => setNextStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className="design-secondary" onClick={() => void savePages("outline")} disabled={saving || busy}>返回调整结构</button><button className="design-secondary" onClick={() => void changeStyle()} disabled={saving || busy}>按新风格重整方案</button><button className="design-secondary" onClick={() => void savePages("match")} disabled={saving || busy}>重新匹配资料</button><button className="design-apply" onClick={() => void confirmFinal()} disabled={saving || busy}>确认内容并生成预览</button></>}
      </footer>
    </section>}
  </section>;
}

function DeckGenerationRunPanel(props: DeckRunActions) {
  const advancedPlanning = props.run.generationMode === "advanced" && ["sources_queued", "source_processing", "outline_ready", "matching_queued", "matching", "plan_ready"].includes(props.run.status);
  return advancedPlanning ? <DeckAdvancedPlanRun {...props}/> : <DeckInlineRun {...props}/>;
}


function DeckInlineRun({ service, run, busy, onRunUpdate, onConfirm, onReplan, onCreatePpt, onRegenerate, onPreview }: {
  service: Service;
  run: DeckGenerationRun;
  busy: boolean;
  onRunUpdate: (run: DeckGenerationRun) => void;
  onConfirm: () => void;
  onReplan: (stylePack?: string) => void;
  onCreatePpt: () => void;
  onRegenerate: (slideId: string, action: "reroll" | "closer_previous") => void;
  onPreview: (image: { url: string; title: string }) => void;
}) {
  const [nextStylePack, setNextStylePack] = useState(run.stylePack);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setNextStylePack(run.stylePack), 0);
    return () => window.clearTimeout(timer);
  }, [run.id, run.stylePack]);
  const done = run.slides.filter(slide => slide.status === "completed").length;
  const statusText = deckStatusText(run.status);
  const pptUrl = `/api/employee/services/${service.id}/deck-generation/runs/${run.id}/ppt`;
  const pdfUrl = `/api/employee/services/${service.id}/deck-generation/runs/${run.id}/pdf`;
  const imagesUrl = `/api/employee/services/${service.id}/deck-generation/runs/${run.id}/images`;
  const previewsReady = run.slides.length > 0 && run.slides.every(slide => slide.status === "completed" && Boolean(slide.storedName));
  const hasPdf = Boolean(run.pdfStoredName);
  const actionsBusy = busy || exportBusy;

  async function createPdf() {
    setExportBusy(true);
    setExportError("");
    try {
      const response = await fetch(pdfUrl, { method: "POST" });
      const result = await response.json();
      if (!response.ok) {
        setExportError(result.error || "PDF 生成失败");
        return;
      }
      onRunUpdate(result.run);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PDF 生成失败");
    } finally {
      setExportBusy(false);
    }
  }
  return <section className="design-run design-deck-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{statusText}</span>
        <h2>{run.projectName}</h2>
        <small>{run.generationMode === "advanced" ? "高级版" : "快速版"} · {deckStylePacks.find(item => item.id === run.stylePack)?.label || run.stylePack} · {run.pageCount} 页 · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      <div className="deck-export-actions">
        {run.status === "failed" && !hasPdf && <button className="design-apply" onClick={() => onReplan()} disabled={actionsBusy}>重新分析资料</button>}
        {run.status === "plan_ready" && <><button className="design-apply" onClick={onConfirm} disabled={actionsBusy}>确认生成</button><button className="design-secondary" onClick={() => onReplan()} disabled={actionsBusy}>重新生成方案</button><button className="design-secondary" onClick={() => onReplan(nextStylePack)} disabled={actionsBusy}>调整风格</button></>}
        {previewsReady && ["review_ready", "pdf_ready", "ppt_ready", "failed"].includes(run.status) && <a className="design-secondary" href={imagesUrl}><Download/>下载图组</a>}
        {run.status === "review_ready" && !hasPdf && <button className="design-secondary" onClick={() => void createPdf()} disabled={actionsBusy}>{exportBusy ? <LoaderCircle className="spin"/> : <FileText/>}生成 PDF</button>}
        {hasPdf && ["review_ready", "pdf_ready", "ppt_ready", "failed"].includes(run.status) && <a className="design-secondary" href={pdfUrl}><Download/>下载 PDF</a>}
        {["review_ready", "pdf_ready"].includes(run.status) && <button className="design-apply" onClick={onCreatePpt} disabled={actionsBusy}>生成 PPT</button>}
        {run.status === "failed" && hasPdf && <button className="design-apply" onClick={onCreatePpt} disabled={actionsBusy}>重试生成 PPT</button>}
        {run.status === "ppt_ready" && <a className="design-apply" href={pptUrl}><Download/>下载 PPT</a>}
      </div>
    </div>
    {run.error && <div className="design-error">{run.error}</div>}
    {exportError && <div className="design-error">{exportError}</div>}
    {["sources_queued", "source_processing", "queued", "planning", "confirmed"].includes(run.status) && <><DeckSourceSummary run={run}/><section className="deck-waiting inline"><LoaderCircle className="spin"/><h3>{["sources_queued", "source_processing"].includes(run.status) ? "正在读取并整理参考资料" : run.status === "confirmed" ? "方案已确认，正在安排页面生成" : "正在生成完整 PPT 方案"}</h3><p>{["sources_queued", "source_processing"].includes(run.status) ? "系统会保留文件名、页码、幻灯片号和工作表位置，再从可靠内容中组织方案。" : run.status === "confirmed" ? "页面预览将在这里逐张出现；确认之后仍可单页重新生成或要求贴近上一页。" : "快速版会自动组织页面结构、信息密度和视觉节奏；完成后仍由你确认，确认前不会生成图片。"}</p></section></>}
    {run.status === "plan_ready" && <><DeckSourceSummary run={run}/><section className="deck-plan-review inline deck-quick-plan"><article><span>快速版视觉方案</span><h3>{deckStylePacks.find(item => item.id === run.stylePack)?.label || run.stylePack}</h3><p>系统已自动整理内容结构与页面节奏。正文页允许标准或紧凑信息密度，避免只放几个空卡片；数字、日期和专名只采用已读取资料中的内容。</p><label className="deck-plan-style">调整风格<select value={nextStylePack} onChange={event => setNextStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></article><article><span>逐页方案</span><ol>{run.slides.map(slide => { const spec = parseDeckObject(slide.specJson); const density = String(spec.text_density || "medium"); const summary = String(spec.content_summary || ""); return <li key={slide.id}><b>{slide.title || `第 ${slide.slideIndex} 页`}</b><small>{slide.role || "content"} · {density === "high" ? "紧凑信息页" : density === "low" ? "少文字强视觉" : "标准信息页"}</small>{summary && <p>{summary}</p>}</li>; })}</ol></article></section></>}
    {["generating", "review_ready", "pdf_queued", "pdf_ready", "ppt_queued", "ppt_processing", "ppt_ready", "failed"].includes(run.status) && <section className="deck-slide-review inline"><div className="deck-progress"><b>{done}/{run.pageCount}</b><span>{statusText}</span></div><div className="deck-slide-grid">{run.slides.map(slide => {
      const canRegenerate = ["completed", "failed"].includes(slide.status);
      return <article key={slide.id}><header><b>{slide.title || `第 ${slide.slideIndex} 页`}</b><span>{slide.role || slide.status}</span></header><button className="deck-slide-preview" disabled={!slide.storedName} onClick={() => slide.storedName && onPreview({ url: `/api/employee/services/${service.id}/deck-generation/runs/${run.id}/slides/${slide.id}/image?v=${encodeURIComponent(slide.updatedAt)}`, title: slide.title || `第 ${slide.slideIndex} 页` })}>{slide.storedName ? <img src={`/api/employee/services/${service.id}/deck-generation/runs/${run.id}/slides/${slide.id}/image?v=${encodeURIComponent(slide.updatedAt)}`} alt={slide.title}/> : <><LoaderCircle className="spin"/><span>{slide.status}</span></>}</button>{slide.error && <p>{slide.error}</p>}<footer><button onClick={() => onRegenerate(slide.id, "reroll")} disabled={busy || !canRegenerate}>重新生成本页</button><button onClick={() => onRegenerate(slide.id, "closer_previous")} disabled={busy || !canRegenerate}>更贴近上一页</button></footer></article>;
    })}</div></section>}
  </section>;
}

function ImageExplodeStudio({ service, refresh, notify, back, openEditor }: {
  service: Service; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void; back: () => void; openEditor: (slideNumber: number) => void;
}) {
  const [runs, setRuns] = useState<ImageExplodeRun[]>([]);
  const [activeRun, setActiveRun] = useState<ImageExplodeRun | null>(null);
  const [sourceImageId, setSourceImageId] = useState("");
  const [localFile, setLocalFile] = useState<File | null>(null);
  const [localPreview, setLocalPreview] = useState("");
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const [refineTarget, setRefineTarget] = useState<ImageExplodePart | null>(null);
  const [refining, setRefining] = useState(false);
  const [refineReady, setRefineReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const reconstructionShown = useRef("");
  const images = useMemo(() => Array.from(new Map(service.generationJobs.flatMap(job => job.images.map(image => [image.id, image] as const))).values()), [service.generationJobs]);
  const loadRuns = useCallback(async () => {
    const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs`, { cache: "no-store" });
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "拆图记录读取失败");
    setRuns(result.runs || []);
    setActiveRun(current => current ? (result.runs || []).find((run: ImageExplodeRun) => run.id === current.id) || current : result.runs?.[0] || null);
  }, [notify, service.id]);
  useEffect(() => { const timer = window.setTimeout(() => void loadRuns(), 0); return () => window.clearTimeout(timer); }, [loadRuns]);
  useEffect(() => {
    if (!activeRun || !["queued", "running"].includes(activeRun.status)) return;
    const timer = window.setInterval(() => void loadRuns(), 1800);
    return () => window.clearInterval(timer);
  }, [activeRun, loadRuns]);
  useEffect(() => {
    if (!activeRun?.reconstructionName || activeRun.status !== "completed" || reconstructionShown.current === activeRun.id) return;
    reconstructionShown.current = activeRun.id;
    setPreviewImage({ url: `/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}/reconstruction`, title: activeRun.needsReview ? "重建预览：需要确认" : "重建预览：智能推荐结果" });
  }, [activeRun?.id, activeRun?.needsReview, activeRun?.reconstructionName, activeRun?.status, service.id]);
  useEffect(() => () => { if (localPreview) URL.revokeObjectURL(localPreview); }, [localPreview]);
  function chooseFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 20 * 1024 * 1024) return notify("请选择不超过 20MB 的 PNG、JPEG 或 WebP 图片");
    if (localPreview) URL.revokeObjectURL(localPreview);
    setLocalFile(file); setLocalPreview(URL.createObjectURL(file)); setSourceImageId("");
  }
  async function createRun() {
    if (!sourceImageId && !localFile) return notify("先选择一张 AI 预成品、素材库图片或本地图片");
    const form = new FormData();
    if (sourceImageId) form.set("imageId", sourceImageId);
    if (localFile) form.set("image", localFile);
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs`, { method: "POST", body: form });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "拆图任务创建失败");
      setActiveRun(result.run); setRuns(current => [result.run, ...current]); notify("已开始拆解，请稍候选择可用部件");
    } finally { setBusy(false); }
  }
  async function saveSelection(nextParts: ImageExplodePart[], nextTextLayers = activeRun?.textLayers || []) {
    if (!activeRun) return;
    const lastSelectedByGroup = new Map<string, string>();
    nextParts.forEach(part => { if (part.selected && part.groupKey) lastSelectedByGroup.set(part.groupKey, part.id); });
    const normalizedParts = nextParts.map(part => part.groupKey && part.selected && lastSelectedByGroup.get(part.groupKey) !== part.id ? { ...part, selected: false } : part);
    setActiveRun({ ...activeRun, parts: normalizedParts, textLayers: nextTextLayers });
    const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedIds: normalizedParts.filter(part => part.selected).map(part => part.id), textLayers: nextTextLayers.map(layer => ({ id: layer.id, content: layer.content, mode: layer.mode, selected: layer.selected })) }) });
    if (!response.ok) { const result = await responseJson(response); notify(result.error || "候选选择保存失败"); }
  }
  async function saveTextLayer(layer: ImageExplodeTextLayer, mode: "native" | "artwork" | "skip", content = layer.content) {
    if (!activeRun) return;
    const currentTextLayers = activeRun.textLayers || [];
    const currentParts = activeRun.parts || [];
    const nextTextLayers = currentTextLayers.map(item => item.id === layer.id ? { ...item, content, mode, selected: mode === "native" } : item);
    const nextParts = layer.groupKey ? currentParts.map(part => {
      if (part.groupKey !== layer.groupKey) return part;
      if (mode === "native") return { ...part, selected: part.variant === "clean-text" };
      if (mode === "artwork") return { ...part, selected: part.variant === "original-text" || part.variant === "artwork" };
      return { ...part, selected: part.variant === "clean-text" };
    }) : currentParts;
    await saveSelection(nextParts, nextTextLayers);
  }
  async function cleanTextWithAi(layer: ImageExplodeTextLayer) {
    if (!activeRun || !layer.groupKey) return;
    const part = (activeRun.parts || []).find(item => item.groupKey === layer.groupKey && item.variant === "clean-text");
    if (!part) return notify("找不到对应的无字可编辑版");
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}/parts/${part.id}/clean-text`, { method: "POST" });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "AI 清字精修失败，已保留本地无字版和原字效果版");
      notify("AI 清字精修预览已生成；导入时会使用精修后的无字版");
      await loadRuns();
    } finally { setBusy(false); }
  }
  async function cancelRun() {
    if (!activeRun) return;
    const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cancel: true }) });
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "取消拆图任务失败");
    await loadRuns();
  }
  async function applyRun() {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}/apply`, { method: "POST" });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "导入 PPT 失败");
      await refresh(true); await loadRuns(); openEditor(result.slideNumber);
    } finally { setBusy(false); }
  }
  function openRefine(part: ImageExplodePart) {
    // Every entry starts a new re-cut pass for the currently selected candidate.
    setRefineTarget(part); setRefineReady(false);
  }
  async function runRefinement() {
    if (!activeRun || !refineTarget) return;
    setRefining(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}/parts/${refineTarget.id}/refine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "抠图精修失败");
      setRefineReady(true); notify("抠图精修预览已生成，请确认后再添加到候选列表"); await loadRuns();
    } finally { setRefining(false); }
  }
  async function acceptRefinement() {
    if (!activeRun || !refineTarget) return;
    setRefining(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/image-explode/runs/${activeRun.id}/parts/${refineTarget.id}/refine`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "accept" }) });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "添加精修候选失败");
      notify("抠图精修版已追加到候选列表末尾，原候选已保留"); await loadRuns(); setRefineTarget(null); setRefineReady(false);
    } finally { setRefining(false); }
  }
  const activeParts = activeRun?.parts || [];
  const activeTextLayers = activeRun?.textLayers || [];
  const activeEvents = activeRun?.events || [];
  const selectedCount = activeParts.filter(part => part.selected).length;
  const selectedTextCount = activeTextLayers.filter(layer => layer.selected && layer.mode === "native").length;
  const hasRecovered = activeEvents.some(event => event.stage === "extract" && event.status === "completed");
  const visibleEvents = activeEvents.filter(event => !(hasRecovered && event.status === "failed"));
  return <main className="explode-studio">
    <section className="explode-intro"><button onClick={back}><ChevronLeft/>返回 PPT 编辑</button><span>WZLCF · IMAGE EXPLODE</span><h1>把一张样品图拆成可用的 PPT 零部件</h1><p>先自动识别背景、主体、装饰、卡片和文字；你确认需要哪些，再按原始坐标导入新页。复杂视觉会是独立透明图片，文字会写成可编辑文本框。</p></section>
    <section className="explode-source"><div><b>选择待拆图片</b><small>支持 AI 预成品、素材库已有图或本地上传。点击右上角放大镜可先查看大图。</small></div><div className="explode-source-grid">{images.slice(0, 12).map(image => <article key={image.id} className={sourceImageId === image.id ? "selected" : ""}><button className="explode-source-choice" onClick={() => { setSourceImageId(image.id); setLocalFile(null); if (localPreview) { URL.revokeObjectURL(localPreview); setLocalPreview(""); } }}><img src={generatedImageUrl(image.id)} alt="可拆图片"/><i>选择</i></button><button className="explode-source-preview" title="放大预览" onClick={() => setPreviewImage({ url: generatedImageUrl(image.id), title: "待拆图片预览" })}><Maximize2/></button></article>)}<button className={localFile ? "upload selected" : "upload"} onClick={() => fileRef.current?.click()}>{localPreview ? <img src={localPreview} alt="本地图片"/> : <><Upload/><span>上传本地图片</span></>}<i>{localFile ? "已选" : "选择"}</i></button></div><input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={event => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }}/><footer><span>{sourceImageId || localFile ? "已选择图片，可开始生成候选。" : "请选择一张图片。"}</span><button disabled={busy || (!sourceImageId && !localFile)} onClick={() => void createRun()}>{busy ? <LoaderCircle className="spin"/> : <Scissors/>}开始拆解</button></footer></section>
    {activeRun ? <section className="explode-run"><header><div><span className={`design-status ${activeRun.status}`}>{activeRun.status === "completed" ? "候选已生成" : activeRun.status === "failed" ? "拆解失败" : activeRun.status === "cancelled" ? "已取消" : "正在拆解"}</span><h2>{activeRun.status === "completed" ? "勾选你要导入的新页部件" : "正在准备可选择的拆解候选"}</h2></div>{["queued", "running"].includes(activeRun.status) && <button className="explode-cancel" onClick={() => void cancelRun()}>取消拆解</button>}{activeRun.status === "completed" && <button className="design-apply" disabled={busy || !selectedCount} onClick={() => void applyRun()}><Save/>{activeRun.appliedAt ? "同步并打开 PPT" : `导入 ${selectedCount} 个部件${selectedTextCount ? `和 ${selectedTextCount} 段文字` : ""}到新页`}</button>}</header><div className="explode-events">{visibleEvents.map(event => <span key={event.id} className={event.status}><b>{event.stage === "analyze" ? "图片理解" : event.stage === "extract" ? "本地拆图" : event.stage === "text-recover" ? "文字还原" : event.stage === "apply" ? "写入 PPT" : event.stage === "refine" ? "抠图精修" : event.stage === "retry" ? "重新拆图" : "排队"}</b>{event.detail}</span>)}</div>{activeRun.error && <div className="design-error">{activeRun.error}</div>}{activeRun.status === "completed" && activeTextLayers.length > 0 && <section className="explode-text-recovery"><header><div><span>TEXT RECOVERY</span><h3>文字还原</h3><p>普通文字会成为可编辑文本；复杂字效默认保留原效果，避免重影。</p></div><b>{activeTextLayers.length} 段文字</b></header><div>{activeTextLayers.map(layer => <article key={layer.id} className={layer.mode}><div><b>{layer.complexity === "complex" ? "复杂字效" : "可编辑文字"}</b><small>旋转 {Math.round(layer.rotation)}° · 置信度 {Math.round(layer.confidence * 100)}%</small></div><textarea defaultValue={layer.content} onBlur={event => { if (event.currentTarget.value.trim() !== layer.content) void saveTextLayer(layer, layer.mode === "artwork" ? "artwork" : layer.mode === "skip" ? "skip" : "native", event.currentTarget.value); }}/><footer><button className={layer.mode === "native" ? "active" : ""} onClick={() => void saveTextLayer(layer, "native")}>可编辑重建</button><button className={layer.mode === "artwork" ? "active" : ""} onClick={() => void saveTextLayer(layer, "artwork")}>保留原字效</button><button className={layer.mode === "skip" ? "active" : ""} onClick={() => void saveTextLayer(layer, "skip")}>不导入</button></footer></article>)}</div></section>}{activeRun.status === "completed" && <div className="explode-parts">{activeParts.map(part => <article key={part.id} className={part.selected ? "selected" : ""}><button className="explode-check" onClick={() => void saveSelection(activeParts.map(item => item.id === part.id ? { ...item, selected: !item.selected } : item))}>{part.selected ? <Check/> : null}</button><button className="explode-enlarge" title="放大预览" onClick={() => !part.textContent && setPreviewImage({ url: `/api/employee/image-explode/parts/${part.id}`, title: part.label })}><Maximize2/></button><div className={part.textContent ? "explode-text-preview" : "explode-image-preview"}>{part.textContent ? <p>{part.textContent}</p> : <img src={`/api/employee/image-explode/parts/${part.id}`} alt={part.label}/>}</div>{!part.textContent && part.kind !== "background" && <button className="explode-refine" disabled={busy || refining} onClick={() => openRefine(part)}>抠图精修</button>}<footer><b>{part.label}</b><span>{part.kind === "background" ? "背景层" : part.variant === "clean-text" ? "无字可编辑版" : part.variant === "original-text" ? "保留原字效版" : part.variant === "group" ? "整组候选" : part.variant === "refined" ? "抠图精修版" : "透明图片"}</span><small>识别置信度 {Math.round(part.confidence * 100)}%</small></footer></article>)}</div>}</section> : <section className="explode-empty"><Scissors/><h2>先选图，再拆解</h2><p>同一张图会给出不同颗粒度的候选：整组、逐张卡片、主体、装饰与文字，你完全掌控导入内容。</p></section>}
    {activeRun?.status === "completed" && activeTextLayers.some(layer => layer.groupKey) && <aside className="explode-text-actions"><b>AI 清字精修</b><span>只清当前框内文字，先生成预览，不会替换原候选。</span>{activeTextLayers.filter(layer => layer.groupKey).map(layer => <button key={layer.id} disabled={busy} onClick={() => void cleanTextWithAi(layer)}>{layer.content.slice(0, 16) || "当前文字"}</button>)}</aside>}
    <aside className="explode-history">{runs.slice(0, 8).map(run => <button key={run.id} className={activeRun?.id === run.id ? "active" : ""} onClick={() => setActiveRun(run)}><span>{run.status}</span><b>{(run.parts || []).length ? `${(run.parts || []).length} 个候选` : "图片拆解"}</b><small>{new Date(run.createdAt).toLocaleString("zh-CN")}</small></button>)}</aside>
    {refineTarget && <aside className="explode-refine-panel"><header><div><span>IMAGE RETOUCH</span><h2>抠图精修</h2><p>以当前候选图再次抠边，确认后再追加新候选；左侧原候选不会被删除。</p></div><button onClick={() => { setRefineTarget(null); setRefineReady(false); }}><X/></button></header><div className="refine-compare"><article><b>当前候选图</b><div><img src={`/api/employee/image-explode/parts/${refineTarget.id}`} alt="当前候选图"/></div></article><article><b>再次抠图结果</b><div>{refineReady ? <img src={`/api/employee/image-explode/parts/${refineTarget.id}?refined=1`} alt="再次抠图结果"/> : refining ? <><LoaderCircle className="spin"/><span>正在再次抠图精修…</span></> : <><Scissors/><span>点击下方按钮对当前候选再次抠图</span></>}</div></article></div><footer>{refineReady ? <button className="refine-accept" disabled={refining} onClick={() => void acceptRefinement()}><Check/>添加精修版到候选列表</button> : <button disabled={refining} onClick={() => void runRefinement()}>{refining ? <LoaderCircle className="spin"/> : <><Scissors/>开始再次抠图</>}</button>}<small>精修只处理当前候选图，不会影响原样品图或其他候选。</small></footer></aside>}
    {previewImage && <ExplodeImagePreview image={previewImage} onClose={() => setPreviewImage(null)}/>}
  </main>;
}

function ExplodeImagePreview({ image, onClose }: { image: { url: string; title: string }; onClose: () => void }) {
  return <div className="explode-preview-modal" onClick={onClose}><section onClick={event => event.stopPropagation()}><header><b>{image.title}</b><button onClick={onClose}><X/></button></header><img src={image.url} alt={image.title}/></section></div>;
}

function stageLabel(stage: string): string {
  const batchStage = stage.match(/^batch-(\d+)-(master|background|parts|cutout|rebuild)$/);
  if (batchStage) {
    const label = ({ master: "完整样片", background: "纯背景", parts: "零件拆解", cutout: "二次抠图", rebuild: "重建预览" } as Record<string, string>)[batchStage[2]] || "流水线";
    return `第 ${batchStage[1]} 份 · ${label}`;
  }
  if (stage.startsWith("retry-")) return `审美修正 · ${stageLabel(stage.slice(6))}`;
  const fallbackLabels: Record<string, string> = {
    image_text: "OpenAI 文生图",
    image_reference: "OpenAI 参考图生图",
    image_safety_fallback: "安全审核降级",
    image_summary_retry: "OpenAI 风格摘要生图",
    image_summary_result: "风格摘要生成完成",
    "asset-plan": "生产图层规划",
    background_text: "OpenAI 背景生图",
    background_reference: "OpenAI 参考图背景",
    background_safety_fallback: "背景安全降级",
    background_summary_retry: "背景摘要重试",
    hero_text: "OpenAI 主视觉生图",
    "production-ready": "可编辑生产预览",
    aesthetic: "审美评估",
    "aesthetic-retry": "审美修正",
    explode: "自动图片炸开",
    "background-clean": "背景清图",
    master_render: "完整样片",
    clean_background: "干净背景",
    layer_plan: "图层识别",
    semantic_cutout: "语义拆图",
    rebuild_qa: "重建检查",
    "reconstruction-qa": "重建检查",
    "apply-sync": "PPT 同步修复"
  };
  if (fallbackLabels[stage]) return fallbackLabels[stage];
  return ({ queued: "已排队", context: "整理上下文", vision: "参考理解", planner: "规划", image: "OpenAI 生图", apply: "写入 PPT", cancelled: "已取消", failed: "任务失败" } as Record<string, string>)[stage] || stage;
}

function safeJson(value: string, fallback: unknown) { try { return JSON.parse(value); } catch { return fallback; } }
// API routes should always return JSON, but development hot reload can briefly
// return an empty 500 response. This keeps the employee UI recoverable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responseJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}），请刷新或重启开发服务后重试。` };
  try { return JSON.parse(text); } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）。` }; }
}

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor?: () => void } };
  }
}


const imageDragMime = "application/x-wzlcf-image";

type ImageDragPayload = { imageId: string; source: "ai" | "material" };
type ImagePreview = { id: string; prompt: string; owner: string; model?: string };
type PasteTrayItem = { name: string; previewUrl: string; dataUrl: string; pngBlob: Blob };
type ImageToolSource = { imageId?: string; file?: File; previewUrl: string; name: string; ownedUrl: boolean };
type ImageToPptResult = { fileName: string; downloadUrl: string; codiaTaskId?: string; sourceName?: string };
type PptExtractedImage = {
  id: string;
  slideNumber: number;
  name: string;
  extension: string;
  contentType: string;
  dataUrl: string;
  croppedDataUrl: string;
  crop: { left: number; top: number; right: number; bottom: number };
};

function generatedImageUrl(id: string) { return "/api/employee/generated-images/" + id; }
function generatedImageDownloadUrl(id: string) { return "/api/employee/generated-images/" + id + "?download=1"; }
function absoluteGeneratedImageUrl(id: string) {
  if (typeof window === "undefined") return generatedImageUrl(id);
  return new URL(generatedImageUrl(id), window.location.origin).toString();
}
function nextMaterialOrder(items: MaterialItem[]) { return items.reduce((max, item) => Math.max(max, item.materialOrder || 0), 0) + 1; }
function chronologicalSort<T extends { id: string; createdAt: string }>(a: T, b: T) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
}

function writeImageDragData(event: DragEvent<HTMLElement>, imageId: string, source: "ai" | "material") {
  const payload: ImageDragPayload = { imageId, source };
  const url = absoluteGeneratedImageUrl(imageId);
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData(imageDragMime, JSON.stringify(payload));
  event.dataTransfer.setData("text/wzlcf-image", imageId);
  event.dataTransfer.setData("text/uri-list", url);
  event.dataTransfer.setData("text/plain", url);
  event.dataTransfer.setData("text/html", `<img src="${url}" alt="WZLCF material image">`);
  event.dataTransfer.setData("DownloadURL", `image/png:wzlcf-material-${imageId}.png:${url}`);
  window.dispatchEvent(new CustomEvent("wzlcf:image-drag-start"));
}

function finishImageDrag() {
  window.dispatchEvent(new CustomEvent("wzlcf:image-drag-end"));
}

function readImageDragId(dataTransfer: DataTransfer) {
  const payload = dataTransfer.getData(imageDragMime);
  if (payload) {
    try {
      const parsed = JSON.parse(payload) as Partial<ImageDragPayload>;
      if (parsed.imageId) return parsed.imageId;
    } catch {
      return null;
    }
  }
  return dataTransfer.getData("text/wzlcf-image") || null;
}

function imageFilesFromList(files: FileList | File[]) {
  return Array.from(files).filter(file => file.type.startsWith("image/"));
}

async function blobToPngBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = document.createElement("img");
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片读取失败，请换一张图片再试"));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("图片转换失败，请换一张图片再试");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("图片转换失败，请换一张图片再试")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败，请使用下载兜底。"));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function cropDataUrlToPngDataUrl(dataUrl: string, crop: PptExtractedImage["crop"]) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = document.createElement("img");
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("PPT 图片预览失败"));
    element.src = dataUrl;
  });
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const x = Math.round(sourceWidth * crop.left);
  const y = Math.round(sourceHeight * crop.top);
  const width = Math.max(1, Math.round(sourceWidth * (1 - crop.left - crop.right)));
  const height = Math.max(1, Math.round(sourceHeight * (1 - crop.top - crop.bottom)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PPT 图片裁剪失败");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

function copyImageHtmlFallback(dataUrl: string) {
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.innerHTML = `<img src="${dataUrl}" alt="WZLCF material image">`;
  document.body.appendChild(container);
  const selection = window.getSelection();
  const previousRanges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (!document.execCommand("copy")) throw new Error("兼容复制失败，请使用下载兜底。");
  } finally {
    selection?.removeAllRanges();
    previousRanges.forEach(range => selection?.addRange(range));
    container.remove();
  }
}

async function copyPngBlobToClipboard(blob: Blob, dataUrl: string) {
  const html = `<img src="${dataUrl}" alt="WZLCF material image">`;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "image/png": blob,
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob(["WZLCF material image"], { type: "text/plain" })
      })]);
      return "native";
    } catch {
      // Some browser contexts reject binary image writes; HTML data-URL copy is the fallback.
    }
  }
  copyImageHtmlFallback(dataUrl);
  return "html";
}

function ImagePreviewModal({ image, onClose }: { image: ImagePreview; onClose: () => void }) {
  return <div className="image-preview-modal" onMouseDown={onClose}>
    <div className="image-preview-card" onMouseDown={event => event.stopPropagation()}>
      <header><div><b>{image.prompt || "AI 图片预览"}</b><span>{image.owner}{image.model ? " · " + image.model : ""}</span></div><button onClick={onClose}><X/></button></header>
      <img src={generatedImageUrl(image.id)} alt={image.prompt || "AI 图片"}/>
      <footer><a href={generatedImageDownloadUrl(image.id)} download><Download/>下载图片</a></footer>
    </div>
  </div>;
}

function OnlyOfficeEditor({ documentId, revision, refresh, notify }: {
  documentId: string;
  revision: number;
  refresh: (silent?: boolean) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostId = "onlyoffice-" + documentId + "-" + revision;

  async function loadPresentation(file: File) {
    if (!/\.(ppt|pptx)$/i.test(file.name)) return notify("请拖入 PPT 或 PPTX 文件");
    if (file.size > workPresentationMaxBytes) return notify(`PPT 文件不能超过 ${workPresentationMaxLabel}`);
    const form = new FormData();
    form.set("file", file);
    setUploading(true);
    const response = await fetch("/api/employee/work-documents/" + documentId + "/replace", { method: "POST", body: form });
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return notify(result.error);
    setError("");
    editorRef.current?.destroyEditor?.();
    await refresh(true);
    setReloadKey(value => value + 1);
    notify("已载入 " + file.name);
  }

  function presentationFileFrom(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.files).find(item => /\.(ppt|pptx)$/i.test(item.name)) || null;
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await fetch("/api/employee/work-documents/" + documentId + "/config");
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        let script = document.querySelector<HTMLScriptElement>('script[data-onlyoffice="' + result.scriptUrl + '"]');
        if (!script) {
          script = document.createElement("script");
          script.src = result.scriptUrl;
          script.dataset.onlyoffice = result.scriptUrl;
          document.body.appendChild(script);
          await new Promise<void>((resolve, reject) => { script!.onload = () => resolve(); script!.onerror = () => reject(new Error("无法连接 ONLYOFFICE 文档服务器")); });
        } else if (!window.DocsAPI) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!cancelled && window.DocsAPI) editorRef.current = new window.DocsAPI.DocEditor(hostId, result.config);
        else if (!window.DocsAPI) throw new Error("ONLYOFFICE 尚未启动，请先运行文档服务");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "编辑器加载失败");
      }
    }
    void start();
    return () => { cancelled = true; editorRef.current?.destroyEditor?.(); };
  }, [documentId, hostId, reloadKey]);

  return <div className={"onlyoffice-host " + (dragging ? "is-dragging" : "")}
    onDragEnter={event => {
      if (!presentationFileFrom(event.dataTransfer)) return setDragging(false);
      event.preventDefault();
      setDragging(true);
    }}
    onDragOver={event => {
      if (!presentationFileFrom(event.dataTransfer)) return setDragging(false);
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => {
      const pptFile = presentationFileFrom(event.dataTransfer);
      if (pptFile) void loadPresentation(pptFile);
      if (pptFile) event.preventDefault();
      setDragging(false);
    }}>
    <input ref={fileRef} hidden type="file" accept=".ppt,.pptx" onChange={event => { const file = event.target.files?.[0]; if (file) void loadPresentation(file); event.currentTarget.value = ""; }}/>
    <div className="office-file-entry"><button onClick={() => fileRef.current?.click()} disabled={uploading}><Upload/>{uploading ? "正在载入..." : "选择 PPT 文件"}</button><span>也可将 PPT / PPTX 直接拖到画布</span></div>
    {error ? <div className="office-placeholder"><Monitor/><h3>编辑器暂未连接</h3><p>{error}</p><button className="office-placeholder-upload" onClick={() => fileRef.current?.click()}><Upload/>先选择一份 PPT</button><small>启动 ONLYOFFICE Docker 服务后即可在线修改。</small></div> : <div id={hostId}/>}
    {dragging && <div className="office-drop-overlay"><Upload/><h3>松开即可载入 PPT</h3><p>支持 .ppt 和 .pptx，最大 {workPresentationMaxLabel}</p></div>}
    {uploading && <div className="office-uploading-overlay"><LoaderCircle className="spin"/><span>正在载入演示文稿...</span></div>}
  </div>;
}


function AiPanel({ service, employee, refresh, notify }: { service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
  const [tab, setTab] = useState<"chat" | "image">("chat");
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [textModels, setTextModels] = useState<AiModelOption[]>([]);
  const [imageModels, setImageModels] = useState<AiModelOption[]>([]);
  const [textModelId, setTextModelId] = useState("");
  const [imageModelId, setImageModelId] = useState("");
  const [openAiHealth, setOpenAiHealth] = useState<OpenAiHealth | null>(null);
  const [openAiHealthChecking, setOpenAiHealthChecking] = useState(false);
  const [openAiHealthCheckNonce, setOpenAiHealthCheckNonce] = useState(0);
  const [chatText, setChatText] = useState("");
  const [pendingChat, setPendingChat] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [count, setCount] = useState(1);
  const [reference, setReference] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [imageStatus, setImageStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [trackedImageJobs, setTrackedImageJobs] = useState<TrackedImageJob[]>([]);
  const [imageClock, setImageClock] = useState(0);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(() => new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const chatFeedRef = useRef<HTMLDivElement>(null);
  const imageFeedRef = useRef<HTMLDivElement>(null);
  const mineMaterials = useMemo(() => new Set(service.materialItems.filter(item => item.employee.id === employee.id).map(item => item.image.id)), [employee.id, service.materialItems]);
  const images = service.generationJobs
    .filter(job => !job.employee.id || job.employee.id === employee.id)
    .flatMap(job => job.images.map(image => ({ ...image, job })))
    .sort(chronologicalSort);
  const serviceImageJobs = service.generationJobs.filter(job => !job.employee.id || job.employee.id === employee.id);
  const imageJobMap = new Map<string, TrackedImageJob>();
  [...trackedImageJobs, ...serviceImageJobs].forEach(job => imageJobMap.set(job.id, job));
  const displayImageJobs = Array.from(imageJobMap.values())
    .filter(job => job.status === "processing" || job.status === "failed")
    .sort(chronologicalSort);
  const processingImageJobIds = displayImageJobs.filter(job => job.status === "processing").map(job => job.id).join("|");
  const imageFeedKey = images.map(image => image.id).join("|") + ":" + displayImageJobs.map(job => job.id + job.status).join("|");
  const selectedImageModel = imageModels.find(model => model.id === imageModelId) || imageModels[0];
  const selectedImageSupportsReference = selectedImageModel?.provider === "openai"
    ? Boolean(openAiHealth?.image?.supportsEdits)
    : false;
  const imageProviderHealth = selectedImageModel?.provider === "ark"
    ? {
      ok: selectedImageModel.available,
      text: selectedImageModel.available ? "Seedream 5.0 已配置 ARK_API_KEY" : "尚未配置 ARK_API_KEY"
    }
    : {
      ok: Boolean(openAiHealth?.image?.ok),
      text: openAiHealth?.image?.ok
        ? `${openAiHealth.image.serviceName} 已配置`
        : openAiHealth?.image?.error || openAiHealth?.error || "正在检查图片中转服务..."
    };

  useEffect(() => {
    let cancelled = false;
    async function loadAi() {
      const response = await fetch("/api/employee/services/" + service.id + "/ai");
      const result = await response.json();
      if (cancelled) return;
      if (!response.ok) return notify(result.error);
      setMessages(result.conversation.messages);
      setTextModels(result.models.text);
      setImageModels(result.models.image);
      setTextModelId(current => current || result.models.defaultTextModelId);
      setImageModelId(current => current || result.models.image[0]?.id || "");
    }
    void loadAi();
    return () => { cancelled = true; };
  }, [service.id, notify]);

  useEffect(() => {
    let cancelled = false;
    let nextCheck: number | undefined;
    async function loadOpenAiHealth() {
      if (!cancelled) setOpenAiHealthChecking(true);
      let retryAfter = 10000;
      try {
        const response = await fetch("/api/employee/ai/openai-health", { cache: "no-store" });
        const result = await response.json();
        const health = response.ok ? result : { ok: false, error: result.error || "中转配置检查失败" };
        retryAfter = health.ok ? 60000 : 10000;
        if (!cancelled) setOpenAiHealth(health);
      } catch {
        if (!cancelled) setOpenAiHealth({ ok: false, error: "中转配置检查失败" });
      } finally {
        if (!cancelled) {
          setOpenAiHealthChecking(false);
          nextCheck = window.setTimeout(() => void loadOpenAiHealth(), retryAfter);
        }
      }
    }
    void loadOpenAiHealth();
    return () => {
      cancelled = true;
      if (nextCheck !== undefined) window.clearTimeout(nextCheck);
    };
  }, [service.id, openAiHealthCheckNonce]);

  useEffect(() => {
    const target = tab === "chat" ? chatFeedRef.current : imageFeedRef.current;
    window.setTimeout(() => { if (target) target.scrollTop = target.scrollHeight; }, 20);
  }, [tab, messages.length, pendingChat, imageFeedKey]);

  useEffect(() => {
    if (!processingImageJobIds) return;
    const timer = window.setInterval(() => setImageClock(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [processingImageJobIds]);

  useEffect(() => {
    if (!processingImageJobIds) return;
    let cancelled = false;
    async function pollJobs() {
      try {
        const response = await fetch("/api/employee/services/" + service.id + "/generate-images", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || cancelled) return;
        const ownJobs = (result.jobs || []) as TrackedImageJob[];
        setTrackedImageJobs(current => {
          const next = new Map<string, TrackedImageJob>();
          current.forEach(job => next.set(job.id, job));
          ownJobs.forEach(job => next.set(job.id, job));
          return Array.from(next.values()).slice(0, 12);
        });
        if (ownJobs.some(job => job.status !== "processing")) await refresh(true);
      } catch {
        // Keep the visible processing card; the next poll can recover.
      }
    }
    const timer = window.setInterval(() => void pollJobs(), 2000);
    void pollJobs();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [processingImageJobIds, refresh, service.id]);

  async function sendChat() {
    if (!chatText.trim() || chatBusy) return;
    if (textModelId.startsWith("openai:") && openAiHealth?.text && !openAiHealth.text.ok) return notify(openAiHealth.text.error || "文字中转服务当前不可用");
    const content = chatText.trim();
    setPendingChat(content);
    setChatBusy(true);
    try {
      const response = await fetch("/api/employee/services/" + service.id + "/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, modelId: textModelId })
      });
      const result = await response.json();
      if (!response.ok) return notify(result.error);
      setMessages(current => [...current, ...result.messages]);
    } finally {
      setChatBusy(false);
      setPendingChat("");
    }
  }

  async function generate() {
    if (!prompt.trim() || busy) return;
    if (selectedImageModel?.provider === "openai" && openAiHealth?.image && !openAiHealth.image.ok) return notify(openAiHealth.image.error || "图片中转服务当前不可用");
    if (selectedImageModel?.provider === "ark" && !selectedImageModel.available) return notify("尚未配置 ARK_API_KEY");
    const form = new FormData();
    form.set("prompt", prompt);
    form.set("count", String(count));
    form.set("modelId", imageModelId);
    if (reference && selectedImageSupportsReference) form.set("reference", reference);
    setImageStatus(null);
    setBusy(true);
    try {
      const response = await fetch("/api/employee/services/" + service.id + "/generate-images", { method: "POST", body: form });
      const body = await response.text();
      const result = body ? JSON.parse(body) : {};
      if (!response.ok) {
        const message = result.error || "图片生成失败";
        setImageStatus({ kind: "error", text: message });
        return notify(message);
      }
      const createdJob = result.job as TrackedImageJob;
      setTrackedImageJobs(current => [...current.filter(job => job.id !== createdJob.id), createdJob].slice(-12));
      setImageStatus({ kind: "ok", text: "已创建生成任务，完成后会自动出现在下方。" });
      notify("已创建生成任务");
    } catch (error) {
      const message = error instanceof Error ? error.message : "图片生成失败";
      setImageStatus({ kind: "error", text: message });
      notify(message);
    } finally {
      setBusy(false);
    }
  }

  function retryImageJob(job: TrackedImageJob) {
    setTab("image");
    setPrompt(job.prompt);
    setImageStatus({ kind: "error", text: "已把失败任务的提示词放回输入框，可以修改后重新生成。" });
  }

  async function collect(imageId: string) {
    const response = await fetch("/api/employee/generated-images/" + imageId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMaterial: true, materialOrder: nextMaterialOrder(service.materialItems.filter(item => item.employee.id === employee.id)) })
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify("已复制到我的素材库");
    await refresh(true);
  }

  function togglePrompt(imageId: string) {
    setExpandedPrompts(current => {
      const next = new Set(current);
      if (next.has(imageId)) next.delete(imageId);
      else next.add(imageId);
      return next;
    });
  }

  const imageJobCards = displayImageJobs.map(job => {
    const seconds = Math.max(1, Math.floor(((imageClock || new Date(job.createdAt).getTime() + 1000) - new Date(job.createdAt).getTime()) / 1000));
    return <article key={job.id} className={"ai-job-card " + job.status}>
      <div><LoaderCircle className={job.status === "processing" ? "spin" : ""}/><span><b>{job.status === "processing" ? "正在绘图" : "生成失败"}</b><small>{job.status === "processing" ? "灵感正在排队，已等待 " + seconds + " 秒" : job.error || "图片生成失败"}</small></span></div>
      <p>{job.prompt}</p>
      {job.status === "failed" && <button onClick={() => retryImageJob(job)}>重试</button>}
    </article>;
  });

  return <aside className="ai-panel">
    <header><div><WandSparkles/><span><b>AI 创作助手</b><small>{employee.name} 的独立上下文</small></span></div><i>AI</i></header>
    <div className="ai-tabs"><button className={tab === "chat" ? "active" : ""} onClick={() => setTab("chat")}><Bot/>文本助手</button><button className={tab === "image" ? "active" : ""} onClick={() => setTab("image")}><ImagePlus/>AI 图片</button></div>
    {tab === "image" && selectedImageModel && <div className={"ai-health " + (imageProviderHealth.ok ? "ok" : "error")}><span>{imageProviderHealth.text}</span>{selectedImageModel.provider === "openai" && !imageProviderHealth.ok && <button title="重新检查图片中转配置" onClick={() => setOpenAiHealthCheckNonce(value => value + 1)} disabled={openAiHealthChecking}><RefreshCw className={openAiHealthChecking ? "spin" : ""}/></button>}</div>}
    {tab === "chat" && openAiHealth?.text && <div className={"ai-health " + (openAiHealth.text.ok ? "ok" : "error")}><span>{openAiHealth.text.ok ? `${openAiHealth.text.serviceName} 已配置` : openAiHealth.text.error}</span>{!openAiHealth.text.ok && <button title="重新检查文字中转配置" onClick={() => setOpenAiHealthCheckNonce(value => value + 1)} disabled={openAiHealthChecking}><RefreshCw className={openAiHealthChecking ? "spin" : ""}/></button>}</div>}
    {tab === "chat" ? <>
      <div className="ai-model-row"><select value={textModelId} onChange={event => setTextModelId(event.target.value)}>{textModels.map(model => <option key={model.id} value={model.id}>{model.label}{model.available ? "" : "（未配置）"}</option>)}</select></div>
      <div ref={chatFeedRef} className="ai-chat-feed">
        {messages.length ? messages.map(message => <article key={message.id} className={message.role === "user" ? "mine" : ""}><small>{message.role === "user" ? employee.name : message.provider + " · " + message.model}</small><p>{message.content}</p></article>) : <div className="ai-welcome"><Bot/><h3>员工独立 AI 对话</h3><p>这里的上下文只属于你，切换模型后仍会读取你的历史。</p></div>}
        {pendingChat && <article className="ai-thinking"><small>{textModelId || "AI"}</small><p><LoaderCircle className="spin"/>正在整理你的内容...</p><em>{pendingChat}</em></article>}
      </div>
      <div className="ai-composer ai-chat-composer"><textarea value={chatText} onChange={event => setChatText(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder="让 AI 帮你分析客户需求、整理大纲、优化页面文案..."/><div><button className="ai-generate" onClick={sendChat} disabled={chatBusy || !chatText.trim()}>{chatBusy ? <LoaderCircle className="spin"/> : <Send/>}发送</button></div></div>
    </> : <>
      <div className="ai-model-row"><select value={imageModelId} onChange={event => { const nextId = event.target.value; setImageModelId(nextId); if (imageModels.find(model => model.id === nextId)?.provider === "ark") setReference(null); }}>{imageModels.map(model => <option key={model.id} value={model.id}>{model.label}{model.available ? "" : "（未配置）"}</option>)}</select></div>
      <div ref={imageFeedRef} className="ai-feed">
        {imageJobCards}
        {(images.length || imageJobCards.length) ? images.map(image => {
          const owned = mineMaterials.has(image.id);
          const expanded = expandedPrompts.has(image.id);
          return <article key={image.id} draggable onDragStartCapture={event => writeImageDragData(event, image.id, "ai")} onDragEnd={finishImageDrag}>
            <button className="ai-image-preview" onClick={() => setPreview({ id: image.id, prompt: image.job.prompt, owner: image.job.employee.name, model: image.job.model })}><img draggable={false} src={generatedImageUrl(image.id)} alt={image.job.prompt}/></button>
            <p className={expanded ? "expanded" : ""}>{image.job.prompt}</p>
            <div><span>{image.job.employee.name}</span><button type="button" onClick={() => togglePrompt(image.id)}><FileText/>{expanded ? "收起" : "提示词"}</button><a href={generatedImageDownloadUrl(image.id)}><Download/></a><button disabled={owned} onClick={() => collect(image.id)}><ImagePlus/>{owned ? "已收录" : "收录素材"}</button></div>
          </article>;
        }) : <div className="ai-welcome"><ImagePlus/><h3>AI 图片生成</h3><p>生成结果默认只在你的面板里，收录后进入你的素材库。</p></div>}
      </div>
      <div className="ai-composer">{imageStatus && <div className={"ai-image-status " + imageStatus.kind}>{imageStatus.text}</div>}{busy && <div className="ai-image-status ok"><LoaderCircle className="spin"/>正在创建绘图任务，提示词会留在这里。</div>}{reference && <div className="ai-reference"><span><ImagePlus/>{reference.name}</span><button onClick={() => setReference(null)}><X/></button></div>}<textarea value={prompt} onChange={event => setPrompt(event.target.value)} onPaste={event => { const image = Array.from(event.clipboardData.files).find(file => file.type.startsWith("image/")); if (image && selectedImageSupportsReference) setReference(image); }} placeholder="例如：宝石蓝与浅蓝的商务科技背景，高级、留白充足..."/><div><input ref={fileRef} hidden type="file" accept="image/*" onChange={event => setReference(event.target.files?.[0] || null)}/><button onClick={() => fileRef.current?.click()} disabled={!selectedImageSupportsReference} title={selectedImageSupportsReference ? "添加参考图" : "Seedream 5.0 暂不支持参考图"}><Paperclip/>参考图</button><label>生成<select value={count} onChange={event => setCount(Number(event.target.value))}>{[1,2,3,4].map(value => <option key={value}>{value}</option>)}</select>张</label><button className="ai-generate" onClick={generate} disabled={busy || !prompt.trim()}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}生成</button></div></div>
    </>}
    {preview && <ImagePreviewModal image={preview} onClose={() => setPreview(null)}/>}
  </aside>;
}

function ImageToolsPanel({ service, employee, refresh, notify }: { service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tool, setTool] = useState<TechszImageToolId | "imageToPpt" | "extract">("segmentation");
  const [dragging, setDragging] = useState(false);
  const [source, setSource] = useState<ImageToolSource | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultId, setResultId] = useState("");
  const [resultUrl, setResultUrl] = useState("");
  const [resultSaved, setResultSaved] = useState(false);
  const [imageToPptResult, setImageToPptResult] = useState<ImageToPptResult | null>(null);
  const [extractedImages, setExtractedImages] = useState<PptExtractedImage[]>([]);
  const [extractSlide, setExtractSlide] = useState(1);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error" | "busy"; text: string }>({
    kind: "idle",
    text: "拖入素材，默认执行智能抠图。"
  });
  const sourceRef = useRef<ImageToolSource | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const myMaterials = useMemo(() => service.materialItems.filter(item => item.employee.id === employee.id), [employee.id, service.materialItems]);
  const activeExtract = tool === "extract";
  const activeImageToPpt = tool === "imageToPpt";
  const activeImageTool = techszImageToolById(tool === "scale" ? "scale" : "segmentation");
  const imageToolButtons = techszImageTools.filter(item => item.id !== "segmentation");
  const showToolStatus = !activeExtract || status.kind === "busy" || status.kind === "error";

  const replaceSource = useCallback((next: ImageToolSource | null) => {
    setSource(current => {
      if (current?.ownedUrl) URL.revokeObjectURL(current.previewUrl);
      sourceRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (sourceRef.current?.ownedUrl) URL.revokeObjectURL(sourceRef.current.previewUrl);
  }, []);

  async function processSegmentation(nextSource: ImageToolSource) {
    const targetTool = techszImageToolById(tool === "extract" ? "segmentation" : tool);
    setOpen(true);
    setTool(targetTool.id);
    setBusy(true);
    setResultId("");
    setResultUrl("");
    setResultSaved(false);
    setImageToPptResult(null);
    setStatus({ kind: "busy", text: `正在调用佐糖${targetTool.label}...` });
    try {
      const form = new FormData();
      form.set("tool", targetTool.id);
      if (nextSource.imageId) form.set("imageId", nextSource.imageId);
      if (nextSource.file) form.set("image", nextSource.file);
      const response = await fetch("/api/employee/services/" + service.id + "/image-tools/segmentation", {
        method: "POST",
        body: form
      });
      const body = await response.text();
      const result = body ? JSON.parse(body) : {};
      if (!response.ok) throw new Error(result.error || "佐糖抠图失败，请稍后重试。");
      setResultId(result.image.id);
      setResultUrl(result.imageUrl || generatedImageUrl(result.image.id));
      setStatus({ kind: "ok", text: targetTool.resultText });
      notify(`佐糖${targetTool.shortLabel}完成`);
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "佐糖抠图失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  async function processImageToPpt(nextSource: ImageToolSource) {
    setOpen(true);
    setTool("imageToPpt");
    setBusy(true);
    setResultId("");
    setResultUrl("");
    setResultSaved(false);
    setImageToPptResult(null);
    setStatus({ kind: "busy", text: "正在调用 Codia 转换 PPTX，通常需要几十秒..." });
    try {
      const form = new FormData();
      const title = (nextSource.name || service.title).replace(/\.[a-z0-9]+$/i, "").trim() || service.title || "图片转 PPT";
      form.set("title", title);
      if (nextSource.imageId) form.set("imageId", nextSource.imageId);
      if (nextSource.file) form.set("image", nextSource.file);
      const response = await fetch("/api/employee/services/" + service.id + "/image-to-pptx", {
        method: "POST",
        body: form
      });
      const result = await responseJson(response);
      if (!response.ok) throw new Error(result.error || "图片转 PPT 失败");
      setImageToPptResult({
        fileName: String(result.fileName || `${title}.pptx`),
        downloadUrl: String(result.downloadUrl || ""),
        codiaTaskId: typeof result.codiaTaskId === "string" ? result.codiaTaskId : undefined,
        sourceName: typeof result.sourceName === "string" ? result.sourceName : undefined
      });
      setStatus({ kind: "ok", text: "PPTX 已生成，可以直接下载。" });
      notify("图片转 PPT 完成");
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "图片转 PPT 失败，请稍后重试。" });
    } finally {
      setBusy(false);
    }
  }

  async function acceptSource(next: ImageToolSource) {
    replaceSource(next);
    await processSegmentation(next);
  }

  async function acceptImageToPpt(next: ImageToolSource) {
    replaceSource(next);
    await processImageToPpt(next);
  }

  async function acceptToolSource(next: ImageToolSource) {
    if (activeImageToPpt) await acceptImageToPpt(next);
    else await acceptSource(next);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    if (tool === "extract") setTool("segmentation");
    const localImage = imageFilesFromList(event.dataTransfer.files)[0];
    const imageId = readImageDragId(event.dataTransfer);
    if (localImage) {
      await acceptToolSource({
        file: localImage,
        previewUrl: URL.createObjectURL(localImage),
        name: localImage.name || "本地图片",
        ownedUrl: true
      });
      return;
    }
    if (imageId) {
      await acceptToolSource({
        imageId,
        previewUrl: generatedImageUrl(imageId),
        name: "素材图片",
        ownedUrl: false
      });
      return;
    }
    setStatus({ kind: "error", text: "请拖入 AI 图片、素材图片或本地图片文件。" });
  }

  async function saveResultToMaterial() {
    if (!resultId) return;
    const response = await fetch("/api/employee/generated-images/" + resultId, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMaterial: true, materialOrder: nextMaterialOrder(myMaterials) })
    });
    const result = await response.json();
    if (!response.ok) return setStatus({ kind: "error", text: result.error || "存入素材库失败" });
    setResultSaved(true);
    setStatus({ kind: "ok", text: "已存入我的素材库。" });
    notify("已存入我的素材库");
    await refresh(true);
  }

  function chooseLocalFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setStatus({ kind: "error", text: "请选择图片文件。" });
    if (file.size > 30 * 1024 * 1024) return setStatus({ kind: "error", text: "图片不能超过 30MB。" });
    if (tool === "extract") setTool("segmentation");
    void acceptToolSource({
      file,
      previewUrl: URL.createObjectURL(file),
      name: file.name || "本地图片",
      ownedUrl: true
    });
  }

  async function extractPptImages() {
    if (!service.workDocument) return setStatus({ kind: "error", text: "当前订单还没有工作 PPT。" });
    const slideNumber = Math.max(1, Math.floor(extractSlide || 1));
    setExtractSlide(slideNumber);
    setOpen(true);
    setTool("extract");
    setBusy(true);
    setStatus({ kind: "busy", text: `正在提取第 ${slideNumber} 页图片...` });
    try {
      const response = await fetch("/api/employee/work-documents/" + service.workDocument.id + "/extract-images?slide=" + encodeURIComponent(String(slideNumber)), { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "PPT 图片提取失败");
      const items = await Promise.all((result.images || []).map(async (item: Omit<PptExtractedImage, "croppedDataUrl">) => ({
        ...item,
        croppedDataUrl: await cropDataUrlToPngDataUrl(item.dataUrl, item.crop)
      })));
      setExtractedImages(items);
      setStatus({ kind: items.length ? "ok" : "idle", text: items.length ? `已提取第 ${slideNumber} 页 ${items.length} 张图片，提取不消耗佐糖额度。` : `第 ${slideNumber} 页暂未发现可提取图片。` });
      if (result.truncated) notify("已提取前 40 张 PPT 图片");
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "PPT 图片提取失败" });
    } finally {
      setBusy(false);
    }
  }

  async function saveExtractedToMaterial(item: PptExtractedImage) {
    setBusy(true);
    setStatus({ kind: "busy", text: "正在存入我的素材库..." });
    try {
      const blob = await dataUrlToBlob(item.croppedDataUrl);
      const form = new FormData();
      form.set("image", new File([blob], `ppt-slide-${item.slideNumber}-${item.id}.png`, { type: "image/png" }));
      form.set("addToMaterial", "true");
      const response = await fetch("/api/employee/services/" + service.id + "/import-image", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "存入素材库失败");
      setStatus({ kind: "ok", text: "已存入我的素材库。" });
      notify("已存入我的素材库");
      await refresh(true);
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "存入素材库失败" });
    } finally {
      setBusy(false);
    }
  }

  async function sendExtractedToSegmentation(item: PptExtractedImage) {
    const blob = await dataUrlToBlob(item.croppedDataUrl);
    await acceptSource({
      file: new File([blob], `ppt-slide-${item.slideNumber}-${item.id}.png`, { type: "image/png" }),
      previewUrl: item.croppedDataUrl,
      name: `PPT 第 ${item.slideNumber} 页图片`,
      ownedUrl: false
    });
  }

  const toolTitle = activeExtract ? "从 PPT 提取素材" : activeImageToPpt ? "图片转 PPT" : "佐糖" + activeImageTool.label;
  const toolDescription = activeExtract
    ? "只提取指定页，避免全局扫描大量图片。"
    : activeImageToPpt
      ? "拖入一张图片，Codia 会转换为可下载的 PPTX 文件。"
      : activeImageTool.description;
  const localButtonText = activeImageToPpt ? "选择图片" : "本地图片";

  return <section className={"image-tools-panel " + (open ? "is-open" : "")}>
    <button className="image-tools-toggle" onClick={() => setOpen(value => !value)}><Scissors/>{open ? "收起图片工具" : "图片工具"}</button>
    {open && <div className="image-tools-card">
      <aside>
        <b>工具库</b>
        <button className={tool === "segmentation" ? "active" : ""} onClick={() => setTool("segmentation")} title={techszImageToolById("segmentation").description}><Scissors/>智能抠图</button>
        <button className={activeImageToPpt ? "active" : ""} onClick={() => setTool("imageToPpt")} title="把单张图片交给 Codia 转成 PPTX 文件"><FileText/>图片转 PPT</button>
        <button className={activeExtract ? "active" : ""} onClick={() => { setTool("extract"); if (!extractedImages.length) void extractPptImages(); }}><FileText/>PPT 提取</button>
        {imageToolButtons.map(item => <button key={item.id} className={tool === item.id ? "active" : ""} onClick={() => setTool(item.id)} title={item.description}><Scissors/>{item.label}</button>)}
      </aside>
      <main className={dragging ? "is-dragging" : ""}
        onDragEnter={event => { event.preventDefault(); event.stopPropagation(); setDragging(true); }}
        onDragOver={event => { event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
        onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={event => { void handleDrop(event); }}>
        <header><div><b>{toolTitle}</b><span>{toolDescription}</span></div><input ref={fileRef} hidden type="file" accept="image/*" onChange={event => { chooseLocalFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}/>{activeExtract ? <div className="ppt-extract-controls"><label>第 <input type="number" min={1} value={extractSlide} onChange={event => setExtractSlide(Math.max(1, Number(event.currentTarget.value) || 1))}/> 页</label><button onClick={extractPptImages} disabled={busy}><FileText/>提取本页</button></div> : <button onClick={() => fileRef.current?.click()}><Upload/>{localButtonText}</button>}</header>
        {activeExtract ? <div className="ppt-extract-grid">{extractedImages.length ? extractedImages.map(item => <article key={item.id}><img src={item.croppedDataUrl} alt={item.name}/><div><span>第 {item.slideNumber} 页</span><b>{item.crop.left || item.crop.top || item.crop.right || item.crop.bottom ? "已按裁剪区域提取" : "原始图片"}</b></div><footer><button onClick={() => void saveExtractedToMaterial(item)} disabled={busy}><ImagePlus/>存入素材库</button><button onClick={() => void sendExtractedToSegmentation(item)} disabled={busy} title="会调用佐糖 API 并消耗额度"><Scissors/>佐糖抠图</button></footer></article>) : <div className="ppt-extract-empty"><FileText/><p>{busy ? "正在扫描 PPT 图片..." : "点击重新提取，或先确认当前 PPT 已保存。"}</p></div>}</div> : <>
          <div className="image-tools-workbench">
            <article><span>原图</span>{source ? <img src={source.previewUrl} alt={source.name}/> : <div><ImagePlus/><p>{activeImageToPpt ? "拖入图片开始转换" : "把素材库图片拖到这里"}</p></div>}</article>
            <article className="result"><span>{activeImageToPpt ? "PPTX 结果" : activeImageTool.shortLabel + "结果"}</span>{activeImageToPpt ? <div className={"image-to-ppt-preview " + (imageToPptResult ? "ready" : "")}>{busy ? <LoaderCircle className="spin"/> : <FileText/>}<b>{imageToPptResult?.fileName || "等待转换"}</b><p>{imageToPptResult ? "Codia 已完成转换，可以下载 PPTX。" : busy ? "正在把图片转换成 PPTX..." : "拖入图片后会自动调用 Codia。"}</p>{imageToPptResult?.codiaTaskId && <small>任务 {imageToPptResult.codiaTaskId}</small>}</div> : resultUrl ? <img src={resultUrl} alt={"佐糖" + activeImageTool.label + "结果"}/> : <div><Scissors/><p>{busy ? "正在处理..." : "结果会显示在这里"}</p></div>}</article>
          </div>
        </>}
        <footer>{showToolStatus && <p className={status.kind}>{busy && <LoaderCircle className="spin"/>}{status.text}</p>}{!activeExtract && <div>{activeImageToPpt ? <><button onClick={() => source && void processImageToPpt(source)} disabled={!source || busy}><FileText/>{busy ? "转换中" : "重新转换"}</button>{imageToPptResult ? <a className="save" href={imageToPptResult.downloadUrl} download={imageToPptResult.fileName}><Download/>下载 PPTX</a> : <button className="save" disabled><Download/>下载 PPTX</button>}</> : <><button onClick={() => source && void processSegmentation(source)} disabled={!source || busy}><Scissors/>{busy ? "处理中" : "重新处理"}</button><button className="save" onClick={saveResultToMaterial} disabled={!resultId || busy || resultSaved}><ImagePlus/>{resultSaved ? "已存入" : "存入素材库"}</button></>}</div>}</footer>
      </main>
    </div>}
  </section>;
}

function PptPasteTray({ notify }: { notify: (text: string) => void }) {
  const [item, setItem] = useState<PasteTrayItem | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error" | "busy"; text: string }>({
    kind: "idle",
    text: "拖入一张图片，复制后在 PPT 当前页粘贴。"
  });
  const [dragging, setDragging] = useState(false);
  const itemRef = useRef<PasteTrayItem | null>(null);

  const replaceItem = useCallback((next: PasteTrayItem | null) => {
    setItem(current => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      itemRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (itemRef.current) URL.revokeObjectURL(itemRef.current.previewUrl);
  }, []);

  async function trayItemFromBlob(blob: Blob, name: string) {
    const pngBlob = await blobToPngBlob(blob);
    const dataUrl = await blobToDataUrl(pngBlob);
    return {
      name: name.replace(/\.[a-z0-9]+$/i, "") + ".png",
      previewUrl: URL.createObjectURL(pngBlob),
      dataUrl,
      pngBlob
    };
  }

  async function copyItem(next: PasteTrayItem) {
    const mode = await copyPngBlobToClipboard(next.pngBlob, next.dataUrl);
    setStatus({ kind: "ok", text: mode === "native" ? "已复制，点击 PPT 当前页后按 Ctrl+V。" : "已用兼容模式复制，点击 PPT 当前页后按 Ctrl+V。" });
    notify("图片已复制到剪贴板");
  }

  async function acceptBlob(blob: Blob, name: string) {
    setStatus({ kind: "busy", text: "正在准备剪贴板图片..." });
    const next = await trayItemFromBlob(blob, name);
    replaceItem(next);
    try {
      await copyItem(next);
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "自动复制失败，请点重新复制。" });
    }
  }

  async function acceptGeneratedImage(imageId: string) {
    const response = await fetch(generatedImageUrl(imageId), { cache: "no-store" });
    if (!response.ok) throw new Error("素材图片读取失败，请刷新后重试。");
    await acceptBlob(await response.blob(), "wzlcf-material-" + imageId);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const localImage = imageFilesFromList(event.dataTransfer.files)[0];
    const imageId = readImageDragId(event.dataTransfer);
    try {
      if (localImage) return await acceptBlob(localImage, localImage.name || "wzlcf-local-image.png");
      if (imageId) return await acceptGeneratedImage(imageId);
      setStatus({ kind: "error", text: "请拖入 AI 图片、素材图片或本地图片文件。" });
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "图片复制失败，请稍后重试。" });
    }
  }

  async function recopy() {
    if (!item) return;
    setStatus({ kind: "busy", text: "正在重新复制..." });
    try {
      await copyItem(item);
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "重新复制失败，请使用下载兜底。" });
    }
  }

  function clear() {
    replaceItem(null);
    setStatus({ kind: "idle", text: "拖入一张图片，复制后在 PPT 当前页粘贴。" });
  }

  return <aside className={"ppt-paste-tray " + (dragging ? "is-dragging" : "")}
    onDragEnter={event => { event.preventDefault(); setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { void handleDrop(event); }}>
    <div className="ppt-paste-preview">{item ? <img src={item.previewUrl} alt="PPT 粘贴托盘图片"/> : <Clipboard/>}</div>
    <div className="ppt-paste-body">
      <header><b>PPT 粘贴托盘</b><span>无刷新插图</span></header>
      <p className={status.kind}>{status.text}</p>
      <div>
        <button onClick={recopy} disabled={!item || status.kind === "busy"}><Clipboard/>重新复制</button>
        {item ? <a href={item.previewUrl} download={item.name}><Download/>下载兜底</a> : <button disabled><Download/>下载兜底</button>}
        <button onClick={clear} disabled={!item}><Trash2/>清空</button>
      </div>
    </div>
  </aside>;
}

function MaterialRail({ service, employee, refresh, notify }: { service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
  const [page, setPage] = useState(Number.MAX_SAFE_INTEGER);
  const [allPage, setAllPage] = useState(1);
  const [filterEmployeeId, setFilterEmployeeId] = useState("all");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [preview, setPreview] = useState<ImagePreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const materialCountRef = useRef(0);
  const pageSize = 6;
  const allPageSize = 24;
  const myMaterials = useMemo(() => service.materialItems.filter(item => item.employee.id === employee.id).sort((a, b) => (a.materialOrder - b.materialOrder) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [employee.id, service.materialItems]);
  const totalPages = Math.max(1, Math.ceil(myMaterials.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const pageItems = myMaterials.slice((safePage - 1) * pageSize, safePage * pageSize);
  const employees = useMemo(() => Array.from(new Map(service.materialItems.map(item => [item.employee.id, item.employee])).values()), [service.materialItems]);
  const allMaterials = useMemo(() => (filterEmployeeId === "all" ? service.materialItems : service.materialItems.filter(item => item.employee.id === filterEmployeeId)).slice().sort((a, b) => (a.materialOrder - b.materialOrder) || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [filterEmployeeId, service.materialItems]);
  const allTotalPages = Math.max(1, Math.ceil(allMaterials.length / allPageSize));
  const safeAllPage = Math.min(allPage, allTotalPages);
  const allPageItems = allMaterials.slice((safeAllPage - 1) * allPageSize, safeAllPage * allPageSize);

  useEffect(() => {
    const previous = materialCountRef.current;
    materialCountRef.current = myMaterials.length;
    if (myMaterials.length <= previous) return;
    const timer = window.setTimeout(() => setPage(Number.MAX_SAFE_INTEGER), 0);
    return () => window.clearTimeout(timer);
  }, [myMaterials.length]);

  async function setMaterial(id: string, isMaterial: boolean, materialOrder = nextMaterialOrder(myMaterials)) {
    const response = await fetch("/api/employee/generated-images/" + id, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isMaterial, materialOrder })
    });
    const result = await response.json();
    if (!response.ok) return notify(result.error);
    notify(isMaterial ? "已复制到我的素材库" : "已从我的素材库移除");
    if (isMaterial) setPage(Number.MAX_SAFE_INTEGER);
    await refresh(true);
  }

  async function importLocalImages(files: File[]) {
    const images = imageFilesFromList(files);
    if (!images.length) return notify("请拖入图片文件");
    setImporting(true);
    setImportProgress(images.length > 1 ? `正在导入 0 / ${images.length}` : "正在导入素材...");
    try {
      let imported = 0;
      for (const [index, file] of images.entries()) {
        setImportProgress(images.length > 1 ? `正在导入 ${index + 1} / ${images.length}` : "正在导入素材...");
        const form = new FormData();
        form.set("image", file);
        form.set("addToMaterial", "true");
        const response = await fetch("/api/employee/services/" + service.id + "/import-image", { method: "POST", body: form });
        const result = await response.json();
        if (!response.ok) {
          notify(result.error || `${file.name} 导入失败`);
          continue;
        }
        imported += 1;
      }
      if (imported) notify(`已导入 ${imported} 张图片到我的素材库`);
      setPage(Number.MAX_SAFE_INTEGER);
      await refresh(true);
    } finally {
      setImporting(false);
      setImportProgress("");
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const localImages = imageFilesFromList(event.dataTransfer.files);
    if (localImages.length) return void importLocalImages(localImages);
    const imageId = readImageDragId(event.dataTransfer);
    if (imageId) return void setMaterial(imageId, true);
    notify("请拖入 AI 图片、素材图片或本地图片文件。");
  }

  return <footer className={"material-rail " + (importing ? "is-importing" : "")} onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDrop={handleDrop}>
    <div><ImagePlus/><span><b>我的素材库</b><small>最后一页是最新素材，支持多张导入</small></span><input ref={importRef} hidden type="file" accept="image/*" multiple onChange={event => { const files = imageFilesFromList(event.currentTarget.files || []); if (files.length) void importLocalImages(files); event.currentTarget.value = ""; }}/><button className="material-import-button" onClick={() => importRef.current?.click()} disabled={importing}><Upload/>导入图片</button></div>
    <section className="material-shelf">{pageItems.length ? pageItems.map(item => <article key={item.id} draggable onDragStartCapture={event => writeImageDragData(event, item.image.id, "material")} onDragEnd={finishImageDrag}><button className="material-thumb" onClick={() => setPreview({ id: item.image.id, prompt: item.image.job.prompt, owner: item.image.job.employee.name, model: item.image.job.model })}><img draggable={false} src={generatedImageUrl(item.image.id)} alt="我的素材"/></button><a href={generatedImageDownloadUrl(item.image.id)}><Download/></a><button onClick={() => setMaterial(item.image.id, false)}><X/></button></article>) : <p>把右侧生成结果或本地图片拖到这里，建立你的个人素材库。</p>}</section>
    <PptPasteTray notify={notify}/>
    <div className="material-pager"><button title="看更旧的素材" onClick={() => setPage(Math.max(1, safePage - 1))} disabled={safePage <= 1}><ChevronLeft/></button><span>第 {safePage} / {totalPages} 页</span><button title="看更新的素材" onClick={() => setPage(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages}><ChevronRight/></button><button className="material-open-all" onClick={() => setLibraryOpen(true)}>素材总库</button></div>
    {importing && <div className="material-importing"><LoaderCircle className="spin"/>{importProgress || "正在导入素材..."}</div>}
    {libraryOpen && <div className="material-modal"><div className="material-modal-card"><header><div><b>订单素材总库</b><span>查看所有员工收录的素材，不会混入你的个人库。</span></div><button onClick={() => setLibraryOpen(false)}><X/></button></header><div className="material-filters"><button className={filterEmployeeId === "all" ? "active" : ""} onClick={() => { setFilterEmployeeId("all"); setAllPage(1); }}>全部</button>{employees.map(item => <button key={item.id} className={filterEmployeeId === item.id ? "active" : ""} onClick={() => { setFilterEmployeeId(item.id); setAllPage(1); }}>{item.name}</button>)}</div><section>{allPageItems.length ? allPageItems.map(item => { const owned = myMaterials.some(material => material.image.id === item.image.id); return <article key={item.id} draggable onDragStartCapture={event => writeImageDragData(event, item.image.id, "material")} onDragEnd={finishImageDrag}><em>{item.employee.name}</em><button className="material-thumb" onClick={() => setPreview({ id: item.image.id, prompt: item.image.job.prompt, owner: item.employee.name, model: item.image.job.model })}><img draggable={false} src={generatedImageUrl(item.image.id)} alt={item.employee.name + " 的素材"}/></button><div><a href={generatedImageDownloadUrl(item.image.id)}><Download/></a><button disabled={owned} onClick={() => setMaterial(item.image.id, true)}><ImagePlus/>{owned ? "已在我的库" : "加入我的库"}</button></div></article>; }) : <p>当前筛选下暂无素材。</p>}</section><footer><button onClick={() => setAllPage(value => Math.min(allTotalPages, value + 1))} disabled={safeAllPage >= allTotalPages}><ChevronLeft/>更旧</button><span>第 {safeAllPage} / {allTotalPages} 页</span><button onClick={() => setAllPage(value => Math.max(1, value - 1))} disabled={safeAllPage <= 1}>更新<ChevronRight/></button></footer></div></div>}
    {preview && <ImagePreviewModal image={preview} onClose={() => setPreview(null)}/>}
  </footer>;
}

function SmartStudio({ service, notify }: { service: Service; notify: (text: string) => void }) {
  const [tool, setTool] = useState<"generate" | "polish" | "image">("generate");
  const [runs, setRuns] = useState<DeckGenerationRun[]>([]);
  const [activeRun, setActiveRun] = useState<DeckGenerationRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [projectName, setProjectName] = useState(service.title);
  const [projectType, setProjectType] = useState("");
  const [brief, setBrief] = useState("");
  const [pageCount, setPageCount] = useState(12);
  const [stylePack, setStylePack] = useState("blue-gold-tech");
  const [referenceText, setReferenceText] = useState("");
  const [polishNote, setPolishNote] = useState("");
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageCount, setImageCount] = useState(1);
  const [imageBusy, setImageBusy] = useState(false);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  const unityOptions = { ...defaultDeckUnityOptions };

  const loadRuns = useCallback(async () => {
    const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) return notify(result.error || "智能任务读取失败");
    setRuns(result.runs || []);
    setActiveRun(current => current ? (result.runs || []).find((item: DeckGenerationRun) => item.id === current.id) || current : result.runs?.[0] || null);
  }, [notify, service.id]);

  useEffect(() => { const timer = window.setTimeout(() => void loadRuns(), 0); return () => window.clearTimeout(timer); }, [loadRuns]);
  useEffect(() => {
    if (!activeRun || !["sources_queued", "source_processing", "queued", "planning", "matching_queued", "matching", "confirmed", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(activeRun.status)) return;
    const timer = window.setInterval(() => void loadRuns(), 2400);
    return () => window.clearInterval(timer);
  }, [activeRun, loadRuns]);

  function setRun(run: DeckGenerationRun) {
    setActiveRun(run);
    setRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
  }

  async function createDeckRun() {
    if (!projectName.trim()) return notify("请填写项目名称");
    if (!brief.trim()) return notify("请填写项目简介");
    const form = new FormData();
    form.set("projectName", projectName.trim());
    form.set("projectType", projectType.trim());
    form.set("brief", brief.trim());
    form.set("referenceText", referenceText.trim());
    form.set("pageCount", String(pageCount));
    form.set("stylePack", stylePack);
    form.set("unityOptions", JSON.stringify(unityOptions));
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "生成方案创建失败");
      setRun(result.run);
      notify("已开始生成大纲和视觉方案");
    } finally {
      setBusy(false);
    }
  }

  async function confirmRun() {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeRun.id}/confirm`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "确认生成失败");
      setRun(result.run);
      notify("已开始批量生成页面图片");
    } finally {
      setBusy(false);
    }
  }

  async function createPpt() {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeRun.id}/ppt`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "PPT 生成失败");
      setRun(result.run);
      notify(result.run.status === "ppt_ready" ? "PPT 已生成" : "已进入 PDF 转 PPT 队列");
    } finally {
      setBusy(false);
    }
  }

  async function replanRun(stylePack?: string) {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeRun.id}/replan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stylePack: stylePack || activeRun.stylePack })
      });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "重新整理方案失败");
      setRun(result.run as DeckGenerationRun);
      notify("已重新整理生成 PPT 方案");
    } finally {
      setBusy(false);
    }
  }


  async function regenerateSlide(slideId: string, action: "reroll" | "closer_previous") {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs/${activeRun.id}/slides/${slideId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "页面重生失败");
      if (result.run) setRun(result.run);
      else await loadRuns();
      notify(action === "closer_previous" ? "已按上一页风格重生本页" : "已重新生成本页");
    } finally {
      setBusy(false);
    }
  }

  async function generateImage() {
    if (!imagePrompt.trim()) return notify("请填写生图提示词");
    const form = new FormData();
    form.set("prompt", imagePrompt.trim());
    form.set("count", String(imageCount));
    setImageBusy(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/generate-images`, { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "图片生成失败");
      notify(`已生成 ${result.job.images.length} 张图片`);
    } finally {
      setImageBusy(false);
    }
  }


  return <main className="design-studio smart-studio">
    <section className="design-board smart-board">
      <header><span>WZLCF · INTELLIGENT SLIDE DESIGN</span><h1>将想法变为产品</h1></header>
      <section className="design-mentor-large-panel smart-panel-static">
        <header><div><b>小 W · PPT 智能模式</b><span>选择任务类型，按当前工作流继续生成</span></div></header>
        <div className="design-tool-tabs">
          <button className={tool === "generate" ? "active" : ""} onClick={() => setTool("generate")}><FileText/><span><b>生成 PPT</b><small>整套文稿规划</small></span></button>
          <button className={tool === "polish" ? "active" : ""} onClick={() => setTool("polish")}><WandSparkles/><span><b>美化 PPT</b><small>粗稿统一重绘</small></span></button>
          <button className={tool === "image" ? "active" : ""} onClick={() => setTool("image")}><ImagePlus/><span><b>生图</b><small>生成 16:9 PNG</small></span></button>
        </div>
        {tool === "polish" ? <PolishPptPlanner service={service} note={polishNote} setNote={setPolishNote} notify={notify}/> : tool === "generate" ? <DeckGenerationForm service={service} notify={notify} onCreated={setRun}/> : false && tool !== "image" && <div className="deck-generation-form">
          <label>项目名称<input value={projectName} onChange={event => setProjectName(event.target.value)} placeholder="例如：新能源品牌年度发布会"/></label>
          {tool === "generate" && <label>比赛类型 / 用途<input value={projectType} onChange={event => setProjectType(event.target.value)} placeholder="例如：创新创业大赛 / 商业计划书"/></label>}
          <div className="deck-page-slider"><label>PPT 页数</label><div><input type="range" min={2} max={20} value={pageCount} style={{ "--range-progress": `${((pageCount - 2) / 18) * 100}%` } as CSSProperties} onChange={event => setPageCount(Number(event.target.value))}/><b>{pageCount}页</b></div></div>
          <label>风格包<select value={stylePack} onChange={event => setStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
          {tool === "generate" ? <>
            <label>项目简介<textarea value={brief} onChange={event => setBrief(event.target.value)} placeholder="描述项目背景、核心内容、目标受众和必须出现的信息。"/></label>
            <label>参考文档 / 参考图片（可选）<textarea value={referenceText} onChange={event => setReferenceText(event.target.value)} placeholder="先粘贴关键资料、评审要求、产品信息。复杂文档解析后续再加强。"/></label>
            <button onClick={() => void createDeckRun()} disabled={busy}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}生成方案</button>
          </> : <>
            <label>美化范围<select defaultValue="all" disabled><option value="all">整套 PPT</option><option value="selected">指定页面</option></select></label>
            <label>修改要求<textarea value={polishNote} onChange={event => setPolishNote(event.target.value)} placeholder="例如：更商务、更像发布会、减少文字、强化科技感。此入口暂不提交真实任务。"/></label>
            <button type="button" onClick={() => notify("美化 PPT 先恢复为占位入口，真实链路暂不启用")}>{<WandSparkles/>}即将接入</button>
          </>}
        </div>}
        {tool === "image" && <div className="deck-generation-form">
          <label>提示词<textarea value={imagePrompt} onChange={event => setImagePrompt(event.target.value)} placeholder="例如：深蓝科技发布会风格的 16:9 PPT 页面，清晰标题区、未来感背景、留白充足。"/></label>
          <label>生成份数<select value={imageCount} onChange={event => setImageCount(Number(event.target.value))}>{[1,2,3,4].map(value => <option key={value} value={value}>{value}份</option>)}</select></label>
          <button onClick={() => void generateImage()} disabled={imageBusy}>{imageBusy ? <LoaderCircle className="spin"/> : <Sparkles/>}开始生成</button>
        </div>}
      </section>
    </section>
    <aside className="design-run-history smart-run-history">{runs.map(run => <button key={run.id} className={activeRun?.id === run.id ? "active" : ""} onClick={() => setActiveRun(run)}><span>生成 PPT</span><b>{run.projectName}</b><small>{deckStatusText(run.status)}</small></button>)}</aside>
    {activeRun && <section className="deck-generation-overlay smart-overlay"><DeckGenerationRunPanel service={service} run={activeRun} busy={busy} onRunUpdate={setRun} onConfirm={() => void confirmRun()} onReplan={(stylePack) => void replanRun(stylePack)} onCreatePpt={() => void createPpt()} onRegenerate={(slideId, action) => void regenerateSlide(slideId, action)} onPreview={setPreviewImage}/></section>}
    {previewImage && <ExplodeImagePreview image={previewImage} onClose={() => setPreviewImage(null)}/>}
  </main>;
}


function maskPhone(phone: string) { return `${phone.slice(0, 3)}****${phone.slice(-4)}`; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("zh-CN"); }
function formatDateTime(value: string) { return new Date(value).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }); }
function deckStatusText(status: string) {
  return ({
    queued: "排队中",
    sources_queued: "资料排队中",
    source_processing: "正在读取资料",
    outline_ready: "待确认逐页结构",
    matching_queued: "逐页取材排队中",
    matching: "正在逐页匹配资料",
    planning: "生成方案中",
    plan_ready: "待确认方案",
    confirmed: "排队执行",
    generating: "生成页面中",
    review_ready: "预览待确认",
    pdf_queued: "正在生成 PDF",
    pdf_ready: "PDF 已生成",
    ppt_queued: "Codia 排队中",
    ppt_processing: "Codia 转换中",
    ppt_ready: "PPT 已生成",
    failed: "失败"
  } as Record<string, string>)[status] || status;
}

function statusSlug(status: string) {
  return ({ "待开始": "waiting", "制作中": "making", "待客户确认": "confirm", "修改中": "revision", "已完成": "done" } as Record<string, string>)[status] || "making";
}
function formatDeckFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function DeckGenerationForm({ service, notify, onCreated }: {
  service: Service;
  notify: (text: string) => void;
  onCreated: (run: DeckGenerationRun) => void;
}) {
  const [generationMode, setGenerationMode] = useState<"quick" | "advanced">("quick");
  const [projectName, setProjectName] = useState(service.title);
  const [projectType, setProjectType] = useState("");
  const [pageCount, setPageCount] = useState(12);
  const [stylePack, setStylePack] = useState("blue-gold-tech");
  const [brief, setBrief] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [paletteMode, setPaletteMode] = useState<"preset" | "reference">("preset");
  const [themeReference, setThemeReference] = useState<File | null>(null);
  const [themePreview, setThemePreview] = useState("");
  const [unityOptions, setUnityOptions] = useState({ ...defaultDeckUnityOptions });
  const [submitting, setSubmitting] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const outlineInputRef = useRef<HTMLInputElement>(null);
  const themeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (themePreview) URL.revokeObjectURL(themePreview); }, [themePreview]);

  function addSourceFiles(files: File[]) {
    const allowed = /\.(pdf|docx|xlsx|pptx|txt|md|csv|json|png|jpe?g|webp)$/i;
    const accepted = files.filter(file => allowed.test(file.name) && file.size <= 200 * 1024 * 1024);
    if (!accepted.length) return notify("请选择 PDF、DOCX、XLSX、PPTX、文本或常见图片，单个不超过 200MB");
    setSourceFiles(current => {
      const unique = new Map(current.map(file => [`${file.name}:${file.size}:${file.lastModified}`, file]));
      accepted.forEach(file => unique.set(`${file.name}:${file.size}:${file.lastModified}`, file));
      const next = Array.from(unique.values()).slice(0, 30);
      if (unique.size > 30) notify("一次最多读取 30 份参考资料");
      return next;
    });
  }

  function chooseTheme(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      return notify("配色参考图请使用不超过 20MB 的 PNG、JPEG 或 WebP");
    }
    if (themePreview) URL.revokeObjectURL(themePreview);
    setThemeReference(file);
    setThemePreview(URL.createObjectURL(file));
    setPaletteMode("reference");
  }

  async function submit() {
    if (!projectName.trim()) return notify("请填写项目名称");
    if (!brief.trim()) return notify("请填写项目简介");
    if (generationMode === "advanced" && !outlineText.trim() && !outlineFile) return notify("高级版请填写每页结构，或上传一份大纲文件");
    if (paletteMode === "reference" && !themeReference) return notify("请上传一张配色参考图，或改用内置配色");
    const totalBytes = sourceFiles.reduce((total, file) => total + file.size, 0) + (outlineFile?.size || 0) + (themeReference?.size || 0);
    if (totalBytes > 500 * 1024 * 1024) return notify("本次全部资料合计不能超过 500MB");
    const form = new FormData();
    form.set("generationMode", generationMode);
    form.set("projectName", projectName.trim());
    form.set("projectType", projectType.trim());
    form.set("pageCount", String(pageCount));
    form.set("stylePack", stylePack);
    form.set("brief", brief.trim());
    form.set("referenceText", referenceText.trim());
    form.set("outlineText", outlineText.trim());
    form.set("paletteMode", paletteMode);
    form.set("unityOptions", JSON.stringify(unityOptions));
    sourceFiles.forEach(file => form.append("references", file));
    if (outlineFile) form.set("outlineFile", outlineFile);
    if (paletteMode === "reference" && themeReference) form.set("themeReference", themeReference);
    setSubmitting(true);
    try {
      const response = await fetch(`/api/employee/services/${service.id}/deck-generation/runs`, { method: "POST", body: form });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "生成 PPT 任务创建失败");
      onCreated(result.run as DeckGenerationRun);
      notify(generationMode === "advanced" ? "已开始读取资料，完成后请确认逐页结构" : "已开始读取资料并生成快速方案");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="deck-generation-form deck-create-form">
    <div className="deck-version-switch" role="tablist" aria-label="生成版本">
      <button type="button" className={generationMode === "quick" ? "active" : ""} onClick={() => setGenerationMode("quick")}>
        <Sparkles/><span><b>快速版</b><small>少填写，自动整理完整方案</small></span>
      </button>
      <button type="button" className={generationMode === "advanced" ? "active" : ""} onClick={() => setGenerationMode("advanced")}>
        <FileText/><span><b>高级版</b><small>按你的逐页结构，从大量资料取材</small></span>
      </button>
    </div>

    <div className="deck-create-grid">
      <label>项目名称<input value={projectName} onChange={event => setProjectName(event.target.value)}/></label>
      <label>汇报类型 / 用途<input value={projectType} onChange={event => setProjectType(event.target.value)} placeholder="例如：领导汇报 / 学校介绍 / 商业计划书"/></label>
    </div>
    {generationMode === "quick" ? <div className="deck-page-slider">
      <label>PPT 页数</label>
      <div><input type="range" min={2} max={30} value={pageCount} onChange={event => setPageCount(Number(event.target.value))} style={{ "--range-progress": `${((pageCount - 2) / 28) * 100}%` } as CSSProperties}/><b>{pageCount}页</b></div>
    </div> : <div className="deck-page-count-note"><FileText/><span><b>页数由你的结构决定</b><small>资料读取完成后，可以增加、删除和调整每一页</small></span></div>}
    <label>项目简介<textarea value={brief} onChange={event => setBrief(event.target.value)} placeholder="说明汇报背景、对象、目标和必须回答的问题。"/></label>

    {generationMode === "advanced" && <section className="deck-outline-input">
      <header><div><b>你决定 PPT 结构</b><span>可以只写每页大标题，也可以继续规定小标题和想讲的内容</span></div><button type="button" onClick={() => outlineInputRef.current?.click()}><Upload/>上传大纲</button></header>
      <textarea value={outlineText} onChange={event => setOutlineText(event.target.value)} placeholder={"示例：\n第1页 封面：项目名称与核心口号\n第2页 学校办学条件\n- 小标题：学校规模、教学资源、实训条件\n- 想讲：用资料里的最新数据说明优势\n第3页 科研平台……"}/>
      {outlineFile && <div className="deck-outline-file"><FileText/><span>{outlineFile.name}</span><button type="button" onClick={() => setOutlineFile(null)} aria-label="移除大纲文件"><X/></button></div>}
      <input ref={outlineInputRef} type="file" hidden accept=".pdf,.docx,.xlsx,.pptx,.txt,.md" onChange={event => setOutlineFile(event.target.files?.[0] || null)}/>
    </section>}

    <label>补充要求（可选）<textarea value={referenceText} onChange={event => setReferenceText(event.target.value)} placeholder={generationMode === "quick" ? "可粘贴评审要求、重点信息和内容偏好；大量资料直接拖到下方。" : "可补充整套汇报的总要求、禁用表达和必须强调的结论。"}/></label>

    <section className="deck-source-section">
      <header><div><b>参考资料</b><span>{sourceFiles.length ? `已加入 ${sourceFiles.length} 份，系统会按页码和工作表保留来源` : "可一次拖入多份大资料，用户不用预先整理"}</span></div></header>
      <div className="deck-reference-drop deck-source-drop" onClick={() => sourceInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); addSourceFiles(Array.from(event.dataTransfer.files || [])); }}>
        <Upload/><b>把全部资料拖到这里</b><span>支持 PDF、Word、Excel、PPT、文本和图片；最多 30 份，合计 500MB</span>
      </div>
      <input ref={sourceInputRef} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" onChange={event => addSourceFiles(Array.from(event.target.files || []))}/>
      {sourceFiles.length > 0 && <div className="deck-source-list">{sourceFiles.map((file, index) => <article key={`${file.name}:${file.lastModified}`}><FileText/><span><b>{file.name}</b><small>{formatDeckFileSize(file.size)}</small></span><button type="button" onClick={() => setSourceFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${file.name}`}><X/></button></article>)}</div>}
    </section>

    <section className="deck-palette-section">
      <header><b>配色主题</b><span>选内置配色，或让系统从参考图提取颜色关系</span></header>
      <div className="deck-palette-grid">
        <button type="button" className={paletteMode === "preset" ? "active" : ""} onClick={() => setPaletteMode("preset")}><Check/><span><b>内置配色</b><small>稳定、快速，适合没有参考图时</small></span></button>
        <button type="button" className={paletteMode === "reference" ? "active" : ""} onClick={() => setPaletteMode("reference")}><ImagePlus/><span><b>参考图配色</b><small>分析颜色，不照抄参考图版式</small></span></button>
      </div>
      {paletteMode === "preset" ? <label>风格包<select value={stylePack} onChange={event => setStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <div className="deck-theme-reference" onClick={() => themeInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); chooseTheme(event.dataTransfer.files?.[0]); }}>
        {themePreview ? <><img src={themePreview} alt="配色参考"/><div><b>{themeReference?.name}</b><span>将提取背景、文字、强调色及使用比例</span></div></> : <><ImagePlus/><div><b>上传一张配色参考图</b><span>PNG、JPEG 或 WebP，不要求它是 PPT</span></div></>}
        <input ref={themeInputRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={event => chooseTheme(event.target.files?.[0])}/>
      </div>}
    </section>

    <div className="deck-unity-options">
      <label><input type="checkbox" checked={unityOptions.mainColor} onChange={event => setUnityOptions(current => ({ ...current, mainColor: event.target.checked }))}/>主色统一</label>
      <label><input type="checkbox" checked={unityOptions.headerFooter} onChange={event => setUnityOptions(current => ({ ...current, headerFooter: event.target.checked }))}/>页眉页脚统一</label>
      <label><input type="checkbox" checked={unityOptions.backgroundTexture} onChange={event => setUnityOptions(current => ({ ...current, backgroundTexture: event.target.checked }))}/>背景质感统一</label>
      <label><input type="checkbox" checked={unityOptions.cardStyle} onChange={event => setUnityOptions(current => ({ ...current, cardStyle: event.target.checked }))}/>卡片样式统一</label>
      <label><input type="checkbox" checked={unityOptions.decorativeElements} onChange={event => setUnityOptions(current => ({ ...current, decorativeElements: event.target.checked }))}/>装饰元素统一</label>
    </div>
    <button type="button" className="deck-create-submit" onClick={() => void submit()} disabled={submitting}>{submitting ? <LoaderCircle className="spin"/> : <Sparkles/>}{generationMode === "advanced" ? "读取资料并整理大纲" : "生成快速方案"}</button>
  </section>;
}
