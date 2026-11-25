#!/usr/bin/env node
// 内容作者命令：校验 content/events/*.json，错误定位到文件 / 卡片 / 字段。
import { loadEventCards } from './lib/event-content.mjs'
import { formatIssue } from './lib/event-schema.mjs'

const { cards, issues } = loadEventCards()
if (issues.length > 0) {
  console.error(`事件内容校验失败（${issues.length} 项）：`)
  for (const issue of issues) console.error(`  ${formatIssue(issue)}`)
  process.exit(1)
}
console.log(`事件内容校验通过：${cards.length} 张卡（schema_version=1）`)
