import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  Stream, ABILITIES, PROFESSIONS, PROFESSION_ABILITY, DEFAULT_PARAMS,
  hashText, draw, drawBelow, PURPOSE,
  generateCandidate, advancePity, scoutGuard, scout,
  expireCandidates, rotatePool, unpackOnHire,
} from './lib/recruit-oracle.mjs'

// ---- 坐标式随机：与 kernel.cpp 同一算法的性质测试 ----
// 注：本机无 em++，无法与 C++ 逐位对拍；draw 为 kernel.cpp 的逐行 BigInt 镜像，
// C++ 侧接入时须用同一坐标做对拍测试（交接要求见 PR 描述）。

test('hashText 与 FNV-1a 32 位已知向量一致', () => {
  assert.equal(hashText(''), 2166136261)
  assert.equal(hashText('a'), 0xe40c292c)
  assert.equal(hashText('foobar'), 0xbf9cf968)
  assert.equal(hashText('动画'), 1061707710)
})

test('draw 同坐标恒等，与调用顺序无关', () => {
  const a = draw(42, 5, Stream.staff, PURPOSE.recruit, 3)
  draw(1, 0, Stream.misc, 0, 0)
  draw(999, 519, Stream.market, 123, 77)
  const b = draw(42, 5, Stream.staff, PURPOSE.recruit, 3)
  assert.equal(a, b)
  assert.ok(a >= 0 && a <= 0xffffffff)
})

test('draw 各坐标分量敏感（seed/week/stream/purpose/index）', () => {
  const base = draw(42, 5, Stream.staff, PURPOSE.recruit, 3)
  assert.notEqual(base, draw(43, 5, Stream.staff, PURPOSE.recruit, 3))
  assert.notEqual(base, draw(42, 6, Stream.staff, PURPOSE.recruit, 3))
  assert.notEqual(base, draw(42, 5, Stream.market, PURPOSE.recruit, 3))
  assert.notEqual(base, draw(42, 5, Stream.staff, PURPOSE.recruit_scout, 3))
  assert.notEqual(base, draw(42, 5, Stream.staff, PURPOSE.recruit, 4))
})

test('drawBelow 落在 [0,bound)，bound=0 返回 0', () => {
  for (let i = 0; i < 200; i++) {
    const v = drawBelow(7, i % 50, Stream.staff, PURPOSE.recruit, i, 8)
    assert.ok(v >= 0 && v < 8)
  }
  assert.equal(drawBelow(7, 1, Stream.staff, PURPOSE.recruit, 0, 0), 0)
})

// ---- 候选生成 ----

test('候选形状符合 v4 Staff 契约（signing_fee+weekly_salary，无 project_fee）', () => {
  const { staff } = generateCandidate(42, 3, 0)
  assert.deepEqual(Object.keys(staff.abilities), ABILITIES)
  assert.deepEqual(Object.keys(staff.experience), ABILITIES)
  assert.deepEqual(Object.keys(staff.potential), ABILITIES)
  assert.deepEqual(Object.keys(staff.revealed_potential), ABILITIES)
  assert.ok(PROFESSIONS.includes(staff.role))
  assert.ok(Number.isSafeInteger(staff.weekly_salary) && staff.weekly_salary > 0)
  assert.ok(staff.signing_fee > 0)
  assert.equal('project_fee' in staff, false)
  assert.equal(staff.assignment_work_id, null)
  assert.equal(staff.last_participation, null)
  assert.equal(staff.temporary_contract, null)
  const primary = PROFESSION_ABILITY[staff.role]
  const primaryValue = staff.abilities[primary]
  assert.equal(
    staff.weekly_salary,
    DEFAULT_PARAMS.salary_base + primaryValue * DEFAULT_PARAMS.salary_per_primary,
  )
  assert.ok(primaryValue >= 20 && primaryValue <= 100)
  for (const ability of ABILITIES) {
    assert.ok(staff.abilities[ability] >= 0 && staff.abilities[ability] <= 100)
    assert.ok(staff.potential[ability] >= staff.abilities[ability] && staff.potential[ability] <= 100)
    assert.equal(staff.experience[ability], 0)
    assert.equal(staff.revealed_potential[ability], false)
  }
})

test('候选 id 由坐标决定：同周同 index 同 id，跨周不同', () => {
  const a = generateCandidate(42, 3, 1).staff
  const b = generateCandidate(42, 3, 1).staff
  const c = generateCandidate(42, 4, 1).staff
  assert.equal(a.id, b.id)
  assert.notEqual(a.id, c.id)
})

test('scout 定向 role 强制职业；focus_ability 映射到对应职业（提案映射）', () => {
  const ctx = {
    seed: 42, week: 5, last_scout_week: null, company_status: 'running',
    pending_count: 0, solvency: 'normal', balance: 1000000,
  }
  const byRole = scout({ ...ctx, role: '脚本' }, [])
  assert.equal(byRole.pool[0].staff.role, '脚本')
  const byFocus = scout({ ...ctx, focus_ability: 'planning' }, [])
  assert.equal(PROFESSION_ABILITY[byFocus.pool[0].staff.role], 'planning')
})

test('scout 拒绝未知职业与没有职业映射的能力方向', () => {
  const ctx = {
    seed: 42, week: 5, last_scout_week: null, company_status: 'running',
    pending_count: 0, solvency: 'normal', balance: 1000000,
  }
  assert.equal(scoutGuard({ ...ctx, role: '未知职业' }).error, 'INVALID_INPUT')
  assert.equal(scoutGuard({ ...ctx, focus_ability: 'animation' }).error, 'INVALID_INPUT')
  assert.equal(scoutGuard({ ...ctx, focus_ability: 'management' }).error, 'INVALID_INPUT')
  assert.equal(scoutGuard({ ...ctx, focus_ability: 'drawing' }).error, null)
})

test('保底计数：n 递增，sr 重置 sr 计数，ssr 双重重置', () => {
  assert.deepEqual(advancePity({ since_sr: 3, since_ssr: 3 }, 'n'), { since_sr: 4, since_ssr: 4 })
  assert.deepEqual(advancePity({ since_sr: 9, since_ssr: 9 }, 'sr'), { since_sr: 0, since_ssr: 10 })
  assert.deepEqual(advancePity({ since_sr: 9, since_ssr: 49 }, 'ssr'), { since_sr: 0, since_ssr: 0 })
})

test('保底触发：计数达到阈值时即使 roll 不利也出对应档', () => {
  const pity = { since_sr: DEFAULT_PARAMS.pity_sr, since_ssr: DEFAULT_PARAMS.pity_ssr }
  const { tier } = generateCandidate(1, 1, 0, { pity })
  assert.equal(tier, 'ssr')
})

// ---- 守卫矩阵 ----

test('守卫优先级：形状 > 阶段 > pending > 每周一次 > 现金', () => {
  const base = {
    week: 5, last_scout_week: null, company_status: 'running',
    pending_count: 0, balance: 1000000, fee: 50000,
  }
  assert.equal(scoutGuard({ ...base, role: '作画', focus_ability: 'drawing' }).error, 'INVALID_INPUT')
  assert.equal(scoutGuard({ ...base, company_status: 'closing' }).error, 'INVALID_PHASE')
  assert.equal(scoutGuard({ ...base, pending_count: 2 }).error, 'INVALID_PHASE')
  assert.equal(scoutGuard({ ...base, last_scout_week: 5 }).error, 'INVALID_PHASE')
  assert.equal(scoutGuard({ ...base, balance: 1 }).error, 'INSUFFICIENT_FUNDS')
  assert.equal(scoutGuard(base).error, null)
})

test('scout 失败时不产生任何副作用（无候选、无计数变化）', () => {
  const ctx = {
    seed: 42, week: 5, last_scout_week: 5, company_status: 'running',
    pending_count: 0, solvency: 'normal', balance: 1000000,
    pity: { since_sr: 2, since_ssr: 2 },
  }
  const pool = [{ staff: { id: 'r0' }, expires_week: null, origin: 'regular' }]
  const result = scout(ctx, pool)
  assert.equal(result.error, 'INVALID_PHASE')
  assert.equal(result.pool, undefined)
})

// ---- 窗口与轮换 ----

function regular(id, extra = {}) {
  return { staff: { id, ...extra }, expires_week: null, origin: 'regular' }
}
function scoutCand(id, expires) {
  return { staff: { id }, expires_week: expires, origin: 'scout' }
}

test('窗口边界：expires_week 当周起不可签约；regular 永不过期', () => {
  const pool = [scoutCand('s', 7), regular('r')]
  assert.deepEqual(expireCandidates(pool, 6).map((c) => c.staff.id), ['s', 'r'])
  assert.deepEqual(expireCandidates(pool, 7).map((c) => c.staff.id), ['r'])
  assert.deepEqual(expireCandidates(pool, 8).map((c) => c.staff.id), ['r'])
  assert.deepEqual(expireCandidates(pool, 520).map((c) => c.staff.id), ['r'])
})

test('部分轮换跨 30 周：未选中候选逐字段不变，scout 不受轮换影响', () => {
  let pool = [regular('r0', { note: 'keep' }), regular('r1'), regular('r2'), regular('r3'), scoutCand('s0', 100)]
  const original = new Map(pool.map((c) => [c.staff.id, JSON.stringify(c)]))
  for (let week = 1; week <= 30; week++) {
    const before = pool
    const result = rotatePool(pool, 42, week, { params: { rotate_count: 2, pool_cap: 6 } })
    pool = result.pool
    for (const c of pool) {
      if (original.has(c.staff.id)) {
        assert.equal(JSON.stringify(c), original.get(c.staff.id), `第 ${week} 周 ${c.staff.id} 被改动`)
      }
    }
    const scoutsBefore = before.filter((c) => c.origin === 'scout')
    const scoutsAfter = pool.filter((c) => c.origin === 'scout')
    assert.equal(JSON.stringify(scoutsBefore), JSON.stringify(scoutsAfter))
    assert.ok(pool.filter((c) => c.origin === 'regular').length <= 6)
  }
})

test('轮换选槽确定性：同 (seed,week) 两次轮换结果一致', () => {
  const pool = [regular('a'), regular('b'), regular('c'), regular('d')]
  const r1 = rotatePool(pool, 9, 12)
  const r2 = rotatePool(pool, 9, 12)
  assert.equal(JSON.stringify(r1), JSON.stringify(r2))
})

test('轮换选槽无放回，重复随机落点仍替换指定数量', () => {
  const pool = [regular('a'), regular('b')]
  for (let seed = 0; seed < 32; seed++) {
    const result = rotatePool(pool, seed, 3, { params: { rotate_count: 2, pool_cap: 6 } })
    assert.equal(result.added_ids.length, 2)
    assert.equal(new Set(result.added_ids).size, 2)
    assert.equal(result.pool.filter((c) => c.origin === 'regular').length, 2)
  }
})

test('常规池为空时轮换不生成候选（无中生有禁止）', () => {
  const result = rotatePool([scoutCand('s', 50)], 42, 10)
  assert.equal(result.added_ids.length, 0)
  assert.equal(result.pool.length, 1)
})

test('pool_cap 只约束常规候选；scout 候选另计', () => {
  const pool = [regular('a'), regular('b'), regular('c'), scoutCand('s1', 50), scoutCand('s2', 50)]
  const result = rotatePool(pool, 42, 10, { params: { rotate_count: 3, pool_cap: 2 } })
  assert.equal(result.pool.filter((c) => c.origin === 'regular').length, 2)
  assert.equal(result.pool.filter((c) => c.origin === 'scout').length, 2)
})

// ---- hire 解包 ----

test('解包后包装字段不残留，Staff 字段原样保留', () => {
  const { staff } = generateCandidate(42, 3, 0)
  const candidate = { staff, expires_week: 5, origin: 'scout' }
  const hired = unpackOnHire(candidate)
  assert.deepEqual(hired, staff)
  assert.equal('expires_week' in hired, false)
  assert.equal('origin' in hired, false)
})