# 开发初期游戏美术素材

更新日期：2026-11-20。

## 当前范围与结果

按用户最新要求，先只整理开发初期需要的 **3 张图片**，停止新增生成，不再追求完整 16 张素材库。

- 当前美术标准：温暖、协调、好看且实际可用的 **日式 16-bit 像素风插画**。固定 320×180 逻辑网格、24 色和绝对禁用抗锯齿等旧要求已取消，不能再用它们淘汰可用图片。
- 初期包：办公室背景、制作人头像、单张动画制作示意；均有真实 PNG，并完成原图及尺寸整理后的逐张视觉检查。
- 用户允许复用已有图，故救回首版办公室，不再生成办公室来替代它。
- 收窄范围之前已生成的会议室和其余 5 名员工头像共 **6 张保留备用**，不删除、不继续扩展。
- 原画、中间稿、分镜、4 张海报、道具、特效、音频暂不制作。没有把延期内容当作当前欠交任务。
- 只改素材整理和记录，未修改 React、游戏逻辑、C++、构建配置或应用依赖；未接入页面、提交、推送或发布。

**美术验收与授权核查分开：3 张初期图通过视觉和规格检查，但适用输出授权仍待核查；当前正式发布目录中的图片为 0 张，不宣称正式可商用。**

## 开发初期三张图

本地评估包根目录：`.tools/asset_review/early_development/`。以下链接指向实际存在的文件，不是文件名计划表。

| 素材 | 实际文件 | 用途 | 尺寸 / 格式 | 美术审核 | 授权 |
| --- | --- | --- | --- | --- | --- |
| 办公室背景 | [backgrounds/studio_office.png](../.tools/asset_review/early_development/backgrounds/studio_office.png) | 公司主场景，中央留白供日后叠加员工或 UI | 1280×720 / PNG | 通过；复用首版 | 待核查 |
| 制作人头像 | [characters/producer.png](../.tools/asset_review/early_development/characters/producer.png) | 验证单个人物卡片、角色介绍的视觉效果 | 512×512 / PNG | 通过；人物基准 | 待核查 |
| 制作示意图 | [production/colored_frame.png](../.tools/asset_review/early_development/production/colored_frame.png) | 展示一个原创动画画面，不表示完整制作阶段系统 | 960×540 / PNG | 通过 | 待核查 |

### 实际检查结论

- **办公室**：暖木色地板、米白墙面、蓝色城市窗景、薄荷绿和少量珊瑚色、明确的动画工位与透写台；中央留白充足。裁切后窗户、家具和主通道保持完整。旧名称包含 `rejected` 只反映已废止的严格网格审核，不是当前视觉结论。
- **制作人**：成熟商务休闲形象、面部结构清晰、左上方暖光、米色简洁背景；侧转视角和像素风轮廓与办公室协调。实际构图包含肩部和上胸，供人物卡片使用，不是动作精灵或透明立绘。
- **制作示意**：原创“浮岛天气信使”，短深色头发、薄荷色短披风、珊瑚色围巾、方形挎包；向右跨过低桥，人物双臂双腿结构可读。色彩与整体场景协调，作为一张作品画面使用。
- 三图均未观察到可读文字、商标、水印或明显已有 IP；这是视觉检查，不是不侵权法律保证。
- 不再把颜色丰富、柔和光照或非统一逻辑网格判为缺陷；仍排除摄影、3D、普通矢量画风及明显风格冲突。

## 已生成的备用图

备用根目录：`.tools/asset_review/revised_16bit/prepared/`。它们均已查看原图和最终 PNG、完成规格整理，不需要为了“做完清单”立刻接入游戏。

| 素材 | 实际备用文件 | 尺寸 | 当前处理 |
| --- | --- | --- | --- |
| 会议室 | [backgrounds/studio_meeting_room.png](../.tools/asset_review/revised_16bit/prepared/backgrounds/studio_meeting_room.png) | 1280×720 | 美术通过，开发初期暂不用 |
| 导演 | [characters/director.png](../.tools/asset_review/revised_16bit/prepared/characters/director.png) | 512×512 | 美术通过，备用 |
| 作画监督 | [characters/animation_supervisor.png](../.tools/asset_review/revised_16bit/prepared/characters/animation_supervisor.png) | 512×512 | 美术通过，备用 |
| 原画师 | [characters/key_animator.png](../.tools/asset_review/revised_16bit/prepared/characters/key_animator.png) | 512×512 | 美术通过，备用 |
| 动画师 | [characters/inbetween_animator.png](../.tools/asset_review/revised_16bit/prepared/characters/inbetween_animator.png) | 512×512 | 美术通过，备用 |
| 制作进行 | [characters/production_coordinator.png](../.tools/asset_review/revised_16bit/prepared/characters/production_coordinator.png) | 512×512 | 修订外形后通过，备用 |

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

现有 `lucide-react@0.468.0` 已验证以下导出，不重复生成图标，也未接入新页面。

| 功能 | 导出 |
| --- | --- |
| 资金 | Coins |
| 日期 | CalendarDays |
| 员工 | Users |
| 企划 | Clapperboard |
| 制作进度 | ChartNoAxesCombined |
| 作品质量 | Sparkles |
| 事件 | Zap |
| 收益 | TrendingUp |
| 成就 | Trophy |

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

## 界面字体复用 Fusion Pixel 12px（SIL OFL-1.1）

2026-11-23 开始页像素皮肤（方向 C 的 C0 层）接入像素字体，走的是内置文件而不是依赖本机安装，目的是让本机、同事和托管站点拿到同一套字形，不随个人字体列表变化。

| 项 | 值 |
| --- | --- |
| 来源 | [TakWolf/fusion-pixel-font](https://github.com/TakWolf/fusion-pixel-font) release `2026.11.10` |
| 文件 | `fusion-pixel-12px-monospaced-zh_hans.ttf.woff2`，957,056 字节，未修改原样内置 |
| SHA-256 | `16783b4599928e20fff825fdcf93a67782b371e9593640cb171e3a3dcf901f68` |
| 内置位置 | `apps/web/public/fonts/`，许可证原文随文件同目录分发 |
| 声明名 | CSS 家族名 `Pixel CJK`，字体内部名仍为 `Fusion Pixel 12px Mono zh-Hans` |
| 字形覆盖 | 37,404 字形；扫描 `apps/web/src`、`packages/game-core` 与 `index.html` 得到的 774 个非空白字符全部命中，无缺字 |

许可边界：OFL-1.1 允许随软件捆绑、嵌入和再分发，条件是不得用保留字体名（RFN「缝合像素 / Fusion Pixel」）命名修改版。这里选的是不子集化、不改动、不重命名，因此不产生演绎版，只需连同 `OFL.txt` 及上游 `LICENSES/`（ark-pixel、cubic-11、galmuri）一起保留。若日后为减体积做子集化，那属于修改版，必须另起家族名并保留原版权声明。

已知接缝：`Pixel CJK` 目前只在 `.home-pixel` 作用域内生效，页面头部与页脚属于全局外壳，仍是无衬线回退字，开始页上下两种字体并存。等 C1 把外壳 HUD 一起改造后消除，本轮不扩大作用域以免经营台变成半像素半圆角的混合样式。

## 当前剩余工作

1. 补齐图像生成输出的实际适用授权依据，授权未清楚前不标为正式可商用，不进入正式发布包。
2. 将来真正开始页面开发时，再决定这 3 张图的 UI 接入位置；本任务不修改页面。
3. 只有新功能确实需要时才继续原画、分镜、中间稿或海报，不再按 16 张总量提前生产。
