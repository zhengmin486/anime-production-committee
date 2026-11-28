import { useEffect, useState } from 'react'
import { FileText, Flag } from 'lucide-react'
import { episodeStageShortNames, ledgerNames, riskNames, weekStateNames } from './model'
import type { PrototypeData, WeeklyReceipt } from './model'
import { Panel, RiskTag, signedPoint, signedYuan, Stat, yuan } from './bits'
import type { V4GameState } from './v4Types'
import { advanceWeekV4, resolveEventV4, viewEventV4, workActionV4 } from '../services/gameV4'

const stateTones = { normal: 'state-normal', event_pending: 'state-event', settlement_rejected: 'state-rejected', closing: 'state-closing' } as const

export type WeekFocus = 'receipt' | 'decisions' | 'event' | 'next'

export const producingProjectCount = (receipt: WeeklyReceipt) => new Set(receipt.projectLines.map((line) => line.projectId)).size

type Execute = (command: () => Promise<{ state: V4GameState }>) => Promise<boolean>

export function WeeklyReceiptPreview({ receipt, onOpen }: { receipt: WeeklyReceipt; onOpen: () => void }) {
  return <div className="receipt-preview">
    <div><strong>{receipt.headline}</strong><p>现金变化 {signedYuan(receipt.cashDelta)} · 有产出项目 {producingProjectCount(receipt)} 部 · 待处理事件 {receipt.event ? 1 : 0} 项</p></div>
    <button className="button secondary" onClick={onOpen}>查看完整回执</button>
  </div>
}

export function WeeklyOperations({ data, state, onOpenProject, initialWeek, onWeekChange, focus, busy, error, execute }: {
  data: PrototypeData
  state: V4GameState
  onOpenProject: (projectId: string) => void
  initialWeek?: number
  onWeekChange?: (week: number) => void
  focus: WeekFocus
  busy: boolean
  error: string | null
  execute: Execute
}) {
  const [week, setWeek] = useState(initialWeek ?? data.company.week)
  const [eventId, setEventId] = useState(data.pendingEvents[0]?.id ?? '')
  const [selectedOption, setSelectedOption] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const receipt = data.receipts.find((item) => item.week === week) ?? data.receipts.at(-1)!
  const producedProjects = producingProjectCount(receipt)
  const event = data.pendingEvents.find((item) => item.id === eventId) ?? data.pendingEvents[0]
  const staffName = (staffId: string) => data.staff.find((person) => person.id === staffId)?.name ?? staffId
  const itemOf = (projectId: string, key: string | null) => {
    const project = data.projects.find((item) => item.id === projectId)
    if (!project || !key) return undefined
    return [...project.commonItems, ...project.episodes.flatMap((episode) => episode.workItems)].find((item) => item.key === key)
  }
  const selectWeek = (next: number) => { setWeek(next); setConfirmClose(false); onWeekChange?.(next) }
  const unviewed = data.pendingEvents.filter((item) => !item.viewed).length
  const closed = state.company.status !== 'running'

  useEffect(() => {
    setWeek(data.company.week)
    setConfirmClose(false)
    onWeekChange?.(data.company.week)
  }, [data.company.week, onWeekChange])

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-week-focus="${focus}"]`)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'start' })
  }, [focus, week])

  useEffect(() => {
    if (!data.pendingEvents.some((item) => item.id === eventId)) setEventId(data.pendingEvents[0]?.id ?? '')
    setSelectedOption('')
  }, [data.pendingEvents, eventId])

  const advance = () => execute(() => advanceWeekV4(state))
  const viewEvent = () => event ? execute(() => viewEventV4(state, event.projectId!, event.id)) : Promise.resolve(false)
  const resolveEvent = () => event ? execute(() => resolveEventV4(state, event.projectId!, event.id, selectedOption)) : Promise.resolve(false)
  const closingAction = (workId?: string) => execute(() => workActionV4(state.company.status === 'ended' ? 'finalize_company' : 'finalize_delivery', state, workId))

  return <div className="proto-screen">
    <div className="week-tabs" role="group" aria-label="周次快照">
      {data.receipts.map((item) => <button key={item.week} className={`week-tab${item.week === week ? ' is-active' : ''}`} onClick={() => selectWeek(item.week)} aria-pressed={item.week === week}>
        <span>第 {item.week} 周</span><span className={`tab-state tab-${item.state}`}>{weekStateNames[item.state]}</span>{item.event && <Flag size={13} aria-hidden="true" />}
      </button>)}
      <span className="week-note">历史来自本次会话的核心周报；场景切换不推进周次</span>
    </div>

    <section className="proto-focus-target" data-week-focus="receipt" tabIndex={-1} aria-label="周回报执定位">
      <div className={`state-banner ${stateTones[receipt.state]}`} role="status">
        <p className="state-name">{weekStateNames[receipt.state]}</p>
        <p className="state-note">{receipt.stateNote}</p>
        {unviewed > 0 && !closed && <p className="disabled-reason">推进不可用：还有 {unviewed} 条未查看事件，需先逐条查看。</p>}
        {error && <p className="disabled-reason" role="alert">{error}</p>}
        {receipt.rejected && <dl className="crisis-facts">
          <div><dt>回滚前现金</dt><dd>{yuan(receipt.rejected.cash)}</dd></div>
          <div><dt>下周刚性支出</dt><dd>{yuan(receipt.rejected.requiredNextWeek)}</dd></div>
          <div><dt>缺口</dt><dd className="cell-behind">{yuan(receipt.rejected.shortfall)}</dd></div>
          <div><dt>处理结果</dt><dd>整周未提交，核心进入破产关闭</dd></div>
        </dl>}
      </div>
      <div className="closing-actions">
        <button className="button primary" disabled={busy || closed || unviewed > 0} onClick={advance}>{busy ? '核心处理中…' : '推进本周'}</button>
        <span>{closed ? '不可用：公司已进入关闭或结束流程。' : unviewed > 0 ? '不可用：请先查看全部事件。' : '执行 v4 advance_week，成功后才采用新状态。'}</span>
      </div>
    </section>

    {receipt.closing && <Panel eyebrow="CLOSING / 公司关闭" title="关闭中：只允许结清与总结" marks={['confirmed']}
      note={state.company.end_reason === 'bankrupt' ? '刚性支出预检失败已触发结束流程。系统不继续生产，不自动借款或追加投资。' : '公司已主动进入结束流程，后续动作与破产关闭相同。'}>
      <dl className="proto-stats proto-stats-tight">
        <Stat strong label="公司现金" value={yuan(state.finance.balance)} hint="唯一公司现金池" />
        <Stat label="待结清项目" value={`${state.works.length} 部`} hint="按每部门槛达成情况由核心结清" />
        <Stat label="经营周" value="停止推进" hint="advance_week 不再接受操作" />
      </dl>
      <div className="closing-actions">
        <button disabled>推进本周</button><span>不可用：公司已进入结束流程。</span>
        <button className="button secondary" disabled={busy || state.company.status !== 'running' || !confirmClose} onClick={() => setConfirmClose(true)}>{confirmClose ? '再次点击确认结束' : '结束公司（需二次确认）'}</button>
        <button className="button secondary" disabled={busy || !confirmClose || state.company.status !== 'running'} onClick={() => execute(() => workActionV4('end_company', state))}>确认结束经营</button>
      </div>
      <div className="proto-two-col">
        <ul className="quiet-list">{receipt.closing.allowedActions.map((line) => <li key={line}>允许：{line}</li>)}</ul>
        <ul className="quiet-list">{receipt.closing.blockedActions.map((line) => <li key={line}>禁止：{line}</li>)}</ul>
      </div>
      {state.works.map((project) => <div className="closing-preview" key={project.id} role="region" aria-label={`${project.offer.name}关闭结清`}>
        <h3 className="sub-heading">{project.offer.name}</h3>
        <p>门槛状态由核心判定；未达门槛将按强制交付规则结算，不伪报完成。</p>
        <button className="button secondary" disabled={busy} onClick={() => closingAction(project.id)}>结清这部作品</button>
      </div>)}
      {state.company.status === 'ended' && <div className="closing-preview"><h3 className="sub-heading">经营总结</h3><button className="button secondary" disabled={busy || state.archive.company_result !== null} onClick={() => closingAction()}>生成核心经营总结</button></div>}
    </Panel>}

    <Panel eyebrow={`WEEKLY REPORT / 第 ${receipt.week} 周`} title={receipt.headline} marks={['confirmed']}>
      <dl className="proto-stats">
        <Stat strong label="本周现金变化" value={signedYuan(receipt.cashDelta)} hint="由核心统一结算" />
        <Stat label="有产出的项目" value={`${producedProjects} 部`} hint={`公司共 ${data.projects.length} 部在制`} />
        <Stat label="待处理事件" value={`${data.pendingEvents.length} 项`} hint="已查看未处理事件不阻塞推进，但会继续计时" />
        <Stat label="状态明显变化的员工" value={`${receipt.staffLines.length} 人`} hint="疲劳与士气由核心更新" />
      </dl>
      {receipt.costLines.length > 0 && <ul className="cost-lines">{receipt.costLines.map((line) => <li key={line.category}>
        <span className="cost-cat">{ledgerNames[line.category]}</span><span className="cost-label">{line.label}</span><span className={line.amount < 0 ? 'cost-out' : 'cost-in'}>{signedYuan(line.amount)}</span>
      </li>)}</ul>}
    </Panel>

    {((receipt.eventOutcomes?.length ?? 0) > 0 || (receipt.settlements?.length ?? 0) > 0) && <Panel eyebrow="CORE OUTCOME / 核心自动结果" title="本周自动执行与交付结算" marks={['confirmed']}
      note="以下内容来自 advance_week 的核心周报；事件到期默认分支与期限交付不会在前端模拟。">
      {(receipt.eventOutcomes?.length ?? 0) > 0 && <><h3 className="sub-heading">事件到期结果</h3><ul className="quiet-list">{receipt.eventOutcomes?.map((line) => <li key={line}>{line}</li>)}</ul></>}
      {(receipt.settlements?.length ?? 0) > 0 && <><h3 className="sub-heading">作品结算结果</h3><ul className="quiet-list">{receipt.settlements?.map((line) => <li key={line}>{line}</li>)}</ul></>}
    </Panel>}

    <div className="proto-two-col">
      <Panel eyebrow="PRODUCTION / 本周各项目做了什么" title="产出与原因" marks={['confirmed']}
        note="一次推进，所有项目在同一核心事务中结算；失败时整周回滚。">
        {receipt.projectLines.length === 0 ? <p className="proto-inline-note"><FileText size={16} aria-hidden="true" /> 本周没有项目产出。</p> :
          <ul className="week-projects">{receipt.projectLines.map((line) => {
            const item = itemOf(line.projectId, line.itemKey)
            return <li key={line.itemId ?? `${line.projectId}-${line.episodeIndex ?? 'common'}-${line.stage ?? 'none'}-${line.itemKey}`}>
              <div className="week-project-head"><button className="link-button" onClick={() => onOpenProject(line.projectId)}>{line.title}</button><span className="chip">{line.episodeIndex === null ? '公共制作' : `第 ${line.episodeIndex} 集`}</span>{line.stage && <span className="chip">{episodeStageShortNames[line.stage]}</span>}{item && <span className="chip chip-item">{item.name}</span>}</div>
              <p className="week-deltas">工作量 <strong>{signedPoint(line.workDelta)}</strong> · 质量 <strong>{signedPoint(line.qualityDelta)}</strong></p><p className="week-detail">{line.detail}</p><p className="week-reason">原因：{line.reason}</p>
            </li>
          })}</ul>}
        <ul className="people-list staff-changes">{receipt.staffLines.map((line) => <li key={line.staffId}>
          <div className="people-head"><strong>{staffName(line.staffId)}</strong><span>疲劳 {signedPoint(line.fatigueDelta)} · 士气 {signedPoint(line.moraleDelta)}</span></div><p className="people-note">{line.note}</p>
        </li>)}</ul>
      </Panel>
      <div className="proto-stack">
        <section className="proto-focus-target" data-week-focus="decisions" tabIndex={-1} aria-label="必须决定定位">
          <Panel eyebrow="DECIDE / 必须决定" title="人员、计划、事件与交付" marks={['confirmed']}
            note="持续计划自动执行；人员调配、计划修改、事件与整部作品交付由玩家在左侧明确操作。v4 不提供单集独立交付命令。">
            <ul className="quiet-list"><li>人员调配：办公室 → 员工详情</li><li>持续计划：制作现场 → 作品详情</li><li>事件：本页事件区</li><li>交付：制作现场 → 作品详情</li></ul>
          </Panel>
        </section>
        <Panel eyebrow="NO ACTION / 不用管的部分" title="自动执行与仅报告" marks={['confirmed']}>
          <h3 className="sub-heading">持续方针自动执行</h3><ul className="quiet-list">{receipt.autoExecuted.map((line) => <li key={line}>{line}</li>)}</ul>
          <h3 className="sub-heading">仅报告</h3><ul className="quiet-list">{receipt.reportOnly.map((line) => <li key={line}>{line}</li>)}</ul>
        </Panel>
        <section className="proto-focus-target" data-week-focus="next" tabIndex={-1} aria-label="下周关注定位"><Panel eyebrow="NEXT WEEK / 下周关注" title="最值得盯住的事"><ol className="focus-list">{receipt.nextFocus.map((line) => <li key={line}>{line}</li>)}</ol></Panel></section>
      </div>
    </div>

    <section className="proto-focus-target" data-week-focus="event" tabIndex={-1} aria-label="制作异常事件定位">
      {data.pendingEvents.length > 0 && event ? <Panel eyebrow="EVENT / 制作异常" title={event.title} marks={['confirmed']}
        aside={<p className="proto-since">归属：{data.projects.find((project) => project.id === event.projectId)?.title ?? '—'} · {event.deadlineWeek === null ? '无期限' : `第 ${event.deadlineWeek} 周前`}</p>}
        note={event.description}>
        {data.pendingEvents.length > 1 && <div className="filter-chips" role="group" aria-label="待处理事件选择">{data.pendingEvents.map((item) => <button key={item.id} className={item.id === event.id ? 'is-active' : ''} onClick={() => setEventId(item.id)}>{item.title}</button>)}</div>}
        <ul className="signal-list">{event.signals.map((signal, index) => <li key={`${signal}-${index}`}>{signal}</li>)}</ul>
        <div className="proto-table-wrap"><table className="proto-table event-options">
          <thead><tr><th>选择</th><th>选项</th><th>确定代价</th><th>核心效果快照</th><th>风险</th><th>选项类型</th></tr></thead>
          <tbody>{event.options.map((option) => <tr key={option.id} className={selectedOption === option.id ? 'is-selected' : undefined}>
            <td><input type="radio" name={`event-${event.id}`} value={option.id} checked={selectedOption === option.id} disabled={!event.viewed || busy} onChange={() => setSelectedOption(option.id)} aria-label={`选择${option.label}`} /></td>
            <th scope="row">{option.label}</th><td>{option.cost === 0 ? '不额外支出' : yuan(option.cost)}</td><td>{option.gain}</td>
            <td><RiskTag level={option.risk} label={riskNames[option.risk]} /><span className="cell-sub">{option.riskNote}</span></td><td>{option.fits}</td>
          </tr>)}</tbody>
        </table></div>
        {!event.viewed ? <div className="event-confirm"><p>查看事件不会应用选项、扣款或移除事件。</p><button className="button secondary" disabled={busy} onClick={viewEvent}>查看事件（核心）</button></div> :
          <div className="event-confirm"><p>已选择：<strong>{event.options.find((option) => option.id === selectedOption)?.label ?? '尚未选择'}</strong></p><button className="button primary" disabled={busy || selectedOption === ''} onClick={resolveEvent}>确认处理（核心）</button></div>}
        <p className="proto-footnote">查看后允许推进周；若到期仍未处理，核心按冻结的默认分支自动执行。</p>
      </Panel> : <Panel eyebrow="EVENT / 制作异常" title="本周没有需要处理的事件" marks={['confirmed']}><p className="proto-inline-note"><FileText size={16} aria-hidden="true" /> 普通周只呈现经营回执。</p></Panel>}
    </section>
    <p className="proto-legend">规则来源：v4 C++ 核心。外包与加班计划字段当前只保存；本页未接入招聘与外包签约，不会将它们伪装为可玩。中止作品已在作品详情中接入核心命令。</p>
  </div>
}
