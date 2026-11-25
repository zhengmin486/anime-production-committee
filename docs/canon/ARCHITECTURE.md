---
title: 工程架构
kind: canon
status: mixed
owner: engineering
updated: 2026-11-26
canonical_for: architecture
supersedes: []
superseded_by: []
---

# 工程架构与模块边界

> 分层与技术栈继续复用；下文 v2 字段、存档与流程是运行现状。M0 的 v3 目标契约在 [DATA_MODEL](DATA_MODEL.md) 和 [API](API.md) 单独标识，并由 `types/gameV3.ts` 提供类型/校验；不新增规则后端，不伪造 WASM 导出，M1 接入真实核心后整体切换。

本文描述最小纵向切片的分层与 v2 状态契约，不把后续系统规划或未运行的验收当作已完成。产品范围见 [PRODUCT.md](PRODUCT.md)，JSON 契约见 [API.md](API.md)，开发流程见 [CONTRIBUTING.md](../CONTRIBUTING.md)，环境与工具链命令见 [README](../README.md)。

## 技术选型

| 层次 | 当前技术 | 边界 |
| --- | --- | --- |
| 页面与交互 | React、TypeScript、Tailwind CSS、Lucide | 展示与输入，不计算经营规则 |
| 会话与存档 | Zustand、浏览器原生 IndexedDB | TypeScript 持有状态和种子，不引入远程数据库 |
| 规则核心 | C++17、nlohmann/json | 明确 JSON 输入输出，不依赖浏览器 |
| 跨语言与构建 | Emscripten / Embind、CMake、Vite、npm workspaces | 本地编译真实 WASM，输出静态站点 |
| 测试 | Vitest、Testing Library、GoogleTest、Node test、Playwright | 分别验证前端、原生规则、WASM 契约和浏览器流程 |

前端版本以 `package.json` 与 `package-lock.json` 为准，C++ 库版本及校验哈希固定在 `packages/game-core/CMakeLists.txt`。不增加独立后端、Electron、Phaser 或多人服务。

## 分层与调用方向

```text
React 页面 / 组件
  → Zustand 状态操作
    → gameCore.ts 服务 → Emscripten ES Module → WASM → C++ 纯规则
    → saveGame.ts 服务 → IndexedDB
```

加载状态由 useGameCore Hook 展示，模块加载 Promise 在服务层共享。状态更新只能通过明确的 store 操作触发，React 不计算核心结果。核心返回错误时保留旧状态；busy 状态阻止重复推进、存档竞争和操作中的页面切换。

## 目录

```text
anime-production-committee/
├── apps/web/
│   ├── src/
│   │   ├── components/       # 状态提示组件与测试
│   │   ├── pages/            # 首页、最小经营循环界面
│   │   ├── stores/           # Zustand 状态与操作
│   │   ├── services/         # WASM 边界、IndexedDB
│   │   ├── hooks/            # 模块加载状态
│   │   ├── types/            # 协议类型与外部数据验证
│   │   ├── styles/           # Tailwind 与主题变量
│   │   ├── test/             # Vitest 测试环境
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── public/wasm/          # Emscripten 生成产物，忽略版本控制
│   ├── public/assets/        # 正式素材目录，目前只保留目录占位
│   └── dist/                 # Vite 静态部署输出
├── packages/game-core/
│   ├── include/             # game_core.hpp 接口、game_rules.hpp 暂定参数
│   ├── src/                 # JSON 验证和规则计算
│   ├── bindings/            # Embind 导出
│   ├── tests/               # GoogleTest
│   └── CMakeLists.txt
├── docs/                    # 产品、架构、规则、API
├── scripts/                 # CMake 调用、真实 WASM 测试、部署产物验证
├── build/native/            # 原生 CMake 构建缓存
├── build/wasm/              # Emscripten CMake 构建缓存
├── .tools/                  # 可选的项目内工具链，忽略版本控制
├── package.json             # npm workspaces 和统一入口
├── package-lock.json        # npm 精确依赖锁定
└── README.md
```

## 模块职责

- **React + TypeScript**：语义化 UI、加载/错误/空态、输入与输出展示。
- **Zustand**：管理当前页面、完整 GameState v2、异步互斥、错误提示和最后一次回执。`game` 初始为 null；真实 WASM 初始化后才有游戏状态。TypeScript 持有 seed，并采用 C++ 返回的新 seed，不在前端推进随机序列。
- **WASM 服务**：同源加载 game-core.mjs，由其加载独立 game-core.wasm；序列化 JSON、转换核心错误并验证完整状态及动作回执。没有 TypeScript 规则后备实现。加载失败清除 Promise 缓存，重试模块 URL 带重试编号，允许修复资源后重试。
- **IndexedDB 服务**：数据库 anime-production-committee、DB schema 版本 1、对象仓库 saves、键 current；存档记录版本为 2。事务完成后才报告保存成功，关闭连接；读取校验版本与完整状态，拒绝旧 v1 并提示新开，不做迁移。
- **C++17**：处理六接口纯规则和每次动作的完整状态/目录/阶段校验。以 nlohmann/json（Json）承载状态并序列化，不宣称已有强类型 GameState struct；不读写 UI、文件、网络或时间，不持有全局会话或内部随机状态。
- **规则参数**：game_rules.hpp 集中初值、固定 4 员工/3 报价/3 事件、费用、制作与结算系数以及 LCG 常数。数值是暂定值，非最终平衡。
- **Embind**：把六个明确命名的 JSON 字符串接口导出给 JavaScript；初始化、接取、决策、推进、事件和结算均执行真实 C++ 逻辑。
- **CMake**：原生 GoogleTest 与 WASM 使用不同构建目录。GoogleTest 不进入浏览器产物。

## 状态所有权与更新边界

协议形状见 [DATA_MODEL.md](DATA_MODEL.md)，TypeScript 边界在 [types/game.ts](../apps/web/src/types/gameV3.ts)。GameState v2 包含公司资金/声望/日历/种子、固定名册、报价、单一企划及三工序、待处理事件和终局原因；协议字段统一 snake_case。

| 数据 | 所有者 | 更新方式 |
| --- | --- | --- |
| `game: GameState | null` | Zustand 会话 | 初始化或动作成功后整体采用 C++ state；读取有效存档后恢复，禁止前端构造初态 |
| `screen`、`busy`、`error`、`notice`、报告与结算展示 | Zustand 界面状态 | store 操作维护；report/result 只作会话反馈，不回流核心、不写存档 |
| 核心加载状态 | `useGameCore` | 服务加载结果驱动；请求编号防止旧回执覆盖新状态 |
| 已实例化模块 Promise | `gameCore.ts` | 会话内共享；失败后清缓存并允许重试 |
| `SaveRecord` | `saveGame.ts` / IndexedDB | 只保存 version 2、savedAt 与 GameState v2，不保存 UI 或 WASM 实例 |

一次制作推进的执行顺序：

1. 页面触发 store 推进操作；store 检查 `busy`、游戏是否存在并捕获当前完整状态。
2. 服务发送 `{ state }` 调用 `advance_day`；C++ 先校验完整状态，再校验阶段并执行日结，返回 `{ state, report }` 或结构化错误。
3. 服务解析并校验返回状态与报告；store 只在成功后整体采用新 state（含日期、种子、阶段），单独展示 report。资金不足日结是成功返回 `ended / bankrupt`，不是需要保留旧制作状态的接口错误。
4. 失败时保留旧业务状态并显示错误；无论成功失败都解除 `busy`。其他动作同样经过服务与完整响应校验。

新开游戏先加载真实 WASM，再调用 `initialize_game({ seed })`；`?seed=12345` 可固定新局种子。返回首页不等于重新初始化，读取存档也不重新生成公司。页面可以禁用不可用按钮，但规则合法性仍由 C++ 判断；不得在 store 或组件中重写扣款、进度、种子、终局或结算公式。保存时的系统时间只写入外层 `savedAt`，不参与规则计算。

业务流由 `idle → producing → event_pending / ended` 驱动：事件处理后继续制作，终局结算后回 idle 并重供相同报价。外包和加班只安排今天，成功日结后清除；截止日当天结算后未完成就强制交付，终局会丢弃同日事件。算出结果后企划清空，因此仅保存 GameState 的存档不能恢复历史 report/result；结算面板在重载后不恢复。

## 依赖关系

前端运行时仅依赖 React、React DOM、Zustand、Lucide。Tailwind、Vite、TypeScript 是构建依赖；Vitest、Testing Library、jsdom、fake-indexeddb 是测试依赖；根目录的 playwright-core 仅用于驱动本机浏览器完成真实点击与截图，不打包进前端。fake-indexeddb 只用于单元测试，真实浏览器使用原生 IndexedDB。

C++ 使用固定版本 nlohmann/json 与 GoogleTest；具体版本、工具链和命令见 README。npm workspace @anime/game-core 提供构建入口，不把 C++ 当作可直接 import 的 npm 运行时包。前端只消费编译产物。

## 构建与部署

先编译 WASM 到 apps/web/public/wasm，再由 Vite 原样复制到 apps/web/dist/wasm。站点在域名根路径运行，base 为 /，两个页面采用内存状态切换，不引入路由库或独立 URL。

部署目标是把 `apps/web/dist` 静态文件交给 Qoder Sites，不要求云端执行 CMake 或运行 Node 服务器。本工程不使用 Functions、云数据库、Storage 或 Secrets。不启用 WASM 线程，不需要 SharedArrayBuffer、COOP 或 COEP。

`npm run build` 依次构建 WASM 和前端；`npm run build:web` 不编译 C++，`npm run dev` 也不会自动构建 WASM。新克隆或 C++ 修改后须先运行 `npm run build:wasm`。构建产物可用 `npm run verify:dist` 检查；本地构建成功不等于站点已发布或线上 WASM 已验证。

项目根目录的 .动画制作委员会.qoder.site 由 Sites 工具维护，不能手写发布身份。CSS 消费 --site-* 主题、字号、间距、圆角和动画变量，供设计工作台使用。

## 验证边界

Vitest 中隔离服务的 store 测试只证明前端状态逻辑；fake-indexeddb 测试不代表浏览器验证。原生 GoogleTest 证明 C++ 规则；scripts/wasm.test.mjs 检查二进制魔数并实例化实际 Emscripten 模块，证明编译与跨语言契约。浏览器操作与发布结果必须另行验证，不能用前两类测试替代。

| 检查 | 根目录命令 |
| --- | --- |
| 前端类型与单元测试 | `npm run typecheck`、`npm run test:unit` |
| 原生 C++ | `npm run test:native` |
| 重新编译并验证真实 WASM | `npm run test:wasm` |
| 完整静态包 | `npm run build`、`npm run verify:dist` |
| 完整构建后验证浏览器流程 | `npm run test:browser` |

## 当前模型与变更边界

[GAME_DESIGN.md](GAME_DESIGN.md) 描述最小循环，[DATA_MODEL.md](DATA_MODEL.md) 定义 v2 完整状态；核心源码与 game_rules.hpp 提供现行规则和暂定参数。前端接入与各层验收必须以真实产物核对，文档更新不等于测试或上线通过。

最终平衡和拨款/利润口径尚待评审；复杂事件、招聘解雇、成长、市场模拟、多企划并行不在本切片范围。仅单槽本地存档，无 v1 迁移、跨源同步或历史结算持久化。

继续保持“TypeScript 持有会话与种子、C++ 执行纯规则”的边界。增加字段、改变随机种子推进或引入新存档版本前，先统一目标契约，再同步修改类型、核心、服务、状态层及各层测试。具体流程按贡献指南执行，不为未来需求提前搭建独立后端或额外抽象。
