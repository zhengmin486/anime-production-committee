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

格式模板见 [`docs/event_catalog.example.json`](event_catalog.example.json)，里面有 8 条完整示例（负面 5 / 正面 3 / 重大 2）。**照抄字段，不要发明字段。**

## 每条事件的字段

| 字段 | 必填 | 取值 | 说明 |
| --- | --- | --- | --- |
| `id` | 是 | 小写蛇形，3–40 位 | 稳定标识，进冷却键与履历，发布后不要改 |
| `name` | 是 | ≤ 24 字 | 事件标题 |
| `description` | 是 | ≤ 200 字 | 情境描述，不写数值结算 |
| `polarity` | 是 | `negative` / `positive` | 负面异常 / 正面机会 |
| `tier` | 是 | `normal` / `major` | 普通 / 重大 |
| `category` | 是 | `personnel` / `quality` / `budget` / `schedule` | 只用于界面标签与统计 |
| `stages` | 是 | 5 个阶段中的 1–5 个 | `script` `storyboard` `key_animation` `animation_check` `postproduction` |
| `tag` | 是 | 小写蛇形 | 冷却分组；同类事件共用一个 tag |
| `priority` | 是 | 1–100 | 越小越优先，同周只出一条 |
| `cooldown_weeks` | 是 | 0–52 | 普通事件的冷却；重大事件填 0 |
| `once_per_project` | 是 | 布尔 | 重大事件必须 `true` |
| `trigger` | 是 | `{metric, op, threshold}` | 见下表 |
| `random_weight` | 是 | 0–100 | 0 表示只靠表现触发；>0 才进随机池 |
| `expires_weeks` | 是 | 0–8 | 处理期限；正面机会必须 0 |
| `escalation` | 否 | `null` 或 `{description, expires_weeks: 2, options[], timeout_option_id}` | 一次升级载荷；仅 `expires_weeks>0` 的 `major` 事件可配，详见 [限时升级语义](EVENT_ESCALATION.md) |
| `timeout_option_id` | 升级时必填 | 指向本卡 `options[]` 中 `kind=abandon/decline` 的一项 | 首次超时的轻罚分支 |
| `escalation_note` | 否 | `string \| null` | 超时后果的定性描述，不写数值 |
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
- `stage` 作用域不写 `stage` 时默认作用于触发时的当前阶段；要指定后续阶段就写 `"stage": "animation_check"`，且必须在 `stages` 里。

## 三条内容纪律

1. **不新增机制**：不写 `kind`、`target`、`scope`、`metric` 以外的枚举值；需要新效果类型先提需求，由系统负责人评估。
2. **确定代价必须写清**：`label` 和 `cost` 要让玩家一眼看出花多少钱、加多少疲劳。不要把确定损失藏在描述里。
3. **不碰合同与终局**：内容不能改合同预算、目标质量、截止周，也不能直接判定失败或倒闭。

## 提交前自检

```bash
node scripts/validate-event-catalog.mjs docs/event_catalog.json
```

校验会检查字段、取值范围、效果边界、正负事件选项组合、重大事件一次性设置。有错误会逐条打印；警告不阻塞但建议处理。

## 和实现的对齐节奏

- M2-a 先做：负面 + 正面 + 普通事件 + 放弃/加班 + 即时效果。
- 应急外包等 #7 的供应商池，委员会延期等 #6；这两类选项**先写好文案**，实现到位前界面会显示禁用原因，不会误导玩家。
- 重大事件先交 2–4 条，跑通一次性与履历，再扩量。
