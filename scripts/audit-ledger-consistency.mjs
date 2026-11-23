// 独立的跨模块账目与状态一致性回归检查。
//
// 定位（见 docs/GAME_RULES.md V3.3 分类账恒等式与 docs/DATA_MODEL.md V3.4）：
// C++ 核心与 TS 守卫都“只校验协议、范围与关联，不重算利润/本金/分账公式”，
// 因此 GAME_RULES.md:36-42 的六条现金恒等式在现有任何检查中都没有被完整验证过。
// 本脚本把这些恒等式作为“外部对账表”独立复核：它不修改玩法规则、不替代核心计算，
// 只在一份已经通过结构校验的 v3 状态上重新核对账目与状态是否互相自洽。
//
// 未接入的规则（委员会 BD 50% 保底 #8/K3、前期开发费归属 #6/K1-K2、success_reward、
// 事件直接资金影响 #11、项目区间外的成本归因）一律标记为 PENDING，不伪造通过结果。
//
// 用法：node scripts/audit-ledger-consistency.mjs <存档或状态.json> [更多.json ...]
// 退出码：0 通过（允许 PENDING），1 发现不一致，2 用法/输入错误。

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const FIXED_COST_CATEGORIES = ['salary', 'operations', 'production', 'temporary', 'outsourcing', 'events', 'extension', 'penalty']
export const OPTIONAL_COST_CATEGORIES = ['development', 'distribution']

const money = (value) => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return null
  return BigInt(value)
}

const sumCosts = (costs) => {
  if (!costs || typeof costs !== 'object') return null
  let total = 0n
  for (const category of FIXED_COST_CATEGORIES) {
    const amount = money(costs[category])
    if (amount === null) return null
    total += amount
  }
  for (const category of OPTIONAL_COST_CATEGORIES) {
    if (costs[category] === undefined) continue
    const amount = money(costs[category])
    if (amount === null) return null
    total += amount
  }
  return total
}

const costCategoryTotals = (costs) => {
  const out = {}
  for (const category of [...FIXED_COST_CATEGORIES, ...OPTIONAL_COST_CATEGORIES]) {
    if (costs[category] === undefined && OPTIONAL_COST_CATEGORIES.includes(category)) continue
    out[category] = money(costs[category]) ?? 0n
  }
  return out
}

const yen = (big) => `${big < 0n ? '-' : ''}¥${(big < 0n ? -big : big).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`

// 承制模式禁止投资与商业分成，委员会模式必须携带投资比例（与守卫 isProject/isWorkRecord 一致）。
const modeConsistent = (mode, finance, investmentPercent) => {
  if (!finance) return true
  if (mode !== 'contract') return true
  return finance.investment_paid === 0 && finance.commercial_share_received === 0 && investmentPercent === 0
}

const PASS = 'PASS'
const FAIL = 'FAIL'
const PENDING = 'PENDING'

const findings = []
let currentScope = 'state'
const record = (check, status, detail) => findings.push({ scope: currentScope, check, status, detail })

// 单个 finance 对象（公司账或某作品/项目账）的收支净额，用于多条恒等式复用。
const netOf = (finance) => {
  if (!finance) return null
  const contract = money(finance.contract_received)
  const share = money(finance.commercial_share_received)
  const invest = money(finance.investment_paid)
  const costs = sumCosts(finance.costs)
  if (contract === null || share === null || invest === null || costs === null) return null
  return { contract, share, invest, costs, net: contract + share - invest - costs }
}

// 检查 1：公司资金变化必须与全生命周期交易记录一致。
// GAME_RULES.md:40-41 —— 最终现金 = 初始现金 + contract_received + commercial_share_received − investment_paid − 公司成本总和。
const checkCompanyFundsLedger = (state) => {
  const company = state.company
  const initial = money(company.initial_funds)
  const funds = money(company.funds)
  const net = netOf(company.finance)
  if (initial === null || funds === null || net === null) {
    record('1-company-funds-ledger', FAIL, '公司资金或财务字段不是安全整数，无法对账。')
    return
  }
  const expected = initial + net.net
  if (expected === funds) {
    record('1-company-funds-ledger', PASS, `现金自洽：${yen(initial)} + 净额 ${yen(net.net)} = ${yen(funds)}。`)
  } else {
    record('1-company-funds-ledger', FAIL,
      `公司现金与账目不符：账面应为 ${yen(expected)}，实际 ${yen(funds)}，差额 ${yen(funds - expected)}。`
      + `（收入 contract ${yen(net.contract)} + 分成 ${yen(net.share)} − 投资 ${yen(net.invest)} − 成本 ${yen(net.costs)}）`)
  }
}

// 检查 2：公司层的收入字段必须等于所有已结算作品 + 当前在制项目的逐项汇总。
// GAME_RULES.md:27 —— 同一笔交易的公司账与项目账是两个汇总视图；差异即重复入账或漏账。
const checkRevenueReconciliation = (state) => {
  const units = [...state.history, ...(state.project ? [state.project] : [])]
  const fields = ['contract_received', 'commercial_share_received', 'investment_paid']
  const problems = []
  for (const field of fields) {
    let total = 0n
    let broken = false
    for (const unit of units) {
      const amount = money(unit.finance?.[field])
      if (amount === null) { broken = true; break }
      total += amount
    }
    if (broken) continue
    const companyValue = money(state.company.finance?.[field])
    if (companyValue === null) continue
    if (companyValue !== total) {
      const dir = companyValue > total ? '公司账高于各账目汇总（可能存在未归属的重复入账）' : '公司账低于各账目汇总（存在漏记）'
      problems.push(`${field}：公司 ${yen(companyValue)} ≠ 汇总 ${yen(total)}，差 ${yen(companyValue - total)}——${dir}。`)
    }
  }
  if (problems.length === 0) {
    record('2-revenue-reconciliation', PASS, `公司收入字段与 ${units.length} 个账目（作品${state.project ? '+在制项目' : ''}）逐项一致。`)
  } else {
    record('2-revenue-reconciliation', FAIL, problems.join(' '))
  }
}

// 检查 3：任一成本分类的公司账不得小于各账目汇总（汇总大于公司账 = 同一笔被计入两处）。
// 空闲期工资/运营只进公司账、不进作品账，因此允许公司账更大；精确的空闲/项目归因需交易明细（待接入）。
const checkCostContainment = (state) => {
  const units = [...state.history, ...(state.project ? [state.project] : [])]
  const companyTotals = costCategoryTotals(state.company.finance.costs)
  const problems = []
  for (const [category, companyValue] of Object.entries(companyTotals)) {
    let total = 0n
    for (const unit of units) {
      const amount = money(unit.finance?.costs?.[category])
      if (amount === null) continue
      total += amount
    }
    if (total > companyValue) {
      problems.push(`${category}：各账目汇总 ${yen(total)} 超过公司账 ${yen(companyValue)}，同一笔支出被重复计入。`)
    }
  }
  if (problems.length === 0) {
    const idleOnly = Object.entries(companyTotals).some(([category, companyValue]) => {
      let total = 0n
      for (const unit of units) total += money(unit.finance?.costs?.[category]) ?? 0n
      return companyValue > total
    })
    record('3-cost-containment', PASS,
      idleOnly
        ? '成本归属无重复；公司账存在项目区间外成本（空闲期工资/运营），精确归因待交易明细接入。'
        : '成本归属无重复，且公司账与各项目账完全对齐。')
  } else {
    record('3-cost-containment', FAIL, problems.join(' '))
  }
}

// 检查 4：每笔作品结算的利润必须等于其自身 finance 的净额。
// GAME_RULES.md:38 —— 利润 = contract_received + commercial_share_received − investment_paid − 项目累计成本。
const checkWorkProfit = (state) => {
  const problems = []
  for (const unit of state.history) {
    const net = netOf(unit.finance)
    const profit = money(unit.profit)
    if (!net || profit === null) { problems.push(`作品 ${unit.id}：finance 或 profit 不是安全整数。`); continue }
    if (net.net !== profit) {
      problems.push(`作品 ${unit.id}：利润应 ${yen(net.net)}，记录 ${yen(profit)}，差 ${yen(profit - net.net)}。`)
    }
  }
  if (problems.length === 0) {
    record('4-work-profit-identity', PASS, `${state.history.length} 笔作品的利润与各自 finance 净额一致。`)
  } else {
    record('4-work-profit-identity', FAIL, problems.join(' '))
  }
}

// 检查 5：模式与利润公式一致性 + 承制零投资/零分成。
const checkModeConsistency = (state) => {
  const problems = []
  for (const unit of state.history) {
    if (!modeConsistent(unit.mode, unit.finance, unit.investment_percent)) {
      problems.push(`作品 ${unit.id}：承制模式却记有 investment_paid/commercial_share_received/investment_percent。`)
    }
  }
  if (state.project && !modeConsistent(state.project.mode, state.project.finance, state.project.investment_percent)) {
    problems.push(`在制项目 ${state.project.offer.id}：承制模式却记有投资/分成。`)
  }
  if (problems.length === 0) {
    record('5-mode-consistency', PASS, '承制/委员会模式与收支字段一致。')
  } else {
    record('5-mode-consistency', FAIL, problems.join(' '))
  }
}

// 检查 6：BD 渠道与非 BD 渠道的公司所得分别汇总。
// channel_breakdown 尚未由核心下发（#8/K3），存在时只核对“分渠道公司所得之和 == 财务分成”，
// BD≥50% 保底与分账比例本身标记为待接入。
const checkChannelSplit = (state) => {
  const withBreakdown = state.history.filter((w) => Array.isArray(w.channel_breakdown) && w.channel_breakdown.length > 0)
  if (withBreakdown.length === 0) {
    record('6-channel-split', PENDING, '作品未携带 channel_breakdown（委员会渠道分账规则 #8/K3 尚未接入核心），无法分别核对 BD 与非 BD 公司所得。')
    return
  }
  const problems = []
  for (const work of withBreakdown) {
    let bd = 0n
    let nonBd = 0n
    let revenue = 0n
    for (const item of work.channel_breakdown) {
      const rec = money(item.company_received)
      const rev = money(item.revenue)
      if (rec === null || rev === null) { problems.push(`作品 ${work.id}：分渠道金额非法。`); continue }
      revenue += rev
      if (item.channel === 'bd') bd += rec
      else nonBd += rec
    }
    const share = money(work.finance.commercial_share_received)
    const totalRevenue = money(work.commercial_revenue)
    if (share !== null && bd + nonBd !== share) {
      problems.push(`作品 ${work.id}：分渠道公司所得 BD ${yen(bd)} + 非BD ${yen(nonBd)} = ${yen(bd + nonBd)} ≠ 财务分成 ${yen(share)}。`)
    }
    if (totalRevenue !== null && revenue !== totalRevenue) {
      problems.push(`作品 ${work.id}：分渠道收入之和 ${yen(revenue)} ≠ 商业总收入 ${yen(totalRevenue)}。`)
    }
  }
  if (problems.length === 0) {
    record('6-channel-split', PASS,
      `${withBreakdown.length} 笔作品的 BD/非BD 公司所得分别汇总并与财务分成对账成功（BD 50% 保底本身仍属 #8/K3 待接入）。`)
  } else {
    record('6-channel-split', FAIL, problems.join(' '))
  }
}

// 检查 7：结算后历史、last_project_id、项目状态互相一致。
const checkSettlementState = (state) => {
  const problems = []
  const byId = new Map()
  for (const work of state.history) {
    if (byId.has(work.id)) problems.push(`历史作品 ID 重复：${work.id}。`)
    if (work.end_week > state.company.week) problems.push(`作品 ${work.id} 的 end_week ${work.end_week} 晚于公司当前周 ${state.company.week}。`)
    if (work.previous_work_id !== null && !byId.has(work.previous_work_id)) problems.push(`作品 ${work.id} 引用了不存在或更晚的前作 ${work.previous_work_id}。`)
    byId.set(work.id, work)
  }
  if (state.last_project_id !== null && !byId.has(state.last_project_id)) {
    problems.push(`last_project_id ${state.last_project_id} 未在历史中找到。`)
  }
  if (state.phase === 'project_settled') {
    if (state.project !== null) problems.push('project_settled 阶段仍保留在制项目。')
    if (state.last_project_id === null) problems.push('project_settled 阶段缺少 last_project_id。')
    else if (byId.has(state.last_project_id)) {
      const work = byId.get(state.last_project_id)
      const net = netOf(work.finance)
      if (net && money(work.profit) !== null && net.net !== money(work.profit)) {
        problems.push(`待结算作品 ${work.id} 的利润与其 finance 不一致。`)
      }
    }
  }
  if (state.project !== null && state.last_project_id !== null) {
    problems.push('既有在制项目又保留 last_project_id（结算展示未清）。')
  }
  if (problems.length === 0) {
    record('7-settlement-state', PASS, '历史、last_project_id 与项目/阶段状态保持一致。')
  } else {
    record('7-settlement-state', FAIL, problems.join(' '))
  }
}

// 检查 8：破产/主动结束/520 周终局后不得继续经营，且经营总结与账目自洽。
const checkEndgameState = (state) => {
  const company = state.company
  const problems = []
  if (company.status === 'running') {
    if (company.week >= 520) record('8-endgame-lock', FAIL, `公司仍 running 但已到第 ${company.week} 周（应触发 520 周终局并锁定经营）。`)
    else record('8-endgame-lock', PASS, '公司仍在经营（week < 520），无终局锁定要求。')
    return
  }
  // 非 running：不得再经营。
  if (company.end_reason === null) problems.push(`状态 ${company.status} 却没有 end_reason。`)
  if (state.offers.length !== 0) problems.push(`公司 ${company.status} 仍下发 ${state.offers.length} 个企划（不允许继续经营）。`)
  if ((state.custom_offer ?? null) !== null || (state.pending_proposal ?? null) !== null) problems.push('公司非 running 时自定企划/员工提案槽位仍非空。')
  if (company.funds < 0 && company.end_reason !== 'bankrupt') problems.push(`公司现金为负（${yen(BigInt(company.funds))}）但结束理由不是 bankrupt。`)
  if (company.end_reason === 'time_limit' && company.week !== 520) problems.push(`time_limit 结束但周数为 ${company.week}（应为 520）。`)
  if (state.project !== null && company.status === 'ended') problems.push('公司 ended 仍保留在制项目。')

  if (company.status === 'ended') {
    const result = state.company_result
    if (!result) {
      problems.push('公司 ended 缺少 company_result。')
    } else {
      const initial = money(company.initial_funds)
      const final = money(result.final_funds)
      const net = money(result.net_cash_change)
      if (initial !== null && final !== null && net !== null && net !== final - initial) {
        problems.push(`company_result.net_cash_change ${yen(net)} ≠ final_funds ${yen(final)} − initial_funds ${yen(initial)}。`)
      }
      if (final !== null && money(company.funds) !== null && final !== money(company.funds)) problems.push(`company_result.final_funds 与公司现金不符。`)
      if (result.weeks !== company.week) problems.push(`company_result.weeks ${result.weeks} ≠ 公司周数 ${company.week}。`)
      if (result.total_projects !== state.history.length) problems.push(`company_result.total_projects ${result.total_projects} ≠ 历史作品数 ${state.history.length}。`)
      if (result.reason !== company.end_reason) problems.push(`company_result.reason ${result.reason} ≠ 公司 end_reason ${company.end_reason}。`)
    }
  }

  if (problems.length === 0) record('8-endgame-lock', PASS, `终局状态自洽：${company.status}/${company.end_reason}，不再经营且总结对账一致。`)
  else record('8-endgame-lock', FAIL, problems.join(' '))
}

// 待接入声明：这些规则口径已冻结但核心/契约未落地，本脚本不伪造。
const reportPendingRules = (state) => {
  const hasCommittee = [...state.history, ...(state.project ? [state.project] : [])].some((u) => u.mode === 'committee')
  const devCost = [...state.history, state.project, { finance: state.company.finance }]
    .some((u) => (u?.finance?.costs?.development ?? 0) !== 0 || (u?.finance?.costs?.distribution ?? 0) !== 0)
  const notes = []
  if (hasCommittee) notes.push('委员会 BD 50% 保底与渠道分账（#8/K3）：核对收支汇总，但不校验保底比例。')
  if (devCost) notes.push('前期开发费/播出发行支出（#6/K1-K2）归属：仅计入成本汇总，未确认独立账目口径。')
  notes.push('success_reward_received：契约尚无该字段，利润公式暂不含成功奖励。')
  notes.push('事件直接资金影响（#11）：若公司现金恒等式失败，可能是未入账的事件资金，需事件结算接入后再判。')
  record('pending-rules', PENDING, notes.join(' '))
}

// 输入解析：接受 GameState 或 SaveRecord，只读解包，绝不改动原始对象。
const unwrap = (raw) => {
  if (!raw || typeof raw !== 'object') return null
  if (raw.version === 3 && raw.company) return raw
  if (raw.state && raw.state.version === 3) return raw.state
  return null
}

export const auditState = (raw) => {
  const state = unwrap(raw)
  if (!state) throw new Error('输入既不是 v3 GameState，也不是包含 v3 state 的 SaveRecord。')
  findings.length = 0
  currentScope = state.phase ?? 'state'
  checkCompanyFundsLedger(state)
  checkRevenueReconciliation(state)
  checkCostContainment(state)
  checkWorkProfit(state)
  checkModeConsistency(state)
  checkChannelSplit(state)
  checkSettlementState(state)
  checkEndgameState(state)
  reportPendingRules(state)
  const failed = findings.filter((f) => f.status === FAIL)
  const pending = findings.filter((f) => f.status === PENDING)
  return { ok: failed.length === 0, failed, pending, findings: [...findings] }
}

const formatReport = (label, result) => {
  const lines = [`\n== ${label} ==`]
  for (const f of result.findings) {
    const tag = f.status === PASS ? 'OK  ' : f.status === FAIL ? 'FAIL' : 'PEND'
    lines.push(`  [${tag}] ${f.check}: ${f.detail}`)
  }
  lines.push(`  结论：${result.ok ? '通过' : '不一致'}（失败 ${result.failed.length}，待接入 ${result.pending.length}）`)
  return lines.join('\n')
}

export const loadJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

const main = () => {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    console.error('用法：node scripts/audit-ledger-consistency.mjs <存档.json> [更多.json ...]')
    process.exitCode = 2
    return
  }
  let anyFail = false
  for (const path of paths) {
    let raw
    try {
      raw = loadJson(path)
    } catch (error) {
      console.error(`无法读取 ${path}: ${error.message}`)
      anyFail = true
      continue
    }
    let result
    try {
      result = auditState(raw)
    } catch (error) {
      console.error(`${path}: ${error.message}`)
      anyFail = true
      continue
    }
    console.log(formatReport(path, result))
    if (!result.ok) anyFail = true
  }
  process.exitCode = anyFail ? 1 : 0
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
