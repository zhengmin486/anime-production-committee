#pragma once

// 制作蓝图目录：从 docs/blueprints/*.blueprint.json 构建期打包，运行时解析。
// 只读；同一 blueprint_id 永远得到同一份模板，实例化不消耗随机。

#include <string>

#include "apc/v4/model.hpp"

namespace apc::v4::blueprint {

// 构建脚本生成的内嵌蓝图包。
const char* embedded_blueprints();

// {schema_version:1, blueprints:[...]}；解析失败时返回空对象。
const Json& catalog();

// 不存在返回 nullptr。
const Json* find(const std::string& id);

}  // namespace apc::v4::blueprint
