# 动画制作委员会

ANIME PRODUCTION COMMITTEE · 浏览器经营模拟游戏最小纵向切片 · v2 状态协议

当前范围是初始化公司、选择企划、安排团队、推进制作、处理事件、结算并接取下一部的最小循环，不是完整游戏或最终平衡版本。React 通过 Emscripten 的真实 WebAssembly 调用 C++ 六接口；没有用 TypeScript 伪造核心计算，也没有独立后端。

> **V1.0 迁移进行中。** 下面的玩法、协议与验收描述的是已合入的 v2 纵向切片，仍然准确，但不是目标形态。《游戏设计总案 V1.0》要求周制经营、五阶段、企划市场、委员会投资、六能力用工与公司终局，差距见 [docs/V1_GAP_REVIEW.md](docs/V1_GAP_REVIEW.md)，本轮分工与顺序见 [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md)，任务在 [议题 #1](https://github.com/zhengmin486/anime-production-committee/issues/1) 与 #2–#9。

## M0 契约交付

v3 目标结构、合法动作、周结算顺序、同周破产优先级、承制/委员会手算账与旧档拒绝策略见 [DATA_MODEL](docs/DATA_MODEL.md)、[API](docs/API.md)、[GAME_RULES](docs/GAME_RULES.md) 的 V3 部分。可编译契约与校验在 [gameV3.ts](apps/web/src/types/gameV3.ts)，静态夹具与契约测试供后续前后端独立开发。交接与尚未实现项见 [TEAM_PLAN](docs/TEAM_PLAN.md)。

**M0 没有更换运行时。** M1 已由 `9e2d023` 将 C++/WASM 核心切到 v3，但前端仍调用 v2 六接口；浏览器端没有 v3 端到端证据，由 #5 完成切换。当前进度见 [docs/PROGRESS.md](docs/PROGRESS.md)。

## 当前可玩内容

```text
新开公司 → 接手企划 → 排班 / 方针 / 外包 / 加班 → 推进一天
                         ↑                         ↓
                         └──── 处理制作事件 ──────┘
制作完成 / 截止强制交付 / 破产 → 结算 → 继承公司状态接取下一部
```

- 固定 4 名员工、3 个报价和 3 类制作事件；前期、中期、后期流水线展示进度、质量与士气影响。
- C++ 负责费用、制作、事件、结算及确定性随机数；TypeScript 传入 seed，只负责交互、协议校验和状态展示。
- 支持单槽手动存档、刷新后恢复、核心加载失败重试；不提供旧版 v1 存档迁移。
- 2026-11-21 本地验收通过：前端 204、原生 44、真实 WASM 10、浏览器 8 项；构建与产物检查通过，不代表数值已最终平衡或已上线。

六个 JSON 接口依次为 `initialize_game`、`start_project`、`apply_decision`、`advance_day`、`resolve_event`、`calculate_result`；输入、输出、错误与阶段限制见 [API.md](docs/API.md)。

## 技术栈与版本

| 用途 | 依赖 / 版本 |
| --- | --- |
| UI | React / React DOM 19.2.0 |
| 类型 | TypeScript 5.9.3 |
| 构建 | Vite 7.3.8、@vitejs/plugin-react 5.1.0 |
| 状态 | Zustand 5.0.8 |
| 样式 | Tailwind CSS / @tailwindcss/vite 4.1.17 |
| 图标 | lucide-react 0.468.0 |
| 本地存档 | 浏览器原生 IndexedDB，无第三方运行时依赖 |
| 前端测试 | Vitest 4.1.12、Testing Library React 16.3.0、user-event 14.6.1、jest-dom 6.9.1 |
| 测试环境 | jsdom 27.2.0、fake-indexeddb 6.2.4 |
| 真实浏览器测试 | playwright-core 1.65.1，驱动本机 Edge，不下载浏览器 |
| C++ | C++17、CMake、Emscripten |
| JSON | nlohmann/json 3.12.0 |
| 原生测试 | GoogleTest 1.17.0 |

npm 精确版本由 package-lock.json 锁定。TypeScript 类型包版本见 apps/web/package.json。Node 要求 >=22.12，npm >=10；编译工具要求和验证入口见下文，验收结论以实际执行结果为准。

## 目录

```text
apps/web/src/
  components/ pages/ stores/ services/ hooks/ types/ styles/ test/
apps/web/public/wasm/         # 生成的 game-core.mjs 与 game-core.wasm
packages/game-core/
  include/ src/ bindings/ tests/ CMakeLists.txt
scripts/                     # 原生/WASM 构建、集成测试、产物检查
docs/
  PRODUCT.md ARCHITECTURE.md GAME_DESIGN.md DATA_MODEL.md GAME_RULES.md API.md
  V1_GAP_REVIEW.md           # V1.0 差距审查与迁移计划
package.json                 # npm workspaces: apps/*、packages/*
```

build/、.tools/、node_modules/ 和 dist/ 都是本地产物，已忽略版本控制。

## 准备工具链

需要 Node/npm、Python 3、CMake、原生 C++17 编译器和 Emscripten。原生测试可用 Windows Visual Studio C++ 工作负载，或 Linux/macOS 的 GCC/Clang。

本项目将 Emscripten 安装于 `.tools/emsdk`，不修改全局 PATH。其他机器可以使用已安装的 SDK 并设置 `EMSDK`。SDK 不属于 npm 依赖，不会通过 npm install 自动安装。

从项目根目录安装固定 SDK 的示例（Git Bash / POSIX shell）：

```bash
git clone https://github.com/emscripten-core/emsdk.git .tools/emsdk
cd .tools/emsdk
./emsdk install 4.0.23
./emsdk activate --embedded 4.0.23
cd ../..
```

首次 CMake 配置需要网络下载固定版本的 nlohmann/json 和 GoogleTest；后续构建使用 CMake 缓存。不要混用原生和 WASM 构建目录。

## 开发

在项目根目录执行：

```bash
npm install
npm run build:wasm
npm run dev
```

Vite 绑定 127.0.0.1，默认端口 5173；如果被占用，以控制台输出为准。用 `http://127.0.0.1:5173/?seed=12345` 可固定新局种子。打开首页，待 C++ / WASM 就绪后新开公司，选择已解锁企划，调整排班、方针、外包或加班，再推进今天。触发事件时先选选项，企划结束后结算，再接取下一部。

前端 `game` 初始为 null，初始化数据必须来自真实 `initialize_game`。当前初始资金 2000000、声望 0、固定 4 员工，每轮相同 3 报价；movie 声望 20 解锁。这些是暂定参数，不再使用旧的预算/进度三字段夹具。

修改前端会热更新。修改 C++ 后重新运行 `npm run build:wasm` 并刷新浏览器，避免仍使用已经实例化的旧模块。未编译 WASM 时页面会明确提示加载失败，不会启用替代计算。

「保存进度」写入单一 IndexedDB 手动存档槽；「读取存档」恢复完整 GameState 和 seed。记录版本与 state.version 均为 2，DB schema 仍为 1；拒绝 v1 并提示新开，无旧版迁移。只存游戏状态，不存日结 report 或结算 result，重载后不恢复历史结算展示。存档只属于当前浏览器和源，不会在 localhost、不同端口或已部署域名之间自动共享，清理浏览器数据会丢失存档。

## C++ / WASM 编译

```bash
npm run build:native
npm run build:wasm
```

统一入口为 scripts/build-core.mjs：原生使用 build/native，WASM 使用 build/wasm。输出独立 ES Module 与 WASM 二进制至 apps/web/public/wasm。根 npm scripts 及 @anime/game-core workspace 都提供核心构建入口。

## 测试

```bash
npm run test:unit       # Vitest：组件、状态、存档与数据校验
npm run test:native     # CMake 构建并运行 GoogleTest
npm run test:wasm       # 重新编译 WASM，再实际导入模块并执行 C++
npm test               # 顺序运行以上三类测试
npm run typecheck
npm run test:browser    # 完整构建后，用本机 Edge 进行实际点击与截图
```

浏览器测试默认使用已安装的 Microsoft Edge。也可设置 `BROWSER_CHANNEL=chrome`，或用 `BROWSER_EXECUTABLE` 指向兼容浏览器的绝对路径。截图输出至 build/browser-tests。测试自动启动仅监听回环地址的临时静态服务器，使用隔离的浏览器上下文，结束时自动关闭；不会修改用户的浏览器配置。

store 单元测试通过模拟服务隔离状态逻辑，不能作为 WASM 证据。scripts/wasm.test.mjs 用于检查 WASM 魔数、WebAssembly.validate、真实模块加载与跨语言契约；不存在二进制时直接失败。原生、真实 WASM、前端与浏览器检查各自负责不同边界，不能互相替代。

v2 验收范围（2026-11-21 本地验收已通过）：

- 六接口从真实初始化、接取、安排、推进、事件选择到结算、下一企划走通，不能仅测旧示例扣款。
- 相同 seed 和决策序列可重放；非法完整状态、目录/阶段错误被拒绝，调用失败保留旧状态。
- 外包/加班推进前可撤销，日结才扣款并清除；流水线、返工、士气和整数边界符合核心公式。
- 截止日当天日结后强制交付，终局丢弃当日事件；破产不扣款、不推进日或 seed；收入与声望正确结算。
- 单槽 v2 存档刷新恢复、旧 v1 拒绝、损坏存档不覆盖会话；report/result 不承诺刷新恢复。
- 真实模块与二进制加载失败后可重试，busy 防重复操作，375/768/1440px 页面可操作；构建包包含独立 WASM。

### 实际执行结果（2026-11-21）

环境：Windows、本机 Edge、Node 24.22.1、Emscripten 4.0.23。

| 命令 | 实际结果 |
| --- | --- |
| `npm test` | 前端 204/204、真实 WASM 10/10、C++ 原生 44/44 通过 |
| `npm run typecheck` | 通过 |
| `npm run test:browser` | 完整 WASM / TypeScript / Vite 构建成功；Edge 8/8 通过 |
| `npm run verify:dist` | 通过；独立模块 31561 字节、WASM 269808 字节，二进制校验成功 |
| `git diff --check` | 通过，无空白错误；仅 Windows 换行提示 |

浏览器验收覆盖真实二进制响应、完整经营、同种子重放、下一企划、存档刷新恢复、模块/二进制加载失败重试、事件阻塞、破产、截止强制交付、损坏及 v1 存档拒绝，以及 375/768px 布局与操作；桌面完整流程使用 1440px。开发服务器也已在浏览器中实际操作到结算。首次浏览器测试有两项终局文案断言失败，统一文案后全量重跑通过，未放宽断言。

可复现样例：`seed=12345`，接取 OVA，正常方针与默认排班、不外包或加班，事件选第二项；经历 17 次日结、1 次事件，第 18 日结算。质量 79 / A，成本 5100000，收入 6320000，利润 1220000，声望 +10，结算资金 11220000，最终 seed 为 1702883732；同种子、相同操作重放的完整状态与结果一致。

### 本次纵向切片修改文件

- C++ 核心：[接口声明](packages/game-core/include/game_core.hpp)、[规则与暂定参数](packages/game-core/include/game_rules.hpp)（新增）、[六接口实现](packages/game-core/src/game_core.cpp)。
- 前端数据链路：[v2 类型与校验](apps/web/src/types/game.ts)、[WASM 服务](apps/web/src/services/gameCore.ts)、[存档服务](apps/web/src/services/saveGame.ts)、[状态层](apps/web/src/stores/gameStore.ts)。
- 前端界面：[应用入口](apps/web/src/App.tsx)、[首页](apps/web/src/pages/HomePage.tsx)、[制作与结算页](apps/web/src/pages/StudioPage.tsx)、[样式](apps/web/src/styles/index.css)。
- 前端测试：[协议夹具](apps/web/src/test/fixtures.ts)（新增）、[类型校验测试](apps/web/src/types/game.test.ts)、[WASM 服务测试](apps/web/src/services/gameCore.test.ts)、[存档测试](apps/web/src/services/saveGame.test.ts)、[状态层测试](apps/web/src/stores/gameStore.test.ts)、[首页测试](apps/web/src/pages/HomePage.test.tsx)、[应用测试](apps/web/src/App.test.tsx)。
- 核心与端到端测试：[原生测试](packages/game-core/tests/game_core_test.cpp)、[真实 WASM 测试](packages/game-core/tests/wasm.test.mjs)、[根 WASM 测试入口](scripts/wasm.test.mjs)、[浏览器测试](scripts/browser.test.mjs)。
- 文档：[README](README.md)、[接口](docs/API.md)、[规则](docs/GAME_RULES.md)、[数据模型](docs/DATA_MODEL.md)、[架构](docs/ARCHITECTURE.md)、[产品范围](docs/PRODUCT.md)、[V1.0 游戏设计总览](docs/GAME_DESIGN.md)。

仓库同步包含上述实现与测试，以及关联的贡献指南、Issue / PR 模板、素材目录、三张已入库的自生成图片与审计记录；素材来源记录本身不构成授权确认。没有修改构建配置、依赖、CI 工作流或 `.gitignore`，没有执行线上部署；工具链、依赖和构建产物不随 Git 提交。

## 生产构建

```bash
npm run build          # 先编译 WASM，再 TypeScript 检查和 Vite 构建
npm run verify:dist    # 检查部署包中的独立 WASM 产物
npm run preview
```

部署目录为 apps/web/dist，绝不能上传整个仓库或只上传 index.html。浏览器需通过 HTTP(S) 访问，不能直接打开 file://。

## Qoder Sites 配置

- projectRoot：本仓库绝对路径。
- webDirectory：`apps/web/dist`。
- 构建命令：本地执行 `npm run build`；Sites 打包工具不代为运行 CMake。
- Vite base：`/`。首页和经营页采用内存状态切换，`spa: false` 即可，不需要路由回退。
- 必须完整上传 `wasm/game-core.mjs` 和 `wasm/game-core.wasm`。
- ES Module 需以 JavaScript 类型返回；WASM 推荐 `application/wasm`，不能误返回 SPA 的 HTML。
- 单线程构建，无 SharedArrayBuffer / pthreads，不需要 COOP / COEP 特殊头。
- 不配置 Functions、云数据库、Storage 或 Secrets。
- 设计工作台入口由 Sites 工具创建和维护，禁止手工修改发布身份。

Sites 官方插件本地打包约束：单文件不超过 50 MiB，整体发布 ZIP 不超过平台 50 MiB 限制。本项目使用小型独立 WASM，不改变架构来绕过限制。实际托管 MIME、访问策略与 WASM 加载必须在发布后验证，不能仅凭本地成功下结论。

若以 E:/ 等过宽路径作为工作区根目录，Sites 的 get_context 可能返回 `sites_document_scan_limit`；这不代表 WASM 文件不被支持。应以本仓库为工作区根目录，复用已有设计入口，执行正常 prepare / publish / status 验证；无需移动源文件或更换技术架构。本地文档更新不代表已经发布或完成线上验证。

## 团队任务认领

最小纵向切片已合入 `main`，后续不从零重做员工、制作、事件或结算系统。请先阅读 [当前任务认领池](CONTRIBUTING.md#当前任务认领池)，其中六项候选任务分别说明现状、修改目录、接口依赖、交付物、验收与前置条件；所有任务当前待认领，不预设成员已经接单。

优先评审结算经济口径、改善制作台可读性，再根据试玩证据选择规则验证或调参任务；核心共享文件按序修改，三图素材已按负责人授权自生成入库，UI 接入需与前端负责人协调。前往 [GitHub 认领池总览 #1](https://github.com/zhengmin486/anime-production-committee/issues/1) 选择任务，在对应子议题评论认领并等待负责人确认；实时分工以议题评论和 Assignee 为准。

| 优先级 | 待认领任务 |
| --- | --- |
| P0 | [T01 · 结算与经济口径评审 #2](https://github.com/zhengmin486/anime-production-committee/issues/2) |
| P1 | [T02 · 员工与排班取舍验证 #3](https://github.com/zhengmin486/anime-production-committee/issues/3) |
| P1 | [T03 · 制作策略与流水线验证 #4](https://github.com/zhengmin486/anime-production-committee/issues/4) |
| P1 | [T04 · 事件取舍与恢复验证 #5](https://github.com/zhengmin486/anime-production-committee/issues/5) |
| P1 | [T05 · 制作台信息与操作体验 #6](https://github.com/zhengmin486/anime-production-committee/issues/6) |
| P2 | [T06 · 初期三图授权与接入准备 #7](https://github.com/zhengmin486/anime-production-committee/issues/7) |

## 文档

- [权威决策登记册](docs/DECISION_LOG.md)：负责人已确认的当前玩法规则，智能体开始工作前必须核对。
- [研究与审计成果目录](docs/RESEARCH_CATALOG.md)：研究报告、系统审计、模拟与实验材料索引。
- [核心玩法重构框架](docs/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)：当前玩法基线。

- [贡献与协作指南](CONTRIBUTING.md)
- [核心玩法重构框架（当前设计基线）](docs/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md)
- [2026-11-24 仓库审查与合并登记](docs/REBUILD_REVIEW_AND_MERGE_REGISTER_2026-11-24.md)
- [产品定位](docs/PRODUCT.md)
- [技术架构](docs/ARCHITECTURE.md)
- [V1.0 游戏设计总览](docs/GAME_DESIGN.md)
- [统一数据模型](docs/DATA_MODEL.md)
- [规则与暂定参数](docs/GAME_RULES.md)
- [六接口协议与同步流程](docs/API.md)
- [V1.0 差距审查与迁移计划](docs/V1_GAP_REVIEW.md)
- [本轮分工（V1.0 迁移）](docs/TEAM_PLAN.md)
- [制作事件模块设计（M2 提案）](docs/EVENT_MODULE_DESIGN.md)
- [事件内容填写指南](docs/EVENT_CONTENT_GUIDE.md)
- [当前进度与方向](docs/PROGRESS.md)

## 当前范围与未完项

- 六接口均实现；协议使用 snake_case、完整 GameState v2 往返，每次动作由 C++ 严格校验状态，错误包括 INVALID_PHASE，无前端规则兜底。
- 外包/加班只安排今天，推进前可撤销；截止日当天结算后仍未完成就强制交付/违约，不无限拖到做完。
- 当前运行切片的数值和公式以 `packages/game-core/src/game_core.cpp` 与 `packages/game-core/include/game_rules.hpp` 为准；V1.0 目标规则见 `docs/GAME_RULES.md`，尚未实现的规则不得当作当前功能。
- 开工资金加上拨款，草案利润 `profit = revenue - spent` 不含拨款，付费事件计入 spent；此经济口径待团队复核。
- 上述招聘成长、企划市场、委员会投资、商业渠道、十年履历与结局等属于 V1.0 目标范围，当前 v2 纵向切片尚未实现；v2 当前不包含这些玩法。存档仍为单槽手动保存，不支持旧版迁移或历史结算持久化。
- 本地真实 WASM 与浏览器完整循环已按上述记录验证；没有执行线上部署，托管后的 MIME、资源加载和访问策略仍需发布后单独验收。


## 经济模拟器（实验版）

已加入可复现的 520 周经济模拟器，用于比较承制/委员会现金流，并测试动态工作量、五阶段合格线、延期压力与违约处罚。V0.6 保留四种固定策略作为基准，新增保守、机会、激进三种动态经营策略及现金低点、合作模式分布等统计。它是独立的 Python 实验工具，不是游戏运行时；动态策略阈值仅是模拟假设，不属于游戏规则，经济参数保持不变。

- [模拟器说明与运行方式](scripts/README.md)
- [模拟器源码](scripts/economic_simulator.py)
- [参数示例](scripts/simulation_config.example.json)
- [敏感性实验脚本](scripts/run_sensitivity.py)
- [V0.3 随机工期基线报告](docs/ECONOMIC_SIMULATION_REPORT_V0.3.md)
- [V0.4 动态工作量首轮报告](docs/ECONOMIC_SIMULATION_REPORT_V0.4.md)
- [V0.5 工资、加班、外包与非 BD 收入报告](docs/ECONOMIC_SIMULATION_REPORT_V0.5.md)
- [V0.6 动态经营策略模拟报告](docs/ECONOMIC_SIMULATION_REPORT_V0.6.md)

在仓库根目录运行：

```bash
python scripts/economic_simulator.py
python scripts/run_sensitivity.py
python -m unittest discover -s scripts/tests -v
```

当前模型已按五阶段工作量和动态合格线推进，但周产能、打磨概率、低完成度交付线仍是实验占位参数；员工能力、疲劳、外包、加班和实际制作成本接入后，必须重新校准。
