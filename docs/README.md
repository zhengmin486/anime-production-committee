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

- [2026-11-26 当前进度与决策落地状态](PROGRESS.md)：M0/M1 已完成、M2 实施与验收状态、M2.5 独立财务失败路径及集中裁决索引。
- [2026-11-25 设计建议总清单](DESIGN_BACKLOG_2026-11-25.md)：已确认、待讨论、优化储备与工程缺口的分类追踪。
- [数值参数总清单与标定查阅索引](NUMERICAL_PARAMETERS_CATALOG.md)：盘点全系统需要确定的数值、参数类型、当前状态，以及每类参数决策前应查阅的规则、架构、契约、实现和标定议题。

- [架构评审记录（2026-11-24）](ARCHITECTURE_REVIEW_2026-11-24.md)：架构评审结论、整改状态与 M0 契约核验。

- [M0 契约冻结](M0_CONTRACT_FREEZE.md)
- [M0–M7 开发路线与里程碑](DEVELOPMENT_ROADMAP.md)
- [M1 运行时切片与验收记录](M1_RUNTIME_SLICE.md)
- [制作蓝图规范](BLUEPRINT_SPEC.md)
- [权威决策登记册](DECISION_LOG.md)
- [决定索引与 ADR 记录](decisions/INDEX.md)：流程、治理与契约级决定单独建档，`accepted` 后不就地改写。
- [ADR-0004：Agent 默认决策权与局部阻塞](decisions/ADR-0004-agent-decision-authority-and-local-blocking.md)：未冻结细节的处理、模块自主权与局部阻塞。
- [ADR-0005：文档权威与冲突处理](decisions/ADR-0005-document-conflict-resolution.md)：权威来源、过期副本、正式决策冲突及冲刺期闭环。
- [游戏愿景与产品方向](GAME_VISION.md)：产品定位、核心体验、设计支柱、复杂度预算与成品成功标准；具体规则以决策登记册为准。
- [研究与审计成果目录](RESEARCH_CATALOG.md)
- [领域架构设计](DOMAIN_ARCHITECTURE.md)
- [核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)

## M3/M4 集成协作

- [M3/M4 跨模块集成契约](M3_M4_INTEGRATION_CONTRACT.md)：阶段边界、数据所有权、跨模块交接与验收顺序；与上位规则冲突时以上位规则为准。
- [M3 多项目集成 Fixture](M3_INTEGRATION_FIXTURES.md)：员工归属、工作项磨合、供应商产能、项目隔离与正常企划来源的手算场景。
- [M4 商业结算对账 Fixture](M4_COMMERCE_RECONCILIATION_FIXTURES.md)：投资、制作费、制作成本、BD 与非 BD 净池分配的公司现金和 Archive 对账样例。

## 复盘与协作约定

- [开放式增量开发与提前实现原则](OPEN_INCREMENTAL_DEVELOPMENT_POLICY.md)：明确首版范围是最低交付目标而非功能禁区，并规定未冻结细节的默认决策权、临时假设和局部阻塞。
- [工程变更治理](ENGINEERING_CHANGE_GOVERNANCE.md)：区分内部修补、兼容扩展、契约修订与破坏性重构，明确何时需要升级裁决。
- [2026-11 重构复盘与协作约定](REBUILD_RETROSPECTIVE_AND_WORKING_RULES_2026-11-25.md)：记录本次架构纠偏暴露的问题、分支迁移原则、智能体协作要求和 PR 合并检查。
- [团队异步协作约定](TEAM_ASYNC_COLLABORATION.md)：团队执行摘要；Agent 决策权限与文档冲突分类以 ADR-0004/0005 为准。

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

## 历史研究与评审归档

以下材料来自未合并研究/设计分支，现仅保留为历史证据与讨论记录；不具有规则、接口、人员分工或开发计划的权威性。使用前必须与当前决策登记册、架构契约和 GitHub Issue 状态核对。

- [愿景深化复核与三方建议汇编](archive/reviews/VISION_DEEPENING_REVIEW_2026-11-24.md)
- [独立游戏设计评审报告](archive/reviews/2026-11-24-independent-game-design-review.md)
- [独立评审后续讨论记录](archive/reviews/2026-11-24-review-follow-up-decisions.md)
- [全仓库设计重新审查报告](archive/reviews/FULL_DESIGN_REAUDIT_2026-11-25.md)
- [员工与组织系统设计研究稿](archive/reviews/STAFF_ORG_SYSTEM_DESIGN_2026-11-24.md)
- [模块依赖与并行开发矩阵（历史版本）](archive/reviews/MODULE_DEPENDENCY_MATRIX_2026-11-24.md)

## 候选设计与计划

这些文档包含设计判断、候选规则、架构建议或工作拆分。这些文件用于理解设计演进和历史审查；当前研究阶段已结束，后续以架构实现、模拟验证和试玩反馈为主：

- [核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)
- [核心玩法工作包拆分](CORE_GAMEPLAY_WORKSTREAM_BREAKDOWN_2026-11-24.md)
- [领域边界与数据归属草案](DOMAIN_BOUNDARIES_AND_DATA_OWNERSHIP_DRAFT_2026-11-24.md)
- [玩法痛点专项研究与验证计划](PLAYABILITY_FOCUSED_RESEARCH_AND_VALIDATION_2026-11-24.md)
- [重构审查与合并登记](REBUILD_REVIEW_AND_MERGE_REGISTER_2026-11-24.md)
- [统一重构审查清单](UNIFIED_REBUILD_REVIEW_CHECKLIST_2026-11-24.md)
- [集数规模、工作量与开局路线初稿（2026-11-26）](PRODUCTION_SCALE_AND_OPENING_ROUTES_DRAFT_2026-11-26.md)：独立设计初稿，记录短篇/10集/12集/14集以上规格、标准 TV 等效产量、4 人开局及单线/多线平衡方向；具体参数尚未冻结。
- [经济系统核心数值基线与阶段边界（2026-11-26）](ECONOMY_NUMERICAL_BASELINE_AND_STAGE_GATES_2026-11-26.md)：标准 TV 货币尺度、57/62 周双方案、人日成本边界及 M2/M3/M7 阶段分工。

以上文件的存在不代表其中所有提案均已生效；当前玩法以 DECISION_LOG.md、当前架构以 DOMAIN_ARCHITECTURE.md v1.4 为准，工作分工以 GitHub Issues 实时状态为准。

## 产品、规则与工程文档

| 类型 | 文档 |
|---|---|
| 产品与玩法 | [PRODUCT](PRODUCT.md)、[GAME_DESIGN](GAME_DESIGN.md)、[GAME_RULES](GAME_RULES.md) |
| 数据与接口 | [DATA_MODEL](DATA_MODEL.md)、[API](API.md) |
| 工程架构与进度 | [ARCHITECTURE](ARCHITECTURE.md)、[PROGRESS](PROGRESS.md) |
| 迁移与历史差距 | [V1_GAP_REVIEW](V1_GAP_REVIEW.md)、[REFERENCE_TO_V3_GAP_REVIEW](REFERENCE_TO_V3_GAP_REVIEW.md) |
| 经济实验 | [经济模拟报告 V0.2](ECONOMIC_SIMULATION_REPORT_V0.2.md)、[V0.3](ECONOMIC_SIMULATION_REPORT_V0.3.md)、[V0.4](ECONOMIC_SIMULATION_REPORT_V0.4.md)、[V0.5](ECONOMIC_SIMULATION_REPORT_V0.5.md)、[V0.6](ECONOMIC_SIMULATION_REPORT_V0.6.md)、[V1 平衡提案](V1_BALANCE_PROPOSAL.md) |
| 事件系统 | [事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)、[终局 pending 结清（#120）](EVENT_TERMINAL_SETTLEMENT.md)、[限时升级与二次超时（#121）](EVENT_ESCALATION.md)、[应急外包编排准备（#122）](EVENT_VENDOR_ORCHESTRATION.md) |
| 其他工程专项 | [核心校验器重构设计](CORE_VALIDATOR_REFACTOR_DESIGN.md)、[M2 集成检查表](M2_INTEGRATION_CHECKLIST.md)、[M2 集成审查](M2_INTEGRATION_REVIEW.md) |
| 前端信息架构与原型 | [WP10 原型交付说明](FRONTEND_WP10_PROTOTYPE.md) |

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

## 决定的写法与文档检查

规则内容继续写进 [决定登记册](DECISION_LOG.md) 的 `DEC-*` 条目；组织方式、流程和契约级决定写进 [decisions/](decisions/INDEX.md) 的 `ADR-*` 文件：

1. 复制 [ADR 模板](templates/ADR_TEMPLATE.md)，写明背景、决定、后果、被否决方案与来源，状态从 `proposed` 开始。
2. 负责人确认后改为 `accepted`，正文冻结；后续变更新建 ADR，用 `supersedes` 指向旧文件。
3. 研究文件与审查文件只写证据和建议，不声明规则已变更。
4. 提交前运行 `npm run check:docs`，检查决定字段、ADR 编号、`canonical_for` 唯一性和本地链接；CI 会在改动 `docs/` 时自动执行。

这套流程的取舍见 [ADR-0001](decisions/ADR-0001-decision-record-process.md)。

## 文档冲突与 Agent 决策

- 具体规则/契约/流程分别遵循 DECISION_LOG、DOMAIN_ARCHITECTURE、M0_CONTRACT_FREEZE 与 accepted ADR，不按文件更新时间简单排序。
- 表述差异由执行者自行统一；明确过期副本按规范来源修正；两个现行正式决定实质冲突时才局部升级裁决。
- 模块负责人负责本模块文档同步；总负责人只处理冻结规则、公共契约和跨模块实质冲突。执行细则见 [ADR-0004](decisions/ADR-0004-agent-decision-authority-and-local-blocking.md) 与 [ADR-0005](decisions/ADR-0005-document-conflict-resolution.md)。
