import { describe, expect, expectTypeOf, it } from 'vitest'
import { companyReputationProfile, isCompanyResult, isV4Archive, isV4CompanyResult, isV4WorkRecord, isWorkRecord } from './gameV4'
import type { V4Archive, V4CompanyResult, V4WorkRecord } from './gameV4'
import { isV4Market, isV4Offer, type V4Market } from './gameV4State'
import { isCompanyResult as isV3CompanyResult, isWorkRecord as isV3WorkRecord } from './gameV3'

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

function work(): V4WorkRecord {
  return {
    id: 'work_01', ip_id: null, offer_id: 'offer_01', name: '星海邮差', source: 'publisher', genre: 'sf', scale: 'tv',
    mode: 'contract', investment_percent: 0, start_week: 0, end_week: 26, end_reason: 'completed', status: 'DELIVERED', forced: false,
    gate_completion_permille: 1000, aborted_week: null, penalty_paid: 0,
    quality: { dims: { story: 70, direction: 70, drawing: 70, animation: 70, art: 70, sound: 70 }, mean: 70 },
    quality_score: 70, rating: 'B', commercial_revenue: 100, bd_gross: 100, bd_revenue: 50, committee_pool: 0,
    investor_share: 0, company_received: 50,
    finance_summary: {
      contract_received: 1000, contract_refund: 0, investment_paid: 0, commercial_share: 50, bd_revenue: 50, success_reward: 0,
      penalty: 0, costs: { production: 100 }, total_costs: 100, profit: 950
    },
    channel_breakdown: [{
      window: 'bd_dvd', potential: 200, quality_factor: 760, heat_factor: 1100, reputation_factor: 800,
      tv_multiplier: 1000, agency_fee_permille: 0, gross: 100, net: 50, revenue: 100, company_received: 50, owner: 'company'
    }],
    episodes: [{ id: 'ep01', quality: { dims: { story: 70, direction: 70, drawing: 70, animation: 70, art: 70, sound: 70 }, mean: 70 } }],
    team: [{ id: 'staff_dir', name: '导演', role: 'director' }], rules_status: 'placeholder'
  }
}

function abortedWork(): V4WorkRecord {
  return {
    ...work(), ip_id: 'ip_01', end_reason: 'aborted', status: 'ABORTED', gate_completion_permille: 750,
    aborted_week: 26, commercial_revenue: 0, bd_gross: 0, bd_revenue: 0, company_received: 0,
    finance_summary: {
      ...work().finance_summary, contract_refund: 250,
      commercial_share: 0, bd_revenue: 0, profit: 650
    },
    channel_breakdown: []
  }
}

function result(): V4CompanyResult {
  const abilities = { planning: 60, direction: 60, drawing: 60, animation: 60, management: 60, postproduction: 60 }
  const experience = { planning: 0, direction: 0, drawing: 0, animation: 0, management: 0, postproduction: 0 }
  const revealed = { planning: false, direction: false, drawing: false, animation: false, management: false, postproduction: false }
  return {
    reason: 'voluntary', weeks: 26, final_funds: 1950, net_cash_change: 950, total_projects: 1,
    best_work_id: 'work_01', rating: 'B',
    overall: {
      score: 45, max_score: 70, quality: 14, finance: 19, influence: 6, team: 6,
      base_ending: 'B', achievement_promotions: 0, ending: 'B', evaluation_model: { id: 'm5_company_v1', status: 'candidate' }
    },
    commercial: { completed_projects: 1, unfinished_projects: 0, gross_revenue: 100, company_revenue: 50, project_profit: 950 },
    reputation: 0,
    team: {
      core_staff_count: 1, temporary_staff_count: 0, average_ability: 60, current_experience: 0,
      revealed_potential_dimensions: 0, maxed_dimensions: 0,
      core_members: [{
        id: 'staff_dir', name: '导演', role: 'director', abilities, experience, revealed_potential: revealed,
        maxed_dimensions: [], representative_work_id: 'work_01', works: ['work_01']
      }]
    },
    best_work: { id: 'work_01', name: '星海邮差', rating: 'B', quality_score: 70, team: work().team },
    evaluations: [], highlights: ['最佳作品：星海邮差（B）'], negatives: []
  }
}

function archive(): V4Archive {
  return { works: [work()], series: [], company_result: result() }
}

describe('v4 声望只读剖面', () => {
  it('按 T0–T7 冻结阈值映射行业定位、下一档、临时能力与弹性工位', () => {
    const cases: [number, number, string, number | null, number | null, number, number, number][] = [
      [0, 0, '信用受损 / 边缘作坊', 99, 100, 42, 52, 1],
      [99, 0, '信用受损 / 边缘作坊', 99, 100, 42, 52, 1],
      [100, 1, '初创工作室', 249, 250, 42, 52, 1],
      [249, 1, '初创工作室', 249, 250, 42, 52, 1],
      [250, 2, '新锐工作室', 599, 600, 56, 65, 2],
      [599, 2, '新锐工作室', 599, 600, 56, 65, 2],
      [600, 3, '稳健制作公司', 1_999, 2_000, 56, 65, 2],
      [1_999, 3, '稳健制作公司', 1_999, 2_000, 56, 65, 2],
      [2_000, 4, '知名实力厂牌', 9_999, 10_000, 56, 65, 3],
      [9_999, 4, '知名实力厂牌', 9_999, 10_000, 56, 65, 3],
      [10_000, 5, '一线头部大厂', 59_999, 60_000, 66, 74, 3],
      [59_999, 5, '一线头部大厂', 59_999, 60_000, 66, 74, 3],
      [60_000, 6, '超一线行业巨头', 299_999, 300_000, 66, 74, 4],
      [299_999, 6, '超一线行业巨头', 299_999, 300_000, 66, 74, 4],
      [300_000, 7, '国民级 / 殿堂级传奇', null, null, 66, 74, 4],
    ]
    for (const [reputation, tier, position, max, next, abilityMin, abilityMax, capacity] of cases) {
      expect(companyReputationProfile(reputation), `reputation=${reputation}`).toEqual({
        tier, tier_label: `T${tier}`, industry_position: position,
        range: { min: reputationTiersMinimum(tier), max },
        next_tier: next === null ? null : { tier: tier + 1, min_reputation: next },
        temporary_ability_range: { min: abilityMin, max: abilityMax },
        flexible_staff_capacity: capacity,
      })
    }
  })

  it('1M 是巅峰标杆而非上限，T7 可继续增长', () => {
    expect(companyReputationProfile(1_000_000)).toMatchObject({ tier: 7, range: { min: 300_000, max: null }, next_tier: null })
    expect(companyReputationProfile(1_000_001)).toMatchObject({ tier: 7, range: { min: 300_000, max: null }, next_tier: null })
  })
})

const reputationTiersMinimum = (tier: number) => [0, 100, 250, 600, 2_000, 10_000, 60_000, 300_000][tier]

describe('v4 终局结果契约', () => {
  it('接受结构化结局及 JSON 往返，并与 v3 评级互斥', () => {
    const value = result()
    expect(isV4CompanyResult(value)).toBe(true)
    expect(isV4CompanyResult(JSON.parse(JSON.stringify(value)))).toBe(true)
    expect(isV4CompanyResult({ ...value, rating: 'stable' })).toBe(false)
    expect(isV3CompanyResult(value)).toBe(false)
    expectTypeOf(isCompanyResult(value)).toEqualTypeOf<boolean>()
  })

  it('每个根字段必填，拒绝未知字段和旧评级', () => {
    for (const path of paths(result(), () => true)) expect(isV4CompanyResult(changed(result(), path, undefined, true)), path).toBe(false)
    expect(isV4CompanyResult({ ...result(), commercial_score: 10 })).toBe(false)
    expect(isV4CompanyResult({ ...result(), reason: 'time_limit', weeks: 519 })).toBe(false)
  })

  it('校验终局数值、评价文本与最佳作品引用', () => {
    for (const path of paths(result(), (value) => typeof value === 'number')) {
      for (const invalid of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
        expect(isV4CompanyResult(changed(result(), path, invalid)), `${path}: ${String(invalid)}`).toBe(false)
      }
    }
    expect(isV4CompanyResult({ ...result(), highlights: [''] })).toBe(false)
    const missing = result()
    missing.best_work_id = 'missing'
    missing.best_work!.id = 'missing'
    expect(isV4CompanyResult(missing)).toBe(true)
    const dangling = archive()
    dangling.company_result!.best_work_id = 'missing'
    dangling.company_result!.best_work!.id = 'missing'
    expect(isV4Archive(dangling)).toBe(false)
  })

  it('只接受候选评价模型并校验分数、跨档与团队聚合', () => {
    expect(isV4CompanyResult(changed(result(), 'overall.evaluation_model.status', 'frozen'))).toBe(false)
    expect(isV4CompanyResult(changed(result(), 'overall.evaluation_model.extra', 1))).toBe(false)
    expect(isV4CompanyResult(changed(result(), 'overall.score', 49))).toBe(false)
    expect(isV4CompanyResult(changed(result(), 'overall.achievement_promotions', 1))).toBe(false)
    expect(isV4CompanyResult(changed(result(), 'team.current_experience', 1))).toBe(false)
    expect(isV4CompanyResult(changed(result(), 'team.core_members.0.representative_work_id', null))).toBe(false)
    expect(isV4Archive(changed(archive(), 'company_result.overall.quality', 15))).toBe(false)
    expect(isV4Archive(changed(archive(), 'company_result.commercial.gross_revenue', 101))).toBe(false)
    expect(isV4Archive(changed(archive(), 'company_result.team.core_members.0.works', []))).toBe(false)
    const capped = archive()
    capped.company_result!.overall.team = 16
    expect(isV4Archive(capped)).toBe(false)
    capped.company_result!.overall.team = 15
    capped.company_result!.overall.score = 54
    capped.company_result!.overall.base_ending = 'A'
    capped.company_result!.overall.ending = 'A'
    capped.company_result!.team.average_ability = 100
    capped.company_result!.team.current_experience = 1200
    capped.company_result!.evaluations = [{ code: 'team_growth', label: '核心团队仍有成长积累', polarity: 'positive' }]
    for (const ability of Object.keys(capped.company_result!.team.core_members[0].abilities) as (keyof V4CompanyResult['team']['core_members'][number]['abilities'])[]) {
      capped.company_result!.team.core_members[0].abilities[ability] = 100
      capped.company_result!.team.core_members[0].experience[ability] = 200
    }
    expect(isV4CompanyResult(capped.company_result)).toBe(true)
    expect(isV4Archive(capped)).toBe(true)
  })

  it('允许正负特殊评价并存但拒绝错误极性和重复评价', () => {
    const value = result()
    value.evaluations = [
      { code: 'team_growth', label: '核心团队仍有成长积累', polarity: 'positive' },
      { code: 'cash_burn', label: '公司现金净流出', polarity: 'negative' }
    ]
    expect(isV4CompanyResult(value)).toBe(true)
    expect(isV4CompanyResult(changed(value, 'evaluations.0.polarity', 'negative'))).toBe(false)
    expect(isV4CompanyResult(changed(value, 'evaluations.1.code', 'team_growth'))).toBe(false)
    expect(isV4Archive({ ...archive(), company_result: value })).toBe(false)
  })
})

describe('v4 完整 WorkRecord 契约', () => {
  it('接受真实载荷及 JSON 往返，拒绝 v3 WorkRecord', () => {
    const value = work()
    expect(isV4WorkRecord(value)).toBe(true)
    expect(isV4WorkRecord(JSON.parse(JSON.stringify(value)))).toBe(true)
    expect(isV4WorkRecord({ ...value, source: 'market' })).toBe(true)
    expect(isV3WorkRecord(value)).toBe(false)
    expectTypeOf(isWorkRecord(value)).toEqualTypeOf<boolean>()
  })

  it('所有根字段和固定嵌套字段必填，未知字段一律拒绝', () => {
    for (const path of paths(work(), () => true)) expect(isV4WorkRecord(changed(work(), path, undefined, true)), path).toBe(false)
    expect(isV4WorkRecord({ ...work(), previous_work_id: null })).toBe(false)
    expect(isV4WorkRecord({ ...work(), finance_summary: { ...work().finance_summary, costs: { operations: 1 } } })).toBe(false)
  })

  it('数字拒绝浮点、无穷、不安全整数和错误类型', () => {
    for (const path of paths(work(), (value) => typeof value === 'number')) {
      for (const invalid of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1, '1', null]) {
        expect(isV4WorkRecord(changed(work(), path, invalid)), `${path}: ${String(invalid)}`).toBe(false)
      }
    }
  })

  it('校验质量均值、评级、合作比例、结束原因与唯一快照 id', () => {
    expect(isV4WorkRecord(changed(work(), 'quality.mean', 71))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'rating', 'A'))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'mode', 'committee'))).toBe(false)
    expect(isV4WorkRecord({ ...work(), mode: 'committee', investment_percent: 50 })).toBe(true)
    expect(isV4WorkRecord(changed(work(), 'forced', true))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'episodes.0.id', 'ep02'))).toBe(true)
    expect(isV4WorkRecord({ ...work(), episodes: [...work().episodes, ...work().episodes] })).toBe(false)
    expect(isV4WorkRecord({ ...work(), team: [...work().team, ...work().team] })).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'end_week', 521))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'start_week', 27))).toBe(false)
  })

  it('接受旧岗位与八职业实际角色，仍拒绝未知角色', () => {
    const value = work()
    value.team = ['director', '作画', '演出', '脚本', '摄影', '监督', '音乐', '声优', '美术']
      .map((role, index) => ({ id: `staff_${index}`, name: `成员 ${index}`, role: role as V4WorkRecord['team'][number]['role'] }))
    expect(isV4WorkRecord(value)).toBe(true)
    expect(isV4WorkRecord(changed(value, 'team.0.role', '主管'))).toBe(false)
  })

  it('频道、公司所得与财务汇总精确对账', () => {
    expect(isV4WorkRecord(changed(work(), 'channel_breakdown.0.revenue', 101))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'commercial_revenue', 101))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'bd_revenue', 49))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'finance_summary.bd_revenue', 49))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'company_received', 51))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'finance_summary.commercial_share', 51))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'finance_summary.total_costs', 101))).toBe(false)
    expect(isV4WorkRecord(changed(work(), 'finance_summary.profit', 949))).toBe(false)
    expect(isV4WorkRecord({ ...work(), channel_breakdown: [...work().channel_breakdown, ...work().channel_breakdown] })).toBe(false)
  })

  it('接受委员会净池分配与 BD 公司所得并精确对账', () => {
    const value = work()
    value.mode = 'committee'
    value.investment_percent = 30
    value.commercial_revenue = 592
    value.bd_gross = 92
    value.bd_revenue = 46
    value.committee_pool = 500
    value.investor_share = 350
    value.company_received = 196
    value.finance_summary = {
      ...value.finance_summary, investment_paid: 600, commercial_share: 196, bd_revenue: 46,
      costs: { production: 1100 }, total_costs: 1100, profit: -504
    }
    value.channel_breakdown = [
      { window: 'domestic_streaming', potential: 500, quality_factor: 1000, heat_factor: 1000, reputation_factor: 1000,
        tv_multiplier: 1000, agency_fee_permille: 0, gross: 500, net: 500, revenue: 500, company_received: 150, owner: 'committee_pool' },
      { window: 'bd_dvd', potential: 92, quality_factor: 1000, heat_factor: 1000, reputation_factor: 1000,
        tv_multiplier: 1000, agency_fee_permille: 0, gross: 92, net: 46, revenue: 92, company_received: 46, owner: 'company' }
    ]
    expect(isV4WorkRecord(value)).toBe(true)
    expect(isV4WorkRecord(changed(value, 'investor_share', 349))).toBe(false)
    expect(isV4WorkRecord(changed(value, 'finance_summary.commercial_share', 195))).toBe(false)
  })

  it('大额财务中间运算使用精确整数，安全整数结果不回绕', () => {
    const maximum = Number.MAX_SAFE_INTEGER
    const value = work()
    value.mode = 'committee'
    value.investment_percent = 30
    value.commercial_revenue = maximum - 1
    value.bd_gross = 0
    value.bd_revenue = 0
    value.committee_pool = maximum - 1
    value.investor_share = 0
    value.company_received = maximum - 1
    value.finance_summary = {
      contract_received: maximum, contract_refund: 0, investment_paid: maximum, commercial_share: maximum - 1,
      bd_revenue: 0, success_reward: 0, penalty: 0, costs: { production: maximum - 1 }, total_costs: maximum - 1, profit: 0,
    }
    value.channel_breakdown = [{
      window: 'domestic_streaming', potential: maximum - 1, quality_factor: 1000, heat_factor: 1000, reputation_factor: 1000,
      tv_multiplier: 1000, agency_fee_permille: 0, gross: maximum - 1, net: maximum - 1, revenue: maximum - 1,
      company_received: maximum - 1, owner: 'committee_pool',
    }]
    expect(isV4WorkRecord(value)).toBe(true)
    expect(isV4WorkRecord(changed(value, 'finance_summary.profit', -1))).toBe(false)
  })

  it('校验中止状态、周、实际违约金与退款利润', () => {
    expect(isV4WorkRecord(abortedWork())).toBe(true)
    expect(isV4WorkRecord(changed(abortedWork(), 'status', 'DELIVERED'))).toBe(false)
    expect(isV4WorkRecord(changed(abortedWork(), 'aborted_week', 25))).toBe(false)
    expect(isV4WorkRecord(changed(abortedWork(), 'aborted_week', null))).toBe(false)
    expect(isV4WorkRecord(changed(abortedWork(), 'penalty_paid', 1))).toBe(false)
    expect(isV4WorkRecord(changed(abortedWork(), 'finance_summary.contract_refund', 251))).toBe(false)
    const penalized = abortedWork()
    penalized.penalty_paid = 150
    penalized.finance_summary.penalty = 150
    penalized.finance_summary.costs.penalty = 150
    penalized.finance_summary.total_costs = 250
    penalized.finance_summary.profit = 500
    expect(isV4WorkRecord(penalized)).toBe(true)
  })
})

describe('v4 企划契约', () => {
  const offer = () => ({
    id: 'offer_01', name: '星海邮差', source: 'publisher', genre: 'sf', scale: 'tv', contract_budget: 1200000,
    duration_weeks: 26, target_quality: 70, audience_base: 600, commercial_potential: 700,
    channel_potentials: { domestic_streaming: 1800000 }, channels_baseline: ['domestic_streaming', 'tv'],
    allowed_modes: ['contract', 'committee'], committee_candidates: ['partner_tv', 'partner_stream'],
    min_reputation: 0, required_works: [], blueprint_id: 'tv_standard', episode_count: 12,
    workload_scale_permille: 1000, origin: 'publisher', style: 'standard', offer_source_type: 'market',
    deposit_basis: 1200000, expires_week: 3, locked_until: null, lock_used: false, deposit_paid: 0,
  })

  it('接受核心的成员 ID 数组与千分制商业潜力', () => {
    expect(isV4Offer(offer())).toBe(true)
    expect(isV4Offer({ ...offer(), commercial_potential: 1000 })).toBe(true)
    expect(isV4Offer({ ...offer(), commercial_potential: 1001 })).toBe(false)
    expect(isV4Offer({ ...offer(), committee_candidates: [{ id: 'partner_tv' }] })).toBe(false)
    expect(isV4Offer({ ...offer(), previous_work_id: null })).toBe(false)
  })
})

describe('v4 市场状态契约', () => {
  const market = (): V4Market => ({
    heat: { sf: { level: 'high', changed_week: 0 } },
    slots: [],
    custom_offer: null,
    proposal: null,
    refresh_week: 0,
    last_competition_round: 0,
    competitors: [],
  })

  it('接受运行时七字段市场及 JSON 往返', () => {
    expect(isV4Market(market())).toBe(true)
    expect(isV4Market(JSON.parse(JSON.stringify(market())))).toBe(true)
    expect(isV4Market({ ...market(), custom_offer: { id: 'custom_01' }, proposal: { id: 'proposal_01' }, competitors: [{}] })).toBe(true)
  })

  it('拒绝缺字段、未知字段、非法热度和负数竞争轮次', () => {
    for (const key of Object.keys(market())) {
      expect(isV4Market(changed(market(), key, undefined, true)), key).toBe(false)
    }
    expect(isV4Market({ ...market(), slots_extra: [] })).toBe(false)
    expect(isV4Market(changed(market(), 'heat.sf.level', 'normal'))).toBe(false)
    expect(isV4Market(changed(market(), 'last_competition_round', -1))).toBe(false)
  })
})

describe('v4 Archive 与系列引用契约', () => {
  it('接受空归档、正常终局和完整系列归档', () => {
    expect(isV4Archive({ works: [], series: [], company_result: null })).toBe(true)
    expect(isV4Archive(archive())).toBe(true)
    const value = archive()
    value.works[0].ip_id = 'ip_01'
    value.series = [{ ip_id: 'ip_01', title: '星海邮差', works: ['work_01'], last_week: 26 }]
    expect(isV4Archive(value)).toBe(true)
    expect(isV4Archive(JSON.parse(JSON.stringify(value)))).toBe(true)
  })

  it('保留中止履历但拒绝将其写入系列', () => {
    const value = archive()
    value.works[0] = abortedWork()
    value.company_result = null
    expect(isV4Archive(value)).toBe(true)
    value.series = [{ ip_id: 'ip_01', title: '星海邮差', works: ['work_01'], last_week: 26 }]
    expect(isV4Archive(value)).toBe(false)
  })

  it('允许破产终局保留负现金', () => {
    const bankrupt = result()
    bankrupt.reason = 'bankrupt'
    bankrupt.final_funds = -1
    bankrupt.net_cash_change = -1001
    bankrupt.overall.base_ending = 'D'
    bankrupt.overall.ending = 'D'
    expect(isV4CompanyResult(bankrupt)).toBe(true)
    expect(isV4CompanyResult({ ...result(), reason: 'voluntary', final_funds: -1 })).toBe(false)
  })

  it('拒绝缺失系列、重复归属、悬空引用和错误最后周', () => {
    const missing = archive()
    missing.works[0].ip_id = 'ip_01'
    expect(isV4Archive(missing)).toBe(false)
    const duplicate = archive()
    duplicate.works[0].ip_id = 'ip_01'
    duplicate.series = [
      { ip_id: 'ip_01', title: '星海邮差', works: ['work_01'], last_week: 26 },
      { ip_id: 'ip_01', title: '重复系列', works: [], last_week: 0 }
    ]
    expect(isV4Archive(duplicate)).toBe(false)
    const dangling = archive()
    dangling.series = [{ ip_id: 'ip_01', title: '星海邮差', works: ['missing'], last_week: 26 }]
    expect(isV4Archive(dangling)).toBe(false)
    const wrongWeek = archive()
    wrongWeek.works[0].ip_id = 'ip_01'
    wrongWeek.series = [{ ip_id: 'ip_01', title: '星海邮差', works: ['work_01'], last_week: 25 }]
    expect(isV4Archive(wrongWeek)).toBe(false)
  })

  it('拒绝倒序归档、重复作品 id 和终局统计不一致', () => {
    const value = archive()
    const earlier = { ...work(), id: 'work_00', offer_id: 'offer_00', end_week: 20 }
    value.works.push(earlier)
    expect(isV4Archive(value)).toBe(false)
    expect(isV4Archive({ ...archive(), works: [work(), work()] })).toBe(false)
    expect(isV4Archive({ ...archive(), company_result: { ...result(), total_projects: 0 } })).toBe(false)
    expect(isV4Archive({ ...archive(), company_result: { ...result(), rating: 'A' } })).toBe(false)
    expect(isV4Archive({ ...archive(), company_result: { ...result(), best_work_id: null } })).toBe(false)
  })
})
