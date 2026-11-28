import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { V4CompanyResult, V4WorkRecord } from '../types/gameV4'
import type { V4GameState, V4Project, V4Staff, V4WeekReport } from '../types/gameV4State'
import V4Workbench from './V4Workbench'

const mocks = vi.hoisted(() => ({
  store: {
    game: null as V4GameState | null,
    lastReport: null as V4WeekReport | null,
    busy: false,
    error: null as string | null,
    notice: null as string | null,
    rulesWarning: false,
    saveConflict: false,
    start: vi.fn(),
    load: vi.fn(),
    save: vi.fn(),
    cancelOverwrite: vi.fn(),
    command: vi.fn(),
    clearMessage: vi.fn(),
  },
}))
vi.mock('../stores/gameStoreV4', () => ({ useGameStoreV4: () => mocks.store }))

const offer = {
  id: 'offer_01', name: '星海邮差', source: 'publisher', origin: 'publisher', genre: '科幻', scale: 'tv',
  contract_budget: 1200000, duration_weeks: 26, target_quality: 70, episode_count: 12,
  commercial_potential: 600, allowed_modes: ['contract', 'committee'], expires_week: 6, style: '清爽',
  committee_candidates: ['partner_tv', 'partner_stream'],
}
const game = (): V4GameState => ({
  version: 4, seed: 3,
  company: { id: 'company_01', name: '第七帧社', founded_week: 0, week: 0, status: 'running', end_reason: null, reputation: 20, reputation_log: [] },
  staff: [], recruitment: { pool: [], pity: { since_sr: 0, since_ssr: 0 }, last_scout_week: null }, works: [], suppliers: [], contracts: [],
  partners: [{ id: 'partner_tv', name: '东都电视台', channels: ['tv'], status: 'known' }, { id: 'partner_stream', name: '海流配信', channels: ['domestic_streaming'], status: 'known' }],
  committees: [],
  market: { heat: {}, slots: [offer], custom_offer: null, proposal: null, refresh_week: null, last_competition_round: 0, competitors: [] },
  events: { pending: [], last_event_week: null, per_work: {} },
  finance: { opening_funds: 2000000, balance: 2000000, entries: [], loans: [], solvency: { state: 'solvent', since_week: null, deadline_week: null, gap: 0 } },
  archive: { works: [], series: [], company_result: null },
}) as unknown as V4GameState

const staff = (): V4Staff => ({
  id: 'staff_01', name: '测试员工', role: 'director', employment: 'core',
  abilities: { planning: 30, direction: 40, drawing: 50, animation: 50, management: 50, postproduction: 50 },
  experience: { planning: 10, direction: 25, drawing: 0, animation: 0, management: 0, postproduction: 0 },
  potential: { planning: 50, direction: 60, drawing: 65, animation: 65, management: 65, postproduction: 65 },
  revealed_potential: { planning: false, direction: true, drawing: false, animation: false, management: false, postproduction: false },
  talent_type: 'specialist', weekly_salary: 100, signing_fee: 0, fatigue: 8, morale: 78,
  departure_warning: false, assignment_work_id: null, last_participation: null, temporary_contract: null,
})

const endedWork = (): V4WorkRecord => ({
  id: 'work_01', ip_id: null, offer_id: 'offer_01', name: '星海邮差', source: 'publisher', genre: 'sf', scale: 'tv',
  mode: 'contract', investment_percent: 0, start_week: 0, end_week: 26, end_reason: 'completed', status: 'DELIVERED', forced: false,
  gate_completion_permille: 1000, aborted_week: null, penalty_paid: 0,
  quality: { dims: { story: 70, direction: 70, drawing: 70, animation: 70, art: 70, sound: 70 }, mean: 70 },
  quality_score: 70, rating: 'B', commercial_revenue: 100, bd_gross: 100, bd_revenue: 100, committee_pool: 0,
  investor_share: 0, company_received: 100,
  finance_summary: {
    contract_received: 1000, contract_refund: 0, investment_paid: 0, commercial_share: 100, bd_revenue: 100, success_reward: 0,
    penalty: 0, costs: { production: 900 }, total_costs: 900, profit: 200,
  },
  channel_breakdown: [{
    window: 'bd_dvd', potential: 100, quality_factor: 760, heat_factor: 1100, reputation_factor: 800,
    tv_multiplier: 1000, agency_fee_permille: 0, gross: 100, net: 100, revenue: 100, company_received: 100, owner: 'company',
  }],
  episodes: [{ id: 'ep01', quality: { dims: { story: 70, direction: 70, drawing: 70, animation: 70, art: 70, sound: 70 }, mean: 70 } }],
  team: [{ id: 'staff_01', name: '测试员工', role: 'director' }], rules_status: 'placeholder',
})

const endedResult = (): V4CompanyResult => ({
  reason: 'voluntary', weeks: 26, final_funds: 1800000, net_cash_change: -200000, total_projects: 1,
  best_work_id: 'work_01', rating: 'B',
  overall: {
    score: 41, max_score: 70, quality: 14, finance: 9, influence: 11, team: 7,
    base_ending: 'B', achievement_promotions: 1, ending: 'A', evaluation_model: { id: 'm5_company_v1', status: 'candidate' },
  },
  commercial: { completed_projects: 1, unfinished_projects: 0, gross_revenue: 100, company_revenue: 100, project_profit: 200 },
  reputation: 10000,
  team: {
    core_staff_count: 1, temporary_staff_count: 0, average_ability: 60, current_experience: 40,
    revealed_potential_dimensions: 1, maxed_dimensions: 0,
    core_members: [{
      id: 'staff_01', name: '测试员工', role: 'director',
      abilities: { planning: 60, direction: 60, drawing: 60, animation: 60, management: 60, postproduction: 60 },
      experience: { planning: 0, direction: 40, drawing: 0, animation: 0, management: 0, postproduction: 0 },
      revealed_potential: { planning: false, direction: true, drawing: false, animation: false, management: false, postproduction: false },
      maxed_dimensions: [], representative_work_id: 'work_01', works: ['work_01'],
    }],
  },
  best_work: { id: 'work_01', name: '星海邮差', rating: 'B', quality_score: 70, team: endedWork().team },
  evaluations: [
    { code: 'industry_influence', label: '声望达到 T5 及以上', polarity: 'positive' },
    { code: 'team_growth', label: '核心团队仍有成长积累', polarity: 'positive' },
    { code: 'cash_burn', label: '公司现金净流出', polarity: 'negative' },
  ],
  highlights: ['最佳作品：星海邮差（B）'], negatives: ['公司现金净流出'],
})

beforeEach(() => {
  mocks.store.game = null
  mocks.store.lastReport = null
  mocks.store.busy = false
  mocks.store.error = null
  mocks.store.notice = null
  mocks.store.saveConflict = false
  mocks.store.command.mockReset().mockResolvedValue(true)
  mocks.store.save.mockReset().mockResolvedValue(undefined)
  mocks.store.load.mockReset().mockResolvedValue(undefined)
})

it('未开局不隐式初始化，显式新开与读取可用', async () => {
  const user = userEvent.setup()
  render(<V4Workbench />)
  expect(mocks.store.start).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '开始新经营' }))
  await user.click(screen.getByRole('button', { name: '读取本地存档' }))
  expect(mocks.store.start).toHaveBeenCalledOnce()
  expect(mocks.store.load).toHaveBeenCalledOnce()
})

it('普通市场企划以承制模式提交真实 start_work 参数', async () => {
  const user = userEvent.setup()
  mocks.store.game = game()
  render(<V4Workbench />)
  await user.click(screen.getAllByRole('button', { name: '审阅企划' })[0])
  await user.click(screen.getByRole('button', { name: '确认立项' }))
  expect(mocks.store.command).toHaveBeenCalledWith('start_work', { offer_id: 'offer_01', mode: 'contract' })
  expect(screen.getByRole('heading', { name: '制作与外包' })).toBeInTheDocument()
})

it('声望卡展示档位、下一档、临时能力区间与弹性工位用量', () => {
  const state = game()
  state.company.reputation = 250
  state.staff = [1, 2].map((index) => ({
    ...staff(), id: `temp_0${index}`, role: 'animator', employment: 'temporary', assignment_work_id: null, temporary_contract: null,
  }))
  mocks.store.game = state
  const view = render(<V4Workbench />)
  expect(screen.getByText('T2 · 新锐工作室')).toBeInTheDocument()
  expect(screen.getByText('距 T3 350')).toBeInTheDocument()
  expect(screen.getByText('临时候选能力 56–65 · 弹性工位 2/2')).toBeInTheDocument()

  view.unmount()
  const peak = game()
  peak.company.reputation = 1_000_001
  mocks.store.game = peak
  render(<V4Workbench />)
  expect(screen.getByText('T7 · 国民级 / 殿堂级传奇')).toBeInTheDocument()
  expect(screen.getByText('1M 为巅峰标杆，仍可增长')).toBeInTheDocument()
  expect(screen.getByText('临时候选能力 66–74 · 弹性工位 0/4')).toBeInTheDocument()
})

it('委员会立项保留公司投资比例并提交去重后的成员', async () => {
  const user = userEvent.setup()
  mocks.store.game = game()
  render(<V4Workbench />)
  await user.click(screen.getAllByRole('button', { name: '审阅企划' })[0])
  await user.selectOptions(screen.getByLabelText('合作模式'), 'committee')
  await user.selectOptions(screen.getByLabelText('公司投资比例'), '60')
  await user.click(screen.getByRole('checkbox', { name: /海流配信/ }))
  await user.click(screen.getByRole('button', { name: '确认立项' }))
  expect(mocks.store.command).toHaveBeenCalledWith('start_work', {
    offer_id: 'offer_01', mode: 'committee', percent: 60, committee_partner_ids: ['partner_tv'],
  })
})

it('切换企划恢复默认合作模式，不沿用上一次委员会投资选择', async () => {
  const user = userEvent.setup()
  const state = game()
  state.market.slots.push({ ...state.market.slots[0], id: 'offer_02', name: '第二份企划' })
  mocks.store.game = state
  render(<V4Workbench />)
  const reviews = screen.getAllByRole('button', { name: '审阅企划' })
  await user.click(reviews[0])
  await user.selectOptions(screen.getByLabelText('合作模式'), 'committee')
  await user.click(reviews[1])
  expect(screen.getByLabelText('合作模式')).toHaveValue('contract')
})

it('未查看事件阻塞推进且须先查看，覆盖存档必须显式确认', async () => {
  const user = userEvent.setup()
  mocks.store.game = game()
  mocks.store.game.events.pending.push({
    event_id: 'schedule_slip', name: '进度滑坡', work_id: 'work_01', triggered_week: 0,
    expires_week: null, cooldown_weeks: 0, once_per_project: false, viewed: false, options: [],
  })
  mocks.store.saveConflict = true
  mocks.store.notice = '此浏览器已有存档，覆盖后旧存档不可恢复。'
  const view = render(<V4Workbench />)
  expect(screen.getByTestId('advance-week')).toBeDisabled()
  await user.click(screen.getByRole('button', { name: '确认覆盖本地存档' }))
  expect(mocks.store.save).toHaveBeenCalledWith(true)
  view.unmount()
  render(<V4Workbench />)
  await user.click(screen.getByRole('button', { name: '制作与外包' }))
  expect(screen.getByRole('heading', { name: '进度滑坡' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '查看事件' }))
  expect(mocks.store.command).toHaveBeenCalledWith('view_event', { work_id: 'work_01', event_id: 'schedule_slip' })
})

it('已查看事件不再阻塞推进，现金不足的选项不可点击', async () => {
  const user = userEvent.setup()
  const state = game()
  state.finance.balance = 100
  state.events.pending.push({
    event_id: 'supplier_dunning', name: '外包催款', work_id: 'work_01', triggered_week: 0,
    expires_week: null, cooldown_weeks: 0, once_per_project: false, viewed: true,
    options: [{ id: 'settle', label: '先结清尾款', kind: 'abandon', risk_hint: '现金更紧', cost: 300000, effects: [] }],
  })
  mocks.store.game = state
  render(<V4Workbench />)
  expect(screen.getByTestId('advance-week')).toBeEnabled()
  await user.click(screen.getByRole('button', { name: '制作与外包' }))
  expect(screen.getByRole('button', { name: /先结清尾款/ })).toBeDisabled()
  expect(screen.getByText(/当前现金不足以支付任何选项/)).toBeInTheDocument()
})

it('读取存档替换当前进度前必须确认且可以取消', async () => {
  const user = userEvent.setup()
  mocks.store.game = game()
  render(<V4Workbench />)
  await user.click(screen.getByRole('button', { name: '读取存档' }))
  expect(mocks.store.load).not.toHaveBeenCalled()
  expect(screen.getByText(/读取存档会替换当前经营进度/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '取消读取' }))
  expect(screen.queryByText(/读取存档会替换当前经营进度/)).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '读取存档' }))
  await user.click(screen.getByRole('button', { name: '确认读取并替换' }))
  expect(mocks.store.load).toHaveBeenCalledOnce()
})

it('制作中项目可中止且必须二次确认', async () => {
  const user = userEvent.setup()
  const state = game()
  state.works = [{
    id: 'work_01', status: 'producing', mode: 'contract', offer: { name: '星海邮差' },
    opened_week: 0, deadline_week: 26, supervisor_staff_id: null,
    plan: { intensity: 'standard', focus: 'quality', outsourcing: 'none', overtime: false },
    common: { id: 'work_01.common', items: [] }, episodes: [],
  } as unknown as V4Project]
  mocks.store.game = state
  render(<V4Workbench />)
  await user.click(screen.getByRole('button', { name: /^制作与外包/ }))
  await user.click(screen.getByRole('button', { name: '中止项目' }))
  expect(mocks.store.command).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '取消中止' }))
  await user.click(screen.getByRole('button', { name: '中止项目' }))
  await user.click(screen.getByRole('button', { name: '确认中止' }))
  expect(mocks.store.command).toHaveBeenCalledWith('abort_work', { work_id: 'work_01' })
})

it('员工成长面板展示经验、升级与潜力揭示，未揭示上限保持隐藏', async () => {
  const user = userEvent.setup()
  const state = game()
  state.company.week = 1
  state.staff = [staff()]
  mocks.store.game = state
  mocks.store.lastReport = {
    week: 0,
    staff: [{
      staff_id: 'staff_01', produced: 80, fatigue: 8, morale: 78,
      growth: { experience_gain: { planning: 10 }, ability_gain: { planning: 1 }, potential_revealed: ['direction'] },
    }],
  }
  render(<V4Workbench />)
  await user.click(screen.getByRole('button', { name: '员工成长' }))
  expect(screen.getByRole('heading', { name: '员工成长' })).toBeInTheDocument()
  expect(screen.getByText('最近推进回执 · 结算周 W0')).toBeInTheDocument()
  const card = screen.getByRole('heading', { name: '测试员工' }).closest('article')!
  expect(within(card).getByText('30')).toBeInTheDocument()
  expect(within(card).getByText(/经验 1/)).toBeInTheDocument()
  expect(within(card).getByText(/EXP \+1/)).toBeInTheDocument()
  expect(within(card).getByText(/能力 \+1/)).toBeInTheDocument()
  expect(within(card).getByText('潜力揭示')).toBeInTheDocument()
  expect(within(card).getByText(/40 \/ 60/)).toBeInTheDocument()
  expect(within(card).getByLabelText('测试员工 演出 潜力进度')).toBeInTheDocument()
  expect(within(card).queryByLabelText('测试员工 企划 潜力进度')).not.toBeInTheDocument()
  expect(within(card).getAllByText(/潜力未揭示/).length).toBeGreaterThan(0)
  expect(within(card).queryByText('30 / 50')).not.toBeInTheDocument()
})

it('经营总结区分综合结局与作品评级，并展示商业、评价和员工终局快照', async () => {
  const user = userEvent.setup()
  const state = game()
  state.company.status = 'ended'
  state.company.week = 26
  state.company.reputation = 10000
  state.finance.balance = 1800000
  const member = staff()
  for (const ability of Object.keys(member.abilities) as (keyof V4Staff['abilities'])[]) member.abilities[ability] = 60
  state.staff = [member]
  state.archive = { works: [endedWork()], series: [], company_result: endedResult() }
  const snapshot = state.archive.company_result!.team.core_members[0]
  snapshot.maxed_dimensions = ['planning', 'direction']
  state.archive.company_result!.team.maxed_dimensions = 2
  mocks.store.game = state
  render(<V4Workbench />)
  await user.click(screen.getByRole('button', { name: '委员会与 Archive' }))
  const report = screen.getByRole('region', { name: '公司经营总结' })
  expect(within(report).getByTestId('company-ending')).toHaveTextContent('A')
  expect(within(report).getByTestId('portfolio-rating')).toHaveTextContent('B')
  expect(within(report).getByText('m5_company_v1 · candidate')).toBeInTheDocument()
  expect(within(report).getByText('质量 20＋财务 20＋影响 15＋团队 15，满分 70。权重、门槛与成就倍率尚未冻结，不代表经济平衡验收。')).toBeInTheDocument()
  expect(within(report).getByText(/仅成就评价按候选模型跨档，风险评价不直接降档/)).toBeInTheDocument()
  expect(within(report).getByText('¥1,800,000')).toBeInTheDocument()
  expect(within(report).getAllByText('¥100').length).toBeGreaterThanOrEqual(2)
  expect(within(report).getByText('¥200')).toBeInTheDocument()
  expect(within(report).getByText('当时团队')).toBeInTheDocument()
  expect(within(report).getByText('声望达到 T5 及以上')).toBeInTheDocument()
  expect(within(report).getByText('公司现金净流出')).toBeInTheDocument()
  expect(within(report).getByText('代表作：星海邮差')).toBeInTheDocument()
  expect(within(report).getByText('参与作品：星海邮差')).toBeInTheDocument()
  expect(within(report).getByText(/当前等级经验仅是升级阈值内的进度总和/)).toBeInTheDocument()
  expect(within(report).getByLabelText('测试员工 演出 终局能力')).toBeInTheDocument()
  expect(within(report).queryByLabelText('测试员工 企划 终局能力')).not.toBeInTheDocument()
  expect(within(report).getByText('触顶维度').nextElementSibling).toHaveTextContent('1')
  const card = within(report).getByRole('heading', { name: '测试员工' }).closest('article')!
  const hiddenRow = within(card).getByText('企划').closest<HTMLElement>('.v4-ability-row')!
  expect(hiddenRow).not.toHaveClass('is-maxed')
  expect(within(hiddenRow).queryByText('60 MAX')).not.toBeInTheDocument()
  expect(within(card).getAllByText('60 MAX')).toHaveLength(1)
})

it('员工成长面板说明临时员工不进入长期成长', async () => {
  const user = userEvent.setup()
  const state = game()
  const member = staff()
  member.employment = 'temporary'
  state.staff = [member]
  mocks.store.game = state
  render(<V4Workbench />)
  await user.click(screen.getByRole('button', { name: '员工成长' }))
  expect(screen.getByText('尚无周结算回执')).toBeInTheDocument()
  expect(screen.getByText('临时员工不进入长期成长，结项后退出名册。')).toBeInTheDocument()
})
