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
| 不变式 | INV-01 – INV-26 | 高：每条都要有对应断言 |
| 命令面 | 22 个命令的输入、守卫、错误码 | 中：影响 UI 与测试 |
| 错误码 | 16 个稳定码 | 中：UI 按码分支 |
| 危机白名单 | 危机期允许/禁止的动作 | 中：影响玩家自救路径 |
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

**不存在的字段**（v3 遗产，禁止复活）：`phase`（全局经营阶段）、`project`（单数）、`pending_event`（顶层单槽）、`preview`（派生）、`last_project_id`、`company.finance`、`project.finance`、`StageResult`。

**派生值不入存档**：`risk`、`preview`、读模型（`company_overview` 等）、`week_receipt`、`target_effective`。加载时由核心重算。

---

## 3. 聚合契约

只列**必填/可空/关键约束**，完整字段语义见架构 §7。

| 对象 | 必填 | 可空 | 关键约束 |
| --- | --- | --- | --- |
| `Company` | id, name, founded_week, week, status, reputation, reputation_log | end_reason（仅 running 为 null）, facilities（可空数组） | week ∈ [0,520]；status=running ⇒ week<520 |
| `Staff` | id, name, role, employment, abilities, experience, potential, revealed_potential, talent_type, signing_fee, weekly_salary, fatigue, morale, departure_warning, assignment_work_id | last_participation, temporary_contract | core/temp 均使用一次性 signing_fee + weekly_salary>0；不再使用 project_fee；core 的 temporary_contract=null；temp 的 assignment_work_id = 合同项目；公司至少保留 1 名 core |
| `Project` | id, offer, mode, investment, channels, opened_week, deadline_week, extension, status, common, episodes, plan | ip_id, committee_id, tv_service, delivery | committee 模式才可有 committee_id；episodes 长度 = offer.episode_count |
| `CommonProduction` | id, items | — | items 非空 |
| `EpisodeProduction` | id, index, stages | — | stages 恰 6 个，键固定有序 |
| `WorkItem` | id, key, ability, work_total, work_done, deliver_at, deps, is_gate, quality, contributors | — | 0 ≤ work_done ≤ work_total；deliver_at ∈ [1,1000] |
| `WorkPlan` | intensity, focus, outsourcing, overtime, target | — | target 至多一个，引用本项目单集/阶段 |
| `Supplier` | id, name, specialties, capacity_per_week, quality, speed, price_per_unit, reliability, unlocked_week | — | 目录只增不改 |
| `OutsourceContract` | id, supplier_id, work_id, episode_id, item_id, ability, mode, work_total, work_done, weekly_cap, fee_total, fee_paid, signed_week, due_week, status | episode_id（公共制作为 null） | item 属于同一 work；Σactive weekly_cap ≤ supplier 容量 |
| `Partner` | id, name, type, channels, prestige, relationship, history, status | — | 渠道唯一 |
| `Committee` | id, work_id, members, formed_week, status | closed_week | 一成员一渠道，bd 不挂成员 |
| `MarketState` | heat, slots, refresh_week, competitors | custom_offer, proposal, last_competition_round | slots ≤ 4；自定/提案为独立槽 |
| `Finance` | opening_funds, balance, entries, loans, solvency | — | balance = opening + Σentries；负余额仅危机/关闭 |
| `EventState` | pending[], last_event_week, per_work | pending 数组可为空 | 每条待处理事件带 work_id/event_id/triggered_week；pending 中每项目至多一条；不同项目可同周各有事件；last_event_week 不得充当全局单槽 |
| `Archive` | works, series | company_result | 只追加 |

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
| INV-12 | `contributors` 只增不删、无重复、只含参与过该工作项的员工 | INVALID_STATE |
| INV-13 | 委员会成员不重复、渠道不重复、`bd` 不挂成员 | INVALID_STATE |
| INV-14 | contract ⇒ `investment.percent=0 ∧ paid=0 ∧ committee_id=null`；committee ⇒ percent ∈ {10..100} 且 committee_id≠null | INVALID_STATE |
| INV-15 | `allowed_modes`：普通企划含 contract 与 committee；原创仅 committee | INVALID_STATE |
| INV-16 | `balance = opening_funds + Σ entries.amount` | INVALID_STATE |
| INV-17 | 每笔 entry 只属一个 category；收入类只能由交付结算写入 | INVALID_STATE |
| INV-18 | `0 ≤ loan.remaining ≤ loan.principal`，且 remaining = principal − Σ已还 | INVALID_STATE |
| INV-19 | 同一供应商 `Σ active 合同 weekly_cap ≤ capacity_per_week` | CAPACITY_EXCEEDED |
| INV-20 | 合同 `item_id` 属于同一 `work_id`；累计交付不超过该项 `work_total` | INVALID_STATE |
| INV-21 | `running ⇒ week < 520`；`week` 只由 `advance_week` 改变 | INVALID_PHASE |
| INV-22 | Archive 只追加；`WorkRecord.id` 唯一；`previous_work_id` 指向更早记录 | INVALID_STATE |
| INV-23 | `events.pending[]` 可同时包含多个项目事件；每条带 `work_id/event_id/triggered_week`，pending 中每项目至多一条；同一项目每周最多触发一个；`last_event_week` 不得全局限流；未处理事件不得覆盖/丢弃 | INVALID_STATE |
| INV-24 | `market.slots ≤ 4`；自定/提案槽与市场槽、历史 id 互斥 | INVALID_STATE |
| INV-25 | 负余额只出现在 `solvency=crisis` 或 `company.status=closing(bankrupt)` | INVALID_STATE |
| INV-26 | 存档中不含派生值（§2 列表）；加载时重算 | SAVE_CORRUPT |

---

## 5. 命令契约

命令是**用例级**的：每个命令独立 schema、独立守卫、独立错误码，不存在"万能 decision 联合类型"。

22 个命令（下表 19 行，其中两行各含多个命令）。

| # | 命令 | 关键守卫 | 主要失败码 | 原子范围 |
| --- | --- | --- | --- | --- |
| 1 | `initialize_game(seed)` | 无（唯一不带 state 的命令） | INVALID_INPUT | 建立公司/名册/供应商/合作方/市场首轮 |
| 2 | `start_work(offer_id, mode, percent, committee_partner_ids)` | running ∧ 非危机 ∧ 企划存在且有效 ∧ 模式合法 ∧（普通企划满足 `min_reputation/required_works` ∨ 有效原创草稿存在）∧ 现金 ≥ 全部应付款 | NOT_FOUND / MODE_NOT_ALLOWED / INSUFFICIENT_FUNDS / CRISIS_COMMITMENT_BLOCKED | 项目+委员会+两笔账+消费企划，一次提交；原创在此正式开工 |
| 3 | `set_work_plan(work_id, plan)` | 项目 producing ∧ target 引用本项目单集/阶段且至多一个 | NOT_FOUND / INVALID_INPUT | 仅更新计划 |
| 4 | `assign_staff(staff_id, work_id \| null)` | 项目 producing ∧ 员工存在 ∧ 不违反单项目 | NOT_FOUND / INVALID_PHASE | 仅更新归属 |
| 5 | `hire_core(staff_id)` | running ∧ 非危机 ∧ 候选人存在 ∧ 现金 ≥ signing_fee ∧ 名册上限（若有） | NOT_FOUND / INSUFFICIENT_FUNDS / CRISIS_COMMITMENT_BLOCKED | 签约即入职并加入核心名册，当周可分配；signing_fee 立即入账，首周周薪计入本周下一次周结算 |
| 6 | `scout(role?, focus_ability?)` | running ∧ 非危机 ∧ 现金 ≥ 本次费用 ∧ 招聘池非空 | INSUFFICIENT_FUNDS / CRISIS_COMMITMENT_BLOCKED | 池+保底计数+费用 |
| 7 | `dismiss_staff(staff_id)` | running ∧ core 员工存在 ∧ 解雇后 core 数 ≥1 | NOT_FOUND / INVALID_INPUT | 移出名册+清空归属；不预付遣散费 |
| 8 | `hire_temporary(work_id, candidate_id)` | running ∧ 非危机 ∧ 项目 producing ∧ 现金 ≥ signing_fee | NOT_FOUND / INSUFFICIENT_FUNDS / CRISIS_COMMITMENT_BLOCKED | 临时合同+signing_fee 即时入账；weekly_salary 从后续周结算计提；归属合同项目 |
| 9 | `sign_outsourcing(work_id, item_id, supplier_id, work_total, mode)` | 工作项已解锁 ∧ 专业匹配 ∧ 产能余量 ∧ 现金 | DEPENDENCY_UNMET / CAPACITY_EXCEEDED / INSUFFICIENT_FUNDS | 合同+费用+占用 |
| 10 | `deliver_work(work_id)` | 全部门槛项 delivered ∧ 未过截止 ∧ 项目 producing | GATE_UNMET / INVALID_PHASE | 当次完成交付结算（周数不变） |
| 11 | `abort_work(work_id)` | 项目 producing | NOT_FOUND | 终止+扣罚+释放占用 |
| 12 | `create_custom_offer(name, source, scale, style)` | running ∧ 非危机 ∧ 基础声望等草稿资格满足 ∧ 原创草稿槽可用；不检查全部投资资金 | CRISIS_COMMITMENT_BLOCKED / INVALID_INPUT | 只创建原创草稿，不建立 Project、不扣全部投资资金；草稿开发费时点待确认 |
| 13 | `adopt_proposal()` | 存在提案 ∧ running | NOT_FOUND | 提案→自定槽 |
| 14 | `reject_proposal()` | 存在提案 | NOT_FOUND | 清空提案 |
| 15 | `buy_tv_service(work_id)` | 委员会模式 ∧ 未购买 ∧ 非危机 ∧ 现金 | MODE_NOT_ALLOWED / INSUFFICIENT_FUNDS | 渠道+发行费 |
| 16 | `request_extension(work_id)` | 委员会模式 ∧ 未用过 ∧ 未过截止 ∧ 非危机 ∧ 现金 | MODE_NOT_ALLOWED / INSUFFICIENT_FUNDS | 延期+费用 |
| 17 | `arrange_financing(provider, amount)` | 危机中或资金压力周 ∧ 额度未超 | INSUFFICIENT_FUNDS / INVALID_PHASE | 现金入账+贷款 |
| 18 | `advance_week()` | running ∧ `events.pending[]` 为空 ∧ week<520 ∧ 非 closing | INVALID_PHASE | 整周结算（正常 13 阶段 / 危机 7 步） |
| 19 | `resolve_event(work_id, event_id, option_id)` | 该 work 存在对应 pending 事件 ∧ 选项合法 ∧ 现金充足（若需付款）∧ 效果不绕过危机白名单 | NOT_FOUND / INVALID_INPUT / INSUFFICIENT_FUNDS | 效果分派；只移除 `(work_id,event_id)` 对应事件 |
| 20 | `end_company()` | running | INVALID_PHASE | 锁 closing，未交付转 delivering |
| 21 | `finalize_delivery(work_id)` | 项目 delivering（关闭路径） | INVALID_PHASE | 交付结算 |
| 22 | `finalize_company()` | 公司 ended 且项目已结清 | INVALID_PHASE | 生成结局，只执行一次 |

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
| `INSUFFICIENT_FUNDS` | 现金不足 | 立项、签约、融资超限 | 否（先筹钱） | 显示缺口 |
| `CAPACITY_EXCEEDED` | 供应商产能不足 | 周承诺超容量 | 否 | 显示剩余产能 |
| `DEPENDENCY_UNMET` | 工作项未解锁 | 上游未达门槛 | 否 | 指向阻塞项 |
| `GATE_UNMET` | 门槛项未全部交付 | 提前交付被拒 | 否 | 列出缺口项 |
| `CRISIS_COMMITMENT_BLOCKED` | 危机期禁止新增承诺 | 立项/外包/招聘/电视服务/自定企划 | 否（先脱困） | 展示危机面板 |
| `COMPANY_ENDED` | 公司已结束 | 关闭后调非结清命令 | 否 | 只留结清与总结 |
| `SAVE_VERSION_UNSUPPORTED` | 存档版本不支持 | 读到 v1/v2/v3 或未来版本 | 否 | 提示新开，不覆盖原档 |
| `SAVE_CORRUPT` | 存档结构损坏 | JSON 非法、必填缺失、含派生字段 | 否 | 提示保留原档 |
| `NOT_IMPLEMENTED` | 契约已冻结、行为未实现 | M0 阶段的占位命令 | 是（换版本后） | 明确"尚未开放" |
| `INTERNAL_ERROR` | 内部异常 | 未预期 | 是（一次） | 记录上下文 |
| `STAGE_LOCKED` | **已废弃**，v4 不再产生 | — | — | 保留字符串占位，禁止复用 |

---

## 7. 危机期白名单

依据 DEC-FIN-003。危机期间推进周数、继续计提固定成本、允许现金暂时为负。

| 动作 | 危机中 | 理由 |
| --- | --- | --- |
| `arrange_financing` | ✅ 允许 | 唯一被允许的新增资金动作 |
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
PASS  HO-09  经历资金危机（数周不生产）后恢复，继续做自己参与过的工作项，不扣
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
| 状态契约与不变式（26 条） | ✅ | §3、§4 |
| 命令表（22 个） | ✅ | §5 |
| 错误码（16 个，1 个废弃） | ✅ | §6 |
| 危机期白名单 | ✅ | §7 |
| 存档版本拒绝策略 | ✅ | §8 |
| 实现代码 | ⛔ 不在 M0 范围 | M1 起 |

**M0 冻结后，M1 可以开始**：M1 的目标是“能跑一周”，实现 v4 状态骨架、校验、核心规则内核、坐标式随机与最小周结算。状态结构从第一天采用多项目形状（`works[]`）；M1 只用单项目纵向切片验证一周，不得实现成单项目架构。单项目从立项到交付的完整链路属于 M2。阶段出口标准见 [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)。M1 不得为了实现便利擅自改动 §4 的 26 条不变式与 §5 的 22 个命令语义；如发现缺陷、遗漏或必须调整的契约，仍可按 §13 的变更分级与审批流程修补，不得绕过流程直接改变。

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

## 14. 与 v3 的关系

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
- 玩家可以按任意顺序处理待处理事件；不要求全局 FIFO。
- 处理命令为 `resolve_event(work_id, event_id, option_id)`，成功后只移除目标事件，其他项目事件原样保留。
- 数组非空时禁止 `advance_week()`；全部事件处理完成后才允许推进。
- 资金危机期间不抽取新事件，但不清空既有 pending；`resolve_event` 仍可处理，选项效果必须遵守危机白名单。
- 校验器必须覆盖：同周多个项目各一事件合法、同一项目同周第二事件非法、处理一条不清除其他项目事件、事件未清空时推进周失败。

### 14.2 负现金与资金危机语义确认

- `DEC-FIN-003` 允许资金危机期间现金暂时为负，负数表示欠付，不代表自动借款。
- `INV-25` 的“负余额只出现在 `solvency=crisis` 或 `company.status=closing(bankrupt)`”与上述规则一致，不得收紧为余额始终非负。
- 危机期间按 DEC-FIN-003 推进周数并继续计提固定成本，不生产、不计制作费；危机白名单仍然有效。
- 资金危机的期限、融资额度、利率及判定阈值属于标定参数，不在本次契约修订中冻结。

### 14.3 版本与实现状态

本次修订不把文档契约等同于已实现功能。M1 已将 v4 runtime 基础切片合入 main；事件完整闭环、跨项目事件数组校验、原创草稿/正式开工分段、`signing_fee + weekly_salary` 员工账务及 v4 完整存档恢复仍须按 M2/工程契约任务实现并验收。不得继续以旧版“全局单事件槽”或 `project_fee` 作为目标行为。

### 14.4 核心员工招聘即时入职时序（DEC-PLAY-003 补充）

- `hire_core(staff_id)` 成功后，候选人立即从招聘池转入核心员工名册，招聘签约与入职在同一次命令提交中完成。
- 新员工从签约确认时起即可参与当周人员分配；不设置“待入职”状态，也不等待下一周才开放分配。
- 签约费在签约确认时立即入账；首周周薪从签约后当前经营周的下一次周结算起计提。若本周结算已经完成，则自然从下一周结算起计薪；不追溯已经完成的结算。
- 本补充只明确既有命令的生效时点，不新增状态字段、不改变存档根结构与版本，也不改变 `hire_core` 的资金、公司状态和危机期守卫。

### 14.5 DISC-01 后续玩法的工程契约边界（2026-11-25）

以下规则方向已进入 DECISION_LOG，但不属于当前 M0 冻结命令表/字段表已完整表达的能力。它们必须在 M2 数据契约审查（Issue #53）中补齐状态形状、命令签名、错误码、资金流水、失败原子性和测试，不得由实现者各自猜测字段或接口：

- **Q2 外派**：需要显式区分员工本社项目、外派、待命三种互斥周归属，并定义外派周结算的现金、工作类型经验、疲劳及红灯守卫。
- **Q3 Scout**：需要表达每周使用次数限制、候选人限时签约窗口和招聘池部分轮换；Scout 每周最多一次。
- **Q4 定金锁定**：需要锁定/到期/消费状态、同一企划终身仅锁定一次的历史记录、定金支付与正式接单抵扣的财务语义；定金比例和计算基数仍待确定。
- **Q10 整集协力打包**：需要应用层批量预检与全有或全无的事务边界；不得把多次独立签约伪装成原子批量操作。
- **Q11 计划预览**：预览是非持久化派生读模型；周内修改只更新计划态。既有 HO-03 等磨合契约用例应覆盖“离开后重新接手曾参与工作项不重复扣损”，并补齐监督减免上限 50% 的边界用例。

本节是待补工程契约清单，不代表上述命令、字段或 UI 已实现，也不擅自冻结其具体 API 名称。实现前须由 #53 收敛契约并回填本文件。

### 14.6 2026-11-25 契约收敛（字段、命令与危机白名单）

- **原创两级准入（DEC-PLAN-001）**：`create_custom_offer` 只创建草稿并检查基础声望等草稿资格，不检查全部投资资金；`start_work` 才正式建立项目并检查全部应付款。普通企划继续按 `min_reputation/required_works` 准入，不再合并为笼统的“声望与成绩达标”。草稿开发费金额与扣费时点仍待确认，不得提前收取全部投资额。
- **员工报酬字段**：`project_fee` 的旧语义由 `signing_fee + weekly_salary` 取代。核心与临时员工均保留一次性签约费和周薪；临时员工的费用与归属明确指向合同项目。该变更是 v4 目标契约，不宣称现行 v3 代码或存档已经支持，也不为 v3 增加迁移层。
- **核心解雇**：`dismiss_staff` 随时可执行，不要求公司空闲、不要求现金、不禁止危机期操作；不预付遣散费；解雇后公司至少保留 1 名核心员工。26 条不变式数量不变，最低保有量由 Staff 约束与命令守卫共同落实。
- **危机与临时合同**：既有 pending 事件可在危机期间逐条处理，危机期间不抽新事件。临时员工只有特定危机/裁减事件明确提供选项时才可提前解约；停止后续周薪，已发生费用不退，不新增通用买断、欠款、递延费用或借贷机制。
- **待确认参数**：基础声望阈值、原创草稿开发费金额/扣费时点、`signing_fee/weekly_salary` 具体数值仍待标定；本次只冻结字段、资格分段、命令守卫与费用归属，不冻结数值。
