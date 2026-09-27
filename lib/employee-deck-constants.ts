/**
 * 生成 PPT 的配色风格与统一元素常量（主干层）
 *
 * 职责：向界面导出风格包清单、高级版版式语言清单和"统一元素"默认勾选项。
 * 谁可以改：主干层；改完必须跑 `npm run verify`。
 * 依赖：`lib/employee-deck-packs.mjs`（**全项目唯一真源**）。
 * 被谁用：`components/employee-app.tsx`、`components/employee/deck-generation-form.tsx`、
 *         `components/employee/deck-run-panels.tsx`、`components/employee/polish-ppt-planner.tsx`、
 *         `components/employee/polish-inline-run.tsx`、`app/api/employee/services/[id]/**` 的 4 个接口路由。
 * 验证方式：`npm run verify`（含 `scripts/check-style-packs.mjs` 的一致性校验）。
 *
 * ⚠️ 2026-09-26 起，风格包清单不再在本文件里定义，改为从 `employee-deck-packs.mjs` 重新导出。
 * 原因：同一份 id 列表曾在 8 处重复（本文件 2 份、4 个接口路由各 1 份、两个 worker 各 1 份），
 * 改一处漏一处就会出现"界面能选、后台认不出"。
 * 现在只有 `lib/employee-deck-packs.mjs` 一个来源，Markdown 定义由检查脚本保证同步。
 */

import {
  DECK_DEFAULT_LAYOUT_LABEL,
  DECK_DEFAULT_STYLE_PACK_ID,
  DECK_LAYOUT_PACKS,
  DECK_STYLE_PACKS,
  DECK_STYLE_PACK_IDS
} from "./employee-deck-packs.mjs";

/** 内置配色模式可选的风格包（id + 界面显示名） */
export const deckStylePacks = DECK_STYLE_PACKS;

/** 参考图配色模式可选的"版式语言"（只描述信息组织方式，不含配色） */
export const deckAdvancedLayoutPacks = DECK_LAYOUT_PACKS;

/** 合法风格包 id 集合，接口层做参数校验用 */
export const deckStylePackIds = new Set(DECK_STYLE_PACK_IDS);

/** 默认风格包 id。表单初始值与接口缺省值都用它，不要再写死 "blue-gold-tech"。 */
export const deckDefaultStylePackId = DECK_DEFAULT_STYLE_PACK_ID;

/** 默认版式语言中文名。参考图配色模式找不到对应条目时的兜底文案。 */
export const deckDefaultLayoutLabel = DECK_DEFAULT_LAYOUT_LABEL;

/**
 * "统一元素"默认勾选项。
 * 卡片样式与装饰元素默认不勾选，避免用户无感触发过度约束。
 */
export const defaultDeckUnityOptions = {
  mainColor: true,
  headerFooter: true,
  backgroundTexture: true,
  cardStyle: false,
  decorativeElements: false
};
