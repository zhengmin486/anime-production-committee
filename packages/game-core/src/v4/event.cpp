#include "apc/v4/event.hpp"

#include <algorithm>
#include <cstdint>
#include <limits>
#include <set>
#include <string>
#include <vector>

#include "apc/v4/kernel.hpp"

namespace apc::v4::event {
namespace {

constexpr int kCatalogSchemaVersion = 1;

std::uint32_t fnv1a(const std::string& text) {
    std::uint32_t hash = 2166136261U;
    for (const char ch : text) {
        hash ^= static_cast<std::uint8_t>(ch);
        hash *= 16777619U;
    }
    return hash;
}

bool one_of(const std::string& value, std::initializer_list<const char*> allowed) {
    for (const char* candidate : allowed) {
        if (value == candidate) return true;
    }
    return false;
}

bool is_int(const Json& value) { return value.is_number_integer(); }

// 校验上下文：所有错误都带 source / card_id / field，内容作者能直接定位。
struct Checker {
    std::string source;
    std::vector<CatalogIssue>* issues = nullptr;

    void fail(const std::string& card_id, const std::string& field, const std::string& message) {
        issues->push_back(CatalogIssue{source, card_id, field, message});
    }
};

std::string text_field(const Json& object, const char* key) {
    if (object.contains(key) && object.at(key).is_string()) return object.at(key).get<std::string>();
    return {};
}

int int_field(const Json& object, const char* key, int fallback = 0) {
    if (object.contains(key) && object.at(key).is_number_integer()) return object.at(key).get<int>();
    return fallback;
}

bool bool_field(const Json& object, const char* key, bool fallback = false) {
    if (object.contains(key) && object.at(key).is_boolean()) return object.at(key).get<bool>();
    return fallback;
}

bool known_stage(const std::string& key) { return key.empty() || stage_index(key) >= 0; }

std::vector<OptionSpec> parse_options(const Json& raw, const char* key, const std::string& id,
                                      const std::string& prefix, Checker& checker,
                                      const std::vector<std::string>& stages) {
    std::vector<OptionSpec> options;
    if (!raw.contains(key) || !raw.at(key).is_array() || raw.at(key).empty()) {
        checker.fail(id, prefix, prefix + " 必须是非空数组");
        return options;
    }
    int index = 0;
    for (const auto& raw_option : raw.at(key)) {
        const std::string where = prefix + "[" + std::to_string(index++) + "]";
        if (!raw_option.is_object()) {
            checker.fail(id, where, "选项必须是对象");
            continue;
        }
        OptionSpec option;
        option.id = text_field(raw_option, "id");
        option.label = text_field(raw_option, "label");
        option.kind = text_field(raw_option, "kind");
        option.risk_hint = text_field(raw_option, "risk_hint");
        option.cost = int_field(raw_option, "cost", 0);
        if (option.id.empty()) checker.fail(id, where + ".id", "缺少选项 id");
        if (option.label.empty()) checker.fail(id, where + ".label", "缺少选项文案");
        if (!one_of(option.kind, {"accept", "abandon", "overtime", "decline", "outsource", "extension"})) {
            checker.fail(id, where + ".kind", "未知选项类型");
        }
        if (option.cost < 0 || option.cost > 2000000) {
            checker.fail(id, where + ".cost", "cost 必须在 0..2,000,000");
        }
        // #122：只有 kind=outsource 的选项可以带 vendor_request，且三项必须齐全。
        if (raw_option.contains("vendor_request") && !raw_option.at("vendor_request").is_null()) {
            if (option.kind != "outsource") {
                checker.fail(id, where + ".vendor_request", "只有 kind=outsource 的选项可配置 vendor_request");
            } else if (!raw_option.at("vendor_request").is_object()) {
                checker.fail(id, where + ".vendor_request", "vendor_request 必须是对象或 null");
            } else {
                const auto& raw_vendor = raw_option.at("vendor_request");
                VendorRequestSpec request;
                request.item_id = text_field(raw_vendor, "item_id");
                request.supplier_id = text_field(raw_vendor, "supplier_id");
                request.work_total = int_field(raw_vendor, "work_total", 0);
                if (request.item_id.empty()) checker.fail(id, where + ".vendor_request.item_id", "缺少 item_id");
                if (request.supplier_id.empty()) checker.fail(id, where + ".vendor_request.supplier_id", "缺少 supplier_id");
                if (request.work_total <= 0 || request.work_total > std::numeric_limits<int>::max()) {
                    checker.fail(id, where + ".vendor_request.work_total", "work_total 必须是正整型工作量");
                }
                option.vendor_request = std::move(request);
            }
        }
        if (raw_option.contains("effects")) {
            if (!raw_option.at("effects").is_array()) {
                checker.fail(id, where + ".effects", "effects 必须是数组");
            } else {
                int effect_index = 0;
                for (const auto& raw_effect : raw_option.at("effects")) {
                    const std::string ep = where + ".effects[" + std::to_string(effect_index++) + "]";
                    if (!raw_effect.is_object()) {
                        checker.fail(id, ep, "效果必须是对象");
                        continue;
                    }
                    EffectSpec effect;
                    effect.scope = text_field(raw_effect, "scope");
                    effect.target = text_field(raw_effect, "target");
                    effect.stage = text_field(raw_effect, "stage");
                    effect.value = int_field(raw_effect, "value", 0);
                    if (!one_of(effect.scope, {"instant", "stage", "project"})) {
                        checker.fail(id, ep + ".scope", "scope 只能是 instant/stage/project");
                    }
                    if (!one_of(effect.target, {"quality", "work_done", "fatigue", "morale", "funds"})) {
                        checker.fail(id, ep + ".target", "未知效果类型");
                        continue;
                    }
                    if (effect.value == 0) checker.fail(id, ep + ".value", "value 不能为 0");
                    if (!known_stage(effect.stage)) checker.fail(id, ep + ".stage", "未知阶段");
                    if (!effect.stage.empty() && effect.scope != "stage") {
                        checker.fail(id, ep + ".stage", "只有 scope=stage 才能写 stage");
                    }
                    if (!effect.stage.empty() && !stages.empty() &&
                        std::find(stages.begin(), stages.end(), effect.stage) == stages.end()) {
                        checker.fail(id, ep + ".stage", "效果阶段不在卡片适用阶段内");
                    }
                    if ((effect.target == "fatigue" || effect.target == "morale" || effect.target == "funds") &&
                        effect.scope != "instant") {
                        checker.fail(id, ep + ".scope", effect.target + " 只能即时结算");
                    }
                    if (effect.target == "funds" && effect.value > 0) {
                        checker.fail(id, ep + ".value", "事件收入分类未定：funds 只能为负");
                    }
                    if (effect.target == "funds" && effect.value < -2000000) {
                        checker.fail(id, ep + ".value", "单次扣款不能超过 2,000,000");
                    }
                    option.effects.push_back(effect);
                }
            }
        }
        options.push_back(std::move(option));
    }
    return options;
}

bool conservative_option(const std::vector<OptionSpec>& options, const std::string& id) {
    for (const auto& option : options) {
        if (option.id != id) continue;
        return option.kind == "abandon" || option.kind == "decline";
    }
    return false;
}

void parse_escalation(const Json& raw, const std::string& id, Checker& checker,
                      const std::vector<std::string>& stages, EventSpec& spec) {
    if (raw.contains("timeout_option_id") && !raw.at("timeout_option_id").is_null() &&
        !raw.at("timeout_option_id").is_string()) {
        checker.fail(id, "timeout_option_id", "timeout_option_id 必须是字符串");
    }
    if (raw.contains("escalation_note") && !raw.at("escalation_note").is_null() &&
        !raw.at("escalation_note").is_string()) {
        checker.fail(id, "escalation_note", "escalation_note 必须是字符串");
    } else {
        spec.escalation_note = text_field(raw, "escalation_note");
    }
    if (!raw.contains("escalation") || raw.at("escalation").is_null()) return;
    const auto& node = raw.at("escalation");
    if (!node.is_object()) {
        checker.fail(id, "escalation", "escalation 必须是对象或 null");
        return;
    }
    if (spec.expires_weeks <= 0) checker.fail(id, "escalation", "只有限时事件（expires_weeks>0）可配置升级");
    if (spec.tier != "major") checker.fail(id, "escalation", "escalation 只允许 major 事件");
    if (node.contains("escalation") && !node.at("escalation").is_null()) {
        checker.fail(id, "escalation.escalation", "升级最多一层，禁止嵌套升级");
    }
    EscalationSpec parsed;
    parsed.description = text_field(node, "description");
    if (parsed.description.empty()) checker.fail(id, "escalation.description", "缺少升级描述");
    parsed.expires_weeks = int_field(node, "expires_weeks", 0);
    if (parsed.expires_weeks != 2) checker.fail(id, "escalation.expires_weeks", "升级后处理期限固定为 2 周");
    parsed.options = parse_options(node, "options", id, "escalation.options", checker, stages);
    if (std::none_of(parsed.options.begin(), parsed.options.end(),
                     [](const OptionSpec& option) { return option.kind == "abandon"; })) {
        checker.fail(id, "escalation.options", "升级选项必须含 abandon 默认分支");
    }
    parsed.timeout_option_id = text_field(node, "timeout_option_id");
    if (!conservative_option(parsed.options, parsed.timeout_option_id)) {
        checker.fail(id, "escalation.timeout_option_id",
                     "二次硬罚分支必须指向 escalation.options 中 kind=abandon/decline 的一项");
    }
    spec.escalation = std::move(parsed);
    spec.timeout_option_id = text_field(raw, "timeout_option_id");
    if (!conservative_option(spec.options, spec.timeout_option_id)) {
        checker.fail(id, "timeout_option_id",
                     "配置升级时 timeout_option_id 必须指向本卡 options 中 kind=abandon/decline 的一项");
    }
}

bool parse_card(const Json& raw, Checker& checker, std::set<std::string>& ids, EventSpec& out) {
    if (!raw.is_object()) {
        checker.fail("", "", "卡片必须是对象");
        return false;
    }
    const std::string id = text_field(raw, "id");
    if (id.empty()) checker.fail("", "id", "缺少稳定 id");
    else if (id.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789_") != std::string::npos) {
        checker.fail(id, "id", "id 只允许小写字母、数字和下划线");
    } else if (!ids.insert(id).second) {
        checker.fail(id, "id", "重复的事件 id");
    }

    if (!raw.contains("schema_version") || !is_int(raw.at("schema_version")) ||
        raw.at("schema_version").get<int>() != kCatalogSchemaVersion) {
        checker.fail(id, "schema_version", "卡片 schema_version 必须为 1");
    }

    const std::string name = text_field(raw, "name");
    if (name.empty()) checker.fail(id, "name", "缺少 name");
    const std::string category = text_field(raw, "category");
    if (!one_of(category, {"personnel", "quality", "budget", "schedule"})) {
        checker.fail(id, "category", "category 只能是 personnel/quality/budget/schedule");
    }
    const std::string polarity = text_field(raw, "polarity");
    if (!one_of(polarity, {"negative", "positive"})) checker.fail(id, "polarity", "polarity 只能是 negative/positive");
    const std::string tier = text_field(raw, "tier");
    if (!one_of(tier, {"normal", "major"})) checker.fail(id, "tier", "tier 只能是 normal/major");

    std::vector<std::string> stages;
    if (raw.contains("stages")) {
        if (!raw.at("stages").is_array()) checker.fail(id, "stages", "stages 必须是数组");
        else {
            for (const auto& stage : raw.at("stages")) {
                if (!stage.is_string() || stage.get<std::string>().empty() ||
                    !known_stage(stage.get<std::string>())) {
                    checker.fail(id, "stages[]", "stages 含未知阶段");
                    continue;
                }
                stages.push_back(stage.get<std::string>());
            }
        }
    }

    const int priority = int_field(raw, "priority", 0);
    if (priority < 0 || priority > 100) checker.fail(id, "priority", "priority 必须在 0..100");
    const int cooldown = int_field(raw, "cooldown_weeks", 0);
    if (cooldown < 0 || cooldown > 52) checker.fail(id, "cooldown_weeks", "cooldown_weeks 必须在 0..52");
    const bool once = bool_field(raw, "once_per_project", false);
    const int random_weight = int_field(raw, "random_weight", 0);
    if (random_weight < 0 || random_weight > 1000) {
        checker.fail(id, "random_weight", "random_weight 必须在 0..1000");
    }
    const int expires = int_field(raw, "expires_weeks", 0);
    if (expires < 0 || expires > 8) checker.fail(id, "expires_weeks", "expires_weeks 必须在 0..8");


    // trigger
    std::string metric, op;
    int threshold = 0;
    if (!raw.contains("trigger") || !raw.at("trigger").is_object()) {
        checker.fail(id, "trigger", "缺少 trigger 对象");
    } else {
        const auto& trigger = raw.at("trigger");
        metric = text_field(trigger, "metric");
        op = text_field(trigger, "op");
        threshold = int_field(trigger, "threshold", 0);
        if (!one_of(metric, {"stage_quality", "work_quality", "weeks_to_deadline", "max_fatigue", "funds",
                            "weeks_in_project", "min_morale"})) {
            checker.fail(id, "trigger.metric", "未知触发指标");
        }
        if (!one_of(op, {"<", "<=", ">", ">="})) checker.fail(id, "trigger.op", "op 只能是 < <= > >=");
        if (!trigger.contains("threshold") || !is_int(trigger.at("threshold"))) {
            checker.fail(id, "trigger.threshold", "threshold 必须是整数");
        }
    }
    if (text_field(raw, "description").empty()) checker.fail(id, "description", "缺少 description");

    std::vector<OptionSpec> options = parse_options(raw, "options", id, "options", checker, stages);

    const bool has_abandon = std::any_of(options.begin(), options.end(),
                                         [](const OptionSpec& option) { return option.kind == "abandon"; });
    const bool has_accept = std::any_of(options.begin(), options.end(),
                                        [](const OptionSpec& option) { return option.kind == "accept"; });
    const bool has_decline = std::any_of(options.begin(), options.end(),
                                          [](const OptionSpec& option) { return option.kind == "decline"; });
    if (polarity == "negative" && !has_abandon) checker.fail(id, "options", "负面事件必须有 abandon 选项");
    if (polarity == "positive" && (!has_accept || !has_decline)) {
        checker.fail(id, "options", "正面事件必须有 accept 与 decline 选项");
    }
    if (expires > 0 && (polarity != "negative" || !has_abandon)) {
        checker.fail(id, "options", "限期事件必须有负面 polarity 与 abandon 默认分支");
    }
    if (tier == "major" && !once) checker.fail(id, "once_per_project", "重大事件必须 once_per_project=true");
    if (tier == "major" && cooldown != 0) checker.fail(id, "cooldown_weeks", "重大事件不能配冷却（同项目只触发一次）");

    out = EventSpec{id,
                    name,
                    category,
                    polarity,
                    tier,
                    text_field(raw, "tag").empty() ? id : text_field(raw, "tag"),
                    stages,
                    priority,
                    cooldown,
                    once,
                    metric,
                    op,
                    threshold,
                    random_weight,
                    expires,
                    text_field(raw, "description"),
                    text_field(raw, "foreshadow"),
                    options};
    parse_escalation(raw, id, checker, stages, out);
    return !id.empty();
}

}  // namespace

Catalog parse_catalog(const std::string& json, const std::string& source) {
    Catalog catalog;
    Checker checker{source, &catalog.issues};
    Json root;
    try {
        root = Json::parse(json);
    } catch (const Json::exception&) {
        checker.fail("", "", "不是合法 JSON");
        return catalog;
    }
    if (!root.is_object()) {
        checker.fail("", "", "目录根必须是对象");
        return catalog;
    }
    if (!root.contains("schema_version") || !is_int(root.at("schema_version")) ||
        root.at("schema_version").get<int>() != kCatalogSchemaVersion) {
        checker.fail("", "schema_version", "只支持 schema_version=1");
    }
    if (!root.contains("cards") || !root.at("cards").is_array()) {
        checker.fail("", "cards", "cards 必须是数组");
        return catalog;
    }
    if (root.at("cards").empty()) checker.fail("", "cards", "内容目录为空");

    std::set<std::string> ids;
    for (const auto& raw : root.at("cards")) {
        EventSpec spec;
        if (parse_card(raw, checker, ids, spec)) catalog.events.push_back(std::move(spec));
    }
    std::sort(catalog.events.begin(), catalog.events.end(),
              [](const EventSpec& a, const EventSpec& b) { return a.id < b.id; });
    return catalog;
}

const Catalog& catalog() {
    static const Catalog kCatalog = parse_catalog(embedded_event_cards(), "content/events");
    return kCatalog;
}

const EventSpec* find(const std::string& id) {
    for (const auto& spec : catalog().events) {
        if (spec.id == id) return &spec;
    }
    return nullptr;
}

namespace {

bool has_pending(const GameState& state, const std::string& work_id) {
    for (const auto& event : state.events.pending) {
        if (event.work_id == work_id) return true;
    }
    return false;
}

bool stage_open(const Project& work, const std::vector<std::string>& stages) {
    if (stages.empty()) return true;
    for (const auto& episode : work.episodes) {
        for (const auto& stage : episode.stages) {
            if (std::find(stages.begin(), stages.end(), stage.key) == stages.end()) continue;
            for (const auto& item : stage.items) {
                if (item.work_done < item.work_total) return true;
            }
        }
    }
    return false;
}

bool on_cooldown(const GameState& state, const std::string& work_id, const EventSpec& spec, int week) {
    const auto hit = state.events.per_work.find(work_id);
    if (hit == state.events.per_work.end()) return false;
    const auto until = hit->second.cooldowns.find(spec.id);
    return until != hit->second.cooldowns.end() && until->second > week;
}

bool major_seen(const GameState& state, const std::string& work_id, const EventSpec& spec) {
    if (!spec.once_per_project) return false;
    const auto hit = state.events.per_work.find(work_id);
    if (hit == state.events.per_work.end()) return false;
    return std::find(hit->second.major_seen.begin(), hit->second.major_seen.end(), spec.id) !=
           hit->second.major_seen.end();
}

// 返回 false 表示该指标当前不可用（例如还没有任何已开工工作项）。
bool metric_value(const GameState& state, const Project& work, const EventSpec& spec, int week, int& out) {
    if (spec.metric == "stage_quality" || spec.metric == "work_quality") {
        std::int64_t sum = 0;
        int count = 0;
        auto collect = [&](const WorkItem& item) {
            if (item.work_done <= 0) return;   // 未开工的项不计入：否则开局就是 0 分，立刻触发
            for (const int value : item.quality.dims) {
                sum += value;
                ++count;
            }
        };
        if (spec.metric == "work_quality") {
            for (const auto& item : work.common.items) collect(item);
            for (const auto& episode : work.episodes) {
                for (const auto& stage : episode.stages) {
                    for (const auto& item : stage.items) collect(item);
                }
            }
        } else {
            for (const auto& episode : work.episodes) {
                for (const auto& stage : episode.stages) {
                    if (!spec.stages.empty() &&
                        std::find(spec.stages.begin(), spec.stages.end(), stage.key) == spec.stages.end()) {
                        continue;
                    }
                    for (const auto& item : stage.items) collect(item);
                }
            }
        }
        if (count == 0) return false;
        out = static_cast<int>(sum / count);
        return true;
    }
    if (spec.metric == "weeks_to_deadline") {
        out = work.deadline_week - week;
        return true;
    }
    if (spec.metric == "weeks_in_project") {
        out = week - work.opened_week;
        return true;
    }
    if (spec.metric == "max_fatigue") {
        int value = 0;
        for (const auto& member : state.staff) value = std::max(value, member.fatigue);
        out = value;
        return true;
    }
    if (spec.metric == "min_morale") {
        if (state.staff.empty()) return false;
        int value = 100;
        for (const auto& member : state.staff) value = std::min(value, member.morale);
        out = value;
        return true;
    }
    if (spec.metric == "funds") {
        out = static_cast<int>(std::clamp<std::int64_t>(state.finance.balance, -2000000000LL, 2000000000LL));
        return true;
    }
    return false;
}

bool condition_met(int value, const std::string& op, int threshold) {
    if (op == "<") return value < threshold;
    if (op == "<=") return value <= threshold;
    if (op == ">") return value > threshold;
    if (op == ">=") return value >= threshold;
    return false;
}

bool candidate_before(const EventSpec* left, const EventSpec* right) {
    const bool left_major = left->tier == "major";
    const bool right_major = right->tier == "major";
    if (left_major != right_major) return left_major;
    if (left->priority != right->priority) return left->priority < right->priority;
    return left->id < right->id;
}

PendingEvent build_instance(const EventSpec& spec, const std::string& work_id, int week) {
    PendingEvent event;
    event.event_id = spec.id;
    event.name = spec.name;
    event.work_id = work_id;
    event.triggered_week = week;
    event.cooldown_weeks = spec.cooldown_weeks;
    event.once_per_project = spec.once_per_project;
    event.timeout_option_id = spec.timeout_option_id;
    if (spec.expires_weeks > 0) event.expires_week = week + spec.expires_weeks - 1;
    for (const auto& option : spec.options) {
        EventOptionView view;
        view.id = option.id;
        view.label = option.label;
        view.kind = option.kind;
        view.risk_hint = option.risk_hint;
        view.cost = option.cost;
        // 冻结完整效果载荷：存档或目录更新后仍执行触发时的效果。
        for (const auto& effect : option.effects) {
            view.effects.push_back(EffectView{effect.scope, effect.target, effect.stage, effect.value});
        }
        if (option.vendor_request.has_value()) {
            view.vendor_request = VendorRequestView{option.vendor_request->item_id,
                                                    option.vendor_request->supplier_id,
                                                    option.vendor_request->work_total};
        }
        event.options.push_back(std::move(view));
    }
    if (spec.escalation.has_value()) {
        EscalationView snapshot;
        snapshot.description = spec.escalation->description;
        snapshot.expires_weeks = spec.escalation->expires_weeks;
        snapshot.timeout_option_id = spec.escalation->timeout_option_id;
        for (const auto& option : spec.escalation->options) {
            EventOptionView view;
            view.id = option.id;
            view.label = option.label;
            view.kind = option.kind;
            view.risk_hint = option.risk_hint;
            view.cost = option.cost;
            for (const auto& effect : option.effects) {
                view.effects.push_back(EffectView{effect.scope, effect.target, effect.stage, effect.value});
            }
            if (option.vendor_request.has_value()) {
                view.vendor_request = VendorRequestView{option.vendor_request->item_id,
                                                        option.vendor_request->supplier_id,
                                                        option.vendor_request->work_total};
            }
            snapshot.options.push_back(std::move(view));
        }
        event.escalation = std::move(snapshot);
    }
    return event;
}

}  // namespace

Json draw(GameState& state, int week) {
    Json drawn = Json::array();
    std::vector<const Project*> ordered;
    for (const auto& work : state.works) {
        if (work.status == "producing") ordered.push_back(&work);
    }
    std::sort(ordered.begin(), ordered.end(), [](const Project* a, const Project* b) { return a->id < b->id; });

    for (const Project* work : ordered) {
        if (has_pending(state, work->id)) continue;   // 同一项目同时最多一条待处理
        std::vector<const EventSpec*> performance;
        std::vector<const EventSpec*> random_pool;
        for (const auto& spec : catalog().events) {
            if (!stage_open(*work, spec.stages)) continue;
            if (on_cooldown(state, work->id, spec, week)) continue;
            if (major_seen(state, work->id, spec)) continue;
            int value = 0;
            if (metric_value(state, *work, spec, week, value) && condition_met(value, spec.op, spec.threshold)) {
                performance.push_back(&spec);
                continue;
            }
            if (spec.random_weight <= 0) continue;
            // 每张卡独立抽样：purpose = hash(work_id|card_id)，与项目/卡片遍历顺序无关。
            const auto roll = kernel::draw_below(state.seed, week, kernel::Stream::event,
                                                 fnv1a(work->id + "|" + spec.id), 0, 1000);
            if (roll < static_cast<std::uint32_t>(spec.random_weight)) random_pool.push_back(&spec);
        }
        const auto& pool = performance.empty() ? random_pool : performance;
        if (pool.empty()) continue;
        std::vector<const EventSpec*> sorted = pool;
        std::sort(sorted.begin(), sorted.end(), candidate_before);
        state.events.pending.push_back(build_instance(*sorted.front(), work->id, week));
        drawn.push_back(Json{{"event_id", sorted.front()->id}, {"work_id", work->id}});
    }

    if (!drawn.empty()) state.events.last_event_week = week;
    return Json{{"drawn", !drawn.empty()}, {"count", static_cast<int>(drawn.size())}, {"events", drawn}};
}

Resolution inspect(const GameState& state, const std::string& work_id, const std::string& event_id,
                   const std::string& option_id) {
    Resolution result;
    for (const auto& event : state.events.pending) {
        if (event.work_id != work_id || event.event_id != event_id) continue;
        result.pending = &event;
        break;
    }
    if (result.pending == nullptr) {
        result.code = "NOT_FOUND";
        result.message = "该项目没有该待处理事件";
        return result;
    }
    for (const auto& option : result.pending->options) {
        if (option.id == option_id) result.option = &option;
    }
    if (result.option == nullptr) {
        result.code = "NOT_FOUND";
        result.message = "选项不存在";
        return result;
    }
    // #122：带 vendor_request 的 outsource 选项走真实 Vendor 内部签约；
    // 不带载荷的 outsource 与 extension 仍不可用，不演变为隐式自动签约。
    if (result.option->kind == "extension" ||
        (result.option->kind == "outsource" && !result.option->vendor_request.has_value())) {
        result.code = "MODE_NOT_ALLOWED";
        result.message = "供应商外包载荷缺失或延期尚未接入，该选项不可用";
        return result;
    }
    // #122：外包费用由 Vendor 全额预付并校验，这里不能只按 option.cost 放行。
    if (result.option->vendor_request.has_value()) return result;
    if (result.option->cost > state.finance.balance) {
        result.code = "INSUFFICIENT_FUNDS";
        result.message = "现金不足以支付该选项";
        return result;
    }
    return result;
}

Json builtin_catalog_report() { return catalog_report(embedded_event_cards(), "content/events"); }

Json catalog_report(const std::string& json, const std::string& source) {
    const Catalog parsed = parse_catalog(json, source);
    Json ids = Json::array();
    for (const auto& spec : parsed.events) ids.push_back(spec.id);
    Json issues = Json::array();
    for (const auto& issue : parsed.issues) {
        issues.push_back(Json{{"source", issue.source},
                              {"card_id", issue.card_id},
                              {"field", issue.field},
                              {"message", issue.message}});
    }
    return Json{{"ok", parsed.ok()}, {"count", static_cast<int>(parsed.events.size())},
                {"ids", ids}, {"issues", issues}};
}

}  // namespace apc::v4::event
