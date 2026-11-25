import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// v4 M1 契约测试：直接加载 emcc 构建的模块，全部通过 JSON 字符串接口调用。
// 依赖 build/v4/v4.mjs（npm run build:v4 生成）。
const factory = (await import('../build/v4/v4.mjs')).default
const core = await factory()

const call = (name, payload) => JSON.parse(core[name](JSON.stringify(payload)))
const ok = (name, payload) => {
  const result = call(name, payload)
  if (result.error) throw new Error(`${name} 失败: ${result.error.code} ${result.error.message}`)
  return result
}

const tiny = {
  schema_version: 1,
  id: 'test_tiny',
  name: '手算夹具',
  scale: 'short',
  episode_count: 1,
  work_unit: 'centi_staff_week',
  common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [] }],
  episode: [
    { key: 'script', stage: 'content_design', name: '脚本', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [] },
    { key: 'storyboard', stage: 'storyboard_key_animation', name: '分镜', ability: 'direction', work_total: 100, deliver_at: 1000, deps: ['script'] },
    { key: 'inbetween', stage: 'animation', name: '动画', ability: 'animation', work_total: 100, deliver_at: 1000, deps: ['storyboard'] },
    { key: 'background', stage: 'art_visual', name: '背景', ability: 'drawing', work_total: 100, deliver_at: 1000, deps: ['storyboard'] },
    { key: 'composite', stage: 'photography_editing', name: '摄影', ability: 'postproduction', work_total: 100, deliver_at: 1000, deps: ['inbetween', 'background'] },
    { key: 'master', stage: 'sound_delivery', name: '母版', ability: 'postproduction', work_total: 100, deliver_at: 1000, is_gate: true, deps: ['composite'] }
  ]
}

function findItem(state, workId, itemId) {
  const work = state.works.find((entry) => entry.id === workId)
  // 工作项 id 带项目前缀（INV-02 全局唯一）；测试里仍可用相对 id 书写。
  const full = itemId.startsWith(`${workId}.`) ? itemId : `${workId}.${itemId}`
  for (const item of work.common.items) if (item.id === full) return item
  for (const episode of work.episodes) for (const stage of episode.stages) for (const item of stage.items) if (item.id === full) return item
  throw new Error(`找不到工作项 ${itemId}`)
}

function allItems(state, workId) {
  const work = state.works.find((entry) => entry.id === workId)
  const items = [...work.common.items]
  for (const episode of work.episodes) for (const stage of episode.stages) items.push(...stage.items)
  return items
}

function setupTiny(seed = 7, workId = 'work_01') {
  const base = ok('initialize', { seed })
  const created = ok('instantiate_work', { state: base.state, blueprint: tiny, work_id: workId, duration_weeks: 26 })
  return created.state
}

test('initialize 生成合法状态，同 seed 哈希一致', () => {
  const first = ok('initialize', { seed: 42 })
  const second = ok('initialize', { seed: 42 })
  const hashA = ok('hash_state', { state: first.state }).hash
  const hashB = ok('hash_state', { state: second.state }).hash
  assert.equal(first.state.version, 4)
  assert.equal(first.state.company.week, 0)
  assert.equal(first.state.staff.length, 3)
  assert.equal(hashA, hashB)
})

test('实例化 tv_standard 得到 174 个工作项（12×14 + 6）', () => {
  const blueprint = JSON.parse(readFileSync('docs/blueprints/tv_standard.blueprint.json', 'utf8'))
  const base = ok('initialize', { seed: 1 })
  const created = ok('instantiate_work', { state: base.state, blueprint, work_id: 'work_tv', duration_weeks: 26 })
  const items = allItems(created.state, 'work_tv')
  assert.equal(created.state.works[0].episodes.length, 12)
  assert.equal(items.length, 174)
  const gates = items.filter((item) => item.is_gate)
  assert.equal(gates.length, 12)
})

test('首周产出与独立手算逐项一致', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  const advanced = ok('advance_week', { state })

  // 手算（产能按主专业；跨专业按 800‰ 折算并四舍五入；分配期按未被占用的剩余量扣减）：
  // staff_anim 80 点 → 公共项 80→64（余 20）
  // staff_dir  82 点 → 公共项 20→16（余 0），脚本 62→50（余 38）
  // staff_ka   85 点 → 脚本 38→30（余 0）
  const common = findItem(advanced.state, 'work_01', 'common.series_comp')
  const script = findItem(advanced.state, 'work_01', 'ep01.script')
  assert.equal(common.work_done, 80)
  assert.equal(script.work_done, 80)

  // 质量是评级，不是点数换算：公共项按能力落到 story，脚本只允许 story/direction。
  // 旧公式（点数 × ability_q）会得到 58 / 62；新模型下质量与点数无关，由人和随机决定。
  const commonDims = Object.entries(common.quality).filter(([, value]) => value > 0)
  assert.equal(commonDims.length, 1, '公共项本周只写入一个质量维度')
  assert.equal(commonDims[0][0], 'story', '公共制作按 planning 落到 story')
  assert.ok(commonDims[0][1] >= 0 && commonDims[0][1] <= 100, '质量是 0..100 的评级')

  const scriptDims = Object.entries(script.quality).filter(([, value]) => value > 0)
  assert.ok(scriptDims.length >= 1 && scriptDims.length <= 2, '脚本只应落在 content_design 的两个维度')
  for (const [dim] of scriptDims) assert.ok(['story', 'direction'].includes(dim), `意外维度 ${dim}`)

  // 周结算同时记账：工资 120000 + 运营 30000 + 制作 60000 = 210000
  assert.equal(advanced.report.funds.costs.salary, 120000)
  assert.equal(advanced.report.funds.costs.operations, 30000)
  assert.equal(advanced.report.funds.costs.production, 60000)
  assert.equal(advanced.report.funds.delta, -210000)
  assert.equal(advanced.report.funds.balance, 1790000)
  assert.equal(advanced.state.finance.balance, 1790000)
  const ledgerSum = advanced.state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0)
  assert.equal(advanced.state.finance.opening_funds + ledgerSum, advanced.state.finance.balance)
  assert.equal(advanced.state.finance.entries.length, 5)   // 3 工资 + 1 运营 + 1 制作
  assert.ok(advanced.state.finance.entries.some((entry) => entry.category === 'production' && entry.work_id === 'work_01'))

  // 质量聚合进入回执：工作项 → 阶段 → 单集 → 作品
  const aggregated = advanced.report.works[0].quality
  const aggregatedSum = Object.values(aggregated.dims).reduce((sum, value) => sum + value, 0)
  assert.ok(aggregatedSum > 0, '作品层质量不应为空')
  assert.ok(Object.values(aggregated.dims).filter((value) => value > 0).length <= 2, '只有脚本产出了质量')
  assert.equal(aggregated.mean, Math.round(aggregatedSum / 6))

  const fatigue = Object.fromEntries(advanced.state.staff.map((member) => [member.id, member.fatigue]))
  const morale = Object.fromEntries(advanced.state.staff.map((member) => [member.id, member.morale]))
  for (const id of ['staff_dir', 'staff_ka', 'staff_anim']) {
    assert.equal(fatigue[id], 8)
    assert.equal(morale[id], 78)
  }
  assert.equal(advanced.state.company.week, 1)
})

test('未开工的下游工作项不被解锁', () => {
  let state = setupTiny()
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' }).state
  const advanced = ok('advance_week', { state })
  const storyboard = findItem(advanced.state, 'work_01', 'ep01.storyboard')
  assert.equal(storyboard.work_done, 0)
})

test('同 seed 同操作序列产生相同哈希', () => {
  const run = () => {
    let state = setupTiny(11)
    state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' }).state
    state = ok('advance_week', { state }).state
    return ok('hash_state', { state }).hash
  }
  assert.equal(run(), run())
})

test('项目遍历顺序不改变结算结果', () => {
  const build = () => {
    let state = ok('initialize', { seed: 3 }).state
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
    for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
      state = ok('assign_staff', { state, staff_id: staffId, work_id: staffId === 'staff_dir' ? 'work_a' : 'work_b' }).state
    }
    return state
  }
  const straight = ok('advance_week', { state: build() })
  const reversedState = build()
  reversedState.works = [...reversedState.works].reverse()
  const reversed = ok('advance_week', { state: reversedState })

  assert.equal(
    ok('hash_state', { state: straight.state }).hash,
    ok('hash_state', { state: reversed.state }).hash
  )
})

test('两个空项目并存且状态隔离', () => {
  let state = ok('initialize', { seed: 5 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_a' }).state
  const advanced = ok('advance_week', { state })

  assert.equal(advanced.state.works.length, 2)
  const a = findItem(advanced.state, 'work_a', 'common.series_comp')
  const b = findItem(advanced.state, 'work_b', 'common.series_comp')
  assert.ok(a.work_done > 0)
  assert.equal(b.work_done, 0)
})

test('非法目标与非法归属被拒绝且状态不变', () => {
  const state = setupTiny()
  const badTarget = call('set_plan', { state, work_id: 'work_01', plan: { target: { kind: 'episode', id: 'ep99' } } })
  assert.equal(badTarget.error.code, 'INVALID_INPUT')

  const badStaff = call('assign_staff', { state, staff_id: 'nobody', work_id: 'work_01' })
  assert.equal(badStaff.error.code, 'NOT_FOUND')

  const badWork = call('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_99' })
  assert.equal(badWork.error.code, 'NOT_FOUND')
})

test('定向目标把产能拉到指定单集', () => {
  // 单人、单周，差异只来自定向：不设定向时预算全给公共项，设了才轮到脚本
  const run = (plan) => {
    let state = ok('initialize', { seed: 9 }).state
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
    if (plan) state = ok('set_plan', { state, work_id: 'work_b', plan }).state
    state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_b' }).state
    const advanced = ok('advance_week', { state })
    return {
      script: findItem(advanced.state, 'work_b', 'ep01.script').work_done,
      common: findItem(advanced.state, 'work_b', 'common.series_comp').work_done,
      first: advanced.report.works.find((entry) => entry.work_id === 'work_b').items[0].item_id
    }
  }
  const plain = run(null)
  assert.ok(plain.common > 0 && plain.script === 0, '无定向时公共项先吃满')

  const targeted = run({ focus: 'quality', target: { kind: 'episode', id: 'ep01' } })
  assert.ok(targeted.script > 0, '定向后脚本应有产出')
  assert.equal(targeted.common, 0, '定向后公共项应让位')
  assert.equal(targeted.first, 'work_b.ep01.script', '第一个被投入的工作项应当是定向目标')
})

test('门槛优先级高于质量取向（回归：已过门槛的项不得吸走产能）', () => {
  // 公共项 work_total=1000 只给 150 的门槛：第 0 周（198 点）就"达标"，但远未做完。
  // 若排序被 quality 取向倒置，它会在后续每周继续吸走全部产能，脚本永远开不了工。
  const big = {
    ...tiny,
    id: 'test_gate_priority',
    common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: 1000, deliver_at: 150, deps: [] }]
  }
  for (const focus of ['quality', 'schedule', 'cost']) {
    let state = ok('initialize', { seed: 7 }).state
    state = ok('instantiate_work', { state, blueprint: big, work_id: 'work_01', duration_weeks: 26 }).state
    state = ok('set_plan', { state, work_id: 'work_01', plan: { focus } }).state
    for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
      state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
    }
    state = ok('advance_week', { state }).state
    // 第 1 周：公共项已过门槛但仍未完成，脚本尚未开工 —— 应当轮到脚本
    const advanced = ok('advance_week', { state })
    const script = findItem(advanced.state, 'work_01', 'ep01.script')
    const common = findItem(advanced.state, 'work_01', 'common.series_comp')
    assert.ok(common.work_done > 150 && common.work_done < 1000, `${focus}: 公共项应已过门槛但未完成`)
    assert.ok(script.work_done > 0, `${focus}: 未达门槛的脚本必须拿到产能`)
  }
})

test('改 focus 不清除定向目标，显式 null 才清除', () => {
  let state = setupTiny()
  state = ok('set_plan', { state, work_id: 'work_01', plan: { target: { kind: 'episode', id: 'ep01' } } }).state
  assert.deepEqual(state.works[0].plan.target, { kind: 'episode', id: 'ep01' })

  state = ok('set_plan', { state, work_id: 'work_01', plan: { focus: 'schedule' } }).state
  assert.deepEqual(state.works[0].plan.target, { kind: 'episode', id: 'ep01' }, '只改 focus 不应丢目标')
  assert.equal(state.works[0].plan.focus, 'schedule')

  state = ok('set_plan', { state, work_id: 'work_01', plan: { target: null } }).state
  assert.equal(state.works[0].plan.target, null, '显式 null 才清除目标')
})

test('计划枚举非法取值被拒绝且状态不变', () => {
  const state = setupTiny()
  const cases = [
    { focus: 'bogus' },
    { intensity: 'extreme' },
    { outsourcing: 'whatever' },
    { overtime: 'yes' },
    { target: 'ep01' }
  ]
  for (const plan of cases) {
    const result = call('set_plan', { state, work_id: 'work_01', plan })
    assert.equal(result.error?.code, 'INVALID_INPUT', `plan=${JSON.stringify(plan)} 应被拒绝`)
  }
})

test('现金不足时整周不提交，状态与流水都不变', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  // 本周需要 210000，只留 100000
  state.finance.opening_funds = 100000
  state.finance.balance = 100000
  const before = ok('hash_state', { state }).hash

  const result = call('advance_week', { state })
  assert.equal(result.error.code, 'INSUFFICIENT_FUNDS')
  assert.equal(result.error.gap, 110000)
  assert.equal(ok('hash_state', { state }).hash, before, '失败不得留下半结算')
  assert.equal(state.company.week, 0)
  assert.equal(state.finance.entries.length, 0)
  assert.equal(findItem(state, 'work_01', 'common.series_comp').work_done, 0)
})

test('双项目隔离：产出不串项目，作者不串项目', () => {
  let state = ok('initialize', { seed: 5 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_a' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_b' }).state
  const advanced = ok('advance_week', { state })

  const aItems = allItems(advanced.state, 'work_a')
  const bItems = allItems(advanced.state, 'work_b')
  // 只有各自项目的员工出现在 contributors 里
  for (const item of aItems) {
    for (const id of item.contributors) assert.equal(id, 'staff_ka', `work_a 出现了 ${id}`)
  }
  for (const item of bItems) {
    for (const id of item.contributors) assert.equal(id, 'staff_dir', `work_b 出现了 ${id}`)
  }
  // 两个项目的产出都必须 >0，且没有互相抵消
  assert.ok(aItems.some((item) => item.work_done > 0))
  assert.ok(bItems.some((item) => item.work_done > 0))
  // 每人本周产出不超过自身产能（不会被算两次）
  const produced = Object.fromEntries(advanced.report.staff.map((entry) => [entry.staff_id, entry.produced]))
  assert.ok(produced.staff_ka <= 100 && produced.staff_dir <= 100)
  const sumA = aItems.reduce((sum, item) => sum + item.work_done, 0)
  const sumB = bItems.reduce((sum, item) => sum + item.work_done, 0)
  assert.equal(sumA + sumB, produced.staff_ka + produced.staff_dir)
})

test('随机性进入制作结果：换 seed 改变质量落维，同 seed 可复现', () => {
  const run = (seed) => {
    let state = ok('initialize', { seed }).state
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_01', duration_weeks: 26 }).state
    for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
      state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
    }
    const advanced = ok('advance_week', { state })
    const script = findItem(advanced.state, 'work_01', 'ep01.script')
    const dim = Object.entries(script.quality).find(([, value]) => value > 0)?.[0]
    return { dim, hash: ok('hash_state', { state: advanced.state }).hash }
  }
  const first = run(21)
  assert.deepEqual(run(21), first, '同 seed 必须逐字段复现')
  const dims = new Set()
  for (let seed = 0; seed < 12; seed++) dims.add(run(seed).dim)
  assert.ok(dims.size > 1, '不同 seed 应落到不同质量维度，否则随机性没有进入结果')
})

// ---- 2026-11-25 复审修正：质量模型、不变式、输入边界 ----

const assign = (state, staffId, workId = 'work_01') =>
  ok('assign_staff', { state, staff_id: staffId, work_id: workId }).state

const meanOf = (dims) => Math.round(Object.values(dims).reduce((sum, value) => sum + value, 0) / 6)

function singleItemBlueprint(workTotal, overrides = {}) {
  return {
    ...tiny,
    id: `single_${workTotal}`,
    common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: workTotal, deliver_at: 1000, deps: [] }],
    ...overrides
  }
}

test('质量：工作量不同不改变质量评级（与点数脱钩）', () => {
  const run = (workTotal) => {
    let state = ok('initialize', { seed: 77 }).state
    state = ok('instantiate_work', { state, blueprint: singleItemBlueprint(workTotal), work_id: 'work_01', duration_weeks: 26 }).state
    state = assign(state, 'staff_dir')
    const advanced = ok('advance_week', { state })
    const item = findItem(advanced.state, 'work_01', 'common.series_comp')
    const entry = advanced.report.works[0].items.find((row) => row.item_id === item.id)
    return { points: entry.points, quality: Object.values(item.quality).reduce((sum, value) => sum + value, 0) }
  }
  const small = run(20)
  const large = run(200)
  assert.ok(large.points > small.points, `两次投入点数应当不同：${small.points} vs ${large.points}`)
  assert.equal(large.quality, small.quality, '点数不同但质量评级相同：质量不是点数换算')
})

test('质量：同等工作量下，能力与随机都会改变质量', () => {
  const run = (ability, seed) => {
    let state = ok('initialize', { seed }).state
    state = ok('instantiate_work', { state, blueprint: singleItemBlueprint(10), work_id: 'work_01', duration_weeks: 26 }).state
    const member = state.staff.find((entry) => entry.id === 'staff_dir')
    member.abilities.planning = ability
    member.potential.planning = Math.max(member.potential.planning, ability)
    member.role = 'scriptwriter'   // planning 主专业，排除适配差异
    state = assign(state, 'staff_dir')
    const advanced = ok('advance_week', { state })
    const item = findItem(advanced.state, 'work_01', 'common.series_comp')
    const entry = advanced.report.works[0].items.find((row) => row.item_id === item.id)
    return { points: entry.points, quality: item.quality.story }
  }
  const strong = run(90, 5)
  const weak = run(20, 5)
  assert.equal(strong.points, weak.points, '工作项只有 10 点，两人投入相同')
  assert.ok(strong.quality > weak.quality + 40, `能力应显著改变质量：${strong.quality} vs ${weak.quality}`)

  const values = new Set([1, 2, 3, 4, 5].map((seed) => run(60, seed).quality))
  assert.ok(values.size > 1, `同能力同工作量，不同随机仍应给出不同质量：${[...values].join(',')}`)
})

test('质量：未开工为 0，部分完成是评级，完成后不越界', () => {
  let state = setupTiny()
  const fresh = findItem(state, 'work_01', 'common.series_comp')
  assert.equal(Object.values(fresh.quality).reduce((sum, value) => sum + value, 0), 0)

  state = assign(state, 'staff_dir')
  state = ok('advance_week', { state }).state
  const partial = findItem(state, 'work_01', 'common.series_comp')
  assert.ok(partial.work_done > 0 && partial.work_done < partial.work_total, '第一周应为部分完成')
  const partialQuality = Object.values(partial.quality).reduce((sum, value) => sum + value, 0)
  assert.ok(partialQuality > 0 && partialQuality <= 100, '部分完成时质量应是 0..100 的评级')

  // 同一员工跨专业投入按 800‰ 折算，需要几周才能做满；逐周确认质量始终是评级。
  for (let guard = 0; guard < 6; guard++) {
    state = ok('advance_week', { state }).state
    const item = findItem(state, 'work_01', 'common.series_comp')
    assert.ok(Object.values(item.quality).every((value) => value >= 0 && value <= 100))
    if (item.work_done === item.work_total) break
  }
  const complete = findItem(state, 'work_01', 'common.series_comp')
  assert.equal(complete.work_done, complete.work_total)
})

test('质量：维度权重按 700/300 生效', () => {
  const counts = { story: 0, direction: 0 }
  for (let seed = 0; seed < 40; seed++) {
    let state = ok('initialize', { seed }).state
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_01', duration_weeks: 26 }).state
    state = ok('set_plan', { state, work_id: 'work_01', plan: { target: { kind: 'episode', id: 'ep01' } } }).state
    state = assign(state, 'staff_dir')
    const advanced = ok('advance_week', { state })
    const script = findItem(advanced.state, 'work_01', 'ep01.script')
    const dims = Object.entries(script.quality).filter(([, value]) => value > 0).map(([dim]) => dim)
    assert.equal(dims.length, 1, `seed=${seed} 应只写入一个维度`)
    counts[dims[0]] += 1
  }
  assert.ok(counts.direction > 0, `direction 也应能出现：${JSON.stringify(counts)}`)
  assert.ok(counts.story >= 20, `700‰ 权重下 story 至少应占一半：${JSON.stringify(counts)}`)
  assert.ok(counts.story > counts.direction, `story 应多于 direction：${JSON.stringify(counts)}`)
})

test('质量：公共制作通过依赖上限影响下游与作品层', () => {
  const dependent = {
    ...tiny,
    id: 'dep_tiny',
    episode: tiny.episode.map((item) => (item.key === 'script' ? { ...item, deps: ['common:series_comp'] } : item))
  }
  const run = (commonQuality) => {
    let state = ok('initialize', { seed: 31 }).state
    state = ok('instantiate_work', { state, blueprint: dependent, work_id: 'work_01', duration_weeks: 26 }).state
    const common = findItem(state, 'work_01', 'common.series_comp')
    common.work_done = common.work_total
    common.contributors = ['staff_dir']
    for (const dim of Object.keys(common.quality)) common.quality[dim] = commonQuality
    // 让执行者的质量样本明显高于低质量上限，才能观察到"公共项压低下游"。
    const member = state.staff.find((entry) => entry.id === 'staff_dir')
    member.abilities.planning = 90
    member.potential.planning = Math.max(member.potential.planning, 90)
    member.role = 'scriptwriter'
    state = assign(state, 'staff_dir')
    const advanced = ok('advance_week', { state })
    const script = findItem(advanced.state, 'work_01', 'ep01.script')
    return { script, aggregate: advanced.report.works[0].quality }
  }
  const low = run(20)
  const high = run(90)
  const lowMax = Math.max(...Object.values(low.script.quality))
  const highMax = Math.max(...Object.values(high.script.quality))
  assert.ok(lowMax <= 52, `低质量公共项应把下游压到 52 以内，实际 ${lowMax}`)
  assert.ok(highMax > 52, `高质量公共项不应继续被压住，实际 ${highMax}`)
  assert.ok(high.aggregate.dims.story > low.aggregate.dims.story, '作品层质量应体现公共制作的差异')
})

test('不变式：全局 id、公共项、归属、参与记录与贡献者都被校验', () => {
  const base = setupTiny()
  const reject = (mutate, label) => {
    const state = JSON.parse(JSON.stringify(base))
    mutate(state)
    const result = call('advance_week', { state })
    assert.equal(result.error?.code, 'INVALID_STATE', `${label}: ${JSON.stringify(result)}`)
  }
  reject((state) => { state.staff[0].id = state.works[0].id }, 'INV-02 staff 与 work 撞 id')
  reject((state) => { state.works[0].common.items[0].id = state.works[0].episodes[0].stages[0].items[0].id }, 'INV-02 工作项重复')
  reject((state) => { state.works[0].common.items[0].work_total = 0 }, 'INV-03 公共项 work_total')
  reject((state) => { state.works[0].status = 'settled'; state.staff[0].assignment_work_id = state.works[0].id }, 'INV-09 归属非 producing')
  reject((state) => {
    state.company.week = 2
    state.staff[0].last_participation = { work_id: state.works[0].id, item_id: state.works[0].common.items[0].id, week: 0 }
  }, 'INV-11 两周前的参与记录')
  reject((state) => {
    state.works[0].common.items[0].work_done = 10
    state.works[0].common.items[0].contributors = ['staff_dir', 'staff_dir']
  }, 'INV-12 重复贡献者')
  reject((state) => {
    state.works[0].common.items[0].work_done = 10
    state.works[0].common.items[0].contributors = ['nobody']
  }, 'INV-12 未知贡献者')
  const capped = JSON.parse(JSON.stringify(base))
  capped.company.week = 520
  const cappedResult = call('assign_staff', { state: capped, staff_id: 'staff_dir', work_id: 'work_01' })
  assert.equal(cappedResult.error?.code, 'INVALID_STATE', `INV-21 running 到 520: ${JSON.stringify(cappedResult)}`)

  const good = JSON.parse(JSON.stringify(base))
  good.company.week = 2
  good.staff[0].last_participation = { work_id: good.works[0].id, item_id: good.works[0].common.items[0].id, week: 1 }
  ok('assign_staff', { state: good, staff_id: 'staff_dir', work_id: 'work_01' })
})

test('不变式：根状态、企划模式、公共门槛与数值边界被严格校验', () => {
  const rejectTiny = (mutate, label) => {
    const state = JSON.parse(JSON.stringify(setupTiny()))
    mutate(state)
    assert.equal(call('save_game', { state }).error?.code, 'INVALID_STATE', label)
    assert.equal(call('advance_week', { state }).error?.code, 'INVALID_STATE', label)
  }
  rejectTiny((state) => { state.company.reputation = -1 }, '声望不能为负')
  rejectTiny((state) => { state.company.id = 'Invalid-ID' }, '公司 id 格式')
  rejectTiny((state) => { state.company.facilities = ['studio_one', 'studio_one'] }, '设施重复')
  rejectTiny((state) => { state.staff[0].potential.planning = state.staff[0].abilities.planning - 1 }, '能力不得超过潜力')
  rejectTiny((state) => { state.staff = [] }, '至少保留一名核心员工')
  rejectTiny((state) => { state.works[0].common.items[0].is_gate = true }, '公共项不能作为单集门槛')
  rejectTiny((state) => { state.works[0].deadline_week = 0 }, 'producing 项目不得逾期')

  const narrowed = JSON.parse(JSON.stringify(setupTiny()))
  narrowed.company.week = 2147483648
  assert.equal(call('save_game', { state: narrowed }).error?.code, 'INVALID_INPUT', '整数不得窄化')
  assert.equal(call('advance_week', { state: narrowed }).error?.code, 'INVALID_INPUT', '整数不得窄化')

  const external = setupStarted().state
  external.works[0].offer.origin = 'original'
  external.works[0].offer.allowed_modes = ['committee']
  assert.equal(call('save_game', { state: external }).error?.code, 'INVALID_STATE', '承制模式不在原创企划允许列表')

  for (const mutate of [
    (offer) => { offer.allowed_modes = ['contract'] },
    (offer) => { offer.origin = 'original' },
    (offer) => { offer.allowed_modes = ['committee', 'contract', 'committee'] },
    (offer) => { offer.channels_baseline = ['bd_dvd', 'bd_dvd'] }
  ]) {
    const requestState = startBase()
    mutate(requestState.market.slots[0])
    assert.equal(call('start_work', {
      state: requestState, offer_id: 'offer_tv_standard', mode: 'contract', percent: 0,
      committee_partner_ids: [], blueprint: m2Blueprint
    }).error?.code, 'INVALID_STATE')
  }

  const original = startBase()
  original.market.slots[0].origin = 'original'
  original.market.slots[0].allowed_modes = ['committee']
  const originalResult = ok('start_work', {
    state: original, offer_id: 'offer_tv_standard', mode: 'committee', percent: 10,
    committee_partner_ids: [], blueprint: m2Blueprint
  })
  assert.equal(originalResult.state.works[0].mode, 'committee')
})

test('参与记录：未产出周清空，满足 INV-11', () => {
  let state = setupTiny()
  state = assign(state, 'staff_dir')
  state = ok('advance_week', { state }).state
  assert.equal(state.staff.find((entry) => entry.id === 'staff_dir').last_participation.week, 0)
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: null }).state
  state = ok('advance_week', { state }).state
  assert.equal(state.staff.find((entry) => entry.id === 'staff_dir').last_participation, null)
  ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' })
})

test('输入边界：assign_staff 的 work_id 类型错误不被当成取消分配', () => {
  const state = assign(setupTiny(), 'staff_dir')
  const before = ok('hash_state', { state }).hash
  for (const work_id of [123, '', {}, []]) {
    const result = call('assign_staff', { state, staff_id: 'staff_dir', work_id })
    assert.equal(result.error?.code, 'INVALID_INPUT', `work_id=${JSON.stringify(work_id)}`)
    assert.equal(ok('hash_state', { state }).hash, before, '失败不得改动状态')
  }
  assert.equal(call('assign_staff', { state, staff_id: 'staff_dir' }).error?.code, 'INVALID_INPUT')
  const cleared = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: null }).state
  assert.equal(cleared.staff.find((entry) => entry.id === 'staff_dir').assignment_work_id, null)
})

test('输入边界：缺必填字段返回 INVALID_INPUT，不用默认值掩盖', () => {
  const state = setupTiny()
  const missingWeek = JSON.parse(JSON.stringify(state))
  delete missingWeek.company.week
  assert.equal(call('assign_staff', { state: missingWeek, staff_id: 'staff_dir', work_id: null }).error?.code, 'INVALID_INPUT')

  const missingTotal = JSON.parse(JSON.stringify(state))
  delete missingTotal.works[0].common.items[0].work_total
  assert.equal(call('assign_staff', { state: missingTotal, staff_id: 'staff_dir', work_id: null }).error?.code, 'INVALID_INPUT')
})

test('契约名适配：initialize_game / set_work_plan 与内部入口等价', () => {
  const internal = ok('initialize', { seed: 42 }).state
  const contract = ok('initialize_game', { seed: 42 }).state
  assert.equal(ok('hash_state', { state: internal }).hash, ok('hash_state', { state: contract }).hash)
  assert.equal(call('initialize_game', {}).error?.code, 'INVALID_INPUT')

  const base = setupTiny()
  const plan = { focus: 'schedule', target: { kind: 'episode', id: 'ep01' } }
  const viaInternal = ok('set_plan', { state: base, work_id: 'work_01', plan }).state
  const viaContract = ok('set_work_plan', { state: base, work_id: 'work_01', plan }).state
  assert.equal(ok('hash_state', { state: viaInternal }).hash, ok('hash_state', { state: viaContract }).hash)
})

const m2Blueprint = { ...tiny, id: 'tv_standard', name: 'M2 单集夹具' }
const eventCatalog = {
  schema_version: 1,
  events: [{
    id: 'test_budget_event', name: '测试预算事件', polarity: 'negative', tier: 'normal', category: 'budget',
    stages: ['content_design'], tag: 'test_budget', priority: 1, cooldown_weeks: 2, once_per_project: true,
    trigger: { metric: 'funds', op: '<', threshold: 99999999 }, random_weight: 0, expires_weeks: 0, escalation: null,
    description: '固定触发，用于验证项目独立事件。',
    options: [
      { id: 'accept', kind: 'abandon', label: '接受', cost: 1000, effects: [{ scope: 'instant', target: 'morale', value: -2 }] },
      { id: 'skip', kind: 'abandon', label: '跳过', cost: 0, effects: [] }
    ]
  }]
}

function startBase() {
  const state = ok('initialize', { seed: 17 }).state
  state.market.slots[0].episode_count = 1
  state.market.slots[0].scale = m2Blueprint.scale
  state.market.slots[0].blueprint_id = m2Blueprint.id
  return state
}

function setupStarted(mode = 'contract', percent = 0) {
  const started = ok('start_work', {
    state: startBase(), offer_id: 'offer_tv_standard', mode, percent, committee_partner_ids: [], blueprint: m2Blueprint
  })
  return { state: started.state, workId: started.work_id }
}

function completeWork(state, workId, staffId = 'staff_dir') {
  const work = state.works.find((entry) => entry.id === workId)
  for (const item of [...work.common.items, ...work.episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))]) {
    item.work_done = item.work_total
    if (!item.contributors.includes(staffId)) item.contributors.push(staffId)
  }
  return state
}

function handoverState({ workId = 'work_01', itemId = 'ep01.script', workDone = 0, workTotal = 200, contributors = [], week = 1 } = {}) {
  const state = setupTiny()
  state.company.week = week
  const fullId = `${workId}.${itemId}`
  for (const item of allItems(state, workId)) {
    if (item.id !== fullId) item.work_done = item.work_total
  }
  const item = findItem(state, workId, itemId)
  item.work_total = workTotal
  item.work_done = workDone
  item.contributors = [...contributors]
  return { state, itemId: fullId }
}

function runStaff(state, staffIds, workId = 'work_01') {
  for (const staffId of staffIds) state = ok('assign_staff', { state, staff_id: staffId, work_id: workId }).state
  const result = ok('advance_week', { state })
  return {
    state: result.state,
    produced: Object.fromEntries(result.report.staff.map((entry) => [entry.staff_id, entry.produced]))
  }
}

test('磨合 HO-01–HO-06/HO-09：工作项级损失与参与者按 fixture 映射', () => {
  const cases = [
    { id: 'HO-01', staff: 'staff_ka', workDone: 30, contributors: ['staff_dir'], loss: true },
    { id: 'HO-02', staff: 'staff_ka', workDone: 0, contributors: [], loss: false },
    { id: 'HO-03', staff: 'staff_ka', workDone: 80, contributors: ['staff_dir', 'staff_ka'], loss: false },
    { id: 'HO-04', staff: 'staff_ka', workDone: 55, contributors: ['staff_dir'], loss: true, lastItem: 'work_01.ep01.storyboard' },
    { id: 'HO-06', staff: 'staff_temp', workDone: 20, workTotal: 200, contributors: ['staff_dir'], loss: true, temporary: true },
    { id: 'HO-09', staff: 'staff_ka', workDone: 70, contributors: ['staff_ka'], loss: false, week: 11 }
  ]
  for (const fixture of cases) {
    const { state, itemId } = handoverState(fixture)
    if (fixture.temporary) {
      state.staff.push({
        ...JSON.parse(JSON.stringify(state.staff.find((member) => member.id === 'staff_ka'))),
        id: 'staff_temp', name: '临时员工', employment: 'temporary', weekly_salary: 50000, project_fee: 10000,
        assignment_work_id: 'work_01', temporary_contract: { work_id: 'work_01', started_week: 0 }
      })
    }
    if (fixture.lastItem) {
      state.staff.find((member) => member.id === fixture.staff).last_participation = {
        work_id: 'work_01', item_id: fixture.lastItem, week: 0
      }
    }
    const actual = runStaff(state, [fixture.staff])
    const controlState = JSON.parse(JSON.stringify(state))
    const controlItem = findItem(controlState, 'work_01', itemId)
    if (controlItem.work_done > 0 && !controlItem.contributors.includes(fixture.staff)) controlItem.contributors.push(fixture.staff)
    const control = runStaff(controlState, [fixture.staff])
    const actualItem = findItem(actual.state, 'work_01', itemId)
    assert.equal(actual.produced[fixture.staff] < control.produced[fixture.staff], fixture.loss, `${fixture.id} item_loss`)
    assert.equal(actualItem.contributors.includes(fixture.staff), true, `${fixture.id} contributor_added`)
    assert.equal(actual.state.staff.find((member) => member.id === fixture.staff).last_participation !== null, true)
    if (fixture.loss) {
      assert.equal(actual.produced[fixture.staff], Math.floor(control.produced[fixture.staff] * 0.75 + 0.5), fixture.id)
    } else {
      assert.equal(actual.produced[fixture.staff], control.produced[fixture.staff], fixture.id)
    }
  }
})

test('磨合 HO-05：两人同周从零开始同一工作项，不互相判接手', () => {
  const { state, itemId } = handoverState({ workTotal: 1000 })
  const anim = runStaff(JSON.parse(JSON.stringify(state)), ['staff_anim'])
  const ka = runStaff(JSON.parse(JSON.stringify(state)), ['staff_ka'])
  const together = runStaff(JSON.parse(JSON.stringify(state)), ['staff_anim', 'staff_ka'])
  assert.equal(together.produced.staff_anim, anim.produced.staff_anim)
  assert.equal(together.produced.staff_ka, ka.produced.staff_ka)
  const item = findItem(together.state, 'work_01', itemId)
  assert.ok(item.contributors.includes('staff_anim') && item.contributors.includes('staff_ka'))
})

function supervisorState(lastWorkId, role = 'director') {
  let state = setupTiny()
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_02', duration_weeks: 26 }).state
  state.company.week = 1
  for (const item of allItems(state, 'work_02')) {
    if (item.id !== 'work_02.ep01.script') item.work_done = item.work_total
  }
  const item = findItem(state, 'work_02', 'ep01.script')
  item.work_total = 1000
  item.work_done = 0
  item.contributors = []
  const director = state.staff.find((member) => member.id === 'staff_dir')
  director.role = role
  director.last_participation = { work_id: lastWorkId, item_id: `${lastWorkId}.ep01.script`, week: 0 }
  return state
}

test('磨合 HO-07/HO-08：监督换项目才有团队损失，留项不损失且不叠加个人损失', () => {
  const switched = runStaff(supervisorState('work_01'), ['staff_dir', 'staff_ka'], 'work_02')
  const stayed = runStaff(supervisorState('work_02'), ['staff_dir', 'staff_ka'], 'work_02')
  const independent = runStaff(supervisorState('work_02', 'independent_director'), ['staff_dir', 'staff_ka'], 'work_02')
  assert.ok(switched.produced.staff_dir < stayed.produced.staff_dir)
  assert.ok(switched.produced.staff_ka < stayed.produced.staff_ka)
  assert.equal(stayed.produced.staff_dir, independent.produced.staff_dir)
  assert.equal(stayed.produced.staff_ka, independent.produced.staff_ka)
  const item = findItem(stayed.state, 'work_02', 'ep01.script')
  assert.ok(item.contributors.includes('staff_dir') && item.contributors.includes('staff_ka'))
})

test('磨合：首次监督（last_participation=null）也按切换判定，但必须有实际产出', () => {
  const first = supervisorState('work_02')
  first.staff.find((member) => member.id === 'staff_dir').last_participation = null
  const firstRun = runStaff(first, ['staff_dir'], 'work_02')
  const stayedRun = runStaff(supervisorState('work_02'), ['staff_dir'], 'work_02')
  const independentRun = runStaff(supervisorState('work_02', 'independent_director'), ['staff_dir'], 'work_02')
  assert.ok(firstRun.produced.staff_dir < stayedRun.produced.staff_dir)
  assert.equal(stayedRun.produced.staff_dir, independentRun.produced.staff_dir)
})

test('磨合 HO-10/HO-11：已完成项与产能被占满都不新增参与者或损失', () => {
  const complete = handoverState({ workDone: 100, workTotal: 100, contributors: ['staff_dir'] })
  const completeRun = runStaff(complete.state, ['staff_ka'])
  assert.equal(completeRun.produced.staff_ka, 0)
  assert.deepEqual(findItem(completeRun.state, 'work_01', complete.itemId).contributors, ['staff_dir'])

  const crowded = handoverState({ workDone: 40, contributors: ['staff_dir'] })
  const common = findItem(crowded.state, 'work_01', 'common.series_comp')
  common.work_total = 10000
  common.work_done = 0
  common.contributors = []
  const crowdedRun = runStaff(crowded.state, ['staff_ka'])
  assert.ok(crowdedRun.produced.staff_ka > 0)
  assert.equal(findItem(crowdedRun.state, 'work_01', crowded.itemId).work_done, 40)
  assert.deepEqual(findItem(crowdedRun.state, 'work_01', crowded.itemId).contributors, ['staff_dir'])
})

test('磨合 HO-12：切换监督当周无产出时，不惩罚团队其他成员', () => {
  const build = (lastWorkId) => {
    let state = setupTiny()
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_02', duration_weeks: 26 }).state
    state.company.week = 1
    for (const item of allItems(state, 'work_02')) {
      if (item.id !== 'work_02.ep01.script') item.work_done = item.work_total
    }
    const item = findItem(state, 'work_02', 'ep01.script')
    item.work_total = 200
    item.work_done = 130
    item.contributors = ['staff_dir']
    state.staff.push({
      ...JSON.parse(JSON.stringify(state.staff.find((member) => member.id === 'staff_dir'))),
      id: 'staff_z_dir', name: '末位监督', last_participation: { work_id: lastWorkId, item_id: `${lastWorkId}.ep01.script`, week: 0 }
    })
    return state
  }
  const switched = runStaff(build('work_01'), ['staff_ka', 'staff_z_dir'], 'work_02')
  const stayed = runStaff(build('work_02'), ['staff_ka', 'staff_z_dir'], 'work_02')
  assert.equal(switched.produced.staff_z_dir, 0)
  assert.equal(stayed.produced.staff_z_dir, 0)
  assert.equal(switched.produced.staff_ka, stayed.produced.staff_ka)
  const item = findItem(switched.state, 'work_02', 'ep01.script')
  assert.ok(item.contributors.includes('staff_ka'))
  assert.equal(item.contributors.includes('staff_z_dir'), false)
})

test('磨合边界：1 点原始产出经 75% 接手系数后仍保留 1 点并记录参与者', () => {
  const { state, itemId } = handoverState({ workDone: 99, workTotal: 100, contributors: ['staff_dir'] })
  const result = runStaff(state, ['staff_ka'])
  assert.equal(result.produced.staff_ka, 1)
  assert.equal(findItem(result.state, 'work_01', itemId).work_done, 100)
  assert.ok(findItem(result.state, 'work_01', itemId).contributors.includes('staff_ka'))
})

test('事件：目标选择与正工作量分配按 item id 排序，不依赖存储顺序', () => {
  const blueprint = {
    ...JSON.parse(JSON.stringify(tiny)),
    episode_count: 2,
    episode: [
      { key: 'concept', stage: 'content_design', name: '概念', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [] },
      ...tiny.episode
    ]
  }
  const catalog = JSON.parse(JSON.stringify(eventCatalog))
  catalog.events[0].options[0].effects = [{ scope: 'instant', target: 'work_done', value: 250 }]
  const build = (reverseItems) => {
    let state = ok('initialize', { seed: 23 }).state
    state = ok('instantiate_work', { state, blueprint, work_id: 'work_01', duration_weeks: 26 }).state
    if (reverseItems) {
      for (const episode of state.works[0].episodes) {
        for (const stage of episode.stages) stage.items.reverse()
      }
    }
    return ok('advance_week', { state, event_catalog: catalog }).state
  }
  const straight = build(false)
  const reordered = build(true)
  assert.equal(reordered.events.pending[0].episode_id, 'ep01')
  assert.equal(reordered.events.pending[0].stage_key, 'content_design')
  assert.equal(reordered.events.pending[0].item_id, 'work_01.ep01.concept')
  assert.deepEqual(reordered.events.pending[0], straight.events.pending[0])
  assert.equal(ok('hash_state', { state: straight }).hash, ok('hash_state', { state: reordered }).hash)

  const resolve = (state) => ok('resolve_event', {
    state, event_id: state.events.pending[0].instance_id, option_id: 'accept', catalog
  }).state
  const resolvedStraight = resolve(straight)
  const resolvedReordered = resolve(reordered)
  assert.deepEqual(
    ['common.series_comp', 'ep01.concept', 'ep01.script', 'ep02.concept', 'ep02.script']
      .map((itemId) => {
        const item = findItem(resolvedReordered, 'work_01', itemId)
        return [item.id, item.work_done]
      }),
    [
      ['work_01.common.series_comp', 0],
      ['work_01.ep01.concept', 100],
      ['work_01.ep01.script', 100],
      ['work_01.ep02.concept', 50],
      ['work_01.ep02.script', 0]
    ]
  )
  assert.equal(ok('hash_state', { state: resolvedStraight }).hash, ok('hash_state', { state: resolvedReordered }).hash)
})

test('规范哈希：M2 集合数组任意重排后保持一致，有序日志保持原义', () => {
  const blueprint = {
    ...JSON.parse(JSON.stringify(m2Blueprint)),
    common: [
      ...m2Blueprint.common,
      { key: 'world_setting', name: '世界设定', ability: 'planning', work_total: 80, deliver_at: 1000, deps: [] }
    ],
    episode: [
      { key: 'concept', stage: 'content_design', name: '概念', ability: 'planning', work_total: 60, deliver_at: 1000, deps: [] },
      ...m2Blueprint.episode
    ]
  }
  let state = startBase()
  const firstOffer = state.market.slots[0]
  firstOffer.channels_baseline = ['streaming', 'bd_dvd']
  firstOffer.allowed_modes = ['committee', 'contract']
  state.market.slots.push({
    ...JSON.parse(JSON.stringify(firstOffer)), id: 'offer_second', name: 'Second offer'
  })
  state = ok('start_work', {
    state, offer_id: 'offer_tv_standard', mode: 'committee', percent: 10, committee_partner_ids: [], blueprint
  }).state
  state = ok('start_work', {
    state, offer_id: 'offer_second', mode: 'committee', percent: 10, committee_partner_ids: [], blueprint
  }).state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_02' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_anim', work_id: 'work_01' }).state
  state = ok('advance_week', { state, event_catalog: eventCatalog }).state
  assert.equal(state.events.pending.length, 2)

  for (const [workId, extraStaff] of [['work_01', 'staff_anim'], ['work_02', 'staff_dir']]) {
    state = completeWork(state, workId, workId === 'work_01' ? 'staff_dir' : 'staff_ka')
    for (const item of allItems(state, workId)) {
      if (!item.contributors.includes(extraStaff)) item.contributors.push(extraStaff)
    }
  }
  for (const workId of ['work_01', 'work_02']) {
    state = ok('deliver_work', {
      state, work_id: workId,
      settlement: { commercial_share_received: 200000, success_reward_received: 50000, penalty: 10000 }
    }).state
  }
  state.company.facilities = ['facility_z', 'facility_a']
  state.staff[0].traits = ['trait_z', 'trait_a']
  state.market.slots = [
    { ...JSON.parse(JSON.stringify(firstOffer)), id: 'offer_hash_a', name: 'Hash A' },
    { ...JSON.parse(JSON.stringify(firstOffer)), id: 'offer_hash_z', name: 'Hash Z' }
  ]
  for (const [index, event] of state.events.pending.entries()) {
    event.option_ids.reverse()
    state.events.per_work[event.work_id].major_seen.push(index === 0 ? 'zzz_major' : 'yyy_major')
  }
  ok('save_game', { state })

  const reordered = JSON.parse(JSON.stringify(state))
  reordered.company.facilities.reverse()
  reordered.staff.reverse()
  for (const member of reordered.staff) {
    member.traits.reverse()
    member.works_history.reverse()
  }
  reordered.works.reverse()
  for (const work of reordered.works) {
    work.channels.reverse()
    work.offer.channels_baseline.reverse()
    work.offer.allowed_modes.reverse()
    work.common.items.reverse()
    for (const item of work.common.items) {
      item.deps.reverse()
      item.contributors.reverse()
    }
    for (const episode of work.episodes) {
      for (const stage of episode.stages) {
        stage.items.reverse()
        for (const item of stage.items) {
          item.deps.reverse()
          item.contributors.reverse()
        }
      }
    }
    work.delivery.staff_snapshot.reverse()
    work.delivery.commercial_entries.reverse()
  }
  reordered.finance.entries.reverse()
  reordered.market.slots.reverse()
  for (const offer of reordered.market.slots) {
    offer.channels_baseline.reverse()
    offer.allowed_modes.reverse()
  }
  reordered.committees.reverse()
  reordered.events.pending.reverse()
  for (const event of reordered.events.pending) event.option_ids.reverse()
  for (const perWork of Object.values(reordered.events.per_work)) perWork.major_seen.reverse()
  reordered.archive.works.reverse()
  for (const record of reordered.archive.works) record.staff_snapshot.reverse()
  ok('save_game', { state: reordered })
  assert.equal(ok('hash_state', { state }).hash, ok('hash_state', { state: reordered }).hash)
})

test('命令边界：非法状态在修复、查重或阶段守卫之前统一拒绝', () => {
  let state = setupTiny()
  state.finance.balance += 1
  expectUnchanged('instantiate_work', { state, blueprint: tiny, work_id: 'work_01' }, 'INVALID_STATE')

  state = setupTiny()
  state.works[0].plan.overtime = 'sometimes'
  expectUnchanged('set_work_plan', { state, work_id: 'work_01', plan: { overtime: 'off' } }, 'INVALID_STATE')

  state = setupStarted().state
  state = completeWork(state, 'work_01')
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  state.staff[0].assignment_work_id = 'work_01'
  expectUnchanged('assign_staff', { state, staff_id: 'staff_dir', work_id: null }, 'INVALID_STATE')

  const pending = withPending()
  pending.state.finance.balance += 1
  expectUnchanged('advance_week', { state: pending.state }, 'INVALID_STATE')
  expectUnchanged('resolve_event', {
    state: pending.state, event_id: pending.instanceId, option_id: 'skip', catalog: pending.catalog
  }, 'INVALID_STATE')

  state = setupStarted().state
  state.company.status = 'closing'
  expectUnchanged('start_work', {
    state, offer_id: 'offer_tv_standard', mode: 'contract', percent: 0,
    committee_partner_ids: [], blueprint: m2Blueprint
  }, 'INVALID_STATE')

  state = setupStarted().state
  state.company.week = 1
  state.works[0].deadline_week = 1
  state = completeWork(state, 'work_01')
  expectUnchanged('deliver_work', { state, work_id: 'work_01' }, 'INVALID_STATE')

  state = setupStarted('committee', 10).state
  state.committees[0].status = 'closed'
  expectUnchanged('abort_work', { state, work_id: 'work_01' }, 'INVALID_STATE')

  state = setupTiny()
  state.finance.balance += 1
  expectUnchanged('save_game', { state }, 'INVALID_STATE')
})

test('set_work_plan：plan 与 target 严格拒绝未知字段、缺字段和错误类型', () => {
  const state = setupStarted().state
  const before = ok('hash_state', { state }).hash
  const badPlans = [
    null, [], 'high', 1,
    { invented: true },
    { target: [] },
    { target: 'ep01' },
    { target: { kind: 'episode' } },
    { target: { id: 'ep01' } },
    { target: { kind: 1, id: 'ep01' } },
    { target: { kind: 'episode', id: 1 } },
    { target: { kind: 'episode', id: 'ep01', extra: true } }
  ]
  for (const plan of badPlans) {
    const result = call('set_work_plan', { state, work_id: 'work_01', plan })
    assert.equal(result.error?.code, 'INVALID_INPUT', JSON.stringify(plan))
    assert.equal(ok('hash_state', { state }).hash, before)
  }
  assert.equal(call('set_work_plan', { state, work_id: 'work_01' }).error?.code, 'INVALID_INPUT')

  let planned = ok('set_work_plan', {
    state, work_id: 'work_01', plan: { target: { kind: 'episode', id: 'ep01' } }
  }).state
  planned = ok('set_work_plan', { state: planned, work_id: 'work_01', plan: { focus: 'schedule' } }).state
  assert.deepEqual(planned.works[0].plan.target, { kind: 'episode', id: 'ep01' })
  planned = ok('set_work_plan', { state: planned, work_id: 'work_01', plan: { target: null } }).state
  assert.equal(planned.works[0].plan.target, null)
})

test('M2 start_work：承制立项消耗企划、快照offer并只记一笔制作费', () => {
  const { state, workId } = setupStarted()
  assert.equal(workId, 'work_01')
  assert.equal(state.market.slots.length, 0)
  assert.equal(state.works.length, 1)
  assert.equal(state.works[0].offer.id, 'offer_tv_standard')
  assert.equal(state.works[0].mode, 'contract')
  assert.equal(state.finance.balance, 7000000)
  assert.equal(state.finance.entries.length, 1)
  assert.deepEqual(state.finance.entries[0], {
    id: 'w0.contract.work_01', week: 0, work_id: 'work_01', category: 'contract_received',
    amount: 5000000, counterparty: null, memo: '项目开始制作费'
  })
  assert.ok(state.events.per_work.work_01)
  const again = call('start_work', {
    state, offer_id: 'offer_tv_standard', mode: 'contract', percent: 0, committee_partner_ids: [], blueprint: m2Blueprint
  })
  assert.equal(again.error.code, 'NOT_FOUND')
})

test('M2 start_work：委员会本金与制作费分账，比例落库', () => {
  const { state } = setupStarted('committee', 20)
  assert.equal(state.works[0].mode, 'committee')
  assert.equal(state.works[0].investment.percent, 20)
  assert.equal(state.works[0].investment.principal, 2000000)
  assert.equal(state.finance.balance, 5000000)
  assert.deepEqual(state.finance.entries.map((entry) => [entry.category, entry.amount]), [
    ['investment_paid', -2000000], ['contract_received', 5000000]
  ])
  assert.equal(state.committees.length, 1)
  assert.equal(state.committees[0].investment_percent, 20)
})

test('M2 委员会：交付或中止后关闭，且状态必须与项目终态一致', () => {
  for (const action of ['deliver_work', 'abort_work']) {
    let state = setupStarted('committee', 20).state
    assert.equal(state.committees[0].status, 'active')
    if (action === 'deliver_work') state = completeWork(state, 'work_01')
    state = ok(action, { state, work_id: 'work_01' }).state
    assert.equal(state.committees[0].status, 'closed')
    assert.notEqual(state.works[0].status, 'producing')
  }

  const producing = setupStarted('committee', 20).state
  producing.committees[0].status = 'closed'
  assert.equal(call('save_game', { state: producing }).error.code, 'INVALID_STATE')

  const started = setupStarted('committee', 20).state
  const delivered = ok('deliver_work', { state: completeWork(started, 'work_01'), work_id: 'work_01' }).state
  delivered.committees[0].status = 'active'
  assert.equal(call('save_game', { state: delivered }).error.code, 'INVALID_STATE')
})

test('Finance：类别正负号、恒等式与项目引用被严格校验', () => {
  const { state } = setupStarted()
  const badSign = JSON.parse(JSON.stringify(state))
  badSign.finance.entries[0].amount = -5000000
  badSign.finance.balance = -3000000
  badSign.finance.solvency.state = 'crisis'
  assert.equal(call('advance_week', { state: badSign }).error.code, 'INVALID_STATE')

  const badCategory = JSON.parse(JSON.stringify(state))
  badCategory.finance.entries[0].category = 'mystery_income'
  assert.equal(call('advance_week', { state: badCategory }).error.code, 'INVALID_STATE')

  const badWork = JSON.parse(JSON.stringify(state))
  badWork.finance.entries[0].work_id = 'missing'
  assert.equal(call('advance_week', { state: badWork }).error.code, 'INVALID_STATE')

  const duplicate = JSON.parse(JSON.stringify(state))
  duplicate.finance.entries.push({ ...duplicate.finance.entries[0] })
  duplicate.finance.balance += duplicate.finance.entries[0].amount
  assert.equal(call('advance_week', { state: duplicate }).error.code, 'INVALID_STATE')
})

test('Finance 与委员会：业务来源、投资恒等式与 M2 空占位被严格校验', () => {
  const { state, workId } = setupStarted()
  const forged = JSON.parse(JSON.stringify(state))
  forged.finance.entries.push({
    id: 'forged_income', week: 0, work_id: workId, category: 'commercial_share_received',
    amount: 100, counterparty: null, memo: '伪造分账'
  })
  forged.finance.balance += 100
  assert.equal(call('save_game', { state: forged }).error.code, 'INVALID_STATE')

  const duplicate = JSON.parse(JSON.stringify(state))
  duplicate.finance.entries.push({ ...duplicate.finance.entries[0], id: 'second_contract' })
  duplicate.finance.balance += duplicate.finance.entries[0].amount
  assert.equal(call('save_game', { state: duplicate }).error.code, 'INVALID_STATE')

  const missing = JSON.parse(JSON.stringify(state))
  missing.finance.entries = []
  missing.finance.balance = missing.finance.opening_funds
  assert.equal(call('save_game', { state: missing }).error.code, 'INVALID_STATE')

  const reserved = JSON.parse(JSON.stringify(state))
  reserved.finance.entries.push({
    id: 'reserved_financing', week: 0, work_id: null, category: 'financing_in',
    amount: 1, counterparty: null, memo: '未实现融资'
  })
  reserved.finance.balance += 1
  reserved.finance.loans = [{ principal: 1 }]
  assert.equal(call('save_game', { state: reserved }).error.code, 'INVALID_STATE')

  const request = {
    state: startBase(), offer_id: 'offer_tv_standard', mode: 'committee', percent: 11,
    committee_partner_ids: [], blueprint: JSON.parse(JSON.stringify(m2Blueprint))
  }
  assert.equal(call('start_work', request).error.code, 'INVALID_INPUT')
  request.percent = 20
  request.committee_partner_ids = ['ghost_partner']
  assert.equal(call('start_work', request).error.code, 'NOT_IMPLEMENTED')

  const committee = setupStarted('committee', 20).state
  for (const mutate of [
    (value) => { value.works[0].investment.percent = 11 },
    (value) => { value.works[0].investment.total += 1 },
    (value) => { value.works[0].investment.principal += 1 },
    (value) => { value.committees[0].investment_percent = 30 },
    (value) => { value.committees[0].investment_paid += 1 },
    (value) => { value.committees[0].production_fee += 1 },
    (value) => { value.committees[0].partner_ids = ['ghost_partner'] },
    (value) => {
      value.finance.entries[0].amount = -1999999
      value.finance.balance += 1
    }
  ]) {
    const broken = JSON.parse(JSON.stringify(committee))
    mutate(broken)
    assert.equal(call('save_game', { state: broken }).error.code, 'INVALID_STATE')
  }
})

test('事件：不同项目同周各触发一个，pending 数组保留且任意顺序解决', () => {
  let state = setupStarted().state
  state = ok('instantiate_work', { state, blueprint: m2Blueprint, work_id: 'work_02', duration_weeks: 26 }).state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  const advanced = ok('advance_week', { state, event_catalog: eventCatalog })
  state = advanced.state
  assert.equal(state.company.week, 1)
  assert.equal(state.events.pending.length, 2)
  assert.deepEqual(new Set(state.events.pending.map((event) => event.work_id)), new Set(['work_01', 'work_02']))
  assert.equal(new Set(state.events.pending.map((event) => event.triggered_week)).size, 1)
  assert.equal(call('advance_week', { state }).error.code, 'INVALID_PHASE')

  const second = state.events.pending[1]
  const first = state.events.pending[0]
  state = ok('resolve_event', { state, event_id: second.instance_id, option_id: 'accept', catalog: eventCatalog }).state
  assert.equal(state.events.pending.length, 1)
  assert.equal(state.events.pending[0].instance_id, first.instance_id)
  state = ok('resolve_event', { state, event_id: first.instance_id, option_id: 'skip', catalog: eventCatalog }).state
  assert.equal(state.events.pending.length, 0)
  const eventCost = state.finance.entries.find((entry) => entry.category === 'events')
  assert.equal(eventCost.amount, -1000)
  assert.equal(eventCost.work_id, second.work_id)
  assert.equal(state.staff.find((member) => member.id === 'staff_ka').morale, 81, '未分配项目仍触发事件，但即时人员效果不作用于其他项目')
  ok('advance_week', { state })
})

test('事件：正负 funds 效果不擅自入账，返回 NOT_IMPLEMENTED 且状态不变', () => {
  for (const value of [450000, -450000]) {
    const catalog = JSON.parse(JSON.stringify(eventCatalog))
    catalog.events[0].options[0].effects = [{ scope: 'instant', target: 'funds', value }]
    let state = setupStarted().state
    state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
    state = ok('advance_week', { state, event_catalog: catalog }).state
    const before = ok('hash_state', { state }).hash
    const result = call('resolve_event', { state, event_id: state.events.pending[0].instance_id, option_id: 'accept', catalog })
    assert.equal(result.error.code, 'NOT_IMPLEMENTED')
    assert.equal(ok('hash_state', { state }).hash, before)
  }
})

test('事件：阶段质量效果在阶段完成时只应用一次', () => {
  const catalog = JSON.parse(JSON.stringify(eventCatalog))
  catalog.events[0].options[0].effects = [
    { scope: 'instant', target: 'fatigue', value: 6 },
    { scope: 'stage', target: 'quality', value: 4 },
    { scope: 'stage', target: 'quality', value: -2 }
  ]
  let state = setupStarted().state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  state = ok('advance_week', { state, event_catalog: catalog }).state
  state = ok('resolve_event', { state, event_id: state.events.pending[0].instance_id, option_id: 'accept', catalog }).state
  assert.equal(state.staff.find((member) => member.id === 'staff_dir').fatigue, 14)
  assert.equal(state.events.per_work.work_01.effects.length, 2)
  assert.equal(new Set(state.events.per_work.work_01.effects.map((effect) => effect.id)).size, 2)
  assert.ok(state.events.per_work.work_01.effects.every((effect) => effect.applied === false))
  const work = state.works[0]
  for (const item of work.episodes[0].stages[0].items) {
    item.work_done = item.work_total
    item.contributors = ['staff_dir']
    for (const dim of Object.keys(item.quality)) item.quality[dim] = 10
  }
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: null }).state
  state = ok('advance_week', { state }).state
  assert.ok(state.events.per_work.work_01.effects.every((effect) => effect.applied === true))
  for (const item of state.works[0].episodes[0].stages[0].items) {
    assert.ok(Object.values(item.quality).every((value) => value === 12))
  }
  state = ok('advance_week', { state }).state
  for (const item of state.works[0].episodes[0].stages[0].items) {
    assert.ok(Object.values(item.quality).every((value) => value === 12))
  }
})

test('v4 save/load：完整 round-trip、规则提示与未来随机序列一致', () => {
  let state = setupStarted().state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  state = ok('advance_week', { state, event_catalog: eventCatalog }).state
  const saved = ok('save_game', { state, saved_at: '2026-11-25T12:34:56Z' }).save
  assert.equal(saved.version, 4)
  assert.equal(saved.state.events.pending.length, 1)
  const loaded = ok('load_game', { save: saved })
  assert.equal(loaded.rules_mismatch, false)
  assert.equal(ok('hash_state', { state }).hash, ok('hash_state', { state: loaded.state }).hash)

  const eventId = loaded.state.events.pending[0].instance_id
  const originalNext = ok('resolve_event', { state, event_id: eventId, option_id: 'accept', catalog: eventCatalog }).state
  const loadedNext = ok('resolve_event', { state: loaded.state, event_id: eventId, option_id: 'accept', catalog: eventCatalog }).state
  const originalAdvanced = ok('advance_week', { state: originalNext }).state
  const loadedAdvanced = ok('advance_week', { state: loadedNext }).state
  assert.equal(ok('hash_state', { state: originalAdvanced }).hash, ok('hash_state', { state: loadedAdvanced }).hash)

  const mismatch = JSON.parse(JSON.stringify(saved))
  mismatch.rules_version = 'future-rules'
  assert.equal(ok('load_game', { save: mismatch }).rules_mismatch, true)
})

test('v4 save/load：旧版、未来版、缺字段与派生字段均明确拒绝', () => {
  const { state } = setupStarted()
  const saved = ok('save_game', { state }).save
  for (const version of [1, 2, 3, 5]) {
    const changed = JSON.parse(JSON.stringify(saved))
    changed.version = version
    assert.equal(call('load_game', { save: changed }).error.code, 'SAVE_VERSION_UNSUPPORTED')
  }
  const missing = JSON.parse(JSON.stringify(saved))
  delete missing.state.staff[0].weekly_salary
  assert.equal(call('load_game', { save: missing }).error.code, 'SAVE_CORRUPT')
  const derived = JSON.parse(JSON.stringify(saved))
  derived.state.preview = { next_week: true }
  assert.equal(call('load_game', { save: derived }).error.code, 'SAVE_CORRUPT')
  const unknown = JSON.parse(JSON.stringify(saved))
  unknown.state.works[0].risk = 'high'
  assert.equal(call('load_game', { save: unknown }).error.code, 'SAVE_CORRUPT')
})

test('M2 deliver_work：门槛、财务结算、Archive、人员历史与临时员工清理', () => {
  let { state, workId } = setupStarted()
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: workId }).state
  assert.equal(call('deliver_work', { state, work_id: workId }).error.code, 'GATE_UNMET')
  state.staff.push({
    ...JSON.parse(JSON.stringify(state.staff[0])), id: 'staff_temp', name: '临时', employment: 'temporary',
    weekly_salary: 50000, project_fee: 10000, assignment_work_id: workId,
    temporary_contract: { work_id: workId, started_week: 0 }
  })
  state = completeWork(state, workId)
  findItem(state, workId, 'common.series_comp').contributors.push('staff_temp')
  const delivered = ok('deliver_work', {
    state, work_id: workId,
    settlement: { commercial_share_received: 200000, success_reward_received: 50000, penalty: 10000 }
  })
  state = delivered.state
  assert.equal(state.works[0].status, 'delivered')
  assert.equal(state.archive.works.length, 1)
  assert.equal(delivered.archive_id, 'archive.work_01')
  assert.equal(state.archive.works[0].commercial_income, 240000)
  assert.equal(state.staff.some((member) => member.id === 'staff_temp'), false)
  assert.ok(state.staff.every((member) => member.assignment_work_id === null))
  assert.ok(state.staff.find((member) => member.id === 'staff_dir').works_history.some((entry) => entry.work_id === workId))
  assert.ok(state.archive.works[0].staff_snapshot.some((entry) => entry.staff_id === 'staff_temp'))
  assert.ok(findItem(state, workId, 'common.series_comp').contributors.includes('staff_temp'))
  assert.deepEqual(state.finance.entries.filter((entry) => entry.week === 0 && entry.work_id === workId).map((entry) => entry.category), [
    'contract_received', 'commercial_share_received', 'success_reward_received', 'penalty'
  ])
  assert.equal(state.finance.balance, state.finance.opening_funds + state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0))
})

test('M2 abort_work：解绑人员并移除临时员工，已完成工作保留', () => {
  let { state, workId } = setupStarted()
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: workId }).state
  state.staff.push({
    ...JSON.parse(JSON.stringify(state.staff[0])), id: 'staff_temp', name: '临时', employment: 'temporary',
    weekly_salary: 50000, project_fee: 10000, assignment_work_id: workId,
    temporary_contract: { work_id: workId, started_week: 0 }
  })
  const common = state.works[0].common.items[0]
  common.work_done = 10
  common.contributors = ['staff_dir', 'staff_temp']
  state = ok('abort_work', { state, work_id: workId }).state
  assert.equal(state.works[0].status, 'aborted')
  assert.equal(state.works[0].common.items[0].work_done, 10)
  assert.deepEqual(state.works[0].common.items[0].contributors, ['staff_dir', 'staff_temp'])
  assert.equal(state.staff.some((member) => member.id === 'staff_temp'), false)
  assert.ok(state.staff.every((member) => member.assignment_work_id === null))
})

test('M2 截止周强制交付：未达门槛记延期，达标记按时，且只结算一次', () => {
  for (const complete of [false, true]) {
    let { state, workId } = setupStarted()
    state.works[0].deadline_week = 1
    if (complete) {
      state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: workId }).state
      state = completeWork(state, workId)
    }
    const advanced = ok('advance_week', { state })
    state = advanced.state
    assert.equal(state.company.week, 1)
    assert.equal(state.works[0].status, 'delivered')
    assert.equal(state.works[0].delivery.forced, true)
    assert.equal(state.works[0].delivery.on_time, complete)
    assert.deepEqual(advanced.report.forced_deliveries, [{ work_id: workId, archive_id: `archive.${workId}`, on_time: complete }])
    assert.equal(state.archive.works.length, 1)
    const repeated = call('deliver_work', { state, work_id: workId })
    assert.equal(repeated.error.code, 'INVALID_PHASE', JSON.stringify(repeated.error))
    const next = ok('advance_week', { state })
    assert.equal(next.state.archive.works.length, 1)
    assert.equal(next.report.works.length, 0)
  }
})

test('事件运行时加载：支持进度/士气指标，拒绝非法指标与选项类型', () => {
  for (const metric of ['stage_progress_permille', 'morale']) {
    const catalog = JSON.parse(JSON.stringify(eventCatalog))
    catalog.events[0].trigger = { metric, op: '<=', threshold: metric === 'morale' ? 100 : 1000 }
    let state = setupStarted().state
    state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
    state = ok('advance_week', { state, event_catalog: catalog }).state
    assert.equal(state.events.pending.length, 1)
    assert.equal(state.events.pending[0].event_id, 'test_budget_event')
  }

  let state = setupStarted().state
  const before = ok('hash_state', { state }).hash
  const badMetric = JSON.parse(JSON.stringify(eventCatalog))
  badMetric.events[0].trigger.metric = 'unknown'
  assert.equal(call('advance_week', { state, event_catalog: badMetric }).error.code, 'INVALID_INPUT')
  const badKind = JSON.parse(JSON.stringify(eventCatalog))
  badKind.events[0].options[0].kind = 'invented'
  assert.equal(call('advance_week', { state, event_catalog: badKind }).error.code, 'INVALID_INPUT')
  const badEscalation = JSON.parse(JSON.stringify(eventCatalog))
  badEscalation.events[0].expires_weeks = 2
  badEscalation.events[0].escalation = {
    description: '升级', effects: [{ scope: 'instant', target: 'morale', value: -1, extra: true }]
  }
  assert.equal(call('advance_week', { state, event_catalog: badEscalation }).error.code, 'INVALID_INPUT')
  const ignoredEscalation = JSON.parse(JSON.stringify(eventCatalog))
  ignoredEscalation.events[0].escalation = { description: '忽略', effects: [{ scope: 'instant', target: 'morale', value: -1 }] }
  assert.equal(call('advance_week', { state, event_catalog: ignoredEscalation }).error.code, 'INVALID_INPUT')
  assert.equal(ok('hash_state', { state }).hash, before)
})

test('交付与中止不静默丢弃待处理事件，之后仍可按 instance_id 解决', () => {
  for (const action of ['deliver_work', 'abort_work']) {
    let state = setupStarted().state
    state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
    state = ok('advance_week', { state, event_catalog: eventCatalog }).state
    const instanceId = state.events.pending[0].instance_id
    if (action === 'deliver_work') {
      state = completeWork(state, 'work_01')
      state = ok('deliver_work', { state, work_id: 'work_01' }).state
    } else {
      state = ok('abort_work', { state, work_id: 'work_01' }).state
    }
    assert.equal(state.events.pending[0].instance_id, instanceId)
    state = ok('resolve_event', { state, event_id: instanceId, option_id: 'skip', catalog: eventCatalog }).state
    assert.equal(state.events.pending.length, 0)
  }
})

test('M2 结算输入拒绝未知字段且不改变状态', () => {
  let { state, workId } = setupStarted()
  state = completeWork(state, workId)
  const before = ok('hash_state', { state }).hash
  const result = call('deliver_work', { state, work_id: workId, settlement: { commercial_share_received: 1, invented: 2 } })
  assert.equal(result.error.code, 'INVALID_INPUT')
  assert.equal(ok('hash_state', { state }).hash, before)
})

test('M2 严格输入：#38 必填员工字段与 overtime 枚举不静默修复', () => {
  const { state } = setupStarted()
  for (const field of ['weekly_salary', 'project_fee', 'fatigue', 'morale']) {
    const broken = JSON.parse(JSON.stringify(state))
    delete broken.staff[0][field]
    assert.equal(call('assign_staff', { state: broken, staff_id: 'staff_dir', work_id: null }).error.code, 'INVALID_INPUT')
  }
  assert.equal(call('set_plan', { state, work_id: 'work_01', plan: { overtime: true } }).error.code, 'INVALID_INPUT')
  const planned = ok('set_plan', { state, work_id: 'work_01', plan: { overtime: 'conditional' } }).state
  assert.equal(planned.works[0].plan.overtime, 'conditional')
})

function expectUnchanged(name, payload, code) {
  const before = ok('hash_state', { state: payload.state }).hash
  const result = call(name, payload)
  assert.equal(result.error?.code, code, JSON.stringify(result.error))
  assert.equal(ok('hash_state', { state: payload.state }).hash, before)
}

function withPending(catalog = eventCatalog) {
  let state = setupStarted().state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  state = ok('advance_week', { state, event_catalog: catalog }).state
  assert.equal(state.events.pending.length, 1)
  return { state, catalog, instanceId: state.events.pending[0].instance_id }
}

function randomCard(id, weight = 50) {
  return {
    ...JSON.parse(JSON.stringify(eventCatalog.events[0])),
    id, name: id, once_per_project: false, cooldown_weeks: 0, random_weight: weight,
    trigger: { metric: 'stage_progress_permille', op: '<=', threshold: 1000 },
    options: [{ id: 'skip', kind: 'abandon', label: '放弃', cost: 0, effects: [] }]
  }
}

test('start_work：蓝图身份、集数、结构、比例与本金边界全部拒绝且不消耗企划', () => {
  const request = () => ({
    state: startBase(), offer_id: 'offer_tv_standard', mode: 'contract', percent: 0,
    committee_partner_ids: [], blueprint: JSON.parse(JSON.stringify(m2Blueprint))
  })
  for (const mutate of [
    (blueprint) => { delete blueprint.id },
    (blueprint) => { blueprint.id = 'other_blueprint' },
    (blueprint) => { blueprint.episode_count = 2 },
    (blueprint) => { blueprint.unknown = true },
    (blueprint) => { blueprint.episode[0].deps = ['script'] },
    (blueprint) => { blueprint.episode[0].deps = ['master'] },
    (blueprint) => { blueprint.episode[0].is_gate = true },
    (blueprint) => { blueprint.work_unit = 'staff_week' }
  ]) {
    const payload = request()
    mutate(payload.blueprint)
    expectUnchanged('start_work', payload, 'INVALID_INPUT')
    assert.equal(payload.state.market.slots.length, 1)
  }
  const mismatch = request()
  mismatch.state.market.slots[0].episode_count = 2
  expectUnchanged('start_work', mismatch, 'INVALID_INPUT')

  const poor = request()
  poor.mode = 'committee'
  poor.percent = 100
  poor.state.finance.opening_funds = 1000000
  poor.state.finance.balance = 1000000
  expectUnchanged('start_work', poor, 'INSUFFICIENT_FUNDS')
})

test('蓝图工作量缩放使用千分比与四舍五入，不修改原始内容', () => {
  const blueprint = JSON.parse(JSON.stringify(tiny))
  blueprint.common[0].work_total = 1
  const created = ok('instantiate_work', {
    state: ok('initialize', { seed: 8 }).state, blueprint, work_id: 'work_scale', workload_scale_permille: 1501
  })
  assert.equal(findItem(created.state, 'work_scale', 'common.series_comp').work_total, 2)
  assert.equal(blueprint.common[0].work_total, 1)
})

test('蓝图静态校验：TV 12–13 集越界仅警告，非 sound_delivery 门槛直接失败', () => {
  const standard = JSON.parse(readFileSync('docs/blueprints/tv_standard.blueprint.json', 'utf8'))
  const directory = mkdtempSync(join(tmpdir(), 'apc-blueprint-'))
  const validator = join(process.cwd(), 'scripts', 'validate-blueprint.mjs')
  try {
    const shortTv = JSON.parse(JSON.stringify(standard))
    shortTv.episode_count = 11
    const shortPath = join(directory, 'short_tv.json')
    writeFileSync(shortPath, JSON.stringify(shortTv))
    const shortResult = spawnSync(process.execPath, [validator, shortPath], { encoding: 'utf8' })
    assert.equal(shortResult.status, 0, shortResult.stderr)
    assert.match(shortResult.stderr, /tv 的常见集数是 12–13/)

    const badGate = JSON.parse(JSON.stringify(standard))
    badGate.episode[0].is_gate = true
    const badGatePath = join(directory, 'bad_gate.json')
    writeFileSync(badGatePath, JSON.stringify(badGate))
    const badGateResult = spawnSync(process.execPath, [validator, badGatePath], { encoding: 'utf8' })
    assert.equal(badGateResult.status, 1)
    assert.match(badGateResult.stderr, /门槛项只能出现在 sound_delivery/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('Finance：归属核心工资归项目、闲置工资归公司，制作成本包含归属工资', () => {
  let { state, workId } = setupStarted()
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: workId }).state
  state = ok('advance_week', { state }).state
  const salaries = state.finance.entries.filter((entry) => entry.category === 'salary')
  assert.equal(salaries.find((entry) => entry.memo === 'staff_dir').work_id, workId)
  assert.ok(salaries.filter((entry) => entry.memo !== 'staff_dir').every((entry) => entry.work_id === null))
  state = completeWork(state, workId)
  state = ok('deliver_work', { state, work_id: workId }).state
  assert.equal(state.works[0].delivery.production_cost, 100000)
})

test('Finance：多项目费用不足时整周原子失败，账本溢出被拒绝', () => {
  let state = setupTiny(31)
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_02', duration_weeks: 26 }).state
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  state.finance.opening_funds = 100000
  state.finance.balance = 100000
  expectUnchanged('advance_week', { state }, 'INSUFFICIENT_FUNDS')

  const overflow = setupStarted().state
  overflow.finance.entries.push({
    id: 'overflow', week: 0, work_id: null, category: 'financing_in', amount: Number.MAX_SAFE_INTEGER,
    counterparty: null, memo: '溢出测试'
  })
  overflow.finance.balance = Number.MAX_SAFE_INTEGER + 7000000
  assert.equal(call('save_game', { state: overflow }).error.code, 'INVALID_STATE')
})

test('事件：非法选项、重复解决与现金不足均不改变状态', () => {
  const pending = withPending()
  expectUnchanged('resolve_event', {
    state: pending.state, event_id: pending.instanceId, option_id: 'invented', catalog: pending.catalog
  }, 'INVALID_INPUT')

  const expanded = JSON.parse(JSON.stringify(pending.catalog))
  expanded.events[0].options.push({ id: 'late_accept', kind: 'abandon', label: '迟到选项', cost: 0, effects: [] })
  expectUnchanged('resolve_event', {
    state: pending.state, event_id: pending.instanceId, option_id: 'late_accept', catalog: expanded
  }, 'INVALID_INPUT')
  const removed = JSON.parse(JSON.stringify(pending.catalog))
  removed.events[0].options = removed.events[0].options.filter((option) => option.id !== 'skip')
  expectUnchanged('resolve_event', {
    state: pending.state, event_id: pending.instanceId, option_id: 'skip', catalog: removed
  }, 'INVALID_INPUT')

  const resolved = ok('resolve_event', {
    state: pending.state, event_id: pending.instanceId, option_id: 'skip', catalog: pending.catalog
  }).state
  const duplicate = call('resolve_event', {
    state: resolved, event_id: pending.instanceId, option_id: 'skip', catalog: pending.catalog
  })
  assert.equal(duplicate.error.code, 'NOT_FOUND')

  const costly = JSON.parse(JSON.stringify(eventCatalog))
  costly.events[0].options[0].cost = 3000000
  let insufficientState = setupStarted().state
  for (const member of insufficientState.staff) member.weekly_salary = 1600000
  insufficientState = ok('assign_staff', { state: insufficientState, staff_id: 'staff_dir', work_id: 'work_01' }).state
  insufficientState = ok('advance_week', { state: insufficientState, event_catalog: costly }).state
  assert.ok(insufficientState.finance.balance < 3000000)
  expectUnchanged('resolve_event', {
    state: insufficientState, event_id: insufficientState.events.pending[0].instance_id, option_id: 'accept', catalog: costly
  }, 'INSUFFICIENT_FUNDS')
})

test('事件：正负 funds、外包、延期与倒扣工作量均未授权且付费选项保持原子', () => {
  for (const value of [1, -1]) {
    const catalog = JSON.parse(JSON.stringify(eventCatalog))
    catalog.events[0].options[0].effects = [{ scope: 'instant', target: 'funds', value }]
    const pending = withPending(catalog)
    expectUnchanged('resolve_event', {
      state: pending.state, event_id: pending.instanceId, option_id: 'accept', catalog
    }, 'NOT_IMPLEMENTED')
  }
  for (const kind of ['outsource', 'extension']) {
    const catalog = JSON.parse(JSON.stringify(eventCatalog))
    catalog.events[0].options[1].kind = kind
    const pending = withPending(catalog)
    expectUnchanged('resolve_event', {
      state: pending.state, event_id: pending.instanceId, option_id: 'skip', catalog
    }, 'NOT_IMPLEMENTED')
  }
  const catalog = JSON.parse(JSON.stringify(eventCatalog))
  catalog.events[0].options[0].effects = [{ scope: 'instant', target: 'work_done', value: -1 }]
  const pending = withPending(catalog)
  expectUnchanged('resolve_event', {
    state: pending.state, event_id: pending.instanceId, option_id: 'accept', catalog
  }, 'NOT_IMPLEMENTED')
})

test('事件：持久化实例的标识、选项、期限、升级与引用被严格校验', () => {
  const pending = withPending()
  const save = ok('save_game', { state: pending.state }).save
  const cases = [
    (state) => { state.events.last_event_week = -1 },
    (state) => { state.events.last_event_week = state.company.week + 1 },
    (state) => { state.events.pending[0].event_id = 'other_event' },
    (state) => { state.events.pending[0].option_ids = [] },
    (state) => { state.events.pending[0].option_ids = ['accept', 'accept'] },
    (state) => { state.events.pending[0].option_ids = ['Bad-Option'] },
    (state) => { state.events.pending[0].expires_week = state.events.pending[0].triggered_week + 9 },
    (state) => { state.events.pending[0].expires_week = state.events.pending[0].triggered_week + 1 },
    (state) => { state.events.pending[0].escalation = { description: '无期限升级', effects: [] } },
    (state) => { state.events.pending[0].item_id = findItem(state, 'work_01', 'ep01.storyboard').id },
    (state) => { state.events.pending[0].episode_id = '' }
  ]
  for (const [index, mutate] of cases.entries()) {
    const state = JSON.parse(JSON.stringify(pending.state))
    mutate(state)
    assert.equal(call('save_game', { state }).error?.code, 'INVALID_STATE', `save case ${index}`)
    const corrupted = JSON.parse(JSON.stringify(save))
    corrupted.state = state
    assert.equal(call('load_game', { save: corrupted }).error?.code, 'SAVE_CORRUPT', `load case ${index}`)
    assert.equal(call('resolve_event', {
      state, event_id: state.events.pending[0].instance_id, option_id: 'accept', catalog: pending.catalog
    }).error?.code, 'INVALID_STATE', `resolve case ${index}`)
  }

  const timedCatalog = JSON.parse(JSON.stringify(eventCatalog))
  timedCatalog.events[0].expires_weeks = 2
  timedCatalog.events[0].escalation = {
    description: '超时升级',
    effects: [{ scope: 'instant', target: 'morale', value: -3 }]
  }
  const timed = withPending(timedCatalog)
  assert.equal(timed.state.events.pending[0].expires_week - timed.state.events.pending[0].triggered_week, 2)
  ok('save_game', { state: timed.state })
  const invalidEscalation = JSON.parse(JSON.stringify(timed.state))
  invalidEscalation.events.pending[0].escalation.effects[0].scope = 'project'
  assert.equal(call('save_game', { state: invalidEscalation }).error?.code, 'INVALID_STATE')
})

test('事件：目录作用域矩阵与同项目同周重复实例被拒绝', () => {
  const invalid = JSON.parse(JSON.stringify(eventCatalog))
  invalid.events[0].options[0].effects = [{ scope: 'project', target: 'fatigue', value: 1 }]
  const state = setupStarted().state
  expectUnchanged('advance_week', { state, event_catalog: invalid }, 'INVALID_INPUT')

  const pending = withPending()
  pending.state.events.pending.push({
    ...JSON.parse(JSON.stringify(pending.state.events.pending[0])), instance_id: pending.instanceId + '.duplicate'
  })
  assert.equal(call('save_game', { state: pending.state }).error.code, 'INVALID_STATE')
})

test('事件：重大事件触发后即消耗，随机候选不依赖目录顺序', () => {
  const major = JSON.parse(JSON.stringify(eventCatalog))
  major.events[0].tier = 'major'
  major.events[0].cooldown_weeks = 0
  let state = setupStarted().state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  state = ok('advance_week', { state, event_catalog: major }).state
  assert.deepEqual(state.events.per_work.work_01.major_seen, ['test_budget_event'])
  state = ok('resolve_event', {
    state, event_id: state.events.pending[0].instance_id, option_id: 'skip', catalog: major
  }).state
  for (let week = 0; week < 3; week++) state = ok('advance_week', { state, event_catalog: major }).state
  assert.equal(state.events.pending.length, 0)

  const run = (reverse) => {
    const cards = [randomCard('random_alpha'), randomCard('random_beta')]
    if (reverse) cards.reverse()
    const catalog = { schema_version: 1, events: cards }
    let current = setupStarted().state
    current = ok('assign_staff', { state: current, staff_id: 'staff_dir', work_id: 'work_01' }).state
    current = ok('advance_week', { state: current, event_catalog: catalog }).state
    return current.events.pending[0].event_id
  }
  assert.equal(run(false), run(true))
})

test('事件：显式延迟阶段只修改指定阶段，中止后保留但不应用', () => {
  const catalog = JSON.parse(JSON.stringify(eventCatalog))
  catalog.events[0].options[0].effects = [{ scope: 'stage', target: 'quality', value: 5, stage: 'storyboard_key_animation' }]
  catalog.events[0].stages.push('storyboard_key_animation')
  let { state, instanceId } = withPending(catalog)
  state = ok('resolve_event', { state, event_id: instanceId, option_id: 'accept', catalog }).state
  assert.equal(state.events.per_work.work_01.effects[0].stage_key, 'storyboard_key_animation')
  const storyboard = findItem(state, 'work_01', 'ep01.storyboard')
  storyboard.work_done = storyboard.work_total
  storyboard.contributors = ['staff_dir']
  for (const dim of Object.keys(storyboard.quality)) storyboard.quality[dim] = 10
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: null }).state
  state = ok('advance_week', { state }).state
  assert.equal(state.events.per_work.work_01.effects[0].applied, true)
  assert.ok(Object.values(findItem(state, 'work_01', 'ep01.storyboard').quality).every((value) => value === 15))

  const abortedCatalog = JSON.parse(JSON.stringify(eventCatalog))
  abortedCatalog.events[0].options[0].effects = [{ scope: 'stage', target: 'quality', value: 5 }]
  let aborted = withPending(abortedCatalog)
  aborted.state = ok('resolve_event', {
    state: aborted.state, event_id: aborted.instanceId, option_id: 'accept', catalog: abortedCatalog
  }).state
  aborted.state = ok('abort_work', { state: aborted.state, work_id: 'work_01' }).state
  const before = ok('hash_state', { state: aborted.state }).hash
  aborted.state = ok('advance_week', { state: aborted.state }).state
  assert.equal(aborted.state.events.per_work.work_01.effects[0].applied, false)
  assert.notEqual(ok('hash_state', { state: aborted.state }).hash, before)
})

test('v4 严格反序列化：浮点、对象冒充数组与嵌套快照字段全部拒绝', () => {
  const { state } = setupStarted()
  const float = JSON.parse(JSON.stringify(state))
  float.company.week = 1.5
  assert.equal(call('assign_staff', { state: float, staff_id: 'staff_dir', work_id: null }).error.code, 'INVALID_INPUT')
  const objectArray = JSON.parse(JSON.stringify(state))
  objectArray.staff = {}
  assert.equal(call('assign_staff', { state: objectArray, staff_id: 'staff_dir', work_id: null }).error.code, 'INVALID_INPUT')

  let delivered = completeWork(JSON.parse(JSON.stringify(state)), 'work_01')
  delivered = ok('deliver_work', { state: delivered, work_id: 'work_01' }).state
  const saved = ok('save_game', { state: delivered }).save
  const snapshot = JSON.parse(JSON.stringify(saved))
  snapshot.state.works[0].delivery.staff_snapshot.push({ staff_id: 'staff_dir' })
  assert.equal(call('load_game', { save: snapshot }).error.code, 'SAVE_CORRUPT')
})

test('v4 状态不变式：薪酬、临时合同、市场槽与 Archive 篡改被拒绝', () => {
  const { state } = setupStarted()
  const pay = JSON.parse(JSON.stringify(state))
  pay.staff[0].weekly_salary = 0
  assert.equal(call('save_game', { state: pay }).error.code, 'INVALID_STATE')
  const temporary = JSON.parse(JSON.stringify(state))
  temporary.staff.push({
    ...JSON.parse(JSON.stringify(temporary.staff[0])), id: 'staff_bad_temp', employment: 'temporary',
    weekly_salary: 0, project_fee: 0, assignment_work_id: 'work_01',
    temporary_contract: { work_id: 'work_01', started_week: 0 }
  })
  assert.equal(call('save_game', { state: temporary }).error.code, 'INVALID_STATE')
  const crowded = JSON.parse(JSON.stringify(state))
  const offer = crowded.market.slots[0]
  crowded.market.slots = Array.from({ length: 5 }, (_, index) => ({ ...offer, id: `offer_${index}` }))
  assert.equal(call('save_game', { state: crowded }).error.code, 'INVALID_STATE')

  let delivered = completeWork(JSON.parse(JSON.stringify(state)), 'work_01')
  delivered = ok('deliver_work', { state: delivered, work_id: 'work_01' }).state
  const archive = JSON.parse(JSON.stringify(delivered))
  archive.archive.works[0].production_cost += 1
  assert.equal(call('save_game', { state: archive }).error.code, 'INVALID_STATE')
})

test('v4 存档信封、时间戳、嵌套版本与多项目危机状态恢复严格', () => {
  const { state } = setupStarted()
  const saved = ok('save_game', { state }).save
  for (const mutate of [
    (save) => { delete save.saved_at },
    (save) => { save.extra = true },
    (save) => { save.version = 4.5 },
    (save) => { save.state.version = 3 }
  ]) {
    const changed = JSON.parse(JSON.stringify(saved))
    mutate(changed)
    assert.equal(call('load_game', { save: changed }).error.code, 'SAVE_CORRUPT')
  }
  assert.equal(JSON.parse(core.load_game('{')).error.code, 'SAVE_CORRUPT')
  for (const saved_at of ['2026-02-30T00:00:00Z', '2026-11-25T25:00:00Z', 'yesterday']) {
    assert.equal(call('save_game', { state, saved_at }).error.code, 'INVALID_INPUT')
  }

  let complex = setupStarted().state
  complex = ok('instantiate_work', { state: complex, blueprint: m2Blueprint, work_id: 'work_02', duration_weeks: 26 }).state
  complex = ok('assign_staff', { state: complex, staff_id: 'staff_dir', work_id: 'work_01' }).state
  complex = ok('advance_week', { state: complex, event_catalog: eventCatalog }).state
  complex.finance.solvency = { state: 'crisis', since_week: 1, deadline_week: 5, gap: 0 }
  complex = completeWork(complex, 'work_01')
  complex = ok('deliver_work', { state: complex, work_id: 'work_01', settlement: { penalty: 8000000 } }).state
  complex.finance.solvency.gap = -complex.finance.balance
  const complexSave = ok('save_game', { state: complex }).save
  const loaded = ok('load_game', { save: complexSave }).state
  assert.equal(loaded.works.length, 2)
  assert.equal(loaded.events.pending.length, 2)
  assert.equal(loaded.finance.solvency.state, 'crisis')
  assert.equal(ok('hash_state', { state: complex }).hash, ok('hash_state', { state: loaded }).hash)
})

test('M2 端到端：真实 12 集蓝图自然制作、事件、存档续跑、主动交付与财务对账', () => {
  const blueprint = JSON.parse(readFileSync('docs/blueprints/tv_standard.blueprint.json', 'utf8'))
  const e2eCatalog = {
    schema_version: 1,
    events: [{
      ...randomCard('e2e_review', 0), once_per_project: true,
      trigger: { metric: 'weeks_in_project', op: '>=', threshold: 1 }
    }]
  }
  let state = ok('initialize', { seed: 20261125 }).state
  state.market.slots[0].duration_weeks = 28
  state = ok('start_work', {
    state, offer_id: 'offer_tv_standard', mode: 'contract', percent: 0,
    committee_partner_ids: [], blueprint
  }).state
  for (const member of state.staff) member.weekly_salary = 1000
  const initialStaff = [...state.staff]
  for (const [index, source] of initialStaff.entries()) {
    for (let copy = 0; copy < 7; copy++) {
      state.staff.push({
        ...JSON.parse(JSON.stringify(source)), id: `staff_extra_${index}_${copy}`, name: `增补${index}_${copy}`,
        abilities: Object.fromEntries(Object.keys(source.abilities).map((key) => [key, 90])),
        potential: Object.fromEntries(Object.keys(source.potential).map((key) => [key, 95])),
        weekly_salary: 1000
      })
    }
  }
  for (const member of state.staff) {
    state = ok('assign_staff', { state, staff_id: member.id, work_id: 'work_01' }).state
  }
  state = ok('set_work_plan', {
    state, work_id: 'work_01', plan: { intensity: 'high', focus: 'schedule' }
  }).state

  let weeks = 0
  let checkpoint
  const gatesReady = (current) => current.works[0].episodes.every((episode) =>
    episode.stages.at(-1).items.filter((item) => item.is_gate).every((item) => item.work_done * 1000 >= item.deliver_at * item.work_total))
  while (state.works[0].status === 'producing' && !gatesReady(state)) {
    if (state.events.pending.length) {
      state = ok('resolve_event', {
        state, event_id: state.events.pending[0].instance_id, option_id: 'skip', catalog: e2eCatalog
      }).state
    }
    state = ok('advance_week', { state, event_catalog: e2eCatalog }).state
    weeks++
    assert.ok(weeks <= 26, '自然制作应在截止周前完成')
    if (weeks === 3) checkpoint = ok('save_game', { state, saved_at: '2026-11-25T12:00:00Z' }).save
  }
  assert.equal(state.works[0].status, 'producing')
  assert.ok(allItems(state, 'work_01').reduce((sum, item) => sum + item.work_done, 0) > 0)
  assert.ok(checkpoint, '必须在中段保存')
  let resumed = ok('load_game', { save: checkpoint }).state
  let resumedWeeks = 0
  while (resumed.works[0].status === 'producing' && !gatesReady(resumed)) {
    if (resumed.events.pending.length) {
      resumed = ok('resolve_event', {
        state: resumed, event_id: resumed.events.pending[0].instance_id, option_id: 'skip', catalog: e2eCatalog
      }).state
    }
    resumed = ok('advance_week', { state: resumed, event_catalog: e2eCatalog }).state
    resumedWeeks++
    assert.ok(resumedWeeks <= 26, '存档续跑应在截止周前完成')
  }
  const deliver = (current) => ok('deliver_work', { state: current, work_id: 'work_01' }).state
  const direct = deliver(state)
  const continued = deliver(resumed)
  assert.equal(ok('hash_state', { state: direct }).hash, ok('hash_state', { state: continued }).hash)
  assert.equal(direct.works[0].delivery.forced, false)
  assert.equal(direct.works[0].delivery.on_time, true)
  assert.ok(direct.works[0].delivery.delivered_week < direct.works[0].deadline_week)
  assert.equal(direct.archive.works.length, 1)
  const contributors = new Set(allItems(direct, 'work_01').flatMap((item) => item.contributors))
  assert.equal(direct.archive.works[0].staff_snapshot.length, contributors.size)
  assert.ok(contributors.size > 0)
  assert.equal(direct.finance.balance, direct.finance.opening_funds + direct.finance.entries.reduce((sum, entry) => sum + entry.amount, 0))
  assert.equal(direct.works[0].delivery.production_cost,
    -direct.finance.entries.filter((entry) => entry.work_id === 'work_01' && entry.amount < 0 &&
      ['salary', 'production', 'temporary', 'events'].includes(entry.category)).reduce((sum, entry) => sum + entry.amount, 0))
})
