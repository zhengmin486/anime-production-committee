# 开发初期游戏美术素材

更新日期：2026-11-25（本文保留 2026-11-20 与 2026-11-22 两批历史记录，仅修正与仓库实际不符的条目）。

> 2026-11-24 已对全仓库图片、图标、背景、字体与空素材目录做过一次逐项实测盘点，结论、哈希、引用行号与差异登记见 [ASSET_INVENTORY_2026-11-24.md](ASSET_INVENTORY_2026-11-24.md)。本文与盘点冲突处以盘点为准。

## 2026-11-25 第三方像素素材库

按用户给出的 8 个素材页核对许可后，将 **6 套可随仓库分发的素材库**放入 [`apps/web/public/assets/vendor/`](../apps/web/public/assets/vendor/)，共 1 871 个文件、1 417 张 PNG、2 185 225 字节（2.08 MiB）。原文件均未修改；许可文件、源站、镜像提交和逐文件 SHA-256 见 [`vendor/MANIFEST.json`](../apps/web/public/assets/vendor/MANIFEST.json)。

| 素材库 | 目录 | 作者 | 许可 | 获取方式 |
| --- | --- | --- | --- | --- |
| Pixel Office | `vendor/pixel-office/` | 2dPig | CC0-1.0 | 固定提交 `5af997159f4e` 的 GitHub 镜像；保留包内许可与地板/墙面来源说明 |
| Pixel Adventure | `vendor/pixel-adventure/` | Pixel Frog | CC0-1.0 | 固定提交 `fb168c3a1efc` 的 Godot 素材镜像；仅取 PNG，许可声明见 `SOURCE_README.md` |
| Pixel Pack 1.0 | `vendor/kenney-pixel-pack/` | Kenney | CC0-1.0 | Kenney 官网签名下载，保留 `License.txt` |
| Tiny Town 1.1 | `vendor/kenney-tiny-town/` | Kenney | CC0-1.0 | Kenney 官网签名下载，保留 `License.txt` |
| UI Pack 2.0 | `vendor/kenney-ui-pack/` | Kenney | CC0-1.0 | Kenney 官网签名下载，保留 PNG、SVG、字体、音效和许可 |
| Pixel Art Top Down - Basic | `vendor/cainos-top-down-basic/` | Kwangsik Song / Cainos | MIT | 固定提交 `61c9b4eb1ca9` 的 GitHub 镜像；仅取 9 张纹理 PNG 和许可 |

已接入四场景原型：

- `pixel-office/LARGE_PLANT.png`：办公室与工作室绿植，按地板基点定位。
- `pixel-office/COFFEE.png`：办公室四张桌面的咖啡杯，保持桌面承载关系。
- `pixel-adventure/Items/Boxes/Box1/Idle.png`：工作室后墙资料箱，按地板基点定位并保留遮挡排序。

接入位置为 [`apps/web/src/prototype/PixelScenes.tsx`](../apps/web/src/prototype/PixelScenes.tsx)。没有把正面办公桌、俯视地板或平台跳跃人物强行放进等距房间；完整素材库仍可通过 `/assets/vendor/` 直接引用。

**未入库的 2 套：**

- Modern Office Tileset 16x16 免费样张：随样张提供的许可允许在商业/非商业项目中使用和修改，但明确禁止作为素材转售或再分发，因此不把源 PNG 放进公开仓库。
- flojiq Office Assets：未取得可验证的再分发许可或购买授权，不从未授权镜像复制原文件。

这两套的源站、限制和已核对镜像提交同样记录在 `vendor/MANIFEST.json` 的 `excluded` 中。素材库下载不等于全部接入游戏，也不等于商业发行授权审查已经完成。

## 当前范围与结果

按用户最新要求，先只整理开发初期需要的 **3 张图片**，停止新增生成，不再追求完整 16 张素材库。

- 当前美术标准：温暖、协调、好看且实际可用的 **日式 16-bit 像素风插画**。固定 320×180 逻辑网格、24 色和绝对禁用抗锯齿等旧要求已取消，不能再用它们淘汰可用图片。
- 初期包：办公室背景、制作人头像、单张动画制作示意；均有真实 PNG，并完成原图及尺寸整理后的逐张视觉检查。
- 用户允许复用已有图，故救回首版办公室，不再生成办公室来替代它。
- 收窄范围之前已生成的会议室和其余 5 名员工头像共 **6 张保留备用**，不删除、不继续扩展。
- 原画、中间稿、分镜、4 张海报、道具、特效、音频暂不制作。没有把延期内容当作当前欠交任务。
- 只改素材整理和记录，未修改 React、游戏逻辑、C++、构建配置或应用依赖；未接入页面、提交、推送或发布。

**美术验收与授权核查分开：2026-11-20 的 3 张初期图通过视觉和规格检查，但适用输出授权仍待核查。2026-11-22 按仓库负责人授权另行自生成 3 张并入库，正式发布目录现有 3 张（见下节）；那是项目内授权，不是通用商用许可结论。**

## 2026-11-22 自生成三图（正式发布目录）

授权前提：仓库负责人 2026-11-22 指示素材负责人可自行生成，或改用无需授权的公共素材。本批只走自生成，没有下载、修改或再分发任何第三方素材。

| 素材 | 文件 | 用途 | 尺寸 / 格式 | 状态 |
| --- | --- | --- | --- | --- |
| 办公室背景 | [studio_office.png](../apps/web/public/assets/backgrounds/studio_office.png) | 公司主场景，前景区留白可叠 UI 与人物 | 1280×720 / PNG | 已入库，视觉通过 |
| 制作人头像 | [producer.png](../apps/web/public/assets/characters/producer.png) | 员工 / 企划卡片的人物基准 | 512×512 / PNG | 已入库，视觉通过 |
| 制作示意 | [colored_frame.png](../apps/web/public/assets/production/colored_frame.png) | 虚构作品《浮岛天气信使》的单帧画面 | 960×540 / PNG | 已入库，视觉通过 |

- 三张均由 WorkBuddy ImageGen 生成；背景与制作示意生成尺寸 1536×1024，头像 1024×1024。
- 生成器在右下角打了「AI生成 / WORKBUDDY」标记，统一用**顶部对齐裁切**把标记所在的底部条带裁掉，没有修图、补绘或局部重生成。
- 处理链只用 Python 标准库：PNG 解码（zlib + 滤波还原）、裁切、双线性缩放、输出不透明 24 位 RGB。没有为此安装第三方图像库。
- 每张图旁有 `.png.audit.json`，记录源文件、裁切矩形、最终尺寸与源/成品 SHA-256；完整提示词与授权说明见 [asset_prompts.json](asset_prompts.json) 的 `self_generated_batch_2026_11_22`。**成品哈希以 sidecar 为准**：2026-11-24 实测三个 sidecar 的 `output_sha256` 与仓库字节逐一相符，而 JSON 早前记录的三个哈希对应的是另一次编码输出，已按实际字节改正。
- 视觉复核：无可读文字、无商标、无水印；人物头肩与四肢结构可读，家具透视正常；三图共用蜂蜜木色 / 米白 / 薄荷 / 珊瑚的暖色基调。
- **边界**：这是仓库负责人对本项目的使用授权，不是通用商用许可结论，也不把 AI 生成等同于 CC0。2026-11-20 那批 `.tools/` 图片仍在本地、未入库、授权未核查，不再是正式素材来源。

## 开发初期三张图（2026-11-20 本机评估包）

本地评估包根目录：`.tools/asset_review/early_development/`。**`.tools/` 被 `.gitignore` 忽略，只存在于素材负责人本机，克隆仓库后这些文件不可获取**，因此本节不再提供文件链接，只保留历史记录。当前正式发布在仓库里的三张图见上文「2026-11-22 自生成三图」。

| 素材 | 本机路径（不随仓库同步） | 用途 | 尺寸 / 格式 | 美术审核 | 授权 |
| --- | --- | --- | --- | --- | --- |
| 办公室背景 | `.tools/asset_review/early_development/backgrounds/studio_office.png` | 公司主场景，中央留白供日后叠加员工或 UI | 1280×720 / PNG | 通过；复用首版 | 待核查 |
| 制作人头像 | `.tools/asset_review/early_development/characters/producer.png` | 验证单个人物卡片、角色介绍的视觉效果 | 512×512 / PNG | 通过；人物基准 | 待核查 |
| 制作示意图 | `.tools/asset_review/early_development/production/colored_frame.png` | 展示一个原创动画画面，不表示完整制作阶段系统 | 960×540 / PNG | 通过 | 待核查 |

### 实际检查结论

- **办公室**：暖木色地板、米白墙面、蓝色城市窗景、薄荷绿和少量珊瑚色、明确的动画工位与透写台；中央留白充足。裁切后窗户、家具和主通道保持完整。旧名称包含 `rejected` 只反映已废止的严格网格审核，不是当前视觉结论。
- **制作人**：成熟商务休闲形象、面部结构清晰、左上方暖光、米色简洁背景；侧转视角和像素风轮廓与办公室协调。实际构图包含肩部和上胸，供人物卡片使用，不是动作精灵或透明立绘。
- **制作示意**：原创“浮岛天气信使”，短深色头发、薄荷色短披风、珊瑚色围巾、方形挎包；向右跨过低桥，人物双臂双腿结构可读。色彩与整体场景协调，作为一张作品画面使用。
- 三图均未观察到可读文字、商标、水印或明显已有 IP；这是视觉检查，不是不侵权法律保证。
- 不再把颜色丰富、柔和光照或非统一逻辑网格判为缺陷；仍排除摄影、3D、普通矢量画风及明显风格冲突。

## 已生成的备用图

备用根目录：`.tools/asset_review/revised_16bit/prepared/`。它们均已查看原图和最终 PNG、完成规格整理，不需要为了“做完清单”立刻接入游戏。**这 6 张同样只存在于素材负责人本机（`.tools/` 被忽略），仓库里没有对应文件**；下表不再给链接，避免被当成可下载的素材。

| 素材 | 本机备用路径（不随仓库同步） | 尺寸 | 当前处理 |
| --- | --- | --- | --- |
| 会议室 | `.tools/…/prepared/backgrounds/studio_meeting_room.png` | 1280×720 | 美术通过，开发初期暂不用 |
| 导演 | `.tools/…/prepared/characters/director.png` | 512×512 | 美术通过，备用 |
| 作画监督 | `.tools/…/prepared/characters/animation_supervisor.png` | 512×512 | 美术通过，备用 |
| 原画师 | `.tools/…/prepared/characters/key_animator.png` | 512×512 | 美术通过，备用 |
| 动画师 | `.tools/…/prepared/characters/inbetween_animator.png` | 512×512 | 美术通过，备用 |
| 制作进行 | `.tools/…/prepared/characters/production_coordinator.png` | 512×512 | 修订外形后通过，备用 |

六名员工（含制作人）分别独立生成，没有合照裁切。其他五人始终以同一制作人图为风格基准；制作进行的第二次生成另外上传第一次结果作为编辑目标。人物共享暖米色背景、略朝画面左侧的视角、相近头部大小及左上光照。发型、服装、眼镜和配件形成区别，不依赖文字岗位标签。

以上备用图同样 **授权待核查**，不是正式发布素材。

## 尺寸与处理记录

没有新增图片处理依赖。使用 Windows 自带 System.Drawing 做普通插画的裁切、缩放和 PNG 输出，没有声称这些操作能把插画变成原生像素画。

| 类型 | 原始尺寸 | 处理 | 最终尺寸 |
| --- | --- | --- | --- |
| 办公室、会议室 | 1792×1024 | 取矩形 x=0、y=8、宽 1792、高 1008，再等比例缩放 | 1280×720 |
| 六张员工头像 | 1024×1024 | 不裁切，等比例缩放 | 512×512 |
| 单张制作示意 | 1792×1024 | 取矩形 x=0、y=8、宽 1792、高 1008，再等比例缩放 | 960×540 |

- 使用 HighQualityBicubic 缩放，输出不透明 24 位 RGB PNG；如原图含 alpha，以 `#F6E6C4` 合成底色。
- 没有拉伸宽高比，没有用严格减色或网格指标反复返工。
- 每张最终图旁有 `.png.audit.json`，记录实际源路径、归档路径、裁切矩形、宽高、文件字节数、源文件和最终文件 SHA-256、处理算法。
- 原图逐字节保留在 `.tools/asset_review/revised_16bit/sources/`；3 张初期包是已审核成图的相同字节副本。
- 源 PNG 与最终 PNG 的文件完整性、尺寸、原图归档一致性和初期包副本一致性另做文件校验，不能用文件检查替代视觉审核。

## 生成、复用与未采用记录

完整提示词和来源见 [asset_prompts.json](asset_prompts.json)：

- `current_delivery`：当前初期 3 张范围、处理方法、数量与共同授权状态。
- `revised_assets`：修订标准后的实际素材记录，逐项包含工具、日期、完整提示词、参考图、原图路径、原始尺寸、最终尺寸、裁切、审核结论与用途。
- 办公室通过 `prompt_ref` 引用同文件中历史第 1 次的完整实际提示词，并非重新生成。
- `generated_attempts`：保留原来 3 次严格像素尝试的真实结果、提示词、哈希和检查数据。
- `planned_assets`：保留的旧计划提示词，只供历史查询，**不是当前执行规范或已完成文件列表**。

本轮修订标准下实际调用 ImageGen **9 次**：会议室 1 次、6 名员工合计 7 次（制作进行重做 1 次）、制作示意 1 次。8 张新图通过美术检查，加上复用的办公室，共 9 张整理成图；当前只选 3 张，其余 6 张备用。

| 历史或未采用图片 | 当前结论 | 保存方式 |
| --- | --- | --- |
| 首版办公室 | 旧规范曾拒收；现按新版标准救回并采用 | 原文件不改，另存尺寸整理版 |
| 第 2 版简化办公室 | 可作布局参考，但氛围不如首版；不纳入初期包 | 原图与旧检查保留 |
| 第 3 版网格重绘 | 没必要继续修网格；不替代已选首版 | 原图、旧提示词及检查保留 |
| 制作进行首张 | 外形过近于制作人，未采用；修订发型、脸型和耳机后另选第 2 张 | `revised_16bit/sources/production_coordinator_rejected_identity.png` |

之前的完整严格版目录文档另存于 `.tools/asset_review/ASSET_CATALOG_strict_history.md`，仅为历史记录，不再作为当前标准。

## 来源、版权与正式入库边界

- 生成工具为 Qoder 内置 ImageGen，生成日期均为 2026-11-20；工具回执没有给出底层图像服务商、模型版本或随机种子，不猜测。
- 新版任务没有显示可读取的新附件，因此选择本会话现有首版办公室作为参考，已在沟通中说明；随后用户明确允许救回已有合格图。不能记录成“读取了一个实际不存在的新附件”。
- 参考链仅为本次会话生成的办公室和制作人图，没有下载外部商业素材，没有使用真实动画角色或商业游戏截图。
- AI 生成不等于 CC0、独占版权或无条件商业授权，使用自身生成图作参考也不会自动补齐授权链。

2026-11-20 已核对 [Qoder 英文 Terms of Service](https://qoder.com/product-service)，页面更新日期为 2026-04-29：§3.2 的 Outputs 包括图像；§5.1.1 将服务方可能拥有的输出权利转让给用户，但受回授许可等条款约束；§8.2 要求遵守实际适用第三方的附加条款。当前回执仍未识别图像供应商及这批生成的完整适用条款。

**结论：已有一般输出权利条款，但完整适用授权仍待核查，不认定一定不能商用，也不声称已可商用。** 所有图片暂放审核/本地评估区，尚未进入 `apps/web/public/assets/` 的正式发布目录。开发初期包的整理不构成商业使用授权；对外发布前需补齐适用条款并明确商用、修改、分发和署名条件。

`.tools/` 被原仓库忽略，不会随普通 Git 提交同步；没有改忽略配置来绕过审核。如果后续需要团队共享，应先明确授权与共享范围，再转入合适的受控素材目录，不要误以为文档中的图片链接意味着远端已有图片。

## 功能图标继续复用 Lucide

现有 `lucide-react@0.468.0`，不重复生成图标。2026-11-24 实测代码里是 **13 个去重图标、14 处用法、分布在 4 个文件**，全部带 `aria-hidden="true"`：

| 文件 | 在用导出 |
| --- | --- |
| `apps/web/src/App.tsx` | Clapperboard、RotateCw |
| `apps/web/src/components/StatusBadge.tsx` | CircleCheck、CircleAlert、LoaderCircle |
| `apps/web/src/pages/HomePage.tsx` | ArrowUpRight、FolderOpen |
| `apps/web/src/pages/StudioPage.tsx` | ArrowLeft、ArrowRight、Coins、Save、FolderOpen、FileText、Flag |

下表是 2026-11-20 按功能预选、**至今仍未接入任何页面**的候选导出（保留备用，不代表已使用）：

| 预定功能 | 候选导出 | 接入状态 |
| --- | --- | --- |
| 日期 | CalendarDays | 未接入 |
| 员工 | Users | 未接入 |
| 制作进度 | ChartNoAxesCombined | 未接入 |
| 作品质量 | Sparkles | 未接入 |
| 事件 | Zap | 未接入 |
| 收益 | TrendingUp | 未接入 |
| 成就 | Trophy | 未接入 |

已阅读本地 `node_modules/lucide-react/LICENSE`；许可原文保留如下，复用或分发时保留适用声明。

```text
ISC License

Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

## 2026-11-23 页面接入与验收记录

三张图已在提交 `21547d2` 接入页面，接入位置如下：

| 素材 | 页面位置 | 呈现方式（按 2026-11-24 代码实测） |
| --- | --- | --- |
| `backgrounds/studio_office.png` | 制作台标题区 `index.css:221` | 18% 不透明度的背景底纹，`center / cover`，不遮挡文字与控件 |
| `characters/producer.png` | 制作台标题区 `StudioPage.tsx:66` | **56×56 圆角方图**（`border-radius: 10px`，不是圆形），`@media (max-width: 720px)` 缩到 44×44，`object-fit: cover` |
| `production/colored_frame.png` | 首页企划卡 `HomePage.tsx:25`、项目结算 `StudioPage.tsx:118` | 首页 16:9 `object-fit: cover`；结算区 `max-width: 420px` 原比例，不拉伸 |

真实浏览器检查（Microsoft Edge，`vite preview` 构建产物，1440 / 768 / 375 三档）：

| 视口 | 结果 | 证据 |
| --- | --- | --- |
| 1440×900 | 无横向溢出，图片未变形 | [`evidence/assets/home-1440.png`](evidence/assets/home-1440.png) |
| 768×1024 | 无横向溢出（`scrollWidth <= innerWidth`） | [`evidence/assets/home-768.png`](evidence/assets/home-768.png) |
| 375×812 | 单列堆叠正常，图片完整 | [`evidence/assets/home-375.png`](evidence/assets/home-375.png) |

命令结果：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck` | 通过 |
| `npm run test:unit` | 225 / 225 通过（2026-11-23 接入当时） |
| `npm run build:web` | 通过，`dist/assets` 内含三张图 |
| `npm run build` | **失败**：`build:wasm` 报 `Emscripten 4.0.23 is missing` |
| `npm run verify:dist` | **未执行**：依赖 `dist/wasm/game-core.mjs`，构建链缺失 |
| `npm run test:browser` | **未执行**：同上，`public/wasm` 为空 |

> 计数说明：[#9 的 2026-11-23 交付评论](https://github.com/zhengmin486/anime-production-committee/issues/9) 记录同一批接入为 247 / 247，两处数字对应同日不同提交时点，不是相互矛盾的结论。**2026-11-24 的素材盘点没有重新执行任何测试命令**（本机仍无 emsdk），因此不给出当日计数。

阻塞原因：本机没有 Emscripten 工具链，`.tools/emsdk` 不存在，`emsdk` 的 npm 包不支持 win32。上述三条命令需要在装有 emsdk 的机器上补跑；**在补跑前不把 #9 关闭为「三图接入完成」**。

## 当前剩余工作

1. 2026-11-20 那批 `.tools/` 图片的适用授权仍未核查；它们不随仓库同步，也不再用作正式素材来源。
2. `npm run build`、`npm run verify:dist`、`npm run test:browser` 需在有 emsdk 的环境补跑并附输出。
3. 只有新功能确实需要时才继续原画、分镜、中间稿或海报，不再按 16 张总量提前生产。
4. **2026-11-22 已入库这批的适用条款同样未核查**：`asset_prompts.json` 记录的生成工具是 WorkBuddy ImageGen，底层服务商与模型均为 `null`；本文「来源、版权与正式入库边界」一节核查的是 Qoder 条款，两者不能互相顶替。
5. **AI 生成标识靠裁切移除**：若发布平台要求保留生成标识，需要重新生成或补标识，属于发布前决定项。
6. **源图已删、处理脚本未入库**：改裁切只能凭提示词重生成，素材不可复现；建议把处理脚本纳入 `scripts/` 或明确声明成品唯一。
7. **成品与提示词存在偏差**：入库制作人头像实际是米褐外套 + 薄荷针织衫 + 眼镜，而 11-20 提示词要求深海军蓝外套 + 珊瑚点缀。批量生成其余 5 张头像前，必须先确定以哪一版作为风格锚，否则名册图会互相不一致。
8. 建议新增最小素材校验（存在性、尺寸、SHA 与 sidecar 一致、文档图片链接可达），把 2026-11-24 盘点发现的哈希与死链类失真挡在合入前。
