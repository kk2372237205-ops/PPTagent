/**
 * 风格包一致性检查（防止清单漂移）
 *
 * ## 为什么需要这个脚本
 *
 * 同一份风格包 id 列表曾经同时存在于 13 个地方：4 个接口路由、2 个后台执行脚本、
 * 2 个 Markdown 提示词文件、若干界面文件。改一处漏一处就会出现
 * "界面上能选、后台认不出" 或者 "已经删掉的风格包在提示词里复活"。
 *
 * 现在 `lib/employee-deck-packs.mjs` 是全项目唯一真源，本脚本负责守住这个约定：
 *
 *   1. `skills/deck-generation/style-packs.md` 的 `## <id>：<中文名>` 段落集合，
 *      必须与 `DECK_STYLE_PACKS` 完全一致；
 *   2. `skills/deck-generation/advanced-layout-profiles.md` 的 `## <id>: <英文名>` 段落集合，
 *      必须与 `DECK_LAYOUT_PACKS` 完全一致；
 *   3. 已删除的风格包 id 不得在源码/提示词里复活（文档除外，归档文档允许记录历史）。
 *
 * 运行方式：`npm run verify:check`（已接入），或单独 `node scripts/check-style-packs.mjs`。
 * 退出码 0 = 一致；1 = 有不一致，并把差异打印出来。
 */

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  DECK_LAYOUT_PACKS,
  DECK_STYLE_PACKS
} from "../lib/employee-deck-packs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stylePacksFile = path.join(root, "skills", "deck-generation", "style-packs.md");
const layoutProfilesFile = path.join(root, "skills", "deck-generation", "advanced-layout-profiles.md");

/** 已删除、不得在源码或提示词中出现的风格包 id */
const RETIRED_PACK_IDS = ["blue-purple-ai", "red-white-government", "vivid-roadshow"];

/** 扫描范围：只查真正的消费者，文档与归档允许记录历史 */
const SCAN_DIRS = ["app", "components", "lib", "scripts", "skills", "prisma"];
const SCAN_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js", ".md", ".mts"];
/**
 * 允许出现风格包 id 的地方。只有这 4 个：
 *   - 真源本身；
 *   - 本检查脚本；
 *   - 两份 Markdown（它们的 `## <id>` 段落就是被检查的对象）。
 * 其它任何文件里出现 "blue-gold-tech" 这类 id 字面量都算"又抄了一份清单"，直接失败。
 */
const SCAN_EXCLUDES = [
  path.join("lib", "employee-deck-packs.mjs"),
  path.join("scripts", "check-style-packs.mjs"),
  path.join("skills", "deck-generation", "style-packs.md"),
  path.join("skills", "deck-generation", "advanced-layout-profiles.md"),
  path.join("docs")
];

const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(file) {
  try {
    return readFileSync(file, "utf8");
  } catch (error) {
    fail(`读不到 ${path.relative(root, file)}：${error.message}`);
    return "";
  }
}

/** 取出 Markdown 里所有二级标题 */
function headingList(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.match(/^##\s+(.+?)\s*$/))
    .filter(Boolean)
    .map(match => match[1]);
}

/** style-packs.md 的标题形如 `blue-gold-tech：蓝金科技`（全角冒号） */
function parseStylePackHeadings(text) {
  return headingList(text)
    .map(heading => {
      const match = heading.match(/^([a-z0-9-]+)\s*[：:]\s*(.+)$/);
      return match ? { id: match[1], label: match[2].trim() } : null;
    })
    .filter(Boolean);
}

/** advanced-layout-profiles.md 的标题形如 `blue-gold-tech: Visual Narrative`（半角冒号） */
function parseLayoutHeadings(text) {
  return headingList(text)
    .map(heading => {
      const match = heading.match(/^([a-z0-9-]+)\s*:\s*(.+)$/);
      return match ? { id: match[1], label: match[2].trim() } : null;
    })
    .filter(Boolean);
}

function compareSets(kind, expectedIds, actualIds, file) {
  const relative = path.relative(root, file);
  const missing = expectedIds.filter(id => !actualIds.includes(id));
  const extra = actualIds.filter(id => !expectedIds.includes(id));
  if (missing.length) {
    fail(`${relative} 缺少段落：${missing.join("、")}（真源 lib/employee-deck-packs.mjs 里有）`);
  }
  if (extra.length) {
    fail(`${relative} 多出段落：${extra.join("、")}（真源里已经没有，请删除或先在 .mjs 里恢复）`);
  }
  if (!missing.length && !extra.length) {
    console.log(`  ✓ ${relative} 与真源一致（${expectedIds.length} 个${kind}）`);
  }
}

function walk(dir, onFile) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, onFile);
    } else {
      onFile(full);
    }
  }
}

function scanConsumers(onHit) {
  for (const dir of SCAN_DIRS) {
    walk(path.join(root, dir), file => {
      const relative = path.relative(root, file);
      if (SCAN_EXCLUDES.some(excluded => relative.startsWith(excluded))) return;
      if (!SCAN_EXTENSIONS.includes(path.extname(file))) return;
      onHit(relative, readText(file));
    });
  }
}

function checkRetiredIds() {
  const hits = [];
  scanConsumers((relative, text) => {
    for (const id of RETIRED_PACK_IDS) {
      if (text.includes(id)) hits.push(`${relative} → ${id}`);
    }
  });
  if (hits.length) {
    fail(`已删除的风格包 id 重新出现：\n    ${hits.join("\n    ")}`);
  } else {
    console.log(`  ✓ 已删除的 ${RETIRED_PACK_IDS.length} 个风格包 id 没有复活`);
  }
}

/**
 * 只保留"真正的代码/正文行"，丢掉整行注释。
 * 注释里提到某个风格包名是正常的（解释"为什么不要写死它"），不算重复定义。
 */
function significantLines(text) {
  return text
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !(trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*") || trimmed.startsWith("<!--"));
    })
    .join("\n");
}

/**
 * 这一条是防漂移的主力：任何消费者文件里都不允许再出现风格包 id 字面量。
 * 想加/删风格包，只能改真源；想用某个包，只能 import 真源导出的常量。
 */
function checkNoDuplicatedIds(allIds) {
  const hits = new Set();
  scanConsumers((relative, text) => {
    const body = significantLines(text);
    for (const id of allIds) {
      if (body.includes(`"${id}"`) || body.includes(`'${id}'`) || body.includes("`" + id + "`")) {
        hits.add(`${relative} → ${id}`);
      }
    }
  });
  if (hits.size) {
    fail(
      "又有人把风格包 id 抄进了消费者文件（这正是过去 8 处副本的老问题）：\n" +
      `    ${[...hits].join("\n    ")}\n` +
      "    改法：从 lib/employee-deck-packs.mjs import 现成常量（DECK_STYLE_PACK_NAMES / DECK_DEFAULT_STYLE_PACK_ID / deckStylePackIds 等），\n" +
      "    或者通过 lib/employee-deck-constants.ts 取，不要写字符串字面量。"
    );
  } else {
    console.log("  ✓ 消费者文件里没有重复的风格包 id 字面量");
  }
}

console.log("风格包一致性检查（真源：lib/employee-deck-packs.mjs）");

const styleIds = DECK_STYLE_PACKS.map(pack => pack.id);
const layoutIds = DECK_LAYOUT_PACKS.map(pack => pack.id);

if (!styleIds.length) fail("DECK_STYLE_PACKS 为空，至少保留一个风格包");
if (new Set(styleIds).size !== styleIds.length) fail("DECK_STYLE_PACKS 里有重复 id");
if (new Set(layoutIds).size !== layoutIds.length) fail("DECK_LAYOUT_PACKS 里有重复 id");

const layoutIdSet = new Set(layoutIds);
const unpaired = styleIds.filter(id => !layoutIdSet.has(id));
if (unpaired.length) {
  fail(`这些风格包缺少对应的版式语言条目（参考图配色模式会选不到版式）：${unpaired.join("、")}`);
}
console.log(`  ✓ 真源共 ${styleIds.length} 个风格包：${styleIds.join("、")}`);

compareSets("风格包", styleIds, parseStylePackHeadings(readText(stylePacksFile)).map(item => item.id), stylePacksFile);
compareSets("版式语言", layoutIds, parseLayoutHeadings(readText(layoutProfilesFile)).map(item => item.id), layoutProfilesFile);

checkRetiredIds();
checkNoDuplicatedIds([...styleIds, ...layoutIds]);

if (failures.length) {
  console.error("\n风格包检查失败：");
  for (const item of failures) console.error(`  ✗ ${item}`);
  console.error("\n修法：先改 lib/employee-deck-packs.mjs，再同步 skills/deck-generation/ 下两个 Markdown 文件的同名段落。");
  process.exit(1);
}

console.log("风格包检查通过。\n");
