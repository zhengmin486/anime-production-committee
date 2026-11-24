import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import createGameCore from '../../../apps/web/public/wasm/game-core.mjs'

const wasmUrl = new URL('../../../apps/web/public/wasm/game-core.wasm', import.meta.url)
const core = await createGameCore()
const methods = ['initialize_game', 'start_project', 'apply_decision', 'advance_week', 'resolve_event', 'calculate_result']
const call = (method, input, module = core) => JSON.parse(module[method](JSON.stringify(input)))
function ok(method, input, module = core) {
  const result = call(method, input, module)
  assert.equal(result.error, undefined, JSON.stringify(result))
  return result
}
const initial = (seed = 12345, module = core) => ok('initialize_game', { seed }, module).state
const start = (seed = 12345, module = core) => ok('start_project', { state: initial(seed, module), offer_id: 'proj_ova_01', mode: 'contract', investment_percent: 0 }, module).state
function configure(state, policy = 'balanced', module = core) {
  const stage = state.project.current_stage
  const recommended = state.project.stages[stage].recommended_configuration
  return ok('apply_decision', { state, decision: { type: 'configure_stage', stage, configuration: { assignments: recommended.assignments, policy, overtime: false } } }, module).state
}
// 周推进后若产生事件，自动选择不花钱的可用选项，使既有轨迹测试继续跑到阶段/交付节点。
const advance = (state, module = core) => {
  const result = ok('advance_week', { state }, module)
  let next = result.state
  while (next.phase === 'event_pending') {
    const option = next.pending_event.options
      .filter((item) => item.disabled_reason === null)
      .sort((left, right) => left.cost - right.cost)[0]
    next = ok('resolve_event', { state: next, option_id: option.id }, module).state
  }
  return { ...result, state: next }
}
const advanceRaw = (state, module = core) => ok('advance_week', { state }, module)
function expectError(result, code) {
  assert.deepEqual(Object.keys(result), ['error'])
  assert.deepEqual(Object.keys(result.error).sort(), ['code', 'message'])
  assert.equal(result.error.code, code)
  assert.equal(typeof result.error.message, 'string')
  assert.ok(result.error.message.length > 0)
}
const stageOrder = ['script', 'storyboard', 'key_animation', 'animation_check', 'postproduction']
function checkInvariants(state) {
  if (state.project === null) return
  const current = state.project.current_stage === null ? 5 : stageOrder.indexOf(state.project.current_stage)
  let seenActive = false
  for (const [index, stage] of stageOrder.entries()) {
    const item = state.project.stages[stage]
    if (item.status === 'completed') assert.ok(!seenActive && index < current, stage)
    if (item.status === 'active') { seenActive = true; assert.equal(index, current) }
    if (item.status === 'ready') { assert.equal(index, current); assert.equal(item.work_done, 0) }
  }
  assert.ok(state.company.funds >= 0 || state.company.status !== 'running')
}
function run(seed, module = core, policy = 'balanced') {
  let state = configure(start(seed, module), policy, module)
  const trace = [state]
  for (let step = 0; step < 60 && state.phase === 'producing'; step++) {
    const stage = state.project.current_stage
    if (state.project.stages[stage].status === 'ready') state = configure(state, policy, module)
    const result = advance(state, module)
    state = result.state
    checkInvariants(state)
    trace.push(result)
  }
  assert.equal(state.phase, 'project_ready')
  trace.push(ok('calculate_result', { state, scope: 'project' }, module))
  return trace
}

test('工厂加载真实 WASM 二进制并导出 v3 六接口', async () => {
  assert.equal(createGameCore.name, 'createGameCore')
  const bytes = await readFile(wasmUrl)
  assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0])
  assert.ok(WebAssembly.validate(bytes))
  for (const method of methods) assert.equal(typeof core[method], 'function')
})

test('v3 初始化、接手合同与首周黄金数据通过 Embind', () => {
  const idle = initial()
  assert.equal(idle.version, 3)
  assert.equal(idle.phase, 'idle')
  assert.equal(idle.company.funds, 2_000_000)
  assert.equal(idle.offers.length, 4)
  assert.equal(idle.offers[0].id, 'proj_ova_01')
  assert.equal(idle.preview.total_cost, 180_000)
  const state = start()
  assert.equal(state.project.offer.name, '放学后的第七帧')
  assert.equal(state.company.funds, 6_000_000)
  assert.equal(state.project.deadline_week, 14)
  assert.deepEqual(state.seed, idle.seed)
  const request = structuredClone(state)
  const first = advance(configure(state))
  assert.deepEqual(state, request)
  assert.equal(first.state.company.funds, 5_790_000)
  assert.equal(first.state.company.week, 1)
  assert.equal(first.state.project.stages.script.work_done, 10)
  assert.equal(first.state.project.stages.script.quality, 42)
  assert.equal(first.state.company.staff[0].morale, 78)
  assert.equal(first.state.company.staff[0].fatigue, 4)
  assert.equal(first.state.seed, 12345)
  assert.equal(first.report.funds_delta, -210_000)
})

test('相同种子的整局轨迹跨独立 WASM 实例与插局干扰完全相同', async () => {
  const second = await createGameCore()
  for (const seed of [0, 1, 13, 12345, 0xffffffff]) {
    const first = run(seed)
    run(4242, second, 'quality')
    assert.deepEqual(run(seed, second), first, `seed ${seed}`)
  }
})

test('完整对局结算、返回市场与企划轮换', () => {
  let state = configure(start())
  for (let step = 0; step < 60 && state.phase === 'producing'; step++) {
    const stage = state.project.current_stage
    if (state.project.stages[stage].status === 'ready') state = configure(state)
    state = advance(state).state
  }
  assert.equal(state.phase, 'project_ready')
  assert.equal(state.project.delivery_reason, 'deadline')
  expectError(call('advance_week', { state }), 'INVALID_PHASE')
  const settled = ok('calculate_result', { state, scope: 'project' })
  assert.equal(settled.state.phase, 'project_settled')
  assert.equal(settled.state.last_project_id, 'proj_ova_01')
  assert.equal(settled.state.history[0].id, 'proj_ova_01')
  assert.equal(settled.state.company.funds, state.company.funds - settled.result.finance.costs.penalty)
  assert.equal(settled.result.finance.costs.penalty, 800_000)
  assert.equal(settled.result.end_reason, 'deadline')
  assert.equal(settled.result.commercial_revenue % 15_000, 0)
  assert.ok(settled.result.quality_score >= 0 && settled.result.quality_score <= 100)
  expectError(call('calculate_result', { state: settled.state, scope: 'project' }), 'INVALID_PHASE')
  const returned = ok('apply_decision', { state: settled.state, decision: { type: 'return_to_market' } })
  assert.equal(returned.state.phase, 'idle')
  assert.equal(returned.state.seed, 87628868)
  assert.deepEqual(returned.state.offers.map((offer) => offer.id), ['proj_short_03', 'proj_tv_03', 'proj_ova_04', 'proj_movie_02'])
  const next = ok('start_project', { state: returned.state, offer_id: 'proj_short_03', mode: 'contract', investment_percent: 0 })
  assert.equal(next.state.project.start_week, 14)
})

test('M1 未开放动作返回契约错误且不修改状态', () => {
  const idle = initial()
  expectError(call('start_project', { state: idle, offer_id: 'proj_ova_01', mode: 'committee', investment_percent: 0 }), 'MODE_NOT_ALLOWED')
  expectError(call('apply_decision', { state: idle, decision: { type: 'hire_core', staff_id: 'staff_01' } }), 'INVALID_INPUT')
  expectError(call('apply_decision', { state: start(), decision: { type: 'hire_temporary', staff_id: 'tmp_01' } }), 'INVALID_INPUT')
  expectError(call('apply_decision', { state: start(), decision: { type: 'request_extension' } }), 'MODE_NOT_ALLOWED')
  expectError(call('resolve_event', { state: idle }), 'INVALID_PHASE')
  const producing = start()
  expectError(call('resolve_event', { state: producing }), 'INVALID_PHASE')
  const tampered = structuredClone(producing)
  tampered.pending_event = { id: 'evt_001' }
  expectError(call('advance_week', { state: tampered }), 'INVALID_INPUT')
})

test('空闲周推进扣款与企划轮换、破产周零修改', () => {
  const idle = initial()
  const week = advance(idle)
  assert.equal(week.state.company.week, 1)
  assert.equal(week.state.company.funds, 1_820_000)
  assert.equal(week.state.seed, 87628868)
  assert.deepEqual(week.state.offers.map((offer) => offer.id), ['proj_short_03', 'proj_tv_03', 'proj_ova_04', 'proj_movie_02'])
  const poor = { ...initial(), company: { ...idle.company, funds: 179_999 } }
  const bankrupt = advance(poor)
  assert.equal(bankrupt.state.company.funds, 179_999)
  assert.equal(bankrupt.state.company.week, 0)
  assert.equal(bankrupt.state.company.status, 'closing')
  assert.equal(bankrupt.state.company.end_reason, 'bankrupt')
  assert.deepEqual(bankrupt.state.offers, [])
  expectError(call('advance_week', { state: bankrupt.state }), 'COMPANY_ENDED')
  expectError(call('apply_decision', { state: bankrupt.state, decision: { type: 'end_company' } }), 'COMPANY_ENDED')
})

test('JSON 异常在 WASM 内捕获，后续调用正常', () => {
  for (const raw of ['', '{', 'undefined', 'null', 'true', '42', '"text"', '[]', '{}',
    '{"seed":1e1000}', '{"seed":1} trailing', '{"seed":1,}', '{"seed":18446744073709551615}',
    '{"seed":18446744073709551616}', '{"seed":1.0}', '{"seed":1e0}']) {
    for (const method of methods) expectError(JSON.parse(core[method](raw)), 'INVALID_INPUT')
    assert.equal(initial().phase, 'idle')
  }
})

test('嵌套数值与安全整数边界', () => {
  const invalid = {
    funds: [-1, Number.MAX_SAFE_INTEGER + 1, 0.5, '1', true, null, [], {}],
    seed: [-1, 0x100000000, 1.5, '1', true, null, [], {}],
  }
  for (const [field, values] of Object.entries(invalid)) {
    for (const value of values) {
      const state = start()
      if (field === 'funds') state.company.funds = value
      else state[field] = value
      expectError(call('advance_week', { state }), 'INVALID_INPUT')
    }
    const state = start()
    if (field === 'funds') delete state.company.funds
    else delete state[field]
    expectError(call('advance_week', { state }), 'INVALID_INPUT')
  }
  const rich = configure(start())
  rich.company.funds = Number.MAX_SAFE_INTEGER
  assert.equal(advance(rich).state.company.funds, Number.MAX_SAFE_INTEGER - 210_000)
  expectError(call('start_project', { state: { ...initial(), company: { ...initial().company, funds: Number.MAX_SAFE_INTEGER } }, offer_id: 'proj_ova_01', mode: 'contract', investment_percent: 0 }), 'INVALID_INPUT')
})

function probeValidation(state, code = 'INVALID_PHASE') {
  const before = JSON.stringify(state)
  const { seed, company: { funds, week } } = state
  expectError(call('resolve_event', { state }), code)
  assert.equal(JSON.stringify(state), before)
  assert.equal(state.seed, seed)
  assert.equal(state.company.funds, funds)
  assert.equal(state.company.week, week)
}

test('动态名册和两类招聘候选通过真实核心校验，候选不计工资', () => {
  for (const count of [0, 1, 4, 7]) {
    const state = initial()
    const template = state.company.staff[0]
    state.company.staff = Array.from({ length: count }, (_, index) => ({ ...structuredClone(template), id: `dynamic_${index}`, weekly_salary: 1000 }))
    state.recruitment_pool = [
      { ...structuredClone(template), id: 'candidate_core' },
      { ...structuredClone(template), id: 'candidate_temp', employment: 'temporary', weekly_salary: 0, project_fee: 1234 },
    ]
    state.preview.costs.salary = count * 1000
    state.preview.total_cost = count * 1000 + 30_000
    probeValidation(state)
    const next = advance(state).state
    assert.equal(next.company.funds, state.company.funds - state.preview.total_cost)
    assert.deepEqual(next.recruitment_pool, state.recruitment_pool)
    const duplicate = structuredClone(state)
    duplicate.recruitment_pool.push(structuredClone(duplicate.recruitment_pool[0]))
    probeValidation(duplicate, 'INVALID_INPUT')
  }
})

test('动态报价快照决定工期和工作量，结算不重复扣已支付费用', () => {
  const idle = initial()
  Object.assign(idle.offers[0], { id: 'dynamic_work_r123', name: '动态作品', duration_weeks: 5, origin: 'incoming', style: 'normal', min_reputation: 0 })
  for (const stage of stageOrder) idle.offers[0].workloads[stage] = 1
  let state = ok('start_project', { state: idle, offer_id: idle.offers[0].id, mode: 'contract', investment_percent: 0 }).state
  assert.equal(state.project.deadline_week, 5)
  for (const [key, value] of Object.entries({ temporary: 100, outsourcing: 200, development: 300, distribution: 400 })) {
    state.project.finance.costs[key] = value
    state.company.finance.costs[key] = value
    state.company.funds -= value
  }
  for (let index = 0; index < 5; index++) state = advance(configure(state)).state
  assert.equal(state.phase, 'project_ready')
  assert.equal(state.project.delivery_reason, 'completed')
  assert.equal(state.company.week, 5)
  const settled = ok('calculate_result', { state, scope: 'project' })
  assert.equal(settled.state.company.funds, state.company.funds)
  assert.equal(settled.result.id, 'dynamic_work_r123')
  assert.equal(settled.result.origin, 'incoming')
  assert.equal(settled.result.style, 'normal')
  assert.equal(settled.result.profit, 4_000_000 - 5 * 210_000 - 1000)
  probeValidation(settled.state)
  const previous = structuredClone(settled.state)
  previous.history.push({ ...structuredClone(previous.history[0]), id: 'dynamic_sequel', previous_work_id: previous.history[0].id, start_week: 5, end_week: 10 })
  previous.company.week = 10
  previous.last_project_id = 'dynamic_sequel'
  probeValidation(previous)
  previous.history[0].previous_work_id = 'dynamic_sequel'
  probeValidation(previous, 'INVALID_INPUT')
})

test('临时人员配置可校验但无专业来源的制作周被原子拒绝', () => {
  const state = start()
  const person = { ...structuredClone(state.company.staff[0]), id: 'dynamic_temp', employment: 'temporary', weekly_salary: 0, project_fee: 500 }
  state.project.temporary_staff = [person]
  state.project.stages.script.recommended_configuration.assignments = [{ staff_id: person.id, role: person.role, focus: 'planning' }]
  probeValidation(state)
  const active = configure(state)
  const before = structuredClone(active)
  expectError(call('advance_week', { state: active }), 'MODE_NOT_ALLOWED')
  assert.deepEqual(active, before)
  const invalid = structuredClone(active)
  invalid.project.stages.script.configuration.assignments[0].staff_id = 'missing'
  probeValidation(invalid, 'INVALID_INPUT')
})

test('供应商外包和事件结构通过校验，未实现执行明确拒绝', () => {
  const state = configure(start())
  state.suppliers = [{ id: 'supplier_dynamic', name: '供应商', specialties: ['planning'], capacity: 50, quality: 60, speed: 10, unit_price: 100, reliability: 90, unlocked: true }]
  state.project.outsourcing = [{ id: 'task_dynamic', supplier_id: 'supplier_dynamic', stage: 'script', ability: 'planning', work_total: 10, work_done: 0, mode: 'normal', fee_paid: 1000, due_week: 1, status: 'active' }]
  probeValidation(state)
  expectError(call('advance_week', { state }), 'MODE_NOT_ALLOWED')
  const dangling = structuredClone(state)
  dangling.project.outsourcing[0].supplier_id = 'missing'
  probeValidation(dangling, 'INVALID_INPUT')
  state.phase = 'event_pending'
  state.preview = null
  state.pending_event = { id: 'dynamic_event', category: 'schedule', stage: 'script', title: '事件', description: '工期变化', trigger: { metric: 'delay', value: -1, threshold: 0 }, options: [{ id: 'wait', label: '等待', cost: 0, allows_reconfigure: false, disabled_reason: null }] }
  probeValidation(state, 'MODE_NOT_ALLOWED')
  for (const mutate of [
    (item) => { item.pending_event.stage = 'storyboard' },
    (item) => { item.phase = 'producing' },
    (item) => { item.pending_event.options[0].effect = { funds: 9999 } },
    (item) => { item.pending_event = null },
  ]) {
    const invalid = structuredClone(state)
    mutate(invalid)
    probeValidation(invalid, 'INVALID_INPUT')
  }
  const closed = ok('apply_decision', { state, decision: { type: 'end_company' } }).state
  assert.equal(closed.phase, 'project_ready')
  assert.equal(closed.pending_event, null)
  probeValidation(closed)
})

test('独立槽位及新旧可选字段兼容，关闭和终局不允许残留', () => {
  const state = initial()
  state.custom_offer = { ...structuredClone(state.offers[0]), id: 'custom', origin: 'custom' }
  state.pending_proposal = { ...structuredClone(state.offers[0]), id: 'proposal', origin: 'proposal', source: 'original', allowed_modes: ['committee'] }
  state.company.scout_pity = { since_sr: 0, since_ssr: 0 }
  state.preview.costs.development = 0
  state.preview.costs.distribution = 0
  probeValidation(state)
  const started = ok('start_project', { state, offer_id: state.offers[0].id, mode: 'contract', investment_percent: 0 }).state
  assert.equal(started.custom_offer, null)
  assert.equal(started.pending_proposal, null)
  const closing = ok('apply_decision', { state, decision: { type: 'end_company' } }).state
  probeValidation(closing)
  const ended = ok('calculate_result', { state: closing, scope: 'company' }).state
  probeValidation(ended)
  for (const mutate of [
    (item) => { item.offers = state.offers },
    (item) => { item.project = started.project },
    (item) => { item.custom_offer = state.custom_offer },
    (item) => { item.preview = state.preview },
  ]) {
    const invalid = structuredClone(ended)
    mutate(invalid)
    probeValidation(invalid, 'INVALID_INPUT')
  }
})

test('委员会可选阵容与空团队阶段快照在 WASM 具有相同校验边界', () => {
  const committee = start()
  committee.project.mode = 'committee'
  committee.project.investment_percent = 100
  committee.project.committee_pressure = 0
  committee.project.offer.allowed_modes = ['committee']
  probeValidation(committee)
  committee.project.committee = []
  probeValidation(committee)
  committee.project.investment_percent = 99
  probeValidation(committee, 'INVALID_INPUT')

  const state = start()
  state.company.week = 1
  state.project.current_stage = 'storyboard'
  Object.assign(state.project.stages.script, {
    status: 'completed', work_done: state.project.offer.workloads.script, quality: 50,
    configuration: { assignments: [], policy: 'balanced', overtime: false },
    result: { weeks_spent: 1, quality: 50, costs: initial().company.finance.costs, issues: [], team: [] },
  })
  state.project.stages.storyboard.status = 'ready'
  probeValidation(state)
  state.project.stages.script.configuration.assignments = [{ staff_id: 'missing_snapshot', role: 'director', focus: 'planning' }]
  probeValidation(state, 'INVALID_INPUT')
})

test('动态状态仍拒绝非法金额、枚举、可选字段 null 和阶段顺序', () => {
  for (const mutate of [
    (state) => { state.company.finance.costs.development = -1 },
    (state) => { state.company.scout_pity = null },
    (state) => { state.company.staff[0].potential.direction = 0 },
    (state) => { state.project.offer.origin = null },
    (state) => { state.project.offer.allowed_modes = ['contract', 'contract'] },
    (state) => { state.project.offer.workloads.script = 0 },
    (state) => { state.project.stages.storyboard.status = 'ready' },
    (state) => { state.project.committee = [] },
  ]) {
    const invalid = start()
    mutate(invalid)
    probeValidation(invalid, 'INVALID_INPUT')
  }
})

test('累计成本溢出及载入特殊风格项目不会返回伪成功', () => {
  const fullLedger = initial()
  fullLedger.company.finance.costs.events = Number.MAX_SAFE_INTEGER
  probeValidation(fullLedger)
  const before = structuredClone(fullLedger)
  expectError(call('advance_week', { state: fullLedger }), 'INVALID_INPUT')
  assert.deepEqual(fullLedger, before)
  const styled = start()
  styled.project.offer.origin = 'custom'
  styled.project.offer.style = 'ai'
  probeValidation(styled)
  expectError(call('advance_week', { state: configure(styled) }), 'MODE_NOT_ALLOWED')
  const ready = ok('apply_decision', { state: styled, decision: { type: 'end_company' } }).state
  expectError(call('calculate_result', { state: ready, scope: 'project' }), 'MODE_NOT_ALLOWED')
})

test('阶段人员岗位变化保留各阶段快照，结算状态仍可再次校验', () => {
  const idle = initial()
  for (const stage of stageOrder) idle.offers[0].workloads[stage] = 1
  let state = ok('start_project', { state: idle, offer_id: idle.offers[0].id, mode: 'contract', investment_percent: 0 }).state
  state = advance(configure(state)).state
  state.company.staff[0].role = 'scriptwriter'
  state.project.stages.storyboard.recommended_configuration.assignments[0].role = 'scriptwriter'
  for (let index = 1; index < 5; index++) state = advance(configure(state)).state
  const settled = ok('calculate_result', { state, scope: 'project' }).state
  assert.equal(settled.history[0].stages.script.result.team[0].role, 'director')
  assert.equal(settled.history[0].stages.storyboard.result.team[0].role, 'scriptwriter')
  probeValidation(settled)
})

test('六接口的状态顺序校验', () => {
  const idle = initial()
  expectError(call('apply_decision', { state: idle, decision: { type: 'configure_stage', stage: 'script', configuration: {} } }), 'INVALID_PHASE')
  expectError(call('calculate_result', { state: idle, scope: 'project' }), 'INVALID_PHASE')
  const producing = start()
  expectError(call('calculate_result', { state: producing, scope: 'project' }), 'INVALID_PHASE')
  expectError(call('start_project', { state: producing, offer_id: 'proj_ova_01', mode: 'contract', investment_percent: 0 }), 'INVALID_PHASE')
  expectError(call('apply_decision', { state: producing, decision: { type: 'return_to_market' } }), 'INVALID_PHASE')
})

// 五阶段各 1 工作量：截止前跑完全部阶段，交付原因必为 completed。
function completedReady(module = core) {
  const idle = initial(12345, module)
  for (const stage of stageOrder) idle.offers[0].workloads[stage] = 1
  let state = ok('start_project', { state: idle, offer_id: idle.offers[0].id, mode: 'contract', investment_percent: 0 }, module).state
  for (let index = 0; index < 6 && state.phase === 'producing'; index++) {
    if (state.project.stages[state.project.current_stage].status === 'ready') state = configure(state, 'balanced', module)
    state = advance(state, module).state
  }
  assert.equal(state.project.delivery_reason, 'completed')
  return state
}

// 两周工期小于实际所需周数：必然按 deadline 违约交付，用于覆盖负向变化。
function deadlineReady(module = core) {
  let state = configure(start(12345, module), 'balanced', module)
  state.project.deadline_week = 2
  state.project.offer.duration_weeks = 2
  for (let index = 0; index < 3 && state.phase === 'producing'; index++) {
    if (state.project.stages[state.project.current_stage].status === 'ready') state = configure(state, 'balanced', module)
    state = advance(state, module).state
  }
  assert.equal(state.project.delivery_reason, 'deadline')
  return state
}

test('声望初始 100、空闲周不衰减，交付结算按目标线分档记账', () => {
  let idle = initial()
  assert.equal(idle.company.reputation, 100)
  assert.deepEqual(idle.company.reputation_log, [])
  probeValidation(idle)
  for (let week = 1; week <= 8; week++) {
    idle = advance(idle).state
    assert.equal(idle.company.week, week)
    assert.equal(idle.company.reputation, 100)
    assert.deepEqual(idle.company.reputation_log, [])
  }

  const ready = completedReady()
  const settled = ok('calculate_result', { state: ready, scope: 'project' })
  const gain = settled.result.quality_score >= ready.project.offer.target_quality ? 10 : 3
  assert.equal(settled.state.company.reputation, 100 + gain)
  assert.deepEqual(settled.state.company.reputation_log, [{
    week: settled.state.company.week, delta: gain, reputation_after: 100 + gain,
    reason: gain === 10 ? 'project_settled_success' : 'project_settled_below_target',
  }])
  probeValidation(settled.state)
})

test('声望向下变化钳到零，只有实际生效的数值才写入账本', () => {
  const pending = deadlineReady()
  const penalty = ok('calculate_result', { state: pending, scope: 'project' }).state
  assert.equal(penalty.company.reputation, 95)
  assert.deepEqual(penalty.company.reputation_log, [{ week: penalty.company.week, delta: -5, reputation_after: 95, reason: 'project_settled_deadline' }])
  probeValidation(penalty)
  for (const before of [0, 3]) {
    const floored = structuredClone(pending)
    floored.company.reputation = before
    floored.company.reputation_log = []
    probeValidation(floored)
    const after = ok('calculate_result', { state: floored, scope: 'project' }).state
    assert.equal(after.company.reputation, 0)
    assert.equal(after.company.reputation_log.length, before === 0 ? 0 : 1)
    if (before !== 0) assert.equal(after.company.reputation_log[0].delta, -before)
    probeValidation(after)
  }
})

test('声望账本兼容旧存档缺席，并在两个独立 WASM 实例给出相同结果', async () => {
  const legacy = deadlineReady()
  delete legacy.company.reputation_log
  probeValidation(legacy)
  const regrown = ok('calculate_result', { state: legacy, scope: 'project' }).state
  assert.equal(regrown.company.reputation, 95)
  assert.equal(regrown.company.reputation_log.length, 1)
  probeValidation(regrown)

  const other = await createGameCore()
  assert.deepEqual(
    ok('calculate_result', { state: completedReady(), scope: 'project' }, other),
    ok('calculate_result', { state: completedReady(), scope: 'project' }, core),
  )
  assert.deepEqual(ok('initialize_game', { seed: 777 }, other).state.company, initial(777).company)
})

function resolveFirstAvailable(state) {
  const option = state.pending_event.options
    .filter((item) => item.disabled_reason === null)
    .sort((left, right) => left.cost - right.cost)[0]
  return ok('resolve_event', { state, option_id: option.id }).state
}

function reachStage(state, target) {
  for (let step = 0; step < 40; step++) {
    if (state.project.current_stage === target && state.project.stages[target].status === 'active') return state
    if (state.phase === 'event_pending') { state = resolveFirstAvailable(state); continue }
    const stage = state.project.current_stage
    if (state.phase === 'producing' && state.project.stages[stage].status === 'ready') state = configure(state)
    state = advanceRaw(state).state
  }
  throw new Error(`未能到达阶段 ${target}`)
}

test('事件：表现触发、选项代价、冷却与处理后可继续推进', () => {
  let state = reachStage(configure(start(12345)), 'key_animation')
  state.project.event_state.cooldowns = {}
  state.project.stages.key_animation.quality = 40
  const advanced = advanceRaw(state)
  assert.equal(advanced.state.phase, 'event_pending')
  const week = advanced.state.company.week
  const event = advanced.state.pending_event
  assert.equal(event.id, 'key_cut_rework')
  assert.equal(event.polarity, 'negative')
  assert.equal(event.tier, 'normal')
  assert.equal(event.stage, 'key_animation')
  assert.equal(event.trigger.metric, 'stage_quality')
  assert.deepEqual(event.options.map((option) => option.id), ['accept', 'rework'])
  assert.equal(event.options[1].cost, 180000)
  assert.ok(event.options[1].effects_preview.includes('本阶段质量 +4'))
  assert.equal(advanced.state.preview, null)

  const morale = advanced.state.company.staff.map((person) => person.morale)
  const resolved = ok('resolve_event', { state: advanced.state, option_id: 'accept' }).state
  assert.equal(resolved.phase, 'producing')
  assert.equal(resolved.pending_event, null)
  assert.equal(resolved.project.event_state.cooldowns.quality_rework, week + 6)
  assert.deepEqual(resolved.company.staff.map((person) => person.morale), morale.map((value) => Math.max(0, value - 3)))
  assert.ok(resolved.preview !== null)

  const next = advance(resolved)
  assert.equal(next.report.week, week + 1)
})

test('事件：现金不足拒绝付费选项，同种子同状态结果可复现', () => {
  const build = () => {
    let state = reachStage(configure(start(4242)), 'key_animation')
    state.project.event_state.cooldowns = {}
    state.project.stages.key_animation.quality = 40
    return advanceRaw(state).state
  }
  const first = build()
  const second = build()
  assert.deepEqual(first.pending_event, second.pending_event)
  assert.equal(first.pending_event.id, 'key_cut_rework')

  const poor = JSON.parse(JSON.stringify(first))
  poor.company.funds = 100000
  expectError(call('resolve_event', { state: poor, option_id: 'rework' }), 'MODE_NOT_ALLOWED')
})

test('事件：承制项目不能用延期，阶段效果挂起到阶段结束', () => {
  const base = reachStage(configure(start(888)), 'key_animation')
  base.project.event_state.pending = []
  const stage = 'key_animation'
  const crafted = {
    ...base,
    phase: 'event_pending',
    preview: null,
    pending_event: {
      id: 'schedule_slip', category: 'schedule', stage,
      title: '作画进度落后', description: '离交付只剩三周，作画进度明显落后于计划。',
      trigger: { metric: 'weeks_to_deadline', value: 2, threshold: 3 },
      tier: 'normal', polarity: 'negative', expires_week: null, escalation_note: null,
      options: [
        { id: 'accept', label: '维持原计划', cost: 0, allows_reconfigure: false, disabled_reason: null, effects_preview: [] },
        { id: 'delay', label: '向委员会申请延期', cost: 250000, allows_reconfigure: false, disabled_reason: null, effects_preview: [] },
      ],
    },
  }
  expectError(call('resolve_event', { state: crafted, option_id: 'delay' }), 'MODE_NOT_ALLOWED')
  const resolved = ok('resolve_event', { state: crafted, option_id: 'accept' }).state
  assert.equal(resolved.phase, 'producing')
  assert.deepEqual(resolved.project.event_state.pending, [
    { source_event: 'schedule_slip', scope: 'stage', target: 'quality', stage, value: -3, applied: false },
  ])
  probeValidation(resolved)
})

function pendingKeyCut(seed = 12345) {
  const state = reachStage(configure(start(seed)), 'key_animation')
  state.project.event_state.cooldowns = {}
  state.project.stages.key_animation.quality = 40
  return advanceRaw(state).state
}

test('M2-b：放弃本周处理会完整暂存，下次推进优先恢复且不结算', () => {
  const pending = pendingKeyCut()
  const week = pending.company.week
  const funds = pending.company.funds
  const deferred = ok('resolve_event', { state: pending, option_id: '__defer__' }).state
  assert.equal(deferred.phase, 'producing')
  assert.equal(deferred.pending_event, null)
  assert.equal(deferred.project.event_state.deferred_event.id, 'key_cut_rework')
  assert.equal(deferred.project.event_state.deferred_event.expires_week, week + 2)

  const workBefore = deferred.project.stages.key_animation.work_done
  const restoredResult = advanceRaw(deferred)
  const restored = restoredResult.state
  assert.equal(restored.phase, 'event_pending')
  assert.equal(restored.company.week, week + 1)
  assert.ok(restored.company.funds < funds, '恢复周仍要结算工资与运营，不能靠暂存跳过周成本')
  assert.ok(restoredResult.report.costs.salary > 0)
  assert.equal(restoredResult.report.costs.production, 0)
  assert.equal(restored.project.stages.key_animation.work_done, workBefore, '恢复周不推进制作')
  assert.equal(restored.pending_event.id, 'key_cut_rework')
  assert.equal(restored.project.event_state.deferred_event, null)
})

test('M2-b：到期后只升级一次，且升级先于本周结算', () => {
  const pending = pendingKeyCut()
  const week = pending.company.week
  const deferred = ok('resolve_event', { state: pending, option_id: '__defer__' }).state
  const restored = advanceRaw(deferred).state
  const deferredAgain = ok('resolve_event', { state: restored, option_id: '__defer__' }).state
  const fundsBefore = deferredAgain.company.funds
  const overdue = advanceRaw(deferredAgain)
  assert.equal(overdue.state.phase, 'producing')
  assert.equal(overdue.state.company.week, week + 2)
  assert.equal(overdue.state.project.event_state.deferred_event, null)
  assert.ok(overdue.state.company.funds < fundsBefore, '到期周应继续执行正常结算')
  assert.ok(overdue.report.messages.some((message) => message.includes('超时升级')))
  assert.ok(overdue.state.project.event_state.pending.some(
    (effect) => effect.source_event === 'key_cut_rework' && effect.value === -3 && effect.applied === false,
  ))
  // 升级后不再有待处理事件，也没有第二次升级入口
  assert.equal(overdue.state.pending_event, null)
  assert.equal(overdue.state.project.event_state.deferred_event, null)
})

test('M2-b：无期限事件放弃后仍会恢复；暂存期间可直接处理', () => {
  const base = reachStage(configure(start(888)), 'key_animation')
  base.project.event_state.pending = []
  base.project.event_state.deferred_event = null
  const stage = 'key_animation'
  const crafted = {
    ...base,
    phase: 'event_pending',
    preview: null,
    pending_event: {
      id: 'schedule_slip', category: 'schedule', stage,
      title: '作画进度落后', description: '离交付只剩三周，作画进度明显落后于计划。',
      trigger: { metric: 'weeks_to_deadline', value: 2, threshold: 3 },
      tier: 'normal', polarity: 'negative', expires_week: null, escalation_note: null,
      options: [
        { id: 'accept', label: '维持原计划', cost: 0, allows_reconfigure: false, disabled_reason: null, effects_preview: [] },
      ],
    },
  }
  const deferred = ok('resolve_event', { state: crafted, option_id: '__defer__' }).state
  assert.equal(deferred.project.event_state.deferred_event.expires_week, null)
  const week = deferred.company.week
  const restored = advanceRaw(deferred).state
  assert.equal(restored.phase, 'event_pending')
  assert.equal(restored.company.week, week + 1)

  // 暂存期间直接处理，不推进周数
  const pendingAgain = ok('resolve_event', { state: pendingKeyCut(), option_id: '__defer__' }).state
  const handled = ok('resolve_event', { state: pendingAgain, option_id: 'accept' }).state
  assert.equal(handled.phase, 'producing')
  assert.equal(handled.project.event_state.deferred_event, null)
  expectError(call('resolve_event', { state: handled, option_id: 'accept' }), 'INVALID_PHASE')
})

test('M2-b：pending_event 与 deferred_event 互斥', () => {
  const deferred = ok('resolve_event', { state: pendingKeyCut(), option_id: '__defer__' }).state
  const conflicting = JSON.parse(JSON.stringify(deferred))
  conflicting.phase = 'event_pending'
  conflicting.pending_event = conflicting.project.event_state.deferred_event
  probeValidation(conflicting, 'INVALID_INPUT')
})
