# v4 数据字典（字段 / 命令 / 回执矩阵）

> 状态：**当前主线可执行的契约审计基线**。M0、DECISION_LOG 与领域架构是规范权威；本文展开字段、实现状态和版本边界，不自行新增或改写规则。
> #53 交付项对应：接口矩阵 = §3/§4/§5；字段所有权与读写权限表 = §10；冲突与缺口清单 = §7/§8/§11.1；端到端 fixture 与验证记录 = §9/§11.2；逐条验收自查 = §11.3。
> 上位文档：[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)（规则与不变式权威）、[DECISION_LOG.md](DECISION_LOG.md)（玩法权威）、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md) §7（字段语义权威）。
> 证据基线：main `d56bc95`，包含 PR #97 合并 `4870e6193ff36032f3a38a19e6ff2a0feada0e5a`。实测结论来自真实 WASM 构建与 `scripts/audit-v4-contract.mjs`，不是从旧 PR 推断。

---

## 1. 读法

### 1.1 状态标记

| 标记 | 含义 | 变更门槛 |
| --- | --- | --- |
| `实现` | 契约已冻结，v4 代码已产出该字段/行为 | 改它 = C 级 |
| `待实现` | 契约已冻结，代码尚无该字段/行为 | 补它 = B 级（新增） |
| `reserved_fields` | 为后续更新保留的字段；当前必须存在且满足固定默认值和禁用边界 | 删除、改类或启用 = C 级 |
| `historical_fields` | 仅历史 v3 使用的字段；不得进入 V4 当前 Schema | 不得复活到 V4 |
| `future_contract` | 已确认但尚未实现的 Q3/Q4 目标契约 | 实现前不得进入当前 `paths` |
| `待裁决` | 文档之间存在真实冲突或字段载荷未冻结 | 按 §8 走负责人裁决 |

`超契约` 不再作为 `loans/solvency` 的分类。它们是 M0 §3、INV-18 与 DECISION_LOG §7 明确保留的未来扩展字段。

### 1.2 “已冻结”的判据

一个字段/命令/回执只有在满足以下三条时才标 `实现`：

1. M0（含 §14 修订）或 DECISION_LOG 已给出确定语义；
2. v4 代码在真实 WASM 构建下可观察该形状；
3. `scripts/audit-v4-contract.mjs` 的期望表已登记它（§9）。

三者缺一即不得称“已冻结可用”。`future_contract` 可以冻结目标规则，但不能冒充当前运行能力。

### 1.3 裁决顺序

`DECISION_LOG.md`（玩法）> `M0_CONTRACT_FREEZE.md`（工程契约，含 §14）> `DOMAIN_ARCHITECTURE.md` §7（字段语义）> 本文（展开与状态）> 代码（现状证据，不是规范）。

代码与文档冲突时默认改代码，除非文档侧违反 §1.3 上位权威。已由负责人确认的事项不得重新包装成待裁决项。

---

## 2. 根结构

```text
GameState {
  version: 4
  seed: uint32
  company: Company
  staff: Staff[]
  recruitment: Recruitment        // future_contract；当前 runtime 尚未产出
  works: Project[]
  suppliers: Supplier[]
  contracts: OutsourceContract[]
  partners: Partner[]
  committees: Committee[]
  market: MarketState
  events: EventState
  finance: Finance
  archive: Archive
}
```

| 字段 | 类型 | 解析必填（`decode_state`） | 缺失时 | 状态 |
| --- | --- | --- | --- | --- |
| `version` | int | 否 | 默认 `0` → `validate()` 报 `INV-01 version 必须为 4` | `实现` |
| `seed` | uint32 | 否 | 默认 `0`，无任何校验，静默改变随机输入 | `待裁决` D-05 |
| `company` | Company | **是** | `INVALID_INPUT` | `实现` |
| `staff` | Staff[] | **是** | `INVALID_INPUT` | `实现` |
| `recruitment` | Recruitment | 当前无解析要求 | — | `future_contract`（§3.12） |
| `works` | Project[] | **是** | `INVALID_INPUT` | `实现` |
| `finance` | Finance | **是** | `INVALID_INPUT` | `实现`；含 reserved fields |
| `events` | EventState | **是**（且 `events.pending` 必须是数组） | `INVALID_INPUT` | `实现` |
| `suppliers` `contracts` `partners` `committees` `market` `archive` | Json | 否 | 缺失取默认（数组 `[]`、对象 `{}`），内容零校验 | `待实现`（见 §3.10 与 §3.11） |

`recruitment` 是 M0 §14.13 已冻结的目标根字段，但当前 runtime 尚未实现。审计同时检查文档包含该字段、机器基线将其登记为 `future_contract`，并禁止它悄悄进入当前 `paths`。

**不存在的字段**（v3 遗产，禁止复活）与派生值不入存档清单，见 M0 §2。`project_fee` 属于 `historical_fields`，不是 V4 reserved field。

---

## 3. 聚合字段表

### 3.1 `Company`

实测键：`end_reason, founded_week, id, name, reputation, reputation_log, status, week`。

| 字段 | 类型 | 可空 | 说明 | 状态 |
| --- | --- | --- | --- | --- |
| `id` `name` `founded_week` `week` `status` `reputation` `reputation_log` | — | 否 | M0 §3 必填 | `实现` |
| `end_reason` | string\|null | 是（仅 `running` 为 null） | M0 §3 | `实现` |
| `facilities` | Facility[] | 是（可空数组） | §14.7 阶段 2 的设施维护费、§14.9 扩容的数据前提 | `待实现`——代码无此字段 |
| `core_staff_capacity` | int | — | §14.9 / #63：由设施扩建等级派生，仅统计核心员工 | `待实现`（开局 4 人规则已确认，编制守卫待招聘运行时合入）；派生值不入存档 |
| `status` 取值 | `running/closing/ended` | — | `runtime.cpp` 校验 | `实现` |
| `week` ∈ [0,520] ∧ `running ⇒ week<520` | — | — | INV-21 | `实现` |
| `reputation_log[]` | `{week, reason, delta, after}` | — | DA §7.2 | `实现` |

### 3.2 `Staff`

实测键：`abilities, assignment_work_id, departure_warning, employment, experience, fatigue, id, last_participation, morale, name, potential, revealed_potential, role, signing_fee, talent_type, temporary_contract, weekly_salary`。

| 字段 | 类型 | 可空/默认 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| `id name role employment fatigue morale departure_warning assignment_work_id` | — | 必填 | `实现` | 与 M0 §3 一致 |
| `abilities` `experience` `potential` `revealed_potential` | **对象**（非数组） | 必填 | `实现` | 固定 6 键：`planning/direction/drawing/animation/management/postproduction`；C++ 是 `std::array`，JSON 是对象 |
| `talent_type` `weekly_salary` `signing_fee` | string / int | 必填 | `实现` | `signing_fee` 默认 0；V4 不再使用 project_fee，历史 v3 字段按 `historical_fields` 隔离 |
| `project_fee` | int | — | `historical_fields` | 仅 v3 历史字段；M0 §3/§14.6 已由 `signing_fee + weekly_salary` 取代，V4 Schema 禁止出现 |
| `assignment_work_id` | string\|null | 是 | `实现` | INV-09；INV-10 尚无完整检查 |
| `last_participation` | `{work_id,item_id,week}\|null` | 是 | `实现` | INV-11 |
| `temporary_contract` | Json\|null | 是 | `实现`（透传） | 临时员工不积累长期经验；结项后按项目契约退出名册，团队快照保留其贡献 |
| `forced_rest`（休养期） | — | — | `待实现` | §14.10 / INV-28 / DEC-STAFF-009 的前置数据 |
| 监督岗位 | `Project.supervisor_staff_id` | string\|null | `实现`（基础职业资格） | 项目内岗位，不修改 `Staff.role`；INV-27 校验唯一性、资格与 `assignment_work_id` 归属 |

**监督（INV-27 / §14.8 / DEC-STAFF-008）现状**：`Project.supervisor_staff_id` 已实现并在所有 producing 项目上严格校验；开工自动定岗，调离在任监督须原子 Swap/Replace，无合格替补则拒绝。当前资格只使用 `director/animation_director/production_manager` 基础职业集合；演出/作画/脚本转任阈值仍按 D-03 待裁决，不自行猜测。

### 3.3 `Project`

实测键：`channels, committee_id, common, deadline_week, delivery, episodes, extension, id, investment, ip_id, mode, offer, opened_week, plan, status, supervisor_staff_id, tv_service`。

| 字段 | 类型 | 可空 | 状态 | 备注 |
| --- | --- | --- | --- | --- |
| `id mode investment channels opened_week deadline_week extension status common episodes plan` | — | 必填 | `实现` | `status ∈ planning/producing/delivering/settled`；`channels` 为企划基线、委员会成员与已购电视服务的稳定并集 |
| `delivery` | Json\|null | 是 | `实现` | 关闭/交付路径写入；完整载荷尚未冻结 |
| `offer` | Json\|null | 是 | `实现` | 正式立项保存企划快照；内部实例化夹具可为 null |
| `ip_id` | string\|null | 是 | `实现`（透传） | M0 §3 字段保留 |
| `committee_id` | string\|null | 是 | `实现` | 委员会项目必填；承制项目必须为 null |
| `tv_service` | Json\|null | 是 | `实现` | `{purchased, channel, paid_week, fee_total, paid, multiplier}` |
| `supervisor_staff_id` | string\|null | producing 时必填 | `实现` | INV-27；解析时缺键即拒绝，不默认为 null |
| `plan` | `{intensity, focus, outsourcing, overtime, target}` | `target: null` | `实现` | `target` 为 `{kind,id}\|null` |
| 可交付性 | — | — | `实现`（派生） | `Project::deliverable()`；INV-08 无独立断言 |

### 3.4 `CommonProduction` / `EpisodeProduction` / Stage

实测：`common = {id, items[]}`；`episodes[] = {id, index, stages}`；`stages` 是长度为 6 的数组，元素为 `{key, items[]}`。

- M0 §3/INV-06 的“键固定有序”在实现中表示为数组 + `key` 字段，不是 JSON 对象映射。
- `episodes` 与 `stages[].items` 在哈希前排序，数组顺序不影响 `hash_state`。

### 3.5 `WorkItem`

实测键与 M0 §3 必填逐一对应：`id, key, ability, work_total, work_done, deliver_at, deps, is_gate, quality, contributors`。

- `quality` 是对象，固定 6 键 `story/direction/drawing/animation/art/sound`。
- `contributors` 是员工 id 字符串数组；`deps` 是工作项 id 字符串数组。
- `WorkItem.ability` 是能力名字符串，不是下标。

| 约束 | 实现 | 状态 |
| --- | --- | --- |
| `0 ≤ work_done ≤ work_total`、`deliver_at ∈ [1,1000]` | INV-03 | `实现` |
| `deps` 无环/不自指/不跨项目 | INV-04 | `实现` |
| 无 `status` 字段（全派生） | INV-05 | `待实现`（无断言） |
| `contributors` 只增不删、无重复、只含参与过者 | INV-12 | `实现` |
| 工作项 id 前缀 `<work_id>.<key>` | 保证 INV-02 唯一 | `实现` |
| 主责/协力档位 | 由 kernel 派生，不入存档 | `待裁决` D-04 |

### 3.6 `Finance`

实测键：`opening_funds, balance, entries, loans, solvency`。

| 字段 | 分类 | 当前约束 | 说明 |
| --- | --- | --- | --- |
| `opening_funds` `balance` `entries[]` | `实现` | `balance = opening_funds + Σentries.amount ≥ 0` | INV-16/INV-25；Finance 是现金唯一权威 |
| `loans` | `reserved_fields` | 必填，当前恒为 `[]` | M0 §3/INV-18/DECISION_LOG §7 明确保留；非空数组或错误类型拒绝 |
| `solvency{state,since_week,deadline_week,gap}` | `reserved_fields` | 必填；`state="normal"`、`since_week=null`、`deadline_week=null`、`gap=0` | `state="crisis"` 拒绝；不得绕过 INV-25 |
| `entries[]` 形状 | `实现` | `{id, week, work_id\|null, category, amount, counterparty\|null, memo}` | 与 DA §7.5 一致 |

**版本边界**：`loans/solvency` 是后续更新预留，不是废弃设计，也不是非法扩展。当前不产生 `Loan` 实体，不启用借款、利息、还款、`arrange_financing`、危机周推进或危机结算。`financing_in/loan_repayment/loan_interest` 属于未来机制候选，不是当前冻结账本类目。未来恢复融资必须作为独立规则变更重新评审。

### 3.7 `LedgerEntry.id` 与 `category` 约定

| 来源 | id 模式 | category | work_id | memo |
| --- | --- | --- | --- | --- |
| 周薪 | `w{week}.salary.{staff_id}` | `salary` | null | 员工名 |
| 公司运营 | `w{week}.operations` | `operations` | null | 公司运营 |
| 项目制作 | `w{week}.production.{work_id}` | `production` | work_id | 强度值 |
| 事件选项 `cost` | `w{week}.event.{event_id}.{work_id}` | `events` | work_id | 事件 id |
| 事件 `funds` 效果 | `w{week}.event.{event_id}.{work_id}.e{effectIndex}` | `events` | work_id | 事件 id |

- 同一命令内所有 id 全局唯一（INV-02，`claim_id`）。
- 路径段用单数 `event`，category 用复数 `events`，登记 D-08。
- DA §7.5 冻结 14 个当前 category；当前 v4 已产出 `salary/operations/production/events/contract_received/investment_paid/commercial_share_received/success_reward_received/penalty/distribution`。BD 公司所得与委员会净池份额均记 `commercial_share_received`，靠 `memo` 区分。
- 定金锁定与签约抵扣必须继续使用 `investment_paid` 与 `contract_received` 两笔立项账，`deposit_paid` 只是 Market 对账快照，不是第二本账。

### 3.8 `EventState`

实测键：`pending[], last_event_week, per_work`；`per_work[<work_id>] = {cooldowns: {<event_id>: until_week}, major_seen: [<event_id>]}`。`per_work` 与 `cooldowns` 的键是业务 id，审计归一化为 `*`。

`pending[]` 实测键：`event_id, name, work_id, triggered_week, expires_week, cooldown_weeks, once_per_project, viewed, options[]`；`options[] = {id, label, kind, risk_hint, cost, effects[]}`；`effects[] = {scope, target, stage, value}`。

| 项 | 状态 | 说明 |
| --- | --- | --- |
| `work_id/event_id/triggered_week/viewed` | `实现` | INV-23；`viewed` 必填且必须布尔 |
| 触发时冻结 `name/cooldown_weeks/once_per_project/options/effects` | `实现` | `resolve_event` 不回查内容目录 |
| `expires_week` | `实现` | 限期事件为 `triggered_week + expires_weeks - 1`；非限期为 null；阶段 7 到期执行冻结的 `abandon` 默认分支 |
| `episode_id` / `stage` / `item_id` | `待裁决` D-09 | DA §7.6 与 M0 §3 不一致 |
| `escalation` | `待裁决` D-09 | 字段名已出现，但升级载荷未冻结 |
| 展示字段 `description/foreshadow/category/polarity/tier` | `待实现` | 快照只有 `name` |
| 内容目录 `event_catalog_info` | `实现` | 卡片 schema 见 EVENT_CONTENT_PIPELINE §2 |

### 3.9 `Archive`

实测：`{company_result: null, series: [], works: []}`。交付结算已写入 `works`，关闭路径可生成 `company_result`；INV-22 的完整追加约束仍未独立断言。`WorkRecord.channel_breakdown[]` 按 DA §7.6 满足 `Σrevenue=commercial_revenue`、`Σcompany_received=finance_summary.commercial_share`；后者包含非 BD 公司分配与 BD 公司所得，`success_reward` 仍单列。

### 3.10 `Supplier` / `OutsourceContract` / `Partner` / `Committee` / `MarketState`

`initialize_game` 实测输出：`suppliers=[]`、`contracts=[]`、`committees=[]`、`market` 含 4 个初始槽位与四类热度、`partners` 含电视台/配信/出版三个初始合作方。

| 聚合 | 契约形状 | 代码 | 缺口影响 |
| --- | --- | --- | --- |
| `Supplier` | DA §7.4 + M0 §3 | `Json` 透传 | 命令 9 无数据前提；INV-19 无法断言 |
| `OutsourceContract` | DA §7.4 | `Json` 透传 | INV-20 无法断言 |
| `Partner` / `Committee` | DA §7.4 + M0 §3 | `Json` 透传 | 委员会立项/交付已使用；INV-13 未完整断言 |
| `MarketState` | M0 §3；现行初始 4 槽、最大 10 槽 | **已初始化槽位/热度/合作方候选** | INV-24/Q3/Q4 尚未完整实现；槽位上限与 #59 最新归档冲突，见下 |

> **2026-11-27 规则冲突（暂停对应修改）：** #59 最新归档要求市场固定展示 4 个槽位（3 个独立循环槽＋1 个短期外援槽），覆盖本节及 M0 沿用的“初始 4、上限 10”。槽位身份、刷新周期、外援进度缩放与持久化表达尚未冻结；在 #53 收口前不得把 PR #119 的 cap10 实现当作最新决定，也不自行新增槽位字段。

### 3.11 未冻结的形状

`Facility`、`temporary_contract` 内部字段与 `WorkRecord` 全量字段的载荷尚未在 M0 冻结，按 D-07/D-10 跟踪。`Project.investment{percent,total,paid}`、`Project.extension`、`Project.delivery` 已由当前命令写入并实际使用，但其完整长期契约仍随对应批次收敛，不再标记为“命令未实现”。

### 3.12 Q3/Q4 `future_contract`

以下规则已经冻结，但当前 runtime 未实现，**不得进入当前 JSON Shape 的 `paths`**：

```text
Recruitment {
  pool: PoolCandidate[]
  pity: { since_sr: uint, since_ssr: uint }
  last_scout_week: uint | null
}
PoolCandidate { staff: Staff, expires_week: uint | null, origin: "regular" | "scout" }

Offer 新增：expires_week, locked_until, lock_used, deposit_paid, offer_source_type, deposit_basis
```

- 市场槽位初始 4、最大 10；同一企划 id 终身唯一。
- 常规招聘池每周部分轮换；Scout 每周至多一次；候选 `expires_week` 是首个不可签约周，regular 候选为 `null`。
- `lock_offer(offer_id)` 是命令 23；第 W 周成功锁定后覆盖 W/W+1，W+2 开局失效。
- 同一企划终身只能锁定一次；到期释放槽位、定金不退，`lock_used` 保持 true。
- 普通企划定金 5%、IP 上门企划 10%，按 Offer 生成时固定的 `deposit_basis` 计算；`offer_source_type` 与 `deposit_basis` 必须随 Offer 快照保存，后续预算调整不追溯改变定金。
- 正式签约时定金 100% 抵扣；Finance 保留 `investment_paid/contract_received` 两笔账，不重复记录定金。
-  pool 候选不是公司员工，不参与周结算、不计薪；hire 解包后 `expires_week/origin` 不得残留在 Staff。

---

## 4. 命令矩阵

M0 §5 冻结 **23 条命令**。核心实际导出 **23 个绑定入口**：17 个已接入的 §5 命令、3 个测试/内部别名、3 个状态/内容工具。文档命令数与实现覆盖度必须分开，不能继续使用旧的 22 条基线。

| # | 命令 | 入口 | 输入（实测必填） | 主要错误码（实测） | 回执（实测） | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `initialize_game(seed)` | ✅ | `seed`（非负整数） | `INVALID_INPUT` | `{state}` | `实现` |
| 2 | `start_work(offer_id, mode, percent, committee_partner_ids)` | ✅ | `state` + 命令参数 | `NOT_FOUND/INVALID_INPUT/INVALID_PHASE/INVALID_STATE/INSUFFICIENT_FUNDS` | `{state, work_id, committee_id}` | `实现`；定金 100% 抵扣见 §3.12 |
| 3 | `set_work_plan(work_id, plan)` | ✅ | `state, work_id, plan` | `INVALID_INPUT/NOT_FOUND/INVALID_PHASE` | `{state}` | `实现` |
| 4 | `assign_staff(staff_id, work_id\|null)` | ✅ | `state, staff_id, work_id` | `NOT_FOUND/INVALID_PHASE/INVALID_STATE` | `{state}` | `实现`；监督原子 Swap/Replace |
| 5 | `hire_core(staff_id)` | ❌ | — | — | — | `待实现`；从 Recruitment 解包 |
| 6 | `scout(role?, focus_ability?)` | ❌ | — | — | — | `待实现`；每周至多一次 |
| 7 | `dismiss_staff(staff_id)` | ❌ | — | — | — | `待实现` |
| 8 | `hire_temporary(work_id, candidate_id)` | ❌ | — | — | — | `待实现` |
| 9 | `sign_outsourcing(work_id, item_id, supplier_id, work_total, mode)` | ❌ | — | — | — | `待实现` |
| 10 | `deliver_work(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/INVALID_PHASE/GATE_UNMET/INVALID_STATE` | `{state, report}` | `实现`；pending 守卫拒绝交付 |
| 11 | `abort_work(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/NOT_IMPLEMENTED` | `NOT_IMPLEMENTED` 错误信封 | `入口实现`；处罚/履历载荷未冻结时原子拒绝 |
| 12 | `create_custom_offer(name, source, scale, style)` | ✅ | `state` + 命令参数 | `INVALID_INPUT/INVALID_PHASE` | `{state}` | `实现` |
| 13 | `adopt_proposal()` | ✅ | `state` | `NOT_FOUND/INVALID_PHASE` | `{state}` | `实现` |
| 14 | `reject_proposal()` | ✅ | `state` | `NOT_FOUND` | `{state}` | `实现` |
| 15 | `buy_tv_service(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/MODE_NOT_ALLOWED/INVALID_PHASE/INSUFFICIENT_FUNDS` | `{state}` | `实现` |
| 16 | `request_extension(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/MODE_NOT_ALLOWED/INVALID_PHASE/INSUFFICIENT_FUNDS` | `{state}` | `实现` |
| 17 | `advance_week()` | ✅ | `state` | `INVALID_PHASE/INVALID_STATE/NOT_IMPLEMENTED/INTERNAL_ERROR` | `{state, report}` | `实现`；pending 终局与事件升级载荷仍阻塞 |
| 18 | `resolve_event(work_id, event_id, option_id)` | ✅ | `state, work_id, event_id, option_id` | `NOT_FOUND/INVALID_INPUT/INSUFFICIENT_FUNDS/INVALID_STATE` | `{state, message}` | `实现` |
| 19 | `end_company()` | ✅ | `state` | `INVALID_PHASE/INVALID_STATE` | `{state}` | `实现` |
| 20 | `finalize_delivery(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/INVALID_PHASE/INVALID_STATE` | `{state, report, company_status}` | `实现` |
| 21 | `finalize_company()` | ✅ | `state` | `INVALID_PHASE/INVALID_STATE` | `{state, result}` | `实现` |
| 22 | `view_event(work_id, event_id)` | ✅ | `state, work_id, event_id` | `INVALID_INPUT/NOT_FOUND/COMPANY_ENDED` | `{state, viewed, already_viewed}` | `实现` |
| 23 | `lock_offer(offer_id)` | ❌ | — | — | — | `future_contract`；W/W+1 有效、W+2 失效 |

非 §5 命令：`hash_state(state)`（工具）、`validate_event_catalog` / `event_catalog_info`（内容工具）、`initialize` / `instantiate_work` / `set_plan`（别名）。

### 4.1 未实现命令的回执

M0 §6 的 `NOT_IMPLEMENTED` 已用于载荷尚未冻结的 `abort_work`、破产/第 520 周仍携带 pending 时的终局守卫，以及非整除委员会净池分配。返回错误信封且不携带 `state`，不清事件、不关闭项目、不伪造处罚或归档、不静默舍入。

### 4.2 通用信封

```text
成功: { ...命令专属键, "state": GameState }
失败: { "error": { "code": "<§6 码>", "message": "<中文诊断>" } }
```

- 即时付款命令的 `INSUFFICIENT_FUNDS` 可额外带非负整数 `gap`；`advance_week` 的刚性支出预检按 M0 §14.7 直接进入破产终局，缺口在成功回执的 `report.gap`。
- 解码精确消息在命令入口被统一替换为“JSON 或字段类型无效”，定位能力损失登记 F-13。
- `SAVE_CORRUPT/SAVE_VERSION_UNSUPPORTED` 属于存储层，不由 v4 核心产生。

### 4.3 `INSUFFICIENT_FUNDS.gap` 与周预检 `report.gap`

| 键 | 类型 | 语义 |
| --- | --- | --- |
| `error.code` | string | 即时付款命令的 `INSUFFICIENT_FUNDS` |
| `error.message` | string | 中文诊断 |
| `error.gap` | int ≥0 | 当前命令的现金缺口；已实现的立项路径返回该键 |
| `report.mode` | string | 周预检不足时为 `bankrupt` |
| `report.gap` | int ≥0 | 周刚性支出现金缺口；不扣款、不写流水、不推进周数 |

### 4.4 `hash_state`

`{hash: string}`：对 canonicalize 后的状态做确定性哈希，数组顺序无关；不参与规则。

---

## 5. 回执契约

### 5.1 `advance_week.report`

```text
report {
  week: int
  works[]: { work_id, total_points, items[]{item_id, points, quality_gain}, quality{dims, mean} }
  staff[]: { staff_id, produced, fatigue, morale }
  settlements[]: { work_id, end_reason, archived, rating, penalty, ... }
  events: { drawn, count, events[]{event_id, work_id}, expired[]{work_id, event_id, option_id, automatic} }
  funds:  { delta, balance, costs{salary, operations, production} }
}
```

- 破产回执使用 `mode="bankrupt"`、`bankrupt=true`、`skipped=true`、`gap`，`works/staff/settlements` 为空，`funds.delta=0`。
- `funds.costs` 只有 3 个键，与 14 类 category 不对应，登记 D-13。
- `report` 不是 DA §9.4 的 `WeekReceipt`；后者是前端派生读模型，边界见 D-14。
- 交付/结清的 `report.settlements[]` 同时记录 `bd_gross`（BD/DVD 毛收入）与 `bd_revenue`（公司 50% 所得）；`commercial_revenue` 为全部开放窗口毛收入，`committee_pool` 为非 BD 净池，`commercial_share + investor_share = committee_pool`。
- 外部代理按 DEC-COMM-001 使用 450/400/350‰；当前“同类成功合作”从 Archive 中 `end_reason=completed` 且对应渠道 `net>0` 的已完成作品派生，不新增持久化计数字段。
- 非整除净池分配的取整顺序与余数归属尚未冻结，出现时原子返回 `NOT_IMPLEMENTED`；通用前置商业成本输入字段亦未冻结，登记 D-16。

### 5.2 其余命令回执

| 命令 | 键 | 备注 |
| --- | --- | --- |
| `view_event` | `state, viewed, already_viewed` | 无 `message` |
| `resolve_event` | `state, message` | 不回显已应用效果 |
| `create_custom_offer` | `state, offer_id, contract_budget, rules_status` | 只创建草稿 |
| `adopt_proposal` / `reject_proposal` | `state, offer_id` / `state` | 采纳转草稿；拒绝只清提案 |
| `buy_tv_service` | `state, paid, multiplier` | 电视台成员不可重复购买 |
| `request_extension` | `state, deadline_week` | 延期费记 production |
| `end_company` | `state, report` | `report` 含 status/end_reason/closing_projects |
| `initialize_game/set_work_plan/assign_staff` | `state` | 无附加回执 |
| `start_work` | `state, work_id, committee_id` | 承制项目 `committee_id=null` |
| `deliver_work` | `state, report` | 交付结算报告 |
| `finalize_delivery` | `state, report, company_status` | 关闭路径逐项目结清 |
| `finalize_company` | `state, result` | 结局只生成一次 |
| `instantiate_work`（别名） | `state, work_id` | 当前别名入口 |
| `hash_state` | `hash` | §4.4 |

### 5.3 原子性与失败后状态

M0 §5 的“工作副本 + 一次提交”在已实现命令上成立：守卫失败不返回 `state`，输入状态逐字段不变。`advance_week` 预检不足按 §14.2/§14.7 回滚并直接破产；不写负现金、不产生部分流水或制作推进。若仍有 pending，则终局转移/归档语义未冻结，整周原子拒绝并返回 `NOT_IMPLEMENTED`。

### 5.4 八阶段与 v4 实现对照

| §14.7 阶段 | 内容 | v4 实现 |
| --- | --- | --- |
| 1 | 计划冻结与快照 | `实现`；失败回到快照 |
| 2 | 刚性支出预检 | `实现`；不足直接破产，pending 终局未冻结时拒绝 |
| 3 | 刚性支出扣款 | `实现`；核心/临时员工周薪均走唯一流水 |
| 4 | 项目生产推进 | `实现` |
| 5 | 经验/疲劳/红灯 | 经验/疲劳/士气 `实现`；`forced_rest` 未实现 |
| 6 | 商业窗口与交付收入 | `实现`；含委员会分账与强制交付扣罚 |
| 7 | 延迟状态倒计时 | 限时事件默认分支 `实现`；一次性升级载荷未冻结 |
| 8 | 随机事件与周数递增 | `实现`；第 520 周 pending 终局未冻结时拒绝 |

---

## 6. 不变式实现对照

M0 §4 共 **29 条**。当前 `validate()` 实际断言 **16 条**：`INV-01/02/03/04/06/07/09/11/12/16/18/21/23/25/27/29`。

| INV | 断言 | 位置/缺口 |
| --- | --- | --- |
| 01 根字段/版本/取值 | ✅ | 分散校验 |
| 02 id 全局唯一 | ✅ | `claim_id` |
| 03 work_done/deliver_at 边界 | ✅ | |
| 04 deps 无环/不跨项目 | ✅ | |
| 05 无 `status` 派生字段 | ❌ | 无断言 |
| 06 六阶段固定 | ✅ | `kStages` |
| 07 每集门槛项 | ✅ | |
| 08 可交付 ⇔ 门槛项全交付 | ❌ | 派生函数存在，无断言 |
| 09 assignment 合法 | ✅ | |
| 10 同周单归属 / 临时=合同项目 | ❌ | 依赖命令 8 |
| 11 last_participation.week | ✅ | |
| 12 contributors | ✅ | |
| 13 委员会成员/渠道唯一 | ❌ | 无数据 |
| 14 投资与 committee_id | 🔶 部分 | `Project.committee_id` 已实现；立项/结算使用，validate 未完整断言 |
| 15 allowed_modes | ❌ | 无 Offer 数据 |
| 16 余额恒等式 | ✅ | |
| 17 单笔单 category / 收入边界 | 🔶 部分 | 交付收入已走 Finance；完整类别边界未独立断言 |
| 18 reserved loans/solvency 默认值与禁用状态 | ✅ | `loans=[]`、`solvency.state="normal"`、时间字段为 null、`gap=0`；crisis/非空 loans/非默认 reserved 子字段拒绝 |
| 19 供应商周承诺 | ❌ | 命令 9 未实现 |
| 20 合同项归属/累计交付 | ❌ | 同上 |
| 21 week 只由 advance_week 改 | ✅ | |
| 22 Archive 只追加 | 🔶 部分 | 交付/结局已写入；完整追加约束未独立断言 |
| 23 事件仲裁 | ✅ | |
| 24 市场槽初始 4/上限 10/终身唯一 | 🔶 冲突待收口 | 初始 4 槽已实现；#59 最新归档改为固定 4 槽（3 循环＋1 外援），槽位语义未冻结；上限/锁定历史未完整断言 |
| 25 balance ≥0 / 预检失败破产 | 🔶 部分 | 非负余额与无 pending 破产已实现；pending 终局语义未冻结 |
| 26 存档无派生值 | ❌ | 无黑名单检查 |
| 27 每项目恰一名监督 | ✅ | `Project.supervisor_staff_id` + 资格/归属/重复校验 |
| 28 forced_rest | ❌ | 无字段 |
| 29 限时事件 | 🔶 部分 | 期限、默认分支、稳定顺序与防重复已实现；升级载荷未冻结 |

---

## 7. 已修正分歧与后续代码缺口

| # | 位置 | 问题 | 处置 |
| --- | --- | --- | --- |
| C-01/C-02 | M0 §12 | INV/命令/错误码计数陈旧 | 同步为 29 INV、23 命令、16 码（2 废弃） |
| C-03/C-04 | M0 §1/§5 | 21/22 条旧命令口径 | 同步 23 条，逐行一命令 |
| C-05 | M0 §3 | EventState 缺 `viewed` | 已补 |
| C-06 | M0 §7 | 历史 `arrange_financing` 授权误读 | 明确历史记录，不授权当前命令 |
| C-07/C-08 | M0 | 重复 §14 标题与孤立危机横幅 | 保留历史语义，消除结构歧义 |
| C-09 | M0 §6 | `SAVE_*` 产生层不明 | 明确存储层产生 |
| C-10 | M0 §3 | stages “键”易误读 | 明确数组 + `key` |
| F-11 | DA 命令数 | 21/22 条旧口径 | 同步 23 条 |
| F-12 | M1 | report 回执引用 | 引本文 §5.1 |
| F-13 | runtime | 解码消息被吞 | A 级代码修复，待后续 PR |
| F-14 | 前端 | 仍走 v3 | M2 接入任务 |
| F-15 | runtime | 旧阶段编号注释 | 已按八阶段修正 |

---

## 8. 待负责人裁决项

| # | 项 | 级别 | 证据 | 建议/边界 |
| --- | --- | --- | --- | --- |
| D-01 | `loans/solvency` 删除议题 | **已确认保留** | §3.6；M0 §3/INV-18；DECISION_LOG §7 | 归入 `reserved_fields`；审计存在性、默认值和行为边界，不再建议删除 |
| D-02 | `project_fee → signing_fee` | **已确认** | §3.2；M0 §3/§14.6 | V4 仅 `signing_fee`；v3 `project_fee` 保留为 `historical_fields` |
| D-03 | 监督岗位数据形状 | C | §3.2；DEC-STAFF-008 | 字段/INV-27/原子换岗已实现；非基础职业转任阈值仍待裁决 |
| D-04 | 主责/协力档位是否进回执 | B/C | §3.5 | 建议读模型，不入存档 |
| D-05 | 根 version/seed 必填 | C | §2 | 建议 seed 必填 |
| D-06 | Project.offer 缺失/{}/null | C | §3.3 | 建议统一为 null |
| D-07 | 未冻结载荷 | B | §3.11 | 随对应命令冻结 |
| D-08 | event/events 单复数 | B | §3.7 | 可统一，需同步测试 |
| D-09 | pending 扩展字段 | C | §3.8 | `expires_week` 已实现；`episode_id/escalation` 与升级载荷仍待冻结 |
| D-10 | 未实现形状冻结节奏 | B | §3.10/§4.1 | 随实现批次冻结 |
| D-11 | 别名是否保留 | B | §4 | 命令实现后评估移除 |
| D-12 | 未实现命令 NOT_IMPLEMENTED 占位 | B | §4.1 | 已用于 abort 与 pending 终局守卫；不为未冻结载荷猜测成功回执 |
| D-13 | report 成本分解 | B | §5.1 | 建议按 category 汇总 |
| D-14 | report/WeekReceipt 边界 | B/C | §5.1 | report 为结算回执，WeekReceipt 为前端派生 |
| D-15 | resolve_event 回执效果 | B | §5.2 | 建议增补，不改变业务规则 |
| D-16 | 前置商业成本输入与净池分配舍入 | B/C | §5.1；M4 对账 fixture §6 | 输入字段、取整顺序和余数归属未冻结；当前不新增字段，非整除分配原子拒绝 |

---

## 9. 机器校验

```bash
npm run test:v4 && npm run audit:v4
```

`scripts/audit-v4-contract.mjs` 加载真实 WASM，跑固定 seed 闭环，并与 `docs/v4-contract-shape.json` 双向比对：

1. **命令面**：绑定源与导出清单精确一致；M0 命令表 23 条、编号连续；`view_event=22`、`lock_offer=23`；未实现命令出现入口即红。
2. **键树**：逐路径断言字段集合完全相等；动态业务 id 映射归一化；可选路径存在即校验。
3. **解析必填**：逐个删除字段，必须 `INVALID_INPUT`；包括 reserved fields 与 `signing_fee/weekly_salary`。
4. **回执键**：18 条已实现命令返回键逐一相等。
5. **初始化空聚合**：锁定当前空形状。
6. **字段分类**：`reserved_fields` 必须存在；`historical_fields` 不得进入 V4；`contract_required_missing` 与 `future_contract` 不得悄悄实现。
7. **当前行为**：reserved 默认值、非空 loans、crisis、非默认 solvency 子字段、负余额、未来融资类目与 `arrange_financing` 边界。
8. **账本**：产出类目、冻结类目、id 前缀与 INV-02 唯一性。
9. **源码口径**：INV 标签与错误码登记。
10. **资金预检路径**：`report.mode="bankrupt"`、非负 `report.gap`、无流水/扣款/周推进、公司进入 bankrupt 终局。

审计失败必须指出字段、文件或命令以及原因。不得通过删除 reserved fields、恢复 22 条基线或放宽危机边界来消除真实冲突。

解析必填同时覆盖 `fatigue/morale/departure_warning/assignment_work_id`：删除任一字段都必须返回 `INVALID_INPUT`，避免反序列化默认值掩盖坏存档。

---

## 10. 字段所有权与读写矩阵

### 10.1 口径

规范权威是 DA §6.1。本节只把所有权落到 v4 的具体写入点并标出实现分歧。行号会随实现变化，审计以函数名和 INV 标签为主，不把陈旧行号当作契约。

### 10.2 根与 Company

| 字段 | 所有者 | 写入点 | 唯一性 | 读取/生命周期 |
| --- | --- | --- | --- | --- |
| `version` | 内核 | initialize | 唯一 | INV-01；立项后不变 |
| `seed` | 内核 | initialize；解析默认 0 | 唯一（D-05） | 随机输入；不得静默改写 |
| `company.week` | Company | advance_week | 唯一 | INV-21 |
| `company.status/end_reason` | Company | initialize；周预检破产、主动关闭与结清完成 | 同一写入器族 | INV-25；closing→ended 由无在制项目驱动 |
| `company.reputation/reputation_log` | Company | initialize；交付结算 | 同一写入器族 | DEC-ECON-001；唯一入口 change_reputation |

### 10.3 Staff

| 字段 | 写入点 | 唯一性 | 备注 |
| --- | --- | --- | --- |
| Staff 静态字段与 `signing_fee/weekly_salary` | initialize；招聘未实现 | 唯一 | 不再使用 `project_fee` |
| `fatigue/morale` | advance_week 与事件效果 | 多写 + 代写 | P1-G2 |
| `experience` | advance_week | 唯一 | 事件效果不包含 exp |
| `assignment_work_id` | start_work/assign_staff；事件替换；交付/关闭释放 | 唯一 | INV-09/INV-27 |
| `last_participation` | advance_week | 唯一 | INV-11 |

### 10.4 Project

| 字段 | 写入点 | 唯一性 | 备注 |
| --- | --- | --- | --- |
| 立项静态字段与 `offer` 快照 | start_work；instantiate_work 仅内部夹具 | 唯一 | M0 命令 2 已实现 |
| `investment/tv_service/extension/delivery` | start_work、购买电视、延期、关闭/到期 | 同一写入器族 | 委员会投资与交付状态 |
| `plan.*` | set_work_plan | 唯一 | 周结算只读 |
| `items[].work_done` | advance_week 与事件效果 | 多写 + 代写 | P1-G2 |
| `items[].quality` | advance_week 与事件效果 | 多写 + 代写 | P1-G2 |
| `items[].contributors` | advance_week | 唯一 | INV-12 |

### 10.5 Finance

| 字段 | 写入点 | 唯一性 | 备注 |
| --- | --- | --- | --- |
| `opening_funds` | initialize | 唯一 | INV-16 |
| `balance/entries` | 立项、周结算、事件与交付/结清，经账本提交器 | 同一写入器族 | 收入与支出均已实现；INV-16/INV-25 |
| `loans/solvency` | initialize 默认值；运行时只校验 | reserved，不授权写入 | 未来机制必须重新评审 |

### 10.6 EventState

| 字段 | 写入点 | 唯一性 | 备注 |
| --- | --- | --- | --- |
| `pending[]` | event::draw | 唯一 | resolve 只移除目标 |
| `pending[].viewed` | view_event | 唯一 | 幂等 |
| `per_work` | event::draw | 唯一 | 业务 id 映射 |
| `last_event_week` | event::draw | 唯一 | 不承担全局单槽 |

### 10.7 聚合写入现状

| 聚合 | 当前写入点 | 边界 |
| --- | --- | --- |
| `partners` | 初始化；交付后关系与 history | 更多伙伴/关系玩法仍属 M4 缺口 |
| `committees` | start_work 成立；交付后关闭 | 当前仅单项目委员会主链 |
| `market` | 初始化；原创草稿、采纳/拒绝、start_work 消费企划 | 刷新/竞争仍属 M3 缺口 |
| `archive` | 交付/结清追加 works；finalize_company 写 company_result | 只追加；中止履历与终局 pending 未冻结 |
| `suppliers/contracts` | 初始化空聚合 | 供应商目录/外包尚未实现 |

### 10.8 跨模块共享值

| 共享值 | 唯一事实源 | 禁止 |
| --- | --- | --- |
| work_id | 立项命令 | 用标题/索引代替 |
| staff_id | 初始化/招聘 | 存姓名副本 |
| counterparty | 供应商/合作方 id | 用员工 id/名称混填 |
| event_id | 内容目录 | 运行时改名 |
| 阶段键/工作项 id | 蓝图 | 自造第 7 阶段 |
| 能力/质量维度 | 两套固定枚举 | 混用 postproduction/sound |
| 周 | company.week | 存真实日期 |
| 金额 | 整数円，带符号流水 | 浮点或千円缩写 |
| 可空性 | 显式 null | 用缺省掩盖未知 |

---

## 11. 冲突与缺口清单

### 11.1 分级

| 级 | 项 |
| --- | --- |
| P0 | initialize 原子范围不足；report/WeekReceipt 边界；未实现命令无 NOT_IMPLEMENTED |
| P1 | 事件效果代写 Staff/Project/Finance；终局 pending 转移/归档；abort_work 扣罚与履历；事件升级载荷 |
| P2 | market 刷新/竞争；Archive 中止与扩展履历；前置商业成本输入；非整除净池取整；更多伙伴/关系玩法 |
| P3 | 供应商/外包；Facility；系列续作；Q3/Q4 运行时实现；其余未冻结载荷 |

`loans/solvency` 不再列入删除阻塞；其当前约束由 INV-18/INV-25 与 reserved 审计保证。`project_fee` 不再列入 V4 待改名项；历史 v3 字段保留，V4 统一使用 `signing_fee`。

### 11.2 端到端 fixture 现状

当前可执行链路：`initialize_game → start_work → assign_staff → 多周 advance_week → view_event → resolve_event → deliver_work → end_company/finalize_delivery → finalize_company`。承制与委员会模式均可贯通“交付 → Archive → Finance”；命令 10/19/20/21 已实现。仍有 pending 的破产/第 520 周终局与 `abort_work` 完整闭环按未冻结语义原子拒绝，不伪造通过路径，详见 `M2_M4_PROJECT_LOOP.md`。

### 11.3 #53 验收项自查

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 字段唯一写入权威 | 部分 | §10；事件代写仍待裁决 |
| 共享 ID/枚举/可空/时间/金额一致 | 部分 | §10.8；D-06/D-08 等例外 |
| 命令输入/输出/错误码/原子性 | 已实现部分满足 | §4/§5/§9 |
| 无未解释重复事实源 | 满足 | Finance 唯一现金权威；deposit_paid 仅快照 |
| 端到端至交付/Archive | 已实现主链满足 | §11.2；中止与终局 pending 除外 |
| M2 与远期分层 | 满足 | §3.12/§11.1 |
| 裁决项含证据与边界 | 满足 | §8 |
