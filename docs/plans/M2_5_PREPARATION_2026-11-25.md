---
title: M2.5 资金危机开工准备单
kind: plan
status: proposed
owner: core
updated: 2026-11-26
canonical_for: m2.5-preparation
supersedes: []
superseded_by: []
---

# M2.5 资金危机｜开工准备单（2026-11-25）

> 本文只做开工准备与边界确认，**不改玩法规则、不改 DECISION_LOG、不代表 M2.5 已实现**。
> 实现仍须按 M0 契约变更流程处理；文中标 `[PLACEHOLDER]` 的是数值胶水，不是平衡结论。

## 1. 结论

可以开始 M2.5，但必须**从 M2 分支 stacked 开工**，不要从当前 stale `main` 或其他旧模块分支起：

- 基线：`feat/m2-delivery-closeout-20261125` @ `81bdce7`（含 `main befa2c8` + M1 收尾 `5930031`）。
- 该基线已经提供 `start_work / deliver_work / abort_work`、强制交付、Archive、`finance.solvency` 必填校验。
- 事件分支、存档分支、招聘/委员会分支均未合入这条基线；M2.5 不等待它们，但必须先修掉与它们接口相关的守卫形状。

准备分支：`prep/m2.5-crisis-20261125`（本文所在分支）。

## 2. 已确认、不可在 M2.5 重开的规则

| 来源 | 约束 |
| --- | --- |
| DEC-FIN-002 | 资金不足进入**限时危机**，不立即破产、不自动借款。 |
| DEC-FIN-003 | 危机期推进周数；继续计工资、运营、贷款还款与利息；**不计制作费、不生产**；现金可暂时为负。 |
| M0 §7 | 危机白名单由应用层统一判定：`arrange_financing / dismiss_staff / abort_work / set_work_plan / assign_staff / deliver_work / advance_week / end_company` 允许；`start_work / sign_outsourcing / hire_* / scout / buy_tv_service / create_custom_offer / adopt_proposal / request_extension` 禁止。融资是唯一新增资金动作。 |
| INV-25 | `balance < 0` 只允许在 `solvency=crisis` 或 `company.status=closing(bankrupt)`；正常经营结束时不得为负。 |
| DEC-STAFF-003/004 | 危机中可解雇核心员工，无预付遣散费；公司至少保留 1 名核心员工；临时员工不开放常规提前解约。 |
| DEC-FIN-001 | 应收款不等于到账；首版按约定时点直接到账，不引入跨周挂账。 |

## 3. M2 现状与缺口

| 缺口 | 现状 | 影响 |
| --- | --- | --- |
| 预检失败无危机路径 | `advance_week` 只返回 `INSUFFICIENT_FUNDS`，状态完全不变 | 时间可无限挂起，期限与破产不存在 |
| 无自救命令 | 没有 `arrange_financing`、`dismiss_staff` | 玩家无法执行白名单中的核心自救动作 |
| 贷款未成型 | `finance.loans` 是未校验的 `Json::array()` | 还款/利息无法进入强制费用，哈希与校验都不可靠 |
| 公司状态守卫漏两处 | `set_plan`、`assign_staff` 未检查 `company.status` | 破产后仍能改计划与归属 |
| 事件形状漂移 | 现实现用 `events.pending = null` 或单对象；M0 契约是 `pending[]` 可为空数组 | 数组空事件会把 `!is_null()` 守卫误判为“有事件”，阻塞危机周推进 |
| 危机后磨合口径冲突 | 架构 §9.3.1 写“不写 `last_participation`”，INV-11 要求其只能为 `week-1` 或 `null` | 危机周推进后保留旧记录会直接违反 INV-11 |
| 危机历史字段冲突 | 架构写 `solvency.history`，M0 状态表与当前 model 没有该字段 | 直接加字段属于存档形状变更，需走 M0 变更流程 |

## 4. 建议的最小实现切片

### 4.1 命令

| 命令 | 实现边界 |
| --- | --- |
| `arrange_financing(provider, amount)` | 仅 `solvency=crisis` 可借（资金压力周阈值未标定，先不做）；写入结构化 loan；本金入账；数量与利率参数 `[PLACEHOLDER]`；失败时状态逐字段不变。 |
| `dismiss_staff(staff_id)` | 允许在 normal/crisis；保留至少 1 名 core；清空 `assignment_work_id`；不收遣散费；不写临时员工解约。 |
| `advance_week` | 正常预检失败 → 进入 crisis 并走危机结算；crisis 中预检通过 → 当次恢复 normal 后走正常结算；crisis 中预检仍失败 → 继续危机周；期限耗尽 → `company.status=closing`、`end_reason=bankrupt`。 |

### 4.2 危机结算（独立 7 步）

1. 守卫：`running`、无待处理事件、周数未到上限。
2. 固定成本入账：工资 + 运营 + 贷款还款 + 利息；**不计制作费**。
3. 人员按“本周未参与”结算：疲劳恢复、士气恢复、无经验；`last_participation` 置 `null`，但 `item.contributors` 保留（HO-09 不扣磨合）。
4. 允许负余额；不自动借款。
5. `week + 1`。
6. 期限判定：到 `deadline_week` 且下周强制费用仍无法覆盖 → 破产；否则保持 crisis。
7. 返回危机回执：缺口、剩余周数、受影响项目、可用动作；回执只展示，不写新存档字段。

### 4.3 状态与参数

- **不改存档形状**：使用现有 `finance.solvency.{state,since_week,deadline_week,gap}`；`loans` 只做结构化校验，不新增 `solvency.history`。
- 危机历史先写入 `report` 与 ledger memo；若后续确认需要入档，单独走 M0 变更。
- `[PLACEHOLDER]` 集中在常量区：`crisis_weeks`、`financing_max_multiple`、`interest_rate_permille`、`repayment_weeks`。不得散落到各命令。

## 5. 开工前必须定的三个实现口径

这三条不是玩法改判，只是把文档冲突落成可执行口径；确认后再写代码：

1. **`last_participation`**：危机周统一置 `null`。理由：满足 INV-11，且 `contributors` 保留已能保证 HO-09“危机后回到原工作项不扣磨合”。架构 §9.3.1 的“不写”表述应改为“不写新的参与事实；清空参与周”。
2. **`solvency.history`**：M2.5 不加入档。理由：M0 未冻结该字段；临时加字段会破坏 round-trip 契约。
3. **`events.pending[]`**：在 M2.5 第一个提交里把守卫改为“数组且非空才阻塞”，`initialize` 初始化为 `[]`。理由：M0 契约已经改成多事件数组，旧 `null/单对象` 是分支漂移。

## 6. 测试清单（出口证据）

- [ ] 正常预检失败：不扣费、不生产、不推进周；`solvency=crisis`、gap/期限正确；失败前后状态差异只来自危机状态写入。
- [ ] `arrange_financing` 超额/非法 provider 失败：逐字段哈希不变。
- [ ] 融资成功：本金入账；loan 结构完整；下周强制费用包含还款 + 利息。
- [ ] 危机白名单：允许命令可执行；`start_work` 等禁止命令返回 `CRISIS_COMMITMENT_BLOCKED`。
- [ ] 危机周：只计固定成本、允许负余额、不生产、周数 +1、`last_participation=null`。
- [ ] INV-25：normal/running 下余额不为负；crisis 与 bankrupt/closing 下允许负余额。
- [ ] 恢复：危机中 `deliver_work` 回款后，下一次 `advance_week` 预检通过 → `solvency=normal`。
- [ ] 破产：期限耗尽且预检仍失败 → `closing/bankrupt`；之后所有经营命令被拒。
- [ ] 磨合回归：危机后回到原工作项不触发 item_loss / supervisor_loss（HO-09）。
- [ ] `state_hash`：loan 与 `events.pending[]` 顺序规范化；同输入可复现。
- [ ] 既有 M2 用例全绿；本机无 emsdk 时只能记录 MSVC 临时壳结果，不宣称 `npm run test:v4` 已通过。

## 7. 文件边界

预期改动集中在：

- `packages/game-core/include/apc/v4/model.hpp` / `src/v4/model.cpp`：Loan 结构化、solvency 编解码校验。
- `packages/game-core/src/v4/runtime.cpp`：危机分支、命令守卫、统一白名单、回执。
- `packages/game-core/include/apc/v4/runtime.hpp` / `bindings/v4_bindings.cpp`：导出两个新命令。
- `scripts/v4.test.mjs`：新增上述用例。
- `docs/M2_5_CRISIS_SLICE.md`、`docs/status/PROGRESS.md`：实现说明与状态同步。

不得在 M2.5 内修改：`DECISION_LOG.md`、`GAME_RULES.md`、`M0_CONTRACT_FREEZE.md`（除非先走契约变更流程）。

## 8. 明确不做

- 不做自动借款、跨周应收、分期回款。
- 不做招聘、外包、委员会、渠道、设施、声望更新。
- 不做事件内容闭环；只修正事件数组守卫形状。
- 不做参数平衡；只放可替换的 `[PLACEHOLDER]` 常量。

## 9. 下一步

确认第 5 节三条口径后，从 `prep/m2.5-crisis-20261125` 再切实现分支（建议 `feat/m2.5-crisis-20261125`），按“守卫 → 状态机 → 命令 → 测试 → 文档”的最小顺序落地。本文不合并、不改 main。
