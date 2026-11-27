export const SUPPLIER_FIELDS = Object.freeze([
  'id', 'name', 'specialties', 'capacity_per_week', 'quality', 'speed',
  'price_per_unit', 'reliability', 'unlocked_week',
])

export function baseContractCap(capacityPerWeek, speed) {
  return Math.max(1, Math.floor(capacityPerWeek * speed / 100))
}

export function contractWeeklyCap({ capacityPerWeek, speed, workTotal, reservedCap, mode }) {
  if (!Number.isSafeInteger(capacityPerWeek) || capacityPerWeek <= 0) throw new Error('capacity_per_week 必须为正整数')
  if (!Number.isSafeInteger(speed) || speed < 0 || speed > 100) throw new Error('speed 必须在 0..100')
  if (!Number.isSafeInteger(workTotal) || workTotal <= 0) throw new Error('work_total 必须为正整数')
  if (!Number.isSafeInteger(reservedCap) || reservedCap < 0) throw new Error('reservedCap 必须为非负整数')
  const speedMultiplier = { normal: 100, emergency: 135 }[mode]
  if (speedMultiplier === undefined) throw new Error('mode 必须是 normal 或 emergency')
  const available = capacityPerWeek - reservedCap
  if (available <= 0) return 0
  return Math.min(available, workTotal, Math.max(1, Math.floor(baseContractCap(capacityPerWeek, speed) * speedMultiplier / 100)))
}

export function reliabilityOutcome(reliability, roll) {
  if (!Number.isInteger(reliability) || reliability < 0 || reliability > 100) throw new Error('reliability 必须在 0..100')
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('roll 必须在 [0,1)')
  const rate = reliability / 100
  if (roll < rate) return { outcome: 'normal', delivery: 1, rework: 0 }
  if (roll < 1 - 0.2 * (1 - rate)) return { outcome: 'delay', delivery: 0, rework: 0 }
  return { outcome: 'rework', delivery: 0, rework: 1 }
}

export function reworkPenalty(weeklyCap) {
  if (!Number.isSafeInteger(weeklyCap) || weeklyCap <= 0) throw new Error('weeklyCap 必须为正整数')
  return Math.max(1, Math.floor(weeklyCap / 4))
}

function integerInRange(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max
}

export function validateSupplierCatalog(catalog) {
  const issues = []
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return [{ field: 'catalog', message: '目录必须是对象' }]
  }
  if (catalog.schema_version !== 1) issues.push({ field: 'schema_version', message: 'schema_version 必须为 1' })
  if (!Array.isArray(catalog.suppliers) || catalog.suppliers.length === 0) {
    issues.push({ field: 'suppliers', message: 'suppliers 必须是非空数组' })
    return issues
  }
  const ids = new Set()
  for (const [index, supplier] of catalog.suppliers.entries()) {
    const where = `suppliers[${index}]`
    if (!supplier || typeof supplier !== 'object' || Array.isArray(supplier)) {
      issues.push({ field: where, message: '供应商必须是对象' })
      continue
    }
    const keys = Object.keys(supplier)
    if (keys.length !== SUPPLIER_FIELDS.length || SUPPLIER_FIELDS.some((field) => !Object.hasOwn(supplier, field))) {
      issues.push({ field: where, message: '供应商字段必须与九字段契约完全一致' })
    }
    if (typeof supplier.id !== 'string' || supplier.id.trim() === '') {
      issues.push({ field: `${where}.id`, message: 'id 必须为非空字符串' })
    } else if (ids.has(supplier.id)) {
      issues.push({ field: `${where}.id`, message: `供应商 id 重复: ${supplier.id}` })
    } else {
      ids.add(supplier.id)
    }
    if (typeof supplier.name !== 'string' || supplier.name.trim() === '') {
      issues.push({ field: `${where}.name`, message: 'name 必须为非空字符串' })
    }
    if (!Array.isArray(supplier.specialties) || supplier.specialties.length === 0 ||
        supplier.specialties.some((item) => typeof item !== 'string' || item.trim() === '') ||
        new Set(supplier.specialties).size !== supplier.specialties.length) {
      issues.push({ field: `${where}.specialties`, message: 'specialties 必须是非空、无重复的专业字符串数组' })
    }
    if (!integerInRange(supplier.capacity_per_week, 1, Number.MAX_SAFE_INTEGER)) {
      issues.push({ field: `${where}.capacity_per_week`, message: 'capacity_per_week 必须为正整数' })
    }
    if (!integerInRange(supplier.quality, 0, 100)) issues.push({ field: `${where}.quality`, message: 'quality 必须在 0..100' })
    if (!integerInRange(supplier.speed, 0, 100)) issues.push({ field: `${where}.speed`, message: 'speed 必须在 0..100' })
    if (!integerInRange(supplier.price_per_unit, 0, Number.MAX_SAFE_INTEGER)) {
      issues.push({ field: `${where}.price_per_unit`, message: 'price_per_unit 必须为非负整数' })
    }
    if (!integerInRange(supplier.reliability, 0, 100)) {
      issues.push({ field: `${where}.reliability`, message: 'reliability 必须是 0..100 的整数，不能为 null' })
    }
    if (!integerInRange(supplier.unlocked_week, 0, 520)) {
      issues.push({ field: `${where}.unlocked_week`, message: 'unlocked_week 必须在 0..520' })
    }
  }
  return issues
}
