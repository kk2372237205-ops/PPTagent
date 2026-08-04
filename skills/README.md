# skills 目录说明

这个目录存放给 worker 读取的人类可读技能文档。

## deck-generation

`deck-generation` 是当前生成 PPT 的核心技能目录。

- `SKILL.md`
  - 总规则。

- `style-packs.md`
  - 风格包定义。

- `visual-identity.md`
  - 整套 PPT 的视觉身份规则。

- `visual-storyboard.md`
  - 页面之间的连贯性和叙事节奏。

- `slide-image-specs.md`
  - 单页怎么生成。

- `source-grounding.md`
  - 大量资料读取、事实与数字来源追溯规则。

- `outline-control.md`
  - 高级版逐页大标题、小标题、内容意图和两次确认规则。

- `content-density.md`
  - 正文页信息密度、紧凑版式和减少无意义留白规则。

- `palette-reference.md`
  - 内置配色与参考图配色的颜色职责提取规则，不照抄版式。

- `quality-audit.md`
  - 生图前后检查标题、数字、必须信息、配色和页面连续性。

- `regeneration-controls.md`
  - 重新生成本页、更贴近上一页等局部重生规则。

## 维护原则

- 优先改 Markdown 技能，不要把长提示词塞回 `.mjs` 字符串。
- 改技能后，用小页数任务验证，不要一次跑大任务。
- 结尾页规则必须保留：少内容、强情绪、强收束、强记忆点。

