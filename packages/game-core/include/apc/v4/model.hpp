#pragma once

#include <array>
#include <cstdint>
#include <functional>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace apc::v4 {

using Json = nlohmann::json;

inline constexpr int kContractVersion = 4;
inline constexpr const char* kRulesVersion = "2026-11-25";
inline constexpr int kMaxWeek = 520;
inline constexpr int kAbilityCount = 6;
inline constexpr int kDimensionCount = 6;
inline constexpr int kStageCount = 6;

extern const std::array<const char*, kAbilityCount> kAbilities;
extern const std::array<const char*, kDimensionCount> kDimensions;
extern const std::array<const char*, kStageCount> kStages;

int ability_index(const std::string& name);
int dimension_index(const std::string& name);
int stage_index(const std::string& key);

struct ReputationLog {
    int week = 0;
    std::string reason;
    int delta = 0;
    int64_t after = 0;
};

struct Company {
    std::string id;
    std::string name;
    int founded_week = 0;
    int week = 0;
    std::string status = "running";
    std::optional<std::string> end_reason;
    int64_t reputation = 0;
    std::vector<std::string> facilities;
    std::vector<ReputationLog> reputation_log;
};

struct Participation {
    std::string work_id;
    std::string item_id;
    int week = 0;
};

struct WorkHistory {
    std::string work_id;
    int contribution = 0;
    int total_work = 0;
};

struct Staff {
    std::string id;
    std::string name;
    std::string role;
    std::string employment = "core";
    std::array<int, kAbilityCount> abilities{};
    std::array<int, kAbilityCount> experience{};
    std::array<int, kAbilityCount> potential{};
    std::array<bool, kAbilityCount> revealed_potential{};
    std::vector<std::string> traits;
    std::string talent_type;
    int64_t weekly_salary = 0;
    int64_t project_fee = 0;
    int joined_week = 0;
    int fatigue = 0;
    int morale = 0;
    bool departure_warning = false;
    std::optional<std::string> assignment_work_id;
    std::optional<Participation> last_participation;
    std::vector<WorkHistory> works_history;
    Json temporary_contract = nullptr;
};

struct Quality {
    std::array<int, kDimensionCount> dims{};
};

struct WorkItem {
    std::string id;
    std::string key;
    std::string ability;
    int work_total = 0;
    int work_done = 0;
    int deliver_at = 1000;
    std::vector<std::string> deps;
    bool is_gate = false;
    Quality quality;
    std::vector<std::string> contributors;

    bool delivered() const { return static_cast<int64_t>(work_done) * 1000 >= static_cast<int64_t>(deliver_at) * work_total; }
    bool complete() const { return work_done >= work_total; }
    int remaining() const { return work_total - work_done; }
};

struct EpisodeStage {
    std::string key;
    std::vector<WorkItem> items;
};

struct Episode {
    std::string id;
    int index = 0;
    std::vector<EpisodeStage> stages;
};

struct CommonProduction {
    std::string id;
    std::vector<WorkItem> items;
};

struct Target {
    std::string kind;
    std::string id;
};

struct WorkPlan {
    std::string intensity = "standard";
    std::string focus = "quality";
    std::string outsourcing = "gap_fill";
    std::string overtime = "off";
    std::optional<Target> target;
};

struct DeliveryRecord {
    int delivered_week = 0;
    bool on_time = false;
    Json quality = Json::object();
    Json staff_snapshot = Json::array();
    int64_t production_cost = 0;
    Json commercial_entries = Json::array();
    int64_t commercial_income = 0;
    int64_t profit = 0;
    std::string archive_id;
};

struct Project {
    std::string id;
    Json offer = Json::object();
    std::string mode = "contract";
    Json investment = Json::object();
    std::vector<std::string> channels;
    int opened_week = 0;
    int deadline_week = 0;
    Json extension = Json::object();
    std::string status = "producing";
    std::optional<std::string> ip_id;
    std::optional<std::string> committee_id;
    Json tv_service = Json{{"status", "none"}};
    CommonProduction common;
    std::vector<Episode> episodes;
    WorkPlan plan;
    Json delivery = nullptr;

    bool deliverable() const;
};

struct LedgerEntry {
    std::string id;
    int week = 0;
    std::optional<std::string> work_id;
    std::string category;
    int64_t amount = 0;
    std::optional<std::string> counterparty;
    std::string memo;
};

struct Solvency {
    std::string state = "normal";
    std::optional<int> since_week;
    std::optional<int> deadline_week;
    int64_t gap = 0;
};

struct Finance {
    int64_t opening_funds = 0;
    int64_t balance = 0;
    std::vector<LedgerEntry> entries;
    Json loans = Json::array();
    Solvency solvency;
};

struct EventInstance {
    std::string instance_id;
    std::string event_id;
    std::string work_id;
    std::string episode_id;
    std::string stage_key;
    std::string item_id;
    int triggered_week = 0;
    int expires_week = 0;
    std::string status = "pending";
    std::vector<std::string> option_ids;
    Json escalation = nullptr;
};

struct EventState {
    std::vector<EventInstance> pending;
    std::optional<int> last_event_week;
    Json per_work = Json::object();
};

struct WorkRecord {
    std::string id;
    std::string work_id;
    std::string title;
    std::string mode;
    int opened_week = 0;
    int delivered_week = 0;
    int deadline_week = 0;
    bool on_time = false;
    Json quality = Json::object();
    Json staff_snapshot = Json::array();
    int64_t production_cost = 0;
    int64_t commercial_income = 0;
    int64_t profit = 0;
};

struct Archive {
    std::vector<WorkRecord> works;
    Json series = Json::array();
    Json company_result = nullptr;
};

struct GameState {
    int version = kContractVersion;
    std::uint32_t seed = 0;
    Company company;
    std::vector<Staff> staff;
    std::vector<Project> works;
    Json suppliers = Json::array();
    Json contracts = Json::array();
    Json partners = Json::array();
    Json committees = Json::array();
    Json market = Json::object();
    EventState events;
    Finance finance;
    Archive archive;
};

void to_json(Json& j, const Company& value);
void from_json(const Json& j, Company& value);
void to_json(Json& j, const Staff& value);
void from_json(const Json& j, Staff& value);
void to_json(Json& j, const WorkItem& value);
void from_json(const Json& j, WorkItem& value);
void to_json(Json& j, const Project& value);
void from_json(const Json& j, Project& value);
void to_json(Json& j, const EventState& value);
void from_json(const Json& j, EventState& value);
void to_json(Json& j, const Finance& value);
void from_json(const Json& j, Finance& value);
void to_json(Json& j, const Archive& value);
void from_json(const Json& j, Archive& value);
void to_json(Json& j, const GameState& value);
void from_json(const Json& j, GameState& value);

Staff* find_staff(GameState& state, const std::string& id);
Project* find_work(GameState& state, const std::string& id);
const Project* find_work(const GameState& state, const std::string& id);
WorkItem* find_item(Project& work, const std::string& item_id);
const WorkItem* find_item(const Project& work, const std::string& item_id);
void for_each_item(Project& work, const std::function<void(WorkItem&, const std::string&, const std::string&)>& fn);

}  // namespace apc::v4
