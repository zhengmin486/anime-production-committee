#pragma once

#include <array>
#include <cstdint>
#include <nlohmann/json.hpp>

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


}  // namespace apc::rules
