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
import type { PptPolishRun } from "@/components/employee/polish-types";

export type HistoryLoaded = { image: boolean; deck: boolean; polish: boolean };

export function useSmartStudioRuns(service: Service, notify: (text: string) => void) {
  const [runs, setRuns] = useState<DesignAgentRun[]>([]);
  const [activeRun, setActiveRun] = useState<DesignAgentRun | null>(null);
  const [deckRuns, setDeckRuns] = useState<DeckGenerationRun[]>([]);
  const [activeDeckRun, setActiveDeckRun] = useState<DeckGenerationRun | null>(null);
  const [polishRuns, setPolishRuns] = useState<PptPolishRun[]>([]);
  const [activePolishRun, setActivePolishRun] = useState<PptPolishRun | null>(null);
  const [workerWarning, setWorkerWarning] = useState("");
  const [polishWorkerWarning, setPolishWorkerWarning] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState<HistoryLoaded>({ image: false, deck: false, polish: false });
  const [initialHistorySelected, setInitialHistorySelected] = useState(false);
  const deckLoadSequence = useRef(0);

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

  return {
    runs, setRuns, activeRun, setActiveRun,
    deckRuns, setDeckRuns, activeDeckRun, setActiveDeckRun,
    polishRuns, setPolishRuns, activePolishRun, setActivePolishRun,
    workerWarning, setWorkerWarning,
    polishWorkerWarning, setPolishWorkerWarning,
    historyLoaded, setHistoryLoaded,
    initialHistorySelected,
    loadRuns, loadDeckRuns, loadPolishRuns, syncPolishRuns,
    invalidateDeckLoad
  };
}
