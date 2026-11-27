import { readFileSync } from 'node:fs'
import { validateOpportunityCatalog } from './lib/opportunity-oracle.mjs'

const catalog = JSON.parse(readFileSync('content/opportunities.json', 'utf8'))
const issues = validateOpportunityCatalog(catalog)
if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.field}: ${issue.message}`)
  process.exitCode = 1
} else {
  console.log(`特殊商业机会内容校验通过：${catalog.opportunities.length} 类`)
}
