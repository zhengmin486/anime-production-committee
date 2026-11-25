#!/usr/bin/env node
// 校验事件内容目录：字段、取值范围、效果边界与规则一致性。
// 用法: node scripts/validate-event-catalog.mjs [文件路径]
import { readFileSync } from 'node:fs'

const STAGES = ['content_design', 'storyboard_key_animation', 'animation', 'art_visual', 'photography_editing', 'sound_delivery']
const CATEGORIES = ['personnel', 'quality', 'budget', 'schedule']
const METRICS = ['stage_quality', 'stage_progress_permille', 'max_fatigue', 'weeks_in_project', 'weeks_to_deadline', 'funds', 'morale']
const OPS = ['<', '<=', '>', '>=']
const KINDS = ['abandon', 'overtime', 'outsource', 'extension', 'accept', 'decline']
const NEGATIVE_KINDS = ['abandon', 'overtime', 'outsource', 'extension']
const POSITIVE_KINDS = ['accept', 'decline']
const SCOPES = ['instant', 'stage', 'project']
const TARGETS = ['quality', 'work_done', 'fatigue', 'morale', 'funds']
const INSTANT_ONLY = ['fatigue', 'morale', 'funds']
const RANGES = {
  quality: [-20, 20],
  work_done: [-400, 400],
  fatigue: [-40, 40],
  morale: [-30, 30],
  funds: [-3000000, 3000000],
}
const SNAKE = /^[a-z][a-z0-9_]{2,39}$/

const path = process.argv[2] || 'docs/event_catalog.example.json'
const errors = []
const warnings = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const warn = (where, message) => warnings.push(`${where}: ${message}`)
const isInt = (value) => Number.isInteger(value)
const textLength = (value) => [...value].length
const exactFields = (value, required, optional, where) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(where, '必须是对象')
    return false
  }
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${where}.${key}`, '未知字段')
  for (const key of required) if (!Object.hasOwn(value, key)) fail(where, `缺少字段: ${key}`)
  return true
}

let doc
try {
  doc = JSON.parse(readFileSync(path, 'utf8'))
} catch (error) {
  console.error(`无法读取或解析 ${path}: ${error.message}`)
  process.exit(1)
}

exactFields(doc, ['schema_version', 'events'], ['note'], 'root')
if (doc.schema_version !== 1) fail('root', 'schema_version 必须为 1')
if (doc.note !== undefined && typeof doc.note !== 'string') fail('root.note', '必须是字符串')
if (!Array.isArray(doc.events) || doc.events.length === 0) fail('root', 'events 必须是非空数组')
if (Array.isArray(doc.events) && doc.events.length > 40) fail('root', 'events 超过 40 条，首版应控制在 40 条以内')

const seenIds = new Set()
const seenNames = new Set()
const rows = []

for (const [index, event] of (doc.events || []).entries()) {
  const where = `events[${index}]${event && event.id ? ` (${event.id})` : ''}`
  if (!exactFields(event, [
    'id', 'name', 'polarity', 'tier', 'category', 'stages', 'tag', 'priority', 'cooldown_weeks',
    'once_per_project', 'trigger', 'random_weight', 'expires_weeks', 'escalation', 'description', 'options'
  ], [], where)) continue

  if (typeof event.id !== 'string' || !SNAKE.test(event.id)) fail(where, 'id 必须是 3–40 位小写蛇形命名')
  else if (seenIds.has(event.id)) fail(where, `id 重复: ${event.id}`)
  else seenIds.add(event.id)

  if (typeof event.name !== 'string' || textLength(event.name) < 1 || textLength(event.name) > 24) fail(where, 'name 长度须为 1–24')
  else if (seenNames.has(event.name)) warn(where, `name 重复: ${event.name}`)
  else seenNames.add(event.name)

  if (typeof event.description !== 'string' || textLength(event.description) < 1 || textLength(event.description) > 200) fail(where, 'description 长度须为 1–200')
  if (!['negative', 'positive'].includes(event.polarity)) fail(where, 'polarity 须为 negative/positive')
  if (!['normal', 'major'].includes(event.tier)) fail(where, 'tier 须为 normal/major')
  if (!CATEGORIES.includes(event.category)) fail(where, `category 须为 ${CATEGORIES.join('/')}`)
  if (typeof event.tag !== 'string' || !SNAKE.test(event.tag)) fail(where, 'tag 必须是 3–40 位小写蛇形命名')

  const stages = event.stages
  if (!Array.isArray(stages) || stages.length === 0) fail(where, 'stages 必须是非空数组')
  else {
    if (stages.length > STAGES.length) fail(where, `stages 最多包含 ${STAGES.length} 个阶段`)
    if (new Set(stages).size !== stages.length) fail(where, 'stages 有重复项')
    for (const stage of stages) if (!STAGES.includes(stage)) fail(where, `未知阶段: ${stage}；v4 阶段须为 ${STAGES.join('/')}`)
  }

  if (!isInt(event.priority) || event.priority < 1 || event.priority > 100) fail(where, 'priority 须为 1–100 的整数，数字越小越优先')
  if (!isInt(event.cooldown_weeks) || event.cooldown_weeks < 0 || event.cooldown_weeks > 52) fail(where, 'cooldown_weeks 须为 0–52')
  if (typeof event.once_per_project !== 'boolean') fail(where, 'once_per_project 必须是布尔值')
  if (event.tier === 'major') {
    if (event.once_per_project !== true) fail(where, '重大事件必须 once_per_project=true')
    if (event.cooldown_weeks !== 0) fail(where, '重大事件用 once_per_project 控制重复，cooldown_weeks 必须为 0')
  }

  const trigger = event.trigger
  if (exactFields(trigger, ['metric', 'op', 'threshold'], [], `${where}.trigger`)) {
    if (!METRICS.includes(trigger.metric)) fail(where, `未知触发指标: ${trigger.metric}`)
    if (!OPS.includes(trigger.op)) fail(where, `未知比较符: ${trigger.op}`)
    if (!isInt(trigger.threshold)) fail(where, 'trigger.threshold 必须是整数')
  }

  if (!isInt(event.random_weight) || event.random_weight < 0 || event.random_weight > 100) fail(where, 'random_weight 须为 0–100')
  if (!isInt(event.expires_weeks) || event.expires_weeks < 0 || event.expires_weeks > 8) fail(where, 'expires_weeks 须为 0–8')
  if (event.polarity === 'positive' && event.expires_weeks !== 0) fail(where, '正面机会不设处理期限，expires_weeks 必须为 0')

  if (event.expires_weeks > 0) {
    const escalation = event.escalation
    if (exactFields(escalation, ['description', 'effects'], [], `${where}.escalation`)) {
      if (typeof escalation.description !== 'string' || textLength(escalation.description) < 1 || textLength(escalation.description) > 160) fail(where, 'escalation.description 长度须为 1–160')
      if (!Array.isArray(escalation.effects) || escalation.effects.length === 0) fail(where, 'escalation.effects 必须是非空数组')
      else escalation.effects.forEach((effect, effectIndex) => {
        const ep = `${where}.escalation.effects[${effectIndex}]`
        if (!exactFields(effect, ['scope', 'target', 'value'], ['stage'], ep)) return
        if (!SCOPES.includes(effect.scope)) fail(ep, `scope 须为 ${SCOPES.join('/')}`)
        if (!TARGETS.includes(effect.target)) { fail(ep, `target 须为 ${TARGETS.join('/')}`); return }
        if (!isInt(effect.value) || effect.value === 0) fail(ep, 'value 必须是非零整数')
        else {
          const [min, max] = RANGES[effect.target]
          if (effect.value < min || effect.value > max) fail(ep, `${effect.target} 取值须在 ${min}–${max}`)
        }
        if (INSTANT_ONLY.includes(effect.target) && effect.scope !== 'instant') fail(ep, `${effect.target} 只能即时结算（scope=instant）`)
        if (effect.scope === 'stage' && effect.stage !== undefined && (!Array.isArray(stages) || !stages.includes(effect.stage))) fail(ep, `effect.stage=${effect.stage} 不在事件适用阶段内`)
        if (effect.scope !== 'stage' && effect.stage !== undefined) fail(ep, '只有 stage 作用域可以携带 effect.stage')
        if (effect.target === 'work_done' && effect.scope === 'project') fail(ep, 'work_done 不能作用于 project，工作量只影响具体阶段')
      })
    }
  } else if (event.escalation !== null) {
    fail(where, 'expires_weeks 为 0 时 escalation 必须为 null')
  }

  const options = event.options
  if (!Array.isArray(options) || options.length === 0) { fail(where, 'options 必须是非空数组'); continue }
  if (options.length > 4) fail(where, 'options 超过 4 个，首版建议不超过 4')

  const seenOptions = new Set()
  let hasPaidOption = false
  for (const [optionIndex, option] of options.entries()) {
    const at = `${where}.options[${optionIndex}]`
    if (!exactFields(option, ['id', 'label', 'kind', 'cost', 'effects'], [], at)) continue
    if (typeof option.id !== 'string' || !SNAKE.test(option.id)) fail(at, 'id 必须是 3–40 位小写蛇形命名')
    else if (seenOptions.has(option.id)) fail(at, `选项 id 重复: ${option.id}`)
    else seenOptions.add(option.id)

    if (typeof option.label !== 'string' || textLength(option.label) < 1 || textLength(option.label) > 24) fail(at, 'label 长度须为 1–24')
    if (!KINDS.includes(option.kind)) fail(at, `kind 须为 ${KINDS.join('/')}`)
    if (event.polarity === 'positive' && !POSITIVE_KINDS.includes(option.kind)) fail(at, '正面机会只能使用 accept/decline')
    if (event.polarity === 'negative' && !NEGATIVE_KINDS.includes(option.kind)) fail(at, '负面异常不能使用 accept/decline，应使用 abandon/overtime/outsource/extension')

    if (!isInt(option.cost) || option.cost < 0 || option.cost > 3000000) fail(at, 'cost 须为 0–3,000,000 的整数')
    if (option.cost > 0) hasPaidOption = true

    if (!Array.isArray(option.effects) || option.effects.length > 4) { fail(at, 'effects 必须是数组且不超过 4 项'); continue }
    for (const [effectIndex, effect] of option.effects.entries()) {
      const ep = `${at}.effects[${effectIndex}]`
      if (!exactFields(effect, ['scope', 'target', 'value'], ['stage'], ep)) continue
      if (!SCOPES.includes(effect.scope)) fail(ep, `scope 须为 ${SCOPES.join('/')}`)
      if (!TARGETS.includes(effect.target)) { fail(ep, `target 须为 ${TARGETS.join('/')}`); continue }
      if (!isInt(effect.value) || effect.value === 0) fail(ep, 'value 必须是非零整数')
      else {
        const [min, max] = RANGES[effect.target]
        if (effect.value < min || effect.value > max) fail(ep, `${effect.target} 取值须在 ${min}–${max}`)
      }
      if (effect.target === 'funds' && isInt(effect.value) && effect.value !== 0) {
        warn(ep, '非零 funds 效果尚未获得统一财务授权；schema 暂保留，当前运行时返回 NOT_IMPLEMENTED，确定支出请使用选项 cost，不得改记其他类别')
      }
      if (INSTANT_ONLY.includes(effect.target) && effect.scope !== 'instant') fail(ep, `${effect.target} 只能即时结算（scope=instant）`)
      if (effect.scope === 'stage') {
        if (effect.stage !== undefined) {
          if (!STAGES.includes(effect.stage)) fail(ep, `未知阶段: ${effect.stage}`)
          else if (Array.isArray(stages) && !stages.includes(effect.stage)) fail(ep, `effect.stage=${effect.stage} 不在事件适用阶段内`)
        }
      } else if (effect.stage !== undefined) {
        fail(ep, '只有 stage 作用域可以携带 effect.stage')
      }
      if (effect.target === 'work_done' && effect.scope === 'project') fail(ep, 'work_done 不能作用于 project，工作量只影响具体阶段')
    }
  }

  if (event.polarity === 'negative') {
    if (!options.some((option) => option && option.kind === 'abandon')) fail(where, '负面异常必须提供一个 abandon（放弃解决）选项')
    if (!hasPaidOption && !options.some((option) => option && Array.isArray(option.effects) && option.effects.length > 0)) {
      warn(where, '所有选项都没有代价，可能不构成真实取舍')
    }
    if (event.tier === 'major' && options.length < 2) fail(where, '重大事件至少要有两个处理选项')
  } else {
    if (!options.some((option) => option && option.kind === 'accept')) fail(where, '正面机会必须提供一个 accept 选项')
    if (!options.some((option) => option && option.kind === 'decline')) fail(where, '正面机会必须提供一个 decline 选项')
  }

  rows.push([
    event.id,
    `${event.tier}/${event.polarity}`,
    event.category,
    Array.isArray(stages) ? stages.join(',') : String(stages ?? ''),
    `${trigger?.metric ?? '?'} ${trigger?.op ?? '?'} ${trigger?.threshold ?? '?'}`,
    String(options.length),
  ])
}

const width = (values) => values.map((value, index) => Math.max(value.length, rows.reduce((max, row) => Math.max(max, row[index].length), 0)))
if (rows.length > 0) {
  const header = ['id', 'tier/polarity', 'category', 'stages', 'trigger', 'options']
  const widths = width(header)
  const line = (cells) => cells.map((cell, index) => cell.padEnd(widths[index])).join('  ')
  console.log(line(header))
  console.log(widths.map((value) => '-'.repeat(value)).join('  '))
  for (const row of rows) console.log(line(row))
}

const negatives = (doc.events || []).filter((event) => event.polarity === 'negative').length
const positives = (doc.events || []).filter((event) => event.polarity === 'positive').length
const majors = (doc.events || []).filter((event) => event.tier === 'major').length
console.log(`\n合计 ${rows.length} 条：负面 ${negatives} / 正面 ${positives}；重大 ${majors}`)

for (const message of warnings) console.warn(`警告 ${message}`)
if (errors.length > 0) {
  for (const message of errors) console.error(`错误 ${message}`)
  console.error(`\n校验失败：${errors.length} 个错误`)
  process.exit(1)
}
console.log(`校验通过：${path}`)
