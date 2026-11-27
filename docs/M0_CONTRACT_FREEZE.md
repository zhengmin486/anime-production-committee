# M0 契约冻结（v4.0）

> 状态：**已建立并合入 main 的 v4 契约基线（2026-11-24）**。本文冻结的是当前可依赖的基线，不代表后续禁止修补或演进；契约变更按 §13 与[工程变更治理](ENGINEERING_CHANGE_GOVERNANCE.md)执行。
> 上位文档：[领域架构设计 v1.4](DOMAIN_ARCHITECTURE.md)、[制作蓝图规范](BLUEPRINT_SPEC.md)
> 权威玩法：[DECISION_LOG.md](DECISION_LOG.md)
> 冻结基线提交：`9bee444`（本文所在提交为其子提交）
> 运行方式：`npm run validate:blueprint`、`npm run validate:handover`

---

## 1. 冻结声明

### 1.1 冻结什么

| 类别 | 内容 | 变更成本 |
| --- | --- | --- |
| 状态形状 | `GameState v4` 的聚合、字段、可空规则 | 高：影响校验器、存档、全部读模型 |
| 不变式 | INV-01 – INV-29 | 高：每条都要有对应断言 |
| 命令面 | 23 个命令的输入、守卫、错误码 | 中：影响 UI 与测试 |
| 回执形状 | 命令返回键与 `advance_week.report` 键树 | 中：UI 按回执渲染（字段级见数据字典 §5） |
| 错误码 | 16 个稳定码 | 中：UI 按码分支 |
| 旧版危机白名单 | 仅作为历史记录，不授权当前命令 | 历史契约；当前无危机状态或危机期命令集合 |
| 存档策略 | v4 信封、版本拒绝、单槽 | 高：影响老存档 |
| 蓝图契约 | schema、依赖语义、门槛语义 | 中：影响内容生产 |

### 1.2 不冻结什么

- 一切数值：工作量、系数、阈值、期限、概率。归 `[PLACEHOLDER]` 与模拟标定。
- UI 版式、文案、交互细节。
- 内容数量：蓝图份数、事件卡数量、员工样本数量。
- 领域内部的函数拆分与文件组织（只要不破坏 INV）。

### 1.3 冻结的含义

- M1 及之后不得为了实现便利、代码风格偏好或局部重构而擅自改变字段名、可空性、不变式或错误码语义。
- **冻结不等于永不修改**：后续发现缺陷、遗漏、跨模块冲突或新需求时，允许修补本契约；先判断能否通过兼容扩展、适配或局部修正解决，不得默认重做整个模块或架构。
- 需要改变既有字段、可空性、不变式、命令或错误码时，先证明现有形状无法合理表达目标，并按 §13 提交变更说明、迁移与回归方案；未经负责人批准，不得自行合入破坏性契约变更。
- 内部实现可在不改变对外行为和契约的前提下持续整理；无关模块不得搭车重构。
- **"文档冻结"不等于"功能实现"**：本文件不宣称任何运行时行为已经存在。

---

## 2. 根结构与版本

```text
GameState {
  version: 4
  seed: uint32                      // 唯一随机输入；不存计数器
  company: Company
  staff: Staff[]
  recruitment: Recruitment            // Staff 域：招聘池/保底计数/每周 scout 事实（§14.13）
  works: Project[]                  // 活动项目；settled 后移出
  suppliers: Supplier[]
  contracts: OutsourceContract[]
  partners: Partner[]
  committees: Committee[]
  market: MarketState
  events: EventState
  finance: Finance
  archive: Archive
}

SaveRecord { version: 4, savedAt: ISO8601, rules_version: string, state: GameState }
```

**不存在的字段**（v3 遗产，禁止复活）：`phase`（全局经营阶段）、`project`（单数）、`pending_event`（顶层单槽）、`preview`（派生）、`last_project_id`、`company.finance`、`project.finance`、`StageResult`、`OfferSnapshot.previous_work_id`。V4 系列关系只使用 `ip_id` 来源链，不按标题猜测续作。

**派生值不入存档**：`risk`、`preview`、读模型（`company_overview` 等）、`week_receipt`、`target_effective`。加载时由核心重算。

---

## 3. 聚合契约

只列**必填/可空/关键约束**，完整字段语义见架构 §7；字段级展开、实现状态与分歧登记见 [DATA_DICTIONARY_V4.md](DATA_DICTIONARY_V4.md)（#53），字段唯一写入方与跨模块读写矩阵见其 §10。

| 对象 | 必填 | 可空 | 关键约束 |
| --- | --- | --- | --- |
| `Company` | id, name, founded_week, week, status, reputation, reputation_log | end_reason（仅 running 为 null）, facilities（可空数组） | week ∈ [0,520]；status=running ⇒ week<520；core_staff_capacity 由设施扩建等级派生，仅统计核心员工名册，不含临时员工 |
| `Staff` | id, name, role, employment, abilities, experience, potential, revealed_potential, talent_type, signing_fee, weekly_salary, fatigue, morale, departure_warning, assignment_work_id | last_participation, temporary_contract | core/temp 均使用一次性 signing_fee + weekly_salary>0；不再使用 project_fee；core 的 temporary_contract=null；temp 的 assignment_work_id = 合同项目；公司至少保留 1 名 core |
| `Project` | id, offer, mode, investment, channels, opened_week, deadline_week, extension, status, supervisor_staff_id, common, episodes, plan | ip_id, committee_id, tv_service, delivery | committee 模式才可有 committee_id；episodes 长度 = offer.episode_count |
| `CommonProduction` | id, items | — | items 非空 |
| `EpisodeProduction` | id, index, stages | — | stages 恰 6 个，顺序固定；实现为 6 元素数组，每元素带 `key`（非 JSON 对象键），见数据字典 §3.4 |
| `WorkItem` | id, key, ability, work_total, work_done, deliver_at, deps, is_gate, quality, contributors | — | 0 ≤ work_done ≤ work_total；deliver_at ∈ [1,1000] |
| `WorkPlan` | intensity, focus, outsourcing, overtime, target | — | target 至多一个，引用本项目单集/阶段 |
| `Supplier` | id, name, specialties, capacity_per_week, quality, speed, price_per_unit, reliability, unlocked_week | — | 目录只增不改 |
| `OutsourceContract` | id, supplier_id, work_id, episode_id, item_id, ability, mode, work_total, work_done, weekly_cap, fee_total, fee_paid, signed_week, due_week, status | episode_id（公共制作为 null） | item 属于同一 work；Σactive weekly_cap ≤ supplier 容量 |
| `Partner` | id, name, type, channels, prestige, relationship, history, status | — | 渠道唯一 |
| `Committee` | id, work_id, members, formed_week, status | closed_week | 一成员一渠道，bd 不挂成员 |
| `MarketState` | heat, slots, refresh_week, competitors | custom_offer, proposal, last_competition_round | `market.slots ≤ 4`；初始生成 4 个企划，每周只补空槽；自定/提案为独立槽；Offer 生命周期字段见 §14.13 |
| `Recruitment` | pool, pity, last_scout_week | — | Staff 唯一持有；pool 候选包装 `{staff, expires_week, origin}`；详见 §14.13 |
| `Finance` | opening_funds, balance, entries, loans, solvency | — | balance = opening + Σentries；running 时 balance ≥ 0，bankrupt 的 closing/ended 允许负余额；当前 `loans=[]`、`solvency.state="normal"`；两字段仅作后续更新预留，不授权危机或融资 |
| `EventState` | pending[], last_event_week, per_work | pending 数组可为空 | 每条待处理事件带 work_id/event_id/triggered_week/viewed；viewed 缺失即非法输入，不静默当未查看（§14.12）；pending 中每项目至多一条；不同项目可同周各有事件；last_event_week 不得充当全局单槽 |
| `Archive` | works: WorkRecord[], series: Series[] | company_result | WorkRecord 只追加；系列按 IP 追加作品并单调推进 last_week |

**Archive 当前冻结口径**：`WorkRecord` 的 31 个根字段及其嵌套 `quality/channel_breakdown/finance_summary/episodes/team` 形状以 `docs/v4-contract-shape.json` 与 `docs/DATA_DICTIONARY_V4.md` §3.9 为准。系列来源链为 `OfferSnapshot.ip_id → Project.ip_id → WorkRecord.ip_id → Archive.series`；`completed/deadline/company_closed` 交付结算与 WorkRecord 同次原子写入系列，`aborted` 保留 WorkRecord 但不写系列。首次交付冻结系列标题，后续同 IP 交付只追加 `works` 并更新 `last_week`；不同 IP 不按标题合并。`finance_summary.profit = contract_received - contract_refund + commercial_share + success_reward - investment_paid - total_costs`，不重复扣除已计入 `costs.penalty` 的扣罚。

---

## 4. 不变式清单（必须断言）

| # | 不变式 | 违反时的码 |
| --- | --- | --- |
| INV-01 | 根对象字段齐全，`version=4`，类型与取值范围合法 | INVALID_STATE |
| INV-02 | 全部实体 id 全局唯一（work/staff/supplier/contract/partner/committee/offer/item/archive） | INVALID_STATE |
| INV-03 | `0 ≤ work_done ≤ work_total`；`deliver_at ∈ [1,1000]` | INVALID_STATE |
| INV-04 | `deps` 无环、不自指、只引用本项目工作项（可跨容器，不跨项目） | INVALID_STATE |
| INV-05 | 工作项无 `status` 字段；`unlocked/delivered/complete` 全部派生 | INVALID_STATE |
| INV-06 | 每个单集恰有 6 个阶段，键固定为 `content_design / storyboard_key_animation / animation / art_visual / photography_editing / sound_delivery`，顺序固定 | INVALID_STATE |
| INV-07 | 每集至少一个 `is_gate`，且只出现在 `sound_delivery` | INVALID_STATE |
| INV-08 | 作品可交付 ⇔ 所有 `is_gate` 项 `delivered`（派生，不存字段） | — |
| INV-09 | `assignment_work_id` 为 null 或指向 `producing` 项目 | INVALID_STATE |
| INV-10 | 同一周一名员工只有一个归属；临时人员归属恒等于合同项目 | INVALID_STATE |
| INV-11 | `last_participation.week` ∈ {`week-1`, null} | INVALID_STATE |
| INV-12 | `contributors` 只增不删、无重复、只含历史上实际参与过该工作项的员工；历史引用不要求其仍在当前 Staff 名册 | INVALID_STATE |
| INV-13 | 委员会成员不重复、渠道不重复、`bd` 不挂成员 | INVALID_STATE |
| INV-14 | contract ⇒ `investment.percent=0 ∧ paid=0 ∧ committee_id=null`；committee ⇒ percent ∈ {10..100} 且 committee_id≠null | INVALID_STATE |
| INV-15 | `allowed_modes`：普通企划含 contract 与 committee；原创仅 committee | INVALID_STATE |
| INV-16 | `balance = opening_funds + Σ entries.amount` | INVALID_STATE |
| INV-17 | 每笔 entry 只属一个 category；`commercial_share_received` 与 `success_reward_received` 只能由交付结算写入，`contract_received` 按 `start_work` 立项契约写入 | INVALID_STATE |
| INV-18 | 当前 Finance 保留 `loans=[]` 与 `solvency.state="normal"` 作为后续更新预留；不得出现 `Loan` 实体、非空 loans 或 `solvency.state="crisis"`；融资与危机周机制不属于当前状态契约 | INVALID_STATE |
| INV-19 | 同一供应商 `Σ active 合同 weekly_cap ≤ capacity_per_week` | CAPACITY_EXCEEDED |
| INV-20 | 合同 `item_id` 属于同一 `work_id`；累计交付不超过该项 `work_total` | INVALID_STATE |
| INV-21 | `running ⇒ week < 520`；`week` 只由 `advance_week` 改变 | INVALID_PHASE |
| INV-22 | Archive 根字段齐全；WorkRecord 31 字段载荷、质量/评级、渠道与财务对账合法且按结束周追加、id 唯一；aborted 记录 status=ABORTED、aborted_week=end_week、penalty_paid 与 finance_summary.penalty 一致，且不进入 Series；Series 的 ip_id 唯一，作品引用存在且 IP 一致、仅归属一个系列、按交付周追加，last_week 等于最后交付周；带 ip_id 的已交付作品必须归属系列；company_result 与公司状态及 Archive 统计一致 | INVALID_STATE |
| INV-23 | `events.pending[]` 可同时包含多个项目事件；每条带 `work_id/event_id/triggered_week/viewed`，pending 中每项目至多一条；同一项目每周最多触发一个；未查看事件阻塞推进，已查看未处理事件不阻塞；`last_event_week` 不得全局限流；事件不得覆盖/丢弃 | INVALID_STATE |
| INV-24 | `market.slots ≤ 4`，初始生成 4；每周只补空槽且至少 2 个可立即承接；自定/提案槽与市场槽、历史 id 互斥；同一企划 id 终身唯一，不得删除后再生成绕过锁定历史 | INVALID_STATE |
| INV-25 | `running` 时 `Finance.balance ≥ 0`；`bankrupt` 的 `closing/ended` 允许负余额以保留未豁免债务。刚性支出预检不足时回滚并直接破产，不记录负现金欠付，不得以 `solvency.state="crisis"` 绕过 | INVALID_STATE |
| INV-26 | 存档中不含派生值（§2 列表）；加载时重算 | SAVE_CORRUPT |
| INV-27 | 每个 producing 项目恰有一名已通过任职资格校验并已分配到该项目的监督；资格仅在任职/分配时校验，任职后不因属性波动撤销；不得出现监督空缺或重复 | INVALID_STATE |
| INV-28 | forced_rest 员工保留原项目归属与岗位占位但不贡献产能；满期次周开局恢复原岗位；监督已被替补时原监督回归不得顶替现任监督 | INVALID_STATE |
| INV-29 | 限时事件触发周计入有效期；仅已查看且仍未处理的限时事件可随周推进倒计时，阶段 7 到期执行默认分支或一次性升级；升级事件再次超时执行违约分支；未查看事件阻塞推进；超时处理不得丢失其他项目 pending | INVALID_STATE |

---

## 5. 命令契约

命令是**用例级**的：每个命令独立 schema、独立守卫、独立错误码，不存在"万能 decision 联合类型"。

23 个现行命令，每行一条命令。旧版 `arrange_financing` 不属于当前 v4 命令面；命令 22 `view_event` 由 #50 追加，语义见 §14.12；命令 23 `lock_offer` 的 Q4 语义见 §14.13。命令的入口实现状态、输入必填与回执键见 [DATA_DICTIONARY_V4.md](DATA_DICTIONARY_V4.md) §4/§5（#53）。

| # | 命令 | 关键守卫 | 主要失败码 | 原子范围 |
| --- | --- | --- | --- | --- |
| 1 | `initialize_game(seed)` | 无（唯一不带 state 的命令） | INVALID_INPUT | 建立公司/名册/供应商/合作方/市场首轮 |
| 2 | `start_work(offer_id, mode, percent, committee_partner_ids)` | running ∧ 企划存在且有效 ∧ 模式合法 ∧（普通企划满足 `min_reputation/required_works` ∨ 有效原创草稿存在）∧ 现金 ≥ 全部应付款 − deposit_paid（仅锁定期内有效企划可按 §14.13 抵扣） | NOT_FOUND / MODE_NOT_ALLOWED / INSUFFICIENT_FUNDS | 项目+委员会+Finance 投资/合同预算两笔账（定金已付部分按 §14.13 抵扣，不重复计支出）+消费企划，一次提交；原创在此正式开工 |
| 3 | `set_work_plan(work_id, plan)` | 项目 producing ∧ target 引用本项目单集/阶段且至多一个 | NOT_FOUND / INVALID_INPUT | 仅更新计划 |
| 4 | `assign_staff(staff_id, work_id \| null)` | 项目 producing ∧ 员工存在 ∧ 不违反单项目 ∧ 监督更换须原子 Swap/Replace ∧ 调整后所有 producing 项目仍满足 INV-27 | NOT_FOUND / INVALID_PHASE | 更新归属；监督更换不得留下空缺或重复 |
| 5 | `hire_core(staff_id)` | running ∧ 候选人存在 ∧ 现金 ≥ signing_fee ∧ 当前核心员工数 < 已解锁 core_staff_capacity | NOT_FOUND / INSUFFICIENT_FUNDS / CAPACITY_EXCEEDED | 从招聘池解包并加入核心名册，当周可分配；临时员工不占核心编制；signing_fee 通过 Finance 即时入账，首周周薪计入本周下一次周结算 |
| 6 | `scout(role?, focus_ability?)` | running ∧ `events.pending[]` 为空 ∧ 现金 ≥ 本次费用 ∧ `recruitment.last_scout_week ≠ week`（每周至多一次）∧ role 与 focus_ability 至多传一个 | INVALID_INPUT / INVALID_PHASE / INSUFFICIENT_FUNDS | 池+保底计数+last_scout_week+Finance 费用流水；scout 候选带签约窗口（§14.13） |
| 7 | `dismiss_staff(staff_id)` | running ∧ core 员工存在 ∧ 解雇后 core 数 ≥1 ∧ 若为监督须先原子替换；无同项目/空闲合格替补则关键岗位锁定 | NOT_FOUND / INVALID_INPUT / INVALID_PHASE | 移出名册+清空归属；不预付遣散费 |
| 8 | `hire_temporary(work_id, candidate_id)` | running ∧ 项目 producing ∧ 候选人存在且 `employment=temporary` ∧ 现金 ≥ signing_fee ∧ 弹性工位有空位 | NOT_FOUND / INVALID_INPUT / INSUFFICIENT_FUNDS / CAPACITY_EXCEEDED | 解包临时候选并写入 `temporary_contract={work_id,start_week=week,end_week=project.deadline_week}`、`assignment_work_id=work_id`；Finance `temporary` 类别即时扣签约费；weekly_salary 从后续周结算计提；一次提交 |
| 9 | `sign_outsourcing(work_id, item_id, supplier_id, work_total, mode)` | 工作项已解锁 ∧ 专业匹配 ∧ 产能余量 ∧ 现金 | DEPENDENCY_UNMET / CAPACITY_EXCEEDED / INSUFFICIENT_FUNDS | 合同+费用+占用 |
| 10 | `deliver_work(work_id)` | 全部门槛项 delivered ∧ 未过截止 ∧ 项目 producing | GATE_UNMET / INVALID_PHASE | 当次完成交付结算（周数不变） |
| 11 | `abort_work(work_id)` | running ∧ 项目 producing ∧ 未过截止 ∧ 本项目无 pending | NOT_FOUND / INVALID_PHASE / COMPANY_ENDED | 中止结算、退款/违约金入账、声望重罚、委员会关闭、Archive 履历、人员/外包释放；负余额复用破产关闭 |
| 12 | `create_custom_offer(name, source, scale, style)` | running ∧ 基础声望等草稿资格满足 ∧ 原创草稿槽可用；不检查全部投资资金 | INVALID_INPUT | 只创建原创草稿，不建立 Project、不扣全部投资资金；草稿开发费时点待确认 |
| 13 | `adopt_proposal()` | 存在提案 ∧ running | NOT_FOUND | 提案→自定槽 |
| 14 | `reject_proposal()` | 存在提案 | NOT_FOUND | 清空提案 |
| 15 | `buy_tv_service(work_id)` | 委员会模式 ∧ 未购买 ∧ 现金 | MODE_NOT_ALLOWED / INSUFFICIENT_FUNDS | 渠道+发行费 |
| 16 | `request_extension(work_id)` | 委员会模式 ∧ 未用过 ∧ 未过截止 ∧ 现金 | MODE_NOT_ALLOWED / INSUFFICIENT_FUNDS | 延期+费用；在同一原子提交中同步更新该项目所有在聘临时员工 `temporary_contract.end_week` 为新的 `deadline_week` |
| 17 | `advance_week()` | running ∧ 不存在 `viewed=false` 的 pending 事件 ∧ week<520 ∧ 非 closing | INVALID_PHASE | 八阶段原子周结算；刚性支出预检失败则回滚并直接破产终局 |
| 18 | `resolve_event(work_id, event_id, option_id)` | 该 work 存在对应 pending 事件 ∧ 选项合法 ∧ 现金充足（若需付款） | NOT_FOUND / INVALID_INPUT / INSUFFICIENT_FUNDS | 效果分派；只移除 `(work_id,event_id)` 对应事件 |
| 19 | `end_company()` | running | INVALID_PHASE | 锁 closing，未交付转 delivering |
| 20 | `finalize_delivery(work_id)` | 项目 delivering（关闭路径） | INVALID_PHASE | 交付结算 |
| 21 | `finalize_company()` | 公司 ended 且项目已结清 | INVALID_PHASE | 生成结局，只执行一次 |
| 22 | `view_event(work_id, event_id)` | 该 work 存在对应 pending 事件 ∧ 事件未查看（已查看按幂等成功） | NOT_FOUND / INVALID_INPUT / COMPANY_ENDED | 只把目标事件标记为已查看，解除它对命令 17 的阻塞；不结算、不扣款、不移除（语义见 §14.12） |
| 23 | `lock_offer(offer_id)` | running ∧ `events.pending[]` 为空 ∧ 企划存在且未过期 ∧ `lock_used=false`（终身一次）∧ 现金 ≥ 定金 | NOT_FOUND / INVALID_INPUT / INSUFFICIENT_FUNDS | Finance 定金流水 + `locked_until=week+2` + `lock_used=true` + `deposit_paid` 对账快照，一次提交；语义见 §14.13 |


**通用原子性**：除 `initialize_game` 外，所有命令都是"工作副本 + 一次提交"。任一守卫或内部步骤失败 ⇒ 状态与调用前逐字段一致。

**通用幂等性**：命令不保证幂等；重复提交同一命令按新一次业务动作校验（例如重复 `deliver_work` 因项目已 settled 而失败）。

---

## 6. 错误码登记

| 码 | 含义 | 触发 | 可重试 | UI 处理 |
| --- | --- | --- | --- | --- |
| `INVALID_INPUT` | 请求形状或取值非法 | 字段缺失、越界、枚举非法 | 否（改输入） | 高亮出错字段 |
| `INVALID_STATE` | 传入状态自身不合法 | 不变式被破坏 | 否 | 提示"存档或状态异常"，不解锁继续 |
| `INVALID_PHASE` | 当前公司/项目状态不允许 | 事件未处理、公司关闭、项目非 producing | 否（先处理前置） | 指向应做的事 |
| `NOT_FOUND` | 引用的实体不存在 | id 打错或已被消费 | 否 | 刷新列表 |
| `MODE_NOT_ALLOWED` | 合作模式/玩法未开放或不适用 | 承制买电视服务、原创走承制 | 否 | 说明可用模式 |
| `INSUFFICIENT_FUNDS` | 现金不足 | 立项、签约或需即时付款的命令 | 否 | 显示缺口 |
| `CAPACITY_EXCEEDED` | 供应商产能不足 | 周承诺超容量 | 否 | 显示剩余产能 |
| `DEPENDENCY_UNMET` | 工作项未解锁 | 上游未达门槛 | 否 | 指向阻塞项 |
| `GATE_UNMET` | 门槛项未全部交付 | 提前交付被拒 | 否 | 列出缺口项 |
| `CRISIS_COMMITMENT_BLOCKED` | **已废弃占位码**；当前没有危机状态或危机期承诺白名单 | — | — | 不由现行命令产生，保留字符串只用于兼容诊断 |
| `COMPANY_ENDED` | 公司已结束 | 关闭后调非结清命令 | 否 | 只留结清与总结 |
| `SAVE_VERSION_UNSUPPORTED` | 存档版本不支持 | 读到 v1/v2/v3 或未来版本 | 否 | 提示新开，不覆盖原档 |
| `SAVE_CORRUPT` | 存档结构损坏 | JSON 非法、必填缺失、含派生字段 | 否 | 提示保留原档 |
| `NOT_IMPLEMENTED` | 契约已冻结、行为未实现 | M0 阶段的占位命令 | 是（换版本后） | 明确"尚未开放" |
| `INTERNAL_ERROR` | 内部异常 | 未预期 | 是（一次） | 记录上下文 |
| `STAGE_LOCKED` | **已废弃**，v4 不再产生 | — | — | 保留字符串占位，禁止复用 |

**产生层**：`SAVE_VERSION_UNSUPPORTED` 与 `SAVE_CORRUPT` 由**存储层**（前端存档读写，§8.2）产生；v4 核心在收到结构非法的状态时返回 `INVALID_INPUT`（缺字段/类型不符）或 `INVALID_STATE`（不变式被破坏），不代管存档版本判定。当前核心实际产出的码、各命令的错误码分布见 [DATA_DICTIONARY_V4.md](DATA_DICTIONARY_V4.md) §4/§6。

---

## 7. 危机期白名单

历史规则，已由 §14.7 覆盖；不得实现危机周推进、负现金欠付或危机救济窗口。本节历史白名单不再授权危机周推进、负现金欠付或额外救济窗口；当前资金预检失败语义以 §14.2、§14.7 为准。

| 动作 | 危机中 | 理由 |
| --- | --- | --- |
| `arrange_financing` | ✅ 允许 | 旧版命令，已不属于当前 v4 命令面（§14.6）；本行仅作历史记录 |
| `dismiss_staff` | ✅ 允许 | 减少承诺 |
| `abort_work` | ✅ 允许 | 减少承诺 |
| `set_work_plan` | ✅ 允许 | 不产生支出，只调优先级 |
| `assign_staff` | ✅ 允许 | 不产生支出 |
| `deliver_work` | ✅ 允许（若已达门槛） | 回款，不是新增承诺 |
| `advance_week` | ✅ 允许 | 走危机结算（只计固定成本、不生产） |
| `end_company` | ✅ 允许 | 放弃经营，不是新增承诺；结局记为 voluntary |
| `start_work` | ❌ 禁止 | 新增项目支出 |
| `sign_outsourcing` | ❌ 禁止 | 新增外包支出 |
| `hire_core` / `scout` / `hire_temporary` | ❌ 禁止 | 新增薪酬承诺 |
| `buy_tv_service` | ❌ 禁止 | 新增发行支出 |
| `create_custom_offer` | ❌ 禁止 | 维持 DEC-FIN-003 的危机承诺边界；草稿资金分段不改变该守卫 |
| `adopt_proposal` / `reject_proposal` | ❌ 禁止 | 采纳会引向立项支出 |
| `request_extension` | ❌ 禁止 | 新增延期费用 |
| `resolve_event(work_id,event_id,option_id)` | ✅ 允许既有 pending | 危机前已生成的事件仍可逐条处理；选项效果不得绕过危机白名单 |
| `finalize_delivery` / `finalize_company` | — 仅 closing | 关闭后才有意义 |

**事件边界**：危机期间不抽取新事件；既有 `events.pending[]` 不因进入危机而清空。临时员工没有通用提前解约命令，只有特定危机/裁减事件明确提供的选项才可提前解约；解约停止后续周薪，已发生的 signing_fee 与周薪不追溯退还，不新增买断费、欠款、递延费用或借贷机制。

**实现要求**：白名单在应用层统一判定，不得散落到各命令内部自行判断。`resolve_event` 只移除目标事件，不得清空其他项目事件。

---

## 8. 存档与版本拒绝策略

### 8.1 信封

```text
SaveRecord { version: 4, savedAt: ISO8601, rules_version: string, state: GameState }
```

- IndexedDB：库 `anime-production-committee`、schema 1、仓库 `saves`、键 `current`（沿用，不改库版本）。
- 单槽；覆盖需显式确认，读取-判断-写入在同一事务内完成。

### 8.2 版本矩阵

| 读到 | 行为 | 文案要点 |
| --- | --- | --- |
| `version=4` 且结构合法 | 正常加载，重算派生值 | — |
| `version=4` 但结构非法 / 含派生字段 | 拒绝，`SAVE_CORRUPT` | 保留原档，提示损坏 |
| `version=1/2/3` | 拒绝，`SAVE_VERSION_UNSUPPORTED` | "旧版存档不兼容多项目 v4，请新开游戏；原存档未被覆盖。" |
| 未知更高版本 | 拒绝，`SAVE_VERSION_UNSUPPORTED` | 提示客户端过旧 |
| 无存档 | 返回 null，不报错 | — |

### 8.3 硬性规则

1. **不做任何迁移**：v1–v3 一律拒绝，不转换、不修复、不删除。
2. **失败不破坏**：任何读取失败都不得覆盖或删除原记录，不得改动当前会话。
3. `rules_version` 不一致：**允许加载**并标记"规则已更新，数值可能与存档时不同"，不拒绝（避免每次调参废档）。
4. 存档不含派生值；加载后由核心重算 `risk`、`preview` 与读模型。
5. `savedAt` 只用于展示，不参与规则。
6. 必须完整保存并恢复 `events.pending[]`、员工 `signing_fee/weekly_salary/temporary_contract/assignment_work_id`、财务流水与随机状态；读取不推进周、不结算、不补字段。

---

## 9. 磨合契约测试（工作项粒度）

规则：非监督人员接手"他人已开工、自己未参与过"的工作项 → 该工作项本周产出一次性扣减；监督人员切换项目 → 团队级一次性损失；无产出不算参与。

**参考实现**：`scripts/check-handover-cases.mjs`（规则 oracle）
**用例**：`docs/fixtures/handover_cases.json`（12 条）

```text
PASS  HO-01  非监督人员接手他人已开工的工作项，应扣一次
PASS  HO-02  同一单集内接手尚未开始的工作项，不应扣（容器级判定的假阳性）
PASS  HO-03  员工回到自己参与过的工作项，不重复扣
PASS  HO-04  员工在本集做过别的工作项，但接手他人已开工的另一个工作项，应扣（容器级判定的假阴性）
PASS  HO-05  两人同周从零开始同一工作项，双方都不扣
PASS  HO-06  临时人员接手已开工工作项，与核心员工同规则
PASS  HO-07  监督人员切换项目，产生团队级一次性损失，且不重复计算个人项损失
PASS  HO-08  监督人员留在同一项目，不产生团队级损失
PASS  HO-09  经历数周未生产后恢复，继续做自己参与过的工作项，不扣
PASS  HO-10  工作项已完成，分配不到该工作项，不产生损失
PASS  HO-11  本周在该工作项上没有产出（产能被别处占满），不算参与，不扣
PASS  HO-12  监督人员切换项目但当周无产出，不产生团队级损失

磨合用例通过: 12 条全部符合期望
```

**用例有效性反证**：把 HO-02 的期望改成"应扣"，校验器立即报错：

```text
错误 HO-02 不符（同一单集内接手尚未开始的工作项，不应扣（容器级判定的假阳性））: item_loss 期望 true 实际 false
磨合用例失败: 1 条不符 / 共 12 条
```

**交接给 M1 的要求**：领域实现必须给出同一 12 条结论；若实现与用例冲突，以用例为准，除非先走 §13 改规则。

---

## 10. 蓝图契约

- 规范：[BLUEPRINT_SPEC.md](BLUEPRINT_SPEC.md)；样例：[blueprints/tv_standard.blueprint.json](blueprints/tv_standard.blueprint.json)。
- 校验：`npm run validate:blueprint`，检查结构、六阶段覆盖、门槛存在性、依赖可解析、无环、可达性、量级。

```text
蓝图: tv_standard (常规 TV 季番（12 集）)
规模: tv / 12 集

单集工作项: 14 个, 596 点 (5.96 人周)
公共制作项: 6 个, 325 点 (3.25 人周)
实例化后: 174 个工作项, 7477 点 (74.8 人周)
公共制作占总量: 4.3%
关键路径最重链: 574 点 (5.74 人周，单集内)

阶段分布:
  content_design              2 项    60 点
  storyboard_key_animation    3 项   198 点
  animation                   2 项   112 点
  art_visual                  2 项    82 点
  photography_editing         2 项    76 点
  sound_delivery              3 项    68 点

校验通过: 0 个错误, 0 个警告
```

**反证**（五类人为破坏全部被拒）：成环、删除门槛、悬空依赖、缺阶段、孤立项。

---

## 11. 校验执行记录

| 项 | 值 |
| --- | --- |
| 执行时间 | 2026-11-24 19:45（UTC+8） |
| 基线提交 | `9bee444` |
| `npm run validate:blueprint` | 通过，0 错误 0 警告；174 项 / 7477 点 |
| `npm run validate:handover` | 通过，12/12 |
| 破坏用例（蓝图 5 类 / 磨合 1 类） | 全部被拒绝，见 §9、§10 |

复现命令：

```bash
npm run validate:blueprint
npm run validate:handover
```

---

## 12. M0 完成判定

| 交付 | 状态 | 证据 |
| --- | --- | --- |
| 制作蓝图规范 | ✅ | `docs/BLUEPRINT_SPEC.md` |
| 蓝图样例（12 集 / 174 项） | ✅ | `docs/blueprints/tv_standard.blueprint.json` |
| 蓝图校验器 + 运行记录 | ✅ | `scripts/validate-blueprint.mjs`、§10 |
| 工作项级磨合用例 + 运行记录 | ✅ | `docs/fixtures/handover_cases.json`、§9 |
| 状态契约与不变式（29 条） | ✅ | §3、§4 |
| 命令表（23 个） | ✅ | §5 |
| 错误码（16 个，2 个废弃） | ✅ | §6 |
| 危机期白名单 | 历史保留 | §7；当前不授权任何危机命令 |
| 存档版本拒绝策略 | ✅ | §8 |
| 实现代码 | ⛔ 不在 M0 范围 | M1 起 |

**M0 冻结后，M1 可以开始**：M1 的目标是“能跑一周”，实现 v4 状态骨架、校验、核心规则内核、坐标式随机与最小周结算。状态结构从第一天采用多项目形状（`works[]`）；M1 只用单项目纵向切片验证一周，不得实现成单项目架构。单项目从立项到交付的完整链路属于 M2。阶段出口标准见 [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)。M1 不得为了实现便利擅自改动 §4 的 29 条不变式与 §5 的 23 个命令语义；如发现缺陷、遗漏或必须调整的契约，仍可按 §13 的变更分级与审批流程修补，不得绕过流程直接改变。

---

## 13. 变更与持续修补流程

本节管理冻结基线之后的契约演进。冻结的目的是让团队有稳定参照，不是把 M0/M1 变成只能推倒重来的历史包袱。

### 13.1 变更分级

| 级别 | 典型情况 | 要求 |
| --- | --- | --- |
| A. 内部修补 | 缺陷修复、实现遗漏、内部函数/文件调整；不改变外部可观察行为、契约或存档语义 | 可按普通缺陷 PR 增量修复；补充针对性测试，不需要重新冻结 M0 |
| B. 兼容扩展 | 新增可选字段、扩展读模型/接口、增加能力；旧调用方和既有合法存档仍按原语义工作 | 说明默认/缺省语义、兼容边界和回归范围；更新契约文档与测试 |
| C. 契约修订 | 改变既有字段含义/可空性、不变式、命令签名/守卫、错误码语义、结算顺序或失败行为 | 必须提交变更说明并由负责人裁决；更新所有依赖方与回归测试 |
| D. 破坏性迁移/架构重构 | 既有数据或调用方不再兼容、替换模块边界/状态所有权、重写已有阶段成果 | 先提交独立方案并获负责人明确批准；必须给出迁移/拒绝策略、回滚或隔离方案、完整回归证据 |

### 13.2 变更说明

B–D 级变更，以及任何可能影响已确认玩法的 A 级修复，PR/Issue 至少说明：

1. 要解决的具体缺陷、遗漏或需求，以及可复现证据；
2. 现有实现/契约为什么不足；评估过哪些更小的修补方式；
3. 修改范围、受影响模块、接口、状态字段、存档、UI、内容资产和下游任务；
4. 是否向后兼容；如不兼容，提供迁移、拒绝旧数据或版本升级策略；
5. 需要新增/调整的测试、回归范围和验收标准；
6. 是否改变已确认决策；若是，明确标记为“决策变更”，由负责人裁决。

### 13.3 实施约束

- 默认选择**最小充分改动**：修复问题所需的最小文件和模块范围，不顺手重写无关代码。
- 先检查当前 main、相关实现、契约和测试；不得基于过期本地副本或历史讨论直接改造。
- 先复用现有模块和接口；只有证据表明现有边界无法承载需求时，才提出拆分、替换或重构。
- 内部重构不得悄悄改变对外行为；若行为变化，按 C 级处理。
- 不得以“架构更优雅”“代码更清晰”“进入新里程碑”为单独理由推翻已有实现。
- 跨模块改动要同步更新权威契约、调用方、测试和相关文档；不得只改代码或只改文档。
- 不得借修补之名扩大范围、改变无关接口或夹带依赖升级/格式化全仓等无关操作。

### 13.4 审批与验收

- A 级由模块负责人按普通 PR 流程评审；涉及共享契约或跨模块行为时升级为 B/C 级。
- B 级由相关模块负责人评审；触及已确认玩法、共享状态或跨领域事务时由负责人确认。
- C 级必须由负责人明确批准后实施；D 级必须先批准独立重构方案，再开实施 PR。
- 所有级别均需提供与改动相称的测试；涉及状态、命令、财务、随机性或原子性时，必须覆盖正常路径、边界/错误路径和失败后状态不变性。
- 阶段出口已通过的能力若被后续修改影响，必须补跑受影响的出口验收；不能仅凭旧阶段曾通过而继续宣称有效。

### 13.5 不需要重新冻结 M0 的事项

纯文案、内容新增、数值标定、内部函数拆分，以及不改变既有契约的实现修复，不需要重新召开 M0 冻结；仍须遵守普通 PR、测试和文档要求。读模型字段扩展通常属于 B 级，不得因其“不在 GameState”而忽略对 UI/调用方的兼容影响。

---

## 附记：与 v3 的关系（历史参照）

v3 的单项目、五阶段、全局 phase、单事件槽、双份财务汇总全部废止（见架构 §19.2 C1–C13）。v3 代码与文档保留为历史与迁移参照，**不得**作为 v4 的实现起点。

本文件不宣称 v3 行为正确，也不为其提供兼容层。

---

## 14. 2026-11-25 规则补充修订（不改变 v4 根版本）

本节是对冻结基线的正式增补。玩法权威来源为 [DECISION_LOG.md](DECISION_LOG.md)；本节将其已确认语义落实到 v4 工程契约。若本节与旧表格冲突，以本节修订后的语义为准。

### 14.1 事件状态与仲裁（覆盖旧 INV-23）

- `EventState.pending` 是待处理事件数组，不是全局单槽。
- 每条待处理事件必须包含项目标识 `work_id`，并指向仍有效的项目。
- 每个项目每周最多触发一个事件；多个项目可以在同一周分别触发事件。
- 未处理事件必须留在数组中；新事件不得覆盖、丢弃或自动合并旧事件。
- 玩家可以按任意顺序查看和处理待处理事件；不要求全局 FIFO。
- 每条事件具有独立的 `viewed` 状态，初始为 false。玩家打开事件详情时，必须原子地将目标事件标记为已查看；该动作不应用事件选项、不扣款、不改变事件效果，也不移除 pending。
- **推进守卫只检查是否存在未查看事件**：只要有任意 pending 事件的 `viewed=false`，禁止 `advance_week()`；所有 pending 均已查看后，即使仍未选择，仍允许推进。
- 已查看未选择的事件继续留在 pending；玩家可随后选择选项，或明确放弃处理。放弃处理不等于结算，不移除 pending，也不暂停其期限倒计时。
- 处理命令为 `resolve_event(work_id, event_id, option_id)`，成功后只移除目标事件，其他项目事件原样保留。放弃处理是独立的显式动作，不得伪装成 resolve_event 的有效选项，除非该事件内容明确配置了对应选项。
- 未查看事件阻塞玩家推进，因此其期限不会在玩家未查看时通过正常周推进而超时；已查看未处理事件可随周推进倒计时，并在阶段 7 到期时执行默认分支或升级。
- 本次规则不再存在可持续推进的资金危机周；若周结算预检失败，按 §14.7 直接破产。
- 校验器必须覆盖：同周多个项目各一事件合法、同一项目同周第二事件非法、查看一条只更新该事件 viewed、查看不等于处理、已查看未处理事件允许推进、任一未查看事件阻止推进、处理一条不清除其他项目事件、已查看事件超时不影响其他项目 pending。

### 14.2 资金预检失败与破产语义（覆盖旧危机规则）

- 周结算刚性支出预检失败时，整周结算回滚至计划冻结快照，不发生部分扣款或制作推进，并直接触发破产终局。
- 不允许以负现金欠付、危机周推进或额外救济窗口延续经营；旧版限时危机结算流程不再是目标行为。
- advance_week 的八阶段顺序、预检支出范围、回滚边界与延迟状态时序以 DEC-TIME-003 及 DECISION_LOG 第 18 节为准。
- 既有 INV-25 和危机期命令白名单中涉及 solvency.state="crisis" 的字段/守卫必须按本次 C 级契约修订同步调整，不得继续据此实现旧危机周推进。

### 14.3 版本与实现状态

本次修订不把文档契约等同于已实现功能。M1 已将 v4 runtime 基础切片合入 main；事件完整闭环、跨项目事件数组校验、原创草稿/正式开工分段、`signing_fee + weekly_salary` 员工账务及 v4 完整存档恢复仍须按 M2/工程契约任务实现并验收。不得继续以旧版“全局单事件槽”或 `project_fee` 作为目标行为。

### 14.4 核心员工招聘即时入职时序（DEC-PLAY-003 补充）

- `hire_core(staff_id)` 成功后，候选人立即从招聘池转入核心员工名册，招聘签约与入职在同一次命令提交中完成。
- 新员工从签约确认时起即可参与当周人员分配；不设置“待入职”状态，也不等待下一周才开放分配。
- 签约费在签约确认时立即入账；首周周薪从签约后当前经营周的下一次周结算起计提。若本周结算已经完成，则自然从下一周结算起计薪；不追溯已经完成的结算。
- 本补充只明确既有命令的生效时点，不新增状态字段、不改变存档根结构与版本，也不改变 `hire_core` 的资金、公司状态和正常经营守卫。

### 14.5 DISC-01 后续玩法的工程契约边界（2026-11-25）

以下规则方向已进入 DECISION_LOG，但不属于当前 M0 冻结命令表/字段表已完整表达的能力。它们必须在 M2 数据契约审查（Issue #53）中补齐状态形状、命令签名、错误码、资金流水、失败原子性和测试，不得由实现者各自猜测字段或接口：

- **Q2 外派**：需要显式区分员工本社项目、外派、待命三种互斥周归属，并定义外派周结算的现金、工作类型经验、疲劳及红灯守卫。
- **Q3 Scout**：需要表达每周使用次数限制、候选人限时签约窗口和招聘池部分轮换；Scout 每周最多一次。
- **Q4 定金锁定**：需要锁定/到期/消费状态、同一企划终身仅锁定一次的历史记录、定金支付与正式接单抵扣的财务语义；定金比例与计算基数已由 DECISION_LOG 冻结为普通企划 5%、IP 上门企划 10%，统一按企划生成时固定的基础立项费用计算。
- **Q10 整集协力打包**：需要应用层批量预检与全有或全无的事务边界；不得把多次独立签约伪装成原子批量操作。
- **Q11 计划预览**：预览是非持久化派生读模型；周内修改只更新计划态。既有 HO-03 等磨合契约用例应覆盖“离开后重新接手曾参与工作项不重复扣损”，并补齐监督减免上限 50% 的边界用例。

本节是待补工程契约清单，不代表上述命令、字段或 UI 已实现，也不擅自冻结其具体 API 名称。实现前须由 #53 收敛契约并回填本文件。Q3/Q4 的字段契约已依 #53 裁决回填至 §14.13；Q2/Q10/Q11 仍待补。

### 14.6 2026-11-25 契约收敛（字段、命令与危机白名单）

- **原创两级准入（DEC-PLAN-001）**：`create_custom_offer` 只创建草稿并检查基础声望等草稿资格，不检查全部投资资金；`start_work` 才正式建立项目并检查全部应付款。普通企划继续按 `min_reputation/required_works` 准入，不再合并为笼统的“声望与成绩达标”。草稿开发费金额与扣费时点仍待确认，不得提前收取全部投资额。
- **员工报酬字段**：`project_fee` 的旧语义由 `signing_fee + weekly_salary` 取代。核心与临时员工均保留一次性签约费和周薪；临时员工的费用与归属明确指向合同项目。该变更是 v4 目标契约，不宣称现行 v3 代码或存档已经支持，也不为 v3 增加迁移层。
- **核心解雇**：`dismiss_staff` 可在正常经营期间执行，不要求公司空闲或现金，不设预付遣散费；但不得因解雇使 producing 项目失去唯一监督。解雇后公司至少保留 1 名核心员工。29 条不变式中新增监督唯一性、休养回归与事件超时约束，最低保有量仍由 Staff 约束与命令守卫共同落实。
- **临时合同提前解约**：临时员工只有特定裁减/解约事件明确提供选项时才可提前解约；停止后续周薪，已发生费用不退，不新增通用买断、欠款、递延费用或借贷机制。该规则不再依赖资金危机状态。
- **待确认参数**：基础声望阈值、原创草稿开发费金额/扣费时点、`signing_fee/weekly_salary` 具体数值仍待标定；本次只冻结字段、资格分段、命令守卫与费用归属，不冻结数值。


> 资金预检失败语义以新增 14.7 为准；旧 14.2 的危机周推进描述已被覆盖。

### 14.7 2026-11-25 单周结算原子流水线（覆盖旧正常/危机结算）

- advance_week 统一采用八阶段：计划冻结与快照 → 刚性支出预检 → 刚性支出扣款 → 项目生产推进/阶段切换 → 人员经验疲劳/红灯判定 → 商业窗口与交付收入 → 延迟状态倒计时/到期 → 随机事件与周数递增。
- 刚性支出包含核心员工周薪、临时员工周薪、基础房租、设施维护费、生效中的制作/外包固定周费及到期承诺付款；阶段 6 的收入不得计入阶段 2 预检。
- 若阶段 2 现金不足，阶段 3–8 全部跳过，状态回滚至阶段 1 快照，现金不发生部分扣款，项目/人员/延迟状态/事件/周数均不变化，并直接触发破产终局。
- 不设置额外危机拯救窗口；旧版危机 7 步、负现金欠付、危机周推进和相关命令白名单均由本条覆盖。相关字段、守卫、错误码与终局处理属于 C 级契约修订，必须同步实现和测试。第 7 节危机期白名单仅作历史记录，不再作为命令授权依据。
- 延迟状态统一按“第 W 周触发即占当周计数，每周末阶段 7 减 1，归零后下一周开局生效”。设施建设期不计维护费，启用周阶段 2 起计费；红灯触发周照常工作和计薪，下一周开始休养，满期后再下一周恢复；企划定金/机会有效 M 周覆盖 W 至 W+M-1，最后有效周末未确认则失效且定金不退。
- 周内计划态允许反复撤销、覆盖和调整，推进时使用推进前最后一次确认的计划快照；计划态变更不提前产生实际效果。
- 所有即时操作均须整条命令原子提交；任何校验或执行失败都必须回滚该命令全部状态变化，不得留下部分扣款、名额占用、合同或人员状态。
- 只读预演接口至少返回刚性周支出、岗位硬资格、预计疲劳变化区间、预计完工周数；不得剧透随机波动实际结果或未触发事件。

### 14.8 监督统筹兼任与工作项多人协作（DEC-STAFF-008）

- 每个 producing 项目必须恰有一名监督；监督任职资格只在任职/分配时校验，任职后不因员工状态或属性波动被动撤销。
- 主动解雇、调离或外派监督必须先指定具备监督硬资格的替补执行原子 Swap/Replace；替补仅限同项目员工或公司空闲员工，禁止从其他项目强行抽调。无合格替补时原监督关键岗位锁定至项目完结/中止。
- 被动离岗时，系统按“同项目合格员工优先、公司空闲合格员工其次”选择能力最高者临时代理；并列时按稳定员工 ID 顺序。代理触发交接/效率修正。无替补时项目进入监督缺位停工状态，本周不推进该项目制作进度。
- assign_staff、dismiss_staff、外派及监督替换等人员命令必须保证提交后的所有 producing 项目均满足 INV-27；监督替换不得出现中间可观察的无监督状态。
- 监督统筹占用固定比例的本周精力；剩余精力可参与本项目中职业适配的普通工作项。监督岗位不改变 Staff.role，也不改变普通工作项资格。
- 工作项允许多名主责共同承担，不设人数上限；具备主责硬资格者均计为主责。协力是具备协力资格但不具备主责资格的参与者，贡献进度并按工作项基准线拉近/稳定质量下限，但不得突破主责团队决定的质量上限。
- 不适配员工不计入该工作项正常产能与质量贡献。
- 监督统筹占比与剩余精力产能折算、多主责质量聚合、协力质量下限贡献、主责质量上限、代理交接损失及代理效率修正均为待标定参数。本节冻结资格和结果边界，不冻结公式。



### 14.9 核心编制、设施扩建与办公场地扩容时序（DEC-COMPANY-003 / #63 2026-11-27 归档）

- 开局正式编制上限为 4 人；`core_staff_capacity` 只统计核心员工，不包含项目临时员工。
- 核心编制由设施扩建等级派生，取代旧“公司成长里程碑独立解锁编制”规则；后续扩建完全自愿，不是所有经营路线的必经门槛。
- 完成第一个作品后暂定赠送第一级设施升级，正式编制上限提升至 8 人；精确触发时点与异常路径尚未冻结。后续阶梯为 8 → 12 → 16 → 20 → 24 → 30 人。
- 8 人核心团队加项目临时员工应足以支撑高质量路线；玩家可长期停留在 8 人，继续扩建主要服务更大规模、更多项目并行的路线。
- 设施升级费用、每周固定维护费与弹性工位数值尚未冻结；当前运行时仅实现开局 4 人守卫。
- 办公场地扩容允许跨级，不以声望作为硬性门槛；玩家满足目标规模的资金与槽位条件即可直接扩至目标规模，不要求逐级经过中间规模。
- 办公场地扩容确认时即时扣除一次性搬迁费并立即开放目标规模槽位；新增基础房租增量从确认后的下一次 `advance_week` 周结算起计提，不追溯确认当周。

### 14.10 红灯强制休养期间的归属与回归（DEC-STAFF-009）

- 员工进入 `forced_rest` 期间挂起保留原项目归属与岗位占位；玩家仍可在周内主动将其调走。
- 强制休养期间员工不参与制作、不贡献产能；原归属/岗位占位仅用于恢复定位，不视为有效出勤。
- 休养计时满期后，于次周开局自动回归原岗位并恢复工作，不重新计算入组磨合损失。
- 若休养期间原监督位已由代理/替补接任，原监督回归后自动转为该项目普通/协力参与位，不得强行顶替现任监督。

### 14.11 限时事件超时与升级（DEC-EVENT-002）

- 限时事件触发当周计入有效期；每周末阶段 7 统一倒计时减 1 周。
- 未查看事件阻塞周推进，不会在玩家完全未查看的状态下随正常推进超时；玩家查看后，即使未作选择或明确放弃处理，仍可推进周数并继续倒计时。
- 到期仍未处理时，在阶段 7 末尾自动执行事件预设的默认消极/保守分支，并移出 `events.pending[]`。
- 高权重关键事件可配置一次超时升级；升级沿用同一事件身份替换原 pending 条目，升级事件再次超时才触发预设硬性违约惩罚。最多升级一次，不得循环延期。
- 超时处理按事件身份执行，不得覆盖或清除其他项目 pending；超时自动处理不需要玩家确认。
- 首次超时升级一次并执行轻罚；升级后的处理期限固定为2周。升级事件二次超时自动执行其预设强制处理/硬罚并移除 pending。最多升级一次，不循环延期；不采用双倍处罚或运行时自行推导的固定倍数，硬罚数值由事件预设效果提供。

### 14.12 事件查看命令的工程登记（#50 落地增补）

- 命令 22 `view_event(work_id, event_id)` 承载 §14.1"查看与处理分离"的查看动作：`work_id`、`event_id` 均为必填字符串，缺失或类型不符返回 `INVALID_INPUT`；pending 中无匹配项返回 `NOT_FOUND`；公司非 `running` 返回 `COMPANY_ENDED`。
- 查看只把命中条目的 `viewed` 置为 `true`：不应用选项效果、不扣款、不记账、不写冷却、不改周数、不移除 pending；重复查看按幂等成功返回，回执 `{state, viewed, already_viewed}`。
- 命令 17（`advance_week`）的推进守卫只统计 `viewed=false` 的条目，`INVALID_PHASE` 消息给出未查看条数；已查看未处理事件原样保留在 `events.pending[]` 并可随周推进继续存在。
- `events.pending[]` 每条必须带 `work_id/event_id/triggered_week/viewed`（INV-23）。`viewed` 缺失按非法输入拒绝，不静默当作未查看，避免旧形状存档被默认值放行推进。
- 同一事件选项的 `cost` 与 `funds` 效果在同周产生多条流水时，账本条目 id 必须互不相同（INV-02）；事件强制支出以当前余额封顶，不得让现金转负。
- 本条登记已实现语义：内容卡 `expires_weeks` 允许 0..8；非 0 卡必须为负面事件并带 `abandon`，运行时以该冻结快照作为默认消极/保守分支。触发周计入期限，`expires_week = triggered_week + expires_weeks - 1`；仅已查看事件在阶段 7 到期处理，自动支出按当前现金封顶，只移除目标 `(work_id,event_id)`。§14.11 的升级规则已由 DEC-EVENT-003 冻结：首次超时执行轻罚并升级一次，沿用原事件身份替换 pending，标记已升级，升级后期限固定2周；二次超时自动执行升级事件预设的强制处理/硬罚并移除 pending，不采用双倍处罚。内容字段与 PendingEvent 快照已按 #13/#53/#49 对齐并落地：`timeout_option_id` / `escalated` / `escalation` 三字段随 pending 持久化，旧存档缺字段按「无升级」处理；合法升级配置在加载期放行，非法配置整卡拒绝。运行时语义与对账见 `docs/EVENT_ESCALATION.md`。

### 14.13 Q3 招聘池与 Q4 定金锁定的字段契约（2026-11-25，依 #53 裁决）

本节把 DECISION_LOG §17 Q3/Q4 已确认语义落成 v4 字段与命令契约。DEC-MARKET-001 确认企划市场固定 4 槽、初始生成 4 个、每周只补空槽、至少 2 个企划可立即承接；招聘市场另有固定 4 个候选人展示槽，两套槽位独立。Scout 每周至多一次、锁定两周、同一企划终身仅锁定一次、到期定金不退、正式签约 100% 抵扣均为已确认规则；定金比例与计算基数已冻结：普通企划 5%、IP 上门企划 10%，统一按企划生成时固定的基础立项费用计算。候选供给权重、轮换/补位参数、冷却重现概率与保底阈值等仍为 `[PLACEHOLDER]`，由 #59/#58/M7 标定。运行时已实现边界以 DATA_DICTIONARY §3.12 与契约形状审计为准；本节不授权未冻结字段或未实现命令，也不授权 `solvency.state="crisis"`、危机周推进或融资命令。

> **2026-11-27 规则收口：** #59 评论 7207555137 已撤销“3 个企划槽＋1 个短期外援槽”；DEC-MARKET-001 同时取代企划市场 cap10 与每周固定补 2 个的旧提案。IP 上门企划占企划槽，自定企划走独立入口；临时员工不进入招聘候选池。

#### 14.13.1 Recruitment 聚合（Staff 域唯一持有）

```text
Recruitment {
  pool: PoolCandidate[]
  pity: { since_sr: uint, since_ssr: uint }   // 保底计数语义与阈值 [PLACEHOLDER]
  last_scout_week: uint | null                // null = 从未 scout
}

PoolCandidate {
  staff: Staff                  // 完整候选人实体，字段与名册 Staff 相同
  expires_week: uint | null     // 首个不可签约周；regular 候选为 null，scout 候选必填
  origin: "regular" | "scout"
}
```

- `recruitment` 挂在 GameState 根（§2），与 `staff` 名册分离：池中候选人**不是**公司员工，不参与周结算、不计薪、不计入 INV-09/10/11 的名册约束。
- `hire_core(staff_id)` / `hire_temporary` 命中池中候选时，把 `PoolCandidate.staff` 解包转入名册；`expires_week/origin` 是池包装字段，**不得**残留在名册 Staff 上。员工报酬统一使用 `signing_fee + weekly_salary`，不再使用 `project_fee`；签约费只通过 Finance 流水入账。
- 签约窗口：`expires_week` 是首个不可签约周；进入该周开局时候选失效并移除，到期不产生费用、不退款、不惩罚。窗口周数 `[PLACEHOLDER]`（讨论范围 1–2 周）。
- 常规池**部分轮换**：周结算固定步骤只替换部分候选，不整池清空重生成；轮换比例 `[PLACEHOLDER]`。scout 候选不参与常规轮换，只按各自窗口到期。
- 招聘市场固定 4 个候选人展示槽，四槽全部属于 Recruitment；通用随机简历招聘后成为正式核心员工，正常占编制并参与长期成长。展示窗口暂按 2 周，到期回自由人才池并进入冷却，冷却后可同身份重现。当前运行时尚未实现展示槽身份、自由池、冷却及 Tier 生成衔接，现有 regular/scout 池不得冒充该完整生命周期。
- Scout 每周至多一次：以 `last_scout_week ≠ company.week` 判定，不引入额外计数器字段；`last_scout_week` 只由 `scout` 命令写入。
- 随机坐标（沿用坐标式随机，无计数器入档）：候选生成 `draw(seed, week, "staff/recruit", purpose, index)`；常规轮换 `"staff/recruit_regular"`；保底抽取结果由 pity 计数参与 purpose/index 派生，具体映射由实现提出并经测试固定。

> **2026-11-27 实现边界与待裁决冲突：** 命令 8 `hire_temporary`、INV-10、三字段临时合同、签约费与周薪已经实现，但当前生成器只产生 core 候选。本节要求 `hire_temporary` 从 `recruitment.pool` 解包候选，而同节及 DEC-MARKET-001 又规定项目临时员工不进入招聘候选池；这两条尚无独立临时供给契约。正常临时招聘来源保持阻塞，不得为通过测试而把临时候选塞入招聘池。命令实现与输入夹具只证明合同/归属/计薪链路，不证明正常来源已开放。

#### 14.13.2 Offer 生命周期字段（Market 域）

`Offer`（市场槽/自定槽/提案槽中的企划）在既有字段外新增：

| 字段 | 类型 | 语义 |
| --- | --- | --- |
| `expires_week` | uint | 自然失效周；到达该周开局后槽位释放，企划 id 进入历史 |
| `locked_until` | uint \| null | 锁定失效周；`lock_offer` 成功时 = week+2。第 W 周锁定覆盖 W 与 W+1，W+2 周开局失效 |
| `lock_used` | bool | 该企划 id 是否已用过定金锁定；**终身一次**，置 true 后永不复位 |
| `deposit_paid` | uint | 已付定金快照，用于正式接单时 100% 抵扣展示与对账 |
| `offer_source_type` / `deposit_basis` | source classification / uint | 保留企划来源分类及企划生成时固定的基础立项费用；普通企划按 5%、IP 上门企划按 10% 计算定金，后续预算调整不得改变基数 |

- **定金档位与基数**：普通企划按 `deposit_basis × 5%`，IP 上门企划按 `deposit_basis × 10%`；`offer_source_type` 与 `deposit_basis` 必须随 Offer 快照保存，来源类型决定档位，不允许玩家自行选择或切换。
- **现金权威唯一**：定金的实际扣款、签约抵扣只发生在 `Finance.entries` 流水；`deposit_paid` 是企划侧快照/对账字段，不得作为第二本账。`lock_used=true` 必须唯一对应规范流水 `w{week}.production.{offer_id}.deposit`，其周、项目归因、类目、金额、交易对手和备注须与快照一致；缺失、重复或篡改均判 `INVALID_STATE`。INV-16/17 照常约束。
- 签约抵扣：锁定期内 `start_work` 该市场槽企划时，定金 100% 抵扣对应立项保证金或前期费用（经济语义等同返还预付款，但不是额外成本）；现金守卫按“全部应付款 − 已对账定金”计算，已对账定金从规范 Finance 流水推导，不直接信任 `deposit_paid` 快照。Finance 保留 `investment_paid`（若委员会）与 `contract_received`（合同预算）两笔账，定金已付部分从对应本次现金金额中抵扣，不得把定金再次计为支出，也不新增重复退款/收入流水。
- 锁定保护：锁定期间（`week < locked_until`）该企划不受市场补充与自然过期影响（STATUS-49/51）；`expires_week` 的自然过期在锁定期内不生效。
- 到期语义：第 W 周锁定后的最后有效周为 W+1；该周周末阶段 7 结束时进入 `locked_until`（W+2），未接单企划锁定自动失效、释放市场槽位、定金不退；`lock_used` 保持 true，不允许续锁，W+2 开局不再可见。
- 临期提示：`locked_until − week == 1` 表示进入最后一周；周回执与市场槽位提示剩余时间及到期损失，不新增持久化字段。
- **终身一次不可绕过**：同一企划 id 的 `lock_used` 历史必须可校验；规范 Finance 定金流水是追加式历史，删除槽位后重新插入同 id 或重置生命周期字段均不得绕过。历史识别同时检查定金 ID 标记与 `production/counterparty/memo` 语义，单独改写流水 ID 不得绕过；不得通过“删除企划再重新生成同 id”或槽位刷新洗掉锁定历史（并入 INV-24）。
- 互斥约束：同一企划同一时刻至多处于一个槽（市场/自定/提案）；已签约、已过期和已锁定状态互斥，锁定状态不改变槽位归属。
- 随机坐标：企划生成 `draw(seed, week, "market/offer_gen", purpose, index)`；市场热度 `"market/heat"`。

#### 14.13.3 校验器必须覆盖

1. scout 同周第二次 ⇒ 拒绝；跨周可再次 scout。
2. scout 候选到达 `expires_week` 后被移除；regular 候选不受窗口影响。
3. 部分轮换后池内未轮换候选逐字段不变。
4. 池中候选人不出现在名册约束里；hire 后包装字段不残留，签约费只出现于 Finance。
5. `lock_offer` 对 `lock_used=true` 或 Finance 已有该 id 定金流水的企划 ⇒ 拒绝，即使企划曾离开市场后回归。
6. 第 W 周锁定后 W/W+1 有效、W+2 开局失效；`start_work` 对自然到期或锁定到期的市场槽返回 `NOT_FOUND`；最后一周提示可由 `locked_until − week == 1` 派生。
7. 定金锁定与签约抵扣后 `balance = opening + Σentries` 仍成立；`deposit_paid/locked_until` 必须与唯一规范定金流水对账，抵扣额从流水推导，定金不被计两次支出。
8. 锁定到期未接单：定金不退、无自动退款流水，`lock_used` 仍为 true。
9. 当前状态 `loans=[]`、`solvency.state="normal"`；非空 loans、`solvency.state="crisis"` 均被拒绝。`running` 状态负余额被拒绝；`bankrupt` 的 `closing/ended` 允许负余额，任何命令不得借此绕过现金预检或破产规则。
10. 企划市场固定4个槽位，开局4个；每周只补空槽，最多补至4。未过期企划保留，锁定企划继续占用原槽；企划过期或锁定释放后补充。至少2个企划可立即承接。IP上门企划占普通企划槽，自定企划独立入口不占市场槽。人才市场另有固定4个招聘候选人槽位，二者独立。企划 id 终身唯一，市场/自定/提案槽不得重复。

### 14.14 项目中止（DEC-PROJECT-001 / DEC-REP-001）

- `abort_work(work_id)` 是唯一中止入口；项目必须处于 `producing`、公司必须 `running`、不得晚于 `deadline_week`，且本项目不得有 pending 事件。失败时状态、账本、归属与 Archive 均不变。
- 完成进度由项目全部权威工作项的 `Σwork_done / Σwork_total` 计算，不接受 UI 或调用方传入。承制项目进度 ≤50% 时收取合同制作费 15% 违约金；进度 >50% 时按 `contract_budget × (Σwork_total − Σwork_done) / Σwork_total` 退款，不再收 15% 违约金。当前整数除法向下截断，最终整数化仍由 #60 标定。
- 委员会项目不收取中止违约金、不退款；已支付投资本金与已发生成本沉没。退款使用 `contract_refund` 账本类目，违约金使用 `penalty`。
- 中止统一保留 `WorkRecord`：`end_reason="aborted"`、`status="ABORTED"`、`aborted_week=end_week`、`penalty_paid=finance_summary.penalty`；aborted 作品不进入 `Archive.series`。
- 中止声望按变更前声望档位执行顶格重罚：标准 TV 基准 −35,000；`<600` 为 10%，`600–9,999` 为 70%，`10,000–59,999` 为 140%，`≥60,000` 为 220%；作品规模系数 short=350、ova=650、tv=1000、movie=1600。
- 中止后临时员工解绑退出，核心员工只解绑；该项目外包合同移除并释放供应商产能，已发生费用不退。
- 中止结算后现金 <0 时不封顶、不豁免，先按稳定顺序对其他项目 pending 执行默认保守分支，再复用 M2.5 破产关闭路径；不为中止新建独立破产分支。

---

## 15. 与 v3 的关系（历史参照）

v3 的单项目、五阶段、全局 phase、单事件槽、双份财务汇总全部废止（见架构 §19.2 C1–C13）。v3 代码与文档保留为历史与迁移参照，**不得**作为 v4 的实现起点。

本文件不宣称 v3 行为正确，也不为其提供兼容层。


### 14.14 2026-11-27 中止清算与商业分账规则补充

#### 14.14.1 abort_work 中止清算

- 中止声望处罚继续使用 DEC-REP-001 既有公式，不改为固定扣15点。
- 承制项目完成进度不超过50%：退还制作费，并按制作费基数收取15%违约金。
- 承制项目完成进度超过50%：只退还未完成进度对应比例的制作费，不再额外收取15%违约金。
- 委员会项目按已发生沉没成本核销，并按既有委员会清算规则关闭。
- 中止须在单一原子事务内完成项目状态变更、员工/临时员工解绑、合同及委员会清理、Finance与Archive记录。现金违约金不足时的行为、完整Archive字段和特殊商业机会清算仍待契约补齐；不得新增借贷或负现金通道。
- 本节冻结规则，不代表 abort_work 已实现。

#### 14.14.2 商业结算整数分配与前置成本

- 净商业池采用最大余数法：先按 floor(net_pool * share_bps / 10000) 分配底数，再按小数余数降序分配剩余整数；余数相同按 partner_id 字典序升序。总分配必须严格等于净商业池。
- 新增概念输入 fixed_prelaunch_cost（开播前固定宣发/母版等前置费用）与 channel_overhead_bps（通用渠道抽成，万分比）。
- 非BD渠道毛收入扣除适用前置商业成本与渠道费用后形成净商业池，再按投资比例分配；通用渠道抽成与逐渠道代理费不得重复计取同一费用。
- BD/DVD继续按 DEC-BD-001 独立处理，不重复扣作委员会前置成本。
- 具体字段、支付时点、Finance/Archive映射和完整对账仍待实现。

> **2026-11-27 实现边界：** 当前两份额净池已实现最大余数法，以 `company.id/committee_id` 字典序打破并列；公司所得再按非 BD 渠道净额权重与上限拆分，逐渠道不超过净额且合计精确回到公司份额，BD 所得独立保留。`fixed_prelaunch_cost` 与 `channel_overhead_bps` 的输入、支付和财务映射仍未实现，不得把整数分账实现表述为完整前置成本结算。

#### 14.14.3 企划市场槽位边界

- 企划市场固定4个企划槽位，开局生成4个；每周只补充空槽，最多补至4个。
- 未过期企划保留；已锁定企划继续占用原槽位；企划过期或锁定释放后补充空槽。
- 任一时点至少保证2个企划可立即承接。IP上门企划占普通企划槽；自定企划独立入口，不占市场槽。
- 人才市场另有固定4个候选人展示槽位，四槽全部属于招聘市场；项目临时员工不进入人才市场。
- 本规则取代企划市场旧10槽位/每周补充2个方案。企划市场与人才市场不得合并计数。



#### 14.16 2026-11-27 员工有效能力、产能倍率与质量闭环（DEC-STAFF-008）

**工作项能力映射与质量权重**

| 层级/阶段 | 工作项 | 主能力映射 | 核心审美工序 | 全片质量权重 |
|---|---|---|---|---:|
| 公共层（4,800点） | 系列构成 / 剧本规划 | `planning` | 是 | 公共层合计20% |
| 公共层（4,800点） | 分集构成 / 分镜 / 演出规划 | `direction` | 是 | 同上，不重复计权 |
| 公共层（4,800点） | 总设 / 角色设计 / 美术设定 | `drawing` | 是 | 同上，不重复计权 |
| 阶段1（200点） | 剧本 | `planning` | 是 | 阶段合计20% |
| 阶段1（200点） | 分镜 / 演出 | `direction` | 是 | 同上，不重复计权 |
| 阶段2（260+220点） | Layout / 一原 | `drawing` | 是 | 22% |
| 阶段3（650点） | 二原 / 中割动画 | `animation` | 否 | 10% |
| 阶段4（300点） | 背景美术 / 美术设定 | `drawing` | 是 | 13% |
| 阶段5（230点） | 上色 / 色彩指定 | `drawing` | 否 | 5% |
| 阶段6（120+120点） | 终审检查 / 作画检查（animation_check，120点） | `drawing` | 是 | 阶段合计10%中的核心审美工序 |
| 阶段6（120+120点） | 剪辑 / 音控 / 特效合成 / 配音 / 音乐 / OP·ED / 母版交付 | `postproduction` | 否 | 同上，不重复计权 |

**公共层聚合能力口径**：公共制作整体的有效能力仍按 `planning` 与 `direction` 各50%作为主能力组合，其余四维（`drawing`、`animation`、`management`、`postproduction`）作为辅助能力均值；使用既定整数公式，不改变 S_eff 数值口径。阶段内子工作项质量按各自 `work_total` 加权汇总，再进入对应阶段/公共层的全片质量权重。

全片质量权重合计100%。阶段6只有不可外包的终审试片音控120点属于核心审美工序；特效合成120点不享受核心审美奖励。

**能力与产能**

- 工序有效能力：S_eff = floor((85*S_primary + 15*avg(other5))/100)。计算 avg(other5) 时不得先截断平均值；等价整数形式为 floor((85*S_primary + 3*sum(other5))/100)。能力输入范围30–100，越界视为非法状态。
- 产能倍率采用整数千分比：30≤S_eff≤60时 cap_permille=650+floor((S_eff-30)*350/30)；60<S_eff≤100时 cap_permille=1000+floor((S_eff-60)*300/40)。周产能=70*cap_permille/1000点。锚点 S=30/60/100 分别为45.50/70/91点每周。
- 监督统筹固定占用监督员工本周50%可用执行产能；剩余50%可用于本项目职业适配的普通工作项，折算作用于该员工本周全部普通工作项执行产能。

**监督能力**

- 天然监督系（监督/演出）：S_sup=floor((70*direction+30*management)/100)。
- 转任系（作画/脚本）：S_sup=floor((50*direction+25*management+25*S_role_primary)/100)。
- S_role_primary 为该员工对应职业的主能力；不得用六项能力最高值代替 S_sup。监督任职资格仍按 DEC-STAFF-006 独立校验，能力公式不授予任职资格。

**质量计算闭环**

- Q_inhouse：工作项社内核心员工贡献按实际有效产出点数加权的质量均值。
- Q_cap=min(100,round_half_up(0.60*max(Q_inhouse,S_sup)+0.40*Q_inhouse+8))。监督修型和核心审美奖励均不得突破 Q_cap。
- Q_base：社内贡献使用对应工作项 S_eff，外包贡献使用 Supplier.quality，按全部实际有效完成点数加权平均；无有效产出的贡献者不参与计算。
- Q_sup=Q_base+0.35*max(0,S_sup-Q_base)。
- 删除旧 Q_floor。存在外部协力时，r_ext=外包实际有效完成点数/工作项实际有效完成总点数；Q_ext_min 为有实际有效交付的外部供应商中最低 Supplier.quality；Q_ext_cap=Q_ext_min+0.25*max(0,S_sup-Q_ext_min)+(1-r_ext)*12。Q_item=min(Q_sup,Q_cap,Q_ext_cap)。无外部协力时 Q_item=min(Q_sup,Q_cap)，不计算 Q_ext_cap。
- r_ext 按实际完成点数计算，不按合同金额、合同数量或计划外包量计算；无实际交付点数的供应商不参与 Q_ext_min。Q_ext_cap 是质量上限，不是下限。
- 核心审美工序奖励仅对映射表中标记“是”的工作项计算，且 S_sup>70、Q_item>70 同时成立：bonus_item=min(5,5*max(0,min(S_sup,Q_item)-70)/30)。阶段6仅不可外包的终审试片音控120点可获得奖励。
- 全片最终质量先按表中全片质量权重加权汇总各工作项 Q_item，再加核心审美工序 bonus_item 按其对应全片质量权重加权平均后的奖励；阶段6的10%权重中，仅5%（不可外包120/总240）计入核心审美奖励权重。全片最终质量范围为[0,105]，对接 quality_factor(105)=1040‰。

**定点数实现约束**

- 能力与监督能力采用百分之一分精度（1分=100存储单位）；质量与奖励采用千分之一分精度（1分=1000存储单位）；比例采用万分比（100%=10000）；产能倍率采用千分比。
- S_eff 等价整数计算：`floor((85*S_primary_centi+3*sum(other5_centi))/100)`；S_sup 两类映射在百分之一分精度下计算并向下取整；不得先截断五项平均值。
- 质量贡献加权均值：`floor(sum(output_points*quality_milli)/sum(output_points))`。监督修型：`Q_sup_milli=Q_base_milli+floor(35*max(0,S_sup_milli-Q_base_milli)/100)`，其中 `S_sup_milli=S_sup_centi*10`。
- 外包上限：`Q_ext_cap_milli=Q_ext_min_milli+floor(25*max(0,S_sup_milli-Q_ext_min_milli)/100)+floor((10000-r_ext_bp)*12000/10000)`；`r_ext_bp=floor(10000*external_points/total_points)`。
- 主责上限按整数分 half-up：`Q_cap_milli=min(100000,1000*floor((60*max(Q_inhouse_milli,S_sup_milli)+40*Q_inhouse_milli+50000)/100000)+8000)`。核心审美奖励：`bonus_milli=floor(5*max(0,min(S_sup_milli,Q_item_milli)-70000)/30)`。
- 全片基础分：`floor(sum(weight_pct*Q_item_milli)/100)`；核心审美奖励按核心审美权重加权平均后相加。所有中间乘法使用 int64，先乘后除，除法统一向下取整；只有 Q_cap 的整数分舍入使用上述 half-up。
- C++ Runtime 与 TS Oracle 必须统一精度、乘法顺序、除法顺序和边界处理。

以上为目标规则契约，不代表 Runtime、TS Oracle、全片质量结算或回归测试已经实现/验收。

### 14.15 2026-11-27 供应商、商业收入、特殊机会与设施契约补充

#### 14.15.1 供应商周产能与可靠性

- 供应商 `capacity_per_week` 是全平台 active 合同共享总池；`speed` 计算单合同基础上限：`max(1, floor(capacity_per_week * speed / 100))`。
- normal 模式速度/价格倍率均100%；emergency 模式速度135%、价格140%。签约时按 `weekly_cap=min(avail_cap, work_total, max(1, floor(base_contract_cap*mode_speed_mult/100)))` 计算并冻结；`avail_cap=capacity_per_week-sum(active.weekly_cap)`。
- 签约预检、预留与合同创建原子提交；active 合同预留总量不得超过供应商总池。跨项目按各自 weekly_cap 独立推进；同一工作项内合同争用 item_room 时按剩余需求比例分配并使用最大余数法。不设工序独立产能限制。
- 每周按 `(week, contract.id, "outsource_tick")` 生成确定性 roll。roll<reliability 正常交付；`r<=roll<1-0.2*(1-r)` 为当周0交付的常规延误；其余为质量返工，当周0交付并将 work_done 倒扣 `max(1,weekly_cap//4)`，结果不得低于0。
- 签约即付清；延误、返工、失败均无退款或额外扣款。每周先处理随机结果和 work_done，再检查完成；若 `week>=due_week` 且仍未完成，转 failed 并释放 weekly_cap。剩余缺口由玩家内部补齐或重新签约。

> **2026-11-27 实现边界：** 命令 9、INV-19/20、四供应商目录、签约预付、共享容量预留、周交付、延误/返工、终态与项目终止释放均已实现。外包与临时合同有效结束周统一为 `min(project.deadline_week,520)`，延期命令同步临时合同，不允许合同越过公司硬终局。供应商 `quality` 对 §14.16 中 `Q_base/Q_ext_cap/Q_item` 的质量贡献仍未实现；目录数值与经济平衡也未验收。

#### 14.15.2 六渠道收入模型与成本口径

- 六渠道统一使用 `ChannelGross=min(Cap_c, BasePool(type,scale)*w_c*TV_Mult_c*QualityFactor*RepFactor*HeatFactor*GenreWeight_c)`。渠道封顶以 `ChannelBase_c=BasePool*w_c` 为基准，`Cap_c=ChannelBase_c*CapMultiplier_c`。
- 标准12集TV制作费200M、BasePool 280M。类型倍率：OVA 0.90、短篇1.15、TV小/中/大1.35/1.40/1.45、剧场版1.60。
- 六渠道参数详见 DECISION_LOG §22.3；TV倍率只作用国内配信、玩具/周边、音乐、BD/DVD。OVA电视播出收入为0；剧场版不计算电视播出版权收入，改按独立票房收入结算，票房公式待标定。
- RepFactor T0 0.90至T7 1.25；HeatFactor 0.75–1.45；GenreWeight 0.80–1.30。具体曲线与题材矩阵待标定。
- fixed_prelaunch_cost 默认制作费10%，按类型×规模可固定覆盖；项目交付通过进入发行准备时一次性扣除，取消/中止不退。Finance现金扣款与净商业池成本扣除是同一笔成本的两个视角，不得重复扣款。
- 电视播出、BD/DVD渠道抽成均0 bps；BD/DVD毛收入50%直接归制作公司。外部代理费率替代对应渠道 channel_overhead_bps，二者互斥。

> **2026-11-27 实现边界：** 自然补位企划已提供六个合法渠道潜力，`channels_baseline=["bd_dvd"]`，并允许承制/委员会模式；潜力比例 2000/1200/1000/500/500/400‰ 沿用原创草稿占位基线，待 #59/M7 标定，不代表六渠道收入模型或经济平衡已完成。完整六渠道参数曲线、`fixed_prelaunch_cost`、通用渠道抽成及财务映射仍按上节边界保留为实现缺口。

#### 14.15.3 特殊商业机会与设施阶梯

- 五类特殊商业机会的门槛、触发概率、前置费、收入区间、履约工作量与期限以 DECISION_LOG §22.5 为准。接受即锁定收入并扣前置费；按期完成全额取得，原期限后2周宽限期内完成收入折减25%，超过宽限期或项目中止收入归0；前置费沉没，彻底违约/中止声望处罚5–10点，避免与既有中止处罚重复。
- 特殊机会按作品规模进行触发检查；标准12集TV每4集一次。不同类型的规模映射及同一检查点多机会抽取互斥规则仍需实现前补齐。
- 设施核心编制阶梯、升级费与维护费以 DECISION_LOG §22.6 为准。弹性工位按 T0–T7 为1/1/2/2/3/3/4/4，不收费；设施升级无声望限制，扣款后即时生效，不影响在制项目，维护费从下一次周结算起计提。超编员工不强制解雇，未降至上限以下前禁止新增招聘。

本节记录目标契约与数值基线，不代表相关运行时命令、财务映射、Archive或完整回归已实现。


#### 14.17 质量验收、特殊商业机会与项目临时员工补充契约

**质量验收（DEC-QUALITY-001）**
- Q_min 与全片最终质量 Q_final 比较，包含核心审美奖励，范围[0,105]，与玩家最终评分同标尺。它是合同验收线，不阻止交付。
- 承制与委员会项目均执行现金扣罚：penalty = contract_fee * min(0.30, (Q_min - Q_final) * 0.02)。每低1分扣合同制作费2%，最高30%；委员会项目的 contract_fee 为该项目约定制作费，扣罚从公司现金池扣除。
- 未达标扣声望5–10点、降低委员会合作好感度，并取消承制成功奖励；承制成功奖励仅适用于承制项目。具体声望扣分由预设提供。
- 未达标不满足高阶特殊商业机会质量门槛。

**工作项质量汇总（DEC-QUALITY-002）**
- Q_inhouse 只计正式核心员工有效产出；项目临时员工不计入。临时员工与外部供应商计入 Q_base 及协力计算。
- inhouse_done == 0 时，以 Q_base 替代 Q_inhouse 计算 Q_cap：min(100, round_half_up(0.60*max(Q_base,S_sup)+0.40*Q_base+8))。
- 阶段内子工作项按 work_total 加权；制作中每周实时预览，work_done == work_total 时冻结工作项质量。
- 核心审美奖励归一化：Bonus_final = sum(w_i * Bonus_i) / 80。

**特殊商业机会检查（DEC-MARKET-004）**
- 检查次数：OVA小/中/大=1/1/2；短篇=2/2/2；TV=3/3/4；剧场版=2/2/2。剧场版检查点为进度60%及交付/上映前。
- 每检查点最多触发1个机会；同一作品同一机会类型最多触发1次。
- 各达标类型分别以坐标 (work_id, checkpoint_idx, opp_type) 判定命中；多个命中时按剩余可用机会固定权重轮盘赌抽取1个。具体轮盘权重作为待配置参数，不在此处虚构。

**项目临时员工（DEC-STAFF-009）**
- 能力档：T0–T1为42–52，T2–T4为56–65，T5–T7为66–74；不参与长期成长，exp=0。
- 周薪为同能力正式员工标准周薪1.20倍，周结算扣除；签约费为周薪2倍，签约时立即扣除。
- 合同跟随绑定项目，直到交付或中止，不采用固定13周一期。
- `temporary_contract={work_id,start_week,end_week}`；签约时 `start_week=company.week`，`end_week=project.deadline_week`。`end_week` 是名义预计结束周快照，仅用于展示/审计，不触发自动解约。
- `request_extension` 成功时，必须在同一原子命令中把该项目全部在聘临时员工合同的 `end_week` 更新为新的 `deadline_week`；延期失败不得改动任何合同。
- 实际退出仍只由项目交付或中止触发。主动解约或项目中止时，签约费与已发周薪不退；下周起停发周薪并退出项目，不另收违约金。
- 临时员工不占核心编制，仍受公司弹性工位总人数上限约束。


**六维字段名约束**
- 员工六维字段只允许使用冻结枚举：planning、direction、drawing、animation、management、postproduction。
- script、art、post 等不是 Schema 字段，不得进入数据结构、接口、运行时或正式能力映射表。
- 既有工作项能力映射中的别名必须逐项按负责人确认的正式映射修正；未取得正式映射前不得自行猜测替换，也不得改变既有数值结果。


### 14.18 单集外包覆盖率与 B 级封顶口径（Q10，2026-11-27）

- 统计粒度为单集，不含项目级公共制作。
- 分母为该单集第 2–5 阶段中所有允许外包 `WorkItem.work_total` 的总和；第 1/6 阶段工作项不计入。
- 分子为上述允许外包工作项上，所有外部供应商实际有效交付点数之和，跨供应商累计。只统计实际有效交付；合同金额、合同数、签约工作量和计划外包量均不计入。
- `R_ext = external_delivered_points / eligible_work_total`。全部允许外包工作项均由外部完成时直接触发该集 B 级封顶。
- 覆盖率阈值 ≥70% 仅为 `[M7_TEMP]` 首版临时参数，不是最终冻结值；M7 统一校准。拆单、一键打包及供应商数量不得改变同一实际覆盖率结果。

