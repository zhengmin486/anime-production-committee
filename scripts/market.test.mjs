import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  GENRES, SCALES, HEAT_LEVELS, DEFAULT_PARAMS,
  generateOffer, initialMarket, expireOffers, releaseExpiredLocks,
  topUpMarket, weeklyMarketStep, lockOffer, depositBase, depositAmount, startWorkCash,
  isIdReuse, heatLevel,
} from './lib/market-oracle.mjs'

// ---- 企划生成 ----

test('企划形状符合架构 §7.4 + §14.13 生命周期字段', () => {
  const offer = generateOffer(42, 3, 0)
  assert.ok(GENRES.includes(offer.genre))
  assert.ok(SCALES.includes(offer.scale))
  assert.equal(offer.scale, 'tv', '非 TV 蓝图未注册，生成器暂只产出 TV')
  assert.equal(offer.blueprint_id, 'tv_standard')
  assert.equal(offer.episode_count, 12)
  assert.ok(offer.episode_count > 0)
  assert.ok(offer.contract_budget > 0)
  assert.deepEqual(offer.allowed_modes, ['contract', 'committee'])
  assert.ok(offer.expires_week >= 3 + DEFAULT_PARAMS.expiry_min && offer.expires_week <= 3 + DEFAULT_PARAMS.expiry_max)
  assert.equal(offer.locked_until, null)
  assert.equal(offer.lock_used, false)
  assert.equal(offer.deposit_paid, 0)
  assert.equal(offer.offer_source_type, 'market')
  assert.equal(offer.deposit_basis, offer.contract_budget, '定金基数生成时固定')
})

test('企划 id 坐标决定：同周同 index 同 id，跨周不同（终身唯一基础）', () => {
  const a = generateOffer(42, 3, 1)
  const b = generateOffer(42, 3, 1)
  const c = generateOffer(42, 4, 1)
  assert.equal(a.id, b.id)
  assert.notEqual(a.id, c.id)
})

test('初始市场 4 个，互不重复且至少两个可立即承接', () => {
  const slots = initialMarket(42)
  assert.equal(slots.length, 4)
  assert.equal(new Set(slots.map((o) => o.id)).size, 4)
  assert.ok(slots.filter((o) => o.min_reputation <= 100).length >= 2)
})

// ---- 自然补充与过期 ----

function offer(id, expires, lockedUntil = null, minReputation = 0) {
  return { id, expires_week: expires, locked_until: lockedUntil, lock_used: lockedUntil != null, deposit_paid: 0, min_reputation: minReputation }
}

test('自然补充保留存活企划逐字段不变，不清空重抽', () => {
  const slots = [offer('o0', 5), offer('o1', 6)]
  const snapshot = JSON.stringify(slots)
  const result = topUpMarket(slots, 42, 1)
  for (const o of result.slots.filter((x) => ['o0', 'o1'].includes(x.id))) {
    assert.equal(JSON.stringify(o), JSON.stringify(slots.find((b) => b.id === o.id)))
  }
  assert.equal(result.added_ids.length, 2)
  assert.equal(JSON.stringify(slots), snapshot, '入参不被修改')
})

test('补充受固定四槽约束；满员不补充', () => {
  const full = Array.from({ length: 4 }, (_, i) => offer('f' + i, 50))
  const result = topUpMarket(full, 42, 1)
  assert.equal(result.added_ids.length, 0)
  assert.equal(result.slots.length, 4)
  const three = full.slice(0, 3)
  const r2 = topUpMarket(three, 42, 1)
  assert.equal(r2.slots.length, 4)
})

test('补位优先保证至少两个可立即承接，不修改存活企划', () => {
  const slots = [offer('locked-a', 50, null, 500), offer('locked-b', 50, null, 500)]
  const result = topUpMarket(slots, 42, 1, { reputation: 100 })
  assert.deepEqual(result.slots.slice(0, 2), slots)
  assert.equal(result.added_ids.length, 2)
  assert.equal(result.slots.filter((o) => o.min_reputation <= 100).length, 2)
})

test('自然过期边界：expires_week 是失效周，该周开局移除', () => {
  const slots = [offer('e', 5)]
  assert.equal(expireOffers(slots, 4).length, 1)
  assert.equal(expireOffers(slots, 5).length, 0)
})

test('锁定保护：week < locked_until 期间自然过期不生效', () => {
  const slots = [offer('L', 4, 7)]
  assert.equal(expireOffers(slots, 6).length, 1)
  assert.equal(expireOffers(slots, 7).length, 0, 'W+2 开局锁定失效')
})

test('锁定到期未接单：W+2 开局释放槽位，即使自然有效期未到', () => {
  const slots = [offer('L', 20, 7), offer('N', 20)]
  assert.deepEqual(releaseExpiredLocks(slots, 6).map((o) => o.id), ['L', 'N'])
  assert.deepEqual(releaseExpiredLocks(slots, 7).map((o) => o.id), ['N'])
  assert.deepEqual(releaseExpiredLocks(slots, 8).map((o) => o.id), ['N'])
})

test('周结算市场步顺序：释放到期锁定 → 自然过期 → 补满空槽', () => {
  const slots = [offer('deadLock', 20, 4), offer('expired', 2), offer('alive', 30)]
  const result = weeklyMarketStep(slots, 42, 5)
  const ids = result.slots.map((o) => o.id)
  assert.ok(!ids.includes('deadLock'))
  assert.ok(!ids.includes('expired'))
  assert.ok(ids.includes('alive'))
  assert.equal(result.added_ids.length, 3)
  assert.equal(result.slots.length, 4)
})

// ---- 定金锁定 ----

test('lock_offer 成功语义：两周（Q4 确认）、终身标记、定金快照', () => {
  const o = offer('o', 8)
  const result = lockOffer(o, 5, 800000)
  assert.equal(result.error, null)
  assert.equal(result.offer.locked_until, 7)
  assert.equal(result.offer.lock_used, true)
  assert.equal(result.offer.deposit_paid, 800000)
  assert.equal(o.lock_used, false, '入参不被修改')
})

test('终身一次：lock_used=true 拒绝再锁，即使锁定已到期', () => {
  const o = { ...offer('o', 30), lock_used: true, locked_until: null, deposit_paid: 800000 }
  assert.equal(lockOffer(o, 10, 800000).error, 'INVALID_INPUT')
})

test('已过期企划不可锁定（expires_week 开局即不存在）', () => {
  assert.equal(lockOffer(offer('o', 8), 9, 100).error, 'NOT_FOUND')
  assert.equal(lockOffer(offer('o', 8), 8, 100).error, 'NOT_FOUND', '边界：失效周当周不可锁')
  assert.equal(lockOffer(offer('o', 8), 7, 100).error, null)
})

test('定金档位已冻结：普通 5%、IP 上门 10%，按生成时固定的 deposit_basis', () => {
  const o = generateOffer(42, 3, 0)
  assert.equal(depositBase(o), o.deposit_basis)
  assert.equal(depositAmount(o), Math.floor(o.deposit_basis * 50 / 1000))
  const ip = generateOffer(42, 3, 0, { sourceType: 'ip_visit' })
  assert.equal(ip.offer_source_type, 'ip_visit')
  assert.equal(depositAmount(ip), Math.floor(ip.deposit_basis * 100 / 1000))
  const inflated = { ...o, contract_budget: o.contract_budget * 2 }
  assert.equal(depositAmount(inflated), depositAmount(o), '后续预算调整不追溯改变定金')
})

test('抵扣 100% 仅限锁定期内；锁定期外不抵扣', () => {
  const o = generateOffer(42, 3, 0)
  const locked = lockOffer(o, 3, 800000).offer
  assert.equal(locked.locked_until, 5)
  const inLock = startWorkCash(locked, 10000000, 3)
  assert.equal(inLock.deposit_applied, 800000)
  assert.equal(inLock.cash_due, 9200000)
  const lastWeek = startWorkCash(locked, 10000000, 4)
  assert.equal(lastWeek.deposit_applied, 800000, 'W+1 仍有效')
  const expired = startWorkCash(locked, 10000000, 5)
  assert.equal(expired.deposit_applied, 0, 'W+2 开局锁定失效，不抵扣')
  assert.equal(expired.cash_due, 10000000)
  const small = startWorkCash(locked, 500000, 3)
  assert.equal(small.cash_due, 0)
  assert.equal(small.deposit_applied, 500000)
})

test('历史 id 复用被拒（防删除再生成绕过锁定历史）', () => {
  const o = generateOffer(42, 3, 1)
  assert.equal(isIdReuse(o.id, [o.id]), true)
  assert.equal(isIdReuse(o.id, []), false)
})

// ---- 热度 ----

test('热度坐标恒等、取值合法、随周/题材变化', () => {
  const a = heatLevel(42, 3, 'action')
  assert.equal(a, heatLevel(42, 3, 'action'))
  assert.ok(HEAT_LEVELS.includes(a))
  const levels = new Set()
  for (let w = 0; w < 40; w++) levels.add(heatLevel(42, w, 'action'))
  assert.ok(levels.size >= 2, '热度应随周变化')
})