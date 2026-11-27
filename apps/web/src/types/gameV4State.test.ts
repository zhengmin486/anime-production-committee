import { describe, expect, it } from 'vitest'
import { isV4GameState, type V4GameState, type V4Project, type V4Staff, type V4WorkItem } from './gameV4State'

const scores = () => ({ planning: 50, direction: 50, drawing: 50, animation: 50, management: 50, postproduction: 50 })
const flags = () => ({ planning: false, direction: false, drawing: false, animation: false, management: false, postproduction: false })

const staff = (id = 'staff_01'): V4Staff => ({
  id,
  name: '测试员工',
  role: 'director',
  employment: 'core',
  abilities: scores(),
  experience: scores(),
  potential: scores(),
  revealed_potential: flags(),
  talent_type: 'specialist',
  weekly_salary: 100,
  signing_fee: 0,
  fatigue: 0,
  morale: 80,
  departure_warning: false,
  assignment_work_id: null,
  last_participation: null,
  temporary_contract: null,
})

const state = (): V4GameState => ({
  version: 4,
  seed: 3,
  company: {
    id: 'company_01', name: '测试公司', founded_week: 0, week: 0, status: 'running', end_reason: null,
    reputation: 100, reputation_log: [],
  },
  staff: [staff()],
  recruitment: { pool: [], pity: { since_sr: 0, since_ssr: 0 }, last_scout_week: null },
  works: [],
  suppliers: [],
  contracts: [],
  partners: [],
  committees: [],
  market: { heat: {}, slots: [], custom_offer: null, proposal: null, refresh_week: null, last_competition_round: 0, competitors: [] },
  events: { pending: [], last_event_week: null, per_work: {} },
  finance: {
    opening_funds: 1000,
    balance: 900,
    entries: [{ id: 'w0.operations', week: 0, work_id: null, category: 'operations', amount: -100, counterparty: null, memo: '测试支出' }],
    loans: [],
    solvency: { state: 'normal', since_week: null, deadline_week: null, gap: 0 },
  },
  archive: { works: [], series: [], company_result: null },
})

const workItem = (): V4WorkItem => ({
  id: 'work_01.common.series_comp',
  key: 'series_comp',
  ability: 'planning',
  work_total: 100,
  work_done: 0,
  deliver_at: 1000,
  deps: [],
  is_gate: false,
  quality: { story: 0, direction: 0, drawing: 0, animation: 0, art: 0, sound: 0 },
  contributors: [],
})

const project = (): V4Project => ({
  id: 'work_01',
  offer: {
    id: 'offer_01', name: '测试项目', source: 'original', genre: '测试', scale: 'short',
    contract_budget: 1000, duration_weeks: 26, target_quality: 80, audience_base: 100,
    commercial_potential: 100, channel_potentials: {}, channels_baseline: [], allowed_modes: ['contract'],
    committee_candidates: [], min_reputation: 0, required_works: [], blueprint_id: 'test_tiny',
    episode_count: 1, workload_scale_permille: 1000, origin: '测试', style: '测试', offer_source_type: 'test',
    deposit_basis: 100, expires_week: 26, locked_until: null, lock_used: false, deposit_paid: 0,
  },
  mode: 'contract',
  investment: {},
  channels: [],
  opened_week: 0,
  deadline_week: 26,
  extension: {},
  status: 'producing',
  supervisor_staff_id: null,
  ip_id: null,
  committee_id: null,
  tv_service: null,
  common: { id: 'work_01.common', items: [workItem()] },
  episodes: [],
  plan: { intensity: 'normal', focus: 'quality', outsourcing: 'none', overtime: false, target: null },
  delivery: null,
})

const withProject = (): V4GameState => {
  const value = state()
  value.works.push(project())
  return value
}

const temporaryState = (): V4GameState => {
  const value = withProject()
  value.staff[0].employment = 'temporary'
  value.staff[0].assignment_work_id = 'work_01'
  value.staff[0].temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 26 }
  return value
}

describe('v4 GameState 关键不变式', () => {
  it('接受现金恒等式一致且引用完整的状态', () => {
    expect(isV4GameState(state())).toBe(true)
    expect(isV4GameState(JSON.parse(JSON.stringify(state())))).toBe(true)
  })

  it('拒绝期初资金、流水与余额不一致的存档', () => {
    const value = state()
    value.finance.balance = 901
    expect(isV4GameState(value)).toBe(false)
  })

  it('拒绝悬空的人员归属、监督与事件引用', () => {
    const assigned = state()
    assigned.staff[0].assignment_work_id = 'missing'
    expect(isV4GameState(assigned)).toBe(false)

    const event = state()
    event.events.pending.push({
      event_id: 'schedule_slip', name: '进度滑坡', work_id: 'missing', triggered_week: 0,
      expires_week: null, cooldown_weeks: 0, once_per_project: false, viewed: false, options: [],
    })
    expect(isV4GameState(event)).toBe(false)
  })

  it('拒绝重复员工、候选人和未知项目账目引用', () => {
    const duplicateStaff = state()
    duplicateStaff.staff.push(staff())
    expect(isV4GameState(duplicateStaff)).toBe(false)

    const duplicateCandidate = state()
    duplicateCandidate.recruitment.pool.push({ staff: staff('candidate_01'), expires_week: null, origin: 'regular' })
    duplicateCandidate.recruitment.pool.push({ staff: staff('candidate_01'), expires_week: null, origin: 'regular' })
    expect(isV4GameState(duplicateCandidate)).toBe(false)

    const danglingLedger = state()
    danglingLedger.finance.entries[0].work_id = 'missing'
    expect(isV4GameState(danglingLedger)).toBe(false)
  })

  it('拒绝供应商或项目引用不存在的合同与委员会', () => {
    const contract = state()
    contract.contracts.push({ id: 'contract_01', work_id: 'missing', supplier_id: 'missing' })
    expect(isV4GameState(contract)).toBe(false)

    const committee = state()
    committee.committees.push({ id: 'committee_01', work_id: 'missing' })
    expect(isV4GameState(committee)).toBe(false)
  })

  it('拒绝非法 employment 或非正周薪', () => {
    const employment = state()
    employment.staff[0].employment = 'intern'
    expect(isV4GameState(employment)).toBe(false)

    const salary = state()
    salary.staff[0].weekly_salary = 0
    expect(isV4GameState(salary)).toBe(false)
  })

  it('拒绝带项目归属或临时合同的招聘候选', () => {
    const assigned = withProject()
    const assignedCandidate = staff('candidate_01')
    assignedCandidate.assignment_work_id = 'work_01'
    assigned.recruitment.pool.push({ staff: assignedCandidate, expires_week: null, origin: 'regular' })
    expect(isV4GameState(assigned)).toBe(false)

    const contracted = withProject()
    const contractedCandidate = staff('candidate_01')
    contractedCandidate.temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 26 }
    contracted.recruitment.pool.push({ staff: contractedCandidate, expires_week: null, origin: 'regular' })
    expect(isV4GameState(contracted)).toBe(false)
  })

  it('员工归属只允许指向 producing 项目', () => {
    const producing = withProject()
    producing.staff[0].assignment_work_id = 'work_01'
    expect(isV4GameState(producing)).toBe(true)

    const planning = withProject()
    planning.works[0].status = 'planning'
    planning.staff[0].assignment_work_id = 'work_01'
    expect(isV4GameState(planning)).toBe(false)
  })

  it('接受合法临时合同并拒绝形状、期限或归属不一致', () => {
    expect(isV4GameState(temporaryState())).toBe(true)

    const invalidStates = [
      (value: V4GameState) => { value.staff[0].employment = 'core' },
      (value: V4GameState) => { value.staff[0].temporary_contract = null },
      (value: V4GameState) => { Object.assign(value.staff[0].temporary_contract!, { extra: true }) },
      (value: V4GameState) => { value.staff[0].temporary_contract!.start_week = 1 },
      (value: V4GameState) => { value.staff[0].temporary_contract!.end_week = 27 },
      (value: V4GameState) => { value.staff[0].assignment_work_id = null },
      (value: V4GameState) => { value.staff[0].temporary_contract!.work_id = 'missing' },
      (value: V4GameState) => { value.works[0].status = 'planning' },
    ]
    for (const invalidate of invalidStates) {
      const value = temporaryState()
      invalidate(value)
      expect(isV4GameState(value)).toBe(false)
    }
  })

  it('contributors 必须在籍、不重复且未开工项不得有参与者', () => {
    const valid = withProject()
    const item = valid.works[0].common.items[0]
    item.work_done = 1
    item.contributors = ['staff_01']
    expect(isV4GameState(valid)).toBe(true)

    const duplicate = structuredClone(valid)
    duplicate.works[0].common.items[0].contributors.push('staff_01')
    expect(isV4GameState(duplicate)).toBe(false)

    const dangling = structuredClone(valid)
    dangling.works[0].common.items[0].contributors = ['missing']
    expect(isV4GameState(dangling)).toBe(false)

    const unstarted = structuredClone(valid)
    unstarted.works[0].common.items[0].work_done = 0
    expect(isV4GameState(unstarted)).toBe(false)
  })

  it('质量维度接受 105 并拒绝 106', () => {
    const value = withProject()
    const quality = value.works[0].common.items[0].quality
    quality.story = 105
    expect(isV4GameState(value)).toBe(true)
    quality.story = 106
    expect(isV4GameState(value)).toBe(false)
  })
})
