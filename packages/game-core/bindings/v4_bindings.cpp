// v4 M1 测试用绑定：只导出 JSON 字符串接口，供 Node 端契约测试调用。
// 正式产物仍走 bindings/embind.cpp + CMake；M1 阶段用独立模块避免影响 v3 产物。

#include <emscripten/bind.h>

#include "apc/v4/runtime.hpp"

EMSCRIPTEN_BINDINGS(apc_v4) {
    emscripten::function("initialize", &apc::v4::initialize);
    emscripten::function("instantiate_work", &apc::v4::instantiate_work);
    emscripten::function("set_plan", &apc::v4::set_plan);
    emscripten::function("assign_staff", &apc::v4::assign_staff);
    emscripten::function("advance_week", &apc::v4::advance_week);
    emscripten::function("hash_state", &apc::v4::hash_state);
}
