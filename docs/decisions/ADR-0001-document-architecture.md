---
title: 文档分层与单一事实源
kind: adr
status: accepted
owner: docs
updated: 2026-11-26
canonical_for: documentation-architecture
supersedes: []
superseded_by: []
---

# ADR-0001：文档分层与单一事实源

## 背景

项目中存在大量决定、研究、规则、玩法、进度和分支文档，且同一主题常在多处重复。几个小时内的口径变化会让旧文档迅速失真，研究结论也容易被误当成规则。

## 决定

1. 建立 `docs/00_INDEX.md` 作为唯一入口。
2. 文档按 `canon`、`decisions`、`research`、`reviews`、`status`、`plans`、`archive`、`templates` 分层。
3. 一个主题只允许一个 active 事实源；重复内容是链接或归档。
4. 已确认决定登记在 `decisions/DECISION_LOG.md`，后续架构级决定追加 ADR，不接受就地改写。
5. 研究与审查只能提供证据；要改变规则必须先形成决定。
6. 所有 Markdown 文件加 front matter，标注 `kind`、`status`、`owner`、`updated`、`canonical_for` 与替代关系。

## 后果

- 规则冲突先看决定登记册和索引，不再靠文件修改时间猜测。
- 高频改动只影响一个当前事实源，历史以归档或 supersede 保留。
- 旧版规则与本决定冲突时保留为 `legacy` 或 `mixed`，不静默合并。
- 需要新增轻量检查脚本，验证断链、重复 canonical_for 和缺失 front matter。

## 替代方案

- 继续把所有内容放在少数大文件里：读取成本低但状态混乱，已被当前问题否定。
- 给每份研究文件直接改写规则：响应快但会让证据与规则相互污染，否定。
- 只按日期命名快照、不做索引：能追溯但无法判断当前依据，否定。

## 来源

- 2026-11-26 用户要求整理高频变动的决定、研究、规则与玩法文件。
- 当前仓库与各历史分支文档盘点结果。
