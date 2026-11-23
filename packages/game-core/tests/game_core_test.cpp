#include "game_core.hpp"
#include "game_rules.hpp"
#include "game_validation.hpp"

#include <cstdint>
#include <functional>
#include <string>
#include <vector>
#include <gtest/gtest.h>
#include <nlohmann/json.hpp>

namespace {
using Json = nlohmann::json;
using Method = std::string (*)(std::string);
constexpr std::int64_t max_i = apc::rules::max_integer;

Json call(Method method, const Json& request) {
    auto result = Json::parse(method(request.dump()));
    EXPECT_FALSE(result.contains("error")) << result.dump();
    return result;
}
Json initialize(std::uint32_t seed = 12345) { return call(apc::initialize_game, {{"seed", seed}}).at("state"); }
Json start(std::uint32_t seed = 12345, const char* offer = "proj_ova_01") {
    return call(apc::start_project, {{"state", initialize(seed)}, {"offer_id", offer}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
}
Json configure(const Json& state, const char* policy = "balanced", bool overtime = false) {
    const auto stage = state.at("project").at("current_stage").get<std::string>();
    const auto& recommended = state.at("project").at("stages").at(stage).at("recommended_configuration");
    Json configuration{{"assignments", recommended.at("assignments")}, {"policy", policy}, {"overtime", overtime}};
    return call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "configure_stage"}, {"stage", stage}, {"configuration", configuration}}}}).at("state");
}
Json advance(const Json& state) { return call(apc::advance_week, {{"state", state}}); }
// 现金只能通过记账入口变化；夹具要把存档调到目标现金，必须同时清空账本，否则末笔记录与现金对不平。
void set_cash(Json& state, std::int64_t amount) {
    state["company"]["funds"] = amount;
    state["company"]["cash_log"] = Json::array();
}
Json play_weeks(Json state, int weeks, const char* policy = "balanced") {
    for (int i = 0; i < weeks && state.at("phase") == "producing"; ++i) {
        const auto stage = state.at("project").at("current_stage").get<std::string>();
        if (state.at("project").at("stages").at(stage).at("status") == "ready") state = configure(state, policy);
        state = advance(state).at("state");
    }
    return state;
}
Json play_until_ready(Json state, const char* policy = "balanced") {
    for (int i = 0; i < 60 && state.at("phase") == "producing"; ++i) {
        const auto stage = state.at("project").at("current_stage").get<std::string>();
        if (state.at("project").at("stages").at(stage).at("status") == "ready") state = configure(state, policy);
        state = advance(state).at("state");
    }
    EXPECT_EQ(state.at("phase"), "project_ready");
    return state;
}
std::int64_t costs_total(const Json& finance) {
    std::int64_t total = 0;
    for (auto key : {"salary", "operations", "production", "temporary", "outsourcing", "events", "extension", "penalty"}) total += finance.at("costs").at(key).get<std::int64_t>();
    return total;
}
void expect_error(const std::string& output, const char* code) {
    const auto result = Json::parse(output);
    ASSERT_TRUE(result.is_object()); ASSERT_EQ(result.size(), 1U);
    ASSERT_TRUE(result.contains("error")); ASSERT_TRUE(result["error"].is_object());
    ASSERT_EQ(result["error"].size(), 2U); EXPECT_EQ(result["error"]["code"], code);
    ASSERT_TRUE(result["error"]["message"].is_string()); EXPECT_FALSE(result["error"]["message"].get<std::string>().empty());
}
void expect_validation(const Json& state, bool valid) {
    const auto before = state.dump();
    const auto seed = state.at("seed");
    const auto funds = state.at("company").at("funds");
    const auto week = state.at("company").at("week");
    if (valid) {
        EXPECT_NO_THROW(apc::validate_state(state));
    } else {
        EXPECT_ANY_THROW(apc::validate_state(state));
    }
    EXPECT_EQ(state.dump(), before);
    EXPECT_EQ(state.at("seed"), seed);
    EXPECT_EQ(state.at("company").at("funds"), funds);
    EXPECT_EQ(state.at("company").at("week"), week);
}
void expect_invalid_state(const Json& state) {
    expect_validation(state, false);
    const auto before = state.dump();
    expect_error(apc::start_project(Json{{"state", state}, {"offer_id", "proj_ova_01"}, {"mode", "contract"}, {"investment_percent", 0}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "end_company"}}}}.dump()), "INVALID_INPUT");
    expect_error(apc::advance_week(Json{{"state", state}}.dump()), "INVALID_INPUT");
    expect_error(apc::resolve_event(Json{{"state", state}, {"option_id", "option_dynamic"}}.dump()), "INVALID_INPUT");
    expect_error(apc::calculate_result(Json{{"state", state}, {"scope", "company"}}.dump()), "INVALID_INPUT");
    EXPECT_EQ(state.dump(), before);
}
using Mutations = std::vector<std::function<void(Json&)>>;
void expect_invalid_mutations(const Json& base, const Mutations& mutations) {
    expect_validation(base, true);
    for (std::size_t i = 0; i < mutations.size(); ++i) {
        SCOPED_TRACE(i);
        auto state = base;
        mutations[i](state);
        expect_invalid_state(state);
    }
}
void update_salary_preview(Json& state) {
    if (state.at("preview").is_null()) return;
    std::int64_t salary = 0;
    for (const auto& person : state.at("company").at("staff")) salary += person.at("weekly_salary").get<std::int64_t>();
    auto& preview = state["preview"];
    preview["total_cost"] = preview.at("total_cost").get<std::int64_t>() - preview.at("costs").at("salary").get<std::int64_t>() + salary;
    preview["costs"]["salary"] = salary;
    preview["next_week"] = state.at("company").at("week").get<int>() + 1;
}
Json dynamic_staff(const std::string& id, const char* employment = "core") {
    auto person = initialize().at("company").at("staff").at(0);
    person["id"] = id;
    person["name"] = "Independent creator " + id;
    person["role"] = "scriptwriter";
    person["employment"] = employment;
    person["weekly_salary"] = std::string(employment) == "core" ? 1000 : 0;
    person["project_fee"] = std::string(employment) == "temporary" ? 7500 : 0;
    person["talent_type"] = "ordinary";
    person["clues"] = Json::array({"Flexible background", "Independent practice"});
    person["traits"] = Json::array({"patient"});
    person["fatigue"] = 16;
    person["morale"] = 50;
    person["departure_warning"] = true;
    for (auto ability : apc::rules::abilities) {
        person["abilities"][ability] = 1;
        person["potential"][ability] = 100;
        person["experience"][ability] = 123;
        person["revealed_potential"][ability] = true;
    }
    return person;
}
Json assignment(const Json& person, const char* focus = "planning") {
    return {{"staff_id", person.at("id")}, {"role", person.at("role")}, {"focus", focus}};
}
Json configuration(const Json& assignments = Json::array()) {
    return {{"assignments", assignments}, {"policy", "balanced"}, {"overtime", false}};
}
Json configure_with(const Json& state, const Json& config) {
    return call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "configure_stage"},
        {"stage", state.at("project").at("current_stage")}, {"configuration", config}}}}).at("state");
}
Json dynamic_offer(const std::string& id) {
    auto offer = initialize().at("offers").at(0);
    offer["id"] = id;
    offer["name"] = "Independent adaptation " + id;
    offer["source"] = "game";
    offer["scale"] = "short";
    offer["total_investment"] = 12345679;
    offer["contract_budget"] = 2469135;
    offer["duration_weeks"] = 19;
    offer["target_quality"] = 1;
    offer["audience_base"] = 0;
    offer["commercial_potential"] = 100;
    offer["risk"] = "high";
    for (auto stage : apc::rules::stages) offer["workloads"][stage] = 1;
    return offer;
}
Json supplier() {
    return {{"id", "supplier_dynamic"}, {"name", "Independent studio"}, {"specialties", {"planning", "management"}},
        {"capacity", 100}, {"quality", 80}, {"speed", 7}, {"unit_price", 123}, {"reliability", 100}, {"unlocked", true}};
}
Json outsource_task() {
    return {{"id", "task_dynamic"}, {"supplier_id", "supplier_dynamic"}, {"stage", "script"}, {"ability", "planning"},
        {"work_total", 10}, {"work_done", 0}, {"mode", "normal"}, {"fee_paid", 1230}, {"due_week", 1000}, {"status", "active"}};
}
Json committee_member(const std::string& id, int share) {
    return {{"id", id}, {"name", "Partner " + id}, {"share_percent", share}, {"channels", {"publisher", "music"}}};
}
void make_committee(Json& state, int investment = 30) {
    auto& project = state["project"];
    project["offer"]["allowed_modes"] = Json::array({"contract", "committee"});
    project["mode"] = "committee";
    project["investment_percent"] = investment;
    project["committee_pressure"] = 40;
    project["finance"]["contract_received"] = 0;
    project["finance"]["investment_paid"] = 1000000;
    project.erase("committee");
}
Json pending_event() {
    return {{"id", "event_dynamic"}, {"category", "budget"}, {"stage", "script"}, {"title", "Budget review"},
        {"description", "A signed budget threshold was crossed."}, {"trigger", {{"metric", "cash_delta"}, {"value", -123}, {"threshold", -100}}},
        {"options", Json::array({{{"id", "option_dynamic"}, {"label", "Review"}, {"cost", 0}, {"allows_reconfigure", true}, {"disabled_reason", nullptr}},
            {{"id", "option_deferred"}, {"label", "Defer"}, {"cost", 25}, {"allows_reconfigure", false}, {"disabled_reason", "Unavailable"}}})}};
}
Json roster_snapshots(const Json& state) {
    Json team = Json::array();
    const auto append = [&team](const Json& roster) {
        for (const auto& person : roster) team.push_back({{"staff_id", person.at("id")}, {"name", person.at("name")},
            {"role", person.at("role")}, {"employment", person.at("employment")}, {"abilities", person.at("abilities")}});
    };
    append(state.at("company").at("staff"));
    if (!state.at("project").is_null()) append(state.at("project").at("temporary_staff"));
    return team;
}
void expect_mode_blocked(Method method, const Json& request, bool specialty = false) {
    const auto before = request.dump();
    const auto output = method(before);
    expect_error(output, "MODE_NOT_ALLOWED");
    if (specialty) {
        const auto message = Json::parse(output).at("error").at("message").get<std::string>();
        EXPECT_TRUE(message.find("specialty") != std::string::npos || message.find(u8"专业") != std::string::npos) << message;
    }
    EXPECT_EQ(request.dump(), before);
}
}

TEST(Initialize, V3CompanyStateAndFourOffers) {
    for (auto seed : {0U, 12345U, 0xffffffffU}) {
        const auto state = initialize(seed);
        EXPECT_EQ(state.at("seed"), seed); EXPECT_EQ(state.at("version"), 3);
        EXPECT_EQ(state.at("phase"), "idle");
        EXPECT_EQ(state.at("company").at("week"), 0); EXPECT_EQ(state.at("company").at("status"), "running");
        EXPECT_TRUE(state.at("company").at("end_reason").is_null());
        EXPECT_EQ(state.at("company").at("funds"), 2000000); EXPECT_EQ(state.at("company").at("initial_funds"), 2000000);
        EXPECT_EQ(state.at("company").at("reputation"), 100); EXPECT_EQ(state.at("company").at("staff").size(), 4U);
        EXPECT_EQ(state.at("offers").size(), 4U); EXPECT_TRUE(state.at("project").is_null());
        EXPECT_TRUE(state.at("pending_event").is_null()); EXPECT_TRUE(state.at("history").empty());
        EXPECT_TRUE(state.at("recruitment_pool").empty()); EXPECT_TRUE(state.at("suppliers").empty());
        EXPECT_TRUE(state.at("last_project_id").is_null()); EXPECT_TRUE(state.at("company_result").is_null());
        EXPECT_EQ(state.at("preview").at("next_week"), 1); EXPECT_EQ(state.at("preview").at("total_cost"), 180000);
    }
    const auto state = initialize();
    EXPECT_EQ(state.at("offers").at(0).at("id"), "proj_ova_01");
    EXPECT_EQ(state.at("offers").at(0).at("contract_budget"), 4000000);
    EXPECT_EQ(state.at("offers").at(0).at("allowed_modes"), Json({"contract"}));
    EXPECT_EQ(state.at("offers").at(2).at("contract_budget"), 6000000);
    EXPECT_EQ(state.at("company").at("staff").at(0).at("weekly_salary"), 45000);
    EXPECT_EQ(state.at("company").at("staff").at(0).at("abilities").at("direction"), 75);
    EXPECT_EQ(state.at("company").at("staff").at(0).at("morale"), 80);
}
TEST(StartProject, GrantGatesModesAndErrors) {
    const auto state = initialize();
    expect_error(apc::start_project(Json{{"state", state}, {"offer_id", "unknown"}, {"mode", "contract"}, {"investment_percent", 0}}.dump()), "INVALID_INPUT");
    expect_error(apc::start_project(Json{{"state", state}, {"offer_id", "proj_ova_01"}, {"mode", "committee"}, {"investment_percent", 0}}.dump()), "MODE_NOT_ALLOWED");
    expect_error(apc::start_project(Json{{"state", state}, {"offer_id", "proj_ova_01"}, {"mode", "self_funded"}, {"investment_percent", 0}}.dump()), "INVALID_INPUT");
    expect_error(apc::start_project(Json{{"state", state}, {"offer_id", "proj_ova_01"}, {"mode", "contract"}, {"investment_percent", 5}}.dump()), "INVALID_INPUT");
    const auto tv = call(apc::start_project, {{"state", state}, {"offer_id", "proj_tv_01"}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    EXPECT_EQ(tv.at("company").at("funds"), 8000000);
    EXPECT_EQ(tv.at("project").at("deadline_week"), 24);
    const auto output = call(apc::start_project, {{"state", state}, {"offer_id", "proj_ova_01"}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    EXPECT_EQ(output.at("company").at("funds"), 6000000);
    EXPECT_EQ(output.at("company").at("finance").at("contract_received"), 4000000);
    EXPECT_EQ(output.at("project").at("start_week"), 0); EXPECT_EQ(output.at("project").at("deadline_week"), 14);
    EXPECT_EQ(output.at("project").at("opening_funds"), 2000000);
    EXPECT_EQ(output.at("phase"), "producing"); EXPECT_TRUE(output.at("offers").empty());
    EXPECT_EQ(output.at("project").at("stages").at("script").at("status"), "ready");
    EXPECT_EQ(output.at("project").at("stages").at("postproduction").at("status"), "pending");
    EXPECT_TRUE(output.at("project").at("stages").at("script").at("recommended_configuration").is_object());
    EXPECT_TRUE(output.at("preview").is_null());
    expect_error(apc::start_project(Json{{"state", output}, {"offer_id", "proj_short_01"}, {"mode", "contract"}, {"investment_percent", 0}}.dump()), "INVALID_PHASE");
}
TEST(Decision, ConfigureLocksStageAndChargesNothing) {
    const auto state = start();
    const auto next = configure(state);
    EXPECT_EQ(next.at("company").at("funds"), state.at("company").at("funds"));
    EXPECT_EQ(next.at("project").at("stages").at("script").at("status"), "active");
    EXPECT_EQ(next.at("preview").at("total_cost"), 210000);
    expect_error(apc::apply_decision(Json{{"state", next}, {"decision", {{"type", "configure_stage"}, {"stage", "script"}, {"configuration", Json::object()}}}}.dump()), "STAGE_LOCKED");
    expect_error(apc::apply_decision(Json{{"state", next}, {"decision", {{"type", "configure_stage"}, {"stage", "storyboard"}, {"configuration", Json::object()}}}}.dump()), "INVALID_INPUT");
    Json good{{"assignments", Json::array({{{"staff_id", "staff_01"}, {"role", "director"}, {"focus", "planning"}}})}, {"policy", "balanced"}, {"overtime", false}};
    Json bad_staff = good; bad_staff["assignments"][0]["staff_id"] = "staff_99";
    Json bad_role = good; bad_role["assignments"][0]["role"] = "producer";
    Json bad_focus = good; bad_focus["assignments"][0]["focus"] = "singing";
    Json bad_policy = good; bad_policy["policy"] = "rush";
    Json bad_overtime = good; bad_overtime["overtime"] = 1;
    for (const auto& configuration : {bad_staff, bad_role, bad_focus, bad_policy, bad_overtime})
        expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "configure_stage"}, {"stage", "script"}, {"configuration", configuration}}}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", initialize()}, {"decision", {{"type", "configure_stage"}, {"stage", "script"}, {"configuration", good}}}}.dump()), "INVALID_PHASE");
}
TEST(AdvanceWeek, IdlePaysFixedCostsAndRefreshesOffers) {
    const auto state = initialize();
    const auto output = advance(state);
    const auto& next = output.at("state");
    EXPECT_EQ(next.at("company").at("week"), 1);
    EXPECT_EQ(next.at("company").at("funds"), 1820000);
    EXPECT_EQ(next.at("seed"), 87628868U);
    EXPECT_EQ(next.at("offers").at(0).at("id"), "proj_short_03");
    EXPECT_EQ(next.at("offers").at(3).at("id"), "proj_movie_02");
    EXPECT_EQ(output.at("report").at("funds_delta"), -180000);
    EXPECT_EQ(output.at("report").at("costs").at("salary"), 150000);
    EXPECT_EQ(output.at("report").at("costs").at("operations"), 30000);
    EXPECT_TRUE(output.at("report").at("stage_deltas").empty());
    EXPECT_TRUE(output.at("report").at("staff_deltas").empty());
    EXPECT_EQ(next.at("preview").at("total_cost"), 180000);

    auto poor = initialize(); set_cash(poor, 179999);
    const auto bankrupt = advance(poor);
    EXPECT_EQ(bankrupt.at("state").at("company").at("status"), "closing");
    EXPECT_EQ(bankrupt.at("state").at("company").at("end_reason"), "bankrupt");
    EXPECT_EQ(bankrupt.at("state").at("company").at("funds"), 179999);
    EXPECT_EQ(bankrupt.at("state").at("company").at("week"), 0);
    EXPECT_EQ(bankrupt.at("state").at("seed"), poor.at("seed"));
    EXPECT_TRUE(bankrupt.at("state").at("offers").empty());
    EXPECT_TRUE(bankrupt.at("state").at("preview").is_null());
    EXPECT_EQ(bankrupt.at("report").at("funds_delta"), 0);
    EXPECT_EQ(bankrupt.at("report").at("costs").at("salary"), 0);
    EXPECT_EQ(bankrupt.at("report").at("messages").size(), 1U);
}
TEST(AdvanceWeek, GoldenProductionAndStaffDeltas) {
    const auto configured = configure(start());
    const auto output = advance(configured);
    const auto& next = output.at("state");
    EXPECT_EQ(next.at("seed"), configured.at("seed"));
    EXPECT_EQ(next.at("company").at("week"), 1);
    EXPECT_EQ(next.at("company").at("funds"), 5790000);
    const auto& stage = next.at("project").at("stages").at("script");
    EXPECT_EQ(stage.at("work_done"), 10); EXPECT_EQ(stage.at("quality"), 42);
    EXPECT_EQ(stage.at("status"), "active");
    EXPECT_EQ(next.at("project").at("finance").at("costs").at("salary"), 150000);
    EXPECT_EQ(next.at("project").at("finance").at("costs").at("production"), 30000);
    EXPECT_EQ(next.at("company").at("staff").at(0).at("morale"), 78);
    EXPECT_EQ(next.at("company").at("staff").at(0).at("fatigue"), 4);
    EXPECT_EQ(next.at("company").at("staff").at(0).at("experience").at("planning"), 2);
    EXPECT_EQ(output.at("report").at("funds_delta"), -210000);
    EXPECT_EQ(output.at("report").at("costs").at("production"), 30000);
    ASSERT_EQ(output.at("report").at("stage_deltas").size(), 1U);
    EXPECT_EQ(output.at("report").at("stage_deltas").at(0).at("stage"), "script");
    EXPECT_EQ(output.at("report").at("stage_deltas").at(0).at("work_done_delta"), 10);
    EXPECT_EQ(output.at("report").at("stage_deltas").at(0).at("quality_delta"), 42);
    ASSERT_EQ(output.at("report").at("staff_deltas").size(), 4U);
    EXPECT_EQ(output.at("report").at("staff_deltas").at(0).at("morale_delta"), -2);
    EXPECT_EQ(output.at("report").at("staff_deltas").at(0).at("fatigue_delta"), 4);
    EXPECT_EQ(output.at("report").at("staff_deltas").at(0).at("experience").at("planning"), 2);
    EXPECT_EQ(output.at("report").at("staff_deltas").at(1).at("experience").at("drawing"), 0);
}
TEST(AdvanceWeek, StageCompletionAndReadiness) {
    const auto state = play_weeks(configure(start()), 3);
    EXPECT_EQ(state.at("project").at("stages").at("script").at("status"), "completed");
    const auto& result = state.at("project").at("stages").at("script").at("result");
    EXPECT_EQ(result.at("weeks_spent"), 3); EXPECT_EQ(result.at("quality"), 42);
    EXPECT_EQ(result.at("costs").at("production"), 90000); EXPECT_EQ(result.at("team").size(), 4U);
    EXPECT_EQ(state.at("project").at("current_stage"), "storyboard");
    EXPECT_EQ(state.at("project").at("stages").at("storyboard").at("status"), "ready");
    EXPECT_TRUE(state.at("project").at("stages").at("storyboard").at("recommended_configuration").is_object());
    EXPECT_TRUE(state.at("preview").is_null());
    expect_error(apc::advance_week(Json{{"state", state}}.dump()), "INVALID_PHASE");
}
TEST(AdvanceWeek, OvertimeCostsMoraleButNotSpeed) {
    const auto normal = advance(configure(start())).at("state");
    const auto overtime = advance(configure(start(), "balanced", true)).at("state");
    EXPECT_EQ(overtime.at("company").at("funds"), 5690000);
    EXPECT_EQ(overtime.at("project").at("finance").at("costs").at("production"), 130000);
    EXPECT_EQ(overtime.at("project").at("stages").at("script").at("work_done"), normal.at("project").at("stages").at("script").at("work_done"));
    EXPECT_EQ(normal.at("company").at("staff").at(0).at("morale"), 78);
    EXPECT_EQ(overtime.at("company").at("staff").at(0).at("morale"), 72);
}
TEST(AdvanceWeek, PoliciesTradeSpeedQualityCostMorale) {
    const auto quality = advance(configure(start(), "quality")).at("state");
    const auto balanced = advance(configure(start())).at("state");
    const auto deadline = advance(configure(start(), "deadline")).at("state");
    EXPECT_EQ(quality.at("project").at("stages").at("script").at("work_done"), 7);
    EXPECT_EQ(balanced.at("project").at("stages").at("script").at("work_done"), 10);
    EXPECT_EQ(deadline.at("project").at("stages").at("script").at("work_done"), 15);
    EXPECT_EQ(quality.at("project").at("stages").at("script").at("quality"), 54);
    EXPECT_EQ(balanced.at("project").at("stages").at("script").at("quality"), 42);
    EXPECT_EQ(deadline.at("project").at("stages").at("script").at("quality"), 33);
    EXPECT_EQ(quality.at("project").at("finance").at("costs").at("production"), 33000);
    EXPECT_EQ(deadline.at("project").at("finance").at("costs").at("production"), 27000);
    EXPECT_LT(balanced.at("company").at("staff").at(0).at("morale"), quality.at("company").at("staff").at(0).at("morale"));
    EXPECT_LT(deadline.at("company").at("staff").at(0).at("morale"), balanced.at("company").at("staff").at(0).at("morale"));
}
TEST(AdvanceWeek, QualityCarriesOverCappedByPreviousStage) {
    const auto capped = [&] {
        auto state = play_weeks(configure(start()), 3);
        state["project"]["stages"]["script"]["result"]["quality"] = 10;
        return advance(configure(state, "quality")).at("state");
    }();
    EXPECT_EQ(capped.at("project").at("stages").at("storyboard").at("quality"), 46);
    EXPECT_EQ(capped.at("project").at("stages").at("storyboard").at("work_done"), 11);
    const auto uncapped = advance(configure(play_weeks(configure(start()), 3), "quality")).at("state");
    EXPECT_EQ(uncapped.at("project").at("stages").at("storyboard").at("quality"), 65);  // 42×60%+40 封顶
}
TEST(AdvanceWeek, DeadlineAndBankruptcyAndTimeLimit) {
    auto state = configure(start());
    state["project"]["deadline_week"] = 2;
    state["project"]["offer"]["duration_weeks"] = 2;
    const auto late = play_weeks(state, 2);
    EXPECT_EQ(late.at("phase"), "project_ready");
    EXPECT_EQ(late.at("project").at("delivery_reason"), "deadline");
    EXPECT_EQ(late.at("company").at("week"), 2);
    EXPECT_EQ(late.at("project").at("stages").at("script").at("work_done"), 20);

    auto broke = configure(start()); set_cash(broke, 209999);
    const auto eventless = advance(broke).at("state");
    EXPECT_EQ(eventless.at("company").at("status"), "closing");
    EXPECT_EQ(eventless.at("company").at("end_reason"), "bankrupt");
    EXPECT_EQ(eventless.at("phase"), "project_ready");
    EXPECT_EQ(eventless.at("project").at("delivery_reason"), "company_closed");
    EXPECT_EQ(eventless.at("company").at("funds"), 209999);
    EXPECT_EQ(eventless.at("company").at("week"), 0);
    EXPECT_EQ(eventless.at("project").at("stages").at("script").at("work_done"), 0);
    EXPECT_TRUE(eventless.at("preview").is_null());

    auto long_game = initialize(); set_cash(long_game, 100000000);
    for (int week = 0; week < 519; ++week) long_game = advance(long_game).at("state");
    EXPECT_EQ(long_game.at("company").at("week"), 519);
    EXPECT_EQ(long_game.at("company").at("status"), "running");
    long_game = advance(long_game).at("state");
    EXPECT_EQ(long_game.at("company").at("week"), 520);
    EXPECT_EQ(long_game.at("company").at("status"), "closing");
    EXPECT_EQ(long_game.at("company").at("end_reason"), "time_limit");
    EXPECT_EQ(long_game.at("company").at("funds"), 100000000 - 520 * 180000);
    EXPECT_TRUE(long_game.at("offers").empty());
    expect_error(apc::advance_week(Json{{"state", long_game}}.dump()), "COMPANY_ENDED");
    const auto summary = call(apc::calculate_result, {{"state", long_game}, {"scope", "company"}});
    EXPECT_EQ(summary.at("result").at("weeks"), 520);
    EXPECT_EQ(summary.at("result").at("rating"), "stable");
    EXPECT_TRUE(summary.at("result").at("best_work_id").is_null());
}
TEST(CalculateResult, DeadlinePenaltyGolden) {
    auto state = configure(start());
    state["project"]["deadline_week"] = 2;
    state["project"]["offer"]["duration_weeks"] = 2;
    state = play_weeks(state, 2);
    const auto output = call(apc::calculate_result, {{"state", state}, {"scope", "project"}});
    const auto& receipt = output.at("result");
    EXPECT_EQ(receipt.at("end_reason"), "deadline");
    EXPECT_EQ(receipt.at("quality_score"), 6);
    EXPECT_EQ(receipt.at("commercial_score"), 36);
    EXPECT_EQ(receipt.at("commercial_revenue"), 540000);
    EXPECT_EQ(receipt.at("finance").at("costs").at("penalty"), 800000);
    EXPECT_EQ(receipt.at("profit"), 2780000);
    EXPECT_EQ(receipt.at("id"), "proj_ova_01");
    EXPECT_EQ(receipt.at("team").size(), 4U);
    EXPECT_EQ(output.at("state").at("company").at("funds"), 4780000);
    EXPECT_EQ(output.at("state").at("company").at("reputation"), 95);
    EXPECT_EQ(output.at("state").at("phase"), "project_settled");
    EXPECT_TRUE(output.at("state").at("project").is_null());
    EXPECT_EQ(output.at("state").at("last_project_id"), "proj_ova_01");
    EXPECT_EQ(output.at("state").at("history").size(), 1U);
    expect_error(apc::calculate_result(Json{{"state", output.at("state")}, {"scope", "project"}}.dump()), "INVALID_PHASE");
}
TEST(CalculateResult, InvariantsAndReturnToMarket) {
    const auto state = play_until_ready(configure(start(), "deadline"));
    EXPECT_GE(state.at("company").at("week"), 1);
    const auto output = call(apc::calculate_result, {{"state", state}, {"scope", "project"}});
    const auto& receipt = output.at("result");
    const auto& settled = output.at("state");
    EXPECT_EQ(receipt.at("profit").get<std::int64_t>(), receipt.at("finance").at("contract_received").get<std::int64_t>() - costs_total(receipt.at("finance")));
    EXPECT_EQ(settled.at("company").at("funds").get<std::int64_t>(), settled.at("company").at("initial_funds").get<std::int64_t>()
        + settled.at("company").at("finance").at("contract_received").get<std::int64_t>() - costs_total(settled.at("company").at("finance")));
    const auto returned = call(apc::apply_decision, {{"state", settled}, {"decision", {{"type", "return_to_market"}}}}).at("state");
    EXPECT_EQ(returned.at("phase"), "idle");
    EXPECT_TRUE(returned.at("last_project_id").is_null());
    EXPECT_EQ(returned.at("offers").size(), 4U);
    EXPECT_EQ(returned.at("seed"), 87628868U);
    for (const auto& offer : returned.at("offers")) EXPECT_NE(offer.at("id").get<std::string>(), std::string("proj_ova_01"));
    expect_error(apc::calculate_result(Json{{"state", start()}, {"scope", "project"}}.dump()), "INVALID_PHASE");
    expect_error(apc::calculate_result(Json{{"state", start()}, {"scope", "company"}}.dump()), "INVALID_PHASE");
    expect_error(apc::calculate_result(Json{{"state", initialize()}, {"scope", "unknown"}}.dump()), "INVALID_INPUT");
    expect_error(apc::calculate_result(Json{{"state", initialize()}, {"scope", "company"}}.dump()), "INVALID_PHASE");
}
namespace {
// 五阶段各 1 工作量、19 周工期：能在截止周前跑完全部阶段，交付原因为 completed。
Json completed_ready(std::uint32_t seed = 12345, const char* id = "dynamic_reputation", int target_quality = 1) {
    auto idle = initialize(seed);
    auto offer = dynamic_offer(id);
    offer["target_quality"] = target_quality;
    idle["offers"][0] = offer;
    expect_validation(idle, true);
    const auto state = call(apc::start_project, {{"state", idle}, {"offer_id", id}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    return play_until_ready(state);
}
// 两周工期配三周以上的实际产能：必然按 deadline 违约交付，声望按负向变化处理。
Json deadline_ready(Json idle = initialize()) {
    auto state = configure(call(apc::start_project, {{"state", idle}, {"offer_id", "proj_ova_01"}, {"mode", "contract"}, {"investment_percent", 0}}).at("state"));
    state["project"]["deadline_week"] = 2;
    state["project"]["offer"]["duration_weeks"] = 2;
    return play_weeks(state, 2);
}
}
TEST(Reputation, InitialValueIsOneHundred) {
    for (auto seed : {0U, 12345U, 0xffffffffU}) {
        const auto state = initialize(seed);
        EXPECT_EQ(state.at("company").at("reputation"), 100);
        expect_validation(state, true);
    }
}
TEST(Reputation, CompletedSettlementAboveTargetAdds) {
    const auto ready = completed_ready();
    EXPECT_EQ(ready.at("project").at("delivery_reason"), "completed");
    const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    EXPECT_GE(output.at("result").at("quality_score"), 1);
    EXPECT_EQ(output.at("state").at("company").at("reputation"), 110);
    expect_validation(output.at("state"), true);
}
TEST(Reputation, CompletedSettlementBelowTargetAddsLess) {
    const auto ready = completed_ready(12345, "dynamic_below_target", 100);
    EXPECT_EQ(ready.at("project").at("delivery_reason"), "completed");
    const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    EXPECT_LT(output.at("result").at("quality_score"), 100);
    EXPECT_EQ(output.at("state").at("company").at("reputation"), 103);
    expect_validation(output.at("state"), true);
}
TEST(Reputation, DeadlineSettlementSubtracts) {
    const auto ready = deadline_ready();
    EXPECT_EQ(ready.at("project").at("delivery_reason"), "deadline");
    const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    EXPECT_EQ(output.at("state").at("company").at("reputation"), 95);
    expect_validation(output.at("state"), true);
}
TEST(Reputation, ClosedDeliveryWithoutReputationRuleStaysUnchanged) {
    auto state = configure(start());
    set_cash(state, 209999);
    state = advance(state).at("state");
    EXPECT_EQ(state.at("project").at("delivery_reason"), "company_closed");
    const auto output = call(apc::calculate_result, {{"state", state}, {"scope", "project"}});
    EXPECT_EQ(output.at("state").at("company").at("reputation"), 100);
    expect_validation(output.at("state"), true);
}
TEST(Reputation, FloorAtZeroNeverNegative) {
    for (auto start_value : {0, 3, 5}) {
        SCOPED_TRACE(start_value);
        auto ready = deadline_ready();
        ready["company"]["reputation"] = start_value;
        expect_validation(ready, true);
        const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
        EXPECT_EQ(output.at("state").at("company").at("reputation"), 0);
        expect_validation(output.at("state"), true);
    }
}
TEST(Reputation, NoUpperCapBeforeSafeIntegerCeiling) {
    for (auto start_value : {max_i - 10, std::int64_t{9007199254740000}}) {
        SCOPED_TRACE(start_value);
        auto ready = completed_ready();
        ready["company"]["reputation"] = start_value;
        expect_validation(ready, true);
        const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
        EXPECT_EQ(output.at("state").at("company").at("reputation"), start_value + 10);
        expect_validation(output.at("state"), true);
    }
    auto idle = initialize();
    idle["company"]["reputation"] = max_i;
    expect_validation(idle, true);
}
TEST(Reputation, OverflowAtSafeIntegerCeilingIsAtomic) {
    auto ready = completed_ready();
    ready["company"]["reputation"] = max_i;
    expect_validation(ready, true);
    const auto before = ready.dump();
    expect_error(apc::calculate_result(Json{{"state", ready}, {"scope", "project"}}.dump()), "INVALID_INPUT");
    EXPECT_EQ(ready.dump(), before);
}
TEST(Reputation, InvalidValuesRejectedWithoutAnyWrite) {
    expect_invalid_mutations(initialize(), {
        [](Json& s) { s["company"]["reputation"] = -1; },
        [](Json& s) { s["company"]["reputation"] = -max_i; },
        [](Json& s) { s["company"]["reputation"] = 1.5; },
        [](Json& s) { s["company"]["reputation"] = nullptr; },
        [](Json& s) { s["company"]["reputation"] = "100"; },
        [](Json& s) { s["company"]["reputation"] = max_i + 1; }
    });
}
TEST(Reputation, DoesNotChangeWithoutSettlement) {
    auto state = initialize();
    for (int week = 1; week <= 8; ++week) {
        state = advance(state).at("state");
        EXPECT_EQ(state.at("company").at("week"), week);
        EXPECT_EQ(state.at("company").at("reputation"), 100);
    }
    const auto producing = play_weeks(configure(start()), 3);
    EXPECT_EQ(producing.at("company").at("week"), 3);
    EXPECT_EQ(producing.at("company").at("reputation"), 100);
}
TEST(Reputation, SameSeedAndActionsProduceSameResult) {
    for (auto seed : {0U, 12345U, 0xffffffffU}) {
        const auto first = Json::parse(apc::calculate_result(Json{{"state", completed_ready(seed)}, {"scope", "project"}}.dump()));
        play_until_ready(configure(start(4242)));
        const auto second = Json::parse(apc::calculate_result(Json{{"state", completed_ready(seed)}, {"scope", "project"}}.dump()));
        EXPECT_EQ(first, second) << "seed " << seed;
        EXPECT_EQ(second.at("state").at("company").at("reputation"), 110);
    }
}
TEST(Reputation, SavesWrittenBeforeTheInitialChangeRemainPlayable) {
    auto ready = deadline_ready();
    ready["company"]["reputation"] = 0;  // 初始值调整之前生成的 v3 存档
    expect_validation(ready, true);
    const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    EXPECT_EQ(output.at("state").at("company").at("reputation"), 0);
    expect_validation(output.at("state"), true);
}
TEST(Endings, VoluntaryEndSettlesPendingProjectThenSummary) {
    auto state = play_weeks(configure(start()), 1);
    state = call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "end_company"}}}}).at("state");
    EXPECT_EQ(state.at("company").at("status"), "closing");
    EXPECT_EQ(state.at("company").at("end_reason"), "voluntary");
    EXPECT_EQ(state.at("phase"), "project_ready");
    EXPECT_EQ(state.at("project").at("delivery_reason"), "company_closed");
    EXPECT_EQ(state.at("company").at("week"), 1);
    state = call(apc::calculate_result, {{"state", state}, {"scope", "project"}}).at("state");
    EXPECT_EQ(state.at("company").at("funds"), 5390000);
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "return_to_market"}}}}.dump()), "COMPANY_ENDED");
    const auto ended = call(apc::calculate_result, {{"state", state}, {"scope", "company"}});
    EXPECT_EQ(ended.at("state").at("phase"), "company_ended");
    EXPECT_EQ(ended.at("state").at("company").at("status"), "ended");
    EXPECT_EQ(ended.at("result").at("reason"), "voluntary");
    EXPECT_EQ(ended.at("result").at("total_projects"), 1);
    EXPECT_EQ(ended.at("result").at("best_work_id"), "proj_ova_01");
    EXPECT_EQ(ended.at("result").at("final_funds"), 5390000);
    EXPECT_EQ(ended.at("result").at("net_cash_change"), 3390000);
    EXPECT_EQ(ended.at("result").at("rating"), "stable");
    EXPECT_EQ(ended.at("state").at("company_result"), ended.at("result"));
    expect_error(apc::calculate_result(Json{{"state", ended.at("state")}, {"scope", "company"}}.dump()), "INVALID_PHASE");
    expect_error(apc::advance_week(Json{{"state", ended.at("state")}}.dump()), "COMPANY_ENDED");
    expect_error(apc::apply_decision(Json{{"state", ended.at("state")}, {"decision", {{"type", "end_company"}}}}.dump()), "COMPANY_ENDED");

    auto idle = call(apc::apply_decision, {{"state", initialize()}, {"decision", {{"type", "end_company"}}}}).at("state");
    EXPECT_EQ(idle.at("phase"), "idle"); EXPECT_TRUE(idle.at("offers").empty());
    idle = call(apc::calculate_result, {{"state", idle}, {"scope", "company"}}).at("state");
    EXPECT_EQ(idle.at("phase"), "company_ended");
    EXPECT_EQ(idle.at("company_result").at("rating"), "small");
    EXPECT_TRUE(idle.at("company_result").at("best_work_id").is_null());
    EXPECT_EQ(idle.at("company_result").at("total_projects"), 0);
}
TEST(Endings, BankruptSettlementGoesNegativeAndSummaryFails) {
    auto state = configure(start()); set_cash(state, 209999);
    state = advance(state).at("state");
    state = call(apc::calculate_result, {{"state", state}, {"scope", "project"}}).at("state");
    EXPECT_EQ(state.at("company").at("funds"), -190001);
    EXPECT_EQ(state.at("company").at("status"), "closing");
    EXPECT_EQ(state.at("company").at("end_reason"), "bankrupt");
    const auto ended = call(apc::calculate_result, {{"state", state}, {"scope", "company"}});
    EXPECT_EQ(ended.at("result").at("rating"), "failed");
    EXPECT_EQ(ended.at("result").at("reason"), "bankrupt");
    EXPECT_EQ(ended.at("result").at("net_cash_change"), -2190001);
}
TEST(Decisions, M1RejectedActions) {
    const auto state = start();
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "request_extension"}}}}.dump()), "MODE_NOT_ALLOWED");
    expect_error(apc::apply_decision(Json{{"state", initialize()}, {"decision", {{"type", "hire_core"}, {"candidate_id", "cand_01"}}}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", initialize()}, {"decision", {{"type", "hire_temporary"}, {"candidate_id", "cand_01"}}}}.dump()), "INVALID_PHASE");
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "hire_temporary"}, {"candidate_id", "cand_01"}}}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "outsource"}, {"supplier_id", "sup_01"}, {"stage", "script"}}}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", initialize()}, {"decision", {{"type", "request_extension"}}}}.dump()), "INVALID_PHASE");
    expect_error(apc::resolve_event(Json{{"state", state}, {"option_id", "opt_a"}}.dump()), "INVALID_PHASE");
    auto tampered = state; tampered["phase"] = "event_pending"; tampered["pending_event"] = Json::object();
    expect_error(apc::resolve_event(Json{{"state", tampered}, {"option_id", "opt_a"}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "assign"}, {"staff_id", "staff_01"}, {"assignment", "rest"}}}}.dump()), "INVALID_INPUT");

    auto raised = call(apc::apply_decision, {{"state", initialize()}, {"decision", {{"type", "raise_salary"}, {"staff_id", "staff_01"}, {"weekly_salary", 50000}}}}).at("state");
    EXPECT_EQ(raised.at("company").at("staff").at(0).at("weekly_salary"), 50000);
    EXPECT_EQ(raised.at("preview").at("total_cost"), 185000);
    expect_error(apc::apply_decision(Json{{"state", raised}, {"decision", {{"type", "raise_salary"}, {"staff_id", "staff_01"}, {"weekly_salary", 45000}}}}.dump()), "INVALID_INPUT");
    expect_error(apc::apply_decision(Json{{"state", state}, {"decision", {{"type", "raise_salary"}, {"staff_id", "staff_01"}, {"weekly_salary", 60000}}}}.dump()), "INVALID_PHASE");
    expect_error(apc::apply_decision(Json{{"state", initialize()}, {"decision", {{"type", "raise_salary"}, {"staff_id", "staff_99"}, {"weekly_salary", 60000}}}}.dump()), "INVALID_INPUT");
    auto spent = [&] {
        auto s = play_until_ready(configure(start()));
        return call(apc::calculate_result, {{"state", s}, {"scope", "project"}}).at("state");
    }();
    spent = call(apc::apply_decision, {{"state", spent}, {"decision", {{"type", "raise_salary"}, {"staff_id", "staff_02"}, {"weekly_salary", 40000}}}}).at("state");
    EXPECT_EQ(spent.at("company").at("staff").at(1).at("weekly_salary"), 40000);
}
TEST(Determinism, SameSeedSameGameAcrossInterruptions) {
    for (auto seed : {0U, 1U, 7U, 12345U, 0xffffffffU}) {
        const auto first = Json::parse(apc::calculate_result(Json{{"state", play_until_ready(configure(start(seed), "deadline"))}, {"scope", "project"}}.dump()));
        play_until_ready(configure(start(4242), "quality"));
        const auto second = Json::parse(apc::calculate_result(Json{{"state", play_until_ready(configure(start(seed), "deadline"))}, {"scope", "project"}}.dump()));
        EXPECT_EQ(first, second) << "seed " << seed;
    }
}
TEST(Phases, RejectOutOfOrderActions) {
    const auto idle = initialize(), producing = start();
    expect_error(apc::apply_decision(Json{{"state", idle}, {"decision", {{"type", "return_to_market"}}}}.dump()), "INVALID_PHASE");
    expect_error(apc::resolve_event(Json{{"state", idle}}.dump()), "INVALID_PHASE");
    expect_error(apc::start_project(Json{{"state", producing}, {"offer_id", "proj_short_01"}, {"mode", "contract"}, {"investment_percent", 0}}.dump()), "INVALID_PHASE");
    const auto active = configure(producing);
    expect_error(apc::calculate_result(Json{{"state", active}, {"scope", "project"}}.dump()), "INVALID_PHASE");
    const auto ready = play_until_ready(active);
    expect_error(apc::advance_week(Json{{"state", ready}}.dump()), "INVALID_PHASE");
    expect_error(apc::apply_decision(Json{{"state", ready}, {"decision", {{"type", "configure_stage"}, {"stage", "script"}, {"configuration", Json::object()}}}}.dump()), "INVALID_PHASE");
    const auto settled = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}}).at("state");
    expect_error(apc::advance_week(Json{{"state", settled}}.dump()), "INVALID_PHASE");
    expect_error(apc::start_project(Json{{"state", settled}, {"offer_id", "proj_short_01"}, {"mode", "contract"}, {"investment_percent", 0}}.dump()), "INVALID_PHASE");
}
namespace {
Json settledBase() {
    auto state = configure(start(3));
    state["project"]["deadline_week"] = 2;
    state["project"]["offer"]["duration_weeks"] = 2;
    state = play_weeks(state, 2);
    return call(apc::calculate_result, {{"state", state}, {"scope", "project"}}).at("state");
}
}
TEST(Game, ContractFullChainAndMarketRotation) {
    const auto ready = play_until_ready(configure(start()));
    EXPECT_EQ(ready.at("company").at("week"), 14);
    EXPECT_EQ(ready.at("project").at("delivery_reason"), "deadline");
    const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    auto state = output.at("state");
    EXPECT_EQ(state.at("company").at("funds"), 2260000);
    EXPECT_EQ(costs_total(state.at("company").at("finance")), 3740000);
    state = call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "return_to_market"}}}}).at("state");
    const std::vector<std::string> expected{"proj_short_03", "proj_tv_03", "proj_ova_04", "proj_movie_02"};
    for (std::size_t i = 0; i < expected.size(); ++i) EXPECT_EQ(state.at("offers").at(i).at("id"), expected[i]);
    state = call(apc::start_project, {{"state", state}, {"offer_id", "proj_short_03"}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    EXPECT_EQ(state.at("company").at("funds"), 2260000 + 3200000);
    EXPECT_EQ(state.at("project").at("start_week"), 14);
    EXPECT_EQ(state.at("project").at("deadline_week"), 25);
}
TEST(Game, ExhaustedCatalogUsesVariantSuffixes) {
    const auto back = call(apc::apply_decision, {{"state", settledBase()}, {"decision", {{"type", "return_to_market"}}}}).at("state");
    EXPECT_EQ(back.at("offers").at(0).at("id"), "proj_ova_04");
    EXPECT_EQ(back.at("offers").at(1).at("id"), "proj_movie_02");
    EXPECT_EQ(back.at("offers").at(2).at("id"), "proj_ova_01_r2");
    EXPECT_EQ(back.at("offers").at(2).at("contract_budget"), 4000000);
    EXPECT_NE(back.at("offers").at(2).at("name").get<std::string>().find(u8"·再演"), std::string::npos);
    EXPECT_EQ(back.at("offers").at(3).at("id"), "proj_short_01");
}
TEST(Validation, NumericBoundsAndSchema) {
    const std::vector<std::function<void(Json&)>> mutations = {
        [](Json& s) { s["version"] = 2; },
        [](Json& s) { s["company"]["funds"] = -1; },
        [](Json& s) { s["seed"] = 4294967296ULL; },
        [](Json& s) { s["company"]["week"] = 521; },
        [](Json& s) { s["phase"] = "event_pending"; },
        [](Json& s) { s["company"]["end_reason"] = "voluntary"; },
        [](Json& s) { s["company"]["status"] = "closing"; },
        [](Json& s) { s["company"]["status"] = "ended"; },
        [](Json& s) { s["company"]["status"] = "closing"; s["company"]["end_reason"] = "time_limit"; },
        [](Json& s) { s["company"]["staff"][0]["id"] = "staff_99"; },
        [](Json& s) { s["company"]["staff"][0]["weekly_salary"] = -1; },
        [](Json& s) { s["company"]["staff"][0]["morale"] = 101; },
        [](Json& s) { s["company"]["staff"][1]["abilities"]["drawing"] = 101; },
        [](Json& s) { s["company"]["staff"][2]["clues"] = Json::array(); },
        [](Json& s) { s["project"]["mode"] = "committee"; },
        [](Json& s) { s["project"]["investment_percent"] = 5; },
        [](Json& s) { s["project"]["current_stage"] = "unknown"; },
        [](Json& s) { s["project"]["stages"]["postproduction"]["status"] = "ready"; },
        [](Json& s) { s["project"]["stages"]["script"]["work_done"] = 31; },
        [](Json& s) { s["project"]["delivery_reason"] = "completed"; },
        [](Json& s) { s["project"]["extension_count"] = 1; },
        [](Json& s) { s["project"]["committee_pressure"] = Json::object(); },
        [](Json& s) { s["project"]["temporary_staff"] = Json::array({Json::object()}); },
        [](Json& s) { s["project"]["outsourcing"] = Json::array({Json::object()}); },
        [](Json& s) { s["project"]["finance"]["costs"]["events"] = -1; },
        [](Json& s) { s["project"]["finance"]["investment_paid"] = 1; },
        [](Json& s) { s["project"]["finance"]["commercial_share_received"] = 1; },
        [](Json& s) { s["project"]["start_week"] = 3; },
        [](Json& s) { s["project"]["offer"]["contract_budget"] = 1; },
        [](Json& s) { s["project"] = nullptr; },
        [](Json& s) { s["pending_event"] = Json::object(); },
        [](Json& s) { s["recruitment_pool"] = Json::array({Json::object()}); },
        [](Json& s) { s["suppliers"] = Json::array({Json::object()}); },
        [](Json& s) { s["preview"] = Json::object(); },
        [](Json& s) { s["company_result"] = Json::object(); },
        [](Json& s) { s["last_project_id"] = "proj_ova_01"; }
    };
    for (const auto& mutate : mutations) {
        auto state = start(); mutate(state);
        for (auto method : {apc::start_project, apc::apply_decision, apc::advance_week, apc::resolve_event, apc::calculate_result})
            expect_error(method(Json{{"state", state}}.dump()), "INVALID_INPUT");
    }
    const std::vector<std::function<void(Json&)>> idle_mutations = {
        [](Json& s) { s["offers"][0]["id"] = ""; },
        [](Json& s) { s["offers"][0]["allowed_modes"] = Json::array({"contract", "contract"}); },
        [](Json& s) { s["offers"][1]["id"] = s["offers"][0]["id"]; },
        [](Json& s) { s["offers"].erase(0); },
        [](Json& s) { s["offers"][2]["total_investment"] = 1; },
        [](Json& s) { s["preview"]["total_cost"] = 99999; }
    };
    for (const auto& mutate : idle_mutations) {
        auto state = initialize(); mutate(state);
        for (auto method : {apc::start_project, apc::apply_decision, apc::advance_week, apc::resolve_event, apc::calculate_result})
            expect_error(method(Json{{"state", state}}.dump()), "INVALID_INPUT");
    }
    const std::vector<std::function<void(Json&)>> settled_mutations = {
        [](Json& s) { s["history"][0]["profit"] = max_i + 1; },
        [](Json& s) { s["history"][0]["id"] = "unknown"; },
        [](Json& s) { s["history"][0]["end_week"] = 999; },
        [](Json& s) { s["history"][0]["previous_work_id"] = "proj_tv_01"; },
        [](Json& s) { s["history"][0]["mode"] = "committee"; },
        [](Json& s) { s["last_project_id"] = nullptr; },
        [](Json& s) { s["phase"] = "idle"; }
    };
    for (const auto& mutate : settled_mutations) {
        auto state = settledBase(); mutate(state);
        for (auto method : {apc::start_project, apc::apply_decision, apc::advance_week, apc::resolve_event, apc::calculate_result})
            expect_error(method(Json{{"state", state}}.dump()), "INVALID_INPUT");
    }
}
TEST(Validation, SafeIntegerBoundariesRemainAtomic) {
    auto idle = initialize(); idle["company"]["funds"] = max_i;
    EXPECT_EQ(advance(idle).at("state").at("company").at("funds"), max_i - 180000);
    auto rich = initialize(); rich["company"]["funds"] = max_i;
    expect_error(apc::start_project(Json{{"state", rich}, {"offer_id", "proj_ova_01"}, {"mode", "contract"}, {"investment_percent", 0}}.dump()), "INVALID_INPUT");
    auto state = start(); state["company"]["week"] = max_i - 1;
    expect_error(apc::advance_week(Json{{"state", state}}.dump()), "INVALID_INPUT");
}
class InvalidInput : public testing::TestWithParam<std::string> {};
TEST_P(InvalidInput, AllSixBoundariesReturnStructuredErrors) {
    for (auto method : {apc::initialize_game, apc::start_project, apc::apply_decision, apc::advance_week, apc::resolve_event, apc::calculate_result})
        EXPECT_NO_THROW(expect_error(method(GetParam()), "INVALID_INPUT"));
}
INSTANTIATE_TEST_SUITE_P(JsonAndSchema, InvalidInput, testing::Values(
    "", "{", "undefined", "null", "true", "42", "\"text\"", "[]", "{}",
    R"({"seed":-1})", R"({"seed":4294967296})", R"({"seed":18446744073709551615})",
    R"({"seed":18446744073709551616})", R"({"seed":1.5})", R"({"seed":1.0})", R"({"seed":1e0})",
    R"({"seed":"1"})", R"({"seed":true})", R"({"seed":null})", R"({"seed":[]})", R"({"seed":{}})",
    R"({"seed":1e1000})", R"({"seed":NaN})", R"({"seed":1} trailing)", R"({"seed":1,})"
));
TEST(Validation, InvalidUtf8IsCaught) {
    std::string input = R"({"seed":1,"extra":")"; input += static_cast<char>(0xff); input += "\"}";
    expect_error(apc::initialize_game(input), "INVALID_INPUT");
}

TEST(ValidatorCompatibility, DynamicRosterSizesAndFieldsAreNotCatalogBound) {
    for (int count : {0, 1, 4, 7}) {
        SCOPED_TRACE(count);
        auto state = initialize();
        state["company"]["staff"] = Json::array();
        for (int i = 0; i < count; ++i) state["company"]["staff"].push_back(dynamic_staff("creator_" + std::to_string(i)));
        update_salary_preview(state);
        expect_validation(state, true);
        const auto output = advance(state);
        EXPECT_EQ(output.at("report").at("costs").at("salary"), count * 1000);
        EXPECT_EQ(output.at("state").at("company").at("funds"), 2000000 - 30000 - count * 1000);
        expect_validation(output.at("state"), true);
    }
    auto state = initialize();
    state["company"]["staff"][0]["id"] = "staff_99";
    state["company"]["staff"][0]["weekly_salary"] = 1000;
    state["company"]["staff"][1]["abilities"]["drawing"] = 1;
    update_salary_preview(state);
    expect_validation(state, true);
    auto producing = start();
    producing["project"]["finance"]["costs"]["events"] = 1;
    expect_validation(producing, true);
}

TEST(ValidatorCompatibility, StaffFieldBoundsAndEmploymentConstraints) {
    auto state = start();
    state["company"]["staff"].push_back(dynamic_staff("extra_core"));
    auto& person = state["company"]["staff"].back();
    person["weekly_salary"] = max_i - 180000;
    person["clues"] = Json::array({"One clue"});
    person["traits"] = Json::array();
    for (auto ability : apc::rules::abilities) {
        person["abilities"][ability] = 100;
        person["potential"][ability] = 100;
        person["experience"][ability] = max_i;
    }
    expect_validation(state, true);
    person = dynamic_staff("extra_core");
    expect_invalid_mutations(state, {
        [](Json& s) { s["company"]["staff"].back()["id"] = " "; },
        [](Json& s) { s["company"]["staff"].push_back(s["company"]["staff"].back()); },
        [](Json& s) { s["company"]["staff"].back()["name"] = ""; },
        [](Json& s) { s["company"]["staff"].back()["role"] = "producer"; },
        [](Json& s) { s["company"]["staff"].back()["employment"] = "temporary"; s["company"]["staff"].back()["weekly_salary"] = 0; },
        [](Json& s) { s["company"]["staff"].back()["project_fee"] = 1; },
        [](Json& s) { s["company"]["staff"].back()["weekly_salary"] = -1; },
        [](Json& s) { s["company"]["staff"].back()["abilities"]["drawing"] = 101; },
        [](Json& s) { s["company"]["staff"].back()["potential"]["drawing"] = 0; },
        [](Json& s) { s["company"]["staff"].back()["potential"]["drawing"] = 101; },
        [](Json& s) { s["company"]["staff"].back()["experience"]["drawing"] = -1; },
        [](Json& s) { s["company"]["staff"].back()["experience"]["drawing"] = max_i + 1; },
        [](Json& s) { s["company"]["staff"].back()["revealed_potential"]["drawing"] = 1; },
        [](Json& s) { s["company"]["staff"].back()["talent_type"] = "legendary"; },
        [](Json& s) { s["company"]["staff"].back()["clues"] = Json::array(); },
        [](Json& s) { s["company"]["staff"].back()["clues"] = Json::array({"a", "b", "c"}); },
        [](Json& s) { s["company"]["staff"].back()["traits"] = Json::array({1}); },
        [](Json& s) { s["company"]["staff"].back()["fatigue"] = -1; },
        [](Json& s) { s["company"]["staff"].back()["morale"] = 101; },
        [](Json& s) { s["company"]["staff"].back()["departure_warning"] = 0; },
        [](Json& s) { s["company"]["staff"].back()["abilities"].erase("planning"); }
    });
}

TEST(ValidatorCompatibility, RecruitmentAcceptsBothEmploymentsWithoutPayroll) {
    auto state = initialize();
    state["recruitment_pool"] = Json::array({dynamic_staff("candidate_core"), dynamic_staff("candidate_temp", "temporary")});
    expect_validation(state, true);
    const auto output = advance(state);
    EXPECT_EQ(output.at("report").at("costs").at("salary"), 150000);
    EXPECT_EQ(output.at("state").at("company").at("funds"), 1820000);
    expect_validation(output.at("state"), true);
    expect_invalid_mutations(state, {
        [](Json& s) { s["recruitment_pool"][0]["project_fee"] = 1; },
        [](Json& s) { s["recruitment_pool"][0]["weekly_salary"] = -1; },
        [](Json& s) { s["recruitment_pool"][1]["weekly_salary"] = 1; },
        [](Json& s) { s["recruitment_pool"][1]["project_fee"] = -1; },
        [](Json& s) { s["recruitment_pool"].push_back(s["recruitment_pool"][0]); },
        [](Json& s) { s["recruitment_pool"][0]["id"] = s["company"]["staff"][0]["id"]; }
    });
}

TEST(ValidatorCompatibility, TemporaryAndCoreConfigurationReferencesAreGlobal) {
    auto state = start();
    state["company"]["staff"].push_back(dynamic_staff("core_dynamic"));
    state["project"]["temporary_staff"] = Json::array({dynamic_staff("temp_dynamic", "temporary")});
    state["recruitment_pool"] = Json::array({dynamic_staff("pool_core"), dynamic_staff("pool_temp", "temporary")});
    state["project"]["stages"]["script"]["recommended_configuration"] = configuration(Json::array({
        assignment(state.at("company").at("staff").back()), assignment(state.at("project").at("temporary_staff")[0])}));
    expect_validation(state, true);
    const auto active = configure(state);
    expect_validation(active, true);
    expect_invalid_mutations(state, {
        [](Json& s) { s["project"]["temporary_staff"][0]["id"] = "staff_01"; },
        [](Json& s) { s["recruitment_pool"][0]["id"] = "temp_dynamic"; },
        [](Json& s) { s["recruitment_pool"][1]["id"] = "core_dynamic"; },
        [](Json& s) { s["project"]["temporary_staff"].push_back(s["project"]["temporary_staff"][0]); },
        [](Json& s) { s["project"]["temporary_staff"][0]["employment"] = "core"; s["project"]["temporary_staff"][0]["project_fee"] = 0; },
        [](Json& s) { s["project"]["temporary_staff"][0]["weekly_salary"] = 1; },
        [](Json& s) { s["project"]["stages"]["script"]["recommended_configuration"]["assignments"][0]["staff_id"] = "pool_core"; },
        [](Json& s) { s["project"]["stages"]["script"]["recommended_configuration"]["assignments"][0]["role"] = "director"; }
    });
    expect_invalid_mutations(active, {
        [](Json& s) { s["project"]["stages"]["script"]["configuration"]["assignments"][1]["staff_id"] = "missing_temp"; },
        [](Json& s) { s["project"]["stages"]["script"]["configuration"]["assignments"][1]["role"] = "animator"; },
        [](Json& s) { auto& a = s["project"]["stages"]["script"]["configuration"]["assignments"]; a.push_back(a[0]); }
    });
}

TEST(ValidatorCompatibility, DynamicOffersAndTheirOwnFields) {
    auto state = initialize();
    for (int i = 0; i < 4; ++i) state["offers"][i] = dynamic_offer("opportunity_" + std::to_string(i));
    state["offers"][0]["allowed_modes"] = Json::array({"contract", "committee"});
    state["offers"][1]["source"] = "original";
    state["offers"][1]["allowed_modes"] = Json::array({"committee"});
    state["offers"][2]["duration_weeks"] = max_i;
    state["offers"][2]["workloads"]["script"] = max_i;
    expect_invalid_mutations(state, {
        [](Json& s) { s["offers"][0]["id"] = ""; },
        [](Json& s) { s["offers"][0]["name"] = ""; },
        [](Json& s) { s["offers"][0]["source"] = "film"; },
        [](Json& s) { s["offers"][0]["scale"] = "feature"; },
        [](Json& s) { s["offers"][0]["risk"] = "extreme"; },
        [](Json& s) { s["offers"][0]["duration_weeks"] = 0; },
        [](Json& s) { s["offers"][0]["duration_weeks"] = 1.5; },
        [](Json& s) { s["offers"][0]["target_quality"] = 101; },
        [](Json& s) { s["offers"][0]["audience_base"] = -1; },
        [](Json& s) { s["offers"][0]["commercial_potential"] = 101; },
        [](Json& s) { s["offers"][0]["contract_budget"] = 2469136; },
        [](Json& s) { s["offers"][0]["total_investment"] = -1; },
        [](Json& s) { s["offers"][0]["workloads"]["animation_check"] = 0; },
        [](Json& s) { s["offers"][0]["workloads"].erase("postproduction"); },
        [](Json& s) { s["offers"][0]["allowed_modes"] = Json::array(); },
        [](Json& s) { s["offers"][0]["allowed_modes"] = Json::array({"contract", "contract"}); },
        [](Json& s) { s["offers"][1]["allowed_modes"] = Json::array({"contract", "committee"}); },
        [](Json& s) { s["offers"][0]["previous_work_id"] = s["offers"][0]["id"]; },
        [](Json& s) { s["offers"][0]["previous_work_id"] = "missing_work"; },
        [](Json& s) { s["offers"][1]["id"] = s["offers"][0]["id"]; },
        [](Json& s) { s["offers"].push_back(dynamic_offer("fifth")); }
    });
    for (std::int64_t total : {std::int64_t{0}, std::int64_t{4}, std::int64_t{5}, max_i}) {
        auto bounded = state;
        bounded["offers"][0]["total_investment"] = total;
        bounded["offers"][0]["contract_budget"] = total / 5;
        expect_validation(bounded, true);
    }
}

TEST(ValidatorCompatibility, OptionalOfferCompanyAndCostFields) {
    auto state = initialize();
    state["company"]["scout_pity"] = {{"since_sr", 0}, {"since_ssr", max_i}};
    auto& offer = state["custom_offer"];
    offer = dynamic_offer("customized");
    offer["origin"] = "custom";
    offer["style"] = "meme";
    offer["min_reputation"] = 0;
    offer["allowed_modes"] = Json::array({"contract", "committee"});
    offer["committee_members"] = Json::array({committee_member("publisher_a", 40), committee_member("publisher_b", 60)});
    offer["channel_potentials"] = {{"bd", 0}, {"publisher", 100}, {"toy", 20}, {"music", 30}, {"tv_broadcast", 40}};
    offer["required_works"] = Json::array({{{"rating", "A"}}, {{"rating", "A"}, {"source", "game"}}});
    state["offers"][2]["min_reputation"] = 200;
    state["offers"][3]["min_reputation"] = 300;
    state["company"]["finance"]["costs"]["development"] = 123;
    state["company"]["finance"]["costs"]["distribution"] = 456;
    expect_invalid_mutations(state, {
        [](Json& s) { s["company"]["scout_pity"] = nullptr; },
        [](Json& s) { s["company"]["scout_pity"]["since_sr"] = -1; },
        [](Json& s) { s["company"]["scout_pity"].erase("since_ssr"); },
        [](Json& s) { s["custom_offer"]["origin"] = "unknown"; },
        [](Json& s) { s["custom_offer"]["style"] = nullptr; },
        [](Json& s) { s["custom_offer"]["style"] = "unknown"; },
        [](Json& s) { s["custom_offer"]["origin"] = "market"; },
        [](Json& s) { s["custom_offer"]["scale"] = "tv"; },
        [](Json& s) { s["custom_offer"]["min_reputation"] = -1; },
        [](Json& s) { s["offers"][1]["min_reputation"] = 1; },
        [](Json& s) { s["custom_offer"]["committee_members"] = Json::array(); },
        [](Json& s) { s["custom_offer"]["allowed_modes"] = Json::array({"contract"}); },
        [](Json& s) { s["custom_offer"]["committee_members"][0]["share_percent"] = 0; },
        [](Json& s) { s["custom_offer"]["committee_members"][0]["share_percent"] = 101; },
        [](Json& s) { s["custom_offer"]["committee_members"][1]["id"] = "publisher_a"; },
        [](Json& s) { s["custom_offer"]["committee_members"][0]["channels"] = Json::array({"bd"}); },
        [](Json& s) { s["custom_offer"]["committee_members"][0]["channels"] = Json::array({"music", "music"}); },
        [](Json& s) { s["custom_offer"]["committee_members"][0]["channels"] = Json::array(); },
        [](Json& s) { s["custom_offer"]["channel_potentials"].erase("bd"); },
        [](Json& s) { s["custom_offer"]["channel_potentials"]["toy"] = 101; },
        [](Json& s) { s["custom_offer"]["required_works"] = Json::array(); },
        [](Json& s) { s["custom_offer"]["required_works"][0]["rating"] = "SS"; },
        [](Json& s) { s["custom_offer"]["required_works"][0]["source"] = "film"; },
        [](Json& s) { auto& r = s["custom_offer"]["required_works"]; r.push_back(r[0]); },
        [](Json& s) { s["company"]["finance"]["costs"]["development"] = -1; },
        [](Json& s) { s["company"]["finance"]["costs"]["distribution"] = max_i + 1; }
    });
    for (auto origin : {"market", "custom", "incoming", "proposal"}) {
        auto valid = initialize();
        auto candidate = dynamic_offer("origin_variant");
        candidate["origin"] = origin;
        candidate["style"] = "normal";
        if (std::string(origin) == "custom") valid["custom_offer"] = candidate;
        else if (std::string(origin) == "proposal") {
            candidate["source"] = "original";
            candidate["allowed_modes"] = Json::array({"committee"});
            valid["pending_proposal"] = candidate;
        } else valid["offers"][0] = candidate;
        expect_validation(valid, true);
    }
    offer["style"] = "ai";
    offer["scale"] = "movie";
    offer["channel_potentials"] = {{"bd", 50}};
    expect_validation(state, true);
}

TEST(ValidatorCompatibility, SuppliersAndTasksValidateFieldsAndReferences) {
    auto state = start();
    state["suppliers"] = Json::array({supplier()});
    state["project"]["outsourcing"] = Json::array({outsource_task()});
    expect_invalid_mutations(state, {
        [](Json& s) { s["suppliers"][0]["id"] = ""; },
        [](Json& s) { s["suppliers"][0]["name"] = ""; },
        [](Json& s) { s["suppliers"].push_back(s["suppliers"][0]); },
        [](Json& s) { s["suppliers"][0]["specialties"] = Json::array(); },
        [](Json& s) { s["suppliers"][0]["specialties"] = Json::array({"planning", "planning"}); },
        [](Json& s) { s["suppliers"][0]["specialties"] = Json::array({"director"}); },
        [](Json& s) { s["suppliers"][0]["capacity"] = 0; },
        [](Json& s) { s["suppliers"][0]["speed"] = 0; },
        [](Json& s) { s["suppliers"][0]["quality"] = 101; },
        [](Json& s) { s["suppliers"][0]["unit_price"] = -1; },
        [](Json& s) { s["suppliers"][0]["reliability"] = -1; },
        [](Json& s) { s["suppliers"][0]["unlocked"] = 1; },
        [](Json& s) { s["suppliers"][0]["unlocked"] = false; },
        [](Json& s) { s["project"]["outsourcing"][0]["supplier_id"] = "missing_supplier"; },
        [](Json& s) { s["project"]["outsourcing"][0]["ability"] = "drawing"; },
        [](Json& s) { s["project"]["outsourcing"].push_back(s["project"]["outsourcing"][0]); },
        [](Json& s) { s["project"]["outsourcing"][0]["id"] = ""; },
        [](Json& s) { s["project"]["outsourcing"][0]["stage"] = "editing"; },
        [](Json& s) { s["project"]["outsourcing"][0]["ability"] = "director"; },
        [](Json& s) { s["project"]["outsourcing"][0]["mode"] = "rush"; },
        [](Json& s) { s["project"]["outsourcing"][0]["status"] = "pending"; },
        [](Json& s) { s["project"]["outsourcing"][0]["work_total"] = 0; },
        [](Json& s) { s["project"]["outsourcing"][0]["work_done"] = 11; },
        [](Json& s) { s["project"]["outsourcing"][0]["work_done"] = -1; },
        [](Json& s) { s["project"]["outsourcing"][0]["status"] = "delivered"; },
        [](Json& s) { s["project"]["outsourcing"][0]["fee_paid"] = -1; },
        [](Json& s) { s["project"]["outsourcing"][0]["due_week"] = -1; }
    });
    for (auto status : {"active", "delivered", "failed"}) {
        auto valid = state;
        valid["project"]["outsourcing"][0]["status"] = status;
        valid["project"]["outsourcing"][0]["work_done"] = 10;
        valid["project"]["outsourcing"][0]["mode"] = "emergency";
        expect_validation(valid, true);
    }
    state["project"]["outsourcing"] = Json::array();
    state["suppliers"][0]["unlocked"] = false;
    state["suppliers"][0]["unit_price"] = 0;
    state["suppliers"][0]["quality"] = 0;
    state["suppliers"][0]["capacity"] = max_i;
    state["suppliers"][0]["speed"] = max_i;
    expect_validation(state, true);
}

TEST(ValidatorCompatibility, CommitteeOmissionEmptyAndMemberShareRules) {
    for (int investment : {10, 30, 100}) {
        auto state = start();
        make_committee(state, investment);
        expect_validation(state, true);
        state["project"]["committee"] = Json::array();
        if (investment == 100) expect_validation(state, true);
        else expect_invalid_state(state);
    }
    auto state = start();
    make_committee(state);
    state["project"]["committee"] = Json::array({committee_member("partner_a", 20), committee_member("partner_b", 50)});
    state["project"]["tv_service"] = {{"purchased_week", 0}, {"cost", 12345}};
    state["project"]["finance"]["costs"]["distribution"] = 12345;
    expect_invalid_mutations(state, {
        [](Json& s) { s["project"]["committee"] = nullptr; },
        [](Json& s) { s["project"]["committee"][0]["share_percent"] = 19; },
        [](Json& s) { s["project"]["committee"][0]["share_percent"] = 21; },
        [](Json& s) { s["project"]["committee"][1]["id"] = "partner_a"; },
        [](Json& s) { s["project"]["investment_percent"] = 9; },
        [](Json& s) { s["project"]["investment_percent"] = 101; },
        [](Json& s) { s["project"]["investment_percent"] = 30.5; },
        [](Json& s) { s["project"]["committee_pressure"] = nullptr; },
        [](Json& s) { s["project"]["committee_pressure"] = 101; },
        [](Json& s) { s["project"]["extension_count"] = 2; },
        [](Json& s) { s["project"]["tv_service"]["cost"] = 0; },
        [](Json& s) { s["project"]["tv_service"]["purchased_week"] = 521; }
    });
    state["project"]["extension_count"] = 1;
    state["project"]["committee_pressure"] = 100;
    state["project"]["tv_service"] = nullptr;
    expect_validation(state, true);
    for (bool explicit_null : {false, true}) {
        auto contract = start();
        if (explicit_null) {
            contract["project"]["committee"] = nullptr;
            contract["project"]["tv_service"] = nullptr;
        } else {
            contract["project"].erase("committee");
            contract["project"].erase("tv_service");
        }
        expect_invalid_mutations(contract, {
            [](Json& s) { s["project"]["committee"] = Json::array(); },
            [](Json& s) { s["project"]["committee"] = Json::array({committee_member("partner", 100)}); },
            [](Json& s) { s["project"]["tv_service"] = {{"purchased_week", 0}, {"cost", 1}}; }
        });
    }
}

TEST(ValidatorCompatibility, OptionalOfferSlotsAreIdleOnlyAndGloballyUnique) {
    auto state = initialize();
    state["custom_offer"] = dynamic_offer("custom_slot");
    state["custom_offer"]["origin"] = "custom";
    state["pending_proposal"] = dynamic_offer("proposal_slot");
    state["pending_proposal"]["origin"] = "proposal";
    state["pending_proposal"]["source"] = "original";
    state["pending_proposal"]["allowed_modes"] = Json::array({"committee"});
    expect_invalid_mutations(state, {
        [](Json& s) { s["custom_offer"]["origin"] = "market"; },
        [](Json& s) { s["pending_proposal"]["origin"] = "custom"; },
        [](Json& s) { s["pending_proposal"]["source"] = "game"; },
        [](Json& s) { s["custom_offer"]["id"] = s["offers"][0]["id"]; },
        [](Json& s) { s["pending_proposal"]["id"] = s["offers"][0]["id"]; },
        [](Json& s) { s["pending_proposal"]["id"] = s["custom_offer"]["id"]; }
    });
    for (const char* id : {"proj_ova_01", "custom_slot"}) {
        const auto started = call(apc::start_project, {{"state", state}, {"offer_id", id}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
        EXPECT_TRUE(started.at("custom_offer").is_null());
        EXPECT_TRUE(started.at("pending_proposal").is_null());
        expect_validation(started, true);
        for (auto slot : {"custom_offer", "pending_proposal"}) {
            auto invalid = started;
            invalid[slot] = state.at(slot);
            expect_invalid_state(invalid);
        }
    }
    const auto closed = call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "end_company"}}}}).at("state");
    EXPECT_TRUE(closed.at("custom_offer").is_null());
    EXPECT_TRUE(closed.at("pending_proposal").is_null());
    expect_validation(closed, true);
    for (auto slot : {"custom_offer", "pending_proposal"}) {
        auto invalid = closed;
        invalid[slot] = state.at(slot);
        expect_invalid_state(invalid);
    }
    state["custom_offer"] = nullptr;
    state["pending_proposal"] = nullptr;
    expect_validation(state, true);
}

namespace {
Json snapshot_history() {
    auto state = play_weeks(configure(start()), 3);
    state = call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "end_company"}}}}).at("state");
    state = call(apc::calculate_result, {{"state", state}, {"scope", "project"}}).at("state");
    state["company"]["status"] = "running";
    state["company"]["end_reason"] = nullptr;
    state["company"]["staff"] = Json::array();
    auto& work = state["history"][0];
    work["id"] = "archived_dynamic";
    state["last_project_id"] = work.at("id");
    const auto rename_team = [](Json& team) {
        for (auto& member : team) {
            member["staff_id"] = "retired_" + member.at("staff_id").get<std::string>();
            member["employment"] = "temporary";
        }
    };
    rename_team(work["team"]);
    for (auto stage : apc::rules::stages) {
        auto& snapshot = work["stages"][stage];
        if (!snapshot.at("configuration").is_null()) {
            for (auto& a : snapshot["configuration"]["assignments"]) a["staff_id"] = "retired_" + a.at("staff_id").get<std::string>();
        }
        if (!snapshot.at("result").is_null()) rename_team(snapshot["result"]["team"]);
    }
    return state;
}
}

TEST(ValidatorCompatibility, HistoricalSnapshotsDoNotRequireCurrentRosterOrCatalog) {
    auto state = snapshot_history();
    state["history"][0]["stages"]["script"]["work_done"] = 123456;
    state["history"][0]["stages"]["script"]["result"]["quality"] = 7;
    expect_invalid_mutations(state, {
        [](Json& s) { s["history"][0]["team"].push_back(s["history"][0]["team"][0]); },
        [](Json& s) { s["history"][0]["team"][0]["staff_id"] = ""; },
        [](Json& s) { s["history"][0]["team"][0]["name"] = ""; },
        [](Json& s) { s["history"][0]["team"][0]["employment"] = "freelance"; },
        [](Json& s) { s["history"][0]["team"][0]["role"] = "producer"; },
        [](Json& s) { s["history"][0]["team"][0]["abilities"]["planning"] = 101; },
        [](Json& s) { s["history"][0]["team"][0]["abilities"].erase("animation"); },
        [](Json& s) { auto& t = s["history"][0]["stages"]["script"]["result"]["team"]; t.push_back(t[0]); },
        [](Json& s) { s["history"][0]["stages"]["script"]["result"]["team"][0]["staff_id"] = "not_in_work_team"; },
        [](Json& s) { s["history"][0]["stages"]["script"]["configuration"]["assignments"][0]["staff_id"] = "not_in_snapshot"; },
        [](Json& s) { s["history"][0]["stages"]["script"]["configuration"]["assignments"][0]["role"] = "animator"; },
        [](Json& s) { s["history"][0]["stages"]["script"]["result"]["weeks_spent"] = 0; },
        [](Json& s) { s["history"][0]["stages"]["script"]["result"]["issues"] = Json::array({1}); },
        [](Json& s) { s["history"][0]["stages"]["script"]["result"]["costs"]["temporary"] = -1; },
        [](Json& s) { s["history"][0]["stages"]["key_animation"]["status"] = "ready"; },
        [](Json& s) { s["history"][0]["stages"]["storyboard"]["status"] = "pending"; },
        [](Json& s) { s["history"][0]["end_reason"] = "completed"; },
        [](Json& s) { s["history"][0]["stages"].erase("animation_check"); }
    });
    state["history"][0]["team"] = Json::array();
    for (auto stage : apc::rules::stages) {
        auto& snapshot = state["history"][0]["stages"][stage];
        if (!snapshot.at("configuration").is_null()) snapshot["configuration"]["assignments"] = Json::array();
        if (!snapshot.at("result").is_null()) snapshot["result"]["team"] = Json::array();
    }
    expect_validation(state, true);
    auto current = play_weeks(configure(start()), 3);
    current["company"]["staff"] = Json::array();
    current["project"]["stages"]["storyboard"]["recommended_configuration"] = configuration();
    expect_validation(current, true);
    current["project"]["stages"]["script"]["configuration"] = configuration();
    current["project"]["stages"]["script"]["result"]["team"] = Json::array();
    expect_validation(current, true);
}

TEST(ValidatorCompatibility, HistoryPreviousReferencesMustBeEarlierAndNonoverlapping) {
    auto state = snapshot_history();
    auto sequel = state.at("history")[0];
    sequel["id"] = "sequel_dynamic";
    sequel["previous_work_id"] = "archived_dynamic";
    sequel["start_week"] = 3;
    sequel["end_week"] = 6;
    state["history"].push_back(sequel);
    state["last_project_id"] = "sequel_dynamic";
    state["company"]["week"] = 6;
    expect_invalid_mutations(state, {
        [](Json& s) { s["history"][0]["previous_work_id"] = "sequel_dynamic"; },
        [](Json& s) { s["history"][1]["previous_work_id"] = "sequel_dynamic"; },
        [](Json& s) { s["history"][1]["previous_work_id"] = "missing_work"; },
        [](Json& s) { s["history"][1]["start_week"] = 2; },
        [](Json& s) { s["history"][1]["end_week"] = 7; },
        [](Json& s) { s["history"][1]["end_week"] = 2; },
        [](Json& s) { auto first = s["history"][0]; s["history"][0] = s["history"][1]; s["history"][1] = first; },
        [](Json& s) { s["history"].push_back(s["history"][0]); }
    });
    auto market = initialize();
    market["company"]["week"] = 6;
    market["history"] = state.at("history");
    market["offers"][0] = dynamic_offer("next_dynamic");
    market["offers"][0]["previous_work_id"] = "sequel_dynamic";
    update_salary_preview(market);
    expect_invalid_mutations(market, {
        [](Json& s) { s["offers"][0]["id"] = "archived_dynamic"; },
        [](Json& s) { s["offers"][0]["previous_work_id"] = "future_work"; },
        [](Json& s) { s["custom_offer"] = dynamic_offer("archived_dynamic"); s["custom_offer"]["origin"] = "custom"; },
        [](Json& s) { s["pending_proposal"] = dynamic_offer("archived_dynamic"); s["pending_proposal"]["origin"] = "proposal"; s["pending_proposal"]["source"] = "original"; s["pending_proposal"]["allowed_modes"] = Json::array({"committee"}); }
    });
    const auto project = call(apc::start_project, {{"state", market}, {"offer_id", "next_dynamic"}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    expect_invalid_mutations(project, {
        [](Json& s) { s["project"]["start_week"] = 5; },
        [](Json& s) { s["project"]["offer"]["id"] = "archived_dynamic"; },
        [](Json& s) { s["project"]["offer"]["previous_work_id"] = "future_work"; }
    });
}

TEST(ValidatorCompatibility, HistoricalOptionalMetadataAndChannelAccounting) {
    auto state = snapshot_history();
    auto& work = state["history"][0];
    work["origin"] = "custom";
    work["style"] = "meme";
    work["scale"] = "short";
    work["rating"] = "S";
    work["finance"]["costs"]["development"] = 11;
    work["finance"]["costs"]["distribution"] = 12;
    work["stages"]["script"]["result"]["costs"]["development"] = 13;
    work["stages"]["script"]["result"]["costs"]["distribution"] = 14;
    work["channel_breakdown"] = Json::array({{{"channel", "bd"}, {"revenue", work.at("commercial_revenue").get<std::int64_t>() - 100}, {"company_received", 0}},
        {{"channel", "publisher"}, {"revenue", 100}, {"company_received", 0}}});
    expect_invalid_mutations(state, {
        [](Json& s) { s["history"][0]["origin"] = "market"; },
        [](Json& s) { s["history"][0]["scale"] = "tv"; },
        [](Json& s) { s["history"][0]["style"] = "experimental"; },
        [](Json& s) { s["history"][0]["rating"] = "SS"; },
        [](Json& s) { s["history"][0]["channel_breakdown"] = Json::array(); },
        [](Json& s) { s["history"][0]["channel_breakdown"][0]["channel"] = "music"; },
        [](Json& s) { s["history"][0]["channel_breakdown"][1]["channel"] = "bd"; },
        [](Json& s) { s["history"][0]["channel_breakdown"][1]["revenue"] = 101; },
        [](Json& s) { s["history"][0]["channel_breakdown"][1]["company_received"] = 1; },
        [](Json& s) { s["history"][0]["channel_breakdown"][1]["company_received"] = 101; },
        [](Json& s) { s["history"][0]["finance"]["costs"]["development"] = -1; },
        [](Json& s) { s["history"][0]["stages"]["script"]["result"]["costs"]["distribution"] = nullptr; }
    });
    work["mode"] = "committee";
    work["investment_percent"] = 30;
    work["finance"]["commercial_share_received"] = 100;
    work["channel_breakdown"][0]["company_received"] = 100;
    expect_validation(state, true);
}

TEST(ValidatorCompatibility, EventMustMatchAnActiveStageAndHasNoCustomEffects) {
    auto state = configure(start());
    state["phase"] = "event_pending";
    state["pending_event"] = pending_event();
    state["preview"] = nullptr;
    expect_invalid_mutations(state, {
        [](Json& s) { s["pending_event"] = nullptr; },
        [](Json& s) { s["pending_event"]["stage"] = "storyboard"; },
        [](Json& s) { s["project"]["stages"]["script"]["status"] = "ready"; s["project"]["stages"]["script"]["configuration"] = nullptr; },
        [](Json& s) { s["pending_event"]["id"] = ""; },
        [](Json& s) { s["pending_event"]["title"] = ""; },
        [](Json& s) { s["pending_event"]["description"] = ""; },
        [](Json& s) { s["pending_event"]["category"] = "random"; },
        [](Json& s) { s["pending_event"]["trigger"]["metric"] = ""; },
        [](Json& s) { s["pending_event"]["trigger"]["value"] = -max_i - 1; },
        [](Json& s) { s["pending_event"]["trigger"]["threshold"] = max_i + 1; },
        [](Json& s) { s["pending_event"]["trigger"]["value"] = 0.5; },
        [](Json& s) { s["pending_event"]["trigger"].erase("threshold"); },
        [](Json& s) { s["pending_event"]["options"] = Json::array(); },
        [](Json& s) { auto& o = s["pending_event"]["options"]; o.push_back(o[0]); },
        [](Json& s) { s["pending_event"]["options"][0]["label"] = ""; },
        [](Json& s) { s["pending_event"]["options"][0]["cost"] = -1; },
        [](Json& s) { s["pending_event"]["options"][0]["allows_reconfigure"] = 1; },
        [](Json& s) { s["pending_event"]["options"][0]["disabled_reason"] = ""; },
        [](Json& s) { s["pending_event"]["effect"] = {{"funds", 1000000}}; },
        [](Json& s) { s["pending_event"]["options"][0]["effect"] = {{"quality", 100}}; },
        [](Json& s) { s["pending_event"]["options"][0]["effects"] = Json::array({{{"funds", 1000000}}}); }
    });
    for (auto category : {"personnel", "quality", "budget", "schedule"}) {
        state["pending_event"]["category"] = category;
        state["pending_event"]["trigger"]["value"] = -max_i;
        state["pending_event"]["trigger"]["threshold"] = max_i;
        expect_validation(state, true);
    }
    state["pending_event"]["trigger"]["value"] = max_i;
    state["pending_event"]["trigger"]["threshold"] = -max_i;
    expect_validation(state, true);
}

TEST(ValidatorCompatibility, ClosingAndEndedPhaseProjectOfferMatrix) {
    const auto initial = initialize();
    const auto history = settledBase().at("history");
    auto project = start().at("project");
    project["offer"]["id"] = "matrix_project";
    project["delivery_reason"] = "company_closed";
    for (const char* status : {"closing", "ended"}) {
        for (const char* phase : {"idle", "producing", "event_pending", "project_ready", "project_settled", "company_ended"}) {
            for (bool has_project : {false, true}) {
                for (bool has_offers : {false, true}) {
                    SCOPED_TRACE(std::string(status) + "/" + phase + "/project=" + std::to_string(has_project) + "/offers=" + std::to_string(has_offers));
                    auto state = initial;
                    state["company"]["week"] = 2;
                    state["company"]["status"] = status;
                    state["company"]["end_reason"] = "voluntary";
                    state["phase"] = phase;
                    state["project"] = has_project ? project : Json(nullptr);
                    state["offers"] = has_offers ? initial.at("offers") : Json::array();
                    state["preview"] = nullptr;
                    state["history"] = history;
                    if (std::string(phase) == "project_settled" || std::string(phase) == "company_ended") state["last_project_id"] = history[0].at("id");
                    if (std::string(status) == "ended") state["company_result"] = {{"reason", "voluntary"}, {"weeks", 2},
                        {"final_funds", 2000000}, {"net_cash_change", 0}, {"total_projects", 1}, {"best_work_id", history[0].at("id")}, {"rating", "small"}};
                    const bool closing = std::string(status) == "closing";
                    const bool valid = !has_offers && (closing
                        ? (std::string(phase) == "project_ready" ? has_project : !has_project && (std::string(phase) == "idle" || std::string(phase) == "project_settled"))
                        : std::string(phase) == "company_ended" && !has_project);
                    if (valid) expect_validation(state, true);
                    else expect_invalid_state(state);
                }
            }
        }
    }
}

TEST(ValidatorCompatibility, ClosingAndEndedRejectEventsPreviewsAndInconsistentSummaries) {
    const auto idle = call(apc::apply_decision, {{"state", initialize()}, {"decision", {{"type", "end_company"}}}}).at("state");
    const auto ready = call(apc::apply_decision, {{"state", configure(start())}, {"decision", {{"type", "end_company"}}}}).at("state");
    const auto settled = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}}).at("state");
    const auto ended = call(apc::calculate_result, {{"state", settled}, {"scope", "company"}}).at("state");
    for (const auto& base : {idle, ready, settled, ended}) {
        for (bool event : {false, true}) {
            for (bool preview : {false, true}) {
                for (bool offers : {false, true}) {
                    auto state = base;
                    if (event) state["pending_event"] = pending_event();
                    if (preview) state["preview"] = initialize().at("preview");
                    if (offers) state["offers"] = initialize().at("offers");
                    if (!event && !preview && !offers) expect_validation(state, true);
                    else expect_invalid_state(state);
                }
            }
        }
    }
    expect_invalid_mutations(ended, {
        [](Json& s) { s["company_result"] = nullptr; },
        [](Json& s) { s["company_result"]["reason"] = "bankrupt"; },
        [](Json& s) { s["company_result"]["weeks"] = 1; },
        [](Json& s) { s["company_result"]["final_funds"] = 1; },
        [](Json& s) { s["company_result"]["total_projects"] = 0; },
        [](Json& s) { s["company_result"]["best_work_id"] = "missing_work"; },
        [](Json& s) { s["company"]["funds"] = -1; s["company_result"]["final_funds"] = -1; }
    });
    for (auto base : {idle, settled, ended}) {
        base["company"]["end_reason"] = "bankrupt";
        set_cash(base, -1);
        if (!base.at("company_result").is_null()) {
            base["company_result"]["reason"] = "bankrupt";
            base["company_result"]["final_funds"] = -1;
            base["company_result"]["net_cash_change"] = -2000001;
            base["company_result"]["rating"] = "failed";
        }
        expect_validation(base, true);
    }
}

TEST(DynamicExecution, ConfigureAcceptsDynamicStaffButAdvanceRequiresSpecialtyRules) {
    auto state = start();
    state["company"]["staff"] = Json::array({dynamic_staff("nonstatic_creator")});
    state["project"]["stages"]["script"]["recommended_configuration"] = configuration(Json::array({assignment(state.at("company").at("staff")[0])}));
    expect_validation(state, true);
    const auto configured = configure(state);
    expect_validation(configured, true);
    EXPECT_EQ(configured.at("company").at("funds"), state.at("company").at("funds"));
    expect_mode_blocked(apc::advance_week, {{"state", configured}}, true);
    for (const char* id : {"temp_nonstatic", "staff_01"}) {
        auto temporary = start();
        if (std::string(id) == "staff_01") temporary["company"]["staff"].erase(0);
        temporary["project"]["temporary_staff"] = Json::array({dynamic_staff(id, "temporary")});
        const auto config = configuration(Json::array({assignment(temporary.at("project").at("temporary_staff")[0])}));
        temporary["project"]["stages"]["script"]["recommended_configuration"] = config;
        expect_validation(temporary, true);
        temporary = configure_with(temporary, config);
        expect_validation(temporary, true);
        expect_mode_blocked(apc::advance_week, {{"state", temporary}}, true);
    }
}

TEST(DynamicExecution, UnassignedDynamicStaffRestAndStaticStaffBeyondIndexFourWork) {
    auto state = start();
    const auto known = state.at("company").at("staff")[0];
    state["company"]["staff"] = Json::array();
    for (int i = 0; i < 5; ++i) state["company"]["staff"].push_back(dynamic_staff("resting_" + std::to_string(i)));
    state["company"]["staff"].push_back(known);
    state["project"]["temporary_staff"] = Json::array({dynamic_staff("unassigned_temp", "temporary")});
    state["project"]["finance"]["costs"]["temporary"] = 7500;
    state["company"]["finance"]["costs"]["temporary"] = 7500;
    set_cash(state, 6000000 - 7500);
    state["project"]["stages"]["script"]["recommended_configuration"] = configuration(Json::array({assignment(known)}));
    state = configure(state);
    expect_validation(state, true);
    const auto output = advance(state);
    const auto& next = output.at("state");
    EXPECT_GT(next.at("project").at("stages").at("script").at("work_done").get<int>(), 0);
    EXPECT_EQ(output.at("report").at("costs").at("salary"), 50000);
    EXPECT_EQ(output.at("report").at("costs").at("temporary"), 0);
    EXPECT_EQ(output.at("report").at("funds_delta"), -110000);
    EXPECT_EQ(next.at("company").at("funds"), 6000000 - 7500 - 110000);
    EXPECT_EQ(next.at("project").at("finance").at("costs").at("temporary"), 7500);
    for (int i = 0; i < 5; ++i) {
        const auto& person = next.at("company").at("staff")[i];
        EXPECT_EQ(person.at("fatigue"), 8);
        EXPECT_EQ(person.at("morale"), 60);
        EXPECT_EQ(person.at("experience"), state.at("company").at("staff")[i].at("experience"));
    }
    EXPECT_EQ(next.at("project").at("temporary_staff")[0].at("experience"), state.at("project").at("temporary_staff")[0].at("experience"));
    expect_validation(next, true);
}

TEST(DynamicExecution, ActiveOutsourcingAndCommitteeGameplayAreExplicitlyBlocked) {
    auto outsourced = configure(start());
    outsourced["suppliers"] = Json::array({supplier()});
    outsourced["project"]["outsourcing"] = Json::array({outsource_task()});
    expect_validation(outsourced, true);
    expect_mode_blocked(apc::advance_week, {{"state", outsourced}});
    for (auto status : {"delivered", "failed"}) {
        auto inactive = outsourced;
        inactive["project"]["outsourcing"][0]["status"] = status;
        inactive["project"]["outsourcing"][0]["work_done"] = 10;
        inactive["project"]["finance"]["costs"]["outsourcing"] = 1230;
        inactive["company"]["finance"]["costs"]["outsourcing"] = 1230;
        set_cash(inactive, 6000000 - 1230);
        expect_validation(inactive, true);
        const auto output = advance(inactive);
        EXPECT_EQ(output.at("report").at("costs").at("outsourcing"), 0);
        EXPECT_EQ(output.at("report").at("funds_delta"), -210000);
        EXPECT_EQ(output.at("state").at("company").at("funds"), 6000000 - 1230 - 210000);
        EXPECT_EQ(output.at("state").at("project").at("outsourcing"), inactive.at("project").at("outsourcing"));
        expect_validation(output.at("state"), true);
    }
    auto committee = configure(start());
    make_committee(committee);
    expect_validation(committee, true);
    expect_mode_blocked(apc::advance_week, {{"state", committee}});
    committee["phase"] = "project_ready";
    committee["project"]["delivery_reason"] = "company_closed";
    committee["company"]["status"] = "closing";
    committee["company"]["end_reason"] = "voluntary";
    committee["preview"] = nullptr;
    expect_validation(committee, true);
    expect_mode_blocked(apc::calculate_result, {{"state", committee}, {"scope", "project"}});
}

TEST(DynamicExecution, TemporarySnapshotsSurviveSettlementWithoutExperienceGain) {
    auto state = start();
    state["project"]["temporary_staff"] = Json::array({dynamic_staff("snapshot_temp", "temporary")});
    const auto experience = state.at("project").at("temporary_staff")[0].at("experience");
    const auto team = roster_snapshots(state);
    auto assignments = state.at("project").at("stages").at("script").at("recommended_configuration").at("assignments");
    assignments.push_back(assignment(state.at("project").at("temporary_staff")[0]));
    state = configure_with(state, configuration(assignments));
    state = call(apc::apply_decision, {{"state", state}, {"decision", {{"type", "end_company"}}}}).at("state");
    EXPECT_EQ(state.at("project").at("temporary_staff")[0].at("experience"), experience);
    const auto settled = call(apc::calculate_result, {{"state", state}, {"scope", "project"}});
    EXPECT_EQ(settled.at("result").at("team"), team);
    EXPECT_TRUE(settled.at("state").at("project").is_null());
    expect_validation(settled.at("state"), true);

    auto completed = play_weeks(configure(start()), 3);
    completed["project"]["temporary_staff"] = Json::array({dynamic_staff("completed_temp", "temporary")});
    auto& script = completed["project"]["stages"]["script"];
    script["configuration"]["assignments"].push_back(assignment(completed.at("project").at("temporary_staff")[0]));
    script["result"]["team"] = roster_snapshots(completed);
    const auto completed_team = script.at("result").at("team");
    expect_validation(completed, true);
    completed = call(apc::apply_decision, {{"state", completed}, {"decision", {{"type", "end_company"}}}}).at("state");
    const auto receipt = call(apc::calculate_result, {{"state", completed}, {"scope", "project"}});
    EXPECT_EQ(receipt.at("result").at("team"), completed_team);
    expect_validation(receipt.at("state"), true);
}

TEST(DynamicExecution, ContractUsesOfferDurationWorkloadsAndCopiesMetadata) {
    for (const char* id : {"dynamic_contract", "proj_ova_01"}) {
        for (int duration : {2, 19}) {
            SCOPED_TRACE(std::string(id) + "/" + std::to_string(duration));
            auto state = initialize();
            auto offer = dynamic_offer(id);
            offer["duration_weeks"] = duration;
            offer["origin"] = "incoming";
            offer["style"] = "normal";
            state["offers"][0] = offer;
            expect_validation(state, true);
            state = call(apc::start_project, {{"state", state}, {"offer_id", id}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
            EXPECT_EQ(state.at("project").at("offer"), offer);
            EXPECT_EQ(state.at("project").at("deadline_week"), duration);
            EXPECT_EQ(state.at("company").at("funds"), 4469135);
            state = play_until_ready(state);
            EXPECT_EQ(state.at("company").at("week"), duration == 2 ? 2 : 5);
            EXPECT_EQ(state.at("project").at("delivery_reason"), duration == 2 ? "deadline" : "completed");
            if (duration == 19) for (auto stage : apc::rules::stages) EXPECT_EQ(state.at("project").at("stages").at(stage).at("work_done"), 1);
            expect_validation(state, true);
            const auto output = call(apc::calculate_result, {{"state", state}, {"scope", "project"}});
            EXPECT_EQ(output.at("result").at("id"), id);
            EXPECT_EQ(output.at("result").at("origin"), "incoming");
            EXPECT_EQ(output.at("result").at("style"), offer.at("style"));
            EXPECT_EQ(output.at("result").at("profit").get<std::int64_t>(), 2469135 - costs_total(output.at("result").at("finance")));
            expect_validation(output.at("state"), true);
        }
    }
}

TEST(DynamicExecution, RecordedCostsAffectProfitWithoutBeingChargedTwice) {
    auto market = initialize();
    market["offers"][0] = dynamic_offer("costed_contract");
    auto ready = call(apc::start_project, {{"state", market}, {"offer_id", "costed_contract"}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    ready = play_until_ready(ready);
    const auto baseline = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    for (auto owner : {"company", "project"}) {
        auto& costs = ready[owner]["finance"]["costs"];
        costs["temporary"] = 7500;
        costs["outsourcing"] = 1230;
        costs["development"] = 777;
        costs["distribution"] = 888;
    }
    const std::int64_t recorded = 7500 + 1230 + 777 + 888;
    set_cash(ready, ready.at("company").at("funds").get<std::int64_t>() - recorded);
    const auto funds = ready.at("company").at("funds");
    expect_validation(ready, true);
    const auto output = call(apc::calculate_result, {{"state", ready}, {"scope", "project"}});
    EXPECT_EQ(output.at("state").at("company").at("funds"), funds);
    EXPECT_EQ(output.at("result").at("profit").get<std::int64_t>(), baseline.at("result").at("profit").get<std::int64_t>() - recorded);
    for (auto key : {"temporary", "outsourcing", "development", "distribution"}) {
        EXPECT_EQ(output.at("result").at("finance").at("costs").at(key), ready.at("project").at("finance").at("costs").at(key));
        EXPECT_EQ(output.at("state").at("company").at("finance").at("costs").at(key), ready.at("company").at("finance").at("costs").at(key));
    }
    expect_validation(output.at("state"), true);
    expect_invalid_mutations(ready, {
        [](Json& s) { s["project"]["finance"]["costs"]["development"] = -1; },
        [](Json& s) { s["project"]["finance"]["costs"]["distribution"] = 1.5; }
    });
}

TEST(DynamicExecution, AlreadyNegativeBankruptBalanceSettlesSafelyAndRemainsClosed) {
    auto state = configure(start());
    set_cash(state, 209999);
    state = advance(state).at("state");
    set_cash(state, -1);
    expect_validation(state, true);
    const auto output = call(apc::calculate_result, {{"state", state}, {"scope", "project"}});
    const auto& settled = output.at("state");
    EXPECT_EQ(settled.at("company").at("funds"), -400001);
    EXPECT_EQ(settled.at("company").at("status"), "closing");
    EXPECT_EQ(settled.at("company").at("end_reason"), "bankrupt");
    EXPECT_EQ(settled.at("company").at("week"), state.at("company").at("week"));
    EXPECT_EQ(settled.at("seed"), state.at("seed"));
    expect_validation(settled, true);
    const auto ended = call(apc::calculate_result, {{"state", settled}, {"scope", "company"}}).at("state");
    EXPECT_EQ(ended.at("company_result").at("final_funds"), -400001);
    EXPECT_EQ(ended.at("company_result").at("rating"), "failed");
    expect_validation(ended, true);
    set_cash(state, -max_i);
    expect_validation(state, true);
    const auto before = state.dump();
    expect_error(apc::calculate_result(Json{{"state", state}, {"scope", "project"}}.dump()), "INVALID_INPUT");
    EXPECT_EQ(state.dump(), before);
}

TEST(DynamicExecution, AccumulatedCostOverflowIsAtomic) {
    for (const char* owner : {"company", "project"}) {
        auto state = configure(start());
        state[owner]["finance"]["costs"]["events"] = max_i;
        expect_validation(state, true);
        const auto before = state.dump();
        expect_error(apc::advance_week(Json{{"state", state}}.dump()), "INVALID_INPUT");
        EXPECT_EQ(state.dump(), before);
    }
    auto idle = initialize();
    idle["company"]["finance"]["costs"]["events"] = max_i;
    expect_validation(idle, true);
    const auto before = idle.dump();
    expect_error(apc::advance_week(Json{{"state", idle}}.dump()), "INVALID_INPUT");
    EXPECT_EQ(idle.dump(), before);
}

TEST(DynamicExecution, SpecialStylesCannotBypassExecutionGatesThroughLoadedState) {
    for (auto style : {"meme", "ai"}) {
        auto idle = initialize();
        idle["custom_offer"] = dynamic_offer("styled");
        idle["custom_offer"]["origin"] = "custom";
        idle["custom_offer"]["style"] = style;
        expect_validation(idle, true);
        expect_mode_blocked(apc::start_project, {{"state", idle}, {"offer_id", "styled"}, {"mode", "contract"}, {"investment_percent", 0}});
        auto loaded = start();
        loaded["project"]["offer"]["origin"] = "custom";
        loaded["project"]["offer"]["style"] = style;
        loaded["project"]["offer"]["scale"] = "short";
        expect_validation(loaded, true);
        loaded = configure(loaded);
        expect_mode_blocked(apc::advance_week, {{"state", loaded}});
        loaded = call(apc::apply_decision, {{"state", loaded}, {"decision", {{"type", "end_company"}}}}).at("state");
        expect_validation(loaded, true);
        expect_mode_blocked(apc::calculate_result, {{"state", loaded}, {"scope", "project"}});
    }
}

TEST(DynamicExecution, ChangedRolesRemainConsistentWithEachStageSnapshot) {
    auto idle = initialize();
    for (auto stage : apc::rules::stages) idle["offers"][0]["workloads"][stage] = 1;
    auto state = call(apc::start_project, {{"state", idle}, {"offer_id", idle.at("offers")[0].at("id")}, {"mode", "contract"}, {"investment_percent", 0}}).at("state");
    state = advance(configure(state)).at("state");
    state["company"]["staff"][0]["role"] = "scriptwriter";
    state["project"]["stages"]["storyboard"]["recommended_configuration"]["assignments"][0]["role"] = "scriptwriter";
    expect_validation(state, true);
    state = play_until_ready(state);
    const auto settled = call(apc::calculate_result, {{"state", state}, {"scope", "project"}}).at("state");
    EXPECT_EQ(settled.at("history")[0].at("stages").at("script").at("result").at("team")[0].at("role"), "director");
    EXPECT_EQ(settled.at("history")[0].at("stages").at("storyboard").at("result").at("team")[0].at("role"), "scriptwriter");
    expect_validation(settled, true);
}

TEST(ValidatorCompatibility, ContractDeadlineMatchesItsOfferDuration) {
    expect_invalid_mutations(start(), {
        [](Json& s) { s["project"]["deadline_week"] = 2; },
        [](Json& s) { s["project"]["offer"]["duration_weeks"] = 1; }
    });
    auto short_project = start();
    short_project["project"]["deadline_week"] = 2;
    short_project["project"]["offer"]["duration_weeks"] = 2;
    expect_validation(short_project, true);
}

namespace {
std::int64_t count_cash(const Json& state, const char* reason) {
    std::int64_t total = 0;
    for (const auto& entry : state.at("company").at("cash_log")) if (entry.at("reason") == reason) ++total;
    return total;
}
Json last_cash(const Json& state) { return state.at("company").at("cash_log").back(); }
std::int64_t cash(const Json& state) { return state.at("company").at("funds").get<std::int64_t>(); }
}

TEST(CashLedger, ContractBudgetIsTheOnlyIncomeAndTheChainClosesOnCurrentFunds) {
    const auto state = play_weeks(configure(start()), 2);
    const auto& log = state.at("company").at("cash_log");
    ASSERT_TRUE(log.is_array());
    ASSERT_FALSE(log.empty());
    EXPECT_EQ(count_cash(state, "contract_budget"), 1);
    EXPECT_EQ(count_cash(state, "weekly_production_costs"), state.at("company").at("week").get<std::int64_t>());
    std::int64_t expected = apc::rules::initial_funds;
    std::int64_t previous_week = 0;
    for (const auto& entry : log) {
        const auto amount = entry.at("amount").get<std::int64_t>();
        ASSERT_NE(amount, 0);
        EXPECT_EQ(entry.at("type") == "income", amount > 0);
        EXPECT_EQ(entry.at("before").get<std::int64_t>(), expected);
        EXPECT_EQ(entry.at("after").get<std::int64_t>(), expected + amount);
        EXPECT_GE(entry.at("week").get<std::int64_t>(), previous_week);
        EXPECT_LE(entry.at("week").get<std::int64_t>(), state.at("company").at("week").get<std::int64_t>());
        previous_week = entry.at("week").get<std::int64_t>();
        expected = entry.at("after").get<std::int64_t>();
    }
    EXPECT_EQ(expected, cash(state));
    expect_validation(state, true);
}

TEST(CashLedger, ReasonDecidesSignAndProjectLink) {
    const auto idle = advance(initialize());
    const auto idle_entry = last_cash(idle.at("state"));
    EXPECT_EQ(idle_entry.at("reason"), "weekly_fixed_costs");
    EXPECT_EQ(idle_entry.at("type"), "expense");
    EXPECT_LT(idle_entry.at("amount").get<std::int64_t>(), 0);
    EXPECT_TRUE(idle_entry.at("project_id").is_null());
    EXPECT_EQ(idle_entry.at("before").get<std::int64_t>(), apc::rules::initial_funds);
    EXPECT_EQ(idle_entry.at("after").get<std::int64_t>(), cash(idle.at("state")));
    EXPECT_EQ(idle_entry.at("amount").get<std::int64_t>(), idle.at("report").at("funds_delta").get<std::int64_t>());

    const auto started = configure(start());
    const auto& budget = started.at("company").at("cash_log").front();
    EXPECT_EQ(budget.at("reason"), "contract_budget");
    EXPECT_EQ(budget.at("type"), "income");
    EXPECT_GT(budget.at("amount").get<std::int64_t>(), 0);
    EXPECT_EQ(budget.at("project_id"), "proj_ova_01");

    const auto producing = advance(started).at("state");
    const auto week_entry = last_cash(producing);
    EXPECT_EQ(week_entry.at("reason"), "weekly_production_costs");
    EXPECT_EQ(week_entry.at("project_id"), "proj_ova_01");
    EXPECT_EQ(week_entry.at("before").get<std::int64_t>(), cash(started));
}

TEST(CashLedger, DeadlinePenaltyIsRecordedOnceAgainstItsProject) {
    auto soon = configure(start());
    soon["project"]["deadline_week"] = 2;
    soon["project"]["offer"]["duration_weeks"] = 2;
    const auto late = play_weeks(soon, 2);
    ASSERT_EQ(late.at("phase").get<std::string>(), "project_ready");
    ASSERT_EQ(late.at("project").at("delivery_reason").get<std::string>(), "deadline");
    const auto settled = call(apc::calculate_result, {{"state", late}, {"scope", "project"}}).at("state");
    const auto penalty = last_cash(settled);
    EXPECT_EQ(penalty.at("reason"), "deadline_penalty");
    EXPECT_EQ(penalty.at("type"), "expense");
    EXPECT_LT(penalty.at("amount").get<std::int64_t>(), 0);
    EXPECT_EQ(penalty.at("project_id"), "proj_ova_01");
    EXPECT_EQ(penalty.at("before").get<std::int64_t>(), cash(late));
    EXPECT_EQ(penalty.at("after").get<std::int64_t>(), cash(settled));
    EXPECT_EQ(count_cash(settled, "deadline_penalty"), 1);
    const auto snapshot = settled.dump();
    expect_error(apc::calculate_result(Json{{"state", settled}, {"scope", "project"}}.dump()), "INVALID_PHASE");
    EXPECT_EQ(settled.dump(), snapshot);
    expect_validation(settled, true);
}

TEST(CashLedger, CompanyClosurePenaltyIsRecordedAgainstTheProjectItClosed) {
    auto broke = configure(start());
    set_cash(broke, 209999);
    const auto closed = advance(broke).at("state");
    const auto settled = call(apc::calculate_result, {{"state", closed}, {"scope", "project"}}).at("state");
    const auto entry = last_cash(settled);
    EXPECT_EQ(entry.at("reason"), "closure_penalty");
    EXPECT_EQ(entry.at("project_id"), "proj_ova_01");
    EXPECT_LT(entry.at("amount").get<std::int64_t>(), 0);
    EXPECT_EQ(entry.at("before").get<std::int64_t>(), cash(closed));
    EXPECT_EQ(entry.at("after").get<std::int64_t>(), cash(settled));
    EXPECT_EQ(settled.at("company").at("cash_log").size(), 1U);
    expect_validation(settled, true);
}

TEST(CashLedger, BankruptcyPrecheckChangesNeitherCashNorLedger) {
    auto broke = configure(start());
    set_cash(broke, 209999);
    const auto output = advance(broke);
    const auto next = output.at("state");
    EXPECT_EQ(next.at("company").at("status"), "closing");
    EXPECT_EQ(next.at("company").at("end_reason"), "bankrupt");
    EXPECT_EQ(cash(next), 209999);
    EXPECT_EQ(next.at("company").at("week"), broke.at("company").at("week").get<std::int64_t>());
    EXPECT_EQ(output.at("report").at("funds_delta").get<std::int64_t>(), 0);
    EXPECT_TRUE(next.at("company").at("cash_log").empty());
    EXPECT_EQ(count_cash(next, "weekly_fixed_costs") + count_cash(next, "weekly_production_costs"), 0);
    expect_validation(next, true);
}

TEST(CashLedger, SameSeedSameActionsReproduceTheOriginalCashResults) {
    const auto first = advance(configure(start())).at("state");
    EXPECT_EQ(cash(first), 5790000);
    const auto replay = advance(configure(start())).at("state");
    EXPECT_EQ(replay.at("company").at("funds"), first.at("company").at("funds"));
    EXPECT_EQ(replay.at("company").at("cash_log"), first.at("company").at("cash_log"));
    EXPECT_EQ(replay.at("company").at("finance"), first.at("company").at("finance"));
    auto soon = configure(start());
    soon["project"]["deadline_week"] = 2;
    soon["project"]["offer"]["duration_weeks"] = 2;
    const auto settled = call(apc::calculate_result,
        {{"state", play_weeks(soon, 2)}, {"scope", "project"}}).at("state");
    EXPECT_EQ(cash(settled), last_cash(settled).at("after").get<std::int64_t>());
    expect_validation(settled, true);
}

TEST(CashLedger, TamperedLedgersAreRejectedWithoutAnyWrite) {
    const auto state = advance(configure(start())).at("state");
    expect_invalid_mutations(state, {
        [](Json& s) { s["company"]["cash_log"][0]["amount"] = 1; },
        [](Json& s) { s["company"]["cash_log"][0]["after"] = max_i; },
        [](Json& s) { s["company"]["cash_log"][0]["reason"] = "unknown_cash"; },
        [](Json& s) { s["company"]["cash_log"][0]["type"] = "expense"; },
        [](Json& s) { s["company"]["cash_log"][0]["project_id"] = ""; },
        [](Json& s) { s["company"]["cash_log"][1]["week"] = 9; },
        [](Json& s) { s["company"]["cash_log"].push_back(s["company"]["cash_log"][0]); },
        [](Json& s) { s["company"]["cash_log"][1] = nullptr; },
        [](Json& s) { s["company"]["funds"] = 2000000; }
    });
}

TEST(CashLedger, SavesWithoutALedgerStayPlayableAndStartRecordingFromNow) {
    auto state = advance(configure(start())).at("state");
    state["company"].erase("cash_log");
    expect_validation(state, true);
    const auto next = advance(state).at("state");
    EXPECT_EQ(next.at("company").at("cash_log").size(), 1U);
    const auto entry = last_cash(next);
    EXPECT_EQ(entry.at("before").get<std::int64_t>(), cash(state));
    EXPECT_EQ(entry.at("after").get<std::int64_t>(), cash(next));
    expect_validation(next, true);
    auto null_ledger = state;
    null_ledger["company"]["cash_log"] = nullptr;
    expect_validation(null_ledger, true);
}
