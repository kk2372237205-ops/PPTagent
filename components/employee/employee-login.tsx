/**
 * 员工登录页与工作台基础小件（可复用 UI 组件）
 *
 * 职责：
 *   1) EmployeeLogin：微信 / 企业微信双扫码登录页，含学校选择、二维码一次性 state、
 *      配置缺失提示，以及仅本地可用的开发绕过入口。
 *   2) MobileBlock / EmployeeBrand / EmployeeLoading：手机端阻断页、品牌标志、加载态。
 * 谁可以改：本模块单独维护；改动不要顺手改员工工作台主体。
 * 依赖：@/lib/employee-api、./employee-login-types、lucide-react、next/image、next/link。
 * 被谁用：components/employee-app.tsx。
 * 验证方式：npm run verify。
 *
 * 安全边界：登录配置接口只返回公开参数（AppID、CorpID、回调地址、一次性 state），
 * 任何 AppSecret 都只存在于服务端；开发绕过在服务端由 NODE_ENV 再次拦截。
 */

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, LoaderCircle, Monitor, QrCode, RefreshCw, School, ShieldCheck, Sparkles } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { EmployeeLoginConfig, EmployeeLoginProvider } from "./employee-login-types";

export function MobileBlock() {
  return <div className="employee-mobile-block"><Monitor/><h2>员工工作台仅支持电脑端</h2><p>请使用桌面浏览器进入订单与 PPT 协同制作工作台。</p><Link href="/">返回客户端</Link></div>;
}

export function EmployeeBrand() {
  return <div className="employee-brand"><div><Image src="/brand/wzlcf-mark.png" width={38} height={38} alt="WZLCF" /></div><span><b>WZLCF</b><small>Employee Studio</small></span></div>;
}

export function EmployeeLoading() {
  return <div className="employee-loading"><div>W</div><LoaderCircle className="spin"/><span>正在进入员工工作台</span></div>;
}

export function EmployeeLogin({ onLogin }: { onLogin: () => Promise<void> }) {
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
      const response = await employeeApi.session.loginConfig(targetProvider, query);
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
      const response = await employeeApi.session.me();
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
    const response = await employeeApi.session.devLogin(provider);
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