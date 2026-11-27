import { useEffect, useMemo, useState } from 'react'
import { useGameStoreV4 } from '../stores/gameStoreV4'
import type { V4CooperationMode, V4PartnershipChannel } from '../types/gameV4'
import type { V4GameState, V4JsonObject, V4Project, V4WorkItem } from '../types/gameV4State'
import './V4Workbench.css'

const money = (value: number) => `¥${value.toLocaleString('zh-CN')}`
const number = (value: unknown) => Number(value ?? 0)
const text = (value: unknown, fallback = '—') => typeof value === 'string' && value ? value : fallback
const modeLabel = (mode: V4CooperationMode) => mode === 'committee' ? '委员会' : '承制'
const windowLabel: Record<V4PartnershipChannel, string> = {
  domestic_streaming: '国内流媒体', overseas: '海外', merchandise: '衍生品', music: '音乐', tv: '电视', bd_dvd: 'BD/DVD', publishing: '出版',
}
const abilityLabel: Record<string, string> = {
  planning: '企划', direction: '演出', drawing: '作画', animation: '动画', management: '管理', postproduction: '后期',
}
const workStatus: Record<string, string> = { producing: '制作中', delivering: '待结清', delivered: '已交付', aborted: '已中止' }

function itemsOf(work: V4Project): V4WorkItem[] {
  return [...work.common.items, ...work.episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))]
}
function progressOf(work: V4Project) {
  const items = itemsOf(work)
  const total = items.reduce((sum, item) => sum + item.work_total, 0)
  const done = items.reduce((sum, item) => sum + item.work_done, 0)
  return { total, done, percent: total ? Math.floor(done * 100 / total) : 0 }
}
export default function V4Workbench() {
  const store = useGameStoreV4()
  const { game, busy, error, notice, rulesWarning, saveConflict } = store
  const [tab, setTab] = useState<'market' | 'production' | 'committee' | 'ledger'>('market')
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null)
  const [mode, setMode] = useState<V4CooperationMode>('contract')
  const [percent, setPercent] = useState(50)
  const [partners, setPartners] = useState<string[]>([])
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(null)
  const [confirmClose, setConfirmClose] = useState(false)
  const [confirmLoad, setConfirmLoad] = useState(false)

  const selectedOffer = game?.market.slots.find((offer) => offer.id === selectedOfferId) ?? null
  const selectedWork = game?.works.find((work) => work.id === selectedWorkId) ?? game?.works[0] ?? null
  const candidatePartners = selectedOffer?.committee_candidates.filter((id): id is string => typeof id === 'string' && id.length > 0) ?? []

  useEffect(() => {
    if (!selectedWork && game?.works[0]) setSelectedWorkId(game.works[0].id)
    if (selectedWorkId && game && !game.works.some((work) => work.id === selectedWorkId)) setSelectedWorkId(game.works[0]?.id ?? null)
  }, [game, selectedWork, selectedWorkId])
  useEffect(() => {
    if (!selectedOffer) return
    setMode(selectedOffer.allowed_modes[0])
    setPartners(candidatePartners.slice(0, 2))
  }, [selectedOfferId])

  const ledgerTotal = game?.finance.entries.reduce((sum, entry) => sum + entry.amount, 0) ?? 0
  const reconciled = game ? game.finance.opening_funds + ledgerTotal === game.finance.balance : false

  async function start() {
    if (!selectedOffer || partners.length === 0 && mode === 'committee') return
    const success = await store.command('start_work', {
      offer_id: selectedOffer.id, mode, ...(mode === 'committee' ? { percent, committee_partner_ids: partners } : {}),
    })
    if (success) {
      setSelectedOfferId(null)
      setTab('production')
    }
  }

  function requestLoad() {
    if (game) setConfirmLoad(true)
    else void store.load()
  }

  async function replaceFromSave() {
    setConfirmLoad(false)
    await store.load()
  }

  if (!game) {
    return <main className="v4-shell v4-welcome">
      <header className="v4-masthead"><div><span className="v4-kicker">ANIME PRODUCTION COMMITTEE / RULES V4</span><h1>周制经营工作台</h1></div><span className="v4-seal">未开局</span></header>
      <section className="v4-welcome-grid" aria-labelledby="welcome-title">
        <div>
          <p className="v4-index">M3 × M4 / 本地真实核心</p>
          <h2 id="welcome-title">同时开两部，<br />把每一笔钱对上。</h2>
          <p className="v4-lead">从企划市场立项，竞争员工与供应商产能；每周推进制作、处理事件，交付后核对 Archive 与公司现金流水。</p>
          <div className="v4-welcome-actions">
            <button className="v4-button v4-primary" disabled={busy} onClick={() => store.start()}>{busy ? '正在初始化…' : '开始新经营'}</button>
            <button className="v4-button" disabled={busy} onClick={requestLoad}>{busy ? '正在读取…' : '读取本地存档'}</button>
          </div>
          <p className="v4-fineprint">所有数据保存在此浏览器。不会自动初始化、自动保存或访问网络。</p>
        </div>
        <ol className="v4-manifest">
          <li><span>01</span><div><strong>真实 WASM 驱动</strong><p>界面操作直接调用 C++ v4 核心，不使用样本数值。</p></div></li>
          <li><span>02</span><div><strong>公司现金只有一本账</strong><p>项目账用于归因；Balance 必须等于期初资金加全部流水。</p></div></li>
          <li><span>03</span><div><strong>边界尚未伪装成完成</strong><p>商业参数仍为占位规则，工程闭环不代表经济平衡验收。</p></div></li>
        </ol>
      </section>
      {(error || notice || rulesWarning) && <div className={`v4-feedback ${error ? 'v4-error' : ''}`} role={error ? 'alert' : 'status'}>{error ?? notice}{rulesWarning && !error ? ' 规则版本与当前核心不同，请谨慎继续。' : ''}</div>}
    </main>
  }

  const activeWorks = game.works.filter((work) => work.status === 'producing')
  const unviewedEvents = game.events.pending.filter((event) => !event.viewed).length
  const reserved: (V4JsonObject & { used: number })[] = game.suppliers.map((supplier) => ({
    ...supplier,
    used: game.contracts.filter((contract) => contract.status === 'active' && contract.supplier_id === supplier.id)
      .reduce((sum, contract) => sum + number(contract.weekly_cap), 0),
  }))

  return <main className="v4-shell">
    <header className="v4-masthead v4-running-head">
      <div><span className="v4-kicker">{game.company.name} / SEED {game.seed}</span><h1>周制经营工作台</h1></div>
      <div className="v4-head-actions">
        <span className="v4-status" data-testid="company-status">{game.company.status === 'running' ? '经营中' : game.company.status === 'closing' ? '关闭中' : '已结束'}</span>
        <button className="v4-text-button" disabled={busy} onClick={requestLoad}>读取存档</button>
        <button className="v4-button" disabled={busy} onClick={() => store.save()}>保存进度</button>
      </div>
    </header>

    <section className="v4-dashboard" aria-label="公司概览">
      <div className="v4-week"><span>当前周</span><strong data-testid="week">{String(game.company.week).padStart(3, '0')}</strong><small>/ 520</small></div>
      <div className="v4-metric"><span>公司现金</span><strong data-testid="balance">{money(game.finance.balance)}</strong><small className={reconciled ? '' : 'v4-error'}>{reconciled ? '流水对账一致' : '流水对账异常'}</small></div>
      <div className="v4-metric"><span>制作项目</span><strong>{activeWorks.length}</strong><small>累计交付 {game.archive.works.length} 部</small></div>
      <div className="v4-metric"><span>声望</span><strong>{game.company.reputation}</strong><small>市场热度 {Object.values(game.market.heat).map((heat) => heat.level).join(' / ') || '—'}</small></div>
      <div className="v4-week-control"><button className="v4-button v4-primary" data-testid="advance-week" disabled={busy || game.company.status !== 'running' || unviewedEvents > 0} onClick={() => store.command('advance_week')}>推进本周 <span aria-hidden="true">→</span></button><small>{unviewedEvents ? '请先在制作与外包中查看待办事件' : game.events.pending.length ? '已查看事件可继续推进，未处理事件将保留' : '人员周薪与外包在推进时结算'}</small></div>
    </section>

    <nav className="v4-tabs" aria-label="工作台分区">
      {([['market', '企划市场'], ['production', '制作与外包'], ['committee', '委员会与 Archive'], ['ledger', '公司账本']] as const).map(([id, label]) =>
        <button key={id} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}{id === 'production' && activeWorks.length > 0 ? <span>{activeWorks.length}</span> : null}{id === 'committee' && game.committees.some((entry) => entry.status === 'active') ? <span>委员会</span> : null}</button>)}
    </nav>

    {(error || notice || saveConflict) && <div className={`v4-feedback ${error ? 'v4-error' : ''}`} role={error ? 'alert' : 'status'}>
      <span>{error ?? notice}</span>
      {saveConflict && !busy ? <div className="v4-feedback-actions">{!error && <button className="v4-button" onClick={() => store.save(true)}>确认覆盖本地存档</button>}<button className="v4-text-button" onClick={store.cancelOverwrite}>取消覆盖</button></div> : null}
    </div>}
    {confirmLoad && <div className="v4-feedback" role="alert">
      <span>读取存档会替换当前经营进度；未保存的内容将丢失。</span>
      <div className="v4-feedback-actions"><button className="v4-button" disabled={busy} onClick={replaceFromSave}>确认读取并替换</button><button className="v4-text-button" disabled={busy} onClick={() => setConfirmLoad(false)}>取消读取</button></div>
    </div>}

    {tab === 'market' && <section className="v4-section" aria-labelledby="market-title">
      <div className="v4-section-title"><div><p className="v4-index">01 / INTAKE</p><h2 id="market-title">企划市场</h2></div><p>可同时承接多部作品；员工与供应商由全公司共享。</p></div>
      <div className="v4-offer-layout">
        <div className="v4-offer-list">{game.market.slots.length === 0 ? <p className="v4-empty">本周没有可接企划。推进周次以刷新市场。</p> : game.market.slots.map((offer) =>
          <article className={`v4-offer ${selectedOfferId === offer.id ? 'is-selected' : ''}`} key={offer.id}>
            <div><span className="v4-tag">{offer.offer_source_type === 'market' || offer.source === 'market' ? '市场企划' : offer.origin}</span><h3>{offer.name}</h3><p>{offer.genre} · {offer.episode_count} 集 · {offer.duration_weeks} 周</p></div>
            <dl><div><dt>合同预算</dt><dd>{money(offer.contract_budget)}</dd></div><div><dt>目标质量</dt><dd>{offer.target_quality}</dd></div><div><dt>到期</dt><dd>W{offer.expires_week}</dd></div></dl>
            <button className="v4-button" disabled={game.company.status !== 'running'} onClick={() => setSelectedOfferId(offer.id)}>审阅企划</button>
          </article>)}</div>
        <aside className="v4-intake-sheet" aria-label="立项审批单">
          {!selectedOffer ? <div className="v4-empty"><strong>立项审批单</strong><p>选择一份企划，确认合作模式与委员会成员。</p></div> : <>
            <div className="v4-sheet-heading"><span>立项审批 / {selectedOffer.id}</span><span className="v4-seal">待批</span></div>
            <h3>{selectedOffer.name}</h3>
            <p>{text(selectedOffer.style)} · 商业潜力 {selectedOffer.commercial_potential / 10}%</p>
            <label>合作模式<select value={mode} onChange={(event) => setMode(event.target.value as V4CooperationMode)}>{selectedOffer.allowed_modes.map((entry) => <option value={entry} key={entry}>{modeLabel(entry)}</option>)}</select></label>
            {mode === 'committee' ? <>
              <label>公司投资比例<select value={percent} onChange={(event) => setPercent(Number(event.target.value))}>{[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
              <fieldset><legend>委员会成员</legend>{game.partners.filter((partner) => candidatePartners.includes(text(partner.id))).map((partner) => <label className="v4-check" key={text(partner.id)}><input type="checkbox" checked={partners.includes(text(partner.id))} onChange={() => setPartners((current) => current.includes(text(partner.id)) ? current.filter((id) => id !== partner.id) : [...current, text(partner.id)])} />{text(partner.name)}<small>{Array.isArray(partner.channels) ? text(partner.channels[0]) : '—'}</small></label>)}</fieldset>
              <p className="v4-fineprint">总池为合同预算 × 2；本次现金支出 {money(selectedOffer.contract_budget * 2 * percent / 100)}，锁定期内定金按规则抵扣。</p>
            </> : <p className="v4-fineprint">承制不支付投资比例；合同预算在立项时入账，商业收入在交付时结算。</p>}
            <button className="v4-button v4-primary v4-full" disabled={busy || mode === 'committee' && partners.length === 0} onClick={start}>确认立项</button>
          </>}
        </aside>
      </div>
    </section>}

    {tab === 'production' && <section className="v4-section" aria-labelledby="production-title">
      <div className="v4-section-title"><div><p className="v4-index">02 / PRODUCTION</p><h2 id="production-title">制作与外包</h2></div><p>监督必须专属一个项目；外包签约即预付并占用供应商共享周产能。</p></div>
      {game.works.length === 0 ? <p className="v4-empty">还没有项目。先到企划市场立项。</p> : <div className="v4-work-tabs" role="tablist" aria-label="选择项目">{game.works.map((work) => <button role="tab" aria-selected={selectedWork?.id === work.id} key={work.id} onClick={() => setSelectedWorkId(work.id)}>{work.offer.name}<small>{workStatus[work.status] ?? work.status}</small></button>)}</div>}
      <RecruitmentPanel game={game} busy={busy} run={store.command} />
      {selectedWork && <ProjectPanel game={game} work={selectedWork} busy={busy} run={store.command} />}
      <SupplierPanel game={game} work={selectedWork} busy={busy} run={store.command} />
      <section className="v4-subsection" aria-labelledby="event-title">
        <div className="v4-subheading"><h3 id="event-title">待处理事件</h3><span>{game.events.pending.length} 项</span></div>
        {game.events.pending.length === 0 ? <p className="v4-empty">本周没有待决事件。</p> : game.events.pending.map((event) => {
          const unaffordable = event.options.length > 0 && event.options.every((option) => option.cost > game.finance.balance)
          return <article className="v4-event" key={`${event.work_id}.${event.event_id}`}>
            <div>
              <span className="v4-tag">{game.works.find((work) => work.id === event.work_id)?.offer.name}</span>
              <h4>{event.name}</h4>
              <p>触发于 W{event.triggered_week}{event.expires_week !== null ? ` · W${event.expires_week} 前处理` : ''} · {event.viewed ? '已查看' : '未查看'}</p>
              {!event.viewed && <button className="v4-button" disabled={busy || game.company.status !== 'running'} onClick={() => store.command('view_event', { work_id: event.work_id, event_id: event.event_id })}>查看事件</button>}
              {event.viewed && unaffordable && <p className="v4-fineprint">当前现金不足以支付任何选项；可继续推进，但未处理事件仍会保留。</p>}
            </div>
            <div className="v4-event-options">{event.options.map((option) => {
              const insufficient = option.cost > game.finance.balance
              return <button className="v4-button" key={option.id} disabled={busy || insufficient} onClick={() => store.command('resolve_event', { work_id: event.work_id, event_id: event.event_id, option_id: option.id })}>{option.label}<small>{insufficient ? '现金不足' : text(option.risk_hint, '无风险说明')}{option.cost ? ` · ${money(option.cost)}` : ''}</small></button>
            })}</div>
          </article>
        })}
      </section>
      <ClosingPanel game={game} busy={busy} run={store.command} confirmClose={confirmClose} setConfirmClose={setConfirmClose} />
    </section>}

    {tab === 'committee' && <section className="v4-section" aria-labelledby="archive-title">
      <div className="v4-section-title"><div><p className="v4-index">03 / PARTNERSHIP</p><h2 id="archive-title">委员会与 Archive</h2></div><p>最大余数法分配整数收益；渠道展示拆分不改变公司应收总额。</p></div>
      <div className="v4-committee-grid">{game.committees.length === 0 ? <p className="v4-empty">尚未组建委员会。</p> : game.committees.map((committee) => {
        const work = game.works.find((entry) => entry.id === committee.work_id) ?? game.archive.works.find((entry) => entry.id === committee.work_id)
        const members = Array.isArray(committee.members) ? committee.members as V4JsonObject[] : []
        return <article className="v4-committee" key={text(committee.id)}><div className="v4-subheading"><h3>{work ? ('offer' in work ? work.offer.name : work.name) : text(committee.work_id)}</h3><span>{text(committee.status)}</span></div><p>W{number(committee.formed_week)} 组建 · {text(committee.closed_week, '尚未关闭')}</p><ul>{members.map((member) => <li key={text(member.partner_id)}>{text(game.partners.find((partner) => partner.id === member.partner_id)?.name, text(member.partner_id))}<span>{windowLabel[member.channel as V4PartnershipChannel] ?? text(member.channel)}</span></li>)}</ul></article>
      })}</div>
      <div className="v4-archive-list">{game.archive.works.length === 0 ? <p className="v4-empty">交付后，作品报告、团队与逐渠道分账会归档在这里。</p> : [...game.archive.works].reverse().map((work) => <article className="v4-archive-card" key={work.id}>
        <header><div><span className="v4-tag">{modeLabel(work.mode)} · {work.source}</span><h3>{work.name}</h3></div><div className="v4-rating"><span>评级</span><strong>{work.rating}</strong></div></header>
        <dl><div><dt>结束周 / 原因</dt><dd>W{work.end_week} · {work.end_reason}</dd></div><div><dt>质量</dt><dd>{work.quality_score}</dd></div><div><dt>BD/DVD 公司净收</dt><dd>{money(work.bd_revenue)}</dd></div><div><dt>委员会池</dt><dd>{money(work.committee_pool)}</dd></div><div><dt>商业应收合计</dt><dd>{money(work.finance_summary.commercial_share)}</dd></div><div><dt>项目归因利润</dt><dd>{money(work.finance_summary.profit)}</dd></div></dl>
        <div className="v4-table-wrap"><table><caption>逐渠道结算对账</caption><thead><tr><th>渠道</th><th>总票房</th><th>净额</th><th>归属</th><th>公司实收</th></tr></thead><tbody>{work.channel_breakdown.map((channel) => <tr key={channel.window}><th>{windowLabel[channel.window]}</th><td>{money(channel.gross)}</td><td>{money(channel.net)}</td><td>{channel.owner === 'company' ? '公司' : '委员会池'}</td><td>{money(channel.company_received)}</td></tr>)}</tbody><tfoot><tr><th>合计</th><td>{money(work.commercial_revenue)}</td><td>{money(work.committee_pool + work.bd_revenue)}</td><td>—</td><td>{money(work.finance_summary.commercial_share)}</td></tr></tfoot></table></div>
        <p className="v4-fineprint">Archive 为公司应收归因，不另设项目现金池。团队：{work.team.map((member) => member.name).join('、') || '无'}。</p>
      </article>)}</div>
      {game.archive.company_result && <section className="v4-company-result"><p className="v4-index">FINAL REPORT</p><h3>{text(game.archive.company_result.reason)} · {game.archive.company_result.rating} 级</h3><p>经营 {game.archive.company_result.weeks} 周 · 完成 {game.archive.company_result.total_projects} 部 · 净现金变化 {money(game.archive.company_result.net_cash_change)}</p></section>}
    </section>}

    {tab === 'ledger' && <section className="v4-section" aria-labelledby="ledger-title">
      <div className="v4-section-title"><div><p className="v4-index">04 / RECONCILIATION</p><h2 id="ledger-title">公司账本</h2></div><p>按周追加的公司现金流水；项目字段仅用于归因。</p></div>
      <div className="v4-ledger-summary"><div><span>期初资金</span><strong>{money(game.finance.opening_funds)}</strong></div><span aria-hidden="true">＋</span><div><span>流水合计</span><strong>{money(ledgerTotal)}</strong></div><span aria-hidden="true">＝</span><div><span>当前现金</span><strong>{money(game.finance.balance)}</strong></div><b className={reconciled ? 'v4-ok' : 'v4-error'}>{reconciled ? '对账通过' : '对账失败'}</b></div>
      <div className="v4-supplier-strip">{reserved.map((supplier) => <div key={text(supplier.id)}><span>{text(supplier.name)}</span><strong>{supplier.used} / {number(supplier.capacity_per_week)}</strong><small>周产能预留</small></div>)}</div>
      <div className="v4-table-wrap"><table><caption>最近 80 笔公司现金流水</caption><thead><tr><th>周</th><th>类目</th><th>项目归因</th><th>对方</th><th>摘要</th><th>金额</th></tr></thead><tbody>{[...game.finance.entries].reverse().slice(0, 80).map((entry) => <tr key={entry.id}><th>W{entry.week}</th><td>{entry.category}</td><td>{entry.work_id ?? '公司'}</td><td>{entry.counterparty ?? '—'}</td><td>{entry.memo}</td><td className={entry.amount < 0 ? 'v4-negative' : 'v4-positive'}>{entry.amount > 0 ? '+' : ''}{money(entry.amount)}</td></tr>)}</tbody></table>{game.finance.entries.length === 0 && <p className="v4-empty">尚无现金流水。</p>}</div>
      <p className="v4-fineprint">未实现的固定前期成本与渠道管理费不会出现在账本中；不得将当前工程账本视为完整经济模型。</p>
    </section>}
    <footer className="v4-footer"><span>V4 / 本地 C++ + WASM</span><span>规则参数仍为 placeholder · 经济平衡未验收</span></footer>
  </main>
}

type Run = (method: Parameters<ReturnType<typeof useGameStoreV4.getState>['command']>[0], input?: Record<string, unknown>) => Promise<boolean>

function ProjectPanel({ game, work, busy, run }: { game: V4GameState; work: V4Project; busy: boolean; run: Run }) {
  const [confirmAbort, setConfirmAbort] = useState(false)
  const progress = progressOf(work)
  const gates = itemsOf(work).filter((item) => item.is_gate)
  const ready = gates.length > 0 && gates.every((item) => item.work_done * 1000 >= item.deliver_at * item.work_total)
  const changePlan = (patch: Partial<V4Project['plan']>) => run('set_work_plan', { work_id: work.id, plan: { ...work.plan, ...patch } })
  useEffect(() => setConfirmAbort(false), [work.id])
  return <article className="v4-project-panel">
    <header className="v4-project-heading"><div><span className="v4-tag">{modeLabel(work.mode)} · {work.id}</span><h3>{work.offer.name}</h3><p>W{work.opened_week} 开工 · W{work.deadline_week} 截止 · 监督 {game.staff.find((member) => member.id === work.supervisor_staff_id)?.name ?? '空缺'}</p></div><div className="v4-progress"><strong>{progress.percent}%</strong><span>{progress.done} / {progress.total} 工作点</span></div></header>
    <progress max={100} value={progress.percent} aria-label={`${work.offer.name} 制作进度`} />
    <div className="v4-plan-grid"><label>强度<select value={work.plan.intensity} disabled={busy || work.status !== 'producing'} onChange={(event) => changePlan({ intensity: event.target.value })}><option value="low">低</option><option value="standard">标准</option><option value="high">高</option></select></label><label>取向<select value={work.plan.focus} disabled={busy || work.status !== 'producing'} onChange={(event) => changePlan({ focus: event.target.value })}><option value="quality">质量</option><option value="schedule">进度</option><option value="cost">成本</option></select></label><label>外包方针<select value={work.plan.outsourcing} disabled={busy || work.status !== 'producing'} onChange={(event) => changePlan({ outsourcing: event.target.value })}><option value="none">不外包</option><option value="gap_fill">补缺</option><option value="aggressive">积极</option></select></label><label className="v4-check"><input type="checkbox" checked={work.plan.overtime} disabled={busy || work.status !== 'producing'} onChange={(event) => changePlan({ overtime: event.target.checked })} />允许加班</label></div>
    <div className="v4-project-columns"><section aria-labelledby={`staff-${work.id}`}><div className="v4-subheading"><h4 id={`staff-${work.id}`}>人员归属</h4><span>专属占用</span></div>{game.staff.map((member) => {
      const supervisor = work.supervisor_staff_id === member.id
      return <label className="v4-staff-row" key={member.id}><span><strong>{member.name}</strong><small>{member.role} · 疲劳 {member.fatigue} · {money(member.weekly_salary)}/周</small></span><select aria-label={`${member.name} 所属项目`} value={member.assignment_work_id ?? ''} disabled={busy || supervisor || work.status !== 'producing'} onChange={(event) => run('assign_staff', { staff_id: member.id, work_id: event.target.value || null })}><option value="">公司空闲</option>{game.works.filter((entry) => entry.status === 'producing').map((entry) => <option value={entry.id} key={entry.id}>{entry.offer.name}</option>)}</select>{supervisor && <small className="v4-fineprint">监督岗位需先补位才能调离</small>}</label>
    })}</section><section aria-labelledby={`items-${work.id}`}><div className="v4-subheading"><h4 id={`items-${work.id}`}>工作项</h4><span>{gates.filter((item) => item.work_done * 1000 >= item.deliver_at * item.work_total).length}/{gates.length} 门槛</span></div><div className="v4-item-list">{itemsOf(work).map((item) => <div key={item.id} className={item.is_gate ? 'is-gate' : ''}><span>{item.key}{item.is_gate ? ' / 门槛' : ''}<small>{abilityLabel[item.ability]} · {item.deliver_at / 10}% 交付阈值</small></span><strong>{item.work_done}/{item.work_total}</strong></div>)}</div></section></div>
    {work.status === 'producing' && <div className="v4-project-actions">
      <button className="v4-button v4-primary" disabled={busy || !ready || game.company.status !== 'running'} onClick={() => run('deliver_work', { work_id: work.id })}>交付作品<small>{ready ? '门槛已达成' : '仍有门槛未达成'}</small></button>
      <button className="v4-button v4-abort" disabled={busy || game.company.status !== 'running' || game.company.week > work.deadline_week} onClick={() => setConfirmAbort(true)}>中止项目</button>
    </div>}
    {confirmAbort && work.status === 'producing' && <div className="v4-danger v4-abort-confirm">
      <p>中止会立即结算退款、违约金与声望惩罚并写入 Archive；若结算导致现金不足，将进入破产终局。</p>
      <button className="v4-button" disabled={busy} onClick={async () => {
        const success = await run('abort_work', { work_id: work.id })
        if (success) setConfirmAbort(false)
      }}>确认中止</button>
      <button className="v4-text-button" disabled={busy} onClick={() => setConfirmAbort(false)}>取消中止</button>
    </div>}
  </article>
}

function RecruitmentPanel({ game, busy, run }: { game: V4GameState; busy: boolean; run: Run }) {
  const temporaryWork = game.works.find((work) => work.status === 'producing')
  return <section className="v4-subsection" aria-labelledby="recruit-title"><div className="v4-subheading"><h3 id="recruit-title">核心招聘</h3><button className="v4-text-button" disabled={busy || game.company.status !== 'running' || game.recruitment.last_scout_week === game.company.week} onClick={() => run('scout')}>本周招募</button></div>
    {game.recruitment.pool.length === 0 ? <p className="v4-empty">招聘池为空。每周可招募一次候选人。</p> : <div className="v4-recruit-list">{game.recruitment.pool.map((candidate) => <article key={candidate.staff.id}><div><strong>{candidate.staff.name}</strong><span>{candidate.staff.role} · {candidate.staff.talent_type}</span><small>主能力 {Math.max(...Object.values(candidate.staff.abilities))} · 签约费 {money(candidate.staff.signing_fee)}{candidate.expires_week !== null ? ` · W${candidate.expires_week} 到期` : ''}</small></div>{candidate.origin === 'temporary'
      ? <button className="v4-button" disabled={busy || !temporaryWork || game.company.status !== 'running'} onClick={() => run('hire_temporary', { work_id: temporaryWork?.id, candidate_id: candidate.staff.id })}>签约临时<small>{temporaryWork ? `加入 ${temporaryWork.offer.name}` : '需先在制项目'}</small></button>
      : <button className="v4-button" disabled={busy || game.company.status !== 'running' || candidate.staff.employment !== 'core'} onClick={() => run('hire_core', { staff_id: candidate.staff.id })}>签约核心</button>}</article>)}</div>}
    <p className="v4-fineprint">临时员工绑定首个在制项目，占用公司弹性工位；合同结束周随项目延期同步。</p>
  </section>
}

function SupplierPanel({ game, work, busy, run }: { game: V4GameState; work: V4Project | null; busy: boolean; run: Run }) {
  const items = useMemo(() => {
    if (!work) return []
    const all = new Map(itemsOf(work).map((item) => [item.id, item]))
    return [...all.values()].filter((item) => item.outsourceable && !item.is_gate && item.work_done < item.work_total && item.deps.every((id) => {
      const dependency = all.get(id)
      return dependency && dependency.work_done * 1000 >= dependency.deliver_at * dependency.work_total
    }))
  }, [work])
  const [itemId, setItemId] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [amount, setAmount] = useState(1)
  const [mode, setMode] = useState<'normal' | 'emergency'>('normal')
  const item = items.find((entry) => entry.id === itemId) ?? items[0]
  const suppliers = game.suppliers.filter((supplier) => number(supplier.unlocked_week) <= game.company.week)
  const supplier = suppliers.find((entry) => entry.id === supplierId && (entry.specialties as string[] ?? []).includes(item?.ability)) ?? suppliers.find((entry) => (entry.specialties as string[] ?? []).includes(item?.ability))
  useEffect(() => {
    setItemId(items[0]?.id ?? '')
    setSupplierId('')
    setAmount(1)
  }, [work?.id])
  const reserved = game.contracts.filter((contract) => contract.status === 'active' && contract.supplier_id === supplier?.id).reduce((sum, contract) => sum + number(contract.weekly_cap), 0)
  const room = item ? item.work_total - item.work_done - game.contracts.filter((contract) => contract.status === 'active' && contract.item_id === item.id).reduce((sum, contract) => sum + number(contract.work_total) - number(contract.work_done), 0) : 0
  const capacity = supplier ? number(supplier.capacity_per_week) - reserved : 0
  const fee = supplier && amount > 0 ? Math.floor(amount * number(supplier.price_per_unit) * (mode === 'emergency' ? 1.4 : 1)) : 0
  if (!work || work.status !== 'producing') return null
  return <section className="v4-subsection" aria-labelledby="outsource-title"><div className="v4-section-title"><div><p className="v4-index">SHARED CAPACITY</p><h3 id="outsource-title">外包签约</h3></div><p>签约时全额预付；正常与加急共用供应商周产能。</p></div>
    <form className="v4-outsource-form" onSubmit={(event) => { event.preventDefault(); if (item && supplier) run('sign_outsourcing', { work_id: work.id, item_id: item.id, supplier_id: supplier.id, work_total: amount, mode }) }}>
      <label>工作项<select value={item?.id ?? ''} onChange={(event) => { setItemId(event.target.value); setSupplierId('') }}>{items.map((entry) => <option key={entry.id} value={entry.id}>{entry.id} · {abilityLabel[entry.ability]} · 余 {entry.work_total - entry.work_done}</option>)}</select></label>
      <label>供应商<select value={text(supplier?.id, '')} onChange={(event) => setSupplierId(event.target.value)}>{suppliers.filter((entry) => (entry.specialties as string[] ?? []).includes(item?.ability)).map((entry) => <option key={text(entry.id)} value={text(entry.id)}>{text(entry.name)} · 余 {number(entry.capacity_per_week) - game.contracts.filter((contract) => contract.status === 'active' && contract.supplier_id === entry.id).reduce((sum, contract) => sum + number(contract.weekly_cap), 0)}</option>)}</select></label>
      <label>工作量<input type="number" min={1} max={Math.max(1, Math.min(room, capacity))} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
      <label>模式<select value={mode} onChange={(event) => setMode(event.target.value as 'normal' | 'emergency')}><option value="normal">正常</option><option value="emergency">加急 ×1.4</option></select></label>
      <div className="v4-quote"><span>预付报价</span><strong>{money(fee)}</strong><small>可用产能 {capacity}</small></div>
      <button className="v4-button v4-primary" disabled={busy || !item || !supplier || amount < 1 || amount > Math.min(room, capacity) || fee > game.finance.balance}>签约并预留产能</button>
    </form>
    <div className="v4-contract-list">{game.contracts.filter((contract) => contract.status === 'active').map((contract) => <div key={text(contract.id)}><strong>{text(game.suppliers.find((supplier) => supplier.id === contract.supplier_id)?.name)}</strong><span>{text(game.works.find((entry) => entry.id === contract.work_id)?.offer.name)} · {text(contract.item_id)}</span><span>{number(contract.work_done)}/{number(contract.work_total)} · 周预留 {number(contract.weekly_cap)}</span></div>)}</div>
  </section>
}

function ClosingPanel({ game, busy, run, confirmClose, setConfirmClose }: { game: V4GameState; busy: boolean; run: Run; confirmClose: boolean; setConfirmClose: (value: boolean) => void }) {
  return <section className="v4-subsection" aria-labelledby="closing-title"><div className="v4-subheading"><h3 id="closing-title">交付与终局</h3><span>{game.company.status}</span></div>
    {game.company.status === 'running' && (confirmClose ? <div className="v4-danger"><p>关闭后不能再制作，所有未交付项目将进入结清流程。</p><button className="v4-button" disabled={busy} onClick={() => { run('end_company'); setConfirmClose(false) }}>确认结束经营</button><button className="v4-text-button" onClick={() => setConfirmClose(false)}>继续经营</button></div> : <button className="v4-text-button" disabled={busy || game.events.pending.length > 0} onClick={() => setConfirmClose(true)}>结束公司经营</button>)}
    {game.works.filter((work) => work.status === 'delivering').map((work) => <div className="v4-delivery-row" key={work.id}><span>{work.offer.name} · 待结清</span><button className="v4-button" disabled={busy} onClick={() => run('finalize_delivery', { work_id: work.id })}>结清交付</button></div>)}
    {game.company.status === 'ended' && !game.archive.company_result && <button className="v4-button v4-primary" disabled={busy} onClick={() => run('finalize_company')}>生成经营总结</button>}
  </section>
}
