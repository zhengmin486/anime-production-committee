#pragma once

// v4 运行时：严格状态校验、M2 单项目命令、事件、周结算、存档与状态哈希。
// 与 v3 的 game_core.hpp 并存，v4 走独立函数名。

#include <string>

#include "apc/v4/model.hpp"

namespace apc::v4 {

// 校验：返回错误列表（空表示合法）。
std::vector<std::string> validate(const GameState& state);

// 规范化哈希：实体按 id 排序后序列化，FNV-1a 64 十六进制。
std::string state_hash(const GameState& state);

// JSON 命令入口。成功返回 {"state": ..., ...}，失败返回 {"error": {"code","message"}}。
//
// initialize / instantiate_work / set_plan 保留为内部测试入口；玩家命令使用契约名。
std::string initialize(const std::string& input);        // 内部/测试：{seed, company_name?}
std::string instantiate_work(const std::string& input);  // 内部/测试：{state, blueprint, work_id, duration_weeks?}
std::string set_plan(const std::string& input);          // 内部/测试：{state, work_id, plan}
std::string assign_staff(const std::string& input);      // M0 命令 4：{state, staff_id, work_id|null}
std::string advance_week(const std::string& input);      // M0 命令 18：{state}
std::string hash_state(const std::string& input);        // {state}

// M0 契约名适配层（薄封装，不改变语义）：
std::string initialize_game(const std::string& input);   // {seed, company_name?}
std::string set_work_plan(const std::string& input);     // {state, work_id, plan}
std::string start_work(const std::string& input);        // {state, offer_id, mode, percent, committee_partner_ids, blueprint}
std::string deliver_work(const std::string& input);      // {state, work_id, settlement?}
std::string abort_work(const std::string& input);        // {state, work_id}
std::string resolve_event(const std::string& input);     // {state, event_id, option_id, catalog}
std::string save_game(const std::string& input);         // {state, saved_at?, rules_version?}
std::string load_game(const std::string& input);         // {save}

}  // namespace apc::v4
