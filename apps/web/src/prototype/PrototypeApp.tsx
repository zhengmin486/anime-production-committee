import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Bell, Building2, CalendarDays, Clapperboard, Coins, FileCheck2, FolderKanban, Handshake, Megaphone, Monitor, Trophy, UsersRound, X } from 'lucide-react'
import { AssetScene } from './AssetScenes'
import type { MainScene, SceneAction } from './AssetScenes'
import { CompanyOverview } from './CompanyOverview'
import type { CompanyFocus, CompanySelection } from './CompanyOverview'
import { FinanceArchive } from './FinanceArchive'
import { MarketArchive, MarketOffers, MarketPerformance, ReleaseStatus } from './MarketBusiness'
import { prototypeData } from './mockData'
import { episodeStageShortNames, EPISODE_STAGES, heatNames, scaleNames, weekStateNames } from './model'
import type { Project, PrototypeData, WeeklyReceipt } from './model'
import { Bar, yuan } from './bits'
import { WeeklyOperations, WeeklyReceiptPreview } from './WeeklyOperations'
import type { DecisionRecords, EventResolution, WeekFocus } from './WeeklyOperations'
import { WorkDetail } from './WorkDetail'
import type { WorkFocus } from './WorkDetail'
import './prototype.css'

const sceneOrder: MainScene[] = ['office', 'studio', 'meeting', 'market']
const sceneMeta: Record<MainScene, { title: string; english: string; description: string; icon: typeof Building2 }> = {
  office: { title: '办公室', english: 'COMPANY', description: '观察公司状态、人员归属与设施。', icon: Building2 },
  studio: { title: '制作现场', english: 'PRODUCTION', description: '从作品到单集，再到每集的六个制作阶段。', icon: Clapperboard },
  meeting: { title: '会议室', english: 'DECISION', description: '把有分量的企划、合作与突发事项集中决策。', icon: UsersRound },
  market: { title: '发行与市场', english: 'MARKET', description: '在同一场景承接企划、查看作品发行，并复盘市场业绩。', icon: Megaphone },
}

type PanelName = 'company' | 'work' | 'week' | 'finance' | 'market' | 'release' | 'archive' | 'performance'
const panelNames: Record<PanelName, string> = {
  company: '公司详情', work: '作品详情', week: '每周经营', finance: '财务与历史',
  market: '市场企划', release: '作品发行', archive: '作品 Archive', performance: '业绩与历史',
}

type SceneActionOption = {
  action: SceneAction
  label: string
  description: string
  icon: typeof Building2
  primary?: boolean
  focus?: CompanyFocus | WorkFocus | WeekFocus
  offerId?: string
}

const sceneActions: Record<MainScene, SceneActionOption[]> = {
  office: [
    { action: 'company', label: '查看员工与设施', description: '人员归属、设施状态与公司账目', icon: UsersRound, primary: true, focus: 'people' },
    { action: 'company', label: '查看公司信息', description: '现金承诺、声望与项目组合', icon: Building2, focus: 'company' },
    { action: 'company', label: '查看办公室设施', description: '可用、占用、维修与锁定状态', icon: FileCheck2, focus: 'facilities' },
    { action: 'work', label: '打开在制作品', description: '公共制作、单集与六阶段进度', icon: FolderKanban, focus: 'overview' },
    { action: 'finance', label: '查看公司现金', description: '现金流水与项目归因', icon: Coins },
    { action: 'week', label: '打开周经营', description: '周次快照、事件与经营状态', icon: CalendarDays, focus: 'receipt' },
  ],
  studio: [
    { action: 'work', label: '查看当前单集', description: '聚焦所选单集的六阶段制作进度', icon: Clapperboard, primary: true, focus: 'pipeline' },
    { action: 'work', label: '查看公共制作', description: '角色设定与作品公共制作工作项', icon: FileCheck2, focus: 'common' },
    { action: 'work', label: '查看单集列表', description: '比较各集进度并切换单集', icon: FolderKanban, focus: 'episodes' },
    { action: 'work', label: '打开作品详情', description: '完整作品、资源与交付状态', icon: FolderKanban, focus: 'overview' },
    { action: 'week', label: '打开周经营', description: '从制作现场进入周经营', icon: CalendarDays, focus: 'receipt' },
  ],
  meeting: [
    { action: 'week', label: '处理待决议题', description: '选择合法选项并记录原型决定', icon: CalendarDays, primary: true, focus: 'decisions' },
    { action: 'week', label: '查看决策文件', description: '查看事件代价、可能收益与风险', icon: FileCheck2, focus: 'event' },
    { action: 'week', label: '打开周经营', description: '查看周报、回滚与关闭快照', icon: FolderKanban, focus: 'receipt' },
  ],
  market: [
    { action: 'market', label: '企划承接', description: '查看预算、周期与承接条件', icon: Handshake, primary: true },
    { action: 'release', label: '作品发行', description: '在制作品与已发行作品反馈', icon: Monitor, primary: true },
    { action: 'market', label: '查看业务公告板', description: '新企划、委托与合作机会', icon: Bell },
    { action: 'archive', label: '查看公司作品墙', description: '已交付作品与商业表现', icon: Clapperboard },
    { action: 'performance', label: '查看业绩看板', description: '收入、声望与历史成绩', icon: Trophy },
    { action: 'week', label: '打开周经营', description: '查看当前经营周与事件', icon: CalendarDays, focus: 'receipt' },
  ],
}

function CashCard({ data, label = '公司现金' }: { data: PrototypeData; label?: string }) {
  return <div className="scene-cash-card">
    <span>{label}</span>
    <strong>{yuan(data.company.cash)}</strong>
    <small>唯一现金池 · 可支撑 {data.company.runwayWeeks} 周</small>
  </div>
}

function ProjectRow({ project, active, onClick }: { project: Project; active: boolean; onClick: () => void }) {
  return <button className={`scene-project-row${active ? ' is-active' : ''}`} onClick={onClick} aria-pressed={active}>
    <span className="project-row-top"><strong>{project.title}</strong><small>{scaleNames[project.scale]}</small></span>
    <span className="project-row-meta"><span>{project.deliveredEpisodeCount} / {project.episodeCount} 集已交付</span><b>{project.completion}%</b></span>
    <Bar value={project.completion} tone={project.completion < project.plannedCompletion ? 'behind' : 'lead'} />
  </button>
}

function SceneSidebar({ scene, data, project, episodeIndex, receipt, onSelectProject, onSelectEpisode, onAction }: {
  scene: MainScene
  data: PrototypeData
  project: Project
  episodeIndex: number
  receipt: WeeklyReceipt
  onSelectProject: (id: string) => void
  onSelectEpisode: (index: number) => void
  onAction: (option: SceneActionOption) => void
}) {
  const actions = sceneActions[scene]
  return <aside className="scene-sidebar" role="region" aria-label={`${sceneMeta[scene].title}信息`}>
    <div className="scene-side-heading"><p className="eyebrow">{sceneMeta[scene].english} / SCENE ACTIONS</p><h2>{sceneMeta[scene].title}交互</h2><p>当前场景的全部操作集中在这里；右侧画面保持纯净展示。</p></div>
    <section className="scene-action-panel" aria-label="场景交互选项">
      <div className="scene-section-title"><h3>场景交互</h3><span>{actions.length} 项操作</span></div>
      <div className="scene-action-list">{actions.map((item) => {
        const Icon = item.icon
        return <button key={item.label} className={`scene-action-button${item.primary ? ' is-primary' : ''}`} onClick={() => onAction(item)}>
          <span className="scene-action-icon"><Icon size={17} aria-hidden="true" /></span>
          <span className="scene-action-copy"><strong>{item.label}</strong><small>{item.description}</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </button>
      })}</div>
    </section>

    {scene === 'office' && <>
      <CashCard data={data} />
      <dl className="scene-quick-stats">
        <div><dt>公司声望</dt><dd>{data.company.reputation}</dd></div>
        <div><dt>核心 / 临时</dt><dd>{data.staff.filter((person) => person.employment === 'core').length} / {data.staff.filter((person) => person.employment === 'temporary').length}</dd></div>
        <div><dt>在制作品</dt><dd>{data.projects.length} 部</dd></div>
      </dl>
      <div className="scene-side-section"><div className="scene-section-title"><h3>在制作品</h3><span>快捷进入</span></div>
        <div className="scene-project-list">{data.projects.map((item) => <ProjectRow key={item.id} project={item} active={item.id === project.id} onClick={() => { onSelectProject(item.id); onAction({ action: 'work', label: '', description: '', icon: FolderKanban, focus: 'overview' }) }} />)}</div>
      </div>
    </>}

    {scene === 'studio' && (() => {
      const focusEpisode = project.episodes.find((episode) => episode.index === episodeIndex) ?? project.episodes[0]
      return <>
        <div className="scene-project-switch" role="group" aria-label="作品切换">{data.projects.map((item) => <button key={item.id} className={item.id === project.id ? 'is-active' : ''} aria-pressed={item.id === project.id} onClick={() => onSelectProject(item.id)}>{item.title}</button>)}</div>
        <div className="scene-focus-project"><span>{scaleNames[project.scale]} · {project.mode === 'committee' ? '制作委员会' : '承制'}</span><h3>{project.title}</h3><div><strong>{project.completion}%</strong><small>计划 {project.plannedCompletion}%</small></div><Bar value={project.completion} tone={project.completion < project.plannedCompletion ? 'behind' : 'lead'} /></div>
        <div className="scene-side-section"><div className="scene-section-title"><h3>第 {focusEpisode.index} 集《{focusEpisode.title}》</h3><span>六阶段</span></div>
          <div className="scene-stage-grid" aria-label="当前单集六阶段">{EPISODE_STAGES.map((stage) => {
            const work = focusEpisode.stages[stage]
            return <div key={stage}><span>{episodeStageShortNames[stage]}</span><strong>{work.percent}%</strong><i><b style={{ width: `${work.percent}%` }} /></i></div>
          })}</div>
          <div className="episode-quick-switch" role="group" aria-label="快捷单集切换">{project.episodes.map((episode) => <button key={episode.index} className={episode.index === focusEpisode.index ? 'is-active' : ''} aria-pressed={episode.index === focusEpisode.index} onClick={() => onSelectEpisode(episode.index)}>EP {String(episode.index).padStart(2, '0')}</button>)}</div>
        </div>
        <div className="scene-common-work"><div><span>公共制作</span><strong>{project.commonWork.done} / {project.commonWork.total} 点</strong></div><Bar value={project.commonWork.percent} tone="neutral" /></div>
      </>
    })()}

    {scene === 'meeting' && <>
      <div className={`meeting-agenda-card${receipt.event ? ' is-active' : ''}`}><span className="agenda-state">{receipt.event ? `待处理 · 第 ${receipt.event.deadlineWeek} 周前` : '本期无待决议题'}</span><h3>{receipt.event?.title ?? '桌案已准备好'}</h3><p>{receipt.event?.description ?? '有待处理事件时，议题会出现在这里并可直接进入处理。'}</p><button className="button secondary" onClick={() => onAction(sceneActions.meeting[receipt.event ? 1 : 2])}>{receipt.event ? '查看决策文件' : '查看本周回执'}</button></div>
      <div className="scene-side-section"><div className="scene-section-title"><h3>会议结构</h3><span>只读预览</span></div>
        <ul className="meeting-structure"><li><span>01</span><div><strong>待决议题</strong><small>来自事件卡与合法选项</small></div></li><li><span>02</span><div><strong>参会方</strong><small>产业关系尚未开放</small></div></li><li><span>03</span><div><strong>决策文件</strong><small>确定代价、可能收益与风险</small></div></li></ul>
      </div>
      <p className="scene-boundary-note">M4 产业关系落地前，委员会与合作区块只做结构展示，不宣称可玩。</p>
    </>}

    {scene === 'market' && <>
      <CashCard data={data} label="结算后公司现金" />
      <div className="scene-side-section"><div className="scene-section-title"><h3>市场企划</h3><span>{data.marketOffers.length} 个机会</span></div>
        <div className="market-offer-list">{data.marketOffers.slice(0, 3).map((offer) => <button key={offer.id} onClick={() => onAction({ action: 'market', label: '', description: '', icon: Bell, offerId: offer.id })}><span><strong>{offer.title}</strong><small>{scaleNames[offer.scale]} · 热度{heatNames[offer.heat]}</small></span><b>{yuan(offer.budget)}</b></button>)}</div>
      </div>
      <dl className="scene-quick-stats market-stats"><div><dt>已交付履历</dt><dd>{data.history.length} 部</dd></div><div><dt>在制作品</dt><dd>{data.projects.length} 部</dd></div><div><dt>合作关系</dt><dd>{data.relationships.length} 组</dd></div></dl>
    </>}
  </aside>
}

export default function PrototypeApp() {
  const data = prototypeData
  const [scene, setScene] = useState<MainScene>('office')
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [sceneProjectIds, setSceneProjectIds] = useState<Record<MainScene, string>>({ office: 'p1', studio: 'p1', meeting: 'p1', market: 'p1' })
  const [sceneEpisodes, setSceneEpisodes] = useState<Record<MainScene, number>>({ office: 7, studio: 7, meeting: 7, market: 7 })
  const [companySelection, setCompanySelection] = useState<CompanySelection>(null)
  const [companyFocus, setCompanyFocus] = useState<CompanyFocus>('people')
  const [workFocus, setWorkFocus] = useState<WorkFocus>('overview')
  const [weekFocus, setWeekFocus] = useState<WeekFocus>('receipt')
  const [receiptWeek, setReceiptWeek] = useState(data.receipts[0].week)
  const [selectedOfferId, setSelectedOfferId] = useState(data.marketOffers[0].id)
  const [transactionExpanded, setTransactionExpanded] = useState(false)
  const [resolvedEvents, setResolvedEvents] = useState<Record<string, EventResolution>>({})
  const [decisionRecords, setDecisionRecords] = useState<DecisionRecords>({})
  const drawerRef = useRef<HTMLElement>(null)
  const lastTriggerRef = useRef<HTMLElement | null>(null)
  const project = data.projects.find((item) => item.id === sceneProjectIds[scene]) ?? data.projects[0]
  const episodeIndex = project.episodes.some((episode) => episode.index === sceneEpisodes[scene]) ? sceneEpisodes[scene] : (project.episodes.find((episode) => episode.isFocus) ?? project.episodes[0]).index
  const receipt = data.receipts.find((item) => item.week === receiptWeek) ?? data.receipts[0]
  const currentReceipt = data.receipts.find((item) => item.week === data.company.week) ?? data.receipts[0]

  const selectScene = (next: MainScene) => { setScene(next); setPanel(null) }
  const selectProject = (id: string) => {
    const next = data.projects.find((item) => item.id === id) ?? data.projects[0]
    setSceneProjectIds((current) => ({ ...current, [scene]: next.id }))
    setSceneEpisodes((current) => ({ ...current, [scene]: (next.episodes.find((episode) => episode.isFocus) ?? next.episodes[0]).index }))
  }
  const selectEpisode = (index: number) => setSceneEpisodes((current) => ({ ...current, [scene]: index }))
  const openProject = (id: string) => {
    selectProject(id)
    setWorkFocus('overview')
    setPanel('work')
  }
  const openWeek = (focus: WeekFocus = 'receipt') => { setWeekFocus(focus); setPanel('week') }
  const handleAction = (option: SceneActionOption) => {
    if (option.offerId) setSelectedOfferId(option.offerId)
    if (option.action === 'company') setCompanyFocus((option.focus as CompanyFocus | undefined) ?? 'people')
    if (option.action === 'work') setWorkFocus((option.focus as WorkFocus | undefined) ?? 'overview')
    if (option.action === 'week') setWeekFocus((option.focus as WeekFocus | undefined) ?? 'receipt')
    setPanel(option.action)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (panel !== null || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable="true"]')) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < sceneOrder.length) { event.preventDefault(); setScene(sceneOrder[index]); setPanel(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel])

  useEffect(() => {
    if (panel === null) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setPanel(null); return }
      if (event.key !== 'Tab' || drawerRef.current === null) return
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter((element) => element.getClientRects().length > 0)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      lastTriggerRef.current?.focus()
    }
  }, [panel])

  return <div className="proto-root prototype-shell" onClickCapture={(event) => {
    if (panel !== null || !(event.target instanceof Element)) return
    const trigger = event.target.closest<HTMLElement>('button')
    if (trigger !== null) lastTriggerRef.current = trigger
  }}>
    <header className="prototype-header">
      <div className="prototype-brand-row">
        <div className="prototype-brand"><p className="eyebrow">ANIME PRODUCTION COMMITTEE / 静态原型</p><h1>{data.company.name}<span className="title-period">。</span></h1></div>
        <div className="prototype-company-stats" aria-label="公司状态">
          <button onClick={() => openWeek('receipt')} aria-label="查看经营周"><span>经营周</span><strong>{data.company.week}<small> / {data.company.totalWeeks}</small></strong></button>
          <button onClick={() => setPanel('finance')} aria-label="查看公司现金"><span>现金</span><strong>{yuan(data.company.cash)}</strong></button>
          <button onClick={() => { setCompanyFocus('company'); setPanel('company') }} aria-label="查看公司声望"><span>声望</span><strong>{data.company.reputation}</strong></button>
          <button onClick={() => selectScene('studio')} aria-label="查看在制作品"><span>在制</span><strong>{data.projects.length}<small> 部</small></strong></button>
          <button onClick={() => { setTransactionExpanded(true); setWeekFocus('decisions') }} aria-label="查看待处理事项"><span>待处理</span><strong>{currentReceipt.mustDecide.length}<small> 项</small></strong></button>
          <button onClick={() => openWeek(currentReceipt.state === 'settlement_rejected' ? 'receipt' : 'next')} aria-label="查看经营状态"><span>经营状态</span><strong>{currentReceipt.state === 'settlement_rejected' ? '预检回滚' : '正常'}</strong></button>
        </div>
      </div>
      <nav className="scene-nav" aria-label="场景切换">{sceneOrder.map((item, index) => {
        const Icon = sceneMeta[item].icon
        return <button key={item} className={scene === item ? 'is-active' : ''} onClick={() => selectScene(item)} aria-current={scene === item ? 'page' : undefined}>
          <span className="scene-nav-index">0{index + 1}</span><Icon size={18} aria-hidden="true" /><span>{sceneMeta[item].title}</span>{item === 'meeting' && currentReceipt.event && <i className="nav-alert">1</i>}
        </button>
      })}</nav>
    </header>

    <main className="prototype-main">
      <div className="scene-intro"><div><p className="eyebrow">{sceneMeta[scene].english} / SCENE 0{sceneOrder.indexOf(scene) + 1}</p><h2>{sceneMeta[scene].title}</h2></div><p>{sceneMeta[scene].description}</p><span className="keyboard-hint"><kbd>1</kbd>—<kbd>4</kbd> 切换场景</span></div>
      <div className="scene-layout">
        <SceneSidebar scene={scene} data={data} project={project} episodeIndex={episodeIndex} receipt={receipt} onSelectProject={selectProject} onSelectEpisode={selectEpisode} onAction={handleAction} />
        <div className="scene-frame" role="region" aria-label={`${sceneMeta[scene].title}画面`}><AssetScene scene={scene} /></div>
      </div>
      <section className="transaction-bar" aria-label="事务中心">
        <div className="transaction-title"><p className="eyebrow">WEEKLY DESK</p><div><h3>事务中心</h3><span className={`transaction-state state-${receipt.state}`}>{weekStateNames[receipt.state]}</span></div></div>
        <div className="transaction-weeks" role="group" aria-label="周次快照">{data.receipts.map((item) => <button key={item.week} className={item.week === receipt.week ? 'is-active' : ''} onClick={() => { setReceiptWeek(item.week); setTransactionExpanded(false) }} aria-label={`第 ${item.week} 周${item.event ? '，有待处理事件' : ''}`} aria-pressed={item.week === receipt.week}>W{item.week}{item.event && <i />}</button>)}</div>
        <p className="transaction-summary">{receipt.event ? `${receipt.event.title} · ${receipt.mustDecide.length} 项必须决定` : receipt.nextFocus[0]}</p>
        <button className="button secondary transaction-toggle" aria-expanded={transactionExpanded} aria-controls="weekly-receipt-preview" onClick={() => setTransactionExpanded((current) => !current)}>{transactionExpanded ? '收起周回执' : '展开周回执'}<ArrowUpRight size={16} aria-hidden="true" /></button>
        {transactionExpanded && <div id="weekly-receipt-preview" className="transaction-detail"><WeeklyReceiptPreview receipt={receipt} onOpen={() => openWeek('receipt')} /></div>}
      </section>
    </main>

    <footer className="prototype-footer"><p>本页面只展示模拟数据与信息层级，不读取后端、不触发真实周推进或存档。场景素材：2dPig Pixel Office（CC0）· Antea（Free Furniture Office Equipment Set，作者署名）· 项目既有工作室、制作人立绘与动画单帧。</p><span>{project.work.done} / {project.work.total} 工作点 · Mock fixture</span></footer>

    {panel !== null && <div className="drawer-layer">
      <div className="drawer-backdrop" onClick={() => setPanel(null)} aria-hidden="true" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={panelNames[panel]} ref={drawerRef}>
        <header className="drawer-header"><div><p className="eyebrow">SCENE DETAIL / {sceneMeta[scene].english}</p><h2>{panelNames[panel]}</h2></div><button className="drawer-close" onClick={() => setPanel(null)} aria-label="关闭详情" autoFocus><X size={20} aria-hidden="true" /></button></header>
        <div className="drawer-content">
          {panel === 'company' && <CompanyOverview data={data} onOpen={openProject} selection={companySelection} onSelect={setCompanySelection} focus={companyFocus} onNavigate={selectScene} />}
          {panel === 'work' && <WorkDetail project={project} data={data} onBack={() => setPanel(null)} focus={workFocus} episodeIndex={episodeIndex} onEpisodeChange={selectEpisode} />}
          {panel === 'week' && <WeeklyOperations data={data} initialWeek={receipt.week} onWeekChange={setReceiptWeek} onOpenProject={openProject} focus={weekFocus} resolvedEvents={resolvedEvents} onResolveEvent={(eventId, resolution) => setResolvedEvents((current) => ({ ...current, [eventId]: resolution }))} decisionRecords={decisionRecords} onRecordDecision={(decisionId, option) => setDecisionRecords((current) => ({ ...current, [decisionId]: { option } }))} />}
          {panel === 'finance' && <FinanceArchive data={data} />}
          {panel === 'market' && <MarketOffers data={data} selectedId={selectedOfferId} onSelect={setSelectedOfferId} />}
          {panel === 'release' && <ReleaseStatus data={data} onOpen={openProject} />}
          {panel === 'archive' && <MarketArchive data={data} />}
          {panel === 'performance' && <MarketPerformance data={data} />}
        </div>
      </aside>
    </div>}
  </div>
}
