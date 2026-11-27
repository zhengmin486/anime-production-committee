// v4 M1 测试用绑定：只导出 JSON 字符串接口，供 Node 端契约测试调用。
// 正式产物仍走 bindings/embind.cpp + CMake；M1 阶段用独立模块避免影响 v3 产物。

#include <emscripten/bind.h>

#include "apc/v4/runtime.hpp"

EMSCRIPTEN_BINDINGS(apc_v4) {
    // 内部/测试入口（M1）：可以用于构造夹具，不等于 M0 冻结的玩家命令。
    emscripten::function("initialize", &apc::v4::initialize);
    emscripten::function("instantiate_work", &apc::v4::instantiate_work);
    emscripten::function("set_plan", &apc::v4::set_plan);
    // M0 契约名适配入口：M2 起客户端只应使用这两个名字。
    emscripten::function("initialize_game", &apc::v4::initialize_game);
    emscripten::function("set_work_plan", &apc::v4::set_work_plan);
    // 已对齐 M0 语义的命令。
    emscripten::function("start_work", &apc::v4::start_work);
    emscripten::function("create_custom_offer", &apc::v4::create_custom_offer);
    emscripten::function("adopt_proposal", &apc::v4::adopt_proposal);
    emscripten::function("reject_proposal", &apc::v4::reject_proposal);
    emscripten::function("assign_staff", &apc::v4::assign_staff);
    emscripten::function("hire_core", &apc::v4::hire_core);
    emscripten::function("scout", &apc::v4::scout);
    emscripten::function("dismiss_staff", &apc::v4::dismiss_staff);
    emscripten::function("deliver_work", &apc::v4::deliver_work);
    emscripten::function("abort_work", &apc::v4::abort_work);
    emscripten::function("buy_tv_service", &apc::v4::buy_tv_service);
    emscripten::function("request_extension", &apc::v4::request_extension);
    emscripten::function("advance_week", &apc::v4::advance_week);
    emscripten::function("end_company", &apc::v4::end_company);
    emscripten::function("finalize_delivery", &apc::v4::finalize_delivery);
    emscripten::function("finalize_company", &apc::v4::finalize_company);
    emscripten::function("resolve_event", &apc::v4::resolve_event);
    emscripten::function("view_event", &apc::v4::view_event);
    emscripten::function("lock_offer", &apc::v4::lock_offer);
    emscripten::function("hash_state", &apc::v4::hash_state);
    // 内部/测试入口：校验内容卡目录，不参与玩家命令契约。
    emscripten::function("validate_event_catalog", &apc::v4::validate_event_catalog);
    emscripten::function("event_catalog_info", &apc::v4::event_catalog_info);
}
