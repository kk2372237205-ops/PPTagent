/**
 * 美化 PPT 方案表单（可复用 UI 组件）
 *
 * 职责：一次美化任务的填写入口——来源（当前文稿或上传 PPTX）、目标风格、整套修改方向、
 *       勾选要求与逐页修改要求。提交后先生成"待确认方案"，用户确认才会逐页重绘。
 * 谁可以改：本组件单独维护；改动不要顺手改生成 PPT 或生图链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-deck-constants`、
 *       `./polish-types`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的小 W 智能模式。
 * 验证方式：`npm run verify`。
 *
 * 产品约束：逐页修改要求默认留空，不预填任何内容——用户没写就不应带上系统编的要求。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileText, Upload, WandSparkles, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { Service } from "@/lib/employee-api-types";
import { deckStylePacks } from "@/lib/employee-deck-constants";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";
import type { PolishPageNote, PptPolishRun } from "./polish-types";

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

export function PolishPptPlanner({ service, note, setNote, notify, initialRun, onRunCreated, onRunsLoaded }: {
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
    : []);
  const [options, setOptions] = useState({
    keepText: true,
    keepNumbers: true,
    mainColor: true,
    headerFooter: true,
    backgroundTexture: true,
    cardStyle: false,
    decorativeElements: false,
    reduceText: true,
    sourcePageReference: false,
    ...(initialRun?.options || {})
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const latestPollingStatus = polishRuns[0]?.status || "";

  const loadPolishRuns = useCallback(async () => {
    const response = await employeeApi.polish.list(service.id);
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
      const response = await employeeApi.polish.create(service.id, form);
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
      <span>{sourceMode === "current" && service.workDocument ? "确认后先在本地固化为有序页面图，不会自动交给 Image2。" : "支持点击选择或直接拖拽 PPTX；确认后先本地固化页面图。"}</span>
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
      <label title="试验功能；必须由服务端明确开启，且 AI 重绘后仍需人工核对中文、logo、照片和图表。"><input type="checkbox" checked={options.sourcePageReference} onChange={() => toggleOption("sourcePageReference")}/>试验：以原稿页作视觉依据</label>
    </div>
    <section className="polish-page-notes">
      <header><div><b>逐页修改想法</b><span>{pageNotes.length} 条页级要求</span></div></header>
      <div className="polish-page-note-editor"><input value={pageRange} onChange={event => setPageRange(event.target.value)} placeholder="页码，如 3 或 6-8"/><textarea value={pageNote} onChange={event => setPageNote(event.target.value)} placeholder="这一页怎么改，例如：把流程图改成三步时间线，减少底部小字。"/><button type="button" onClick={addPageNote}><Check/>添加</button></div>
      <div className="polish-page-note-list">{pageNotes.map(item => <article key={item.id}><b>第 {item.pages} 页</b><p>{item.note}</p><button type="button" onClick={() => setPageNotes(current => current.filter(noteItem => noteItem.id !== item.id))}><X/></button></article>)}</div>
    </section>
    <button type="button" disabled={submitting} onClick={submitPolishPlan}><WandSparkles/>{submitting ? "提交中..." : "生成美化方案"}</button>
  </section>;
}
