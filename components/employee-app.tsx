"use client";
/* eslint-disable @next/next/no-img-element */

import { DeckGenerationForm } from "@/components/employee/deck-generation-form";
import { DeckGenerationRunPanel } from "@/components/employee/deck-run-panels";
import { PolishPptPlanner } from "@/components/employee/polish-ppt-planner";
import type { LocalDesignReference, PptPolishRun } from "@/components/employee/polish-types";
import { ExplodeImagePreview } from "@/components/employee/explode-image-preview";
import { ImageExplodeStudio } from "@/components/employee/explode-studio";
import { AiPanel, ImageToolsPanel } from "@/components/employee/tools-ai-panels";
import { EmployeeAdmin } from "@/components/employee/employee-admin";
import { EmployeeLoading, EmployeeLogin, MobileBlock } from "@/components/employee/employee-login";
import { CustomerMessages, EmployeePending, EmployeeSettings, EmployeeSidebar, Orders, TeamView } from "@/components/employee/workbench-chrome";
import { MaterialRail } from "@/components/employee/material-rail";
import { PolishInlineRun } from "@/components/employee/polish-inline-run";
import { OnlyOfficeEditor } from "@/components/employee/onlyoffice-editor";
import { deckStylePacks } from "@/lib/employee-deck-constants";
import { canOpenEmployeeAdmin } from "@/lib/employee-permissions";
import { deckStatusText, type DeckRegenerateAction } from "@/lib/employee-deck-shared";
import { safeJson, stageLabel } from "@/lib/employee-format";
import { generatedImageUrl } from "@/lib/employee-image-urls";
import {
  Bot, BriefcaseBusiness, Check, ChevronLeft,
  FileText, ImagePlus, LoaderCircle,
  MessageCircle, Save, Send,
  Maximize2, Settings, Sparkles, Upload,
  Users, WandSparkles, X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Consultation, DeckGenerationRun, DesignAgentRun, Employee, EmployeeData, EmployeeFeature, Service } from "@/lib/employee-api-types";

const emptyData: EmployeeData = { employee: null, employees: [], services: [], consultations: [] };
const navItems: { id: string; label: string; icon: typeof BriefcaseBusiness; feature?: EmployeeFeature }[] = [
  { id: "orders", label: "订单任务", icon: BriefcaseBusiness, feature: "orders" },
  { id: "messages", label: "客户消息", icon: MessageCircle, feature: "customerMessages" },
  { id: "team", label: "团队协作", icon: Users, feature: "team" },
  { id: "settings", label: "设置", icon: Settings }
];





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












// API routes should always return JSON, but development hot reload can briefly
// return an empty 500 response. This keeps the employee UI recoverable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responseJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}），请刷新或重启开发服务后重试。` };
  try { return JSON.parse(text); } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）。` }; }
}












