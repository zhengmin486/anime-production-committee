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

// M2 单项目纵切：立项、交付、中止。
// start_work 是 M0 命令 2 的 M2 切片：本阶段用请求内传入的 blueprint/offer
// 代替 M3 的企划槽，只支持 contract 模式（委员会属 M4）；制作费在立项时
// 一次性入账（DEC-COMM-003）。完整守卫待 M3/M4 接入企划与委员会后补齐。
std::string start_work(const std::string& input);        // {state, work_id, blueprint, contract_budget, ...}
std::string deliver_work(const std::string& input);      // M0 命令 10：{state, work_id}
std::string abort_work(const std::string& input);        // M0 命令 11：{state, work_id}

}  // namespace apc::v4
