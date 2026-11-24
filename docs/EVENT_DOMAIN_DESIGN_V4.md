# Event 领域设计（v4）

- 负责人：@pyxz0；跟踪：[#11](https://github.com/zhengmin486/anime-production-committee/issues/11)
- 依据：`docs/DOMAIN_ARCHITECTURE.md` v1.4 §5.8 / §7.6 / §9.2 / §11，`docs/M0_CONTRACT_FREEZE.md`（命令 18/19、INV-23），`docs/EVENT_CARDS_WP7.md`
- 阶段：**M1 只做状态与接口兼容；M2 实现最小闭环**（触发→待处理→选择→效果→恢复周结算）。本文是设计，不含运行时实现。
- 明确不迁入 v4：顶层 `pending_event`、全局 `phase`、旧 `advance_week` 里的事件前置检查、旧 `project.event_state` 结构。

## 1. 职责边界

| Event 拥有 | Event 不拥有 |
| --- | --- |
| `events.pending` 全局唯一待处理实例 | 项目质量/进度/门槛（Project） |
| 各 `work` 的冷却、重大事件已见、暂存（预留） | 员工疲劳/士气（Staff） |
| 触发条件评估、优先级选择 | 资金入账（Finance） |
| 目录引用与选项快照 | 履历写入（Archive，由 Application） |

事件只**选择**事件并提供选项；效果由 Application 翻译成各领域的公开命令执行。Event 永不直接写 Project/Staff/Finance。

## 2. 状态模型

沿用 M0 冻结的根结构，事件相关只有三块：

```text
GameState.events = EventState {
  pending: null | EventInstance
  last_event_week: number | null
  per_work: {
    [work_id]: {
      cooldowns: { [event_id]: week },
      major_seen: event_id[],
      deferred: null | EventInstance   // 预留：M0 无对应命令，M2 不启用
    }
  }
}

EventInstance {
  event_id, work_id, episode_id: null, stage: null,
  triggered_week,
  options: [{ id, label, cost, risk_hint }],   // 快照，处理时不重算
  expires_week: null,
  escalation: null | { description, effects[] }
}
```

不变量：

- `pending` 至多一个，且必须带 `work_id`（M0 INV-23）；公司级事件需要 `work_id = null` 的扩展，M0 当前不允许，首批不做。
- `pending` 与任一 `per_work.deferred` 不同时存在。
- 同一 `work` 同时最多一个 `deferred`；有 `pending` 或 `deferred` 的项目不再触发新事件。
- 冷却按 `(work_id, event_id)` 记录；重大事件按 `work_id` 去重。
- 事件实例不下发内部 `scope/target/value`，只给 `cost` 与 `risk_hint`；效果表留在内核目录。

## 3. 状态机

```text
running / 正常周
   │  advance_week（阶段 11 事件抽取）
   ├─ 未抽中 → 无事发生，week+1
   └─ 抽中   → events.pending = instance
                → advance_week 返回「本周完成 + 待处理事件」
                → 下一次 advance_week 被拒（M0 命令 18 守卫：无待处理事件）

pending
   │  resolve_event(event_id, option_id)
   ├─ 合法 → Application 分派效果命令 → 清空 pending → 允许下一次 advance_week
   └─ 非法/现金不足 → 拒绝，pending 保持，状态不变
```

要点：

- **事件抽取在阶段 11**（交付结算之后、时间推进之前），此时本周工资、运营、制作、人员、交付都已提交；事件不参与本周账。
- **待处理不阻塞本周**，只阻塞下一次 `advance_week`。这是对旧「触发后暂停周推进」的等价改写：本周已完成的成本与产出不因事件回滚。
- **没有延后/暂存命令**：M0 命令表只有 `resolve_event`；`per_work.deferred` 是 §7.6 预留字段，M2 不启用。若将来要恢复「放弃本周」，必须先加命令并升契约，不能借 `resolve_event` 的保留参数偷偷实现。
- **危机期间不抽事件**（§9.3.1：危机周第 6 步「不抽事件」），且危机与 pending 不可能并存（M0 命令 18/19 守卫）。

## 4. 触发与优先级

```
阶段 11（仅对 producing 且本周有结算的项目）：
  1. 候选池
       表现候选：读 WeekSnapshot 的阶段质量/进度/疲劳/期限压力；
       随机候选：目录中 random_weight > 0 且冷却、去重通过；
  2. 每项目独立抽样
       draw(seed, week, stream="event:{work_id}", purpose="trigger", index=0)
       表现候选条件成立即入选，不被概率拦住；
       否则 roll < p_effective 才进入随机候选；
  3. 全局只取一条
       排序键 = (tier: major 先, priority 升序, work_id, event_id)
       其余候选丢弃，记入周回执 counters（dropped_*），不排队、不补发。
```

- 抽样用坐标式随机（§11.2），不保存计数器；同 seed + 同 week + 同 work 结果固定，**与项目遍历顺序无关**。
- 表现条件只读 `WeekSnapshot`，Event 不重复计算项目数值。
- 每周最多一条，`last_event_week` 仅用于回执与调试，不作为去重依据。

## 5. 效果命令映射

事件选项只声明「效果意图」，由 Application 翻译：

| 意图 | 目标领域命令 | 备注 |
| --- | --- | --- |
| `funds_cost` | `Finance.post_expense(category=events)` | 分类必须已冻结；不得新增收入科目 |
| `funds_gain` | **暂不支持** | 事件收入分类未定，卡片中相关选项标记待调整 |
| `quality_delta`（当前阶段） | `Project.adjust_stage_quality` | 钳制 0–100 |
| `quality_delta`（项目/单集） | `Project.schedule_quality_effect` | 阶段完成或交付时应用，不回溯已结算阶段 |
| `work_done_delta` | `Project.adjust_work` | 钳制 0–workload；不跨阶段 |
| `fatigue/morale` | `Staff.adjust_state` | 钳制 0–100，作用于实际参与该项目的员工 |
| `major_log` | `Archive.append_major_event` | 交付时由 Application 写入 `WorkRecord.major_events` |

失败语义：任一效果命令失败 → `resolve_event` 整体回滚（工作副本），pending 保持，玩家可改选其他选项。

选项类型与可用条件（沿用已确认口径）：

| 类型 | 条件 | 依赖 |
| --- | --- | --- |
| 接受后果 | 恒可用 | — |
| 加班 | 现金充足 | — |
| 应急外包 | 现金充足 ∧ 专业匹配 ∧ 供应商产能余量 | #7 Vendor（`sign_outsourcing`） |
| 延期 | 委员会模式 ∧ 未用过 ∧ 非危机 | `request_extension` |

## 6. 旧实现审查（PR #19 / #24 / #33 / #35）

| 来源 | 可复用 | 冲突 | 处置 |
| --- | --- | --- | --- |
| #19 M2-a | 目录字段（tier/polarity/tag/priority/cooldown/trigger/options）、优先级的「表现优先 + 同 seed 可复现」思路、效果钳制与账目只扣一次、`effects_preview` 的展示口径、WASM 测试场景 | 顶层 `pending_event`、全局 `phase`、`project.event_state`、`advance_week` 内联触发、`seed+week` 抽样 | **不 cherry-pick**；目录字段迁入 v4 EventDefinition，运行时按 §9.2 阶段 11 重写 |
| #24 M2-b | 期限与升级的语义（`expires_week`、escalation 原子执行）、固定费用不可跳过、暂存/恢复的失败用例 | 未到期恢复把「恢复」放在结算前、并改写周推进顺序；全局阻塞 | 只保留「期限/升级」语义；v4 无 deferred 命令，先不实现 |
| #33 事件域提案 | 归属模型（company/project）、全局单槽、按 `hash(owner)` 的顺序无关抽样、每周上限与丢弃计数、WP3 事件阶段契约 | 以 `company.pending_event` 包装、项目级状态挂在 project、包含 deferral 上限 | 作为 v4 设计输入；字段名按 M0 改为 `events.pending` / `per_work` |
| #35 事件卡片 | 8 张卡片、风险文案库、六条选项设计原则、WP7 字段映射 | 3 张含「事件给钱」的卡片与 Finance 分类冲突 | 卡片保留，`funds_gain` 待 Finance 决定；卡片 id 直接复用于 v4 目录 |

## 7. 与内容卡片（#13）的字段对齐

| 卡片字段 | v4 落点 | 说明 |
| --- | --- | --- |
| `id` / `name` | 目录 `event_id` | 全局唯一，进冷却与履历 |
| 极性 / 层级 | `polarity` / `tier` | 影响 UI 标记与排序 |
| 适用阶段 | `stages[]` | 只允许当前或后续阶段 |
| 触发方向 | 目录 `trigger` | 卡片不写阈值，数据文件写 |
| 前因/线索 | 目录 `foreshadow` 文案 | 周报预警用，不参与判定 |
| 选项（成本/收益/风险/适用） | `options[{label,cost,effects,risk_hint}]` | 卡片只写玩家可见部分 |
| 处理期限 / 超时后果 | `expires_weeks` / `escalation` | 首批卡片可全为 0 |

## 8. 测试场景（供 M2 实现）

1. 正常周结算完成后抽事件；本周工资、运营、制作成本均已入账，事件不改本周账。
2. pending 存在时 `advance_week` 返回 INVALID_PHASE，状态逐字段不变。
3. `resolve_event` 非法选项 → NOT_FOUND；现金不足 → INSUFFICIENT_FUNDS；两种情况下 pending 保持。
4. 合法选项：效果命令分派成功、pending 清空、下一次 `advance_week` 可执行。
5. 效果失败（如 quality 超界）→ 整次回滚，pending 与资金均不变。
6. 同周两个项目满足条件 → 只有一条 pending，排序键可复算；其余记入丢弃计数。
7. 同 seed、同命令序列 → 两次回放的 `state_hash` 一致；改变项目遍历顺序不改变结果。
8. 冷却期内同一事件不再触发；重大事件同项目只触发一次。
9. 危机周不抽事件；pending 与危机不可能并存。
10. 事件外包选项在供应商产能不足时返回 CAPACITY_EXCEEDED，不自动签约。

## 9. 待确认

1. **公司级事件**：M0 要求 `pending.work_id` 必填，公司级事件需要 `work_id=null` 的契约扩展；建议 M2 不做。
2. **暂存/放弃本周**：M0 无命令；若产品需要，需新增 `defer_event(event_id)` 并定义阻塞语义，不能复用 `resolve_event`。
3. **事件收入**：`funds_gain` 是否允许，以及归入哪个 Finance 分类；在决定前，卡片中相关选项不实现。
4. **每周上限**：M0 未写「每周最多一条」；§9.2 阶段 11 输出「至多一个待处理事件」，可理解为自然上限，需确认是否还要 `last_event_week` 去重。

## 10. 明确不做

- 不在 v4 代码里复活 `phase`、顶层 `pending_event`、`project.event_state`。
- 不直接 cherry-pick #19/#24 的运行时补丁。
- 不实现公司级事件、跨项目连锁效果、事件收入。
- 不在 M1 阶段写事件运行时；M2 开始前先由 M0/#38 契约确认本文第 9 节。
