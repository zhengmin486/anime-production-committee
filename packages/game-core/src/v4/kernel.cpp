#include "apc/v4/kernel.hpp"

#include <algorithm>
#include <map>

namespace apc::v4::kernel {
namespace {

// ---- 平衡参数（全部 [PLACEHOLDER]，由模拟标定；此处数值只用于 M1 可测性）----
constexpr int kBaseCapacity = 1000;          // 千分比，1.00 人周
constexpr int kAbilityBase = 500;            // 能力 0 → 0.50
constexpr int kAbilityPerPoint = 5;          // 能力 100 → 1.00
constexpr int kMoraleBase = 600;
constexpr int kMoralePerPoint = 4;           // 士气 0 → 0.60，100 → 1.00
constexpr int kFatigueBase = 1000;
constexpr int kFatiguePerPoint = 4;          // 疲劳 0 → 1.00，100 → 0.60
constexpr int kFitMatch = 1000;
constexpr int kFitMismatch = 800;
constexpr int kPointsPerStaffWeek = 100;     // 1 人周 = 100 工作点
constexpr int kHandoverLoss = 250;           // 接手磨合：该员工在该项产出扣 25%
constexpr int kSupervisorSwitchLoss = 100;   // 监督换项目：团队级扣 10%
constexpr int kQualityApproach = 300;        // 质量评级向本周样本靠拢 30%
constexpr int kCarryOverPermille = 600;      // 质量传递上限：依赖质量的 60%
constexpr int kCarryOverOffset = 40;         // 质量传递上限：+40

int clamp(int value, int low, int high) { return std::max(low, std::min(high, value)); }

std::uint64_t splitmix64(std::uint64_t value) {
    value += 0x9E3779B97F4A7C15ULL;
    value = (value ^ (value >> 30U)) * 0xBF58476D1CE4E5B9ULL;
    value = (value ^ (value >> 27U)) * 0x94D049BB133111EBULL;
    return value ^ (value >> 31U);
}

int ability_value(const Staff& staff, const std::string& ability) {
    const int index = ability_index(ability);
    return index < 0 ? 0 : staff.abilities[static_cast<std::size_t>(index)];
}

std::uint32_t hash_text(const std::string& text) {
    std::uint32_t value = 2166136261U;
    for (const char ch : text) {
        value ^= static_cast<std::uint8_t>(ch);
        value *= 16777619U;
    }
    return value;
}

struct FlatItem {
    const WorkItem* item = nullptr;
    std::string episode_id;
    std::string stage_key;
    int stage_order = -1;
};

std::vector<FlatItem> flatten(const Project& work) {
    std::vector<FlatItem> items;
    for (const auto& item : work.common.items) items.push_back({&item, std::string{}, std::string{}, -1});
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            const int order = stage_index(stage.key);
            for (const auto& item : stage.items) items.push_back({&item, episode.id, stage.key, order});
        }
    }
    return items;
}

bool target_hit(const Project& work, const std::string& episode_id, const std::string& stage_key) {
    if (!work.plan.target) return false;
    const auto& target = *work.plan.target;
    if (target.kind == "episode") return episode_id == target.id;
    if (target.kind == "stage") return stage_key == target.id;
    return false;
}

}  // namespace

std::uint32_t draw(std::uint32_t seed, int week, Stream stream, std::uint32_t purpose, std::uint32_t index) {
    std::uint64_t mixed = 0x9E3779B97F4A7C15ULL;
    mixed ^= static_cast<std::uint64_t>(seed) * 0x9E3779B97F4A7C15ULL;
    mixed ^= static_cast<std::uint64_t>(static_cast<std::uint32_t>(week)) * 0xC2B2AE3D27D4EB4FULL;
    mixed ^= static_cast<std::uint64_t>(stream) * 0x165667B19E3779F9ULL;
    mixed ^= static_cast<std::uint64_t>(purpose) * 0x27D4EB2F165667C5ULL;
    mixed ^= static_cast<std::uint64_t>(index) * 0x9E3779B185EBCA87ULL;
    return static_cast<std::uint32_t>(splitmix64(mixed) >> 32U);
}

std::uint32_t draw_below(std::uint32_t seed, int week, Stream stream, std::uint32_t purpose, std::uint32_t index, std::uint32_t bound) {
    if (bound == 0) return 0;
    return draw(seed, week, stream, purpose, index) % bound;
}

std::string staff_specialty(const Staff& staff) {
    static const std::map<std::string, std::string> by_role{
        {"director", "direction"},
        {"scriptwriter", "planning"},
        {"animation_director", "direction"},
        {"key_animator", "drawing"},
        {"animator", "animation"},
        {"production_manager", "management"},
        {"postproduction", "postproduction"},
    };
    const auto hit = by_role.find(staff.role);
    if (hit != by_role.end()) return hit->second;

    int best = -1;
    int best_index = 0;
    for (int i = 0; i < kAbilityCount; ++i) {
        if (staff.abilities[static_cast<std::size_t>(i)] > best) {
            best = staff.abilities[static_cast<std::size_t>(i)];
            best_index = i;
        }
    }
    return kAbilities[static_cast<std::size_t>(best_index)];
}

int fit_permille(const Staff& staff, const std::string& ability) {
    return staff_specialty(staff) == ability ? kFitMatch : kFitMismatch;
}

int capacity_permille(const Staff& staff, const std::string& ability) {
    const int ability_q = kAbilityBase + ability_value(staff, ability) * kAbilityPerPoint;
    const int morale_q = kMoraleBase + clamp(staff.morale, 0, 100) * kMoralePerPoint;
    const int fatigue_q = kFatigueBase - clamp(staff.fatigue, 0, 100) * kFatiguePerPoint;
    const int fit_q = fit_permille(staff, ability);

    int capacity = kBaseCapacity;
    capacity = capacity * ability_q / 1000;
    capacity = capacity * morale_q / 1000;
    capacity = capacity * fatigue_q / 1000;
    capacity = capacity * fit_q / 1000;
    return capacity;
}

int points_from_capacity(int capacity_permille_value) {
    return capacity_permille_value * kPointsPerStaffWeek / 1000;
}

namespace {

// 质量样本：能力（0..100）+ 专业适配 ±4 + 独立随机 ±5。
// 与投入点数无关——同一份工作量，不同的人、不同的周得到不同质量。
int quality_sample(const Staff& staff, const std::string& ability, std::uint32_t seed, int week,
                   std::uint32_t purpose, int dimension) {
    const int base = ability_value(staff, ability);
    const int fit = staff_specialty(staff) == ability ? 4 : -4;
    const std::uint32_t jitter =
        draw_below(seed, week, Stream::quality, purpose, static_cast<std::uint32_t>(dimension + 1), 11);
    return clamp(base + fit + static_cast<int>(jitter) - 5, 0, 100);
}

// 按权重抽取维度：700/300 真的按 7:3，不是"在非零维度里等概率"。
int weighted_dimension(const std::array<int, kDimensionCount>& weights, int roll) {
    for (int i = 0; i < kDimensionCount; ++i) {
        const int weight = weights[static_cast<std::size_t>(i)];
        if (weight <= 0) continue;
        if (roll < weight) return i;
        roll -= weight;
    }
    for (int i = kDimensionCount - 1; i >= 0; --i) {
        if (weights[static_cast<std::size_t>(i)] > 0) return i;
    }
    return -1;
}

}  // namespace

bool is_unlocked(const Project& work, const WorkItem& item) {
    for (const auto& dep_id : item.deps) {
        const WorkItem* dep = find_item(work, dep_id);
        if (dep == nullptr) return false;   // 悬空依赖视为未解锁；结构校验另行报错
        if (!dep->delivered()) return false;
    }
    return true;
}

std::vector<ItemCandidate> order_candidates(const Project& work) {
    std::vector<ItemCandidate> candidates;
    for (const auto& entry : flatten(work)) {
        const WorkItem& item = *entry.item;
        if (!is_unlocked(work, item) || item.complete()) continue;
        ItemCandidate candidate;
        candidate.item_id = item.id;
        candidate.ability = item.ability;
        candidate.episode_id = entry.episode_id;
        candidate.stage_key = entry.stage_key;
        candidate.stage_order = entry.stage_order;
        candidate.target_hit = target_hit(work, entry.episode_id, entry.stage_key);
        candidate.delivered = item.delivered();
        candidate.remaining = item.remaining();
        candidates.push_back(std::move(candidate));
    }

    // 排序优先级严格按架构 §7.3.5：定向 > 未达门槛 > 阶段 > 取向 > id。
    // 取向只允许在"同一门槛状态、同一阶段"内调整先后，不得反过来压过门槛优先级
    // —— 否则已过门槛的项会持续吸走产能，下游永远不解锁。
    const std::string focus = work.plan.focus;
    std::sort(candidates.begin(), candidates.end(), [&focus](const ItemCandidate& a, const ItemCandidate& b) {
        if (a.target_hit != b.target_hit) return a.target_hit;                    // 1 定向优先
        if (a.delivered != b.delivered) return !a.delivered;                      // 2 未达门槛优先
        if (a.stage_order != b.stage_order) return a.stage_order < b.stage_order;  // 3 阶段靠前优先
        if (focus == "schedule") {
            if (a.remaining != b.remaining) return a.remaining < b.remaining;      // 4 进度取向：先收尾
        } else if (focus == "cost") {
            if (a.remaining != b.remaining) return a.remaining > b.remaining;      // 4 成本取向：先集中大项
        }
        // quality 取向不额外排序：同一阶段内各工作项的质量权重相同（见 dimension_weights），
        // 它的作用体现在"往哪一维记质量"，不体现在先后。阶段之间已由第 3 条决定。
        return a.item_id < b.item_id;                                              // 5 id 兜底
    });
    return candidates;
}

std::vector<ItemAssignment> allocate(const Project& work, const std::vector<const Staff*>& staff, int team_permille) {
    std::vector<ItemAssignment> assignments;
    std::vector<ItemCandidate> candidates = order_candidates(work);
    if (candidates.empty()) return assignments;

    std::vector<const Staff*> ordered = staff;
    std::sort(ordered.begin(), ordered.end(), [](const Staff* a, const Staff* b) { return a->id < b->id; });

    // 分配期按"未被占用的剩余量"顺序扣减，避免同一周多人重复承诺同一段工作量。
    std::map<std::string, int> remaining;
    for (const auto& candidate : candidates) remaining[candidate.item_id] = candidate.remaining;

    for (const Staff* member : ordered) {
        // 周产能按主专业计算（fit=1000），跨专业时在逐项投入上打折，避免双重折扣。
        int budget = points_from_capacity(capacity_permille(*member, staff_specialty(*member)));
        budget = budget * team_permille / 1000;
        for (const auto& candidate : candidates) {
            if (budget <= 0) break;
            const int available = remaining[candidate.item_id];
            if (available <= 0) continue;
            const int take = std::min(budget, available);
            if (take <= 0) continue;
            // 四舍五入而非截断：否则剩余量很小的项会算出 0 点，一周投入凭空消失。
            const int scaled = (take * fit_permille(*member, candidate.ability) + 500) / 1000;
            assignments.push_back(ItemAssignment{work.id, candidate.item_id, candidate.episode_id, candidate.stage_key,
                                                 member->id, candidate.ability, scaled});
            remaining[candidate.item_id] -= take;
            budget -= take;
        }
    }
    return assignments;
}

std::array<int, kDimensionCount> dimension_weights(const std::string& stage_key, const std::string& ability) {
    std::array<int, kDimensionCount> weights{};
    const int order = stage_index(stage_key);
    auto set = [&weights](const char* dim, int value) {
        const int index = dimension_index(dim);
        if (index >= 0) weights[static_cast<std::size_t>(index)] = value;
    };
    switch (order) {
        case 0: set("story", 700); set("direction", 300); break;
        case 1: set("direction", 500); set("drawing", 500); break;
        case 2: set("animation", 700); set("drawing", 300); break;
        case 3: set("art", 800); set("drawing", 200); break;
        case 4: set("art", 600); set("direction", 400); break;
        case 5: set("sound", 800); set("art", 200); break;
        default:
            if (ability == "planning") set("story", 1000);
            else if (ability == "direction") set("direction", 1000);
            else if (ability == "drawing") set("drawing", 1000);
            else if (ability == "animation") set("animation", 1000);
            else if (ability == "management") set("direction", 1000);
            else if (ability == "postproduction") set("sound", 1000);
            break;
    }
    return weights;
}

ProductionResult apply_production(WorkItem& item, const Staff& staff, int points, bool hands_over,
                                  std::uint32_t seed, int week, const std::string& stage_key,
                                  const std::array<int, kDimensionCount>& caps) {
    ProductionResult result;
    int effective = points;
    if (hands_over) effective = points * (1000 - kHandoverLoss) / 1000;
    const int gain = std::min(std::max(effective, 0), item.remaining());
    if (gain <= 0) return result;

    item.work_done += gain;
    result.points = gain;

    if (std::find(item.contributors.begin(), item.contributors.end(), staff.id) == item.contributors.end()) {
        item.contributors.push_back(staff.id);
    }

    // 质量是评级，不是工作量换算：
    // - 每次投入给出一个"这批活做得怎么样"的样本，样本只由能力、专业适配与独立随机决定；
    // - 工作项记录样本的逐步逼近值，因此工作量翻倍不会让质量翻倍；
    // - 工作量的作用只体现在 work_done / 解锁 / 交付，不进入质量公式。
    const auto weights = dimension_weights(stage_key, item.ability);
    int total_weight = 0;
    for (int i = 0; i < kDimensionCount; ++i) total_weight += std::max(weights[static_cast<std::size_t>(i)], 0);
    if (total_weight <= 0) return result;

    // 落点按权重抽取：700/300 意味着 70% / 30%，而不是"非零维度里等概率"。
    const std::uint32_t purpose = hash_text(item.id + "|" + staff.id);
    const int roll = static_cast<int>(draw_below(seed, week, Stream::quality, purpose, 0,
                                                 static_cast<std::uint32_t>(total_weight)));
    const int dim = weighted_dimension(weights, roll);
    if (dim < 0) return result;

    const int sample = quality_sample(staff, item.ability, seed, week, purpose, dim);
    const int before = item.quality.dims[static_cast<std::size_t>(dim)];
    int after = before <= 0
                    ? sample
                    : before + (sample - before) * kQualityApproach / 1000;
    after = clamp(after, 0, std::min(caps[static_cast<std::size_t>(dim)], 100));
    item.quality.dims[static_cast<std::size_t>(dim)] = after;
    result.quality_by_dim[static_cast<std::size_t>(dim)] = after - before;
    result.quality_gain = after - before;
    return result;
}

std::array<int, kDimensionCount> quality_caps(const Project& work, const WorkItem& item) {
    std::array<int, kDimensionCount> caps;
    caps.fill(100);
    for (const auto& dep_id : item.deps) {
        const WorkItem* dep = find_item(work, dep_id);
        if (dep == nullptr || !dep->delivered()) continue;
        for (int i = 0; i < kDimensionCount; ++i) {
            const int cap = dep->quality.dims[static_cast<std::size_t>(i)] * kCarryOverPermille / 1000 + kCarryOverOffset;
            caps[static_cast<std::size_t>(i)] = std::min(caps[static_cast<std::size_t>(i)], std::min(cap, 100));
        }
    }
    return caps;
}

bool is_supervisor(const std::string& role) {
    return role == "director" || role == "animation_director" || role == "production_manager";
}

bool hands_over_item(int prior_work_done, int work_total, bool prior_contributed, const std::string& role) {
    if (is_supervisor(role)) return false;          // 监督人员走团队级判定
    if (prior_work_done <= 0) return false;         // 本周开始前未开工：不算接手
    if (prior_work_done >= work_total) return false; // 已完成：分配不到
    return !prior_contributed;
}

bool supervisor_switched(const Staff& staff, const std::string& work_id) {
    if (!is_supervisor(staff.role)) return false;
    // 从未参与过任何项目不算"切换"；只有确实从别的项目转过来才产生团队级磨合。
    if (!staff.last_participation) return false;
    return staff.last_participation->work_id != work_id;
}

int supervisor_switch_penalty(int points) { return points * kSupervisorSwitchLoss / 1000; }

int team_capacity_permille(bool supervisor_switched_in) {
    return supervisor_switched_in ? 1000 - kSupervisorSwitchLoss : 1000;
}

// ---------------- 质量聚合 ----------------

namespace {

int mean_of(const std::array<int, kDimensionCount>& dims) {
    int sum = 0;
    for (const int value : dims) sum += value;
    return (sum + kDimensionCount / 2) / kDimensionCount;
}

}  // namespace

AggregatedQuality aggregate_stage(const EpisodeStage& stage) {
    AggregatedQuality result;
    int weight_total = 0;
    for (const auto& item : stage.items) {
        const int weight = std::max(item.work_total, 0);
        weight_total += weight;
        for (int i = 0; i < kDimensionCount; ++i) {
            result.dims[static_cast<std::size_t>(i)] +=
                item.quality.dims[static_cast<std::size_t>(i)] * weight;
        }
    }
    if (weight_total > 0) {
        for (int i = 0; i < kDimensionCount; ++i) {
            result.dims[static_cast<std::size_t>(i)] =
                (result.dims[static_cast<std::size_t>(i)] + weight_total / 2) / weight_total;
        }
    }
    result.mean = mean_of(result.dims);
    return result;
}

AggregatedQuality aggregate_episode(const Episode& episode) {
    AggregatedQuality result;
    // M1 用阶段等权；六阶段模板权重属于内容配置，等平衡阶段再定
    if (episode.stages.empty()) return result;
    for (const auto& stage : episode.stages) {
        const auto stage_quality = aggregate_stage(stage);
        for (int i = 0; i < kDimensionCount; ++i) {
            result.dims[static_cast<std::size_t>(i)] += stage_quality.dims[static_cast<std::size_t>(i)];
        }
    }
    const int count = static_cast<int>(episode.stages.size());
    for (int i = 0; i < kDimensionCount; ++i) {
        result.dims[static_cast<std::size_t>(i)] =
            (result.dims[static_cast<std::size_t>(i)] + count / 2) / count;
    }
    result.mean = mean_of(result.dims);
    return result;
}

AggregatedQuality aggregate_work(const Project& work) {
    AggregatedQuality result;
    if (work.episodes.empty()) return result;
    for (const auto& episode : work.episodes) {
        const auto episode_quality = aggregate_episode(episode);
        for (int i = 0; i < kDimensionCount; ++i) {
            result.dims[static_cast<std::size_t>(i)] += episode_quality.dims[static_cast<std::size_t>(i)];
        }
    }
    const int count = static_cast<int>(work.episodes.size());
    for (int i = 0; i < kDimensionCount; ++i) {
        result.dims[static_cast<std::size_t>(i)] =
            (result.dims[static_cast<std::size_t>(i)] + count / 2) / count;
    }
    result.mean = mean_of(result.dims);
    return result;
}

int64_t weekly_operations_cost() { return 30000; }

int64_t weekly_production_cost(const std::string& intensity) {
    const int64_t base = 60000;
    if (intensity == "low") return base * 800 / 1000;
    if (intensity == "high") return base * 1300 / 1000;
    return base;
}

}  // namespace apc::v4::kernel
