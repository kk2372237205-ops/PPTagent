/* eslint-disable @next/next/no-img-element */
/**
 * AI 创作助手面板（可复用 UI 组件）—— 对应「小 W · 生图 / AI 助手」这一条链路
 *
 * 职责：订单级 AI 会话（文字助手）与生图；含两条中转的健康检查、任务轮询、
 *       图片预览与「存入素材库」。
 * 谁可以改：本模块单独维护；改动不要顺手改生成 PPT / 美化 PPT / 图片工具链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-image-urls`、
 *       `./image-preview-modal`、`./tools-ai-shared`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的订单工作台右侧栏。
 * 验证方式：`npm run verify`。
 *
 * 拆自 `tools-ai-panels.tsx`（2026-09-27 按模式拆分）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Download, FileText, ImagePlus, LoaderCircle, Paperclip, RefreshCw, Send, Sparkles, WandSparkles, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { AI_IMAGE_DISPLAY_NAME, AI_TEXT_DISPLAY_NAME } from "@/lib/employee-ai-labels";
import type { AiMessage, AiModelOption, Employee, OpenAiHealth, Service, TrackedImageJob } from "@/lib/employee-api-types";
import { generatedImageDownloadUrl, generatedImageUrl } from "@/lib/employee-image-urls";
import { finishImageDrag, writeImageDragData } from "@/lib/employee-image-tools";
import { ImagePreviewModal, type ImagePreview } from "./image-preview-modal";
import { nextMaterialOrder } from "./tools-ai-shared";

function chronologicalSort<T extends { id: string; createdAt: string }>(a: T, b: T) {
  return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id.localeCompare(b.id);
}

/** 只有此面板亲自发起的 Ark / 图片中转任务才属于「AI 图片」。
 * 上传到素材库、图片工具和设计工作流共用图片存储，但不能混入这里。 */
function isAssistantImageJob(job: TrackedImageJob) {
  return job.provider === "ark" || job.provider === "openai";
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
  const assistantImageJobs = service.generationJobs
    .filter(job => (!job.employee.id || job.employee.id === employee.id) && isAssistantImageJob(job));
  const images = assistantImageJobs
    .flatMap(job => job.images.map(image => ({ ...image, job })))
    .sort(chronologicalSort);
  const serviceImageJobs = assistantImageJobs;
  const imageJobMap = new Map<string, TrackedImageJob>();
  [...trackedImageJobs, ...serviceImageJobs].forEach(job => imageJobMap.set(job.id, job));
  const displayImageJobs = Array.from(imageJobMap.values())
    .filter(job => job.status === "processing" || job.status === "failed")
    .sort(chronologicalSort);
  const processingImageJobIds = displayImageJobs.filter(job => job.status === "processing").map(job => job.id).join("|");
  const imageFeedKey = images.map(image => image.id).join("|") + ":" + displayImageJobs.map(job => job.id + job.status).join("|");
  const selectedTextModel = textModels.find(model => model.id === textModelId) || textModels[0];
  const selectedImageModel = imageModels.find(model => model.id === imageModelId) || imageModels[0];
  const textProviderHealth = selectedTextModel?.provider === "ark"
    ? {
      ok: selectedTextModel.available,
      text: selectedTextModel.available ? `${selectedTextModel.label} 已配置` : "尚未配置 ARK_API_KEY"
    }
    : {
      ok: Boolean(openAiHealth?.text?.ok),
      text: openAiHealth?.text?.ok
        ? `${AI_TEXT_DISPLAY_NAME} 已配置`
        : openAiHealth?.text?.error || openAiHealth?.error || "正在检查文字中转服务..."
    };
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
        ? `${AI_IMAGE_DISPLAY_NAME} 已配置`
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
    {tab === "chat" && selectedTextModel && <div className={"ai-health " + (textProviderHealth.ok ? "ok" : "error")}><span>{textProviderHealth.text}</span>{selectedTextModel.provider === "openai" && !textProviderHealth.ok && <button title="重新检查文字中转配置" onClick={() => setOpenAiHealthCheckNonce(value => value + 1)} disabled={openAiHealthChecking}><RefreshCw className={openAiHealthChecking ? "spin" : ""}/></button>}</div>}
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
