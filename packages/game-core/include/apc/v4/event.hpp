#pragma once

// v4 Event 域（M2 最小闭环）：事件目录、触发、待处理实例、选项校验。
// 边界：本模块只写 GameState.events；效果由应用层（runtime.cpp）翻译成
// Project/Staff/Finance 的公开操作，Event 不直接写这些领域的字段。
// 设计见 docs/EVENT_DOMAIN_DESIGN_V4.md。

#include <cstdint>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "apc/v4/model.hpp"

namespace apc::v4::event {

using Json = nlohmann::json;

struct Effect {
    std::string scope;   // instant / stage
    std::string target;  // quality / work_done / fatigue / morale
    int value = 0;
    std::string stage;   // 空 = 全部阶段；仅 stage 域使用
};

struct OptionSpec {
    std::string id;
    std::string kind;    // accept / decline / overtime / abandon
    std::string label;
    std::string risk_hint;
    std::int64_t cost = 0;
    std::vector<Effect> effects;
};

struct Spec {
    std::string id;
    std::string name;
    std::string polarity;      // negative / positive
    std::string tier;          // normal / major
    std::string category;      // personnel / quality / budget / schedule
    std::string tag;           // 冷却分组
    std::vector<std::string> stages;
    int priority = 50;         // 越小越优先
    int cooldown_weeks = 0;
    bool once_per_project = false;
    std::string metric;        // work_quality / max_fatigue / weeks_to_deadline
    std::string op;            // < <= > >=
    int threshold = 0;
    int random_weight = 0;     // 0 = 只靠表现触发
    std::vector<OptionSpec> options;
};

const std::vector<Spec>& catalog();
const Spec* find(const std::string& id);

// 触发评估（只读）。
Json draw(GameState& state, int week);

// 处理校验：成功时 spec/option 非空；失败时 code/message 非空。
// 不修改状态。
struct Resolution {
    const Spec* spec = nullptr;
    const OptionSpec* option = nullptr;
    std::string code;
    std::string message;
};
Resolution inspect(const GameState& state, const std::string& event_id, const std::string& option_id);

// 事件归属项目（pending 里记录的 work_id）。
const Project* owner(const GameState& state, const std::string& work_id);

}  // namespace apc::v4::event
