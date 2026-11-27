// v4 招聘规则参考实现（oracle，纯函数）。
//
// 定位与 scripts/check-handover-cases.mjs 相同：这不是游戏运行时，而是规则样本。
// M2/M3 的 C++ 领域实现必须给出与本模块一致的结论；若规则要改，先改用例与
// M0_CONTRACT_FREEZE §14.7，再改实现。
//
// 契约依据：M0_CONTRACT_FREEZE §14.7（#53 裁决）、DECISION_LOG §17 Q3、DEC-STAFF-006/007。
// 目标 Staff 形状 = signing_fee + weekly_salary（PR #94 后的 v4 契约）；
// M1 model.hpp 仍含 project_fee 属已知缺口（M0 §14.3），本模块不以其为目标。
//
// 池容量、轮换、窗口、保底与签约费仍为 [PLACEHOLDER]；Tier 能力、潜力与 1.20 倍工资
// 按 2026-11-27 归档规则。职业→能力映射是 DEC-STAFF-006 留给员工模块的提案，未冻结。
//
// 随机：逐位镜像 packages/game-core/src/v4/kernel.cpp 的 draw/splitmix64/hash_text，
// 坐标 (seed, week, stream, purpose, index)，无计数器、无调用顺序依赖。
// purpose 坐标：hash_text('recruit')（常规生成）、hash_text('recruit_regular')（轮换选槽）、
// hash_text('recruit_scout')（scout 生成）。候选内部用 index*16+k 展开子坐标（k=0..15）。

import { Stream, hashText, draw, drawBelow } from './coordinate-random.mjs'

export { Stream, hashText, draw, drawBelow }

export const ABILITIES = Object.freeze([
  'planning', 'direction', 'drawing', 'animation', 'management', 'postproduction',
])

// DEC-STAFF-006 八职业。主能力映射为提案（最终映射表由员工/制作模块细化）。
export const PROFESSIONS = Object.freeze([
  '作画', '演出', '脚本', '摄影', '监督', '音乐', '声优', '美术',
])
export const PROFESSION_ABILITY = Object.freeze({
  '作画': 'drawing',
  '演出': 'direction',
  '脚本': 'planning',
  '摄影': 'postproduction',
  '监督': 'direction',
  '音乐': 'postproduction',
  '声优': 'postproduction',
  '美术': 'drawing',
})

// DEC-STAFF-007 八个特性原型（标签占位，效果不在本模块范围）。
export const TALENT_ARCHETYPES = Object.freeze([
  'burst_drain', 'steady_floor', 'mentor_boost', 'team_smooth',
  'fast_push', 'deadline_calm', 'slow_polish', 'genre_specialist',
])

export const DEFAULT_PARAMS = Object.freeze({
  scout_fee: 50000,            // [PLACEHOLDER]
  scout_count: 1,              // [PLACEHOLDER] 每次 scout 生成候选数
  scout_window_weeks: 2,       // [PLACEHOLDER] 讨论范围 1–2 周
  pool_cap: 6,                 // [PLACEHOLDER] 常规池上限（scout 候选另计）
  rotate_count: 2,             // [PLACEHOLDER] 每周部分轮换的常规候选数
  ssr_rate: 30,                // [PLACEHOLDER] 千分比
  sr_rate: 150,                // [PLACEHOLDER] 千分比
  pity_sr: 10,                 // [PLACEHOLDER] 讨论值，未冻结
  pity_ssr: 50,                // [PLACEHOLDER] 讨论值，未冻结
  signing_fee_per_ability: 1000,   // [PLACEHOLDER]
  salary_base: 20000,              // [PLACEHOLDER]
  salary_per_primary: 300,         // [PLACEHOLDER]
  candidate_salary_permille: 1200,
})

export const TIER_PROFILES = Object.freeze({
  early: Object.freeze({ min: 42, max: 52, potential_cap: 55, workstations: 1 }),
  mid: Object.freeze({ min: 56, max: 65, potential_cap: 68, workstations: 2 }),
  late: Object.freeze({ min: 66, max: 74, potential_cap: 76, workstations: 4 }),
})

export function reputationTier(reputation) {
  if (reputation < 100) return 0
  if (reputation < 250) return 1
  if (reputation < 600) return 2
  if (reputation < 2000) return 3
  if (reputation < 10000) return 4
  if (reputation < 60000) return 5
  if (reputation < 300000) return 6
  return 7
}

export function tierProfile(reputation) {
  const tier = reputationTier(reputation)
  if (tier <= 1) return TIER_PROFILES.early
  if (tier <= 4) return TIER_PROFILES.mid
  return TIER_PROFILES.late
}

export function temporaryWorkstationCapacity(reputation) {
  const tier = reputationTier(reputation)
  if (tier <= 1) return 1
  if (tier <= 3) return 2
  if (tier <= 5) return 3
  return 4
}

export function standardWeeklySalary(primary, params = DEFAULT_PARAMS) {
  return params.salary_base + primary * params.salary_per_primary
}

export function candidateWeeklySalary(primary, params = DEFAULT_PARAMS) {
  return standardWeeklySalary(primary, params) * params.candidate_salary_permille / 1000
}

export function temporaryWeeklySalary(primary, params = DEFAULT_PARAMS) {
  return candidateWeeklySalary(primary, params)
}

export function temporarySigningFee(weeklySalary) {
  return weeklySalary * 2
}

// ---- 坐标式随机（共享 kernel.cpp 参考实现）----

export const PURPOSE = Object.freeze({
  recruit: hashText('recruit'),
  recruit_regular: hashText('recruit_regular'),
  recruit_scout: hashText('recruit_scout'),
})

// ---- 候选生成 ----

function tierOf(roll, pity, params) {
  if (roll < params.ssr_rate || pity.since_ssr >= params.pity_ssr) return 'ssr'
  if (roll < params.sr_rate || pity.since_sr >= params.pity_sr) return 'sr'
  return 'n'
}

// 保底计数推进：抽出 sr/ssr 重置对应计数；语义为提案，阈值 [PLACEHOLDER]。
export function advancePity(pity, tier) {
  return {
    since_sr: tier === 'n' ? pity.since_sr + 1 : 0,
    since_ssr: tier === 'ssr' ? 0 : pity.since_ssr + 1,
  }
}

export function generateCandidate(seed, week, index, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) }
  const pity = opts.pity ?? { since_sr: 0, since_ssr: 0 }
  const purpose = opts.purpose ?? PURPOSE.recruit
  const sub = (k) => draw(seed, week, Stream.staff, purpose, index * 16 + k)
  const subBelow = (k, bound) => sub(k) % bound

  const profession = opts.profession ?? PROFESSIONS[subBelow(1, PROFESSIONS.length)]
  const primaryAbility = PROFESSION_ABILITY[profession]
  const tier = tierOf(subBelow(0, 1000), pity, params)
  const profile = tierProfile(opts.reputation ?? 100)
  const primary = profile.min + subBelow(2, profile.max - profile.min + 1)

  const abilityValues = ABILITIES.map((ability, i) =>
    ability === primaryAbility ? primary : 5 + subBelow(3 + i, 41))
  const potentialValues = abilityValues.map((value) =>
    Math.min(value + 4, profile.potential_cap))
  const abilitySum = abilityValues.reduce((sum, value) => sum + value, 0)
  const toAbilityObject = (values) => Object.fromEntries(ABILITIES.map((ability, i) => [ability, values[i]]))

  const staff = {
    id: `cand_${purpose.toString(16)}_${week}_${index}`,
    name: `${profession}_${week}_${index}`,
    role: profession,
    employment: 'core',
    abilities: toAbilityObject(abilityValues),
    experience: toAbilityObject(ABILITIES.map(() => 0)),
    potential: toAbilityObject(potentialValues),
    revealed_potential: toAbilityObject(ABILITIES.map(() => false)),
    talent_type: TALENT_ARCHETYPES[subBelow(15, TALENT_ARCHETYPES.length)],
    signing_fee: abilitySum * params.signing_fee_per_ability,
    weekly_salary: candidateWeeklySalary(primary, params),
    fatigue: 0,
    morale: 60,
    departure_warning: false,
    assignment_work_id: null,
    last_participation: null,
    temporary_contract: null,
  }
  return { staff, tier }
}

// ---- scout 守卫（M0 §5 行 6 / §14.7）----

export function scoutGuard(ctx) {
  const hasRole = ctx.role != null
  const hasFocus = ctx.focus_ability != null
  if (hasRole && hasFocus) return { error: 'INVALID_INPUT' }
  if (hasRole && !PROFESSIONS.includes(ctx.role)) return { error: 'INVALID_INPUT' }
  if (hasFocus && (!ABILITIES.includes(ctx.focus_ability) ||
      !PROFESSIONS.some((profession) => PROFESSION_ABILITY[profession] === ctx.focus_ability))) {
    return { error: 'INVALID_INPUT' }
  }
  if (ctx.company_status !== 'running') return { error: 'INVALID_PHASE' }
  if ((ctx.pending_count ?? 0) > 0) return { error: 'INVALID_PHASE' }
  if (ctx.last_scout_week === ctx.week) return { error: 'INVALID_PHASE' }
  if (ctx.balance < (ctx.fee ?? DEFAULT_PARAMS.scout_fee)) return { error: 'INSUFFICIENT_FUNDS' }
  return { error: null }
}

// scout 结果：新候选 + 推进后的保底计数 + last_scout_week。
// 费用扣款在真实命令中走 Finance 流水；oracle 只报告 fee，不记账。
export function scout(ctx, pool, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) }
  const fee = ctx.fee ?? params.scout_fee
  const guard = scoutGuard({ ...ctx, fee })
  if (guard.error) return { error: guard.error }

  let pity = ctx.pity ?? { since_sr: 0, since_ssr: 0 }
  const added = []
  for (let i = 0; i < params.scout_count; i++) {
    const forced = ctx.role ?? (ctx.focus_ability
      ? PROFESSIONS.find((p) => PROFESSION_ABILITY[p] === ctx.focus_ability)
      : undefined)
    const { staff, tier } = generateCandidate(ctx.seed, ctx.week, i, {
      purpose: PURPOSE.recruit_scout,
      profession: forced,
      pity,
      params,
      reputation: ctx.reputation ?? 100,
    })
    pity = advancePity(pity, tier)
    added.push({ staff, expires_week: ctx.week + params.scout_window_weeks, origin: 'scout' })
  }
  return {
    error: null,
    pool: [...pool, ...added],
    added_ids: added.map((c) => c.staff.id),
    pity,
    last_scout_week: ctx.week,
    fee,
  }
}

// ---- 窗口到期与部分轮换（周结算固定阶段调用）----

// 窗口语义：expires_week 是首个不可签约周；week >= expires_week 时移除。
export function expireCandidates(pool, week) {
  return pool.filter((c) => !(c.origin === 'scout' && c.expires_week != null && week >= c.expires_week))
}

// 常规池部分轮换：先到期清理，再确定性选 rotate_count 个常规槽替换；
// 未选中的常规候选逐字段不变；scout 候选不参与常规轮换。
// pool_cap 只约束常规候选数量（提案）。
export function rotatePool(pool, seed, week, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) }
  const alive = expireCandidates(pool, week)
  const regulars = alive.filter((c) => c.origin === 'regular')
  const scouts = alive.filter((c) => c.origin === 'scout')

  const available = regulars.map((_, index) => index)
  const slots = []
  for (let i = 0; i < Math.min(params.rotate_count, regulars.length); i++) {
    const roll = drawBelow(seed, week, Stream.staff, PURPOSE.recruit_regular, i, available.length)
    slots.push(available.splice(roll, 1)[0])
  }
  const kept = regulars.filter((_, i) => !slots.includes(i))
  const added = []
  for (const slot of slots.sort((a, b) => a - b)) {
    const { staff } = generateCandidate(seed, week, slot, {
      purpose: PURPOSE.recruit, params, reputation: opts.reputation ?? 100,
    })
    added.push({ staff, expires_week: null, origin: 'regular' })
  }
  const regularPool = [...kept, ...added].slice(0, params.pool_cap)
  return { pool: [...regularPool, ...scouts], added_ids: added.map((c) => c.staff.id) }
}

// ---- hire 解包：包装字段不得残留名册 ----

export function unpackOnHire(candidate) {
  return { ...candidate.staff }
}