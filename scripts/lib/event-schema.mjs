// 事件卡内容校验（与 C++ event::parse_catalog 保持同一套规则）。
// 作者侧命令与构建脚本共用本文件，错误定位到 source / card_id / field。

export const CATALOG_SCHEMA_VERSION = 1

export const STAGES = [
  'content_design',
  'storyboard_key_animation',
  'animation',
  'art_visual',
  'photography_editing',
  'sound_delivery'
]

const CATEGORIES = ['personnel', 'quality', 'budget', 'schedule']
const POLARITIES = ['negative', 'positive']
const TIERS = ['normal', 'major']
const METRICS = [
  'stage_quality',
  'work_quality',
  'weeks_to_deadline',
  'max_fatigue',
  'funds',
  'weeks_in_project',
  'min_morale'
]
const OPS = ['<', '<=', '>', '>=']
const KINDS = ['accept', 'abandon', 'overtime', 'decline', 'outsource', 'extension']
const SCOPES = ['instant', 'stage', 'project']
const TARGETS = ['quality', 'work_done', 'fatigue', 'morale', 'funds']
// #121 / DEC-EVENT-003：一次升级字段已冻结。null/undefined 表示不升级；
// 非空配置必须满足下方全部约束，否则整卡拒绝加载（fail-closed）。
const TIMEOUT_KINDS = ['abandon', 'decline']

const isInt = (value) => Number.isInteger(value)
const isText = (value) => typeof value === 'string' && value.length > 0

function validateOptionList(options, prefix, card, fail) {
  if (!Array.isArray(options) || options.length === 0) {
    fail(prefix, `${prefix} 必须是非空数组`)
    return []
  }
  const optionIds = new Set()
  options.forEach((option, index) => {
    const where = `${prefix}[${index}]`
    if (typeof option !== 'object' || option === null) return fail(where, '选项必须是对象')
    if (!isText(option.id)) fail(`${where}.id`, '缺少选项 id')
    else if (optionIds.has(option.id)) fail(`${where}.id`, `重复的选项 id`)
    else optionIds.add(option.id)
    if (!isText(option.label)) fail(`${where}.label`, '缺少选项文案')
    if (!KINDS.includes(option.kind)) fail(`${where}.kind`, '未知选项类型')
    if (!isInt(option.cost) || option.cost < 0 || option.cost > 2000000) fail(`${where}.cost`, 'cost 必须在 0..2,000,000')
    if (!Array.isArray(option.effects)) return fail(`${where}.effects`, 'effects 必须是数组')
    option.effects.forEach((effect, effectIndex) => {
      const ep = `${where}.effects[${effectIndex}]`
      if (typeof effect !== 'object' || effect === null) return fail(ep, '效果必须是对象')
      if (!SCOPES.includes(effect.scope)) fail(`${ep}.scope`, 'scope 只能是 instant/stage/project')
      if (!TARGETS.includes(effect.target)) return fail(`${ep}.target`, '未知效果类型')
      if (!isInt(effect.value) || effect.value === 0) fail(`${ep}.value`, 'value 必须是非零整数')
      if (effect.stage !== undefined && !STAGES.includes(effect.stage)) fail(`${ep}.stage`, '未知阶段')
      if (effect.stage !== undefined && effect.scope !== 'stage') fail(`${ep}.stage`, '只有 scope=stage 才能写 stage')
      if (effect.stage && Array.isArray(card.stages) && card.stages.length > 0 && !card.stages.includes(effect.stage)) {
        fail(`${ep}.stage`, '效果阶段不在卡片适用阶段内')
      }
      if (['fatigue', 'morale', 'funds'].includes(effect.target) && effect.scope !== 'instant') {
        fail(`${ep}.scope`, `${effect.target} 只能即时结算`)
      }
      if (effect.target === 'funds' && effect.value > 0) fail(`${ep}.value`, '事件收入分类未定：funds 只能为负')
      if (effect.target === 'funds' && effect.value < -2000000) fail(`${ep}.value`, '单次扣款不能超过 2,000,000')
    })
    // #122：vendor_request 只允许 kind=outsource，三项齐全；悬空引用在运行时按 Vendor 错误码拒绝。
    if (option.vendor_request !== undefined && option.vendor_request !== null) {
      if (option.kind !== 'outsource') fail(`${where}.vendor_request`, '只有 kind=outsource 的选项可配置 vendor_request')
      else if (typeof option.vendor_request !== 'object' || Array.isArray(option.vendor_request)) {
        fail(`${where}.vendor_request`, 'vendor_request 必须是对象或 null')
      } else {
        const vr = option.vendor_request
        if (!isText(vr.item_id)) fail(`${where}.vendor_request.item_id`, '缺少 item_id')
        if (!isText(vr.supplier_id)) fail(`${where}.vendor_request.supplier_id`, '缺少 supplier_id')
        if (!isInt(vr.work_total) || vr.work_total <= 0) fail(`${where}.vendor_request.work_total`, 'work_total 必须是正整型工作量')
      }
    }
  })
  return options
}

function validateEscalation(card, fail) {
  const timeout = card.timeout_option_id
  const note = card.escalation_note
  if (note !== undefined && note !== null && typeof note !== 'string') fail('escalation_note', 'escalation_note 必须是字符串')
  const esc = card.escalation
  if (esc === undefined || esc === null) {
    if (timeout !== undefined && timeout !== null && !isText(timeout)) fail('timeout_option_id', 'timeout_option_id 必须是字符串')
    else if (isText(timeout) && !card.options?.some((option) => option?.id === timeout && TIMEOUT_KINDS.includes(option.kind))) {
      fail('timeout_option_id', 'timeout_option_id 必须指向本卡 options 中 kind=abandon/decline 的一项')
    }
    return
  }
  if (typeof esc !== 'object' || Array.isArray(esc)) return fail('escalation', 'escalation 必须是对象或 null')
  if (!(card.expires_weeks > 0)) fail('escalation', '只有限时事件（expires_weeks>0）可配置升级')
  if (card.tier !== 'major') fail('escalation', 'escalation 只允许 major 事件')
  if (esc.escalation !== undefined && esc.escalation !== null) fail('escalation.escalation', '升级最多一层，禁止嵌套升级')
  if (!isText(esc.description)) fail('escalation.description', '缺少升级描述')
  if (!isInt(esc.expires_weeks) || esc.expires_weeks !== 2) fail('escalation.expires_weeks', '升级后处理期限固定为 2 周')
  const upgraded = validateOptionList(esc.options, 'escalation.options', card, fail)
  if (!upgraded.some((option) => option?.kind === 'abandon')) fail('escalation.options', '升级选项必须含 abandon 默认分支')
  if (!isText(timeout) || !card.options?.some((option) => option?.id === timeout && TIMEOUT_KINDS.includes(option.kind))) {
    fail('timeout_option_id', '配置升级时 timeout_option_id 必须指向本卡 options 中 kind=abandon/decline 的一项')
  }
  if (!isText(esc.timeout_option_id) || !upgraded.some((option) => option?.id === esc.timeout_option_id && TIMEOUT_KINDS.includes(option.kind))) {
    fail('escalation.timeout_option_id', '二次硬罚分支必须指向 escalation.options 中 kind=abandon/decline 的一项')
  }
}

export function validateCard(card, source) {
  const issues = []
  const fail = (field, message) => issues.push({ source, card_id: card?.id ?? '', field, message })
  if (typeof card !== 'object' || card === null || Array.isArray(card)) {
    fail('', '卡片必须是对象')
    return issues
  }
  if (card.schema_version !== CATALOG_SCHEMA_VERSION) fail('schema_version', '卡片 schema_version 必须为 1')
  if (card.scope !== undefined && !['project', 'company'].includes(card.scope)) fail('scope', 'scope 只能是 project/company')
  if (!isText(card.id) || !/^[a-z0-9_]+$/.test(card.id)) fail('id', 'id 只允许小写字母、数字和下划线')
  if (!isText(card.name)) fail('name', '缺少 name')
  if (!CATEGORIES.includes(card.category)) fail('category', 'category 只能是 personnel/quality/budget/schedule')
  if (!POLARITIES.includes(card.polarity)) fail('polarity', 'polarity 只能是 negative/positive')
  if (!TIERS.includes(card.tier)) fail('tier', 'tier 只能是 normal/major')
  if (!isText(card.tag)) fail('tag', '缺少 tag')

  if (!Array.isArray(card.stages)) fail('stages', 'stages 必须是数组')
  else {
    for (const stage of card.stages) {
      if (!STAGES.includes(stage)) fail('stages', `未知阶段 ${stage}`)
    }
  }

  if (!isInt(card.priority) || card.priority < 0 || card.priority > 100) fail('priority', 'priority 必须在 0..100')
  if (!isInt(card.cooldown_weeks) || card.cooldown_weeks < 0 || card.cooldown_weeks > 52) {
    fail('cooldown_weeks', 'cooldown_weeks 必须在 0..52')
  }
  if (typeof card.once_per_project !== 'boolean') fail('once_per_project', 'once_per_project 必须是布尔值')
  if (!isInt(card.random_weight) || card.random_weight < 0 || card.random_weight > 1000) {
    fail('random_weight', 'random_weight 必须在 0..1000')
  }
  if (!isInt(card.expires_weeks) || card.expires_weeks < 0 || card.expires_weeks > 8) {
    fail('expires_weeks', 'expires_weeks 必须在 0..8')
  }


  if (typeof card.trigger !== 'object' || card.trigger === null) fail('trigger', '缺少 trigger 对象')
  else {
    if (!METRICS.includes(card.trigger.metric)) fail('trigger.metric', '未知触发指标')
    if (!OPS.includes(card.trigger.op)) fail('trigger.op', 'op 只能是 < <= > >=')
    if (!isInt(card.trigger.threshold)) fail('trigger.threshold', 'threshold 必须是整数')
  }
  if (!isText(card.description)) fail('description', '缺少 description')

  validateOptionList(card.options, 'options', card, fail)
  // #123 裁决 A：公司级事件只能改资金与全体 core 状态，不得写项目制作状态。
  if (card.scope === 'company') {
    for (const option of (Array.isArray(card.options) ? card.options : [])) {
      for (const effect of (Array.isArray(option?.effects) ? option.effects : [])) {
        if (['quality', 'work_done'].includes(effect?.target)) fail('scope', '公司级事件不得写 quality/work_done')
        if (effect?.target === 'funds' && effect.value > 0) fail('scope', '公司级事件不得正向加钱')
      }
    }
  }
  validateEscalation(card, fail)
  const hasKind = (kind) => Array.isArray(card.options) && card.options.some((option) => option?.kind === kind)
  if (card.polarity === 'negative' && !hasKind('abandon')) fail('options', '负面事件必须有 abandon 选项')
  if (card.polarity === 'positive' && (!hasKind('accept') || !hasKind('decline'))) {
    fail('options', '正面事件必须有 accept 与 decline 选项')
  }
  if (card.expires_weeks > 0 && (card.polarity !== 'negative' || !hasKind('abandon'))) {
    fail('options', '限期事件必须有负面 polarity 与 abandon 默认分支')
  }
  if (card.tier === 'major' && card.once_per_project !== true) fail('once_per_project', '重大事件必须 once_per_project=true')
  if (card.tier === 'major' && card.cooldown_weeks !== 0) fail('cooldown_weeks', '重大事件不能配冷却')
  return issues
}

export function validateCards(cards, source = 'content/events') {
  const issues = []
  const ids = new Set()
  for (const card of cards) {
    const cardIssues = validateCard(card, source)
    issues.push(...cardIssues)
    if (typeof card?.id === 'string' && card.id.length > 0) {
      if (ids.has(card.id)) issues.push({ source, card_id: card.id, field: 'id', message: '重复的事件 id' })
      ids.add(card.id)
    }
  }
  if (cards.length === 0) issues.push({ source, card_id: '', field: 'cards', message: '内容目录为空' })
  return issues
}

export function formatIssue(issue) {
  const card = issue.card_id ? `card ${issue.card_id}` : 'catalog'
  const field = issue.field ? ` [${issue.field}]` : ''
  return `${issue.source}: ${card}${field}: ${issue.message}`
}
