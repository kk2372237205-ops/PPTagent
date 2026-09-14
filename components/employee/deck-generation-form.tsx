/* eslint-disable @next/next/no-img-element */
/**
 * 生成 PPT 的创建表单（可复用 UI 组件）
 *
 * 职责：一次生成任务的填写入口——快速版/高级版切换、项目名称与用途、页数、
 *       项目简介、高级版逐页大纲、内容资料拖拽上传、配色主题（内置或参考图）
 *       和"统一元素"勾选。提交后由后台执行脚本读取资料并整理方案。
 * 谁可以改：本组件单独维护；改动不要顺手改生成 PPT 的方案确认与生图链路。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-api-types`、`@/lib/employee-deck-constants`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的小 W 智能模式。
 * 验证方式：`npm run verify`。
 *
 * 产品约束：卡片样式统一、装饰元素统一默认不勾选；参考配色图只控制颜色关系，不照抄版式。
 */

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { Check, FileText, ImagePlus, LoaderCircle, Sparkles, Upload, X } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import type { DeckGenerationRun, Service } from "@/lib/employee-api-types";
import { deckAdvancedLayoutPacks, deckStylePacks, defaultDeckUnityOptions } from "@/lib/employee-deck-constants";

function formatDeckFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DeckGenerationForm({ service, notify, onCreated }: {
  service: Service;
  notify: (text: string) => void;
  onCreated: (run: DeckGenerationRun) => void;
}) {
  const [generationMode, setGenerationMode] = useState<"quick" | "advanced">("quick");
  const [projectName, setProjectName] = useState(service.title);
  const [projectType, setProjectType] = useState("");
  const [pageCount, setPageCount] = useState(12);
  const [stylePack, setStylePack] = useState("blue-gold-tech");
  const [brief, setBrief] = useState("");
  const [referenceText, setReferenceText] = useState("");
  const [outlineText, setOutlineText] = useState("");
  const [outlineFile, setOutlineFile] = useState<File | null>(null);
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [paletteMode, setPaletteMode] = useState<"preset" | "reference">("preset");
  const [themeReference, setThemeReference] = useState<File | null>(null);
  const [themePreview, setThemePreview] = useState("");
  const [unityOptions, setUnityOptions] = useState({ ...defaultDeckUnityOptions });
  const [submitting, setSubmitting] = useState(false);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const outlineInputRef = useRef<HTMLInputElement>(null);
  const themeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (themePreview) URL.revokeObjectURL(themePreview); }, [themePreview]);

  function addSourceFiles(files: File[]) {
    const allowed = /\.(pdf|docx|xlsx|pptx|txt|md|csv|json|png|jpe?g|webp)$/i;
    const accepted = files.filter(file => allowed.test(file.name) && file.size <= 200 * 1024 * 1024);
    if (!accepted.length) return notify("请选择 PDF、DOCX、XLSX、PPTX、文本或常见图片，单个不超过 200MB");
    setSourceFiles(current => {
      const unique = new Map(current.map(file => [`${file.name}:${file.size}:${file.lastModified}`, file]));
      accepted.forEach(file => unique.set(`${file.name}:${file.size}:${file.lastModified}`, file));
      const next = Array.from(unique.values()).slice(0, 30);
      if (unique.size > 30) notify("一次最多读取 30 份参考资料");
      return next;
    });
  }

  function chooseTheme(file?: File) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 20 * 1024 * 1024) {
      return notify("配色参考图请使用不超过 20MB 的 PNG、JPEG 或 WebP");
    }
    if (themePreview) URL.revokeObjectURL(themePreview);
    setThemeReference(file);
    setThemePreview(URL.createObjectURL(file));
    setPaletteMode("reference");
  }

  async function submit() {
    if (!projectName.trim()) return notify("请填写项目名称");
    if (!brief.trim()) return notify("请填写项目简介");
    if (generationMode === "advanced" && !outlineText.trim() && !outlineFile) return notify("高级版请填写每页结构，或上传一份大纲文件");
    if (generationMode === "advanced" && sourceFiles.length === 0) return notify("高级版至少需要上传一份内容资料；大纲和配色参考图不算内容资料");
    if (paletteMode === "reference" && !themeReference) return notify("请上传一张配色参考图，或改用内置配色");
    const totalBytes = sourceFiles.reduce((total, file) => total + file.size, 0) + (outlineFile?.size || 0) + (themeReference?.size || 0);
    if (totalBytes > 500 * 1024 * 1024) return notify("本次全部资料合计不能超过 500MB");
    const form = new FormData();
    form.set("generationMode", generationMode);
    form.set("projectName", projectName.trim());
    form.set("projectType", projectType.trim());
    form.set("pageCount", String(pageCount));
    form.set("stylePack", stylePack);
    form.set("brief", brief.trim());
    form.set("referenceText", referenceText.trim());
    form.set("outlineText", outlineText.trim());
    form.set("paletteMode", paletteMode);
    form.set("unityOptions", JSON.stringify(unityOptions));
    sourceFiles.forEach(file => form.append("references", file));
    if (outlineFile) form.set("outlineFile", outlineFile);
    if (paletteMode === "reference" && themeReference) form.set("themeReference", themeReference);
    setSubmitting(true);
    try {
      const response = await employeeApi.deck.create(service.id, form);
      const result = await response.json();
      if (!response.ok) return notify(result.error || "生成 PPT 任务创建失败");
      onCreated(result.run as DeckGenerationRun);
      notify(generationMode === "advanced" ? "已开始读取资料，完成后只需确认一次整套方案" : "已开始读取资料并生成快速方案");
    } finally {
      setSubmitting(false);
    }
  }

  return <section className="deck-generation-form deck-create-form">
    <div className="deck-version-switch" role="tablist" aria-label="生成版本">
      <button type="button" className={generationMode === "quick" ? "active" : ""} onClick={() => setGenerationMode("quick")}>
        <Sparkles/><span><b>快速版</b><small>少填写，自动整理完整方案</small></span>
      </button>
      <button type="button" className={generationMode === "advanced" ? "active" : ""} onClick={() => setGenerationMode("advanced")}>
        <FileText/><span><b>高级版</b><small>按你的逐页结构，从大量资料取材</small></span>
      </button>
    </div>

    <div className="deck-create-grid">
      <label>项目名称<input value={projectName} onChange={event => setProjectName(event.target.value)}/></label>
      <label>汇报类型 / 用途<input value={projectType} onChange={event => setProjectType(event.target.value)} placeholder="例如：领导汇报 / 学校介绍 / 商业计划书"/></label>
    </div>
    {generationMode === "quick" ? <div className="deck-page-slider">
      <label>PPT 页数</label>
      <div><input type="range" min={2} max={30} value={pageCount} onChange={event => setPageCount(Number(event.target.value))} style={{ "--range-progress": `${((pageCount - 2) / 28) * 100}%` } as CSSProperties}/><b>{pageCount}页</b></div>
    </div> : <div className="deck-page-count-note"><FileText/><span><b>页数由你的结构决定</b><small>资料读取完成后，可以增加、删除和调整每一页</small></span></div>}
    <label>项目简介<textarea value={brief} onChange={event => setBrief(event.target.value)} placeholder="说明汇报背景、对象、目标和必须回答的问题。"/></label>

    {generationMode === "advanced" && <section className="deck-outline-input">
      <header><div><b>你决定 PPT 结构</b><span>可以只写每页大标题，也可以继续规定小标题和想讲的内容</span></div><button type="button" onClick={() => outlineInputRef.current?.click()}><Upload/>上传大纲</button></header>
      <textarea value={outlineText} onChange={event => setOutlineText(event.target.value)} placeholder={"示例：\n第1页 封面：项目名称与核心口号\n第2页 学校办学条件\n- 小标题：学校规模、教学资源、实训条件\n- 想讲：用资料里的最新数据说明优势\n第3页 科研平台……"}/>
      {outlineFile && <div className="deck-outline-file"><FileText/><span>{outlineFile.name}</span><button type="button" onClick={() => setOutlineFile(null)} aria-label="移除大纲文件"><X/></button></div>}
      <input ref={outlineInputRef} type="file" hidden accept=".pdf,.docx,.xlsx,.pptx,.txt,.md" onChange={event => setOutlineFile(event.target.files?.[0] || null)}/>
    </section>}

    <label>{generationMode === "advanced" ? "整套高优先级要求（可选）" : "补充要求（可选）"}<textarea value={referenceText} onChange={event => setReferenceText(event.target.value)} placeholder={generationMode === "quick" ? "可粘贴评审要求、重点信息和内容偏好；大量资料直接拖到下方。" : "可补充受众、禁用表达、必须强调的结论和整套视觉偏好；例如正文页优先图文相辅，不使用固定图片区。"}/></label>

    <section className="deck-source-section">
      <header><div><b>{generationMode === "advanced" ? "内容资料（高级版必填）" : "参考资料"}</b><span>{sourceFiles.length ? `已加入 ${sourceFiles.length} 份，系统会按页码和工作表保留来源` : "可一次拖入多份大资料，用户不用预先整理"}</span></div></header>
      <div className="deck-reference-drop deck-source-drop" onClick={() => sourceInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); addSourceFiles(Array.from(event.dataTransfer.files || [])); }}>
        <Upload/><b>把全部资料拖到这里</b><span>支持 PDF、Word、Excel、PPT、文本和图片；最多 30 份，合计 500MB</span>
      </div>
      <input ref={sourceInputRef} type="file" hidden multiple accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.json,.png,.jpg,.jpeg,.webp" onChange={event => addSourceFiles(Array.from(event.target.files || []))}/>
      {sourceFiles.length > 0 && <div className="deck-source-list">{sourceFiles.map((file, index) => <article key={`${file.name}:${file.lastModified}`}><FileText/><span><b>{file.name}</b><small>{formatDeckFileSize(file.size)}</small></span><button type="button" onClick={() => setSourceFiles(current => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`移除 ${file.name}`}><X/></button></article>)}</div>}
    </section>

    <section className="deck-palette-section">
      <header><b>配色主题</b><span>选内置配色，或让系统从参考图提取颜色关系</span></header>
      <div className="deck-palette-grid">
        <button type="button" className={paletteMode === "preset" ? "active" : ""} onClick={() => setPaletteMode("preset")}><Check/><span><b>内置配色</b><small>稳定、快速，适合没有参考图时</small></span></button>
        <button type="button" className={paletteMode === "reference" ? "active" : ""} onClick={() => setPaletteMode("reference")}><ImagePlus/><span><b>参考图配色</b><small>分析颜色，不照抄参考图版式</small></span></button>
      </div>
      {paletteMode === "preset" ? <label>风格包<select value={stylePack} onChange={event => setStylePack(event.target.value)}>{deckStylePacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label> : <>
        <div className="deck-theme-reference" onClick={() => themeInputRef.current?.click()} onDragOver={event => event.preventDefault()} onDrop={(event: DragEvent<HTMLDivElement>) => { event.preventDefault(); chooseTheme(event.dataTransfer.files?.[0]); }}>
          {themePreview ? <><img src={themePreview} alt="配色参考"/><div><b>{themeReference?.name}</b><span>将提取背景、文字、强调色及使用比例，并把原图直接交给 Image2</span></div></> : <><ImagePlus/><div><b>上传一张配色参考图</b><span>PNG、JPEG 或 WebP，不要求它是 PPT</span></div></>}
          <input ref={themeInputRef} type="file" hidden accept=".png,.jpg,.jpeg,.webp" onChange={event => chooseTheme(event.target.files?.[0])}/>
        </div>
        {generationMode === "advanced" && <label className="deck-layout-language">版式语言（不含配色）<select value={stylePack} onChange={event => setStylePack(event.target.value)}>{deckAdvancedLayoutPacks.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select><small>参考图决定全部颜色；这里选择信息组织、图文关系、留白和节奏，不是文字密度。</small></label>}
      </>}
    </section>

    <div className="deck-unity-options">
      <label><input type="checkbox" checked={unityOptions.mainColor} onChange={event => setUnityOptions(current => ({ ...current, mainColor: event.target.checked }))}/>主色统一</label>
      <label><input type="checkbox" checked={unityOptions.headerFooter} onChange={event => setUnityOptions(current => ({ ...current, headerFooter: event.target.checked }))}/>页眉页脚统一</label>
      <label><input type="checkbox" checked={unityOptions.backgroundTexture} onChange={event => setUnityOptions(current => ({ ...current, backgroundTexture: event.target.checked }))}/>背景质感统一</label>
      <label><input type="checkbox" checked={unityOptions.cardStyle} onChange={event => setUnityOptions(current => ({ ...current, cardStyle: event.target.checked }))}/>卡片样式统一</label>
      <label><input type="checkbox" checked={unityOptions.decorativeElements} onChange={event => setUnityOptions(current => ({ ...current, decorativeElements: event.target.checked }))}/>装饰元素统一</label>
    </div>
    <button type="button" className="deck-create-submit" onClick={() => void submit()} disabled={submitting}>{submitting ? <LoaderCircle className="spin"/> : <Sparkles/>}{generationMode === "advanced" ? "读取资料并整理大纲" : "生成快速方案"}</button>
  </section>;
}
