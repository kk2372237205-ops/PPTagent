"use client";
/* eslint-disable @next/next/no-img-element */

import { Check, ImagePlus, LoaderCircle, Paperclip, Pencil, Plus, Save, Sparkles, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { employeeApi } from "@/lib/employee-api";
import { generatedImageUrl } from "@/lib/employee-image-urls";
import type { MaterialItem, Service } from "@/lib/employee-api-types";
import type { LocalDesignReference, PolishPromptClip } from "./polish-types";

type ImageMode = "text" | "mixed";

type Props = {
  service: Service;
  mode: ImageMode;
  onModeChange: (mode: ImageMode) => void;
  busy: boolean;
  selectedMaterialItems: MaterialItem[];
  localReferences: LocalDesignReference[];
  selectedCount: number;
  onAddFiles: (files: File[]) => void;
  onRemoveMaterial: (imageId: string) => void;
  onRemoveLocal: (id: string) => void;
  onSubmit: (brief: string, batchCount: number) => void;
  notify: (message: string) => void;
};

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text.trim()) return { error: `服务暂时没有返回内容（HTTP ${response.status}）` };
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { error: `服务返回了无法识别的内容（HTTP ${response.status}）` }; }
}

/**
 * 生图表单只负责“用户输入 + 明确套用的夹子”。
 * 文生图不渲染、也不能提交参考图；混合模式的多张图片才会进入图片编辑请求。
 * 夹子复用美化 PPT 的员工级接口，因此两处看到、编辑的是同一组数据。
 */
export function ImageGenerationForm({
  service, mode, onModeChange, busy, selectedMaterialItems,
  localReferences, selectedCount, onAddFiles, onRemoveMaterial, onRemoveLocal,
  onSubmit, notify
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [brief, setBrief] = useState("");
  const [batchCount, setBatchCount] = useState(1);
  const [clips, setClips] = useState<PolishPromptClip[]>([]);
  const [appliedClipIds, setAppliedClipIds] = useState<string[]>([]);
  const [clipOpen, setClipOpen] = useState(false);
  const [clipEditorOpen, setClipEditorOpen] = useState(false);
  const [editingClipId, setEditingClipId] = useState<string | null>(null);
  const [clipName, setClipName] = useState("");
  const [clipPrompt, setClipPrompt] = useState("");
  const [clipColor, setClipColor] = useState<PolishPromptClip["color"]>("blue");
  const [clipSaving, setClipSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      const response = await employeeApi.polish.clips.list(service.id);
      const result = await responseJson(response);
      if (!live) return;
      if (!response.ok) return notify(String(result.error || "夹子暂时无法读取"));
      setClips((result.clips || []) as PolishPromptClip[]);
    })();
    return () => { live = false; };
  }, [notify, service.id]);

  const appliedClips = appliedClipIds
    .map(id => clips.find(clip => clip.id === id))
    .filter((clip): clip is PolishPromptClip => Boolean(clip));
  const effectiveBrief = [brief.trim(), ...appliedClips.map(clip => clip.prompt.trim())].filter(Boolean).join("\n\n");

  function applyClip(clipId: string) {
    setAppliedClipIds(current => current.includes(clipId) ? current : [...current, clipId]);
    setClipOpen(false);
  }

  function removeClip(clipId: string) {
    setAppliedClipIds(current => current.filter(id => id !== clipId));
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
      const response = await employeeApi.polish.clips.save(service.id, {
        id: editingClipId || undefined,
        name: clipName,
        prompt: clipPrompt,
        color: clipColor
      });
      const result = await responseJson(response);
      if (!response.ok) return notify(String(result.error || "夹子保存失败"));
      setClips((result.clips || []) as PolishPromptClip[]);
      setClipEditorOpen(false);
      setEditingClipId(null);
    } finally {
      setClipSaving(false);
    }
  }

  function submit() {
    if (!effectiveBrief) return notify("请写下生成要求，或至少套用一个夹子");
    if (effectiveBrief.length > 3000) return notify("手写要求和夹子合计不能超过 3000 字");
    if (mode === "mixed" && !selectedCount) return notify("混合模式至少需要一张参考图");
    onSubmit(effectiveBrief, batchCount);
  }

  return <section className="deck-generation-form image-generation-form">
    <div className="design-mode" aria-label="生图模式">
      <button type="button" className={mode === "text" ? "active" : ""} onClick={() => onModeChange("text")}>
        <Sparkles/><span>文生图模式<small>只把文字要求提交给图片模型</small></span>
      </button>
      <button type="button" className={mode === "mixed" ? "active" : ""} onClick={() => onModeChange("mixed")}>
        <ImagePlus/><span>混合模式<small>可选多张图片与文字要求一起生成</small></span>
      </button>
    </div>
    <label>生成要求<textarea value={brief} onChange={event => setBrief(event.target.value)} placeholder="例如：将这一页做成深蓝科技发布会风格，突出列车底盘巡检机器人，保留未来感与大片留白…"/></label>
    {appliedClips.length > 0 && <div className="image-applied-clip-list" aria-label="已套用夹子">
      <span>已套用夹子</span>
      {appliedClips.map(clip => <button key={clip.id} type="button" className={`image-applied-clip-chip color-${clip.color}`} onClick={() => removeClip(clip.id)} title={`取消使用夹子：${clip.name}`}><i>{clip.name}</i><X/></button>)}
    </div>}
    <div className={`image-clip-island ${clipOpen ? "is-open" : ""}`}>
      <button type="button" className="image-clip-island-trigger" onClick={() => { setClipOpen(value => !value); setClipEditorOpen(false); }}><Paperclip/><b>夹子</b><span>{clips.length ? `${clips.length} 个可用` : "新建可复用提示词"}</span></button>
      {clipOpen && <div className="image-clip-island-content">
        <div className="image-clip-rail">
          {clips.map(clip => <div key={clip.id} className={`image-clip color-${clip.color} ${appliedClipIds.includes(clip.id) ? "is-applied" : ""}`}>
            <button type="button" disabled={appliedClipIds.includes(clip.id)} onClick={() => applyClip(clip.id)} title={appliedClipIds.includes(clip.id) ? "已套用此夹子" : "套用此夹子"}><span>{clip.name}</span>{appliedClipIds.includes(clip.id) && <Check/>}</button>
            {appliedClipIds.includes(clip.id)
              ? <button type="button" aria-label={`取消使用夹子 ${clip.name}`} onClick={() => removeClip(clip.id)}><X/></button>
              : <button type="button" aria-label={`编辑夹子 ${clip.name}`} onClick={() => editClip(clip)}><Pencil/></button>}
          </div>)}
          <button type="button" className="image-clip-new" onClick={startNewClip}><Plus/>新建夹子</button>
        </div>
        {clipEditorOpen && <section className="image-clip-editor">
          <header><b>{editingClipId ? "编辑夹子" : "新建夹子"}</b><button type="button" onClick={() => setClipEditorOpen(false)}>收起</button></header>
          <input value={clipName} maxLength={40} onChange={event => setClipName(event.target.value)} placeholder="夹子名称，例如：统一页脚"/>
          <textarea value={clipPrompt} onChange={event => setClipPrompt(event.target.value)} placeholder="夹子提示词：这是员工明确保存、套用到生图要求的内容。"/>
          <div><span>夹子颜色</span>{(["blue", "green", "gold", "rose"] as const).map(color => <button key={color} type="button" className={`color-${color} ${clipColor === color ? "selected" : ""}`} onClick={() => setClipColor(color)}>{({ blue: "蓝", green: "绿", gold: "金", rose: "红" })[color]}</button>)}<button type="button" className="image-clip-save" disabled={clipSaving || !clipName.trim() || !clipPrompt.trim()} onClick={() => void saveClip()}><Save/>{clipSaving ? "保存中" : "保存夹子"}</button></div>
        </section>}
      </div>}
    </div>
    {mode === "mixed" && <>
      <input ref={fileRef} hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => { onAddFiles(Array.from(event.target.files || [])); event.currentTarget.value = ""; }}/>
      {selectedCount > 0 && <div className="design-reference-strip image-reference-strip">
        {selectedMaterialItems.map(item => <div className="image-reference-item" key={item.id}><img src={generatedImageUrl(item.image.id)} alt="素材库参考图"/><button type="button" onClick={() => onRemoveMaterial(item.image.id)} aria-label="移除这张参考图"><X/></button></div>)}
        {localReferences.map(item => <div className="image-reference-item" key={item.id}><img src={item.previewUrl} alt={item.file.name}/><button type="button" onClick={() => onRemoveLocal(item.id)} aria-label={`移除参考图 ${item.file.name}`}><X/></button></div>)}
      </div>}
      <div className="image-reference-actions"><button type="button" onClick={() => fileRef.current?.click()} disabled={selectedCount >= 6}><Upload/>添加参考图<span>{selectedCount}/6</span></button><small>可一次选择多张 PNG、JPEG 或 WebP 图片</small></div>
    </>}
    <div className="design-mentor-actions">
      <label>生成<select value={batchCount} onChange={event => setBatchCount(Number(event.target.value))}>{[1, 2, 3, 4].map(count => <option key={count} value={count}>{count} 份</option>)}</select></label>
      <button type="button" className="design-start-inline" onClick={submit} disabled={busy || !effectiveBrief}>{busy ? <LoaderCircle className="spin"/> : <Sparkles/>}开始生成</button>
    </div>
  </section>;
}
