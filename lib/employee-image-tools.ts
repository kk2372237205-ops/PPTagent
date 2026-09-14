/**
 * 纯图片转换与剪贴板工具（主干层）
 *
 * 职责：blob / dataURL / PNG / canvas 之间的转换，以及把图片写进剪贴板。
 *       全部是无状态纯函数（只依赖浏览器 API），不含任何业务判断。
 * 谁可以改：主干层；改完必须跑 `npm run verify`。
 * 依赖：浏览器 API（canvas、FileReader、Clipboard API）。
 * 被谁用：员工工作台的 PPT 粘贴托盘、图片工具、素材栏，以及后续拆出的模块。
 * 验证方式：`npm run verify`；剪贴板与画布行为需在浏览器里人工确认。
 */

/** 把任意图片 blob 统一转成 PNG blob（必要时经 canvas 重新编码） */
export async function blobToPngBlob(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = document.createElement("img");
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("图片读取失败，请换一张图片再试"));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("图片转换失败，请换一张图片再试");
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("图片转换失败，请换一张图片再试")), "image/png");
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function blobToDataUrl(blob: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("图片读取失败，请使用下载兜底。"));
    reader.readAsDataURL(blob);
  });
}

/** dataURL 还原成 blob（用于把预览图重新上传或写回 PPT） */
export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

/** PPT 提取图片时的四边裁剪比例，与接口返回的 crop 字段一致 */
export type ImageCropBox = { left: number; top: number; right: number; bottom: number };

/** 按比例裁剪 dataURL 图片，返回新的 PNG dataURL */
export async function cropDataUrlToPngDataUrl(dataUrl: string, crop: ImageCropBox) {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = document.createElement("img");
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("PPT 图片预览失败"));
    element.src = dataUrl;
  });
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const x = Math.round(sourceWidth * crop.left);
  const y = Math.round(sourceHeight * crop.top);
  const width = Math.max(1, Math.round(sourceWidth * (1 - crop.left - crop.right)));
  const height = Math.max(1, Math.round(sourceHeight * (1 - crop.top - crop.bottom)));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("PPT 图片裁剪失败");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);
  return canvas.toDataURL("image/png");
}

/** 兼容复制：部分浏览器不允许写二进制图片到剪贴板，改用选中富文本 HTML 再 copy */
export function copyImageHtmlFallback(dataUrl: string) {
  const container = document.createElement("div");
  container.contentEditable = "true";
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "1px";
  container.style.height = "1px";
  container.style.overflow = "hidden";
  container.innerHTML = `<img src="${dataUrl}" alt="WZLCF material image">`;
  document.body.appendChild(container);
  const selection = window.getSelection();
  const previousRanges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  try {
    const range = document.createRange();
    range.selectNodeContents(container);
    selection?.removeAllRanges();
    selection?.addRange(range);
    if (!document.execCommand("copy")) throw new Error("兼容复制失败，请使用下载兜底。");
  } finally {
    selection?.removeAllRanges();
    previousRanges.forEach(range => selection?.addRange(range));
    container.remove();
  }
}

/** 优先用剪贴板 API 写 PNG，失败时退回 HTML 复制；返回实际使用的方式 */
export async function copyPngBlobToClipboard(blob: Blob, dataUrl: string) {
  const html = `<img src="${dataUrl}" alt="WZLCF material image">`;
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({
        "image/png": blob,
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob(["WZLCF material image"], { type: "text/plain" })
      })]);
      return "native";
    } catch {
      // Some browser contexts reject binary image writes; HTML data-URL copy is the fallback.
    }
  }
  copyImageHtmlFallback(dataUrl);
  return "html";
}
