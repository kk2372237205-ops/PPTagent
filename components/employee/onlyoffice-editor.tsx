/**
 * ONLYOFFICE 在线编辑器外壳（可复用 UI 组件）
 *
 * 职责：按工作表文稿编号拉取编辑器配置、动态加载 ONLYOFFICE 的 api.js、
 *       挂载编辑器实例，并支持把 PPT/PPTX 拖到画布上直接替换当前文稿。
 * 谁可以改：本组件单独维护；改动不要顺手改智能模式或素材栏。
 * 依赖：`@/lib/employee-api`、`@/lib/upload-limits`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的订单工作台。
 * 验证方式：`npm run verify`；真实编辑需要本机 Docker 里的 ONLYOFFICE 服务。
 *
 * 注意：编辑器内部白色画布和原生工具栏不做深色化，只有外壳跟随工作台主题。
 */

import { useEffect, useRef, useState } from "react";
import { LoaderCircle, Monitor, Upload } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { workPresentationMaxBytes, workPresentationMaxLabel } from "@/lib/upload-limits";

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor?: () => void } };
  }
}

export function OnlyOfficeEditor({ documentId, revision, refresh, notify }: {
  documentId: string;
  revision: number;
  refresh: (silent?: boolean) => Promise<void>;
  notify: (text: string) => void;
}) {
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const editorRef = useRef<{ destroyEditor?: () => void } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hostId = "onlyoffice-" + documentId + "-" + revision;

  async function loadPresentation(file: File) {
    if (!/\.(ppt|pptx)$/i.test(file.name)) return notify("请拖入 PPT 或 PPTX 文件");
    if (file.size > workPresentationMaxBytes) return notify(`PPT 文件不能超过 ${workPresentationMaxLabel}`);
    const form = new FormData();
    form.set("file", file);
    setUploading(true);
    const response = await employeeApi.documents.replace(documentId, form);
    const result = await response.json();
    setUploading(false);
    if (!response.ok) return notify(result.error);
    setError("");
    editorRef.current?.destroyEditor?.();
    await refresh(true);
    setReloadKey(value => value + 1);
    notify("已载入 " + file.name);
  }

  function presentationFileFrom(dataTransfer: DataTransfer) {
    return Array.from(dataTransfer.files).find(item => /\.(ppt|pptx)$/i.test(item.name)) || null;
  }

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const response = await employeeApi.documents.config(documentId);
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        let script = document.querySelector<HTMLScriptElement>('script[data-onlyoffice="' + result.scriptUrl + '"]');
        if (!script) {
          script = document.createElement("script");
          script.src = result.scriptUrl;
          script.dataset.onlyoffice = result.scriptUrl;
          document.body.appendChild(script);
          await new Promise<void>((resolve, reject) => { script!.onload = () => resolve(); script!.onerror = () => reject(new Error("无法连接 ONLYOFFICE 文档服务器")); });
        } else if (!window.DocsAPI) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        if (!cancelled && window.DocsAPI) editorRef.current = new window.DocsAPI.DocEditor(hostId, result.config);
        else if (!window.DocsAPI) throw new Error("ONLYOFFICE 尚未启动，请先运行文档服务");
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "编辑器加载失败");
      }
    }
    void start();
    return () => { cancelled = true; editorRef.current?.destroyEditor?.(); };
  }, [documentId, hostId, reloadKey]);

  return <div className={"onlyoffice-host " + (dragging ? "is-dragging" : "")}
    onDragEnter={event => {
      if (!presentationFileFrom(event.dataTransfer)) return setDragging(false);
      event.preventDefault();
      setDragging(true);
    }}
    onDragOver={event => {
      if (!presentationFileFrom(event.dataTransfer)) return setDragging(false);
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setDragging(true);
    }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => {
      const pptFile = presentationFileFrom(event.dataTransfer);
      if (pptFile) void loadPresentation(pptFile);
      if (pptFile) event.preventDefault();
      setDragging(false);
    }}>
    <input ref={fileRef} hidden type="file" accept=".ppt,.pptx" onChange={event => { const file = event.target.files?.[0]; if (file) void loadPresentation(file); event.currentTarget.value = ""; }}/>
    <div className="office-file-entry"><button onClick={() => fileRef.current?.click()} disabled={uploading}><Upload/>{uploading ? "正在载入..." : "选择 PPT 文件"}</button><span>也可将 PPT / PPTX 直接拖到画布</span></div>
    {error ? <div className="office-placeholder"><Monitor/><h3>编辑器暂未连接</h3><p>{error}</p><button className="office-placeholder-upload" onClick={() => fileRef.current?.click()}><Upload/>先选择一份 PPT</button><small>启动 ONLYOFFICE Docker 服务后即可在线修改。</small></div> : <div id={hostId}/>}
    {dragging && <div className="office-drop-overlay"><Upload/><h3>松开即可载入 PPT</h3><p>支持 .ppt 和 .pptx，最大 {workPresentationMaxLabel}</p></div>}
    {uploading && <div className="office-uploading-overlay"><LoaderCircle className="spin"/><span>正在载入演示文稿...</span></div>}
  </div>;
}
