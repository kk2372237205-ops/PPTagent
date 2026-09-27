/**
 * 风格包清单 —— 全项目唯一真源
 *
 * ## 为什么单独做成 .mjs
 *
 * 这份清单同时被三类消费者使用，而它们的模块系统不同：
 *   1. 员工端界面（`.tsx` / `.ts`）—— 需要 `label` 渲染下拉框；
 *   2. 服务端接口（`app/api/**`）—— 需要 id 白名单做参数校验；
 *   3. 后台执行脚本（`scripts/workers/**`，纯 `.mjs`）—— 需要把 id 翻成中文名拼进提示词。
 *
 * `.mjs` 是唯一能同时被 TypeScript 与 Node 直接引用的格式，所以清单放在这里，
 * `lib/employee-deck-constants.ts` 只做重新导出。
 *
 * ## 改动规则（2026-09-27 起）
 *
 * 新增/删除/改名风格包，只需改 **两处**：
 *   - 本文件
 *   - `skills/deck-generation/style-packs.md`（同名 `## <id>：<中文名>` 段落）
 *
 * 如果是"版式语言"（参考图配色模式用），还要同步
 * `skills/deck-generation/advanced-layout-profiles.md` 的同名段落。
 *
 * `npm run verify` 会跑 `scripts/check-style-packs.mjs` 校验三处一致，不一致直接失败。
 *
 * ## 2026-09-27 精简
 *
 * 由 7 个减到 4 个：删掉了 `blue-purple-ai`（蓝紫 AI）、`red-white-government`（红白政企）、
 * `vivid-roadshow`（活力路演）——数据库里 24 个历史任务对这三个的使用次数均为 0。
 * 保留的 4 个都有真实使用记录。
 */

/** 内置配色模式：风格包同时规定配色与版式 */
export const DECK_STYLE_PACKS = [
  { id: "blue-gold-tech", label: "蓝金科技" },
  { id: "white-green-tech", label: "白绿科技" },
  { id: "black-gold-business", label: "黑金商务" },
  { id: "minimal-academic", label: "极简学术" }
];

/**
 * 参考图配色模式的"版式语言"：只规定信息组织、图文关系、留白和节奏，不含颜色。
 * id 与风格包共用同一套键，但中文名不同（这是历史兼容键，不要改 id）。
 *
 * `label` 是界面显示名，`promptLabel` 是**写进提示词**的名字——两者必须分开：
 * 界面上"（推荐）"是给员工看的，喂给模型就是噪音。
 */
export const DECK_LAYOUT_PACKS = [
  { id: "blue-gold-tech", label: "图文叙事版式（推荐）", promptLabel: "图文叙事版式" },
  { id: "white-green-tech", label: "清晰技术说明版式", promptLabel: "清晰技术说明版式" },
  { id: "black-gold-business", label: "结论先行商务版式", promptLabel: "结论先行商务版式" },
  { id: "minimal-academic", label: "极简学术论证版式", promptLabel: "极简学术论证版式" }
];

/** 合法 id 集合，供接口做参数校验 */
export const DECK_STYLE_PACK_IDS = DECK_STYLE_PACKS.map(item => item.id);

/**
 * 默认风格包。界面初始值、接口缺省值都取这一处，
 * 不要再写 `|| "blue-gold-tech"` 这种字面量——那正是过去 8 处副本的来源。
 */
export const DECK_DEFAULT_STYLE_PACK_ID = DECK_STYLE_PACKS[0].id;

/** 默认风格包的中文名（后台执行脚本兜底文案用） */
export const DECK_DEFAULT_STYLE_PACK_LABEL = DECK_STYLE_PACKS[0].label;

/** 默认版式语言的**界面**显示名（含"（推荐）"这类提示） */
export const DECK_DEFAULT_LAYOUT_LABEL = DECK_LAYOUT_PACKS[0].label;

/** 默认版式语言的**提示词**用名（不含界面提示语） */
export const DECK_DEFAULT_LAYOUT_PROMPT_LABEL = DECK_LAYOUT_PACKS[0].promptLabel;

/** id → 风格包中文名（后台执行脚本拼提示词用） */
export const DECK_STYLE_PACK_NAMES = Object.fromEntries(
  DECK_STYLE_PACKS.map(item => [item.id, item.label])
);

/** id → 版式语言中文名（**写进提示词**用，取 promptLabel 而不是界面 label） */
export const DECK_LAYOUT_PACK_NAMES = Object.fromEntries(
  DECK_LAYOUT_PACKS.map(item => [item.id, item.promptLabel || item.label])
);
