// 跨模块账目一致性检查的回归样例（node --test）。
// 运行：node --test scripts/tests/test_audit_ledger_consistency.mjs
// 数值取自 docs/GAME_RULES.md V3.4 可手算账本，保证“正常结算样例”对现有 v3 合法存档兼容。

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditState } from '../audit-ledger-consistency.mjs'

const costs = (over = {}) => ({ salary: 0, operations: 0, production: 0, temporary: 0, outsourcing: 0, events: 0, extension: 0, penalty: 0, ...over })
const finance = (contract = 0, invest = 0, share = 0, cost = costs()) => ({ contract_received: contract, investment_paid: invest, commercial_share_received: share, costs: cost })
const staff = () => []
const offer = (id) => ({ id, name: id, source: 'manga', scale: 'ova', contract_budget: 2_000_000, duration_weeks: 5, target_quality: 60, audience_base: 60, commercial_potential: 65, risk: 'low', allowed_modes: ['contract', 'committee'], workloads: { script: 100, storyboard: 100, key_animation: 100, animation_check: 100, postproduction: 100 }, previous_work_id: null })
const stageSet = () => ({ script: { status: 'completed' }, storyboard: { status: 'completed' }, key_animation: { status: 'completed' }, animation_check: { status: 'completed' }, postproduction: { status: 'completed' } })

const work = (over = {}) => ({
  id: 'v3_ova', name: '放学后的第七帧', source: 'manga', scale: 'ova', previous_work_id: null, mode: 'contract',
  investment_percent: 0, start_week: 0, end_week: 5, end_reason: 'completed', quality_score: 70, commercial_score: 80,
  commercial_revenue: 20_000_000, finance: finance(2_000_000, 0, 0, costs({ salary: 500_000, operations: 100_000, production: 400_000 })),
  profit: 1_000_000, team: [], stages: stageSet(), ...over,
})

const base = (over = {}) => ({
  version: 3, seed: 12345, phase: 'project_settled',
  company: { week: 5, status: 'running', end_reason: null, initial_funds: 5_000_000, funds: 6_000_000, reputation: 110, staff: staff(), finance: finance(2_000_000, 0, 0, costs({ salary: 500_000, operations: 100_000, production: 400_000 })) },
  offers: [], recruitment_pool: [], suppliers: [], project: null, pending_event: null,
  history: [work()], last_project_id: 'v3_ova', company_result: null, preview: null, ...over,
})

const status = (result, check) => result.findings.find((f) => f.check === check)?.status
const detail = (result, check) => result.findings.find((f) => f.check === check)?.detail ?? ''

test('正常结算（承制）通过全部对账，且兼容现有 v3 合法账目', () => {
  const state = base()
  const before = JSON.stringify(state)
  const result = auditState(state)
  assert.equal(result.ok, true, detail(result, '1-company-funds-ledger'))
  assert.equal(status(result, '1-company-funds-ledger'), 'PASS')
  assert.equal(status(result, '2-revenue-reconciliation'), 'PASS')
  assert.equal(status(result, '4-work-profit-identity'), 'PASS')
  assert.equal(status(result, '7-settlement-state'), 'PASS')
  // 不修改原始输入状态。
  assert.equal(JSON.stringify(state), before)
})

test('正常结算（委员会 10%）现金与利润恒等式同样成立', () => {
  const committeeWork = work({ mode: 'committee', investment_percent: 10, finance: finance(2_000_000, 1_000_000, 2_000_000, costs({ salary: 500_000, operations: 100_000, production: 400_000 })), profit: 2_000_000 })
  const state = base({
    history: [committeeWork],
    company: { week: 5, status: 'running', end_reason: null, initial_funds: 5_000_000, funds: 7_000_000, reputation: 110, staff: staff(), finance: finance(2_000_000, 1_000_000, 2_000_000, costs({ salary: 500_000, operations: 100_000, production: 400_000 })) },
  })
  const result = auditState(state)
  assert.equal(result.ok, true, detail(result, '1-company-funds-ledger'))
  // 委员会作品未带 channel_breakdown：分渠道核对标记待接入而非失败。
  assert.equal(status(result, '6-channel-split'), 'PENDING')
})

test('经营亏损但账目自洽仍判通过（利润为负不算不一致）', () => {
  const lossWork = work({ finance: finance(1_000_000, 0, 0, costs({ salary: 1_000_000, production: 500_000 })), profit: -500_000 })
  const state = base({
    history: [lossWork],
    company: { week: 5, status: 'running', end_reason: null, initial_funds: 2_000_000, funds: 1_500_000, reputation: 110, staff: staff(), finance: finance(1_000_000, 0, 0, costs({ salary: 1_000_000, production: 500_000 })) },
  })
  const result = auditState(state)
  assert.equal(result.ok, true, detail(result, '4-work-profit-identity'))
  assert.equal(status(result, '4-work-profit-identity'), 'PASS')
})

test('破产终局现金为负且账目自洽：通过，且允许负资金', () => {
  const bankruptWork = work({ finance: finance(1_000_000, 0, 0, costs({ salary: 2_000_000, penalty: 3_000_000 })), profit: -4_000_000 })
  const state = base({
    phase: 'project_settled',
    history: [bankruptWork], last_project_id: 'v3_ova',
    company: { week: 5, status: 'closing', end_reason: 'bankrupt', initial_funds: 2_000_000, funds: -2_000_000, reputation: 110, staff: staff(), finance: finance(1_000_000, 0, 0, costs({ salary: 2_000_000, penalty: 3_000_000 })) },
  })
  const result = auditState(state)
  assert.equal(result.ok, true, detail(result, '8-endgame-lock'))
  assert.equal(status(result, '8-endgame-lock'), 'PASS')
})

test('主动结束终局：company_result 净额与历史数一致才通过', () => {
  const state = base({
    phase: 'company_ended',
    company: { week: 5, status: 'ended', end_reason: 'voluntary', initial_funds: 5_000_000, funds: 6_000_000, reputation: 110, staff: staff(), finance: finance(2_000_000, 0, 0, costs({ salary: 500_000, operations: 100_000, production: 400_000 })) },
    company_result: { reason: 'voluntary', weeks: 5, final_funds: 6_000_000, net_cash_change: 1_000_000, total_projects: 1, best_work_id: 'v3_ova', rating: 'stable' },
  })
  const result = auditState(state)
  assert.equal(result.ok, true, detail(result, '8-endgame-lock'))
})

test('520 周到期终局：非 running 且仍下发企划 = 违规', () => {
  const state = base({
    phase: 'company_ended',
    offers: [offer('v3_new')],
    company: { week: 520, status: 'ended', end_reason: 'time_limit', initial_funds: 5_000_000, funds: 6_000_000, reputation: 110, staff: staff(), finance: finance(2_000_000, 0, 0, costs({ salary: 500_000, operations: 100_000, production: 400_000 })) },
    company_result: { reason: 'time_limit', weeks: 520, final_funds: 6_000_000, net_cash_change: 1_000_000, total_projects: 1, best_work_id: 'v3_ova', rating: 'stable' },
  })
  const result = auditState(state)
  assert.equal(result.ok, false)
  assert.equal(status(result, '8-endgame-lock'), 'FAIL')
  assert.match(detail(result, '8-endgame-lock'), /仍下发/)
})

test('历史记录不一致：作品利润与自身账目不符被点名', () => {
  const badWork = work({ profit: 999_999 })
  const state = base({ history: [badWork] })
  const result = auditState(state)
  assert.equal(result.ok, false)
  assert.equal(status(result, '4-work-profit-identity'), 'FAIL')
  assert.match(detail(result, '4-work-profit-identity'), /v3_ova/)
})

test('公司现金与全生命周期交易不符：明确指出差额', () => {
  const state = base({ company: { ...base().company, funds: 6_500_000 } })
  const result = auditState(state)
  assert.equal(result.ok, false)
  assert.equal(status(result, '1-company-funds-ledger'), 'FAIL')
  assert.match(detail(result, '1-company-funds-ledger'), /差额/)
})

test('同一笔收入重复入账：公司收入高于各作品汇总被识别', () => {
  // 公司账记到 4,000,000（现金也按此算平），但只有一笔作品结算收到 2,000,000。
  const state = base({ company: { ...base().company, funds: 8_000_000, finance: finance(4_000_000, 0, 0, costs({ salary: 500_000, operations: 100_000, production: 400_000 })) } })
  const result = auditState(state)
  assert.equal(result.ok, false)
  assert.equal(status(result, '1-company-funds-ledger'), 'PASS')
  assert.equal(status(result, '2-revenue-reconciliation'), 'FAIL')
  assert.match(detail(result, '2-revenue-reconciliation'), /重复入账/)
})

test('同一笔支出重复计入项目账：成本归属汇总超过公司账', () => {
  const first = work()
  const second = work({ id: 'w2' })
  // 两笔作品各记 salary 500,000 => 汇总 1,000,000，公司账 salary 只有 500,000（重复计入）。
  const state = base({
    history: [first, second],
    company: { week: 5, status: 'running', end_reason: null, initial_funds: 5_000_000, funds: 7_500_000, reputation: 110, staff: staff(), finance: finance(4_000_000, 0, 0, costs({ salary: 500_000, operations: 200_000, production: 800_000 })) },
  })
  const result = auditState(state)
  assert.equal(result.ok, false)
  assert.equal(status(result, '3-cost-containment'), 'FAIL')
  assert.match(detail(result, '3-cost-containment'), /重复计入/)
})

test('BD 与非 BD 渠道公司所得分别汇总，与财务分成不符时报错', () => {
  const splitWork = work({
    mode: 'committee', investment_percent: 10,
    commercial_revenue: 20_000_000,
    finance: finance(2_000_000, 1_000_000, 2_000_000, costs({ salary: 500_000, operations: 100_000, production: 400_000 })),
    profit: 2_000_000,
    channel_breakdown: [
      { channel: 'bd', revenue: 12_000_000, company_received: 1_000_000 },
      { channel: 'toy', revenue: 8_000_000, company_received: 500_000 },
    ],
  })
  const state = base({
    history: [splitWork],
    company: { week: 5, status: 'running', end_reason: null, initial_funds: 5_000_000, funds: 7_000_000, reputation: 110, staff: staff(), finance: finance(2_000_000, 1_000_000, 2_000_000, costs({ salary: 500_000, operations: 100_000, production: 400_000 })) },
  })
  const result = auditState(state)
  // Σrevenue = 20,000,000 与总收入对得上，但 Σcompany_received = 1,500,000 ≠ 分成 2,000,000。
  assert.equal(status(result, '6-channel-split'), 'FAIL')
  assert.match(detail(result, '6-channel-split'), /BD ¥1,000,000 \+ 非BD ¥500,000/)
})

test('空闲期成本只进公司账：不算重复扣款，成本归属仍通过', () => {
  const idleWork = work() // 作品成本 salary500k + ops100k + prod400k
  const state = base({
    history: [idleWork],
    // 公司账多出空闲期运营 50,000（不进作品账）。
    company: { week: 6, status: 'running', end_reason: null, initial_funds: 5_000_000, funds: 5_950_000, reputation: 110, staff: staff(), finance: finance(2_000_000, 0, 0, costs({ salary: 500_000, operations: 150_000, production: 400_000 })) },
  })
  const result = auditState(state)
  assert.equal(status(result, '3-cost-containment'), 'PASS')
  assert.match(detail(result, '3-cost-containment'), /项目区间外成本/)
  assert.equal(status(result, '1-company-funds-ledger'), 'PASS')
})

test('未接入规则以 PENDING 声明，不伪造通过', () => {
  const result = auditState(base())
  assert.equal(status(result, 'pending-rules'), 'PENDING')
  assert.match(detail(result, 'pending-rules'), /success_reward_received/)
})

test('非法输入抛错，不静默通过', () => {
  assert.throws(() => auditState({ version: 2, foo: 1 }), /GameState/)
})
