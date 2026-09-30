# skills 目录说明

这个目录存放给**后台执行脚本**读取的 Markdown 规则。改出图效果优先改这里，不要把长提示词塞回 `.mjs` 字符串。

---

## ⚠️ 先看这个：谁在读哪些文件

**本目录只服务生成 PPT。美化 PPT 现在不读任何规则文件，生图也不读。**

| worker | 工程路径 | 读什么 |
| --- | --- | --- |
| 生成 PPT | `scripts/workers/deck-generation/deck-generation-worker.mjs` | **本目录全部 16 个文件** |
| 美化 PPT | `scripts/workers/ppt-polish/ppt-polish-worker.mjs` | **什么规则都不读**（提示词 = 用户写的要求 + 本页原有文字 + 本页位置） |
| 生图 / 单页设计 | `scripts/workers/design-agent/design-agent-worker.mjs` | **一份都不读**（提示词全在代码里） |

> ⚠️ **规则边界（2026-09-27 决定，2026-09-30 两轮收紧）**
>
> 生成 PPT、美化 PPT、生图是三条独立产品线，不互相黏连。
> 美化曾经读过本目录的 `style-packs.md` 与 `illustration-system.md`，后来只读自己的
> `skills/ppt-polish/visual-redraw-system.md`，**2026-09-30 起连它自己的规则文件也删了**：
> owner 原话是"这些提示词我都不需要用到这里，只听用户的提示词命令"。
> 因为那些规则和用户指令正面冲突（用户要"内容不变 + 蓝白科技风"，规则要"不要锁定风格、
> 每页必须有 25% 主导插图、默认写实摄影、封面结尾文字极少、降低文字密度"），
> 模型会听更长更具体的一方 —— 这就是美化"不听话"的根因。
>
> 结论：**不要再给美化接规则文件**。它的提示词只由用户在界面上写的内容组成。
>
> 唯一仍然共用的是 `lib/employee-deck-packs.mjs` 里的风格包 id 清单，而它现在**只被生成链路使用**（界面与接口的 id 契约）。

逐文件对照（"生成 PPT"列为准）：

| 文件 | 生成 PPT | 美化 PPT | 说明 |
| --- | --- | --- | --- |
| `SKILL.md` | ✅ | — | 总规则 |
| `style-packs.md` | ✅（仅内置配色模式） | — | 4 个风格包的配色与版式定义。**id 清单的真源是 `lib/employee-deck-packs.mjs`**，本文件的段落由 `scripts/check-style-packs.mjs` 逐 id 校验 |
| `advanced-layout-profiles.md` | ✅（仅参考图配色模式） | — | 无配色的版式语言。段落同样受 `scripts/check-style-packs.mjs` 校验 |
| `visual-identity.md` | ✅ | — | 整套图的视觉身份（含 `image_language` 插图体系） |
| `visual-storyboard.md` | ✅ | — | 页间连贯性与叙事节奏 |
| `slide-image-specs.md` | ✅ | — | 单页怎么生成（含插图面积份额） |
| `illustration-system.md` | ✅ | — | **插图/画面体系与面积合同**（生成链路的画面工程规则，美化用自己的那份） |
| `regeneration-controls.md` | ✅ | — | 单页返工规则 |
| `source-grounding.md` | ✅ | — | 资料读取与来源追溯 |
| `outline-control.md` | ✅ | — | 高级版大纲与确认规则 |
| `content-density.md` | ✅ | — | 信息密度与插图主导页例外 |
| `palette-reference.md` | ✅ | — | 参考图配色的色值提取规则 |
| `advanced-single-slide-director/**`（3 个） | ✅（仅高级版） | — | 单页导演 Skill |
| `advanced-single-slide-director/agents/openai.yaml` | ❌ | ❌ | **全仓无代码读取**，是外部 agent 清单格式的遗留元数据 |

> **这份"共用"已经不存在了。** 2026-09-27 之前美化 PPT 会读其中 2 份，owner 决定按模式隔离后
> 已从美化侧砍断。当时的判断依据（为什么曾决定不拆）保留在 `docs/feature-file-map.md` 第十节，作为决策记录。

---

## 读取机制（改之前必须知道）

**1. `readSkill()` 是裸读文件，没有兜底。**

```js
function readSkill(name) {
  return readFileSync(path.join(skillRoot, name), "utf8").trim();
}
```

没有 `try/catch`、没有存在性检查。**路径写错 `npm run verify` 查不出来**，只会在真实生成任务跑到一半时抛错。所以移动/改名本目录的文件后，必须用一次真实任务（或至少一次路径断言）验证。

**2. 注入方式是"整篇拼接"，不是摘取。**

`skillBundle()` 把上表 13 份用 `\n\n---\n\n` 连接后整篇注入**方案提示词**（给文字模型），其中 `illustration-system.md` 还额外进**单页图片提示词**。（这是生成链路的拼装；美化只单独读 `style-packs.md` 一份。）

**3. 有一个容易踩的条件分支。**

```
内置配色模式  → 读 style-packs.md
参考图配色模式 → 读 advanced-layout-profiles.md（不读 style-packs.md）
```

**只改其中一个，另一条配色链路完全不生效。** 两条链路都要生效的规则写在 `illustration-system.md`（生成链路无条件读取）。

---

## `deck-generation/` 逐文件说明

- `SKILL.md`：总规则：目标、输入、输出阶段、硬性页面结构、质量标准、快速版与高级版差异。

- `style-packs.md`：4 个风格包的配色、版式、母题、字体气质与禁止项；含**渲染路线**（默认真实写实）一节。段落集合由 `scripts/check-style-packs.mjs` 与 `lib/employee-deck-packs.mjs` 逐 id 校验。

- `advanced-layout-profiles.md`：只供高级版的参考图配色模式读取；定义无颜色的信息组织、图文关系、插图面积、出血与页面节奏。

- `visual-identity.md`：整套图的视觉身份。**后台按固定键名读取本文件产出的 JSON，键名写错等于字段不存在。** 含 `image_language` 插图体系。

- `visual-storyboard.md`：页面之间的连贯性和叙事节奏。

- `slide-image-specs.md`：单页怎么生成，含 `illustration_share` 面积份额与整套面积节奏。

- `illustration-system.md`：**插图/画面体系**。三个症状（过小 / 没有 / 很假）的成因与修法、写实与图解两条路线、正负配对、真实性边界、成图后自检。**生成链路的画面工程规则，美化不读。**

- `source-grounding.md`：大量资料读取、事实与数字来源追溯。

- `outline-control.md`：高级版逐页大标题、小标题、内容意图和一次完整方案确认。

- `content-density.md`：正文页信息密度；以及**插图主导页的密度例外**。

- `palette-reference.md`：参考图配色的色值职责提取。

- ~~`quality-audit.md`~~：**已于 2026-09-30 删除**（连同它描述的"后台交付安全检查"）。防伪造公文、公章、机构招牌、logo 与真人肖像的要求仍在 `illustration-system.md`。

- `regeneration-controls.md`：重新生成本页、更贴近上一页等局部重生。

- `advanced-single-slide-director/`：只供**高级版**读取的单页导演 Skill。按页判断技术原理、实验验证、应用案例、商业证明等语义任务，把事实包转成包含画面比重、画面单元和图文融合规则的 Image2 可执行合同。

---

## 维护原则

1. **优先改 Markdown 技能**，不要把长提示词塞回 `.mjs` 字符串。
2. **改技能后用小页数任务验证**，不要一次跑大任务。
3. **结尾页规则必须保留**：少内容、强情绪、强收束、强记忆点（**这条只对生成 PPT 生效**；美化不再有任何我们预设的规则）。
4. **本目录只服务生成 PPT。** 美化 PPT 什么规则都不读，生图也不读；**不要把这些文件接给它们**（2026-09-27 决定、2026-09-30 两轮收紧，见开头说明）。
5. **本目录的文件名与路径被 `docs/feature-file-map.md` 和 `docs/model-handoff.md` 引用**，移动文件时一并更新。
