import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PrototypeApp from './PrototypeApp'
import { loadGameV4 } from '../services/gameV4'
import type { V4GameState, V4WeekReport } from './v4Types'

vi.mock('../services/gameV4', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/gameV4')>()
  const require = createRequire(import.meta.url)
  const createV4 = require('../../../../build/v4/v4.mjs').default as (options?: Record<string, unknown>) => Promise<Record<string, (input: string) => string>>
  const core = await createV4()
  const initialized = JSON.parse(core.initialize_game(JSON.stringify({ seed: 20261127 })))
  if (initialized.error) throw new Error(JSON.stringify(initialized.error))
  const invoke = async (method: string, input: unknown): Promise<{ state: V4GameState; report?: V4WeekReport; message?: string }> => {
    const response = JSON.parse(core[method](JSON.stringify(input)))
    if (response.error) throw new actual.GameV4Error(response.error.code, response.error.message)
    return response
  }
  return {
    ...actual,
    loadGameV4: async () => core,
    initializeGameV4: (seed: number) => invoke('initialize_game', { seed }),
    startWorkV4: (state: V4GameState, offerId: string, mode: 'contract' | 'committee', percent = 0, committeePartnerIds: string[] = []) => invoke('start_work', { state, offer_id: offerId, mode, ...(mode === 'committee' ? { percent, committee_partner_ids: committeePartnerIds } : {}) }),
    lockOfferV4: (state: V4GameState, offerId: string) => invoke('lock_offer', { state, offer_id: offerId }),
    assignStaffV4: (state: V4GameState, staffId: string, workId: string | null) => invoke('assign_staff', { state, staff_id: staffId, work_id: workId }),
    setWorkPlanV4: (state: V4GameState, workId: string, plan: Record<string, unknown>) => invoke('set_work_plan', { state, work_id: workId, plan }),
    advanceWeekV4: (state: V4GameState) => invoke('advance_week', { state }),
    viewEventV4: (state: V4GameState, workId: string, eventId: string) => invoke('view_event', { state, work_id: workId, event_id: eventId }),
    resolveEventV4: (state: V4GameState, workId: string, eventId: string, optionId: string) => invoke('resolve_event', { state, work_id: workId, event_id: eventId, option_id: optionId }),
    createCustomOfferV4: (state: V4GameState, name: string, source: string, scale: string, style: string) => invoke('create_custom_offer', { state, name, source, scale, style }),
  }
})

const prototypeDir = dirname(fileURLToPath(import.meta.url))
const mainSource = readFileSync(resolve(prototypeDir, '../main.tsx'), 'utf8')
const appSource = readFileSync(resolve(prototypeDir, 'PrototypeApp.tsx'), 'utf8')
const sceneNav = () => screen.getByRole('navigation', { name: '场景切换' })
const actionPanel = () => screen.getByRole('region', { name: '场景交互选项' })

async function openScene(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(sceneNav()).getByRole('button', { name: new RegExp(name) }))
}

async function renderApp() {
  const core = await loadGameV4()
  expect(typeof core.initialize_game).toBe('function')
  render(<PrototypeApp />)
  await screen.findByRole('heading', { name: /新动画工作室/ })
}

async function startFirstProject(user: ReturnType<typeof userEvent.setup>) {
  await openScene(user, '发行与市场')
  await user.click(within(actionPanel()).getByRole('button', { name: /企划承接/ }))
  const drawer = screen.getByRole('dialog', { name: '市场企划' })
  const start = within(drawer).getByRole('button', { name: '承接企划（核心）' })
  expect(start).toBeEnabled()
  await user.click(start)
  await waitFor(() => expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent('¥3,200,000'))
  await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('v4 四场景接入', () => {
  it('从真实核心初始化，空项目不伪造在制作品', async () => {
    await renderApp()
    expect(screen.getByRole('img', { name: /2dPig 像素办公室/ })).toHaveAttribute('src', '/assets/pixel/office/2dpig/LargePixelOffice.png')
    expect(within(sceneNav()).getByRole('button', { name: /办公室/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent('¥2,000,000')
    expect(screen.getByRole('button', { name: '查看经营周' })).toHaveTextContent('0')
    expect(screen.getByRole('region', { name: '办公室信息' })).toHaveTextContent('尚无在制作品')
    expect(screen.queryByText(/Mock fixture|静态原型/)).not.toBeInTheDocument()
  })

  it('四个主场景可点击并可用 1—4 键切换，画面中没有按钮', async () => {
    const user = userEvent.setup()
    await renderApp()
    for (const [index, name] of ['办公室', '制作现场', '会议室', '发行与市场'].entries()) {
      await user.keyboard(String(index + 1))
      expect(within(sceneNav()).getByRole('button', { name: new RegExp(name) })).toHaveAttribute('aria-current', 'page')
      expect(within(screen.getByRole('region', { name: `${name}画面` })).queryByRole('button')).not.toBeInTheDocument()
    }
    await openScene(user, '制作现场')
    expect(screen.getByRole('img', { name: /以办公室为蓝本的动画制作现场/ })).toBeVisible()
    await openScene(user, '会议室')
    expect(screen.getByRole('img', { name: /投影幕布，展示柱形图、饼状图和折线图报表/ })).toBeVisible()
    await openScene(user, '发行与市场')
    expect(screen.getByRole('img', { name: /单一发行与市场场景.*业务公告板/ })).toBeVisible()
    expect(screen.queryByRole('img', { name: /宣传海报|宣传主视觉/ })).not.toBeInTheDocument()
  })

  it('生产入口只在 ?view=prototype 时进入原型，默认仍是原界面', () => {
    expect(mainSource).toMatch(/view === 'prototype'/)
    expect(mainSource).toMatch(/view === 'v4'/)
    expect(mainSource).toMatch(/lazy\(\(\) => import\('\.\/prototype\/PrototypeApp'\)\)/)
    expect(mainSource).toContain('<App />')
  })

  it('全部交互集中在左侧，切换场景不推进核心周次', async () => {
    const user = userEvent.setup()
    await renderApp()
    const expected: Array<[string, string[]]> = [
      ['办公室', ['查看员工与设施', '查看公司信息', '查看办公室设施', '打开在制作品', '查看公司现金', '打开周经营']],
      ['制作现场', ['查看当前单集', '查看公共制作', '查看单集列表', '打开作品详情', '打开周经营']],
      ['会议室', ['处理待决议题', '查看决策文件', '打开周经营']],
      ['发行与市场', ['企划承接', '作品发行', '查看业务公告板', '查看公司作品墙', '查看业绩看板', '打开周经营']],
    ]
    for (const [name, labels] of expected) {
      await openScene(user, name)
      expect(within(actionPanel()).getAllByRole('button')).toHaveLength(labels.length)
      for (const label of labels) expect(within(actionPanel()).getByRole('button', { name: new RegExp(label) })).toBeVisible()
    }
    const sidebar = screen.getByRole('region', { name: '发行与市场信息' })
    const frame = screen.getByRole('region', { name: '发行与市场画面' })
    expect(sidebar.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: '查看经营周' })).toHaveTextContent('0')
  })

  it('承接企划由核心立项、入账并自动指定监督', async () => {
    const user = userEvent.setup()
    await renderApp()
    await startFirstProject(user)
    await openScene(user, '制作现场')
    expect(screen.getByRole('region', { name: '制作现场信息' })).toHaveTextContent('星海邮差')
    expect(screen.getByRole('region', { name: '制作现场信息' })).toHaveTextContent('12 集 · 整部交付')
    await user.click(within(actionPanel()).getByRole('button', { name: /打开作品详情/ }))
    const drawer = screen.getByRole('dialog', { name: '作品详情' })
    expect(within(within(drawer).getByRole('region', { name: '公共制作与单集制作是两层' })).getAllByRole('row')).toHaveLength(7)
    expect(within(drawer).getByRole('region', { name: '单集六阶段定位' })).toBeVisible()
    expect(within(drawer).getByText('林监督')).toBeVisible()
    expect(within(drawer).getByRole('button', { name: '交付整部作品' })).toBeDisabled()
    expect(within(drawer).queryByRole('button', { name: /交付第.*集/ })).not.toBeInTheDocument()
  })

  it('锁定企划由核心扣定金，承接另行结算并显示锁定状态', async () => {
    const user = userEvent.setup()
    await renderApp()
    await openScene(user, '发行与市场')
    await user.click(within(actionPanel()).getByRole('button', { name: /企划承接/ }))
    const drawer = screen.getByRole('dialog', { name: '市场企划' })
    await user.click(within(drawer).getByRole('button', { name: '锁定企划（核心）' }))
    await waitFor(() => expect(within(drawer).getByRole('button', { name: '企划已锁定' })).toBeDisabled())
    expect(within(drawer).getByText(/已锁定至第 2 周/)).toBeVisible()
    expect(screen.getByRole('button', { name: '查看公司现金' })).not.toHaveTextContent('¥2,000,000')
    await user.click(within(drawer).getByRole('button', { name: '承接企划（核心）' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent('¥3,140,000'))
  })

  it('计划修改和人员调配调用核心，成功后才更新界面', async () => {
    const user = userEvent.setup()
    await renderApp()
    await startFirstProject(user)
    await openScene(user, '制作现场')
    await user.click(within(actionPanel()).getByRole('button', { name: /打开作品详情/ }))
    let drawer = screen.getByRole('dialog', { name: '作品详情' })
    const intensity = within(drawer).getByRole('combobox', { name: '投入强度' })
    await user.selectOptions(intensity, 'high')
    await waitFor(() => expect(intensity).toHaveValue('high'))
    await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))
    await openScene(user, '办公室')
    await user.click(within(actionPanel()).getByRole('button', { name: /查看员工与设施/ }))
    drawer = screen.getByRole('dialog', { name: '公司详情' })
    await user.click(within(drawer).getByRole('button', { name: '查看员工 陈原画' }))
    const assignment = within(drawer).getByRole<HTMLSelectElement>('combobox', { name: '陈原画本周归属' })
    const workId = assignment.options[1].value
    await user.selectOptions(assignment, workId)
    await waitFor(() => expect(assignment).toHaveValue(workId))
    expect(within(drawer).getByText('核心预检')).toBeVisible()
  })

  it('周推进由核心原子结算并生成真实周报', async () => {
    const user = userEvent.setup()
    await renderApp()
    await startFirstProject(user)
    await openScene(user, '会议室')
    await user.click(within(actionPanel()).getByRole('button', { name: /打开周经营/ }))
    const drawer = screen.getByRole('dialog', { name: '每周经营' })
    const advance = within(drawer).getByRole('button', { name: '推进本周' })
    expect(advance).toBeEnabled()
    await user.click(advance)
    await waitFor(() => expect(screen.getByRole('button', { name: '查看经营周' })).toHaveTextContent('1'))
    expect(within(drawer).getByText(/第 0 周核心结算/)).toBeVisible()
    expect(within(drawer).getAllByText(/工资/).length).toBeGreaterThan(0)
    expect(within(drawer).getAllByText(/运营/).length).toBeGreaterThan(0)
    expect(within(drawer).getAllByText(/制作费/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent('¥2,990,000')
  })

  it('未查看事件阻塞推进，查看不处理状态，确认选项才移除事件', async () => {
    const user = userEvent.setup()
    await renderApp()
    await startFirstProject(user)
    await openScene(user, '会议室')
    await user.click(within(actionPanel()).getByRole('button', { name: /打开周经营/ }))
    const drawer = screen.getByRole('dialog', { name: '每周经营' })
    for (let week = 1; week <= 6; week += 1) {
      await user.click(within(drawer).getByRole('button', { name: '推进本周' }))
      await waitFor(() => expect(screen.getByRole('button', { name: '查看经营周' })).toHaveTextContent(String(week)))
    }
    expect(within(drawer).getByRole('heading', { name: /电视台探班/ })).toBeVisible()
    expect(within(drawer).getByRole('button', { name: '推进本周' })).toBeDisabled()
    const cash = screen.getByRole('button', { name: '查看公司现金' }).textContent
    const option = within(drawer).getByRole('radio', { name: '选择婉拒，专注制作' })
    expect(option).toBeDisabled()
    await user.click(within(drawer).getByRole('button', { name: '查看事件（核心）' }))
    await waitFor(() => expect(option).toBeEnabled())
    expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent(cash!)
    expect(within(drawer).getByRole('heading', { name: /电视台探班/ })).toBeVisible()
    expect(within(drawer).getByRole('button', { name: '推进本周' })).toBeEnabled()
    await user.click(option)
    await user.click(within(drawer).getByRole('button', { name: '确认处理（核心）' }))
    await waitFor(() => expect(within(drawer).queryByRole('heading', { name: /电视台探班/ })).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '桌案已准备好' })).toBeVisible()
    expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent(cash!)
    expect(screen.getByRole('button', { name: '查看经营周' })).toHaveTextContent('6')
  }, 15_000)

  it('低声望原创草稿由核心拒绝，显示错误且不改变经营状态', async () => {
    const user = userEvent.setup()
    await renderApp()
    await openScene(user, '发行与市场')
    await user.click(within(actionPanel()).getByRole('button', { name: /企划承接/ }))
    const drawer = screen.getByRole('dialog', { name: '市场企划' })
    await user.type(within(drawer).getByRole('textbox', { name: '企划名' }), '测试原创')
    await user.click(within(drawer).getByRole('button', { name: '创建草稿（核心）' }))
    await waitFor(() => expect(within(drawer).getByText(/INVALID_INPUT：声望不足，无法创建原创草稿/)).toBeVisible())
    expect(within(drawer).queryByRole('button', { name: /测试原创/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '查看在制作品' })).toHaveTextContent('0')
    expect(screen.getByRole('button', { name: '查看公司现金' })).toHaveTextContent('¥2,000,000')
    expect(screen.getByRole('button', { name: '查看经营周' })).toHaveTextContent('0')
  })

  it('空 Archive、发行筛选和业绩看板只展示核心事实', async () => {
    const user = userEvent.setup()
    await renderApp()
    await openScene(user, '发行与市场')
    await user.click(within(actionPanel()).getByRole('button', { name: /查看公司作品墙/ }))
    let drawer = screen.getByRole('dialog', { name: '作品 Archive' })
    expect(within(drawer).getByText(/Archive 尚为空/)).toBeVisible()
    await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))
    await user.click(within(actionPanel()).getByRole('button', { name: /^作品发行/ }))
    drawer = screen.getByRole('dialog', { name: '作品发行' })
    expect(within(drawer).getByText(/当前筛选下没有作品/)).toBeVisible()
    await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))
    await user.click(within(actionPanel()).getByRole('button', { name: /查看业绩看板/ }))
    drawer = screen.getByRole('dialog', { name: '业绩与历史' })
    expect(within(drawer).getByRole('region', { name: '收入、声望与历史成绩' })).toHaveTextContent('核心流水流入')
  })

  it('抽屉支持焦点恢复、Escape 和详情内层级定位', async () => {
    const user = userEvent.setup()
    await renderApp()
    const trigger = within(actionPanel()).getByRole('button', { name: /查看员工与设施/ })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: '公司详情' })).toBeVisible()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    await openScene(user, '制作现场')
    await user.click(within(actionPanel()).getByRole('button', { name: /查看公共制作/ }))
    expect(screen.getByRole('dialog', { name: '市场企划' })).toBeVisible()
  })

  it('生产入口保持隔离，源码不再把 Mock 当作运行状态', () => {
    expect(mainSource).toMatch(/view === 'prototype'/)
    expect(mainSource).toMatch(/lazy\(\(\) => import\('\.\/prototype\/PrototypeApp'\)\)/)
    expect(mainSource).toContain('<App />')
    expect(appSource).toContain('useV4Game()')
    expect(appSource).not.toContain('prototypeData')
    expect(appSource).not.toMatch(/Mock fixture|纯静态/)
  })

  it('紧凑 SVG 场景的内嵌像素图铺满外层画布', () => {
    for (const name of ['studio/ProductionStudio.svg', 'market/DistributionMarket.svg']) {
      const source = readFileSync(resolve(prototypeDir, '../../public/assets/pixel', name), 'utf8')
      expect(source).toMatch(/<svg[^>]+width="1280" height="1120" viewBox="0 0 1280 1120"/)
      expect(source).toMatch(/<image width="1280" height="1120"/)
    }
  })
})
