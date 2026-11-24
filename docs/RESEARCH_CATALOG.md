# 研究与审计成果目录

> 更新日期：2026-11-24  
> 本目录登记本轮已提交的研究、审计、模拟与验证材料，包括已合并 main 的报告和仍在独立 PR/实验分支中的交付。材料保留原始性质：研究报告不是规则，审计报告不是产品决策，模拟器结果不是正式平衡参数。现行规则以 [DECISION_LOG.md](DECISION_LOG.md) 为准。

## 1. 核心玩法与竞品研究

- [核心玩法架构研究](research/CORE_GAMEPLAY_ARCHITECTURE_RESEARCH.md)：PR #25，以《游戏发展国》《动画制作物语》等为参考，分析作品创作、公司成长、员工、设施、长期循环与游戏性。
- [可玩性与随机性研究](PLAYABILITY_RESEARCH_AND_RANDOMNESS.md)：PR #23，讨论玩家期待感、随机性、资源竞争、作品反馈和员工成长。
- [可玩性竞品研究 V0.1](PLAYABILITY_COMPETITOR_RESEARCH_V0.1.md)：PR #23，开罗、《白箱》、RimWorld 等案例的桌面研究与观察模板。
- [玩法痛点专项研究与验证计划](PLAYABILITY_FOCUSED_RESEARCH_AND_VALIDATION_2026-11-24.md)：PR #34 的研究任务书归档；研究阶段已结束，不再作为当前研究任务单。
- [补充研究归档](research/SUPPLEMENTARY_RESEARCH_ARCHIVE_2026-11-24.md)：经营模拟游戏和日本动画产业的补充观察；明确列出研究质量与证据限制。
- [开罗游戏窄范围补充研究归档](research/KAIROSOFT_NARROW_RESEARCH_ARCHIVE_2026-11-24.md)：《游戏发展国》《动画制作物语》专题报告正文与设计映射。报告保留原始引用，来源尚未在归档时逐项重新核验。

## 2. 日本动画产业与学术研究

- [日本动画产业研究](INDUSTRY_RESEARCH.md)：行业规模、制作公司经营、委员会、渠道、收入结构、外包、制作周期与公司案例；现实数据只用于机制方向和量级参照，不直接等于游戏参数。
- [十篇论文文献综述](research/papers/LITERATURE_REVIEW.md)：学术文献的综合综述。
- [十篇论文精读笔记](research/papers/REVIEW_NOTES.md)：逐篇精读与证据摘录。
- [论文资料入口](research/papers/README.md)：论文清单、来源与版权说明。

## 3. 系统审计

- [委员会与商业审计](COMMITTEE_BUSINESS_AUDIT.md)：PR #28，委员会、投资、渠道与商业结算的历史规则/实现差异。
- [公司经济与成长审计](COMPANY_ECONOMY_GROWTH_AUDIT.md)：PR #29，公司现金流、固定成本、成长、设施、破产与长期经营。
- [员工与组织审计](STAFF_ORG_AUDIT.md)：PR #30，员工能力、潜力、成长、招聘、组织和外包。
- [作品制作系统审计](WORKS_PRODUCTION_SYSTEM_AUDIT.md)：PR #31，旧作品企划、五阶段制作、工作量、质量、交付和代码约束。其五阶段描述是历史审计对象，不是当前六阶段规则。

## 4. 模拟与实验

- [经济模拟报告 V0.2](ECONOMIC_SIMULATION_REPORT_V0.2.md)
- [经济模拟报告 V0.3](ECONOMIC_SIMULATION_REPORT_V0.3.md)
- [经济模拟报告 V0.4](ECONOMIC_SIMULATION_REPORT_V0.4.md)
- [经济模拟报告 V0.5](ECONOMIC_SIMULATION_REPORT_V0.5.md)
- [经济模拟报告 V0.6](ECONOMIC_SIMULATION_REPORT_V0.6.md)
- [员工排班模拟器 V0.1](STAFF_SCHEDULING_SIMULATOR_V0.1.md)：PR #20，旧单项目模型下的排班模拟器说明。
- [员工排班模拟报告 V0.2](STAFF_SCHEDULING_SIMULATION_REPORT_V0.2.md)：PR #20，包含排班策略和产能实验结果。
- [员工模板校准 V0.1](STAFF_TEMPLATE_CALIBRATION_V0.1.md) 与 [V0.2](STAFF_TEMPLATE_CALIBRATION_V0.2.md)：PR #20，人物卡与能力模板实验。
- [PR #20 完整交付与实验代码](https://github.com/zhengmin486/anime-production-committee/pull/20)：另含脚本、测试和实验 fixture。以上均基于旧单项目模型，不能直接作为多项目新架构的平衡结论。
- [随机制作实验报告 V0.1](STOCHASTIC_PRODUCTION_EXPERIMENT_V0.1.md)：PR #22，讨论工作量/质量分离、随机流隔离和实验结果，不代表正式规则。
- [PR #22 完整交付与实验代码](https://github.com/zhengmin486/anime-production-committee/pull/22)：包含随机制作模拟器、测试和持续集成配置。
- [跨模块账目一致性审计脚本](../scripts/audit-ledger-consistency.mjs)：PR #21 已合并，提供只读财务核验方法；适配的是旧 V3 状态结构，迁移时需重写输入适配。

- [事件域迁移提案 PR #33](https://github.com/zhengmin486/anime-production-committee/pull/33)：记录事件域迁移设计及仍需裁决的范围问题；以 PR 页面实时状态为准，不将提案内容自动视为已确认规则。
- [领域边界与数据所有权草案](DOMAIN_BOUNDARIES_AND_DATA_OWNERSHIP_DRAFT_2026-11-24.md)：PR #34 的 WP0 历史草案，已由当前 [领域架构设计](DOMAIN_ARCHITECTURE.md) v1.4 取代。

## 5. 研究之外的设计与工程材料

- [架构评审记录](ARCHITECTURE_REVIEW_2026-11-24.md)：架构评审发现、修正记录和 M0 契约核验记录。
- [制作蓝图规范](BLUEPRINT_SPEC.md)：公共制作、单集六阶段、工作项依赖和最低交付门槛的可检查内容契约。
- [M0 契约冻结](M0_CONTRACT_FREEZE.md)：v4 状态、命令、错误码、危机白名单与存档契约。
- [常规 TV 制作蓝图样例](blueprints/tv_standard.blueprint.json)：供 schema 与依赖校验使用的结构样例，数值仍是占位量级。

- [核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)：当前玩法基线。
- [领域架构设计](DOMAIN_ARCHITECTURE.md)：当前架构设计 v1.4；遵循权威决策登记册。
- [核心工作包拆分](CORE_GAMEPLAY_WORKSTREAM_BREAKDOWN_2026-11-24.md)：研究完成后的架构与实施工作拆分；早期 D1–D6 决策包已完成裁决，不能再次当作提问清单。
- [统一重构审查清单](UNIFIED_REBUILD_REVIEW_CHECKLIST_2026-11-24.md)：历史问题和迁移检查。
- [仓库审查与合并登记](REBUILD_REVIEW_AND_MERGE_REGISTER_2026-11-24.md)：PR、分支和材料状态。

## 6. 证据使用规则

1. 先读 [权威决策登记册](DECISION_LOG.md)，确认当前玩法边界。
2. 再按问题阅读研究、审计和模拟报告，不要求每个任务重新通读全部材料。
3. 区分原始事实、研究者解释、设计建议、模拟结果和负责人决策。
4. 不得把旧代码现状、旧 V3 规则、历史审计中的建议或实验参数自动升级为新架构规则。
5. 新研究报告应写明问题、资料来源、方法、结论、限制、对现行决策的影响，并标注是否提出变更已确认决策。
