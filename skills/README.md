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
  - 高级版逐页大标题、小标题、内容意图和一次完整方案确认规则。

- `content-density.md`
  - 正文页信息密度、紧凑版式和减少无意义留白规则。

- `palette-reference.md`
  - 内置配色与参考图配色的颜色职责提取规则，不照抄版式。

- `quality-audit.md`
  - 高级版整套完成后的静默交付安全检查规则；不做逐页质检或自动重绘。

- `regeneration-controls.md`
  - 重新生成本页、更贴近上一页等局部重生规则。

- `advanced-single-slide-director/`
  - 只供生成 PPT 高级版读取的单页导演 Skill。
  - 按页判断技术原理、实验验证、应用案例、商业证明等语义任务，把 GPT-5.6 的事实包转成 Image2 可执行的画面合同。
  - 内容资料图片只用于 OCR/理解，不作为成图素材；严肃汇报默认不用通用装饰图标，不允许伪造机构、证书、合同、实验、客户场景或产品证据。

## 维护原则

- 优先改 Markdown 技能，不要把长提示词塞回 `.mjs` 字符串。
- 改技能后，用小页数任务验证，不要一次跑大任务。
- 结尾页规则必须保留：少内容、强情绪、强收束、强记忆点。

