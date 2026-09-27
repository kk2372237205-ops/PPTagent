/* eslint-disable @next/next/no-img-element */
/**
 * 图片工具面板（可复用 UI 组件）—— 对应「智能抠图 / 图片转 PPT / 提取图片」这一条链路
 *
 * 职责：智能抠图（佐糖）、图片转 PPT（Codia）、从当前 PPT 提取图片，
 *       并支持从 AI 图片或本地图片拖入。
 * 谁可以改：本模块单独维护；改动不要顺手改生成 PPT / 美化 PPT / 生图链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-image-urls`、
 *       `@/lib/employee-image-tools`、`@/lib/techsz-image-tools`、`./image-preview-modal`、
 *       `./tools-ai-types`、`./tools-ai-shared`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的订单工作台。
 * 验证方式：`npm run verify`。
 *
 * 拆自 `tools-ai-panels.tsx`（2026-09-27 按模式拆分）。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Download, FileText, ImagePlus, LoaderCircle, Scissors, Upload } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { Employee, Service } from "@/lib/employee-api-types";
import { generatedImageUrl } from "@/lib/employee-image-urls";
import { cropDataUrlToPngDataUrl, dataUrlToBlob, imageFilesFromList, readImageDragId } from "@/lib/employee-image-tools";
import { techszImageToolById, techszImageTools, type TechszImageToolId } from "@/lib/techsz-image-tools";
import type { ImageToPptResult, ImageToolSource, PptExtractedImage } from "./tools-ai-types";
import { nextMaterialOrder } from "./tools-ai-shared";

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
