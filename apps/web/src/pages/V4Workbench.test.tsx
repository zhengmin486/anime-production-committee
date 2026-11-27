import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import type { V4GameState, V4Project } from '../types/gameV4State'
import V4Workbench from './V4Workbench'

const mocks = vi.hoisted(() => ({
  store: {
    game: null as V4GameState | null,
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

beforeEach(() => {
  mocks.store.game = null
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
