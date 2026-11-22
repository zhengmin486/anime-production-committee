export const CORE_METHODS = ['initialize_game', 'start_project', 'apply_decision', 'advance_week', 'resolve_event', 'calculate_result'] as const
export const STAGES = ['script', 'storyboard', 'key_animation', 'animation_check', 'postproduction'] as const
export const ABILITIES = ['planning', 'direction', 'drawing', 'animation', 'management', 'postproduction'] as const
export const COST_CATEGORIES = ['salary', 'operations', 'production', 'temporary', 'outsourcing', 'events', 'extension', 'penalty'] as const
// M2 新成本类别（前期开发费、电视播出发行成本）在 #6 核心落地前可选，缺省按 0 解释。
export const OPTIONAL_COST_CATEGORIES = ['development', 'distribution'] as const

export type CoreMethod = typeof CORE_METHODS[number]
export type Stage = typeof STAGES[number]
export type Ability = typeof ABILITIES[number]
export type AbilityValues = Record<Ability, number>
export type Costs = Record<typeof COST_CATEGORIES[number], number> & Partial<Record<typeof OPTIONAL_COST_CATEGORIES[number], number>>
export type Phase = 'idle' | 'producing' | 'event_pending' | 'project_ready' | 'project_settled' | 'company_ended'
export type CompanyEndReason = 'time_limit' | 'bankrupt' | 'voluntary'
export type DeliveryReason = 'completed' | 'deadline' | 'company_closed'
export type Source = 'manga' | 'light_novel' | 'game' | 'original'
export type Scale = 'ova' | 'short' | 'tv' | 'movie'
export type OfferOrigin = 'market' | 'custom' | 'incoming' | 'proposal'
export type WorkStyle = 'normal' | 'meme' | 'ai'
export type CooperationMode = 'contract' | 'committee'
export type Policy = 'quality' | 'balanced' | 'deadline'
export type Role = 'director' | 'scriptwriter' | 'animation_director' | 'key_animator' | 'animator' | 'production_manager' | 'postproduction'
export const CHANNELS = ['bd', 'publisher', 'toy', 'music', 'tv_broadcast'] as const
export type Channel = typeof CHANNELS[number]
export type MemberChannel = Exclude<Channel, 'bd'>
export type WorkRating = 'S' | 'A' | 'B' | 'C' | 'D'

export interface CommitteeMember {
  id: string
  name: string
  channel: MemberChannel
}

export interface ChannelPotentials {
  bd: number
  publisher?: number
  toy?: number
  music?: number
  tv_broadcast?: number
}

export interface OfferRequirement {
  rating: WorkRating
  source?: Source
}

export interface TvService {
  purchased_week: number
  cost: number
}

export interface ChannelRevenue {
  channel: Channel
  revenue: number
  company_received: number
}

export interface Finance {
  contract_received: number
  investment_paid: number
  commercial_share_received: number
  costs: Costs
}

export interface Staff {
  id: string
  name: string
  role: Role
  employment: 'core' | 'temporary'
  abilities: AbilityValues
  experience: AbilityValues
  potential: AbilityValues
  revealed_potential: Record<Ability, boolean>
  talent_type: 'specialist' | 'uneven' | 'generalist' | 'ordinary'
  clues: string[]
  traits: string[]
  weekly_salary: number
  project_fee: number
  fatigue: number
  morale: number
  departure_warning: boolean
}

// M2 扩展字段（origin/style/min_reputation/scout_pity 及 V3.7 渠道/槽位字段）在 #6/#7/#8
// 核心实现落地前可选：缺省按旧语义解释，M1 核心输出与既有 v3 存档保持合法。见 DATA_MODEL V3.6/V3.7。
export interface Company {
  week: number
  status: 'running' | 'closing' | 'ended'
  end_reason: CompanyEndReason | null
  initial_funds: number
  funds: number
  reputation: number
  staff: Staff[]
  finance: Finance
  scout_pity?: { since_sr: number; since_ssr: number }
}

export interface ProjectOffer {
  id: string
  name: string
  source: Source
  scale: Scale
  contract_budget: number
  duration_weeks: number
  target_quality: number
  audience_base: number
  commercial_potential: number
  risk: 'low' | 'medium' | 'high'
  allowed_modes: CooperationMode[]
  workloads: Record<Stage, number>
  previous_work_id: string | null
  origin?: OfferOrigin
  style?: WorkStyle
  min_reputation?: number
  committee_members?: CommitteeMember[]
  channel_potentials?: ChannelPotentials
  required_works?: OfferRequirement[]
}

export interface Assignment {
  staff_id: string
  role: Role
  focus: Ability
}

export interface StageConfiguration {
  assignments: Assignment[]
  policy: Policy
  overtime: boolean
}

export interface TeamSnapshot {
  staff_id: string
  name: string
  role: Role
  employment: 'core' | 'temporary'
  abilities: AbilityValues
}

export interface StageResult {
  weeks_spent: number
  quality: number
  costs: Costs
  issues: string[]
  team: TeamSnapshot[]
}

export interface StageState {
  status: 'pending' | 'ready' | 'active' | 'completed'
  work_done: number
  quality: number
  configuration: StageConfiguration | null
  recommended_configuration: StageConfiguration | null
  result: StageResult | null
}

export interface Supplier {
  id: string
  name: string
  specialties: Ability[]
  capacity: number
  quality: number
  speed: number
  unit_price: number
  reliability: number
  unlocked: boolean
}

export interface OutsourceTask {
  id: string
  supplier_id: string
  stage: Stage
  ability: Ability
  work_total: number
  work_done: number
  mode: 'normal' | 'emergency'
  fee_paid: number
  due_week: number
  status: 'active' | 'delivered' | 'failed'
}

export interface Project {
  offer: ProjectOffer
  mode: CooperationMode
  total_investment?: number
  investment_percent: number
  opening_funds: number
  start_week: number
  deadline_week: number
  current_stage: Stage | null
  stages: Record<Stage, StageState>
  extension_count: number
  committee_pressure: number | null
  finance: Finance
  temporary_staff: Staff[]
  outsourcing: OutsourceTask[]
  delivery_reason: DeliveryReason | null
  // M2 渠道框架（DATA_MODEL V3.7）：成员构成在立项时固定；承制模式两字段为 null。
  committee?: CommitteeMember[] | null
  tv_service?: TvService | null
}

export interface EventOption {
  id: string
  label: string
  cost: number
  allows_reconfigure: boolean
  disabled_reason: string | null
}

export interface GameEvent {
  id: string
  category: 'personnel' | 'quality' | 'budget' | 'schedule'
  stage: Stage
  title: string
  description: string
  trigger: { metric: string; value: number; threshold: number }
  options: EventOption[]
}

export interface WorkRecord {
  id: string
  name: string
  source: Source
  scale: Scale
  previous_work_id: string | null
  mode: CooperationMode
  investment_percent: number
  start_week: number
  end_week: number
  end_reason: DeliveryReason
  quality_score: number
  commercial_score: number
  commercial_revenue: number
  finance: Finance
  profit: number
  team: TeamSnapshot[]
  stages: Record<Stage, StageState>
  origin?: OfferOrigin
  style?: WorkStyle
  rating?: WorkRating
  channel_breakdown?: ChannelRevenue[]
}

export interface CompanyResult {
  reason: CompanyEndReason
  weeks: number
  final_funds: number
  net_cash_change: number
  total_projects: number
  best_work_id: string | null
  rating: 'renowned' | 'stable' | 'small' | 'failed'
}

export interface WeekPreview {
  next_week: number
  costs: Costs
  total_cost: number
  event_probability_per_mille: number
}

export interface GameState {
  version: 3
  seed: number
  phase: Phase
  company: Company
  offers: ProjectOffer[]
  recruitment_pool: Staff[]
  suppliers: Supplier[]
  project: Project | null
  pending_event: GameEvent | null
  history: WorkRecord[]
  last_project_id: string | null
  company_result: CompanyResult | null
  preview: WeekPreview | null
  // M2 企划来源扩展（DATA_MODEL V3.7）：自定企划与员工提案各占独立槽位，不占市场四企划。
  custom_offer?: ProjectOffer | null
  pending_proposal?: ProjectOffer | null
}

export type Decision =
  | { type: 'configure_stage'; stage: Stage; configuration: StageConfiguration }
  | { type: 'hire_temporary'; candidate_id: string }
  | { type: 'hire_core'; candidate_id: string }
  | { type: 'outsource'; supplier_id: string; stage: Stage; ability: Ability; workload: number; mode: 'normal' | 'emergency' }
  | { type: 'request_extension' }
  | { type: 'raise_salary'; staff_id: string; weekly_salary: number }
  | { type: 'return_to_market' }
  | { type: 'end_company' }
  | { type: 'scout' }
  | { type: 'targeted_scout'; role?: Role; focus_ability?: Ability }
  | { type: 'create_custom_offer'; name: string; source: Source; scale: Scale; style?: WorkStyle }
  | { type: 'discard_custom_offer' }
  | { type: 'adopt_proposal' }
  | { type: 'reject_proposal' }
  | { type: 'buy_tv_service' }

export interface WeekReport {
  week: number
  funds_delta: number
  costs: Costs
  stage_deltas: { stage: Stage; work_done_delta: number; quality_delta: number }[]
  staff_deltas: { staff_id: string; experience: AbilityValues; fatigue_delta: number; morale_delta: number }[]
  messages: string[]
}

export interface CoreRequests {
  initialize_game: { seed: number }
  start_project: { state: GameState; offer_id: string; mode: CooperationMode; investment_percent: number }
  apply_decision: { state: GameState; decision: Decision }
  advance_week: { state: GameState }
  resolve_event: { state: GameState; option_id: string; configuration?: StageConfiguration }
  calculate_result: { state: GameState; scope: 'project' | 'company' }
}

export interface StateResponse { state: GameState; message: string }
export interface CoreResponses {
  initialize_game: StateResponse
  start_project: StateResponse
  apply_decision: StateResponse
  advance_week: { state: GameState; report: WeekReport }
  resolve_event: StateResponse
  calculate_result: { state: GameState; scope: 'project'; result: WorkRecord } | { state: GameState; scope: 'company'; result: CompanyResult }
}

export type CoreErrorCode = 'INVALID_INPUT' | 'INVALID_PHASE' | 'INSUFFICIENT_BUDGET' | 'STAGE_LOCKED' | 'MODE_NOT_ALLOWED' | 'CAPACITY_EXCEEDED' | 'COMPANY_ENDED' | 'INTERNAL_ERROR'
export interface CoreError { error: { code: CoreErrorCode; message: string } }
export interface SaveRecord { version: 3; savedAt: string; state: GameState }

// M0 边界只检查协议结构、范围和引用关系；不重算经营、制作或随机规则。
const maxInteger = Number.MAX_SAFE_INTEGER
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const integer = (value: unknown, min = 0, max = maxInteger): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const signed = (value: unknown): value is number => integer(value, -maxInteger)
const score = (value: unknown): value is number => integer(value, 0, 100)
const delta = (value: unknown): value is number => integer(value, -100, 100)
const week = (value: unknown): value is number => integer(value, 0, 520)
const bool = (value: unknown): value is boolean => typeof value === 'boolean'
const choice = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T)
function arrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  if (!Array.isArray(value)) return false
  for (const item of value) if (!guard(item)) return false
  return true
}
const unique = (values: readonly string[]) => new Set(values).size === values.length
const uniqueIds = (values: readonly { id: string }[]) => unique(values.map(({ id }) => id))
const nullableText = (value: unknown): value is string | null => value === null || isText(value)
const fields = <K extends string, V>(value: unknown, keys: readonly K[], guard: (item: unknown) => item is V): value is Record<K, V> => isRecord(value) && keys.every((key) => guard(value[key]))

export const isSeed = (value: unknown): value is number => integer(value, 0, 0xffffffff)
export const isCoreMethod = (value: unknown): value is CoreMethod => choice(value, CORE_METHODS)
export const isStage = (value: unknown): value is Stage => choice(value, STAGES)
export const isAbility = (value: unknown): value is Ability => choice(value, ABILITIES)
export const isPhase = (value: unknown): value is Phase => choice(value, ['idle', 'producing', 'event_pending', 'project_ready', 'project_settled', 'company_ended'])
export const isCompanyEndReason = (value: unknown): value is CompanyEndReason => choice(value, ['time_limit', 'bankrupt', 'voluntary'])
export const isDeliveryReason = (value: unknown): value is DeliveryReason => choice(value, ['completed', 'deadline', 'company_closed'])
export const isSource = (value: unknown): value is Source => choice(value, ['manga', 'light_novel', 'game', 'original'])
export const isScale = (value: unknown): value is Scale => choice(value, ['ova', 'short', 'tv', 'movie'])
export const isOfferOrigin = (value: unknown): value is OfferOrigin => choice(value, ['market', 'custom', 'incoming', 'proposal'])
export const isWorkStyle = (value: unknown): value is WorkStyle => choice(value, ['normal', 'meme', 'ai'])
export const isChannel = (value: unknown): value is Channel => choice(value, CHANNELS)
export const isMemberChannel = (value: unknown): value is MemberChannel => choice(value, ['publisher', 'toy', 'music', 'tv_broadcast'])
export const isWorkRating = (value: unknown): value is WorkRating => choice(value, ['S', 'A', 'B', 'C', 'D'])
export const isCooperationMode = (value: unknown): value is CooperationMode => choice(value, ['contract', 'committee'])
export const isPolicy = (value: unknown): value is Policy => choice(value, ['quality', 'balanced', 'deadline'])
export const isRole = (value: unknown): value is Role => choice(value, ['director', 'scriptwriter', 'animation_director', 'key_animator', 'animator', 'production_manager', 'postproduction'])
export const isAbilityValues = (value: unknown): value is AbilityValues => fields(value, ABILITIES, score)
export const isCosts = (value: unknown): value is Costs => isRecord(value)
  && OPTIONAL_COST_CATEGORIES.every((category) => value[category] === undefined || integer(value[category]))
  && fields(value, COST_CATEGORIES, integer)

export function isFinance(value: unknown): value is Finance {
  return isRecord(value) && integer(value.contract_received) && integer(value.investment_paid)
    && integer(value.commercial_share_received) && isCosts(value.costs)
}

const potentialCoversAbilities = (potential: AbilityValues, abilities: AbilityValues) => ABILITIES.every((ability) => potential[ability] >= abilities[ability])

export function isStaff(value: unknown): value is Staff {
  return isRecord(value) && isText(value.id) && isText(value.name) && isRole(value.role)
    && choice(value.employment, ['core', 'temporary']) && isAbilityValues(value.abilities)
    && fields(value.experience, ABILITIES, integer) && isAbilityValues(value.potential)
    && potentialCoversAbilities(value.potential, value.abilities)
    && fields(value.revealed_potential, ABILITIES, bool)
    && choice(value.talent_type, ['specialist', 'uneven', 'generalist', 'ordinary'])
    && arrayOf(value.clues, isText) && value.clues.length >= 1 && value.clues.length <= 2
    && arrayOf(value.traits, isText) && integer(value.weekly_salary) && integer(value.project_fee)
    && (value.employment === 'core' ? value.project_fee === 0 : value.weekly_salary === 0)
    && score(value.fatigue) && score(value.morale) && bool(value.departure_warning)
}

export function isCompany(value: unknown): value is Company {
  if (!isRecord(value) || !week(value.week) || !choice(value.status, ['running', 'closing', 'ended'])
    || !integer(value.initial_funds) || !signed(value.funds) || !integer(value.reputation)
    || !arrayOf(value.staff, isStaff) || !uniqueIds(value.staff) || !value.staff.every((staff) => staff.employment === 'core')
    || !isFinance(value.finance)
    || !(value.scout_pity === undefined || (isRecord(value.scout_pity) && integer(value.scout_pity.since_sr) && integer(value.scout_pity.since_ssr)))) return false
  if (value.status === 'running') return value.end_reason === null && value.funds >= 0 && value.week < 520
  return isCompanyEndReason(value.end_reason) && (value.funds >= 0 || value.end_reason === 'bankrupt')
    && (value.end_reason !== 'time_limit' || value.week === 520)
}

// 缺省 style=normal、origin=market；非 normal 风格只能来自自定企划，meme 限定短篇。
const styleOriginRule = (value: Record<string, unknown>) => {
  const style = value.style ?? 'normal'
  return style === 'normal' || (value.origin === 'custom' && (style === 'ai' || value.scale === 'short'))
}

// M2 渠道框架结构守卫（DATA_MODEL V3.7）：BD 是基础渠道，股东只带其余四类。
export const isCommitteeMember = (value: unknown): value is CommitteeMember => isRecord(value) && isText(value.id) && isText(value.name) && isMemberChannel(value.channel) && !("share_percent" in value) && !("channels" in value)
const isCommitteeMembers = (value: unknown): value is CommitteeMember[] => arrayOf(value, isCommitteeMember) && value.length > 0 && uniqueIds(value)
const isChannelPotentials = (value: unknown): value is ChannelPotentials => isRecord(value) && score(value.bd)
  && (value.publisher === undefined || score(value.publisher)) && (value.toy === undefined || score(value.toy))
  && (value.music === undefined || score(value.music)) && (value.tv_broadcast === undefined || score(value.tv_broadcast))
const isOfferRequirement = (value: unknown): value is OfferRequirement => isRecord(value) && isWorkRating(value.rating)
  && (value.source === undefined || isSource(value.source))
const isOfferRequirements = (value: unknown): value is OfferRequirement[] => arrayOf(value, isOfferRequirement) && value.length > 0
  && unique(value.map((item) => `${item.rating}:${item.source ?? ''}`))
export const isTvService = (value: unknown): value is TvService => isRecord(value) && week(value.purchased_week) && integer(value.cost, 1)
const isChannelRevenue = (value: unknown): value is ChannelRevenue => isRecord(value) && isChannel(value.channel)
  && integer(value.revenue) && integer(value.company_received) && value.revenue >= value.company_received
const nullableOffer = (value: unknown): value is ProjectOffer | null | undefined => value === undefined || value === null || isProjectOffer(value)
// 分渠道收入必须与总收入、公司分账总额精确对账；BD 恒在列表中（基础渠道）。
const isChannelBreakdown = (value: unknown, revenue: number, companyReceived: number): value is ChannelRevenue[] => arrayOf(value, isChannelRevenue)
  && value.length > 0 && unique(value.map(({ channel }) => channel)) && value.some(({ channel }) => channel === 'bd')
  && value.reduce((sum, item) => sum + item.revenue, 0) === revenue
  && value.reduce((sum, item) => sum + item.company_received, 0) === companyReceived

export function isProjectOffer(value: unknown): value is ProjectOffer {
  return isRecord(value) && isText(value.id) && isText(value.name) && isSource(value.source) && isScale(value.scale)
    && value.total_investment === undefined && integer(value.contract_budget) && integer(value.duration_weeks, 1)
    && score(value.target_quality) && score(value.audience_base) && score(value.commercial_potential)
    && choice(value.risk, ['low', 'medium', 'high']) && arrayOf(value.allowed_modes, isCooperationMode)
    && value.allowed_modes.length > 0 && unique(value.allowed_modes)
    && (value.source !== 'original' || (value.allowed_modes.length === 1 && value.allowed_modes[0] === 'committee'))
    && fields(value.workloads, STAGES, (item): item is number => integer(item, 1)) && nullableText(value.previous_work_id)
    && value.previous_work_id !== value.id
    && (value.origin === undefined || isOfferOrigin(value.origin))
    && (value.style === undefined || isWorkStyle(value.style))
    && (value.min_reputation === undefined || integer(value.min_reputation))
    && (value.committee_members === undefined || (isCommitteeMembers(value.committee_members) && value.allowed_modes.includes('committee')))
    && (value.channel_potentials === undefined || isChannelPotentials(value.channel_potentials))
    && (value.required_works === undefined || isOfferRequirements(value.required_works))
    && styleOriginRule(value)
}

export function isAssignment(value: unknown): value is Assignment {
  return isRecord(value) && isText(value.staff_id) && isRole(value.role) && isAbility(value.focus)
}

export function isStageConfiguration(value: unknown): value is StageConfiguration {
  return isRecord(value) && arrayOf(value.assignments, isAssignment)
    && unique(value.assignments.map(({ staff_id }) => staff_id)) && isPolicy(value.policy) && bool(value.overtime)
}

export function isTeamSnapshot(value: unknown): value is TeamSnapshot {
  return isRecord(value) && isText(value.staff_id) && isText(value.name) && isRole(value.role)
    && choice(value.employment, ['core', 'temporary']) && isAbilityValues(value.abilities)
}

const isTeam = (value: unknown): value is TeamSnapshot[] => arrayOf(value, isTeamSnapshot) && unique(value.map(({ staff_id }) => staff_id))
const configurationReferences = (configuration: StageConfiguration | null, ids: ReadonlySet<string>) => configuration === null || configuration.assignments.every(({ staff_id }) => ids.has(staff_id))

export function isStageResult(value: unknown): value is StageResult {
  return isRecord(value) && integer(value.weeks_spent, 1) && score(value.quality)
    && isCosts(value.costs) && arrayOf(value.issues, isText) && isTeam(value.team)
}

export function isStageState(value: unknown): value is StageState {
  if (!isRecord(value) || !choice(value.status, ['pending', 'ready', 'active', 'completed'])
    || !integer(value.work_done) || !score(value.quality)
    || !(value.configuration === null || isStageConfiguration(value.configuration))
    || !(value.recommended_configuration === null || isStageConfiguration(value.recommended_configuration))
    || !(value.result === null || isStageResult(value.result))) return false
  switch (value.status) {
    case 'pending': return value.configuration === null && value.result === null && value.work_done === 0 && value.recommended_configuration === null
    case 'ready': return value.configuration === null && value.result === null && value.work_done === 0
    case 'active': return value.configuration !== null && value.result === null
    case 'completed': return value.configuration !== null && value.result !== null && value.work_done > 0
      && configurationReferences(value.configuration, new Set(value.result.team.map(({ staff_id }) => staff_id)))
  }
}

// 阶段快照有序，但历史记录没有 workloads，不能凭空重建工作量。
function firstUnfinished(stages: Record<Stage, StageState>): Stage | null {
  return STAGES.find((stage) => stages[stage].status !== 'completed') ?? null
}

function orderedStages(stages: Record<Stage, StageState>): boolean {
  const first = firstUnfinished(stages)
  if (first === null) return true
  const index = STAGES.indexOf(first)
  return ['ready', 'active'].includes(stages[first].status)
    && STAGES.slice(index + 1).every((stage) => stages[stage].status === 'pending')
}

export function isSupplier(value: unknown): value is Supplier {
  return isRecord(value) && isText(value.id) && isText(value.name)
    && arrayOf(value.specialties, isAbility) && value.specialties.length > 0 && unique(value.specialties)
    && integer(value.capacity, 1) && score(value.quality) && integer(value.speed, 1)
    && integer(value.unit_price) && score(value.reliability) && bool(value.unlocked)
}

export function isOutsourceTask(value: unknown): value is OutsourceTask {
  return isRecord(value) && isText(value.id) && isText(value.supplier_id) && isStage(value.stage) && isAbility(value.ability)
    && integer(value.work_total, 1) && integer(value.work_done, 0, value.work_total)
    && choice(value.mode, ['normal', 'emergency']) && integer(value.fee_paid) && integer(value.due_week)
    && choice(value.status, ['active', 'delivered', 'failed']) && (value.status !== 'delivered' || value.work_done === value.work_total)
}

const validInvestment = (mode: CooperationMode, percent: unknown): percent is number => mode === 'contract' ? percent === 0 : integer(percent, 10, 100)
const modeFinance = (mode: CooperationMode, finance: Finance) => mode !== 'contract' || (finance.investment_paid === 0 && finance.commercial_share_received === 0)

export function isProject(value: unknown): value is Project {
  if (!isRecord(value) || !isProjectOffer(value.offer) || !isCooperationMode(value.mode)
    || !value.offer.allowed_modes.includes(value.mode) || !validInvestment(value.mode, value.investment_percent)
    || !integer(value.opening_funds) || !week(value.start_week) || !integer(value.deadline_week, 1) || value.deadline_week <= value.start_week
    || !(value.current_stage === null || isStage(value.current_stage)) || !fields(value.stages, STAGES, isStageState)
    || !integer(value.extension_count, 0, 1) || !isFinance(value.finance) || !modeFinance(value.mode, value.finance)
    || !arrayOf(value.temporary_staff, isStaff) || !uniqueIds(value.temporary_staff) || !value.temporary_staff.every((staff) => staff.employment === 'temporary')
    || !arrayOf(value.outsourcing, isOutsourceTask) || !uniqueIds(value.outsourcing)
    || !(value.committee === undefined || (value.mode === 'committee'
      ? value.committee !== null && isCommitteeMembers(value.committee)
      : value.committee === null))
    || !(value.tv_service === undefined || value.tv_service === null || isTvService(value.tv_service))
    || !(value.delivery_reason === null || isDeliveryReason(value.delivery_reason))) return false
  if (value.mode === 'contract' ? value.committee_pressure !== null || value.extension_count !== 0 || value.total_investment !== undefined : !score(value.committee_pressure) || !integer(value.total_investment) || value.total_investment !== value.offer.contract_budget * 2) return false
  if (!orderedStages(value.stages) || value.current_stage !== firstUnfinished(value.stages)) return false
  if (value.current_stage === null ? value.delivery_reason !== 'completed' : value.delivery_reason === 'completed') return false
  const { stages, offer } = value
  return STAGES.every((stage) => stages[stage].status === 'completed'
    ? stages[stage].work_done === offer.workloads[stage]
    : stages[stage].work_done < offer.workloads[stage])
}

export function isEventOption(value: unknown): value is EventOption {
  return isRecord(value) && isText(value.id) && isText(value.label) && integer(value.cost)
    && bool(value.allows_reconfigure) && nullableText(value.disabled_reason)
}

export function isGameEvent(value: unknown): value is GameEvent {
  return isRecord(value) && isText(value.id) && choice(value.category, ['personnel', 'quality', 'budget', 'schedule'])
    && isStage(value.stage) && isText(value.title) && isText(value.description) && isRecord(value.trigger)
    && isText(value.trigger.metric) && signed(value.trigger.value) && signed(value.trigger.threshold)
    && arrayOf(value.options, isEventOption) && value.options.length > 0 && uniqueIds(value.options)
}

export function isWorkRecord(value: unknown): value is WorkRecord {
  if (!isRecord(value) || !isText(value.id) || !isText(value.name) || !isSource(value.source) || !isScale(value.scale)
    || !nullableText(value.previous_work_id) || value.previous_work_id === value.id || !isCooperationMode(value.mode)
    || (value.source === 'original' && value.mode !== 'committee') || !validInvestment(value.mode, value.investment_percent)
    || !week(value.start_week) || !week(value.end_week) || value.end_week < value.start_week || !isDeliveryReason(value.end_reason)
    || !score(value.quality_score) || !score(value.commercial_score) || !integer(value.commercial_revenue)
    || !isFinance(value.finance) || !modeFinance(value.mode, value.finance) || !signed(value.profit) || !isTeam(value.team)
    || !fields(value.stages, STAGES, isStageState) || !orderedStages(value.stages)
    || !(value.origin === undefined || isOfferOrigin(value.origin))
    || !(value.style === undefined || isWorkStyle(value.style)) || !styleOriginRule(value)
    || !(value.rating === undefined || isWorkRating(value.rating))
    || !(value.channel_breakdown === undefined || isChannelBreakdown(value.channel_breakdown,
      value.commercial_revenue, value.finance.commercial_share_received))) return false
  if ((firstUnfinished(value.stages) === null) !== (value.end_reason === 'completed')) return false
  const ids = new Set(value.team.map(({ staff_id }) => staff_id))
  const stages = value.stages
  return STAGES.every((stage) => {
    const snapshot = stages[stage]
    return configurationReferences(snapshot.configuration, ids)
      && (snapshot.result === null || snapshot.result.team.every(({ staff_id }) => ids.has(staff_id)))
  })
}

export function isCompanyResult(value: unknown): value is CompanyResult {
  return isRecord(value) && isCompanyEndReason(value.reason) && week(value.weeks) && signed(value.final_funds)
    && (value.final_funds >= 0 || value.reason === 'bankrupt') && (value.reason !== 'time_limit' || value.weeks === 520)
    && signed(value.net_cash_change) && integer(value.total_projects) && nullableText(value.best_work_id)
    && (value.total_projects !== 0 || value.best_work_id === null)
    && choice(value.rating, ['renowned', 'stable', 'small', 'failed'])
}

export function isWeekPreview(value: unknown): value is WeekPreview {
  return isRecord(value) && integer(value.next_week, 1, 520) && isCosts(value.costs)
    && integer(value.total_cost) && integer(value.event_probability_per_mille, 0, 1000)
}

export function isGameState(value: unknown): value is GameState {
  if (!isRecord(value) || 'error' in value || value.version !== 3 || !isSeed(value.seed) || !isPhase(value.phase) || !isCompany(value.company)
    || !arrayOf(value.offers, isProjectOffer) || !uniqueIds(value.offers)
    || !arrayOf(value.recruitment_pool, isStaff) || !uniqueIds(value.recruitment_pool)
    || !arrayOf(value.suppliers, isSupplier) || !uniqueIds(value.suppliers)
    || !(value.project === null || isProject(value.project)) || !(value.pending_event === null || isGameEvent(value.pending_event))
    || !arrayOf(value.history, isWorkRecord) || !uniqueIds(value.history) || !nullableText(value.last_project_id)
    || !(value.company_result === null || isCompanyResult(value.company_result)) || !(value.preview === null || isWeekPreview(value.preview))
    || !nullableOffer(value.custom_offer) || !nullableOffer(value.pending_proposal)) return false
  const { company, project, history, pending_event: event } = value
  const custom = value.custom_offer ?? null
  const proposal = value.pending_proposal ?? null
  // 自定企划与员工提案不占市场四槽；提案只出现在空闲周，公司非 running 时两槽必须为空。
  if (custom !== null && custom.origin !== 'custom') return false
  if (proposal !== null && (proposal.origin !== 'proposal' || proposal.source !== 'original')) return false
  if (company.status !== 'running' && (custom !== null || proposal !== null)) return false
  if (proposal !== null && value.phase !== 'idle') return false
  const historyById = new Map<string, WorkRecord>()
  for (const work of history) {
    if (work.end_week > company.week) return false
    if (work.previous_work_id !== null) {
      const previous = historyById.get(work.previous_work_id)
      if (!previous || previous.end_week > work.start_week) return false
    }
    historyById.set(work.id, work)
  }
  if (value.last_project_id !== null && !historyById.has(value.last_project_id)) return false
  const listedOffers = [...value.offers, ...(custom === null ? [] : [custom]), ...(proposal === null ? [] : [proposal])]
  if (!uniqueIds(listedOffers)) return false
  const availableOffers = project === null ? listedOffers : [...listedOffers, project.offer]
  if (availableOffers.some((offer) => historyById.has(offer.id) || (offer.previous_work_id !== null && !historyById.has(offer.previous_work_id)))) return false
  const currentStaff = [...company.staff, ...(project?.temporary_staff ?? [])]
  if (!uniqueIds([...currentStaff, ...value.recruitment_pool])) return false
  if (project !== null) {
    if (project.start_week > company.week || value.last_project_id !== null) return false
    if (project.offer.previous_work_id !== null && historyById.get(project.offer.previous_work_id)!.end_week > project.start_week) return false
    const currentIds = new Set(currentStaff.map(({ id }) => id))
    for (const stage of STAGES) {
      const snapshot = project.stages[stage]
      // 完成阶段使用当时快照，不使用可能已离职/更换的当前名册。
      const ids = snapshot.result === null ? currentIds : new Set(snapshot.result.team.map(({ staff_id }) => staff_id))
      if (!configurationReferences(snapshot.configuration, ids)
        || (snapshot.result === null && !configurationReferences(snapshot.recommended_configuration, currentIds))) return false
    }
    const supplierIds = new Set(value.suppliers.map(({ id }) => id))
    if (project.outsourcing.some((task) => !supplierIds.has(task.supplier_id))) return false
  }
  if (company.status === 'ended') {
    const summary = value.company_result
    return value.phase === 'company_ended' && project === null && event === null && value.offers.length === 0 && value.preview === null
      && summary !== null && summary.reason === company.end_reason && summary.weeks === company.week && summary.final_funds === company.funds
      && summary.total_projects === history.length && (summary.best_work_id === null || historyById.has(summary.best_work_id))
  }
  if (value.phase === 'company_ended' || value.company_result !== null) return false
  if (company.status === 'closing' && !['idle', 'project_ready', 'project_settled'].includes(value.phase)) return false
  const needsPreview = company.status === 'running' && (value.phase === 'idle'
    || (value.phase === 'producing' && project !== null && project.current_stage !== null && project.stages[project.current_stage].status === 'active'))
  if (needsPreview ? value.preview === null || value.preview.next_week !== company.week + 1 : value.preview !== null) return false
  if (value.phase === 'idle') {
    if (project !== null || event !== null || value.last_project_id !== null || value.offers.length !== (company.status === 'running' ? 4 : 0)) return false
    // 负责人决策（#1，2026-11-21）：锁定项可展示，但至少 2 个报价可立即承接。
    return company.status !== 'running' || value.offers.filter((offer) => (offer.min_reputation ?? 0) <= company.reputation).length >= 2
  }
  if (value.offers.length !== 0) return false
  if (value.phase === 'project_settled') return project === null && event === null && value.last_project_id !== null
  if (project === null) return false
  if (value.phase === 'project_ready') return event === null && project.delivery_reason !== null
    && (project.delivery_reason !== 'company_closed' || company.status === 'closing')
    && (project.delivery_reason !== 'deadline' || company.week >= project.deadline_week)
  if (company.status !== 'running' || project.delivery_reason !== null || project.current_stage === null || company.week >= project.deadline_week) return false
  if (value.phase === 'event_pending') return event !== null && event.stage === project.current_stage && project.stages[event.stage].status === 'active'
  return value.phase === 'producing' && event === null
}

export function isDecision(value: unknown): value is Decision {
  if (!isRecord(value)) return false
  switch (value.type) {
    case 'configure_stage': return isStage(value.stage) && isStageConfiguration(value.configuration)
    case 'hire_temporary': case 'hire_core': return isText(value.candidate_id)
    case 'outsource': return isText(value.supplier_id) && isStage(value.stage) && isAbility(value.ability)
      && integer(value.workload, 1) && choice(value.mode, ['normal', 'emergency'])
    case 'request_extension': case 'return_to_market': case 'end_company': return true
    case 'raise_salary': return isText(value.staff_id) && integer(value.weekly_salary)
    case 'scout': return true
    case 'targeted_scout': {
      const hasRole = value.role !== undefined
      const hasAbility = value.focus_ability !== undefined
      return hasRole !== hasAbility && (!hasRole || isRole(value.role)) && (!hasAbility || isAbility(value.focus_ability))
    }
    case 'create_custom_offer': return isText(value.name) && isSource(value.source) && isScale(value.scale)
      && (value.style === undefined || isWorkStyle(value.style))
      && ((value.style ?? 'normal') !== 'meme' || value.scale === 'short')
    case 'discard_custom_offer': case 'adopt_proposal': case 'reject_proposal': case 'buy_tv_service': return true
    default: return false
  }
}

export function isWeekReport(value: unknown): value is WeekReport {
  return isRecord(value) && week(value.week) && signed(value.funds_delta) && isCosts(value.costs)
    && arrayOf(value.stage_deltas, (item): item is WeekReport['stage_deltas'][number] => isRecord(item)
      && isStage(item.stage) && signed(item.work_done_delta) && delta(item.quality_delta))
    && unique(value.stage_deltas.map(({ stage }) => stage))
    && arrayOf(value.staff_deltas, (item): item is WeekReport['staff_deltas'][number] => isRecord(item)
      && isText(item.staff_id) && fields(item.experience, ABILITIES, integer) && delta(item.fatigue_delta) && delta(item.morale_delta))
    && unique(value.staff_deltas.map(({ staff_id }) => staff_id)) && arrayOf(value.messages, isText)
}

function decisionReferences(state: GameState, decision: Decision): boolean {
  if (state.company.status !== 'running') return false
  const project = state.project
  const managing = state.phase === 'idle' || state.phase === 'project_settled'
  const ready = state.phase === 'producing' && project !== null && project.current_stage !== null && project.stages[project.current_stage].status === 'ready'
  const currentIds = new Set([...state.company.staff, ...(project?.temporary_staff ?? [])].map(({ id }) => id))
  switch (decision.type) {
    case 'configure_stage': return ready && project !== null && decision.stage === project.current_stage && configurationReferences(decision.configuration, currentIds)
    case 'hire_core': return managing && state.recruitment_pool.some((staff) => staff.id === decision.candidate_id && staff.employment === 'core')
    case 'hire_temporary': return ready && state.recruitment_pool.some((staff) => staff.id === decision.candidate_id && staff.employment === 'temporary')
    case 'outsource': return ready && project !== null && decision.stage === project.current_stage
      && state.suppliers.some((supplier) => supplier.id === decision.supplier_id && supplier.unlocked && supplier.specialties.includes(decision.ability))
    case 'request_extension': return state.phase === 'producing' && project !== null && project.mode === 'committee' && project.extension_count === 0 && state.company.week < project.deadline_week
    case 'raise_salary': return managing && state.company.staff.some((staff) => staff.id === decision.staff_id && decision.weekly_salary > staff.weekly_salary)
    case 'return_to_market': return state.phase === 'project_settled'
    case 'end_company': return true
    case 'scout': case 'targeted_scout': return managing
    case 'create_custom_offer': return state.phase === 'idle'
    case 'discard_custom_offer': return state.phase === 'idle' && (state.custom_offer ?? null) !== null
    case 'adopt_proposal': case 'reject_proposal': return state.phase === 'idle' && (state.pending_proposal ?? null) !== null
    case 'buy_tv_service': return state.phase === 'producing' && project !== null && project.mode === 'committee'
      && (project.tv_service ?? null) === null
  }
}

export function isCoreRequest<M extends CoreMethod>(method: M, input: unknown): input is CoreRequests[M]
export function isCoreRequest(method: unknown, input: unknown): input is CoreRequests[CoreMethod]
export function isCoreRequest(method: unknown, input: unknown): input is CoreRequests[CoreMethod] {
  if (!isCoreMethod(method) || !isRecord(input) || 'error' in input) return false
  if (method === 'initialize_game') return isSeed(input.seed)
  if (!isGameState(input.state)) return false
  const state = input.state
  switch (method) {
    case 'start_project': {
      if (state.phase !== 'idle' || state.company.status !== 'running' || !isText(input.offer_id) || !isCooperationMode(input.mode)) return false
      // 自定企划走同一接约校验；员工提案须先采纳转入自定槽，不能直接开工。
      const custom = state.custom_offer ?? null
      const offer = state.offers.find(({ id }) => id === input.offer_id) ?? (custom !== null && custom.id === input.offer_id ? custom : undefined)
      return offer !== undefined && offer.allowed_modes.includes(input.mode) && validInvestment(input.mode, input.investment_percent)
    }
    case 'apply_decision': return isDecision(input.decision) && decisionReferences(state, input.decision)
    case 'advance_week': return state.company.status === 'running' && state.preview !== null
    case 'resolve_event': {
      if (state.phase !== 'event_pending' || state.pending_event === null || !isText(input.option_id)) return false
      const option = state.pending_event.options.find(({ id }) => id === input.option_id)
      if (!option || option.disabled_reason !== null) return false
      return option.allows_reconfigure ? isStageConfiguration(input.configuration)
        && configurationReferences(input.configuration, new Set([...state.company.staff, ...(state.project?.temporary_staff ?? [])].map(({ id }) => id)))
        : !('configuration' in input)
    }
    case 'calculate_result': return input.scope === 'project' ? state.phase === 'project_ready'
      : input.scope === 'company' && state.company.status === 'closing' && state.project === null
  }
}

// 比较响应内的同一份快照，不重新推导利润、评级、质量或最佳作品。
function sameSnapshot(left: unknown, right: unknown, seen = new WeakMap<object, object>()): boolean {
  if (left === right) return true
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) return false
  if (Array.isArray(left) !== Array.isArray(right)) return false
  if (seen.has(left)) return seen.get(left) === right
  seen.set(left, right)
  const leftFields = left as Record<string, unknown>
  const rightFields = right as Record<string, unknown>
  const keys = Object.keys(leftFields)
  return keys.length === Object.keys(rightFields).length && keys.every((key) => Object.hasOwn(rightFields, key) && sameSnapshot(leftFields[key], rightFields[key], seen))
}

export function isStateResponse(value: unknown): value is StateResponse {
  return isRecord(value) && !('error' in value) && isGameState(value.state) && isText(value.message)
}

export function isCoreResponse<M extends CoreMethod>(method: M, input: unknown): input is CoreResponses[M]
export function isCoreResponse(method: unknown, input: unknown): input is CoreResponses[CoreMethod]
export function isCoreResponse(method: unknown, input: unknown): input is CoreResponses[CoreMethod] {
  if (!isCoreMethod(method) || !isRecord(input) || 'error' in input || !isGameState(input.state)) return false
  const state = input.state
  switch (method) {
    case 'initialize_game': return isStateResponse(input) && state.phase === 'idle' && state.company.status === 'running' && state.company.week === 0 && state.history.length === 0
    case 'start_project': return isStateResponse(input) && state.phase === 'producing' && state.project !== null
      && state.project.current_stage === 'script' && state.project.stages.script.status === 'ready' && state.project.start_week === state.company.week
    case 'apply_decision': return isStateResponse(input) && state.company.status !== 'ended'
    case 'resolve_event': return isStateResponse(input) && (state.phase === 'producing' || state.phase === 'project_ready')
    case 'advance_week': return isWeekReport(input.report) && input.report.week === state.company.week
      && ['idle', 'producing', 'event_pending', 'project_ready'].includes(state.phase)
    case 'calculate_result': {
      if (input.scope === 'project') return state.phase === 'project_settled' && isWorkRecord(input.result)
        && input.result.id === state.last_project_id && sameSnapshot(input.result, state.history.find(({ id }) => id === state.last_project_id))
      return input.scope === 'company' && state.phase === 'company_ended' && isCompanyResult(input.result) && sameSnapshot(input.result, state.company_result)
    }
  }
}

export function isCoreError(value: unknown): value is CoreError {
  return isRecord(value) && !('state' in value) && isRecord(value.error)
    && choice(value.error.code, ['INVALID_INPUT', 'INVALID_PHASE', 'INSUFFICIENT_BUDGET', 'STAGE_LOCKED', 'MODE_NOT_ALLOWED', 'CAPACITY_EXCEEDED', 'COMPANY_ENDED', 'INTERNAL_ERROR'])
    && isText(value.error.message)
}
