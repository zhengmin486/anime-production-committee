import { describe, expect, expectTypeOf, it } from 'vitest'
import { endedState, eventState, idleState, producingState, v3EndedState, v3EventState, v3IdleState, v3ProducingState, v3ReadyState, v3SettledState, v3WeekReport } from '../test/fixtures'
import {
  ABILITIES, CORE_METHODS, COST_CATEGORIES, STAGES, isCompanyResult, isCoreError, isCoreRequest, isCoreResponse,
  isDecision, isGameState, isOutsourceTask, isProjectOffer, isStageConfiguration, isStateResponse, isSupplier, isWeekReport, isWorkRecord,
} from './gameV3'
import type { CommitteeMember, CoreMethod, CoreRequests, CoreResponses, Decision, GameState, OutsourceTask, StageConfiguration, Staff } from './gameV3'

// 以 unknown 构造损坏的外部 JSON；不修改夹具本身，也不强转为被测模型。
function changed(source: unknown, path: string, value: unknown, remove = false): unknown {
  const copy = structuredClone(source) as Record<string, unknown>
  const keys = path.split('.')
  let target = copy
  for (const key of keys.slice(0, -1)) target = target[key] as Record<string, unknown>
  const key = keys[keys.length - 1]
  if (remove) delete target[key]
  else target[key] = value
  return copy
}

function paths(value: unknown, select: (value: unknown) => boolean, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return [...(!Array.isArray(value) && select(child) ? [path] : []), ...paths(child, select, path)]
  })
}

const configuration = (): StageConfiguration => structuredClone(v3ProducingState().project!.stages.script.configuration!)
function stageReadyState(): GameState {
  const state = v3ProducingState()
  state.project!.stages.script.status = 'ready'
  state.project!.stages.script.configuration = null
  state.project!.stages.script.recommended_configuration = null
  state.preview = null
  return state
}
function committeeState(): GameState {
  const state = v3ProducingState()
  state.project!.mode = 'committee'
  state.project!.investment_percent = 10
  state.project!.committee_pressure = 0
  state.project!.total_investment = state.project!.offer.contract_budget * 2
  state.project!.finance.investment_paid = 1_000_000
  state.company.finance.investment_paid = 1_000_000
  state.company.funds = 6_000_000
  return state
}
function closingState(source = v3IdleState()): GameState {
  const state = structuredClone(source)
  state.company.status = 'closing'
  state.company.end_reason = 'voluntary'
  state.offers = []
  state.preview = null
  return state
}
function candidate(employment: Staff['employment']): Staff {
  const person = structuredClone(v3IdleState().company.staff[0])
  person.id = `candidate_${employment}`
  person.employment = employment
  person.weekly_salary = employment === 'core' ? 50_000 : 0
  person.project_fee = employment === 'temporary' ? 30_000 : 0
  return person
}
function withCandidates(source = v3ProducingState()): GameState {
  const state = structuredClone(source)
  state.recruitment_pool = [candidate('core'), candidate('temporary')]
  return state
}
function task(): OutsourceTask {
  return { id: 'task_1', supplier_id: 'v3_supplier', stage: 'script', ability: 'drawing', work_total: 40, work_done: 10, mode: 'normal', fee_paid: 60_000, due_week: 2, status: 'active' }
}
function withTask(): GameState {
  const state = v3ProducingState()
  state.project!.outsourcing = [task()]
  return state
}
function endedWithHistory(): GameState {
  const state = v3SettledState('committee')
  state.phase = 'company_ended'
  state.company.status = 'ended'
  state.company.end_reason = 'voluntary'
  state.company_result = { reason: 'voluntary', weeks: 5, final_funds: 7_000_000, net_cash_change: 2_000_000, total_projects: 1, best_work_id: state.history[0].id, rating: 'stable' }
  return state
}

const fixtures: [string, () => GameState][] = [
  ['idle', v3IdleState], ['producing', v3ProducingState], ['event_pending', v3EventState], ['project_ready', v3ReadyState],
  ['project_settled', v3SettledState], ['company_ended', v3EndedState], ['committee', committeeState], ['history', endedWithHistory],
  ['candidates', withCandidates], ['outsourcing', withTask], ['stage ready', stageReadyState],
]

describe('M0 v3 完整结构', () => {
  it.each(fixtures)('接受 %s 静态样本及 JSON 往返', (_, factory) => {
    const state = factory()
    const saved = JSON.stringify(state)
    expect(isGameState(state)).toBe(true)
    expect(isGameState(JSON.parse(saved))).toBe(true)
    expect(JSON.stringify(state)).toBe(saved)
  })

  it('拒绝原始 v2、无版本结构、错误信封及不认识的 phase', () => {
    for (const input of [idleState(), producingState(), eventState(), endedState(), null, undefined, [], {}, { version: 3 }, { error: { code: 'INVALID_INPUT', message: '错误' } }]) {
      expect(isGameState(input)).toBe(false)
    }
    expect(isGameState({ ...v3IdleState(), phase: 'ended' })).toBe(false)
  })

  it.each(fixtures)('%s 的所有必需嵌套字段均不能丢弃', (_, factory) => {
    const state = factory()
    for (const path of paths(state, () => true)) {
      expect(isGameState(changed(state, path, undefined, true)), path).toBe(false)
    }
  })

  it.each(fixtures)('%s 的所有模型 number 拒绝浮点、无穷和不安全整数', (_, factory) => {
    const state = factory()
    for (const path of paths(state, (value) => typeof value === 'number')) {
      for (const invalid of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1, '1', null]) {
        expect(isGameState(changed(state, path, invalid)), `${path}: ${String(invalid)}`).toBe(false)
      }
    }
  })

  it('拒绝稀疏数组、非法布尔值和空 ID，不将缺项视为合法列表', () => {
    const state = withCandidates()
    const sparse = new Array(1)
    for (const path of ['company.staff', 'offers', 'recruitment_pool', 'suppliers', 'history', 'project.temporary_staff', 'project.outsourcing', 'project.stages.script.configuration.assignments']) {
      expect(isGameState(changed(state, path, sparse)), path).toBe(false)
    }
    for (const path of paths(state, (value) => typeof value === 'boolean')) {
      expect(isGameState(changed(state, path, 'false')), path).toBe(false)
    }
    for (const path of ['company.staff.0.id', 'recruitment_pool.0.id', 'suppliers.0.id', 'project.offer.id', 'project.stages.script.configuration.assignments.0.staff_id']) {
      expect(isGameState(changed(state, path, '  ')), path).toBe(false)
    }
    for (const path of ['company.status', 'company.staff.0.role', 'company.staff.0.talent_type', 'project.mode', 'project.offer.source', 'project.offer.scale', 'project.offer.risk', 'project.stages.script.status', 'project.stages.script.configuration.policy']) {
      expect(isGameState(changed(state, path, 'unknown')), path).toBe(false)
    }
  })

  it('种子 uint32、周数与安全整数边界不绑定默认样本值', () => {
    const state = v3IdleState()
    state.seed = 0
    state.company.funds = Number.MAX_SAFE_INTEGER
    state.company.initial_funds = Number.MAX_SAFE_INTEGER
    state.company.reputation = Number.MAX_SAFE_INTEGER
    state.company.staff[0].experience.planning = Number.MAX_SAFE_INTEGER
    state.offers[0].duration_weeks = Number.MAX_SAFE_INTEGER
    expect(isGameState(state)).toBe(true)
    state.seed = 0xffffffff
    state.company.week = 519
    state.preview!.next_week = 520
    expect(isGameState(state)).toBe(true)
    for (const [path, invalid] of [['seed', -1], ['seed', 0x100000000], ['company.week', -1], ['company.week', 521], ['offers.0.duration_weeks', 0]]) {
      expect(isGameState(changed(state, path as string, invalid))).toBe(false)
    }
    expect(v3ProducingState().project!.start_week).toBe(0)
    expect(isGameState(changed(v3ProducingState(), 'project.deadline_week', 0))).toBe(false)
    expect(isGameState(changed(v3ProducingState(), 'project.start_week', 1))).toBe(false)
  })

  it('所有六能力、潜力、经验、揭示标志、质量与状态量范围', () => {
    const state = v3ProducingState()
    for (const ability of ABILITIES) {
      for (const field of ['abilities', 'potential']) {
        for (const invalid of [-1, 101]) expect(isGameState(changed(state, `company.staff.0.${field}.${ability}`, invalid))).toBe(false)
      }
      expect(isGameState(changed(state, `company.staff.0.potential.${ability}`, state.company.staff[0].abilities[ability] - 1))).toBe(false)
      expect(isGameState(changed(state, `company.staff.0.experience.${ability}`, -1))).toBe(false)
      expect(isGameState(changed(state, `company.staff.0.revealed_potential.${ability}`, 1))).toBe(false)
    }
    for (const path of ['company.staff.0.fatigue', 'company.staff.0.morale', 'project.stages.script.quality', 'project.offer.target_quality', 'project.offer.audience_base', 'project.offer.commercial_potential', 'suppliers.0.quality', 'suppliers.0.reliability']) {
      for (const invalid of [-1, 101]) expect(isGameState(changed(state, path, invalid))).toBe(false)
    }
    for (const clues of [[], ['1', '2', '3'], ['']]) expect(isGameState(changed(state, 'company.staff.0.clues', clues))).toBe(false)
    expect(isGameState(changed(state, 'company.staff.0.departure_warning', 'false'))).toBe(false)
  })

  it('其余金额非负，profit/net_cash_change 为有符号安全整数', () => {
    const state = v3SettledState()
    for (const path of ['company.initial_funds', 'company.staff.0.weekly_salary', 'company.staff.0.project_fee', 'history.0.commercial_revenue', 'history.0.finance.contract_received', 'history.0.finance.investment_paid', 'history.0.finance.commercial_share_received', ...COST_CATEGORIES.map((category) => `history.0.finance.costs.${category}`)]) {
      expect(isGameState(changed(state, path, -1)), path).toBe(false)
    }
    expect(isGameState(changed(state, 'history.0.profit', Number.MIN_SAFE_INTEGER))).toBe(true)
    expect(isGameState(changed(v3EndedState(), 'company_result.net_cash_change', Number.MIN_SAFE_INTEGER))).toBe(true)
  })
})

describe('公司状态、phase 和关联 ID', () => {
  it('idle 严格四个差异化报价，其他阶段无报价', () => {
    const state = v3IdleState()
    expect(new Set(state.offers.map(({ source }) => source)).size).toBe(4)
    expect(new Set(state.offers.map(({ scale }) => scale)).size).toBe(4)
    for (const offers of [[], state.offers.slice(0, 3), [...state.offers, { ...state.offers[0], id: 'fifth' }]]) {
      expect(isGameState({ ...state, offers })).toBe(false)
    }
    expect(isGameState(changed(state, 'offers.1.id', state.offers[0].id))).toBe(false)
    expect(isGameState({ ...state, project: v3ProducingState().project })).toBe(false)
    expect(isGameState({ ...state, pending_event: v3EventState().pending_event })).toBe(false)
    expect(isGameState({ ...v3ProducingState(), offers: state.offers })).toBe(false)
  })

  it('closing 只能 idle/ready/settled，且不可推进；只有 bankrupt 可负资金', () => {
    for (const state of [closingState(), closingState(v3ReadyState()), closingState(v3SettledState())]) {
      expect(isGameState(state)).toBe(true)
      expect(isCoreRequest('advance_week', { state })).toBe(false)
      expect(isCoreRequest('apply_decision', { state, decision: { type: 'return_to_market' } })).toBe(false)
      state.company.funds = -1
      expect(isGameState(state)).toBe(false)
      state.company.end_reason = 'bankrupt'
      expect(isGameState(state)).toBe(true)
      state.company.end_reason = null
      expect(isGameState(state)).toBe(false)
    }
    for (const state of [closingState(v3ProducingState()), closingState(v3EventState())]) expect(isGameState(state)).toBe(false)
    expect(isGameState(changed(v3IdleState(), 'company.end_reason', 'voluntary'))).toBe(false)
    expect(isGameState(changed(v3IdleState(), 'company.funds', -1))).toBe(false)
    expect(isGameState({ ...closingState(), offers: v3IdleState().offers })).toBe(false)
  })

  it('520 周不可 running，time_limit 对齐终局周，summary 与公司和历史匹配', () => {
    const state = closingState()
    state.company.week = 520
    state.company.end_reason = 'time_limit'
    expect(isGameState(state)).toBe(true)
    expect(isGameState(changed(state, 'company.week', 519))).toBe(false)
    expect(isGameState(changed(v3IdleState(), 'company.week', 520))).toBe(false)
    const ended = endedWithHistory()
    for (const [path, invalid] of [
      ['company.status', 'running'], ['company.end_reason', null], ['phase', 'project_settled'], ['company_result', null],
      ['company_result.reason', 'bankrupt'], ['company_result.weeks', 4], ['company_result.final_funds', 6_000_000],
      ['company_result.total_projects', 2], ['company_result.best_work_id', 'missing'],
      ['last_project_id', 'missing'], ['pending_event', v3EventState().pending_event], ['project', v3ReadyState().project], ['offers', v3IdleState().offers],
    ]) expect(isGameState(changed(ended, path as string, invalid)), path as string).toBe(false)
    expect(isGameState({ ...ended, last_project_id: null })).toBe(true)
    expect(isGameState(changed(ended, 'company_result.best_work_id', null))).toBe(true)
    expect(isGameState({ ...v3IdleState(), company_result: v3EndedState().company_result })).toBe(false)
    expect(isGameState(changed(v3EndedState(), 'company_result.best_work_id', 'fictional'))).toBe(false)
    const bankrupt = v3EndedState()
    bankrupt.company.end_reason = 'bankrupt'
    bankrupt.company.funds = Number.MIN_SAFE_INTEGER
    bankrupt.company_result!.reason = 'bankrupt'
    bankrupt.company_result!.final_funds = Number.MIN_SAFE_INTEGER
    expect(isGameState(bankrupt)).toBe(true)
    bankrupt.company.end_reason = 'voluntary'
    bankrupt.company_result!.reason = 'voluntary'
    expect(isGameState(bankrupt)).toBe(false)
  })

  it('历史 unique IDs，前作必须已存在于更早历史，报价和当前项目不得重用历史 ID', () => {
    const state = v3SettledState()
    const first = state.history[0]
    const sequel = structuredClone(first)
    sequel.id = 'sequel'
    sequel.previous_work_id = first.id
    sequel.start_week = 5
    sequel.end_week = 10
    state.history.push(sequel)
    state.company.week = 10
    state.last_project_id = sequel.id
    expect(isGameState(state)).toBe(true)
    for (const [path, value] of [['history.1.id', first.id], ['history.0.previous_work_id', sequel.id], ['history.1.previous_work_id', 'missing'], ['history.1.previous_work_id', sequel.id], ['history.1.start_week', 4], ['history.1.end_week', 11], ['last_project_id', null]]) {
      expect(isGameState(changed(state, path as string, value)), path as string).toBe(false)
    }
    const market = v3IdleState()
    market.company.week = 5
    market.preview!.next_week = 6
    market.history = [first]
    expect(isGameState(market)).toBe(false)
    market.offers[0].id = 'new_offer'
    market.offers[0].previous_work_id = first.id
    expect(isGameState(market)).toBe(true)
    expect(isGameState(changed(market, 'offers.0.previous_work_id', 'missing'))).toBe(false)
    expect(isGameState({ ...market, last_project_id: first.id })).toBe(false)
    const production = v3ProducingState()
    production.history = [first]
    production.company.week = 5
    production.preview!.next_week = 6
    expect(isGameState(production)).toBe(false)
    production.project!.offer.id = 'new_project'
    production.project!.offer.previous_work_id = first.id
    expect(isGameState(production)).toBe(false)
    production.project!.start_week = 5
    production.project!.deadline_week = 10
    expect(isGameState(production)).toBe(true)
  })

  it('截止周结算后不能继续制作，deadline 交付不能早于截止周', () => {
    const state = v3ProducingState()
    state.company.week = 4
    state.preview!.next_week = 5
    expect(isGameState(state)).toBe(true)
    state.company.week = 5
    state.preview!.next_week = 6
    expect(isGameState(state)).toBe(false)
    expect(isGameState(changed(v3EventState(), 'company.week', 5))).toBe(false)
    state.phase = 'project_ready'
    state.preview = null
    state.project!.delivery_reason = 'deadline'
    expect(isGameState(state)).toBe(true)
    expect(isGameState(changed(state, 'company.week', 4))).toBe(false)
  })

  it('接下一个项目时不可携带上一次结算的展示 ID', () => {
    const state = v3ProducingState()
    state.history = v3SettledState().history
    state.company.week = 5
    state.preview!.next_week = 6
    state.project!.offer.id = 'next_project'
    state.project!.start_week = 5
    state.project!.deadline_week = 10
    expect(isGameState(state)).toBe(true)
    state.last_project_id = state.history[0].id
    expect(isGameState(state)).toBe(false)
  })

  it('event 仅存在于 event_pending，绑定当前 active 阶段', () => {
    const state = v3EventState()
    for (const [path, value] of [['pending_event', null], ['pending_event.stage', 'storyboard'], ['project', null], ['project.delivery_reason', 'deadline'], ['pending_event.options.1.id', 'v3_discuss']]) {
      expect(isGameState(changed(state, path as string, value))).toBe(false)
    }
    state.project!.stages.script.status = 'ready'
    state.project!.stages.script.configuration = null
    state.project!.stages.script.work_done = 0
    expect(isGameState(state)).toBe(false)
    expect(isGameState({ ...v3ReadyState(), pending_event: v3EventState().pending_event })).toBe(false)
    expect(isGameState({ ...v3ProducingState(), pending_event: v3EventState().pending_event })).toBe(false)
  })
})

describe('合作、阶段锁定、员工快照及供应商', () => {
  it('承制投资/分红/压力/延期结构为零，委员会投资 10..100 整数', () => {
    for (const [path, value] of [['investment_percent', 10], ['finance.investment_paid', 1], ['finance.commercial_share_received', 1], ['committee_pressure', 0], ['extension_count', 1]]) {
      expect(isGameState(changed(v3ProducingState(), `project.${path}`, value))).toBe(false)
    }
    const committee = committeeState()
    for (const percent of [10, 100]) expect(isGameState(changed(committee, 'project.investment_percent', percent))).toBe(true)
    for (const percent of [0, 9, 101, 10.5]) expect(isGameState(changed(committee, 'project.investment_percent', percent))).toBe(false)
    for (const pressure of [null, -1, 101, 0.5]) expect(isGameState(changed(committee, 'project.committee_pressure', pressure))).toBe(false)
    expect(isGameState(changed(committee, 'project.extension_count', 1))).toBe(true)
    expect(isGameState(changed(committee, 'project.extension_count', 2))).toBe(false)
    const original = v3IdleState().offers[3]
    expect(isGameState(changed(v3IdleState(), 'offers.3.allowed_modes', ['committee', 'contract']))).toBe(false)
    expect(isGameState(changed(v3ProducingState(), 'project.offer', original))).toBe(false)
    const work = v3SettledState().history[0]
    expect(isWorkRecord({ ...work, source: 'original' })).toBe(false)
    expect(isWorkRecord({ ...work, investment_percent: 1 })).toBe(false)
    expect(isGameState(changed(v3IdleState(), 'offers.0.allowed_modes', ['contract', 'contract']))).toBe(false)
  })

  it('首未完成阶段 ready/active，其前 completed，其后 pending；配置不可提前或越级', () => {
    const state = stageReadyState()
    expect(isGameState(state)).toBe(true) // 算法尚未给推荐配置也合法。
    state.project!.stages.script.recommended_configuration = configuration()
    expect(isGameState(state)).toBe(true)
    for (const [path, value] of [
      ['current_stage', 'storyboard'], ['current_stage', null], ['stages.script.status', 'pending'], ['stages.script.work_done', 1],
      ['stages.script.configuration', configuration()], ['stages.storyboard.status', 'ready'],
      ['stages.storyboard.configuration', configuration()], ['stages.storyboard.recommended_configuration', configuration()],
    ]) expect(isGameState(changed(state, `project.${path}`, value))).toBe(false)
    const active = v3ProducingState()
    expect(isGameState(changed(active, 'project.stages.script.configuration', null))).toBe(false)
    expect(isGameState(changed(active, 'project.stages.script.result', v3ReadyState().project!.stages.script.result))).toBe(false)
    expect(isGameState(changed(active, 'project.stages.script.work_done', 100))).toBe(false)
    const complete = v3ReadyState()
    expect(isGameState(changed(complete, 'project.stages.script.result', null))).toBe(false)
    expect(isGameState(changed(complete, 'project.stages.script.configuration', null))).toBe(false)
    expect(isGameState(changed(complete, 'project.stages.script.work_done', 99))).toBe(false)
    expect(isGameState(changed(complete, 'project.current_stage', 'script'))).toBe(false)
    expect(isGameState(changed(complete, 'project.delivery_reason', 'deadline'))).toBe(false)
    expect(isGameState(changed(complete, 'phase', 'producing'))).toBe(false)
    expect(isGameState(changed(complete, 'project.delivery_reason', null))).toBe(false)
  })

  it('五阶段均可成为首未完成阶段，前序只认完成快照，后续不能抢跑', () => {
    for (const [index, stage] of STAGES.entries()) {
      const state = stageReadyState()
      const project = state.project!
      const completed = v3ReadyState().project!
      state.company.week = index
      project.current_stage = stage
      for (const previous of STAGES.slice(0, index)) project.stages[previous] = completed.stages[previous]
      project.stages[stage].status = 'ready'
      expect(isGameState(state), `${stage} ready`).toBe(true)
      project.stages[stage].status = 'active'
      project.stages[stage].configuration = configuration()
      state.preview = { ...v3ProducingState().preview!, next_week: index + 1 }
      expect(isGameState(state), `${stage} active`).toBe(true)
      if (index > 0) expect(isGameState(changed(state, `project.stages.${STAGES[index - 1]}.status`, 'pending'))).toBe(false)
    }
  })

  it('强制交付保留未完成阶段，不捏造阶段结果', () => {
    const deadline = v3ProducingState()
    deadline.phase = 'project_ready'
    deadline.company.week = 5
    deadline.preview = null
    deadline.project!.delivery_reason = 'deadline'
    deadline.project!.stages.script.work_done = 35
    expect(isGameState(deadline)).toBe(true)
    expect(isGameState(changed(deadline, 'project.delivery_reason', 'completed'))).toBe(false)
    const closed = closingState(deadline)
    closed.project!.delivery_reason = 'company_closed'
    expect(isGameState(closed)).toBe(true)
    const record = v3SettledState().history[0]
    record.stages = structuredClone(deadline.project!.stages)
    record.end_reason = 'deadline'
    expect(isWorkRecord(record)).toBe(true)
    record.end_reason = 'completed'
    expect(isWorkRecord(record)).toBe(false)
  })

  it('名册人数/能力/ID 可变，核心和临时费用约束、跨池 ID 唯一', () => {
    const idle = v3IdleState()
    idle.company.staff = []
    expect(isGameState(idle)).toBe(true)
    const state = withCandidates()
    const temporary = candidate('temporary')
    temporary.id = 'temporary_joined'
    state.project!.temporary_staff = [temporary]
    state.project!.stages.script.configuration!.assignments.push({ staff_id: temporary.id, role: temporary.role, focus: 'planning' })
    expect(isGameState(state)).toBe(true)
    for (const [path, value] of [
      ['company.staff.1.id', 'v3_director'], ['recruitment_pool.0.id', 'v3_director'], ['project.temporary_staff.0.id', 'candidate_core'],
      ['company.staff.0.employment', 'temporary'], ['company.staff.0.project_fee', 1],
      ['project.temporary_staff.0.employment', 'core'], ['project.temporary_staff.0.weekly_salary', 1],
      ['recruitment_pool.1.weekly_salary', 1], ['project.stages.script.configuration.assignments.0.staff_id', 'missing'],
      ['project.stages.script.configuration.assignments.1.staff_id', 'v3_director'],
    ]) expect(isGameState(changed(state, path as string, value)), path as string).toBe(false)
    state.company.staff[0].name = '动态员工'
    state.company.staff[0].abilities.planning = 0
    state.company.staff[0].potential.planning = 0
    expect(isGameState(state)).toBe(true)
  })

  it('已完成阶段与历史按当时团队快照校验，离职临时员工不要求在当前名册', () => {
    const state = v3ReadyState()
    const completed = state.project!.stages.script
    completed.result!.team[0].staff_id = 'departed_temporary'
    completed.result!.team[0].employment = 'temporary'
    completed.configuration!.assignments[0].staff_id = 'departed_temporary'
    completed.recommended_configuration!.assignments[0].staff_id = 'departed_temporary'
    state.company.staff = []
    expect(isGameState(state)).toBe(true)
    const historical = v3SettledState()
    historical.company.staff = []
    expect(isGameState(historical)).toBe(true)
    const work = historical.history[0]
    work.team[0].staff_id = 'departed_temporary'
    work.team[0].employment = 'temporary'
    for (const stage of STAGES) {
      const snapshot = work.stages[stage]
      snapshot.configuration!.assignments[0].staff_id = 'departed_temporary'
      snapshot.recommended_configuration!.assignments[0].staff_id = 'departed_temporary'
      snapshot.result!.team[0].staff_id = 'departed_temporary'
      snapshot.result!.team[0].employment = 'temporary'
      snapshot.result!.team[0].abilities.planning = 1 // 历史阶段的能力也不是当前/最终能力。
    }
    expect(isGameState(historical)).toBe(true)
    expect(isGameState(changed(historical, 'history.0.team.0.staff_id', 'missing'))).toBe(false)
    expect(isGameState(changed(historical, 'history.0.stages.script.result.team.0.staff_id', 'missing'))).toBe(false)
    expect(isGameState(changed(historical, 'history.0.stages.script.configuration.assignments.0.staff_id', 'missing'))).toBe(false)
  })

  it('未采纳推荐中的员工不必进入已完成阶段和作品的实际团队', () => {
    const state = v3ReadyState()
    const completed = state.project!.stages.script
    completed.configuration!.assignments = completed.configuration!.assignments.slice(0, 1)
    completed.result!.team = completed.result!.team.slice(0, 1)
    expect(isGameState(state)).toBe(true)
    const historical = v3SettledState()
    const work = historical.history[0]
    work.team = work.team.slice(0, 1)
    for (const stage of STAGES) {
      work.stages[stage].configuration!.assignments = work.stages[stage].configuration!.assignments.slice(0, 1)
      work.stages[stage].result!.team = work.stages[stage].result!.team.slice(0, 1)
    }
    expect(isGameState(historical)).toBe(true)
    expect(isGameState(changed(historical, 'history.0.stages.script.work_done', 0))).toBe(false)
    expect(isGameState(changed(v3ProducingState(), 'project.stages.script.recommended_configuration.assignments.0.staff_id', 'missing'))).toBe(false)
  })

  it('供应商专业非空且唯一，容量速度正整数；外包任务供应商与阶段存在且交付量相等', () => {
    const supplier = v3IdleState().suppliers[0]
    for (const [path, value] of [['specialties', []], ['specialties', ['drawing', 'drawing']], ['capacity', 0], ['speed', 0], ['unit_price', -1], ['reliability', 101], ['unlocked', 1]]) {
      expect(isSupplier(changed(supplier, path as string, value))).toBe(false)
    }
    expect(isGameState(withTask())).toBe(true)
    expect(isGameState(changed(withTask(), 'project.outsourcing.0.supplier_id', 'missing'))).toBe(false)
    expect(isGameState(changed(withTask(), 'project.outsourcing.0.stage', 'missing'))).toBe(false)
    expect(isGameState(changed(withTask(), 'project.outsourcing', [task(), task()]))).toBe(false)
    expect(isGameState(changed(withTask(), 'suppliers', [supplier, supplier]))).toBe(false)
    for (const [path, value] of [['work_total', 0], ['work_done', 41], ['work_done', -1], ['status', 'delivered']]) expect(isOutsourceTask(changed(task(), path as string, value))).toBe(false)
    expect(isOutsourceTask({ ...task(), status: 'delivered', work_done: 40 })).toBe(true)
    expect(isOutsourceTask({ ...task(), status: 'failed', work_done: 10 })).toBe(true)
  })

  it('preview 只在可推进的 running idle/active 存在，next_week 精确加一', () => {
    for (const source of [v3IdleState(), v3ProducingState()]) {
      expect(isGameState({ ...source, preview: null })).toBe(false)
      expect(isGameState(changed(source, 'preview.next_week', 2))).toBe(false)
      expect(isGameState(changed(source, 'preview.event_probability_per_mille', 1001))).toBe(false)
      expect(isGameState(changed(source, 'preview.total_cost', -1))).toBe(false)
    }
    for (const source of [stageReadyState(), v3EventState(), v3ReadyState(), v3SettledState(), v3EndedState(), closingState()]) {
      expect(isGameState({ ...source, preview: v3IdleState().preview })).toBe(false)
    }
  })
})

const decisions: Decision[] = [
  { type: 'configure_stage', stage: 'script', configuration: configuration() },
  { type: 'hire_temporary', candidate_id: 'candidate_temporary' }, { type: 'hire_core', candidate_id: 'candidate_core' },
  { type: 'outsource', supplier_id: 'v3_supplier', stage: 'script', ability: 'drawing', workload: 20, mode: 'normal' },
  { type: 'request_extension' }, { type: 'raise_salary', staff_id: 'v3_director', weekly_salary: 70_000 },
  { type: 'return_to_market' }, { type: 'end_company' },
  { type: 'scout' }, { type: 'targeted_scout', role: 'director' },
]
const requests: { [M in CoreMethod]: CoreRequests[M] } = {
  initialize_game: { seed: 0xffffffff },
  start_project: { state: v3IdleState(), offer_id: 'v3_ova', mode: 'contract', investment_percent: 0 },
  apply_decision: { state: stageReadyState(), decision: decisions[0] },
  advance_week: { state: v3ProducingState() },
  resolve_event: { state: v3EventState(), option_id: 'v3_discuss', configuration: configuration() },
  calculate_result: { state: v3ReadyState(), scope: 'project' },
}
const responses: { [M in CoreMethod]: CoreResponses[M] } = {
  initialize_game: { state: v3IdleState(), message: '已初始化' },
  start_project: { state: stageReadyState(), message: '已接约' },
  apply_decision: { state: v3ProducingState(), message: '已应用' },
  advance_week: { state: v3EventState(), report: v3WeekReport() },
  resolve_event: { state: { ...v3EventState(), phase: 'producing', pending_event: null, preview: { ...v3ProducingState().preview!, next_week: 2 } }, message: '事件已处理' },
  calculate_result: { state: v3SettledState(), scope: 'project', result: v3SettledState().history[0] },
}

describe('所有 action 与核心接口请求/响应', () => {
  it.each(decisions)('决策 $type 完整结构、必需字段与数值校验', (decision) => {
    expect(isDecision(decision)).toBe(true)
    for (const path of paths(decision, () => true)) expect(isDecision(changed(decision, path, undefined, true)), path).toBe(false)
    for (const path of paths(decision, (value) => typeof value === 'number')) {
      for (const invalid of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) expect(isDecision(changed(decision, path, invalid))).toBe(false)
    }
  })

  it('拒绝未知和 v2 action，配置 ID 不得重复', () => {
    for (const decision of [{ type: 'assign', staff_id: 'v3_director', assignment: 'pre' }, { type: 'policy', policy: 'normal' }, { type: 'outsource', stage: 'script', enabled: true }, { type: 'configure_stage', stage: 'pre', configuration: configuration() }, null, {}]) {
      expect(isDecision(decision)).toBe(false)
    }
    expect(isStageConfiguration(changed(configuration(), 'assignments.1.staff_id', 'v3_director'))).toBe(false)
    expect(isDecision({ ...decisions[3], mode: 'emergency' })).toBe(true)
    expect(isDecision({ ...decisions[3], workload: 0 })).toBe(false)
  })

  it.each(CORE_METHODS)('%s 请求响应均可判别且必需外层字段不可缺失', (method) => {
    expect(isCoreRequest(method, requests[method])).toBe(true)
    expect(isCoreResponse(method, responses[method])).toBe(true)
    for (const key of Object.keys(requests[method]).filter((key) => key !== 'configuration')) {
      expect(isCoreRequest(method, changed(requests[method], key, undefined, true)), key).toBe(false)
    }
    for (const key of Object.keys(responses[method])) {
      expect(isCoreResponse(method, changed(responses[method], key, undefined, true)), key).toBe(false)
    }
    expect(isCoreRequest(method, {})).toBe(false)
    expect(isCoreResponse(method, { state: idleState(), message: '旧版', report: v3WeekReport() })).toBe(false)
    expect(isCoreResponse(method, v3IdleState())).toBe(false)
  })

  it('类型谓词按 method 缩窄，不把联合响应误当状态', () => {
    const request: unknown = requests.start_project
    if (isCoreRequest('start_project', request)) expectTypeOf(request).toEqualTypeOf<CoreRequests['start_project']>()
    const response: unknown = responses.advance_week
    if (isCoreResponse('advance_week', response)) expectTypeOf(response).toEqualTypeOf<CoreResponses['advance_week']>()
    expect(isCoreRequest('advance_day', requests.advance_week)).toBe(false)
    expect(isCoreResponse('advance_day', responses.advance_week)).toBe(false)
  })

  it('接约模式、投资范围、报价 ID 与公司阶段约束', () => {
    const request = requests.start_project
    for (const invalid of [-1, 1, 10, 0.5]) expect(isCoreRequest('start_project', { ...request, investment_percent: invalid })).toBe(false)
    for (const percent of [10, 100]) expect(isCoreRequest('start_project', { ...request, mode: 'committee', investment_percent: percent })).toBe(true)
    for (const percent of [0, 9, 101, 10.5]) expect(isCoreRequest('start_project', { ...request, mode: 'committee', investment_percent: percent })).toBe(false)
    expect(isCoreRequest('start_project', { ...request, offer_id: 'missing' })).toBe(false)
    expect(isCoreRequest('start_project', { ...request, offer_id: 'v3_movie' })).toBe(false)
    expect(isCoreRequest('start_project', { ...request, offer_id: 'v3_movie', mode: 'committee', investment_percent: 10 })).toBe(true)
    expect(isCoreRequest('start_project', { ...request, state: closingState() })).toBe(false)
    expect(isCoreRequest('start_project', { ...request, state: v3ProducingState() })).toBe(false)
    expect(isCoreResponse('start_project', responses.initialize_game)).toBe(false)
    expect(isCoreResponse('start_project', { state: v3ProducingState(), message: '不能跳过配置' })).toBe(false)
    expect(isCoreResponse('apply_decision', { state: v3EndedState(), message: '不能跳过经营总结' })).toBe(false)
    const laterIdle = v3IdleState()
    laterIdle.company.week = 1
    laterIdle.preview!.next_week = 2
    expect(isCoreResponse('initialize_game', { state: laterIdle, message: '不是初始周' })).toBe(false)
    for (const seed of [-1, 0x100000000, NaN, Infinity, 0.5]) expect(isCoreRequest('initialize_game', { seed })).toBe(false)
  })

  it('逐项校验 action 的当前引用与锁定阶段，而非成本或人数算法', () => {
    const states = [stageReadyState(), withCandidates(stageReadyState()), withCandidates(v3IdleState()), stageReadyState(), committeeState(), v3IdleState(), v3SettledState(), v3IdleState(), v3IdleState(), v3IdleState()]
    for (const [index, decision] of decisions.entries()) expect(isCoreRequest('apply_decision', { state: states[index], decision }), decision.type).toBe(true)
    expect(isCoreRequest('apply_decision', { state: v3ProducingState(), decision: decisions[0] })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: stageReadyState(), decision: { ...decisions[0], stage: 'storyboard' } })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: stageReadyState(), decision: changed(decisions[0], 'configuration.assignments.0.staff_id', 'missing') })).toBe(false)
    for (const decision of [{ ...decisions[1], candidate_id: 'missing' }, { ...decisions[1], candidate_id: 'candidate_core' }, { ...decisions[2], candidate_id: 'candidate_temporary' }, { ...decisions[3], supplier_id: 'missing' }, { ...decisions[3], stage: 'storyboard' }, { ...decisions[5], staff_id: 'missing' }]) {
      const state = decision.type === 'hire_core' || decision.type === 'raise_salary' ? withCandidates(v3IdleState()) : withCandidates(stageReadyState())
      expect(isCoreRequest('apply_decision', { state, decision })).toBe(false)
    }
    expect(isCoreRequest('apply_decision', { state: v3ProducingState(), decision: decisions[4] })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: changed(committeeState(), 'project.extension_count', 1), decision: decisions[4] })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: v3IdleState(), decision: decisions[6] })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: v3EndedState(), decision: decisions[7] })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: changed(stageReadyState(), 'suppliers.0.unlocked', false), decision: decisions[3] })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: stageReadyState(), decision: { ...decisions[3], ability: 'animation' } })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: withCandidates(v3SettledState()), decision: decisions[2] })).toBe(true)
    expect(isCoreRequest('apply_decision', { state: v3SettledState(), decision: decisions[5] })).toBe(true)
    for (const decision of [decisions[1], decisions[2], decisions[3], decisions[5]]) {
      expect(isCoreRequest('apply_decision', { state: withCandidates(), decision })).toBe(false)
    }
    expect(isCoreRequest('apply_decision', { state: v3IdleState(), decision: { ...decisions[5], weekly_salary: 60_000 } })).toBe(false)
    const deadline = committeeState()
    deadline.company.week = 5
    deadline.preview!.next_week = 6
    expect(isCoreRequest('apply_decision', { state: deadline, decision: decisions[4] })).toBe(false)
    // 结构守卫不重算工资效果、供应商承载量或预算。
    expect(isCoreRequest('apply_decision', { state: v3IdleState(), decision: { ...decisions[5], weekly_salary: Number.MAX_SAFE_INTEGER } })).toBe(true)
    expect(isCoreRequest('apply_decision', { state: stageReadyState(), decision: { ...decisions[3], workload: Number.MAX_SAFE_INTEGER } })).toBe(true)
  })

  it('推进只接受可推进阶段，事件选项和可选重配显式校验', () => {
    expect(isCoreRequest('advance_week', { state: v3IdleState() })).toBe(true)
    for (const state of [stageReadyState(), v3EventState(), v3ReadyState(), v3SettledState(), v3EndedState(), closingState()]) {
      expect(isCoreRequest('advance_week', { state })).toBe(false)
    }
    const request = requests.resolve_event
    expect(isCoreRequest('resolve_event', { state: request.state, option_id: 'v3_discuss' })).toBe(false)
    expect(isCoreRequest('resolve_event', { state: request.state, option_id: 'v3_keep' })).toBe(true)
    for (const option_id of ['missing', 'v3_keep', 'v3_consult']) expect(isCoreRequest('resolve_event', { ...request, option_id })).toBe(false)
    expect(isCoreRequest('resolve_event', { ...request, configuration: undefined })).toBe(false)
    expect(isCoreRequest('resolve_event', { ...request, configuration: changed(configuration(), 'assignments.0.staff_id', 'missing') })).toBe(false)
    expect(isCoreRequest('resolve_event', { ...request, state: v3ProducingState() })).toBe(false)
    expect(isCoreResponse('resolve_event', { state: v3EventState(), message: '未处理' })).toBe(false)
    expect(isCoreResponse('advance_week', { state: v3EventState(), report: { ...v3WeekReport(), week: 2 } })).toBe(false)
  })

  it('project/company 结算分支不可重复结算，结果必须完整匹配返回快照', () => {
    expect(isCoreRequest('calculate_result', { state: v3SettledState(), scope: 'project' })).toBe(false)
    expect(isCoreRequest('calculate_result', { state: closingState(), scope: 'company' })).toBe(true)
    expect(isCoreRequest('calculate_result', { state: closingState(v3SettledState()), scope: 'company' })).toBe(true)
    expect(isCoreRequest('calculate_result', { state: closingState(v3ReadyState()), scope: 'project' })).toBe(true)
    expect(isCoreRequest('calculate_result', { state: v3EndedState(), scope: 'company' })).toBe(false)
    for (const request of [{ state: v3ProducingState(), scope: 'project' }, { state: v3IdleState(), scope: 'company' }, { state: closingState(v3ReadyState()), scope: 'company' }, { state: v3ReadyState(), scope: 'wrong' }]) expect(isCoreRequest('calculate_result', request)).toBe(false)
    const state = endedWithHistory()
    const response = { state, scope: 'company', result: structuredClone(state.company_result) }
    expect(isCoreResponse('calculate_result', response)).toBe(true)
    expect(isCoreResponse('calculate_result', changed(response, 'result.net_cash_change', 1))).toBe(false)
    expect(isCoreResponse('calculate_result', { ...response, scope: 'project' })).toBe(false)
    expect(isCoreResponse('calculate_result', changed(responses.calculate_result, 'result.finance.costs.salary', 1))).toBe(false)
    expect(isCoreResponse('calculate_result', changed(responses.calculate_result, 'result.profit', 1))).toBe(false)
    expect(isCoreResponse('calculate_result', changed(responses.calculate_result, 'result.stages.script.result.weeks_spent', 2))).toBe(false)
    const work = v3SettledState().history[0]
    const { id, ...rest } = work
    expect(isCoreResponse('calculate_result', { ...responses.calculate_result, result: { ...rest, id } })).toBe(true)
  })

  it('所有结构错误码单独判别，错误信封绝不作为成功状态', () => {
    for (const code of ['INVALID_INPUT', 'INVALID_PHASE', 'INSUFFICIENT_BUDGET', 'STAGE_LOCKED', 'MODE_NOT_ALLOWED', 'CAPACITY_EXCEEDED', 'COMPANY_ENDED', 'INTERNAL_ERROR']) {
      const error = { error: { code, message: '契约错误样本' } }
      expect(isCoreError(error)).toBe(true)
      expect(isGameState(error)).toBe(false)
      expect(isStateResponse(error)).toBe(false)
      for (const method of CORE_METHODS) {
        expect(isCoreResponse(method, error)).toBe(false)
        expect(isCoreRequest(method, error)).toBe(false)
        expect(isCoreResponse(method, { ...responses[method], ...error })).toBe(false)
      }
      expect(isGameState({ ...v3IdleState(), ...error })).toBe(false)
      expect(isCoreError({ ...error, state: v3IdleState() })).toBe(false)
    }
    for (const error of [{ error: { code: 'UNKNOWN', message: '错误' } }, { error: { code: 'INVALID_INPUT' } }, { error: { code: 'INVALID_INPUT', message: '' } }, {}]) expect(isCoreError(error)).toBe(false)
  })
})

describe('周回执与手算现金账（不在生产 validator 复制规则）', () => {
  it('推进样例的回执与前后状态快照逐项对应', () => {
    const before = v3ProducingState()
    const after = v3EventState()
    const report = v3WeekReport()
    expect(report.week).toBe(after.company.week)
    expect(report.funds_delta).toBe(after.company.funds - before.company.funds)
    for (const category of COST_CATEGORIES) {
      expect(report.costs[category]).toBe(after.company.finance.costs[category] - before.company.finance.costs[category])
    }
    for (const change of report.stage_deltas) {
      const previous = before.project!.stages[change.stage]
      const current = after.project!.stages[change.stage]
      expect(change.work_done_delta).toBe(current.work_done - previous.work_done)
      expect(change.quality_delta).toBe(current.quality - previous.quality)
    }
    for (const change of report.staff_deltas) {
      const previous = before.company.staff.find(({ id }) => id === change.staff_id)!
      const current = after.company.staff.find(({ id }) => id === change.staff_id)!
      expect(change.fatigue_delta).toBe(current.fatigue - previous.fatigue)
      expect(change.morale_delta).toBe(current.morale - previous.morale)
      for (const ability of ABILITIES) expect(change.experience[ability]).toBe(current.experience[ability] - previous.experience[ability])
    }
  })

  it('周回执全字段保留，signed 增量和空回执合法，非法数字和重复 ID 拒绝', () => {
    const report = v3WeekReport()
    expect(isWeekReport(report)).toBe(true)
    expect(isWeekReport({ ...report, funds_delta: Number.MIN_SAFE_INTEGER, staff_deltas: [], stage_deltas: [], messages: [] })).toBe(true)
    for (const path of paths(report, () => true)) expect(isWeekReport(changed(report, path, undefined, true)), path).toBe(false)
    for (const path of paths(report, (value) => typeof value === 'number')) {
      for (const invalid of [NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) expect(isWeekReport(changed(report, path, invalid)), path).toBe(false)
    }
    for (const path of ['stage_deltas.0.quality_delta', 'staff_deltas.0.fatigue_delta', 'staff_deltas.0.morale_delta']) {
      for (const boundary of [-100, 100]) expect(isWeekReport(changed(report, path, boundary))).toBe(true)
      for (const invalid of [-101, 101]) expect(isWeekReport(changed(report, path, invalid))).toBe(false)
    }
    expect(isWeekReport({ ...report, stage_deltas: [report.stage_deltas[0], report.stage_deltas[0]] })).toBe(false)
    expect(isWeekReport(changed(report, 'staff_deltas.1.staff_id', 'v3_director'))).toBe(false)
    expect(isWeekReport(changed(report, 'staff_deltas.0.experience.planning', -1))).toBe(false)
    expect(isWeekReport(changed(report, 'stage_deltas.0.work_done_delta', -1))).toBe(true)
  })

  it.each(['contract', 'committee'] as const)('%s 五周静态账本的现金、利润及快照手算一致', (mode) => {
    const initial = 5_000_000
    const totalInvestment = 10_000_000
    const contract = 2_000_000
    const perWeek = 100_000 + 20_000 + 80_000
    const totalCosts = perWeek * 5
    const investment = mode === 'committee' ? totalInvestment * 10 / 100 : 0
    const share = mode === 'committee' ? 20_000_000 * 10 / 100 : 0
    const beforeSettlement = initial - investment + contract - totalCosts
    const finalCash = beforeSettlement + share // 结算时不再次扣本金。
    const state = v3SettledState(mode)
    const work = state.history[0]
    expect(totalCosts).toBe(1_000_000)
    expect(beforeSettlement).toBe(mode === 'contract' ? 6_000_000 : 5_000_000)
    expect(finalCash).toBe(mode === 'contract' ? 6_000_000 : 7_000_000)
    expect(state.company.funds).toBe(finalCash)
    expect(work.profit).toBe(finalCash - initial)
    expect(work.finance.contract_received).toBe(contract)
    expect(work.finance.investment_paid).toBe(investment)
    expect(work.finance.commercial_share_received).toBe(share)
    expect(Object.values(work.finance.costs).reduce((sum, cost) => sum + cost, 0)).toBe(totalCosts)
    expect(state.company.finance).toEqual(work.finance)
    expect(work.end_week - work.start_week).toBe(5)
    for (const stage of STAGES) {
      const snapshot = work.stages[stage]
      expect(snapshot.status).toBe('completed')
      expect(snapshot.result!.weeks_spent).toBe(1)
      expect(Object.values(snapshot.result!.costs).reduce((sum, cost) => sum + cost, 0)).toBe(perWeek)
      expect(snapshot.result!.team).toEqual(work.team)
      expect(snapshot.configuration).not.toBeNull()
    }
    const persisted = JSON.parse(JSON.stringify(state))
    expect(isGameState(persisted)).toBe(true)
    expect(persisted.history[0]).toEqual(work)
  })

  it('校验不推导本金、20% 合同、利润、质量、预估费用或评级', () => {
    expect(isGameState(changed(committeeState(), 'project.finance.investment_paid', 42))).toBe(true)
    expect(isGameState(changed(v3ProducingState(), 'project.offer.contract_budget', 123))).toBe(true)
    expect(isGameState(changed(v3SettledState(), 'history.0.profit', 42))).toBe(true)
    expect(isGameState(changed(v3SettledState(), 'history.0.quality_score', 1))).toBe(true)
    expect(isGameState(changed(v3IdleState(), 'preview.total_cost', 1))).toBe(true)
    expect(isCompanyResult({ ...v3EndedState().company_result, rating: 'renowned', net_cash_change: -42 })).toBe(true)
  })
})

describe('M2 契约扩展：origin/style/min_reputation/scout（可选字段与缺省语义）', () => {
  function extendedIdle(): GameState {
    const state = v3IdleState()
    state.company.scout_pity = { since_sr: 3, since_ssr: 12 }
    state.offers[0].origin = 'incoming'
    state.offers[0].min_reputation = 0
    state.offers[1].origin = 'market'
    state.offers[1].style = 'normal'
    state.offers[2].min_reputation = 0
    Object.assign(state.offers[3], { origin: 'custom', style: 'meme', source: 'original', scale: 'short', allowed_modes: ['committee'] })
    return state
  }

  it('扩展样本合法；缺省可选字段仍合法，兼容 M1 核心输出与既有 v3 存档', () => {
    const state = extendedIdle()
    expect(isGameState(state)).toBe(true)
    expect(isGameState(JSON.parse(JSON.stringify(state)))).toBe(true)
    expect(isGameState(v3IdleState())).toBe(true)
    expect(isGameState(changed(state, 'company.scout_pity', undefined, true))).toBe(true)
    expect(isGameState(changed(state, 'offers.0.origin', undefined, true))).toBe(true)
    expect(isGameState(changed(state, 'offers.0.min_reputation', undefined, true))).toBe(true)
    expect(isGameState(changed(state, 'offers.3.style', undefined, true))).toBe(true)
    expect(isGameState(changed(state, 'offers.3.origin', undefined, true))).toBe(false)
  })

  it('origin/style 枚举与交叉约束：非 normal 必须 custom，meme 限定短篇', () => {
    const state = extendedIdle()
    expect(isGameState(changed(state, 'offers.0.origin', 'wrong'))).toBe(false)
    expect(isGameState(changed(state, 'offers.3.style', 'wrong'))).toBe(false)
    expect(isGameState(changed(state, 'offers.3.style', 'ai'))).toBe(true)
    expect(isGameState(changed(state, 'offers.3.scale', 'tv'))).toBe(false)
    expect(isGameState(changed(state, 'offers.1.style', 'meme'))).toBe(false)
    expect(isGameState(changed(state, 'offers.2.style', 'ai'))).toBe(false)
    expect(isGameState(changed(state, 'offers.0.origin', 'proposal'))).toBe(true)
    expect(isGameState(changed(state, 'offers.0.style', 'meme'))).toBe(false)
    for (const value of [-1, 0.5, NaN, '0']) expect(isGameState(changed(state, 'offers.0.min_reputation', value))).toBe(false)
  })

  it('idle 市场允许锁定项，但至少 2 个报价可立即承接', () => {
    const state = v3IdleState()
    state.offers[0].min_reputation = 0
    state.offers[1].min_reputation = 0
    state.offers[2].min_reputation = 10
    state.offers[3].min_reputation = 20
    expect(isGameState(state)).toBe(true)
    state.offers[1].min_reputation = 5
    expect(isGameState(state)).toBe(false)
    state.company.reputation = 20
    expect(isGameState(state)).toBe(true)
  })

  it('scout_pity 为非负整数计数，结构非法拒绝', () => {
    const state = v3IdleState()
    state.company.scout_pity = { since_sr: 0, since_ssr: 0 }
    expect(isGameState(state)).toBe(true)
    expect(isGameState(changed(state, 'company.scout_pity.since_sr', -1))).toBe(false)
    expect(isGameState(changed(state, 'company.scout_pity.since_ssr', 0.5))).toBe(false)
    expect(isGameState(changed(state, 'company.scout_pity.since_ssr', undefined, true))).toBe(false)
    expect(isGameState(changed(state, 'company.scout_pity', 3))).toBe(false)
  })

  it('scout/targeted_scout 仅经营窗口可用，定向参数二选一', () => {
    const scout: Decision = { type: 'scout' }
    const targeted: Decision = { type: 'targeted_scout', focus_ability: 'drawing' }
    for (const state of [v3IdleState(), v3SettledState()]) {
      expect(isCoreRequest('apply_decision', { state, decision: scout })).toBe(true)
      expect(isCoreRequest('apply_decision', { state, decision: targeted })).toBe(true)
    }
    for (const state of [v3ProducingState(), stageReadyState(), v3EventState(), v3ReadyState(), v3EndedState(), closingState()]) {
      expect(isCoreRequest('apply_decision', { state, decision: scout })).toBe(false)
    }
    expect(isDecision({ type: 'targeted_scout', role: 'director', focus_ability: 'drawing' })).toBe(false)
    expect(isDecision({ type: 'targeted_scout' })).toBe(false)
    expect(isDecision({ type: 'targeted_scout', role: 'wrong' })).toBe(false)
    expect(isDecision({ type: 'targeted_scout', focus_ability: 'wrong' })).toBe(false)
    expect(isDecision({ type: 'targeted_scout', role: 'animator' })).toBe(true)
  })

  it('在制与结算快照携带扩展字段仍通过整体校验', () => {
    const producing = v3ProducingState()
    producing.project!.offer.origin = 'incoming'
    producing.project!.offer.min_reputation = 0
    producing.company.scout_pity = { since_sr: 1, since_ssr: 4 }
    expect(isGameState(producing)).toBe(true)
    const settled = v3SettledState()
    settled.history[0].origin = 'market'
    settled.history[0].style = 'normal'
    settled.company.scout_pity = { since_sr: 0, since_ssr: 0 }
    expect(isGameState(settled)).toBe(true)
  })

  it('WorkRecord 携带 origin/style 并执行同一交叉约束', () => {
    const work = v3SettledState('committee').history[0]
    expect(isWorkRecord({ ...work, origin: 'custom', style: 'meme', source: 'original', scale: 'short' })).toBe(true)
    expect(isWorkRecord({ ...work, origin: 'custom', style: 'meme', source: 'original', scale: 'tv' })).toBe(false)
    expect(isWorkRecord({ ...work, style: 'ai' })).toBe(false)
    expect(isWorkRecord({ ...work, origin: 'custom', style: 'ai', source: 'original' })).toBe(true)
    expect(isWorkRecord(changed(work, 'style', 'wrong'))).toBe(false)
    expect(isWorkRecord(changed(work, 'origin', 'wrong'))).toBe(false)
  })
})

describe('M2 契约扩展第二批：企划槽位、委员会渠道、成本类别与成绩解锁（K1–K4 按新口径）', () => {
  function slotOffer(id: string, origin: 'custom' | 'proposal'): GameState['offers'][number] {
    const offer = structuredClone(v3IdleState().offers[3])
    return { ...offer, id, origin }
  }
  function slottedState(): GameState {
    const state = v3IdleState()
    state.custom_offer = slotOffer('v3_custom', 'custom')
    state.pending_proposal = slotOffer('v3_proposal', 'proposal')
    return state
  }
  const member = (id: string, channel: CommitteeMember['channel']) => ({ id, name: `成员${id}`, channel })
  const baseOffer = () => structuredClone(v3IdleState().offers[2])

  it('自定与提案槽独立于市场四企划；缺省可选字段保持兼容', () => {
    const state = slottedState()
    expect(isGameState(state)).toBe(true)
    expect(isGameState(JSON.parse(JSON.stringify(state)))).toBe(true)
    expect(isGameState(v3IdleState())).toBe(true)
    expect(isGameState(changed(state, 'custom_offer', undefined, true))).toBe(true)
    expect(isGameState(changed(state, 'custom_offer', null))).toBe(true)
    expect(isGameState(changed(state, 'pending_proposal', undefined, true))).toBe(true)
  })

  it('槽位报价的来源、岗位与 ID 交叉；已开工企划不得残留槽位', () => {
    const state = slottedState()
    expect(isGameState(changed(state, 'custom_offer.origin', 'market'))).toBe(false)
    expect(isGameState(changed(state, 'pending_proposal.origin', 'custom'))).toBe(false)
    expect(isGameState(changed(state, 'pending_proposal.source', 'manga'))).toBe(false)
    expect(isGameState(changed(state, 'custom_offer.id', 'v3_ova'))).toBe(false)
    expect(isGameState(changed(state, 'pending_proposal.id', 'v3_custom'))).toBe(false)
    const settled = v3SettledState()
    settled.custom_offer = slotOffer(settled.history[0].id, 'custom')
    expect(isGameState(settled)).toBe(false)
  })

  it('提案仅在空闲周展示；公司非 running 时槽位必须清空', () => {
    const producing = v3ProducingState()
    producing.pending_proposal = slotOffer('v3_proposal', 'proposal')
    expect(isGameState(producing)).toBe(false)
    const closing = closingState()
    closing.custom_offer = slotOffer('v3_custom', 'custom')
    expect(isGameState(closing)).toBe(false)
    const ended = v3EndedState()
    ended.pending_proposal = slotOffer('v3_proposal', 'proposal')
    expect(isGameState(ended)).toBe(false)
    const producingCustom = v3ProducingState()
    producingCustom.custom_offer = slotOffer('v3_custom', 'custom')
    expect(isGameState(producingCustom)).toBe(true)
  })

  it('create_custom_offer 结构校验参数，且只在空闲市场窗口可用', () => {
    const draft: Decision = { type: 'create_custom_offer', name: '想做的企划', source: 'original', scale: 'short', style: 'meme' }
    expect(isDecision(draft)).toBe(true)
    expect(isDecision({ ...draft, style: undefined })).toBe(true)
    expect(isDecision({ ...draft, style: 'normal' })).toBe(true)
    expect(isDecision({ ...draft, scale: 'tv' })).toBe(false)
    expect(isDecision({ ...draft, style: 'ai', scale: 'tv' })).toBe(true)
    expect(isDecision({ ...draft, name: '  ' })).toBe(false)
    expect(isDecision({ ...draft, source: 'wrong' })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: v3IdleState(), decision: draft })).toBe(true)
    for (const state of [v3ProducingState(), v3SettledState(), v3EventState(), v3EndedState()]) {
      expect(isCoreRequest('apply_decision', { state, decision: draft })).toBe(false)
    }
  })

  it('采纳、拒绝与放弃只对当前槽位生效；start_project 可接自定企划，不能直接接未采纳提案', () => {
    const state = slottedState()
    for (const type of ['adopt_proposal', 'reject_proposal', 'discard_custom_offer'] as const) {
      expect(isCoreRequest('apply_decision', { state, decision: { type } })).toBe(true)
    }
    const bare = v3IdleState()
    for (const type of ['adopt_proposal', 'reject_proposal', 'discard_custom_offer'] as const) {
      expect(isCoreRequest('apply_decision', { state: bare, decision: { type } })).toBe(false)
    }
    const noProposal = structuredClone(state)
    delete noProposal.pending_proposal
    expect(isCoreRequest('apply_decision', { state: noProposal, decision: { type: 'adopt_proposal' } })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: noProposal, decision: { type: 'discard_custom_offer' } })).toBe(true)
    expect(isCoreRequest('start_project', { state, offer_id: 'v3_custom', mode: 'committee', investment_percent: 10 })).toBe(true)
    expect(isCoreRequest('start_project', { state, offer_id: 'v3_custom', mode: 'contract', investment_percent: 0 })).toBe(false)
    expect(isCoreRequest('start_project', { state, offer_id: 'v3_proposal', mode: 'committee', investment_percent: 10 })).toBe(false)
    expect(isCoreRequest('start_project', { state, offer_id: 'v3_ova', mode: 'committee', investment_percent: 10 })).toBe(true)
  })

  it('报价的拟定阵容与渠道潜力、成绩解锁字段执行结构约束', () => {
    const offer = baseOffer()
    expect(isProjectOffer({ ...offer, committee_members: [member('m1', 50, ['toy']), member('m2', 40, ['publisher', 'tv_broadcast'])] })).toBe(true)
    expect(isProjectOffer({ ...offer, allowed_modes: ['contract'], committee_members: [member('m1', 50, ['toy'])] })).toBe(false)
    expect(isProjectOffer({ ...offer, committee_members: [] })).toBe(false)
    expect(isProjectOffer({ ...offer, committee_members: [member('m1', 50, ['bd'])] })).toBe(false)
    expect(isProjectOffer({ ...offer, committee_members: [member('m1', 0, ['toy'])] })).toBe(false)
    expect(isProjectOffer({ ...offer, committee_members: [member('m1', 50, ['toy']), member('m1', 40, ['music'])] })).toBe(false)
    expect(isProjectOffer({ ...offer, channel_potentials: { bd: 60 } })).toBe(true)
    expect(isProjectOffer({ ...offer, channel_potentials: { bd: 60, publisher: 99, toy: 0, music: 40, tv_broadcast: 10 } })).toBe(true)
    expect(isProjectOffer({ ...offer, channel_potentials: { toy: 30 } })).toBe(false)
    expect(isProjectOffer({ ...offer, channel_potentials: { bd: 101 } })).toBe(false)
    expect(isProjectOffer({ ...offer, required_works: [{ rating: 'A', source: 'game' }] })).toBe(true)
    expect(isProjectOffer({ ...offer, required_works: [] })).toBe(false)
    expect(isProjectOffer({ ...offer, required_works: [{ rating: 'E' }] })).toBe(false)
    expect(isProjectOffer({ ...offer, required_works: [{ source: 'manga' }] })).toBe(false)
    expect(isProjectOffer({ ...offer, required_works: [{ rating: 'S' }, { rating: 'S' }] })).toBe(false)
    expect(isProjectOffer({ ...offer, required_works: [{ rating: 'S' }, { rating: 'S', source: 'manga' }] })).toBe(true)
  })

  it('委员会阵容立项固定：成员只绑定一个渠道，承制必须为 null', () => {
    const committee = committeeState()
    committee.project!.committee = [member('m1', 'toy'), member('m2', 'music')]
    expect(isGameState(committee)).toBe(true)
    expect(isGameState(changed(committee, 'project.committee.0.channel', 'bd'))).toBe(false)
    expect(isGameState(changed(committee, 'project.committee', null))).toBe(false)
    expect(isGameState(changed(committee, 'project.committee', undefined, true))).toBe(true)
    const contract = v3ProducingState()
    expect(isGameState(changed(contract, 'project.committee', null))).toBe(true)
    expect(isGameState(changed(contract, 'project.committee', [member('m1', 'toy')]))).toBe(false)
  })

  it('buy_tv_service 仅委员会在制项目且未购买时可用；服务记录要求正花费与合法周', () => {
    const buy: Decision = { type: 'buy_tv_service' }
    expect(isCoreRequest('apply_decision', { state: committeeState(), decision: buy })).toBe(true)
    const bought = committeeState()
    bought.project!.tv_service = { purchased_week: 1, cost: 500_000 }
    expect(isGameState(bought)).toBe(true)
    expect(isCoreRequest('apply_decision', { state: bought, decision: buy })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: v3ProducingState(), decision: buy })).toBe(false)
    expect(isCoreRequest('apply_decision', { state: v3EventState(), decision: buy })).toBe(false)
    expect(isGameState(changed(bought, 'project.tv_service.cost', 0))).toBe(false)
    expect(isGameState(changed(bought, 'project.tv_service.purchased_week', 5.5))).toBe(false)
  })

  it('新成本类别 development/distribution 可选且非负整数；缺省兼容 M1 账本', () => {
    const state = v3IdleState()
    state.company.finance.costs.development = 200_000
    state.company.finance.costs.distribution = 0
    expect(isGameState(state)).toBe(true)
    expect(isGameState(changed(state, 'company.finance.costs.development', undefined, true))).toBe(true)
    expect(isGameState(changed(state, 'company.finance.costs.development', -1))).toBe(false)
    expect(isGameState(changed(state, 'company.finance.costs.distribution', 0.5))).toBe(false)
  })

  it('WorkRecord 携作品评价与分渠道对账；对账必须精确且恒含 BD 基础渠道', () => {
    const work = v3SettledState('committee').history[0]
    expect(isWorkRecord({ ...work, rating: 'A' })).toBe(true)
    expect(isWorkRecord({ ...work, rating: 'E' })).toBe(false)
    const breakdown = [
      { channel: 'bd', revenue: 10_000_000, company_received: 1_000_000 },
      { channel: 'toy', revenue: 6_000_000, company_received: 600_000 },
      { channel: 'music', revenue: 4_000_000, company_received: 400_000 },
    ]
    expect(isWorkRecord({ ...work, channel_breakdown: breakdown })).toBe(true)
    expect(isWorkRecord({ ...work, channel_breakdown: breakdown.slice(1) })).toBe(false)
    expect(isWorkRecord({ ...work, channel_breakdown: [{ channel: 'bd', revenue: 9_000_000, company_received: 1_000_000 }, ...breakdown.slice(1)] })).toBe(false)
    expect(isWorkRecord({ ...work, channel_breakdown: [...breakdown, { channel: 'bd', revenue: 0, company_received: 0 }] })).toBe(false)
    expect(isWorkRecord({ ...work, channel_breakdown: [{ channel: 'bd', revenue: 20_000_000, company_received: 2_000_000 }] })).toBe(true)
    expect(isWorkRecord({ ...work, channel_breakdown: [{ channel: 'wrong', revenue: 20_000_000, company_received: 2_000_000 }] })).toBe(false)
    const contractWork = v3SettledState().history[0]
    expect(isWorkRecord({ ...contractWork, channel_breakdown: [{ channel: 'bd', revenue: 20_000_000, company_received: 0 }] })).toBe(true)
  })
})
