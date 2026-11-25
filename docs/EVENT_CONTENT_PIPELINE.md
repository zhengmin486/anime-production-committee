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
  "expires_weeks": 0,                // 0 = 无期限；>0 时记录绝对截止周
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

## 5. 运行时仲裁（M0 §14.1）

- `events.pending` 是数组；每个 `producing` 项目每周最多触发一个事件，不同项目可以在同一周各自触发。
- 已有待处理事件的项目不会再次抽取；新事件不得覆盖、丢弃或合并旧事件。
- 数组非空时 `advance_week()` 返回 `INVALID_PHASE`；全部处理完才允许推进。
- `resolve_event(event_id, option_id)` 增加可选 `work_id`：同名事件跨项目时必须指定，否则返回 `INVALID_INPUT`；只删除命中的那一条。
- 冷却（`cooldown_weeks`）与重大事件 `major_seen` 都按项目记录在 `events.per_work[work_id]`。

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

`scripts/v4.test.mjs` 新增 6 条（总 31 条）：

1. 内嵌目录 7 张卡、无 issue、id 稳定；
2. 非法卡夹具：重复 id、未知 target、`funds` 为正、缺 label、schema_version 错误、空目录，错误定位到 card/field；
3. 双项目同周各自触发，互不覆盖；同名事件不带 `work_id` 被拒；处理一条后另一条保留；
4. 效果只作用于归属项目（A 质量 −3，B 不变）；
5. 重大事件同项目只触发一次，下一周让位给普通事件；
6. 同 seed 同操作，pending 与哈希一致；同项目多条 pending / 归属无效被 INV-23 拒绝。

本机无 Emscripten，31 条用 MSVC 19.51 原生 JSON CLI 跑通（31/31）；`npm run test:v4` 仍需在有 emsdk 的环境复跑。

## 8. 边界与后续

- 不新增效果类型、概率或触发指标；需要新增时先走规则评审。
- 公司级事件（`work_id=null`）不在本期：M0 要求每条 pending 带项目 id。
- 事件处理期限/超时升级仍按 STATUS-51：待处理事件硬暂停，不引入“暂缓后继续推进”。
- 事件收入、供应商外包、委员会延期分别等 #51 / #7 / #6。
- 内容卡文案与数值平衡由 #13 内容协作维护；本流水线只保证格式、加载与校验。
