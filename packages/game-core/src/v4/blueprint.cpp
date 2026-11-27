#include "apc/v4/blueprint.hpp"

namespace apc::v4::blueprint {

const Json& catalog() {
    static const Json kCatalog = [] {
        try {
            return Json::parse(embedded_blueprints());
        } catch (const Json::exception&) {
            return Json::object();
        }
    }();
    return kCatalog;
}

const Json* find(const std::string& id) {
    const auto& root = catalog();
    if (!root.is_object() || !root.contains("blueprints") || !root.at("blueprints").is_array()) return nullptr;
    for (const auto& blueprint : root.at("blueprints")) {
        if (blueprint.is_object() && blueprint.value("id", std::string{}) == id) return &blueprint;
    }
    return nullptr;
}

}  // namespace apc::v4::blueprint
