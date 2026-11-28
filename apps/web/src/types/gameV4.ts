export const V4_DIMENSIONS = ['story', 'direction', 'drawing', 'animation', 'art', 'sound'] as const
export const V4_WINDOWS = ['domestic_streaming', 'overseas', 'merchandise', 'music', 'tv', 'bd_dvd'] as const
export const V4_PARTNERSHIP_CHANNELS = [...V4_WINDOWS, 'publishing'] as const
export const V4_WORK_COST_CATEGORIES = ['salary', 'production', 'temporary', 'outsourcing', 'events', 'extension', 'distribution', 'penalty', 'development'] as const

export type V4Dimension = typeof V4_DIMENSIONS[number]
export type V4Window = typeof V4_WINDOWS[number]
export type V4PartnershipChannel = typeof V4_PARTNERSHIP_CHANNELS[number]
export type V4WorkCostCategory = typeof V4_WORK_COST_CATEGORIES[number]
export type V4WorkRating = 'S' | 'A' | 'B' | 'C' | 'D'
export type V4CompanyEndReason = 'time_limit' | 'bankrupt' | 'voluntary'
export type V4DeliveryReason = 'completed' | 'deadline' | 'company_closed' | 'aborted'
export const V4_WORK_SOURCES = ['publisher', 'studio', 'manga', 'light_novel', 'game', 'original', 'market'] as const
export type V4WorkSource = typeof V4_WORK_SOURCES[number]
export type V4Scale = 'ova' | 'short' | 'tv' | 'movie'
export type V4CooperationMode = 'contract' | 'committee'
export const V4_STAFF_ROLES = ['director', 'scriptwriter', 'animation_director', 'key_animator', 'animator', 'production_manager', 'postproduction',
  '作画', '演出', '脚本', '摄影', '监督', '音乐', '声优', '美术'] as const
export type V4StaffRole = typeof V4_STAFF_ROLES[number]

export interface V4Quality {
  dims: Record<V4Dimension, number>
  mean: number
}

export interface V4ChannelRevenue {
  window: V4Window
  potential: number
  quality_factor: number
  heat_factor: number
  reputation_factor: number
  tv_multiplier: number
  agency_fee_permille: number
  gross: number
  net: number
  revenue: number
  company_received: number
  owner: 'company' | 'committee_pool'
}

export interface V4FinanceSummary {
  contract_received: number
  contract_refund: number
  investment_paid: number
  commercial_share: number
  bd_revenue: number
  success_reward: number
  penalty: number
  costs: Partial<Record<V4WorkCostCategory, number>>
  total_costs: number
  profit: number
}

export interface V4EpisodeRecord {
  id: string
  quality: V4Quality
}

export interface V4TeamMember {
  id: string
  name: string
  role: V4StaffRole
}

export interface V4WorkRecord {
  id: string
  ip_id: string | null
  offer_id: string
  name: string
  source: V4WorkSource
  genre: string
  scale: V4Scale
  mode: V4CooperationMode
  investment_percent: number
  start_week: number
  end_week: number
  end_reason: V4DeliveryReason
  status: 'DELIVERED' | 'ABORTED'
  forced: boolean
  gate_completion_permille: number
  aborted_week: number | null
  penalty_paid: number
  quality: V4Quality
  quality_score: number
  rating: V4WorkRating
  commercial_revenue: number
  bd_gross: number
  bd_revenue: number
  committee_pool: number
  investor_share: number
  company_received: number
  finance_summary: V4FinanceSummary
  channel_breakdown: V4ChannelRevenue[]
  episodes: V4EpisodeRecord[]
  team: V4TeamMember[]
  rules_status: 'placeholder'
}

const V4_COMPANY_ABILITIES = ['planning', 'direction', 'drawing', 'animation', 'management', 'postproduction'] as const
export type V4CompanyAbilityScores = Record<typeof V4_COMPANY_ABILITIES[number], number>
export type V4CompanyAbilityFlags = Record<typeof V4_COMPANY_ABILITIES[number], boolean>
export type V4CompanyEvaluationCode = 'masterpiece' | 'quality_portfolio' | 'commercial_success' | 'sustainable_profit'
  | 'industry_influence' | 'team_growth' | 'productive_company' | 'bankruptcy' | 'cash_burn' | 'unfinished_works'
  | 'no_deliveries' | 'project_losses'

export interface V4CompanyOverall {
  score: number
  max_score: number
  quality: number
  finance: number
  influence: number
  team: number
  base_ending: V4WorkRating
  achievement_promotions: number
  ending: V4WorkRating
  evaluation_model: { id: 'm5_company_v1', status: 'candidate' }
}

export interface V4CompanyCommercial {
  completed_projects: number
  unfinished_projects: number
  gross_revenue: number
  company_revenue: number
  project_profit: number
}

export interface V4CompanyCoreMember {
  id: string
  name: string
  role: V4StaffRole
  abilities: V4CompanyAbilityScores
  experience: V4CompanyAbilityScores
  revealed_potential: V4CompanyAbilityFlags
  maxed_dimensions: typeof V4_COMPANY_ABILITIES[number][]
  representative_work_id: string | null
  works: string[]
}

export interface V4CompanyTeam {
  core_staff_count: number
  temporary_staff_count: number
  average_ability: number
  current_experience: number
  revealed_potential_dimensions: number
  maxed_dimensions: number
  core_members: V4CompanyCoreMember[]
}

export interface V4CompanyBestWork {
  id: string
  name: string
  rating: V4WorkRating
  quality_score: number
  team: V4TeamMember[]
}

export interface V4CompanyEvaluation {
  code: V4CompanyEvaluationCode
  label: string
  polarity: 'positive' | 'negative'
}

export interface V4CompanyResult {
  reason: V4CompanyEndReason
  weeks: number
  final_funds: number
  net_cash_change: number
  total_projects: number
  best_work_id: string | null
  rating: V4WorkRating
  overall: V4CompanyOverall
  commercial: V4CompanyCommercial
  reputation: number
  team: V4CompanyTeam
  best_work: V4CompanyBestWork | null
  evaluations: V4CompanyEvaluation[]
  highlights: string[]
  negatives: string[]
}

export interface V4ReputationProfile {
  tier: number
  tier_label: string
  industry_position: string
  range: { min: number; max: number | null }
  next_tier: { tier: number; min_reputation: number } | null
  temporary_ability_range: { min: number; max: number }
  flexible_staff_capacity: number
}

export interface V4Series {
  ip_id: string
  title: string
  works: string[]
  last_week: number
}

export interface V4Archive {
  works: V4WorkRecord[]
  series: V4Series[]
  company_result: V4CompanyResult | null
}

export interface V4CompanyResultState {
  company: { status: 'running' | 'closing' | 'ended'; week: number; reputation: number; end_reason: V4CompanyEndReason | null }
  finance: { opening_funds: number; balance: number }
  staff: {
    id: string
    name: string
    role: string
    employment: 'core' | 'temporary'
    abilities: V4CompanyAbilityScores
    experience: V4CompanyAbilityScores
    potential: V4CompanyAbilityScores
    revealed_potential: V4CompanyAbilityFlags
  }[]
}

export type CompanyResult = V4CompanyResult
export type WorkRecord = V4WorkRecord
export type Archive = V4Archive

const maxInteger = Number.MAX_SAFE_INTEGER
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const integer = (value: unknown, min = 0, max = maxInteger): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max
const signed = (value: unknown): value is number => integer(value, -maxInteger)
const score = (value: unknown): value is number => integer(value, 0, 100)
const week = (value: unknown): value is number => integer(value, 0, 520)
const choice = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === 'string' && values.includes(value as T)
const nullableText = (value: unknown): value is string | null => value === null || isText(value)
const unique = (values: readonly string[]) => new Set(values).size === values.length
const exactFields = (value: unknown, fields: readonly string[]): value is Record<string, unknown> => isRecord(value)
  && Object.keys(value).length === fields.length && fields.every((field) => Object.hasOwn(value, field))
const arrayOf = <T>(value: unknown, guard: (item: unknown) => item is T): value is T[] => Array.isArray(value) && value.every(guard)
const safeIntegerFromBigInt = (value: bigint): number | null => value >= BigInt(-maxInteger) && value <= BigInt(maxInteger) ? Number(value) : null
const sumSafeIntegers = (values: readonly number[]): number | null => safeIntegerFromBigInt(values.reduce((sum, value) => sum + BigInt(value), 0n))

const ratingOf = (score: number): V4WorkRating => score >= 85 ? 'S' : score >= 75 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : 'D'

export const isV4Quality = (value: unknown): value is V4Quality => {
  if (!exactFields(value, ['dims', 'mean'])) return false
  const dims = value.dims
  return exactFields(dims, V4_DIMENSIONS) && V4_DIMENSIONS.every((dimension) => score(dims[dimension]))
    && score(value.mean) && value.mean === Math.round(V4_DIMENSIONS.reduce((sum, dimension) => sum + (dims[dimension] as number), 0) / 6)
}

const isV4ChannelRevenue = (value: unknown): value is V4ChannelRevenue => exactFields(value,
  ['window', 'potential', 'quality_factor', 'heat_factor', 'reputation_factor', 'tv_multiplier', 'agency_fee_permille', 'gross', 'net', 'revenue', 'company_received', 'owner'])
  && choice(value.window, V4_WINDOWS) && integer(value.potential)
  && integer(value.quality_factor, 0, 1000) && integer(value.heat_factor, 0, 2000)
  && integer(value.reputation_factor, 0, 2000) && integer(value.tv_multiplier, 0, 2000)
  && integer(value.agency_fee_permille, 0, 1000) && integer(value.gross) && integer(value.net, 0, value.gross as number)
  && integer(value.revenue) && value.revenue === value.gross && integer(value.company_received, 0, value.net as number)
  && (value.window === 'bd_dvd' ? value.owner === 'company' : value.owner === 'committee_pool')

const isV4FinanceSummary = (value: unknown): value is V4FinanceSummary => exactFields(value,
  ['contract_received', 'contract_refund', 'investment_paid', 'commercial_share', 'bd_revenue', 'success_reward', 'penalty', 'costs', 'total_costs', 'profit'])
  && integer(value.contract_received) && integer(value.contract_refund) && integer(value.investment_paid) && integer(value.commercial_share)
  && integer(value.bd_revenue, 0, value.commercial_share as number) && integer(value.success_reward) && integer(value.penalty)
  && isRecord(value.costs) && Object.entries(value.costs).every(([category, amount]) => choice(category, V4_WORK_COST_CATEGORIES) && integer(amount))
  && integer(value.total_costs) && value.total_costs === Object.values(value.costs).reduce<number>((sum, amount) => sum + (amount as number), 0)
  && signed(value.profit) && value.profit === safeIntegerFromBigInt(BigInt(value.contract_received) - BigInt(value.contract_refund)
    + BigInt(value.commercial_share) + BigInt(value.success_reward) - BigInt(value.investment_paid) - BigInt(value.total_costs))

const isV4EpisodeRecord = (value: unknown): value is V4EpisodeRecord => exactFields(value, ['id', 'quality']) && isText(value.id) && isV4Quality(value.quality)
const isV4TeamMember = (value: unknown): value is V4TeamMember => exactFields(value, ['id', 'name', 'role'])
  && isText(value.id) && isText(value.name) && choice(value.role, V4_STAFF_ROLES)

export const isV4WorkRecord = (value: unknown): value is V4WorkRecord => {
  if (!exactFields(value, ['id', 'ip_id', 'offer_id', 'name', 'source', 'genre', 'scale', 'mode', 'investment_percent',
    'start_week', 'end_week', 'end_reason', 'status', 'forced',
    'gate_completion_permille', 'aborted_week', 'penalty_paid', 'quality', 'quality_score', 'rating',
    'commercial_revenue', 'bd_gross', 'bd_revenue', 'committee_pool', 'investor_share', 'company_received', 'finance_summary',
    'channel_breakdown', 'episodes', 'team', 'rules_status'])) return false
  if (!isText(value.id) || !nullableText(value.ip_id) || !isText(value.offer_id) || !isText(value.name)
    || !choice(value.source, V4_WORK_SOURCES) || !isText(value.genre)
    || !choice(value.scale, ['ova', 'short', 'tv', 'movie']) || !choice(value.mode, ['contract', 'committee'])
    || !integer(value.investment_percent, 0, 100) || (value.mode === 'contract' ? value.investment_percent !== 0 : value.investment_percent < 10 || value.investment_percent % 10 !== 0)
    || !week(value.start_week) || !week(value.end_week) || value.end_week < value.start_week
    || !choice(value.end_reason, ['completed', 'deadline', 'company_closed', 'aborted'])
    || !choice(value.status, ['DELIVERED', 'ABORTED']) || typeof value.forced !== 'boolean'
    || !integer(value.gate_completion_permille, 0, 1000)
    || !(value.end_reason === 'aborted'
      ? value.status === 'ABORTED' && week(value.aborted_week) && value.aborted_week === value.end_week && integer(value.penalty_paid)
      : value.status === 'DELIVERED' && value.aborted_week === null) || !isV4Quality(value.quality) || !score(value.quality_score)
    || !choice(value.rating, ['S', 'A', 'B', 'C', 'D']) || value.rating !== ratingOf(value.quality_score)
    || !integer(value.commercial_revenue) || !integer(value.bd_gross) || !integer(value.bd_revenue)
    || !integer(value.committee_pool) || !integer(value.investor_share) || !integer(value.company_received)
    || !isV4FinanceSummary(value.finance_summary) || !arrayOf(value.channel_breakdown, isV4ChannelRevenue)
    || !arrayOf(value.episodes, isV4EpisodeRecord) || value.episodes.length === 0
    || !unique(value.episodes.map(({ id }) => id)) || !arrayOf(value.team, isV4TeamMember)
    || !unique(value.team.map(({ id }) => id)) || value.rules_status !== 'placeholder') return false
  if (value.finance_summary.penalty !== value.penalty_paid || value.finance_summary.bd_revenue !== value.bd_revenue) return false
  if (value.end_reason === 'completed' && (value.forced || value.gate_completion_permille !== 1000)) return false
  if (!unique(value.channel_breakdown.map(({ window }) => window))) return false
  if (value.channel_breakdown.reduce((sum, line) => sum + line.revenue, 0) !== value.commercial_revenue) return false
  if (value.channel_breakdown.reduce((sum, line) => sum + line.company_received, 0) !== value.finance_summary.commercial_share) return false
  if (value.channel_breakdown.filter(({ window }) => window === 'bd_dvd').reduce((sum, line) => sum + line.gross, 0) !== value.bd_gross) return false
  if (value.channel_breakdown.filter(({ window }) => window === 'bd_dvd').reduce((sum, line) => sum + line.net, 0) !== value.bd_revenue) return false
  const committeePool = value.channel_breakdown.filter(({ window }) => window !== 'bd_dvd').reduce((sum, line) => sum + line.net, 0)
  if (committeePool !== value.committee_pool) return false
  if (value.investor_share !== committeePool - (value.finance_summary.commercial_share - value.bd_revenue)) return false
  if (value.finance_summary.commercial_share + value.finance_summary.success_reward !== value.company_received) return false
  return true
}

const V4_COMPANY_ENDINGS = ['D', 'C', 'B', 'A', 'S'] as const
const V4_COMPANY_POSITIVE_EVALUATIONS = ['masterpiece', 'quality_portfolio', 'commercial_success', 'sustainable_profit',
  'industry_influence', 'team_growth', 'productive_company'] as const
const V4_COMPANY_NEGATIVE_EVALUATIONS = ['bankruptcy', 'cash_burn', 'unfinished_works', 'no_deliveries', 'project_losses'] as const
const maxCompanyExperience = 2_147_483_647

const companyAbilityScores = (value: unknown, maximum = 100): value is V4CompanyAbilityScores => exactFields(value, V4_COMPANY_ABILITIES)
  && V4_COMPANY_ABILITIES.every((ability) => integer(value[ability], 0, maximum))
const companyAbilityFlags = (value: unknown): value is V4CompanyAbilityFlags => exactFields(value, V4_COMPANY_ABILITIES)
  && V4_COMPANY_ABILITIES.every((ability) => typeof value[ability] === 'boolean')
const companyBaseEnding = (score: number): V4WorkRating => score >= 56 ? 'S' : score >= 48 ? 'A' : score >= 36 ? 'B' : score >= 24 ? 'C' : 'D'

const isV4CompanyOverall = (value: unknown, reason: V4CompanyEndReason): value is V4CompanyOverall => {
  if (!exactFields(value, ['score', 'max_score', 'quality', 'finance', 'influence', 'team', 'base_ending',
    'achievement_promotions', 'ending', 'evaluation_model'])) return false
  if (!integer(value.score, 0, 70) || value.max_score !== 70 || !integer(value.quality, 0, 20)
    || !integer(value.finance, 0, 20) || !integer(value.influence, 0, 15) || !integer(value.team, 0, 15)
    || value.score !== (value.quality as number) + (value.finance as number) + (value.influence as number) + (value.team as number)
    || !choice(value.base_ending, V4_COMPANY_ENDINGS) || !integer(value.achievement_promotions, 0, 5)
    || !choice(value.ending, V4_COMPANY_ENDINGS)
    || !exactFields(value.evaluation_model, ['id', 'status']) || value.evaluation_model.id !== 'm5_company_v1'
    || value.evaluation_model.status !== 'candidate') return false
  const base = reason === 'bankrupt' ? 'D' : companyBaseEnding(value.score)
  if (value.base_ending !== base) return false
  const ending = reason === 'bankrupt' ? 'D'
    : V4_COMPANY_ENDINGS[Math.min(4, V4_COMPANY_ENDINGS.indexOf(value.base_ending) + (value.achievement_promotions as number))]
  return value.ending === ending
}

const isV4CompanyCommercial = (value: unknown): value is V4CompanyCommercial => exactFields(value,
  ['completed_projects', 'unfinished_projects', 'gross_revenue', 'company_revenue', 'project_profit'])
  && integer(value.completed_projects) && integer(value.unfinished_projects)
  && integer(value.gross_revenue) && integer(value.company_revenue) && signed(value.project_profit)

const isV4CompanyCoreMember = (value: unknown): value is V4CompanyCoreMember => {
  if (!exactFields(value, ['id', 'name', 'role', 'abilities', 'experience', 'revealed_potential', 'maxed_dimensions',
    'representative_work_id', 'works']) || !isText(value.id) || !isText(value.name) || !choice(value.role, V4_STAFF_ROLES)
    || !companyAbilityScores(value.abilities) || !companyAbilityScores(value.experience, maxCompanyExperience)
    || !companyAbilityFlags(value.revealed_potential) || !arrayOf(value.maxed_dimensions, (ability) => choice(ability, V4_COMPANY_ABILITIES))
    || !unique(value.maxed_dimensions) || !nullableText(value.representative_work_id)
    || !arrayOf(value.works, isText) || !unique(value.works)) return false
  return value.representative_work_id === null ? value.works.length === 0 : value.works.includes(value.representative_work_id)
}

const isV4CompanyTeam = (value: unknown): value is V4CompanyTeam => {
  if (!exactFields(value, ['core_staff_count', 'temporary_staff_count', 'average_ability', 'current_experience',
    'revealed_potential_dimensions', 'maxed_dimensions', 'core_members']) || !integer(value.core_staff_count)
    || !integer(value.temporary_staff_count) || !integer(value.average_ability, 0, 100)
    || !integer(value.current_experience, 0, maxInteger) || !integer(value.revealed_potential_dimensions)
    || !integer(value.maxed_dimensions) || !arrayOf(value.core_members, isV4CompanyCoreMember)
    || !unique(value.core_members.map(({ id }) => id)) || value.core_staff_count !== value.core_members.length) return false
  const abilities = value.core_members.reduce((sum, member) => sum
    + V4_COMPANY_ABILITIES.reduce((total, ability) => total + member.abilities[ability], 0), 0)
  const average = value.core_members.length === 0 ? 0 : Math.floor(abilities / (value.core_members.length * 6))
  const experience = value.core_members.reduce((sum, member) => sum
    + V4_COMPANY_ABILITIES.reduce((total, ability) => total + member.experience[ability], 0), 0)
  const revealed = value.core_members.reduce((sum, member) => sum
    + V4_COMPANY_ABILITIES.filter((ability) => member.revealed_potential[ability]).length, 0)
  const maxed = value.core_members.reduce((sum, member) => sum + member.maxed_dimensions.length, 0)
  return value.average_ability === average && value.current_experience === experience
    && value.revealed_potential_dimensions === revealed && value.maxed_dimensions === maxed
}

const isV4CompanyBestWork = (value: unknown): value is V4CompanyBestWork => exactFields(value,
  ['id', 'name', 'rating', 'quality_score', 'team']) && isText(value.id) && isText(value.name)
  && integer(value.quality_score, 0, 100) && choice(value.rating, ['S', 'A', 'B', 'C', 'D'])
  && value.rating === ratingOf(value.quality_score) && arrayOf(value.team, isV4TeamMember)
  && unique(value.team.map(({ id }) => id))

const isV4CompanyEvaluation = (value: unknown): value is V4CompanyEvaluation => exactFields(value, ['code', 'label', 'polarity'])
  && isText(value.label) && (choice(value.code, V4_COMPANY_POSITIVE_EVALUATIONS) && value.polarity === 'positive'
    || choice(value.code, V4_COMPANY_NEGATIVE_EVALUATIONS) && value.polarity === 'negative')

export const isV4CompanyResult = (value: unknown): value is V4CompanyResult => {
  if (!exactFields(value, ['reason', 'weeks', 'final_funds', 'net_cash_change', 'total_projects', 'best_work_id', 'rating',
    'overall', 'commercial', 'reputation', 'team', 'best_work', 'evaluations', 'highlights', 'negatives'])
    || !choice(value.reason, ['time_limit', 'bankrupt', 'voluntary']) || !week(value.weeks)
    || (value.reason === 'time_limit' && value.weeks !== 520)
    || (value.reason === 'bankrupt' ? !signed(value.final_funds) : !integer(value.final_funds)) || !signed(value.net_cash_change)
    || !integer(value.total_projects) || !nullableText(value.best_work_id) || !choice(value.rating, ['S', 'A', 'B', 'C', 'D'])
    || !isV4CompanyOverall(value.overall, value.reason) || !isV4CompanyCommercial(value.commercial)
    || !integer(value.reputation) || !isV4CompanyTeam(value.team)
    || !(value.best_work === null || isV4CompanyBestWork(value.best_work))
    || !arrayOf(value.evaluations, isV4CompanyEvaluation) || !unique(value.evaluations.map(({ code }) => code))
    || !arrayOf(value.highlights, isText) || !arrayOf(value.negatives, isText)) return false
  if (value.commercial.completed_projects + value.commercial.unfinished_projects !== value.total_projects) return false
  if (value.best_work_id === null) return value.best_work === null
  return value.best_work !== null && value.best_work.id === value.best_work_id
}

const isV4Series = (value: unknown): value is V4Series => exactFields(value, ['ip_id', 'title', 'works', 'last_week'])
  && isText(value.ip_id) && isText(value.title) && arrayOf(value.works, isText) && value.works.length > 0
  && unique(value.works) && week(value.last_week)

const companyScaledRatio = (value: number, divisor: number, maximum: number): number => {
  if (divisor <= 0) return value >= 0 ? maximum : 0
  if (value <= 0) return 0
  const whole = Math.floor(value / divisor)
  if (whole >= maximum) return maximum
  const remainder = value % divisor
  let accumulated = 0
  let fraction = 0
  for (let step = 0; step < maximum && remainder > 0; step++) {
    if (accumulated >= divisor - remainder) {
      accumulated -= divisor - remainder
      fraction++
    } else {
      accumulated += remainder
    }
  }
  return Math.min(maximum, whole * maximum + fraction)
}

const reputationTiers = [
  { min: 0, max: 99, position: '信用受损 / 边缘作坊' },
  { min: 100, max: 249, position: '初创工作室' },
  { min: 250, max: 599, position: '新锐工作室' },
  { min: 600, max: 1_999, position: '稳健制作公司' },
  { min: 2_000, max: 9_999, position: '知名实力厂牌' },
  { min: 10_000, max: 59_999, position: '一线头部大厂' },
  { min: 60_000, max: 299_999, position: '超一线行业巨头' },
  { min: 300_000, max: null, position: '国民级 / 殿堂级传奇' },
] as const

export const companyReputationProfile = (reputation: number): V4ReputationProfile => {
  let tier = 0
  for (let index = 1; index < reputationTiers.length; index++) {
    if (reputation < reputationTiers[index].min) break
    tier = index
  }
  const definition = reputationTiers[tier]
  const next = reputationTiers[tier + 1]
  return {
    tier,
    tier_label: `T${tier}`,
    industry_position: definition.position,
    range: { min: definition.min, max: definition.max },
    next_tier: next ? { tier: tier + 1, min_reputation: next.min } : null,
    temporary_ability_range: tier <= 1 ? { min: 42, max: 52 } : tier <= 4 ? { min: 56, max: 65 } : { min: 66, max: 74 },
    flexible_staff_capacity: tier <= 1 ? 1 : tier <= 3 ? 2 : tier <= 5 ? 3 : 4,
  }
}

const companyReputationTier = (reputation: number): number => companyReputationProfile(reputation).tier

const sameStrings = (left: readonly string[], right: readonly string[]) => left.length === right.length
  && left.every((entry, index) => entry === right[index])
const sameCompanyAbilities = (left: V4CompanyAbilityScores, right: V4CompanyAbilityScores) => V4_COMPANY_ABILITIES
  .every((ability) => left[ability] === right[ability])
const sameCompanyFlags = (left: V4CompanyAbilityFlags, right: V4CompanyAbilityFlags) => V4_COMPANY_ABILITIES
  .every((ability) => left[ability] === right[ability])

const companyTeamFromState = (state: V4CompanyResultState, archive: V4Archive): V4CompanyTeam | null => {
  const core = state.staff.filter((member) => member.employment === 'core')
  const records = new Map(archive.works.map((work) => [work.id, work]))
  const memberWorks = new Map<string, string[]>()
  for (const work of archive.works) {
    for (const member of work.team) {
      const works = memberWorks.get(member.id) ?? []
      works.push(work.id)
      memberWorks.set(member.id, works)
    }
  }
  let abilityTotal = 0n
  let experienceTotal = 0n
  const coreMembers = core.map((member) => {
    for (const ability of V4_COMPANY_ABILITIES) {
      abilityTotal += BigInt(member.abilities[ability])
      experienceTotal += BigInt(member.experience[ability])
    }
    const works = memberWorks.get(member.id) ?? []
    let representative: string | null = null
    let representativeScore = -1
    for (const id of works) {
      const score = records.get(id)!.quality_score
      if (score > representativeScore) {
        representative = id
        representativeScore = score
      }
    }
    return {
      id: member.id,
      name: member.name,
      role: member.role as V4StaffRole,
      abilities: member.abilities,
      experience: member.experience,
      revealed_potential: member.revealed_potential,
      maxed_dimensions: V4_COMPANY_ABILITIES.filter((ability) => member.abilities[ability] >= member.potential[ability]),
      representative_work_id: representative,
      works,
    }
  })
  const currentExperience = safeIntegerFromBigInt(experienceTotal)
  if (currentExperience === null) return null
  return {
    core_staff_count: core.length,
    temporary_staff_count: state.staff.length - core.length,
    average_ability: core.length === 0 ? 0 : Number(abilityTotal / BigInt(core.length * V4_COMPANY_ABILITIES.length)),
    current_experience: currentExperience,
    revealed_potential_dimensions: coreMembers.reduce((sum, member) => sum
      + V4_COMPANY_ABILITIES.filter((ability) => member.revealed_potential[ability]).length, 0),
    maxed_dimensions: coreMembers.reduce((sum, member) => sum + member.maxed_dimensions.length, 0),
    core_members: coreMembers,
  }
}

const sameCompanyTeam = (left: V4CompanyTeam, right: V4CompanyTeam): boolean => left.core_staff_count === right.core_staff_count
  && left.temporary_staff_count === right.temporary_staff_count && left.average_ability === right.average_ability
  && left.current_experience === right.current_experience && left.revealed_potential_dimensions === right.revealed_potential_dimensions
  && left.maxed_dimensions === right.maxed_dimensions && left.core_members.length === right.core_members.length
  && left.core_members.every((member, index) => {
    const expected = right.core_members[index]
    return member.id === expected.id && member.name === expected.name && member.role === expected.role
      && sameCompanyAbilities(member.abilities, expected.abilities) && sameCompanyAbilities(member.experience, expected.experience)
      && sameCompanyFlags(member.revealed_potential, expected.revealed_potential)
      && sameStrings(member.maxed_dimensions, expected.maxed_dimensions)
      && member.representative_work_id === expected.representative_work_id && sameStrings(member.works, expected.works)
  })

const companyResultMatchesArchive = (archive: V4Archive, state?: V4CompanyResultState): boolean => {
  const result = archive.company_result
  if (result === null) return true
  let teamSummary = result.team
  let openingFunds = result.final_funds - result.net_cash_change
  if (state) {
    const netCashChange = state.finance.balance - state.finance.opening_funds
    const expectedTeam = companyTeamFromState(state, archive)
    if (state.company.status !== 'ended' || state.company.end_reason === null
      || !Number.isSafeInteger(netCashChange) || expectedTeam === null || !sameCompanyTeam(result.team, expectedTeam)
      || result.reason !== state.company.end_reason || result.weeks !== state.company.week
      || result.final_funds !== state.finance.balance || result.net_cash_change !== netCashChange
      || result.reputation !== state.company.reputation) return false
    teamSummary = expectedTeam
    openingFunds = state.finance.opening_funds
  }
  const completed = archive.works.filter((work) => work.end_reason !== 'aborted' && !work.forced)
  const unfinished = archive.works.length - completed.length
  const qualitySum = sumSafeIntegers(archive.works.map((work) => work.quality_score))
  const grossRevenue = sumSafeIntegers(archive.works.map((work) => work.commercial_revenue))
  const companyRevenue = sumSafeIntegers(archive.works.map((work) => work.finance_summary.commercial_share))
  const projectProfit = sumSafeIntegers(archive.works.map((work) => work.finance_summary.profit))
  if (qualitySum === null || grossRevenue === null || companyRevenue === null || projectProfit === null) return false
  if (result.commercial.completed_projects !== completed.length || result.commercial.unfinished_projects !== unfinished
    || result.commercial.gross_revenue !== grossRevenue || result.commercial.company_revenue !== companyRevenue
    || result.commercial.project_profit !== projectProfit) return false

  let best: V4WorkRecord | undefined
  let bestFinishedScore = -1
  for (const work of archive.works) {
    if (!best || work.quality_score > best.quality_score) best = work
    if (work.end_reason !== 'aborted' && !work.forced) bestFinishedScore = Math.max(bestFinishedScore, work.quality_score)
  }
  if (result.best_work_id !== (best?.id ?? null)) return false
  if (best === undefined) {
    if (result.best_work !== null) return false
  } else if (result.best_work === null || result.best_work.id !== best.id || result.best_work.name !== best.name
    || result.best_work.rating !== best.rating || result.best_work.quality_score !== best.quality_score
    || JSON.stringify(result.best_work.team) !== JSON.stringify(best.team)) return false

  for (const member of teamSummary.core_members) {
    const workIds = archive.works.filter((work) => work.team.some((entry) => entry.id === member.id)).map((work) => work.id)
    if (!sameStrings(member.works, workIds)) return false
    let representative: string | null = null
    let representativeScore = -1
    for (const id of workIds) {
      const work = archive.works.find((entry) => entry.id === id)!
      if (work.quality_score > representativeScore) {
        representative = id
        representativeScore = work.quality_score
      }
    }
    if (member.representative_work_id !== representative) return false
  }

  const average = archive.works.length === 0 ? 0 : Math.floor(qualitySum / archive.works.length)
  if (result.rating !== ratingOf(average)) return false
  const quality = Math.floor(average * 20 / 100)
  if (!Number.isSafeInteger(openingFunds) || openingFunds < 0) return false
  let finance = 10
  if (result.net_cash_change > 0) finance += companyScaledRatio(result.net_cash_change, openingFunds, 10)
  else if (result.net_cash_change < 0) finance = openingFunds <= 0 ? 0 : Math.max(0, 10 - companyScaledRatio(-result.net_cash_change, openingFunds, 10))
  const reputationTier = companyReputationTier(result.reputation)
  const influence = 5 + Math.min(5, reputationTier) + Math.min(5, Math.ceil(completed.length / 4))
  const averageExperience = teamSummary.core_staff_count === 0 ? 0 : Math.floor(teamSummary.current_experience / teamSummary.core_staff_count)
  const maturity = teamSummary.core_staff_count === 0 ? 0 : Math.min(5, Math.ceil(averageExperience / 200))
  const team = Math.floor(teamSummary.average_ability * 10 / 100) + maturity
  const score = quality + finance + influence + team
  const baseEnding: V4WorkRating = result.reason === 'bankrupt' ? 'D' : companyBaseEnding(score)

  const evaluations: V4CompanyEvaluation[] = []
  let promotions = 0
  const evaluate = (code: V4CompanyEvaluationCode, label: string, polarity: 'positive' | 'negative') => evaluations.push({ code, label, polarity })
  if (bestFinishedScore >= 90) {
    evaluate('masterpiece', '诞生 S 级代表作', 'positive')
    promotions += 2
  }
  if (archive.works.length > 0 && average >= 75) evaluate('quality_portfolio', '作品平均质量达到 A 档', 'positive')
  if (companyRevenue > 0 && Math.floor(companyRevenue / 5) >= openingFunds) {
    evaluate('commercial_success', '累计公司商业收入超过初始资金 5 倍', 'positive')
    promotions++
  }
  if (projectProfit > 0 && Math.floor(projectProfit / 2) >= openingFunds) {
    evaluate('sustainable_profit', '累计项目利润超过初始资金 2 倍', 'positive')
    promotions++
  }
  if (reputationTier >= 5) {
    evaluate('industry_influence', '声望达到 T5 及以上', 'positive')
    promotions++
  }
  if (teamSummary.current_experience > 0 || teamSummary.revealed_potential_dimensions > 0 || teamSummary.maxed_dimensions > 0) {
    evaluate('team_growth', '核心团队仍有成长积累', 'positive')
  }
  if (completed.length >= 5) evaluate('productive_company', '正常完成至少 5 部作品', 'positive')
  if (result.reason === 'bankrupt') evaluate('bankruptcy', '资金链断裂，公司破产清算', 'negative')
  if (result.net_cash_change < 0) evaluate('cash_burn', '公司现金净流出', 'negative')
  if (unfinished > 0) evaluate('unfinished_works', '存在未正常完成的作品', 'negative')
  if (archive.works.length === 0) evaluate('no_deliveries', '没有形成作品归档', 'negative')
  if (projectProfit < 0) evaluate('project_losses', '累计项目利润为负', 'negative')
  promotions = Math.min(5, promotions)
  const ending = result.reason === 'bankrupt' ? 'D'
    : V4_COMPANY_ENDINGS[Math.min(4, V4_COMPANY_ENDINGS.indexOf(baseEnding) + promotions)]

  const overall = result.overall
  if (overall.score !== score || overall.quality !== quality || overall.finance !== finance || overall.influence !== influence
    || overall.team !== team || overall.base_ending !== baseEnding || overall.achievement_promotions !== promotions || overall.ending !== ending) return false
  if (JSON.stringify(result.evaluations) !== JSON.stringify(evaluations)) return false
  const highlights: string[] = []
  const negatives: string[] = []
  if (best) highlights.push(`最佳作品：${best.name}（${ratingOf(best.quality_score)}）`)
  if (archive.works.length > 0 && average >= 75) highlights.push('作品平均质量达到 A 档')
  if (result.reason === 'bankrupt') negatives.push('资金链断裂，公司破产清算')
  if (unfinished > 0) negatives.push(`${unfinished} 部作品未正常完成`)
  return sameStrings(result.highlights, highlights) && sameStrings(result.negatives, negatives)
}

export const companyResultMatchesState = (archive: V4Archive, state: V4CompanyResultState): boolean => companyResultMatchesArchive(archive, state)

export const isV4Archive = (value: unknown): value is V4Archive => {
  if (!exactFields(value, ['works', 'series', 'company_result']) || !arrayOf(value.works, isV4WorkRecord)
    || !unique(value.works.map(({ id }) => id)) || !arrayOf(value.series, isV4Series)
    || !unique(value.series.map(({ ip_id }) => ip_id)) || !(value.company_result === null || isV4CompanyResult(value.company_result))) return false
  const works = new Map(value.works.map((work) => [work.id, work]))
  const seriesByIp = new Map(value.series.map((series) => [series.ip_id, series]))
  let previousEndWeek = 0
  for (const work of value.works) {
    if (work.end_week < previousEndWeek) return false
    previousEndWeek = work.end_week
    const series = work.ip_id === null ? undefined : seriesByIp.get(work.ip_id)
    if (work.end_reason !== 'aborted' && work.ip_id !== null && (!series || !series.works.includes(work.id))) return false
  }
  const listedWorks = new Set<string>()
  for (const series of value.series) {
    let latestWeek = 0
    for (const id of series.works) {
      const work = works.get(id)
      if (!work || work.end_reason === 'aborted' || work.ip_id !== series.ip_id || listedWorks.has(id) || work.end_week < latestWeek) return false
      listedWorks.add(id)
      latestWeek = work.end_week
    }
    if (series.last_week !== latestWeek) return false
  }
  for (const work of value.works) {
    if (work.end_reason !== 'aborted' && work.ip_id !== null && !listedWorks.has(work.id)) return false
  }
  if (value.company_result === null) return true
  return companyResultMatchesArchive(value as unknown as V4Archive)
}

export const isCompanyResult = isV4CompanyResult
export const isWorkRecord = isV4WorkRecord
export const isArchive = isV4Archive
