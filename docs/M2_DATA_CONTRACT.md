# M2 共享数据契约与接口矩阵（2026-11-25）

> 对应工程议题 #38、#49、#50、#51、#52、#53。本文描述**当前工作树中的 M2 运行时子集**，不代表 M3–M6 能力已实现，也不代表远端 Issue 已关闭。
>
> 规则来源：[DECISION_LOG.md](DECISION_LOG.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)。冲突时以最新已确认规则和本文件列出的运行时边界为准。

## 1. 范围与权威边界

M2 实现单项目正式立项、公共制作、12 集六阶段、人员归属、周结算、主动/截止交付、Finance、最小 Archive、项目事件和 v4 存档。完整市场、招聘、供应商、外包、危机、商业评价、多项目同时经营和前端交互不在本切片内。

- 领域状态是唯一事实来源；UI 回执、预览、风险和读模型不入存档。
- 所有玩家命令先反序列化并校验完整 `GameState`，再检查命令参数、阶段/业务守卫或执行写操作；非法状态不会被命令“修复”后掩盖。
- 命令在工作副本上执行，成功后一次返回新状态；调用方传入的 JSON 状态不共享 C++ 可变对象，失败不会修改调用方状态、资金、周数或未来随机结果。
- `hash_state` 是诊断/测试接口，不改变状态。

## 2. 根数据字典

根对象字段固定，缺失、类型错误和未知字段均拒绝。

| 字段 | 类型 | M2 语义 | 唯一写入者 |
| --- | --- | --- | --- |
| `version` | integer | 固定 4 | 初始化 |
| `seed` | uint32 | master seed；随机由 seed/周/实体坐标推导，无独立 RNG 计数器 | 初始化 |
| `company` | Company | 公司时钟、状态、声望与设施 | 初始化、周结算、终局命令 |
| `staff` | Staff[] | 核心与临时人员 | 初始化、归属、周结算、交付/中止清理 |
| `works` | Project[] | M2 保留 `producing / delivered / aborted` 项目记录 | 立项、计划、归属、周结算、交付/中止 |
| `suppliers` | array | M2 空数组占位，不宣称供应商系统已实现 | 后续里程碑 |
| `contracts` | array | M2 空数组占位 | 后续里程碑 |
| `partners` | array | M2 空数组占位 | 后续里程碑 |
| `committees` | array | M2 七字段最小元数据；交付/中止转 closed，不是完整委员会经营 | `start_work`、交付/中止 |
| `market` | object | M2 固定企划槽 `slots[]` | 初始化、`start_work` 消费 |
| `events` | EventState | 待处理实例与项目事件进度 | 周结算、`resolve_event` |
| `finance` | Finance | 唯一公司现金池与流水 | 所有金额命令统一写入 |
| `archive` | Archive | 只追加交付快照 | `deliver_work`、截止强制交付 |

### 2.1 Company / Staff

`Company` 必填：`id, name, founded_week, week, status, end_reason, reputation, facilities, reputation_log`。`week ∈ [0,520]`；M2 正常状态为 `running`。

`Staff` 必填：`id, name, role, employment, abilities, experience, potential, revealed_potential, traits, talent_type, weekly_salary, project_fee, joined_week, fatigue, morale, departure_warning, assignment_work_id, last_participation, works_history, temporary_contract`。

- 六维能力键固定，顺序为 `planning / direction / drawing / animation / management / postproduction`。
- `core ⇒ weekly_salary>0 ∧ project_fee=0 ∧ temporary_contract=null`；`temporary ⇒ weekly_salary>0 ∧ project_fee>0 ∧ temporary_contract={work_id,started_week}`，且合同项目必须与当前归属一致。
- `assignment_work_id` 为 null 或指向 `producing` 项目；同周一名员工只归属一个项目。
- `last_participation = null | {work_id,item_id,week}`；无产出周清空。
- `works_history[] = {work_id,contribution,total_work}[]`；交付时按员工 id 排序写入快照并更新历史。
- `traits`、`joined_week`、`works_history` 不得在反序列化时静默补默认值。

### 2.2 Project / WorkItem / WorkPlan

`Project` 必填：`id, offer, mode, investment, channels, opened_week, deadline_week, extension, status, ip_id, committee_id, tv_service, common, episodes, plan, delivery`。

- `offer` 是立项时冻结的外部内容对象；`instantiate_work` 测试项目使用空对象。
- `mode ∈ {contract,committee}`；M2 不含原创模式。
- `investment` 固定为 `{percent,principal,total}`；contract 三项均为 0，committee 的 percent 为 10–100，principal 为公司投入本金，total 为制作费两倍的项目资金池。
- `extension` 固定为 `{used,weeks}`；M2 未授权延期命令，初始均为 0。
- `channels` 继承企划基线；M2 不实现电视服务购买。
- `status ∈ {producing,delivered,aborted}`；交付/中止后保留记录，便于 Finance、事件和审计引用。委员会项目的元数据状态随之为 active（producing）或 closed（终态）。
- `delivery = null | DeliveryRecord`；字段固定为 `delivered_week,on_time,forced,quality,staff_snapshot,production_cost,commercial_entries,commercial_income,profit,archive_id`。
- `episodes` 每集恰有六个固定有序阶段：`content_design / storyboard_key_animation / animation / art_visual / photography_editing / sound_delivery`。

`WorkItem` 必填：`id,key,ability,work_total,work_done,deliver_at,deps,is_gate,quality,contributors`。`unlocked / delivered / complete` 是派生结果，不存字段；`0≤work_done≤work_total`，`deliver_at∈[1,1000]`。

`WorkPlan` 必填：`intensity,focus,outsourcing,overtime,target`。`set_work_plan` 的 `plan` 必须是对象且只允许这五个字段；未知字段、错误类型和部分更新均返回 `INVALID_INPUT`。`target` 为 null，或仅含字符串字段 `kind,id` 的对象；缺字段、额外字段和错误类型同样拒绝，显式 null 才会清除既有目标。

| 字段 | 枚举 |
| --- | --- |
| intensity | `low / standard / high` |
| focus | `quality / schedule / cost` |
| outsourcing | `none / gap_fill / aggressive` |
| overtime | `off / conditional`（字符串，不是布尔） |
| target | null 或 `{kind: episode|stage,id}` |

### 2.3 ID 与快照

- 项目 id 形如 `work_01`；工作项 id 带项目前缀；Archive id 为 `archive.<work_id>`。
- 事件实例 id 为 `<event_id>@<work_id>@w<week>`，用于解决指定待处理实例。
- 流水 id 在账本内唯一；重复 id 拒绝。
- 实体、工作项、账本、事件和 Archive 的哈希/结算遍历按 id 排序，不依赖调用方数组顺序。
- Archive 快照保存 `id,work_id,title,mode,opened_week,delivered_week,deadline_week,on_time,quality,staff_snapshot,production_cost,commercial_income,profit`，不引用已释放的临时人员实体；每个 delivered 项目恰有一条匹配快照，aborted 项目不写 Archive。
- 交付/中止保留项目内 `contributors` 和历史贡献；临时员工实体退出不抹除快照或项目参与者记录。

### 2.4 确定性、磨合与蓝图边界

- 规范哈希只重排集合语义数组；`company.reputation_log`、固定顺序的 episode stages、事件效果队列等内容保持原顺序。
- 非监督人员的接手损失只看本周开始前的具体工作项进度和参与者，按 75% 折算并四舍五入；无产出不记参与者，也不产生损失。
- 监督人员 `last_participation=null` 或指向其他项目均视为切换；团队 90% 产能系数只在该监督当周实际获得非零产出时生效，不叠加个人工作项损失。
- 蓝图门槛项只能位于 `sound_delivery`；静态校验与运行时实例化都拒绝其他阶段的门槛。TV 常见集数 12–13 的越界只由静态校验器报警，不自行改变蓝图。
- 工作项、项目、员工、流水、事件与 Archive 的结算/哈希遍历按 id 排序；事件目标按 episode/item id 选择，正向工作量按 item id 顺序分配。

## 3. Finance 唯一写入契约

`Finance = {opening_funds,balance,entries,loans,solvency}`。

恒等式：`balance = opening_funds + Σ entries.amount`。

`LedgerEntry = {id,week,work_id,category,amount,counterparty,memo}`；`work_id` 可为 null，表示公司级费用。

| 类别 | 符号 | M2 写入场景 |
| --- | --- | --- |
| `contract_received` | + | 立项制作费；委员会本金另记，不混入制作费 |
| `commercial_share_received` | + | 主动交付的外部商业分账 |
| `success_reward_received` | + | 主动交付的外部成功奖励 |
| `financing_in` | + | 契约保留；M2 不实现融资命令 |
| `investment_paid` | - | 委员会立项本金 |
| `salary` | - | 核心员工周薪；已归属项目记到该项目，闲置核心记公司级（`work_id:null`） |
| `operations` | - | 公司周运营费 |
| `production` | - | 有人员的制作项目周制作费 |
| `temporary` | - | 临时人员周薪，归因到合同项目 |
| `events` | - | 已授权事件选项 `cost` |
| `penalty` | - | 主动交付结算输入中的扣罚 |
| `outsourcing / extension / development / distribution / loan_repayment / loan_interest` | - | 契约保留，M2 不产生 |

- 每笔流水只属一个类别；类别与金额正负号必须一致。
- 周费用先全额预检，再逐条写入；不足时整周失败。
- 事件不得通过 `funds` 效果直接写现金；任何非零 `funds` 效果返回 `NOT_IMPLEMENTED`。
- 项目流水是公司账本的归因视图，不是第二个现金池。
- `production_cost` 汇总归因到该项目的负向 `salary / production / temporary / events / outsourcing / extension / distribution` 流水；闲置工资和公司运营费不计入项目制作成本。存档时该值必须与项目流水重算结果一致。

## 4. Event 数据与仲裁契约

目录根对象固定为 `{schema_version:1,events:[...]}`，可选 `note`。卡片、trigger、option、effect、escalation 均拒绝未知字段；`expires_weeks=0` 时 `escalation` 必须为 null，有期限时升级效果与选项效果使用同一作用域校验。卡片必填字段与枚举见 [EVENT_CONTENT_GUIDE.md](EVENT_CONTENT_GUIDE.md)。

支持指标：`stage_quality / stage_progress_permille / max_fatigue / weeks_in_project / weeks_to_deadline / funds / morale`；比较符为 `< / <= / > / >=`。

`EventInstance` 必填：`instance_id,event_id,work_id,episode_id,stage_key,item_id,triggered_week,expires_week,status,option_ids,escalation`。M2 项目级事件使用空字符串表示无单集/项目内工作项引用。

`EventState = {pending:EventInstance[],last_event_week:null|int,per_work:object}`。`last_event_week` 是保留字段；实际限制按 `work_id + triggered_week` 判定。

仲裁顺序：

1. 每个 `producing` 项目独立评估；同项目同周最多触发一个。
2. 表现事件（`random_weight=0`）按 priority 升序、id 升序确定；优先于随机事件。
3. 随机事件仍须满足阶段、冷却和触发条件，再按权重抽样。
4. 不同项目可同周各触发一个；全部进入 `pending[]`，不覆盖、不合并。
5. `pending[]` 非空时 `advance_week` 返回 `INVALID_PHASE`；玩家可按任意顺序解决。
6. 解决只移除目标 `instance_id`；`once_per_project` 在事件触发时即写入该项目 `major_seen`，未解决或重复加载都不重复消耗。
7. 交付/中止不删除待处理实例；仍可针对保留的项目记录解决。

当前支持效果：即时 `fatigue / morale`、正向即时 `work_done`、延期 `stage/project quality`。`outsource / extension` 选项及任何非零 `funds` 效果返回 `NOT_IMPLEMENTED`，状态不变。

## 5. SaveRecord 与恢复

```json
{
  "version": 4,
  "saved_at": "2026-11-25T12:34:56Z",
  "rules_version": "2026-11-25",
  "state": {}
}
```

- 四个信封字段固定；未知/缺失字段或错误类型返回 `SAVE_CORRUPT`。
- v1/v2/v3/未来版本返回 `SAVE_VERSION_UNSUPPORTED`，不迁移、不覆盖原档。
- 同版本但状态违反不变式返回 `SAVE_CORRUPT`。
- `rules_version` 不同仍可加载，返回 `rules_mismatch:true`。
- seed 已存在于状态，加载不推进周、不结算、不改变未来随机序列。
- `saved_at` 只用于展示；核心默认使用固定 UTC 值，避免纯函数读取宿主时钟。

## 6. 命令接口矩阵

所有接口收发 JSON 字符串；成功含 `state`，失败含 `error:{code,message}`。

| 命令 | 输入（除 state 外） | 成功附加 | M2 状态 |
| --- | --- | --- | --- |
| `initialize_game` | `seed,company_name?` | `state` | 已实现 |
| `start_work` | `offer_id,mode,percent,committee_partner_ids,blueprint` | `state,work_id` | 已实现；蓝图为外部内容依赖 |
| `set_work_plan` | `work_id,plan` | `state` | 已实现 |
| `assign_staff` | `staff_id,work_id\|null` | `state` | 已实现 |
| `advance_week` | `event_catalog?` | `state,report` | 已实现；报告含 `forced_deliveries[]` |
| `deliver_work` | `work_id,settlement?` | `state,archive_id` | 已实现；商业结算为 M5 前外部输入 |
| `abort_work` | `work_id` | `state` | 已实现 |
| `resolve_event` | `event_id=<instance_id>,option_id,catalog` | `state` | 已实现授权子集 |
| `save_game` | `saved_at?,rules_version?` | `save` | 已实现 |
| `load_game` | `save` | `state,rules_version,rules_mismatch` | 已实现 |
| `hash_state` | — | `hash` | 诊断接口 |

`initialize / instantiate_work / set_plan` 仅为内部测试入口，客户端不得当作玩家命令。未列入本表的 M0 命令在 M2 不导出、不宣称已实现。

## 7. 端到端验收映射

可执行入口：`scripts/v4.test.mjs`；内容入口：`npm run validate:events`。2026-11-26 本地 v4 WASM 套件 69/69 通过，含真实 12 集自然制作；代码尚未提交/集成，该结果不等于远端 Issue 或完整 M2 里程碑已验收。

| 验收面 | 证据 |
| --- | --- |
| 正式立项与企划消费 | `M2 start_work` 两条测试 |
| 财务分类、符号、恒等式、引用、唯一 id | `Finance：类别正负号…` |
| 多项目事件、数组保留、逆序解决、推进阻塞 | `事件：不同项目同周…` |
| 未授权现金效果原子拒绝 | `事件：正负 funds、外包、延期与倒扣工作量…` |
| 事件目录加载、指标、非法输入 | `事件运行时加载…` |
| 存档 round-trip、版本/损坏、RNG 复现 | `v4 save/load` 两条测试 |
| 主动交付、Archive、人员历史、临时人员清理、委员会关闭 | `M2 deliver_work…`、`M2 委员会…` |
| 截止强制交付、按时/延期、只结算一次 | `M2 截止周强制交付…` |
| 中止清理与事件保留 | `M2 abort_work…`、`交付与中止不静默丢弃…` |
| 必填字段、枚举、未知结算字段 | `M2 严格输入…`、`M2 结算输入…` |
| 工资归因、制作成本、整周原子性 | `Finance：归属核心工资…`、`Finance：多项目费用不足…` |
| 严格状态、Archive 一致性、存档信封 | `v4 状态不变式…`、`v4 存档信封…` |
| 真实 12 集自然制作、存档续跑、提前交付 | `M2 端到端…` |
| 非法状态先于命令守卫拒绝、计划严格输入 | `命令边界…`、`set_work_plan…` |
| 集合哈希规范化与事件工作量分配确定性 | `规范哈希…`、`事件：目标选择…` |
| 磨合 HO-01–HO-12、首次监督、1 点取整 | `磨合 HO-*`、`磨合边界…` |
| 蓝图门槛位置与 TV 集数警告边界 | `蓝图静态校验…`、`start_work：蓝图身份…` |

## 8. 明确未决与后续边界

- 截止强制交付会停止生产、写 Archive、记录 `forced` 与 `on_time`；未达标扣罚系数尚未标定，M2 不自行发明金额。主动交付可由外部 `settlement.penalty` 提供扣罚。
- 任何非零事件 `funds` 均未获得统一财务授权；runtime 对正向和负向效果统一返回 `NOT_IMPLEMENTED`，不得改名混入其他收入或支出。
- 完整商业评价、热度、渠道分账和排名属于 M5；M2 只接受显式结算输入。
- 完整供应商、外包、招募、危机和委员会经营属于后续里程碑；JSON 占位字段不等于这些系统已实现。
- 远端 Issue 关闭、提交和推送不属于本地实现验收；需另行授权。
