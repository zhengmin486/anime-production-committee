import { createRequire } from 'node:module'
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useV4Game } from './useV4Game'
import { adaptReceipt, adaptV4State } from './v4Adapter'
import { FinanceArchive } from './FinanceArchive'
import { ReleaseStatus } from './MarketBusiness'
import { WeeklyReceiptPreview, producingProjectCount } from './WeeklyOperations'
import type { V4GameState, V4Quality, V4VendorReceipt, V4WeekReport } from './v4Types'

const mocks = vi.hoisted(() => ({ initializeGameV4: vi.fn() }))

vi.mock('../services/gameV4', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/gameV4')>()
  return { ...actual, initializeGameV4: mocks.initializeGameV4 }
})

const require = createRequire(import.meta.url)
const createV4 = require('../../../../build/v4/v4.mjs').default as (options?: Record<string, unknown>) => Promise<Record<string, (input: string) => string>>
const core = await createV4()
const invoke = (method: string, input: unknown) => JSON.parse(core[method](JSON.stringify(input))) as { state: V4GameState; report?: V4WeekReport; vendor?: V4VendorReceipt; fee_total?: number; error?: { code: string; message: string } }
const initialState = invoke('initialize_game', { seed: 20261127 }).state
const projectState = (() => {
  const response = invoke('start_work', { state: initialState, offer_id: initialState.market.slots[0].id, mode: 'contract' })
  if (response.error) throw new Error(response.error.message)
  return response.state
})()
const settledState = (() => {
  const state = structuredClone(projectState)
  const items = [...state.works[0].common.items, ...state.works[0].episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))]
  for (const item of items) if (item.is_gate) item.work_done = item.work_total
  const response = invoke('deliver_work', { state, work_id: state.works[0].id })
  if (response.error) throw new Error(response.error.message)
  return response.state
})()
const bankruptResponse = (() => {
  const state = structuredClone(initialState)
  state.finance.entries.push({ id: 'test.bankrupt.adjustment', week: 0, work_id: null, category: 'operations', amount: -1_900_000, counterparty: null, memo: '测试现金调整' })
  state.finance.balance = 100_000
  const response = invoke('advance_week', { state })
  if (response.error) throw new Error(response.error.message)
  return response
})()

beforeEach(() => {
  mocks.initializeGameV4.mockReset()
  mocks.initializeGameV4.mockResolvedValue({ state: structuredClone(initialState) })
})

describe('useV4Game 状态边界', () => {
  it('核心失败时保留原状态并显示错误', async () => {
    const { result } = renderHook(() => useV4Game())
    await waitFor(() => expect(result.current.state).not.toBeNull())
    const before = result.current.state
    const { GameV4Error } = await import('../services/gameV4')
    let accepted = true
    await act(async () => {
      accepted = await result.current.execute(() => Promise.reject(new GameV4Error('GATE_UNMET', '门槛未达标')))
    })
    expect(accepted).toBe(false)
    expect(result.current.state).toBe(before)
    expect(result.current.data?.company.cash).toBe(2_000_000)
    expect(result.current.error).toBe('GATE_UNMET：门槛未达标')
    expect(result.current.busy).toBe(false)
  })

  it('交付/关闭动作报告不被误当作周报，状态仍成功提交', async () => {
    const { result } = renderHook(() => useV4Game())
    await waitFor(() => expect(result.current.state).not.toBeNull())
    let accepted = false
    await act(async () => {
      accepted = await result.current.execute(() => Promise.resolve({ state: structuredClone(settledState), report: { archived: true, work_id: 'work_01' } }))
    })
    expect(accepted).toBe(true)
    expect(result.current.state?.works).toHaveLength(0)
    expect(result.current.state?.archive.works).toHaveLength(1)
    expect(result.current.receipts).toHaveLength(1)
    expect(result.current.error).toBeNull()
  })

  it('命令未完成时拒绝重复提交，成功后只提交一次', async () => {
    const { result } = renderHook(() => useV4Game())
    await waitFor(() => expect(result.current.state).not.toBeNull())
    let finish!: (value: { state: V4GameState }) => void
    const pending = new Promise<{ state: V4GameState }>((resolve) => { finish = resolve })
    const command = vi.fn(() => pending)
    let first!: Promise<boolean>
    act(() => { first = result.current.execute(command) })
    expect(result.current.busy).toBe(true)
    let second = false
    await act(async () => { second = await result.current.execute(command) })
    expect(second).toBe(false)
    expect(command).toHaveBeenCalledTimes(1)
    await act(async () => {
      finish({ state: structuredClone(projectState) })
      expect(await first).toBe(true)
    })
    expect(result.current.state?.works).toHaveLength(1)
    expect(result.current.state?.finance.balance).toBe(3_200_000)
    expect(result.current.busy).toBe(false)
  })
})

describe('v4Adapter 核心事实映射', () => {
  it('按千分比门槛公式映射达标状态，不把阶段顺序当作依赖', () => {
    const state = structuredClone(projectState)
    const project = state.works[0]
    const common = project.common.items[0]
    common.is_gate = true
    common.deps = []
    common.work_total = 1000
    common.deliver_at = 731
    common.work_done = 730
    let display = adaptV4State(state).projects[0]
    expect(display.commonItems.find((item) => item.key === common.key)?.state).toBe('active')
    common.work_done = 731
    display = adaptV4State(state).projects[0]
    expect(display.commonItems.find((item) => item.key === common.key)?.state).toBe('delivered')
    expect(display.deliveredEpisodeCount).toBe(0)
  })

  it('质量按核心阶段工作量、阶段等权、单集等权聚合，排除公共制作', () => {
    const state = structuredClone(projectState)
    for (const project of state.works) {
      for (const item of project.common.items) for (const dimension of Object.keys(item.quality) as Array<keyof V4Quality>) item.quality[dimension] = 100
      for (const episode of project.episodes) for (const stage of episode.stages) for (const item of stage.items) {
        for (const dimension of Object.keys(item.quality) as Array<keyof V4Quality>) item.quality[dimension] = 0
        item.work_total = 0
      }
      for (const episode of project.episodes) {
        const items = episode.stages[0].items
        items[0].work_total = 1
        items[1].work_total = 3
        for (const dimension of Object.keys(items[0].quality) as Array<keyof V4Quality>) {
          items[0].quality[dimension] = 12
          items[1].quality[dimension] = 24
        }
      }
    }
    expect(adaptV4State(state).projects[0].quality).toBe(4)
  })

  it('质量展示截顶 100，不把核心内部 105 上限画成超量条', () => {
    const active = structuredClone(projectState)
    for (const item of active.works[0].episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))) {
      for (const dimension of Object.keys(item.quality) as Array<keyof V4Quality>) item.quality[dimension] = 105
    }
    expect(adaptV4State(active).projects[0].quality).toBe(100)

    const archived = structuredClone(settledState)
    archived.archive.works[0].quality.mean = 105
    archived.archive.works[0].quality_score = 100
    expect(adaptV4State(archived).history[0].quality).toBe(100)
  })

  it('破产周报缺少 costs 时仍生成回滚与关闭回执', () => {
    expect(bankruptResponse.report?.funds.costs).toBeUndefined()
    const receipt = adaptReceipt(bankruptResponse.state, bankruptResponse.report)
    expect(receipt.closing?.reason).toBe('bankrupt')
    expect(receipt.rejected?.shortfall).toBe(50_000)
    expect(receipt.costLines).toEqual([])
    expect(receipt.state).toBe('closing')
  })

  it('上游工作项未达标时递归标记依赖阻塞', () => {
    const state = structuredClone(projectState)
    const items = state.works[0].common.items
    const upstream = items[0]
    const downstream = items[1]
    upstream.deps = []
    upstream.work_total = 1000
    upstream.deliver_at = 1000
    upstream.work_done = 0
    downstream.deps = [upstream.id]
    downstream.work_done = 0
    const display = adaptV4State(state).projects[0]
    expect(display.commonItems.find((item) => item.key === upstream.key)?.state).toBe('ready')
    expect(display.commonItems.find((item) => item.key === downstream.key)?.state).toBe('blocked')
  })

  it('供应商与外包合同来自核心状态，事件保留应急外包请求', () => {
    const state = structuredClone(projectState)
    const items = [...state.works[0].common.items, ...state.works[0].episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))]
    const item = items.find((entry) => entry.work_done < entry.work_total && entry.deps.every((id) => {
      const dependency = items.find((candidate) => candidate.id === id)
      return dependency && dependency.work_done * 1000 >= dependency.deliver_at * dependency.work_total
    }) && state.suppliers.some((supplier) => supplier.unlocked_week <= state.company.week && supplier.specialties.includes(entry.ability)))
    const supplier = state.suppliers.find((entry) => entry.unlocked_week <= state.company.week && entry.specialties.includes(item!.ability))!
    const response = invoke('sign_outsourcing', { state, work_id: state.works[0].id, item_id: item!.id, supplier_id: supplier.id, work_total: 1, mode: 'normal' })
    if (response.error) throw new Error(response.error.message)
    expect(response.fee_total).toBeGreaterThan(0)
    const display = adaptV4State(response.state)
    expect(display.suppliers).toHaveLength(response.state.suppliers.length)
    expect(display.outsourcing[0]).toMatchObject({ projectId: state.works[0].id, supplierId: supplier.id, workTotal: 1, workDone: 0 })

    response.state.events.pending.push({
      event_id: 'vendor_emergency', name: '应急外包', work_id: state.works[0].id, triggered_week: 0,
      expires_week: null, cooldown_weeks: 0, once_per_project: false, viewed: false,
      options: [{ id: 'accept', label: '外包', kind: 'accept', risk_hint: '', cost: 0, effects: [], vendor_request: { item_id: item!.id, supplier_id: supplier.id, work_total: 1 } }],
      timeout_option_id: '', escalated: false, escalation: null,
    })
    expect(adaptV4State(response.state).pendingEvents[0].options[0].gain).toContain('应急外包 1 工作点')
  })

  it('招聘、签约与解雇走真实核心命令', () => {
    const scouted = invoke('scout', { state: structuredClone(initialState) })
    if (scouted.error) throw new Error(scouted.error.message)
    expect(scouted.state.recruitment.pool).toHaveLength(initialState.recruitment.pool.length + 1)
    const candidateId = scouted.state.recruitment.pool.at(-1)!.staff.id
    const hired = invoke('hire_core', { state: scouted.state, staff_id: candidateId })
    if (hired.error) throw new Error(hired.error.message)
    expect(hired.state.staff).toHaveLength(initialState.staff.length + 1)
    const dismissed = invoke('dismiss_staff', { state: hired.state, staff_id: candidateId })
    if (dismissed.error) throw new Error(dismissed.error.message)
    expect(dismissed.state.staff).toHaveLength(initialState.staff.length)
  })

  it('无期限事件保留 null，不把冷却时间伪装成截止周', () => {
    const state = structuredClone(projectState)
    state.events.pending.push({
      event_id: 'station_visit', name: '电视台探班', work_id: state.works[0].id, triggered_week: 6,
      expires_week: null, cooldown_weeks: 12, once_per_project: false, viewed: false,
      options: [{ id: 'decline', label: '婉拒', kind: 'decline', risk_hint: '', cost: 0, effects: [], vendor_request: null }],
      timeout_option_id: '', escalated: false, escalation: null,
    })
    expect(adaptV4State(state).pendingEvents[0].deadlineWeek).toBeNull()
  })
})

describe('周报项目计数', () => {
  it('同一作品的多个工作项只计为一部有产出项目', () => {
    const response = invoke('advance_week', { state: structuredClone(projectState) })
    if (response.error) throw new Error(response.error.message)
    const receipt = adaptReceipt(response.state, response.report)
    expect(response.report?.works).toHaveLength(1)
    expect(receipt.projectLines.length).toBeGreaterThan(1)
    expect(producingProjectCount(receipt)).toBe(1)
    render(<WeeklyReceiptPreview receipt={receipt} onOpen={vi.fn()} />)
    expect(screen.getByText(/有产出项目 1 部/)).toBeVisible()
  })
})

describe('归档与核心流水', () => {
  it('发行筛选从 Archive 展示已交付作品，不依赖已移除的在制项目', async () => {
    const user = userEvent.setup()
    render(<ReleaseStatus data={adaptV4State(settledState)} onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '已归档作品' }))
    expect(within(screen.getByRole('region', { name: '作品发行情况与观众反馈' })).getByRole('heading', { name: '星海邮差' })).toBeVisible()
    expect(screen.getByText(/已归档 · 评级/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '查看作品详情' })).not.toBeInTheDocument()
  })

  it('归档作品的流水仍可归因到作品名', async () => {
    const user = userEvent.setup()
    render(<FinanceArchive data={adaptV4State(settledState)} />)
    const attribution = screen.getByRole('combobox', { name: '归因' })
    await user.selectOptions(attribution, settledState.archive.works[0].id)
    expect(screen.getByRole('table', { name: '公司现金流水' })).toHaveTextContent('星海邮差')
    expect(screen.getByRole('table', { name: '公司现金流水' })).not.toHaveTextContent('公司统一账目')
  })
})
