# visual_identity.json

## 职责

定义整套图最终看起来是什么风格。它是组图的一致性底盘。

## JSON 结构

```json
{
  "style_name": "",
  "palette": ["#0B1F3A", "#2F80ED", "#F4B740", "#F8FBFF"],
  "background_system": "",
  "layout_system": "",
  "card_system": "",
  "typography_feel": "",
  "motifs": ["", ""],
  "header_footer_rules": "",
  "white_space_rules": "",
  "forbidden": ["", ""]
}
```

## 规则

- palette 必须稳定，最多 5 个主色。
- background_system 描述背景材质、光感、纹理和深浅。
- layout_system 描述标题区、内容区、主视觉区和留白。
- card_system 描述卡片圆角、描边、阴影、透明度。
- motifs 是可复用装饰元素，不能每页换一套。
- forbidden 必须写清楚不要出现的风格漂移。
