/* eslint-disable @next/next/no-img-element */
/**
 * 单页智能设计任务的运行面板（可复用 UI 组件）
 *
 * 职责：一次设计任务（文生图 / 混合模式）进入执行阶段后的界面——状态与阶段事件流、
 *       成品图与纯背景图预览、候选批次切换、重建 QA 提示，以及"取消任务"和
 *       "新增可编辑重建页"两个操作。
 * 谁可以改：本模块单独维护；改动不要顺手改装饰性外层或智能模式表单。
 * 依赖：@/lib/employee-api、@/lib/employee-api-types、@/lib/employee-format、lucide-react。
 * 被谁用：components/employee-app.tsx 的 DesignStudio。
 * 验证方式：npm run verify。
 *
 * 说明：这里只负责"画"，所有请求都由 DesignStudio 通过 on* 回调注入，
 * 保持编排逻辑集中在 DesignStudio 一处。
 */

import { LoaderCircle, Maximize2, Save } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { DesignAgentRun, Service } from "@/lib/employee-api-types";
import { stageLabel } from "@/lib/employee-format";

/** 服务端返回的版面方案结构（字段都可能缺失，读取时都要兜底） */
export type DesignStudioPlan = {
  title?: string; subtitle?: string; palette?: string[]; body?: string[];
  assetFiles?: Record<string, unknown>;
  qa?: { status?: string; message?: string };
};

/** 一批候选成品的结构 */
export type DesignBatch = { assetFiles?: Record<string, unknown>; qa?: { status?: string; message?: string } };

export function DesignRunPanel({ workerWarning, reconstructionRunId, service, activeRun, busy, masterImageId, cleanBackgroundImageId, reconstructionReady, qaNeedsReview, activeDesignEvents, plan, cancelRun, applyRun, openExplode, setPreviewImage }: {
  service: Service;
  activeRun: DesignAgentRun;
  busy: boolean;
  masterImageId: string;
  cleanBackgroundImageId: string;
  reconstructionReady: boolean;
  reconstructionRunId: string;
  qaNeedsReview: boolean;
  activeDesignEvents: NonNullable<DesignAgentRun["events"]>;
  workerWarning?: string;
  plan: DesignStudioPlan;
  cancelRun: () => void;
  applyRun: () => void;
  openExplode: () => void;
  setPreviewImage: (image: { url: string; title: string } | null) => void;
}) {
  const generatedImageUrl = employeeApi.urls.image.preview;
  return <section className="design-run"><div className="design-run-head"><div><span className={`design-status ${activeRun.status}`}>{activeRun.status === "completed" ? "方案已完成" : activeRun.status === "failed" ? "任务失败" : activeRun.status === "cancelled" ? "已取消" : "正在设计"}</span><h2>{activeRun.brief}</h2><small>{new Date(activeRun.createdAt).toLocaleString("zh-CN")}</small></div><div>{["queued", "running"].includes(activeRun.status) && <button onClick={() => void cancelRun()}>取消任务</button>}{activeRun.status === "completed" && <button className="design-apply" disabled={busy || (!activeRun.appliedAt && !reconstructionReady)} onClick={() => void applyRun()}>{activeRun.appliedAt ? "同步并打开 PPT" : <><Save/>{!reconstructionReady ? "等待拆图完成" : qaNeedsReview ? "重建需确认，仍可导入" : "新增可编辑重建页"}</>}</button>}</div></div><div className="design-stage-list">{activeDesignEvents.map(event => <article key={event.id} className={event.status}><b>{stageLabel(event.stage)}</b><span>{event.detail || "处理中"}</span></article>)}</div>{activeRun.status === "completed" && <div className={qaNeedsReview ? "auto-explode-status warning" : "auto-explode-status completed"}><div><b>{reconstructionReady ? "图片炸开已自动完成" : "图片炸开正在自动处理"}</b><span>{plan.qa?.message || "完整样片只作为预览和拆解真值；新增 PPT 会使用干净背景 + 独立透明部件。"}</span></div><button onClick={openExplode}>{reconstructionReady ? "查看并选择部件" : "打开图片炸开页"}</button></div>}{activeRun.error && <div className="design-error">{activeRun.error}</div>}{workerWarning && ["queued", "running"].includes(activeRun.status) && <div className="design-error">{workerWarning}</div>}<div className="design-result-grid master-rebuild"><article className="design-preview"><span>完整样片</span>{masterImageId ? <button className="design-preview-open" onClick={() => setPreviewImage({ url: generatedImageUrl(masterImageId), title: "完整样片" })}><img src={generatedImageUrl(masterImageId)} alt="完整 PPT 样片"/><i><Maximize2/>点击放大</i></button> : <div><LoaderCircle className="spin"/><p>正在生成完整样片…</p></div>}</article><article className="design-preview"><span>干净背景</span>{cleanBackgroundImageId ? <button className="design-preview-open" onClick={() => setPreviewImage({ url: generatedImageUrl(cleanBackgroundImageId), title: "干净背景" })}><img src={generatedImageUrl(cleanBackgroundImageId)} alt="干净背景"/><i><Maximize2/>点击放大</i></button> : <div><LoaderCircle className="spin"/><p>正在生成干净背景…</p></div>}</article><article className="design-preview"><span>拆解重建预览</span>{reconstructionReady ? <button className="design-preview-open" onClick={() => setPreviewImage({ url: `/api/employee/services/${service.id}/image-explode/runs/${reconstructionRunId}/reconstruction`, title: "拆解重建预览" })}><img src={`/api/employee/services/${service.id}/image-explode/runs/${reconstructionRunId}/reconstruction`} alt="拆解重建预览"/><i><Maximize2/>点击放大</i></button> : <div><LoaderCircle className="spin"/><p>等待 OpenAI 零件拆解与佐糖二次抠图…</p></div>}</article><article className="design-layout"><span>重建策略</span><h3>{plan.title || "以完整样片为真值"}</h3><p>{plan.subtitle || "不再由系统额外生成丑文字；样片里有什么，就拆什么。"}</p><div>{(plan.palette || []).map(color => <i key={color} style={{ background: color }}/>)}</div><ul><li>完整样片只用于预览、拆解与 QA。</li><li>最终 PPT 底层使用 OpenAI 二次生成的干净背景。</li><li>标题艺术字默认保留原始 PNG 字效，普通文字可选 OCR。</li></ul><small>如果重建 QA 提示风险，建议先点“查看并选择部件”确认后再导入。</small></article></div></section> ;
}
