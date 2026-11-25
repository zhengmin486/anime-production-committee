import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

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
  const before = ok('hash_state', { state }).hash
  const rejectUnchanged = (mutate, label) => {
    const bad = JSON.parse(JSON.stringify(state))
    mutate(bad)
    for (const name of ['assign_staff', 'advance_week', 'hash_state']) {
      const result = call(name, { state: bad, staff_id: 'staff_dir', work_id: null })
      assert.equal(result.error?.code, 'INVALID_INPUT', `${label} / ${name} 应被拒绝`)
    }
    assert.equal(ok('hash_state', { state }).hash, before, `${label}：失败不得改动状态`)
  }

  rejectUnchanged((s) => { delete s.company.week }, '缺 company.week')
  rejectUnchanged((s) => { delete s.works[0].common.items[0].work_total }, '缺 item.work_total')
  // 这几个字段在 from_json 里都有默认值，过去缺了会被静默补成 0 / normal，
  // 让"周结算与手算一致"在坏输入上失真。现在必须在入口拒绝。
  rejectUnchanged((s) => { delete s.staff[0].weekly_salary }, '缺 staff.weekly_salary（工资会静默归零）')
  rejectUnchanged((s) => { delete s.staff[0].project_fee }, '缺 staff.project_fee')
  rejectUnchanged((s) => { delete s.staff[0].fatigue }, '缺 staff.fatigue（产能会静默归零）')
  rejectUnchanged((s) => { delete s.staff[0].morale }, '缺 staff.morale')
  rejectUnchanged((s) => { delete s.finance.solvency }, '缺 finance.solvency（危机状态被洗白）')
  rejectUnchanged((s) => { delete s.finance.solvency.state }, '缺 finance.solvency.state')
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
