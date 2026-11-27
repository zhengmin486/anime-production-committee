import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CHECKPOINT_COUNTS, OPPORTUNITY_ORDER, checkpointCount, validateOpportunityCatalog, drawAtCheckpoint,
} from './lib/opportunity-oracle.mjs'

const catalog = JSON.parse(readFileSync('content/opportunities.json', 'utf8'))
const base = {
  seed: 42, week: 10, workId: 'work_01', checkpoint: 0, projectType: 'tv', scale: 'medium',
  quality: 100, reputation: 10000, heat: 2000, catalog,
}

test('五类机会正式目录完整，参数与固定枚举顺序可读取', () => {
  assert.deepEqual(validateOpportunityCatalog(catalog), [])
  assert.deepEqual(catalog.opportunities.map((item) => item.id), OPPORTUNITY_ORDER)
  assert.deepEqual(catalog.opportunities.map((item) => item.weight), [30, 25, 20, 15, 10])
  assert.deepEqual(catalog.opportunities.map((item) => item.trigger_permille), [350, 280, 220, 180, 120])
})

test('四类规模十二种检查次数与冻结表逐项一致', () => {
  for (const [projectType, scales] of Object.entries(CHECKPOINT_COUNTS)) {
    for (const [scale, count] of Object.entries(scales)) {
      assert.equal(checkpointCount(projectType, scale), count)
      assert.equal(checkpointCount(projectType, scale, catalog), count)
      for (const opportunity of catalog.opportunities) {
        assert.equal(opportunity.checkpoints[projectType][scale], count)
      }
    }
  }
})

test('质量、声望 Tier 与热度门槛含等号，任一不达标即不触发', () => {
  const onlyBrand = {
    quality: 62, reputation: 100, heat: 900,
    rolls: Object.fromEntries(OPPORTUNITY_ORDER.map((id) => [id, 0])),
  }
  assert.equal(drawAtCheckpoint({ ...base, ...onlyBrand }).id, 'brand_collaboration')
  assert.equal(drawAtCheckpoint({ ...base, ...onlyBrand, quality: 61 }), null)
  assert.equal(drawAtCheckpoint({ ...base, ...onlyBrand, reputation: 99 }), null)
  assert.equal(drawAtCheckpoint({ ...base, ...onlyBrand, heat: 899 }), null)
})

test('多命中按固定权重轮盘只取一个，边界归属稳定', () => {
  const rolls = Object.fromEntries(OPPORTUNITY_ORDER.map((id) => [id, 0]))
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0 } }).id, 'brand_collaboration')
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0.299999 } }).id, 'brand_collaboration')
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0.3 } }).id, 'live_event')
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0.55 } }).id, 'early_screening')
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0.75 } }).id, 'game_collaboration')
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0.9 } }).id, 'pachinko')
  assert.equal(drawAtCheckpoint({ ...base, rolls: { ...rolls, roulette: 0.999999 } }).id, 'pachinko')
})

test('同作品同类型只触发一次，剩余命中项重新计算轮盘总权重', () => {
  const rolls = Object.fromEntries(OPPORTUNITY_ORDER.map((id) => [id, 0]))
  assert.equal(drawAtCheckpoint({
    ...base, rolls: { ...rolls, roulette: 0 }, usedTypes: ['brand_collaboration', 'live_event'],
  }).id, 'early_screening')
  assert.equal(drawAtCheckpoint({
    ...base, rolls: { ...rolls, roulette: 0 },
    usedTypes: ['brand_collaboration', 'live_event', 'early_screening', 'game_collaboration'],
  }).id, 'pachinko')
  assert.equal(drawAtCheckpoint({ ...base, rolls, usedTypes: OPPORTUNITY_ORDER }), null)
})

test('基础命中与轮盘坐标独立，同输入重放逐位一致', () => {
  const first = drawAtCheckpoint(base)
  const second = drawAtCheckpoint(base)
  assert.equal(first?.id, second?.id)
  const changedRoulette = drawAtCheckpoint({
    ...base, rolls: Object.fromEntries([...OPPORTUNITY_ORDER.map((id) => [id, 0]), ['roulette', 0.99]]),
  })
  assert.equal(changedRoulette.id, 'pachinko')
  const noHits = drawAtCheckpoint({
    ...base, rolls: Object.fromEntries(OPPORTUNITY_ORDER.map((id) => [id, 0.999999])),
  })
  assert.equal(noHits, null)
})

test('目录缺参数、改检查次数、重复类型与非法权重均拒绝', () => {
  const missing = structuredClone(catalog)
  delete missing.opportunities[0].prelaunch_cost
  assert.ok(validateOpportunityCatalog(missing).some((issue) => issue.field === 'opportunities[0]'))
  const wrongCount = structuredClone(catalog)
  wrongCount.opportunities[0].checkpoints.tv.medium = 4
  assert.ok(validateOpportunityCatalog(wrongCount).some((issue) => issue.field.includes('checkpoints.tv.medium')))
  const duplicate = structuredClone(catalog)
  duplicate.opportunities[1].id = duplicate.opportunities[0].id
  assert.ok(validateOpportunityCatalog(duplicate).some((issue) => issue.field.endsWith('.id')))
  const wrongWeight = structuredClone(catalog)
  wrongWeight.opportunities[0].weight = 0
  assert.ok(validateOpportunityCatalog(wrongWeight).some((issue) => issue.field.endsWith('.weight')))
})
