/**
 * tools-ai 面板共用的极小工具函数
 *
 * 职责：只放被 AiPanel 与 ImageToolsPanel 同时需要、且不值得各自复制的函数。
 * 谁可以改：本模块单独维护。
 * 依赖：无。
 * 被谁用：`./ai-assistant-panel`、`./image-tools-panel`。
 * 验证方式：`npm run verify`。
 */

import type { MaterialItem } from "@/lib/employee-api-types";

export function nextMaterialOrder(items: MaterialItem[]) { return items.reduce((max, item) => Math.max(max, item.materialOrder || 0), 0) + 1; }
