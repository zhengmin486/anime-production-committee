#include "apc/v4/runtime.hpp"

#include <algorithm>
#include <cstdio>
#include <cstdint>
#include <initializer_list>
#include <limits>
#include <map>
#include <numeric>
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
    require(state, "suppliers", "state");
    require(state, "contracts", "state");
    require(state, "partners", "state");
    require(state, "committees", "state");
    require(state, "finance", "state");
    require(state, "events", "state");
    require(state, "archive", "state");
    require(state.at("archive"), "works", "archive");
    require(state.at("archive"), "series", "archive");
    require(state.at("archive"), "company_result", "archive");
    if (!state.at("archive").at("works").is_array() || !state.at("archive").at("series").is_array()) {
        throw Json::type_error::create(302, "archive.works/series 必须是数组", nullptr);
    }
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
    if (!state.at("staff").is_array() || !state.at("works").is_array() ||
        !state.at("suppliers").is_array() || !state.at("contracts").is_array() ||
        !state.at("partners").is_array() || !state.at("committees").is_array()) {
        throw Json::type_error::create(
            302,
            "staff / works / suppliers / contracts / partners / committees 必须是数组",
            nullptr
        );
    }
    const auto require_staff = [&require](const Json& member, const std::string& where) {
        require(member, "id", where);
        require(member, "name", where);
        require(member, "role", where);
        require(member, "employment", where);
        require(member, "abilities", where);
        require(member, "experience", where);
        require(member, "potential", where);
        require(member, "revealed_potential", where);
        require(member, "talent_type", where);
        require(member, "signing_fee", where);
        require(member, "weekly_salary", where);
        // fatigue / morale 会直接影响周结算产能；不能让反序列化默认值掩盖坏存档。
        require(member, "fatigue", where);
        require(member, "morale", where);
        require(member, "departure_warning", where);
        require(member, "assignment_work_id", where);
    };
    for (const auto& member : state.at("staff")) require_staff(member, "staff[]");
    // 招聘聚合（§14.13.1）：与 staff 名册分离，但字段同样必填——缺键会被
    // from_json 读成空池/零保底，等于静默改写招聘事实。
    require(state, "recruitment", "state");
    const Json& recruitment = state.at("recruitment");
    require(recruitment, "pool", "recruitment");
    require(recruitment, "pity", "recruitment");
    require(recruitment, "last_scout_week", "recruitment");
    if (!recruitment.at("pool").is_array()) {
        throw Json::type_error::create(302, "recruitment.pool 必须是数组", nullptr);
    }
    require(recruitment.at("pity"), "since_sr", "recruitment.pity");
    require(recruitment.at("pity"), "since_ssr", "recruitment.pity");
    if (!recruitment.at("pity").at("since_sr").is_number_integer() ||
        !recruitment.at("pity").at("since_ssr").is_number_integer()) {
        throw Json::type_error::create(302, "recruitment.pity 计数必须是整数", nullptr);
    }
    if (!recruitment.at("last_scout_week").is_null() && !recruitment.at("last_scout_week").is_number_integer()) {
        throw Json::type_error::create(302, "recruitment.last_scout_week 必须是整数或 null", nullptr);
    }
    for (const auto& candidate : recruitment.at("pool")) {
        require(candidate, "staff", "recruitment.pool[]");
        require(candidate, "expires_week", "recruitment.pool[]");
        require(candidate, "origin", "recruitment.pool[]");
        if (!candidate.at("expires_week").is_null() && !candidate.at("expires_week").is_number_integer()) {
            throw Json::type_error::create(302, "recruitment.pool[].expires_week 必须是整数或 null", nullptr);
        }
        if (!candidate.at("origin").is_string()) {
            throw Json::type_error::create(302, "recruitment.pool[].origin 必须是字符串", nullptr);
        }
        require_staff(candidate.at("staff"), "recruitment.pool[].staff");
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

// ---- 招聘（M0 §14.13.1 / DEC-STAFF-006/007）----
// 生成逻辑逐位镜像 scripts/lib/recruit-oracle.mjs（规则样本）：坐标式随机、
// 无计数器入档；保底计数只存 recruitment.pity。数值全部 [PLACEHOLDER]，
// 由 #59/#58 标定；改规则先改用例与 M0 §14.13，再改这里。
constexpr std::int64_t kScoutFee = 50000;          // [PLACEHOLDER]
constexpr int kScoutCount = 1;                     // [PLACEHOLDER]
constexpr int kScoutWindowWeeks = 2;               // [PLACEHOLDER] 讨论范围 1–2 周
constexpr int kPoolCap = 6;                        // [PLACEHOLDER] 常规池上限
constexpr int kRotateCount = 2;                    // [PLACEHOLDER] 每周部分轮换数
constexpr int kSsrRate = 30;                       // [PLACEHOLDER] 千分比
constexpr int kSrRate = 150;                       // [PLACEHOLDER] 千分比
constexpr int kPitySr = 10;                        // [PLACEHOLDER] 未冻结
constexpr int kPitySsr = 50;                       // [PLACEHOLDER] 未冻结
constexpr int kSigningFeePerAbility = 1000;        // [PLACEHOLDER]
constexpr int kSalaryBase = 20000;                 // [PLACEHOLDER]
constexpr int kSalaryPerPrimary = 300;             // [PLACEHOLDER]
// 设施扩建尚未实现，当前采用 #63 已确认的开局正式编制。
constexpr int kCoreStaffCapacityBase = 4;

constexpr const char* kProfessions[8] = {"作画", "演出", "脚本", "摄影", "监督", "音乐", "声优", "美术"};
constexpr const char* kTalentArchetypes[8] = {"burst_drain", "steady_floor", "mentor_boost", "team_smooth",
                                              "fast_push", "deadline_calm", "slow_polish", "genre_specialist"};

bool is_profession(const std::string& role) {
    for (const char* profession : kProfessions) {
        if (role == profession) return true;
    }
    return false;
}

// 职业主能力走 kernel::staff_specialty 的同一张映射表（DEC-STAFF-006 提案），
// 不在 runtime 另写一份，避免两处漂移。
std::string profession_ability(const std::string& profession) {
    Staff probe;
    probe.role = profession;
    return kernel::staff_specialty(probe);
}

std::uint32_t purpose_recruit() { return kernel::hash_text("recruit"); }
std::uint32_t purpose_recruit_regular() { return kernel::hash_text("recruit_regular"); }
std::uint32_t purpose_recruit_scout() { return kernel::hash_text("recruit_scout"); }

std::string hex32(std::uint32_t value) {
    char buffer[9];
    std::snprintf(buffer, sizeof(buffer), "%x", value);
    return std::string(buffer);
}

struct GeneratedCandidate {
    Staff staff;
    std::string tier;   // n / sr / ssr（只用于保底推进，不入档）
};

// 候选内部子坐标 index*16+k（k=0..15），与 oracle generateCandidate 逐位一致。
GeneratedCandidate generate_candidate(std::uint32_t seed, int week, int index, std::uint32_t purpose,
                                      const std::optional<std::string>& forced_profession, const Pity& pity) {
    const auto sub = [&](int k) {
        return kernel::draw(seed, week, kernel::Stream::staff, purpose,
                            static_cast<std::uint32_t>(index * 16 + k));
    };
    GeneratedCandidate result;
    Staff& member = result.staff;
    member.role = forced_profession ? *forced_profession
                                    : kProfessions[sub(1) % 8];
    const std::string primary_ability = profession_ability(member.role);

    const std::uint32_t roll = sub(0) % 1000;
    if (roll < static_cast<std::uint32_t>(kSsrRate) || pity.since_ssr >= kPitySsr) {
        result.tier = "ssr";
    } else if (roll < static_cast<std::uint32_t>(kSrRate) || pity.since_sr >= kPitySr) {
        result.tier = "sr";
    } else {
        result.tier = "n";
    }
    const int primary_base = result.tier == "ssr" ? 65 : (result.tier == "sr" ? 45 : 20);
    const int primary_span = result.tier == "ssr" ? 36 : 31;
    const int primary = primary_base + static_cast<int>(sub(2) % static_cast<std::uint32_t>(primary_span));

    int ability_sum = 0;
    for (int i = 0; i < kAbilityCount; ++i) {
        const bool is_primary = kAbilities[static_cast<std::size_t>(i)] == primary_ability;
        const int value = is_primary ? primary : 5 + static_cast<int>(sub(3 + i) % 41);
        member.abilities[static_cast<std::size_t>(i)] = value;
        ability_sum += value;
        // 注意：潜力子坐标固定 k=9（与 oracle 一致），不按能力维度展开。
        const int gain = is_primary ? 10 + static_cast<int>(sub(9) % 31) : static_cast<int>(sub(9) % 41);
        member.potential[static_cast<std::size_t>(i)] = std::min(100, value + gain);
    }
    member.id = "cand_" + hex32(purpose) + "_" + std::to_string(week) + "_" + std::to_string(index);
    member.name = member.role + "_" + std::to_string(week) + "_" + std::to_string(index);
    member.employment = "core";
    member.talent_type = kTalentArchetypes[sub(15) % 8];
    member.signing_fee = ability_sum * kSigningFeePerAbility;
    member.weekly_salary = kSalaryBase + primary * kSalaryPerPrimary;
    member.fatigue = 0;
    member.morale = 60;
    return result;
}

Pity advance_pity(const Pity& pity, const std::string& tier) {
    Pity next;
    next.since_sr = tier == "n" ? pity.since_sr + 1 : 0;
    next.since_ssr = tier == "ssr" ? 0 : pity.since_ssr + 1;
    return next;
}

// 窗口语义：expires_week 是首个不可签约周，进入该周开局即移除；regular 不受影响。
std::vector<PoolCandidate> expire_candidates(const std::vector<PoolCandidate>& pool, int week) {
    std::vector<PoolCandidate> alive;
    for (const auto& candidate : pool) {
        if (candidate.origin == "scout" && candidate.expires_week && week >= *candidate.expires_week) continue;
        alive.push_back(candidate);
    }
    return alive;
}

// 常规池部分轮换：先到期清理，再确定性选 kRotateCount 个常规槽替换；
// 未选中候选逐字段不变；scout 候选不参与轮换。轮换生成不带保底计数（与 oracle 一致）。
std::vector<PoolCandidate> rotate_pool(const std::vector<PoolCandidate>& pool, std::uint32_t seed, int week) {
    const auto alive = expire_candidates(pool, week);
    std::vector<PoolCandidate> regulars;
    std::vector<PoolCandidate> scouts;
    for (const auto& candidate : alive) {
        if (candidate.origin == "regular") regulars.push_back(candidate);
        else scouts.push_back(candidate);
    }
    std::vector<int> available(regulars.size());
    std::iota(available.begin(), available.end(), 0);
    std::vector<int> slots;
    const int rotate = std::min(kRotateCount, static_cast<int>(regulars.size()));
    for (int i = 0; i < rotate; ++i) {
        const int roll = static_cast<int>(kernel::draw_below(seed, week, kernel::Stream::staff, purpose_recruit_regular(),
                                                             static_cast<std::uint32_t>(i),
                                                             static_cast<std::uint32_t>(available.size())));
        slots.push_back(available[static_cast<std::size_t>(roll)]);
        available.erase(available.begin() + roll);
    }
    std::sort(slots.begin(), slots.end());
    std::vector<PoolCandidate> kept;
    for (std::size_t i = 0; i < regulars.size(); ++i) {
        if (std::find(slots.begin(), slots.end(), static_cast<int>(i)) == slots.end()) kept.push_back(regulars[i]);
    }
    for (const int slot : slots) {
        auto generated = generate_candidate(seed, week, slot, purpose_recruit(), std::nullopt, Pity{});
        PoolCandidate candidate;
        candidate.staff = std::move(generated.staff);
        candidate.origin = "regular";
        kept.push_back(std::move(candidate));
    }
    if (kept.size() > static_cast<std::size_t>(kPoolCap)) kept.resize(static_cast<std::size_t>(kPoolCap));
    kept.insert(kept.end(), scouts.begin(), scouts.end());
    return kept;
}

// 开局常规池：第 0 周 purpose=recruit、index 0..pool_cap-1，保底计数从零起。
Recruitment initial_recruitment(std::uint32_t seed) {
    Recruitment recruitment;
    for (int i = 0; i < kPoolCap; ++i) {
        auto generated = generate_candidate(seed, 0, i, purpose_recruit(), std::nullopt, Pity{});
        PoolCandidate candidate;
        candidate.staff = std::move(generated.staff);
        candidate.origin = "regular";
        recruitment.pool.push_back(std::move(candidate));
    }
    return recruitment;
}

int core_staff_capacity(const GameState& state) {
    (void)state;   // 设施等级与升级触发尚未实现，暂按开局编制 4 人执行。
    return kCoreStaffCapacityBase;
}

int core_staff_count(const GameState& state) {
    int count = 0;
    for (const auto& member : state.staff) {
        if (member.employment == "core") ++count;
    }
    return count;
}

const PoolCandidate* find_candidate(const GameState& state, const std::string& staff_id) {
    for (const auto& candidate : state.recruitment.pool) {
        if (candidate.staff.id == staff_id) return &candidate;
    }
    return nullptr;
}

// ---------------- 市场生命周期（M0 §14.13.2 / Q4）----------------
// 企划市场固定四槽、每周只补空槽，并保障至少两个可立即承接的企划。
// 锁定期两周、定金 5%/10% × deposit_basis（生成时固定）、锁定期内签约 100% 抵扣、
// 到期定金不退为冻结语义；有效期分布为 [PLACEHOLDER]（#59/M7）。
// 初始 4 槽沿用 M1 fixture 目录（内容待 #59 标定，现有验收用例依赖），生命周期字段按冻结契约补齐；
// 每周自然补充走坐标生成，与 scripts/lib/market-oracle.mjs generateOffer 逐位一致。
// 企划 id 含 week+index 坐标，终身唯一由构造保证；锁定历史不得被槽位刷新洗掉（M0 §14.13.2）。

constexpr int kMarketCap = 4;                 // DEC-MARKET-001：企划市场固定四槽
constexpr int kMinimumAcceptableOffers = 2;   // DEC-MARKET-001：至少两个可立即承接
constexpr int kExpiryMin = 1;                 // [PLACEHOLDER] STATUS-49 确认范围 1–3 周
constexpr int kExpiryMax = 3;
constexpr int kLockWeeks = 2;                 // Q4 冻结：W/W+1 有效，W+2 开局失效
constexpr int kDepositRegularPermille = 50;   // §14.13.2 冻结：普通企划 5%
constexpr int kDepositIpPermille = 100;       // §14.13.2 冻结：IP 上门 10%
constexpr int kFixtureExpiresWeek = 3;        // [PLACEHOLDER] fixture 目录到期周，待 #59 标定

const char* const kOfferGenres[6] = {"action", "fantasy", "scifi", "daily", "idol", "sports"};
// 非 TV 蓝图尚未注册；生成器暂只产出可立项的 TV 企划，规模词表仍保留给其他来源。
const char* const kGeneratedOfferScales[1] = {"tv"};

std::uint32_t purpose_offer_gen() { return kernel::hash_text("offer_gen"); }

int episode_count_of_scale(const std::string& scale) {
    if (scale == "short") return 1;
    if (scale == "ova") return 2;
    if (scale == "movie") return 1;
    return 12;
}

// 候选内子坐标 index*16+k（k=0..15），与 oracle generateOffer 逐位一致。
Json generate_offer(std::uint32_t seed, int week, int index, const std::string& source_type,
                    int reputation_cap = 120) {
    const auto sub = [&](int k) {
        return kernel::draw(seed, week, kernel::Stream::market, purpose_offer_gen(),
                            static_cast<std::uint32_t>(index * 16 + k));
    };
    const std::string genre = kOfferGenres[sub(0) % 6];
    const std::string scale = kGeneratedOfferScales[0];
    const std::int64_t budget = static_cast<std::int64_t>(500 + sub(2) % 1500) * 10000;
    const std::string id = "offer_" + hex32(purpose_offer_gen()) + "_" + std::to_string(week) + "_" + std::to_string(index);
    return Json{{"id", id},
                {"name", genre + "_" + scale + "_" + std::to_string(week) + "_" + std::to_string(index)},
                {"source", "market"},
                {"genre", genre},
                {"scale", scale},
                {"contract_budget", budget},
                {"duration_weeks", 12 + static_cast<int>(sub(3) % 27)},
                {"target_quality", 40 + static_cast<int>(sub(4) % 51)},
                {"audience_base", 1000 + static_cast<int>(sub(5) % 9000)},
                {"commercial_potential", static_cast<int>(sub(6) % 101)},
                {"channel_potentials", Json::object()},
                {"channels_baseline", Json::array({"bd"})},
                {"allowed_modes", Json::array({"contract", "committee"})},
                {"committee_candidates", Json::array()},
                {"min_reputation", std::min(static_cast<int>(sub(7) % 120), reputation_cap)},
                {"required_works", Json::array()},
                {"previous_work_id", nullptr},
                {"blueprint_id", "tv_standard"},
                {"episode_count", episode_count_of_scale(scale)},
                {"workload_scale_permille", 1000},
                {"origin", "market"},
                {"style", "standard"},
                {"offer_source_type", source_type},
                {"deposit_basis", budget},
                {"expires_week", week + kExpiryMin + static_cast<int>(sub(8) % static_cast<std::uint32_t>(kExpiryMax - kExpiryMin + 1))},
                {"locked_until", nullptr},
                {"lock_used", false},
                {"deposit_paid", 0}};
}

// 定金档位由来源分类决定（玩家不可切换）；基数取生成时固定的 deposit_basis，
// 后续预算调整不追溯。先除后乘，避免大基数在乘法阶段溢出；整数千分比向下取整。
std::int64_t offer_deposit_amount(const Json& offer) {
    const std::int64_t basis = offer.value("deposit_basis", static_cast<std::int64_t>(0));
    if (basis <= 0) return 0;
    const int rate = offer.value("offer_source_type", std::string("market")) == "ip_visit"
                         ? kDepositIpPermille
                         : kDepositRegularPermille;
    constexpr std::int64_t divisor = 1000;
    return (basis / divisor) * rate + (basis % divisor) * rate / divisor;
}

std::string offer_deposit_entry_id(int week, const std::string& offer_id) {
    return "w" + std::to_string(week) + ".production." + offer_id + ".deposit";
}

bool is_offer_deposit_entry(const LedgerEntry& entry, const std::string& offer_id) {
    if (entry.category == "production" && !entry.work_id.has_value() &&
        entry.counterparty && *entry.counterparty == offer_id &&
        entry.memo == "定金锁定（到期不退）") {
        return true;
    }
    const std::string marker = ".production." + offer_id + ".deposit";
    return entry.id.find(marker) != std::string::npos;
}

std::vector<const LedgerEntry*> offer_deposit_entries(const GameState& state, const std::string& offer_id) {
    std::vector<const LedgerEntry*> entries;
    for (const auto& entry : state.finance.entries) {
        if (is_offer_deposit_entry(entry, offer_id)) entries.push_back(&entry);
    }
    return entries;
}

bool offer_in_lock(const Json& offer, int week) {
    return offer.contains("locked_until") && offer.at("locked_until").is_number_integer() &&
           week < offer.at("locked_until").get<int>();
}

// 周结算市场步（开局边界）：先释放到期锁定（定金不退），再自然过期（锁定期内受保护），
// 最后补满空槽——不是清空重抽，存活企划逐字段不变。
Json weekly_market_step(const Json& market, std::uint32_t seed, int week, int reputation) {
    Json next = market;
    Json slots = Json::array();
    if (market.contains("slots") && market.at("slots").is_array()) {
        for (const auto& offer : market.at("slots")) {
            if (!offer.is_object()) continue;
            const bool has_lock = offer.contains("locked_until") && offer.at("locked_until").is_number_integer();
            if (has_lock && week >= offer.at("locked_until").get<int>()) continue;
            if (week >= offer.value("expires_week", kMaxWeek) && !offer_in_lock(offer, week)) continue;
            slots.push_back(offer);
        }
    }
    int acceptable = 0;
    for (const auto& offer : slots) {
        if (offer.value("min_reputation", 0) <= reputation) ++acceptable;
    }
    const int free = std::max(0, kMarketCap - static_cast<int>(slots.size()));
    for (int i = 0; i < free; ++i) {
        const int cap = acceptable < kMinimumAcceptableOffers ? reputation : 120;
        slots.push_back(generate_offer(seed, week, i, "market", cap));
        if (cap <= reputation) ++acceptable;
    }
    next["slots"] = std::move(slots);
    next["refresh_week"] = week;
    return next;
}


}  // namespace

bool archive_exact_fields(const Json& value, std::initializer_list<const char*> fields) {
    if (!value.is_object() || value.size() != fields.size()) return false;
    return std::all_of(fields.begin(), fields.end(), [&value](const char* field) { return value.contains(field); });
}

bool archive_text(const Json& value) { return value.is_string() && !value.get_ref<const std::string&>().empty(); }

bool archive_integer(const Json& value, std::int64_t low, std::int64_t high = std::numeric_limits<std::int64_t>::max()) {
    if (!value.is_number_integer()) return false;
    if (value.is_number_unsigned()) {
        const auto number = value.get<std::uint64_t>();
        return number <= static_cast<std::uint64_t>(high) && static_cast<std::int64_t>(number) >= low;
    }
    const auto number = value.get<std::int64_t>();
    return number >= low && number <= high;
}

bool archive_add(std::int64_t& total, std::int64_t amount) {
    if (amount < 0 || total > std::numeric_limits<std::int64_t>::max() - amount) return false;
    total += amount;
    return true;
}

std::string archive_rating_of(int score) {
    if (score >= 85) return "S";
    if (score >= 75) return "A";
    if (score >= 65) return "B";
    if (score >= 50) return "C";
    return "D";
}

bool archive_quality(const Json& value, const std::string& path, const std::function<void(const std::string&)>& error) {
    if (!archive_exact_fields(value, {"dims", "mean"})) {
        error("INV-22 " + path + " 必须精确包含 dims/mean");
        return false;
    }
    const Json& dims = value.at("dims");
    if (!archive_exact_fields(dims, {"story", "direction", "drawing", "animation", "art", "sound"})) {
        error("INV-22 " + path + ".dims 六维字段不完整或含未知字段");
        return false;
    }
    int sum = 0;
    for (int i = 0; i < kDimensionCount; ++i) {
        const Json& dimension = dims.at(kDimensions[static_cast<std::size_t>(i)]);
        if (!archive_integer(dimension, 0, 100)) {
            error("INV-22 " + path + ".dims 必须是 0..100 整数");
            return false;
        }
        sum += dimension.get<int>();
    }
    return archive_integer(value.at("mean"), 0, 100) && value.at("mean").get<int>() == (sum + 3) / 6;
}

bool archive_string_array(const Json& value, bool nonempty, const std::string& path,
                          const std::function<void(const std::string&)>& error) {
    if (!value.is_array() || (nonempty && value.empty())) {
        error("INV-22 " + path + " 必须是" + std::string(nonempty ? "非空" : "") + "数组");
        return false;
    }
    for (const auto& item : value) {
        if (!archive_text(item)) {
            error("INV-22 " + path + " 含空字符串");
            return false;
        }
    }
    return true;
}

bool archive_work_record(const Json& record, std::int64_t company_week,
                         const std::function<void(const std::string&, const char*)>& claim_id,
                         const std::function<void(const std::string&)>& error) {
    const std::string path = "archive.works[]";
    if (!archive_exact_fields(record, {"id", "ip_id", "offer_id", "name", "source", "genre", "scale", "mode",
                                       "investment_percent", "start_week", "end_week", "end_reason", "status", "forced",
                                       "gate_completion_permille", "aborted_week", "penalty_paid", "quality", "quality_score", "rating",
                                       "commercial_revenue", "bd_gross", "bd_revenue", "committee_pool", "investor_share",
                                       "company_received", "finance_summary", "channel_breakdown", "episodes", "team",
                                       "rules_status"})) {
        error("INV-22 " + path + " 根字段缺失或含未知字段");
        return false;
    }
    if (!archive_text(record.at("id"))) {
        error("INV-22 archive.works[].id 不能为空");
        return false;
    }
    const std::string id = record.at("id").get<std::string>();
    claim_id(id, "archive");
    for (const char* key : {"offer_id", "name", "genre"}) {
        if (!archive_text(record.at(key))) { error("INV-22 " + path + "." + key + " 不能为空"); return false; }
    }
    if (!(record.at("ip_id").is_null() || archive_text(record.at("ip_id")))) {
        error("INV-22 archive.works[].ip_id 必须是非空字符串或 null: " + id);
        return false;
    }
    if (!archive_text(record.at("source")) || !one_of_text(record.at("source").get<std::string>(),
        {"publisher", "studio", "manga", "light_novel", "game", "original"})) {
        error("INV-22 archive.works[].source 非法: " + id);
        return false;
    }
    if (!archive_text(record.at("scale")) || !one_of_text(record.at("scale").get<std::string>(), {"ova", "short", "tv", "movie"})
        || !archive_text(record.at("mode")) || !one_of_text(record.at("mode").get<std::string>(), {"contract", "committee"})) {
        error("INV-22 archive.works[].scale/mode 非法: " + id);
        return false;
    }
    if (!archive_integer(record.at("investment_percent"), 0, 100)
        || (record.at("mode") == "contract" ? record.at("investment_percent").get<int>() != 0
            : record.at("investment_percent").get<int>() < 10 || record.at("investment_percent").get<int>() % 10 != 0)) {
        error("INV-22 archive.works[].investment_percent 非法: " + id);
        return false;
    }
    if (!archive_integer(record.at("start_week"), 0, company_week) || !archive_integer(record.at("end_week"), 0, company_week)
        || record.at("end_week").get<std::int64_t>() < record.at("start_week").get<std::int64_t>()) {
        error("INV-22 archive.works[].周数越界或倒序: " + id);
        return false;
    }
    if (!archive_text(record.at("end_reason")) || !archive_text(record.at("status"))) {
        error("INV-22 archive.works[].end_reason/status 非法: " + id);
        return false;
    }
    const std::string end_reason = record.at("end_reason").get<std::string>();
    const std::string status = record.at("status").get<std::string>();
    const bool aborted = end_reason == "aborted";
    if (!one_of_text(end_reason, {"completed", "deadline", "company_closed", "aborted"})
        || !one_of_text(status, {"DELIVERED", "ABORTED"}) || !record.at("forced").is_boolean()
        || !archive_integer(record.at("gate_completion_permille"), 0, 1000)
        || !archive_integer(record.at("penalty_paid"), 0)
        || (aborted ? (status != "ABORTED" || !archive_integer(record.at("aborted_week"), 0, company_week)
                       || record.at("aborted_week").get<std::int64_t>() != record.at("end_week").get<std::int64_t>())
                    : (status != "DELIVERED" || !record.at("aborted_week").is_null()))
        || (end_reason == "completed" && (record.at("forced").get<bool>() || record.at("gate_completion_permille").get<int>() != 1000))) {
        error("INV-22 archive.works[].结束状态非法: " + id);
        return false;
    }
    if (!archive_quality(record.at("quality"), path + ".quality", error) || !archive_integer(record.at("quality_score"), 0, 100)
        || !archive_text(record.at("rating")) || record.at("rating").get<std::string>() != archive_rating_of(record.at("quality_score").get<int>())) {
        error("INV-22 archive.works[].quality/rating 非法: " + id);
        return false;
    }
    for (const char* key : {"commercial_revenue", "bd_gross", "bd_revenue", "committee_pool", "investor_share", "company_received"}) {
        if (!archive_integer(record.at(key), 0)) { error("INV-22 " + path + "." + key + " 必须为非负整数"); return false; }
    }

    const Json& finance = record.at("finance_summary");
    if (!archive_exact_fields(finance, {"contract_received", "contract_refund", "investment_paid", "commercial_share", "bd_revenue",
                                        "success_reward", "penalty", "costs", "total_costs", "profit"})) {
        error("INV-22 archive.works[].finance_summary 根字段缺失或含未知字段: " + id);
        return false;
    }
    for (const char* key : {"contract_received", "contract_refund", "investment_paid", "commercial_share", "bd_revenue", "success_reward", "penalty", "total_costs"}) {
        if (!archive_integer(finance.at(key), 0)) { error("INV-22 archive.works[].finance_summary." + std::string(key) + " 必须为非负整数"); return false; }
    }
    if (finance.at("penalty").get<std::int64_t>() != record.at("penalty_paid").get<std::int64_t>()) {
        error("INV-22 archive.works[].penalty_paid 与 finance_summary.penalty 不一致: " + id);
        return false;
    }
    if (!finance.at("profit").is_number_integer() || finance.at("bd_revenue").get<std::int64_t>() > finance.at("commercial_share").get<std::int64_t>()) {
        error("INV-22 archive.works[].finance_summary.profit/bd_revenue 非法: " + id);
        return false;
    }
    static const std::set<std::string> cost_categories{"salary", "production", "temporary", "outsourcing", "events",
                                                        "extension", "distribution", "penalty", "development"};
    if (!finance.at("costs").is_object()) { error("INV-22 archive.works[].finance_summary.costs 必须是对象"); return false; }
    std::int64_t costs_sum = 0;
    for (const auto& [category, amount] : finance.at("costs").items()) {
        if (cost_categories.find(category) == cost_categories.end() || !archive_integer(amount, 0)) {
            error("INV-22 archive.works[].finance_summary.costs 含未知类目或非法金额: " + id);
            return false;
        }
        if (!archive_add(costs_sum, amount.get<std::int64_t>())) {
            error("INV-22 archive.works[].finance_summary.costs 合计溢出: " + id);
            return false;
        }
    }
    auto commercial_share = finance.at("commercial_share").get<std::int64_t>();
    const auto success_reward = finance.at("success_reward").get<std::int64_t>();
    const auto total_costs = finance.at("total_costs").get<std::int64_t>();
    auto investment_paid = finance.at("investment_paid").get<std::int64_t>();
    auto contract_received = finance.at("contract_received").get<std::int64_t>();
    const auto contract_refund = finance.at("contract_refund").get<std::int64_t>();
    auto invested_cost = investment_paid;
    auto contract_total = contract_received;
    if (!archive_add(contract_received, commercial_share) || !archive_add(contract_received, success_reward)
        || !archive_add(invested_cost, total_costs) || !archive_add(contract_total, contract_refund)) {
        error("INV-22 archive.works[].finance_summary 对账溢出: " + id);
        return false;
    }
    auto company_total = commercial_share;
    if (costs_sum != total_costs || finance.at("profit").get<std::int64_t>() != contract_received - contract_refund - investment_paid - total_costs
        || !archive_add(company_total, success_reward) || company_total != record.at("company_received").get<std::int64_t>()) {
        error("INV-22 archive.works[].finance_summary 对账失败: " + id);
        return false;
    }

    const Json& channels = record.at("channel_breakdown");
    if (!channels.is_array()) { error("INV-22 archive.works[].channel_breakdown 必须是数组"); return false; }
    std::set<std::string> windows;
    std::int64_t revenue_sum = 0;
    std::int64_t company_sum = 0;
    std::int64_t bd_gross = 0;
    std::int64_t bd_revenue = 0;
    std::int64_t committee_pool = 0;
    for (const auto& channel : channels) {
        if (!archive_exact_fields(channel, {"window", "potential", "quality_factor", "heat_factor", "reputation_factor",
                                            "tv_multiplier", "agency_fee_permille", "gross", "net", "revenue",
                                            "company_received", "owner"})) {
            error("INV-22 archive.works[].channel_breakdown[] 根字段缺失或含未知字段: " + id);
            return false;
        }
        if (!archive_text(channel.at("window")) || !one_of_text(channel.at("window").get<std::string>(),
            {"domestic_streaming", "overseas", "merchandise", "music", "tv", "bd_dvd"})
            || !windows.insert(channel.at("window").get<std::string>()).second || !archive_integer(channel.at("potential"), 0)
            || !archive_integer(channel.at("quality_factor"), 0, 1000) || !archive_integer(channel.at("heat_factor"), 0, 2000)
            || !archive_integer(channel.at("reputation_factor"), 0, 2000) || !archive_integer(channel.at("tv_multiplier"), 0, 2000)
            || !archive_integer(channel.at("agency_fee_permille"), 0, 1000) || !archive_integer(channel.at("gross"), 0)
            || !archive_integer(channel.at("net"), 0, channel.at("gross").get<std::int64_t>())
            || !archive_integer(channel.at("revenue"), 0) || channel.at("revenue") != channel.at("gross")
            || !archive_integer(channel.at("company_received"), 0, channel.at("net").get<std::int64_t>())) {
            error("INV-22 archive.works[].channel_breakdown[] 字段或数值非法: " + id);
            return false;
        }
        const bool bd = channel.at("window") == "bd_dvd";
        if (!archive_text(channel.at("owner")) || channel.at("owner").get<std::string>() != (bd ? "company" : "committee_pool")) {
            error("INV-22 archive.works[].channel_breakdown[].owner 非法: " + id);
            return false;
        }
        const auto gross = channel.at("gross").get<std::int64_t>();
        const auto net = channel.at("net").get<std::int64_t>();
        if (!archive_add(revenue_sum, gross) || !archive_add(company_sum, channel.at("company_received").get<std::int64_t>())
            || (bd && (!archive_add(bd_gross, gross) || !archive_add(bd_revenue, net)))
            || (!bd && !archive_add(committee_pool, net))) {
            error("INV-22 archive.works[].channel_breakdown 合计溢出: " + id);
            return false;
        }
    }
    if (revenue_sum != record.at("commercial_revenue").get<std::int64_t>() || company_sum != commercial_share
        || bd_gross != record.at("bd_gross").get<std::int64_t>() || bd_revenue != record.at("bd_revenue").get<std::int64_t>()
        || committee_pool != record.at("committee_pool").get<std::int64_t>()
        || record.at("investor_share").get<std::int64_t>() != committee_pool - (commercial_share - bd_revenue)) {
        error("INV-22 archive.works[].channel_breakdown 对账失败: " + id);
        return false;
    }

    const Json& episodes = record.at("episodes");
    if (!episodes.is_array() || episodes.empty()) { error("INV-22 archive.works[].episodes 必须是非空数组"); return false; }
    std::set<std::string> episode_ids;
    for (const auto& episode : episodes) {
        if (!archive_exact_fields(episode, {"id", "quality"}) || !archive_text(episode.at("id"))
            || !episode_ids.insert(episode.at("id").get<std::string>()).second
            || !archive_quality(episode.at("quality"), path + ".episodes[].quality", error)) {
            error("INV-22 archive.works[].episodes[] 非法或重复: " + id);
            return false;
        }
    }
    const Json& team = record.at("team");
    if (!team.is_array()) { error("INV-22 archive.works[].team 必须是数组"); return false; }
    std::set<std::string> team_ids;
    for (const auto& member : team) {
        if (!archive_exact_fields(member, {"id", "name", "role"}) || !archive_text(member.at("id")) || !archive_text(member.at("name"))
            || !archive_text(member.at("role")) || !one_of_text(member.at("role").get<std::string>(),
                {"director", "scriptwriter", "animation_director", "key_animator", "animator", "production_manager", "postproduction"})
            || !team_ids.insert(member.at("id").get<std::string>()).second) {
            error("INV-22 archive.works[].team[] 非法或重复: " + id);
            return false;
        }
    }
    return archive_text(record.at("rules_status")) && record.at("rules_status") == "placeholder";
}

void validate_archive(const GameState& state, const std::function<void(const std::string&, const char*)>& claim_id,
                      const std::function<void(const std::string&)>& error) {
    const Json& archive = state.archive;
    if (!archive_exact_fields(archive, {"works", "series", "company_result"})) {
        error("INV-22 archive 必须精确包含 works/series/company_result");
        return;
    }
    if (!archive.at("works").is_array() || !archive.at("series").is_array()) {
        error("INV-22 archive.works/series 必须是数组");
        return;
    }
    std::map<std::string, const Json*> works;
    std::int64_t previous_end_week = 0;
    for (const auto& record : archive.at("works")) {
        if (!archive_work_record(record, state.company.week, claim_id, error)) continue;
        const std::string id = record.at("id").get<std::string>();
        const auto end_week = record.at("end_week").get<std::int64_t>();
        if (end_week < previous_end_week) error("INV-22 Archive 作品必须按交付周追加: " + id);
        previous_end_week = std::max(previous_end_week, end_week);
        works.emplace(id, &record);
    }
    std::map<std::string, const Json*> series_by_ip;
    std::set<std::string> listed_works;
    for (const auto& series : archive.at("series")) {
        if (!archive_exact_fields(series, {"ip_id", "title", "works", "last_week"}) || !archive_text(series.at("ip_id"))
            || !archive_text(series.at("title")) || !archive_integer(series.at("last_week"), 0, state.company.week)
            || !archive_string_array(series.at("works"), true, "archive.series[].works", error)) {
            error("INV-22 archive.series[] 根字段或类型非法");
            continue;
        }
        const std::string ip_id = series.at("ip_id").get<std::string>();
        if (!series_by_ip.emplace(ip_id, &series).second) { error("INV-22 archive.series[].ip_id 重复: " + ip_id); continue; }
        std::int64_t latest_week = 0;
        for (const auto& work_id_value : series.at("works")) {
            const std::string work_id = work_id_value.get<std::string>();
            const auto found = works.find(work_id);
            if (found == works.end() || found->second->at("end_reason") == "aborted" ||
                !found->second->contains("ip_id") || found->second->at("ip_id") != ip_id) {
                error("INV-22 archive.series[].works 引用不存在或 IP 不匹配: " + work_id);
                continue;
            }
            if (!listed_works.insert(work_id).second) { error("INV-22 作品只能归属一个系列: " + work_id); continue; }
            const auto end_week = found->second->at("end_week").get<std::int64_t>();
            if (end_week < latest_week) error("INV-22 archive.series[].works 必须按交付周追加: " + work_id);
            latest_week = std::max(latest_week, end_week);
        }
        if (series.at("last_week").get<std::int64_t>() != latest_week) error("INV-22 archive.series[].last_week 不等于最后交付周: " + ip_id);
    }
    for (const auto& [id, record] : works) {
        if (record->at("end_reason") != "aborted" && !record->at("ip_id").is_null() &&
            (series_by_ip.find(record->at("ip_id").get<std::string>()) == series_by_ip.end()
             || listed_works.find(id) == listed_works.end())) {
            error("INV-22 带 ip_id 的作品必须且只能归属一个系列: " + id);
        }
    }

    const Json& result = archive.at("company_result");
    if (result.is_null()) return;
    if (!archive_exact_fields(result, {"reason", "weeks", "final_funds", "net_cash_change", "total_projects",
                                       "best_work_id", "rating", "highlights", "negatives"})) {
        error("INV-22 archive.company_result 根字段缺失或含未知字段");
        return;
    }
    if (state.company.status != "ended" || !archive_text(result.at("reason"))
        || !one_of_text(result.at("reason").get<std::string>(), {"time_limit", "bankrupt", "voluntary"})
        || result.at("reason").get<std::string>() != state.company.end_reason.value_or("")
        || !archive_integer(result.at("weeks"), 0, kMaxWeek) || result.at("weeks").get<std::int64_t>() != state.company.week
        || (result.at("reason") == "time_limit" && result.at("weeks").get<std::int64_t>() != kMaxWeek)
        || !result.at("final_funds").is_number_integer()
        || (result.at("reason") != "bankrupt" && result.at("final_funds").get<std::int64_t>() < 0)
        || result.at("final_funds").get<std::int64_t>() != state.finance.balance
        || !result.at("net_cash_change").is_number_integer()
        || result.at("net_cash_change").get<std::int64_t>() != state.finance.balance - state.finance.opening_funds
        || !archive_integer(result.at("total_projects"), 0) || result.at("total_projects").get<std::int64_t>() != static_cast<std::int64_t>(works.size())
        || !(result.at("best_work_id").is_null() || archive_text(result.at("best_work_id")))
        || !archive_text(result.at("rating")) || !archive_string_array(result.at("highlights"), false, "archive.company_result.highlights", error)
        || !archive_string_array(result.at("negatives"), false, "archive.company_result.negatives", error)) {
        error("INV-22 archive.company_result 与公司状态或字段类型不一致");
        return;
    }
    std::int64_t quality_sum = 0;
    int best_score = -1;
    std::string best_id;
    for (const auto& record : archive.at("works")) {
        if (!record.is_object() || works.find(record.value("id", std::string{})) == works.end()) continue;
        const int score = record.at("quality_score").get<int>();
        quality_sum += score;
        if (score > best_score) {
            best_score = score;
            best_id = record.at("id").get<std::string>();
        }
    }
    const int average = works.empty() ? 0 : static_cast<int>(quality_sum / static_cast<std::int64_t>(works.size()));
    if (result.at("rating").get<std::string>() != archive_rating_of(average)
        || (best_id.empty() ? !result.at("best_work_id").is_null() : result.at("best_work_id") != best_id)) {
        error("INV-22 archive.company_result 评级或最佳作品与 Archive 不一致");
    }
}

void validate_vendors(const GameState& state,
                      const std::function<void(const std::string&, const char*)>& claim_id,
                      const std::function<void(const std::string&)>& error) {
    std::map<std::string, const Json*> suppliers;
    std::map<std::string, std::int64_t> active_capacity;
    for (const auto& supplier : state.suppliers) {
        if (!archive_exact_fields(supplier, {"id", "name", "specialties", "capacity_per_week", "quality", "speed",
                                             "price_per_unit", "reliability", "unlocked_week"})) {
            error("INV-01 Supplier 根字段缺失或含未知字段");
            continue;
        }
        if (!archive_text(supplier.at("id")) || !archive_text(supplier.at("name"))) {
            error("INV-01 Supplier id/name 必须是非空字符串");
            continue;
        }
        const std::string id = supplier.at("id").get<std::string>();
        claim_id(id, "supplier");
        suppliers.emplace(id, &supplier);
        const auto& specialties = supplier.at("specialties");
        if (!specialties.is_array() || specialties.empty()) {
            error("INV-01 Supplier.specialties 必须是非空数组: " + id);
        } else {
            std::set<std::string> seen;
            for (const auto& specialty : specialties) {
                if (!specialty.is_string() || ability_index(specialty.get<std::string>()) < 0 ||
                    !seen.insert(specialty.get<std::string>()).second) {
                    error("INV-01 Supplier.specialties 含非法或重复能力: " + id);
                }
            }
        }
        for (const char* key : {"capacity_per_week", "quality", "speed", "price_per_unit", "reliability", "unlocked_week"}) {
            if (!supplier.at(key).is_number_integer()) {
                error("INV-01 Supplier." + std::string(key) + " 必须是整数: " + id);
            }
        }
        if (!archive_integer(supplier.at("capacity_per_week"), 1)) {
            error("INV-01 Supplier.capacity_per_week 必须为正: " + id);
        }
        if (!archive_integer(supplier.at("quality"), 0, 100) || !archive_integer(supplier.at("reliability"), 0, 100)) {
            error("INV-01 Supplier.quality/reliability 必须在 0..100: " + id);
        }
        if (!archive_integer(supplier.at("speed"), 0) || !archive_integer(supplier.at("price_per_unit"), 0)) {
            error("INV-01 Supplier.speed/price_per_unit 不能为负: " + id);
        }
        if (!archive_integer(supplier.at("unlocked_week"), 0, kMaxWeek)) {
            error("INV-01 Supplier.unlocked_week 越界: " + id);
        }
    }

    std::map<std::string, std::int64_t> delivered_by_item;
    for (const auto& contract : state.contracts) {
        if (!archive_exact_fields(contract, {"id", "supplier_id", "work_id", "episode_id", "item_id", "ability", "mode",
                                             "work_total", "work_done", "weekly_cap", "fee_total", "fee_paid",
                                             "signed_week", "due_week", "status"})) {
            error("INV-01 OutsourceContract 根字段缺失或含未知字段");
            continue;
        }
        bool valid = true;
        for (const char* key : {"id", "supplier_id", "work_id", "item_id", "ability", "mode", "status"}) {
            if (!archive_text(contract.at(key))) {
                error("INV-01 OutsourceContract." + std::string(key) + " 必须是非空字符串");
                valid = false;
            }
        }
        if (!contract.at("episode_id").is_null() && !archive_text(contract.at("episode_id"))) {
            error("INV-01 OutsourceContract.episode_id 必须是非空字符串或 null");
            valid = false;
        }
        for (const char* key : {"work_total", "work_done", "weekly_cap", "fee_total", "fee_paid", "signed_week", "due_week"}) {
            if (!archive_integer(contract.at(key), 0)) {
                error("INV-01 OutsourceContract." + std::string(key) + " 必须是非负 int64 整数");
                valid = false;
            }
        }
        if (!valid) continue;
        const std::string id = contract.at("id").get<std::string>();
        claim_id(id, "contract");
        if (ability_index(contract.at("ability").get<std::string>()) < 0 ||
            !one_of_text(contract.at("mode").get<std::string>(), {"normal", "emergency"}) ||
            !one_of_text(contract.at("status").get<std::string>(), {"active", "delivered", "failed"})) {
            error("INV-01 OutsourceContract ability/mode/status 非法: " + id);
        }
        const auto work_total = contract.at("work_total").get<std::int64_t>();
        const auto work_done = contract.at("work_done").get<std::int64_t>();
        const auto weekly_cap = contract.at("weekly_cap").get<std::int64_t>();
        const auto fee_total = contract.at("fee_total").get<std::int64_t>();
        const auto fee_paid = contract.at("fee_paid").get<std::int64_t>();
        const auto signed_week = contract.at("signed_week").get<std::int64_t>();
        const auto due_week = contract.at("due_week").get<std::int64_t>();
        if (work_total <= 0 || work_done < 0 || work_done > work_total || weekly_cap <= 0 ||
            fee_total < 0 || fee_paid < 0 || fee_paid > fee_total ||
            signed_week < 0 || signed_week > state.company.week || due_week < signed_week || due_week > kMaxWeek) {
            error("INV-01 OutsourceContract 工作量/费用/周期越界: " + id);
        }

        const std::string supplier_id = contract.at("supplier_id").get<std::string>();
        const auto supplier = suppliers.find(supplier_id);
        if (supplier == suppliers.end()) {
            error("INV-20 OutsourceContract.supplier_id 不存在: " + id + "/" + supplier_id);
        } else {
            const auto& specialties = supplier->second->at("specialties");
            const std::string ability = contract.at("ability").get<std::string>();
            if (!archive_integer(supplier->second->at("unlocked_week"), 0, kMaxWeek) ||
                signed_week < supplier->second->at("unlocked_week").get<std::int64_t>() || !specialties.is_array() ||
                std::none_of(specialties.begin(), specialties.end(), [&ability](const Json& value) {
                    return value.is_string() && value.get<std::string>() == ability;
                })) {
                error("INV-20 OutsourceContract 供应商未解锁或专业不匹配: " + id + "/" + supplier_id);
            }
        }

        const Project* owner = find_work(state, contract.at("work_id").get<std::string>());
        if (owner == nullptr) {
            error("INV-20 OutsourceContract.work_id 不存在: " + id);
            continue;
        }
        if (contract.at("status").get<std::string>() == "active" && owner->status != "producing") {
            error("INV-20 active OutsourceContract 必须归属 producing 项目: " + id);
        }
        const WorkItem* item = nullptr;
        const std::string item_id = contract.at("item_id").get<std::string>();
        for (const auto& common : owner->common.items) {
            if (common.id == item_id) item = &common;
        }
        const bool common_item = item != nullptr;
        const Json& episode_id = contract.at("episode_id");
        for (const auto& episode : owner->episodes) {
            for (const auto& stage : episode.stages) {
                for (const auto& stage_item : stage.items) {
                    if (stage_item.id == item_id) {
                        item = &stage_item;
                        if (!episode_id.is_string() || episode_id.get<std::string>() != episode.id) {
                            error("INV-20 OutsourceContract.episode_id 与工作项容器不一致: " + id);
                        }
                    }
                }
            }
        }
        if (item == nullptr) {
            error("INV-20 OutsourceContract.item_id 不属于同一项目: " + id + "/" + item_id);
            continue;
        }
        if ((common_item && !episode_id.is_null()) || (!common_item && !episode_id.is_string())) {
            error("INV-20 OutsourceContract.episode_id 与公共/单集工作项不一致: " + id);
        }
        if (item->ability != contract.at("ability").get<std::string>()) {
            error("INV-20 OutsourceContract.ability 与工作项不一致: " + id);
        }
        auto& delivered = delivered_by_item[item_id];
        if (!archive_add(delivered, work_done) || delivered > item->work_total) {
            error("INV-20 同一工作项累计外包交付超过 work_total 或汇总溢出: " + item_id);
        }
        if (contract.at("status").get<std::string>() == "active") {
            auto& used = active_capacity[supplier_id];
            if (!archive_add(used, weekly_cap)) {
                error("INV-19 供应商 active weekly_cap 汇总溢出: " + supplier_id);
            } else if (supplier != suppliers.end() && archive_integer(supplier->second->at("capacity_per_week"), 1) &&
                       used > supplier->second->at("capacity_per_week").get<std::int64_t>()) {
                error("INV-19 供应商 active weekly_cap 总和超过 capacity_per_week: " + supplier_id);
            }
        }
    }
}

bool partnership_channel(const std::string& channel) {
    return one_of_text(channel, {"domestic_streaming", "overseas", "merchandise", "music", "tv", "publishing"});
}

void validate_partnerships(const GameState& state,
                           const std::function<void(const std::string&, const char*)>& claim_id,
                           const std::function<void(const std::string&)>& error) {
    std::map<std::string, const Json*> partners;
    std::map<std::string, const Json*> committees;
    std::map<std::string, const Json*> archived_works;
    if (state.archive.is_object() && state.archive.contains("works") && state.archive.at("works").is_array()) {
        for (const auto& record : state.archive.at("works")) {
            if (record.is_object() && archive_text(record.value("id", Json{}))) {
                archived_works.emplace(record.at("id").get<std::string>(), &record);
            }
        }
    }

    for (const auto& partner : state.partners) {
        if (!archive_exact_fields(partner, {"id", "name", "type", "channels", "prestige", "relationship", "history", "status"})) {
            error("INV-01 Partner 根字段缺失或含未知字段");
            continue;
        }
        if (!archive_text(partner.at("id")) || !archive_text(partner.at("name"))) {
            error("INV-01 Partner id/name 必须是非空字符串");
            continue;
        }
        const std::string id = partner.at("id").get<std::string>();
        claim_id(id, "partner");
        partners.emplace(id, &partner);
        if (!archive_text(partner.at("type")) || !one_of_text(partner.at("type").get<std::string>(),
            {"tv", "publisher", "toy", "music", "streaming", "studio"})) {
            error("INV-01 Partner.type 非法: " + id);
        }
        if (!archive_integer(partner.at("prestige"), 0)) {
            error("INV-01 Partner.prestige 必须为非负整数: " + id);
        }
        if (!archive_integer(partner.at("relationship"), 0, 100)) {
            error("INV-01 Partner.relationship 越界: " + id);
        }
        if (!archive_text(partner.at("status")) || !one_of_text(partner.at("status").get<std::string>(), {"known", "unavailable"})) {
            error("INV-01 Partner.status 非法: " + id);
        }
        if (!partner.at("channels").is_array() || partner.at("channels").empty()) {
            error("INV-01 Partner.channels 必须是非空数组: " + id);
        } else {
            std::set<std::string> channels;
            for (const auto& channel : partner.at("channels")) {
                if (!channel.is_string() || !partnership_channel(channel.get<std::string>()) ||
                    !channels.insert(channel.get<std::string>()).second) {
                    error("INV-13 Partner.channels 非法、重复或包含 BD: " + id);
                }
            }
        }
        if (!partner.at("history").is_array()) {
            error("INV-13 Partner.history 必须是数组: " + id);
            continue;
        }
        std::int64_t previous_week = 0;
        for (const auto& entry : partner.at("history")) {
            if (!archive_exact_fields(entry, {"week", "work_id", "delta", "reason"}) ||
                !archive_integer(entry.at("week"), 0, state.company.week) ||
                !archive_text(entry.at("work_id")) || !archive_integer(entry.at("delta"), -100, 100) ||
                !archive_text(entry.at("reason"))) {
                error("INV-13 Partner.history[] 字段或数值非法: " + id);
                continue;
            }
            const std::string work_id = entry.at("work_id").get<std::string>();
            const auto record = archived_works.find(work_id);
            if (record == archived_works.end()) {
                error("INV-13 Partner.history 引用未归档作品: " + id + "/" + work_id);
            } else if (!record->second->contains("end_week") ||
                       !archive_integer(record->second->at("end_week"), 0, state.company.week)) {
                error("INV-13 Partner.history 作品交付周非法: " + id + "/" + work_id);
            } else if (record->second->at("end_week").get<std::int64_t>() != entry.at("week").get<std::int64_t>()) {
                error("INV-13 Partner.history 周必须与作品交付周一致: " + id + "/" + work_id);
            }
            if (entry.at("week").get<std::int64_t>() < previous_week) {
                error("INV-13 Partner.history 必须按合作周追加: " + id);
            }
            previous_week = std::max(previous_week, entry.at("week").get<std::int64_t>());
        }
    }

    std::set<std::string> committee_works;
    for (const auto& committee : state.committees) {
        if (!archive_exact_fields(committee, {"id", "work_id", "members", "formed_week", "status", "closed_week"})) {
            error("INV-01 Committee 根字段缺失或含未知字段");
            continue;
        }
        if (!archive_text(committee.at("id")) || !archive_text(committee.at("work_id"))) {
            error("INV-01 Committee id/work_id 必须是非空字符串");
            continue;
        }
        const std::string id = committee.at("id").get<std::string>();
        const std::string work_id = committee.at("work_id").get<std::string>();
        claim_id(id, "committee");
        committees.emplace(id, &committee);
        if (!committee_works.insert(work_id).second) {
            error("INV-13 同一作品存在多个委员会: " + work_id);
        }
        if (!committee.at("members").is_array() || committee.at("members").empty()) {
            error("INV-13 Committee.members 必须是非空数组: " + id);
        } else {
            std::set<std::string> member_ids;
            std::set<std::string> member_channels;
            for (const auto& member : committee.at("members")) {
                if (!archive_exact_fields(member, {"partner_id", "channel"}) ||
                    !archive_text(member.at("partner_id")) || !archive_text(member.at("channel"))) {
                    error("INV-13 Committee.members[] 字段非法: " + id);
                    continue;
                }
                const std::string partner_id = member.at("partner_id").get<std::string>();
                const std::string channel = member.at("channel").get<std::string>();
                if (!member_ids.insert(partner_id).second) error("INV-13 委员会成员重复: " + id);
                if (!member_channels.insert(channel).second) error("INV-13 委员会渠道重复: " + id);
                if (!partnership_channel(channel) || channel == kWindowBd) {
                    error("INV-13 委员会渠道非法或 BD 不挂成员: " + id);
                }
                const auto partner = partners.find(partner_id);
                if (partner == partners.end()) {
                    error("INV-13 委员会成员不存在: " + partner_id);
                } else if (!partner->second->at("channels").is_array() ||
                           std::none_of(partner->second->at("channels").begin(), partner->second->at("channels").end(),
                                        [&channel](const Json& value) { return value == channel; })) {
                    error("INV-13 委员会渠道不属于该伙伴: " + partner_id + "/" + channel);
                }
            }
        }
        const Json& formed_week = committee.at("formed_week");
        const bool formed_valid = archive_integer(formed_week, 0, state.company.week);
        if (!formed_valid) {
            error("INV-01 Committee.formed_week 越界: " + id);
        }
        const Json& status_value = committee.at("status");
        const std::string status = status_value.is_string() ? status_value.get<std::string>() : std::string{};
        if (status != "active" && status != "closed") {
            error("INV-01 Committee.status 非法: " + id);
        }
        const Json& closed_week = committee.at("closed_week");
        if (status == "active" && !closed_week.is_null()) {
            error("INV-13 活跃委员会不能有 closed_week: " + id);
        }
        if (status == "closed" && (!archive_integer(closed_week, formed_valid ? formed_week.get<std::int64_t>() : 0,
                                                    state.company.week) ||
                                   closed_week.get<std::int64_t>() > state.company.week)) {
            error("INV-13 已关闭委员会缺少合法 closed_week: " + id);
        }

        const Project* work = find_work(state, work_id);
        const auto record = archived_works.find(work_id);
        if (status == "active") {
            if (work == nullptr) {
                error("INV-13 活跃委员会的项目不存在: " + id);
            } else {
                if (work->mode != "committee" || work->committee_id != id ||
                    (work->status != "producing" && work->status != "delivering")) {
                    error("INV-13 活跃委员会与项目引用不一致: " + id);
                }
                if (formed_valid && work->opened_week != formed_week.get<std::int64_t>()) {
                    error("INV-13 委员会成立周必须与项目立项周一致: " + id);
                }
            }
        } else if (status == "closed" && archive_integer(closed_week, 0, state.company.week)) {
            if (record == archived_works.end()) {
                error("INV-13 已关闭委员会缺少归档作品: " + id);
            } else if (!record->second->contains("mode") || !record->second->at("mode").is_string() ||
                       !record->second->contains("start_week") ||
                       !archive_integer(record->second->at("start_week"), 0, state.company.week) ||
                       !record->second->contains("end_week") ||
                       !archive_integer(record->second->at("end_week"), 0, state.company.week)) {
                error("INV-13 已关闭委员会与归档作品不一致: " + id);
            } else if (record->second->at("mode").get<std::string>() != "committee" ||
                       !formed_valid ||
                       record->second->at("start_week").get<std::int64_t>() != formed_week.get<std::int64_t>() ||
                       record->second->at("end_week").get<std::int64_t>() != closed_week.get<std::int64_t>()) {
                error("INV-13 已关闭委员会与归档作品不一致: " + id);
            }
            if (work != nullptr) error("INV-13 已关闭委员会不得继续引用活动项目: " + id);
        }
    }

    for (const auto& work : state.works) {
        if (!work.committee_id) continue;
        const auto committee = committees.find(*work.committee_id);
        if (committee == committees.end() ||
            !committee->second->contains("work_id") || !committee->second->at("work_id").is_string() ||
            committee->second->at("work_id").get<std::string>() != work.id ||
            !committee->second->contains("status") || !committee->second->at("status").is_string() ||
            committee->second->at("status").get<std::string>() != "active") {
            error("INV-13 项目 committee_id 未指向同一作品的活跃委员会: " + work.id);
        }
    }
}

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

    // 招聘池（§14.13.1）：候选不是员工——不进名册约束（INV-09/10/11 不适用），
    // 但 id 仍走全局唯一集合，且不得与名册员工重叠；包装字段语义在这里拦住。
    for (const auto& candidate : state.recruitment.pool) {
        claim_id(candidate.staff.id, "candidate");
        if (!one_of_text(candidate.origin, {"regular", "scout"})) {
            error("INV-01 candidate.origin 非法: " + candidate.staff.id);
        }
        if (candidate.origin == "regular" && candidate.expires_week) {
            error("INV-01 regular 候选不得带签约窗口: " + candidate.staff.id);
        }
        if (candidate.origin == "scout" && !candidate.expires_week) {
            error("INV-01 scout 候选缺少 expires_week: " + candidate.staff.id);
        }
        for (int i = 0; i < kAbilityCount; ++i) {
            const int ability = candidate.staff.abilities[static_cast<std::size_t>(i)];
            const int potential = candidate.staff.potential[static_cast<std::size_t>(i)];
            if (ability < 0 || ability > 100) error("INV-01 候选能力越界: " + candidate.staff.id);
            if (potential < 0 || potential > 100) error("INV-01 候选潜力越界: " + candidate.staff.id);
        }
        if (candidate.staff.signing_fee < 0) error("INV-01 候选 signing_fee 不能为负: " + candidate.staff.id);
        if (candidate.staff.weekly_salary <= 0) error("INV-01 候选 weekly_salary 必须为正: " + candidate.staff.id);
        if (candidate.staff.assignment_work_id) {
            error("INV-01 池中候选不得有项目归属: " + candidate.staff.id);
        }
    }
    if (state.recruitment.pity.since_sr < 0 || state.recruitment.pity.since_ssr < 0) {
        error("INV-01 recruitment.pity 计数不能为负");
    }
    if (state.recruitment.last_scout_week &&
        (*state.recruitment.last_scout_week < 0 || *state.recruitment.last_scout_week > state.company.week)) {
        error("INV-01 last_scout_week 越界");
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

        // INV-22：系列来源只在 start_work 从企划快照复制，存档不得另行改写。
        if (work.ip_id && work.ip_id->empty()) error("INV-22 project.ip_id 不能为空: " + work.id);
        if (work.offer.is_object() && work.offer.contains("ip_id")) {
            if (!work.offer.at("ip_id").is_null() && !archive_text(work.offer.at("ip_id"))) {
                error("INV-22 offer.ip_id 必须是非空字符串或 null: " + work.id);
            } else if ((work.ip_id ? Json(*work.ip_id) : Json(nullptr)) != work.offer.at("ip_id")) {
                error("INV-22 project.ip_id 必须与立项快照一致: " + work.id);
            }
        } else if (work.ip_id) {
            error("INV-22 project.ip_id 缺少立项快照来源: " + work.id);
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

    // INV-13：伙伴、委员会及其成员/渠道归属与生命周期。
    validate_vendors(state, claim_id, error);

    // INV-22：WorkRecord 全量载荷、系列引用与终局统计一起校验。
    validate_archive(state, claim_id, error);
    validate_partnerships(state, claim_id, error);

    if (!state.market.is_object()) {
        error("INV-01 market 必须是对象");
    } else {
        if (state.market.contains("slots")) {
            if (!state.market.at("slots").is_array()) error("INV-01 market.slots 必须是数组");
            else if (state.market.at("slots").size() > static_cast<std::size_t>(kMarketCap)) error("INV-01 market.slots 最多 4 个");
            else {
                for (const auto& offer : state.market.at("slots")) {
                    const std::string offer_id = offer.value("id", std::string{});
                    claim_id(offer_id, "offer");
                    if (offer.value("contract_budget", static_cast<std::int64_t>(0)) <= 0) {
                        error("INV-01 offer.contract_budget 必须为正: " + offer_id);
                    }
                    if (offer.value("duration_weeks", 0) <= 0) error("INV-01 offer.duration_weeks 必须为正: " + offer_id);
                    if (offer.value("blueprint_id", std::string{}).empty()) error("INV-01 offer.blueprint_id 缺失: " + offer_id);
                    if (offer.contains("ip_id") && !offer.at("ip_id").is_null() && !archive_text(offer.at("ip_id"))) {
                        error("INV-22 offer.ip_id 必须是非空字符串或 null: " + offer_id);
                    }
                    if (!offer.contains("channels_baseline") || offer.at("channels_baseline").empty()) {
                        error("INV-01 offer.channels_baseline 不能为空: " + offer_id);
                    }
                    if (!offer.contains("allowed_modes") || offer.at("allowed_modes").empty()) {
                        error("INV-01 offer.allowed_modes 不能为空: " + offer_id);
                    }
                    // §14.13.2 生命周期字段（市场槽必填；自定/提案槽透传不强制）。
                    if (!offer.contains("expires_week") || !offer.at("expires_week").is_number_integer() ||
                        offer.at("expires_week").get<int>() < 0) {
                        error("INV-01 offer.expires_week 必须为非负整数: " + offer_id);
                    }
                    if (!offer.contains("locked_until") ||
                        (!offer.at("locked_until").is_null() && !offer.at("locked_until").is_number_integer())) {
                        error("INV-01 offer.locked_until 必须为 null 或整数: " + offer_id);
                    }
                    if (!offer.contains("lock_used") || !offer.at("lock_used").is_boolean()) {
                        error("INV-01 offer.lock_used 必须为布尔: " + offer_id);
                    }
                    if (!offer.contains("deposit_paid") || !offer.at("deposit_paid").is_number_integer() ||
                        offer.at("deposit_paid").get<std::int64_t>() < 0) {
                        error("INV-01 offer.deposit_paid 必须为非负整数: " + offer_id);
                    }
                    if (!offer.contains("offer_source_type") || !offer.at("offer_source_type").is_string() ||
                        offer.at("offer_source_type").get<std::string>().empty()) {
                        error("INV-01 offer.offer_source_type 缺失: " + offer_id);
                    }
                    if (!offer.contains("deposit_basis") || !offer.at("deposit_basis").is_number_integer() ||
                        offer.at("deposit_basis").get<std::int64_t>() <= 0) {
                        error("INV-01 offer.deposit_basis 必须为正: " + offer_id);
                    }
                    const bool has_lock = offer.contains("locked_until") && offer.at("locked_until").is_number_integer();
                    const bool lock_used = offer.value("lock_used", false);
                    const auto deposits = offer_deposit_entries(state, offer_id);
                    if (lock_used) {
                        const std::int64_t expected_deposit = offer_deposit_amount(offer);
                        if (deposits.size() != 1) {
                            error("INV-01 offer 已锁定但 Finance 定金流水不唯一: " + offer_id);
                        } else {
                            const LedgerEntry& entry = *deposits.front();
                            if (offer.value("deposit_paid", static_cast<std::int64_t>(0)) != expected_deposit) {
                                error("INV-01 offer.deposit_paid 与定金公式不一致: " + offer_id);
                            }
                            if (!has_lock || offer.at("locked_until").get<int>() != entry.week + kLockWeeks) {
                                error("INV-01 offer.locked_until 与定金流水不一致: " + offer_id);
                            }
                            if (entry.id != offer_deposit_entry_id(entry.week, offer_id) ||
                                entry.week > state.company.week || entry.work_id.has_value() ||
                                entry.category != "production" || entry.amount != -expected_deposit ||
                                !entry.counterparty || *entry.counterparty != offer_id ||
                                entry.memo != "定金锁定（到期不退）") {
                                error("INV-01 Finance 定金流水不是规范流水: " + offer_id);
                            }
                        }
                    } else {
                        if (has_lock || offer.value("deposit_paid", static_cast<std::int64_t>(0)) > 0) {
                            error("INV-01 offer 锁定快照不一致（lock_used=false）: " + offer_id);
                        }
                        if (!deposits.empty()) {
                            error("INV-24 Finance 已有该企划的终身锁定历史: " + offer_id);
                        }
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
        // #121：升级后的期限以升级周为基准（固定 2 周窗口），原触发周保持不变。
        const int deadline_base = (event.escalated && event.escalation.has_value())
                                      ? event.escalation->triggered_week : event.triggered_week;
        if (event.expires_week && *event.expires_week < deadline_base) {
            error("INV-23 expires_week 早于期限基准周: " + event.event_id);
        }
        if (event.expires_week && *event.expires_week > deadline_base + 7) {
            error("INV-29 expires_week 超出八周处理上限: " + event.event_id);
        }
        if (event.escalated && !event.escalation.has_value()) {
            error("INV-29 已升级事件缺少升级快照: " + event.event_id);
        }
        if (event.escalation.has_value()) {
            const auto& esc = *event.escalation;
            if (esc.expires_weeks != 2) error("INV-29 升级窗口必须固定为 2 周: " + event.event_id);
            if (esc.options.empty()) error("INV-29 升级快照缺少替换选项: " + event.event_id);
            if (std::none_of(esc.options.begin(), esc.options.end(),
                             [](const EventOptionView& option) { return option.kind == "abandon"; })) {
                error("INV-29 升级选项缺少 abandon 分支: " + event.event_id);
            }
            const bool hard_branch = std::any_of(esc.options.begin(), esc.options.end(),
                [&esc](const EventOptionView& option) {
                    return option.id == esc.timeout_option_id &&
                           (option.kind == "abandon" || option.kind == "decline");
                });
            if (!hard_branch) error("INV-29 二次硬罚分支引用无效: " + event.event_id);
            if (event.escalated && event.expires_week &&
                *event.expires_week != esc.triggered_week + 1) {
                error("INV-29 升级期限不是固定 2 周窗口: " + event.event_id);
            }
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
    const bool bankrupt_negative_allowed = state.company.end_reason == "bankrupt" &&
        (state.company.status == "closing" || state.company.status == "ended");
    if (state.finance.balance < 0 && !bankrupt_negative_allowed) error("INV-25 余额不能为负");
    return errors;
}

// ---------------- 哈希 ----------------
std::string state_hash(const GameState& state) {
    GameState copy = state;
    std::sort(copy.staff.begin(), copy.staff.end(), [](const Staff& a, const Staff& b) { return a.id < b.id; });
    std::sort(copy.works.begin(), copy.works.end(), [](const Project& a, const Project& b) { return a.id < b.id; });
    auto json_id = [](const Json& value) {
        return value.is_object() && value.contains("id") && value.at("id").is_string()
                   ? value.at("id").get<std::string>() : std::string{};
    };
    std::sort(copy.suppliers.begin(), copy.suppliers.end(), [&json_id](const Json& a, const Json& b) {
        return json_id(a) < json_id(b);
    });
    std::sort(copy.contracts.begin(), copy.contracts.end(), [&json_id](const Json& a, const Json& b) {
        return json_id(a) < json_id(b);
    });
    std::sort(copy.partners.begin(), copy.partners.end(), [&json_id](const Json& a, const Json& b) {
        return json_id(a) < json_id(b);
    });
    std::sort(copy.committees.begin(), copy.committees.end(), [&json_id](const Json& a, const Json& b) {
        return json_id(a) < json_id(b);
    });
    for (auto& partner : copy.partners) {
        if (partner.is_object() && partner.contains("channels") && partner.at("channels").is_array()) {
            auto& channels = partner.at("channels");
            std::sort(channels.begin(), channels.end(), [](const Json& a, const Json& b) { return a.dump() < b.dump(); });
        }
    }
    for (auto& committee : copy.committees) {
        if (!committee.is_object() || !committee.contains("members") || !committee.at("members").is_array()) continue;
        auto& members = committee.at("members");
        auto member_key = [](const Json& member) {
            const std::string partner_id = member.is_object() && member.contains("partner_id") && member.at("partner_id").is_string()
                ? member.at("partner_id").get<std::string>() : std::string{};
            const std::string channel = member.is_object() && member.contains("channel") && member.at("channel").is_string()
                ? member.at("channel").get<std::string>() : std::string{};
            return partner_id + "\n" + channel;
        };
        std::sort(members.begin(), members.end(), [&member_key](const Json& a, const Json& b) {
            return member_key(a) < member_key(b);
        });
    }
    for (auto& supplier : copy.suppliers) {
        if (supplier.is_object() && supplier.contains("specialties") && supplier.at("specialties").is_array()) {
            auto& specialties = supplier.at("specialties");
            std::sort(specialties.begin(), specialties.end(), [](const Json& a, const Json& b) { return a.dump() < b.dump(); });
        }
    }
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
    Json offer = Json{{"id", id},
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
    // §14.13.2 生命周期字段：fixture 目录的到期窗口为 [PLACEHOLDER]，
    // 定金基数按生成时固定的基础立项费用快照。
    offer["offer_source_type"] = "market";
    offer["deposit_basis"] = budget;
    offer["expires_week"] = kFixtureExpiresWeek;
    offer["locked_until"] = nullptr;
    offer["lock_used"] = false;
    offer["deposit_paid"] = 0;
    return offer;
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
            !record.contains("channel_breakdown") || !record.at("channel_breakdown").is_array()) {
            continue;
        }
        for (const auto& channel : record.at("channel_breakdown")) {
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

std::pair<std::int64_t, std::int64_t> project_work_progress(const Project& work) {
    std::int64_t done = 0;
    std::int64_t total = 0;
    walk_items(work, [&done, &total](const WorkItem& item) {
        done += item.work_done;
        total += item.work_total;
    });
    return {done, total};
}

int scale_permille(const std::string& scale) {
    if (scale == "short") return 350;
    if (scale == "ova") return 650;
    if (scale == "movie") return 1600;
    return 1000;
}

int abort_reputation_delta(int reputation, const std::string& scale) {
    const int stage_percent = reputation < 600 ? 10 : reputation < 10000 ? 70 : reputation < 60000 ? 140 : 220;
    const std::int64_t base = 35000LL * scale_permille(scale) / 1000;
    return -static_cast<int>(base * stage_percent / 100);
}

struct SettlementOutcome {
    bool ok = false;
    const char* code = "INVALID_STATE";
    std::string message;
    Json report = Json::object();
};

SettlementOutcome settle_project(GameState& state, Project& work, const std::string& end_reason, bool forced,
                                  bool forced_terminal = false);

// 关闭公司前先在副本逐项预演结清，确保进入不可逆 closing 后仍有合法后继。
SettlementOutcome close_company(GameState& state, const std::string& reason) {
    SettlementOutcome outcome;
    GameState preview = state;
    for (const auto& work : state.works) {
        Project* preview_work = find_work(preview, work.id);
        // 只有强制终局（破产 / 第 520 周）允许把扣罚压到可支付现金；主动关闭仍按原口径原子拒绝。
        const bool forced_terminal = reason == "bankrupt" || reason == "time_limit";
        const auto settlement =
            settle_project(preview, *preview_work, "company_closed", !preview_work->deliverable(), forced_terminal);
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
SettlementOutcome settle_project(GameState& state, Project& work, const std::string& end_reason, bool forced,
                                  bool forced_terminal) {
    SettlementOutcome outcome;
    const int week = state.company.week;
    const std::string work_id = work.id;
    const bool aborted = end_reason == "aborted";
    // DEC-EVENT-001：待处理事件不得因交付/中止/关闭被丢弃；先处理再结项。
    for (const auto& pending : state.events.pending) {
        if (pending.work_id != work_id) continue;
        outcome.code = "INVALID_PHASE";
        outcome.message = "该项目仍有待处理事件，请先处理： " + pending.event_id;
        return outcome;
    }
    const int gcp = forced || aborted ? gate_completion_permille(work) : 1000;

    const auto quality = kernel::aggregate_work(work);
    const int raw_score = quality.mean;
    const int correction = forced ? std::min(kForcedScorePenaltyMax, (1000 - gcp) / 100) : 0;
    const int score = clamp_int(raw_score - correction, 0, 100);
    const std::string rating = rating_of(score);

    // instantiate_work 是内部夹具入口；没有企划快照时也生成完整的冻结履历载荷。
    const Json fixture_offer = Json{{"id", work_id + "_offer"}, {"name", work_id}, {"source", "original"},
                                    {"genre", "fixture"}, {"scale", "short"}, {"contract_budget", 0}, {"ip_id", nullptr}};
    const Json& offer = work.offer.is_object() && !work.offer.empty() ? work.offer : fixture_offer;
    const std::int64_t budget = offer.value("contract_budget", static_cast<std::int64_t>(0));
    const std::string genre = offer.value("genre", std::string{});
    const int qf = quality_factor(raw_score);
    const int hf = heat_factor(state.market, genre);
    const int rf = reputation_factor(state.company.reputation);

    const bool contract = work.mode != "committee";
    const int percent = work.investment.value("percent", 0);
    const auto [progress_done, progress_total] = project_work_progress(work);

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
    // DEC-PROJECT-001：中止按权威总工作量判定 50% 边界；委员会沉没投资与成本，不退款、不罚违约金。
    std::int64_t contract_refund = 0;
    std::int64_t penalty = 0;
    if (aborted && contract) {
        if (progress_total > 0 && progress_done * 2 > progress_total) {
            contract_refund = budget * (progress_total - progress_done) / progress_total;
        } else {
            penalty = budget * 150 / 1000;
        }
    } else if (!aborted && forced) {
        penalty = budget * (1000 - gcp) / 1000 * kForcedPenaltyPermille / 1000;
    }
    const std::int64_t company_revenue = bd_revenue + company_share + reward;
    // #120：强制终局（破产 / 第 520 周）不能再让扣罚把现金推到负数，否则 INV-25 与
    // §14.7「直接破产终局」互相矛盾，公司会被永久卡在无法关闭的状态。可支付额 = 现有现金 + 本次收入；
    // 超出部分只在回执里记为 penalty_waived，不产生欠款、递延或负现金。
    // [PLACEHOLDER] 破产终局扣罚封顶口径待 zm 在 #120 裁定；公式本身不变，只加可支付上限。
    std::int64_t penalty_waived = 0;
    if (forced_terminal && penalty > 0) {
        const std::int64_t payable = state.finance.balance + company_revenue;
        if (penalty > payable) {
            penalty_waived = penalty - std::max<std::int64_t>(0, payable);
            penalty = std::max<std::int64_t>(0, payable);
        }
    }
    const std::int64_t balance_after_settlement =
        state.finance.balance + company_revenue + contract_refund - penalty;
    if (balance_after_settlement < 0 && !aborted && !forced_terminal) {
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
    if (contract_refund > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".refund." + work_id, week, work_id, "contract_refund",
            contract_refund, std::nullopt, "abort refund for incomplete work"});
        state.finance.balance += contract_refund;
    }
    if (penalty > 0) {
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".penalty." + work_id, week, work_id, "penalty",
            -penalty, std::nullopt, aborted ? "abort penalty" : forced ? "forced delivery penalty" : "penalty"});
        state.finance.balance -= penalty;
    }

    static const std::map<std::string, int> kReputationDelta{{"S", 8}, {"A", 5}, {"B", 2}, {"C", 0}, {"D", -5}};
    const int reputation_delta = aborted ? abort_reputation_delta(state.company.reputation, offer.value("scale", std::string{"tv"}))
                               : forced ? std::min(0, kReputationDelta.at(rating))
                                        : kReputationDelta.at(rating);
    change_reputation(state, reputation_delta, aborted ? "项目中止" : "作品交付 " + rating + (forced ? "（强制）" : ""));

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
                const int delta = aborted ? 0 : forced ? std::min(0, kRelationshipDelta.at(rating))
                                                   : kRelationshipDelta.at(rating);
                partner["relationship"] = std::clamp(partner.value("relationship", 50) + delta, 0, 100);
                if (!partner.contains("history") || !partner.at("history").is_array()) partner["history"] = Json::array();
                partner["history"].push_back(Json{{"week", week}, {"work_id", work_id}, {"delta", delta},
                                                  {"reason", aborted ? "项目中止" : std::string("作品交付 ") + rating}});
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
    const std::int64_t profit = budget - contract_refund + company_revenue - investment_paid - total_costs;

    Json record = Json{{"id", work_id},
                       {"ip_id", work.ip_id ? Json(*work.ip_id) : Json(nullptr)},
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
                       {"status", aborted ? "ABORTED" : "DELIVERED"},
                       {"forced", forced},
                       {"gate_completion_permille", gcp},
                       {"aborted_week", aborted ? Json(week) : Json(nullptr)},
                       {"penalty_paid", penalty},
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
                                                {"contract_refund", contract_refund},
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
    if (!state.archive.contains("works") || !state.archive.at("works").is_array()) state.archive["works"] = Json::array();
    state.archive["works"].push_back(record);
    // 中止保留作品履历，但不把未交付作品加入 IP 系列。
    if (!aborted && work.ip_id) {
        if (!state.archive.contains("series") || !state.archive.at("series").is_array()) state.archive["series"] = Json::array();
        Json* series = nullptr;
        for (auto& entry : state.archive.at("series")) {
            if (entry.is_object() && entry.value("ip_id", std::string{}) == *work.ip_id) {
                series = &entry;
                break;
            }
        }
        if (series == nullptr) {
            state.archive["series"].push_back(Json{{"ip_id", *work.ip_id}, {"title", record.at("name")},
                                                   {"works", Json::array({work_id})}, {"last_week", week}});
        } else {
            (*series)["works"].push_back(work_id);
            (*series)["last_week"] = week;
        }
    }

    outcome.report = Json{{"work_id", work_id},
                          {"end_reason", end_reason},
                          {"archived", true},
                          {"status", aborted ? "ABORTED" : "DELIVERED"},
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
                          {"contract_refund", contract_refund},
                          {"penalty", penalty},
                          {"penalty_paid", penalty},
                          {"penalty_waived", penalty_waived},
                          {"total_costs", total_costs},
                          {"net_received", company_revenue + contract_refund - penalty},
                          {"channels", channel_report}};

    state.contracts.erase(std::remove_if(state.contracts.begin(), state.contracts.end(), [&work_id](const Json& contract) {
        return contract.is_object() && contract.value("work_id", std::string{}) == work_id;
    }), state.contracts.end());
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

// 默认消极/保守分支（M0 §14.11）：负向事件用 abandon；正向事件按内容规范必须有 accept 与
// decline，保守分支即 decline。两者都没有时返回 nullptr，由调用方按非法状态拒绝。
const EventOptionView* default_event_option(const PendingEvent& pending) {
    for (const auto& option : pending.options) {
        if (option.kind == "abandon") return &option;
    }
    for (const auto& option : pending.options) {
        if (option.kind == "decline") return &option;
    }
    return nullptr;
}

// #121：按选项 id 查找冻结快照中的分支；只认保守类型，避免误把玩家正向选项当超时惩罚。
const EventOptionView* find_timeout_option(const PendingEvent& pending, const std::string& option_id) {
    for (const auto& option : pending.options) {
        if (option.id != option_id) continue;
        return (option.kind == "abandon" || option.kind == "decline") ? &option : nullptr;
    }
    return nullptr;
}

// #120：强制终局的 pending 结清。破产与第 520 周已经没有玩家决策机会，但事件不能丢弃、
// 也不能留下指向已关闭项目的悬空条目，因此逐条执行冻结快照里的默认保守分支：
//   1. 顺序固定为 (work_id, event_id) 排序，与数组顺序、项目遍历顺序无关；
//   2. 费用沿用自动结算的现金封顶，效果走同一条事件账本，不新增收入类目；
//   3. 每条成功后才从 pending 移除；任一条失败由调用方回滚到阶段快照，不留半状态。
// 结清明细复用 stage-7 已登记的 report.events.expired[] 形状（work_id/event_id/option_id/automatic），
// 不新增持久字段；现金变化可由 Finance 流水对账，归档级索引字段名待 #53 冻结。
bool settle_pending_for_terminal(GameState& state, int week, Json& expired, std::string& code,
                                 std::string& message) {
    std::vector<PendingEvent> ordered = state.events.pending;
    std::sort(ordered.begin(), ordered.end(), [](const PendingEvent& a, const PendingEvent& b) {
        if (a.work_id != b.work_id) return a.work_id < b.work_id;
        return a.event_id < b.event_id;
    });
    for (const auto& pending : ordered) {
        const EventOptionView* option = default_event_option(pending);
        if (option == nullptr) {
            code = "INVALID_STATE";
            message = "终局事件缺少默认保守分支: " + pending.event_id;
            return false;
        }
        if (!apply_event_option(state, pending, *option, week, true)) {
            code = "INVALID_STATE";
            message = "终局事件归属项目不存在: " + pending.work_id;
            return false;
        }
        auto& events = state.events.pending;
        const auto hit = std::find_if(events.begin(), events.end(), [&pending](const PendingEvent& item) {
            return item.work_id == pending.work_id && item.event_id == pending.event_id;
        });
        if (hit == events.end()) {
            code = "INVALID_STATE";
            message = "终局事件重复处理: " + pending.event_id;
            return false;
        }
        events.erase(hit);
        expired.push_back(Json{{"work_id", pending.work_id},
                               {"event_id", pending.event_id},
                               {"option_id", option->id},
                               {"automatic", true}});
    }
    return true;
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
        state.recruitment = initial_recruitment(seed);
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

// M0 命令 6：scout(role?, focus_ability?)。每周至多一次（last_scout_week ≠ week），
// 定向生成走 recruit_scout purpose 坐标；费用走 Finance operations 流水。
std::string scout(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));

        std::optional<std::string> role;
        std::optional<std::string> focus;
        if (request.contains("role") && !request.at("role").is_null()) {
            if (!request.at("role").is_string()) return encode(error_body("INVALID_INPUT", "role 必须是字符串"));
            role = request.at("role").get<std::string>();
            if (!is_profession(*role)) return encode(error_body("INVALID_INPUT", "role 必须是八职业之一"));
        }
        if (request.contains("focus_ability") && !request.at("focus_ability").is_null()) {
            if (!request.at("focus_ability").is_string()) return encode(error_body("INVALID_INPUT", "focus_ability 必须是字符串"));
            focus = request.at("focus_ability").get<std::string>();
            if (ability_index(*focus) < 0) return encode(error_body("INVALID_INPUT", "focus_ability 不是合法能力"));
            bool mapped = false;
            for (const char* profession : kProfessions) {
                if (profession_ability(profession) == *focus) mapped = true;
            }
            if (!mapped) return encode(error_body("INVALID_INPUT", "focus_ability 没有对应职业"));
        }
        if (role && focus) return encode(error_body("INVALID_INPUT", "role 与 focus_ability 至多传一个"));
        if (state.company.status != "running") return encode(error_body("INVALID_PHASE", "只有经营中的公司可以 scout"));
        if (!state.events.pending.empty()) return encode(error_body("INVALID_PHASE", "有待处理事件时不能 scout"));
        if (state.recruitment.last_scout_week && *state.recruitment.last_scout_week == state.company.week) {
            return encode(error_body("INVALID_PHASE", "本周已经 scout 过"));
        }
        if (state.finance.balance < kScoutFee) return encode(error_body("INSUFFICIENT_FUNDS", "现金不足：scout 费用不足"));

        const int week = state.company.week;
        // 定向能力 → 职业：按 DEC-STAFF-006 顺序取第一个主能力匹配的职业（与 oracle 一致）。
        std::optional<std::string> forced = role;
        if (!forced && focus) {
            for (const char* profession : kProfessions) {
                if (profession_ability(profession) == *focus) {
                    forced = std::string(profession);
                    break;
                }
            }
        }
        Json added_ids = Json::array();
        Pity pity = state.recruitment.pity;
        for (int i = 0; i < kScoutCount; ++i) {
            auto generated = generate_candidate(state.seed, week, i, purpose_recruit_scout(), forced, pity);
            pity = advance_pity(pity, generated.tier);
            PoolCandidate candidate;
            candidate.staff = std::move(generated.staff);
            candidate.expires_week = week + kScoutWindowWeeks;
            candidate.origin = "scout";
            added_ids.push_back(candidate.staff.id);
            state.recruitment.pool.push_back(std::move(candidate));
        }
        state.recruitment.pity = pity;
        state.recruitment.last_scout_week = week;
        state.finance.entries.push_back(LedgerEntry{
            "w" + std::to_string(week) + ".operations.scout", week, std::nullopt, "operations",
            -kScoutFee, std::nullopt, "scout"});
        state.finance.balance -= kScoutFee;

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}, {"added_ids", added_ids}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 命令 5：hire_core(staff_id)。从招聘池解包加入核心名册，当周可分配（§14.4）；
// signing_fee 通过 Finance 即时入账，首周周薪计入下一次周结算。
std::string hire_core(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (!request.contains("staff_id") || !request.at("staff_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "staff_id 必须是字符串"));
        }
        const std::string staff_id = request.at("staff_id").get<std::string>();
        if (state.company.status != "running") return encode(error_body("INVALID_PHASE", "只有经营中的公司可以签约"));
        const PoolCandidate* candidate = find_candidate(state, staff_id);
        if (candidate == nullptr) return encode(error_body("NOT_FOUND", "候选人不存在"));
        if (candidate->origin == "scout" && candidate->expires_week &&
            state.company.week >= *candidate->expires_week) {
            return encode(error_body("NOT_FOUND", "候选人签约窗口已过期"));
        }
        if (candidate->staff.employment != "core" || !candidate->staff.temporary_contract.is_null()) {
            return encode(error_body("INVALID_INPUT", "hire_core 只接受无项目合同的核心候选人"));
        }
        const std::int64_t fee = candidate->staff.signing_fee;
        if (state.finance.balance < fee) return encode(error_body("INSUFFICIENT_FUNDS", "现金不足：签约费不足"));
        if (core_staff_count(state) >= core_staff_capacity(state)) {
            return encode(error_body("CAPACITY_EXCEEDED", "核心编制已满"));
        }

        // 解包：只取 PoolCandidate.staff，expires_week/origin 是池包装字段，不得残留名册。
        Staff member = candidate->staff;
        auto& pool = state.recruitment.pool;
        pool.erase(std::remove_if(pool.begin(), pool.end(),
                                  [&staff_id](const PoolCandidate& entry) { return entry.staff.id == staff_id; }),
                   pool.end());
        state.staff.push_back(member);
        const int week = state.company.week;
        if (fee > 0) {
            state.finance.entries.push_back(LedgerEntry{
                "w" + std::to_string(week) + ".salary." + staff_id + ".signing", week, std::nullopt, "salary",
                -fee, std::nullopt, "signing_fee"});
            state.finance.balance -= fee;
        }

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INVALID_STATE", errors.front()));
        return encode(Json{{"state", state}, {"staff_id", staff_id}});
    } catch (const Json::exception&) {
        return encode(error_body("INVALID_INPUT", "JSON 或字段类型无效"));
    } catch (...) {
        return encode(error_body("INTERNAL_ERROR", "内部错误"));
    }
}

// M0 命令 7：dismiss_staff(staff_id)。移出名册+清空归属，不预付遣散费；
// 解雇后 core ≥ 1；监督须先原子替换，无合格替补则关键岗位锁定（§14.8）。
std::string dismiss_staff(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (!request.contains("staff_id") || !request.at("staff_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "staff_id 必须是字符串"));
        }
        const std::string staff_id = request.at("staff_id").get<std::string>();
        Staff* member = find_staff(state, staff_id);
        if (member == nullptr) return encode(error_body("NOT_FOUND", "员工不存在"));
        if (state.company.status != "running") return encode(error_body("INVALID_PHASE", "只有经营中的公司可以解雇"));
        if (member->employment != "core") return encode(error_body("INVALID_INPUT", "仅核心员工可解雇"));
        if (core_staff_count(state) <= 1) return encode(error_body("INVALID_PHASE", "解雇后至少保留 1 名核心员工"));

        // INV-12 现行校验要求 contributors 引用在籍员工，而冻结文本只要求"参与过"。
        // 离职员工的历史引用语义待 #53 裁决（缺口已登记 #7）；在此之前拒绝解雇
        // 有制作参与记录的员工，而不是删改 contributors 或放宽校验。
        bool has_contribution = false;
        for (const auto& work : state.works) {
            walk_items(work, [&](const WorkItem& item) {
                if (std::find(item.contributors.begin(), item.contributors.end(), staff_id) != item.contributors.end()) {
                    has_contribution = true;
                }
            });
        }
        if (state.archive.contains("works") && state.archive.at("works").is_array()) {
            for (const auto& record : state.archive.at("works")) {
                if (!record.contains("team") || !record.at("team").is_array()) continue;
                for (const auto& member : record.at("team")) {
                    if (member.is_object() && member.value("id", std::string{}) == staff_id) has_contribution = true;
                }
            }
        }
        if (has_contribution) {
            return encode(error_body("INVALID_PHASE", "该员工已有制作参与记录，历史引用语义待裁决，暂不可解雇"));
        }

        for (const auto& work : state.works) {
            if (work.status != "producing" || !work.supervisor_staff_id || *work.supervisor_staff_id != staff_id) continue;
            if (!replace_supervisor_post(state, work.id, staff_id)) {
                return encode(error_body("INVALID_PHASE", "监督关键岗位锁定：同项目与公司空闲名册中无合格替补"));
            }
        }
        auto& roster = state.staff;
        roster.erase(std::remove_if(roster.begin(), roster.end(),
                                    [&staff_id](const Staff& entry) { return entry.id == staff_id; }),
                     roster.end());

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
            const int64_t gap = total_cost - state.finance.balance;
            // #120：破产是强制终局，不能因为还有 pending 就永久卡死。先按默认保守分支逐条结清，
            // 再走 §14.7 的破产关闭；结清或关闭任一步失败都回到阶段 1 快照。
            Json terminal_expired = Json::array();
            if (!state.events.pending.empty()) {
                std::string code;
                std::string message;
                if (!settle_pending_for_terminal(state, week, terminal_expired, code, message)) {
                    return fail_stage(2, code, "破产终局 pending 结清失败: " + message);
                }
            }
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
                                               {"funds", Json{{"delta", state.finance.balance - snapshot.finance.balance},
                                                              {"balance", state.finance.balance}}},
                                               {"works", Json::array()},
                                               {"staff", Json::array()},
                                               {"settlements", Json::array()},
                                               {"events", Json{{"drawn", 0},
                                                               {"reason", "bankrupt"},
                                                               {"expired", terminal_expired}}}}}});
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
            // #121 / DEC-EVENT-003：升级事件二次超时 → 执行预设硬罚，不乘倍，移除 pending。
            if (pending.escalated) {
                if (!pending.escalation.has_value()) {
                    return fail_stage(7, "INVALID_STATE", "已升级事件缺少升级快照");
                }
                const EventOptionView* hard = find_timeout_option(pending, pending.escalation->timeout_option_id);
                if (hard == nullptr) return fail_stage(7, "INVALID_STATE", "二次硬罚分支引用无效");
                if (!apply_event_option(state, pending, *hard, week, true)) {
                    return fail_stage(7, "INVALID_STATE", "到期事件归属项目不存在");
                }
                auto& events = state.events.pending;
                const auto hit = std::find_if(events.begin(), events.end(), [&pending](const PendingEvent& item) {
                    return item.work_id == pending.work_id && item.event_id == pending.event_id;
                });
                if (hit == events.end()) return fail_stage(7, "INVALID_STATE", "到期事件重复处理");
                events.erase(hit);
                expired.push_back(Json{{"work_id", pending.work_id}, {"event_id", pending.event_id},
                                       {"option_id", hard->id}, {"automatic", true}});
                continue;
            }
            const EventOptionView* option = pending.timeout_option_id.empty()
                                                ? default_event_option(pending)
                                                : find_timeout_option(pending, pending.timeout_option_id);
            if (option == nullptr) return fail_stage(7, "INVALID_STATE", "限期事件缺少可用的保守超时分支");
            if (!apply_event_option(state, pending, *option, week, true)) {
                return fail_stage(7, "INVALID_STATE", "到期事件归属项目不存在");
            }
            auto& events = state.events.pending;
            const auto hit = std::find_if(events.begin(), events.end(), [&pending](const PendingEvent& item) {
                return item.work_id == pending.work_id && item.event_id == pending.event_id;
            });
            if (hit == events.end()) return fail_stage(7, "INVALID_STATE", "到期事件重复处理");
            if (pending.escalation.has_value()) {
                // 首次超时：轻罚已入账，原地替换内容快照并设置固定 2 周新期限；身份与 viewed 不变。
                hit->options = pending.escalation->options;
                hit->expires_week = week + 1;
                hit->escalation->triggered_week = week;
                hit->escalated = true;
            } else {
                events.erase(hit);
            }
            expired.push_back(Json{{"work_id", pending.work_id}, {"event_id", pending.event_id},
                                   {"option_id", option->id}, {"automatic", true}});
        }

        // ---- 阶段 7：下一周开场状态步（先于阶段 8 事件抽取）----
        const int next_week = week + 1;
        // 招聘池进入新周先清理到期 scout 窗口，再部分轮换常规池。
        // 市场释放到期锁定 → 自然过期 → 自然补充；破产路径已在阶段 2 提前返回。
        state.recruitment.pool = rotate_pool(state.recruitment.pool, state.seed, next_week);
        state.market = weekly_market_step(state.market, state.seed, next_week, state.company.reputation);

        // ---- 阶段 8：随机事件抽取与周数 +1 ----
        // 每个 producing 项目各自至多一条；已有待处理事件的项目不再追加。
        // 第 520 周先合法完成当周结算，再统一收尾：不再抽事件，剩余项目转 closing 结清。
        Json events_report = Json::object();
        Json terminal_expired = Json::array();
        if (next_week >= kMaxWeek) {
            // #120：第 520 周同样是强制终局。本周已到期的限时事件已在阶段 7 处理，
            // 这里结清仍在 pending 的其余事件（默认保守分支），再关闭公司。
            if (!state.events.pending.empty()) {
                std::string code;
                std::string message;
                if (!settle_pending_for_terminal(state, week, terminal_expired, code, message)) {
                    return fail_stage(8, code, "第 520 周终局 pending 结清失败: " + message);
                }
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

        state.company.week = next_week;
        // 阶段 7 的到期事件与阶段 8 的终局结清共用已登记的 expired 形状，按处理顺序合并。
        for (const auto& item : terminal_expired) expired.push_back(item);
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
                                            {"offer_source_type", "custom"},
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

// 命令 23 lock_offer（M0 §14.13.2 / Q4）：定金锁定市场槽企划。
// 终身一次（lock_used 永不复位）、锁定期两周（W/W+1 有效，W+2 开局释放）、
// 定金 = deposit_basis × 档位（普通 5% / IP 上门 10%），现金权威唯一走 Finance。
// 自定/提案槽不适用定金锁定（其生命周期语义未冻结，见 #6 缺口说明）。
std::string lock_offer(const std::string& input) {
    try {
        const Json request = Json::parse(input);
        GameState state = decode_state(request);
        const auto input_errors = validate(state);
        if (!input_errors.empty()) return encode(error_body("INVALID_STATE", input_errors.front()));
        if (state.company.status != "running") return encode(error_body("COMPANY_ENDED", "公司已结束"));
        if (!request.contains("offer_id") || !request.at("offer_id").is_string()) {
            return encode(error_body("INVALID_INPUT", "offer_id 必须是字符串"));
        }
        const std::string offer_id = request.at("offer_id").get<std::string>();
        if (!state.events.pending.empty()) return encode(error_body("INVALID_PHASE", "有待处理事件时不能锁定企划"));
        const int week = state.company.week;

        Json* slot = nullptr;
        if (state.market.contains("slots") && state.market.at("slots").is_array()) {
            for (auto& offer : state.market.at("slots")) {
                if (offer.is_object() && offer.value("id", std::string{}) == offer_id) {
                    slot = &offer;
                    break;
                }
            }
        }
        if (slot == nullptr) return encode(error_body("NOT_FOUND", "企划不存在或已过期"));
        if (slot->value("lock_used", false)) {
            return encode(error_body("INVALID_INPUT", "该企划已用过定金锁定（终身一次）"));
        }
        if (week >= slot->value("expires_week", kMaxWeek)) {
            return encode(error_body("NOT_FOUND", "企划已过期"));
        }
        const std::int64_t deposit = offer_deposit_amount(*slot);
        if (state.finance.balance < deposit) {
            return encode(Json{{"error", {{"code", "INSUFFICIENT_FUNDS"},
                                          {"message", "现金不足以支付定金"},
                                          {"gap", deposit - state.finance.balance}}}});
        }

        (*slot)["locked_until"] = week + kLockWeeks;
        (*slot)["lock_used"] = true;
        (*slot)["deposit_paid"] = deposit;
        state.finance.entries.push_back(LedgerEntry{
            offer_deposit_entry_id(week, offer_id), week, std::nullopt,
            "production", -deposit, offer_id, "定金锁定（到期不退）"});
        state.finance.balance -= deposit;

        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "锁定后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"offer_id", offer_id}, {"deposit_paid", deposit}});
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
        const int week = state.company.week;
        bool market_slot = false;
        if (state.market.contains("slots") && state.market.at("slots").is_array()) {
            for (const auto& slot : state.market.at("slots")) {
                if (slot.is_object() && slot.value("id", std::string{}) == offer_id) {
                    market_slot = true;
                    break;
                }
            }
        }
        if (market_slot) {
            const bool has_lock = snapshot.contains("locked_until") && snapshot.at("locked_until").is_number_integer();
            const bool lock_expired = has_lock && week >= snapshot.at("locked_until").get<int>();
            const bool naturally_expired = week >= snapshot.value("expires_week", kMaxWeek) &&
                                           !offer_in_lock(snapshot, week);
            if (lock_expired || naturally_expired) {
                return encode(error_body("NOT_FOUND", "企划不存在或已过期"));
            }
        }
        if (snapshot.contains("ip_id") && !snapshot.at("ip_id").is_null() && !archive_text(snapshot.at("ip_id"))) {
            return encode(error_body("INVALID_STATE", "企划 ip_id 必须是非空字符串或 null"));
        }
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
        // §14.13.2 签约抵扣：仅锁定期内（week < locked_until）定金 100% 抵扣本次应付投资额。
        // 定金已在 lock_offer 入账，这里只减少本次现金支出，不重复计成本、不新增退款流水。
        // 承制模式无应付投资额（paid=0），按冻结公式 applied=min(deposit,0)=0（缺口已报 #6）。
        const auto deposits = offer_deposit_entries(state, offer_id);
        const std::int64_t deposit_paid = deposits.empty() ? 0 : -deposits.front()->amount;
        const std::int64_t deposit_applied = market_slot && offer_in_lock(snapshot, week)
                                                  ? std::min(deposit_paid, paid)
                                                  : 0;
        const std::int64_t cash_due = paid - deposit_applied;
        if (state.finance.balance < cash_due) {
            return encode(Json{{"error", {{"code", "INSUFFICIENT_FUNDS"},
                                          {"message", "现金不足以支付投资额"},
                                          {"gap", cash_due - state.finance.balance}}}});
        }
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
        if (snapshot.contains("ip_id") && snapshot.at("ip_id").is_string()) {
            work.ip_id = snapshot.at("ip_id").get<std::string>();
        }
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
        if (cash_due > 0) {
            state.finance.entries.push_back(LedgerEntry{
                "w" + std::to_string(week) + ".investment." + work_id, week, work_id, "investment_paid",
                -cash_due, committee_id.empty() ? std::nullopt : std::optional<std::string>(committee_id), offer_id});
            state.finance.balance -= cash_due;
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

// M0 命令 11：abort_work。DEC-PROJECT-001 规定的中止结算、履历与破产路径。
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
        if (state.company.week > work->deadline_week) {
            return encode(error_body("INVALID_PHASE", "已过截止：到期交付由周结算自动执行"));
        }

        auto outcome = settle_project(state, *work, "aborted", false);
        if (!outcome.ok) return encode(error_body(outcome.code, outcome.message));
        if (state.finance.balance < 0) {
            Json terminal_expired = Json::array();
            if (!state.events.pending.empty()) {
                std::string code;
                std::string message;
                if (!settle_pending_for_terminal(state, state.company.week, terminal_expired, code, message)) {
                    return encode(error_body(code.c_str(), "中止破产终局 pending 结清失败: " + message));
                }
            }
            const auto closed = close_company(state, "bankrupt");
            if (!closed.ok) return encode(error_body(closed.code, closed.message));
            outcome.report["company_end_reason"] = "bankrupt";
            outcome.report["events"] = Json{{"expired", terminal_expired}};
        }
        const auto errors = validate(state);
        if (!errors.empty()) return encode(error_body("INTERNAL_ERROR", "中止后状态非法: " + errors.front()));
        return encode(Json{{"state", state}, {"report", outcome.report}});
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
        // #120：破产 / 第 520 周这类强制终局才允许扣罚按可支付现金封顶；
        // 主动关闭（voluntary）保持原口径，仍以“无法非负结清即原子拒绝”防止用关闭逃避扣罚。
        const bool forced_terminal =
            reason == "company_closed" &&
            (state.company.end_reason == "bankrupt" || state.company.end_reason == "time_limit");

        const auto outcome = settle_project(state, *work, reason, forced, forced_terminal);
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
