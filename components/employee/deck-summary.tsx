/**
 * 生成 PPT 的资料读取报告与高级版逐页内容复核面板（可复用 UI 组件）
 *
 * 职责：两块只读/轻交互的展示面板——
 *       1) `DeckSourceSummary`：资料读取报告，按"内容资料 / PPT 结构 / 视觉参考"分组显示读取状态。
 *       2) `DeckAdvancedContentReview`：高级版逐页复核，可编辑每页表达任务、正文、结论，
 *          并展示画面执行方向与本页资料依据。
 * 谁可以改：本模块单独维护；改动不要顺手改生成 PPT 的生成链路或后台脚本。
 * 依赖：`@/lib/employee-api-types`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的高级版方案面板。
 * 验证方式：`npm run verify`。
 */

import { Check, ChevronDown, FileText, LoaderCircle, X } from "lucide-react";
import type { DeckGenerationRun, DeckPageBlock, DeckPageDraft } from "@/lib/employee-api-types";

function deckSourceStatusText(status: string) {
  return ({ queued: "等待读取", processing: "正在读取", completed: "读取完成", failed: "读取失败" } as Record<string, string>)[status] || status;
}

export function DeckSourceSummary({ run }: { run: DeckGenerationRun }) {
  const sources = run.sources || [];
  if (!sources.length) return <section className="deck-source-summary empty"><FileText/><div><b>没有上传参考资料</b><span>本次会依据项目简介组织内容，不会虚构具体数字和事实。</span></div></section>;
  const completed = sources.filter(source => source.status === "completed").length;
  const failed = sources.filter(source => source.status === "failed").length;
  const groups = [
    { kind: "reference", label: "内容资料", note: "用于提取事实、数字和正文" },
    { kind: "outline", label: "PPT 结构", note: "只用于确定页序和每页主题" },
    { kind: "theme", label: "视觉参考", note: "只用于配色和视觉气质" }
  ].map(group => ({ ...group, sources: sources.filter(source => source.kind === group.kind) })).filter(group => group.sources.length > 0);
  return <section className="deck-source-summary">
    <header><div><b>资料读取报告</b><span>{completed}/{sources.length} 份已读取{failed ? ` · ${failed} 份失败` : ""}</span></div></header>
    <div className="deck-source-groups">{groups.map(group => <section className={`deck-source-group ${group.kind}`} key={group.kind}>
      <header><div><b>{group.label}</b><span>{group.note}</span></div><i>{group.sources.length} 份</i></header>
      <div>{group.sources.map(source => {
        const pending = ["queued", "processing"].includes(source.status);
        return <article key={source.id} className={source.status}>{pending ? <LoaderCircle className="spin"/> : source.status === "completed" ? <Check/> : <X/>}<span><b>{source.originalName}</b><small>{deckSourceStatusText(source.status)}{source.error ? ` · ${source.error}` : ""}</small></span></article>;
      })}</div>
    </section>)}</div>
  </section>;
}

export function DeckAdvancedContentReview({ drafts, updatePage, updateBlock }: {
  drafts: DeckPageDraft[];
  updatePage: (pageIndex: number, values: Partial<DeckPageDraft>) => void;
  updateBlock: (pageIndex: number, blockId: string, values: Partial<DeckPageBlock>) => void;
}) {
  return <div className="deck-content-review-list">{drafts.map(page => {
    const visualStrategy = String(page.directorContract.visual_strategy || "").trim();
    const visualStrategyLabel = ({
      "conceptual-illustration": "主题概念视觉",
      "editorial-composition": "编辑式图文构图",
      "fact-based-chart": "事实数据图表",
      timeline: "时间轴",
      process: "流程图",
      comparison: "对比构图",
      typography: "文字主导构图"
    } as Record<string, string>)[visualStrategy] || visualStrategy;
    const mainVisualBrief = String(page.directorContract.main_visual_brief || "").trim();
    const visualWeight = String(page.directorContract.visual_weight || "").trim();
    const visualWeightLabel = ({ "text-led": "文字主导", balanced: "图文均衡", "visual-led": "视觉主导" } as Record<string, string>)[visualWeight] || visualWeight;
    const visualUnits = (Array.isArray(page.directorContract.visual_units) ? page.directorContract.visual_units : []).map(item => {
      const unit = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
      return {
        supports: String(unit.supports || "").trim(),
        form: String(unit.form || "").trim(),
        relationship: ({ context: "语境", sequence: "顺序", cause: "因果", contrast: "对比", mechanism: "机制", result: "结果", evidence: "事实支撑" } as Record<string, string>)[String(unit.relationship || "").trim()] || String(unit.relationship || "").trim()
      };
    }).filter(unit => unit.supports && unit.form);
    const integrationRule = String(page.directorContract.integration_rule || "").trim();
    return <details key={page.pageIndex} className="deck-content-review-card">
    <summary><span>第 {page.pageIndex} 页</span><b>{page.title || "未命名页面"}</b><i>{page.evidence.length ? `${page.evidence.length} 条来源` : "待补来源"}</i><ChevronDown/></summary>
    <div className="deck-content-review-body">
      <label className="deck-content-conclusion">本页表达任务<textarea value={page.purpose} onChange={event => updatePage(page.pageIndex, { purpose: event.target.value })} placeholder="这一页要让观众理解什么"/></label>
      {(visualStrategy || mainVisualBrief || visualUnits.length > 0) && <section className="deck-content-must-include deck-visual-brief"><b>画面执行方向</b><div>{visualStrategy && <span>{visualStrategyLabel}</span>}{visualWeight && <span>{visualWeightLabel}</span>}</div>{mainVisualBrief && <p>{mainVisualBrief}</p>}{visualUnits.length > 0 && <ol className="deck-visual-units">{visualUnits.map((unit, index) => <li key={`${unit.supports}:${index}`}><b>{unit.form}</b><span>服务于：{unit.supports}</span>{unit.relationship && <small>{unit.relationship}</small>}</li>)}</ol>}{integrationRule && <p className="deck-visual-integration">图文关系：{integrationRule}</p>}</section>}
      <section className="deck-content-review-blocks">
        <header><b>GPT-5.6 整理后的页面正文</b><span>已按大纲从资料中逐页匹配，可直接修改</span></header>
        {page.blocks.length ? page.blocks.map((block, index) => <article key={block.id}>
          <header><span>{String(index + 1).padStart(2, "0")}</span><b>{block.subtitle || `内容块 ${index + 1}`}</b><i>{block.constraintMode === "exact" ? "原文保留" : block.constraintMode === "direction" ? "方向约束" : "可压缩表达"}</i></header>
          <textarea value={block.content || ""} onChange={event => updateBlock(page.pageIndex, block.id, { content: event.target.value })} placeholder="从资料中匹配出的正文，可在这里修改"/>
        </article>) : <p>本页没有匹配到可靠正文。请返回修改任务资料，补充对应资料或调整大纲。</p>}
      </section>
      {page.mustInclude.length > 0 && <section className="deck-content-must-include"><b>必须保留</b><div>{page.mustInclude.map((item, index) => <span key={index}>{item}</span>)}</div></section>}
      <label className="deck-content-conclusion">页末结论<textarea value={page.conclusion} onChange={event => updatePage(page.pageIndex, { conclusion: event.target.value })} placeholder="这一页希望观众记住的结论"/></label>
      <section className="deck-evidence-list">
        <b>本页资料依据</b>
        {page.evidence.length ? <div>{page.evidence.map((evidence, index) => <span key={evidence.id || index}><FileText/><b>{evidence.file || evidence.source || "参考资料"}</b><small>{evidence.locator || "未标注位置"}</small></span>)}</div> : <p>没有找到可靠依据。涉及数字、日期、人物和荣誉时请补充资料后重新匹配。</p>}
        {page.warnings.length > 0 && <ul>{page.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      </section>
      <footer><label><input type="checkbox" checked={page.locked} onChange={event => updatePage(page.pageIndex, { locked: event.target.checked })}/>锁定已核对内容</label></footer>
    </div>
  </details>})}</div>;
}
