/* eslint-disable @next/next/no-img-element */
/**
 * AI 创作助手与图片工具面板（可复用 UI 组件）
 *
 * 职责：
 *   1) `AiPanel`：订单级 AI 会话（文字助手）与生图；含中转健康检查、任务轮询、
 *      图片预览与"存入素材库"。
 *   2) `ImageToolsPanel`：智能抠图（佐糖）、图片转 PPT（Codia）、从当前 PPT 提取图片，
 *      并支持从 AI 图片或本地图片拖入。
 * 谁可以改：本模块单独维护；改动不要顺手改生成 PPT / 美化 PPT 链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-image-urls`、
 *       `@/lib/employee-image-tools`、`@/lib/techsz-image-tools`、`./image-preview-modal`、
 *       `./tools-ai-types`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的订单工作台。
 * 验证方式：`npm run verify`。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Bot, Download, FileText, ImagePlus, LoaderCircle, Paperclip, RefreshCw, Scissors, Send, Sparkles, Upload, WandSparkles, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { AiMessage, AiModelOption, Employee, MaterialItem, OpenAiHealth, Service, TrackedImageJob } from "@/lib/employee-api-types";
import { generatedImageDownloadUrl, generatedImageUrl } from "@/lib/employee-image-urls";
import { cropDataUrlToPngDataUrl, dataUrlToBlob, finishImageDrag, imageFilesFromList, readImageDragId, writeImageDragData } from "@/lib/employee-image-tools";
import { techszImageToolById, techszImageTools, type TechszImageToolId } from "@/lib/techsz-image-tools";
import { ImagePreviewModal, type ImagePreview } from "./image-preview-modal";
import type { ImageToPptResult, ImageToolSource, PptExtractedImage } from "./tools-ai-types";

function nextMaterialOrder(items: MaterialItem[]) { return items.reduce((max, item) => Math.max(max, item.materialOrder || 0), 0) + 1; }
function chronologicalSort<T extends { id: string; createdAt: string }>(a: T, b: T) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
}

/**
 * 接口返回应当是 JSON，但开发热更新期间偶尔会返回空的 500 响应。
 * 这里与 employee-app.tsx 保持同一策略，保证界面可恢复。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responseJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}），请刷新或重启开发服务后重试。` };
  try { return JSON.parse(text); } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）。` }; }
}

export function AiPanel({ service, employee, refresh, notify }: { service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
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
      const response = await employeeApi.ai.conversation(service.id);
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
        const response = await employeeApi.ai.health();
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
        const response = await employeeApi.images.list(service.id);
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
      const response = await employeeApi.ai.chat(service.id, { content, modelId: textModelId });
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
      const response = await employeeApi.images.create(service.id, form);
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
    const response = await employeeApi.images.setMaterial(imageId, { isMaterial: true, materialOrder: nextMaterialOrder(service.materialItems.filter(item => item.employee.id === employee.id)) });
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

export function ImageToolsPanel({ service, employee, refresh, notify }: { service: Service; employee: Employee; refresh: (silent?: boolean) => Promise<void>; notify: (text: string) => void }) {
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
      const response = await employeeApi.tools.segmentation(service.id, form);
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
      const response = await employeeApi.tools.imageToPptx(service.id, form);
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
    const response = await employeeApi.images.setMaterial(resultId, { isMaterial: true, materialOrder: nextMaterialOrder(myMaterials) });
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
      const response = await employeeApi.documents.extractImages(service.workDocument.id, slideNumber);
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
      const response = await employeeApi.images.import(service.id, form);
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