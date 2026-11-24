#include "apc/v4/model.hpp"

#include <algorithm>

namespace apc::v4 {

const std::array<const char*, kAbilityCount> kAbilities{"planning", "direction", "drawing", "animation", "management", "postproduction"};
const std::array<const char*, kDimensionCount> kDimensions{"story", "direction", "drawing", "animation", "art", "sound"};
const std::array<const char*, kStageCount> kStages{"content_design", "storyboard_key_animation", "animation", "art_visual", "photography_editing", "sound_delivery"};

namespace {
template <std::size_t N>
int index_of(const std::array<const char*, N>& names, const std::string& value) {
    for (std::size_t i = 0; i < N; ++i) {
        if (value == names[i]) return static_cast<int>(i);
    }
    return -1;
}

Json dims_to_json(const std::array<int, kDimensionCount>& dims) {
    Json out = Json::object();
    for (int i = 0; i < kDimensionCount; ++i) out[kDimensions[i]] = dims[i];
    return out;
}

std::array<int, kDimensionCount> dims_from_json(const Json& value, int fallback = 0) {
    std::array<int, kDimensionCount> dims{};
    dims.fill(fallback);
    if (!value.is_object()) return dims;
    for (int i = 0; i < kDimensionCount; ++i) {
        if (value.contains(kDimensions[i]) && value.at(kDimensions[i]).is_number_integer()) {
            dims[i] = value.at(kDimensions[i]).get<int>();
        }
    }
    return dims;
}

Json abilities_to_json(const std::array<int, kAbilityCount>& values) {
    Json out = Json::object();
    for (int i = 0; i < kAbilityCount; ++i) out[kAbilities[i]] = values[i];
    return out;
}

std::array<int, kAbilityCount> abilities_from_json(const Json& value) {
    std::array<int, kAbilityCount> values{};
    if (!value.is_object()) return values;
    for (int i = 0; i < kAbilityCount; ++i) {
        if (value.contains(kAbilities[i]) && value.at(kAbilities[i]).is_number_integer()) {
            values[i] = value.at(kAbilities[i]).get<int>();
        }
    }
    return values;
}

Json bools_to_json(const std::array<bool, kAbilityCount>& values) {
    Json out = Json::object();
    for (int i = 0; i < kAbilityCount; ++i) out[kAbilities[i]] = values[i];
    return out;
}

std::array<bool, kAbilityCount> bools_from_json(const Json& value) {
    std::array<bool, kAbilityCount> values{};
    if (!value.is_object()) return values;
    for (int i = 0; i < kAbilityCount; ++i) {
        if (value.contains(kAbilities[i]) && value.at(kAbilities[i]).is_boolean()) {
            values[i] = value.at(kAbilities[i]).get<bool>();
        }
    }
    return values;
}

std::vector<std::string> strings_from_json(const Json& value) {
    std::vector<std::string> out;
    if (!value.is_array()) return out;
    for (const auto& item : value) {
        if (item.is_string()) out.push_back(item.get<std::string>());
    }
    return out;
}
}  // namespace

int ability_index(const std::string& name) { return index_of(kAbilities, name); }
int dimension_index(const std::string& name) { return index_of(kDimensions, name); }
int stage_index(const std::string& key) { return index_of(kStages, key); }

// ---------------- Company ----------------
void to_json(Json& j, const Company& value) {
    Json log = Json::array();
    for (const auto& entry : value.reputation_log) {
        log.push_back({{"week", entry.week}, {"reason", entry.reason}, {"delta", entry.delta}, {"after", entry.after}});
    }
    j = Json{{"id", value.id},
             {"name", value.name},
             {"founded_week", value.founded_week},
             {"week", value.week},
             {"status", value.status},
             {"end_reason", value.end_reason ? Json(*value.end_reason) : Json(nullptr)},
             {"reputation", value.reputation},
             {"reputation_log", log}};
}

void from_json(const Json& j, Company& value) {
    value.id = j.value("id", std::string{});
    value.name = j.value("name", std::string{});
    value.founded_week = j.value("founded_week", 0);
    value.week = j.value("week", 0);
    value.status = j.value("status", std::string{"running"});
    if (j.contains("end_reason") && j.at("end_reason").is_string()) value.end_reason = j.at("end_reason").get<std::string>();
    else value.end_reason.reset();
    value.reputation = j.value("reputation", static_cast<std::int64_t>(0));
    value.reputation_log.clear();
    if (j.contains("reputation_log") && j.at("reputation_log").is_array()) {
        for (const auto& entry : j.at("reputation_log")) {
            value.reputation_log.push_back(ReputationLog{entry.value("week", 0), entry.value("reason", std::string{}),
                                                         entry.value("delta", 0), entry.value("after", static_cast<std::int64_t>(0))});
        }
    }
}

// ---------------- Staff ----------------
void to_json(Json& j, const Staff& value) {
    Json last = nullptr;
    if (value.last_participation) {
        last = Json{{"work_id", value.last_participation->work_id},
                    {"item_id", value.last_participation->item_id},
                    {"week", value.last_participation->week}};
    }
    j = Json{{"id", value.id},
             {"name", value.name},
             {"role", value.role},
             {"employment", value.employment},
             {"abilities", abilities_to_json(value.abilities)},
             {"experience", abilities_to_json(value.experience)},
             {"potential", abilities_to_json(value.potential)},
             {"revealed_potential", bools_to_json(value.revealed_potential)},
             {"talent_type", value.talent_type},
             {"weekly_salary", value.weekly_salary},
             {"project_fee", value.project_fee},
             {"fatigue", value.fatigue},
             {"morale", value.morale},
             {"departure_warning", value.departure_warning},
             {"assignment_work_id", value.assignment_work_id ? Json(*value.assignment_work_id) : Json(nullptr)},
             {"last_participation", last},
             {"temporary_contract", value.temporary_contract}};
}

void from_json(const Json& j, Staff& value) {
    value.id = j.value("id", std::string{});
    value.name = j.value("name", std::string{});
    value.role = j.value("role", std::string{});
    value.employment = j.value("employment", std::string{"core"});
    value.abilities = abilities_from_json(j.value("abilities", Json::object()));
    value.experience = abilities_from_json(j.value("experience", Json::object()));
    value.potential = abilities_from_json(j.value("potential", Json::object()));
    value.revealed_potential = bools_from_json(j.value("revealed_potential", Json::object()));
    value.talent_type = j.value("talent_type", std::string{});
    value.weekly_salary = j.value("weekly_salary", static_cast<std::int64_t>(0));
    value.project_fee = j.value("project_fee", static_cast<std::int64_t>(0));
    value.fatigue = j.value("fatigue", 0);
    value.morale = j.value("morale", 0);
    value.departure_warning = j.value("departure_warning", false);
    if (j.contains("assignment_work_id") && j.at("assignment_work_id").is_string()) {
        value.assignment_work_id = j.at("assignment_work_id").get<std::string>();
    } else {
        value.assignment_work_id.reset();
    }
    if (j.contains("last_participation") && j.at("last_participation").is_object()) {
        const auto& last = j.at("last_participation");
        value.last_participation = Participation{last.value("work_id", std::string{}), last.value("item_id", std::string{}), last.value("week", 0)};
    } else {
        value.last_participation.reset();
    }
    value.temporary_contract = j.value("temporary_contract", Json(nullptr));
}

// ---------------- WorkItem ----------------
void to_json(Json& j, const WorkItem& value) {
    j = Json{{"id", value.id},
             {"key", value.key},
             {"ability", value.ability},
             {"work_total", value.work_total},
             {"work_done", value.work_done},
             {"deliver_at", value.deliver_at},
             {"deps", value.deps},
             {"is_gate", value.is_gate},
             {"quality", dims_to_json(value.quality.dims)},
             {"contributors", value.contributors}};
}

void from_json(const Json& j, WorkItem& value) {
    value.id = j.value("id", std::string{});
    value.key = j.value("key", std::string{});
    value.ability = j.value("ability", std::string{});
    value.work_total = j.value("work_total", 0);
    value.work_done = j.value("work_done", 0);
    value.deliver_at = j.value("deliver_at", 1000);
    value.deps = strings_from_json(j.value("deps", Json::array()));
    value.is_gate = j.value("is_gate", false);
    value.quality.dims = dims_from_json(j.value("quality", Json::object()));
    value.contributors = strings_from_json(j.value("contributors", Json::array()));
}

// ---------------- Project ----------------
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

    j = Json{{"id", value.id},
             {"offer", value.offer},
             {"mode", value.mode},
             {"investment", value.investment},
             {"channels", value.channels},
             {"opened_week", value.opened_week},
             {"deadline_week", value.deadline_week},
             {"extension", value.extension},
             {"status", value.status},
             {"common", common},
             {"episodes", episodes},
             {"plan", Json{{"intensity", value.plan.intensity},
                           {"focus", value.plan.focus},
                           {"outsourcing", value.plan.outsourcing},
                           {"overtime", value.plan.overtime},
                           {"target", target}}},
             {"delivery", value.delivery}};
}

void from_json(const Json& j, Project& value) {
    value.id = j.value("id", std::string{});
    value.offer = j.value("offer", Json::object());
    value.mode = j.value("mode", std::string{"contract"});
    value.investment = j.value("investment", Json::object());
    value.channels = strings_from_json(j.value("channels", Json::array()));
    value.opened_week = j.value("opened_week", 0);
    value.deadline_week = j.value("deadline_week", 0);
    value.extension = j.value("extension", Json::object());
    value.status = j.value("status", std::string{"producing"});
    value.delivery = j.value("delivery", Json(nullptr));

    const auto& common = j.value("common", Json::object());
    value.common.id = common.value("id", std::string{});
    value.common.items.clear();
    if (common.contains("items") && common.at("items").is_array()) {
        for (const auto& item : common.at("items")) value.common.items.push_back(item.get<WorkItem>());
    }

    value.episodes.clear();
    for (const auto& episode : j.value("episodes", Json::array())) {
        Episode parsed;
        parsed.id = episode.value("id", std::string{});
        parsed.index = episode.value("index", 0);
        for (const auto& stage : episode.value("stages", Json::array())) {
            EpisodeStage parsed_stage;
            parsed_stage.key = stage.value("key", std::string{});
            for (const auto& item : stage.value("items", Json::array())) parsed_stage.items.push_back(item.get<WorkItem>());
            parsed.stages.push_back(std::move(parsed_stage));
        }
        value.episodes.push_back(std::move(parsed));
    }

    const auto& plan = j.value("plan", Json::object());
    value.plan.intensity = plan.value("intensity", std::string{"standard"});
    value.plan.focus = plan.value("focus", std::string{"quality"});
    value.plan.outsourcing = plan.value("outsourcing", std::string{"gap_fill"});
    value.plan.overtime = plan.value("overtime", false);
    if (plan.contains("target") && plan.at("target").is_object()) {
        value.plan.target = Target{plan.at("target").value("kind", std::string{}), plan.at("target").value("id", std::string{})};
    } else {
        value.plan.target.reset();
    }
}

// ---------------- Finance ----------------
void to_json(Json& j, const Finance& value) {
    Json entries = Json::array();
    for (const auto& entry : value.entries) {
        entries.push_back(Json{{"id", entry.id},
                               {"week", entry.week},
                               {"work_id", entry.work_id ? Json(*entry.work_id) : Json(nullptr)},
                               {"category", entry.category},
                               {"amount", entry.amount},
                               {"counterparty", entry.counterparty ? Json(*entry.counterparty) : Json(nullptr)},
                               {"memo", entry.memo}});
    }
    j = Json{{"opening_funds", value.opening_funds},
             {"balance", value.balance},
             {"entries", entries},
             {"loans", value.loans},
             {"solvency",
              Json{{"state", value.solvency.state},
                   {"since_week", value.solvency.since_week ? Json(*value.solvency.since_week) : Json(nullptr)},
                   {"deadline_week", value.solvency.deadline_week ? Json(*value.solvency.deadline_week) : Json(nullptr)},
                   {"gap", value.solvency.gap}}}};
}

void from_json(const Json& j, Finance& value) {
    value.opening_funds = j.value("opening_funds", static_cast<std::int64_t>(0));
    value.balance = j.value("balance", static_cast<std::int64_t>(0));
    value.entries.clear();
    for (const auto& entry : j.value("entries", Json::array())) {
        LedgerEntry parsed;
        parsed.id = entry.value("id", std::string{});
        parsed.week = entry.value("week", 0);
        if (entry.contains("work_id") && entry.at("work_id").is_string()) parsed.work_id = entry.at("work_id").get<std::string>();
        parsed.category = entry.value("category", std::string{});
        parsed.amount = entry.value("amount", static_cast<std::int64_t>(0));
        if (entry.contains("counterparty") && entry.at("counterparty").is_string()) parsed.counterparty = entry.at("counterparty").get<std::string>();
        parsed.memo = entry.value("memo", std::string{});
        value.entries.push_back(std::move(parsed));
    }
    value.loans = j.value("loans", Json::array());
    const auto& solvency = j.value("solvency", Json::object());
    value.solvency.state = solvency.value("state", std::string{"normal"});
    value.solvency.gap = solvency.value("gap", static_cast<std::int64_t>(0));
    if (solvency.contains("since_week") && solvency.at("since_week").is_number_integer()) value.solvency.since_week = solvency.at("since_week").get<int>();
    else value.solvency.since_week.reset();
    if (solvency.contains("deadline_week") && solvency.at("deadline_week").is_number_integer()) value.solvency.deadline_week = solvency.at("deadline_week").get<int>();
    else value.solvency.deadline_week.reset();
}

// ---------------- GameState ----------------
void to_json(Json& j, const GameState& value) {
    Json staff = Json::array();
    for (const auto& member : value.staff) staff.push_back(member);
    Json works = Json::array();
    for (const auto& work : value.works) works.push_back(work);
    j = Json{{"version", value.version},
             {"seed", value.seed},
             {"company", value.company},
             {"staff", staff},
             {"works", works},
             {"suppliers", value.suppliers},
             {"contracts", value.contracts},
             {"partners", value.partners},
             {"committees", value.committees},
             {"market", value.market},
             {"events", value.events},
             {"finance", value.finance},
             {"archive", value.archive}};
}

void from_json(const Json& j, GameState& value) {
    value.version = j.value("version", 0);
    value.seed = j.value("seed", static_cast<std::uint32_t>(0));
    value.company = j.at("company").get<Company>();
    value.staff.clear();
    for (const auto& member : j.value("staff", Json::array())) value.staff.push_back(member.get<Staff>());
    value.works.clear();
    for (const auto& work : j.value("works", Json::array())) value.works.push_back(work.get<Project>());
    value.suppliers = j.value("suppliers", Json::array());
    value.contracts = j.value("contracts", Json::array());
    value.partners = j.value("partners", Json::array());
    value.committees = j.value("committees", Json::array());
    value.market = j.value("market", Json::object());
    value.events = j.value("events", Json::object());
    value.finance = j.at("finance").get<Finance>();
    value.archive = j.value("archive", Json::object());
}

// ---------------- 查询 ----------------
Staff* find_staff(GameState& state, const std::string& id) {
    for (auto& member : state.staff) {
        if (member.id == id) return &member;
    }
    return nullptr;
}

Project* find_work(GameState& state, const std::string& id) {
    for (auto& work : state.works) {
        if (work.id == id) return &work;
    }
    return nullptr;
}

const Project* find_work(const GameState& state, const std::string& id) {
    for (const auto& work : state.works) {
        if (work.id == id) return &work;
    }
    return nullptr;
}

WorkItem* find_item(Project& work, const std::string& item_id) {
    for (auto& item : work.common.items) {
        if (item.id == item_id) return &item;
    }
    for (auto& episode : work.episodes) {
        for (auto& stage : episode.stages) {
            for (auto& item : stage.items) {
                if (item.id == item_id) return &item;
            }
        }
    }
    return nullptr;
}

const WorkItem* find_item(const Project& work, const std::string& item_id) {
    for (const auto& item : work.common.items) {
        if (item.id == item_id) return &item;
    }
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            for (const auto& item : stage.items) {
                if (item.id == item_id) return &item;
            }
        }
    }
    return nullptr;
}

void for_each_item(Project& work, const std::function<void(WorkItem&, const std::string&, const std::string&)>& fn) {
    for (auto& item : work.common.items) fn(item, std::string{}, std::string{});
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
