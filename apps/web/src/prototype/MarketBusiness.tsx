import { useEffect, useState } from 'react'
import { channelNames, heatNames, modeNames, offerOriginNames, scaleNames, sourceNames } from './model'
import type { Mode, Project, PrototypeData, Scale } from './model'
import { Bar, Panel, Stat, signedYuan, yuan } from './bits'
import { FinanceArchive } from './FinanceArchive'
import type { V4GameState } from './v4Types'
import { createCustomOfferV4, lockOfferV4, proposalActionV4, startWorkV4 } from '../services/gameV4'

type Execute = (command: () => Promise<{ state: V4GameState }>) => Promise<boolean>

const projectStatusNames: Record<Project['status'], string> = {
  producing: '制作与发行准备中',
  ready_to_deliver: '可进入发行交付',
  wrapping: '收尾与结算中',
}

export function MarketOffers({ data, state, selectedId, onSelect, busy, execute }: {
  data: PrototypeData
  state: V4GameState
  selectedId: string
  onSelect: (id: string) => void
  busy: boolean
  execute: Execute
}) {
  const selected = data.marketOffers.find((offer) => offer.id === selectedId) ?? data.marketOffers[0]
  const [mode, setMode] = useState<Mode>(selected?.allowedModes[0] ?? 'contract')
  const [percent, setPercent] = useState(10)
  const [partners, setPartners] = useState<string[]>([])
  const [name, setName] = useState('')
  const [source, setSource] = useState<'original' | 'manga' | 'light_novel' | 'game'>('original')
  const [scale, setScale] = useState<Scale>('tv')
  const [style, setStyle] = useState<'normal' | 'meme' | 'ai'>('normal')

  useEffect(() => {
    if (!selected) return
    setMode(selected.allowedModes[0] ?? 'contract')
    setPartners([])
    setPercent(10)
  }, [selected?.id])

  const start = () => selected ? execute(() => startWorkV4(state, selected.id, mode, mode === 'committee' ? percent : 0, partners)) : Promise.resolve(false)
  const lock = () => selected ? execute(() => lockOfferV4(state, selected.id)) : Promise.resolve(false)
  const closed = state.company.status !== 'running'
  const blocked = selected?.blockedBy != null
  const draftUnavailable = selected?.origin === 'self_original' && selected.allowedModes.includes('committee') && selected.committeeCandidates.length === 0
  const proposal = state.market.proposal
  const depositRate = selected?.offerSourceType === 'ip_visit' ? 100 : 50
  const depositPreview = Math.floor((selected?.depositBasis ?? 0) * depositRate / 1000)
  const lockActive = selected?.lockedUntil != null && state.company.week < selected.lockedUntil
  const lockUnavailable = !selected || selected.origin === 'self_original' || selected.lockUsed === true || state.company.week >= (selected.expiresWeek ?? Number.POSITIVE_INFINITY)

  return <div className="proto-screen">
    <Panel eyebrow="OPPORTUNITY / 企划承接" title="市场企划与合作机会" marks={['confirmed']}
      note="锁定调用核心 lock_offer，承接调用核心 start_work；只有核心成功后才扣款、消费企划、入账、立项并自动指定监督。">
      <div className="market-offer-workspace">
        <div className="market-offer-selector" role="group" aria-label="企划列表">
          {data.marketOffers.map((offer) => <button key={offer.id} className={offer.id === selected?.id ? 'is-active' : ''} aria-pressed={offer.id === selected?.id} onClick={() => onSelect(offer.id)}>
            <span><strong>{offer.title}</strong><small>{offerOriginNames[offer.origin]} · {scaleNames[offer.scale]}</small></span>
            <b>{yuan(offer.budget)}</b>
          </button>)}
          {data.marketOffers.length === 0 && <p className="proto-inline-note">当前没有可承接企划。</p>}
        </div>
        {selected && <article className="market-offer-detail" aria-live="polite" aria-label={`${selected.title}企划详情`}>
          <p className="eyebrow">{offerOriginNames[selected.origin]} · {sourceNames[selected.source]}</p>
          <h3>{selected.title}</h3>
          <p>{selected.hook}</p>
          <dl className="portfolio-facts">
            <div><dt>预算</dt><dd>{yuan(selected.budget)}</dd></div>
            <div><dt>周期</dt><dd>{selected.durationWeeks} 周</dd></div>
            <div><dt>规模</dt><dd>{scaleNames[selected.scale]}</dd></div>
            <div><dt>市场热度</dt><dd>{heatNames[selected.heat]}</dd></div>
            <div><dt>声望门槛</dt><dd>{selected.minReputation}</dd></div>
            <div><dt>当前条件</dt><dd>{selected.blockedBy ?? '可进入承接评估'}</dd></div>
            <div><dt>自然失效</dt><dd>第 {selected.expiresWeek ?? '—'} 周</dd></div>
            <div><dt>定金锁定</dt><dd>{lockActive ? `已锁定至第 ${selected.lockedUntil} 周` : selected.lockUsed ? '本次企划已使用过锁定' : `未锁定 · 预估定金 ${yuan(depositPreview)}`}</dd></div>
          </dl>
          <div className="filter-chips" role="group" aria-label="合作模式">
            {selected.allowedModes.map((item) => <button key={item} className={mode === item ? 'is-active' : ''} aria-pressed={mode === item} onClick={() => { setMode(item); setPartners([]) }}>{modeNames[item]}</button>)}
          </div>
          {mode === 'committee' && <div className="closing-preview">
            <h3 className="sub-heading">委员会参数</h3>
            <label>公司投资比例<select value={percent} onChange={(event) => setPercent(Number(event.target.value))} disabled={busy || closed}>{[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}</select></label>
            <p>投资基数为合同预算的两倍，本次需支付 {yuan(Math.round(selected.budget * 2 * percent / 100))}。</p>
            <fieldset disabled={busy || closed}><legend>至少选择一名伙伴</legend>{selected.committeeCandidates.map((id) => {
              const partner = state.partners.find((item) => item.id === id)
              return <label key={id}><input type="checkbox" checked={partners.includes(id)} onChange={(event) => setPartners((current) => event.target.checked ? [...current, id] : current.filter((item) => item !== id))} />{partner?.name ?? id} · {partner?.channels.map((channel) => channelNames[channel]).join('/')}</label>
            })}</fieldset>
          </div>}
          <div className="closing-actions">
            <button className="button secondary" disabled={busy || closed || lockUnavailable || state.events.pending.length > 0} onClick={lock}>{busy ? '核心处理中…' : lockActive ? '企划已锁定' : '锁定企划（核心）'}</button>
            <button className="button primary" disabled={busy || closed || blocked || draftUnavailable || (mode === 'committee' && partners.length === 0)} onClick={start}>{busy ? '核心处理中…' : '承接企划（核心）'}</button>
          </div>
          <p className="disabled-reason">{closed ? '不可用：公司已关闭或结束。' : state.events.pending.length > 0 ? '不可用：有待处理事件时，核心不允许锁定企划。' : lockUnavailable ? '不可用：原创草稿、已过期或已使用过锁定的企划不能重复锁定。' : blocked ? `不可用：${selected.blockedBy}。` : draftUnavailable ? '不可用：核心原创草稿未提供委员会候选成员，承接路径尚未开放。' : mode === 'committee' && partners.length === 0 ? '不可用：委员会至少需要一名伙伴。' : '核心将校验声望、履历、蓝图、投资与监督人选，并原子提交立项。'}</p>
          <p className="proto-footnote">锁定调用核心 lock_offer：支付定金并保护两周，定金到期不退。承制模式不抵扣；委员会模式在锁定期内由核心按规则抵扣本次应付投资额。承接是明确玩家操作，不会自动立项或自动分配其他员工。</p>
        </article>}
      </div>
    </Panel>

    <Panel eyebrow="ORIGINAL / 原创企划" title="创建原创草稿" marks={['confirmed']}
      note="核心要求声望达到 120；创建命令只保存草稿，不直接立项。当前草稿未提供委员会候选，无法承接；开发费尚未冻结，核心记为 0。">
      <div className="closing-preview">
        <label>企划名<input value={name} maxLength={40} onChange={(event) => setName(event.target.value)} /></label>
        <label>原作来源<select value={source} onChange={(event) => setSource(event.target.value as typeof source)}>{(['original', 'manga', 'light_novel', 'game'] as const).map((item) => <option key={item} value={item}>{sourceNames[item]}</option>)}</select></label>
        <label>作品规模<select value={scale} onChange={(event) => setScale(event.target.value as Scale)}>{(['short', 'ova', 'tv', 'movie'] as const).map((item) => <option key={item} value={item}>{scaleNames[item]}</option>)}</select></label>
        <label>表现风格<select value={style} onChange={(event) => setStyle(event.target.value as typeof style)}><option value="normal">常规</option><option value="meme"> meme </option><option value="ai">AI</option></select></label>
        <button className="button secondary" disabled={busy || closed || !name.trim() || state.market.custom_offer !== null} onClick={() => execute(() => createCustomOfferV4(state, name.trim(), source, scale, style))}>创建草稿（核心）</button>
        {state.market.custom_offer && <p>草稿“{state.market.custom_offer.name}”已存在；同一时间只能持有一份原创草稿。</p>}
      </div>
    </Panel>

    {proposal && <Panel eyebrow="PROPOSAL / 外部提案" title={proposal.name} marks={['confirmed']}
      note="提案生成尚未开放；采纳只生成草稿。若核心未给委员会候选，草稿仍不能承接。">
      <button className="button primary" disabled={busy || closed || state.market.custom_offer !== null} onClick={() => execute(() => proposalActionV4('adopt_proposal', state))}>采纳为草稿（核心）</button>
      <button className="button secondary" disabled={busy || closed} onClick={() => execute(() => proposalActionV4('reject_proposal', state))}>拒绝提案（核心）</button>
    </Panel>}

    <Panel eyebrow="RELATIONSHIP / 合作" title="长期合作关系" marks={['confirmed']}
      note="伙伴资料来自核心状态；委员会可选成员由具体企划限定。">
      <ul className="relation-list">{data.relationships.map((item) => <li key={item.id}>
        <div className="relation-head"><strong>{item.name}</strong><span>{channelNames[item.kind === 'studio' ? 'tv' : item.kind]} · 自第 {item.since} 周</span></div>
        <Bar value={item.strength} tone={item.strength >= 60 ? 'lead' : 'behind'} />
        <p>{item.note}</p>
      </li>)}</ul>
    </Panel>
  </div>
}

export function ReleaseStatus({ data, onOpen }: { data: PrototypeData; onOpen: (projectId: string) => void }) {
  const [filter, setFilter] = useState<'all' | 'producing' | 'delivered'>('all')
  const archived = new Set(data.history.map((work) => work.id))
  const projects = filter === 'delivered' ? [] : data.projects.filter((project) => !archived.has(project.id))
  const history = filter === 'producing' ? [] : data.history
  return <div className="proto-screen">
    <Panel eyebrow="RELEASE / 作品发行" title="作品发行情况与观众反馈" marks={['confirmed']}
      note="发行显示屏汇总核心在制与 Archive 数据；v4 以整部作品交付，不提供单集独立交付。">
      <div className="filter-chips" role="group" aria-label="发行作品筛选">
        {([['all', '全部作品'], ['producing', '在制与待交付'], ['delivered', '已归档作品']] as const).map(([value, label]) => <button key={value} className={filter === value ? 'is-active' : ''} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>)}
      </div>
      <div className="portfolio-grid">{projects.map((project) => {
        const completion = project.completion
        return <article className="portfolio-card" key={project.id}>
          <p className="eyebrow">{scaleNames[project.scale]} · {modeNames[project.mode]}</p>
          <h3>{project.title}</h3>
          <span className="chip">{projectStatusNames[project.status]}</span>
          <Bar value={completion} tone="neutral" />
          <dl className="portfolio-facts">
            <div><dt>完成度</dt><dd>{completion}%</dd></div>
            <div><dt>交付单位</dt><dd>整部作品 · {project.episodeCount} 集</dd></div>
            <div><dt>截止周</dt><dd>第 {project.deadlineWeek} 周</dd></div>
            <div><dt>商业预估</dt><dd>{project.account.projectedCommercial}</dd></div>
          </dl>
          <button className="button secondary" onClick={() => onOpen(project.id)}>查看作品详情</button>
        </article>
      })}{history.map((work) => <article className="portfolio-card" key={work.id}>
        <p className="eyebrow">{sourceNames[work.source]} · {scaleNames[work.scale]}</p>
        <h3>{work.title}</h3><span className="chip">已归档 · 评级 {work.rating}</span>
        <Bar value={work.quality} tone="lead" />
        <dl className="portfolio-facts">
          <div><dt>核心质量</dt><dd>{work.quality}</dd></div>
          <div><dt>商业收入</dt><dd>{yuan(work.commercial)}</dd></div>
          <div><dt>经营利润</dt><dd className={work.profit < 0 ? 'cell-behind' : 'cell-ahead'}>{signedYuan(work.profit)}</dd></div>
          <div><dt>交付周</dt><dd>第 {work.endWeek} 周</dd></div>
        </dl><p>{work.note}</p>
      </article>)}</div>
      {projects.length + history.length === 0 && <p className="proto-inline-note">当前筛选下没有作品。</p>}
    </Panel>

    <Panel eyebrow="AUDIENCE / 已发行作品" title="观众与商业反馈" marks={['confirmed']}
      note="只使用已经交付作品的核心历史质量与商业表现，不生成新的观众评分。">
      {data.history.length === 0 && <p className="proto-inline-note">尚未有交付归档，暂无观众与商业反馈。</p>}
      <ul className="archive-list">{data.history.map((work) => <li key={work.id}>
        <div className="archive-head"><h3>{work.title}</h3><span className="archive-rating">评级 {work.rating}</span></div>
        <p className="archive-meta">{scaleNames[work.scale]} · 第 {work.endWeek} 周交付</p>
        <dl className="portfolio-facts">
          <div><dt>质量</dt><dd>{work.quality}</dd></div>
          <div><dt>商业表现</dt><dd>{work.commercial}</dd></div>
        </dl>
        <p>{work.note}</p>
      </li>)}</ul>
    </Panel>
  </div>
}

export function MarketArchive({ data }: { data: PrototypeData }) {
  return <div className="proto-screen">
    <Panel eyebrow="PORTFOLIO / 作品展示墙" title="公司已制作的作品" marks={['confirmed']}
      note="展示墙只收录核心 Archive 中已经交付的作品；在制项目保留在发行显示屏中。">
      {data.history.length === 0 && <p className="proto-inline-note">Archive 尚为空；完成整部作品交付后会在这里生成真实记录。</p>}
      <ul className="archive-list">{data.history.map((work) => <li key={work.id}>
        <div className="archive-head"><h3>{work.title}</h3><span className="archive-rating">评级 {work.rating}</span></div>
        <p className="archive-meta">{sourceNames[work.source]} · {scaleNames[work.scale]} · 第 {work.endWeek} 周交付</p>
        <dl className="portfolio-facts">
          <div><dt>质量</dt><dd>{work.quality}</dd></div>
          <div><dt>商业表现</dt><dd>{work.commercial}</dd></div>
          <div><dt>经营利润</dt><dd className={work.profit < 0 ? 'cell-behind' : 'cell-ahead'}>{signedYuan(work.profit)}</dd></div>
        </dl>
        <p>{work.note}</p>
      </li>)}</ul>
    </Panel>
  </div>
}

export function MarketPerformance({ data }: { data: PrototypeData }) {
  const historyProfit = data.history.reduce((sum, work) => sum + work.profit, 0)
  const ledgerInflow = data.ledger.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)
  const ledgerOutflow = data.ledger.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)

  return <div className="proto-screen">
    <Panel eyebrow="PERFORMANCE / 业绩看板" title="收入、声望与历史成绩" marks={['confirmed']}
      note="业绩看板复用公司现金、核心流水和历史交付数据，不建立第二套市场账本。">
      <dl className="proto-stats proto-stats-tight">
        <Stat strong label="当前公司现金" value={yuan(data.company.cash)} hint="唯一现金池" />
        <Stat label="公司声望" value={String(data.company.reputation)} hint="来自核心经营状态" />
        <Stat label="历史经营利润" value={signedYuan(historyProfit)} hint={`${data.history.length} 部已交付作品`} />
        <Stat label="核心流水流入" value={signedYuan(ledgerInflow)} />
        <Stat label="核心流水流出" value={signedYuan(ledgerOutflow)} />
      </dl>
    </Panel>
    <FinanceArchive data={data} />
  </div>
}
