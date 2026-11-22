#include "game_core.hpp"
#include "game_rules.hpp"
#include "game_validation.hpp"

#include <algorithm>
#include <cstdint>
#include <map>
#include <set>
#include <string>
#include <vector>

namespace apc {
namespace {
using Json = nlohmann::json;
using Integer = std::int64_t;
struct ApiError { const char* code; const char* message; };
[[noreturn]] void invalid() { throw ApiError{"INVALID_INPUT", u8"经营数据或操作参数无效。"}; }
[[noreturn]] void wrong_phase() { throw ApiError{"INVALID_PHASE", u8"当前经营状态不允许此操作，请先处理待配置或待结算事项。"}; }
[[noreturn]] void locked() { throw ApiError{"STAGE_LOCKED", u8"阶段方案已锁定，阶段进行期间不能修改常规配置。"}; }
[[noreturn]] void not_allowed(const char* message) { throw ApiError{"MODE_NOT_ALLOWED", message}; }
[[noreturn]] void ended_company() { throw ApiError{"COMPANY_ENDED", u8"公司已进入结束流程，只能结清待交付项目或生成经营总结。"}; }
void require(bool condition) { if (!condition) invalid(); }
Integer number(const Json& value, Integer max = rules::max_integer, Integer min = 0) {
    require(value.is_number_integer());
    if (value.is_number_unsigned()) require(value.get<std::uint64_t>() <= static_cast<std::uint64_t>(max));
    const auto result = value.get<Integer>();
    require(result >= min && result <= max);
    return result;
}
Integer signed_number(const Json& value) { return number(value, rules::max_integer, -rules::max_integer); }
Integer num(const Json& value) { return number(value); }
Integer num(const Json& value, const char* key) { return number(value.at(key)); }
std::string text(const Json& value) { require(value.is_string()); return value.get<std::string>(); }
bool one_of(const Json& value, std::initializer_list<const char*> choices) {
    if (!value.is_string()) return false;
    for (auto choice : choices) if (value == choice) return true;
    return false;
}
Integer add(Integer a, Integer b) {
    require(b >= 0 && a <= rules::max_integer - b);
    return a + b;
}
Integer sub(Integer a, Integer b) {
    require(b >= 0 && a >= -rules::max_integer + b);
    return a - b;
}
Integer scale(Integer value, int permille) { return (value / 1000) * permille + (value % 1000) * permille / 1000; }
Integer clamp_score(Integer value) { return std::clamp<Integer>(value, 0, 100); }
std::uint32_t next_seed(std::uint32_t seed) { return seed * rules::rng_multiplier + rules::rng_increment; }
int stage_index(const std::string& stage) {
    for (std::size_t i = 0; i < rules::stages.size(); ++i) if (stage == rules::stages[i]) return static_cast<int>(i);
    invalid();
}

std::string nonempty_text(const Json& value) {
    const auto result = text(value);
    require(result.find_first_not_of(" \t\r\n") != std::string::npos);
    return result;
}
void check_role(const Json& value) {
    require(one_of(value, {"director", "scriptwriter", "animation_director", "key_animator", "animator", "production_manager", "postproduction"}));
}
void check_ability(const Json& value) {
    require(one_of(value, {"planning", "direction", "drawing", "animation", "management", "postproduction"}));
}
void check_source(const Json& value) { require(one_of(value, {"manga", "light_novel", "game", "original"})); }
void check_rating(const Json& value) { require(one_of(value, {"S", "A", "B", "C", "D"})); }
void check_texts(const Json& values) {
    require(values.is_array());
    for (const auto& value : values) nonempty_text(value);
}
void check_abilities(const Json& values, Integer maximum = 100) {
    require(values.is_object() && values.size() == rules::abilities.size());
    for (auto ability : rules::abilities) number(values.at(ability), maximum);
}
const Json& optional_slot(const Json& object, const char* key) {
    static const Json empty = nullptr;
    return object.contains(key) ? object.at(key) : empty;
}
Integer optional_amount(const Json& object, const char* key) { return object.contains(key) ? num(object, key) : 0; }
std::string offer_origin(const Json& offer) { return offer.contains("origin") ? text(offer.at("origin")) : "market"; }
void check_style_origin(const Json& item) {
    if (item.contains("origin")) require(one_of(item.at("origin"), {"market", "custom", "incoming", "proposal"}));
    if (item.contains("style")) require(one_of(item.at("style"), {"normal", "meme", "ai"}));
    const auto style = item.contains("style") ? text(item.at("style")) : "normal";
    if (style != "normal") require(offer_origin(item) == "custom");
    if (style == "meme") require(item.at("scale") == "short");
}
void check_committee(const Json& members) {
    require(members.is_array() && !members.empty());
    std::set<std::string> ids;
    for (const auto& member : members) {
        require(member.is_object());
        require(ids.insert(nonempty_text(member.at("id"))).second);
        nonempty_text(member.at("name"));
        require(!member.contains("share_percent") && !member.contains("channels"));
        require(one_of(member.at("channel"), {"publisher", "toy", "music", "tv_broadcast"}));
    }
}
template<class State> auto find_current_staff(State& state, const std::string& id)
    -> decltype(&state.at("company").at("staff").at(0)) {
    for (auto& person : state.at("company").at("staff")) if (person.at("id") == id) return &person;
    if (state.at("project").is_object())
        for (auto& person : state.at("project").at("temporary_staff")) if (person.at("id") == id) return &person;
    return nullptr;
}
const rules::StaffSpec& execution_staff_spec(const Json& person) {
    if (person.at("employment") == "core")
        for (const auto& spec : rules::staff) if (person.at("id") == spec.id) return spec;
    not_allowed(u8"该员工尚无已定义的专业匹配来源，暂不能执行制作周；请等待动态员工专业契约接入。");
}
const rules::Policy& policy_of(const std::string& id) {
    for (const auto& item : rules::policies) if (id == item.id) return item;
    invalid();
}
const rules::ScaleRule& scale_of(const std::string& id) {
    for (const auto& item : rules::scales) if (id == item.scale) return item;
    invalid();
}

Json zero_costs() {
    return {{"salary", 0}, {"operations", 0}, {"production", 0}, {"temporary", 0}, {"outsourcing", 0}, {"events", 0}, {"extension", 0}, {"penalty", 0}};
}
Json empty_finance(std::int64_t contract_received = 0) {
    return {{"contract_received", contract_received}, {"investment_paid", 0}, {"commercial_share_received", 0}, {"costs", zero_costs()}};
}
Integer costs_total(const Json& costs) {
    require(costs.is_object());
    Integer total = 0;
    for (auto key : {"salary", "operations", "production", "temporary", "outsourcing", "events", "extension", "penalty"}) total = add(total, number(costs.at(key)));
    for (auto key : {"development", "distribution"}) total = add(total, optional_amount(costs, key));
    return total;
}
void check_costs(const Json& costs) { costs_total(costs); }
void check_finance(const Json& finance) {
    require(finance.is_object());
    number(finance.at("contract_received")); number(finance.at("investment_paid")); number(finance.at("commercial_share_received"));
    check_costs(finance.at("costs"));
}
void add_cost(Json& finance, const char* category, Integer amount) {
    if (amount <= 0) return;
    finance["costs"][category] = add(number(finance.at("costs").at(category)), amount);
    check_costs(finance.at("costs"));
}

Json make_staff(const rules::StaffSpec& spec) {
    Json abilities = Json::object(), potential = Json::object(), revealed = Json::object(), experience = Json::object();
    for (std::size_t i = 0; i < rules::abilities.size(); ++i) {
        abilities[rules::abilities[i]] = spec.abilities[i];
        potential[rules::abilities[i]] = spec.potential[i];
        revealed[rules::abilities[i]] = false;
        experience[rules::abilities[i]] = 0;
    }
    return {
        {"id", spec.id}, {"name", spec.name}, {"role", spec.role}, {"employment", "core"},
        {"abilities", abilities}, {"experience", experience}, {"potential", potential}, {"revealed_potential", revealed},
        {"talent_type", spec.talent_type}, {"clues", Json::array({spec.clue})}, {"traits", Json::array()},
        {"weekly_salary", spec.weekly_salary}, {"project_fee", 0}, {"fatigue", rules::initial_fatigue},
        {"morale", rules::initial_morale}, {"departure_warning", false}
    };
}
Json make_offer(const rules::OfferSpec& spec) {
    Json workloads = Json::object();
    for (std::size_t i = 0; i < rules::stages.size(); ++i) workloads[rules::stages[i]] = spec.workloads[i];
    return {
        {"id", spec.id}, {"name", spec.name}, {"source", spec.source}, {"scale", spec.scale},
        {"contract_budget", spec.contract_budget},
        {"duration_weeks", spec.duration_weeks}, {"target_quality", spec.target_quality},
        {"audience_base", spec.audience_base}, {"commercial_potential", spec.commercial_potential},
        {"risk", spec.risk}, {"allowed_modes", Json::array({"contract"})}, {"workloads", workloads}, {"previous_work_id", nullptr}
    };
}
Json make_offer_variant(const rules::OfferSpec& spec, int round) {
    auto item = make_offer(spec);
    item["id"] = std::string(spec.id) + "_r" + std::to_string(round);
    item["name"] = item["name"].get<std::string>() + u8"·再演" + std::to_string(round - 1);
    return item;
}
void check_offer(const Json& item) {
    require(item.is_object());
    const auto id = nonempty_text(item.at("id"));
    nonempty_text(item.at("name"));
    check_source(item.at("source"));
    require(one_of(item.at("scale"), {"ova", "short", "tv", "movie"}));
    require(!item.contains("total_investment"));
    number(item.at("contract_budget"));
    number(item.at("duration_weeks"), rules::max_integer, 1);
    number(item.at("target_quality"), 100); number(item.at("audience_base"), 100); number(item.at("commercial_potential"), 100);
    require(one_of(item.at("risk"), {"low", "medium", "high"}));
    const auto& workloads = item.at("workloads");
    require(workloads.is_object() && workloads.size() == rules::stages.size());
    for (auto stage : rules::stages) number(workloads.at(stage), rules::max_integer, 1);
    const auto& allowed = item.at("allowed_modes");
    require(allowed.is_array() && !allowed.empty());
    std::set<std::string> modes;
    for (const auto& mode : allowed) {
        require(one_of(mode, {"contract", "committee"}));
        require(modes.insert(text(mode)).second);
    }
    if (item.at("source") == "original") require(modes.size() == 1 && modes.count("committee"));
    if (!item.at("previous_work_id").is_null()) require(nonempty_text(item.at("previous_work_id")) != id);
    check_style_origin(item);
    optional_amount(item, "min_reputation");
    if (item.contains("committee_members")) {
        require(modes.count("committee") && !item.at("committee_members").empty());
        check_committee(item.at("committee_members"));
    }
    if (item.contains("channel_potentials")) {
        const auto& potentials = item.at("channel_potentials");
        require(potentials.is_object());
        number(potentials.at("bd"), 100);
        for (auto it = potentials.begin(); it != potentials.end(); ++it) {
            require(one_of(Json(it.key()), {"bd", "publisher", "toy", "music", "tv_broadcast"}));
            number(it.value(), 100);
        }
    }
    if (item.contains("required_works")) {
        const auto& requirements = item.at("required_works");
        require(requirements.is_array() && !requirements.empty());
        std::set<std::pair<std::string, std::string>> seen;
        for (const auto& requirement : requirements) {
            require(requirement.is_object());
            check_rating(requirement.at("rating"));
            if (requirement.contains("source")) check_source(requirement.at("source"));
            require(seen.emplace(text(requirement.at("rating")), requirement.contains("source") ? text(requirement.at("source")) : "").second);
        }
    }
}

Integer salary_total(const Json& state) {
    Integer total = rules::operations_weekly;
    for (const auto& person : state.at("company").at("staff")) total = add(total, num(person, "weekly_salary"));
    return total;
}
Json recommended_configuration(const Json& state, const std::string& stage) {
    const auto required = std::string(rules::abilities[rules::stage_ability[stage_index(stage)]]);
    Json assignments = Json::array();
    for (const auto& person : state.at("company").at("staff")) assignments.push_back({{"staff_id", person.at("id")}, {"role", person.at("role")}, {"focus", required}});
    for (const auto& person : state.at("project").at("temporary_staff")) assignments.push_back({{"staff_id", person.at("id")}, {"role", person.at("role")}, {"focus", required}});
    return {{"assignments", assignments}, {"policy", "balanced"}, {"overtime", false}};
}
bool is_producing_active(const Json& state) {
    const auto& project = state.at("project");
    return project.is_object() && !project.at("current_stage").is_null()
        && project.at("stages").at(project.at("current_stage").get<std::string>()).at("status") == "active";
}
Json idle_preview(const Json& state) {
    const auto total = salary_total(state);
    auto costs = zero_costs();
    costs["salary"] = total - rules::operations_weekly;
    costs["operations"] = rules::operations_weekly;
    return {{"next_week", num(state.at("company"), "week") + 1}, {"costs", costs}, {"total_cost", total}, {"event_probability_per_mille", 0}};
}
Integer weekly_production_cost(const Json& state) {
    const auto& project = state.at("project");
    const auto& stage = project.at("stages").at(project.at("current_stage").get<std::string>());
    const auto& config = stage.at("configuration");
    const auto& policy = policy_of(config.at("policy").get<std::string>());
    const auto workers = static_cast<Integer>(config.at("assignments").size());
    return rules::stage_cost * policy.cost / 1000 + (config.at("overtime") == true ? rules::overtime_cost * workers : 0);
}
Json active_preview(const Json& state) {
    const auto salaries = salary_total(state) - rules::operations_weekly;
    const auto production = weekly_production_cost(state);
    auto costs = zero_costs();
    costs["salary"] = salaries; costs["operations"] = rules::operations_weekly; costs["production"] = production;
    return {{"next_week", num(state.at("company"), "week") + 1}, {"costs", costs}, {"total_cost", add(add(salaries, rules::operations_weekly), production)}, {"event_probability_per_mille", 0}};
}
void refresh_preview(Json& state) {
    const auto& phase = state.at("phase");
    if (state.at("company").at("status") != "running") state["preview"] = nullptr;
    else if (phase == "idle") state["preview"] = idle_preview(state);
    else if (phase == "producing" && is_producing_active(state)) state["preview"] = active_preview(state);
    else state["preview"] = nullptr;
}
Json generate_offers(const Json& state) {
    const auto seed = static_cast<std::uint32_t>(number(state.at("seed"), rules::max_seed));
    std::set<std::string> used;
    for (const auto& work : state.at("history")) used.insert(work.at("id").get<std::string>());
    for (auto key : {"custom_offer", "pending_proposal"})
        if (!optional_slot(state, key).is_null()) used.insert(text(state.at(key).at("id")));
    Json result = Json::array();
    const auto start = seed % rules::offers.size();
    for (std::size_t offset = 0; offset < rules::offers.size() && result.size() < 4; ++offset) {
        const auto& spec = rules::offers[(start + offset) % rules::offers.size()];
        if (!used.count(spec.id)) { result.push_back(make_offer(spec)); continue; }
        for (int round = 2; round <= 9 && result.size() < 4; ++round) {
            if (used.count(std::string(spec.id) + "_r" + std::to_string(round))) continue;
            result.push_back(make_offer_variant(spec, round));
            break;
        }
    }
    require(result.size() == 4);
    return result;
}
Json team_snapshot(const Json& person) {
    return {{"staff_id", person.at("id")}, {"name", person.at("name")}, {"role", person.at("role")}, {"employment", person.at("employment")}, {"abilities", person.at("abilities")}};
}
Json build_summary(const Json& state) {
    const auto& company = state.at("company");
    const auto funds = number(company.at("funds"), rules::max_integer, -rules::max_integer);
    std::string best;
    Integer best_quality = -1;
    for (const auto& work : state.at("history")) {
        const auto quality = num(work, "quality_score");
        if (quality > best_quality) { best_quality = quality; best = work.at("id").get<std::string>(); }
    }
    const auto rating = funds >= rules::rating_renowned ? "renowned" : funds >= rules::rating_stable ? "stable" : funds >= rules::rating_small ? "small" : "failed";
    return {
        {"reason", company.at("end_reason")}, {"weeks", company.at("week")}, {"final_funds", funds},
        {"net_cash_change", sub(funds, num(company, "initial_funds"))}, {"total_projects", state.at("history").size()},
        {"best_work_id", best.empty() ? Json(nullptr) : Json(best)}, {"rating", rating}
    };
}

enum class StaffPlacement { core, candidate, temporary };
void check_staff_fields(const Json& person) {
    require(person.is_object());
    nonempty_text(person.at("id")); nonempty_text(person.at("name")); check_role(person.at("role"));
    require(one_of(person.at("employment"), {"core", "temporary"}));
    require(one_of(person.at("talent_type"), {"specialist", "uneven", "generalist", "ordinary"}));
    check_abilities(person.at("abilities")); check_abilities(person.at("potential"));
    check_abilities(person.at("experience"), rules::max_integer);
    const auto& revealed = person.at("revealed_potential");
    require(revealed.is_object() && revealed.size() == rules::abilities.size());
    for (auto ability : rules::abilities) {
        require(num(person.at("potential"), ability) >= num(person.at("abilities"), ability));
        require(revealed.at(ability).is_boolean());
    }
    check_texts(person.at("clues"));
    require(person.at("clues").size() >= 1 && person.at("clues").size() <= 2);
    check_texts(person.at("traits"));
    number(person.at("weekly_salary")); number(person.at("project_fee"));
    require(person.at("employment") == "core" ? num(person, "project_fee") == 0 : num(person, "weekly_salary") == 0);
    number(person.at("morale"), 100); number(person.at("fatigue"), 100);
    require(person.at("departure_warning").is_boolean());
}
void check_staff_placement(const Json& people, StaffPlacement placement) {
    require(people.is_array());
    for (const auto& person : people) {
        check_staff_fields(person);
        if (placement == StaffPlacement::core) require(person.at("employment") == "core");
        if (placement == StaffPlacement::temporary) require(person.at("employment") == "temporary");
    }
}
void check_configuration_fields(const Json& config) {
    require(config.is_object() && one_of(config.at("policy"), {"quality", "balanced", "deadline"}) && config.at("overtime").is_boolean());
    require(config.at("assignments").is_array());
    std::set<std::string> seen;
    for (const auto& item : config.at("assignments")) {
        require(item.is_object() && seen.insert(nonempty_text(item.at("staff_id"))).second);
        check_role(item.at("role")); check_ability(item.at("focus"));
    }
}
void check_configuration_references(const Json& config, const Json& state) {
    if (config.is_null()) return;
    for (const auto& assignment : config.at("assignments")) {
        const auto* person = find_current_staff(state, text(assignment.at("staff_id")));
        require(person != nullptr && assignment.at("role") == person->at("role"));
    }
}
void check_configuration(const Json& config, const Json& state) {
    check_configuration_fields(config);
    check_configuration_references(config, state);
}
void check_team_snapshot(const Json& team) {
    require(team.is_array());
    std::set<std::string> ids;
    for (const auto& member : team) {
        require(member.is_object() && ids.insert(nonempty_text(member.at("staff_id"))).second);
        nonempty_text(member.at("name")); check_role(member.at("role"));
        require(one_of(member.at("employment"), {"core", "temporary"}));
        check_abilities(member.at("abilities"));
    }
}
void check_snapshot_references(const Json& config, const Json& team, bool match_role = true) {
    if (config.is_null()) return;
    for (const auto& assignment : config.at("assignments")) {
        const auto found = std::find_if(team.begin(), team.end(), [&](const Json& member) { return member.at("staff_id") == assignment.at("staff_id"); });
        require(found != team.end() && (!match_role || found->at("role") == assignment.at("role")));
    }
}
void check_stage_result(const Json& result) {
    require(result.is_object());
    number(result.at("weeks_spent"), rules::max_integer, 1);
    number(result.at("quality"), 100);
    check_costs(result.at("costs")); check_texts(result.at("issues")); check_team_snapshot(result.at("team"));
}
void check_supplier(const Json& supplier) {
    require(supplier.is_object());
    nonempty_text(supplier.at("id")); nonempty_text(supplier.at("name"));
    const auto& specialties = supplier.at("specialties");
    require(specialties.is_array() && !specialties.empty());
    std::set<std::string> seen;
    for (const auto& ability : specialties) { check_ability(ability); require(seen.insert(text(ability)).second); }
    number(supplier.at("capacity"), rules::max_integer, 1); number(supplier.at("speed"), rules::max_integer, 1);
    number(supplier.at("quality"), 100); number(supplier.at("reliability"), 100); number(supplier.at("unit_price"));
    require(supplier.at("unlocked").is_boolean());
}
void check_outsource_task(const Json& task) {
    require(task.is_object());
    nonempty_text(task.at("id")); nonempty_text(task.at("supplier_id"));
    stage_index(text(task.at("stage"))); check_ability(task.at("ability"));
    const auto total = number(task.at("work_total"), rules::max_integer, 1);
    const auto done = number(task.at("work_done"), total);
    number(task.at("fee_paid")); number(task.at("due_week"));
    require(one_of(task.at("mode"), {"normal", "emergency"}));
    require(one_of(task.at("status"), {"active", "delivered", "failed"}));
    if (task.at("status") == "delivered") require(done == total);
}
void check_event(const Json& event) {
    require(event.is_object() && !event.contains("effect") && !event.contains("effects"));
    nonempty_text(event.at("id")); nonempty_text(event.at("title")); nonempty_text(event.at("description"));
    require(one_of(event.at("category"), {"personnel", "quality", "budget", "schedule"}));
    stage_index(text(event.at("stage")));
    const auto& trigger = event.at("trigger");
    require(trigger.is_object()); nonempty_text(trigger.at("metric"));
    signed_number(trigger.at("value")); signed_number(trigger.at("threshold"));
    const auto& options = event.at("options");
    require(options.is_array() && !options.empty());
    std::set<std::string> ids;
    for (const auto& option : options) {
        require(option.is_object() && !option.contains("effect") && !option.contains("effects"));
        require(ids.insert(nonempty_text(option.at("id"))).second);
        nonempty_text(option.at("label")); number(option.at("cost"));
        require(option.at("allows_reconfigure").is_boolean());
        if (!option.at("disabled_reason").is_null()) nonempty_text(option.at("disabled_reason"));
    }
}
int check_stages(const Json& stages, const Json* workloads = nullptr) {
    require(stages.is_object() && stages.size() == rules::stages.size());
    int first = -1;
    for (std::size_t i = 0; i < rules::stages.size(); ++i) {
        const auto name = rules::stages[i];
        const auto& stage = stages.at(name);
        require(stage.is_object() && one_of(stage.at("status"), {"pending", "ready", "active", "completed"}));
        const auto& status = stage.at("status");
        const auto done = number(stage.at("work_done")); number(stage.at("quality"), 100);
        const auto& config = stage.at("configuration");
        const auto& recommended = stage.at("recommended_configuration");
        const auto& result = stage.at("result");
        if (!config.is_null()) check_configuration_fields(config);
        if (!recommended.is_null()) check_configuration_fields(recommended);
        if (!result.is_null()) check_stage_result(result);
        if (status == "completed") {
            require(first == -1 && !config.is_null() && !result.is_null() && done > 0);
            if (workloads) require(done == num(*workloads, name));
        } else {
            if (workloads) require(done < num(*workloads, name));
            require(result.is_null());
            if (first == -1) { first = static_cast<int>(i); require(status == "ready" || status == "active"); }
            else require(status == "pending");
            if (status == "active") require(!config.is_null());
            else require(config.is_null() && done == 0);
            if (status == "pending") require(recommended.is_null());
        }
    }
    return first;
}
void check_mode_finance(const Json& object) {
    require(one_of(object.at("mode"), {"contract", "committee"}));
    check_finance(object.at("finance"));
    if (object.at("mode") == "contract") {
        require(num(object, "investment_percent") == 0);
        require(num(object.at("finance"), "investment_paid") == 0 && num(object.at("finance"), "commercial_share_received") == 0);
    } else number(object.at("investment_percent"), 100, 10);
}
void check_project(const Json& project) {
    require(project.is_object());
    check_offer(project.at("offer")); check_mode_finance(project);
    const auto& modes = project.at("offer").at("allowed_modes");
    require(std::find(modes.begin(), modes.end(), project.at("mode")) != modes.end());
    number(project.at("opening_funds"));
    const auto start = number(project.at("start_week"), rules::max_weeks);
    number(project.at("deadline_week"), rules::max_integer, start + 1);
    number(project.at("extension_count"), 1);
    if (project.at("mode") == "contract") {
        require(!project.contains("total_investment"));
        require(num(project, "deadline_week") == add(start, num(project.at("offer"), "duration_weeks")));
        require(num(project, "extension_count") == 0 && project.at("committee_pressure").is_null());
        require(optional_slot(project, "committee").is_null() && optional_slot(project, "tv_service").is_null());
    } else {
        number(project.at("committee_pressure"), 100);
        require(project.contains("total_investment") && num(project, "total_investment") == scale(num(project.at("offer"), "contract_budget"), 2));
        if (project.contains("committee")) check_committee(project.at("committee"));
    }
    const auto& tv = optional_slot(project, "tv_service");
    if (!tv.is_null()) {
        require(tv.is_object());
        number(tv.at("purchased_week"), rules::max_weeks, start);
        number(tv.at("cost"), rules::max_integer, 1);
    }
    check_staff_placement(project.at("temporary_staff"), StaffPlacement::temporary);
    require(project.at("outsourcing").is_array());
    for (const auto& task : project.at("outsourcing")) check_outsource_task(task);
    const auto& delivery = project.at("delivery_reason");
    require(delivery.is_null() || one_of(delivery, {"completed", "deadline", "company_closed"}));
    const auto current = project.at("current_stage").is_null() ? -1 : stage_index(text(project.at("current_stage")));
    require(current == check_stages(project.at("stages"), &project.at("offer").at("workloads")));
    require((current == -1) == (delivery == "completed"));
}
void check_work_record(const Json& work) {
    require(work.is_object());
    const auto id = nonempty_text(work.at("id")); nonempty_text(work.at("name"));
    check_source(work.at("source")); require(one_of(work.at("scale"), {"ova", "short", "tv", "movie"}));
    const auto start = number(work.at("start_week"), rules::max_weeks);
    number(work.at("end_week"), rules::max_weeks, start);
    if (!work.at("previous_work_id").is_null()) require(nonempty_text(work.at("previous_work_id")) != id);
    require(one_of(work.at("end_reason"), {"completed", "deadline", "company_closed"}));
    check_mode_finance(work);
    if (work.at("source") == "original") require(work.at("mode") == "committee");
    number(work.at("quality_score"), 100); number(work.at("commercial_score"), 100); number(work.at("commercial_revenue"));
    signed_number(work.at("profit")); check_team_snapshot(work.at("team"));
    require((check_stages(work.at("stages")) == -1) == (work.at("end_reason") == "completed"));
    check_style_origin(work);
    if (work.contains("rating")) check_rating(work.at("rating"));
    if (work.contains("channel_breakdown")) {
        const auto& breakdown = work.at("channel_breakdown");
        require(breakdown.is_array());
        std::set<std::string> channels;
        Integer revenue = 0, received = 0;
        for (const auto& entry : breakdown) {
            require(entry.is_object() && one_of(entry.at("channel"), {"bd", "publisher", "toy", "music", "tv_broadcast"}));
            require(channels.insert(text(entry.at("channel"))).second);
            const auto amount = num(entry, "revenue"), share = number(entry.at("company_received"), amount);
            revenue = add(revenue, amount); received = add(received, share);
        }
        require(channels.count("bd") && revenue == num(work, "commercial_revenue") && received == num(work.at("finance"), "commercial_share_received"));
    }
}
void check_state_entities(const Json& state) {
    require(state.is_object() && num(state, "version") == rules::version);
    number(state.at("seed"), rules::max_seed);
    require(one_of(state.at("phase"), {"idle", "producing", "event_pending", "project_ready", "project_settled", "company_ended"}));
    const auto& company = state.at("company");
    require(company.is_object() && one_of(company.at("status"), {"running", "closing", "ended"}));
    number(company.at("week"), rules::max_weeks); number(company.at("initial_funds"));
    signed_number(company.at("funds")); number(company.at("reputation")); check_finance(company.at("finance"));
    require(company.at("end_reason").is_null() || one_of(company.at("end_reason"), {"time_limit", "bankrupt", "voluntary"}));
    if (company.contains("scout_pity")) {
        const auto& pity = company.at("scout_pity");
        require(pity.is_object()); number(pity.at("since_sr")); number(pity.at("since_ssr"));
    }
    check_staff_placement(company.at("staff"), StaffPlacement::core);
    check_staff_placement(state.at("recruitment_pool"), StaffPlacement::candidate);
    require(state.at("suppliers").is_array());
    for (const auto& supplier : state.at("suppliers")) check_supplier(supplier);
    require(state.at("offers").is_array());
    for (const auto& offer : state.at("offers")) check_offer(offer);
    for (auto slot : {"custom_offer", "pending_proposal"}) if (!optional_slot(state, slot).is_null()) check_offer(state.at(slot));
    if (!state.at("project").is_null()) check_project(state.at("project"));
    if (!state.at("pending_event").is_null()) check_event(state.at("pending_event"));
    require(state.at("history").is_array());
    for (const auto& work : state.at("history")) check_work_record(work);
    if (!state.at("last_project_id").is_null()) nonempty_text(state.at("last_project_id"));
    const auto& summary = state.at("company_result");
    if (!summary.is_null()) {
        require(summary.is_object() && one_of(summary.at("reason"), {"time_limit", "bankrupt", "voluntary"}));
        number(summary.at("weeks"), rules::max_weeks); signed_number(summary.at("final_funds"));
        signed_number(summary.at("net_cash_change")); number(summary.at("total_projects"));
        require(one_of(summary.at("rating"), {"renowned", "stable", "small", "failed"}));
        if (!summary.at("best_work_id").is_null()) nonempty_text(summary.at("best_work_id"));
    }
    const auto& preview = state.at("preview");
    if (!preview.is_null()) {
        require(preview.is_object()); number(preview.at("next_week"), rules::max_weeks, 1);
        require(number(preview.at("total_cost")) == costs_total(preview.at("costs")));
        number(preview.at("event_probability_per_mille"), 1000);
    }
}
void check_global_ids_and_references(const Json& state) {
    std::set<std::string> staff_ids, offer_ids, supplier_ids, task_ids;
    auto collect_staff = [&](const Json& people) {
        for (const auto& person : people) require(staff_ids.insert(text(person.at("id"))).second);
    };
    collect_staff(state.at("company").at("staff")); collect_staff(state.at("recruitment_pool"));
    const auto& project = state.at("project");
    if (!project.is_null()) collect_staff(project.at("temporary_staff"));
    for (const auto& supplier : state.at("suppliers")) require(supplier_ids.insert(text(supplier.at("id"))).second);
    const auto week = num(state.at("company"), "week");
    std::map<std::string, Integer> history_end;
    auto check_previous = [&](const Json& item, Integer latest) {
        const auto& previous = item.at("previous_work_id");
        if (previous.is_null()) return;
        const auto found = history_end.find(text(previous));
        require(found != history_end.end() && found->second <= latest);
    };
    for (const auto& work : state.at("history")) {
        const auto id = text(work.at("id"));
        require(offer_ids.insert(id).second && num(work, "end_week") <= week);
        check_previous(work, num(work, "start_week"));
        history_end.emplace(id, num(work, "end_week"));
        for (auto name : rules::stages) {
            const auto& stage = work.at("stages").at(name);
            check_snapshot_references(stage.at("configuration"), work.at("team"), false);
            if (!stage.at("result").is_null()) {
                const auto& team = stage.at("result").at("team");
                check_snapshot_references(stage.at("configuration"), team);
                for (const auto& member : team) {
                    const auto& all = work.at("team");
                    require(std::any_of(all.begin(), all.end(), [&](const Json& other) { return other.at("staff_id") == member.at("staff_id"); }));
                }
            }
        }
    }
    auto collect_offer = [&](const Json& offer, Integer latest) {
        require(offer_ids.insert(text(offer.at("id"))).second);
        check_previous(offer, latest);
    };
    for (const auto& offer : state.at("offers")) collect_offer(offer, week);
    for (auto slot : {"custom_offer", "pending_proposal"}) if (!optional_slot(state, slot).is_null()) collect_offer(state.at(slot), week);
    const auto& last = state.at("last_project_id");
    require(last.is_null() || history_end.count(text(last)));
    if (!project.is_null()) {
        const auto start = num(project, "start_week");
        require(start <= week && last.is_null());
        collect_offer(project.at("offer"), start);
        const auto& tv = optional_slot(project, "tv_service");
        if (!tv.is_null()) require(num(tv, "purchased_week") <= week);
        for (auto name : rules::stages) {
            const auto& stage = project.at("stages").at(name);
            if (stage.at("status") == "completed") check_snapshot_references(stage.at("configuration"), stage.at("result").at("team"));
            else {
                check_configuration_references(stage.at("configuration"), state);
                check_configuration_references(stage.at("recommended_configuration"), state);
            }
        }
        for (const auto& task : project.at("outsourcing")) {
            require(task_ids.insert(text(task.at("id"))).second);
            const auto& suppliers = state.at("suppliers");
            const auto supplier = std::find_if(suppliers.begin(), suppliers.end(), [&](const Json& item) { return item.at("id") == task.at("supplier_id"); });
            require(supplier != suppliers.end() && supplier->at("unlocked") == true);
            const auto& specialties = supplier->at("specialties");
            require(std::find(specialties.begin(), specialties.end(), task.at("ability")) != specialties.end());
        }
    }
    const auto& event = state.at("pending_event");
    if (!event.is_null()) require(!project.is_null() && event.at("stage") == project.at("current_stage"));
}
void check_phase_invariants(const Json& state) {
    const auto& company = state.at("company");
    const auto& status = company.at("status");
    const auto& phase = state.at("phase");
    const auto week = num(company, "week");
    const auto& project = state.at("project");
    const auto& offers = state.at("offers");
    const auto& event = state.at("pending_event");
    const auto& last = state.at("last_project_id");
    const auto& custom = optional_slot(state, "custom_offer");
    const auto& proposal = optional_slot(state, "pending_proposal");
    if (status == "running") {
        require(company.at("end_reason").is_null() && signed_number(company.at("funds")) >= 0 && week < rules::max_weeks);
        require(phase != "company_ended");
    } else {
        require(!company.at("end_reason").is_null());
        require(signed_number(company.at("funds")) >= 0 || company.at("end_reason") == "bankrupt");
        if (company.at("end_reason") == "time_limit") require(week == rules::max_weeks);
        if (status == "closing") require(one_of(phase, {"idle", "project_ready", "project_settled"}));
        else require(phase == "company_ended");
    }
    if (status == "ended") require(state.at("company_result") == build_summary(state));
    else require(state.at("company_result").is_null());
    if (!custom.is_null()) require(offer_origin(custom) == "custom");
    if (!proposal.is_null()) require(offer_origin(proposal) == "proposal" && proposal.at("source") == "original");
    if (status != "running" || phase != "idle") require(custom.is_null() && proposal.is_null());
    for (const auto& offer : offers) require(offer_origin(offer) == "market" || offer_origin(offer) == "incoming");
    if (phase == "idle") {
        require(project.is_null() && last.is_null() && offers.size() == (status == "running" ? 4 : 0));
        if (status == "running") {
            const auto available = std::count_if(offers.begin(), offers.end(), [&](const Json& offer) { return optional_amount(offer, "min_reputation") <= num(company, "reputation"); });
            require(available >= 2);
        }
    } else {
        require(offers.empty());
        if (phase == "project_settled") require(project.is_null() && !last.is_null());
        else if (phase == "company_ended") require(project.is_null());
        else {
            require(!project.is_null());
            const auto& delivery = project.at("delivery_reason");
            if (phase == "project_ready") {
                require(!delivery.is_null());
                if (delivery == "deadline") require(week >= num(project, "deadline_week"));
                if (delivery == "company_closed") require(status == "closing");
            } else {
                require(status == "running" && delivery.is_null() && !project.at("current_stage").is_null() && week < num(project, "deadline_week"));
            }
        }
    }
    if (phase == "event_pending") require(!event.is_null() && is_producing_active(state));
    else require(event.is_null());
    const auto& preview = state.at("preview");
    if (status == "running" && (phase == "idle" || (phase == "producing" && is_producing_active(state)))) {
        require(!preview.is_null());
        const auto expected = phase == "idle" ? idle_preview(state) : active_preview(state);
        require(preview.at("next_week") == expected.at("next_week") && preview.at("total_cost") == expected.at("total_cost")
            && preview.at("event_probability_per_mille") == expected.at("event_probability_per_mille"));
        for (auto key : {"salary", "operations", "production", "temporary", "outsourcing", "events", "extension", "penalty", "development", "distribution"})
            require(optional_amount(preview.at("costs"), key) == optional_amount(expected.at("costs"), key));
    } else require(preview.is_null());
}
void running_check(const Json& state) {
    if (state.at("company").at("status") != "running") ended_company();
}
void clear_offer_slots(Json& state) {
    for (auto key : {"custom_offer", "pending_proposal"}) if (state.contains(key)) state[key] = nullptr;
}
void check_style_execution(const Json& offer) {
    if (offer.contains("style") && offer.at("style") != "normal") not_allowed(u8"特殊风格制作规则尚未接入，暂不能执行该企划。");
}
void check_production_execution(const Json& state, const Json& config) {
    check_style_execution(state.at("project").at("offer"));
    for (const auto& assignment : config.at("assignments")) {
        const auto* person = find_current_staff(state, text(assignment.at("staff_id")));
        require(person != nullptr);
        execution_staff_spec(*person);
    }
    const auto& project = state.at("project");
    if (project.at("mode") == "committee") not_allowed(u8"委员会制作规则尚未接入，不能按承制规则推进。");
    for (const auto& task : project.at("outsourcing"))
        if (task.at("status") == "active") not_allowed(u8"外包交付规则尚未接入，不能忽略在途外包推进制作周。");
}
void pay_weekly_costs(Json& state, Integer salaries, Integer production_or_none) {
    state["company"]["finance"]["costs"]["salary"] = add(num(state.at("company").at("finance").at("costs"), "salary"), salaries);
    state["company"]["finance"]["costs"]["operations"] = add(num(state.at("company").at("finance").at("costs"), "operations"), rules::operations_weekly);
    if (production_or_none > 0) add_cost(state["company"]["finance"], "production", production_or_none);
    if (state.at("project").is_object()) {
        state["project"]["finance"]["costs"]["salary"] = add(num(state.at("project").at("finance").at("costs"), "salary"), salaries);
        state["project"]["finance"]["costs"]["operations"] = add(num(state.at("project").at("finance").at("costs"), "operations"), rules::operations_weekly);
        if (production_or_none > 0) add_cost(state["project"]["finance"], "production", production_or_none);
        check_costs(state.at("project").at("finance").at("costs"));
    }
    check_costs(state.at("company").at("finance").at("costs"));
}
Json zero_report(const Json& state) {
    return {{"week", num(state.at("company"), "week")}, {"funds_delta", 0}, {"costs", zero_costs()}, {"stage_deltas", Json::array()}, {"staff_deltas", Json::array()}, {"messages", Json::array()}};
}
void close_bankrupt(Json& state) {
    clear_offer_slots(state);
    state["pending_event"] = nullptr;
    state["company"]["status"] = "closing";
    state["company"]["end_reason"] = "bankrupt";
    state["preview"] = nullptr;
    if (state.at("phase") == "producing") {
        state["project"]["delivery_reason"] = "company_closed";
        state["phase"] = "project_ready";
    } else state["offers"] = Json::array();
}
Json complete_stage(Json& state, const std::string& stage, int index) {
    auto& project = state["project"];
    auto& item = project["stages"][stage];
    const auto& config = item.at("configuration");
    const auto& policy = policy_of(config.at("policy").get<std::string>());
    Integer earlier = 0;
    for (int i = 0; i < index; ++i) earlier += num(project.at("stages").at(rules::stages[i]).at("result"), "weeks_spent");
    const auto elapsed = num(state.at("company"), "week") - num(project, "start_week");
    const auto weeks_spent = std::max<Integer>(1, elapsed - earlier);
    const auto workers = static_cast<Integer>(config.at("assignments").size());
    auto costs = zero_costs();
    costs["production"] = weeks_spent * (rules::stage_cost * policy.cost / 1000) + (config.at("overtime") == true ? weeks_spent * rules::overtime_cost * workers : 0);
    const auto quality = num(item, "quality");
    Json issues = Json::array();
    if (quality < 40) issues.push_back(u8"画面稳定性不足，需要后续作品改进");
    else if (quality < 60) issues.push_back(u8"演出完成度低于预期");
    Json team = Json::array();
    std::set<std::string> seen;
    for (const auto& assignment : config.at("assignments")) {
        const auto id = assignment.at("staff_id").get<std::string>();
        if (!seen.insert(id).second) continue;
        const auto* person = find_current_staff(state, id);
        require(person != nullptr);
        team.push_back(team_snapshot(*person));
    }
    item["result"] = {{"weeks_spent", weeks_spent}, {"quality", quality}, {"costs", costs}, {"issues", issues}, {"team", team}};
    item["status"] = "completed";
    return item["result"];
}

template<class Action> std::string execute(const std::string& input, Action action, bool with_state = true) {
    try {
        auto request = Json::parse(input);
        require(request.is_object());
        if (with_state) validate_state(request.at("state"));
        return action(request).dump();
    } catch (const ApiError& error) {
        return Json{{"error", {{"code", error.code}, {"message", error.message}}}}.dump();
    } catch (const Json::exception&) {
        return Json{{"error", {{"code", "INVALID_INPUT"}, {"message", u8"JSON、字段类型或数值范围无效。"}}}}.dump();
    } catch (...) {
        return R"({"error":{"code":"INTERNAL_ERROR","message":"An internal error occurred."}})";
    }
}
Json response(Json state, const std::string& message) { return {{"state", std::move(state)}, {"message", message}}; }
}

void validate_state(const nlohmann::json& state) {
    check_state_entities(state);
    check_global_ids_and_references(state);
    check_phase_invariants(state);
}

std::string initialize_game(std::string input) {
    return execute(input, [](const Json& request) {
        const auto seed = number(request.at("seed"), rules::max_seed);
        Json staff = Json::array();
        for (const auto& spec : rules::staff) staff.push_back(make_staff(spec));
        Json offers = Json::array();
        for (std::size_t i = 0; i < 4; ++i) offers.push_back(make_offer(rules::offers[i]));
        Json state = {
            {"version", rules::version}, {"seed", static_cast<Integer>(seed)}, {"phase", "idle"},
            {"company", {
                {"week", 0}, {"status", "running"}, {"end_reason", nullptr},
                {"initial_funds", rules::initial_funds}, {"funds", rules::initial_funds},
                {"reputation", rules::initial_reputation}, {"staff", staff}, {"finance", empty_finance()}
            }},
            {"offers", offers}, {"recruitment_pool", Json::array()}, {"suppliers", Json::array()},
            {"project", nullptr}, {"pending_event", nullptr}, {"history", Json::array()},
            {"last_project_id", nullptr}, {"company_result", nullptr}, {"preview", nullptr}
        };
        refresh_preview(state);
        return response(std::move(state), u8"新公司成立，等待接手企划。空闲周仍需支付工资与日常运营开支。");
    }, false);
}

std::string start_project(std::string input) {
    return execute(input, [](const Json& request) {
        auto state = request.at("state");
        running_check(state);
        if (state.at("phase") != "idle") wrong_phase();
        const auto id = text(request.at("offer_id"));
        const auto mode = text(request.at("mode"));
        if (mode == "committee") not_allowed(u8"委员会投资与商业分成规则将在后续里程碑实现，当前仅开放承制路线。");
        if (mode != "contract") invalid();
        require(num(request, "investment_percent") == 0);
        const Json* offer_json = nullptr;
        for (const auto& item : state.at("offers")) if (item.at("id") == id) offer_json = &item;
        const auto& custom = optional_slot(state, "custom_offer");
        if (!custom.is_null() && custom.at("id") == id) offer_json = &custom;
        require(offer_json != nullptr);
        const auto& allowed = offer_json->at("allowed_modes");
        if (std::find(allowed.begin(), allowed.end(), Json(mode)) == allowed.end()) not_allowed(u8"该企划不允许所选合作模式。");
        if (optional_amount(*offer_json, "min_reputation") > num(state.at("company"), "reputation")) not_allowed(u8"公司声望尚未达到该企划的接约要求。");
        if (offer_json->contains("required_works")) not_allowed(u8"成绩解锁规则尚未接入，暂不能承接该企划。");
        check_style_execution(*offer_json);
        const auto grant = num(*offer_json, "contract_budget");
        Json stages = Json::object();
        for (std::size_t i = 0; i < rules::stages.size(); ++i) {
            stages[rules::stages[i]] = {
                {"status", i == 0 ? "ready" : "pending"}, {"work_done", 0}, {"quality", 0},
                {"configuration", nullptr}, {"recommended_configuration", nullptr}, {"result", nullptr}
            };
        }
        state["project"] = {
            {"offer", *offer_json}, {"mode", "contract"}, {"investment_percent", 0},
            {"opening_funds", num(state.at("company"), "funds")}, {"start_week", num(state.at("company"), "week")},
            {"deadline_week", add(num(state.at("company"), "week"), num(*offer_json, "duration_weeks"))},
            {"current_stage", std::string(rules::stages[0])}, {"stages", stages},
            {"extension_count", 0}, {"committee_pressure", nullptr}, {"finance", empty_finance(grant)},
            {"temporary_staff", Json::array()}, {"outsourcing", Json::array()}, {"delivery_reason", nullptr}
        };
        state["company"]["funds"] = add(num(state.at("company").at("funds")), grant);
        state["company"]["finance"]["contract_received"] = add(num(state.at("company").at("finance"), "contract_received"), grant);
        state["offers"] = Json::array();
        clear_offer_slots(state);
        state["phase"] = "producing";
        state["project"]["stages"]["script"]["recommended_configuration"] = recommended_configuration(state, "script");
        refresh_preview(state);
        return response(std::move(state), u8"企划已接手，合同预算 " + std::to_string(grant) + u8" 日元一次性到账；投资差额由出品方承担。请完成「脚本」阶段配置后再推进。");
    });
}

std::string apply_decision(std::string input) {
    return execute(input, [](const Json& request) {
        auto state = request.at("state");
        const auto& decision = request.at("decision");
        const auto type = text(decision.at("type"));
        const auto& phase = state.at("phase");
        if (type == "end_company") {
            running_check(state);
            state["company"]["status"] = "closing";
            state["company"]["end_reason"] = "voluntary";
            state["preview"] = nullptr;
            state["offers"] = Json::array();
            clear_offer_slots(state);
            state["pending_event"] = nullptr;
            if (phase == "producing" || phase == "event_pending") {
                state["project"]["delivery_reason"] = "company_closed";
                state["phase"] = "project_ready";
                return response(std::move(state), u8"公司主动结束。在制项目已转入待交付结算，请完成结算后生成经营总结。");
            }
            return response(std::move(state), u8"公司主动结束，进入经营总结；周数未推进，薪资未扣款。");
        }
        running_check(state);
        if (type == "configure_stage") {
            if (phase != "producing") wrong_phase();
            const auto stage = text(decision.at("stage"));
            if (stage != state.at("project").at("current_stage").get<std::string>()) invalid();
            auto& item = state["project"]["stages"][stage];
            if (item.at("status") == "active") locked();
            require(item.at("status") == "ready");
            check_configuration(decision.at("configuration"), state);
            item["configuration"] = decision.at("configuration");
            item["status"] = "active";
            refresh_preview(state);
            return response(std::move(state), u8"阶段方案已锁定，阶段进行期间不可修改；推进前不扣款。");
        }
        if (type == "hire_temporary" || type == "outsource") {
            if (phase != "producing") wrong_phase();
            invalid();
        }
        if (type == "hire_core") {
            if (phase != "idle" && phase != "project_settled") wrong_phase();
            invalid();
        }
        if (type == "request_extension") {
            if (phase != "producing") wrong_phase();
            not_allowed(u8"承制路线不可延期；委员会延期规则在后续里程碑实现。");
        }
        if (type == "raise_salary") {
            if (phase != "idle" && phase != "project_settled") wrong_phase();
            const auto id = text(decision.at("staff_id"));
            const auto count = state.at("company").at("staff").size();
            std::size_t index = count;
            for (std::size_t i = 0; i < count; ++i) if (state["company"]["staff"][i].at("id") == id) index = i;
            require(index < count);
            const auto salary = num(decision, "weekly_salary");
            require(salary > num(state.at("company").at("staff").at(index), "weekly_salary"));
            state["company"]["staff"][index]["weekly_salary"] = salary;
            refresh_preview(state);
            return response(std::move(state), u8"薪资调整自下一次周结算起生效，本周不重复扣款。");
        }
        if (type == "return_to_market") {
            if (phase != "project_settled") wrong_phase();
            state["last_project_id"] = nullptr;
            state["seed"] = static_cast<Integer>(next_seed(static_cast<std::uint32_t>(number(state.at("seed"), rules::max_seed))));
            state["offers"] = generate_offers(state);
            state["phase"] = "idle";
            refresh_preview(state);
            return response(std::move(state), u8"已回到企划市场，本周未推进；空闲周仍需支付固定开支。");
        }
        invalid();
    });
}

std::string advance_week(std::string input) {
    return execute(input, [](const Json& request) {
        auto state = request.at("state");
        running_check(state);
        auto report = zero_report(state);
        if (state.at("phase") == "idle") {
            const auto cost = salary_total(state);
            if (num(state.at("company"), "funds") < cost) {
                close_bankrupt(state);
                report["messages"].push_back(u8"资金不足以支付本周工资与运营开支，公司破产进入结束流程；未扣款、未推进周数、企划未刷新。");
                return Json{{"state", state}, {"report", report}};
            }
            const auto salaries = cost - rules::operations_weekly;
            state["company"]["funds"] = sub(num(state.at("company").at("funds")), cost);
            pay_weekly_costs(state, salaries, 0);
            if (state.contains("pending_proposal")) state["pending_proposal"] = nullptr;
            state["company"]["week"] = add(num(state.at("company").at("week")), 1);
            state["seed"] = static_cast<Integer>(next_seed(static_cast<std::uint32_t>(number(state.at("seed"), rules::max_seed))));
            state["offers"] = generate_offers(state);
            report["week"] = num(state.at("company"), "week");
            report["funds_delta"] = -cost;
            report["costs"]["salary"] = salaries;
            report["costs"]["operations"] = rules::operations_weekly;
            report["messages"].push_back(u8"空闲周结算：支付固定开支 " + std::to_string(cost) + u8" 日元，企划已刷新。");
            if (num(state.at("company"), "week") == rules::max_weeks) {
                state["company"]["status"] = "closing";
                state["company"]["end_reason"] = "time_limit";
                clear_offer_slots(state);
                state["offers"] = Json::array();
                report["messages"].push_back(u8"十年经营期满，公司进入结束流程，请生成经营总结。");
            }
            refresh_preview(state);
            return Json{{"state", state}, {"report", report}};
        }
        if (state.at("phase") != "producing" || !is_producing_active(state)) wrong_phase();
        const auto stage_name = state.at("project").at("current_stage").get<std::string>();
        const auto index = stage_index(stage_name);
        const auto& config = state.at("project").at("stages").at(stage_name).at("configuration");
        check_production_execution(state, config);
        const auto& policy = policy_of(config.at("policy").get<std::string>());
        const auto production = weekly_production_cost(state);
        const auto salaries = salary_total(state) - rules::operations_weekly;
        const auto cost = add(add(salaries, rules::operations_weekly), production);
        if (num(state.at("company"), "funds") < cost) {
            close_bankrupt(state);
            report["messages"].push_back(u8"资金不足以支付本周开支，公司破产进入结束流程；未扣款、未推进周数，项目转入待交付结算。");
            return Json{{"state", state}, {"report", report}};
        }
        const auto& stage_json = state.at("project").at("stages").at(stage_name);
        const auto old_work = num(stage_json, "work_done");
        const auto old_quality = num(stage_json, "quality");
        std::map<std::string, Json> staff_before;
        for (const auto& person : state.at("company").at("staff")) staff_before[person.at("id").get<std::string>()] = person;
        state["company"]["funds"] = sub(num(state.at("company").at("funds")), cost);
        pay_weekly_costs(state, salaries, production);
        const auto required = std::string(rules::abilities[rules::stage_ability[index]]);
        Integer work = 0, quality_sum = 0;
        std::set<std::string> working_ids;
        for (const auto& assignment : config.at("assignments")) {
            const auto id = assignment.at("staff_id").get<std::string>();
            const auto focus = assignment.at("focus").get<std::string>();
            auto* current_person = find_current_staff(state, id);
            require(current_person != nullptr);
            auto& person = *current_person;
            const auto fit = std::string(execution_staff_spec(person).specialty) == required ? rules::specialty_fit : rules::nonspecialty_fit;
            const auto ability = number(person.at("abilities").at(focus), 100);
            auto speed = rules::base_speed * ability * 10;
            speed = scale(speed, fit);
            speed = scale(speed, policy.speed);
            speed = scale(speed, rules::morale_base + rules::morale_scale * static_cast<int>(num(person, "morale")));
            speed = scale(speed, 1000 - rules::fatigue_penalty * static_cast<int>(num(person, "fatigue")));
            const auto points = speed / 1000;
            const auto item_quality = clamp_score(scale(scale(ability, fit), policy.quality));
            work += points;
            quality_sum += points * item_quality;
            working_ids.insert(id);
            if (person.at("employment") == "core") person["experience"][focus] = add(num(person.at("experience").at(focus)), rules::experience_gain[index]);
        }
        const auto workload = num(state.at("project").at("offer").at("workloads"), stage_name.c_str());
        const auto gain = std::min(work, workload - old_work);
        auto& stage = state["project"]["stages"][stage_name];
        stage["work_done"] = old_work + gain;
        if (gain > 0 && work > 0) stage["quality"] = clamp_score((old_quality * old_work + gain * (quality_sum / work)) / (old_work + gain));
        if (index > 0) {
            const auto& previous = state.at("project").at("stages").at(rules::stages[index - 1]);
            if (previous.at("status") == "completed") {
                const auto cap = num(previous.at("result"), "quality") * rules::carry_over_permille / 1000 + rules::carry_over_offset;
                stage["quality"] = std::min(num(stage, "quality"), cap);
            }
        }
        for (auto& person : state["company"]["staff"]) {
            const bool busy = working_ids.count(person.at("id").get<std::string>()) > 0;
            const auto morale_before = num(person, "morale");
            const auto fatigue_before = num(person, "fatigue");
            if (busy) {
                person["fatigue"] = std::min<Integer>(100, fatigue_before + rules::fatigue_work);
                const auto extra = config.at("overtime") == true ? rules::overtime_morale : 0;
                person["morale"] = clamp_score(morale_before + policy.morale - extra);
            } else {
                person["fatigue"] = std::max<Integer>(0, fatigue_before - rules::fatigue_rest);
                person["morale"] = clamp_score(morale_before + rules::rest_morale);
            }
        }
        for (const auto& person : state.at("company").at("staff")) {
            const auto id = person.at("id").get<std::string>();
            const auto& before = staff_before[id];
            report["staff_deltas"].push_back(Json::object());
            auto& entry = report["staff_deltas"].back();
            entry["staff_id"] = id;
            Json experience = Json::object();
            for (auto ability : rules::abilities) experience[ability] = num(person.at("experience").at(ability)) - num(before.at("experience").at(ability));
            entry["experience"] = experience;
            entry["fatigue_delta"] = num(person, "fatigue") - num(before, "fatigue");
            entry["morale_delta"] = num(person, "morale") - num(before, "morale");
        }
        report["stage_deltas"].push_back({{"stage", stage_name}, {"work_done_delta", num(stage, "work_done") - old_work}, {"quality_delta", num(stage, "quality") - old_quality}});
        state["company"]["week"] = add(num(state.at("company").at("week")), 1);
        report["week"] = num(state.at("company"), "week");
        report["funds_delta"] = -cost;
        report["costs"]["salary"] = salaries;
        report["costs"]["operations"] = rules::operations_weekly;
        report["costs"]["production"] = production;
        std::string message = u8"第" + std::to_string(report["week"].get<Integer>()) + u8"周制作完成，支出 " + std::to_string(cost) + u8" 日元。";
        if (num(stage, "work_done") >= workload) {
            complete_stage(state, stage_name, index);
            if (index + 1 < static_cast<int>(rules::stages.size())) {
                const auto next = std::string(rules::stages[index + 1]);
                state["project"]["current_stage"] = next;
                state["project"]["stages"][next]["status"] = "ready";
                state["project"]["stages"][next]["recommended_configuration"] = recommended_configuration(state, next);
                message += u8"「" + stage_name + u8"」阶段完成，下一阶段「" + next + u8"」待配置；请配置后再推进。";
            } else {
                state["project"]["delivery_reason"] = "completed";
                state["project"]["current_stage"] = nullptr;
                state["phase"] = "project_ready";
                message += u8"全部五个阶段完成，作品可交付结算。";
            }
        }
        if (state.at("phase") == "producing" && num(state.at("company"), "week") >= num(state.at("project"), "deadline_week")) {
            state["project"]["delivery_reason"] = "deadline";
            state["phase"] = "project_ready";
            message += u8"已到截止周仍未完成全部阶段，按违约交付进入结算。";
        }
        if (num(state.at("company"), "week") == rules::max_weeks) {
            state["company"]["status"] = "closing";
            state["company"]["end_reason"] = "time_limit";
            state["offers"] = Json::array();
            if (state.at("phase") == "producing") {
                state["project"]["delivery_reason"] = "company_closed";
                state["phase"] = "project_ready";
            }
            message += u8"十年经营期满，公司进入结束流程。";
        }
        refresh_preview(state);
        return Json{{"state", state}, {"report", report}};
    });
}

std::string resolve_event(std::string input) {
    return execute(input, [](const Json& request) -> Json {
        if (request.at("state").at("phase") == "event_pending") not_allowed(u8"事件状态有效，但事件选项效果目录尚未接入，暂不能执行事件选择。");
        throw ApiError{"INVALID_PHASE", u8"当前没有待处理事件；随机事件库将在后续里程碑开放。"};
    });
}

std::string calculate_result(std::string input) {
    return execute(input, [](const Json& request) {
        auto state = request.at("state");
        const auto scope = text(request.at("scope"));
        if (scope == "project") {
            if (state.at("phase") != "project_ready") wrong_phase();
            const auto& project = state.at("project");
            const auto& offer = project.at("offer");
            check_style_execution(offer);
            const auto id = text(offer.at("id"));
            if (project.at("mode") == "committee") not_allowed(u8"委员会渠道结算规则尚未接入，不能按承制规则结算。");
            const auto reason = text(project.at("delivery_reason"));
            Integer weighted = 0;
            for (std::size_t i = 0; i < rules::stages.size(); ++i) weighted += num(project.at("stages").at(rules::stages[i]), "quality") * rules::quality_weights[i];
            const auto quality = weighted / 1000;
            const auto commercial_score = clamp_score((num(offer, "audience_base") * 300 + num(offer, "commercial_potential") * 300 + quality * 400) / 1000);
            const auto revenue = commercial_score * scale_of(text(offer.at("scale"))).revenue_per_point;
            const auto contract = num(project.at("finance"), "contract_received");
            const auto penalty = reason == "completed" ? static_cast<Integer>(0)
                : reason == "deadline" ? scale(contract, static_cast<int>(rules::deadline_penalty_permille))
                : scale(contract, static_cast<int>(rules::closed_penalty_permille));
            if (penalty > 0) {
                state["company"]["funds"] = sub(signed_number(state.at("company").at("funds")), penalty);
                add_cost(state["company"]["finance"], "penalty", penalty);
                add_cost(state["project"]["finance"], "penalty", penalty);
            }
            const auto target = number(offer.at("target_quality"), 100);
            Integer reputation_delta = 0;
            if (reason == "completed") reputation_delta = quality >= target ? rules::success_reputation : rules::below_target_reputation;
            else if (reason == "deadline") reputation_delta = rules::deadline_reputation;
            const auto reputation = num(state.at("company").at("reputation"));
            state["company"]["reputation"] = reputation_delta >= 0 ? add(reputation, reputation_delta) : std::max<Integer>(0, reputation + reputation_delta);
            auto finance = project.at("finance");
            Json team = Json::array();
            std::set<std::string> seen;
            bool has_completed_stage = false;
            for (auto stage_name : rules::stages) {
                const auto& stage = project.at("stages").at(stage_name);
                if (stage.at("status") != "completed") continue;
                has_completed_stage = true;
                for (const auto& member : stage.at("result").at("team")) if (seen.insert(member.at("staff_id").get<std::string>()).second) team.push_back(member);
            }
            if (team.empty() && !has_completed_stage) {
                for (const auto& person : state.at("company").at("staff")) {
                    seen.insert(text(person.at("id")));
                    team.push_back(team_snapshot(person));
                }
            }
            for (auto stage_name : rules::stages) {
                const auto& stage = project.at("stages").at(stage_name);
                if (stage.at("status") != "active") continue;
                for (const auto& assignment : stage.at("configuration").at("assignments")) {
                    const auto staff_id = text(assignment.at("staff_id"));
                    if (!seen.insert(staff_id).second) continue;
                    const auto* person = find_current_staff(state, staff_id);
                    require(person != nullptr);
                    team.push_back(team_snapshot(*person));
                }
            }
            Json record = {
                {"id", id}, {"name", offer.at("name")}, {"source", offer.at("source")}, {"scale", offer.at("scale")},
                {"previous_work_id", offer.at("previous_work_id")}, {"mode", project.at("mode")}, {"investment_percent", 0},
                {"start_week", project.at("start_week")}, {"end_week", num(state.at("company"), "week")},
                {"end_reason", reason}, {"quality_score", quality}, {"commercial_score", commercial_score},
                {"commercial_revenue", revenue}, {"finance", finance},
                {"profit", sub(num(finance, "contract_received"), costs_total(finance.at("costs")))}, {"team", team}, {"stages", project.at("stages")}
            };
            for (auto key : {"origin", "style"}) if (offer.contains(key)) record[key] = offer.at(key);
            state["history"].push_back(record);
            state["last_project_id"] = id;
            state["project"] = nullptr;
            state["phase"] = "project_settled";
            if (signed_number(state.at("company").at("funds")) < 0) {
                state["company"]["status"] = "closing";
                state["company"]["end_reason"] = "bankrupt";
                state["preview"] = nullptr;
            } else refresh_preview(state);
            return Json{{"state", std::move(state)}, {"scope", scope}, {"result", std::move(record)}};
        }
        if (scope != "company") invalid();
        if (state.at("company").at("status") == "running" || !state.at("project").is_null() || state.at("company").at("status") == "ended") wrong_phase();
        auto summary = build_summary(state);
        state["company_result"] = summary;
        state["company"]["status"] = "ended";
        state["phase"] = "company_ended";
        state["offers"] = Json::array();
        state["preview"] = nullptr;
        return Json{{"state", std::move(state)}, {"scope", scope}, {"result", std::move(summary)}};
    });
}
}
