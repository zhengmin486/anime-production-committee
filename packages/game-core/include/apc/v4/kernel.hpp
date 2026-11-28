#pragma once

// v4 规则内核（M1 切片）：坐标式随机、产能与产出、质量增量、工作项分派。
// 纯函数：不读写全局状态、不含 I/O、不依赖时间；同输入必同输出。

#include <array>
#include <cstdint>
#include <string>
#include <vector>

#include "apc/v4/model.hpp"

namespace apc::v4::kernel {

// ---- 坐标式随机 ----
// 同一 (seed, week, stream, purpose, index) 永远得到同一个值，与调用顺序无关。
enum class Stream : std::uint32_t {
    production = 1,
    quality = 2,
    event = 3,
    market = 4,
    competition = 5,
    partner = 6,
    staff = 7,
    misc = 8,
};

std::uint32_t draw(std::uint32_t seed, int week, Stream stream, std::uint32_t purpose, std::uint32_t index);
std::uint32_t draw_below(std::uint32_t seed, int week, Stream stream, std::uint32_t purpose, std::uint32_t index, std::uint32_t bound);
// FNV-1a 32 位文本哈希：purpose 坐标派生（如 hash_text("recruit_scout")）。
std::uint32_t hash_text(const std::string& text);

// ---- 产能 ----
// 员工某能力方向上的周产能，单位千分比（1000 = 1 人周）。
int capacity_permille(const Staff& staff, const std::string& ability);
// 产能换算为工作点：1 人周 = 100 点。
int points_from_capacity(int capacity_permille_value);
// 员工主专业（由岗位推导，未知岗位按最高能力兜底）
std::string staff_specialty(const Staff& staff);
// 专业匹配系数：匹配 1000，不匹配 800
int fit_permille(const Staff& staff, const std::string& ability);

// ---- 员工成长 ----
int experience_for_participation(bool primary);
struct GrowthResult {
    std::array<int, kAbilityCount> experience_gain{};
    std::array<int, kAbilityCount> ability_gain{};
    std::array<bool, kAbilityCount> potential_revealed{};
};
GrowthResult apply_growth(Staff& staff, const std::array<int, kAbilityCount>& experience_gains);
bool reveal_next_potential(Staff& staff);

// ---- 分派 ----
struct ItemAssignment {
    std::string work_id;
    std::string item_id;
    std::string episode_id;      // 公共制作填空串
    std::string stage_key;       // 公共制作填空串
    std::string staff_id;
    std::string ability;         // 该工作项驱动能力
    int points = 0;              // 本周投入该工作项的点数（已按专业匹配缩放）
};

struct ItemCandidate {
    std::string item_id;
    std::string ability;         // 该工作项驱动能力（分配期用，避免重复查表）
    std::string episode_id;
    std::string stage_key;
    int stage_order = 0;         // 公共制作为 -1
    bool target_hit = false;
    bool delivered = false;
    int remaining = 0;
};

bool is_unlocked(const Project& work, const WorkItem& item);
std::vector<ItemCandidate> order_candidates(const Project& work);
// team_permille：团队级系数（监督换项目的团队磨合），默认 1000 表示无惩罚。
std::vector<ItemAssignment> allocate(const Project& work, const std::vector<const Staff*>& staff, int team_permille = 1000);

// ---- 产出与质量 ----
inline constexpr int kQualityMax = 105;

struct ProductionResult {
    int points = 0;                                  // 实际写入工作项的点数
    int quality_gain = 0;                            // 本次质量变化（六维之和，可为负）
    std::array<int, kDimensionCount> quality_by_dim{};
};

// 阶段维度权重（和为 1000）；公共制作按能力主维度返回。
// 这些数值是抽样权重：700/300 意味着本周质量落点有 70% 概率落在前者。
std::array<int, kDimensionCount> dimension_weights(const std::string& stage_key, const std::string& ability);

// 质量传递上限（架构 §7.3.4）：某工作项上限 = min(已交付依赖项质量) × 600‰ + 40。
// 依赖项含公共制作时，公共资产质量低会压低下游项上限——这是公共制作影响作品质量
// 的通道；上限不引入"公共制作单独作品分"，避免同一质量出现两套数字。
std::array<int, kDimensionCount> quality_caps(const Project& work, const WorkItem& item);

// 把产出写入工作项：累加 work_done、按维度写入质量评级、记录参与者。
//
// 质量是"评级"而不是"工作量换算"：每次投入给出一个 0..100 的质量样本，
// 样本只由员工能力、专业适配与该周独立随机决定；工作项记录的是样本的逐步逼近值，
// 因此投入点数翻倍不会让质量翻倍，同一工作量也会因人和随机得到不同结果。
// 随机坐标取 (seed, week, quality, hash(item|staff), 0)，与分派顺序、同期人数无关。
ProductionResult apply_production(WorkItem& item, const Staff& staff, int points, bool hands_over,
                                  std::uint32_t seed, int week, const std::string& stage_key,
                                  const std::array<int, kDimensionCount>& caps);

// ---- 磨合 ----
bool is_supervisor(const std::string& role);
// 判定是否"接手他人已开工的工作"：只看本周开始前的进度与参与者，避免同周多人协作被误判。
// prior_work_done：本周开始前该工作项已完成量；prior_contributed：本周开始前该员工是否参与过。
bool hands_over_item(int prior_work_done, int work_total, bool prior_contributed, const std::string& role);
bool supervisor_switched(const Staff& staff, const std::string& work_id);
int supervisor_switch_penalty(int points);
// 项目本周团队产能系数：有监督人员换入时为 900，否则 1000。
// 系数只在这里定义一次，避免 runtime 与内核各写一份而漂移。
int team_capacity_permille(bool supervisor_switched_in);

// ---- 质量聚合（§7.3.4）----
// 工作项 → 阶段（按 work_total 加权）→ 单集（阶段等权）→ 作品（单集等权）。
// 未接触过的工作项质量记 0，所以开发中期的作品质量会随覆盖面扩大而上升；
// 这是"目前这部作品的质量档案"，不是"已投入部分的平均"。
// 公共制作不单独出作品分：它通过依赖门槛与 quality_caps 影响下游工作项上限。
struct AggregatedQuality {
    std::array<int, kDimensionCount> dims{};
    int mean = 0;   // 六维均值，供总览显示；最终评级由 evaluation 决定（M5）
};

AggregatedQuality aggregate_stage(const EpisodeStage& stage);
AggregatedQuality aggregate_episode(const Episode& episode);
AggregatedQuality aggregate_work(const Project& work);

// ---- 费用（周结算的强制成本，[PLACEHOLDER] 数值）----
int64_t weekly_operations_cost();
int64_t weekly_production_cost(const std::string& intensity);

}  // namespace apc::v4::kernel
