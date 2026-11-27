#!/usr/bin/env node
// 校验制作蓝图：字段、依赖图、交付门槛与结构可读性。
// 用法: node scripts/validate-blueprint.mjs [文件路径]
//
// 只做结构与量级检查，不做平衡判定。数值是否合理由模拟器与试玩决定。
import { readFileSync } from 'node:fs'

const STAGES = [
  'content_design',
  'storyboard_key_animation',
  'animation',
  'art_visual',
  'photography_editing',
  'sound_delivery',
]
const ABILITIES = ['planning', 'direction', 'drawing', 'animation', 'management', 'postproduction']
const SCALES = ['ova', 'short', 'tv', 'movie']
const EPISODE_RANGE = { ova: [1, 1], short: [1, 3], tv: [1, 13], movie: [1, 1] }
const KEY = /^[a-z][a-z0-9_]{1,39}$/
const COMMON_PREFIX = 'common:'
const POINTS_PER_STAFF_WEEK = 70

const errors = []
const warnings = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const warn = (where, message) => warnings.push(`${where}: ${message}`)
const isInt = (v) => Number.isInteger(v)
const isText = (v) => typeof v === 'string' && v.length > 0

const path = process.argv[2] || 'docs/blueprints/tv_standard.blueprint.json'

let doc
try {
  doc = JSON.parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`无法读取或解析 ${path}: ${error.message}`)
  process.exit(1)
}

// ---------- 基础字段 ----------
if (doc.schema_version !== 1) fail('root', 'schema_version 必须为 1')
if (!isText(doc.id) || !KEY.test(doc.id)) fail('root.id', '必须是小写 snake_case')
if (!SCALES.includes(doc.scale)) fail('root.scale', `必须是 ${SCALES.join('/')}`)
if (!isInt(doc.episode_count) || doc.episode_count < 1) fail('root.episode_count', '必须是正整数')
if (doc.work_unit !== 'centi_staff_week') {
  fail('root.work_unit', '必须声明冻结枚举 work_unit=centi_staff_week；当前 v0.5 runtime 按 1 人周 = 70 工作点换算')
}
if (Array.isArray(doc.common) === false || doc.common.length === 0) fail('root.common', '必须是非空数组')
if (Array.isArray(doc.episode) === false || doc.episode.length === 0) fail('root.episode', '必须是非空数组')
if (errors.length > 0) report()

const range = EPISODE_RANGE[doc.scale]
if (range && (doc.episode_count < range[0] || doc.episode_count > range[1])) {
  warn('root.episode_count', `${doc.scale} 的常见集数是 ${range[0]}–${range[1]}，当前 ${doc.episode_count}`)
}

// ---------- 条目 ----------
const common = new Map()
for (const [i, item] of doc.common.entries()) {
  const where = `common[${i}]`
  if (!isText(item.key) || !KEY.test(item.key)) fail(where, 'key 必须是小写 snake_case')
  if (common.has(item.key)) fail(where, `key 重复: ${item.key}`)
  if (!isText(item.name)) fail(where, 'name 必须是非空字符串')
  if (!ABILITIES.includes(item.ability)) fail(where, `ability 必须是 ${ABILITIES.join('/')}`)
  if (!isInt(item.work_total) || item.work_total <= 0) fail(where, 'work_total 必须是正整数')
  if (!isInt(item.deliver_at) || item.deliver_at < 1 || item.deliver_at > 1000) {
    fail(where, 'deliver_at 必须是 1–1000 的整数（占 work_total 的千分比）')
  }
  if (!Array.isArray(item.deps)) fail(where, 'deps 必须是数组')
  if (typeof item.outsourceable !== 'boolean') fail(where, 'outsourceable 必须是布尔值')
  if (item.outsourceable !== false) fail(where, '公共制作不可外包')
  common.set(item.key, item)
}

const episode = new Map()
for (const [i, item] of doc.episode.entries()) {
  const where = `episode[${i}]`
  if (!isText(item.key) || !KEY.test(item.key)) fail(where, 'key 必须是小写 snake_case')
  if (episode.has(item.key)) fail(where, `key 重复: ${item.key}`)
  if (!STAGES.includes(item.stage)) fail(where, `stage 必须是 ${STAGES.join('/')}`)
  if (!isText(item.name)) fail(where, 'name 必须是非空字符串')
  if (!ABILITIES.includes(item.ability)) fail(where, `ability 必须是 ${ABILITIES.join('/')}`)
  if (!isInt(item.work_total) || item.work_total <= 0) fail(where, 'work_total 必须是正整数')
  if (!isInt(item.deliver_at) || item.deliver_at < 1 || item.deliver_at > 1000) {
    fail(where, 'deliver_at 必须是 1–1000 的整数')
  }
  if (!Array.isArray(item.deps)) fail(where, 'deps 必须是数组')
  if (typeof item.outsourceable !== 'boolean') fail(where, 'outsourceable 必须是布尔值')
  if (item.is_gate === true && item.outsourceable === true) fail(where, '交付门槛不可外包')
  if (item.is_gate === true && item.deliver_at !== 1000) {
    warn(where, `门槛项建议 deliver_at=1000（当前 ${item.deliver_at}），否则作品可在未完成时交付`)
  }
  episode.set(item.key, item)
}

if (errors.length > 0) report()

if (doc.id === 'tv_standard') {
  const commonTotal = doc.common.reduce((sum, item) => sum + item.work_total, 0)
  const episodeTotal = doc.episode.reduce((sum, item) => sum + item.work_total, 0)
  const coreTotal = doc.episode.filter((item) => !item.outsourceable).reduce((sum, item) => sum + item.work_total, 0)
  const outsourceTotal = doc.episode.filter((item) => item.outsourceable).reduce((sum, item) => sum + item.work_total, 0)
  if (doc.episode_count !== 10) fail('root.episode_count', 'v0.5 tv_standard 必须为 10 集')
  if (commonTotal !== 4800) fail('common', `v0.5 公共制作必须为 4800 点，当前 ${commonTotal}`)
  if (episodeTotal !== 2100) fail('episode', `v0.5 单集必须为 2100 点，当前 ${episodeTotal}`)
  if (coreTotal !== 580) fail('episode', `v0.5 单集不可外包必须为 580 点，当前 ${coreTotal}`)
  if (outsourceTotal !== 1520) fail('episode', `v0.5 单集可外包必须为 1520 点，当前 ${outsourceTotal}`)
}

// ---------- 阶段覆盖 ----------
for (const stage of STAGES) {
  const count = doc.episode.filter((item) => item.stage === stage).length
  if (count === 0) fail('episode', `阶段 ${stage} 没有任何工作项；六阶段必须全部有内容`)
  if (count > 5) warn('episode', `阶段 ${stage} 有 ${count} 个工作项，可能过细（建议每阶段 ≤5）`)
}

const gates = doc.episode.filter((item) => item.is_gate === true)
if (gates.length === 0) fail('episode', '必须至少有一个 is_gate 工作项，否则作品无法判定可交付')
for (const gate of gates) {
  if (gate.stage !== 'sound_delivery') {
    warn('episode', `门槛项 ${gate.key} 不在 sound_delivery 阶段，请确认这是有意设计`)
  }
}

// ---------- 依赖解析与图 ----------
const resolveDep = (owner, dep, scope) => {
  if (typeof dep !== 'string' || dep.length === 0) {
    fail(owner, 'deps 中存在非法条目')
    return null
  }
  if (dep.startsWith(COMMON_PREFIX)) {
    const key = dep.slice(COMMON_PREFIX.length)
    if (!common.has(key)) {
      fail(owner, `依赖的公共项不存在: ${dep}`)
      return null
    }
    return COMMON_PREFIX + key
  }
  if (scope === 'common') {
    fail(owner, `公共制作只能依赖公共项，需要写成 ${COMMON_PREFIX}${dep}`)
    return null
  }
  if (!episode.has(dep)) {
    fail(owner, `依赖的单集项不存在: ${dep}`)
    return null
  }
  return dep
}

// 公共图
const commonDeps = new Map()
for (const item of doc.common) {
  const resolved = []
  for (const dep of item.deps) {
    if (dep === item.key) fail(`common.${item.key}`, '不允许依赖自身')
    const id = resolveDep(`common.${item.key}`, dep, 'common')
    if (id) resolved.push(id)
  }
  if (new Set(resolved).size !== resolved.length) fail(`common.${item.key}`, 'deps 存在重复项')
  commonDeps.set(item.key, resolved)
}

// 单集图（每集相同结构，用一份模板检查）
const episodeDeps = new Map()
for (const item of doc.episode) {
  const resolved = []
  for (const dep of item.deps) {
    if (dep === item.key) fail(`episode.${item.key}`, '不允许依赖自身')
    const id = resolveDep(`episode.${item.key}`, dep, 'episode')
    if (id) resolved.push(id)
  }
  if (new Set(resolved).size !== resolved.length) fail(`episode.${item.key}`, 'deps 存在重复项')
  episodeDeps.set(item.key, resolved)
}

if (errors.length > 0) report()

// Kahn 拓扑排序 + 环检测（只统计本图层内的边；跨容器依赖在可达性检查里单独验证）
const topo = (nodes, edges, label) => {
  const inLayer = new Set(nodes)
  const indeg = new Map(nodes.map((n) => [n, 0]))
  const dependents = new Map(nodes.map((n) => [n, []]))
  for (const [node, deps] of edges) {
    for (const dep of deps) {
      if (!inLayer.has(dep)) continue
      indeg.set(node, indeg.get(node) + 1)
      dependents.get(dep).push(node)
    }
  }
  const queue = nodes.filter((n) => indeg.get(n) === 0).sort()
  const order = []
  while (queue.length > 0) {
    const node = queue.shift()
    order.push(node)
    for (const next of dependents.get(node) ?? []) {
      indeg.set(next, indeg.get(next) - 1)
      if (indeg.get(next) === 0) queue.push(next)
    }
  }
  if (order.length !== nodes.length) {
    const stuck = nodes.filter((n) => !order.includes(n))
    fail(label, `依赖成环，涉及: ${stuck.join(', ')}`)
    return null
  }
  return order
}

const commonNodes = [...common.keys()]
commonNodes.sort()
const commonOrder = (() => {
  // 公共图只含公共项，用同一张表做拓扑
  const edges = new Map()
  for (const key of commonNodes) {
    edges.set(key, (commonDeps.get(key) ?? []).map((d) => d.slice(COMMON_PREFIX.length)))
  }
  return topo(commonNodes, edges, 'common')
})()

const episodeNodes = [...episode.keys()]
episodeNodes.sort()
const episodeOrder = topo(episodeNodes, episodeDeps, 'episode')

if (errors.length > 0) report()

// ---------- 可达性：所有条目都能通向某个门槛项 ----------
const reachable = new Set()
const queue = gates.map((g) => g.key)
while (queue.length > 0) {
  const node = queue.pop()
  if (reachable.has(node)) continue
  reachable.add(node)
  for (const dep of episodeDeps.get(node) ?? []) {
    if (dep.startsWith(COMMON_PREFIX)) {
      if (!reachable.has(dep)) queue.push(dep)
    } else if (!reachable.has(dep)) {
      queue.push(dep)
    }
  }
  // 公共项的依赖也要继续向上追溯
  if (node.startsWith(COMMON_PREFIX)) {
    const key = node.slice(COMMON_PREFIX.length)
    for (const dep of commonDeps.get(key) ?? []) {
      if (!reachable.has(dep)) queue.push(dep)
    }
  }
}

for (const item of doc.episode) {
  if (!reachable.has(item.key)) {
    warn(`episode.${item.key}`, '不在任何门槛项的依赖链上，可能是孤立工作项')
  }
}
const usedCommon = new Set()
for (const deps of episodeDeps.values()) {
  for (const dep of deps) if (dep.startsWith(COMMON_PREFIX)) usedCommon.add(dep.slice(COMMON_PREFIX.length))
}
for (const item of doc.common) {
  const used = usedCommon.has(item.key) || [...commonDeps.values()].some((deps) => deps.includes(COMMON_PREFIX + item.key))
  if (!used) warn(`common.${item.key}`, '没有任何单集工作项或公共项依赖它，等于白做')
}

// ---------- 统计 ----------
const sum = (items, key) => items.reduce((acc, item) => acc + item[key], 0)
const episodeWork = sum(doc.episode, 'work_total')
const commonWork = sum(doc.common, 'work_total')
const perInstance = episodeWork * doc.episode_count + commonWork

// 公共图与单集图分别统计，避免把公共制作误算成单集工作量。
const commonLongestFrom = new Map()
const walkCommon = (key) => {
  if (commonLongestFrom.has(key)) return commonLongestFrom.get(key)
  let best = 0
  for (const dep of commonDeps.get(key) ?? []) {
    const depKey = dep.slice(COMMON_PREFIX.length)
    best = Math.max(best, walkCommon(depKey) + common.get(depKey).work_total)
  }
  commonLongestFrom.set(key, best)
  return best
}

const episodeLongestFrom = new Map()
const walkEpisode = (key) => {
  if (episodeLongestFrom.has(key)) return episodeLongestFrom.get(key)
  let best = 0
  for (const dep of episodeDeps.get(key) ?? []) {
    if (dep.startsWith(COMMON_PREFIX)) continue
    best = Math.max(best, walkEpisode(dep) + episode.get(dep).work_total)
  }
  episodeLongestFrom.set(key, best)
  return best
}

const commonCriticalPath = Math.max(...[...common.keys()].map((key) => walkCommon(key) + common.get(key).work_total))
const criticalPath = Math.max(...gates.map((gate) => walkEpisode(gate.key) + gate.work_total))

const perStage = STAGES.map((stage) => {
  const items = doc.episode.filter((item) => item.stage === stage)
  return { stage, count: items.length, work: sum(items, 'work_total') }
})

console.log(`蓝图: ${doc.id} (${doc.name ?? '-'})`)
console.log(`规模: ${doc.scale} / ${doc.episode_count} 集`)
console.log('')
console.log(`单集工作项: ${doc.episode.length} 个, ${episodeWork} 点 (${(episodeWork / POINTS_PER_STAFF_WEEK).toFixed(2)} 人周)`)
console.log(`公共制作项: ${doc.common.length} 个, ${commonWork} 点 (${(commonWork / POINTS_PER_STAFF_WEEK).toFixed(2)} 人周)`)
console.log(`实例化后: ${doc.episode.length * doc.episode_count + doc.common.length} 个工作项, ${perInstance} 点 (${(perInstance / POINTS_PER_STAFF_WEEK).toFixed(1)} 人周)`)
console.log(`公共制作占总量: ${((commonWork / perInstance) * 100).toFixed(1)}%`)
console.log(`关键路径最重链: ${criticalPath} 点 (${(criticalPath / POINTS_PER_STAFF_WEEK).toFixed(2)} 人周，单集内)`)
console.log('')
console.log('阶段分布:')
for (const row of perStage) {
  console.log(`  ${row.stage.padEnd(26)} ${String(row.count).padStart(2)} 项  ${String(row.work).padStart(4)} 点`)
}
console.log('')

// ---------- 量级体检（只报警，不判定平衡） ----------
if (episodeWork < POINTS_PER_STAFF_WEEK) warn('scale', '单集工作量低于 1 人周，可能是量级写错或工作项过粗')
if (episodeWork > 30 * POINTS_PER_STAFF_WEEK) warn('scale', '单集工作量超过 30 人周，请确认工作点是否按当前 70 点/人周口径填写')
if (commonWork / perInstance > 0.3) {
  warn('scale', `公共制作占比 ${((commonWork / perInstance) * 100).toFixed(1)}% 偏高，公共项通常应少于单集总量`)
}
if (commonCriticalPath > commonWork) fail('graph', '公共制作关键路径工作量超过公共总工作量，依赖链可能有环或重复计数')
if (criticalPath > episodeWork) fail('graph', '单集关键路径工作量超过单集总工作量，依赖链可能有环或重复计数')

report()

function report() {
  for (const line of warnings) console.warn(`警告 ${line}`)
  if (errors.length > 0) {
    for (const line of errors) console.error(`错误 ${line}`)
    console.error(`\n校验失败: ${errors.length} 个错误, ${warnings.length} 个警告`)
    process.exit(1)
  }
  console.log(`校验通过: 0 个错误, ${warnings.length} 个警告`)
  process.exit(0)
}
