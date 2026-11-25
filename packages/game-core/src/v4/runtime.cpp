#include "apc/v4/runtime.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdint>
#include <initializer_list>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "apc/v4/event.hpp"
#include "apc/v4/kernel.hpp"

namespace apc::v4 {
namespace {

using Json = nlohmann::json;

constexpr int kMoraleWorkPenalty = 2;
constexpr int kMoraleRestGain = 1;
constexpr int kFatigueWorkGain = 8;
constexpr int kFatigueRestLoss = 4;
constexpr int kExperienceThreshold = 20;

// 事件效果的应用层写在后半段，先声明供周结算的到期处理调用。
void apply_event_effects(GameState& state, Project& work, const std::vector<EffectView>& effects, int week,
                         const std::string& event_id);
void record_event_resolution(GameState& state, const PendingEvent& due, int week);

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

    // INV-02 要求实体 id 全局唯一：工作项 id 必须带项目前缀，
    // 否则两个项目都会出现 "common.series_comp" / "ep01.script"。
    auto map_dep = [&work_id](const std::string& dep, const std::string& episode_prefix) -> std::string {
        const std::string prefix = "common:";
        if (dep.rfind(prefix, 0) == 0) return work_id + ".common." + dep.substr(prefix.size());
        return work_id + "." + episode_prefix + dep;
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
        item.id = work_id + ".common." + item.key;
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
            item.id = work_id + "." + prefix + item.key;
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

// 必填字段检查：from_json 的默认值会把"缺字段的坏存档"读成"合法但错误的状态"，
// 所以命令入口先确认结构，再交给反序列化。缺失一律 INVALID_INPUT，不落库、不静默修复。
GameState decode_state(const Json& request) {
    if (!request.contains("state") || !request.at("state").is_object()) {
        throw Json::type_error::create(302, "state 必须是对象", nullptr);
    }
    const Json& state = request.at("state");
    const auto require = [](const Json& object, const char* key, const std::string& where) {
        if (!object.is_object() || !object.contains(key)) {
            throw Json::type_error::create(302, "缺少必填字段 " + where + "." + key, nullptr);
        }
    };
    require(state, "company", "state");
    require(state, "staff", "state");
    require(state, "works", "state");
    require(state, "finance", "state");
    require(state, "events", "state");
    require(state.at("events"), "pending", "events");
    if (!state.at("events").at("pending").is_array()) {
        throw Json::type_error::create(302, "events.pending 必须是数组", nullptr);
    }
    require(state.at("company"), "id", "company");
    require(state.at("company"), "week", "company");
    require(state.at("company"), "status", "company");
    require(state.at("finance"), "opening_funds", "finance");
    require(state.at("finance"), "balance", "finance");
    require(state.at("finance"), "entries", "finance");
    if (!state.at("staff").is_array() || !state.at("works").is_array()) {
        throw Json::type_error::create(302, "staff / works 必须是数组", nullptr);
    }
    for (const auto& member : state.at("staff")) {
        require(member, "id", "staff[]");
        require(member, "role", "staff[]");
        require(member, "abilities", "staff[]");
    }
    for (const auto& work : state.at("works")) {
        require(work, "id", "works[]");
        require(work, "status", "works[]");
        require(work, "common", "works[]");
        require(work, "episodes", "works[]");
        require(work.at("common"), "items", "works[].common");
        if (!work.at("common").at("items").is_array() || !work.at("episodes").is_array()) {
            throw Json::type_error::create(302, "items / episodes 必须是数组", nullptr);
        }
        for (const auto& item : work.at("common").at("items")) {
            require(item, "id", "item");
            require(item, "ability", "item");
            require(item, "work_total", "item");
        }
        for (const auto& episode : work.at("episodes")) {
            require(episode, "id", "episode");
            require(episode, "stages", "episode");
            if (!episode.at("stages").is_array()) throw Json::type_error::create(302, "stages 必须是数组", nullptr);
            for (const auto& stage : episode.at("stages")) {
                require(stage, "key", "stage");
                require(stage, "items", "stage");
                if (!stage.at("items").is_array()) throw Json::type_error::create(302, "stage.items 必须是数组", nullptr);
                for (const auto& item : stage.at("items")) {
                    require(item, "id", "item");
                    require(item, "ability", "item");
                    require(item, "work_total", "item");
                }
            }
        }
    }
    return state.get<GameState>();
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
        if (id.empty()) {
            error(std::string("INV-02 ") + kind + " id 不能为空");
            return;
        }
        if (!entity_ids.insert(id).second) error(std::string("INV-02 id 全局重复: ") + id);
    };

    if (state.version != kContractVersion) error("INV-01 version 必须为 4");
    if (state.company.week < 0 || state.company.week > kMaxWeek) error("INV-21 company.week 必须在 0..520");
    if (state.company.status == "running" && state.company.week >= kMaxWeek) {
        error("INV-21 running 状态下 week 必须小于 520");
    }
    if (state.company.status != "running" && state.company.status != "closing" && state.company.status != "ended") {
        error("INV-01 company.status 非法");
    }

    std::set<std::string> staff_ids;
    for (const auto& member : state.staff) {
        claim_id(member.id, "staff");
        if (!staff_ids.insert(member.id).second) error("INV-02 staff.id 重复: " + member.id);
        for (int i = 0; i < kAbilityCount; ++i) {
            const int value = member.abilities[static_cast<std::size_t>(i)];
            if (value < 0 || value > 100) error("INV-01 staff 能力越界: " + member.id);
        }
        if (member.fatigue < 0 || member.fatigue > 100) error("INV-01 staff.fatigue 越界: " + member.id);
        if (member.morale < 0 || member.morale > 100) error("INV-01 staff.morale 越界: " + member.id);
        if (member.last_participation) {
            // INV-11：参与记录严格是"上一周"或 null。跨周保留会让磨合判定
            // 与存档校验各有一套时间语义，所以周结算里没产出就清空。
            if (state.company.week == 0 || member.last_participation->week != state.company.week - 1) {
                error("INV-11 last_participation.week 必须是上一周或 null: " + member.id);
            }
        }
    }

    std::set<std::string> work_ids;
    for (const auto& work : state.works) {
        claim_id(work.id, "work");
        if (!work_ids.insert(work.id).second) error("INV-02 work.id 重复: " + work.id);
        if (work.episodes.empty()) error("INV-06 项目没有单集: " + work.id);
        if (!work.common.id.empty()) claim_id(work.common.id, "common");

        // INV-03：公共制作与单集工作项走同一套校验，不能只查单集。
        std::set<std::string> item_ids;
        const auto check_item = [&](const WorkItem& item) {
            claim_id(item.id, "item");
            if (!item_ids.insert(item.id).second) error("INV-02 工作项 id 重复: " + item.id);
            if (ability_index(item.ability) < 0) error("INV-01 工作项 ability 非法: " + item.id);
            if (item.work_total <= 0) error("INV-03 work_total 必须为正: " + item.id);
            if (item.work_done < 0 || item.work_done > item.work_total) error("INV-03 work_done 越界: " + item.id);
            if (item.deliver_at < 1 || item.deliver_at > 1000) error("INV-03 deliver_at 越界: " + item.id);
            // INV-12：无重复、引用有效、未开工项不得有参与者（"只增不删"需要历史，单状态无法判定）
            std::set<std::string> contributors;
            for (const auto& id : item.contributors) {
                if (!contributors.insert(id).second) error("INV-12 contributors 重复: " + item.id + "/" + id);
                if (staff_ids.find(id) == staff_ids.end()) error("INV-12 contributors 引用不存在员工: " + item.id + "/" + id);
            }
            if (item.work_done == 0 && !item.contributors.empty()) {
                error("INV-12 未开工工作项不能有参与者: " + item.id);
            }
        };
        for (const auto& item : work.common.items) check_item(item);

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

    // INV-09：归属必须指向存在且仍在 producing 的项目
    for (const auto& member : state.staff) {
        if (!member.assignment_work_id) continue;
        const Project* assigned = find_work(state, *member.assignment_work_id);
        if (assigned == nullptr) {
            error("INV-09 assignment_work_id 指向不存在的项目: " + member.id);
        } else if (assigned->status != "producing") {
            error("INV-09 assignment_work_id 必须指向 producing 项目: " + member.id);
        }
    }

    // INV-23：待处理事件按项目保留；同一项目最多一条；事件必须归属有效项目。
    if (state.events.last_event_week && (*state.events.last_event_week < 0 ||
                                         *state.events.last_event_week > state.company.week)) {
        error("INV-23 last_event_week 越界");
    }
    std::set<std::string> pending_works;
    for (const auto& event : state.events.pending) {
        if (event.event_id.empty()) error("INV-23 待处理事件缺少 event_id");
        if (event.work_id.empty()) error("INV-23 待处理事件缺少 work_id");
        if (!pending_works.insert(event.work_id).second) {
            error("INV-23 同一项目存在多条待处理事件: " + event.work_id);
        }
        const Project* owner = find_work(state, event.work_id);
        if (owner == nullptr) error("INV-23 事件归属项目不存在: " + event.work_id);
        else if (owner->status != "producing") error("INV-23 事件归属项目不在 producing: " + event.work_id);
        if (event.triggered_week < 0 || event.triggered_week > state.company.week) {
            error("INV-23 triggered_week 越界: " + event.event_id);
        }
        if (event.expires_week) {
            if (*event.expires_week < event.triggered_week) {
                error("INV-23 expires_week 早于触发周: " + event.event_id);
            }
            // INV-29：限时事件必须带可执行的预设分支，到期行为不能是未定义的。
            const int window = *event.expires_week - event.triggered_week + 1;
            if (window < 1 || window > event::kMaxExpiresWeeks) {
                error("INV-29 有效期周数越界: " + event.event_id);
            }
            const bool branch_found = std::any_of(event.options.begin(), event.options.end(),
                                                  [&event](const EventOptionView& option) {
                                                      return option.id == event.timeout_option;
                                                  });
            if (event.timeout_option.empty() || !branch_found) {
                error("INV-29 限时事件缺少可用的到期分支: " + event.event_id);
            }
            if (event.escalated && !event.escalate_on_timeout) {
                error("INV-29 未配置升级的事件不得标记为已升级: " + event.event_id);
            }
            if (event.escalate_on_timeout &&
                (event.escalated_expires_weeks < 1 || event.escalated_expires_weeks > event::kMaxExpiresWeeks)) {
                error("INV-29 升级后的响应期限越界: " + event.event_id);
            }
        } else if (event.escalated || event.escalate_on_timeout || !event.timeout_option.empty()) {
            error("INV-29 无期限事件不得配置到期/升级状态: " + event.event_id);
        }
        if (event.options.empty()) error("INV-23 待处理事件缺少选项快照: " + event.event_id);
    }
    for (const auto& [work_id, entry] : state.events.per_work) {
        std::set<std::string> seen;
        for (const auto& id : entry.major_seen) {
            if (!seen.insert(id).second) error("INV-23 major_seen 重复: " + work_id + "/" + id);
        }
    }

    // 财务恒等式
    std::int64_t sum = 0;
    for (const auto& entry : state.finance.entries) {
        claim_id(entry.id, "ledger");
        if (entry.week < 0 || entry.week > kMaxWeek) error("INV-01 流水周数越界: " + entry.id);
        sum += entry.amount;
    }
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
    // 事件集合语义：pending 按 (work_id,event_id) 排序，major_seen 去顺序影响。
    std::sort(copy.events.pending.begin(), copy.events.pending.end(),
              [](const PendingEvent& a, const PendingEvent& b) {
                  if (a.work_id != b.work_id) return a.work_id < b.work_id;
                  return a.event_id < b.event_id;
              });
    for (auto& [work_id, entry] : copy.events.per_work) {
        std::sort(entry.major_seen.begin(), entry.major_seen.end());
    }
    std::sort(copy.finance.entries.begin(), copy.finance.entries.end(),
              [](const LedgerEntry& a, const LedgerEntry& b) {
                  if (a.week != b.week) return a.week < b.week;
                  return a.id < b.id;
              });
    Json encoded = copy;
    return hex64(fnv1a64(encoded.dump()));
}

// ---------------- 命令 ----------------
std::string initialize(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        const auto seed = request.value("seed", static_cast<std::uint32_t>(0));
        const std::string name = request.value("company_name", std::string("新动画工作室"));

        // 事件卡是内容，不是代码：目录校验失败时拒绝开局，避免运行时静默少事件。
        const auto& cards = event::catalog();
        if (!cards.ok()) {
            const std::string detail = cards.issues.empty()
                ? std::string("没有可用卡片")
                : cards.issues.front().card_id + "." + cards.issues.front().field + ": " + cards.issues.front().message;
            return encode(error_body("INVALID_STATE", "事件内容目录无效: " + detail));
        }

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
        state.events = EventState{};
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
        GameState state = decode_state(request);
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
        GameState state = decode_state(request);
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
        GameState state = decode_state(request);
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

std::string advance_week(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);

        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (state.company.week >= kMaxWeek) return encode(error_body("INVALID_PHASE", "已达经营上限"));
        // DEC-EVENT-001：只有未查看的待处理事件阻塞推进；已查看未处理仍可推进并继续计时。
        const int unviewed = event::unviewed_count(state);
        if (unviewed > 0) {
            return encode(error_body("INVALID_PHASE",
                                     "存在 " + std::to_string(unviewed) + " 条未查看的待处理事件"));
        }
        const auto pre_errors = validate(state);
        if (!pre_errors.empty()) return encode(error_body("INVALID_STATE", pre_errors.front()));

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

        // ---- 阶段 2：刚性支出预检（M1 最小切片：工资 + 运营 + 制作费）----
        // 预检失败一律整周不提交：不推进、不记账、不生产。危机路径是 M2.5，
        // 此处只保证"钱不够时周不会假装过完"。
        std::map<std::string, int> assigned_count;
        for (const Staff* member : ordered_staff) {
            if (member->assignment_work_id) ++assigned_count[*member->assignment_work_id];
        }
        int64_t salary_total = 0;
        for (const Staff* member : ordered_staff) {
            if (member->employment == "core") salary_total += member->weekly_salary;
        }
        const int64_t operations_total = kernel::weekly_operations_cost();
        int64_t production_total = 0;
        for (const Project* work : ordered) {
            if (work->status != "producing") continue;
            if (assigned_count[work->id] == 0) continue;   // 没人做就不开工，也不计制作费
            production_total += kernel::weekly_production_cost(work->plan.intensity);
        }
        const int64_t total_cost = salary_total + operations_total + production_total;
        if (state.finance.balance < total_cost) {
            const int64_t gap = total_cost - state.finance.balance;
            return encode(Json{{"error",
                                {{"code", "INSUFFICIENT_FUNDS"},
                                 {"message", "本周强制费用不足，缺口 " + std::to_string(gap) + " 日元"},
                                 {"gap", gap}}}});
        }

        // ---- 阶段 3：刚性支出扣款（唯一账本，逐条可归因）----
        auto spend = [&state, week](const std::string& entry_id, std::optional<std::string> work_id,
                                    const char* category, int64_t amount, const std::string& memo) {
            if (amount <= 0) return;
            state.finance.entries.push_back(
                LedgerEntry{entry_id, week, std::move(work_id), category, -amount, std::nullopt, memo});
            state.finance.balance -= amount;
        };
        for (const Staff* member : ordered_staff) {
            if (member->employment != "core") continue;
            spend("w" + std::to_string(week) + ".salary." + member->id, std::nullopt, "salary",
                  member->weekly_salary, member->id);
        }
        spend("w" + std::to_string(week) + ".operations", std::nullopt, "operations", operations_total, "公司运营");
        for (const Project* work : ordered) {
            if (work->status != "producing" || assigned_count[work->id] == 0) continue;
            const int64_t cost = kernel::weekly_production_cost(work->plan.intensity);
            spend("w" + std::to_string(week) + ".production." + work->id, work->id, "production", cost,
                  work->plan.intensity);
        }

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

        // ---- 阶段 7：限时事件到期处理（DEC-TIME-003 / DEC-EVENT-002）----
        // 已查看仍未处理的限时事件到期时，先于事件抽取自动执行预设分支：
        // 逐条按事件身份处理，不覆盖、不清除其他项目的 pending，也不需要玩家确认。
        Json timeout_report = Json::array();
        for (const auto& action : event::expire_deadlines(state, week)) {
            std::size_t index = state.events.pending.size();
            for (std::size_t i = 0; i < state.events.pending.size(); ++i) {
                const auto& pending = state.events.pending[i];
                if (pending.work_id == action.work_id && pending.event_id == action.event_id) {
                    index = i;
                    break;
                }
            }
            if (index >= state.events.pending.size()) continue;
            const PendingEvent due = state.events.pending[index];
            Project* work = find_work(state, due.work_id);
            if (work == nullptr) continue;
            const EventOptionView* branch = nullptr;
            for (const auto& option : due.options) {
                if (option.id == action.option_id) branch = &option;
            }
            if (branch == nullptr) continue;
            // 到期分支的现金支出不得超过现有现金：自动处理不能绕过破产判定。
            const std::int64_t paid = std::min<std::int64_t>(branch->cost, state.finance.balance);
            if (paid > 0) {
                state.finance.entries.push_back(LedgerEntry{
                    "w" + std::to_string(week) + ".event." + due.event_id + "." + due.work_id, week, due.work_id,
                    "events", -paid, std::nullopt, due.event_id});
                state.finance.balance -= paid;
            }
            apply_event_effects(state, *work, branch->effects, week, due.event_id);
            record_event_resolution(state, due, week);
            state.events.pending.erase(state.events.pending.begin() + static_cast<std::ptrdiff_t>(index));
            timeout_report.push_back(Json{{"work_id", due.work_id},
                                          {"event_id", due.event_id},
                                          {"name", due.name},
                                          {"option_id", branch->id},
                                          {"reason", due.escalated ? "breach" : "timeout"},
                                          {"cost", paid}});
        }

        // ---- 阶段 8：事件抽取（读本周已提交的结果，不碰账）----
        // 每个 producing 项目各自至多一条；已有待处理事件的项目不再追加。
        const Json events_report = event::draw(state, week);

        state.company.week = week + 1;

        const auto post_errors = validate(state);
        if (!post_errors.empty()) return encode(error_body("INTERNAL_ERROR", "结算后状态非法: " + post_errors.front()));

        Json report = Json{{"week", week},
                           {"works", works_report},
                           {"staff", staff_report},
                           {"timeouts", timeout_report},
                           {"events", events_report},
                           {"funds", Json{{"delta", -total_cost},
                                          {"balance", state.finance.balance},
                                          {"costs", Json{{"salary", salary_total},
                                                         {"operations", operations_total},
                                                         {"production", production_total}}}}}};
        return encode(Json{{"state", state}, {"report", report}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
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

namespace {

// 事件效果的应用层：Event 只给出意图，Project/Staff/Finance 的写入在这里完成。
void adjust_quality(Project& work, const std::string& stage_key, int delta) {
    auto adjust_item = [delta](WorkItem& item) {
        for (auto& value : item.quality.dims) value = std::clamp(value + delta, 0, 100);
    };
    if (stage_key.empty()) {
        for (auto& item : work.common.items) adjust_item(item);
    }
    for (auto& episode : work.episodes) {
        for (auto& stage : episode.stages) {
            if (!stage_key.empty() && stage.key != stage_key) continue;
            for (auto& item : stage.items) adjust_item(item);
        }
    }
}

int apply_points(Project& work, const std::string& stage_key, int points) {
    if (points <= 0) return 0;
    std::vector<WorkItem*> items;
    for (auto& episode : work.episodes) {
        for (auto& stage : episode.stages) {
            if (!stage_key.empty() && stage.key != stage_key) continue;
            for (auto& item : stage.items) {
                if (item.is_gate || item.work_done >= item.work_total) continue;
                items.push_back(&item);
            }
        }
    }
    std::sort(items.begin(), items.end(), [](const WorkItem* a, const WorkItem* b) { return a->id < b->id; });
    int left = points;
    int applied = 0;
    for (WorkItem* item : items) {
        if (left <= 0) break;
        const int take = std::min(left, item->work_total - item->work_done);
        item->work_done += take;
        left -= take;
        applied += take;
    }
    return applied;
}

void apply_event_effects(GameState& state, Project& work, const std::vector<EffectView>& effects, int week,
                         const std::string& event_id) {
    std::vector<Staff*> targets;
    for (auto& member : state.staff) {
        if (member.assignment_work_id && *member.assignment_work_id == work.id) targets.push_back(&member);
    }
    if (targets.empty()) {
        for (auto& member : state.staff) {
            if (member.employment == "core") targets.push_back(&member);
        }
    }
    for (std::size_t index = 0; index < effects.size(); ++index) {
        const auto& effect = effects[index];
        if (effect.target == "quality") {
            adjust_quality(work, effect.scope == "stage" ? effect.stage : std::string{}, effect.value);
            continue;
        }
        if (effect.target == "work_done") {
            apply_points(work, effect.scope == "stage" ? effect.stage : std::string{}, effect.value);
            continue;
        }
        if (effect.target == "fatigue") {
            for (Staff* member : targets) member->fatigue = std::clamp(member->fatigue + effect.value, 0, 100);
            continue;
        }
        if (effect.target == "morale") {
            for (Staff* member : targets) member->morale = std::clamp(member->morale + effect.value, 0, 100);
            continue;
        }
        if (effect.target == "funds" && effect.value < 0) {
            // 强制支出不得超过现有现金：事件不能绕过破产判定。
            const std::int64_t funds = state.finance.balance;
            const std::int64_t amount = std::min<std::int64_t>(funds, -effect.value);
            if (amount > 0) {
                // 带序号的条目 id：同一选项同时有 cost 与 funds 效果时不能撞 INV-02。
                state.finance.entries.push_back(LedgerEntry{
                    "w" + std::to_string(week) + ".event." + event_id + "." + work.id + ".e" + std::to_string(index),
                    week, work.id, "events", -amount, std::nullopt, event_id});
                state.finance.balance -= amount;
            }
        }
    }
}

// 冷却与重大事件登记：玩家手动处理与超时自动处理共用同一套记账，避免两条路径分叉。
void record_event_resolution(GameState& state, const PendingEvent& due, int week) {
    auto& entry = state.events.per_work[due.work_id];
    if (due.cooldown_weeks > 0) {
        entry.cooldowns[due.event_id] = week + due.cooldown_weeks;
    }
    if (due.once_per_project &&
        std::find(entry.major_seen.begin(), entry.major_seen.end(), due.event_id) == entry.major_seen.end()) {
        entry.major_seen.push_back(due.event_id);
    }
}

}  // namespace

std::string resolve_event(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        // M0 命令 19（PR #94 冻结）：work_id / event_id / option_id 全部必填。
        if (!request.contains("work_id") || !request.at("work_id").is_string() ||
            !request.contains("event_id") || !request.at("event_id").is_string() ||
            !request.contains("option_id") || !request.at("option_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id、event_id 与 option_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        const std::string event_id = request.at("event_id").get<std::string>();
        const std::string option_id = request.at("option_id").get<std::string>();
        if (work_id.empty()) return encode(error_body("INVALID_INPUT", "work_id 不能为空"));

        const auto pre_errors = validate(state);
        if (!pre_errors.empty()) return encode(error_body("INVALID_STATE", pre_errors.front()));

        // 只读 pending 里的冻结快照，不回查可能已变化的内容目录。
        const auto resolution = event::inspect(state, work_id, event_id, option_id);
        if (resolution.pending == nullptr || resolution.option == nullptr) {
            return encode(error_body(resolution.code.c_str(), resolution.message));
        }

        std::size_t index = state.events.pending.size();
        for (std::size_t i = 0; i < state.events.pending.size(); ++i) {
            const auto& pending = state.events.pending[i];
            if (pending.event_id == event_id && pending.work_id == work_id) {
                index = i;
                break;
            }
        }
        if (index >= state.events.pending.size()) return encode(error_body("NOT_FOUND", "待处理事件不存在"));
        const std::string owner_id = state.events.pending[index].work_id;
        Project* work = find_work(state, owner_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "事件归属项目不存在"));

        const int week = state.company.week;
        if (resolution.option->cost > 0) {
            state.finance.entries.push_back(LedgerEntry{
                "w" + std::to_string(week) + ".event." + event_id + "." + owner_id, week, owner_id, "events",
                -resolution.option->cost, std::nullopt, event_id});
            state.finance.balance -= resolution.option->cost;
        }
        apply_event_effects(state, *work, resolution.option->effects, week, event_id);
        record_event_resolution(state, *resolution.pending, week);
        const std::string message = resolution.pending->name.empty() ? event_id : resolution.pending->name;
        state.events.pending.erase(state.events.pending.begin() + static_cast<std::ptrdiff_t>(index));

        const auto post_errors = validate(state);
        if (!post_errors.empty()) return encode(error_body("INTERNAL_ERROR", "处理后状态非法: " + post_errors.front()));
        return encode(Json{{"state", state}, {"message", "已处理「" + message + "」"}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// DEC-EVENT-001：查看与处理是两个独立动作。查看只把目标事件标记为已查看，
// 不应用选项、不扣款、不移除 pending，也不改动其他项目的任何事件。
std::string view_event(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("work_id") || !request.at("work_id").is_string() ||
            !request.contains("event_id") || !request.at("event_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 与 event_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        const std::string event_id = request.at("event_id").get<std::string>();
        if (work_id.empty() || event_id.empty()) {
            return encode(error_body("INVALID_INPUT", "work_id 与 event_id 不能为空"));
        }

        const auto pre_errors = validate(state);
        if (!pre_errors.empty()) return encode(error_body("INVALID_STATE", pre_errors.front()));

        const std::size_t before = state.events.pending.size();
        if (!event::mark_viewed(state, work_id, event_id)) {
            return encode(error_body("NOT_FOUND", "该项目没有该待处理事件"));
        }
        // 查看是纯状态标记：事件条数不变，其他事件一条都不动。
        if (state.events.pending.size() != before) {
            return encode(error_body("INTERNAL_ERROR", "查看事件改变了待处理数量"));
        }
        const auto post_errors = validate(state);
        if (!post_errors.empty()) return encode(error_body("INTERNAL_ERROR", "查看后状态非法: " + post_errors.front()));

        for (const auto& pending : state.events.pending) {
            if (pending.work_id != work_id || pending.event_id != event_id) continue;
            return encode(Json{{"state", state},
                               {"viewed", true},
                               {"expires_week", pending.expires_week ? Json(*pending.expires_week) : Json(nullptr)},
                               {"message", "已查看「" + (pending.name.empty() ? event_id : pending.name) + "」"}});
        }
        return encode(Json{{"state", state}, {"viewed", true}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string event_catalog_info(const std::string&) {
    return encode(event::builtin_catalog_report());
}

std::string validate_event_catalog(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        const std::string source = request.value("source", std::string("inline"));
        if (!request.contains("catalog")) return encode(error_body("INVALID_INPUT", "缺少 catalog"));
        return encode(event::catalog_report(request.at("catalog").dump(), source));
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

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
