/**
 * 生成 PPT 面板之间的共享类型与文案工具（主干层）
 *
 * 职责：集中放生成 PPT 各面板都要用的东西——后台任务状态的中文说法、文件体积格式化，
 *       以及运行面板的公共 props 类型 `DeckRunActions`。
 * 谁可以改：主干层；改完必须跑 `npm run verify`。
 * 依赖：`@/lib/employee-api-types`（仅类型）。
 * 被谁用：`components/employee-app.tsx` 与 `components/employee/deck-*.tsx`。
 * 验证方式：`npm run verify`。
 */

import { deckAdvancedLayoutPacks, deckStylePacks } from "@/lib/employee-deck-constants";
import type {
  DeckGenerationPagePlan,
  DeckGenerationRun,
  DeckPageBlock,
  DeckPageDraft,
  DeckVisualEvidence,
  Service
} from "@/lib/employee-api-types";

/** 单页重生成按钮的两种语义 */
export type DeckRegenerateAction = "reroll" | "closer_previous";

/** 生成 PPT 运行面板的公共 props */
export type DeckRunActions = {
  service: Service;
  run: DeckGenerationRun;
  busy: boolean;
  onRunUpdate: (run: DeckGenerationRun) => void;
  onConfirm: () => void;
  onReplan: (stylePack?: string) => void;
  onCreatePpt: () => void;
  onRegenerate: (slideId: string, action: DeckRegenerateAction) => void;
  onPreview: (image: { url: string; title: string }) => void;
};

/** 一次生成任务的状态 → 员工看得懂的中文 */
export function deckStatusText(status: string) {
  return ({
    queued: "排队中",
    sources_queued: "资料排队中",
    source_processing: "正在读取资料",
    outline_ready: "待确认逐页结构",
    matching_queued: "逐页取材排队中",
    matching: "正在逐页匹配资料",
    planning: "生成方案中",
    plan_ready: "待确认方案",
    confirmed: "排队执行",
    source_ready: "请选择需要逐页修改的页面",
    generating: "生成页面中",
    review_ready: "预览待确认",
    pdf_queued: "正在生成 PDF",
    pdf_ready: "PDF 已生成",
    ppt_queued: "Codia 排队中",
    ppt_processing: "Codia 转换中",
    ppt_ready: "PPT 已生成",
    cancelled: "已取消",
    failed: "失败"
  } as Record<string, string>)[status] || status;
}

export function formatDeckFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ *
 * 高级版逐页计划：JSON 字段解析与草稿构造
 * ------------------------------------------------------------------ */

/** 面板上显示的"当前风格"说明：参考图配色模式显示版式语言，否则显示风格包名 */
export function deckRunStyleLabel(run: Pick<DeckGenerationRun, "generationMode" | "paletteMode" | "stylePack">) {
  if (run.generationMode === "advanced" && run.paletteMode === "reference") {
    const layout = deckAdvancedLayoutPacks.find(item => item.id === run.stylePack)?.label || "图文叙事版式";
    return `参考图配色 · ${layout}`;
  }
  return deckStylePacks.find(item => item.id === run.stylePack)?.label || run.stylePack;
}

export function parseDeckArray<T>(value?: string): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

export function parseDeckObject(value?: string): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

/** 把服务端逐页计划记录转成可编辑的页面草稿 */
export function deckPageDraft(page: DeckGenerationPagePlan): DeckPageDraft {
  return {
    pageIndex: page.pageIndex,
    title: page.title,
    role: page.role,
    purpose: page.purpose,
    blocks: parseDeckArray<DeckPageBlock>(page.blocksJson).map((block, index) => ({
      id: block.id || `block-${index + 1}`,
      subtitle: block.subtitle || "",
      instruction: block.instruction || "",
      constraintMode: block.constraintMode || "polish",
      content: block.content || "",
      evidenceIds: block.evidenceIds || []
    })),
    mustInclude: parseDeckArray<string>(page.mustIncludeJson),
    conclusion: page.conclusion,
    density: page.density,
    layoutType: page.layoutType,
    constraintMode: page.constraintMode,
    evidence: parseDeckArray<DeckPageDraft["evidence"][number]>(page.evidenceJson),
    visualEvidence: parseDeckArray<DeckVisualEvidence>(page.visualEvidenceJson),
    directorContract: parseDeckObject(page.directorContractJson),
    warnings: parseDeckArray<string>(page.warningsJson),
    locked: page.locked
  };
}
