---
title: 决定索引
kind: index
status: active
owner: design
updated: 2026-11-28
canonical_for: decisions-map
supersedes: []
superseded_by: []
---

# 决定索引

本目录保存两类决定文件，二者都是**追加式**记录：

- [决定登记册](../DECISION_LOG.md)：现行决定基线，原有的 `DEC-*` 编号继续有效，不迁移、不重编号。
- `ADR-*` 文件：架构级与流程级决定，一条决定一个文件；`accepted` 后不就地改写。

## 为什么要把决定单独建档

项目文档更新频率高，规则文件、研究文件和计划文件会互相覆盖。决定单独建档后：

- 规则只引用决定编号，不再重复描述口径；
- 研究与被否决方案留在原文，不需要为了“保持文档整洁”而删掉证据；
- 后人能看出某个口径是什么时候、基于什么证据改的。

## ADR 清单

| 编号 | 主题 | 状态 |
| --- | --- | --- |
| [ADR-0001](ADR-0001-decision-record-process.md) | 决定记录与文档改动流程 | accepted |
| [ADR-0004](ADR-0004-agent-decision-authority-and-local-blocking.md) | 未冻结细节的默认决策权与局部阻塞 | accepted |
| [ADR-0005](ADR-0005-document-conflict-resolution.md) | 文档权威、口径冲突与冲刺期决策闭环 | accepted |

## 新增决定的做法

1. 复制 [ADR 模板](../templates/ADR_TEMPLATE.md)，编号递增，文件名用 `ADR-0006-kebab-topic.md`。
2. 写清背景、决定、后果、被否决方案和来源；状态从 `proposed` 开始。
3. 负责人确认后改为 `accepted`，正文冻结；需要变更时新建 ADR，并用 `supersedes` 指向旧文件。
4. 在本文清单加一行，并运行 `npm run check:docs`。

## 与决定登记册的分工

- 玩法数值、经济口径、制作流程等内容仍写入 `DECISION_LOG.md`，作为唯一的规则基线。
- ADR 只记录“为什么要这样组织、这样改流程、这样定契约”，不重复抄写规则正文。
- 两者冲突时，规则内容以 `DECISION_LOG.md` 为准；流程与治理以 ADR 为准。
