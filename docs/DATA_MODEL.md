# 统一数据结构：V3 历史契约、M1 部分实现与 V2 历史模型

> 当前目标领域模型见 [DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)，现行产品决策见 [DECISION_LOG.md](DECISION_LOG.md)。本文 V3 数据结构仍表达旧单项目/五阶段运行时契约，不是新架构的数据模型；新架构需重建 Company/Project、多项目、项目公共制作与单集六阶段工作项模型。

## V3.1 M0 交付边界

2026-11-21，针对议题 #2 冻结目标契约。用户已要求按差距审查建议完成 M0；下列时序与记账口径作为后续实现依据，数值平衡仍待定。可编译类型与边界校验在 [gameV3.ts](../apps/web/src/types/gameV3.ts)，静态跨端样本在 [fixtures.ts](../apps/web/src/test/fixtures.ts) 的 `v3*` 函数。它们不是规则模拟器，也不声称 C++ 已返回 v3。

版本状态：V2 是旧版纵向切片；V3 是当前运行时/历史契约，包含单项目和五阶段结构。M1 已在 C++/WASM 实现部分 V3 周制、五阶段与公司终局行为。它不等于当前目标玩法；目标结构见 DOMAIN_ARCHITECTURE 与 DECISION_LOG。

## V3.2 字段纪律与所有权

- V3 基础契约字段均必填；仅 `resolve_event.configuration` 为可选请求字段。M2 扩展状态字段的可选范围以 V3.6、V3.7 明确列出的字段清单为准，除此之外不得自行省略字段。null 是明确的无值，不允许省略或用空字符串代替。数组可空的例外按下表说明。
- 字段使用 snake_case，只有存档外层 savedAt 保留现名。规则字段由 C++ 产生、变更并整体返回；TS 只提交动作、校验、展示和保存。未提交的配置草稿只属于 UI。
- 数值均为 JS 安全整数。金额单位日元，默认非负；profit/net_cash_change/回执增量可负。只有 bankrupt 的 closing/ended 状态允许公司 funds 为负，表示强制结算赔付缺口，不增加借贷系统。opening_funds 非负。
- 能力、潜力、质量、疲劳、士气、压力、受众基础、商业潜力/评分、可靠性为 0–100。经验、工作量、费用、声望非负；阶段总工作量、供应商容量/速度、工期必须正数。概率用 0–1000 千分比，投资用整数百分数。
- week 是**已经完成的周数**，开局 0、上限 520；第一次推进结算第 1 周。start_week 为接约时已完成周数，deadline_week=start_week+duration_weeks。截止周可生产一次；项目期限可越过 520，但公司到 520 必须停止。
- seed 是 uint32 当前随机状态。TS 保存并传入，核心按固定算法与稳定遍历顺序更新。初始化/企划生成/有随机结果的动作可消费种子；失败请求不能消费。不能沿用 v2 的“只有日结抽一次”，不承诺跨版本相同轨迹。
- ID 为非空字符串且列表内唯一。企划 ID 表示一次机会/作品，不是重复使用的模板 ID。previous_work_id 为 null 或更早历史作品 ID，禁止自指、循环与未来引用。

## V3.3 完整模型清单

具体可编译定义见 gameV3.ts；下表补充单位、产生时机和关联约束。所有对象均由核心产生，不能将夹具接入生产作为替代核心。

| 对象 | 必填字段 | 产生时机与约束 |
| --- | --- | --- |
| GameState | version=3, seed, phase, company, offers, recruitment_pool, suppliers, project, pending_event, history, last_project_id, company_result, preview | 初始化建立全部字段；无项目/事件/最近结算/总结/预览时用 null。历史与外部资源池可空；running idle 恰有四企划；可选 custom_offer/pending_proposal 独立槽位不占市场四槽（V3.7） |
| Company | week, status, end_reason, initial_funds, funds, reputation, staff, finance；可选 scout_pity, reputation_log | status=running/closing/ended；仅 running 的理由为 null，其他为 time_limit/bankrupt/voluntary；核心名册可空，人数与能力不固定；初始化名册由核心生成；reputation 初始化 100、下限 0、不设数值上限、不随时间衰减；scout_pity={since_sr,since_ssr} 非负整数保底计数，缺省按 0/0 |
| Finance | contract_received, investment_paid, commercial_share_received, costs；可选 success_reward_received | 均为非负实际累计收支；success_reward_received 为委托方支付的承制成功奖励，缺省按 0 兼容旧状态，委员会项目为 0；投资不再计入成本。公司层全生命周期、项目层项目区间，同一笔交易的两个汇总视图，不重复改变现金 |
| Costs | salary, operations, production, temporary, outsourcing, events, extension, penalty；可选 development, distribution | 八类均出现，无支出填 0；依次为核心工资、固定运营、阶段直接费用、临时合同、外包、独立付费事件、延期费、扣罚。同一笔只归一类。M2 可选 development（前期开发费）与 distribution（付费播出发行支出），核心落地前缺省按 0，见 V3.7 |
| Staff | id, name, role, employment, abilities, experience, potential, revealed_potential, talent_type, clues, traits, weekly_salary, project_fee, fatigue, morale, departure_warning | employment=core/temporary；核心 project_fee=0，临时 weekly_salary=0。前三个能力对象含六项数值，revealed_potential 含六个布尔值；潜力不低于当前能力，线索 1–2 条，traits 可空；warning 仅预警 |
| ProjectOffer | id, name, source, scale, contract_budget, duration_weeks, target_quality, audience_base, commercial_potential, risk, allowed_modes, workloads, previous_work_id；可选 origin, style, min_reputation, committee_members, channel_potentials, required_works | source=manga/light_novel/game/original；scale=ova/short/tv/movie；risk=low/medium/high；普通企划 allowed_modes 固定包含 contract/committee，原创仅 committee；workloads 含五阶段正数；contract_budget 是合同预算且就是制作预算，按企划规模与报价规则生成；合作模式选定后才确定投资规模：仅 start_project 选择 committee 时在 Project 上生成 total_investment=contract_budget×2；contract 模式不生成投资规模。origin=market/custom/incoming/proposal（缺省 market）；style=normal/meme/ai（缺省 normal），非 normal 必须 origin=custom，meme 限定 scale=short；min_reputation 非负整数（缺省 0），声望不足仍展示但锁定；可选 committee_members（拟定委员会阵容，仅 allowed_modes 含 committee）、channel_potentials（{bd 必填 0–100，其余渠道可选}）、required_works（{rating, source?} 非空全满足）见 V3.7 |
| Project | offer, mode, investment_percent, opening_funds, start_week, deadline_week, current_stage, stages, extension_count, committee_pressure, finance, temporary_staff, outsourcing, delivery_reason；可选 total_investment, committee, tv_service | 接约原子建立，offer 保存原报价；opening_funds 在投资/制作预算入账之前记录；仅选择 committee 后在 Project 上生成 total_investment=offer.contract_budget×2，contract 模式不生成；实付本金只在 finance.investment_paid；临时人员属于当前项目。committee 为立项固定的委员会成员/渠道快照（成员结构为 {id,name,channel}，一个成员对应一个渠道，不含成员投资比例；仅委员会模式可有成员，承制为 null，制作中不追加更换）；委员会投资比例按 0.1（10 个百分点）调整，开工后锁定；tv_service={purchased_week,cost} 每项目至多一次，见 V3.7/V3.8 |
| StageConfiguration | assignments, policy, overtime | assignments 每项 staff_id/role/focus，人员不重复；未安排者休整。policy=quality/balanced/deadline；overtime 为整个阶段方案，不逐周清除。是否允许无员工而仅用外包由核心按有效产能校验 |
| StageState | status, work_done, quality, configuration, recommended_configuration, result | status=pending/ready/active/completed；pending/ready 无提交配置与结果且 work_done=0；active 配置非空；completed 结果非空且工作量完成。推荐配置可 null，不等于已提交 |
| StageResult | weeks_spent, quality, costs, issues, team | 阶段结束产生；issues 为遗留问题文案。costs 仅归属分析，不能再次扣款或重复累加到项目成本 |
| TeamSnapshot | staff_id, name, role, employment, abilities | 制作当时的岗位与能力快照；历史不要求该临时人员仍在名册 |
| Supplier | id, name, specialties, capacity, quality, speed, unit_price, reliability, unlocked | 固定池；specialties 非空不重复；capacity 为工作量，speed 为工作量/周，unit_price 为每单位工作量报价。解锁不回退；可靠性可在 UI 隐藏 |
| OutsourceTask | id, supplier_id, stage, ability, work_total, work_done, mode, fee_paid, due_week, status | mode=normal/emergency；status=active/delivered/failed；交付时 work_done=work_total。费用按核心报价确认时一次支付，fee_paid 是快照，不是第二笔支出 |
| GameEvent | id, category, stage, title, description, trigger, options | category=personnel/quality/budget/schedule；trigger={metric,value,threshold} 说明状态原因。option={id,label,cost,allows_reconfigure,disabled_reason}；disabled_reason 为 null 或拒绝文案。实际效果按核心目录执行，不接收自造 effect |
| WorkRecord | id, name, source, scale, previous_work_id, mode, investment_percent, start_week, end_week, end_reason, quality_score, commercial_score, commercial_revenue, finance, profit, team, stages；可选 origin, style, rating, channel_breakdown, commercial_rank | 结算只追加一次；end_reason=completed/deadline/company_closed；commercial_revenue 为作品总商业收入，不是公司所得；公司渠道所得只记 finance.commercial_share_received；委托方另付的承制成功奖励记 finance.success_reward_received，不计入作品商业收入或 channel_breakdown。五阶段及团队永久快照。origin/style 从报价继承，交叉约束与 ProjectOffer 相同。rating 为作品评价 S/A/B/C/D（固定分数线，与制作质量 quality_score 分列）；channel_breakdown 分渠道对账：Σrevenue=commercial_revenue、Σcompany_received=commercial_share_received 且恒含 bd，见 V3.7。commercial_rank 为本轮玩家作品与实际生成竞争作品按商业收入统一排名后的正整数名次；只保存玩家作品自己的名次，不保存完整榜单或竞争作品历史。未参与排名的特殊作品及缺少该字段的旧存档可为空。正常参与排名的玩家作品即使未进入前一半，也记录名次并正常结算收入。前一半数量按 ceil(N/2) 向上取整，见 GAME_RULES V3.13 |
| CompanyResult | reason, weeks, final_funds, net_cash_change, total_projects, best_work_id, rating | 关闭流程完成产生，best_work_id 为历史 ID 或 null；rating=renowned/stable/small/failed，评级阈值待定；总结不再次入账 |
| WeekPreview | next_week, costs, total_cost, event_probability_per_mille | 仅 running idle 或 active 制作阶段非空；待配置/事件/交付/结算/终局为 null；费用与风险只能使用核心预览 |
| WeekReport | week, funds_delta, costs, stage_deltas, staff_deltas, messages | stage_deltas={stage,work_done_delta,quality_delta}；staff_deltas={staff_id,experience,fatigue_delta,morale_delta}；预检破产未完成周，week 不变、增量为 0；回执不作为请求状态 |

岗位：director/scriptwriter/animation_director/key_animator/animator/production_manager/postproduction。专业：planning/direction/drawing/animation/management/postproduction。阶段：script/storyboard/key_animation/animation_check/postproduction。三者独立，不相互代用。talent_type=specialist/uneven/generalist/ordinary。临时人员复用 Staff 形状，但不积累培养经验；UI 只显示 clues 与已揭示潜力，不直接显示隐藏字段。

## V3.4 关联不变量

1. 核心、当前临时、招聘池人员 ID 不重复；招募从池移出，临时人员结算后释放，后续可按招聘规则重新出现。当前配置和推荐引用可用人员；已完成阶段及历史的已提交配置按实际团队快照验证，未采纳的推荐不要求命中实际团队。
2. 至多一个项目；offers 只在 running idle 存在。当前企划不得已在 history 中。running idle 恰有四企划，其中至少 2 个可立即承接（min_reputation 缺省 0，≤ 当前声望）；锁定项照常展示，不占满四个位置。custom_offer/pending_proposal 为独立槽位：ID 与市场、历史互斥，提案只在 running idle 出现，企划开工或提案离开槽位后原槽必须清空，公司非 running 时两槽均为 null。
3. current_stage 指向首个未完成阶段；之前 completed、之后 pending；全部完成为 null。阶段不并行，完成后下一阶段 ready，重新确认配置才能推进。
4. contract：investment_percent=0、investment_paid=0、commercial_share_received=0、extension_count=0、committee_pressure=null。committee：整数投资 10–100、压力 0–100、延期次数 0–1。超支不改变投资比例，压力与声望分开。
5. history 只追加；project_settled 的 last_project_id 必须命中 history，return_to_market 后清空；终局可保留最后作品 ID。
6. closing 已锁定经营，只允许待交付项目结算和经营总结。company_ended 无项目/事件/报价/预览；总结与公司原因、周数、资金和历史数量相符。
7. running 必须 week<520；负资金只能属于 bankrupt 的 closing/ended。结算不能解除关闭状态。
8. TS 校验协议、范围与关联，不重写制作预算比例、本金、产能或利润公式；规则断言由核心负责，M0 手算只出现在测试样例。

## V3.5 存档与集成切换

存档信封 `SaveRecord={version:3,savedAt:string,state:GameState}`，savedAt 为有效日期字符串。IndexedDB 名称、schema=1、saves/current 不变，记录版本不是数据库版本。

[saveGame.ts](../apps/web/src/services/saveGame.ts) 导出 `decodeV3SaveRecord`、`loadGame(): Promise<GameState | null>` 与 `saveGame(state, overwrite = false): Promise<'saved' | 'occupied'>`；v2 读写入口已移除，页面与 store 只处理 v3。v1/v2 记录拒绝并提示「v2 存档不兼容周制经营 v3，请新开游戏；旧存档未被覆盖。」，损坏与未知版本报错，两类失败都不迁移、不删除、不覆盖，也不改动当前会话。history、成长、阶段配置、事件、关闭原因和 company_result 都在 state 中随核心返回的状态一起保存；report、result 面板与 UI 草稿不保存，因此恢复 `project_settled`/`company_ended` 后不重建上一部作品的结算展示。

单槽覆盖需要明确确认：`saveGame` 在同一个读写事务内先 `get('current')` 再决定是否 `put`，槽位已被占用且未带 `overwrite = true` 时中止事务返回 `occupied`，不存在「先查后写」竞态或部分写入。store 把冲突转成工作台确认入口（`saveConflict`、`确认覆盖本地存档` / `取消覆盖`），玩家确认后才以 `overwrite` 重试；busy 期间、玩家转向其他动作、返回首页或读取存档都会让这条确认失效。新游戏、推进和结算都不自动写档。v1/v2 记录即使内容不可读也继续占用单槽，未经确认不会被新游戏覆盖。

恢复后的运行由核心判定：存档原样携带 seed，前端不重建、不补齐、不重算任何业务字段；恢复后继续推进与不中断运行逐字段一致，浏览器用例「读取检查点存档后继续推进」以真实 WASM 与真实 IndexedDB 验证这一点。核心侧新增而 TS 契约尚未收录的字段由存档原样透传，其契约与校验由对应核心任务同提交。

## V3.6 M2 契约扩展（2026-11-22 负责人批准）

来源：#6 企划三来源与 style 提案、#7 抽卡招募与抽象梗彩蛋提案、#1 负责人 2026-11-21 对 min_reputation 的批准。契约由契约负责人统一提交；规则行为由 #6/#7 模块负责人实现，本文不声称 C++ 已实现。

**已落地字段（gameV3.ts 与守卫同步）：**

| 字段 | 位置 | 形状与缺省 | 约束 |
| --- | --- | --- | --- |
| origin | ProjectOffer / WorkRecord | 'market'\|'custom'\|'incoming'\|'proposal'，缺省 market | 展示与生成来源标记；proposal 对应员工提案（#6 负责人 2026-11-22 确认口径），不占市场四槽 |
| style | ProjectOffer / WorkRecord | 'normal'\|'meme'\|'ai'，缺省 normal | 非 normal 必须 origin=custom；meme 限定 scale=short；市场/上门/提案报价恒 normal |
| min_reputation | ProjectOffer | 非负整数，缺省 0 | 声望不足仍展示并锁定；running idle 至少 2 个报价 min_reputation≤声望（守卫强制，执行 #1 决策 1） |
| scout_pity | Company | {since_sr,since_ssr} 非负整数，缺省 0/0 | 抽卡保底计数，随存档持久，终局不重置；普池与定向池共享 |
| reputation_log | Company | {week, reason, delta, reputation_after}[] 追加式，缺省无历史 | 声望唯一写入点入账：delta 是钳到 0 之后实际生效的变化的非零值，reason 为稳定 ID 字符串；末笔 reputation_after 必须等于当前声望，逐笔前后值衔接、周次不回退。2026-11-23 #4 负责人批准的声望基础机制已在 C++ 与两端守卫落地，缺席的旧 v3 存档仍合法、不迁移 |
| scout / targeted_scout | Decision | scout 无参数；targeted_scout 的 role 与 focus_ability 二选一 | 仅 running idle 或 project_settled（与 hire_core 同经营窗口）；费用、稀有度阈值、保底次数进 game_rules.hpp，不在契约 |

**可选字段纪律（修订 V3.2「均必填」）：** 上表字段在 #6/#7 核心实现落地前可选，缺省按表内语义解释。理由：契约先行冻结目标形状，M1 核心输出与既有 v3 存档必须保持合法，不引入存档迁移。核心实现落地后应统一输出这些字段；守卫对存在值执行完整校验。除此之外不得自行新增可选状态字段；V3.7 的第二批字段为负责人 2026-11-22 裁定的已批准扩展，沿用同一纪律。

表内 `reputation_log` 的核心实现已于 2026-11-23 落地：`initialize_game` 输出空数组，此后只在声望发生实际变化的结算节点追加，字段写法只有缺席与数组两种，null 不合法（与 `scout_pity` 同一口径）；表内其余字段仍按上述纪律保持可选。

**暂缓与待决（已由 V3.7 处置）：** 本节的 create_custom_offer 决策、员工提案采纳/拒绝、自定/提案企划的状态存放与生命周期、前期开发费用 ledger 归属、成绩类解锁字段与 09:16 渠道框架对分成语义的修订，负责人 2026-11-22 裁定「全部按新口径」，已在 V3.7 落地为可选契约字段，规则口径见 GAME_RULES V3.8。仍待定的是全部数值平衡与 #6/#7/#8 核心行为。

## V3.7 M2 契约扩展第二批：企划槽位、委员会渠道与成绩解锁（2026-11-22 负责人裁定落地）

来源：负责人 08:05/08:11（自定企划与员工提案）、08:51（评价框架）、09:16（商业渠道框架）确认口径，取代 M0 冻结草案中的冲突假设（裁定详情见 GAME_RULES V3.8）。字段形状与交叉校验在 gameV3.ts；沿用 V3.6 可选字段纪律：核心落地前可选、缺省按旧语义解释，M1 核心输出与既有 v3 存档保持合法，不做存档迁移。

| 字段 | 位置 | 形状与缺省 | 约束与行为归属 |
| --- | --- | --- | --- |
| custom_offer | GameState | ProjectOffer 或 null；缺省无槽 | 玩家自定企划槽，origin 必须 custom；不占市场四槽；开工后随项目消费，不得残留（ID 命中 history 即非法） |
| pending_proposal | GameState | ProjectOffer 或 null；缺省无槽 | 员工提案槽，origin 必须 proposal、source 必须 original；仅 running idle 出现，推进周未采纳即消失；reject_proposal 无惩罚 |
| create_custom_offer | Decision | name, source, scale, 可选 style | 仅 running idle；生成 custom_offer 并支付固定前期开发费（costs.development）；首版限原创与少数核心方向、企划能力资格由 #6 核心校验 |
| adopt_proposal / reject_proposal | Decision | 无参数 | 仅 idle 且存在提案；采纳转入 custom_offer 后走同一 start_project，未采纳提案不可直接开工；拒绝清空 |
| discard_custom_offer | Decision | 无参数 | 仅 idle 且存在自定企划；不退款 |
| buy_tv_service | Decision | 无参数 | 仅委员会模式在制项目且未购买；支付 costs.distribution，写入 project.tv_service |
| development / distribution | Costs | 非负整数，可选，缺省 0 | 前期开发费与付费播出发行支出；独立于投资本金、不参与分成；冻结八类不删不改 |
| committee_members | ProjectOffer | {id, name, channel}[]，可选 | 拟定委员会阵容；仅 allowed_modes 含 committee 的报价可携带；一个成员对应一个渠道，channel 限 publisher/toy/music/tv_broadcast，bd 为基础渠道不挂成员；成员加入即开放对应渠道；不记录成员投资比例，渠道开放不由玩家投资比例或投资金额推导 |
| committee | Project | {id, name, channel}[] 或 null；缺省未输出 | 立项时固定委员会成员/渠道快照；一个成员对应一个渠道，不含 share_percent；承制必须 null；制作中不追加更换 |
| tv_service | Project | {purchased_week, cost 正整数} 或 null | 每项目至多一次电视播出服务购买 |
| channel_potentials | ProjectOffer | {bd 必填 0–100；其余渠道可选 0–100} | 分渠道商业潜力按企划定位生成；股东未开通的渠道不展示 |
| required_works | ProjectOffer | {rating S/A/B/C/D, 可选 source} 非空不重复数组 | 成绩类 IP 上门解锁条件，须全部满足；与 min_reputation 并存，未满足仍展示并锁定 |
| rating | WorkRecord | S/A/B/C/D，可选 | 作品评价等级（固定分数线，数值 TODO）；与制作质量 quality_score 分列 |
| channel_breakdown | WorkRecord | {channel, revenue, company_received}[]，可选 | 分渠道对账：Σrevenue=commercial_revenue、Σcompany_received=commercial_share_received、恒含 bd、company_received≤revenue |

分账新口径：company_received 由「BD 毛收入初始 50% 归公司（另 50% 为综合成本，独立于投资比例）+ 委员会项目非 BD 渠道按玩家投资比例」构成。BD 比例可按产业调查与数值平衡调整，但成本比例必须大于 0；承制项目不参与非 BD 渠道分成。V3.3 的 commercial_share_received=floor(revenue×percent/100) 单渠道公式被该框架取代。承制成功奖励由委托方另付并记入可选 finance.success_reward_received，缺省为 0。渠道收入在制作完成后随 calculate_result 统一结算。爆款 ×5 作用于分账前渠道毛收入（判定归 #7）。续作继承商业基础沿用 previous_work_id，属规则数值，无新增契约字段。


## V3.8 合作模式与渠道规则补充（2026-11-23）

> 本节部分投资亏损与委员会成员字段口径已由后续 V3.9 修订覆盖；当前有效契约以文末 V3.9 为准。

- 所有普通企划均提供承制与制作委员会两种合作方式；原创企划只能委员会。ProjectOffer.allowed_modes 必须体现这一规则，不允许普通企划仅提供承制。
- Project.mode 与 investment_percent 在 start_project 时确定，开工后锁定。委员会投资比例按 0.1（10 个百分点）为最小调整单位，现行范围 10–100%；其他投资方承担剩余投资份额。
- contract 的 investment_percent=0；committee 的 investment_percent 为 10–100 的 10 倍数。该范围与步长应由核心校验，TypeScript 仅做协议校验，不重算投资金额。
- 公司同一时间最多一个在制项目，不支持多开；委员会模式必须由公司实际参与制作，不支持纯投资。
- 承制与委员会共用同一制作能力、人员、资源和制作流程。投资比例不改变制作责任/工作量、作品质量上限或项目决策权；两种模式在相同制作条件下具有相同质量上限。
- 委员会投资本金亏损上限为公司实际投入的全部投资额；制作经营费用另行核算，可能使项目净收益或公司经营结果为负，不受投资本金上限保护。
- 渠道规则：IP 上门企划自带成熟渠道；普通企划至少自带一个渠道；原创企划需要自行寻找渠道。所有企划都可选择委员会模式；只有委员会模式可通过拉入委员会成员额外开放渠道，承制模式不拉入委员会成员。
- 委员会投资玩法包含玩家投资比例控制和拉入成员开放渠道两个操作维度。一个成员对应一个渠道，成员加入即开放；渠道开放与投资比例、投资金额没有数值绑定关系。其他投资方共同补足公司未承担的剩余投资份额。
- 委员会非 BD 渠道收益按玩家投资比例分配，不记录每个渠道的独立分配比例或其他成员细分投资份额。BD 在承制与委员会模式下统一按初始50%公司收入、50%综合成本分配。
- 当前 committee_members 目标结构为 {id,name,channel}，一个成员对应一个渠道。若现有 TypeScript/C++ 字段仍采用旧结构，须由 #6 提交契约同步与实现方案；本节不宣称代码已支持。


---

## V2 历史模型（下文仅作迁移对照）

以下是旧版六接口与 schema 2 的历史记录，不可用来规划新规则；旧数值与经济缺陷描述保留，避免把目标契约误称为已实现。当前 C++/WASM 已实现部分 V3 核心行为，V2 类型与接口仅用于理解迁移来源，不代表当前运行版本。

## 0. 概念纪律（本文档的核心）

**一个概念只有一个名字、一种类型、一个单位、一处存储。** 员工系统、制作系统、事件系统、结算系统、C++、TypeScript、存档，全部引用同一张概念表，禁止同义词。

- 新增字段前先查概念表；表里没有的概念先评审入表，再写代码。
- 禁止同义词：`stamina` / 体力 / 精力（统一为 `morale` 士气）、`cash` / `gold` / `money`（金额只用第 1 节的字段）、`完成度` / `品质`（统一为 `progress` / `quality`）。
- 游戏协议字段一律 snake_case，C++ JSON、TS 接口、请求响应和存档内的 GameState 同名，不做命名转换层。唯一独立例外是存档外层元数据 `savedAt`，保持既有名称。
- 业务枚举值使用小写英文字符串；评级沿用 `S` / `A` / `B` / `C` / `D`。UI 映射枚举中文名；员工、企划和事件的显示文案随核心目录下发，不参与数值计算。
- 单一事实源：GameState 只存业务状态，不再存一份总进度或利润。结算推导值由 C++ 计算并随 result 下发，前端不自行实现规则。当前响应没有独立的剩余天数或总进度字段，不应宣称核心已下发这些字段。

## 1. 基础概念表

### 标识与时间

| 概念 | 唯一名字 | 类型与单位 | 范围 | 规则 |
| --- | --- | --- | --- | --- |
| 实体 ID | `id` | string | 目录定义的 snake_case ID | `staff_01`、`proj_tv_01`、`evt_001`、`opt_a`；不用数字 ID |
| 当前日 | `day` | integer，游戏日 | 1–9007199254740991 | 公司时间全局连续，跨企划不重置 |
| 开工日 | `start_day` | integer，绝对日 | 1–day | 接手企划时记录 |
| 截止日 | `deadline_day` | integer，绝对日 | ≥ start_day，安全整数 | 截止日当天日结后仍未完成即强制交付；事件延期增加此值 |
| 工期 | `duration_days` | integer，天 | > 0 | 仅报价字段；开工时换算 `deadline_day = day + duration_days - 1` |

### 金额

金额单位统一为日元。`funds`、`budget`、`spent`、`revenue`、`cost` 为 0–9007199254740991 整数；`profit` 及资金增量可为负，仍需为安全整数。

| 概念 | 唯一名字 | 含义 |
| --- | --- | --- |
| 公司资金 | `funds` | 唯一可支配资金池 |
| 企划拨款 | `budget` | 开工时一次性并入 funds；不是公司剩余资金 |
| 累计支出 | `spent` | 本企划工资、固定成本、加班、外包及付费事件的累计支出 |
| 商业收入 | `revenue` | C++ 结算计算，入账至 funds |
| 结算成本 | `cost` | result 中的 spent 快照，不在 GameState 重复存储 |
| 利润 | `profit` | result 推导值：revenue - spent，不含开工拨款；草案口径待团队复核 |

### 刻度与枚举

| 概念 | 唯一名字 | 类型 / 范围 | 存储与说明 |
| --- | --- | --- | --- |
| 进度 | `progress` | 0–100 整数 | 每工序一份；下游不得超过上游 |
| 质量 | `quality` | 0–100 整数 | 每工序一份；成品 `quality_score` 只在 result 中 |
| 士气 | `morale` | 0–100 整数 | 每员工一份，全系统唯一的人状态数值 |
| 技能 | `skill` | 0–100 整数 | 每员工一份，当前必须匹配固定目录，无成长 |
| 声望 | `reputation` | 非负安全整数 | 公司一份，电影接取门槛为 20 |
| 工序 | `stage` | `pre` / `mid` / `post` | 前期·分镜演出 / 中期·原画动画 / 后期·摄影合成 |
| 排班 | `assignment` | 工序取值或 `rest` | rest 为休息 |
| 方针 | `policy` | `rush` / `normal` / `polish` | 赶工 / 正常 / 精修 |
| 经营阶段 | `phase` | `idle` / `producing` / `event_pending` / `ended` | 空闲 / 制作 / 待事件选择 / 待结算 |
| 终局原因 | `end_reason` | `completed` / `deadline` / `bankrupt` | 完成 / 截止强制交付（违约） / 破产 |
| 随机种子 | `seed` | uint32，0–4294967295 | TS 持有，C++ 仅在实际完成日结时推进 |
| 规则系数 | — | integer 千分比（1000 = ×1） | 只存在于 C++ 参数头，不进状态，不与 0–100 刻度混用 |

## 2. 核心结构

以下 TS 用于说明协议形状，所有 number 字段实际受整数范围约束。C++ 当前使用 `nlohmann::json`（`Json`）状态模型和完整校验，并非已建立同名强类型状态 struct。

```ts
type Stage = 'pre' | 'mid' | 'post'
type EndReason = 'completed' | 'deadline' | 'bankrupt'

interface Staff {
  id: string
  name: string
  role: 'director' | 'key_animator' | 'animator' | 'photographer'
  skill: number
  morale: number
  assignment: Stage | 'rest'
  overtime: boolean          // 今天的计划；完成日结后清除
}

interface StageState {
  progress: number           // 0–100
  quality: number            // 0–100
  outsourced: boolean        // 今天的外包计划；完成日结后清除
}

interface Project {
  id: string
  name: string
  type: 'tv' | 'movie' | 'ova'
  budget: number
  spent: number
  start_day: number
  deadline_day: number
  target_quality: number
  policy: 'rush' | 'normal' | 'polish'
  stages: { pre: StageState; mid: StageState; post: StageState }
}

interface ProjectOffer {
  id: string
  name: string
  type: 'tv' | 'movie' | 'ova'
  budget: number
  duration_days: number
  target_quality: number
  min_reputation: number
}

interface EventEffect {
  funds?: number             // 有符号日元增量；支出须可支付并计入 spent
  deadline_days?: number     // 当前目录仅顺延截止日
  stage_quality?: { stage: Stage; delta: number }
  morale?: number            // 作用于全员；质量、士气应用后钳制到 0–100
}

interface GameEvent {
  id: string
  title: string
  description: string
  options: { id: string; label: string; effect: EventEffect }[]
}

interface DayReport {        // 只读反馈，不回流 GameState
  day: number               // 刚结算的日期，不是响应状态的下一日
  funds_delta: number
  stage_deltas: { stage: Stage; progress: number; quality: number }[]
  morale_delta: number      // 全员实际变化的平均值，整数除法向零截断
  rework: boolean
  message: string
}

interface ProjectResult {    // 只读反馈，不存入 GameState
  end_reason: EndReason
  quality_score: number
  revenue: number
  cost: number              // = project.spent
  profit: number            // = revenue - cost，可负，不含拨款
  reputation_delta: number  // 钳制声望后实际变化
  grade: 'S' | 'A' | 'B' | 'C' | 'D'
}

interface GameState {
  version: 2
  seed: number
  day: number
  funds: number
  reputation: number
  phase: 'idle' | 'producing' | 'event_pending' | 'ended'
  staff: Staff[]            // 固定且唯一的 4 人目录
  offers: ProjectOffer[]    // idle 时为相同 3 报价，其他阶段为空
  project: Project | null
  pending_event: GameEvent | null
  end_reason: EndReason | null
}
```

### 关联约束

- 每个带 state 的动作先严格验证完整模型，再检查阶段和决策；缺少必需字段、错误类型、越界或状态关联不一致均拒绝。
- staff 必须是固定 4 人且 ID 唯一，姓名、role、skill 匹配目录；`rest` 员工不得 `overtime: true`。
- `idle` 的 project、pending_event、end_reason 均为 null，offers 必须完整匹配固定 3 报价目录。锁定电影仍在列表内。
- 非 idle 必须有合法 project 且 offers 为空；企划 ID、名称、type、budget、target_quality 匹配报价目录；`post.progress ≤ mid.progress ≤ pre.progress`。
- `producing` / `event_pending` 必须未完成且 `day ≤ deadline_day`、end_reason 为 null。只有 event_pending 可携带事件，且其完整内容必须匹配固定 3 事件目录中的一项；不存在可自定义 effect 的接口。
- `ended` 的 pending_event 为 null，end_reason 非 null；completed 要求全部进度 100，deadline 要求未完成且已越过截止日。bankrupt 是费用不足的终局，不等于资金必须为 0。
- 当前事件模型不支持旧草案的进度效果字段。扩展目录或效果须先同步核心、类型、测试与协议。

## 3. 六接口契约

统一信封：除初始化外请求 `{ state, ...动作字段 }`，响应 `{ state, ...结果字段 }`。C++ 无全局会话，状态整体往返。错误格式为 `{ error: { code, message } }`，无可采用的新状态；完整错误分类见 API。

| 接口 | 请求 | 成功响应 | 要点 |
| --- | --- | --- | --- |
| `initialize_game` | `{ seed }` | `{ state }` | 唯一不带 state 的请求；公司、4 人、3 报价，idle / day 1 |
| `start_project` | `{ state, project_id }` | `{ state, message }` | 仅 idle；校验声望，拨款入账、清空 offers，转 producing |
| `apply_decision` | `{ state, decision }` | `{ state, message }` | 仅 producing；当天可多次调整，不扣款、不推进日期/seed |
| `advance_day` | `{ state }` | `{ state, report }` | 仅 producing；完整日结，可能转 event_pending 或 ended |
| `resolve_event` | `{ state, option_id }` | `{ state, message }` | 仅 event_pending；应用目录选项并清空事件，检查终局 |
| `calculate_result` | `{ state }` | `{ state, result }` | 仅 ended；收入/声望结算，清空企划，重供相同 3 报价，回 idle |

```ts
type Decision =
  | { type: 'assign'; staff_id: string; assignment: Stage | 'rest' }
  | { type: 'policy'; policy: 'rush' | 'normal' | 'polish' }
  | { type: 'outsource'; stage: Stage; enabled: boolean }
  | { type: 'overtime'; staff_id: string; enabled: boolean }
```

外包和加班都是可撤销的当天标记，不是立即扣款的操作。启用时若当日总费用不可承担则返回 `INSUFFICIENT_BUDGET`；日结才扣款、计入 spent、生效并清除标记。排班到 rest 会取消加班。`INVALID_PHASE` 已实现；六接口不是未实现占位。

## 4. 每日结算顺序与随机协议

精确公式与参数以 GAME_RULES 和源码为准，固定顺序为：

1. 计算固定成本、全员工资、加班与外包总费用；不足则直接返回 ended / bankrupt，不扣款、不推进日/seed、不执行后续步骤。
2. 扣款并增加 spent；按 pre → mid → post 计算工作量、流水线钳制后的进度和质量。
3. 新增进度且低质量的工序返工，再次钳制流水线并清除 outsourced。
4. 结算士气并清除 overtime；day 加 1。
5. 只推进一次 uint32 LCG：`s' = (s × 1664525 + 1013904223) mod 2^32`。
6. 若 `s' % 1000 < 150 + 50 × 当日加班人数`，事件候选取 `floor(s' / 1000) % 3`；不额外抽样。
7. 终局优先：全工序 100 为 completed，否则 day > deadline_day 为 deadline；终局丢弃当日事件候选。截止日当天日结后未完成即强制交付/违约结算。

非推进接口不消耗 seed；已完成日结的终局日仍推进一次。正常报告含三工序净变化；破产短路报告的 stage_deltas 为空、数值变化为 0。所有系数分步整数截断，不允许用前端浮点估算代替。

## 5. 存档 v2 与会话反馈

```ts
interface SaveRecord {
  version: 2
  savedAt: string
  state: GameState
}
```

数据库 `anime-production-committee` 的 DB schema 仍为 1，仓库 `saves`、键 `current` 不变。只有一个手动本地槽；record version 与 state.version 均为 2，不要把升级记录格式写成升级数据库 schema。

迁移策略：v1 是工程夹具——明确拒绝并提示新开游戏，无迁移、无静默转换、读取失败不覆盖当前会话。没有存档时返回 null。

只保存 GameState，不保存 DayReport / ProjectResult。报告和结算面板是会话反馈，重载后不恢复历史结果；calculate_result 已清空企划，不能从结算后的 idle 存档还原上一部作品。可以保存待处理事件或未结算终局，恢复后继续对应动作。

GameStore 的 `game` 初始为 null，新开必须等待真实 WASM 的 initialize_game；前端不构造初始游戏数据。`?seed=12345` 用于固定初始化 seed；读取存档采用其保存的 seed。

## 6. 数值来源与未完项

唯一数值入口为 [game_rules.hpp](../packages/game-core/include/game_rules.hpp)，现有初值、4 人名册、方针、费用、外包、返工、3 事件、3 报价、结算权重和评级线均已提供暂定值；完整表与公式集中在 GAME_RULES，不再列为全部待定。

尚需完成最终平衡、实测策略与时长、拨款/利润口径复核；招聘解雇、成长、复杂事件、市场和多企划并行不做。单槽本地存档没有旧版迁移，也没有历史结果持久化。

## 7. 跨层同步纪律

- C++：Json 解析与完整状态校验、纯规则和数值参数保持单一事实源；无需为了文档宣称而另造强类型状态结构体。
- TypeScript：同名字段与 v2 边界校验；store 整体采用 state，report/result 单独展示，不重算经营规则。
- 测试：C++ 覆盖钳制、整数与阶段边界；真实 WASM 覆盖六接口和同种子重放；前端覆盖空初态、错误保留、互斥和存档版本。原生测试、模拟服务测试与浏览器验证不能互相冒充。
- 协议变更按 CONTRIBUTING 流程同步 API、本文、实现、调用方与测试，明确旧存档策略；未运行验收不填写通过数量。


## V3.9 委员会投资与渠道契约修订（2026-11-23）

本节覆盖 V3.7/V3.8 中将委员会成员投资份额与渠道字段绑定的旧契约描述。

- 委员会投资系统有两个玩法维度：玩家控制自身投资比例，以及拉入委员会成员开放渠道。两者属于同一委员会投资玩法，但没有数值绑定关系。
- 玩家投资比例仍为 10%–100%，按 10 个百分点调整；其他成员共同补足剩余投资。状态只记录玩家投资比例和公司实际支付的投资本金，不记录其他成员各自的投资比例或投资金额。
- 委员会成员数据采用 `{id, name, channel}`；一个成员对应一个渠道，成员加入即开放该渠道。不得使用 `share_percent` 或多渠道数组表达成员投资份额/渠道细分比例。
- 渠道开放由企划自带条件和已加入的委员会成员决定，不由玩家投资比例或投资金额计算。BD 是所有企划自带的基础渠道，不挂接委员会成员。
- 非 BD 渠道公司所得统一按玩家投资比例分配；不维护每个渠道独立的投资比例或分账比例。
- BD 在承制和委员会模式下统一按毛收入初始 50% 计入公司收入、另 50% 计为综合成本；比例是可调整的平衡参数，成本比例不得为 0。
- contract_budget 就是制作预算，开工时并入公司统一现金池；委员会模式下 total_investment=contract_budget×2，承制模式不生成 total_investment。没有独立预算钱包；制作预算资金用完后继续使用公司现有现金支付制作费用。
- 制作经营亏损适用于承制与委员会；委员会投资本金亏损单独核算。强制制作费用无法支付时立即破产结算、游戏失败；不贷款、不追加投资。

字段结构调整属于目标契约修订，不代表当前 TypeScript/C++ 实现已经同步。#6 负责人需要据此提交对应实现/迁移方案；集成时同步 gameV3.ts、核心校验、API 和测试。

## V3.10 合同预算与委员会投资规模修订（2026-11-23，当前有效）

本节覆盖本文前文及 V3.9 中“制作预算=项目总投资50%”的旧字段生成规则。旧描述仅作历史记录，不再作为当前契约。

- ProjectOffer.contract_budget：必填，表示项目合同预算，同时就是制作预算。按企划规模和报价规则生成；不再从投资规模反推。
- Project.total_investment：仅在 start_project 选择 committee 模式后生成，值为 offer.contract_budget × 2；选择 contract 模式时该字段不生成/不适用。投资规模不属于未选择合作模式的 ProjectOffer。
- 所有普通企划的 allowed_modes 必须同时包含 contract 与 committee；原创企划仅包含 committee。企划来源与规模不能将普通企划排除在委员会模式之外。
- Project.investment_percent：承制为0；委员会为10–100且步长10。委员会公司投资额为 floor(total_investment × investment_percent / 100)。
- Project.committee：仅委员会模式可携带成员快照；承制必须为 null。只有委员会模式可以拉入成员开放额外渠道，一个成员对应一个渠道。
- offer.contract_budget 是制作预算，Project.total_investment 是委员会投资规模，两者属于不同实体和不同口径。制作预算开工时进入公司统一现金池；委员会投资本金单独支付并单独核算。
- BD 公司所得为毛收入的初始50%。可以通过“毛收入−50%综合成本”或“毛收入×0.5”实现，必须避免重复扣除；分渠道对账需分别保留毛收入与公司实际所得。

字段空值表达、条件字段校验及 allowed_modes 生成由 #6 同步 TypeScript/C++ 契约与测试；本文只冻结目标口径，不代表实现已经完成。


## V3.11 作品商业排名历史字段补充（2026-11-23）

- WorkRecord.commercial_rank 为可选正整数或 null/缺省字段。正常参与当轮商业排名的玩家作品记录其最终名次；未参与排名的特殊作品可为空，旧 v3 存档缺少该字段仍合法，不要求迁移。
- 只持久化玩家作品自己的名次，不持久化完整榜单、竞争作品列表或竞争作品展示详情；历史档案不能据此回顾完整榜单。
- 当轮实际参与排名的作品总数为 N，前一半入榜数量为 ceil(N / 2)。该取整只影响竞争作品展示详情生成，不影响玩家作品的收入结算。
- 名次只作历史成绩展示，不改变商业收入、分账、作品评价或声望。
