# WP10 前端原型交付说明（公司总览 / 作品详情 / 每周经营）

- 日期：2026-11-24（2026-11-25 补齐事件确认、财务/Archive 与关闭中快照）
- 范围：Issue [#39](https://github.com/zhengmin486/anime-production-committee/issues/39) 的「当前可立即做」优先项——三个核心界面的可点击静态原型。
- 代码位置：`apps/web/src/prototype/`，随 PR [#46](https://github.com/zhengmin486/anime-production-committee/pull/46) 合并进 `main`（合并提交 `e30c040`，内容提交 `63d9c11`，10 个文件 +1717/−2）。
- 本文补齐 #39 交付物 1（信息架构与导航图）、交付物 3（关键组件清单与 mock data 结构说明）、交付物 4（需要接入的读模型/命令字段映射清单），并登记验收对照与实测证据。
- 历史机制说明：本文原型中的 `cash_crisis` 回执、危机面板、危机截图及 `arrange_financing` 入口来自旧限时危机周方案，现仅作为历史原型样本保留，不得接入当前 v4 规则或照此实现当前 UI。限时危机周仅是未来更新候选，当前规则按 DEC-FIN-002/003 直接破产。
- 权威关系：玩法规则以 [DECISION_LOG.md](DECISION_LOG.md) 为准；读模型、命令与错误码以 [M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md)、[DOMAIN_ARCHITECTURE.md](DOMAIN_ARCHITECTURE.md) v1.4 为准；工作项与门槛口径以 [BLUEPRINT_SPEC.md](BLUEPRINT_SPEC.md) 为准；已确认的重大玩法决策见 [CORE_GAMEPLAY_REBUILD_FRAMEWORK.md](CORE_GAMEPLAY_REBUILD_FRAMEWORK.md) §12。**本文不定义任何规则数值。**

---

## 1. 入口与运行边界

| 项 | 实况 |
| --- | --- |
| 入口 | `index.html?view=prototype`，由 `apps/web/src/main.tsx` 判断查询参数后 `lazy()` 加载 `PrototypeApp`；`main.tsx` 改动量为 +5/−2 |
| 默认路径 | 不带 `?view=prototype` 时渲染原 `App`，v3 运行时与 WASM 链路不变 |
| 隔离 | 原型目录不引用 `types/gameV3.ts`、`gameStore`、`gameCore`、`indexedDB`，不发网络请求；`PrototypeApp.test.tsx` 有源码扫描断言，命中 `gameV3|gameCore|gameStore|useGameCore|indexedDB|fake-indexeddb|wasm|fetch(` 即失败 |
| 确定性 | 原型内无 `Math.random`、无 `Date.now`、无种子参与；同一份 `prototypeData` 渲染结果恒定 |
| 样式 | `prototype.css` 复用 `styles/index.css` 的 `--site-*` token，不新增颜色变量 |
| 图标 | 复用 `lucide-react@0.468.0`（ISC，许可声明保留在 [ASSET_CATALOG.md](ASSET_CATALOG.md)），未新增依赖 |
| 产物增量 | `build:web` 后 `PrototypeApp` 分块 JS 65.93 kB / gzip 21.82 kB，CSS 17.30 kB / gzip 3.58 kB |

## 2. 页面信息架构与导航图

```text
?view=prototype
└─ PrototypeApp（三页导航，页面切换不推进时间、不重置数据）
   ├─ 公司总览 CompanyOverview
   │    同时在制的作品 ──点击「打开作品详情」──▶ 作品详情（带入该作品）
   │    公司现金与承诺 / 谁在哪个项目上 / 并行经营的真实约束
   │    需要留意的经营问题 / 市场企划与长期合作
   │    公司现金流水与项目归因 / 作品 Archive 与经营历史
   ├─ 作品详情 WorkDetail
   │    作品选择（3 部）→ 单个作品视图：
   │    {project.title}（头部）→ 公共制作与单集制作是两层
   │    → {episodeCount} 集各自的制作进度（单集选择）→ 第 n 集《标题》
   │    → 持续方针与实际差距 → 这个项目本周占了谁 → 风险从哪来 → {project.title}的花费与回款
   └─ 每周经营 WeeklyOperations
        周次快照选择（4 份历史原型回执，含已废止的资金危机样本；危机态仅供追溯旧设计）
        {receipt.headline} → 本周真正需要玩家处理的 N 件事
        → 自动执行与仅报告 → 产出与原因
        → {事件标题}（事件态）/ 期限内允许做什么、不允许做什么（危机态）
        → 关闭中：只允许结清与总结
        → 最值得盯住的事
```

三页的关系：**总览定位问题 → 详情解释缺口 → 周经营给出此刻能做的动作**。事件处理落在每周经营的事件面板，财务流水与已交付作品 Archive 落在公司总览；作品详情的花费回款面板继续解释单部作品归因。三页结构暂不迁移为 v2 四场景。

与 `design/frontend-multi-space-direction-20261124`（D8/D9/D10 已裁决为「4 个场景」并取消独立周经营页）的迁移映射，供后续重构对照：

| 本批页面 | 方向稿落点 |
| --- | --- |
| 公司总览 | 办公室场景 + 全局状态栏 |
| 作品详情 | 制作现场（L1 作品 / L2 单集 / L3 阶段 / L4 工作项折叠） |
| 每周经营 | 全局事务中心（事件、回执、危机三块）+ 各场景命令入口 |
| 花名册中的归属与切换 | 办公室人物面板 |
| 市场企划与长期合作 | 会议室（决策）+ 发行与市场（结果） |

## 3. 关键组件清单

| 文件 | 行数 | 职责 |
| --- | ---: | --- |
| `model.ts` | 385 | 原型领域类型、枚举中文名表、四态周回执与展示派生函数 |
| `mockData.ts` | 444 | `EPISODE_ITEM_SPECS` / `COMMON_ITEM_SPECS` 与 `prototypeData`，含 4 份回执及事件样本结果 |
| `PrototypeApp.tsx` | 42 | 三页导航壳与当前页状态 |
| `CompanyOverview.tsx` | 122 | 公司总览面板，内嵌财务与 Archive |
| `FinanceArchive.tsx` | 66 | 公司单一现金池流水筛选与已交付作品历史 |
| `WorkDetail.tsx` | 204 | 作品详情 8 个面板 + 依赖/门槛状态机 |
| `WeeklyOperations.tsx` | 184 | 周经营面板、四态 banner、事件确认与关闭期预览 |
| `bits.tsx` | 37 | 面板容器、标记徽章、进度条等复用件 |
| `prototype.css` | 257 | 三页布局、四态色、事件与财务组件、响应式规则 |
| `PrototypeApp.test.tsx` | 216 | 14 条交互与数据自证测试 |

## 4. mock data 结构说明

`prototypeData: PrototypeData`（11 个顶层字段）：

| 字段 | 内容 | 口径来源 |
| --- | --- | --- |
| `company` | 公司名、周数、现金、声望 | DEC-FIN-001 唯一现金池；样本数值 |
| `staff[7]` | 6 名核心 + 1 名临时，含 6 维能力、疲劳、士气、周薪/项目计酬、离职预警、状态说明 | 角色枚举对齐 `DOMAIN_ARCHITECTURE` 契约 7 角色；数值为原型样本 |
| `allocations` | 每周每人唯一项目归属 + 上周归属 | DEC-STAFF-001 / 框架 D1 |
| `suppliers[3]` | 供应商产能与剩余容量 | DEC-PROD-003 外包约束；容量为样本 |
| `outsourcing` | 已签外包任务 | 同上 |
| `projects[3]` | 《雾港II》12 集 TV、《夜行电车》3 集 OVA、《小满》1 集短篇（在制，完成母版未达标） | 每项含 6 公共项 + 每集 14 项，`workTotal` 与 `deliverAt` 逐字来自蓝图 |
| `ledger` | 分类账目（13 类：投资、承制、商业、工资、运营、制作、临时、外包、事件、延期、违约金、开发费、发行） | DEC-FIN-001；项目账只是按 `work_id` 过滤的归因视图 |
| `receipts[4]` | 四份历史原型周回执；其中 `cash_crisis` 是已废止旧方案的静态样本，不代表当前运行态 | 仅作历史 UI 研究；当前破产语义见 DEC-FIN-002/003 |
| `marketOffers` | 企划机会与热度 | 样本 |
| `relationships` | 长期合作方关系 | 无读模型，见 §5 缺口 |
| `history` | 已交付作品履历 | 无读模型，见 §5 缺口 |

工作项口径（`docs/BLUEPRINT_SPEC.md`）：`work_unit=centi_staff_week` 是冻结枚举名，当前 v0.5 runtime 按 1 个工作点 = 1/70 人周（70 点/人周）换算；`deliver_at` 取 1–1000‰；`is_gate` 只允许出现在单集项上；《雾港II》的门槛项是 `delivery_master`（12 工作点、`deliver_at=1000`）。

界面上的工作项三态由 `model.ts` 判定并显示为「可开始 / 进行中，未达门槛 / 被依赖阻塞 / 已达标，可继续完善 / 已完成」。

> **本批最需要负责人确认的一点**：因为还没有 v4 读模型，`model.ts` 在 TS 里实现了 `isDelivered = workDone × 1000 ≥ deliverAt × workTotal`（与 `BLUEPRINT_SPEC.md:75` 同式）以及完成度、门槛达成的汇总。这是**展示态推导**，不是新增规则，接入 `work_detail` / `production_board` 后必须删除。见 #39 验收第 6 条「所有业务字段可追溯到 v1.4 架构、M0 契约或 DECISION_LOG」。

## 5. 读模型与命令字段映射清单（#39 交付物 4）

旧版 M0 原型清单曾包含 `crisis_board`；该读模型已随限时危机周退出当前接口范围。当前其余读模型按最新 M0 契约执行。

| 界面展示 | 读模型 | 现状 |
| --- | --- | --- |
| 现金 / 声望 / 周数 | `company.week`、`company.reputation`、`finance_summary.balance` | 有 |
| 在制作品列表、剩余工期、计划完成度 | `company_overview` 项目组合 | 有 |
| 单集列表、六阶段进度、门槛项、质量 | `work_detail(id)` | 有 |
| 工作项依赖三态 | `production_board(id)` | 有 |
| 员工姓名 / 角色 / 能力 / 疲劳 / 士气 / 归属 | `staff_board`（含 `assignment_work_id`） | 有 |
| 供应商产能与已签外包 | `work_detail` 人员与外包占用 | 部分（产能需 `suppliers` 视图） |
| 账目分类与项目归因 | `finance_summary` | 有 |
| 危机缺口、剩余期限、自救清单 | `crisis_board` | 已废止旧原型；当前版本不提供 |
| 企划机会与热度 | `market_board` | 有 |
| 事件卡（标题 / 影响对象 / 选项代价 / 后果） | `event_card` | 有 |
| 周回执（产出与原因、人员变化、下周关注） | `week_receipt` | 有 |
| **设施列表与效果** | 无 | **缺口**：需 `company_overview` 扩展一节，或由架构侧新增 |
| **合作方 / 委员会** | 无 | **缺口**：`relationships[]`、`committees[]` 展示投影；M4 前只做结构验证 |
| **已交付作品履历** | 无 | **缺口**：`archive.works` 展示投影，M2 Archive 落地后补 `archive_board` |

事件确认只修改 `WeeklyOperations` 的本地选择/回显状态，结果文本来自 `event.outcomes[optionId]`，不按选项重新计算工作点、现金或风险；切换周次保留回显，刷新页面恢复样本初态。关闭快照禁用推进按钮，结清与总结仅预览信息层级，不调用核心命令。

命令入口（原型均不提交真实命令）：`advance_week`、`start_work`、`set_work_plan`、`assign_staff`、`hire_core`、`scout`、`hire_temporary`、`dismiss_staff`、`sign_outsourcing`、`deliver_work`、`abort_work`、`request_extension`、`resolve_event`、`adopt_proposal`、`reject_proposal`、`create_custom_offer`、`buy_tv_service`。`arrange_financing` 仅为旧危机原型入口，不属于当前命令接口。

需要在接入时专门处理的错误码：`GATE_UNMET`（必须列出未达标门槛项并跳到 `production_board` 对应行，不能只报错）、`DEPENDENCY_UNMET`（指向阻塞项）、`CAPACITY_EXCEEDED`（显示该供应商剩余产能）、`INSUFFICIENT_FUNDS`（显示缺口与出路）、`INVALID_PHASE`（说明为什么此刻不能做，而不是把按钮静默置灰）。

## 6. #39 验收对照

| 验收条目 | 结果 | 证据 |
| --- | --- | --- |
| 新用户能从公司总览理解经营状态与当前最重要的问题 | 满足 | 「需要留意的经营问题」面板 + 每部作品的门槛缺口与落后周数；总览可一跳进入作品详情 |
| 项目详情能区分公共制作和每集六阶段，不误导为整部作品同步推进 | 满足 | 「公共制作与单集制作是两层」独立区块；单集网格为 `{集数} × 6 段`，无「一条 6 段流水线」表达 |
| 周经营界面体现员工每周唯一项目归属与计划自动执行边界 | 满足 | 归属表每人单行 + 上周归属与切换标记；「自动执行与仅报告」与「本周真正需要玩家处理的 N 件事」分列 |
| 历史事件待处理、旧危机样本与正常经营原型有清晰区分 | 历史原型验收 | 危机禁止清单和危机状态只证明旧样本表现，不构成当前规则或当前 UI 验收 |
| 关闭中有明确的结束边界 | 满足（静态快照） | 第 19 周假设破产快照禁用推进，仅提供达标结清与经营总结预览；不调用核心 `calculate_result` |
| 页面使用 mock data，不依赖未冻结 API | 满足 | 源码扫描断言（§1） |
| 所有业务字段可追溯到架构、M0 契约或 DECISION_LOG | 部分满足 | §4、§5 给出映射与 3 处缺口；`model.ts` 的展示态推导待负责人裁决（§4 末尾） |

已冻结基线的一致性检查（本批重构 `63d9c11` 的验收点）：单集六阶段与蓝图逐字对齐；无跨项目借调/拆分工时入口；界面无「管理负荷」数值（框架 D3 已确认首版不引入，而非作废）；D1–D6 不重列为待决事项；门槛达标与完成状态全部由工作点推导；单项目完成度与手算一致；`?view=prototype` 之外的路径行为不变。

## 7. 实测证据与验证记录

浏览器实测方式：`playwright-core@1.65.1` 驱动系统 Edge（`channel: 'msedge'`，headless）操作生产构建；`scripts/browser.test.mjs` 的 13 项测试覆盖原 v3 流程、存档、故障恢复、破产终局与原型新增流程。原型另由本机静态服务在 1440 / 768 / 375px 截图并检查 `document.documentElement.scrollWidth`；宽表格在自身容器内滚动，不撑破页面。

| 证据 | 视口 | 检查点 |
| --- | --- | --- |
| [`v2-1440-company.png`](evidence/wp10-prototype/v2-1440-company.png) | 1440×1000 | 公司总览、唯一现金池、派生完成度 |
| [`v2-1440-work.png`](evidence/wp10-prototype/v2-1440-work.png) | 1440×1000 | 作品详情两层结构、12 集网格、第 6 集等待主动交付 |
| [`v2-1440-week.png`](evidence/wp10-prototype/v2-1440-week.png) | 1440×1000 | 事件待处理态与玩家动作清单 |
| [`v2-768-week-crisis.png`](evidence/wp10-prototype/v2-768-week-crisis.png) | 768×1000 | 已废止限时危机周的历史设计截图，仅供回溯，不作为当前 UI 依据 |
| [`v2-375-work.png`](evidence/wp10-prototype/v2-375-work.png) | 375×1000 | 作品详情单列堆叠、六阶段条带 |
| [`v2-375-company.png`](evidence/wp10-prototype/v2-375-company.png) | 375×1000 | 公司总览单列堆叠 |
| [`v3-1440-finance.png`](evidence/wp10-prototype/v3-1440-finance.png) | 1440×1000 | 公司流水筛选、项目归因与 Archive |
| [`v3-1440-event-resolved.png`](evidence/wp10-prototype/v3-1440-event-resolved.png) | 1440×1000 | 事件选项确认后的样本结果回显 |
| [`v3-1440-closing.png`](evidence/wp10-prototype/v3-1440-closing.png) | 1440×1000 | 关闭中禁用推进、允许/禁止动作与结清预览 |
| [`v3-375-finance.png`](evidence/wp10-prototype/v3-375-finance.png) | 375×1000 | 窄屏财务筛选、表格内部滚动与 Archive 单列布局 |

命令结果（Node v22.23.5 便携版；Emscripten 4.0.23；Windows 10 19045 x64）：

| 命令 | 结果 |
| --- | --- |
| `npm run typecheck`（等价直接执行 `tsc -b apps/web`） | 通过 |
| `npm run test:unit`（等价直接执行 web 的 Vitest） | 261 / 261 通过（9 个文件；原型 14 条） |
| `npm run build:wasm` | 通过（CMake 4.4.5、Ninja 1.13.2） |
| `npm run test:wasm`（已构建后直接执行） | 21 / 21 通过 |
| `npm run verify:dist` | 通过：`game-core.mjs` 32,428 bytes，`game-core.wasm` 415,718 bytes |
| `npm run build:web`（等价直接执行 `tsc -b && vite build`） | 通过；原型 JS 75.46 kB / gzip 24.61 kB，原型 CSS 19.96 kB / gzip 4.00 kB |
| `npm run test:browser`（已构建后直接执行） | 13 / 13 通过（真实 Edge） |
| `npm run test:native` | **未通过**：本机缺 MSVC，未安装/修改系统工具链；不属于本批前端改动范围 |

## 8. 未包含与后续

- 真实事件执行、真实关闭交付与终局 `calculate_result`：当前仅为可交互静态预览，不提交命令。
- v2 四场景迁移与独立事件界面：本批保留三页结构，后续按 §2 映射表实施。
- 低保真线框：本批以可点击原型替代，未另出 4 张线框图。
- 素材：按方向稿 D8「像素场景 + 现代面板」，本批未使用任何位图素材，人物与场景为 CSS 色块占位；四场景所需的 3 张背景与透明底人物 sprite 仍缺，需先定 `staff_id → 文件名` 映射再生成。
- 方向稿合入后：三页按 §2 末尾的映射表重构为「全局壳 + 4 场景」，本批数据形状与字段映射清单直接复用。
