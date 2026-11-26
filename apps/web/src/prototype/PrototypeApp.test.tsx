import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import PrototypeApp from './PrototypeApp'
import { prototypeData } from './mockData'
import { isDelivered, projectCompletion } from './model'

const here = fileURLToPath(import.meta.url)
const prototypeFiles = readdirSync(here.replace(/[^/\\]+$/, '')).filter((name) => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'))
const mainSource = readFileSync(resolve(here, '../..', 'main.tsx'), 'utf8')

beforeEach(() => render(<PrototypeApp />))

it('默认落在公司总览，公司账与多项目状态可横向比较', () => {
  const ledger = screen.getByRole('region', { name: '公司现金与承诺' })
  expect(ledger).toHaveTextContent('¥980,000')
  expect(ledger).toHaveTextContent('¥428,000')
  const portfolio = screen.getByRole('region', { name: '同时在制的作品' })
  expect(within(portfolio).getAllByRole('button', { name: '打开作品详情' })).toHaveLength(prototypeData.projects.length)
  expect(within(portfolio).getByText('雾港信使 II')).toBeInTheDocument()
  expect(within(portfolio).getByText('单集 5 / 12 集已交付')).toBeInTheDocument()
  expect(within(portfolio).getByText('落后计划 7 个百分点')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '谁在哪个项目上' })).toHaveTextContent('周慕')
  expect(screen.getByRole('region', { name: '并行经营的真实约束' })).toHaveTextContent('首版不引入独立的管理负荷数值')
  expect(screen.queryByText('管理负荷 / 容量')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '市场企划与长期合作' })).toHaveTextContent('核心作画产能不足')
})

it('作品详情分两层：项目级公共制作与单集六阶段，不是一条整部作品进度', async () => {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '打开作品详情' })[0])
  const common = screen.getByRole('region', { name: '公共制作与单集制作是两层' })
  expect(within(common).getAllByRole('row')).toHaveLength(7)
  expect(within(common).getAllByText('角色设定')).toHaveLength(2)

  const stages = screen.getAllByRole('article')
  expect(stages).toHaveLength(6)
  expect(stages.map((node) => node.querySelector('h3')?.textContent)).toEqual([
    '单集内容设计', '分镜与原画', '动画制作', '美术与视觉制作', '摄影与剪辑', '声音与最终交付',
  ])
})

it('默认展示定向单集，可切到别的集；门槛与依赖状态由工作点推导', async () => {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '打开作品详情' })[0])
  const episode = screen.getByRole('region', { name: '第 7 集《夜戏》' })
  expect(episode).toHaveTextContent('原画')
  expect(episode).toHaveTextContent('49 / 95')
  expect(within(episode).getAllByText('被依赖阻塞').length).toBeGreaterThan(0)
  expect(episode).toHaveTextContent('完成母版 0 / 12（需 1000‰）未达标')

  await user.click(screen.getByRole('button', { name: /第 6 集/ }))
  const polished = screen.getByRole('region', { name: '第 6 集《雾中的证人》' })
  expect(polished).toHaveTextContent('可主动交付')
  expect(within(polished).getAllByText('已达标，可继续完善').length).toBeGreaterThan(0)
  expect(within(polished).queryAllByText('被依赖阻塞')).toHaveLength(0)

  await user.click(screen.getByRole('button', { name: /第 3 集/ }))
  expect(screen.getByRole('region', { name: '第 3 集《无人应答的灯塔》' })).toHaveTextContent('已交付')
})

it('计划差距、严格单项目人员占用与项目账同屏呈现', async () => {
  const user = userEvent.setup()
  await user.click(screen.getAllByRole('button', { name: '打开作品详情' })[0])
  expect(screen.getByRole('region', { name: '持续方针与实际差距' })).toHaveTextContent('第 7 集原画')
  const resources = screen.getByRole('region', { name: '这个项目本周占了谁' })
  expect(resources).toHaveTextContent('陈砚')
  expect(resources).toHaveTextContent('星野线上')
  expect(resources).toHaveTextContent('一次性磨合损失')
  expect(within(resources).queryByText(/本周支援/)).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '雾港信使 II的花费与回款' })).toHaveTextContent('¥5,200,000')
  await user.click(screen.getByRole('button', { name: /夜行电车/ }))
  expect(screen.getByRole('region', { name: '夜行电车' })).toHaveTextContent('承制')
  expect(screen.getByText(/不参与委员会成员开放的非 BD 渠道分成/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: /返回公司总览/ }))
  expect(screen.getByRole('region', { name: '同时在制的作品' })).toBeVisible()
})

it('每周经营把必须决定、自动执行、仅报告分层，周次快照可切换', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '每周经营' }))
  expect(screen.getByRole('status')).toHaveTextContent('事件待处理')
  expect(screen.getByRole('region', { name: '产出与原因' })).toHaveTextContent('返工占掉两天')
  const decide = screen.getByRole('region', { name: '本周真正需要玩家处理的 3 件事' })
  expect(within(decide).getAllByText('核心人员重新分配')).toHaveLength(1)
  expect(within(decide).getAllByText('新增外包承诺')).toHaveLength(1)
  expect(within(decide).getAllByText('交付动作')).toHaveLength(1)
  expect(screen.getByRole('region', { name: '自动执行与仅报告' })).toHaveTextContent('未要求确认')
  expect(screen.getByRole('region', { name: '第 7 集原画返工：夜戏构图偏离演出构想' })).toHaveTextContent('明石動画')
  await user.click(screen.getByRole('button', { name: /第 17 周/ }))
  expect(screen.getByRole('region', { name: '本周没有需要处理的事件' })).toBeVisible()
  expect(screen.getByText('《雾港II》第 6 集是否本周交付')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '本周真正需要玩家处理的 1 件事' })).toBeInTheDocument()
})

it('资金危机周有独立的倒计时、禁止项与零生产状态', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '每周经营' }))
  await user.click(screen.getByRole('button', { name: /第 16 周/ }))
  expect(screen.getByRole('status')).toHaveTextContent('限时资金危机')
  expect(screen.getByRole('status')).toHaveTextContent('¥316,000')
  const rescue = screen.getByRole('region', { name: '期限内允许做什么、不允许做什么' })
  expect(rescue).toHaveTextContent('不自动借款')
  expect(rescue).toHaveTextContent('禁止：立项')
  expect(screen.getByRole('region', { name: '产出与原因' })).toHaveTextContent('本周所有项目工作量为 0')
  expect(screen.getByRole('region', { name: /工资与运营照付/ })).toHaveTextContent('危机期间继续计提')
})

it('周次快照里的工作项可跳回对应作品，不改动周数据', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '每周经营' }))
  await user.click(within(screen.getByRole('region', { name: '产出与原因' })).getByRole('button', { name: '小满' }))
  expect(screen.getByRole('region', { name: '第 1 集《小满》' })).toHaveTextContent('完成母版')
  await user.click(screen.getByRole('button', { name: /返回公司总览/ }))
  await user.click(screen.getByRole('button', { name: '每周经营' }))
  expect(screen.getByRole('region', { name: /《小满》只差完成母版/ })).toBeInTheDocument()
})

it('事件卡可选择并确认，样本结果在切换周次后保留', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '每周经营' }))
  const confirm = screen.getByRole('button', { name: '确认处理（原型）' })
  expect(confirm).toBeDisabled()
  await user.click(screen.getByRole('radio', { name: '选择本周返工' }))
  await user.click(confirm)
  const result = screen.getByRole('region', { name: '事件处理结果' })
  expect(result).toHaveTextContent('样本结果：本周返工，质量 +2')
  expect(screen.getByRole('status')).toHaveTextContent('事件已处理（原型）')
  expect(screen.getByRole('region', { name: '公司全局状态' })).toHaveTextContent('0 件')
  expect(screen.getByRole('radio', { name: '选择本周返工' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: /第 17 周/ }))
  await user.click(screen.getByRole('button', { name: /第 18 周/ }))
  expect(screen.getByRole('region', { name: '事件处理结果' })).toHaveTextContent('样本结果：本周返工，质量 +2')
  expect(prototypeData.receipts[0].event?.options[0].id).toBe('o1')
})

it('公司总览内可筛选单一现金池流水，Archive 只展示已交付作品', async () => {
  const user = userEvent.setup()
  const finance = screen.getByRole('region', { name: '公司现金流水与项目归因' })
  expect(within(finance).getByText('¥980,000')).toBeInTheDocument()
  expect(finance).toHaveTextContent('项目归因只解释现金为何变化，不是项目独立账户')
  await user.selectOptions(within(finance).getByRole('combobox', { name: '周次' }), '18')
  await user.selectOptions(within(finance).getByRole('combobox', { name: '归因' }), 'p1')
  const table = within(finance).getByRole('table', { name: '公司现金流水' })
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(table).toHaveTextContent('《雾港II》第 7 集原画制作费')
  expect(table).not.toHaveTextContent('《夜行电车》第二期合同款')
  const archive = screen.getByRole('region', { name: '作品 Archive 与经营历史' })
  expect(within(archive).getAllByRole('listitem')).toHaveLength(prototypeData.history.length)
  expect(within(archive).getByText('雾港信使')).toBeInTheDocument()
  expect(within(archive).queryByText('雾港信使 II')).not.toBeInTheDocument()
  expect(within(archive).queryByText('小满')).not.toBeInTheDocument()
})

it('关闭中停止周推进，只可预览达标结清和经营总结', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '每周经营' }))
  await user.click(screen.getByRole('button', { name: /第 19 周/ }))
  expect(screen.getByRole('status')).toHaveTextContent('关闭中')
  expect(screen.getByRole('button', { name: '推进本周' })).toBeDisabled()
  expect(screen.getByText('不可用：公司已进入结束流程。')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '预览待交付结清' }))
  const delivery = screen.getByRole('region', { name: '待交付结清预览' })
  expect(delivery).toHaveTextContent('第 6 集可关闭交付')
  expect(delivery).toHaveTextContent('没有达到门槛的单集，不能伪报完成')
  await user.click(screen.getByRole('button', { name: '预览经营总结' }))
  expect(screen.getByRole('region', { name: '经营总结预览' })).toHaveTextContent('正式总结必须来自核心 calculate_result')
  expect(screen.queryByRole('region', { name: '待交付结清预览' })).not.toBeInTheDocument()
})

it('标注体系覆盖四类信息口径', () => {
  expect(screen.getAllByText('待细化参数').length).toBeGreaterThan(0)
  expect(screen.getAllByText('原型样本').length).toBeGreaterThan(0)
  expect(screen.getByText(/D1–D6 均已由负责人确认，本页不把它们重列为待决事项/)).toBeInTheDocument()
})

it('原型保持纯静态：不引用核心服务、存档与旧 GameState', () => {
  for (const name of prototypeFiles) {
    const source = readFileSync(resolve(here.replace(/[^/\\]+$/, ''), name), 'utf8')
    expect(source, name).not.toMatch(/gameV3|gameCore|gameStore|useGameCore|indexedDB|fake-indexeddb|wasm|fetch\(/i)
  }
  expect(Object.keys(prototypeData).sort().join(',')).toBe('allocations,company,history,ledger,marketOffers,outsourcing,projects,receipts,relationships,staff,suppliers')
})

it('样本数据自证已确认规则：单项目归属、六阶段门槛与推导完成度', () => {
  expect(prototypeData.allocations.every((item) => !('supportProjectIds' in item))).toBe(true)
  expect(prototypeData.allocations.filter((item) => item.projectId !== null)).toHaveLength(7)
  expect('managementLoad' in prototypeData.company).toBe(false)
  expect('managementCapacity' in prototypeData.company).toBe(false)
  for (const project of prototypeData.projects) {
    expect(project.episodes).toHaveLength(project.episodeCount)
    expect(project.episodes.filter((episode) => episode.isFocus).length).toBeLessThanOrEqual(1)
    expect(projectCompletion(project)).toBe(Math.round(
      [...project.commonItems, ...project.episodes.flatMap((episode) => episode.workItems)].reduce((acc, item) => acc + item.workDone, 0) /
      [...project.commonItems, ...project.episodes.flatMap((episode) => episode.workItems)].reduce((acc, item) => acc + item.workTotal, 0) * 100,
    ))
    for (const episode of project.episodes) {
      const gates = episode.workItems.filter((item) => item.isGate)
      if (episode.status === 'min_delivered') expect(gates.every(isDelivered)).toBe(true)
      if (episode.status === 'not_started') expect(episode.workItems.every((item) => item.workDone === 0)).toBe(true)
    }
  }
  expect(prototypeData.receipts.map((item) => item.state).sort()).toEqual(['cash_crisis', 'closing', 'event_pending', 'normal'])
  for (const receipt of prototypeData.receipts) {
    expect(receipt.state === 'closing' ? receipt.closing !== null : receipt.closing === null).toBe(true)
    if (receipt.event) expect(Object.keys(receipt.event.outcomes).sort()).toEqual(receipt.event.options.map((option) => option.id).sort())
  }
})

it('四场景以办公室为主入口，导航与数字快捷键共享同一状态', async () => {
  const user = userEvent.setup()
  const nav = screen.getByRole('navigation', { name: '场景切换' })
  expect(screen.getByRole('region', { name: '办公室场景' })).toBeVisible()
  expect(within(nav).getByRole('button', { name: /办公室/ })).toHaveAttribute('aria-current', 'page')
  const officeSprites = screen.getByRole('region', { name: '办公室场景' }).querySelectorAll('image.asset-sprite')
  const officeSources = Array.from(officeSprites, (sprite) => sprite.getAttribute('href'))
  expect(officeSprites.length).toBeGreaterThanOrEqual(14)
  expect(officeSources).toEqual(expect.arrayContaining([
    '/assets/vendor/pixel-office/floor_5.png',
    '/assets/vendor/pixel-office/PC_FRONT_ON_1.png',
    '/assets/vendor/pixel-office/PC_FRONT_ON_2.png',
    '/assets/vendor/pixel-office/PC_FRONT_ON_3.png',
    '/assets/vendor/pixel-office/WHITEBOARD.png',
    '/assets/vendor/pixel-office/DOUBLE_BOOKSHELF.png',
    '/assets/vendor/pixel-office/CLOCK.png',
    '/assets/vendor/pixel-office/COFFEE.png',
  ]))
  const office = screen.getByRole('region', { name: '办公室场景' })
  expect(office.querySelector('rect[fill="#6d7e76"]')).toBeNull()
  expect(office.querySelector('path[fill="#8b9a8a"]')).toBeNull()
  expect(office.querySelector('path[fill="#b79a72"]')).toBeNull()
  await user.click(within(nav).getByRole('button', { name: /工作室/ }))
  expect(screen.getByRole('region', { name: '工作室场景' })).toBeVisible()
  expect(screen.getByRole('region', { name: '公共制作与单集制作是两层' })).toBeVisible()
  const studioSprites = screen.getByRole('region', { name: '工作室场景' }).querySelectorAll('image.asset-sprite')
  const studioSources = Array.from(studioSprites, (sprite) => sprite.getAttribute('href'))
  expect(studioSprites.length).toBeGreaterThanOrEqual(14)
  expect(studioSources).toEqual(expect.arrayContaining([
    '/assets/vendor/pixel-office/floor_6.png',
    '/assets/vendor/pixel-office/LARGE_PAINTING.png',
  ]))
  expect(studioSources.some((source) => source?.includes('/Boxes/Box'))).toBe(false)
  expect(studioSources.some((source) => source?.startsWith('/assets/vendor/pixel-office/PC_FRONT_ON_'))).toBe(false)
  await user.keyboard('3')
  expect(screen.getByRole('region', { name: '会议室场景' })).toBeVisible()
  expect(screen.getByRole('region', { name: '会议室场景' }).querySelector('[data-desk-briefcase], [data-office-wall-briefcase]')).toBeNull()
  expect(screen.getByRole('region', { name: '制作委员会与发行窗口' })).toBeVisible()
  await user.click(within(nav).getByRole('button', { name: /发行与市场/ }))
  expect(screen.getByRole('region', { name: '发行与市场场景' })).toBeVisible()
  expect(screen.getByRole('region', { name: '发行与市场场景' }).querySelector('[data-desk-briefcase], [data-office-wall-briefcase]')).toBeNull()
  expect(screen.getByRole('region', { name: '下一部作品，从哪里开始？' })).toBeVisible()
  const marketSources = Array.from(screen.getByRole('region', { name: '发行与市场场景' }).querySelectorAll('image.asset-sprite'), (sprite) => sprite.getAttribute('href'))
  expect(marketSources).toEqual(expect.arrayContaining([
    '/assets/vendor/pixel-office/LARGE_PAINTING.png',
    '/assets/vendor/pixel-office/CACTUS.png',
    '/assets/vendor/pixel-office/BIN.png',
  ]))
  await user.keyboard('1')
  expect(screen.getByRole('region', { name: '办公室场景' })).toBeVisible()
})

it('办公室保持上一版，工作室第二排靠书架墙平移且柜子归位墙角', async () => {
  const user = userEvent.setup()
  const verifyRoom = (name: string, deskCount: number, briefcaseCount: number) => {
    const room = screen.getByRole('region', { name })
    const desks = Array.from(room.querySelectorAll<SVGGElement>('[data-iso-desk]'))
    const plants = Array.from(room.querySelectorAll('[data-room-plant]'))
    const wallObject = room.querySelector('image[href$="WHITEBOARD.png"], image[href$="LARGE_PAINTING.png"]')
    expect(desks).toHaveLength(deskCount)
    expect(plants).toHaveLength(2)
    expect(room.querySelectorAll('[data-desk-briefcase]')).toHaveLength(briefcaseCount)
    expect(wallObject).not.toBeNull()
    for (const desk of desks) {
      const top = desk.querySelector('[data-desk-top]')
      const legs = Array.from(desk.querySelectorAll('[data-desk-leg]'))
      const computer = desk.querySelector('[data-desk-computer]')
      const briefcases = desk.querySelectorAll('[data-desk-briefcase]')
      const briefcase = briefcases[0]
      const expectedDeskBriefcases = briefcaseCount === deskCount ? 1 : 0
      expect(top).not.toBeNull()
      expect(computer).not.toBeNull()
      expect(briefcases).toHaveLength(expectedDeskBriefcases)
      if (briefcase) {
        expect(briefcase.getAttribute('data-briefcase-anchor')).toBe('left')
        expect(briefcase.getAttribute('data-briefcase-color')).toBe('brown')
        expect(briefcase.querySelector('[data-briefcase-shadow]')).not.toBeNull()
        expect(Array.from(briefcase.querySelectorAll('path[fill]:not([fill="none"])'), (path) => path.getAttribute('fill'))).toEqual(['#76523b', '#5f412f', '#8b6245'])
        const anchorLeg = desk.querySelector('[data-desk-leg="left"]')
        expect(anchorLeg!.compareDocumentPosition(briefcase) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(top!.compareDocumentPosition(briefcase) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
        expect(briefcase.compareDocumentPosition(computer!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      }
      expect(['translate(5.5 -17.5)', 'translate(6 8)', 'translate(0 0)', 'translate(1.5 10)']).toContain(computer?.getAttribute('transform'))
      const computerOffset = computer?.getAttribute('transform')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      const footprint = computer?.querySelector('[data-desk-computer-footprint]')?.getAttribute('d')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
      expect(computerOffset).toHaveLength(2)
      expect(footprint.length).toBeGreaterThanOrEqual(8)
      for (let index = 0; index < footprint.length; index += 2) {
        const desktopDistance = Math.abs(footprint[index] + computerOffset[0]) / 89 + Math.abs(footprint[index + 1] + computerOffset[1]) / 43
        expect(desktopDistance).toBeLessThanOrEqual(1)
      }
      expect(legs.map((leg) => leg.getAttribute('data-desk-leg'))).toEqual(['back', 'left', 'right', 'front'])
      expect(legs.map((leg) => leg.getAttribute('height'))).toEqual(['56', '56', '56', '56'])
      expect(legs.map((leg) => leg.getAttribute('y'))).toEqual(['-43', '0', '0', '43'])
      for (const leg of legs) {
        expect(leg.compareDocumentPosition(top!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      }
    }
    for (const plant of plants) {
      expect(wallObject!.compareDocumentPosition(plant) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      for (const desk of desks) {
        expect(plant.compareDocumentPosition(desk) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      }
    }
  }

  verifyRoom('办公室场景', 4, 0)
  const office = screen.getByRole('region', { name: '办公室场景' })
  const officeDesks = Array.from(office.querySelectorAll('[data-iso-desk]'))
  expect(officeDesks.map((desk) => desk.getAttribute('data-desk-id'))).toEqual(expect.arrayContaining(['office-desk-0', 'office-desk-1', 'office-desk-2', 'office-desk-3']))
  for (const desk of officeDesks) {
    const computer = desk.querySelector('[data-desk-computer]')
    expect(computer?.getAttribute('transform')).toBe('translate(1.5 10)')
    expect(computer?.querySelector('image[href*="PC_FRONT_ON_"]')).not.toBeNull()
  }
  const officeBriefcase = office.querySelector('[data-office-wall-briefcase]')
  expect(officeBriefcase?.getAttribute('data-wall-side')).toBe('bookshelf')
  expect(officeBriefcase?.getAttribute('data-briefcase-color')).toBe('brown')
  for (const desk of officeDesks) {
    expect(desk.querySelectorAll('[data-desk-briefcase]')).toHaveLength(0)
  }
  expect(officeBriefcase?.querySelector('[data-briefcase-shadow]')?.getAttribute('cy')).toBe('9')
  expect(officeBriefcase?.querySelector('[data-briefcase-contact-shadow]')).not.toBeNull()
  const briefcasePosition = officeBriefcase?.getAttribute('transform')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  expect(briefcasePosition[0]).toBeCloseTo(1083.6)
  expect(briefcasePosition[1]).toBeCloseTo(299.75)
  const bookshelf = office.querySelector('image[href$="DOUBLE_BOOKSHELF.png"]')
  expect(bookshelf).not.toBeNull()
  expect(bookshelf!.compareDocumentPosition(officeBriefcase!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  expect(office.querySelector('[data-room-floor]')?.getAttribute('d')).toBe('M600 105L1120 310 600 525 80 310z')
  expect(office.querySelector('[data-room-wall-seam]')?.getAttribute('d')).toBe('M80 310L600 105 1120 310')
  const leftWall = office.querySelector('[data-office-wall="left"]')
  const rightWall = office.querySelector('[data-office-wall="right"]')
  expect(leftWall?.getAttribute('transform')).toBe('translate(80 310) skewY(-21.5)')
  expect(rightWall?.getAttribute('transform')).toBe('translate(600 105) skewY(21.5)')
  expect(leftWall?.querySelector('rect[fill="none"][stroke="#ead9b8"]')?.getAttribute('height')).toBe('110')
  expect(rightWall?.querySelector('rect[fill="none"][stroke="#ead9b8"]')?.getAttribute('height')).toBe('96')
  expect(office.querySelector('[data-office-baseboard="left"]')?.getAttribute('d')).toBe('M80 300L600 95 600 105 80 310z')
  expect(office.querySelector('[data-office-baseboard="right"]')?.getAttribute('d')).toBe('M600 95L1120 300 1120 310 600 105z')
  expect(office.querySelectorAll('[data-office-baseboard]')).toHaveLength(2)
  await user.click(within(screen.getByRole('navigation', { name: '场景切换' })).getByRole('button', { name: /工作室/ }))
  verifyRoom('工作室场景', 6, 6)
  const studio = screen.getByRole('region', { name: '工作室场景' })
  const studioDesks = Array.from(studio.querySelectorAll<SVGGElement>('[data-iso-desk]'))
  const studioBriefcase = studio.querySelector('[data-desk-briefcase]')
  for (const desk of studioDesks) {
    const computer = desk.querySelector('[data-desk-computer]')
    expect(computer?.getAttribute('transform')).toBe('translate(0 0)')
    expect(computer?.hasAttribute('data-white-monitor')).toBe(true)
    expect(computer?.querySelector('[data-white-computer]')).not.toBeNull()
    expect(computer?.querySelector('[data-white-computer-stand]')).not.toBeNull()
    expect(computer?.querySelector('image[href*="PC_FRONT_ON_"]')).toBeNull()
  }
  expect(studioBriefcase?.getAttribute('data-briefcase-anchor')).toBe('left')
  expect(studioBriefcase?.querySelector('[data-briefcase-shadow]')?.getAttribute('cy')).toBe('53')
  expect(studio.querySelector('[data-desk-id="studio-0"] [data-desk-briefcase]')).not.toBeNull()
  const secondRowTransforms = ['studio-0', 'studio-1', 'studio-2'].map((id) => {
    const transform = studio.querySelector(`[data-desk-id="${id}"]`)?.getAttribute('transform')
    const values = transform?.match(/-?\d+(?:\.\d+)?/g)?.map(Number)
    return values ?? []
  })
  expect(secondRowTransforms).toHaveLength(3)
  for (const [index, expected] of [[574, 164.45], [730, 225.95], [886, 287.45]].entries()) {
    expect(secondRowTransforms[index][0]).toBeCloseTo(expected[0])
    expect(secondRowTransforms[index][1]).toBeCloseTo(expected[1])
  }
  const cabinet = studio.querySelector('[data-studio-cabinet]')
  expect(cabinet?.getAttribute('data-wall-corner')).toBe('front-left')
  const cabinetPosition = cabinet?.getAttribute('transform')?.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? []
  expect(cabinetPosition[0]).toBeCloseTo(80)
  expect(cabinetPosition[1]).toBeCloseTo(184)
  expect(cabinet?.getAttribute('transform')).toContain('skewY(-21.5)')
  expect(studio.querySelectorAll('[data-studio-cabinet]')).toHaveLength(1)
  expect(studio.querySelectorAll('[data-studio-cabinet-top]')).toHaveLength(1)
  expect(studio.querySelectorAll('[data-studio-cabinet-side]')).toHaveLength(1)
  expect(studio.querySelectorAll('[data-studio-cabinet-front]')).toHaveLength(1)
  expect(studio.querySelector('[data-studio-wall-painting="0"]')?.getAttribute('transform')).toContain('scale(0.65 1)')
  expect(studio.querySelector('[data-studio-wall-painting="1"]')?.getAttribute('transform')).not.toContain('scale(0.65 1)')
  const frontRowTransforms = ['studio-3', 'studio-4', 'studio-5'].map((id) => {
    const transform = studio.querySelector(`[data-desk-id="${id}"]`)?.getAttribute('transform')
    const values = transform?.match(/-?\d+(?:\.\d+)?/g)?.map(Number)
    return values ?? []
  })
  expect(frontRowTransforms).toHaveLength(3)
  for (const [index, expected] of [[319.2, 264.9], [475.2, 326.4], [631.2, 387.9]].entries()) {
    expect(frontRowTransforms[index][0]).toBeCloseTo(expected[0])
    expect(frontRowTransforms[index][1]).toBeCloseTo(expected[1])
  }
  expect(studio.querySelector('path[fill="#c9a474"]')).toBeNull()
  expect(studio.querySelectorAll('[data-desk-chair]')).toHaveLength(0)
  for (const desk of studioDesks) {
    expect(desk.querySelector('[data-desk-chair]')).toBeNull()
  }
})

it('会议室地砖收敛到单一消失点，加宽桌体位于座椅与人物之上', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /会议室/ }))
  const room = screen.getByRole('img', { name: /长会议室/ })
  const floor = room.querySelector('[data-meeting-floor]')
  const floorTexture = room.querySelector('[data-meeting-floor-texture]')
  const seams = room.querySelector('[data-meeting-floor-seams]')
  const table = room.querySelector('[data-meeting-table]')

  expect(floor?.getAttribute('d')).toBe('M251.28 228H948.72L1800 560H-600z')
  expect(floorTexture?.getAttribute('d')).toBe(floor?.getAttribute('d'))
  expect(floorTexture?.getAttribute('fill')).toBe('url(#meeting-floor-texture)')
  expect(room.getAttribute('aria-label')).toContain('无玻璃幕墙')
  expect(room.querySelector('image[href="/assets/vendor/pixel-office/WHITEBOARD.png"]')).not.toBeNull()
  expect(room.querySelector('[data-meeting-display]')?.getAttribute('transform')).toBe('translate(600 125.5) scale(1.875 1.5) translate(-600 -125.5)')
  expect(room.querySelector('[data-meeting-display-content]')?.getAttribute('width')).toBe('200')
  expect(room.querySelector('[data-meeting-display-content]')?.getAttribute('height')).toBe('91')
  expect(room.querySelector('image[href="/assets/vendor/pixel-office/CLOCK.png"]')?.getAttribute('x')).toBe('850')
  expect(room.querySelector('path[stroke="#92734f"]')?.getAttribute('d')).toBe('M251.28 228L-600 560M948.72 228L1800 560')
  expect(seams?.getAttribute('clip-path')).toBe('url(#meeting-floor)')
  expect(seams?.querySelector('path')?.getAttribute('d')?.match(/M600 92L/g)).toHaveLength(21)
  expect(seams?.querySelectorAll('path')).toHaveLength(7)
  expect(room.querySelector('path[stroke="#657b73"]')).toBeNull()
  expect(table?.querySelector('path')?.getAttribute('d')).toBe('M240 520H960V534H240z')
  expect(table?.querySelector('[data-meeting-tabletop]')?.getAttribute('fill')).toBe('#8b6044')
  expect(table?.querySelector('[fill="#986b4b"]')).toBeNull()
  const papers = table?.querySelectorAll('[data-meeting-paper]') ?? []
  expect(papers).toHaveLength(8)
  for (const paper of papers) expect(paper.getAttribute('d')).toMatch(/H.*L.*H/)
  expect(room.querySelectorAll('[data-meeting-chair]')).toHaveLength(6)
  expect(room.querySelectorAll('[data-meeting-person]')).toHaveLength(2)
  for (const item of room.querySelectorAll('[data-meeting-chair], [data-meeting-person]')) {
    expect(item.compareDocumentPosition(table!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  }
})

it('工作室单集选择与展开内容在离开场景后保留', async () => {
  const user = userEvent.setup()
  const nav = screen.getByRole('navigation', { name: '场景切换' })
  await user.click(screen.getAllByRole('button', { name: '打开作品详情' })[0])
  await user.click(screen.getByRole('button', { name: /第 6 集/ }))
  expect(screen.getByRole('region', { name: '第 6 集《雾中的证人》' })).toHaveTextContent('可主动交付')
  await user.click(within(nav).getByRole('button', { name: /办公室/ }))
  await user.click(within(nav).getByRole('button', { name: /工作室/ }))
  expect(screen.getByRole('region', { name: '第 6 集《雾中的证人》' })).toHaveTextContent('可主动交付')
})

it('全局事务中心可切换四种经营窗口，不改变样本周数据', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /W16/ }))
  expect(screen.getByRole('region', { name: '公司全局状态' })).toHaveTextContent('需要自救')
  expect(screen.getByText(/本周停止生产/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /W19/ }))
  expect(screen.getByRole('region', { name: '公司全局状态' })).toHaveTextContent('已停止')
  expect(screen.getByText(/停止周推进/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: /W18/ }))
  expect(screen.getByRole('region', { name: '公司全局状态' })).toHaveTextContent('1 件')
  expect(prototypeData.company.week).toBe(18)
})

it('会议室入口保留 M4 功能边界，事件可直接跳入完整确认面板', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /处理异常事件/ }))
  expect(screen.getByRole('region', { name: '第 7 集原画返工：夜戏构图偏离演出构想' })).toBeVisible()
  expect(screen.getByText('M4 信息结构预览，不开放真实投资或渠道命令。', { exact: false })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '进入事件确认' }))
  expect(screen.getByRole('button', { name: '确认处理（原型）' })).toBeDisabled()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('button', { name: '确认处理（原型）' })).not.toBeInTheDocument()
})

it('生产入口只在 ?view=prototype 时进入原型，默认仍是原界面', () => {
  expect(mainSource).toMatch(/get\('view'\) === 'prototype'/)
  expect(mainSource).toMatch(/lazy\(\(\) => import\('\.\/prototype\/PrototypeApp'\)\)/)
  expect(mainSource).toContain('<App />')
})
