# 事件内容流水线（#50 / DISC-41）

> 状态：M2 实现。内容卡从 `content/events/*.json` 进入构建，运行时解析、校验并使用；C++ 里没有卡片字面量。
> 契约依据：[M0_CONTRACT_FREEZE.md](M0_CONTRACT_FREEZE.md) §3/§14.1、[DECISION_LOG.md](DECISION_LOG.md) 事件决策、[DESIGN_BACKLOG_2026-11-25.md](DESIGN_BACKLOG_2026-11-25.md) STATUS-47/48/51/52。

## 1. 目录与文件

```text
content/events/
  animator_exhaustion.json
  director_illness.json
  key_cut_rework.json
  schedule_slip.json
  station_visit.json
  storyboard_spark.json
  supplier_dunning.json ...
```

- 一卡一文件，文件名必须等于卡片 `id`（`<id>.json`）。
- 新增内容只加文件；删除内容只删文件。不得在 C++ 里补默认卡片。
- 卡片 `id` 是稳定标识：写入冷却、`major_seen`、存档与 UI 引用。**发布后不得复用或改名**；确需替换时新增 id 并保留旧卡至少一个版本。

## 2. 卡片 schema（schema_version = 1）

```jsonc
{
  "schema_version": 1,
  "id": "key_cut_rework",            // [a-z0-9_]+，与文件名一致
  "name": "关键镜头返修",
  "category": "quality",             // personnel / quality / budget / schedule
  "polarity": "negative",            // negative / positive
  "tier": "normal",                  // normal / major
  "tag": "quality_rework",           // 内容分组，仅展示/统计
  "stages": ["storyboard_key_animation", "animation"],
  "priority": 20,                    // 同周多个候选取小；重大事件优先于普通事件
  "cooldown_weeks": 6,               // 0..52，按卡片 id 记在项目上
  "once_per_project": false,         // 重大事件必须 true
  "trigger": { "metric": "stage_quality", "op": "<", "threshold": 55 },
  "random_weight": 0,                // 0..1000‰；表现条件不成立时按此概率进随机池
  "expires_weeks": 0,                // 0=无期限；1..8=限时事件，触发当周计入有效期
  "timeout_option": "accept",        // 仅限时事件必填：到期执行的预设消极/保守分支
  "escalate_on_timeout": false,      // 仅 tier=major 可 true：允许一次超时升级
  "escalated_expires_weeks": 0,      // 升级后的后续响应期限，1..8；未升级时必须为 0
  "description": "…",
  "foreshadow": "…",                 // 可选：前兆文案
  "options": [
    {
      "id": "accept", "kind": "abandon", "label": "按现状推进",
      "cost": 0, "risk_hint": "质量缺口留到成片",
      "effects": [{ "scope": "instant", "target": "morale", "value": -3 }]
    }
  ]
}
```

### 2.1 触发指标

| metric | 含义 | 备注 |
| --- | --- | --- |
| `stage_quality` | 卡片 `stages` 内**已开工**工作项的质量均值 | 未开工项不计入，避免开局 0 分立刻触发 |
| `work_quality` | 整个项目已开工工作项的质量均值 | 旧卡兼容 |
| `weeks_to_deadline` | `deadline_week - week` | |
| `weeks_in_project` | `week - opened_week` | |
| `max_fatigue` | 全员最大疲劳 | |
| `min_morale` | 全员最低士气 | 无员工时不可用 |
| `funds` | 当前现金 | |

`op` 只允许 `<`、`<=`、`>`、`>=`。一个触发条件只能用一个指标；需要组合条件时拆成两张卡。

### 2.2 选项与效果

- `kind`：`accept` / `abandon` / `overtime` / `decline` 可用；`outsource`、`extension` 为预留类型，运行时返回 `MODE_NOT_ALLOWED`（等 #7/#6）。
- 负面事件必须至少一个 `abandon`；正面事件必须同时有 `accept` 与 `decline`。
- `scope`：`instant` / `stage` / `project`；`target`：`quality` / `work_done` / `fatigue` / `morale` / `funds`。
- `fatigue` / `morale` / `funds` 只能 `instant`。
- `funds` 只能为负：事件收入分类未定，正面前景用士气、进度或质量表达。
- `scope=stage` 可写 `stage`（必须是卡片 `stages` 内的阶段）；不写表示当前阶段。
- 效果值有范围校验（如单次扣款 ≤ 2,000,000）；未知 target/scope/kind 一律拒绝整张卡，不允许运行时静默忽略。

### 2.3 期限与超时（DEC-EVENT-002）

- `expires_weeks=0` 表示不设期限，此时不得出现 `timeout_option`/`escalate_on_timeout`；非 0 时必须给出 `timeout_option`。
- `timeout_option` 只能是本卡已有的 `abandon`/`decline` 选项：到期行为必须是消极/保守后果，不得预设尚未接入的 `outsource`/`extension`。
- `escalate_on_timeout=true` 只允许 `tier=major` 且已设期限的卡片，并必须给出 `escalated_expires_weeks`（1..8）。
- 到期与违约共用 `timeout_option` 这一条分支：未配置升级的事件用它作默认消极分支，配置升级的事件在第二次超时用它作违约惩罚。
- 校验器（`scripts/lib/event-schema.mjs` 与 C++ `event::parse_catalog`）执行同一套规则，两边都不通过即拒绝整张卡。
- 已发布的 7 张卡当前全部 `expires_weeks=0`：期限长度、违约力度按 DECISION_LOG「数值不提前冻结」交 #13 标定，标定后再改内容文件，不需要改 C++。

## 3. 加载链路

```text
content/events/*.json
  → npm run build:events（校验 + 打包）
  → packages/game-core/src/v4/event_catalog_generated.cpp（内嵌 JSON 字符串）
  → runtime event::parse_catalog()（再次校验）
  → event::catalog()（只读单例）
```

- WASM 没有文件系统，所以内容在**构建期**打包、**运行期**解析；事件机制代码不出现卡片字段。
- `initialize` 启动时检查 `catalog().ok()`；目录无效直接返回 `INVALID_STATE`，不会带着半套事件开局。
- 生成文件入库，便于 diff；内容改动后必须重跑 `npm run build:events`（`build:v4` / `test:v4` 已自动包含）。

## 4. 内容作者工作流

```bash
npm run validate:content     # 校验 content/events，错误定位到 文件 / 卡片 / 字段
npm run build:events         # 校验并重新生成内嵌目录
npm run test:v4              # 构建 WASM 并跑契约测试（需 emsdk）
```

错误示例：

```text
事件内容校验失败（1 项）：
  content/events/key_cut_rework.json: card key_cut_rework [options[1].effects[0].stage]: 效果阶段不在卡片适用阶段内
```

### 4.1 流水线门禁

`.github/workflows/v4-contract.yml` 在改动 `content/events/**`、`packages/game-core/**`、事件脚本或该工作流本身时运行两个 job：

- **事件内容校验**：`node scripts/validate-event-content.mjs`，随后重跑 `build-event-catalog.mjs` 并 `git diff --exit-code` 生成文件——只改内容不重跑打包即失败；
- **v4 契约测试（WASM）**：现场安装 Emscripten SDK 后执行 `npm run test:v4`，即 §7 的全部 40 条用例（含 pending 快照 JSON 往返、查看/到期与 INV-29）。

此前的 `economic-simulator.yml` 只覆盖 Python 经济仿真，不构建 WASM；v4 契约测试的 CI 缺口由本工作流补上。工作流失败时以流水线实际结果为准，本地通过不能替代绿灯。

## 5. 运行时仲裁（M0 §14.1 / §14.11 / §14.12）

- `events.pending` 是数组；每个 `producing` 项目每周最多触发一个事件，不同项目可以在同一周各自触发。
- 已有待处理事件的项目不会再次抽取；新事件不得覆盖、丢弃或合并旧事件。
- **查看与处理分离（DEC-EVENT-001）**：`view_event(work_id, event_id)` 只把命中条目标记为 `viewed=true`，不结算、不扣款、不移除事件；`advance_week()` 只在存在未查看事件时返回 `INVALID_PHASE`，全部查看后即使仍未处理也允许推进。
- `resolve_event(work_id, event_id, option_id)`：三个参数全部必填（M0 命令 19，PR #94 冻结）；只删除 `(work_id, event_id)` 命中的那一条，其他项目事件原样保留。
- 冷却（`cooldown_weeks`）与重大事件 `major_seen` 都按项目记录在 `events.per_work[work_id]`；玩家手动处理与超时自动处理共用同一套记账。
- **选项效果快照**：触发时把 `effects`（scope/target/stage/value）、`cost`、`cooldown_weeks`、`once_per_project`、期限字段（`expires_week`/`timeout_option`/`escalate_on_timeout`/`escalated_expires_weeks`）与事件名一起冻结进 `events.pending[]`；`view_event`/`resolve_event` 与到期处理只读快照，不回查内容目录。存档或卡片改版后，已触发事件仍执行触发时的效果。
- **到期处理（DEC-EVENT-002）**：只有"已查看且仍未处理"的限时事件参与倒计时；周结算在事件抽取之前处理到期，配置了一次升级且尚未升级的事件以同一 `event_id` 替换原条目并进入新期限，其余情况执行预设分支并移除该条。回执见 `report.timeouts[]`（`reason` 为 `timeout`/`breach`）。到期自动扣款以当前余额封顶，不得让现金转负。
- 无期限事件 `expires_week` 恒为 `null`，永不自动结算；限时事件必须带可执行的 `timeout_option`，否则 INV-29 直接拒绝该状态。

## 6. 旧样例迁移映射

| 旧 id（docs/event_catalog.example.json） | 新文件 | 变化 |
| --- | --- | --- |
| `key_cut_rework` | `content/events/key_cut_rework.json` | 阶段改为 v4 键；质量效果落到 `storyboard_key_animation` |
| `schedule_slip` | `content/events/schedule_slip.json` | 去掉未接入的 `extension` 选项；保留放弃/赶工 |
| `animator_exhaustion` | `content/events/animator_exhaustion.json` | `outsource` 选项改为 `overtime` 临时换人 |
| `budget_overrun` | `content/events/supplier_dunning.json` | 改为纯支出事件；删除“事件加钱”效果 |
| `storyboard_spark` | `content/events/storyboard_spark.json` | 保持一致 |
| `station_visit` | `content/events/station_visit.json` | 收入改为士气/质量；保留随机权重 |
| `director_illness` | `content/events/director_illness.json` | 去掉 `outsource`/`extension`；保留重大一次性 |
| `sponsor_boost` | 未迁移 | 纯加钱事件，等事件收入分类确定后再做 |

阶段映射：v3 的 `storyboard`/`key_animation` → v4 `storyboard_key_animation`；`animation_check` → `animation`；`postproduction` → `photography_editing` / `sound_delivery`。

## 7. 测试与证据

`scripts/v4.test.mjs` 共 40 条，其中事件相关 15 条：

1. 内嵌目录 7 张卡、无 issue、id 稳定；
2. 非法卡夹具：重复 id、未知 target、`funds` 为正、缺 label、schema_version 错误、空目录，错误定位到 card/field；
3. 期限字段校验：限时缺 `timeout_option`、到期分支不在选项内、分支类型越界（overtime/outsource）、无期限却配分支、期限超 8 周、普通卡配升级、升级后期限越界，以及合法限时/升级卡通过；
4. 双项目同周各自触发，互不覆盖；省略 `work_id` 被拒；处理一条后另一条保留；
5. 效果只作用于归属项目（A 质量 −3，B 不变）；
6. 重大事件同项目只触发一次，下一周让位给普通事件；
7. 同 seed 同操作，pending 与哈希一致；同项目多条 pending / 归属无效被 INV-23 拒绝；
8. 选项效果快照：篡改快照后再走 JSON 往返，结算仍按快照值执行，不回查目录；
9. `view_event` 只标记已查看：不移除 pending、不扣款、不记账、不改质量/冷却/周数，且只影响目标条目，`work_id` 缺失被拒、事件不存在返回 `NOT_FOUND`；
10. 全部查看后即可推进，未处理 pending 原样保留且当周不再重复抽取；
11. 未查看的限时事件不参与到期处理；
12. 到期自动执行预设分支（cost + funds 效果入账、回执 `reason=timeout`），其他项目 pending 逐字段不变；
13. 超时升级只发生一次（`reason=timeout` 阶段 0 次、条目替换为新期限），第二次超时按 `reason=breach` 结算并移除；
14. INV-29：缺可用到期分支、分支 id 不存在、有效期越界、无期限却标记升级/到期状态、升级期限越界的 pending 状态一律 `INVALID_STATE`；
15. `viewed` 与期限字段随 JSON 往返保留，旧存档缺字段按"未查看、无期限"处理；同一选项 `cost` 与 `funds` 效果同周产生的两条流水 id 不冲突（INV-02）。

本机 `.tools/emsdk` 可用，40 条已通过真实 WASM 构建复跑（`npm run test:v4`，40/40）；同一套用例另用 MSVC 19.51 原生 JSON 壳交叉验证过（40/40），原生壳只是临时工具、放在 `build/`（已 gitignore）不入库。

## 8. 边界与后续

- 不新增效果类型、概率或触发指标；需要新增时先走规则评审。
- 公司级事件（`work_id=null`）不在本期：M0 要求每条 pending 带项目 id。
- 期限行为按 DEC-EVENT-001/002 落地：未查看事件阻塞推进（不会在玩家未查看时超时），已查看未处理事件可随推进继续倒计时并在到期时自动结算；旧的"待处理事件硬暂停"表述以 M0 §14.1/§14.11/§14.12 为准（STATUS-51 已按此改写）。
- 事件收入、供应商外包、委员会延期分别等 #51 / #7 / #6。
- 内容卡文案与数值平衡由 #13 内容协作维护；本流水线只保证格式、加载与校验。
