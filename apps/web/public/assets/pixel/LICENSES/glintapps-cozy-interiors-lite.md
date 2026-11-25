# glintapps — Cozy Interiors LITE (free) 授权记录

- 记录日期：2026-11-25
- 官方下载地址：https://glintapps.itch.io/cozy-interiors-lite-free
- 作者：glintapps（包内版权：Benjamin De Pourquery）
- 授权名称：自定义许可，包内 `CozyInteriors_Lite/LICENSE.txt` 提供全文；不是 CC0。
- 结果：下载成功并导入 `general/glintapps-cozy-interiors-lite/`。官方 zip `CozyInteriors_Lite_v1.5.zip` 146,941 B，CRC 校验通过，168 个文件，原始结构与文件名未改。

## 授权原文（包内 LICENSE.txt，一手）

```text
Cozy Interiors - License
Copyright (c) 2026 Benjamin De Pourquery

1. Grant. When you buy or download this pack, you receive a worldwide, non-exclusive, perpetual licence
   to use the assets in any number of personal or commercial projects, including games, software,
   websites, videos and printed material. You may modify them.
2. Restrictions. You may not:
   a) sell, sublicense, share or redistribute the assets (original or modified) as standalone files
      or as part of any asset pack, template, tileset or similar resource;
   b) claim the assets as your own creation;
   c) use the assets as training data for AI or machine-learning models;
   d) use the assets in a logo or trademark.
3. Attribution. Not required, but appreciated: "Cozy Interiors by Benjamin De Pourquery".
4. No warranty. The assets are provided "as is", with no warranty of any kind.
```

官方页面同样写明：

> License: free for personal and commercial projects, no attribution required. Do not resell or redistribute the assets themselves, and do not use them to train AI models. Full text in LICENSE.txt.

## 逐项结论

| 项目 | 结论 | 依据 |
| --- | --- | --- |
| 授权类型 | 自定义许可，非 CC0 | 包内 `LICENSE.txt` 全文 |
| 允许商业使用 | 是 | `personal or commercial projects` |
| 需要署名 | 否 | `Attribution. Not required, but appreciated` |
| 允许修改 | 是 | `You may modify them.` |
| 允许重新分发 | **否** | `may not ... sell, sublicense, share or redistribute the assets ... as standalone files or as part of any asset pack, template, tileset or similar resource` |
| AI 训练 | 禁止 | `use the assets as training data for AI or machine-learning models` |
| 作者 | glintapps / Benjamin De Pourquery | 官方页面 + 包内版权 |

## 入库说明与风险

- 用户明确确认该素材可用并要求直接下载入库；本记录不替用户改写授权条款。
- 该许可允许在项目内使用，但**禁止将素材本身再分发**。本仓库是公开 Git 仓库，把原始文件入库与“再分发”存在潜在冲突；若后续对外发布仓库或分发素材文件，需要由项目所有者自行确认授权风险。
- 前端实际使用时应仅在成品项目内嵌入素材，不把这些 PNG 再作为独立素材包分发；不得用于 AI 训练或 logo/商标。

## 内容

- 27 个 16×16 网格的俯视角室内素材，提供 16px 与 2× 的 32px 两套，各有 outline / no_outline 变体；含 spritesheets、`index.json` / `index.csv`、预览图和 28 色调色板。
- 地板、地毯、墙、窗、门、床、床头柜、桌椅、沙发、书架、厨房台面/炉灶、马桶、落地灯、植物、相框、桌面杯子等。
- 具体尺寸与重复文件见 `ASSET_CATALOG.md`。
