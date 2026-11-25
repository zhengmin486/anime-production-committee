#pragma once

// v4 领域模型（M1 切片）
//
// 范围：Company / Staff / Project（公共制作 + 单集 + 工作项）/ Finance 余额与流水。
// 未在 M1 实现行为的领域（Vendor / Partnership / Market / Event / Archive）保留 JSON 形状占位，
// 由 M2 起逐项替换为强类型。M1 只对已实现部分做结构校验，见 validate.cpp。
//
// 约定：
// - 全部字段 snake_case，与 M0_CONTRACT_FREEZE §3 对齐。
// - 无浮点。金额为日元整数，工作量为整数"点"（1 点 = 1/100 人周）。
// - 空值用 std::optional 表达，序列化为 null。

#include <array>
#include <cstdint>
#include <functional>
#include <map>
#include <optional>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

namespace apc::v4 {

using Json = nlohmann::json;

inline constexpr int kContractVersion = 4;
inline constexpr int kMaxWeek = 520;
inline constexpr int kAbilityCount = 6;
inline constexpr int kDimensionCount = 6;
inline constexpr int kStageCount = 6;

// 能力顺序与 game_rules 一致：planning/direction/drawing/animation/management/postproduction
extern const std::array<const char*, kAbilityCount> kAbilities;
// 质量维度：story/direction/drawing/animation/art/sound
extern const std::array<const char*, kDimensionCount> kDimensions;
// 单集六阶段（顺序固定，不可换序）
extern const std::array<const char*, kStageCount> kStages;

int ability_index(const std::string& name);       // -1 表示未知
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
    std::string status = "running";      // running / closing / ended
    std::optional<std::string> end_reason;
    int64_t reputation = 0;
    std::vector<ReputationLog> reputation_log;
};

struct Participation {
    std::string work_id;
    std::string item_id;
    int week = 0;
};

struct Staff {
    std::string id;
    std::string name;
    std::string role;
    std::string employment = "core";     // core / temporary
    std::array<int, kAbilityCount> abilities{};
    std::array<int, kAbilityCount> experience{};
    std::array<int, kAbilityCount> potential{};
    std::array<bool, kAbilityCount> revealed_potential{};
    std::string talent_type;
    int64_t weekly_salary = 0;
    int64_t project_fee = 0;
    int fatigue = 0;
    int morale = 0;
    bool departure_warning = false;
    std::optional<std::string> assignment_work_id;
    std::optional<Participation> last_participation;
    Json temporary_contract = nullptr;   // M2：临时合同，M1 不参与规则
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
    std::string kind;   // episode / stage
    std::string id;     // episode_id 或 stage_key
};

struct WorkPlan {
    // 生效状态（M1）：
    // - intensity：已生效，决定每周制作费；
    // - focus：部分生效，schedule/cost 影响同阶段工作项排序，quality 仅保存（质量落点由阶段权重决定）；
    // - outsourcing / overtime：仅保存，等 M2/M3 外包与加班规则接入后才有效果。
    std::string intensity = "standard";   // low / standard / high
    std::string focus = "quality";        // quality / schedule / cost
    std::string outsourcing = "gap_fill"; // none / gap_fill / aggressive（M3）
    bool overtime = false;                // M2
    std::optional<Target> target;
};

struct Project {
    std::string id;
    Json offer;                            // 企划快照（M2 强类型化）
    std::string mode = "contract";
    Json investment = Json::object();
    std::vector<std::string> channels;
    int opened_week = 0;
    int deadline_week = 0;
    Json extension = Json::object();
    std::string status = "producing";      // planning / producing / delivering / settled
    CommonProduction common;
    std::vector<Episode> episodes;
    WorkPlan plan;
    Json delivery = nullptr;

    // 派生：作品是否可交付（全部门槛项 delivered）
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
    std::string state = "normal";   // normal / crisis
    std::optional<int> since_week;
    std::optional<int> deadline_week;
    int64_t gap = 0;
};

struct Finance {
    int64_t opening_funds = 0;
    int64_t balance = 0;
    std::vector<LedgerEntry> entries;
    Json loans = Json::array();     // M2.5
    Solvency solvency;
};

// ---- 事件（M2，M0 §14.1：pending 是数组，不是全局单槽）----
// 待处理事件按项目保留；同一项目同时最多一条。选项与效果快照随事件冻结，
// 内容卡后续改版不会改变已经在盘上的选择（DEC-EVENT-001 / #50 审查）。
struct EffectView {
    std::string scope;    // instant / stage / project
    std::string target;   // quality / work_done / fatigue / morale / funds
    std::string stage;    // scope=stage 时的阶段；空表示当前阶段
    int value = 0;
};

struct EventOptionView {
    std::string id;
    std::string label;
    std::string kind;         // accept/abandon/overtime/decline（outsource/extension 预留但当前不可用）
    std::string risk_hint;
    int cost = 0;
    std::vector<EffectView> effects;
};

struct PendingEvent {
    std::string event_id;
    std::string name;         // 快照：结算回执不依赖可能变化的内容目录
    std::string work_id;
    int triggered_week = 0;
    std::optional<int> expires_week;
    int cooldown_weeks = 0;
    bool once_per_project = false;
    bool viewed = false;      // INV-23：未查看阻塞周推进，查看不等于处理
    std::vector<EventOptionView> options;
};

struct WorkEventState {
    std::map<std::string, int> cooldowns;   // event_id -> 解锁周
    std::vector<std::string> major_seen;    // 本项目已触发的重大事件 id
};

struct EventState {
    std::vector<PendingEvent> pending;
    std::optional<int> last_event_week;
    std::map<std::string, WorkEventState> per_work;
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
    Json archive = Json::object();
};

// ---- 序列化 ----
void to_json(Json& j, const Company& value);
void from_json(const Json& j, Company& value);
void to_json(Json& j, const Staff& value);
void from_json(const Json& j, Staff& value);
void to_json(Json& j, const WorkItem& value);
void from_json(const Json& j, WorkItem& value);
void to_json(Json& j, const Project& value);
void from_json(const Json& j, Project& value);
void to_json(Json& j, const Finance& value);
void from_json(const Json& j, Finance& value);
void to_json(Json& j, const EventState& value);
void from_json(const Json& j, EventState& value);
void to_json(Json& j, const GameState& value);
void from_json(const Json& j, GameState& value);

// ---- 查询辅助 ----
Staff* find_staff(GameState& state, const std::string& id);
Project* find_work(GameState& state, const std::string& id);
const Project* find_work(const GameState& state, const std::string& id);
WorkItem* find_item(Project& work, const std::string& item_id);
const WorkItem* find_item(const Project& work, const std::string& item_id);
// 遍历全部工作项（公共制作 + 各单集），回调携带所属容器信息
void for_each_item(Project& work, const std::function<void(WorkItem&, const std::string& episode_id, const std::string& stage_key)>& fn);

}  // namespace apc::v4
