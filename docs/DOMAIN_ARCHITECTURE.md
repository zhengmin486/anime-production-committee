# 《动画制作委员会》领域架构设计

> 状态：架构设计 v1.4（v1.3 之后确认项目内定向 DEC-PLAY-004，当前无待裁决事项）
> 日期：2026-11-24
> 分支：`architecture/domain-architecture-v2-20261124`（承接 `docs/decision-baseline-alignment-20261124`）
> 上位文档：[核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)；权威产品决策：[DECISION_LOG.md](DECISION_LOG.md)。本文不得把已确认决策重新列为待裁决。
>
> **本文的地位**：本文回答系统如何被组织——领域边界、状态所有权、模型形状、接口与依赖、结算机制、迁移路径。产品规则以 DECISION_LOG.md 为准；本文的模型和接口属于架构设计，可由架构智能体根据仓库材料进一步完善，但不得改变已确认的玩法边界。旧 `ARCHITECTURE.md`、`DATA_MODEL.md`、`API.md` 与 `GAME_RULES.md` 中的 V2/V3 内容主要描述历史运行时或旧契约，不得误读为当前目标玩法。
>
> **持续演进约束**：本架构是可修补的目标基线，不是一次性冻结后禁止调整。缺陷和遗漏优先在现有边界内增量修复；涉及状态所有权、领域边界、跨模块契约或已确认玩法的变更，按[工程变更治理](ENGINEERING_CHANGE_GOVERNANCE.md)评估、审批并提供迁移与回归证据。
>
> **标记体系**（沿用仓库习惯，避免把设计判断伪装成产品决策）：
>
> | 标记 | 含义 |
> | --- | --- |
> | **[已确认]** | 负责人已表达的产品决策或已冻结规则，本文不得单方面改变 |
> | **[裁定]** | 本文作为架构设计作出的专业决定；可评审、可调整，但不需要逐条请示 |
> | **[待验证]** | 依赖原型、模拟或试玩才能确认的技术/业务假设 |
> | **[待裁决]** | 仅用于尚未由负责人决定、且确实改变核心玩法或玩家控制权的事项；已确认事项必须引用 DECISION_LOG.md，不得重新提问 |

---

## 0. 摘要

### 0.1 一句话结论

采用**模块化单体 + 纯规则内核 + 单点结算事务**：9 个有状态领域各自独占自己的事实，1 个无状态规则内核承载全部数值计算，应用层只做编排不写公式，每周结算以"不可变快照 → 全量计算 → 一次提交"实现原子推进。

### 0.2 与讨论稿相比的四个关键调整

| # | 调整 | 一句话理由 |
| --- | --- | --- |
| 1 | **取消"Project 管生命周期 / Production 管制作规则"的双状态划分** | 制作阶段就是项目生命周期，拆成两个状态所有者会让每周结算在两者之间来回搬运同一份进度；改为 Project 独占制作状态，Production 降级为无状态规则内核 |
| 2 | **取消独立的 Resource Allocation 领域** | 分配不该是可变的共享账本，否则必然出现重复占用与陈旧预留；改为"玩家决策（唯一项目归属/计划）+ 内核确定性求解 + 单次提交"，可用产能永远由已存在的合同和归属推导 |
| 3 | **新增 Vendor、Archive 两个领域；Market、Partnership 收窄** | 外包是采购合同（有产能、交付、失败），不是制作；作品履历与系列是唯一只追加、永不修改的数据，混在公司状态里正是历史审计反复出错的根源 |
| 4 | **随机性改为按坐标定位的无状态随机** | 单一全局随机流在多项目下必然"项目顺序影响结果、加模块改变历史"；改为 `hash(seed, week, stream, purpose, index)`，同一决策序列与同一 seed 必然复现，且与遍历顺序无关 |

### 0.3 架构是否已可实施

领域边界、状态所有权、结算契约与依赖方向已有完整初稿；**代码迁移尚未开始**。本文件此前列出的 P1–P4 已被负责人在 2026-11-24 的明确决策覆盖，当前没有需要重新裁决的这四项；详见 DECISION_LOG.md。普通架构细节由主架构智能体自主推导。

### 0.4 v1.1 补齐了什么

v1.0 只给了骨架，并把"公共制作 + 单集 + 工作项"和"资金危机"留成占位。本版把三块已确认玩法落成可实现的模型：

| 内容 | 位置 | 结论摘要 |
| --- | --- | --- |
| 两层制作结构与工作项依赖 | §7.3 | 作品 = 1 个公共制作容器 + N 个单集容器；每个单集固定六阶段；**工作项是唯一的生产原子**，依赖跨容器生效，最低交付即解锁，产物状态全部可推导 |
| 员工严格单项目与磨合损失 | §7.2、§9.2 | 每名核心员工每周只有一个项目指针；不存支援份额；磨合损失由"是否接手已开工单元"推导，一次性、只扣工作量 |
| 资金预检失败 | §22 | 八阶段周结算；刚性支出预检失败则整周回滚并直接触发破产终局，不设危机周救济 |

### 0.5 已确认结论与剩余参数

以下原本作为"设计默认值"的行为已由负责人确认，不再是待决项：

| 事项 | 已确认结论 | 决策编号 |
| --- | --- | --- |
| 招聘/人员调整窗口 | 不要求全公司空闲；核心员工签约即入职、当周可分配；签约费立即入账，首周周薪从当周下一次周结算起算 | DEC-PLAY-003 |
| 交付时机 | 门槛达标后玩家可主动交付；交付即停止生产 | DEC-PROD-004 |
| 资金预检失败 | 回滚至阶段 1 快照并直接破产；不推进周数、不计入阶段 6 收入、不允许负现金欠付 | DEC-FIN-002/003 |
| 项目内定向 | 每项目至多一个目标（单集/阶段/无），只调排序优先级，不额外花钱 | DEC-PLAY-004 |

**当前没有待产品裁决的事项**。剩余参数标定包括单集数与每集工作项数量、磨合损失比例、质量聚合权重，以及新结算规则涉及的费用/阈值。旧危机周数与危机融资参数不再属于本玩法的标定项。

制作蓝图已从"待设计"变为"有可检查样例"：[蓝图规范](BLUEPRINT_SPEC.md) + [`tv_standard` 样例](blueprints/tv_standard.blueprint.json) + `npm run validate:blueprint`。

**M0 契约已冻结**：[M0 契约冻结（v4.0）](M0_CONTRACT_FREEZE.md) 把状态形状、27 条不变式、22 个命令、16 个错误码、存档拒绝策略固化为可检查条目，并附两类校验器的运行记录。旧危机白名单仅作历史记录；冻结后改契约需走变更说明。

---

## 1. 架构目标与边界

### 1.1 目标

1. **一个事实一个所有者。** 现金只有 Finance 能写；员工状态只有 Staff 能写；阶段进度只有 Project 能写。
2. **规则与状态分离。** 所有公式集中在无状态内核，可被单元测试穷举；领域只持有状态和不变式。
3. **周结算原子且顺序无关。** 同输入必然同输出；项目遍历顺序不得影响任何数值；任何一步失败不得留下半结算状态。
4. **多项目是一等公民。** 这是已确认基线，不是"以后可能"：不允许任何全局单例假设（全局 `phase`、全局 `project`、全局"当前事件"）继续存活。
5. **可解释。** 每个数值变化都能回答"为什么"：谁贡献、被什么惩罚、由哪次抽取决定。
6. **可演进，但不预建。** 单集六阶段、项目级公共制作、工作项依赖与八阶段原子周结算均为已确认玩法基线，必须纳入目标架构；retake、整集外包等尚未确认的扩展方向才只留接入缝。

### 1.2 明确不在本文范围

- 具体平衡数值（工作量、系数、阈值）——归数值平衡与 `balance` 配置。
- UI 版式与视觉设计——本文只定义读模型契约。
- 新玩法机制（如新增子系统）——需先过框架评审。
- 旧代码的大规模重写——本文给迁移里程碑，不在本轮执行。

---

## 2. 已确认基线、架构裁定与裁决状态

### 2.1 已确认的产品基线（不得被架构改变）

| # | 基线 | 来源 |
| --- | --- | --- |
| B1 | 多项目并行，不设固定项目数量上限；经营约束由资金、人员与外包产能自然形成，首版不设独立管理负荷数值 | DECISION_LOG：DEC-PLAY-001 |
| B2 | Company 是长期经营主体，Project 是单部作品的独立项目主体 | 框架 §3.1/§3.2 |
| B3 | 员工归公司所有，通过分配参与项目 | 框架 §4.2 |
| B4 | 公司只有一个真实现金池；项目账只做财务归因 | 框架 §9.1；GAME_RULES V3.3 |
| B5 | 项目有独立制作计划与生命周期；已配置方针自动执行，重大调整与异常才需玩家处理 | 框架 §2.1/§5.2 |
| B6 | 工作量与质量分离；随机结果在周结算揭晓 | 框架 §5.3/§5.4 |
| B7 | 所有周数变化经统一周结算 | 框架 §2.3/§9.2 |
| B8 | 520 周、以周为基本时间步 | 框架 §2.2 |
| B9 | 项目级公共制作 + 单集制作两层结构；单集固定六阶段：单集内容设计、分镜与原画、动画制作、美术与视觉制作、摄影与剪辑、声音与最终交付 | DECISION_LOG：DEC-PROD-001/002 |
| B10 | 委员会随单部作品成立、结束后停止活动；合作关系沉淀为公司资产 | 框架 §3.4 |
| B11 | 承制/委员会两种合作模式、BD 50/50、非 BD 按投资比例、投资比例 10–100% | GAME_RULES V3.11/V3.12 |
| B12 | 声望唯一写入点、只由经营行为改变、不衰减 | GAME_RULES V3.9 §1 |
| B13 | 核心员工每周严格单项目分配；禁止同周支援、借调与拆分工时 | DECISION_LOG：DEC-STAFF-001 |
| B14 | 已配置计划自动执行，但不自动招聘临时员工或新增外包合同 | DECISION_LOG：DEC-PLAY-002 |
| B15 | 不设固定项目数量上限；首版不引入独立管理负荷数值 | DECISION_LOG：DEC-PLAY-001 |
| B16 | 刚性支出预检失败时整周回滚并直接触发破产终局，不设限时危机窗口 | DECISION_LOG：DEC-FIN-002 |
| B17 | 周结算采用八阶段原子流水线；预检失败不扣款、不推进制作/人员/延迟/事件/周数 | DECISION_LOG：DEC-TIME-003 |
| B18 | 招聘/抽卡/解雇不要求全公司空闲 | DECISION_LOG：DEC-PLAY-003 |
| B19 | 门槛达标后玩家可主动交付，交付即停止生产 | DECISION_LOG：DEC-PROD-004 |
| B20 | 每项目至多一个项目内定向目标（单集/阶段/无），只调排序优先级，不额外花钱 | DECISION_LOG：DEC-PLAY-004 |

### 2.2 本文的架构裁定（摘要）

| # | 裁定 | 位置 |
| --- | --- | --- |
| A1 | 取消"Project 生命周期 + Production 执行状态"的双所有者，Production 变为无状态内核 | §4.1 |
| A2 | 取消 Resource Allocation 领域；分配是每周确定性求解，不是持久账本 | §4.2、§9.3 |
| A3 | 新增 Vendor（外部产能）与 Archive（作品履历与系列） | §4.3 |
| A4 | 现金、声望、周数三者各有唯一写入方（Finance / Company / Company） | §5.7、§6 |
| A5 | 质量由六维质量档案承载，阶段、单集与作品质量由维度逐层聚合 | §7.3.4 |
| A6 | Project 表达两层结构：1 个公共制作容器 + N 个单集容器；工作项是唯一生产原子，依赖跨容器生效 | §7.3 |
| A7 | 随机性改为坐标式无状态随机，种子只保留 master seed | §11 |
| A8 | 派生值不进存档；读模型由核心重算 | §12.3 |
| A9 | 项目账不是独立账本，而是 Finance 流水的归因视图 | §7.5 |
| A10 | 存档直接升级到 v4，显式拒绝 v3 存档，不做迁移 | §12.2 |
| A11 | 分派两级：员工→项目由玩家指定；项目内→工作项由内核确定性分派，玩家可用一个定向目标调整优先级（DEC-PLAY-004） | §7.3.5 |
| A12 | 工作项状态全部派生（是否解锁、是否达最低交付、是否完成），不存状态机字段 | §7.3.3 |
| A13 | 磨合损失由"员工是否首次参与已开工单元"推导，不新增逐周惩罚计时器 | §7.2.1 |
| A14 | 资金危机是 Finance 的偿付状态机，不是 Company 的终局状态；危机结算为独立路径 | §7.5.2、§9.3 |
| A15 | `deliver_work` 在同一次提交内完成交付结算（不入下一周结算），周数不变，项目立即停止生产 | §7.3.6 |

### 2.3 需验证的假设

| # | 假设 | 验证方式 |
| --- | --- | --- |
| H1 | 单一 JSON 状态文档在 520 周、3–5 项目（含 TV 13 集×6 阶段×工作项）、30 家竞争公司规模下，单次推进与序列化可接受 | WP4 模拟器实测帧时与状态体积 |
| H2 | 六维质量档案不会让玩家理解成本上升 | WP10 静态原型与试玩 |
| H3 | 坐标式随机在"同周多项目同时抽取"时不产生可被玩家察觉的规律 | 模拟器统计分布检验 |
| H4 | 不设管理负荷数值时，"多开"仍会因人员、现金与供应商产能形成可读代价 | WP4 对照实验（这是对 DEC-PLAY-001 的验证，不是重新讨论） |
| H5 | 工作项自动分配（按门槛/关键路径/方针）产出的结果玩家能理解，且不产生"系统替我乱安排"的观感 | 回执文案与试玩 |
| H6 | 单集 12–13 集规模下，工作项数量不使周结算与存档体积失控 | 模拟器长跑 |

### 2.4 产品裁决状态

本文件原 P1–P4 已被负责人明确决策覆盖（招聘窗口 DEC-PLAY-003、主动交付 DEC-PROD-004、危机语义 DEC-FIN-003），项目内定向也已确认（DEC-PLAY-004，O2）。

**当前没有待产品裁决的事项。** 剩余工作是参数标定（危机期限与融资条件、磨合比例、蓝图粒度）与实现。只有提出改变 DECISION_LOG 中已确认玩法的方案时，才提交决策变更提案。

---

## 3. 总体结构

### 3.1 分层

```text
┌──────────────────────────────────────────────────────────────┐
│  UI (React) — 只展示读模型、只发命令，不含任何规则            │
└───────────────────────────┬──────────────────────────────────┘
                            │ JSON 命令 / 状态
┌───────────────────────────▼──────────────────────────────────┐
│  API 适配层 (WASM/Embind) — 反序列化、schema 校验、错误映射   │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│  Application — 用例编排、周结算事务、快照组装、读模型投影     │
│  （不写任何公式；只决定顺序、守卫与提交）                     │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│  Domain（9 个有状态领域）                                     │
│  Company │ Staff │ Project │ Vendor │ Partnership │ Market    │
│  Finance │ Event │ Archive                                    │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│  Rules Kernel（无状态纯函数）                                 │
│  production │ allocation │ commerce │ evaluation │            │
│  competition │ rng                                            │
└───────────────────────────┬──────────────────────────────────┘
┌───────────────────────────▼──────────────────────────────────┐
│  Infrastructure — 存档编解码、内容目录、诊断日志、版本         │
└──────────────────────────────────────────────────────────────┘
```

### 3.2 领域之间的实际关系

```text
                    ┌──────────────┐
                    │   Company    │  周数·声望·终局（只读广播）
                    └──────┬───────┘
                           │ 读
   ┌───────────┬───────────┼───────────┬────────────┬───────────┐
   ▼           ▼           ▼           ▼            ▼           ▼
┌───────┐ ┌────────┐ ┌──────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐
│ Staff │ │Project │ │  Vendor  │ │Partnership│ │ Market │ │ Event  │
└───┬───┘ └───┬────┘ └────┬─────┘ └────┬────┘ └────┬────┘ └───┬────┘
    │         │           │            │           │          │
    └─────────┴───────────┴────────────┴───────────┴──────────┘
                            │ 只发交易，不读回
                    ┌───────▼────────┐        ┌──────────┐
                    │    Finance     │◀───────│ Archive  │ 只追加
                    └────────────────┘        └──────────┘
```

说明：这是一张"写入与依赖"图，不是数据流全图。领域之间**不互相读写状态**；跨领域读取统一经应用层组装的不可变快照（§8.3）。Finance 被所有领域调用（记账），但不反向依赖任何领域；Archive 只被写入，不被任何领域修改。

### 3.3 部署与技术形态（不变部分）

继续保持单体、静态站点、C++17 纯规则编译为 WASM、无后端、无网络、无系统时间、无 `double`。领域划分是**代码组织与契约组织**，不是运行时进程划分。不引入微服务、事件总线或数据库。

---

## 4. 领域划分与调整说明

### 4.1 裁定：取消"Project 管生命周期、Production 管生产规则"

讨论稿 §4.1 建议 Project 管阶段与生命周期、Production 管工作定义与产出计算，并让 Production 在项目范围内持有"工作执行记录"。该建议在评审中被否，理由如下。

**问题一：同一事实出现两个所有者。** "当前阶段完成度"既是生命周期状态（决定是否进入下一阶段），又是生产执行结果（工作量累积）。按建议拆开后，Project 持 `status`，Production 持 `work_done`，每周结算必须两边同步；校验器无法在不跨模块读取的情况下判断"阶段 completed 但 work_done < work_total"这类非法状态。这正是历史审计中"状态所有权不清"的同一形态。

**问题二：边界沿错误的轴切开。** 该建议切分的是**状态**，而真正需要分离的是**状态与规则**。项目生命周期没有独立于生产过程的业务含义：项目不在"做完原画"之后还有什么别的生命周期事件，阶段完成即生命周期推进。

**问题三：无法独立演进。** 两个状态所有者必须同版本发布、同时改测试夹具，实际上是一个模块，只是被拆成两个目录并增加了一层搬运代码。

**裁定（A1）：**

- **Project 领域独占**：项目身份与合同快照、合作模式与投资、阶段状态与进度、质量档案、制作计划、风险快照、交付结果。
- **Rules Kernel / production** 只提供**纯函数**：阶段工作需求、产能换算、工作量增量、质量维度增量、质量传递上限、阶段完成判定阈值、风险压力计算。它不持有任何状态、不被任何领域实例化保存。
- **不存在**"Production 领域的项目执行记录"。执行记录就是 Project 的阶段状态。

这样，"项目管什么"和"制作怎么算"依然分离，但分离的是**状态与算法**，不是两份状态。

### 4.2 裁定：取消独立 Resource Allocation 领域

讨论稿把资源分配列为候选领域。评审认为它不应作为有状态领域存在，理由如下。

**问题一：可变分配账本是并发与陈旧状态的温床。** 只要"占用"被持久化，就必须处理：承诺未兑现是否释放、项目取消是否回滚、周中改计划是否重算、存档恢复后占用是否仍然有效。这些都不是玩法，是纯粹的簿记风险。历史审计已记录过"资源重复占用"与"顺序偏差"两类缺陷。

**问题二：分配本质上是一个纯函数。** 给定（每个项目的计划与阶段需求、每个员工的唯一项目归属与可用状态、每份外包合同的周产能及其他已确认资源）就能唯一确定本周谁能做多少。它是**计算**，不是**状态**。首版不建立独立管理负荷数值。

**裁定（A2）：**

| 关注点 | 归属 |
| --- | --- |
| 玩家意图：某员工主要服务哪个项目 | Staff（持久状态，单一字段） |
| 玩家意图：项目本周投入强度、优先级、外包策略、赶工 | Project.plan（持久状态） |
| 已承诺的产能：外包合同 | Vendor.OutsourceContract（持久状态） |
| 本周实际分配结果 | 结算期内的临时对象，**不持久化** |
| 分配算法（单项目归属校验、产能→工作项分派、磨合损失、确定性打破平局） | Rules / allocation（纯函数） |
| 冲突时的裁决与提交 | Application（编排） |

由此得到两条结构性不变式，可被测试直接断言：
- 核心员工每周只有一个项目归属；不允许同周支援、借调或拆分工时。周结算后允许重新分配。
- 某供应商的周承诺产能 = Σ 其 active 合同周产能 ≤ 供应商容量（由合同校验保证，不存在第二份预留表）。

### 4.3 裁定：新增 Vendor 与 Archive，收窄 Market 与 Partnership

| 候选模块 | 处置 | 理由 |
| --- | --- | --- |
| Company | 保留，**收窄**：只管周数、声望、终局、组织能力；不管现金（归 Finance）、不管员工（归 Staff） | 避免 Company 成为第二个 GameState |
| Project | 保留，**扩大**：吸收制作执行状态（阶段/进度/质量/计划/风险） | 见 §4.1 |
| Production | **降级为规则内核**，不再是领域 | 见 §4.1 |
| Staff / People | 保留 | — |
| Resource Allocation | **取消**，拆入 Staff / Project / Vendor / 内核 / 应用层 | 见 §4.2 |
| Collaboration | **改名 Partnership 并收窄**：合作方、关系、邀请、委员会；合同付款义务归 Finance，商业分账计算归内核 | "合作"与"钱"是两个规则体系，原先混在一起 |
| Market | **收窄**：企划机会、市场热度、竞争公司与竞争作品模拟；不含商业分账 | 分账是交付时的规则，不是市场的状态 |
| Finance | 保留，**强化为唯一货币权威** | — |
| Event & Risk | **拆开**：Event 为领域；Risk 降为 Project 的派生属性 | 风险没有独立生命周期，它每周从状态重算 |
| **Vendor（新）** | 供应商目录、产能、外包合同与交付、可靠性 | 外包是采购，不是制作；它有自己的交付与失败语义 |
| **Archive（新）** | 作品履历（只追加）、系列/IP 关系、公司结局评价快照 | 唯一永不被修改的数据，必须与可变状态物理隔离 |

**为什么不是 9 个以外的更多模块：** 设施已确认是辅助成长路径，资金危机也已确认需要支持；但它们不必然要求新增独立领域。架构智能体应判断现有 Company/Finance 是否足以承载，避免为机制预建空模块。

---

## 5. 各领域职责与状态所有权

### 5.1 Company（经营主体）

**职责**：公司身份、经营时间、声望、组织长期能力、公司终局。

| 拥有 | 不拥有 |
| --- | --- |
| 当前周 `week`、经营上限 `max_week`、公司状态与结束原因 | 现金余额（Finance） |
| 声望值、声望变更日志（唯一写入点） | 员工记录（Staff） |
| 公司名称、开业周、设施/组织能力（首版可为空集合） | 项目进度（Project） |
| 终局评价输入快照（实际评价由 Archive/内核产出） | 作品履历（Archive） |

**规则边界**：Company 不计算任何公式；`change_reputation(delta, reason, week)` 是其唯一变更入口，负责钳制下限 0、不设上限、不衰减、追加日志。

### 5.2 Staff（人员与组织）

**职责**：公司人力资产的完整生命周期与每周状态。

| 拥有 | 不拥有 |
| --- | --- |
| 员工档案：岗位、六项能力、经验、潜力与已揭示潜力、特质、雇佣形态 | 某项目的制作进度（Project） |
| 周薪、临时人员项目费、合同起止 | 项目的人员编制与计划（Project.plan 只表达需求取向） |
| 疲劳、士气、离职预警 | 本周实际分配结果（结算期临时对象） |
| **唯一项目归属**（玩家决策的持久化落点；每周仅一个项目） | 项目是否值得开工（应用层与玩家） |
| 招聘池、抽卡保底计数 | 独立管理负荷数值（首版不设；组织协调因素不得形成独立负荷表） |
| 经验成长的累计值 | 经验如何换算为能力增长（内核） |

**派生但不必存储**：某员工当前分配的工作项与产能（内核每周现算）、是否处于磨合周、部门归属（首版不做）。

**不设管理负荷（[已确认] DEC-PLAY-001）**：本领域不维护任何"管理容量/管理跨度/协调惩罚"数值。多开的代价只来自：核心员工被占满、现金与融资能力、供应商产能、项目风险暴露。任何形式的"隐藏协调折扣"都是管理负荷的别名，不实现；若试玩证明多开无代价，应作为新的玩法决策提出，而不是在实现里偷偷加系数。

### 5.3 Project（作品项目）

**职责**：一部作品从立项到结算的全部项目级事实。

| 拥有 | 不拥有 |
| --- | --- |
| 项目身份与企划快照（名称、来源、规模、题材、目标质量、合同预算、期限） | 企划机会池（Market） |
| 合作模式、投资比例与投资额、委员会引用 | 委员会成员名单与关系（Partnership） |
| 项目级公共制作与单集六阶段/工作项状态、工作量、进度、质量档案 | 员工能力与疲劳（Staff） |
| 工作项依赖图、最低交付门槛、单集交付条件 | 员工当周产能如何分配（内核，§7.3.5） |
| 制作计划（投入强度、取向、外包策略、赶工） | 外包合同与交付（Vendor）；自动采购授权（不允许） |
| 延期次数与截止周 | 现金与成本（Finance） |
| 风险快照与预警（派生） | 事件冷却与待处理事件（Event） |
| 交付结论（原因、周、档案引用） | 作品长期档案（Archive） |

**关键边界**：Project 不知道钱。它只声明"本周有哪些可推进的工作项、什么取向、外包策略"，并在结算后接收"本周实际获得多少工作量与质量增量"。金额与收入只由 Finance/Archive 持有；Project 的交付结论只记原因、周与档案 id，不重复存一份收入。

### 5.4 Vendor（外部产能）

**职责**：公司可购买的外部制作能力及其合同履约。

| 拥有 | 不拥有 |
| --- | --- |
| 供应商目录：专业方向、周产能、质量、速度、单价、可靠性、解锁周 | 项目阶段进度（交付结果回填给 Project） |
| 外包合同：标的阶段/能力、总量、周产能、费用、签约周、交付期限、状态 | 项目的成本汇总（Finance 归因） |
| 合同交付进度与失败结果 | 员工的疲劳与成长（供应商不产生内部人员状态） |

**为什么外包合同不在 Project 里**：合同有独立的签约、交付、失败、退款语义，而且它是供应商产能的占用凭据。放在 Project 里，供应商侧就必须再维护一份"被谁占了"的反向索引——这正是要避免的双写。

### 5.5 Partnership（产业关系）

**职责**：合作方与关系，以及项目级委员会的成立与解散。

| 拥有 | 不拥有 |
| --- | --- |
| 合作方档案：类型、可开放渠道、实力/知名度、关系值、合作历史 | 投资金额与付款（Finance） |
| 委员会：成员构成（一个成员一个渠道）、成立周、状态、解散周 | 项目投资比例（Project） |
| 邀请与接受结果 | 分账计算（内核 commerce） |

**生命周期**：委员会随项目成立，项目结算时转 `closed`，成员与结果沉淀为关系历史；不存在"活动中委员会"跨项目复用。归档快照写入 Archive，但 Partnership 保留关系值与历史（这是公司资产，不是项目数据）。

### 5.6 Market（市场与企划）

**职责**：玩家可接触的机会、市场热度、竞争环境。

| 拥有 | 不拥有 |
| --- | --- |
| 市场企划槽（含 IP 上门）、自定企划槽、员工提案槽 | 已开工项目（Project） |
| 各题材热度档位与最近变化周 | 商业收入（内核计算、Finance 入账） |
| 竞争公司集合与竞争作品模拟的输入快照 | 竞争作品的长期记录（只保留玩家作品名次） |
| 刷新周期与上次刷新周 | 声望（Company） |

**企划是值对象**：被 Project 消费时整体快照复制，Market 侧删除。此后修改企划模板不会影响在制项目。

### 5.7 Finance（财务）

**职责**：公司唯一货币权威与全部实际资金变化记录。

| 拥有 | 不拥有 |
| --- | --- |
| 期初资金、当前余额、全部流水（**唯一可写 cash 的模块**） | 商业收入怎么算（内核） |
| 流水分类（17 类：4 流入 + 13 流出，含融资与还款）、项目归因维度、对手方、备注 | 预算承诺是否合理（应用层守卫） |
| 贷款、还款计划与偿付状态（`normal` / `crisis`） | 融资额度与利率如何算（内核 commerce/finance） |
| 余额不变式（余额 = 期初 + Σ流水） | 项目利润口径（归因视图，不是新账本） |

**危机归 Finance 不归 Company**：资金危机是"偿付能力状态"，不是公司终局。Company.status 仍是 `running`，公司可以继续经营与自救；只有危机期限耗尽才由应用层把 Company 转 `closing/bankrupt`。把危机塞进 Company.status 会让"running"同时表示两种截然不同的经营状态，UI 与守卫都要写特例。

**项目账的定位（A9）**：不存在第二个账本。项目账 = 按 `work_id` 过滤流水后的聚合视图，每次读取时计算。这直接消灭了"项目累计成本与公司现金不一致"这类历史缺陷，也让"同一笔只扣一次"成为结构性事实而非纪律要求。

### 5.8 Event（事件与风险）

**职责**：事件实例、触发选择、冷却与待处理状态。

| 拥有 | 不拥有 |
| --- | --- |
| 项目独立的待处理事件数组 EventState.pending[]（每项目每周最多一个，可多项目同周并存） | 项目质量与进度（Project） |
| 每项目的冷却表、已触发重大事件、延后事件 | 员工状态（Staff） |
| 每项目独立的事件触发评估与冷却；不做跨项目优先级仲裁 | 事件造成的资金变化（Finance 入账） |
| 事件内容目录的引用 | 风险值（Project 派生） |

**边界**：Event 只**选择**事件并持有待处理实例；效果由应用层翻译成各领域的公开命令执行。事件永不直接写 Project/Staff/Finance 的字段。

### 5.9 Archive（作品履历与系列）

**职责**：已完成作品的永久记录、系列关系、公司结局评价。

| 拥有 | 不拥有 |
| --- | --- |
| 作品档案（只追加，永不修改） | 在制项目（Project） |
| 系列/IP 关系（允许分支，不强制线性） | 续作商业系数怎么算（内核） |
| 公司结局评价结果 | 公司当前声望（Company） |
| 历史名次、渠道对账、团队快照、重大事件 | 竞争作品记录（不保存） |

**为什么单独成域**：它是唯一"写入即冻结"的数据。与可变状态混放会导致两种错误——历史被结算逻辑意外修改，或为了"防止修改"而在各处加守卫。物理隔离后，规则可以简化为一句话：Archive 只有 `append`，没有 `update`。

---

## 6. 数据所有权矩阵与生命周期

### 6.1 所有权矩阵

| 数据 | 唯一所有者 | 允许的写入方 | 主要读取方 | 生命周期 |
| --- | --- | --- | --- | --- |
| 当前周、经营上限 | Company | Company | 全部 | 全公司，每周 +1 |
| 声望值与日志 | Company | Company（唯一入口） | 全部（只读） | 全公司，永久 |
| 公司状态/结束原因 | Company | Company | 全部 | running→closing→ended |
| 员工档案与能力/潜力 | Staff | Staff | 结算快照、UI | 全公司，永久 |
| 疲劳/士气/经验 | Staff | Staff（周结算） | 结算快照 | 每周变化 |
| 员工唯一项目归属 | Staff | Staff（玩家命令） | 分配求解 | 每周有效；周结算后可重新分配 |
| 员工上次参与记录（用于磨合判定） | Staff | Staff（周结算） | 分配求解 | 每周覆盖一次 |
| 招聘池/保底计数 | Staff | Staff | UI | 全公司 |
| 项目身份与企划快照 | Project | Project（立项时写入，此后冻结） | UI、交付结算 | 立项→结算 |
| 合作模式/投资比例 | Project | Project（立项时冻结） | 财务、分账 | 立项→结算 |
| 单集、阶段、工作项状态与质量 | Project | Project | 结算快照、UI | 立项→交付 |
| 工作项依赖图与最低交付门槛 | Project | Project（立项时按模板实例化后冻结） | 分配、交付判定 | 立项→交付 |
| 工作项参与者集合（用于磨合判定） | Project | Project（周结算） | 分配求解 | 随工作项，1–3 个 id |
| 制作计划 | Project | Project（玩家命令） | 分配、生产 | 当前未结算经营周的计划态；周结算按最终计划执行，已结算周不追溯 |
| 风险快照 | Project（派生） | 内核计算，Project 持有 | Event、UI | 每次结算重算 |
| 供应商目录与产能 | Vendor | Vendor（解锁时） | 分配、UI | 全公司，只增不改 |
| 外包合同与交付 | Vendor | Vendor | 生产结算 | 签约→交付/失败 |
| 合作方与关系值 | Partnership | Partnership | 邀请、UI | 全公司，永久 |
| 委员会构成 | Partnership | Partnership（成立/解散） | 分账、归档 | 立项→结算 |
| 企划机会槽 | Market | Market | 立项、UI | 每周刷新 |
| 市场热度 | Market | Market（周期更新） | 生成、商业结算 | 全局，周期变化 |
| 竞争公司集合 | Market（由 seed 派生） | Market（初始化） | 竞争模拟 | 全局，不修改 |
| 现金与流水 | Finance | Finance（唯一入口） | 全部（只读） | 全公司，永久 |
| 贷款、还款计划与偿付状态 | Finance | Finance（融资/结算） | 预检、UI | 签约→还清/违约 |
| 待处理事件 | Event | Event | UI | 数组多实例；逐项处理，全部清空后才可推进 |
| 事件冷却/已见重大事件 | Event | Event | 触发评估 | 随项目，结算后归档 |
| 作品档案 | Archive | Archive（只追加） | 商业/系列/结局/UI | 永久 |
| 系列关系 | Archive | Archive（追加） | 企划生成、商业 | 永久 |
| 公司结局评价 | Archive | Archive（终局一次） | UI | 终局后 |

### 6.2 项目生命周期与数据迁移

```text
Market.offer ──(start_work)──▶ Project{ planning }
                                   │ 蓝图实例化：公共制作 + N 个单集的工作项就绪
                                   ▼
                              Project{ producing } ──每周──▶ 工作项推进 / 门槛解锁
                                   │ 全部门槛项已交付（玩家交付或到期强制）/ 公司关闭
                                   ▼
                              Project{ delivering }
                                   │ 交付结算（一次）
                                   ▼
                              Project{ settled } ──快照──▶ Archive.WorkRecord（冻结）
                                   │                        └▶ Partnership.committee = closed
                                   │                        └▶ Finance 收入入账
                                   │                        └▶ Company 声望变化
                                   ▼
                              项目从活动集合移除（记录保留在 Archive）
```

**结算后各数据的处置**：

| 数据 | 处置 |
| --- | --- |
| 项目级状态（工作项进度、计划、风险） | 随 Project 移出活动集合；单集摘要与质量已进 Archive |
| 事件冷却/延后事件 | 随项目归档，不再参与触发 |
| 外包未完成合同 | 状态置为 `failed`，不退款（首版），不再产生产能占用 |
| 委员会 | `closed`，成员关系写回 Partnership |
| 员工归属 | 清空 `assignment_work_id`，员工回到未分配 |
| 临时员工 | 合同到期自动释放，档案从名册移除，历史快照留在 Archive |
| 现金与流水 | 永久保留（含 `work_id` 归因） |

---

## 7. 核心领域模型

### 7.1 全局根与标识

```text
GameState (v4)
├─ version: 4
├─ seed: uint32                      // master seed，唯一随机输入
├─ company: Company
├─ staff: Staff[]                    // 含临时人员
├─ works: Project[]                  // 活动项目（settled 后移出）
├─ suppliers: Supplier[]
├─ contracts: OutsourceContract[]
├─ partners: Partner[]
├─ committees: Committee[]
├─ market: MarketState
├─ events: EventState
├─ finance: Ledger
└─ archive: Archive
```

标识约定（沿用并收紧）：ID 为非空字符串、全局唯一、语义前缀（`work_`、`staff_`、`cplt_`、`sup_`、`ctr_`、`partner_`、`evt_`、`ip_`）。不再使用"当前项目""当前事件"这类隐含单例的语义。

### 7.2 Company 与 Staff

```text
Company {
  id, name, founded_week
  week: 0..520
  status: running | closing | ended
  end_reason: null | time_limit | bankrupt | voluntary
  reputation: >=0 ; reputation_log[{week, reason, delta, after}]
  office_tier: small | medium | large  // 玩家主动扩容后的当前办公场地规模；可跨级直达已解锁目标规模
  base_weekly_rent: >=0                // 当前办公场地规模对应的每周基础房租；扩容新增增量从确认后的下一次周结算起计提
  facilities: []                       // 已建造设施；可用槽位由 office_tier 推导
  // core_staff_capacity 由已达成的公司成长里程碑推导；只统计 core 员工名册，临时员工不占用；解锁后永久保留、只增不减，不依赖 office_tier / facilities
}

Staff {
  id, name, role, employment: core | temporary
  abilities{planning,direction,drawing,animation,management,postproduction}: 0..100
  experience{...}: >=0               // 各能力独立累计；仅有效实战产出获得经验
  potential{...}, revealed{...}      // 各能力独立潜力上限与揭示状态
  talent_type, traits[]
  signing_fee: >=0 ; weekly_salary: >0       // 一次性签约费 + 周薪；不再使用 project_fee
  fatigue: 0..100 ; morale: 0..100 ; departure_warning: bool
  assignment_work_id: null | work_id      // 本周唯一归属；null = 未参与任何项目
  last_participation: null | { work_id, unit_id, week }   // 上次实际参与的单元，磨合判定用
  temporary_contract: null | { work_id, start_week, end_week }
  joined_week, works_history[]
}
```

**概念与不变式**
- `Staff.role` 表示八种基础职业身份之一，不表示某个项目内的监督、脚本主责或作画主责岗位。项目岗位属于项目内分工，同一员工可在不同项目承担不同岗位；具体岗位数据归项目分配/制作模型管理。
- 六维 `abilities` 是专业能力，与职业身份分离；职业决定工作项主责/协力适配资格，能力决定对应工作的实际硬实力。工作项通过自身 `ability` 字段引用对应专业能力。
- `experience` 按能力独立累计；只有周结算中对工作项产生有效产出（`delta_work > 0`）的核心员工获得对应能力经验。监督岗位另按实际履职累计 `direction` 与 `management` 经验。临时员工不进入长期成长体系。
- `potential` 表示各能力独立的潜力上限，`revealed` 表示对应上限的揭示状态；综合潜力档位只用于招聘展示，不替代单项上限。
- `employment ∈ {core, temporary}` 时均使用 `signing_fee` 与 `weekly_salary>0`；不再保留 `project_fee`。`core ⇒ temporary_contract=null`；`temporary ⇒ assignment_work_id=temporary_contract.work_id`；临时员工的签约费与周薪归属其合同项目。
- 公司至少保留 1 名核心员工；`dismiss_staff` 不得将核心名册减到 0。
- `assignment_work_id` 为 null 或指向 `works` 中处于 `producing` 的项目；临时人员的归属恒等于其合同项目。
- 不存在 `support` / 支援份额 / 工时拆分字段：同周一人只出现一次（[已确认] DEC-STAFF-001）。
- `last_participation.week` 只能是 `week-1`：每次结算覆盖，不累积历史。
- `fatigue/morale` 只在周结算中变化；命令不得直接改。
- 离职预警为布尔，员工不会自发离场（[已确认] 只预警不随机离职）。

#### 7.2.1 磨合损失的判定与计算

**[已确认] 规则来自 DEC-STAFF-001，本小节只定实现方式。**

**判定粒度是工作项，不是单集**。规则原文是"接手其他员工已经开始的具体工作"，所以必须回答"这名员工是否参与过**这一个工作项**"，而不是"是否参与过这一集"。用容器级判定会同时产生两类错误：

| 误判 | 场景 | 容器级判定的结果 | 正确结果 |
| --- | --- | --- | --- |
| 假阳性 | A 在做第 3 集的原画；B 加入第 3 集做**尚未开始**的背景 | 该集已有进度 → B 被扣磨合 | 背景未开工，B 不扣 |
| 假阴性 | B 早前参与过第 3 集的背景；后来 A 开始原画，B 转去做 A 已开工的原画 | B 在该集参与者名单里 → 不扣 | B 是接手他人已开工的工作，应扣 |

因此判定输入是 `WorkItem.contributors`（见 §7.3.1），而不是容器上的参与者集合。

| 情形 | 触发条件 | 作用范围 | 效果 |
| --- | --- | --- | --- |
| 非监督人员接手已开工工作项 | 该员工不在 `item.contributors` 中，且 `item.work_done > 0` | 该员工在**该工作项**的本周产出 | 一次性扣减 `handover_loss_permille`（按岗位匹配与相关能力缩放），clamp 到该项本周产出 |
| 非监督人员接手未开工工作项 | `item.work_done == 0` | — | 无损失（即使是别人名下的新项） |
| 员工继续做自己参与过的项 | 该员工已在 `item.contributors` 中 | — | 不再触发（自然一次性） |
| 监督人员切换项目 | `last_participation.work_id ≠ assignment_work_id`，且本周是其在该项目的首个参与周 | **项目级**本周总产出 | 一次性扣减 `supervisor_switch_loss_permille` |

**监督人员**：岗位为 `director`、`animation_director`、`production_manager` 的员工。其切换代价是团队级的，因为监督换人会打断整条线的判断连续性；这一条仍然按项目判定，不拆到工作项。

**存储成本**：`contributors` 挂在每个工作项上，只记"参与过的人"，同一人只出现一次。TV 12 集 × 14 项 ≈ 168 项，每项通常 1–3 个 id，约 5–10 KB/项目。这是**为正确性付出的必要成本**：容器级省下的几 KB，换来的是每周都可能出现的错误扣减，而玩家无法从回执里看出为什么。

**实现要点**
- 员工在本周首次对某工作项产生非零产出时，把其 id 追加进该工作项 `contributors`，同时判断是否触发扣减（顺序不能颠倒，否则会把自己算成"已有参与者"）。
- 判定只看"本周之前是否参与过"，因此同一周内两人同时从零开始做同一项，双方都不扣。
- 磨合损失只作用于工作量，**不改质量维度增量**（[已确认]）。
- 不产生跨周计时器：一次性由 `contributors` 天然保证。

**纪律**
- 磨合损失只作用于工作量，**不改质量维度增量**（[已确认]），否则会变成"换人必然降质"的隐性惩罚。
- 一次性：不产生跨周计时器，不进入 `Staff` 的长期字段。
- 普通人员磨合的原始损失比例及 `management` 的具体缩放公式属于待标定参数。
- `management` 能力减免与团队润滑特性减免合计最多 50%，至少保留一半原始磨合损失；监督本人切换项目产生的团队层面损失独立计算，不享受这项减免。

#### 7.2.2 职业资格、工作项适配与监督任职

**规则依据：DEC-STAFF-006、DEC-STAFF-008。** 本节冻结跨模块边界，不替员工模块负责人填写职业映射与系数。

- 员工的八种基础职业身份（作画、演出、脚本、摄影、监督、音乐、声优、美术；由 Staff.role 表示）决定其对每个工作项的资格档位：主责、协力或不适配。职业资格是硬门槛；不适配员工不得进入该工作项的普通产能分派。
- 六维 abilities 只表示专业实力。通过职业资格后，工作项引用的专业能力才参与产能与质量计算；禁止使用单一 ability 同时推断职业资格和专业能力。
- 项目岗位与基础职业身份分离。监督是项目级统筹岗位，不是把员工 role 改成监督职业。
- 主责/协力采用独立适配效率档位，且与疲劳、磨合分开计算。主责人数不设上限，所有具备该工作项主责硬资格的员工均计为主责；多名主责共同决定质量水平与质量上限。协力为不具备主责资格但具备协力资格的员工，正常贡献进度，并按工作项基准线拉近或稳定质量下限，但不得突破主责团队决定的质量上限。不适配者不计入正常产能与质量贡献。
- 质量聚合不得按人数简单平均；多名主责之间的质量聚合、协力质量下限贡献及具体工作量加权方式由数值标定补齐，不能改变“协力不突破主责团队质量上限”的边界。
- 分配读模型必须向前端提供目标工作项下的主责/协力标签；不适配者不得作为普通可分配产能展示。
- 基础职业为监督者天然具备监督任职资格；演出、作画、脚本职业者须同时达到 direction 与 management 阈值。每个 producing 项目必须恰有一名监督（INV-27），监督当周须归属本项目。
- 监督资格只在任职/分配时校验；任职生效后，不因员工后续状态或属性波动而被动撤销。任何人员调整均不得使 producing 项目失去监督。
- 主动解雇、调离或外派监督必须先以原子 Swap/Replace 指定合格替补；替补仅限同项目员工或公司空闲员工，不得从其他项目强行抽调。无合格替补时原监督关键岗位锁定至项目完结/中止。
- 被动离岗时，先由该项目内能力最高的合格员工临时代理，其次从公司空闲员工中选择；不跨项目抽调。代理触发交接与代理效率修正，不改变职业身份。候选能力并列时按稳定员工 ID 顺序选择。无替补则项目进入监督缺位停工，本周不推进制作进度。
- `forced_rest` 期间保留原项目归属和岗位占位，但员工不贡献产能；玩家可周内主动调走。休养满期后的次周开局自动回归原岗位，不重新计算入组磨合。若监督位已由代理/替补接任，原监督回归后转为普通/协力参与位，不顶替现任监督。
- 监督统筹固定占用员工本周一定比例的统筹精力，剩余精力可参与本项目中其职业适配的普通工作项，并按主责/协力资格计产能。占比与产能折算待标定。
- 担任监督不改变 Staff.role，也不改变普通工作项职业映射。例如作画员工担任监督后，仍按作画职业适配普通工作项，不会因此获得分镜、脚本或剪辑资格。
- 监督切换不享受自身磨合减免。映射表、阈值、效率档位、统筹占比与质量基准参数由员工模块负责人补齐。

### 7.3 Project（作品项目）

#### 7.3.1 结构

```text
Project {
  id, ip_id: null|series_id
  offer: OfferSnapshot            // 立项时冻结：名称/来源/规模/题材/目标质量/合同预算/期限/自带渠道
  mode: contract | committee
  investment: { percent: 0|10..100, total: 0|2×budget, paid: 0|amount }
  committee_id: null            // 仅 committee 模式
  channels: channel[]           // 立项时确定：自带 ∪ 成员渠道 ∪ 电视服务
  tv_service: null | { purchased_week, cost }
  opened_week, deadline_week, extension: { used: 0|1, weeks: 0 }
  status: planning | producing | delivering | settled

  common: CommonProduction                 // 项目级公共制作（恰好 1 个）
  episodes: EpisodeProduction[]            // 单集（1..N）
  plan: WorkPlan
  risk: RiskSnapshot                      // 派生，不持久化（§12.3）
  delivery: null | { reason, week, work_record_id }
}

CommonProduction {                         // 公共制作容器，无阶段
  id, items: WorkItem[]
}

EpisodeProduction {
  id, index: 1..N
  stages: EpisodeStage[6]                 // 顺序固定，不可缺、不可换序
}

EpisodeStage { key, items: WorkItem[] }

WorkItem {
  id, key                                 // key 来自制作蓝图，稳定可读
  ability                                 // 驱动该工作项的专业能力
  work_total > 0, work_done >= 0          // work_done <= work_total
  deliver_at: 1..1000                     // 最低交付门槛（占 work_total 的千分比）
  deps: item_id[]                         // 可跨容器：公共制作 → 单集
  is_gate: bool                           // 是否为作品交付门槛项（仅单集末阶段）
  quality: {story,direction,drawing,animation,art,sound}: 0..100
  contributors: staff_id[]                // 磨合判定用；首次产出时追加，同一人只记一次
}

WorkPlan {
  intensity: low | standard | high        // 投入强度（影响周制作费与产出）
  focus: quality | schedule | cost        // 取向（只影响内核的工作项排序，不额外花钱）
  outsourcing: none | gap_fill | aggressive   // 仅影响对外包缺口的提示与默认建议
  overtime: off | conditional
  target: null                            // 项目内定向，见 §7.3.5（DEC-PLAY-004）
        | {kind: "episode", id}
        | {kind: "stage", key}
}
```

#### 7.3.2 立项：从蓝图实例化

企划只带**蓝图引用 + 单集数 + 工作量缩放**，不带 200 个工作项：

```text
Offer { ..., blueprint_id, episode_count, workload_scale_permille }

start_work ⇒ 实例化：
  common.items   = blueprint.common × scale
  episodes[i]    = blueprint.episode × scale     (i = 1..episode_count)
```

- 蓝图是**内容配置**，实例化后的工作项是**项目状态**：此后蓝图改版不影响在制项目。
- 单集数：TV 12–13、短篇 1–3、OVA/剧场版 1（`[PLACEHOLDER]`，由平衡定值）。剧场版单集即"一部作品只有一个交付单元"，不需要特例代码。
- 实例化时一次性写入全部工作项，不做懒加载：状态可校验、可复现。

**蓝图必须先有可检查的样例，M0 才算完成**。规范见 [制作蓝图规范](BLUEPRINT_SPEC.md)，样例见 [`blueprints/tv_standard.blueprint.json`](blueprints/tv_standard.blueprint.json)，校验命令 `npm run validate:blueprint`。

样例（12 集）的读数：

```text
单集 14 个工作项 / 596 点（5.96 人周）
公共制作 6 项 / 325 点（3.25 人周）
实例化 174 个工作项 / 7477 点（74.8 人周）
关键路径最重链 574 点（占单集总工作量 96%）
```

**为什么这条不能省**：字段齐全不等于结构成立。依赖有没有环、门槛是否可达、公共项是否真的成为单集前置、每集 14 项的粒度玩家是否还读得懂——这些只能靠一个真实样例 + 校验器回答。校验器已经用五类人为破坏（成环、删门槛、悬空依赖、缺阶段、孤立项）验证过会报错，见规范 §4。

#### 7.3.3 工作项状态全部可推导

**[裁定 A12] 不存状态机字段**。每个工作项只存 `work_done` 与 `quality`，其余全部由规则推导：

| 派生状态 | 判定 |
| --- | --- |
| `unlocked` | `deps` 中每一项都 `delivered` |
| `delivered` | `work_done × 1000 >= deliver_at × work_total` |
| `complete` | `work_done == work_total` |
| 阶段进度 | 该阶段 Σwork_done / Σwork_total |
| 单集可交付 | 该集所有 `is_gate` 项 `delivered` |
| 作品可交付 | 全部单集可交付（公共制作通过 deps 间接成为前置） |

**为什么坚持"派生"**：一旦存 `status`，就必然出现"status=delivered 但 work_done 不足"这类非法组合，校验器要为每个状态写断言。派生后不变式只剩两条：

1. `0 <= work_done <= work_total`。
2. `deps` 无环、只引用本项目内的工作项、且不得引用自身。

**并行与门槛同时成立**：依赖只在"交付门槛"处生效，不在"完成"处生效。A 项达到 `deliver_at` 即解锁 B，A 仍可继续做到 100% 提升质量——这就是"前序可继续完善"的结构表达，不需要额外的"完善阶段"概念。

#### 7.3.4 质量的聚合链

```text
工作项 quality（六维，逐周累加）
  → 阶段质量：按阶段内各工作项的 work_total 加权
  → 单集质量：按六阶段模板权重加权
  → 作品质量：按单集权重加权（默认等权）
```

- 每周产出写入的是**若干维度的增量**，落实"随机提升若干质量项"。阶段只决定本周哪些维度可能被提升（阶段→维度映射是内容配置）。
- **质量传递上限保留**（沿用"前期成果影响后期，但后期不能无限修复前期问题"）：某工作项的质量上限 = `min(其已交付依赖项的质量) × carry_over_permille + carry_over_offset`（默认 600‰ + 40，参数化）。依赖项含公共制作时，公共资产质量低就会压低下游项的上限——这就是"公共制作影响作品质量"的唯一通道，不需要再引入第二个修正系数。
- **公共制作不单独出"作品分"**：它只通过（a）依赖门槛、（b）上述质量上限影响结果。否则玩家会看到两套互相矛盾的质量数字。
- 修复旧口径：不得沿用"整部作品五阶段加权"（`game_rules.hpp` 的 150/200/250/200/200 属于历史实现，不是设计依据）。
- 企划适配度只影响 S/A/B/C/D，不反向修改质量。

**风险**：六维 + 三层聚合会让 UI 有变复杂的倾向。守卫办法是只在"项目详情"展开六维，公司总览只显示单集/作品质量与评价。

#### 7.3.5 产能如何落到工作项（分派与项目内定向）

**[已确认] DEC-PLAY-004：两级分派 + 每项目一个可空定向目标。**

```text
第一级：员工 → 项目，由玩家指定（DEC-STAFF-001）
第二级：项目内产能 → 工作项，由内核按确定性规则分派；
        玩家可通过 WorkPlan.target 施加一个低维定向

输入：本周归属该项目的员工、其能力/疲劳/士气、项目计划、定向目标（可为空）
1. 候选 = 已解锁 且 未完成 的工作项
2. 排序（确定性，逐级比较）：
   a. 落在定向目标（target）内的项优先
   b. 未达 deliver_at 的工作项优先（先把门槛打通，让下游能开工）
   c. 阶段序号小者优先（内容设计 → … → 声音交付）
   d. 计划取向：quality → 该阶段质量权重高者；schedule → 剩余工作量小者（先收尾）；
      cost → 剩余工作量大者（摊薄固定费用）
   e. 工作项 id 升序（打破平局）
3. 每名员工按能力产出依次填充；专业不匹配按 fit 折扣（沿用 1200/800 口径）
4. 记录本周实际投入与 `contributors`，用于回执、磨合判定与经验成长
```

**定向目标的数据形状**

```text
WorkPlan.target: null
               | { kind: "episode", id: episode_id }
               | { kind: "stage",   key: stage_key }
```

| 规则 | 内容 |
| --- | --- |
| 数量 | 每项目至多一个，不叠加 |
| 作用域 | 只在"已解锁且未完成"的候选之间调整先后，**不改变候选集合** |
| 生效 | 与计划一致，下一次结算生效 |
| 失效 | 目标内没有可推进项（全部完成或全部未解锁）时自动回退到 b–e，不阻塞其他工作 |
| 代价 | 不额外花钱、不加隐藏系数；代价是其他集/阶段被挤占产能的机会成本 |
| 持久 | 设置后持续生效，直到玩家修改或项目结束；不要求每周重设 |
| 不提供 | 逐工作项指派（"让某人做某个具体工作项"）——那属于排班表 |

**为什么把 a 放在门槛之前**：玩家显式点名"这周保第 7 集"，系统就不该自作主张去打通别集的落槛项。反过来，如果定向挤掉了别的集的交付门槛，那是玩家的判断，回执会写明"本周产能集中在第 7 集，第 9 集门槛仍未达成"。

**为什么不加效率惩罚**：定向已经通过"产能有限"产生了真实代价。再叠一个"非目标集效率下降"的系数，就是又一个隐性惩罚数值，既难解释也难平衡。痛感应当来自"别的地方真的变慢了"，而不是来自一个乘数。

**为什么不做 O3（逐集/逐项指派）**：174 个工作项一旦可指派，UI 必然长成排班表，与"决策少而有分量"和 DEC-PLAY-002 的自动化边界直接冲突。需要更强控制时，应增加下一个低维旋钮（例如"暂停某集"），而不是把工作项摊开。

#### 7.3.6 交付：门槛达标后由玩家决定何时交

**[已确认] DEC-PROD-004。**

```text
可交付（全部 is_gate 项 delivered）
  ⇒ 玩家可 deliver_work：当次提交内完成交付结算，立即停止生产
  ⇒ 或继续投入直到 deadline_week 自动强制交付
不可交付 且 到达 deadline_week
  ⇒ 强制交付：按当前完成度结算，扣罚与声望损失
```

**交付的时点语义（必须明确，否则会出现"交付了还在生产"）**

| 事项 | 规则 |
| --- | --- |
| 结算时机 | `deliver_work` 在**同一次提交**内完成交付结算；不排到下一次周结算 |
| 周数 | 不变。交付不是一次时间推进 |
| 生产 | 立即停止：此后该项目不再获得任何工作量与质量增量 |
| 员工 | 归属自动清空，回到未分配；玩家需重新分配，否则这些人在下一次结算空转但仍计薪 |
| 外包 | 未完成合同置 `failed`，不退款，释放供应商产能 |
| 现金 | 阶段 2 预检只看快照现金；阶段 6 的商业收入与交付收入不得反向填补本周刚性支出 |
| 触发条件 | 全部 `is_gate` 项 `delivered`；未达门槛时该命令被拒绝 |

**为什么允许提前交**：已确认的"最低交付即解锁 / 之后仍可完善"若不配一个交付决定，打磨就是零成本的免费收益。提前交 = 省周数、可提前回款、但质量停在门槛；拖满 = 更高质量、继续占人占钱、冒延期风险。这是本作少见的"高杠杆、低频"决策，正好符合"决策少而有分量"。

**交付粒度是整部作品，不是单集**（对 DEC-PROD-004 的契约解释）：

- 合同、投资、渠道与商业结算都以**整部作品**为对象，单集没有独立合同，因此**不提供 `deliver_episode`**。
- 单集达标只改变"这部作品离可交付更近"，不产生任何独立收入或结算。
- "单集进度独立"与"单集可独立交付"是两件事：前者是生产组织，后者需要新的商业模型（按集售卖/分批交付）。若产品后续需要分批交付，属于新玩法，应单独提出。
- 强制交付按作品计算：门槛项完成比例 `gate_completion_permille` 决定扣罚与评价修正。

#### 7.3.7 风险快照（派生）

```text
RiskSnapshot {
  pressure: 0..100
  factors: [{code, contribution}]
  warnings: [{code, severity, target_week}]
}
```

输入：期限余量、门槛缺口（有多少 is_gate 项未达 deliver_at）、质量缺口、员工疲劳与士气、外包可靠性、事件累积。由内核计算，项目持有以便 Event 与 UI 读取，但**不写入存档**（可重算）。不含任何管理负荷指标。

### 7.4 Vendor / Partnership / Market

```text
Supplier { id, name, specialties[], capacity_per_week>0, quality, speed, price_per_unit, reliability, unlocked_week }

OutsourceContract {
  id, supplier_id, work_id
  episode_id: null | episode_id     // null = 项目级公共制作的工作项
  item_id                            // 外包的落点是具体工作项，不是"某个阶段"
  ability
  mode: normal | emergency
  work_total>0, work_done>=0, weekly_cap>0
  fee_total, fee_paid, signed_week, due_week
  status: active | delivered | failed
}

Partner { id, name, type: tv|publisher|toy|music|streaming|studio
          channels[], prestige, relationship: 0..100, history[], status: known|unavailable }
Committee { id, work_id, members[{partner_id, channel}], formed_week, status: active|closed, closed_week }

MarketState {
  heat: {genre: {level: boom|high|mid|low, changed_week}}
  slots: Offer[4], custom_offer: Offer|null, proposal: Offer|null
  refresh_week, last_competition_round
  competitors: Competitor[]        // 由 seed 派生，见 §12.3
}

Offer { id, name, source, genre, scale, contract_budget, duration_weeks, target_quality,
        audience_base, commercial_potential, channel_potentials{}, channels_baseline[],
        allowed_modes[], committee_candidates[], min_reputation, required_works[],
        previous_work_id: null|work_id,
        blueprint_id, episode_count>0, workload_scale_permille>0,   // 立项时实例化为具体工作项
        origin, style }
```

**不变式**
- `OutsourceContract.weekly_cap` 之和（同一供应商、active）≤ `Supplier.capacity_per_week`。
- 合同的 `item_id` 必须属于同一 `work_id`；`episode_id` 与该工作项所在容器一致。
- 同一工作项可同时接受内部产能与多个外包合同，但累计交付不得超过其 `work_total`（超出部分不出产、不退款）。
- `Committee.members` 中成员不重复、渠道不重复（一个成员一个渠道，`bd` 不挂成员）。
- `mode=contract ⇒ committee_id=null ∧ investment.percent=0 ∧ investment.paid=0`。
- `mode=committee ⇒ investment.percent ∈ {10,20,…,100} ∧ committee_id≠null`。
- `Offer.allowed_modes`：普通企划必含 contract 与 committee；原创只含 committee。

### 7.5 Finance

```text
Finance {
  opening_funds, balance
  entries: Entry[]                  // 只追加
  loans: Loan[]
  solvency: Solvency
}
Entry { id, week, work_id: null|work_id, category, amount: signed, counterparty: null|partner|supplier, memo }

流入（amount>0）：contract_received | commercial_share_received | success_reward_received | financing_in
流出（amount<0）：investment_paid | salary | operations | production | temporary
                  | outsourcing | events | extension | penalty | development | distribution
                  | loan_repayment | loan_interest

Loan { id, provider: bank | publisher | partner_id
       principal>0, remaining>=0, weekly_repayment>0, rate_permille, due_week
       status: active | repaid | defaulted }

Solvency {
  state: normal | crisis
  since_week, deadline_week: null | week
  gap: 0..                       // 进入时的强制费用缺口，用于展示与自救目标
  history: [{week, gap, resolved}]
}
```

**符号约定**：`amount` 带符号，`category` 只表示业务性质。由此"项目利润 = 该项目全部 entry 之和"，与 GAME_RULES V3.3 的四条恒等式一致，不需要另写一套利润公式。字段名沿用现有契约（`*_received` / `*_paid`），不因合并进统一流水而改名。

**不变式（可断言，且必须断言）**
1. `balance == opening_funds + Σ entries.amount`
2. 每笔 entry 只属于一个 category；同一笔现金不得产生两条 entry。
3. `amount<0` 的 entry 必须有对应合同、事件或结算原因（memo 记录来源 id）。
4. 项目归因视图：`Σ amount where work_id=w` 与该公司该项目的实际净贡献一致；不存在独立项目钱包。
5. 收入类 entry 只能在交付结算写入，不得中途入账（[已确认]）。
6. `balance < 0` **只允许**在 `solvency.state = crisis` 或公司已 `closing(bankrupt)` 时出现；正常周结算结束时余额不得为负。

#### 7.5.1 融资

**[已确认] 玩家可主动融资自救；系统不自动借款。** 架构只规定结构与约束：

- 融资是玩家命令 `arrange_financing(provider, amount)`，需要 `solvency.state = crisis` 或明确处于资金压力周（避免变成无限低息提款机）。
- 额度上限由内核按声望、作品履历、未偿还负债计算；利率与期限是参数 `[PLACEHOLDER]`。
- 每笔贷款产生固定周还款（`loan_repayment`）与利息（`loan_interest`），两者都进入**强制费用**，参与每周预检。这意味着"借钱拖延"会把未来周变得更紧，而不是免费续命。
- 贷款不得用于委员会投资本金（避免用借来的钱刷投资比例）。
- 到期还款属于刚性承诺付款；若阶段 2 预检时现金不足，按 §22.2 回滚并直接触发破产终局，不进入危机周。

#### 7.5.2 偿付状态机（旧限时危机方案，已由 §22 覆盖）

```text
normal --(周预检失败)--> crisis{since, deadline, gap}
crisis --(预检通过)--> normal
crisis --(deadline 用尽仍失败)--> 由应用层置 Company.closing/bankrupt
```

- **旧版危机状态（已废止）**：此前将 crisis 作为 running 公司下的资金状态并设置命令白名单；当前不再进入该状态，刚性支出预检失败直接按 §22.2 破产。
- 危机不自动解约：已签外包与临时合同继续存在。临时员工没有通用提前解约命令，只有特定危机/裁减事件明确提供选项时才可解除；解约停止后续周薪，已发生费用不退，不新增买断费、欠款、递延费用或借贷机制。
- 危机期间若玩家完全不操作，结果只能是破产；不存在"什么都不做就自己好起来"。

### 7.6 Event 与 Archive

```text
EventState {
  pending: [{ event_id, work_id, episode_id: null|episode_id, stage: null|stage_key,
             item_id: null|item_id, triggered_week,
             options[{id,label,cost,risk_hint}], expires_week, escalation }]
  last_event_week
  per_work: { work_id: { cooldowns{event_id: week}, major_seen[] } }
}

`pending` 是数组：每条事件归属一个项目，pending 中每项目至多一条；不同项目可同周各有一条。`resolve_event(work_id,event_id,option_id)` 只移除目标事件，不清空其他项目事件。pending 非空硬阻塞 `advance_week`；未处理事件不得暂存到 pending 之外以绕过阻塞。限时事件触发周计入有效期，每周末阶段 7 倒计时减 1；到期仍未处理时，阶段 7 自动执行预设默认分支并移出 pending。可升级的高权重关键事件最多升级一次，升级时沿用同一事件身份替换原 pending 条目；升级事件再次超时才执行硬性违约惩罚并移出 pending。超时处理不得覆盖其他项目事件。`last_event_week` 仅记录最近抽取周，不承担全局单槽或跨项目限流。破产终局不再推进周数或抽取新事件；终局前已有 pending 按既有规则处理。

Archive {
  works: WorkRecord[]              // 只追加
  series: { ip_id, title, works[], last_week }[]
  company_result: null | { reason, weeks, final_funds, net_cash_change, total_projects,
                           best_work_id, rating, highlights[], negatives[] }
}

WorkRecord { id, name, ip_id, source, genre, scale, mode, investment_percent,
             start_week, end_week, end_reason, episode_count, gate_completion_permille,
             quality{六维}, quality_score, rating, occurrence_issues[],
             commercial_revenue, channel_breakdown[], commercial_rank,
             finance_summary{contract_received, investment_paid, commercial_share,
                             success_reward, costs{}, profit},
             team[], episode_summary[{index, quality, completed_week}],
             committee_snapshot[], major_events[] }
```

**为什么履历只存"单集摘要"而不存全部工作项**：作品结束后没人会查看 230 个工作项的历史；保留 `episode_summary` + 六维质量 + 团队快照，足以支撑"复盘哪一集拖了后腿"，同时避免存档随作品数线性膨胀。

**不变式**
- `Archive` 只提供 `append`；任何领域不得修改已有 `WorkRecord`。
- `WorkRecord.id` 全局唯一；`previous_work_id` 必须指向更早记录，禁止自指、循环、未来引用。
- `series.works` 允许分支（一部作品可有多个后继），不要求线性。
- `channel_breakdown` 满足 Σrevenue = commercial_revenue、Σcompany_received = commercial_share（[已确认]）。

### 7.7 跨领域引用规则

1. 只允许**按 id 引用**，不允许嵌入另一领域的可变对象。
2. 快照（`OfferSnapshot`、`WorkRecord`、`TeamSnapshot`、`committee_snapshot`）是**边界复制**，必须一次性写全、此后冻结；快照不算第二所有者。交付结算的即时结果（`DeliveryResult`）只用于周回执，不入状态。
3. `work_id` 是贯穿各领域的**归因键**，不是外键约束；项目移出活动集合后，Finance/Archive 中的 `work_id` 仍然有效。
4. 任何"当前 X"（当前项目、当前事件、当前阶段）都必须显式带 id 或不存在。

---

## 8. 模块接口与依赖

### 8.1 硬性依赖规则

| # | 规则 |
| --- | --- |
| D1 | Rules Kernel 不依赖任何领域，不持有状态，不使用全局可变量，不读时间/IO/随机设备 |
| D2 | 领域之间不直接读写彼此的字段；跨领域读取只经应用层组装的不可变快照 |
| D3 | 依赖方向固定：UI → API → Application → Domain → Kernel；不得反向或横向 |
| D4 | Finance 被所有领域调用（记账端口），但 Finance 不依赖任何领域，只接收已算好的交易 |
| D5 | Company 不依赖任何领域；其他领域可只读 `week`/`reputation` |
| D6 | Archive 只有 `append`，不提供 update/delete |
| D7 | 只有 Finance 能写 `balance`；只有 Company 能写 `week`/`reputation`；只有 Project 能写阶段进度 |
| D8 | 应用层不得包含任何财务、生产、商业公式；只能调用领域命令与内核函数 |
| D9 | 领域命令必须满足：给定（状态快照, 命令）→ 新状态 + 交易列表 + 领域事件；不得中途读取外部可变状态 |
| D10 | 所有遍历顺序必须显式排序（按 id），不得依赖容器迭代顺序 |

### 8.2 命令接口

命令是**用例级**的，不是"万能 decision 联合类型"。每个命令有独立 schema、独立守卫、独立错误码。

| 命令 | 归属 | 守卫 | 主要效果 |
| --- | --- | --- | --- |
| `initialize_game(seed)` | Application | — | 建立公司、初始名册、供应商、合作方、市场首轮、空项目集 |
| `start_work(offer_id, mode, percent, committee_partner_ids)` | Application | 公司 running；非危机；企划存在且有效；模式合法；普通企划满足 `min_reputation/required_works` 或原创草稿存在且有效；现金覆盖全部应付款 | Project 建立、委员会成立、Market 消费企划、Finance 记投资与合同预算、员工可归属。原创声望资格在创建草稿时检查，不因有效期内轻微波动重复卡开工 |
| `set_work_plan(work_id, plan)` | Project | 公司 running；项目 producing；`plan.target` 须引用本项目单集/阶段，至多一个 | 更新周内计划态并刷新只读预览；实际制作效果在周结算发生 |
| `assign_staff(staff_id, work_id \| null)` | Staff | 项目存在且 producing；核心员工每周仅能归属一个项目；同时校验职业与目标工作项资格；项目/本周外派/主动待命三选一互斥 | 更新周内计划态并刷新只读预览；实际归属与产能效果在周结算快照中生效 |
| `hire_core(staff_id)` | Staff + Finance | 公司 running；非资金危机；候选人存在；现金 ≥ signing_fee；名册上限（若有）。不要求全公司空闲（DEC-PLAY-003） | 签约即入职、立即进入核心名册并可当周分配；signing_fee 入账，首周周薪计入本周下一次结算 |
| `scout(...)` | Staff + Finance | 公司 running；非资金危机；现金 ≥ 本次费用；招聘池非空。不要求全公司空闲 | 更新招聘池、保底计数并记费用 |
| `dismiss_staff(staff_id)` | Staff | 公司 running；core 员工存在；解雇后 core 数 ≥1。不要求全公司空闲，危机中也允许 | 移出名册、清空归属；不预付遣散费 |
| `hire_temporary(work_id, candidate_id)` | Staff + Finance | 公司 running；非资金危机；项目 producing；现金 ≥ signing_fee | 临时合同建立、signing_fee 即时入账；weekly_salary 从后续周结算计提并归属合同项目 |
| `sign_outsourcing(work_id, item_id, supplier_id, work_total, mode)` | Vendor + Finance | 工作项已解锁；专业匹配；供应商产能余量；现金 | 合同建立、费用入账、占用产能 |
| `deliver_work(work_id)` | Project + Application | 全部门槛项已交付；未过截止 | 转 delivering 并当次结清（§7.3.6） |
| `abort_work(work_id)` | Project + Finance | 项目 producing | 项目终止、违约扣罚入账、释放人员与外包占用 |
| `create_custom_offer(name, source, scale, style)` | Market + Finance | 公司 running；非资金危机；创建时检查基础声望资格；不要求具备企划职业员工作为硬性准入门槛，不检查全部投资资金 | 只创建自主原创草稿并记录资格通过状态，不建立 Project；草稿有效期与筹备消耗按 Market 规则处理，开发费金额与扣费时点待确认 |
| `adopt_proposal()` / `reject_proposal()` | Market | 公司 running；非资金危机；存在提案。不要求全公司空闲 | 提案转自定槽或清空 |
| `buy_tv_service(work_id)` | Project + Finance | 委员会模式；未购买；现金 | 渠道开放、发行费入账 |
| `request_extension(work_id)` | Project + Finance | 委员会模式；未用过；未过截止；现金 | 延期生效、压力与费用 |
| `arrange_financing(provider, amount)` | Finance | 偿付危机或资金压力周；额度未超限 | 现金入账、生成贷款与周还款计划（§7.5.1） |
| 办公场地扩容 | Company + Finance | 达到声望 190/350 对应扩容资格；非资金危机；现金覆盖一次性扩建搬迁费 | 玩家主动确认后即时扣费并立即扩至 4/6 个设施槽位，同时提高每周基础房租；不改变核心员工编制；具体命令名由接口契约确定 |
| `advance_week()` | Application | 公司 running；无待处理事件；周 < 520 | 执行完整周结算（§9） |
| `resolve_event(work_id, event_id, option_id)` | Event → Application | 该 work 存在对应 pending 事件；选项合法；现金足够（若需付款）；效果不绕过危机白名单 | 效果分派到各领域；只移除目标事件 |
| `end_company()` | Company + Application | 公司 running | 锁 closing，未交付项目转 delivering |
| `finalize_delivery(work_id)` | Application | 项目 delivering | 交付结算、写 Archive、关闭委员会 |
| `finalize_company()` | Application | 公司 ended 且全部项目已结算 | 生成公司结局评价 |

**为什么不是 `apply_decision(type, ...)`**：当前实现的单一 decision 联合类型把所有守卫挤进一个长 if 链，错误码与前置条件互相纠缠，新增玩法必须改同一个函数。用例级命令把守卫放在各自入口，也让 UI 与测试的意图更清楚。

### 8.3 跨领域读取：结算快照

应用层在每个结算步骤前组装一次不可变快照，领域只读快照、不读彼此：

```text
WeekSnapshot {
  week
  company{ status, reputation }
  finance{ balance, loans_due[], solvency }
  works[{ id, mode, deadline_week, extension, plan, risk,
          common{ items[{id, ability, work_total, work_done, deliver_at, deps, quality, contributors}] },
          episodes[{ id, index,
                     stages[{ key, items[{id, ability, work_total, work_done, deliver_at, deps, is_gate, quality, contributors}] }] }] }]
  staff[{ id, role, employment, abilities, fatigue, morale,
          assignment_work_id, last_participation, contract }]
  suppliers[{ id, capacity, reliability, specialties }]
  contracts[{ id, work_id, episode_id, item_id, ability, weekly_cap, status }]
  committees[{ work_id, members[] }]
  market{ heat, competitors[] }
  events{ pending, cooldowns }
}
```

**收益**：依赖关系从 O(n²) 降为"各自 → 快照"。也让"顺序无关"变成可测试属性——只要所有计算只读快照，遍历顺序就不可能影响结果。

**成本**：快照含全部工作项，TV 项目约 174 项（样例 12 集）。若实测拷断开销过大，允许快照持有只读引用而非深拷贝——但必须在类型层面禁止写入（`const`/只读视图），不能靠约定。

### 8.4 读模型

UI 不计算规则。核心在每次命令后输出读模型；读模型**不持久化**，加载时重算：

| 读模型 | 内容 |
| --- | --- |
| `company_overview` | 现金、本周/总周、声望、项目组合摘要（阶段、剩余工期、风险、资金占用）、人员负荷、待处理事项 |
| `work_detail(id)` | 公共制作进度、各集进度与阶段、门槛项状态、六维质量与聚合质量、计划与实际差异（含定向目标是否生效）、人员与外包占用、风险因素、预计可交付周 |
| `production_board(id)` | 工作项依赖视图：已解锁/门槛达标/完成三态，按阶段分组；默认折叠，只在玩家主动查看时展示 |
| `staff_board` | 每人归属、负荷、疲劳士气、可用性、预警 |
| `finance_summary` | 余额、分类汇总、项目归因、现金可支撑周数、贷款与下周还款、偿付状态 |
| `crisis_board` | 缺口、剩余期限、受影响项目、可采取的自救动作与代价 |
| `market_board` | 企划槽、热度、锁定原因、可获得的最佳机会 |
| `event_card` | 事件文本、选项、确定成本、风险提示 |
| `week_receipt` | 本周现金变化、高光、项目快照、普通可行动线索与完整阻塞待决区；硬阻塞与普通线索严格分区 |
| `navigation_hints` | Q7 未读且可行动的页签徽标；查看熄灭、实质状态跃迁重亮、解决/失效清除 |
| `action_preview` | 周内计划态操作的后果预览；不提交费用、进度、磨合或合同承诺 |

`week_receipt` 是易失的会话反馈，不写存档（沿用现有政策）：重载后不重建上一周回执。

### 8.5 操作窗口与生效时点

多项目后，"空闲窗口"这个概念不再成立（公司可能永远有在制项目）。必须显式定义什么时候能做什么、什么时候生效。

**窗口**

| 窗口 | 允许的命令 | 说明 |
| --- | --- | --- |
| 经营中（`running`，任意时刻） | `start_work`、`set_work_plan`、`assign_staff`、各类招聘/解雇、`sign_outsourcing`、`deliver_work`、`abort_work`、`create_custom_offer`、`adopt_proposal`/`reject_proposal`、`buy_tv_service`、`request_extension` | 不再要求"全公司空闲"。旧规则把招聘限制在 idle，是单项目时代的产物 |
| 经营中，无待处理事件 | `advance_week` | 事件未处理时禁止推进（[已确认] 事件暂停推进） |
| 有事件待处理 | `resolve_event`；其他命令仍按各自守卫 | `events.pending[]` 只硬阻塞 `advance_week`，不隐式增加招聘、签约或购买限制；处理一条不清除其他事件 |
| 资金危机中 | `arrange_financing`、`dismiss_staff`、`abort_work`、`set_work_plan`、`assign_staff`、`deliver_work`、`advance_week`；既有 pending 可用 `resolve_event` 处理 | **融资是唯一允许的新增资金动作**；危机期间不抽新事件；禁止其他新增承诺与新增项目支出：`start_work`、`sign_outsourcing`、招聘/抽卡、`buy_tv_service`、`create_custom_offer`（[已确认] DEC-FIN-003） |
| 关闭中（`closing`） | `finalize_delivery`、`finalize_company` | 不可逆；`advance_week` 被拒绝 |

**生效时点**

| 操作 | 现金 | 数值效果 |
| --- | --- | --- |
| 招聘核心员工 | 签约费立即入账 | 签约确认即入职、当周可被分配；首周周薪从签约后当前经营周的下一次周结算起计提 |
| 雇佣临时人员 | signing_fee 立即入账 | 下一周结算起可参与并计提 weekly_salary，绑定该项目；不再使用 project_fee |
| 外包签约 | 费用立即入账 | 最近一次结算起按周产能交付 |
| 买电视服务 | 发行费立即入账 | 立即开放渠道，交付时参与分账 |
| 延期申请 | 费用立即入账 | 立即延长 `deadline_week` |
| 改计划 / 改归属 | 无 | **下一次结算生效**，当周已发生的结算不追溯 |
| 立项 | 投资与合同预算立即入账 | 项目立即出现（工作项已实例化），首次结算即参与 |
| 人员/供应商解约 | 费用不退 | 立即释放占用，下周不再计费 |
| 交付 | 收入与扣罚立即入账 | 项目立即结算并归档 |
| 融资 | 本金立即入账 | 下周起产生还款与利息（计入强制费用） |

**纪律**：任何"立即生效"的操作都不消耗随机坐标、不推进周数；任何"下周生效"的配置在结算快照中被冻结，结算中途不得再读取可变状态（D9）。

#### 8.5.1 四类操作时序

规则依据：DEC-TIME-001/002。不得把所有周内操作都归入“下一周执行”。

| 分类 | 生效语义 | 操作 |
| --- | --- | --- |
| 即时操作 | 命令成功后立即改状态 | start_work（扣立项本金）、定金锁单、create_custom_offer、buy_tv_service、特殊商业机会签约（扣前置费）、arrange_financing、sign_outsourcing（占供应商产能/扣费）、scout（扣寻访费）、hire_core / hire_temporary（签约占名额）、dismiss_staff、设施建造/升级、办公场地扩容、deliver_work、abort_work、resolve_event |
| 计划态操作 | 周内实时预览；推进周结算后才产生实际效果 | assign_staff（社内项目/本周外派/主动待命三选一互斥）、set_work_plan（方针与定向目标）、项目加班开关 |
| 周结算操作 | advance_week 指定阶段统一执行，统一预检与原子提交 | 常规制作推进、一次性磨合判定、适配/疲劳/经验结算、外包按周交付、外派结算、固定成本与周薪预检扣款、市场与常规招聘池刷新 |
| 延迟生效操作 | 显式记录生效周数与状态标识，到期自动转换或结算 | 企划 2 周定金锁定倒计时、设施 2 周建设期（第 3 周起启用并计提维护费）、红灯员工 1–2 周强制休养、特殊商业机会约定收益（deliver_work 时入账）、资金危机倒计时 |

**hire_core 特例：** 只属于即时操作。签约即入职并占用名册，当周即可通过 assign_staff 分配；周薪从签约后的下一次 advance_week 周结算开始计提，不存在“下周才可用”的延迟状态。

**办公场地扩容：** 声望 190 解锁 2→4 槽，声望 350 解锁 4→6 槽；玩家主动确认并支付一次性搬迁费后立即完成，同时每周基础房租小幅上调。危机期间禁止扩容。费用与租金增量待标定。

**容量隔离：** Company 的办公场地规模（office_tier）决定设施槽位，初期/中型/大型分别为 2/4/6 槽；核心员工名册上限（core_staff_capacity）由独立的公司成长里程碑推导，不依赖 office_tier、设施槽位或作画工作室。开放编制不收扩容费，实际招聘受现金流与人才供给约束。编制成长曲线待标定。

---

## 9. 统一周结算

### 9.1 设计原则

| # | 原则 | 结构性保障 |
| --- | --- | --- |
| P1 | **原子** | 全部变更写入工作副本，最后一次性替换；任何步骤失败丢弃副本 |
| P2 | **顺序无关** | 先全局固定「人→项目」，再在项目内按固定规则分派工作项；所有计算只读快照；遍历按 id 排序 |
| P3 | **无部分承诺** | 产能不落账本（§4.2）；费用在一次提交中全部记入 |
| P4 | **可解释** | 每个增量带 `causes[]`；每个惩罚有稳定 code |
| P5 | **可复现** | 随机按坐标定位（§11）；无浮点 |
| P6 | **单入口** | 只有 `advance_week` 能改变周数；`deliver_work` 是唯一允许在周结算之外完成的结算动作（§7.3.6），其余结算派生状态只能由周结算产生 |

### 9.2 十三阶段契约

| # | 阶段 | 负责方 | 输入 | 输出/写入 | 失败语义 |
| --- | --- | --- | --- | --- | --- |
| 1 | 守卫 | Application | state | — | 非法命令：拒绝，状态不变 |
| 2 | 快照 | Application | state | `WeekSnapshot` | 不适用 |
| 3 | 需求合成 | Kernel/allocation | 快照 | 各项目「已解锁且未完成」的工作项、各员工可用产能 | 不适用 |
| 4 | 人员→工作项分派 | Kernel/allocation | 工作项 + 员工状态 + 唯一归属 + 外包交付 + 磨合判定输入 | `WeekAssignment`：谁做哪项、各项内部产出、外包交付、磨合扣减 | 不适用（产能不足不是错误，表现为进度慢） |
| 5 | 强制费用预检 | Application + Kernel | 快照 + 分派 | `MandatoryCost`（含工资、运营、制作、合同、延期、贷款还款与利息） | **不足 → 整周不提交，转入危机路径**（见 §9.3.1） |
| 6 | 原子记账 | Finance | MandatoryCost | 流水（分类见 §7.5） | 失败 → 整体回滚 |
| 7 | 制作执行 | Project + Vendor | 分派 + 外包交付 | 每项 `work_done` 与六维质量增量、门槛达成、单集进度 | 失败 → 回滚 |
| 8 | 人员结算 | Staff + Kernel | 实际参与 | 疲劳、士气、经验、预警、临时到期、`last_participation`、工作项 `contributors` 追加 | 失败 → 回滚 |
| 9 | 生命周期推进 | Project + Application | 门槛达成 + 截止 | 可交付标记 / 到期强制交付 / `delivering` | 失败 → 回滚 |
| 10 | 交付结算 | Application + Kernel/commerce/evaluation | delivering 项目 | 收入分账、Archive 记录、委员会关闭、关系、声望、系列 | 失败 → 回滚 |
| 11 | 事件抽取 | Event | 快照 + 冷却（仅 `producing` 项目） | 每项目每周最多一个；跨项目事件分别追加至 `events.pending[]` | 失败 → 回滚（事件不得导致半结算） |
| 12 | 时间与市场 | Company + Market | — | week+1、企划刷新、热度周期、提案、竞争轮次 | 失败 → 回滚 |
| 13 | 终局与回执 | Application | — | time_limit、危机期限判定、公司结局、周回执 | 失败 → 回滚 |

（阶段编号 1–13，其中 1、2 为准备，不产生业务变更。）

### 9.3 失败与终止的语义（旧危机流程为历史记录；当前以 §22 为准）

**空转周是合法状态**：一个项目都没有时仍可推进（[已确认] 空闲周照付工资与运营）。此时阶段 3–4 无需求、阶段 7–10 无对象，阶段 5–6 仍扣工资与运营，阶段 12 仍刷新市场与热度。不提供"无成本跳周"。

#### 9.3.1 预检失败：旧危机路径（已废止，仅保留历史记录）

预检失败时，**正常周结算整体丢弃**，但时间不能停在原地——否则"期限"无从定义、玩家可以无限挂机。因此定义一条**独立的危机结算**：

```text
正常预检失败
  ⇒ 丢弃本次正常结算的工作副本：不扣费用、不推进制作、不结算人员、不抽事件
  ⇒ Finance.solvency = crisis{since_week, deadline_week = since + crisis_weeks, gap}
  ⇒ 玩家必须在此后每个危机周作出自救动作，否则只能走向破产
```

**危机周结算（与正常结算不同的 7 步）**

| # | 步骤 | 说明 |
| --- | --- | --- |
| 1 | 守卫 | 公司 `running`、`solvency=crisis`、无待处理事件 |
| 2 | 固定成本记账 | 工资、运营、贷款还款与利息；**不计制作费**（因为不生产） |
| 3 | 人员结算 | 按"本周未参与任何项目"执行：疲劳恢复、无经验；**不写 `last_participation`**——否则停工数周后恢复生产会被误判成"全员换人"，凭空吃满磨合损失 |
| 4 | 允许负余额 | 余额可为负，负数即欠付；不自动借款 |
| 5 | 周数 +1 | 时间推进，危机期限按周倒计时 |
| 6 | 期限判定与市场轻刷新 | 到达 `deadline_week` 且下周强制费用仍无法覆盖 → 破产；市场只刷新企划槽与热度，不抽事件 |
| 7 | 危机回执 | 缺口、期限、受影响项目、可用自救动作与代价 |

**旧版危机期命令白名单（已废止）**：此前允许 `arrange_financing`、`dismiss_staff`、`abort_work`、`set_work_plan`、`assign_staff`、`deliver_work` 与危机周推进；当前不得据此实现危机周流程。
**旧版危机期禁用命令（已废止）**：此前禁止立项、外包、招聘、电视服务和自定企划，并将融资设为唯一例外；这些限制不再以危机状态为依据。

**旧版恢复条件（已废止）**：此前以之后某周预检通过作为恢复条件；当前预检失败即进入破产终局，不存在恢复周。

**为什么制作停摆**：如果危机周继续生产，就等于允许"欠着钱继续开工"，与"预检失败不得部分推进"直接矛盾。停摆 + 成本继续是刻意设计的双痛感，也是玩家必须动手的原因。

**周数推进与固定成本计提已由 DEC-FIN-003 确认为正式规则，不再是待决项**：危机期间正常推进周数、继续计提固定成本、允许现金暂时为负。剩余待验证的只有数值与期限（危机周数、融资额度、利率、还款周期、判定阈值），不影响本节的流程结构。

#### 9.3.2 破产

```text
crisis 期限用尽 且 预检仍失败
  ⇒ Company.closing, end_reason = bankrupt
  ⇒ 在制项目转 delivering，delivery_reason = company_closed
  ⇒ 允许负余额，终局显示欠付缺口
  ⇒ 不可逆：不因后续回款撤销
```

破产是**公司终局**，与"项目失败"无关：项目亏损、延期、质量不达标只影响扣罚、声望与关系。

#### 9.3.3 其他终止语义

**操作失败（回滚）**：除预检不足外的任何错误，都不许留下部分状态。状态是单文档，回滚即丢弃工作副本，不需要补偿事务。

**交付后现金不足**：不得将交付结算后的负余额作为危机周入口；任何现金支出命令均须遵守其自身预检与原子提交规则。

**交付由结算自动完成，不需要玩家确认**：正常交付（玩家主动 `deliver_work` 或到期强制）在本周结算的阶段 9–10 一次完成。`finalize_delivery` 命令只用于**公司已关闭**的场景——关闭发生在结算之外，未交付项目需逐个结清。

**事件暂停**：事件在结算完成后才抽取（阶段 11），因此"事件阻塞后续推进"天然安全——本周已经合法结算完，暂停的是下一次 `advance_week`。这从结构上消除了旧实现中"事件可跳过周成本"的漏洞。

**公司关闭（closing）**：只允许 `finalize_delivery` 与 `finalize_company`；`advance_week` 被拒绝。关闭不可逆。

**第 520 周**：先合法完成第 520 周结算，再统一收尾——已满足交付条件的正常交付，未完成按当前完成度结算，不补完。

### 9.4 周回执契约

```text
WeekReceipt {
  week, mode: normal | crisis
  cash{ net_delta, balance, solvency }             // 实际现金流；应收不等于到账
  highlights[{ code, text, destination? }]          // 无高光时为空
  works[{ work_id, title, mode, progress_permille, progress_delta,
          delivery_range, deadline_slack, risk_level,
          bottleneck?, committee_signal?,
          active_items[], items_delivered[], gates_met, episodes_delivered,
          work_delta, quality_delta{六维},
          handover[{ staff_id, episode_index, loss_permille }],
          causes[{code, detail}], warnings[], can_deliver }]
  staff_delta[{ staff_id, experience, fatigue_delta, morale_delta, assignment_work_id }]
  deliveries[{ work_id, quality_score, rating, revenue, company_received, rank }]
  blocking_items[{ kind: event | forced_action | crisis, item_id, work_id?, title, destination }]
  actionable_clues[{ kind, title, current_state, unattended_consequence, destination }]
  neutral_updates[{ code, text }]                  // 常规刷新等轻量中性动态
}
```

要求：
- `causes` 必须能回答"为什么这周只推进了这么多"，且必须能解释**没有推进**（例如"分镜与原画未达门槛，动画制作不可开工"）。
- 工作项推进只列**有变化**的项，不把 174 项全部铺给玩家；默认折叠。
- 磨合损失必须逐条出现在回执里，否则玩家会认为"换人无缘无故变慢"。
- `blocking_items[]` 与 `actionable_clues[]` 是互斥信息分区：所有待处理事件/强制事项完整进入前者，普通机会与预警进入后者；普通线索默认突出 2–3 条但不得因此丢弃其他重要信息。
- 资金风险通过现金预测与周回执呈现；周结算刚性支出预检失败按 §22.2 直接破产，不进入可继续推进的危机状态。
- 无硬阻塞时回执不得阻断操作或推进；存在硬阻塞时必须完整展示并处理全部阻塞项后才允许推进。
- 现金净变化只统计实际到账与支出；应收款不得计入 `cash.net_delta` 或 `cash.balance`。
- 回执只呈现变化与异常；无变化条目隐藏。先展示正向成果，再展示风险与预警；可行动线索提供直达目标的 `destination`。
- 主界面导航徽标遵循 Q7 生命周期；项目概览展示死线安全余量和瓶颈；操作预览基于最终计划态计算且不提交业务状态。

---

## 10. 关键业务流程

### 10.1 立项（start_work）

```text
守卫：running ∧ 企划存在且有效 ∧ 模式合法 ∧
      （普通企划满足 min_reputation/required_works ∨ 有效原创草稿存在）∧
      现金（拨款前）≥ 全部应付款/投资额
1. 冻结 OfferSnapshot；计算 total_investment（仅委员会 = budget×2）
2. Partnership 成立委员会（成员→渠道），返回 committee_id
3. 按 blueprint 实例化：common 工作项 + episode_count 个单集（各含六阶段工作项），
   work_total = 蓝图基础值 × workload_scale_permille；依赖与门槛同时写入并冻结
4. Finance 记两笔：investment_paid（若委员会）、contract_received（合同预算）
5. Market 移除该企划（含自定/提案槽清空）
6. 广播：新项目出现，UI 提示"分配人员并确认计划"
```

**原子性**：1–5 必须在同一次提交内完成。任一步失败 → 公司回到立项前，企划未被消费。

**实例化不消耗随机**：所有数值来自蓝图与缩放系数，保证同一企划在任何时候开工都得到同一批工作项（可复现，`same seed + same offer ⇒ same items`）。

### 10.2 日常周推进

```text
玩家动作（可选、随时）：改计划 / 调归属 / 签外包 / 招人 / 买电视服务 / 延期
       ↓
advance_week → §9.2 十三阶段
       ↓
周回执 + 可能的待处理事件
```

**不要求玩家每周操作**：无操作时沿用上周计划与归属，结算照常执行（[已确认]）。

### 10.3 交付结算

触发有两条路径，共用同一套计算：

- **正常路径**：周结算阶段 9 判定完成/到期 → 项目转 `delivering` → 阶段 10 当周完成结算，玩家无需确认。
- **关闭路径**：公司因破产或主动结束转 `closing` → 在制项目转 `delivering` → 由 `finalize_delivery` 逐个结清。资金危机未到破产期限时公司仍处于可自救状态，不直接进入 `closing`。

```text
前置：全部 is_gate 项 delivered（提前交付）或已到 deadline_week（强制交付）
1. 门槛完成度：gate_completion_permille（强制交付时用于扣罚与评价修正）
2. 质量：工作项 → 阶段 → 单集 → 作品（六维聚合链，§7.3.4）；适配度只修正评价
3. 评价：S/A/B/C/D（固定分数线）；重大事故独立影响
4. 商业：按渠道计算毛收入 → 汇总 → 应用热度/声望/系列系数 → 分账
5. 财务：commercial_share_received（+承制成功奖励）入账；扣罚入账；若余额为负则进入危机
6. Archive：追加 WorkRecord（单集摘要、六维质量、团队快照、渠道对账、名次）
7. Partnership：委员会 closed，关系值更新
8. Company：声望变更（唯一入口，写日志）
9. Project：status=settled，清空员工归属，释放临时人员，未完成外包置 failed
```

**顺序敏感点**：先算收入再入账，再写 Archive，最后改声望——这样任何一步失败都不会出现"有记录无收入"或"有声望无记录"。

### 10.4 旧版危机自救（已废止，仅保留历史记录）

```text
看到危机回执：缺口 X、剩余 N 周、受影响项目
       ↓
三选一或组合（危机期不生产，因此没有"再赶一周工"这条路）：
  A. 融资        → 借到现金，但未来每周多一笔还款（更紧）
  B. 缩减承诺    → 解雇核心员工、终止消耗型项目、放弃未完成外包
  C. 立即回款    → 把已达门槛但尚未交付的作品 deliver_work，当次入账
       ↓
advance_week（危机结算：只扣固定成本、周数+1）
       ↓
下一周预检通过 → 回到 normal；期限用尽仍失败 → 破产
```

**动作边界（[已确认] DEC-FIN-003）**：危机中**融资是唯一允许的新增资金动作**；其余新增承诺与新增项目支出一律拒绝。

**为什么危机中没有"再赶一周"**：预检失败意味着本周连制作费都付不出，所以危机周不生产。这不是苛刻，而是"不得欠着钱继续开工"的直接推论。因此 C 路径只对**已达门槛、尚未交付**的作品成立——这也是"早交还是晚交"这个决策在危机时刻的兑现方式：留着没交的作品，此刻就是一笔可立即变现的现金。

**设计意图**：危机不是"再点一次就过"的过场，而是迫使玩家做**取舍**——借钱换来时间但抬高未来成本，砍项目换来现金但损失声望与沉没投入。三条路都疼，这才叫经营。

### 10.5 公司终局（finalize_company）

```text
输入：Archive.works、Company（周数/声望/现金）、Staff 最终状态
输出：CompanyResult（reason, weeks, final_funds, net_cash_change, total_projects,
                     best_work_id, rating, highlights[], negatives[]）
规则：破产优先判定失败；十年期满与主动结束同标准；单项突出可跨档；负面评价只记录不降档
```

### 10.6 委员会联动（商业分账）

```text
渠道集合 = 企划自带渠道 ∪ 委员会成员渠道 ∪ 电视服务（若购买）
对每个渠道：毛收入 = 潜力 × 质量兑现 × 热度 × 声望 × 系列
BD：公司所得 = 毛收入 × 50%（另 50% 为综合成本，不再从现金或成本重复扣）
非 BD：委员会项目公司所得 = 毛收入 × 投资比例%；承制项目 = 0
承制成功奖励：商业表现达门槛时由委托方另付，单独入账，不计入作品收入
```

---

## 11. 随机性、Seed 与回放

### 11.1 问题

现状是单一 uint32 LCG 每周推进一次。多项目后必然出现：
- 项目 A 的抽取结果取决于 B 是否先被遍历；
- 新增一个抽取点会改变后续全部历史；
- 无法对单个项目做局部复现；
- 存档恢复后若漏推进一次种子，整局偏移。

### 11.2 裁定：坐标式无状态随机

```text
draw(seed, week, stream, purpose, index) -> uint32 in [0, 2^32)
  内部：splitmix64( mix(seed, week, stream, purpose, index) ) 取高 32 位
```

- **无状态**：不保存任何随机计数器，存档只存 `seed`。
- **按坐标定位**：同一个坐标永远得到同一个值，与调用顺序无关。
- **流（stream）隔离**：`production:{work_id}`、`quality:{work_id}`、`event:{work_id}`、`market`、`competition`、`partner`、`staff`、`misc`。不同流互不干扰；新增流不影响旧流历史。
- **purpose 隔离**：同一周同一流内不同用途（如"工作量波动"与"质量维度抽取"）用不同 purpose，避免参数调整改变另一处的取值。
- **index 显式递增**：每个调用点自行递增局部 index，顺序在代码内固定且可读。

### 11.3 纪律

1. 只有"完成了一次真实结算"的调用才消耗坐标；失败/被拒绝的命令不消耗（因为坐标由 `(week, ...)` 决定，天然满足）。
2. 禁止在 UI 或应用层生成随机；一切随机在内核。
3. 禁止浮点：所有分布用整数千分比与整数区间。
4. 分布调整必须同时更新分布测试与回放基线，"改参数不改历史"不成立时须显式升 `rules_version`。

### 11.4 回放

```text
replay(seed, command_log) -> { state, state_hash }
```

- 命令日志只记录**玩家命令**（含周号），不含派生结果。
- `state_hash` 是规范化 JSON 的稳定哈希（键排序、无浮点）。回放不一致即为缺陷，不是"随机波动"。
- 存档可携带最近 N 条命令（调试用，可选），不作为权威。

---

## 12. 存档与持久化

### 12.1 存档信封

```text
SaveRecord { version: 4, savedAt: ISO8601, rules_version, state: GameState }
```

单槽、IndexedDB、键 `current` 不变。写入前检查占用并需显式覆盖确认（沿用现有行为）。

### 12.2 版本策略（A10）

- `version: 4` 为当前唯一可读写版本。
- 读到 v1/v2/v3：**拒绝并提示新开**，不迁移、不覆盖、不删除（沿用既有政策）。理由：v3 是单项目/单事件槽形状，任何自动迁移都会把旧局强行塞进多项目语义，产生无法解释的状态。
- 读到未知版本或结构非法：报错，保留原记录。

### 12.3 什么进存档（A8）

| 进存档 | 不进存档 |
| --- | --- |
| 玩家决策（计划、归属、投资比例、委员会成员） | 本周分配结果（可重算） |
| 已发生事实（进度、质量、流水、履历） | 风险快照、组织协调派生因素、预览、读模型 |
| `seed`、`week`、版本号 | 周回执、结算面板、UI 草稿 |
| 由 seed 派生且**从不被修改**的目录（竞争公司） | 由 seed 派生但**会被消费**的内容（企划槽、招聘池）——必须持久化 |

判据：**若某值可由（权威状态 + seed）纯函数重算且从未被玩家消费，则不入存档。** 这样既控制体积，又不会出现"存档里存了过期派生值"。

### 12.4 体积与性能

估算（520 周）：项目 ≤ 5、员工 ≤ 30、流水 ≤ 6000 条、履历 ≤ 30 部、竞争公司 30。

**工作项是本架构新增的主要体积来源**：按样例 12 集 × 14 项 + 6 项公共制作 = 174 项/项目（13 集约 188 项）；每项约 150–200 字节（六维质量 + 1–3 个参与者 id），单项目约 30 KB；5 个项目并行 ≈ 150 KB。叠加其他状态，单文档预计 **0.5–1.5 MB**。

| 措施 | 何时用 |
| --- | --- |
| 存档不写派生值（§12.3） | 始终（已设计） |
| 履历只存单集摘要而非工作项 | 始终（已设计） |
| 快照持只读引用而非深拷贝 | 实测拷贝耗时超标时（§8.3） |
| 已归档项目从 `works` 移出，只留 Archive | 始终（已设计） |
| 分块存档或增量序列化 | 仅当实测序列化成为瓶颈 |

[待验证] H1/H6 要求实测：单次推进（含序列化）帧时、存档体积、加载时间。若 TV 项目的工作项数量显著超出 230，应优先削减蓝图粒度而不是优化序列化——工作项过多本身就是可读性问题（R2）。

---

## 13. 内容、配置与平衡参数

| 类别 | 内容 | 存放 | 变更影响 |
| --- | --- | --- | --- |
| 规则常量 | 单集六阶段/工作项权重、产能系数、质量传递上限、分账比例、费用 | `balance` 配置（编译进 WASM） | 影响平衡，需重跑基线与模拟 |
| 内容目录 | 企划样本、员工姓名与特质、事件卡、供应商、合作方、题材 | 内容 JSON（编译进 WASM 或随包） | 不影响存档结构 |
| 结构常量 | 阶段键、能力键、渠道键、成本类别 | 代码内枚举 + 契约校验 | 变更即契约变更 |
| 文本 | 事件文案、回执文案、原因 code → 中文 | 内容 JSON | 纯显示 |

**纪律**：内容 JSON 不得包含规则分支（不许写 `if` 之外的玩法逻辑）；`balance` 不得包含内容 id。二者分离，避免"改一个企划名字导致回放不一致"。

---

## 14. 现有系统差距与迁移

### 14.1 现状盘点（以本分支代码为准）

| 维度 | 现状 | 问题 |
| --- | --- | --- |
| 状态形状 | 单一 `project`、全局 `phase`、全局 `pending_event`、全局 `offers` | 结构上排除多项目；`phase` 混合了公司状态与项目状态 |
| 制作模型 | 整部作品五阶段串行（`stages{5}`） | 与已确认的"公共制作 + 单集六阶段 + 工作项依赖"结构不一致，属整体替换而非字段迁移 |
| 接口 | 6 个：`initialize_game`/`start_project`/`apply_decision`/`advance_week`/`resolve_event`/`calculate_result` | `apply_decision` 是巨型类型分支；无法表达委员会、外包、招聘 |
| 规则 | 全部内联在 `game_core.cpp`（约 1200 行）+ `game_rules.hpp` | 无纯函数边界；难以对单个规则做表驱动测试 |
| 随机 | 单 LCG，每周推进一次 | 多项目不可用（§11.1） |
| 财务 | `company.finance` + `project.finance` 两套汇总；成本另有 `StageResult.costs` 快照 | 三处金额视图，历史审计已记录口径不一致 |
| 委员会 | 仅字段与校验，行为未实现；单渠道旧公式分支仍在 | 与 V3.11/V3.12 冲突的旧公式不可复用 |
| 外包/招聘 | 命令返回 `invalid()`；`suppliers: []` | 完全缺失 |
| 校验 | 单文件全量校验（约 700 行） | 与单项目假设深度耦合 |
| 存档 | v3，含 `preview` 等派生值 | 派生值入库；形状变化即不兼容 |

### 14.2 差距矩阵（v3 → v4）

| v3 概念 | v4 归属 | 处置 |
| --- | --- | --- |
| `company.week/status/end_reason/reputation` | Company | 保留，语义不变 |
| `company.staff[]` | Staff | 迁移，新增 assignment/temporary_contract |
| `company.finance` | Finance（流水） | **改造**：汇总改为由流水派生 |
| `project`（单个） | Project[] | **结构性替换** |
| `project.finance` | Finance 归因视图 | **删除字段**，改为按 work_id 过滤 |
| `project.stages[*].status/work_done/quality` | Project 的公共制作与单集六阶段/工作项模型 | 结构性重建；quality 扩为六维 |
| `project.stages[*].configuration` | Project.plan + 分配 | **语义替换**：阶段首锁定 → 持续方针 |
| `project.stages[*].result.costs` | 无 | **删除**（金额只在 Finance） |
| `project.temporary_staff` | Staff（employment=temporary） | 迁移 |
| `project.outsourcing` | Vendor.OutsourceContract | 迁移并补交付状态 |
| `project.committee` | Partnership.Committee | 迁移并对齐 `{id,name,channel}` |
| `offers/custom_offer/pending_proposal` | Market | 保留槽位语义；`workloads[5]` 换为 `blueprint_id + episode_count + scale` |
| `pending_event`（旧版全局单槽） | EventState.pending[] | **结构性替换**：多项目事件数组；每条带 work_id；每项目每周最多一条，多项目同周可并存，全部保留、逐条解决且非空阻塞推进 |
| `history[]` | Archive.works | 迁移并补渠道对账/名次/团队快照/单集摘要；旧记录的 `stages[]` 作为历史形状原样保留、不再参与计算 |
| `preview` | 读模型 | **不进存档** |
| `phase` | 派生 | **删除**；由（公司状态 + 待处理事件 + 项目集合）派生 |
| `last_project_id` | 无 | **删除**；UI 用最近结算的 work_id |
| `seed` | 同名字段，语义改为 master seed | 保留字段，更换算法 |

### 14.3 迁移里程碑

不做"在旧单项目模型上加数组"的渐进补丁（审计 §7 已给出同一结论）。采用**绞杀式并行**：新代码在独立目录建立，旧路径保留到等价性验证通过。

| 里程碑 | 内容 | 退出标准（必须可测） |
| --- | --- | --- |
| M0 契约冻结 | v4 状态形状、命令表、校验器骨架、夹具、制作蓝图 schema 与样例 | 契约测试通过；空实现命令返回 `NOT_IMPLEMENTED`；`npm run validate:blueprint` 通过；**样例能实例化为合法项目，且依赖/门槛/可达性由校验器而非人工确认** |
| M1 内核与共用公式 | 分账、声望、评级、费用分类搬入纯函数；新制作公式（工作量、质量增量、门槛判定）独立实现 | **只对共用子规则**与 v3 数值等价（分账/评级/费用）；新制作公式以表驱动单测覆盖边界，不要求与旧五阶段等价 |
| M2 单项目全链路 | 1 个作品（公共制作 + N 单集）+ Staff + Finance + 13 阶段结算 + 交付 | 手算样例逐项对上：门槛解锁、依赖顺序、并行推进、交付判定、回执原因；同 seed 回放哈希一致 |
| M2.5 财务与破产边界 | Finance 的贷款、强制支出预检与终局结算 | 周结算预检失败整周回滚并直接破产；正常路径下不得出现负余额 |
| M3 多项目与磨合 | 多项目统一分配、严格单项目归属、磨合损失、费用预检 | 2–3 项目争抢员工；一人一周只出现一次；换人当周产出下降且回执有原因；乱序遍历结果一致 |
| M4 外部资源 | Vendor（合同/交付/失败）、Partnership（委员会/渠道）、Market（刷新/热度/竞争） | 外包产能不可双占；合同与工作项对账；委员会分账对账通过 |
| M5 商业与履历 | 商业结算、竞争排名、Archive、系列、公司结局 | 渠道对账恒等式；名次写入；结局评价可复现 |
| M6 切换 | 存档 v4、UI 接读模型、删除 v3 路径 | 浏览器全流程通过；旧存档被明确拒绝；文档同步 |

**并行约束**：`game_core.cpp`、`game_rules.hpp`、`gameV3.ts` 历史上是串行集成的热点文件，多分支同时修改已有冲突记录。v4 实施应先把新代码放在新目录，最后一次性切换入口，避免长期双写同一文件。

### 14.4 明确不做

- 不做 v3→v4 自动迁移。
- 不做"新旧两套状态同时存在于一个存档"。
- 不保留 `apply_decision` 兼容层；命令直接替换。
- 不在迁移期同时改玩法规则（否则无法判断差异来自结构还是规则）。

---

## 15. 测试与验证策略

| 层 | 对象 | 关键断言 |
| --- | --- | --- |
| 内核单元 | production/commerce/evaluation | 整数截断、边界钳制、单调性、无浮点；表驱动覆盖 0/1/99/100 边界 |
| 内核性质 | allocation | 同一输入任意打乱项目顺序，结果逐字段相同；员工一周只出现一次；产能不超卖；分派顺序符合「门槛 → 阶段 → 方针 → id」 |
| 制作图 | 工作项依赖 | 依赖图无环；跨容器依赖合法（公共→单集）；门槛达成即解锁、未达成不解锁；达到门槛后仍可继续完善且不重复解锁；**蓝图样例通过 `validate:blueprint`，五类破坏用例均被拒绝** |
| 磨合 | 判定与扣减（工作项粒度） | 接手**已开工工作项**触发一次；接手**未开工工作项**不触发，即使同集其他项已有进度；同集不同项之间不误判；员工继续自己参与过的项不重复触发；只扣工作量不改质量；扣减不超过该项本周产出；**经历危机后恢复生产不因停工触发磨合** |
| 交付 | deliver_work | 门槛未达被拒绝；达标后当次提交完成结算、周数不变；交付后该项目不再产出；员工归属清空、外包置 failed；收入可用于当周预检 |
| 领域单元 | 各领域命令 | 守卫拒绝时状态不变；不变式在每次命令后成立 |
| 结算集成 | 13 阶段 | 步骤 7 注入失败 → 状态与结算前完全一致（哈希相等） |
| 财务恒等 | Finance | 余额 = 期初 + Σ流水；同一笔不入两类；项目归因之和 = 公司净变化 − 期间外成本；正常经营状态不得出现负余额 |
| 偿付 | 周结算原子性 | 预检失败时阶段 3–8 不提交并直接破产；通过时八阶段统一提交 |
| 确定性 | 整体 | 同 seed + 同命令序列 → 同 `state_hash`；跨平台一致（无浮点、无未排序遍历） |
| 回放 | replay | 命令日志重放得到相同哈希；520 周长跑基线固定 |
| 边界 | 终局 | 第 520 周合法结算后收尾；破产不可逆；危机期限内可自救；危机中新增承诺被拒绝 |
| 规模 | 状态体积与耗时 | TV 13 集 × 6 阶段 × 工作项的最坏情况：单次推进耗时、序列化体积、存档加载时间均在预算内（H1/H6） |
| 定向 | 排序优先级 | 目标内项优先于门槛项；目标内无可推进项时回退不影响其他工作；定向不改变候选集合；同一项目第二个 target 被拒绝 |
| 契约 | JSON | 非法形状被拒绝且错误码稳定；未知版本拒绝；派生字段缺失不影响加载 |
| 浏览器 | 端到端 | 真 WASM + 真 IndexedDB：立项→推进→事件→交付→存档→恢复→继续，逐字段一致 |

**禁止**：用单元测试冒充浏览器验证；用文档完成冒充功能实现；用模拟器结果冒充平衡结论。

---

## 16. 扩展缝（未定案方向）

架构不实现这些，但保证接入时不重写推进层。已确认的公共制作、单集六阶段、工作项依赖与资金危机不在本表——它们是基线，已进入 §7 与 §9。

| 方向 | 接入点 | 需要改动的地方 | 不需要改动的地方 |
| --- | --- | --- | --- |
| retake（返工回路） | `WorkItem.retake_count` + 门槛达成判定 | 内核 production 增加检查门、周回执增加原因、返工消耗工作量 | 工作项模型、结算顺序；不需要新增阶段 |
| 整集外包（グロス） | `OutsourceContract.mode` 增加 `gross` + `episode_id` 级合同 | Vendor 校验与交付粒度、质量归属 | 合同模型、产能占用规则 |
| 设施/组织能力 | `Company.facilities[]` | 内核读取修正系数（不得变成管理负荷） | 所有领域边界 |
| 公司级事件 | `EventState.pending[]` 增加明确 scope（如未来获批） | 触发池与效果分派 | 项目事件数组、逐条处理、非空暂停语义；不得回退为全局单槽 |
| 单集日程（错峰开工） | `EpisodeProduction.status` 增加 `not_started` | 允许只实例化前几集、其余延后开工 | 工作项模型、分配算法、结算顺序 |

**判定标准**：若某方向需要修改"结算 13 阶段的顺序"或"Finance 的唯一货币权威"，说明它不是接入缝而是架构变更，必须重新评审。

---

## 17. 风险与未解决问题

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 结算服务变成"上帝对象"（13 阶段 × 9 领域） | 难维护、难测试 | 每阶段独立函数 + 快照只读 + 每阶段单独测试；禁止在编排里写公式 |
| R2 | 工作项模型过度复杂（TV 约 174 项） | 玩家理解与架构维护成本 | 玩家只看到单集/阶段；工作项只在详情页折叠展示；分派由内核完成，玩家不做逐项微操 |
| R3 | 六维质量提高理解成本 | 玩家看不懂质量为什么低 | 只显示维度详情；总览只给阶段质量与最终质量；回执用文案解释而非罗列数值 |
| R4 | 多项目资源竞争缺乏可读反馈 | 多开退化为"多几条进度条" | 通过现金、核心员工唯一归属、供应商产能和项目风险形成自然约束；不得新增独立管理负荷数值 |
| R10 | 工作项自动分派结果难解释 | 玩家觉得"系统乱安排"，失去掌控感 | 回执逐项说明本周投入与原因；排序规则固定且公开；需要更强控制在"项目优先级/关键单集"层解决，而不是摊开工作项 |
| R11 | 危机规则过严或过松 | 挫败或失去威胁 | 规则已定（DEC-FIN-003）；靠期限与融资额度参数调节强度；试玩只调数值，不再改结构 |
| R5 | 内容量不足（企划/事件/员工） | 玩法再对也不好玩的 | 这是内容工作包（WP5/6/7），不是架构问题；架构只保证能装下 |
| R6 | 文档与代码再次漂移 | 历史审计的核心病灶 | 契约变更必须同 PR 更新架构/契约/测试；禁止"文档先行、实现后补"跨里程碑 |
| R7 | 迁移期双路径并存时间过长 | 两套逻辑分歧、测试失真 | M2 等价性验证后立即删除 v3 路径；设定硬截止 |
| R8 | 状态体积与序列化开销 | 周推进卡顿 | H1 实测；必要时只序列化变化域或分块 |
| R9 | 随机流拆分后分布被参数污染 | 平衡调整引发"运气变了" | purpose 隔离；分布测试；基线升版显式化 |

**仍需设计或验证的局部问题（不是产品方向待决）**

1. 危机期限、融资额度、利率、还款周期（参数，需模拟）。
2. 磨合损失比例、监督人员是否按 `management` 能力缩放（参数）。
3. 每集工作项的数量与依赖拓扑（内容设计，需与"可读性"一起验证）。
4. 是否允许"未开工单集"延后实例化（当前全量实例化，见 §16 的"单集日程"缝）。
5. 事件优先级与冷却的具体数值（内容+平衡）。
6. 竞争公司的收入公式是否复用玩家公式（规则层待专业设计）。
7. 项目结算后 `Project` 是否保留在活动集合中（当前移出，靠 Archive 展示历史）。

---

## 18. 已确认产品决策（不再作为待裁决问题）

本文件此前列出的 P1–P4 均已被负责人明确决定覆盖。完整决策原文与边界见 [DECISION_LOG.md](DECISION_LOG.md)。

| 原编号 | 已确认结论 | 对架构的约束 |
| --- | --- | --- |
| P1 作品内制作粒度 | 项目级公共制作 + 单集制作；单集六阶段固定为单集内容设计、分镜与原画、动画制作、美术与视觉制作、摄影与剪辑、声音与最终交付 | Project 模型必须表达两层制作结构；六阶段属于单集；工作项依赖、最低交付解锁、前序继续完善与并行推进必须得到支持 |
| P2 核心员工跨项目支援 | 每名核心员工每周严格单项目分配，不允许同周支援、借调或拆分工时 | Staff 只保存唯一项目归属；分配算法不得生成支援份额；周结算后允许重新分配 |
| P3 资金不足处理 | 刚性支出预检失败时整周回滚并直接破产终局，不设额外救济窗口 | 周结算失败必须原子回滚；不得实现危机周推进或负现金欠付 |
| P4 自动执行是否花钱 | 已配置计划自动执行，但不自动招聘临时员工、不自动新增外包合同；新预算承诺由玩家决定 | WorkPlan 不得授权自动采购；执行只能使用已配置资源 |

2026-11-24 追加确认（原为本架构的设计默认值，现已成为正式规则）：

| 决策编号 | 已确认结论 | 对架构的约束 |
| --- | --- | --- |
| DEC-PLAY-003 招募窗口 | 招聘/抽卡/解雇不要求全公司空闲；核心员工签约即入职、当周可分配；签约费即时入账，首周周薪从签约后当前经营周的下一次周结算起计提 | 命令守卫删除"idle/project_settled"前置；`hire_core` 同次命令完成签约入职并允许当周分配 |
| DEC-PROD-004 交付时机 | 门槛达标后玩家可主动交付；交付即停止生产 | `deliver_work` 在当次提交内完成结算，周数不变；交付后项目不再产出 |
| DEC-FIN-003 危机语义 | 推进周数、继续计提固定成本、允许现金暂时为负；只允许融资，禁止其他新增承诺与新增项目支出 | 危机结算 7 步固定；危机期命令白名单见 §8.5；数值与期限仍待模拟 |
| DEC-UI-001 周回执与经营信息呈现 | 周回执硬阻塞/普通线索严格分区；普通线索默认突出 2–3 条但不限制事项数量；主界面持续提示并在操作旁展示后果预览 | `WeekReceipt` 分区、导航提示、项目概览和计划态预览按 §8.4/§9.4 提供；不得截断 `events.pending[]` |
| DEC-PLAY-005 经营判断锚点 | 等待/外派、接新项目/锁单、扩编均有可解释判断依据，但不自动禁止或强制玩家动作 | 提供可由现有状态推导的提示；有效判断机会频率与死水期占比进入 M2/M3 试玩验证 |
| DEC-STAFF-006/007/008 员工职业、特性相性与多人协作 | 职业、六维专业能力、项目岗位分层；八特性与关键主创相性；监督统筹兼任、多人主责/协力质量边界 | Staff/Project 保持字段职责分离；职业映射、监督岗位条件、统筹占比、多人质量聚合、特性效果和相性概率由员工/内容/数值任务细化 |
| DEC-UI-002 制作概览与三级提醒 | 默认项目聚合、分集明细按需展开、提醒分三级 | 读模型派生，不把预测值或预览写成权威存档状态 |
| DISC-01 Q2–Q8、Q10–Q11 | 外派、刷新、定金、托管、自由动线、提醒、规模化操作、整集外包与人员计划态预览按 DECISION_LOG 第 17 节执行 | Market/Staff/Vendor/Project/Event 按各自唯一所有权实现；不增加独立领域或重复状态 |

以下内容属于已确认方向下的局部设计，不构成重新打开上述产品决策：危机期间周数与固定成本语义、融资条件和危机期限、临时员工/供应商跨项目调度细节、具体工作项和依赖图、质量聚合参数。

架构智能体应自主完成这些专业设计；只有提案试图改变上述已确认边界时，才提交负责人裁决。

### 18.1 项目内定向：已确认 O2（DEC-PLAY-004）

**问题回顾**：12 集并行时，若某集明显落后，玩家若只能靠"加人、改方针、砍外包"间接影响，会出现"我想救这集，但系统不听话"。这不是技术细节，是玩家操作面的大小，所以交负责人裁定。

**裁定结果：O2（项目内定向）**，2026-11-24 确认。

| 选项 | 内容 | 结论 |
| --- | --- | --- |
| O1 全自动 | 只定人→项目 + 四个方针 | 不采用：关键局面缺可执行的意图表达 |
| **O2 项目内定向** | 每项目一个可空目标：某单集 / 某阶段 / 无 | **采用**。全自动的超集，操作是"偶尔改一次下拉" |
| O3 逐集/逐项指派 | 员工可指定到具体单集或工作项 | 不采用：174 个工作项一旦可指派，UI 必然变成排班表 |

实现边界（规则细节见 §7.3.5）：

- 每项目至多一个目标；只在"已解锁且未完成"的候选之间调先后，不改变候选集合。
- 不额外花钱、不加隐藏效率系数；代价是其他集/阶段的机会成本。
- 设置后持续生效，不要求每周重设；目标内无可推进项时自动回退。
- 不提供逐工作项指派。

**这带来一个必须接受的后果**：玩家可以把产能全压在某一集，导致别集的交付门槛迟迟不达标。系统不做保护，只在回执里写明"本周产能集中在第 X 集，第 Y 集门槛仍未达成"。允许玩家犯错，但让后果可读。

---

**本版的自主设计结果**（供评审，不改变上述边界）：

| 局部项 | 本版结论 | 位置 |
| --- | --- | --- |
| 周结算失败 | 刚性支出预检失败即破产；不推进周数、不计固定成本扣款、不推进项目 | §22.2 |
| 融资条件与期限 | `arrange_financing` + 贷款周还款与利息进入强制费用；额度按声望与负债算，参数待定 | §7.5.1 |
| 临时员工/供应商跨项目 | 临时员工绑定单项目；供应商按合同占用周产能；二者都不放宽核心员工约束 | §7.4 |
| 工作项与依赖图 | 工作项为唯一生产原子，依赖跨容器，状态全派生 | §7.3.1–§7.3.3 |
| 质量聚合参数 | 工作项→阶段→单集→作品；保留 600‰+40 传递上限 | §7.3.4 |
| 交付时机 | 门槛达标后玩家可主动交付（C13，需知情） | §7.3.6 |

## 19. 与现有文档的关系与冲突登记

### 19.1 文档权威顺序

1. `DECISION_LOG.md` —— 已确认产品规则的最高权威；任何文档和实现不得覆盖。
2. `CORE_GAMEPLAY_REBUILD_FRAMEWORK.md` —— 除决策登记册外的当前玩法基线；与已确认决策冲突时以决策登记册为准。
3. **本文** —— 当前目标系统结构（领域、模型、接口、结算、迁移）；不得擅自改变玩法规则或玩家控制边界。
4. `GAME_RULES.md` / `GAME_DESIGN.md` —— 旧 V1/V3 规则与设计记录，仅作历史迁移参考；不得当作当前目标规则权威。
5. `DATA_MODEL.md` / `API.md` —— 旧 V3 运行时契约；迁移完成后由 v4 契约替代。
6. `ARCHITECTURE.md` —— 现状工程分层与技术约束；仍有效的技术栈、构建和验证边界继续适用，旧单项目结构由 v4 取代。
7. 审计与研究文档 —— 事实与论证来源，不自动构成规则。

### 19.2 冲突登记（必须显式处理，不得静默）

| # | 冲突 | 现状表述 | 处置 |
| --- | --- | --- | --- |
| C1 | 单项目 vs 多项目 | `GAME_RULES` V3.10 §1「同一时间仍只能推进一个在制项目」；`DATA_MODEL` V3.4 不变量 2「至多一个项目」 | **已被负责人 2026-11-24 多项目方向覆盖**。v3 文档不再代表产品要求；在 v4 契约中删除该不变量。本文不修改这些历史段落，但在迁移任务中标注为"已失效" |
| C2 | 阶段首配置锁定 vs 持续方针 | `DATA_MODEL` StageConfiguration「阶段开始一次提交、此后锁定」 | 框架 §5.2 已改为"持续方针 + 周度调整"。v4 以 `WorkPlan` 替换 `StageConfiguration`；旧语义仅描述 M1 历史实现 |
| C3 | 承制 BD 分成 0 vs 50% | 代码与部分契约仍强制承制 BD 为 0 | 以 V3.11/V3.12 为准（统一 50/50）。v4 分账只在 `commerce` 内实现一次，不保留旧分支 |
| C4 | 项目账 vs 公司现金 | `company.finance` 与 `project.finance` 两套汇总 + `StageResult.costs` | v4 取消两套汇总与阶段金额快照，只有 Finance 流水 + 归因视图（§5.7/§7.5） |
| C5 | 事件可跳过周成本 | M2-b 分支存在"事件挂起后推进不付周成本"的路径 | v4 把事件抽取放在结算完成之后（§9.2 阶段 11），结构上消除该漏洞 |
| C6 | 质量权重方向 | `game_rules.hpp` 为 150/200/250/200/200，与 V3.9 §3「前重后轻」矛盾 | 属平衡参数，v4 不沿用代码值；以已确认口径为准，由平衡任务定值并加注"设计取舍而非行业事实" |
| C7 | 委员会成员结构 | 旧校验器要求 `share_percent`/多渠数组 | 以 `{id,name,channel}` 为准（V3.9/V3.11）；旧结构不得合入 |
| C8 | 招聘/抽卡的"空闲窗口" | `DATA_MODEL` V3.6/V3.7：`hire_core`/`scout` 仅限 `running idle` 或 `project_settled` | **已由 DEC-PLAY-003（2026-11-24；即时入职时序于 2026-11-25 补充）确认废止**：该窗口是单项目时代的产物，多项目下会变成永远无法招聘。核心员工 `hire_core` 在签约命令中即时入职并可当周分配，签约费即时入账，首周周薪从签约后当前经营周的下一次周结算起计提（§8.5）；`scout` 仍按其自身即时寻访规则处理。 |
| C9 | 五阶段 vs 单集六阶段 | `GAME_RULES`/`DATA_MODEL`/代码全为「整部作品五阶段」（script…postproduction） | **已被 DEC-PROD-001/002 覆盖**：六阶段属于单集，整部五阶段不再是目标形状。v3 五阶段仅作历史行为参照；`game_rules.hpp` 的 `stages` 数组与质量权重不得作为新口径 |
| C10 | 管理能力的两种表述 | 框架 §4.2 原把「管理能力」列为共享资源并称"项目过多可能产生执行损耗" | **已修正**（`9c97684`）：框架 §4.2 第 4 条改为"管理专业能力用于监督、协调与检查，不设管理负荷/跨度/项目过多惩罚"。本架构按此执行，不形成负荷表 |
| C11 | 立即破产 vs 限时危机 | `GAME_RULES` V3.11/V3.12 与旧代码：预检失败立即 bankrupt | 已被 DEC-FIN-002 覆盖。v4 以`solvency` 状态机实现；"付清后为 0 不破产"仍有效 |
| C12 | 企划工作量形状 | `DATA_MODEL` `ProjectOffer.workloads` 为整部五阶段向量 | 以 `blueprint_id + episode_count + workload_scale_permille` 替换；旧字段随 v3 契约失效 |
| C13 | 交付时机 | 旧规则只有"完成或到期"，没有主动交付 | **已由 DEC-PROD-004（2026-11-24）确认**：门槛达标后玩家可主动 `deliver_work`，交付即停止生产（§7.3.6）。旧"仅到期自动交付"口径废止 |

### 19.3 本文不宣称的内容

- 不宣称任何玩法已实现。
- 不宣称平衡已完成。
- 不宣称 v3 行为正确，仅作为迁移等价性参照。
- 不宣称 WP0–WP11 工作包已被本文替代；本文是 WP0 的架构级产出，其余工作包仍需按各自交付物推进。

---

## 20. 给实施者的最短路径

```text
1. 读 §2（基线）→ §5（所有权）→ §7（模型）→ §9（结算）
2. 先写契约与校验器（M0）+ 制作蓝图 schema，不写行为
3. 内核纯函数（M1）：共用规则与 v3 对齐；新制作公式单独表驱动测试
4. 单项目全链路（M2）：公共制作 + N 单集 + 工作项依赖 + 13 阶段 + 交付
5. 偿付危机（M2.5）：贷款、危机结算、破产边界
6. 才允许加入第二个项目（M3）；第一个可测属性是"乱序遍历结果一致"与"一人一周只出现一次"
7. 外部资源（M4）与商业履历（M5）；切换（M6）：改存档版本、删旧路径、同步文档
```

三条不可妥协的检查点：
- **没有快照的跨领域读取，一律不合入。**
- **没有不变式断言的领域命令，一律不合入。**
- **没有回放哈希的结算改动，一律不合入。**

### DISC-01 Q2–Q8、Q10–Q11 的架构约束补充（2026-11-25）

- **机会刷新与定金**：Market 持有企划池、招聘/Scout 候选机会及锁定状态；企划池自然周更、招聘池部分轮换、Scout 付费即时刷新和企划两周定金锁定属于 Market/Staff 的业务规则。具体池规模、费用、定金比例与计算基数属于待标定参数，不在架构层写死。
- **托管与玩家承诺边界**：自动执行只消费玩家已配置的计划和已承诺资源；招聘、外包、融资等新增重大支出仍由玩家明确确认，不新增自动采购或隐式承诺。
- **周内计划态**：assign_staff 与 set_work_plan 的周内操作只更新计划态。预览是从当前最终计划态派生的只读结果，不写入存档、不产生进度、磨合损失、现金变化或合同承诺；周结算统一校验并原子提交实际结果。
- **人员磨合**：普通员工磨合按“员工 × 工作项”的历史实际参与关系判定；监督团队层面的切换损失独立计算。具体事实字段由 Staff/Project 的唯一写入权威落实，不建立重复事实源。
- **外包批量操作**：整集协力打包只是 UI 批量操作，复用 Vendor 现有外包合同和签约命令；签约前对全部工作项、依赖、供应商能力和总 weekly_cap 做完整预检，一次性成功或失败。质量封顶按单集实际外包覆盖程度计算，不按签约按钮区分。
- **规模化经营与 UI**：前期/中后期按实际规模和并发自然变化；项目概览聚合、分集明细按需展开。经营复杂度可以随规模增长，但不得增加与项目数线性增长的强制操作负担。
- **事件数组**：每项目每周最多触发一个事件，不同项目可同周触发；pending[] 不设全局容量上限，不覆盖、不丢弃、不合并，也不设跨项目 FIFO 或优先级仲裁。

以上为已确认产品规则对领域边界的约束，不表示相应命令、读模型或 UI 已实现。完整玩法边界见 DECISION_LOG 第 16–17 节。

## 21. DISC-01 后续工程契约要求（2026-11-25）

本节把已确认玩法转成 M2 工程契约必须覆盖的事项。它们是实现约束，不是已冻结的 API 字段名或命令签名；具体状态形状、命令输入/输出、错误码和原子边界由 #53 数据契约审查统一收敛。

### 21.1 外派协力（Q2）

- Staff 的周归属必须能区分本社项目、外派和待命三种互斥状态；不得继续把外派与普通未分配混为一谈。
- 外派占用整周，不参与本社项目生产；周结算只产生外派现金、与实际工作类型相关的经验和疲劳，不得同时获得本社项目产出。
- 红灯强制休养期间禁止外派；下一周允许玩家自由调整回本社项目，不设置额外冷却。
- 外派收入、经验量与疲劳倍率（1.15× 仅为标定起点）作为参数，不在契约中冻结数值。

### 21.2 Scout 与机会刷新（Q3）

- Staff 招聘状态必须能验证 Scout 首版每周最多使用一次，并记录候选人的限时签约窗口；候选池每周部分轮换，不得全池洗牌。
- Market 企划池每周自然滚动；员工提案按里程碑/状态节点触发，不以固定周期或免费生成绕过正常招聘渠道。
- 池规模、候选刷新数量、Scout 费用和提案触发参数待设计/标定。

### 21.3 企划定金锁定（Q4）

- Market 必须持有活动锁定、锁定期限、已支付定金及同一企划历史上是否锁定过的可追溯状态；锁定期两周，进入最后一周时可被周回执提示。
- 同一企划终身最多锁定一次；到期自动释放槽位且定金不退；正式接单时定金作为预付款 100% 抵扣对应立项保证金/前期费用，不得重复记成本或重复扣现金。
- 定金比例与计算基数尚未冻结；一旦玩家实际支付，已支付金额和对应企划必须形成可追溯记录。
- 新增锁定命令的具体命名、失败码、现金预检与 Finance 流水分类由 #53 统一定义；本节不预设签名。

### 21.4 整集协力打包（Q10）

- 整集打包是应用层的一次性批量签约流程，不建立新的 Vendor 领域或独立供应商规则。
- 提交前完整预检单集第 2–5 阶段全部可外包工作项、依赖、专业匹配、报价、质量上限和供应商总周产能；所有合同一次性提交或全部不提交。
- 质量封顶依据单集实际外包覆盖程度判定；一键打包与手动拆分达到相同覆盖条件时适用相同规则。覆盖阈值、分母和协同损耗仍待标定。

### 21.5 计划态预览与提醒（Q6–Q9、Q11）

- 周内人员归属和制作方针修改只更新当前未结算经营周的计划态；计划态可反复撤销、覆盖和调整，预览从推进前最后确认的计划态派生，不写入存档，不提前产生进度、磨合损失、现金或合同承诺。
- 即时操作必须整条命令原子提交；校验或执行任一步骤失败时，回滚该命令全部状态变化，不留下部分扣款、名额占用、合同或人员状态。
- 预览至少能解释调出与调入双方的产出区间、交付区间/合同死线余量、职业适配、磨合、质量贡献和疲劳代价；预测必须标明不确定性。
- 普通人员磨合由 WorkItem.contributors 记录实际参与历史；同一员工曾实际参与该工作项，离开后再回来不重复扣个人磨合。
- 监督 management 能力与团队润滑特性减免合计最多 50%；监督本人切换项目产生的团队级损失独立计算，不享受该减免。
- 黄灯员工不强制停工，红灯员工强制休养；红灯仅限制本人，不阻塞其他项目周结算。
- 硬阻塞与普通线索严格分区；多项目待处理事件完整保留，普通线索的视觉突出数量不得变成事项数量上限。

## 22. 单周结算原子流水线（DEC-TIME-003，覆盖旧危机结算）

本节是当前 advance_week 的权威顺序，覆盖本文早期关于正常 13 阶段、危机 7 步、负现金欠付及限时危机周推进的旧描述。旧章节保留作历史上下文，不再作为实现目标。

### 22.1 八阶段正常结算

1. **计划冻结与状态快照**：冻结周内最终确认的 assign_staff、外包、制作方针等计划态配置，拍摄结算前状态快照。
2. **刚性支出原子预检**：汇总核心员工周薪、临时员工周薪、公司基础房租、设施维护费、生效中的制作/外包固定周费及已到期承诺付款。以快照现金全额预检，不计入阶段 6 尚未入账的周末收入。
3. **刚性支出扣款与流水登记**：仅预检通过才一次性扣除全部刚性支出并登记分类流水。
4. **项目生产推进与阶段切换**：按冻结计划结算有效产能、监督统筹、协同/磨合及外包进度；推进工作量并处理阶段切换。项目完结或中止时，在本阶段解绑并释放所属临时员工。
5. **人员经验/疲劳结算与红灯判定**：按本周实际参与结算经验、能力成长与疲劳；本周触发红灯的员工，本周工作与薪资照算，强制休养从下一周开局生效。
6. **商业窗口与交付收入结算**：结算已满足条件的商业收入、委员会分账、渠道成本及外包交付尾款。此阶段收入不得用于回填阶段 2 预检。
7. **延迟状态倒计时与到期**：延迟状态统一减 1 周；归零时标记到期，能力/资格从下一周开局生效。定金或机会在最后有效周末未确认则立即失效、释放槽位、定金不退。
8. **随机事件抽取与周数递增**：基于本周最新状态抽取事件，然后周数加 1、清理周内临时缓存并生成周回执。

### 22.2 预检失败与事务提交

若阶段 2 判定 cash < mandatory_expenses：

- 阶段 3–8 全部跳过，整周结算工作副本丢弃，恢复阶段 1 快照。
- 不扣任何部分款项；现金保持快照值。
- 项目进度、阶段切换、员工经验/疲劳、延迟倒计时、事件抽取和周数均不变化。
- 直接触发破产终局，不设置额外危机拯救窗口；不得进入旧版危机周结算，不允许负现金欠付继续推进。

预检通过后，正常结算按八阶段完成并统一提交。任何阶段发生内部错误，也不得留下部分周结算状态。

### 22.3 延迟状态计时

- 第 W 周下单/触发即占当周计数；每周末阶段 7 统一减 1；倒计时归零后，状态从下一周开局起生效。
- 设施建设期间不计维护费；设施在竣工后的下一周开局启用，维护费从启用周阶段 2 起计提。
- 红灯触发周工作与薪资照算，创建当周跳过该休养计时器的阶段 7 扣减；从下一周开局进入强制休养，连续锁定 K 个完整周并照付周薪，每个休养周末减 1，满 K 周后的下一周开局恢复调度。
- 有效 M 周的企划定金/机会覆盖 W 至 W+M-1 周；最后有效周末未确认时于阶段 7 失效，定金不退，W+M 周开局不再可见。

### 22.4 计划态与预览

- 周内计划态允许反复覆盖、撤销和调整；推进时以最后确认快照为准。
- 即时签约/扣款类命令失败必须原子回滚。
- 只读预演至少提供刚性周支出、岗位硬资格、预计疲劳变化区间和预计完工周数；不得提前展示随机波动实际结果或未触发事件。
- 预览不得修改权威存档状态，不产生现金、进度、磨合、经验或疲劳的实际变化。
