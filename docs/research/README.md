# 研究资料入口

本目录同时包含外部资料索引、既有研究产物和后续新研究成果。它们的证据性质不同，不能因为都位于 `research/` 就视为同一等级。

## 资料分层

| 类别 | 位置 | 内容性质 | 新研究中的使用方式 |
|---|---|---|---|
| 外部原始来源入口 | [papers/README.md](papers/README.md) | 论文书目信息、官方原文链接、许可状态 | 第一阶段可用于发现原始来源；应尽可能直接阅读原文 |
| 已有论文综合分析 | [papers/LITERATURE_REVIEW.md](papers/LITERATURE_REVIEW.md)、[papers/REVIEW_NOTES.md](papers/REVIEW_NOTES.md) | 研究者摘要、解释和游戏启示 | 第一阶段不作为先验；第二阶段用于对照 |
| 已有项目研究档案 | 本目录根部现有研究报告 | 过去针对本项目形成的研究结论 | 第二阶段对照，不作为独立研究起点 |
| 独立研究成果 | [independent/](independent/README.md) | 新一轮尚未接触旧设计的研究报告 | 第一阶段产物 |
| 对照审查成果 | [comparative/](comparative/README.md) | 独立研究与历史设计对照后的综合判断 | 第二阶段产物 |

## 两阶段研究机制

### 第一阶段：独立研究

研究者先建立对问题的独立理解。此阶段不读取项目现有设计、规则、历史决策、系统审计、旧研究结论、重构框架和工作包拆分。

可以从论文索引中发现外部原始来源，但不要把已有文献综述、精读笔记或“对游戏的启示”当作事实本身。应区分原始来源的明确结论、研究者推断和游戏设计判断。

第一阶段报告存放在 `independent/<主题>/`。报告应保留来源、方法、事实与推断边界、候选方案、反例和未解决问题。独立报告完成前，不进行旧方案对照。

### 第二阶段：对照审查

第一阶段报告完成后，研究者才读取项目既有设计、历史研究、审计、代码契约和决策记录。

逐项判断旧方案的保留、修订、废弃或证据不足；也要审查独立研究自身的局限，不以推翻旧方案为目标。综合报告存放在 `comparative/<主题>/`，并链接第一阶段报告及其引用来源。

## 第一阶段阅读边界

**可以作为入口：**
- 论文目录中的书目信息和官方原文链接： [papers/README.md](papers/README.md)。
- 研究者自行检索到的学术论文、行业报告、官方统计、公司/行业组织资料和游戏官方资料。
- 为理解研究问题所必需的中性背景说明，但不得包含现有方案的答案或设计结论。

**第一阶段暂不阅读：**
- `CORE_GAMEPLAY_ARCHITECTURE_RESEARCH.md`、`SUPPLEMENTARY_RESEARCH_ARCHIVE_2026-11-24.md`、`KAIROSOFT_NARROW_RESEARCH_ARCHIVE_2026-11-24.md`。
- `papers/LITERATURE_REVIEW.md`、`papers/REVIEW_NOTES.md` 中的综合结论和游戏启示。
- `docs/INDUSTRY_RESEARCH.md` 中已经整理好的游戏启示和设计推论；确需使用其中数据时，回到其原始来源核验。
- `docs/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md`、`docs/GAME_DESIGN.md`、`docs/GAME_RULES.md`、`docs/PRODUCT.md`、`docs/DATA_MODEL.md`、`docs/API.md`、系统审计、历史决策和工作包文件。
- 任何此前对话摘要、旧提示词中的具体方案或模型结论。

如果研究任务确实需要了解产品最基本的题材背景，只提供“玩家经营一家动画制作公司，目标是设计一款轻量经营模拟游戏”这一层级的信息；不要提供旧系统结构和规则。

## 现有资料的状态

目前 `papers/` 保存文献目录和研究笔记；本目录根部的三份大型研究档案是既有研究成果，不是原始资料库。既有文件暂时保留原路径，以免破坏链接、提交历史和其他文档引用。后续新增研究按上述新目录归档，不要求一次性搬迁全部历史资料。

## 新研究文件命名建议

使用简短、稳定的主题目录名，例如：

- `independent/production-workflow/`
- `independent/staff-and-organization/`
- `independent/committee-and-business/`
- `independent/events-and-risk/`
- `independent/company-growth/`

完成独立研究后，在 `comparative/` 建立同名主题目录，记录新旧方案比较及综合建议。文件名和研究范围可由研究者根据实际问题调整，不要求机械套用以上主题。
