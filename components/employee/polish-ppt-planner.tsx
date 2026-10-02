/**
 * 美化 PPT 方案表单（可复用 UI 组件）
 *
 * 职责：一次美化任务的填写入口——来源（当前文稿或上传 PPTX）与保护要求。
 *       提交后先生成"待确认方案"；确认后固化 PNG 页面，再逐页填写修改要求。
 * 谁可以改：本组件单独维护；改动不要顺手改生成 PPT 或生图链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-deck-constants`、
 *       `./polish-types`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的小 W 智能模式。
 * 验证方式：`npm run verify`。
 *
 * 产品约束：逐页修改要求默认留空，不预填任何内容——用户没写就不应带上系统编的要求。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, WandSparkles } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { Service } from "@/lib/employee-api-types";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";
import type { PptPolishRun } from "./polish-types";

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

export function PolishPptPlanner({ service, notify, initialRun, onRunCreated, onRunsLoaded }: {
  service: Service;
  notify: (text: string) => void;
  initialRun?: PptPolishRun | null;
  onRunCreated?: (run: PptPolishRun) => void;
  onRunsLoaded?: (runs: PptPolishRun[]) => void;
}) {
  const [sourceMode, setSourceMode] = useState<"current" | "upload">(initialRun?.sourceMode || (service.workDocument ? "current" : "upload"));
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [polishRuns, setPolishRuns] = useState<PptPolishRun[]>([]);
  const [submitting, setSubmitting] = useState(false);
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

  async function submitPolishPlan() {
    if (sourceMode === "current" && !service.workDocument) return notify("当前订单还没有工作文稿，请先上传 PPT");
    if (sourceMode === "upload" && !selectedFile) return notify("请先放入需要美化的 PPT 文件");
    const form = new FormData();
    form.append("sourceMode", sourceMode);
    // 逐页提示词只使用员工实际填写的要求与夹子内容；不再提交隐藏的默认勾选项。
    form.append("options", "{}");
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
    <div className="polish-form-grid polish-source-only">
      <label>美化来源<select value={sourceMode} onChange={event => setSourceMode(event.target.value as "current" | "upload")}><option value="current" disabled={!service.workDocument}>当前文稿</option><option value="upload">上传 PPT</option></select></label>
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
      <span>{sourceMode === "current" && service.workDocument ? "确认后按所选流程处理当前 PPTX。" : "支持点击选择或直接拖拽 PPTX。"}</span>
    </div>
    <aside className="polish-source-snapshot-note is-on"><div><b>原页图片参考</b><span>系统将整份 PPTX 本地转换为按页 PNG；每页会连同该页要求一对一发送给图片模型。</span></div></aside>
    <button type="button" disabled={submitting} onClick={submitPolishPlan}><WandSparkles/>{submitting ? "提交中..." : "生成美化方案"}</button>
  </section>;
}
