import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  baseContractCap, contractWeeklyCap, reliabilityOutcome, reworkPenalty, validateSupplierCatalog,
} from './lib/supplier-oracle.mjs'

const specialties = ['planning', 'direction', 'drawing', 'animation', 'postproduction', 'full']
const catalog = {
  schema_version: 1,
  suppliers: specialties.map((specialty, index) => ({
    id: `supplier_${index}`,
    name: `测试供应商 ${index}`,
    specialties: [specialty],
    capacity_per_week: 100 + index,
    quality: 60 + index,
    speed: 50 + index,
    price_per_unit: 1000 + index,
    reliability: 70 + index,
    unlocked_week: index,
  })),
}

test('六类供应商候选记录通过九字段完整性校验', () => {
  assert.deepEqual(validateSupplierCatalog(catalog), [])
  assert.equal(catalog.suppliers.length, 6)
})

test('供应商缺字段、null 可靠性、重复 id 与越界值均拒绝', () => {
  const missing = structuredClone(catalog)
  delete missing.suppliers[0].reliability
  assert.ok(validateSupplierCatalog(missing).some((issue) => issue.field === 'suppliers[0].reliability'))
  const nullable = structuredClone(catalog)
  nullable.suppliers[0].reliability = null
  assert.ok(validateSupplierCatalog(nullable).some((issue) => issue.field.includes('reliability')))
  const duplicate = structuredClone(catalog)
  duplicate.suppliers[1].id = duplicate.suppliers[0].id
  assert.ok(validateSupplierCatalog(duplicate).some((issue) => issue.message.includes('重复')))
  const invalid = structuredClone(catalog)
  invalid.suppliers[0].quality = 101
  assert.ok(validateSupplierCatalog(invalid).some((issue) => issue.field.includes('quality')))
})

test('周产能上限使用共享池、速度、模式和工作量冻结公式', () => {
  assert.equal(baseContractCap(100, 60), 60)
  assert.equal(contractWeeklyCap({ capacityPerWeek: 100, speed: 60, workTotal: 1000, reservedCap: 40, mode: 'normal' }), 60)
  assert.equal(contractWeeklyCap({ capacityPerWeek: 100, speed: 60, workTotal: 1000, reservedCap: 40, mode: 'emergency' }), 60)
  assert.equal(contractWeeklyCap({ capacityPerWeek: 100, speed: 60, workTotal: 50, reservedCap: 0, mode: 'normal' }), 50)
  assert.equal(contractWeeklyCap({ capacityPerWeek: 100, speed: 60, workTotal: 1000, reservedCap: 95, mode: 'normal' }), 5)
  assert.equal(contractWeeklyCap({ capacityPerWeek: 100, speed: 60, workTotal: 1000, reservedCap: 100, mode: 'normal' }), 0)
  assert.throws(() => contractWeeklyCap({ capacityPerWeek: 100, speed: 60, workTotal: 10, reservedCap: 0, mode: 'gross' }))
})

test('可靠性三级边界与返工扣减严格遵循冻结公式', () => {
  assert.deepEqual(reliabilityOutcome(80, 0), { outcome: 'normal', delivery: 1, rework: 0 })
  assert.deepEqual(reliabilityOutcome(80, 0.799999), { outcome: 'normal', delivery: 1, rework: 0 })
  assert.deepEqual(reliabilityOutcome(80, 0.8), { outcome: 'delay', delivery: 0, rework: 0 })
  assert.deepEqual(reliabilityOutcome(80, 0.959999), { outcome: 'delay', delivery: 0, rework: 0 })
  assert.deepEqual(reliabilityOutcome(80, 0.96), { outcome: 'rework', delivery: 0, rework: 1 })
  assert.deepEqual(reliabilityOutcome(0, 0), { outcome: 'delay', delivery: 0, rework: 0 })
  assert.deepEqual(reliabilityOutcome(0, 0.8), { outcome: 'rework', delivery: 0, rework: 1 })
  assert.deepEqual(reliabilityOutcome(100, 0.999999), { outcome: 'normal', delivery: 1, rework: 0 })
  assert.equal(reworkPenalty(1), 1)
  assert.equal(reworkPenalty(4), 1)
  assert.equal(reworkPenalty(5), 1)
  assert.equal(reworkPenalty(8), 2)
  assert.throws(() => reliabilityOutcome(null, 0.5))
  assert.throws(() => reliabilityOutcome(80, 1))
})
