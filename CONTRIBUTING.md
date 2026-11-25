# 贡献指南

> 当前产品决策见 [docs/DECISION_LOG.md](docs/DECISION_LOG.md)，目标领域架构见 [docs/DOMAIN_ARCHITECTURE.md](docs/DOMAIN_ARCHITECTURE.md)。仓库中 V2/V3 与 M0/M1/M2 的旧任务说明属于历史实现记录；当前先完成整体架构设计，再按稳定边界拆分实现，不得按旧五阶段/单项目规则直接开发。

本项目采用异步协作：先明确产品方向和架构边界，再由模块负责人自主完成专业设计与实现，通过 Pull Request 集成。以下协作约定不代表已经配置 GitHub 分支保护、自动评审或 CI。

## 开始之前

先阅读四份基础文档；环境安装和完整命令见 [README](README.md)。

| 文档 | 负责回答 |
| --- | --- |
| [PRODUCT.md](docs/PRODUCT.md) | 产品定位、目标玩法、当前与延期范围 |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 工程分层、数据流与模块边界 |
| [API.md](docs/API.md) | 当前前端与 C++ 的输入、输出和错误契约 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 分支、提交、PR、评审与协作流程 |

玩法细节见 [GAME_DESIGN.md](docs/GAME_DESIGN.md)，现行决策见 [DECISION_LOG.md](docs/DECISION_LOG.md)，目标架构见 [DOMAIN_ARCHITECTURE.md](docs/DOMAIN_ARCHITECTURE.md)。[DATA_MODEL.md](docs/DATA_MODEL.md) 与 [API.md](docs/API.md) 仍描述旧 V3 契约，不能当成新架构的最终接口。模型、API、实现与测试应同步更新，不各自维护不同含义的同名字段。

旧最小纵向切片曾实现六个 C++ 接口，React 通过真实 WASM 完成初始化、接取企划、决策、日结、事件与结算；本地验收记录见 README。该运行时采用单项目/五阶段模型，属于迁移前历史实现。当前先完成新架构设计；新增玩法前应核对 DECISION_LOG 与 DOMAIN_ARCHITECTURE，不得把旧接口或旧阶段模型当作目标契约。

规则数值变化写进 [DECISION_LOG.md](docs/DECISION_LOG.md) 的 `DEC-*` 条目；流程、治理与契约级变化写进 [docs/decisions/](docs/decisions/INDEX.md) 的 `ADR-*` 文件，接受后不再就地改写。研究文件与审查文件只写证据和建议；文档改动提交前运行 `npm run check:docs`。

## Issue 与分工

1. 先搜索已有 Issue，避免重复工作。选择“开发任务”“缺陷报告”或“功能提案”模板。
2. 每个开发任务指定一名主要负责人，写清目标、包含与排除范围、文件边界、依赖和可验证的验收标准。
3. 先完成工程验收与接口确认，再并行推进依赖这些接口的任务。依赖未就绪时，可用 Draft PR 提前评审代码，但不能以模拟接口代替集成验收。
4. 负责人协调范围和集成，两位队友可分别负责 C++ 规则与前端流程；实际 GitHub Assignees 和 Reviewer 在任务中指定，不以本文代替正式认领。
5. 预计超过一个小型 PR 的任务先拆成可独立验收的切片，不提前扩展外围系统。

建议的文件边界：

| 工作方向 | 主要目录 | 修改前需协调的共享内容 |
| --- | --- | --- |
| 前端 | `apps/web/src/components/`、`pages/`、`stores/`、`services/`、`hooks/`、`styles/` | 协议类型、存档结构、WASM 加载方式 |
| 核心 | `packages/game-core/src/`、`include/`、`tests/` | Embind 导出、JSON 协议、规则数值 |
| 集成与规范 | `scripts/`、`docs/`、根配置 | workspace 配置、锁文件、CMake、部署配置 |

共享文件包括 `apps/web/src/types/game.ts`、`packages/game-core/bindings/embind.cpp`、`docs/API.md`、各 `package.json`、`package-lock.json` 和 `CMakeLists.txt`。需要跨边界修改时，先在 Issue 说明并协调，避免两人同时重写同一份协议或锁文件。

## 开放式增量开发

首版范围代表最低交付目标和当前优先级，不是对未来功能的禁止。成员可以在不违反已确认决策、不破坏主框架与跨模块契约、风险可控的前提下，自主扩展或提前实现未来候选功能；符合条件的成果默认接纳，不需要额外提交负责人决定是否采用。默认接纳不免除正常 PR、测试、文档同步和集成验收。

只有涉及既定决策变更、核心玩法/主框架调整、跨模块契约或状态所有权变更、已确认数值基准变更及重大风险时，才提交负责人裁决。详见[开放式增量开发与提前实现原则](docs/OPEN_INCREMENTAL_DEVELOPMENT_POLICY.md)。

## 开发环境

需要 Node >=22.12、npm >=10；核心开发还需要 Python 3、CMake、Ninja、C++17 编译器和固定版本 Emscripten。按 README 准备工具链后，在仓库根目录执行：

```bash
npm ci
npm run build:wasm
npm run dev
```

使用 npm workspaces，不引入其他包管理器的锁文件。只有确需变更依赖时才使用 `npm install`，在 PR 中解释用途并一起提交 `package.json` 与 `package-lock.json`。

每名成员使用独立本地克隆，不共享正在构建的工作目录。修改 C++ 后重新构建 WASM 并刷新浏览器，避免加载旧模块。不要并发执行多个会写入同一 `build/wasm` 或 `apps/web/dist` 的构建命令。

## 分支与提交

使用 `main` + 短期任务分支，不额外建立长期 `develop` 分支。一个分支对应一个可验收任务，合并目标默认是 `main`。

从最新 `main` 创建短期分支，命名为 `<类型>/<Issue编号>-<简短描述>`，例如 `feat/12-project-flow`、`fix/18-wasm-retry`、`docs/21-api-contract`；数字仅表示关联 Issue 编号的写法，无 Issue 时省略编号并在 PR 说明。

切换分支前先检查工作区；有未完成改动时先妥善保留，不使用强制切换、重置或清理命令丢弃它们。工作区干净后执行：

```bash
git status
git switch main
git pull --ff-only
git switch -c feat/12-project-flow
```

通过 PR 合入 `main`，不直接推送团队功能到 `main`，不强制覆盖他人的提交。提交前检查 `git status` 与 `git diff`，只暂存本次任务的文件，不夹带其他成员或其他任务的改动。

提交信息采用 `<type>(<scope>): <说明>`，`scope` 可省略；中文或英文均可，说明变更目的而不是只列文件名，例如 `feat(core): add confirmed project startup rules` 或 `docs(api): 明确当前接口与草案边界`。

| type | 用途 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 文档 |
| `test` | 测试 |
| `refactor` | 不改变对外行为的重构 |
| `chore` | 工具、依赖或构建维护 |

一次提交尽量只承担一个清晰目的。功能开发中不夹带无关重构；依赖任务尚未合并时在 Issue / Draft PR 标注，不复制另一分支的整套实现。需要同步主分支时先获取最新改动，通过正常合并解决冲突，不重写共享分支历史。

发生冲突时保留双方有效改动；无法判断时联系文件负责人，不用整文件覆盖来消除冲突。

## 架构约束

持续修补与重构边界遵循[工程变更治理](docs/ENGINEERING_CHANGE_GOVERNANCE.md)：优先最小增量修复，先复用已有模块；改变共享契约或已确认玩法必须说明影响并取得相应批准。不得以进入新里程碑或代码风格偏好为由重写无关模块。

- React 组件通过 Zustand 状态操作和服务接口交互，不自行实现预算、进度或评价规则。
- C++ 保持明确输入输出，不负责 UI、存档、网络、浏览器或随机种子生命周期。
- TypeScript 管理种子并传入 C++；相同状态、决策序列和种子必须可以复现结果。
- JSON 字段、错误码或接口行为改变时，先确认数据模型草案中的命名、单位、状态变化与数值范围，再同步更新 TypeScript 类型、C++、测试和 `docs/API.md`；新增正式数值前更新 `docs/GAME_RULES.md` 并取得范围确认。
- 改变存档结构时说明版本与迁移或失效策略，不静默按新结构解释旧数据。
- 不用 JavaScript 假结果冒充 WASM。单元测试可以隔离服务，但必须明确与真实集成测试的区别。
- 不擅自引入独立后端、远程数据库、Electron、Phaser、多人系统或与当前任务无关的依赖。

## 验证要求

按改动选择检查；未运行和不适用必须说明原因，不得勾选为通过。

| 改动范围 | 至少执行 |
| --- | --- |
| 前端逻辑、状态或存档 | `npm run typecheck`、`npm run test:unit`、`npm run build:web` |
| C++ 规则、Embind 或 JSON 协议 | `npm run test:native`、`npm run test:wasm`；涉及前端协议时同时执行前端检查 |
| 用户交互、WASM 加载、存档流程或跨语言集成 | `npm run test:browser`，并操作受影响的页面与异常路径 |
| 构建或部署产物 | `npm run build`、`npm run verify:dist`；涉及运行行为时补充浏览器检查 |
| 纯文档或模板 | `npm run check:docs`，并检查命令、格式与实际实现是否一致 |

`npm test` 运行前端单元、真实 WASM 和原生测试；`npm run test:browser` 另行执行，自动完整构建并驱动已安装的 Edge。其他兼容浏览器可通过 `BROWSER_CHANNEL` 或 `BROWSER_EXECUTABLE` 指定。截图输出到 `build/browser-tests/`，供 PR 展示，不提交整个生成目录。

规则变更增加固定种子、边界值与错误输入用例。UI 变更提供实际操作结果，覆盖加载、失败或空态中的相关情况。开发工具不可用时记录具体阻碍，不能把 TypeScript 模拟测试算作真实 WASM 验证，也不能把本地构建算作线上发布成功。

## Pull Request 与合并

使用 [PR 模板](.github/pull_request_template.md)，关联 Issue，说明变更目的、范围、接口或存档影响、测试结果和遗留问题。开发任务可从 [任务模板](.github/ISSUE_TEMPLATE/task.yml) 创建；缺陷和功能提案分别使用 [缺陷模板](.github/ISSUE_TEMPLATE/bug_report.yml) 与 [功能模板](.github/ISSUE_TEMPLATE/feature_request.yml)。模板位于本地仓库，不表示已创建远程 Issue 或配置自动执行。

只有本 PR 完整满足 Issue 验收时才使用 `Closes #编号`；部分交付使用 `Refs #编号`，不要提前关闭父任务。

- 未完成或存在阻断问题时保持 Draft，测试和文档必须反映真实状态。
- 请求至少一位其他成员评审，不自行批准自己的 PR。共享接口、规则数值、构建或部署变更还需项目负责人确认。
- 评审检查范围是否收敛、边界是否清晰、确定性与错误处理是否保持、真实验证是否足够。
- 满足适用验收且评审完成后由负责人或约定的集成人合并。保留提交历史，不为通过检查而跳过 hooks、删除失败测试或降低预期。

## 当前任务认领池

更新日期：2026-11-21。基线 `main@94be77a`；[里程碑总览 #1](https://github.com/zhengmin486/anime-production-committee/issues/1) 与八个子任务（#2–#9）已按《游戏设计总案 V1.0》重写。**议题正文是任务的唯一详细来源**，本文只保留分工原则、归属边界和认领流程，避免两处描述不一致。

### 现状与分工原则

- 现有 `main` 是最小纵向切片（v2）：日推进、三工序、固定 4 人、3 报价、3 事件。技术链路（C++→WASM→React、确定性种子、Zustand 锁、IndexedDB、三层测试）保留，规则与数据模型按 V1.0 重做。
- 差距与里程碑见 [docs/V1_GAP_REVIEW.md](docs/V1_GAP_REVIEW.md)；本轮分工与顺序见 [docs/TEAM_PLAN.md](docs/TEAM_PLAN.md)。
- **M0 契约冻结（#2）评审合入前，不允许后续任务改契约字段、C++ 状态结构或存档版本**，只允许读现状、写结构草案、补对照样例。M0 本地目标模块为 `types/gameV3.ts`，交付与集成切换说明见 TEAM_PLAN；当前 v2 运行时仍保留，不能将文档目标当作已实现。
- 规则只在 C++；单元测试里的模拟服务不能代替真实 WASM 验收。
- 所有任务初始待认领，未指定真实 Assignee 或 Reviewer。每项最多一名主负责人、至少一名其他成员评审。
- `game_rules.hpp`、`game_core.cpp`、核心测试由核心负责人独占；`scripts/browser.test.mjs` 由契约负责人独占；共享类型由契约负责人统一合入。

| 里程碑 | 议题 | 归属 | 主要交付 |
| --- | --- | --- | --- |
| M0 | [#2 冻结 v3 契约](https://github.com/zhengmin486/anime-production-committee/issues/2) | 契约与集成 | 状态/动作/账目/周结算顺序/旧档拒绝策略 |
| M1 | [#3 核心：周制与公司终局](https://github.com/zhengmin486/anime-production-committee/issues/3) | 核心 | `advance_week`、idle 周成本、三种终局 |
| M1 | [#4 核心：五阶段与阶段首配置](https://github.com/zhengmin486/anime-production-committee/issues/4) | 核心 | 五阶段推进、方针、有限质量传递 |
| M1 | [#5 前端：周制与五阶段界面](https://github.com/zhengmin486/anime-production-committee/issues/5) | 前端 | 主线流程重做、存档升 v3 |
| M2 | [#6 企划市场与委员会分账](https://github.com/zhengmin486/anime-production-committee/issues/6) | 核心 | 4 企划、来源×规模、投资与商业分成 |
| M2 | [#7 用工与外包](https://github.com/zhengmin486/anime-production-committee/issues/7) | 核心 | 六能力、临时人员、供应商池 |
| M3 | [#8 成长、履历与结局](https://github.com/zhengmin486/anime-production-committee/issues/8) | 核心 + 前端 | 潜力揭示、疲劳预警、续作、结局 |
| 并行 | [#9 三图授权与接入](https://github.com/zhengmin486/anime-production-committee/issues/9) | 任意 | 授权结论与获准三图，不挡主线 |

旧认领池 T01–T06（结算口径评审、排班验证、流水线验证、六选项覆盖、制作台微调）已作废：它们的验证对象是旧规则，在 V1.0 下不再存在。历史内容见议题编辑记录。

### 认领、拆分与完成标准

1. 在对应 GitHub 子议题评论认领并填写以下信息，由负责人确认文件边界后设置实际 Assignee 和 Reviewer；未获确认前不占用共享文件。需要调整任务范围时先在议题协商，并通过 PR 同步相关文档。
2. 一个任务过大时先拆成“现状验证/评审”和“获批修改”，分别验收；依赖未解决时标注阻塞，不能把候选方案当成已确认规则。
3. 从最新 `main` 建立短期分支，在 PR 关联议题，贴实际命令与结果；测试记录注明基线提交，未执行的验证如实标明。
4. 评审通过并合入 `main` 后才关闭对应任务；素材授权未确认、核心规则未真实运行或浏览器未操作过，都不能以文档齐全代替验收。

```text
认领编号 / GitHub Issue：
负责人 / 评审人：
修改目录与共享文件协调结果：
依赖接口、前置任务及确认状态：
最终交付物与明确不做的内容：
验收步骤、命令及预期结果：
预计时间 / 已知阻碍：
```

## 安全与生成文件

不提交令牌、密码、`.env*`、真实用户存档、`.tools/`、`node_modules/`、`build/` 或 `dist/`。WASM 与生成的加载器由构建产生，保留 `apps/web/public/wasm/.gitkeep`，不手改二进制。

日志和截图先脱敏。`.qoder.site` 由 Sites 工具维护，不手改其中的发布身份；发布与访问范围变更由负责人单独确认。发现凭据泄漏或可利用的安全问题时，先通过团队已有私下渠道联系负责人，不在公开 Issue 中粘贴凭据或真实用户数据。
