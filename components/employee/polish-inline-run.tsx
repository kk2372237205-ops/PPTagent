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

import { useState } from "react";
import { Check, ChevronLeft, Download, LoaderCircle, OctagonX } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { deckStylePacks } from "@/lib/employee-deck-constants";
import { deckStatusText } from "@/lib/employee-deck-shared";
import type { Service } from "@/lib/employee-api-types";
import type { PptPolishRun } from "./polish-types";

export function PolishInlineRun({ service, run, busy, workerWarning, onBack, onConfirm, onCreatePpt, onAddPageNotes, onCancel, onRegenerate, onRetry, onPreview }: {
  service: Service;
  run: PptPolishRun;
  busy: boolean;
  workerWarning?: string;
  onBack: () => void;
  onConfirm: () => void;
  onCreatePpt: () => void;
  onAddPageNotes: (pageIndexes: number[], note: string) => void;
  onCancel: () => void;
  onRegenerate: (slideIndex: number, action: "reroll" | "closer_previous") => void;
  onRetry: () => void;
  onPreview: (image: { url: string; title: string }) => void;
}) {
  const [selectedSourcePages, setSelectedSourcePages] = useState<number[]>([]);
  const [sourcePageNote, setSourcePageNote] = useState("");
  const done = run.slides?.filter(slide => slide.status === "completed").length || 0;
  const total = run.pageCount || run.slides?.length || 0;
  const workerBlocked = Boolean(workerWarning && ["confirmed", "planning", "generating", "pdf_queued", "ppt_queued", "ppt_processing"].includes(run.status));
  const statusText = workerBlocked ? "等待 Worker 启动" : deckStatusText(run.status);
  const styleLabel = deckStylePacks.find(item => item.id === run.stylePack)?.label || run.stylePack;
  const pdfUrl = employeeApi.urls.polish.pdf(service.id, run.id);
  const pptUrl = employeeApi.urls.polish.ppt(service.id, run.id);
  const sourcePages = run.sourceSnapshot?.pages || [];
  const sourcePageCount = run.sourceSnapshot?.pageCount || sourcePages.length;
  const selectingSourcePages = run.status === "source_ready" && sourcePages.length > 0;
  const visibleSourcePages = selectingSourcePages ? sourcePages : sourcePages.slice(0, 4);
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
  return <section className="design-run design-deck-run polish-inline-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{statusText}</span>
        <h2>{run.sourceName}</h2>
        <small>{styleLabel} · {total ? `${done}/${total} 页` : `${run.pageNotes?.length || 0} 条页级要求`} · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
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
        <h3>{styleLabel}</h3>
        <p>{run.note || "按当前文稿内容进行整体视觉统一、版面优化和逐页重绘。"}</p>
        <div className="polish-plan-tags">{optionLabels.map(label => <i key={label}>{label}</i>)}</div>
      </article>
      <article>
        <span>逐页修改清单</span>
        {run.pageNotes?.length ? <ol>{run.pageNotes.map(item => <li key={item.id}><b>第 {item.pages} 页</b><small>{item.note}</small></li>)}</ol> : <p>确认后可从页面缩略图中点选并填写要求。</p>}
      </article>
    </section>}
    {(sourcePages.length > 0 || run.status === "source_ready") && <section className={`deck-plan-review inline polish-source-pages ${selectingSourcePages ? "is-selecting" : ""}`}>
      <article>
        <span>{selectingSourcePages ? "点选需要修改的页面" : "原稿页面已固化"}</span>
        <h3>{sourcePageCount ? `${sourcePageCount} 页 PNG` : "已跳过转换"}</h3>
        <p>{selectingSourcePages ? "点击缩略图选中页面，再写这一页的修改要求。已选页面会带有绿色边框。" : "页面图仅保存在本次美化任务中，用于人工核对与后续逐页处理。"}</p>
      </article>
      {selectingSourcePages && <section className="polish-source-page-editor"><div><b>{selectedSourcePages.length ? `已选第 ${selectedSourcePages.join("、")} 页` : "请先点选页面"}</b><textarea value={sourcePageNote} onChange={event => setSourcePageNote(event.target.value)} placeholder="这几页怎么改，例如：第 3 页减少底部小字，主视觉改为图文对照。"/></div><button type="button" disabled={busy || !selectedSourcePages.length || !sourcePageNote.trim()} onClick={() => { onAddPageNotes(selectedSourcePages, sourcePageNote.trim()); setSelectedSourcePages([]); setSourcePageNote(""); }}><Check/>保存本页要求</button></section>}
      {sourcePages.length > 0 && <div className="polish-source-page-strip">{visibleSourcePages.map(page => {
        const url = employeeApi.urls.polish.sourcePageImage(service.id, run.id, page.pageIndex, run.updatedAt);
        const selected = selectedSourcePages.includes(page.pageIndex);
        return <button key={page.pageIndex} type="button" className={selected ? "selected" : ""} onClick={() => selectingSourcePages ? setSelectedSourcePages(current => current.includes(page.pageIndex) ? current.filter(index => index !== page.pageIndex) : [...current, page.pageIndex].sort((a, b) => a - b)) : onPreview({ url, title: `原稿第 ${page.pageIndex} 页` })}><img src={url} alt={`原稿第 ${page.pageIndex} 页`}/><span>{selectingSourcePages ? `${selected ? "已选" : "选择"} · 第 ${page.pageIndex} 页` : `第 ${page.pageIndex} 页`}</span></button>;
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
