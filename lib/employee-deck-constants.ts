/**
 * 生成 PPT 的配色风格与统一元素常量（主干层）
 *
 * 职责：集中定义风格包清单、高级版版式语言清单和"统一元素"默认勾选项。
 * 谁可以改：主干层；改完必须跑 `npm run verify`。
 * 依赖：无。
 * 被谁用：`components/employee-app.tsx`、`components/employee/deck-generation-form.tsx` 等。
 * 验证方式：`npm run verify`。
 *
 * ⚠️ 同步要求：这些 id 必须和 `scripts/deck-generation-worker.mjs` 里的
 * `stylePackName()` / `advancedLayoutName()` 白名单保持一致，否则后台会认不出风格包。
 * 新增或改名风格包时，两处必须同时改。
 */

export const deckStylePacks = [
  { id: "blue-gold-tech", label: "蓝金科技" },
  { id: "white-green-tech", label: "白绿科技" },
  { id: "black-gold-business", label: "黑金商务" },
  { id: "blue-purple-ai", label: "蓝紫 AI" },
  { id: "red-white-government", label: "红白政企" },
  { id: "minimal-academic", label: "极简学术" },
  { id: "vivid-roadshow", label: "活力路演" }
];

/** 高级版可用"版式语言"（只描述信息组织方式，不含配色） */
export const deckAdvancedLayoutPacks = [
  { id: "blue-gold-tech", label: "图文叙事版式（推荐）" },
  { id: "white-green-tech", label: "清晰技术说明版式" },
  { id: "black-gold-business", label: "结论先行商务版式" },
  { id: "blue-purple-ai", label: "系统关系图解版式" },
  { id: "red-white-government", label: "庄重层级汇报版式" },
  { id: "minimal-academic", label: "极简学术论证版式" },
  { id: "vivid-roadshow", label: "活力路演叙事版式" }
];

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
