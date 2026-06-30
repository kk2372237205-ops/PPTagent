# slide_image_specs.json

## 职责

定义每一页具体怎么生成。图片模型只看最终 prompt，但 prompt 必须来自这里。

## JSON 结构

```json
{
  "slides": [
    {
      "slide_index": 1,
      "title": "",
      "content_summary": "",
      "composition": "",
      "main_visual": "",
      "inherited_elements": ["", ""],
      "changed_elements": ["", ""],
      "text_density": "low",
      "white_space": "",
      "must_include": ["", ""],
      "must_avoid": ["", ""]
    }
  ]
}
```

## 规则

- 每页必须是完整 16:9 PPT 页面。
- 第 1 页必须是 `cover`，最后 1 页必须是 `ending`。
- 中间页必须是内容角色，只能使用 `problem`、`insight`、`solution`、`architecture`、`feature`、`scenario`、`data`、`roadmap`。
- 中间页不允许使用 `cover` 或 `ending`。
- `title` 必须是纯标题，不要带页码、序号、`01`、`第 1 页`、`1.` 这类数字前缀。
- 不要把页码做成左上角或标题旁的大号数字装饰；如需页码，只能作为统一页脚或角落里的小辅助信息。
- composition 要讲清楚标题、内容、主视觉的位置。
- main_visual 只描述与项目有关的主视觉，不要乱加无关机器人、人物或城市。
- inherited_elements 必须引用 visual_identity 和 storyboard 中的统一元素。
- changed_elements 负责让页面有变化。
- text_density 建议 low 或 medium，减少 AI 乱码。
- 所有重要文字、图表、底部横幅、页脚和装饰必须留在安全区内，距离四边至少 6%，不要贴边，不要被裁切。
