# M2 已裁定规则落地方案与缺口清单

- 日期：2026-11-24
- 基线：`origin/main@a74c23a`；委员会路线的本地实现为 `feat/committee-settlement-core@46a0b47`（**未推送**）
- 性质：**方案与缺口清单**。本轮不落功能代码；委员会/渠道结算参数按 2026-11-23 决定先出提案，经 zm 裁定后才写入 `game_rules.hpp`。
- 行号是本文写作时 `.worktrees/committee` 工作树的快照，后续提交会漂移。
- 本文不声称任何行为已通过真实验证；未验证事项集中列在 §8。

## 0. 结论先行

1. **委员会路线已经"半通"**：46a0b47 打通了投资本金与一次性分成入账，但分成用的是 `floor(commercial_revenue × pct/100)`——正是 V3.12 声明"被该框架取代"的 V3.3 单渠道公式；玩家仍然走不到这条路线，因为报价目录把 `allowed_modes` 硬编码成 `["contract"]`（`game_core.cpp:185`）。
2. **三条线的真实卡点各不相同**，不能统一按"照着规则写代码"推进：
   - 企划（#6）：1 个需要动冻结契约的口径冲突（承制 BD 入账）+ 1 组待裁定的渠道参数 + 1 份缺失的目录数据（属 #6 负责人交付物）。
   - 员工（#7）：缺 2 份目录数据（招聘池、供应商），参数按 V3.6 属模块负责人职权，**不需要等 zm 给数字**。
   - 事件（#11）：同事分支已实现，但落后 main 145 个提交且早于 #12 校验器重写，应归原负责人 rebase，不另起一份实现。
3. **46a0b47 至今 0 条真实绿灯**：本机无 cmake/ninja，CI 只跑 economic-simulator，不覆盖 native core 测试。文中引用的新断言从未执行过。
4. 建议顺序：先裁 §6 的 D1–D4 → 契约三层同步 → 在 46a0b47 上改写分成公式 → 渠道结算与 `channel_breakdown` → 前端模式选择 → 员工目录 → 事件 rebase。

## 1. 实测基线（真实命令与结果）

| 命令 | 工作树 / 提交 | 结果 |
| --- | --- | --- |
| `node scripts/build-core.mjs test`（MSVC native + ctest） | `.worktrees/m2-core` @ a74c23a（= origin/main） | **88 用例中 2 失败**：`Validation.NumericBoundsAndSchema`、`ValidatorCompatibility.DynamicOffersAndTheirOwnFields` |
| 同上（修 3 处失效断言后） | `.worktrees/m2-core`（未提交） | 88/88 通过 |
| `npm run typecheck` / `npm run test:unit` | `.worktrees/m2-core` @ a74c23a | 通过 / 247 通过 |
| `node scripts/build-core.mjs test` | 本工作树 @ 46a0b47 | **未执行**——本机无 cmake/ninja，见 §8 |

main 上那 2 个失败的根因不是行为缺陷：9ea8e5e 删掉了 `contract_budget == scale(total_investment, contract_share_permille)` 这条不变式（V3.12 后 `contract_budget` 就是制作预算，不再从投资规模反推），但测试里 3 个 mutation 仍在断言那个已废下界。修法是把 mutation 改成 V3.12 口径下真正非法的值，而不是恢复旧不变式。

## 2. 委员会路线现状与差距（企划 #6）

### 2.1 46a0b47 已经做对、应保留的部分

| 点 | 位置 | 与规则的关系 |
| --- | --- | --- |
| `total_investment = contract_budget × 2` 单一来源 | `game_core.cpp:884` | V3.12 §2 ✓ |
| 本金 `scale(total_investment, pct×10)`（整数千分比 floor） | `:885` | V3.12 §2 `floor(total×pct/100)` ✓ |
| 资格门用**拨款前**现金，先扣本金再并入拨款，`opening_funds` 记拨款前现金 | `:886` 比较、`:880`/`:899` 记录、`:909`→`:912` 入账顺序 | V3.3 资格口径 ✓，且原子（同一次响应内完成） |
| `advance_week` / `calculate_result` 取消委员会闸门，测试改正向断言 | `check_production_execution`（`:749-755`）与 `calculate_result`（`:1170` 区）的拒绝分支已删除 | 避免"开得了工、交付不了"的死锁 ✓ |
| `profit = contract + share − investment − costs` | `:1232` | 比原先 `contract − costs` 更接近分账语义 |

### 2.2 合入前必须处理的差距

| 编号 | 位置 | 现状 | 依据 | 需要变成 | 级别 |
| --- | --- | --- | --- | --- | --- |
| C1 | `game_core.cpp:1195-1198` | 委员会分成 = `floor(commercial_revenue × pct/100)`，把 BD 也按投资比例分 | V3.11 §2、V3.12 §3、`DATA_MODEL.md:109`（明文"V3.3 单渠道公式被该框架取代"） | BD 毛收入固定 50% 归公司、与投资比例无关；只有非 BD 渠道按 pct 分 | 阻塞 PR-D |
| C2 | `:480` + `DATA_MODEL.md:51` + `apps/web/src/types/gameV3.ts:542` | 三层同时禁止承制模式 `commercial_share_received > 0`；且结算里承制分支根本不向现金写入任何商业收入 | K3（`GAME_RULES.md:124`）、V3.11 §2、V3.12 §3 | 承制 BD 50% 归公司并进现金；`commercial_revenue` 与 `commercial_share_received` 语义分离 | **需 zm 裁定**（动冻结契约 + 存档兼容） |
| C3 | `:878`（`>=10 && <=100`）、`number(investment_percent,100,10)` | 只限范围不限步进；35% 会被接受 | V3.11 §1"按 10 个百分点调整" | 校验 10 的整数倍。注意 `execute()`（`:812`）只校验**入参**状态、不校验输出状态，所以非法输出不会自动暴露 | 一般缺陷 |
| C4 | `:886`（`invalid()`） | 本金不足返回 `INVALID_INPUT` | `API.md:20/199`：`INSUFFICIENT_BUDGET` = 可选支出不足 | 返回 `INSUFFICIENT_BUDGET`，否则前端提示语错位 | 一般缺陷 |
| C5 | `:185`（`allowed_modes` 硬编码）、`:849` | 报价不产出 `committee_members` / `channel_potentials`；`channel_breakdown` 从不写出（校验器 `:532-543` 已就绪）；测试靠 `committee_offer_state()` 手改 state 才进得了委员会分支 | `DATA_MODEL.md:116/381`、`API.md:277`、V3.12 §1 | `make_offer` 输出 contract+committee；补目录数据。**这份数据是 #6 负责人 @Sqks183 的交付物**（`PLANNING_MODULE.md` 交付内容第 4 条），核心只提供承载 | 强依赖 |
| C6 | `:874`、`:960-968`、`:1190` 区 | `required_works` 解锁、`buy_tv_service`、委员会延期、`success_reward_received`（承制成功奖励）、`committee_pressure` 机制均未落地 | K3、V3.11、`DATA_MODEL.md:27` | 逐项排期；`success_reward_received` 与 C1 同一结算路径，宜同 PR | 后续 |
| C7 | `docs/CORE_VALIDATOR_REFACTOR_DESIGN.md:71` | 该设计文档仍写 `committee_members` 含 `share_percent`/`channels` | `API.md:52`、`DATA_MODEL.md:101`、代码 `:96`（明确 reject 这两个键） | 文档陈旧，改文档不是改代码 | 记录即可 |

## 3. 员工（#7）缺口

| 位置 | 现状 | 缺什么 | 依赖类型 |
| --- | --- | --- | --- |
| `game_core.cpp:960-963` | `hire_temporary` / `outsource` → `invalid()` | 临时人员属性生成 + 计价；外包任务交付 | 契约依赖（`check_outsource_task:415` 已定义结构） |
| `:964-967` | `hire_core` → `invalid()` | 招聘池数据 | 强依赖数据：`:849` `recruitment_pool` 恒为空数组，需名册目录 |
| `:968-971` | `request_extension` → `not_allowed`（对两种模式一律拒绝） | 委员会延期一次 + 压力，属 #6 结算路径 | 与委员会 PR 同批 |
| `:754` | 在途外包会拒绝推进周 | 外包交付必须与 `advance_week` 同 PR，否则玩家被卡死 | 实现约束 |

参数授权：V3.6 把招聘/临时/外包的具体数值交给模块负责人，`GAME_RULES.md:493` 禁止实现者自行补造的是**未裁定的全局规则参数**（渠道规模、分档倍率那类）。因此员工线**不因等待参数而停工**；但 `STAFF_MODULE.md` 里的 `scout`、`targeted_scout`、`scout_pity` 稀有度/保底属内容提案，未经确认不得当规则实现。

## 4. 事件（#11）缺口

- `game_core.cpp:1158`：`resolve_event` 在 `event_pending` 下仍返回"事件选项效果目录尚未接入"。
- **M2 清单里"phase 完整性"一项可划掉**：`:724` 已允许 `event_pending`（`require(!event.is_null() && is_producing_active(state))`），PR #12 已闭合。
- `origin/feat/11-event-m2a-v2`（@pyxz0）已实现事件目录/触发/结算，并把开关默认设为 `rules::event_trigger_enabled = false`（基础 60‰、加成 40‰、上限 300‰）。该分支落后 main 145 个提交、且基于 #12 校验器重写之前。
- 处理建议：由原负责人 rebase 后提 PR，本模块不代写第二份实现、不代merge（`TEAM_ASYNC_COLLABORATION.md` §5.6）。等待期间我这边可独立做的是：用已入库的 `docs/event_test_fixtures.json` 准备真实流程验收脚本，等 rebase 完成即可跑。

## 5. 参数提案（委员会 / 渠道结算）★ 等裁定

### 5.1 先决的三个结构口径（数字依赖它们）

| 编号 | 问题 | 规则原文 | 建议 |
| --- | --- | --- | --- |
| P1 | 渠道基础规模用派生还是独立生成 | V3.9 §2"每种已开放渠道拥有独立的基础商业规模" | 采用**派生**：`gross = scale(scale(contract_budget, rate‰), potential‰)`。单一来源、可手算、与 V3.12"contract_budget 就是制作预算"一致；`channel_potentials`（0–100）作为兑现系数而非独立金额 |
| P2 | 分档基准 | V3.9 §3"BD 销量独立计算，**只受作品质量影响**" | BD 按 `quality_score` 归档；非 BD 按 `commercial_score` 归档。两张倍率表分开。**模拟器现在把 BD 也按 commercial_score 归档（`economic_simulator.py:207-208`），与规则冲突，不可照抄** |
| P3 | BD 50% 怎么记账 | V3.12 §3 允许两种、要求最终一致 | 采用"直接记所得 = gross × 500‰"，`channel_breakdown` 区分 `revenue`（毛）与 `company_received`（净），**不再另记那 50% 综合成本**，避免与现金恒等式重复扣减 |

### 5.2 首版建议数值（全部 `TODO(待定)`）

来源统一为团队自己入库的模拟实验参数（`scripts/economic_simulator.py:19-27`、`scripts/simulation_config.example.json:35-50`），不是行业报价。落地时要把浮点随机模型改成整数千分比 + 固定 LCG，因此这些值在真实 WASM/浏览器回归之前只算起点。

| 参数 | 建议值 | 来源 | 理由 / 影响面 |
| --- | --- | --- | --- |
| `bd_company_share` | 500‰ | 已裁定（V3.11 §2） | 不是待提案值；约束是成本比例必须 > 0 |
| `bd_multipliers`（按 **quality** 档，见 P2） | D 100 / C 400 / B 800 / A 1500 / S 3000‰ | simulator:21 | 决定委员会与承制共同的 BD 底盘；×3 顶档是"顶级保留提升空间但限制增长"的现成刻度 |
| `non_bd_channel_rates` | publisher 250 / toy 350 / music 150 / tv_broadcast 300‰ | config:35-40 | 每渠道规模基数；直接影响"拉哪个渠道"的决策差异 |
| `non_bd_multipliers`（按 **commercial_score** 档） | D 300 / C 600 / B 1000 / A 1500 / S 2500‰ | config:44-50 | 非 BD 的兑现曲线；比 BD 平缓，避免渠道数直接碾压质量 |
| `channel_potentials` 取值域 | 0–100 整数，企划自带 | `DATA_MODEL.md:104` | 取代模拟器的 `channel_fit_min/max` 随机抽样（`uniform(20,40)`）——随机 fit 与"渠道开放由企划自带条件及成员决定"（V3.11 §1）不是一回事 |
| 商业分档分数线 | S ≥ 80 / A ≥ 65 / B ≥ 50 / C ≥ 35 / D | simulator:64-69 | `GAME_RULES` 写"固定分数线待定"，这是可直接采纳的一组 |
| 承制成功奖励 | `score ≥ 65` 时 `contract_budget × 100‰`，记 `success_reward_received` | simulator:26-27 | K3 只说"达到预设商业表现目标时可由委托方另付"，阈值与比例待定 |
| 题材热度系数 | **PENDING（1.0）** | V3.9 §2 给 1.2–1.3 区间但档位未定；`PLANNING_MODULE.md` 第 10 条：热度状态存储是跨系统契约缺口 | 不得自行新增字段 |
| 公司声望商业系数 | **PENDING（1.0）** | V3.9 §2"映射和系数待定" | — |
| 前作系数 / 爆款 ×5 阈值 | **PENDING（1.0 / 未定）** | V3.9 §3 属 #8；×5 判定属 #7 彩蛋规则 | — |

未裁定的项在实现里保持不接入，不用 1.0 之外的自造值填空。

### 5.3 手算验收样例（对账夹具，非当前实现产出）

统一按 P1/P3 的整数顺序：`scale(scale(scale(budget, rate‰), potential‰), multiplier‰)`，`scale(v, p) = (v/1000)*p + (v%1000)*p/1000`（即 floor 后精确）。这正好覆盖 `PLANNING_MODULE.md` 交付内容第 6 条要求的样例。

**样例 A — 委员会 `proj_short_01`（`contract_budget 2,400,000`，`investment_percent = 30`，成员 publisher(potential 30) + toy(potential 35)，BD potential 未单列、按 B 档）**

| 项 | 演算 | 金额 |
| --- | --- | --- |
| `total_investment` | 2,400,000 × 2 | 4,800,000 |
| 投资本金 | `scale(4,800,000, 300)` | 1,440,000 |
| 开工后现金 | 2,000,000 − 1,440,000 + 2,400,000 | 2,960,000（`opening_funds` = 2,000,000） |
| BD 毛收入 | `scale(2,400,000, 800)` | 1,920,000 |
| BD 公司所得 | `scale(1,920,000, 500)` | 960,000 |
| publisher 毛 | `scale(scale(2,400,000,250),300)` = 600,000 → | 180,000 |
| toy 毛 | `scale(scale(2,400,000,350),350)` = 840,000 → | 294,000 |
| 非 BD 毛合计 × B 档 1000‰ | 180,000 + 294,000 | 474,000 |
| 非 BD 公司所得 | `scale(474,000, 300)` | 142,200 |
| `commercial_revenue` | 1,920,000 + 474,000 | **2,394,000** = Σ breakdown.revenue ✓ |
| `commercial_share_received` | 960,000 + 142,200 | **1,102,200** = Σ breakdown.company_received ✓ |
| `profit` | 2,400,000 + 1,102,200 − 1,440,000 − costs | 2,062,200 − costs |

**样例 B — 同企划走承制（验证 C2 修好后的行为）**：无 `total_investment`、无本金；现金 = 2,000,000 + 2,400,000；`commercial_revenue` = BD 毛 1,920,000；`commercial_share_received` = 960,000；`success_reward_received` = 240,000（若 `commercial_score ≥ 65`）；非 BD 渠道不分成。当前代码下这组数**不可能出现**，因为 `:480` 直接判非法。

**样例 C — 负例**：`proj_tv_01`（budget 6,000,000）30% → 本金 `scale(12,000,000,300)` = 3,600,000 > 拨款前现金 2,000,000 → 拒绝，期望 `INSUFFICIENT_BUDGET`（现在是 `INVALID_INPUT`，见 C4），且状态不得半改。

## 6. 需要 zm 裁定的决策清单

| 编号 | 决定 | 为什么不能自行决定 | 推荐 | 备选 | 不阻塞 |
| --- | --- | --- | --- | --- | --- |
| D1 | 承制 BD 入账是否放开 `commercial_share_received` | 要同时改 `DATA_MODEL.md:51`、`gameV3.ts:542`、`game_core.cpp:480` 三层冻结契约 + 存档兼容 | 只**放宽**约束（承制允许 >0，旧承制存档 0 仍合法），不改字段语义 | 承制另立 `bd_share` 字段（扩大契约面，不推荐） | 员工/事件线 |
| D2 | BD 归档基准用 quality 还是 commercial_score | V3.9 §3 与模拟器现值矛盾（P2） | 按规则：BD = quality_score | 若想让 BD 也吃商业预期，需先改 V3.9 §3 | PR-A/B |
| D3 | BD 50% 记账方式（P3） | 影响现金恒等式与 breakdown 对账 | 直接记毛 × 500‰，不重复扣成本 | 先记毛再列 50% 综合成本（要求成本项进 `costs`，易与对账工具打架） | PR-B |
| D4 | 是否采纳模拟器 V0.5/V0.6 参数为首版 | 该报告自称"首轮实验参数，不是最终平衡结论"；`GAME_RULES.md:493` 禁止实现者自造 | 采纳为**首版暂定值**并全部标 `TODO(待定)`，等真实回归后再平衡 | 先只接 BD、非 BD 渠道留到下一里程碑 | PR-A |
| D5 | 事件分支归属 | `TEAM_ASYNC` §5.6 不自行合并/覆盖他人分支 | @pyxz0 rebase 后提 PR，本模块只做验收 | zm 指定代写人 | 其余全部 |
| D6 | CI 是否补跑 native core 测试 | 构建链路改动，且现在 main 基线带 2 个红灯 | 先修基线（§1）再把 ctest 加进 CI | 维持现状（等于核心行为长期无自动化验证） | 功能开发 |
| D7 | 46a0b47 怎么进 main | 分成公式与已裁定规则冲突（C1） | 在本分支上改写为渠道框架后再提 PR，保留其本金/原子入账部分 | 先只合"立项不进现金"的中间态（会留下玩家可见的假象） | — |
| D8 | `.worktrees/m2-core` 里未提交的测试基线修复归属 | 是否单独成 PR、还是并入企划 PR | 单独 PR-A（只动测试，风险最低、能立刻解锁 D6） | 并入企划 PR | — |

## 7. PR 堆叠与共享文件顺序

`game_core.cpp` 与 `game_core_test.cpp` 是单点串行文件（`TEAM_ASYNC_COLLABORATION.md` §5.4/§5.7）：同一时间只推进一条集成链，后续 PR 基于前序分支堆叠，由 zm 合入。

| 顺序 | PR | 范围 | 验收 |
| --- | --- | --- | --- |
| A | 测试基线修复 | 仅 `game_core_test.cpp`（3 处失效 mutation + 失败定位用的 `SCOPED_TRACE`） | native 88/88（已在本机 MSVC 通过，未提交） |
| B | 契约同步（依赖 D1） | `make_offer` 的 `allowed_modes` + 目录字段承载 + `check_mode_finance` 放宽 + TS/文档三层同步 | native + typecheck + 旧存档回归 |
| C | 委员会立项（在 46a0b47 上改写） | `start_project`：本金、可支付门改 `INSUFFICIENT_BUDGET`、10 步进校验 | native 手算对账（样例 C 边界） |
| D | 渠道结算（依赖 D2/D3/D4） | 替换 `:1195` 单渠道公式 → BD/非 BD 分账 + `channel_breakdown` + `success_reward_received` | native + WASM，样例 A/B 精确等式 |
| E | 前端 | `StudioPage.tsx:131/133` 目前只显示模式文字、调用 `startProject(offer.id)` 走默认 `contract`；`gameCore.ts:85` 服务层已支持 committee。需要模式选择 + 投资比例输入 + 错误码文案 | 浏览器真实流程（开工→推进→结算→对账） |
| F | 员工（#7） | 招聘池/供应商目录 + `hire_*`/`outsource` 及在途外包与 `advance_week` 同批 | native + WASM |
| G | 事件（#11） | @pyxz0 rebase 后的分支 | 真实流程 + `event_test_fixtures.json` |

## 8. 未验证与未提交（不得当成已完成）

- **46a0b47 的测试从未执行过**：本机无 cmake/ninja，CI 不含 native core 测试。§2.1 的"做对了"来自代码走读与提交说明，不是绿灯结论。
- 本工作树本轮**未运行**任何构建/测试/typecheck/浏览器验证（只读代码）。
- `.worktrees/m2-core` 有未提交改动（`game_core_test.cpp`），分支未推送；是否成 PR 等 D8。
- 46a0b47 未推送远端。
- §5.2 全部数字为提案；§5.3 全部金额为夹具演算，当前实现不会产出这些值。
- 事件线未与 @pyxz0 当面确认 rebase 归属，D5 待回复；等待期间不停工（员工/PR-A 可独立推进）。
