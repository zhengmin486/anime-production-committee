#pragma once

// v4 Event 领域（M2）：内容卡加载、触发抽取、待处理仲裁与选项校验。
//
// 边界（与 runtime.cpp 的分工）：
// - Event 只写 GameState.events，不直接改 Project/Staff/Finance；
// - 卡片的 effect 是"意图"，由应用层（runtime.cpp）翻译成 Project/Staff/Finance 操作；
// - 目录来自 content/events/*.json，经构建脚本打包成内嵌 JSON 后由本模块解析，
//   运行时代码里没有卡片字面量。

#include <optional>
#include <string>
#include <vector>

#include "apc/v4/model.hpp"

namespace apc::v4::event {

struct EffectSpec {
    std::string scope;    // instant / stage / project
    std::string target;   // quality / work_done / fatigue / morale / funds
    std::string stage;    // scope=stage 时的阶段；空表示当前阶段
    int value = 0;
};

// #122：事件应急外包的冻结请求载荷。work_id 取 pending 归属、mode 固定 emergency，
// 两者都不在内容卡中重复传参；资格/报价/产能/付款由 Vendor 域内部函数负责。
struct VendorRequestSpec {
    std::string item_id;
    std::string supplier_id;
    int work_total = 0;
};

struct OptionSpec {
    std::string id;
    std::string label;
    std::string kind;      // accept / abandon / overtime / decline（outsource、extension 预留）
    std::string risk_hint;
    int cost = 0;
    std::vector<EffectSpec> effects;
    std::optional<VendorRequestSpec> vendor_request;
};

// #121 / DEC-EVENT-003：一次升级的内容载荷。expires_weeks 冻结为 2，
// timeout_option_id 指向 escalation options[] 中的强制处理/硬罚分支。
struct EscalationSpec {
    std::string description;
    int expires_weeks = 0;
    std::vector<OptionSpec> options;
    std::string timeout_option_id;
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
    std::string timeout_option_id;               // 首次超时轻罚分支
    std::optional<EscalationSpec> escalation;   // 至多一层
    std::string escalation_note;
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

// 每周结算第 8 阶段调用：为每个 producing 项目各抽取至多一个事件，
// 追加到 events.pending（不覆盖、不丢弃已有事件）。返回周回执片段。
Json draw(GameState& state, int week);

// 选项校验：只读待处理事件里的冻结快照，不回查内容目录。
struct Resolution {
    const PendingEvent* pending = nullptr;
    const EventOptionView* option = nullptr;
    std::string code;
    std::string message;
};
// M0 命令 18：resolve_event(work_id, event_id, option_id)，work_id 必填。
Resolution inspect(const GameState& state, const std::string& work_id, const std::string& event_id,
                   const std::string& option_id);

// 测试/构建诊断入口：返回 { ok, count, ids, issues:[{source,card_id,field,message}] }。
Json catalog_report(const std::string& json, const std::string& source);
// 内嵌目录的自检报告（运行时实际使用的那一份）。
Json builtin_catalog_report();

}  // namespace apc::v4::event
