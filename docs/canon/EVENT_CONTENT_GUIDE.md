---
title: 事件内容指南
kind: canon
status: reference
owner: content
updated: 2026-11-26
canonical_for: event-content-guide
supersedes: []
superseded_by: []
---

# 事件内容填写指南（给内容协作者）

- 系统实现与机制口径：@pyxz0，见 [事件模块设计](EVENT_MODULE_DESIGN.md)
- 内容与文案：@Muchbv，统一跟踪在 [#13](https://github.com/zhengmin486/anime-production-committee/issues/13)
- 目的：让内容可以先于核心实现落地，且不需要改 C++ 就能评审

## 你需要交什么

一个 JSON 文件（建议 `docs/event_catalog.json`），结构如下：

```jsonc
{
  "schema_version": 1,
  "events": [ /* 每条事件一个对象 */ ]
}
```

格式模板见 [`docs/event_catalog.example.json`](../event_catalog.example.json)，里面有 8 条完整示例（负面 5 / 正面 3 / 重大 2）。**照抄字段，不要发明字段。**

## 每条事件的字段

| 字段 | 必填 | 取值 | 说明 |
| --- | --- | --- | --- |
| `id` | 是 | 小写蛇形，3–40 位 | 稳定标识，进冷却键与履历，发布后不要改 |
| `name` | 是 | ≤ 24 字 | 事件标题 |
| `description` | 是 | ≤ 200 字 | 情境描述，不写数值结算 |
| `polarity` | 是 | `negative` / `positive` | 负面异常 / 正面机会 |
| `tier` | 是 | `normal` / `major` | 普通 / 重大 |
| `category` | 是 | `personnel` / `quality` / `budget` / `schedule` | 只用于界面标签与统计 |
| `stages` | 是 | 6 个阶段中的 1–6 个 | `content_design` `storyboard_key_animation` `animation` `art_visual` `photography_editing` `sound_delivery` |
| `tag` | 是 | 小写蛇形 | 冷却分组；同类事件共用一个 tag |
| `priority` | 是 | 1–100 | 越小越优先；只在同一项目的同周候选内选一条，不是全局队列 |
| `cooldown_weeks` | 是 | 0–52 | 普通事件的冷却；重大事件填 0 |
| `once_per_project` | 是 | 布尔 | 重大事件必须 `true` |
| `trigger` | 是 | `{metric, op, threshold}` | 见下表 |
| `random_weight` | 是 | 0–100 | 0 表示只靠表现触发；>0 才进随机池 |
| `expires_weeks` | 是 | 0–8 | 处理期限；正面机会必须 0 |
| `escalation` | 是 | `null` 或 `{description, effects}` | `expires_weeks>0` 时必填 |
| `options` | 是 | 1–4 项 | 负面必须有 `abandon`；正面必须有 `accept` 和 `decline` |

### 可用指标

| metric | 含义 | 常用阈值 |
| --- | --- | --- |
| `stage_quality` | 当前阶段质量 0–100 | 40–70 |
| `stage_progress_permille` | 当前阶段进度 0–1000 | 300–600 |
| `max_fatigue` | 员工最高疲劳 0–100 | 65–80 |
| `weeks_in_project` | 已开工周数 | 4–12 |
| `weeks_to_deadline` | 距截止周数 | 2–5 |
| `funds` | 当前现金（日元） | 500000–1500000 |
| `morale` | 最低士气 0–100 | 30–50 |

`op` 只能是 `<` `<=` `>` `>=`。一条事件只支持**一个**指标；需要组合条件就拆成两条事件，或用 `stages` 限定范围。

## v4 阶段与待处理事件

阶段顺序固定为 `content_design → storyboard_key_animation → animation → art_visual → photography_editing → sound_delivery`。旧目录按以下方式迁移，重复项合并：

| 旧阶段 | v4 阶段 |
| --- | --- |
| `script` | `content_design` |
| `storyboard`、`key_animation` | `storyboard_key_animation` |
| `animation_check` | `animation` |
| `postproduction` | `photography_editing`、`sound_delivery` |
| 无独立旧阶段 | `art_visual` |

`art_visual` 与内容设计相关的既有卡片只做适用阶段增补，不改稳定 `id`、标题、描述或选项文案。

- 事件归属具体项目；每个项目每周最多触发一个，不同项目可在同一周各触发一个。
- 运行态使用 `events.pending` 数组，不是全局单槽；多项目事件必须全部保留，不得覆盖、丢弃或自动合并。
- 玩家可按任意顺序解决待处理事件，不设全局 FIFO；`pending` 非空时 `advance_week` 返回 `INVALID_PHASE`，全部解决后才可推进。
- `resolve_event` 的 `event_id` 参数传待处理实例的 `instance_id`，解决只移除该实例；`once_per_project` 在触发时即写入 `major_seen`，未解决或读档不重复消耗。
- 夹具的 `expect.pending_events` 始终是数组：无事件写 `[]`。单项目可简写事件 id；多项目或校验周上限时写 `{ "id": "...", "work_id": "...", "triggered_week": 12 }`。不要使用全局 `pending_event` 字段。

## 选项与效果

```jsonc
{
  "id": "rework",
  "kind": "overtime",
  "label": "抽调人手返修",       // ≤ 24 字，写清代价方向
  "cost": 180000,                // 0–3,000,000
  "effects": [
    { "scope": "instant", "target": "fatigue", "value": 6 },
    { "scope": "stage", "target": "quality", "value": 4 }
  ]
}
```

- `kind`：负面用 `abandon` / `overtime` / `outsource` / `extension`；正面用 `accept` / `decline`。
- `scope`：`instant`（立即）/ `stage`（到该阶段结束）/ `project`（到本作交付）。
- `target`：`quality` / `work_done` / `fatigue` / `morale` / `funds`。
- `fatigue` / `morale` / `funds` **只能** `instant`；`work_done` **不能** `project`。
- `stage` 作用域不写 `stage` 时默认作用于触发时的当前阶段；要指定后续阶段就写 `"stage": "animation"`，且必须在 `stages` 里。

### 非零 funds 与 INV-17

- 内容 schema 暂时保留 `target: "funds"`，但正向与负向现金效果都没有获得统一财务授权。
- 当前运行时不得据此直接增加或扣减现金；含任何非零 `funds` 效果的选项必须返回 `NOT_IMPLEMENTED`，并保持状态与待处理事件不变。确定支出统一使用选项 `cost`。
- 当前受影响选项为 `budget_overrun/advance`、`station_visit/host`、`sponsor_boost/take`。不得把 `funds` 改名为其他收入类别，也不得把提案改记成已实现的收入。
- 选项 `cost` 仍表示支出，按 Finance 的 `events` 类别结算；不得用负向 `funds` 绕过该接口。

## 三条内容纪律

1. **不新增机制**：不写 `kind`、`target`、`scope`、`metric` 以外的枚举值；需要新效果类型先提需求，由系统负责人评估。
2. **确定代价必须写清**：`label` 和 `cost` 要让玩家一眼看出花多少钱、加多少疲劳。不要把确定损失藏在描述里。
3. **不碰合同与终局**：内容不能改合同预算、目标质量、截止周，也不能直接判定失败或倒闭。

## 提交前自检

```bash
npm run validate:events
# 或单独校验目录：
node scripts/validate-event-catalog.mjs docs/event_catalog.json
```

校验会检查 v4 六阶段、严格字段（未知/缺失均拒绝）、取值范围、效果边界、正负事件选项组合、重大事件一次性设置，以及夹具的 `pending_events` 数组、多项目保留、任意顺序解决、周推进阻塞和所有非零 funds 的 `NOT_IMPLEMENTED` 断言。`expires_weeks=0` 时 escalation 必须为 null；有期限时升级效果与选项效果使用相同作用域校验。错误会逐条打印并阻塞通过。

## 和实现的对齐节奏

- 目录与夹具只定义内容契约，不代表 v4 runtime 已实现或验收。
- 涉及尚未落地的跨系统能力时不得伪造效果，应按命令契约返回 `NOT_IMPLEMENTED`；所有非零 funds 的统一处理见上节。
- 新增稳定事件 id 前先检查冷却、重大一次性与夹具覆盖；已有 id 与卡片文案不要随阶段迁移改写。
