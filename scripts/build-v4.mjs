#!/usr/bin/env node
// 构建 v4 M1 测试用 wasm 模块（不经过 CMake）。
//
// 为什么单独一条路径：M1 需要在本机无 cmake/ninja 时也能产出可运行证据。
// 正式产物仍由 CMake 构建（见 packages/game-core/CMakeLists.txt 的 v4 目标）。
//
// 用法：
//   node scripts/build-v4.mjs
//   环境变量：EMXX（em++ 路径）、JSON_INCLUDE（nlohmann/json.hpp 所在 include 目录）
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const core = join(root, 'packages', 'game-core')
const out = join(root, 'build', 'v4')
mkdirSync(out, { recursive: true })

const windows = process.platform === 'win32'

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return undefined
}

// ---- em++ ----
const emxx =
  process.env.EMXX ||
  firstExisting([
    // 工作树场景：.tools 通常只在主仓库根目录
    join(root, '..', '..', '.tools', 'emsdk', 'upstream', 'emscripten', windows ? 'em++.bat' : 'em++'),
    join(root, '..', '.tools', 'emsdk', 'upstream', 'emscripten', windows ? 'em++.bat' : 'em++'),
    join(root, '.tools', 'emsdk', 'upstream', 'emscripten', windows ? 'em++.bat' : 'em++'),
    ...(process.env.PATH || '')
      .split(windows ? ';' : ':')
      .filter(Boolean)
      .map((dir) => join(dir, windows ? 'em++.bat' : 'em++')),
  ])

if (!emxx) {
  console.error('找不到 em++。请设置 EMXX，或把 .tools/emsdk 安装到仓库根目录。')
  process.exit(1)
}

// ---- nlohmann/json ----
// 版本与 packages/game-core/CMakeLists.txt 的 FetchContent 固定版本保持一致。
const JSON_VERSION = '3.12.0'

function findJsonInclude() {
  if (process.env.JSON_INCLUDE) return process.env.JSON_INCLUDE
  const roots = [join(root, 'build')]
  // 先看本仓库自己的下载缓存，保证干净克隆可复现
  const cached = join(root, 'build', 'deps', 'nlohmann')
  if (existsSync(join(cached, 'nlohmann', 'json.hpp'))) return cached
  // 工作树场景：.worktrees 可能在主仓库根目录
  const worktreeDirs = [join(root, '.worktrees'), join(root, '..', '..', '.worktrees'), join(root, '..', '.worktrees')]
  for (const worktrees of worktreeDirs) {
    if (!existsSync(worktrees)) continue
    for (const name of readdirSync(worktrees)) {
      const build = join(worktrees, name, 'build')
      if (existsSync(build)) roots.push(build)
    }
  }
  const suffixes = [
    ['native', '_deps', 'nlohmann_json-src', 'include'],
    ['wasm', '_deps', 'nlohmann_json-src', 'include'],
  ]
  for (const base of roots) {
    for (const suffix of suffixes) {
      const candidate = join(base, ...suffix)
      if (existsSync(join(candidate, 'nlohmann', 'json.hpp'))) return candidate
    }
    // 兜底：向下两层找 _deps
    for (const entry of safeReadDir(base)) {
      for (const suffix of suffixes) {
        const candidate = join(base, entry, ...suffix.slice(1))
        if (existsSync(join(candidate, 'nlohmann', 'json.hpp'))) return candidate
      }
    }
  }
  return undefined
}

function safeReadDir(path) {
  try {
    return readdirSync(path).filter((name) => {
      try {
        return statSync(join(path, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

// 找不到就按 CMake 里固定的版本下载单头文件，避免构建依赖"别的 worktree 恰好构建过"。
async function downloadJson() {
  const target = join(root, 'build', 'deps', 'nlohmann')
  const file = join(target, 'nlohmann', 'json.hpp')
  if (existsSync(file)) return target
  const url = `https://raw.githubusercontent.com/nlohmann/json/v${JSON_VERSION}/single_include/nlohmann/json.hpp`
  console.log(`未找到本地 nlohmann/json，尝试下载 v${JSON_VERSION}`)
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const text = await response.text()
    if (!text.includes('NLOHMANN_JSON_VERSION_MAJOR')) throw new Error('返回内容不是 json.hpp')
    mkdirSync(join(target, 'nlohmann'), { recursive: true })
    writeFileSync(file, text)
    console.log(`已下载到 ${file}`)
    return target
  } catch (error) {
    console.error(`下载失败：${error.message}`)
    console.error('请设置 JSON_INCLUDE 指向 nlohmann/json 头文件所在目录，或先跑一次原生 CMake 构建。')
    return undefined
  }
}

// JSON_DOWNLOAD=1 可强制走下载，用于验证干净环境下的自举
const jsonInclude = process.env.JSON_DOWNLOAD ? await downloadJson() : findJsonInclude() ?? (await downloadJson())
if (!jsonInclude) process.exit(1)

const args = [
  '-std=c++17',
  '-I',
  join(core, 'include'),
  '-I',
  jsonInclude,
  '-lembind',
  '--bind',
  '--no-entry',
  '-fexceptions',
  '-sDISABLE_EXCEPTION_CATCHING=0',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sEXPORT_NAME=createV4',
  '-sENVIRONMENT=node',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sFILESYSTEM=0',
  '-o',
  join(out, 'v4.mjs'),
  join(core, 'src', 'v4', 'model.cpp'),
  join(core, 'src', 'v4', 'kernel.cpp'),
  join(core, 'src', 'v4', 'runtime.cpp'),
  join(core, 'src', 'v4', 'event.cpp'),
  join(core, 'src', 'v4', 'event_catalog_generated.cpp'),
  join(core, 'src', 'v4', 'blueprint.cpp'),
  join(core, 'src', 'v4', 'blueprint_catalog_generated.cpp'),
  join(core, 'bindings', 'v4_bindings.cpp'),
]

console.log(`em++: ${emxx}`)
console.log(`json: ${jsonInclude}`)
// Windows 下 em++.bat 需要经 cmd 调用，否则 spawn 会直接失败且不产生输出
const needsShell = windows && /\.(bat|cmd)$/i.test(emxx)
const command = needsShell ? 'cmd.exe' : emxx
const commandArgs = needsShell ? ['/c', emxx, ...args] : args
const result = spawnSync(command, commandArgs, { stdio: 'inherit', cwd: root })
if (result.error) {
  console.error(`v4 模块构建失败: ${result.error.message}`)
  process.exit(1)
}
if (result.status !== 0) {
  console.error(`v4 模块构建失败（退出码 ${result.status}）`)
  process.exit(result.status ?? 1)
}
console.log(`已生成 ${join(out, 'v4.mjs')}`)
