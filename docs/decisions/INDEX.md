---
title: 决定索引
kind: index
status: active
owner: design
updated: 2026-11-26
canonical_for: decisions-map
supersedes: []
superseded_by: []
---

# 决定索引

本目录保存两类决定文件：

- [DECISION_LOG.md](DECISION_LOG.md)：现行决定登记册，原有的 `DEC-*` 编号继续有效。
- `ADR-*` 文件：本次整理后新增的架构级或流程级决定，一条决定一个文件，接受后不就地改写。

## 现行登记册章节

| 章节 | 主题 |
| --- | --- |
| 1 | 决策状态与引用规则 |
| 2 | 核心制作结构 |
| 3 | 人员与资源 |
| 4 | 项目经营与自动化 |
| 5 | 设施与成长 |
| 6–10 | 财务、时间、自动化边界与维护原则 |
| 11 | 2026-11-25 集中裁决归档 |
| 12 以后 | 后续集中裁决与分项规则 |

## ADR 清单

| 编号 | 主题 | 状态 |
| --- | --- | --- |
| [ADR-0001](ADR-0001-document-architecture.md) | 文档分层与单一事实源 | accepted |

## 新增决定规则

1. 复制 [ADR 模板](../templates/ADR_TEMPLATE.md)，编号递增。
2. 写明背景、决定、后果、替代方案和来源；状态从 `proposed` 开始。
3. 负责人确认后改为 `accepted`，不再修改正文；需要变更时新建 ADR 并用 `supersedes` 指向旧文件。
4. 同步更新 [文档索引](../00_INDEX.md) 和本文清单。
