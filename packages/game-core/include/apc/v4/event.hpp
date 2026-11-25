#pragma once

// v4 Event 领域（M2）：内容卡加载、触发抽取、待处理仲裁与选项校验。
//
// 边界（与 runtime.cpp 的分工）：
// - Event 只写 GameState.events，不直接改 Project/Staff/Finance；
// - 卡片的 effect 是"意图"，由应用层（runtime.cpp）翻译成 Project/Staff/Finance 操作；
// - 目录来自 content/events/*.json，经构建脚本打包成内嵌 JSON 后由本模块解析，
//   运行时代码里没有卡片字面量。

#include <string>
#include <vector>

#include "apc/v4/model.hpp"

namespace apc::v4::event {

// 限时事件的最长有效期（周），与 scripts/lib/event-schema.mjs 保持一致。
inline constexpr int kMaxExpiresWeeks = 8;

struct EffectSpec {
    std::string scope;    // instant / stage / project
    std::string target;   // quality / work_done / fatigue / morale / funds
    std::string stage;    // scope=stage 时的阶段；空表示当前阶段
    int value = 0;
};

struct OptionSpec {
    std::string id;
    std::string label;
    std::string kind;      // accept / abandon / overtime / decline（outsource、extension 预留）
    std::string risk_hint;
    int cost = 0;
    std::vector<EffectSpec> effects;
};

struct EventSpec {
    std::string id;
    std::string name;
    std::string category;    // personnel / quality / budget / schedule
    std::string polarity;    // negative / positive
    std::string tier;        // normal / major
    std::string tag;
    std::vector<std::string> stages;
    int priority = 0;
    int cooldown_weeks = 0;
    bool once_per_project = false;
    std::string metric;      // stage_quality / weeks_to_deadline / max_fatigue / funds / weeks_in_project / min_morale
    std::string op;          // < / <= / > / >=
    int threshold = 0;
    int random_weight = 0;
    int expires_weeks = 0;
    std::string description;
    std::string foreshadow;
    std::vector<OptionSpec> options;
    // DEC-EVENT-002 期限配置（放在末尾以保持既有聚合初始化顺序）。
    std::string timeout_option;         // 到期执行的预设分支；expires_weeks>0 时必填
    bool escalate_on_timeout = false;   // 重大事件可配置的一次超时升级
    int escalated_expires_weeks = 0;    // 升级后的后续响应期限
};

// 内容校验问题：source（文件/内嵌源）、card_id、field 三段都能定位。
struct CatalogIssue {
    std::string source;
    std::string card_id;
    std::string field;
    std::string message;
};

struct Catalog {
    std::vector<EventSpec> events;
    std::vector<CatalogIssue> issues;
    bool ok() const { return issues.empty() && !events.empty(); }
};

// 解析并校验一份 {schema_version, cards:[...]}。source 用于错误定位（构建期是文件路径）。
Catalog parse_catalog(const std::string& json, const std::string& source);

// 构建脚本生成的内嵌卡片包（event_catalog_generated.cpp）。运行时不读文件系统。
const char* embedded_event_cards();

// 内嵌目录（由 scripts/build-event-catalog.mjs 生成 event_catalog_generated.cpp）。
const Catalog& catalog();
const EventSpec* find(const std::string& id);

// 每周结算第 11 阶段调用：为每个 producing 项目各抽取至多一个事件，
// 追加到 events.pending（不覆盖、不丢弃已有事件）。返回周回执片段。
Json draw(GameState& state, int week);

// 玩家查看事件详情（DEC-EVENT-001）：只把目标事件标记为已查看。
// 不应用选项、不扣款、不移除 pending，也不改动其他项目的任何事件。
// 返回 false 表示该项目没有该待处理事件。
bool mark_viewed(GameState& state, const std::string& work_id, const std::string& event_id);

// 未查看的待处理事件数量：advance_week 的推进守卫只看这个数（DEC-EVENT-001）。
int unviewed_count(const GameState& state);

// DEC-EVENT-002 / DEC-TIME-003 阶段 7：限时事件到期处理。
// 只有"已查看且仍未处理"的事件参与倒计时；到期时
// - 配置了一次升级且尚未升级：沿用同一事件身份替换原 pending 条目并进入新期限；
// - 其余情况：产出到期动作，由应用层执行事件预设分支后移除该条。
// 只写 events.pending，不碰 Project/Staff/Finance，也不影响其他项目事件。
struct TimeoutAction {
    std::string work_id;
    std::string event_id;
    std::string option_id;   // 快照中的分支选项 id
};
std::vector<TimeoutAction> expire_deadlines(GameState& state, int week);

// 选项校验：只读待处理事件里的冻结快照，不回查内容目录。
struct Resolution {
    const PendingEvent* pending = nullptr;
    const EventOptionView* option = nullptr;
    std::string code;
    std::string message;
};
// M0 命令 19：resolve_event(work_id, event_id, option_id)，work_id 必填。
Resolution inspect(const GameState& state, const std::string& work_id, const std::string& event_id,
                   const std::string& option_id);

// 测试/构建诊断入口：返回 { ok, count, ids, issues:[{source,card_id,field,message}] }。
Json catalog_report(const std::string& json, const std::string& source);
// 内嵌目录的自检报告（运行时实际使用的那一份）。
Json builtin_catalog_report();

}  // namespace apc::v4::event
