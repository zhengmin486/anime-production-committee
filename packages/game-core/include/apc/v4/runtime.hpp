#pragma once

// v4 运行时（M1）：结构校验、单周结算、JSON 命令入口、状态哈希。
// 与 v3 的 game_core.hpp 并存：M1 不改旧入口，v4 走独立函数名。

#include <string>

#include "apc/v4/model.hpp"

namespace apc::v4 {

// 校验：返回错误列表（空表示合法）。只覆盖 M1 已实现的领域。
std::vector<std::string> validate(const GameState& state);

// 规范化哈希：实体按 id 排序后序列化，FNV-1a 64 十六进制。
std::string state_hash(const GameState& state);

// JSON 命令入口。成功返回 {"state": ..., ...}，失败返回 {"error": {"code","message"}}。
//
// 命名说明：M1 的 initialize / instantiate_work / set_plan 是内部/测试入口，
// 不等同于 M0 冻结的玩家命令；正式语义由下面两个适配入口承担，M2 起统一走契约名。
std::string initialize(const std::string& input);        // 内部/测试：{seed, company_name?}
std::string instantiate_work(const std::string& input);  // 内部/测试：{state, blueprint, work_id, duration_weeks?}
std::string set_plan(const std::string& input);          // 内部/测试：{state, work_id, plan}
std::string assign_staff(const std::string& input);      // M0 命令 4：{state, staff_id, work_id|null}
std::string advance_week(const std::string& input);      // M0 命令 18：{state}
std::string hash_state(const std::string& input);        // {state}

// M0 契约名适配层（薄封装，不改变语义）：
std::string initialize_game(const std::string& input);   // M0 命令 1：{seed}
std::string set_work_plan(const std::string& input);     // M0 命令 3：{state, work_id, plan}

// M0 命令 19：{state, work_id, event_id, option_id}，三个参数全部必填（PR #94 冻结）。
std::string resolve_event(const std::string& input);

// DEC-EVENT-001 查看动作：{state, work_id, event_id}。
// 只把目标事件标记为已查看，解除它对 advance_week 的阻塞；不产生任何效果。
std::string view_event(const std::string& input);

// 内部/构建诊断：校验一份事件卡目录，返回 {ok,count,ids,issues}。不是玩家命令。
std::string validate_event_catalog(const std::string& input);  // {catalog, source?}
std::string event_catalog_info(const std::string& input);      // 内嵌目录自检，忽略入参

}  // namespace apc::v4
