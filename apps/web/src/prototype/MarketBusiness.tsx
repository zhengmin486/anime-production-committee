import { useState } from 'react'
import { channelNames, deliveredEpisodes, heatNames, modeNames, offerOriginNames, projectCompletion, scaleNames, sourceNames } from './model'
import type { Project, PrototypeData } from './model'
import { Bar, Panel, Stat, signedYuan, yuan } from './bits'
import { FinanceArchive } from './FinanceArchive'

const projectStatusNames: Record<Project['status'], string> = {
  producing: '制作与发行准备中',
  ready_to_deliver: '可进入发行交付',
  wrapping: '收尾与结算中',
}

export function MarketOffers({ data }: { data: PrototypeData }) {
  const [selectedId, setSelectedId] = useState(data.marketOffers[0].id)
  const selected = data.marketOffers.find((offer) => offer.id === selectedId) ?? data.marketOffers[0]

  return <div className="proto-screen">
    <Panel eyebrow="OPPORTUNITY / 企划承接" title="市场企划与合作机会" marks={['confirmed', 'sample']}
      note="业务公告板与接待柜台共用这份企划信息。静态原型只展示承接条件，不创建新项目、不扣现金，也不推进周次。">
      <div className="market-offer-workspace">
        <div className="market-offer-selector" role="group" aria-label="企划列表">
          {data.marketOffers.map((offer) => <button key={offer.id} className={offer.id === selected.id ? 'is-active' : ''} aria-pressed={offer.id === selected.id} onClick={() => setSelectedId(offer.id)}>
            <span><strong>{offer.title}</strong><small>{offerOriginNames[offer.origin]} · {scaleNames[offer.scale]}</small></span>
            <b>{yuan(offer.budget)}</b>
          </button>)}
        </div>
        <article className="market-offer-detail" aria-live="polite" aria-label={`${selected.title}企划详情`}>
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
          </dl>
          <button className="button primary" disabled>承接企划（原型）</button>
          <p className="proto-footnote">承接动作属于正式经营流程；本场景不新增独立市场模拟机制。</p>
        </article>
      </div>
    </Panel>

    <Panel eyebrow="RELATIONSHIP / 合作" title="长期合作关系" marks={['confirmed', 'sample']}
      note="合作机会与既有关系一起展示，避免把公告板做成单独的市场系统。">
      <ul className="relation-list">{data.relationships.map((item) => <li key={item.id}>
        <div className="relation-head"><strong>{item.name}</strong><span>{item.kind === 'studio' ? '制作伙伴' : channelNames[item.kind]} · 自第 {item.since} 周</span></div>
        <Bar value={item.strength} tone={item.strength >= 60 ? 'lead' : 'behind'} />
        <p>{item.note}</p>
      </li>)}</ul>
    </Panel>
  </div>
}

export function ReleaseStatus({ data, onOpen }: { data: PrototypeData; onOpen: (projectId: string) => void }) {
  return <div className="proto-screen">
    <Panel eyebrow="RELEASE / 作品发行" title="作品发行情况与观众反馈" marks={['confirmed', 'sample']}
      note="发行显示屏汇总现有制作与交付数据；不在这里新增发行数值或自动结算。">
      <div className="portfolio-grid">{data.projects.map((project) => {
        const completion = projectCompletion(project)
        return <article className="portfolio-card" key={project.id}>
          <p className="eyebrow">{scaleNames[project.scale]} · {modeNames[project.mode]}</p>
          <h3>{project.title}</h3>
          <span className="chip">{projectStatusNames[project.status]}</span>
          <Bar value={completion} tone="neutral" />
          <dl className="portfolio-facts">
            <div><dt>完成度</dt><dd>{completion}%</dd></div>
            <div><dt>已交付单集</dt><dd>{deliveredEpisodes(project)} / {project.episodeCount} 集</dd></div>
            <div><dt>截止周</dt><dd>第 {project.deadlineWeek} 周</dd></div>
            <div><dt>商业预估</dt><dd>{project.account.projectedCommercial}</dd></div>
          </dl>
          <button className="button secondary" onClick={() => onOpen(project.id)}>查看作品详情</button>
        </article>
      })}</div>
    </Panel>

    <Panel eyebrow="AUDIENCE / 已发行作品" title="观众与商业反馈" marks={['sample']}
      note="只使用已经交付作品的历史质量与商业表现，不生成新的观众评分。">
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
    <Panel eyebrow="PORTFOLIO / 作品展示墙" title="公司已制作的作品" marks={['confirmed', 'sample']}
      note="展示墙只收录已经交付的作品；在制项目保留在发行显示屏中。">
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
    <Panel eyebrow="PERFORMANCE / 业绩看板" title="收入、声望与历史成绩" marks={['confirmed', 'sample']}
      note="业绩看板复用公司现金、流水和历史交付数据，不建立第二套市场账本。">
      <dl className="proto-stats proto-stats-tight">
        <Stat strong label="当前公司现金" value={yuan(data.company.cash)} hint="唯一现金池" />
        <Stat label="公司声望" value={String(data.company.reputation)} hint="来自既有经营样本" />
        <Stat label="历史经营利润" value={signedYuan(historyProfit)} hint={`${data.history.length} 部已交付作品`} />
        <Stat label="样本流水流入" value={signedYuan(ledgerInflow)} />
        <Stat label="样本流水流出" value={signedYuan(ledgerOutflow)} />
      </dl>
    </Panel>
    <FinanceArchive data={data} />
  </div>
}
