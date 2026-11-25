---
title: 存档状态恢复交接
kind: plan
status: archived
owner: team
updated: 2026-11-26
canonical_for: team-save-state-restore
supersedes: []
superseded_by: []
---

# 存档与状态恢复交付说明

- 模块负责人：@zm
- 跟踪议题：[#1 里程碑总览](../../issues/1)；本文覆盖 #5 前端 v3 接入与主流程 中的存档与状态恢复部分，与「公司声望」「财务记录」两个核心任务并行。
- 依据：`docs/canon/API.md`、`docs/canon/DATA_MODEL.md`、`docs/plans/TEAM_PLAN.md`、`docs/status/PROGRESS.md`。
- 状态：存档链路检查完成；修复单槽静默覆盖一处实际缺陷，其余以补充测试为主。未改游戏规则、未改 C++ 核心状态结构、未新增存档版本。

## 现状版本结论（先检查后实施）

当前实际生效的是 v3，不是文档历史区块里的 v2：

| 项目 | 现行实现 |
| --- | --- |
| 业务状态 | `GameState.version === 3`（`apps/web/src/types/gameV3.ts`） |
| 存档信封 | `SaveRecord = { version: 3, savedAt: string, state: GameState }` |
| 存储 | IndexedDB `anime-production-committee` / DB schema 版本 1 / 仓库 `saves` / 键 `current`（单槽） |
| 写入口 | `saveGame(state, overwrite = false): Promise<'saved' \| 'occupied'>` |
| 读入口 | `loadGame(): Promise<GameState \| null>`、`decodeV3SaveRecord(record): GameState \| null` |
| 恢复语义 | store 整体替换 `game`，不 merge、不重算、不补齐字段 |

`src` 里已无 v2 读写入口（`grep version: 2` 只出现在测试夹具中，用于验证拒绝路径）。`docs/canon/API.md` 与 `docs/canon/DATA_MODEL.md` 的 v2 段落是迁移对照，本文不据其判断现行行为。

## 八项检查重点逐条结果

| # | 检查 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 正常存档能否完整恢复 | 能。整份 `state` 序列化写入，读取后与保存前深度相等 | `saveGame.test.ts`「六个阶段状态保存后均可完整恢复」「IndexedDB 事务保存完整 v3 状态与 savedAt」；`browser.test.mjs`「IndexedDB 保存、刷新恢复…」 |
| 2 | 是否包含 seed、恢复后确定性是否延续 | 包含（`state.seed`，无独立字段丢弃）。恢复后继续推进与不中断运行逐字段一致，seed 相等 | `browser.test.mjs`「读取检查点存档后继续推进，与不中断运行的完整状态逐字段一致」（真实 WASM + 真实 IndexedDB） |
| 3 | 保存时是否遗漏字段 | 无遗漏：不挑选字段，`report` / `result` / UI 草稿按契约不入库，其余全部随 `state` 保存 | `saveGame.test.ts`「读取完整恢复事件、作品与终局，DB schema 不变且没有写操作」 |
| 4 | 损坏、缺字段、错误版本是否被拒 | 拒绝。v1/v2 提示新开游戏；未知版本、信封与状态版本错配、缺字段、类型错误按损坏处理；保存侧 `isGameState` 拒绝非法状态且不写入 | `saveGame.test.ts`「读取拒绝旧 v1/v2 信封…」「拒绝信封/状态版本错配…」「保存验证深层数据，失败保留已有有效存档」；`browser.test.mjs`「…损坏/旧版存档拒绝」 |
| 5 | 读取失败是否污染当前状态 | 不污染。抛错路径不写 store，会话状态引用保持不变 | `App.test.tsx`「读取旧版存档显示拒绝提示，不替换当前工作台」；`saveGame.test.ts`「读取事务中断时报错，存档记录与会话数据均不改变」 |
| 6 | 保存异常是否破坏已有存档 | 不破坏。占用与异常都走事务 `abort`，原记录原样保留 | `saveGame.test.ts`「写入事务中断时保留已有存档与数据库记录」「单槽已有存档时默认拒绝覆盖…」 |
| 7 | 重复保存、读取是否漂移 | 不漂移。多次 round-trip 深度相等；核心侧写入才是状态来源 | `saveGame.test.ts`「重复保存与读取不产生状态漂移」；`gameStore.test.ts`「读取后立即保存写入的就是载入状态，不在前端重建任何字段」 |
| 8 | 终局、待处理事件、待结算能否正确恢复 | 状态本身可完整恢复并按其 phase 继续；能力限制见「发现但暂未修复」第 2、3 条 | `saveGame.test.ts` 六阶段夹具往返 + `gameV3.test.ts` 99 条契约校验 |

## 修复的实际缺陷：单槽静默覆盖

原行为：`saveGame(state)` 无条件 `put('current')`，第二次保存静默覆盖唯一存档槽，与 `DATA_MODEL` V3.5「旧槽被覆盖前须由玩家明确保存并确认」和议题 #2 的口径不符。玩家在工作台保存→继续推进→再保存，就会不留痕迹地丢掉前一份档，且没有任何提示。

修法（不改协议、不加槽位、不做自动存档）：

- `apps/web/src/services/saveGame.ts`：新增 `SaveOutcome = 'saved' | 'occupied'`；在同一个 `readwrite` 事务内先 `get('current')` 再决定是否 `put`，占用且未带 `overwrite = true` 时 `transaction.abort()` 并解析为 `occupied`。存在性检查与写入同事务，避免「先查后写」竞态，也不会产生部分写入。
- `apps/web/src/stores/gameStore.ts`：新增 `saveConflict` 状态、`save(overwrite?)` 与 `cancelOverwrite()`。`occupied` 只转成确认提示，不写档；`busy` 期间忽略取消；任何新动作、返回首页、继续经营、读取存档都会随 `notice` 一起让确认失效。
- `apps/web/src/pages/StudioPage.tsx`：冲突时出现「确认覆盖本地存档」/「取消覆盖」，确认后 store 以 `overwrite = true` 重试；说明文案写明单槽、仅本机、覆盖需确认。
- 兼容性附带结论：v1/v2 记录虽然内容不可读，仍然**占用**单槽，未经确认不会被新游戏覆盖（`saveGame.test.ts`「旧 v%s 记录同样占用单槽，未确认不覆盖」）。

## 存档兼容性检查结果

| 记录类型 | 读取 | 是否占用单槽 |
| --- | --- | --- |
| v3 六阶段状态（idle / producing / event_pending / project_ready / project_settled / company_ended） | 完整恢复 | 是 |
| v3 缺省 M2 可选字段（`scout_pity`、`custom_offer`、`pending_proposal` 等） | 完整恢复，前端不补写默认值 | 是 |
| v3 携带 TS 契约尚未收录的核心新增字段（如并行任务的 `company.cash_log`） | 原样透传：不丢弃、不伪造、不校验 | 是 |
| v1 / v2 信封 | 拒绝并提示新开游戏，原存档与会话不变 | 是 |
| 未知版本号、损坏结构、信封与状态版本错配、缺必填字段 | 按损坏拒绝，报错信息明确「当前数据未改变」 | 是 |
| 无存档 | `loadGame()` 返回 null，界面提示「此浏览器还没有存档。」 | — |

## 实际执行的命令与结果

2026-11-23 本机（win32 / Node v24.22.1）真实运行输出，日志保留在 `build/save-final-*.log` 与 `build/save-*-after.log`：

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 前端单元 | `npm run test:unit` | 239/239 通过（7 个文件；`CORE_VALIDATOR.md` 记录的改动前基线为 221，本次净增 18 条）。相关三档：`saveGame.test.ts` 23、`gameStore.test.ts` 52、`App.test.tsx` 16 |
| 类型 | `npm run typecheck` | 无错误 |
| 浏览器真实链路 | `node --test scripts/browser.test.mjs` | 10 用例：9 通过 / 1 失败；用例数由 8 增至 10，失败项与改动前基线（7 通过 / 1 失败）完全同一测试、同一断言 |
| 核心 WASM 用例 | `node --test packages/game-core/tests/wasm.test.mjs` | 18 用例：16 通过 / 2 失败（均为核心侧手改 `funds` 的既有用例，非本次改动引入，见下） |
| 原生核心 | `npm run test:native` | 未重跑。本次未修改任何 `packages/game-core/**`；该文件组当前带着并行「财务记录」任务的未提交改动，跑了只能反映他人 WIP。`CORE_VALIDATOR.md` 记录的 73/73 是提交 38ad2e7 的基线证据 |

浏览器套件由本地 HTTP 服务提供 `apps/web/dist/wasm/game-core.{mjs,wasm}`（构建产物，不入库），因此确定性、恢复等价性和覆盖确认都走真实 WASM + 真实 IndexedDB，不用 fake 核心或夹具冒充核心规则。

## 发现但暂未修复的问题

1. **`cash_log` 契约漂移导致的三处既有用例失效（阻塞本任务全绿的唯一原因）**。并行「财务记录」任务的未提交核心改动新增 `check_cash_log`，末条断言 `previous_after == funds`；凡外部（测试夹具、存档）手写 `company.funds` 而不附台账的状态，核心一律判 `INVALID_INPUT`，而 TS `isGameState` 忽略未知字段会放行——前端显示正常、核心拒绝动作。表现：`browser.test.mjs`「周支出预检破产零变化…」等待破产提示 30s 超时；`wasm.test.mjs`「嵌套数值与安全整数边界」「动态报价快照决定工期和工作量…」两条失败。按负责人决定**只报告**：不改契约、不改核心、不放宽前端校验，需由「财务记录」任务把夹具改为经真实核心资金变化，或给出 `cash_log` 的可选/重建口径。
2. **`event_pending` 存档可恢复，但工作台没有事件解决入口**。store/UI 尚未接 `resolve_event`，且核心在事件选项效果目录接入前对 `resolve_event` 显式拒绝（`CORE_VALIDATOR.md` 未完成项第 7 条，归 #11）。恢复事件存档后当前只能结束经营——属已知阻塞，不是存档缺陷。
3. **结算与经营总结面板是会话反馈**。恢复 `project_ready` 可继续结算，但恢复 `project_settled` / `company_ended` 存档后不重建上一部作品的结果展示（`report`/`result` 按契约不入库）。履历数据本身在 `state.history` 中完整恢复。若 #8「长期履历与结局闭环」要求结果可回放，需要单独决定是否持久化 `result`，不在本次范围内擅自动作。
4. **存档不具备防篡改能力**（契约既有口径）：手写 `funds` 一类记录由核心在带状态调用时拒绝，前端识别不了。本文档只保证「拒绝时状态、资金、种子与原存档都不被改动」。
5. `docs/canon/API.md` 的底层调试示例仍是 v2 接口写法（`advance_day`、`project_id`），位于「V2 历史接口」区块内，留待 #5 收尾统一清理，本次未动。

## 验收标准

- [x] 正常存档完整恢复游戏状态，含 seed；恢复后继续运行的结果与不中断运行逐字段一致（真实核心 + 真实 IndexedDB 证据）。
- [x] 保存不遗漏业务字段，也不在前端补齐或计算核心状态来掩盖缺失。
- [x] 损坏、缺字段、错误版本存档被拒绝；v1/v2 无迁移、无静默转换；读取失败不污染当前状态。
- [x] 写入异常与占用冲突都不破坏已有存档；单槽覆盖需玩家明确确认，取消不写入。
- [x] 重复保存与读取不产生状态漂移；六阶段（含终局与待结算）均可往返。
- [x] 未改游戏规则、未改核心状态结构、未擅自新增存档版本，未引入自动存档/多槽/云存档。
- [ ] 第 1 条 cash_log 失效项需「财务记录」任务收口后本任务才可能全绿。

## 修改文件清单与协作边界

| 文件 | 变更 |
| --- | --- |
| `apps/web/src/services/saveGame.ts` | `SaveOutcome` 与 `overwrite` 参数；占用检查与写入同事务；未改版本策略、错误文案与读路径语义 |
| `apps/web/src/stores/gameStore.ts` | `saveConflict`、`save(overwrite?)`、`cancelOverwrite()`；确认提示随 `busy`/其他动作/返回首页失效 |
| `apps/web/src/pages/StudioPage.tsx` | 覆盖确认与取消入口、单槽说明文案 |
| `apps/web/src/services/saveGame.test.ts` | 新增覆盖：旧版本同样占用单槽、占用未确认不覆盖、六阶段完整往返、重复保存读取无漂移、M2 可选字段与核心未知字段原样往返、读/写事务中断不损坏存档（该档现 23 条） |
| `apps/web/src/stores/gameStore.test.ts` | 新增覆盖：载入状态即所存状态、占用不写入、取消覆盖不动游戏状态、确认提示在 busy/其他动作/返回首页时失效（该档现 52 条） |
| `apps/web/src/App.test.tsx` | 新增覆盖：界面确认覆盖链路、取消覆盖不写入且不改动工作台（该档现 16 条） |
| `scripts/browser.test.mjs` | `readSave`/`clickSave`/`advanceWeeks` 拆分；新增「读取检查点存档后继续推进，与不中断运行的完整状态逐字段一致」「单槽覆盖需明确确认，未确认时旧存档原样保留」（8 → 10 用例） |
| `docs/canon/API.md` | 新增「V3.5 存档入口与状态恢复」；v2 存档小节标注为历史 |
| `docs/canon/DATA_MODEL.md` | V3.5 由 M0 目标表述改为现行实现，写明覆盖确认与恢复后确定性口径 |
| `docs/plans/team/SAVE_STATE_RESTORE.md` | 本文档 |

未触碰：`packages/game-core/**`、`apps/web/src/types/gameV3.ts`、`apps/web/src/test/fixtures.ts`、存档版本号与数据库 schema。存档格式与校验属 @zm 单点合入（`TEAM_PLAN.md:40`）；其他模块若需要新字段入库，须随核心契约同一提交把字段、守卫与用例补齐，不靠前端透传当作已支持。
