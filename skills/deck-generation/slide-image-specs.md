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
      "director_contract": {
        "visual_weight": "balanced",
        "visual_units": [],
        "integration_rule": ""
      },
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
- main_visual 只描述与项目有关的整体视觉方向，不要乱加无关机器人、人物或城市；它可以统筹多个互相关联的画面单元。
- 高级版每个适合图像表达的正文页优先规划 1-3 个有语义作用的画面单元；高密度页最多 4 个，纯文字页可以为 0 个。
- 每个画面单元必须服务某条正文、阶段、对比、机制、背景或结果，并与对应文字共同形成阅读路径。
- 图片位置由语义决定，不能把全部页面固定成左文右图、上文下图或统一底部图片区。
- 所有画面、文字和图表仍由 Image2 在一次请求中生成成一张完整页面图，不存在后插图步骤。
- inherited_elements 必须引用 visual_identity 和 storyboard 中的统一元素。
- changed_elements 负责让页面有变化。
- text_density 使用 low / medium / high：封面和结尾固定 low，普通正文 medium，资料型综述和数据页可用 high，但必须分区清楚且可读。
- 所有重要文字、图表、底部横幅、页脚和装饰必须留在安全区内，距离四边至少 6%，不要贴边，不要被裁切。
