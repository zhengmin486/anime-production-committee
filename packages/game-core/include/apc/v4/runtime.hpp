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
std::string initialize(const std::string& input);       // {seed, company_name?}
std::string instantiate_work(const std::string& input);  // {state, blueprint, work_id, duration_weeks?}
std::string set_plan(const std::string& input);          // {state, work_id, plan}
std::string assign_staff(const std::string& input);      // {state, staff_id, work_id|null}
std::string advance_week(const std::string& input);      // {state}
std::string hash_state(const std::string& input);        // {state}

}  // namespace apc::v4
