# 变量知识库 SillyTavern 扩展

一个用于把长篇问答、世界观设定、人物关系表拆成“可触发变量知识”的 SillyTavern 前端扩展。

## 功能

- 根据最近聊天内容自动匹配关键词，并在生成前临时注入相关设定。
- 支持用户自行新增、复制、删除、编辑条目。
- 支持区分“已确定内容”和“可能发生”。“可能发生”会被明确标记为条件情境，不会作为既定事实注入。
- 支持全局变量，例如在内容中写 `{{当前世界观}}` 或 `{{var:当前世界观}}`。
- 支持 JSON、TXT、Markdown 导入，以及 JSON 导出备份。
- 支持普通关键词和 JavaScript 风格正则关键词，例如 `/恋爱.{0,6}配得感/i`。
- 可设置扫描消息数、最多注入条目、最低命中分、注入长度上限。

## 安装

把本仓库放到 SillyTavern 的第三方扩展目录，例如：

```text
SillyTavern/public/scripts/extensions/third-party/st-variable-lorebook
```

或者在 SillyTavern 的扩展管理里通过 GitHub 地址安装。

## 数据格式

推荐导入 JSON：

```json
{
  "variables": [
    { "key": "当前世界观", "value": "现代都市" }
  ],
  "entries": [
    {
      "title": "恋爱配得感排序",
      "enabled": true,
      "sourceType": "confirmed",
      "keywords": ["恋爱配得感", "配得感", "感情自信"],
      "content": "关于恋爱配得感排序:\n最高: 亓谢/周锦宁.\n靠前: 魏月华/桑洛凡.\n中间: 鹿言/魏星泽.\n偏低: 谌绪/秦述.\n最低: 司洛/孟明赫.",
      "note": "示例"
    }
  ]
}
```

`sourceType` 可选：

- `confirmed`：已确定内容，可以作为事实使用。
- `possible`：可能发生，只能在剧情条件符合时参考，不能当成已经发生。

TXT/Markdown 导入会按空行切分成多个条目，并把每段第一行当作标题和默认关键词。导入后建议手动补关键词。

## 宏

扩展会注册一个宏：

```text
{{varkb::恋爱配得感排序}}
```

它会按标题取出对应条目内容，并替换全局变量。

## 注意

这个扩展使用 SillyTavern 的 `generate_interceptor` 在生成前注入内容。它适合大量设定的按需调用；如果只有几十条资料，原生世界书也足够好用。
