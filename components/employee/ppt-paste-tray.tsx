/* eslint-disable @next/next/no-img-element */
/**
 * PPT 粘贴托盘（可复用 UI 组件）
 *
 * 职责：把一张图片准备好并放进系统剪贴板，员工在 ONLYOFFICE 当前页按 Ctrl+V 即可插图，
 *       避免"先下载再上传"的来回操作。拖入 AI 图片、素材图或本地图片都能用。
 * 谁可以改：本组件单独维护；改动不要顺手改素材栏或智能模式。
 * 依赖：`@/lib/employee-api`、`@/lib/employee-image-tools`、`@/lib/employee-image-urls`、`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的素材栏（MaterialRail 底部）。
 * 验证方式：`npm run verify`；剪贴板行为需在浏览器里拖一张图片人工确认。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { DragEvent } from "react";
import { Clipboard, Download, Trash2 } from "lucide-react";
import { employeeApi } from "@/lib/employee-api";
import { blobToDataUrl, blobToPngBlob, copyPngBlobToClipboard, imageFilesFromList, readImageDragId } from "@/lib/employee-image-tools";

type PasteTrayItem = { name: string; previewUrl: string; dataUrl: string; pngBlob: Blob };

export function PptPasteTray({ notify }: { notify: (text: string) => void }) {
  const [item, setItem] = useState<PasteTrayItem | null>(null);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error" | "busy"; text: string }>({
    kind: "idle",
    text: "拖入一张图片，复制后在 PPT 当前页粘贴。"
  });
  const [dragging, setDragging] = useState(false);
  const itemRef = useRef<PasteTrayItem | null>(null);

  const replaceItem = useCallback((next: PasteTrayItem | null) => {
    setItem(current => {
      if (current) URL.revokeObjectURL(current.previewUrl);
      itemRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => () => {
    if (itemRef.current) URL.revokeObjectURL(itemRef.current.previewUrl);
  }, []);

  async function trayItemFromBlob(blob: Blob, name: string) {
    const pngBlob = await blobToPngBlob(blob);
    const dataUrl = await blobToDataUrl(pngBlob);
    return {
      name: name.replace(/\.[a-z0-9]+$/i, "") + ".png",
      previewUrl: URL.createObjectURL(pngBlob),
      dataUrl,
      pngBlob
    };
  }

  async function copyItem(next: PasteTrayItem) {
    const mode = await copyPngBlobToClipboard(next.pngBlob, next.dataUrl);
    setStatus({ kind: "ok", text: mode === "native" ? "已复制，点击 PPT 当前页后按 Ctrl+V。" : "已用兼容模式复制，点击 PPT 当前页后按 Ctrl+V。" });
    notify("图片已复制到剪贴板");
  }

  async function acceptBlob(blob: Blob, name: string) {
    setStatus({ kind: "busy", text: "正在准备剪贴板图片..." });
    const next = await trayItemFromBlob(blob, name);
    replaceItem(next);
    try {
      await copyItem(next);
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "自动复制失败，请点重新复制。" });
    }
  }

  async function acceptGeneratedImage(imageId: string) {
    const response = await employeeApi.images.file(imageId);
    if (!response.ok) throw new Error("素材图片读取失败，请刷新后重试。");
    await acceptBlob(await response.blob(), "wzlcf-material-" + imageId);
  }

  async function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const localImage = imageFilesFromList(event.dataTransfer.files)[0];
    const imageId = readImageDragId(event.dataTransfer);
    try {
      if (localImage) return await acceptBlob(localImage, localImage.name || "wzlcf-local-image.png");
      if (imageId) return await acceptGeneratedImage(imageId);
      setStatus({ kind: "error", text: "请拖入 AI 图片、素材图片或本地图片文件。" });
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "图片复制失败，请稍后重试。" });
    }
  }

  async function recopy() {
    if (!item) return;
    setStatus({ kind: "busy", text: "正在重新复制..." });
    try {
      await copyItem(item);
    } catch (reason) {
      setStatus({ kind: "error", text: reason instanceof Error ? reason.message : "重新复制失败，请使用下载兜底。" });
    }
  }

  function clear() {
    replaceItem(null);
    setStatus({ kind: "idle", text: "拖入一张图片，复制后在 PPT 当前页粘贴。" });
  }

  return <aside className={"ppt-paste-tray " + (dragging ? "is-dragging" : "")}
    onDragEnter={event => { event.preventDefault(); setDragging(true); }}
    onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }}
    onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={event => { void handleDrop(event); }}>
    <div className="ppt-paste-preview">{item ? <img src={item.previewUrl} alt="PPT 粘贴托盘图片"/> : <Clipboard/>}</div>
    <div className="ppt-paste-body">
      <header><b>PPT 粘贴托盘</b><span>无刷新插图</span></header>
      <p className={status.kind}>{status.text}</p>
      <div>
        <button onClick={recopy} disabled={!item || status.kind === "busy"}><Clipboard/>重新复制</button>
        {item ? <a href={item.previewUrl} download={item.name}><Download/>下载兜底</a> : <button disabled><Download/>下载兜底</button>}
        <button onClick={clear} disabled={!item}><Trash2/>清空</button>
      </div>
    </div>
  </aside>;
}
