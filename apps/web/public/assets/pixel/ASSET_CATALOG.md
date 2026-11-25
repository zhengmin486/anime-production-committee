# 统一像素素材库目录（第一批）

导入日期：2026-11-25
分支：`feature/pixel-art-assets`（基于 `main@31cf81c`，Draft PR 见仓库）
本批结果：**2 套目标素材中，1 套导入成功，1 套下载失败并如实记录。没有使用任何替代素材。**

## 目录布局

仓库已有前端素材根目录 `apps/web/public/assets/`（含 `backgrounds/`、`characters/`、`items/`、`production/` 等，记录见 [`docs/ASSET_CATALOG.md`](../../../../../docs/ASSET_CATALOG.md)）。为「避免重复建立素材目录」，本批**复用该根目录**，只新增 `pixel/` 子库，不新建顶层 `assets/`，不改动任何现有素材或文档：

```text
apps/web/public/assets/pixel/
├── ASSET_CATALOG.md                    本文件：来源、授权与素材清单
├── LICENSES/
│   ├── kenney-pixel-pack.md            Kenney 授权核实记录（含包内授权原文）
│   └── 2dpig-pixel-office.md           2dPig 下载失败与授权核实状态
├── general/
│   └── kenney-pixel-pack/              Kenney 原始包解压内容（未改名、未修改）
│       ├── PNG/                        98 个单图 PNG
│       ├── Spritesheet/                1 张 spritesheet
│       ├── Preview.png                 官方预览图
│       └── License.txt                 包内授权原文
└── office/
    └── 2dpig/                          （下载失败，目录未创建）
```

原始 zip 保存在任务临时目录 `E:/tmp/pixel-assets-download/`，**不入库**，避免把素材重新打包成大文件；入库的是完整解压后的原始文件，目录结构与文件名均保有原样。

---

## 素材包 1：Pixel Pack（Kenney）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Pixel Pack（包内 `License.txt` 标题为 `Pixel Pack`） |
| 作者 | Kenney（www.kenney.nl） |
| 官方下载地址 | https://kenney.nl/assets/pixel-pack |
| 授权类型 | Creative Commons CC0 1.0（Creative Commons Zero） |
| 授权原文 / 官方授权页面 | 包内 `License.txt` 原文见 [`LICENSES/kenney-pixel-pack.md`](LICENSES/kenney-pixel-pack.md)；官方页面 Properties 表 `License → Creative Commons CC0` 指向 https://creativecommons.org/publicdomain/zero/1.0/ |
| 是否允许商业使用 | 允许。原文：`This content is free to use in personal, educational and commercial projects.` |
| 是否需要署名 | 不需要。原文：`Support us by crediting Kenney or www.kenney.nl (this is not mandatory)`；预览图写明 `Written permission not required` |
| 是否允许修改 | CC0 1.0 允许；包内文字未单独列修改条款，见官方 CC0 法律文本 |
| 是否允许重新分发 | CC0 1.0 允许；包内文字未单独列再分发条款，见官方 CC0 法律文本 |
| 导入日期 | 2026-11-25 |
| 文件目录 | `general/kenney-pixel-pack/`（101 个文件，25,582 字节；官方 zip 38,315 字节） |
| 适用场景 | 名义上是通用像素素材、道具和装饰；**实际上该包是 2019 愚人节玩笑包，只有 1×1 像素，不能作为角色/家具/道具使用**，详见下方清单 |

### 实际包含什么（素材清单）

| 内容 | 数量 | 实际规格 |
| --- | --- | --- |
| 单图 PNG | 98 | `PNG/black01.png`–`black49.png`、`PNG/white01.png`–`white49.png`，**全部 1×1 像素**，8bit RGBA |
| Sprite Sheet | 1 | `Spritesheet/pixelSpritesheet.png`，**14×7 像素**，8bit RGBA |
| 官方预览图 | 1 | `Preview.png`，918×515，8bit palette |
| 授权文件 | 1 | `License.txt`，CC0 原文 |
| 角色动画 | 无 | 文件名与全部文件清单中均无 `anim` / `walk` / `idle` 等动画帧 |
| Tile / Tileset / 地图文件 | 无 | 无 `.tmx` / `.json` / tileset 命名文件；原包自带 spritesheet 仅 14×7 |
| 字体 / 音效等其他资源 | 无 | 全部文件仅 `.png` (100) 与 `.txt` (1) |

官方 `Preview.png` 自述：`Comes with 49 black, and 49 white pixels!`、`Actual size 1.1 pixel`、`You can build anything!`，并展示用这些 1×1 像素拼放大的车与房子。官方页面标签含 `fool`，`License.txt` 写明 `Creation date: April Fools' Day 2019`。**这与任务预设的「通用像素素材、道具和装饰」用途不符，但它是官方 `pixel-pack` 原始包的真实内容，未替换为别的 Kenney 包。**

重复文件检查：49 个黑色 PNG 内容完全相同（同一 SHA-256），49 个白色 PNG 内容完全相同（另一 SHA-256）。这是原包设计，按「不擅自修改原始文件」要求原样保留，未去重。

---

## 素材包 2：Pixel Office Asset Pack（2dPig）— 下载失败

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Pixel Office Asset Pack |
| 作者 | 2dPig |
| 官方下载地址 | https://2dpig.itch.io/pixel-office |
| 授权类型（目标） | CC0 / Creative Commons Public Domain Dedication |
| 授权原文 / 官方授权页面 | 未取得官方页面 HTML 或包内授权文件；仅有搜索引擎对官方页面的索引摘要，见 [`LICENSES/2dpig-pixel-office.md`](LICENSES/2dpig-pixel-office.md)。官方 CC0 入口：https://creativecommons.org/publicdomain/zero/1.0/ |
| 是否允许商业使用 | **未一手核实，不作结论** |
| 是否需要署名 | 索引摘要称 `No attribution is required but it is greatly appreciated`，待一手核实 |
| 是否允许修改 | 未核实 |
| 是否允许重新分发 | 未核实 |
| 导入日期 | 2026-11-25（尝试日期；未导入） |
| 文件目录 | 预期 `office/2dpig/`；因下载失败且 Git 不跟踪空目录，当前未创建 |
| 适用场景（官方页面描述，待下载核验） | 办公室家具、角色（5 个人物 + 2 个动物绘制）、电脑、植物、装饰与示例场景；PNG 与 Aseprite 格式；官方注明非 16×16、不是 tileset |

失败原因与全部尝试记录见 [`LICENSES/2dpig-pixel-office.md`](LICENSES/2dpig-pixel-office.md)：当前环境代理上游连接 itch.io 超时（HTTP 502 `upstream connect failed: connection timed out`），直连同样超时；未下载到 `PixelOffice.zip`，因此**没有文件入库，也没有用其他来源的相似素材冒充**。

---

## 素材检查汇总

| 检查项 | 结果 |
| --- | --- |
| 文件完整性 | Kenney 官方 zip 通过 CRC 校验（`zipfile.testzip()` 无坏文件），解压后 101 个文件与 zip 目录一致；2dPig 无文件 |
| 图片格式 / 尺寸 | 100 个 PNG 均可解析签名与 IHDR：98 个 1×1、1 个 14×7、1 个 918×515；未发现损坏图片 |
| Sprite Sheet | 有，`Spritesheet/pixelSpritesheet.png`（14×7） |
| 角色动画 | 无 |
| Tile / Tileset / 地图文件 | 无 |
| 字体 / 音效等其他资源 | 无 |
| 重复文件 | 2 组（49 黑 + 49 白，原包设计，未改动） |
| 缓存 / 临时文件 | 无 `Thumbs.db` / `.DS_Store` / `__MACOSX` / `.tmp` / `.log` / `.bak`；zip 本身留在仓库外 |

## 前端使用建议

- 本批**没有可直接用于办公室场景的成品素材**。2dPig 包下载失败；Kenney `pixel-pack` 只有 1×1 像素。不要把它当作角色、家具或 spritesheet 接入页面。
- 现有正式素材仍以 `docs/ASSET_CATALOG.md` 记录的 3 张自生成图为准；本批只建库，不接入页面、不改现有场景、不决定美术风格。
- 路径按 Vite `public` 规则为 `/assets/pixel/general/kenney-pixel-pack/...`。若后续 2dPig 下载成功，路径为 `/assets/pixel/office/2dpig/...`。
- 下批优先事项：在网络可访问 itch.io 的环境补下 2dPig `PixelOffice.zip`；若需要实际可用的通用像素道具，应由仓库负责人另选明确 CC0 且非愚人节包的素材包，不在本批擅自替换。

## 本批边界

未修改游戏逻辑、前端组件、引擎配置、现有场景或既有素材文档；未执行全量测试；未合并 main。
