/**
 * 生成图片与素材图的地址工具（主干层）
 *
 * 职责：集中拼装 `/api/employee/generated-images/*` 这类图片地址，
 *       供图片预览弹窗、素材栏、PPT 粘贴托盘和拖拽逻辑共用。
 * 谁可以改：主干层；改完必须跑 `npm run verify`。
 * 依赖：无。
 * 被谁用：`components/employee-app.tsx`、`components/employee/image-preview-modal.tsx`
 *         以及后续从员工工作台拆出的模块。
 * 验证方式：`npm run verify`。
 */

export function generatedImageUrl(id: string) {
  return "/api/employee/generated-images/" + id;
}

export function generatedImageDownloadUrl(id: string) {
  return "/api/employee/generated-images/" + id + "?download=1";
}

/** 拖入 PPT、复制到剪贴板时需要绝对地址；服务端渲染阶段退回相对地址。 */
export function absoluteGeneratedImageUrl(id: string) {
  if (typeof window === "undefined") return generatedImageUrl(id);
  return new URL(generatedImageUrl(id), window.location.origin).toString();
}
