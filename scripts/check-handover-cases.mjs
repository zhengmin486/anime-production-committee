#!/usr/bin/env node
// 校验磨合损失用例：把"判定规则"写成参考实现，逐条比对用例期望。
// 用法: node scripts/check-handover-cases.mjs [用例文件]
//
// 这个脚本不是游戏运行时，而是 M0 的规则样本（oracle）：
// M1 的领域实现必须与它一致；若规则要改，先改用例与本文档，再改实现。
import { readFileSync } from 'node:fs'

const SUPERVISOR_ROLES = new Set(['director', 'animation_director', 'production_manager'])

const path = process.argv[2] || 'docs/fixtures/handover_cases.json'

let doc
try {
  doc = JSON.parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`无法读取或解析 ${path}: ${error.message}`)
  process.exit(1)
}

// 规则参考实现（对应 DOMAIN_ARCHITECTURE §7.2.1）
export function judge(testCase) {
  const { staff, item, last_participation: last, current } = testCase
  const produced = current?.produced ?? 0
  const contributes = produced > 0

  // 没有产出就不是"参与"，不记参与者、不判损失
  if (!contributes) return { item_loss: false, supervisor_loss: false, contributor_added: false }

  const isSupervisor = SUPERVISOR_ROLES.has(staff.role)
  const alreadyInvolved = (item.contributors ?? []).includes(staff.id)
  const started = item.work_done > 0 && item.work_done < item.work_total // 已完成项分配不到，不构成接手
  const switchingProject = last == null || last.work_id !== current.work_id

  return {
    // 非监督人员：接手"他人已开工、自己没参与过"的具体工作项
    item_loss: !isSupervisor && started && !alreadyInvolved,
    // 监督人员：切换项目时产生团队级一次性损失（与工作项判定互斥）
    supervisor_loss: isSupervisor && switchingProject,
    // 只要本周有产出就记入参与者（用于后续"是否参与过"的判断）
    contributor_added: true,
  }
}

const errors = []
const rows = []

for (const testCase of doc.cases ?? []) {
  if (!testCase.id || !testCase.expect) {
    errors.push(`用例缺少 id 或 expect: ${JSON.stringify(testCase).slice(0, 80)}`)
    continue
  }
  const actual = judge(testCase)
  const expected = testCase.expect
  const mismatched = ['item_loss', 'supervisor_loss', 'contributor_added'].filter(
    (key) => Boolean(actual[key]) !== Boolean(expected[key]),
  )
  if (mismatched.length > 0) {
    errors.push(
      `${testCase.id} 不符（${testCase.desc ?? ''}）: ` +
        mismatched.map((k) => `${k} 期望 ${expected[k]} 实际 ${actual[k]}`).join('; '),
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
  console.error(`磨合用例失败: ${errors.length} 条不符 / 共 ${rows.length} 条`)
  process.exit(1)
}
console.log(`磨合用例通过: ${rows.length} 条全部符合期望`)
