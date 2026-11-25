#!/usr/bin/env node
// 校验事件测试夹具：结构、覆盖矩阵、与事件目录的交叉引用。
// 用法: node scripts/validate-event-fixtures.mjs [夹具路径] [目录路径]
import { readFileSync } from 'node:fs'

const fixturePath = process.argv[2] || 'docs/event_test_fixtures.json'
const read = (path) => JSON.parse(readFileSync(path, 'utf8'))
const errors = []
const fail = (where, message) => errors.push(`${where}: ${message}`)
const STAGES = ['content_design', 'storyboard_key_animation', 'animation', 'art_visual', 'photography_editing', 'sound_delivery']

let fixtures
try {
  fixtures = read(fixturePath)
} catch (error) {
  console.error(`无法读取或解析 ${fixturePath}: ${error.message}`)
  process.exit(1)
}

const catalogPath = process.argv[3] || fixtures.catalog
let catalog
try {
  catalog = read(catalogPath)
} catch (error) {
  console.error(`无法读取事件目录 ${catalogPath}: ${error.message}`)
  process.exit(1)
}

const events = new Map((catalog.events || []).map((event) => [event.id, event]))
const tags = new Set((catalog.events || []).map((event) => event.tag))

function checkPending(value, where) {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    fail(where, 'pending_events 必须是数组；无事件写 []')
    return []
  }
  return value.map((entry, index) => {
    const at = `${where}[${index}]`
    const normalized = typeof entry === 'string' ? { id: entry } : entry
    if (!normalized || typeof normalized !== 'object' || typeof normalized.id !== 'string') {
      fail(at, '必须是事件 id 字符串或 { id, work_id?, triggered_week? }')
      return null
    }
    if (!events.has(normalized.id)) fail(at, `引用不存在的事件: ${normalized.id}`)
    if (normalized.work_id !== undefined && (typeof normalized.work_id !== 'string' || normalized.work_id.length === 0)) {
      fail(at, 'work_id 必须是非空字符串')
    }
    if (normalized.triggered_week !== undefined && !Number.isInteger(normalized.triggered_week)) {
      fail(at, 'triggered_week 必须是整数')
    }
    return normalized
  }).filter(Boolean)
}

function checkStage(value, where) {
  if (value !== undefined && !STAGES.includes(value)) fail(where, `未知阶段: ${value}`)
}

if (fixtures.schema_version !== 1) fail('root', 'schema_version 必须为 1')
if (!Array.isArray(fixtures.cases) || fixtures.cases.length === 0) fail('root', 'cases 必须是非空数组')
if (!Array.isArray(fixtures.required_covers)) fail('root', 'required_covers 必须是数组')

const covered = new Set()
const seen = new Set()

for (const [index, item] of (fixtures.cases || []).entries()) {
  const where = `cases[${index}]${item.id ? ` (${item.id})` : ''}`
  if (typeof item.id !== 'string' || item.id.length < 3) fail(where, 'id 必须是非空字符串')
  else if (seen.has(item.id)) fail(where, `id 重复: ${item.id}`)
  else seen.add(item.id)

  if (!Array.isArray(item.covers) || item.covers.length === 0) fail(where, 'covers 必须是非空数组')
  else for (const tag of item.covers) covered.add(tag)

  const given = item.given || {}
  const expect = item.expect || {}
  checkStage(given.stage, `${where}.given.stage`)
  if (given.completed_stages !== undefined) {
    if (!Array.isArray(given.completed_stages)) fail(`${where}.given.completed_stages`, '必须是数组')
    else given.completed_stages.forEach((stage, stageIndex) => checkStage(stage, `${where}.given.completed_stages[${stageIndex}]`))
  }
  if (given.cooldowns && typeof given.cooldowns === 'object') {
    for (const key of Object.keys(given.cooldowns)) {
      if (!tags.has(key)) fail(where, `cooldowns 键 ${key} 不是目录中任何事件的 tag`)
    }
  }
  if (given.major_seen) {
    if (!Array.isArray(given.major_seen)) fail(`${where}.given.major_seen`, '必须是数组')
    else for (const id of given.major_seen) if (!events.has(id)) fail(where, `major_seen 引用了不存在的事件: ${id}`)
  }
  if (given.projects !== undefined) {
    if (!Array.isArray(given.projects)) fail(`${where}.given.projects`, '必须是数组')
    else given.projects.forEach((project, projectIndex) => checkStage(project.stage, `${where}.given.projects[${projectIndex}].stage`))
  }

  const givenPending = checkPending(given.pending_events, `${where}.given.pending_events`)
  const expectedPending = checkPending(expect.pending_events, `${where}.expect.pending_events`)
  if (expect.pending_events === undefined) fail(where, 'expect.pending_events 必须显式写数组；无事件写 []')
  for (const [pendingIndex, pending] of expectedPending.entries()) {
    const event = events.get(pending.id)
    const stage = pending.work_id && Array.isArray(given.projects)
      ? given.projects.find((project) => project.work_id === pending.work_id)?.stage
      : given.stage
    if (event && stage && !event.stages.includes(stage)) {
      fail(`${where}.expect.pending_events[${pendingIndex}]`, `${pending.id} 不适用于阶段 ${stage}`)
    }
  }

  const duplicates = []
  for (const pendingList of [givenPending, expectedPending]) {
    const perProjectWeek = new Map()
    for (const pending of pendingList) {
      if (!pending.work_id || pending.triggered_week === undefined) continue
      const key = `${pending.work_id}@${pending.triggered_week}`
      perProjectWeek.set(key, (perProjectWeek.get(key) || 0) + 1)
    }
    duplicates.push(...[...perProjectWeek].filter(([, count]) => count > 1))
  }
  if (duplicates.length > 0 && !(expect.action === 'validate_state' && expect.error === 'INVALID_STATE')) {
    fail(where, `同一项目同周出现多个事件: ${duplicates.map(([key]) => key).join(', ')}`)
  }
  if (expect.action === 'validate_state' && expect.error === 'INVALID_STATE' && duplicates.length === 0) {
    fail(where, 'INVALID_STATE 夹具必须给出同项目同周重复事件')
  }

  const choiceEvent = given.choice_event || expect.option && expectedPending[0]?.id
  const choice = given.choice || expect.option
  if (choiceEvent || choice) {
    if (!choiceEvent || !events.has(choiceEvent)) fail(where, 'choice_event 必须引用目录事件')
    else if (!choice) fail(where, '指定 choice_event 时必须给出 choice')
    else {
      const option = events.get(choiceEvent).options.find((entry) => entry.id === choice)
      if (!option) fail(where, `选项 ${choice} 不在 ${choiceEvent} 中`)
      else {
        if (given.funds !== undefined && option.cost > given.funds && !expect.disabled_reason) {
          fail(where, `现金不足用例必须说明 disabled_reason：cost ${option.cost} > funds ${given.funds}`)
        }
        if (expect.funds_delta !== undefined && expect.pending_events?.length === 0 && expect.reject_if_charged_twice) {
          if (expect.funds_delta !== -option.cost || expect.costs_events_delta !== option.cost) {
            fail(where, 'ledger_once 金额必须与选项 cost 一致')
          }
        }
        const nonzeroFunds = option.effects.some((effect) => effect.target === 'funds' && effect.value !== 0)
        if (nonzeroFunds && expect.error !== 'NOT_IMPLEMENTED') fail(where, '非零 funds 选项必须断言 NOT_IMPLEMENTED')
        if (expect.error === 'NOT_IMPLEMENTED' && !nonzeroFunds && !['outsource', 'extension'].includes(option.kind)) {
          fail(where, 'NOT_IMPLEMENTED 夹具的效果或选项类型必须支持该错误')
        }
      }
    }
  }

  if (expect.stage_effect) {
    checkStage(expect.stage_effect.stage, `${where}.expect.stage_effect.stage`)
    if (!['quality', 'work_done'].includes(expect.stage_effect.target)) fail(where, 'stage_effect.target 必须是 quality 或 work_done')
    if (!Number.isInteger(expect.stage_effect.value) || expect.stage_effect.value === 0) fail(where, 'stage_effect.value 必须是非零整数')
  }
  if (expect.action === 'advance_week' && expect.error !== 'INVALID_PHASE') fail(where, '暂停用例应断言 INVALID_PHASE')
  if (expect.advance_week_allowed !== undefined && typeof expect.advance_week_allowed !== 'boolean') {
    fail(where, 'advance_week_allowed 必须是布尔值')
  }
}

for (const required of fixtures.required_covers || []) {
  if (!covered.has(required)) fail('root', `覆盖矩阵缺少: ${required}`)
}

if (errors.length > 0) {
  for (const message of errors) console.error(`错误 ${message}`)
  console.error(`\n校验失败：${errors.length} 个错误`)
  process.exit(1)
}

console.log(`夹具 ${fixtures.cases.length} 条，覆盖 ${covered.size} 类：${[...covered].join(', ')}`)
console.log(`校验通过：${fixturePath}`)
