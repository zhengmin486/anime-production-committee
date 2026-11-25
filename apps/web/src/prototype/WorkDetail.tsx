import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { abilityNames, channelNames, deliveredEpisodes, effortNames, episodeStageNames, episodeStatusNames, EPISODE_STAGES, isDelivered, itemsByStage, ledgerNames, modeNames, outsourceNames, priorityNames, projectCompletion, projectWork, roleNames, scaleNames, sourceNames, sumWork } from './model'
import type { Episode, Project, PrototypeData, WorkItem } from './model'
import { Bar, Panel, RiskTag, signedYuan, Stat, yuan } from './bits'

const projectStatusNames = { producing: '制作中', ready_to_deliver: '待交付', wrapping: '收尾中' } as const
const outsourceStatusNames = { active: '在制', delivered: '已交付', at_risk: '排期风险' } as const
const rushNames = { off: '关闭', conditional: '有条件开启' } as const

export function WorkDetail({ project, data, onBack }: { project: Project; data: PrototypeData; onBack: () => void }) {
  const { company, staff, allocations, suppliers, outsourcing, ledger } = data
  const [episodeIndex, setEpisodeIndex] = useState((project.episodes.find((episode) => episode.isFocus) ?? project.episodes[0]).index)
  const episode: Episode = project.episodes.find((item) => item.index === episodeIndex) ?? project.episodes[0]
  const allItems: WorkItem[] = [...project.commonItems, ...project.episodes.flatMap((item) => item.workItems)]
  const itemOf = (key: string) => allItems.find((item) => item.key === key)
  const depsMet = (item: WorkItem) => item.deps.every((dep) => {
    const source = itemOf(dep)
    return source === undefined || isDelivered(source)
  })
  const itemState = (item: WorkItem) => {
    if (!depsMet(item)) return { label: '被依赖阻塞', tone: 'blocked' }
    if (!isDelivered(item)) return { label: item.workDone > 0 ? '进行中，未达门槛' : '可开始', tone: item.workDone > 0 ? 'active' : 'ready' }
    return { label: item.workDone >= item.workTotal ? '已完成' : '已达标，可继续完善', tone: 'delivered' }
  }

  const people = staff.filter((person) => allocations.find((item) => item.staffId === person.id)?.projectId === project.id)
  const tasks = outsourcing.filter((task) => task.projectId === project.id)
  const entries = ledger.filter((entry) => entry.projectId === project.id)
  const work = projectWork(project)
  const completion = projectCompletion(project)
  const gap = completion - project.plannedCompletion
  const weeksLeft = project.deadlineWeek - company.week
  const commonWork = sumWork(project.commonItems)
  const episodeWork = sumWork(episode.workItems)
  const gateItems = episode.workItems.filter((item) => item.isGate)

  return <div className="proto-screen">
    <Panel eyebrow={`${scaleNames[project.scale]} / ${modeNames[project.mode]} PROJECT FILE`} title={project.title}
      marks={project.marks}
      aside={<button className="text-button" onClick={onBack}><ArrowLeft size={16} aria-hidden="true" />返回公司总览</button>}
      note={`${sourceNames[project.source]} · ${projectStatusNames[project.status]} · 第 ${project.startWeek} 周开工，第 ${project.deadlineWeek} 周交付，剩余 ${weeksLeft} 周 · ${project.episodeCount} 集`}>
      <dl className="proto-stats">
        <Stat strong label="完成度" value={`${completion}%`} hint={`计划 ${project.plannedCompletion}%，${gap < 0 ? `落后 ${Math.abs(gap)}` : `领先 ${gap}`} 个百分点 · ${work.done} / ${work.total} 工作点`} />
        <Stat label="单集交付" value={`${deliveredEpisodes(project)} / ${project.episodeCount} 集`} hint="每集各自推进六阶段，不是整部作品共用一条进度" />
        <Stat label="公共制作" value={`${commonWork.done} / ${commonWork.total} 工作点`} hint="服务整部作品或多集共用" />
        <Stat label="作品质量 / 受众期待 / 商业潜力" value={`${project.quality} / ${project.audienceExpectation} / ${project.commercialPotential}`} hint="制作质量与商业成绩分开计算" />
      </dl>
      <Bar value={completion} tone={gap < 0 ? 'behind' : 'lead'} />
      {project.focusLabel && <p className="proto-inline-note">项目内定向：{project.focusLabel}——每个在制项目至多一个定向目标，不额外花钱，代价是其他单集/阶段的机会成本；不提供逐工作项指派。</p>}
      {project.series && <p className="proto-inline-note">系列关系：{project.series.parentTitle} · {project.series.relation}——{project.series.carried}。</p>}
    </Panel>

    <Panel eyebrow="COMMON PRODUCTION / 项目级公共制作" title="公共制作与单集制作是两层" marks={['confirmed']}
      note="公共制作服务于整部作品或多集共用；它不属于任何一集的阶段，单集工作项通过依赖引用它。">
      <table className="proto-table">
        <thead><tr><th>工作项</th><th>能力</th><th>工作量</th><th>最低交付</th><th>依赖</th><th>状态</th></tr></thead>
        <tbody>{project.commonItems.map((item) => {
          const state = itemState(item)
          return <tr key={item.key}>
            <th scope="row">{item.name}</th>
            <td><span className="chip">{abilityNames[item.ability]}</span></td>
            <td>{item.workDone} / {item.workTotal}</td>
            <td>{item.deliverAt}‰<small className="cell-sub">需 {Math.round(item.workTotal * item.deliverAt / 1000)} 点</small></td>
            <td>{item.deps.length === 0 ? <span className="cell-sub">无</span> : item.deps.map((dep) => <span className="chip" key={dep}>{itemOf(dep)?.name ?? dep}</span>)}</td>
            <td className={`state-${state.tone}`}>{state.label}</td>
          </tr>
        })}</tbody>
      </table>
      <p className="proto-footnote">口径与 docs/BLUEPRINT_SPEC.md 一致：1 工作点 = 1/100 人周，deliver_at 是占 work_total 的千分比门槛；work_done × 1000 ≥ deliver_at × work_total 即解锁下游。</p>
    </Panel>

    <Panel eyebrow="EPISODES / 单集列表" title={`${project.episodeCount} 集各自的制作进度`} marks={['confirmed', 'sample']}
      note="点开任意一集查看它的六阶段；同一项目内各集进度不同步，也不要求整部作品完成一个阶段才统一进入下一阶段。">
      <div className="episode-list" role="group" aria-label="单集选择">
        {project.episodes.map((item) => {
          const sum = sumWork(item.workItems)
          const percent = sum.total === 0 ? 0 : Math.round(sum.done / sum.total * 100)
          return <button key={item.index} className={`episode-row${item.index === episodeIndex ? ' is-active' : ''}`} onClick={() => setEpisodeIndex(item.index)}>
            <span className="episode-no">第 {item.index} 集</span>
            <span className="episode-title">{item.title}</span>
            <span className={`episode-state state-${item.status}`}>{episodeStatusNames[item.status]}</span>
            <span className="episode-bar"><Bar value={percent} tone={item.status === 'delivered' ? 'lead' : item.status === 'not_started' ? 'neutral' : 'behind'} /></span>
            <span className="episode-week">目标第 {item.targetWeek} 周</span>
            {item.isFocus && <span className="focus-tag">定向中</span>}
          </button>
        })}
      </div>
      <p className="proto-footnote">单集优先级（P5）尚未裁决，本页只保留列表扩展接缝，不实现优先级控制。</p>
    </Panel>

    <Panel eyebrow="EPISODE PIPELINE / 单集六阶段" title={`第 ${episode.index} 集《${episode.title}》`} marks={['confirmed']}
      aside={<p className="proto-since">{episodeStatusNames[episode.status]} · 目标第 {episode.targetWeek} 周</p>}
      note={episode.note}>
      <div className="stage-rail">{EPISODE_STAGES.map((stage) => {
        const items = itemsByStage(episode.workItems, stage)
        const stageWork = sumWork(items)
        const ready = items.every((item) => depsMet(item))
        return <article className={`stage-node${ready ? '' : ' is-blocked'}`} key={stage}>
          <header><h3>{episodeStageNames[stage]}</h3><span className="stage-state">{items.filter(isDelivered).length} / {items.length} 项达标</span></header>
          <Bar value={stageWork.total === 0 ? 0 : Math.round(stageWork.done / stageWork.total * 100)} tone={ready ? 'lead' : 'behind'} />
          <p className="stage-line">工作量 <strong>{stageWork.done} / {stageWork.total}</strong> 工作点</p>
          <ul className="item-list">{items.map((item) => {
            const state = itemState(item)
            return <li className={`item-row item-${state.tone}`} key={item.key}>
              <div className="item-head"><strong>{item.name}</strong>{item.isGate && <span className="gate-tag">交付门槛项</span>}<span className={`state-tag state-${state.tone}`}>{state.label}</span></div>
              <p className="item-meta"><span className="chip">{abilityNames[item.ability]}</span> {item.workDone} / {item.workTotal} 点 · 门槛 {item.deliverAt}‰</p>
              {item.deps.length > 0 && <p className="item-deps">依赖：{item.deps.map((dep) => <span className="dep" key={dep}>{itemOf(dep)?.name ?? dep}</span>)}</p>}
            </li>
          })}</ul>
        </article>
      })}</div>
      <div className="gate-summary">
        <p>门槛项状态：{gateItems.length === 0 ? '本集模板未设门槛项' : gateItems.map((item) => `${item.name} ${item.workDone} / ${item.workTotal}（需 ${item.deliverAt}‰）${isDelivered(item) ? '已达标' : '未达标'}`).join('；')}</p>
        <p className="proto-footnote">门槛达标后由玩家主动执行交付，交付即停止生产；也可以继续打磨，期限届满强制交付并按完成度结算扣罚。界面不自动交付。</p>
      </div>
      <p className="proto-footnote">本集合计 {episodeWork.done} / {episodeWork.total} 工作点。阶段之间可并行：背景只依赖 Layout 与美术设定，不等原画完成。</p>
    </Panel>

    <div className="proto-two-col">
      <Panel eyebrow="PLAN / 计划与执行" title="持续方针与实际差距" marks={['confirmed', 'pending']}
        aside={<p className="proto-since">自第 {project.plan.sinceWeek} 周起生效</p>}
        note="方针默认沿用，不需要每周重设；下表只展示计划与实际执行的偏离及其原因。">
        <dl className="plan-setting">
          <div><dt>投入强度</dt><dd>{effortNames[project.plan.effort]}</dd></div>
          <div><dt>优先级</dt><dd>{priorityNames[project.plan.priority]}</dd></div>
          <div><dt>外包策略</dt><dd>{outsourceNames[project.plan.outsource]}</dd></div>
          <div><dt>赶工</dt><dd>{rushNames[project.plan.rush]}</dd></div>
        </dl>
        <table className="proto-table">
          <thead><tr><th>环节</th><th>计划</th><th>实际</th><th>原因</th></tr></thead>
          <tbody>{project.planGaps.map((line) => <tr key={line.label}>
            <th scope="row">{line.label}</th><td>{line.planned}</td><td className={line.planned === line.actual ? undefined : 'cell-behind'}>{line.actual}</td><td>{line.reason}</td>
          </tr>)}</tbody>
        </table>
        <p className="proto-footnote">计划不凭空创造员工或产能；多项目争夺同一员工时由玩家明确归属，系统不静默复制员工。投入强度、参数与随机波动区间属于框架第 11 节待细化内容，本页只验证信息能否被读懂。</p>
      </Panel>

      <div id="production-resources" className="scene-anchor">
      <Panel eyebrow="RESOURCES / 资源占用" title="这个项目本周占了谁" marks={['confirmed', 'sample']}
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
        <p className="proto-footnote">切换项目的人员要承担一次性磨合损失，只影响工作量产出效率、不直接影响质量；监督人员切换产生团队层面损失。临时员工与供应商的跨项目调度属于另一套规则。</p>
      </Panel>
      </div>
    </div>

    <Panel eyebrow="RISK / 风险与预兆" title="风险从哪来" marks={['proposal']}>
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
            <thead><tr><th>委员会成员</th><th>提供渠道</th><th>投资比例</th><th>合作始于</th></tr></thead>
            <tbody>{project.committee.map((member) => <tr key={member.id}>
              <th scope="row">{member.name}</th><td>{channelNames[member.channel]}</td><td>{member.investPercent}%</td><td>第 {member.since} 周</td>
            </tr>)}</tbody>
          </table> : <p className="proto-inline-note">承制路线：合同预算即制作预算，不承担投资本金；可取得合同结余、BD 收益与委托方成功奖励，不参与委员会成员开放的非 BD 渠道分成。</p>}
          <p className="proto-footnote">{project.mode === 'committee' ? '委员会随本作成立，结算后停止活动，成员关系转入公司长期关系。' : '承制模式不通过委员会成员拓展渠道。'}</p>
        </div>
      </div>
    </Panel>
  </div>
}
