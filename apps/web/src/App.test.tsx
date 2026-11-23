import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { useGameCore } from './hooks/useGameCore'
import * as core from './services/gameCore'
import { loadGame, saveGame } from './services/saveGame'
import { useGameStore } from './stores/gameStore'
import { deferred, v3IdleState, v3ProducingState, v3ReadyState, v3SettledState, v3WeekReport } from './test/fixtures'
import type { GameState } from './types/gameV3'

// 只隔离 React 交互与服务边界；真实 WASM / 浏览器验收由独立测试负责。
vi.mock('./hooks/useGameCore', () => ({ useGameCore: vi.fn() }))
vi.mock('./services/gameCore', () => ({ initializeGame: vi.fn(), startProject: vi.fn(), applyDecision: vi.fn(), advanceWeek: vi.fn(), calculateProjectResult: vi.fn(), calculateCompanyResult: vi.fn() }))
vi.mock('./services/saveGame', () => ({ loadGame: vi.fn(), saveGame: vi.fn() }))

function startedState(): GameState {
  const next = v3ProducingState()
  next.project!.stages.script = { ...next.project!.stages.script, status: 'ready', configuration: null }
  next.preview = null
  return next
}

beforeEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/?seed=12345')
  useGameStore.setState(useGameStore.getInitialState())
  vi.mocked(useGameCore).mockReturnValue({ status: 'ready', error: null, retry: vi.fn() })
})

it('串联新开、接手、阶段配置、推进、结算与返回市场，展示核心返回值', async () => {
  const user = userEvent.setup()
  const initial = v3IdleState()
  const started = startedState()
  const configured = v3ProducingState()
  const ready = v3ReadyState()
  const settled = v3SettledState()
  const market = v3IdleState()
  vi.mocked(core.initializeGame).mockResolvedValue({ state: initial, message: '公司成立' })
  vi.mocked(core.startProject).mockResolvedValue({ state: started, message: '企划拨款已到账' })
  vi.mocked(core.applyDecision).mockResolvedValueOnce({ state: configured, message: '阶段方案已锁定' }).mockResolvedValueOnce({ state: market, message: '回到企划市场' })
  vi.mocked(core.advanceWeek).mockResolvedValue({ state: ready, report: v3WeekReport() })
  vi.mocked(core.calculateProjectResult).mockResolvedValue({ state: settled, scope: 'project', result: settled.history[0] })
  render(<App />)
  await user.click(screen.getByRole('button', { name: /开始经营/ }))
  expect(core.initializeGame).toHaveBeenCalledWith(12345)
  expect(screen.getByTestId('funds')).toHaveTextContent('5,000,000')
  expect(screen.getByTestId('week')).toHaveTextContent('0')
  expect(screen.getByText(/第 1 周预计支出 ¥120,000：工资 ¥100,000 \/ 运营 ¥20,000 \/ 生产 ¥0 \/ 事件概率 0‰/)).toBeVisible()
  const offers = within(screen.getByRole('region', { name: '企划报价' }))
  expect(offers.getAllByRole('button')).toHaveLength(4)
  expect(offers.getAllByText('承制 / 委员会')).toHaveLength(3)
  expect(offers.getByText('委员会', { exact: true })).toBeVisible()
  await user.click(offers.getByRole('button', { name: '接手：放学后的第七帧' }))
  expect(core.startProject).toHaveBeenCalledWith(initial, 'v3_ova')
  expect(screen.getByTestId('funds')).toHaveTextContent('7,000,000')
  expect(screen.getByTestId('progress-script')).toHaveTextContent('0%')
  expect(screen.getByText('截止周')).toBeVisible()
  expect(screen.getByLabelText('制作方针')).toHaveValue('balanced')
  await user.selectOptions(screen.getByLabelText('制作方针'), 'quality')
  await user.click(screen.getByLabelText('加班'))
  await user.click(screen.getByRole('button', { name: '锁定阶段方案' }))
  expect(core.applyDecision).toHaveBeenCalledWith(started, {
    type: 'configure_stage', stage: 'script',
    configuration: {
      assignments: [
        { staff_id: 'v3_director', role: 'director', focus: 'direction' },
        { staff_id: 'v3_artist', role: 'key_animator', focus: 'drawing' },
      ], policy: 'quality', overtime: true,
    },
  })
  expect(screen.getByLabelText('制作方针')).toBeDisabled()
  expect(screen.getByLabelText('加班')).toBeDisabled()
  expect(screen.getByLabelText('林导演专注')).toBeDisabled()
  expect(screen.getByText('方案已锁定：本阶段推进期间配置控件禁用，不可更改。')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '推进本周' }))
  expect(core.advanceWeek).toHaveBeenCalledWith(configured)
  expect(screen.getByTestId('week')).toHaveTextContent('5')
  expect(screen.getByTestId('week-report')).toHaveTextContent(v3WeekReport().messages[0])
  expect(screen.getByTestId('week-report')).toHaveTextContent('-200,000')
  expect(screen.getByTestId('week-report')).toHaveTextContent('进度 +40 / 质量 +60')
  expect(screen.queryByRole('button', { name: '推进本周' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '结算项目' }))
  expect(core.calculateProjectResult).toHaveBeenCalledWith(ready)
  const result = screen.getByRole('region', { name: '项目结算' })
  expect(result).toHaveAttribute('data-testid', 'project-result')
  expect(result).toHaveTextContent('70')
  expect(result).toHaveTextContent('20,000,000')
  expect(result).toHaveTextContent('+1,000,000')
  expect(screen.getByTestId('funds')).toHaveTextContent('6,000,000')
  expect(screen.getByRole('region', { name: '作品履历' })).toHaveTextContent('放学后的第七帧')
  expect(screen.queryByRole('button', { name: '结算项目' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '回到企划市场' }))
  expect(core.applyDecision).toHaveBeenLastCalledWith(settled, { type: 'return_to_market' })
  expect(screen.getByRole('region', { name: '企划报价' })).toBeVisible()
  expect(screen.queryByTestId('project-result')).not.toBeInTheDocument()
})

it('阶段配置默认采用核心推荐，专注选择随决策提交', async () => {
  const user = userEvent.setup()
  const game = startedState()
  useGameStore.setState({ screen: 'studio', game })
  render(<App />)
  expect(screen.getByLabelText('制作方针')).toHaveValue('balanced')
  expect(screen.getByLabelText('林导演专注')).toHaveValue('direction')
  expect(screen.getByLabelText('陈原画专注')).toHaveValue('drawing')
  expect(screen.getByLabelText('加班')).not.toBeChecked()
  const next = v3ProducingState()
  vi.mocked(core.applyDecision).mockResolvedValue({ state: next, message: '阶段方案已锁定' })
  await user.selectOptions(screen.getByLabelText('陈原画专注'), 'animation')
  await user.selectOptions(screen.getByLabelText('制作方针'), 'deadline')
  await user.click(screen.getByRole('button', { name: '锁定阶段方案' }))
  expect(core.applyDecision).toHaveBeenCalledWith(game, {
    type: 'configure_stage', stage: 'script',
    configuration: {
      assignments: [
        { staff_id: 'v3_director', role: 'director', focus: 'direction' },
        { staff_id: 'v3_artist', role: 'key_animator', focus: 'animation' },
      ], policy: 'deadline', overtime: false,
    },
  })
  expect(screen.getByRole('button', { name: '推进本周' })).toBeEnabled()
  expect(screen.getByLabelText('制作方针')).toBeDisabled()
  expect(screen.queryByRole('button', { name: '锁定阶段方案' })).not.toBeInTheDocument()
})

it('保存、返回首页、继续与读取保留完整状态，不进行隐式初始化', async () => {
  const user = userEvent.setup()
  const game = v3ProducingState()
  useGameStore.setState({ screen: 'studio', game, report: v3WeekReport() })
  vi.mocked(saveGame).mockResolvedValue('saved')
  vi.mocked(loadGame).mockResolvedValue(v3ReadyState())
  render(<App />)
  await user.click(screen.getByRole('button', { name: '保存进度' }))
  expect(saveGame).toHaveBeenCalledWith(game, false)
  expect(screen.getByText('已保存到此浏览器。')).toBeVisible()
  await user.click(screen.getByRole('button', { name: '返回首页' }))
  await user.click(screen.getByRole('button', { name: '继续经营' }))
  expect(screen.getByRole('region', { name: '项目制作' })).toBeVisible()
  expect(screen.getByTestId('week-report')).toBeVisible()
  expect(core.initializeGame).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '读取存档' }))
  expect(loadGame).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('button', { name: '结算项目' })).toBeEnabled()
  expect(screen.queryByTestId('week-report')).not.toBeInTheDocument()
})

it('推进等待期间禁止重复请求与所有操作，失败保留状态和回执', async () => {
  const user = userEvent.setup()
  const game = v3ProducingState()
  const pending = deferred<{ state: GameState; report: ReturnType<typeof v3WeekReport> }>()
  useGameStore.setState({ screen: 'studio', game, report: v3WeekReport() })
  vi.mocked(core.advanceWeek).mockReturnValue(pending.promise)
  render(<App />)
  await user.click(screen.getByRole('button', { name: '推进本周' }))
  await user.click(screen.getByRole('button', { name: '推进本周' }))
  for (const control of screen.getAllByRole('button')) expect(control).toBeDisabled()
  expect(core.advanceWeek).toHaveBeenCalledTimes(1)
  await act(async () => pending.reject(new Error('核心调用失败：原状态保留')))
  expect(screen.getByRole('alert')).toHaveTextContent('核心调用失败：原状态保留')
  expect(screen.getByTestId('funds')).toHaveTextContent('7,000,000')
  expect(screen.getByTestId('progress-script')).toHaveTextContent('0%')
  expect(screen.getByTestId('week-report')).toHaveTextContent(v3WeekReport().messages[0])
  expect(screen.getByRole('button', { name: '推进本周' })).toBeEnabled()
  expect(useGameStore.getState().game).toBe(game)
})

it('读取旧版存档显示拒绝提示，不替换当前工作台', async () => {
  const game = v3ProducingState()
  useGameStore.setState({ screen: 'studio', game })
  vi.mocked(loadGame).mockRejectedValue(new Error('v2 存档不兼容周制经营 v3，请新开游戏；旧存档未被覆盖。'))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '读取存档' }))
  expect(screen.getByRole('alert')).toHaveTextContent('v2 存档不兼容周制经营 v3')
  expect(useGameStore.getState().game).toBe(game)
  expect(screen.getByTestId('progress-script')).toHaveTextContent('0%')
})

it('单槽被占用时保存要求明确确认，确认后才带 overwrite 写入', async () => {
  const game = v3ProducingState()
  useGameStore.setState({ screen: 'studio', game })
  vi.mocked(saveGame).mockResolvedValueOnce('occupied').mockResolvedValueOnce('saved')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '保存进度' }))
  expect(saveGame).toHaveBeenLastCalledWith(game, false)
  expect(screen.getByText('此浏览器已有存档，覆盖后旧存档不可恢复。')).toBeVisible()
  await userEvent.click(screen.getByRole('button', { name: '确认覆盖本地存档' }))
  expect(saveGame).toHaveBeenLastCalledWith(game, true)
  expect(screen.getByText('已保存到此浏览器。')).toBeVisible()
  expect(screen.queryByRole('button', { name: '确认覆盖本地存档' })).toBeNull()
  expect(screen.getByTestId('progress-script')).toHaveTextContent('0%')
})

it('取消覆盖只收起确认入口，不写入存档也不改动工作台', async () => {
  const game = v3ProducingState()
  useGameStore.setState({ screen: 'studio', game })
  vi.mocked(saveGame).mockResolvedValue('occupied')
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '保存进度' }))
  expect(screen.getByRole('button', { name: '确认覆盖本地存档' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: '取消覆盖' }))
  expect(saveGame).toHaveBeenCalledTimes(1)
  expect(screen.queryByText('此浏览器已有存档，覆盖后旧存档不可恢复。')).toBeNull()
  expect(screen.queryByRole('button', { name: '确认覆盖本地存档' })).toBeNull()
  expect(useGameStore.getState().game).toBe(game)
  expect(screen.getByTestId('progress-script')).toHaveTextContent('0%')
})

it('加载失败提供可操作重试入口，重试成功前禁止新开', async () => {
  const retry = vi.fn()
  vi.mocked(useGameCore).mockReturnValue({ status: 'error', error: '游戏核心加载失败', retry })
  const { rerender } = render(<App />)
  expect(screen.getByRole('alert')).toHaveTextContent('游戏核心加载失败')
  expect(screen.getByRole('button', { name: /开始经营/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: '读取本地存档' })).toBeEnabled()
  await userEvent.click(screen.getByRole('button', { name: '重试加载' }))
  expect(retry).toHaveBeenCalledTimes(1)
  vi.mocked(useGameCore).mockReturnValue({ status: 'ready', error: null, retry })
  rerender(<App />)
  expect(screen.getByRole('button', { name: /开始经营/ })).toBeEnabled()
})

it('核心加载错误不会遮住旧存档拒绝提示', async () => {
  vi.mocked(useGameCore).mockReturnValue({ status: 'error', error: '游戏核心加载失败', retry: vi.fn() })
  vi.mocked(loadGame).mockRejectedValue(new Error('v1 存档不兼容周制经营 v3，请新开游戏；旧存档未被覆盖。'))
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '读取本地存档' }))
  expect(screen.getByText('游戏核心加载失败')).toBeVisible()
  expect(screen.getByText(/v1 存档不兼容周制经营 v3/)).toBeVisible()
  expect(screen.getAllByRole('alert')).toHaveLength(2)
})

it('加载中的提示可读，新游戏按钮不可用', () => {
  vi.mocked(useGameCore).mockReturnValue({ status: 'loading', error: null, retry: vi.fn() })
  render(<App />)
  expect(screen.getByRole('status')).toHaveTextContent('正在加载游戏核心')
  expect(screen.getByRole('button', { name: /开始经营/ })).toBeDisabled()
})

it.each(['loading', 'error'] as const)('核心 %s 时继续已存在的制作台，推进与结束禁用，存档与返回可用', async (status) => {
  useGameStore.setState({ game: v3ProducingState() })
  vi.mocked(useGameCore).mockReturnValue({ status, error: status === 'error' ? '加载失败' : null, retry: vi.fn() })
  render(<App />)
  await userEvent.click(screen.getByRole('button', { name: '继续经营' }))
  expect(screen.getByRole('button', { name: '推进本周' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '结束经营' })).toBeDisabled()
  for (const name of ['保存进度', '读取存档', '返回首页']) expect(screen.getByRole('button', { name })).toBeEnabled()
})

it('核心未就绪时阶段配置控件全部禁用', () => {
  useGameStore.setState({ screen: 'studio', game: startedState() })
  vi.mocked(useGameCore).mockReturnValue({ status: 'loading', error: null, retry: vi.fn() })
  render(<App />)
  for (const control of [...screen.getAllByRole('combobox'), ...screen.getAllByRole('checkbox')]) expect(control).toBeDisabled()
  expect(screen.getByRole('button', { name: '锁定阶段方案' })).toBeDisabled()
})

it.each([
  { game: v3IdleState(), region: '企划报价' },
  { game: startedState(), region: '项目制作' },
  { game: v3ReadyState(), region: '项目制作' },
])('核心未就绪时禁用 $region 中的核心操作', ({ game, region }) => {
  useGameStore.setState({ screen: 'studio', game })
  vi.mocked(useGameCore).mockReturnValue({ status: 'loading', error: null, retry: vi.fn() })
  render(<App />)
  for (const button of within(screen.getByRole('region', { name: region })).getAllByRole('button')) expect(button).toBeDisabled()
})
