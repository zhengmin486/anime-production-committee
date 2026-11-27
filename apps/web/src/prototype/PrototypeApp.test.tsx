import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it } from 'vitest'
import PrototypeApp from './PrototypeApp'
import { prototypeData } from './mockData'

const here = fileURLToPath(import.meta.url)
const prototypeFiles = readdirSync(here.replace(/[^/\\]+$/, '')).filter((name) => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'))
const mainSource = readFileSync(resolve(here, '../..', 'main.tsx'), 'utf8')
const sceneNav = () => screen.getByRole('navigation', { name: '场景切换' })
const actionPanel = () => screen.getByRole('region', { name: '场景交互选项' })

async function openScene(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(sceneNav()).getByRole('button', { name: new RegExp(name) }))
}

beforeEach(() => render(<PrototypeApp />))

it('默认落在素材主导的办公室，并同时显示公司状态与在制作品', () => {
  expect(screen.getByRole('img', { name: /2dPig 像素办公室/ })).toHaveAttribute('src', '/assets/pixel/office/2dpig/LargePixelOffice.png')
  expect(within(sceneNav()).getByRole('button', { name: /办公室/ })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('region', { name: '办公室信息' })).toHaveTextContent('¥980,000')
  expect(screen.getByRole('region', { name: '办公室信息' })).toHaveTextContent('雾港信使 II')
  expect(screen.getByRole('region', { name: '事务中心' })).toHaveTextContent('事件待处理')
})

it('四个主场景可点击，也可用 1—4 键切换', async () => {
  const user = userEvent.setup()
  for (const [index, name] of ['办公室', '制作现场', '会议室', '发行与市场'].entries()) {
    await user.keyboard(String(index + 1))
    expect(within(sceneNav()).getByRole('button', { name: new RegExp(name) })).toHaveAttribute('aria-current', 'page')
  }
  await openScene(user, '办公室')
  expect(screen.getByRole('img', { name: /2dPig 像素办公室/ })).toBeVisible()
  await openScene(user, '制作现场')
  expect(screen.getByRole('img', { name: /以办公室为蓝本的动画制作现场/ })).toBeVisible()
  await openScene(user, '会议室')
  expect(screen.getByRole('img', { name: /投影幕布，展示柱形图、饼状图和折线图报表/ })).toBeVisible()
  await openScene(user, '发行与市场')
  expect(screen.getByRole('img', { name: /单一发行与市场场景.*业务公告板/ })).toBeVisible()
  expect(screen.queryByRole('img', { name: /宣传海报|宣传主视觉/ })).not.toBeInTheDocument()
})

it('四个主场景的全部交互集中到左侧操作区', async () => {
  const user = userEvent.setup()
  const expected: Array<[string, string[]]> = [
    ['办公室', ['查看员工与设施', '查看公司信息', '查看办公室设施', '打开在制作品', '查看公司现金', '打开周经营']],
    ['制作现场', ['查看当前单集', '查看公共制作', '查看单集列表', '打开作品详情', '打开周经营']],
    ['会议室', ['处理待决议题', '查看决策文件', '打开周经营']],
    ['发行与市场', ['企划承接', '作品发行', '查看业务公告板', '查看公司作品墙', '查看业绩看板', '打开周经营']],
  ]
  for (const [name, labels] of expected) {
    await openScene(user, name)
    const panel = actionPanel()
    expect(within(panel).getAllByRole('button')).toHaveLength(labels.length)
    for (const label of labels) expect(within(panel).getByRole('button', { name: new RegExp(label) })).toBeVisible()
    expect(within(screen.getByRole('region', { name: `${name}画面` })).queryByRole('button')).not.toBeInTheDocument()
  }
  const sidebar = screen.getByRole('region', { name: '发行与市场信息' })
  const frame = screen.getByRole('region', { name: '发行与市场画面' })
  expect(sidebar.compareDocumentPosition(frame) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

it('办公室左侧操作进入公司详情，Escape 与关闭按钮都可返回场景', async () => {
  const user = userEvent.setup()
  const trigger = within(actionPanel()).getByRole('button', { name: /查看员工与设施/ })
  await user.click(trigger)
  const drawer = screen.getByRole('dialog', { name: '公司详情' })
  expect(within(drawer).getByRole('region', { name: '公司现金与承诺' })).toHaveTextContent('¥428,000')
  expect(within(drawer).getByRole('region', { name: '同时在制的作品' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(trigger).toHaveFocus()
  await user.click(within(actionPanel()).getByRole('button', { name: /查看公司现金/ }))
  expect(screen.getByRole('dialog', { name: '财务与历史' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '关闭详情' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('作品详情仍保留公共制作、单集六阶段与定向单集', async () => {
  const user = userEvent.setup()
  await user.click(within(actionPanel()).getByRole('button', { name: /打开在制作品/ }))
  const drawer = screen.getByRole('dialog', { name: '作品详情' })
  const common = within(drawer).getByRole('region', { name: '公共制作与单集制作是两层' })
  expect(within(common).getAllByRole('row')).toHaveLength(7)
  expect(within(common).getAllByText('角色设定')).toHaveLength(2)
  const stages = within(drawer).getAllByRole('article')
  expect(stages.map((node) => node.querySelector('h3')?.textContent)).toEqual([
    '单集内容设计', '分镜与原画', '动画制作', '美术与视觉制作', '摄影与剪辑', '声音与最终交付',
  ])
  const episode = within(drawer).getByRole('region', { name: '第 7 集《夜戏》' })
  expect(episode).toHaveTextContent('49 / 95')
  expect(within(episode).queryByText('无上游依赖。')).not.toBeInTheDocument()
  const disclosure = within(episode).getAllByRole('button', { name: /展开.*详情/ })[0]
  expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await user.click(disclosure)
  expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  expect(within(episode).getAllByText('被依赖阻塞').length).toBeGreaterThan(0)
  await within(drawer).getByRole('button', { name: /第 6 集/ }).click()
  expect(within(drawer).getByRole('region', { name: '第 6 集《雾中的证人》' })).toHaveTextContent('可主动交付')
  await user.click(within(drawer).getByRole('button', { name: '返回场景' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

it('制作现场可切作品，六阶段进度与项目完成度来自同一工作点', async () => {
  const user = userEvent.setup()
  await openScene(user, '制作现场')
  const sidebar = screen.getByRole('region', { name: '制作现场信息' })
  expect(within(sidebar).getByRole('heading', { name: '雾港信使 II' })).toBeVisible()
  expect(within(sidebar).getByText('第 7 集《夜戏》')).toBeVisible()
  expect(screen.getByRole('img', { name: /以办公室为蓝本的动画制作现场/ })).toHaveAttribute('src', '/assets/pixel/studio/ProductionStudio.svg')
  expect(screen.queryByText(/FOCUS CUT/)).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '当前制作作品的像素动画单帧' })).not.toBeInTheDocument()
  expect(within(sidebar).getByLabelText('当前单集六阶段').children).toHaveLength(6)
  await user.click(within(sidebar).getByRole('button', { name: '夜行电车' }))
  expect(within(sidebar).getByRole('heading', { name: '夜行电车' })).toBeVisible()
  await user.click(within(actionPanel()).getByRole('button', { name: /查看当前单集/ }))
  expect(screen.getByRole('dialog', { name: '作品详情' })).toHaveTextContent('承制')
  expect(screen.getByText(/不参与委员会成员开放的非 BD 渠道分成/)).toBeInTheDocument()
})

it('会议室显示待决议题，进入后可选择并确认事件', async () => {
  const user = userEvent.setup()
  await openScene(user, '会议室')
  expect(screen.queryByRole('img', { name: '会议室白板' })).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: '会议室趋势图' })).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: /投影幕布，展示柱形图、饼状图和折线图报表/ })).toBeInTheDocument()
  expect(screen.getAllByRole('img', { name: /会议座椅/ })).toHaveLength(6)
  for (const direction of ['北侧西位', '北侧东位', '西侧', '东侧']) {
    expect(screen.getByRole('img', { name: `${direction}会议座椅，朝向桌心` })).toBeVisible()
  }
  expect(screen.getByRole('img', { name: '南侧西位会议座椅' })).toBeVisible()
  expect(screen.getByRole('img', { name: '南侧东位会议座椅' })).toBeVisible()
  expect(screen.getByRole('region', { name: '会议室信息' })).toHaveTextContent('第 19 周前')
  await user.click(within(actionPanel()).getByRole('button', { name: /处理待决议题/ }))
  const drawer = screen.getByRole('dialog', { name: '每周经营' })
  expect(within(drawer).getByRole('status')).toHaveTextContent('事件待处理')
  const confirm = within(drawer).getByRole('button', { name: '确认处理（原型）' })
  expect(confirm).toBeDisabled()
  await user.click(within(drawer).getByRole('radio', { name: '选择本周返工' }))
  await user.click(confirm)
  expect(within(drawer).getByRole('region', { name: '事件处理结果' })).toHaveTextContent('样本结果：本周返工，质量 +2')
  await user.click(within(drawer).getByRole('button', { name: /第 17 周/ }))
  await user.click(within(drawer).getByRole('button', { name: /第 18 周/ }))
  expect(within(drawer).getByRole('region', { name: '事件处理结果' })).toHaveTextContent('样本结果：本周返工，质量 +2')
  expect(prototypeData.receipts[0].event?.options[0].id).toBe('o1')
})

it('事务中心默认折叠，可展开回执并查看回滚与关闭状态', async () => {
  const user = userEvent.setup()
  const desk = screen.getByRole('region', { name: '事务中心' })
  const toggle = within(desk).getByRole('button', { name: '展开周回执' })
  expect(toggle).toHaveAttribute('aria-expanded', 'false')
  expect(within(desk).queryByText(/现金变化/)).not.toBeInTheDocument()
  await user.click(toggle)
  expect(within(desk).getByText(/现金变化/)).toBeVisible()
  await user.click(within(desk).getByRole('button', { name: '第 16 周' }))
  expect(desk).toHaveTextContent('周结算已回滚')
  await user.click(within(desk).getByRole('button', { name: '展开周回执' }))
  await user.click(within(desk).getByRole('button', { name: '查看完整回执' }))
  const drawer = screen.getByRole('dialog', { name: '每周经营' })
  expect(within(drawer).getByRole('region', { name: '预检失败后没有提交任何变化' })).toHaveTextContent('周数不推进')
  expect(within(drawer).queryByRole('button', { name: /紧急融资|申请.*贷款|负数现金/ })).not.toBeInTheDocument()
  expect(drawer).not.toHaveTextContent('现金：-¥')
  await user.click(screen.getByRole('button', { name: '关闭详情' }))
  await user.click(within(desk).getByRole('button', { name: '第 19 周' }))
  expect(desk).toHaveTextContent('关闭中')
  await user.click(within(desk).getByRole('button', { name: '展开周回执' }))
  await user.click(within(desk).getByRole('button', { name: '查看完整回执' }))
  expect(within(screen.getByRole('dialog', { name: '每周经营' })).getByRole('button', { name: '推进本周' })).toBeDisabled()
})

it('发行与市场五个交互对象共用同一场景，并复用业务面板', async () => {
  const user = userEvent.setup()
  await openScene(user, '发行与市场')
  const scene = screen.getByRole('region', { name: '发行与市场画面' })
  const actions = actionPanel()
  expect(screen.queryByRole('img', { name: /宣传海报|宣传主视觉/ })).not.toBeInTheDocument()
  expect(within(scene).queryByRole('button')).not.toBeInTheDocument()
  expect(within(actions).getByRole('button', { name: /企划承接/ })).toHaveClass('is-primary')
  expect(within(actions).getByRole('button', { name: /作品发行/ })).toHaveClass('is-primary')

  await user.click(within(actions).getByRole('button', { name: /查看业务公告板/ }))
  let drawer = screen.getByRole('dialog', { name: '市场企划' })
  expect(within(drawer).getByRole('button', { name: '承接企划（原型）' })).toBeDisabled()
  await user.click(within(drawer).getByRole('button', { name: /转生成路由器/ }))
  expect(within(drawer).getByRole('article', { name: '转生成路由器企划详情' })).toHaveTextContent('可进入承接评估')
  await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))

  await user.click(within(actions).getByRole('button', { name: /企划承接/ }))
  expect(screen.getByRole('dialog', { name: '市场企划' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '关闭详情' }))

  await user.click(within(actions).getByRole('button', { name: /作品发行/ }))
  drawer = screen.getByRole('dialog', { name: '作品发行' })
  expect(within(drawer).getByRole('region', { name: '作品发行情况与观众反馈' })).toHaveTextContent('雾港信使 II')
  expect(within(drawer).getByRole('region', { name: '观众与商业反馈' })).toHaveTextContent('通勤星座')
  await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))

  await user.click(within(actions).getByRole('button', { name: /查看公司作品墙/ }))
  drawer = screen.getByRole('dialog', { name: '作品 Archive' })
  expect(within(drawer).getAllByRole('listitem')).toHaveLength(prototypeData.history.length)
  await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))

  await user.click(within(actions).getByRole('button', { name: /查看业绩看板/ }))
  drawer = screen.getByRole('dialog', { name: '业绩与历史' })
  expect(within(drawer).getByRole('region', { name: '收入、声望与历史成绩' })).toHaveTextContent('公司声望')
  const finance = within(drawer).getByRole('region', { name: '公司现金流水与项目归因' })
  await user.selectOptions(within(finance).getByRole('combobox', { name: '周次' }), '18')
  await user.selectOptions(within(finance).getByRole('combobox', { name: '归因' }), 'p1')
  const table = within(finance).getByRole('table', { name: '公司现金流水' })
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(table).toHaveTextContent('《雾港II》第 7 集原画制作费')
  expect(table).not.toHaveTextContent('《夜行电车》第二期合同款')
  const archive = within(drawer).getByRole('region', { name: '作品 Archive 与经营历史' })
  expect(within(archive).getAllByRole('listitem')).toHaveLength(prototypeData.history.length)
  expect(within(archive).queryByText('雾港信使 II')).not.toBeInTheDocument()
  expect(within(sceneNav()).getByRole('button', { name: /发行与市场/ })).toHaveAttribute('aria-current', 'page')
})

it('办公室员工与设施可选中，锁定设施显示原因', async () => {
  const user = userEvent.setup()
  await user.click(within(actionPanel()).getByRole('button', { name: /查看员工与设施/ }))
  const drawer = screen.getByRole('dialog', { name: '公司详情' })
  await user.click(within(drawer).getByRole('button', { name: '查看员工 陈砚' }))
  expect(within(drawer).getByRole('region', { name: '陈砚员工详情' })).toHaveTextContent('疲劳 / 士气')
  await user.click(within(drawer).getByRole('button', { name: '查看设施 培训室' }))
  const facility = within(drawer).getByRole('region', { name: '培训室设施详情' })
  expect(facility).toHaveTextContent('不可用：M3 人才培养阶段尚未开放')
  expect(within(facility).queryByRole('button', { name: '进入培训室' })).not.toBeInTheDocument()
  await user.click(within(drawer).getByRole('button', { name: '查看设施 制作工位' }))
  await user.click(within(drawer).getByRole('button', { name: '查看制作现场' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: /以办公室为蓝本的动画制作现场/ })).toBeVisible()
})

it('制作现场侧栏定位具体层级，并保留各场景的作品与单集选择', async () => {
  const user = userEvent.setup()
  await openScene(user, '制作现场')
  const sidebar = screen.getByRole('region', { name: '制作现场信息' })
  await user.click(within(sidebar).getByRole('button', { name: '夜行电车' }))
  await user.click(within(sidebar).getByRole('button', { name: 'EP 02' }))
  await openScene(user, '办公室')
  await openScene(user, '制作现场')
  expect(within(screen.getByRole('region', { name: '制作现场信息' })).getByRole('heading', { name: '夜行电车' })).toBeVisible()
  expect(within(screen.getByRole('region', { name: '制作现场信息' })).getByText('第 2 集《无票区间》')).toBeVisible()
  await user.click(within(actionPanel()).getByRole('button', { name: /查看公共制作/ }))
  const drawer = screen.getByRole('dialog', { name: '作品详情' })
  expect(within(drawer).getByLabelText('公共制作定位')).toHaveFocus()
  await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))
  await user.click(within(actionPanel()).getByRole('button', { name: /查看当前单集/ }))
  expect(within(screen.getByRole('dialog', { name: '作品详情' })).getByLabelText('单集六阶段定位')).toHaveFocus()
})

it('全局状态可进入对应场景或面板，会议室决定只记录原型状态', async () => {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '查看公司现金' }))
  expect(screen.getByRole('dialog', { name: '财务与历史' })).toBeVisible()
  await user.keyboard('{Escape}')
  await user.click(screen.getByRole('button', { name: '查看在制作品' }))
  expect(screen.getByRole('img', { name: /以办公室为蓝本的动画制作现场/ })).toBeVisible()
  await openScene(user, '会议室')
  await user.click(within(actionPanel()).getByRole('button', { name: /处理待决议题/ }))
  const drawer = screen.getByRole('dialog', { name: '每周经营' })
  expect(within(drawer).getByLabelText('必须决定定位')).toHaveFocus()
  await user.click(within(drawer).getByRole('radio', { name: /继续全部给《雾港II》第 7 集/ }))
  await user.click(within(drawer).getAllByRole('button', { name: '记录选择（原型）' })[0])
  expect(within(drawer).getByText('已记录：继续全部给《雾港II》第 7 集')).toBeVisible()
  expect(prototypeData.company.cash).toBe(980_000)
  expect(prototypeData.company.week).toBe(18)
})

it('发行与市场侧栏企划直接选中对应详情，发行列表可筛选', async () => {
  const user = userEvent.setup()
  await openScene(user, '发行与市场')
  const sidebar = screen.getByRole('region', { name: '发行与市场信息' })
  await user.click(within(sidebar).getByRole('button', { name: /转生成路由器/ }))
  const drawer = screen.getByRole('dialog', { name: '市场企划' })
  expect(within(drawer).getByRole('article', { name: '转生成路由器企划详情' })).toBeVisible()
  expect(within(drawer).getByText(/不可用：F1 只评估企划/)).toBeVisible()
  await user.click(within(drawer).getByRole('button', { name: '关闭详情' }))
  await user.click(within(actionPanel()).getByRole('button', { name: /作品发行/ }))
  const release = screen.getByRole('dialog', { name: '作品发行' })
  await user.click(within(release).getByRole('button', { name: '已有交付单集' }))
  expect(within(release).getAllByRole('button', { name: '查看作品详情' })).toHaveLength(1)
  expect(within(release).getByRole('heading', { name: '雾港信使 II' })).toBeVisible()
})

it('场景切换关闭详情，不把工作面板永久铺在主地图上', async () => {
  const user = userEvent.setup()
  await user.click(within(actionPanel()).getByRole('button', { name: /查看员工与设施/ }))
  expect(screen.getByRole('dialog', { name: '公司详情' })).toBeVisible()
  await openScene(user, '制作现场')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('img', { name: /以办公室为蓝本的动画制作现场/ })).toBeVisible()
})

it('标注体系与素材署名覆盖四类信息口径', async () => {
  const user = userEvent.setup()
  await user.click(within(actionPanel()).getByRole('button', { name: /查看员工与设施/ }))
  expect(screen.getAllByText('原型样本').length).toBeGreaterThan(0)
  expect(screen.getByText(/2dPig Pixel Office（CC0）/)).toBeInTheDocument()
  expect(screen.getByText(/Antea（Free Furniture Office Equipment Set，作者署名）/)).toBeInTheDocument()
  expect(screen.getByText(/不读取后端/)).toBeInTheDocument()
})

it('原型保持纯静态：不引用核心服务、存档与旧 GameState', () => {
  for (const name of prototypeFiles) {
    const source = readFileSync(resolve(here.replace(/[^/\\]+$/, ''), name), 'utf8')
    expect(source, name).not.toMatch(/gameV3|gameCore|gameStore|useGameCore|indexedDB|fake-indexeddb|wasm|fetch\(/i)
  }
  expect(Object.keys(prototypeData).sort().join(',')).toBe('allocations,company,facilities,history,ledger,marketOffers,outsourcing,projects,receipts,relationships,staff,suppliers')
})

it('紧凑 SVG 场景的内嵌像素图铺满外层画布', () => {
  for (const name of ['studio/ProductionStudio.svg', 'market/DistributionMarket.svg']) {
    const source = readFileSync(resolve(here, '../../..', 'public/assets/pixel', name), 'utf8')
    expect(source, name).toMatch(/<svg[^>]+width="1280" height="1120" viewBox="0 0 1280 1120"/)
    expect(source, name).toMatch(/<image width="1280" height="1120"/)
  }
})

it('样本数据直接提供展示状态，不让界面重算交付与进度', () => {
  expect(prototypeData.allocations.every((item) => !('supportProjectIds' in item))).toBe(true)
  expect(prototypeData.allocations.filter((item) => item.projectId !== null)).toHaveLength(7)
  expect('managementLoad' in prototypeData.company).toBe(false)
  expect('managementCapacity' in prototypeData.company).toBe(false)
  for (const project of prototypeData.projects) {
    expect(project.episodes).toHaveLength(project.episodeCount)
    expect(project.episodes.filter((episode) => episode.isFocus).length).toBeLessThanOrEqual(1)
    expect(project.completion).toBe(project.work.percent)
    expect(project.deliveredEpisodeCount).toBe(project.episodes.filter((episode) => episode.status === 'delivered').length)
    for (const episode of project.episodes) {
      expect(episode.work.percent).toBeGreaterThanOrEqual(0)
      expect(episode.workItems.every((item) => ['blocked', 'ready', 'active', 'delivered', 'completed'].includes(item.state))).toBe(true)
      const gates = episode.workItems.filter((item) => item.isGate)
      if (episode.status === 'min_delivered') expect(gates.every((item) => item.state === 'delivered' || item.state === 'completed')).toBe(true)
      if (episode.status === 'not_started') expect(episode.workItems.every((item) => item.workDone === 0)).toBe(true)
    }
  }
  expect(prototypeData.receipts.map((item) => item.state).sort()).toEqual(['closing', 'event_pending', 'normal', 'settlement_rejected'])
  expect(prototypeData.receipts.every((item) => !('crisis' in item))).toBe(true)
})

it('生产入口只在 ?view=prototype 时进入原型，默认仍是原界面', () => {
  expect(mainSource).toMatch(/get\('view'\) === 'prototype'/)
  expect(mainSource).toMatch(/lazy\(\(\) => import\('\.\/prototype\/PrototypeApp'\)\)/)
  expect(mainSource).toContain('<App />')
})
