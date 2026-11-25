#include "apc/v4/model.hpp"

#include <algorithm>
#include <initializer_list>
#include <limits>
#include <set>
#include <type_traits>

namespace apc::v4 {
namespace {

template <std::size_t N>
int index_of(const std::array<const char*, N>& names, const std::string& value) {
    for (std::size_t i = 0; i < N; ++i) {
        if (value == names[i]) return static_cast<int>(i);
    }
    return -1;
}

[[noreturn]] void type_error(const std::string& message) {
    throw Json::type_error::create(302, message, nullptr);
}

const Json& required(const Json& object, const char* key) {
    if (!object.is_object()) type_error(std::string("Expected object for field: ") + key);
    if (!object.contains(key)) type_error(std::string("Missing required field: ") + key);
    return object.at(key);
}

void exact_keys(const Json& object, std::initializer_list<const char*> keys) {
    if (!object.is_object()) type_error(std::string("Expected object with fields: ") + *keys.begin());
    std::set<std::string> allowed;
    for (const char* key : keys) allowed.insert(key);
    for (auto it = object.begin(); it != object.end(); ++it) {
        if (!allowed.count(it.key())) type_error("Unknown field: " + it.key());
    }
    for (const char* key : keys) required(object, key);
}

const Json& required_array(const Json& object, const char* key) {
    const auto& value = required(object, key);
    if (!value.is_array()) type_error(std::string("Expected array: ") + key);
    return value;
}

template <typename T>
T get_required(const Json& object, const char* key) {
    const auto& value = required(object, key);
    if constexpr (std::is_same_v<T, bool>) {
        if (!value.is_boolean()) type_error(std::string("Expected boolean: ") + key);
        return value.get<bool>();
    } else if constexpr (std::is_integral_v<T>) {
        if (!value.is_number_integer()) type_error(std::string("Expected integer: ") + key);
        if (value.is_number_unsigned()) {
            const auto number = value.get<std::uint64_t>();
            if (number > static_cast<std::uint64_t>(std::numeric_limits<T>::max()))
                type_error(std::string("Integer out of range: ") + key);
            return static_cast<T>(number);
        }
        const auto number = value.get<std::int64_t>();
        if (number < static_cast<std::int64_t>(std::numeric_limits<T>::min()) ||
            number > static_cast<std::int64_t>(std::numeric_limits<T>::max()))
            type_error(std::string("Integer out of range: ") + key);
        return static_cast<T>(number);
    } else {
        return value.get<T>();
    }
}

Json dims_to_json(const std::array<int, kDimensionCount>& dims) {
    Json out = Json::object();
    for (int i = 0; i < kDimensionCount; ++i) out[kDimensions[i]] = dims[i];
    return out;
}

std::array<int, kDimensionCount> dims_from_json(const Json& value) {
    exact_keys(value, {kDimensions[0], kDimensions[1], kDimensions[2], kDimensions[3], kDimensions[4], kDimensions[5]});
    std::array<int, kDimensionCount> dims{};
    for (int i = 0; i < kDimensionCount; ++i) dims[static_cast<std::size_t>(i)] = get_required<int>(value, kDimensions[i]);
    return dims;
}

Json abilities_to_json(const std::array<int, kAbilityCount>& values) {
    Json out = Json::object();
    for (int i = 0; i < kAbilityCount; ++i) out[kAbilities[i]] = values[i];
    return out;
}

std::array<int, kAbilityCount> abilities_from_json(const Json& value) {
    exact_keys(value, {kAbilities[0], kAbilities[1], kAbilities[2], kAbilities[3], kAbilities[4], kAbilities[5]});
    std::array<int, kAbilityCount> values{};
    for (int i = 0; i < kAbilityCount; ++i) values[static_cast<std::size_t>(i)] = get_required<int>(value, kAbilities[i]);
    return values;
}

Json bools_to_json(const std::array<bool, kAbilityCount>& values) {
    Json out = Json::object();
    for (int i = 0; i < kAbilityCount; ++i) out[kAbilities[i]] = values[i];
    return out;
}

std::array<bool, kAbilityCount> bools_from_json(const Json& value) {
    exact_keys(value, {kAbilities[0], kAbilities[1], kAbilities[2], kAbilities[3], kAbilities[4], kAbilities[5]});
    std::array<bool, kAbilityCount> values{};
    for (int i = 0; i < kAbilityCount; ++i) values[static_cast<std::size_t>(i)] = get_required<bool>(value, kAbilities[i]);
    return values;
}

std::vector<std::string> strings_from_json(const Json& value) {
    if (!value.is_array()) type_error("Expected string array");
    std::vector<std::string> out;
    for (const auto& item : value) {
        if (!item.is_string()) type_error("Expected string array item");
        out.push_back(item.get<std::string>());
    }
    return out;
}

std::optional<std::string> optional_string_from_json(const Json& value) {
    if (value.is_null()) return std::nullopt;
    if (!value.is_string()) type_error("Expected string or null");
    return value.get<std::string>();
}

std::optional<int> optional_int_from_json(const Json& value) {
    if (value.is_null()) return std::nullopt;
    if (!value.is_number_integer()) type_error("Expected integer or null");
    if (value.is_number_unsigned()) {
        const auto number = value.get<std::uint64_t>();
        if (number > static_cast<std::uint64_t>(std::numeric_limits<int>::max()))
            type_error("Integer out of range");
        return static_cast<int>(number);
    }
    const auto number = value.get<std::int64_t>();
    if (number < std::numeric_limits<int>::min() || number > std::numeric_limits<int>::max())
        type_error("Integer out of range");
    return static_cast<int>(number);
}

Json nullable(const std::optional<std::string>& value) { return value ? Json(*value) : Json(nullptr); }
Json nullable(const std::optional<int>& value) { return value ? Json(*value) : Json(nullptr); }

void validate_staff_snapshot(const Json& value) {
    if (!value.is_array()) type_error("Expected array: staff_snapshot");
    for (const auto& row : value) {
        exact_keys(row, {"staff_id", "name", "role", "contribution", "total_work"});
        get_required<std::string>(row, "staff_id");
        get_required<std::string>(row, "name");
        get_required<std::string>(row, "role");
        get_required<int>(row, "contribution");
        get_required<int>(row, "total_work");
    }
}

void validate_commercial_entries(const Json& value) {
    if (!value.is_array()) type_error("Expected array: commercial_entries");
    for (const auto& row : value) {
        exact_keys(row, {"category", "amount"});
        get_required<std::string>(row, "category");
        get_required<int64_t>(row, "amount");
    }
}

void validate_delivery_shape(const Json& value) {
    if (value.is_null()) return;
    exact_keys(value, {"delivered_week", "on_time", "forced", "quality", "staff_snapshot", "production_cost",
                       "commercial_entries", "commercial_income", "profit", "archive_id"});
    get_required<int>(value, "delivered_week");
    get_required<bool>(value, "on_time");
    get_required<bool>(value, "forced");
    dims_from_json(required(value, "quality"));
    validate_staff_snapshot(required(value, "staff_snapshot"));
    get_required<int64_t>(value, "production_cost");
    validate_commercial_entries(required(value, "commercial_entries"));
    get_required<int64_t>(value, "commercial_income");
    get_required<int64_t>(value, "profit");
    get_required<std::string>(value, "archive_id");
}

}  // namespace

const std::array<const char*, kAbilityCount> kAbilities{"planning", "direction", "drawing", "animation", "management", "postproduction"};
const std::array<const char*, kDimensionCount> kDimensions{"story", "direction", "drawing", "animation", "art", "sound"};
const std::array<const char*, kStageCount> kStages{"content_design", "storyboard_key_animation", "animation", "art_visual", "photography_editing", "sound_delivery"};

int ability_index(const std::string& name) { return index_of(kAbilities, name); }
int dimension_index(const std::string& name) { return index_of(kDimensions, name); }
int stage_index(const std::string& key) { return index_of(kStages, key); }

void to_json(Json& j, const Company& value) {
    Json log = Json::array();
    for (const auto& entry : value.reputation_log) {
        log.push_back({{"week", entry.week}, {"reason", entry.reason}, {"delta", entry.delta}, {"after", entry.after}});
    }
    j = Json{{"id", value.id}, {"name", value.name}, {"founded_week", value.founded_week}, {"week", value.week},
             {"status", value.status}, {"end_reason", nullable(value.end_reason)}, {"reputation", value.reputation},
             {"facilities", value.facilities}, {"reputation_log", log}};
}

void from_json(const Json& j, Company& value) {
    exact_keys(j, {"id", "name", "founded_week", "week", "status", "end_reason", "reputation", "facilities", "reputation_log"});
    value.id = get_required<std::string>(j, "id");
    value.name = get_required<std::string>(j, "name");
    value.founded_week = get_required<int>(j, "founded_week");
    value.week = get_required<int>(j, "week");
    value.status = get_required<std::string>(j, "status");
    value.end_reason = optional_string_from_json(required(j, "end_reason"));
    value.reputation = get_required<int64_t>(j, "reputation");
    value.facilities = strings_from_json(required(j, "facilities"));
    value.reputation_log.clear();
    for (const auto& entry : required_array(j, "reputation_log")) {
        exact_keys(entry, {"week", "reason", "delta", "after"});
        value.reputation_log.push_back(ReputationLog{get_required<int>(entry, "week"), get_required<std::string>(entry, "reason"),
                                                     get_required<int>(entry, "delta"), get_required<int64_t>(entry, "after")});
    }
}

void to_json(Json& j, const Staff& value) {
    Json last = nullptr;
    if (value.last_participation) {
        last = Json{{"work_id", value.last_participation->work_id}, {"item_id", value.last_participation->item_id},
                    {"week", value.last_participation->week}};
    }
    Json history = Json::array();
    for (const auto& entry : value.works_history) {
        history.push_back({{"work_id", entry.work_id}, {"contribution", entry.contribution}, {"total_work", entry.total_work}});
    }
    j = Json{{"id", value.id}, {"name", value.name}, {"role", value.role}, {"employment", value.employment},
             {"abilities", abilities_to_json(value.abilities)}, {"experience", abilities_to_json(value.experience)},
             {"potential", abilities_to_json(value.potential)}, {"revealed_potential", bools_to_json(value.revealed_potential)},
             {"traits", value.traits}, {"talent_type", value.talent_type}, {"weekly_salary", value.weekly_salary},
             {"project_fee", value.project_fee}, {"joined_week", value.joined_week}, {"fatigue", value.fatigue},
             {"morale", value.morale}, {"departure_warning", value.departure_warning},
             {"assignment_work_id", nullable(value.assignment_work_id)}, {"last_participation", last},
             {"works_history", history}, {"temporary_contract", value.temporary_contract}};
}

void from_json(const Json& j, Staff& value) {
    exact_keys(j, {"id", "name", "role", "employment", "abilities", "experience", "potential", "revealed_potential",
                   "traits", "talent_type", "weekly_salary", "project_fee", "joined_week", "fatigue", "morale",
                   "departure_warning", "assignment_work_id", "last_participation", "works_history", "temporary_contract"});
    value.id = get_required<std::string>(j, "id");
    value.name = get_required<std::string>(j, "name");
    value.role = get_required<std::string>(j, "role");
    value.employment = get_required<std::string>(j, "employment");
    value.abilities = abilities_from_json(required(j, "abilities"));
    value.experience = abilities_from_json(required(j, "experience"));
    value.potential = abilities_from_json(required(j, "potential"));
    value.revealed_potential = bools_from_json(required(j, "revealed_potential"));
    value.traits = strings_from_json(required(j, "traits"));
    value.talent_type = get_required<std::string>(j, "talent_type");
    value.weekly_salary = get_required<int64_t>(j, "weekly_salary");
    value.project_fee = get_required<int64_t>(j, "project_fee");
    value.joined_week = get_required<int>(j, "joined_week");
    value.fatigue = get_required<int>(j, "fatigue");
    value.morale = get_required<int>(j, "morale");
    value.departure_warning = get_required<bool>(j, "departure_warning");
    value.assignment_work_id = optional_string_from_json(required(j, "assignment_work_id"));
    const auto& last = required(j, "last_participation");
    if (last.is_null()) {
        value.last_participation.reset();
    } else {
        exact_keys(last, {"work_id", "item_id", "week"});
        value.last_participation = Participation{get_required<std::string>(last, "work_id"),
                                                 get_required<std::string>(last, "item_id"),
                                                 get_required<int>(last, "week")};
    }
    value.works_history.clear();
    for (const auto& entry : required_array(j, "works_history")) {
        exact_keys(entry, {"work_id", "contribution", "total_work"});
        value.works_history.push_back(WorkHistory{get_required<std::string>(entry, "work_id"),
                                                  get_required<int>(entry, "contribution"),
                                                  get_required<int>(entry, "total_work")});
    }
    value.temporary_contract = required(j, "temporary_contract");
    if (value.employment == "core") {
        if (!value.temporary_contract.is_null()) type_error("core temporary_contract must be null");
    } else if (value.employment == "temporary") {
        exact_keys(value.temporary_contract, {"work_id", "started_week"});
        get_required<std::string>(value.temporary_contract, "work_id");
        get_required<int>(value.temporary_contract, "started_week");
    } else {
        type_error("staff.employment invalid");
    }
}

void to_json(Json& j, const WorkItem& value) {
    j = Json{{"id", value.id}, {"key", value.key}, {"ability", value.ability}, {"work_total", value.work_total},
             {"work_done", value.work_done}, {"deliver_at", value.deliver_at}, {"deps", value.deps}, {"is_gate", value.is_gate},
             {"quality", dims_to_json(value.quality.dims)}, {"contributors", value.contributors}};
}

void from_json(const Json& j, WorkItem& value) {
    exact_keys(j, {"id", "key", "ability", "work_total", "work_done", "deliver_at", "deps", "is_gate", "quality", "contributors"});
    value.id = get_required<std::string>(j, "id");
    value.key = get_required<std::string>(j, "key");
    value.ability = get_required<std::string>(j, "ability");
    value.work_total = get_required<int>(j, "work_total");
    value.work_done = get_required<int>(j, "work_done");
    value.deliver_at = get_required<int>(j, "deliver_at");
    value.deps = strings_from_json(required(j, "deps"));
    value.is_gate = get_required<bool>(j, "is_gate");
    value.quality.dims = dims_from_json(required(j, "quality"));
    value.contributors = strings_from_json(required(j, "contributors"));
}

void to_json(Json& j, const Project& value) {
    Json common = Json{{"id", value.common.id}, {"items", Json::array()}};
    for (const auto& item : value.common.items) common["items"].push_back(item);
    Json episodes = Json::array();
    for (const auto& episode : value.episodes) {
        Json stages = Json::array();
        for (const auto& stage : episode.stages) {
            Json items = Json::array();
            for (const auto& item : stage.items) items.push_back(item);
            stages.push_back(Json{{"key", stage.key}, {"items", items}});
        }
        episodes.push_back(Json{{"id", episode.id}, {"index", episode.index}, {"stages", stages}});
    }
    Json target = nullptr;
    if (value.plan.target) target = Json{{"kind", value.plan.target->kind}, {"id", value.plan.target->id}};
    j = Json{{"id", value.id}, {"offer", value.offer}, {"mode", value.mode}, {"investment", value.investment},
             {"channels", value.channels}, {"opened_week", value.opened_week}, {"deadline_week", value.deadline_week},
             {"extension", value.extension}, {"status", value.status}, {"ip_id", nullable(value.ip_id)},
             {"committee_id", nullable(value.committee_id)}, {"tv_service", value.tv_service}, {"common", common},
             {"episodes", episodes}, {"plan", Json{{"intensity", value.plan.intensity}, {"focus", value.plan.focus},
                                                    {"outsourcing", value.plan.outsourcing}, {"overtime", value.plan.overtime},
                                                    {"target", target}}}, {"delivery", value.delivery}};
}

void from_json(const Json& j, Project& value) {
    exact_keys(j, {"id", "offer", "mode", "investment", "channels", "opened_week", "deadline_week", "extension", "status",
                   "ip_id", "committee_id", "tv_service", "common", "episodes", "plan", "delivery"});
    value.id = get_required<std::string>(j, "id");
    value.offer = required(j, "offer");
    if (!value.offer.is_object()) type_error("offer must be object");
    value.mode = get_required<std::string>(j, "mode");
    value.investment = required(j, "investment");
    exact_keys(value.investment, {"percent", "principal", "total"});
    get_required<int>(value.investment, "percent");
    get_required<int64_t>(value.investment, "principal");
    get_required<int64_t>(value.investment, "total");
    value.channels = strings_from_json(required(j, "channels"));
    value.opened_week = get_required<int>(j, "opened_week");
    value.deadline_week = get_required<int>(j, "deadline_week");
    value.extension = required(j, "extension");
    exact_keys(value.extension, {"used", "weeks"});
    get_required<int>(value.extension, "used");
    get_required<int>(value.extension, "weeks");
    value.status = get_required<std::string>(j, "status");
    value.ip_id = optional_string_from_json(required(j, "ip_id"));
    value.committee_id = optional_string_from_json(required(j, "committee_id"));
    value.tv_service = required(j, "tv_service");
    exact_keys(value.tv_service, {"status"});
    get_required<std::string>(value.tv_service, "status");
    const auto& common = required(j, "common");
    exact_keys(common, {"id", "items"});
    value.common.id = get_required<std::string>(common, "id");
    value.common.items.clear();
    for (const auto& item : required_array(common, "items")) value.common.items.push_back(item.get<WorkItem>());
    value.episodes.clear();
    for (const auto& episode : required_array(j, "episodes")) {
        exact_keys(episode, {"id", "index", "stages"});
        Episode parsed;
        parsed.id = get_required<std::string>(episode, "id");
        parsed.index = get_required<int>(episode, "index");
        for (const auto& stage : required_array(episode, "stages")) {
            exact_keys(stage, {"key", "items"});
            EpisodeStage parsed_stage;
            parsed_stage.key = get_required<std::string>(stage, "key");
            for (const auto& item : required_array(stage, "items")) parsed_stage.items.push_back(item.get<WorkItem>());
            parsed.stages.push_back(std::move(parsed_stage));
        }
        value.episodes.push_back(std::move(parsed));
    }
    const auto& plan = required(j, "plan");
    exact_keys(plan, {"intensity", "focus", "outsourcing", "overtime", "target"});
    value.plan.intensity = get_required<std::string>(plan, "intensity");
    value.plan.focus = get_required<std::string>(plan, "focus");
    value.plan.outsourcing = get_required<std::string>(plan, "outsourcing");
    value.plan.overtime = get_required<std::string>(plan, "overtime");
    const auto& target = required(plan, "target");
    if (target.is_null()) {
        value.plan.target.reset();
    } else {
        exact_keys(target, {"kind", "id"});
        value.plan.target = Target{get_required<std::string>(target, "kind"), get_required<std::string>(target, "id")};
    }
    value.delivery = required(j, "delivery");
    validate_delivery_shape(value.delivery);
}

void to_json(Json& j, const EventState& value) {
    Json pending = Json::array();
    for (const auto& event : value.pending) {
        pending.push_back(Json{{"instance_id", event.instance_id}, {"event_id", event.event_id}, {"work_id", event.work_id}, {"episode_id", event.episode_id},
                               {"stage_key", event.stage_key}, {"item_id", event.item_id}, {"triggered_week", event.triggered_week},
                               {"expires_week", event.expires_week}, {"status", event.status}, {"option_ids", event.option_ids},
                               {"escalation", event.escalation}});
    }
    j = Json{{"pending", pending}, {"last_event_week", nullable(value.last_event_week)}, {"per_work", value.per_work}};
}

void from_json(const Json& j, EventState& value) {
    exact_keys(j, {"pending", "last_event_week", "per_work"});
    value.pending.clear();
    for (const auto& event : required_array(j, "pending")) {
        exact_keys(event, {"instance_id", "event_id", "work_id", "episode_id", "stage_key", "item_id", "triggered_week", "expires_week",
                           "status", "option_ids", "escalation"});
        value.pending.push_back(EventInstance{get_required<std::string>(event, "instance_id"),
                                              get_required<std::string>(event, "event_id"),
                                              get_required<std::string>(event, "work_id"),
                                              get_required<std::string>(event, "episode_id"),
                                              get_required<std::string>(event, "stage_key"),
                                              get_required<std::string>(event, "item_id"),
                                              get_required<int>(event, "triggered_week"),
                                              get_required<int>(event, "expires_week"),
                                              get_required<std::string>(event, "status"),
                                              strings_from_json(required(event, "option_ids")),
                                              required(event, "escalation")});
    }
    value.last_event_week = optional_int_from_json(required(j, "last_event_week"));
    value.per_work = required(j, "per_work");
    if (!value.per_work.is_object()) type_error("per_work must be object");
}

void to_json(Json& j, const Finance& value) {
    Json entries = Json::array();
    for (const auto& entry : value.entries) {
        entries.push_back(Json{{"id", entry.id}, {"week", entry.week}, {"work_id", nullable(entry.work_id)},
                               {"category", entry.category}, {"amount", entry.amount}, {"counterparty", nullable(entry.counterparty)},
                               {"memo", entry.memo}});
    }
    j = Json{{"opening_funds", value.opening_funds}, {"balance", value.balance}, {"entries", entries}, {"loans", value.loans},
             {"solvency", Json{{"state", value.solvency.state}, {"since_week", nullable(value.solvency.since_week)},
                                {"deadline_week", nullable(value.solvency.deadline_week)}, {"gap", value.solvency.gap}}}};
}

void from_json(const Json& j, Finance& value) {
    exact_keys(j, {"opening_funds", "balance", "entries", "loans", "solvency"});
    value.opening_funds = get_required<int64_t>(j, "opening_funds");
    value.balance = get_required<int64_t>(j, "balance");
    value.entries.clear();
    for (const auto& entry : required_array(j, "entries")) {
        exact_keys(entry, {"id", "week", "work_id", "category", "amount", "counterparty", "memo"});
        value.entries.push_back(LedgerEntry{get_required<std::string>(entry, "id"), get_required<int>(entry, "week"),
                                            optional_string_from_json(required(entry, "work_id")),
                                            get_required<std::string>(entry, "category"), get_required<int64_t>(entry, "amount"),
                                            optional_string_from_json(required(entry, "counterparty")),
                                            get_required<std::string>(entry, "memo")});
    }
    value.loans = required(j, "loans");
    if (!value.loans.is_array()) type_error("loans must be array");
    const auto& solvency = required(j, "solvency");
    exact_keys(solvency, {"state", "since_week", "deadline_week", "gap"});
    value.solvency.state = get_required<std::string>(solvency, "state");
    value.solvency.since_week = optional_int_from_json(required(solvency, "since_week"));
    value.solvency.deadline_week = optional_int_from_json(required(solvency, "deadline_week"));
    value.solvency.gap = get_required<int64_t>(solvency, "gap");
}

void to_json(Json& j, const Archive& value) {
    Json works = Json::array();
    for (const auto& record : value.works) {
        works.push_back(Json{{"id", record.id}, {"work_id", record.work_id}, {"title", record.title}, {"mode", record.mode},
                             {"opened_week", record.opened_week}, {"delivered_week", record.delivered_week},
                             {"deadline_week", record.deadline_week}, {"on_time", record.on_time}, {"quality", record.quality},
                             {"staff_snapshot", record.staff_snapshot}, {"production_cost", record.production_cost},
                             {"commercial_income", record.commercial_income}, {"profit", record.profit}});
    }
    j = Json{{"works", works}, {"series", value.series}, {"company_result", value.company_result}};
}

void from_json(const Json& j, Archive& value) {
    exact_keys(j, {"works", "series", "company_result"});
    value.works.clear();
    for (const auto& record : required_array(j, "works")) {
        exact_keys(record, {"id", "work_id", "title", "mode", "opened_week", "delivered_week", "deadline_week", "on_time",
                            "quality", "staff_snapshot", "production_cost", "commercial_income", "profit"});
        dims_from_json(required(record, "quality"));
        validate_staff_snapshot(required(record, "staff_snapshot"));
        value.works.push_back(WorkRecord{get_required<std::string>(record, "id"), get_required<std::string>(record, "work_id"),
                                         get_required<std::string>(record, "title"), get_required<std::string>(record, "mode"),
                                         get_required<int>(record, "opened_week"), get_required<int>(record, "delivered_week"),
                                         get_required<int>(record, "deadline_week"), get_required<bool>(record, "on_time"),
                                         required(record, "quality"), required(record, "staff_snapshot"),
                                         get_required<int64_t>(record, "production_cost"),
                                         get_required<int64_t>(record, "commercial_income"), get_required<int64_t>(record, "profit")});
    }
    value.series = required(j, "series");
    if (!value.series.is_array()) type_error("series must be array");
    value.company_result = required(j, "company_result");
}

void to_json(Json& j, const GameState& value) {
    Json staff = Json::array();
    for (const auto& member : value.staff) staff.push_back(member);
    Json works = Json::array();
    for (const auto& work : value.works) works.push_back(work);
    j = Json{{"version", value.version}, {"seed", value.seed}, {"company", value.company}, {"staff", staff}, {"works", works},
             {"suppliers", value.suppliers}, {"contracts", value.contracts}, {"partners", value.partners},
             {"committees", value.committees}, {"market", value.market}, {"events", value.events}, {"finance", value.finance},
             {"archive", value.archive}};
}

void from_json(const Json& j, GameState& value) {
    exact_keys(j, {"version", "seed", "company", "staff", "works", "suppliers", "contracts", "partners", "committees",
                   "market", "events", "finance", "archive"});
    value.version = get_required<int>(j, "version");
    const auto& seed = required(j, "seed");
    if (!seed.is_number_unsigned() && !seed.is_number_integer()) type_error("seed must be integer");
    const int64_t seed_value = seed.get<int64_t>();
    if (seed_value < 0 || seed_value > 0xFFFFFFFFLL) type_error("seed out of range");
    value.seed = static_cast<std::uint32_t>(seed_value);
    value.company = required(j, "company").get<Company>();
    value.staff.clear();
    for (const auto& member : required_array(j, "staff")) value.staff.push_back(member.get<Staff>());
    value.works.clear();
    for (const auto& work : required_array(j, "works")) value.works.push_back(work.get<Project>());
    value.suppliers = required(j, "suppliers");
    value.contracts = required(j, "contracts");
    value.partners = required(j, "partners");
    value.committees = required(j, "committees");
    if (!value.suppliers.is_array() || !value.contracts.is_array() || !value.partners.is_array() || !value.committees.is_array()) {
        type_error("suppliers/contracts/partners/committees must be arrays");
    }
    value.market = required(j, "market");
    exact_keys(value.market, {"slots"});
    required_array(value.market, "slots");
    value.events = required(j, "events").get<EventState>();
    value.finance = required(j, "finance").get<Finance>();
    value.archive = required(j, "archive").get<Archive>();
}

Staff* find_staff(GameState& state, const std::string& id) {
    for (auto& member : state.staff) if (member.id == id) return &member;
    return nullptr;
}

Project* find_work(GameState& state, const std::string& id) {
    for (auto& work : state.works) if (work.id == id) return &work;
    return nullptr;
}

const Project* find_work(const GameState& state, const std::string& id) {
    for (const auto& work : state.works) if (work.id == id) return &work;
    return nullptr;
}

WorkItem* find_item(Project& work, const std::string& item_id) {
    for (auto& item : work.common.items) if (item.id == item_id) return &item;
    for (auto& episode : work.episodes) {
        for (auto& stage : episode.stages) {
            for (auto& item : stage.items) if (item.id == item_id) return &item;
        }
    }
    return nullptr;
}

const WorkItem* find_item(const Project& work, const std::string& item_id) {
    for (const auto& item : work.common.items) if (item.id == item_id) return &item;
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            for (const auto& item : stage.items) if (item.id == item_id) return &item;
        }
    }
    return nullptr;
}

void for_each_item(Project& work, const std::function<void(WorkItem&, const std::string&, const std::string&)>& fn) {
    for (auto& item : work.common.items) fn(item, std::string(), std::string());
    for (auto& episode : work.episodes) {
        for (auto& stage : episode.stages) {
            for (auto& item : stage.items) fn(item, episode.id, stage.key);
        }
    }
}

bool Project::deliverable() const {
    bool any_gate = false;
    for (const auto& episode : episodes) {
        for (const auto& stage : episode.stages) {
            for (const auto& item : stage.items) {
                if (!item.is_gate) continue;
                any_gate = true;
                if (!item.delivered()) return false;
            }
        }
    }
    return any_gate;
}

}  // namespace apc::v4
