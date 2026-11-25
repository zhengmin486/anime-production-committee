import { channelNames, deliveredEpisodes, heatNames, markNames, modeNames, offerOriginNames, projectCompletion, roleNames, scaleNames, sourceNames, sumWork } from './model'
import type { PrototypeData, RiskLevel } from './model'
import { Bar, Panel, RiskTag, Stat, yuan } from './bits'
import { FinanceArchive } from './FinanceArchive'

const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }

export function CompanyOverview({ data, onOpen }: { data: PrototypeData; onOpen: (projectId: string) => void }) {
  const { company, projects, staff, allocations, suppliers, marketOffers, relationships } = data
  const allocationOf = (staffId: string) => allocations.find((item) => item.staffId === staffId)
  const titleOf = (projectId: string | null) => projectId ? projects.find((project) => project.id === projectId)?.title ?? '—' : '本周未分配'
  const risks = projects.flatMap((project) => project.risks.map((risk) => ({ ...risk, project: project.title }))).sort((a, b) => riskOrder[a.level] - riskOrder[b.level])
  const switched = staff.filter((person) => {
    const allocation = allocationOf(person.id)
    return allocation !== undefined && allocation.previousProjectId !== null && allocation.previousProjectId !== allocation.projectId
  })

  return <div className="proto-screen">
    <div id="company-ledger" className="scene-anchor">
    <Panel eyebrow="COMPANY LEDGER / 公司账" title="公司现金与承诺" marks={['confirmed']}
      aside={<p className="proto-week">第 <strong>{company.week}</strong> / {company.totalWeeks} 周</p>}
      note={company.headline}>
      <dl className="proto-stats">
        <Stat strong label="现金" value={yuan(company.cash)} hint="全公司只有一个现金池，作品不设独立钱包" />
        <Stat label="下周强制支出" value={yuan(company.committedNextWeek)} hint={`工资 ${yuan(company.weeklyFixed.salary)} + 运营 ${yuan(company.weeklyFixed.operations)} + 已承诺制作费`} />
        <Stat label="可支撑周数" value={`${company.runwayWeeks} 周`} hint="按当前承诺支出估算，未计未来回款；预检失败进入限时资金危机，不自动借款、不自动破产" />
        <Stat label="公司声望" value={String(company.reputation)} hint="影响可接触企划、人才与合作方" />
      </dl>
      <p className="proto-footnote">现金按周统一结算，同一笔钱只扣一次；项目账只用于分析单部作品表现，不代表公司还能花多少钱。 <a href="#finance-archive">查看财务与历史</a></p>
    </Panel>
    </div>

    <Panel eyebrow="PORTFOLIO / 项目组合" title="同时在制的作品" marks={['confirmed', 'sample']}
      note="三部作品处于不同的双层进度：公共制作 + 每集各自六阶段。普通周不需要逐个打开。">
      <div className="portfolio-grid">{projects.map((project) => {
        const completion = projectCompletion(project)
        const gap = completion - project.plannedCompletion
        const people = staff.filter((person) => allocationOf(person.id)?.projectId === project.id)
        const weeksLeft = project.deadlineWeek - company.week
        const work = sumWork([...project.commonItems, ...project.episodes.flatMap((episode) => episode.workItems)])
        return <article className="portfolio-card" key={project.id}>
          <p className="eyebrow">{sourceNames[project.source]} · {scaleNames[project.scale]} · {modeNames[project.mode]}</p>
          <h3>{project.title}</h3>
          <div className="portfolio-stage"><span>单集 {deliveredEpisodes(project)} / {project.episodeCount} 集已交付</span><span className={gap < 0 ? 'gap-behind' : 'gap-ahead'}>{gap < 0 ? '落后' : '领先'}计划 {Math.abs(gap)} 个百分点</span></div>
          <Bar value={completion} tone={gap < 0 ? 'behind' : 'lead'} />
          <dl className="portfolio-facts">
            <div><dt>完成度</dt><dd>{completion}% / 计划 {project.plannedCompletion}%</dd></div>
            <div><dt>工作点</dt><dd>{work.done} / {work.total}</dd></div>
            <div><dt>距截止</dt><dd>{weeksLeft} 周</dd></div>
            <div><dt>质量</dt><dd>{project.quality}</dd></div>
            <div><dt>本周归属人手</dt><dd>{people.length} 人</dd></div>
            <div><dt>项目内定向</dt><dd>{project.focusLabel ?? '未设置'}</dd></div>
          </dl>
          <p className="portfolio-risk">{project.risks.slice(0, 2).map((risk) => <RiskTag key={risk.label} level={risk.level} label={risk.label} />)}</p>
          <button className="button secondary" onClick={() => onOpen(project.id)}>打开作品详情</button>
        </article>
      })}</div>
    </Panel>

    <div id="people-board" className="proto-two-col scene-anchor">
      <Panel eyebrow="PEOPLE / 人员归属" title="谁在哪个项目上" marks={['confirmed']}
        note="核心员工每周严格归属一个项目：没有同周支援、借调或拆分工时。周结算后可重新分配，切换要承担一次性磨合损失。">
        <div className="staff-load">{staff.map((person) => {
          const allocation = allocationOf(person.id)
          const isSwitched = (allocation?.previousProjectId ?? null) !== null && allocation?.previousProjectId !== allocation?.projectId
          return <div className="staff-load-row" key={person.id}>
            <div className="staff-load-id"><h3>{person.name}</h3><span>{roleNames[person.role]}{person.employment === 'temporary' ? ' · 临时' : ''}</span></div>
            <div className="staff-load-where"><strong>{titleOf(allocation?.projectId ?? null)}</strong>
              <span className="prev-tag">上周：{titleOf(allocation?.previousProjectId ?? null)}</span>
              {isSwitched && <span className="switch-tag">本周切换</span>}
            </div>
            <div className="staff-load-meter"><label>疲劳 <b>{person.fatigue}</b></label><Bar value={person.fatigue} tone={person.fatigue >= 70 ? 'behind' : 'neutral'} /></div>
            <div className="staff-load-meter"><label>士气 <b>{person.morale}</b></label><Bar value={person.morale} tone={person.morale <= 60 ? 'behind' : 'lead'} /></div>
            {person.departureWarning && <span className="warn-tag">离职预警</span>}
          </div>
        })}</div>
        <p className="proto-footnote">周慕本周只能归《雾港信使 II》，另两部的排产冲突不会由系统静默解决，只能等下周重新分配；临时员工按项目计酬、不参与长期培养。</p>
      </Panel>

      <div className="proto-stack">
        <Panel eyebrow="RISK / 近期风险" title="需要留意的经营问题" marks={['proposal']}
          note="风险带预兆出现，不按周随机摧毁项目。">
          <ul className="risk-list">{risks.map((risk) => <li key={`${risk.project}-${risk.label}`}>
            <RiskTag level={risk.level} />
            <div><strong>{risk.label}</strong><p>{risk.signal}</p><span className="risk-meta">{risk.project} · 自第 {risk.sinceWeek} 周起</span></div>
          </li>)}</ul>
        </Panel>

        <Panel eyebrow="CAPACITY / 共享产能" title="并行经营的真实约束" marks={['confirmed', 'sample']}>
          <dl className="proto-stats proto-stats-tight">
            <Stat label="在制作品 / 单集" value={`${projects.length} 部 · ${projects.reduce((sum, project) => sum + project.episodeCount, 0)} 集`} hint="不设固定项目槽位与数量上限" />
            <Stat label="本周需要重新分配" value={`${switched.length} 人已切换`} hint="重新分配属于玩家决定，系统不静默挪人" />
            <Stat label="已满产能供应商" value={`${suppliers.filter((item) => item.reserved >= item.weeklyCapacity).length} 家`} hint="星野线上本周产能已全部承诺给两个项目" />
            <Stat label="外包在制任务" value={`${data.outsourcing.filter((task) => task.status !== 'delivered').length} 项`} hint="新增外包合同由玩家签署，系统不自动新增" />
          </dl>
          <ul className="conflict-list">{projects.flatMap((project) => project.conflicts.map((text) => <li key={`${project.id}-${text}`}><span>{project.title}</span>{text}</li>))}</ul>
          <p className="proto-footnote">首版不引入独立的管理负荷数值：并行成本由资金、人员归属、供应商产能和项目风险自然呈现，不做成一条被数值化的"管理条"。</p>
        </Panel>
      </div>
    </div>

    <Panel eyebrow="OPPORTUNITY / 机会与关系" title="市场企划与长期合作" marks={['confirmed', 'sample']}
      note="市场按周期刷新，不会因开工一部作品就清空全公司企划。">
      <div className="proto-two-col">
        <ul className="offer-list">{marketOffers.map((offer) => <li key={offer.id}>
          <div className="offer-head"><strong>{offer.title}</strong><span>{offerOriginNames[offer.origin]} · {scaleNames[offer.scale]} · 热度{heatNames[offer.heat]}</span></div>
          <p>{offer.hook}</p>
          <p className="offer-meta">预算 {yuan(offer.budget)} · {offer.durationWeeks} 周 · 声望门槛 {offer.minReputation}{offer.blockedBy ? ` · 受阻：${offer.blockedBy}` : ''}</p>
        </li>)}</ul>
        <ul className="relation-list">{relationships.map((item) => <li key={item.id}>
          <div className="relation-head"><strong>{item.name}</strong><span>{item.kind === 'studio' ? '制作伙伴' : channelNames[item.kind]} · 自第 {item.since} 周</span></div>
          <Bar value={item.strength} tone={item.strength >= 60 ? 'lead' : 'behind'} />
          <p>{item.note}</p>
        </li>)}</ul>
      </div>
      <p className="proto-footnote">委员会随单部作品成立、结算后停止活动，但成员关系转入公司长期关系；上表为原型样本，不代表正式解锁条件。</p>
    </Panel>

    <FinanceArchive data={data} />

    <p className="proto-legend">图示：{(['confirmed', 'proposal', 'pending', 'sample'] as const).map((mark) => <span key={mark} className={`mark mark-${mark}`}>{markNames[mark]}</span>)}
      <span className="legend-note">「待细化参数」指框架第 11 节列出的参数；第 12 节 D1–D6 均已由负责人确认，本页不把它们重列为待决事项。</span></p>
  </div>
}
