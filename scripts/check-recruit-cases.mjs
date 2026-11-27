#!/usr/bin/env node
// 校验招聘契约用例：oracle 在 scripts/lib/recruit-oracle.mjs，逐条比对期望。
// 用法: node scripts/check-recruit-cases.mjs [用例文件]
//
// 与 check-handover-cases.mjs 同定位：规则样本，不是运行时。
// C++ 领域实现必须给出同一结论；改规则先改用例与 M0 §14.7，再改实现。
import { readFileSync } from 'node:fs'
import {
  scoutGuard, scout, expireCandidates, rotatePool, unpackOnHire, generateCandidate,
} from './lib/recruit-oracle.mjs'

const path = process.argv[2] || 'docs/fixtures/recruit_cases.json'

let doc
try {
  doc = JSON.parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`无法读取或解析 ${path}: ${error.message}`)
  process.exit(1)
}

const ids = (pool) => pool.map((c) => c.staff.id)

function actual(testCase) {
  const { op, input } = testCase
  switch (op) {
    case 'scout_guard':
      return { error: scoutGuard(input).error }
    case 'expire':
      return { remaining_ids: ids(expireCandidates(input.pool, input.week)) }
    case 'rotate': {
      const before = input.pool
      const result = rotatePool(before, input.seed, input.week, { params: input.params })
      const beforeRegular = before.filter((c) => c.origin === 'regular')
      const afterRegular = result.pool.filter((c) => c.origin === 'regular')
      const kept = afterRegular.filter((c) => beforeRegular.some((b) => b.staff.id === c.staff.id))
      const added = afterRegular.filter((c) => !beforeRegular.some((b) => b.staff.id === c.staff.id))
      const beforeScouts = before.filter((c) => c.origin === 'scout')
      const afterScouts = result.pool.filter((c) => c.origin === 'scout')
      return {
        regular_kept: kept.length,
        regular_added: added.length,
        scout_untouched: JSON.stringify(beforeScouts) === JSON.stringify(afterScouts),
        kept_fields_identical: kept.every((c) => {
          const origin = beforeRegular.find((b) => b.staff.id === c.staff.id)
          return JSON.stringify(origin) === JSON.stringify(c)
        }),
      }
    }
    case 'unpack': {
      const staff = unpackOnHire(input.candidate)
      return {
        has_keys: Object.keys(staff),
        absent_keys: ['expires_week', 'origin'].filter((k) => k in staff),
      }
    }
    case 'determinism': {
      const a = generateCandidate(input.seed, input.week, input.index)
      const b = generateCandidate(input.seed, input.week, input.index)
      return { identical: JSON.stringify(a) === JSON.stringify(b) }
    }
    case 'week_sensitivity': {
      const a = generateCandidate(input.seed, input.week, input.index)
      const b = generateCandidate(input.seed, input.week + 1, input.index)
      return { identical: JSON.stringify(a) === JSON.stringify(b) }
    }
    case 'scout': {
      const result = scout(input.ctx, input.pool, { params: input.params })
      if (result.error) return { error: result.error }
      const added = result.pool.slice(input.pool.length)
      return {
        error: null,
        last_scout_week: result.last_scout_week,
        added_count: added.length,
        added_origin: added[0]?.origin ?? null,
        added_expires_week: added[0]?.expires_week ?? null,
      }
    }
    default:
      throw new Error(`未知 op: ${op}`)
  }
}

function matches(key, actualValue, expectedValue) {
  if (key === 'has_keys') return expectedValue.every((k) => actualValue.includes(k))
  if (key === 'absent_keys') return actualValue.length === 0
  return JSON.stringify(actualValue) === JSON.stringify(expectedValue)
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
    (key) => !matches(key, result[key], testCase.expect[key]),
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
  console.error(`招聘用例失败: ${errors.length} 条不符 / 共 ${rows.length} 条`)
  process.exit(1)
}
console.log(`招聘用例通过: ${rows.length} 条全部符合期望`)