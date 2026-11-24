# 公司经营与成长系统历史决策审计

> 历史资料说明：本文记录旧版 V2/V3 契约、旧五阶段制作模型或当时的研究建议，不代表当前目标玩法。现行决策以 [DECISION_LOG.md](DECISION_LOG.md) 为准：项目级公共制作 + 单集六阶段、工作项依赖并行、核心员工每周严格单项目分配、多项目并行及限时资金危机。本文中的旧阶段、资源分配和资金规则仅作为历史证据/旧实现迁移参考，不得直接作为新架构依据。


- 审计日期：2026-11-24
- 审计基线：GitHub `main@a74c23a87f012dfdc1af0eaeb4fb37d83486d352`
- 审计范围：公司资金与现金流、工资与运营成本、设施维护、招聘与培养成本、声望与长期成长、破产与终局、十年经营周期、多项目并行对公司经营的影响。
- 审计性质：只还原历史决策、当前实现和冲突，不重新设计公司经营系统，不替负责人确定未决参数。
- 验证说明：本次未运行构建、测试或经济模拟；仓库历史验收记录仅作为历史证据，不作为本次重新验证结果。

## 证据等级

- **A**：用户本次明确方向，或已合并且当前可执行、可测试的实现。
- **B**：负责人正式确认、已进入规则或契约，但未必实现。
- **C**：研究、提案、未合并 PR 或待验证假设。
- **D**：旧版本、已撤回方案或被后续决定覆盖的规则。
- **E**：基于多处证据形成的审计推断。

---

## 1. 已确认决定

| 决定 | 证据与当前状态 |
|---|---|
| 玩家经营动画制作公司；公司是长期主体，委员会是单部作品的项目级合作安排。 | **A**：用户最新方向。仓库正式定位也一致，见 [PRODUCT.md:7-9](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/PRODUCT.md#L7-L9)。但“委员会是临时组织”的精确表述尚未写入仓库。 |
| 公司可以同时经营多部作品；多项目竞争资金、人员、产能和管理资源。 | **A**：用户最新方向。仓库当前实现和旧文档仍相反，见第 4、5 节。 |
| 十年 520 周、以周为基本步长仍然适用。 | **A/B**：当前核心实现 [`game_rules.hpp:12`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/include/game_rules.hpp#L12)、[`game_core.cpp:979-1130`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L979-L1130)；正式规则见 [GAME_RULES.md:7-23](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L7-L23)。新方向没有废止周制或十年周期。 |
| 空闲周仍支付核心员工工资和运营成本；项目结束不等于公司结束。 | **A**：已实现，见 [`game_core.cpp:245-248`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L245-L248)、[`game_core.cpp:984-1015`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L984-L1015)。 |
| 每周强制费用先预检；付不起则零变更破产，不获得工作量、不预支收入；支付后现金为 0 不立即破产。 | **A**：规则见 [GAME_RULES.md:12-21](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L12-L21)，实现见 [`game_core.cpp:1022-1025`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L1022-L1025)。 |
| 合同预算就是制作预算；委员会投资本金一次性扣除，商业分成与投资本金分开。 | **B/A**：口径已确认，见 [GAME_RULES.md:25-47](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L25-L47)、[GAME_RULES.md:561-580](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L561-L580)。字段和校验已合并，但委员会实际扣款、分账未实现。 |
| 承制和委员会都有 BD 收入；初始 BD 毛收入 50% 归公司、50% 为综合成本；委员会非 BD 收入按投资比例分配，承制不参与。 | **B**：[GAME_RULES.md:543-549](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L543-L549)。尚未形成可执行的委员会现金流。 |
| 核心员工按周薪支付；临时员工不是周薪制，而是一次性项目费，且不参与培养。 | **B**：Issue #7 已撤回“周薪 ×1.3”，改为 `weekly_salary=0 + project_fee`，记入 `temporary`。相关核心行为仍未实现。 |
| 公司声望初始 100、下限 0、不自然衰减、不随机浮动，变化必须留日志。 | **A/B**：基础机制已实现，见 [`game_rules.hpp:30-31`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/include/game_rules.hpp#L30-L31) 和 [PROGRESS.md:45-46](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/PROGRESS.md#L45-L46)；等级和影响面未实现。 |
| 同一 IP 可以有续作、前传、外传；前作影响商业基础，不继承制作质量。 | **A/B**：系列化是用户最新方向；仓库规则已确认但待 M3 实现，见 [GAME_RULES.md:201-206](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L201-L206)。衍生作品关系尚未形成明确数据规则。 |
| 破产直接判定经营失败；十年期满和主动结束采用同一综合评价；项目交付与公司终局分离。 | **B/A**：规则见 [GAME_RULES.md:209-217](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L209-L217)；终局状态已实现，但综合评价尚未实现。 |

**审计结论：**当前真正完整的经营闭环只有“承制路线、单项目、周推进、固定团队、基础工资运营、项目结算、公司终局”。委员会投资、招聘、成长、系列化和综合结局仍主要是契约或规则，不是可执行系统。**等级：A/E。**

---

## 2. 已被后续决定覆盖或废止的旧规则

| 旧规则 | 后续状态 | 证据 |
|---|---|---|
| v2 按日推进、前中后三工序、固定三个报价。 | 已被 V1.0/V3 的周推进、五阶段、四企划取代。 | **D**：[GAME_RULES.md:239-318](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L239-L318)；变更提交 `94be77a`、`998be6e`、`6adf22b`。 |
| 初始声望为 0。 | 已改为 100。 | **D/A**：[GAME_RULES.md:257](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L257) 与 [`game_rules.hpp:30-31`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/include/game_rules.hpp#L30-L31)。 |
| 员工技能固定、不成长，没有招聘。 | 成长与招聘成为 V3/M2/M3 目标，但尚未完整实现。 | **D/B**：[GAME_RULES.md:291](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L291)、[PROGRESS.md:59-61](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/PROGRESS.md#L59-L61)。 |
| 项目利润只算 `revenue - spent`，不包含开工拨款。 | 已明确为错误口径；公司现金变化必须包含合同收入、投资、分成和全部成本。 | **D/B**：[V1_GAP_REVIEW.md:44-59](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/V1_GAP_REVIEW.md#L44-L59)、[GAME_RULES.md:38-47](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L38-L47)。 |
| 破产项目结算后回到 `idle`，还能继续接单。 | 已拆分为项目交付与公司终局；破产不可逆。 | **D/A**：[V1_GAP_REVIEW.md:59](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/V1_GAP_REVIEW.md#L59)、[GAME_RULES.md:68-73](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L68-L73)。 |
| 制作预算按总投资 20% 或 50% 反推。 | 已统一为 `contract_budget = 制作预算`，委员会 `total_investment = contract_budget × 2`。 | **D/B**：[GAME_RULES.md:561-580](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L561-L580)。 |
| 单渠道 `floor(revenue × percent / 100)` 的分账方式。 | 已被 BD、非 BD 渠道及 `channel_breakdown` 对账框架取代。 | **D/B**：[GAME_RULES.md:129-140](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L129-L140)。 |
| 临时员工“周薪 ×1.3”。 | 已撤回，改为一次性项目费。 | **D/B**：Issue #7 评论 `7064608830`。 |
| “不做动态市场”的笼统表述。 | 已改为轻量四档市场热度；合同收益不受热度影响。 | **D/B**：[GAME_RULES.md:160-168](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L160-L168)。 |
| 公司一次只能推进一个项目。 | **已被用户最新方向明确推翻。** | **D/A**：旧规则见 [PRODUCT.md:27](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/PRODUCT.md#L27)、[GAME_DESIGN.md:171](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_DESIGN.md#L171)、[GAME_RULES.md:507](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L507)。 |

---

## 3. 已讨论但未定案的事项

1. **正式经济数值**：初始团队、工资、运营费、制作工作量、工期、预算生成、扣罚、续作系数均未最终平衡。当前核心数值明确标为 M1 暂定值，见 [`game_rules.hpp:14-26`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/include/game_rules.hpp#L14-L26)。**B/C**
2. **招聘参数**：48 步招募协议取代 42 步方案，但费用、人数上限、概率和保底参数仍是暂定值。**C**
3. **成长参数**：经验获取、潜力兑现、能力增长、疲劳和士气系数尚未冻结；Issue #8/M3 仍待推进。**B/C**
4. **声望等级与影响系数**：等级阈值、称号，以及对企划、招聘、供应商、融资、曝光的实际影响均未定。**B/C**
5. **结局评价**：综合评价框架已确认，但权重、基础档次阈值、特殊成就和负面评价清单未定。**B/C**
6. **设施、升级、扩张和维护**：当前没有正式规则。仅有旧 v2 的“摄影设备维护”付费事件，不能视为公司设施系统，见 [GAME_RULES.md:369-377](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L369-L377)。**E/D**
7. **多项目并行的新规则**：仓库没有在“允许多项目”的最新方向下形成正式契约；现有文档仍明确禁止并行。不能把旧规则当作已定方案。**A/E**
8. **衍生作品关系**：仓库只确认续作、前传、外传；用户新增的“衍生作品”尚无对应历史决定或数据结构。**A/E**

---

## 4. 仓库文档、代码与历史决定之间的差异

| 领域 | 文档/历史决定 | 当前代码 | 审计判断 |
|---|---|---|---|
| 多项目 | 旧文档明确“一次一部”。 | `GameState.project` 为单数；`idle` 强制 `project=null`；`start_project` 只允许 `idle`，见 [`gameV3.ts:271-288`](https://github.com/zhengmin486/anime-production-committee/blob/main/apps/web/src/types/gameV3.ts#L271-L288)、[`game_core.cpp:702-720`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L702-L720)、[`game_core.cpp:859-902`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L859-L902)。 | 与最新方向直接冲突。**A/D/E** |
| 委员会经营 | 契约定义投资、成员、渠道和分账。 | 开工直接拒绝委员会；制作和结算也拒绝委员会，见 [`game_core.cpp:866`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L866)、[`game_core.cpp:753-755`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L753-L755)、[`game_core.cpp:1154`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L1154)。 | 已确认但未实现。**B/A** |
| 商业收入 | 规则要求 BD/非 BD 收入进入公司现金。 | 当前只计算并写入 `WorkRecord.commercial_revenue`，没有写入公司 `commercial_share_received` 或现金，见 [`game_core.cpp:1160-1207`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L1160-L1207)。 | 项目记录与公司现金流脱节。**B/A/E** |
| 招聘与外包 | 类型和动作已存在。 | `hire_temporary`、`outsource`、`hire_core` 均直接 `invalid()`，见 [`game_core.cpp:941-951`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L941-L951)。 | 有契约、无经营行为。**B/A** |
| 公司成长 | 文档要求能力、经验、履历、声望形成长期反馈。 | 周结算只增加 `experience`，没有把经验转化为能力，见 [`game_core.cpp:1055`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L1055)。 | 当前成长尚未形成持续制作能力提升。**B/A/E** |
| 声望 | 规则要求影响机会、招聘、供应商、融资等。 | 只有基础数值、日志和项目结算三档；`OfferSpec` 没有设置 `min_reputation`，见 [`game_rules.hpp:85-97`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/include/game_rules.hpp#L85-L97)。 | 基础机制存在，经营影响几乎未接通。**B/A** |
| 结局 | 文档要求综合累计表现、团队成长、特殊评价。 | `build_summary` 只按最终资金评级，见 [`game_core.cpp:314-328`](https://github.com/zhengmin486/anime-production-committee/blob/main/packages/game-core/src/game_core.cpp#L314-L328)；结果类型也没有声望、成长和特殊评价字段，见 [`gameV3.ts:254-262`](https://github.com/zhengmin486/anime-production-committee/blob/main/apps/web/src/types/gameV3.ts#L254-L262)。 | 已确认但未实现。**B/A** |
| 系列化 | 规则允许续作、前传、外传。 | `ProjectOffer`、`WorkRecord` 只有单个 `previous_work_id`，见 [`gameV3.ts:107-126`](https://github.com/zhengmin486/anime-production-committee/blob/main/apps/web/src/types/gameV3.ts#L107-L126)、[`gameV3.ts:230-252`](https://github.com/zhengmin486/anime-production-committee/blob/main/apps/web/src/types/gameV3.ts#L230-L252)。 | 简单前作关联可表达；多前作、分支外传和衍生关系缺少契约。**B/A/E** |
| 设施 | 无现行正式规则。 | `Company` 没有设施、产能、维护或扩张字段，见 [`gameV3.ts:94-105`](https://github.com/zhengmin486/anime-production-committee/blob/main/apps/web/src/types/gameV3.ts#L94-L105)。 | 不能声称已有公司设施经营系统。**E** |
| 经济模拟 | V0.6 报告声明仅用于实验。 | 模拟器一次只连续接串行项目，使用不同初始资金和成本参数，见 [`economic_simulator.py:158-226`](https://github.com/zhengmin486/anime-production-committee/blob/main/scripts/economic_simulator.py#L158-L226)。 | 不能作为当前核心或多项目平衡证据。**C/E** |
| 文档版本状态 | `PRODUCT.md` 开头仍称运行版本是 v2；`PROGRESS.md` 已记录 V3 主流程验收。 | 当前核心为 V3。 | 文档状态说明未完全同步。**D/A/E** |

---

## 5. 与其他系统的依赖和冲突

1. **共享人员与产能**：当前制作配置直接引用公司 `staff`，但没有跨项目占用、疲劳共享或产能分配规则。多项目后，同一员工能否同时分配、如何计算贡献必须先定义。**E**
2. **公司现金池**：现行制度是一个统一现金池，多项目会同时产生工资、运营、制作、投资和扣罚。需要明确同周支付顺序、原子性和破产边界；否则无法保证“付不起就不推进”的现有不变量。**B/E**
3. **项目结算归属**：当前 `calculate_result` 只处理全局唯一 `project`。多项目下必须明确哪部作品在何时结算、收入记入哪一区间，以及未结算项目是否影响公司总结。**A/E**
4. **事件系统**：现行规则是“当前项目、单事件、每周最多一个”，见 [GAME_RULES.md:219-230](https://github.com/zhengmin486/anime-production-committee/blob/main/docs/GAME_RULES.md#L219-L230)。多个在制项目会与“当前项目”和“同一时间最多一个待处理事件”冲突。**B/E**
5. **市场与开工窗口**：当前四企划、`idle` 才能开工、开工后清空市场槽位，均建立在单项目假设上。多项目需要重新确定立项窗口和市场状态。**A/E**
6. **十年终局**：当前第 520 周会截断在制项目；多项目下，是全部截断、允许已完成项目先结算，还是其他顺序，尚未决定。**B/E**
7. **系列化与作品历史**：单个 `previous_work_id` 不足以表达前传、外传和衍生作品可能形成的分支关系；也与并行项目下的时间先后和因果顺序相关。**E**
8. **破产与项目失败**：现规则中，延期和制作未达标会扣罚、影响声望，但不必然使公司破产；公司破产主要由无法支付强制费用或结算后现金为负触发。多项目下“一个项目失败是否拖垮公司”没有正式答案。**B/E**

---

## 6. 新架构需要重新讨论的问题

以下只是因最新方向产生的决策缺口，不是机制设计：

1. 多项目并行的允许范围：哪些制作阶段可以重叠，什么时候可以立项下一部作品？
2. 共享员工、产能和管理资源的计量方式，以及冲突时的分配优先级。
3. 同周多项目费用、投资、扣罚和收入的计算顺序，以及公司破产判定的原子边界。
4. 项目延期、制作失败、商业失败和公司破产之间，是否保持“项目失败不直接等于公司倒闭”的现行原则。
5. 第 520 周仍有多个在制项目时，公司终局与各项目结算的顺序。
6. 续作、前传、外传和衍生作品的关系模型，是否允许一个作品有多个关联作品。
7. 公司成长如何体现为“持续制作能力”：评价对象应是并行数量、团队能力、现金韧性、作品稳定性，还是这些指标的组合；具体权重仍待团队决定。
8. 设施与维护是否属于本轮经营范围。当前没有历史决定，不能从旧事件直接推导出设施树或扩张机制。
9. 经济模拟器是否继续作为独立实验工具；在适配多项目前，不应承担规则验证职责。

**十年周期和周推进本身不需要重新讨论；需要重新讨论的是它们在多项目状态下的结算顺序。等级：A/B/E。**

---

## 7. 有证据支持的改进建议

按优先级排列，均不引入新机制：

1. **先冻结多项目契约，再改核心。** 至少覆盖项目集合、共享人员占用、同周支付顺序、项目结算顺序和 520 周终局五个不变量。当前单 `project` 字段和 `idle` 开工限制是首要结构冲突。**证据：A/E**
2. **保留并扩展现有公司/项目分类账，不另造财务系统。** 现行公式已经明确合同、投资、分成和成本口径；缺的是多项目归属与确定性顺序，而不是更多账目。**证据：B**
3. **优先打通已确认但阻断的委员会现金路径。** 当前委员会在开工、制作、结算三处均被拒绝，商业收入也未进入公司现金；在此之前讨论投资回收和商业失败没有可执行基础。**证据：A/B**
4. **把“成长”验收从“经验值增加”改为“持续制作能力可观察”。** 先定义团队能力、并行承接、现金稳定性和作品履历如何进入结局，不急于增加新养成系统。**证据：A/B/E**
5. **补充多项目边界测试矩阵。** 至少覆盖：员工重复分配、同周现金竞争、两个项目同时到期、一个失败另一个继续、破产时多项目结算、第 520 周多项目截断、固定种子重放。**证据：E**
6. **将经济模拟器明确降级为非权威实验，或待其适配后再用于平衡。** 当前参数与核心不同且项目串行，不能证明多项目经营平衡。**证据：C/E**
7. **对设施问题暂不补设计。** 在负责人确认设施是否属于经营范围前，只记录为未决项，不把旧“摄影设备维护”事件扩写成设施系统。**证据：D/E**

**总体判断：历史财务口径已经较清楚，但当前可执行实现仍停留在单项目承制；最新方向与仓库最大冲突不是数值，而是状态结构、资源归属和跨项目结算顺序。**
