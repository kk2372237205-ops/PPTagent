/* eslint-disable @next/next/no-img-element */
/**
 * 图片炸开/重建结果的大图预览弹窗（可复用 UI 组件）
 *
 * 职责：把拆图重建预览或候选部件放大展示，点击遮罩关闭。
 * 谁可以改：本组件单独维护。
 * 依赖：`lucide-react`。
 * 被谁用：`components/employee-app.tsx` 的图片炸开与智能模式预览。
 * 验证方式：`npm run verify`。
 */

import { X } from "lucide-react";

export function ExplodeImagePreview({ image, onClose }: { image: { url: string; title: string }; onClose: () => void }) {
  return <div className="explode-preview-modal" onClick={onClose}><section onClick={event => event.stopPropagation()}><header><b>{image.title}</b><button onClick={onClose}><X/></button></header><img src={image.url} alt={image.title}/></section></div>;
}
