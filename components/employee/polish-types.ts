/**
 * 美化 PPT 的共享数据类型
 *
 * 职责：定义一次美化任务的完整结构，供表单、运行面板和主界面共用。
 * 谁可以改：与 `components/employee/polish-*` 一起维护。
 * 依赖：无（纯类型）。
 * 被谁用：`components/employee/polish-ppt-planner.tsx`、`components/employee-app.tsx`。
 * 验证方式：`npm run verify`。
 */

export type LocalDesignReference = { id: string; file: File; previewUrl: string; source: "upload" | "ppt" };
export type PolishPageNote = { id: string; pages: string; note: string };
export type PolishPromptClip = { id: string; name: string; prompt: string; color: "blue" | "green" | "gold" | "rose"; createdAt: string; updatedAt: string };
export type PptPolishSlide = { slideIndex: number; title: string; originalText: string; note: string; status: string; storedName?: string; prompt?: string; lastInstruction?: string; error?: string; updatedAt: string };
export type PolishSourceSnapshot = { pageCount: number; pages: { pageIndex: number; storedName: string; width: number; height: number; format: string }[]; createdAt: string; manifest: string };
export type PptPolishRun = {
  id: string; status: string; sourceMode: "current" | "upload"; sourceName: string; note: string;
  options: Record<string, boolean>; pageNotes: PolishPageNote[]; pageCount: number; slides: PptPolishSlide[];
  sourceSnapshot?: PolishSourceSnapshot;
  pdfStoredName?: string; pptStoredName?: string; coverStoredName?: string; confirmedAt?: string; error?: string; createdAt: string; updatedAt: string;
};
