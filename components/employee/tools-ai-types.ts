/**
 * AI 助手与图片工具的共享类型
 *
 * 职责：定义图片工具面板内部的来源、图片转 PPT 结果与 PPT 提取图片结构。
 * 谁可以改：与 `components/employee/tools-ai-panels.tsx` 一起维护。
 * 依赖：无（纯类型）。
 * 被谁用：`components/employee/tools-ai-panels.tsx`。
 * 验证方式：`npm run verify`。
 */

export type ImageToolSource = { imageId?: string; file?: File; previewUrl: string; name: string; ownedUrl: boolean };
export type ImageToPptResult = { fileName: string; downloadUrl: string; codiaTaskId?: string; sourceName?: string };
export type PptExtractedImage = {
  id: string;
  slideNumber: number;
  name: string;
  extension: string;
  contentType: string;
  dataUrl: string;
  croppedDataUrl: string;
  crop: { left: number; top: number; right: number; bottom: number };
};
