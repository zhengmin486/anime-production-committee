import { useEffect, useState } from 'react'
import { FileText, Flag } from 'lucide-react'
import { decisionKindNames, episodeStageShortNames, ledgerNames, riskNames, weekStateNames } from './model'
import type { PrototypeData, WeeklyReceipt, WorkItem } from './model'
import { Panel, RiskTag, signedPoint, signedYuan, Stat, yuan } from './bits'

const stateTones = { normal: 'state-normal', event_pending: 'state-event', settlement_rejected: 'state-rejected', closing: 'state-closing' } as const

export type WeekFocus = 'receipt' | 'decisions' | 'event' | 'next'
export type EventResolution = { optionId: string; outcome: string }
export type DecisionRecords = Record<string, { option: string }>

export function WeeklyReceiptPreview({ receipt, onOpen }: { receipt: WeeklyReceipt; onOpen: () => void }) {
  return <div className="receipt-preview">
    <div><strong>{receipt.headline}</strong><p>现金变化 {signedYuan(receipt.cashDelta)} · 有产出项目 {receipt.projectLines.length} 部 · 必须决定 {receipt.mustDecide.length} 项</p></div>
    <button className="button secondary" onClick={onOpen}>查看完整回执</button>
  </div>
}

export function WeeklyOperations({ data, onOpenProject, initialWeek, onWeekChange, focus, resolvedEvents, onResolveEvent, decisionRecords, onRecordDecision }: {
  data: PrototypeData
  onOpenProject: (projectId: string) => void
  initialWeek?: number
  onWeekChange?: (week: number) => void
  focus: WeekFocus
  resolvedEvents: Record<string, EventResolution>
  onResolveEvent: (eventId: string, resolution: EventResolution) => void
  decisionRecords: DecisionRecords
  onRecordDecision: (decisionId: string, option: string) => void
}) {
  const [week, setWeek] = useState(initialWeek ?? data.receipts[0].week)
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({})
  const [pendingDecisions, setPendingDecisions] = useState<Record<string, string>>({})
  const [closingView, setClosingView] = useState<'delivery' | 'summary' | null>(null)
  const receipt = data.receipts.find((item) => item.week === week) ?? data.receipts[0]
  const resolution = receipt.event ? resolvedEvents[receipt.event.id] : undefined
  const selectedOption = receipt.event ? selectedOptions[receipt.week] ?? (resolution?.optionId) : undefined
  const selectWeek = (next: number) => { setWeek(next); setClosingView(null); onWeekChange?.(next) }
  const staffName = (staffId: string) => data.staff.find((person) => person.id === staffId)?.name ?? staffId
  const itemOf = (projectId: string, key: string | null): WorkItem | undefined => {
    const project = data.projects.find((item) => item.id === projectId)
    if (project === undefined || key === null) return undefined
    return [...project.commonItems, ...project.episodes.flatMap((episode) => episode.workItems)].find((item) => item.key === key)
  }

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-week-focus="${focus}"]`)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'start' })
  }, [focus, week])

  return <div className="proto-screen">
    <div className="week-tabs" role="group" aria-label="周次快照">
      {data.receipts.map((item) => <button key={item.week} className={`week-tab${item.week === week ? ' is-active' : ''}`} onClick={() => selectWeek(item.week)} aria-pressed={item.week === week}>
        <span>第 {item.week} 周</span><span className={`tab-state tab-${item.state}`}>{weekStateNames[item.state]}</span>{item.event && <Flag size={13} aria-hidden="true" />}
      </button>)}
      <span className="week-note">静态快照，切换周次不会触发真实结算</span>
    </div>

    <section className="proto-focus-target" data-week-focus="receipt" tabIndex={-1} aria-label="周回报执定位">
      <div className={`state-banner ${resolution ? stateTones.normal : stateTones[receipt.state]}`} role="status">
        <p className="state-name">{resolution ? '事件已处理（原型）' : weekStateNames[receipt.state]}</p>
        <p className="state-note">{resolution ? '本快照的事件已按样本选项处理；没有写入真实游戏状态，也没有触发周推进。' : receipt.stateNote}</p>
        {receipt.rejected && <dl className="crisis-facts">
          <div><dt>回滚前现金</dt><dd>{yuan(receipt.rejected.cash)}</dd></div>
          <div><dt>下周刚性支出</dt><dd>{yuan(receipt.rejected.requiredNextWeek)}</dd></div>
          <div><dt>缺口</dt><dd className="cell-behind">{yuan(receipt.rejected.shortfall)}</dd></div>
          <div><dt>处理结果</dt><dd>事务已回滚</dd></div>
        </dl>}
      </div>

      {receipt.rejected && <Panel eyebrow="SETTLEMENT ROLLBACK / 结算回滚" title="预检失败后没有提交任何变化" marks={['confirmed']}
        note={receipt.rejected.reason}>
        <ul className="quiet-list"><li>周数不推进，项目工作量、质量、人员疲劳与士气均保持原值。</li><li>首版不提供限时危机周、紧急融资或负数现金。</li><li>调整承诺后重新预检；再次失败进入破产关闭流程。</li></ul>
      </Panel>}
    </section>

    {receipt.closing && <Panel eyebrow="CLOSING / 公司关闭" title="关闭中：只允许结清与总结" marks={['confirmed']}
      note={receipt.closing.reason === 'bankrupt' ? '刚性支出预检失败已触发结束流程。系统不会继续生产，也不会自动借款或追加投资。' : '公司主动进入结束流程，后续动作与破产关闭相同。'}>
      <dl className="proto-stats proto-stats-tight">
        <Stat strong label="公司现金" value={yuan(receipt.closing.cash)} hint="仍只有一个公司现金池" />
        <Stat label="待结清项目" value={`${receipt.closing.pendingProjectIds.length} 部`} hint="只有达到最低交付门槛的部分可关闭交付" />
        <Stat label="经营周" value="停止推进" hint="advance_week 不再接受操作" />
      </dl>
      <div className="closing-actions">
        <button disabled>推进本周</button><span>不可用：公司已进入结束流程。</span>
        <button className="button secondary" onClick={() => setClosingView('delivery')}>预览待交付结清</button>
        <button className="button secondary" onClick={() => setClosingView('summary')}>预览经营总结</button>
      </div>
      <div className="proto-two-col">
        <ul className="quiet-list">{receipt.closing.allowedActions.map((line) => <li key={line}>允许：{line}</li>)}</ul>
        <ul className="quiet-list">{receipt.closing.blockedActions.map((line) => <li key={line}>禁止：{line}</li>)}</ul>
      </div>
      {closingView === 'delivery' && <div className="closing-preview" role="region" aria-label="待交付结清预览">
        <h3 className="sub-heading">待交付结清（原型预览）</h3>
        <ul className="quiet-list">{receipt.closing.pendingProjectIds.map((id) => {
          const project = data.projects.find((item) => item.id === id)
          const ready = project?.episodes.filter((episode) => episode.status === 'min_delivered') ?? []
          return <li key={id}><strong>{project?.title ?? id}</strong>：{ready.length > 0 ? ready.map((episode) => `第 ${episode.index} 集可关闭交付`).join('、') : '没有达到门槛的单集，不能伪报完成'}</li>
        })}</ul>
      </div>}
      {closingView === 'summary' && <div className="closing-preview" role="region" aria-label="经营总结预览">
        <h3 className="sub-heading">经营总结（原型预览）</h3>
        <p>公司现金 {yuan(data.company.cash)} · 已交付作品 {data.history.length} 部 · 在制项目 {data.projects.length} 部。</p>
        <p className="proto-footnote">正式总结必须来自核心 calculate_result；这里只预览信息层级，不生成终局结果。</p>
      </div>}
    </Panel>}

    <Panel eyebrow={`WEEKLY REPORT / 第 ${receipt.week} 周公司周报`} title={receipt.headline} marks={['confirmed']}>
      <dl className="proto-stats">
        <Stat strong label="本周现金变化" value={signedYuan(receipt.cashDelta)} hint="全公司同一周统一结算，含所有在制项目" />
        <Stat label="有产出的项目" value={`${receipt.projectLines.length} 部`} hint={receipt.projectLines.length === 0 ? '本周没有提交项目推进' : `公司共 ${data.projects.length} 部在制`} />
        <Stat label="需要玩家决定" value={`${receipt.mustDecide.length} 项`} hint="其余变化不打断节奏" />
        <Stat label="状态明显变化的员工" value={`${receipt.staffLines.length} 人`} hint="疲劳与士气影响下周效率" />
      </dl>
      {receipt.costLines.length > 0 && <ul className="cost-lines">{receipt.costLines.map((line) => <li key={line.category}>
        <span className="cost-cat">{ledgerNames[line.category]}</span><span className="cost-label">{line.label}</span>
        <span className={line.amount < 0 ? 'cost-out' : 'cost-in'}>{signedYuan(line.amount)}</span>
      </li>)}</ul>}
    </Panel>

    <div className="proto-two-col">
      <Panel eyebrow="PRODUCTION / 本周各项目做了什么" title="产出与原因" marks={['confirmed', 'proposal']}
        note="一次推进，所有项目在同一事务中结算；玩家能理解结果从哪里来，但不能提前精确预知。">
        {receipt.projectLines.length === 0 ? <p className="proto-inline-note"><FileText size={16} aria-hidden="true" /> 本周没有项目产出：回滚周不生产，因此没有制作费计提，也没有半结算状态。</p> :
          <ul className="week-projects">{receipt.projectLines.map((line) => {
            const item = itemOf(line.projectId, line.itemKey)
            return <li key={`${line.projectId}-${line.itemKey}`}>
              <div className="week-project-head">
                <button className="link-button" onClick={() => onOpenProject(line.projectId)}>{line.title}</button>
                <span className="chip">{line.episodeIndex === null ? '公共制作' : `第 ${line.episodeIndex} 集`}</span>
                {line.stage && <span className="chip">{episodeStageShortNames[line.stage]}</span>}
                {item && <span className="chip chip-item">{item.name}</span>}
              </div>
              <p className="week-deltas">工作量 <strong>{signedPoint(line.workDelta)}</strong> · 质量 <strong>{signedPoint(line.qualityDelta)}</strong></p>
              <p className="week-detail">{line.detail}</p>
              <p className="week-reason">原因：{line.reason}</p>
            </li>
          })}</ul>}
        <ul className="people-list staff-changes">{receipt.staffLines.map((line) => <li key={line.staffId}>
          <div className="people-head"><strong>{staffName(line.staffId)}</strong><span>疲劳 {signedPoint(line.fatigueDelta)} · 士气 {signedPoint(line.moraleDelta)}</span></div>
          <p className="people-note">{line.note}</p>
        </li>)}</ul>
      </Panel>

      <div className="proto-stack">
        <section className="proto-focus-target" data-week-focus="decisions" tabIndex={-1} aria-label="必须决定定位">
        <Panel eyebrow="DECIDE / 必须决定" title={`本周真正需要玩家处理的 ${receipt.mustDecide.length} 件事`} marks={['confirmed', 'proposal']}
          note="只有这几类会打断玩家：核心人员重新分配、新增外包、新增花钱承诺、交付动作。持续方针与既有资源计划自动执行。">
          <div className="decide-list">{receipt.mustDecide.map((item) => {
            const target = item.projectId
            const pending = pendingDecisions[item.id]
            const record = decisionRecords[item.id]
            const selected = pending ?? record?.option
            return <fieldset className="decision-card" key={item.id}>
              <legend>{item.label}</legend>
              <div className="decide-head"><span className="decide-kind">{decisionKindNames[item.kind]}</span>{target !== null && <button className="link-button" onClick={() => onOpenProject(target)}>查看作品</button>}</div>
              <p className="decide-detail">{item.detail}</p>
              <div className="decision-options">{item.options.map((option, index) => <label key={option}>
                <input type="radio" name={`decision-${item.id}`} checked={selected === option} disabled={record !== undefined} onChange={() => setPendingDecisions((current) => ({ ...current, [item.id]: option }))} />
                <span>{option}</span><small>选项 {index + 1}</small>
              </label>)}</div>
              <div className="decision-record"><span>{record ? `已记录：${record.option}` : '仅记录原型选择，不扣除资源、不推进周次。'}</span><button className="button secondary" disabled={selected === undefined || record !== undefined} onClick={() => { if (selected !== undefined) onRecordDecision(item.id, selected) }}>{record ? '已记录（原型）' : '记录选择（原型）'}</button></div>
            </fieldset>
          })}</div>
        </Panel>
        </section>

        <Panel eyebrow="NO ACTION / 不用管的部分" title="自动执行与仅报告" marks={['confirmed']}>
          <h3 className="sub-heading">持续方针自动执行，未要求确认</h3>
          <ul className="quiet-list">{receipt.autoExecuted.map((line) => <li key={line}>{line}</li>)}</ul>
          <h3 className="sub-heading">仅报告，不产生操作</h3>
          <ul className="quiet-list">{receipt.reportOnly.map((line) => <li key={line}>{line}</li>)}</ul>
        </Panel>

        <section className="proto-focus-target" data-week-focus="next" tabIndex={-1} aria-label="下周关注定位">
          <Panel eyebrow="NEXT WEEK / 下周关注" title="最值得盯住的事" marks={['proposal']}>
            <ol className="focus-list">{receipt.nextFocus.map((line) => <li key={line}>{line}</li>)}</ol>
          </Panel>
        </section>
      </div>
    </div>

    <section className="proto-focus-target" data-week-focus="event" tabIndex={-1} aria-label="制作异常事件定位">
    {receipt.event ? <Panel eyebrow="EVENT / 制作异常" title={receipt.event.title}
      marks={['proposal']}
      aside={<p className="proto-since">{receipt.event.scope === 'project' ? `归属：${data.projects.find((project) => project.id === receipt.event?.projectId)?.title ?? '—'}` : '公司级'} · 需在 {receipt.event.deadlineWeek} 周前处理</p>}
      note={`${receipt.event.tier === 'major' ? '重大事件' : '普通事件'} —— ${receipt.event.description}`}>
      <ul className="signal-list">{receipt.event.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul>
      <div className="proto-table-wrap"><table className="proto-table event-options">
        <thead><tr><th>选择</th><th>选项</th><th>确定代价</th><th>可能收益</th><th>风险</th><th>适用判断</th></tr></thead>
        <tbody>{receipt.event.options.map((option) => <tr key={option.id} className={resolution?.optionId === option.id || selectedOption === option.id ? 'is-selected' : undefined}>
          <td><input type="radio" name={`event-${receipt.event?.id}`} value={option.id} checked={resolution ? resolution.optionId === option.id : selectedOption === option.id} disabled={resolution !== undefined} onChange={() => setSelectedOptions((current) => ({ ...current, [receipt.week]: option.id }))} aria-label={`选择${option.label}`} /></td>
          <th scope="row">{option.label}</th>
          <td>{option.cost === 0 ? '不额外支出' : yuan(option.cost)}</td>
          <td>{option.gain}</td>
          <td><RiskTag level={option.risk} label={riskNames[option.risk]} /><span className="cell-sub">{option.riskNote}</span></td>
          <td>{option.fits}</td>
        </tr>)}</tbody>
      </table></div>
      {resolution ? <div className="event-resolution" role="region" aria-label="事件处理结果">
        <p className="eyebrow">RESOLVED / 原型样本</p>
        <h3>{receipt.event.options.find((option) => option.id === resolution.optionId)?.label}</h3>
        <p>{resolution.outcome}</p>
        <p className="proto-footnote">这里只切换本地交互状态，用于评审信息层级；不会修改模拟数据、不会触发周推进，也不会写入存档。</p>
      </div> : <div className="event-confirm">
        <p>已选择：<strong>{receipt.event.options.find((option) => option.id === selectedOption)?.label ?? '尚未选择'}</strong></p>
        <button className="button primary" disabled={selectedOption === undefined} onClick={() => {
          if (selectedOption === undefined) return
          onResolveEvent(receipt.event!.id, { optionId: selectedOption, outcome: receipt.event!.outcomes[selectedOption] })
        }}>确认处理（原型）</button>
      </div>}
      <p className="proto-footnote">事件归属具体项目，多数周只显示回执；同时满足触发条件时按优先级与种子选择，不允许一周大量弹窗。</p>
    </Panel> : <Panel eyebrow="EVENT / 制作异常" title="本周没有需要处理的事件" marks={['confirmed']}>
      <p className="proto-inline-note"><FileText size={16} aria-hidden="true" /> 普通周只呈现经营回执，事件不追求每周填满。</p>
    </Panel>}
    </section>

    <p className="proto-legend">图示：<span>已确认＝框架与决策登记已定</span><span>设计建议＝框架裁定</span><span>待细化参数＝框架第 11 节</span><span>原型样本＝数值仅用于评审</span>
      <span className="legend-note">口径与《核心玩法重构框架》第 12 节一致：D1–D6 均已由负责人确认，界面不把它们重列为待决事项。</span></p>
  </div>
}
