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
  recruitment: Recruitment        // Staff 域招聘聚合（M0 §14.13.1）
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
| `recruitment` | Recruitment | **是**（`pool` 数组、`pity` 双计数、`last_scout_week` 必填；池候选按 Staff 必填键检查） | `INVALID_INPUT` | `实现`（§3.12） |
| `works` | Project[] | **是** | `INVALID_INPUT` | `实现` |
| `finance` | Finance | **是** | `INVALID_INPUT` | `实现`；含 reserved fields |
| `events` | EventState | **是**（且 `events.pending` 必须是数组） | `INVALID_INPUT` | `实现` |
| `suppliers` `contracts` `partners` `committees` | Supplier[] / OutsourceContract[] / Partner[] / Committee[] | **是** | `INVALID_INPUT` | `实现`（见 §3.10） |
| `market` | Json | 否 | 缺失取 `{}` | `实现`（固定企划四槽、生命周期与周补充见 §3.12） |
| `archive` | Json | **是** | `INVALID_INPUT` | `实现`（见 §3.9/§3.11） |

`recruitment` 按 M0 §14.13.1 实现：机器基线把 `state.recruitment.*` 登记进当前 `paths`，解析必填探针覆盖聚合与池包装字段；池中候选不是员工，不进名册约束（INV-09/10/11），但 id 走全局唯一集合（INV-02）。

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
| `core_staff_capacity` | int | — | §14.9 / #63：由设施扩建等级派生，仅统计核心员工 | `实现`（开局 4 人）；设施升级与派生阶梯待实现，不存入存档 |
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
| `assignment_work_id` | string\|null | 是 | `实现` | INV-09；INV-10 校验临时员工归属恒等于合同项目 |
| `last_participation` | `{work_id,item_id,week}\|null` | 是 | `实现` | INV-11 |
| `temporary_contract` | `{work_id,start_week,end_week}\|null` | 是 | `形状校验、签约与延期联动实现` | `end_week` 签约时快照项目 `deadline_week`；成功延期时同步更新；仅作预计结束周，不触发自动解约；`closing/delivering` 过渡态保留合同，`finalize_delivery` 实际结清时退出 |
| `forced_rest`（休养期） | — | — | `待实现` | §14.10 / INV-28 / DEC-STAFF-009 的前置数据 |
| 监督岗位 | `Project.supervisor_staff_id` | string\|null | `实现`（基础职业资格） | 项目内岗位，不修改 `Staff.role`；INV-27 校验唯一性、资格与 `assignment_work_id` 归属 |

**监督（INV-27 / §14.8 / DEC-STAFF-008）现状**：`Project.supervisor_staff_id` 已实现并在所有 producing 项目上严格校验；开工自动定岗，调离在任监督须原子 Swap/Replace，无合格替补则拒绝。当前资格只使用 `director/animation_director/production_manager` 基础职业集合；演出/作画/脚本转任阈值仍按 D-03 待裁决，不自行猜测。

**v0.5 开局基线**：现金 `opening_funds=balance=14,000,000`，核心编制 4。当前名册为 `staff_dir`（林监督，周薪 238,000）、`staff_ka`（陈原画，208,000）、`staff_anim`（许动画，170,000）、`staff_post`（周摄影，170,000），周薪合计 786,000。对应能力锚点为 S=75/70/60/60；S 到六维 `abilities` 的正式映射仍未冻结，当前六维夹具值不得宣称为该映射结论。任一在任监督的执行预算按普通预算的 50% 计算，与监督换项目的团队系数独立叠乘。

**疲劳与士气在 v0.5 没有机械后果**：DEC-STAFF-008 的产能只读 `abilities`（S_eff），`fatigue`/`morale` 仍每周记账、仍可在事件里被修改、仍出现在周回执 `report.staff[]`，但不参与产能也不参与质量。它们何时、以何种方式接回（质量抖动 / 事件权重 / 红灯阈值）尚未裁决，因此事件卡文案与前端不得暗示"疲劳会拖慢产量"。

**S_eff 值域缺口**：DEC-STAFF-008 声明能力输入域为 30–100 且越界属于非法状态；当前 `kernel::capacity_permille` 对 S_eff < 30 仍做线性外推（招聘生成会产出低能力候选，非主能力 5–45），既未判红也未截断。该项缺口登记在 #53，实现前不得当作已收口。

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

实测键与 M0 §3 必填逐一对应：`id, key, ability, work_total, work_done, deliver_at, deps, is_gate, outsourceable, quality, contributors`。

- `quality` 是对象，固定 6 键 `story/direction/drawing/animation/art/sound`。
- `contributors` 是员工 id 字符串数组；`deps` 是工作项 id 字符串数组。
- `WorkItem.ability` 是能力名字符串，不是下标。

| 约束 | 实现 | 状态 |
| --- | --- | --- |
| `0 ≤ work_done ≤ work_total`、`deliver_at ∈ [1,1000]` | INV-03 | `实现` |
| `outsourceable` 为布尔；公共制作与 gate 不可外包 | 蓝图校验；Vendor 周结算守卫 | `实现`（`outsourceable` 随实例化与存档持久化） |
| `deps` 无环/不自指/不跨项目 | INV-04 | `实现` |
| 无 `status` 字段（全派生） | INV-05 | `待实现`（无断言） |
| `contributors` 只增不删、无重复、只含参与过者 | INV-12 | `实现` |
| 工作项 id 前缀 `<work_id>.<key>` | 保证 INV-02 唯一 | `实现` |
| 主责/协力档位 | 由 kernel 派生，不入存档 | `待裁决` D-04 |

### 3.6 `Finance`

实测键：`opening_funds, balance, entries, loans, solvency`。

| 字段 | 分类 | 当前约束 | 说明 |
| --- | --- | --- | --- |
| `opening_funds` `balance` `entries[]` | `实现` | `balance = opening_funds + Σentries.amount`；running 时 ≥0，bankrupt 的 closing/ended 允许负余额 | INV-16/INV-25；Finance 是现金唯一权威 |
| `loans` | `reserved_fields` | 必填，当前恒为 `[]` | M0 §3/INV-18/DECISION_LOG §7 明确保留；非空数组或错误类型拒绝 |
| `solvency{state,since_week,deadline_week,gap}` | `reserved_fields` | 必填；`state="normal"`、`since_week=null`、`deadline_week=null`、`gap=0` | `state="crisis"` 拒绝；不得绕过 INV-25 |
| `entries[]` 形状 | `实现` | `{id, week, work_id\|null, category, amount, counterparty\|null, memo}` | 与 DA §7.5 一致 |

**版本边界**：`loans/solvency` 是后续更新预留，不是废弃设计，也不是非法扩展。当前不产生 `Loan` 实体，不启用借款、利息、还款、`arrange_financing`、危机周推进或危机结算。`financing_in/loan_repayment/loan_interest` 属于未来机制候选，不是当前冻结账本类目。未来恢复融资必须作为独立规则变更重新评审。

**周回执 `report.funds.costs` 口径**：固定四桶 `{salary, temporary, operations, production}`，与账本类目一一对应——核心员工周薪进 `salary`，项目临时员工周薪进 `temporary`，不再把临时工资并进 `salary`。刚性预检用的合计数是四桶之和；`delta` 仍取余额差，因此与四桶之和的差额只能来自结算、事件等非刚性收支。

### 3.7 `LedgerEntry.id` 与 `category` 约定

| 来源 | id 模式 | category | work_id | memo |
| --- | --- | --- | --- | --- |
| 周薪 | `w{week}.salary.{staff_id}` | `salary` | null | 员工名 |
| 签约费（hire_core） | `w{week}.salary.{staff_id}.signing` | `salary` | null | signing_fee |
| 公司运营 | `w{week}.operations` | `operations` | null | 公司运营 |
| Scout 费用 | `w{week}.operations.scout` | `operations` | null | scout |
| 项目制作 | `w{week}.production.{work_id}` | `production` | work_id | 强度值 |
| 定金锁定（lock_offer） | `w{week}.production.{offer_id}.deposit` | `production` | null | 定金锁定（到期不退） |
| 事件选项 `cost` | `w{week}.event.{event_id}.{work_id}` | `events` | work_id | 事件 id |
| 事件 `funds` 效果 | `w{week}.event.{event_id}.{work_id}.e{effectIndex}` | `events` | work_id | 事件 id |

- 同一命令内所有 id 全局唯一（INV-02，`claim_id`）。
- 路径段用单数 `event`，category 用复数 `events`，登记 D-08。
- DA §7.5 冻结 14 个当前 category；当前 v4 已产出 `salary/operations/production/temporary/events/contract_received/investment_paid/commercial_share_received/success_reward_received/penalty/distribution`。临时员工签约费与周薪走 `temporary` 并通过 `work_id` 归因合同项目，不复用核心 `salary`。BD 公司所得与委员会净池份额均记 `commercial_share_received`，靠 `memo` 区分。
- 定金锁定与签约抵扣必须继续使用 `investment_paid` 与 `contract_received` 两笔立项账，`deposit_paid` 只是 Market 对账快照，不是第二本账。定金在 `lock_offer` 时以 `production` 流水一次性入账；锁定期内 `start_work` 的 `investment_paid` 流水按抵扣后差额入账，不重复计支出、不新增退款流水。

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

初始化实测：`{company_result: null, series: [], works: []}`。`archive/works/series/company_result` 均为解析必填；交付结算与中止结算写入 `works`，仅交付结算按 IP 写可选 `series`，关闭路径可生成 `company_result`。INV-22 已独立断言完整载荷、系列引用、追加顺序和终局统计。

#### 3.9.1 当前冻结的 `WorkRecord`（31 个根字段）

| 分组 | 字段 | 约束 |
| --- | --- | --- |
| 身份与企划 | `id, ip_id, offer_id, name, source, genre, scale, mode, investment_percent` | `ip_id` 为非空字符串或 null；source 为 publisher/studio/manga/light_novel/game/original；scale 为 ova/short/tv/movie；contract 投资比例为 0，committee 为 10..100 的 10 倍数 |
| 时间与结论 | `start_week, end_week, end_reason, status, forced, gate_completion_permille, aborted_week, penalty_paid` | 0..520 且不倒退；end_reason 为 completed/deadline/company_closed/aborted；status 为 DELIVERED/ABORTED；completed 必须 forced=false 且完成度=1000；aborted 必须 status=ABORTED、aborted_week=end_week，非 aborted 的 aborted_week=null；penalty_paid 必须等于 finance_summary.penalty |
| 质量 | `quality, quality_score, rating` | quality 为 `{dims{六维}, mean}`，六维与均值均为 0..100 整数，均值四舍五入；rating 按 S≥85/A≥75/B≥65/C≥50/D 分档 |
| 商业汇总 | `commercial_revenue, bd_gross, bd_revenue, committee_pool, investor_share, company_received` | 非负整数；由 `channel_breakdown` 精确对账 |
| 财务 | `finance_summary` | 根字段为 contract_received/contract_refund/investment_paid/commercial_share/bd_revenue/success_reward/penalty/costs/total_costs/profit；costs 是允许类目的动态子集 |
| 明细与快照 | `channel_breakdown, episodes, team, rules_status` | channel 窗口不重复；episodes 非空且 id 不重复；team 的 id/name/role 快照 id 不重复；rules_status 当前固定 placeholder |

`channel_breakdown[]` 固定为 `window/potential/quality_factor/heat_factor/reputation_factor/tv_multiplier/agency_fee_permille/gross/net/revenue/company_received/owner`。窗口为 domestic_streaming/overseas/merchandise/music/tv/bd_dvd；BD 的 owner=company，其余 owner=committee_pool。`revenue=gross`、`0≤net≤gross`、`0≤company_received≤net`，且：

- `Σrevenue = commercial_revenue`，`Σcompany_received = finance_summary.commercial_share`。
- BD 的 `Σgross=bd_gross`、`Σnet=bd_revenue`；非 BD 的 `Σnet=committee_pool`。
- `investor_share = committee_pool - (commercial_share - bd_revenue)`。
- `company_received = commercial_share + success_reward`。
- `Σcosts = total_costs`；允许类目为 salary/production/temporary/outsourcing/events/extension/distribution/penalty/development，不要求全部出现。
- `profit = contract_received - contract_refund + commercial_share + success_reward - investment_paid - total_costs`。penalty 已计入 costs 时不再重复扣除。

`episodes[]` 当前固定为 `{id, quality}`；`team[]` 当前固定为 `{id, name, role}`，角色快照允许七种基础职业与 DEC-STAFF-006 的八种招聘职业标签（作画/演出/脚本/摄影/监督/音乐/声优/美术），id 不重复。完整键树见 `docs/v4-contract-shape.json`，TypeScript 守卫见 `apps/web/src/types/gameV4.ts`，不得用 v3 WorkRecord 代替。

#### 3.9.2 系列写入时机与来源

- 唯一来源链：`OfferSnapshot.ip_id → Project.ip_id → WorkRecord.ip_id → Archive.series`；不按标题猜测续作，不恢复 v3 的线性 `previous_work_id`。
- `Series = {ip_id, title, works[], last_week}`。仅在 completed/deadline/company_closed 交付结算时与 WorkRecord 同次原子提交；aborted 保留 WorkRecord 但不写 Archive.series。
- 首次带 IP 的交付创建系列，`title` 冻结为该作品名，`works=[work_id]`，`last_week=end_week`。
- 后续同 IP 交付只向 `works` 追加并推进 `last_week`，不改标题和既有 WorkRecord；不同 IP 即使同名也各自成系列。
- 系列 ip_id 唯一；works 引用必须存在、IP 一致、按交付周追加且不重复归属；last_week 等于系列最后交付周。无 IP 作品不创建系列。
- 单状态校验不能证明历史前缀从未被改写；命令前后快照回归测试负责证明既有 WorkRecord 与系列标题不变。

#### 3.9.3 `CompanyResult` 与 v3 隔离

v4 固定九字段：`reason/weeks/final_funds/net_cash_change/total_projects/best_work_id/rating/highlights/negatives`。reason 为 time_limit/bankrupt/voluntary，rating 为 S/A/B/C/D；time_limit 的 weeks 必须为 520。项目数、评级和最佳作品与 Archive.works 一致；评分并列时取 Archive 中首条。bankrupt 的 final_funds 允许为负，其余原因必须非负。v3 的七字段结果与 renowned/stable/small/failed 评级只保留在 `gameV3.ts`，v4 使用独立 `gameV4.ts` 子契约。

### 3.10 `Supplier` / `OutsourceContract` / `Partner` / `Committee` / `MarketState`

`initialize_game` 实测输出：`suppliers=[]`、`contracts=[]`、`committees=[]`、`market` 含 4 个初始槽位与四类热度、`partners` 含电视台/配信/出版三个初始合作方。

| 聚合 | 契约形状 | 代码 | 缺口影响 |
| --- | --- | --- | --- |
| `Supplier` | DA §7.4 + M0 §3 | `Json` 强形状校验 | 9 字段精确载荷、专业枚举/唯一性、数值边界与全局 id 已校验；具体供应商目录尚未初始化，命令 9 未实现 |
| `OutsourceContract` | DA §7.4 | `Json` 强形状校验 | 15 字段精确载荷、供应商/项目/工作项/单集/能力引用、费用与生命周期已校验；INV-19/20 已断言；周交付、可靠性延误/返工、截止失败与容量释放已实现，签约与费用结算未实现 |
| `Partner` / `Committee` | DA §7.4 + M0 §3 | `Json` 强形状校验 | Partner 8 字段、history 4 字段、Committee 6 字段与成员 2 字段已精确校验；INV-13 已断言，覆盖渠道归属、项目双向引用、active/closed 生命周期与 Archive 一致性 |
| `MarketState` | M0 §3 / DEC-MARKET-001；固定 4 个企划槽 | **槽位/生命周期/周补充/热度/合作方候选已初始化** | 初始目录与热度内容仍为 fixture（#59 标定）；自定/提案槽生命周期透传 |

`suppliers` / `contracts` / `partners` / `committees` 根数组是解析必填项；四类元素分别精确包含 9 / 15 / 8 / 6 个字段，未知字段与缺失字段均拒绝。active 合同必须指向 producing 项目。冻结契约要求终态合同仍保留可校验的项目与工作项引用，但当前 `settle_project` 会删除该项目合同；在 #53 明确终态归档形状前，这是一项已登记的实现缺口，不得通过删除引用校验或改写历史契约掩盖。规范化哈希按 id 排序 suppliers / contracts / partners / committees，并按集合语义排序 specialties、Partner.channels 与 Committee.members，因此目录遍历顺序不改变状态哈希。

Vendor 周结算已按 DEC-VENDOR-003/004 实现：active 合同的 `weekly_cap` 计入共享容量；每周先按坐标随机执行正常、延误或返工，再检查完成；本周结算后的已结算周 `week >= due_week` 且仍未完成时转 failed。同一工作项的多合同按剩余需求比例和最大余数法分配，公共项与 gate 即使标记 `outsourceable=true` 也拒绝推进。公司关闭预演会将原状态中的 active 合同置为 failed。供应商默认目录、`sign_outsourcing` 的 `due_week` 推导、签约预留和费用支付仍未实现；手工合法 fixture 的周交付通过不等于签约玩法已开放。

**Partnership 运行时现状（2026-11-27）**：`Partner.history[]` 固定为 `{week, work_id, delta, reason}`，只能引用已归档作品且 `week` 必须等于对应 WorkRecord 的 `end_week`；`Committee.members[]` 固定为 `{partner_id, channel}`，成员与渠道均不得重复，渠道必须属于该伙伴，`bd_dvd` 不挂成员。active Committee 必须与同一 `mode=committee` 项目双向引用，项目可处于 `producing` 或 `delivering`（公司关闭后等待结清），且 `formed_week=opened_week`；closed Committee 不得继续引用活动项目，其 `formed_week/closed_week` 必须与对应 Archive WorkRecord 的 `start_week/end_week` 一致。以上均纳入 INV-13；单状态校验不能证明 history 历史前缀从未被改写，追加顺序由命令前后快照测试约束。

### 3.11 未冻结的形状

`WorkRecord` 当前 31 字段载荷已于 §3.9 冻结；`episode_count/occurrence_issues/commercial_rank/episode_summary/committee_snapshot/major_events` 等未来扩展字段尚未实现，不得提前写入当前载荷。`Facility` 内部字段仍按对应批次跟踪；`temporary_contract` 三字段形状及 `end_week` 快照/延期同步语义已由 2026-11-27 决策冻结，形状校验、命令 8 签约与延期联动已实现。`Project.investment{percent,total,paid}`、`Project.extension`、`Project.delivery` 已由当前命令写入并实际使用，但其完整长期契约仍随对应批次收敛，不再标记为“命令未实现”。

### 3.12 Q3/Q4 契约落地状态

**Recruitment（M0 §14.13.1，已实现）**：

```text
Recruitment {
  pool: PoolCandidate[]
  pity: { since_sr: uint, since_ssr: uint }
  last_scout_week: uint | null
}
PoolCandidate { staff: Staff, expires_week: uint | null, origin: "regular" | "scout" }
```

- pool 候选不是公司员工，不参与周结算、不计薪；hire 解包后 `expires_week/origin` 不得残留在 Staff。
- 常规招聘池每周部分轮换（周结算固定步骤，先清理到期窗口再替换部分常规槽）；scout 候选不参与常规轮换，只按各自窗口到期。Scout 每周至多一次（`last_scout_week ≠ week`）；候选 `expires_week` 是首个不可签约周，regular 候选为 `null`。
- DEC-MARKET-001/#59 已确认招聘市场固定 4 个候选人展示槽，四槽全部属于 Recruitment，与企划市场完全独立；临时员工不进入候选池。当前 `pool` 仍沿用 6 个 regular 候选加 scout 的占位实现，尚未拆出四个展示槽身份、自由人才池、冷却与同身份重现，不得宣称最新四槽生命周期已实现。
- 生成逻辑与随机坐标逐位镜像 `scripts/lib/recruit-oracle.mjs`（规则样本）；池容量、轮换数、窗口周数、概率与费用全部 `[PLACEHOLDER]`，由 #59/#58 标定。职业→主能力映射沿用 DEC-STAFF-006 提案（DISC-11 细化前不改）。
- 2026-11-27 招聘市场设计归档要求通用随机简历按声望 Tier 生成，周薪由同能力全职工资公式乘 1.20 得出；当前 §14.13 的稀有度/保底生成与 `salary_base + primary × salary_per_primary` 仍是 #99 的 `[PLACEHOLDER]`。两套口径的衔接、档位随机分布与取整尚未裁决；在 #7/#53 收口前不得把当前占位生成误称为已实现最新设计。
- 员工报酬统一 `signing_fee + weekly_salary`，不再使用 `project_fee`；签约费走 Finance `salary` 流水（`w{week}.salary.{staff_id}.signing`），scout 费用走 `operations`（`w{week}.operations.scout`），见 §3.7。
- `dismiss_staff` 历史贡献者解雇语义已按 2026-11-27 负责人裁决收口：INV-12 的 contributors 是历史事实引用，不要求员工仍在当前 Staff 名册；允许满足命令 7 其他守卫的历史参与者解雇，历史 contributors 与 Archive 团队快照保持不变。运行时与 validator 回归已通过。
- `hire_core` 只接受 `employment=core` 且 `temporary_contract=null` 的池候选；scout 候选在 `week >= expires_week` 后即使仍留在输入状态中也返回 `NOT_FOUND`，不得签约。

**Offer 生命周期（M0 §14.13.2，市场槽已实现）**：

```text
Offer 新增：expires_week, locked_until, lock_used, deposit_paid, offer_source_type, deposit_basis, deposit_rate_permille, deposit_amount
```

> **2026-11-27 规则收口：** DEC-MARKET-001 与 #59 评论 7207555137 已撤销“3 个企划槽＋1 个短期外援槽”及 cap10 旧提案。企划市场固定 4 槽、初始生成 4 个、每周只补空槽；至少 2 个企划可立即承接，未过期与锁定企划保留。招聘市场另有固定 4 个候选人展示槽，两套槽位独立。

- 企划市场固定 4 槽，初始生成 4 个；同一企划 id 终身唯一（坐标 id 含 week+index，正常生成不重复）；终身锁定历史由 Finance 追加流水兜底，删除槽位后重新插入同 id 不得复位或再次收费。
- `lock_offer(offer_id)` 是命令 23（已实现）；第 W 周成功锁定后覆盖 W/W+1，W+2 开局失效。守卫：running ∧ pending 空 ∧ 市场槽存在且未过期 ∧ `lock_used=false` ∧ Finance 无该 id 的锁定历史 ∧ 现金 ≥ 定金；回执 `{state, offer_id, deposit_paid}`。
- 同一企划终身只能锁定一次；到期释放槽位、定金不退，Finance 定金流水保留，`lock_used` 保持 true。历史识别同时检查定金 ID 标记与 `production/counterparty/memo` 语义，单独改写流水 ID 不得绕过。
- 普通企划定金 5%、IP 上门企划 10%；DEC-PROD-006 的 TV-小按 5.5% 分档。`deposit_rate_permille` 与 `deposit_amount` 在 Offer 生成时冻结，后续预算、档位或来源字段被改写时不追溯重算已支付定金；缺快照的旧 fixture 才按 `deposit_basis` 与来源规则推导。`offer_source_type` 与 `deposit_basis` 必须随 Offer 快照保存。
- `lock_used=true` 的企划必须唯一对应规范 Finance 定金流水 `w{week}.production.{offer_id}.deposit`：`week/work_id/category/amount/counterparty/memo` 与 `locked_until=week+2`、`deposit_paid` 全部对账；缺失、重复或篡改均判 `INVALID_STATE`。
- 正式签约时定金 100% 抵扣（仅市场槽且锁定期内 `week < locked_until`）：抵扣额从已对账的 Finance 定金流水推导，不直接信任 `deposit_paid` 快照；`start_work` 现金守卫与 `investment_paid` 流水按 `应付款 − min(已对账定金, 应付款)` 计算。Finance 保留 `investment_paid/contract_received` 两笔账，不重复记录定金。
- 周结算阶段 7 先执行下一周开场的招聘/市场步（释放到期锁定 → 自然过期，锁定期内受保护 → 补满全部空槽），再进入阶段 8 抽取事件；存活企划逐字段不变，不是清空重抽。补位时优先保证至少 2 个企划的 `min_reputation` 不高于公司声望。生成坐标 `draw(seed, week, market/offer_gen, index*16+k)` 逐位镜像 `scripts/lib/market-oracle.mjs`；有效期分布仍为 `[PLACEHOLDER]`（#59/M7）。
- 现行边界（缺口登记 #6）：初始 4 槽沿用 M1 fixture 目录（内容与到期窗口待 #59 标定，`expires_week=3` 为 PLACEHOLDER）；热度仍为静态 fixture，坐标热度生成随内容标定迁移；承制模式无应付投资额，按冻结公式抵扣为 0，定金是否随 `contract_received` 返还待裁决；自定/提案槽生命周期字段透传不强制，`lock_offer` 仅作用于市场槽；非 TV 蓝图尚未注册，当前生成器只产出 `tv_standard` 企划，非 TV 规模映射仍待标定。

---

## 4. 命令矩阵

M0 §5 冻结 **23 条命令**。核心实际导出 **28 个绑定入口**：22 个已接入的 §5 命令、3 个测试/内部别名、3 个状态/内容工具。文档命令数与实现覆盖度必须分开，不能继续使用旧的 22 条基线。

| # | 命令 | 入口 | 输入（实测必填） | 主要错误码（实测） | 回执（实测） | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `initialize_game(seed)` | ✅ | `seed`（非负整数） | `INVALID_INPUT` | `{state}` | `实现` |
| 2 | `start_work(offer_id, mode, percent, committee_partner_ids)` | ✅ | `state` + 命令参数 | `NOT_FOUND/INVALID_INPUT/INVALID_PHASE/INVALID_STATE/INSUFFICIENT_FUNDS` | `{state, work_id, committee_id}` | `实现`；锁定期内定金 100% 抵扣已实现（§3.12） |
| 3 | `set_work_plan(work_id, plan)` | ✅ | `state, work_id, plan` | `INVALID_INPUT/NOT_FOUND/INVALID_PHASE` | `{state}` | `实现` |
| 4 | `assign_staff(staff_id, work_id\|null)` | ✅ | `state, staff_id, work_id` | `NOT_FOUND/INVALID_PHASE/INVALID_STATE` | `{state}` | `实现`；监督原子 Swap/Replace |
| 5 | `hire_core(staff_id)` | ✅ | `state, staff_id`（池中候选 id） | `NOT_FOUND/INVALID_PHASE/INSUFFICIENT_FUNDS/CAPACITY_EXCEEDED` | `{state, staff_id}` | `实现`；从 Recruitment 解包，当周可分配（§14.4）；编制 [PLACEHOLDER] |
| 6 | `scout(role?, focus_ability?)` | ✅ | `state`；`role/focus_ability` 至多一个 | `INVALID_INPUT/INVALID_PHASE/INSUFFICIENT_FUNDS` | `{state, added_ids}` | `实现`；每周至多一次；窗口/费用 [PLACEHOLDER] |
| 7 | `dismiss_staff(staff_id)` | ✅ | `state, staff_id` | `NOT_FOUND/INVALID_INPUT/INVALID_PHASE` | `{state}` | `实现`；监督原子替换；历史 contributors 不阻止解雇且保持不变 |
| 8 | `hire_temporary(work_id, candidate_id)` | ✅ | `state, work_id, candidate_id` | `NOT_FOUND/INVALID_INPUT/INVALID_PHASE/INSUFFICIENT_FUNDS/CAPACITY_EXCEEDED` | `{state, staff_id}` | `实现`；D-07 三字段合同、公司级弹性工位、Finance `temporary` 类目与延期联动 |
| 9 | `sign_outsourcing(work_id, item_id, supplier_id, work_total, mode)` | ❌ | — | — | — | `待实现` |
| 10 | `deliver_work(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/INVALID_PHASE/GATE_UNMET/INVALID_STATE` | `{state, report}` | `实现`；pending 守卫拒绝交付 |
| 11 | `abort_work(work_id)` | ✅ | `state, work_id` | `NOT_FOUND/INVALID_PHASE/COMPANY_ENDED/INVALID_STATE` | `{state, report}` | `实现`；50% 违约金/退款、声望重罚、Archive 履历、负余额破产见 §3.9/M0 §14.14 |
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
| 23 | `lock_offer(offer_id)` | ✅ | `state, offer_id` | `NOT_FOUND/INVALID_INPUT/INVALID_PHASE/INSUFFICIENT_FUNDS` | `{state, offer_id, deposit_paid}` | `实现`；W/W+1 有效、W+2 开局失效、终身锁定一次、定金不退（§3.12） |

非 §5 命令：`hash_state(state)`（工具）、`validate_event_catalog` / `event_catalog_info`（内容工具）、`initialize` / `instantiate_work` / `set_plan`（别名）。

### 4.1 未实现命令的回执

M0 §6 的 `NOT_IMPLEMENTED` 当前用于非整除委员会净池分配；事件升级实现合入前仍拒绝非空升级配置。返回错误信封且不携带 `state`，不清事件、不关闭项目、不伪造处罚或归档、不静默舍入。破产/第 520 周携带 pending 时已按稳定顺序执行默认保守分支后进入强制终局，不再返回 `NOT_IMPLEMENTED`。

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
- `works[].items[].points` 是本周工作项净推进，包含社内生产与外包交付；外包返工倒扣时可为负数。`staff[].produced` 仍只统计社内生产，`quality_gain` 记录社内生产引起的质量变化。
- `funds.costs` 只有 3 个键，与 14 类 category 不对应，登记 D-13。
- `report` 不是 DA §9.4 的 `WeekReceipt`；后者是前端派生读模型，边界见 D-14。
- 交付/结清的 `report.settlements[]` 同时记录 `bd_gross`（BD/DVD 毛收入）与 `bd_revenue`（公司 50% 所得）；`commercial_revenue` 为全部开放窗口毛收入，`committee_pool` 为非 BD 净池，`commercial_share + investor_share = committee_pool`。
- 外部代理按 DEC-COMM-001 使用 450/400/350‰；当前“同类成功合作”从 Archive 中 `end_reason=completed` 且 `channel_breakdown[]` 对应渠道 `net>0` 的已完成作品派生，不新增持久化计数字段。
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

M0 §5 的“工作副本 + 一次提交”在已实现命令上成立：守卫失败不返回 `state`，输入状态逐字段不变。`advance_week` 预检不足按 §14.2/§14.7 回滚并直接破产，不产生部分流水或制作推进；若仍有 pending，则按 `(work_id,event_id)` 顺序执行冻结快照中的默认保守分支并移除后再关闭。自动分支成本按现金封顶，非法配置使整周原子失败且不误删事件。

### 5.4 八阶段与 v4 实现对照

| §14.7 阶段 | 内容 | v4 实现 |
| --- | --- | --- |
| 1 | 计划冻结与快照 | `实现`；失败回到快照 |
| 2 | 刚性支出预检 | `实现`；不足直接破产，pending 按冻结默认分支结清 |
| 3 | 刚性支出扣款 | `实现`；核心/临时员工周薪均走唯一流水 |
| 4 | 项目生产推进 | `实现` |
| 5 | 经验/疲劳/红灯 | 经验/疲劳/士气 `实现`；`forced_rest` 未实现 |
| 6 | 商业窗口与交付收入 | `实现`；含委员会分账与强制交付扣罚 |
| 7 | 延迟状态倒计时 | 限时事件默认分支 `实现`；DEC-EVENT-002 一次升级已冻结，代码由独立工作树收尾 |
| 8 | 随机事件与周数递增 | `实现`；第 520 周 pending 按冻结默认分支结清后关闭 |

---

## 6. 不变式实现对照

M0 §4 共 **29 条**。当前 `validate()` 实际断言 **17 条**：`INV-01/02/03/04/06/07/09/11/12/16/18/21/23/24/25/27/29`。

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
| 19 供应商周承诺 | ✅ | validate 按 supplier_id 汇总 active weekly_cap，超过容量或 int64 汇总溢出即拒绝；命令 9 未实现 |
| 20 合同项归属/累计交付 | ✅ | validate 校验供应商、项目、工作项、episode 容器与能力引用；按 item_id 汇总全部合同 work_done，不得超过工作项 work_total；终态释放容量 |
| 21 week 只由 advance_week 改 | ✅ | |
| 22 Archive 载荷/系列/终局一致性 | ✅ | INV-22 校验 31 字段 WorkRecord、aborted 状态与退款对账、渠道财务对账、IP 系列引用与追加顺序；命令前后快照测试验证历史前缀不变 |
| 23 事件仲裁 | ✅ | |
| 24 市场固定 4 槽/至少 2 个可承接/终身唯一 | 🔶 部分 | 初始 4/固定上限 4 与当前槽 id 唯一已断言；Finance 定金历史防删除后重插；周补位保障至少 2 个可承接，跨槽历史互斥未完整断言 |
| 25 balance ≥0 / 预检失败破产 | 🔶 部分 | running 非负余额、无 pending 破产与 pending 终局默认分支已实现；bankrupt closing/ended 允许负余额，融资/贷款仍为未来预留 |
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
| D-12 | 未实现命令 NOT_IMPLEMENTED 占位 | B | §4.1 | 当前仅用于非整除委员会净池分配；事件升级实现前拒绝非空升级配置，不为未实现载荷猜测成功回执 |
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
| Staff 静态字段与 `signing_fee/weekly_salary` | initialize；hire_core 解包入册 | 唯一 | 不再使用 `project_fee` |
| `recruitment.pool/pity/last_scout_week` | initialize；scout/hire_core；advance_week 轮换 | Staff 域唯一 | M0 §14.13.1；dismiss_staff 只移名册不动池 |
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
| `balance/entries` | 立项、周结算、事件、交付/中止/结清，经账本提交器 | 同一写入器族 | 收入与支出均已实现；INV-16/INV-25；contract_refund 仅由中止退款写入 |
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
| `market` | 初始化；原创草稿、采纳/拒绝、start_work 消费企划；lock_offer 锁定快照；advance_week 周补充/过期/释放 | 初始目录与热度内容待 #59 标定；竞争仍属 M3 缺口 |
| `archive` | 交付/中止追加 works；交付按 IP 写 series；finalize_company 写 company_result | 只追加；aborted 不写 series；终局 pending 按冻结快照执行默认保守分支后结清 |
| `suppliers/contracts` | 初始化空聚合；解析与 validate 读取；确定性周交付、可靠性失败与截止释放已实现 | 强形状、INV-19/20 与规范化哈希已实现；供应商目录、签约、费用支付和终态合同归档尚未完成 |

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
| P1 | 事件效果代写 Staff/Project/Finance；事件升级载荷 |
| P2 | market 竞争与热度内容标定；Archive 扩展履历；前置商业成本输入；非整除净池取整；更多伙伴/关系玩法 |
| P3 | 供应商/外包；Facility；系列续作玩法（Archive 系列写入已完成）；临时候选生成比例与四槽招聘生命周期；其余未冻结载荷 |

`loans/solvency` 不再列入删除阻塞；其当前约束由 INV-18/INV-25 与 reserved 审计保证。`project_fee` 不再列入 V4 待改名项；历史 v3 字段保留，V4 统一使用 `signing_fee`。

### 11.2 端到端 fixture 现状

当前可执行链路：`initialize_game → start_work → assign_staff → 多周 advance_week → view_event → resolve_event → deliver_work → end_company/finalize_delivery → finalize_company`。承制与委员会模式均可贯通“交付 → Archive → Finance”；命令 10/19/20/21 已实现。`abort_work` 可按权威进度完成承制退款/违约金、委员会沉没核销、声望重罚、WorkRecord/Finance 归档和资源释放；破产或第 520 周携带 pending 时，按 `(work_id,event_id)` 顺序只执行冻结快照中的默认保守分支并移除对应 pending，再进入既有终局结清路径。事件升级仍待独立契约与实现，详见 `M2_M4_PROJECT_LOOP.md`。

2026-11-27 新增 v0.5 固定 seed（`20261127`）十集真实周生产 fixture：从 `initialize`、`start_work` 和四名正式员工分配开始，按真实 `advance_week` 推进，期间查看并处理事件，以固定可靠性 100% 的供应商合同 fixture 补足可外包项。TV-小在完成第 52 周生产后按截止规则自动结算；核心 10,600 点与可外包项 15,200 点全部完成，10 个 gate 全部交付。55 份合同对应外部 13,023 点、外包支出 52,092,000；社内完成 12,777 点，其中可外包项 2,177 点。Archive 记录 `start_week=0`、`end_week=52`、`forced=false`、`gate_completion_permille=1000`，Finance 余额恒等式成立；同 seed 重放的 diagnostics 与状态哈希一致，提前交付失败保持状态不变。

该 fixture 使用初始化员工与手工合法合同，不证明招聘四槽生命周期或 `sign_outsourcing` 正常玩法已经完成。结项仍按既有规则删除项目合同，终态合同归档形状待 #53 裁决；质量闭环、质量扣罚、红灯强制休养及四人 52 周有效核心产能区间也未由本 fixture 验收。全外包 60,800,000 仍是独立经济情景，不是本次混合生产支出。

### 11.3 #53 验收项自查

| 验收项 | 结论 | 依据 |
| --- | --- | --- |
| 字段唯一写入权威 | 部分 | §10；事件代写仍待裁决 |
| 共享 ID/枚举/可空/时间/金额一致 | 部分 | §10.8；D-06/D-08 等例外 |
| 命令输入/输出/错误码/原子性 | 已实现部分满足 | §4/§5/§9 |
| 无未解释重复事实源 | 满足 | Finance 唯一现金权威；deposit_paid 仅快照 |
| 端到端至交付/Archive | 已实现主链满足 | §11.2；中止及终局 pending 均已覆盖 |
| M2 与远期分层 | 满足 | §3.12/§11.1 |
| 裁决项含证据与边界 | 满足 | §8 |
