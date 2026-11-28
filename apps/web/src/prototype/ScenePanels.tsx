import { ArrowRight, Flag, Handshake, Megaphone, ShieldCheck } from 'lucide-react'
import { channelNames, heatNames, modeNames, offerOriginNames, scaleNames, weekStateNames } from './model'
import type { PrototypeData, WeeklyReceipt } from './model'
import { Bar, Panel, RiskTag, yuan } from './bits'

export function MeetingPanels({ data, receipt, onOpenWeekly }: { data: PrototypeData; receipt: WeeklyReceipt; onOpenWeekly: () => void }) {
  return <div className="proto-screen scene-detail-panels">
    <Panel eyebrow="MEETING / 待决事项" title={receipt.event ? receipt.event.title : '本周没有需要处理的事件'} marks={['confirmed', 'proposal']}
      aside={<span className={`meeting-state state-${receipt.state}`}>{weekStateNames[receipt.state]}</span>}
      note={receipt.event ? `${receipt.event.description} 需要在第 ${receipt.event.deadlineWeek} 周前确认；未处理时不能推进时间。` : '普通周只呈现回执。会议室入口始终可见，事件与 M4 合作功能互不阻塞。'}>
      {receipt.event ? <>
        <div className="event-preview-grid"><div><p className="eyebrow">事件预兆</p><ul className="signal-list">{receipt.event.signals.map((signal) => <li key={signal}>{signal}</li>)}</ul></div>
          <div><p className="eyebrow">可作出的选择</p><ul className="meeting-options">{receipt.event.options.map((option) => <li key={option.id}><strong>{option.label}</strong><span>{option.cost === 0 ? '不额外支出' : yuan(option.cost)} · {option.gain}</span><RiskTag level={option.risk} /></li>)}</ul></div></div>
        <button className="button primary" onClick={onOpenWeekly}><Flag size={15} />进入事件确认</button>
      </> : <div className="calm-meeting"><ShieldCheck size={28} /><div><strong>方针照常执行，不必逐项确认</strong><p>只有人员重新分配、新增外包、新增花钱承诺与交付动作会打断玩家。</p></div></div>}
    </Panel>

    <Panel eyebrow="COMMITTEE / 单部作品内合作" title="制作委员会与发行窗口" marks={['proposal', 'sample']} note="委员会随作品生命周期成立、结算后停止活动，成员关系留在公司。此处为 M4 信息结构预览，不开放真实投资或渠道命令。">
      <div className="committee-grid">{data.projects.filter((project) => project.committee.length > 0).map((project) => <article key={project.id}>
        <header><div><p className="eyebrow">{modeNames[project.mode]}</p><h3>{project.title}</h3></div><span>{project.committee.length} 位成员</span></header>
        <div className="committee-members">{project.committee.map((member) => <div key={member.id}><span className="member-seal">{member.name.slice(0, 1)}</span><strong>{member.name}</strong><small>{channelNames[member.channel]} · 投资 {member.investPercent}%</small></div>)}</div>
      </article>)}</div>
    </Panel>

    <div id="meeting-relations" className="scene-anchor">
      <Panel eyebrow="RELATIONSHIPS / 跨作品积累" title="长期合作不只是本作的数字" marks={['proposal', 'sample']} note="一次合作的价值会延续到下一部作品；M4 再接入真实渠道、关系与对账数据。">
        <div className="relation-cards">{data.relationships.map((item) => <article key={item.id}>
          <div className="relation-card-head"><span className="member-seal"><Handshake size={19} /></span><div><h3>{item.name}</h3><p>{item.kind === 'studio' ? '制作伙伴' : channelNames[item.kind]} · 自第 {item.since} 周</p></div><strong>{item.strength}</strong></div>
          <Bar value={item.strength} tone="lead" /><p>{item.note}</p><small>最近合作：{item.lastProject}</small>
        </article>)}</div>
      </Panel>
    </div>
  </div>
}

export function MarketPanels({ data }: { data: PrototypeData }) {
  return <div className="proto-screen scene-detail-panels">
    <div id="market-offers" className="scene-anchor">
      <Panel eyebrow="MARKET / 企划机会" title="下一部作品，从哪里开始？" marks={['confirmed', 'sample']} note="市场按周期刷新，不会因为开工一部作品就清空全公司企划。承接企划是一次新的经营承诺，不是自动生成项目。">
        <div className="market-offer-grid">{data.marketOffers.map((offer, index) => <article className={`market-offer heat-${offer.heat}`} key={offer.id}>
          <div className="offer-visual"><span>{String(index + 1).padStart(2, '0')}</span><Megaphone size={25} /><small>{heatNames[offer.heat]}</small></div>
          <div className="offer-body"><p className="eyebrow">{offerOriginNames[offer.origin]} · {scaleNames[offer.scale]}</p><h3>{offer.title}</h3><p>{offer.hook}</p>
            <dl><div><dt>预算</dt><dd>{yuan(offer.budget)}</dd></div><div><dt>周期</dt><dd>{offer.durationWeeks} 周</dd></div><div><dt>声望门槛</dt><dd>{offer.minReputation}</dd></div></dl>
            <button className="button secondary" disabled={Boolean(offer.blockedBy)}>{offer.blockedBy ?? '查看承接条件'}<ArrowRight size={14} /></button>
          </div>
        </article>)}</div>
      </Panel>
    </div>
    <div id="market-finance"><Panel eyebrow="DISTRIBUTION / 经营结果" title="市场热度要落到作品与现金" marks={['confirmed', 'sample']} note="发行结果、作品质量与商业表现分开记录；真实渠道结清与对账在 M4 接入。">
      <div className="market-history">{data.history.map((work) => <article key={work.id}><span className="history-rating">{work.rating}</span><div><h3>{work.title}</h3><p>质量 {work.quality} · 商业 {work.commercial}</p></div><strong className={work.profit < 0 ? 'cell-behind' : 'cell-ahead'}>{work.profit > 0 ? '+' : ''}{yuan(work.profit)}</strong><small>第 {work.endWeek} 周交付</small></article>)}</div>
    </Panel></div>
  </div>
}
