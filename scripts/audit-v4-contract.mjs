#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const shape = JSON.parse(readFileSync(join(root, 'docs', 'v4-contract-shape.json'), 'utf8'))
const factory = (await import(pathToFileURL(join(root, 'build', 'v4', 'v4.mjs')).href)).default
const core = await factory()

const failures = []
const fail = (msg) => failures.push(msg)
const call = (name, payload) => JSON.parse(core[name](JSON.stringify(payload)))
const unwrap = (name, payload) => {
  const result = call(name, payload)
  if (result.error) throw new Error(`${name} 失败: ${result.error.code} ${result.error.message}`)
  return result
}

// ---- 采集一次覆盖事件闭环的真实运行（轻量夹具，避免长周期把现金烧穿） ----
const tinyBlueprint = {
  schema_version: 1,
  id: 'audit_tiny',
  name: '审计夹具',
  scale: 'short',
  episode_count: 1,
  work_unit: 'centi_staff_week',
  common: [{ key: 'series_comp', name: '系列构成', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [], quality_weight_permille: 200 }],
  episode: [
    { key: 'script', stage: 'content_design', name: '脚本', ability: 'planning', work_total: 100, deliver_at: 1000, deps: [], quality_weight_permille: 140 },
    { key: 'storyboard', stage: 'storyboard_key_animation', name: '分镜', ability: 'direction', work_total: 100, deliver_at: 1000, deps: ['script'], quality_weight_permille: 140 },
    { key: 'inbetween', stage: 'animation', name: '动画', ability: 'animation', work_total: 100, deliver_at: 1000, deps: ['storyboard'], outsourceable: true, quality_weight_permille: 140 },
    { key: 'background', stage: 'art_visual', name: '背景', ability: 'drawing', work_total: 100, deliver_at: 1000, deps: ['storyboard'], quality_weight_permille: 140 },
    { key: 'composite', stage: 'photography_editing', name: '摄影', ability: 'postproduction', work_total: 100, deliver_at: 1000, deps: ['inbetween', 'background'], quality_weight_permille: 140 },
    { key: 'master', stage: 'sound_delivery', name: '母版', ability: 'postproduction', work_total: 100, deliver_at: 1000, is_gate: true, deps: ['composite'], quality_weight_permille: 100 }
  ]
}
const init = unwrap('initialize_game', { seed: 20261126 })
const created = unwrap('instantiate_work', { state: init.state, blueprint: tinyBlueprint, work_id: 'work_audit', duration_weeks: 26 })
const assigned = unwrap('assign_staff', {
  state: created.state,
  staff_id: created.state.staff.find((person) => person.role === 'director').id,
  work_id: 'work_audit'
})
const vendorBase = unwrap('assign_staff', {
  state: assigned.state,
  staff_id: assigned.state.staff.find((person) => person.id === 'staff_anim').id,
  work_id: 'work_audit'
}).state
vendorBase.suppliers = [{
  id: 'supplier_audit', name: '审计协力商', specialties: ['animation'], capacity_per_week: 100,
  quality: 70, speed: 60, price_per_unit: 40, reliability: 100, unlocked_week: 0
}]
vendorBase.works[0].episodes[0].stages
  .flatMap((stage) => stage.items).find((item) => item.key === 'storyboard').work_done = 100
const outsourcingReceipt = unwrap('sign_outsourcing', {
  state: vendorBase, work_id: 'work_audit', item_id: 'work_audit.ep01.inbetween',
  supplier_id: 'supplier_audit', work_total: 60, mode: 'normal'
})
const vendorState = outsourcingReceipt.state
const vendorValidated = call('hash_state', { state: vendorState })
if (vendorValidated.error) fail(`Vendor 合法夹具未通过 INV-19/20：${vendorValidated.error.message}`)
const vendorAdvanced = unwrap('advance_week', { state: vendorState })
const contributorDismissal = unwrap('dismiss_staff', {
  state: vendorAdvanced.state, staff_id: 'staff_anim'
})
let contributorState = completeGates(contributorDismissal.state, 'work_audit')
for (const pending of [...contributorState.events.pending]) {
  if (!pending.viewed) {
    contributorState = unwrap('view_event', {
      state: contributorState, work_id: pending.work_id, event_id: pending.event_id
    }).state
  }
  const current = contributorState.events.pending.find((event) =>
    event.work_id === pending.work_id && event.event_id === pending.event_id)
  const option = [...current.options].sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))[0]
  contributorState = unwrap('resolve_event', {
    state: contributorState, work_id: pending.work_id, event_id: pending.event_id, option_id: option.id
  }).state
}
const contributorDelivery = unwrap('deliver_work', {
  state: contributorState, work_id: 'work_audit'
})
if (!contributorDelivery.state.archive.works[0].team.some((member) =>
  member.id === 'staff_anim' && member.name === '许动画')) {
  fail('Archive 团队快照未保留已解雇贡献者的身份')
}
if (vendorAdvanced.state.contracts[0].status !== 'delivered' || vendorAdvanced.state.contracts[0].work_done !== 60) {
  fail('Vendor 周交付未按 reliability=100 正常交付 60 点')
}
const vendorDelivery = vendorAdvanced.report.works[0].items.find((item) => item.item_id === 'work_audit.ep01.inbetween')
if (!vendorDelivery || vendorDelivery.points < 60) fail('Vendor 周交付未进入工作项与周回执')
let state = assigned.state
// 形状审计要跑满"触发 → 查看 → 处理（带支出）"闭环，不能被周固定成本在第 9 周上下把现金烧穿；
// 同时保持 INV-16 恒等式（balance = opening_funds + Σentries），所以期初与余额同额抬升。
state.finance.opening_funds += 50_000_000
state.finance.balance += 50_000_000
const funded = call('hash_state', { state })
if (funded.error) fail(`抬升现金后的状态未通过校验：${funded.error.code} ${funded.error.message}`)

let pendingState = null
let drawnReport = null
let weekReceipt = null
let viewReceipt = null
let resolveReceipt = null
for (let week = 0; week < 24; week++) {
  for (const pending of state.events.pending.filter((event) => !event.viewed)) {
    if (!pendingState) pendingState = structuredClone(state)
    viewReceipt = unwrap('view_event', { state, work_id: pending.work_id, event_id: pending.event_id })
    state = viewReceipt.state
    // 选一个真要花钱的选项，才能覆盖事件的 funds 效果与 events 账本类目。
    const paid = pending.options.slice().sort((a, b) => b.cost - a.cost)[0]
    if (paid && paid.cost > 0) {
      resolveReceipt = unwrap('resolve_event', {
        state,
        work_id: pending.work_id,
        event_id: pending.event_id,
        option_id: paid.id
      })
      state = resolveReceipt.state
    }
  }
  const result = unwrap('advance_week', { state })
  if (!weekReceipt) weekReceipt = result
  state = result.state
  if (result.report.events.drawn && !drawnReport) drawnReport = result.report
  if (state.finance.entries.some((entry) => entry.category === 'events')) break
}
if (!drawnReport) fail('24 周内未触发任何事件，无法审计事件回执形状（检查 seed 或内容目录）')
if (!pendingState) fail('未捕获到含 pending 事件的样例状态，事件字段形状无法审计')
if (!viewReceipt || !resolveReceipt) fail('未走通"查看 + 处理（付费选项）"闭环，事件回执与 events 账本类目无法审计')

// ---- 1. 命令导出集合 ----
const readText = (...segments) => readFileSync(join(root, ...segments), 'utf8')
const bindingSource = readText('packages', 'game-core', 'bindings', 'v4_bindings.cpp')
const bindingExports = [...bindingSource.matchAll(/emscripten::function\("([^"]+)"/g)].map((match) => match[1]).sort()
const registeredCommandSurface = [...new Set([...shape.commands.exported, ...shape.commands.aliases])].sort()
if (bindingExports.join(',') !== registeredCommandSurface.join(',')) {
  fail(`packages/game-core/bindings/v4_bindings.cpp 入口清单与 shape 不一致：${bindingExports.join(', ')}`)
}
const missingExports = shape.commands.exported.filter((name) => typeof core[name] !== 'function')
const documentedNotExported = shape.commands.documented_not_exported
  .filter((name) => !shape.commands.aliases.includes(name))
  .sort()
const leakedCommands = documentedNotExported.filter((name) => typeof core[name] === 'function')
if (missingExports.length) fail(`核心缺少已登记入口：${missingExports.join(', ')}`)
if (leakedCommands.length) fail(`M0 §5 未实现命令已出现入口，请同步数据字典 §4：${leakedCommands.join(', ')}`)
const expectedCommandCount = shape.commands.documented_total
if (expectedCommandCount !== 23) fail('M0 §5 当前冻结命令总数必须为 23')
if (shape.commands.documented_total !== shape.commands.documented.length) fail('M0 §5 命令总数与命令清单不一致')
if (new Set(shape.commands.documented).size !== shape.commands.documented.length) fail('M0 §5 命令清单存在重复项')
if (shape.commands.positions.view_event !== 22 || shape.commands.positions.lock_offer !== 23) {
  fail('M0 §5 命令编号必须保持 view_event=22、lock_offer=23')
}

const m0Source = readText('docs', 'M0_CONTRACT_FREEZE.md')
const dictionarySource = readText('docs', 'DATA_DICTIONARY_V4.md')
const architectureSource = readText('docs', 'DOMAIN_ARCHITECTURE.md')
const decisionSource = readText('docs', 'DECISION_LOG.md')
const m0RootShape = m0Source.match(/GameState \{([\s\S]*?)\n\}/)?.[1] || ''
if (!/recruitment:\s*Recruitment/.test(m0RootShape)) {
  fail('docs/M0_CONTRACT_FREEZE.md §2 根结构未登记 recruitment')
}
const documentedRows = [...m0Source.matchAll(/^\|\s*(\d+)\s*\|\s*`([^`]+)`/gm)]
  .map((match) => ({ number: Number(match[1]), command: match[2].replace(/\(.*$/, '') }))
const documentedNumbers = documentedRows.map((row) => row.number)
const expectedNumbers = Array.from({ length: shape.commands.documented_total }, (_, index) => index + 1)
if (documentedNumbers.join(',') !== expectedNumbers.join(',')) {
  fail(`docs/M0_CONTRACT_FREEZE.md §5 命令编号不连续：${documentedNumbers.join(',')}（期望 1..${shape.commands.documented_total}）`)
}
const documentedNames = documentedRows.map((row) => row.command).sort()
if (documentedNames.join(',') !== shape.commands.documented.slice().sort().join(',')) {
  fail('docs/M0_CONTRACT_FREEZE.md §5 命令清单与 docs/v4-contract-shape.json 不一致')
}
const dictionaryCommandRows = [...dictionarySource.matchAll(/^\|\s*(\d+)\s*\|\s*`([^`]+)`/gm)]
  .map((match) => ({ number: Number(match[1]), command: match[2].replace(/\(.*$/, '') }))
if (dictionaryCommandRows.length !== shape.commands.documented_total ||
    dictionaryCommandRows.map((row) => row.number).join(',') !== expectedNumbers.join(',') ||
    dictionaryCommandRows.map((row) => row.command).sort().join(',') !== shape.commands.documented.slice().sort().join(',')) {
  fail(`docs/DATA_DICTIONARY_V4.md §4 必须逐条列出 ${expectedCommandCount} 个命令`)
}
for (const item of shape.reserved_fields) {
  if (!shape.paths[item.path]?.includes(item.field)) fail(`reserved_fields ${item.path}.${item.field} 未登记到 paths`)
  if (!shape.contract_fields[item.path]?.includes(item.field)) {
    fail(`reserved_fields ${item.path}.${item.field} 未登记到 contract_fields`)
  }
}
for (const item of shape.historical_fields) {
  if (shape.paths[item.path]?.includes(item.field)) fail(`历史字段 ${item.path}.${item.field} 不得进入 V4 paths`)
  if (shape.reserved_fields.some((reserved) => reserved.path === item.path && reserved.field === item.field)) {
    fail(`历史字段 ${item.path}.${item.field} 不得归入 reserved_fields`)
  }
  if (!/project_fee/.test(readText('apps', 'web', 'src', 'types', 'gameV3.ts'))) {
    fail('历史 v3 project_fee 定义缺失，不能抹除历史字段来掩盖 V4 命名冲突')
  }
}
for (const term of ['signing_fee + weekly_salary', '不再使用 project_fee', 'pool', 'pity', 'last_scout_week']) {
  if (!dictionarySource.includes(term)) fail(`docs/DATA_DICTIONARY_V4.md 缺少已冻结口径：${term}`)
}
for (const term of ['locked_until', 'lock_used', 'deposit_paid']) {
  if (![m0Source, dictionarySource, architectureSource].every((source) => source.includes(term))) {
    fail(`Q3/Q4 字段未在 M0、数据字典与领域架构同步：${term}`)
  }
}
for (const term of ['100% 抵扣', '定金不退', '锁定一次', '每周至多一次']) {
  if (![m0Source, dictionarySource, architectureSource, decisionSource].every((source) => {
    if (term !== '每周至多一次') return source.includes(term)
    return /每周(?:至多|最多)(?:使用)?一次/.test(source)
  })) {
    fail(`Q3/Q4 产品语义未在四份权威文档同步：${term}`)
  }
}
if (shape.future_contract.market_slots.initial !== 4 || shape.future_contract.market_slots.maximum !== 4) {
  fail('企划市场槽位基线必须为固定 4 槽（DEC-MARKET-001）')
}
if (!m0Source.includes('market.slots ≤ 4') || !m0Source.includes('初始生成 4 个企划')) {
  fail('docs/M0_CONTRACT_FREEZE.md 未登记企划市场固定四槽与初始四企划')
}
if (!architectureSource.includes('slots: Offer[4]') || !architectureSource.includes('每周只补空槽') ||
    !architectureSource.includes('至少 2 个企划')) {
  fail('docs/DOMAIN_ARCHITECTURE.md 未同步企划市场固定四槽、补空槽与最低可承接数')
}
if (!shape.future_contract.lock_offer.once_per_proposal_lifetime ||
    shape.future_contract.lock_offer.deposit_refund_on_expiry !== false ||
    shape.future_contract.lock_offer.signing_deposit_credit_percent !== 100 ||
    !shape.future_contract.lock_offer.deposit_is_ledger_snapshot_only) {
  fail('Q4 基线不得放宽终身一次、到期不退、100% 抵扣或 Finance 唯一现金权威')
}
if (shape.future_contract.lock_offer.covered_weeks.join(',') !== 'W,W+1' ||
    shape.future_contract.lock_offer.expires_at_week_start !== 'W+2') {
  fail('Q4 锁定边界必须为 W/W+1 有效、W+2 开局失效')
}
if (shape.future_contract.scout.maximum_per_week !== 1) fail('Scout 基线必须为每周至多一次')
if (!shape.future_contract.prohibited_current_implementations.includes('arrange_financing') ||
    !shape.future_contract.prohibited_current_implementations.includes('crisis_settlement')) {
  fail('未来契约清单必须明确禁止当前 arrange_financing 与危机结算')
}
for (const term of ['后续更新预留', 'loans=[]', 'solvency.state="normal"']) {
  if (!dictionarySource.includes(term)) fail(`docs/DATA_DICTIONARY_V4.md 未将危机字段标为未来预留：${term}`)
}
for (const sourcePath of ['packages/game-core/src/v4/runtime.cpp', 'packages/game-core/src/v4/event.cpp', 'packages/game-core/src/v4/kernel.cpp']) {
  const source = readText(...sourcePath.split('/'))
  if (source.includes('arrange_financing')) fail(`${sourcePath} 不得包含当前禁止的 arrange_financing 实现`)
  for (const category of shape.ledger.future_only_categories) {
    if (source.includes(`"${category}"`)) fail(`${sourcePath} 已写入未来融资账本类目：${category}`)
  }
}
for (const prohibited of ['solvency.state=="crisis"', 'solvency.state!="crisis"']) {
  if (readText('packages', 'game-core', 'src', 'v4', 'runtime.cpp').includes(prohibited)) {
    fail(`packages/game-core/src/v4/runtime.cpp 仍含 crisis 负余额放行条件：${prohibited}`)
  }
}

// ---- 2. 状态/回执键树 ----
// events.per_work / cooldowns 的键是 work_id / event_id（业务数据，不是字段名），
// 归一化成 `*` 再登记，否则形状表会随每次运行的 id 变化而误报。
function collect(node, path, out) {
  if (Array.isArray(node)) {
    for (const element of node) collect(element, `${path}[]`, out)
    return
  }
  if (node && typeof node === 'object') {
    const keys = Object.keys(node)
    if (keys.length === 0) return
    if (shape.dynamic_key_maps.includes(path)) {
      for (const key of keys) collect(node[key], `${path}.*`, out)
      return
    }
    const previous = out.get(path) || new Set()
    for (const key of keys) previous.add(key)
    out.set(path, previous)
    for (const key of keys) collect(node[key], `${path}.${key}`, out)
    return
  }
}

function completeGates(state, workId) {
  const work = state.works.find((entry) => entry.id === workId)
  for (const episode of work.episodes) {
    for (const stage of episode.stages) {
      for (const item of stage.items) {
        if (!item.is_gate) continue
        item.work_done = item.work_total
        if (!item.contributors.includes(state.staff[0].id)) item.contributors.push(state.staff[0].id)
        for (const dim of Object.keys(item.quality)) item.quality[dim] = 80
      }
    }
  }
  return state
}

function fundedInitialize() {
  const result = unwrap('initialize_game', { seed: 20261127 }).state
  result.finance.opening_funds += 400_000_000
  result.finance.balance += 400_000_000
  return result
}

const observed = new Map()
let startReceipt
let extensionReceipt
let deliveryReceipt
let endReceipt
let finalizeDeliveryReceipt
let finalizeCompanyReceipt
let tvServiceReceipt
let customOfferReceipt
let adoptReceipt
let rejectReceipt

const commerce = fundedInitialize()
commerce.market.slots[0].ip_id = 'ip_audit'
startReceipt = unwrap('start_work', {
  state: commerce,
  offer_id: 'offer_01',
  mode: 'committee',
  percent: 50,
  committee_partner_ids: ['partner_tv', 'partner_stream']
})
collect(startReceipt.state, 'state', observed)
// 外包周日志（延误/返工/交付/失败）来自 vendor 段的真实周结算
collect(vendorAdvanced.report.outsourcing, 'report.outsourcing', observed)
extensionReceipt = unwrap('request_extension', { state: startReceipt.state, work_id: startReceipt.work_id })
collect(extensionReceipt.state, 'state', observed)
completeGates(extensionReceipt.state, startReceipt.work_id)
deliveryReceipt = unwrap('deliver_work', { state: extensionReceipt.state, work_id: startReceipt.work_id })
collect(deliveryReceipt.state, 'state', observed)
collect([deliveryReceipt.report], 'report.settlements', observed)
const archived = deliveryReceipt.state.archive.works[0]
if (Object.keys(archived).length !== shape.archive_contract.work_record_root_field_count) {
  fail(`Archive WorkRecord 根字段数应为 ${shape.archive_contract.work_record_root_field_count}，实际 ${Object.keys(archived).length}`)
}
if (archived.ip_id !== 'ip_audit' || deliveryReceipt.state.archive.series[0]?.ip_id !== 'ip_audit'
    || !archived.team.length) {
  fail('Archive 未采集非空 team 或 IP -> WorkRecord -> series 来源链')
}
if (archived.channel_breakdown.reduce((sum, line) => sum + line.revenue, 0) !== archived.commercial_revenue) {
  fail('Archive channel_breakdown 的 Σrevenue 不等于 commercial_revenue（DA §7.6）')
}
if (archived.channel_breakdown.reduce((sum, line) => sum + line.company_received, 0) !== archived.finance_summary.commercial_share) {
  fail('Archive channel_breakdown 的 Σcompany_received 不等于 finance_summary.commercial_share（DA §7.6）')
}

const abortBase = fundedInitialize()
abortBase.market.slots[0].ip_id = 'ip_abort'
const abortStart = unwrap('start_work', { state: abortBase, offer_id: 'offer_01', mode: 'contract' })
for (const episode of abortStart.state.works[0].episodes) {
  for (const stage of episode.stages) {
    for (const item of stage.items) item.work_done = Math.floor(item.work_total * 3 / 4)
  }
}
const abortReceipt = unwrap('abort_work', { state: abortStart.state, work_id: abortStart.work_id })
collect(abortReceipt.state, 'state', observed)
collect([abortReceipt.report], 'report.settlements', observed)
const abortedRecord = abortReceipt.state.archive.works[0]
if (abortedRecord.status !== 'ABORTED' || abortedRecord.end_reason !== 'aborted'
    || abortedRecord.aborted_week !== abortedRecord.end_week || abortedRecord.penalty_paid !== 0
    || abortedRecord.finance_summary.contract_refund <= 0 || abortReceipt.report.contract_refund <= 0) {
  fail('DEC-PROJECT-001 中止履历缺少 ABORTED 状态、退款或违约金字段')
}
if (abortReceipt.state.archive.series.length !== 0) {
  fail('DEC-PROJECT-001 aborted 作品不得写入 Archive.series')
}
if (!abortReceipt.state.finance.entries.some((entry) => entry.category === 'contract_refund' && entry.amount > 0)) {
  fail('DEC-PROJECT-001 中止退款未进入 Finance 流水')
}
if (abortedRecord.finance_summary.profit !== abortedRecord.finance_summary.contract_received
    - abortedRecord.finance_summary.contract_refund + abortedRecord.finance_summary.commercial_share
    + abortedRecord.finance_summary.success_reward - abortedRecord.finance_summary.investment_paid
    - abortedRecord.finance_summary.total_costs) {
  fail('DEC-PROJECT-001 中止 WorkRecord 利润公式未扣除 contract_refund')
}
const abortedArchiveProbes = [
  ['aborted 状态与结束原因不一致', (archive) => { archive.works[0].status = 'DELIVERED' }],
  ['aborted penalty_paid 与 finance_summary 不一致', (archive) => { archive.works[0].penalty_paid = 1 }],
  ['aborted 退款利润对账', (archive) => { archive.works[0].finance_summary.profit -= 1 }]
]
for (const [label, mutate] of abortedArchiveProbes) {
  const probe = structuredClone(abortReceipt.state)
  mutate(probe.archive)
  const result = call('advance_week', { state: probe })
  if (result.error?.code !== 'INVALID_STATE' || !result.error.message.includes('INV-22') || 'state' in result) {
    fail(`${label} 应以 INV-22/INVALID_STATE 原子拒绝，实际 ${result.error ? `${result.error.code}: ${result.error.message}` : '成功返回'}`)
  }
}

endReceipt = unwrap('end_company', { state: deliveryReceipt.state })
collect(endReceipt.state, 'state', observed)
finalizeCompanyReceipt = unwrap('finalize_company', { state: endReceipt.state })
collect(finalizeCompanyReceipt.state, 'state', observed)
collect(finalizeCompanyReceipt.result, 'result', observed)

const tvCommerce = fundedInitialize()
const tvStart = unwrap('start_work', {
  state: tvCommerce,
  offer_id: 'offer_01',
  mode: 'committee',
  percent: 50,
  committee_partner_ids: ['partner_stream']
})
collect(tvStart.state, 'state', observed)
tvServiceReceipt = unwrap('buy_tv_service', { state: tvStart.state, work_id: tvStart.work_id })
collect(tvServiceReceipt.state, 'state', observed)
const tvClosed = unwrap('end_company', { state: completeGates(tvServiceReceipt.state, tvStart.work_id) })
collect(tvClosed.state, 'state', observed)
finalizeDeliveryReceipt = unwrap('finalize_delivery', { state: tvClosed.state, work_id: tvStart.work_id })
collect(finalizeDeliveryReceipt.state, 'state', observed)
collect([finalizeDeliveryReceipt.report], 'report.settlements', observed)

const customBase = fundedInitialize()
customBase.company.reputation = 150
customOfferReceipt = unwrap('create_custom_offer', {
  state: customBase, name: '审计原创', source: 'original', scale: 'tv', style: 'normal'
})
collect(customOfferReceipt.state, 'state', observed)
const proposalBase = fundedInitialize()
proposalBase.market.proposal = { ...proposalBase.market.slots[0], id: 'proposal_audit' }
adoptReceipt = unwrap('adopt_proposal', { state: proposalBase })
collect(adoptReceipt.state, 'state', observed)
rejectReceipt = unwrap('reject_proposal', { state: proposalBase })
collect(rejectReceipt.state, 'state', observed)

// 招聘闭环（M0 命令 5/6/7/8）：独立状态先释放一个开局编制，再走 scout → hire_core → dismiss_staff；
// 临时员工另用 producing 项目验证合同解包与项目成本归因，不污染主审计状态。
const recruitBase = unwrap('dismiss_staff', { state: fundedInitialize(), staff_id: 'staff_post' }).state
const scoutReceipt = unwrap('scout', { state: recruitBase })
collect(scoutReceipt.state, 'state', observed)
const hireReceipt = unwrap('hire_core', { state: scoutReceipt.state, staff_id: scoutReceipt.added_ids[0] })
collect(hireReceipt.state, 'state', observed)
const dismissReceipt = unwrap('dismiss_staff', { state: hireReceipt.state, staff_id: hireReceipt.staff_id })
collect(dismissReceipt.state, 'state', observed)
const temporaryStart = unwrap('start_work', { state: fundedInitialize(), offer_id: 'offer_01', mode: 'contract' })
// 直接用池里真实存在的临时用工卡：薪资/签约费由公式生成，validate 会校验，
// 手工改造一个池候选（旧做法）现在会因为报价不合公式被判红。
const temporaryCandidate = temporaryStart.state.recruitment.pool
  .find((candidate) => candidate.origin === 'temporary').staff
const temporaryReceipt = unwrap('hire_temporary', {
  state: temporaryStart.state, work_id: temporaryStart.work_id, candidate_id: temporaryCandidate.id
})
collect(temporaryReceipt.state, 'state', observed)
const temporaryMember = temporaryReceipt.state.staff.find((member) => member.id === temporaryCandidate.id)
const temporarySigning = temporaryReceipt.state.finance.entries.find((entry) => entry.id === `w0.temporary.${temporaryCandidate.id}.signing`)
if (temporaryMember?.assignment_work_id !== temporaryStart.work_id ||
    temporaryMember?.temporary_contract?.work_id !== temporaryStart.work_id ||
    temporaryMember?.temporary_contract?.start_week !== 0 ||
    temporaryMember?.temporary_contract?.end_week !== temporaryStart.state.works[0].deadline_week ||
    temporarySigning?.category !== 'temporary' || temporarySigning?.work_id !== temporaryStart.work_id ||
    temporarySigning?.amount !== -temporaryCandidate.signing_fee) {
  fail('hire_temporary 未按 D-07 建立三字段合同或未将签约费归入项目 temporary 账目')
}

// 市场闭环（M0 命令 23/2）：独立状态走 lock_offer → start_work（锁定期内定金抵扣），
// 再对未锁定状态 advance_week 一次，观察坐标生成企划与周补充形状。
const marketBase = fundedInitialize()
const lockReceipt = unwrap('lock_offer', { state: marketBase, offer_id: marketBase.market.slots[0].id })
collect(lockReceipt.state, 'state', observed)
const lockedStartReceipt = unwrap('start_work', {
  state: lockReceipt.state,
  offer_id: lockReceipt.offer_id,
  mode: 'committee',
  percent: 50,
  committee_partner_ids: ['partner_tv', 'partner_stream']
})
collect(lockedStartReceipt.state, 'state', observed)
const marketWeekReceipt = unwrap('advance_week', { state: marketBase })
collect(marketWeekReceipt.state, 'state', observed)

collect(state, 'state', observed)
collect(vendorState, 'state', observed)
collect(vendorAdvanced.state, 'state', observed)
collect(vendorAdvanced.report, 'report', observed)
collect(contributorDismissal.state, 'state', observed)
collect(temporaryReceipt.state, 'state', observed)
collect(temporaryReceipt.report, 'report', observed)
collect(pendingState, 'state', observed)
collect(drawnReport, 'report', observed)
const dynamic = new Set(shape.dynamic_key_maps)
const golden = shape.paths
for (const [path, keys] of Object.entries(shape.optional_paths || {})) {
  const actual = observed.get(path)
  if (!actual) continue
  const expected = new Set(keys)
  const added = [...actual].filter((key) => !expected.has(key))
  const removed = keys.filter((key) => !actual.has(key))
  if (added.length) fail(`未登记字段 ${path}: ${added.sort().join(', ')}`)
  if (removed.length) fail(`字段消失 ${path}: ${removed.join(', ')}`)
}
for (const [path, keys] of Object.entries(golden)) {
  const actual = observed.get(path)
  if (!actual) {
    fail(`形状缺失：${path}（期望键 ${keys.join(', ')}）`)
    continue
  }
  const expected = new Set(keys)
  const added = [...actual].filter((key) => !expected.has(key))
  const removed = keys.filter((key) => !actual.has(key))
  if (added.length) fail(`未登记字段 ${path}: ${added.sort().join(', ')}`)
  if (removed.length) fail(`字段消失 ${path}: ${removed.join(', ')}`)
}
for (const [path, actual] of observed) {
  if (golden[path] || shape.optional_paths?.[path] || dynamic.has(path)) continue
  fail(`未登记的对象路径 ${path}: ${[...actual].sort().join(', ')}`)
}

// ---- 3. 解析必填（decode_state 的 require 清单） ----
const probeBases = [
  contributorDismissal.state, deliveryReceipt.state, temporaryReceipt.state,
  vendorState, startReceipt.state, pendingState, state
].filter(Boolean)
function parentAtPath(root, path) {
  const segments = path.split('.').slice(1)
  let node = root
  for (let index = 0; index < segments.length - 1; index++) {
    const key = segments[index].replace(/\[\]$/, '')
    node = node?.[key]
    if (node == null) return null
    if (segments[index].endsWith('[]')) node = Array.isArray(node) ? node[0] : null
  }
  return node
}
for (const path of shape.required_on_parse) {
  if (path === 'state') {
    const result = call('hash_state', {})
    if (!result.error || result.error.code !== 'INVALID_INPUT') {
      fail(`缺少必填字段 state 未被拒绝（实际：${result.error ? result.error.code : '成功返回'}）`)
    }
    continue
  }
  const source = probeBases.find((candidate) => parentAtPath(candidate, path) != null)
  if (!source) {
    fail(`必填探针缺少可用样例：${path}`)
    continue
  }
  const base = structuredClone(source)
  const parent = parentAtPath(base, path)
  const key = path.split('.').at(-1).replace(/\[\]$/, '')
  if (!Object.hasOwn(parent, key)) {
    fail(`必填探针样例本身缺少字段：${path}`)
    continue
  }
  delete parent[key]
  const result = call('hash_state', { state: base })
  if (!result.error || result.error.code !== 'INVALID_INPUT') {
    fail(`缺少必填字段 ${path} 未被拒绝（实际：${result.error ? result.error.code : '成功返回'}）`)
  }
}

// ---- 4. 命令回执键 ----
const receipts = {
  initialize_game: Object.keys(init).filter((key) => key !== 'error'),
  instantiate_work: Object.keys(created).filter((key) => key !== 'error'),
  set_work_plan: Object.keys(unwrap('set_work_plan', {
    state,
    work_id: 'work_audit',
    plan: { intensity: 'standard', focus: 'quality', outsourcing: 'gap_fill', overtime: false, target: null }
  })).filter((key) => key !== 'error'),
  assign_staff: Object.keys(assigned).filter((key) => key !== 'error'),
  advance_week: Object.keys(weekReceipt).filter((key) => key !== 'error'),
  start_work: Object.keys(startReceipt).filter((key) => key !== 'error'),
  request_extension: Object.keys(extensionReceipt).filter((key) => key !== 'error'),
  deliver_work: Object.keys(deliveryReceipt).filter((key) => key !== 'error'),
  end_company: Object.keys(endReceipt).filter((key) => key !== 'error'),
  finalize_delivery: Object.keys(finalizeDeliveryReceipt).filter((key) => key !== 'error'),
  finalize_company: Object.keys(finalizeCompanyReceipt).filter((key) => key !== 'error'),
  buy_tv_service: Object.keys(tvServiceReceipt).filter((key) => key !== 'error'),
  create_custom_offer: Object.keys(customOfferReceipt).filter((key) => key !== 'error'),
  adopt_proposal: Object.keys(adoptReceipt).filter((key) => key !== 'error'),
  reject_proposal: Object.keys(rejectReceipt).filter((key) => key !== 'error'),
  scout: Object.keys(scoutReceipt).filter((key) => key !== 'error'),
  hire_core: Object.keys(hireReceipt).filter((key) => key !== 'error'),
  hire_temporary: Object.keys(temporaryReceipt).filter((key) => key !== 'error'),
  sign_outsourcing: Object.keys(outsourcingReceipt).filter((key) => key !== 'error'),
  dismiss_staff: Object.keys(dismissReceipt).filter((key) => key !== 'error'),
  lock_offer: Object.keys(lockReceipt).filter((key) => key !== 'error'),
  hash_state: Object.keys(unwrap('hash_state', { state })).filter((key) => key !== 'error')
}
if (viewReceipt) receipts.view_event = Object.keys(viewReceipt).filter((key) => key !== 'error')
if (resolveReceipt) receipts.resolve_event = Object.keys(resolveReceipt).filter((key) => key !== 'error')
for (const [command, expected] of Object.entries(shape.receipt_keys)) {
  const actual = receipts[command]
  if (!actual) {
    fail(`回执未采集：${command}`)
    continue
  }
  if (actual.slice().sort().join(',') !== expected.slice().sort().join(',')) {
    fail(`回执键不一致 ${command}: 期望 [${expected.join(', ')}] 实际 [${actual.sort().join(', ')}]`)
  }
}

// ---- 5. initialize_game 的空聚合（§3.10 缺口登记） ----
for (const [path, expected] of Object.entries(shape.empty_at_initialize)) {
  const actual = path.split('.').slice(1).reduce((node, key) => (node == null ? node : node[key]), init.state)
  const same = isDeepStrictEqual(actual, expected)
  if (!same) {
    fail(`初始化聚合已变化 ${path}: 期望 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)?.slice(0, 120)}`)
  }
}

// ---- 6. 字段分类：reserved / historical / 已冻结但未实现 ----
const fieldPresent = (path, field) => {
  const node = observed.get(path)
  return Boolean(node && node.has(field))
}
for (const item of shape.contract_required_missing) {
  if (fieldPresent(item.path, item.field)) {
    fail(`契约字段 ${item.path}.${item.field} 已实现（${item.ref}）：请把它移入 contract_required_missing 并更新数据字典`)
  }
}
for (const item of shape.reserved_fields) {
  if (!fieldPresent(item.path, item.field)) {
    fail(`reserved 字段 ${item.path}.${item.field} 缺失（${item.ref}）：不得删除未来扩展结构`)
  }
}
for (const item of shape.historical_fields) {
  if (fieldPresent(item.path, item.field)) {
    fail(`V4 出现历史字段 ${item.path}.${item.field}（${item.ref}）：v4 应使用 signing_fee`)
  }
}
for (const [path, expected] of Object.entries(shape.contract_fields || {})) {
  const actual = shape.paths[path]
  if (!actual || actual.slice().sort().join(',') !== expected.slice().sort().join(',')) {
    fail(`当前契约字段清单与 paths 不一致：${path}`)
  }
  for (const field of expected) {
    const inReservedOrHistorical = [...shape.reserved_fields, ...shape.historical_fields]
      .some((item) => item.path === path && item.field === field)
    if (!inReservedOrHistorical) continue
    const hasDefault = Object.hasOwn(shape.reserved_defaults, `${path}.${field}`)
    const hasCurrentBehavior = typeof shape.current_behavior[field] === 'boolean'
    if (!hasDefault && !hasCurrentBehavior) fail(`特殊分类字段 ${path}.${field} 缺少当前行为约束`)
  }
}
for (const [path, fields] of Object.entries(shape.future_contract.fields)) {
  if (shape.paths[path]?.some((field) => fields.includes(field))) {
    fail(`未来契约字段已提前进入当前 V4：${path}（${shape.future_contract.status}）`)
  }
  if (fields.length === 0) fail(`未来契约字段清单为空：${path}`)
}

// ---- 7. reserved 默认值、当前行为边界与历史命名 ----
const assertSameJson = (actual, expected, label) => {
  const canonical = (value) => Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
      : value
  if (JSON.stringify(canonical(actual)) !== JSON.stringify(canonical(expected))) {
    fail(`${label}：期望 ${JSON.stringify(expected)} 实际 ${JSON.stringify(actual)}`)
  }
}
const getPath = (node, path) => path.split('.').slice(1).reduce((value, key) => value?.[key], node)
const runtimeSource = readText('packages', 'game-core', 'src', 'v4', 'runtime.cpp')
if (!runtimeSource.includes('events_report = event::draw(state, week + 1);')) {
  fail('阶段 8 抽取事件必须以次周为时间基，避免 expires_week 提前一周')
}
for (const [path, expected] of Object.entries(shape.reserved_defaults)) {
  assertSameJson(getPath(init.state, path), expected, `初始化 reserved 默认值 ${path}`)
  assertSameJson(getPath(state, path), expected, `运行后 reserved 默认值 ${path}`)
}
const assertSolvencyDefaults = (label, solvency) => {
  assertSameJson(solvency?.state, 'normal', `${label} solvency.state`)
  assertSameJson(solvency?.since_week, null, `${label} solvency.since_week`)
  assertSameJson(solvency?.deadline_week, null, `${label} solvency.deadline_week`)
  assertSameJson(solvency?.gap, 0, `${label} solvency.gap`)
}
assertSolvencyDefaults('initialize_game', init.state.finance.solvency)
assertSolvencyDefaults('运行后', state.finance.solvency)
for (const staff of [...init.state.staff, ...state.staff]) {
  assertSameJson(staff.signing_fee, 0, `Staff.signing_fee 默认值 ${staff.id}`)
  if ('project_fee' in staff) fail(`Staff ${staff.id} 仍输出历史字段 project_fee`)
}
const expectInvalidState = (label, mutate, invariant) => {
  const probe = structuredClone(init.state)
  mutate(probe)
  const result = call('advance_week', { state: probe })
  if (result.error?.code !== 'INVALID_STATE') {
    fail(`${label} 应返回 INVALID_STATE，实际 ${result.error?.code || '成功返回'}`)
  }
  if (invariant && !result.error?.message?.includes(invariant)) {
    fail(`${label} 未定位到 ${invariant}：${result.error?.message || '无错误消息'}`)
  }
}
expectInvalidState('reserved finance.loans 非空', (probe) => { probe.finance.loans = [{ id: 'loan.future' }] }, 'INV-18')
expectInvalidState('reserved finance.loans 类型错误', (probe) => { probe.finance.loans = {} }, 'INV-18')
expectInvalidState('reserved solvency.state=crisis', (probe) => { probe.finance.solvency.state = 'crisis' }, 'INV-18')
expectInvalidState('reserved solvency.since_week 非空', (probe) => { probe.finance.solvency.since_week = 1 }, 'INV-18')
expectInvalidState('reserved solvency.deadline_week 非空', (probe) => { probe.finance.solvency.deadline_week = 2 }, 'INV-18')
expectInvalidState('reserved solvency.gap 非零', (probe) => { probe.finance.solvency.gap = 1 }, 'INV-18')
expectInvalidState('核心员工携带临时合同', (probe) => {
  probe.staff[0].temporary_contract = { work_id: 'work_missing', start_week: 0, end_week: 1 }
}, 'INV-10')
const archiveProbes = [
  ['WorkRecord 根字段缺失', (archive) => { delete archive.works[0].team }],
  ['WorkRecord 未知字段', (archive) => { archive.works[0].previous_work_id = null }],
  ['频道收入对账', (archive) => { archive.works[0].commercial_revenue += 1 }],
  ['项目利润公式', (archive) => { archive.works[0].finance_summary.profit -= 1 }],
  ['系列悬空引用', (archive) => { archive.series[0].works.push('missing') }],
  ['系列 IP 不匹配', (archive) => { archive.series[0].ip_id = 'ip_other' }],
  ['系列最后周', (archive) => { archive.series[0].last_week += 1 }]
]
for (const [label, mutate] of archiveProbes) {
  const probe = structuredClone(deliveryReceipt.state)
  mutate(probe.archive)
  const result = call('advance_week', { state: probe })
  if (result.error?.code !== 'INVALID_STATE' || !result.error.message.includes('INV-22') || 'state' in result) {
    fail(`${label} 应以 INV-22/INVALID_STATE 原子拒绝，实际 ${result.error ? `${result.error.code}: ${result.error.message}` : '成功返回'}`)
  }
}
if (!shape.archive_contract.cost_categories_are_dynamic_subset
    || shape.archive_contract.profit_formula !== 'contract_received - contract_refund + commercial_share + success_reward - investment_paid - total_costs'
    || !shape.archive_contract.series_source.includes('OfferSnapshot.ip_id')
    || !shape.archive_contract.series_write.includes('aborted 保留 WorkRecord 但不写 series')) {
  fail('Archive 动态成本子集、利润公式或系列来源链未冻结')
}
const abortContract = shape.project_abort_contract
if (!abortContract?.implemented || abortContract.contract_penalty_threshold_permille !== 500
    || abortContract.contract_penalty_permille !== 150 || abortContract.committee_penalty !== 0
    || abortContract.committee_refund !== 0 || abortContract.reputation_base !== -35000
    || abortContract.work_record_status !== 'ABORTED' || abortContract.series_write !== false
    || abortContract.negative_balance_reuses_bankruptcy !== true
    || JSON.stringify(abortContract.scale_permille) !== JSON.stringify({ short: 350, ova: 650, tv: 1000, movie: 1600 })) {
  fail('DEC-PROJECT-001 中止阈值、退款、声望、履历或破产路径未冻结')
}
for (const path of ['state.suppliers[]', 'state.contracts[]']) {
  if (!shape.paths[path] || JSON.stringify(shape.paths[path]) !== JSON.stringify(shape.contract_fields[path])) {
    fail(`${path} 未同步登记到 paths 与 contract_fields`)
  }
}
if (!shape.vendor_contract.status_validation_implemented || !shape.vendor_contract.sign_outsourcing_implemented ||
    !shape.vendor_contract.weekly_delivery_implemented || !shape.vendor_contract.fee_settlement_implemented ||
    !shape.vendor_contract.reliability_failure_implemented) {
  fail('Vendor 必须登记已实现的状态校验、签约、周交付、费用结算与可靠性失败')
}
if (vendorValidated.error || vendorAdvanced.state.contracts[0].work_done !== 60) {
  fail('Vendor 形状声明与实际周交付不一致')
}
const vendorProbes = [
  ['同一工作项外包预留超限', (probe) => {
    probe.contracts.push({
      ...probe.contracts[0], id: 'contract_overflow', episode_id: 'ep01', item_id: 'work_audit.ep01.inbetween',
      work_total: 41, work_done: 0, weekly_cap: 41
    })
  }, 'INV-20'],
  ['合同工作项错引', (probe) => { probe.contracts[0].item_id = 'work_audit.missing' }, 'INV-20'],
  ['合同单集项 episode 错引', (probe) => { probe.contracts[0].episode_id = null }, 'INV-20'],
  ['同项累计交付超限', (probe) => {
    probe.contracts[0].work_done = 60
    probe.contracts.push({ ...probe.contracts[0], id: 'contract_extra', weekly_cap: 40, work_done: 41 })
  }, 'INV-20']
]
for (const [label, mutate, invariant] of vendorProbes) {
  const probe = structuredClone(vendorState)
  mutate(probe)
  const result = call('advance_week', { state: probe })
  if (result.error?.code !== 'INVALID_STATE' || !result.error.message.includes(invariant) || 'state' in result) {
    fail(`${label} 应以 ${invariant}/INVALID_STATE 原子拒绝，实际 ${result.error ? `${result.error.code}: ${result.error.message}` : '成功返回'}`)
  }
}
const vendorReordered = structuredClone(vendorState)
vendorReordered.suppliers.reverse()
vendorReordered.contracts.reverse()
if (call('hash_state', { state: vendorState }).hash !== call('hash_state', { state: vendorReordered }).hash) {
  fail('suppliers/contracts 数组顺序影响了规范化哈希')
}
if (!shape.partnership_contract.status_validation_implemented ||
    shape.partnership_contract.partner_exact_fields !== 8 ||
    shape.partnership_contract.committee_exact_fields !== 6 ||
    shape.partnership_contract.history_exact_fields !== 4 ||
    !shape.partnership_contract.inv13_asserted ||
    !shape.partnership_contract.active_committee_allows_delivering ||
    !shape.partnership_contract.closed_committee_requires_archive ||
    !shape.partnership_contract.history_requires_archived_work ||
    !shape.partnership_contract.hash_normalizes_partner_and_committee_order) {
  fail('Partner/Committee 强契约、INV-13 或生命周期边界未完整冻结')
}
for (const path of ['state.partners[]', 'state.partners[].history[]', 'state.committees[]', 'state.committees[].members[]']) {
  if (!shape.paths[path] || JSON.stringify(shape.paths[path]) !== JSON.stringify(shape.contract_fields[path])) {
    fail(`${path} 未同步登记到 paths 与 contract_fields`)
  }
}
const partnershipProbes = [
  ['Partner 未知字段', startReceipt.state, (probe) => { probe.partners[0].unknown = true }, 'INV-01'],
  ['Partner history 未知字段', startReceipt.state, (probe) => {
    probe.partners[0].history = [{ week: 0, work_id: 'work_missing', delta: 2, reason: '审计', unknown: true }]
  }, 'INV-13'],
  ['Committee 未知字段', startReceipt.state, (probe) => { probe.committees[0].unknown = true }, 'INV-01'],
  ['委员会渠道不属于伙伴', startReceipt.state, (probe) => { probe.committees[0].members[1].channel = 'overseas' }, 'INV-13'],
  ['BD 不得挂成员', startReceipt.state, (probe) => { probe.committees[0].members[1].channel = 'bd_dvd' }, 'INV-13'],
  ['活跃委员会项目错引', startReceipt.state, (probe) => { probe.works[0].committee_id = 'committee_missing' }, 'INV-13'],
  ['关闭委员会缺少 Archive', deliveryReceipt.state, (probe) => {
    probe.archive.works = []
    probe.archive.series = []
    for (const partner of probe.partners) partner.history = []
  }, 'INV-13'],
  ['Partner history 引用未归档作品', deliveryReceipt.state, (probe) => {
    probe.partners[0].history = [{ week: 0, work_id: 'work_missing', delta: 2, reason: '审计' }]
  }, 'INV-13']
]
for (const [label, base, mutate, invariant] of partnershipProbes) {
  const probe = structuredClone(base)
  mutate(probe)
  const result = call('advance_week', { state: probe })
  if (result.error?.code !== 'INVALID_STATE' || !result.error.message.includes(invariant) || 'state' in result) {
    fail(`${label} 应以 ${invariant}/INVALID_STATE 原子拒绝，实际 ${result.error ? `${result.error.code}: ${result.error.message}` : '成功返回'}`)
  }
}
const partnershipReordered = structuredClone(startReceipt.state)
partnershipReordered.partners.reverse()
for (const committee of partnershipReordered.committees) committee.members.reverse()
if (call('hash_state', { state: startReceipt.state }).hash !== call('hash_state', { state: partnershipReordered }).hash) {
  fail('partners/committees/members 数组顺序影响了规范化哈希')
}
expectInvalidState('正常状态负余额', (probe) => {
  probe.finance.opening_funds = 0
  probe.finance.balance = -1
  probe.finance.entries = [{ id: 'negative.fixture', week: 0, work_id: null, category: 'salary', amount: -1, counterparty: null, memo: 'negative fixture' }]
}, 'INV-25')
expectInvalidState('crisis 负余额', (probe) => {
  probe.finance.opening_funds = 0
  probe.finance.balance = -1
  probe.finance.entries = [{ id: 'negative.crisis.fixture', week: 0, work_id: null, category: 'salary', amount: -1, counterparty: null, memo: 'negative crisis fixture' }]
  probe.finance.solvency.state = 'crisis'
}, 'INV-18')
for (const category of shape.ledger.future_only_categories) {
  if (shape.ledger.categories_frozen.includes(category)) fail(`未来账本类目 ${category} 不得混入当前冻结类目`)
  if (state.finance.entries.some((entry) => entry.category === category)) fail(`当前运行产生了未来融资账本类目：${category}`)
  if (runtimeSource.includes(`"${category}"`)) fail(`packages/game-core/src/v4/runtime.cpp 已写入未来融资账本类目：${category}`)
}
if (typeof core.arrange_financing === 'function') fail('当前核心不得导出未来 arrange_financing 命令')
if (state.finance.balance < 0) fail(`INV-25 当前运行余额为负：${state.finance.balance}`)
if (!shape.current_behavior.normal_balance_nonnegative || !shape.current_behavior.crisis_cannot_bypass_inv25 ||
    shape.current_behavior.nonempty_loans_allowed || shape.current_behavior.crisis_state_allowed ||
    shape.current_behavior.nondefault_solvency_fields_allowed ||
    shape.current_behavior.future_ledger_categories_allowed || shape.current_behavior.arrange_financing_export_allowed ||
    !shape.current_behavior.abort_work_implemented || !shape.current_behavior.bankrupt_negative_balance_allowed) {
  fail('docs/v4-contract-shape.json current_behavior 放宽了当前现金、危机或中止边界')
}

// ---- 8. 账本约定 ----
const categories = new Set([...state.finance.entries, ...temporaryReceipt.state.finance.entries].map((entry) => entry.category))
for (const category of shape.ledger.categories_produced) {
  if (!categories.has(category)) fail(`账本类目未出现：${category}（本次运行产出 ${[...categories].sort().join(', ')}）`)
}
for (const category of categories) {
  if (!shape.ledger.categories_frozen.includes(category)) fail(`未冻结的账本类目：${category}`)
}
const badIds = state.finance.entries.filter(
  (entry) => !/^w\d+\.(salary\.|temporary\.|operations(?:\.|$)|production\.|event\.|refund\.)/.test(entry.id)
)
if (badIds.length) fail(`账本 id 不符合约定前缀：${badIds.slice(0, 3).map((entry) => entry.id).join(', ')}`)
const ids = state.finance.entries.map((entry) => entry.id)
if (new Set(ids).size !== ids.length) fail('账本 id 重复（INV-02）')

// ---- 9. 不变式与错误码（源码侧） ----
const v4Sources = ['runtime.cpp', 'event.cpp', 'kernel.cpp', 'model.cpp']
  .map((name) => readFileSync(join(root, 'packages', 'game-core', 'src', 'v4', name), 'utf8'))
  .join(String.fromCharCode(10))
const asserted = [...new Set(runtimeSource.match(/INV-\d{2}/g) || [])].sort()
if (asserted.join(',') !== shape.invariants.asserted_in_validate.slice().sort().join(',')) {
  const added = asserted.filter((tag) => !shape.invariants.asserted_in_validate.includes(tag))
  const gone = shape.invariants.asserted_in_validate.filter((tag) => !asserted.includes(tag))
  if (added.length) fail(`新增不变式断言未登记：${added.join(', ')}`)
  if (gone.length) fail(`不变式断言消失：${gone.join(', ')}`)
}
if (shape.invariants.declared_total !== 30) fail('数据字典声明的不变式总数应为 30（M0 §4，INV-01..INV-30）')
const codesInSource = [...new Set([
  ...[...v4Sources.matchAll(/error_body\(\s*"([A-Z][A-Z_]{3,})"/g)].map((match) => match[1]),
  ...[...v4Sources.matchAll(/(?:\.code|code)\s*=\s*"([A-Z][A-Z_]{3,})"/g)].map((match) => match[1])
])]
const unknownCodes = codesInSource.filter((code) => !shape.error_codes.documented.includes(code))
if (unknownCodes.length) fail(`核心产生了 M0 §6 未登记的错误码：${unknownCodes.sort().join(', ')}`)
const produced = shape.error_codes.produced_by_v4_source.filter((code) => codesInSource.includes(code))
const missingProduced = shape.error_codes.produced_by_v4_source.filter((code) => !codesInSource.includes(code))
if (missingProduced.length) fail(`登记的错误码已不再产生：${missingProduced.join(', ')}`)

// ---- 10. 资金预检失败信封（§4.3）与失败后状态不变 ----
const heavyBlueprint = JSON.parse(readFileSync(join(root, 'docs', 'blueprints', 'tv_standard.blueprint.json'), 'utf8'))
let heavy = unwrap('instantiate_work', { state: structuredClone(init.state), blueprint: heavyBlueprint, work_id: 'work_heavy', duration_weeks: 26 }).state
heavy = unwrap('assign_staff', {
  state: heavy,
  staff_id: heavy.staff.find((person) => person.role === 'director').id,
  work_id: 'work_heavy'
}).state
let precheckOutcome = null
let precheckFailure = null
for (let week = 0; week < 40 && !precheckOutcome && !precheckFailure; week++) {
  for (const pending of heavy.events.pending.filter((event) => !event.viewed)) {
    heavy = unwrap('view_event', { state: heavy, work_id: pending.work_id, event_id: pending.event_id }).state
    const safeOptions = pending.options
      .filter((item) => !item.effects.some((effect) => effect.target === 'funds' && effect.value < 0))
      .sort((a, b) => a.cost - b.cost)
    const option = safeOptions.find((item) => item.kind === 'abandon') || safeOptions[0]
    if (option) {
      const resolved = call('resolve_event', {
        state: heavy,
        work_id: pending.work_id,
        event_id: pending.event_id,
        option_id: option.id
      })
      if (resolved.error) {
        precheckFailure = resolved
        break
      }
      heavy = resolved.state
    }
  }
  if (precheckFailure) break
  const before = unwrap('hash_state', { state: heavy }).hash
  const beforeWeek = heavy.company.week
  const beforeBalance = heavy.finance.balance
  const beforeLedgerCount = heavy.finance.entries.length
  const result = call('advance_week', { state: heavy })
  if (result.error) {
    precheckFailure = result
    const after = unwrap('hash_state', { state: heavy }).hash
    if (after !== before) fail('预检失败前后状态哈希不一致（不应发生）')
    if ('state' in result) fail('失败信封不得携带 state（数据字典 §4.2）')
  } else if (result.report?.mode === 'bankrupt') {
    precheckOutcome = result
    if (!result.report.bankrupt || !result.report.skipped) fail('破产回执缺少 bankrupt/skipped 标记')
    if (typeof result.report.gap !== 'number' || result.report.gap < 0) {
      fail('破产回执缺少非负整数 gap（M0 §14.7）')
    }
    if (result.report.funds?.delta !== 0 || result.state.finance.balance !== beforeBalance) {
      fail('预检不足破产仍发生现金扣款')
    }
    if (result.state.finance.entries.length !== beforeLedgerCount) fail('预检不足破产仍写入 Finance 流水')
    if (result.state.company.status !== 'closing' || result.state.company.end_reason !== 'bankrupt') {
      fail('预检不足未进入 bankrupt 终局')
    }
    if (result.state.company.week !== beforeWeek) fail('预检不足破产仍推进周数')
  } else {
    heavy = result.state
  }
}
if (!precheckOutcome && !precheckFailure) {
  fail('未触发资金预检路径，无法验证破产回执与 gap（M0 §14.7）')
} else if (precheckFailure) {
  fail(`资金预检路径返回错误 ${precheckFailure.error.code}：${precheckFailure.error.message}`)
}

// ---- 结果 ----
if (failures.length) {
  console.error(`v4 契约形状审计失败（${failures.length} 项）：`)
  for (const message of failures) console.error(`  - ${message}`)
  console.error('\n基线：docs/M0_CONTRACT_FREEZE.md、docs/DATA_DICTIONARY_V4.md、docs/v4-contract-shape.json。')
  console.error('处置：修正代码或同批同步权威契约、数据字典、期望表与测试；不得删除 reserved_fields 或放宽当前危机边界。')
  process.exit(1)
}
console.log(
  `v4 契约形状审计通过：${Object.keys(shape.paths).length} 条形状、` +
    `${Object.keys(shape.receipt_keys).length} 条可观测成功回执、` +
    `${shape.commands.documented_total} 条命令（view_event=22 / lock_offer=23）、` +
    `${shape.reserved_fields.length} 个 reserved 字段、` +
    `${shape.invariants.asserted_in_validate.length}/${shape.invariants.declared_total} 条不变式有断言、` +
    `${produced.length} 个错误码在用、账本类目 ${[...categories].sort().join('/')}`
)
