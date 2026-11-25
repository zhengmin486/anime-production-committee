# 素材盘点（2026-11-24）

> **2026-11-25 增量说明：** 以下第 0–7 节保留 `main@4d62bb3` 的历史盘点快照，不代表当前 WP10 工作分支。当前新增 6 套许可明确的第三方素材库，共 1 871 个文件、1 417 张 PNG、2 185 225 字节（2.08 MiB）；来源、许可、固定镜像提交、排除项及逐文件 SHA-256 见 [`apps/web/public/assets/vendor/MANIFEST.json`](../apps/web/public/assets/vendor/MANIFEST.json)，接入说明见 [`ASSET_CATALOG.md`](ASSET_CATALOG.md) 的 2026-11-25 小节。因此下文“只有 3 张 PNG”“其余素材类目全空”等结论仅适用于该历史基线。

- 盘点日期：2026-11-24 · 基线 `main@4d62bb3`
- 盘点范围：`main` 全部 git 追踪文件 + 全部远端分支 + `.gitignore` + `apps/web/src/**` 的全部引用点 + `docs/**` 的全部图片链接
- 方法：文件枚举与 `sha256sum` 核对、逐张目视检查成品、`grep` 定位真实引用行号、脚本遍历文档图片链接判断可达性
- 口径：本文只写**实测可核查**的事实。既有 `docs/ASSET_CATALOG.md` 与本文不一致的地方集中登记在第 7 节，不在这里重复叙述旧结论。

## 0. 一页结论

**仓库里真正可用的游戏素材只有 3 张 PNG 和 1 个 favicon.svg，合计约 2.07 MiB；其余素材类目全空。** 图标全部复用 `lucide-react`，背景与纸物质感几乎全部由 CSS 实现，没有字体文件。三张图已入库、已接入页面、逐张有审计 sidecar，但**授权只到「仓库负责人对本项目的使用授权」，不是商用许可**，且原图已删除、处理脚本未入库，素材不可复现。

多项目重构（`docs/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md`）之后，现有素材量与新玩法的差距是结构性的，而且不只是数量：**4 名在册员工一张头像都没有**——唯一入库的 `producer.png` 不对应任何契约角色；**12 个企划目录项在界面上完全没有配图**（整站只有 3 个 `<img>`）；`posters`、`items`、`effects`、`audio` 四个目录全空。详见第 5 节。

另一个必须记录的结论是**台账本身不可信**：既有素材记录与仓库实际存在 8 处不符（过期哈希、9 个死链接、错误的像素尺寸、与代码脱节的图标表等），本次已逐项改正并登记在第 7 节。

## 1. 位图素材总账

git 追踪的图形文件共 **7 个**：3 张游戏素材 + 1 个 favicon + 3 张验收截图。

### 1.1 游戏素材（`apps/web/public/assets/`）

| 素材 | 路径 | 尺寸 | 体积 | 色彩 | SHA-256（前 12） |
| --- | --- | --- | ---: | --- | --- |
| 办公室背景 | `backgrounds/studio_office.png` | 1280×720 | 973 117 B | 8-bit RGB，无 alpha | `4cb2341abe2a` |
| 制作人头像 | `characters/producer.png` | 512×512 | 316 020 B | 8-bit RGB，无 alpha | `b03e148d91f0` |
| 制作示意单帧 | `production/colored_frame.png` | 960×540 | 884 506 B | 8-bit RGB，无 alpha | `ed338ddedfac` |

每张图旁有同名 `.png.audit.json`，记录源文件路径、源尺寸、裁切矩形、源/成品 SHA-256、处理链与水印处置。**三个 sidecar 里的 `output_sha256` 与仓库真实字节逐一相符。**

**分支核查**：37 个远端分支中，唯一与 `main` 存在图形文件差异的是 `origin/feat/9-self-generated-assets`（三图入库的源分支），且三张 PNG 在该分支与 `main` 上的 git blob 完全相同。**没有任何分支携带额外或不同版本的素材**，因此本表就是全仓库素材总量。

### 1.2 引用点（实测行号）

| 素材 | 引用位置 | 呈现 |
| --- | --- | --- |
| `studio_office.png` | `apps/web/src/styles/index.css:221` | `.studio-heading::before` 底纹，`center / cover`，**opacity .18** |
| `producer.png` | `apps/web/src/pages/StudioPage.tsx:66` | `.studio-portrait`，CSS **56×56**，≤720px 时 44×44，`object-fit: cover` |
| `colored_frame.png` | `apps/web/src/pages/HomePage.tsx:25` | `.sheet-frame`，`aspect-ratio 16/9`，`object-fit: cover` |
| `colored_frame.png` | `apps/web/src/pages/StudioPage.tsx:118` | `.settlement-still`，`max-width 420px` |
| `favicon.svg` | `apps/web/index.html:8` | `rel="icon" type="image/svg+xml"` |

`colored_frame.png` 被两个页面复用，浏览器只请求一次。三张图均无 `loading="lazy"`、无 `srcset`、无响应式变体；`studio_office.png` 以 950 KB 的原图承担一个 18% 透明度的标题区底纹。

### 1.3 目视核验结果（2026-11-24 逐张查看成品）

- **办公室**：蜂蜜木地板、米白墙、左侧大窗城市天际线、软木板贴空白分镜纸、白板、书架与绿植、四张透写台。中央通道与前景地面留白充足，适合叠 UI。**未发现可读文字、商标、水印。** 软木板与白板上的笔画是不可辨识的伪文字形，不构成字符或标识。
- **制作人**：中年男性，眼镜、鬓角灰发、米褐西装外套 + 薄荷绿针织衫 + 米白衬衫，暖米色纯色背景，左上暖光，头肩构图。**未发现文字与水印。** 注意：成品配色是**米褐外套**，而 `docs/asset_prompts.json` 记录的 2026-11-20 提示词要求的是「深海军蓝外套 + 珊瑚口袋点缀」，且 11-22 提示词未提眼镜——成品与文档描述存在偏差，见第 7 节 D8。
- **制作示意**：短深色发人物、薄荷短披风、珊瑚围巾、方形挎包、手持卷轴，向右跨过低桥，左侧大树、右侧拱门浮岛、远处浮空岛与云。**未发现文字与水印。** 人物外形偏少年，若日后用作「本作画面」以外的角色素材需另行确认年龄设定。

三张图共用暖木色 / 米白 / 薄荷 / 珊瑚 / 柔蓝基调，风格一致性成立。

## 2. 图标

- **唯一来源：`lucide-react@0.468.0`**（ISC 许可，原文保留在 `docs/ASSET_CATALOG.md`「功能图标继续复用 Lucide」一节末尾）。许可要求：所有副本保留版权声明与许可声明。
- 实测 **13 个去重图标、14 处 JSX 用法、分布在 4 个文件**：

| 文件 | 图标 |
| --- | --- |
| `apps/web/src/App.tsx:1` | `Clapperboard`、`RotateCw` |
| `apps/web/src/components/StatusBadge.tsx:1` | `CircleCheck`、`CircleAlert`、`LoaderCircle` |
| `apps/web/src/pages/HomePage.tsx:1` | `ArrowUpRight`、`FolderOpen` |
| `apps/web/src/pages/StudioPage.tsx:2` | `ArrowLeft`、`ArrowRight`、`Coins`、`Save`、`FolderOpen`、`FileText`、`Flag` |

- 全部图标带 `aria-hidden="true"`，尺寸 15–22px，颜色由 `currentColor` 继承。**仓库没有自绘图标 SVG、没有图标 sprite、没有图标字体。**
- `docs/ASSET_CATALOG.md` 修改前的图标表列出 9 个「已验证」导出，其中 **7 个从未出现在代码里**（`CalendarDays`、`Users`、`ChartNoAxesCombined`、`Sparkles`、`Zap`、`TrendingUp`、`Trophy`）；代码实际使用的 13 个中有 **11 个未被该表记录**。差异登记见第 7 节 D6。

## 3. 背景与视觉

**位图背景只有 1 张**（`studio_office.png`，且仅作 18% 底纹）。其余观感全部由单一样式文件 `apps/web/src/styles/index.css`（234 行手写 class，Tailwind 只有一行 `@import "tailwindcss"`，未使用原子类）实现：

| 效果 | 实现 | 位置 |
| --- | --- | --- |
| 全站横线稿纸纹 | `linear-gradient(var(--rule) 1px, transparent 1px)` + `background-size: 100% 32px` | `index.css:26` |
| 企划卡方格绘图纸 | 双层 `linear-gradient` + `background-size: 16px 16px` | `index.css:56` |
| 纸片错位投影 | 双 `box-shadow` + `transform: rotate(1.5deg)` | `index.css:53` |
| 红色「筹备中」印章 | `border: 2px solid` + `rotate(-7deg)` | `index.css:64` |
| 四角取景框 | 4 个绝对定位边框块 | `index.css:58-60` |
| 焦点环 / 强调色 | `outline: 3px solid var(--site-accent)` | `index.css:30` |

设计 token（`:root`，共 8 色 + 2 字族 + 3 缩放变量）：`--site-bg #f4f1e8`、`--site-fg #303931`、`--site-accent #a43c2d`、`--site-on-accent #fffaf2`、`--site-surface #fffdf7`、`--site-muted #656b61`、`--site-border #c9cbbd`、`--rule`（border 25% 透明混合）；`--site-space`/`--site-type`/`--site-motion` 为倍率变量，由 `.动画制作委员会.qoder.site` 声明的 `appearance/radius/spacing/typography/motion` 能力驱动。**favicon 主色 `#b14332` 与页面强调色 `#a43c2d` 不是同一个红**，属于未收敛的小差异。

## 4. 字体

**没有字体文件，没有 `@font-face`，没有外部字体 CDN。** 只用系统栈：

- 正文 `--site-font`：`"Noto Sans CJK SC", "Microsoft YaHei", sans-serif`
- 标题 `--display-font`：`"Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif`

好处是零体积、零字体授权问题；代价是非中文 Windows / Linux / macOS 环境会回落到系统默认字体，标题的宋体观感不可控。`font-synthesis: none` 已禁用伪粗体合成。

## 5. 空目录与多项目下的素材缺口

`apps/web/public/assets/` 有 7 个类目占位（`.gitkeep`），加 `public/wasm/.gitkeep` 共 8 个占位文件。

| 类目 | 现有 | 状态 |
| --- | ---: | --- |
| `backgrounds/` | 1 | 仅办公室；会议室在旧记录里算备用但未入库 |
| `characters/` | 1 | 仅 1 张制作人头像，且只出现在制作台标题区（`StudioPage.tsx:66`）；4 名在册员工的卡片没有任何头像图 |
| `production/` | 1 | 1 张单帧复用于首页说明卡与结算区两处，五个阶段没有各自画面 |
| `posters/` | 0 | **空**；企划卡是纯文字，无任何封面图 |
| `items/` | 0 | **空** |
| `effects/` | 0 | **空** |
| `audio/` | 0 | **空**；代码里也没有任何音频加载 |

### 5.1 素材与角色契约的错位（本次盘点最重要的发现）

素材缺口不只是数量，命名和身份也已经与契约脱节，先把这一层钉住再谈生成。

契约角色枚举是 7 个（`apps/web/src/types/gameV3.ts:22`）：`director`、`scriptwriter`、`animation_director`、`key_animator`、`animator`、`production_manager`、`postproduction`。
运行时名册是 4 人（`packages/game-core/include/game_rules.hpp:71-76`）：林导演 `director`、陈原画 `key_animator`、许动画 `animator`、周摄影 `postproduction`。
而素材计划里的 6 个头像 id 是 `producer`、`director`、`animation_supervisor`、`key_animator`、`inbetween_animator`、`production_coordinator`。

| 名册/契约角色 | 头像是否对得上 | 说明 |
| --- | --- | --- |
| `director`（林导演） | 有备用图，**未入库** | `director.png` 只在 `.tools/` |
| `key_animator`（陈原画） | 有备用图，**未入库** | `key_animator.png` 只在 `.tools/` |
| `animator`（许动画） | 有备用图，**未入库且命名不一致** | 素材叫 `inbetween_animator`，契约叫 `animator` |
| `postproduction`（周摄影） | **完全没有** | 6 张头像计划里不含摄影/后期岗位 |
| `scriptwriter` | **完全没有** | 契约角色，无对应形象 |
| `animation_director` | 命名不一致 | 素材侧叫 `animation_supervisor`（作画监督） |
| `production_manager` | 命名不一致 | 素材侧叫 `production_coordinator`（制作进行） |
| `producer` | **契约里不存在这个角色** | 却是唯一入库的头像，当前作为制作台标题区的通用「制作人」形象 |

结论：**入库的那 1 张头像不对应任何一名员工，而 4 名在册员工目前一张头像都没有。** 前端也还没有任何「员工 → 头像」的映射代码（`StudioPage.tsx` 只在标题区硬编码了一张 `producer.png`），所以这不是「素材没接上」而是「素材身份与契约角色两套命名尚未对齐」。批量补图之前必须先定这张映射表，否则会再生成一批对不上岗位的图。

### 5.2 缺口按依赖顺序

1. **角色映射表 + 员工头像差量**（`characters/`）：先定 `staff_id → 文件名` 与角色命名（`animation_director` vs `作画监督` 等），再按名册补齐。至少需要 4 张在册员工头像，且要与入库制作人的画风锚一致——注意入库成品（米褐外套 + 眼镜）与备用图风格锚（深海军蓝外套）已经漂移，见第 7 节 D8。
2. **企划封面差量**（`posters/`）：企划目录有 **12 个企划**（`game_rules.hpp:85` 起），而 `posters/` 为 0——`StudioPage.tsx:124-134` 的企划卡由 `scale/source`、名称、拨款、工期、质量、受众和合作模式**六行文字加一个按钮**组成，一张图都没有。多项目并行后，企划列表只能靠文字区分；若要给每张卡配封面，需要 12 张与企划体量/题材对应的图，而不是把 `colored_frame.png`（那是结算区《本作制作示意》的单帧）铺到所有卡上。
3. **阶段与渠道图标**：五阶段与 BD / 玩具 / 电视 / 海外等渠道全靠文字，`items/` 为空；这部分可以继续用 Lucide，不必自绘。
4. **背景差量**（`backgrounds/`）：多项目并行后「公司」与「项目现场」需要可区分场景。
5. **音频**：完全未起步，且没有任何加载代码，属于功能与素材同时缺失，不是单纯缺文件。

## 6. 来源、处理与授权边界

- 三张正式图 **2026-11-22 由 WorkBuddy ImageGen 自生成**，记录在 `docs/asset_prompts.json` 的 `self_generated_batch_2026_11_22`；`underlying_image_provider` 与 `underlying_model` 均为 `null`，即**底层图像服务商与模型版本未知**。
- 生成器在右下角打了「AI 生成」标记，处置方式是**顶部对齐裁掉底部条带**（`watermark_removal: "generator mark in bottom-right was excluded by the crop; no inpainting"`），未修图、未修复。成品视觉无水印，但这属于「移除生成标识」，若发布平台要求显式 AI 标识，需要重新评估。
- 处理链只用 Python 标准库（zlib 解码 + 滤波还原 + 裁切 + 双线性缩放 + 24 位不透明 RGB 重编码）。**该脚本没有提交进仓库**：`scripts/` 下无任何素材处理或素材校验脚本，`verify:dist` 也不检查素材。
- **原图已删除**（`source_retained: false`，2026-11-22 为省本地空间删除），改裁切只能凭提示词重新生成 → 素材不可复现、不可重裁。
- 授权口径原文：**"Project-internal authorization granted by the repository owner, not a general commercial licence claim."** 即仓库负责人授权项目内使用，**不等于可商用、可修改、可分发、免署名**。
- `docs/ASSET_CATALOG.md`「来源、版权与正式入库边界」一节记录 2026-11-20 查过 Qoder 服务条款（§3.2 Outputs 含图像、§5.1.1 有权利转让但受回授条款约束、§8.2 需遵守第三方附加条款），结论是**完整适用条款仍待核查**；11-22 这批用的是另一个工具（WorkBuddy），其条款**没有对应的核查记录**。
- 跟踪议题 [#9 初期三图授权与接入准备](https://github.com/zhengmin486/anime-production-committee/issues/9) 仍为 **open**，负责人 pyxz0 于 2026-11-23 明确「不关闭为三图接入完成」，阻塞在 `npm run build` / `verify:dist` / `test:browser` 需要 emsdk 环境。

## 7. 与既有记录的差异登记

下表「既有记录」列里的行号指 **2026-11-24 修改前**的 `ASSET_CATALOG.md`；本次已按「处置」列改正，修改后行号会整体上移，因此这些行号只用于定位历史说法，不再作为当前引用。

| 编号 | 既有记录的说法 | 实测 | 处置 |
| --- | --- | --- | --- |
| D1 | `ASSET_CATALOG.md:31` 让读者到 `asset_prompts.json` 查哈希 | 该 JSON 里三个 `output_sha256`（`8d2fbbd1…`/`5d631615…`/`6805d7be…`）**与仓库真实字节不符**；sidecar 的哈希才相符 | 已在本次修正 JSON 哈希，并把「以 sidecar 为准」写进目录 |
| D2 | `ASSET_CATALOG.md:37` 声称「以下链接指向实际存在的文件」 | `:41-43`、`:59-64` 共 **9 个链接指向被 gitignore 的 `.tools/`**，克隆后全部打不开（脚本遍历确认：图片链接 6 个可达、9 个失效） | 已改为「仅存在于本机、不随仓库同步」的中性表述，去掉误导性链接声明 |
| D3 | `ASSET_CATALOG.md:163` 头像 64px、375 视口 48px | CSS 实为 **56px**，`@media (max-width: 720px)` 时 **44px** | 已按代码改正 |
| D4 | `ASSET_CATALOG.md:179` 单测 225/225 | Issue #9 的 2026-11-23 交付评论为 247/247 | 保留两处历史数字，补注「同一批接入的不同时点」，避免当成矛盾 |
| D5 | `TEAM_DELIVERABLES/ASSET_MODULE.md` 状态「待负责人推进」，素材范围表把三图写成 `.tools/` 本地文件 | 三图已在 `b3eee2a` 入库、`21547d2` 接入、`fdcb3f9` 补证据 | 已更新为真实现状，剩余项收敛为授权证据 + emsdk 补跑 |
| D6 | `ASSET_CATALOG.md:124-135` 图标表 9 项 | 代码用 13 项，与表中仅 2 项重合（`Coins`、`Clapperboard`） | 已改为「代码在用图标」实况清单，并把未用的 7 项另列为候选 |
| D7 | `asset_prompts.json` 同一文件里 `current_delivery.official_public_assets_count: 0` 与 `self_generated_batch_2026_11_22.official_public_assets_count: 3`；`planned_assets` 16 张与 `recommended_generation_order` 仍在 | 两个数字分属 11-20 与 11-22 两个时点，均非当前口径；16 张计划已被 `ASSET_CATALOG.md`「当前范围与结果」废止 | 历史字段值不删除，新增顶层 `records_status` 声明其为历史记录且不可作为生成清单；`E:/vibe_images/…` 私有路径标注不可访问 |
| D8 | `asset_prompts.json` 11-20 提示词要求制作人「深海军蓝外套 + 珊瑚口袋」，11-22 提示词未提眼镜 | 入库成品是**米褐外套 + 薄荷针织衫 + 眼镜**，无珊瑚点缀 | 不修改历史提示词；在本文与目录中标注成品与描述偏差，供后续头像批量生成前决定是否重定风格锚 |

## 8. 发布前必须补的项

1. **授权证据**：11-22 这批（WorkBuddy ImageGen）的适用输出条款从未核查；需逐图给出商用 / 修改 / 分发 / 署名 / 是否允许公开仓库共享的结论，未知项标阻塞。
2. **AI 标识政策**：确认目标发布平台是否要求保留生成标识；若要求，现有「靠裁切去除」的做法需要重做。
3. **可复现性**：素材处理脚本与源图都不在仓库，需要么补脚本入库、要么明确声明「成品唯一、不可重建」。
4. **emsdk 环境补跑**：`npm run build`、`npm run verify:dist`、`npm run test:browser` 三条命令，#9 在此之前不关闭。
5. **素材校验**：建议新增最小校验脚本（存在性 + 尺寸 + SHA 与 sidecar 一致 + 文档链接可达），把 D1/D2 这类失真挡在合入前。本次未新增脚本，仅在待办中登记。
6. **同类死链接**：`docs/TEAM_DELIVERABLES/` 下另有 5 份交付文档（CORE_VALIDATOR、EVENT_MODULE、PLANNING_MODULE、SAVE_STATE_RESTORE、STAFF_MODULE）使用 `../../issues/N` 相对链接，克隆后解析到不存在的 `docs/issues/N`。本次只把 `ASSET_MODULE.md` 的 #9 链接改成仓库 URL（该文件本就在改动范围内），其余 5 处属于同一次清理更合适，建议单独一个 PR 统一处理。

## 9. 盘点用命令（可复现）

```bash
# 图形文件与体积
git ls-files | grep -Ei "\.(png|jpg|jpeg|webp|gif|svg|mp3|wav|ogg|ttf|otf|woff2?)$"
sha256sum apps/web/public/assets/*/*.png
file apps/web/public/assets/*/*.png docs/evidence/assets/*.png

# 引用点
grep -rn "<img\|url(" apps/web/src apps/web/index.html

# 图标实况
grep -rn "from 'lucide-react'" apps/web/src

# 文档图片链接可达性（本次盘点修改前实测 6 可达 / 9 失效；修正后 6 可达 / 0 失效）
python - <<'PY'
import re, pathlib
img = re.compile(r'\]\(([^)]+\.(?:png|jpg|jpeg|webp|gif|svg))\)')
for f in list(pathlib.Path('docs').rglob('*.md')) + [pathlib.Path('README.md')]:
    for i, line in enumerate(f.read_text(encoding='utf-8').splitlines(), 1):
        for m in img.finditer(line):
            print('OK ' if (f.parent / m.group(1)).resolve().exists() else 'DEAD', f'{f}:{i}', m.group(1))
PY
```
