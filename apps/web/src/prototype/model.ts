/* WP10 静态原型：只描述界面要承载的信息，不代表已确认的规则与数值。
   依据 docs/CORE_GAMEPLAY_REBUILD_FRAMEWORK.md 第 5/11/12 节、docs/DECISION_LOG.md 与 docs/blueprints/tv_standard.blueprint.json。 */

export type EpisodeStage = 'content_design' | 'storyboard_key_animation' | 'animation' | 'art_visual' | 'photography_editing' | 'sound_delivery'
export type Role = 'director' | 'scriptwriter' | 'animation_director' | 'key_animator' | 'animator' | 'production_manager' | 'postproduction'
export type Ability = 'planning' | 'direction' | 'drawing' | 'animation' | 'management' | 'postproduction'
export type Source = 'manga' | 'light_novel' | 'game' | 'original'
export type Scale = 'ova' | 'short' | 'tv' | 'movie'
export type Mode = 'contract' | 'committee'
export type Channel = 'bd' | 'publisher' | 'toy' | 'music' | 'tv_broadcast'
export type Effort = 'conservative' | 'standard' | 'focused'
export type Priority = 'quality' | 'progress' | 'cost'
export type OutsourcePolicy = 'off' | 'gap' | 'active'
export type RiskLevel = 'low' | 'medium' | 'high'
export type Mark = 'confirmed' | 'proposal' | 'pending' | 'sample'

export const EPISODE_STAGES: EpisodeStage[] = ['content_design', 'storyboard_key_animation', 'animation', 'art_visual', 'photography_editing', 'sound_delivery']
export const ABILITIES: Ability[] = ['planning', 'direction', 'drawing', 'animation', 'management', 'postproduction']

/* DEC-PROD-002：六阶段属于单集制作，名称与顺序已由负责人冻结；它不是整部作品共用的一条阶段进度。 */
export const episodeStageNames: Record<EpisodeStage, string> = {
  content_design: '单集内容设计', storyboard_key_animation: '分镜与原画', animation: '动画制作',
  art_visual: '美术与视觉制作', photography_editing: '摄影与剪辑', sound_delivery: '声音与最终交付',
}
export const episodeStageShortNames: Record<EpisodeStage, string> = {
  content_design: '内容设计', storyboard_key_animation: '分镜与原画', animation: '动画',
  art_visual: '美术视觉', photography_editing: '摄影剪辑', sound_delivery: '声音交付',
}
export const roleNames: Record<Role, string> = {
  director: '导演', scriptwriter: '编剧', animation_director: '作画监督', key_animator: '原画', animator: '动画', production_manager: '制作进行', postproduction: '摄影',
}
export const abilityNames: Record<Ability, string> = {
  planning: '企划', direction: '演出', drawing: '作画', animation: '动画', management: '管理', postproduction: '后期',
}
export const sourceNames: Record<Source, string> = { manga: '漫画改编', light_novel: '轻小说改编', game: '游戏改编', original: '原创' }
export const scaleNames: Record<Scale, string> = { ova: 'OVA', short: '短篇', tv: '电视动画', movie: '剧场版' }
export const modeNames: Record<Mode, string> = { contract: '承制', committee: '制作委员会' }
export const channelNames: Record<Channel, string> = { bd: 'BD', publisher: '出版', toy: '玩具', music: '音乐', tv_broadcast: '电视' }
export const effortNames: Record<Effort, string> = { conservative: '保守', standard: '标准', focused: '集中' }
export const priorityNames: Record<Priority, string> = { quality: '质量', progress: '进度', cost: '成本' }
export const outsourceNames: Record<OutsourcePolicy, string> = { off: '不主动外包', gap: '按缺口补充', active: '积极外包' }
export const riskNames: Record<RiskLevel, string> = { low: '低', medium: '中', high: '高' }
export const markNames: Record<Mark, string> = { confirmed: '已确认', proposal: '设计建议', pending: '待细化参数', sample: '原型样本' }

export interface Company {
  name: string
  week: number
  totalWeeks: number
  cash: number
  committedNextWeek: number
  weeklyFixed: { salary: number; operations: number }
  reputation: number
  runwayWeeks: number
  headline: string
}

export interface Staff {
  id: string
  name: string
  role: Role
  employment: 'core' | 'temporary'
  abilities: Record<Ability, number>
  specialty: Ability
  fatigue: number
  morale: number
  weeklySalary: number
  projectFee: number
  departureWarning: boolean
  statusNote: string
}

/* DEC-STAFF-001 / D1：核心员工每周严格归属一个项目，不存在同周支援、借调或拆分工时。 */
export interface Allocation {
  staffId: string
  projectId: string | null
  previousProjectId: string | null
  focus: Ability
}

export interface Supplier {
  id: string
  name: string
  specialty: Ability
  weeklyCapacity: number
  reserved: number
  unitPrice: number
  reliability: number
  note: string
}

export interface OutsourceTask {
  id: string
  supplierId: string
  projectId: string
  episodeIndex: number | null
  stage: EpisodeStage | null
  itemKey: string
  ability: Ability
  workTotal: number
  workDone: number
  rush: boolean
  feePaid: number
  dueWeek: number
  status: 'active' | 'delivered' | 'at_risk'
}

/* 工作项是唯一的生产原子（DEC-PROD-003）。口径与 docs/BLUEPRINT_SPEC.md 一致：
   当前 v0.5 runtime 为 70 工作点/人周；deliverAt 是占 workTotal 的千分比门槛；
   delivered ⇔ workDone × 1000 ≥ deliverAt × workTotal。 */
export interface WorkItem {
  key: string
  name: string
  stage: EpisodeStage | null
  ability: Ability
  workTotal: number
  workDone: number
  deliverAt: number
  isGate: boolean
  deps: string[]
}

/* 每集固定六阶段；status 只描述该集整体：
   min_delivered = 门槛工作项均达最低交付、可由玩家主动交付（DEC-PROD-004）；delivered = 已执行交付。 */
export interface Episode {
  index: number
  title: string
  status: 'not_started' | 'producing' | 'min_delivered' | 'delivered'
  targetWeek: number
  isFocus: boolean
  workItems: WorkItem[]
  note: string
}

export const episodeStatusNames: Record<Episode['status'], string> = {
  not_started: '未开始', producing: '制作中', min_delivered: '可主动交付', delivered: '已交付',
}

export const isDelivered = (item: WorkItem) => item.workDone * 1000 >= item.deliverAt * item.workTotal
export const sumWork = (items: WorkItem[]) => items.reduce((acc, item) => ({ done: acc.done + item.workDone, total: acc.total + item.workTotal }), { done: 0, total: 0 })
export const itemsByStage = (items: WorkItem[], stage: EpisodeStage) => items.filter((item) => item.stage === stage)

export interface PlanSetting {
  effort: Effort
  priority: Priority
  outsource: OutsourcePolicy
  rush: 'off' | 'conditional'
  sinceWeek: number
}

export interface PlanGap {
  label: string
  planned: string
  actual: string
  reason: string
}

export interface CommitteeMember {
  id: string
  name: string
  channel: Channel
  investPercent: number
  since: number
}

export interface ProjectAccount {
  contractBudget: number
  received: number
  investmentTotal: number
  companyInvestPercent: number
  productionCost: number
  outsourcingCost: number
  projectedCommercial: string
  balance: number
}

export interface RiskSignal {
  level: RiskLevel
  label: string
  signal: string
  sinceWeek: number
}

export interface Project {
  id: string
  title: string
  source: Source
  scale: Scale
  mode: Mode
  status: 'producing' | 'ready_to_deliver' | 'wrapping'
  startWeek: number
  deadlineWeek: number
  episodeCount: number
  commonItems: WorkItem[]
  episodes: Episode[]
  focusLabel: string | null
  plannedCompletion: number
  quality: number
  audienceExpectation: number
  commercialPotential: number
  plan: PlanSetting
  planGaps: PlanGap[]
  teamIds: string[]
  conflicts: string[]
  risks: RiskSignal[]
  committee: CommitteeMember[]
  account: ProjectAccount
  series: { parentTitle: string; relation: string; carried: string } | null
  marks: Mark[]
}

/* 完成度一律由工作点推导，避免界面数字与实际工作项脱节。 */
export const projectWork = (project: Project) => sumWork([...project.commonItems, ...project.episodes.flatMap((episode) => episode.workItems)])
export const projectCompletion = (project: Project) => {
  const work = projectWork(project)
  return work.total === 0 ? 0 : Math.round(work.done / work.total * 100)
}
export const deliveredEpisodes = (project: Project) => project.episodes.filter((episode) => episode.status === 'delivered').length

export type LedgerCategory = 'contract' | 'investment' | 'commercial' | 'salary' | 'operations' | 'production' | 'temporary' | 'outsourcing' | 'event' | 'extension' | 'penalty' | 'development' | 'distribution'

export interface LedgerEntry {
  id: string
  week: number
  scope: 'company' | 'project'
  projectId: string | null
  category: LedgerCategory
  label: string
  amount: number
}

export const ledgerNames: Record<LedgerCategory, string> = {
  contract: '合同拨款', investment: '委员会投资', commercial: '商业分成', salary: '工资', operations: '运营', production: '制作费',
  temporary: '临时人员', outsourcing: '外包', event: '事件支出', extension: '延期追加', penalty: '违约扣罚', development: '前期开发', distribution: '发行成本',
}

export interface ProjectWeekLine {
  projectId: string
  title: string
  episodeIndex: number | null
  stage: EpisodeStage | null
  itemKey: string | null
  workDelta: number
  qualityDelta: number
  detail: string
  reason: string
}

export interface StaffWeekLine {
  staffId: string
  name: string
  fatigueDelta: number
  moraleDelta: number
  note: string
}

/* DEC-PLAY-002 / D2：只有这几类才允许打断玩家；持续方针与既有资源计划自动执行。 */
export type DecisionKind = 'reassign' | 'new_outsource' | 'new_commitment' | 'delivery' | 'other'
export const decisionKindNames: Record<DecisionKind, string> = {
  reassign: '核心人员重新分配', new_outsource: '新增外包承诺', new_commitment: '新增花钱承诺', delivery: '交付动作', other: '其他',
}

export interface DecisionItem {
  id: string
  projectId: string | null
  kind: DecisionKind
  label: string
  detail: string
  options: string[]
}

export interface EventOption {
  id: string
  label: string
  cost: number
  gain: string
  risk: RiskLevel
  riskNote: string
  fits: string
}

export interface EventCard {
  id: string
  scope: 'project' | 'company'
  projectId: string | null
  tier: 'normal' | 'major'
  title: string
  description: string
  signals: string[]
  options: EventOption[]
  outcomes: Record<string, string>
  deadlineWeek: number
}

/* 正常、事件、危机与关闭中的操作差异必须可辨认；关闭中沿用 M0 已冻结的结清边界。 */
export type WeekState = 'normal' | 'event_pending' | 'cash_crisis' | 'closing'
export const weekStateNames: Record<WeekState, string> = { normal: '正常经营', event_pending: '事件待处理', cash_crisis: '限时资金危机', closing: '关闭中' }

export interface CompanyClosing {
  reason: 'bankrupt' | 'voluntary'
  cash: number
  pendingProjectIds: string[]
  allowedActions: string[]
  blockedActions: string[]
}

export interface CashCrisis {
  deadlineWeek: number
  cashAfterSettle: number
  forcedNextWeek: number
  waysOut: string[]
}

export interface WeeklyReceipt {
  week: number
  state: WeekState
  stateNote: string
  crisis: CashCrisis | null
  closing: CompanyClosing | null
  headline: string
  cashDelta: number
  costLines: { category: LedgerCategory; label: string; amount: number }[]
  projectLines: ProjectWeekLine[]
  staffLines: StaffWeekLine[]
  mustDecide: DecisionItem[]
  autoExecuted: string[]
  reportOnly: string[]
  nextFocus: string[]
  event: EventCard | null
}

export interface MarketOffer {
  id: string
  title: string
  source: Source
  scale: Scale
  origin: 'market' | 'ip_incoming' | 'self_original' | 'staff_proposal'
  budget: number
  durationWeeks: number
  minReputation: number
  heat: 'cold' | 'warm' | 'hot'
  hook: string
  blockedBy: string | null
}

export const offerOriginNames: Record<MarketOffer['origin'], string> = {
  market: '市场企划', ip_incoming: 'IP 上门', self_original: '自定原创', staff_proposal: '员工提案',
}
export const heatNames: Record<MarketOffer['heat'], string> = { cold: '偏冷', warm: '平稳', hot: '正热' }

export interface PartnerRelationship {
  id: string
  name: string
  kind: Channel | 'studio'
  since: number
  strength: number
  lastProject: string
  note: string
}

export interface WorkRecord {
  id: string
  title: string
  source: Source
  scale: Scale
  endWeek: number
  quality: number
  commercial: number
  profit: number
  rating: 'S' | 'A' | 'B' | 'C' | 'D'
  note: string
}

export interface PrototypeData {
  company: Company
  staff: Staff[]
  allocations: Allocation[]
  suppliers: Supplier[]
  outsourcing: OutsourceTask[]
  projects: Project[]
  receipts: WeeklyReceipt[]
  ledger: LedgerEntry[]
  marketOffers: MarketOffer[]
  relationships: PartnerRelationship[]
  history: WorkRecord[]
}
