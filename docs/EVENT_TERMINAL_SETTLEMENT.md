# Event 终局 pending 的结清语义（#120）

- 负责：Event @pyxz0；契约与终局裁决：zm（[#53](https://github.com/zhengmin486/anime-production-committee/issues/53)）
- 跟踪议题：[#120](https://github.com/zhengmin486/anime-production-committee/issues/120)
- 依据：M0 §14.7（预检失败直接破产）、§14.11（限时事件默认保守分支）、§14.12（查看与处理分离）、INV-23 / INV-25；DEC-EVENT-001（交付/关闭不得丢弃 pending）
- 状态：**强制终局路径已实现并有契约测试；M2.5 核心出口已通过验收并合并。2026-11-27 裁决 A1（不加归档级索引）+ B1（仅强制终局封顶）已收口**，待验证回报后由 zm 复核关闭 #120。
- 裁决记录（2026-11-27，#120）：A1——不新增 `company_result.pending_closures[]`，回执 + Finance 流水为唯一对账依据；B1——扣罚上限仅适用 `bankrupt/time_limit`，`penalty_waived` 限定为「终局可用现金不足而未能收取的部分」，不是规则豁免，不改变名义扣罚金额。

## 1. 问题

PR #95 落地了关闭、破产与第 520 周三条终局路径，但携带 `events.pending[]` 时：

| 路径 | 原行为 |
| --- | --- |
| 主动关闭 `end_company` | `INVALID_PHASE`，要求玩家先逐条处理（DEC-EVENT-001，符合预期） |
| 资金预检失败破产 | 原子返回 `NOT_IMPLEMENTED`，周推进无法完成 |
| 第 520 周终局 | 阶段 8 原子返回 `NOT_IMPLEMENTED` |

后两条是**强制终局**：玩家已经没有决策机会，游戏不能既要求结清又拒绝执行，否则公司会永久卡在无法关闭的状态。同时 `close_company` 会把在制项目转 `delivering`，而 INV-23 要求 pending 的归属项目必须处于 `producing`，所以「保留 pending 直接关闭」本身也是非法状态。

## 2. 三类终局的唯一语义

| 终局 | 触发 | pending 语义 | 实现位置 |
| --- | --- | --- | --- |
| 主动关闭 | 命令 20 `end_company` | **拒绝**，玩家先逐条处理；不代玩家做选择 | `end_company` 入口守卫 |
| 破产 | `advance_week` 阶段 2 预检失败 | **先结清再关闭**：默认保守分支逐条执行，再走 §14.7 破产关闭 | `advance_week` 阶段 2 |
| 第 520 周 | `advance_week` 阶段 8 | **先结清再关闭**：阶段 7 已处理本周到期事件，其余在此结清 | `advance_week` 阶段 8 |

「结清」= 对每条 pending 执行事件卡冻结快照里的默认消极/保守分支，然后从 `events.pending[]` 移除。这不是清空：选项效果、费用与冷却/重大标记都按正常结算路径落地。

## 3. 结清规则

1. **顺序固定**：按 `(work_id, event_id)` 字典序处理，与 `pending[]` 数组顺序、项目遍历顺序无关；同 seed、同状态、同命令序列结果一致。
2. **默认分支**：优先 `kind=abandon`（负向事件）；没有 `abandon` 时取 `kind=decline`（正向事件按内容规范必须提供 `accept` 与 `decline`）。两者都没有则按 `INVALID_STATE` 拒绝，不猜玩家意图。
3. **费用封顶**：沿用 §14.12 的自动结算口径，事件强制支出以当前余额封顶，不得让现金转负（`funds` 效果同样封顶）。
4. **账本与归因**：费用进唯一 Finance 账本，`category=events`、`work_id` 归因到项目、`memo` 为事件 id；不新增收入类目，不产生欠款或递延。
5. **原子性**：逐条提交；任一条失败，调用方回滚到阶段快照并返回错误，不返回半状态、不清空事件。
6. **不新增持久字段**：`events.pending[]`、`State`、存档形状都不变；旧存档无需迁移。

## 4. 回执与对账

结清明细复用阶段 7 已登记的 `report.events.expired[]` 形状，不新增字段：

| 字段 | 含义 |
| --- | --- |
| `work_id` / `event_id` | 被结清的事件身份 |
| `option_id` | 实际执行的默认分支 |
| `automatic` | 恒为 `true`（非玩家选择） |

- 破产：`report.events = { drawn: 0, reason: "bankrupt", expired: [...] }`，`report.funds.balance` 为结清后的真实余额，`report.funds.delta` 等于本次终局现金净变化（含事件费用），不含被跳过的周刚性支出。
- 第 520 周：`report.events.expired` = 阶段 7 到期事件 + 阶段 8 终局结清，按处理顺序合并。
- 现金变化可用 `finance.entries`（`category=events`）逐条对账；`archive.works[].finance_summary.penalty` 只记实付扣罚，与账本一致。

## 5. 破产终局的扣罚上限（已裁决 B1）

破产与第 520 周都要经过 `close_company` → `finalize_delivery` 的项目结清。原实现里未达门槛的项目要吃 `kForcedPenaltyPermille`（30%）扣罚，而 `close_company` 要求结清后余额非负：

- 破产时余额通常只剩几千到几十万，合同预算却是百万级，扣罚必然超过余额；
- 结果是**任何带合同项目的破产都永远无法完成**（无 pending 时同样失败），`advance_week` 只能返回 `INSUFFICIENT_FUNDS`。

按 INV-25（余额不得为负）与 §14.7（直接破产终局）无法同时成立，当前实现取「可支付额 = 现有现金 + 本次商业收入」为上限：

- 扣罚公式不变（`预算 × 缺口 × 30%`），只加可支付上限；
- 超出部分在结清回执里记 `penalty_waived`，不产生欠款、递延或负现金；
- 仅对 `end_reason ∈ {bankrupt, time_limit}` 生效；**主动关闭仍按原口径原子拒绝**，避免用关闭逃避扣罚。

> **裁决 B1（2026-11-27）**：保留封顶，仅适用 `bankrupt` / `time_limit` 终局清算；玩家主动 `voluntary` 关闭不封顶，现金不足仍原子拒绝。`penalty_waived` = 名义扣罚 − 实付扣罚，语义是「因终局可用现金不足而未能收取」，不是规则豁免，也不改变名义扣罚金额。归档 `finance_summary.penalty` 只记实付，与唯一账本一致；不新增持久字段。

## 6. 不变式与测试

| 覆盖点 | 用例 |
| --- | --- |
| 破产 + 单项目 pending 结清、费用落账 | `#120 破产终局：pending 按默认保守分支结清…` |
| 多项目 pending 的稳定顺序与确定性 | `#120 多项目 pending：按 (work_id,event_id) 稳定顺序结清…` |
| 现金不足时按余额封顶、不为负 | `#120 终局结清沿用现金封顶…` |
| 强制终局扣罚封顶、归档与账本一致 | `#120 破产终局：在制合同项目的扣罚按可支付现金封顶…` |
| A1：回执与账本逐条对账、round-trip 后一致、无归档索引字段 | `#120 A1：结清明细可由 expired[] 与 Finance 流水逐条对账…` |
| B1：voluntary 不套用终局封顶、现金不足原子拒绝 | `#120 B1：主动关闭（voluntary）不套用终局封顶…` |
| 无默认分支时原子回滚 | `#120 终局结清失败时原子回滚…` |
| 第 520 周结清后锁 closing/time_limit | `#120 第 520 周：pending 结清后再锁 closing/time_limit…` |
| 阶段 7 到期与阶段 8 终局结清的合并顺序 | `#120 第 520 周：阶段 7 到期事件与阶段 8 终局结清按处理顺序合并` |
| 存档 round-trip 不补字段、不推进周数、哈希稳定 | `#120 结清/未结清状态都能 JSON 往返…` |
| 主动关闭仍拒绝（行为不变） | `DEC-EVENT-001：待处理事件阻止交付与关闭…` |
| 关闭预演仍原子拒绝（行为不变） | `M2 关闭预演：无法非负结清时拒绝进入不可逆 closing` |

相关不变式：INV-23（pending 归属必须在制）、INV-25（余额非负）、INV-16（余额 = 期初 + 流水合计）、INV-02（账本 id 唯一）。

## 7. 已收口与边界

| 项 | 依赖 | 当前处理 |
| --- | --- | --- |
| 归档级结清索引 | #120 裁决 A1 | **不新增字段**；`report.events.expired[]` + Finance 流水为对账依据，旧档零迁移 |
| 破产扣罚封顶口径 | #120 裁决 B1 | **已冻结**；仅 `bankrupt/time_limit`，`penalty_waived` 为未收部分，voluntary 不封顶 |
| 限时升级、二次超时硬罚 | #121（内容字段 #13 + 契约 #53） | 未实现，`expires_weeks≠0` 的升级配置仍拒绝加载 |
| 存档恢复后 pending 语义 | #49 | 本次不新增字段，JSON round-trip 形状不变 |
| 应急外包、公司级/跨项目事件 | #122、#123 | 不涉及 |

## 8. 验证证据

- 本机：MSVC 19.51 原生 CLI + `scripts/v4.test.mjs` 全文重放，**146/146 通过**（基线 `main@8ac373d`，含本次新增的 2 条 A1/B1 用例）。
- `npm run typecheck`：通过。
- `npm run test:v4`、`npm run audit:v4`、`npm run check:docs` 需 emsdk/Python 环境，由 CI 执行；本机无 emsdk，不以原生结果替代真实 WASM 证据。
