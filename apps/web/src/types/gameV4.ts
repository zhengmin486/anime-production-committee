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

export interface V4CompanyResult {
  reason: V4CompanyEndReason
  weeks: number
  final_funds: number
  net_cash_change: number
  total_projects: number
  best_work_id: string | null
  rating: V4WorkRating
  highlights: string[]
  negatives: string[]
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
  && signed(value.profit) && value.profit === (value.contract_received as number) - (value.contract_refund as number)
    + (value.commercial_share as number) + (value.success_reward as number) - (value.investment_paid as number)
    - (value.total_costs as number)

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

export const isV4CompanyResult = (value: unknown): value is V4CompanyResult => exactFields(value,
  ['reason', 'weeks', 'final_funds', 'net_cash_change', 'total_projects', 'best_work_id', 'rating', 'highlights', 'negatives'])
  && choice(value.reason, ['time_limit', 'bankrupt', 'voluntary']) && week(value.weeks)
  && (value.reason !== 'time_limit' || value.weeks === 520)
  && (value.reason === 'bankrupt' ? signed(value.final_funds) : integer(value.final_funds)) && signed(value.net_cash_change)
  && integer(value.total_projects) && nullableText(value.best_work_id) && choice(value.rating, ['S', 'A', 'B', 'C', 'D'])
  && arrayOf(value.highlights, isText) && arrayOf(value.negatives, isText)

const isV4Series = (value: unknown): value is V4Series => exactFields(value, ['ip_id', 'title', 'works', 'last_week'])
  && isText(value.ip_id) && isText(value.title) && arrayOf(value.works, isText) && value.works.length > 0
  && unique(value.works) && week(value.last_week)

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
  const result = value.company_result
  if (result.total_projects !== value.works.length) return false
  const average = value.works.length === 0 ? 0 : Math.floor(value.works.reduce((sum, work) => sum + work.quality_score, 0) / value.works.length)
  if (result.rating !== ratingOf(average)) return false
  let best: V4WorkRecord | undefined
  for (const work of value.works) if (!best || work.quality_score > best.quality_score) best = work
  return result.best_work_id === (best?.id ?? null)
}

export const isCompanyResult = isV4CompanyResult
export const isWorkRecord = isV4WorkRecord
export const isArchive = isV4Archive
