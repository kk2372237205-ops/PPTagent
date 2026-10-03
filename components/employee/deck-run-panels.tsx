/* eslint-disable @next/next/no-img-element */
/**
 * 生成 PPT 的运行面板与高级版方案编辑（可复用 UI 组件）
 *
 * 职责：一次生成任务进入方案阶段后的全部界面——
 *       1) `DeckAdvancedPlanRun`：高级版逐页结构/内容复核，含自动保存、增删页面与内容块、拖动排序。
 *       2) `DeckAdvancedSettingsEditor`：返回修改任务资料（增删资料、换大纲、换配色参考）。
 *       3) `DeckGenerationRunPanel`：按任务状态分流到上面两种面板或内联运行面板。
 *       4) `DeckInlineRun`：快速版/高级版共用的预览、单页返工与导出操作区。
 * 谁可以改：本模块单独维护；改动不要顺手改后台执行脚本或生成链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-deck-constants`、
 *       `@/lib/employee-deck-shared`、`./deck-summary`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的小 W 智能模式。
 * 验证方式：`npm run verify`。
 */

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronUp, Copy, Download, FileText, ImagePlus, LoaderCircle, Save, Trash2, Upload, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { DeckGenerationRun, DeckPageBlock, DeckPageDraft, Service } from "@/lib/employee-api-types";
import { deckStylePacks } from "@/lib/employee-deck-constants";
import { deckPageDraft, deckRunStyleLabel, deckStatusText, formatDeckFileSize, parseDeckObject, type DeckRegenerateAction, type DeckRunActions } from "@/lib/employee-deck-shared";
import { DeckAdvancedContentReview, DeckSourceSummary } from "./deck-summary";

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

export function DeckAdvancedSettingsEditor({ service, run, onRunUpdate, onCancel }: {
  service: Service;
  run: DeckGenerationRun;
  onRunUpdate: (run: DeckGenerationRun) => void;
  onCancel: () => void;
}) {
  const initialOutline = parseDeckObject(run.outlineInputJson);
  const initialUnity = parseDeckObject(run.unityOptionsJson);
  const [projectName, setProjectName] = useState(run.projectName);
  const [projectType, setProjectType] = useState(run.projectType || "");
  const [brief, setBrief] = useState(run.brief);
  const [referenceText, setReferenceText] = useState(run.referenceText || "");
  const [outlineText, setOutlineText] = useState(String(initialOutline.text || ""));
  const [stylePack, setStylePack] = useState(run.stylePack);
  const [paletteMode, setPaletteMode] = useState<"preset" | "reference">(run.paletteMode === "reference" ? "reference" : "preset");
  const [unityOptions, setUnityOptions] = useState({
    mainColor: Boolean(initialUnity.mainColor ?? true),
    headerFooter: Boolean(initialUnity.headerFooter ?? true),
    backgroundTexture: Boolean(initialUnity.backgroundTexture ?? true),
    cardStyle: Boolean(initialUnity.cardStyle ?? false),
    decorativeElements: Boolean(initialUnity.decorativeElements ?? false)
  });
  const [removedSourceIds, setRemovedSourceIds] = useState<Set<string>>(() => new Set());
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [themeFile, setThemeFile] = useState<File | null>(null);
  const [themePreview, setThemePreview] = useState("");
  const [saving, setSaving] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const outlineInputRef = useRef<HTMLInputElement>(null);
  const themeInputRef = useRef<HTMLInputElement>(null);
  const sources = run.sources || [];
  const contentSources = sources.filter(source => source.kind === "reference");
  const outlineSources = sources.filter(source => source.kind === "outline");
  const themeSources = sources.filter(source => source.kind === "theme");

  useEffect(() => () => { if (themePreview) URL.revokeObjectURL(themePreview); }, [themePreview]);

  function toggleRemoveSource(sourceId: string) {
    setRemovedSourceIds(current => {
      const next = new Set(current);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  }

  function addSourceFiles(files: File[]) {
    const accepted = files.filter(file => /\.(pdf|docx|xlsx|pptx|txt|md|csv|json|png|jpe?g|webp)$/i.test(file.name) && file.size <= 200 * 1024 * 1024);
    if (!accepted.length) return;
    setSourceFiles(current => Array.from(new Map([...current, ...accepted].map(file => [file.name + ":" + file.size + ":" + file.lastModified, file])).values()).slice(0, 30));
  }

  function chooseTheme(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) return;
    if (themePreview) URL.revokeObjectURL(themePreview);
    setThemeFile(file);
    setThemePreview(URL.createObjectURL(file));
    setPaletteMode("reference");
  }

  async function submit() {
    const retainedReferences = sources.filter(source => source.kind === "reference" && !removedSourceIds.has(source.id)).length;
    if (retainedReferences + sourceFiles.length < 1) return window.alert("高级版至少保留或新增一份内容资料");
    if (!outlineText.trim() && !outlineFile && !sources.some(source => source.kind === "outline" && !removedSourceIds.has(source.id))) {
      return window.alert("请保留或补充 PPT 结构");
    }
    const form = new FormData();
    form.set("projectName", projectName.trim());
    form.set("projectType", projectType.trim());
    form.set("brief", brief.trim());
    form.set("referenceText", referenceText.trim());
    form.set("outlineText", outlineText.trim());
    form.set("stylePack", stylePack);
    form.set("paletteMode", paletteMode);
    form.set("unityOptions", JSON.stringify(unityOptions));
    form.set("removedSourceIds", JSON.stringify(Array.from(removedSourceIds)));
    sourceFiles.forEach(file => form.append("references", file));
    if (outlineFile) form.set("outlineFile", outlineFile);
    if (themeFile) form.set("themeReference", themeFile);
    setSaving(true);
    try {
      const response = await employeeApi.deck.saveSettings(service.id, run.id, form);
      const result = await responseJson(response);
      if (!response.ok) return window.alert(result.error || "任务资料保存失败");
      onRunUpdate(result.run as DeckGenerationRun);
      onCancel();
    } finally {
      setSaving(false);
    }
  }

  return <section className="design-run design-deck-run deck-advanced-settings">
    <div className="design-run-head">
      <div><span className="design-status outline_ready">高级版任务资料</span><h2>返回修改初始任务</h2><small>已上传资料会保留；保存后重新读取资料、匹配内容并重建视觉方案。</small></div>
      <button className="design-secondary" type="button" onClick={onCancel}><ChevronLeft/>返回整套方案</button>
    </div>
    <div className="deck-settings-grid">
      <label>项目名称<input value={projectName} onChange={event => setProjectName(event.target.value)}/></label>
      <label>汇报类型 / 用途<input value={projectType} onChange={event => setProjectType(event.target.value)}/></label>
      <label className="wide">项目简介<textarea value={brief} onChange={event => setBrief(event.target.value)}/></label>
      <label className="wide">整套高优先级要求<textarea value={referenceText} onChange={event => setReferenceText(event.target.value)} placeholder="可补充受众、禁用表达、必须强调的结论和整套视觉偏好；例如正文页优先图文相辅，不使用固定图片区"/></label>
      <label className="wide">逐页结构文字<textarea value={outlineText} onChange={event => setOutlineText(event.target.value)} placeholder="保留或重新写每页大标题、小标题和想讲的内容"/></label>
    </div>
    <section className="deck-settings-section">
      <header><div><b>内容资料</b><span>这里只放用于提取正文、事实和数字的资料</span></div><button type="button" onClick={() => sourceInputRef.current?.click()}><Upload/>新增内容资料</button></header>
      <div className="deck-source-list">{contentSources.map(source => <article key={source.id} className={removedSourceIds.has(source.id) ? "removed" : ""}><FileText/><span><b>{source.originalName}</b><small>内容资料 · {formatDeckFileSize(source.size)}</small></span><button type="button" onClick={() => toggleRemoveSource(source.id)} aria-label={removedSourceIds.has(source.id) ? "保留资料" : "移除资料"}>{removedSourceIds.has(source.id) ? <Check/> : <X/>}</button></article>)}</div>
      {sourceFiles.length > 0 && <div className="deck-source-list new">{sourceFiles.map((file, index) => <article key={file.name + ":" + file.lastModified}><FileText/><span><b>{file.name}</b><small>新增内容资料 · {formatDeckFileSize(file.size)}</small></span><button type="button" onClick={() => setSourceFiles(current => current.filter((_, itemIndex) => itemIndex !== index))}><X/></button></article>)}</div>}
      <input ref={sourceInputRef} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" onChange={event => addSourceFiles(Array.from(event.target.files || []))}/>
    </section>
    <section className="deck-settings-section">
      <header><div><b>PPT 结构</b><span>文字结构在上方编辑；这里单独管理大纲文件</span></div></header>
      {outlineSources.length > 0 && <div className="deck-source-list deck-structure-files">{outlineSources.map(source => <article key={source.id} className={removedSourceIds.has(source.id) ? "removed" : ""}><FileText/><span><b>{source.originalName}</b><small>大纲文件 · {formatDeckFileSize(source.size)}</small></span><button type="button" onClick={() => toggleRemoveSource(source.id)} aria-label={removedSourceIds.has(source.id) ? "保留大纲" : "移除大纲"}>{removedSourceIds.has(source.id) ? <Check/> : <X/>}</button></article>)}</div>}
      <div className="deck-settings-file-actions">
        <button type="button" onClick={() => outlineInputRef.current?.click()}><Upload/>替换大纲文件</button>
        {outlineFile && <span><FileText/>{outlineFile.name}<button type="button" onClick={() => setOutlineFile(null)}><X/></button></span>}
        <input ref={outlineInputRef} type="file" hidden accept=".pdf,.docx,.xlsx,.pptx,.txt,.md" onChange={event => setOutlineFile(event.target.files?.[0] || null)}/>
      </div>
    </section>
    <section className="deck-settings-section deck-visual-settings">
      <header><div><b>配色与版式</b><span>配色参考和内容资料互不混放；参考图只决定颜色关系</span></div></header>
      <div className="deck-palette-grid">
        <button type="button" className={paletteMode === "preset" ? "active" : ""} onClick={() => setPaletteMode("preset")}><Check/><span><b>内置配色</b><small>不使用旧配色参考图</small></span></button>
        <button type="button" className={paletteMode === "reference" ? "active" : ""} onClick={() => setPaletteMode("reference")}><ImagePlus/><span><b>参考图配色</b><small>{sources.some(source => source.kind === "theme" && !removedSourceIds.has(source.id)) ? "沿用现有参考图" : "需要上传一张新参考图"}</small></span></button>
      </div>
      {paletteMode === "preset" && <label className="deck-layout-language">内置配色风格<select value={stylePack} onChange={event => setStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>内置风格同时规定配色与版式。</small></label>}
      {paletteMode === "reference" && <>
        {themeSources.length > 0 && <div className="deck-source-list deck-theme-files">{themeSources.map(source => <article key={source.id} className={removedSourceIds.has(source.id) ? "removed" : ""}><ImagePlus/><span><b>{source.originalName}</b><small>配色参考图 · {formatDeckFileSize(source.size)}</small></span><button type="button" onClick={() => toggleRemoveSource(source.id)} aria-label={removedSourceIds.has(source.id) ? "保留参考图" : "移除参考图"}>{removedSourceIds.has(source.id) ? <Check/> : <X/>}</button></article>)}</div>}
        <div className="deck-theme-reference compact" onClick={() => themeInputRef.current?.click()}>{themePreview ? <><img src={themePreview} alt="新配色参考"/><b>{themeFile?.name}</b></> : <><ImagePlus/><span>上传新的配色参考图（可留空以沿用现有图）</span></>}<input ref={themeInputRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={event => chooseTheme(event.target.files?.[0])}/></div>
      </>}
    </section>
    <div className="deck-unity-options">
      <label><input type="checkbox" checked={unityOptions.mainColor} onChange={event => setUnityOptions(current => ({ ...current, mainColor: event.target.checked }))}/>主色统一</label>
      <label><input type="checkbox" checked={unityOptions.headerFooter} onChange={event => setUnityOptions(current => ({ ...current, headerFooter: event.target.checked }))}/>页眉页脚统一</label>
      <label><input type="checkbox" checked={unityOptions.backgroundTexture} onChange={event => setUnityOptions(current => ({ ...current, backgroundTexture: event.target.checked }))}/>背景质感统一</label>
      <label><input type="checkbox" checked={unityOptions.cardStyle} onChange={event => setUnityOptions(current => ({ ...current, cardStyle: event.target.checked }))}/>卡片样式统一</label>
      <label><input type="checkbox" checked={unityOptions.decorativeElements} onChange={event => setUnityOptions(current => ({ ...current, decorativeElements: event.target.checked }))}/>装饰元素统一</label>
    </div>
    <footer className="deck-editor-actions"><button className="design-secondary" type="button" onClick={onCancel}>取消</button><button className="design-apply" type="button" onClick={() => void submit()} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <Save/>}保存并重新分析资料</button></footer>
  </section>;
}


export function DeckAdvancedPlanRun(props: DeckRunActions) {
  const { service, run, busy, onRunUpdate, onConfirm, onReplan } = props;
  const [drafts, setDrafts] = useState<DeckPageDraft[]>(() => (run.pagePlans || []).map(deckPageDraft));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [nextStylePack, setNextStylePack] = useState(run.stylePack);
  const [editingSettings, setEditingSettings] = useState(false);
  const dirtyDrafts = useRef(false);
  const autoSaveTimer = useRef<number | null>(null);
  const [dragPageIndex, setDragPageIndex] = useState<number | null>(null);
  const isOutlineStep = run.status === "outline_ready";
  const isContentStep = run.status === "plan_ready";
  const canEditStructure = isOutlineStep;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      dirtyDrafts.current = false;
      setDrafts((run.pagePlans || []).map(deckPageDraft));
      setNextStylePack(run.stylePack);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [run.id, run.status, run.updatedAt, run.stylePack, run.pagePlans]);

  useEffect(() => {
    if (!dirtyDrafts.current || (!isOutlineStep && !isContentStep)) return;
    const snapshot = drafts;
    const timer = window.setTimeout(async () => {
      autoSaveTimer.current = null;
      dirtyDrafts.current = false;
      setSaving(true);
      try {
        const response = await employeeApi.deck.savePages(service.id, run.id, { pages: snapshot, action: "save" });
        const result = await responseJson(response);
        if (!response.ok) {
          setMessage(result.error || "自动保存失败，请手动保存");
          dirtyDrafts.current = true;
          return;
        }
        onRunUpdate(result.run as DeckGenerationRun);
        setMessage("已自动保存");
      } catch (error) {
        dirtyDrafts.current = true;
        setMessage(error instanceof Error ? error.message : "自动保存失败，请手动保存");
      } finally {
        setSaving(false);
      }
    }, 1000);
    autoSaveTimer.current = timer;
    return () => { window.clearTimeout(timer); if (autoSaveTimer.current === timer) autoSaveTimer.current = null; };
  }, [drafts, isContentStep, isOutlineStep, onRunUpdate, run.id, service.id]);

  function normalizePageOrder(pages: DeckPageDraft[]) {
    return pages.map((page, index) => {
      const last = index === pages.length - 1;
      const role = index === 0 ? "cover" : last ? "ending" : ["cover", "ending"].includes(page.role) ? "insight" : page.role;
      return {
        ...page,
        pageIndex: index + 1,
        role,
        density: index === 0 ? "sparse" as const : page.density
      };
    });
  }

  function changeDrafts(updater: (pages: DeckPageDraft[]) => DeckPageDraft[]) {
    dirtyDrafts.current = true;
    setDrafts(current => normalizePageOrder(updater(current)));
  }
  function updatePage(pageIndex: number, values: Partial<DeckPageDraft>) {
    changeDrafts(current => current.map(page => page.pageIndex === pageIndex ? { ...page, ...values } : page));
  }

  function updateBlock(pageIndex: number, blockId: string, values: Partial<DeckPageBlock>) {
    changeDrafts(current => current.map(page => page.pageIndex === pageIndex ? {
      ...page,
      blocks: page.blocks.map(block => block.id === blockId ? { ...block, ...values } : block)
    } : page));
  }

  function addBlock(pageIndex: number) {
    changeDrafts(current => current.map(page => page.pageIndex === pageIndex ? {
      ...page,
      blocks: [...page.blocks, { id: "block-" + Date.now(), subtitle: "", instruction: "", content: "", constraintMode: "polish", evidenceIds: [] }]
    } : page));
  }

  function removeBlock(pageIndex: number, blockId: string) {
    changeDrafts(current => current.map(page => page.pageIndex === pageIndex ? { ...page, blocks: page.blocks.filter(block => block.id !== blockId) } : page));
  }

  function addPage() {
    if (drafts.length >= 30) return setMessage("最多 30 页");
    changeDrafts(current => {
      const insertAt = Math.max(1, current.length - 1);
      const nextPage: DeckPageDraft = {
        pageIndex: insertAt + 1, title: "新增内容页", role: "insight", purpose: "", blocks: [],
        mustInclude: [], conclusion: "", density: "standard", layoutType: "auto", constraintMode: "polish", evidence: [], visualEvidence: [], directorContract: {}, warnings: [], locked: false
      };
      return [...current.slice(0, insertAt), nextPage, ...current.slice(insertAt)];
    });
    setMessage("已插入到结尾页之前");
  }

  function removePage(pageIndex: number) {
    if (drafts.length <= 2) return setMessage("至少保留 2 页");
    if (pageIndex === 1 || pageIndex === drafts.length) return setMessage("封面和结尾页必须保留");
    changeDrafts(current => current.filter(page => page.pageIndex !== pageIndex));
  }

  function movePage(pageIndex: number, direction: -1 | 1) {
    const sourceIndex = pageIndex - 1;
    const targetIndex = sourceIndex + direction;
    if (sourceIndex <= 0 || sourceIndex >= drafts.length - 1 || targetIndex <= 0 || targetIndex >= drafts.length - 1) return;
    changeDrafts(current => {
      const next = [...current];
      [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
      return next;
    });
  }

  function dropPage(targetPageIndex: number) {
    if (!dragPageIndex || dragPageIndex === targetPageIndex) return setDragPageIndex(null);
    if ([1, drafts.length].includes(dragPageIndex) || [1, drafts.length].includes(targetPageIndex)) return setDragPageIndex(null);
    changeDrafts(current => {
      const next = [...current];
      const [moved] = next.splice(dragPageIndex - 1, 1);
      const targetIndex = next.findIndex(page => page.pageIndex === targetPageIndex);
      next.splice(targetIndex < 0 ? next.length - 1 : targetIndex, 0, moved);
      return next;
    });
    setDragPageIndex(null);
  }
  function copyPage(pageIndex: number) {
    if (drafts.length >= 30) return setMessage("最多 30 页");
    if (pageIndex === 1 || pageIndex === drafts.length) return setMessage("封面和结尾页不能复制");
    changeDrafts(current => {
      const sourceIndex = pageIndex - 1;
      const source = current[sourceIndex];
      const copy: DeckPageDraft = {
        ...source,
        title: source.title + "（副本）",
        blocks: source.blocks.map((block, index) => ({ ...block, id: "block-copy-" + Date.now() + "-" + index })),
        evidence: [...source.evidence],
        warnings: [...source.warnings],
        locked: false
      };
      return [...current.slice(0, sourceIndex + 1), copy, ...current.slice(sourceIndex + 1)];
    });
  }
  async function savePages(action: "save" | "match" | "outline") {
    if (autoSaveTimer.current !== null) { window.clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    dirtyDrafts.current = false;
    setSaving(true);
    setMessage("");
    try {
      const response = await employeeApi.deck.savePages(service.id, run.id, { pages: drafts, action });
      const result = await responseJson(response);
      if (!response.ok) {
        setMessage(result.error || "逐页方案保存失败");
        return false;
      }
      onRunUpdate(result.run as DeckGenerationRun);
      setMessage(action === "match" ? "正在把旧任务整理为一份完整方案" : action === "outline" ? "已返回结构调整" : "整套方案已保存");
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function confirmFinal() {
    if (!await savePages("save")) return;
    onConfirm();
  }

  async function changeStyle() {
    if (!await savePages("save")) return;
    onReplan(nextStylePack);
  }

  if (editingSettings) return <DeckAdvancedSettingsEditor service={service} run={run} onRunUpdate={onRunUpdate} onCancel={() => setEditingSettings(false)}/>;

  const waitingForSources = ["sources_queued", "source_processing"].includes(run.status);
  const waitingForMatch = ["matching_queued", "matching"].includes(run.status);
  return <section className="design-run design-deck-run deck-advanced-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{deckStatusText(run.status)}</span>
        <h2>{run.projectName}</h2>
        <small>高级版 · {run.pageCount} 页 · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      <div>{run.status === "failed" && <button className="design-apply" type="button" onClick={() => onReplan()} disabled={busy || saving}>重新分析资料</button>}<button className="design-secondary" type="button" onClick={() => setEditingSettings(true)} disabled={busy || saving}>返回修改任务资料</button>{isContentStep && <button className="design-apply" onClick={() => void confirmFinal()} disabled={busy || saving}>确认整套方案并生成预览</button>}</div>
    </div>
    {run.error && <div className="design-error">{run.error}</div>}
    <DeckSourceSummary run={run}/>
    {isContentStep && <div className="deck-image-budget-note"><ImagePlus/><span>确认后最多并发生成 6 页，初次预计使用 {run.pageCount} 次 Image2；每页一次成图，不会自动重绘。</span></div>}
    {waitingForSources && <section className="deck-waiting inline"><LoaderCircle className="spin"/><h3>GPT-5.6 正在读取并整理资料</h3><p>系统按大纲逐页匹配文字、事实和数字，保留文件名与来源位置；完成后只确认一次整套方案。</p></section>}
    {waitingForMatch && <section className="deck-waiting inline"><LoaderCircle className="spin"/><h3>正在生成完整逐页方案</h3><p>GPT-5.6 正在把资料内容、页面正文、结论与画面执行方向合并到同一份方案中。</p></section>}
    {(isOutlineStep || isContentStep) && <section className="deck-advanced-editor">
      <header>
        <div><span>{isOutlineStep ? "旧任务兼容" : "一次确认"}</span><h3>{isOutlineStep ? "继续整理这份旧任务" : "确认整套逐页方案"}</h3><p>{isOutlineStep ? "这份任务停留在旧版结构阶段。确认后 GPT-5.6 会继续匹配资料，并生成新版完整方案。" : "这里已经合并页面任务、资料正文、来源、结论和画面方向；确认后 Image2 才开始逐页成图。"}</p></div>
        {isOutlineStep && <button type="button" onClick={addPage}><FileText/>增加一页</button>}
      </header>
      {isOutlineStep ? <div className="deck-page-editor-list">{drafts.map(page => <details key={page.pageIndex} className={"deck-page-editor" + (dragPageIndex === page.pageIndex ? " dragging" : "")} open={page.pageIndex <= 2} draggable={canEditStructure && page.pageIndex > 1 && page.pageIndex < drafts.length} onDragStart={() => canEditStructure && setDragPageIndex(page.pageIndex)} onDragOver={event => { if (canEditStructure && page.pageIndex > 1 && page.pageIndex < drafts.length) event.preventDefault(); }} onDrop={event => { event.preventDefault(); if (canEditStructure) dropPage(page.pageIndex); }} onDragEnd={() => setDragPageIndex(null)}>
        <summary><span>第 {page.pageIndex} 页</span><b>{page.title || "未命名页面"}</b><i>{page.density === "compact" ? "紧凑" : page.density === "sparse" ? "少文字" : "标准"}</i></summary>
        <div className="deck-page-editor-body">
          <div className="deck-page-tools">
            <span>{page.pageIndex === 1 ? "固定封面" : page.pageIndex === drafts.length ? "固定末页，可做内容收束" : "正文页，可拖动排序"}</span>
            <div>{canEditStructure && page.pageIndex > 1 && page.pageIndex < drafts.length && <><button type="button" onClick={() => movePage(page.pageIndex, -1)} disabled={page.pageIndex <= 2} title="上移"><ChevronUp/></button><button type="button" onClick={() => movePage(page.pageIndex, 1)} disabled={page.pageIndex >= drafts.length - 1} title="下移"><ChevronDown/></button><button type="button" onClick={() => copyPage(page.pageIndex)} title="复制本页"><Copy/></button><button type="button" onClick={() => removePage(page.pageIndex)} title="删除本页"><Trash2/></button></>}</div>
          </div>
          <div className="deck-page-fields">
            <label>页面大标题<input value={page.title} onChange={event => updatePage(page.pageIndex, { title: event.target.value })}/></label>
            <label>信息密度<select value={page.density} onChange={event => updatePage(page.pageIndex, { density: event.target.value as DeckPageDraft["density"] })}><option value="sparse">少文字 / 强视觉</option><option value="standard">标准汇报页</option><option value="compact">紧凑信息页</option></select></label>
            <label className="wide">这一页要解决什么问题<textarea value={page.purpose} onChange={event => updatePage(page.pageIndex, { purpose: event.target.value })}/></label>
            <label>版式偏好<input value={page.layoutType} onChange={event => updatePage(page.pageIndex, { layoutType: event.target.value })} placeholder="自动 / 数据看板 / 对比 / 时间轴"/></label>
            <label>页末结论<input value={page.conclusion} onChange={event => updatePage(page.pageIndex, { conclusion: event.target.value })} placeholder="这一页希望观众记住什么"/></label>
          </div>
          <section className="deck-block-list">
            <header><b>小标题与内容块</b><button type="button" onClick={() => addBlock(page.pageIndex)}><FileText/>增加内容块</button></header>
            {page.blocks.length ? page.blocks.map((block, blockIndex) => <article key={block.id} className="deck-block-editor">
              <div><span>{blockIndex + 1}</span><input value={block.subtitle} onChange={event => updateBlock(page.pageIndex, block.id, { subtitle: event.target.value })} placeholder="小标题"/><select value={block.constraintMode} onChange={event => updateBlock(page.pageIndex, block.id, { constraintMode: event.target.value as DeckPageBlock["constraintMode"] })}><option value="exact">原文保留</option><option value="polish">可压缩表达</option><option value="direction">只规定方向</option></select><button type="button" onClick={() => removeBlock(page.pageIndex, block.id)} aria-label="删除内容块"><Trash2/></button></div>
              <textarea value={isContentStep ? block.content || "" : block.instruction} onChange={event => updateBlock(page.pageIndex, block.id, isContentStep ? { content: event.target.value } : { instruction: event.target.value })} placeholder={isContentStep ? "从资料中整理出的正文，可在这里修改" : "写清楚这个小标题想讲什么，系统会据此去资料里查找"}/>
            </article>) : <p>这一页暂未规定小标题。可以保持整页主视觉，也可以增加内容块。</p>}
          </section>
          {isContentStep && <section className="deck-evidence-list">
            <b>本页资料依据</b>
            {page.evidence.length ? <div>{page.evidence.map((evidence, index) => <span key={evidence.id || index}><FileText/><b>{evidence.file || evidence.source || "参考资料"}</b><small>{evidence.locator || "未标注位置"}</small></span>)}</div> : <p>没有找到可靠依据。涉及数字、日期、人物和荣誉时请补充资料后重新匹配。</p>}
            {page.warnings.length > 0 && <ul>{page.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
          </section>}
          <footer><label><input type="checkbox" checked={page.locked} onChange={event => updatePage(page.pageIndex, { locked: event.target.checked })}/>锁定本页内容</label></footer>
        </div>
      </details>)}</div> : <DeckAdvancedContentReview drafts={drafts} updatePage={updatePage} updateBlock={updateBlock}/>}
      {message && <div className="deck-editor-message">{message}</div>}
      <footer className="deck-editor-actions">
        {isOutlineStep ? <><button className="design-secondary" onClick={() => void savePages("save")} disabled={saving}>保存旧任务草稿</button><button className="design-apply" onClick={() => void savePages("match")} disabled={saving}>{saving ? <LoaderCircle className="spin"/> : <Check/>}继续整理完整方案</button></> : <>{run.paletteMode === "preset" && <><label>生成风格<select value={nextStylePack} onChange={event => setNextStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><button className="design-secondary" onClick={() => void changeStyle()} disabled={saving || busy}>按新风格重整方案</button></>}<button className="design-apply" onClick={() => void confirmFinal()} disabled={saving || busy}>确认整套方案并生成预览</button></>}
      </footer>
    </section>}
  </section>;
}

export function DeckGenerationRunPanel(props: DeckRunActions) {
  const advancedPlanning = props.run.generationMode === "advanced" && (
    ["sources_queued", "source_processing", "outline_ready", "matching_queued", "matching", "plan_ready"].includes(props.run.status)
    || (props.run.status === "failed" && !props.run.slides.some(slide => Boolean(slide.storedName)))
  );
  return advancedPlanning ? <DeckAdvancedPlanRun {...props}/> : <DeckInlineRun {...props}/>;
}


export function DeckInlineRun({ service, run, busy, onRunUpdate, onConfirm, onReplan, onCreatePpt, onRegenerate, onPreview }: {
  service: Service;
  run: DeckGenerationRun;
  busy: boolean;
  onRunUpdate: (run: DeckGenerationRun) => void;
  onConfirm: () => void;
  onReplan: (stylePack?: string) => void;
  onCreatePpt: () => void;
  onRegenerate: (slideId: string, action: DeckRegenerateAction) => void;
  onPreview: (image: { url: string; title: string }) => void;
}) {
  const [nextStylePack, setNextStylePack] = useState(run.stylePack);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setNextStylePack(run.stylePack), 0);
    return () => window.clearTimeout(timer);
  }, [run.id, run.stylePack]);
  const done = run.slides.filter(slide => slide.status === "completed").length;
  const statusText = deckStatusText(run.status);
  const pptUrl = employeeApi.urls.deck.ppt(service.id, run.id);
  const pdfUrl = employeeApi.urls.deck.pdf(service.id, run.id);
  const imagesUrl = employeeApi.urls.deck.images(service.id, run.id);
  const previewsReady = run.slides.length > 0 && run.slides.every(slide => slide.status === "completed" && Boolean(slide.storedName));
  const hasPdf = Boolean(run.pdfStoredName);
  const actionsBusy = busy || exportBusy;
  const advancedMode = run.generationMode === "advanced";
  const visibleRunError = advancedMode && /单页质检|整套一致性复核|质检服务/.test(String(run.error || ""))
    ? ""
    : run.error;

  async function createPdf() {
    setExportBusy(true);
    setExportError("");
    try {
      const response = await employeeApi.deck.createPdf(service.id, run.id);
      const result = await response.json();
      if (!response.ok) {
        setExportError(result.error || "PDF 生成失败");
        return;
      }
      onRunUpdate(result.run);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : "PDF 生成失败");
    } finally {
      setExportBusy(false);
    }
  }
  return <section className="design-run design-deck-run">
    <div className="design-run-head">
      <div>
        <span className={`design-status ${run.status}`}>{statusText}</span>
        <h2>{run.projectName}</h2>
        <small>{run.generationMode === "advanced" ? "高级版" : "快速版"} · {deckRunStyleLabel(run)} · {run.pageCount} 页 · {new Date(run.createdAt).toLocaleString("zh-CN")}</small>
      </div>
      <div className="deck-export-actions">
        {run.status === "failed" && !hasPdf && <button className="design-apply" onClick={() => onReplan()} disabled={actionsBusy}>重新分析资料</button>}
        {run.status === "plan_ready" && <><button className="design-apply" onClick={onConfirm} disabled={actionsBusy}>确认生成</button><button className="design-secondary" onClick={() => onReplan()} disabled={actionsBusy}>重新生成方案</button><button className="design-secondary" onClick={() => onReplan(nextStylePack)} disabled={actionsBusy}>调整风格</button></>}
        {previewsReady && ["review_ready", "pdf_ready", "ppt_ready", "failed"].includes(run.status) && <a className="design-secondary" href={imagesUrl}><Download/>下载图组</a>}
        {run.status === "review_ready" && !hasPdf && <button className="design-secondary" onClick={() => void createPdf()} disabled={actionsBusy}>{exportBusy ? <LoaderCircle className="spin"/> : <FileText/>}生成 PDF</button>}
        {hasPdf && ["review_ready", "pdf_ready", "ppt_ready", "failed"].includes(run.status) && <a className="design-secondary" href={pdfUrl}><Download/>下载 PDF</a>}
        {["review_ready", "pdf_ready"].includes(run.status) && <button className="design-apply" onClick={onCreatePpt} disabled={actionsBusy}>生成 PPT</button>}
        {run.status === "failed" && hasPdf && <button className="design-apply" onClick={onCreatePpt} disabled={actionsBusy}>重试生成 PPT</button>}
        {run.status === "ppt_ready" && <a className="design-apply" href={pptUrl}><Download/>下载 PPT</a>}
      </div>
    </div>
    {visibleRunError && <div className="design-error">{visibleRunError}</div>}
    {exportError && <div className="design-error">{exportError}</div>}
    {advancedMode && <section className="deck-image-call-meter" aria-label="Image2 调用统计">
      <span><small>初次预计</small><b>{run.initialImageBudget || run.pageCount}</b></span>
      <span><small>已发起</small><b>{run.imageCallsStarted || 0}</b></span>
      <span><small>已完成</small><b>{run.imageCallsCompleted || 0}</b></span>
      <span><small>人工重生</small><b>{run.manualImageCalls || 0}</b></span>
      <span className={(run.automaticRedraws || 0) > 0 ? "warning" : "safe"}><small>自动重绘</small><b>{run.automaticRedraws || 0}</b></span>
    </section>}
    {["sources_queued", "source_processing", "queued", "planning", "confirmed"].includes(run.status) && <><DeckSourceSummary run={run}/><section className="deck-waiting inline"><LoaderCircle className="spin"/><h3>{["sources_queued", "source_processing"].includes(run.status) ? "正在读取并整理参考资料" : run.status === "confirmed" ? "方案已确认，正在安排页面生成" : "正在生成完整 PPT 方案"}</h3><p>{["sources_queued", "source_processing"].includes(run.status) ? "系统会保留文件名、页码、幻灯片号和工作表位置，再从可靠内容中组织方案。" : run.status === "confirmed" ? "页面预览将在这里逐张出现；确认之后仍可单页重新生成或要求贴近上一页。" : "快速版会自动组织页面结构、信息密度和视觉节奏；完成后仍由你确认，确认前不会生成图片。"}</p></section></>}
    {run.status === "plan_ready" && <><DeckSourceSummary run={run}/><section className="deck-plan-review inline deck-quick-plan"><article><span>快速版视觉方案</span><h3>{deckStylePacks.find(item => item.id === run.stylePack)?.label || run.stylePack}</h3><p>系统已自动整理内容结构与页面节奏。正文页允许标准或紧凑信息密度，避免只放几个空卡片；数字、日期和专名只采用已读取资料中的内容。</p><label className="deck-plan-style">调整风格<select value={nextStylePack} onChange={event => setNextStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></article><article><span>逐页方案</span><ol>{run.slides.map(slide => { const spec = parseDeckObject(slide.specJson); const density = String(spec.text_density || "medium"); const summary = String(spec.content_summary || ""); return <li key={slide.id}><b>{slide.title || `第 ${slide.slideIndex} 页`}</b><small>{slide.role || "content"} · {density === "high" ? "紧凑信息页" : density === "low" ? "少文字强视觉" : "标准信息页"}</small>{summary && <p>{summary}</p>}</li>; })}</ol></article></section></>}
    {["generating", "review_ready", "pdf_queued", "pdf_ready", "ppt_queued", "ppt_processing", "ppt_ready", "failed"].includes(run.status) && <section className="deck-slide-review inline"><div className="deck-progress"><b>{done}/{run.pageCount}</b><span>{statusText}</span></div><div className="deck-slide-grid">{run.slides.map(slide => {
      const canRegenerate = ["completed", "failed"].includes(slide.status);
      return <article key={slide.id}><header><b>{slide.title || `第 ${slide.slideIndex} 页`}</b><span>{slide.role || slide.status}</span></header><button className="deck-slide-preview" disabled={!slide.storedName} onClick={() => slide.storedName && onPreview({ url: `/api/employee/services/${service.id}/deck-generation/runs/${run.id}/slides/${slide.id}/image?v=${encodeURIComponent(slide.updatedAt)}`, title: slide.title || `第 ${slide.slideIndex} 页` })}>{slide.storedName ? <img src={`/api/employee/services/${service.id}/deck-generation/runs/${run.id}/slides/${slide.id}/image?v=${encodeURIComponent(slide.updatedAt)}`} alt={slide.title}/> : <><LoaderCircle className="spin"/><span>{slide.status}</span></>}</button>{slide.error && <p>{slide.error}</p>}<footer><button onClick={() => onRegenerate(slide.id, "reroll")} disabled={busy || !canRegenerate}>重新生成本页</button><button onClick={() => onRegenerate(slide.id, "closer_previous")} disabled={busy || !canRegenerate || slide.slideIndex === 1}>更贴近上一页</button></footer></article>;
    })}</div></section>}
  </section>;
}
