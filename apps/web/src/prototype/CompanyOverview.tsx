import { useEffect } from 'react'
import { abilityNames, channelNames, heatNames, markNames, modeNames, offerOriginNames, roleNames, scaleNames, sourceNames } from './model'
import type { Facility, PrototypeData, RiskLevel, Staff } from './model'
import type { MainScene } from './AssetScenes'
import { Bar, Panel, RiskTag, Stat, yuan } from './bits'
import { FinanceArchive } from './FinanceArchive'

const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }

export type CompanySelection = { kind: 'staff' | 'facility'; id: string } | null
export type CompanyFocus = 'company' | 'people' | 'facilities'

export function CompanyOverview({ data, onOpen, selection, onSelect, focus, onNavigate }: {
  data: PrototypeData
  onOpen: (projectId: string) => void
  selection: CompanySelection
  onSelect: (selection: CompanySelection) => void
  focus: CompanyFocus
  onNavigate: (scene: MainScene) => void
}) {
  const { company, projects, staff, allocations, suppliers, marketOffers, relationships } = data
  const allocationOf = (staffId: string) => allocations.find((item) => item.staffId === staffId)
  const titleOf = (projectId: string | null) => projectId ? projects.find((project) => project.id === projectId)?.title ?? '—' : '本周未分配'
  const risks = projects.flatMap((project) => project.risks.map((risk) => ({ ...risk, project: project.title }))).sort((a, b) => riskOrder[a.level] - riskOrder[b.level])
  const switched = staff.filter((person) => {
    const allocation = allocationOf(person.id)
    return allocation !== undefined && allocation.previousProjectId !== null && allocation.previousProjectId !== allocation.projectId
  })
  const selectedStaff: Staff | undefined = selection?.kind === 'staff' ? staff.find((person) => person.id === selection.id) : undefined
  const selectedFacility: Facility | undefined = selection?.kind === 'facility' ? data.facilities.find((facility) => facility.id === selection.id) : undefined

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-company-focus="${focus}"]`)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'start' })
  }, [focus])

  return <div className="proto-screen">
    <section className="proto-focus-target" data-company-focus="company" tabIndex={-1} aria-label="公司总览定位">
    <Panel eyebrow="COMPANY LEDGER / 公司账" title="公司现金与承诺" marks={['confirmed']}
      aside={<p className="proto-week">第 <strong>{company.week}</strong> / {company.totalWeeks} 周</p>}
      note={company.headline}>
      <dl className="proto-stats">
        <Stat strong label="现金" value={yuan(company.cash)} hint="全公司只有一个现金池，作品不设独立钱包" />
        <Stat label="下周强制支出" value={yuan(company.committedNextWeek)} hint={`工资 ${yuan(company.weeklyFixed.salary)} + 运营 ${yuan(company.weeklyFixed.operations)} + 已承诺制作费`} />
        <Stat label="可支撑周数" value={`${company.runwayWeeks} 周`} hint="按当前承诺支出估算，未计未来回款；刚性支出预检失败会回滚周推进并进入破产流程" />
        <Stat label="公司声望" value={String(company.reputation)} hint="影响可接触企划、人才与合作方" />
      </dl>
      <p className="proto-footnote">现金按周统一结算，同一笔钱只扣一次；项目账只用于分析单部作品表现，不代表公司还能花多少钱。 <a href="#finance-archive">查看财务与历史</a></p>
    </Panel>
    </section>

    <Panel eyebrow="PORTFOLIO / 项目组合" title="同时在制的作品" marks={['confirmed', 'sample']}
      note="三部作品处于不同的双层进度：公共制作 + 每集各自六阶段。普通周不需要逐个打开。">
      <div className="portfolio-grid">{projects.map((project) => {
        const completion = project.completion
        const gap = completion - project.plannedCompletion
        const people = staff.filter((person) => allocationOf(person.id)?.projectId === project.id)
        const weeksLeft = project.deadlineWeek - company.week
        const work = project.work
        return <article className="portfolio-card" key={project.id}>
          <p className="eyebrow">{sourceNames[project.source]} · {scaleNames[project.scale]} · {modeNames[project.mode]}</p>
          <h3>{project.title}</h3>
          <div className="portfolio-stage"><span>单集 {project.deliveredEpisodeCount} / {project.episodeCount} 集已交付</span><span className={gap < 0 ? 'gap-behind' : 'gap-ahead'}>{gap < 0 ? '落后' : '领先'}计划 {Math.abs(gap)} 个百分点</span></div>
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

    <div className="proto-two-col">
      <section className="proto-focus-target" data-company-focus="people" tabIndex={-1} aria-label="人员名单定位">
      <Panel eyebrow="PEOPLE / 人员归属" title="谁在哪个项目上" marks={['confirmed']}
        note="核心员工每周严格归属一个项目：没有同周支援、借调或拆分工时。周结算后可重新分配，切换要承担一次性磨合损失。">
        <div className="staff-load">{staff.map((person) => {
          const allocation = allocationOf(person.id)
          const isSwitched = (allocation?.previousProjectId ?? null) !== null && allocation?.previousProjectId !== allocation?.projectId
          return <button type="button" className={`staff-load-row${selection?.kind === 'staff' && selection.id === person.id ? ' is-selected' : ''}`} key={person.id} onClick={() => onSelect({ kind: 'staff', id: person.id })} aria-pressed={selection?.kind === 'staff' && selection.id === person.id} aria-label={`查看员工 ${person.name}`}>
            <span className="staff-load-id"><strong>{person.name}</strong><span>{roleNames[person.role]}{person.employment === 'temporary' ? ' · 临时' : ''}</span></span>
            <span className="staff-load-where"><strong>{titleOf(allocation?.projectId ?? null)}</strong>
              <span className="prev-tag">上周：{titleOf(allocation?.previousProjectId ?? null)}</span>
              {isSwitched && <span className="switch-tag">本周切换</span>}
            </span>
            <span className="staff-load-meter"><label>疲劳 <b>{person.fatigue}</b></label><Bar value={person.fatigue} tone={person.fatigue >= 70 ? 'behind' : 'neutral'} /></span>
            <span className="staff-load-meter"><label>士气 <b>{person.morale}</b></label><Bar value={person.morale} tone={person.morale <= 60 ? 'behind' : 'lead'} /></span>
            {person.departureWarning && <span className="warn-tag">离职预警</span>}
          </button>
        })}</div>
        {selectedStaff && <div className="selection-detail" role="region" aria-label={`${selectedStaff.name}员工详情`}>
          <div className="selection-detail-head"><div><p className="eyebrow">STAFF FILE / 员工详情</p><h3>{selectedStaff.name} · {roleNames[selectedStaff.role]}</h3></div><button className="text-button" onClick={() => onSelect(null)}>收起</button></div>
          <dl className="portfolio-facts">
            <div><dt>本周归属</dt><dd>{titleOf(allocationOf(selectedStaff.id)?.projectId ?? null)}</dd></div>
            <div><dt>专注能力</dt><dd>{abilityNames[selectedStaff.specialty]}</dd></div>
            <div><dt>疲劳 / 士气</dt><dd>{selectedStaff.fatigue} / {selectedStaff.morale}</dd></div>
            <div><dt>薪酬</dt><dd>{selectedStaff.employment === 'temporary' ? `项目费 ${yuan(selectedStaff.projectFee)}` : `周薪 ${yuan(selectedStaff.weeklySalary)}`}</dd></div>
          </dl>
          <p>{selectedStaff.statusNote}</p>
          <p className="proto-footnote">F1 仅展示人员信息；重新分配会改变真实经营状态，需在正式工作流中确认。</p>
        </div>}
        <p className="proto-footnote">周慕本周只能归《雾港信使 II》，另两部的排产冲突不会由系统静默解决，只能等下周重新分配；临时员工按项目计酬、不参与长期培养。</p>
      </Panel>
      </section>

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

    <section className="proto-focus-target" data-company-focus="facilities" tabIndex={-1} aria-label="设施列表定位">
      <Panel eyebrow="FACILITIES / 公司设施" title="办公室设施与可用状态" marks={['confirmed', 'sample']}
        note="设施提供场景入口与状态说明，不新增独立经营机制；锁定和维修中的设施会显示原因。">
        <div className="facility-grid">{data.facilities.map((facility) => <button type="button" key={facility.id} className={`facility-card facility-${facility.status}${selection?.kind === 'facility' && selection.id === facility.id ? ' is-selected' : ''}`} onClick={() => onSelect({ kind: 'facility', id: facility.id })} aria-pressed={selection?.kind === 'facility' && selection.id === facility.id} aria-label={`查看设施 ${facility.name}`}>
          <span className="facility-card-head"><strong>{facility.name}</strong><span>{facility.statusLabel}</span></span>
          <span>{facility.detail}</span>
          <small>{facility.lockedReason ?? '点击查看设施说明'}</small>
        </button>)}</div>
        {selectedFacility && <div className="selection-detail" role="region" aria-label={`${selectedFacility.name}设施详情`}>
          <div className="selection-detail-head"><div><p className="eyebrow">FACILITY FILE / 设施详情</p><h3>{selectedFacility.name}</h3></div><span className={`chip facility-${selectedFacility.status}`}>{selectedFacility.statusLabel}</span></div>
          <p>{selectedFacility.note}</p>
          {selectedFacility.lockedReason && <p className="disabled-reason">不可用：{selectedFacility.lockedReason}</p>}
          {selectedFacility.actionLabel && <button className="button secondary" onClick={() => {
            if (selectedFacility.kind === 'workspace') onNavigate('studio')
            else if (selectedFacility.kind === 'meeting') onNavigate('meeting')
            else if (selectedFacility.kind === 'reception') onNavigate('market')
            else if (selectedFacility.kind === 'archive') onNavigate('market')
          }}>{selectedFacility.actionLabel}</button>}
        </div>}
      </Panel>
    </section>

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
