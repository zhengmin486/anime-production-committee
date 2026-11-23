# 制作事件模块设计（M2 实现方案）

- 模块负责人：@pyxz0；内容协作者：@Muchbv（见 [#13](https://github.com/zhengmin486/anime-production-committee/issues/13)）
- 跟踪议题：[#11](https://github.com/zhengmin486/anime-production-committee/issues/11)
- 依据：`docs/TEAM_DELIVERABLES/EVENT_MODULE.md` 的 15 条已确认规则、`docs/GAME_RULES.md` V3.2 第 7 步与第 8 节
- 状态：**M2-a 已实现（`feat/11-event-m2a-core`，PR #19）；M2-b 按第 5 节实现放弃与超时闭环**。本文档不修改其他已冻结规则；标「契约扩展」的条目仍需批注后才能进核心。

## 1. 现状（按 main 代码核对）

| 位置 | 现状 | 结论 |
| --- | --- | --- |
| `apps/web/src/types/gameV3.ts` 的 `GameEvent` | 只有 `id/category/stage/title/description/trigger/options` 七个字段，`EventOption` 只有 `id/label/cost/allows_reconfigure/disabled_reason` | 表达不了极性、重大/普通、处理期限、已知代价清单 |
| `game_core.cpp` 的 `check_event` | 显式拒绝 `effect` / `effects` 字段，`option` 同 | 效果必须留在核心目录，wire 上不接受自造效果 |
| `game_core.cpp` 的 `resolve_event` | `event_pending` 时返回 `not_allowed`「效果目录尚未接入」 | 事件结算完全未实现 |
| `advance_week` 的事件节点 | 不存在，`preview.event_probability_per_mille` 恒为 0 | 触发器未实现 |
| 状态机 | `phase=event_pending`、`pending_event`、`check_phase_invariants` 已预留 | 状态位可用，但没有产生路径 |

`feat/11-event-m2a-v2`（提交 `b16c60a`）已实现一版最小目录 + 结算，触发器用 `event_trigger_enabled=false` 关着。它覆盖不到本文档第 3 节之后的内容，**以本文档为实现的唯一依据**。

## 2. 数据模型

### 2.1 内容层（`docs/event_catalog.example.json`，由内容协作者维护）

```jsonc
{
  "id": "director_illness",       // 稳定标识，进履历与冷却键
  "name": "作画监督病倒",
  "polarity": "negative",         // negative | positive
  "tier": "major",                // normal | major
  "category": "personnel",        // personnel|quality|budget|schedule
  "stages": ["key_animation", "animation_check"],
  "tag": "major_director_illness",// 冷却分组键
  "priority": 1,                  // 1–100，越小越优先
  "cooldown_weeks": 0,            // 普通事件用；重大事件必须为 0
  "once_per_project": true,
  "trigger": { "metric": "max_fatigue", "op": ">=", "threshold": 65 },
  "random_weight": 0,             // >0 才进随机池
  "expires_weeks": 0,             // >0 需要 escalation
  "escalation": null,
  "description": "……",
  "options": [ /* 1–4 项 */ ]
}
```

效果项：`{ scope: instant|stage|project, target: quality|work_done|fatigue|morale|funds, value, stage? }`。

- `stage` 作用域不写 `stage` 时表示**触发时的当前阶段**；写了表示该事件适用阶段内的某个后续阶段。
- `fatigue / morale / funds` 只能即时结算，避免未来周期的资金与人事账无法对账。
- `work_done` 不能作用于 `project`，工作量只属于具体阶段。

字段级校验由 `node scripts/validate-event-catalog.mjs` 执行，内容协作者提交前必须跑通。

### 2.2 运行态（契约扩展，需要批注）

`pending_event` 增加 5 个只读字段：

| 字段 | 类型 | 用途 |
| --- | --- | --- |
| `tier` | `"normal" \| "major"` | 界面标记与履历判定 |
| `polarity` | `"negative" \| "positive"` | 选项语义、按钮文案 |
| `expires_week` | `number \| null` | 绝对截止周；`null` 表示无期限，达到该周时不再提供处理机会 |
| `escalation_note` | `string \| null` | 超时后果的**定性**描述，不泄露精确数值 |
| `effects_preview` | `string[]`（在 option 上） | 已知代价清单，如「疲劳 +6」「本阶段质量 +4」 |

`project` 增加 `event_state`：

```jsonc
"event_state": {
  "cooldowns": { "quality_rework": 18 },  // tag -> 解锁周
  "major_seen": ["director_illness"],
  "deferred_event": null,                 // 放弃本周处理后暂存；下一次推进周数时恢复/超时
  "pending": [                            // 已选但尚未生效的阶段/项目效果
    { "source_event": "director_illness", "scope": "stage", "stage": "animation_check",
      "target": "quality", "value": -5, "applied": false }
  ]
}
```

`history[]` 增加 `major_events`：

```jsonc
"major_events": [{ "id": "director_illness", "name": "作画监督病倒",
                   "choice": "overtime", "result": "quality_plus_2" }]
```

普通事件不逐条进履历，按项目汇总为计数即可（规则 15）。

校验器改动清单（`game_core.cpp`）：

1. `check_event` 增加 `tier` / `polarity` / `expires_week` / `escalation_note` 的枚举与范围校验；`effects_preview` 限 4 条、每条不超过 24 字。
2. `check_project` 增加 `event_state`：`cooldowns` 键必须是已知 `tag`、值不超过 `max_weeks`；`major_seen` 不重复；`pending` 项的阶段必须不早于当前阶段。
3. `check_work_record` 增加可选 `major_events`，旧档缺省视为空数组，不做迁移。
4. `check_phase_invariants`：`event_pending` 时 `pending_event.stage` 必须等于 `project.current_stage`（现有逻辑已覆盖）。

## 3. 触发算法（V3.2 第 7 步）

```
进入事件节点（仅 status=running && phase=producing && 当前阶段 active）：
  1. 若 pending_event 非空 -> 不抽（理论上被 phase 挡住，双保险）
  2. 候选池 = 目录中满足全部条件的条目：
       stage ∈ 当前阶段
       且 cooldowns[tag] <= 当前周（无记录视为满足）
       且 (!once_per_project || id ∉ major_seen)
       （不做资金/供应商可用性过滤：不可用的选项由 disabled_reason 表达，
         否则玩家会因为「买不起」而看不到事件，等于隐藏信息）
  3. 表现候选 = 候选池中 metric 条件成立的条目
  4. 抽取一次 u = next_seed(seed)；用 u % 1000 得到 roll
     - 表现候选非空：直接进入第 5 步，**不因 roll 失败而丢弃**（表现触发是确定性的）
     - 表现候选为空：若 roll >= p_effective 则本周无事件（种子照常消耗）
  5. 选定：
       取最小 priority 的所有条目（同级可能多条）
       若同级只有 1 条 -> 直接选中
       若同级多条 -> index = floor(u * n / 2^32)，用同一次 u 决定
     即：优先级比较不消耗额外种子，平级才用同一次抽样打破
  6. 生成 pending_event（含 expires_week、effects_preview），phase=event_pending，
     该周其余推进已结算完毕，不再触发第二个。
     expires_weeks > 0 时，expires_week = 触发周 + expires_weeks；
     触发当周不消耗期限。expires_weeks = 0 表示无期限。
```

`p_effective` = `clamp(60 + 修正, 0, 300)`‰。修正项：项目已开工周数每满 4 周 +10；最高疲劳 ≥ 70 再 +20；现金低于两周支出 +15。全部 `TODO(待定)`。

**确定性要求**：候选池遍历顺序为目录声明顺序；同优先级再用 `id` 字典序兜底。禁用 `std::unordered_map` 参与选序，避免平台差异。

**实现说明（2026-11-23）**：实际代码用 `next_seed(seed + week * 2654435761)` 取低位作为**无状态混合**，不写回 `GameState.seed`。这样同 seed + 同周 + 同状态可复现，同时不改变 M1 固定种子轨迹、市场轮换和既有黄金数据；平级候选用同一次混合值的次低位选择。代价是它不属于「新增种子消费点」，不需要重写既有 RNG 协议。

## 4. 效果结算

选择后按固定顺序执行，任一步失败则整体失败（原子）：

1. 资金预检：`option.cost` 必须 ≤ 当前现金，否则该选项 `disabled_reason`，不可选。
2. 扣款一次，记 `events` 账目（八类账目里已有）。
3. 即时效果：`funds` → `quality/work_done`（当前阶段，钳制到 `[0, 100]` / `[0, workload]`）→ `fatigue/morale`（钳制 `[0, 100]`）。
4. 阶段/项目效果写入 `project.event_state.pending`，不立即改数值。
5. 清空 `pending_event`，`phase=producing`，`refresh_preview`。

阶段效果在**该阶段完成写 StageResult 时**应用；项目效果在**交付结算时**应用。两者都只影响尚未结算的部分，符合规则 8 的「不追溯」。已 `completed` 的 StageResult 不得被事件回改——测试要专门覆盖。

## 5. 处理期限与主动放弃（zm 已确认）

事件触发后暂停正常周推进，但玩家可以主动放弃**本周**的处理机会。放弃不是永久放弃，也不是删除事件；它只是允许玩家结束当前周并进入下一周。游戏时间完全由玩家点击「下一周」推进，不使用现实时间、后台计时器或操作次数计时。

### 5.1 状态与操作

- `event_pending`：事件当前等待处理，阻止点击「下一周」。
- 玩家选择处理选项：按第 4 节结算，事件处理完成，恢复正常周推进。
- 玩家选择 `abandon`：放弃本周处理机会，将完整事件数据（包括 `expires_week`、升级配置等）保存到 `project.event_state.deferred_event`，清空当前 `pending_event` 并恢复正常周推进。
- `deferred_event` 存在时，玩家可以完成本周剩余操作；点击「下一周」后，事件必须优先于新一周的任何正常结算重新出现，或在期限届满时直接升级结算。

### 5.2 期限计算与优先级

- `expires_weeks = 0`：事件没有处理期限，不发生超时升级。
- `expires_weeks > 0`：生成事件时设置 `expires_week = 触发周 + expires_weeks`。触发当周不消耗期限。
- 玩家放弃后，只有点击「下一周」才推进期限；每次成功推进一周，游戏周数自然增加，期限随之减少，不存在独立计时器。
- 点击「下一周」时，必须先处理暂存事件，再执行新一周的正常结算：
  1. 推进游戏周数。
  2. 检查暂存事件的截止周。
  3. 若当前周**早于**`expires_week`，立即恢复为 `pending_event`，设置 `phase=event_pending`，阻止该周其他正常结算继续执行。
  4. 若当前周**达到或超过**`expires_week`，不再恢复可处理状态，立即执行 `escalation` 超时升级结算；升级结算完成后，才允许继续该周正常结算。
- 因此，玩家不能通过放弃事件、推进周数或卡作品结算来绕过事件。若推进后的期限恰好归零，超时升级优先发生，玩家没有额外的零周处理机会。
- 事件选项所采取的措施仍按各自系统的实际规则与生效时机执行；选择事件选项不意味着所有后续效果都在点击瞬间生效。

### 5.3 实现约束

- `abandon` 必须保留事件原始数据，不得清除冷却、重大事件一次性标记或升级信息。
- `deferred_event` 与 `pending_event` 不得同时存在；状态校验必须保证这一点。
- `deferred_event` 存在时，`advance_week` 不得先执行工资、运营、项目阶段完成或作品交付等新一周结算，再检查事件。
- 超时升级必须原子结算；升级完成后清除暂存事件，防止重复触发。
- 无期限事件（`expires_weeks=0`）被放弃后，下一周仍立即重新进入 `event_pending`，不会因没有截止周而丢失。
- 确定性要求不变：相同初始状态、决策与种子必须得到相同的事件恢复/超时结果。

## 6. 选项可用性与跨系统调用

| 选项类型 | 可用条件 | 调用 | 当前状态 |
| --- | --- | --- | --- |
| `abandon` | `event_pending` 时恒可用 | 保存到 `deferred_event`，本周允许结束；下一周优先恢复或超时 | 按第 5 节实现 |
| `overtime` | 现金 ≥ cost | 账目 `events`、疲劳/士气、阶段质量 | 可实现 |
| `outsource` | 现金 ≥ cost 且存在匹配供应商 | #7 的 supplier 池与 `mode=emergency` 外包任务 | **等 #7**：`suppliers` 恒为空数组 |
| `extension` | 委员会项目、未用过延期、现金 ≥ cost | #6 的 `request_extension` | **等 #6**：核心只会拒绝承制 |
| `accept` / `decline` | 恒可用 | 即时/阶段/项目效果 | 可实现 |

跨系统边界（硬约束）：

- 事件不写 `company.reputation`，只输出变化量由集成层写入。
- 事件不改 `contract_budget`、`deadline_week`、`target_quality`。
- 事件不直接置 `phase=project_ready` 或 `company.status=bankrupt`；只能通过资金与质量间接导致，最终由既有结算判定。
- 外包与延期**不复制逻辑**，只能调用 #7 / #6 的能力；两者未落地前，对应选项必须 `disabled_reason` 说明原因，而不是伪造效果。

## 7. 履历输入

重大事件结算时产出：

```jsonc
{ "id": "...", "name": "...", "choice": "<option.id>", "result": "<effect 摘要键>" }
```

由集成层写入 `history[].major_events`。事件模块不直接写公司与作品历史。

## 8. 参数建议（全部 `TODO(待定)`，等 zm 审）

| 参数 | 推荐值 | 理由 | 影响面 |
| --- | --- | --- | --- |
| 基础触发概率 | 60‰ | 平均约 17 周一次，一部 OVA（12 周）约 0.7 次，不淹没周结算 | 事件密度验收、金色轨迹 |
| 概率上限 | 300‰ | 表现再差也保留随机性，避免「必触发」变成惩罚确定性 | 极端状态测试 |
| 表现触发是否受概率约束 | 否，条件成立即触发 | 符合「玩家经营影响异常」的可解释性 | 表现触发用例 |
| 普通事件冷却 | 4–12 周（按 tag） | 同 tag 不连续轰炸，不同 tag 可叠加 | 冷却用例 |
| 加班费用 | 10–30 万 | 约核心周薪的 1–2 倍，形成真实取舍 | 对账表 |
| 应急外包费用 | 30–50 万 | 明显高于加班，换取不动疲劳 | 与 #7 报价对齐 |
| 事件支出账目 | `events` | 八类账目已冻结，不新增类别 | 账目对账 |
| 重大事件数量 | 首版 2–4 条 | 内容成本可控，先验证一次性与履历 | #13 内容排期 |

## 9. 测试夹具矩阵（原生测试，等工具链）

机器可读版本见 [`event_test_fixtures.json`](event_test_fixtures.json)：11 条用例覆盖下表 9 类场景，`node scripts/validate-event-fixtures.mjs` 会校验夹具与目录的交叉引用（事件 id、阶段、冷却 tag、禁用选项的金额关系）。夹具只描述状态切片与唯一正确结果，测试代码仍需在完整 GameState 上构造。

| 验收项 | 用例 | 断言 |
| --- | --- | --- |
| 表现触发 | 阶段质量设为 40，推进一周 | `phase=event_pending`，`pending_event.id=key_cut_rework` |
| 随机触发 | 表现条件全不满足，固定种子命中 | 选中 `random_weight>0` 的条目 |
| 同周优先级 | 两个条件同时成立 | 选 `priority` 更小者；同种子重放结果一致 |
| 冷却 | 处理完后再触发同 tag | 冷却周内不再出现 |
| 重大一次性 | 同一项目触发两次条件 | 第二次不再进入候选 |
| 暂停/恢复 | `event_pending` 时推进 | `INVALID_PHASE`，状态不变 |
| 主动放弃 | `event_pending` 选择 `abandon` | 事件完整保存为 `deferred_event`，允许结束本周 |
| 下周恢复 | 有未到期 `deferred_event` 时推进一周 | 新一周正常结算前立即恢复 `event_pending` |
| 期限届满 | 推进后当前周达到 `expires_week` | 先执行一次 `escalation`，不提供零周处理机会 |
| 无期限放弃 | `expires_weeks=0` 的事件被放弃并推进 | 下一周立即恢复待处理，不丢失事件 |
| 阶段效果 | 选带 stage 效果的选项，推进到该阶段完成 | 质量按 delta 生效，且只生效一次 |
| 不追溯 | 已完成阶段挂效果 | 已写 StageResult 不变 |
| 失败结算 | 现金不足时选付费项 | 选项 `disabled_reason`，不可选 |
| 账目 | 选付费项 | `events` 恰增一次，现金只扣一次 |

## 10. 分阶段落地

- **M2-a（现在可交）**：目录 + 表现/随机触发 + 优先级 + 冷却 + 重大一次性 + 放弃/加班 + 即时效果 + 事件面板。对应验收 6 项。
- **M2-b（规则已确认）**：`abandon` 暂存、下一周优先恢复、按游戏周数计算期限、期限届满优先超时升级结算。
- **M2-c（等 #6 / #7）**：应急外包、委员会延期、阶段与项目效果的全链路验收。

`feat/11-event-m2a-v2` 只覆盖 M2-a 的一部分（4 条事件、无极性/重大/冷却/优先级）。按本文档重做时建议整条重写，不做增量叠加。

## 11. 内容协作接口

内容协作者按 `docs/EVENT_CONTENT_GUIDE.md` 填写，提交前跑：

```bash
node scripts/validate-event-catalog.mjs docs/event_catalog.example.json
```

示例目录（8 条，负面 5 / 正面 3 / 重大 2）已通过校验，可作为格式模板。内容只改文本、阶段、阈值与选项组合，不新增 `kind`、`target`、`scope`，也不改数值上限。
