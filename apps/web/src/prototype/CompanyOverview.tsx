import { useEffect, useState } from 'react'
import { abilityNames, channelNames, heatNames, markNames, modeNames, offerOriginNames, roleNames, scaleNames, sourceNames } from './model'
import type { Facility, PrototypeData, RiskLevel, Staff } from './model'
import type { MainScene } from './AssetScenes'
import { Bar, Panel, RiskTag, Stat, yuan } from './bits'
import { FinanceArchive } from './FinanceArchive'
import type { V4GameState } from './v4Types'
import { assignStaffV4, dismissStaffV4, hireCoreV4, scoutV4 } from '../services/gameV4'

const riskOrder: Record<RiskLevel, number> = { high: 0, medium: 1, low: 2 }

export type CompanySelection = { kind: 'staff' | 'facility'; id: string } | null
export type CompanyFocus = 'company' | 'people' | 'facilities'

export function CompanyOverview({ data, state, busy, execute, onOpen, selection, onSelect, focus, onNavigate }: {
  data: PrototypeData
  state: V4GameState
  busy: boolean
  execute: (command: () => Promise<{ state: V4GameState }>) => Promise<boolean>
  onOpen: (projectId: string) => void
  selection: CompanySelection
  onSelect: (selection: CompanySelection) => void
  focus: CompanyFocus
  onNavigate: (scene: MainScene) => void
}) {
  const { company, projects, staff, allocations, marketOffers, relationships } = data
  const [confirmDismiss, setConfirmDismiss] = useState(false)
  const coreStaffCount = state.staff.filter((person) => person.employment === 'core').length
  const scoutBlocked = state.recruitment.last_scout_week === company.week ? '本周已招募' : state.events.pending.length > 0 ? '请先处理待议事件' : null
  const allocationOf = (staffId: string) => allocations.find((item) => item.staffId === staffId)
  const titleOf = (projectId: string | null) => projectId ? projects.find((project) => project.id === projectId)?.title ?? data.history.find((work) => work.id === projectId)?.title ?? '核心作品归因' : '本周未分配'
  const risks = projects.flatMap((project) => project.risks.map((risk) => ({ ...risk, project: project.title }))).sort((a, b) => riskOrder[a.level] - riskOrder[b.level])
  const switched = staff.filter((person) => {
    const allocation = allocationOf(person.id)
    return allocation !== undefined && allocation.previousProjectId !== null && allocation.previousProjectId !== allocation.projectId
  })
  const selectedStaff: Staff | undefined = selection?.kind === 'staff' ? staff.find((person) => person.id === selection.id) : undefined
  const selectedFacility: Facility | undefined = selection?.kind === 'facility' ? data.facilities.find((facility) => facility.id === selection.id) : undefined

  useEffect(() => {
    setConfirmDismiss(false)
  }, [selection?.kind, selection?.id])

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
        <Stat label="下周强制支出" value={company.committedNextWeek === null ? '核心预检' : yuan(company.committedNextWeek)} hint={`工资 ${yuan(company.weeklyFixed.salary)} + 运营 ${yuan(company.weeklyFixed.operations)} + 制作费；界面不另算预测`} />
        <Stat label="可支撑周数" value={company.runwayWeeks === null ? '核心判定' : `${company.runwayWeeks} 周`} hint="不在前端预测；刚性支出预检失败会整周回滚并进入破产流程" />
        <Stat label="公司声望" value={String(company.reputation)} hint="影响可接触企划、人才与合作方" />
      </dl>
      <p className="proto-footnote">现金按周统一结算，同一笔钱只扣一次；项目账只用于分析单部作品表现，不代表公司还能花多少钱。 <a href="#finance-archive">查看财务与历史</a></p>
    </Panel>
    </section>

    <Panel eyebrow="PORTFOLIO / 项目组合" title="同时在制的作品" marks={['confirmed']}
      note="每部作品分为公共制作与各集六阶段；进度、质量和人员归属均来自 v4 核心。">
      <div className="portfolio-grid">{projects.map((project) => {
        const completion = project.completion
        const people = staff.filter((person) => allocationOf(person.id)?.projectId === project.id)
        const weeksLeft = project.deadlineWeek - company.week
        const work = project.work
        return <article className="portfolio-card" key={project.id}>
          <p className="eyebrow">{sourceNames[project.source]} · {scaleNames[project.scale]} · {modeNames[project.mode]}</p>
          <h3>{project.title}</h3>
          <div className="portfolio-stage"><span>{project.episodeCount} 集 · 整部交付</span><span>截止第 {project.deadlineWeek} 周</span></div>
          <Bar value={completion} tone="lead" />
          <dl className="portfolio-facts">
            <div><dt>完成度</dt><dd>{completion}%</dd></div>
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
      {projects.length === 0 && <p className="proto-inline-note">尚无在制作品，请前往发行与市场承接企划。</p>}
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
              <span className="prev-tag">上周：{allocation?.previousProjectId ? titleOf(allocation.previousProjectId) : '核心无参与记录'}</span>
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
            <div><dt>本周归属</dt><dd><select aria-label={`${selectedStaff.name}本周归属`} value={allocationOf(selectedStaff.id)?.projectId ?? ''} disabled={busy || state.company.status !== 'running'} onChange={(event) => execute(() => assignStaffV4(state, selectedStaff.id, event.target.value || null))}><option value="">本周未分配</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}</select></dd></div>
            <div><dt>专注能力</dt><dd>{abilityNames[selectedStaff.specialty]}</dd></div>
            <div><dt>疲劳 / 士气</dt><dd>{selectedStaff.fatigue} / {selectedStaff.morale}</dd></div>
            <div><dt>薪酬</dt><dd>{selectedStaff.employment === 'temporary' ? `项目费 ${yuan(selectedStaff.projectFee)}` : `周薪 ${yuan(selectedStaff.weeklySalary)}`}</dd></div>
          </dl>
          <p>{selectedStaff.statusNote}</p>
          <p className="proto-footnote">调配调用核心 assign_staff；调走监督时核心会原子要求合格替补，失败保留原归属。</p>
          {selectedStaff.employment === 'core' && <div className="closing-actions">
            <button className="text-button" disabled={busy || coreStaffCount <= 1 || state.company.status !== 'running'} onClick={async () => {
              if (!confirmDismiss) { setConfirmDismiss(true); return }
              if (await execute(() => dismissStaffV4(state, selectedStaff.id))) onSelect(null)
            }}>{confirmDismiss ? '再次点击确认解雇' : '解雇核心员工'}</button>
            <span>{coreStaffCount <= 1 ? '不可用：核心至少保留 1 人。' : confirmDismiss ? '解雇不可逆；在任监督须由核心当场完成合格替补。' : '解雇不预付遣散费，成功后立即移出名册。'}</span>
          </div>}
        </div>}
        <p className="proto-footnote">没有在制项目时可保持空闲；立项后由核心自动指定监督，其他人员由玩家明确分配。</p>
      </Panel>
      </section>

      <div className="proto-stack">
        <Panel eyebrow="RISK / 近期风险" title="需要留意的经营问题" marks={['confirmed']}
          note="v4 核心没有独立风险预测字段；请以工作项依赖、期限与待处理事件为准。">
          <ul className="risk-list">{risks.map((risk) => <li key={`${risk.project}-${risk.label}`}>
            <RiskTag level={risk.level} />
            <div><strong>{risk.label}</strong><p>{risk.signal}</p><span className="risk-meta">{risk.project} · 自第 {risk.sinceWeek} 周起</span></div>
          </li>)}</ul>
        </Panel>

        <Panel eyebrow="RECRUITMENT / 核心招聘" title="招募与候选池" marks={['confirmed']}
          aside={<button className="button secondary" disabled={busy || scoutBlocked !== null || state.company.status !== 'running'} onClick={() => execute(() => scoutV4(state))}>{busy ? '核心处理中…' : '本周招募'}</button>}
          note="招募费用、候选生成与有效期由核心执行；每周至多一次，有待议事件时不可招募。">
          <p className="proto-footnote">{scoutBlocked ? `不可用：${scoutBlocked}。` : '费用从公司现金统一扣除，实际金额以核心流水为准。'}</p>
          {state.recruitment.pool.length === 0 ? <p className="proto-inline-note">候选池为空。</p> : <ul className="candidate-list">{state.recruitment.pool.map((candidate) => {
            const expired = candidate.expires_week !== null && company.week >= candidate.expires_week
            const bestAbility = Object.entries(candidate.staff.abilities).sort((a, b) => b[1] - a[1])[0]
            return <li key={candidate.staff.id}>
              <div><strong>{candidate.staff.name}</strong><span>{candidate.staff.role} · 主能力 {bestAbility ? abilityNames[bestAbility[0] as keyof typeof abilityNames] : '—'} {bestAbility?.[1] ?? 0}</span><small>签约费 {yuan(candidate.staff.signing_fee)}{candidate.expires_week === null ? '' : ` · 第 ${candidate.expires_week} 周到期`}</small></div>
              <button className="button secondary" disabled={busy || expired || state.company.status !== 'running'} onClick={() => execute(() => hireCoreV4(state, candidate.staff.id))}>签约核心</button>
              {expired && <span className="disabled-reason">已到期</span>}
            </li>
          })}</ul>}
        </Panel>

        <Panel eyebrow="CAPACITY / 共享产能" title="并行经营的真实约束" marks={['confirmed']}>
          <dl className="proto-stats proto-stats-tight">
            <Stat label="在制作品 / 单集" value={`${projects.length} 部 · ${projects.reduce((sum, project) => sum + project.episodeCount, 0)} 集`} hint="不设固定项目槽位与数量上限" />
            <Stat label="已发生项目切换" value={`${switched.length} 人已切换`} hint="核心按上周参与记录识别；调配由玩家明确操作" />
            <Stat label="供应商与外包" value={`${data.suppliers.length} 家 · ${data.outsourcing.filter((task) => task.status === 'active').length} 份进行中`} hint="供应商与合同来自核心状态；签约入口在制作现场作品详情的资源区。" />
          </dl>
          <ul className="conflict-list">{projects.flatMap((project) => project.conflicts.map((text) => <li key={`${project.id}-${text}`}><span>{project.title}</span>{text}</li>))}</ul>
          <p className="proto-footnote">并行经营的约束来自核心人员归属、资金、工作项依赖与期限；界面不额外编制管理负荷或供应商产能。</p>
        </Panel>
      </div>
    </div>

    <section className="proto-focus-target" data-company-focus="facilities" tabIndex={-1} aria-label="设施列表定位">
      <Panel eyebrow="FACILITIES / 公司设施" title="办公室设施与可用状态" marks={['confirmed']}
        note="设施仅提供四个场景的入口与说明，不新增经营规则。">
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

    <Panel eyebrow="OPPORTUNITY / 机会与关系" title="市场企划与长期合作" marks={['confirmed']}
      note="企划来自核心当前市场槽位；市场刷新尚未开放，承接不会在前端清空其他企划。">
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
      <p className="proto-footnote">委员会随单部作品成立、结算后停止活动，成员关系转入公司长期关系；企划与伙伴均来自核心状态。</p>
    </Panel>

    <FinanceArchive data={data} />

    <p className="proto-legend">图示：{(['confirmed', 'pending'] as const).map((mark) => <span key={mark} className={`mark mark-${mark}`}>{markNames[mark]}</span>)}
      <span className="legend-note">经营数值以 v4 核心为准；尚未实现的能力会明确标记为不可用。</span></p>
  </div>
}
