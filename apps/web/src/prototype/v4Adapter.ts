import { EPISODE_STAGES, sumWork } from './model'
import type { Ability, CompanyClosing, EpisodeStage, Facility, LedgerCategory, LedgerEntry, MarketOffer, Mode, PartnerRelationship, Project, ProjectWeekLine, PrototypeData, RiskLevel, RiskSignal, StaffWeekLine, WeeklyReceipt, WorkItem, WorkRecord, WorkState } from './model'
import type { V4GameState, V4OutsourcingContract, V4PendingEvent, V4Project, V4WeekReport, V4WorkItem, V4WorkPlan } from './v4Types'

const itemNames: Record<string, string> = {
  series_composition: '系列构成', character_design: '角色设定', art_setting: '美术设定', color_design: '色彩设计', music: '音乐', op_ed: 'OP/ED',
  script: '单集脚本', episode_direction_plan: '演出构想', storyboard: '分镜', layout: '构图与 Layout', key_animation: '原画',
  inbetween: '动画（中割）', animation_check: '作画检查', background: '背景', art_check: '美术检查', composite: '摄影合成',
  editing: '剪辑', dubbing: '配音收录', sound_mix: '音响调整', delivery_master: '完成母版',
}
const roleName = (role: string) => ({ director: '导演', scriptwriter: '编剧', animation_director: '作画监督', key_animator: '原画', animator: '动画', production_manager: '制作进行', postproduction: '摄影' } as Record<string, string>)[role] ?? role
const ledgerCategory = (category: string): LedgerCategory => ({
  contract_received: 'contract', investment_paid: 'investment', commercial_share_received: 'commercial', success_reward_received: 'commercial',
  salary: 'salary', operations: 'operations', production: 'production', temporary: 'temporary', outsourcing: 'outsourcing',
  events: 'event', extension: 'extension', penalty: 'penalty', development: 'development', distribution: 'distribution',
} as Record<string, LedgerCategory>)[category] ?? 'development'

function itemState(item: V4WorkItem, allItems: V4WorkItem[]): WorkState {
  const byId = new Map(allItems.map((candidate) => [candidate.id, candidate]))
  const reached = (candidate: V4WorkItem) => BigInt(candidate.work_done) * 1000n >= BigInt(candidate.deliver_at) * BigInt(candidate.work_total)
  const blocked = (candidate: V4WorkItem, seen = new Set<string>()): boolean => candidate.deps.some((id) => {
    if (seen.has(id)) return true
    const dep = byId.get(id)
    return dep !== undefined && (!reached(dep) || blocked(dep, new Set([...seen, id])))
  })
  if (blocked(item)) return 'blocked'
  if (reached(item)) return item.work_done >= item.work_total ? 'completed' : 'delivered'
  return item.work_done > 0 ? 'active' : 'ready'
}

function adaptItem(item: V4WorkItem, stage: EpisodeStage | null, allItems: V4WorkItem[]): WorkItem {
  return {
    key: item.key, name: itemNames[item.key] ?? item.key, stage, ability: item.ability as Ability,
    workTotal: item.work_total, workDone: item.work_done, deliverAt: item.deliver_at,
    deliverPoints: Math.ceil(item.work_total * item.deliver_at / 1000), isGate: item.is_gate,
    deps: item.deps.map((id) => byIdName(allItems, id)), state: itemState(item, allItems),
  }
}

const byIdName = (items: V4WorkItem[], id: string) => items.find((item) => item.id === id)?.key ?? id
const allProjectItems = (project: V4Project) => [...project.common.items, ...project.episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))]
const qualityDimensions = ['story', 'direction', 'drawing', 'animation', 'art', 'sound'] as const
const displayQuality = (value: number) => Math.min(100, Math.max(0, value))
const roundedMean = (values: number[]) => values.length === 0 ? 0 : Math.floor((values.reduce((sum, value) => sum + value, 0) + Math.floor(values.length / 2)) / values.length)
const qualityMean = (project: V4Project) => {
  const episodes = project.episodes.map((episode) => {
    const stages = episode.stages.map((stage) => {
      const weightTotal = stage.items.reduce((sum, item) => sum + Math.max(item.work_total, 0), 0)
      return qualityDimensions.map((dimension) => weightTotal === 0 ? 0 : Math.floor((stage.items.reduce((sum, item) => sum + item.quality[dimension] * Math.max(item.work_total, 0), 0) + Math.floor(weightTotal / 2)) / weightTotal))
    })
    return qualityDimensions.map((_, dimension) => roundedMean(stages.map((stage) => stage[dimension])))
  })
  return roundedMean(qualityDimensions.map((_, dimension) => roundedMean(episodes.map((episode) => episode[dimension]))))
}
const plan = (source: V4WorkPlan, sinceWeek: number) => ({
  effort: ({ low: 'conservative', standard: 'standard', high: 'focused' } as const)[source.intensity],
  priority: source.focus,
  outsource: ({ none: 'off', gap_fill: 'gap', aggressive: 'active' } as const)[source.outsourcing],
  rush: source.overtime ? 'conditional' as const : 'off' as const,
  sinceWeek,
})
const focusLabel = (source: V4WorkPlan, project: V4Project) => {
  if (!source.target) return null
  if (source.target.kind === 'stage') return source.target.id
  return `第 ${project.episodes.find((episode) => episode.id === source.target?.id)?.index ?? '—'} 集`
}

function adaptProject(source: V4Project, state: V4GameState): Project {
  const allItems = allProjectItems(source)
  const episodes = source.episodes.map((episode) => {
    const workItems = episode.stages.flatMap((stage) => stage.items.map((item) => adaptItem(item, stage.key, allItems)))
    const stages = Object.fromEntries(EPISODE_STAGES.map((stage) => [stage, sumWork(workItems.filter((item) => item.stage === stage))])) as Project['episodes'][number]['stages']
    return {
      index: episode.index, title: `第 ${episode.index} 集`, status: workItems.some((item) => item.workDone > 0) ? 'producing' as const : 'not_started' as const,
      targetWeek: source.deadline_week, isFocus: source.plan.target?.kind === 'episode' && source.plan.target.id === episode.id,
      workItems, work: sumWork(workItems), stages, note: '进度来自 v4 核心工作项；本版本只按整部作品执行交付。',
    }
  })
  const workItems = [...source.common.items.map((item) => adaptItem(item, null, allItems)), ...episodes.flatMap((episode) => episode.workItems)]
  const entries = state.finance.entries.filter((entry) => entry.work_id === source.id)
  const amount = (category: string) => entries.filter((entry) => entry.category === category).reduce((sum, entry) => sum + entry.amount, 0)
  const committee = source.committee_id ? state.committees.find((item) => item.id === source.committee_id) : undefined
  return {
    id: source.id, title: source.offer.name, source: source.offer.source, scale: source.offer.scale, mode: source.mode,
    status: source.status === 'delivering' ? 'wrapping' : 'producing', startWeek: source.opened_week, deadlineWeek: source.deadline_week,
    episodeCount: episodes.length, deliveredEpisodeCount: 0, work: sumWork(workItems), commonWork: sumWork(source.common.items.map((item) => adaptItem(item, null, allItems))),
    completion: sumWork(workItems).percent, commonItems: source.common.items.map((item) => adaptItem(item, null, allItems)), episodes,
    focusLabel: focusLabel(source.plan, source), plannedCompletion: null, quality: displayQuality(qualityMean(source)), audienceExpectation: null,
    commercialPotential: source.offer.commercial_potential, plan: plan(source.plan, source.opened_week), planGaps: [],
    teamIds: state.staff.filter((staff) => staff.assignment_work_id === source.id).map((staff) => staff.id), conflicts: [],
    risks: [] as RiskSignal[],
    committee: committee?.members.map((member) => ({
      id: member.partner_id, name: state.partners.find((partner) => partner.id === member.partner_id)?.name ?? member.partner_id,
      channel: member.channel, investPercent: null, since: committee.formed_week,
    })) ?? [],
    account: {
      contractBudget: source.offer.contract_budget, received: amount('contract_received'), investmentTotal: source.investment.total,
      companyInvestPercent: source.investment.percent, productionCost: -amount('production'), outsourcingCost: -amount('outsourcing'),
      projectedCommercial: '交付前未结算', balance: entries.reduce((sum, entry) => sum + entry.amount, 0),
    },
    series: null, marks: ['confirmed'],
  }
}

function adaptEvent(event: V4PendingEvent) {
  return {
    id: event.event_id, scope: 'project' as const, projectId: event.work_id, tier: 'normal' as const,
    title: event.name, description: `第 ${event.triggered_week} 周触发；选项效果已由核心冻结。`,
    signals: event.options.map((option) => option.risk_hint).filter(Boolean),
    options: event.options.map((option) => ({
      id: option.id, label: option.label, cost: option.cost,
      gain: [option.effects.map((effect) => `${effect.target} ${effect.value >= 0 ? '+' : ''}${effect.value}`).join('、'), option.vendor_request ? `应急外包 ${option.vendor_request.work_total} 工作点` : ''].filter(Boolean).join('、') || '无额外数值效果',
      risk: (/高|重大|high/i.test(option.risk_hint) ? 'high' : /中|medium/i.test(option.risk_hint) ? 'medium' : 'low') as RiskLevel,
      riskNote: option.risk_hint || '核心未提供额外风险说明', fits: option.kind,
    })),
    outcomes: Object.fromEntries(event.options.map((option) => [option.id, `核心已处理「${event.name}」：${option.label}`])),
    deadlineWeek: event.expires_week,
    viewed: event.viewed,
  }
}

export function refreshReceipt(state: V4GameState, receipt: WeeklyReceipt): WeeklyReceipt {
  const current = adaptReceipt(state)
  return { ...receipt, state: current.state, stateNote: current.stateNote, closing: current.closing, rejected: receipt.rejected, event: current.event, nextFocus: current.nextFocus }
}

function adaptReceipt(state: V4GameState, report?: V4WeekReport): WeeklyReceipt {
  const previous = report ? { ...state, finance: { ...state.finance, balance: state.finance.balance - report.funds.delta } } : state
  const event = state.events.pending[0] ? adaptEvent(state.events.pending[0]) : null
  const closing = state.company.status !== 'running'
  const projectLines: ProjectWeekLine[] = report?.works.flatMap((work) => work.items.map((item) => {
    const project = state.works.find((candidate) => candidate.id === work.work_id)
    const allItems = project ? allProjectItems(project) : []
    const source = allItems.find((candidate) => candidate.id === item.item_id)
    const episode = project?.episodes.find((candidate) => candidate.stages.some((stage) => stage.items.some((entry) => entry.id === item.item_id)))
    return {
      projectId: work.work_id, title: project?.offer.name ?? work.work_id, episodeIndex: episode?.index ?? null,
      stage: project?.episodes.flatMap((entry) => entry.stages).find((entry) => entry.items.some((candidate) => candidate.id === item.item_id))?.key ?? null,
      itemKey: source?.key ?? item.item_id, itemId: item.item_id, workDelta: item.points, qualityDelta: item.quality_gain,
      detail: `核心结算 ${item.points} 工作点`, reason: '由 v4 核心计划冻结、人员能力、依赖与本周状态结算',
    }
  })) ?? []
  const staffLines: StaffWeekLine[] = report?.staff.map((line) => {
    const staff = state.staff.find((candidate) => candidate.id === line.staff_id)
    return { staffId: line.staff_id, name: staff?.name ?? line.staff_id, fatigueDelta: line.fatigue - (previous.staff.find((candidate) => candidate.id === line.staff_id)?.fatigue ?? line.fatigue), moraleDelta: line.morale - (previous.staff.find((candidate) => candidate.id === line.staff_id)?.morale ?? line.morale), note: line.produced > 0 ? `本周产出 ${line.produced} 工作点` : '本周休息' }
  }) ?? []
  const companyClosing: CompanyClosing | null = closing ? {
    reason: state.company.end_reason === 'bankrupt' ? 'bankrupt' : 'voluntary', cash: state.finance.balance,
    pendingProjectIds: state.works.map((work) => work.id), allowedActions: state.company.status === 'ended' ? ['生成经营总结'] : ['逐部结清待交付作品'],
    blockedActions: ['推进周次', '修改人员与计划', '承接新企划'],
  } : null
  const eventOutcomes = report?.events.expired?.map((entry) => `事件 ${entry.event_id} 已到期，核心自动执行选项 ${entry.option_id}。`) ?? []
  const settlementLines = report?.settlements.map((entry) => {
    const workId = typeof entry.work_id === 'string' ? entry.work_id : '未知作品'
    const archived = state.archive.works.find((work) => work.id === workId)
    const status = typeof entry.status === 'string' ? entry.status : typeof entry.end_reason === 'string' ? entry.end_reason : '已结算'
    const rating = typeof entry.rating === 'string' ? `评级 ${entry.rating}` : '评级 —'
    const revenue = typeof entry.commercial_revenue === 'number' ? `商业收入 ¥${entry.commercial_revenue.toLocaleString('zh-CN')}` : '商业收入 —'
    const net = typeof entry.net_received === 'number' ? `净到账 ¥${entry.net_received.toLocaleString('zh-CN')}` : '净到账 —'
    return `${archived?.name ?? workId}：${status}，${rating}，${revenue}，${net}。`
  }) ?? []
  return {
    week: state.company.week, state: closing ? 'closing' : event ? 'event_pending' : 'normal',
    stateNote: closing ? `核心状态：${state.company.status}${state.company.end_reason ? `（${state.company.end_reason}）` : ''}` : event ? '事件由 v4 核心按项目维护；查看与处理是两个独立动作。' : '核心状态正常。',
    rejected: report?.bankrupt ? { cash: report.funds.balance, requiredNextWeek: report.funds.balance + (report.gap ?? 0), shortfall: report.gap ?? 0, reason: '刚性支出预检失败，整周未提交；核心已进入破产关闭流程。' } : null,
    closing: companyClosing, headline: report ? `第 ${report.week} 周核心结算` : '尚未推进经营周', cashDelta: report?.funds.delta ?? 0,
    costLines: report ? ([
      { category: 'salary', label: '工资', amount: -(report.funds.costs?.salary ?? 0) }, { category: 'operations', label: '运营', amount: -(report.funds.costs?.operations ?? 0) },
      { category: 'production', label: '制作费', amount: -(report.funds.costs?.production ?? 0) },
    ] satisfies WeeklyReceipt['costLines']).filter((line) => line.amount !== 0) : [],
    projectLines, staffLines, mustDecide: [], autoExecuted: ['持续计划按核心冻结快照执行', '人员每周严格归属一个项目'],
    reportOnly: ['流水与 Archive 只展示核心事实'], nextFocus: closing ? ['逐部结清作品并生成核心经营总结'] : report?.settlements.length ? ['查看核心交付结算与 Archive'] : event ? ['处理待议事件'] : ['检查计划与人员归属后推进一周'], event, eventOutcomes, settlements: settlementLines,
  }
}

function adaptOutsourcing(state: V4GameState): PrototypeData['outsourcing'] {
  return state.contracts.map((contract: V4OutsourcingContract) => {
    const project = state.works.find((work) => work.id === contract.work_id)
    const episode = project?.episodes.find((entry) => entry.id === contract.episode_id)
    const stage = episode?.stages.find((entry) => entry.items.some((item) => item.id === contract.item_id))
    const item = project ? allProjectItems(project).find((entry) => entry.id === contract.item_id) : undefined
    return {
      id: contract.id, supplierId: contract.supplier_id, projectId: contract.work_id,
      episodeIndex: episode?.index ?? null, stage: stage?.key ?? null,
      itemKey: item?.key ?? contract.item_id, ability: contract.ability,
      workTotal: contract.work_total, workDone: contract.work_done,
      rush: contract.mode === 'emergency', feePaid: contract.fee_paid, dueWeek: contract.due_week,
      status: contract.status === 'delivered' ? 'delivered' : 'active',
    }
  })
}

export function adaptV4State(state: V4GameState, receipts: WeeklyReceipt[] = []): PrototypeData {
  const facilities: Facility[] = [
    { id: 'workspace', name: '制作工位', kind: 'workspace', status: 'available', statusLabel: '场景入口', detail: '查看公共制作、单集与六阶段', note: '设施不新增经营规则。', actionLabel: '查看制作现场' },
    { id: 'meeting', name: '会议室', kind: 'meeting', status: 'available', statusLabel: '场景入口', detail: '处理核心事件与经营周', note: '决策结果由 v4 核心执行。', actionLabel: '查看会议室' },
    { id: 'reception', name: '接待柜台', kind: 'reception', status: 'available', statusLabel: '场景入口', detail: '承接核心市场企划', note: '企划由核心市场状态提供。', actionLabel: '查看发行与市场' },
    { id: 'archive', name: '作品档案', kind: 'archive', status: 'available', statusLabel: '场景入口', detail: '查看已交付 Archive', note: '仅展示核心归档结果。', actionLabel: '查看发行与市场' },
  ]
  const marketOffers: MarketOffer[] = [...state.market.slots, ...(state.market.custom_offer ? [state.market.custom_offer] : [])].map((offer) => ({
    id: offer.id, title: offer.name, source: offer.source, scale: offer.scale,
    origin: offer.origin === 'custom' ? 'self_original' : offer.origin === 'studio' ? 'staff_proposal' : 'market',
    budget: offer.contract_budget, durationWeeks: offer.duration_weeks, minReputation: offer.min_reputation,
    heat: state.market.heat[offer.genre]?.level === 'high' ? 'hot' : state.market.heat[offer.genre]?.level === 'low' ? 'cold' : 'warm',
    hook: `${offer.genre} · 目标质量 ${offer.target_quality} · ${offer.episode_count} 集`, blockedBy: state.company.reputation < offer.min_reputation ? `声望不足（需要 ${offer.min_reputation}）` : null,
    allowedModes: offer.allowed_modes as Mode[], committeeCandidates: offer.committee_candidates,
    expiresWeek: offer.expires_week, lockedUntil: offer.locked_until ?? null, lockUsed: offer.lock_used ?? false,
    depositPaid: offer.deposit_paid ?? 0, depositBasis: offer.deposit_basis ?? 0, offerSourceType: offer.offer_source_type ?? 'market',
  }))
  const history: WorkRecord[] = state.archive.works.map((work) => ({
    id: work.id, title: work.name, source: work.source, scale: work.scale, endWeek: work.end_week, quality: work.quality_score,
    commercial: work.commercial_revenue, profit: work.finance_summary.profit, rating: work.rating,
    note: `核心归档：${work.end_reason} · 质量评分 ${work.quality_score}`,
  }))
  const ledger: LedgerEntry[] = state.finance.entries.map((entry) => ({ id: entry.id, week: entry.week, scope: entry.work_id ? 'project' : 'company', projectId: entry.work_id, category: ledgerCategory(entry.category), label: entry.memo, amount: entry.amount }))
  return {
    company: {
      name: state.company.name, week: state.company.week, totalWeeks: 520, cash: state.finance.balance, committedNextWeek: null,
      weeklyFixed: { salary: state.staff.reduce((sum, staff) => sum + staff.weekly_salary, 0), operations: 30_000 }, reputation: state.company.reputation,
      runwayWeeks: null, headline: state.company.status === 'running' ? '公司由 v4 核心持续经营。' : `公司${state.company.status === 'ended' ? '已结束' : '关闭中'}。`,
    },
    facilities,
    staff: state.staff.map((staff) => ({
      id: staff.id, name: staff.name, role: roleName(staff.role) as PrototypeData['staff'][number]['role'], employment: staff.employment,
      abilities: staff.abilities, specialty: Object.entries(staff.abilities).sort((a, b) => b[1] - a[1])[0][0] as Ability,
      fatigue: staff.fatigue, morale: staff.morale, weeklySalary: staff.weekly_salary, projectFee: staff.signing_fee,
      departureWarning: staff.departure_warning, statusNote: staff.last_participation ? `最近于第 ${staff.last_participation.week} 周参与 ${staff.last_participation.item_id}` : '尚无制作参与记录',
    })),
    allocations: state.staff.map((staff) => ({ staffId: staff.id, projectId: staff.assignment_work_id, previousProjectId: staff.last_participation?.work_id ?? null, focus: Object.entries(staff.abilities).sort((a, b) => b[1] - a[1])[0][0] as Ability })),
    suppliers: state.suppliers.map((supplier) => ({
      id: supplier.id, name: supplier.name, specialty: supplier.specialties[0],
      weeklyCapacity: supplier.capacity_per_week,
      reserved: state.contracts.filter((contract) => contract.supplier_id === supplier.id && contract.status === 'active').reduce((sum, contract) => sum + contract.weekly_cap, 0),
      unitPrice: supplier.price_per_unit, reliability: supplier.reliability,
      note: `速度 ${supplier.speed} · 质量 ${supplier.quality} · 第 ${supplier.unlocked_week} 周解锁`,
    })),
    outsourcing: adaptOutsourcing(state), projects: state.works.map((work) => adaptProject(work, state)),
    receipts: receipts.length > 0 ? receipts : [adaptReceipt(state)], ledger, marketOffers,
    relationships: state.partners.map((partner) => ({
      id: partner.id, name: partner.name, kind: partner.channels[0] as PartnerRelationship['kind'], since: partner.history.at(-1)?.week ?? 0,
      strength: partner.relationship, lastProject: partner.history.at(-1)?.reason ?? '尚无合作履历', note: `核心伙伴状态：${partner.status} · 声望 ${partner.prestige}`,
    })),
    history,
    pendingEvents: state.events.pending.map(adaptEvent),
  }
}

export { adaptReceipt }
