import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateCard } from './lib/event-schema.mjs'
import { generateCandidate, generateTemporary, refreshTemporary, scout as oracleScout, rotatePool, PURPOSE } from './lib/recruit-oracle.mjs'
import { generateOffer, weeklyMarketStep, startWorkCash, depositAmount } from './lib/market-oracle.mjs'
import { draw, hashText, Stream } from './lib/coordinate-random.mjs'

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
  common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [], quality_weight_permille: 200 }],
  episode: [
    { key: 'script', stage: 'content_design', name: '脚本', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [], quality_weight_permille: 140 },
    { key: 'storyboard', stage: 'storyboard_key_animation', name: '分镜', ability: 'direction', work_total: 100, deliver_at: 1000, deps: ['script'], quality_weight_permille: 140 },
    { key: 'inbetween', stage: 'animation', name: '动画', ability: 'animation', work_total: 100, deliver_at: 1000, deps: ['storyboard'], outsourceable: true, quality_weight_permille: 140 },
    { key: 'background', stage: 'art_visual', name: '背景', ability: 'drawing', work_total: 100, deliver_at: 1000, deps: ['storyboard'], quality_weight_permille: 140 },
    { key: 'composite', stage: 'photography_editing', name: '摄影', ability: 'postproduction', work_total: 100, deliver_at: 1000, deps: ['inbetween', 'background'], quality_weight_permille: 140 },
    { key: 'master', stage: 'sound_delivery', name: '母版', ability: 'postproduction', work_total: 100, deliver_at: 1000, is_gate: true, deps: ['composite'], quality_weight_permille: 100 }
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

function funded(state, extra = 400_000_000) {
  const copy = structuredClone(state)
  copy.finance.opening_funds += extra
  copy.finance.balance += extra
  return copy
}

// 把任意员工改造成"合法的临时员工"：职业必须是八职业之一（这里用 作画=drawing），
// 报价按 (20000 + 主能力x300)x120% 与两周签约费推导，否则会被 validate 直接判红。
function forceTemporary(member, patch = {}) {
  member.role = '作画'
  member.employment = 'temporary'
  const primary = member.abilities.drawing
  member.weekly_salary = Math.floor((20000 + primary * 300) * 120 / 100)
  member.signing_fee = member.weekly_salary * 2
  Object.assign(member, patch)
  return member
}

function addTemporaryCandidate(state, id = 'temp_candidate_01') {
  const member = structuredClone(state.recruitment.pool[0].staff)
  member.id = id
  member.name = id
  member.employment = 'temporary'
  member.experience = Object.fromEntries(Object.keys(member.experience).map((ability) => [ability, 0]))
  // 临时员工报价必须与 validate 的公式一致：(base + 主能力x系数) x120%，签约费 = 两周薪资
  const professionAbility = {
    作画: 'drawing', 演出: 'direction', 脚本: 'planning', 摄影: 'postproduction',
    监督: 'direction', 音乐: 'postproduction', 声优: 'postproduction', 美术: 'drawing'
  }
  const primaryAbility = professionAbility[member.role]
  const primaryValue = primaryAbility ? member.abilities[primaryAbility] : 0
  member.weekly_salary = Math.floor((20000 + primaryValue * 300) * 120 / 100)
  member.signing_fee = member.weekly_salary * 2
  member.fatigue = 0
  member.assignment_work_id = null
  member.last_participation = null
  member.temporary_contract = null
  state.recruitment.pool[state.recruitment.pool.length - 1] = { staff: member, origin: 'regular', expires_week: null }
  return member
}

test('initialize 生成合法状态，同 seed 哈希一致', () => {
  const first = ok('initialize', { seed: 42 })
  const second = ok('initialize', { seed: 42 })
  const hashA = ok('hash_state', { state: first.state }).hash
  const hashB = ok('hash_state', { state: second.state }).hash
  assert.equal(first.state.version, 4)
  assert.equal(first.state.company.week, 0)
  assert.equal(first.state.staff.length, 4)
  assert.deepEqual(first.state.staff.map((member) => member.weekly_salary), [238000, 208000, 170000, 170000])
  assert.equal(first.state.staff.reduce((sum, member) => sum + member.weekly_salary, 0), 786000)
  assert.equal(first.state.finance.opening_funds, 14000000)
  assert.equal(first.state.finance.balance, 14000000)
  assert.equal(first.state.staff[0].signing_fee, 0)
  assert.equal('project_fee' in first.state.staff[0], false)
  assert.deepEqual(first.state.finance.loans, [])
  assert.equal(first.state.finance.solvency.state, 'normal')
  assert.equal(hashA, hashB)
})

test('实例化 tv_standard 得到 125 个工作项（10×12 + 5）', () => {
  const blueprint = JSON.parse(readFileSync('docs/blueprints/tv_standard.blueprint.json', 'utf8'))
  const base = ok('initialize', { seed: 1 })
  const created = ok('instantiate_work', { state: base.state, blueprint, work_id: 'work_tv', duration_weeks: 52 })
  const items = allItems(created.state, 'work_tv')
  assert.equal(created.state.works[0].episodes.length, 10)
  assert.equal(items.length, 125)
  assert.equal(items.filter((item) => item.is_gate).length, 10)
  assert.equal(items.reduce((sum, item) => sum + item.work_total, 0), 25800)
  assert.equal(items.filter((item) => !item.id.includes('.common.') && !item.is_gate && item.outsourceable)
    .reduce((sum, item) => sum + item.work_total, 0), 15200)
  assert.equal(items.filter((item) => item.id.includes('.common.')).every((item) => !item.outsourceable), true)
})

test('首周产出与独立手算逐项一致', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  const advanced = ok('advance_week', { state })

  // 手算（S_eff=floor((85*主能力+3*其余五项和)/100)，1 人周=70 点，整数向下取整）：
  // staff_anim 主专业 animation：75 点；planning 工序上限 55 点 → 公共 55、脚本 20。
  // staff_dir 主专业 direction：77 点，监督执行五折后 38 点 → 公共 38。
  // staff_ka 主专业 drawing：79 点；planning 工序上限 58 点 → 公共 7、脚本 58。
  // 同周参与者都以周初快照判断磨合；最终公共 100、脚本 78。
  const common = findItem(advanced.state, 'work_01', 'common.series_comp')
  const script = findItem(advanced.state, 'work_01', 'ep01.script')
  assert.equal(common.work_done, 100)
  assert.equal(script.work_done, 78)
  assert.deepEqual(Object.fromEntries(advanced.report.staff.map((member) => [member.staff_id, member.produced])), {
    staff_dir: 38,
    staff_ka: 65,
    staff_anim: 75,
    staff_post: 0
  })

  // 质量是评级：首次接触把整项基准铺满六维，之后每次投入只精修一个维度。
  // 旧公式（点数 × ability_q）会得到 58 / 62；新模型下质量与点数无关，由人和随机决定。
  const commonDims = Object.values(common.quality)
  assert.equal(commonDims.filter((value) => value > 0).length, 6, '首次接触应铺满六维')
  assert.ok(commonDims.every((value) => value >= 0 && value <= 105), '质量是 0..105 的评级')

  const scriptDims = Object.values(script.quality)
  assert.equal(scriptDims.filter((value) => value > 0).length, 6, '脚本同样先铺满六维')
  assert.ok(new Set(scriptDims).size <= 2, '第二笔投入最多只精修一个维度')

  // 周结算同时记账：四人工资 786000 + 运营 30000 + 制作 60000 = 876000
  assert.equal(advanced.report.funds.costs.salary, 786000)
  assert.equal(advanced.report.funds.costs.operations, 30000)
  assert.equal(advanced.report.funds.costs.production, 60000)
  assert.equal(advanced.report.funds.delta, -876000)
  assert.equal(advanced.report.funds.balance, 13124000)
  assert.equal(advanced.state.finance.balance, 13124000)
  const ledgerSum = advanced.state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0)
  assert.equal(advanced.state.finance.opening_funds + ledgerSum, advanced.state.finance.balance)
  assert.equal(advanced.state.finance.entries.length, 6)   // 4 工资 + 1 运营 + 1 制作
  assert.ok(advanced.state.finance.entries.some((entry) => entry.category === 'production' && entry.work_id === 'work_01'))

  // 质量聚合进入回执：工作项 → 阶段 → 单集 → 作品
  const aggregated = advanced.report.works[0].quality
  const aggregatedSum = Object.values(aggregated.dims).reduce((sum, value) => sum + value, 0)
  assert.ok(aggregatedSum > 0, '作品层质量不应为空')
  assert.equal(Object.values(aggregated.dims).filter((value) => value > 0).length, 6, '公共与脚本都产出了六维质量')
  assert.equal(aggregated.mean, Math.round(aggregatedSum / 6))

  const fatigue = Object.fromEntries(advanced.state.staff.map((member) => [member.id, member.fatigue]))
  const morale = Object.fromEntries(advanced.state.staff.map((member) => [member.id, member.morale]))
  for (const id of ['staff_dir', 'staff_ka', 'staff_anim']) {
    assert.equal(fatigue[id], 8)
    assert.equal(morale[id], 78)
  }
  assert.equal(fatigue.staff_post, 0)
  assert.equal(morale.staff_post, 81)
  assert.equal(advanced.state.company.week, 1)
})

function runCapacityAnchor(anchor, fatigue = 0, morale = 100) {
  const blueprint = structuredClone(tiny)
  blueprint.common[0].ability = 'animation'
  blueprint.common[0].work_total = 1000
  let state = ok('initialize', { seed: 7 }).state
  state = ok('instantiate_work', { state, blueprint, work_id: 'work_anchor', duration_weeks: 26 }).state
  state.staff = state.staff.filter((member) => ['staff_dir', 'staff_anim'].includes(member.id))
  for (const member of state.staff) {
    member.abilities = Object.fromEntries(Object.keys(member.abilities).map((ability) => [ability, anchor]))
    member.fatigue = fatigue
    member.morale = morale
  }
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_anchor' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_anim', work_id: 'work_anchor' }).state
  return ok('advance_week', { state })
}

test('DEC-STAFF-008：S=30/60/100 产能锚点与整数点取整', () => {
  assert.deepEqual([30, 60, 100].map((anchor) =>
    runCapacityAnchor(anchor).report.staff.find((member) => member.staff_id === 'staff_anim').produced), [45, 70, 91])
})

test('DEC-STAFF-008：非红灯区间不重复扣除已计入利用率的疲劳与士气', () => {
  const rested = runCapacityAnchor(60, 40, 60)
  const strained = runCapacityAnchor(60, 80, 30)
  assert.equal(rested.report.staff.find((member) => member.staff_id === 'staff_anim').produced, 70)
  assert.equal(strained.report.staff.find((member) => member.staff_id === 'staff_anim').produced, 70)
})

test('阶段 2-3：临时员工周薪同样进入刚性预检与唯一账本', () => {
  let state = setupTiny(21)
  const cardIndex = state.recruitment.pool.findIndex((candidate) => candidate.origin === 'temporary')
  const temporary = structuredClone(state.recruitment.pool[cardIndex].staff)
  state.recruitment.pool.splice(cardIndex, 1)   // 解包入册必须从池里移除，否则 id 全局重复
  temporary.temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 26 }
  temporary.assignment_work_id = 'work_01'
  state.staff.push(temporary)
  state = assign(state, 'staff_dir', 'work_01')
  state = assign(state, 'staff_ka', 'work_01')
  const experienceBefore = JSON.parse(JSON.stringify(temporary.experience))
  const result = ok('advance_week', { state })
  assert.equal(result.report.funds.costs.salary, 786000)
  assert.equal(result.report.funds.costs.temporary, temporary.weekly_salary)
  assert.deepEqual(result.state.staff.find((member) => member.id === temporary.id).experience, experienceBefore)
  assert.equal(result.state.finance.entries.filter((entry) => entry.category === 'salary').length, 4)
  assert.equal(result.state.finance.entries.filter((entry) => entry.category === 'temporary').length, 1)
  const temporaryEntry = result.state.finance.entries.find((entry) => entry.id === 'w0.temporary.' + temporary.id + '.salary')
  assert.equal(temporaryEntry.amount, -temporary.weekly_salary)
  assert.equal(temporaryEntry.work_id, 'work_01')
  assert.equal(result.state.finance.opening_funds + result.state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0), result.state.finance.balance)
})

test('临时员工不积累长期经验，结项后退出名册但保留团队快照', () => {
  let state = setupTiny(24)
  const cardIndex = state.recruitment.pool.findIndex((candidate) => candidate.origin === 'temporary')
  const temporary = structuredClone(state.recruitment.pool[cardIndex].staff)
  state.recruitment.pool.splice(cardIndex, 1)
  temporary.temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 26 }
  temporary.assignment_work_id = 'work_01'
  state.staff.push(temporary)
  state = assign(state, 'staff_dir', 'work_01')
  state = ok('advance_week', { state }).state
  assert.ok(allItems(state, 'work_01').some((item) => item.contributors.includes(temporary.id)))
  state = completeWork(state, 'work_01', 80)
  const delivered = ok('deliver_work', { state, work_id: 'work_01' })
  assert.equal(delivered.state.staff.some((member) => member.id === temporary.id), false)
  assert.ok(delivered.state.archive.works[0].team.some((member) => member.id === temporary.id))
})

test('周结算重复提交同一状态不产生双工资、双生产或双推进', () => {
  let state = setupTiny(22)
  state = assign(state, 'staff_dir', 'work_01')
  const before = ok('hash_state', { state }).hash
  const first = ok('advance_week', { state })
  const repeated = ok('advance_week', { state })
  assert.deepEqual(repeated, first)
  assert.equal(first.state.company.week, 1)
  assert.equal(first.state.finance.entries.filter((entry) => entry.category === 'salary').length, 4)
  assert.equal(first.state.finance.entries.filter((entry) => entry.category === 'production').length, 1)
  assert.equal(ok('hash_state', { state }).hash, before)
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
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
    state = addIdleSupervisor(state)
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
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

test('两个项目并存且人员归属不串项目', () => {
  let state = ok('initialize', { seed: 5 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
  state = addIdleSupervisor(state)
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_a' }).state
  const advanced = ok('advance_week', { state })

  assert.equal(advanced.state.works.length, 2)
  const a = allItems(advanced.state, 'work_a')
  const b = allItems(advanced.state, 'work_b')
  assert.ok(a.some((item) => item.work_done > 0))
  assert.ok(b.some((item) => item.work_done > 0))
  for (const item of a) for (const id of item.contributors) assert.notEqual(id, 'staff_pm')
  for (const item of b) for (const id of item.contributors) assert.equal(id, 'staff_pm')
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
    common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: 1000, deliver_at: 150, deps: [], quality_weight_permille: 200 }]
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

test('§14.7 预检失败：整周回滚并直接破产终局，不产生半结算', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  // 本周需要 876000，只留 100000
  state.finance.opening_funds = 100000
  state.finance.balance = 100000

  const result = ok('advance_week', { state })
  assert.equal(result.report.bankrupt, true)
  assert.equal(result.report.skipped, true)
  assert.equal(result.report.gap, 776000)
  assert.equal(result.state.company.week, 0)
  assert.equal(result.state.company.status, 'closing')
  assert.equal(result.state.company.end_reason, 'bankrupt')
  assert.equal(result.state.works[0].status, 'delivering')
  assert.equal(result.state.finance.balance, 100000)
  assert.equal(result.state.finance.entries.length, 0)
  assert.equal(findItem(result.state, 'work_01', 'common.series_comp').work_done, 0)
})

test('周回执形状稳定：破产提前返回同样带 outsourcing/settlement 空数组', () => {
  let state = ok('initialize', { seed: 7 }).state
  state.finance.opening_funds = 0
  state.finance.balance = 0
  const result = ok('advance_week', { state })
  assert.equal(result.report.bankrupt, true)
  assert.deepEqual(result.report.outsourcing, [])
  assert.deepEqual(result.report.settlements, [])
  assert.deepEqual(result.report.works, [])
})

test('#120 破产终局：pending 按默认保守分支结清，不再以 NOT_IMPLEMENTED 卡死', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  // 本周需要 210000，只留 1000：预检失败即破产，事件结清只能动用剩余现金。
  forceCash(state, 1000)
  state.events.pending.push(terminalEvent('work_01', { cost: 400 }))

  const result = ok('advance_week', { state })
  assert.equal(result.report.mode, 'bankrupt')
  assert.equal(result.report.events.reason, 'bankrupt')
  assert.deepEqual(result.report.events.expired, [
    { work_id: 'work_01', event_id: 'terminal_fixture', option_id: 'accept', automatic: true }
  ])
  assert.equal(result.report.funds.balance, 600)
  assert.equal(result.report.funds.delta, -400)
  assert.equal(result.state.events.pending.length, 0)
  assert.equal(result.state.company.status, 'closing')
  assert.equal(result.state.company.end_reason, 'bankrupt')
  // 结清留痕可对账：事件流水进唯一账本，并归因到项目与事件。
  const eventEntries = result.state.finance.entries.filter((entry) => entry.category === 'events')
  assert.equal(eventEntries.length, 1)
  assert.equal(eventEntries[0].work_id, 'work_01')
  assert.equal(eventEntries[0].memo, 'terminal_fixture')
  assert.equal(eventEntries[0].amount, -400)
})

test('#120 多项目 pending：按 (work_id,event_id) 稳定顺序结清，顺序不影响结果', () => {
  const build = () => {
    const state = forceCash(twoProjectsNearDeadline(), 1000)
    // 故意倒序压入，验证结清顺序由排序决定而不是数组顺序。
    state.events.pending.push(terminalEvent('work_b', { cost: 200, eventId: 'zz_late' }))
    state.events.pending.push(terminalEvent('work_a', { cost: 100, eventId: 'aa_early' }))
    return state
  }
  const first = ok('advance_week', { state: build() })
  const second = ok('advance_week', { state: build() })

  assert.deepEqual(first.report.events.expired.map((item) => `${item.work_id}/${item.event_id}`), [
    'work_a/aa_early',
    'work_b/zz_late'
  ])
  assert.equal(first.report.funds.balance, 700)
  assert.equal(first.state.events.pending.length, 0)
  assert.equal(first.state.company.end_reason, 'bankrupt')
  assert.equal(ok('hash_state', { state: first.state }).hash, ok('hash_state', { state: second.state }).hash)
})

test('#120 终局结清沿用现金封顶：现金不足以支付默认分支时不产生负余额', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  forceCash(state, 300)
  state.events.pending.push(terminalEvent('work_01', { cost: 5000 }))

  const result = ok('advance_week', { state })
  assert.equal(result.report.events.expired.length, 1)
  assert.equal(result.state.finance.entries.filter((entry) => entry.category === 'events')[0].amount, -300)
  assert.equal(result.state.finance.balance, 0)
  assert.equal(result.state.events.pending.length, 0)
  assert.equal(result.state.company.end_reason, 'bankrupt')
})

test('#120 破产终局：在制合同项目的扣罚按可支付现金封顶，终局仍能合法完成', () => {
  const state = forceCash(startedContract(), 1000)
  state.events.pending.push(terminalEvent('work_01'))

  const closed = ok('advance_week', { state })
  assert.equal(closed.state.company.status, 'closing')
  assert.equal(closed.state.company.end_reason, 'bankrupt')
  assert.equal(closed.state.events.pending.length, 0)
  assert.equal(closed.state.works[0].status, 'delivering')

  // 关闭路径的结清在 finalize_delivery 落地：名义扣罚 = 强制交付 51,000,000（170M × 缺口 100% × 30%）
  // + 质量违约 51,000,000（Q_min 65 vs 0 分，2%/分封顶 30%）= 102,000,000；
  // 只能收走「现有现金 + 本次商业收入」，其余记 penalty_waived。
  const settled = ok('finalize_delivery', { state: closed.state, work_id: 'work_01' })
  assert.equal(settled.report.quality_penalty, 51000000)
  assert.equal(settled.report.penalty + settled.report.penalty_waived, 102000000)
  assert.ok(settled.report.penalty_waived > 0)
  assert.equal(settled.state.finance.balance, 0, '扣罚不得把现金推成负数')
  // 归档扣罚等于实付金额，与账本一致；不产生负现金或欠款。
  assert.equal(settled.state.archive.works[0].finance_summary.penalty, settled.report.penalty)
  const penaltyEntries = settled.state.finance.entries.filter((entry) => entry.category === 'penalty')
  assert.equal(penaltyEntries.length, 1)
  assert.equal(penaltyEntries[0].amount, -settled.report.penalty)
})

test('#120 终局结清失败时原子回滚：不留半状态、不清空事件', () => {
  let state = setupTiny()
  for (const staffId of ['staff_dir', 'staff_ka', 'staff_anim']) {
    state = ok('assign_staff', { state, staff_id: staffId, work_id: 'work_01' }).state
  }
  // 只有 accept、没有 abandon/decline：没有可执行的默认保守分支。
  state.events.pending.push(terminalEvent('work_01', { kind: 'accept' }))
  state.finance.opening_funds = 1000
  state.finance.balance = 1000
  const before = ok('hash_state', { state }).hash

  const blocked = call('advance_week', { state })
  assert.equal(blocked.error.code, 'INVALID_STATE')
  assert.match(blocked.error.message, /默认保守分支/)
  assert.equal('state' in blocked, false)
  assert.equal(ok('hash_state', { state }).hash, before)
  assert.equal(state.events.pending.length, 1)
  assert.equal(state.company.status, 'running')
  assert.equal(state.works[0].status, 'producing')
})

test('v4 员工签约费只使用 signing_fee 口径', () => {
  const state = setupTiny()
  state.staff[0].signing_fee = 1234
  const advanced = ok('advance_week', { state }).state
  assert.equal(advanced.staff[0].signing_fee, 1234)
  assert.equal('project_fee' in advanced.staff[0], false)

  const legacy = JSON.parse(JSON.stringify(state))
  delete legacy.staff[0].signing_fee
  legacy.staff[0].project_fee = 1234
  const rejected = call('advance_week', { state: legacy })
  assert.equal(rejected.error?.code, 'INVALID_INPUT')
})

test('危机预留字段不得绕过非负现金约束', () => {
  const base = setupTiny()
  const reject = (mutate, pattern) => {
    const state = JSON.parse(JSON.stringify(base))
    mutate(state)
    const result = call('advance_week', { state })
    assert.equal(result.error?.code, 'INVALID_STATE')
    assert.match(result.error.message, pattern)
  }

  reject((state) => { state.finance.solvency.state = 'crisis' }, /INV-18/)
  reject((state) => { state.finance.solvency.since_week = 1 }, /INV-18/)
  reject((state) => { state.finance.solvency.deadline_week = 2 }, /INV-18/)
  reject((state) => { state.finance.solvency.gap = 1 }, /INV-18/)
  reject((state) => { state.finance.loans = [{ id: 'future_loan' }] }, /INV-18/)
  reject((state) => { state.finance.loans = {} }, /INV-18/)

  for (const key of ['loans', 'solvency']) {
    const state = JSON.parse(JSON.stringify(base))
    delete state.finance[key]
    const result = call('advance_week', { state })
    assert.equal(result.error?.code, 'INVALID_INPUT')
  }
  for (const key of ['state', 'since_week', 'deadline_week', 'gap']) {
    const state = JSON.parse(JSON.stringify(base))
    delete state.finance.solvency[key]
    const result = call('advance_week', { state })
    assert.equal(result.error?.code, 'INVALID_INPUT')
  }

  const negative = (crisis) => {
    const state = JSON.parse(JSON.stringify(base))
    state.finance.opening_funds = 100000
    state.finance.balance = -110000
    state.finance.entries = [{
      id: 'negative.fixture', week: 0, work_id: null, category: 'salary',
      amount: -210000, counterparty: null, memo: 'negative balance fixture'
    }]
    if (crisis) state.finance.solvency.state = 'crisis'
    const result = call('advance_week', { state })
    assert.equal(result.error?.code, 'INVALID_STATE')
    assert.match(result.error.message, crisis ? /INV-18/ : /INV-25/)
  }
  negative(false)
  negative(true)
})

test('双项目隔离：产出不串项目，作者不串项目', () => {
  let state = ok('initialize', { seed: 5 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
  state = addIdleSupervisor(state)
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_a' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_b' }).state
  const advanced = ok('advance_week', { state })

  const aItems = allItems(advanced.state, 'work_a')
  const bItems = allItems(advanced.state, 'work_b')
  // 两个项目的作者集合严格隔离：work_a 只有 staff_ka/staff_pm，work_b 只有 staff_dir。
  for (const item of aItems) {
    for (const id of item.contributors) assert.ok(['staff_ka', 'staff_pm'].includes(id), `work_a 出现了 ${id}`)
  }
  for (const item of bItems) {
    for (const id of item.contributors) assert.equal(id, 'staff_dir', `work_b 出现了 ${id}`)
  }
  // 两个项目的产出都必须 >0，且没有互相抵消
  assert.ok(aItems.some((item) => item.work_done > 0))
  assert.ok(bItems.some((item) => item.work_done > 0))
  // 每人本周产出不超过自身产能（不会被算两次）
  const produced = Object.fromEntries(advanced.report.staff.map((entry) => [entry.staff_id, entry.produced]))
  assert.ok(produced.staff_ka <= 100 && produced.staff_dir <= 100 && produced.staff_pm <= 100)
  const sumA = aItems.reduce((sum, item) => sum + item.work_done, 0)
  const sumB = bItems.reduce((sum, item) => sum + item.work_done, 0)
  assert.equal(sumA + sumB, produced.staff_ka + produced.staff_dir + produced.staff_pm)
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
    return { quality: { ...script.quality }, hash: ok('hash_state', { state: advanced.state }).hash }
  }
  const first = run(21)
  assert.deepEqual(run(21), first, '同 seed 必须逐字段复现')
  const variants = new Set()
  for (let seed = 0; seed < 12; seed++) variants.add(JSON.stringify(run(seed).quality))
  assert.ok(variants.size > 1, '不同 seed 应产出不同质量，否则随机性没有进入结果')
})

// ---- 2026-11-25 复审修正：质量模型、不变式、输入边界 ----

const assign = (state, staffId, workId = 'work_01') =>
  ok('assign_staff', { state, staff_id: staffId, work_id: workId }).state

function addIdleSupervisor(state, id = 'staff_pm') {
  const next = JSON.parse(JSON.stringify(state))
  const member = JSON.parse(JSON.stringify(next.staff.find((entry) => entry.role === 'director')))
  member.id = id
  member.name = `备用监督 ${id}`
  member.assignment_work_id = null
  member.last_participation = null
  next.staff.push(member)
  return next
}

const meanOf = (dims) => Math.round(Object.values(dims).reduce((sum, value) => sum + value, 0) / 6)

function singleItemBlueprint(workTotal, overrides = {}) {
  return {
    ...tiny,
    id: `single_${workTotal}`,
    common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: workTotal, deliver_at: 1000, deps: [], quality_weight_permille: 200 }],
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
    state = addIdleSupervisor(state)
    state.works[0].supervisor_staff_id = 'staff_pm'
    state.staff.find((entry) => entry.id === 'staff_pm').assignment_work_id = 'work_01'
    state.staff.find((entry) => entry.id === 'staff_dir').assignment_work_id = null
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
  const partialDims = Object.values(partial.quality)
  assert.ok(partialDims.some((value) => value > 0), '部分完成时应已形成质量')
  assert.ok(partialDims.every((value) => value >= 0 && value <= 100), '部分完成时每维应是 0..100 的评级')

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
    // 先给一个统一基准，这样"本周精修了哪一维"可以被观察（首次接触会铺满六维并掩盖抽样）
    for (const item of allItems(state, 'work_01')) {
      for (const dim of Object.keys(item.quality)) item.quality[dim] = 40
    }
    state = assign(state, 'staff_dir')
    const advanced = ok('advance_week', { state })
    const script = findItem(advanced.state, 'work_01', 'ep01.script')
    const dims = Object.entries(script.quality).filter(([, value]) => value !== 40).map(([dim]) => dim)
    assert.equal(dims.length, 1, `seed=${seed} 应只精修一个维度`)
    counts[dims[0]] += 1
  }
  assert.ok(counts.direction > 0, `direction 也应能出现：${JSON.stringify(counts)}`)
  assert.ok(counts.story >= 20, `700‰ 权重下 story 至少应占一半：${JSON.stringify(counts)}`)
  assert.ok(counts.story > counts.direction, `story 应多于 direction：${JSON.stringify(counts)}`)
})

test('质量：全片按公共 200‰ / 单集 800‰ 合成，单集内按工作项权重', () => {
  const meanOf = (mutate) => {
    let state = ok('initialize', { seed: 11 }).state
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_01', duration_weeks: 26 }).state
    const work = state.works[0]
    for (const item of allItems(state, 'work_01')) {
      item.work_done = item.work_total   // 全部完成，避免本周产能改变质量
      for (const dim of Object.keys(item.quality)) item.quality[dim] = 0
    }
    mutate(work)
    state = assign(state, 'staff_ka')
    const advanced = ok('advance_week', { state })
    return advanced.report.works[0].quality.mean
  }
  const commonOnly = meanOf((work) => {
    for (const item of work.common.items) for (const dim of Object.keys(item.quality)) item.quality[dim] = 100
  })
  const episodeOnly = meanOf((work) => {
    for (const episode of work.episodes) for (const stage of episode.stages) {
      for (const item of stage.items) for (const dim of Object.keys(item.quality)) item.quality[dim] = 100
    }
  })
  const oneWeight = meanOf((work) => {
    const item = work.episodes[0].stages.flatMap((stage) => stage.items).find((entry) => entry.key === 'inbetween')
    for (const dim of Object.keys(item.quality)) item.quality[dim] = 100
  })
  assert.equal(commonOnly, 20, '公共层 200‰ 全 100 分应只贡献 20 分')
  assert.equal(episodeOnly, 80, '单集层 800‰ 全 100 分应贡献 80 分')
  assert.equal(oneWeight, 14, '单集内单个 140‰ 工作项满分应贡献 14 分')
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
    state = addIdleSupervisor(state)
    state.works[0].supervisor_staff_id = 'staff_pm'
    state.staff.find((entry) => entry.id === 'staff_pm').assignment_work_id = 'work_01'
    state.staff.find((entry) => entry.id === 'staff_dir').assignment_work_id = null
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
    state.works[0].common.items[0].contributors = ['']
  }, 'INV-12 空贡献者')
  reject((state) => {
    state.staff[0].temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 26 }
  }, 'INV-10 核心员工带临时合同')
  reject((state) => {
    forceTemporary(state.staff[1])
  }, 'INV-10 临时员工缺少合同')
  reject((state) => {
    forceTemporary(state.staff[1], { assignment_work_id: 'work_01' })
    state.staff[1].temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 25 }
  }, 'INV-10 临时合同截止周未同步')
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
  state = assign(state, 'staff_ka')
  state = ok('advance_week', { state }).state
  assert.equal(state.staff.find((entry) => entry.id === 'staff_ka').last_participation.week, 0)
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: null }).state
  state = ok('advance_week', { state }).state
  assert.equal(state.staff.find((entry) => entry.id === 'staff_ka').last_participation, null)
  ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' })
})

test('输入边界：assign_staff 的 work_id 类型错误不被当成取消分配', () => {
  const state = assign(setupTiny(), 'staff_ka')
  const before = ok('hash_state', { state }).hash
  for (const work_id of [123, '', {}, []]) {
    const result = call('assign_staff', { state, staff_id: 'staff_ka', work_id })
    assert.equal(result.error?.code, 'INVALID_INPUT', `work_id=${JSON.stringify(work_id)}`)
    assert.equal(ok('hash_state', { state }).hash, before, '失败不得改动状态')
  }
  assert.equal(call('assign_staff', { state, staff_id: 'staff_ka' }).error?.code, 'INVALID_INPUT')
  const cleared = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: null }).state
  assert.equal(cleared.staff.find((entry) => entry.id === 'staff_ka').assignment_work_id, null)
})

test('输入边界：缺必填字段返回 INVALID_INPUT，不用默认值掩盖', () => {
  const state = setupTiny()
  const missingWeek = JSON.parse(JSON.stringify(state))
  delete missingWeek.company.week
  assert.equal(call('assign_staff', { state: missingWeek, staff_id: 'staff_dir', work_id: null }).error?.code, 'INVALID_INPUT')

  const missingTotal = JSON.parse(JSON.stringify(state))
  delete missingTotal.works[0].common.items[0].work_total
  assert.equal(call('assign_staff', { state: missingTotal, staff_id: 'staff_dir', work_id: null }).error?.code, 'INVALID_INPUT')

  // M0 §3/§14.6：Staff 报酬字段与 Finance.solvency 不得静默补默认值
  for (const field of ['signing_fee', 'weekly_salary', 'fatigue', 'morale']) {
    const missing = JSON.parse(JSON.stringify(state))
    delete missing.staff[0][field]
    assert.equal(call('assign_staff', { state: missing, staff_id: 'staff_dir', work_id: null }).error?.code, 'INVALID_INPUT')
  }
  const missingSolvency = JSON.parse(JSON.stringify(state))
  delete missingSolvency.finance.solvency.state
  assert.equal(call('assign_staff', { state: missingSolvency, staff_id: 'staff_dir', work_id: null }).error?.code, 'INVALID_INPUT')
  assert.equal(state.staff[0].project_fee, undefined)
  assert.equal(typeof state.staff[0].signing_fee, 'number')
})

test('员工 fatigue / morale 缺失时拒绝输入且不改变原状态', () => {
  const state = setupTiny()
  const before = ok('hash_state', { state }).hash
  for (const field of ['fatigue', 'morale']) {
    const bad = JSON.parse(JSON.stringify(state))
    delete bad.staff[0][field]
    for (const command of ['assign_staff', 'advance_week', 'hash_state']) {
      const result = call(command, { state: bad, staff_id: 'staff_dir', work_id: null })
      assert.equal(result.error?.code, 'INVALID_INPUT', `缺 staff.${field} 时 ${command} 应拒绝`)
    }
    assert.equal(ok('hash_state', { state }).hash, before, `缺 staff.${field} 不得改变原状态`)
  }
})

test('工作项与事件必填字段缺失不得被默认值静默修复', () => {
  let state = setupTiny(23)
  state = assign(state, 'staff_dir', 'work_01')
  const missingDeps = JSON.parse(JSON.stringify(state))
  delete missingDeps.works[0].episodes[0].stages[1].items[0].deps
  const itemResult = call('advance_week', { state: missingDeps })
  assert.equal(itemResult.error.code, 'INVALID_INPUT')
  assert.match(itemResult.error.message, /JSON 或字段类型无效/)
  assert.equal('state' in itemResult, false)

  const missingExpiry = JSON.parse(JSON.stringify(state))
  const pending = injectedEvent('work_01')
  pending.viewed = true
  pending.expires_week = 0
  delete pending.expires_week
  missingExpiry.events.pending.push(pending)
  const eventResult = call('advance_week', { state: missingExpiry })
  assert.equal(eventResult.error.code, 'INVALID_INPUT')
  assert.match(eventResult.error.message, /JSON 或字段类型无效/)
  assert.equal('state' in eventResult, false)
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

// ---- 事件 M2（#50）：内容加载、多项目仲裁、效果与不变式 ----

function pendingOf(state) {
  return state.events.pending
}

function setAnimationQuality(state, workId, value) {
  const work = state.works.find((entry) => entry.id === workId)
  for (const episode of work.episodes) {
    for (const stage of episode.stages) {
      if (stage.key !== 'animation') continue
      for (const item of stage.items) {
        for (const dim of Object.keys(item.quality)) item.quality[dim] = value
      }
    }
  }
  return state
}

test('事件内容：运行时不硬编码，内嵌目录 7 张卡且校验通过', () => {
  const info = ok('event_catalog_info', {})
  assert.equal(info.ok, true)
  assert.equal(info.count, 7)
  assert.deepEqual(info.issues, [])
  assert.deepEqual(info.ids, [
    'animator_exhaustion',
    'director_illness',
    'key_cut_rework',
    'schedule_slip',
    'station_visit',
    'storyboard_spark',
    'supplier_dunning'
  ])
})

test('事件内容：非法卡被拒绝并定位到卡片与字段', () => {
  const card = {
    schema_version: 1,
    id: 'fixture_card',
    name: '夹具卡',
    category: 'quality',
    polarity: 'negative',
    tier: 'normal',
    tag: 'fixture',
    stages: ['animation'],
    priority: 10,
    cooldown_weeks: 4,
    once_per_project: false,
    trigger: { metric: 'max_fatigue', op: '>=', threshold: 50 },
    random_weight: 0,
    expires_weeks: 0,
    description: '夹具',
    options: [
      { id: 'accept', kind: 'abandon', label: '接受', cost: 0, effects: [{ scope: 'instant', target: 'morale', value: -1 }] }
    ]
  }
  const validate = (cards, source = 'fixture.json') =>
    ok('validate_event_catalog', { source, catalog: { schema_version: 1, cards } })

  const valid = validate([card])
  assert.equal(valid.ok, true)
  assert.equal(valid.count, 1)

  const duplicate = validate([card, { ...card, name: '重复' }])
  assert.equal(duplicate.ok, false)
  assert.ok(duplicate.issues.some((issue) => issue.field === 'id' && issue.message.includes('重复')))

  const unknownTarget = validate([{ ...card, options: [{ ...card.options[0], effects: [{ scope: 'instant', target: 'luck', value: 1 }] }] }])
  assert.ok(unknownTarget.issues.some((issue) => issue.field === 'options[0].effects[0].target'))

  const fundsGain = validate([{ ...card, options: [{ ...card.options[0], effects: [{ scope: 'instant', target: 'funds', value: 100 }] }] }])
  assert.ok(fundsGain.issues.some((issue) => issue.field === 'options[0].effects[0].value'))

  const missingLabel = validate([{ ...card, options: [{ ...card.options[0], label: '' }] }])
  assert.ok(missingLabel.issues.some((issue) => issue.field === 'options[0].label'))

  const badVersion = validate([{ ...card, schema_version: 2 }])
  assert.ok(badVersion.issues.some((issue) => issue.field === 'schema_version'))

  const timed = validate([{ ...card, expires_weeks: 2 }])
  assert.equal(timed.ok, true)
  assert.equal(timed.count, 1)

  const expiry = validate([{ ...card, expires_weeks: 9 }])
  assert.ok(expiry.issues.some((issue) => issue.field === 'expires_weeks'))

  const noDefault = validate([{
    ...card,
    expires_weeks: 2,
    options: [{ ...card.options[0], kind: 'accept' }]
  }])
  assert.ok(noDefault.issues.some((issue) => issue.field === 'options' && issue.message.includes('默认分支')))

  // #121：§14.11 一次升级字段未冻结，非空配置必须拒绝加载，不能静默忽略。
  const unfrozenFields = [
    ['escalation', { description: '升级', expires_weeks: 1, options: [], timeout_option_id: 'accept' }],
    ['timeout_option_id', 'accept'],
    ['escalation_note', '需要二次处理']
  ]
  for (const [field, value] of unfrozenFields) {
    const candidate = { ...card, [field]: value }
    const runtime = validate([candidate])
    assert.ok(runtime.issues.some(
      (issue) => issue.field === field && issue.message.includes('未冻结')))
    const content = validateCard(candidate, 'fixture.json')
    assert.ok(content.some(
      (issue) => issue.field === field && issue.message.includes('未冻结')))
  }
  const nullPlaceholders = {
    ...card, escalation: null, timeout_option_id: null, escalation_note: null
  }
  assert.equal(validate([nullPlaceholders]).ok, true)
  assert.deepEqual(validateCard(nullPlaceholders, 'fixture.json'), [])

  const empty = ok('validate_event_catalog', { source: 'empty', catalog: { schema_version: 1, cards: [] } })
  assert.equal(empty.ok, false)
  assert.equal(empty.issues[0].field, 'cards')
})

function twoProjectsNearDeadline() {
  let state = ok('initialize', { seed: 5 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_a', duration_weeks: 26 }).state
  state = addIdleSupervisor(state)
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_b', duration_weeks: 26 }).state
  for (const work of state.works) work.deadline_week = 3
  state = assign(state, 'staff_dir', 'work_a')
  state = assign(state, 'staff_ka', 'work_b')
  return setAnimationQuality(setAnimationQuality(state, 'work_a', 50), 'work_b', 50)
}

test('事件仲裁：两个项目同周各自触发，互不覆盖，处理前阻塞推进', () => {
  let state = twoProjectsNearDeadline()
  const advanced = ok('advance_week', { state })
  state = advanced.state
  assert.equal(advanced.report.events.drawn, true)
  assert.equal(advanced.report.events.count, 2)
  assert.equal(pendingOf(state).length, 2)
  assert.deepEqual(pendingOf(state).map((event) => event.work_id).sort(), ['work_a', 'work_b'])
  assert.ok(pendingOf(state).every((event) => event.event_id === 'schedule_slip'))

  const blocked = call('advance_week', { state })
  assert.equal(blocked.error.code, 'INVALID_PHASE')
  assert.ok(blocked.error.message.includes('2'))

  // M0 命令 18：work_id 必填，省略即拒绝
  const ambiguous = call('resolve_event', { state, event_id: 'schedule_slip', option_id: 'accept' })
  assert.equal(ambiguous.error.code, 'INVALID_INPUT')
  assert.ok(ambiguous.error.message.includes('work_id'))

  const resolvedA = ok('resolve_event', { state, event_id: 'schedule_slip', option_id: 'accept', work_id: 'work_a' }).state
  assert.equal(pendingOf(resolvedA).length, 1)
  assert.equal(pendingOf(resolvedA)[0].work_id, 'work_b')
  assert.equal(resolvedA.events.per_work.work_a.cooldowns.schedule_slip, resolvedA.company.week + 4)
  assert.ok(call('advance_week', { state: resolvedA }).error)

  // 效果只作用于归属项目：A 的动画阶段质量 -3，B 保持 50
  const aQuality = findItem(resolvedA, 'work_a', 'ep01.inbetween').quality
  const bQuality = findItem(resolvedA, 'work_b', 'ep01.inbetween').quality
  assert.equal(aQuality.story, 47)
  assert.equal(bQuality.story, 50)

  const resolvedB = ok('resolve_event', { state: resolvedA, event_id: 'schedule_slip', option_id: 'accept', work_id: 'work_b' }).state
  assert.equal(pendingOf(resolvedB).length, 0)
  const next = ok('advance_week', { state: resolvedB })
  assert.equal(next.state.company.week, resolvedB.company.week + 1)
})

test('事件仲裁：重大事件同项目只触发一次，之后让位给普通事件', () => {
  let state = ok('initialize', { seed: 9 }).state
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_01', duration_weeks: 26 }).state
  for (const member of state.staff) member.fatigue = 70
  state = assign(state, 'staff_dir')
  const first = ok('advance_week', { state }).state
  assert.equal(pendingOf(first).length, 1)
  assert.equal(pendingOf(first)[0].event_id, 'director_illness')

  const resolved = ok('resolve_event', {
    state: first,
    event_id: 'director_illness',
    option_id: 'accept',
    work_id: 'work_01'
  }).state
  assert.deepEqual(resolved.events.per_work.work_01.major_seen, ['director_illness'])
  assert.equal(pendingOf(resolved).length, 0)

  const second = ok('advance_week', { state: resolved }).state
  assert.equal(pendingOf(second).length, 1)
  assert.equal(pendingOf(second)[0].event_id, 'animator_exhaustion')
})

test('事件不变式：同一项目多条待处理、归属无效都被拒绝', () => {
  let state = twoProjectsNearDeadline()
  state = ok('advance_week', { state }).state
  assert.equal(pendingOf(state).length, 2)

  const duplicate = JSON.parse(JSON.stringify(state))
  duplicate.events.pending.push({
    ...duplicate.events.pending[0],
    event_id: 'key_cut_rework',
    options: [{ id: 'accept', label: '接受', kind: 'abandon', risk_hint: '', cost: 0 }]
  })
  const duplicateResult = call('assign_staff', { state: duplicate, staff_id: 'staff_dir', work_id: 'work_a' })
  assert.equal(duplicateResult.error?.code, 'INVALID_STATE')
  assert.ok(duplicateResult.error.message.includes('INV-23'))

  const orphan = JSON.parse(JSON.stringify(state))
  orphan.events.pending[0].work_id = 'work_missing'
  const orphanResult = call('assign_staff', { state: orphan, staff_id: 'staff_dir', work_id: 'work_a' })
  assert.equal(orphanResult.error?.code, 'INVALID_STATE')
})

test('INV-23：查看只标记目标事件，不结算不移除；全部查看后允许推进', () => {
  let state = twoProjectsNearDeadline()
  state = ok('advance_week', { state }).state
  assert.equal(state.events.pending.length, 2)
  assert.ok(state.events.pending.every((event) => event.viewed === false))
  assert.equal(call('advance_week', { state }).error.code, 'INVALID_PHASE')

  const viewedA = ok('view_event', { state, work_id: 'work_a', event_id: 'schedule_slip' })
  assert.equal(viewedA.already_viewed, false)
  state = viewedA.state
  assert.equal(state.events.pending.length, 2)
  assert.equal(state.events.pending.find((e) => e.work_id === 'work_a').viewed, true)
  assert.equal(state.events.pending.find((e) => e.work_id === 'work_b').viewed, false)
  // 已查看未处理仍保留，但推进被另一条未查看事件挡住
  assert.equal(call('advance_week', { state }).error.code, 'INVALID_PHASE')

  const again = ok('view_event', { state, work_id: 'work_a', event_id: 'schedule_slip' })
  assert.equal(again.already_viewed, true)

  state = ok('view_event', { state, work_id: 'work_b', event_id: 'schedule_slip' }).state
  const advanced = ok('advance_week', { state })
  assert.equal(advanced.state.company.week, state.company.week + 1)
  assert.equal(advanced.state.events.pending.length, 2)   // 查看不等于处理
})

function timedEventState() {
  let state = setupTiny(17)
  state.works[0].deadline_week = 3
  state = assign(state, 'staff_dir', 'work_01')
  state = ok('advance_week', { state }).state
  const event = state.events.pending.find((entry) => entry.event_id === 'schedule_slip')
  event.viewed = true
  event.expires_week = state.company.week
  event.options[0].cost = 123
  event.options[0].effects = [{ scope: 'stage', target: 'quality', stage: 'storyboard_key_animation', value: -7 }]
  const storyboard = findItem(state, 'work_01', 'ep01.storyboard')
  for (const dim of Object.keys(storyboard.quality)) storyboard.quality[dim] = 50
  return state
}

// 直接把现金压到目标值，同时保持 INV-16（余额 = 期初 + 流水合计）。
function forceCash(state, target) {
  const sum = state.finance.entries.reduce((acc, entry) => acc + entry.amount, 0)
  state.finance.opening_funds = target - sum
  state.finance.balance = target
  return state
}

function terminalEvent(workId, options = {}) {
  const { cost = 0, kind = 'abandon', eventId = 'terminal_fixture' } = options
  return {
    event_id: eventId,
    name: '终局夹具事件',
    work_id: workId,
    triggered_week: 0,
    expires_week: null,
    cooldown_weeks: 0,
    once_per_project: false,
    viewed: true,
    options: [{ id: 'accept', label: '保守处理', kind, risk_hint: '', cost, effects: [] }]
  }
}

function terminalPendingState() {
  const state = startedContract()
  state.events.pending.push(terminalEvent('work_01'))
  return state
}

test('INV-29：未到期事件保留，不提前应用默认分支', () => {
  const state = timedEventState()
  state.events.pending[0].expires_week = state.company.week + 1
  const result = ok('advance_week', { state })
  assert.equal(result.state.events.pending.length, 1)
  assert.deepEqual(result.report.events.expired, [])
  assert.equal(findItem(result.state, 'work_01', 'ep01.storyboard').quality.story, 50)
  assert.equal(result.state.finance.entries.filter((entry) => entry.category === 'events').length, 0)
})

test('INV-29：到期只执行一次 abandon 快照并进入 Finance 流水', () => {
  const state = timedEventState()
  const result = ok('advance_week', { state })
  assert.equal(result.state.events.pending.length, 0)
  assert.deepEqual(result.report.events.expired, [{
    work_id: 'work_01', event_id: 'schedule_slip', option_id: 'accept', automatic: true
  }])
  assert.equal(findItem(result.state, 'work_01', 'ep01.storyboard').quality.story, 43)
  const charged = result.state.finance.entries.filter((entry) => entry.category === 'events')
  assert.equal(charged.length, 1)
  assert.equal(charged[0].id, `w${state.company.week}.event.schedule_slip.work_01`)
  assert.equal(charged[0].amount, -123)
  assert.equal(result.state.events.per_work.work_01.cooldowns.schedule_slip, state.company.week + 4)
  const again = ok('advance_week', { state: result.state })
  assert.equal(again.state.finance.entries.filter((entry) => entry.category === 'events' && entry.memo === 'schedule_slip').length, 1)
})

test('INV-29：多项目按 work_id/event_id 稳定到期，其他 pending 不丢失', () => {
  let state = ok('initialize', { seed: 17 }).state
  state = addIdleSupervisor(state, 'staff_pm')
  state = addIdleSupervisor(state, 'staff_pm2')
  for (const workId of ['work_a', 'work_b', 'work_c']) {
    state = ok('instantiate_work', { state, blueprint: tiny, work_id: workId, duration_weeks: 26 }).state
    state.works.find((work) => work.id === workId).deadline_week = 3
  }
  state = assign(state, 'staff_dir', 'work_a')
  state = assign(state, 'staff_pm', 'work_b')
  state = assign(state, 'staff_pm2', 'work_c')
  state = ok('advance_week', { state }).state
  assert.equal(state.events.pending.length, 3)
  for (const event of state.events.pending) {
    event.viewed = true
    event.expires_week = state.company.week
    event.options[0].cost = 1
    event.options[0].effects = []
  }
  state.events.pending.find((event) => event.work_id === 'work_a').event_id = 'z_due'
  state.events.pending.find((event) => event.work_id === 'work_b').event_id = 'future'
  state.events.pending.find((event) => event.work_id === 'work_c').event_id = 'a_due'
  state.events.pending.find((event) => event.work_id === 'work_b').expires_week = state.company.week + 1
  const result = ok('advance_week', { state })
  assert.deepEqual(result.report.events.expired.map((entry) => [entry.work_id, entry.event_id]), [
    ['work_a', 'z_due'], ['work_c', 'a_due']
  ])
  assert.ok(result.state.events.pending.some((entry) => entry.work_id === 'work_b' && entry.event_id === 'future'))
  assert.ok(result.state.events.pending.every((entry) => !['z_due', 'a_due'].includes(entry.event_id)))
  assert.deepEqual(result.state.finance.entries.filter((entry) => entry.category === 'events').map((entry) => entry.id), [
    `w${state.company.week}.event.z_due.work_a`,
    `w${state.company.week}.event.a_due.work_c`
  ])
})

test('INV-29：自动默认分支成本按现金封顶，余额不为负', () => {
  const state = timedEventState()
  forceCash(state, 900000)
  state.events.pending[0].options[0].cost = 2000000
  const weeklyCost = state.staff.reduce((sum, member) => sum + member.weekly_salary, 0) + 30000 + 60000
  const remaining = state.finance.balance - weeklyCost
  const result = ok('advance_week', { state })
  assert.equal(result.state.finance.balance, 0)
  assert.equal(result.state.finance.entries.find((entry) => entry.category === 'events').amount, -remaining)
  assert.ok(result.state.finance.loans.length === 0)
  assert.equal(result.state.finance.solvency.state, 'normal')
})

test('INV-29：阶段 8 校验失败不返回半结算，阶段 6 守卫先于到期处理', () => {
  const state = timedEventState()
  const duplicate = JSON.parse(JSON.stringify(state.finance.entries.at(-1)))
  duplicate.id = `w${state.company.week}.event.schedule_slip.work_01`
  state.finance.entries.push(duplicate)
  state.finance.balance += duplicate.amount
  const before = ok('hash_state', { state }).hash
  const failed = call('advance_week', { state })
  assert.equal(failed.error.code, 'INTERNAL_ERROR')
  assert.ok(failed.error.message.includes('阶段 8'))
  assert.equal('state' in failed, false)
  assert.equal(ok('hash_state', { state }).hash, before)

  const deliveryFirst = timedEventState()
  deliveryFirst.works[0].deadline_week = deliveryFirst.company.week + 1
  const blocked = call('advance_week', { state: deliveryFirst })
  assert.equal(blocked.error.code, 'INVALID_PHASE')
  assert.ok(blocked.error.message.includes('阶段 6'))
  assert.equal('state' in blocked, false)
})

test('事件确定性：同 seed 同操作，待处理事件与哈希一致', () => {
  const run = () => {
    let state = twoProjectsNearDeadline()
    const advanced = ok('advance_week', { state })
    return {
      pending: advanced.state.events.pending,
      hash: ok('hash_state', { state: advanced.state }).hash
    }
  }
  assert.deepEqual(run(), run())
})

test('事件快照：选项效果冻结在 pending，JSON 往返后仍按触发时效果结算', () => {
  let state = twoProjectsNearDeadline()
  state = ok('advance_week', { state }).state
  const event = state.events.pending.find((entry) => entry.work_id === 'work_a')
  assert.equal(event.name, '作画进度落后')
  const option = event.options.find((entry) => entry.id === 'accept')
  assert.equal(option.effects.length, 1)
  // 模拟内容卡改版：把快照里的 -3 改成 -20。若 resolve 回查目录，仍会是 -3。
  option.effects[0].value = -20

  const loaded = JSON.parse(JSON.stringify(state))
  const resolved = ok('resolve_event', {
    state: loaded,
    work_id: 'work_a',
    event_id: 'schedule_slip',
    option_id: 'accept'
  }).state
  const quality = findItem(resolved, 'work_a', 'ep01.inbetween').quality
  assert.equal(quality.story, 30)

  // 存档往返后，未处理项目的 pending 仍保留完整效果载荷。
  assert.equal(resolved.events.pending.length, 1)
  const remaining = resolved.events.pending.find((entry) => entry.work_id === 'work_b')
  assert.notEqual(remaining, undefined)
  assert.ok(remaining.options.length > 0)
  assert.ok(remaining.options[0].effects.length > 0)
})

test('事件结算：选项 cost 与 funds 效果同周入账时账本 id 不冲突', () => {
  let state = twoProjectsNearDeadline()
  state = ok('advance_week', { state }).state
  const event = state.events.pending.find((entry) => entry.work_id === 'work_a')
  const option = event.options.find((entry) => entry.id === 'accept')
  // 内容卡允许 cost 与 funds 效果并存（#13 可写出「赔款 + 加急费」类选项），
  // 两条流水必须各有 id，否则 INV-02 判定状态非法、结算直接回滚。
  option.cost = 300
  option.effects.push({ scope: 'instant', target: 'funds', stage: '', value: -1000 })

  const before = ok('hash_state', { state: JSON.parse(JSON.stringify(state)) }).hash
  const resolved = ok('resolve_event', {
    state: JSON.parse(JSON.stringify(state)),
    work_id: 'work_a',
    event_id: 'schedule_slip',
    option_id: 'accept'
  }).state
  assert.notEqual(before, ok('hash_state', { state: resolved }).hash)

  const charged = resolved.finance.entries.filter((entry) => entry.category === 'events' && entry.memo === 'schedule_slip')
  assert.equal(charged.length, 2)
  assert.deepEqual(charged.map((entry) => entry.amount).sort((a, b) => a - b), [-1000, -300])
  assert.equal(new Set(charged.map((entry) => entry.id)).size, 2)
  // 事件支出不得让现金转负，也不得改到另一条 pending
  assert.ok(resolved.finance.balance >= 0)
  assert.equal(resolved.events.pending.length, 1)
})

// ---- M2 项目全链路 + M4 委员会/渠道结算 ----

function completeWork(state, workId, quality = 80, gatesOnly = false) {
  const work = state.works.find((entry) => entry.id === workId)
  // 公共层现在参与全片质量（200‰），夹具也要给它质量，否则作品分被 0 拉低。
  if (!gatesOnly) {
    for (const item of work.common.items) {
      for (const dim of Object.keys(item.quality)) item.quality[dim] = quality
    }
  }
  for (const episode of work.episodes) {
    for (const stage of episode.stages) {
      for (const item of stage.items) {
        if (item.is_gate) item.work_done = item.work_total
        if (!gatesOnly) {
          for (const dim of Object.keys(item.quality)) item.quality[dim] = quality
        }
      }
    }
  }
  return state
}

test('M2 立项：承制模式消费企划、合同预算入账、项目按蓝图实例化', () => {
  let state = ok('initialize', { seed: 7 }).state
  assert.equal(state.market.slots.length, 4)
  const before = state.finance.balance
  const started = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' })
  state = started.state
  assert.equal(started.work_id, 'work_01')
  assert.equal(started.committee_id, null)
  assert.equal(state.market.slots.length, 3)
  assert.equal(state.works.length, 1)
  const work = state.works[0]
  assert.equal(work.mode, 'contract')
  assert.deepEqual(work.channels, ['domestic_streaming', 'tv'])
  assert.equal(work.offer.id, 'offer_01')
  assert.equal(work.deadline_week, 52)
  assert.equal(work.episodes.length, 10)
  assert.equal(work.common.items.length + work.episodes.reduce((sum, ep) => sum + ep.stages.reduce((n, st) => n + st.items.length, 0), 0), 125)
  assert.equal(state.finance.balance, before + 170000000)
  assert.equal(state.finance.entries.length, 1)
  assert.equal(state.finance.entries[0].category, 'contract_received')
  assert.equal(state.finance.opening_funds + state.finance.entries.reduce((sum, e) => sum + e.amount, 0), state.finance.balance)
})

test('M2 立项：委员会模式成立委员会、支付投资份额、成员渠道映射', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  const before = state.finance.balance
  const started = ok('start_work', {
    state,
    offer_id: 'offer_01',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  })
  state = started.state
  assert.equal(started.committee_id, 'committee_01')
  assert.equal(state.finance.balance, before)   // +170M 合同预算 -170M 投资
  assert.equal(state.finance.entries.length, 2)
  assert.equal(state.finance.entries[1].category, 'investment_paid')
  assert.equal(state.finance.entries[1].amount, -170000000)
  const committee = state.committees[0]
  assert.equal(committee.status, 'active')
  assert.equal(committee.members.length, 2)
  assert.deepEqual(committee.members.map((m) => m.channel).sort(), ['domestic_streaming', 'tv'])
  assert.equal(state.works[0].investment.percent, 50)

  // 已有电视台成员：默认获得播出曝光，不得再付费购买
  const blocked = call('buy_tv_service', { state, work_id: 'work_01' })
  assert.equal(blocked.error.code, 'MODE_NOT_ALLOWED')

  // 无电视台成员：玩家按投资比例承担电视服务总费用
  state = addIdleSupervisor(state)
  const second = ok('start_work', {
    state,
    offer_id: 'offer_02',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_stream', 'partner_pub']
  })
  assert.equal(second.state.finance.balance, before)
  const withTv = ok('buy_tv_service', { state: second.state, work_id: second.work_id })
  assert.equal(withTv.paid, 300000)   // 60 万 × 50%
  assert.equal(withTv.state.finance.balance, before - 300000)
  assert.equal(withTv.state.works.find((w) => w.id === second.work_id).tv_service.multiplier, 1300)
  const extended = ok('request_extension', { state: withTv.state, work_id: second.work_id })
  assert.equal(extended.state.works.find((w) => w.id === second.work_id).deadline_week, 56)
  assert.equal(extended.state.finance.balance, before - 550000)
  const twice = call('request_extension', { state: extended.state, work_id: second.work_id })
  assert.equal(twice.error.code, 'INVALID_PHASE')
})

test('D-07：延期原子同步本项目临时合同 end_week，失败不改写合同', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = addIdleSupervisor(state)
  const started = ok('start_work', {
    state,
    offer_id: 'offer_02',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_stream', 'partner_pub']
  })
  state = started.state
  const addTemporary = (sourceId, id, workId) => {
    const member = structuredClone(state.staff.find((entry) => entry.id === sourceId))
    member.id = id
    member.name = id
    forceTemporary(member)
    member.assignment_work_id = workId
    member.temporary_contract = { work_id: workId, start_week: 0, end_week: 52 }
    state.staff.push(member)
  }
  addTemporary('staff_ka', 'temp_ka_02', started.work_id)
  addTemporary('staff_post', 'temp_post_02', started.work_id)
  addTemporary('staff_anim', 'temp_anim_01', 'work_01')

  const poor = structuredClone(state)
  const balance = poor.finance.balance
  poor.finance.entries.push({
    id: 'manual.cash.drain', week: 0, work_id: null, category: 'production', amount: -balance, memo: 'fixture'
  })
  poor.finance.balance = 0
  const before = ok('hash_state', { state: poor }).hash
  const failed = call('request_extension', { state: poor, work_id: started.work_id })
  assert.equal(failed.error.code, 'INSUFFICIENT_FUNDS')
  assert.equal('state' in failed, false)
  assert.equal(ok('hash_state', { state: poor }).hash, before)

  const extended = ok('request_extension', { state, work_id: started.work_id })
  assert.equal(extended.state.works.find((work) => work.id === started.work_id).deadline_week, 56)
  assert.equal(extended.state.staff.find((member) => member.id === 'temp_ka_02').temporary_contract.end_week, 56)
  assert.equal(extended.state.staff.find((member) => member.id === 'temp_post_02').temporary_contract.end_week, 56)
  assert.equal(extended.state.staff.find((member) => member.id === 'temp_anim_01').temporary_contract.end_week, 52)
})

test('M2 交付：门槛未达拒绝；达标后结算、归档、清归属、移除项目', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = assign(state, 'staff_dir')
  const early = call('deliver_work', { state, work_id: 'work_01' })
  assert.equal(early.error.code, 'GATE_UNMET')
  assert.equal(early.error.items.length, 10)

  state = completeWork(state, 'work_01', 70)
  // 让团队快照有内容：真实流程里由周结算写入 contributors。
  const firstCommon = state.works[0].common.items[0]
  firstCommon.work_done = firstCommon.work_total
  firstCommon.contributors = ['staff_dir']
  const delivered = ok('deliver_work', { state, work_id: 'work_01' })
  assert.equal(delivered.report.rating, 'B')
  // 承制只拿 BD/DVD，BD 收入未达合同预算，不触发成功奖励
  assert.equal(delivered.report.success_reward, 0)
  assert.ok(delivered.report.bd_gross > 0)
  assert.equal(delivered.report.bd_revenue, Math.floor(delivered.report.bd_gross / 2))
  assert.equal(delivered.report.commercial_revenue, delivered.report.bd_gross)
  assert.equal(delivered.state.archive.works.length, 1)
  assert.equal(delivered.state.works.length, 0)
  assert.equal(delivered.state.staff.find((s) => s.id === 'staff_dir').assignment_work_id, null)
  assert.equal(delivered.state.company.reputation, 102)
  assert.equal(delivered.state.finance.balance, 184000000 + delivered.report.bd_revenue)
  const record = delivered.state.archive.works[0]
  assert.equal(record.id, 'work_01')
  assert.equal(record.mode, 'contract')
  assert.equal(record.finance_summary.contract_received, 170000000)
  assert.equal(record.finance_summary.success_reward, 0)
  assert.equal(record.finance_summary.bd_revenue, delivered.report.bd_revenue)
  assert.equal(record.finance_summary.commercial_share, delivered.report.bd_revenue)
  assert.equal(record.channel_breakdown.reduce((sum, line) => sum + line.revenue, 0), record.commercial_revenue)
  assert.equal(record.channel_breakdown.reduce((sum, line) => sum + line.company_received, 0), record.finance_summary.commercial_share)
  assert.equal(record.team.length, 1)
  assert.equal(delivered.state.finance.opening_funds + delivered.state.finance.entries.reduce((sum, e) => sum + e.amount, 0), delivered.state.finance.balance)
})

test('M4 交付：委员会按投资比例分账、关闭委员会并沉淀伙伴关系', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state = ok('start_work', {
    state,
    offer_id: 'offer_01',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  }).state
  state = completeWork(state, 'work_01', 80)
  const delivered = ok('deliver_work', { state, work_id: 'work_01' })
  const report = delivered.report
  // 委员会只对扣除代理费后的净商业池按比例分账；BD 始终归公司，不进池。
  assert.equal(report.commercial_share, Math.floor(report.committee_pool * 50 / 100))
  assert.equal(report.investor_share, report.committee_pool - report.commercial_share)
  assert.ok(report.bd_revenue > 0)
  assert.equal(report.company_received, report.bd_revenue + report.commercial_share)
  assert.equal(report.success_reward, 0)
  const poolLines = report.channels.filter((line) => line.owner === 'committee_pool')
  const bdLines = report.channels.filter((line) => line.owner === 'company')
  assert.equal(poolLines.reduce((sum, line) => sum + line.net, 0), report.committee_pool)
  assert.equal(bdLines.reduce((sum, line) => sum + line.net, 0), report.bd_revenue)
  for (const line of report.channels) {
    const expectedNet = line.window === 'bd_dvd'
      ? Math.floor(line.gross / 2)
      : Math.floor(line.gross * (1000 - line.agency_fee_permille) / 1000)
    assert.equal(line.net, expectedNet)
  }
  assert.equal(report.channels.length, 3)   // 国内配信 / 电视 / BD
  assert.equal(delivered.state.committees[0].status, 'closed')
  assert.equal(delivered.state.committees[0].closed_week, 0)
  for (const id of ['partner_tv', 'partner_stream']) {
    const partner = delivered.state.partners.find((p) => p.id === id)
    assert.equal(partner.relationship, 52)
    assert.equal(partner.history.length, 1)
    assert.equal(partner.history[0].delta, 2)
  }
  assert.equal(delivered.state.partners.find((p) => p.id === 'partner_pub').relationship, 50)
  const record = delivered.state.archive.works[0]
  assert.equal(record.mode, 'committee')
  assert.equal(record.investment_percent, 50)
  assert.equal(record.finance_summary.commercial_share, report.commercial_share + report.bd_revenue)
  assert.equal(record.finance_summary.bd_revenue, report.bd_revenue)
  assert.equal(record.channel_breakdown.reduce((sum, line) => sum + line.revenue, 0), record.commercial_revenue)
  assert.equal(record.channel_breakdown.reduce((sum, line) => sum + line.company_received, 0), record.finance_summary.commercial_share)
})

function injectedEvent(workId) {
  return {
    event_id: 'schedule_slip',
    name: '作画进度落后',
    work_id: workId,
    triggered_week: 0,
    expires_week: null,
    cooldown_weeks: 4,
    once_per_project: false,
    viewed: false,
    options: [{
      id: 'accept',
      label: '维持原计划',
      kind: 'abandon',
      risk_hint: '',
      cost: 0,
      effects: [{ scope: 'stage', target: 'quality', stage: 'animation', value: -3 }]
    }]
  }
}

test('DEC-EVENT-001：待处理事件阻止交付与关闭，跨项目事件不被清理', () => {
  let state = twoProjectsNearDeadline()
  state.events.pending.push(injectedEvent('work_a'), injectedEvent('work_b'))
  const prepared = completeWork(JSON.parse(JSON.stringify(state)), 'work_a', 70)

  const blocked = call('deliver_work', { state: prepared, work_id: 'work_a' })
  assert.equal(blocked.error.code, 'INVALID_PHASE')
  assert.equal(prepared.events.pending.length, 2)
  assert.equal(call('end_company', { state: prepared }).error.code, 'INVALID_PHASE')

  const afterA = ok('resolve_event', {
    state: prepared,
    work_id: 'work_a',
    event_id: 'schedule_slip',
    option_id: 'accept'
  }).state
  assert.equal(afterA.events.pending.length, 1)

  const delivered = ok('deliver_work', { state: afterA, work_id: 'work_a' })
  assert.equal(delivered.state.events.pending.length, 1)
  assert.equal(delivered.state.events.pending[0].work_id, 'work_b')
  assert.deepEqual(delivered.state.works.map((work) => work.id), ['work_b'])
})

function setProjectProgress(state, workId, done) {
  let remaining = done
  for (const item of allItems(state, workId)) {
    const amount = Math.min(item.work_total, remaining)
    item.work_done = amount
    remaining -= amount
  }
  assert.equal(remaining, 0)
  return state
}

test('DEC-PROJECT-001：中止 50% 收 15% 违约金、顶格声望重罚并归档', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = assign(state, 'staff_dir')
  const items = allItems(state, 'work_01')
  if (items.reduce((sum, item) => sum + item.work_total, 0) % 2 !== 0) items[0].work_total += 1
  const total = items.reduce((sum, item) => sum + item.work_total, 0)
  state = setProjectProgress(state, 'work_01', total / 2)
  const balance = state.finance.balance
  const expectedPenalty = state.works[0].offer.contract_budget * 150 / 1000
  const result = ok('abort_work', { state, work_id: 'work_01' })

  assert.equal(result.report.penalty, expectedPenalty)
  assert.equal(result.report.contract_refund, 0)
  assert.equal(result.state.finance.balance, balance - expectedPenalty)
  assert.equal(result.state.company.reputation, 0)
  assert.equal(result.state.works.length, 0)
  assert.equal(result.state.staff.find((member) => member.id === 'staff_dir').assignment_work_id, null)
  const record = result.state.archive.works[0]
  assert.equal(record.status, 'ABORTED')
  assert.equal(record.end_reason, 'aborted')
  assert.equal(record.aborted_week, record.end_week)
  assert.equal(record.penalty_paid, expectedPenalty)
  assert.equal(record.finance_summary.contract_refund, 0)
  assert.equal(record.commercial_revenue, 0)
  assert.equal(result.state.archive.series.length, 0)
  assert.equal(result.state.finance.entries.find((entry) => entry.category === 'contract_refund'), undefined)
})

test('DEC-PROJECT-001：超过 50% 按未完成进度退款且不收违约金', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  const total = allItems(state, 'work_01').reduce((sum, item) => sum + item.work_total, 0)
  state = setProjectProgress(state, 'work_01', Math.floor(total / 2) + 1)
  const balance = state.finance.balance
  const expectedRefund = Math.floor(state.works[0].offer.contract_budget * (total - Math.floor(total / 2) - 1) / total)
  const result = ok('abort_work', { state, work_id: 'work_01' })

  assert.equal(result.report.penalty, 0)
  assert.equal(result.report.contract_refund, expectedRefund)
  assert.equal(result.state.finance.balance, balance + expectedRefund)
  assert.equal(result.state.archive.works[0].finance_summary.contract_refund, expectedRefund)
  assert.equal(result.state.finance.entries.find((entry) => entry.category === 'contract_refund').amount, expectedRefund)
})

test('DEC-PROJECT-001：委员会中止只核销沉没成本并零增量关闭合作', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state = ok('start_work', {
    state, offer_id: 'offer_02', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_stream']
  }).state
  const investment = state.works[0].investment.paid
  const balance = state.finance.balance
  const relationship = state.partners.find((partner) => partner.id === 'partner_stream').relationship
  const result = ok('abort_work', { state, work_id: 'work_01' })

  assert.equal(result.report.penalty, 0)
  assert.equal(result.report.contract_refund, 0)
  assert.equal(result.state.finance.balance, balance)
  assert.equal(result.state.archive.works[0].finance_summary.investment_paid, investment)
  assert.equal(result.state.committees[0].status, 'closed')
  const partner = result.state.partners.find((entry) => entry.id === 'partner_stream')
  assert.equal(partner.relationship, relationship)
  assert.equal(partner.history.at(-1).delta, 0)
})

test('INV-01：临时员工周薪与签约费必须按 DEC-STAFF-009 公式推导', () => {
  const base = ok('initialize', { seed: 42 }).state
  const index = base.recruitment.pool.findIndex((candidate) => candidate.origin === 'temporary')
  const card = structuredClone(base.recruitment.pool[index].staff)
  base.recruitment.pool.splice(index, 1)
  base.staff.push(card)

  const cheap = structuredClone(base)
  cheap.staff.at(-1).weekly_salary = 1000
  assert.equal(call('advance_week', { state: cheap }).error?.code, 'INVALID_STATE', '低价临时工必须被拒绝')

  const badSigning = structuredClone(base)
  badSigning.staff.at(-1).signing_fee = 1
  assert.equal(call('advance_week', { state: badSigning }).error?.code, 'INVALID_STATE')

  const badRole = structuredClone(base)
  badRole.staff.at(-1).role = 'key_animator'
  assert.equal(call('advance_week', { state: badRole }).error?.code, 'INVALID_STATE', '临时员工职业必须是八职业之一')
})

test('DEC-QUALITY-001：Q_min 未达标按 2%/分扣罚、扣声望与委员会好感', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state = ok('start_work', {
    state, offer_id: 'offer_01', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  }).state
  state = completeWork(state, 'work_01', 40)   // 六维质量统一 40，低于 Q_min 65
  const reputationBefore = state.company.reputation
  const delivered = ok('deliver_work', { state, work_id: 'work_01' })
  const settlement = delivered.report
  assert.equal(settlement.q_min, 65)
  assert.ok(settlement.quality_score < 65)
  const expected = Math.floor(170000000 * Math.min(300, (65 - settlement.quality_score) * 20) / 1000)
  assert.equal(settlement.quality_gap, 65 - settlement.quality_score)
  assert.equal(settlement.quality_penalty, expected)
  assert.equal(settlement.penalty, expected, '未强制交付时不该有完成度扣罚')
  assert.equal(delivered.state.archive.works[0].finance_summary.penalty, expected)
  // 声望：评级扣分 + Q_min 缺省 5 点
  const qualityLog = delivered.state.company.reputation_log.find((entry) => entry.reason.includes('Q_min'))
  assert.ok(qualityLog, '应写一条 Q_min 声望记录')
  assert.equal(qualityLog.delta, -5)
  assert.ok(delivered.state.company.reputation < reputationBefore)
  // 委员会：额外 -2 好感度（评级 D 本身 -2，合计 -4）
  const partner = delivered.state.partners.find((entry) => entry.id === 'partner_tv')
  assert.equal(partner.history.at(-1).delta, -4)
})

test('DEC-QUALITY-001：质量达标时不产生质量扣罚', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 90)
  const firstCommon = state.works[0].common.items[0]
  firstCommon.work_done = firstCommon.work_total
  firstCommon.contributors = ['staff_dir']
  const delivered = ok('deliver_work', { state, work_id: 'work_01' })
  assert.equal(delivered.report.q_min, 65)
  assert.ok(delivered.report.quality_score >= 65)
  assert.equal(delivered.report.quality_penalty, 0)
  assert.equal(delivered.report.penalty, 0)
})

test('DEC-PROJECT-001：中止解绑临时员工、释放外包产能并保留团队履历', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  const temporary = forceTemporary(state.staff.find((member) => member.id === 'staff_ka'))
  temporary.temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 52 }
  temporary.assignment_work_id = 'work_01'
  state = assign(state, 'staff_ka')
  const item = allItems(state, 'work_01').find((entry) =>
    !entry.id.includes('.common.') && !entry.is_gate && entry.outsourceable)
  const episode = state.works[0].episodes.find((entry) =>
    entry.stages.some((stage) => stage.items.some((candidate) => candidate.id === item.id)))
  item.work_done = 1
  item.contributors.push('staff_ka')
  state.suppliers = [{
    id: 'supplier_abort', name: '中止协力供应商', specialties: [item.ability], capacity_per_week: 10,
    quality: 70, speed: 60, price_per_unit: 40, reliability: 80, unlocked_week: 0
  }]
  state.contracts.push({
    id: 'outsource_abort', supplier_id: 'supplier_abort', work_id: 'work_01', episode_id: episode.id, item_id: item.id,
    ability: item.ability, mode: 'normal', work_total: 10, work_done: 0, weekly_cap: 5,
    fee_total: 1000, fee_paid: 0, signed_week: 0, due_week: 2, status: 'active'
  })
  const result = ok('abort_work', { state, work_id: 'work_01' })
  assert.equal(result.state.staff.some((member) => member.id === 'staff_ka'), false)
  assert.equal(result.state.contracts.length, 0)
  assert.ok(result.state.archive.works[0].team.some((member) => member.id === 'staff_ka'))
})

test('DEC-PROJECT-001：中止负余额复用破产关闭且保持原子结算', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  const balance = state.finance.balance
  state.finance.entries.push({ id: 'manual.cash.drain', week: 0, work_id: null, category: 'production', amount: -balance, memo: 'fixture' })
  state.finance.balance = 0
  const result = ok('abort_work', { state, work_id: 'work_01' })
  assert.equal(result.report.company_end_reason, 'bankrupt')
  assert.equal(result.state.company.status, 'ended')
  assert.equal(result.state.company.end_reason, 'bankrupt')
  assert.equal(result.state.finance.balance, -(state.works[0].offer.contract_budget * 150 / 1000))
  assert.equal(result.state.archive.works.length, 1)
})

test('DEC-PROJECT-001：中止破产先结清其他项目 pending 再复用关闭路径', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = addIdleSupervisor(state)
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_02', duration_weeks: 26 }).state
  state.events.pending.push(injectedEvent('work_02'))
  const balance = state.finance.balance
  state.finance.entries.push({ id: 'manual.cash.drain', week: 0, work_id: null, category: 'production', amount: -balance, memo: 'fixture' })
  state.finance.balance = 0

  const aborted = ok('abort_work', { state, work_id: 'work_01' })
  assert.equal(aborted.report.company_end_reason, 'bankrupt')
  assert.equal(aborted.state.company.status, 'closing')
  assert.equal(aborted.state.company.end_reason, 'bankrupt')
  assert.equal(aborted.state.events.pending.length, 0)
  assert.deepEqual(aborted.state.works.map((work) => [work.id, work.status]), [['work_02', 'delivering']])
  assert.equal(aborted.state.archive.works.length, 1)

  const finalizedDelivery = ok('finalize_delivery', { state: aborted.state, work_id: 'work_02' })
  assert.equal(finalizedDelivery.state.company.status, 'ended')
  assert.equal(finalizedDelivery.state.archive.works.length, 2)
  const finalizedCompany = ok('finalize_company', { state: finalizedDelivery.state })
  assert.equal(finalizedCompany.state.archive.company_result.reason, 'bankrupt')
})

test('DEC-PROJECT-001：pending 与非法阶段中止原子拒绝', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state.events.pending.push(injectedEvent('work_01'))
  const hash = ok('hash_state', { state }).hash
  assert.equal(call('abort_work', { state, work_id: 'work_01' }).error.code, 'INVALID_PHASE')
  assert.equal(ok('hash_state', { state }).hash, hash)
  assert.equal(state.archive.works.length, 0)
})

test('DEC-BD-001/COMM-002：电视倍率按成员/购买分档，BD 公司所得为毛收入 50%', () => {
  const withMember = (() => {
    let state = funded(ok('initialize', { seed: 7 }).state)
    state = ok('start_work', {
      state, offer_id: 'offer_01', mode: 'committee', percent: 50,
      committee_partner_ids: ['partner_tv', 'partner_stream']
    }).state
    state = completeWork(state, 'work_01', 70)
    return ok('deliver_work', { state, work_id: 'work_01' }).report
  })()
  const lineOf = (report, id) => report.channels.find((line) => line.window === id)
  assert.equal(lineOf(withMember, 'domestic_streaming').tv_multiplier, 1250)
  assert.equal(lineOf(withMember, 'bd_dvd').owner, 'company')
  assert.equal(lineOf(withMember, 'bd_dvd').net, Math.floor(lineOf(withMember, 'bd_dvd').gross / 2))

  const withoutPurchase = (() => {
    let state = funded(ok('initialize', { seed: 7 }).state)
    state = ok('start_work', {
      state, offer_id: 'offer_02', mode: 'committee', percent: 50,
      committee_partner_ids: ['partner_stream', 'partner_pub']
    }).state
    state = completeWork(state, 'work_01', 70)
    return ok('deliver_work', { state, work_id: 'work_01' }).report
  })()
  assert.equal(lineOf(withoutPurchase, 'domestic_streaming').tv_multiplier, 1000)
  assert.equal(lineOf(withoutPurchase, 'tv'), undefined)

  const withPurchase = (() => {
    let state = funded(ok('initialize', { seed: 7 }).state)
    state = ok('start_work', {
      state, offer_id: 'offer_02', mode: 'committee', percent: 50,
      committee_partner_ids: ['partner_stream', 'partner_pub']
    }).state
    state = ok('buy_tv_service', { state, work_id: 'work_01' }).state
    assert.ok(state.works[0].channels.includes('tv'))
    state = completeWork(state, 'work_01', 70)
    return ok('deliver_work', { state, work_id: 'work_01' }).report
  })()
  assert.equal(lineOf(withPurchase, 'domestic_streaming').tv_multiplier, 1300)
  assert.equal(lineOf(withPurchase, 'tv').agency_fee_permille, 0)
})

function completedChannelHistory(id, windows) {
  const dims = { story: 70, direction: 70, drawing: 70, animation: 70, art: 70, sound: 70 }
  const channelBreakdown = windows.map((window) => {
    const bd = window === 'bd_dvd'
    return {
      window, potential: 100, quality_factor: 760, heat_factor: 1000, reputation_factor: 800,
      tv_multiplier: 1000, agency_fee_permille: 0, gross: 100, net: bd ? 50 : 100,
      revenue: 100, company_received: bd ? 50 : 100, owner: bd ? 'company' : 'committee_pool'
    }
  })
  const commercialShare = channelBreakdown.reduce((sum, line) => sum + line.company_received, 0)
  return {
    id, ip_id: null, offer_id: `${id}_offer`, name: id, source: 'publisher', genre: 'sf', scale: 'tv',
    mode: 'committee', investment_percent: 100, start_week: 0, end_week: 0, end_reason: 'completed', status: 'DELIVERED',
    forced: false, gate_completion_permille: 1000, aborted_week: null, penalty_paid: 0,
    quality: { dims, mean: 70 }, quality_score: 70, rating: 'B',
    commercial_revenue: channelBreakdown.reduce((sum, line) => sum + line.revenue, 0),
    bd_gross: channelBreakdown.filter((line) => line.window === 'bd_dvd').reduce((sum, line) => sum + line.gross, 0),
    bd_revenue: channelBreakdown.filter((line) => line.window === 'bd_dvd').reduce((sum, line) => sum + line.net, 0),
    committee_pool: channelBreakdown.filter((line) => line.window !== 'bd_dvd').reduce((sum, line) => sum + line.net, 0),
    investor_share: 0, company_received: commercialShare,
    finance_summary: {
      contract_received: 0, contract_refund: 0, investment_paid: 0, commercial_share: commercialShare,
      bd_revenue: channelBreakdown.filter((line) => line.window === 'bd_dvd').reduce((sum, line) => sum + line.net, 0),
      success_reward: 0, penalty: 0, costs: {}, total_costs: 0, profit: commercialShare
    },
    channel_breakdown: channelBreakdown,
    episodes: [{ id: 'ep01', quality: { dims, mean: 70 } }],
    team: [{ id: 'staff_dir', name: '导演', role: 'director' }],
    outsourcing_summary: { contracts: 0, failed: 0, points: 0, spend: 0 }, rules_status: 'placeholder'
  }
}

test('DEC-COMM-001：外部代理按声望与同类渠道成功合作分档，低于门槛时关闭', () => {
  const deliverAt = (reputation, history = []) => {
    let state = funded(ok('initialize', { seed: 7 }).state)
    state.company.reputation = reputation
    state.archive.works = history
    state = ok('start_work', {
      state, offer_id: 'offer_02', mode: 'committee', percent: 50,
      committee_partner_ids: ['partner_pub']
    }).state
    state = completeWork(state, 'work_01', 70)
    return ok('deliver_work', { state, work_id: 'work_01' }).report
  }
  const lineOf = (report, id) => report.channels.find((line) => line.window === id)

  assert.equal(lineOf(deliverAt(100), 'domestic_streaming').agency_fee_permille, 450)
  assert.equal(lineOf(deliverAt(190), 'domestic_streaming').agency_fee_permille, 400)
  assert.equal(lineOf(deliverAt(350), 'domestic_streaming').agency_fee_permille, 350)
  assert.equal(lineOf(deliverAt(99), 'domestic_streaming'), undefined)
})

test('DEC-COMM-001：代理合作次数按渠道独立累计，不跨渠道合并', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state.market.slots.find((offer) => offer.id === 'offer_02').channels_baseline.push('overseas')
  state.archive.works = [
    ...Array.from({ length: 3 }, (_, index) => completedChannelHistory(`history_domestic_${index}`, ['domestic_streaming'])),
    completedChannelHistory('history_overseas_0', ['overseas'])
  ]
  state = ok('start_work', {
    state, offer_id: 'offer_02', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_pub']
  }).state
  state = completeWork(state, 'work_01', 70)
  const report = ok('deliver_work', { state, work_id: 'work_01' }).report
  const lineOf = (id) => report.channels.find((line) => line.window === id)

  assert.equal(lineOf('domestic_streaming').agency_fee_permille, 400)
  assert.equal(lineOf('overseas').agency_fee_permille, 450)
  assert.equal(report.committee_pool, lineOf('domestic_streaming').net + lineOf('overseas').net)
})

test('DEC-COMM-002：无电视台成员但外部代理播出开放时使用 115% 普通曝光', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state = ok('start_work', {
    state, offer_id: 'offer_01', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_stream']
  }).state
  state = completeWork(state, 'work_01', 70)
  const report = ok('deliver_work', { state, work_id: 'work_01' }).report
  const lineOf = (id) => report.channels.find((line) => line.window === id)

  assert.equal(lineOf('tv').agency_fee_permille, 450)
  assert.equal(lineOf('domestic_streaming').tv_multiplier, 1150)
  assert.equal(lineOf('bd_dvd').tv_multiplier, 1150)
})

test('DEC-COMM-003：非整除净池分配尚未冻结时原子拒绝，不静默舍入', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  state.company.reputation = 100
  state = ok('start_work', {
    state, offer_id: 'offer_02', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_pub']
  }).state
  state = completeWork(state, 'work_01', 70)

  const preview = ok('deliver_work', { state: structuredClone(state), work_id: 'work_01' }).report
  const line = preview.channels.find((entry) => entry.window === 'domestic_streaming')
  const factors = [line.quality_factor, line.heat_factor, line.reputation_factor, line.tv_multiplier]
  const netAt = (potential) => {
    let gross = potential
    for (const factor of factors) gross = Math.floor(gross * factor / 1000)
    return Math.floor(gross * (1000 - line.agency_fee_permille) / 1000)
  }
  const potential = Array.from({ length: 100 }, (_, index) => line.potential + index + 1)
    .find((candidate) => netAt(candidate) % 2 === 1)
  assert.equal(potential === undefined, false)
  state.works[0].offer.channel_potentials.domestic_streaming = potential

  const beforeHash = ok('hash_state', { state }).hash
  const beforeBalance = state.finance.balance
  const blocked = call('deliver_work', { state, work_id: 'work_01' })
  assert.equal(blocked.error.code, 'NOT_IMPLEMENTED')
  assert.match(blocked.error.message, /取整顺序与余数归属尚未冻结/)
  assert.equal('state' in blocked, false)
  assert.equal(ok('hash_state', { state }).hash, beforeHash)
  assert.equal(state.finance.balance, beforeBalance)
  assert.equal(state.works.length, 1)
  assert.equal(state.archive.works.length, 0)
})

test('DEC-PLAN-001：原创草稿走独立准入，不复用普通企划声望/履历守卫', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  const base = JSON.parse(JSON.stringify(state.market.slots[0]))
  state.market.custom_offer = {
    ...base,
    id: 'custom_01',
    name: '自制企划',
    origin: 'custom',
    allowed_modes: ['committee'],
    draft_status: 'valid',
    min_reputation: 999,
    required_works: ['work_missing']
  }
  const missing = JSON.parse(JSON.stringify(state))
  missing.market.custom_offer = null
  const blocked = call('start_work', {
    state: missing, offer_id: 'custom_01', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_stream']
  })
  assert.equal(blocked.error.code, 'NOT_FOUND')

  const expired = JSON.parse(JSON.stringify(state))
  expired.market.custom_offer.draft_status = 'expired'
  const invalid = call('start_work', {
    state: expired, offer_id: 'custom_01', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_stream']
  })
  assert.equal(invalid.error.code, 'INVALID_PHASE')

  const started = ok('start_work', {
    state, offer_id: 'custom_01', mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_stream']
  })
  assert.equal(started.state.market.custom_offer, null)
  assert.equal(started.state.works[0].offer.origin, 'custom')
})

test('M0 命令 12-14：原创草稿创建、提案采纳/拒绝', () => {
  let state = funded(ok('initialize', { seed: 7 }).state)
  const request = { state, name: '自制短篇', source: 'original', scale: 'tv', style: 'normal' }
  // 声望不足只挡草稿创建，不检查全部投资资金
  assert.equal(call('create_custom_offer', request).error.code, 'INVALID_INPUT')

  state.company.reputation = 150
  request.state = state
  const created = ok('create_custom_offer', request)
  assert.equal(created.offer_id, 'custom_01')
  assert.equal(created.state.finance.entries.length, 0)
  assert.equal(created.state.finance.balance, state.finance.balance)
  assert.equal(created.state.market.custom_offer.draft_status, 'valid')
  assert.equal(created.state.market.custom_offer.development_fee, 0)
  assert.equal(created.state.market.custom_offer.rules_status, 'placeholder')
  assert.equal(call('create_custom_offer', { state: created.state, ...request, state: created.state }).error.code, 'INVALID_PHASE')

  const started = ok('start_work', {
    state: created.state,
    offer_id: created.offer_id,
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_stream']
  })
  assert.equal(started.state.market.custom_offer, null)
  assert.equal(started.state.works[0].offer.origin, 'custom')
  const activeDuplicate = ok('create_custom_offer', { state: started.state, name: '并行原创', source: 'original', scale: 'tv', style: 'normal' })
  assert.equal(activeDuplicate.offer_id, 'custom_02')

  let lifetime = created.state
  lifetime.finance.opening_funds += 5_000_000
  lifetime.finance.balance += 5_000_000
  lifetime = ok('start_work', {
    state: created.state, offer_id: created.offer_id, mode: 'committee', percent: 100,
    committee_partner_ids: ['partner_stream']
  }).state
  lifetime = completeWork(lifetime, 'work_01', 80)
  lifetime = ok('deliver_work', { state: lifetime, work_id: 'work_01' }).state
  assert.equal(lifetime.archive.works[0].offer_id, 'custom_01')
  const afterArchive = ok('create_custom_offer', { state: lifetime, name: '归档后原创', source: 'original', scale: 'tv', style: 'normal' })
  assert.equal(afterArchive.offer_id, 'custom_02')

  let withProposal = ok('initialize', { seed: 7 }).state
  withProposal.market.proposal = { ...withProposal.market.slots[0], id: 'proposal_01' }
  const adopted = ok('adopt_proposal', { state: withProposal })
  assert.equal(adopted.state.market.custom_offer.id, 'proposal_01')
  assert.equal(adopted.state.market.proposal, null)
  assert.equal(call('adopt_proposal', { state: adopted.state }).error.code, 'NOT_FOUND')

  const rejected = ok('reject_proposal', { state: withProposal })
  assert.equal(rejected.state.market.proposal, null)
  assert.equal(call('adopt_proposal', { state: rejected.state }).error.code, 'NOT_FOUND')
})

test('M2 立项守卫：模式、比例、成员、资金与重复消费都拒绝且状态不变', () => {  const base = ok('initialize', { seed: 7 }).state
  const before = ok('hash_state', { state: base }).hash
  const cases = [
    { offer_id: 'offer_03', mode: 'contract' },
    { offer_id: 'offer_01', mode: 'committee', percent: 15, committee_partner_ids: ['partner_tv'] },
    { offer_id: 'offer_01', mode: 'committee', percent: 50, committee_partner_ids: [] },
    { offer_id: 'offer_01', mode: 'committee', percent: 50, committee_partner_ids: ['partner_tv', 'partner_tv'] },
    { offer_id: 'offer_01', mode: 'contract', committee_partner_ids: ['partner_tv'] },
    { offer_id: 'offer_missing', mode: 'contract' }
  ]
  for (const payload of cases) {
    const result = call('start_work', { state: base, ...payload })
    assert.ok(result.error, `应被拒绝: ${JSON.stringify(payload)}`)
    assert.equal(ok('hash_state', { state: base }).hash, before)
  }

  const poor = JSON.parse(JSON.stringify(base))
  poor.finance.opening_funds = 100000
  poor.finance.balance = 100000
  const insufficient = call('start_work', {
    state: poor,
    offer_id: 'offer_01',
    mode: 'committee',
    percent: 100,
    committee_partner_ids: ['partner_tv']
  })
  assert.equal(insufficient.error.code, 'INSUFFICIENT_FUNDS')

  const started = ok('start_work', { state: base, offer_id: 'offer_01', mode: 'contract' }).state
  const again = call('start_work', { state: started, offer_id: 'offer_01', mode: 'contract' })
  assert.equal(again.error.code, 'NOT_FOUND')
})

test('M2 多项目：两部并存，交付一部不影响另一部；存档 round-trip 哈希一致', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = addIdleSupervisor(state)
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  assert.deepEqual(state.works.map((w) => w.id).sort(), ['work_01', 'work_02'])

  const saved = JSON.parse(JSON.stringify(state))
  assert.equal(ok('hash_state', { state: saved }).hash, ok('hash_state', { state }).hash)

  const target = completeWork(JSON.parse(JSON.stringify(state)), 'work_01', 70)
  const delivered = ok('deliver_work', { state: target, work_id: 'work_01' })
  assert.equal(delivered.state.works.length, 1)
  assert.equal(delivered.state.works[0].id, 'work_02')
  assert.equal(delivered.state.archive.works.length, 1)
  assert.equal(delivered.state.works[0].episodes[0].stages[0].items[0].work_done, 0)
})

test('M2 归档后新立项不复用已归档作品 id', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 60)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  assert.equal(state.archive.works[0].id, 'work_01')
  const next = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' })
  assert.equal(next.work_id, 'work_02')
  assert.equal(next.state.works[0].id, 'work_02')
})

test('归档外包聚合：合同数/失败数/交付点/支出与账本一致', () => {
  let state = outsourcedState()
  const item = findItem(state, 'work_01', 'ep01.inbetween')
  const signed = ok('sign_outsourcing', {
    state, work_id: 'work_01', item_id: item.id, supplier_id: 'supplier_douga', work_total: 100, mode: 'normal'
  })
  // 让合同先跑一周拿到真实交付量，再照常交付作品
  state = completeWork(signed.state, 'work_01', 80)
  const delivered = ok('deliver_work', { state, work_id: 'work_01' })
  const record = delivered.state.archive.works[0]
  const summary = record.outsourcing_summary
  assert.equal(summary.contracts, 1)
  // 结项时仍未交付的合同会随项目终止并记为 failed（含到期违约与结清终止两类）
  assert.equal(summary.failed, 1)
  assert.equal(summary.spend, signed.fee_total)
  assert.equal(summary.spend, record.finance_summary.costs.outsourcing)
  assert.ok(summary.points >= 0 && summary.points <= 100)
  assert.deepEqual(Object.keys(summary).sort(), ['contracts', 'failed', 'points', 'spend'])
})

test('INV-22：交付冻结完整 WorkRecord，财务口径不重复扣罚', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  state.company.week = 51
  state.works[0].deadline_week = 52
  for (const item of gatesOf(state, 'work_01')) item.work_done = Math.floor(item.work_total * 4 / 10)
  state = ok('advance_week', { state }).state
  const record = state.archive.works[0]
  assert.equal(record.end_week, 52)
  assert.deepEqual(Object.keys(record).sort(), [
    'aborted_week', 'bd_gross', 'bd_revenue', 'channel_breakdown', 'commercial_revenue', 'committee_pool',
    'company_received', 'end_reason', 'end_week', 'episodes', 'finance_summary', 'forced', 'gate_completion_permille',
    'genre', 'id', 'investment_percent', 'investor_share', 'ip_id', 'mode', 'name', 'offer_id', 'outsourcing_summary',
    'penalty_paid', 'quality', 'quality_score', 'rating', 'rules_status', 'scale', 'source', 'start_week', 'status', 'team'
  ].sort())
  const finance = record.finance_summary
  assert.ok(finance.penalty > 0)
  assert.equal(finance.profit, finance.contract_received - finance.contract_refund + finance.commercial_share + finance.success_reward
    - finance.investment_paid - finance.total_costs)
  assert.equal(record.channel_breakdown.reduce((sum, line) => sum + line.revenue, 0), record.commercial_revenue)
  assert.equal(record.channel_breakdown.reduce((sum, line) => sum + line.company_received, 0), finance.commercial_share)
})

test('INV-22：无 IP 的交付不创建系列', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 70)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  assert.equal(state.archive.works[0].ip_id, null)
  assert.deepEqual(state.archive.series, [])
})

test('INV-22：同 IP 续作只追加作品和最后周，历史载荷与系列标题冻结', () => {
  let state = ok('initialize', { seed: 7 }).state
  state.market.slots[0].ip_id = 'ip_series'
  state.market.slots[1].ip_id = 'ip_series'
  state.market.slots[1].name = '星海邮差 续篇'
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 70)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  const firstRecord = structuredClone(state.archive.works[0])
  const firstSeries = structuredClone(state.archive.series[0])
  assert.deepEqual(firstSeries, { ip_id: 'ip_series', title: '星海邮差', works: ['work_01'], last_week: 0 })

  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  assert.equal(state.works[0].offer.ip_id, 'ip_series')
  assert.equal(state.works[0].ip_id, 'ip_series')
  state = ok('advance_week', { state }).state
  state.events.pending = []
  state = completeWork(state, 'work_02', 75)
  state = ok('deliver_work', { state, work_id: 'work_02' }).state
  assert.deepEqual(state.archive.works[0], firstRecord)
  assert.equal(state.archive.works[1].ip_id, 'ip_series')
  assert.equal(state.archive.works[1].end_week, 1)
  assert.deepEqual(state.archive.series, [{ ...firstSeries, works: ['work_01', 'work_02'], last_week: 1 }])
})

test('INV-22：不同 IP 即使同名也保留独立系列', () => {
  let state = ok('initialize', { seed: 7 }).state
  state.market.slots[0].ip_id = 'ip_a'
  state.market.slots[1].ip_id = 'ip_b'
  state.market.slots[1].name = state.market.slots[0].name
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 70)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  state = completeWork(state, 'work_02', 70)
  state = ok('deliver_work', { state, work_id: 'work_02' }).state
  assert.deepEqual(state.archive.series.map((series) => series.ip_id), ['ip_a', 'ip_b'])
  assert.deepEqual(state.archive.series.map((series) => series.works), [['work_01'], ['work_02']])
})

test('INV-22：Archive 载荷、系列引用和追加顺序损坏时整周拒绝', () => {
  let state = ok('initialize', { seed: 7 }).state
  state.market.slots[0].ip_id = 'ip_series'
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 70)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  const probes = [
    (archive) => { delete archive.works[0].team },
    (archive) => { archive.works[0].channel_breakdown[0].revenue += 1 },
    (archive) => { archive.works[0].finance_summary.profit -= 1 },
    (archive) => { archive.works[0].ip_id = 'ip_other' },
    (archive) => { archive.series[0].works.push('missing') },
    (archive) => { archive.series[0].last_week += 1 },
    (archive) => { archive.series.push({ ...archive.series[0] }) }
  ]
  for (const mutate of probes) {
    const probe = structuredClone(state)
    mutate(probe.archive)
    const result = call('advance_week', { state: probe })
    assert.equal(result.error?.code, 'INVALID_STATE')
    assert.match(result.error.message, /INV-22/)
    assert.equal('state' in result, false)
  }
  const overflow = structuredClone(state)
  const maxInt64 = JSON.rawJSON('9223372036854775807')
  overflow.archive.works[0].finance_summary.costs = { production: maxInt64, salary: maxInt64 }
  overflow.archive.works[0].finance_summary.total_costs = maxInt64
  const overflowResult = call('advance_week', { state: overflow })
  assert.equal(overflowResult.error?.code, 'INVALID_STATE')
  assert.match(overflowResult.error.message, /合计溢出/)

  const mismatched = ok('initialize', { seed: 7 }).state
  mismatched.market.slots[0].ip_id = 'ip_series'
  const started = ok('start_work', { state: mismatched, offer_id: 'offer_01', mode: 'contract' }).state
  started.works[0].ip_id = 'ip_other'
  const rejected = call('advance_week', { state: started })
  assert.equal(rejected.error?.code, 'INVALID_STATE')
  assert.match(rejected.error.message, /INV-22 project.ip_id/)
})

function vendorFixture() {
  const state = twoProjectsNearDeadline()
  state.suppliers = [{
    id: 'supplier_shared',
    name: '共享协力供应商',
    specialties: ['animation'],
    capacity_per_week: 100,
    quality: 70,
    speed: 60,
    price_per_unit: 40,
    reliability: 80,
    unlocked_week: 0
  }]
  state.contracts = []
  return state
}

function outsourceContract(state, id, workId, weeklyCap = 60, overrides = {}) {
  const item = findItem(state, workId, 'ep01.inbetween')
  return {
    id,
    supplier_id: 'supplier_shared',
    work_id: workId,
    episode_id: 'ep01',
    item_id: item.id,
    ability: item.ability,
    mode: 'normal',
    work_total: 60,
    work_done: 0,
    weekly_cap: weeklyCap,
    fee_total: 2400,
    fee_paid: 0,
    signed_week: 0,
    due_week: 26,
    status: 'active',
    ...overrides
  }
}

function rejectVendorState(state, invariant) {
  const result = call('advance_week', { state })
  assert.equal(result.error?.code, 'INVALID_STATE')
  assert.match(result.error.message, invariant)
  assert.equal('state' in result, false)
}

test('INV-19：Fixture C 跨项目共享供应商 60+40 容量，终态合同释放产能', () => {
  const state = vendorFixture()
  state.contracts = [
    outsourceContract(state, 'contract_a', 'work_a', 60),
    outsourceContract(state, 'contract_b', 'work_b', 40)
  ]
  assert.ok(ok('advance_week', { state }).state)

  const oversold = structuredClone(state)
  oversold.contracts.push(outsourceContract(oversold, 'contract_c', 'work_a', 1))
  rejectVendorState(oversold, /INV-19/)

  const released = structuredClone(state)
  released.contracts[0].status = 'failed'
  released.contracts.push(outsourceContract(released, 'contract_c', 'work_a', 60))
  assert.ok(ok('advance_week', { state: released }).state)

  const delivered = structuredClone(state)
  delivered.contracts[0].status = 'delivered'
  delivered.contracts.push(outsourceContract(delivered, 'contract_c', 'work_a', 60))
  assert.ok(ok('advance_week', { state: delivered }).state)
})

test('INV-20：合同项目、单集容器、能力与累计交付边界一致', () => {
  const state = vendorFixture()
  state.contracts = [outsourceContract(state, 'contract_a', 'work_a')]

  const wrongWork = structuredClone(state)
  wrongWork.contracts[0].work_id = 'work_b'
  rejectVendorState(wrongWork, /INV-20/)

  const wrongEpisode = structuredClone(state)
  const episodeItem = findItem(wrongEpisode, 'work_a', 'ep01.inbetween')
  Object.assign(wrongEpisode.contracts[0], {
    item_id: episodeItem.id,
    episode_id: 'ep02',
    ability: episodeItem.ability
  })
  rejectVendorState(wrongEpisode, /INV-20/)

  const wrongAbility = structuredClone(state)
  wrongAbility.contracts[0].ability = 'drawing'
  rejectVendorState(wrongAbility, /INV-20/)

  const wrongSpecialty = structuredClone(state)
  wrongSpecialty.contracts[0].ability = 'drawing'
  wrongSpecialty.suppliers[0].specialties = ['planning']
  rejectVendorState(wrongSpecialty, /INV-20/)

  const cumulative = structuredClone(state)
  cumulative.contracts[0].work_done = 60
  cumulative.contracts.push(outsourceContract(cumulative, 'contract_b', 'work_a', 40, { work_done: 41 }))
  rejectVendorState(cumulative, /INV-20/)

  const split = structuredClone(state)
  split.contracts[0].work_done = 60
  split.contracts.push(outsourceContract(split, 'contract_b', 'work_a', 40, { work_done: 40 }))
  assert.ok(ok('hash_state', { state: split }).hash)
})

function outsourceRoll(seed, week, contractId) {
  return Math.floor(draw(seed, week, Stream.production, hashText(contractId), hashText('outsource_tick')) * 10000 / 2 ** 32)
}

function outsourceTickState(id, reliability = 80, overrides = {}) {
  const state = setupTiny(42)
  state.suppliers = [{
    id: 'supplier_shared', name: '共享协力供应商', specialties: ['animation'],
    capacity_per_week: 100, quality: 70, speed: 60, price_per_unit: 40,
    reliability, unlocked_week: 0
  }]
  findItem(state, 'work_01', 'ep01.storyboard').work_done = 100
  state.contracts = [outsourceContract(state, id, 'work_01', 60, overrides)]
  return state
}

function contractIdForRoll(predicate, reliability = 80, start = 0) {
  const threshold = 10000 - 20 * (100 - reliability)
  for (let i = start; i < start + 10000; i++) {
    const id = `contract_${i}`
    const roll = outsourceRoll(42, 0, id)
    if (predicate(roll, reliability * 100, threshold)) return id
  }
  throw new Error('找不到外包随机区间夹具')
}

// ---- M0 命令 9：sign_outsourcing（weekly_cap 按 DEC-VENDOR-003，due_week 按 DECISION_LOG 推导）----

function outsourcedState() {
  let state = setupTiny(42)
  state.works[0].episodes[0].stages
    .flatMap((stage) => stage.items)
    .find((item) => item.key === 'storyboard').work_done = 100
  return state
}

test('initialize 自带基础供应商目录，按周解锁', () => {
  const state = ok('initialize', { seed: 7 }).state
  assert.equal(state.suppliers.length, 6)
  assert.deepEqual(state.suppliers.map((supplier) => supplier.id), [
    'supplier_genga', 'supplier_genga_sub', 'supplier_douga',
    'supplier_sound', 'supplier_edit', 'supplier_douga_hi'
  ])
  const edit = state.suppliers.find((supplier) => supplier.id === 'supplier_edit')
  assert.equal(edit.unlocked_week, 8)
  assert.deepEqual(edit.specialties, ['direction'])
})

test('sign_outsourcing：weekly_cap/due_week/签约费与台账按公式落地', () => {
  const state = outsourcedState()
  const item = findItem(state, 'work_01', 'ep01.inbetween')
  const receipt = ok('sign_outsourcing', {
    state, work_id: 'work_01', item_id: item.id, supplier_id: 'supplier_douga', work_total: 100, mode: 'normal'
  })
  // base_cap = floor(700×35/100) = 245；weekly_cap = min(700, 100, 245) = 100
  assert.equal(receipt.weekly_cap, 100)
  // N = ceil(100/100) = 1；normal 缓冲 ceil(1/4)+1 = 2 → due = 0 + 1 + 2
  assert.equal(receipt.due_week, 3)
  assert.equal(receipt.fee_total, 100 * 3200)
  const contract = receipt.state.contracts[0]
  assert.equal(contract.episode_id, 'ep01')
  assert.equal(contract.ability, 'animation')
  assert.equal(contract.status, 'active')
  assert.equal(contract.fee_paid, contract.fee_total)
  assert.equal(contract.signed_week, 0)
  const entry = receipt.state.finance.entries.find((row) => row.category === 'outsourcing')
  assert.equal(entry.amount, -320000)
  assert.equal(entry.work_id, 'work_01')
  assert.equal(receipt.state.finance.balance, state.finance.balance - 320000)

  // 周结算应把外包结果写进回执日志（延误/返工/交付都只在这里出现，不做弹窗）
  const advanced = ok('advance_week', { state: receipt.state })
  assert.equal(advanced.report.outsourcing.length, 1)
  assert.equal(advanced.report.outsourcing[0].contract_id, receipt.contract_id)
  assert.ok(['delivered', 'delay', 'rework'].includes(advanced.report.outsourcing[0].kind))
})

test('sign_outsourcing：emergency 加急价 140%、缓冲更短', () => {
  const state = outsourcedState()
  const item = findItem(state, 'work_01', 'ep01.inbetween')
  const normal = ok('sign_outsourcing', {
    state, work_id: 'work_01', item_id: item.id, supplier_id: 'supplier_douga', work_total: 100, mode: 'normal'
  })
  const urban = ok('sign_outsourcing', {
    state, work_id: 'work_01', item_id: item.id, supplier_id: 'supplier_douga', work_total: 100, mode: 'emergency'
  })
  assert.equal(urban.fee_total, Math.floor(100 * 3200 * 140 / 100))
  assert.equal(urban.fee_total, normal.fee_total * 140 / 100)
  // emergency 缓冲 ceil(1×15/100) = 1 → due = 0 + 1 + 1
  assert.equal(urban.due_week, 2)
  assert.ok(urban.due_week < normal.due_week)
})

test('供应商目录产能足以覆盖十集 TV 的外包需求（52 周窗口）', () => {
  // 这是"目录数值不是随手填的"的可证伪断言：按每周 base_cap 汇总，需求必须能在
  // 40 周内买光（给解锁周、排期与返工留 12 周余量）。改小 capacity 或调大可外包量都会红。
  const blueprint = JSON.parse(readFileSync('docs/blueprints/tv_standard.blueprint.json', 'utf8'))
  const demand = new Map()
  for (const item of blueprint.episode.filter((entry) => entry.outsourceable)) {
    demand.set(item.ability, (demand.get(item.ability) ?? 0) + item.work_total * blueprint.episode_count)
  }
  const state = ok('initialize', { seed: 7 }).state
  const weeklyCap = new Map()
  for (const supplier of state.suppliers) {
    const base = Math.max(1, Math.floor(supplier.capacity_per_week * supplier.speed / 100))
    for (const ability of supplier.specialties) weeklyCap.set(ability, (weeklyCap.get(ability) ?? 0) + base)
  }
  for (const [ability, points] of demand) {
    const cap = weeklyCap.get(ability) ?? 0
    assert.ok(cap > 0, `${ability} 没有可用供应商`)
    const weeks = Math.ceil(points / cap)
    assert.ok(weeks <= 40, `${ability} 需 ${weeks} 周才能买光 ${points} 点，超出 40 周裕度（每周 ${cap} 点）`)
  }
  assert.deepEqual([...demand.values()].reduce((a, b) => a + b, 0), 15200)
})

test('sign_outsourcing：守卫齐全且失败原子', () => {
  const base = outsourcedState()
  const inbetween = findItem(base, 'work_01', 'ep01.inbetween')
  const common = findItem(base, 'work_01', 'common.series_comp')
  const before = ok('hash_state', { state: base }).hash
  const reject = (payload, code) => {
    const result = call('sign_outsourcing', { state: base, ...payload })
    assert.equal(result.error?.code, code, JSON.stringify(result.error))
    assert.equal('state' in result, false, '失败命令不得返回半状态')
    assert.equal(ok('hash_state', { state: base }).hash, before)
  }

  reject({ work_id: 'work_01', item_id: common.id, supplier_id: 'supplier_genga', work_total: 10, mode: 'normal' }, 'INVALID_INPUT')
  reject({ work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_genga', work_total: 10, mode: 'normal' }, 'INVALID_INPUT')
  reject({ work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_douga', work_total: 0, mode: 'normal' }, 'INVALID_INPUT')
  reject({ work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_douga', work_total: 101, mode: 'normal' }, 'INVALID_INPUT')
  reject({ work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_none', work_total: 10, mode: 'normal' }, 'NOT_FOUND')
  reject({ work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_douga', work_total: 10, mode: 'rush' }, 'INVALID_INPUT')

  // 上游未解锁
  const locked = outsourcedState()
  findItem(locked, 'work_01', 'ep01.storyboard').work_done = 0
  const unmet = call('sign_outsourcing', {
    state: locked, work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_douga', work_total: 10, mode: 'normal'
  })
  assert.equal(unmet.error?.code, 'DEPENDENCY_UNMET')

  // 供应商尚未解锁（第 8 周才开放的剪辑工房）
  const early = outsourcedState()
  early.suppliers.find((entry) => entry.id === 'supplier_edit').specialties = ['animation']
  const notYet = call('sign_outsourcing', {
    state: early, work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_edit', work_total: 10, mode: 'normal'
  })
  assert.equal(notYet.error?.code, 'NOT_FOUND')

  // 剩余周数不足以完成：不允许签下必定违约的合同
  // 剩余周数不足以完成：把 supplier 周产能压到 40 点/周，100 点需要 3 周，只剩 2 周
  const rushed = outsourcedState()
  const slow = rushed.suppliers.find((entry) => entry.id === 'supplier_douga')
  slow.capacity_per_week = 200
  slow.speed = 20
  rushed.works[0].deadline_week = 2
  const tooLate = call('sign_outsourcing', {
    state: rushed, work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_douga', work_total: 100, mode: 'normal'
  })
  assert.equal(tooLate.error?.code, 'INVALID_INPUT', '需要 3 周但只剩 2 周，应拒绝签下必定违约的合同')

  // 现金不足
  const poor = outsourcedState()
  poor.finance.opening_funds = 1000
  poor.finance.balance = 1000
  const noCash = call('sign_outsourcing', {
    state: poor, work_id: 'work_01', item_id: inbetween.id, supplier_id: 'supplier_douga', work_total: 100, mode: 'normal'
  })
  assert.equal(noCash.error?.code, 'INSUFFICIENT_FUNDS')
})

test('sign_outsourcing：产能是供应商级共享池，排满后拒绝', () => {
  let state = outsourcedState()
  const supplier = state.suppliers.find((entry) => entry.id === 'supplier_genga')
  supplier.capacity_per_week = 200
  supplier.speed = 100   // base_cap = 200，但单份合同仍受 work_total 限制
  // 造第二个 drawing 可外包项，才有多份合同可签（tiny 的 background 默认不可外包）
  findItem(state, 'work_01', 'ep01.background').outsourceable = true
  const work = state.works[0]
  const art = work.episodes[0].stages.find((stage) => stage.key === 'art_visual')
  art.items.push({
    id: 'work_01.ep01.background_b', key: 'background_b', ability: 'drawing', work_total: 100, work_done: 0,
    deliver_at: 1000, deps: ['work_01.ep01.storyboard'], is_gate: false, outsourceable: true,
    quality_weight_permille: 0, quality: { story: 0, direction: 0, drawing: 0, animation: 0, art: 0, sound: 0 },
    contributors: []
  })
  const first = ok('sign_outsourcing', {
    state, work_id: 'work_01', item_id: 'work_01.ep01.background', supplier_id: 'supplier_genga', work_total: 100, mode: 'normal'
  })
  assert.equal(first.weekly_cap, 100)
  const second = ok('sign_outsourcing', {
    state: first.state, work_id: 'work_01', item_id: 'work_01.ep01.background_b', supplier_id: 'supplier_genga', work_total: 100, mode: 'normal'
  })
  assert.equal(second.weekly_cap, 100)
  const third = call('sign_outsourcing', {
    state: second.state, work_id: 'work_01', item_id: 'work_01.ep01.background_b', supplier_id: 'supplier_genga', work_total: 33, mode: 'normal'
  })
  assert.equal(third.error?.code, 'CAPACITY_EXCEEDED', '共享池用满后不得再签')
})

test('外包周结算：坐标与 JS oracle 一致，正常/延误/返工区间和返工下限正确', () => {
  const cases = [
    { name: '正常', predicate: (roll, normal) => roll < normal, delivered: 60, itemDone: 60, reported: 50, status: 'delivered' },
    { name: '延误', predicate: (roll, normal, rework) => roll >= normal && roll < rework, delivered: 10, itemDone: 10, reported: 0, status: 'active' },
    { name: '返工', predicate: (roll, normal, rework) => roll >= rework, delivered: 5, itemDone: 5, reported: -15, status: 'active' }
  ]
  for (const fixture of cases) {
    const id = contractIdForRoll(fixture.predicate)
    const state = outsourceTickState(id, 80, { work_done: fixture.name === '返工' ? 20 : 10 })
    findItem(state, 'work_01', 'ep01.inbetween').work_done = fixture.name === '返工' ? 20 : 10
    const result = ok('advance_week', { state })
    const advanced = result.state
    assert.equal(advanced.contracts[0].work_done, fixture.delivered, fixture.name)
    assert.equal(findItem(advanced, 'work_01', 'ep01.inbetween').work_done, fixture.itemDone, fixture.name)
    assert.equal(advanced.contracts[0].status, fixture.status, fixture.name)
    const reportItem = result.report.works[0].items.find((item) => item.item_id === 'work_01.ep01.inbetween')
    assert.equal(reportItem?.points ?? 0, fixture.reported, `${fixture.name}外包净变化应进入周回执`)
  }
  const floorId = contractIdForRoll((roll, normal, rework) => roll >= rework)
  const floorState = outsourceTickState(floorId, 80, { work_done: 2 })
  findItem(floorState, 'work_01', 'ep01.inbetween').work_done = 2
  const floorResult = ok('advance_week', { state: floorState })
  const floored = floorResult.state
  assert.equal(floored.contracts[0].work_done, 0)
  assert.equal(findItem(floored, 'work_01', 'ep01.inbetween').work_done, 0)
  assert.equal(floorResult.report.works[0].items.find((item) => item.item_id === 'work_01.ep01.inbetween').points, -2)
})

test('外包返工不得把已开工工作项扣成 0（INV-12 回归）', () => {
  // 同一工作项先被社内员工做过（contributors 非空），再抽到返工：工作项侧只能扣到 1，
  // 否则「未开工项不得有参与者」会把合法状态判红，整周结算返回 INTERNAL_ERROR。
  const id = contractIdForRoll((roll, normal, rework) => roll >= rework)
  const state = outsourceTickState(id, 80, { work_done: 2 })
  const item = findItem(state, 'work_01', 'ep01.inbetween')
  item.work_done = 2
  item.contributors = ['staff_ka']
  const result = ok('advance_week', { state })
  assert.equal(findItem(result.state, 'work_01', 'ep01.inbetween').work_done, 1)
  assert.equal(result.state.contracts[0].work_done, 1)
  assert.equal(result.report.works[0].items.find((entry) => entry.item_id === item.id).points, -1)
})

test('外包周交付写入质量：样本来自供应商 quality，并受依赖上限约束', () => {
  // 案例 A：上游分镜质量 100 → 上限 100，供应商 70 分的样本应原样写入（65–75 区间）
  const build = (upstreamQuality) => {
    const state = outsourceTickState('contract_quality', 100)
    const upstream = findItem(state, 'work_01', 'ep01.storyboard')
    upstream.work_done = upstream.work_total
    for (const dim of Object.keys(upstream.quality)) upstream.quality[dim] = upstreamQuality
    findItem(state, 'work_01', 'ep01.inbetween').work_done = 0
    return state
  }
  const high = ok('advance_week', { state: build(100) })
  const highItem = findItem(high.state, 'work_01', 'ep01.inbetween')
  const highDims = Object.values(highItem.quality)
  assert.equal(highDims.filter((value) => value > 0).length, 6, '首次接触铺满六维')
  assert.ok(highDims.every((value) => value >= 65 && value <= 75), `供应商 70 分应落 65–75：${JSON.stringify(highDims)}`)

  // 案例 B：上游质量 0 → 上限 40，供应商再高也压不破这条线
  const low = ok('advance_week', { state: build(0) })
  const lowItem = findItem(low.state, 'work_01', 'ep01.inbetween')
  const lowDims = Object.values(lowItem.quality)
  assert.ok(lowDims.every((value) => value === 40), `依赖质量 0 时上限为 40：${JSON.stringify(lowDims)}`)
})

test('外包周结算：同项按剩余需求比例、最大余数及 weekly_cap 分配', () => {
  const normal = (roll, threshold) => roll < threshold
  const aId = contractIdForRoll(normal)
  let bId = contractIdForRoll(normal, 80, 1)
  const capped = outsourceTickState(aId, 80, { work_total: 60, work_done: 40, weekly_cap: 20 })
  capped.contracts.push(outsourceContract(capped, bId, 'work_01', 40, { work_total: 40, work_done: 20 }))
  findItem(capped, 'work_01', 'ep01.inbetween').work_done = 60
  const cappedResult = ok('advance_week', { state: capped })
  assert.deepEqual(cappedResult.state.contracts.map((contract) => contract.work_done), [60, 40])
  assert.equal(findItem(cappedResult.state, 'work_01', 'ep01.inbetween').work_done, 100)
  assert.deepEqual(cappedResult.state.contracts.map((contract) => contract.status), ['delivered', 'delivered'])
  assert.equal(cappedResult.report.works[0].items.find((item) => item.item_id === 'work_01.ep01.inbetween').points, 40)

  const remainder = outsourceTickState(aId, 80, { work_total: 20, weekly_cap: 20 })
  remainder.contracts.push(outsourceContract(remainder, bId, 'work_01', 30, { work_total: 30, weekly_cap: 30 }))
  findItem(remainder, 'work_01', 'ep01.inbetween').work_done = 96
  const remainderResult = ok('advance_week', { state: remainder })
  assert.deepEqual(remainderResult.state.contracts.map((contract) => contract.work_done), [2, 2])
  assert.equal(findItem(remainderResult.state, 'work_01', 'ep01.inbetween').work_done, 100)
  assert.equal(remainderResult.report.works[0].items.find((item) => item.item_id === 'work_01.ep01.inbetween').points, 4)
})

test('外包周结算：截止周正常交付优先，未完成转 failed 并释放产能', () => {
  const normal = (roll, threshold) => roll < threshold
  const doneId = contractIdForRoll(normal)
  const done = outsourceTickState(doneId, 80, { due_week: 1, work_total: 10, weekly_cap: 10 })
  const doneResult = ok('advance_week', { state: done }).state
  assert.equal(doneResult.contracts[0].status, 'delivered')

  const lateId = contractIdForRoll((roll, threshold, rework) => roll >= threshold && roll < rework)
  const late = outsourceTickState(lateId, 80, { due_week: 1 })
  const lateResult = ok('advance_week', { state: late }).state
  assert.equal(lateResult.contracts[0].status, 'failed')
  lateResult.contracts.push(outsourceContract(lateResult, 'replacement', 'work_01', 100))
  assert.ok(ok('hash_state', { state: lateResult }).hash)

  const notYet = outsourceTickState(lateId, 80, { due_week: 2 })
  const pendingResult = ok('advance_week', { state: notYet }).state
  assert.equal(pendingResult.contracts[0].status, 'active')
})

test('外包防篡改：公共项与 gate 即使标记可外包也拒绝，失败命令保持原子', () => {
  for (const itemId of ['common.series_comp', 'ep01.master']) {
    const state = outsourceTickState('contract_guard', 80)
    const item = findItem(state, 'work_01', itemId)
    item.outsourceable = true
    state.contracts[0].item_id = item.id
    state.contracts[0].ability = item.ability
    state.suppliers[0].specialties = ['animation', item.ability]
    state.contracts[0].episode_id = itemId.startsWith('ep01.') ? 'ep01' : null
    const before = JSON.stringify(state)
    const rejected = call('advance_week', { state })
    assert.equal(rejected.error.code, 'INVALID_STATE')
    assert.match(rejected.error.message, /只能承接可外包/)
    assert.equal(JSON.stringify(state), before)
    assert.equal('state' in rejected, false)
  }
})

test('公司关闭预演：活动外包合同随原状态终态化，不留 active 容量', () => {
  const state = outsourceTickState('contract_closing', 80)
  const closed = ok('end_company', { state, reason: 'manual' }).state
  assert.equal(closed.company.status, 'closing')
  assert.equal(closed.contracts[0].status, 'failed')
  assert.ok(ok('hash_state', { state: closed }).hash)
})

test('INV-19/20：供应商与合同严格载荷、引用、ID 和溢出检查', () => {
  const state = vendorFixture()
  state.contracts = [outsourceContract(state, 'contract_a', 'work_a')]
  const probes = [
    [(probe) => { delete probe.suppliers[0].reliability }, /INV-01 Supplier/],
    [(probe) => { probe.suppliers[0].unknown = true }, /INV-01 Supplier/],
    [(probe) => { probe.suppliers[0].specialties = ['planning', 'planning'] }, /INV-01 Supplier/],
    [(probe) => { probe.suppliers[0].capacity_per_week = 0 }, /INV-01 Supplier/],
    [(probe) => { delete probe.contracts[0].fee_paid }, /INV-01 OutsourceContract/],
    [(probe) => { probe.contracts[0].unknown = true }, /INV-01 OutsourceContract/],
    [(probe) => { probe.contracts[0].fee_paid = 2401 }, /INV-01 OutsourceContract/],
    [(probe) => { probe.contracts[0].supplier_id = 'missing' }, /INV-20/],
    [(probe) => { probe.contracts[0].id = 'supplier_shared' }, /INV-02/],
    [(probe) => { probe.contracts[0].weekly_cap = JSON.rawJSON('9223372036854775807') }, /INV-19/],
    [(probe) => {
      const maxInt64 = JSON.rawJSON('9223372036854775807')
      probe.contracts[0].work_total = maxInt64
      probe.contracts[0].work_done = maxInt64
      probe.contracts.push(outsourceContract(probe, 'contract_b', 'work_a', 40, { work_total: 1, work_done: 1 }))
    }, /INV-20/]
  ]
  for (const [mutate, invariant] of probes) {
    const probe = structuredClone(state)
    mutate(probe)
    rejectVendorState(probe, invariant)
  }
  for (const field of ['suppliers', 'contracts']) {
    const probe = structuredClone(state)
    delete probe[field]
    assert.equal(call('hash_state', { state: probe }).error?.code, 'INVALID_INPUT')
    probe[field] = {}
    assert.equal(call('hash_state', { state: probe }).error?.code, 'INVALID_INPUT')
  }
})

test('供应商、合同与专业数组顺序不影响规范化哈希', () => {
  const state = vendorFixture()
  state.contracts = [
    outsourceContract(state, 'contract_a', 'work_a', 60),
    outsourceContract(state, 'contract_b', 'work_b', 40)
  ]
  state.suppliers[0].specialties = ['animation', 'drawing']
  const reordered = structuredClone(state)
  reordered.suppliers.reverse()
  reordered.contracts.reverse()
  reordered.suppliers[0].specialties.reverse()
  assert.equal(ok('hash_state', { state }).hash, ok('hash_state', { state: reordered }).hash)
})

function committeeFixture() {
  return ok('start_work', {
    state: funded(ok('initialize', { seed: 7 }).state),
    offer_id: 'offer_01',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  }).state
}

function rejectPartnershipState(state, invariant) {
  const result = call('advance_week', { state })
  assert.equal(result.error?.code, 'INVALID_STATE', `expected ${invariant}, got ${JSON.stringify(result)}`)
  assert.match(result.error.message, invariant)
  assert.equal('state' in result, false)
}

test('INV-13：伙伴与委员会严格载荷、成员渠道和生命周期校验', () => {
  const state = committeeFixture()
  const probes = [
    [(probe) => { delete probe.partners[0].history }, /Partner 根字段/],
    [(probe) => { probe.partners[0].unknown = true }, /Partner 根字段/],
    [(probe) => { probe.partners[0].channels = ['tv', 'tv'] }, /INV-13 Partner.channels/],
    [(probe) => { probe.partners[0].channels = ['bd_dvd'] }, /INV-13 Partner.channels/],
    [(probe) => { probe.partners[0].relationship = 101 }, /Partner.relationship/],
    [(probe) => { probe.partners[0].history = [{}] }, /Partner.history/],
    [(probe) => { delete probe.committees[0].closed_week }, /Committee 根字段/],
    [(probe) => { probe.committees[0].unknown = true }, /Committee 根字段/],
    [(probe) => { probe.committees[0].members[0].unknown = true }, /Committee.members/],
    [(probe) => { probe.committees[0].members[1].partner_id = probe.committees[0].members[0].partner_id }, /委员会成员重复/],
    [(probe) => { probe.committees[0].members[1].channel = probe.committees[0].members[0].channel }, /委员会渠道重复/],
    [(probe) => { probe.committees[0].members[1].channel = 'overseas' }, /渠道不属于该伙伴/],
    [(probe) => { probe.committees[0].members[1].channel = 'bd_dvd' }, /BD 不挂成员/],
    [(probe) => { probe.committees[0].closed_week = 0 }, /活跃委员会不能有 closed_week/],
    [(probe) => { probe.committees[0].work_id = 'work_missing' }, /活跃委员会的项目不存在/],
    [(probe) => { probe.works[0].committee_id = 'committee_missing' }, /活跃委员会与项目引用不一致|未指向同一作品的活跃委员会/],
    [(probe) => {
      probe.company.week = 1
      probe.committees[0].formed_week = 1
    }, /成立周必须与项目立项周一致/]
  ]
  for (const [mutate, invariant] of probes) {
    const probe = structuredClone(state)
    mutate(probe)
    rejectPartnershipState(probe, invariant)
  }

  const delivering = ok('end_company', { state }).state
  assert.equal(delivering.works[0].status, 'delivering')
  assert.equal(delivering.committees[0].status, 'active')
  assert.ok(ok('hash_state', { state: delivering }).hash)
})

test('INV-13：关闭委员会与 Archive、伙伴 history 必须同源一致', () => {
  let state = committeeFixture()
  state = completeWork(state, 'work_01', 80)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  assert.equal(state.committees[0].status, 'closed')
  assert.ok(state.partners.some((partner) => partner.history.length === 1))

  const probes = [
    [(probe) => {
      probe.archive.works = []
      for (const partner of probe.partners) partner.history = []
    }, /已关闭委员会缺少归档作品/],
    [(probe) => {
      probe.company.week = 1
      probe.archive.works[0].end_week = 1
      for (const partner of probe.partners) {
        for (const entry of partner.history) entry.week = 1
      }
    }, /已关闭委员会与归档作品不一致/],
    [(probe) => {
      probe.company.week = 1
      probe.committees[0].closed_week = 1
    }, /已关闭委员会与归档作品不一致/],
    [(probe) => {
      probe.partners[0].history = [{ week: 0, work_id: 'work_missing', delta: 2, reason: '合作' }]
    }, /引用未归档作品/],
    [(probe) => {
      probe.company.week = 1
      probe.partners[0].history[0].week = 1
    }, /周必须与作品交付周一致/]
  ]
  for (const [mutate, invariant] of probes) {
    const probe = structuredClone(state)
    mutate(probe)
    rejectPartnershipState(probe, invariant)
  }
})

test('伙伴、委员会与成员数组顺序不影响规范化哈希', () => {
  let state = committeeFixture()
  state = addIdleSupervisor(state)
  state = ok('start_work', {
    state,
    offer_id: 'offer_02',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_stream', 'partner_pub']
  }).state
  const reordered = structuredClone(state)
  reordered.partners.reverse()
  reordered.committees.reverse()
  for (const committee of reordered.committees) committee.members.reverse()
  assert.equal(ok('hash_state', { state }).hash, ok('hash_state', { state: reordered }).hash)
})

test('伙伴与委员会根数组缺失或类型错误时拒绝输入', () => {
  const state = committeeFixture()
  for (const field of ['partners', 'committees']) {
    const missing = structuredClone(state)
    delete missing[field]
    assert.equal(call('hash_state', { state: missing }).error?.code, 'INVALID_INPUT')
    const wrongType = structuredClone(state)
    wrongType[field] = {}
    assert.equal(call('hash_state', { state: wrongType }).error?.code, 'INVALID_INPUT')
  }
})

function gatesOf(state, workId) {
  const work = state.works.find((entry) => entry.id === workId)
  const gates = []
  for (const episode of work.episodes) {
    for (const stage of episode.stages) {
      for (const item of stage.items) if (item.is_gate) gates.push(item)
    }
  }
  return gates
}

test('M2 到期强制交付：未达门槛在结算周自动交付，按完成度扣罚并归档 deadline', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  state.company.week = 51
  state.works[0].deadline_week = 52
  for (const item of gatesOf(state, 'work_01')) item.work_done = Math.floor(item.work_total * 4 / 10)

  const balanceBefore = state.finance.balance
  const result = ok('advance_week', { state })

  assert.equal(result.state.company.week, 52)
  assert.equal(result.report.settlements.length, 1)
  const settlement = result.report.settlements[0]
  assert.equal(settlement.end_reason, 'deadline')
  assert.equal(settlement.forced, true)
  assert.ok(settlement.gate_completion_permille > 0 && settlement.gate_completion_permille < 1000)
  // 扣罚 = 强制交付扣罚 + 质量违约扣罚（两类独立叠加，DEC-QUALITY-001 只规定各自上限）
  const forcedPenalty = Math.floor(Math.floor(170000000 * (1000 - settlement.gate_completion_permille) / 1000) * 300 / 1000)
  const qualityPenalty = Math.floor(170000000 * Math.min(300, (settlement.q_min - settlement.quality_score) * 20) / 1000)
  assert.equal(settlement.q_min, 65)
  assert.equal(settlement.quality_penalty, qualityPenalty)
  assert.ok(qualityPenalty > 0, '质量未达 Q_min 应产生扣罚')
  assert.equal(settlement.penalty, forcedPenalty + qualityPenalty)
  assert.equal(result.report.funds.delta, result.state.finance.balance - balanceBefore)
  assert.equal(result.state.works.length, 0)
  const record = result.state.archive.works[0]
  assert.equal(record.end_reason, 'deadline')
  assert.equal(record.end_week, 52)
  assert.equal(record.forced, true)
  assert.equal(record.gate_completion_permille, settlement.gate_completion_permille)
  assert.equal(record.finance_summary.penalty, settlement.penalty)
  assert.equal(result.state.finance.entries.find((entry) => entry.category === 'penalty').week, 52)
  assert.equal(result.state.company.reputation_log.at(-1).week, 52)
  assert.equal(result.state.company.status, 'running')
})

test('M2 到期交付：门槛已达成按 completed 正常计价，不扣罚', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_04', mode: 'contract' }).state
  state = completeWork(state, 'work_01', 70)
  state.company.week = 51
  state.works[0].deadline_week = 52

  const result = ok('advance_week', { state })

  assert.equal(result.state.company.week, 52)
  const settlement = result.report.settlements[0]
  assert.equal(settlement.end_reason, 'completed')
  assert.equal(settlement.forced, false)
  assert.equal(settlement.gate_completion_permille, 1000)
  assert.equal(settlement.penalty, 0)
  assert.equal(result.state.archive.works[0].end_reason, 'completed')
  assert.equal(result.state.archive.works[0].end_week, 52)
})

test('M2 截止周：最后一个允许生产周完成后同周结算并记录实际周', () => {
  let state = startedContract('offer_01', 7)
  for (const item of allItems(state, 'work_01')) item.work_done = item.work_total
  findItem(state, 'work_01', 'ep01.delivery_master').work_done = 0
  state.company.week = 51
  state.works[0].deadline_week = 52
  state = assign(state, 'staff_post', 'work_01')

  const result = ok('advance_week', { state })
  const masterReceipt = result.report.works[0].items.find((item) => item.item_id === 'work_01.ep01.delivery_master')
  assert.equal(masterReceipt.points, 20)
  assert.equal(result.state.company.week, 52)
  assert.equal(result.state.works.length, 0)
  assert.equal(result.report.settlements[0].end_reason, 'completed')
  assert.equal(result.state.archive.works[0].end_week, 52)
  assert.ok(result.state.finance.entries.filter((entry) => entry.work_id === 'work_01' && entry.week === 52).length > 0)
  assert.equal(result.state.company.reputation_log.at(-1).week, 52)
})

test('M2 关闭路径：end_company 锁 closing，finalize_delivery 结清，finalize_company 只生成一次结局', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = assign(state, 'staff_dir')
  state = completeWork(state, 'work_01', 70)

  const closing = ok('end_company', { state })
  assert.equal(closing.state.company.status, 'closing')
  assert.equal(closing.state.company.end_reason, 'voluntary')
  assert.equal(closing.state.works[0].status, 'delivering')
  assert.equal(closing.state.staff.find((s) => s.id === 'staff_dir').assignment_work_id, null)
  assert.equal(call('advance_week', { state: closing.state }).error.code, 'COMPANY_ENDED')
  assert.equal(call('deliver_work', { state: closing.state, work_id: 'work_01' }).error.code, 'COMPANY_ENDED')
  assert.equal(call('finalize_delivery', { state, work_id: 'work_01' }).error.code, 'INVALID_PHASE')
  assert.equal(call('end_company', { state: closing.state }).error.code, 'COMPANY_ENDED')

  const settled = ok('finalize_delivery', { state: closing.state, work_id: 'work_01' })
  assert.equal(settled.company_status, 'ended')
  assert.equal(settled.report.end_reason, 'company_closed')
  assert.equal(settled.report.forced, false)
  assert.equal(settled.state.works.length, 0)

  const outcome = ok('finalize_company', { state: settled.state })
  assert.equal(outcome.result.reason, 'voluntary')
  assert.equal(outcome.result.total_projects, 1)
  assert.equal(outcome.result.best_work_id, 'work_01')
  assert.equal(outcome.result.rating, settled.report.rating)
  assert.equal(outcome.result.final_funds, outcome.state.finance.balance)
  assert.equal(outcome.state.archive.company_result.reason, 'voluntary')
  assert.equal(call('finalize_company', { state: outcome.state }).error.code, 'INVALID_PHASE')
})

test('M2 结清负余额：提交前原子拒绝，不写流水或 Archive', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state = ok('end_company', { state }).state
  forceCash(state, 1000)
  assert.equal(state.finance.balance, 1000)

  const beforeHash = ok('hash_state', { state }).hash
  const beforeBalance = state.finance.balance
  const blocked = call('finalize_delivery', { state, work_id: 'work_01' })
  assert.equal(blocked.error.code, 'INSUFFICIENT_FUNDS')
  assert.match(blocked.error.message, /余额将为负/)
  assert.equal('state' in blocked, false)
  assert.equal(ok('hash_state', { state }).hash, beforeHash)
  assert.equal(state.finance.balance, beforeBalance)
  assert.equal(state.works.length, 1)
  assert.equal(state.archive.works.length, 0)
})

test('生命周期命令先校验输入：不得靠交付或关闭洗白非法状态', () => {
  let state = startedContract()
  const invalidSupervisor = JSON.parse(JSON.stringify(state))
  invalidSupervisor.works[0].supervisor_staff_id = null
  const delivered = call('deliver_work', { state: invalidSupervisor, work_id: 'work_01' })
  assert.equal(delivered.error.code, 'INVALID_STATE')
  assert.match(delivered.error.message, /INV-27/)
  assert.equal(invalidSupervisor.works.length, 1)
  assert.equal(invalidSupervisor.archive.works.length, 0)

  const ghost = JSON.parse(JSON.stringify(state))
  ghost.staff.find((member) => member.id === 'staff_dir').assignment_work_id = 'ghost'
  const closed = call('end_company', { state: ghost })
  assert.equal(closed.error.code, 'INVALID_STATE')
  assert.match(closed.error.message, /INV-09/)
  assert.equal(ghost.company.status, 'running')
  assert.equal(ghost.staff.find((member) => member.id === 'staff_dir').assignment_work_id, 'ghost')
})

test('重复查看事件也必须先校验输入状态', () => {
  let state = startedContract()
  state.events.pending.push(injectedEvent('work_01'))
  state.events.pending[0].viewed = true
  state.finance.balance += 1
  const result = call('view_event', { state, work_id: 'work_01', event_id: 'schedule_slip' })
  assert.equal(result.error.code, 'INVALID_STATE')
  assert.match(result.error.message, /INV-16/)
  assert.equal('state' in result, false)
})

test('M2 关闭预演：无法非负结清时拒绝进入不可逆 closing', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  forceCash(state, 1000)
  const beforeHash = ok('hash_state', { state }).hash
  const blocked = call('end_company', { state })
  assert.equal(blocked.error.code, 'INSUFFICIENT_FUNDS')
  assert.equal('state' in blocked, false)
  assert.equal(ok('hash_state', { state }).hash, beforeHash)
  assert.equal(state.company.status, 'running')
  assert.equal(state.works[0].status, 'producing')
  assert.equal(state.staff.find((member) => member.id === 'staff_dir').assignment_work_id, 'work_01')
})

test('M2 第 520 周：完成当周结算后锁 closing/time_limit，剩余项目转 company_closed', () => {
  let state = ok('initialize', { seed: 7 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  state.company.week = 519
  state.works[0].deadline_week = 600

  const result = ok('advance_week', { state })
  assert.equal(result.state.company.week, 520)
  assert.equal(result.state.company.status, 'closing')
  assert.equal(result.state.company.end_reason, 'time_limit')
  assert.equal(result.state.works[0].status, 'delivering')
  assert.equal(result.report.events.reason, 'company_closed')

  const settled = ok('finalize_delivery', { state: result.state, work_id: 'work_01' })
  assert.equal(settled.report.end_reason, 'company_closed')
  assert.equal(settled.report.forced, true)
  assert.equal(settled.report.gate_completion_permille, 0)
  assert.equal(settled.company_status, 'ended')

  const outcome = ok('finalize_company', { state: settled.state })
  assert.equal(outcome.result.reason, 'time_limit')
  assert.equal(outcome.result.weeks, 520)
  assert.equal(outcome.result.negatives.length, 1)
})

test('#120 第 520 周：pending 结清后再锁 closing/time_limit，事件不被清空丢弃', () => {
  const state = terminalPendingState()
  state.company.week = 519
  state.works[0].deadline_week = 600
  for (const member of state.staff) member.last_participation = null
  const result = ok('advance_week', { state })
  assert.equal(result.state.company.week, 520)
  assert.equal(result.state.company.status, 'closing')
  assert.equal(result.state.company.end_reason, 'time_limit')
  assert.equal(result.state.works[0].status, 'delivering')
  assert.equal(result.report.events.reason, 'company_closed')
  assert.equal(result.state.events.pending.length, 0)
  assert.deepEqual(result.report.events.expired.map((item) => item.event_id), ['terminal_fixture'])
  assert.equal(result.report.events.expired[0].automatic, true)
  assert.equal(result.report.funds.delta, result.state.finance.balance - state.finance.balance)
})

test('#120 第 520 周：阶段 7 到期事件与阶段 8 终局结清按处理顺序合并', () => {
  const state = twoProjectsNearDeadline()
  state.company.week = 519
  for (const work of state.works) work.deadline_week = 600
  for (const member of state.staff) member.last_participation = null
  // 一条本周到期（阶段 7 处理），一条不限期（阶段 8 终局结清）；数组顺序故意颠倒。
  const later = terminalEvent('work_b', { eventId: 'zz_later' })
  later.triggered_week = 519
  const early = terminalEvent('work_a', { eventId: 'aa_early' })
  early.triggered_week = 519
  early.expires_week = 519
  state.events.pending.push(later, early)

  const result = ok('advance_week', { state })
  assert.equal(result.state.company.end_reason, 'time_limit')
  assert.equal(result.state.events.pending.length, 0)
  assert.deepEqual(result.report.events.expired.map((item) => item.event_id), ['aa_early', 'zz_later'])
  assert.ok(result.report.events.expired.every((item) => item.automatic === true))
})

test('#120 结清/未结清状态都能 JSON 往返：不补字段、不推进周数、哈希不变', () => {
  // 未结清：pending 仍在，往返后 viewed / expires_week 与哈希都不变。
  const pendingState = timedEventState()
  const pendingRoundTrip = JSON.parse(JSON.stringify(pendingState))
  assert.equal(ok('hash_state', { state: pendingRoundTrip }).hash, ok('hash_state', { state: pendingState }).hash)
  assert.equal(pendingRoundTrip.events.pending.length, 1)
  assert.equal(pendingRoundTrip.events.pending[0].viewed, true)
  assert.equal(pendingRoundTrip.events.pending[0].expires_week, pendingState.events.pending[0].expires_week)
  assert.equal(pendingRoundTrip.company.week, pendingState.company.week)

  // 已自动结清：阶段 7 处理后的状态往返同样稳定，不会因为结清而多出必填字段。
  const settledState = ok('advance_week', { state: pendingState }).state
  const settledRoundTrip = JSON.parse(JSON.stringify(settledState))
  assert.equal(ok('hash_state', { state: settledRoundTrip }).hash, ok('hash_state', { state: settledState }).hash)
  assert.equal(settledRoundTrip.events.pending.length, settledState.events.pending.length)
})

// ---------------- INV-27 监督岗位 ----------------

function startedContract(offerId = 'offer_01', seed = 7) {
  const state = ok('initialize', { seed }).state
  return ok('start_work', { state, offer_id: offerId, mode: 'contract' }).state
}

function supervisorOf(state, workId) {
  return state.works.find((work) => work.id === workId).supervisor_staff_id
}

test('INV-27 监督执行产能五折，与普通成员同条件产量精确为 1/2', () => {
  const run = (mode) => {
    let state = ok('initialize', { seed: 42 }).state
    const member = state.staff.find((entry) => entry.id === 'staff_dir')
    for (const ability of Object.keys(member.abilities)) member.abilities[ability] = 60
    const blueprint = singleItemBlueprint(1000)
    blueprint.common[0].ability = 'direction'
    state = ok('instantiate_work', {
      state, blueprint, work_id: 'work_01', duration_weeks: 26
    }).state
    if (mode !== 'supervising') {
      state = addIdleSupervisor(state)
      state = assign(state, 'staff_pm')
      state.works[0].supervisor_staff_id = 'staff_pm'
      if (mode === 'backup') state = assign(state, 'staff_dir', null)
    }
    if (mode !== 'backup') state = assign(state, 'staff_dir')
    const advanced = ok('advance_week', { state })
    const item = findItem(advanced.state, 'work_01', 'common.series_comp')
    return advanced.report.works[0].items.find((row) => row.item_id === item.id).points
  }
  const supervising = run('supervising')
  const backup = run('backup')
  const ordinary = run('ordinary') - backup
  assert.ok(supervising > 0)
  assert.equal(ordinary, supervising * 2)
})

test('INV-27 开工即定岗：start_work 产出的在制项目自带合格监督', () => {
  const state = startedContract()
  assert.equal(supervisorOf(state, 'work_01'), 'staff_dir')
  const advanced = ok('advance_week', { state })
  assert.equal(supervisorOf(advanced.state, 'work_01'), 'staff_dir')
})

test('INV-27 名册无合格监督时拒绝开工，且不返回半条状态', () => {
  const state = ok('initialize', { seed: 7 }).state
  const stripped = JSON.parse(JSON.stringify(state))
  for (const member of stripped.staff) member.role = 'animator'
  const blocked = call('start_work', { state: stripped, offer_id: 'offer_01', mode: 'contract' })
  assert.equal(blocked.error?.code, 'INVALID_STATE', JSON.stringify(blocked))
  assert.match(blocked.error.message, /INV-27/)
  assert.equal(blocked.state, undefined)
  assert.equal(blocked.work_id, undefined)
})

test('INV-27 validate 查的是不变量：空缺、悬空引用、不合格人员都判红', () => {
  const state = startedContract()
  const vacant = JSON.parse(JSON.stringify(state))
  vacant.works[0].supervisor_staff_id = null
  assert.match(call('advance_week', { state: vacant }).error.message, /缺少监督岗位指派/)

  const dangling = JSON.parse(JSON.stringify(state))
  dangling.works[0].supervisor_staff_id = 'staff_ghost'
  assert.match(call('advance_week', { state: dangling }).error.message, /监督指向不存在的员工/)

  // staff_anim 是 animator，不在 §14.8 的硬资格职业集合内
  const unfit = JSON.parse(JSON.stringify(state))
  unfit.works[0].supervisor_staff_id = 'staff_anim'
  assert.match(call('advance_week', { state: unfit }).error.message, /监督任职资格不通过/)

  const fixture = setupTiny()
  fixture.works[0].supervisor_staff_id = null
  assert.match(call('advance_week', { state: fixture }).error.message, /缺少监督岗位指派/)
})

test('INV-27 缺 supervisor_staff_id 键的存档按非法输入拒绝，不被默认值掩盖', () => {
  const state = startedContract()
  const legacy = JSON.parse(JSON.stringify(state))
  delete legacy.works[0].supervisor_staff_id
  assert.equal(call('advance_week', { state: legacy }).error?.code, 'INVALID_INPUT')
})

test('INV-27 同一员工被两项目同时指定为监督时判重复', () => {
  let state = startedContract()
  state = addIdleSupervisor(state)
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  assert.deepEqual([supervisorOf(state, 'work_01'), supervisorOf(state, 'work_02')], ['staff_dir', 'staff_pm'])

  const duplicate = JSON.parse(JSON.stringify(state))
  duplicate.works[1].supervisor_staff_id = 'staff_dir'
  const before = ok('hash_state', { state: duplicate }).hash
  const conflict = call('advance_week', { state: duplicate })
  assert.equal(conflict.error?.code, 'INVALID_STATE', JSON.stringify(conflict))
  assert.match(conflict.error.message, /INV-27.*重复/)
  assert.equal(ok('hash_state', { state: duplicate }).hash, before)
})

test('INV-27 无合格替补时在任监督关键岗位锁定，调离命令整体作废', () => {
  let state = startedContract()
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  const before = ok('hash_state', { state }).hash

  const locked = call('assign_staff', { state, staff_id: 'staff_dir', work_id: null })
  assert.equal(locked.error?.code, 'INVALID_PHASE', JSON.stringify(locked))
  assert.match(locked.error.message, /关键岗位锁定/)
  assert.equal(ok('hash_state', { state }).hash, before)
  assert.equal(supervisorOf(state, 'work_01'), 'staff_dir')
  assert.equal(state.staff.find((member) => member.id === 'staff_dir').assignment_work_id, 'work_01')
})

test('INV-27 有合格替补时调离即原子换岗，回执里不留监督空缺', () => {
  let state = startedContract()
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state

  const withBackup = JSON.parse(JSON.stringify(state))
  const backup = JSON.parse(JSON.stringify(withBackup.staff.find((member) => member.id === 'staff_ka')))
  backup.id = 'staff_pm'
  backup.name = '赵制作'
  backup.role = 'production_manager'
  backup.assignment_work_id = null
  backup.last_participation = null
  withBackup.staff.push(backup)

  const swapped = ok('assign_staff', { state: withBackup, staff_id: 'staff_dir', work_id: null })
  assert.equal(supervisorOf(swapped.state, 'work_01'), 'staff_pm')
  assert.equal(swapped.state.staff.find((member) => member.id === 'staff_dir').assignment_work_id, null)
  // 岗位不改变职业身份（DEC-STAFF-008）
  assert.equal(swapped.state.staff.find((member) => member.id === 'staff_pm').role, 'production_manager')
})

test('INV-27 非法监督空缺不得借调人命令洗白，已有监督时不静默换岗', () => {
  let state = startedContract()
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  const withBackup = JSON.parse(JSON.stringify(state))
  const backup = JSON.parse(JSON.stringify(withBackup.staff.find((member) => member.id === 'staff_ka')))
  backup.id = 'staff_pm'
  backup.role = 'animation_director'
  backup.assignment_work_id = null
  backup.last_participation = null
  withBackup.staff.push(backup)

  // 非法存档必须先拒绝，不能靠调配命令删除违法事实后返回成功。
  const vacant = JSON.parse(JSON.stringify(withBackup))
  vacant.works[0].supervisor_staff_id = null
  const beforeHash = ok('hash_state', { state: withBackup }).hash
  const rejected = call('assign_staff', { state: vacant, staff_id: 'staff_pm', work_id: 'work_01' })
  assert.equal(rejected.error.code, 'INVALID_STATE')
  assert.match(rejected.error.message, /INV-27/)
  assert.equal(ok('hash_state', { state: withBackup }).hash, beforeHash)

  // 在任监督未被调走时，另一名合格员工只是以普通成员身份加入（§14.8 不改变岗位）
  const kept = ok('assign_staff', { state: withBackup, staff_id: 'staff_pm', work_id: 'work_01' })
  assert.equal(supervisorOf(kept.state, 'work_01'), 'staff_dir')
})

test('INV-27 跨项目调动普通成员不破坏两个项目的监督', () => {
  let state = startedContract()
  state = addIdleSupervisor(state)
  state = ok('start_work', { state, offer_id: 'offer_02', mode: 'contract' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' }).state
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_02' }).state

  const advanced = ok('advance_week', { state }).state
  assert.equal(supervisorOf(advanced, 'work_01'), 'staff_dir')
  assert.equal(supervisorOf(advanced, 'work_02'), 'staff_pm')
  assert.ok(allItems(advanced, 'work_02').some((item) => item.work_done > 0))
  assert.equal(advanced.staff.find((member) => member.id === 'staff_dir').assignment_work_id, 'work_01')
  assert.equal(advanced.staff.find((member) => member.id === 'staff_pm').assignment_work_id, 'work_02')
})

// ---- 招聘（M0 命令 5/6/7，§14.13.1）：与 scripts/lib/recruit-oracle.mjs 逐位对拍 ----

const rich = (state) => {
  const copy = JSON.parse(JSON.stringify(state))
  copy.finance.opening_funds += 50_000_000
  copy.finance.balance += 50_000_000
  return copy
}

const scoutCtx = (state, extra = {}) => ({
  seed: state.seed,
  week: state.company.week,
  company_status: state.company.status,
  pending_count: state.events.pending.length,
  last_scout_week: state.recruitment.last_scout_week,
  balance: state.finance.balance,
  pity: state.recruitment.pity,
  ...extra
})

test('initialize 招聘池与 oracle 逐候选一致', () => {
  for (const seed of [42, 20261127]) {
    const state = ok('initialize', { seed }).state
    // 6 个常规槽 + 1 张独立的临时用工卡
    assert.equal(state.recruitment.pool.length, 7)
    assert.deepEqual(state.recruitment.pity, { since_sr: 0, since_ssr: 0 })
    assert.equal(state.recruitment.last_scout_week, null)
    const regulars = state.recruitment.pool.filter((candidate) => candidate.origin === 'regular')
    assert.equal(regulars.length, 6)
    regulars.forEach((candidate, index) => {
      assert.equal(candidate.expires_week, null)
      const expected = generateCandidate(seed, 0, index, { purpose: PURPOSE.recruit })
      assert.deepEqual(candidate.staff, expected.staff)
    })
    const temporary = state.recruitment.pool.find((candidate) => candidate.origin === 'temporary')
    assert.equal(temporary.staff.employment, 'temporary')
    assert.deepEqual(temporary.staff, generateTemporary(seed, 0, 6, 100).staff)
  }
})

test('scout 成功：候选/保底/窗口/流水与 oracle 一致，同周第二次拒绝', () => {
  const state = ok('initialize', { seed: 42 }).state
  const result = ok('scout', { state })
  const expected = oracleScout(scoutCtx(state), state.recruitment.pool)
  assert.equal(expected.error, null)
  assert.deepEqual(result.added_ids, expected.added_ids)
  assert.deepEqual(result.state.recruitment.pool, expected.pool)
  assert.deepEqual(result.state.recruitment.pity, expected.pity)
  assert.equal(result.state.recruitment.last_scout_week, 0)
  const added = result.state.recruitment.pool.find((candidate) => candidate.staff.id === result.added_ids[0])
  assert.equal(added.origin, 'scout')
  assert.equal(added.expires_week, 2)
  const entry = result.state.finance.entries.find((item) => item.id === 'w0.operations.scout')
  assert.equal(entry.category, 'operations')
  assert.equal(entry.amount, -50000)
  assert.equal(result.state.finance.balance, state.finance.balance - 50000)
  assert.equal(call('scout', { state: result.state }).error.code, 'INVALID_PHASE')
})

test('scout 定向：role 与 focus_ability 的强制职业与 oracle 一致', () => {
  const state = ok('initialize', { seed: 42 }).state
  const byRole = ok('scout', { state, role: '脚本' })
  assert.deepEqual(byRole.state.recruitment.pool, oracleScout(scoutCtx(state, { role: '脚本' }), state.recruitment.pool).pool)
  const byFocus = ok('scout', { state, focus_ability: 'drawing' })
  assert.deepEqual(byFocus.state.recruitment.pool, oracleScout(scoutCtx(state, { focus_ability: 'drawing' }), state.recruitment.pool).pool)
  assert.equal(byFocus.state.recruitment.pool.at(-1).staff.role, '作画')
  assert.equal(call('scout', { state, role: '作画', focus_ability: 'drawing' }).error.code, 'INVALID_INPUT')
  assert.equal(call('scout', { state, role: 'nope' }).error.code, 'INVALID_INPUT')
  assert.equal(call('scout', { state, focus_ability: 'nope' }).error.code, 'INVALID_INPUT')
  assert.equal(call('scout', { state, focus_ability: 'animation' }).error.code, 'INVALID_INPUT')
  assert.equal(call('scout', { state, focus_ability: 'management' }).error.code, 'INVALID_INPUT')
})

test('scout 守卫：pending 事件与资金不足', () => {
  let state = rich(setupTiny(20261127))
  for (let i = 0; i < 24 && state.events.pending.length === 0; i++) {
    state = ok('advance_week', { state }).state
  }
  assert.ok(state.events.pending.length > 0, '夹具应在 24 周内产生待处理事件')
  assert.equal(call('scout', { state }).error.code, 'INVALID_PHASE')
  const poor = ok('initialize', { seed: 42 }).state
  poor.finance.opening_funds = 1000
  poor.finance.balance = 1000
  assert.equal(call('scout', { state: poor }).error.code, 'INSUFFICIENT_FUNDS')
})

test('scout 跨周：保底计数推进与 oracle 一致', () => {
  let state = ok('initialize', { seed: 42 }).state
  const first = ok('scout', { state })
  state = ok('advance_week', { state: first.state }).state
  const second = ok('scout', { state })
  const expected = oracleScout(scoutCtx(state), state.recruitment.pool)
  assert.deepEqual(second.state.recruitment.pool, expected.pool)
  assert.deepEqual(second.state.recruitment.pity, expected.pity)
  assert.equal(second.state.recruitment.last_scout_week, 1)
})

test('hire_temporary：解包签约、项目合同、临时账目与延期联动', () => {
  const started = ok('start_work', {
    state: funded(ok('initialize', { seed: 42 }).state),
    offer_id: 'offer_01',
    mode: 'committee',
    percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  })
  const state = started.state
  const candidate = addTemporaryCandidate(state)
  const balanceBefore = state.finance.balance
  const poolBefore = state.recruitment.pool.length
  const hired = ok('hire_temporary', { state, work_id: started.work_id, candidate_id: candidate.id })
  assert.equal(hired.staff_id, candidate.id)
  assert.equal(hired.state.recruitment.pool.length, poolBefore - 1)
  assert.ok(!hired.state.recruitment.pool.some((entry) => entry.staff.id === candidate.id))
  const member = hired.state.staff.find((entry) => entry.id === candidate.id)
  assert.equal(member.employment, 'temporary')
  assert.equal(member.assignment_work_id, started.work_id)
  assert.deepEqual(member.temporary_contract, { work_id: started.work_id, start_week: 0, end_week: 52 })
  assert.equal('origin' in member, false)
  assert.equal('expires_week' in member, false)
  const signing = hired.state.finance.entries.find((entry) => entry.id === `w0.temporary.${candidate.id}.signing`)
  assert.equal(signing.category, 'temporary')
  assert.equal(signing.work_id, started.work_id)
  assert.equal(signing.amount, -candidate.signing_fee)
  assert.equal(hired.state.finance.balance, balanceBefore - candidate.signing_fee)

  const extended = ok('request_extension', { state: hired.state, work_id: started.work_id })
  assert.equal(extended.state.staff.find((entry) => entry.id === candidate.id).temporary_contract.end_week, 56)
  const experienceBefore = structuredClone(member.experience)
  const advanced = ok('advance_week', { state: extended.state })
  const salary = advanced.state.finance.entries.find((entry) => entry.id === `w0.temporary.${candidate.id}.salary`)
  assert.equal(salary.category, 'temporary')
  assert.equal(salary.work_id, started.work_id)
  assert.equal(salary.amount, -candidate.weekly_salary)
  assert.equal(advanced.report.funds.costs.salary, 786000)
  assert.equal(advanced.report.funds.costs.temporary, candidate.weekly_salary)
  assert.deepEqual(advanced.state.staff.find((entry) => entry.id === candidate.id).experience, experienceBefore)
  assert.equal(advanced.state.finance.opening_funds + advanced.state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0), advanced.state.finance.balance)
})

test('临时候选：能力按声望档、单点补位、周薪 1.2 倍与两周签约费', () => {
  const bands = [[100, 42, 52], [249, 42, 52], [250, 56, 65], [9999, 56, 65], [10000, 66, 74], [300000, 66, 74]]
  for (const [reputation, low, high] of bands) {
    const state = ok('initialize', { seed: 42 }).state
    state.company.reputation = reputation
    const card = refreshTemporary(state.recruitment.pool, 42, 0, reputation)
      .find((candidate) => candidate.origin === 'temporary')
    const primaryAbility = { 作画: 'drawing', 演出: 'direction', 脚本: 'planning', 摄影: 'postproduction',
      监督: 'direction', 音乐: 'postproduction', 声优: 'postproduction', 美术: 'drawing' }[card.staff.role]
    const primary = card.staff.abilities[primaryAbility]
    assert.ok(primary >= low && primary <= high, `声望 ${reputation} 主能力应在 ${low}–${high}：${primary}`)
    for (const [ability, value] of Object.entries(card.staff.abilities)) {
      if (ability === primaryAbility) continue
      assert.equal(value, low, `${ability} 应压在档位下限 ${low}`)
    }
    assert.equal(card.staff.weekly_salary, Math.floor((20000 + primary * 300) * 1.2))
    assert.equal(card.staff.signing_fee, card.staff.weekly_salary * 2)
    assert.equal(card.staff.employment, 'temporary')
    assert.deepEqual(Object.values(card.staff.experience), [0, 0, 0, 0, 0, 0])
  }
})

test('临时候选：签走后下周补位，且不占用常规 6 槽', () => {
  let state = ok('initialize', { seed: 42 }).state
  state = ok('start_work', { state, offer_id: 'offer_01', mode: 'contract' }).state
  const card = state.recruitment.pool.find((candidate) => candidate.origin === 'temporary')
  const hired = ok('hire_temporary', { state, work_id: 'work_01', candidate_id: card.staff.id })
  assert.ok(!hired.state.recruitment.pool.some((candidate) => candidate.origin === 'temporary'), '签走后池里暂时没有临时卡')

  const advanced = ok('advance_week', { state: hired.state })
  const refreshed = advanced.state.recruitment.pool.filter((candidate) => candidate.origin === 'temporary')
  assert.equal(refreshed.length, 1, '下周应补一张临时卡')
  assert.notEqual(refreshed[0].staff.id, card.staff.id, '补位的是新候选，不是原卡')
  assert.equal(advanced.state.recruitment.pool.filter((candidate) => candidate.origin === 'regular').length, 6)
  const hiredMember = advanced.state.staff.find((member) => member.id === card.staff.id)
  assert.equal(hiredMember.employment, 'temporary')
  assert.equal(hiredMember.temporary_contract.work_id, 'work_01')
})

test('hire_temporary：声望 Tier 弹性工位上限按公司总人数计算', () => {
  const cases = [
    [99, 1], [100, 1], [249, 1], [250, 2], [599, 2], [600, 2], [1999, 2],
    [2000, 3], [9999, 3], [10000, 3], [59999, 3], [60000, 4], [299999, 4], [300000, 4]
  ]
  for (const [reputation, capacity] of cases) {
    let state = funded(setupTiny(42))
    state.company.reputation = reputation
    for (let index = 0; index < capacity; index++) {
      const candidate = addTemporaryCandidate(state, `temp_${reputation}_${index}`)
      state = ok('hire_temporary', { state, work_id: 'work_01', candidate_id: candidate.id }).state
    }
    const extra = addTemporaryCandidate(state, `temp_${reputation}_overflow`)
    const before = ok('hash_state', { state }).hash
    const result = call('hire_temporary', { state, work_id: 'work_01', candidate_id: extra.id })
    assert.equal(result.error.code, 'CAPACITY_EXCEEDED', `声望 ${reputation} 的工位上限应为 ${capacity}`)
    assert.equal('state' in result, false)
    assert.equal(ok('hash_state', { state }).hash, before)
  }
})

test('hire_temporary：工位上限不按项目分别计算', () => {
  let state = funded(setupTiny(42))
  state = addIdleSupervisor(state)
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_02', duration_weeks: 26 }).state
  const first = addTemporaryCandidate(state, 'temp_work_01')
  state = ok('hire_temporary', { state, work_id: 'work_01', candidate_id: first.id }).state
  const second = addTemporaryCandidate(state, 'temp_work_02')
  const before = ok('hash_state', { state }).hash
  const result = call('hire_temporary', { state, work_id: 'work_02', candidate_id: second.id })
  assert.equal(result.error.code, 'CAPACITY_EXCEEDED')
  assert.equal('state' in result, false)
  assert.equal(ok('hash_state', { state }).hash, before)
})

test('hire_temporary：错误守卫与资金不足失败原子', () => {
  let state = funded(setupTiny(42))
  const candidate = addTemporaryCandidate(state)
  assert.equal(call('hire_temporary', { state }).error.code, 'INVALID_INPUT')
  assert.equal(call('hire_temporary', { state, work_id: 'missing', candidate_id: candidate.id }).error.code, 'NOT_FOUND')
  assert.equal(call('hire_temporary', { state, work_id: 'work_01', candidate_id: 'missing' }).error.code, 'NOT_FOUND')
  const coreCandidate = state.recruitment.pool.find((entry) => entry.staff.employment === 'core')
  assert.equal(call('hire_temporary', { state, work_id: 'work_01', candidate_id: coreCandidate.staff.id }).error.code, 'INVALID_INPUT')

  const poor = setupTiny(42)
  const poorCandidate = addTemporaryCandidate(poor)
  poor.finance.entries.push({
    id: 'manual.cash.drain', week: 0, work_id: null, category: 'production', amount: -poor.finance.balance, memo: 'fixture'
  })
  poor.finance.balance = 0
  const before = ok('hash_state', { state: poor }).hash
  const result = call('hire_temporary', { state: poor, work_id: 'work_01', candidate_id: poorCandidate.id })
  assert.equal(result.error.code, 'INSUFFICIENT_FUNDS')
  assert.equal('state' in result, false)
  assert.equal(ok('hash_state', { state: poor }).hash, before)

  const scouted = ok('scout', { state: funded(setupTiny(43)) }).state
  const expiring = scouted.recruitment.pool.at(-1)
  forceTemporary(expiring.staff)
  expiring.staff.temporary_contract = null
  scouted.company.week = expiring.expires_week
  assert.equal(call('hire_temporary', { state: scouted, work_id: 'work_01', candidate_id: expiring.staff.id }).error.code, 'NOT_FOUND')

  state = funded(setupTiny(44))
  state.works[0].status = 'planning'
  for (const member of state.staff) member.assignment_work_id = null
  const settledCandidate = addTemporaryCandidate(state, 'temp_settled')
  assert.equal(call('hire_temporary', { state, work_id: 'work_01', candidate_id: settledCandidate.id }).error.code, 'INVALID_PHASE')
})

test('hire_temporary：主动关闭保留合同至实际结清并写入团队快照', () => {
  let state = funded(setupTiny(45))
  const candidate = addTemporaryCandidate(state, 'temp_closing')
  state = ok('hire_temporary', { state, work_id: 'work_01', candidate_id: candidate.id }).state
  const item = allItems(state, 'work_01')[0]
  item.work_done = 1
  item.contributors.push(candidate.id)

  const closing = ok('end_company', { state })
  assert.equal(closing.state.company.status, 'closing')
  assert.equal(closing.state.works[0].status, 'delivering')
  const member = closing.state.staff.find((entry) => entry.id === candidate.id)
  assert.equal(member.assignment_work_id, 'work_01')
  assert.deepEqual(member.temporary_contract, { work_id: 'work_01', start_week: 0, end_week: 26 })
  assert.ok(ok('hash_state', { state: closing.state }).hash)

  const finalized = ok('finalize_delivery', { state: closing.state, work_id: 'work_01' })
  assert.equal(finalized.company_status, 'ended')
  assert.equal(finalized.state.staff.some((entry) => entry.id === candidate.id), false)
  assert.ok(finalized.state.archive.works[0].team.some((entry) => entry.id === candidate.id))
})

test('hire_temporary：破产关闭同样保留合同并可原子结清', () => {
  let state = funded(setupTiny(46))
  const candidate = addTemporaryCandidate(state, 'temp_bankrupt')
  state = ok('hire_temporary', { state, work_id: 'work_01', candidate_id: candidate.id }).state
  state.finance.entries.push({
    id: 'manual.cash.drain', week: 0, work_id: null, category: 'production', amount: -state.finance.balance, memo: 'fixture'
  })
  state.finance.balance = 0

  const bankrupt = ok('advance_week', { state })
  assert.equal(bankrupt.report.bankrupt, true)
  assert.equal(bankrupt.state.company.status, 'closing')
  assert.equal(bankrupt.state.works[0].status, 'delivering')
  assert.equal(bankrupt.state.staff.find((entry) => entry.id === candidate.id).assignment_work_id, 'work_01')
  assert.ok(ok('hash_state', { state: bankrupt.state }).hash)
  const finalized = ok('finalize_delivery', { state: bankrupt.state, work_id: 'work_01' })
  assert.equal(finalized.company_status, 'ended')
  assert.equal(finalized.state.staff.some((entry) => entry.id === candidate.id), false)
})

test('hire_temporary：第 520 周终局保留合同至最终交付', () => {
  let state = funded(ok('initialize', { seed: 47 }).state)
  state.company.week = 519
  state = ok('instantiate_work', { state, blueprint: tiny, work_id: 'work_01', duration_weeks: 26 }).state
  state = ok('assign_staff', { state, staff_id: 'staff_dir', work_id: 'work_01' }).state
  const candidate = addTemporaryCandidate(state, 'temp_time_limit')
  state = ok('hire_temporary', { state, work_id: 'work_01', candidate_id: candidate.id }).state

  const terminal = ok('advance_week', { state })
  assert.equal(terminal.state.company.week, 520)
  assert.equal(terminal.state.company.end_reason, 'time_limit')
  assert.equal(terminal.state.company.status, 'closing')
  assert.equal(terminal.state.works[0].status, 'delivering')
  assert.equal(terminal.state.staff.find((entry) => entry.id === candidate.id).assignment_work_id, 'work_01')
  assert.ok(ok('hash_state', { state: terminal.state }).hash)
  const finalized = ok('finalize_delivery', { state: terminal.state, work_id: 'work_01' })
  assert.equal(finalized.company_status, 'ended')
  assert.equal(finalized.state.staff.some((entry) => entry.id === candidate.id), false)
})

test('hire_core：解包入册、包装字段不残留、签约费流水', () => {
  let state = ok('initialize', { seed: 42 }).state
  state = ok('dismiss_staff', { state, staff_id: 'staff_post' }).state
  const candidate = state.recruitment.pool[0]
  const before = state.finance.balance
  const result = ok('hire_core', { state, staff_id: candidate.staff.id })
  assert.equal(result.staff_id, candidate.staff.id)
  assert.equal(result.state.staff.length, 4)
  const hired = result.state.staff.find((member) => member.id === candidate.staff.id)
  assert.deepEqual(hired, candidate.staff)
  assert.equal('expires_week' in hired, false)
  assert.equal('origin' in hired, false)
  assert.equal(result.state.recruitment.pool.length, 6)
  assert.ok(!result.state.recruitment.pool.some((entry) => entry.staff.id === candidate.staff.id))
  const entry = result.state.finance.entries.find((item) => item.id === `w0.salary.${candidate.staff.id}.signing`)
  assert.equal(entry.category, 'salary')
  assert.equal(entry.amount, -candidate.staff.signing_fee)
  assert.equal(result.state.finance.balance, before - candidate.staff.signing_fee)
  assert.equal(call('hire_core', { state, staff_id: 'nobody' }).error.code, 'NOT_FOUND')
})

test('hire_core：过期 scout 候选不可签约且失败原子', () => {
  let state = ok('initialize', { seed: 42 }).state
  state = ok('scout', { state }).state
  const candidate = state.recruitment.pool.at(-1)
  state.company.week = candidate.expires_week
  const before = ok('hash_state', { state }).hash
  const result = call('hire_core', { state, staff_id: candidate.staff.id })
  assert.equal(result.error.code, 'NOT_FOUND')
  assert.equal('state' in result, false)
  assert.equal(ok('hash_state', { state }).hash, before)
})

test('hire_core：拒绝带临时合同或非 core 的池候选', () => {
  const state = ok('initialize', { seed: 42 }).state
  const candidate = state.recruitment.pool[0]
  const temporary = JSON.parse(JSON.stringify(state))
  forceTemporary(temporary.recruitment.pool[0].staff)
  temporary.recruitment.pool[0].staff.temporary_contract = { work_id: 'work_01', start_week: 0, end_week: 2 }
  const result = call('hire_core', { state: temporary, staff_id: candidate.staff.id })
  assert.equal(result.error.code, 'INVALID_INPUT')
  assert.equal('state' in result, false)
})

test('hire_core：资金不足与开局正式编制上限 4', () => {
  const poor = ok('initialize', { seed: 42 }).state
  poor.finance.opening_funds = 0
  poor.finance.balance = 0
  assert.equal(call('hire_core', { state: poor, staff_id: poor.recruitment.pool[0].staff.id }).error.code, 'INSUFFICIENT_FUNDS')
  let state = rich(ok('initialize', { seed: 42 }).state)
  assert.equal(state.staff.length, 4)
  assert.equal(call('hire_core', { state, staff_id: state.recruitment.pool[0].staff.id }).error.code, 'CAPACITY_EXCEEDED')
})

test('hire_core 新员工当周可分配（§14.4）', () => {
  let state = setupTiny(42)
  state = ok('dismiss_staff', { state, staff_id: 'staff_post' }).state
  const candidate = state.recruitment.pool[0]
  state = ok('hire_core', { state, staff_id: candidate.staff.id }).state
  state = ok('assign_staff', { state, staff_id: candidate.staff.id, work_id: 'work_01' }).state
  assert.equal(state.staff.find((member) => member.id === candidate.staff.id).assignment_work_id, 'work_01')
})

test('dismiss_staff：移出名册、不预付遣散费', () => {
  const state = ok('initialize', { seed: 42 }).state
  const entriesBefore = state.finance.entries.length
  const balanceBefore = state.finance.balance
  const result = ok('dismiss_staff', { state, staff_id: 'staff_ka' })
  assert.equal(result.state.staff.length, 3)
  assert.ok(!result.state.staff.some((member) => member.id === 'staff_ka'))
  assert.equal(result.state.finance.entries.length, entriesBefore)
  assert.equal(result.state.finance.balance, balanceBefore)
  assert.equal(call('dismiss_staff', { state, staff_id: 'nobody' }).error.code, 'NOT_FOUND')
})

test('dismiss_staff：解雇后至少保留 1 名核心员工', () => {
  let state = ok('initialize', { seed: 42 }).state
  state = ok('dismiss_staff', { state, staff_id: 'staff_ka' }).state
  state = ok('dismiss_staff', { state, staff_id: 'staff_anim' }).state
  state = ok('dismiss_staff', { state, staff_id: 'staff_post' }).state
  assert.equal(state.staff.length, 1)
  assert.equal(call('dismiss_staff', { state, staff_id: 'staff_dir' }).error.code, 'INVALID_PHASE')
})

test('dismiss_staff：监督关键岗位锁定与原子替换', () => {
  const state = setupTiny(42)
  assert.equal(supervisorOf(state, 'work_01'), 'staff_dir')
  const locked = call('dismiss_staff', { state, staff_id: 'staff_dir' })
  assert.equal(locked.error.code, 'INVALID_PHASE')
  assert.match(locked.error.message, /关键岗位锁定/)
  const withBackup = addIdleSupervisor(state)
  const replaced = ok('dismiss_staff', { state: withBackup, staff_id: 'staff_dir' })
  assert.equal(supervisorOf(replaced.state, 'work_01'), 'staff_pm')
  assert.ok(!replaced.state.staff.some((member) => member.id === 'staff_dir'))
})

test('dismiss_staff：历史 contributors 不阻止解雇且保持不变', () => {
  let state = setupTiny(42)
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' }).state
  state = ok('advance_week', { state }).state
  assert.ok(allItems(state, 'work_01').some((item) => item.contributors.includes('staff_ka')))
  const dismissed = ok('dismiss_staff', { state, staff_id: 'staff_ka' })
  assert.equal(dismissed.state.staff.some((member) => member.id === 'staff_ka'), false)
  assert.ok(allItems(dismissed.state, 'work_01').some((item) => item.contributors.includes('staff_ka')))
})

test('dismiss_staff：Archive 团队历史不阻止解雇且快照保持不变', () => {
  let state = setupTiny(42)
  state = ok('assign_staff', { state, staff_id: 'staff_ka', work_id: 'work_01' }).state
  state = ok('advance_week', { state }).state
  state = completeWork(state, 'work_01', 80)
  state = ok('deliver_work', { state, work_id: 'work_01' }).state
  assert.ok(state.archive.works[0].team.some((member) => member.id === 'staff_ka'))
  const dismissed = ok('dismiss_staff', { state, staff_id: 'staff_ka' })
  assert.equal(dismissed.state.staff.some((member) => member.id === 'staff_ka'), false)
  assert.ok(dismissed.state.archive.works[0].team.some((member) => member.id === 'staff_ka'))
})

test('advance_week 招聘池周步骤：部分轮换与 oracle rotatePool 一致', () => {
  const state = ok('initialize', { seed: 42 }).state
  const advanced = ok('advance_week', { state }).state
  const expected = refreshTemporary(rotatePool(state.recruitment.pool, 42, 1).pool, 42, 1, state.company.reputation)
  assert.deepEqual(advanced.recruitment.pool, expected)
  assert.equal(advanced.company.week, 1)
})

test('advance_week 招聘池轮换落点碰撞时仍无放回替换两个槽', () => {
  const state = ok('initialize', { seed: 2 }).state
  state.company.week = 2
  const advanced = ok('advance_week', { state }).state
  const expected = rotatePool(state.recruitment.pool, 2, 3)
  assert.deepEqual(advanced.recruitment.pool,
    refreshTemporary(expected.pool, 2, 3, state.company.reputation))
  assert.equal(expected.added_ids.length, 2)
  assert.equal(new Set(expected.added_ids).size, 2)
  assert.equal(advanced.recruitment.pool.filter((candidate) => candidate.origin === 'regular').length, 6)
})

test('scout 窗口：expires_week 是首个不可签约周，regular 不受影响', () => {
  let state = ok('initialize', { seed: 42 }).state
  state = ok('scout', { state }).state
  const scoutId = state.recruitment.pool.at(-1).staff.id
  const poolAfterScout = state.recruitment.pool
  state = ok('advance_week', { state }).state
  assert.deepEqual(state.recruitment.pool,
    refreshTemporary(rotatePool(poolAfterScout, 42, 1).pool, 42, 1, state.company.reputation))
  assert.ok(state.recruitment.pool.some((candidate) => candidate.staff.id === scoutId))
  state = ok('advance_week', { state }).state
  assert.ok(!state.recruitment.pool.some((candidate) => candidate.staff.id === scoutId))
  assert.ok(state.recruitment.pool.every((candidate) => candidate.origin !== 'regular' || candidate.expires_week === null))
})

// ---- 市场生命周期（M0 命令 23 / §14.13.2）：与 scripts/lib/market-oracle.mjs 逐位对拍 ----

const withOffers = (state, offers) => {
  const copy = structuredClone(state)
  copy.market.slots = offers
  return copy
}

test('initialize 市场：4 个 fixture 槽带齐生命周期字段', () => {
  const state = ok('initialize', { seed: 42 }).state
  assert.equal(state.market.slots.length, 4)
  for (const offer of state.market.slots) {
    assert.equal(offer.expires_week, 3)
    assert.equal(offer.locked_until, null)
    assert.equal(offer.lock_used, false)
    assert.equal(offer.deposit_paid, 0)
    assert.equal(offer.offer_source_type, 'market')
    assert.equal(offer.deposit_basis, offer.contract_budget)
    assert.equal(offer.contract_budget, 170000000)
    assert.equal(offer.duration_weeks, 52)
    assert.equal(offer.episode_count, 10)
    assert.equal(offer.target_quality, 65)
    assert.equal(offer.deposit_rate_permille, 55)
    assert.equal(offer.deposit_amount, 9350000)
  }
})

test('市场生成企划只使用已注册 TV 蓝图，可正常立项', () => {
  for (const seed of [42, 7, 20261127]) {
    for (const week of [0, 1, 2]) {
      for (const index of [0, 1]) {
        const offer = generateOffer(seed, week, index)
        assert.equal(offer.scale, 'tv')
        assert.equal(offer.blueprint_id, 'tv_standard')
        assert.equal(offer.contract_budget, 170000000)
        assert.equal(offer.duration_weeks, 52)
        assert.equal(offer.target_quality, 65)
        assert.equal(offer.episode_count, 10)
        assert.equal(offer.deposit_rate_permille, 55)
        assert.equal(offer.deposit_amount, 9350000)
      }
    }
  }
  const base = ok('initialize', { seed: 42 }).state
  const offer = generateOffer(42, 0, 0)
  offer.min_reputation = 0
  const started = ok('start_work', {
    state: withOffers(base, [offer]), offer_id: offer.id, mode: 'contract'
  })
  assert.equal(started.state.works[0].offer.blueprint_id, 'tv_standard')
})

test('advance_week 市场周步骤：释放→过期→补充与 oracle weeklyMarketStep 一致', () => {
  for (const seed of [42, 20261127]) {
    const base = ok('initialize', { seed }).state
    const offers = [0, 1, 2].map((i) => generateOffer(seed, 0, i))
    offers[0].expires_week = 1
    offers[1].expires_week = 1
    let state = rich(withOffers(base, offers))
    state = ok('lock_offer', { state, offer_id: offers[1].id }).state
    const lockedSlots = structuredClone(state.market.slots)
    state = ok('advance_week', { state }).state
    const expected = weeklyMarketStep(lockedSlots, seed, 1, base.company.reputation)
    assert.deepEqual(state.market.slots, expected.slots)
    assert.equal(state.market.refresh_week, 1)
  }
})

test('企划到期边界：expires_week 首个失效周，锁定期内受保护，W+2 开局释放', () => {
  const seed = 7
  const base = ok('initialize', { seed }).state
  const offer = generateOffer(seed, 0, 0)
  offer.expires_week = 2
  let state = withOffers(base, [offer])
  state = ok('advance_week', { state }).state
  assert.ok(state.market.slots.some((o) => o.id === offer.id))
  state = ok('lock_offer', { state, offer_id: offer.id }).state
  state = ok('advance_week', { state }).state
  assert.ok(state.market.slots.some((o) => o.id === offer.id), 'expires_week 到达但锁定期内受保护')
  state = ok('advance_week', { state }).state
  assert.ok(!state.market.slots.some((o) => o.id === offer.id), 'locked_until 开局释放槽位')
})

test('lock_offer：TV 小定金 5.5%、locked_until=week+2、终身一次、Finance 唯一一笔', () => {
  let state = rich(ok('initialize', { seed: 42 }).state)
  const offer = state.market.slots[0]
  const before = state.finance.balance
  const receipt = ok('lock_offer', { state, offer_id: offer.id })
  assert.equal(receipt.offer_id, offer.id)
  const deposit = depositAmount(offer)
  assert.equal(deposit, 9350000)
  assert.equal(receipt.deposit_paid, deposit)
  const locked = receipt.state.market.slots.find((o) => o.id === offer.id)
  assert.equal(locked.locked_until, state.company.week + 2)
  assert.equal(locked.lock_used, true)
  assert.equal(locked.deposit_paid, deposit)
  assert.equal(receipt.state.finance.balance, before - deposit)
  const entry = receipt.state.finance.entries.at(-1)
  assert.equal(entry.id, `w${state.company.week}.production.${offer.id}.deposit`)
  assert.equal(entry.category, 'production')
  assert.equal(entry.amount, -deposit)
  assert.equal(call('lock_offer', { state: receipt.state, offer_id: offer.id }).error.code, 'INVALID_INPUT')
})

test('lock_offer 守卫：NOT_FOUND/INVALID_INPUT/INSUFFICIENT_FUNDS', () => {
  const state = ok('initialize', { seed: 42 }).state
  assert.equal(call('lock_offer', { state, offer_id: 'offer_nope' }).error.code, 'NOT_FOUND')
  assert.equal(call('lock_offer', { state, offer_id: 5 }).error.code, 'INVALID_INPUT')
  const expensive = generateOffer(42, 0, 0)
  delete expensive.deposit_amount
  delete expensive.deposit_rate_permille
  expensive.deposit_basis = 500_000_000
  const poor = withOffers(state, [expensive])
  const rejected = call('lock_offer', { state: poor, offer_id: expensive.id })
  assert.equal(rejected.error.code, 'INSUFFICIENT_FUNDS')
  assert.equal(rejected.error.gap, 25_000_000 - poor.finance.balance)
})

test('lock_offer：IP 上门企划定金 10%，档位由来源分类决定', () => {
  let state = rich(ok('initialize', { seed: 42 }).state)
  const offer = generateOffer(42, 0, 0, { sourceType: 'ip_visit' })
  state = withOffers(state, [offer])
  const receipt = ok('lock_offer', { state, offer_id: offer.id })
  assert.equal(receipt.deposit_paid, Math.floor((offer.deposit_basis * 100) / 1000))
})

test('lock_offer：大定金基数使用安全算术，不溢出', () => {
  const state = ok('initialize', { seed: 42 }).state
  const offer = generateOffer(42, 0, 0, { sourceType: 'ip_visit' })
  delete offer.deposit_amount
  offer.deposit_basis = 92233720368547760
  const expectedDeposit = Math.floor(offer.deposit_basis / 1000) * 100 +
    Math.floor((offer.deposit_basis % 1000) * 100 / 1000)
  const rejected = call('lock_offer', { state: withOffers(state, [offer]), offer_id: offer.id })
  assert.equal(rejected.error.code, 'INSUFFICIENT_FUNDS')
  assert.equal(rejected.error.gap, expectedDeposit - state.finance.balance)
})

test('start_work：锁定快照必须与唯一 Finance 定金流水对账', () => {
  const base = rich(ok('initialize', { seed: 42 }).state)
  const forged = generateOffer(42, 0, 0)
  forged.locked_until = 2
  forged.lock_used = true
  forged.deposit_paid = depositAmount(forged)
  assert.equal(call('start_work', {
    state: withOffers(base, [forged]), offer_id: forged.id, mode: 'contract'
  }).error.code, 'INVALID_STATE')

  let locked = base
  const offer = locked.market.slots[0]
  locked = ok('lock_offer', { state: locked, offer_id: offer.id }).state
  const tampered = structuredClone(locked)
  tampered.market.slots.find((o) => o.id === offer.id).deposit_paid += 1
  assert.equal(call('start_work', {
    state: tampered, offer_id: offer.id, mode: 'contract'
  }).error.code, 'INVALID_STATE')

  const corruptId = structuredClone(locked)
  corruptId.finance.entries.find((e) => e.counterparty === offer.id).id += '.corrupt'
  assert.equal(call('start_work', {
    state: corruptId, offer_id: offer.id, mode: 'contract'
  }).error.code, 'INVALID_STATE')
})

test('lock_offer：有待处理事件时拒绝（INVALID_PHASE）', () => {
  let state = rich(setupTiny(20261127))
  for (let i = 0; i < 24 && state.events.pending.length === 0; i++) state = ok('advance_week', { state }).state
  assert.ok(state.events.pending.length > 0)
  assert.equal(call('lock_offer', { state, offer_id: state.market.slots[0].id }).error.code, 'INVALID_PHASE')
})

test('lock_offer：企划离开市场后回归仍拒绝再锁（Finance 终身历史不可绕过）', () => {
  let state = rich(ok('initialize', { seed: 42 }).state)
  const offer = generateOffer(42, 0, 0)
  offer.expires_week = 10
  state = withOffers(state, [offer])
  state = ok('lock_offer', { state, offer_id: offer.id }).state
  state.market.slots = []
  state.market.slots.push(structuredClone(offer))
  const entriesBefore = structuredClone(state.finance.entries)
  const rejected = call('lock_offer', { state, offer_id: offer.id })
  assert.equal(rejected.error.code, 'INVALID_STATE')
  assert.deepEqual(state.finance.entries, entriesBefore)
})

test('lock_offer：损坏流水 ID 仍作为终身历史，不能重复锁定', () => {
  let state = rich(ok('initialize', { seed: 42 }).state)
  const offer = generateOffer(42, 0, 0)
  offer.expires_week = 10
  state = withOffers(state, [offer])
  state = ok('lock_offer', { state, offer_id: offer.id }).state
  state.finance.entries.find((e) => e.counterparty === offer.id).id += '.corrupt'
  state.market.slots = []
  state.market.slots.push(structuredClone(offer))
  const entriesBefore = structuredClone(state.finance.entries)
  const rejected = call('lock_offer', { state, offer_id: offer.id })
  assert.equal(rejected.error.code, 'INVALID_STATE')
  assert.deepEqual(state.finance.entries, entriesBefore)
})

test('定金基数生成时固定：后续预算调整不追溯改变定金', () => {
  let state = rich(ok('initialize', { seed: 42 }).state)
  const offer = generateOffer(42, 0, 0)
  state = withOffers(state, [offer])
  state.market.slots[0].contract_budget = offer.contract_budget * 2
  const receipt = ok('lock_offer', { state, offer_id: offer.id })
  assert.equal(receipt.deposit_paid, depositAmount(offer))
})

test('start_work：锁定期内定金 100% 抵扣，投资流水按差额入账', () => {
  let state = funded(ok('initialize', { seed: 42 }).state)
  const offer = state.market.slots[0]
  state = ok('lock_offer', { state, offer_id: offer.id }).state
  const lockedOffer = state.market.slots.find((o) => o.id === offer.id)
  const deposit = lockedOffer.deposit_paid
  const before = state.finance.balance
  const started = ok('start_work', {
    state, offer_id: offer.id, mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  })
  const paid = (offer.contract_budget * 2 * 50) / 100
  const oracle = startWorkCash(lockedOffer, paid, 0)
  assert.equal(oracle.deposit_applied, deposit)
  assert.equal(oracle.cash_due, paid - deposit)
  const entry = started.state.finance.entries.find((e) => e.id === `w0.investment.${started.work_id}`)
  assert.equal(entry.amount, -(paid - deposit))
  assert.equal(started.state.finance.balance, before + offer.contract_budget - (paid - deposit))
  const work = started.state.works.find((w) => w.id === started.work_id)
  assert.equal(work.investment.paid, paid)
})

test('start_work：抵扣以应付款为上限，cash_due=0 不产生投资流水', () => {
  let state = funded(ok('initialize', { seed: 42 }).state)
  const offer = generateOffer(42, 0, 0)
  offer.scale = 'tv'
  offer.episode_count = 10
  offer.min_reputation = 0
  offer.contract_budget = 100000
  delete offer.deposit_amount
  offer.deposit_basis = 50_000_000
  state = withOffers(state, [offer])
  state = ok('lock_offer', { state, offer_id: offer.id }).state
  const started = ok('start_work', {
    state, offer_id: offer.id, mode: 'committee', percent: 50,
    committee_partner_ids: ['partner_tv', 'partner_stream']
  })
  assert.ok(!started.state.finance.entries.some((e) => e.id === `w0.investment.${started.work_id}`))
  const work = started.state.works.find((w) => w.id === started.work_id)
  assert.equal(work.investment.paid, 100000)
})

test('start_work：自然到期边界与 W+2 锁定开局均拒绝开工', () => {
  const base = rich(ok('initialize', { seed: 42 }).state)
  const expired = generateOffer(42, 0, 0)
  expired.expires_week = base.company.week
  assert.equal(call('start_work', {
    state: withOffers(base, [expired]), offer_id: expired.id, mode: 'contract'
  }).error.code, 'NOT_FOUND')

  let state = base
  const offer = state.market.slots[0]
  state = ok('lock_offer', { state, offer_id: offer.id }).state
  const stale = structuredClone(state)
  stale.company.week = offer.locked_until ?? stale.company.week + 2
  assert.equal(call('start_work', {
    state: stale, offer_id: offer.id, mode: 'contract'
  }).error.code, 'NOT_FOUND')

  state = ok('advance_week', { state }).state
  assert.ok(state.market.slots.some((o) => o.id === offer.id), 'W+1 锁定仍有效')
  state = ok('advance_week', { state }).state
  assert.ok(!state.market.slots.some((o) => o.id === offer.id), 'W+2 开局释放')
  const worksBefore = state.works.length
  const entriesBefore = state.finance.entries.length
  assert.equal(call('start_work', {
    state, offer_id: offer.id, mode: 'contract'
  }).error.code, 'NOT_FOUND')
  assert.equal(state.works.length, worksBefore)
  assert.equal(state.finance.entries.length, entriesBefore)
})

test('市场固定四槽：自然补满空槽，存活企划逐字段不变', () => {
  const seed = 42
  const base = ok('initialize', { seed }).state
  const offers = Array.from({ length: 3 }, (_, i) => {
    const offer = generateOffer(seed, 0, i)
    offer.expires_week = 10
    return offer
  })
  const expected = weeklyMarketStep(offers, seed, 1, base.company.reputation)
  const advanced = ok('advance_week', { state: withOffers(base, offers) }).state
  assert.equal(advanced.market.slots.length, 4)
  assert.deepEqual(advanced.market.slots.slice(0, 3), offers)
  assert.deepEqual(advanced.market.slots, expected.slots)
  const full = Array.from({ length: 4 }, (_, i) => {
    const offer = generateOffer(seed, 0, i)
    offer.expires_week = 10
    return offer
  })
  const advancedFull = ok('advance_week', { state: withOffers(base, full) }).state
  assert.equal(advancedFull.market.slots.length, 4)
  assert.deepEqual(advancedFull.market.slots, full)
})

test('市场补位保证至少两个可立即承接的企划', () => {
  const base = ok('initialize', { seed: 42 }).state
  const offers = [0, 1].map((i) => {
    const offer = generateOffer(42, 0, i)
    offer.expires_week = 10
    offer.min_reputation = base.company.reputation + 100
    return offer
  })
  const advanced = ok('advance_week', { state: withOffers(base, offers) }).state
  assert.equal(advanced.market.slots.length, 4)
  assert.deepEqual(advanced.market.slots.slice(0, 2), offers)
  assert.equal(advanced.market.slots.filter((o) => o.min_reputation <= base.company.reputation).length, 2)
})

test('advance_week：fixture 目录按 PLACEHOLDER 窗口到期，补充企划与 oracle 逐位一致', () => {
  const seed = 20261127
  let state = ok('initialize', { seed }).state
  state = ok('advance_week', { state }).state
  state = ok('advance_week', { state }).state
  const prior = state.market.slots
  state = ok('advance_week', { state }).state
  assert.ok(!state.market.slots.some((o) => o.id.startsWith('offer_0')))
  assert.deepEqual(state.market.slots, weeklyMarketStep(prior, seed, 3, state.company.reputation).slots)
})

test('validate：槽位超 4 与生命周期快照篡改被拒绝', () => {
  const seed = 42
  const base = ok('initialize', { seed }).state
  const five = Array.from({ length: 5 }, (_, i) => {
    const offer = generateOffer(seed, 0, i)
    offer.expires_week = 10
    return offer
  })
  assert.equal(call('advance_week', { state: withOffers(base, five) }).error.code, 'INVALID_STATE')
  const inconsistent = generateOffer(seed, 0, 0)
  inconsistent.lock_used = false
  inconsistent.deposit_paid = 50000
  assert.equal(call('advance_week', { state: withOffers(base, [inconsistent]) }).error.code, 'INVALID_STATE')
  const forged = generateOffer(seed, 0, 0)
  forged.locked_until = 2
  forged.lock_used = true
  forged.deposit_paid = depositAmount(forged)
  assert.equal(call('advance_week', { state: withOffers(base, [forged]) }).error.code, 'INVALID_STATE')
  const missing = generateOffer(seed, 0, 0)
  delete missing.expires_week
  assert.equal(call('advance_week', { state: withOffers(base, [missing]) }).error.code, 'INVALID_STATE')
})

const tvOutsourceSuppliers = [
  { key: 'key_animation', ability: 'drawing', points: 220 },
  { key: 'inbetween', ability: 'animation', points: 650 },
  { key: 'background', ability: 'drawing', points: 300 },
  { key: 'coloring', ability: 'drawing', points: 230 },
  { key: 'editing', ability: 'direction', points: 20 },
  { key: 'sound_control', ability: 'postproduction', points: 100 }
]

function itemDelivered(item) {
  return item.work_done * 1000 >= item.deliver_at * item.work_total
}

function addTvOutsourceSuppliers(state) {
  state.suppliers = tvOutsourceSuppliers.map(({ key, ability, points }) => ({
    id: `supplier_${key}`,
    name: `固定协力-${key}`,
    specialties: [ability],
    capacity_per_week: points * 10,
    quality: 70,
    speed: 10,
    price_per_unit: 4000,
    reliability: 100,
    unlocked_week: 0
  }))
  state.contracts = []
  return state
}

function signTvOutsourceContracts(state, work, signed, metrics) {
  const items = allItems(state, work.id)
  const byId = new Map(items.map((item) => [item.id, item]))
  for (const item of items) {
    if (!item.outsourceable || item.is_gate || signed.has(item.id)) continue
    if (!item.deps.every((dep) => {
      const dependency = byId.get(dep)
      return dependency && itemDelivered(dependency)
    })) continue
    const remaining = item.work_total - item.work_done
    if (remaining <= 0) continue
    const key = item.id.split('.').at(-1)
    const supplier = state.suppliers.find((entry) => entry.id === `supplier_${key}`)
    const reserved = state.contracts
      .filter((contract) => contract.supplier_id === supplier.id && contract.status === 'active')
      .reduce((sum, contract) => sum + contract.weekly_cap, 0)
    const baseCap = Math.max(1, Math.floor(supplier.capacity_per_week * supplier.speed / 100))
    const weeklyCap = Math.min(supplier.capacity_per_week - reserved, remaining, baseCap)
    const feeTotal = remaining * 4000
    const contract = {
      id: `outsource_${item.id}`,
      supplier_id: supplier.id,
      work_id: work.id,
      episode_id: item.id.split('.')[1],
      item_id: item.id,
      ability: item.ability,
      mode: 'normal',
      work_total: remaining,
      work_done: 0,
      weekly_cap: weeklyCap,
      fee_total: feeTotal,
      fee_paid: feeTotal,
      signed_week: state.company.week,
      due_week: work.deadline_week,
      status: 'active'
    }
    state.contracts.push(contract)
    state.finance.entries.push({
      id: `w${state.company.week}.outsourcing.${contract.id}`,
      week: state.company.week,
      work_id: work.id,
      category: 'outsourcing',
      amount: -feeTotal,
      counterparty: supplier.id,
      memo: '外包签约（固定 fixture）'
    })
    state.finance.balance -= feeTotal
    metrics.outsourceSpend += feeTotal
    signed.add(item.id)
  }
  ok('hash_state', { state })
}

function resolveTvEvents(state, metrics) {
  for (const pending of [...state.events.pending]) {
    if (!pending.viewed) {
      state = ok('view_event', { state, work_id: pending.work_id, event_id: pending.event_id }).state
    }
    const current = state.events.pending.find((event) =>
      event.work_id === pending.work_id && event.event_id === pending.event_id)
    const option = [...current.options]
      .filter((entry) => entry.cost <= state.finance.balance)
      .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0]
    state = ok('resolve_event', {
      state,
      work_id: pending.work_id,
      event_id: pending.event_id,
      option_id: option.id
    }).state
    metrics.events.push({ week: state.company.week, event_id: pending.event_id, option_id: option.id })
  }
  return state
}

function runTvTenEpisode(seed) {
  let state = ok('initialize', { seed }).state
  const offer = state.market.slots.find((entry) => entry.id === 'offer_01')
  assert.equal(offer.contract_budget, 170000000)
  assert.equal(offer.duration_weeks, 52)
  assert.equal(offer.episode_count, 10)
  assert.equal(offer.target_quality, 65)
  assert.equal(offer.deposit_amount, 9350000)
  assert.equal(state.recruitment.pool.length > 0, true)

  const started = ok('start_work', { state, offer_id: offer.id, mode: 'contract' })
  state = started.state
  const workId = started.work_id
  const initialHash = ok('hash_state', { state }).hash
  const earlyDelivery = call('deliver_work', { state, work_id: workId })
  assert.equal(earlyDelivery.error.code, 'GATE_UNMET')
  assert.equal('state' in earlyDelivery, false)
  assert.equal(ok('hash_state', { state }).hash, initialHash)

  state = addTvOutsourceSuppliers(state)
  for (const member of state.staff) {
    state = ok('assign_staff', { state, staff_id: member.id, work_id: workId }).state
  }
  const metrics = {
    inhousePoints: 0,
    inhouseCorePoints: 0,
    inhouseOutsourcePoints: 0,
    outsourcePoints: 0,
    outsourceSpend: 0,
    externalByItem: {},
    contractsBeforeDelivery: null,
    contractsBeforeDeadlineSettlement: null,
    settlementPath: null,
    events: [],
    weekly: [],
    weeks: 0
  }
  const signed = new Set()
  let finalWork = structuredClone(state.works[0])

  while (state.works.some((work) => work.id === workId)) {
    const work = state.works.find((entry) => entry.id === workId)
    const nextEpisode = work.episodes.find((episode) =>
      episode.stages.flatMap((stage) => stage.items.filter((item) => item.is_gate)).some((item) => !itemDelivered(item)))
    if (nextEpisode && (work.plan.target?.kind !== 'episode' || work.plan.target.id !== nextEpisode.id)) {
      state = ok('set_work_plan', {
        state,
        work_id: workId,
        plan: { focus: 'schedule', target: { kind: 'episode', id: nextEpisode.id } }
      }).state
    }
    state = resolveTvEvents(state, metrics)
    signTvOutsourceContracts(state, work, signed, metrics)
    finalWork = structuredClone(state.works.find((entry) => entry.id === workId))
    const gates = finalWork.episodes.flatMap((episode) =>
      episode.stages.flatMap((stage) => stage.items.filter((item) => item.is_gate)))
    if (gates.every(itemDelivered)) {
      metrics.contractsBeforeDelivery = structuredClone(state.contracts)
      metrics.settlementPath = 'manual_delivery'
      state = ok('deliver_work', { state, work_id: workId }).state
      break
    }
    if (state.company.week >= work.deadline_week) break
    if (state.company.week + 1 === work.deadline_week) {
      metrics.contractsBeforeDeadlineSettlement = structuredClone(state.contracts)
    }

    const contractDone = new Map(state.contracts.map((contract) => [contract.id, contract.work_done]))
    const advanced = ok('advance_week', { state })
    metrics.weeks += 1
    const staff = advanced.report.staff.map((member) => ({ ...member }))
    metrics.inhousePoints += staff.reduce((sum, member) => sum + member.produced, 0)
    const coreIds = new Set(allItems({ works: [finalWork] }, workId)
      .filter((item) => !item.outsourceable).map((item) => item.id))
    metrics.inhouseCorePoints += (advanced.report.works[0]?.items ?? []).reduce((sum, receipt) =>
      sum + (coreIds.has(receipt.item_id) ? receipt.points : 0), 0)
    state = advanced.state
    const current = state.works.find((entry) => entry.id === workId)
    if (current) {
      finalWork = structuredClone(current)
      for (const contract of state.contracts) {
        const delta = contract.work_done - (contractDone.get(contract.id) ?? 0)
        metrics.externalByItem[contract.item_id] = (metrics.externalByItem[contract.item_id] ?? 0) + delta
      }
    } else {
      metrics.settlementPath = 'automatic_deadline'
      // 固定供应商 reliability=100 且每项仅一份合同，可按截止周规则还原最后一批外部交付。
      for (const contract of metrics.contractsBeforeDeadlineSettlement) {
        const item = allItems({ works: [finalWork] }, workId).find((entry) => entry.id === contract.item_id)
        const delivered = item ? Math.max(0, Math.min(
          contract.work_total - contract.work_done,
          contract.weekly_cap,
          item.work_total - item.work_done
        )) : 0
        metrics.externalByItem[contract.item_id] = (metrics.externalByItem[contract.item_id] ?? 0) + delivered
      }
      for (const receipt of advanced.report.works[0]?.items ?? []) {
        const item = allItems({ works: [finalWork] }, workId).find((entry) => entry.id === receipt.item_id)
        if (item) item.work_done += receipt.points
      }
    }
    metrics.outsourcePoints = Object.values(metrics.externalByItem).reduce((sum, points) => sum + points, 0)
    const snapshotItems = allItems({ works: [finalWork] }, workId)
    metrics.weekly.push({
      week: state.company.week,
      target: nextEpisode.id,
      staff,
      core_done: snapshotItems.filter((item) => !item.outsourceable).reduce((sum, item) => sum + item.work_done, 0),
      outsourceable_done: snapshotItems.filter((item) => item.outsourceable).reduce((sum, item) => sum + item.work_done, 0),
      unlocked_outsourceable: snapshotItems.filter((item) => item.outsourceable && !signed.has(item.id) &&
        item.deps.every((dep) => snapshotItems.some((entry) => entry.id === dep && itemDelivered(entry)))).map((item) => item.id),
      gates: snapshotItems.filter((item) => item.is_gate && itemDelivered(item)).length,
      contracts: state.contracts.length
    })
  }

  const items = allItems({ works: [finalWork] }, workId)
  const core = items.filter((item) => !item.outsourceable)
  const outsourceable = items.filter((item) => item.outsourceable)
  const contractsBeforeDelivery = metrics.contractsBeforeDelivery
  const contractsBeforeDeadlineSettlement = metrics.contractsBeforeDeadlineSettlement
  const settlementContracts = contractsBeforeDelivery ?? contractsBeforeDeadlineSettlement ?? []
  const manualDelivery = contractsBeforeDelivery !== null
  metrics.inhouseOutsourcePoints = metrics.inhousePoints - metrics.inhouseCorePoints
  const outsourceByItem = Object.fromEntries(outsourceable.map((item) => {
    const external = metrics.externalByItem[item.id] ?? 0
    return [item.id, { total: item.work_total, external, inhouse: item.work_done - external }]
  }))
  const diagnostics = {
    week: state.company.week,
    end_reason: state.archive.works[0]?.end_reason ?? null,
    core_done: core.reduce((sum, item) => sum + item.work_done, 0),
    core_total: core.reduce((sum, item) => sum + item.work_total, 0),
    outsourceable_done: outsourceable.reduce((sum, item) => sum + item.work_done, 0),
    outsourceable_total: outsourceable.reduce((sum, item) => sum + item.work_total, 0),
    delivered_gates: finalWork.episodes.flatMap((episode) =>
      episode.stages.flatMap((stage) => stage.items.filter((item) => item.is_gate && itemDelivered(item)))).length,
    settlement_path: metrics.settlementPath,
    contracts: settlementContracts.length,
    contracts_before_delivery: contractsBeforeDelivery,
    contracts_before_deadline_settlement: contractsBeforeDeadlineSettlement,
    delivered_contracts: manualDelivery
      ? settlementContracts.filter((contract) => contract.status === 'delivered').length
      : null,
    failed_contracts: settlementContracts.filter((contract) => contract.status === 'failed').length,
    contract_work_total: settlementContracts.reduce((sum, contract) => sum + contract.work_total, 0),
    contract_work_done: settlementContracts.reduce(
      (sum, contract) => sum + (metrics.externalByItem[contract.item_id] ?? 0), 0),
    external_by_item: metrics.externalByItem,
    inhousePoints: metrics.inhousePoints,
    inhouseCorePoints: metrics.inhouseCorePoints,
    inhouseOutsourcePoints: metrics.inhouseOutsourcePoints,
    outsourcePoints: metrics.outsourcePoints,
    outsourceSpend: metrics.outsourceSpend,
    outsource_by_item: Object.fromEntries(Object.entries(outsourceByItem).filter(([, value]) => value.inhouse > 0)),
    quality_mean: state.archive.works[0]?.quality?.mean ?? null,
    quality_score: state.archive.works[0]?.quality_score ?? null,
    rating: state.archive.works[0]?.rating ?? null,
    events: metrics.events,
    weekly: metrics.weekly,
    weeks: metrics.weeks
  }
  return { state, diagnostics, hash: ok('hash_state', { state }).hash }
}

test('M2 v0.5：全外包经济情景使用独立成本口径', () => {
  const state = ok('initialize', { seed: 20261127 }).state
  const blueprint = JSON.parse(readFileSync('docs/blueprints/tv_standard.blueprint.json', 'utf8'))
  const created = ok('instantiate_work', { state, blueprint, work_id: 'work_economy', duration_weeks: 52 })
  const outsourceable = allItems(created.state, 'work_economy').filter((item) => item.outsourceable)
  const outsourceablePoints = outsourceable.reduce((sum, item) => sum + item.work_total, 0)
  const outsourceCost = outsourceablePoints * 4000
  const salaryCost = state.staff.reduce((sum, member) => sum + member.weekly_salary, 0) * 52
  // 200,000/周仅用于本经济情景，不改写当前周结算的运营占位值。
  const fixedOperations = 200000 * 52
  assert.equal(outsourceablePoints, 15200)
  assert.equal(outsourceCost, 60800000)
  assert.equal(salaryCost, 40872000)
  assert.equal(fixedOperations, 10400000)
  assert.equal(outsourceCost + salaryCost + fixedOperations, 112072000)
})

test('M2 v0.5：固定 seed 真实推进十集、事件、外包、交付、Finance 与 Archive', () => {
  const first = runTvTenEpisode(20261127)
  const detail = JSON.stringify(first.diagnostics)
  assert.equal(first.state.archive.works.length, 1, detail)
  assert.equal(first.state.archive.works[0].end_reason, 'completed', detail)
  assert.equal(first.state.works.length, 0, detail)
  assert.equal(first.diagnostics.core_done, 10600, detail)
  assert.equal(first.diagnostics.core_total, 10600, detail)
  assert.equal(first.diagnostics.outsourceable_done, 15200, detail)
  assert.equal(first.diagnostics.outsourceable_total, 15200, detail)
  assert.equal(first.diagnostics.delivered_gates, 10, detail)
  assert.equal(first.diagnostics.settlement_path, 'automatic_deadline', detail)
  assert.equal(first.diagnostics.failed_contracts, 0, detail)
  assert.equal(first.diagnostics.contracts, 55, detail)
  assert.equal(first.diagnostics.outsourcePoints, 13023, detail)
  assert.equal(first.diagnostics.outsourceSpend, 52092000, detail)
  assert.equal(first.diagnostics.inhousePoints, 12777, detail)
  assert.equal(first.diagnostics.inhouseCorePoints, 10600, detail)
  assert.equal(first.diagnostics.inhouseOutsourcePoints, 2177, detail)
  assert.equal(first.diagnostics.delivered_contracts, null, detail)
  assert.equal(first.diagnostics.contract_work_total, first.diagnostics.outsourcePoints, detail)
  assert.equal(first.diagnostics.contract_work_done, first.diagnostics.outsourcePoints, detail)
  assert.equal(first.diagnostics.inhousePoints,
    first.diagnostics.inhouseCorePoints + first.diagnostics.inhouseOutsourcePoints, detail)
  assert.equal(first.diagnostics.inhouseCorePoints, first.diagnostics.core_done, detail)
  assert.equal(first.diagnostics.inhouseOutsourcePoints,
    first.diagnostics.outsourceable_done - first.diagnostics.outsourcePoints, detail)
  assert.equal(first.diagnostics.inhousePoints + first.diagnostics.outsourcePoints,
    first.diagnostics.core_done + first.diagnostics.outsourceable_done, detail)
  assert.ok(first.diagnostics.events.length > 0, detail)
  assert.equal(first.diagnostics.week, 52, detail)
  assert.equal(first.diagnostics.weeks, 52, detail)
  assert.deepEqual(first.state.contracts, [])

  const record = first.state.archive.works[0]
  // v0.5 基线质量：权重制 + 外包质量的首次可复现锚点（全外包、四人混合派工）
  assert.equal(first.diagnostics.quality_mean, 56, detail)
  assert.equal(first.diagnostics.quality_score, 56, detail)
  assert.equal(first.diagnostics.rating, 'C', detail)
  assert.equal(record.episodes.length, 10)
  assert.equal(record.start_week, 0)
  assert.equal(record.end_week, 52)
  assert.equal(record.forced, false)
  assert.equal(record.gate_completion_permille, 1000)
  assert.deepEqual(record.team.map((member) => member.id), ['staff_anim', 'staff_dir', 'staff_ka', 'staff_post'])
  assert.ok(first.state.staff.every((member) => member.assignment_work_id === null))
  assert.equal(first.state.finance.opening_funds +
    first.state.finance.entries.reduce((sum, entry) => sum + entry.amount, 0),
  first.state.finance.balance)
  const contracts = first.diagnostics.contracts_before_deadline_settlement
  assert.ok(contracts.every((contract) => ['active', 'delivered'].includes(contract.status)))
  assert.ok(contracts.every((contract) =>
    first.diagnostics.external_by_item[contract.item_id] === contract.work_total))
  const outsourceLedger = first.state.finance.entries.filter((entry) =>
    entry.category === 'outsourcing' && entry.memo === '外包签约（固定 fixture）')
  const expectedOutsourceSpend = contracts.reduce((sum, contract) => sum + contract.work_total * 4000, 0)
  assert.equal(outsourceLedger.length, contracts.length)
  assert.equal(-outsourceLedger.reduce((sum, entry) => sum + entry.amount, 0), expectedOutsourceSpend)
  assert.equal(first.diagnostics.outsourceSpend, expectedOutsourceSpend)
  assert.equal(record.finance_summary.costs.outsourcing, expectedOutsourceSpend)
  assert.equal(record.finance_summary.costs.production,
    first.state.finance.entries.filter((entry) => entry.work_id === record.id && entry.category === 'production')
      .reduce((sum, entry) => sum - entry.amount, 0))
  assert.equal(record.finance_summary.total_costs,
    Object.values(record.finance_summary.costs).reduce((sum, amount) => sum + amount, 0))

  const replay = runTvTenEpisode(20261127)
  assert.deepEqual(replay.diagnostics, first.diagnostics)
  assert.equal(replay.hash, first.hash)
})
