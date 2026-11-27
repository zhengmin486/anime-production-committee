#!/usr/bin/env node
// 把 docs/blueprints/*.blueprint.json 打包成运行时解析的内嵌蓝图包。
// 每个文件先跑现有 validate-blueprint 校验器，失败即中止构建。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = 'docs/blueprints'
const files = readdirSync(root).filter((name) => name.endsWith('.blueprint.json')).sort()
if (files.length === 0) {
  console.error(`${root} 下没有蓝图`)
  process.exit(1)
}

const blueprints = []
for (const file of files) {
  const path = join(root, file)
  const check = spawnSync(process.execPath, ['scripts/validate-blueprint.mjs', path], { encoding: 'utf8' })
  if (check.status !== 0) {
    console.error(`蓝图校验失败：${path}`)
    if (check.stdout) console.error(check.stdout)
    if (check.stderr) console.error(check.stderr)
    process.exit(1)
  }
  const doc = JSON.parse(readFileSync(path, 'utf8'))
  if (doc.id !== file.replace(/\.blueprint\.json$/, '')) {
    console.error(`${path}: 文件名应与 id 一致（${doc.id}）`)
    process.exit(1)
  }
  blueprints.push(doc)
}

blueprints.sort((a, b) => a.id.localeCompare(b.id))
const json = JSON.stringify({ schema_version: 1, blueprints })
if (json.includes(')APC_BLUEPRINTS"')) {
  console.error('蓝图内容包含保留分隔符，无法生成 C++ 原始字符串')
  process.exit(1)
}

const target = 'packages/game-core/src/v4/blueprint_catalog_generated.cpp'
writeFileSync(target, `// 由 scripts/build-blueprint-catalog.mjs 从 docs/blueprints/*.blueprint.json 生成，请勿手改。
#include "apc/v4/blueprint.hpp"

namespace apc::v4::blueprint {

const char* embedded_blueprints() {
    return R"APC_BLUEPRINTS(${json})APC_BLUEPRINTS";
}

}  // namespace apc::v4::blueprint
`)
console.log(`蓝图已打包：${blueprints.length} 份 -> ${target}`)
