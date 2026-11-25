# 核心状态校验器交付说明

> 历史实现说明：本文记录 V3 单项目运行时校验与 2026-11-22 验收结果，不作为 v4 当前校验清单。v4 以 `docs/M0_CONTRACT_FREEZE.md` 的 27 条不变量为准，至少额外覆盖：多项目引用、核心员工至少一名、核心/临时员工费用与合同字段约束、`events.pending[]` 全数组完整性及逐项目唯一性。历史测试通过不代表 v4 校验已实现。

- 模块负责人：@zm
- 跟踪议题：[#1 里程碑总览](../../issues/1)；本文件覆盖的字段校验是 [#6 企划市场与委员会投资分账](../../issues/6)、[#7 用工与外包](../../issues/7)、[#8 成长、疲劳士气预警、履历与结局](../../issues/8) 的前置。
- 依据：`docs/API.md`、`docs/DATA_MODEL.md`、`docs/GAME_RULES.md`、`docs/PROGRESS.md`。
- 状态：M2 核心校验层交付；契约字段可校验不代表对应行为已实现，未实现行为一律显式拒绝。

## 模块目标

把核心侧的状态校验从「对照静态目录逐字段等值」改为「按契约形状与不变量校验」，使动态生成的企划、委员会成员、可选成本项和自定义报价在进入规则执行前先被判定为合法或非法，并保证非法输入原子失败——状态、资金、种子均不变化。

## 接口说明

新增导出声明 `apc::validate_state(const nlohmann::json&)`（`packages/game-core/include/game_validation.hpp`），实现位于 `packages/game-core/src/game_core.cpp`，分三段：

1. `check_state_entities`：公司、项目、报价、人员、供应商、事件等实体自身的字段类型、枚举白名单与数值范围。
2. `check_global_ids_and_references`：全局 id 唯一性、跨实体引用有效性、去重约束（委员会成员 id、渠道、模式、招募要求等）。
3. `check_phase_invariants`：阶段与状态的一致性，包括 `preview` 必须与实时重算结果相等、`project_ready` 必须有交付原因、`producing` 必须未到截止周。

校验入口仍走既有 `execute`，错误契约不变：统一 `{error:{code,message}}`，`INVALID_INPUT` 表示结构/值/引用错误，`MODE_NOT_ALLOWED` 表示规则未接入。除 `initialize_game`（`with_state = false`，请求不含状态）外，其余五个带状态入口都在读取动作参数之前先完整校验 `request.state`。

关键不变量（此前不在校验范围内，本次加入）：

- 承制模式：`deadline_week == start_week + offer.duration_weeks`，且 `extension_count == 0`、`committee_pressure` 与 `committee`/`tv_service` 为空。
- 委员会模式：`investment_percent` 在 10–100，且存在 `committee` 时股东占比与投资方占比合计恰为 100。
- 来源为 `original` 的企划只允许 `committee` 模式；`style != normal` 必须 `origin == custom`；`style == meme` 限定 `scale == short`。
- 成本项在原有八类之外接受可选的 `development` 与 `distribution`，`costs_total` 一并计入。
- 阶段人员快照按阶段保留，同一人在不同阶段可以承担不同岗位；结算后的状态仍可再次完整校验。

## 修改文件清单

| 文件 | 变更 |
|---|---|
| `packages/game-core/include/game_validation.hpp` | 新增，声明 `apc::validate_state`（此前未跟踪，必须随本次提交） |
| `packages/game-core/src/game_core.cpp` | 校验器重写为形状驱动；新增实体/引用/阶段三段校验；报价、委员会、渠道潜力、成绩解锁、可选成本字段接入校验 |
| `packages/game-core/tests/game_core_test.cpp` | 新增原生用例，覆盖边界值、引用重复、阶段不变量与溢出拒绝 |
| `packages/game-core/tests/wasm.test.mjs` | 新增真实 WASM 侧用例，覆盖动态名册、动态报价快照到结算、可选字段兼容与原子拒绝 |
| `scripts/browser.test.mjs` | 修正边界存档夹具：`deadline_week` 与 `offer.duration_weeks` 必须同时设置，否则存档本身不合法（属测试证据修正，不改核心行为） |
| `docs/TEAM_DELIVERABLES/CORE_VALIDATOR.md` | 本文件 |

## 实际执行的构建与测试结果

2026-11-22 在本机（win32 / Node v24.22.1）执行，全部为真实运行输出：

| 检查 | 命令 | 结果 |
|---|---|---|
| 原生核心 | `npm run test:native` | 73/73 通过（Validation、ValidatorCompatibility、DynamicExecution、Determinism、Phases、Endings、JsonAndSchema/InvalidInput 等） |
| WASM 构建 | `npm run build:wasm` | 产出 `game-core.wasm` 413,724 B、`game-core.mjs` 32,258 B |
| 核心 WASM 用例 | `node --test packages/game-core/tests/wasm.test.mjs` | 18/18 通过 |
| 前端契约与界面 | `npm run test:unit` | 221/221 通过（7 个测试文件） |
| 浏览器真实链路 | `node --test scripts/browser.test.mjs` | 8/8 通过，退出码 0 |

浏览器链路覆盖：新游戏→阶段配置→周推进→违约结算→返回市场且同种子完整重放状态深相等；IndexedDB 保存/刷新恢复/无存档提示/继续经营；`mjs` 与 `wasm` 加载失败时禁止新建并在资源恢复后真实推进；周支出预检破产零变化；损坏与旧版存档拒绝；临近截止的合法边界存档强制违约交付（违约金 800,000、期末现金 ¥4,990,000，与核心独立算得的结果一致）；375px 与 768px 无横向溢出。

首轮浏览器套件曾为 7 通过 / 1 失败，失败原因是上述边界存档夹具只改 `deadline_week`，被新校验器正确判为非法存档；修法是补齐 `offer.duration_weeks`，未放宽核心规则。

## 未完成项及原因

以下能力已由核心显式拒绝，不是静默放行；接入时对应闸门随之移除：

1. 动态员工的专业匹配来源（`game_core.cpp:118`）：非 `core` 用工没有已定义的专业契约，执行制作周被拒绝。等待 #7 接入动态员工专业契约。
2. 特殊风格企划制作（`:713`）：`style` 为 `meme`/`ai` 的企划可校验但不可执行，规则归 #6。
3. 委员会推进与结算（`:723`、`:1124`）：委员会模式可完整校验，投资与商业分成规则未接入，归 #6。
4. 在途外包推进（`:725`）：存在 `status == "active"` 的外包任务时不允许推进制作周，交付规则归 #7。
5. 成绩解锁企划（`:847`）：带 `required_works` 的企划暂不可承接，履历判定归 #8。
6. 承制路线延期（`:921`）：延期只服务委员会模式，未接入。
7. 事件选项效果（`:1109`）：`event_pending` 状态可校验，选项效果目录未接入，归 #11。

另需同步的文档项：`docs/API.md` 开头仍写「M0 提供类型、边界校验……规则实现属于 #3/#4/#6/#7/#8」，且未列 `validate_state` 与新增可选字段；本文档先记录事实，API.md 的契约定稿表述随 #6 接入时一并更新。

## 验收标准

- [x] 非法结构、越界数值、重复引用、阶段不一致一律 `INVALID_INPUT`，且不产生状态变化。
- [x] 合法动态状态（动态名册、动态报价快照、可选字段缺省）可完整执行到新游戏结算。
- [x] 同种子同输入结果可复现，浏览器与原生两侧一致。
- [x] 未实现行为显式拒绝并说明原因，不返回伪成功。
- [x] 所有列出的检查都有真实输出，未执行项如实标注。

## 文件与协作边界

- 共享文件 `game_core.cpp`、`game_rules.hpp`、`embind.cpp`、核心测试、`gameV3.ts`、fixtures、`browser.test.mjs`、存档格式由 @zm 单点合入。
- 模块负责人需要核心校验扩展时，先交规则提案与状态/接口影响说明，不直接改上述文件。
- 契约字段存在不等于行为已实现；任何「已支持」的表述必须以核心真实执行结果为准。
