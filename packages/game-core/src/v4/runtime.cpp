#include "apc/v4/runtime.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdint>
#include <initializer_list>
#include <map>
#include <set>
#include <string>
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

// 把蓝图实例化为项目
bool instantiate(const Json& blueprint, const std::string& work_id, int opened_week, int duration_weeks, Project& out,
                 std::string& error) {
    if (!blueprint.is_object()) {
        error = "blueprint 必须是对象";
        return false;
    }
    const int episode_count = blueprint.value("episode_count", 0);
    if (episode_count <= 0) {
        error = "blueprint.episode_count 必须为正";
        return false;
    }
    if (!blueprint.contains("common") || !blueprint.at("common").is_array() || blueprint.at("common").empty()) {
        error = "blueprint.common 必须是非空数组";
        return false;
    }
    if (!blueprint.contains("episode") || !blueprint.at("episode").is_array() || blueprint.at("episode").empty()) {
        error = "blueprint.episode 必须是非空数组";
        return false;
    }

    auto map_dep = [](const std::string& dep, const std::string& episode_prefix) -> std::string {
        const std::string prefix = "common:";
        if (dep.rfind(prefix, 0) == 0) return "common." + dep.substr(prefix.size());
        return episode_prefix + dep;
    };

    out = Project{};
    out.id = work_id;
    out.status = "producing";
    out.mode = "contract";
    out.opened_week = opened_week;
    out.deadline_week = opened_week + std::max(duration_weeks, 1);
    out.common.id = work_id + ".common";
    out.plan = WorkPlan{};

    for (const auto& raw : blueprint.at("common")) {
        WorkItem item;
        item.key = raw.value("key", std::string{});
        if (item.key.empty()) {
            error = "common 项缺少 key";
            return false;
        }
        item.id = "common." + item.key;
        item.ability = raw.value("ability", std::string{});
        item.work_total = raw.value("work_total", 0);
        item.deliver_at = raw.value("deliver_at", 1000);
        for (const auto& dep : raw.value("deps", Json::array())) {
            if (dep.is_string()) item.deps.push_back(map_dep(dep.get<std::string>(), std::string{}));
        }
        out.common.items.push_back(std::move(item));
    }

    for (int index = 1; index <= episode_count; ++index) {
        char buffer[8];
        std::snprintf(buffer, sizeof(buffer), "ep%02d", index);
        const std::string prefix = std::string(buffer) + ".";
        Episode episode;
        episode.id = std::string(buffer);
        episode.index = index;
        for (const auto& stage_key : kStages) {
            EpisodeStage stage;
            stage.key = stage_key;
            episode.stages.push_back(std::move(stage));
        }
        for (const auto& raw : blueprint.at("episode")) {
            const std::string stage_key = raw.value("stage", std::string{});
            const int order = stage_index(stage_key);
            if (order < 0) {
                error = "episode 项引用了未知阶段: " + stage_key;
                return false;
            }
            WorkItem item;
            item.key = raw.value("key", std::string{});
            if (item.key.empty()) {
                error = "episode 项缺少 key";
                return false;
            }
            item.id = prefix + item.key;
            item.ability = raw.value("ability", std::string{});
            item.work_total = raw.value("work_total", 0);
            item.deliver_at = raw.value("deliver_at", 1000);
            item.is_gate = raw.value("is_gate", false);
            for (const auto& dep : raw.value("deps", Json::array())) {
                if (dep.is_string()) item.deps.push_back(map_dep(dep.get<std::string>(), prefix));
            }
            episode.stages[static_cast<std::size_t>(order)].items.push_back(std::move(item));
        }
        out.episodes.push_back(std::move(episode));
    }
    return true;
}

}  // namespace

// ---------------- 校验 ----------------
std::vector<std::string> validate(const GameState& state) {
    std::vector<std::string> errors;
    auto error = [&errors](const std::string& message) { errors.push_back(message); };

    if (state.version != kContractVersion) error("INV-01 version 必须为 4");
    if (state.company.week < 0 || state.company.week > kMaxWeek) error("INV-21 company.week 必须在 0..520");
    if (state.company.status != "running" && state.company.status != "closing" && state.company.status != "ended") {
        error("INV-01 company.status 非法");
    }

    std::set<std::string> staff_ids;
    for (const auto& member : state.staff) {
        if (!staff_ids.insert(member.id).second) error("INV-02 staff.id 重复: " + member.id);
        for (int i = 0; i < kAbilityCount; ++i) {
            const int value = member.abilities[static_cast<std::size_t>(i)];
            if (value < 0 || value > 100) error("INV-01 staff 能力越界: " + member.id);
        }
        if (member.fatigue < 0 || member.fatigue > 100) error("INV-01 staff.fatigue 越界: " + member.id);
        if (member.morale < 0 || member.morale > 100) error("INV-01 staff.morale 越界: " + member.id);
        if (member.last_participation && member.last_participation->week > state.company.week) {
            error("INV-11 last_participation.week 不能晚于当前周: " + member.id);
        }
    }

    std::set<std::string> work_ids;
    for (const auto& work : state.works) {
        if (!work_ids.insert(work.id).second) error("INV-02 work.id 重复: " + work.id);
        if (work.episodes.empty()) error("INV-06 项目没有单集: " + work.id);

        std::set<std::string> item_ids;
        for (const auto& item : work.common.items) {
            if (!item_ids.insert(item.id).second) error("INV-02 工作项 id 重复: " + item.id);
        }
        for (const auto& episode : work.episodes) {
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
                    if (!item_ids.insert(item.id).second) error("INV-02 工作项 id 重复: " + item.id);
                    if (item.work_total <= 0) error("INV-03 work_total 必须为正: " + item.id);
                    if (item.work_done < 0 || item.work_done > item.work_total) error("INV-03 work_done 越界: " + item.id);
                    if (item.deliver_at < 1 || item.deliver_at > 1000) error("INV-03 deliver_at 越界: " + item.id);
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
    }

    // 归属必须指向存在的项目
    for (const auto& member : state.staff) {
        if (member.assignment_work_id && work_ids.find(*member.assignment_work_id) == work_ids.end()) {
            error("INV-09 assignment_work_id 指向不存在的项目: " + member.id);
        }
    }

    // 财务恒等式
    std::int64_t sum = 0;
    for (const auto& entry : state.finance.entries) sum += entry.amount;
    if (state.finance.balance != state.finance.opening_funds + sum) error("INV-16 余额不等于期初加流水合计");
    if (state.finance.balance < 0 && state.finance.solvency.state != "crisis" && state.company.status == "running") {
        error("INV-25 正常经营下余额不能为负");
    }
    return errors;
}

// ---------------- 哈希 ----------------
std::string state_hash(const GameState& state) {
    GameState copy = state;
    std::sort(copy.staff.begin(), copy.staff.end(), [](const Staff& a, const Staff& b) { return a.id < b.id; });
    std::sort(copy.works.begin(), copy.works.end(), [](const Project& a, const Project& b) { return a.id < b.id; });
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
    Json encoded = copy;
    return hex64(fnv1a64(encoded.dump()));
}

// ---------------- 命令 ----------------
std::string initialize(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        const auto seed = request.value("seed", static_cast<std::uint32_t>(0));
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
        state.market = Json::object();
        state.events = Json{{"pending", nullptr}, {"last_event_week", nullptr}, {"per_work", Json::object()}};
        state.archive = Json{{"works", Json::array()}, {"series", Json::array()}, {"company_result", nullptr}};

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
        GameState state = request.at("state").get<GameState>();
        const Json blueprint = request.at("blueprint");
        const std::string work_id = request.value("work_id", std::string("work_01"));
        const int duration_weeks = request.value("duration_weeks", 26);

        if (find_work(state, work_id) != nullptr) {
            return encode(error_body("INVALID_INPUT", "work_id 已存在"));
        }

        Project work;
        std::string error;
        if (!instantiate(blueprint, work_id, state.company.week, duration_weeks, work, error)) {
            return encode(error_body("INVALID_INPUT", error));
        }
        state.works.push_back(std::move(work));

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}, {"work_id", work_id}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string set_plan(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = request.at("state").get<GameState>();
        const std::string work_id = request.at("work_id").get<std::string>();
        const Json plan = request.at("plan");

        Project* work = find_work(state, work_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以改计划"));

        // 枚举必须校验：非法取值一旦落库，排序会静默退回默认行为，玩家看不出原因。
        auto one_of = [](const std::string& value, std::initializer_list<const char*> allowed) {
            for (const char* candidate : allowed) {
                if (value == candidate) return true;
            }
            return false;
        };
        std::string intensity = work->plan.intensity;
        std::string focus = work->plan.focus;
        std::string outsourcing = work->plan.outsourcing;
        bool overtime = work->plan.overtime;
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
            if (!plan.at("overtime").is_boolean()) return encode(error_body("INVALID_INPUT", "overtime 必须是布尔值"));
            overtime = plan.at("overtime").get<bool>();
        }

        // 定向目标：字段缺省时保持原值（改 focus 不应该顺手把目标清掉），显式 null 才清除。
        std::optional<Target> target = work->plan.target;
        if (plan.contains("target")) {
            const auto& raw = plan.at("target");
            if (raw.is_null()) {
                target.reset();
            } else if (raw.is_object()) {
                const std::string kind = raw.value("kind", std::string{});
                const std::string id = raw.value("id", std::string{});
                bool valid = false;
                if (kind == "episode") {
                    valid = std::any_of(work->episodes.begin(), work->episodes.end(),
                                        [&id](const Episode& episode) { return episode.id == id; });
                } else if (kind == "stage") {
                    valid = stage_index(id) >= 0;
                }
                if (!valid) return encode(error_body("INVALID_INPUT", "target 必须指向本项目单集或合法阶段"));
                target = Target{kind, id};
            } else {
                return encode(error_body("INVALID_INPUT", "target 必须是对象或 null"));
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
        GameState state = request.at("state").get<GameState>();
        const std::string staff_id = request.at("staff_id").get<std::string>();

        Staff* member = find_staff(state, staff_id);
        if (member == nullptr) return encode(error_body("NOT_FOUND", "员工不存在"));

        if (request.contains("work_id") && request.at("work_id").is_string()) {
            const std::string work_id = request.at("work_id").get<std::string>();
            const Project* work = find_work(state, work_id);
            if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
            if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以分配人员"));
            member->assignment_work_id = work_id;
        } else {
            member->assignment_work_id.reset();
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

std::string advance_week(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = request.at("state").get<GameState>();

        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (state.company.week >= kMaxWeek) return encode(error_body("INVALID_PHASE", "已达经营上限"));
        if (state.events.contains("pending") && !state.events.at("pending").is_null()) {
            return encode(error_body("INVALID_PHASE", "存在待处理事件"));
        }
        const auto pre_errors = validate(state);
        if (!pre_errors.empty()) return encode(error_body("INVALID_STATE", pre_errors.front()));

        const int week = state.company.week;
        Json works_report = Json::array();
        std::map<std::string, int> produced_by_staff;

        std::vector<Project*> ordered;
        for (auto& work : state.works) ordered.push_back(&work);
        std::sort(ordered.begin(), ordered.end(), [](const Project* a, const Project* b) { return a->id < b->id; });

        for (Project* work : ordered) {
            if (work->status != "producing") continue;

            std::vector<const Staff*> assigned;
            bool supervisor_switch = false;
            for (const auto& member : state.staff) {
                if (!member.assignment_work_id || *member.assignment_work_id != work->id) continue;
                assigned.push_back(&member);
                if (kernel::supervisor_switched(member, work->id)) supervisor_switch = true;
            }
            if (assigned.empty()) continue;

            // 周初快照：磨合判定只看"本周开始前"的进度与参与者
            std::map<std::string, std::pair<int, bool>> before;   // item_id -> (work_done, 占位)
            std::map<std::string, std::set<std::string>> prior_contributors;
            walk_items(*work, [&before, &prior_contributors](const WorkItem& item) {
                before[item.id] = {item.work_done, false};
                prior_contributors[item.id] = std::set<std::string>(item.contributors.begin(), item.contributors.end());
            });

            const int team_permille = kernel::team_capacity_permille(supervisor_switch);
            const auto assignments = kernel::allocate(*work, assigned, team_permille);

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
                const auto result = kernel::apply_production(*item, *member, assignment.points, hands_over, state.seed,
                                                             week, assignment.stage_key);
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
            works_report.push_back(Json{{"work_id", work->id}, {"items", items}, {"total_points", total_points}});
        }

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
            }
            staff_report.push_back(Json{{"staff_id", member.id}, {"produced", produced},
                                        {"fatigue", member.fatigue}, {"morale", member.morale}});
        }

        state.company.week = week + 1;

        const auto post_errors = validate(state);
        if (!post_errors.empty()) return encode(error_body("INTERNAL_ERROR", "结算后状态非法: " + post_errors.front()));

        Json report = Json{{"week", week}, {"works", works_report}, {"staff", staff_report}};
        return encode(Json{{"state", state}, {"report", report}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string hash_state(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        const GameState state = request.at("state").get<GameState>();
        return encode(Json{{"hash", state_hash(state)}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

}  // namespace apc::v4
