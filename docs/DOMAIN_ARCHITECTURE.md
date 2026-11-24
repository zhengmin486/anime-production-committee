# 《动画制作委员会》领域架构设计

> 状态：架构设计 v1.0（取代本文件 v0.1 讨论稿）
> 日期：2026-11-24
> 分支：`architecture/domain-architecture-20261124`
> 上位文档：[核心玩法重构框架](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)；权威产品决策：[DECISION_LOG.md](DECISION_LOG.md)。本文不得把已确认决策重新列为待裁决。
>
> **本文的地位**：本文回答系统如何被组织——领域边界、状态所有权、模型形状、接口与依赖、结算机制、迁移路径。产品规则以 DECISION_LOG.md 为准；本文的模型和接口属于架构设计，可由架构智能体根据仓库材料进一步完善，但不得改变已确认的玩法边界。旧 `ARCHITECTURE.md`、`DATA_MODEL.md`、`API.md` 与 `GAME_RULES.md` 中的 V2/V3 内容主要描述历史运行时或旧契约，不得误读为当前目标玩法。
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

---

## 1. 架构目标与边界

### 1.1 目标

1. **一个事实一个所有者。** 现金只有 Finance 能写；员工状态只有 Staff 能写；阶段进度只有 Project 能写。
2. **规则与状态分离。** 所有公式集中在无状态内核，可被单元测试穷举；领域只持有状态和不变式。
3. **周结算原子且顺序无关。** 同输入必然同输出；项目遍历顺序不得影响任何数值；任何一步失败不得留下半结算状态。
4. **多项目是一等公民。** 这是已确认基线，不是"以后可能"：不允许任何全局单例假设（全局 `phase`、全局 `project`、全局"当前事件"）继续存活。
5. **可解释。** 每个数值变化都能回答"为什么"：谁贡献、被什么惩罚、由哪次抽取决定。
6. **可演进，但不预建。** 单集六阶段、项目级公共制作、工作项依赖与限时资金危机均为已确认玩法基线，必须纳入目标架构；retake、整集外包等尚未确认的扩展方向才只留接入缝。

### 1.2 明确不在本文范围

- 具体平衡数值（工作量、系数、阈值）——归数值平衡与 `balance` 配置。
- UI 版式与视觉设计——本文只定义读模型契约。
- 新玩法机制（如新增子系统）——需先过框架评审。
- 旧代码的大规模重写——本文给迁移里程碑，不在本轮执行。

---

## 2. 已确认基线、架构裁定与待裁决

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
| B16 | 资金不足进入限时资金危机，不立即自动破产 | DECISION_LOG：DEC-FIN-002 |

### 2.2 本文的架构裁定（摘要）

| # | 裁定 | 位置 |
| --- | --- | --- |
| A1 | 取消"Project 生命周期 + Production 执行状态"的双所有者，Production 变为无状态内核 | §4.1 |
| A2 | 取消 Resource Allocation 领域；分配是每周确定性求解，不是持久账本 | §4.2、§9.3 |
| A3 | 新增 Vendor（外部产能）与 Archive（作品履历与系列） | §4.3 |
| A4 | 现金、声望、周数三者各有唯一写入方（Finance / Company / Company） | §5.7、§6 |
| A5 | 质量由六维质量档案承载，阶段质量与最终质量由维度派生 | §7.3.3 |
| A6 | Project 必须表达项目级公共制作与多个单集的制作结构；每个单集拥有六阶段和工作项依赖。具体字段/聚合方式由架构智能体进一步设计 | §7.3.2 |
| A7 | 随机性改为坐标式无状态随机，种子只保留 master seed | §11 |
| A8 | 派生值不进存档；读模型由核心重算 | §12.3 |
| A9 | 项目账不是独立账本，而是 Finance 流水的归因视图 | §7.5 |
| A10 | 存档直接升级到 v4，显式拒绝 v3 存档，不做迁移 | §12.2 |

### 2.3 需验证的假设

| # | 假设 | 验证方式 |
| --- | --- | --- |
| H1 | 单一 JSON 状态文档在 520 周、3–5 项目、30 家竞争公司规模下，单次推进（含序列化）可接受 | WP4 模拟器实测帧时 |
| H2 | 六维质量档案不会让玩家理解成本上升 | WP10 静态原型与试玩 |
| H3 | 坐标式随机在"同周多项目同时抽取"时不产生可被玩家察觉的规律 | 模拟器统计分布检验 |
| H4 | 组织协调因素惩罚足以让"多开"产生可读代价，而不需要硬上限 | WP4 对照实验 |
| H5 | 项目级公共制作与单集工作项依赖模型能够保持可读、可测试，且不会迫使玩家逐项微操 | 原型与试玩验证 |

### 2.4 产品裁决状态

本文件原 P1–P4 已被负责人明确决策覆盖，现不再作为待裁决问题。剩余工作是架构智能体自主完成模型、接口、依赖和迁移设计；只有提出改变 DECISION_LOG.md 中已确认玩法的方案时，才提交决策变更提案。

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
| 分配算法（严格单项目归属校验、组织协调因素、确定性冲突处理） | Rules / allocation（纯函数） |
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

**派生但不必存储**：组织协调因素（如经验证确有必要，由已有员工能力/经验推导；不得建立独立管理负荷数值）、部门归属（首版不做）。

### 5.3 Project（作品项目）

**职责**：一部作品从立项到结算的全部项目级事实。

| 拥有 | 不拥有 |
| --- | --- |
| 项目身份与企划快照（名称、来源、规模、题材、目标质量、合同预算、期限） | 企划机会池（Market） |
| 合作模式、投资比例与投资额、委员会引用 | 委员会成员名单与关系（Partnership） |
| 项目级公共制作与单集六阶段/工作项状态、工作量、进度、质量档案 | 员工能力与疲劳（Staff） |
| 制作计划（投入强度、取向、外包策略、赶工） | 外包合同与交付（Vendor）；自动采购授权（不允许） |
| 延期次数与截止周 | 现金与成本（Finance） |
| 风险快照与预警（派生） | 事件冷却与待处理事件（Event） |
| 交付结论（原因、周、档案引用） | 作品长期档案（Archive） |

**关键边界**：Project 不知道钱。它只声明"本周需要多少产能、什么阶段、什么取向"，并在结算后接收"本周实际获得多少工作量与质量增量"。金额与收入只由 Finance/Archive 持有；Project 的交付结论只记原因、周与档案 id，不重复存一份收入。

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
| 流水分类（14 类：3 类流入 + 11 类流出）、项目归因维度、对手方、备注 | 预算承诺是否合理（应用层守卫） |
| 余额不变式（余额 = 期初 + Σ流水） | 项目利润口径（归因视图，不是新账本） |

**项目账的定位（A9）**：不存在第二个账本。项目账 = 按 `work_id` 过滤流水后的聚合视图，每次读取时计算。这直接消灭了"项目累计成本与公司现金不一致"这类历史缺陷，也让"同一笔只扣一次"成为结构性事实而非纪律要求。

### 5.8 Event（事件与风险）

**职责**：事件实例、触发选择、冷却与待处理状态。

| 拥有 | 不拥有 |
| --- | --- |
| 全局唯一的待处理事件槽 | 项目质量与进度（Project） |
| 每项目的冷却表、已触发重大事件、延后事件 | 员工状态（Staff） |
| 事件的触发条件评估与优先级选择 | 事件造成的资金变化（Finance 入账） |
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
| 招聘池/保底计数 | Staff | Staff | UI | 全公司 |
| 项目身份与企划快照 | Project | Project（立项时写入，此后冻结） | UI、交付结算 | 立项→结算 |
| 合作模式/投资比例 | Project | Project（立项时冻结） | 财务、分账 | 立项→结算 |
| 阶段状态/进度/质量 | Project | Project | 结算快照、UI | 立项→交付 |
| 制作计划 | Project | Project（玩家命令） | 分配、生产 | 可随时改，下周易生效 |
| 风险快照 | Project（派生） | 内核计算，Project 持有 | Event、UI | 每次结算重算 |
| 供应商目录与产能 | Vendor | Vendor（解锁时） | 分配、UI | 全公司，只增不改 |
| 外包合同与交付 | Vendor | Vendor | 生产结算 | 签约→交付/失败 |
| 合作方与关系值 | Partnership | Partnership | 邀请、UI | 全公司，永久 |
| 委员会构成 | Partnership | Partnership（成立/解散） | 分账、归档 | 立项→结算 |
| 企划机会槽 | Market | Market | 立项、UI | 每周刷新 |
| 市场热度 | Market | Market（周期更新） | 生成、商业结算 | 全局，周期变化 |
| 竞争公司集合 | Market（由 seed 派生） | Market（初始化） | 竞争模拟 | 全局，不修改 |
| 现金与流水 | Finance | Finance（唯一入口） | 全部（只读） | 全公司，永久 |
| 待处理事件 | Event | Event | UI | 单实例，处理后清空 |
| 事件冷却/已见重大事件 | Event | Event | 触发评估 | 随项目，结算后归档 |
| 作品档案 | Archive | Archive（只追加） | 商业/系列/结局/UI | 永久 |
| 系列关系 | Archive | Archive（追加） | 企划生成、商业 | 永久 |
| 公司结局评价 | Archive | Archive（终局一次） | UI | 终局后 |

### 6.2 项目生命周期与数据迁移

```text
Market.offer ──(start_work)──▶ Project{ planning }
                                   │ 首个单元首个阶段 ready
                                   ▼
                              Project{ producing } ──每周──▶ 阶段推进
                                   │ 全部单元完成 / 到期 / 公司关闭
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
| 项目级状态（阶段、计划、风险） | 随 Project 移出活动集合；交付快照已进 Archive |
| 事件冷却/延后事件 | 随项目归档，不再参与触发 |
| 外包未完成合同 | 状态置为 `failed`，不退款（首版），不再产生产能占用 |
| 委员会 | `closed`，成员关系写回 Partnership |
| 员工归属 | 清空 `primary_work_id`，员工回到空闲 |
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
  facilities: []                     // 首版空集合，§16 接入缝
}

Staff {
  id, name, role, employment: core | temporary
  abilities{planning,direction,drawing,animation,management,postproduction}: 0..100
  experience{...}: >=0               // 累计，能力增长由内核换算
  potential{...}, revealed{...}      // 潜力不低于当前能力
  talent_type, traits[]
  weekly_salary (core>0, temp=0) | project_fee (temp>0, core=0)
  fatigue: 0..100 ; morale: 0..100 ; departure_warning: bool
  assignment {
    primary_work_id: null | work_id  // 至多一个
    support: null | { work_id, share_permille<=cap }
    mode: idle | assigned | resting | support_only
  }
  temporary_contract: null | { work_id, start_week, end_week }
  joined_week, works_history[]
}
```

**不变式**
- `employment=core ⇒ weekly_salary>0 ∧ project_fee=0`；反之亦然（沿用 V3）。
- `primary_work_id` 必须指向 `works` 中处于 producing 的项目，否则为 null。
- `support.work_id ≠ primary_work_id`；临时人员不得有 support。
- `fatigue/morale` 只在周结算中变化；命令不得直接改。
- 离职预警为布尔，员工不会自发离场（[已确认] 只预警不随机离职）；首版不实现"确定离开"，见 §18-P2 备注。

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
  common_production: ProjectCommonProduction
  episodes: EpisodeProduction[] // 单集制作；每集独立六阶段与工作项依赖
  plan: WorkPlan
  risk: RiskSnapshot            // 派生，不持久化（§12.3）
  delivery: null | { reason, week, work_record_id }   // 结论与档案引用，不重复存金额
}

ProjectCommonProduction {
  // 项目级公共制作；具体内容、工作项和状态结构由架构设计确定
}

EpisodeProduction {
  id, episode_index
  stages: Stage[6]              // 单集固定六阶段
}

Stage {
  name: 单集内容设计 | 分镜与原画 | 动画制作 | 美术与视觉制作 | 摄影与剪辑 | 声音与最终交付
  work_items: WorkItem[]        // 工作项依赖、最低交付门槛与并行关系
}

WorkItem {
  // 具体字段由架构智能体设计；必须表达依赖、最低交付、持续完善和实际产出
}

WorkPlan {
  intensity: low | standard | high        // 投入强度
  focus: quality | schedule | cost        // 取向
  outsourcing: none | gap_fill | aggressive
  overtime: off | conditional
  // 自动计划只能使用已配置资源；不得自动招聘、签订外包或产生未授权支出
}
```

#### 7.3.2 项目级公共制作与单集制作的模型要求

作品制作必须同时表达项目级公共制作与单集制作。六阶段属于每个单集；每个单集的阶段内部进一步细化为工作项依赖。

**[已确认]** 下游工作项达到最低交付要求即可解锁；前序工作项达到最低交付后仍可继续完善；不互斥的工作项允许并行推进。不能用“整部作品的统一阶段状态”替代单集状态，也不能强制所有单集同步切换阶段。

上方结构仅表达必须具备的领域概念，不锁定最终字段命名、聚合边界、公共制作内容清单或工作项算法。主架构智能体应结合仓库研究与实际代码自主完成领域建模。

#### 7.3.3 质量模型

**[裁定]** 质量以**六维档案**承载，而不是单一的阶段质量数字：

```text
维度：story(剧情) direction(演出) drawing(作画) animation(动画) art(美术·色彩·摄影) sound(声音)
```

- 每周工作产生的是"若干维度上的增量"，而不是一个整体的质量增量。这直接落实框架 §5.4 [已确认方向]"从当前阶段相关的质量维度中抽取若干项改善"。
- **阶段质量**（0–100）由该单集阶段相关的维度按配置权重加权得出，是派生值。
- **单集与作品最终质量**需要同时考虑项目级公共制作与各单集六阶段/工作项的完成和质量；具体聚合模型由架构智能体设计，并交由模拟验证，不得沿用“整部作品五阶段加权”的旧口径。
- 企划适配度作为评价辅助项，只影响 S/A/B/C/D，不反向修改质量。

**为什么值得这一层复杂度**：没有维度，"作画崩坏""剧情薄弱"这类题材特有叙事无法表达，周回执只能给出一个数字；而且"随机提升若干项"会退化为"随机加减一个总分"，玩家的因果理解会明显变差。维度集合是**内容配置**，不是领域硬编码，可增删而不改结构。

**风险**：六维会让 UI 有变复杂的倾向。守卫办法是只在"项目详情"展示维度，公司总览只显示阶段质量与最终质量。

#### 7.3.4 风险快照（派生）

```text
RiskSnapshot {
  pressure: 0..100                 // 综合压力
  factors: [{code, contribution}]  // 可解释来源
  warnings: [{code, severity, target_week}]
}
```

输入：期限余量、阶段/工作项质量缺口、员工疲劳与士气、单项目分配造成的资源缺口、外包可靠性、事件累积。由内核计算，项目持有以便 Event 与 UI 读取，但**不写入存档**（可重算）。不得引入独立管理负荷指标。

### 7.4 Vendor / Partnership / Market

```text
Supplier { id, name, specialties[], capacity_per_week>0, quality, speed, price_per_unit, reliability, unlocked_week }

OutsourceContract {
  id, supplier_id, work_id, unit_id, stage, ability
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
        previous_work_id: null|work_id, workloads[5], origin, style }
```

**不变式**
- `OutletContract.weekly_cap` 之和（同一供应商、active）≤ `Supplier.capacity_per_week`。
- `Committee.members` 中成员不重复、渠道不重复（一个成员一个渠道，`bd` 不挂成员）。
- `mode=contract ⇒ committee_id=null ∧ investment.percent=0 ∧ investment.paid=0`。
- `mode=committee ⇒ investment.percent ∈ {10,20,…,100} ∧ committee_id≠null`。
- `Offer.allowed_modes`：普通企划必含 contract 与 committee；原创只含 committee。

### 7.5 Finance

```text
Ledger {
  opening_funds, balance
  entries: Entry[]                  // 只追加
}
Entry { id, week, work_id: null|work_id, category, amount: signed, counterparty: null|partner|supplier, memo }

流入（amount>0）：contract_received | commercial_share_received | success_reward_received
流出（amount<0）：investment_paid | salary | operations | production | temporary
                  | outsourcing | events | extension | penalty | development | distribution
```

**符号约定**：`amount` 带符号，`category` 只表示业务性质。由此"项目利润 = 该项目全部 entry 之和"，与 GAME_RULES V3.3 的四条恒等式一致，不需要另写一套利润公式。字段名沿用现有契约（`*_received` / `*_paid`），不因合并进统一流水而改名。

**不变式（可断言，且必须断言）**
1. `balance == opening_funds + Σ entries.amount`
2. 每笔 entry 只属于一个 category；同一笔现金不得产生两条 entry。
3. `amount<0` 的 entry 必须有对应合同、事件或结算原因（memo 记录来源 id）。
4. 项目归因视图：`Σ amount where work_id=w` 与该公司该项目的实际净贡献一致；不存在独立项目钱包。
5. 收入类 entry 只能在交付结算写入，不得中途入账（[已确认]）。

### 7.6 Event 与 Archive

```text
EventState {
  pending: null | { event_id, work_id, unit_id, stage, triggered_week,
                    options[{id,label,cost,risk_hint}], expires_week, escalation }
  last_event_week
  per_work: { work_id: { cooldowns{event_id: week}, major_seen[], deferred: null|instance } }
}

Archive {
  works: WorkRecord[]              // 只追加
  series: { ip_id, title, works[], last_week }[]
  company_result: null | { reason, weeks, final_funds, net_cash_change, total_projects,
                           best_work_id, rating, highlights[], negatives[] }
}

WorkRecord { id, name, ip_id, source, genre, scale, mode, investment_percent,
             start_week, end_week, end_reason,
             quality{六维}, quality_score, rating, occurrence_issues[],
             commercial_revenue, channel_breakdown[], commercial_rank,
             finance_summary{contract_received, investment_paid, commercial_share,
                             success_reward, costs{}, profit},
             team[], stages[], committee_snapshot[], major_events[] }
```

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
| `start_work(offer_id, mode, percent, committee_partner_ids)` | Application | 公司 running；企划存在；声望与成绩条件；模式合法；现金足够支付投资 | Project 建立、委员会成立、Market 消费企划、Finance 记投资与合同预算、员工可归属 |
| `set_work_plan(work_id, plan)` | Project | 公司 running；项目 producing | 更新计划，下个结算生效 |
| `assign_staff(staff_id, work_id)` | Staff | 项目存在且 producing；核心员工每周仅能归属一个项目 | 更新唯一项目归属 |
| `hire_core(staff_id)` / `scout(...)` / `dismiss_staff(staff_id)` | Staff + Finance | 招聘窗口；现金；名册上限（若有） | 名册变化、签约费/遣散费入账 |
| `hire_temporary(work_id, candidate_id)` | Staff + Finance | 项目 producing；现金 | 临时合同建立、项目费入账 |
| `sign_outsourcing(work_id, stage, supplier_id, work_total, mode)` | Vendor + Finance | 阶段合法；专业匹配；产能余量；现金 | 合同建立、费用入账、占用产能 |
| `create_custom_offer(name, source, scale, style)` | Market + Finance | 空闲窗口；现金；企划能力员工 | 自定企划入槽、开发费入账 |
| `adopt_proposal()` / `reject_proposal()` | Market | 存在提案；空闲窗口 | 提案转自定槽或清空 |
| `buy_tv_service(work_id)` | Project + Finance | 委员会模式；未购买；现金 | 渠道开放、发行费入账 |
| `request_extension(work_id)` | Project + Finance | 委员会模式；未用过；未过截止；现金 | 延期生效、压力与费用 |
| `advance_week()` | Application | 公司 running；无待处理事件；周 < 520 | 执行完整周结算（§9） |
| `resolve_event(event_id, option_id)` | Event → Application | 存在该待处理事件；选项合法；现金足够（若需付款） | 效果分派到各领域、清空事件 |
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
  works[{ id, plan, units[{ stage_key, status, work_done, work_total, quality, risk }],
          mode, deadline_week, extension }]
  staff[{ id, employment, abilities, fatigue, morale, assignment, contract }]
  suppliers[{ id, capacity, reliability, specialties }]
  contracts[{ id, work_id, stage, ability, weekly_cap, status }]
  committees[{ work_id, members[] }]
  market{ heat, competitors[] }
  events{ pending, cooldowns }
}
```

**收益**：依赖关系从 O(n²) 降为"各自 → 快照"。也让"顺序无关"变成可测试属性——只要所有计算只读快照，遍历顺序就不可能影响结果。

### 8.4 读模型

UI 不计算规则。核心在每次命令后输出读模型；读模型**不持久化**，加载时重算：

| 读模型 | 内容 |
| --- | --- |
| `company_overview` | 现金、本周/总周、声望、项目组合摘要（阶段、剩余工期、风险、资金占用）、人员负荷、待处理事项 |
| `work_detail(id)` | 单元/阶段、进度、六维质量与阶段质量、计划与实际差异、人员与外包占用、风险因素、预计完工周 |
| `staff_board` | 每人归属、负荷、疲劳士气、可用性、预警 |
| `finance_summary` | 余额、分类汇总、项目归因、现金可支撑周数 |
| `market_board` | 企划槽、热度、锁定原因、可获得的最佳机会 |
| `event_card` | 事件文本、选项、确定成本、风险提示 |
| `week_receipt` | 本周各项目变化、原因、人员变化、现金变化、事件、下周关注 |

`week_receipt` 是易失的会话反馈，不写存档（沿用现有政策）：重载后不重建上一周回执。

### 8.5 操作窗口与生效时点

多项目后，"空闲窗口"这个概念不再成立（公司可能永远有在制项目）。必须显式定义什么时候能做什么、什么时候生效。

**窗口**

| 窗口 | 允许的命令 | 说明 |
| --- | --- | --- |
| 经营中（`running`，任意时刻） | `start_work`、`set_work_plan`、`assign_staff`、各类招聘/解雇、`sign_outsourcing`、`create_custom_offer`、`adopt_proposal`/`reject_proposal`、`buy_tv_service`、`request_extension` | 不再要求"全公司空闲"。旧规则把招聘限制在 idle，是单项目时代的产物 |
| 经营中，无待处理事件 | `advance_week` | 事件未处理时禁止推进（[已确认] 事件暂停推进） |
| 有事件待处理 | `resolve_event`、`set_work_plan`（允许为应对事件调整计划） | 购买/签约类操作暂不开放，避免用一周之外的操作绕开事件成本 |
| 关闭中（`closing`） | `finalize_delivery`、`finalize_company` | 不可逆；`advance_week` 被拒绝 |

**生效时点**

| 操作 | 现金 | 数值效果 |
| --- | --- | --- |
| 招聘核心员工 | 签约费立即入账 | 下一周结算起计薪、可被分配 |
| 雇佣临时人员 | 项目费立即入账 | 下一周结算起可参与，绑定该项目 |
| 外包签约 | 费用立即入账 | 最近一次结算起按周产能交付 |
| 买电视服务 | 发行费立即入账 | 立即开放渠道，交付时参与分账 |
| 延期申请 | 费用立即入账 | 立即延长 `deadline_week` |
| 改计划 / 改归属 | 无 | **下一次结算生效**，当周已发生的结算不追溯 |
| 立项 | 投资与合同预算立即入账 | 项目立即出现，首次结算即参与 |

**纪律**：任何"立即生效"的操作都不消耗随机坐标、不推进周数；任何"下周生效"的配置在结算快照中被冻结，结算中途不得再读取可变状态（D9）。

---

## 9. 统一周结算

### 9.1 设计原则

| # | 原则 | 结构性保障 |
| --- | --- | --- |
| P1 | **原子** | 全部变更写入工作副本，最后一次性替换；任何步骤失败丢弃副本 |
| P2 | **顺序无关** | 分配在全局求解一次；所有计算只读快照；遍历按 id 排序 |
| P3 | **无部分承诺** | 产能不落账本（§4.2）；费用在一次提交中全部记入 |
| P4 | **可解释** | 每个增量带 `causes[]`；每个惩罚有稳定 code |
| P5 | **可复现** | 随机按坐标定位（§11）；无浮点 |
| P6 | **单入口** | 只有 `advance_week` 能改变周数与结算派生状态 |

### 9.2 十三阶段契约

| # | 阶段 | 负责方 | 输入 | 输出/写入 | 失败语义 |
| --- | --- | --- | --- | --- | --- |
| 1 | 守卫 | Application | state | — | 非法命令：拒绝，状态不变 |
| 2 | 快照 | Application | state | `WeekSnapshot` | 不适用 |
| 3 | 需求合成 | Kernel/allocation | 快照 | 每个项目/阶段/能力的需求量 | 不适用 |
| 4 | 资源分配求解 | Kernel/allocation | 需求 + 员工唯一项目归属 + 合同 + 可用能力 | `WeekAllocation`（含未满足量与可解释原因） | 不适用（不足不是错误，是缺口反馈） |
| 5 | 强制费用预检 | Application + Kernel | 快照 + 分配 | `MandatoryCost` | **不足 → 整周不提交并进入限时资金危机**（见 §9.3） |
| 6 | 原子记账 | Finance | MandatoryCost | 流水（工资/运营/制作/合同/延期） | 失败 → 整体回滚 |
| 7 | 制作执行 | Project + Kernel/production | 分配 + 阶段 | 工作量与六维质量增量、阶段完成、StageResult | 失败 → 回滚 |
| 8 | 人员结算 | Staff + Kernel | 实际参与 | 疲劳、士气、经验、预警、临时到期 | 失败 → 回滚 |
| 9 | 生命周期推进 | Project + Application | 阶段结果 + 截止 | 下一阶段 ready / delivering / 强制交付 | 失败 → 回滚 |
| 10 | 交付结算 | Application + Kernel/commerce/evaluation | delivering 项目 | 收入分账、Archive 记录、委员会关闭、关系、声望、系列 | 失败 → 回滚 |
| 11 | 事件抽取 | Event | 快照 + 冷却（仅 `producing` 项目） | 至多一个待处理事件 | 失败 → 回滚（事件不得导致半结算） |
| 12 | 时间与市场 | Company + Market | — | week+1、企划刷新、热度周期、提案、竞争轮次 | 失败 → 回滚 |
| 13 | 终局与回执 | Application | — | time_limit、资金危机期限、公司结局、周回执 | 失败 → 回滚 |

（阶段编号 1–13，其中 1、2 为准备，不产生业务变更。）

### 9.3 失败与终止的语义

**空转周是合法状态**：一个项目都没有时仍可推进（[已确认] 空闲周照付工资与运营）。此时阶段 3–4 无需求、阶段 7–10 无对象，阶段 5–6 仍扣工资与运营，阶段 12 仍刷新市场与热度。不提供"无成本跳周"。

**预检不足（限时资金危机）**：预检失败时，整次周结算不得提交，不允许任何项目部分推进或部分扣款；公司进入有期限的资金危机状态，而不是立即自动破产。

```text
现金 < 本周强制费用
  ⇒ 本次周结算工作副本整体丢弃：不扣本周强制费用、不推进项目、不结算人员、不抽取本周事件
  ⇒ Company / Finance 记录资金危机状态、缺口、开始时间与剩余期限
  ⇒ 不自动借款、不自动追加投资
  ⇒ 玩家可主动融资、缩减开支或调整项目自救
  ⇒ 危机期限内未解决，才进入 closing / bankrupt 并结算在制项目
  ⇒ 回执明确展示缺口、受影响项目和可采取的自救方向
```

**仍待细化的局部语义**：资金危机期间公司周数是否继续推进，以及工资与运营费是否继续产生。架构必须将危机状态与正常周结算区分，不能自行把“限时危机”实现成立即破产，也不能擅自决定上述时间/费用口径。

[已确认] 现金支付后恰为 0 本身不触发破产；资金危机阈值、期限和融资条件由模拟与后续细化确定。

**操作失败（回滚）**：除预检不足外的任何错误，都不许留下部分状态。因为状态是单文档，回滚就是丢弃工作副本，不需要补偿事务。

**交付后余额为负**：交付结算（扣罚、分成）完成后若余额为负，锁 `closing / bankrupt`，允许终局显示欠付缺口（[已确认]）。不创建贷款，不因后续回款撤销。

**交付由结算自动完成，不需要玩家确认**：正常完成或到期时，项目在本周结算的阶段 9 转 `delivering`、阶段 10 立即完成结算并入账，全程一次提交。`finalize_delivery` 命令只用于**公司已关闭**的场景——关闭发生在结算之外，此时未交付项目处于 `delivering`，需逐个（或批量）结清。

**事件暂停**：事件在结算完成后才抽取（阶段 11），因此"事件阻塞后续推进"天然安全——本周已经合法结算完，暂停的是下一次 `advance_week`。这从结构上消除了旧实现中"事件可跳过周成本"的漏洞。

**公司关闭（closing）**：只允许 `finalize_delivery` 与 `finalize_company`；`advance_week` 被拒绝。关闭不可逆。

**第 520 周**：先合法完成第 520 周结算，再统一收尾——已满足交付条件的正常交付，未完成按当前完成度结算，不补完。

### 9.4 周回执契约

```text
WeekReceipt {
  week
  funds_delta, balance
  works[{ work_id, stage, work_delta, quality_delta{六维}, stage_completed,
          completion_estimate, causes[{code, detail}], warnings[] }]
  staff_delta[{ staff_id, experience, fatigue_delta, morale_delta, assignment }]
  deliveries[{ work_id, quality_score, rating, revenue, company_received, rank }]
  events[{ event_id, work_id, title }]
  notices[{ code, text, severity }]
  next_week_focus[]
}
```

要求：`causes` 必须能回答"为什么这周只推进了这么多"。禁止只有数字没有原因的回执。

---

## 10. 关键业务流程

### 10.1 立项（start_work）

```text
守卫：running ∧ 空闲窗口 ∧ 企划存在 ∧ 声望/成绩满足 ∧ 模式合法 ∧
      现金（拨款前）≥ 公司投资额
1. 冻结 OfferSnapshot；计算 total_investment（仅委员会 = budget×2）
2. Partnership 成立委员会（成员→渠道），返回 committee_id
3. Project 建立：units[1]，stages 全部 locked，首阶段 ready；计划取默认
4. Finance 记两笔：investment_paid（若委员会）、contract_received（合同预算）
5. Market 移除该企划（含自定/提案槽清空）
6. 广播：新项目出现，UI 提醒配置计划
```

**原子性**：1–5 必须在同一次提交内完成。任一步失败 → 公司回到立项前，企划未被消费。

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
1. 质量：阶段质量 → 最终质量（规模模板加权 + 传递上限）；适配度修正评价
2. 评价：S/A/B/C/D（固定分数线）；重大事故独立影响
3. 商业：按渠道计算毛收入 → 汇总 → 应用热度/声望/系列系数 → 分账
4. 财务：commercial_share_received（+承制成功奖励）入账；扣罚入账
5. Archive：追加 WorkRecord（含团队与阶段快照、渠道对账、名次）
6. Partnership：委员会 closed，关系值更新
7. Company：声望变更（唯一入口，写日志）
8. Project：status=settled，清空员工归属，释放临时人员
```

**顺序敏感点**：先算收入再入账，再写 Archive，最后改声望——这样任何一步失败都不会出现"有记录无收入"或"有声望无记录"。

### 10.4 公司终局（finalize_company）

```text
输入：Archive.works、Company（周数/声望/现金）、Staff 最终状态
输出：CompanyResult（reason, weeks, final_funds, net_cash_change, total_projects,
                     best_work_id, rating, highlights[], negatives[]）
规则：破产优先判定失败；十年期满与主动结束同标准；单项突出可跨档；负面评价只记录不降档
```

### 10.5 委员会联动（商业分账）

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

估算（520 周）：项目 ≤ 5、员工 ≤ 30、流水 ≤ 6000 条、履历 ≤ 30 部、竞争公司 30。单文档约 0.3–1.5 MB。单次推进需复制 + 序列化一次，[待验证] H1 要求实测帧时；若超预算，先优化"不参与本周变化的领域不参与深拷贝"，再考虑分块存档。

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
| `offers/custom_offer/pending_proposal` | Market | 保留形状 |
| `pending_event`（全局单槽） | Event.pending（全局单槽，带 work_id） | 保留单槽，补归属与冷却 |
| `history[]` | Archive.works | 迁移并补渠道对账/名次/团队快照 |
| `preview` | 读模型 | **不进存档** |
| `phase` | 派生 | **删除**；由（公司状态 + 待处理事件 + 项目集合）派生 |
| `last_project_id` | 无 | **删除**；UI 用最近结算的 work_id |
| `seed` | 同名字段，语义改为 master seed | 保留字段，更换算法 |

### 14.3 迁移里程碑

不做"在旧单项目模型上加数组"的渐进补丁（审计 §7 已给出同一结论）。采用**绞杀式并行**：新代码在独立目录建立，旧路径保留到等价性验证通过。

| 里程碑 | 内容 | 退出标准（必须可测） |
| --- | --- | --- |
| M0 契约冻结 | v4 状态形状、命令表、校验器骨架、夹具 | 契约测试通过；空实现命令返回 `NOT_IMPLEMENTED` |
| M1 内核移植 | 把现有生产/评价/商业公式搬入纯函数，行为等价 | 与 v3 在同一场景下逐字段等价（回归样例） |
| M2 单项目结算 | Project（公共制作 + 至少一个单集）+ Staff + Finance + 结算 13 阶段 | 先验证单项目的公共制作、单集六阶段与工作项依赖；旧 V3 五阶段仅作历史行为参照，不要求玩法等价 |
| M3 多项目与分配 | 多项目统一分配求解、严格单项目归属、费用预检 | 2–3 项目争抢员工的场景；核心员工不跨项目重复占用；乱序遍历结果一致；无半结算 |
| M4 外部资源 | Vendor（合同/交付/失败）、Partnership（委员会/渠道）、Market（刷新/热度） | 外包产能不可双占；委员会分账对账通过 |
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
| 内核性质 | allocation | 同一输入任意打乱项目顺序，结果逐字段相同；员工不重复占用；产能不超卖 |
| 领域单元 | 各领域命令 | 守卫拒绝时状态不变；不变式在每次命令后成立 |
| 结算集成 | 13 阶段 | 步骤 7 注入失败 → 状态与结算前完全一致（哈希相等） |
| 财务恒等 | Ledger | 余额 = 期初 + Σ流水；同一笔不入两类；项目归因之和 = 公司净变化 − 期间外成本 |
| 确定性 | 整体 | 同 seed + 同命令序列 → 同 `state_hash`；跨平台一致（无浮点、无未排序遍历） |
| 回放 | replay | 命令日志重放得到相同哈希；520 周长跑基线固定 |
| 边界 | 终局 | 第 520 周合法结算后收尾；破产不可逆；资金危机期限内可自救 |
| 契约 | JSON | 非法形状被拒绝且错误码稳定；未知版本拒绝；派生字段缺失不影响加载 |
| 浏览器 | 端到端 | 真 WASM + 真 IndexedDB：立项→推进→事件→交付→存档→恢复→继续，逐字段一致 |

**禁止**：用单元测试冒充浏览器验证；用文档完成冒充功能实现；用模拟器结果冒充平衡结论。

---

## 16. 扩展缝（已讨论但未定案的方向）

架构不实现这些，但保证接入时不重写推进层。

| 方向 | 接入点 | 需要改动的地方 | 不需要改动的地方 |
| --- | --- | --- | --- |
| 单集制作与工作项依赖 | 已确认基线，不是扩展缝 | Project 必须表达项目级公共制作与单集六阶段、工作项依赖、最低交付门槛及并行 | 具体字段、聚合与读模型由架构智能体设计 |
| retake（返工回路） | `Stage.retake_count` + 阶段完成判定 | 内核 production 增加检查门、周回执增加原因 | 阶段状态机、结算顺序 |
| 整集外包（グロス） | `OutsourceContract.mode` 增加 `gross` | Vendor 校验、交付粒度 | 合同模型、产能占用规则 |
| 设施/组织能力 | `Company.facilities[]` | 内核读取修正系数 | 所有领域边界 |
| 限时资金危机 | 已确认基线；Finance/Company 需要表达危机状态 | 危机期限、玩家自救动作、融资条件与周成本语义 | 不得自动借款；不得改变统一现金池和周结算原子性 |
| 公司级事件 | `EventState.pending.scope = work \| company` | 触发池与效果分派 | 单槽限流、暂停语义 |

**判定标准**：若某方向需要修改"结算 13 阶段的顺序"或"Finance 的唯一货币权威"，说明它不是接入缝而是架构变更，必须重新评审。

---

## 17. 风险与未解决问题

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| R1 | 结算服务变成"上帝对象"（13 阶段 × 9 领域） | 难维护、难测试 | 每阶段独立函数 + 快照只读 + 每阶段单独测试；禁止在编排里写公式 |
| R2 | 项目级公共制作与单集工作项模型过度复杂 | 玩家理解与架构维护成本 | 保持项目级经营视图；工作项依赖和产出由系统处理，玩家不做逐项微操 |
| R3 | 六维质量提高理解成本 | 玩家看不懂质量为什么低 | 只显示维度详情；总览只给阶段质量与最终质量；回执用文案解释而非罗列数值 |
| R4 | 多项目资源竞争缺乏可读反馈 | 多开退化为"多几条进度条" | 通过现金、核心员工唯一归属、供应商产能和项目风险形成自然约束；不得新增独立管理负荷数值 |
| R5 | 内容量不足（企划/事件/员工） | 玩法再对也不好玩的 | 这是内容工作包（WP5/6/7），不是架构问题；架构只保证能装下 |
| R6 | 文档与代码再次漂移 | 历史审计的核心病灶 | 契约变更必须同 PR 更新架构/契约/测试；禁止"文档先行、实现后补"跨里程碑 |
| R7 | 迁移期双路径并存时间过长 | 两套逻辑分歧、测试失真 | M2 等价性验证后立即删除 v3 路径；设定硬截止 |
| R8 | 状态体积与序列化开销 | 周推进卡顿 | H1 实测；必要时只序列化变化域或分块 |
| R9 | 随机流拆分后分布被参数污染 | 平衡调整引发"运气变了" | purpose 隔离；分布测试；基线升版显式化 |

**仍需设计或验证的局部问题（不是产品方向待决）**

1. 资金危机期间公司周数是否推进、工资与运营费是否继续产生（需结合周结算与模拟给出方案）。
2. 组织协调能力如何影响项目执行；不得新增独立管理负荷数值，除非另行提出重大玩法变更。
3. 事件优先级与冷却的具体数值（内容+平衡）。
4. 竞争公司的收入公式是否复用玩家公式（规则层待专业设计）。
5. 项目结算后 `Project` 是否保留在活动集合中（架构生命周期细节，由智能体自主判断）。

---

## 18. 已确认产品决策（不再作为待裁决问题）

本文件此前列出的 P1–P4 均已被负责人明确决定覆盖。完整决策原文与边界见 [DECISION_LOG.md](DECISION_LOG.md)。

| 原编号 | 已确认结论 | 对架构的约束 |
| --- | --- | --- |
| P1 作品内制作粒度 | 项目级公共制作 + 单集制作；单集六阶段固定为单集内容设计、分镜与原画、动画制作、美术与视觉制作、摄影与剪辑、声音与最终交付 | Project 模型必须表达两层制作结构；六阶段属于单集；工作项依赖、最低交付解锁、前序继续完善与并行推进必须得到支持 |
| P2 核心员工跨项目支援 | 每名核心员工每周严格单项目分配，不允许同周支援、借调或拆分工时 | Staff 只保存唯一项目归属；分配算法不得生成支援份额；周结算后允许重新分配 |
| P3 资金不足处理 | 资金预检失败进入限时资金危机，不立即自动破产、不自动借款；危机期限内未解决才破产 | 周结算失败必须原子回滚；Finance/Company 必须表达危机状态与期限；玩家主动采取自救动作 |
| P4 自动执行是否花钱 | 已配置计划自动执行，但不自动招聘临时员工、不自动新增外包合同；新预算承诺由玩家决定 | WorkPlan 不得授权自动采购；执行只能使用已配置资源 |

以下内容属于已确认方向下的局部设计，不构成重新打开上述产品决策：危机期间周数与固定成本语义、融资条件和危机期限、临时员工/供应商跨项目调度细节、具体工作项和依赖图、质量聚合参数。

架构智能体应自主完成这些专业设计；只有提案试图改变上述已确认边界时，才提交负责人裁决。

## 19. 与现有文档的关系与冲突登记

### 19.1 文档权威顺序

1. `CORE_GAMEPLAY_REBUILD_FRAMEWORK.md` —— 玩法基线，最高。
2. **本文** —— 系统结构（领域、模型、接口、结算、迁移）。
3. `GAME_RULES.md` —— 规则口径（V3.9 之后各节）；与本文冲突时，规则以它为准，结构以本文为准。
4. `DATA_MODEL.md` / `API.md` —— **现状契约（v3）**，迁移完成后需按本文重写为 v4。
5. `ARCHITECTURE.md` —— 现状工程分层与技术约束，仍然有效的部分（技术栈、构建、验证边界）继续适用；其中"单 project / 全局 phase / 单事件槽"的描述将被 v4 取代。
6. 审计与研究文档 —— 事实与论证来源，不作为规则。

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
| C8 | 招聘/抽卡的"空闲窗口" | `DATA_MODEL` V3.6/V3.7：`hire_core`/`scout` 仅限 `running idle` 或 `project_settled` | 该窗口是单项目时代的产物；多项目下公司可能长期没有 idle 周，照搬会导致永远无法招聘。本文改为"经营中任意时刻可操作，成本立即入账、下周生效"（§8.5）。**这不是新增玩法，是被 B1 强制产生的调整**，需负责人知情；若希望保留"必须停下才能招人"的节奏，应作为独立玩法决策提出 |

### 19.3 本文不宣称的内容

- 不宣称任何玩法已实现。
- 不宣称平衡已完成。
- 不宣称 v3 行为正确，仅作为迁移等价性参照。
- 不宣称 WP0–WP11 工作包已被本文替代；本文是 WP0 的架构级产出，其余工作包仍需按各自交付物推进。

---

## 20. 给实施者的最短路径

```text
1. 读 §2（基线）→ §5（所有权）→ §7（模型）→ §9（结算）
2. 先写契约与校验器（M0），不写行为
3. 再写内核纯函数（M1），用回归样例对齐 v3
4. 再写单项目结算（M2），必须能复现 v3 的破产/到期/交付路径
5. 才允许加入第二个项目（M3）；此时第一个可测属性是"乱序遍历结果一致"
6. 外部资源（M4）与商业履历（M5）按工作包推进
7. 切换（M6）：改存档版本、删旧路径、同步文档
```

三条不可妥协的检查点：
- **没有快照的跨领域读取，一律不合入。**
- **没有不变式断言的领域命令，一律不合入。**
- **没有回放哈希的结算改动，一律不合入。**
