/**
 * 智能模式三条链路的状态与请求编排（主干层 Hook）
 *
 * 职责：把原本堆在 DesignStudio 里的三个任务家族——单页智能设计（design-agent）、
 *       生成 PPT（deck-generation）、美化 PPT（ppt-polish）——的状态、加载和动作
 *       集中到一处，让 DesignStudio 只负责"选择显示哪一块"。
 * 谁可以改：主干层，影响整个智能模式；改完必须跑 `npm run verify`。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-deck-shared`。
 * 被谁用：`components/employee-app.tsx` 的 DesignStudio。
 * 验证方式：`npm run verify`。
 *
 * 设计约定：
 * - `historyLoaded` 记录三条链路各自是否已加载完成，首次进入时用来选中最近的任务。
 * - `deckLoadSequence` 用于丢弃过期的生成 PPT 列表响应，避免慢响应覆盖新数据。
 * - 动作函数失败时只提示、不改状态；成功时更新对应 run。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { employeeApi } from "@/lib/employee-api";
import type { DeckGenerationRun, DesignAgentRun, Service } from "@/lib/employee-api-types";
import type { DeckRegenerateAction } from "@/lib/employee-deck-shared";
import type { PptPolishRun } from "@/components/employee/polish-types";

export type HistoryLoaded = { image: boolean; deck: boolean; polish: boolean };

export function useSmartStudioRuns(service: Service, notify: (text: string) => void, focusHistoryTop?: () => void) {
  const [runs, setRuns] = useState<DesignAgentRun[]>([]);
  const [activeRun, setActiveRun] = useState<DesignAgentRun | null>(null);
  const [deckRuns, setDeckRuns] = useState<DeckGenerationRun[]>([]);
  const [activeDeckRun, setActiveDeckRun] = useState<DeckGenerationRun | null>(null);
  const [polishRuns, setPolishRuns] = useState<PptPolishRun[]>([]);
  const [activePolishRun, setActivePolishRun] = useState<PptPolishRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [workerWarning, setWorkerWarning] = useState("");
  const [polishWorkerWarning, setPolishWorkerWarning] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState<HistoryLoaded>({ image: false, deck: false, polish: false });
  const [initialHistorySelected, setInitialHistorySelected] = useState(false);
  const deckLoadSequence = useRef(0);
  // focusHistoryTop 操作的是组件里的历史列表 DOM，用 ref 承接，避免在渲染期间写 ref
  const focusHistoryRef = useRef<(() => void) | undefined>(undefined);
  useEffect(() => { focusHistoryRef.current = focusHistoryTop; }, [focusHistoryTop]);
  const focusHistory = useCallback(() => { focusHistoryRef.current?.(); }, []);

  const loadRuns = useCallback(async () => {
    const response = await employeeApi.design.list(service.id);
    const result = await response.json();
    if (!response.ok) return notify(result.error || "智能美化记录读取失败");
    setRuns(result.runs || []);
    setWorkerWarning(result.workerHealth?.ok === false ? (result.workerHealth.message || "后台智能模式 Worker 未运行/已停止") : "");
    setActiveRun(current => current ? (result.runs || []).find((item: DesignAgentRun) => item.id === current.id) || current : current);
    setHistoryLoaded(current => ({ ...current, image: true }));
  }, [notify, service.id]);

  const loadDeckRuns = useCallback(async () => {
    const sequence = ++deckLoadSequence.current;
    const response = await employeeApi.deck.list(service.id);
    const result = await response.json();
    if (sequence !== deckLoadSequence.current) return;
    if (!response.ok) return notify(result.error || "生成 PPT 记录读取失败");
    const nextRuns = result.runs || [];
    setDeckRuns(nextRuns);
    setActiveDeckRun(current => current ? nextRuns.find((item: DeckGenerationRun) => item.id === current.id) || current : current);
    setHistoryLoaded(current => ({ ...current, deck: true }));
  }, [notify, service.id]);

  const syncPolishRuns = useCallback((nextRuns: PptPolishRun[]) => {
    setPolishRuns(nextRuns);
    setActivePolishRun(current => current ? nextRuns.find(item => item.id === current.id) || current : current);
    setHistoryLoaded(current => ({ ...current, polish: true }));
  }, []);

  const loadPolishRuns = useCallback(async () => {
    const response = await employeeApi.polish.list(service.id);
    const result = await response.json();
    if (!response.ok) return notify(result.error || "美化 PPT 记录读取失败");
    setPolishWorkerWarning(result.workerHealth?.ok === false ? (result.workerHealth.message || "PPT 美化 Worker 未运行/已停止") : "");
    syncPolishRuns((result.runs || []) as PptPolishRun[]);
  }, [notify, service.id, syncPolishRuns]);

  /** 作废仍在飞行中的"生成 PPT 列表"响应，避免慢响应覆盖刚创建的任务 */
  const invalidateDeckLoad = useCallback(() => {
    deckLoadSequence.current += 1;
  }, []);

  /**
   * 首次进入工作台时，三条链路都加载完成后自动选中"最近一次任务"，
   * 让员工直接看到上次做到哪一步，而不是空白面板。
   */
  useEffect(() => {
    if (initialHistorySelected || !historyLoaded.image || !historyLoaded.deck || !historyLoaded.polish) return;
    const latest = [
      ...deckRuns.map(run => ({ kind: "deck" as const, run, createdAt: run.createdAt })),
      ...polishRuns.map(run => ({ kind: "polish" as const, run, createdAt: run.createdAt })),
      ...runs.map(run => ({ kind: "image" as const, run, createdAt: run.createdAt }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const timer = window.setTimeout(() => {
      if (latest?.kind === "deck") { setActiveRun(null); setActivePolishRun(null); setActiveDeckRun(latest.run); }
      if (latest?.kind === "polish") { setActiveRun(null); setActiveDeckRun(null); setActivePolishRun(latest.run); }
      if (latest?.kind === "image") { setActiveDeckRun(null); setActivePolishRun(null); setActiveRun(latest.run); }
      setInitialHistorySelected(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [deckRuns, historyLoaded, initialHistorySelected, polishRuns, runs]);

  /* ------------------------------------------------------------------ *
   * 生成 PPT：任务动作
   * ------------------------------------------------------------------ */
  async function confirmDeckRun() {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.deck.confirm(service.id, activeDeckRun.id);
      const result = await response.json();
      if (!response.ok) return notify(result.error || "确认生成失败");
      setDeckRun(result.run);
      notify("已开始批量生成页面图片");
    } finally { setBusy(false); }
  }

  async function replanDeckRun(stylePack?: string) {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.deck.replan(service.id, activeDeckRun.id, stylePack || activeDeckRun.stylePack);
      const result = await response.json();
      if (!response.ok) return notify(result.error || "重新生成方案失败");
      setDeckRun(result.run);
      notify(stylePack && stylePack !== activeDeckRun.stylePack ? "已按新风格重新生成方案" : "已重新生成方案");
    } finally { setBusy(false); }
  }

  async function createDeckPpt() {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.deck.createPpt(service.id, activeDeckRun.id);
      const result = await response.json();
      if (!response.ok) return notify(result.error || "PPT 生成失败");
      setDeckRun(result.run);
      notify(result.run.status === "ppt_ready" ? "PPT 已生成" : "已进入 PDF 转 PPT 队列");
    } finally { setBusy(false); }
  }

  async function regenerateDeckSlide(slideId: string, action: DeckRegenerateAction) {
    if (!activeDeckRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.deck.regenerateSlide(service.id, activeDeckRun.id, slideId, { action });
      const result = await response.json();
      if (!response.ok) return notify(result.error || "页面重生失败");
      if (result.run) setDeckRun(result.run);
      else await loadDeckRuns();
      notify(action === "closer_previous" ? "已把上一页真实成图交给 Image2 作为风格参考" : "已重新生成本页");
    } finally { setBusy(false); }
  }

  /* ------------------------------------------------------------------ *
   * 美化 PPT：任务动作
   * ------------------------------------------------------------------ */
  async function confirmPolishRun() {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.polish.confirm(service.id, activePolishRun.id);
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "确认美化方案失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify(result.run.status === "source_ready" ? "页面图片已准备好，请点选需要修改的页面。" : "已确认方案，后台开始生成逐页预览图。");
    } finally { setBusy(false); }
  }

  async function createPolishPpt() {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.polish.createPpt(service.id, activePolishRun.id);
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "PPT 转化失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify(result.run.status === "ppt_ready" ? "PPT 已生成" : "已进入 PDF / Codia 转化队列");
    } finally { setBusy(false); }
  }

  async function addPolishPageNotes(pageIndexes: number[], note: string) {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.polish.addPageNotes(service.id, activePolishRun.id, { pageIndexes, note });
      const result = await responseJson(response);
      if (!response.ok) return notify(result.error || "逐页修改要求保存失败");
      setPolishRun(result.run as PptPolishRun);
      notify("已保存所选页面的修改要求");
    } finally { setBusy(false); }
  }

  async function regeneratePolishSlide(slideIndex: number, action: "reroll" | "closer_previous") {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.polish.regenerateSlide(service.id, activePolishRun.id, slideIndex, { action });
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "页面重生失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify(action === "closer_previous" ? "已按上一页风格重生本页" : "已重新生成本页");
    } finally { setBusy(false); }
  }

  async function retryPolishRun() {
    if (!activePolishRun) return;
    setBusy(true);
    try {
      const response = await employeeApi.polish.retry(service.id, activePolishRun.id);
      const result = await responseJson(response);
      if (!response.ok) {
        const message = result.error || "继续生成失败";
        if (response.status === 503) setPolishWorkerWarning(message);
        return notify(message);
      }
      setPolishWorkerWarning("");
      setPolishRun(result.run as PptPolishRun);
      notify("已继续生成未完成页面。");
    } finally { setBusy(false); }
  }

  /* ------------------------------------------------------------------ *
   * 选中某个任务：清掉另外两族的高亮，并刷新历史位置
   * ------------------------------------------------------------------ */
  function setDeckRun(run: DeckGenerationRun) {
    invalidateDeckLoad();
    setActiveRun(null);
    setActivePolishRun(null);
    setActiveDeckRun(run);
    setDeckRuns(current => [run, ...current.filter(item => item.id !== run.id)]);
    focusHistory();
  }

  function setPolishRun(run: PptPolishRun, onOpened?: () => void) {
    setActiveRun(null);
    setActiveDeckRun(null);
    setActivePolishRun(run);
    setPolishRuns(current => [run, ...current.filter(item => item.id !== run.id)].slice(0, 8));
    onOpened?.();
    focusHistory();
  }

  /**
   * 接口返回应当是 JSON，但开发热更新期间偶尔会返回空的 500 响应。
   * 这里与 employee-app.tsx 保持同一策略，保证界面可恢复。
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function responseJson(response: Response): Promise<Record<string, any>> {
    const text = await response.text();
    if (!text.trim()) return { error: "服务暂时没有返回内容（HTTP " + response.status + "），请刷新或重启开发服务后重试。" };
    try { return JSON.parse(text); } catch { return { error: "服务返回了无法识别的内容（HTTP " + response.status + "）。" }; }
  }

  return {
    runs, setRuns, activeRun, setActiveRun,
    deckRuns, setDeckRuns, activeDeckRun, setActiveDeckRun,
    polishRuns, setPolishRuns, activePolishRun, setActivePolishRun,
    busy, setBusy,
    workerWarning, setWorkerWarning,
    polishWorkerWarning, setPolishWorkerWarning,
    historyLoaded, setHistoryLoaded,
    initialHistorySelected,
    loadRuns, loadDeckRuns, loadPolishRuns, syncPolishRuns,
    invalidateDeckLoad,
    setDeckRun, setPolishRun,
    deckActions: { confirmDeckRun, replanDeckRun, createDeckPpt, regenerateDeckSlide },
    polishActions: { confirmPolishRun, createPolishPpt, addPolishPageNotes, regeneratePolishSlide, retryPolishRun }
  };
}
