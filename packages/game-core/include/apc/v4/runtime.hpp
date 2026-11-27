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
std::string start_work(const std::string& input);        // M0 命令 2：{state, offer_id, mode, percent?, committee_partner_ids?}
std::string create_custom_offer(const std::string& input); // M0 命令 12：{state, name, source, scale, style}
std::string adopt_proposal(const std::string& input);     // M0 命令 13：{state}
std::string reject_proposal(const std::string& input);    // M0 命令 14：{state}
std::string assign_staff(const std::string& input);      // M0 命令 4：{state, staff_id, work_id|null}
std::string hire_core(const std::string& input);         // M0 命令 5：{state, staff_id}（池中候选 id）
std::string hire_temporary(const std::string& input);    // M0 命令 8：{state, work_id, candidate_id}
std::string scout(const std::string& input);             // M0 命令 6：{state, role?, focus_ability?}
std::string dismiss_staff(const std::string& input);     // M0 命令 7：{state, staff_id}
std::string sign_outsourcing(const std::string& input);  // M0 命令 9：{state, work_id, item_id, supplier_id, work_total, mode}
std::string deliver_work(const std::string& input);      // M0 命令 10：{state, work_id}
std::string abort_work(const std::string& input);        // M0 命令 11：{state, work_id}
std::string buy_tv_service(const std::string& input);    // M0 命令 15：{state, work_id}
std::string request_extension(const std::string& input); // M0 命令 16：{state, work_id}
std::string advance_week(const std::string& input);      // M0 命令 18：{state}
std::string end_company(const std::string& input);       // M0 命令 20：{state}
std::string finalize_delivery(const std::string& input); // M0 命令 21：{state, work_id}
std::string finalize_company(const std::string& input);  // M0 命令 22：{state}
std::string hash_state(const std::string& input);        // {state}

// M0 契约名适配层（薄封装，不改变语义）：
std::string initialize_game(const std::string& input);   // M0 命令 1：{seed}
std::string set_work_plan(const std::string& input);     // M0 命令 3：{state, work_id, plan}

// M0 §14.1：查看事件（独立原子动作，不结算）；命令表尚未登记，待 #53 补录。
std::string view_event(const std::string& input);        // {state, work_id, event_id}
// M0 命令 18：{state, work_id, event_id, option_id}。
std::string resolve_event(const std::string& input);

// M0 命令 23：{state, offer_id}。Q4 定金锁定，语义见 §14.13.2。
std::string lock_offer(const std::string& input);

// 内部/构建诊断：校验一份事件卡目录，返回 {ok,count,ids,issues}。不是玩家命令。
std::string validate_event_catalog(const std::string& input);  // {catalog, source?}
std::string event_catalog_info(const std::string& input);      // 内嵌目录自检，忽略入参

}  // namespace apc::v4
