import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as core from '../services/gameCore'
import { loadGame, saveGame } from '../services/saveGame'
import { deferred, v3EndedState, v3IdleState, v3ProducingState, v3ReadyState, v3SettledState, v3WeekReport } from '../test/fixtures'
import { useGameStore } from './gameStore'

vi.mock('../services/gameCore', () => ({ initializeGame: vi.fn(), startProject: vi.fn(), applyDecision: vi.fn(), advanceWeek: vi.fn(), calculateProjectResult: vi.fn(), calculateCompanyResult: vi.fn() }))
vi.mock('../services/saveGame', () => ({ loadGame: vi.fn(), saveGame: vi.fn() }))

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/')
  useGameStore.setState(useGameStore.getInitialState())
})
afterEach(() => vi.restoreAllMocks())

const store = () => useGameStore.getState()
const workResult = () => v3SettledState().history[0]
const companyResult = () => v3EndedState().company_result!
const actions = [
  { name: 'start', service: core.initializeGame, invoke: () => store().start(12345) },
  { name: 'startProject', service: core.startProject, invoke: () => store().startProject('v3_ova') },
  { name: 'decide', service: core.applyDecision, invoke: () => store().decide({ type: 'end_company' }) },
  { name: 'advance', service: core.advanceWeek, invoke: () => store().advance() },
  { name: 'settle', service: core.calculateProjectResult, invoke: () => store().settle() },
  { name: 'settleCompany', service: core.calculateCompanyResult, invoke: () => store().settleCompany() },
  { name: 'save', service: saveGame, invoke: () => store().save() },
  { name: 'load', service: loadGame, invoke: () => store().load() },
]

describe('状态操作（服务隔离单元测试，不是 WASM 验证）', () => {
  it('初始无游戏；start 调用核心初始化，成功后才进入 studio 并清理旧回执', async () => {
    expect(store().game).toBeNull()
    expect(store().report).toBeNull()
    expect(store().result).toBeNull()
    expect(store().companyResult).toBeNull()
    const pending = deferred<{ state: ReturnType<typeof v3IdleState>; message: string }>()
    vi.mocked(core.initializeGame).mockReturnValue(pending.promise)
    useGameStore.setState({ game: v3EndedState(), report: v3WeekReport(), result: workResult(), companyResult: companyResult() })
    const request = store().start(12345)
    expect(store().screen).toBe('home')
    expect(store().busy).toBe(true)
    const state = v3IdleState()
    pending.resolve({ state, message: '公司成立' })
    await request
    expect(core.initializeGame).toHaveBeenCalledWith(12345)
    expect(store()).toMatchObject({ screen: 'studio', game: state, report: null, result: null, companyResult: null, busy: false })
  })

  it('未指定种子时使用 crypto.getRandomValues', async () => {
    const random = vi.spyOn(crypto, 'getRandomValues').mockReturnValue(new Uint32Array([987654321]))
    vi.mocked(core.initializeGame).mockResolvedValue({ state: v3IdleState(), message: '公司成立' })
    await store().start()
    expect(random).toHaveBeenCalledWith(expect.any(Uint32Array))
    expect(core.initializeGame).toHaveBeenCalledWith(987654321)
  })

  it.each(['0', '12345', '4294967295'])('URL seed=%s 用于复现，不调用随机生成器', async (seed) => {
    window.history.replaceState(null, '', `/?seed=${seed}`)
    const random = vi.spyOn(crypto, 'getRandomValues')
    vi.mocked(core.initializeGame).mockResolvedValue({ state: v3IdleState(), message: '公司成立' })
    await store().start()
    expect(core.initializeGame).toHaveBeenCalledWith(Number(seed))
    expect(random).not.toHaveBeenCalled()
  })

  it.each(['', '-1', '1.5', '4294967296', 'NaN', 'Infinity', '1e3', '0x10', '%20', '1&seed=2'])('拒绝非法 URL seed=%s 且保留现有游戏', async (seed) => {
    window.history.replaceState(null, '', `/?seed=${seed}`)
    const game = v3ProducingState()
    useGameStore.setState({ game })
    await store().start()
    expect(core.initializeGame).not.toHaveBeenCalled()
    expect(store().game).toBe(game)
    expect(store().error).toMatch(/seed 无效/)
    expect(store().busy).toBe(false)
  })

  it.each([-1, 0.5, NaN, Infinity, 0x100000000])('拒绝显式非法 seed=%s', async (seed) => {
    await store().start(seed)
    expect(core.initializeGame).not.toHaveBeenCalled()
    expect(store().error).toMatch(/种子必须/)
  })

  it('显式 seed 优先于 URL，并接受零', async () => {
    window.history.replaceState(null, '', '/?seed=invalid')
    vi.mocked(core.initializeGame).mockResolvedValue({ state: v3IdleState(), message: '公司成立' })
    await store().start(0)
    expect(core.initializeGame).toHaveBeenCalledWith(0)
  })

  it('接手企划直接采用完整服务状态并清理上轮回执', async () => {
    const before = v3IdleState()
    const next = v3ProducingState()
    useGameStore.setState({ game: before, report: v3WeekReport(), result: workResult(), companyResult: companyResult() })
    vi.mocked(core.startProject).mockResolvedValue({ state: next, message: '核心拨款回执' })
    await store().startProject('v3_ova')
    expect(core.startProject).toHaveBeenCalledWith(before, 'v3_ova')
    expect(store()).toMatchObject({ game: next, notice: '核心拨款回执', report: null, result: null, companyResult: null })
  })

  it('决策传递核心参数，不在前端应用效果；仅返回市场清理项目结算', async () => {
    const before = v3ProducingState()
    const next = { ...v3ProducingState(), seed: 321 }
    const decision = { type: 'configure_stage', stage: 'script', configuration: before.project!.stages.script.recommended_configuration! } as const
    useGameStore.setState({ game: before, result: workResult() })
    vi.mocked(core.applyDecision).mockResolvedValue({ state: next, message: '方案已锁定' })
    await store().decide(decision)
    expect(core.applyDecision).toHaveBeenCalledWith(before, decision)
    expect(store().game).toBe(next)
    expect(store().result).toEqual(workResult())
    const market = v3IdleState()
    vi.mocked(core.applyDecision).mockResolvedValue({ state: market, message: '回到企划市场' })
    await store().decide({ type: 'return_to_market' })
    expect(core.applyDecision).toHaveBeenCalledWith(next, { type: 'return_to_market' })
    expect(store()).toMatchObject({ game: market, result: null, notice: '回到企划市场' })
  })

  it('推进直接采用返回 seed、phase 与完整周报，不重算状态', async () => {
    const before = v3ProducingState()
    const next = v3ReadyState()
    const report = v3WeekReport()
    useGameStore.setState({ game: before })
    vi.mocked(core.advanceWeek).mockResolvedValue({ state: next, report })
    await store().advance()
    expect(core.advanceWeek).toHaveBeenCalledWith(before)
    expect(store().game).toBe(next)
    expect(store().report).toBe(report)
    expect(before.seed).toBe(12345)
  })

  it('项目结算采用核心的 settled 状态与 WorkRecord，返回首页和继续经营不重初始化', async () => {
    const before = v3ReadyState()
    const next = v3SettledState()
    const result = next.history[0]
    useGameStore.setState({ screen: 'studio', game: before, report: v3WeekReport() })
    vi.mocked(core.calculateProjectResult).mockResolvedValue({ state: next, scope: 'project', result })
    await store().settle()
    expect(core.calculateProjectResult).toHaveBeenCalledWith(before)
    expect(store().game).toBe(next)
    expect(store().result).toBe(result)
    store().goHome()
    expect(store().screen).toBe('home')
    expect(store().game).toBe(next)
    store().resume()
    expect(store().screen).toBe('studio')
    expect(store().result).toBe(result)
    expect(core.initializeGame).not.toHaveBeenCalled()
  })

  it('经营总结采用核心的终局状态与 CompanyResult', async () => {
    const before = { ...v3IdleState(), company: { ...v3IdleState().company, status: 'closing' as const, end_reason: 'voluntary' as const }, offers: [], preview: null }
    const next = v3EndedState()
    useGameStore.setState({ screen: 'studio', game: before, result: workResult() })
    vi.mocked(core.calculateCompanyResult).mockResolvedValue({ state: next, scope: 'company', result: next.company_result! })
    await store().settleCompany()
    expect(core.calculateCompanyResult).toHaveBeenCalledWith(before)
    expect(store().game).toBe(next)
    expect(store().companyResult).toBe(next.company_result)
    expect(store().result).toEqual(workResult())
  })

  it('保存与读取通过存档服务执行，成功载入才清理回执', async () => {
    const state = v3ProducingState()
    useGameStore.setState({ game: state, report: v3WeekReport(), result: workResult(), companyResult: companyResult() })
    vi.mocked(saveGame).mockResolvedValue('saved')
    await store().save()
    expect(saveGame).toHaveBeenCalledWith(state, false)
    expect(store().report).toEqual(v3WeekReport())
    const next = v3ReadyState()
    vi.mocked(loadGame).mockResolvedValue(next)
    await store().load()
    expect(store()).toMatchObject({ game: next, screen: 'studio', report: null, result: null, companyResult: null, notice: '已读取本地存档。' })
  })

  it('读取后立即保存写入的就是载入状态，不在前端重建任何字段', async () => {
    const saved = v3SettledState()
    vi.mocked(loadGame).mockResolvedValue(saved)
    await store().load()
    vi.mocked(saveGame).mockResolvedValue('saved')
    await store().save()
    expect(saveGame).toHaveBeenCalledWith(saved, false)
    expect(store().game).toBe(saved)
  })

  it('单槽被占用时不写入，等待玩家确认后才带 overwrite 保存', async () => {
    const game = v3ProducingState()
    useGameStore.setState({ screen: 'studio', game, notice: '上一轮提示' })
    vi.mocked(saveGame).mockResolvedValue('occupied')
    await store().save()
    expect(store()).toMatchObject({ game, busy: false, saveConflict: true, notice: '此浏览器已有存档，覆盖后旧存档不可恢复。' })
    expect(store().error).toBeNull()
    vi.mocked(saveGame).mockClear()
    vi.mocked(saveGame).mockResolvedValue('saved')
    await store().save(true)
    expect(saveGame).toHaveBeenCalledWith(game, true)
    expect(store()).toMatchObject({ saveConflict: false, notice: '已保存到此浏览器。' })
  })

  it('取消覆盖只收起确认提示，不动游戏状态', async () => {
    const game = v3ProducingState()
    useGameStore.setState({ screen: 'studio', game, saveConflict: true, notice: '此浏览器已有存档，覆盖后旧存档不可恢复。' })
    store().cancelOverwrite()
    expect(store()).toMatchObject({ game, saveConflict: false, notice: null })
    expect(saveGame).not.toHaveBeenCalled()
  })

  it.each(['start', 'advance', 'load'])('玩家改做 %s 时确认提示随 notice 一起失效', async (action) => {
    useGameStore.setState({ screen: 'studio', game: v3ProducingState(), saveConflict: true, notice: '此浏览器已有存档，覆盖后旧存档不可恢复。' })
    vi.mocked(core.initializeGame).mockResolvedValue({ state: v3IdleState(), message: '公司成立' })
    vi.mocked(core.advanceWeek).mockResolvedValue({ state: v3ReadyState(), report: v3WeekReport() })
    vi.mocked(loadGame).mockResolvedValue(v3SettledState())
    await (action === 'start' ? store().start(12345) : action === 'advance' ? store().advance() : store().load())
    expect(store().saveConflict).toBe(false)
  })

  it('确认提示在返回首页与继续经营之间不残留', () => {
    useGameStore.setState({ screen: 'studio', game: v3ProducingState(), saveConflict: true, notice: '此浏览器已有存档，覆盖后旧存档不可恢复。' })
    store().goHome()
    expect(store()).toMatchObject({ screen: 'home', saveConflict: false, notice: null })
    store().resume()
    expect(store().saveConflict).toBe(false)
  })

  it('没有存档时不覆盖现有状态或回执', async () => {
    const game = v3ProducingState()
    useGameStore.setState({ game, report: v3WeekReport(), result: workResult(), companyResult: companyResult() })
    vi.mocked(loadGame).mockResolvedValue(null)
    await store().load()
    expect(store()).toMatchObject({ game, report: v3WeekReport(), result: workResult(), companyResult: companyResult(), screen: 'home', notice: '此浏览器还没有存档。' })
  })

  it('没有游戏时不调用依赖 state 的动作，也不能继续', async () => {
    store().resume()
    for (const action of actions.filter(({ name }) => !['start', 'load'].includes(name))) await action.invoke()
    for (const { service } of actions) expect(service).not.toHaveBeenCalled()
    expect(store().screen).toBe('home')
    expect(store().game).toBeNull()
  })

  it.each(actions)('$name 失败保留游戏、页面、report、result、companyResult 并释放 busy', async ({ service, invoke }) => {
    const game = v3ProducingState()
    const report = v3WeekReport()
    const result = workResult()
    const summary = companyResult()
    useGameStore.setState({ game, report, result, companyResult: summary, screen: 'studio' })
    vi.mocked(service).mockRejectedValue(new Error('隔离测试失败'))
    await invoke()
    expect(store().game).toBe(game)
    expect(store().report).toBe(report)
    expect(store().result).toBe(result)
    expect(store().companyResult).toBe(summary)
    expect(store()).toMatchObject({ screen: 'studio', busy: false, error: '隔离测试失败' })
  })

  it.each(actions)('$name 持锁时阻止全部异步动作和页面切换', async ({ service, invoke }) => {
    const pending = deferred<never>()
    useGameStore.setState({ game: v3ProducingState(), screen: 'studio' })
    vi.mocked(service).mockReturnValue(pending.promise)
    const request = invoke()
    expect(store().busy).toBe(true)
    for (const action of actions) await action.invoke()
    store().goHome()
    store().resume()
    expect(store().screen).toBe('studio')
    for (const action of actions) expect(action.service).toHaveBeenCalledTimes(action.service === service ? 1 : 0)
    pending.reject(new Error('释放测试请求'))
    await request
    expect(store().busy).toBe(false)
    vi.mocked(saveGame).mockResolvedValue('saved')
    await store().save()
    expect(store().notice).toBe('已保存到此浏览器。')
  })
})
