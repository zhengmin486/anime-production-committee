import { Stream, hashText, draw } from './coordinate-random.mjs'
import { reputationTier } from './recruit-oracle.mjs'

export const OPPORTUNITY_ORDER = Object.freeze([
  'brand_collaboration', 'live_event', 'early_screening', 'game_collaboration', 'pachinko',
])

export const CHECKPOINT_COUNTS = Object.freeze({
  ova: Object.freeze({ small: 1, medium: 1, large: 2 }),
  short: Object.freeze({ small: 2, medium: 2, large: 2 }),
  tv: Object.freeze({ small: 3, medium: 3, large: 4 }),
  movie: Object.freeze({ small: 2, medium: 2, large: 2 }),
})

const OPPORTUNITY_FIELDS = Object.freeze([
  'id', 'name', 'min_quality', 'min_reputation_tier', 'min_heat_permille', 'trigger_permille',
  'prelaunch_cost', 'income_min', 'income_max', 'heat_bonus_permille', 'work_total',
  'duration_weeks', 'weight', 'checkpoints',
])

function integerInRange(value, min, max) {
  return Number.isSafeInteger(value) && value >= min && value <= max
}

export function checkpointCount(projectType, scale, catalog) {
  const fromCatalog = catalog?.opportunities?.[0]?.checkpoints?.[projectType]?.[scale]
  return fromCatalog ?? CHECKPOINT_COUNTS[projectType]?.[scale]
}

export function validateOpportunityCatalog(catalog) {
  const issues = []
  if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
    return [{ field: 'catalog', message: '目录必须是对象' }]
  }
  if (catalog.schema_version !== 1) issues.push({ field: 'schema_version', message: 'schema_version 必须为 1' })
  if (!Array.isArray(catalog.opportunities) || catalog.opportunities.length !== OPPORTUNITY_ORDER.length) {
    issues.push({ field: 'opportunities', message: '必须恰好包含五类特殊商业机会' })
    return issues
  }
  for (const [index, opportunity] of catalog.opportunities.entries()) {
    const where = `opportunities[${index}]`
    if (!opportunity || typeof opportunity !== 'object' || Array.isArray(opportunity)) {
      issues.push({ field: where, message: '机会必须是对象' })
      continue
    }
    if (opportunity.id !== OPPORTUNITY_ORDER[index]) issues.push({ field: `${where}.id`, message: '机会类型或枚举顺序非法' })
    const keys = Object.keys(opportunity)
    if (keys.length !== OPPORTUNITY_FIELDS.length || OPPORTUNITY_FIELDS.some((field) => !Object.hasOwn(opportunity, field))) {
      issues.push({ field: where, message: '机会字段必须完整且无未知字段' })
    }
    if (typeof opportunity.name !== 'string' || opportunity.name.trim() === '') issues.push({ field: `${where}.name`, message: 'name 必须为非空字符串' })
    if (!integerInRange(opportunity.min_quality, 0, 100)) issues.push({ field: `${where}.min_quality`, message: '质量门槛必须在 0..100' })
    if (!integerInRange(opportunity.min_reputation_tier, 0, 7)) issues.push({ field: `${where}.min_reputation_tier`, message: '声望门槛必须在 T0..T7' })
    if (!integerInRange(opportunity.min_heat_permille, 0, 2000)) issues.push({ field: `${where}.min_heat_permille`, message: '热度门槛必须为合法千分比' })
    if (!integerInRange(opportunity.trigger_permille, 1, 1000)) issues.push({ field: `${where}.trigger_permille`, message: '触发概率必须在 1..1000 千分比' })
    if (!integerInRange(opportunity.prelaunch_cost, 0, Number.MAX_SAFE_INTEGER)) issues.push({ field: `${where}.prelaunch_cost`, message: '前置费必须为非负整数' })
    if (!integerInRange(opportunity.income_min, 0, Number.MAX_SAFE_INTEGER) ||
        !integerInRange(opportunity.income_max, opportunity.income_min ?? 0, Number.MAX_SAFE_INTEGER)) {
      issues.push({ field: `${where}.income`, message: '收入区间必须是合法整数区间' })
    }
    if (!integerInRange(opportunity.heat_bonus_permille, 0, 1000)) issues.push({ field: `${where}.heat_bonus_permille`, message: '热度加成必须是合法千分比' })
    if (!integerInRange(opportunity.work_total, 1, Number.MAX_SAFE_INTEGER)) issues.push({ field: `${where}.work_total`, message: '履约工作量必须为正整数' })
    if (!integerInRange(opportunity.duration_weeks, 1, 520)) issues.push({ field: `${where}.duration_weeks`, message: '履约期限必须在 1..520 周' })
    if (!integerInRange(opportunity.weight, 1, 100)) issues.push({ field: `${where}.weight`, message: '轮盘权重必须为正整数' })
    for (const [projectType, scales] of Object.entries(CHECKPOINT_COUNTS)) {
      for (const [scale, expected] of Object.entries(scales)) {
        if (opportunity.checkpoints?.[projectType]?.[scale] !== expected) {
          issues.push({ field: `${where}.checkpoints.${projectType}.${scale}`, message: `检查次数必须为 ${expected}` })
        }
      }
    }
  }
  return issues
}

function unitRoll(seed, week, purpose) {
  return draw(seed, week, Stream.misc, purpose, 0) / 0x100000000
}

export function drawAtCheckpoint({
  seed, week, workId, checkpoint, projectType, scale, quality, reputation, heat,
  usedTypes = [], catalog, rolls = {},
}) {
  const opportunities = catalog?.opportunities ?? []
  const hits = []
  for (const opportunity of opportunities) {
    if (usedTypes.includes(opportunity.id)) continue
    if (quality < opportunity.min_quality || reputationTier(reputation) < opportunity.min_reputation_tier ||
        heat < opportunity.min_heat_permille) continue
    const purpose = hashText(`commercial_opportunity:${workId}:${checkpoint}:${opportunity.id}`)
    const roll = rolls[opportunity.id] ?? unitRoll(seed, week, purpose)
    if (roll < opportunity.trigger_permille / 1000) hits.push(opportunity)
  }
  if (hits.length === 0) return null
  if (hits.length === 1) return hits[0]
  const totalWeight = hits.reduce((sum, opportunity) => sum + opportunity.weight, 0)
  const roulettePurpose = hashText(`commercial_opportunity_roulette:${workId}:${checkpoint}`)
  const roll = rolls.roulette ?? unitRoll(seed, week, roulettePurpose)
  const target = roll * totalWeight
  let cursor = 0
  for (const opportunity of hits) {
    cursor += opportunity.weight
    if (target < cursor) return opportunity
  }
  return hits.at(-1)
}
