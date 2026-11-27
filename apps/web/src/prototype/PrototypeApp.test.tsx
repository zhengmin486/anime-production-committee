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

it('生产入口只在 ?view=prototype 时进入原型，默认仍是原界面', () => {
  expect(mainSource).toMatch(/view === 'prototype'/)
  expect(mainSource).toMatch(/view === 'v4'/)
  expect(mainSource).toMatch(/lazy\(\(\) => import\('\.\/prototype\/PrototypeApp'\)\)/)
  expect(mainSource).toContain('<App />')
})
