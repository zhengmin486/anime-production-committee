# 统一像素素材库目录（第一批）

导入日期：2026-11-25  
分支：`feature/pixel-art-assets`（基于 `main@31cf81c`，Draft PR #102）

本批结果：**2 套目标素材均已从官方地址下载成功并导入，没有使用任何替代素材或预览图。** 2dPig 包于 2026-11-25 22:28 在用户开启新代理端口（HTTP 9910 / SOCKS5 9909）后下载成功；此前失败尝试与最终成功路径均如实记录在 [`LICENSES/2dpig-pixel-office.md`](LICENSES/2dpig-pixel-office.md)。

## 目录布局

仓库已有前端素材根目录 `apps/web/public/assets/`（含 `backgrounds/`、`characters/`、`items/`、`production/` 等，记录见 [`docs/ASSET_CATALOG.md`](../../../../../docs/ASSET_CATALOG.md)）。为「避免重复建立素材目录」，本批**复用该根目录**，只新增 `pixel/` 子库，不新建顶层 `assets/`，不改动任何现有素材或文档：

```text
apps/web/public/assets/pixel/
├── ASSET_CATALOG.md                    本文件：来源、授权与素材清单
├── LICENSES/
│   ├── kenney-pixel-pack.md            Kenney 授权核实记录（含包内授权原文）
│   └── 2dpig-pixel-office.md           2dPig 授权核实记录（含包内授权原文）
├── general/
│   └── kenney-pixel-pack/              Kenney 原始包解压内容（未改名、未修改）
│       ├── PNG/                        98 个单图 PNG
│       ├── Spritesheet/                1 张 spritesheet
│       ├── Preview.png                 官方预览图
│       └── License.txt                 包内授权原文
└── office/
    └── 2dpig/                          2dPig 原始包解压内容（7 个文件，未改名、未修改）
        ├── PixelOffice.png             示例场景（256×224，RGBA）
        ├── LargePixelOffice.png        示例场景大图（1024×896，RGBA）
        ├── PixelOfficeAssets.png       素材总表（256×160，RGBA）
        ├── PixelOffice.aseprite        示例场景 Aseprite 源文件
        ├── PixelOfficeAssets.aseprite  素材总表 Aseprite 源文件
        ├── LICENSE.txt                 包内 CC0 授权原文
        └── README.txt                  包内内容说明
```

原始 zip 保存在任务临时目录 `E:/tmp/pixel-assets-download/`，**不入库**，避免把素材重新打包成大文件；入库的是完整解压后的原始文件，目录结构与文件名均保持原样。

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

### 实际包含什么（Kenney 素材清单）

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

## 素材包 2：Pixel Office Asset Pack（2dPig）

| 字段 | 记录 |
| --- | --- |
| 素材包名称 | Pixel Office Asset Pack |
| 作者 | 2dPig |
| 官方下载地址 | https://2dpig.itch.io/pixel-office |
| 授权类型 | CC0 / Creative Commons Public Domain Dedication |
| 授权原文 / 官方授权页面 | 官方页面 `LICENSE INFORMATION` 与包内 `LICENSE.txt` 均已取得，见 [`LICENSES/2dpig-pixel-office.md`](LICENSES/2dpig-pixel-office.md)；CC0 入口：https://creativecommons.org/publicdomain/zero/1.0/ |
| 是否允许商业使用 | 是。包内原文：`CC0 allows users to distribute, remix, adapt, and build upon the material in any medium or format, with no conditions.` |
| 是否需要署名 | 否。原文：`No attribution is required but it is greatly appreciated =).`（包内 `README.txt`；官方页面同样写明） |
| 是否允许修改 | 是。CC0 1.0 与包内 `LICENSE.txt` 明确允许 `remix`、`adapt`、`build upon` |
| 是否允许重新分发 | 是。包内 `LICENSE.txt` 明确允许 `distribute` |
| 导入日期 | 2026-11-25（22:28 下载成功） |
| 文件目录 | `office/2dpig/`（7 个文件，56,384 字节；官方 zip `PixelOffice.zip` 50,510 字节） |
| 适用场景 | 办公室角色与动物、家具、电脑、植物、装饰与示例场景；PNG + Aseprite；官方注明不是 16×16、不是 tileset |

### 实际包含什么（2dPig 素材清单）

| 内容 | 数量 | 实际规格 / 说明 |
| --- | --- | --- |
| 示例场景 PNG | 2 | `PixelOffice.png` 256×224、`LargePixelOffice.png` 1024×896，均为 8bit RGBA |
| 素材总表 PNG | 1 | `PixelOfficeAssets.png` 256×160，8bit RGBA；可直接看到 5 个人物角色、2 个动物（猫/狗）以及桌子、椅子、电脑、隔断、植物等办公室物件 |
| Aseprite 源文件 | 2 | `PixelOffice.aseprite`、`PixelOfficeAssets.aseprite`；文件头解析为 256 帧、索引色画布（224×32 / 160×32），**未定义动画标签（Tags=0）**，因此不把帧数直接当作已编排的角色动画，按静态素材源处理，需后续用 Aseprite 打开确认用途 |
| 授权 / 说明文件 | 2 | `LICENSE.txt`（CC0 原文）、`README.txt`（官方内容与授权说明） |
| 角色动画 | 未发现成组动画定义 | 包内无 `walk` / `idle` 等命名或 Tags；Aseprite 是源文件，需后续确认是否逐帧动作 |
| Tile / Tileset / 地图文件 | 无 | 官方页面明确说明不是 tileset；包内无 `.tmx` / `.json` / tileset 文件 |
| 字体 / 音效等其他资源 | 无 | 仅 `.png` (3)、`.aseprite` (2)、`.txt` (2) |
| 重复文件 | 无 | 7 个文件 SHA-256 均不相同 |

下载与授权核实路径：先通过官方 purchase 页免费入口取得签名下载 URL，再按 itch.io 官方 `/file/{upload_id}` POST 流程取得真实文件；最终 `PixelOffice.zip` 通过 ZIP CRC 校验（`zipfile.testzip()` 无坏文件），原样解压入库。失败尝试与成功细节见 [`LICENSES/2dpig-pixel-office.md`](LICENSES/2dpig-pixel-office.md)。

---

## 素材检查汇总

| 检查项 | 结果 |
| --- | --- |
| 文件完整性 | 两套官方 zip 均通过 CRC 校验（`zipfile.testzip()` 无坏文件）；解压文件与 zip 目录一致 |
| 图片格式 / 尺寸 | 共 103 个 PNG 均可解析签名与 IHDR：Kenney 98 个 1×1、1 个 14×7、1 个 918×515；2dPig 3 个 RGBA（256×224 / 1024×896 / 256×160）；未发现损坏图片 |
| Sprite Sheet | Kenney 有 1 张 14×7；2dPig 的 `PixelOfficeAssets.png` 是素材总表，非 tileset 格式 |
| 角色动画 | Kenney 无；2dPig 有 Aseprite 源文件但未定义动画标签，暂不作为可播放角色动画使用 |
| Tile / Tileset / 地图文件 | 无 |
| 字体 / 音效等其他资源 | 无；另有 2 个 `.aseprite` 源文件 |
| 重复文件 | Kenney 2 组（49 黑 + 49 白，原包设计，未改动）；2dPig 无 |
| 缓存 / 临时文件 | 无 `Thumbs.db` / `.DS_Store` / `__MACOSX` / `.tmp` / `.log` / `.bak`；zip 本身留在仓库外 |

## 前端使用建议

- **可直接用于办公室场景原型的是 2dPig 包**：入口素材总表 `/assets/pixel/office/2dpig/PixelOfficeAssets.png`，示例场景 `/assets/pixel/office/2dpig/PixelOffice.png`，放大示例 `/assets/pixel/office/2dpig/LargePixelOffice.png`；需要编辑单件素材时用同目录 `.aseprite` 源文件。
- **Kenney `pixel-pack` 只有 1×1 像素**，不要把它当作角色、家具或 spritesheet 接入页面；它只作为本批按要求下载的原始包留存。
- 现有正式素材仍以 `docs/ASSET_CATALOG.md` 记录的 3 张自生成图为准；本批只建库，不接入页面、不改现有场景、不决定美术风格。
- 若后续需要实际可用的通用像素道具，应由仓库负责人另选明确 CC0 且非愚人节包的素材包，不在本批擅自替换。

## 本批边界

未修改游戏逻辑、前端组件、引擎配置、现有场景或既有素材文档；未执行全量测试；未合并 main。
