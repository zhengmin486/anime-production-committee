#!/usr/bin/env node
// 把 content/events/*.json 打包成运行时解析的内嵌 JSON。
//
// 运行时（WASM）没有文件系统，所以内容目录在构建期打包、运行期解析与校验；
// 事件机制代码里没有任何卡片字面量，新增/修改内容不需要改 C++。
import { writeFileSync } from 'node:fs'

import { loadEventCards } from './lib/event-content.mjs'
import { formatIssue } from './lib/event-schema.mjs'

const { cards, issues } = loadEventCards()
if (issues.length > 0) {
  console.error(`事件内容校验失败（${issues.length} 项）：`)
  for (const issue of issues) console.error(`  ${formatIssue(issue)}`)
  process.exit(1)
}

const sorted = [...cards].sort((a, b) => a.id.localeCompare(b.id))
const bundle = { schema_version: 1, cards: sorted }
const json = JSON.stringify(bundle)
if (json.includes(')APC_EVENT_CARDS"')) {
  console.error('卡片内容包含保留分隔符，无法生成 C++ 原始字符串')
  process.exit(1)
}

const target = 'packages/game-core/src/v4/event_catalog_generated.cpp'
const output = `// 由 scripts/build-event-catalog.mjs 从 content/events/*.json 生成，请勿手改。
#include "apc/v4/event.hpp"

namespace apc::v4::event {

const char* embedded_event_cards() {
    return R"APC_EVENT_CARDS(${json})APC_EVENT_CARDS";
}

}  // namespace apc::v4::event
`
writeFileSync(target, output)
console.log(`事件内容已打包：${sorted.length} 张卡 -> ${target}`)
