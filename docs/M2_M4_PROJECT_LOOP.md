# M2 项目全链路 + M4 商业结算（实现说明）

> 状态：**当前实现，未完成里程碑验收**。M2 主链路（立项 → 制作 → 正常/到期/中止结算 → 公司关闭 → Archive → 财务）与 M4 商业结算核心（委员会、投资、六窗口、分成、伙伴关系）已落地；M4-A 的 Partner/Committee 强契约、INV-13 生命周期与顺序无关哈希已接入。INV-27 监督岗位、§14.7 八阶段周结算与 INV-29 到期默认分支已接入。中止处罚/履历与终局 pending 默认分支已按 DEC-PROJECT-001 实现；事件升级载荷仍待独立工作树收尾，融资、M3 供应商/市场刷新仍是缺口。
> 契约依据：[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md) 命令 2/10/15/16/20/21/22、§7；[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md) §7.3.6/§9.3/§10.1/§10.3/§10.6；[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) M2/M4。

## 1. 已实现命令

| 命令 | 守卫 | 原子范围 |
| --- | --- | --- |
| `start_work(offer_id, mode, percent?, committee_partner_ids?)` | running ∧ 企划存在 ∧ 模式合法 ∧（普通企划：`min_reputation` + `required_works`；原创草稿：`draft_status=valid`）∧ 委员会比例 10..100/10 ∧ 成员渠道不重复 ∧ 现金 ≥ 应付款 | 冻结企划快照、实例化蓝图、成立委员会、合同预算与投资两笔账、消费企划/草稿 |
| `deliver_work(work_id)` | running ∧ producing ∧ 本项目无 pending 事件 ∧ 全部门槛项 delivered ∧ 未过截止 | 质量聚合 → 评级 → 六窗口结算 → 分账/BD 收入 → 委员会关闭/伙伴关系 → Archive → 清归属 → 移除项目 |
| `abort_work(work_id)` | running ∧ 项目 producing ∧ 未过截止 ∧ 本项目无 pending | 按权威进度完成承制退款/违约金或委员会沉没核销、声望重罚、Archive 履历、人员/外包释放；负余额结清其他项目 pending 后复用破产关闭 |
| `create_custom_offer(name, source, scale, style)` | running ∧ 草稿槽空闲 ∧ 基础声望 ≥ 占位阈值 ∧ 枚举合法 | 只创建原创草稿（`draft_status=valid`），不建 Project、不收全部投资资金；开发费暂记 0 |
| `adopt_proposal()` / `reject_proposal()` | running ∧ 存在提案（采纳还要求草稿槽空闲） | 提案转草稿或清空 |
| `buy_tv_service(work_id)` | 委员会模式 ∧ 无电视台成员 ∧ 未购买 ∧ 现金 ≥ 总费用×投资比例 | 记 `distribution` 支出；结算时对适用窗口应用 130% 电视倍率 |
| `request_extension(work_id)` | 委员会模式 ∧ 未用过 ∧ 未过截止 ∧ 现金 ≥ 25 万 | 截止周 +4、记延期费 |
| `end_company()` | running ∧ 无 pending 事件 | 锁 closing/voluntary；全部 producing 项目转 delivering、清归属；无项目时直接 ended |
| `finalize_delivery(work_id)` | closing ∧ 项目 delivering | 关闭路径交付结算；最后一个项目结清后公司转 ended |
| `finalize_company()` | ended ∧ 无在制项目 ∧ 结局未生成 | 由 Archive 生成 `company_result`，只执行一次 |

`advance_week` 内置两条自动路径（无需玩家确认）：项目到达 `deadline_week` 时按门槛完成度结算（达标 `completed`，未达标 `deadline`）；第 520 周完成当周结算后锁 `closing/time_limit`，剩余项目转 `delivering`。若破产或第 520 周关闭时仍有 pending，按 `(work_id,event_id)` 顺序执行冻结快照中的默认保守分支并移除对应 pending，再复用关闭/结清路径；自动分支成本按现金封顶，逐条成功后才移除 pending；非法配置在终局预演中原子失败且不误删事件。

通用：除 `initialize_game` 外全部“工作副本 + 一次提交”；失败不改变状态。

## 2. 企划与伙伴（M2 固定 fixture）

`initialize` 建立 3 名员工、3 个合作伙伴、4 个企划槽：

| 企划 | 题材 | 预算 | 工期 | 开放窗口（基线） | 可用模式 |
| --- | --- | --- | --- | --- | --- |
| offer_01 星海邮差 | sf | 120 万 | 26 周 | 国内配信、电视 | contract / committee |
| offer_02 雨夜食堂 | drama | 90 万 | 24 周 | 国内配信 | contract / committee |
| offer_03 机甲夏令营 | family | 150 万 | 30 周 | 国内配信、周边、电视 | committee |
| offer_04 无声的告白 | romance | 70 万 | 20 周 | 国内配信 | contract / committee |

伙伴：`partner_tv`（电视窗口）、`partner_stream`（国内配信）、`partner_pub`（出版社/IP 伙伴，不占商业窗口），关系初始 50，`status=known`。

> 这是 M2 允许的固定 fixture；M3 必须用市场刷新/竞争产生企划，并接入供应商目录，不得把 fixture 当成玩法来源。

## 3. 蓝图目录

`docs/blueprints/*.blueprint.json` 在构建期先跑 `validate-blueprint.mjs`，再打包成 `blueprint_catalog_generated.cpp`；运行时 `blueprint::find(id)` 取模板。`start_work` 按 `workload_scale_permille` 缩放 `work_total`，不改 `deliver_at`；实例化不消耗随机。

## 4. 交付结算公式（收入潜力与部分经济系数仍为 `[PLACEHOLDER]`）

```text
六个窗口 = 国内配信 / 海外发行 / 玩具周边 / 音乐 / 电视 / BD·DVD

质量兑现 = clamp(200 + 质量均值 × 8, 200, 1040)‰       // 均值 100 → 1000，105 → 1040（v0.5）
热度     = boom 1200 / high 1100 / mid 1000 / low 900
声望     = clamp(800 + 声望 × 2, 800, 1400)‰           // 声望 100 → 1000
窗口毛收入 = 潜力 × 质量兑现 × 热度 × 声望 × 电视倍率
电视倍率 = 无播出 1000 / 外部代理普通播出 1150 / 电视台成员 1250 / 购买黄金档 1300
          只作用于国内配信、周边、音乐、BD/DVD
渠道集合 = 企划基线渠道 ∪ 委员会成员渠道 ∪ 已购买电视服务
外部代理 = 普通 450‰（声望≥100 或同类成功合作≥1）
           优质 400‰（声望≥190 或同类成功合作≥3）
           核心 350‰（声望≥350 或同类成功合作≥5）
          取声望与合作次数满足的最高档；成员渠道 0‰
          声望<100 且无同类成功合作时渠道关闭
BD 公司所得 = BD 毛收入 × 50%；另 50% 为综合成本，不进入池、不重复扣现金或制作成本
非 BD 净池 = Σ开放窗口毛收入 × (1000 − 适用代理费) / 1000
评级     = S ≥85 / A ≥75 / B ≥65 / C ≥50 / D（强制交付先扣 (1000−完成度)/100，最多 10 分）
强制系数 = 正常 1000 / 未达门槛 600‰
扣罚     = 预算 × (1000 − 门槛完成度) × 300/1000/1000   // 仅强制/关闭路径
```

**收入归属（DEC-BD-001 / DEC-COMM-001/002/003）**

- **承制**：只获得 BD/DVD 毛收入的 50%（归公司）；BD 公司所得 ≥ 合同预算时另付成功奖励 预算×20%（占位）；不参与其他窗口。
- **委员会**：BD/DVD 毛收入的 50% 归公司、不进池；其余开放窗口扣代理费后汇总为 `committee_pool`；按投资比例 Pro-rata 分给公司（回执 `commercial_share`）与其他成员（`investor_share`）。Archive 的 `finance_summary.commercial_share` 按 DA §7.6 汇总公司所得，即回执 `commercial_share + bd_revenue`。
- 通用前置商业成本的输入字段尚未冻结，当前只能表达已实现的逐渠道代理费；不得私加字段或默认收费。
- 净池分配的取整顺序和余数归属尚未冻结；出现非整除分配时当前原子返回 `NOT_IMPLEMENTED`，不静默舍入、不写流水、不归档。
- 电视：有电视台成员时获得 125% 强力播出、不可再购买；无成员且外部代理开放时使用 115% 普通播出；玩家可主动购买 130%，支付总费用 × 投资比例，其余成员共同出资。
- 声望变化：S+8 / A+5 / B+2 / C0 / D−5，唯一入口写 `reputation_log`；强制/中止不产生正向声望。
- 委员会关闭时按评级更新成员关系：S+3 / A+2 / B+1 / C0 / D−2（强制不产生正向关系），并追加 `history`。
- 门槛完成度 `gate_completion_permille` = 各门槛项 `min(1000, work_done×1000/(deliver_at×work_total))` 的平均值；正常交付恒为 1000。
- 交付结算提交前预检最终余额；若收入与扣罚合并后仍为负，整笔返回 `INSUFFICIENT_FUNDS`，不写流水、Archive、声望或关系。`advance_week` 刚性支出预检失败同样整周回滚并直接破产终局（§14.7）。

### 4.1 中止结算（DEC-PROJECT-001 / DEC-REP-001）

- 进度由项目全部权威工作项汇总；承制完成 ≤50% 收取合同制作费 15% 违约金，>50% 退还 `已收制作费 × (1 - 完成进度)` 且不收违约金。当前金额按整数向下取整，后续取整/数值标定由 #60 跟进。
- 委员会项目只核销沉没成本，不追加违约金，不返还投资本金或已发生成本；特殊商业机会前置费沉没，未取得收入归零。
- 中止声望基准 `−35000`，按变更前声望档位乘 10%/70%/140%/220%，再乘规模系数 short 350 / ova 650 / tv 1000 / movie 1600；不产生正向声望或委员会正向关系。
- 写入 `status=ABORTED`、`aborted_week`、`penalty_paid`、`contract_refund` 及对应 Finance 流水；保留 WorkRecord，但不写 `Archive.series`。临时员工解绑退出，未完成外包合同删除并释放产能，已发生费用不退。
- 中止后现金 <0 时不封顶、不豁免，先结清其他项目 pending 的默认保守分支，再复用 M2.5 破产关闭路径；`company_end_reason=bankrupt`。

## 5. 财务与 Archive

流水科目：`contract_received`（+）、`contract_refund`（+，仅承制中止退款）、`investment_paid`（−）、`commercial_share_received`（+，含 BD/DVD 公司所得与委员会净池份额，靠 `memo` 区分）、`success_reward_received`（+）、`penalty`（−）、`distribution`（−，电视服务）；延期费暂记 `production`。

周薪按 DEC-ECON-001 归因：核心与临时员工均按 `weekly_salary` 计入阶段 2 刚性预检和阶段 3 流水；已分配到项目的员工记 `work_id=项目`，闲置员工记 `work_id=null`（公司级成本）。

`Archive.works` 追加一条 31 字段 `WorkRecord`：作品事实、`status/aborted_week/penalty_paid`、六维质量、质量分、评级、`end_reason`（`completed` / `deadline` / `company_closed` / `aborted`）、`forced`、`gate_completion_permille`、`commercial_revenue`、`bd_gross`、`bd_revenue`（公司所得）、`committee_pool`、`investor_share`、`company_received`、逐窗口对账 `channel_breakdown`（含毛收入 `revenue`、公司所得 `company_received` 与计算因子）、单集质量摘要、团队快照，以及 `finance_summary`（合同收入、退款、投资本金、商业份额、BD 公司所得、奖励、扣罚、`costs` 分类、`total_costs`、`profit`）与 `rules_status=placeholder`。记录只追加。

> 中止（`abort_work`）同样写 WorkRecord 与 Finance 履历，但按 DEC-PROJECT-001 不进入 `Archive.series`；`end_reason=aborted`、`status=ABORTED`，`penalty_paid` 只记录实际违约金，退款由 `contract_refund` 流水与 `finance_summary.contract_refund` 表达。交付记录三种 `end_reason` 与 `status=DELIVERED` 配套；不得再以 0 处罚或 `penalty_pending` 伪报完成。

`Archive.company_result` 由 `finalize_company` 写入一次：`reason`（voluntary / bankrupt / time_limit）、周数、期末现金、净现金变化、作品数、最佳作品、公司评级（暂复用作品分数线）与 highlights/negatives。

> 文中的“存档 round-trip”仅指 **GameState JSON 序列化往返**（含 pending 事件与哈希一致）；#49 的 SaveRecord envelope 尚未交付，不是完整存档功能。

## 6. 状态校验（新增）

- Staff：`signing_fee`（≥0）+ `weekly_salary`（>0），不再有 `project_fee`；employment 枚举。
- Finance：`loans` 与 `solvency.state` 必填；缺字段返回 `INVALID_INPUT`，不静默补 0。
- Project：`mode` 枚举；`status` 枚举（planning/producing/delivering/settled）；`deadline > opened`；真实项目渠道非空；承制 `committee_id=null` 且投资全 0；委员会项目必须有 `committee_id` 且比例 10..100/10。
- Committee：精确 6 字段；成员/渠道不重复、成员必须是已知伙伴且渠道归属一致、`bd_dvd` 不挂成员；active 必须与同一委员会项目双向引用并允许 `producing/delivering`；closed 不得引用活动项目，且成立/关闭周与 Archive 一致（INV-13）。
- Partner：精确 8 字段；类型/渠道/关系/状态合法；history 精确 4 字段，只引用已归档作品且合作周与 `end_week` 一致（INV-13）。partners / committees / members 顺序不影响规范化哈希。
- Market：槽位 ≤4、企划预算/工期/蓝图/渠道/模式必填、热度档位合法。
- Archive：记录 id 全局唯一、评级与 `end_reason` 枚举、`gate_completion_permille` 0..1000、结束周不晚于当前周。
- 待处理事件：同项目至多一条；`expires_week=null` 表示非限期，限期必须落在 `triggered_week..triggered_week+7` 且带 `abandon` 默认分支；阶段 7 按 `(work_id,event_id)` 顺序只处理目标事件。升级载荷/已升级标记未冻结，当前不实现升级。交付/主动关闭前必须先处理，不得清空（DEC-EVENT-001）。
- Project 监督岗位：每个 producing 项目恰有一名合格且 `assignment_work_id` 指向本项目的监督；开工自动定岗，调离执行原子 Swap/Replace，无替补则关键岗位锁定（INV-27）。
- 立项后 id 全局唯一（含 Archive），避免归档后复用 `work_01`。

## 7. 测试

`scripts/v4.test.mjs` 共 124 条；本轮与项目闭环相关的关键用例：

1. 到期强制交付：未达门槛在结算周自动交付，`deadline`、按完成度扣罚、归档并移除项目；
2. 到期交付：门槛达成按 `completed` 正常计价，不扣罚；
3. 关闭路径：`end_company` 锁 closing 并拒绝非结清命令，`finalize_delivery` 结清转 ended，`finalize_company` 只生成一次结局；
4. 第 520 周：完成当周结算后锁 closing/time_limit，剩余项目转 `company_closed` 并可在关闭后结清；
5. 事件保留：项目有 pending 时交付/关闭被拒，跨项目事件不被清理；
6. 中止：承制 ≤50% 违约金与 >50% 退款、委员会零增量、声望顶格重罚、临时员工/外包释放、ABORTED WorkRecord 与系列豁免；
7. 商业归属：BD 毛收入与公司 50% 所得分开、委员会净池按比例分账、电视倍率 1000/1150/1250/1300 分档、代理 450/400/350‰ 分档与逐渠道独立累计、代理费逐行对账；
8. 原创草稿：缺草稿/失效/有效三种路径，以及命令 12-14 的创建/采纳/拒绝；
9. M1 输入边界：Staff 报酬字段与 `solvency.state` 缺失返回 `INVALID_INPUT`；
10. §14.7 预检失败：无 pending 时整周回滚、不扣款、直接 closing/bankrupt；有 pending 时按稳定顺序执行默认保守分支并结清；
11. INV-27：开工定岗、无监督拒绝、空缺/悬空/不合格校验、关键岗位锁定与原子替补；
12. INV-29：未到期保留、到期 abandon 快照只执行一次、多项目稳定顺序、成本封顶与阶段失败原子性；
13. 第 520 周 pending：只执行各 pending 的默认保守分支后进入 time_limit 关闭，其余项目可继续结清并生成结局；
14. DEC-COMM-003 非整除净池分配：取整规则未冻结时原子返回 `NOT_IMPLEMENTED`，不静默舍入、不写流水、不归档；
15. 结算与关闭预检：交付后现金为负时原子拒绝；关闭前按真实结清顺序预演，无法非负结清则保持 running；
16. 输入状态守卫：交付、关闭与重复查看事件都不得先改写再靠校验洗白非法状态；
17. 必填字段：WorkItem 与 pending 的必填键缺失时返回 `INVALID_INPUT`，不补默认值；
18. 临时员工：周结算不积累长期经验，结项退出名册且贡献保留在团队快照；
19. 企划 ID：活动项目占用期间跳过草稿号，归档后凭 `offer_id` 仍不复用；
20. 周回执：`funds.delta` 等于整周实际现金净变化，阶段 8 事件以次周为时间基。
21. M4-A 强契约：Partner/Committee 精确载荷、成员渠道归属、active/closed 与 Archive 一致性、history 归档引用，以及 partners / committees / members 顺序无关哈希。
22. 中止破产与 pending：先结清其他项目 pending，再复用 closing/bankrupt → finalize_delivery → finalize_company；ABORTED 记录不进入 series。
23. 契约审计：真实 `abort_work` 场景与 aborted Archive 破坏探针验证退款、违约金、利润公式、系列豁免与 WorkRecord 载荷。

本机 `.tools/emsdk` 可执行真实 WASM 构建；`npm run test:v4` 结果 **124/124**，`npm run audit:v4` 通过。

## 8. 里程碑判定（如实）

| 阶段 | 已具备 | 仍缺 |
| --- | --- | --- |
| M2 | 立项（含原创草稿准入）、蓝图实例化、制作、正常/到期/中止结算、公司关闭/结清/结局、Archive、成本归因、事件处理、INV-27 监督岗位、INV-29 到期默认分支、终局 pending 默认分支 | 事件升级载荷、真实市场来源、12 集完整人工试玩 |
| M2.5 | 预检失败整周回滚并直接破产终局（含 pending 默认分支）、中止负余额复用破产、交付结算负余额原子拒绝 | 融资/贷款与终局展开（未来更新候选） |
| M3 | 多项目并存、人员单项目归属、遍历顺序无关 | 企划槽刷新/竞争、供应商目录与外包、520 周长跑 |
| M4 | 委员会、投资比例、六窗口、BD 归属、净池分成、电视倍率、伙伴关系与 history、Partner/Committee 强契约与 INV-13、顺序无关哈希 | 更多伙伴/渠道类型、合作关系玩法、特殊商业机会、完整对账报表 |

**结论：不能宣称 M4 已验收。** 当前是把 M4 的商业结算核心接在 M2 主链路上；M2.5/M3 的缺口不补，M4 的“产业关系”只是一条单项目结算路径。

**实现口径与剩余标定**：①`closing → ended` 由“无在制项目”驱动（`end_company` 或最后一个 `finalize_delivery`）；②强制系数 600‰、扣罚 30%、评价修正 10 分、电视总费用 60 万、草稿声望门槛 120/按 scale 预算均为 `[PLACEHOLDER]`，回执统一带 `rules_status=placeholder`；③`abort_work` 已按 DEC-PROJECT-001 实现，50% 边界、15% 违约金、超额退款、委员会零增量、ABORTED 履历和负余额破产路径不再待裁决，金额整数取整与参数标定由 #60 跟进；④破产/第 520 周 pending 按冻结快照执行默认保守分支后结清，不再新增独立终局事件字段；⑤事件升级已由 DEC-EVENT-002 冻结，一次升级、同身份替换、2 周宽限与配置化惩罚的代码由独立工作树收尾；⑥演出/作画/脚本职业转任监督的 direction/management 阈值仍待 #55 标定，当前仅允许天然具备资格的 director/animation_director/production_manager 任职；⑦通用前置商业成本输入字段与非整除净池分配取整规则未冻结，当前不新增成本字段，并在非整除分配时原子拒绝。代理 45/40/35%、电视 100/115/125/130% 与 BD 公司所得 50% 已由 DEC-COMM-001/002 与 DOMAIN_ARCHITECTURE §10.6 冻结，不再列为 placeholder。

## 9. 下一步

1. 合入并验收事件升级实现，核对一次升级、2 周宽限、配置化惩罚与跨项目隔离；
2. 完成 #60 中止金额整数取整与数值标定，不改已冻结规则方向；
3. M2 真实市场来源与 12 集完整人工试玩；
4. M3 企划槽刷新 + 供应商/外包 + 520 周长跑；
5. M4 特殊商业机会、更多伙伴渠道与关系玩法；
6. 以上变更继续在有 emsdk 的环境跑 `npm run test:v4` 并附输出。
