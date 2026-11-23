import { useState } from 'react'
import { ArrowLeft, ArrowRight, Coins, Save, FolderOpen, FileText, Flag } from 'lucide-react'
import { useGameStore } from '../stores/gameStore'
import type { useGameCore } from '../hooks/useGameCore'
import { ABILITIES, STAGES, isAbility, isPolicy } from '../types/gameV3'
import type { Ability, Phase, Policy, Role, Scale, Source, Stage, StageConfiguration, Staff } from '../types/gameV3'

const stageNames: Record<Stage, string> = { script: '脚本', storyboard: '分镜', key_animation: '原画', animation_check: '动画检查', postproduction: '摄影合成' }
const abilityNames: Record<Ability, string> = { planning: '企划', direction: '演出', drawing: '作画', animation: '动画', management: '制作管理', postproduction: '后期' }
const roleNames: Record<Role, string> = { director: '导演', scriptwriter: '编剧', animation_director: '作画监督', key_animator: '原画', animator: '动画', production_manager: '制作进行', postproduction: '摄影' }
const scaleNames: Record<Scale, string> = { ova: 'OVA', short: '短篇', tv: '电视动画', movie: '剧场版' }
const sourceNames: Record<Source, string> = { manga: '漫画改编', light_novel: '轻小说改编', game: '游戏改编', original: '原创' }
const phaseNames: Record<Phase, string> = { idle: '等待企划', producing: '制作中', event_pending: '事件处理', project_ready: '待结算', project_settled: '已结算', company_ended: '经营结束' }
const statusNames = { running: '经营中', closing: '结束流程', ended: '已结束' } as const
const stageStatusNames = { pending: '未开始', ready: '待配置', active: '进行中', completed: '已完成' } as const
const deliveryNames = { completed: '制作完成', deadline: '截止违约交付', company_closed: '公司关闭交付' } as const
const endReasonNames = { time_limit: '十年经营期满', bankrupt: '资金破产', voluntary: '主动结束经营' } as const
const ratingNames = { renowned: '业界知名', stable: '稳定经营', small: '小型工作室', failed: '经营失败' } as const
const policyNames: Record<Policy, string> = { quality: '质量优先', balanced: '均衡推进', deadline: '赶工交付' }
const money = (value: number) => value.toLocaleString('zh-CN')
const signed = (value: number) => `${value > 0 ? '+' : ''}${money(value)}`

function StageConfigPanel({ stage, recommended, lockedConfiguration, staff, disabled, onLock }: {
  stage: Stage
  recommended: StageConfiguration | null
  lockedConfiguration: StageConfiguration | null
  staff: Staff[]
  disabled: boolean
  onLock: (configuration: StageConfiguration) => void
}) {
  const source = lockedConfiguration ?? recommended
  const base = source?.assignments ?? staff.map((person) => ({ staff_id: person.id, role: person.role, focus: 'planning' as Ability }))
  const [policy, setPolicy] = useState<Policy>(source?.policy ?? 'balanced')
  const [overtime, setOvertime] = useState(source?.overtime ?? false)
  const [focus, setFocus] = useState<Record<string, Ability>>(() => Object.fromEntries(base.map((item) => [item.staff_id, item.focus])))
  const inactive = disabled || lockedConfiguration !== null
  return <div className="stage-config" aria-label={`${stageNames[stage]}阶段配置`}>
    <label className="policy-control">制作方针<select aria-label="制作方针" value={policy} disabled={inactive} onChange={(event) => {
      if (isPolicy(event.target.value)) setPolicy(event.target.value)
    }}>{(Object.keys(policyNames) as Policy[]).map((value) => <option key={value} value={value}>{policyNames[value]}</option>)}</select></label>
    <label className="check-control"><input type="checkbox" aria-label="加班" checked={overtime} disabled={inactive} onChange={(event) => setOvertime(event.target.checked)} />本周加班（额外支出与士气消耗）</label>
    <div className="staff-controls">{staff.map((person) => <label key={person.id}>{person.name} · {roleNames[person.role]}<select aria-label={`${person.name}专注`} value={focus[person.id] ?? 'planning'} disabled={inactive} onChange={(event) => {
      if (isAbility(event.target.value)) setFocus((current) => ({ ...current, [person.id]: event.target.value as Ability }))
    }}>{ABILITIES.map((ability) => <option key={ability} value={ability}>{abilityNames[ability]}</option>)}</select></label>)}</div>
    {lockedConfiguration === null && <button className="button primary" disabled={disabled} onClick={() => onLock({ assignments: staff.map((person) => ({ staff_id: person.id, role: person.role, focus: focus[person.id] ?? 'planning' })), policy, overtime })}>锁定阶段方案</button>}
    <p className="local-note">{lockedConfiguration !== null ? '方案已锁定：本阶段推进期间配置控件禁用，不可更改。' : '方案锁定后本阶段不可更改；推进前不扣款。'}</p>
  </div>
}

export function StudioPage({ core }: { core: ReturnType<typeof useGameCore> }) {
  const { game, busy, report, result, companyResult, saveConflict, startProject, decide, advance, settle, settleCompany, save, cancelOverwrite, load, goHome } = useGameStore()
  if (!game) return null
  const unavailable = busy || core.status !== 'ready'
  const company = game.company
  const project = game.project
  const running = company.status === 'running'
  const currentStage = project?.current_stage ?? null
  const stageState = currentStage && project ? project.stages[currentStage] : null
  const canAdvance = game.phase === 'producing' && stageState?.status === 'active'
  const canSummarize = company.status === 'closing' && project === null
  return <main className="studio-layout enter" aria-busy={busy}>
    <div className="studio-heading">
      <div><p className="eyebrow">PRODUCTION DESK / 周制制作台</p><h1>制作进行室<span className="title-period">。</span></h1></div>
      <button className="text-button" onClick={goHome} disabled={busy}><ArrowLeft size={16} aria-hidden="true" />返回首页</button>
    </div>
    <section className="studio-summary" aria-label="经营状态">
      <div className="budget-block"><p><Coins size={17} aria-hidden="true" />当前资金 / 日元</p><strong data-testid="funds"><small>¥</small>{money(company.funds)}</strong></div>
      <dl className="studio-facts">
        <div><dt>当前周</dt><dd><span data-testid="week">{company.week}</span> / 520</dd></div>
        <div><dt>公司声望</dt><dd>{company.reputation}</dd></div>
        <div><dt>经营阶段</dt><dd>{phaseNames[game.phase]} · {statusNames[company.status]}</dd></div>
        <div><dt>当前种子</dt><dd>{game.seed}</dd></div>
      </dl>
      {game.preview && <p className="local-note">第 {game.preview.next_week} 周预计支出 ¥{money(game.preview.total_cost)}：工资 ¥{money(game.preview.costs.salary)} / 运营 ¥{money(game.preview.costs.operations)} / 生产 ¥{money(game.preview.costs.production)} / 事件概率 {game.preview.event_probability_per_mille}‰。</p>}
      {company.end_reason && <p className="action-note">{endReasonNames[company.end_reason]}，公司进入结束流程。</p>}
    </section>

    {companyResult && <section className="settlement ledger" aria-label="经营总结" data-testid="company-result">
      <div className="ledger-heading"><h2>经营总结</h2><span>{endReasonNames[companyResult.reason]}</span></div>
      <div className="settlement-content"><div className="result-grade"><span>最终评级</span><strong>{ratingNames[companyResult.rating]}</strong></div>
        <dl className="result-values">
          <div><dt>经营周数</dt><dd>{companyResult.weeks}</dd></div>
          <div><dt>最终资金</dt><dd>¥{money(companyResult.final_funds)}</dd></div>
          <div><dt>净现金变化</dt><dd>¥{signed(companyResult.net_cash_change)}</dd></div>
          <div><dt>完成作品</dt><dd>{companyResult.total_projects}</dd></div>
          <div><dt>最佳作品</dt><dd>{companyResult.best_work_id ?? '无'}</dd></div>
        </dl>
      </div>
      <p className="local-note">经营已结束。可以保存这份总结，或返回首页新开一局。</p>
    </section>}

    {result && <section className="settlement ledger" aria-label="项目结算" data-testid="project-result">
      <div className="ledger-heading"><h2>项目结算</h2><span>{deliveryNames[result.end_reason]}</span></div>
      <div className="settlement-content"><div className="result-grade"><span>成品质量</span><strong>{result.quality_score}</strong></div>
        <dl className="result-values">
          <div><dt>商业评分</dt><dd>{result.commercial_score}</dd></div>
          <div><dt>商业收入（记录）</dt><dd>¥{money(result.commercial_revenue)}</dd></div>
          <div><dt>项目利润</dt><dd>¥{signed(result.profit)}</dd></div>
          <div><dt>违约金</dt><dd>¥{money(result.finance.costs.penalty)}</dd></div>
          <div><dt>制作周数</dt><dd>{result.end_week - result.start_week}</dd></div>
        </dl>
      </div>
      <p className="local-note">承制路线的商业收入不计入公司现金；结算已由核心入账。</p>
    </section>}

    {game.phase === 'idle' && running && <section className="offers-section" aria-label="企划报价">
      <div className="section-heading"><h2>桌上的四份企划</h2><p>选择下一部作品，合同拨款由核心一次性入账。M1 仅开放承制路线。</p></div>
      <div className="offer-grid">{game.offers.map((offer) => <article className="offer-card" key={offer.id}>
        <p className="eyebrow">{scaleNames[offer.scale]} / {sourceNames[offer.source]}</p><h3>{offer.name}</h3>
        <dl className="connection-details">
          <div><dt>合同拨款</dt><dd>¥{money(offer.contract_budget)}</dd></div>
          <div><dt>工期</dt><dd>{offer.duration_weeks} 周</dd></div>
          <div><dt>目标质量</dt><dd>{offer.target_quality}</dd></div>
          <div><dt>受众 / 商业潜力</dt><dd>{offer.audience_base} / {offer.commercial_potential}</dd></div>
          <div><dt>可选合作模式</dt><dd>{offer.allowed_modes.map((mode) => mode === 'contract' ? '承制' : '委员会').join(' / ')}</dd></div>
        </dl>
        <button className="button secondary" disabled={unavailable} onClick={() => void startProject(offer.id)}>接手：{offer.name}</button>
      </article>)}</div>
    </section>}

    {project && <div className="studio-grid">
      <section className="ledger" aria-label="项目制作">
        <div className="ledger-heading"><h2>{project.offer.name}</h2><span>{scaleNames[project.offer.scale]} · 承制</span></div>
        <dl className="project-facts">
          <div><dt>开工周</dt><dd>{project.start_week}</dd></div><div><dt>截止周</dt><dd>{project.deadline_week}</dd></div>
          <div><dt>目标质量</dt><dd>{project.offer.target_quality}</dd></div><div><dt>合同拨款</dt><dd>¥{money(project.offer.contract_budget)}</dd></div>
        </dl>
        <div className="stage-grid">{STAGES.map((stage) => {
          const item = project.stages[stage]
          const percent = Math.round(item.work_done / project.offer.workloads[stage] * 100)
          return <section className="stage-card" key={stage} aria-label={stageNames[stage]}>
            <h3>{stageNames[stage]}<span className="stage-status">{stageStatusNames[item.status]}</span></h3>
            <div className="progress-heading"><span>进度</span><strong data-testid={`progress-${stage}`}>{percent}<small>%</small></strong></div>
            <progress value={percent} max={100} aria-label={`${stageNames[stage]}进度`} />
            <p className="stage-quality">质量 <strong>{item.quality}</strong> · {item.work_done}/{project.offer.workloads[stage]}</p>
            {item.result && <p className="stage-quality">用时 {item.result.weeks_spent} 周</p>}
          </section>
        })}</div>
        {game.phase === 'producing' && currentStage && stageState && (stageState.status === 'ready' || stageState.status === 'active') && <StageConfigPanel
          key={`${currentStage}-${stageState.status}`} stage={currentStage} recommended={stageState.recommended_configuration}
          lockedConfiguration={stageState.status === 'active' ? stageState.configuration : null}
          staff={company.staff} disabled={unavailable}
          onLock={(configuration) => void decide({ type: 'configure_stage', stage: currentStage, configuration })} />}
        {canAdvance && <button className="button primary advance-button" onClick={() => void advance()} disabled={unavailable}>推进本周<ArrowRight size={20} aria-hidden="true" /></button>}
        {game.phase === 'producing' && stageState?.status === 'ready' && <p className="action-note">请先锁定本阶段方案，再推进本周。</p>}
        {game.phase === 'project_ready' && <><p className="action-note">{project.delivery_reason && deliveryNames[project.delivery_reason]}，请领取项目结算。</p>
          <button className="button primary advance-button" onClick={() => void settle()} disabled={unavailable}>结算项目<ArrowRight size={20} aria-hidden="true" /></button></>}
      </section>
      <section className="ledger staff-panel" aria-label="员工状态">
        <div className="ledger-heading"><h2>核心团队</h2><span>STAFF SHEET</span></div>
        {company.staff.map((person) => <div className="staff-row" key={person.id}>
          <div className="staff-name"><h3>{person.name}</h3><span>{roleNames[person.role]}</span></div>
          <p className="staff-stats">士气 {person.morale} <span>疲劳 {person.fatigue}</span></p>
          <p className="staff-stats">周薪 ¥{money(person.weekly_salary)}</p>
        </div>)}
      </section>
    </div>}

    {game.phase === 'project_settled' && <section className="ledger" aria-label="结算后行动">
      <div className="ledger-heading"><h2>下一步</h2><span>NEXT</span></div>
      <div className="save-actions">
        {running && <button className="button primary" disabled={unavailable} onClick={() => void decide({ type: 'return_to_market' })}>回到企划市场</button>}
        {canSummarize && <button className="button primary" disabled={unavailable} onClick={() => void settleCompany()}>生成经营总结</button>}
      </div>
    </section>}

    {game.phase === 'idle' && canSummarize && <section className="ledger" aria-label="结束流程">
      <div className="ledger-heading"><h2>结束流程</h2><span>FINAL</span></div>
      <button className="button primary" disabled={unavailable} onClick={() => void settleCompany()}>生成经营总结</button>
    </section>}

    {game.history.length > 0 && <section className="ledger" aria-label="作品履历">
      <div className="ledger-heading"><h2>作品履历</h2><span>{game.history.length} 部</span></div>
      {game.history.map((work) => <p className="staff-stats" key={work.id}>{work.name} · {deliveryNames[work.end_reason]} · 质量 {work.quality_score} · 利润 ¥{signed(work.profit)}</p>)}
    </section>}

    <section className="result-panel daily-report" aria-label="每周制作回执">
      <div className="result-heading"><FileText size={19} aria-hidden="true" /><h2>每周制作回执</h2><span>C++ / WASM</span></div>
      {report ? <div className="report-content" data-testid="week-report">
        <div><p className="receipt-label">第 {report.week} 周 / 核心回执</p>{report.messages.map((message) => <p className="receipt-message" key={message}>{message}</p>)}</div>
        <dl className="report-values">
          <div><dt>资金变化</dt><dd>¥{signed(report.funds_delta)}</dd></div>
          <div><dt>工资 / 运营 / 生产</dt><dd>¥{money(report.costs.salary)} / ¥{money(report.costs.operations)} / ¥{money(report.costs.production)}</dd></div>
          {report.stage_deltas.map((item) => <div key={item.stage}><dt>{stageNames[item.stage]}</dt><dd>进度 {signed(item.work_done_delta)} / 质量 {signed(item.quality_delta)}</dd></div>)}
          {report.staff_deltas.map((item) => <div key={item.staff_id}><dt>{company.staff.find((person) => person.id === item.staff_id)?.name ?? item.staff_id}</dt><dd>士气 {signed(item.morale_delta)} / 疲劳 {signed(item.fatigue_delta)}</dd></div>)}
        </dl>
      </div> : <p className="empty-report">等待第一份制作回执。推进本周后，在这里查阅核心返回的制作结果。</p>}
    </section>
    <div className="save-actions">
      <button className="button secondary" onClick={() => void save()} disabled={busy}><Save size={16} aria-hidden="true" />保存进度</button>
      <button className="button secondary" onClick={() => void load()} disabled={busy}><FolderOpen size={16} aria-hidden="true" />读取存档</button>
      {running && <button className="button secondary" onClick={() => void decide({ type: 'end_company' })} disabled={unavailable}><Flag size={16} aria-hidden="true" />结束经营</button>}
    </div>
    {saveConflict && <div className="save-actions">
      <button className="button primary" onClick={() => void save(true)} disabled={busy}><Save size={16} aria-hidden="true" />确认覆盖本地存档</button>
      <button className="button secondary" onClick={cancelOverwrite} disabled={busy}>取消覆盖</button>
    </div>}
    <p className="local-note">存档仅保存在此浏览器，不会上传，且只有一个手动存档槽；覆盖已有存档需要你明确确认。种子仅在空闲周与返回市场时推进，用于复现经营状态。</p>
  </main>
}
