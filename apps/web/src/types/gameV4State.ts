import {
  V4_DIMENSIONS,
  V4_PARTNERSHIP_CHANNELS,
  V4_WINDOWS,
  isV4Archive,
  type V4Archive,
  type V4CooperationMode,
  type V4Dimension,
  type V4PartnershipChannel,
  type V4Scale,
  type V4Window,
  type V4WorkSource,
} from './gameV4'

export const V4_ABILITIES = ['planning', 'direction', 'drawing', 'animation', 'management', 'postproduction'] as const
export const V4_STAGES = ['content_design', 'storyboard_key_animation', 'animation', 'art_visual', 'photography_editing', 'sound_delivery'] as const

export type V4Ability = typeof V4_ABILITIES[number]
export type V4Stage = typeof V4_STAGES[number]
export type V4AbilityScores = Record<V4Ability, number>
export type V4AbilityFlags = Record<V4Ability, boolean>
export type V4QualityDimensions = Record<V4Dimension, number>

export interface V4JsonObject {
  [key: string]: unknown
}

export interface V4ReputationLog {
  week: number
  reason: string
  delta: number
  after: number
}

export interface V4Company {
  id: string
  name: string
  founded_week: number
  week: number
  status: string
  end_reason: string | null
  reputation: number
  reputation_log: V4ReputationLog[]
}

export interface V4Participation {
  work_id: string
  item_id: string
  week: number
}

export interface V4TemporaryContract {
  work_id: string
  start_week: number
  end_week: number
}

export interface V4Staff {
  id: string
  name: string
  role: string
  employment: string
  abilities: V4AbilityScores
  experience: V4AbilityScores
  potential: V4AbilityScores
  revealed_potential: V4AbilityFlags
  talent_type: string
  weekly_salary: number
  signing_fee: number
  fatigue: number
  morale: number
  departure_warning: boolean
  assignment_work_id: string | null
  last_participation: V4Participation | null
  temporary_contract: V4TemporaryContract | null
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
  quality: V4QualityDimensions
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

export interface V4CommonProduction {
  id: string
  items: V4WorkItem[]
}

export interface V4WorkPlan {
  intensity: string
  focus: string
  outsourcing: string
  overtime: boolean
  target: { kind: string; id: string } | null
}

export interface V4Offer {
  id: string
  name: string
  source: V4WorkSource
  genre: string
  scale: V4Scale
  contract_budget: number
  duration_weeks: number
  target_quality: number
  audience_base: number
  commercial_potential: number
  channel_potentials: Partial<Record<V4Window, number>>
  channels_baseline: V4Window[]
  allowed_modes: V4CooperationMode[]
  committee_candidates: string[]
  min_reputation: number
  required_works: string[]
  blueprint_id: string
  episode_count: number
  workload_scale_permille: number
  origin: string
  style: string
  offer_source_type: string
  deposit_basis: number
  expires_week: number
  locked_until: number | null
  lock_used: boolean
  deposit_paid: number
  development_fee?: number
  rules_status?: 'placeholder'
  [key: string]: unknown
}

export interface V4Project {
  id: string
  offer: V4Offer
  mode: V4CooperationMode
  investment: V4JsonObject
  channels: V4PartnershipChannel[]
  opened_week: number
  deadline_week: number
  extension: V4JsonObject
  status: string
  supervisor_staff_id: string | null
  ip_id: string | null
  committee_id: string | null
  tv_service: V4JsonObject | null
  common: V4CommonProduction
  episodes: V4Episode[]
  plan: V4WorkPlan
  delivery: V4JsonObject | null
}

export interface V4PoolCandidate {
  staff: V4Staff
  expires_week: number | null
  origin: string
}

export interface V4Recruitment {
  pool: V4PoolCandidate[]
  pity: { since_sr: number; since_ssr: number }
  last_scout_week: number | null
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

export interface V4Solvency {
  state: string
  since_week: number | null
  deadline_week: number | null
  gap: number
}

export interface V4Finance {
  opening_funds: number
  balance: number
  entries: V4LedgerEntry[]
  loans: V4JsonObject[]
  solvency: V4Solvency
}

export interface V4EventEffect {
  scope: string
  target: string
  stage: string
  value: number
}

export interface V4EventOption {
  id: string
  label: string
  kind: string
  risk_hint: string
  cost: number
  effects: V4EventEffect[]
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

export interface V4WorkEventState {
  cooldowns: Record<string, number>
  major_seen: string[]
}

export interface V4EventState {
  pending: V4PendingEvent[]
  last_event_week: number | null
  per_work: Record<string, V4WorkEventState>
}

export interface V4MarketHeat {
  level: 'boom' | 'high' | 'mid' | 'low'
  changed_week: number
}

export interface V4Market {
  heat: Record<string, V4MarketHeat>
  slots: V4Offer[]
  custom_offer: V4JsonObject | null
  proposal: V4JsonObject | null
  refresh_week: number | null
  last_competition_round: number
  competitors: V4JsonObject[]
}

export interface V4GameState {
  version: 4
  seed: number
  company: V4Company
  staff: V4Staff[]
  recruitment: V4Recruitment
  works: V4Project[]
  suppliers: V4JsonObject[]
  contracts: V4JsonObject[]
  partners: V4JsonObject[]
  committees: V4JsonObject[]
  market: V4Market
  events: V4EventState
  finance: V4Finance
  archive: V4Archive
}

export interface V4CommandError {
  code: string
  message: string
}

export interface V4CommandResponse {
  state: V4GameState
  [key: string]: unknown
}

export interface V4CommandErrorResponse {
  error: V4CommandError
}

export type V4CommandResult = V4CommandResponse | V4CommandErrorResponse

const maxInteger = Number.MAX_SAFE_INTEGER
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const integer = (value: unknown, min = 0, max = maxInteger): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const signed = (value: unknown): value is number => integer(value, -maxInteger)
const nullableInteger = (value: unknown, min = 0, max = maxInteger): value is number | null => value === null || integer(value, min, max)
const nullableText = (value: unknown): value is string | null => value === null || isText(value)
const choice = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T)
const exactFields = (value: unknown, fields: readonly string[]): value is Record<string, unknown> => isRecord(value)
  && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field))
const arrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] => Array.isArray(value) && value.every(guard)
const isObjectArray = (value: unknown): value is V4JsonObject[] => Array.isArray(value) && value.every(isRecord)
const scores = (value: unknown): value is V4AbilityScores => exactFields(value, V4_ABILITIES)
  && V4_ABILITIES.every((ability) => integer(value[ability]))
const flags = (value: unknown): value is V4AbilityFlags => exactFields(value, V4_ABILITIES)
  && V4_ABILITIES.every((ability) => typeof value[ability] === 'boolean')
const dimensions = (value: unknown): value is V4QualityDimensions => exactFields(value, V4_DIMENSIONS)
  && V4_DIMENSIONS.every((dimension) => integer(value[dimension], 0, 105))
const nullableObject = (value: unknown): value is V4JsonObject | null => value === null || isRecord(value)
const windows = (value: unknown): value is V4Window[] => arrayOf(value, (item) => choice(item, V4_WINDOWS))
const optionalRulesStatus = (value: Record<string, unknown>): boolean => !Object.hasOwn(value, 'rules_status') || value.rules_status === 'placeholder'

export const isV4Offer = (value: unknown): value is V4Offer => {
  if (!isRecord(value)) return false
  if (!isText(value.id) || !isText(value.name)
    || !choice(value.source, ['publisher', 'studio', 'manga', 'light_novel', 'game', 'original', 'market'])
    || !isText(value.genre) || !choice(value.scale, ['ova', 'short', 'tv', 'movie'])
    || !integer(value.contract_budget) || !integer(value.duration_weeks) || !integer(value.target_quality, 0, 100)
    || !integer(value.audience_base) || !integer(value.commercial_potential, 0, 1000)
    || !isRecord(value.channel_potentials) || !Object.entries(value.channel_potentials).every(([window, potential]) => choice(window, V4_WINDOWS) && integer(potential))
    || !windows(value.channels_baseline) || !arrayOf(value.allowed_modes, (mode) => choice(mode, ['contract', 'committee']))
    || !arrayOf(value.committee_candidates, isText) || Object.hasOwn(value, 'previous_work_id')
    || !integer(value.min_reputation) || !arrayOf(value.required_works, isText)
    || !isText(value.blueprint_id) || !integer(value.episode_count, 1)
    || !integer(value.workload_scale_permille) || !isText(value.origin) || !isText(value.style)
    || !isText(value.offer_source_type) || !integer(value.deposit_basis) || !integer(value.expires_week)
    || !nullableInteger(value.locked_until) || typeof value.lock_used !== 'boolean' || !integer(value.deposit_paid)
    || (Object.hasOwn(value, 'development_fee') && !integer(value.development_fee)) || !optionalRulesStatus(value)) return false
  return true
}

const isV4ReputationLog = (value: unknown): value is V4ReputationLog => exactFields(value, ['week', 'reason', 'delta', 'after'])
  && integer(value.week) && isText(value.reason) && signed(value.delta) && signed(value.after)

export const isV4Company = (value: unknown): value is V4Company => exactFields(value,
  ['id', 'name', 'founded_week', 'week', 'status', 'end_reason', 'reputation', 'reputation_log'])
  && isText(value.id) && isText(value.name) && integer(value.founded_week) && integer(value.week, 0, 520)
  && isText(value.status) && nullableText(value.end_reason) && integer(value.reputation)
  && arrayOf(value.reputation_log, isV4ReputationLog)

const isV4Participation = (value: unknown): value is V4Participation => exactFields(value, ['work_id', 'item_id', 'week'])
  && isText(value.work_id) && isText(value.item_id) && integer(value.week)

const isV4TemporaryContract = (value: unknown): value is V4TemporaryContract => exactFields(value, ['work_id', 'start_week', 'end_week'])
  && isText(value.work_id) && integer(value.start_week, 0, 520) && integer(value.end_week, 1)

export const isV4Staff = (value: unknown): value is V4Staff => exactFields(value,
  ['id', 'name', 'role', 'employment', 'abilities', 'experience', 'potential', 'revealed_potential', 'talent_type',
    'weekly_salary', 'signing_fee', 'fatigue', 'morale', 'departure_warning', 'assignment_work_id', 'last_participation', 'temporary_contract'])
  && isText(value.id) && isText(value.name) && isText(value.role) && choice(value.employment, ['core', 'temporary'])
  && scores(value.abilities) && scores(value.experience) && scores(value.potential) && flags(value.revealed_potential)
  && isText(value.talent_type) && integer(value.weekly_salary, 1) && integer(value.signing_fee)
  && integer(value.fatigue, 0, 100) && integer(value.morale, 0, 100) && typeof value.departure_warning === 'boolean'
  && nullableText(value.assignment_work_id) && (value.last_participation === null || isV4Participation(value.last_participation))
  && (value.temporary_contract === null || isV4TemporaryContract(value.temporary_contract))

const isV4WorkItem = (value: unknown): value is V4WorkItem => exactFields(value,
  ['id', 'key', 'ability', 'work_total', 'work_done', 'deliver_at', 'deps', 'is_gate', 'quality', 'contributors'])
  && isText(value.id) && isText(value.key) && choice(value.ability, V4_ABILITIES)
  && integer(value.work_total) && integer(value.work_done) && integer(value.deliver_at)
  && arrayOf(value.deps, isText) && typeof value.is_gate === 'boolean' && dimensions(value.quality)
  && arrayOf(value.contributors, isText)

const isV4EpisodeStage = (value: unknown): value is V4EpisodeStage => exactFields(value, ['key', 'items'])
  && choice(value.key, V4_STAGES) && arrayOf(value.items, isV4WorkItem)

const isV4Episode = (value: unknown): value is V4Episode => exactFields(value, ['id', 'index', 'stages'])
  && isText(value.id) && integer(value.index) && arrayOf(value.stages, isV4EpisodeStage)

const isV4WorkPlan = (value: unknown): value is V4WorkPlan => {
  if (!exactFields(value, ['intensity', 'focus', 'outsourcing', 'overtime', 'target'])) return false
  if (!isText(value.intensity) || !isText(value.focus) || !isText(value.outsourcing) || typeof value.overtime !== 'boolean') return false
  return value.target === null || (exactFields(value.target, ['kind', 'id']) && isText(value.target.kind) && isText(value.target.id))
}

export const isV4Project = (value: unknown): value is V4Project => {
  if (!exactFields(value, ['id', 'offer', 'mode', 'investment', 'channels', 'opened_week', 'deadline_week', 'extension',
    'status', 'supervisor_staff_id', 'ip_id', 'committee_id', 'tv_service', 'common', 'episodes', 'plan', 'delivery'])) return false
  return isText(value.id) && isV4Offer(value.offer) && choice(value.mode, ['contract', 'committee'])
    && isRecord(value.investment) && arrayOf(value.channels, (channel) => choice(channel, V4_PARTNERSHIP_CHANNELS))
    && integer(value.opened_week) && integer(value.deadline_week)
    && isRecord(value.extension) && isText(value.status) && nullableText(value.supervisor_staff_id)
    && nullableText(value.ip_id) && nullableText(value.committee_id) && nullableObject(value.tv_service)
    && exactFields(value.common, ['id', 'items']) && isText(value.common.id) && arrayOf(value.common.items, isV4WorkItem)
    && arrayOf(value.episodes, isV4Episode) && isV4WorkPlan(value.plan) && nullableObject(value.delivery)
}

const isV4PoolCandidate = (value: unknown): value is V4PoolCandidate => exactFields(value, ['staff', 'expires_week', 'origin'])
  && isV4Staff(value.staff) && nullableInteger(value.expires_week) && isText(value.origin)

const isV4Recruitment = (value: unknown): value is V4Recruitment => exactFields(value, ['pool', 'pity', 'last_scout_week'])
  && arrayOf(value.pool, isV4PoolCandidate) && exactFields(value.pity, ['since_sr', 'since_ssr'])
  && integer(value.pity.since_sr) && integer(value.pity.since_ssr) && nullableInteger(value.last_scout_week)

const isV4LedgerEntry = (value: unknown): value is V4LedgerEntry => exactFields(value,
  ['id', 'week', 'work_id', 'category', 'amount', 'counterparty', 'memo'])
  && isText(value.id) && integer(value.week) && nullableText(value.work_id) && isText(value.category)
  && signed(value.amount) && nullableText(value.counterparty) && typeof value.memo === 'string'

const isV4Solvency = (value: unknown): value is V4Solvency => exactFields(value, ['state', 'since_week', 'deadline_week', 'gap'])
  && isText(value.state) && nullableInteger(value.since_week) && nullableInteger(value.deadline_week) && signed(value.gap)

const isV4Finance = (value: unknown): value is V4Finance => exactFields(value, ['opening_funds', 'balance', 'entries', 'loans', 'solvency'])
  && integer(value.opening_funds) && signed(value.balance) && arrayOf(value.entries, isV4LedgerEntry)
  && isObjectArray(value.loans) && isV4Solvency(value.solvency)

const isV4EventEffect = (value: unknown): value is V4EventEffect => exactFields(value, ['scope', 'target', 'stage', 'value'])
  && isText(value.scope) && isText(value.target) && typeof value.stage === 'string' && signed(value.value)

const isV4EventOption = (value: unknown): value is V4EventOption => exactFields(value,
  ['id', 'label', 'kind', 'risk_hint', 'cost', 'effects'])
  && isText(value.id) && isText(value.label) && isText(value.kind) && isText(value.risk_hint)
  && signed(value.cost) && arrayOf(value.effects, isV4EventEffect)

const isV4EventEscalation = (value: unknown): value is V4EventEscalation => exactFields(value,
  ['description', 'expires_weeks', 'triggered_week', 'options', 'timeout_option_id'])
  && isText(value.description) && integer(value.expires_weeks) && integer(value.triggered_week)
  && arrayOf(value.options, isV4EventOption) && typeof value.timeout_option_id === 'string'

const isV4PendingEvent = (value: unknown): value is V4PendingEvent => exactFields(value,
  ['event_id', 'name', 'work_id', 'triggered_week', 'expires_week', 'cooldown_weeks', 'once_per_project', 'viewed', 'options',
    'timeout_option_id', 'escalated', 'escalation'])
  && isText(value.event_id) && isText(value.name) && isText(value.work_id) && integer(value.triggered_week)
  && nullableInteger(value.expires_week) && integer(value.cooldown_weeks) && typeof value.once_per_project === 'boolean'
  && typeof value.viewed === 'boolean' && arrayOf(value.options, isV4EventOption)
  && typeof value.timeout_option_id === 'string' && typeof value.escalated === 'boolean' && nullableObject(value.escalation)
  && (value.escalation === null || isV4EventEscalation(value.escalation))

const isV4WorkEventState = (value: unknown): value is V4WorkEventState => exactFields(value, ['cooldowns', 'major_seen'])
  && isRecord(value.cooldowns) && Object.values(value.cooldowns).every((entry) => integer(entry)) && arrayOf(value.major_seen, isText)

const isV4EventState = (value: unknown): value is V4EventState => exactFields(value, ['pending', 'last_event_week', 'per_work'])
  && arrayOf(value.pending, isV4PendingEvent) && nullableInteger(value.last_event_week) && isRecord(value.per_work)
  && Object.values(value.per_work).every(isV4WorkEventState)

export const isV4Market = (value: unknown): value is V4Market => exactFields(value,
  ['heat', 'slots', 'custom_offer', 'proposal', 'refresh_week', 'last_competition_round', 'competitors'])
  && isRecord(value.heat) && Object.values(value.heat).every((entry) => exactFields(entry, ['level', 'changed_week'])
    && choice(entry.level, ['boom', 'high', 'mid', 'low']) && integer(entry.changed_week, 0, 520))
  && arrayOf(value.slots, isV4Offer) && nullableObject(value.custom_offer) && nullableObject(value.proposal)
  && nullableInteger(value.refresh_week) && integer(value.last_competition_round) && isObjectArray(value.competitors)

export const isV4GameState = (value: unknown): value is V4GameState => {
  if (!exactFields(value,
    ['version', 'seed', 'company', 'staff', 'recruitment', 'works', 'suppliers', 'contracts', 'partners', 'committees', 'market', 'events', 'finance', 'archive'])
    || value.version !== 4 || !integer(value.seed, 0, 0xffffffff) || !isV4Company(value.company)
    || !arrayOf(value.staff, isV4Staff) || !isV4Recruitment(value.recruitment) || !arrayOf(value.works, isV4Project)
    || !isObjectArray(value.suppliers) || !isObjectArray(value.contracts) || !isObjectArray(value.partners) || !isObjectArray(value.committees)
    || !isV4Market(value.market) || !isV4EventState(value.events) || !isV4Finance(value.finance) || !isV4Archive(value.archive)) return false

  const state = value as unknown as V4GameState
  const ledgerTotal = state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0)
  const expectedBalance = state.finance.opening_funds + ledgerTotal
  if (!Number.isSafeInteger(ledgerTotal) || !Number.isSafeInteger(expectedBalance) || expectedBalance !== state.finance.balance) return false

  const worksById = new Map(state.works.map((work) => [work.id, work]))
  const staffIds = new Set<string>()
  for (const member of state.staff) {
    if (staffIds.has(member.id)) return false
    staffIds.add(member.id)
    if (member.assignment_work_id !== null && worksById.get(member.assignment_work_id)?.status !== 'producing') return false
    if (member.employment === 'core' && member.temporary_contract !== null) return false
    if (member.employment === 'temporary') {
      const contract = member.temporary_contract
      if (contract === null || contract.start_week > state.company.week || member.assignment_work_id !== contract.work_id) return false
      const owner = worksById.get(contract.work_id)
      if (!owner || owner.status !== 'producing' || contract.end_week !== owner.deadline_week) return false
    }
  }

  const workIds = new Set<string>()
  const validContributors = (item: V4WorkItem): boolean => {
    const contributors = new Set<string>()
    for (const id of item.contributors) {
      if (!id || contributors.has(id)) return false
      contributors.add(id)
    }
    return item.work_done > 0 || contributors.size === 0
  }
  for (const work of state.works) {
    if (workIds.has(work.id) || state.archive.works.some((record) => record.id === work.id)) return false
    workIds.add(work.id)
    if (work.supervisor_staff_id !== null && !staffIds.has(work.supervisor_staff_id)) return false
    if (!work.common.items.every(validContributors)
      || !work.episodes.every((episode) => episode.stages.every((stage) => stage.items.every(validContributors)))) return false
  }
  const knownWorkIds = new Set([...workIds, ...state.archive.works.map((record) => record.id)])

  const candidateIds = new Set<string>()
  for (const candidate of state.recruitment.pool) {
    if (candidateIds.has(candidate.staff.id) || staffIds.has(candidate.staff.id)
      || candidate.staff.assignment_work_id !== null || candidate.staff.temporary_contract !== null) return false
    candidateIds.add(candidate.staff.id)
  }

  const supplierIds = new Set<string>()
  for (const supplier of state.suppliers) {
    if (!isText(supplier.id) || supplierIds.has(supplier.id)) return false
    supplierIds.add(supplier.id)
  }
  const committeeIds = new Set<string>()
  for (const committee of state.committees) {
    if (!isText(committee.id) || !isText(committee.work_id) || !knownWorkIds.has(committee.work_id) || committeeIds.has(committee.id)) return false
    committeeIds.add(committee.id)
  }
  for (const contract of state.contracts) {
    if (!isText(contract.id) || !isText(contract.work_id) || !knownWorkIds.has(contract.work_id)
      || !isText(contract.supplier_id) || !supplierIds.has(contract.supplier_id)) return false
  }
  for (const work of state.works) {
    if (work.committee_id !== null && !committeeIds.has(work.committee_id)) return false
  }

  const pendingWorks = new Set<string>()
  for (const event of state.events.pending) {
    if (!workIds.has(event.work_id) || pendingWorks.has(event.work_id)) return false
    pendingWorks.add(event.work_id)
  }
  for (const entry of state.finance.entries) {
    if (entry.work_id !== null && !knownWorkIds.has(entry.work_id)) return false
  }
  return true
}

export const isV4CommandError = (value: unknown): value is V4CommandError => exactFields(value, ['code', 'message'])
  && isText(value.code) && typeof value.message === 'string'

export const isV4CommandErrorResponse = (value: unknown): value is V4CommandErrorResponse => isRecord(value)
  && Object.keys(value).length === 1 && isV4CommandError(value.error)

export const isV4CommandResponse = (value: unknown): value is V4CommandResponse => isRecord(value)
  && isV4GameState(value.state)
