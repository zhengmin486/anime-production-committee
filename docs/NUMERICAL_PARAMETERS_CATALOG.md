# 数值参数总清单与标定查阅索引

> 状态：数值工作盘点清单，不是新的玩法决策或数值定稿。  
> 建立日期：2026-11-25  
> 适用范围：首版 v4 全部需要填写、计算、配置、抽样或验证的数值。  
> 维护原则：玩法规则以 [DECISION_LOG.md](DECISION_LOG.md) 为准；本文件只盘点数值对象、类型、状态和决策前应查阅的文件。不得因为本文件列出某个数值，就推断该机制已实现或该数值已获批准。

## 1. 如何使用这份清单

本清单不按优先级或开发顺序排列。它按数值类型和所属系统列出应当检查的参数，便于负责人、模块负责人和数值标定人员逐项认领、讨论和补充。

每一项的状态采用以下标记：

- **已确认**：数字或数量边界已由正式决策冻结。标定时只核对实现是否遵守，不得擅自改值。
- **待标定**：玩法方向已确认，具体数字、公式、范围、曲线或分布尚未确定。
- **临时参考**：当前代码、样例或历史提案中出现过数字，但这些数字只供运行、手算或研究，不构成最终平衡结论。
- **待细化**：需要先明确参数的定义、计算口径、字段归属或内容规则，再进入数值标定。
- **暂缓**：首版暂不确定或不实现；只保留必要的事实记录和扩展空间。

### 决定数字前的查阅原则

1. **先查正式规则**：[DECISION_LOG.md](DECISION_LOG.md)。确认该数字是已冻结常量、待标定参数，还是已经被后续决策覆盖。
2. **再查规则如何进入系统**：[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)。确认公式的输入、输出、单位、字段所有权、命令时序、不变式和财务归属。
3. **再查样例与当前实现**：[BLUEPRINT_SPEC.md](BLUEPRINT_SPEC.md)、[blueprints/tv_standard.blueprint.json](blueprints/tv_standard.blueprint.json)、[M1_RUNTIME_SLICE.md](M1_RUNTIME_SLICE.md) 及对应 v4 源码、测试。区分目标规则与临时占位值。
4. **最后查研究和模拟证据**：[DESIGN_BACKLOG_2026-11-25.md](DESIGN_BACKLOG_2026-11-25.md)、相关系统审计、行业研究和实验报告。它们用于提供候选范围和证据，不得覆盖正式决策。
5. 发现资料冲突时，以 DECISION_LOG 的现行决策为准；若确实需要改变已确认数字或规则，按 [ENGINEERING_CHANGE_GOVERNANCE.md](ENGINEERING_CHANGE_GOVERNANCE.md) 和 DECISION_LOG 的决策变更流程处理。

### 数值类型说明

| 类型 | 含义 | 常见形式 |
|---|---|---|
| 固定数量 / 边界 | 已冻结的数量、上下限、档位和计数限制 | 520 周、6 个阶段、2 个设施槽位 |
| 基础值 | 初始化时生成或每次计算采用的起点 | 初始现金、基础周薪、基础工作量 |
| 比例 / 系数 | 一个数值对另一个数值的乘算或折算 | 主责适配率、收入分成、质量传递系数 |
| 阈值 / 门槛 | 达到某条件后改变状态、解锁或触发 | 声望门槛、疲劳红灯、交付门槛 |
| 曲线 / 映射 | 随属性、规模、周数、评级或历史数据变化 | 能力成长曲线、声望递减曲线 |
| 概率 / 分布 | 随机生成或触发的可能性与取值范围 | 招聘候选分布、事件概率、收入波动 |
| 内容实例值 | 某张企划、员工、供应商、合作方或事件卡自己的数值 | 报价、能力、工作量、事件效果 |
| 体验验证指标 | 用于判断节奏与可玩性的观测指标，不直接作为运行时规则 | 经营机会密度、纯死水期占比 |

---

## 2. 时间、周期、数量与容量

| 数值项 | 需要确定的内容 | 状态 | 决定前应查阅 |
|---|---|---|---|
| 公司经营总周期 | 总周数、年度换算 | **已确认**：520 周、10 年 | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md) |
| 单周时间步 | 周结算的推进单位 | **已确认**：每次推进 1 周 | [DECISION_LOG](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md) |
| 项目制作周期 | 各规模、题材、目标质量的制作周数 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[蓝图规范](BLUEPRINT_SPEC.md)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) |
| 合同期限 | 不同企划的合同死线、交付日期 | **待标定 / 内容实例值** | [DECISION_LOG](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) |
| 不同作品规模的集数 | TV、短篇、OVA、剧场版等集数范围 | **临时参考**：TV 12–13、短篇 1–3、OVA/剧场版 1 | [蓝图规范](BLUEPRINT_SPEC.md)、[TV 蓝图样例](blueprints/tv_standard.blueprint.json)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) |
| 公共制作工作项数量 | 不同蓝图的公共制作项数量和拆分粒度 | **待细化 / 临时样例** | [蓝图规范](BLUEPRINT_SPEC.md)、[TV 蓝图样例](blueprints/tv_standard.blueprint.json)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md) |
| 单集工作项数量 | 六阶段下各工作项数量及拆分粒度 | **待细化 / 临时样例** | [蓝图规范](BLUEPRINT_SPEC.md)、[TV 蓝图样例](blueprints/tv_standard.blueprint.json) |
| 核心员工编制上限 | 不同公司成长里程碑允许的核心员工人数 | **待标定**；里程碑达成时立即解锁，只统计核心员工、不含临时工；已解锁名额永久保留、只增不减；不绑定设施等级/槽位/作画工作室，开放编制不收扩容费 | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61) |
| 同时经营项目数 | 是否存在项目槽位硬上限 | **已确认**：不设置固定项目数上限 | [DECISION_LOG](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md) |
| 市场企划槽位 | 初始槽位和最大槽位 | **已确认**：初始 4、上限 10 | [DECISION_LOG](DECISION_LOG.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 市场每周刷新数量 | 每周补充数量、旧企划保留和替换数量 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 招聘候选池容量 | 普通候选池人数、每周轮换人数 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 外派机会容量 | 每次市场刷新出现的外派机会数 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 供应商目录规模 | 初始供应商数量、解锁数量与分布 | **待标定 / 内容实例值** | [M0 契约](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 事件内容容量 | 事件卡数量、每类事件样本数量 | **内容工作，不等同于触发概率** | [事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md) |

---

## 3. 员工基础属性、能力与职业适配

### 3.1 属性范围与生成

| 数值项 | 需要确定的内容 | 状态 | 决定前应查阅 |
|---|---|---|---|
| 六项专业能力范围 | planning、direction、drawing、animation、management、postproduction 的数值范围 | **已确认**：0–100 | [DECISION_LOG](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 八种基础职业 | 作画、演出、脚本、摄影、监督、音乐、声优、美术 | **已确认**：8 类 | [DECISION_LOG](DECISION_LOG.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 职业—能力映射 | 每种职业的主能力、副能力以及能力分布 | **待细化 / 待标定** | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 职业—工作项映射 | 每种工作项允许哪些主责职业和协力职业 | **待细化** | [DECISION_LOG](DECISION_LOG.md)、[蓝图规范](BLUEPRINT_SPEC.md)、[TV 蓝图样例](blueprints/tv_standard.blueprint.json)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 初始能力分布 | 不同职业员工的能力起点、范围、偏科程度 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 副能力分布 | 多面手、专才和复合能力员工的比例及能力差异 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 潜力上限分布 | 各能力独立 potential_cap 的生成范围与职业差异 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 潜力展示档位 | 综合潜力档位/区间如何映射到各能力潜力 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 候选人的初始薪资 | 能力、职业、潜力、特性和雇佣形态对应的报酬 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 合作方关系值范围 | relationship 的取值范围 | **已确认**：0–100 | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[DECISION_LOG](DECISION_LOG.md) |

### 3.2 职业适配和监督资格

- 各工作项的主责职业映射表。**待细化**。
- 各工作项的协力职业映射表。**待细化**。
- 主责职业对产能的适配系数。**已确认锚点：100%**；其余配套公式待标定。
- 协力职业对产能的适配系数。**已确认锚点：60%**。
- 不具备职业资格时的参与限制。**规则边界已确认，具体映射待细化**。
- 六项专业能力分别对工作量、质量和监督统筹的贡献函数。**待标定**。
- 监督岗位所需的 direction、management 资格阈值（适用于演出/作画/脚本职业；监督职业天然具备资格）。**待标定**。
- 主责与协力的质量贡献基准、协力质量上限及按实际完成工作量加权的参数。**待标定**。
- 监督统筹占用员工本周精力的比例。**待标定**。
- 监督剩余精力折算为本项目普通工作项产能的方式。**待标定**。
- 多名主责员工共同承担同一工作项时的质量聚合方式。**待标定**。
- 协力质量贡献如何按工作项基准线拉近/稳定质量下限。**待标定**。
- 主责团队决定的工作项质量上限计算公式。**待标定**；协力不得突破该上限。
- 监督对项目团队统筹、协调的其他数值贡献。**待标定**，不得把管理负荷作为隐性惩罚重新引入。
- 被动离岗时临时代理监督的交接损失/代理效率修正。**待标定**。
- 代理能力并列时的候选排序属于确定性工程规则，按稳定员工 ID 顺序，不做随机抽取。
- 监督缺位停工时该项目本周制作进度为零，属于规则边界，不是可调平衡参数。

**参考文件：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55)。

---

## 4. 员工经验、成长、潜力与履历

| 数值项 | 需要确定的内容 | 状态 | 决定前应查阅 |
|---|---|---|---|
| 主责经验系数 | 有效主责产出对应的经验倍率 | **已确认**：100% | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 协力经验系数 | 有效协力产出对应的经验倍率 | **已确认**：60% | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 外派经验系数 | 外派实际参与工作带来的对应能力经验 | **临时参考**：常规产出的 50% | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 基础经验增量 | 每点有效产出或每周工作如何转化为经验 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 能力升级阈值 | 不同能力值升 1 点分别需要多少经验 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 分段成长曲线 | 新手、骨干、大师阶段的经验成本函数 | **已确认分段方向**：低于 40、40–69、70 及以上；公式待标定 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 经验溢出处理 | 一周跨越多个升级阈值时的经验扣除和剩余经验 | **规则已确认**；整数和舍入细节待细化 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 潜力揭示节奏 | 完整交付作品数、接近潜力上限时的揭示条件 | **方向已确认**：完整交付 1–2 部作品可逐步揭示；精确判定待细化 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 带新加速 | 带新加速型特性对新人的经验倍率 | **临时参考**：135% | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)、[#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56) |
| 监督专项经验 | 实际履职带来的 direction、management 经验 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 成长触顶后的处理 | 单项能力触顶是否停止累计经验、其他能力是否继续成长 | **规则已确认**；实现细节核验 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 老搭档磨合减免 | 共同成功交付 A 级以上作品的关键主创带来的减免值 | **待标定**；受普通磨合总减免上限约束 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)、[#57 加班/状态](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 代表作履历背书 | A/S 级委员会作品署名对谈判或伙伴匹配的权重 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)、[#60 声望](https://github.com/zhengmin486/anime-production-committee/issues/60) |
| 后天领悟特性数量 | 员工里程碑后可领悟的特性上限 | **已确认**：至多 2 个 | [DECISION_LOG](DECISION_LOG.md)、[#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56) |

---

## 5. 员工疲劳、士气、磨合和外派

| 数值项 | 需要确定的内容 | 状态 | 决定前应查阅 |
|---|---|---|---|
| 疲劳取值范围 | 疲劳状态的上下限 | **已确认**：0–100 | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M0 契约](M0_CONTRACT_FREEZE.md) |
| 士气取值范围 | 士气状态的上下限 | **已确认**：0–100 | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M0 契约](M0_CONTRACT_FREEZE.md) |
| 正常工作疲劳增长 | 有产出一周增加多少疲劳 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[M1 临时公式](M1_RUNTIME_SLICE.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 无产出疲劳恢复 | 待命、休息一周降低多少疲劳 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[M1 临时公式](M1_RUNTIME_SLICE.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 外派疲劳倍率 | 外派工作比普通工作增加多少疲劳 | **临时参考**：1.15 倍 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 加班疲劳增量 | 不同加班强度对疲劳的额外影响 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 疲劳对产能的影响 | 疲劳值到产能倍率的映射 | **待标定** | [M1 临时公式](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 士气变化 | 工作、待命、休息对士气的增减 | **待标定** | [M1 临时公式](M1_RUNTIME_SLICE.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 士气对产能的影响 | 士气值到产能倍率的映射 | **待标定** | [M1 临时公式](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp) |
| 黄灯阈值 | 疲劳或士气何时进入轻提醒 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[事件/提醒规则](DECISION_LOG.md) |
| 红灯阈值 | 进入强制休养状态的条件 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 红灯休养期 | 强制休养持续几周 | **临时参考**：1–2 周；须核对现行规则 | [DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 限时事件有效期 | 事件从触发周起可响应的周数 | **待标定**；触发当周计入，阶段 7 末到期 | [DECISION_LOG](DECISION_LOG.md)、事件模块设计 |
| 关键事件升级门槛 | 哪些事件可配置一次超时升级 | **待标定/内容配置**；最多一次 | [DECISION_LOG](DECISION_LOG.md)、事件内容指南 |
| 超时默认分支效果 | 普通事件首次超时自动执行的保守/消极分支效果 | **逐事件配置**；不得统一假设同一惩罚 | [DECISION_LOG](DECISION_LOG.md)、事件内容指南 |
| 升级事件违约惩罚 | 升级后再次超时触发的硬性违约效果 | **逐事件配置/待标定** | [DECISION_LOG](DECISION_LOG.md)、事件内容指南 |
| 普通员工磨合损失 | 接手他人已开工工作项时，一次性扣除的产出比例 | **待标定** | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M1 临时公式](M1_RUNTIME_SLICE.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55)、[#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56) |
| 监督换项目损失 | 监督人员切换项目时的团队级产能损失 | **待标定** | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M1 临时公式](M1_RUNTIME_SLICE.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| management 磨合减免 | management 能力如何缩放普通人员磨合损失 | **待标定** | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) |
| 团队润滑特性减免 | 团队润滑型特性带来的磨合减免 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56) |
| 磨合总减免上限 | management、团队特性、老搭档减免的合计上限 | **已确认**：普通人员磨合合计最多减免 50% | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md) |
| 外派收入 | 外派一周为公司带来多少现金 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 外派经验 | 外派工作对应的能力经验增量 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) |
| 外派持续时间 | 每个外派机会的合同周数 | **临时参考**：约 1–2 周 | [DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[DECISION_LOG](DECISION_LOG.md) |

**边界提醒：** 红灯员工本人强制休养，不阻塞公司和其他项目周推进；磨合只影响工作量产出，不直接影响质量；监督换项目的团队级损失与普通人员磨合减免分开计算。

---

## 6. 员工特性、主创相性与标签数值

首版已有八种特性原型：高爆发高消耗型、低波动保底型、带新加速型、团队润滑型、高效率推进型、死线抗压型、慢工打磨型、特定题材专精型。

需要确定的数值包括：

- 每种特性的基础效果幅度、效果对象和作用上限。
- 高爆发高消耗型：产出/质量波动上调幅度、疲劳或其他消耗增幅。
- 低波动保底型：随机波动压缩比例、保底效果强度。
- 带新加速型：新人经验倍率及适用条件。
- 团队润滑型：磨合损失减免幅度及适用人员。
- 高效率推进型：有效工作量提升幅度，以及是否存在明确的质量取舍。
- 死线抗压型：临近期限时的效率、风险或疲劳变化。
- 慢工打磨型：额外打磨投入、质量收益和时间/成本代价。
- 特定题材专精型：题材命中条件、加成幅度和未命中时是否有副作用。
- 里程碑领悟特性的触发条件、概率或确定性规则。
- 八种特性的初始生成概率、职业/能力相关分布。
- 特性之间的组合限制、叠加规则和冲突处理。
- 关键主创相性判定条件、单一主相性效果幅度。
- 理念冲突事件的触发概率、时间范围及选项效果。

**已确认边界：** 立项时只检查监督、脚本主责、作画主责三人；锁定单一主相性，不叠加多个相性。资料库设施与主创相性正交。特性效果不得越过自身作用对象，擅自变成全局加成。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)、[#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)、[事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)。

---

## 7. 制作工作量、产能、方针和质量

### 7.1 工作量与生产力

- 各公共制作工作项基础工作量。
- 单集六阶段各工作项基础工作量。
- 不同作品规模的工作量总量和人周需求。
- 目标质量、制作难度、题材和项目规模对应的工作量缩放系数。
- 单人基础周产能及“人周—工作点”换算。
- 六项专业能力对应的产能函数。
- 主责、协力适配后的产能换算。
- 多员工共同制作一个工作项时的分派、取整和剩余量处理。
- 多项目员工竞争时的产能分配边界。
- 不同工作项的制作效率差异。
- 低、标准、高三档投入强度的产能系数。
- 工作量随机波动范围、分布及上下限。
- 工作项完成度、最低交付门槛和关键路径长度。
- 公共制作工作量在项目总工作量中的占比。
- 不同蓝图的总工作量、阶段工作量和依赖图可达性。

**决定前应查阅：** [蓝图规范](BLUEPRINT_SPEC.md)、[TV 蓝图样例](blueprints/tv_standard.blueprint.json)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核声明](../packages/game-core/include/apc/v4/kernel.hpp)、[v4 内核实现](../packages/game-core/src/v4/kernel.cpp)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55)。

### 7.2 质量样本、聚合与作品评价

- 员工能力对质量样本均值的影响公式。
- 主责/协力/专业适配对质量样本的影响。
- 质量随机波动的范围与分布。
- 不同工作项允许提升的质量维度。
- 六个质量维度在不同阶段的抽样权重。
- 首次接触工作项时质量样本如何写入。
- 后续质量向新样本靠拢的速度。
- 工作项质量传递上限系数和偏移量。
- 工作项按工作量加权时的质量聚合规则。
- 阶段、单集、作品之间的聚合权重。
- 六阶段是否均权及其最终权重。
- 各单集是否均权及特殊规模的权重。
- 六维综合评分到最终质量分的计算方法。
- S/A/B/C/D 评级分数线。
- 企划适配度对评级的加减分或门槛修正。
- 强制交付完成度对最终评价的修正。
- 质量下限、质量封顶、质量上限及异常值处理。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)、[M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核实现](../packages/game-core/src/v4/kernel.cpp)、[v4 内核测试](../scripts/v4.test.mjs)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63)。

### 7.3 交付、延期和打磨

- 每个工作项的最低交付比例。
- 各类工作项的交付门槛是否不同。
- 项目整体可交付的门槛完成度。
- 未达最低交付时强制交付的扣罚比例。
- 不同延期周数对应的商业收入折损。
- 合同违约金比例、固定金额或封顶规则。
- 购买档期的费用、可选档期周期和期限。
- 延期对公司声望的影响。
- 延期对特殊授权、活动收入的影响。
- 额外打磨消耗的工作量、时间和现金。
- 打磨带来的质量收益区间。
- 各工作项达到 100% 后是否仍允许继续投入（遵循工作项完成边界）。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[蓝图规范](BLUEPRINT_SPEC.md)、[TV 蓝图样例](blueprints/tv_standard.blueprint.json)、[#60 声望](https://github.com/zhengmin486/anime-production-committee/issues/60)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 8. 加班、投入强度与制作计划

| 数值项 | 需要确定的内容 | 状态 | 决定前应查阅 |
|---|---|---|---|
| 加班产出增益 | 加班后增加多少工作量 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 加班费用 | 加班补贴、按人/周/项目/工作量计费的口径 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 加班疲劳 | 加班强度对应的疲劳增量 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 连续加班惩罚 | 连续加班时额外疲劳、效率或风险幅度 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 加班质量风险 | 疲劳如何影响质量波动或失误风险 | **待标定** | [DECISION_LOG](DECISION_LOG.md)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58) |
| low 投入系数 | 低强度的产能、制作费和疲劳变化 | **临时参考**：M1 0.8 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核实现](../packages/game-core/src/v4/kernel.cpp)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| standard 投入系数 | 标准强度的产能和成本基准 | **临时参考**：M1 1.0 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核实现](../packages/game-core/src/v4/kernel.cpp) |
| high 投入系数 | 高强度的产能、制作费和疲劳变化 | **临时参考**：M1 1.3 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核实现](../packages/game-core/src/v4/kernel.cpp)、[#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) |
| 方针取向数值效果 | quality、schedule、cost 是否只有排序作用，是否存在其他数值 | **待验证**；不得凭空叠加隐藏加成 | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md) |
| 项目内定向系数 | 定向目标是否额外改变产能 | **已确认**：不增加额外系数、不增加费用 | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md) |

---

## 9. 项目经济、薪资和公司固定成本

### 9.1 员工报酬

- 不同职业核心员工的签约费。
- 不同能力、潜力和履历对应的核心员工周薪。
- 高潜力、稀有特性或高能力候选人的薪资溢价。
- 不同职业的平均工资差异。
- 临时项目员工签约费。
- 临时项目员工周薪。
- 临时员工相对同等核心员工的成本溢价。
- 外派员工报酬、结算方式和到账时点。
- 招聘和签约时的费用支付规则及金额。
- 员工签约费和周薪的金额精度、取整和记账分类。

**已确认**：核心员工签约即入职，当周即可分配；签约费立即入账，首周周薪从签约后的下一次周结算起计提。临时员工绑定项目，签约费和周薪均归属合同项目。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

### 9.2 项目直接制作成本

- 核心员工周薪分摊到项目的计算方式。
- 临时员工签约费和周薪的项目成本。
- 外包费用。
- 加班附加费用。
- 不同投入强度的每周制作费。
- 不同工作项、不同规模作品的基础制作成本。
- 项目因延期产生的额外工资和制作成本。
- 项目级商业/档期支出。
- 特殊商业机会前置费用。
- 自主原创草稿开发费及扣费时点。
- 制作费收入与实际制作成本的差额、制作毛利及亏损幅度。

**已确认成本分类**：项目直接制作成本包括核心员工分摊周薪、临时员工签约费及周薪、供应商外包费用、加班溢价；电视服务等项目级商业/档期费用另列；闲置员工工资、公司固定租金和维护费属于公司级成本。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

### 9.3 公司固定成本

- 初始现金。
- 初始核心员工人数及总周薪。
- 公司固定运营成本。
- 办公场地租金。
- 办公场地扩容的一次性搬迁费（声望 190 解锁 4 槽、声望 350 解锁 6 槽；允许跨级直达目标规模）及扩容后的每周基础房租增量；租金增量从扩容确认后的下一次周结算起计提。
- 行政、人事及其他固定支出。
- 不同公司规模下的固定成本增长。
- 闲置员工工资。
- 设施维护费（需与各设施参数表保持一致）。
- 固定费用在正常周和危机周的计提口径。
- 公司规模改变时的费用变化。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M1 运行切片](M1_RUNTIME_SLICE.md)、[#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

### 9.4 经济模型目标指标

以下是经济标定目标或讨论基准，不是每个项目的固定结算公式：

| 指标 | 当前目标/讨论范围 | 状态与查阅 |
|---|---:|---|
| 标准顺利承制项目直接制作成本 / 制作费 | 65%–75% | **目标区间**；[DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 承制项目制作毛利率 | 25%–35% | **目标区间**；[DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 扣除公司固定开支后项目净现金增长 | 15%–25% | **目标区间**；[DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 表现不佳委员会项目投资本金损失 | 30%–60% | **风险目标范围**；[DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| A+/S 级委员会项目目标净收益 | 同规模承制路线净回报的 4–8 倍 | **头部目标，不是保证值**；[DECISION_LOG](DECISION_LOG.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |

---

## 10. 融资与资金危机

- 资金危机触发时的强制费用缺口判定。
- 危机期限：进入危机后允许自救的周数。
- 初次危机期限与再次进入危机是否相同。
- 融资额度上限计算公式。
- 声望、作品履历、当前负债对融资额度的影响权重。
- 不同融资来源的基础额度和额外条件。
- 贷款利率及利率单位。
- 贷款期限。
- 每周固定还款额的计算方式。
- 还款开始周及还款周期。
- 利息按本金、剩余本金还是其他基数计提。
- 多笔贷款的还款和利息合计规则。
- 资金恢复正常的预检阈值。
- 危机期限届满后的破产判定参数。
- 危机期间固定成本变化（工资、运营、还款与利息）。
- 交付结算后余额为负时进入危机的判定方式。

**已确认而不属于待标定的规则：** 正常周预检失败时不提交正常制作结算；危机期间周数继续推进、继续计提固定成本、允许现金暂时为负；不自动借款；融资是唯一允许的新增资金动作；危机期限内未恢复偿付能力才破产。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md) 的 Finance/危机章节、[M0 契约](M0_CONTRACT_FREEZE.md)、[#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 11. 市场、企划生成、招聘和 Scout

### 11.1 市场企划池与生成分布

- 每周生成多少新企划。
- 每周保留、替换多少旧企划。
- 不同规模企划的出现权重。
- 不同题材的出现权重。
- 不同目标质量等级的出现权重。
- 不同预算、工期和工作量的分布。
- 不同企划来源（市场、原创、IP 上门、员工提案）的生成比例。
- 公司声望对企划质量、规模和数量的影响。
- 公司资金对可出现企划规模和预算的影响。
- 市场题材热度对企划供给的影响。
- 普通企划自然有效期。
- 急单、稀缺项目的短有效期。
- 市场竞争公司对企划的抢单概率或竞争强度。
- IP 上门企划出现概率。
- 市场候选的重复率和题材多样性。

**已确认边界：** 市场初始 4 个企划槽、上限 10 个；市场按周自然滚动；锁定企划不因正常刷新而被替换。普通企划有效期等细节应以最新正式决策与 Market 契约为准，不直接照搬历史提案。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59)。

### 11.2 招聘池与 Scout

- 常规招聘池容量。
- 常规招聘池每周轮换人数。
- 常规候选人职业分布。
- 候选人能力分布。
- 潜力分布。
- 特性分布。
- 不同稀有程度候选人的出现概率。
- Scout 单次费用。
- Scout 对能力、职业或潜力分布的定向修正幅度。
- 定向职业和定向能力对候选池分布的影响。
- 候选人签约窗口长度。
- 保底计数起点、触发阈值、重置条件和共享规则。
- 员工提案的生成数量、触发节点和出现概率。
- 员工提案与常规招聘池之间的候选人重复控制。

**已确认边界：** 常规招聘池每周部分轮换；Scout 为付费即时服务，首版每周最多一次，候选人有 1–2 周限时签约窗口；员工提案不成为免费人才生成渠道。具体池容量、概率和费用待标定。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)。

### 11.3 企划定金锁定

- 定金比例。
- 定金计算基数。
- 定金金额的取整规则。
- 定金抵扣的目标费用及抵扣顺序。

**已确认：** 锁定期 2 周；提前 1 周提醒；接单时定金 100% 抵扣对应立项保证金或前期费用；逾期不退；同一企划终身最多锁定一次，不允许续锁。

**待标定：** 定金比例和计算基数。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59)。

### 11.4 自主原创企划

- 创建原创草稿所需的基础声望门槛。
- 草稿开发费金额。
- 草稿开发费扣费时点。
- 原创正式立项所需的制作预算、投资本金和其他应付款。
- 原创企划的题材、规模、目标质量和工作量生成分布。
- 企划会议室等设施对原创筹备消耗的降低幅度。

**已确认：** 草稿创建与正式开工分两级准入；创建草稿不检查全部投资资金；正式开工时检查全部应付款。草稿开发费金额和扣费时点仍待标定。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[PRODUCT.md](PRODUCT.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59)、[#60 声望](https://github.com/zhengmin486/anime-production-committee/issues/60)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 12. 公司声望与组织成长

- 不同评级作品的基础声望增量。
- 按时、轻微延期、严重延期、强制交付不达标的声望调整。
- 中途主动弃项的声望扣减。
- 商业热度对声望收益的乘数。
- 声望高位时低规模、低评级项目的收益递减曲线。
- 头部渠道/委员会成员首次成功合作的背书奖励。
- 声望等级区间和等级名称。
- 声望对市场企划质量和规模分布的影响。
- 声望对招聘名单和高潜力员工出现概率的影响。
- 声望对供应商目录解锁的门槛。
- 声望对代理渠道开放的门槛。
- 声望对原创草稿准入的门槛。
- 声望对融资额度的影响。
- 声望对媒体关注、作品初期曝光和商业表现的影响。
- 公司规模/组织成长节点及核心员工编制扩容数量。
- 声望等级与设施槽位扩容的边界（已冻结的槽位门槛不应随意改动）。

**已确认：** 声望初始 100，最低 0，不自然衰减，不设数值上限；声望不能直接改变制作质量或作品评级。其余增减幅度、阈值和收益曲线待标定。

**已有但未冻结的讨论参考：** B/A/S 级增量、延期扣减、未达标交付扣分、商业热度加成 20%–50%、高位递减门槛 300/600、十年声望成长目标等。所有候选数值须重新核对决策登记册，不得直接写成常量。

**已确认的设施规模节点：** 初始 2 槽；声望 190 扩至 4 槽；声望 350 扩至 6 槽。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[#60 声望](https://github.com/zhengmin486/anime-production-committee/issues/60)、[#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61)。

---

## 13. 六项设施的成本、效果和升级数值

| 设施 | 需要标定的数值 | 决定前应查阅 |
|---|---|---|
| 休息与保健角 | 建设成本、周维护费、疲劳恢复量、高强度工作耐受加成、触发条件和上限 | [DECISION_LOG](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#62 设施](https://github.com/zhengmin486/anime-production-committee/issues/62) |
| 作画工作室扩建 | 建设成本、周维护费、行政/工位摊销降低量、社内作画协同收益和规模适用范围 | 同上 |
| 创作资料库 | 建设成本、维护费、趋势情报刷新周期、命中概率、质量下限兜底幅度、效率辅助幅度 | 同上、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 社内摄影与合成室 | 建设成本、维护费、每周社内产能、外包替代收益、适用工作项 | 同上、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) |
| 企划与委员会会议室 | 建设成本、维护费、额外企划强留名额、原创筹备消耗降低幅度、伙伴匹配加成 | 同上、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 社内试片与音控室 | 建设成本、维护费、声音/母版品控收益、返修风险降低幅度、供应商波动降低幅度 | 同上、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) |

通用设施参数还包括：

- 建设周期。
- 升级成本。
- 升级后效果强度。
- 升级的开放条件。
- 是否存在升级带来的维护费变化。
- 投资回收周期。
- 同类设施投资收益是否存在边际递减。
- 设施效果的上限和叠加限制。
- 不建设设施时的替代路线成本与产能。

**已确认边界：** 首版六项设施；同类每家公司最多一座；初始设施槽 2 个，声望 190 开放 4 槽，声望 350 开放 6 槽；建设期间占槽，升级不额外占槽；设施不垄断基础玩法资格、不形成全员通用百分比加成；建设和升级均为可选长期投资。建设期曾以 2 周作为暂定值，须在设施标定中核定。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[#62 设施](https://github.com/zhengmin486/anime-production-committee/issues/62)。

---

## 14. 供应商、外包和整集协力

### 14.1 供应商目录数值

- 供应商初始专业能力。
- 供应商质量水平。
- 供应商制作速度。
- 供应商每周总产能。
- 供应商报价单价。
- 供应商可靠性。
- 不同供应商档次的属性分布。
- 供应商专业方向和可承接工作项范围。
- 供应商目录解锁周或声望门槛。
- 供应商稀有度及出现概率。

### 14.2 外包合同数值

- 不同工作项的外包基础单价。
- 普通外包费用。
- 紧急外包溢价。
- 外包合同总工作量。
- 外包每周承诺产能。
- 合同交付期限。
- 供应商产能在多个合同之间的占用和释放。
- 供应商能力对工作项产出和质量的贡献函数。
- 外包交付可靠性、延期概率和失败概率。
- 失败或逾期后已支付费用的损失规则。
- 多供应商拆分工作项时的协同损耗。
- 整集打包相对分项外包的价格溢价。
- 整集打包要求的最低能力和周产能。
- 外包项目在交付、中止、公司关闭时的成本处理。

### 14.3 外包覆盖度与质量边界

- 外包覆盖比例的分母定义。
- 工作量如何归一化为覆盖比例。
- 第 2–5 阶段可外包工作项的覆盖统计。
- 达到何种实际外包比例触发整集 B 级封顶。
- 多供应商拆分工序协同损耗的触发条件和幅度。
- 外包质量贡献与供应商质量上限。
- 整集打包成本相对分项外包的差额。

**已确认边界：** 整集协力只覆盖单集第 2–5 阶段；第 1 阶段核心创作和第 6 阶段最终母版把关留在社内；整集打包必须完整预检、一次性成功或失败；质量封顶按实际外包覆盖程度判断，不得因拆单规避。

**临时参考：** 外包覆盖比例 ≥70% 曾作为候选阈值，不是冻结值；分母与工作量口径仍待确定。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 15. 委员会投资、渠道与常规商业收入

### 15.1 已确认的结构性数字

| 数值项 | 当前值 | 状态 |
|---|---:|---|
| 委员会总投资池 / 制作费 | 2 倍 | **已确认** |
| 制作费 / 总投资池 | 50% | **已确认**，为游戏参数，不是行业定律 |
| 玩家投资比例 | 10%–100%，按 10% 递增 | **已确认** |
| 委员会商业收益分配 | 按投资比例 Pro-rata | **已确认** |
| 电视无播出倍率 | 100% | **已确认** |
| 普通电视播出倍率 | 115% | **已确认** |
| 电视台成员强力播出倍率 | 125% | **已确认** |
| 购买优质/黄金档倍率 | 130% | **已确认** |

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)。

### 15.2 六个商业窗口的收入模型

六个窗口分别需要确定：

- 国内配信：基准收入、作品评价权重、大众人气权重、题材适配、热度系数。
- 海外发行：基准收入、硬质量权重、动作/奇幻/科幻等题材适配、海外市场规模。
- 玩具/周边：基准收入、题材适配、热度影响、波动幅度。
- 音乐：基准收入、音乐/演出质量权重、偶像/音乐题材加成。
- 电视播出：基础版权收入、档期费用、曝光带来的其他窗口增益。
- BD/DVD：基准收入、核心受众口碑权重、硬质量权重、制作公司实际留存比例。

六个窗口共同需要确定：

- 各窗口基准收入的相对体量。
- 每个窗口使用的质量维度和权重。
- 作品评价等级对收入的映射函数。
- 大众人气、核心口碑、硬质量的不同作用。
- 题材适配加减成。
- 市场热度四档对各窗口的不同影响。
- 公司声望对收入的影响。
- 商业潜力和受众基础的计算。
- 收入随机波动范围和分布。
- 收入是否存在最低值、封顶或边际递减。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[委员会商业审计](COMMITTEE_BUSINESS_AUDIT.md)、[行业研究](INDUSTRY_RESEARCH.md)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)、[#65 IP](https://github.com/zhengmin486/anime-production-committee/issues/65)。

### 15.3 渠道开放、代理与电视服务

- 外部代理渠道手续费率。
- 声望达到多少允许软绑定代理渠道。
- 合作历史如何满足代理开放条件。
- 不同代理渠道是否使用不同费率。
- 电视服务购买价格。
- 电视服务的费用与曝光回报。
- 自带电视台委员会成员时的免费播出价值。
- 电视倍率适用窗口的计算边界。
- 项目电视服务费用按玩家投资比例承担的金额计算。

**已确认：** 有委员会对应成员时渠道手续费 0%；无对应成员但具备合作历史或达到声望门槛时可通过代理开放；两项条件均不满足时渠道关闭、收入为 0。代理费率曾讨论 35%–45%，不是冻结值。电视倍率 100/115/125/130 已冻结。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[委员会商业审计](COMMITTEE_BUSINESS_AUDIT.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#60 声望](https://github.com/zhengmin486/anime-production-committee/issues/60)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

### 15.4 委员会中期诉求

- 每部委员会作品实际触发次数。
- 每周/每阶段触发概率。
- 触发时间分布。
- 不同委员会成员诉求的权重。
- 妥协选项增加的工作量、工期、成本和质量影响。
- 妥协选项对商业预期或委员会压力的改善幅度。
- 拒绝选项对合作机会、渠道预期或合作方关系的影响。
- 诉求选项之间的风险和收益差异。

**已确认边界：** 仅委员会项目触发，复用项目事件系统；每部委员会作品最多触发 1–2 次；不设置委员会成员投票或独立复杂政治系统。次数具体选择、时间和概率待标定。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 16. 特殊商业机会

- 不同特殊机会类型的基础出现概率。
- 作品进度达到多少后允许触发。
- 质量/热度预测达到什么门槛后允许触发。
- IP 伙伴主动接洽时的例外概率或条件。
- 游戏联动、活动/演出/先行上映、弹珠机、品牌联名等类型的收益分布。
- 接受机会需要增加的制作工作量。
- 前置费用金额和计算基数。
- 固定授权款和浮动收入的结构。
- 延期导致的固定授权款折损。
- 延期对活动/票房类浮动收入的影响。
- 质量不达标时授权款的折损或归零门槛。
- 中止项目造成的合作方好感变化。
- 特殊商业机会在委员会项目中的投资比例分配口径。

**临时参考：** 普通项目约 50% 制作进度或进入播出期后出现；A 级以上可作为质量门槛起点；延期后固定授权款可能保留约 50%–70%；质量不达标时可能降至约 20%–30% 或归零。这些均不是冻结值。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[委员会商业审计](COMMITTEE_BUSINESS_AUDIT.md)、[事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 17. IP、原作适配与系列继承

### 17.1 IP/原作资源数值

- 不同 IP 的基础受众规模。
- IP 初始关注度或商业潜力。
- 题材与目标受众适配系数。
- 原作粉丝基础对国内配信、海外发行、商品化、音乐、BD/DVD 的影响。
- 改编难度和基础工作量修正。
- 改编难度对工期、成本和质量风险的影响。
- IP 授权费用或合作条件。
- IP 企划出现概率、稀有度和供给权重。
- 出版社/IP 伙伴的声望、合作关系和合作条件。
- 原作类型、规模、题材的生成分布。

### 17.2 系列继承

- 前作商业基础对续作的继承系数。
- 更早系列作品对后续作品的长期积累权重。
- 多部前作同时存在时的汇总方法。
- 前作商业表现的衰减曲线。
- 不同续作类型（续作、前传、外传）的继承差异。
- 系列继承与当前热度、声望和题材适配的耦合方式。

**已确认边界：** 首版保留系列关联字段和前作商业基础继承关系；继承制作质量、评级不允许；不加入系列市场疲劳；独立衍生企划、商品化任务及授权开发不纳入首版。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[PRODUCT.md](PRODUCT.md)、[行业研究](INDUSTRY_RESEARCH.md)、[#65 IP](https://github.com/zhengmin486/anime-production-committee/issues/65)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

---

## 18. 随机性、概率与生成分布

随机性不只是一个独立领域。以下系统都需要各自的概率、分布或波动参数：

| 系统 | 需要确定的随机参数 | 决定前应查阅 |
|---|---|---|
| 制作工作量 | 每周产出波动、工作量修正范围、随机上下限 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) |
| 质量 | 随机质量偏移、维度抽取权重、极端结果概率 | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp)、[v4 测试](../scripts/v4.test.mjs)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58) |
| 员工 | 能力、潜力、职业、特性的生成分布 | [DECISION_LOG](DECISION_LOG.md)、[#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54)、[#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55)、[#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56) |
| 招聘 | 高潜力出现率、稀有候选人概率、保底阈值 | [DECISION_LOG](DECISION_LOG.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 市场 | 企划来源、规模、题材、质量、预算的生成权重 | [DECISION_LOG](DECISION_LOG.md)、[#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) |
| 事件 | 事件类别权重、每项目每周触发概率、冷却和触发窗口 | [DECISION_LOG](DECISION_LOG.md)、[事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58) |
| 委员会诉求 | 诉求触发概率、时间分布、类型权重 | [DECISION_LOG](DECISION_LOG.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58) |
| 商业收入 | 各窗口收入波动、热度变化、特殊商业机会概率 | [DECISION_LOG](DECISION_LOG.md)、[委员会商业审计](COMMITTEE_BUSINESS_AUDIT.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 供应商 | 可靠性、延期概率、交付失败概率 | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) |
| 竞争公司 | 竞争行为、企划竞争概率、竞争项目规模和收入分布 | [DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[DECISION_LOG](DECISION_LOG.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58) |
| IP | IP 题材、受众、商业潜力、上门企划生成分布 | [行业研究](INDUSTRY_RESEARCH.md)、[#65 IP](https://github.com/zhengmin486/anime-production-committee/issues/65) |

随机模型还需要明确：

- 每个随机用途的取值范围、分布形状和离散化方法。
- 概率参数使用整数千分比或其他统一单位的规则。
- 极端结果和保底结果的概率。
- 随机流、purpose 和 index 的隔离规则。
- 参数变更是否改变历史回放；如改变，如何更新 rules_version 和回放基线。
- 多项目同时结算时，项目遍历顺序是否影响结果（不得影响）。
- 固定 seed 下如何复现结果。

**已确认边界：** 中等随机性；玩家决策影响期望和风险区间；随机结果在周结算揭晓；固定 seed 可复现；不同用途、项目随机流隔离。不得通过数值标定公开未来精确随机结果或破坏回放确定性。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp)、[v4 测试](../scripts/v4.test.mjs)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)。

---

## 19. 事件卡具体数值

每张事件卡应根据其真实效果填写，不设一个适用于所有事件的统一数值模板。可能涉及：

- 事件的触发条件、基础概率、冷却周期。
- 事件可出现的项目阶段、进度区间或周数窗口。
- 选项增加或减少的工作量。
- 对合同期限、延期周数的影响。
- 对 story、direction、drawing、animation、art、sound 六维质量的变化。
- 对员工疲劳、士气和经验的影响。
- 对公司现金、项目成本和前置费用的影响。
- 对公司声望的增减。
- 对合作方关系值的变化。
- 对市场热度、商业预期和已签特殊商业收入的影响。
- 对供应商可靠性、合同期限或费用的影响。
- 效果延迟几周生效、持续几周或是否为一次性。
- 事件链下一张卡的触发概率和条件。

**内容作者负责表达事件内容、选项与具体效果提案；数值边界和跨模块规则由对应模块与数值标定确认。** 不得在 JSON 卡片中自创未登记效果类型、跨领域状态写入或概率规则。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[事件模块设计](EVENT_MODULE_DESIGN.md)、[事件内容指南](EVENT_CONTENT_GUIDE.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58)。

---

## 20. 风险预警、预测和经营节奏指标

这些数字主要用于风险计算、读模型和试玩验收。必须区分“展示指标”和“影响玩法的运行时参数”。

### 20.1 项目风险与预测

- 项目风险值的计算权重。
- 期限余量对风险的贡献。
- 未达交付门槛工作项数量对风险的贡献。
- 质量缺口对风险的贡献。
- 疲劳、士气对风险的贡献。
- 外包可靠性对风险的贡献。
- 待处理事件或事件历史对风险的贡献。
- 黄/红风险分界阈值。
- 距合同期限多少周进入风险预警。
- 预计交付周的预测算法。
- 预计交付区间上下界和置信/覆盖口径。
- 计划态预览的随机不确定性区间。
- 现金安全余量和未来固定费用预测窗口。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[M0 契约](M0_CONTRACT_FREEZE.md)、[#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61)、[#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63)。

### 20.2 现金和经营判断锚点

- 当前现金能覆盖几周固定成本时提醒风险。
- 新项目启动成本和安全垫的预测口径。
- 扩编后固定周薪的可承受区间。
- 项目逼近死线时的工期安全余量。
- 项目收尾释放人员产能的判断阈值。

**临时参考：** 现金储备仅覆盖约 4–6 周固定支出时，应呈现等待、外派或调整节奏的判断依据。这是提醒锚点，不是禁止接单的硬门槛。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61)、[#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64)。

### 20.3 经营机会密度与试玩指标

- 普通周平均每 1–2 周出现 1–2 个有实际意义的经营判断机会。
- 连续 3 周以上没有实质线索、变化或可用判断机会的纯死水期占比。
- 每周可行动线索的价值分布和重复率。
- 项目数增加后，玩家需要处理的提醒数量和实际操作量。
- 玩家是否能在不进行高频微操的情况下维持基本经营。
- 计划态预览与真实周结算结果的偏差。
- 玩家在接单、外包、扩编和委员会投资之间的实际选择比例。

这些是 M2/M3 试玩观察指标，不应直接转化为强制弹窗、行动点或每周事件硬上限。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[PRODUCT.md](PRODUCT.md)、[DESIGN_BACKLOG](DESIGN_BACKLOG_2026-11-25.md)、[M0–M7 路线](DEVELOPMENT_ROADMAP.md)。

### 20.4 UI 展示数字

- 概览默认突出几个最重要的瓶颈。
- 每个阶段展开显示多少个工作项。
- 预计交付安全余量的绿/黄/红分界。
- 员工疲劳红黄灯展示阈值。
- 周回执普通线索的默认突出数量。
- 当前周预期质量走势的展示区间。
- 数字舍入、百分比、货币、工作量和周数的展示精度。

已确认的展示约束包括：默认高亮最多 1–2 个核心瓶颈；普通可行动线索默认突出 2–3 条，但这只是视觉焦点数量，不是实际事项数量上限；工作明细按需展开。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[PRODUCT.md](PRODUCT.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[前端方向文档 PR #93](https://github.com/zhengmin486/anime-production-committee/pull/93)。

---

## 21. 竞争公司、排名和终局评价

- 竞争公司数量、初始规模和初始声望。
- 竞争公司员工能力、人员规模和生产力分布。
- 竞争公司可承接项目的预算、规模和质量分布。
- 竞争公司的企划竞争行为和概率。
- 竞争公司作品交付率、延期率和评级分布。
- 竞争公司的商业表现和收入生成方式。
- 玩家与竞争公司的排名计算方法。
- 排名是否按单部作品、年度或全周期统计。
- 公司终局评价的维度、权重和分数线。
- 财务、作品履历、员工成长、合作关系和声望如何进入终局评价。

**状态：** 竞争模拟参数需要结合实际首版范围确认；终局评价模型按现行决策暂缓。首版先持续记录账本、作品、员工和关系事实，不提前确定复杂综合评分权重。

**决定前应查阅：** [DECISION_LOG.md](DECISION_LOG.md)、[DOMAIN_ARCHITECTURE](DOMAIN_ARCHITECTURE.md)、[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)、[设计建议总清单](DESIGN_BACKLOG_2026-11-25.md)。

---

## 22. M1 已存在但不得直接当作平衡定稿的临时数值

当前 v4 M1 切片已经使用部分数字，供单周结算、手算和回归测试。它们的存在不代表已经完成数值平衡。

| 参数 | M1 当前临时值 | 使用位置/核查文件 |
|---|---:|---|
| 单人基础产能 | 1000 千分比 = 1 人周 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp) |
| 能力产能系数 | 500 + 能力 × 5 | 同上 |
| 士气产能系数 | 600 + 士气 × 4 | 同上 |
| 疲劳产能系数 | 1000 − 疲劳 × 4 | 同上 |
| 工作点换算 | 1 人周 = 100 工作点 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核声明](../packages/game-core/include/apc/v4/kernel.hpp) |
| M1 旧版不匹配适配系数 | 800/1000 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp)；须与正式主责 100%、协力 60% 规则分开核验 |
| 质量样本适配偏移 | ±4 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp) |
| 质量随机偏移 | -5 至 +5 | 同上 |
| 质量样本靠拢比例 | 30% | 同上 |
| 质量传递系数 | 600‰ + 40 | 同上 |
| 质量维度抽样示例 | 700/300 | 同上 |
| 普通磨合损失 | 当前 M1 公式/实现中存在 25% 扣减 | [v4 内核](../packages/game-core/src/v4/kernel.cpp)；架构文档和旧 M1 叙述中出现过其他值，必须以正式规则和最新实现审计为准 |
| 监督切换损失 | 当前 M1 实现 10% | [v4 内核](../packages/game-core/src/v4/kernel.cpp) |
| 疲劳变化 | 有产出 +8、无产出 -4 | [M1 运行切片](M1_RUNTIME_SLICE.md)、[v4 内核](../packages/game-core/src/v4/kernel.cpp) |
| 士气变化 | 有产出 -2、无产出 +1 | 同上 |
| 周运营成本 | 30,000 | [M1 运行切片](M1_RUNTIME_SLICE.md)、v4 费用实现 |
| 周制作费 | 60,000 × 强度系数 | 同上 |
| 投入强度系数 | low 0.8 / standard 1.0 / high 1.3 | 同上 |

**重要核验事项：**

- M1 文档、源码注释和源码实现可能存在不同时间的参数表述；遇到差异时，不得自行挑选一个数字当作正式决定，应先对照当前 main 的实现与正式决策。
- M1 运行切片明确声明这些值属于占位参数。数值标定后，必须同步配置、公式说明、针对性测试和模拟基线。
- v4 当前模型/代码仍可能保留部分旧字段或未完成的领域切片。决定参数时应先确认字段和命令契约是否已按 M0 最新修订落地，不能只看代码中存在的旧数值。

查阅：[M1_RUNTIME_SLICE.md](M1_RUNTIME_SLICE.md)、[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[v4 kernel.hpp](../packages/game-core/include/apc/v4/kernel.hpp)、[v4 kernel.cpp](../packages/game-core/src/v4/kernel.cpp)、[v4 model.hpp](../packages/game-core/include/apc/v4/model.hpp)、[v4 model.cpp](../packages/game-core/src/v4/model.cpp)、[v4 测试](../scripts/v4.test.mjs)。

---

## 23. 十二个既有数值标定议题的覆盖映射

本表用于将完整参数清单映射回现有 GitHub Issue。议题仍按原有领域存在，不代表其覆盖范围之外的交叉参数可以无人负责。

| Issue | 领域 | 应覆盖的参数内容 |
|---|---|---|
| [#54 成长](https://github.com/zhengmin486/anime-production-committee/issues/54) | 成长 | 基础经验、经验获取、能力升级阈值、分段成长曲线、潜力分布和揭示、成长节奏、履历权重 |
| [#55 职业](https://github.com/zhengmin486/anime-production-committee/issues/55) | 职业 | 职业能力分布、主责/协力映射、能力贡献函数、监督资格阈值、职业适配效果 |
| [#56 标签](https://github.com/zhengmin486/anime-production-committee/issues/56) | 标签 | 八种特性效果、触发条件、叠加上限、主创相性、里程碑领悟参数 |
| [#57 加班](https://github.com/zhengmin486/anime-production-committee/issues/57) | 加班 | 加班产出、成本、疲劳、连续加班、质量风险和恢复速度 |
| [#58 随机性](https://github.com/zhengmin486/anime-production-committee/issues/58) | 随机性 | 工作量与质量波动、概率分布、随机权重、极端范围、事件触发随机参数 |
| [#59 市场](https://github.com/zhengmin486/anime-production-committee/issues/59) | 市场 | 企划供给、刷新、招聘池、Scout、候选分布、热度和机会概率 |
| [#60 声望](https://github.com/zhengmin486/anime-production-committee/issues/60) | 声望 | 声望增减、评级映射、商业加成、声望门槛、递减曲线 |
| [#61 公司](https://github.com/zhengmin486/anime-production-committee/issues/61) | 公司 | 固定运营成本、组织规模、编制成长、现金压力、危机阈值 |
| [#62 设施](https://github.com/zhengmin486/anime-production-committee/issues/62) | 设施 | 六项设施成本、维护、效果、建设时间、升级和投资回收 |
| [#63 工期](https://github.com/zhengmin486/anime-production-committee/issues/63) | 工期 | 工作量、产能、集数、阶段/工作项参数、交付门槛、工期和延期 |
| [#64 经济](https://github.com/zhengmin486/anime-production-committee/issues/64) | 经济 | 薪资、项目成本、外包价格、投资、六窗口收入、代理费率、现金流和融资参数 |
| [#65 IP](https://github.com/zhengmin486/anime-production-committee/issues/65) | IP | IP 受众、商业潜力、改编难度、授权条件、系列继承系数 |

目前明确需要跨议题协作的内容：

- **事件效果数值**：由事件内容作者提供具体效果提案；触发概率归 #58，财务效果与商业收益分别由 #61/#64 校核，成长和员工状态效果由 #54/#55/#57 校核。
- **特殊商业机会**：触发概率归 #58，触发来源和供给归 #59/#65，收益及前置费用归 #64，声望与关系反馈由 #60 和相关模块校核。
- **竞争公司**：若进入首版模拟，需明确其范围和规则归属，再将生成概率、项目能力、收入分布分派给相应标定领域；不得因为没人负责就默认塞入 #58。
- **风险和经营体验指标**：运行时风险阈值由对应系统和 #61/#63/#64 协同；试玩验收指标由产品负责人确认，不应自动成为新玩法规则。
- **终局评分和长期公司价值**：按现行决策暂缓；不得提前把它们混入 #60 声望或 #61 公司成长标定。

---

## 24. 标定结果必须交付的内容

每个数值参数至少记录：

1. **参数名称与唯一语义**：一个字段/常量只表示一个明确含义。
2. **类型与单位**：金额、周数、工作点、百分比、千分比、能力点、质量分、概率等。
3. **状态**：已确认、待标定、临时参考、待细化或暂缓。
4. **作用位置**：领域、字段、纯函数、配置项、企划/员工/供应商/事件内容。
5. **候选值或区间**：无法定值时，给出有依据的候选区间；无证据则明确说明。
6. **计算公式**：说明输入、输出、舍入、截断、上下限和边界条件。
7. **规则依据**：关联 DECISION_LOG 中的现行决策；不能仅引用旧提案。
8. **证据来源**：行业事实、现有项目数据、手算样例、模拟结果或试玩观察。
9. **耦合关系**：指出会改变哪些其他数值、经济指标、风险或体验。
10. **验证场景**：典型值、边界值、极端值、不同 seed 和多项目场景。
11. **版本记录**：参数配置版本、代码/规则版本、随机 seed、样本量和运行命令。
12. **推荐结论**：建议采用值、备选方案及剩余不确定性。

参数调整后，需要同步受影响的配置、公式文档、数据样例、回归测试、模拟报告和玩家可见说明。若参数变更改变玩法规则、字段语义、命令守卫、结算顺序或存档含义，不能只提交数值 PR，必须按正式决策/契约变更流程处理。

## 25. 文档权威与历史资料边界

- [DECISION_LOG.md](DECISION_LOG.md)：现行玩法规则和已确认数值的唯一权威入口。
- [DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md)：公式职责、领域边界、字段归属和跨模块计算路径。
- [M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)：状态字段、命令、错误、不变式和契约。
- [M1_RUNTIME_SLICE.md](M1_RUNTIME_SLICE.md)：当前 M1 可运行的临时参数与公式说明；其中标有 PLACEHOLDER 的数字不是平衡定稿。
- [BLUEPRINT_SPEC.md](BLUEPRINT_SPEC.md) 和 [blueprints/tv_standard.blueprint.json](blueprints/tv_standard.blueprint.json)：工作项结构、工作量样例和最低交付门槛样例；当前样例值不是平衡定稿。
- [DESIGN_BACKLOG_2026-11-25.md](DESIGN_BACKLOG_2026-11-25.md)：历史候选值、讨论区间与待标定记录；须重新核对 DECISION_LOG，不可直接视作现行规则。
- [PROGRESS.md](PROGRESS.md)：当前阶段、实现状态和待集成缺口。
- [ENGINEERING_CHANGE_GOVERNANCE.md](ENGINEERING_CHANGE_GOVERNANCE.md)：已验收阶段的持续修补和变更分级规则。

本清单本身不冻结任何新参数。新增或删除参数、改变类型、调整责任归属时，应同步本文件和对应标定议题；最终数值只有在正式决策或标定结果被负责人确认、且工程与测试完成相应同步后，才能标记为已确定。
