#!/usr/bin/env node
// 校验市场契约用例：oracle 在 scripts/lib/market-oracle.mjs，逐条比对期望。
// 用法: node scripts/check-market-cases.mjs [用例文件]
//
// 与 check-handover-cases.mjs 同定位：规则样本，不是运行时。
// C++ 领域实现必须给出同一结论；改规则先改用例与 M0 §14.13，再改实现。
import { readFileSync } from 'node:fs'
import {
  initialMarket, topUpMarket, expireOffers, releaseExpiredLocks,
  lockOffer, depositAmount, startWorkCash, isIdReuse, generateOffer, heatLevel, HEAT_LEVELS,
} from './lib/market-oracle.mjs'

const path = process.argv[2] || 'docs/fixtures/market_cases.json'

let doc
try {
  doc = JSON.parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`无法读取或解析 ${path}: ${error.message}`)
  process.exit(1)
}

function actual(testCase) {
  const { op, input } = testCase
  switch (op) {
    case 'initial':
      return { count: initialMarket(input.seed, { params: input.params }).length }
    case 'topup': {
      const result = topUpMarket(input.slots, input.seed, input.week, { params: input.params })
      const kept = result.slots.filter((o) => input.slots.some((b) => b.id === o.id))
      return {
        kept_identical: kept.every((o) => JSON.stringify(input.slots.find((b) => b.id === o.id)) === JSON.stringify(o)),
        added_count: result.added_ids.length,
        total: result.slots.length,
      }
    }
    case 'expire':
      return { remaining_ids: expireOffers(input.slots, input.week).map((o) => o.id) }
    case 'release_locks':
      return { remaining_ids: releaseExpiredLocks(input.slots, input.week).map((o) => o.id) }
    case 'lock': {
      const result = lockOffer(input.offer, input.week, input.deposit)
      if (result.error) return { error: result.error }
      return {
        error: null,
        locked_until: result.offer.locked_until,
        lock_used: result.offer.lock_used,
        deposit_paid: result.offer.deposit_paid,
      }
    }
    case 'deduct':
      return startWorkCash(input.offer, input.totalPayable, input.week)
    case 'deposit':
      return { deposit: depositAmount(input.offer) }
    case 'id_reuse':
      return { reuse: isIdReuse(input.id, input.historyIds) }
    case 'determinism': {
      const a = generateOffer(input.seed, input.week, input.index)
      const b = generateOffer(input.seed, input.week, input.index)
      return { identical: JSON.stringify(a) === JSON.stringify(b) }
    }
    case 'week_sensitivity': {
      const a = generateOffer(input.seed, input.week, input.index)
      const b = generateOffer(input.seed, input.week + 1, input.index)
      return { identical: JSON.stringify(a) === JSON.stringify(b) }
    }
    case 'heat': {
      const a = heatLevel(input.seed, input.week, input.genre)
      const b = heatLevel(input.seed, input.week, input.genre)
      return { deterministic: a === b, valid_level: HEAT_LEVELS.includes(a) }
    }
    default:
      throw new Error(`未知 op: ${op}`)
  }
}

const errors = []
const rows = []

for (const testCase of doc.cases ?? []) {
  if (!testCase.id || !testCase.expect) {
    errors.push(`用例缺少 id 或 expect: ${JSON.stringify(testCase).slice(0, 80)}`)
    continue
  }
  let result
  try {
    result = actual(testCase)
  } catch (error) {
    errors.push(`${testCase.id} 执行异常: ${error.message}`)
    rows.push({ id: testCase.id, desc: testCase.desc ?? '', ok: false })
    continue
  }
  const mismatched = Object.keys(testCase.expect).filter(
    (key) => JSON.stringify(result[key]) !== JSON.stringify(testCase.expect[key]),
  )
  if (mismatched.length > 0) {
    errors.push(
      `${testCase.id} 不符（${testCase.desc ?? ''}）: ` +
        mismatched.map((k) => `${k} 期望 ${JSON.stringify(testCase.expect[k])} 实际 ${JSON.stringify(result[k])}`).join('; '),
    )
  }
  rows.push({ id: testCase.id, desc: testCase.desc ?? '', ok: mismatched.length === 0 })
}

if (!Array.isArray(doc.cases) || doc.cases.length === 0) {
  console.error('用例文件没有 cases')
  process.exit(1)
}

const width = Math.max(...rows.map((r) => r.id.length))
for (const row of rows) {
  console.log(`${row.ok ? 'PASS' : 'FAIL'}  ${row.id.padEnd(width)}  ${row.desc}`)
}

console.log('')
if (errors.length > 0) {
  for (const line of errors) console.error(`错误 ${line}`)
  console.error(`市场用例失败: ${errors.length} 条不符 / 共 ${rows.length} 条`)
  process.exit(1)
}
console.log(`市场用例通过: ${rows.length} 条全部符合期望`)