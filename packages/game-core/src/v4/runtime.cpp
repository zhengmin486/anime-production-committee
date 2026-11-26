#include "apc/v4/runtime.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdint>
#include <initializer_list>
#include <map>
#include <set>
#include <string>
#include <vector>

#include "apc/v4/blueprint.hpp"
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
constexpr int kQualityFactorMax = 1040;  // v0.5：质量均值 105 → 1040‰

// DEC-COMM-001/002、DEC-BD-001：六个常规商业窗口。
// BD/DVD 公司所得固定为毛收入 50%；其余窗口按委员会成员渠道或外部代理开放。
constexpr const char* kWindowBd = "bd_dvd";
constexpr const char* kCommercialWindows[6] = {"domestic_streaming", "overseas", "merchandise", "music", "tv", "bd_dvd"};
constexpr int kAgencyFeeNormalPermille = 450;
constexpr int kAgencyFeeHighPermille = 400;
constexpr int kAgencyFeeCorePermille = 350;
constexpr std::int64_t kTvServiceFeeTotal = 600000;
// [PLACEHOLDER] 原创草稿基础声望门槛与按 scale 推导的预算/工期。
constexpr int kDraftMinReputation = 120;
std::int64_t draft_budget(const std::string& scale) {
    if (scale == "ova") return 600000;
    if (scale == "short") return 900000;
    if (scale == "movie") return 3000000;
    return 1200000;   // tv（默认）
}
int draft_weeks(const std::string& scale) {
    if (scale == "ova") return 12;
    if (scale == "short") return 20;
    if (scale == "movie") return 32;
    return 26;        // tv（默认）
}
// 电视台委员会成员默认强力播出 125%；外部代理普通播出 115%；购买黄金档 130%。
constexpr int kTvMultiplierMember = 1250;
constexpr int kTvMultiplierAgency = 1150;
constexpr int kTvMultiplierPurchased = 1300;

bool tv_boost_window(const std::string& window) {
    return window == "domestic_streaming" || window == "merchandise" || window == "music" || window == kWindowBd;
}

Json error_body(const char* code, const std::string& message) { return Json{{"error", {{"code", code}, {"message", message}}}}; }

std::string encode(const Json& value) { return value.dump(); }

int clamp_int(int value, int low, int high) { return std::max(low, std::min(high, value)); }

bool one_of_text(const std::string& value, std::initializer_list<const char*> allowed) {
    for (const char* candidate : allowed) {
        if (value == candidate) return true;
    }
    return false;
}

// 前向声明：validate() 在辅助函数定义之前使用。
const Json* find_partner(const GameState& state, const std::string& partner_id);

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
    for (const auto& event : state.at("events").at("pending")) {
        require(event, "work_id", "events.pending[]");
        require(event, "event_id", "events.pending[]");
        require(event, "triggered_week", "events.pending[]");
        require(event, "expires_week", "events.pending[]");
        require(event, "viewed", "events.pending[]");
        if (!event.at("triggered_week").is_number_integer() ||
            (!event.at("expires_week").is_null() && !event.at("expires_week").is_number_integer())) {
            throw Json::type_error::create(302, "events.pending[] 触发周或到期周类型无效", nullptr);
        }
        if (!event.at("viewed").is_boolean()) {
            throw Json::type_error::create(302, "events.pending[].viewed 必须是布尔值", nullptr);
        }
    }
    require(state.at("company"), "id", "company");
    require(state.at("company"), "week", "company");
    require(state.at("company"), "status", "company");
    require(state.at("finance"), "opening_funds", "finance");
    require(state.at("finance"), "balance", "finance");
    require(state.at("finance"), "entries", "finance");
    require(state.at("finance"), "loans", "finance");
    // solvency 决定命令守卫与终局判定；缺字段被 from_json 读成默认值会静默改写经营状态。
    require(state.at("finance"), "solvency", "finance");
    require(state.at("finance").at("solvency"), "state", "finance.solvency");
    require(state.at("finance").at("solvency"), "since_week", "finance.solvency");
    require(state.at("finance").at("solvency"), "deadline_week", "finance.solvency");
    require(state.at("finance").at("solvency"), "gap", "finance.solvency");
    if (!state.at("staff").is_array() || !state.at("works").is_array()) {
        throw Json::type_error::create(302, "staff / works 必须是数组", nullptr);
    }
    for (const auto& member : state.at("staff")) {
        require(member, "id", "staff[]");
        require(member, "name", "staff[]");
        require(member, "role", "staff[]");
        require(member, "employment", "staff[]");
        require(member, "abilities", "staff[]");
        require(member, "experience", "staff[]");
        require(member, "potential", "staff[]");
        require(member, "revealed_potential", "staff[]");
        require(member, "talent_type", "staff[]");
        require(member, "signing_fee", "staff[]");
        require(member, "weekly_salary", "staff[]");
        // fatigue / morale 会直接影响周结算产能；不能让反序列化默认值掩盖坏存档。
        require(member, "fatigue", "staff[]");
        require(member, "morale", "staff[]");
        require(member, "departure_warning", "staff[]");
        require(member, "assignment_work_id", "staff[]");
    }
    const auto require_item = [&require](const Json& item) {
        for (const char* key : {"id", "key", "ability", "work_total", "work_done", "deliver_at", "deps",
                                "is_gate", "quality", "contributors"}) {
            require(item, key, "item");
        }
        for (const char* key : {"id", "key", "ability"}) {
            if (!item.at(key).is_string()) throw Json::type_error::create(302, "item." + std::string(key) + " 必须是字符串", nullptr);
        }
        for (const char* key : {"work_total", "work_done", "deliver_at"}) {
            if (!item.at(key).is_number_integer()) throw Json::type_error::create(302, "item." + std::string(key) + " 必须是整数", nullptr);
        }
        if (!item.at("is_gate").is_boolean() || !item.at("quality").is_object() ||
            !item.at("deps").is_array() || !item.at("contributors").is_array()) {
            throw Json::type_error::create(302, "item 门槛、质量、依赖或贡献者类型无效", nullptr);
        }
        for (const char* key : {"deps", "contributors"}) {
            for (const auto& entry : item.at(key)) {
                if (!entry.is_string()) throw Json::type_error::create(302, "item." + std::string(key) + " 必须包含字符串", nullptr);
            }
        }
        for (int i = 0; i < kDimensionCount; ++i) {
            require(item.at("quality"), kDimensions[static_cast<std::size_t>(i)], "item.quality");
            if (!item.at("quality").at(kDimensions[static_cast<std::size_t>(i)]).is_number_integer()) {
                throw Json::type_error::create(302, "item.quality 维度必须是整数", nullptr);
            }
        }
    };
    for (const auto& work : state.at("works")) {
        require(work, "id", "works[]");
        require(work, "status", "works[]");
        // INV-27 的载体：缺键会被 from_json 读成 null，等于凭空制造监督空缺，必须显式出现。
        require(work, "supervisor_staff_id", "works[]");
        if (!work.at("supervisor_staff_id").is_null() && !work.at("supervisor_staff_id").is_string()) {
            throw Json::type_error::create(302, "works[].supervisor_staff_id 必须是字符串或 null", nullptr);
        }
        require(work, "common", "works[]");
        require(work, "episodes", "works[]");
        require(work.at("common"), "items", "works[].common");
        if (!work.at("common").at("items").is_array() || !work.at("episodes").is_array()) {
            throw Json::type_error::create(302, "items / episodes 必须是数组", nullptr);
        }
        for (const auto& item : work.at("common").at("items")) require_item(item);
        for (const auto& episode : work.at("episodes")) {
            require(episode, "id", "episode");
            require(episode, "stages", "episode");
            if (!episode.at("stages").is_array()) throw Json::type_error::create(302, "stages 必须是数组", nullptr);
            for (const auto& stage : episode.at("stages")) {
                require(stage, "key", "stage");
                require(stage, "items", "stage");
                if (!stage.at("items").is_array()) throw Json::type_error::create(302, "stage.items 必须是数组", nullptr);
                for (const auto& item : stage.at("items")) require_item(item);
            }
        }
    }
    return state.get<GameState>();
}

// INV-27：监督是项目内岗位，不是员工身份。资格判定只用 kernel 里已有的
// "基础职业即监督者"集合；DEC-STAFF-006 的演出/作画/脚本转任阈值属 DISC-11
// 待标定参数，本文件不替它猜数值，已在 docs/M2_M4_PROJECT_LOOP.md 登记 PENDING。
bool supervisor_qualified(const Staff& member) { return kernel::is_supervisor(member.role); }

int ability_total(const Staff& member) {
    int sum = 0;
    for (const int value : member.abilities) sum += value;
    return sum;
}

bool supervises_another_project(const GameState& state, const std::string& staff_id, const std::string& work_id) {
    for (const auto& other : state.works) {
        if (other.id == work_id || other.status != "producing") continue;
        if (other.supervisor_staff_id && *other.supervisor_staff_id == staff_id) return true;
    }
    return false;
}

// §14.8 替补池：只取"同项目员工"与"公司空闲员工"，禁止从其他项目强行抽调。
// 同项目优先，其次空闲；并列按能力总分降序、员工 id 升序（确定性）。
// 已在别处挂监督岗的合格员工排在最后；合法状态中其归属属于其他项目，不会进入候选。
bool supervisor_candidate_eligible(const Staff& member, const std::string& work_id) {
    if (!supervisor_qualified(member)) return false;
    if (member.assignment_work_id && *member.assignment_work_id != work_id) return false;
    return true;
}

int supervisor_candidate_rank(const GameState& state, const Staff& member, const std::string& work_id) {
    int rank = (member.assignment_work_id && *member.assignment_work_id == work_id) ? 0 : 1;
    if (supervises_another_project(state, member.id, work_id)) rank += 2;
    return rank;
}

const Staff* pick_supervisor(const GameState& state, const std::string& work_id, const std::string& exclude_id) {
    const Staff* best = nullptr;
    int best_rank = 0;
    int best_score = 0;
    for (const auto& member : state.staff) {
        if (member.id == exclude_id || !supervisor_candidate_eligible(member, work_id)) continue;
        const int rank = supervisor_candidate_rank(state, member, work_id);
        const int score = ability_total(member);
        if (best == nullptr || rank < best_rank ||
            (rank == best_rank && (score > best_score || (score == best_score && member.id < best->id)))) {
            best = &member;
            best_rank = rank;
            best_score = score;
        }
    }
    return best;
}

// 开工即定岗：start_work 产出的在制项目必须已带合格监督，否则整条命令回滚。
bool designate_supervisor(GameState& state, Project& work) {
    const Staff* pick = pick_supervisor(state, work.id, "");
    if (pick == nullptr) return false;
    Staff* holder = find_staff(state, pick->id);
    if (holder == nullptr) return false;
    work.supervisor_staff_id = holder->id;
    holder->assignment_work_id = work.id;
    return true;
}

// 调离监督时的原子 Swap/Replace（§14.8）：当场找到替补才放行，否则关键岗位锁定。
// 只在员工确实被指派在本项目上时才触发——挂岗但未被指派属兼任，不构成从本项目调离。
bool replace_supervisor_post(GameState& state, const std::string& work_id, const std::string& leaving_staff_id) {
    for (auto& work : state.works) {
        if (work.id != work_id || work.status != "producing") continue;
        if (!work.supervisor_staff_id || *work.supervisor_staff_id != leaving_staff_id) continue;
        const Staff* leaving = nullptr;
        for (const auto& member : state.staff) {
            if (member.id == leaving_staff_id) leaving = &member;
        }
        if (leaving == nullptr || !leaving->assignment_work_id || *leaving->assignment_work_id != work.id) continue;
        const Staff* pick = pick_supervisor(state, work.id, leaving_staff_id);
        if (pick == nullptr) return false;
        work.supervisor_staff_id = pick->id;
        Staff* replacement = find_staff(state, pick->id);
        if (replacement == nullptr) return false;
        replacement->assignment_work_id = work.id;
    }
    return true;
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
        if (member.signing_fee < 0) error("INV-01 staff.signing_fee 不能为负: " + member.id);
        if (member.weekly_salary <= 0) error("INV-01 staff.weekly_salary 必须为正: " + member.id);
        if (member.employment != "core" && member.employment != "temporary") {
            error("INV-01 staff.employment 非法: " + member.id);
        }
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
        if (!one_of_text(work.status, {"planning", "producing", "delivering", "settled"})) {
            error("INV-01 project.status 非法: " + work.id);
        }
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

        // 合作模式与投资一致性（M0 §7.4）
        if (work.mode != "contract" && work.mode != "committee") error("INV-01 project.mode 非法: " + work.id);
        if (work.deadline_week <= work.opened_week) error("INV-01 deadline_week 必须晚于 opened_week: " + work.id);
        // 内部 instantiate_work 夹具没有 offer/channels；真实立项（start_work）必须有渠道。
        if (!work.offer.is_null() && work.channels.empty()) error("INV-01 project.channels 不能为空: " + work.id);
        const int percent = work.investment.value("percent", 0);
        if (work.mode == "contract") {
            if (work.committee_id) error("INV-01 承制项目不能有 committee_id: " + work.id);
            if (percent != 0 || work.investment.value("paid", static_cast<std::int64_t>(0)) != 0) {
                error("INV-01 承制项目投资必须为 0: " + work.id);
            }
        } else {
            if (!work.committee_id) error("INV-01 委员会项目必须有 committee_id: " + work.id);
            if (percent < 10 || percent > 100 || percent % 10 != 0) {
                error("INV-01 委员会投资比例必须是 10..100 的十位整数: " + work.id);
            }
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

    // INV-27：每个 producing 项目恰有一名通过任职资格校验的监督（§14.8 / DEC-STAFF-008）。
    // 只检查字段存在不构成不变量，这里逐条查空缺、悬空引用、资格与岗位/归属错配。
    std::set<std::string> supervisor_ids;
    for (const auto& work : state.works) {
        if (work.status != "producing") continue;
        if (!work.supervisor_staff_id || work.supervisor_staff_id->empty()) {
            error("INV-27 在制项目缺少监督岗位指派: " + work.id);
            continue;
        }
        const std::string& supervisor_id = *work.supervisor_staff_id;
        if (!supervisor_ids.insert(supervisor_id).second) {
            error("INV-27 同一员工重复担任监督: " + work.id + "/" + supervisor_id);
            continue;
        }
        const Staff* holder = nullptr;
        for (const auto& member : state.staff) {
            if (member.id == supervisor_id) {
                holder = &member;
                break;
            }
        }
        if (holder == nullptr) {
            error("INV-27 监督指向不存在的员工: " + work.id + "/" + supervisor_id);
            continue;
        }
        if (!supervisor_qualified(*holder)) {
            error("INV-27 监督任职资格不通过: " + work.id + "/" + supervisor_id);
            continue;
        }
        // INV-27：监督岗位与普通归属是同一份单项目分配；只挂名不分配不满足契约。
        if (!holder->assignment_work_id || *holder->assignment_work_id != work.id) {
            error("INV-27 监督未分配到该项目: " + work.id + "/" + supervisor_id);
        }
    }

    // 伙伴：渠道唯一、关系值范围、状态合法
    for (const auto& partner : state.partners) {
        if (!partner.is_object()) { error("INV-01 partner 必须是对象"); continue; }
        const std::string id = partner.value("id", std::string{});
        claim_id(id, "partner");
        if (partner.value("name", std::string{}).empty()) error("INV-01 partner.name 缺失: " + id);
        if (!one_of_text(partner.value("type", std::string{}), {"tv", "publisher", "toy", "music", "streaming", "studio"})) {
            error("INV-01 partner.type 非法: " + id);
        }
        if (!partner.contains("channels") || !partner.at("channels").is_array() || partner.at("channels").empty()) {
            error("INV-01 partner.channels 必须非空: " + id);
        } else {
            std::set<std::string> channels;
            for (const auto& channel : partner.at("channels")) {
                if (!channel.is_string() || !channels.insert(channel.get<std::string>()).second) {
                    error("INV-01 partner.channels 重复或非法: " + id);
                }
            }
        }
        const int relationship = partner.value("relationship", 50);
        if (relationship < 0 || relationship > 100) error("INV-01 partner.relationship 越界: " + id);
        if (!one_of_text(partner.value("status", std::string{"known"}), {"known", "unavailable"})) {
            error("INV-01 partner.status 非法: " + id);
        }
    }

    // 委员会：成员/渠道不重复、活跃委员会必须指向在制项目
    for (const auto& committee : state.committees) {
        if (!committee.is_object()) { error("INV-01 committee 必须是对象"); continue; }
        const std::string id = committee.value("id", std::string{});
        claim_id(id, "committee");
        const std::string work_id = committee.value("work_id", std::string{});
        if (work_id.empty()) error("INV-01 committee.work_id 缺失: " + id);
        if (!committee.contains("members") || !committee.at("members").is_array() || committee.at("members").empty()) {
            error("INV-01 committee.members 必须非空: " + id);
        } else {
            std::set<std::string> partners;
            std::set<std::string> channels;
            for (const auto& member : committee.at("members")) {
                const std::string partner_id = member.value("partner_id", std::string{});
                const std::string channel = member.value("channel", std::string{});
                if (!partners.insert(partner_id).second) error("INV-01 委员会成员重复: " + id);
                if (!channels.insert(channel).second) error("INV-01 委员会渠道重复: " + id);
                if (find_partner(state, partner_id) == nullptr) error("INV-01 委员会成员不存在: " + partner_id);
            }
        }
        const std::string status = committee.value("status", std::string{"active"});
        if (status != "active" && status != "closed") error("INV-01 committee.status 非法: " + id);
        if (status == "active" && find_work(state, work_id) == nullptr) {
            error("INV-01 活跃委员会的项目不存在: " + work_id);
        }
        const int formed = committee.value("formed_week", 0);
        if (formed < 0 || formed > state.company.week) error("INV-01 committee.formed_week 越界: " + id);
        if (committee.contains("closed_week") && committee.at("closed_week").is_number_integer()) {
            const int closed = committee.at("closed_week").get<int>();
            if (closed < formed) error("INV-01 committee.closed_week 早于成立周: " + id);
        }
    }

    // 市场：槽位上限、企划必填字段
    if (!state.market.is_object()) {
        error("INV-01 market 必须是对象");
    } else {
        if (state.market.contains("slots")) {
            if (!state.market.at("slots").is_array()) error("INV-01 market.slots 必须是数组");
            else if (state.market.at("slots").size() > 4) error("INV-01 market.slots 最多 4 个");
            else {
                for (const auto& offer : state.market.at("slots")) {
                    const std::string offer_id = offer.value("id", std::string{});
                    claim_id(offer_id, "offer");
                    if (offer.value("contract_budget", static_cast<std::int64_t>(0)) <= 0) {
                        error("INV-01 offer.contract_budget 必须为正: " + offer_id);
                    }
                    if (offer.value("duration_weeks", 0) <= 0) error("INV-01 offer.duration_weeks 必须为正: " + offer_id);
                    if (offer.value("blueprint_id", std::string{}).empty()) error("INV-01 offer.blueprint_id 缺失: " + offer_id);
                    if (!offer.contains("channels_baseline") || offer.at("channels_baseline").empty()) {
                        error("INV-01 offer.channels_baseline 不能为空: " + offer_id);
                    }
                    if (!offer.contains("allowed_modes") || offer.at("allowed_modes").empty()) {
                        error("INV-01 offer.allowed_modes 不能为空: " + offer_id);
                    }
                }
            }
        }
        if (state.market.contains("heat") && state.market.at("heat").is_object()) {
            for (const auto& [genre, value] : state.market.at("heat").items()) {
                const std::string level = value.value("level", std::string{});
                if (!one_of_text(level, {"boom", "high", "mid", "low"})) error("INV-01 market.heat 档位非法: " + genre);
            }
        }
    }

    // Archive：只追加，记录 id/评级/结束周必须完整
    if (!state.archive.is_object() || !state.archive.contains("works") || !state.archive.at("works").is_array()) {
        error("INV-01 archive.works 必须是数组");
    } else {
        for (const auto& record : state.archive.at("works")) {
            const std::string record_id = record.value("id", std::string{});
            claim_id(record_id, "archive");
            if (!one_of_text(record.value("rating", std::string{}), {"S", "A", "B", "C", "D"})) {
                error("INV-01 archive.rating 非法: " + record_id);
            }
            if (!one_of_text(record.value("end_reason", std::string{}), {"completed", "deadline", "company_closed"})) {
                error("INV-01 archive.end_reason 非法: " + record_id);
            }
            const int gcp = record.value("gate_completion_permille", 1000);
            if (gcp < 0 || gcp > 1000) error("INV-01 archive.gate_completion_permille 越界: " + record_id);
            const int end_week = record.value("end_week", -1);
            if (end_week < 0 || end_week > state.company.week) error("INV-01 archive.end_week 越界: " + record_id);
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
        if (event.expires_week && *event.expires_week < event.triggered_week) {
            error("INV-23 expires_week 早于触发周: " + event.event_id);
        }
        if (event.expires_week && *event.expires_week > event.triggered_week + 7) {
            error("INV-29 expires_week 超出八周处理上限: " + event.event_id);
        }
        if (event.expires_week &&
            std::none_of(event.options.begin(), event.options.end(),
                         [](const EventOptionView& option) { return option.kind == "abandon"; })) {
            error("INV-29 限期事件缺少 abandon 默认分支: " + event.event_id);
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
    if (!state.finance.loans.is_array() || !state.finance.loans.empty()) {
        error("INV-18 当前 finance.loans 必须为空数组");
    }
    if (state.finance.solvency.state != "normal" ||
        state.finance.solvency.since_week.has_value() ||
        state.finance.solvency.deadline_week.has_value() ||
        state.finance.solvency.gap != 0) {
        error("INV-18 当前 finance.solvency 必须保持 normal/null/null/0");
    }
    if (state.finance.balance < 0) error("INV-25 余额不能为负");
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

namespace {

// M2 固定 fixture：企划槽与合作伙伴。M3 的市场刷新/竞争会替换这里的来源，
// 但字段形状与 start_work 的消费方式保持不变。
Json make_partner(const char* id, const char* name, const char* type, const char* channel, int prestige) {
    return Json{{"id", id},
                {"name", name},
                {"type", type},
                {"channels", Json::array({channel})},
                {"prestige", prestige},
                {"relationship", 50},
                {"history", Json::array()},
                {"status", "known"}};
}

Json make_offer(const char* id, const char* name, const char* source, const char* genre, int budget, int weeks,
                int target_quality, int audience, int commercial, Json potentials, Json channels, Json modes,
                Json candidates) {
    return Json{{"id", id},
                {"name", name},
                {"source", source},
                {"genre", genre},
                {"scale", "tv"},
                {"contract_budget", budget},
                {"duration_weeks", weeks},
                {"target_quality", target_quality},
                {"audience_base", audience},
                {"commercial_potential", commercial},
                {"channel_potentials", std::move(potentials)},
                {"channels_baseline", std::move(channels)},
                {"allowed_modes", std::move(modes)},
                {"committee_candidates", std::move(candidates)},
                {"min_reputation", 0},
                {"required_works", Json::array()},
                {"blueprint_id", "tv_standard"},
                {"episode_count", 12},
                {"workload_scale_permille", 1000},
                {"origin", "publisher"},
                {"style", "standard"}};
}

Json initial_market() {
    Json slots = Json::array();
    slots.push_back(make_offer("offer_01", "星海邮差", "publisher", "sf", 1200000, 26, 70, 600, 700,
                               Json{{"domestic_streaming", 1800000}, {"overseas", 1400000}, {"merchandise", 1200000},
                                    {"music", 500000}, {"tv", 600000}, {"bd_dvd", 500000}},
                               Json::array({"domestic_streaming", "tv"}),
                               Json::array({"contract", "committee"}), Json::array({"partner_tv", "partner_stream"})));
    slots.push_back(make_offer("offer_02", "雨夜食堂", "publisher", "drama", 900000, 24, 65, 520, 620,
                               Json{{"domestic_streaming", 2000000}, {"overseas", 800000}, {"merchandise", 600000},
                                    {"music", 400000}, {"tv", 500000}, {"bd_dvd", 400000}},
                               Json::array({"domestic_streaming"}),
                               Json::array({"contract", "committee"}), Json::array({"partner_stream", "partner_pub"})));
    slots.push_back(make_offer("offer_03", "机甲夏令营", "studio", "family", 1500000, 30, 75, 700, 760,
                               Json{{"domestic_streaming", 2200000}, {"overseas", 1200000}, {"merchandise", 2000000},
                                    {"music", 700000}, {"tv", 700000}, {"bd_dvd", 600000}},
                               Json::array({"domestic_streaming", "merchandise", "tv"}),
                               Json::array({"committee"}), Json::array({"partner_tv", "partner_pub"})));
    slots.push_back(make_offer("offer_04", "无声的告白", "publisher", "romance", 700000, 20, 60, 420, 520,
                               Json{{"domestic_streaming", 1400000}, {"overseas", 600000}, {"merchandise", 500000},
                                    {"music", 600000}, {"tv", 400000}, {"bd_dvd", 500000}},
                               Json::array({"domestic_streaming"}),
                               Json::array({"contract", "committee"}), Json::array({"partner_stream"})));
    return Json{{"heat", Json{{"sf", Json{{"level", "high"}, {"changed_week", 0}}},
                              {"drama", Json{{"level", "mid"}, {"changed_week", 0}}},
                              {"family", Json{{"level", "mid"}, {"changed_week", 0}}},
                              {"romance", Json{{"level", "low"}, {"changed_week", 0}}}}},
                {"slots", slots},
                {"custom_offer", nullptr},
                {"proposal", nullptr},
                {"refresh_week", 0},
                {"last_competition_round", 0},
                {"competitors", Json::array()}};
}

const Json* find_offer(const GameState& state, const std::string& offer_id) {
    if (!state.market.is_object()) return nullptr;
    const auto scan = [&offer_id](const Json& value) -> const Json* {
        if (value.is_object() && value.value("id", std::string{}) == offer_id) return &value;
        return nullptr;
    };
    if (state.market.contains("slots") && state.market.at("slots").is_array()) {
        for (const auto& slot : state.market.at("slots")) {
            if (const Json* hit = scan(slot)) return hit;
        }
    }
    for (const char* key : {"custom_offer", "proposal"}) {
        if (!state.market.contains(key) || !state.market.at(key).is_object()) continue;
        if (const Json* hit = scan(state.market.at(key))) return hit;
    }
    return nullptr;
}

const Json* find_partner(const GameState& state, const std::string& partner_id) {
    for (const auto& partner : state.partners) {
        if (partner.is_object() && partner.value("id", std::string{}) == partner_id) return &partner;
    }
    return nullptr;
}

int successful_channel_cooperations(const GameState& state, const std::string& window) {
    if (!state.archive.is_object() || !state.archive.contains("works") ||
        !state.archive.at("works").is_array()) {
        return 0;
    }
    int count = 0;
    for (const auto& record : state.archive.at("works")) {
        if (!record.is_object() || record.value("end_reason", std::string{}) != "completed" ||
            !record.contains("channels") || !record.at("channels").is_array()) {
            continue;
        }
        for (const auto& channel : record.at("channels")) {
            if (channel.is_object() && channel.value("window", std::string{}) == window &&
                channel.value("net", static_cast<std::int64_t>(0)) > 0) {
                ++count;
                break;
            }
        }
    }
    return count;
}

std::optional<int> external_agency_fee_permille(const GameState& state, const std::string& window) {
    const int cooperations = successful_channel_cooperations(state, window);
    if (state.company.reputation >= 350 || cooperations >= 5) return kAgencyFeeCorePermille;
    if (state.company.reputation >= 190 || cooperations >= 3) return kAgencyFeeHighPermille;
    if (state.company.reputation >= 100 || cooperations >= 1) return kAgencyFeeNormalPermille;
    return std::nullopt;
}

bool json_contains_id(const Json& node, const std::string& candidate) {
    if (node.is_array()) {
        return std::any_of(node.begin(), node.end(), [&candidate](const Json& item) {
            return json_contains_id(item, candidate);
        });
    }
    if (!node.is_object()) return false;
    for (const char* key : {"id", "offer_id"}) {
        if (node.contains(key) && node.at(key).is_string() && node.at(key).get<std::string>() == candidate) return true;
    }
    for (auto it = node.begin(); it != node.end(); ++it) {
        if (json_contains_id(it.value(), candidate)) return true;
    }
    return false;
}

std::string next_id(const GameState& state, const char* prefix, int existing) {
    const Json state_json = state;
    int index = existing + 1;
    while (true) {
        char buffer[48];
        std::snprintf(buffer, sizeof(buffer), "%s%02d", prefix, index);
        const std::string candidate = buffer;
        if (!json_contains_id(state_json, candidate)) return candidate;
        ++index;
    }
}

int heat_factor(const Json& market, const std::string& genre) {
    if (!market.is_object() || !market.contains("heat") || !market.at("heat").is_object()) return 1000;
    const auto& heat = market.at("heat");
    if (!heat.contains(genre) || !heat.at(genre).is_object()) return 1000;
    const std::string level = heat.at(genre).value("level", std::string("mid"));
    if (level == "boom") return 1200;
    if (level == "high") return 1100;
    if (level == "low") return 900;
    return 1000;
}

int reputation_factor(std::int64_t reputation) {
    return std::clamp(800 + static_cast<int>(reputation) * 2, 800, 1400);
}

int quality_factor(int mean) { return std::clamp(200 + mean * 8, 200, kQualityFactorMax); }

std::string rating_of(int mean) {
    // M2/V3.5 统一口径：85/75/65/50。
    if (mean >= 85) return "S";
    if (mean >= 75) return "A";
    if (mean >= 65) return "B";
    if (mean >= 50) return "C";
    return "D";
}

void change_reputation(GameState& state, int delta, const std::string& reason) {
    if (delta == 0) return;
    state.company.reputation = std::max<std::int64_t>(0, state.company.reputation + delta);
    state.company.reputation_log.push_back(
        ReputationLog{state.company.week, reason, delta, state.company.reputation});
}

// ---------------- 交付结算（正常 / 到期强制 / 关闭结清共用）----------------
// [PLACEHOLDER] 以下系数集中在此，等待数值标定；规则依据：
// DOMAIN_ARCHITECTURE §7.3.6（gate_completion_permille 决定扣罚与评价修正）、
// GAME_RULES 历史参数 deadline_revenue = 600‰（截止强制交付收入系数）。
constexpr int kForcedCommercialPermille = 600;
constexpr int kForcedPenaltyPermille = 300;   // 门槛完全未达时扣合同预算的 30%
constexpr int kForcedScorePenaltyMax = 10;    // 评价修正上限（分）

// 门槛项完成度：逐项按 work_done/(deliver_at×work_total) 封顶 1000 后取平均。
// 正常交付恒为 1000；只有强制/关闭路径会产生低于 1000 的值。
int gate_completion_permille(const Project& work) {
    std::int64_t sum = 0;
    int count = 0;
    walk_items(work, [&sum, &count](const WorkItem& item) {
        if (!item.is_gate) return;
        ++count;
        const std::int64_t need = static_cast<std::int64_t>(item.deliver_at) * item.work_total;
        if (need <= 0) {
            sum += 1000;
            return;
        }
        const std::int64_t have = static_cast<std::int64_t>(item.work_done) * 1000;
        sum += std::min<std::int64_t>(1000, have * 1000 / need);
    });
    return count == 0 ? 0 : static_cast<int>(sum / count);
}

struct SettlementOutcome {
    bool ok = false;
    const char* code = "INVALID_STATE";
    std::string message;
    Json report = Json::object();
};

SettlementOutcome settle_project(GameState& state, Project& work, const std::string& end_reason, bool forced);

// 关闭公司前先在副本逐项预演结清，确保进入不可逆 closing 后仍有合法后继。
SettlementOutcome close_company(GameState& state, const std::string& reason) {
    SettlementOutcome outcome;
    GameState preview = state;
    for (const auto& work : state.works) {
        Project* preview_work = find_work(preview, work.id);
        const auto settlement = settle_project(preview, *preview_work, "company_closed", !preview_work->deliverable());
        if (!settlement.ok) return settlement;
    }
    state.company.status = "closing";
    state.company.end_reason = reason;
    for (auto& work : state.works) {
        if (work.status != "producing") continue;
        work.status = "delivering";
        work.delivery = Json{{"reason", "company_closed"}, {"at_week", state.company.week}};
    }
    for (auto& member : state.staff) member.assignment_work_id.reset();
    // 待处理事件不得丢弃：调用方必须先确认没有 pending；这里不再静默清空。
    // 没有在制项目时无需逐个 finalize_delivery，直接结束（否则 closing→ended 无驱动）。
    if (state.works.empty()) state.company.status = "ended";
    outcome.ok = true;
    return outcome;
}

// 一次交付结算：质量聚合 → 评级 → 渠道收入 → 分账/奖励/扣罚 → 声望 → 委员会 →
// Archive → 清理。调用方负责守卫（producing / 门槛 / 截止）与最终 validate。
SettlementOutcome settle_project(GameState& state, Project& work, const std::string& end_reason, bool forced) {
    SettlementOutcome outcome;
    const int week = state.company.week;
    const std::string work_id = work.id;
    // DEC-EVENT-001：待处理事件不得因交付/中止/关闭被丢弃；先处理再结项。
    for (const auto& pending : state.events.pending) {
        if (pending.work_id != work_id) continue;
        outcome.code = "INVALID_PHASE";
        outcome.message = "该项目仍有待处理事件，请先处理： " + pending.event_id;
        return outcome;
    }
    const int gcp = forced ? gate_completion_permille(work) : 1000;

    const auto quality = kernel::aggregate_work(work);
    const int raw_score = quality.mean;
    const int correction = forced ? std::min(kForcedScorePenaltyMax, (1000 - gcp) / 100) : 0;
    const int score = clamp_int(raw_score - correction, 0, 100);
    const std::string rating = rating_of(score);

    // 内部测试夹具可以没有 offer；正式立项一定有快照。
    const Json empty_offer = Json::object();
    const Json& offer = work.offer.is_object() ? work.offer : empty_offer;
    const std::int64_t budget = offer.value("contract_budget", static_cast<std::int64_t>(0));
    const std::string genre = offer.value("genre", std::string{});
    const int qf = quality_factor(raw_score);
    const int hf = heat_factor(state.market, genre);
    const int rf = reputation_factor(state.company.reputation);

    const bool contract = work.mode != "committee";
    const bool aborted = end_reason == "aborted";
    const int percent = work.investment.value("percent", 0);

    std::set<std::string> member_windows;
    if (work.committee_id) {
        for (const auto& committee : state.committees) {
            if (!committee.is_object() || committee.value("id", std::string{}) != *work.committee_id) continue;
            for (const auto& member : committee.at("members")) {
                if (member.is_object() && member.contains("channel")) {
                    member_windows.insert(member.at("channel").get<std::string>());
                }
            }
        }
    }
    const bool tv_member = member_windows.count("tv") > 0;
    const bool tv_purchased = work.tv_service.is_object() && work.tv_service.value("purchased", false);
    const std::set<std::string> baseline(work.channels.begin(), work.channels.end());
    std::optional<int> tv_agency;
    if (tv_member || tv_purchased) {
        tv_agency = 0;
    } else if (baseline.count("tv") > 0) {
        tv_agency = external_agency_fee_permille(state, "tv");
    }
    const int tv_multiplier = tv_member                                    ? kTvMultiplierMember
                              : tv_purchased                              ? kTvMultiplierPurchased
                              : tv_agency.has_value()                     ? kTvMultiplierAgency
                                                                           : 1000;

    Json channel_report = Json::array();
    std::int64_t gross_total = 0;
    std::int64_t bd_gross = 0;
    std::int64_t bd_revenue = 0;
    std::int64_t committee_pool = 0;
    for (const char* window_key : kCommercialWindows) {
        if (aborted) break;   // 中止项目不产生商业收入
        const std::string window = window_key;
        const bool bd = window == kWindowBd;
        const bool tv_service_window = window == "tv" && tv_purchased;
        // 承制只拿 BD/DVD；委员会按成员、企划或已购电视服务开放其余窗口。
        const bool open = bd || tv_service_window ||
                          (!contract && (member_windows.count(window) > 0 || baseline.count(window) > 0));
        std::int64_t potential = 0;
        if (offer.contains("channel_potentials") && offer.at("channel_potentials").is_object() &&
            offer.at("channel_potentials").contains(window) &&
            offer.at("channel_potentials").at(window).is_number_integer()) {
            potential = offer.at("channel_potentials").at(window).get<std::int64_t>();
        }
        if (!open || potential <= 0) continue;

        int agency = 0;
        if (!bd && !tv_service_window) {
            if (member_windows.count(window) == 0) {
                const auto fee = external_agency_fee_permille(state, window);
                if (!fee.has_value()) continue;
                agency = *fee;
            }
        }

        std::int64_t gross = potential;
        gross = gross * qf / 1000;
        gross = gross * hf / 1000;
        gross = gross * rf / 1000;
        if (tv_boost_window(window)) gross = gross * tv_multiplier / 1000;
        if (forced) gross = gross * kForcedCommercialPermille / 1000;

        const std::int64_t net = bd ? gross / 2 : gross * (1000 - agency) / 1000;
        gross_total += gross;
        if (bd) {
            bd_gross += gross;
            bd_revenue += net;
        } else if (!contract) {
            committee_pool += net;
        }
        channel_report.push_back(Json{{"window", window},
                                      {"potential", potential},
                                      {"quality_factor", qf},
                                      {"heat_factor", hf},
                                      {"reputation_factor", rf},
                                      {"tv_multiplier", tv_boost_window(window) ? tv_multiplier : 1000},
                                      {"agency_fee_permille", agency},
                                      {"gross", gross},
                                      {"net", net},
                                      {"owner", bd ? "company" : "committee_pool"}});
    }

    std::int64_t company_share = 0;
    std::int64_t investor_share = 0;
    std::int64_t reward = 0;
    if (!contract && !aborted) {
        const std::int64_t allocation_numerator = committee_pool * percent;
        if (allocation_numerator % 100 != 0) {
            outcome.code = "NOT_IMPLEMENTED";
            outcome.message = "委员会净商业池分配的取整顺序与余数归属尚未冻结";
            return outcome;
        }
        company_share = allocation_numerator / 100;
        investor_share = committee_pool - company_share;
    } else if (contract && !aborted && bd_revenue >= budget) {
        reward = budget * 200 / 1000;   // [PLACEHOLDER] 承制成功奖励 20%
    }
    // 强制交付扣罚：按门槛缺口比例扣合同预算的 kForcedPenaltyPermille‰。
    // 中止的违约扣罚系数未标定，记 0 并在回执标记 penalty_pending。
    const std::int64_t penalty =
        (!aborted && forced) ? budget * (1000 - gcp) / 1000 * kForcedPenaltyPermille / 1000
                             : static_cast<std::int64_t>(0);
    const std::int64_t company_revenue = bd_revenue + company_share + reward;
    const std::int64_t balance_after_settlement =
        state.finance.balance + company_revenue - penalty;
    if (balance_after_settlement < 0) {
        outcome.code = "INSUFFICIENT_FUNDS";
        outcome.message = "交付结算后现金余额将为负，已原子拒绝";
        return outcome;
    }

    std::int64_t assigned_channel_share = 0;
    Json* last_pool_channel = nullptr;
    for (auto& line : channel_report) {
        const bool bd = line.value("window", std::string{}) == kWindowBd;
        const std::int64_t channel_company_share = bd
            ? line.value("net", static_cast<std::int64_t>(0))
            : line.value("net", static_cast<std::int64_t>(0)) * percent / 100;
        line["revenue"] = line.value("gross", static_cast<std::int64_t>(0));
        line["company_received"] = channel_company_share;
        assigned_channel_share += channel_company_share;
        if (!bd) last_pool_channel = &line;
    }
    // 逐渠道公司所得只是已定总额的展示拆分；余数归最后一条，避免改动净池分配规则。
    if (last_pool_channel != nullptr) {
        (*last_pool_channel)["company_received"] =
            last_pool_channel->value("company_received", static_cast<std::int64_t>(0)) +
            bd_revenue + company_share - assigned_channel_share;
    }

    if (bd_revenue > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".bd." + work_id, week, work_id, "commercial_share_received",
            bd_revenue, work.committee_id, "bd_dvd (company 50% share)"});
        state.finance.balance += bd_revenue;
    }
    if (company_share > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".commercial." + work_id, week, work_id, "commercial_share_received",
            company_share, work.committee_id, "committee net pool share"});
        state.finance.balance += company_share;
    }
    if (reward > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".reward." + work_id, week, work_id, "success_reward_received",
            reward, std::nullopt, "contract success reward"});
        state.finance.balance += reward;
    }
    if (penalty > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".penalty." + work_id, week, work_id, "penalty",
            -penalty, std::nullopt, forced ? "forced delivery penalty" : "penalty"});
        state.finance.balance -= penalty;
    }

    static const std::map<std::string, int> kReputationDelta{{"S", 8}, {"A", 5}, {"B", 2}, {"C", 0}, {"D", -5}};
    const int reputation_delta = forced ? std::min(0, kReputationDelta.at(rating)) : kReputationDelta.at(rating);
    change_reputation(state, reputation_delta, "作品交付 " + rating + (forced ? "（强制）" : ""));

    // 委员会关闭 + 伙伴关系沉淀
    if (work.committee_id) {
        for (auto& committee : state.committees) {
            if (!committee.is_object() || committee.value("id", std::string{}) != *work.committee_id) continue;
            committee["status"] = "closed";
            committee["closed_week"] = week;
            static const std::map<std::string, int> kRelationshipDelta{{"S", 3}, {"A", 2}, {"B", 1}, {"C", 0}, {"D", -2}};
            for (auto& partner : state.partners) {
                if (!partner.is_object()) continue;
                bool member = false;
                for (const auto& m : committee.at("members")) {
                    if (m.value("partner_id", std::string{}) == partner.value("id", std::string{})) member = true;
                }
                if (!member) continue;
                const int delta = forced ? std::min(0, kRelationshipDelta.at(rating)) : kRelationshipDelta.at(rating);
                partner["relationship"] = std::clamp(partner.value("relationship", 50) + delta, 0, 100);
                if (!partner.contains("history") || !partner.at("history").is_array()) partner["history"] = Json::array();
                partner["history"].push_back(Json{{"week", week}, {"work_id", work_id}, {"delta", delta},
                                                  {"reason", std::string("作品交付 ") + rating}});
            }
        }
    }

    // Archive：只追加，记录交付所需事实与对账
    Json episode_records = Json::array();
    for (const auto& episode : work.episodes) {
        const auto ep = kernel::aggregate_episode(episode);
        Json dims = Json::object();
        for (int i = 0; i < kDimensionCount; ++i) dims[kDimensions[static_cast<std::size_t>(i)]] = ep.dims[static_cast<std::size_t>(i)];
        episode_records.push_back(Json{{"id", episode.id}, {"quality", Json{{"dims", dims}, {"mean", ep.mean}}}});
    }
    Json team = Json::array();
    std::set<std::string> contributors;
    walk_items(work, [&contributors](const WorkItem& item) {
        for (const auto& id : item.contributors) contributors.insert(id);
    });
    for (const auto& id : contributors) {
        const Staff* member = find_staff(state, id);
        if (member != nullptr) team.push_back(Json{{"id", member->id}, {"name", member->name}, {"role", member->role}});
    }
    Json dims = Json::object();
    for (int i = 0; i < kDimensionCount; ++i) dims[kDimensions[static_cast<std::size_t>(i)]] = quality.dims[static_cast<std::size_t>(i)];

    // DEC-ECON-001：只汇总归因到本项目的直接成本；公司固定成本保持 work_id=null。
    static const std::set<std::string> kCostCategories{"salary", "production", "temporary", "outsourcing", "events",
                                                       "extension", "distribution", "penalty", "development"};
    Json cost_breakdown = Json::object();
    std::int64_t total_costs = 0;
    for (const auto& entry : state.finance.entries) {
        if (!entry.work_id || *entry.work_id != work_id) continue;
        if (kCostCategories.find(entry.category) == kCostCategories.end()) continue;
        const std::int64_t amount = -entry.amount;
        if (amount <= 0) continue;
        cost_breakdown[entry.category] = cost_breakdown.value(entry.category, static_cast<std::int64_t>(0)) + amount;
        total_costs += amount;
    }
    const std::int64_t investment_paid = work.investment.value("paid", static_cast<std::int64_t>(0));
    const std::int64_t profit = budget + company_revenue - investment_paid - total_costs;

    Json record = Json{{"id", work_id},
                       {"offer_id", offer.value("id", std::string{})},
                       {"name", offer.value("name", std::string{})},
                       {"source", offer.value("source", std::string{})},
                       {"genre", genre},
                       {"scale", offer.value("scale", std::string{})},
                       {"mode", work.mode},
                       {"investment_percent", percent},
                       {"start_week", work.opened_week},
                       {"end_week", week},
                       {"end_reason", end_reason},
                       {"forced", forced},
                       {"gate_completion_permille", gcp},
                       {"quality", Json{{"dims", dims}, {"mean", raw_score}}},
                       {"quality_score", score},
                       {"rating", rating},
                       {"commercial_revenue", gross_total},
                       {"bd_gross", bd_gross},
                       {"bd_revenue", bd_revenue},
                       {"committee_pool", committee_pool},
                       {"investor_share", investor_share},
                       {"company_received", company_revenue},
                       {"finance_summary", Json{{"contract_received", budget},
                                                {"investment_paid", investment_paid},
                                                {"commercial_share", company_share + bd_revenue},
                                                {"bd_revenue", bd_revenue},
                                                {"success_reward", reward},
                                                {"penalty", penalty},
                                                {"costs", cost_breakdown},
                                                {"total_costs", total_costs},
                                                {"profit", profit}}},
                       {"channel_breakdown", channel_report},
                       {"episodes", episode_records},
                       {"team", team},
                       {"rules_status", "placeholder"}};
    // aborted 不是交付：M0 Archive 只定义 completed/deadline/company_closed，
    // 不扩展冻结枚举；中止只清项目并保留财务/声望事实（见文档兼容性分析）。
    if (end_reason != "aborted") {
        if (!state.archive.contains("works") || !state.archive.at("works").is_array()) state.archive["works"] = Json::array();
        state.archive["works"].push_back(record);
    }

    outcome.report = Json{{"work_id", work_id},
                          {"end_reason", end_reason},
                          {"archived", end_reason != "aborted"},
                          {"rules_status", "placeholder"},
                          {"forced", forced},
                          {"gate_completion_permille", gcp},
                          {"rating", rating},
                          {"quality_score", score},
                          {"commercial_revenue", gross_total},
                          {"bd_gross", bd_gross},
                          {"bd_revenue", bd_revenue},
                          {"committee_pool", committee_pool},
                          {"company_received", company_revenue},
                          {"commercial_share", company_share},
                          {"investor_share", investor_share},
                          {"success_reward", reward},
                          {"penalty", penalty},
                          {"total_costs", total_costs},
                          {"net_received", company_revenue - penalty},
                          {"channels", channel_report}};

    // 清理：临时员工随合同项目退出，核心员工只解绑；pending 已在入口拒绝，不在此删除。
    state.staff.erase(std::remove_if(state.staff.begin(), state.staff.end(), [&work_id](const Staff& member) {
        if (member.employment != "temporary") return false;
        if (member.assignment_work_id && *member.assignment_work_id == work_id) return true;
        return member.temporary_contract.is_object() &&
               member.temporary_contract.value("work_id", std::string{}) == work_id;
    }), state.staff.end());
    for (auto& member : state.staff) {
        if (member.assignment_work_id && *member.assignment_work_id == work_id) member.assignment_work_id.reset();
    }
    state.works.erase(std::remove_if(state.works.begin(), state.works.end(),
                                     [&work_id](const Project& item) { return item.id == work_id; }),
                      state.works.end());

    outcome.ok = true;
    return outcome;
}

void apply_event_effects(GameState& state, Project& work, const std::vector<EffectView>& effects, int week,
                         const std::string& event_id);

bool apply_event_option(GameState& state, const PendingEvent& pending, const EventOptionView& option, int week,
                        bool automatic) {
    Project* work = find_work(state, pending.work_id);
    if (work == nullptr) return false;
    std::int64_t cost = option.cost;
    if (automatic) cost = std::min<std::int64_t>(cost, state.finance.balance);
    if (cost > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".event." + pending.event_id + "." + pending.work_id,
            week, pending.work_id, "events", -cost, std::nullopt, pending.event_id});
        state.finance.balance -= cost;
    }
    apply_event_effects(state, *work, option.effects, week, pending.event_id);
    auto& entry = state.events.per_work[pending.work_id];
    if (pending.cooldown_weeks > 0) entry.cooldowns[pending.event_id] = week + pending.cooldown_weeks;
    if (pending.once_per_project &&
        std::find(entry.major_seen.begin(), entry.major_seen.end(), pending.event_id) == entry.major_seen.end()) {
        entry.major_seen.push_back(pending.event_id);
    }
    return true;
}

const EventOptionView* default_event_option(const PendingEvent& pending) {
    for (const auto& option : pending.options) {
        if (option.kind == "abandon") return &option;
    }
    return nullptr;
}

}  // namespace

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
            // 创始名册不是通过 hire_core 进来的，没有签约费可记；
            // 留 0 才不会凭空出现一笔从未入过账的 signing_fee。
            member.signing_fee = 0;
            member.fatigue = 0;
            member.morale = 80;
            return member;
        };
        state.staff.push_back(make_staff("staff_dir", "林监督", "director", {60, 80, 45, 40, 70, 40}));
        state.staff.push_back(make_staff("staff_ka", "陈原画", "key_animator", {45, 55, 85, 60, 40, 45}));
        state.staff.push_back(make_staff("staff_anim", "许动画", "animator", {40, 45, 60, 75, 40, 50}));

        state.partners = Json::array({make_partner("partner_tv", "东都电视台", "tv", "tv", 65),
                                      make_partner("partner_stream", "海流配信", "streaming", "domestic_streaming", 55),
                                      make_partner("partner_pub", "白鹭出版", "publisher", "publishing", 45)});
        state.finance.opening_funds = 2000000;
        state.finance.balance = 2000000;
        state.market = initial_market();
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
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
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
        if (!designate_supervisor(state, state.works.back())) {
            return encode(error_body("INVALID_STATE", "INV-27 开工需要一名合格监督，名册中无可用候选人"));
        }

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
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
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
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
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
        // 目标先算出来，监督岗位才能在同一份副本里原子处理，不留可观察的空缺中间态（§14.8）。
        std::optional<std::string> destination;
        if (request.at("work_id").is_null()) {
            destination.reset();
        } else if (request.at("work_id").is_string()) {
            const std::string work_id = request.at("work_id").get<std::string>();
            if (work_id.empty()) return encode(error_body("INVALID_INPUT", "work_id 不能为空字符串"));
            const Project* work = find_work(state, work_id);
            if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
            if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有制作中的项目可以分配人员"));
            destination = work_id;
        } else {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串或 null"));
        }

        // 把在任监督从本项目调走：必须先当场补位，否则关键岗位锁定、本次调动作废。
        const std::string origin = member->assignment_work_id.value_or("");
        if (origin != destination.value_or("") &&
            !replace_supervisor_post(state, origin, staff_id)) {
            return encode(error_body("INVALID_PHASE", "监督关键岗位锁定：同项目与公司空闲名册中无合格替补"));
        }

        if (destination) {
            member->assignment_work_id = destination;
            // 调入项目若监督空缺，合格员工到位即补位（§5 命令 4 的 Swap/Replace 入口）。
            Project* target = find_work(state, *destination);
            if (target != nullptr && (!target->supervisor_staff_id || target->supervisor_staff_id->empty()) &&
                supervisor_qualified(*member)) {
                target->supervisor_staff_id = member->id;
            }
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
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));

        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (state.company.week >= kMaxWeek) return encode(error_body("INVALID_PHASE", "已达经营上限"));
        // INV-23：只有未查看事件阻塞推进；已查看未处理事件允许推进并继续计时。
        int unviewed = 0;
        for (const auto& event : state.events.pending) {
            if (!event.viewed) ++unviewed;
        }
        if (unviewed > 0) {
            return encode(error_body("INVALID_PHASE", "存在 " + std::to_string(unviewed) + " 条未查看事件"));
        }

        // ---- 阶段 1：计划冻结与快照；后续失败必须回到这里 ----
        const GameState snapshot = state;
        auto fail_stage = [&state, &snapshot](int stage, const std::string& code, const std::string& message) {
            state = snapshot;
            return encode(error_body(code.c_str(), "阶段 " + std::to_string(stage) + " 失败: " + message));
        };

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

        // ---- 阶段 2：刚性支出原子预检（工资 + 运营 + 制作费）----
        // 预检失败一律整周不提交：不推进、不记账、不生产，按 §14.7 直接破产。
        std::map<std::string, int> assigned_count;
        for (const Staff* member : ordered_staff) {
            if (member->assignment_work_id) ++assigned_count[*member->assignment_work_id];
        }
        int64_t salary_total = 0;
        for (const auto& member : state.staff) salary_total += member.weekly_salary;
        const int64_t operations_total = kernel::weekly_operations_cost();
        int64_t production_total = 0;
        for (const Project* work : ordered) {
            if (work->status != "producing") continue;
            if (assigned_count[work->id] == 0) continue;   // 没人做就不开工，也不计制作费
            production_total += kernel::weekly_production_cost(work->plan.intensity);
        }
        const int64_t total_cost = salary_total + operations_total + production_total;
        if (state.finance.balance < total_cost) {
            if (!state.events.pending.empty()) {
                return encode(error_body("NOT_IMPLEMENTED",
                                         "破产终局的 pending 转移/归档语义尚未冻结，不能清空事件或关闭其归属项目"));
            }
            const int64_t gap = total_cost - state.finance.balance;
            const int64_t balance = state.finance.balance;
            // §14.7：预检失败不扣款、不推进、不生产，回滚至阶段 1 快照并直接破产终局。
            const auto closing = close_company(state, "bankrupt");
            if (!closing.ok) {
                return fail_stage(2, closing.code,
                                  "破产终局无法合法结清在制项目: " + closing.message);
            }
            const auto bankrupt_errors = validate(state);
            if (!bankrupt_errors.empty()) {
                return encode(error_body("INTERNAL_ERROR", "破产终局状态非法: " + bankrupt_errors.front()));
            }
            return encode(Json{{"state", state},
                               {"report", Json{{"week", week},
                                               {"mode", "bankrupt"},
                                               {"bankrupt", true},
                                               {"skipped", true},
                                               {"gap", gap},
                                               {"funds", Json{{"delta", 0}, {"balance", balance}}},
                                               {"works", Json::array()},
                                               {"staff", Json::array()},
                                               {"settlements", Json::array()},
                                               {"events", Json{{"drawn", 0}, {"reason", "bankrupt"}}}}}});
        }

        // ---- 阶段 3：刚性支出扣款与流水（唯一账本，逐条可归因）----
        auto spend = [&state, week](const std::string& entry_id, std::optional<std::string> work_id,
                                    const char* category, int64_t amount, const std::string& memo) {
            if (amount <= 0) return;
            state.finance.entries.push_back(
                LedgerEntry{entry_id, week, std::move(work_id), category, -amount, std::nullopt, memo});
            state.finance.balance -= amount;
        };
        for (const Staff* member : ordered_staff) {
            // DEC-ECON-001：分配到项目的周薪归项目直接成本；闲置员工工资留在公司级。
            spend("w" + std::to_string(week) + ".salary." + member->id, member->assignment_work_id,
                  "salary", member->weekly_salary, member->id);
        }
        spend("w" + std::to_string(week) + ".operations", std::nullopt, "operations", operations_total, "公司运营");
        for (const Project* work : ordered) {
            if (work->status != "producing" || assigned_count[work->id] == 0) continue;
            const int64_t cost = kernel::weekly_production_cost(work->plan.intensity);
            spend("w" + std::to_string(week) + ".production." + work->id, work->id, "production", cost,
                  work->plan.intensity);
        }

        // ---- 阶段 4：项目生产推进与阶段切换 ----
        std::map<std::string, std::set<int>> experience_gains;
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
                        experience_gains[member->id].insert(ability_index(item->ability));
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

        // ---- 阶段 5：人员经验、疲劳与红灯 ----
        Json staff_report = Json::array();
        for (auto& member : state.staff) {
            if (member.employment != "temporary") {
                for (const int ability : experience_gains[member.id]) {
                    if (ability < 0) continue;
                    member.experience[static_cast<std::size_t>(ability)] =
                        std::min(100, member.experience[static_cast<std::size_t>(ability)] + 1);
                }
            }
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

        // ---- 阶段 6：商业窗口、完成与交付收入 ----
        // 已达门槛记 completed；未达门槛按当前进度强制交付（deadline），
        // 扣罚与评价修正由 gate_completion_permille 决定。
        Json settlements = Json::array();
        std::vector<std::string> due;
        for (const Project* work : ordered) {
            if (work->status == "producing" && week >= work->deadline_week) due.push_back(work->id);
        }
        for (const auto& id : due) {
            Project* target = find_work(state, id);
            if (target == nullptr) continue;
            const bool complete = target->deliverable();
            const auto settled = settle_project(state, *target, complete ? "completed" : "deadline", !complete);
            if (!settled.ok) return fail_stage(6, settled.code, settled.message);
            settlements.push_back(settled.report);
        }

        // ---- 阶段 7：延迟状态倒计时与到期默认分支 ----
        // 只按 (work_id,event_id) 稳定顺序处理本周已到期的已查看事件，不触碰其他 pending。
        std::vector<PendingEvent> due_events;
        for (const auto& pending : state.events.pending) {
            if (pending.viewed && pending.expires_week && week >= *pending.expires_week) {
                due_events.push_back(pending);
            }
        }
        std::sort(due_events.begin(), due_events.end(), [](const PendingEvent& a, const PendingEvent& b) {
            if (a.work_id != b.work_id) return a.work_id < b.work_id;
            return a.event_id < b.event_id;
        });
        Json expired = Json::array();
        for (const auto& pending : due_events) {
            const EventOptionView* option = default_event_option(pending);
            if (option == nullptr) return fail_stage(7, "INVALID_STATE", "限期事件缺少 abandon 默认分支");
            if (!apply_event_option(state, pending, *option, week, true)) {
                return fail_stage(7, "INVALID_STATE", "到期事件归属项目不存在");
            }
            auto& events = state.events.pending;
            const auto hit = std::find_if(events.begin(), events.end(), [&pending](const PendingEvent& item) {
                return item.work_id == pending.work_id && item.event_id == pending.event_id;
            });
            if (hit == events.end()) return fail_stage(7, "INVALID_STATE", "到期事件重复处理");
            events.erase(hit);
            expired.push_back(Json{{"work_id", pending.work_id}, {"event_id", pending.event_id},
                                   {"option_id", option->id}, {"automatic", true}});
        }

        // ---- 阶段 8：随机事件抽取与周数 +1 ----
        // 每个 producing 项目各自至多一条；已有待处理事件的项目不再追加。
        // 第 520 周先合法完成当周结算，再统一收尾：不再抽事件，剩余项目转 closing 结清。
        Json events_report = Json::object();
        if (week + 1 >= kMaxWeek) {
            if (!state.events.pending.empty()) {
                return fail_stage(8, "NOT_IMPLEMENTED",
                                  "第 520 周终局的 pending 转移/归档语义尚未冻结，不能清空事件或关闭其归属项目");
            }
            const auto closing = close_company(state, "time_limit");
            if (!closing.ok) {
                return fail_stage(8, closing.code,
                                  "第 520 周终局无法合法结清在制项目: " + closing.message);
            }
            events_report = Json{{"drawn", 0}, {"reason", "company_closed"}};
        } else {
            events_report = event::draw(state, week + 1);
        }

        state.company.week = week + 1;
        events_report["expired"] = expired;

        const auto post_errors = validate(state);
        if (!post_errors.empty()) return fail_stage(8, "INTERNAL_ERROR", post_errors.front());

        Json report = Json{{"week", week},
                           {"works", works_report},
                           {"staff", staff_report},
                           {"settlements", settlements},
                           {"events", events_report},
                           {"funds", Json{{"delta", state.finance.balance - snapshot.finance.balance},
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

// M0 命令 12：只创建原创草稿并检查基础声望资格；不建 Project、不扣全部投资资金。
// 草稿开发费金额与扣费时点未冻结，本实现记 development_fee=0 并在文档标 PLACEHOLDER。
std::string create_custom_offer(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!state.market.is_object()) return encode(error_body("INVALID_STATE", "market 必须是对象"));
        if (state.market.contains("custom_offer") && state.market.at("custom_offer").is_object()) {
            return encode(error_body("INVALID_PHASE", "原创草稿槽已被占用"));
        }
        for (const char* key : {"name", "source", "scale", "style"}) {
            if (!request.contains(key) || !request.at(key).is_string()) {
                return encode(error_body("INVALID_INPUT", std::string(key) + " 必须是字符串"));
            }
        }
        const std::string source = request.at("source").get<std::string>();
        const std::string scale = request.at("scale").get<std::string>();
        const std::string style = request.at("style").get<std::string>();
        if (!one_of_text(source, {"manga", "light_novel", "game", "original"})) {
            return encode(error_body("INVALID_INPUT", "source 非法"));
        }
        if (!one_of_text(scale, {"ova", "short", "tv", "movie"})) {
            return encode(error_body("INVALID_INPUT", "scale 非法"));
        }
        if (!one_of_text(style, {"normal", "meme", "ai"})) {
            return encode(error_body("INVALID_INPUT", "style 非法"));
        }
        if (state.company.reputation < kDraftMinReputation) {
            return encode(error_body("INVALID_INPUT", "声望不足，无法创建原创草稿"));
        }
        const std::string draft_id = next_id(state, "custom_", static_cast<int>(state.archive.value("works", Json::array()).size()));
        const std::int64_t budget = draft_budget(scale);
        const int weeks = draft_weeks(scale);
        const auto potential = [budget](int permille) { return budget * permille / 1000; };
        state.market["custom_offer"] = Json{{"id", draft_id},
                                            {"name", request.at("name")},
                                            {"source", source},
                                            {"scale", scale},
                                            {"style", style},
                                            {"genre", "original"},
                                            {"origin", "custom"},
                                            {"draft_status", "valid"},
                                            {"created_week", state.company.week},
                                            {"contract_budget", budget},
                                            {"duration_weeks", weeks},
                                            {"target_quality", 70},
                                            {"blueprint_id", "tv_standard"},
                                            {"episode_count", 12},
                                            {"workload_scale_permille", 1000},
                                            {"channel_potentials", Json{{"domestic_streaming", potential(2000)},
                                                                        {"overseas", potential(1200)},
                                                                        {"merchandise", potential(1000)},
                                                                        {"music", potential(500)},
                                                                        {"tv", potential(500)},
                                                                        {"bd_dvd", potential(400)}}},
                                            {"channels_baseline", Json::array({"domestic_streaming"})},
                                            {"allowed_modes", Json::array({"committee"})},
                                            {"committee_candidates", Json::array()},
                                            {"min_reputation", 0},
                                            {"required_works", Json::array()},
                                            {"development_fee", 0},
                                            {"rules_status", "placeholder"}};
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "草稿创建后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"offer_id", draft_id},
                           {"contract_budget", budget}, {"rules_status", "placeholder"}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 命令 13/14：提案转草稿 / 清空提案。提案目前由 fixture 注入，生成属 M3。
std::string adopt_proposal(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!state.market.is_object() || !state.market.contains("proposal") || !state.market.at("proposal").is_object()) {
            return encode(error_body("NOT_FOUND", "没有可用提案"));
        }
        if (state.market.contains("custom_offer") && state.market.at("custom_offer").is_object()) {
            return encode(error_body("INVALID_PHASE", "原创草稿槽已被占用"));
        }
        Json draft = state.market.at("proposal");
        draft["id"] = draft.value("id", std::string("proposal_01"));
        draft["origin"] = "custom";
        draft["draft_status"] = "valid";
        if (!draft.contains("allowed_modes") || draft.at("allowed_modes").empty()) {
            draft["allowed_modes"] = Json::array({"committee"});
        }
        state.market["custom_offer"] = std::move(draft);
        state.market["proposal"] = nullptr;
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "采纳后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"offer_id", state.market.at("custom_offer").at("id")}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string reject_proposal(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!state.market.is_object() || !state.market.contains("proposal") || !state.market.at("proposal").is_object()) {
            return encode(error_body("NOT_FOUND", "没有可用提案"));
        }
        state.market["proposal"] = nullptr;
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "拒绝后状态非法: " + errors.front()));
        return encode(Json{{"state", state}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string start_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("offer_id") || !request.at("offer_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "offer_id 必须是字符串"));
        }
        if (!request.contains("mode") || !request.at("mode").is_string()) {
            return encode(error_body("INVALID_INPUT", "mode 必须是 contract/committee"));
        }
        const std::string offer_id = request.at("offer_id").get<std::string>();
        const std::string mode = request.at("mode").get<std::string>();
        if (mode != "contract" && mode != "committee") {
            return encode(error_body("INVALID_INPUT", "mode 只能是 contract/committee"));
        }

        const Json* offer = find_offer(state, offer_id);
        if (offer == nullptr) return encode(error_body("NOT_FOUND", "企划不存在或已被消费"));
        const Json& snapshot = *offer;
        // DEC-PLAN-001 两级准入：普通企划看声望/履历；原创草稿只看草稿是否有效，
        // 草稿资格在 create_custom_offer 阶段检查，正式开工才检查全部应付款。
        const std::string origin = snapshot.value("origin", std::string("publisher"));
        if (origin == "custom") {
            if (!state.market.contains("custom_offer") || !state.market.at("custom_offer").is_object() ||
                state.market.at("custom_offer").value("id", std::string{}) != offer_id) {
                return encode(error_body("NOT_FOUND", "原创草稿不存在或已被消费"));
            }
            if (state.market.at("custom_offer").value("draft_status", std::string{}) != "valid") {
                return encode(error_body("INVALID_PHASE", "原创草稿已失效"));
            }
        } else {
            const int min_reputation = snapshot.value("min_reputation", 0);
            if (state.company.reputation < min_reputation) {
                return encode(error_body("MODE_NOT_ALLOWED", "声望不足，无法接取该企划"));
            }
            if (snapshot.contains("required_works") && snapshot.at("required_works").is_array()) {
                for (const auto& required : snapshot.at("required_works")) {
                    if (!required.is_string()) {
                        return encode(error_body("INVALID_STATE", "企划 required_works 必须是字符串数组"));
                    }
                    const std::string required_id = required.get<std::string>();
                    bool found = false;
                    if (state.archive.contains("works") && state.archive.at("works").is_array()) {
                        for (const auto& record : state.archive.at("works")) {
                            if (record.value("id", std::string{}) == required_id) found = true;
                        }
                    }
                    if (!found) {
                        return encode(error_body("MODE_NOT_ALLOWED", "缺少前置作品: " + required_id));
                    }
                }
            }
        }
        const auto& allowed = snapshot.at("allowed_modes");
        bool mode_allowed = false;
        for (const auto& item : allowed) {
            if (item.is_string() && item.get<std::string>() == mode) mode_allowed = true;
        }
        if (!mode_allowed) return encode(error_body("MODE_NOT_ALLOWED", "该企划不支持此合作模式"));

        int percent = 0;
        if (mode == "committee") {
            if (!request.contains("percent") || !request.at("percent").is_number_integer()) {
                return encode(error_body("INVALID_INPUT", "委员会模式必须给出 percent"));
            }
            percent = request.at("percent").get<int>();
            if (percent < 10 || percent > 100 || percent % 10 != 0) {
                return encode(error_body("INVALID_INPUT", "percent 必须是 10..100 的十位整数"));
            }
        } else if (request.contains("percent") && !request.at("percent").is_null() &&
                   request.at("percent").get<int>() != 0) {
            return encode(error_body("INVALID_INPUT", "承制模式不能设置投资比例"));
        }

        std::vector<std::string> committee_ids;
        if (request.contains("committee_partner_ids") && !request.at("committee_partner_ids").is_null()) {
            if (!request.at("committee_partner_ids").is_array()) {
                return encode(error_body("INVALID_INPUT", "committee_partner_ids 必须是数组"));
            }
            for (const auto& id : request.at("committee_partner_ids")) {
                if (!id.is_string()) return encode(error_body("INVALID_INPUT", "committee_partner_ids 只能包含字符串"));
                committee_ids.push_back(id.get<std::string>());
            }
        }
        if (mode == "contract" && !committee_ids.empty()) {
            return encode(error_body("INVALID_INPUT", "承制模式不需要委员会成员"));
        }
        if (mode == "committee" && committee_ids.empty()) {
            return encode(error_body("INVALID_INPUT", "委员会模式至少需要一名成员"));
        }

        // 委员会成员：不重复、渠道不重复、必须是已知伙伴
        std::vector<std::pair<std::string, std::string>> members;
        std::set<std::string> member_ids;
        std::set<std::string> member_channels;
        for (const auto& id : committee_ids) {
            if (!member_ids.insert(id).second) return encode(error_body("INVALID_INPUT", "委员会成员重复"));
            const Json* partner = find_partner(state, id);
            if (partner == nullptr) return encode(error_body("NOT_FOUND", "委员会成员不存在: " + id));
            if (partner->value("status", std::string("known")) != "known") {
                return encode(error_body("MODE_NOT_ALLOWED", "该伙伴当前不可合作: " + id));
            }
            if (!partner->contains("channels") || !partner->at("channels").is_array() ||
                partner->at("channels").empty()) {
                return encode(error_body("INVALID_STATE", "伙伴缺少渠道: " + id));
            }
            const std::string channel = partner->at("channels").at(0).get<std::string>();
            if (!member_channels.insert(channel).second) {
                return encode(error_body("INVALID_INPUT", "同一渠道不能重复进入委员会"));
            }
            members.emplace_back(id, channel);
        }
        std::sort(members.begin(), members.end(), [](const auto& a, const auto& b) {
            if (a.first != b.first) return a.first < b.first;
            return a.second < b.second;
        });

        const std::int64_t budget = snapshot.value("contract_budget", static_cast<std::int64_t>(0));
        const int duration = snapshot.value("duration_weeks", 0);
        const std::string blueprint_id = snapshot.value("blueprint_id", std::string{});
        const Json* blueprint = blueprint::find(blueprint_id);
        if (blueprint == nullptr) return encode(error_body("NOT_FOUND", "蓝图不存在: " + blueprint_id));
        const int episode_count = snapshot.value("episode_count", 0);
        if (episode_count != blueprint->value("episode_count", 0)) {
            return encode(error_body("INVALID_INPUT", "企划单集数与蓝图不一致"));
        }

        const std::int64_t total_investment = mode == "committee" ? budget * 2 : 0;
        const std::int64_t paid = total_investment * percent / 100;
        if (state.finance.balance < paid) {
            return encode(Json{{"error", {{"code", "INSUFFICIENT_FUNDS"},
                                          {"message", "现金不足以支付投资额"},
                                          {"gap", paid - state.finance.balance}}}});
        }

        const int week = state.company.week;
        const std::string work_id = next_id(state, "work_", static_cast<int>(state.works.size()));
        Project work;
        std::string error;
        if (!instantiate(*blueprint, work_id, week, duration, work, error)) {
            return encode(error_body("INVALID_INPUT", error));
        }
        const int scale = snapshot.value("workload_scale_permille", 1000);
        if (scale != 1000) {
            for_each_item(work, [scale](WorkItem& item, const std::string&, const std::string&) {
                item.work_total = std::max(1, (item.work_total * scale + 999) / 1000);
            });
        }
        work.offer = snapshot;
        work.mode = mode;
        work.channels.clear();
        for (const auto& channel : snapshot.at("channels_baseline")) {
            if (channel.is_string()) work.channels.push_back(channel.get<std::string>());
        }
        for (const auto& channel : member_channels) {
            if (std::find(work.channels.begin(), work.channels.end(), channel) == work.channels.end()) {
                work.channels.push_back(channel);
            }
        }
        work.investment = Json{{"percent", percent}, {"total", total_investment}, {"paid", paid}};
        work.opened_week = week;
        work.deadline_week = week + std::max(duration, 1);
        work.status = "producing";
        // INV-27：开工即定岗。这里先补监督再动账，避免失败时留下"已入账无监督"的半状态。
        // 人选按 §14.8 优先级从现有名册派生，不新增命令参数（M0 命令 2 签名不变）。
        if (!designate_supervisor(state, work)) {
            return encode(error_body("INVALID_STATE", "INV-27 开工需要一名合格监督，名册中无可用候选人"));
        }

        std::string committee_id;
        if (mode == "committee") {
            committee_id = next_id(state, "committee_", static_cast<int>(state.committees.size()));
            Json member_json = Json::array();
            for (const auto& [partner_id, channel] : members) {
                member_json.push_back(Json{{"partner_id", partner_id}, {"channel", channel}});
            }
            state.committees.push_back(Json{{"id", committee_id},
                                            {"work_id", work_id},
                                            {"members", member_json},
                                            {"formed_week", week},
                                            {"status", "active"},
                                            {"closed_week", nullptr}});
            work.committee_id = committee_id;
        }
        state.works.push_back(std::move(work));

        // 立项两笔账：合同预算入账；委员会模式下同时支付投资份额。
        if (budget > 0) {
            state.finance.entries.push_back(LedgerEntry{
                "w" + std::to_string(week) + ".contract." + work_id, week, work_id, "contract_received",
                budget, std::nullopt, offer_id});
            state.finance.balance += budget;
        }
        if (paid > 0) {
            state.finance.entries.push_back(LedgerEntry{
                "w" + std::to_string(week) + ".investment." + work_id, week, work_id, "investment_paid",
                -paid, committee_id.empty() ? std::nullopt : std::optional<std::string>(committee_id), offer_id});
            state.finance.balance -= paid;
        }

        // 消费企划
        if (state.market.contains("slots") && state.market.at("slots").is_array()) {
            Json remaining = Json::array();
            for (const auto& slot : state.market.at("slots")) {
                if (slot.is_object() && slot.value("id", std::string{}) == offer_id) continue;
                remaining.push_back(slot);
            }
            state.market["slots"] = std::move(remaining);
        }
        for (const char* key : {"custom_offer", "proposal"}) {
            if (state.market.contains(key) && state.market.at(key).is_object() &&
                state.market.at(key).value("id", std::string{}) == offer_id) {
                state.market[key] = nullptr;
            }
        }

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "立项后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"work_id", work_id},
                           {"committee_id", committee_id.empty() ? Json(nullptr) : Json(committee_id)}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string deliver_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        // 关闭后只允许 finalize_delivery / finalize_company（M0 §7 白名单）。
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已关闭，不能直接交付"));
        if (!request.contains("work_id") || !request.at("work_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        Project* work = find_work(state, work_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有 producing 项目可以交付"));
        if (state.company.week > work->deadline_week) {
            return encode(error_body("INVALID_PHASE", "已过截止：到期强制交付由周结算自动执行"));
        }

        std::vector<std::string> unmet;
        for_each_item(*work, [&unmet](const WorkItem& item, const std::string&, const std::string&) {
            if (item.is_gate && !item.delivered()) unmet.push_back(item.id);
        });
        if (!unmet.empty()) {
            std::string detail;
            for (std::size_t i = 0; i < unmet.size() && i < 3; ++i) {
                if (!detail.empty()) detail += ", ";
                detail += unmet[i];
            }
            return encode(Json{{"error", {{"code", "GATE_UNMET"},
                                          {"message", "门槛项未交付: " + detail},
                                          {"items", unmet}}}});
        }

        const auto outcome = settle_project(state, *work, "completed", false);
        if (!outcome.ok) return encode(error_body(outcome.code, outcome.message));
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "交付后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"report", outcome.report}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 命令 11：abort_work。违约扣罚与中止履历尚未冻结；
// 在契约补齐前原子拒绝，不能以 0 处罚 + penalty_pending 伪报完成。
std::string abort_work(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("work_id") || !request.at("work_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        Project* work = find_work(state, work_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有 producing 项目可以中止"));
        return encode(error_body("NOT_IMPLEMENTED",
                                 "abort_work 的违约扣罚公式与中止履历结构尚未冻结"));
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string buy_tv_service(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("work_id") || !request.at("work_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        }
        Project* work = find_work(state, request.at("work_id").get<std::string>());
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->mode != "committee") return encode(error_body("MODE_NOT_ALLOWED", "承制项目不能购买电视服务"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有 producing 项目可以购买"));
        // DEC-COMM-002：已有电视台委员会成员时默认获得强力播出，不再收费。
        bool tv_member = false;
        if (work->committee_id) {
            for (const auto& committee : state.committees) {
                if (!committee.is_object() || committee.value("id", std::string{}) != *work->committee_id) continue;
                for (const auto& member : committee.at("members")) {
                    const Json* partner = find_partner(state, member.value("partner_id", std::string{}));
                    if (partner != nullptr && partner->value("type", std::string{}) == "tv") tv_member = true;
                }
            }
        }
        if (tv_member) {
            return encode(error_body("MODE_NOT_ALLOWED", "已有电视台委员会成员，默认获得播出曝光，无需购买"));
        }
        if (work->tv_service.is_object() && work->tv_service.value("purchased", false)) {
            return encode(error_body("INVALID_PHASE", "电视服务已购买"));
        }
        // 玩家只承担自身投资比例，其余成员视为共同出资；结算时不重复扣款。
        const int percent = work->investment.value("percent", 0);
        const std::int64_t paid = kTvServiceFeeTotal * percent / 100;
        if (state.finance.balance < paid) return encode(error_body("INSUFFICIENT_FUNDS", "现金不足"));

        if (std::find(work->channels.begin(), work->channels.end(), "tv") == work->channels.end()) {
            work->channels.push_back("tv");
        }
        work->tv_service = Json{{"purchased", true},
                                {"channel", "tv"},
                                {"paid_week", state.company.week},
                                {"fee_total", kTvServiceFeeTotal},
                                {"paid", paid},
                                {"multiplier", kTvMultiplierPurchased}};
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(state.company.week) + ".tv_service." + work->id, state.company.week, work->id,
            "distribution", -paid, std::nullopt, "tv_service"});
        state.finance.balance -= paid;
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "购买后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"paid", paid},
                           {"multiplier", kTvMultiplierPurchased}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string request_extension(const std::string& input) {
    try {
        constexpr std::int64_t kExtensionFee = 250000;
        constexpr int kExtensionWeeks = 4;
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("work_id") || !request.at("work_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        }
        Project* work = find_work(state, request.at("work_id").get<std::string>());
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->mode != "committee") return encode(error_body("MODE_NOT_ALLOWED", "承制项目不能申请延期"));
        if (work->status != "producing") return encode(error_body("INVALID_PHASE", "只有 producing 项目可以延期"));
        if (!work->extension.is_null() && work->extension.value("used", false)) {
            return encode(error_body("INVALID_PHASE", "延期已使用"));
        }
        if (state.company.week > work->deadline_week) return encode(error_body("INVALID_PHASE", "已过截止"));
        if (state.finance.balance < kExtensionFee) return encode(error_body("INSUFFICIENT_FUNDS", "现金不足"));
        work->deadline_week += kExtensionWeeks;
        work->extension = Json{{"used", true}, {"weeks", kExtensionWeeks},
                               {"fee", kExtensionFee}, {"week", state.company.week}};
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(state.company.week) + ".extension." + work->id, state.company.week, work->id,
            "production", -kExtensionFee, std::nullopt, "extension"});
        state.finance.balance -= kExtensionFee;
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "延期后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"deadline_week", work->deadline_week}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

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
                // 带效果序号：同一选项同时带 cost 与 funds 效果时两条流水 id 不得相同（INV-02）。
                state.finance.entries.push_back(LedgerEntry{
                    "w" + std::to_string(week) + ".event." + event_id + "." + work.id + ".e" + std::to_string(index),
                    week, work.id, "events", -amount, std::nullopt, event_id});
                state.finance.balance -= amount;
            }
        }
    }
}

}  // namespace

// M0 §14.1：查看是独立原子动作。只把目标事件标记为 viewed=true，
// 不应用选项、不扣款、不移除 pending；已查看再调用按幂等成功处理。
std::string view_event(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("work_id") || !request.at("work_id").is_string() ||
            !request.contains("event_id") || !request.at("event_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 与 event_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        const std::string event_id = request.at("event_id").get<std::string>();
        PendingEvent* target = nullptr;
        for (auto& pending : state.events.pending) {
            if (pending.work_id == work_id && pending.event_id == event_id) {
                target = &pending;
                break;
            }
        }
        if (target == nullptr) return encode(error_body("NOT_FOUND", "待处理事件不存在"));
        if (target->viewed) {
            return encode(Json{{"state", state}, {"viewed", true}, {"already_viewed", true}});
        }
        target->viewed = true;
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "查看后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"viewed", true}, {"already_viewed", false}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

std::string resolve_event(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        // M0 命令 18（PR #94 冻结）：work_id / event_id / option_id 全部必填。
        if (!request.contains("work_id") || !request.at("work_id").is_string() ||
            !request.contains("event_id") || !request.at("event_id").is_string() ||
            !request.contains("option_id") || !request.at("option_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id、event_id 与 option_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        const std::string event_id = request.at("event_id").get<std::string>();
        const std::string option_id = request.at("option_id").get<std::string>();
        if (work_id.empty()) return encode(error_body("INVALID_INPUT", "work_id 不能为空"));


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
        const std::string owner_id = resolution.pending->work_id;
        Project* work = find_work(state, owner_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "事件归属项目不存在"));
        const std::string message = resolution.pending->name.empty() ? event_id : resolution.pending->name;

        const int week = state.company.week;
        if (!apply_event_option(state, *resolution.pending, *resolution.option, week, false)) {
            return encode(error_body("NOT_FOUND", "事件归属项目不存在"));
        }
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

// M0 命令 20：主动结束。锁 closing，未交付项目转 delivering，由 finalize_delivery 逐个结清。
std::string end_company(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") {
            return encode(error_body("COMPANY_ENDED", "公司已结束或正在关闭"));
        }
        // 关闭会把在制项目转 delivering，pending 事件将失去归属；必须先逐条处理。
        if (!state.events.pending.empty()) {
            return encode(error_body("INVALID_PHASE", "仍有待处理事件，处理完才能结束公司"));
        }
        Json closing_projects = Json::array();
        for (const auto& work : state.works) closing_projects.push_back(work.id);

        const auto closing = close_company(state, "voluntary");
        if (!closing.ok) return encode(error_body(closing.code, closing.message));

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "关闭后状态非法: " + errors.front()));
        return encode(Json{{"state", state},
                           {"report", Json{{"status", state.company.status},
                                           {"end_reason", state.company.end_reason.value_or("voluntary")},
                                           {"closing_projects", closing_projects}}}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 命令 21：关闭路径结算。公司 closing 时逐个结清 delivering 项目；
// 最后一个项目结清后公司转 ended，供 finalize_company 生成结局。
std::string finalize_delivery(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status == "ended") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (state.company.status != "closing") {
            return encode(error_body("INVALID_PHASE", "只有 closing 状态可以调用 finalize_delivery"));
        }
        if (!request.contains("work_id") || !request.at("work_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "work_id 必须是字符串"));
        }
        const std::string work_id = request.at("work_id").get<std::string>();
        Project* work = find_work(state, work_id);
        if (work == nullptr) return encode(error_body("NOT_FOUND", "项目不存在"));
        if (work->status != "delivering") {
            return encode(error_body("INVALID_PHASE", "只有 delivering 项目可以在关闭后结清"));
        }
        const std::string reason =
            work->delivery.is_object() ? work->delivery.value("reason", std::string("company_closed")) : std::string("company_closed");
        // 关闭路径的“强制”与否只看门槛是否达成：已完成的作品仍按正常交付计价，
        // 只有未达门槛才吃强制交付的商业折扣与扣罚。
        const bool forced = !work->deliverable();

        const auto outcome = settle_project(state, *work, reason, forced);
        if (!outcome.ok) return encode(error_body(outcome.code, outcome.message));

        if (state.works.empty()) state.company.status = "ended";
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "结清后状态非法: " + errors.front()));
        return encode(Json{{"state", state},
                           {"report", outcome.report},
                           {"company_status", state.company.status}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 命令 22：生成公司结局，只执行一次。归档到 archive.company_result。
std::string finalize_company(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "ended") {
            return encode(error_body("INVALID_PHASE", "公司尚未结束"));
        }
        if (!state.works.empty()) {
            return encode(error_body("INVALID_PHASE", "仍有未结清项目"));
        }
        if (!state.archive.is_object()) return encode(error_body("INVALID_STATE", "archive 必须是对象"));
        if (state.archive.contains("company_result") && !state.archive.at("company_result").is_null()) {
            return encode(error_body("INVALID_PHASE", "公司结局已生成"));
        }

        const std::string reason = state.company.end_reason.value_or("voluntary");
        std::int64_t quality_sum = 0;
        int total_projects = 0;
        int best_score = -1;
        std::string best_work_id;
        std::string best_work_name;
        int unfinished = 0;
        if (state.archive.contains("works") && state.archive.at("works").is_array()) {
            for (const auto& record : state.archive.at("works")) {
                const int score = record.value("quality_score", 0);
                quality_sum += score;
                ++total_projects;
                if (score > best_score) {
                    best_score = score;
                    best_work_id = record.value("id", std::string{});
                    best_work_name = record.value("name", std::string{});
                }
                if (record.value("end_reason", std::string{}) != "completed") ++unfinished;
            }
        }
        // [PLACEHOLDER] 公司评级复用作品分数线，待数值标定。
        const int average = total_projects > 0 ? static_cast<int>(quality_sum / total_projects) : 0;
        const std::string rating = rating_of(average);

        Json highlights = Json::array();
        Json negatives = Json::array();
        if (!best_work_id.empty()) {
            highlights.push_back("最佳作品：" + best_work_name + "（" + rating_of(best_score) + "）");
        }
        if (total_projects > 0 && average >= 75) highlights.push_back("作品平均质量达到 A 档");
        if (reason == "bankrupt") negatives.push_back("资金链断裂，公司破产清算");
        if (unfinished > 0) negatives.push_back(std::to_string(unfinished) + " 部作品未正常完成");

        Json result = Json{{"reason", reason},
                           {"weeks", state.company.week},
                           {"final_funds", state.finance.balance},
                           {"net_cash_change", state.finance.balance - state.finance.opening_funds},
                           {"total_projects", total_projects},
                           {"best_work_id", best_work_id.empty() ? Json(nullptr) : Json(best_work_id)},
                           {"rating", rating},
                           {"highlights", highlights},
                           {"negatives", negatives}};
        state.archive["company_result"] = result;

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "结局生成后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"result", result}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

}  // namespace apc::v4
