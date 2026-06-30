"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import {
  Archive, ArrowRight, Bell, BookOpen, Check, ChevronLeft, ChevronRight,
  CircleUserRound, Clock3, Download, FileArchive, FileText, FolderHeart,
  Headphones, Layers3, LogOut, Menu, MessageCircle,
  MonitorSmartphone, MoreHorizontal, PackageCheck, Paperclip, Play,
  RefreshCw, Send, Settings, ShieldCheck, Sparkles, Trash2,
  WandSparkles, X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Attachment = { id: string; originalName: string; size: number };
type Message = { id: string; role: string; content: string; createdAt: string; attachments: Attachment[] };
type Consultation = {
  id: string; number: string; budget: string; selectedBudgets?: string; isCustomerGroup?: boolean;
  status: string; createdAt: string; updatedAt: string; messages: Message[];
};
type Version = { id: string; version: number; label: string; note: string; createdAt: string };
type Service = {
  id: string; number: string; title: string; category: string; purchasedAt: string;
  priceCents: number; status: string; progress: number; versions: Version[]; asset: { id: string } | null;
  consultationId?: string | null;
};
type Asset = { id: string; title: string; format: string; createdAt: string; service: Service };
type Session = { id: string; deviceLabel: string; createdAt: string; lastSeenAt: string };
export type User = {
  id: string; phone: string; createdAt: string; animationEnabled: boolean; notifications: boolean;
  services: Service[]; assets: Asset[]; consultations: Consultation[]; sessions: Session[];
};

const navItems = [
  { id: "intro", label: "服务介绍", icon: BookOpen },
  { id: "plans", label: "套餐服务", icon: WandSparkles },
  { id: "delivery", label: "服务交付", icon: PackageCheck },
  { id: "assets", label: "资产", icon: FolderHeart }
];
const budgets = [
  { range: "600~2000", tag: "轻量优化", note: "适合课程汇报、内部分享与简洁美化", color: "mint" },
  { range: "2000~5000", tag: "商务定制", note: "适合企业汇报、竞聘述职与品牌方案", color: "blue" },
  { range: "5000~8000", tag: "深度策划", note: "包含内容梳理、视觉体系与图表重构", color: "orange", recommended: true },
  { range: "8000~10000", tag: "高端路演", note: "适合发布会、融资路演和重要提案", color: "violet" },
  { range: "10000+", tag: "全案服务", note: "从策略、文案到动态演示的完整共创", color: "dark" }
];
const sampleSlides = [
  { eyebrow: "BRAND STRATEGY", title: "让好故事，拥有被看见的力量", kind: "cover" },
  { eyebrow: "MARKET INSIGHT", title: "增长不只是一条曲线", kind: "chart" },
  { eyebrow: "OUR APPROACH", title: "从信息到影响力", kind: "steps" },
  { eyebrow: "NEXT CHAPTER", title: "一起抵达更远的地方", kind: "final" }
];

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

export default function ClientApp({ initialUser }: { initialUser: User | null }) {
  const [user, setUser] = useState<User | null | undefined>(initialUser);
  const [active, setActive] = useState("intro");
  const [mobileNav, setMobileNav] = useState(false);
  const [chat, setChat] = useState<Consultation | null>(null);
  const [toast, setToast] = useState("");

  const loadUser = useCallback(async () => {
    const data = await fetch("/api/me").then((r) => r.json());
    setUser(data.user);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  if (user === undefined) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={loadUser} />;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
  }
  function navigate(id: string) {
    setActive(id); setChat(null); setMobileNav(false);
  }
  async function openBudget(range: string) {
    const existing = user!.consultations.find((item) => item.isCustomerGroup);
    if (existing && consultationBudgets(existing).includes(range)) return setChat(existing);
    const response = await fetch("/api/consultations", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: range })
    });
    const data = await response.json();
    if (!response.ok) return setToast(data.error || "咨询创建失败");
    await loadUser();
    setChat(data.consultation);
  }

  return (
    <div className="app-shell">
      <Sidebar active={active} navigate={navigate} user={user} logout={logout} open={mobileNav} close={() => setMobileNav(false)} />
      <main className="main-stage">
        <header className="mobile-header">
          <Brand />
          <button className="icon-button" onClick={() => setMobileNav(true)} aria-label="打开导航"><Menu /></button>
        </header>
        <AnimatePresence mode="wait">
          <motion.div key={chat ? "chat" : active} className="page-wrap"
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: user.animationEnabled ? .35 : 0 }}>
            {chat ? <ChatPage chat={chat} user={user} back={() => setChat(null)} refresh={loadUser} notify={setToast} /> :
              active === "intro" ? <Introduction /> :
              active === "plans" ? <Plans openBudget={openBudget} consultations={user.consultations} /> :
              active === "delivery" ? <Delivery user={user} openChat={setChat} refresh={loadUser} notify={setToast} /> :
              active === "assets" ? <Assets user={user} refresh={loadUser} notify={setToast} /> :
              <SettingsPage user={user} refresh={loadUser} logout={logout} notify={setToast} />}
          </motion.div>
        </AnimatePresence>
      </main>
      <AnimatePresence>{toast && <motion.div className="toast" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={17} />{toast}</motion.div>}</AnimatePresence>
    </div>
  );
}

function Brand() {
  return <div className="brand"><div className="logo-slot"><Image src="/brand/wzlcf-mark.png" alt="WZLCF 品牌标志" width={38} height={38} priority /></div><div><strong>WZLCF</strong><span>Presentation Studio</span></div></div>;
}

function Sidebar({ active, navigate, user, logout, open, close }: {
  active: string; navigate: (id: string) => void; user: User; logout: () => void; open: boolean; close: () => void;
}) {
  return <>
    <AnimatePresence>{open && <motion.button className="nav-backdrop" aria-label="关闭导航" onClick={close} initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} />}</AnimatePresence>
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <Brand />
      <div className="side-caption">客户工作台</div>
      <nav>
        {navItems.map((item) => <button key={item.id} onClick={() => navigate(item.id)} className={active === item.id ? "active" : ""}>
          <item.icon size={19} /><span>{item.label}</span>{item.id === "delivery" && <em>{user.services.length}</em>}
        </button>)}
      </nav>
      <div className="side-spacer" />
      <div className="side-support"><Headphones size={18} /><div><b>专属服务顾问</b><span>工作日 09:00 - 21:00</span></div><i /></div>
      <button className={`settings-link ${active === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}><Settings size={19} /><span>设置</span></button>
      <div className="side-profile">
        <div className="avatar">{user.phone.slice(-2)}</div>
        <div><b>{user.phone.slice(0,3)}****{user.phone.slice(-4)}</b><span>尊享客户</span></div>
        <button onClick={logout} aria-label="退出登录"><LogOut size={17} /></button>
      </div>
    </aside>
  </>;
}

function LoginScreen({ onLogin }: { onLogin: () => Promise<void> }) {
  const reduceMotion = useReducedMotion();
  const phoneRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [remember, setRemember] = useState(true);
  const [sent, setSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [devCode, setDevCode] = useState("");
  const phoneValid = /^1[3-9]\d{9}$/.test(phone);
  const codeValid = /^\d{6}$/.test(code);
  const canSubmit = sent ? codeValid : phoneValid;

  function updatePhone(value: string) {
    const next = value.replace(/\D/g, "").slice(0, 11);
    setPhone(next);
    setCode("");
    setSent(false);
    setDevCode("");
    if (phoneRef.current && phoneRef.current.value !== next) phoneRef.current.value = next;
  }

  function updateCode(value: string) {
    const next = value.replace(/\D/g, "").slice(0, 6);
    setCode(next);
    if (codeRef.current && codeRef.current.value !== next) codeRef.current.value = next;
  }

  useEffect(() => {
    const syncInputs = () => {
      const currentPhone = (phoneRef.current?.value ?? "").replace(/\D/g, "").slice(0, 11);
      const currentCode = (codeRef.current?.value ?? "").replace(/\D/g, "").slice(0, 6);
      if (currentPhone !== phone) updatePhone(currentPhone);
      if (currentCode !== code) updateCode(currentCode);
    };
    syncInputs();
    const timer = window.setInterval(syncInputs, 250);
    return () => window.clearInterval(timer);
  }, [phone, code]);

  useEffect(() => {
    if (!countdown) return;
    const timer = setInterval(() => setCountdown((v) => v - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  async function sendCode() {
    const currentPhone = (phoneRef.current?.value ?? phone).replace(/\D/g, "").slice(0, 11);
    if (currentPhone !== phone) setPhone(currentPhone);
    if (!/^1[3-9]\d{9}$/.test(currentPhone)) {
      setError("请输入正确的中国大陆手机号");
      return;
    }
    setError(""); setBusy(true);
    const response = await fetch("/api/auth/send-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: currentPhone }) });
    const data = await response.json(); setBusy(false);
    if (!response.ok) return setError(data.error);
    setSent(true); setCountdown(60); setDevCode(data.devCode ?? "");
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sent) return sendCode();
    const currentPhone = (phoneRef.current?.value ?? phone).replace(/\D/g, "").slice(0, 11);
    const currentCode = (codeRef.current?.value ?? code).replace(/\D/g, "").slice(0, 6);
    if (currentPhone !== phone) setPhone(currentPhone);
    if (currentCode !== code) setCode(currentCode);
    if (!/^\d{6}$/.test(currentCode)) {
      setError("请输入 6 位验证码");
      return;
    }
    setError(""); setBusy(true);
    const response = await fetch("/api/auth/verify", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: currentPhone, code: currentCode, remember })
    });
    const data = await response.json(); setBusy(false);
    if (!response.ok) return setError(data.error);
    await onLogin();
  }

  return <div className="login-page">
    <div className="login-top"><Brand /><a className="employee-mode" href="/employee" style={{textDecoration:"none"}}>员工模式 <ArrowRight size={14} /></a></div>
    <section className="login-showcase">
      <div className="orb orb-one" /><div className="orb orb-two" />
      <div className="showcase-copy">
        <div className="kicker"><Sparkles size={14} /> 专业 PPT 创意与交付平台</div>
        <h1>让每一次表达，<br /><span>都更有说服力。</span></h1>
        <p>从策略梳理到视觉呈现，我们把复杂的内容，变成令人愿意相信的故事。</p>
        <div className="proof-row"><span><b>1000+</b>精品项目</span><span><b>98%</b>客户推荐</span><span><b>7×12h</b>专属服务</span></div>
      </div>
      <div className="rising-deck" aria-label="PPT 制作动画">
        {[0,1,2,3].map((index) => <motion.div key={index} className={`rising-slide slide-${index}`}
          initial={reduceMotion ? false : { y: 380, opacity: 0, rotate: index % 2 ? 8 : -7 }}
          animate={{ y: index * -17, x: index * 17, opacity: 1, rotate: (index - 1.5) * 2.3 }}
          transition={{ duration: 1.05, delay: index * .22, type: "spring", stiffness: 70, damping: 14 }}>
          <MiniSlide index={index} />
        </motion.div>)}
        <motion.div className="deck-badge" initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:1.35}}>
          <span><Check size={14} /></span>专业演示稿已就绪
        </motion.div>
      </div>
    </section>
    <section className="login-panel">
      <div className="login-card">
        <div className="mobile-login-brand"><Brand /></div>
        <div className="welcome-mark"><span>W</span></div>
        <h2>欢迎来到 WZLCF</h2>
        <p className="login-lead">手机号验证后即可登录，新用户将自动创建账户</p>
        <form onSubmit={submit}>
          <label>手机号码</label>
          <div className="phone-field"><span>+86</span><input ref={phoneRef} value={phone} onInput={(e) => updatePhone(e.currentTarget.value)} onChange={(e) => updatePhone(e.target.value)} placeholder="请输入手机号码" inputMode="numeric" autoComplete="tel" /></div>
          {sent && <><label>验证码</label><div className="code-field"><input ref={codeRef} value={code} onInput={(e) => updateCode(e.currentTarget.value)} onChange={(e) => updateCode(e.target.value)} placeholder="6 位验证码" inputMode="numeric" autoComplete="one-time-code" /><button type="button" disabled={countdown > 0} onClick={sendCode}>{countdown ? `${countdown}s` : "重新获取"}</button></div></>}
          {devCode && <div className="dev-code">本地演示验证码：<b>{devCode}</b></div>}
          <label className="remember"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /><span><Check size={13} /></span>记住我 60 天</label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button login-button" disabled={busy || !canSubmit}>
            {busy ? <RefreshCw className="spin" size={18} /> : sent ? "验证并进入工作台" : "获取验证码"} {!busy && <ArrowRight size={18} />}
          </button>
        </form>
        <p className="agreement">继续即代表你同意《用户服务协议》和《隐私政策》</p>
        <div className="secure-note"><ShieldCheck size={15} /> 信息加密传输，仅用于身份验证</div>
      </div>
    </section>
  </div>;
}

function MiniSlide({ index }: { index: number }) {
  if (index === 0) return <div className="mini-content dark"><small>WZLCF / 2026</small><strong>IDEAS<br />WORTH<br /><i>SHARING.</i></strong><div className="mini-dot" /></div>;
  if (index === 1) return <div className="mini-content coral"><small>DATA STORY</small><b>增长，有迹可循</b><div className="mini-chart"><i/><i/><i/><i/><i/></div></div>;
  if (index === 2) return <div className="mini-content paper"><small>STRATEGY 03</small><b>从洞察到共鸣</b><div className="mini-grid"><i/><i/><i/></div></div>;
  return <div className="mini-content mint"><small>WZLCF STUDIO</small><b>你的下一次<br />重要表达</b><span>由此开始 →</span></div>;
}

function LoadingScreen() {
  return <div className="loading-screen"><div className="loading-logo">W</div><p>正在准备你的创意工作台</p><div className="loading-line"><i /></div></div>;
}

function PageHead({ kicker, title, text, action }: { kicker: string; title: string; text: string; action?: React.ReactNode }) {
  return <header className="page-head"><div><span className="page-kicker">{kicker}</span><h1>{title}</h1><p>{text}</p></div>{action}</header>;
}

function Introduction() {
  const [slide, setSlide] = useState(0);
  return <div>
    <PageHead kicker="WELCOME TO WZLCF" title="让内容拥有更好的表达" text="我们不只是美化页面，而是与你一起找到故事的重点。" action={<div className="head-pill"><span /> 当前服务在线</div>} />
    <section className="hero-editorial">
      <div className="hero-copy">
        <span className="issue">WZLCF · CREATIVE STUDIO</span>
        <h2>复杂的信息，<br />值得更<span>清晰</span>地被看见。</h2>
        <p>从商业逻辑、内容结构到视觉语言，我们让每一页都服务于你的目标，让听众不仅看懂，更愿意行动。</p>
        <div className="hero-actions"><button className="primary-button">了解服务流程 <ArrowRight size={17}/></button><button className="text-button"><Play size={15}/> 观看案例</button></div>
      </div>
      <div className="hero-art"><div className="art-card back"><span>IDEA</span></div><div className="art-card middle"><div className="art-bars"><i/><i/><i/></div></div><div className="art-card front"><small>MAKE IT<br/>MATTER.</small><strong>01</strong></div><div className="orange-disc" /></div>
    </section>
    <section className="section-block">
      <div className="section-title"><span>01 / 我们如何工作</span><h2>一份好演示，始于正确的问题</h2></div>
      <div className="process-grid">
        {[
          ["01","需求洞察","梳理目标、听众与使用场景，明确真正需要解决的问题。"],
          ["02","内容策划","重构信息层级，用清晰的叙事带领听众抵达结论。"],
          ["03","视觉设计","建立专属视觉语言，让品牌气质贯穿每一页。"],
          ["04","交付陪伴","多轮校对与修改支持，重要时刻始终有人同行。"]
        ].map(([n,t,d]) => <article key={n}><span>{n}</span><div className="process-icon">{n === "01" ? <MessageCircle/> : n === "02" ? <Layers3/> : n === "03" ? <Sparkles/> : <ShieldCheck/>}</div><h3>{t}</h3><p>{d}</p></article>)}
      </div>
    </section>
    <section className="sample-section">
      <div className="section-title light"><span>02 / 精选样品</span><h2>翻开一份正在发生的好故事</h2><p>页面已添加动态水印，仅供在线预览。</p></div>
      <div className="sample-viewer">
        <button onClick={() => setSlide((slide + 3) % 4)} aria-label="上一页"><ChevronLeft/></button>
        <div className="sample-frame">
          <AnimatePresence mode="wait"><motion.div key={slide} className={`sample-slide sample-${sampleSlides[slide].kind}`} initial={{opacity:0,rotateY:-18,x:30}} animate={{opacity:1,rotateY:0,x:0}} exit={{opacity:0,rotateY:15,x:-20}} transition={{duration:.45}}>
            <span className="sample-watermark">WZLCF · ONLINE PREVIEW · 138****0000</span>
            <small>{sampleSlides[slide].eyebrow}</small><h3>{sampleSlides[slide].title}</h3>
            {sampleSlides[slide].kind === "chart" && <div className="sample-bars">{[28,46,38,72,58,88].map((h,i)=><i key={i} style={{height:`${h}%`}} />)}</div>}
            {sampleSlides[slide].kind === "steps" && <div className="sample-step-row"><span>洞察</span><i/><span>结构</span><i/><span>设计</span><i/><span>影响</span></div>}
            <b className="sample-number">0{slide + 1}</b>
          </motion.div></AnimatePresence>
          <div className="sample-meta"><span>{String(slide + 1).padStart(2,"0")} / 04</span><div>{sampleSlides.map((_,i)=><i key={i} className={i===slide?"active":""}/>)}</div><em><ShieldCheck size={14}/> 仅供预览</em></div>
        </div>
        <button onClick={() => setSlide((slide + 1) % 4)} aria-label="下一页"><ChevronRight/></button>
      </div>
    </section>
    <section className="quality-strip"><div><Sparkles/><b>定制表达</b><span>拒绝套模板</span></div><div><ShieldCheck/><b>品质保障</b><span>逐页人工校验</span></div><div><Clock3/><b>准时交付</b><span>关键节点可追踪</span></div><div><RefreshCw/><b>修改支持</b><span>充分沟通再定稿</span></div></section>
  </div>;
}

function Plans({ openBudget, consultations }: { openBudget: (range: string) => void; consultations: Consultation[] }) {
  const customerGroup = consultations.find((item) => item.isCustomerGroup);
  return <div>
    <PageHead kicker="SERVICE PACKAGES" title="选择适合你的服务尺度" text="价格不是限制，而是我们共同定义项目深度的起点。" action={<div className="consult-tip"><MessageCircle size={17}/><div><b>不确定怎么选？</b><span>先和顾问聊聊</span></div></div>} />
    <section className="plans-hero"><div><span>从一页灵感，到一场重要发布</span><h2>每个预算，都值得<br/>被认真对待。</h2></div><div className="plan-sculpture"><i/><i/><i/></div></section>
    <div className="budget-grid">
      {budgets.map((plan,index) => <motion.button key={plan.range} className={`budget-card ${plan.color}`} onClick={() => openBudget(plan.range)} whileHover={{y:-8,scale:1.01}} transition={{type:"spring",stiffness:280}}>
        {plan.recommended && <em className="recommend">最受欢迎</em>}
        <div className="budget-top"><span>0{index+1}</span><ArrowRight/></div>
        <small>{plan.tag}</small><h3>¥ {plan.range}</h3><p>{plan.note}</p>
        <div className="budget-foot"><span>{customerGroup || consultations.some(c=>consultationBudgets(c).includes(plan.range)) ? "继续咨询" : "开启咨询"}</span><i /></div>
      </motion.button>)}
    </div>
    <div className="plan-note"><ShieldCheck/><span>所有套餐均包含需求梳理、专属设计师、进度同步与交付后修改支持。</span></div>
  </div>;
}

function Delivery({ user, openChat, refresh, notify }: { user: User; openChat: (c: Consultation)=>void; refresh:()=>Promise<void>; notify:(s:string)=>void }) {
  const [filter,setFilter]=useState("全部");
  const services = filter === "全部" ? user.services : user.services.filter(s=>s.status===filter);
  async function saveAsset(service: Service) {
    if (!confirm(`将“${service.title}”转为个人资产？保存后可在资产页预览和管理。`)) return;
    const response = await fetch(`/api/services/${service.id}/asset`, {method:"POST"});
    const data = await response.json();
    if (!response.ok) return notify(data.error);
    await refresh(); notify("项目已转为资产");
  }
  async function revise(service: Service) {
    const response = await fetch(`/api/services/${service.id}/revision`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) return notify(data.error);
    if (data.consultation) {
      openChat(data.consultation);
      await refresh();
    }
  }
  return <div>
    <PageHead kicker="SERVICE DELIVERY" title="每一次托付，都清晰可见" text="查看项目进度、交付版本，并在需要时随时发起修改。" action={<div className="delivery-stat"><b>{user.services.length}</b><span>项服务进行中与已完成</span></div>} />
    <div className="filter-row">{["全部","制作中","待客户确认","修改中","已完成"].map(item=><button key={item} className={filter===item?"active":""} onClick={()=>setFilter(item)}>{item}<span>{item==="全部"?user.services.length:user.services.filter(s=>s.status===item).length}</span></button>)}</div>
    <div className="service-list">
      {services.map((service,index)=><motion.article className="service-card" key={service.id} initial={{opacity:0,y:15}} animate={{opacity:1,y:0}} transition={{delay:index*.06}}>
        <div className={`service-thumb cover-${coverVariant(service.number)}`}><div><small>{service.category}</small><strong>{service.title}</strong><span>WZLCF</span></div></div>
        <div className="service-main">
          <div className="service-title-row"><div><span className={`status status-${service.status}`}>{service.status}</span><h3>{service.title}</h3></div><button><MoreHorizontal/></button></div>
          <div className="service-meta"><span>服务编号 <b>{service.number}</b></span><span>购买时间 <b>{formatDate(service.purchasedAt)}</b></span><span>服务价格 <b>¥ {(service.priceCents/100).toLocaleString()}</b></span></div>
          <div className="progress-row"><div><i style={{width:`${service.progress}%`}} /></div><b>{service.progress}%</b></div>
          <div className="service-actions">
            {service.status === "已完成" && <a className="soft-button" href={`/api/services/${service.id}/download`}><FileText size={16}/>下载交付</a>}
            <button className="soft-button" onClick={()=>revise(service)}><RefreshCw size={16}/>申请修改</button>
            {service.status === "已完成" && <button className={`asset-button ${service.asset?"saved":""}`} disabled={!!service.asset} onClick={()=>saveAsset(service)}>{service.asset?<><Check size={16}/>已转为资产</>:<><Archive size={16}/>转为资产</>}</button>}
          </div>
        </div>
      </motion.article>)}
    </div>
  </div>;
}

function Assets({ user, refresh, notify }: { user: User; refresh:()=>Promise<void>; notify:(s:string)=>void }) {
  const [preview,setPreview]=useState<Asset|null>(null);
  async function remove(asset: Asset) {
    if (!confirm("确定从资产库移除吗？原服务及交付记录不会被删除。")) return;
    await fetch(`/api/services/${asset.service.id}/asset`,{method:"DELETE"}); await refresh(); notify("资产已移除");
  }
  return <div>
    <PageHead kicker="MY ASSETS" title="你的创意资产，随时待命" text="已确认的最终成品将在账号有效期间长期保存。" action={<div className="head-pill"><ShieldCheck size={14}/> 授权访问与长期归档</div>} />
    <div className="asset-summary"><div><FolderHeart/><span><b>{user.assets.length}</b> 个作品资产</span></div><div className="storage"><span>云端空间</span><div><i style={{width:`${Math.max(8,user.assets.length*12)}%`}}/></div><b>{user.assets.length * 24} MB / 2 GB</b></div></div>
    {user.assets.length ? <div className="asset-grid">{user.assets.map((asset)=><article className="asset-card" key={asset.id}>
      <button className="asset-cover" onClick={()=>setPreview(asset)}><div className={`asset-visual cover-${coverVariant(asset.service.number)}`}><small>{asset.service.category}</small><strong>{asset.title}</strong><span>WZLCF · {asset.service.number}</span></div><i><Play size={19}/></i></button>
      <div className="asset-info"><div><span className="file-badge">P</span><div><h3>{asset.title}</h3><p>{asset.service.number} · {asset.service.status}</p></div></div><div className="asset-info-foot"><span>{formatDate(asset.createdAt)} 转为资产</span><div>{asset.service.status === "已完成" && <a title="下载" href={`/api/services/${asset.service.id}/download`}><Download size={16}/></a>}<button title="删除" onClick={()=>remove(asset)}><Trash2 size={16}/></button></div></div></div>
    </article>)}</div> : <div className="empty-state"><div><FolderHeart/></div><h3>资产库还在等待第一个作品</h3><p>服务完成后，可在“服务交付”中将订单转为资产，每个订单仅可保存一次。</p></div>}
    <AnimatePresence>{preview&&<motion.div className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setPreview(null)}><motion.div className="preview-modal" initial={{scale:.94,y:20}} animate={{scale:1,y:0}} onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setPreview(null)}><X/></button><div className="preview-canvas"><small>WZLCF / PROJECT ASSET</small><h2>{preview.title}</h2><div className="preview-shapes"><i/><i/><i/></div><span>让每一次表达，都更有说服力。</span></div><div className="preview-details"><div><span>关联服务</span><b>{preview.service.number}</b></div><div><span>当前状态</span><b>{preview.service.status}</b></div><div><span>历史版本</span><b>{preview.service.versions.length} 个</b></div>{preview.service.status === "已完成" ? <a className="primary-button" href={`/api/services/${preview.service.id}/download`}><Download size={17}/>下载最终文件</a> : <span className="asset-waiting"><Clock3 size={15}/> 成品交付后开放下载</span>}</div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}

function ChatPage({ chat, back, refresh, notify }: { chat: Consultation; user: User; back:()=>void; refresh:()=>Promise<void>; notify:(s:string)=>void }) {
  const [messages,setMessages]=useState(chat.messages);
  const [text,setText]=useState("");
  const [files,setFiles]=useState<File[]>([]);
  const [sending,setSending]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const selectedBudgets = consultationBudgets(chat);
  async function send() {
    if (!text.trim()&&!files.length) return;
    setSending(true); const form=new FormData(); form.set("content",text); files.forEach(f=>form.append("files",f));
    const response=await fetch(`/api/consultations/${chat.id}/messages`,{method:"POST",body:form}); const data=await response.json(); setSending(false);
    if(!response.ok) return notify(data.error);
    setMessages(v=>[...v,data.message]); setText(""); setFiles([]); await refresh();
  }
  return <div className="chat-layout">
    <div className="chat-top"><button className="back-button" onClick={back}><ChevronLeft/>返回套餐</button><div><span>咨询编号 {chat.number}</span><h2>客户专属咨询群</h2></div><div className="waiting"><i/>等待人工顾问</div></div>
    <div className="chat-body">
      <div className="chat-feed">
        <div className="chat-date">今天</div>
        <div className="advisor-intro"><div className="advisor-avatar">W</div><div><b>WZLCF 服务团队</b><span>通常在工作时间 30 分钟内回复</span></div></div>
        {messages.map(message=><div key={message.id} className={`message ${message.role==="customer"?"mine":""}`}>
          <div className="message-bubble">{message.content}{message.attachments?.map(file=><div className="file-chip" key={file.id}><FileArchive/><span>{file.originalName}<small>{formatSize(file.size)}</small></span></div>)}</div>
          <small>{new Date(message.createdAt).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</small>
        </div>)}
      </div>
      <div className="composer">
        {files.length>0&&<div className="selected-files">{files.map((file,i)=><span key={i}><Paperclip size={13}/>{file.name}<button onClick={()=>setFiles(v=>v.filter((_,n)=>n!==i))}><X size={12}/></button></span>)}</div>}
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="描述你的用途、页数、截止时间和偏好，我们会认真阅读..." onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send();}}}/>
        <div><input ref={fileRef} hidden type="file" multiple accept=".ppt,.pptx,.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.zip" onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,5))}/><button className="attach-button" onClick={()=>fileRef.current?.click()}><Paperclip/>添加附件</button><span>最多 5 个，共 100MB</span><button className="send-button" onClick={send} disabled={sending}>{sending?<RefreshCw className="spin"/>:<Send/>}</button></div>
      </div>
    </div>
    <aside className="chat-side"><h3>客户需求</h3><div className="chat-budget"><span>已选择预算</span><div className="budget-tags">{selectedBudgets.map((budget) => <b key={budget}>¥ {budget}</b>)}</div></div><dl><div><dt>咨询状态</dt><dd>等待回复</dd></div><div><dt>服务方式</dt><dd>团队协同服务</dd></div><div><dt>材料支持</dt><dd>PPT / PDF / ZIP</dd></div></dl><div className="privacy-box"><ShieldCheck/><div><b>资料安全保障</b><span>仅你和服务团队有权访问本次咨询材料。</span></div></div></aside>
  </div>;
}

function SettingsPage({ user, refresh, logout, notify }: { user:User; refresh:()=>Promise<void>; logout:()=>void; notify:(s:string)=>void }) {
  async function toggle(key:"animationEnabled"|"notifications", value:boolean) {
    await fetch("/api/settings",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({[key]:value})});
    await refresh(); notify("设置已保存");
  }
  async function revokeSession(id:string) {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    await refresh(); notify("设备会话已撤销");
  }
  return <div>
    <PageHead kicker="ACCOUNT SETTINGS" title="账户与偏好" text="管理登录安全、设备和你的使用体验。" />
    <div className="settings-grid">
      <section className="settings-card profile-settings"><div className="setting-heading"><CircleUserRound/><div><h3>账户信息</h3><p>你的基本身份与注册信息</p></div></div><div className="account-identity"><div>{user.phone.slice(-2)}</div><span><b>{user.phone.slice(0,3)} **** {user.phone.slice(-4)}</b><small>注册于 {formatDate(user.createdAt)}</small></span><button className="outline-button" onClick={logout}>重新验证</button></div><div className="verified-line"><ShieldCheck/><span>手机号码已验证</span><em>安全</em></div></section>
      <section className="settings-card"><div className="setting-heading"><Sparkles/><div><h3>体验偏好</h3><p>选择更适合你的页面体验</p></div></div><SettingToggle icon={<WandSparkles/>} title="页面动画" text="启用翻页、卡片悬浮与页面过渡" checked={user.animationEnabled} change={v=>toggle("animationEnabled",v)}/><SettingToggle icon={<Bell/>} title="消息提醒" text="服务状态变化和顾问回复时通知我" checked={user.notifications} change={v=>toggle("notifications",v)}/></section>
      <section className="settings-card sessions-card"><div className="setting-heading"><MonitorSmartphone/><div><h3>登录设备</h3><p>查看当前保持登录的设备</p></div></div>{user.sessions.map((session,index)=><div className="session-row" key={session.id}><div><MonitorSmartphone/></div><span><b>{session.deviceLabel}</b><small>{index===0?"当前设备 · 正在使用":`登录于 ${formatDate(session.createdAt)}`}</small></span>{index===0?<em>当前</em>:<button onClick={()=>revokeSession(session.id)}>撤销</button>}</div>)}</section>
      <section className="settings-card danger-card"><div className="setting-heading"><LogOut/><div><h3>退出账户</h3><p>退出后，本机需要重新进行手机验证</p></div></div><button className="logout-button" onClick={logout}>退出当前账户 <ArrowRight/></button></section>
    </div>
  </div>;
}

function SettingToggle({icon,title,text,checked,change}:{icon:React.ReactNode;title:string;text:string;checked:boolean;change:(v:boolean)=>void}) {
  return <div className="toggle-row"><div className="toggle-icon">{icon}</div><span><b>{title}</b><small>{text}</small></span><button className={`toggle ${checked?"on":""}`} onClick={()=>change(!checked)}><i/></button></div>;
}

function formatDate(date:string){return new Date(date).toLocaleDateString("zh-CN",{year:"numeric",month:"2-digit",day:"2-digit"});}
function formatSize(size:number){return size>1024*1024?`${(size/1024/1024).toFixed(1)} MB`:`${Math.ceil(size/1024)} KB`;}
function coverVariant(value:string){
  return Array.from(value).reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4;
}
