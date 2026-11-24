#include "apc/v4/event.hpp"

#include <algorithm>
#include <cstdint>
#include <numeric>
#include <string>
#include <vector>

#include "apc/v4/kernel.hpp"

namespace apc::v4::event {
namespace {

constexpr int kBaseProbabilityPermille = 60;

std::uint32_t fnv1a(const std::string& text) {
    std::uint32_t hash = 2166136261U;
    for (const char ch : text) {
        hash ^= static_cast<std::uint8_t>(ch);
        hash *= 16777619U;
    }
    return hash;
}

int project_quality(const Project& work) {
    std::int64_t sum = 0;
    int count = 0;
    auto collect = [&sum, &count](const WorkItem& item) {
        for (const int value : item.quality.dims) {
            sum += value;
            ++count;
        }
    };
    for (const auto& item : work.common.items) collect(item);
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            for (const auto& item : stage.items) collect(item);
        }
    }
    return count > 0 ? static_cast<int>(sum / count) : 0;
}

int max_fatigue(const GameState& state) {
    int value = 0;
    for (const auto& member : state.staff) value = std::max(value, member.fatigue);
    return value;
}

bool stage_open(const Project& work, const std::vector<std::string>& stages) {
    if (stages.empty()) return true;
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            if (std::find(stages.begin(), stages.end(), stage.key) == stages.end()) continue;
            for (const auto& item : stage.items) {
                if (item.work_done < item.work_total) return true;
            }
        }
    }
    return false;
}

int metric_value(const GameState& state, const Project& work, const std::string& metric, int week) {
    if (metric == "work_quality") return project_quality(work);
    if (metric == "max_fatigue") return max_fatigue(state);
    if (metric == "weeks_to_deadline") return work.deadline_week - week;
    if (metric == "weeks_in_project") return week - work.opened_week;
    if (metric == "balance") return static_cast<int>(state.finance.balance);
    return 0;
}

bool condition_met(const GameState& state, const Project& work, const Spec& spec, int week) {
    const int value = metric_value(state, work, spec.metric, week);
    if (spec.op == "<") return value < spec.threshold;
    if (spec.op == "<=") return value <= spec.threshold;
    if (spec.op == ">") return value > spec.threshold;
    if (spec.op == ">=") return value >= spec.threshold;
    return false;
}

const Json& per_work(const GameState& state) {
    static const Json kEmpty = Json::object();
    if (!state.events.is_object() || !state.events.contains("per_work")) return kEmpty;
    const auto& value = state.events.at("per_work");
    return value.is_object() ? value : kEmpty;
}

bool on_cooldown(const GameState& state, const std::string& work_id, const Spec& spec, int week) {
    const auto& table = per_work(state);
    if (!table.contains(work_id)) return false;
    const auto& entry = table.at(work_id);
    if (!entry.contains("cooldowns") || !entry.at("cooldowns").contains(spec.id)) return false;
    const auto& until = entry.at("cooldowns").at(spec.id);
    return until.is_number_integer() && until.get<int>() > week;
}

bool major_seen(const GameState& state, const std::string& work_id, const Spec& spec) {
    if (!spec.once_per_project) return false;
    const auto& table = per_work(state);
    if (!table.contains(work_id)) return false;
    const auto& entry = table.at(work_id);
    if (!entry.contains("major_seen") || !entry.at("major_seen").is_array()) return false;
    for (const auto& seen : entry.at("major_seen")) {
        if (seen.is_string() && seen.get<std::string>() == spec.id) return true;
    }
    return false;
}

Json build_instance(const Spec& spec, const std::string& work_id, int week) {
    Json options = Json::array();
    for (const auto& option : spec.options) {
        options.push_back(Json{{"id", option.id},
                               {"label", option.label},
                               {"cost", option.cost},
                               {"risk_hint", option.risk_hint}});
    }
    return Json{{"event_id", spec.id},
                {"work_id", work_id},
                {"episode_id", nullptr},
                {"stage", nullptr},
                {"triggered_week", week},
                {"options", options},
                {"expires_week", nullptr},
                {"escalation", nullptr}};
}

struct Candidate {
    const Spec* spec = nullptr;
    const Project* work = nullptr;
};

bool candidate_before(const Candidate& left, const Candidate& right) {
    const bool left_major = left.spec->tier == "major";
    const bool right_major = right.spec->tier == "major";
    if (left_major != right_major) return left_major;
    if (left.spec->priority != right.spec->priority) return left.spec->priority < right.spec->priority;
    if (left.work->id != right.work->id) return left.work->id < right.work->id;
    return left.spec->id < right.spec->id;
}

}  // namespace

const std::vector<Spec>& catalog() {
    static const std::vector<Spec> kCatalog{
        Spec{"key_cut_rework", "关键镜头返修", "negative", "normal", "quality", "quality_rework",
             {"animation", "art_visual"}, 20, 6, false, "work_quality", "<", 45, 0,
             {OptionSpec{"accept", "abandon", "按现状推进", "质量缺口留到成片", 0,
                         {Effect{"instant", "morale", -3, ""}}},
              OptionSpec{"rework", "overtime", "抽调人手返修", "疲劳累积", 180000,
                         {Effect{"instant", "fatigue", 6, ""},
                          Effect{"stage", "quality", 4, "animation"}}}}},
        Spec{"schedule_slip", "作画进度落后", "negative", "normal", "schedule", "schedule_slip",
             {}, 10, 4, false, "weeks_to_deadline", "<=", 3, 0,
             {OptionSpec{"accept", "abandon", "维持原计划", "违约交付风险", 0,
                         {Effect{"stage", "quality", -3, ""}}},
              OptionSpec{"crunch", "overtime", "全员赶工", "疲劳飙升", 120000,
                         {Effect{"instant", "fatigue", 8, ""},
                          Effect{"stage", "work_done", 120, "animation"}}}}},
        Spec{"storyboard_spark", "分镜灵光", "positive", "normal", "quality", "creative_spark",
             {"storyboard_key_animation"}, 35, 10, false, "work_quality", ">=", 65, 15,
             {OptionSpec{"take", "accept", "采纳方案", "疲劳累积", 100000,
                         {Effect{"instant", "fatigue", 4, ""},
                          Effect{"stage", "quality", 3, "storyboard_key_animation"}}},
              OptionSpec{"skip", "decline", "按原方案走", "错过质量跃升", 0, {}}}},
    };
    return kCatalog;
}

const Spec* find(const std::string& id) {
    for (const auto& spec : catalog()) {
        if (spec.id == id) return &spec;
    }
    return nullptr;
}

Json draw(GameState& state, int week) {
    if (state.events.contains("pending") && !state.events.at("pending").is_null()) return Json{{"drawn", false}};

    std::vector<const Project*> ordered;
    for (const auto& work : state.works) {
        if (work.status == "producing") ordered.push_back(&work);
    }
    std::sort(ordered.begin(), ordered.end(), [](const Project* a, const Project* b) { return a->id < b->id; });

    std::vector<Candidate> performance;
    std::vector<Candidate> random_pool;
    for (const Project* work : ordered) {
        for (const auto& spec : catalog()) {
            if (!stage_open(*work, spec.stages)) continue;
            if (on_cooldown(state, work->id, spec, week)) continue;
            if (major_seen(state, work->id, spec)) continue;
            if (condition_met(state, *work, spec, week)) {
                performance.push_back(Candidate{&spec, work});
                continue;
            }
            if (spec.random_weight <= 0) continue;
            // 坐标式随机：同一 (seed, week, work) 永远得到同一结果，与遍历顺序无关。
            const auto roll = kernel::draw_below(state.seed, week, kernel::Stream::event, fnv1a(work->id), 0, 1000);
            if (roll < static_cast<std::uint32_t>(kBaseProbabilityPermille)) random_pool.push_back(Candidate{&spec, work});
        }
    }

    auto& pool = performance.empty() ? random_pool : performance;
    if (pool.empty()) return Json{{"drawn", false}};
    std::sort(pool.begin(), pool.end(), candidate_before);
    const Candidate& chosen = pool.front();

    if (!state.events.is_object()) state.events = Json::object();
    state.events["pending"] = build_instance(*chosen.spec, chosen.work->id, week);
    state.events["last_event_week"] = week;
    if (!state.events.contains("per_work") || !state.events.at("per_work").is_object()) {
        state.events["per_work"] = Json::object();
    }
    return Json{{"drawn", true},
                {"event_id", chosen.spec->id},
                {"work_id", chosen.work->id},
                {"candidates", static_cast<int>(pool.size())}};
}

Resolution inspect(const GameState& state, const std::string& event_id, const std::string& option_id) {
    Resolution result;
    if (!state.events.contains("pending") || state.events.at("pending").is_null()) {
        result.code = "NOT_FOUND";
        result.message = "当前没有待处理事件";
        return result;
    }
    const auto& pending = state.events.at("pending");
    if (!pending.contains("event_id") || pending.at("event_id").get<std::string>() != event_id) {
        result.code = "NOT_FOUND";
        result.message = "事件 id 不匹配";
        return result;
    }
    result.spec = find(event_id);
    if (result.spec == nullptr) {
        result.code = "NOT_FOUND";
        result.message = "事件不在目录中";
        return result;
    }
    for (const auto& option : result.spec->options) {
        if (option.id == option_id) result.option = &option;
    }
    if (result.option == nullptr) {
        result.code = "NOT_FOUND";
        result.message = "选项不存在";
        return result;
    }
    if (result.option->kind == "outsource" || result.option->kind == "extension") {
        result.code = "MODE_NOT_ALLOWED";
        result.message = "供应商外包与延期尚未接入，该选项不可用";
        return result;
    }
    if (result.option->cost > state.finance.balance) {
        result.code = "INSUFFICIENT_FUNDS";
        result.message = "现金不足以支付该选项";
        return result;
    }
    return result;
}

const Project* owner(const GameState& state, const std::string& work_id) {
    for (const auto& work : state.works) {
        if (work.id == work_id) return &work;
    }
    return nullptr;
}

}  // namespace apc::v4::event
