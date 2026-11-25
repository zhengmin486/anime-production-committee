# 统一像素素材库目录（持续更新）

导入日期：2026-11-25  
分支：`feature/pixel-art-assets`（基于 `main@31cf81c`，Draft PR #102）

## 批次概览

- **第一批**：Kenney `Pixel Pack`、2dPig `Pixel Office Asset Pack`，均已从官方地址下载成功并导入，未使用替代素材或预览图。
- **第二批**：Antea `Free Furniture Office Equipment Set`、glintapps `Cozy Interiors LITE (free)`、Cup Nooble `Sprout Lands - UI Pack (Basic free)`、DeepDiveGameStudio `Humanoid Asset Pack [16x16]`，均由用户明确确认可用并要求直接下载，已从官方 itch.io 地址下载成功并导入。
- **授权风险提示**：Antea 明确允许商用与再分发；Kenney / 2dPig 为 CC0。**Glint / Cup / Humanoid 的许可禁止把素材本身再分发，Cup 免费版还限非商业项目。** 按用户指示已入库，但每份授权原文与风险都保留在 `LICENSES/`，不改写结论；对外发布仓库或商业化前需由项目所有者再次确认。

## 目录布局

仓库已有前端素材根目录 `apps/web/public/assets/`（含 `backgrounds/`、`characters/`、`items/`、`production/` 等，记录见 [`docs/ASSET_CATALOG.md`](../../../../../docs/ASSET_CATALOG.md)）。本库**复用该根目录**，只新增 `pixel/` 子库，不新建顶层 `assets/`，不改动任何现有素材或文档：

```text
apps/web/public/assets/pixel/
├── ASSET_CATALOG.md                               本文件：来源、授权与素材清单
├── LICENSES/
│   ├── kenney-pixel-pack.md                       Kenney 授权核实记录
│   ├── 2dpig-pixel-office.md                      2dPig 授权核实记录
│   ├── antea-furniture-office-equipment.md        Antea 授权记录
│   ├── glintapps-cozy-interiors-lite.md           glintapps 授权记录
│   ├── cupnooble-sprout-lands-ui-pack.md          Cup Nooble 授权记录
│   └── deepdivegamestudio-humanoid-asset-pack.md  Humanoid 授权记录
├── general/
│   ├── kenney-pixel-pack/                         Kenney 原始包（1×1 愚人节包）
│   └── glintapps-cozy-interiors-lite/             16×16 室内素材、spritesheet、索引与预览
├── office/
│   ├── 2dpig/                                     办公室角色/动物/家具/示例场景
│   └── antea-furniture-office-equipment/          办公室家具与设备 PNG
├── ui/
│   └── cupnooble-sprout-lands-ui-pack/            按钮、气泡、emoji、天气图标与像素字体
└── characters/
    └── deepdivegamestudio-humanoid-asset-pack/    16×16 人形角色动画（PNG/GIF/Aseprite）
```

原始 zip 保存在任务临时目录，**不入库**；入库的是完整解压后的原始文件，目录结构与文件名均保持原样。

---

## 素材包 1：Pixel Pack（Kenney）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Pixel Pack（包内 `License.txt` 标题为 `Pixel Pack`） |
| 作者 | Kenney（www.kenney.nl） |
| 官方下载地址 | https://kenney.nl/assets/pixel-pack |
| 授权类型 | Creative Commons CC0 1.0 |
| 授权原文 / 官方授权页面 | 包内 `License.txt` 原文见 [`LICENSES/kenney-pixel-pack.md`](LICENSES/kenney-pixel-pack.md)；官方页面 Properties 表 `License → Creative Commons CC0` |
| 是否允许商业使用 | 允许。原文：`This content is free to use in personal, educational and commercial projects.` |
| 是否需要署名 | 不需要（`this is not mandatory`） |
| 是否允许修改 / 重新分发 | CC0 1.0 允许 |
| 导入日期 | 2026-11-25 |
| 文件目录 | `general/kenney-pixel-pack/`（101 个文件，25,582 字节；官方 zip 38,315 字节） |
| 适用场景 | **实际不可用**：2019 愚人节玩笑包，98 个 PNG 全是 1×1 像素，不能作为角色/家具/道具使用 |

实际内容：98 个 1×1 PNG（49 黑 + 49 白）、1 张 14×7 spritesheet、官方预览图和 CC0 `License.txt`。无角色动画、Tile/Tileset、地图、字体或音效。49 黑与 49 白各为同内容重复文件，是原包设计，未去重。

---

## 素材包 2：Pixel Office Asset Pack（2dPig）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Pixel Office Asset Pack |
| 作者 | 2dPig |
| 官方下载地址 | https://2dpig.itch.io/pixel-office |
| 授权类型 | CC0 / Creative Commons Public Domain Dedication |
| 授权原文 / 官方授权页面 | 官方页面 `LICENSE INFORMATION` + 包内 `LICENSE.txt` / `README.txt`，见 [`LICENSES/2dpig-pixel-office.md`](LICENSES/2dpig-pixel-office.md) |
| 是否允许商业使用 | 是。包内原文：`with no conditions` |
| 是否需要署名 | 否（`No attribution is required but it is greatly appreciated`） |
| 是否允许修改 / 重新分发 | 是，CC0 允许 |
| 导入日期 | 2026-11-25 |
| 文件目录 | `office/2dpig/`（7 个文件；官方 zip 50,510 字节） |
| 适用场景 | 办公室角色、动物、家具、电脑、植物、装饰与示例场景 |

实际内容：5 个人物、2 个动物（猫/狗）、办公桌/椅/电脑/隔断/植物等；2 张示例场景 PNG（256×224、1024×896）、1 张素材总表（256×160）、2 个 Aseprite 源文件。Aseprite 文件头有 256 帧但 Tags=0，不声称有可播放角色动画；无 Tile/Tileset、字体或音效，7 个文件无重复。

---

## 素材包 3：Free Furniture Office Equipment Set（Antea）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Free Furniture Office Equipment Set Pixel Art |
| 作者 | Antea ✮⋆˙ |
| 官方下载地址 | https://stcrbcn.itch.io/furniture-office-set |
| 授权类型 | 作者自定义宽松授权，未命名；包内无授权文件，见 [`LICENSES/antea-furniture-office-equipment.md`](LICENSES/antea-furniture-office-equipment.md) |
| 授权原文 | `This license enables reusers to distribute, remix, adapt, and build upon the material in any medium or format, so long as attribution is given to the creator. The license allows for commercial use.` |
| 是否允许商业使用 | 是 |
| 是否需要署名 | **是**，须署名作者 |
| 是否允许修改 / 重新分发 | 是，原文明确允许 `remix, adapt, build upon` 与 `distribute` |
| 导入日期 | 2026-11-25 |
| 文件目录 | `office/antea-furniture-office-equipment/`（43 个 PNG；官方 zip 38,447 字节） |
| 适用场景 | 办公室家具与设备：桌椅、文件柜、书架、打印机、咖啡机、饮水机、沙发、植物、时钟、白板等 |

实际内容：22 个 16×16 PNG、20 个 32×32 PNG、1 张 224×192 `0-Tileset.png`。官方明确说明只含 standalone furniture assets，**不含地板、墙、天花板、角色或玩家精灵**。无动画、字体、音效；无重复文件；无缓存/临时文件。

---

## 素材包 4：Cozy Interiors LITE (free)（glintapps）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Cozy Interiors LITE (free) |
| 作者 | glintapps（包内版权：Benjamin De Pourquery） |
| 官方下载地址 | https://glintapps.itch.io/cozy-interiors-lite-free |
| 授权类型 | 自定义许可，非 CC0；包内 `LICENSE.txt` 全文见 [`LICENSES/glintapps-cozy-interiors-lite.md`](LICENSES/glintapps-cozy-interiors-lite.md) |
| 是否允许商业使用 | 是 |
| 是否需要署名 | 否（`Not required, but appreciated`） |
| 是否允许修改 | 是 |
| 是否允许重新分发 | **否**，禁止把素材作为独立文件或素材包/模板/tileset 分享或再分发 |
| 其他限制 | 禁止 AI 训练、logo/商标、声称原创 |
| 导入日期 | 2026-11-25 |
| 文件目录 | `general/glintapps-cozy-interiors-lite/`（168 个文件；官方 zip 146,941 字节） |
| 适用场景 | 16×16 俯视角室内：地板、地毯、墙、窗、门、床、桌椅、沙发、书架、厨房、浴室、灯具、植物、装饰 |

实际内容：16px 与 32px 两套尺寸，各有 outline / no_outline 变体；163 个 PNG、2 个 TXT、`palette.hex`、`index.json`、`index.csv`。含按类别切分的 spritesheets（256×32、512×64 等）与预览图（932×194 / 932×344）。无角色动画。32 组重复文件主要是 outline / no_outline 中地板、墙顶等原包设计相同文件，未去重。无字体/音效，无缓存/临时文件。

---

## 素材包 5：Sprout Lands - UI Pack（Basic free）（Cup Nooble）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Sprout Lands - UI Pack（本次仅 Basic free pack） |
| 作者 | Cup Nooble |
| 官方下载地址 | https://cupnooble.itch.io/sprout-lands-ui-pack |
| 授权类型 | Free Basic Pack 自定义许可，非 CC0；包内 `read_me.txt` 见 [`LICENSES/cupnooble-sprout-lands-ui-pack.md`](LICENSES/cupnooble-sprout-lands-ui-pack.md) |
| 是否允许商业使用 | **否**，免费版仅限非商业项目；商业需购买 Premium 或联系作者 |
| 是否需要署名 | 官方页面写 `Please Credit : Cup Nooble`；建议署名 |
| 是否允许修改 | 是 |
| 是否允许重新分发 | **否**，修改后也不得转售/再分发 |
| 导入日期 | 2026-11-25 |
| 文件目录 | `ui/cupnooble-sprout-lands-ui-pack/`（25 个文件；官方 zip 143,623 字节） |
| 适用场景 | 按钮、对话框/气泡、emoji、天气图标、库存 UI、像素字体 |

实际内容：23 个 PNG、1 个 TTF、`read_me.txt`。最大图为 `Emoji_Spritesheet_Free.png` 160×608；`speech_bubble_grey.png` 448×192；按钮/库存 sprite sheets 112×336 至 368×336 不等。字体包含 PNG 图集与 `pixelFont-7-8x14-sproutLands.ttf`。无角色动画、Tile/Tileset、地图；无重复与缓存文件。

---

## 素材包 6：Humanoid Asset Pack [16x16]（DeepDiveGameStudio）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Humanoid Asset Pack [16x16] |
| 作者 | DeepDiveGameStudio |
| 官方下载地址 | https://deepdivegamestudio.itch.io/humanoid-asset-pack |
| 授权类型 | 作者自定义许可，非 CC0；官方页面原文见 [`LICENSES/deepdivegamestudio-humanoid-asset-pack.md`](LICENSES/deepdivegamestudio-humanoid-asset-pack.md) |
| 是否允许商业使用 | 是 |
| 是否需要署名 | 否（`Attribution is not required but appreciated`） |
| 是否允许修改 | 是 |
| 是否允许重新分发 | **否**，禁止原样或修改后 `Resell, repackage or redistribute` |
| 导入日期 | 2026-11-25 |
| 文件目录 | `characters/deepdivegamestudio-humanoid-asset-pack/`（48 个文件；官方 zip 64,032 字节） |
| 适用场景 | 16×16 俯视角人形角色动画：goblin、lizardfolk、halfling 等 |

实际内容：15 组角色动画，每组含 `.aseprite` 源文件 + `.gif` 动画预览 + PNG 帧/待机图；动画帧图多为 64×16。另有 1x / 2x / 4x 汇总图（90×54 / 180×108 / 360×216）。18 个 PNG、15 个 Aseprite、15 个 GIF。无 Tile/Tileset、地图、字体或音效；无重复与缓存文件。

---

## 素材检查汇总

| 检查项 | 结果 |
| --- | --- |
| 文件完整性 | 六套官方 zip 均通过 CRC 校验（`zipfile.testzip()` 无坏文件），解压文件与 zip 目录一致 |
| 图片格式 / 尺寸 | 六套 PNG 均可解析签名与 IHDR；详见各包小节，未发现损坏图片 |
| Sprite Sheet | Kenney 14×7；2dPig 素材总表；Antea `0-Tileset.png`；Glint 分类 spritesheets + `index.json` / `.csv`；Cup 多张 UI/emoji sheets；Humanoid 64×16 角色帧图 |
| 角色动画 | 2dPig 仅有 Aseprite 源且 Tags=0；Humanoid 有 15 组 GIF + Aseprite 动画；其余包无 |
| Tile / Tileset / 地图文件 | Antea 有 `0-Tileset.png`；Glint 有地板/墙 tiles 与索引；其余为 sprite sheet，无 TMX/地图文件 |
| 字体 / 音效等其他资源 | Cup 含 1 个 TTF 字体；其余无字体/音效；Humanoid 含 GIF 动画预览 |
| 重复文件 | Kenney 2 组（原包设计）、Glint 32 组（outline/no_outline 原包设计）；其余无。全部未去重 |
| 缓存 / 临时文件 | 无 `Thumbs.db` / `.DS_Store` / `__MACOSX` / `.tmp` / `.log` / `.bak`；zip 本身留在仓库外 |

## 前端使用建议

1. **办公室场景**优先用 Antea（16/32px 家具设备）与 2dPig（角色、动物、示例场景）；Glint 可补 16×16 室内地板/墙/家具，但注意其禁止再分发条款。
2. **UI / 状态气泡**用 Cup Nooble：按钮、对话框、emoji、天气图标和像素字体；免费版只能用于非商业项目，商业化需换 Premium 或取得授权。
3. **16×16 人物动画**用 DeepDiveGameStudio Humanoid：15 组 GIF/Aseprite 动画；禁止把素材本身再分发。
4. **不要使用 Kenney `pixel-pack`**：它只有 1×1 像素，仅作为本批指定原始包留存。
5. 所有资源路径按 Vite `public` 规则为 `/assets/pixel/...`。本库只建素材，不接入页面、不改现有场景、不决定最终美术风格。
6. 对外发布仓库前，请项目所有者复核 Glint / Cup / Humanoid 的“禁止再分发”条款；当前入库是按用户明确指示执行。

## 本轮边界

未修改游戏逻辑、前端组件、引擎配置、现有场景或既有素材文档；未执行全量测试；未合并 main。
