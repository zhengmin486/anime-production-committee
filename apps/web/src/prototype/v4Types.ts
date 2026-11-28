export type V4Ability = 'planning' | 'direction' | 'drawing' | 'animation' | 'management' | 'postproduction'
export type V4Dimension = 'story' | 'direction' | 'drawing' | 'animation' | 'art' | 'sound'
export type V4Stage = 'content_design' | 'storyboard_key_animation' | 'animation' | 'art_visual' | 'photography_editing' | 'sound_delivery'
export type V4Mode = 'contract' | 'committee'
export type V4Source = 'manga' | 'light_novel' | 'game' | 'original' | 'publisher' | 'studio' | 'market'
export type V4Scale = 'ova' | 'short' | 'tv' | 'movie'
export type V4Channel = 'bd' | 'publisher' | 'toy' | 'music' | 'tv_broadcast' | 'domestic_streaming' | 'overseas' | 'merchandise' | 'bd_dvd' | 'tv' | 'streaming' | 'publishing'

export interface V4Quality {
  story: number
  direction: number
  drawing: number
  animation: number
  art: number
  sound: number
}

export interface V4WorkItem {
  id: string
  key: string
  ability: V4Ability
  work_total: number
  work_done: number
  deliver_at: number
  deps: string[]
  is_gate: boolean
  quality: V4Quality
  contributors: string[]
}

export interface V4EpisodeStage {
  key: V4Stage
  items: V4WorkItem[]
}

export interface V4Episode {
  id: string
  index: number
  stages: V4EpisodeStage[]
}

export interface V4WorkPlan {
  intensity: 'low' | 'standard' | 'high'
  focus: 'quality' | 'schedule' | 'cost'
  outsourcing: 'none' | 'gap_fill' | 'aggressive'
  overtime: boolean
  target: { kind: 'episode' | 'stage'; id: string } | null
}

export interface V4Offer {
  id: string
  name: string
  source: V4Source
  scale: V4Scale
  contract_budget: number
  duration_weeks: number
  episode_count: number
  allowed_modes: V4Mode[]
  committee_candidates: string[]
  min_reputation: number
  required_works: string[]
  origin: string
  genre: string
  target_quality: number
  audience_base: number
  commercial_potential: number
  development_fee?: number
  draft_status?: string
  expires_week?: number
  locked_until?: number | null
  lock_used?: boolean
  deposit_paid?: number
  deposit_basis?: number
  offer_source_type?: string
}

export interface V4CommitteeMember {
  partner_id: string
  channel: V4Channel
  invest_percent?: number
}

export interface V4Committee {
  id: string
  work_id: string
  members: V4CommitteeMember[]
  formed_week: number
  status: string
  closed_week: number | null
}

export interface V4Project {
  id: string
  offer: V4Offer
  mode: V4Mode
  investment: { percent: number; total: number; paid: number }
  channels: V4Channel[]
  opened_week: number
  deadline_week: number
  status: 'planning' | 'producing' | 'delivering' | 'settled'
  supervisor_staff_id: string | null
  committee_id: string | null
  tv_service: { purchased: boolean; channel: V4Channel; paid_week: number; fee: number } | null
  common: { id: string; items: V4WorkItem[] }
  episodes: V4Episode[]
  plan: V4WorkPlan
  extension: Record<string, unknown>
  delivery: Record<string, unknown> | null
}

export interface V4Staff {
  id: string
  name: string
  role: string
  employment: 'core' | 'temporary'
  abilities: Record<V4Ability, number>
  experience: Record<V4Ability, number>
  potential: Record<V4Ability, number>
  revealed_potential: Record<V4Ability, boolean>
  talent_type: string
  weekly_salary: number
  signing_fee: number
  fatigue: number
  morale: number
  departure_warning: boolean
  assignment_work_id: string | null
  last_participation: { work_id: string; item_id: string; week: number } | null
  temporary_contract: { work_id: string; start_week: number; end_week: number } | null
}

export interface V4LedgerEntry {
  id: string
  week: number
  work_id: string | null
  category: string
  amount: number
  counterparty: string | null
  memo: string
}

export interface V4Effect {
  scope: 'instant' | 'stage' | 'project'
  target: 'quality' | 'work_done' | 'fatigue' | 'morale' | 'funds'
  stage: V4Stage | ''
  value: number
}

export interface V4VendorRequest {
  item_id: string
  supplier_id: string
  work_total: number
}

export interface V4EventOption {
  id: string
  label: string
  kind: string
  risk_hint: string
  cost: number
  effects: V4Effect[]
  vendor_request?: V4VendorRequest | null
}

export interface V4EventEscalation {
  description: string
  expires_weeks: number
  triggered_week: number
  options: V4EventOption[]
  timeout_option_id: string
}

export interface V4PendingEvent {
  event_id: string
  name: string
  work_id: string
  triggered_week: number
  expires_week: number | null
  cooldown_weeks: number
  once_per_project: boolean
  viewed: boolean
  options: V4EventOption[]
  timeout_option_id: string
  escalated: boolean
  escalation: V4EventEscalation | null
}

export interface V4Partner {
  id: string
  name: string
  type: string
  channels: V4Channel[]
  prestige: number
  relationship: number
  history: { week: number; work_id: string; delta: number; reason: string }[]
  status: string
}

export interface V4FinanceSummary {
  contract_received: number
  investment_paid: number
  commercial_share: number
  bd_revenue: number
  success_reward: number
  penalty: number
  costs: Record<string, number>
  total_costs: number
  profit: number
}

export interface V4WorkRecord {
  id: string
  name: string
  source: V4Source
  scale: V4Scale
  mode: V4Mode
  start_week: number
  end_week: number
  end_reason: string
  quality: V4Quality & { mean: number }
  quality_score: number
  rating: 'S' | 'A' | 'B' | 'C' | 'D'
  commercial_revenue: number
  finance_summary: V4FinanceSummary
}

export interface V4Supplier {
  id: string
  name: string
  specialties: V4Ability[]
  capacity_per_week: number
  quality: number
  speed: number
  price_per_unit: number
  reliability: number
  unlocked_week: number
}

export interface V4OutsourcingContract {
  id: string
  supplier_id: string
  work_id: string
  episode_id: string | null
  item_id: string
  ability: V4Ability
  mode: 'normal' | 'emergency'
  work_total: number
  work_done: number
  weekly_cap: number
  fee_total: number
  fee_paid: number
  signed_week: number
  due_week: number
  status: 'active' | 'delivered'
}

export interface V4VendorReceipt {
  contract_id: string
  work_id: string
  item_id: string
  fee_total: number
  weekly_cap: number
  due_week: number
  finance: { category: 'outsourcing'; work_id: string; entry_id: string }
}

export interface V4GameState {
  version: 4
  seed: number
  company: {
    id: string
    name: string
    founded_week: number
    week: number
    status: 'running' | 'closing' | 'ended'
    end_reason: string | null
    reputation: number
    reputation_log: { week: number; reason: string; delta: number; after: number }[]
  }
  staff: V4Staff[]
  recruitment: { pool: { staff: V4Staff; expires_week: number | null; origin: string }[]; pity: { since_sr: number; since_ssr: number }; last_scout_week: number | null }
  works: V4Project[]
  suppliers: V4Supplier[]
  contracts: V4OutsourcingContract[]
  partners: V4Partner[]
  committees: V4Committee[]
  market: { heat: Record<string, { level: string; changed_week: number }>; slots: V4Offer[]; custom_offer: V4Offer | null; proposal: V4Offer | null; refresh_week: number; [key: string]: unknown }
  events: { pending: V4PendingEvent[]; last_event_week: number | null; per_work: Record<string, unknown> }
  finance: {
    opening_funds: number
    balance: number
    entries: V4LedgerEntry[]
    loans: unknown[]
    solvency: { state: string; since_week: number | null; deadline_week: number | null; gap: number }
  }
  archive: { works: V4WorkRecord[]; series: unknown[]; company_result: unknown }
}

export interface V4WeekReport {
  week: number
  mode?: 'bankrupt'
  bankrupt?: boolean
  skipped?: boolean
  gap?: number
  funds: { delta: number; balance: number; costs?: { salary: number; operations: number; production: number } }
  works: { work_id: string; total_points: number; quality: { mean: number }; items: { item_id: string; points: number; quality_gain: number }[] }[]
  staff: { staff_id: string; produced: number; fatigue: number; morale: number }[]
  settlements: Record<string, unknown>[]
  events: { drawn: number | boolean; reason?: string; events?: unknown[]; count?: number; expired?: { work_id: string; event_id: string; option_id: string; automatic: boolean }[] }
}

export interface V4StateResponse { state: V4GameState }
export interface V4WeekResponse { state: V4GameState; report: V4WeekReport }
export interface V4WorkActionResponse extends V4StateResponse { report?: Record<string, unknown>; work_id?: string; message?: string }

export const V4_METHODS = [
  'initialize_game', 'start_work', 'create_custom_offer', 'adopt_proposal', 'reject_proposal',
  'assign_staff', 'scout', 'hire_core', 'dismiss_staff', 'sign_outsourcing', 'set_work_plan', 'deliver_work', 'abort_work', 'buy_tv_service', 'request_extension',
  'advance_week', 'view_event', 'resolve_event', 'lock_offer', 'end_company', 'finalize_delivery', 'finalize_company',
] as const
export type V4Method = typeof V4_METHODS[number]

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const stringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string')

export function isV4State(value: unknown): value is V4GameState {
  if (!record(value) || value.version !== 4 || typeof value.seed !== 'number' || !record(value.company) ||
    typeof value.company.week !== 'number' || typeof value.company.name !== 'string' || !Array.isArray(value.staff) ||
    !Array.isArray(value.works) || !record(value.recruitment) || !Array.isArray(value.recruitment.pool)
    || !record(value.finance) || typeof value.finance.balance !== 'number' ||
    !Array.isArray(value.finance.entries) || !Array.isArray(value.suppliers) || !Array.isArray(value.contracts)
    || !record(value.market) || !Array.isArray(value.market.slots) ||
    !record(value.events) || !Array.isArray(value.events.pending) || !Array.isArray(value.partners) ||
    !Array.isArray(value.committees) || !record(value.archive) || !Array.isArray(value.archive.works)) return false
  return value.staff.every((staff) => record(staff) && typeof staff.id === 'string' && typeof staff.name === 'string' && record(staff.abilities)) &&
    value.works.every((work) => record(work) && typeof work.id === 'string' && record(work.offer) && Array.isArray(work.episodes) &&
      record(work.common) && Array.isArray(work.common.items) && record(work.plan) && stringArray(work.offer.allowed_modes)) &&
    value.finance.entries.every((entry) => record(entry) && typeof entry.id === 'string' && typeof entry.amount === 'number')
}

export function isV4WeekResponse(value: unknown): value is V4WeekResponse {
  if (!record(value) || !isV4State(value.state) || !record(value.report) || typeof value.report.week !== 'number' ||
    !record(value.report.funds) || typeof value.report.funds.delta !== 'number' || typeof value.report.funds.balance !== 'number' ||
    !Array.isArray(value.report.works) || !Array.isArray(value.report.staff) || !Array.isArray(value.report.settlements) ||
    !record(value.report.events)) return false
  const costs = value.report.funds.costs
  return costs === undefined || (record(costs) && ['salary', 'operations', 'production'].every((key) => typeof costs[key] === 'number'))
}
