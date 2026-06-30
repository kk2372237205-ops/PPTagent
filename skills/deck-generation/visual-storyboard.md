# visual_storyboard.json

## 职责

定义这一组页面如何连续，而不是一堆互不相关的图。

## JSON 结构

```json
{
  "rhythm": "",
  "slides": [
    {
      "slide_index": 1,
      "role": "cover",
      "story_goal": "",
      "previous_relation": "start",
      "next_transition": "",
      "visual_change": "",
      "reused_elements": ["", ""]
    }
  ]
}
```

## 页面角色

- cover：封面，建立主视觉。
- problem：问题或痛点。
- insight：趋势、背景或机会。
- solution：方案总览。
- architecture：系统架构。
- feature：功能或技术亮点。
- scenario：应用场景。
- data：数据、成果或优势。
- roadmap：计划、流程或里程碑。
- ending：总结或收束。

## 硬性结构

- `slides[0].role` 必须是 `cover`。
- `slides[last].role` 必须是 `ending`。
- 中间页面必须是内容角色，不能使用 `cover` 或 `ending`。
- 每个页面的 role 必须与 outline 和 slide_image_specs 中同一页的 role 保持一致。
- cover 负责建立整套 PPT 的主视觉和主题，不承担正文展开。
- ending 负责总结、收束、价值升华或行动号召，不再引入新的复杂信息架构。

## 规则

- 每页必须说明上一页怎么接过来、下一页怎么过渡。
- visual_change 描述这一页相对上一页的变化，避免模板重复。
- reused_elements 描述继承元素，避免风格断裂。
