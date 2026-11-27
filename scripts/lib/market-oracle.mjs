// v4 市场规则参考实现（oracle，纯函数）。
//
// 定位同 scripts/check-handover-cases.mjs / recruit-oracle.mjs：规则样本，不是运行时。
// C++ 领域实现必须给出与本模块一致的结论；改规则先改用例与 M0 §14.13，再改实现。
//
// 契约依据：M0_CONTRACT_FREEZE §14.13.2（#53 裁决，PR #97 合入）、DECISION_LOG §17 Q4、
// DATA_DICTIONARY_V4 §3.12、DESIGN_BACKLOG STATUS-49/51。
// DEC-MARKET-001：企划市场固定四槽，锁定期两周（W/W+1 有效，W+2 开局失效）、
// 终身一次锁定、定金普通 5%/IP 上门 10% × deposit_basis（生成时固定）、
// 签约 100% 抵扣（仅锁定期内）、到期定金不退。每周只补空槽，存活企划不重抽。
// 危机机制已废除：守卫不含危机分支，CRISIS_COMMITMENT_BLOCKED 为废弃占位码。
//
// 坐标随机统一使用 scripts/lib/coordinate-random.mjs，与 kernel.cpp 同一算法。
// 坐标：stream=market(4)，purpose=hash('offer_gen') / hash('heat')，
// 候选内 index*16+k 子坐标（k=0..15）。同 (seed,week,index) 的企划 id 终身唯一。

import { Stream, hashText, draw, drawBelow } from './coordinate-random.mjs'

export const PURPOSE = Object.freeze({
  offer_gen: hashText('offer_gen'),
  heat: hashText('heat'),
})

// [PLACEHOLDER] 内容样本与生成参数，不是标定结论。
export const GENRES = Object.freeze(['action', 'fantasy', 'scifi', 'daily', 'idol', 'sports'])
export const SCALES = Object.freeze(['short', 'ova', 'tv', 'movie'])
// 非 TV 蓝图尚未注册，生成器暂只产出可立项的 TV 企划；SCALES 保留完整规模词表。
const GENERATED_SCALES = Object.freeze(['tv'])
export const HEAT_LEVELS = Object.freeze(['low', 'mid', 'high', 'boom'])

export const DEFAULT_PARAMS = Object.freeze({
  market_cap: 4,         // DEC-MARKET-001：企划市场固定四槽
  initial_slots: 4,      // DEC-MARKET-001：初始生成四个
  min_acceptable: 2,     // DEC-MARKET-001：至少两个可立即承接
  expiry_min: 1,         // [PLACEHOLDER] 有效期范围 1–3 周（STATUS-49 确认范围）
  expiry_max: 3,
  lock_weeks: 2,         // Q4 已确认：锁定期两周，非待标定参数
  deposit_rate_regular_permille: 50,   // §14.13.2 已冻结：普通企划 5%
  deposit_rate_ip_permille: 100,       // §14.13.2 已冻结：IP 上门企划 10%
})

// ---- 企划生成 ----

export function generateOffer(seed, week, index, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) }
  const sub = (k) => draw(seed, week, Stream.market, PURPOSE.offer_gen, index * 16 + k)
  const subBelow = (k, bound) => sub(k) % bound

  const genre = GENRES[subBelow(0, GENRES.length)]
  const scale = GENERATED_SCALES[0]
  const episodeCount = { short: 1, ova: 2, tv: 12, movie: 1 }[scale]
  const budget = (500 + subBelow(2, 1500)) * 10000
  const sourceType = opts.sourceType ?? 'market'
  const minReputation = Math.min(subBelow(7, 120), opts.reputationCap ?? 120)
  const commercialPotential = subBelow(6, 101)
  const potential = (permille) => Math.floor(budget * permille / 1000)

  return {
    id: `offer_${PURPOSE.offer_gen.toString(16)}_${week}_${index}`,
    name: `${genre}_${scale}_${week}_${index}`,
    source: 'market',
    genre,
    scale,
    contract_budget: budget,
    duration_weeks: 12 + subBelow(3, 27),
    target_quality: 40 + subBelow(4, 51),
    audience_base: 1000 + subBelow(5, 9000),
    commercial_potential: commercialPotential,
    channel_potentials: {
      domestic_streaming: potential(2000),
      overseas: potential(1200),
      merchandise: potential(1000),
      music: potential(500),
      tv: potential(500),
      bd_dvd: potential(400),
    },
    channels_baseline: ['bd_dvd'],
    allowed_modes: ['contract', 'committee'],
    committee_candidates: ['partner_tv', 'partner_stream', 'partner_pub'],
    min_reputation: minReputation,
    required_works: [],
    blueprint_id: 'tv_standard',
    episode_count: episodeCount,
    workload_scale_permille: 1000,
    origin: 'market',
    style: 'standard',
    offer_source_type: sourceType,
    // §14.13.2：定金基数在生成时固定，后续预算调整不得追溯改变定金。
    deposit_basis: budget,
    expires_week: week + params.expiry_min + subBelow(8, params.expiry_max - params.expiry_min + 1),
    locked_until: null,
    lock_used: false,
    deposit_paid: 0,
  }
}

export function initialMarket(seed, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) }
  const reputation = opts.reputation ?? 100
  const slots = []
  for (let i = 0; i < params.initial_slots; i++) {
    slots.push(generateOffer(seed, 0, i, {
      params,
      reputationCap: i < params.min_acceptable ? reputation : 120,
    }))
  }
  return slots
}

// ---- 自然过期与锁定保护 ----

// 自然过期（§14.13.2）：expires_week 是自然失效周，到达该周开局槽位释放（week < expires_week 存活）；
// 锁定保护：week < locked_until 期间不受自然过期影响（STATUS-49/51）。
export function expireOffers(slots, week) {
  return slots.filter((o) => week < o.expires_week || (o.locked_until != null && week < o.locked_until))
}

// 锁定到期未接单：第 W 周锁定覆盖 W/W+1，W+2 周开局（week >= locked_until）失效、
// 释放市场槽位、定金不退（Q4）。退款与否是 Finance 语义；oracle 不产生任何退款流水。
export function releaseExpiredLocks(slots, week) {
  return slots.filter((o) => !(o.locked_until != null && week >= o.locked_until))
}

// ---- 每周自然补充（不是清空重抽）----

export function topUpMarket(slots, seed, week, opts = {}) {
  const params = { ...DEFAULT_PARAMS, ...(opts.params ?? {}) }
  const reputation = opts.reputation ?? 100
  const alive = expireOffers(slots, week)
  const free = Math.max(0, params.market_cap - alive.length)
  let acceptable = alive.filter((o) => (o.min_reputation ?? 0) <= reputation).length
  const added = []
  for (let i = 0; i < free; i++) {
    const cap = acceptable < params.min_acceptable ? reputation : 120
    added.push(generateOffer(seed, week, i, { params, reputationCap: cap }))
    if (cap <= reputation) acceptable++
  }
  return { slots: [...alive, ...added], added_ids: added.map((o) => o.id) }
}

// 周结算市场步：先释放到期锁定，再自然过期，最后补充。
export function weeklyMarketStep(slots, seed, week, opts = {}) {
  const released = releaseExpiredLocks(slots, week)
  return topUpMarket(released, seed, week, opts)
}

// ---- 定金锁定（lock_offer 的企划侧效果；现金走 Finance，不在 oracle）----
// 命令级守卫（running ∧ pending 空 ∧ 现金 ≥ 定金）在运行时；此处覆盖企划侧：
// 终身一次（lock_used）与自然失效（week >= expires_week 的企划已不存在）。

export function lockOffer(offer, week, deposit) {
  if (offer.lock_used) return { error: 'INVALID_INPUT' }
  if (week >= offer.expires_week) return { error: 'NOT_FOUND' }
  return {
    error: null,
    offer: { ...offer, locked_until: week + DEFAULT_PARAMS.lock_weeks, lock_used: true, deposit_paid: deposit },
  }
}

// 定金基数（§14.13.2 已冻结）：企划生成时固定的 deposit_basis，不随后续预算调整变化。
export function depositBase(offer) {
  return offer.deposit_basis
}

// 定金档位（§14.13.2 已冻结）：普通 5%、IP 上门 10%，来源类型决定档位，玩家不可切换。
// 整数千分比计算；非整除时的取整规则待标定（CATALOG §11.3），当前向下取整。
export function depositAmount(offer, params = DEFAULT_PARAMS) {
  const rate = offer.offer_source_type === 'ip_visit'
    ? params.deposit_rate_ip_permille
    : params.deposit_rate_regular_permille
  const basis = depositBase(offer)
  return Math.floor(basis / 1000) * rate + Math.floor((basis % 1000) * rate / 1000)
}

// 正式接单抵扣：仅锁定期内（week < locked_until）定金 100% 抵扣（预付款），
// 现金守卫按差额；不得重复计成本。锁定期外不抵扣。
export function startWorkCash(offer, totalPayable, week) {
  const inLock = offer.locked_until != null && week < offer.locked_until
  const applied = inLock ? Math.min(offer.deposit_paid, totalPayable) : 0
  return { cash_due: totalPayable - applied, deposit_applied: applied }
}

// ---- 终身唯一防绕过（INV-24）----

export function isIdReuse(id, historyIds) {
  return historyIds.includes(id)
}

// ---- 市场热度 ----

export function heatLevel(seed, week, genre) {
  return HEAT_LEVELS[drawBelow(seed, week, Stream.market, PURPOSE.heat, hashText(genre), HEAT_LEVELS.length)]
}