#pragma once

#include <array>
#include <cstdint>
#include <nlohmann/json.hpp>
#include <vector>

namespace apc::rules {

inline constexpr std::int64_t max_integer = 9007199254740991LL;
inline constexpr std::uint64_t max_seed = 4294967295ULL;
inline constexpr int version = 3;
inline constexpr int max_weeks = 520;

// TODO(待定)：以下均为 M1 暂定值，等待团队实测平衡。
inline constexpr std::int64_t initial_funds = 2000000;
inline constexpr std::int64_t operations_weekly = 30000;
inline constexpr std::int64_t stage_cost = 30000;
inline constexpr std::int64_t overtime_cost = 25000;
inline constexpr std::int64_t deadline_penalty_permille = 200;  // 违约交付扣合同额 20%
inline constexpr std::int64_t closed_penalty_permille = 100;    // 公司关闭中断扣合同额 10%
inline constexpr int success_reputation = 10;
inline constexpr int below_target_reputation = 3;
inline constexpr int deadline_reputation = -5;
inline constexpr int rating_renowned = 20000000;
inline constexpr int rating_stable = 5000000;
inline constexpr int rating_small = 0;

inline constexpr int initial_morale = 80;
inline constexpr int initial_fatigue = 0;
// 声望为已确认规则（GAME_RULES V3.9 §1）：初始 100、下限 0、无上限、不随时间衰减；等级阈值与称号仍待定。
inline constexpr int initial_reputation = 100;
inline constexpr int base_speed = 9;
inline constexpr int specialty_fit = 1200;
inline constexpr int nonspecialty_fit = 800;
inline constexpr int morale_base = 600;
inline constexpr int morale_scale = 4;
inline constexpr int fatigue_penalty = 4;
inline constexpr int fatigue_work = 4;
inline constexpr int fatigue_rest = 8;
inline constexpr int rest_morale = 10;
inline constexpr int overtime_morale = 6;
inline constexpr int carry_over_permille = 600;  // 阶段质量上限 = 前阶段×60% + 40
inline constexpr int carry_over_offset = 40;
inline constexpr std::uint32_t rng_multiplier = 1664525U;
inline constexpr std::uint32_t rng_increment = 1013904223U;

inline constexpr std::array<const char*, 5> stages{"script", "storyboard", "key_animation", "animation_check", "postproduction"};
inline constexpr std::array<const char*, 6> abilities{"planning", "direction", "drawing", "animation", "management", "postproduction"};
// 每阶段的需求专业，与 stages 对齐。
inline constexpr std::array<int, 5> stage_ability{0, 1, 2, 3, 5};
inline constexpr std::array<int, 5> quality_weights{150, 200, 250, 200, 200};
inline constexpr std::array<int, 5> experience_gain{2, 2, 2, 2, 2};  // TODO(待定)：正式成长规则属 #8。

struct Policy { const char* id; int speed; int quality; int morale; int cost; };
inline constexpr std::array<Policy, 3> policies{{
    {"quality", 750, 1250, -1, 1100},
    {"balanced", 1000, 1000, -2, 1000},
    {"deadline", 1300, 800, -4, 900}
}};

struct ScaleRule { const char* scale; std::int64_t revenue_per_point; };
inline constexpr std::array<ScaleRule, 4> scales{{
    {"ova", 15000}, {"short", 8000}, {"tv", 40000}, {"movie", 100000}
}};

struct StaffSpec {
    const char* id; const char* name; const char* role; const char* specialty;
    std::int64_t weekly_salary; std::array<int, 6> abilities; std::array<int, 6> potential;
    const char* talent_type; const char* clue;
};
inline constexpr std::array<StaffSpec, 4> staff{{
    {"staff_01", u8"林导演", "director", "direction", 45000, {70, 75, 45, 40, 65, 40}, {90, 95, 70, 65, 85, 65}, "specialist", u8"善于分镜调度"},
    {"staff_02", u8"陈原画", "key_animator", "drawing", 38000, {45, 50, 80, 70, 40, 45}, {70, 75, 95, 90, 65, 70}, "specialist", u8"擅长动作设计"},
    {"staff_03", u8"许动画", "animator", "animation", 32000, {40, 45, 60, 65, 40, 50}, {65, 70, 80, 85, 60, 70}, "uneven", u8"出画速度快"},
    {"staff_04", u8"周摄影", "postproduction", "postproduction", 35000, {40, 45, 50, 50, 45, 70}, {60, 65, 70, 70, 60, 92}, "generalist", u8"合成审美稳定"}
}};

struct OfferSpec {
    const char* id; const char* name; const char* source; const char* scale;
    std::int64_t contract_budget; int duration_weeks; int target_quality;
    int audience_base; int commercial_potential; const char* risk;
    std::array<int, 5> workloads;
};
// M1 固定企划目录；正式生成规则属 #6。original 源不参与 M1。
inline constexpr std::array<OfferSpec, 12> offers{{
    {"proj_ova_01", u8"放学后的第七帧", "manga", "ova", 4000000, 14, 60, 55, 60, "low", {30, 30, 30, 30, 30}},
    {"proj_short_01", u8"纸飞机电台", "light_novel", "short", 2400000, 9, 50, 40, 45, "low", {20, 20, 20, 20, 20}},
    {"proj_tv_01", u8"星轨列车", "game", "tv", 6000000, 24, 68, 75, 70, "medium", {55, 55, 55, 55, 55}},
    {"proj_ova_02", u8"海雾信号站", "light_novel", "ova", 4400000, 15, 62, 50, 65, "medium", {34, 34, 34, 34, 34}},
    {"proj_short_02", u8"便利贴宇宙", "manga", "short", 2800000, 10, 55, 45, 50, "low", {24, 24, 24, 24, 24}},
    {"proj_tv_02", u8"霓虹食单", "light_novel", "tv", 7200000, 28, 70, 80, 75, "medium", {65, 65, 65, 65, 65}},
    {"proj_ova_03", u8"夜行校线", "game", "ova", 4800000, 16, 65, 60, 70, "medium", {38, 38, 38, 38, 38}},
    {"proj_movie_01", u8"云端灯塔", "game", "movie", 16000000, 40, 80, 90, 95, "high", {110, 110, 110, 110, 110}},
    {"proj_short_03", u8"便利屋手记", "light_novel", "short", 3200000, 11, 58, 50, 55, "low", {26, 26, 26, 26, 26}},
    {"proj_tv_03", u8"潮汐图书馆", "manga", "tv", 8000000, 30, 72, 85, 78, "high", {70, 70, 70, 70, 70}},
    {"proj_ova_04", u8"雨日放映室", "manga", "ova", 3600000, 13, 58, 48, 55, "low", {28, 28, 28, 28, 28}},
    {"proj_movie_02", u8"群山回响", "light_novel", "movie", 18000000, 45, 82, 92, 96, "high", {125, 125, 125, 125, 125}}
}};

// 制作事件（#11 / 设计 docs/EVENT_MODULE_DESIGN.md）。
// 数值全部 TODO(待定)：触发概率、冷却与事件费用等待 zm 审查后校准。
inline constexpr int event_base_probability_permille = 60;
inline constexpr int event_max_probability_permille = 300;
inline constexpr int event_probability_step_weeks = 4;
inline constexpr int event_probability_step_permille = 10;
inline constexpr int event_fatigue_bonus_threshold = 70;
inline constexpr int event_fatigue_bonus_permille = 20;
inline constexpr int event_cash_pressure_permille = 15;
// 事件抽样用无状态混合，不推进 GameState.seed：M1 固定种子轨迹与市场轮换保持不变。
inline constexpr std::uint32_t event_roll_salt = 2654435761U;

struct EventEffect { const char* scope; const char* target; int value; int stage; };
struct EventOptionSpec { const char* id; const char* kind; const char* label; std::int64_t cost; std::vector<EventEffect> effects; };
struct EventSpec {
    const char* id; const char* name; const char* polarity; const char* tier;
    const char* category; const char* tag; const char* description;
    std::vector<int> stages; int priority; int cooldown_weeks; bool once_per_project;
    const char* metric; const char* op; int threshold; int random_weight;
    int expires_weeks;                      // 0 = 无处理期限
    std::vector<EventEffect> escalation;    // 超时升级效果（expires_weeks>0 时必填）
    std::vector<EventOptionSpec> options;
};

inline const std::vector<EventSpec> events{
    {"key_cut_rework", u8"关键镜头返修", "negative", "normal", "quality", "quality_rework",
     u8"本阶段有几卡关键镜头没有达到作画监督的要求。现在返修还来得及，但要多占用一周的人手。",
     {2, 3}, 20, 6, false, "stage_quality", "<", 55, 0, 2,
     {{"stage", "quality", -3, -1}},
     {{"accept", "abandon", u8"按现状推进", 0, {{"instant", "morale", -3, -1}}},
      {"rework", "overtime", u8"抽调人手返修", 180000, {{"instant", "fatigue", 6, -1}, {"stage", "quality", 4, -1}}}}},
    {"schedule_slip", u8"作画进度落后", "negative", "normal", "schedule", "schedule_slip",
     u8"离交付只剩三周，作画进度明显落后于计划。继续按原节奏推进很可能赶不上截止周。",
     {2, 3}, 10, 4, false, "weeks_to_deadline", "<=", 3, 0, 0, {},
     {{"accept", "abandon", u8"维持原计划", 0, {{"stage", "quality", -3, -1}}},
      {"crunch", "overtime", u8"全员赶工", 120000, {{"instant", "fatigue", 8, -1}, {"instant", "work_done", 120, -1}}},
      {"delay", "extension", u8"向委员会申请延期", 250000, {{"instant", "morale", -4, -1}}}}},
    {"animator_exhaustion", u8"原画师过劳", "negative", "normal", "personnel", "staff_fatigue",
     u8"主力原画师连续加班，本周已经出现明显的状态下滑。再压下去可能影响整段作画质量。",
     {2, 3, 4}, 5, 6, false, "max_fatigue", ">=", 78, 0, 0, {},
     {{"accept", "abandon", u8"让他自己调整", 0, {{"instant", "morale", -6, -1}}},
      {"replace", "outsource", u8"临时找外包接手", 320000, {{"stage", "quality", -2, -1}}}}},
    {"supplier_dunning", u8"外包催款", "negative", "normal", "budget", "budget_pressure",
     u8"协力的外包公司来催上一批分镜的尾款，账面这周本来就不宽裕。",
     {1, 2, 3, 4}, 25, 8, false, "funds", "<", 600000, 0, 2,
     {{"instant", "funds", -400000, -1}, {"instant", "morale", -3, -1}},
     {{"accept", "abandon", u8"先结清尾款", 300000, {{"instant", "morale", -2, -1}}},
      {"negotiate", "overtime", u8"商量分期支付", 150000, {{"instant", "morale", -4, -1}}}}},
    {"storyboard_spark", u8"分镜灵光", "positive", "normal", "quality", "creative_spark",
     u8"演出在会议里提了一个更大胆的调度方案，能把这一段的气氛再推高一层，但需要额外的人手配合。",
     {1, 2}, 35, 10, false, "stage_quality", ">=", 70, 0, 0, {},
     {{"take", "accept", u8"采纳方案", 100000, {{"instant", "fatigue", 4, -1}, {"stage", "quality", 3, -1}}},
      {"skip", "decline", u8"按原方案走", 0, {}}}},
    {"station_visit", u8"电视台探班", "positive", "normal", "budget", "external_relations",
     u8"电视台的编成部想来现场看看进度。接待要花钱，但对方的兴趣会体现在后续的资源上。",
     {2, 3}, 40, 12, false, "weeks_in_project", ">=", 6, 25, 0, {},
     {{"host", "accept", u8"接待并展示样片", 60000, {{"instant", "morale", 6, -1}, {"project", "quality", 1, -1}}},
      {"decline", "decline", u8"礼貌婉拒", 0, {}}}},
    {"director_illness", u8"作画监督病倒", "negative", "major", "personnel", "major_director_illness",
     u8"作画监督在连续两周通宵后倒下，医生要求至少静养两周。他手上还压着后半个阶段的检查工作。",
     {2, 3}, 1, 0, true, "max_fatigue", ">=", 65, 0, 0, {},
     {{"accept", "abandon", u8"让副手顶上", 0, {{"stage", "quality", -5, -1}, {"project", "quality", -2, -1}}},
      {"overtime", "overtime", u8"请退休前辈回来救场", 300000, {{"instant", "fatigue", 8, -1}, {"stage", "quality", 2, -1}}},
      {"outsource", "outsource", u8"把检查工作分包出去", 500000, {{"project", "quality", -1, -1}}},
      {"extend", "extension", u8"用掉委员会延期", 250000, {{"instant", "morale", -4, -1}}}}},
    {"sponsor_boost", u8"赞助商送来支援", "positive", "major", "budget", "major_sponsor_boost",
     u8"一家做地方联合宣传的赞助商看中了这部作品的题材，愿意派两位熟手来帮忙赶一段进度。",
     {3, 4}, 2, 0, true, "weeks_in_project", ">=", 10, 15, 0, {},
     {{"take", "accept", u8"接受支援", 0, {{"instant", "work_done", 150, -1}, {"instant", "morale", 3, -1}}},
      {"decline", "decline", u8"不欠这份人情", 0, {}}}}
};

}  // namespace apc::rules
