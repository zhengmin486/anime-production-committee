# 限时事件一次升级与二次超时（#121 / DEC-EVENT-003）

> 规则来源：M0 §14.11、DECISION_LOG `DEC-EVENT-003`、#121 负责人裁决（2026-11-27）。
> 实现基线：`feat/121-escalation-runtime`。本文描述**已落地**的语义，不新设规则。

## 1. 三类超时的唯一路径

| 状态 | 阶段 7 行为 | pending 结果 |
| --- | --- | --- |
| 未到期（`week < expires_week`） | 不处理 | 原样保留 |
| 到期、未升级 | 执行 `timeout_option_id`（没有则退到 `abandon` → `decline`）的**轻罚**，然后原地升级 | **保留**：替换选项快照、设 `escalated=true`、新期限 = 本周 + 1（2 周窗口） |
| 到期、已升级 | 执行 `escalation.timeout_option_id` 的**硬罚**，自动处理、不需玩家确认 | **移除** |

要点：

- 身份不变：沿用原 `(work_id, event_id)`，`triggered_week` / `viewed` / 项目归属都不改。
- 最多升级一次：升级后 `escalated=true`，第二次到期只会走硬罚分支，不会再次续期。
- 不乘倍：硬罚数值完全来自升级选项的预设 `cost` / `effects`；运行时不做任何乘法，也不推导固定倍数。
- 只处理目标事件：按 `(work_id, event_id)` 排序逐条处理，同周其他项目 pending 原样保留。
- 轻罚与硬罚都沿用 §14.12 的现金封顶（以当前余额为上限），不产生欠款、递延或负现金。

## 2. 字段契约

内容卡（`content/events/<id>.json`，schema v1）：

```text
expires_weeks        : 1..8（升级卡必须 > 0）
tier                 : major（升级卡必须）
timeout_option_id    : string，指向本卡 options[] 中 kind=abandon|decline 的一项（首次超时轻罚）
escalation           : null | {
  description        : string
  expires_weeks      : 2（固定，其他值整卡拒绝）
  options            : 与主 options[] 同 schema 的替换选项，必须含 abandon
  timeout_option_id  : string，指向 escalation.options 中 kind=abandon|decline 的一项（二次硬罚）
}
escalation_note      : string | null，定性风险提示，不写数值
```

约束：`escalation` 只在限时 `major` 卡上允许；最多一层，嵌套 `escalation` 非空即拒绝；悬空选项引用整卡拒绝。JS 校验器（`scripts/lib/event-schema.mjs`）与 C++ 目录校验（`event::parse_catalog`）执行同一套规则，`npm run validate:content` / `validate:events` 与 WASM 契约测试都会覆盖。

pending 快照（持久化）：

```text
timeout_option_id : string     // 首次超时轻罚分支
escalated         : bool       // 是否已升级
escalation        : null | { description, expires_weeks: 2, triggered_week, options[], timeout_option_id }
```

旧存档缺这三个字段按 `"" / false / null` 处理，不补字段、不推进周数、不改变未来随机结果；JSON 往返后 `hash_state` 稳定。已登记到 `docs/v4-contract-shape.json`。

## 3. 回执与对账

超时处理写入既有 `report.events.expired[]`（`work_id / event_id / option_id / automatic`），形状不变：

- 首次超时：`option_id` 为轻罚分支 id，事件仍在 pending 且已升级；
- 二次超时：`option_id` 为预设硬罚分支 id，事件已移出 pending。

费用走 `category=events` 的唯一账本，`work_id` 与 `memo=event_id` 归因；同一事件的轻罚、硬罚因处理周不同，账本 id 不冲突。任一步失败由 `advance_week` 的阶段快照回滚，不返回半状态。

## 4. 测试矩阵

契约用例（`scripts/v4.test.mjs`，原生 MSVC 重放 **151/151**）：

| 场景 | 用例 |
| --- | --- |
| 合法升级卡可加载、非法配置按字段定位 | `事件内容：非法卡被拒绝并定位到卡片与字段` |
| 首次超时轻罚 + 原地升级 + 固定 2 周 + 身份保留 | `#121 首次超时：…固定 2 周新期限且身份不变` |
| 二次超时预设硬罚、移除 pending、不乘倍 | `#121 二次超时：…不乘倍` |
| 只处理目标事件、其他项目 pending 不变 | `#121：升级只处理目标事件…` |
| 升级快照 JSON 往返、哈希稳定 | `#121 升级快照 JSON 往返…` |
| 同输入重放逐位一致 | `#121 同样输入重放…` |
| 硬罚现金封顶、不产生负余额 | `#121 二次硬罚沿用现金封顶…` |
| 非法快照原子拒绝 | `#121 非法升级快照原子拒绝…` |

## 5. 边界

- 惩罚数值（质量/声望扣减、硬罚金额）由内容卡预设，运行时不标定、不乘倍；具体数值属内容侧与数值标定，不在本议题冻结。
- `escalation_note` 只进内容层，不写入 pending 快照；UI 如需展示，应从卡内容读取，不影响状态哈希。
- 主动 `resolve_event` 处理已升级事件时，使用的是升级后的替换选项快照，效果在触发时冻结。
