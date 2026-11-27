// v4 全片质量参考实现（oracle，纯函数）。
//
// 定位与 recruit-oracle / market-oracle 相同：这不是运行时，而是规则样本。
// C++ 侧实现见 packages/game-core/src/v4/kernel.cpp（item_quality_milli / final_quality_milli），
// 两边必须逐位一致；若规则要改，先改 DECISION_LOG，再改这里与实现，最后补对照用例。
//
// 精度约定（DEC-STAFF-008）：
//   能力 / S_eff / S_sup：百分之一分（centi，1 分 = 100）
//   质量与奖励：千分之一分（milli，1 分 = 1000）
//   全部中间乘法在 Number 安全整数范围内（权重 ≤1000、质量 ≤105000、点数 ≤ 1e6），
//   除法一律向下取整；只有 Q_cap 的整数分部分按 half-up 处理。
//
// 输入形状与本仓库 state 一致：item 需带
//   quality_weight_permille / core_aesthetic / in_house_points（仅核心员工）/
//   in_house_ability_centi_sum / external_points / external_quality_milli_sum / external_min_quality

export const ABILITIES = Object.freeze([
  'planning', 'direction', 'drawing', 'animation', 'management', 'postproduction',
])

const floorDiv = (a, b) => Math.floor(a / b)

// 工序有效能力 S_eff：floor((85×主能力 + 3×Σ其余五维)/100)，输入为整数分，输出 centi。
export function effectiveAbilityCenti(staff, ability) {
  const primary = (staff.abilities[ability] ?? 0) * 100
  let otherSum = 0
  for (const name of ABILITIES) {
    if (name === ability) continue
    otherSum += (staff.abilities[name] ?? 0) * 100
  }
  return floorDiv(85 * primary + 3 * otherSum, 100)
}

// 监督能力 S_sup：天然监督系 70/30，转任系 50/25/25。
export function supervisorAbilityCenti(staff) {
  const direction = staff.abilities.direction ?? 0
  const management = staff.abilities.management ?? 0
  if (staff.role === '监督' || staff.role === '演出' || staff.role === 'director') {
    return 70 * direction + 30 * management
  }
  const primaryAbility =
    ['作画', 'key_animator', 'animator', 'animation_director'].includes(staff.role) ? 'drawing'
      : ['脚本', 'scriptwriter'].includes(staff.role) ? 'planning'
        : 'drawing'
  return 50 * direction + 25 * management + 25 * (staff.abilities[primaryAbility] ?? 0)
}

// 工作项最终质量 Q_item（milli）：Q_base → Q_sup → Q_cap → Q_ext_cap 取最小。
export function itemQualityMilli(item, supervisorMilli) {
  const total = (item.in_house_points ?? 0) + (item.external_points ?? 0)
  if (total <= 0) return 0

  const inHouseMilliSum = (item.in_house_ability_centi_sum ?? 0) * 10
  const baseSum = inHouseMilliSum + (item.external_quality_milli_sum ?? 0)
  const qBase = floorDiv(baseSum, total)

  const qSup = qBase + floorDiv(35 * Math.max(0, supervisorMilli - qBase), 100)

  // DEC-QUALITY-002：无社内核心产出时用 Q_base 代入上限公式
  const qInhouse = (item.in_house_points ?? 0) > 0 ? floorDiv(inHouseMilliSum, item.in_house_points) : qBase
  const capInner = 60 * Math.max(qInhouse, supervisorMilli) + 40 * qInhouse + 50000
  const qCap = Math.min(100000, 1000 * floorDiv(capInner, 100000) + 8000)

  let qItem = Math.min(qSup, qCap)

  const externalPoints = item.external_points ?? 0
  const externalMin = item.external_min_quality ?? 0
  if (externalPoints > 0 && externalMin > 0) {
    const extMinMilli = externalMin * 1000
    const rExtBp = floorDiv(10000 * externalPoints, total)
    const extCap = extMinMilli + floorDiv(25 * Math.max(0, supervisorMilli - extMinMilli), 100)
      + floorDiv((10000 - rExtBp) * 12000, 10000)
    qItem = Math.min(qItem, extCap)
  }
  return Math.max(0, Math.min(100000, qItem))
}

const itemsOf = (work) => {
  const items = [...work.common.items]
  for (const episode of work.episodes) {
    for (const stage of episode.stages) items.push(...stage.items)
  }
  return items
}

// 核心审美奖励：bonus = floor(5×max(0, min(S_sup,Q_item) − 70)/30)，需 S_sup>70 且 Q_item>70
const bonusMilli = (item, supervisorMilli) => {
  if (!item.core_aesthetic) return null
  const qItem = itemQualityMilli(item, supervisorMilli)
  if (supervisorMilli <= 70000 || qItem <= 70000) return 0
  const limit = Math.min(supervisorMilli, qItem)
  return floorDiv(5 * (limit - 70000), 30)
}

// 全片最终质量 Q_final（milli）：分层加权基础分 + 核心审美权重加权平均奖励，上限 105000。
export function finalQualityMilli(work, supervisor) {
  const supervisorMilli = supervisor ? supervisorAbilityCenti(supervisor) * 10 : 0
  const items = itemsOf(work)

  const layer = (predicate) => {
    let weighted = 0
    let weight = 0
    for (const item of items.filter(predicate)) {
      const w = Math.max(item.quality_weight_permille ?? 0, 0)
      if (w === 0) continue
      weighted += w * itemQualityMilli(item, supervisorMilli)
      weight += w
    }
    return { average: weight > 0 ? floorDiv(weighted, weight) : 0, weight }
  }

  const common = layer((item) => work.common.items.includes(item))
  const episodes = layer((item) => !work.common.items.includes(item))
  const weightSum = common.weight + episodes.weight
  if (weightSum <= 0) return 0
  const base = floorDiv(common.average * common.weight + episodes.average * episodes.weight, weightSum)

  let bonusNum = 0
  let bonusWeight = 0
  for (const item of items) {
    if (!item.core_aesthetic) continue
    const w = Math.max(item.quality_weight_permille ?? 0, 0)
    if (w === 0) continue
    bonusWeight += w
    bonusNum += w * bonusMilli(item, supervisorMilli)
  }
  const bonus = bonusWeight > 0 ? floorDiv(bonusNum, bonusWeight) : 0
  return Math.max(0, Math.min(105000, base + bonus))
}
