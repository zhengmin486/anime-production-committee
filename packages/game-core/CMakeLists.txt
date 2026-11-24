cmake_minimum_required(VERSION 3.24)
project(anime_game_core VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

include(FetchContent)
set(JSON_BuildTests OFF CACHE BOOL "" FORCE)
set(JSON_Install OFF CACHE BOOL "" FORCE)
FetchContent_Declare(nlohmann_json
    URL https://codeload.github.com/nlohmann/json/tar.gz/refs/tags/v3.12.0
    URL_HASH SHA256=4b92eb0c06d10683f7447ce9406cb97cd4b453be18d7279320f7b2f025c10187
    DOWNLOAD_EXTRACT_TIMESTAMP TRUE
)
FetchContent_MakeAvailable(nlohmann_json)

add_library(game_core STATIC src/game_core.cpp)
target_include_directories(game_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(game_core PUBLIC nlohmann_json::nlohmann_json)
if(MSVC)
    target_compile_options(game_core PUBLIC /utf-8 /EHsc)
    target_compile_options(game_core PRIVATE /W4)
else()
    target_compile_options(game_core PRIVATE -Wall -Wextra -Wpedantic)
endif()

# v4 target architecture (M1 onward): compiled alongside v3; production entry switches at M6.
# This target ensures v4 sources compile; shipped WASM remains v3 until M6.
add_library(game_core_v4 STATIC
    src/v4/model.cpp
    src/v4/kernel.cpp
    src/v4/runtime.cpp
)
target_include_directories(game_core_v4 PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}/include")
target_link_libraries(game_core_v4 PUBLIC nlohmann_json::nlohmann_json)
if(MSVC)
    target_compile_options(game_core_v4 PUBLIC /utf-8 /EHsc)
    target_compile_options(game_core_v4 PRIVATE /W4)
else()
    target_compile_options(game_core_v4 PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(EMSCRIPTEN)
    # GoogleTest is deliberately excluded from the cross-compiled build.
    set(BUILD_TESTING OFF CACHE BOOL "Build native tests" FORCE)
    target_compile_options(game_core PUBLIC -fexceptions)
    add_executable(game_core_wasm bindings/embind.cpp)
    target_link_libraries(game_core_wasm PRIVATE game_core)
    target_link_options(game_core_wasm PRIVATE
        --bind --no-entry -fexceptions
        -sDISABLE_EXCEPTION_CATCHING=0
        -sMODULARIZE=1
        -sEXPORT_ES6=1
        -sEXPORT_NAME=createGameCore
        -sENVIRONMENT=web,node
        -sALLOW_MEMORY_GROWTH=1
        -sFILESYSTEM=0
    )
    get_filename_component(APC_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
    set_target_properties(game_core_wasm PROPERTIES
        OUTPUT_NAME "game-core"
        SUFFIX ".mjs"
        RUNTIME_OUTPUT_DIRECTORY "${APC_ROOT}/apps/web/public/wasm"
    )
else()
    include(CTest)
    if(BUILD_TESTING)
        set(INSTALL_GTEST OFF CACHE BOOL "" FORCE)
        set(BUILD_GMOCK OFF CACHE BOOL "" FORCE)
        set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
        FetchContent_Declare(googletest
            URL https://codeload.github.com/google/googletest/tar.gz/refs/tags/v1.17.0
            URL_HASH SHA256=65fab701d9829d38cb77c14acdc431d2108bfdbf8979e40eb8ae567edf10b27c
            DOWNLOAD_EXTRACT_TIMESTAMP TRUE
        )
        FetchContent_MakeAvailable(googletest)
        add_executable(game_core_tests tests/game_core_test.cpp)
        target_link_libraries(game_core_tests PRIVATE game_core GTest::gtest_main)
        include(GoogleTest)
        gtest_discover_tests(game_core_tests NO_PRETTY_VALUES)
    endif()
endif()
