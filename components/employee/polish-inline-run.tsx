/* eslint-disable @next/next/no-img-element */
/**
 * 美化 PPT 运行面板（可复用 UI 组件）
 *
 * 职责：一次美化任务进入执行阶段后的界面——状态与进度、方案摘要与逐页修改清单、
 *       逐页预览图、单页重新生成 / 更贴近上一页、继续生成与转 PPT / 下载。
 * 谁可以改：本模块单独维护；改动不要顺手改生成 PPT 链路。
 * 依赖：@/lib/employee-api、@/lib/employee-deck-constants、@/lib/employee-deck-shared、
 *       ./polish-types、lucide-react。
 * 被谁用：components/employee-app.tsx 的小 W 智能模式。
 * 验证方式：npm run verify。
 */

import { useEffect, useState } from "react";
import { Check, ChevronLeft, Download, LoaderCircle, OctagonX, Paperclip, Pencil, Plus, Save } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { deckStatusText } from "@/lib/employee-deck-shared";
import type { Service } from "@/lib/employee-api-types";
import type { PolishPromptClip, PptPolishRun } from "./polish-types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function responseJson(response: Response): Promise<Record<string, any>> {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}）` };
  try { return JSON.parse(text); } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）` }; }
}

export function PolishInlineRun({ service, run, busy, workerWarning, onBack, onConfirm, onCreatePpt, onAddPageNotes, onCancel, onRegenerate, onRetry, onPreview }: {
  service: Service;
  run: PptPolishRun;
  busy: boolean;
  workerWarning?: string;
  onBack: () => void;
  onConfirm: () => void;
  onCreatePpt: () => void;
  onAddPageNotes: (pageIndexes: number[], note: string, replace?: boolean) => void;
  onCancel: () => void;
  onRegenerate: (slideIndex: number, action: "reroll" | "closer_previous") => void;
  onRetry: () => void;
  onPreview: (image: { url: string; title: string }) => void;
}) {
  const [pageDrafts, setPageDrafts] = useState<Record<number, string>>({});
  const [openClipPage, setOpenClipPage] = useState<number | null>(null);
  const [clips, setClips] = useState<PolishPromptClip[]>([]);
  const [clipEditorOpen, setClipEditorOpen] = useState(false);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [clipName, setClipName] = useState("");
  const [clipPrompt, setClipPrompt] = useState("");
  const [clipColor, setClipColor] = useState<PolishPromptClip["color"]>("blue");
  const [clipSaving, setClipSaving] = useState(false);
  const done = run.slides?.filter(slide => slide.status === "completed").length || 0;
  const total = run.pageCount || run.slides?.length || 0;
  const workerBlocked = Boolean(workerWarning && ["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(run.status));
  const statusText = workerBlocked ? "等待 Worker 启动" : deckStatusText(run.status);
  const pdfUrl = employeeApi.urls.polish.pdf(service.id, run.id);
  const pptUrl = employeeApi.urls.polish.ppt(service.id, run.id);
  const sourcePages = run.sourceSnapshot?.pages || [];
  const sourcePageCount = run.sourceSnapshot?.pageCount || sourcePages.length;
  const selectingSourcePages = run.status === "source_ready" && sourcePages.length > 0;
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

  useEffect(() => {
    if (!selectingSourcePages) return;
    let live = true;
    void (async () => {
      const response = await employeeApi.polish.clips.list(service.id);
      const result = await responseJson(response);
      if (live && response.ok) setClips((result.clips || []) as PolishPromptClip[]);
    })();
    return () => { live = false; };
  }, [selectingSourcePages, service.id]);

  function pageDraft(pageIndex: number) {
    if (pageIndex in pageDrafts) return pageDrafts[pageIndex];
    return run.slides?.find(slide => slide.slideIndex === pageIndex)?.note || "";
  }

  function appendClip(pageIndex: number, clip: PolishPromptClip) {
    setPageDrafts(current => {
      const existing = current[pageIndex] ?? (run.slides?.find(slide => slide.slideIndex === pageIndex)?.note || "");
      return { ...current, [pageIndex]: [existing, clip.prompt].filter(Boolean).join(existing ? "\n" : "") };
    });
    setOpenClipPage(null);
  }

  function startNewClip() {
    setEditingClipId(null);
    setClipName("");
    setClipPrompt("");
    setClipColor("blue");
    setClipEditorOpen(true);
  }

  function editClip(clip: PolishPromptClip) {
    setEditingClipId(clip.id);
    setClipName(clip.name);
    setClipPrompt(clip.prompt);
    setClipColor(clip.color);
    setClipEditorOpen(true);
  }

  async function saveClip() {
    if (!clipName.trim() || !clipPrompt.trim()) return;
    setClipSaving(true);
    try {
      const response = await employeeApi.polish.clips.save(service.id, { id: editingClipId || undefined, name: clipName, prompt: clipPrompt, color: clipColor });
      const result = await responseJson(response);
      if (!response.ok) return;
      setClips((result.clips || []) as PolishPromptClip[]);
      setClipEditorOpen(false);
      setEditingClipId(null);
    } finally { setClipSaving(false); }
  }
  return <section className="design-run design-deck-run polish-inline-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{statusText}</span>
        <h2>{run.sourceName}</h2>
        <small>{total ? `${done}/${total} 页` : `${run.pageNotes?.length || 0} 条页级要求`} · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      <div>
        {run.status === "plan_ready" && <><button className="design-secondary polish-plan-back" onClick={onBack} disabled={busy}><ChevronLeft/>返回修改</button><button className="design-apply" onClick={onConfirm} disabled={busy}>确认并转换页面</button></>}
        {run.status === "source_ready" && <button className="design-apply" onClick={onConfirm} disabled={busy}>开始生成页面</button>}
        {["plan_ready", "confirmed", "planning", "source_ready", "generating"].includes(run.status) && <button className="polish-emergency-cancel" onClick={onCancel} disabled={busy}><OctagonX/>取消任务（紧急）</button>}
        {run.status === "failed" && run.slides?.length > 0 && <button className="design-apply" onClick={onRetry} disabled={busy}>继续生成</button>}
        {["review_ready", "pdf_ready"].includes(run.status) && <button className="design-apply" onClick={onCreatePpt} disabled={busy}>转化 PPT</button>}
        {run.pdfStoredName && <a className="design-secondary" href={pdfUrl}><Download/>下载 PDF</a>}
        {run.status === "ppt_ready" && run.pptStoredName && <a className="design-apply" href={pptUrl}><Download/>下载 PPTX</a>}
      </div>
    </div>
    {run.error && <div className="design-error">{run.error}</div>}
    {workerBlocked && <div className="design-error">{workerWarning}</div>}
    {run.status !== "source_ready" && <section className="deck-plan-review inline polish-plan-review">
      <article>
        <span>美化方案</span>
        <h3>按页面要求美化</h3>
        <p>保留原稿关键信息，并根据勾选要求和逐页提示词重组版面。</p>
        <div className="polish-plan-tags">{optionLabels.map(label => <i key={label}>{label}</i>)}</div>
      </article>
      <article>
        <span>逐页修改清单</span>
        {run.pageNotes?.length ? <ol>{run.pageNotes.map(item => <li key={item.id}><b>第 {item.pages} 页</b><small>{item.note}</small></li>)}</ol> : <p>确认后可从页面缩略图中点选并填写要求。</p>}
      </article>
    </section>}
    {(sourcePages.length > 0 || run.status === "source_ready") && <section className={`deck-plan-review inline polish-source-pages ${selectingSourcePages ? "is-selecting" : ""}`}>
      <article className="polish-source-pages-intro">
        <span>{selectingSourcePages ? "逐页美化工作台" : "原稿页面已固化"}</span>
        <h3>{sourcePageCount ? `${sourcePageCount} 页 PNG` : "已跳过转换"}</h3>
        <p>{selectingSourcePages ? "点击左侧缩略图放大核对；在右侧写该页提示词，可随时从夹子一键追加已保存的规则。" : "页面图仅保存在本次美化任务中，用于人工核对与后续逐页处理。"}</p>
      </article>
      {selectingSourcePages && <div className="polish-source-page-stack">{sourcePages.map(page => {
        const url = employeeApi.urls.polish.sourcePageImage(service.id, run.id, page.pageIndex, run.updatedAt);
        const draft = pageDraft(page.pageIndex);
        const islandOpen = openClipPage === page.pageIndex;
        return <article className="polish-source-page-row" key={page.pageIndex}>
          <button type="button" className="polish-source-page-preview" onClick={() => onPreview({ url, title: `原稿第 ${page.pageIndex} 页` })}><img src={url} alt={`原稿第 ${page.pageIndex} 页`}/><span>第 {page.pageIndex} 页 · 点击放大预览</span></button>
          <div className="polish-source-page-workspace">
            <header><b>第 {page.pageIndex} 页提示词</b><small>{draft ? "已填写，可继续修改" : "未填写"}</small></header>
            <textarea value={draft} onChange={event => setPageDrafts(current => ({ ...current, [page.pageIndex]: event.target.value }))} placeholder="这一页怎么改，例如：保留关键数字，压缩小字，改成图文对照。"/>
            <div className={`polish-clip-island ${islandOpen ? "is-open" : ""}`}>
              <button type="button" className="polish-clip-island-trigger" onClick={() => { setOpenClipPage(islandOpen ? null : page.pageIndex); setClipEditorOpen(false); }}><Paperclip/><b>夹子</b><span>{clips.length ? `${clips.length} 个可用` : "新建可复用提示词"}</span></button>
              {islandOpen && <div className="polish-clip-island-content">
                <div className="polish-clip-rail">{clips.map(clip => <div key={clip.id} className={`polish-clip color-${clip.color}`}><button type="button" onClick={() => appendClip(page.pageIndex, clip)} title="将此夹子的提示词追加到本页"><span>{clip.name}</span></button><button type="button" aria-label={`编辑夹子 ${clip.name}`} onClick={() => editClip(clip)}><Pencil/></button></div>)}<button type="button" className="polish-clip-new" onClick={startNewClip}><Plus/>新建夹子</button></div>
                {clipEditorOpen && <section className="polish-clip-editor"><header><b>{editingClipId ? "编辑夹子" : "新建夹子"}</b><button type="button" onClick={() => setClipEditorOpen(false)}>收起</button></header><input value={clipName} maxLength={40} onChange={event => setClipName(event.target.value)} placeholder="夹子名称，例如：统一页脚"/><textarea value={clipPrompt} onChange={event => setClipPrompt(event.target.value)} placeholder="夹子提示词：写入每页需要追加的美化规则。"/><div><span>夹子颜色</span>{(["blue", "green", "gold", "rose"] as const).map(color => <button key={color} type="button" className={`color-${color} ${clipColor === color ? "selected" : ""}`} onClick={() => setClipColor(color)}>{({ blue: "蓝", green: "绿", gold: "金", rose: "红" })[color]}</button>)}<button type="button" className="polish-clip-save" disabled={clipSaving || !clipName.trim() || !clipPrompt.trim()} onClick={() => void saveClip()}><Save/>{clipSaving ? "保存中" : "保存夹子"}</button></div></section>}
              </div>}
            </div>
            <button type="button" className="polish-save-page-note" disabled={busy || !draft.trim()} onClick={() => onAddPageNotes([page.pageIndex], draft.trim(), true)}><Check/>保存第 {page.pageIndex} 页要求</button>
          </div>
        </article>;
      })}</div>}
    </section>}
    {["generating", "review_ready", "pdf_queued", "pdf_ready", "ppt_queued", "ppt_processing", "ppt_ready", "failed"].includes(run.status) && run.slides?.length > 0 && <section className="deck-slide-review inline polish-slide-review">
      <div className="deck-progress"><b>{done}/{total || "?"}</b><span>{statusText}</span></div>
      <div className="deck-slide-grid">{(run.slides || []).map(slide => {
        const canRegenerate = ["completed", "failed"].includes(slide.status) && !["pdf_queued", "ppt_queued", "ppt_processing"].includes(run.status);
        const slidePending = ["queued", "waiting", "generating"].includes(slide.status);
        const slideImageUrl = employeeApi.urls.polish.slideImage(service.id, run.id, slide.slideIndex, slide.updatedAt);
        return <article key={slide.slideIndex}>
        <header><b>{slide.title || `第 ${slide.slideIndex} 页`}</b><span>{slide.status}</span></header>
        <button className="deck-slide-preview" disabled={!slide.storedName} onClick={() => slide.storedName && onPreview({ url: slideImageUrl, title: slide.title || `第 ${slide.slideIndex} 页` })}>{slide.storedName ? <img src={slideImageUrl} alt={slide.title}/> : <><LoaderCircle className={!workerBlocked && slidePending ? "spin" : ""}/><span>{workerBlocked ? "等待 Worker" : slide.status}</span></>}</button>
        {slide.note && <p>{slide.note}</p>}
        {slide.error && <p>{slide.error}</p>}
        <footer><button onClick={() => onRegenerate(slide.slideIndex, "reroll")} disabled={busy || !canRegenerate}>重新生成本页</button><button onClick={() => onRegenerate(slide.slideIndex, "closer_previous")} disabled={busy || !canRegenerate}>更贴近上一页</button></footer>
      </article>;
      })}</div>
    </section>}
  </section>;
}
