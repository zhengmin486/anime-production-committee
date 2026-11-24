# 项目文档导航

本页用于区分资料性质、查找入口和阅读顺序。负责人已确认的当前玩法规则以 [DECISION_LOG.md](DECISION_LOG.md) 为准；当前领域架构以 [DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md) v1.4 为准，M0 契约以 [M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md) 为准。研究与审计报告提供证据和历史背景，不自动构成规则。

## 先判断自己要找什么

| 目的 | 从这里开始 | 注意 |
|---|---|---|
| 了解项目当前代码和运行状态 | [PROGRESS](PROGRESS.md)、[ARCHITECTURE](ARCHITECTURE.md)、[API](API.md) | 代码现状不等于目标设计 |
| 了解正式产品描述和旧规则 | [PRODUCT](PRODUCT.md)、[GAME_DESIGN](GAME_DESIGN.md)、[GAME_RULES](GAME_RULES.md)、[DATA_MODEL](DATA_MODEL.md) | 属于既有设计/实现记录，不是新研究的先验约束 |
| 查找行业事实和论文来源 | [研究资料入口](research/README.md)、[行业研究摘录](INDUSTRY_RESEARCH.md)、[论文资料索引](research/papers/README.md) | 综合报告含作者解释和游戏启示；独立研究阶段优先回到原始来源 |
| 查找既有竞品、开源项目研究 | [竞品研究](PLAYABILITY_COMPETITOR_RESEARCH_V0.1.md)、[开源项目借鉴](REFERENCE_PROJECT_REVIEW.md)、[源码深读](REFERENCE_SOURCE_REVIEW_ROUND2.md)、[开罗游戏研究档案](research/KAIROSOFT_NARROW_RESEARCH_ARCHIVE_2026-11-24.md) | 均为已有研究产物，不应替代新一轮独立观察 |
| 查找旧系统审计 | 见下方「审计与历史研究」 | 用于第二阶段对照，不是新设计答案 |
| 查找当前重构提案和任务拆分 | [领域架构](DOMAIN_ARCHITECTURE.md)、[核心工作包拆分](CORE_GAMEPLAY_WORKSTREAM_BREAKDOWN_2026-11-24.md) | 必须服从 DECISION_LOG.md 中已确认规则 |
| 查找团队交接和内容样本 | [团队协作](TEAM_ASYNC_COLLABORATION.md)、[团队计划](TEAM_PLAN.md)、[交付物目录](TEAM_DELIVERABLES/) | 以具体交付物状态为准 |

## 当前权威入口

- [架构评审记录（2026-11-24）](ARCHITECTURE_REVIEW_2026-11-24.md)：架构评审结论、整改状态与 M0 契约核验。

- [M0 契约冻结](M0_CONTRACT_FREEZE.md)
- [M0–M7 开发路线与里程碑](DEVELOPMENT_ROADMAP.md)
- [制作蓝图规范](BLUEPRINT_SPEC.md)
- [权威决策登记册](DECISION_LOG.md)
- [研究与审计成果目录](RESEARCH_CATALOG.md)
- [领域架构设计](DOMAIN_ARCHITECTURE.md)
- [核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)

## 研究资料与外部证据

- [研究资料总入口](research/README.md)：研究资料分类、两阶段研究机制和新研究成果存放规则。
- [论文资料索引](research/papers/README.md)：论文书目信息、原文链接和许可状态。
- [文献综述](research/papers/LITERATURE_REVIEW.md)：已有论文综合分析。
- [论文精读笔记](research/papers/REVIEW_NOTES.md)：已有精读与游戏设计启示。
- [日本动画产业研究](INDUSTRY_RESEARCH.md)：行业统计、商业结构、制作公司经营和产业机制的综合摘录。

## 既有研究产物与系统审计

以下文档记录已提交的研究、分析或审计。它们是历史证据和观点；引用时应区分事实、解释、建议和负责人决策：

- [核心玩法架构研究](research/CORE_GAMEPLAY_ARCHITECTURE_RESEARCH.md)
- [补充研究档案](research/SUPPLEMENTARY_RESEARCH_ARCHIVE_2026-11-24.md)
- [开罗游戏专项研究档案](research/KAIROSOFT_NARROW_RESEARCH_ARCHIVE_2026-11-24.md)
- [玩法与随机性研究提案](PLAYABILITY_RESEARCH_AND_RANDOMNESS.md)
- [竞品可玩性研究](PLAYABILITY_COMPETITOR_RESEARCH_V0.1.md)
- [作品与制作系统审计](WORKS_PRODUCTION_SYSTEM_AUDIT.md)
- [员工与组织系统审计](STAFF_ORG_AUDIT.md)
- [公司经营与成长系统审计](COMPANY_ECONOMY_GROWTH_AUDIT.md)
- [制作委员会与商业系统审计](COMMITTEE_BUSINESS_AUDIT.md)
- [参考项目研究](REFERENCE_PROJECT_REVIEW.md)
- [参考项目源码深读](REFERENCE_SOURCE_REVIEW_ROUND2.md)

审计文档可能引用特定分支、提交和旧规则。使用时必须核对其审计基线，不得把其中的历史状态直接描述为当前实现。

## 产品愿景

- [游戏愿景与产品方向](GAME_VISION.md)：定义目标游戏、产业设定、公司—作品—制作委员会关系、核心体验、设计支柱与产品边界。权威表按效力排序。
- [玩法系统评审与机制提案](GAMEPLAY_SYSTEMS_REVIEW_2026-11-24.md)：对 PR #44 与当前经济模型的系统评审，含数值诊断、C1 修正与对照实验结果。**已全部采纳，转为决策留档**。

## 候选设计与计划

这些文档包含设计判断、候选规则、架构建议或工作拆分。这些文件用于理解设计演进和历史审查；当前研究阶段已结束，后续以架构实现、模拟验证和试玩反馈为主：

- [核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)
- [核心玩法工作包拆分](CORE_GAMEPLAY_WORKSTREAM_BREAKDOWN_2026-11-24.md)
- [领域边界与数据归属草案](DOMAIN_BOUNDARIES_AND_DATA_OWNERSHIP_DRAFT_2026-11-24.md)
- [玩法痛点专项研究与验证计划](PLAYABILITY_FOCUSED_RESEARCH_AND_VALIDATION_2026-11-24.md)
- [重构审查与合并登记](REBUILD_REVIEW_AND_MERGE_REGISTER_2026-11-24.md)
- [统一重构审查清单](UNIFIED_REBUILD_REVIEW_CHECKLIST_2026-11-24.md)

以上文件的存在不代表其中所有提案均已生效；当前玩法以 DECISION_LOG.md、当前架构以 DOMAIN_ARCHITECTURE.md v1.4 为准，工作分工以 GitHub Issues 实时状态为准。

## 产品、规则与工程文档

| 类型 | 文档 |
|---|---|
| 产品与玩法 | [PRODUCT](PRODUCT.md)、[GAME_DESIGN](GAME_DESIGN.md)、[GAME_RULES](GAME_RULES.md) |
| 数据与接口 | [DATA_MODEL](DATA_MODEL.md)、[API](API.md) |
| 工程架构与进度 | [ARCHITECTURE](ARCHITECTURE.md)、[PROGRESS](PROGRESS.md) |
| 迁移与历史差距 | [V1_GAP_REVIEW](V1_GAP_REVIEW.md)、[REFERENCE_TO_V3_GAP_REVIEW](REFERENCE_TO_V3_GAP_REVIEW.md) |
| 经济实验 | [经济模拟报告 V0.2](ECONOMIC_SIMULATION_REPORT_V0.2.md)、[V0.3](ECONOMIC_SIMULATION_REPORT_V0.3.md)、[V0.4](ECONOMIC_SIMULATION_REPORT_V0.4.md)、[V0.5](ECONOMIC_SIMULATION_REPORT_V0.5.md)、[V0.6](ECONOMIC_SIMULATION_REPORT_V0.6.md)、[V1 平衡提案](V1_BALANCE_PROPOSAL.md) |
| 事件系统 | [事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md) |
| 其他工程专项 | [核心校验器重构设计](CORE_VALIDATOR_REFACTOR_DESIGN.md)、[M2 集成检查表](M2_INTEGRATION_CHECKLIST.md)、[M2 集成审查](M2_INTEGRATION_REVIEW.md) |

规则文档描述的是相应版本的规则口径；需要判断是否已实现时，必须进一步检查代码、测试和进度记录。

## 团队、素材与内容资产

- [团队协作约定](TEAM_ASYNC_COLLABORATION.md)
- [团队计划](TEAM_PLAN.md)
- [模块交付物](TEAM_DELIVERABLES/)
- [素材目录](ASSET_CATALOG.md)
- [素材提示词数据](asset_prompts.json)
- [事件目录样例](event_catalog.example.json)
- [事件测试夹具](event_test_fixtures.json)
- [证据与素材目录](evidence/)

## 新资料的归档原则

1. 原始来源、可核验事实、研究者解释、游戏设计建议应明确区分。
2. 新一轮独立研究放入 `research/independent/`；与旧方案对照后的综合结论放入 `research/comparative/`。
3. 不覆盖旧报告。需要修订时保留历史版本或明确记录修订关系。
4. 设计提案、已确认规则、已实现行为分别标识，不用“写进文档”代替“已确认”或“已实现”。
5. 不为整理而大规模移动现有文件；旧链接和历史引用优先保持稳定。
