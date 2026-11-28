import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { abilityNames, channelNames, episodeStageNames, episodeStatusNames, EPISODE_STAGES, itemsByStage, ledgerNames, modeNames, outsourceNames, roleNames, scaleNames, sourceNames } from './model'
import type { Episode, Project, PrototypeData, WorkState } from './model'
import { Bar, Panel, RiskTag, signedYuan, Stat, yuan } from './bits'
import type { V4GameState } from './v4Types'
import { setWorkPlanV4, workActionV4 } from '../services/gameV4'

const projectStatusNames = { producing: '制作中', ready_to_deliver: '待交付', wrapping: '收尾中' } as const
const outsourceStatusNames = { active: '在制', delivered: '已交付', at_risk: '排期风险' } as const
const rushNames = { off: '关闭', conditional: '有条件开启' } as const
const workStateNames: Record<WorkState, string> = {
  blocked: '被依赖阻塞', ready: '可开始', active: '进行中，未达门槛', delivered: '已达标，可继续完善', completed: '已完成',
}

export type WorkFocus = 'overview' | 'common' | 'episodes' | 'pipeline' | 'resources'

export function WorkDetail({ project, data, state, busy, execute, onBack, focus, episodeIndex, onEpisodeChange }: {
  project: Project
  data: PrototypeData
  state: V4GameState
  busy: boolean
  execute: (command: () => Promise<{ state: V4GameState }>) => Promise<boolean>
  onBack: () => void
  focus: WorkFocus
  episodeIndex: number
  onEpisodeChange: (index: number) => void
}) {
  const { company, staff, allocations, suppliers, outsourcing, ledger } = data
  const [expandedItems, setExpandedItems] = useState<string[]>([])
  const episode: Episode = project.episodes.find((item) => item.index === episodeIndex) ?? project.episodes[0]
  const allItems = [...project.commonItems, ...project.episodes.flatMap((item) => item.workItems)]
  const itemOf = (key: string) => allItems.find((item) => item.key === key)
  const people = staff.filter((person) => allocations.find((item) => item.staffId === person.id)?.projectId === project.id)
  const tasks = outsourcing.filter((task) => task.projectId === project.id)
  const entries = ledger.filter((entry) => entry.projectId === project.id)
  const weeksLeft = project.deadlineWeek - company.week
  const coreProject = state.works.find((work) => work.id === project.id)!
  const deliverable = [...coreProject.common.items, ...coreProject.episodes.flatMap((episode) => episode.stages.flatMap((stage) => stage.items))].filter((item) => item.is_gate).every((item) => BigInt(item.work_done) * 1000n >= BigInt(item.deliver_at) * BigInt(item.work_total))
  const gateItems = episode.workItems.filter((item) => item.isGate)

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-work-focus="${focus}"]`)
    target?.focus({ preventScroll: true })
    target?.scrollIntoView?.({ block: 'start' })
  }, [focus, project.id])

  const toggleItem = (key: string) => setExpandedItems((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])

  return <div className="proto-screen">
    <section className="proto-focus-target" data-work-focus="overview" tabIndex={-1} aria-label={`${project.title}总览`}>
      <Panel eyebrow={`${scaleNames[project.scale]} / ${modeNames[project.mode]} PROJECT FILE`} title={project.title}
        marks={project.marks}
        aside={<button className="text-button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />返回场景</button>}
        note={`${sourceNames[project.source]} · ${projectStatusNames[project.status]} · 第 ${project.startWeek} 周开工，第 ${project.deadlineWeek} 周交付，剩余 ${weeksLeft} 周 · ${project.episodeCount} 集`}>
        <dl className="proto-stats">
          <Stat strong label="完成度" value={`${project.completion}%`} hint={`${project.work.done} / ${project.work.total} 工作点 · 核心不提供计划完成度`} />
          <Stat label="单集制作" value={`${project.episodeCount} 集`} hint="每集各自推进六阶段；v4 仅支持整部作品交付" />
          <Stat label="公共制作" value={`${project.commonWork.done} / ${project.commonWork.total} 工作点`} hint="服务整部作品或多集共用" />
          <Stat label="质量均值 / 商业潜力" value={`${project.quality} / ${project.commercialPotential}`} hint="质量由核心工作项汇总；商业在交付时结算" />
        </dl>
        <Bar value={project.completion} tone="lead" />
        <div className="closing-actions"><button className="button primary" disabled={busy || !deliverable || coreProject.status !== 'producing' || state.company.status !== 'running'} onClick={() => execute(() => workActionV4('deliver_work', state, project.id))}>{busy ? '核心处理中…' : '交付整部作品'}</button><span>{deliverable ? '全部门槛已达标，可执行核心交付。' : '不可用：尚有交付门槛未达标，核心会拒绝交付。'}</span></div>
        {project.mode === 'committee' && <div className="closing-actions"><button className="button secondary" disabled={busy || !!coreProject.tv_service || state.company.status !== 'running'} onClick={() => execute(() => workActionV4('buy_tv_service', state, project.id))}>购买电视服务</button><button className="button secondary" disabled={busy || !!coreProject.extension.used || state.company.status !== 'running'} onClick={() => execute(() => workActionV4('request_extension', state, project.id))}>申请延期（4 周）</button><button className="button secondary" disabled title="核心尚未冻结中止扣罚与履历结构">中止作品（未实现）</button></div>}
        {project.focusLabel && <p className="proto-inline-note">项目内定向：{project.focusLabel}——每个在制项目至多一个定向目标，不额外花钱，代价是其他单集/阶段的机会成本；不提供逐工作项指派。</p>}
        {project.series && <p className="proto-inline-note">系列关系：{project.series.parentTitle} · {project.series.relation}——{project.series.carried}。</p>}
      </Panel>
    </section>

    <section className="proto-focus-target" data-work-focus="common" tabIndex={-1} aria-label="公共制作定位">
      <Panel eyebrow="COMMON PRODUCTION / 项目级公共制作" title="公共制作与单集制作是两层" marks={['confirmed']}
        note="公共制作服务于整部作品或多集共用；它不属于任何一集的阶段，单集工作项通过依赖引用它。">
        <table className="proto-table">
          <thead><tr><th>工作项</th><th>能力</th><th>工作量</th><th>最低交付</th><th>依赖</th><th>状态</th></tr></thead>
          <tbody>{project.commonItems.map((item) => <tr key={item.key}>
            <th scope="row">{item.name}</th>
            <td><span className="chip">{abilityNames[item.ability]}</span></td>
            <td>{item.workDone} / {item.workTotal}</td>
            <td>{item.deliverAt}‰<small className="cell-sub">需 {item.deliverPoints} 点</small></td>
            <td>{item.deps.length === 0 ? <span className="cell-sub">无</span> : item.deps.map((dep) => <span className="chip" key={dep}>{itemOf(dep)?.name ?? dep}</span>)}</td>
            <td className={`state-${item.state}`}>{workStateNames[item.state]}</td>
          </tr>)}</tbody>
        </table>
        <p className="proto-footnote">1 工作点 = 1/100 人周，deliver_at 是占 work_total 的千分比门槛。工作项状态由 v4 核心事实与依赖关系映射，界面不自行推进生产。</p>
      </Panel>
    </section>

    <section className="proto-focus-target" data-work-focus="episodes" tabIndex={-1} aria-label="单集列表定位">
      <Panel eyebrow="EPISODES / 单集列表" title={`${project.episodeCount} 集各自的制作进度`} marks={['confirmed']}
        note="点开任意一集查看它的六阶段；同一项目内各集进度不同步，也不要求整部作品完成一个阶段才统一进入下一阶段。">
        <div className="episode-list" role="group" aria-label="单集选择">
          {project.episodes.map((item) => <button key={item.index} className={`episode-row${item.index === episode.index ? ' is-active' : ''}`} onClick={() => onEpisodeChange(item.index)} aria-pressed={item.index === episode.index}>
            <span className="episode-no">第 {item.index} 集</span>
            <span className="episode-title">{item.title}</span>
            <span className={`episode-state state-${item.status}`}>{episodeStatusNames[item.status]}</span>
            <span className="episode-bar"><Bar value={item.work.percent} tone={item.status === 'delivered' ? 'lead' : item.status === 'not_started' ? 'neutral' : 'behind'} /></span>
            <span className="episode-week">目标第 {item.targetWeek} 周</span>
            {item.isFocus && <span className="focus-tag">定向中</span>}
          </button>)}
        </div>
        <p className="proto-footnote">v4 没有单集独立交付命令；列表中不提供单集交付按钮，交付以整部作品为单位。</p>
      </Panel>
    </section>

    <section className="proto-focus-target" data-work-focus="pipeline" tabIndex={-1} aria-label="单集六阶段定位">
      <Panel eyebrow="EPISODE PIPELINE / 单集六阶段" title={`第 ${episode.index} 集《${episode.title}》`} marks={['confirmed']}
        aside={<p className="proto-since">{episodeStatusNames[episode.status]} · 目标第 {episode.targetWeek} 周</p>}
        note={episode.note}>
        <div className="stage-rail" aria-label="当前单集六阶段">{EPISODE_STAGES.map((stage) => {
          const items = itemsByStage(episode.workItems, stage)
          const stageWork = episode.stages[stage]
          const blocked = items.some((item) => item.state === 'blocked')
          return <article className={`stage-node${blocked ? ' is-blocked' : ''}`} key={stage}>
            <header><h3>{episodeStageNames[stage]}</h3><span className="stage-state">{items.filter((item) => item.state === 'delivered' || item.state === 'completed').length} / {items.length} 项达标</span></header>
            <Bar value={stageWork.percent} tone={blocked ? 'behind' : 'lead'} />
            <p className="stage-line">工作量 <strong>{stageWork.done} / {stageWork.total}</strong> 工作点</p>
            <ul className="item-list">{items.map((item) => {
              const expanded = expandedItems.includes(item.key)
              return <li className={`item-row item-${item.state}`} key={item.key}>
                <button className="item-disclosure" aria-expanded={expanded} aria-controls={`details-${item.key}`} aria-label={`${expanded ? '收起' : '展开'}${item.name}详情`} onClick={() => toggleItem(item.key)}>
                  <span className="item-head"><strong>{item.name}</strong>{item.isGate && <span className="gate-tag">交付门槛项</span>}<span className={`state-tag state-${item.state}`}>{workStateNames[item.state]}</span></span>
                  <span className="item-meta"><span className="chip">{abilityNames[item.ability]}</span> {item.workDone} / {item.workTotal} 点 · 门槛 {item.deliverAt}‰</span>
                  <span className="item-toggle" aria-hidden="true">{expanded ? '收起' : '展开'}</span>
                </button>
                {expanded && <div className="item-details" id={`details-${item.key}`}>
                  {item.deps.length > 0 ? <p className="item-deps">依赖：{item.deps.map((dep) => <span className="dep" key={dep}>{itemOf(dep)?.name ?? dep}</span>)}</p> : <p className="item-deps">无上游依赖。</p>}
                  <p className="item-deps">状态来自本周回执；展开明细不会改变制作或交付。</p>
                </div>}
              </li>
            })}</ul>
          </article>
        })}</div>
        <div className="gate-summary">
          <p>门槛项状态：{gateItems.length === 0 ? '本集模板未设门槛项' : gateItems.map((item) => `${item.name} ${item.workDone} / ${item.workTotal}（需 ${item.deliverAt}‰）${item.state === 'delivered' || item.state === 'completed' ? '已达标' : '未达标'}`).join('；')}</p>
          <p className="proto-footnote">全部门槛达标后可主动交付整部作品；期限届满由核心自动强制交付并按完成度结算。</p>
        </div>
        <p className="proto-footnote">本集合计 {episode.work.done} / {episode.work.total} 工作点。阶段之间可并行：背景只依赖 Layout 与美术设定，不等原画完成。</p>
      </Panel>
    </section>

    <div className="proto-two-col">
      <Panel eyebrow="PLAN / 计划与执行" title="持续制作计划" marks={['confirmed', 'pending']}
        aside={<p className="proto-since">自第 {project.plan.sinceWeek} 周起生效</p>}
        note="计划由玩家明确修改，之后按周冻结快照执行；核心不提供虚构的计划完成度。">
        <dl className="plan-setting">
          <div><dt>投入强度</dt><dd><select aria-label="投入强度" value={coreProject.plan.intensity} disabled={busy || coreProject.status !== 'producing'} onChange={(event) => execute(() => setWorkPlanV4(state, project.id, { intensity: event.target.value }))}><option value="low">保守</option><option value="standard">标准</option><option value="high">集中</option></select></dd></div>
          <div><dt>工作重点</dt><dd><select aria-label="工作重点" value={coreProject.plan.focus} disabled={busy || coreProject.status !== 'producing'} onChange={(event) => execute(() => setWorkPlanV4(state, project.id, { focus: event.target.value }))}><option value="quality">质量</option><option value="schedule">进度</option><option value="cost">成本</option></select></dd></div>
          <div><dt>定向目标</dt><dd><select aria-label="定向目标" value={coreProject.plan.target ? `${coreProject.plan.target.kind}:${coreProject.plan.target.id}` : ''} disabled={busy || coreProject.status !== 'producing'} onChange={(event) => { const [kind, id] = event.target.value.split(':'); execute(() => setWorkPlanV4(state, project.id, { target: kind ? { kind, id } : null })) }}><option value="">无定向</option>{coreProject.episodes.map((episode) => <option key={episode.id} value={`episode:${episode.id}`}>第 {episode.index} 集</option>)}{EPISODE_STAGES.map((stage) => <option key={stage} value={`stage:${stage}`}>{episodeStageNames[stage]}</option>)}</select></dd></div>
          <div><dt>外包策略</dt><dd>{outsourceNames[project.plan.outsource]}（核心仅保存，尚未生效）</dd></div>
          <div><dt>加班</dt><dd>{rushNames[project.plan.rush]}（核心仅保存，尚未生效）</dd></div>
        </dl>
        <p className="proto-footnote">计划变更调用核心 set_work_plan；失败时不会采用界面选择。外包与加班已由核心明确标记为仅保存。</p>
      </Panel>

      <section className="proto-focus-target" data-work-focus="resources" tabIndex={-1} aria-label="资源占用定位">
        <Panel eyebrow="RESOURCES / 资源占用" title="这个项目本周占了谁" marks={['confirmed']}
          note="核心员工每周严格归属一个项目：不存在同周支援、借调或拆分工时；周结算后可重新分配，不受制作阶段边界限制。">
          <ul className="people-list">{people.map((person) => {
            const allocation = allocations.find((item) => item.staffId === person.id)
            const switched = (allocation?.previousProjectId ?? null) !== null && allocation?.previousProjectId !== project.id
            return <li key={person.id}>
              <div className="people-head"><strong>{person.name}</strong><span>{roleNames[person.role]}{switched ? ' · 本周新切换' : ' · 本周归属'}</span></div>
              <p className="people-meta">专注 {abilityNames[allocation?.focus ?? 'planning']} · 疲劳 {person.fatigue} · 士气 {person.morale}{person.employment === 'temporary' ? ` · 项目费 ${yuan(person.projectFee)}` : ` · 周薪 ${yuan(person.weeklySalary)}`}</p>
              <p className="people-note">{person.statusNote}</p>
            </li>
          })}</ul>
          <ul className="conflict-list">{project.conflicts.map((text) => <li key={text}>{text}</li>)}</ul>
          <table className="proto-table">
            <thead><tr><th>外包任务</th><th>供应商</th><th>进度</th><th>已付</th><th>交付</th><th>状态</th></tr></thead>
            <tbody>{tasks.map((task) => {
              const supplier = suppliers.find((item) => item.id === task.supplierId)
              const target = itemOf(task.itemKey)
              return <tr key={task.id}>
                <th scope="row">{task.episodeIndex === null ? '公共制作' : `第 ${task.episodeIndex} 集`}<small className="cell-sub">{target?.name ?? task.itemKey}</small></th>
                <td>{supplier?.name ?? task.supplierId}<small className="cell-sub">可靠 {supplier?.reliability ?? '—'}</small></td>
                <td>{task.workDone} / {task.workTotal}</td>
                <td>{yuan(task.feePaid)}</td>
                <td>第 {task.dueWeek} 周</td>
                <td className={task.status === 'at_risk' ? 'cell-behind' : undefined}>{outsourceStatusNames[task.status]}</td>
              </tr>
            })}</tbody>
          </table>
          <p className="proto-footnote">核心员工每周严格归属一个项目；调配请在办公室员工详情中明确操作。外包当前仅保存计划，尚未生成任务或费用。</p>
        </Panel>
      </section>
    </div>

    <Panel eyebrow="RISK / 风险与预兆" title="风险从哪来" marks={['confirmed']}
      note="v4 当前没有独立风险预测字段；界面不编造风险信号。">
      {project.risks.length === 0 && <p className="proto-inline-note">核心未提供额外风险预测；请以工作项依赖、期限和待处理事件为准。</p>}
      <ul className="risk-list">{project.risks.map((risk) => <li key={risk.label}>
        <RiskTag level={risk.level} />
        <div><strong>{risk.label}</strong><p>{risk.signal}</p><span className="risk-meta">自第 {risk.sinceWeek} 周起累积</span></div>
      </li>)}</ul>
    </Panel>

    <Panel eyebrow="PROJECT ACCOUNT / 项目账" title={`${project.title}的花费与回款`} marks={['confirmed']}
      note="项目账用于分析单部作品表现；现金实际进出的是公司统一现金池，同一笔钱只扣一次。">
      <div className="proto-two-col">
        <dl className="proto-stats proto-stats-tight">
          <Stat label="合同预算" value={yuan(project.account.contractBudget)} hint={`已到账 ${yuan(project.account.received)}`} />
          <Stat label="委员会投资规模" value={project.account.investmentTotal === 0 ? '不适用（承制）' : yuan(project.account.investmentTotal)} hint={`公司承担 ${project.account.companyInvestPercent}%`} />
          <Stat label="制作费 / 外包" value={`${yuan(project.account.productionCost)} / ${yuan(project.account.outsourcingCost)}`} />
          <Stat label="项目账面结余" value={signedYuan(project.account.balance)} hint="未含未来商业分成，非公司可支配现金" />
        </dl>
        <div className="proto-stack">
          <table className="proto-table">
            <thead><tr><th>周</th><th>科目</th><th>说明</th><th>金额</th></tr></thead>
            <tbody>{entries.map((entry) => <tr key={entry.id}>
              <td>{entry.week}</td><td>{ledgerNames[entry.category]}</td><td>{entry.label}</td><td className={entry.amount < 0 ? 'cell-behind' : 'cell-ahead'}>{signedYuan(entry.amount)}</td>
            </tr>)}</tbody>
          </table>
          {project.mode === 'committee' ? <table className="proto-table">
            <thead><tr><th>委员会成员</th><th>提供渠道</th><th>出资说明</th><th>合作始于</th></tr></thead>
            <tbody>{project.committee.map((member) => <tr key={member.id}>
              <th scope="row">{member.name}</th><td>{channelNames[member.channel]}</td><td>{member.investPercent === null ? '共同补足剩余份额' : `${member.investPercent}%`}</td><td>第 {member.since} 周</td>
            </tr>)}</tbody>
          </table> : <p className="proto-inline-note">承制路线：合同预算即制作预算，不承担投资本金；可取得合同结余、BD 收益与委托方成功奖励，不参与委员会成员开放的非 BD 渠道分成。</p>}
          <p className="proto-footnote">{project.mode === 'committee' ? '委员会随本作成立，结算后停止活动，成员关系转入公司长期关系。' : '承制模式不通过委员会成员拓展渠道。'}</p>
        </div>
      </div>
    </Panel>
  </div>
}
