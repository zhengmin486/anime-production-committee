# Event M2 最小闭环：实现说明

- 分支：`feat/11-event-m2`（stacked，base = `feat/v4-m1-runtime`）
- 设计：`docs/EVENT_DOMAIN_DESIGN_V4.md`
- 范围：触发 → 待处理 → 玩家选择 → 效果分派 → 恢复周结算。**不含**公司级事件、放弃/暂存、超时升级、事件收入。

## 1. 状态

沿用 M0 冻结的 `GameState.events`（M1 阶段仍是 `Json` 占位，本 PR 不改 `model.hpp`）：

```jsonc
"events": {
  "pending": null | {
    "event_id": "key_cut_rework",
    "work_id": "work_01",
    "episode_id": null,
    "stage": null,
    "triggered_week": 3,
    "options": [{ "id": "accept", "label": "按现状推进", "cost": 0, "risk_hint": "质量缺口留到成片" }],
    "expires_week": null,
    "escalation": null
  },
  "last_event_week": 3,
  "per_work": { "work_01": { "cooldowns": { "key_cut_rework": 9 }, "major_seen": [] } }
}
```

- `pending` 全局唯一；`advance_week` 已有守卫会拒绝。
- 选项快照只含玩家可见字段；效果表留在内核目录。
- `per_work` 的键由 work id 决定，哈希前由 nlohmann 按键排序，与写入顺序无关。

## 2. 命令

新增 `resolve_event`（M0 命令 19）：

```text
输入：{ state, event_id, option_id }
成功：{ state, message }
失败：{ error: { code, message } }
```

| 错误码 | 触发条件 |
| --- | --- |
| `INVALID_INPUT` | 缺字段 / JSON 类型错误 |
| `INVALID_STATE` | 前置状态非法 |
| `COMPANY_ENDED` | 公司非 running |
| `NOT_FOUND` | 无 pending、event_id 不匹配、选项不存在、归属项目不存在 |
| `MODE_NOT_ALLOWED` | `outsource` / `extension` 选项（M2 未接入） |
| `INSUFFICIENT_FUNDS` | 选项费用 > 现金 |

## 3. 周结算接入

`advance_week` 在人员结算之后、`company.week + 1` 之前调用 `event::draw`：

- 本周工资、运营、制作已在第 5–6 阶段提交，事件不参与本周账；
- 回执新增 `report.events = { drawn, event_id?, work_id?, candidates? }`；
- 抽中后本次 `advance_week` 仍然成功（周数已 +1），下一次推进被 `pending` 守卫拒绝。

## 4. 触发

- 每项目独立评估，项目按 id 排序；随机用 `kernel::draw_below(seed, week, Stream::event, fnv1a(work_id), 0, 1000)`，与遍历顺序无关。
- 表现条件成立即入候选（不被概率拦住）；否则 `random_weight > 0` 且 roll < 60‰ 才入随机池。
- 全局只取一条：先按 `major` 优先，再 `priority` 升序，再 `work_id`、`event_id`。其余丢弃，不排队。

M2 目录 3 条（与 `docs/EVENT_CARDS_WP7.md` 的 C-01/C-02/C-05 对应）：

| id | 触发 | 选项 |
| --- | --- | --- |
| `key_cut_rework` | 项目平均质量 < 45 | 按现状推进（士气 −3）/ 抽调人手返修（18 万，疲劳 +6，动画阶段质量 +4） |
| `schedule_slip` | 距截止 ≤ 3 周 | 维持原计划（质量 −3）/ 全员赶工（12 万，疲劳 +8，动画阶段进度 +120） |
| `storyboard_spark` | 分镜阶段平均质量 ≥ 65（随机权重 15） | 采纳方案（10 万，疲劳 +4，分镜阶段质量 +3）/ 按原方案走 |

## 5. 效果边界

- 资金：只走 `events` 流水，一次记账；不新增收入科目。
- 质量：写入目标阶段工作项的六维，钳制 0–100；空阶段表示全部阶段。
- 进度：按 id 顺序灌入未完成、非门槛工作项，不跨阶段。
- 疲劳/士气：只作用于已分配到该项目的员工；无人分配时退回全体核心。
- Event 模块本身只写 `state.events`；效果由 `runtime.cpp`（应用层）执行，符合 §5.8 边界。

## 6. 测试

`scripts/v4.test.mjs` 新增 4 条：

1. 表现触发在结算后抽取、pending 阻塞下一次推进、处理后恢复；
2. 付费选项只扣一次、记 `events` 流水、写冷却；
3. 非法选项 / 无待处理事件返回 `NOT_FOUND` 且状态不变；
4. 同 seed 同状态抽取结果与哈希一致。

**执行结果（2026-11-25）**：本机没有 Emscripten，`npm run test:v4` 仍不能直接跑。用 MSVC 19.51 把 `model/kernel/runtime/event` 编成本地 JSON CLI，以同一份测试正文执行，**29/29 通过**（25 条 M1 + 4 条事件）。这次编译同时暴露了一个此前从未编译过的问题：`error_body(resolution.code, ...)` 把 `std::string` 传给 `const char*`，已在变基时改为 `resolution.code.c_str()`；`resolve_event` 也改用 `decode_state`，与其它命令共享必填字段检查。

正式证据仍需在有 emsdk 的环境执行 `npm run test:v4` 并贴输出；本机结果只证明逻辑与序列化可用。
