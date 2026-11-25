// 事件卡内容校验（与 C++ event::parse_catalog 保持同一套规则）。
// 作者侧命令与构建脚本共用本文件，错误定位到 source / card_id / field。

export const CATALOG_SCHEMA_VERSION = 1

// 限时事件的最长有效期，与 C++ event::kMaxExpiresWeeks 保持一致。
export const MAX_EXPIRES_WEEKS = 8

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

const isInt = (value) => Number.isInteger(value)
const isText = (value) => typeof value === 'string' && value.length > 0

export function validateCard(card, source) {
  const issues = []
  const fail = (field, message) => issues.push({ source, card_id: card?.id ?? '', field, message })
  if (typeof card !== 'object' || card === null || Array.isArray(card)) {
    fail('', '卡片必须是对象')
    return issues
  }
  if (card.schema_version !== CATALOG_SCHEMA_VERSION) fail('schema_version', '卡片 schema_version 必须为 1')
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
  // DEC-EVENT-002：expires_weeks>0 表示限时响应事件，触发当周计入有效期；0 表示不设期限。
  if (!isInt(card.expires_weeks) || card.expires_weeks < 0 || card.expires_weeks > MAX_EXPIRES_WEEKS) {
    fail('expires_weeks', `expires_weeks 必须在 0..${MAX_EXPIRES_WEEKS}`)
  }
  const hasTimeout = isInt(card.expires_weeks) && card.expires_weeks > 0
  if (card.timeout_option !== undefined && !isText(card.timeout_option)) {
    fail('timeout_option', 'timeout_option 必须是非空字符串')
  } else if (hasTimeout && card.timeout_option === undefined) {
    fail('timeout_option', '限时事件必须预设到期分支 timeout_option')
  } else if (!hasTimeout && card.timeout_option !== undefined) {
    fail('timeout_option', '未设期限的卡片不得配置到期分支')
  }
  if (card.escalate_on_timeout !== undefined && typeof card.escalate_on_timeout !== 'boolean') {
    fail('escalate_on_timeout', 'escalate_on_timeout 必须是布尔值')
  }
  const escalate = card.escalate_on_timeout === true
  if (card.escalate_on_timeout !== undefined && !hasTimeout) {
    fail('escalate_on_timeout', '超时升级需要先配置 expires_weeks')
  }
  if (card.escalated_expires_weeks !== undefined && !isInt(card.escalated_expires_weeks)) {
    fail('escalated_expires_weeks', 'escalated_expires_weeks 必须是整数')
  }
  if (escalate) {
    if (card.tier !== 'major') fail('escalate_on_timeout', '只有重大事件可配置一次超时升级')
    if (card.escalated_expires_weeks < 1 || card.escalated_expires_weeks > MAX_EXPIRES_WEEKS) {
      fail('escalated_expires_weeks', `升级后的响应期限必须在 1..${MAX_EXPIRES_WEEKS}`)
    }
  } else if (card.escalated_expires_weeks !== undefined && card.escalated_expires_weeks !== 0) {
    fail('escalated_expires_weeks', '未配置升级时 escalated_expires_weeks 必须为 0')
  }

  if (typeof card.trigger !== 'object' || card.trigger === null) fail('trigger', '缺少 trigger 对象')
  else {
    if (!METRICS.includes(card.trigger.metric)) fail('trigger.metric', '未知触发指标')
    if (!OPS.includes(card.trigger.op)) fail('trigger.op', 'op 只能是 < <= > >=')
    if (!isInt(card.trigger.threshold)) fail('trigger.threshold', 'threshold 必须是整数')
  }
  if (!isText(card.description)) fail('description', '缺少 description')

  if (!Array.isArray(card.options) || card.options.length === 0) {
    fail('options', 'options 必须是非空数组')
    return issues
  }
  const optionIds = new Set()
  card.options.forEach((option, index) => {
    const where = `options[${index}]`
    if (typeof option !== 'object' || option === null) return fail(where, '选项必须是对象')
    if (!isText(option.id)) fail(`${where}.id`, '缺少选项 id')
    else if (optionIds.has(option.id)) fail(`${where}.id`, '重复的选项 id')
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
  })

  const hasKind = (kind) => card.options.some((option) => option?.kind === kind)
  if (card.polarity === 'negative' && !hasKind('abandon')) fail('options', '负面事件必须有 abandon 选项')
  if (card.polarity === 'positive' && (!hasKind('accept') || !hasKind('decline'))) {
    fail('options', '正面事件必须有 accept 与 decline 选项')
  }
  if (card.tier === 'major' && card.once_per_project !== true) fail('once_per_project', '重大事件必须 once_per_project=true')
  if (card.tier === 'major' && card.cooldown_weeks !== 0) fail('cooldown_weeks', '重大事件不能配冷却')
  // 到期分支只能落在本卡片已接入的消极/保守选项上。
  if (isText(card.timeout_option)) {
    const branch = card.options.find((option) => option?.id === card.timeout_option)
    if (!branch) fail('timeout_option', '到期分支不在该卡片的选项里')
    else if (branch.kind === 'outsource' || branch.kind === 'extension') fail('timeout_option', '到期分支不能使用尚未接入的选项类型')
    else if (branch.kind !== 'abandon' && branch.kind !== 'decline') {
      fail('timeout_option', '到期分支只能是消极/保守选项（abandon/decline）')
    }
  }
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
