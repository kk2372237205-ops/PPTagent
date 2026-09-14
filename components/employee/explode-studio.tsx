/* eslint-disable @next/next/no-img-element */
/**
 * 图片炸开 / 组件拆图页面（可复用 UI 组件）
 *
 * 职责：把一张成图拆成可复用的图层部件——创建拆图任务、查看候选部件与文字层、
 *       勾选要导入的部件、对单个候选做二次抠图精修、AI 清字，并按原坐标写入 PPT 末页。
 * 谁可以改：本模块单独维护；改动不要顺手改生图或生成 PPT 链路。
 * 依赖：@/lib/employee-api、@/lib/employee-api-types、@/lib/employee-image-urls、
 *       ./explode-image-preview、lucide-react。
 * 被谁用：components/employee-app.tsx。
 * 验证方式：npm run verify。
 *
 * 当前状态（2026-09-14）：后端 9 个接口与后台执行脚本都在线，但员工智能模式里的
 * 入口按钮已被停用，DesignStudio 只提示“已停用旧图片炸开入口”。
 * 这是产品决策，不是代码缺失——恢复入口只需把 workspaceMode 设为 "explode"。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, LoaderCircle, Maximize2, Save, Scissors, Upload, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { ImageExplodePart, ImageExplodeRun, ImageExplodeTextLayer, Service } from "@/lib/employee-api-types";
import { generatedImageUrl } from "@/lib/employee-image-urls";
import { ExplodeImagePreview } from "./explode-image-preview";

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

export function ImageExplodeStudio({ service, refresh, notify, back, openEditor }: {
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
    const response = await employeeApi.explode.list(service.id);
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
      const response = await employeeApi.explode.create(service.id, form);
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
    const response = await employeeApi.explode.update(service.id, activeRun.id, { selectedIds: normalizedParts.filter(part => part.selected).map(part => part.id), textLayers: nextTextLayers.map(layer => ({ id: layer.id, content: layer.content, mode: layer.mode, selected: layer.selected })) });
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
      const response = await employeeApi.explode.cleanText(service.id, activeRun.id, part.id);
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "AI 清字精修失败，已保留本地无字版和原字效果版");
      notify("AI 清字精修预览已生成；导入时会使用精修后的无字版");
      await loadRuns();
    } finally { setBusy(false); }
  }
  async function cancelRun() {
    if (!activeRun) return;
    const response = await employeeApi.explode.cancel(service.id, activeRun.id);
    const result = await responseJson(response);
    if (!response.ok) return notify(result.error || "取消拆图任务失败");
    await loadRuns();
  }
  async function applyRun() {
    if (!activeRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.explode.apply(service.id, activeRun.id);
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
      const response = await employeeApi.explode.refine(service.id, activeRun.id, refineTarget.id, {});
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "抠图精修失败");
      setRefineReady(true); notify("抠图精修预览已生成，请确认后再添加到候选列表"); await loadRuns();
    } finally { setRefining(false); }
  }
  async function acceptRefinement() {
    if (!activeRun || !refineTarget) return;
    setRefining(true);
    try {
      const response = await employeeApi.explode.refine(service.id, activeRun.id, refineTarget.id, { action: "accept" });
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