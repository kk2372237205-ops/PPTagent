/* eslint-disable @next/next/no-img-element */
/**
 * AI 图片放大预览弹窗（可复用 UI 组件）
 *
 * 职责：只做一件事——把一张生成图放大展示，并提供下载入口。
 * 谁可以改：本组件单独维护；改动不要顺手改其他工作台模块。
 * 依赖：`lucide-react` 图标、`@/lib/employee-image-urls`。
 * 被谁用：`components/employee-app.tsx` 的 AI 创作助手、素材栏、图片工具。
 * 验证方式：`npm run verify`；涉及样式时另跑 `node scripts/employee-visual-test.mjs`。
 */

import { Download, X } from "lucide-react";
import { generatedImageDownloadUrl, generatedImageUrl } from "@/lib/employee-image-urls";

export type ImagePreview = { id: string; prompt: string; owner: string; model?: string };

export function ImagePreviewModal({ image, onClose }: { image: ImagePreview; onClose: () => void }) {
  return <div className="image-preview-modal" onMouseDown={onClose}>
    <div className="image-preview-card" onMouseDown={event => event.stopPropagation()}>
      <header><div><b>{image.prompt || "AI 图片预览"}</b><span>{image.owner}{image.model ? " · " + image.model : ""}</span></div><button onClick={onClose}><X/></button></header>
      <img src={generatedImageUrl(image.id)} alt={image.prompt || "AI 图片"}/>
      <footer><a href={generatedImageDownloadUrl(image.id)} download><Download/>下载图片</a></footer>
    </div>
  </div>;
}
