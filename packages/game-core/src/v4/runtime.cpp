#include "apc/v4/runtime.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdint>
#include <initializer_list>
#include <limits>
#include <map>
#include <set>
#include <string>
#include <tuple>
#include <vector>

#include "apc/v4/kernel.hpp"

namespace apc::v4 {
namespace {

using Json = nlohmann::json;

constexpr int kMoraleWorkPenalty = 2;
constexpr int kMoraleRestGain = 1;
constexpr int kFatigueWorkGain = 8;
constexpr int kFatigueRestLoss = 4;
constexpr int kExperienceThreshold = 20;

Json error_body(const char* code, const std::string& message) { return Json{{"error", {{"code", code}, {"message", message}}}}; }

std::string encode(const Json& value) { return value.dump(); }

int clamp_int(int value, int low, int high) { return std::max(low, std::min(high, value)); }

bool checked_add(std::int64_t left, std::int64_t right, std::int64_t& out) {
    if ((right > 0 && left > INT64_MAX - right) || (right < 0 && left < INT64_MIN - right)) return false;
    out = left + right;
    return true;
}

bool snake_segment(const std::string& value) {
    if (value.empty() || value.size() > 40 || value.front() < 'a' || value.front() > 'z') return false;
    for (const char ch : value)
        if (!((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '_')) return false;
    return true;
}

bool snake_id(const std::string& value) {
    return value.size() >= 3 && snake_segment(value);
}

bool dotted_id(const std::string& value) {
    std::size_t start = 0;
    while (start < value.size()) {
        const std::size_t end = value.find('.', start);
        if (!snake_segment(value.substr(start, end == std::string::npos ? std::string::npos : end - start))) return false;
        if (end == std::string::npos) return true;
        start = end + 1;
    }
    return false;
}

std::size_t text_length(const std::string& value) {
    return static_cast<std::size_t>(std::count_if(value.begin(), value.end(), [](unsigned char ch) { return (ch & 0xC0U) != 0x80U; }));
}

bool iso8601_timestamp(const std::string& value) {
    if (value.size() < 20 || value[4] != '-' || value[7] != '-' || value[10] != 'T' || value[13] != ':' || value[16] != ':') return false;
    for (std::size_t i = 0; i < 19; ++i)
        if (i != 4 && i != 7 && i != 10 && i != 13 && i != 16 && (value[i] < '0' || value[i] > '9')) return false;
    auto number = [&value](std::size_t at, std::size_t count) {
        int out = 0;
        for (std::size_t i = 0; i < count; ++i) out = out * 10 + (value[at + i] - '0');
        return out;
    };
    const int year = number(0, 4);
    const int month = number(5, 2);
    const int day = number(8, 2);
    const int hour = number(11, 2);
    const int minute = number(14, 2);
    const int second = number(17, 2);
    if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
    const int month_days[] = {31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
    int max_day = month_days[month - 1];
    if (month == 2 && (year % 400 == 0 || (year % 4 == 0 && year % 100 != 0))) max_day = 29;
    if (day < 1 || day > max_day) return false;
    std::size_t at = 19;
    if (at < value.size() && value[at] == '.') {
        ++at;
        const std::size_t start = at;
        while (at < value.size() && value[at] >= '0' && value[at] <= '9') ++at;
        if (at == start) return false;
    }
    if (at == value.size() - 1 && value[at] == 'Z') return true;
    if (at + 6 != value.size() || (value[at] != '+' && value[at] != '-') || value[at + 3] != ':') return false;
    for (std::size_t i = 1; i < 6; ++i) if (i != 3 && (value[at + i] < '0' || value[at + i] > '9')) return false;
    const int offset_hour = number(at + 1, 2);
    const int offset_minute = number(at + 4, 2);
    return offset_hour <= 14 && offset_minute <= 59 && !(offset_hour == 14 && offset_minute != 0);
}

std::uint64_t fnv1a64(const std::string& text) {
    std::uint64_t hash = 1469598103934665603ULL;
    for (const unsigned char ch : text) {
        hash ^= ch;
        hash *= 1099511628211ULL;
    }
    return hash;
}

std::string hex64(std::uint64_t value) {
    static const char* digits = "0123456789abcdef";
    std::string out(16, '0');
    for (int i = 15; i >= 0; --i) {
        out[static_cast<std::size_t>(i)] = digits[value & 0xFULL];
        value >>= 4U;
    }
    return out;
}

void walk_items(const Project& work, const std::function<void(const WorkItem&)>& fn) {
    for (const auto& item : work.common.items) fn(item);
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            for (const auto& item : stage.items) fn(item);
        }
    }
}

// 依赖环检测：Kahn
bool has_cycle(const Project& work) {
    std::map<std::string, std::vector<std::string>> deps;
    std::map<std::string, int> indegree;
    walk_items(work, [&deps, &indegree](const WorkItem& item) {
        deps[item.id] = item.deps;
        indegree.emplace(item.id, static_cast<int>(item.deps.size()));
    });
    std::vector<std::string> queue;
    for (const auto& [id, degree] : indegree) {
        if (degree == 0) queue.push_back(id);
    }
    std::size_t visited = 0;
    while (!queue.empty()) {
        const std::string current = queue.back();
        queue.pop_back();
        ++visited;
        for (auto& [id, list] : deps) {
            if (std::find(list.begin(), list.end(), current) == list.end()) continue;
            if (--indegree[id] == 0) queue.push_back(id);
        }
    }
    return visited != indegree.size();
}

bool instantiate(const Json& blueprint, const std::string& work_id, int opened_week, int duration_weeks,
                 int workload_scale_permille, Project& out, std::string& error) {
    if (!blueprint.is_object()) { error = "blueprint 必须是对象"; return false; }
    auto fail = [&error](const std::string& message) { error = message; return false; };
    auto keys = [&fail](const Json& value, std::initializer_list<const char*> allowed,
                        std::initializer_list<const char*> optional = {}) {
        if (!value.is_object()) return fail("blueprint 节点必须是对象");
        std::set<std::string> names;
        std::set<std::string> optional_names;
        for (const char* name : allowed) names.insert(name);
        for (const char* name : optional) optional_names.insert(name);
        for (auto it = value.begin(); it != value.end(); ++it)
            if (!names.count(it.key())) return fail("blueprint 含未知字段: " + it.key());
        for (const char* name : allowed)
            if (!value.contains(name) && !optional_names.count(name)) return fail(std::string("blueprint 缺少字段: ") + name);
        return true;
    };
    auto text = [](const Json& value, const char* name) {
        if (!value.contains(name) || !value.at(name).is_string() || value.at(name).get<std::string>().empty())
            return std::string{};
        return value.at(name).get<std::string>();
    };
    auto integer = [&fail](const Json& value, const char* name) {
        if (!value.contains(name) || !value.at(name).is_number_integer()) {
            fail(std::string("blueprint 数值字段类型非法: ") + name);
            return 0;
        }
        const auto number = value.at(name).get<std::int64_t>();
        if (number < std::numeric_limits<int>::min() || number > std::numeric_limits<int>::max()) {
            fail(std::string("blueprint 数值越界: ") + name);
            return 0;
        }
        return static_cast<int>(number);
    };
    auto check_root = keys(blueprint, {"schema_version", "id", "name", "scale", "episode_count", "work_unit", "common", "episode", "notes"}, {"notes"});
    if (!check_root) return false;
    for (const char* name : {"id", "name", "scale", "work_unit"})
        if (text(blueprint, name).empty()) return fail(std::string("blueprint 缺少非空字段: ") + name);
    if (blueprint.contains("notes") && !blueprint.at("notes").is_string()) return fail("blueprint.notes 必须是字符串");
    if (integer(blueprint, "schema_version") != 1) return fail("blueprint.schema_version 必须为 1");
    if (blueprint.at("work_unit").get<std::string>() != "centi_staff_week") return fail("blueprint.work_unit 非法");
    if (!std::set<std::string>{"ova", "short", "tv", "movie"}.count(blueprint.at("scale").get<std::string>()))
        return fail("blueprint.scale 非法");
    const int episode_count = integer(blueprint, "episode_count");
    if (episode_count <= 0) return fail("blueprint.episode_count 必须为正");
    if (workload_scale_permille <= 0 || workload_scale_permille > 10000) return fail("workload_scale_permille 必须在 1..10000");
    if (!blueprint.at("common").is_array() || blueprint.at("common").empty()) return fail("blueprint.common 必须是非空数组");
    if (!blueprint.at("episode").is_array() || blueprint.at("episode").empty()) return fail("blueprint.episode 必须是非空数组");

    auto map_dep = [&work_id](const std::string& dep, const std::string& episode_prefix) -> std::string {
        const std::string prefix = "common:";
        if (dep.rfind(prefix, 0) == 0) return work_id + ".common." + dep.substr(prefix.size());
        return work_id + "." + episode_prefix + dep;
    };
    auto make_item = [&](const Json& raw, const std::string& id, bool episode_item, WorkItem& item) {
        if (episode_item) {
            if (!keys(raw, {"key", "stage", "name", "ability", "work_total", "deliver_at", "deps", "is_gate"}, {"is_gate"})) return false;
        } else if (!keys(raw, {"key", "name", "ability", "work_total", "deliver_at", "deps"})) return false;
        item.key = text(raw, "key");
        if (item.key.empty() || text(raw, "name").empty()) return fail("blueprint 工作项缺少 key/name");
        item.id = id + item.key;
        item.ability = text(raw, "ability");
        if (ability_index(item.ability) < 0) return fail("blueprint 工作项 ability 非法: " + item.key);
        const int base_work = integer(raw, "work_total");
        if (base_work <= 0) return fail("blueprint.work_total 必须为正: " + item.key);
        const std::int64_t scaled = (static_cast<std::int64_t>(base_work) * workload_scale_permille + 500) / 1000;
        if (scaled <= 0 || scaled > std::numeric_limits<int>::max()) return fail("blueprint 工作量缩放后越界: " + item.key);
        item.work_total = static_cast<int>(scaled);
        item.deliver_at = integer(raw, "deliver_at");
        if (item.deliver_at < 1 || item.deliver_at > 1000) return fail("blueprint.deliver_at 非法: " + item.key);
        if (episode_item && raw.contains("is_gate")) {
            if (!raw.at("is_gate").is_boolean()) return fail("blueprint.is_gate 必须是布尔值: " + item.key);
            item.is_gate = raw.at("is_gate").get<bool>();
        }
        if (!raw.at("deps").is_array()) return fail("blueprint.deps 必须是数组: " + item.key);
        std::set<std::string> deps;
        for (const auto& dep : raw.at("deps")) {
            if (!dep.is_string() || dep.get<std::string>().empty() || !deps.insert(dep.get<std::string>()).second)
                return fail("blueprint.deps 含非法或重复条目: " + item.key);
            const std::string mapped = map_dep(dep.get<std::string>(), episode_item ? id.substr(work_id.size() + 1) : std::string{});
            if (mapped == item.id) return fail("blueprint 工作项不允许依赖自身: " + item.key);
            item.deps.push_back(mapped);
        }
        return true;
    };

    out = Project{};
    out.id = work_id;
    out.status = "producing";
    out.mode = "contract";
    out.investment = Json{{"percent", 0}, {"principal", 0}, {"total", 0}};
    out.extension = Json{{"used", 0}, {"weeks", 0}};
    out.opened_week = opened_week;
    out.deadline_week = opened_week + std::max(duration_weeks, 1);
    out.common.id = work_id + ".common";
    out.plan = WorkPlan{};

    std::set<std::string> common_keys;
    for (const auto& raw : blueprint.at("common")) {
        WorkItem item;
        if (!text(raw, "key").empty() && !common_keys.insert(text(raw, "key")).second) return fail("common 工作项 key 重复");
        if (!make_item(raw, work_id + ".common.", false, item)) return false;
        out.common.items.push_back(std::move(item));
    }
    std::set<std::string> episode_keys;
    std::set<std::string> covered_stages;
    for (const auto& raw : blueprint.at("episode")) {
        if (!raw.is_object()) return fail("episode 工作项必须是对象");
        const std::string stage_key = text(raw, "stage");
        if (stage_index(stage_key) < 0) return fail("episode 项引用了未知阶段: " + stage_key);
        if (raw.contains("is_gate") && raw.at("is_gate").is_boolean() && raw.at("is_gate").get<bool>() &&
            stage_key != kStages[kStageCount - 1]) {
            return fail("blueprint 门槛项只能出现在 sound_delivery: " + text(raw, "key"));
        }
        if (!text(raw, "key").empty() && !episode_keys.insert(text(raw, "key")).second) return fail("episode 工作项 key 重复");
        covered_stages.insert(stage_key);
    }
    for (const char* stage_key : kStages)
        if (!covered_stages.count(stage_key)) return fail(std::string("blueprint 缺少阶段: ") + stage_key);

    for (int index = 1; index <= episode_count; ++index) {
        char buffer[8];
        std::snprintf(buffer, sizeof(buffer), "ep%02d", index);
        const std::string prefix = std::string(buffer) + ".";
        Episode episode;
        episode.id = std::string(buffer);
        episode.index = index;
        for (const auto& stage_key : kStages) episode.stages.push_back(EpisodeStage{stage_key, {}});
        for (const auto& raw : blueprint.at("episode")) {
            WorkItem item;
            if (!make_item(raw, work_id + "." + prefix, true, item)) return false;
            episode.stages[static_cast<std::size_t>(stage_index(text(raw, "stage")))].items.push_back(std::move(item));
        }
        out.episodes.push_back(std::move(episode));
    }
    std::set<std::string> item_ids;
    walk_items(out, [&](const WorkItem& item) { item_ids.insert(item.id); });
    bool deps_valid = true;
    walk_items(out, [&](const WorkItem& item) {
        for (const auto& dep : item.deps)
            if (!item_ids.count(dep)) {
                error = "blueprint 依赖不存在: " + item.key + " -> " + dep;
                deps_valid = false;
            }
    });
    if (!deps_valid) return false;
    if (has_cycle(out)) return fail("blueprint 依赖成环");
    for (const auto& episode : out.episodes) {
        const auto& gate_stage = episode.stages.back();
        if (std::none_of(gate_stage.items.begin(), gate_stage.items.end(), [](const WorkItem& item) { return item.is_gate; }))
            return fail("blueprint 单集缺少 sound_delivery 门槛项");
    }
    return true;
}

GameState decode_state(const Json& request) {
    if (!request.is_object() || !request.contains("state") || !request.at("state").is_object()) {
        throw Json::type_error::create(302, "state 必须是对象", nullptr);
    }
    return request.at("state").get<GameState>();
}

bool decode_valid_state(const Json& request, GameState& state, std::string& error) {
    state = decode_state(request);
    try {
        const auto errors = validate(state);
        if (!errors.empty()) {
            error = errors.front();
            return false;
        }
    } catch (const Json::exception& exception) {
        error = std::string("状态校验字段类型无效: ") + exception.what();
        return false;
    }
    return true;
}

Json default_offer() {
    return Json{{"id", "offer_tv_standard"}, {"name", "Television Animation"}, {"source", "client"}, {"genre", "original"},
                {"scale", "tv_standard"}, {"contract_budget", 5000000}, {"duration_weeks", 26}, {"target_quality", 70},
                {"channels_baseline", Json::array({"bd_dvd"})}, {"allowed_modes", Json::array({"contract", "committee"})},
                {"blueprint_id", "tv_standard"}, {"episode_count", 12}, {"workload_scale_permille", 1000},
                {"origin", "external"}, {"style", "tv"}};
}

bool valid_offer_shape(const Json& offer) {
    if (!offer.is_object()) return false;
    const std::set<std::string> keys{"id", "name", "source", "genre", "scale", "contract_budget", "duration_weeks",
                                     "target_quality", "channels_baseline", "allowed_modes", "blueprint_id", "episode_count",
                                     "workload_scale_permille", "origin", "style"};
    if (offer.size() != keys.size()) return false;
    for (const auto& key : keys) if (!offer.contains(key)) return false;
    for (const char* key : {"id", "name", "source", "genre", "scale", "blueprint_id", "origin", "style"})
        if (!offer.at(key).is_string() || offer.at(key).get<std::string>().empty()) return false;
    for (const char* key : {"contract_budget", "duration_weeks", "target_quality", "episode_count", "workload_scale_permille"}) {
        if (!offer.at(key).is_number_integer()) return false;
        if (offer.at(key).is_number_unsigned() && offer.at(key).get<std::uint64_t>() > static_cast<std::uint64_t>(INT64_MAX)) return false;
    }
    for (const char* key : {"channels_baseline", "allowed_modes"}) {
        if (!offer.at(key).is_array()) return false;
        std::set<std::string> unique;
        for (const auto& value : offer.at(key))
            if (!value.is_string() || value.get<std::string>().empty() || !unique.insert(value.get<std::string>()).second) return false;
    }
    const auto budget = offer.at("contract_budget").get<std::int64_t>();
    const auto duration = offer.at("duration_weeks").get<std::int64_t>();
    const auto quality = offer.at("target_quality").get<std::int64_t>();
    const auto episodes = offer.at("episode_count").get<std::int64_t>();
    const auto workload = offer.at("workload_scale_permille").get<std::int64_t>();
    if (budget <= 0 || duration <= 0 || duration > INT32_MAX || quality < 0 || quality > 100 || episodes <= 0 ||
        episodes > INT32_MAX || workload <= 0 || workload > 10000) return false;
    const std::string origin = offer.at("origin").get<std::string>();
    if (origin != "external" && origin != "original") return false;
    std::set<std::string> modes;
    for (const auto& mode : offer.at("allowed_modes")) {
        if (mode.get<std::string>() != "contract" && mode.get<std::string>() != "committee") return false;
        if (!modes.insert(mode.get<std::string>()).second) return false;
    }
    const std::set<std::string> expected = origin == "original" ? std::set<std::string>{"committee"} :
                                                                  std::set<std::string>{"contract", "committee"};
    return modes == expected;
}

bool quality_shape(const Json& quality) {
    if (!quality.is_object() || quality.size() != kDimensionCount) return false;
    for (const char* key : kDimensions) {
        if (!quality.contains(key) || !quality.at(key).is_number_integer()) return false;
        const auto value = quality.at(key).get<std::int64_t>();
        if (value < 0 || value > 100) return false;
    }
    return true;
}

bool staff_snapshot_shape(const Json& snapshot) {
    if (!snapshot.is_array()) return false;
    std::set<std::string> ids;
    for (const auto& row : snapshot) {
        if (!row.is_object() || row.size() != 5) return false;
        for (const char* key : {"staff_id", "name", "role", "contribution", "total_work"}) if (!row.contains(key)) return false;
        if (!row.at("staff_id").is_string() || row.at("staff_id").get<std::string>().empty() ||
            !ids.insert(row.at("staff_id").get<std::string>()).second || !row.at("name").is_string() || !row.at("role").is_string() ||
            !row.at("contribution").is_number_integer() || !row.at("total_work").is_number_integer()) return false;
        const auto contribution = row.at("contribution").get<std::int64_t>();
        const auto total = row.at("total_work").get<std::int64_t>();
        if (contribution <= 0 || total <= 0 || contribution > total) return false;
    }
    return true;
}

bool commercial_entries_shape(const Json& entries, std::int64_t& sum) {
    if (!entries.is_array()) return false;
    sum = 0;
    for (const auto& row : entries) {
        if (!row.is_object() || row.size() != 2 || !row.contains("category") || !row.contains("amount") ||
            !row.at("category").is_string() || !row.at("amount").is_number_integer()) return false;
        const std::string category = row.at("category").get<std::string>();
        const std::int64_t amount = row.at("amount").get<std::int64_t>();
        if (!((category == "commercial_share_received" || category == "success_reward_received") && amount > 0) &&
            !(category == "penalty" && amount < 0)) return false;
        if (!checked_add(sum, amount, sum)) return false;
    }
    return true;
}

std::string current_stage(const Project& work) {
    for (const char* stage_key : kStages) {
        for (const auto& episode : work.episodes) {
            for (const auto& stage : episode.stages) {
                if (stage.key != stage_key) continue;
                for (const auto& item : stage.items) if (!item.complete()) return stage_key;
            }
        }
    }
    return kStages[kStageCount - 1];
}

std::pair<std::string, std::string> current_item(const Project& work, const std::string& stage_key) {
    std::pair<std::string, std::string> selected;
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            if (stage.key != stage_key) continue;
            for (const auto& item : stage.items) {
                if (!item.complete() && (selected.second.empty() || item.id < selected.second))
                    selected = {episode.id, item.id};
            }
        }
    }
    return selected;
}

bool stage_complete(const Project& work, const std::string& stage_key) {
    bool any = false;
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            if (stage.key != stage_key) continue;
            for (const auto& item : stage.items) {
                any = true;
                if (!item.complete()) return false;
            }
        }
    }
    return any;
}

bool category_is_inflow(const std::string& category) {
    static const std::set<std::string> categories{"contract_received", "commercial_share_received", "success_reward_received", "financing_in"};
    return categories.count(category) > 0;
}

bool category_is_outflow(const std::string& category) {
    static const std::set<std::string> categories{"investment_paid", "salary", "operations", "production", "temporary", "outsourcing",
                                                  "events", "extension", "penalty", "development", "distribution", "loan_repayment", "loan_interest"};
    return categories.count(category) > 0;
}

bool category_implemented_in_m2(const std::string& category) {
    static const std::set<std::string> categories{"contract_received", "commercial_share_received", "success_reward_received",
                                                  "investment_paid", "salary", "operations", "production", "temporary", "events", "penalty"};
    return categories.count(category) > 0;
}

bool post_ledger(Finance& finance, const LedgerEntry& entry, std::string& error) {
    if (entry.id.empty()) { error = "流水 id 不能为空"; return false; }
    for (const auto& existing : finance.entries) {
        if (existing.id == entry.id) { error = "流水 id 重复: " + entry.id; return false; }
    }
    const bool inflow = category_is_inflow(entry.category);
    const bool outflow = category_is_outflow(entry.category);
    if (inflow == outflow) { error = "未知流水类别: " + entry.category; return false; }
    if ((inflow && entry.amount <= 0) || (outflow && entry.amount >= 0)) {
        error = "流水类别与金额正负号不一致: " + entry.id;
        return false;
    }
    std::int64_t balance = 0;
    if (!checked_add(finance.balance, entry.amount, balance)) { error = "账本余额溢出"; return false; }
    finance.entries.push_back(entry);
    finance.balance = balance;
    return true;
}

bool event_effect_shape(const Json& effect, const std::set<std::string>& stages, std::string& error) {
    auto fail = [&error](const std::string& message) { error = message; return false; };
    if (!effect.is_object()) return fail("事件效果必须是对象");
    for (auto it = effect.begin(); it != effect.end(); ++it)
        if (it.key() != "scope" && it.key() != "target" && it.key() != "value" && it.key() != "stage")
            return fail("事件效果含未知字段: " + it.key());
    for (const char* key : {"scope", "target", "value"})
        if (!effect.contains(key)) return fail(std::string("事件效果缺少字段: ") + key);
    if (!effect.at("scope").is_string() || !effect.at("target").is_string() || !effect.at("value").is_number_integer())
        return fail("事件效果字段类型非法");
    const std::string scope = effect.at("scope").get<std::string>();
    const std::string target = effect.at("target").get<std::string>();
    if (!std::set<std::string>{"instant", "stage", "project"}.count(scope) ||
        !std::set<std::string>{"quality", "work_done", "fatigue", "morale", "funds"}.count(target))
        return fail("事件效果枚举非法");
    if (effect.at("value").is_number_unsigned() && effect.at("value").get<std::uint64_t>() > static_cast<std::uint64_t>(INT64_MAX))
        return fail("事件效果 value 必须为非零 int64 整数");
    const std::int64_t value = effect.at("value").get<std::int64_t>();
    if (value == 0) return fail("事件效果 value 必须为非零 int64 整数");
    const std::int64_t low = target == "quality" ? -20 : target == "work_done" ? -400 : target == "fatigue" ? -40 :
                             target == "morale" ? -30 : -3000000;
    if (value < low || value > -low) return fail("事件效果 value 越界");
    if ((target == "fatigue" || target == "morale" || target == "funds") && scope != "instant")
        return fail("事件效果 scope 与 target 不符");
    if (target == "work_done" && scope == "project") return fail("work_done 不能作用于 project");
    if (effect.contains("stage") &&
        (scope != "stage" || !effect.at("stage").is_string() || !stages.count(effect.at("stage").get<std::string>())))
        return fail("effect.stage 非法");
    return true;
}

bool event_escalation_shape(const Json& escalation, int duration, std::string& error) {
    if (duration == 0) {
        if (escalation.is_null()) return true;
        error = "expires_weeks=0 时 escalation 必须为 null";
        return false;
    }
    if (!escalation.is_object() || escalation.size() != 2 || !escalation.contains("description") ||
        !escalation.contains("effects") || !escalation.at("description").is_string() ||
        text_length(escalation.at("description").get<std::string>()) < 1 ||
        text_length(escalation.at("description").get<std::string>()) > 160 ||
        !escalation.at("effects").is_array() || escalation.at("effects").empty()) {
        error = "事件升级效果非法";
        return false;
    }
    const std::set<std::string> stages(kStages.begin(), kStages.end());
    for (const auto& effect : escalation.at("effects"))
        if (!event_effect_shape(effect, stages, error)) return false;
    return true;
}

bool catalog_shape(const Json& catalog, std::vector<Json>& events, std::string& error) {
    auto fail = [&error](const std::string& message) { error = message; return false; };
    auto fields = [&fail](const Json& value, std::initializer_list<const char*> required_fields,
                          std::initializer_list<const char*> optional_fields = {}) {
        if (!value.is_object()) return fail("事件节点必须是对象");
        std::set<std::string> allowed;
        for (const char* key : required_fields) allowed.insert(key);
        for (const char* key : optional_fields) allowed.insert(key);
        for (auto it = value.begin(); it != value.end(); ++it)
            if (!allowed.count(it.key())) return fail("事件含未知字段: " + it.key());
        for (const char* key : required_fields)
            if (!value.contains(key)) return fail(std::string("事件缺少字段: ") + key);
        return true;
    };
    auto integer = [&fail](const Json& value, const char* key, int low, int high) {
        if (!value.contains(key) || !value.at(key).is_number_integer()) {
            fail(std::string("事件数值字段类型非法: ") + key);
            return 0;
        }
        const auto number = value.at(key).get<std::int64_t>();
        if (number < low || number > high) {
            fail(std::string("事件数值越界: ") + key);
            return 0;
        }
        return static_cast<int>(number);
    };
    if (!fields(catalog, {"schema_version", "events"}, {"note"})) return false;
    if (integer(catalog, "schema_version", 1, 1) != 1) return fail("事件目录 schema_version 必须为 1");
    if (catalog.contains("note") && !catalog.at("note").is_string()) return fail("事件目录 note 必须是字符串");
    if (!catalog.at("events").is_array() || catalog.at("events").empty() || catalog.at("events").size() > 40)
        return fail("events 必须为 1..40 条数组");

    const std::set<std::string> metrics{"stage_quality", "stage_progress_permille", "max_fatigue", "weeks_in_project",
                                        "weeks_to_deadline", "funds", "morale"};
    const std::set<std::string> ops{"<", "<=", ">", ">="};
    const std::set<std::string> kinds{"abandon", "overtime", "outsource", "extension", "accept", "decline"};
    const std::set<std::string> negative_kinds{"abandon", "overtime", "outsource", "extension"};
    const std::set<std::string> positive_kinds{"accept", "decline"};
    std::set<std::string> ids;
    events.clear();
    for (const auto& event : catalog.at("events")) {
        if (!fields(event, {"id", "name", "polarity", "tier", "category", "stages", "tag", "priority", "cooldown_weeks",
                            "once_per_project", "trigger", "random_weight", "expires_weeks", "escalation", "description", "options"})) return false;
        for (const char* key : {"id", "name", "polarity", "tier", "category", "tag", "description"})
            if (!event.at(key).is_string()) return fail(std::string("事件字段类型非法: ") + key);
        const std::string id = event.at("id").get<std::string>();
        if (!snake_id(id) || !ids.insert(id).second) return fail("事件 id 非法或重复: " + id);
        if (!snake_id(event.at("tag").get<std::string>())) return fail("事件 tag 非法: " + id);
        if (text_length(event.at("name").get<std::string>()) < 1 || text_length(event.at("name").get<std::string>()) > 24 ||
            text_length(event.at("description").get<std::string>()) < 1 || text_length(event.at("description").get<std::string>()) > 200)
            return fail("事件名称或描述长度非法: " + id);
        const std::string polarity = event.at("polarity").get<std::string>();
        const std::string tier = event.at("tier").get<std::string>();
        if ((polarity != "negative" && polarity != "positive") || (tier != "normal" && tier != "major") ||
            !std::set<std::string>{"personnel", "quality", "budget", "schedule"}.count(event.at("category").get<std::string>()))
            return fail("事件分类枚举非法: " + id);
        const int priority = integer(event, "priority", 1, 100);
        const int cooldown = integer(event, "cooldown_weeks", 0, 52);
        const int random_weight = integer(event, "random_weight", 0, 100);
        const int expires = integer(event, "expires_weeks", 0, 8);
        if (!event.at("once_per_project").is_boolean()) return fail("once_per_project 必须是布尔值: " + id);
        if (tier == "major" && (!event.at("once_per_project").get<bool>() || cooldown != 0))
            return fail("重大事件必须 once_per_project=true 且 cooldown_weeks=0: " + id);
        if (polarity == "positive" && expires != 0) return fail("正面机会不能设置处理期限: " + id);
        (void)priority;
        (void)random_weight;

        const auto& trigger = event.at("trigger");
        if (!fields(trigger, {"metric", "op", "threshold"})) return false;
        if (!trigger.at("metric").is_string() || !metrics.count(trigger.at("metric").get<std::string>()) ||
            !trigger.at("op").is_string() || !ops.count(trigger.at("op").get<std::string>()))
            return fail("事件触发条件非法: " + id);
        if (!trigger.at("threshold").is_number_integer() ||
            (trigger.at("threshold").is_number_unsigned() && trigger.at("threshold").get<std::uint64_t>() > static_cast<std::uint64_t>(INT32_MAX)) ||
            trigger.at("threshold").get<std::int64_t>() < INT32_MIN || trigger.at("threshold").get<std::int64_t>() > INT32_MAX)
            return fail("事件阈值必须为 int32 整数: " + id);

        if (!event.at("stages").is_array() || event.at("stages").empty() || event.at("stages").size() > kStageCount)
            return fail("事件阶段非法: " + id);
        std::set<std::string> stages;
        for (const auto& stage : event.at("stages")) {
            if (!stage.is_string() || stage_index(stage.get<std::string>()) < 0 || !stages.insert(stage.get<std::string>()).second)
                return fail("事件阶段非法或重复: " + id);
        }
        auto validate_effect = [&](const Json& effect) {
            return event_effect_shape(effect, stages, error);
        };
        if (!event_escalation_shape(event.at("escalation"), expires, error)) return false;

        if (!event.at("options").is_array() || event.at("options").empty() || event.at("options").size() > 4)
            return fail("事件选项必须为 1..4 条数组: " + id);
        std::set<std::string> option_ids;
        bool has_abandon = false;
        bool has_accept = false;
        bool has_decline = false;
        for (const auto& option : event.at("options")) {
            if (!fields(option, {"id", "label", "kind", "cost", "effects"})) return false;
            if (!option.at("id").is_string() || !snake_id(option.at("id").get<std::string>()) ||
                !option_ids.insert(option.at("id").get<std::string>()).second) return fail("事件选项 id 非法或重复: " + id);
            if (!option.at("label").is_string() || text_length(option.at("label").get<std::string>()) < 1 ||
                text_length(option.at("label").get<std::string>()) > 24 || !option.at("kind").is_string() ||
                !kinds.count(option.at("kind").get<std::string>())) return fail("事件选项字段非法: " + id);
            const std::string kind = option.at("kind").get<std::string>();
            if ((polarity == "negative" && !negative_kinds.count(kind)) || (polarity == "positive" && !positive_kinds.count(kind)))
                return fail("事件选项 kind 与极性不符: " + id);
            has_abandon = has_abandon || kind == "abandon";
            has_accept = has_accept || kind == "accept";
            has_decline = has_decline || kind == "decline";
            if (!option.at("cost").is_number_integer() || option.at("cost").get<std::int64_t>() < 0 ||
                option.at("cost").get<std::int64_t>() > 3000000) return fail("事件选项 cost 非法: " + id);
            if (!option.at("effects").is_array() || option.at("effects").size() > 4) return fail("事件 effects 必须为不超过 4 项的数组: " + id);
            for (const auto& effect : option.at("effects")) if (!validate_effect(effect)) return false;
        }
        if ((polarity == "negative" && (!has_abandon || (tier == "major" && event.at("options").size() < 2))) ||
            (polarity == "positive" && (!has_accept || !has_decline))) return fail("事件选项组合不满足极性规则: " + id);
        events.push_back(event);
    }
    return true;
}

bool condition_matches(const Json& condition, const Project& work, const GameState& state) {
    if (!condition.is_object() || !condition.contains("metric") || !condition.contains("op") || !condition.contains("threshold")) return false;
    const std::string metric = condition.at("metric").get<std::string>();
    const std::string op = condition.at("op").get<std::string>();
    const int threshold = condition.at("threshold").get<int>();
    int value = 0;
    if (metric == "weeks_to_deadline") value = work.deadline_week - state.company.week;
    else if (metric == "weeks_in_project") value = state.company.week - work.opened_week;
    else if (metric == "funds") value = static_cast<int>(std::min<int64_t>(state.finance.balance, INT32_MAX));
    else if (metric == "max_fatigue") {
        value = 0;
        for (const auto& member : state.staff) {
            if (member.assignment_work_id && *member.assignment_work_id == work.id) value = std::max(value, member.fatigue);
        }
    } else if (metric == "stage_quality" || metric == "stage_progress_permille") {
        const std::string stage_key = current_stage(work);
        int64_t quality_sum = 0;
        int quality_count = 0;
        int64_t done = 0;
        int64_t total = 0;
        for (const auto& episode : work.episodes) {
            for (const auto& stage : episode.stages) {
                if (stage.key != stage_key) continue;
                for (const auto& item : stage.items) {
                    for (const int dim : item.quality.dims) { quality_sum += dim; ++quality_count; }
                    done += item.work_done;
                    total += item.work_total;
                }
            }
        }
        if (metric == "stage_quality") value = quality_count > 0 ? static_cast<int>((quality_sum + quality_count / 2) / quality_count) : 0;
        else value = total > 0 ? static_cast<int>(done * 1000 / total) : 0;
    } else if (metric == "morale") {
        value = 100;
        bool assigned = false;
        for (const auto& member : state.staff) {
            if (!member.assignment_work_id || *member.assignment_work_id != work.id) continue;
            value = assigned ? std::min(value, member.morale) : member.morale;
            assigned = true;
        }
        if (!assigned) return false;
    } else return false;
    if (op == "<") return value < threshold;
    if (op == "<=") return value <= threshold;
    if (op == ">") return value > threshold;
    if (op == ">=") return value >= threshold;
    return false;
}

bool event_available(const Json& event, const Json& per_work, int week) {
    const std::string tag = event.at("tag").get<std::string>();
    if (event.at("once_per_project").get<bool>() && per_work.contains("major_seen")) {
        for (const auto& id : per_work.at("major_seen")) if (id.is_string() && id.get<std::string>() == event.at("id").get<std::string>()) return false;
    }
    if (per_work.contains("cooldowns") && per_work.at("cooldowns").is_object() && per_work.at("cooldowns").contains(tag)) {
        const int last = per_work.at("cooldowns").at(tag).get<int>();
        if (week - last < event.at("cooldown_weeks").get<int>()) return false;
    }
    return true;
}

const Json* choose_event(const GameState& state, const Project& work, const std::vector<Json>& events, int week) {
    if (!state.events.per_work.contains(work.id)) return nullptr;
    const Json& per_work = state.events.per_work.at(work.id);
    const Json* best = nullptr;
    for (const auto& event : events) {
        bool stage_ok = false;
        for (const auto& stage : event.at("stages")) if (stage.get<std::string>() == current_stage(work)) stage_ok = true;
        if (!stage_ok || !event_available(event, per_work, week)) continue;
        const auto& trigger = event.at("trigger");
        if (event.at("random_weight").get<int>() > 0) continue;
        if (!condition_matches(trigger, work, state)) continue;
        if (best == nullptr || event.at("priority").get<int>() < best->at("priority").get<int>() ||
            (event.at("priority").get<int>() == best->at("priority").get<int>() && event.at("id").get<std::string>() < best->at("id").get<std::string>())) {
            best = &event;
        }
    }
    if (best != nullptr) return best;

    int total_weight = 0;
    std::vector<const Json*> candidates;
    for (const auto& event : events) {
        bool stage_ok = false;
        for (const auto& stage : event.at("stages")) if (stage.get<std::string>() == current_stage(work)) stage_ok = true;
        if (stage_ok && event_available(event, per_work, week) && event.at("random_weight").get<int>() > 0 &&
            condition_matches(event.at("trigger"), work, state)) {
            total_weight += event.at("random_weight").get<int>();
            candidates.push_back(&event);
        }
    }
    if (total_weight <= 0) return nullptr;
    std::sort(candidates.begin(), candidates.end(), [](const Json* a, const Json* b) {
        return a->at("id").get<std::string>() < b->at("id").get<std::string>();
    });
    const std::uint32_t purpose = static_cast<std::uint32_t>(fnv1a64(work.id));
    const std::uint32_t roll = kernel::draw_below(state.seed, week, kernel::Stream::event, purpose, 0, 1000);
    const int chance = std::min(total_weight * 10, 1000);
    if (roll >= static_cast<std::uint32_t>(chance)) return nullptr;
    int pick = static_cast<int>(static_cast<std::int64_t>(roll) * total_weight / chance);
    for (const Json* event : candidates) {
        const int weight = event->at("random_weight").get<int>();
        if (pick < weight) return event;
        pick -= weight;
    }
    return nullptr;
}

void trigger_events(GameState& state, const std::vector<Json>& events, Json& report) {
    Json triggered = Json::array();
    std::vector<Project*> ordered;
    for (auto& work : state.works) ordered.push_back(&work);
    std::sort(ordered.begin(), ordered.end(), [](const Project* a, const Project* b) { return a->id < b->id; });
    for (Project* work : ordered) {
        if (work->status != "producing" || !state.events.per_work.contains(work->id)) continue;
        Json& per_work = state.events.per_work.at(work->id);
        if (per_work.contains("last_event_week") && !per_work.at("last_event_week").is_null() &&
            per_work.at("last_event_week").get<int>() == state.company.week) continue;
        const Json* event = choose_event(state, *work, events, state.company.week);
        if (event == nullptr) continue;
        const std::string stage_key = current_stage(*work);
        const auto [episode_id, item_id] = current_item(*work, stage_key);
        EventInstance instance;
        instance.instance_id = event->at("id").get<std::string>() + "@" + work->id + "@w" + std::to_string(state.company.week);
        instance.event_id = event->at("id").get<std::string>();
        instance.work_id = work->id;
        instance.episode_id = episode_id;
        instance.stage_key = stage_key;
        instance.item_id = item_id;
        instance.triggered_week = state.company.week;
        instance.expires_week = state.company.week + event->at("expires_weeks").get<int>();
        for (const auto& option : event->at("options")) instance.option_ids.push_back(option.at("id").get<std::string>());
        instance.escalation = event->at("escalation");
        state.events.pending.push_back(std::move(instance));
        state.events.last_event_week = state.company.week;
        per_work["last_event_week"] = state.company.week;
        if (!per_work.contains("cooldowns") || !per_work.at("cooldowns").is_object()) per_work["cooldowns"] = Json::object();
        per_work["cooldowns"][event->at("tag").get<std::string>()] = state.company.week;
        if (event->at("once_per_project").get<bool>()) {
            if (!per_work.contains("major_seen") || !per_work.at("major_seen").is_array()) per_work["major_seen"] = Json::array();
            per_work["major_seen"].push_back(event->at("id").get<std::string>());
        }
        triggered.push_back(Json{{"instance_id", state.events.pending.back().instance_id}, {"event_id", state.events.pending.back().event_id},
                                 {"work_id", work->id}, {"stage_key", stage_key}});
    }
    report["events"] = triggered;
}

void apply_ready_effects(GameState& state) {
    for (auto& work : state.works) {
        if (work.status != "producing" || !state.events.per_work.contains(work.id)) continue;
        Json& per_work = state.events.per_work.at(work.id);
        if (!per_work.contains("effects") || !per_work.at("effects").is_array()) continue;
        for (auto& effect : per_work.at("effects")) {
            if (effect.value("applied", false) || effect.value("scope", std::string{}) != "stage") continue;
            const std::string stage_key = effect.value("stage_key", std::string{});
            if (!stage_complete(work, stage_key)) continue;
            const int value = effect.at("value").get<int>();
            for (auto& episode : work.episodes) {
                for (auto& stage : episode.stages) {
                    if (stage.key != stage_key) continue;
                    for (auto& item : stage.items) {
                        for (auto& dim : item.quality.dims) dim = clamp_int(dim + value, 0, 100);
                    }
                }
            }
            effect["applied"] = true;
        }
    }
}

void apply_project_effects(Project& work, Json& per_work) {
    if (!per_work.contains("effects") || !per_work.at("effects").is_array()) return;
    for (auto& effect : per_work.at("effects")) {
        if (effect.value("applied", false) || effect.value("scope", std::string{}) != "project") continue;
        const int value = effect.at("value").get<int>();
        for_each_item(work, [&value](WorkItem& item, const std::string&, const std::string&) {
            for (auto& dim : item.quality.dims) dim = clamp_int(dim + value, 0, 100);
        });
        effect["applied"] = true;
    }
}

}  // namespace

// ---------------- 校验 ----------------
std::vector<std::string> validate(const GameState& state) {
    std::vector<std::string> errors;
    auto error = [&errors](const std::string& message) { errors.push_back(message); };

    // INV-02：实体 id 全局唯一，不是"同类唯一"。staff / work / item / 账本条目
    // 共用一个集合，重复即报错。
    std::set<std::string> entity_ids;
    auto claim_id = [&entity_ids, &error](const std::string& id, const char* kind) {
        const std::string kind_name = kind;
        const bool simple = kind_name == "company" || kind_name == "staff" || kind_name == "work" ||
                            kind_name == "offer" || kind_name == "committee";
        const bool qualified = kind_name == "common" || kind_name == "item" || kind_name == "archive";
        if (id.empty() || (simple && !snake_id(id)) || (qualified && !dotted_id(id))) {
            error(std::string("INV-02 ") + kind + " id 格式非法");
            return;
        }
        if (!entity_ids.insert(id).second) error(std::string("INV-02 id 全局重复: ") + id);
    };

    if (state.version != kContractVersion) error("INV-01 version 必须为 4");
    claim_id(state.company.id, "company");
    if (state.company.name.empty()) error("INV-01 company.name 不能为空");
    if (state.company.reputation < 0) error("INV-01 company.reputation 不能为负");
    if (std::set<std::string>(state.company.facilities.begin(), state.company.facilities.end()).size() != state.company.facilities.size())
        error("INV-01 company.facilities 重复");
    for (const auto& facility : state.company.facilities)
        if (!snake_id(facility)) error("INV-01 facility id 格式非法: " + facility);
    if (state.company.founded_week < 0 || state.company.founded_week > state.company.week) error("INV-01 company.founded_week 越界");
    if ((state.company.status == "running") != !state.company.end_reason.has_value())
        error("INV-01 company.end_reason 与 status 不一致");
    if (state.company.week < 0 || state.company.week > kMaxWeek) error("INV-21 company.week 必须在 0..520");
    if (state.company.status == "running" && state.company.week >= kMaxWeek) {
        error("INV-21 running 状态下 week 必须小于 520");
    }
    if (state.company.status != "running" && state.company.status != "closing" && state.company.status != "ended") {
        error("INV-01 company.status 非法");
    }

    std::set<std::string> staff_ids;
    int core_count = 0;
    for (const auto& member : state.staff) {
        claim_id(member.id, "staff");
        if (!staff_ids.insert(member.id).second) error("INV-02 staff.id 重复: " + member.id);
        if (member.name.empty() || member.role.empty() || member.talent_type.empty()) error("INV-01 staff 文本字段不能为空: " + member.id);
        if (member.employment == "core") ++core_count;
        for (int i = 0; i < kAbilityCount; ++i) {
            const int value = member.abilities[static_cast<std::size_t>(i)];
            if (value < 0 || value > 100) error("INV-01 staff 能力越界: " + member.id);
        }
        if (member.fatigue < 0 || member.fatigue > 100) error("INV-01 staff.fatigue 越界: " + member.id);
        if (member.morale < 0 || member.morale > 100) error("INV-01 staff.morale 越界: " + member.id);
        if (member.employment != "core" && member.employment != "temporary") error("INV-01 staff.employment 非法: " + member.id);
        if (member.employment == "core") {
            if (member.weekly_salary <= 0 || member.project_fee != 0 || !member.temporary_contract.is_null())
                error("INV-01 core 薪酬或临时合同非法: " + member.id);
        } else if (member.employment == "temporary") {
            if (member.weekly_salary <= 0 || member.project_fee <= 0 || !member.temporary_contract.is_object() ||
                !member.temporary_contract.contains("work_id") || !member.temporary_contract.contains("started_week") ||
                !member.temporary_contract.at("work_id").is_string() || !member.temporary_contract.at("started_week").is_number_integer() ||
                !member.assignment_work_id || *member.assignment_work_id != member.temporary_contract.at("work_id").get<std::string>() ||
                member.temporary_contract.at("started_week").get<int>() < 0 ||
                member.temporary_contract.at("started_week").get<int>() > state.company.week)
                error("INV-10 临时人员合同、薪酬或归属非法: " + member.id);
        }
        for (int i = 0; i < kAbilityCount; ++i) {
            if (member.experience[static_cast<std::size_t>(i)] < 0 || member.experience[static_cast<std::size_t>(i)] > 100 ||
                member.potential[static_cast<std::size_t>(i)] < 0 || member.potential[static_cast<std::size_t>(i)] > 100)
                error("INV-01 staff 经验或潜力越界: " + member.id);
            if (member.potential[static_cast<std::size_t>(i)] < member.abilities[static_cast<std::size_t>(i)])
                error("INV-01 staff 当前能力超过潜力上限: " + member.id);
        }
        std::set<std::string> history_works;
        for (const auto& history : member.works_history) {
            if (!history_works.insert(history.work_id).second) error("INV-01 staff.works_history 项目重复: " + member.id);
            if (history.contribution < 0 || history.total_work < 0 || history.contribution > history.total_work)
                error("INV-01 staff.works_history 贡献非法: " + member.id);
        }
        if (member.joined_week < 0 || member.joined_week > state.company.week) error("INV-01 staff.joined_week 越界: " + member.id);
        if (std::set<std::string>(member.traits.begin(), member.traits.end()).size() != member.traits.size()) {
            error("INV-01 staff.traits 重复: " + member.id);
        }
        if (member.last_participation) {
            // INV-11：参与记录严格是"上一周"或 null。跨周保留会让磨合判定
            // 与存档校验各有一套时间语义，所以周结算里没产出就清空。
            if (state.company.week == 0 || member.last_participation->week != state.company.week - 1) {
                error("INV-11 last_participation.week 必须是上一周或 null: " + member.id);
            }
        }
    }
    if (core_count == 0) error("INV-01 公司至少保留一名核心员工");

    std::set<std::string> work_ids;
    std::set<std::string> offer_ids;
    for (const auto& work : state.works) {
        claim_id(work.id, "work");
        if (!work_ids.insert(work.id).second) error("INV-02 work.id 重复: " + work.id);
        if (work.mode != "contract" && work.mode != "committee") error("INV-01 项目 mode 非法: " + work.id);
        if (work.status != "producing" && work.status != "delivered" && work.status != "aborted") {
            error("INV-01 项目 status 非法: " + work.id);
        }
        if (work.opened_week < 0 || work.opened_week > state.company.week) error("INV-01 项目 opened_week 越界: " + work.id);
        if (work.deadline_week <= work.opened_week || work.deadline_week > kMaxWeek ||
            (work.status == "producing" && work.deadline_week <= state.company.week))
            error("INV-01 项目 deadline_week 非法或已逾期仍未交付: " + work.id);
        if (work.episodes.empty()) error("INV-06 项目没有单集: " + work.id);
        if (work.common.items.empty()) error("INV-01 公共制作不能为空: " + work.id);
        if (!work.common.id.empty()) claim_id(work.common.id, "common");
        if (!work.offer.is_object()) error("INV-01 project.offer 必须是对象: " + work.id);
        else if (!work.offer.empty()) {
            if (!valid_offer_shape(work.offer)) error("INV-01 project.offer 结构非法: " + work.id);
            else {
                claim_id(work.offer.at("id").get<std::string>(), "offer");
                if (!offer_ids.insert(work.offer.at("id").get<std::string>()).second) error("INV-02 offer.id 重复: " + work.id);
                if (work.episodes.size() != static_cast<std::size_t>(work.offer.at("episode_count").get<std::int64_t>()))
                    error("INV-06 项目集数与企划不一致: " + work.id);
                const auto& allowed_modes = work.offer.at("allowed_modes");
                if (std::none_of(allowed_modes.begin(), allowed_modes.end(),
                                 [&work](const Json& allowed) { return allowed.get<std::string>() == work.mode; }))
                    error("INV-15 项目模式不在企划允许列表: " + work.id);
                const auto baseline_values = work.offer.at("channels_baseline").get<std::vector<std::string>>();
                std::set<std::string> baseline(baseline_values.begin(), baseline_values.end());
                std::set<std::string> channels(work.channels.begin(), work.channels.end());
                if (baseline.size() != work.offer.at("channels_baseline").size() || channels.size() != work.channels.size() || baseline != channels)
                    error("INV-01 项目渠道与企划基线不一致: " + work.id);
            }
        }
        if (!work.investment.is_object() || work.investment.size() != 3 || !work.investment.contains("percent") ||
            !work.investment.contains("principal") || !work.investment.contains("total") ||
            !work.investment.at("percent").is_number_integer() || !work.investment.at("principal").is_number_integer() ||
            !work.investment.at("total").is_number_integer()) error("INV-14 investment 结构非法: " + work.id);
        else {
            const std::int64_t percent = work.investment.at("percent").get<std::int64_t>();
            const std::int64_t principal = work.investment.at("principal").get<std::int64_t>();
            const std::int64_t total = work.investment.at("total").get<std::int64_t>();
            if (work.mode == "contract" && (percent != 0 || principal != 0 || total != 0))
                error("INV-14 承制项目投资必须为零: " + work.id);
            if (work.mode == "committee") {
                const bool budget_safe = valid_offer_shape(work.offer) && work.offer.at("contract_budget").get<std::int64_t>() <= INT64_MAX / 2;
                if (percent < 10 || percent > 100 || percent % 10 != 0 || total <= 0 || principal <= 0 || !budget_safe ||
                    total != work.offer.at("contract_budget").get<std::int64_t>() * 2 ||
                    principal != (total / 100) * percent + ((total % 100) * percent) / 100)
                    error("INV-14 委员会投资字段不一致: " + work.id);
            }
        }
        if (!work.extension.is_object() || work.extension.size() != 2 || !work.extension.contains("used") ||
            !work.extension.contains("weeks") || !work.extension.at("used").is_number_integer() ||
            !work.extension.at("weeks").is_number_integer()) error("INV-01 extension 结构非法: " + work.id);
        else {
            const int used = work.extension.at("used").get<int>();
            const int weeks = work.extension.at("weeks").get<int>();
            if ((used != 0 && used != 1) || weeks < 0 || (used == 0 && weeks != 0) || (used == 1 && weeks == 0))
                error("INV-01 extension 取值非法: " + work.id);
        }
        if (!work.tv_service.is_object() || work.tv_service.size() != 1 || !work.tv_service.contains("status") ||
            !work.tv_service.at("status").is_string() || work.tv_service.at("status").get<std::string>() != "none")
            error("INV-01 tv_service 结构非法: " + work.id);
        if ((work.mode == "contract" && work.committee_id.has_value()) || (work.mode == "committee" && !work.committee_id.has_value()))
            error("INV-14 committee_id 与模式不一致: " + work.id);
        if ((work.status == "producing" && !work.delivery.is_null()) || (work.status == "delivered" && work.delivery.is_null()) ||
            (work.status == "aborted" && !work.delivery.is_null()))
            error("INV-01 delivery 与项目状态不一致: " + work.id);

        // INV-03：公共制作与单集工作项走同一套校验，不能只查单集。
        std::set<std::string> item_ids;
        std::set<std::string> historical_staff = staff_ids;
        if (work.status == "delivered" && work.delivery.is_object() && work.delivery.contains("staff_snapshot") &&
            work.delivery.at("staff_snapshot").is_array()) {
            for (const auto& row : work.delivery.at("staff_snapshot"))
                if (row.is_object() && row.contains("staff_id") && row.at("staff_id").is_string())
                    historical_staff.insert(row.at("staff_id").get<std::string>());
        }
        const auto check_item = [&](const WorkItem& item) {
            claim_id(item.id, "item");
            if (!item_ids.insert(item.id).second) error("INV-02 工作项 id 重复: " + item.id);
            if (ability_index(item.ability) < 0) error("INV-01 工作项 ability 非法: " + item.id);
            if (item.work_total <= 0) error("INV-03 work_total 必须为正: " + item.id);
            if (item.work_done < 0 || item.work_done > item.work_total) error("INV-03 work_done 越界: " + item.id);
            if (item.deliver_at < 1 || item.deliver_at > 1000) error("INV-03 deliver_at 越界: " + item.id);
            for (const int dim : item.quality.dims) if (dim < 0 || dim > 100) error("INV-01 工作项质量越界: " + item.id);
            if (std::set<std::string>(item.deps.begin(), item.deps.end()).size() != item.deps.size())
                error("INV-04 工作项依赖重复: " + item.id);
            std::set<std::string> contributors;
            for (const auto& id : item.contributors) {
                if (id.empty() || !contributors.insert(id).second) error("INV-12 contributors 非法或重复: " + item.id + "/" + id);
                if (work.status == "producing" && staff_ids.find(id) == staff_ids.end())
                    error("INV-12 contributors 引用不存在员工: " + item.id + "/" + id);
                if (work.status == "delivered" && historical_staff.find(id) == historical_staff.end())
                    error("INV-12 已交付项目 contributors 不在团队快照: " + item.id + "/" + id);
            }
            if (item.work_done == 0 && !item.contributors.empty()) {
                error("INV-12 未开工工作项不能有参与者: " + item.id);
            }
        };
        for (const auto& item : work.common.items) {
            check_item(item);
            if (item.is_gate) error("INV-07 公共制作项不得作为单集交付门槛: " + item.id);
        }

        std::set<std::string> episode_ids;
        for (std::size_t episode_index = 0; episode_index < work.episodes.size(); ++episode_index) {
            const auto& episode = work.episodes[episode_index];
            if (!snake_id(episode.id) || !episode_ids.insert(episode.id).second) error("INV-02 episode.id 非法或重复: " + work.id);
            if (episode.index != static_cast<int>(episode_index) + 1) error("INV-06 episode.index 必须连续: " + episode.id);
            if (episode.stages.size() != static_cast<std::size_t>(kStageCount)) {
                error("INV-06 单集阶段数必须为 6: " + work.id + "/" + episode.id);
            }
            int gate_count = 0;
            for (std::size_t stage_index_value = 0; stage_index_value < episode.stages.size(); ++stage_index_value) {
                const auto& stage = episode.stages[stage_index_value];
                if (stage_index_value < static_cast<std::size_t>(kStageCount) && stage.key != kStages[stage_index_value]) {
                    error("INV-06 阶段顺序非法: " + work.id + "/" + episode.id + "/" + stage.key);
                }
                for (const auto& item : stage.items) {
                    check_item(item);
                    if (item.is_gate) {
                        ++gate_count;
                        if (stage.key != kStages[static_cast<std::size_t>(kStageCount - 1)]) {
                            error("INV-07 门槛项只能出现在 sound_delivery: " + item.id);
                        }
                    }
                }
            }
            if (gate_count == 0) error("INV-07 单集缺少门槛项: " + work.id + "/" + episode.id);
        }

        // 计划取值与定向目标（非法枚举会让排序静默退回默认行为，必须在这里拦住）
        const auto one_of = [](const std::string& value, std::initializer_list<const char*> allowed) {
            for (const char* candidate : allowed) {
                if (value == candidate) return true;
            }
            return false;
        };
        if (!one_of(work.plan.intensity, {"low", "standard", "high"})) error("INV-01 plan.intensity 非法: " + work.id);
        if (!one_of(work.plan.focus, {"quality", "schedule", "cost"})) error("INV-01 plan.focus 非法: " + work.id);
        if (!one_of(work.plan.outsourcing, {"none", "gap_fill", "aggressive"})) error("INV-01 plan.outsourcing 非法: " + work.id);
        if (!one_of(work.plan.overtime, {"off", "conditional"})) error("INV-01 plan.overtime 非法: " + work.id);
        if (work.plan.target) {
            const auto& target = *work.plan.target;
            bool valid = false;
            if (target.kind == "episode") {
                valid = std::any_of(work.episodes.begin(), work.episodes.end(),
                                    [&target](const Episode& episode) { return episode.id == target.id; });
            } else if (target.kind == "stage") {
                valid = stage_index(target.id) >= 0;
            }
            if (!valid) error("INV-01 plan.target 未指向本项目单集或合法阶段: " + work.id);
        }

        // 依赖引用与环
        walk_items(work, [&item_ids, &error](const WorkItem& item) {
            for (const auto& dep : item.deps) {
                if (dep == item.id) error("INV-04 工作项依赖自身: " + item.id);
                if (item_ids.find(dep) == item_ids.end()) error("INV-04 依赖不存在: " + item.id + " -> " + dep);
            }
        });
        if (has_cycle(work)) error("INV-04 依赖成环: " + work.id);

        if (work.status == "delivered") {
            const auto& delivery = work.delivery;
            if (!delivery.is_object() || delivery.size() != 10) error("INV-01 delivery 结构非法: " + work.id);
            else {
                for (const char* key : {"delivered_week", "on_time", "forced", "quality", "staff_snapshot", "production_cost",
                                        "commercial_entries", "commercial_income", "profit", "archive_id"})
                    if (!delivery.contains(key)) error(std::string("INV-01 delivery 缺少字段: ") + key);
                if (delivery.contains("delivered_week") && delivery.at("delivered_week").is_number_integer()) {
                    const int delivered_week = delivery.at("delivered_week").get<int>();
                    if (delivered_week < work.opened_week || delivered_week > state.company.week) error("INV-01 delivery.delivered_week 越界: " + work.id);
                    if (delivery.contains("on_time") && delivery.at("on_time").is_boolean() &&
                        delivery.at("on_time").get<bool>() != (delivered_week <= work.deadline_week && work.deliverable()))
                        error("INV-01 delivery.on_time 不一致: " + work.id);
                    if (delivery.contains("forced") && delivery.at("forced").is_boolean() && delivery.at("forced").get<bool>() &&
                        delivered_week != work.deadline_week) error("INV-01 forced 交付必须发生在截止周: " + work.id);
                }
                if (delivery.contains("quality") && !quality_shape(delivery.at("quality"))) error("INV-01 delivery.quality 非法: " + work.id);
                else if (delivery.contains("quality")) {
                    const auto aggregate = kernel::aggregate_work(work);
                    for (int i = 0; i < kDimensionCount; ++i)
                        if (delivery.at("quality").at(kDimensions[static_cast<std::size_t>(i)]).get<int>() != aggregate.dims[static_cast<std::size_t>(i)])
                            error("INV-01 delivery.quality 与项目不一致: " + work.id);
                }
                if (delivery.contains("staff_snapshot") && staff_snapshot_shape(delivery.at("staff_snapshot"))) {
                    std::set<std::string> snapshot_ids;
                    for (const auto& row : delivery.at("staff_snapshot")) snapshot_ids.insert(row.at("staff_id").get<std::string>());
                    walk_items(work, [&](const WorkItem& item) {
                        for (const auto& id : item.contributors)
                            if (!snapshot_ids.count(id)) error("INV-12 delivery.staff_snapshot 遗漏参与者: " + item.id + "/" + id);
                    });
                    for (const auto& row : delivery.at("staff_snapshot")) {
                        std::int64_t contribution = 0;
                        std::int64_t total = 0;
                        walk_items(work, [&](const WorkItem& item) {
                            if (std::find(item.contributors.begin(), item.contributors.end(), row.at("staff_id").get<std::string>()) == item.contributors.end()) return;
                            contribution += item.work_done;
                            total += item.work_total;
                        });
                        if (contribution != row.at("contribution").get<std::int64_t>() || total != row.at("total_work").get<std::int64_t>())
                            error("INV-01 delivery.staff_snapshot 贡献不一致: " + row.at("staff_id").get<std::string>());
                    }
                } else if (delivery.contains("staff_snapshot")) error("INV-01 delivery.staff_snapshot 非法: " + work.id);
                std::int64_t commercial_sum = 0;
                if (delivery.contains("commercial_entries") && !commercial_entries_shape(delivery.at("commercial_entries"), commercial_sum))
                    error("INV-01 delivery.commercial_entries 非法: " + work.id);
                if (delivery.contains("commercial_income") && delivery.at("commercial_income").is_number_integer() &&
                    delivery.at("commercial_income").get<std::int64_t>() != commercial_sum)
                    error("INV-01 delivery.commercial_income 与明细分不一致: " + work.id);
                if (delivery.contains("archive_id") && delivery.at("archive_id").is_string() &&
                    delivery.at("archive_id").get<std::string>() != "archive." + work.id)
                    error("INV-01 delivery.archive_id 非法: " + work.id);
                std::int64_t production_cost = 0;
                std::int64_t project_net = 0;
                std::int64_t ledger_commercial = 0;
                bool overflow = false;
                for (const auto& entry : state.finance.entries) {
                    if (!entry.work_id || *entry.work_id != work.id) continue;
                    if (entry.amount < 0 && (entry.category == "salary" || entry.category == "production" || entry.category == "temporary" ||
                        entry.category == "outsourcing" || entry.category == "events" || entry.category == "extension" || entry.category == "distribution")) {
                        if (entry.amount == INT64_MIN || !checked_add(production_cost, -entry.amount, production_cost)) overflow = true;
                    }
                    if (!checked_add(project_net, entry.amount, project_net)) overflow = true;
                    if (entry.category == "commercial_share_received" || entry.category == "success_reward_received" || entry.category == "penalty")
                        if (!checked_add(ledger_commercial, entry.amount, ledger_commercial)) overflow = true;
                }
                if (overflow) error("INV-16 项目账本汇总溢出: " + work.id);
                if (delivery.contains("production_cost") && delivery.at("production_cost").is_number_integer() &&
                    (delivery.at("production_cost").get<std::int64_t>() < 0 || delivery.at("production_cost").get<std::int64_t>() != production_cost))
                    error("INV-01 delivery.production_cost 与账本不一致: " + work.id);
                if (delivery.contains("profit") && delivery.at("profit").is_number_integer() && delivery.at("profit").get<std::int64_t>() != project_net)
                    error("INV-01 delivery.profit 与账本不一致: " + work.id);
                if (ledger_commercial != commercial_sum) error("INV-16 交付商业收入与账本不一致: " + work.id);
            }
        }
    }

    // INV-09：归属必须指向存在且仍在 producing 的项目
    for (const auto& member : state.staff) {
        if (member.last_participation) {
            const Project* participated = find_work(state, member.last_participation->work_id);
            if (participated == nullptr || find_item(*participated, member.last_participation->item_id) == nullptr)
                error("INV-12 last_participation 引用不存在: " + member.id);
        }
        for (const auto& history : member.works_history)
            if (work_ids.find(history.work_id) == work_ids.end()) error("INV-01 works_history 引用不存在项目: " + member.id);
        if (!member.assignment_work_id) continue;
        const Project* assigned = find_work(state, *member.assignment_work_id);
        if (assigned == nullptr) {
            error("INV-09 assignment_work_id 指向不存在的项目: " + member.id);
        } else if (assigned->status != "producing") {
            error("INV-09 assignment_work_id 必须指向 producing 项目: " + member.id);
        }
    }

    // INV-16/17：M2 只允许已实现业务写入流水；项目收入必须能回溯到立项或交付记录。
    std::int64_t sum = 0;
    bool finance_overflow = false;
    std::map<std::string, int> contract_counts;
    std::map<std::string, int> investment_counts;
    std::set<std::tuple<std::string, std::int64_t, int, std::string>> commercial_keys;
    std::set<std::tuple<std::string, int, std::string>> recurring_keys;
    for (const auto& entry : state.finance.entries) {
        claim_id(entry.id, "ledger");
        if (entry.week < 0 || entry.week > state.company.week) error("INV-01 流水周数越界: " + entry.id);
        if (!category_implemented_in_m2(entry.category)) error("INV-17 M2 未授权流水类别: " + entry.id);
        if ((category_is_inflow(entry.category) && entry.amount <= 0) || (category_is_outflow(entry.category) && entry.amount >= 0)) {
            error("INV-16 流水类别与金额正负号不一致: " + entry.id);
        }
        if (entry.counterparty) error("INV-17 M2 流水不得引用未实现的合作方或供应商: " + entry.id);
        const Project* work = entry.work_id ? find_work(state, *entry.work_id) : nullptr;
        if (entry.work_id && work == nullptr) error("INV-16 流水引用不存在项目: " + entry.id);
        if ((entry.category == "operations" && entry.work_id) ||
            (entry.category != "salary" && entry.category != "operations" && !entry.work_id))
            error("INV-17 流水项目归因非法: " + entry.id);
        if (entry.category == "salary" || entry.category == "temporary" || entry.category == "production" ||
            entry.category == "operations" || entry.category == "events") {
            if (!recurring_keys.insert({entry.category == "salary" || entry.category == "temporary" ? "staff" : entry.category,
                                        entry.week, entry.category == "salary" || entry.category == "temporary" ? entry.memo :
                                        entry.work_id.value_or(std::string{})}).second)
                error("INV-17 周费用业务键重复: " + entry.id);
        }
        if ((entry.category == "salary" || entry.category == "temporary" || entry.category == "production" ||
             entry.category == "operations") && entry.week >= state.company.week)
            error("INV-17 周费用必须属于已经结束的结算周: " + entry.id);
        if (work != nullptr) {
            if ((entry.category == "contract_received" || entry.category == "investment_paid") && entry.week != work->opened_week)
                error("INV-17 立项流水周数不一致: " + entry.id);
            if ((entry.category == "salary" || entry.category == "temporary" || entry.category == "production") &&
                (entry.week < work->opened_week || (work->status == "delivered" && entry.week > work->delivery.at("delivered_week").get<int>())))
                error("INV-17 制作费用发生在项目生产窗口之外: " + entry.id);
            if (entry.category == "contract_received") {
                ++contract_counts[work->id];
                if (!work->offer.is_object() || work->offer.empty() ||
                    work->offer.at("contract_budget").get<std::int64_t>() != entry.amount)
                    error("INV-17 制作费与企划预算不一致: " + entry.id);
            }
            if (entry.category == "investment_paid") {
                ++investment_counts[work->id];
                if (work->mode != "committee" || work->investment.at("principal").get<std::int64_t>() != -entry.amount)
                    error("INV-17 投资本金与项目不一致: " + entry.id);
            }
            if (entry.category == "commercial_share_received" || entry.category == "success_reward_received" || entry.category == "penalty") {
                if (work->status != "delivered" || !work->delivery.is_object() ||
                    entry.week != work->delivery.at("delivered_week").get<int>())
                    error("INV-17 商业或扣罚流水不属于交付结算: " + entry.id);
                if (!commercial_keys.insert({entry.category, entry.amount, entry.week, work->id}).second)
                    error("INV-17 交付结算业务键重复: " + entry.id);
            }
        }
        if (!checked_add(sum, entry.amount, sum)) finance_overflow = true;
    }
    for (const auto& work : state.works) {
        const bool formal = work.offer.is_object() && !work.offer.empty();
        if (formal && contract_counts[work.id] != 1) error("INV-17 正式项目必须恰有一笔立项制作费: " + work.id);
        if (work.mode == "committee" && investment_counts[work.id] != 1)
            error("INV-17 委员会项目必须恰有一笔投资本金: " + work.id);
        if (work.mode == "contract" && investment_counts[work.id] != 0)
            error("INV-17 承制项目不得产生投资本金流水: " + work.id);
        if (work.status != "delivered" || !work.delivery.is_object() || !work.delivery.contains("commercial_entries") ||
            !work.delivery.at("commercial_entries").is_array()) continue;
        std::set<std::tuple<std::string, std::int64_t, int, std::string>> expected_commercial;
        for (const auto& row : work.delivery.at("commercial_entries")) {
            if (!row.is_object() || !row.contains("category") || !row.contains("amount") ||
                !row.at("category").is_string() || !row.at("amount").is_number_integer()) continue;
            expected_commercial.insert({row.at("category").get<std::string>(), row.at("amount").get<std::int64_t>(),
                                        work.delivery.at("delivered_week").get<int>(), work.id});
        }
        std::set<std::tuple<std::string, std::int64_t, int, std::string>> actual_commercial;
        for (const auto& entry : state.finance.entries)
            if (entry.work_id && *entry.work_id == work.id &&
                (entry.category == "commercial_share_received" || entry.category == "success_reward_received" || entry.category == "penalty"))
                actual_commercial.insert({entry.category, entry.amount, entry.week, work.id});
        if (actual_commercial != expected_commercial) error("INV-17 交付商业流水与结算明细分账: " + work.id);
    }
    if (!state.finance.loans.is_array() || !state.finance.loans.empty())
        error("INV-18 M2 融资尚未实现，loans 必须为空数组");
    std::int64_t expected_balance = 0;
    if (!checked_add(state.finance.opening_funds, sum, expected_balance)) finance_overflow = true;
    if (finance_overflow) error("INV-16 账本汇总溢出");
    else if (state.finance.balance != expected_balance) error("INV-16 余额不等于期初加流水合计");
    if (state.finance.solvency.state != "normal" && state.finance.solvency.state != "crisis") error("INV-01 solvency.state 非法");
    if (state.finance.solvency.gap < 0) error("INV-01 solvency.gap 不能为负");
    if (state.finance.solvency.state == "normal" && (state.finance.solvency.since_week || state.finance.solvency.deadline_week || state.finance.solvency.gap != 0))
        error("INV-01 normal 偿付状态不能带危机字段");
    if (state.finance.solvency.state == "crisis" &&
        (!state.finance.solvency.since_week || *state.finance.solvency.since_week < 0 || *state.finance.solvency.since_week > state.company.week ||
         !state.finance.solvency.deadline_week || *state.finance.solvency.deadline_week < *state.finance.solvency.since_week))
        error("INV-01 crisis 偿付时间非法");
    if (state.finance.balance < 0 && state.finance.solvency.state != "crisis" &&
        !(state.company.status == "closing" && state.company.end_reason == "bankrupt"))
        error("INV-25 负余额只能出现在危机或破产关闭状态");

    if (!state.suppliers.is_array() || !state.contracts.is_array() || !state.partners.is_array() || !state.committees.is_array())
        error("INV-01 suppliers/contracts/partners/committees 必须为数组");
    if (!state.suppliers.empty() || !state.contracts.empty() || !state.partners.empty())
        error("INV-01 M2 供应商、外包合同与合作方必须保持空占位");
    if (!state.market.is_object() || state.market.size() != 1 || !state.market.contains("slots") || !state.market.at("slots").is_array() ||
        state.market.at("slots").size() > 4) error("INV-24 market.slots 非法");
    else {
        std::set<std::string> market_offer_ids;
        for (const auto& offer : state.market.at("slots")) {
            if (!valid_offer_shape(offer)) { error("INV-24 市场企划结构非法"); continue; }
            const std::string id = offer.at("id").get<std::string>();
            claim_id(id, "offer");
            if (!market_offer_ids.insert(id).second || offer_ids.count(id)) error("INV-24 市场企划 id 重复: " + id);
        }
    }
    std::set<std::string> committee_ids;
    for (const auto& committee : state.committees) {
        if (!committee.is_object() || committee.size() != 7) { error("INV-13 committee 结构非法"); continue; }
        for (const char* key : {"id", "work_id", "partner_ids", "investment_percent", "investment_paid", "production_fee", "status"})
            if (!committee.contains(key)) error(std::string("INV-13 committee 缺少字段: ") + key);
        if (!committee.contains("id") || !committee.at("id").is_string() || !committee.contains("work_id") || !committee.at("work_id").is_string() ||
            !committee.contains("partner_ids") || !committee.at("partner_ids").is_array() || !committee.contains("investment_percent") ||
            !committee.at("investment_percent").is_number_integer() || !committee.contains("investment_paid") || !committee.at("investment_paid").is_number_integer() ||
            !committee.contains("production_fee") || !committee.at("production_fee").is_number_integer() || !committee.contains("status") ||
            !committee.at("status").is_string()) { error("INV-13 committee 字段类型非法"); continue; }
        const std::string id = committee.at("id").get<std::string>();
        const std::string work_id = committee.at("work_id").get<std::string>();
        if (!dotted_id(id)) error("INV-02 committee id 格式非法");
        if (!committee_ids.insert(id).second) error("INV-13 committee.id 重复: " + id);
        const Project* work = find_work(state, work_id);
        if (work == nullptr || work->mode != "committee" || work->committee_id != id) error("INV-13 committee 引用项目非法: " + id);
        if (!committee.at("partner_ids").empty()) error("INV-13 M2 合作方尚未实现，committee.partner_ids 必须为空: " + id);
        if (work != nullptr && valid_offer_shape(work->offer) &&
            (committee.at("investment_percent").get<std::int64_t>() != work->investment.at("percent").get<std::int64_t>() ||
             committee.at("investment_paid").get<std::int64_t>() != work->investment.at("principal").get<std::int64_t>() ||
             committee.at("production_fee").get<std::int64_t>() != work->offer.at("contract_budget").get<std::int64_t>()))
            error("INV-13 committee 投资与项目不一致: " + id);
        const std::string committee_status = committee.at("status").get<std::string>();
        if (committee_status != "active" && committee_status != "closed")
            error("INV-13 committee.status 非法: " + id);
        if (work != nullptr) {
            const std::string expected_status = work->status == "producing" ? "active" : "closed";
            if (committee_status != expected_status)
                error("INV-13 committee.status 与项目状态不一致: " + id);
        }
    }
    for (const auto& work : state.works)
        if (work.mode == "committee" && (!work.committee_id || !committee_ids.count(*work.committee_id)))
            error("INV-13 委员会项目缺少元数据: " + work.id);

    if (state.events.last_event_week && (*state.events.last_event_week < 0 || *state.events.last_event_week > state.company.week))
        error("INV-23 events.last_event_week 非法");
    if (!state.events.per_work.is_object()) error("INV-23 events.per_work 必须为对象");
    else {
        for (auto it = state.events.per_work.begin(); it != state.events.per_work.end(); ++it) {
            if (work_ids.find(it.key()) == work_ids.end()) error("INV-23 events.per_work 引用不存在项目: " + it.key());
            const auto& per_work = it.value();
            if (!per_work.is_object() || per_work.size() != 4 || !per_work.contains("cooldowns") ||
                !per_work.contains("major_seen") || !per_work.contains("last_event_week") || !per_work.contains("effects")) {
                error("INV-23 events.per_work 结构非法: " + it.key());
                continue;
            }
            if (!per_work.at("cooldowns").is_object()) error("INV-23 cooldowns 必须为对象: " + it.key());
            else for (auto cooldown = per_work.at("cooldowns").begin(); cooldown != per_work.at("cooldowns").end(); ++cooldown) {
                if (!snake_id(cooldown.key()) || !cooldown.value().is_number_integer()) {
                    error("INV-23 cooldown 记录非法: " + it.key());
                } else {
                    const std::int64_t week = cooldown.value().get<std::int64_t>();
                    if (week < 0 || week > state.company.week) error("INV-23 cooldown 记录非法: " + it.key());
                }
            }
            if (!per_work.at("major_seen").is_array()) error("INV-23 major_seen 必须为数组: " + it.key());
            else {
                std::set<std::string> seen;
                for (const auto& id : per_work.at("major_seen"))
                    if (!id.is_string() || !snake_id(id.get<std::string>()) || !seen.insert(id.get<std::string>()).second)
                        error("INV-23 major_seen 非法: " + it.key());
            }
            if (!per_work.at("last_event_week").is_null()) {
                if (!per_work.at("last_event_week").is_number_integer()) error("INV-23 last_event_week 非法: " + it.key());
                else {
                    const std::int64_t week = per_work.at("last_event_week").get<std::int64_t>();
                    if (week < 0 || week > state.company.week) error("INV-23 last_event_week 非法: " + it.key());
                }
            }
            if (!per_work.at("effects").is_array()) error("INV-23 effects 必须为数组: " + it.key());
            else {
                std::set<std::string> effect_ids;
                for (const auto& effect : per_work.at("effects")) {
                    if (!effect.is_object() || effect.size() != 6 || !effect.contains("id") || !effect.contains("scope") ||
                        !effect.contains("target") || !effect.contains("value") || !effect.contains("stage_key") || !effect.contains("applied") ||
                        !effect.at("id").is_string() || effect.at("id").get<std::string>().empty() ||
                        !effect_ids.insert(effect.at("id").get<std::string>()).second ||
                        !effect.at("scope").is_string() || !effect.at("target").is_string() || !effect.at("value").is_number_integer() ||
                        !effect.at("stage_key").is_string() || !effect.at("applied").is_boolean() ||
                        (effect.at("scope").get<std::string>() != "stage" && effect.at("scope").get<std::string>() != "project") ||
                        effect.at("target").get<std::string>() != "quality" || stage_index(effect.at("stage_key").get<std::string>()) < 0)
                        error("INV-23 延迟效果非法: " + it.key());
                    else {
                        const std::int64_t value = effect.at("value").get<std::int64_t>();
                        if (value < -20 || value > 20) error("INV-23 延迟效果非法: " + it.key());
                    }
                }
            }
        }
        for (const auto& work : state.works)
            if (!state.events.per_work.contains(work.id)) error("INV-23 项目缺少事件状态: " + work.id);
    }

    std::set<std::string> event_instances;
    std::set<std::pair<std::string, int>> event_work_week;
    for (const auto& event : state.events.pending) {
        if (event.instance_id.empty() || !event_instances.insert(event.instance_id).second) error("INV-23 事件实例 id 非法或重复");
        if (!snake_id(event.event_id) || event.instance_id != event.event_id + "@" + event.work_id + "@w" + std::to_string(event.triggered_week))
            error("INV-23 事件实例标识不一致: " + event.instance_id);
        const Project* work = find_work(state, event.work_id);
        if (work == nullptr) error("INV-23 事件引用不存在项目: " + event.instance_id);
        if (stage_index(event.stage_key) < 0) error("INV-23 事件阶段非法: " + event.instance_id);
        if (event.status != "pending") error("INV-23 pending 中事件状态必须为 pending: " + event.instance_id);
        if (event.option_ids.empty() || event.option_ids.size() > 4) error("INV-23 事件选项数量非法: " + event.instance_id);
        std::set<std::string> option_ids;
        for (const auto& option_id : event.option_ids)
            if (!snake_id(option_id) || !option_ids.insert(option_id).second) error("INV-23 事件选项 id 非法: " + event.instance_id);
        if (event.triggered_week < 0 || event.triggered_week > state.company.week) {
            error("INV-23 事件周数非法: " + event.instance_id);
        }
        const std::int64_t duration = static_cast<std::int64_t>(event.expires_week) - event.triggered_week;
        if (duration < 0 || duration > 8) error("INV-23 事件期限非法: " + event.instance_id);
        std::string escalation_error;
        if (duration >= 0 && duration <= 8 && !event_escalation_shape(event.escalation, static_cast<int>(duration), escalation_error))
            error("INV-23 " + escalation_error + ": " + event.instance_id);
        if (!event_work_week.insert({event.work_id, event.triggered_week}).second) {
            error("INV-23 同项目同周存在多个事件: " + event.instance_id);
        }
        if (work != nullptr && !event.episode_id.empty()) {
            const auto episode = std::find_if(work->episodes.begin(), work->episodes.end(), [&](const Episode& value) {
                return value.id == event.episode_id;
            });
            if (episode == work->episodes.end()) error("INV-23 事件 episode_id 不存在: " + event.instance_id);
            else {
                const auto stage = std::find_if(episode->stages.begin(), episode->stages.end(), [&](const EpisodeStage& value) {
                    return value.key == event.stage_key;
                });
                if (stage == episode->stages.end()) error("INV-23 事件阶段不属于引用单集: " + event.instance_id);
                else if (!event.item_id.empty() && std::none_of(stage->items.begin(), stage->items.end(), [&](const WorkItem& item) {
                    return item.id == event.item_id;
                })) error("INV-23 事件 item_id 不属于引用单集和阶段: " + event.instance_id);
            }
        } else if (!event.item_id.empty()) {
            error("INV-23 事件 item_id 缺少单集引用: " + event.instance_id);
        }
    }

    std::set<std::string> archive_ids;
    std::set<std::string> archived_works;
    for (const auto& record : state.archive.works) {
        claim_id(record.id, "archive");
        if (!archive_ids.insert(record.id).second) error("INV-02 archive.id 重复: " + record.id);
        if (!archived_works.insert(record.work_id).second) error("INV-02 archive.work_id 重复: " + record.work_id);
        const Project* work = find_work(state, record.work_id);
        if (work == nullptr || work->status != "delivered" || work->delivery.is_null()) {
            error("INV-01 archive 引用未交付项目: " + record.work_id);
            continue;
        }
        const auto& delivery = work->delivery;
        if (record.id != "archive." + work->id || record.title != work->offer.value("name", work->id) ||
            record.mode != work->mode || record.opened_week != work->opened_week ||
            record.delivered_week != delivery.at("delivered_week").get<int>() || record.deadline_week != work->deadline_week ||
            record.on_time != delivery.at("on_time").get<bool>() || record.quality != delivery.at("quality") ||
            record.staff_snapshot != delivery.at("staff_snapshot") ||
            record.production_cost != delivery.at("production_cost").get<std::int64_t>() ||
            record.commercial_income != delivery.at("commercial_income").get<std::int64_t>() ||
            record.profit != delivery.at("profit").get<std::int64_t>() ||
            record.delivered_week < 0 || record.delivered_week > state.company.week)
            error("INV-20 Archive 与交付快照不一致: " + record.id);
    }
    for (const auto& work : state.works) {
        const bool archived = archived_works.find(work.id) != archived_works.end();
        if (!work.delivery.is_null() && !archived) error("INV-20 已交付项目缺少 Archive: " + work.id);
        if (work.delivery.is_null() && archived) error("INV-20 非交付项目不得存在 Archive: " + work.id);
    }
    return errors;
}

// ---------------- 哈希 ----------------
std::string state_hash(const GameState& state) {
    GameState copy = state;
    std::sort(copy.staff.begin(), copy.staff.end(), [](const Staff& a, const Staff& b) { return a.id < b.id; });
    std::sort(copy.works.begin(), copy.works.end(), [](const Project& a, const Project& b) { return a.id < b.id; });
    std::sort(copy.company.facilities.begin(), copy.company.facilities.end());
    // 规范化：所有"集合语义"的数组都要排序，否则哈希会随追加顺序变化而漂移。
    auto canonicalize = [](WorkItem& item) {
        std::sort(item.deps.begin(), item.deps.end());
        std::sort(item.contributors.begin(), item.contributors.end());
    };
    for (auto& work : copy.works) {
        std::sort(work.common.items.begin(), work.common.items.end(),
                  [](const WorkItem& a, const WorkItem& b) { return a.id < b.id; });
        for (auto& item : work.common.items) canonicalize(item);
        std::sort(work.episodes.begin(), work.episodes.end(),
                  [](const Episode& a, const Episode& b) { return a.id < b.id; });
        for (auto& episode : work.episodes) {
            for (auto& stage : episode.stages) {
                std::sort(stage.items.begin(), stage.items.end(),
                          [](const WorkItem& a, const WorkItem& b) { return a.id < b.id; });
                for (auto& item : stage.items) canonicalize(item);
            }
        }
    }
    std::sort(copy.finance.entries.begin(), copy.finance.entries.end(),
              [](const LedgerEntry& a, const LedgerEntry& b) {
                  if (a.week != b.week) return a.week < b.week;
                  return a.id < b.id;
              });
    for (auto& member : copy.staff) {
        std::sort(member.traits.begin(), member.traits.end());
        std::sort(member.works_history.begin(), member.works_history.end(),
                  [](const WorkHistory& a, const WorkHistory& b) { return a.work_id < b.work_id; });
    }
    for (auto& work : copy.works) std::sort(work.channels.begin(), work.channels.end());
    for (auto& event : copy.events.pending) std::sort(event.option_ids.begin(), event.option_ids.end());
    std::sort(copy.events.pending.begin(), copy.events.pending.end(),
              [](const EventInstance& a, const EventInstance& b) { return a.instance_id < b.instance_id; });
    std::sort(copy.archive.works.begin(), copy.archive.works.end(),
              [](const WorkRecord& a, const WorkRecord& b) { return a.id < b.id; });

    Json encoded = copy;
    auto sort_strings = [](Json& values) {
        if (!values.is_array() || std::any_of(values.begin(), values.end(), [](const Json& value) { return !value.is_string(); })) return;
        std::sort(values.begin(), values.end(), [](const Json& a, const Json& b) {
            return a.get<std::string>() < b.get<std::string>();
        });
    };
    auto sort_by_member = [](Json& values, const char* key) {
        if (!values.is_array() || std::any_of(values.begin(), values.end(), [key](const Json& value) {
                return !value.is_object() || !value.contains(key) || !value.at(key).is_string();
            })) return;
        std::sort(values.begin(), values.end(), [key](const Json& a, const Json& b) {
            return a.at(key).get<std::string>() < b.at(key).get<std::string>();
        });
    };
    auto canonicalize_offer = [&](Json& offer) {
        if (!offer.is_object()) return;
        for (const char* key : {"channels_baseline", "allowed_modes"})
            if (offer.contains(key)) sort_strings(offer.at(key));
    };
    auto canonicalize_snapshot = [&](Json& snapshot) { sort_by_member(snapshot, "staff_id"); };

    for (auto& work : encoded.at("works")) {
        canonicalize_offer(work.at("offer"));
        if (work.at("delivery").is_object()) {
            canonicalize_snapshot(work.at("delivery").at("staff_snapshot"));
            std::sort(work.at("delivery").at("commercial_entries").begin(),
                      work.at("delivery").at("commercial_entries").end());
        }
    }
    if (encoded.at("market").is_object() && encoded.at("market").contains("slots")) {
        Json& slots = encoded.at("market").at("slots");
        sort_by_member(slots, "id");
        for (auto& offer : slots) canonicalize_offer(offer);
    }
    if (encoded.at("committees").is_array()) {
        sort_by_member(encoded.at("committees"), "id");
        for (auto& committee : encoded.at("committees"))
            if (committee.is_object() && committee.contains("partner_ids")) sort_strings(committee.at("partner_ids"));
    }
    for (auto& work : encoded.at("events").at("per_work")) {
        if (work.is_object() && work.contains("major_seen")) sort_strings(work.at("major_seen"));
    }
    for (auto& record : encoded.at("archive").at("works")) canonicalize_snapshot(record.at("staff_snapshot"));
    return hex64(fnv1a64(encoded.dump()));
}

// ---------------- 命令 ----------------
std::string initialize(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        if (!request.is_object() || (request.contains("company_name") && !request.at("company_name").is_string()))
            return encode(error_body("INVALID_INPUT", "initialize_game 字段类型非法"));
        std::uint32_t seed = 0;
        if (request.contains("seed")) {
            const auto& value = request.at("seed");
            if (!value.is_number_integer()) return encode(error_body("INVALID_INPUT", "seed 必须为 uint32 整数"));
            if (value.is_number_unsigned()) {
                const auto number = value.get<std::uint64_t>();
                if (number > 0xFFFFFFFFULL) return encode(error_body("INVALID_INPUT", "seed 超出 uint32"));
                seed = static_cast<std::uint32_t>(number);
            } else {
                const auto number = value.get<std::int64_t>();
                if (number < 0 || number > 0xFFFFFFFFLL) return encode(error_body("INVALID_INPUT", "seed 超出 uint32"));
                seed = static_cast<std::uint32_t>(number);
            }
        }
        const std::string name = request.value("company_name", std::string("新动画工作室"));

        GameState state;
        state.version = kContractVersion;
        state.seed = seed;
        state.company.id = "company_01";
        state.company.name = name;
        state.company.founded_week = 0;
        state.company.week = 0;
        state.company.status = "running";
        state.company.reputation = 100;
        state.company.facilities = {};

        auto make_staff = [](const std::string& id, const std::string& staff_name, const std::string& role,
                             std::array<int, kAbilityCount> abilities) {
            Staff member;
            member.id = id;
            member.name = staff_name;
            member.role = role;
            member.employment = "core";
            member.abilities = abilities;
            member.potential = abilities;
            member.talent_type = "specialist";
            member.weekly_salary = 40000;
            member.fatigue = 0;
            member.morale = 80;
            return member;
        };
        state.staff.push_back(make_staff("staff_dir", "林监督", "director", {60, 80, 45, 40, 70, 40}));
        state.staff.push_back(make_staff("staff_ka", "陈原画", "key_animator", {45, 55, 85, 60, 40, 45}));
        state.staff.push_back(make_staff("staff_anim", "许动画", "animator", {40, 45, 60, 75, 40, 50}));

        state.finance.opening_funds = 2000000;
        state.finance.balance = 2000000;
        state.market = Json{{"slots", Json::array({default_offer()})}};
        state.events = EventState{};
        state.archive = Archive{};

        const auto errors = validate(state);
        if (!errors.empty()) {
            return encode(error_body("INVALID_STATE", errors.front()));
        }
        return encode(Json{{"state", state}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string instantiate_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (!request.contains("blueprint") || !request.at("blueprint").is_object() ||
            (request.contains("work_id") && !request.at("work_id").is_string()) ||
            (request.contains("duration_weeks") && !request.at("duration_weeks").is_number_integer()) ||
            (request.contains("workload_scale_permille") && !request.at("workload_scale_permille").is_number_integer())) {
            return encode(error_body("INVALID_INPUT", "instantiate_work 字段类型非法"));
        }
        const Json blueprint = request.at("blueprint");
        const std::string work_id = request.value("work_id", std::string("work_01"));
        const int duration_weeks = request.value("duration_weeks", 26);
        const int workload_scale_permille = request.value("workload_scale_permille", 1000);

        if (find_work(state, work_id) != nullptr) {
            return encode(error_body("INVALID_INPUT", "work_id 已存在"));
        }

        Project work;
        std::string error;
        try {
            if (!instantiate(blueprint, work_id, state.company.week, duration_weeks, workload_scale_permille, work, error)) {
                return encode(error_body("INVALID_INPUT", error));
            }
        } catch (const Json::exception& exception) {
            return encode(error_body("INVALID_INPUT", std::string("blueprint 字段类型无效: ") + exception.what()));
        }
        state.works.push_back(std::move(work));
        state.events.per_work[work_id] = Json{{"cooldowns", Json::object()}, {"major_seen", Json::array()},
                                               {"last_event_week", nullptr}, {"effects", Json::array()}};

        std::vector<std::string> errors;
        try {
            errors = validate(state);
        } catch (const Json::exception& exception) {
            return encode(error_body("INVALID_STATE", std::string("状态校验字段类型无效: ") + exception.what()));
        }
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        try {
            return encode(Json{{"state", state}, {"work_id", work_id}});
        } catch (const Json::exception& exception) {
            return encode(error_body("INVALID_STATE", std::string("状态序列化字段类型无效: ") + exception.what()));
        }
    } catch (const Json::exception& exception) {
        return encode(error_body("INVALID_INPUT", std::string("JSON 或字段类型无效: ") + exception.what()));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string set_plan(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (!request.contains("work_id") || !request.at("work_id").is_string() ||
            !request.contains("plan") || !request.at("plan").is_object()) {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串且 plan 必须是对象"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        const Json& plan = request.at("plan");
        const std::set<std::string> plan_keys{"intensity", "focus", "outsourcing", "overtime", "target"};
        for (auto it = plan.begin(); it != plan.end(); ++it) {
            if (!plan_keys.count(it.key())) return encode(error_body("INVALID_INPUT", "plan 含未知字段: " + it.key()));
        }

        Project* work = find_work(state, work_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以改计划"));

        auto one_of = [](const std::string& value, std::initializer_list<const char*> allowed) {
            for (const char* candidate : allowed) {
                if (value == candidate) return true;
            }
            return false;
        };
        std::string intensity = work->plan.intensity;
        std::string focus = work->plan.focus;
        std::string outsourcing = work->plan.outsourcing;
        std::string overtime = work->plan.overtime;
        if (plan.contains("intensity")) {
            if (!plan.at("intensity").is_string()) return encode(error_body("INVALID_INPUT", "intensity 必须是字符串"));
            intensity = plan.at("intensity").get<std::string>();
            if (!one_of(intensity, {"low", "standard", "high"})) return encode(error_body("INVALID_INPUT", "intensity 取值非法"));
        }
        if (plan.contains("focus")) {
            if (!plan.at("focus").is_string()) return encode(error_body("INVALID_INPUT", "focus 必须是字符串"));
            focus = plan.at("focus").get<std::string>();
            if (!one_of(focus, {"quality", "schedule", "cost"})) return encode(error_body("INVALID_INPUT", "focus 取值非法"));
        }
        if (plan.contains("outsourcing")) {
            if (!plan.at("outsourcing").is_string()) return encode(error_body("INVALID_INPUT", "outsourcing 必须是字符串"));
            outsourcing = plan.at("outsourcing").get<std::string>();
            if (!one_of(outsourcing, {"none", "gap_fill", "aggressive"})) return encode(error_body("INVALID_INPUT", "outsourcing 取值非法"));
        }
        if (plan.contains("overtime")) {
            if (!plan.at("overtime").is_string()) return encode(error_body("INVALID_INPUT", "overtime 必须是 off 或 conditional"));
            overtime = plan.at("overtime").get<std::string>();
            if (!one_of(overtime, {"off", "conditional"})) return encode(error_body("INVALID_INPUT", "overtime 取值非法"));
        }

        std::optional<Target> target = work->plan.target;
        if (plan.contains("target")) {
            const auto& raw = plan.at("target");
            if (raw.is_null()) {
                target.reset();
            } else {
                if (!raw.is_object() || raw.size() != 2 || !raw.contains("kind") || !raw.contains("id") ||
                    !raw.at("kind").is_string() || !raw.at("id").is_string()) {
                    return encode(error_body("INVALID_INPUT", "target 必须仅含字符串字段 kind、id，或为 null"));
                }
                const std::string kind = raw.at("kind").get<std::string>();
                const std::string id = raw.at("id").get<std::string>();
                bool valid = false;
                if (kind == "episode") {
                    valid = std::any_of(work->episodes.begin(), work->episodes.end(),
                                        [&id](const Episode& episode) { return episode.id == id; });
                } else if (kind == "stage") {
                    valid = stage_index(id) >= 0;
                }
                if (!valid) return encode(error_body("INVALID_INPUT", "target 必须指向本项目单集或合法阶段"));
                target = Target{kind, id};
            }
        }

        work->plan.intensity = intensity;
        work->plan.focus = focus;
        work->plan.outsourcing = outsourcing;
        work->plan.overtime = overtime;
        work->plan.target = target;

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string assign_staff(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (!request.contains("staff_id") || !request.at("staff_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "staff_id 必须是字符串"));
        }
        if (!request.contains("work_id")) {
            return encode(error_body("INVALID_INPUT", "work_id 必填；取消分配请显式传 null"));
        }
        const std::string staff_id = request.at("staff_id").get<std::string>();

        Staff* member = find_staff(state, staff_id);
        if (member == nullptr) return encode(error_body("NOT_FOUND", "员工不存在"));

        // M0 命令 4 的语义是 assign_staff(staff_id, work_id|null)。
        // 非法类型不能被静默解释成"取消分配"——那会让客户端一个拼写错误改变玩家归属。
        if (request.at("work_id").is_null()) {
            member->assignment_work_id.reset();
        } else if (request.at("work_id").is_string()) {
            const std::string work_id = request.at("work_id").get<std::string>();
            if (work_id.empty()) return encode(error_body("INVALID_INPUT", "work_id 不能为空字符串"));
            const Project* work = find_work(state, work_id);
            if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
            if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以分配人员"));
            member->assignment_work_id = work_id;
        } else {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串或 null"));
        }

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

struct SettlementAmounts {
    int64_t commercial = 0;
    int64_t reward = 0;
    int64_t penalty = 0;
};

bool settle_project(GameState& state, Project& work, const SettlementAmounts& amounts, bool forced, std::string& error);

std::string advance_week(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));

        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (state.company.week >= kMaxWeek) return encode(error_body("INVALID_PHASE", "已达经营上限"));
        if (!state.events.pending.empty()) {
            return encode(error_body("INVALID_PHASE", "存在待处理事件"));
        }

        std::vector<Json> event_catalog;
        if (request.contains("event_catalog")) {
            std::string catalog_error;
            if (!catalog_shape(request.at("event_catalog"), event_catalog, catalog_error)) {
                return encode(error_body("INVALID_INPUT", catalog_error));
            }
        }

        const int week = state.company.week;
        Json works_report = Json::array();
        std::map<std::string, int> produced_by_staff;

        // 结算内一律按 id 排序遍历：账本条目顺序、随机坐标都不能受数组顺序影响。
        std::vector<Project*> ordered;
        for (auto& work : state.works) ordered.push_back(&work);
        std::sort(ordered.begin(), ordered.end(), [](const Project* a, const Project* b) { return a->id < b->id; });
        std::vector<const Staff*> ordered_staff;
        for (const auto& member : state.staff) ordered_staff.push_back(&member);
        std::sort(ordered_staff.begin(), ordered_staff.end(),
                  [](const Staff* a, const Staff* b) { return a->id < b->id; });

        // ---- 阶段 5：强制费用预检（M1 最小切片：工资 + 运营 + 制作费）----
        // 预检失败一律整周不提交：不推进、不记账、不生产。危机路径是 M2.5，
        // 此处只保证"钱不够时周不会假装过完"。
        std::map<std::string, int> assigned_count;
        for (const Staff* member : ordered_staff) {
            if (member->assignment_work_id) ++assigned_count[*member->assignment_work_id];
        }
        int64_t salary_total = 0;
        for (const Staff* member : ordered_staff) {
            if (!checked_add(salary_total, member->weekly_salary, salary_total))
                return encode(error_body("INVALID_STATE", "工资总额溢出"));
        }
        const int64_t operations_total = kernel::weekly_operations_cost();
        int64_t production_total = 0;
        for (const Project* work : ordered) {
            if (work->status != "producing") continue;
            if (assigned_count[work->id] == 0) continue;
            if (!checked_add(production_total, kernel::weekly_production_cost(work->plan.intensity), production_total))
                return encode(error_body("INVALID_STATE", "制作费总额溢出"));
        }
        int64_t total_cost = 0;
        if (!checked_add(salary_total, operations_total, total_cost) || !checked_add(total_cost, production_total, total_cost))
            return encode(error_body("INVALID_STATE", "周强制费用溢出"));
        if (state.finance.balance < total_cost) {
            const int64_t gap = total_cost - state.finance.balance;
            return encode(Json{{"error",
                                {{"code", "INSUFFICIENT_FUNDS"},
                                 {"message", "本周强制费用不足，缺口 " + std::to_string(gap) + " 日元"},
                                 {"gap", gap}}}});
        }

        // ---- 阶段 6：原子记账（唯一账本，逐条可归因）----
        bool ledger_ok = true;
        std::string ledger_error;
        auto spend = [&state, week, &ledger_ok, &ledger_error](const std::string& entry_id, std::optional<std::string> work_id,
                                                               const char* category, int64_t amount, const std::string& memo) {
            if (amount <= 0) return;
            LedgerEntry entry{entry_id, week, std::move(work_id), category, -amount, std::nullopt, memo};
            if (!post_ledger(state.finance, entry, ledger_error)) ledger_ok = false;
        };
        for (const Staff* member : ordered_staff) {
            if (member->employment == "core") {
                spend("w" + std::to_string(week) + ".salary." + member->id, member->assignment_work_id, "salary",
                      member->weekly_salary, member->id);
            } else {
                spend("w" + std::to_string(week) + ".temporary." + member->id, member->assignment_work_id, "temporary",
                      member->weekly_salary, member->id);
            }
        }
        spend("w" + std::to_string(week) + ".operations", std::nullopt, "operations", operations_total, "公司运营");
        for (const Project* work : ordered) {
            if (work->status != "producing" || assigned_count[work->id] == 0) continue;
            const int64_t cost = kernel::weekly_production_cost(work->plan.intensity);
            spend("w" + std::to_string(week) + ".production." + work->id, work->id, "production", cost,
                  work->plan.intensity);
        }
        if (!ledger_ok) return encode(error_body("INTERNAL_ERROR", "流水写入失败: " + ledger_error));

        for (Project* work : ordered) {
            if (work->status != "producing") continue;

            std::vector<const Staff*> assigned;
            std::set<std::string> switching_supervisors;
            for (const auto& member : state.staff) {
                if (!member.assignment_work_id || *member.assignment_work_id != work->id) continue;
                assigned.push_back(&member);
                if (kernel::supervisor_switched(member, work->id)) switching_supervisors.insert(member.id);
            }
            if (assigned.empty()) continue;

            // 周初快照：磨合判定只看"本周开始前"的进度与参与者
            std::map<std::string, std::pair<int, bool>> before;   // item_id -> (work_done, 占位)
            std::map<std::string, std::set<std::string>> prior_contributors;
            walk_items(*work, [&before, &prior_contributors](const WorkItem& item) {
                before[item.id] = {item.work_done, false};
                prior_contributors[item.id] = std::set<std::string>(item.contributors.begin(), item.contributors.end());
            });

            int team_permille = kernel::team_capacity_permille(!switching_supervisors.empty());
            auto assignments = kernel::allocate(*work, assigned, team_permille);
            const bool switching_supervisor_produced = std::any_of(assignments.begin(), assignments.end(), [&](const auto& assignment) {
                return assignment.points > 0 && switching_supervisors.count(assignment.staff_id) > 0;
            });
            if (!switching_supervisors.empty() && !switching_supervisor_produced) {
                team_permille = 1000;
                assignments = kernel::allocate(*work, assigned, team_permille);
            }

            std::map<std::string, Json> item_reports;
            std::vector<std::string> order;
            for (const auto& assignment : assignments) {
                Staff* member = find_staff(state, assignment.staff_id);
                WorkItem* item = find_item(*work, assignment.item_id);
                if (member == nullptr || item == nullptr) continue;
                const auto prior = before[item->id];
                bool prior_contributed = false;
                {
                    // 周初参与者快照：复用 contributors 在周初的前缀（分配前记录）
                    const auto snapshot = prior_contributors.find(item->id);
                    prior_contributed = snapshot != prior_contributors.end() &&
                                        snapshot->second.count(member->id) > 0;
                }
                const bool hands_over = kernel::hands_over_item(prior.first, item->work_total, prior_contributed, member->role);
                const auto caps = kernel::quality_caps(*work, *item);
                const auto result = kernel::apply_production(*item, *member, assignment.points, hands_over, state.seed,
                                                             week, assignment.stage_key, caps);
                produced_by_staff[member->id] += result.points;
                if (item_reports.find(item->id) == item_reports.end()) {
                    order.push_back(item->id);
                    item_reports[item->id] = Json{{"item_id", item->id}, {"points", 0}, {"quality_gain", 0}};
                }
                item_reports[item->id]["points"] = item_reports[item->id]["points"].get<int>() + result.points;
                item_reports[item->id]["quality_gain"] = item_reports[item->id]["quality_gain"].get<int>() + result.quality_gain;

                if (result.points > 0) {
                    member->last_participation = Participation{work->id, item->id, week};
                    if (result.points >= kExperienceThreshold) {
                        const int ability = ability_index(item->ability);
                        if (ability >= 0) {
                            member->experience[static_cast<std::size_t>(ability)] =
                                std::min(100, member->experience[static_cast<std::size_t>(ability)] + 1);
                        }
                    }
                }
            }

            Json items = Json::array();
            int total_points = 0;
            for (const auto& id : order) {
                items.push_back(item_reports[id]);
                total_points += item_reports[id]["points"].get<int>();
            }
            // 质量聚合：工作项 → 阶段 → 单集 → 作品，让"随机提升若干质量项"变成玩家看得见的数
            const auto aggregated = kernel::aggregate_work(*work);
            Json dims = Json::object();
            for (int i = 0; i < kDimensionCount; ++i) dims[kDimensions[static_cast<std::size_t>(i)]] = aggregated.dims[static_cast<std::size_t>(i)];
            works_report.push_back(Json{{"work_id", work->id},
                                        {"items", items},
                                        {"total_points", total_points},
                                        {"quality", Json{{"dims", dims}, {"mean", aggregated.mean}}}});
        }

        apply_ready_effects(state);

        // 人员状态结算（每人每周一次）
        Json staff_report = Json::array();
        for (auto& member : state.staff) {
            const int produced = produced_by_staff[member.id];
            if (produced > 0) {
                member.fatigue = clamp_int(member.fatigue + kFatigueWorkGain, 0, 100);
                member.morale = clamp_int(member.morale - kMoraleWorkPenalty, 0, 100);
            } else {
                member.fatigue = clamp_int(member.fatigue - kFatigueRestLoss, 0, 100);
                member.morale = clamp_int(member.morale + kMoraleRestGain, 0, 100);
                // INV-11：参与记录只允许是"上周"或 null。本周没产出就清空，
                // 不能留着两周前的记录让校验器与磨合判定各说一套。
                member.last_participation.reset();
            }
            staff_report.push_back(Json{{"staff_id", member.id}, {"produced", produced},
                                        {"fatigue", member.fatigue}, {"morale", member.morale}});
        }

        state.company.week = week + 1;

        Json forced_deliveries = Json::array();
        for (Project* work : ordered) {
            if (work->status != "producing" || work->deadline_week > state.company.week) continue;
            std::string settlement_error;
            if (!settle_project(state, *work, SettlementAmounts{}, true, settlement_error)) {
                return encode(error_body("INTERNAL_ERROR", "截止交付失败: " + settlement_error));
            }
            forced_deliveries.push_back(Json{{"work_id", work->id}, {"archive_id", work->delivery.at("archive_id")},
                                              {"on_time", work->delivery.at("on_time")}});
        }

        Json report = Json{{"week", week},
                           {"works", works_report},
                           {"staff", staff_report},
                           {"forced_deliveries", forced_deliveries},
                           {"funds", Json{{"delta", -total_cost},
                                          {"balance", state.finance.balance},
                                          {"costs", Json{{"salary", salary_total},
                                                         {"operations", operations_total},
                                                         {"production", production_total}}}}}};
        if (!event_catalog.empty()) trigger_events(state, event_catalog, report);
        const auto post_errors = validate(state);
        if (!post_errors.empty()) return encode(error_body("INTERNAL_ERROR", "结算后状态非法: " + post_errors.front()));
        return encode(Json{{"state", state}, {"report", report}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string start_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (state.finance.solvency.state == "crisis") return encode(error_body("CRISIS_COMMITMENT_BLOCKED", "资金危机期间不能立项"));
        if (!request.contains("offer_id") || !request.at("offer_id").is_string() ||
            !request.contains("mode") || !request.at("mode").is_string() || !request.contains("blueprint")) {
            return encode(error_body("INVALID_INPUT", "offer_id、mode、blueprint 必填"));
        }
        if (request.contains("percent") && !request.at("percent").is_number_integer())
            return encode(error_body("INVALID_INPUT", "percent 必须为整数"));
        const std::string offer_id = request.at("offer_id").get<std::string>();
        const std::string mode = request.at("mode").get<std::string>();
        const int percent = request.value("percent", 0);
        std::vector<std::string> partner_ids;
        if (request.contains("committee_partner_ids")) {
            if (!request.at("committee_partner_ids").is_array() ||
                std::any_of(request.at("committee_partner_ids").begin(), request.at("committee_partner_ids").end(),
                            [](const Json& id) { return !id.is_string(); }))
                return encode(error_body("INVALID_INPUT", "committee_partner_ids 必须是字符串数组"));
            if (!request.at("committee_partner_ids").empty())
                return encode(error_body("NOT_IMPLEMENTED", "M2 尚未实现委员会合作方"));
        }
        if (!state.market.contains("slots") || !state.market.at("slots").is_array()) {
            return encode(error_body("INVALID_STATE", "market.slots 非法"));
        }
        Json offer;
        std::size_t offer_index = state.market.at("slots").size();
        for (std::size_t i = 0; i < state.market.at("slots").size(); ++i) {
            const auto& slot = state.market.at("slots").at(i);
            if (slot.is_object() && slot.value("id", std::string{}) == offer_id) { offer = slot; offer_index = i; break; }
        }
        if (offer.is_null()) return encode(error_body("NOT_FOUND", "企划不存在或已消耗"));
        if (!valid_offer_shape(offer)) return encode(error_body("INVALID_STATE", "企划结构非法"));
        bool mode_allowed = false;
        for (const auto& allowed : offer.at("allowed_modes")) if (allowed.get<std::string>() == mode) mode_allowed = true;
        if (!mode_allowed) return encode(error_body("MODE_NOT_ALLOWED", "企划不允许该模式"));
        if (mode == "contract" && percent != 0) return encode(error_body("INVALID_INPUT", "承制项目 percent 必须为 0"));
        if (mode == "committee" && (percent < 10 || percent > 100 || percent % 10 != 0))
            return encode(error_body("INVALID_INPUT", "委员会投资比例必须为 10 的整数倍且位于 10..100"));

        std::string work_id;
        for (int i = 1; i <= 1000; ++i) {
            char buffer[8];
            std::snprintf(buffer, sizeof(buffer), "work_%02d", i);
            const std::string candidate = buffer;
            if (find_work(state, candidate) == nullptr) { work_id = candidate; break; }
        }
        if (work_id.empty()) return encode(error_body("INVALID_STATE", "项目 id 空间已耗尽"));
        const Json& blueprint = request.at("blueprint");
        if (!blueprint.is_object() || !blueprint.contains("id") || !blueprint.at("id").is_string() ||
            blueprint.at("id").get<std::string>() != offer.at("blueprint_id").get<std::string>()) {
            return encode(error_body("INVALID_INPUT", "blueprint 与企划 blueprint_id 不匹配"));
        }
        if (!blueprint.contains("episode_count") || !blueprint.at("episode_count").is_number_integer() ||
            blueprint.at("episode_count").get<std::int64_t>() != offer.at("episode_count").get<std::int64_t>()) {
            return encode(error_body("INVALID_INPUT", "blueprint 与企划集数不匹配"));
        }
        if (blueprint.contains("scale") && blueprint.at("scale").is_string() &&
            blueprint.at("scale").get<std::string>() != offer.at("scale").get<std::string>() &&
            !(offer.at("scale").get<std::string>() == "tv_standard" && blueprint.at("scale").get<std::string>() == "tv")) {
            return encode(error_body("INVALID_INPUT", "blueprint 与企划规模不匹配"));
        }
        Project work;
        std::string error;
        if (!instantiate(blueprint, work_id, state.company.week, offer.at("duration_weeks").get<int>(),
                         offer.at("workload_scale_permille").get<int>(), work, error)) {
            return encode(error_body("INVALID_INPUT", error));
        }
        work.offer = offer;
        work.mode = mode;
        work.channels = offer.at("channels_baseline").get<std::vector<std::string>>();
        const int64_t budget = offer.at("contract_budget").get<int64_t>();
        if (budget <= 0) return encode(error_body("INVALID_INPUT", "contract_budget 必须为正"));
        if (mode == "committee") {
            if (budget > INT64_MAX / 2) return encode(error_body("INVALID_INPUT", "contract_budget 超出安全计算范围"));
            const int64_t pool = budget * 2;
            const int64_t principal = pool * percent / 100;
            if (state.finance.balance < principal) return encode(error_body("INSUFFICIENT_FUNDS", "委员会投资本金不足"));
            work.committee_id = work_id + ".committee";
            work.investment = Json{{"percent", percent}, {"principal", principal}, {"total", pool}};
            LedgerEntry investment{"w" + std::to_string(state.company.week) + ".investment." + work_id, state.company.week,
                                   work_id, "investment_paid", -principal, std::nullopt, "委员会投资本金"};
            if (!post_ledger(state.finance, investment, error)) return encode(error_body("INVALID_STATE", error));
            state.committees.push_back(Json{{"id", *work.committee_id}, {"work_id", work_id}, {"partner_ids", partner_ids},
                                             {"investment_percent", percent}, {"investment_paid", principal},
                                             {"production_fee", budget}, {"status", "active"}});
        }
        LedgerEntry received{"w" + std::to_string(state.company.week) + ".contract." + work_id, state.company.week,
                             work_id, "contract_received", budget, std::nullopt, "项目开始制作费"};
        if (!post_ledger(state.finance, received, error)) return encode(error_body("INVALID_STATE", error));
        state.market.at("slots").erase(state.market.at("slots").begin() + static_cast<std::ptrdiff_t>(offer_index));
        state.works.push_back(std::move(work));
        state.events.per_work[work_id] = Json{{"cooldowns", Json::object()}, {"major_seen", Json::array()},
                                               {"last_event_week", nullptr}, {"effects", Json::array()}};
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}, {"work_id", work_id}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

bool parse_settlement(const Json& request, SettlementAmounts& amounts, std::string& error) {
    if (!request.contains("settlement")) return true;
    const auto& settlement = request.at("settlement");
    if (!settlement.is_object()) { error = "settlement 必须是对象"; return false; }
    for (auto it = settlement.begin(); it != settlement.end(); ++it) {
        if (it.key() != "commercial_share_received" && it.key() != "success_reward_received" && it.key() != "penalty") {
            error = "settlement 含未知字段: " + it.key();
            return false;
        }
    }
    auto amount = [&settlement, &error](const char* key, std::int64_t& out) {
        if (!settlement.contains(key)) { out = 0; return true; }
        const auto& value = settlement.at(key);
        if (!value.is_number_integer() || (value.is_number_unsigned() && value.get<std::uint64_t>() > static_cast<std::uint64_t>(INT64_MAX))) {
            error = std::string("结算金额必须为 int64 整数: ") + key;
            return false;
        }
        out = value.get<std::int64_t>();
        return out >= 0;
    };
    if (!amount("commercial_share_received", amounts.commercial) || !amount("success_reward_received", amounts.reward) ||
        !amount("penalty", amounts.penalty)) {
        error = "结算金额必须为非负整数";
        return false;
    }
    return true;
}

bool settle_project(GameState& state, Project& work, const SettlementAmounts& amounts, bool forced, std::string& error) {
    if (work.status != "producing") { error = "只有制作中的项目可以交付"; return false; }
    std::int64_t commercial_income = 0;
    if (!checked_add(commercial_income, amounts.commercial, commercial_income) ||
        !checked_add(commercial_income, amounts.reward, commercial_income) ||
        !checked_add(commercial_income, -amounts.penalty, commercial_income)) {
        error = "交付结算金额溢出";
        return false;
    }
    if (amounts.commercial > 0 && !post_ledger(state.finance, LedgerEntry{"w" + std::to_string(state.company.week) + ".commercial." + work.id,
            state.company.week, work.id, "commercial_share_received", amounts.commercial, std::nullopt, "交付商业分账"}, error)) return false;
    if (amounts.reward > 0 && !post_ledger(state.finance, LedgerEntry{"w" + std::to_string(state.company.week) + ".reward." + work.id,
            state.company.week, work.id, "success_reward_received", amounts.reward, std::nullopt, "承制成功奖励"}, error)) return false;
    if (amounts.penalty > 0 && !post_ledger(state.finance, LedgerEntry{"w" + std::to_string(state.company.week) + ".penalty." + work.id,
            state.company.week, work.id, "penalty", -amounts.penalty, std::nullopt, "交付扣罚"}, error)) return false;

    auto per_work = state.events.per_work.find(work.id);
    if (per_work == state.events.per_work.end()) { error = "项目事件状态不存在"; return false; }
    apply_project_effects(work, per_work.value());
    const auto quality = kernel::aggregate_work(work);
    Json quality_json = Json::object();
    for (int i = 0; i < kDimensionCount; ++i) quality_json[kDimensions[static_cast<std::size_t>(i)]] = quality.dims[static_cast<std::size_t>(i)];
    Json staff_snapshot = Json::array();
    std::vector<Staff*> ordered_staff;
    for (auto& member : state.staff) ordered_staff.push_back(&member);
    std::sort(ordered_staff.begin(), ordered_staff.end(), [](const Staff* a, const Staff* b) { return a->id < b->id; });
    int64_t production_cost = 0;
    for (const auto& entry : state.finance.entries) {
        if (entry.work_id && *entry.work_id == work.id && entry.amount < 0 &&
            (entry.category == "salary" || entry.category == "production" || entry.category == "temporary" ||
             entry.category == "outsourcing" || entry.category == "events" || entry.category == "extension" ||
             entry.category == "distribution")) {
            if (entry.amount == INT64_MIN || !checked_add(production_cost, -entry.amount, production_cost)) {
                error = "项目制作成本溢出";
                return false;
            }
        }
    }
    int64_t project_net = 0;
    for (const auto& entry : state.finance.entries) {
        if (entry.work_id && *entry.work_id == work.id && !checked_add(project_net, entry.amount, project_net)) {
            error = "项目净现金流溢出";
            return false;
        }
    }
    for (Staff* member : ordered_staff) {
        int contribution = 0;
        int total_work = 0;
        walk_items(work, [&](const WorkItem& item) {
            if (std::find(item.contributors.begin(), item.contributors.end(), member->id) == item.contributors.end()) return;
            contribution += item.work_done;
            total_work += item.work_total;
        });
        if (contribution <= 0) continue;
        staff_snapshot.push_back(Json{{"staff_id", member->id}, {"name", member->name}, {"role", member->role},
                                       {"contribution", contribution}, {"total_work", total_work}});
        auto history = std::find_if(member->works_history.begin(), member->works_history.end(),
                                    [&](const WorkHistory& entry) { return entry.work_id == work.id; });
        if (history == member->works_history.end()) member->works_history.push_back(WorkHistory{work.id, contribution, total_work});
        else { history->contribution += contribution; history->total_work += total_work; }
    }
    const bool on_time = state.company.week <= work.deadline_week && work.deliverable();
    const std::string title = work.offer.value("name", work.id);
    const std::string archive_id = "archive." + work.id;
    Json commercial_entries = Json::array();
    if (amounts.commercial > 0) commercial_entries.push_back(Json{{"category", "commercial_share_received"}, {"amount", amounts.commercial}});
    if (amounts.reward > 0) commercial_entries.push_back(Json{{"category", "success_reward_received"}, {"amount", amounts.reward}});
    if (amounts.penalty > 0) commercial_entries.push_back(Json{{"category", "penalty"}, {"amount", -amounts.penalty}});
    work.status = "delivered";
    if (work.committee_id)
        for (auto& committee : state.committees)
            if (committee.at("id") == *work.committee_id) committee.at("status") = "closed";
    work.delivery = Json{{"delivered_week", state.company.week}, {"on_time", on_time}, {"forced", forced}, {"quality", quality_json},
                         {"staff_snapshot", staff_snapshot}, {"production_cost", production_cost},
                         {"commercial_entries", commercial_entries}, {"commercial_income", commercial_income},
                         {"profit", project_net}, {"archive_id", archive_id}};
    state.archive.works.push_back(WorkRecord{archive_id, work.id, title, work.mode, work.opened_week, state.company.week,
                                             work.deadline_week, on_time, quality_json, staff_snapshot, production_cost,
                                             commercial_income, project_net});
    for (auto& member : state.staff) if (member.assignment_work_id && *member.assignment_work_id == work.id) member.assignment_work_id.reset();
    state.staff.erase(std::remove_if(state.staff.begin(), state.staff.end(), [&](const Staff& member) {
        return member.employment == "temporary" && member.temporary_contract.is_object() &&
               member.temporary_contract.value("work_id", std::string{}) == work.id;
    }), state.staff.end());
    const auto errors = validate(state);
    if (!errors.empty()) { error = errors.front(); return false; }
    return true;
}

std::string deliver_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (!request.contains("work_id") || !request.at("work_id").is_string()) return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        Project* work = find_work(state, request.at("work_id").get<std::string>());
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以交付"));
        if (!work->deliverable()) return encode(error_body("GATE_UNMET", "门槛工作项尚未达标"));
        SettlementAmounts amounts;
        std::string error;
        if (!parse_settlement(request, amounts, error)) return encode(error_body("INVALID_INPUT", error));
        if (!settle_project(state, *work, amounts, false, error)) return encode(error_body("INVALID_STATE", error));
        return encode(Json{{"state", state}, {"archive_id", work->delivery.at("archive_id").get<std::string>()}});
    } catch (const Json::exception& exception) {
        return encode(error_body("INVALID_INPUT", std::string("JSON 或字段类型无效: ") + exception.what()));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string abort_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (!request.contains("work_id") || !request.at("work_id").is_string()) return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        Project* work = find_work(state, request.at("work_id").get<std::string>());
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以中止"));
        work->status = "aborted";
        if (work->committee_id)
            for (auto& committee : state.committees)
                if (committee.at("id") == *work->committee_id) committee.at("status") = "closed";
        for (auto& member : state.staff) if (member.assignment_work_id && *member.assignment_work_id == work->id) member.assignment_work_id.reset();
        state.staff.erase(std::remove_if(state.staff.begin(), state.staff.end(), [&](const Staff& member) {
            return member.employment == "temporary" && member.temporary_contract.is_object() &&
                   member.temporary_contract.value("work_id", std::string{}) == work->id;
        }), state.staff.end());
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}});
    } catch (const Json::exception& exception) {
        return encode(error_body("INVALID_INPUT", std::string("JSON 或字段类型无效: ") + exception.what()));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string resolve_event(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if (!request.contains("event_id") || !request.at("event_id").is_string() ||
            !request.contains("option_id") || !request.at("option_id").is_string() || !request.contains("catalog")) {
            return encode(error_body("INVALID_INPUT", "event_id、option_id、catalog 必填"));
        }
        std::vector<Json> events;
        std::string error;
        if (!catalog_shape(request.at("catalog"), events, error)) return encode(error_body("INVALID_INPUT", error));
        const std::string instance_id = request.at("event_id").get<std::string>();
        auto pending = std::find_if(state.events.pending.begin(), state.events.pending.end(),
                                    [&](const EventInstance& event) { return event.instance_id == instance_id; });
        if (pending == state.events.pending.end()) return encode(error_body("NOT_FOUND", "待处理事件不存在"));
        const Json* card = nullptr;
        for (const auto& event : events) if (event.at("id").get<std::string>() == pending->event_id) card = &event;
        if (card == nullptr) return encode(error_body("INVALID_INPUT", "事件目录缺少待处理事件"));
        const std::string option_id = request.at("option_id").get<std::string>();
        if (std::find(pending->option_ids.begin(), pending->option_ids.end(), option_id) == pending->option_ids.end())
            return encode(error_body("INVALID_INPUT", "选项不在事件触发快照中"));
        const Json* option = nullptr;
        for (const auto& entry : card->at("options")) if (entry.at("id").get<std::string>() == option_id) option = &entry;
        if (option == nullptr) return encode(error_body("INVALID_INPUT", "选项不存在"));
        Project* work = find_work(state, pending->work_id);
        if (work == nullptr) return encode(error_body("INVALID_STATE", "事件项目不存在"));
        const std::string kind = option->at("kind").get<std::string>();
        if (kind == "outsource" || kind == "extension") return encode(error_body("NOT_IMPLEMENTED", "该事件选项依赖尚未实现的系统"));
        if (work->status != "producing" && !option->at("effects").empty())
            return encode(error_body("NOT_IMPLEMENTED", "终态项目不再应用制作事件效果"));
        for (const auto& effect : option->at("effects")) {
            const std::string target = effect.at("target").get<std::string>();
            const std::string scope = effect.at("scope").get<std::string>();
            if (target == "funds") return encode(error_body("NOT_IMPLEMENTED", "事件现金效果尚未获得统一财务授权"));
            if (target == "quality" && scope != "stage" && scope != "project") return encode(error_body("NOT_IMPLEMENTED", "未知质量效果范围"));
            if (target == "work_done" && effect.at("value").get<int>() < 0)
                return encode(error_body("NOT_IMPLEMENTED", "暂不支持事件倒扣工作量"));
        }
        const int64_t cost = option->at("cost").get<int64_t>();
        if (cost < 0) return encode(error_body("INVALID_INPUT", "事件 cost 不能为负"));
        if (cost > state.finance.balance) return encode(error_body("INSUFFICIENT_FUNDS", "事件选项现金不足"));
        if (cost > 0 && !post_ledger(state.finance, LedgerEntry{"w" + std::to_string(state.company.week) + ".event." + instance_id + "." + option->at("id").get<std::string>(),
                state.company.week, pending->work_id, "events", -cost, std::nullopt, card->at("name").get<std::string>()}, error)) {
            return encode(error_body("INVALID_STATE", error));
        }
        for (std::size_t effect_index = 0; effect_index < option->at("effects").size(); ++effect_index) {
            const auto& effect = option->at("effects")[effect_index];
            const std::string scope = effect.at("scope").get<std::string>();
            const std::string target = effect.at("target").get<std::string>();
            const int value = effect.at("value").get<int>();
            if (scope == "instant" && (target == "fatigue" || target == "morale")) {
                for (auto& member : state.staff) {
                    if (!member.assignment_work_id || *member.assignment_work_id != work->id) continue;
                    if (target == "fatigue") member.fatigue = clamp_int(member.fatigue + value, 0, 100);
                    else member.morale = clamp_int(member.morale + value, 0, 100);
                }
            } else if (scope == "instant" && target == "work_done") {
                int remaining = value;
                std::vector<WorkItem*> items;
                for (auto& episode : work->episodes) {
                    for (auto& stage : episode.stages) {
                        if (stage.key != pending->stage_key) continue;
                        for (auto& item : stage.items) items.push_back(&item);
                    }
                }
                std::sort(items.begin(), items.end(), [](const WorkItem* a, const WorkItem* b) { return a->id < b->id; });
                for (WorkItem* item : items) {
                    if (remaining <= 0) break;
                    const int gain = std::min(remaining, item->remaining());
                    item->work_done += gain;
                    remaining -= gain;
                }
            } else if (target == "quality") {
                Json& per_work = state.events.per_work.at(work->id);
                if (!per_work.contains("effects")) per_work["effects"] = Json::array();
                per_work["effects"].push_back(Json{{"id", instance_id + "." + option_id + ".effect." + std::to_string(effect_index)},
                                                   {"scope", scope}, {"target", target}, {"value", value},
                                                   {"stage_key", effect.contains("stage") ? effect.at("stage").get<std::string>() : pending->stage_key},
                                                   {"applied", false}});
            }
        }
        state.events.pending.erase(pending);
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}, {"resolved", Json{{"instance_id", instance_id}, {"option_id", option->at("id")}}}});
    } catch (const Json::exception& exception) {
        return encode(error_body("INVALID_INPUT", std::string("JSON 或字段类型无效: ") + exception.what()));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string save_game(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state;
        std::string state_error;
        if (!decode_valid_state(request, state, state_error)) return encode(error_body("INVALID_STATE", state_error));
        if ((request.contains("saved_at") && !request.at("saved_at").is_string()) ||
            (request.contains("rules_version") && !request.at("rules_version").is_string()))
            return encode(error_body("INVALID_INPUT", "saved_at/rules_version 类型非法"));
        const std::string saved_at = request.value("saved_at", std::string{"2026-11-25T00:00:00Z"});
        const std::string rules_version = request.value("rules_version", std::string{kRulesVersion});
        if (!iso8601_timestamp(saved_at)) return encode(error_body("INVALID_INPUT", "saved_at 必须为 ISO8601"));
        if (rules_version.empty()) return encode(error_body("INVALID_INPUT", "rules_version 不能为空"));
        Json save{{"version", kContractVersion}, {"saved_at", saved_at}, {"rules_version", rules_version}, {"state", state}};
        return encode(Json{{"save", save}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string load_game(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        if (!request.is_object() || !request.contains("save") || !request.at("save").is_object()) {
            return encode(error_body("SAVE_CORRUPT", "save 必须是对象"));
        }
        const Json& save = request.at("save");
        if (!save.contains("version") || !save.at("version").is_number_integer()) return encode(error_body("SAVE_CORRUPT", "save.version 缺失或类型错误"));
        bool version_supported = false;
        if (save.at("version").is_number_unsigned()) {
            version_supported = save.at("version").get<std::uint64_t>() == kContractVersion;
        } else {
            version_supported = save.at("version").get<std::int64_t>() == kContractVersion;
        }
        if (!version_supported) return encode(error_body("SAVE_VERSION_UNSUPPORTED", "不支持该存档版本"));
        try {
            if (!save.contains("saved_at") || !save.at("saved_at").is_string() ||
                !save.contains("rules_version") || !save.at("rules_version").is_string() ||
                !save.contains("state") || !save.at("state").is_object() || save.size() != 4) {
                return encode(error_body("SAVE_CORRUPT", "存档结构不完整或含未知字段"));
            }
            if (!iso8601_timestamp(save.at("saved_at").get<std::string>()) || save.at("rules_version").get<std::string>().empty()) {
                return encode(error_body("SAVE_CORRUPT", "saved_at 或 rules_version 非法"));
            }
            const GameState state = save.at("state").get<GameState>();
            if (state.version != kContractVersion) return encode(error_body("SAVE_CORRUPT", "state.version 不兼容"));
            const auto errors = validate(state);
            if (!errors.empty()) return encode(error_body("SAVE_CORRUPT", errors.front()));
            const std::string rules_version = save.at("rules_version").get<std::string>();
            return encode(Json{{"state", state}, {"rules_version", rules_version},
                               {"rules_mismatch", rules_version != kRulesVersion}});
        } catch (const Json::exception&) {
            return encode(error_body("SAVE_CORRUPT", "存档字段损坏或缺失"));
        }
    } catch (const Json::exception&) {
        return encode(error_body("SAVE_CORRUPT", "无法解析存档 JSON"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 契约名适配：薄封装，避免测试入口被误当成正式命令。
std::string initialize_game(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        const bool valid_seed = request.contains("seed") &&
            (request.at("seed").is_number_unsigned() ||
             (request.at("seed").is_number_integer() && request.at("seed").get<std::int64_t>() >= 0));
        if (!valid_seed) return encode(error_body("INVALID_INPUT", "seed 必须是非负整数"));
        return initialize(input);
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string set_work_plan(const std::string& input) { return set_plan(input); }

std::string hash_state(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        const GameState state = decode_state(request);
        return encode(Json{{"hash", state_hash(state)}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

}  // namespace apc::v4
