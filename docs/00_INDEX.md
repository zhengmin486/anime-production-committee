---
title: 文档索引
kind: index
status: active
owner: docs
updated: 2026-11-26
canonical_for: documentation-map
supersedes: []
superseded_by: []
---

# 文档索引

本文是本项目文档的**唯一入口**。本次整理只调整文档身份、位置和索引，不修改任何玩法规则、数值或实现口径。旧文档与新决策冲突时，按下面的权威顺序处理，不做静默合并。

## 1. 权威顺序

1. [决定登记册](decisions/DECISION_LOG.md)：负责人已确认的产品与玩法决策，规则冲突时最高权威。
2. [游戏愿景](canon/VISION.md)：产品方向、体验目标与边界；不改具体规则。
3. [核心玩法重构框架](canon/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)：系统结构与玩法框架。
4. [规范文档](canon/)：规则、数据模型、接口、架构、产品范围；必须先确认其 `status`，`legacy` 文件只作历史或迁移对照。
5. [研究与审查](research/、reviews/)：提供证据、问题与建议，不自动构成规则。
6. [计划与状态](plans/、status/)：描述“谁在什么时候做什么”和“做到哪里”，不定义新规则。

> 规则确认、架构设计、代码实现、测试通过是四个不同状态。文档写了规则不等于代码已实现；代码实现了也不等于设计已确认。

## 2. 目录与文件状态

| 路径 | 类型 | 状态 | 说明 |
| --- | --- | --- | --- |
| [decisions/DECISION_LOG.md](decisions/DECISION_LOG.md) | 决定 | active | 现行决定基线，来自历史分支最新版本；原 `DEC-*` 编号保留 |
| [decisions/INDEX.md](decisions/INDEX.md) | 决定索引 | active | 决定登记册入口与后续 ADR 规则 |
| [decisions/ADR-0001-document-architecture.md](decisions/ADR-0001-document-architecture.md) | 决定 | accepted | 本次文档分层决策，追加不改写 |
| [canon/VISION.md](canon/VISION.md) | 愿景 | active | 产品方向基线；不代表功能已实现 |
| [canon/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md](canon/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md) | 框架 | active | 系统结构与玩法框架 |
| [canon/DOMAIN_ARCHITECTURE.md](canon/DOMAIN_ARCHITECTURE.md) | 架构 | active | 领域边界、状态所有权与结算机制 |
| [canon/M0_CONTRACT_FREEZE.md](canon/M0_CONTRACT_FREEZE.md) | 契约 | active | v4 契约基线，变更需走治理流程 |
| [canon/M2_DATA_CONTRACT.md](canon/M2_DATA_CONTRACT.md) | 契约 | active | M2 运行时子集与命令矩阵 |
| [canon/ENGINEERING_CHANGE_GOVERNANCE.md](canon/ENGINEERING_CHANGE_GOVERNANCE.md) | 治理 | active | 工程变更评估与审批 |
| [canon/BLUEPRINT_SPEC.md](canon/BLUEPRINT_SPEC.md) | 规范 | active | 制作蓝图规范 |
| [canon/PRODUCT.md](canon/PRODUCT.md) | 产品范围 | legacy | V1.0 目标范围；与决定登记册冲突时以登记册为准 |
| [canon/GAME_DESIGN.md](canon/GAME_DESIGN.md) | 玩法总览 | legacy | V1.0 玩法基线；用于迁移对照，不作为新决策来源 |
| [canon/GAME_RULES.md](canon/GAME_RULES.md) | 规则 | mixed | V3 规则与 V2 历史实现混排；V2 部分仅作历史对照 |
| [canon/DATA_MODEL.md](canon/DATA_MODEL.md) | 契约 | mixed | V3 目标契约与 V2 历史模型并存；按章节状态读取 |
| [canon/API.md](canon/API.md) | 契约 | mixed | V3 目标接口与 V2 历史接口并存；按章节状态读取 |
| [canon/ARCHITECTURE.md](canon/ARCHITECTURE.md) | 架构 | mixed | 分层说明有效；v2 字段与流程是运行现状，不是目标规则 |
| [research/](research/) | 研究 | reference | 行业、项目、经济与素材调研；只提供证据 |
| [reviews/](reviews/) | 审查 | reference | 差距审查、系统审查与合入登记；结论需转成决定才生效 |
| [status/PROGRESS.md](status/PROGRESS.md) | 状态 | active | 进度与实现边界；不得作为规则源 |
| [plans/](plans/) | 计划 | active | 里程碑、分工、模块交接与开工准备单 |
| [archive/](archive/) | 归档 | archived | 历史与已取代文档，不再作为当前依据 |
| [templates/](templates/) | 模板 | active | ADR / 研究 / 审查文档模板 |

## 3. 变更流程

1. 新口径先写 ADR 或更新 [决定登记册](decisions/DECISION_LOG.md)，标明状态、证据、影响与替代方案。
2. `canon/` 规则、玩法、协议变更必须引用 ADR 或 `DEC-*` 编号；仅措辞修正除外。
3. 研究或审查发现冲突时，写进 `reviews/`，提出“变更已确认决策”，不得直接改规则。
4. 里程碑完成后，把对应计划移到 `archive/superseded/`，保留决定与审查结论。
5. 更新本文总表和被改文件的 `updated`，并运行文档链接检查。

## 4. 文件约定

- 每个 Markdown 文件开头写 front matter：`title`、`kind`、`status`、`owner`、`updated`、`canonical_for`、`supersedes`、`superseded_by`。
- `status` 推荐值：`draft`、`proposed`、`accepted`、`active`、`legacy`、`mixed`、`archived`。
- 一个主题只允许一个 `canonical_for` 为 `active` 的文件；重复内容是链接或归档，不是第二份事实源。
- ADR 一旦 `accepted` 不就地改写；变更通过新 ADR `supersedes` 旧 ADR。

## 5. 已知遗留

- `docs/FULL_DESIGN_REAUDIT_2026-11-25.md` 曾出现在清理过的分支记录中，但当前可达 Git 引用未找到正文，本次未恢复。若需要保留该报告，应从备份或远端 PR 附件恢复后再放入 `reviews/`。
- `canon/GAME_RULES.md` 的 V2 章节、旧版 `PRODUCT/GAME_DESIGN` 与现行决定登记册存在方向冲突；本次只做标记，不做规则合并。
- 素材目录：`docs/research/ASSET_CATALOG_EARLY.md` 是早期三图评估，不是正式素材库清单；正式素材库应在主线合并后单独建立索引。
