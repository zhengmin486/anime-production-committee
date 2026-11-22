import { STAGES as V3_STAGES } from '../types/gameV3'
import type { AbilityValues as V3AbilityValues, CooperationMode as V3CooperationMode, Costs as V3Costs, Finance as V3Finance, GameState as V3GameState, StageConfiguration as V3Configuration, StageState as V3StageState, Staff as V3Staff, TeamSnapshot as V3TeamSnapshot, WeekReport as V3WeekReport, WorkRecord as V3WorkRecord } from '../types/gameV3'

// 仅供前端隔离单元测试：静态协议样本，不模拟 C++ 规则，不供生产代码使用。
// v2 旧协议字面量：只作为 v3 守卫的负例输入，不再有任何类型约束。
export const idleState = () => ({
  version: 2, seed: 12345, day: 1, funds: 2000000, reputation: 0, phase: 'idle',
  staff: [{ id: 'staff_01', name: '林导演', role: 'director', skill: 70, morale: 80, assignment: 'pre', overtime: false }],
  offers: [{ id: 'proj_ova_01', name: '放学后的第七帧', type: 'ova', budget: 8000000, duration_days: 20, target_quality: 60, min_reputation: 0 }],
  project: null, pending_event: null, end_reason: null,
})
export const producingState = () => ({
  ...idleState(), funds: 10000000, phase: 'producing', offers: [],
  project: {
    id: 'proj_ova_01', name: '放学后的第七帧', type: 'ova', budget: 8000000, spent: 0,
    start_day: 1, deadline_day: 20, target_quality: 60, policy: 'normal',
    stages: { pre: { progress: 30, quality: 72, outsourced: false }, mid: { progress: 20, quality: 65, outsourced: false }, post: { progress: 10, quality: 68, outsourced: false } },
  },
})
export const eventState = () => ({
  ...producingState(), phase: 'event_pending', day: 2, seed: 87654,
  pending_event: {
    id: 'evt_fixture', title: '隔离测试制作事件', description: '这是前端单元测试的事件样本。',
    options: [
      { id: 'opt_a', label: '支援方案（核心标签）', effect: { funds: -300000, morale: 8 } },
      { id: 'opt_b', label: '延期方案（核心标签）', effect: { deadline_days: 1, stage_quality: { stage: 'mid', delta: -3 } } },
    ],
  },
})
export const endedState = () => ({ ...producingState(), day: 21, phase: 'ended', end_reason: 'deadline' })

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

// v3 静态契约样本。五阶段各一周仅为可手算的测试账本，不是默认平衡或模拟器。
const v3Abilities = (): V3AbilityValues => ({ planning: 70, direction: 75, drawing: 60, animation: 65, management: 80, postproduction: 55 })
const v3ZeroCosts = (): V3Costs => ({ salary: 0, operations: 0, production: 0, temporary: 0, outsourcing: 0, events: 0, extension: 0, penalty: 0 })
const v3WeeklyCosts = (): V3Costs => ({ ...v3ZeroCosts(), salary: 100_000, operations: 20_000, production: 80_000 })
const v3FiveWeekCosts = (): V3Costs => ({ ...v3ZeroCosts(), salary: 500_000, operations: 100_000, production: 400_000 })
const v3EmptyFinance = (): V3Finance => ({ contract_received: 0, investment_paid: 0, commercial_share_received: 0, costs: v3ZeroCosts() })

function v3Staff(): V3Staff[] {
  const director: V3Staff = {
    id: 'v3_director', name: '林导演', role: 'director', employment: 'core',
    abilities: v3Abilities(), experience: { planning: 0, direction: 12, drawing: 0, animation: 0, management: 4, postproduction: 0 },
    potential: { planning: 85, direction: 95, drawing: 80, animation: 85, management: 90, postproduction: 75 },
    revealed_potential: { planning: false, direction: true, drawing: false, animation: false, management: true, postproduction: false },
    talent_type: 'specialist', clues: ['善于分镜调度', '团队沟通稳定'], traits: ['细致'],
    weekly_salary: 60_000, project_fee: 0, fatigue: 10, morale: 80, departure_warning: false,
  }
  return [director, {
    ...structuredClone(director), id: 'v3_artist', name: '陈原画', role: 'key_animator',
    abilities: { planning: 50, direction: 55, drawing: 80, animation: 75, management: 60, postproduction: 50 },
    talent_type: 'uneven', clues: ['擅长动作设计'], traits: [], weekly_salary: 40_000, fatigue: 5,
  }]
}

const v3Configuration = (): V3Configuration => ({
  assignments: [
    { staff_id: 'v3_director', role: 'director', focus: 'direction' },
    { staff_id: 'v3_artist', role: 'key_animator', focus: 'drawing' },
  ], policy: 'balanced', overtime: false,
})
const v3PendingStage = (): V3StageState => ({ status: 'pending', work_done: 0, quality: 0, configuration: null, recommended_configuration: null, result: null })
const v3Team = (staff: V3Staff[]): V3TeamSnapshot[] => staff.map((person) => ({
  staff_id: person.id, name: person.name, role: person.role, employment: person.employment, abilities: { ...person.abilities },
}))

export function v3IdleState(): V3GameState {
  const offer: V3GameState['offers'][number] = {
    id: 'v3_ova', name: '放学后的第七帧', source: 'manga', scale: 'ova', contract_budget: 2_000_000, duration_weeks: 5, target_quality: 60, audience_base: 60,
    commercial_potential: 65, risk: 'low', allowed_modes: ['contract', 'committee'],
    workloads: { script: 100, storyboard: 100, key_animation: 100, animation_check: 100, postproduction: 100 }, previous_work_id: null,
  }
  return {
    version: 3, seed: 12345, phase: 'idle',
    company: {
      week: 0, status: 'running', end_reason: null, initial_funds: 5_000_000, funds: 5_000_000,
      reputation: 0, staff: v3Staff(), finance: v3EmptyFinance(),
    },
    offers: [
      offer,
      { ...structuredClone(offer), id: 'v3_short', name: '纸飞机电台', source: 'light_novel', scale: 'short', contract_budget: 1_200_000, duration_weeks: 8, target_quality: 55, audience_base: 40, commercial_potential: 50 },
      { ...structuredClone(offer), id: 'v3_tv', name: '星轨列车', source: 'game', scale: 'tv', contract_budget: 6_000_000, duration_weeks: 24, target_quality: 75, audience_base: 80, risk: 'medium' },
      { ...structuredClone(offer), id: 'v3_movie', name: '未寄出的夏天', source: 'original', scale: 'movie', contract_budget: 10_000_000, duration_weeks: 40, target_quality: 85, audience_base: 0, commercial_potential: 90, risk: 'high', allowed_modes: ['committee'] },
    ],
    recruitment_pool: [],
    suppliers: [{ id: 'v3_supplier', name: '青叶协力工作室', specialties: ['direction', 'drawing'], capacity: 100, quality: 68, speed: 20, unit_price: 1_500, reliability: 80, unlocked: true }],
    project: null, pending_event: null, history: [], last_project_id: null, company_result: null,
    preview: { next_week: 1, costs: { ...v3ZeroCosts(), salary: 100_000, operations: 20_000 }, total_cost: 120_000, event_probability_per_mille: 0 },
  }
}

export function v3ProducingState(): V3GameState {
  const state = v3IdleState()
  const offer = state.offers[0]
  state.phase = 'producing'
  state.offers = []
  state.company.funds = 7_000_000
  state.company.finance.contract_received = 2_000_000
  state.project = {
    offer, mode: 'contract', investment_percent: 0, opening_funds: 5_000_000, start_week: 0, deadline_week: 5,
    current_stage: 'script', stages: {
      script: { ...v3PendingStage(), status: 'active', configuration: v3Configuration(), recommended_configuration: v3Configuration() },
      storyboard: v3PendingStage(), key_animation: v3PendingStage(), animation_check: v3PendingStage(), postproduction: v3PendingStage(),
    },
    extension_count: 0, committee_pressure: null, finance: { ...v3EmptyFinance(), contract_received: 2_000_000 },
    temporary_staff: [], outsourcing: [], delivery_reason: null,
  }
  state.preview = { next_week: 1, costs: v3WeeklyCosts(), total_cost: 200_000, event_probability_per_mille: 100 }
  return state
}

export function v3EventState(): V3GameState {
  const state = v3ProducingState()
  state.phase = 'event_pending'
  state.company.week = 1
  state.company.funds = 6_800_000
  state.company.finance.costs = v3WeeklyCosts()
  state.project!.finance.costs = v3WeeklyCosts()
  state.project!.stages.script.work_done = 40
  state.project!.stages.script.quality = 60
  Object.assign(state.company.staff[0], {
    experience: { planning: 2, direction: 17, drawing: 0, animation: 0, management: 5, postproduction: 0 }, fatigue: 15, morale: 78,
  })
  Object.assign(state.company.staff[1], {
    experience: { planning: 0, direction: 12, drawing: 4, animation: 2, management: 4, postproduction: 0 }, fatigue: 9, morale: 79,
  })
  state.preview = null
  state.pending_event = {
    id: 'v3_event', category: 'quality', stage: 'script', title: '剧本意见分歧', description: '用于协议测试的静态事件。',
    trigger: { metric: 'quality', value: 60, threshold: 65 },
    options: [
      { id: 'v3_discuss', label: '组织讨论', cost: 0, allows_reconfigure: true, disabled_reason: null },
      { id: 'v3_keep', label: '维持方案', cost: 0, allows_reconfigure: false, disabled_reason: null },
      { id: 'v3_consult', label: '外部顾问', cost: 50_000, allows_reconfigure: false, disabled_reason: '顾问暂无档期' },
    ],
  }
  return state
}

export function v3ReadyState(): V3GameState {
  const state = v3ProducingState()
  state.phase = 'project_ready'
  state.company.week = 5
  state.company.funds = 6_000_000
  state.company.finance.costs = v3FiveWeekCosts()
  const project = state.project!
  project.finance.costs = v3FiveWeekCosts()
  project.current_stage = null
  project.delivery_reason = 'completed'
  for (const stage of V3_STAGES) {
    project.stages[stage] = {
      status: 'completed', work_done: 100, quality: 70, configuration: v3Configuration(), recommended_configuration: v3Configuration(),
      result: { weeks_spent: 1, quality: 70, costs: v3WeeklyCosts(), issues: [], team: v3Team(state.company.staff) },
    }
  }
  state.preview = null
  return state
}

export function v3SettledState(mode: V3CooperationMode = 'contract'): V3GameState {
  const state = v3ReadyState()
  const project = state.project!
  const finance: V3Finance = mode === 'contract'
    ? { contract_received: 2_000_000, investment_paid: 0, commercial_share_received: 0, costs: v3FiveWeekCosts() }
    : { contract_received: 2_000_000, investment_paid: 1_000_000, commercial_share_received: 2_000_000, costs: v3FiveWeekCosts() }
  const work: V3WorkRecord = {
    id: project.offer.id, name: project.offer.name, source: project.offer.source, scale: project.offer.scale, previous_work_id: null,
    mode, investment_percent: mode === 'contract' ? 0 : 10, start_week: 0, end_week: 5, end_reason: 'completed',
    quality_score: 70, commercial_score: 80, commercial_revenue: 20_000_000,
    finance, profit: mode === 'contract' ? 1_000_000 : 2_000_000, team: v3Team(state.company.staff), stages: project.stages,
  }
  state.phase = 'project_settled'
  state.company.funds = mode === 'contract' ? 6_000_000 : 7_000_000
  state.company.finance = structuredClone(finance)
  state.project = null
  state.history = [work]
  state.last_project_id = work.id
  return state
}

export function v3EndedState(): V3GameState {
  const state = v3IdleState()
  state.phase = 'company_ended'
  state.company.status = 'ended'
  state.company.end_reason = 'voluntary'
  state.company.staff = []
  state.offers = []
  state.preview = null
  state.company_result = { reason: 'voluntary', weeks: 0, final_funds: 5_000_000, net_cash_change: 0, total_projects: 0, best_work_id: null, rating: 'small' }
  return state
}

export function v3WeekReport(): V3WeekReport {
  return {
    week: 1, funds_delta: -200_000, costs: v3WeeklyCosts(),
    stage_deltas: [{ stage: 'script', work_done_delta: 40, quality_delta: 60 }],
    staff_deltas: [
      { staff_id: 'v3_director', experience: { planning: 2, direction: 5, drawing: 0, animation: 0, management: 1, postproduction: 0 }, fatigue_delta: 5, morale_delta: -2 },
      { staff_id: 'v3_artist', experience: { planning: 0, direction: 0, drawing: 4, animation: 2, management: 0, postproduction: 0 }, fatigue_delta: 4, morale_delta: -1 },
    ], messages: ['静态样本：第一周制作支出 200,000。'],
  }
}
