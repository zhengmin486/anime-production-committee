# 作品与制作系统历史决策审计

> **状态说明（2026-11-24）：** 本报告是对旧 V3 五阶段作品制作系统的历史审计。报告中的五阶段规则、建议和未决项均不代表当前产品规则；现行作品结构为项目级公共制作＋单集制作、每集六阶段，详见 [DECISION_LOG.md](DECISION_LOG.md) D-PROD-01。


> 审计日期：2026-11-24
> 审计基线：线上 `main` @ `a74c23a87f012dfdc1af0eaeb4fb37d83486d352`
> 审计范围：作品来源、企划类型、项目获取、立项与合作模式、五阶段制作、工作量与质量、事故、外包与产能、发布与商业表现、系列作品、多项目调度。
> 审计性质：只读历史决策审计，不修改制作阶段、质量公式、项目生命周期或其他既有规则。
> 测试口径：本次未重新运行测试。B 级结论表示可由静态代码或测试断言核验，不表示本次实测通过。

## 证据等级

- **A**：负责人已确认并进入主线规则。本轮六条最新方向也属 A，但尚无仓库 commit，文中单独注明。
- **B**：当前契约、代码或测试可验证的实现。
- **C**：说明性文档、交接材料或实验参数。
- **D**：开放议题、开放 PR、研究假设。
- **E**：审计推断、差异判断或待核问题。

---

## 1. 已确认决定

### 1.1 作品来源、企划类型与合作模式

| 结论 | 等级 | 证据 |
|---|---|---|
| `source` 与 `origin` 是两个维度。`source=manga/light_novel/game/original`；`origin=market/custom/incoming/proposal`。“合同企划”不是第五种来源，`contract` 是合作模式。 | A/B | [DATA_MODEL.md:30](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L30) |
| 普通市场固定四个企划，至少两个可立即承接；声望不足的企划仍展示但锁定。IP 上门是 `origin=incoming`，占市场四槽之一，不增加槽位。 | A/B | [GAME_DESIGN.md:40–54](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_DESIGN.md#L40)、[gameV3.ts:672–677](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L672) |
| 原创不进入普通市场，只由玩家自建或员工提案产生；两者均使用独立槽位，不占市场四槽。员工提案只展示一次，推进空闲周未采纳即消失，拒绝无惩罚。 | A | [GAME_RULES.md:135](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L135)、[GAME_RULES.md:193–199](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L193) |
| 普通企划必须同时提供承制与委员会模式；原创只能委员会。模式与投资比例在开工时锁定。 | A | [GAME_RULES.md:511–516](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L511)、[GAME_RULES.md:565–570](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L565) |
| 承制与委员会共用人员、能力、资源和五阶段制作流程；投资比例不改变工作量、质量上限或决策权。 | A | [GAME_RULES.md:514–516](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L514) |
| `contract_budget` 同时是制作预算；仅委员会模式生成 `total_investment=contract_budget×2`。公司投资比例为 10%–100%、步长 10%。 | A | [GAME_RULES.md:572–580](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L572) |
| BD 是所有企划的基础渠道，承制与委员会统一初始 50% 公司所得、50% 综合成本；委员会非 BD 渠道按玩家投资比例分配，渠道开放不由投资比例推导。 | A | [GAME_RULES.md:543–549](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L543)、[GAME_RULES.md:582–587](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L582) |

### 1.2 作品生命周期

| 结论 | 等级 | 证据 |
|---|---|---|
| 当前目标生命周期为：`idle → producing/首阶段 ready → active → 下一阶段 ready → … → project_ready → project_settled → idle`。公司 `status` 与项目流程 `phase` 分离。 | A/B | [API.md:60–80](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L60)、[DATA_MODEL.md:49–54](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L49) |
| 每周只推进当前阶段；阶段完成后必须重新配置下一阶段，多余工作量不跨阶段转移。 | A/B | [GAME_RULES.md:14–16](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L14)、[game_core.cpp:1102–1115](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1102) |
| 交付原因分为 `completed/deadline/company_closed`；`project_ready` 是待结算，`project_settled` 是已结算展示，不能重复入账。 | A/B | [API.md:73–79](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L73)、[gameV3.ts:678–685](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L678) |
| 没有独立“发布”动作；制作完成或截止后，通过项目结算表现发布、履历与商业结算。 | B/C | [API.md:18](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L18)、[API.md:73–79](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L73) |
| 公司关闭不可逆，后续项目回款不能解除关闭状态；破产优先判定经营失败。 | A/B | [GAME_RULES.md:34](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L34)、[GAME_RULES.md:211–216](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L211) |

### 1.3 五阶段、工作量与质量形成

| 结论 | 等级 | 证据 |
|---|---|---|
| 五阶段固定为 `script → storyboard → key_animation → animation_check → postproduction`，需求专业依次为 `planning → direction → drawing → animation → postproduction`。 | A/B | [game_rules.hpp:47–50](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L47)、[DATA_MODEL.md:44](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L44) |
| 岗位、专业能力、制作阶段是三个独立维度，不能互相代用。 | A/C | [DATA_MODEL.md:44](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L44)、[STAFF_MODULE.md:15–16](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/TEAM_DELIVERABLES/STAFF_MODULE.md#L15) |
| 当前 M1 工作量由能力、专业匹配、方针、士气、疲劳计算；阶段质量按工作量加权。 | B | [game_core.cpp:1034–1053](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1034) |
| 当前前阶段只向后阶段传递质量上限：`后阶段质量 ≤ 前阶段质量×60%+40`；不传递人员、进度或剩余工时。 | B | [game_rules.hpp:42–43](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L42)、[game_core.cpp:1062–1068](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1062) |
| 当前最终质量权重为 `150/200/250/200/200`，属于 M1 暂定实现，不是最终平衡。 | B/C | [game_rules.hpp:14–52](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L14)、[game_core.cpp:1156–1160](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1156) |

### 1.4 作品评价、商业表现与声望

| 结论 | 等级 | 证据 |
|---|---|---|
| 制作质量、作品评价 `rating`、商业表现、公司声望必须分开；商业成功不能直接提高制作质量或作品评价。 | A | [GAME_RULES.md:170–177](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L170) |
| 作品评价为 S/A/B/C/D 五档，使用固定分数线；企划适配度只辅助作品评价，重大事故独立影响最终评价。分数线、适配度和事故算法仍未定。 | A/C | [GAME_RULES.md:174–176](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L174)、[GAME_RULES.md:232–236](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L232) |
| 声望初始 100、下限 0、正向无上限、不自然衰减；只能通过 `change_reputation` 写入并记录日志。 | A/B | [GAME_RULES.md:148–158](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L148)、[game_rules.hpp:30–31](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L30) |
| 当前声望只在项目结算写入三档暂定值：达标 `+10`、未达标 `+3`、截止 `-5`；公司关闭不产生声望变化。 | B/C | [game_rules.hpp:21–23](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L21)、[game_core.cpp:1170–1173](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1170) |

### 1.5 系列作品与委员会生命周期

| 结论 | 等级 | 证据 |
|---|---|---|
| 同一 IP 可做续作、前传、外传；上一部影响最大，更早作品提供较弱积累。 | A | [GAME_RULES.md:201–206](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L201)、[Issue #8](https://github.com/zhengmin486/anime-production-committee/issues/8) |
| 前作只影响商业基础与预期，不继承制作质量或作品评价，不做系列市场疲劳。 | A | [GAME_RULES.md:203–205](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L203) |
| 续作定性骨架已确认：最近三部前作参与、换主要题材降一档、作品形式变化不影响积累；全部阈值、权重和系数仍待定。 | A/C | [GAME_RULES.md:461–493](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L461) |
| 仓库只确认续作、前传、外传；没有独立“衍生作品”企划类型或生成规则。商品化、授权、IP 交易仍只是研究提案。 | A/D/E | [GAME_RULES.md:203](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L203)、[PR #25 §17.2–17.5](https://github.com/zhengmin486/anime-production-committee/pull/25) |
| 既有规则把委员会定义为立项时固定的项目级成员/渠道快照，制作中不追加或更换，不设投票权与成员政治。 | A/B | [DATA_MODEL.md:31](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L31)、[GAME_RULES.md:514–524](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L514) |
| 本轮最新方向进一步确认：作品完结后其委员会停止活动，委员会不是长期经营主体。该方向尚无仓库 commit 或独立解散动作。 | A（本轮指令）/E | 2026-11-24 本轮审计指令；当前仅随 `project` 清空而不再保留运行态，见 [game_core.cpp:1210–1213](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1210) |

### 1.6 本轮最新方向对旧设计的覆盖

- **A（本轮指令，无 commit）**：作品是游戏体验主体；公司可同时推进多部作品；多项目存在真实资源竞争；同一 IP 可形成系列经营；委员会随作品完结停止活动。
- 旧规则中的“一次只制作一部”“首版不做多项目并行”因此**不再是新架构的设计约束**。
- 但本轮指令没有废止五阶段、质量与商业分离、周制、合作模式、作品历史等既有规则；不能借多项目方向顺手重做这些系统。

---

## 2. 已被后续决定覆盖或废止的旧规则

| 旧规则 | 后续状态 | 等级与证据 |
|---|---|---|
| v2 按天推进、`pre/mid/post` 三工序同日流水线。 | 被 v3 周制五阶段覆盖。 | A/B；[GAME_RULES.md:239–406](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L239)，历史 commit `94be77a` |
| v2 固定四人、固定技能、无招聘成长；固定三报价、初始声望 0。 | 被六能力、核心/临时、四企划、初始声望 100 覆盖。 | A/B；[GAME_RULES.md:148–158](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L148)、[DATA_MODEL.md:26–30](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L26) |
| v2 外包固定增加 8 工作量、质量 50；最终质量权重 300/400/300。 | 被五阶段、供应商任务与 M1 阶段质量模型取代。 | B；历史 commit `94be77a`，当前 [game_rules.hpp:47–64](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L47) |
| v2 事件可直接延期；破产后回 idle 继续接单；利润不含开工拨款。 | 被事件受控通路、破产不可逆、现金与利润恒等式覆盖。 | A/B；[GAME_RULES.md:12–21](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L12)、[GAME_RULES.md:34–44](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L34) |
| “公司同一时间只能推进一个项目”“首版不做多项目并行”。 | 被本轮多作品并行方向覆盖；仓库文档尚未同步。 | A（当时规则）+A（本轮覆盖）；[GAME_RULES.md:507](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L507)，commit `b900c7e`；[GAME_DESIGN.md:171](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_DESIGN.md#L171)，commit `998be6e` |
| 制作预算按总投资 20% 或 50% 反推。 | 当前改为合同预算直接作为制作预算，委员会投资规模为其 2 倍。 | A；[GAME_RULES.md:561–580](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L561) |
| 商业分成曾使用 `commercial_share_received=floor(revenue×investment_percent/100)` 的单渠道公式。 | 被 BD 50%、委员会非 BD 按投资比例、承制成功奖励框架取代。 | A；[DATA_MODEL.md:109](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L109) |
| `V1_BALANCE_PROPOSAL` 中初始声望 0、同时在制项目 1。 | 初始声望已由 100 覆盖；单项目已由本轮方向覆盖。该文件本身仍只是初始数值提案。 | C/A；[V1_BALANCE_PROPOSAL.md:3](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/V1_BALANCE_PROPOSAL.md#L3)、[V1_BALANCE_PROPOSAL.md:36–46](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/V1_BALANCE_PROPOSAL.md#L36) |

---

## 3. 已讨论但未定案的事项

| 事项 | 当前结论 | 等级与证据 |
|---|---|---|
| 最终阶段质量权重 | 已确认按规模选择模板、常规模板前期到后期递减；具体模板与数值未定。 | A/C；[GAME_RULES.md:170–176](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L170) |
| 阶段能力权重 | 已提出复合能力权重，但明确是供 #4 校准的提案；当前代码仍是单需求专业模型。 | C/E；[GAME_RULES.md:84–98](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L84) |
| 项目预算、工期、工作量 | M2 推荐值及 V0.5/V0.6 模拟参数均非最终平衡；当前核心使用另一套 M1 固定目录。 | C/E；[GAME_RULES.md:92](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L92)、[ECONOMIC_SIMULATION_REPORT_V0.5.md:3](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/ECONOMIC_SIMULATION_REPORT_V0.5.md#L3)、[game_rules.hpp:84–98](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L84) |
| 作品评级、适配度、重大事故 | 方向已确认，分数线、适配度算法、事故影响与“作品彻底失败”条件未定。 | A/C；[GAME_RULES.md:174–176](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L174)、[GAME_RULES.md:234](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L234) |
| 加班产能 | 当前核心只体现加班费用和额外士气消耗，不增加工作量；模拟器使用“常规工时 20% 上限”，但明确是占位实验参数。 | B/C/E；[game_core.cpp:1045–1055](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1045)、[ECONOMIC_SIMULATION_REPORT_V0.5.md:16–21](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/ECONOMIC_SIMULATION_REPORT_V0.5.md#L16) |
| 商业公式 | 渠道基础规模、质量兑现、热度、声望、前作、成功奖励、爆款等方向已确认，具体曲线和系数未定。 | A/C；[GAME_RULES.md:449–493](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L449) |
| 系列继承 | 定性规则已确认；销量区间、积累值、三档权重、映射阈值、各档系数未定；前传/外传无公式。 | A/C；[GAME_RULES.md:461–493](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L461) |
| 衍生作品 | 续作/前传/外传已确认；独立衍生企划、商品化任务、授权开发不是当前已确认规则。 | A/D/E；[Issue #8](https://github.com/zhengmin486/anime-production-committee/issues/8)、[PR #25 §17.4–17.5](https://github.com/zhengmin486/anime-production-committee/pull/25) |
| 委员会延期 | 仅委员会、最多一次已确认；费用、周数、压力增量仍未定。 | A/C；[GAME_RULES.md:68–82](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L68)、[V1_BALANCE_PROPOSAL.md:172–188](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/V1_BALANCE_PROPOSAL.md#L172) |
| 委员会停止活动 | “完结即停止”已由本轮确认；未结分成、渠道收入、成员义务、失败/中止项目如何处理未定。 | A（本轮）/E；2026-11-24 本轮审计指令 |
| 多项目资源竞争 | 方向已确认；人员互斥、供应商容量预留、共享周成本、事件暂停范围、结算顺序均未定。 | A（本轮）/E；2026-11-24 本轮审计指令 |
| 动态排班 | PR #20 只证明当前实验条件下动态排班未稳定优于固定排班；阶段并行、事件、现金流、正式违约未模拟。 | D；[PR #20](https://github.com/zhengmin486/anime-production-committee/pull/20) |
| PR #25 候选架构 | “作品驱动”“委员会商业机制”“长期合作关系”“商品化/授权/IP 交易”等仍是研究假设；只有本轮明确采纳的部分升级为 A。 | D/A；[PR #25 §6、§17.2](https://github.com/zhengmin486/anime-production-committee/pull/25) |

---

## 4. 仓库文档、代码与历史决定之间的差异

| 主题 | 文档/历史决定 | 当前代码或契约 | 等级与证据 |
|---|---|---|---|
| 单项目承载 | 旧设计明确单项目；本轮已覆盖 | `GameState` 仍只有单 `project`、全局 `phase`、单 `pending_event`；非 idle 时 `offers` 必须为空 | A/B/E；[gameV3.ts:271–288](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L271)、[gameV3.ts:672–685](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L672) |
| 普通企划模式 | 普通企划必须双模式 | `make_offer` 只输出 `contract`；TS 守卫只强制原创仅委员会，不强制普通企划双模式 | A/B；[game_core.cpp:177–186](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L177)、[gameV3.ts:459–475](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L459) |
| 最终质量权重 | 按规模模板，常规模板前期递减 | 固定 `150/200/250/200/200`，后期高于前期 | A/B；[GAME_RULES.md:173](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L173)、[game_rules.hpp:51](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L51) |
| 阶段能力 | 复合能力权重提案 | 只用阶段单一需求专业做适配，工作量读取员工所选 `focus` 能力 | C/B；[GAME_RULES.md:98](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L98)、[game_core.cpp:1043–1051](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1043) |
| 经验增长 | 无有效工作量不得获得专业经验 | 只要被配置到工作中，每周给 focus 经验 `+2`，未检查 `gain>0` | A/B；[GAME_RULES.md:14](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L14)、[game_core.cpp:1055](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1055) |
| 加班 | v3 已改为阶段方案；最终产能未定 | 当前只增加每人 25,000 费用和额外 -6 士气，不增加工作量 | B/C/E；[game_rules.hpp:18](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L18)、[game_rules.hpp:41](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/include/game_rules.hpp#L41)、[game_core.cpp:1073–1080](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1073) |
| 商业结算 | BD 50%、渠道分账、成功奖励、投资本金分开 | 当前只算临时商业分与收入，写入履历；不加入公司现金，不结算 BD/委员会/成功奖励 | A/B；[GAME_RULES.md:179–189](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L179)、[game_core.cpp:1159–1160](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1159)、[game_core.cpp:1201–1207](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1201) |
| 项目利润 | 应包含商业分成、成功奖励、投资本金并减项目成本 | 当前为 `contract_received - costs_total` | A/B；[GAME_RULES.md:39–44](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L39)、[game_core.cpp:1207](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1207) |
| 金融与履历字段 | 数据模型有 `success_reward_received`、`commercial_rank` | TS `Finance` 无成功奖励字段，`WorkRecord` 无 `commercial_rank`；C++ 也不输出 | C/B；[DATA_MODEL.md:27](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L27)、[DATA_MODEL.md:39](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L39)、[gameV3.ts:58–63](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L58)、[gameV3.ts:230–252](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L230) |
| 系列继承 | 已确认前作影响商业基础 | 报价 `previous_work_id` 恒为空；商业评分不读 history；无系列 ID、关系类型或分支结构 | A/B；[game_core.cpp:177–186](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L177)、[game_core.cpp:1159–1160](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1159)、[gameV3.ts:634–644](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L634) |
| 市场热度 | 按主要题材维护四档热度 | `ProjectOffer` 没有题材字段，核心也没有热度状态 | A/B；[GAME_RULES.md:160–168](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L160)、[gameV3.ts:107–127](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L107) |
| 事件、招聘、外包、委员会 | 目标契约与规则已列出 | 当前初始化 `suppliers=[]`；招聘/外包拒绝；在途外包阻止推进；委员会开工、推进、结算均拒绝 | A/B；[PROGRESS.md:107–116](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/PROGRESS.md#L107)、[game_core.cpp:745–755](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L745)、[game_core.cpp:850](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L850)、[game_core.cpp:866](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L866)、[game_core.cpp:1154](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1154) |
| 文档进度 | `DATA_MODEL/API` 仍称前端主流程未接 V3 | `PROGRESS` 已记录 M1 前端 V3 主流程完成 | C/E；[DATA_MODEL.md:5–7](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L5)、[API.md:5–7](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L5)、[PROGRESS.md:100–104](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/PROGRESS.md#L100) |
| NPC 质量波动 | `PROGRESS` 写 ±50 | `GAME_RULES` 当前为 ±30 | C/E；[PROGRESS.md:128](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/PROGRESS.md#L128)、[GAME_RULES.md:440](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L440) |
| 委员会解散 | 本轮确认完结即停止 | 无解散状态、义务清单或独立动作；仅在结算清空 `project` 时消失 | A（本轮）/B/E；[game_core.cpp:1210–1213](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1210) |

---

## 5. 与其他系统的依赖和冲突

| 依赖系统 | 已确认边界 | 多项目下的冲突 | 等级与证据 |
|---|---|---|---|
| 员工与招聘 | 核心员工跨项目成长；临时员工按项目招募并释放；经验来自实际工作 | 当前只有单项目临时名册与单阶段配置；同一核心员工同周跨项目分配、疲劳共享与恢复未建模 | A/B/E；[STAFF_MODULE.md:17–23](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/TEAM_DELIVERABLES/STAFF_MODULE.md#L17)、[gameV3.ts:645–659](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L645) |
| 供应商与外包 | 六属性、专业与剩余产能匹配、应急下周生效、不插队 | 当前无供应商行为；`capacity` 没有跨项目预留/占用账本，无法表达真实争用 | A/B/E；[STAFF_MODULE.md:25–28](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/TEAM_DELIVERABLES/STAFF_MODULE.md#L25)、[game_core.cpp:753–755](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L753) |
| 财务 | 工资、运营每周只扣一次；公司账与项目账是同一交易的两个视图 | 多项目重叠时，共享周成本如何归属项目、项目利润如何与现金恒等式同时成立未定 | A/B/E；[GAME_RULES.md:12–14](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L12)、[GAME_RULES.md:39–47](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L39)、[game_core.cpp:757–767](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L757) |
| 市场与企划 | 四槽、原创/提案独立槽、成绩解锁读历史 | 报价只在 idle 存在；制作中如何获取第二部、刷新与机会占用如何同步未定 | A/B/E；[gameV3.ts:672–677](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L672)、[M2_INTEGRATION_REVIEW.md:40–45](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/M2_INTEGRATION_REVIEW.md#L40) |
| 制作事件 | 每周最多一个、同一时间最多一个待处理事件，出现后暂停推进 | 单 `pending_event` 会把一个项目的事件锁扩展到全公司；暂停范围与优先级未定 | A/B/E；[GAME_RULES.md:219–230](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L219)、[gameV3.ts:619](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L619)、[gameV3.ts:684](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L684) |
| 公司终局与作品履历 | 关闭后只结清项目；历史只追加；总结只读历史 | 多部在制、待交付、待结算作品的同时终局顺序、seed 消耗和声望日志顺序未定 | A/B/E；[API.md:76–80](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L76)、[DATA_MODEL.md:52–54](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L52) |
| 委员会与渠道 | 成员和渠道在立项固定；收入在作品完成后统一结算 | “作品完结即委员会停止”与“尚未结算分成”之间存在时间差；停止后由谁保留结算快照、成员义务是否终止未定 | A（本轮）/B/E；[GAME_RULES.md:187–189](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L187)、[DATA_MODEL.md:31](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L31) |
| 经济与排班模拟 | V0.5/V0.6 使用顺序单项目、4 人、70 工作量/周占位产能；PR #20 未模拟阶段并行 | 现有模拟不能证明多项目资源竞争、人员争用或并行结算的平衡性 | C/D/E；[ECONOMIC_SIMULATION_REPORT_V0.5.md:35](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/ECONOMIC_SIMULATION_REPORT_V0.5.md#L35)、[ECONOMIC_SIMULATION_REPORT_V0.6.md:93–102](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/ECONOMIC_SIMULATION_REPORT_V0.6.md#L93)、[PR #20](https://github.com/zhengmin486/anime-production-committee/pull/20) |

---

## 6. 新架构需要重新讨论的问题

以下都是 **E 级待决问题**，不是本审计提出的新规则。

1. **项目集合与状态归属**：多个项目各自保存阶段、事件、外包和待结算状态后，公司级 `phase` 保留哪些语义，哪些状态必须改为项目局部？依据：[gameV3.ts:271–288](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L271)。
2. **周推进语义**：一次 `advance_week` 是推进全部可推进项目、由玩家选择项目，还是按固定顺序推进？同周多个项目完成、触发事件或进入终局时如何处理？依据：[API.md:16](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L16)、[GAME_RULES.md:17–18](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L17)。
3. **核心人员竞争**：同一员工能否同周参与多个项目；疲劳、士气、经验如何只结算一次；休整是否等同于不能参与其他项目？依据：[STAFF_MODULE.md:17–23](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/TEAM_DELIVERABLES/STAFF_MODULE.md#L17)。
4. **供应商产能**：`capacity` 是每周产能、项目总产能还是可预留量；多项目同时外包时如何锁定剩余产能？依据：[DATA_MODEL.md:36–37](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L36)。
5. **经营窗口**：既然制作中可同时推进多部，市场刷新、招聘、挖人和原创创建是否仍只允许 idle/project_settled？依据：[API.md:24–44](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L24)、[STAFF_MODULE.md:35](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/TEAM_DELIVERABLES/STAFF_MODULE.md#L35)。
6. **事件暂停范围**：一个项目的待处理事件只暂停该项目，还是暂停全公司周推进？依据：[GAME_RULES.md:222](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L222)。
7. **共同成本归属**：周工资、运营费进入哪一个或哪些项目账；项目利润与公司现金变化如何保持恒等式？依据：[GAME_RULES.md:39–47](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L39)。
8. **终局结清顺序**：520 周、主动结束或破产时，多部在制/待结算项目按什么顺序生成交付原因、扣罚、商业收入和声望日志？依据：[API.md:76–80](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/API.md#L76)。
9. **系列身份与关系**：`previous_work_id` 只能表达单一前作链；同一 IP 的续作、前传、外传以及并行系列作品如何标识和引用？依据：[gameV3.ts:634–644](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L634)、[GAME_RULES.md:203–205](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L203)。
10. **委员会停止与结算**：作品“完结”是指五阶段完成、进入 `project_ready`，还是完成商业结算？未结分成、渠道收入和成员义务在停止后如何保留？依据：[DATA_MODEL.md:31](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L31)、[GAME_RULES.md:187–189](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L187)。
11. **存档与界面**：多项目状态如何保存、恢复和校验；调度界面如何表达人员冲突，同时保持轻量经营？依据：[DATA_MODEL.md:57–65](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L57)、[GAME_DESIGN.md:9–11](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_DESIGN.md#L9)。

---

## 7. 有证据支持的改进建议

| 建议 | 等级 | 依据 |
|---|---|---|
| 先由负责人把本轮六条方向登记为正式决策，明确只覆盖“单项目限制”，不连带改变五阶段、质量公式、周制或合作模式。 | E | [GAME_RULES.md:507](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L507)、[GAME_DESIGN.md:171](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_DESIGN.md#L171) |
| 在新增多项目行为前，先分离“公司级状态”和“项目级状态”；不要直接把多个 `Project` 塞进现有全局 `phase/pending_event/preview`。 | E | [gameV3.ts:271–288](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L271)、[gameV3.ts:669–685](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L669) |
| 先定义人员、供应商和周成本的共享资源账本，再讨论多项目排期；否则“真实资源竞争”无法被核心校验和测试。 | E | [STAFF_MODULE.md:17–28](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/TEAM_DELIVERABLES/STAFF_MODULE.md#L17)、[GAME_RULES.md:39–47](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L39) |
| 优先补齐商业结算与项目利润口径：BD、成功奖励、投资本金、项目成本分别记账，确保现金只变一次。 | E | [GAME_RULES.md:33–44](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L33)、[game_core.cpp:1159–1207](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/packages/game-core/src/game_core.cpp#L1159) |
| 为多项目建立独立验收矩阵：同周双项目推进、人员冲突、供应商容量、事件暂停、共同周成本、同时交付、公司终局、存档恢复。 | E | [M2_INTEGRATION_REVIEW.md:101–130](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/M2_INTEGRATION_REVIEW.md#L101) |
| 系列先补“关系与身份”最小模型，再实现继承数值；在系数未确认前，不要把最近三部、换题材降档等骨架直接写成公式。 | E | [GAME_RULES.md:461–493](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/GAME_RULES.md#L461)、[gameV3.ts:634–644](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/apps/web/src/types/gameV3.ts#L634) |
| 为委员会明确“项目快照—作品完成—商业结算—停止活动”的边界；长期公司状态不承载委员会实体。 | E | [DATA_MODEL.md:31](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/DATA_MODEL.md#L31)、2026-11-24 本轮审计指令 |
| 在文档中持续区分“目标契约、已实现行为、实验参数、开放研究”，并优先修正普通企划双模式、经验增长、质量权重、利润公式等已识别差异。 | E | [PROGRESS.md:42–51](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/PROGRESS.md#L42)、[M2_INTEGRATION_REVIEW.md:11–16](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/M2_INTEGRATION_REVIEW.md#L11) |
| PR #20、V0.5/V0.6 只作为现有单项目基线；人员与供应商契约稳定后，再增加多项目竞争模拟，不用当前模拟结果冻结最终平衡。 | E | [PR #20](https://github.com/zhengmin486/anime-production-committee/pull/20)、[ECONOMIC_SIMULATION_REPORT_V0.6.md:93–102](https://github.com/zhengmin486/anime-production-committee/blob/a74c23a87f012dfdc1af0eaeb4fb37d83486d352/docs/ECONOMIC_SIMULATION_REPORT_V0.6.md#L93) |
