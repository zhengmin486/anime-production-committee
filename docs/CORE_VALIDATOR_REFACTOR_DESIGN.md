# 核心状态校验器改造设计

> 历史资料说明：本文记录旧版 V2/V3 契约、旧五阶段制作模型或当时的研究建议，不代表当前目标玩法。现行决策以 [DECISION_LOG.md](DECISION_LOG.md) 为准：项目级公共制作 + 单集六阶段、工作项依赖并行、核心员工每周严格单项目分配、多项目并行及限时资金危机。本文中的旧阶段、资源分配和资金规则仅作为历史证据/旧实现迁移参考，不得直接作为新架构依据。


> 基于 2026-11-22 main 实际源码核对。本文只定义 M2 接入前的核心兼容层改造，不实现 #6/#7/#11 模块行为，不修改玩法规则或数值。
>
> 核心文件基线：`packages/game-core/src/game_core.cpp`（blob SHA `ed6cfed93ee0c987632fcafdf680900ab3c97e57`）；目标契约：`docs/DATA_MODEL.md` V3.2–V3.7、`apps/web/src/types/gameV3.ts`。当前 native 测试：`packages/game-core/tests/game_core_test.cpp`。

## 1. 设计结论

不要把 `validate()` 简单改成“允许更多数据”，也不要删除校验。应将现有单体校验拆成四层：

1. **基础结构校验**：类型、必填字段、数值范围、枚举、数组唯一性。
2. **实体自身校验**：员工、企划、供应商、外包任务、事件、阶段、作品记录各自满足字段与业务不变量。
3. **跨实体引用校验**：ID 唯一、配置引用有效人员、外包引用有效供应商、续作引用早期作品、事件指向当前阶段等。
4. **全局状态机校验**：phase、company.status、project、offers、pending_event、槽位和 preview 之间必须符合 DATA_MODEL。

校验器只回答“这份状态是否符合 V3 规则”，不负责补字段、不做隐式修复、不消费 seed、不改变资金或状态。所有动作仍先校验完整输入状态，再验证动作条件，最后原子地产生新状态。

## 2. 当前 M1 静态假设清单

| 位置 | 当前限制 | M2 目标 |
|---|---|---|
| `check_staff` | 通过 ID 查 `rules::staff`，姓名/岗位/能力/潜力/线索必须与静态模板完全相同 | 按 Staff 自身字段校验；不再要求动态员工 ID 在静态表中 |
| `validate` 公司名册 | 人数必须等于 `rules::staff.size()` | `company.staff` 仅放 employment=core，可为空，人数动态 |
| `validate` 招聘池/供应商 | 两个数组必须为空 | 分别按候选员工与 Supplier 结构校验 |
| `validate` 事件 | `pending_event` 必须为 null | 仅 event_pending 有且仅有一个有效事件 |
| `check_offer` | 必须能反查 `rules::offers`，且字段必须与静态目录完全一致 | 对 ProjectOffer 自身结构与业务约束校验；静态目录只负责生成 M1 市场样本 |
| `check_project` | 固定 contract、投资 0、无延期、无委员会、无临时员工和外包 | 按 contract/committee 两种模式校验，并验证项目内临时人员、外包和委员会数据 |
| `check_work_record` | 作品 ID 必须命中静态目录；必须是 contract | 依据 WorkRecord 自身快照校验；支持动态 ID、委员会、origin/style/rating/channel_breakdown |
| `check_configuration` | 当前引用只查 `company.staff` | 可引用公司核心员工与当前项目临时员工；已完成阶段只校验快照，不要求人员仍在当前名册 |
| 阶段工作量 | 通过 `offer_catalog_item(id)` 取得 workload | 使用当前项目 `offer.workloads[stage]` |
| 开工工期 | 通过静态 `OfferSpec` 取得 duration | 使用报价快照 `offer.duration_weeks` |
| 人员专业匹配 | `advance_week` 通过 `staff_spec(id).specialty` | 不能继续依赖员工静态 ID；需单独确定动态员工的专业匹配来源/规则 |
| 阶段团队快照 | `complete_stage` 只从 `company.staff` 取人 | 从核心名册与项目临时名册合并查找，外包贡献按其任务快照/项目规则记录 |

**关键提醒：** 移除 `check_offer` 的静态目录依赖还不够。当前 `start_project`、`advance_week`、`calculate_result`、`complete_stage` 仍有静态企划或员工 ID 依赖。兼容层改造要先清点调用点，再按职责分批替换，不能留下“校验通过、动作执行仍崩”的半状态。

## 3. 实体校验设计

### 3.1 Staff：按存放位置区分 employment 约束

Staff 的通用字段校验：

- id/name 非空；role 必须是 Role 枚举。
- abilities、experience、potential、revealed_potential 必须恰好包含六项专业；能力/潜力 0–100，经验非负，revealed_potential 为布尔值。
- potential 每项不得低于当前 abilities。
- talent_type 为 specialist/uneven/generalist/ordinary；clues 为 1–2 条非空文本；traits 为文本数组。
- fatigue/morale 0–100；departure_warning 为布尔值。

按位置附加约束：

| 存放位置 | employment | 薪资字段 | 备注 |
|---|---|---|---|
| `company.staff` | 必须 core | weekly_salary 非负，project_fee=0 | 核心名册可为空，ID 唯一 |
| `recruitment_pool` | 按招聘候选契约校验，招聘候选应是可转为 core 的人员 | 候选薪资按招聘规则校验；不能把候选人算入公司工资 | 不与核心名册、项目临时名册重复 |
| `project.temporary_staff` | 必须 temporary | weekly_salary=0，project_fee 按已确认招聘规则 | 仅属于当前项目；项目结束释放 |

不要把 temporary 员工加入 `company.staff`。现有 Company.staff 是核心员工集合，项目临时员工单独保存在 Project.temporary_staff；这是契约边界，不是可以为了省事合并的两类员工。

### 3.2 ProjectOffer：静态目录与动态报价解耦

保留静态目录 `rules::offers` 作为当前 M1 初始化/市场生成来源，不再把它当作全体合法报价的白名单。

通用校验：

- id/name 非空；source、scale、risk、allowed_modes 为合法枚举。
- 金额、时长、目标质量、受众基础、商业潜力、五阶段 workloads 范围合法。
- allowed_modes 非空且无重复；source=original 时只能 committee。
- previous_work_id 为 null 或已存在的更早历史作品 ID，不能自指、循环或指向未来。
- 可选字段缺省按 DATA_MODEL V3.6/V3.7 解释：origin=market、style=normal、min_reputation=0；committee_members/channel_potentials/required_works 缺省表示未提供相应扩展数据。
- style 非 normal 必须 origin=custom；meme 只允许 short。
- committee_members 仅在允许 committee 的报价上出现；成员 ID 唯一、share_percent 1–100、channels 非空且不含 bd。
- channel_potentials 的 bd 必须存在；其他渠道值可选且范围 0–100。
- required_works 非空时不得有重复要求；每项 rating 合法，source 可选。

静态目录字段一致性校验只可用于测试“当前 M1 生成的 12 个模板没有被意外改坏”，不能放在生产通用 `check_offer` 中。

### 3.3 Project：按合作模式校验

共同字段：

- offer 通过 ProjectOffer 校验；start_week/deadline_week 合法且 deadline_week > start_week。
- 五阶段完整存在，阶段状态顺序、work_done、quality、configuration、result 符合当前制作进度。
- finance 完整合法；temporary_staff、outsourcing 各自合法且 ID 唯一。
- delivery_reason 与 phase/status 对齐。
- `work_done` 上限直接取 `project.offer.workloads[stage]`，不能再通过 ID 查静态目录。

承制模式：

- mode=contract；investment_percent=0。
- committee 与 tv_service 按 DATA_MODEL 的承制约束处理（committee 必须 null；tv_service 不能用于承制路线）。
- investment_paid 与 commercial_share_received 为 0；extension_count=0；committee_pressure=null。
- 合同预算/到账只按合同规则入账，作品结算公司商业分成恒为 0。

委员会模式：

- mode=committee；投资比例为规则允许的整数区间。
- committee 为立项时固定阵容；成员份额合计 + 公司投资比例 = 100。
- committee_pressure、extension_count 满足 V3 约束。
- investment_paid、商业分账及渠道快照按 V3.8 财务规则校验。
- tv_service 若存在，purchased_week 不早于立项、不晚于当前周，cost 为正数；同一项目至多一次。

本设计不重新定义委员会数值和分账公式，只校验已经冻结的规则。

### 3.4 Supplier / OutsourceTask

Supplier：

- id/name 非空；specialties 非空、能力枚举合法且不重复。
- capacity/speed 为正数；quality/reliability 为 0–100；unit_price 为非负金额；unlocked 为布尔值。
- supplier ID 在供应商数组内唯一。

OutsourceTask：

- id 非空且项目内唯一；supplier_id 必须引用当前已解锁供应商。
- stage、ability、mode、status 合法；work_total 为正数，work_done 在 0..work_total，fee_paid 非负，due_week 合法。
- delivered 必须 work_done=work_total；active/failed 的关系按 #7 已冻结口径继续细化。
- fee_paid 是已支付费用快照，不允许在校验或结算时再次扣款。

### 3.5 GameEvent

- id/title/description 非空；category/stage 合法。
- trigger.metric 为非空文本，value/threshold 范围合法。
- options 非空；option id 唯一；label 非空；cost 非负；allows_reconfigure 为布尔值；disabled_reason 为 null 或非空文本。
- event_pending 时 pending_event 必须存在，且 event.stage 必须与当前 project.current_stage 一致。
- 非 event_pending 状态 pending_event 必须为 null。
- 事件效果不能以任意 JSON effect 写入状态；只允许核心识别的 option_id 并复用已有规则入口。

### 3.6 StageResult / WorkRecord

StageResult：

- weeks_spent 为正数；quality 0–100；costs 合法；issues 为文本数组。
- team 允许为空：DATA_MODEL 明确允许核心人员不参与、仅靠有效外包完成阶段；当前 C++ 的 `!team.empty()` 是不兼容限制。
- team 成员是制作当时快照，只校验字段和 staff_id 唯一，不要求仍在当前名册。

WorkRecord：

- 不再要求 id 能反查静态 OfferSpec；校验其自身 name/source/scale/mode/投资/时间/质量/商业表现/finance/profit/team/stages。
- 五阶段结构完整；阶段快照不要求人员仍存在于当前名册。
- origin/style 缺省语义与 ProjectOffer 一致；rating 可选且仅为 S/A/B/C/D；channel_breakdown 缺省兼容旧 M1，存在时必须恒含 bd、渠道不重复且总收入/公司所得分别精确对账。
- previous_work_id 必须指向 history 中更早的作品，禁止自指、循环和未来引用。
- 同一作品 ID 只能出现一次；history 只追加。

## 4. 跨实体与全局状态不变量

### 4.1 ID 唯一性与引用

建立一次性的全局 ID 收集/引用检查，不要让每个实体各自只做局部唯一性：

- 核心员工、招聘池候选人、当前项目临时员工 ID 彼此不重复。
- 市场 offers、custom_offer、pending_proposal、当前 project.offer、history 的作品 ID 彼此不重复；pending_proposal 与 custom_offer 也不得相同。
- suppliers 的 ID 独立唯一；outsourcing.supplier_id 必须命中供应商。
- 当前阶段配置只引用 company.staff + project.temporary_staff 中存在的人；角色必须与引用人员一致。
- 已完成阶段 configuration 与 StageResult.team 是历史快照，不要求引用仍存活的当前员工，但两者内部 ID/能力快照必须自洽。
- WorkRecord.previous_work_id 只允许指向当前记录之前的历史条目。

### 4.2 状态矩阵

| company.status | phase | project | offers | pending_event | custom/proposal 槽位 | preview |
|---|---|---|---|---|---|---|
| running | idle | null | 恰好 4 个 | null | 可按规则存在 | idle_preview |
| running | producing | 有效在制项目 | 空 | null | 均 null | 仅当前阶段 active 时有 |
| running | event_pending | 有效在制项目 | 空 | 有效事件 | 均 null | null |
| running | project_ready | 待交付项目 | 空 | null | 均 null | null |
| running | project_settled | null | 空 | null | 均 null | null |
| closing | idle | null | 空 | null | 均 null | null |
| closing | project_ready | 待交付项目 | 空 | null | 均 null | null |
| closing | project_settled | null | 空 | null | 均 null | null |
| ended | company_ended | null | 空 | null | 均 null | null |

说明：

- closing 不得处于 producing/event_pending；结束公司时，在制项目应立即转 project_ready。
- 520 周终局若周结算后没有在制项目，空闲状态转 closing/idle；若仍有项目，转 closing/project_ready。
- project_settled 可属于 running 或 closing；公司关闭后仍允许项目结算和公司总结。
- 旧 M1 状态没有 custom_offer/pending_proposal 字段时，按两槽均 null 处理；核心实现后统一输出也不要求存档迁移。
- DATA_MODEL 允许核心员工名册为空；不能把“初始化有 4 人”误写成“任意合法状态都必须有 4 人”。

### 4.3 preview

preview 不是独立业务状态，只能从核心状态计算：

- running + idle：idle_preview。
- running + producing 且当前阶段 active：active_preview。
- producing 但阶段 ready、event_pending、project_ready、project_settled、closing、company_ended：null。
- 新成本类别接入后，preview 的 Costs 必须输出完整类别（旧可选类别按 0 解释或按统一输出策略补齐），total_cost 必须与各项之和一致。

## 5. 非校验器但必须同步解耦的执行路径

仅修改 `validate()` 仍不能接住动态企划/员工。下面这些调用点必须作为同一兼容层改造的关联工作：

| 函数/区域 | 静态依赖 | 建议处理 |
|---|---|---|
| `start_project` | `offer_catalog_item(id)` 读取 duration | 使用已校验的 offer 快照字段 |
| `advance_week` | `offer_catalog_item(id)` 读取 workload | 使用 project.offer.workloads |
| `calculate_result` | 结算前要求 offer ID 命中静态目录 | 删除目录身份依赖，使用 project.offer 快照 |
| `advance_week` | `staff_spec(id).specialty` 决定专业匹配 | 这是动态员工专业归属问题；需与员工规则负责人/既定数据契约对齐后单独实现，不能凭 ID 猜 |
| `check_configuration` | 只查 company.staff | 查核心员工 + 当前项目临时员工 |
| `recommended_configuration` | 会纳入 temporary_staff | 确保校验器和实际执行对临时人员的查找范围一致 |
| `complete_stage` | 只从 company.staff 生成 team 快照 | 合并查找核心与临时人员；外包产出按 #7/#8 已定履历口径 |
| `check_work_record` | 历史记录反查静态目录 | 仅校验 WorkRecord 自身快照和历史引用 |

`generate_offers()` 继续使用静态 `rules::offers` 并不妨碍本次改造：它是 M1 市场生成器，可以暂时保留。要去掉的是“所有合法报价都必须在静态表里”的假设，不是马上重写市场生成。

## 6. 改造顺序与范围控制

### A. 先拆纯校验辅助函数

建议按职责拆成：

- `check_staff_fields(person)`
- `check_staff_placement(person, placement)`
- `check_offer_fields(offer)`
- `check_supplier(supplier)`
- `check_outsource_task(task, suppliers)`
- `check_event(event, project)`
- `check_team_snapshot(team)`
- `check_stage_result(result)`
- `check_project(project, state)`
- `check_work_record(work, prior_history)`
- `check_global_ids_and_references(state)`
- `check_phase_invariants(state)`

函数名是实现建议，不要求照抄；重点是将实体校验、引用校验、状态机校验分离。

### B. 改造旧校验依赖

- 删除员工 ID 必须存在于 `rules::staff` 的要求。
- 删除 company.staff 固定人数限制，但保留 employment=core。
- 招聘池、临时人员、供应商改为结构化校验。
- 删除 pending_event 永远为 null 的限制，补齐 event_pending 全局状态分支。
- 删除报价/作品 ID 静态目录白名单；改用报价快照和 WorkRecord 自身字段。
- 阶段工作量、工期使用 offer 快照。
- 允许 StageResult.team 为空；配置校验允许当前项目临时员工。
- 兼容新旧 Finance Costs 字段，development/distribution 缺省视为 0，输出策略统一。

### C. 保持严格校验，不做的事情

- 不允许未知枚举、负数费用、超范围能力、重复 ID、悬空引用。
- 不自动补齐必填字段；仅对 DATA_MODEL 明确批准的可选字段提供缺省语义。
- 不自动清理非法槽位、不替玩家修正 phase。
- 不引入第二套随机数，不让 validator 消费 seed。
- 不改变市场四槽、周制、五阶段、单项目、520 周、既定委员会分账与员工规则。
- 不在本轮实现企划生成、招聘抽卡、外包计算、事件触发或 UI。

## 7. 测试策略

### 7.1 必须保留的 M1 回归

- 现有 native tests 全部通过，尤其初始化、开工、配置、空闲周、制作周、截止交付、项目结算、公司总结、破产、520 周终局和重复结算保护。
- M1 初始化仍生成四个市场企划和原始核心名册；初始声望 100 的规则修正应作为单独参数改动，不混进 validator refactor，避免黄金数值变化难以定位。
- 旧 M1 V3 状态缺省新字段时仍通过校验；不要求旧存档增加字段。
- 同一输入状态的只读校验不改变 state/seed/funds/week。

### 7.2 新增校验正例

- 核心员工人数 0、1、4、更多；全部 employment=core。
- 动态员工 ID 与非静态员工目录匹配，但字段范围合法。
- 招聘池候选人存在且与核心名册 ID 不冲突。
- 项目含临时员工；阶段配置引用核心或临时员工。
- 有供应商和有效外包任务；供应商解锁状态、专业和任务引用正确。
- committee 项目、custom_offer、pending_proposal、动态 offer ID、previous_work_id。
- event_pending 与有效 pending_event。
- 仅外包完成阶段导致 StageResult.team 为空。
- WorkRecord 的 origin/style/rating/channel_breakdown 缺省兼容与显式合法值。
- history 多作品 previous_work_id 指向更早记录。

### 7.3 新增校验反例

- 同一员工 ID 同时出现在核心名册、招聘池或临时名册。
- 当前配置引用已释放的临时员工或不存在员工。
- Supplier ID 重复；OutsourceTask 引用不存在/未解锁供应商。
- 非 event_pending 却带 pending_event；event_pending 无事件或事件指向错误阶段。
- market offer 使用 origin=proposal；proposal 不是 original；非 custom offer 使用 meme/ai。
- custom_offer 与市场/提案/历史作品 ID 冲突。
- previous_work_id 自指、未来引用、循环。
- channel_breakdown 汇总与总收入/公司所得不相等。
- committee 股份总和不满足投资比例约束。
- running idle 不是四个市场报价或可立即承接数量不足。
- closing 仍处于 producing/event_pending；ended 状态仍保留 project/offer/event/preview。

### 7.4 测试层次

- Native：验证核心状态与动作规则，是本次主要验收。
- WASM：验证真实导出对相同合法/非法状态行为一致。
- TS guard：验证 UI 层协议结构，不替代 C++ 核心规则。
- Browser：待核心 M2 行为真正接入后再补端到端流程，不在本轮为了校验器造假的 UI 流程。

## 8. 模型与协作建议

这次改造风险集中在 C++ 核心不变量与现有 M1 回归：

- **8x 模型**：只在设计确认后负责隔离分支中的 C++ 校验器和必要执行路径改造，并同步补 native 测试。范围限定在 `game_core.cpp` 与 `game_core_test.cpp`；不改 `game_rules.hpp`、`gameV3.ts`、fixtures、WASM binding 或前端。交付补丁/分支，由负责人审查后单点合入。
- **Flash 模型**：本轮不需要参与核心 C++ 实现。若要节省 8x，可让 Flash 做只读测试矩阵审查或检查文档/TS guard 与设计的差异，但不能让它直接修改共享契约。
- **ChatGPT + 负责人**：先确认本文设计与现有规则没有冲突；再给 8x 一个边界清晰的工程任务；审查其 diff、测试输出和旧存档兼容证据。

不建议把整套 M2 企划、员工、事件一次性交给 8x 实现。先把状态兼容层做成可验证、可回滚的独立变更。

## 9. 验收标准

- 现有 native 测试全部通过；新增正反例覆盖本设计所列核心边界。
- M1 初始化输出保持兼容（初始声望参数修正除外，单独提交）。
- 动态 offer / staff / supplier / event / work record 不再依赖静态目录身份。
- 状态校验能识别并拒绝非法跨实体引用和 phase 组合。
- 旧 M1 V3 存档不迁移、不补写、不丢字段，仍可读取并完成现有 M1 流程。
- validator 不改变 seed、资金、周数或其他业务字段。
- 同一合法输入通过 native 与真实 WASM 的核心校验。
- 本轮不声称 M2 玩法已实现；只完成承载 M2 状态所需的核心兼容层。

---

**本轮建议的最终决策：** 先批准“校验器分层 + M1 静态身份解耦 + 状态机闭环”作为独立核心改造；员工专业匹配来源、市场热度状态字段、development/distribution 实际入账、委员会结算和事件触发仍分别保留为后续规则/模块集成议题，不要在校验器重构中顺手拍板。
