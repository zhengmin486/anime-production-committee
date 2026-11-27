import { useEffect, useState } from 'react'
import { ArrowUpRight, Building2, Clapperboard, Megaphone, UsersRound, X } from 'lucide-react'
import { AssetScene } from './AssetScenes'
import type { MainScene, SceneAction } from './AssetScenes'
import { CompanyOverview } from './CompanyOverview'
import { FinanceArchive } from './FinanceArchive'
import { MarketArchive, MarketOffers, MarketPerformance, ReleaseStatus } from './MarketBusiness'
import { prototypeData } from './mockData'
import { deliveredEpisodes, episodeStageShortNames, EPISODE_STAGES, heatNames, projectCompletion, projectWork, scaleNames, sumWork, weekStateNames } from './model'
import type { Project, PrototypeData, WeeklyReceipt } from './model'
import { Bar, yuan } from './bits'
import { WeeklyOperations } from './WeeklyOperations'
import { WorkDetail } from './WorkDetail'
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

function CashCard({ data, label = '公司现金' }: { data: PrototypeData; label?: string }) {
  return <div className="scene-cash-card">
    <span>{label}</span>
    <strong>{yuan(data.company.cash)}</strong>
    <small>唯一现金池 · 可支撑 {data.company.runwayWeeks} 周</small>
  </div>
}

function ProjectRow({ project, active, onClick }: { project: Project; active: boolean; onClick: () => void }) {
  const completion = projectCompletion(project)
  return <button className={`scene-project-row${active ? ' is-active' : ''}`} onClick={onClick}>
    <span className="project-row-top"><strong>{project.title}</strong><small>{scaleNames[project.scale]}</small></span>
    <span className="project-row-meta"><span>{deliveredEpisodes(project)} / {project.episodeCount} 集已交付</span><b>{completion}%</b></span>
    <Bar value={completion} tone={completion < project.plannedCompletion ? 'behind' : 'lead'} />
  </button>
}

function SceneSidebar({ scene, data, project, receipt, onSelectProject, onAction }: {
  scene: MainScene
  data: PrototypeData
  project: Project
  receipt: WeeklyReceipt
  onSelectProject: (id: string) => void
  onAction: (action: SceneAction) => void
}) {
  if (scene === 'office') return <aside className="scene-sidebar" role="region" aria-label="办公室信息">
    <div className="scene-side-heading"><p className="eyebrow">COMPANY OVERVIEW</p><h2>公司正在发生什么</h2><p>主地图只保留此刻最值得关注的变化，完整账目与人员表从详情进入。</p></div>
    <CashCard data={data} />
    <dl className="scene-quick-stats">
      <div><dt>公司声望</dt><dd>{data.company.reputation}</dd></div>
      <div><dt>核心 / 临时</dt><dd>{data.staff.filter((person) => person.employment === 'core').length} / {data.staff.filter((person) => person.employment === 'temporary').length}</dd></div>
      <div><dt>在制作品</dt><dd>{data.projects.length} 部</dd></div>
    </dl>
    <div className="scene-side-section"><div className="scene-section-title"><h3>在制作品</h3><span>点击进入制作现场</span></div>
      <div className="scene-project-list">{data.projects.map((item) => <ProjectRow key={item.id} project={item} active={item.id === project.id} onClick={() => { onSelectProject(item.id); onAction('work') }} />)}</div>
    </div>
    <button className="button secondary scene-side-action" onClick={() => onAction('company')}>查看公司账与人员<ArrowUpRight size={16} aria-hidden="true" /></button>
  </aside>

  if (scene === 'studio') {
    const focusEpisode = project.episodes.find((episode) => episode.isFocus) ?? project.episodes[0]
    const commonWork = sumWork(project.commonItems)
    const completion = projectCompletion(project)
    return <aside className="scene-sidebar" role="region" aria-label="制作现场信息">
      <div className="scene-side-heading"><p className="eyebrow">PRODUCTION BOARD</p><h2>这部作品做到哪了</h2><p>公共制作与单集制作分开；工作项默认折叠，不把长列表铺到首屏。</p></div>
      <div className="scene-project-switch" role="group" aria-label="作品切换">{data.projects.map((item) => <button key={item.id} className={item.id === project.id ? 'is-active' : ''} onClick={() => onSelectProject(item.id)}>{item.title}</button>)}</div>
      <div className="scene-focus-project"><span>{scaleNames[project.scale]} · {project.mode === 'committee' ? '制作委员会' : '承制'}</span><h3>{project.title}</h3><div><strong>{completion}%</strong><small>计划 {project.plannedCompletion}%</small></div><Bar value={completion} tone={completion < project.plannedCompletion ? 'behind' : 'lead'} /></div>
      <div className="scene-side-section"><div className="scene-section-title"><h3>第 {focusEpisode.index} 集《{focusEpisode.title}》</h3><span>六阶段</span></div>
        <div className="scene-stage-grid">{EPISODE_STAGES.map((stage) => {
          const work = sumWork(focusEpisode.workItems.filter((item) => item.stage === stage))
          const percent = work.total === 0 ? 0 : Math.round(work.done / work.total * 100)
          return <div key={stage}><span>{episodeStageShortNames[stage]}</span><strong>{percent}%</strong><i><b style={{ width: `${percent}%` }} /></i></div>
        })}</div>
      </div>
      <div className="scene-common-work"><div><span>公共制作</span><strong>{commonWork.done} / {commonWork.total} 点</strong></div><Bar value={commonWork.total === 0 ? 0 : commonWork.done / commonWork.total * 100} tone="neutral" /></div>
      <button className="button primary scene-side-action" onClick={() => onAction('work')}>打开作品详情<ArrowUpRight size={16} aria-hidden="true" /></button>
    </aside>
  }

  if (scene === 'meeting') return <aside className="scene-sidebar" role="region" aria-label="会议室信息">
    <div className="scene-side-heading"><p className="eyebrow">COMMITTEE TABLE</p><h2>需要集体决策的事</h2><p>会议室承载有分量的选择，不新增谈判数值或会议小游戏。</p></div>
    {receipt.event ? <div className="meeting-agenda-card is-active"><span className="agenda-state">待处理 · 第 {receipt.event.deadlineWeek} 周前</span><h3>{receipt.event.title}</h3><p>{receipt.event.description}</p><button className="button primary" onClick={() => onAction('week')}>进入议题处理<ArrowUpRight size={16} aria-hidden="true" /></button></div> :
      <div className="meeting-agenda-card"><span className="agenda-state">本期无待决议题</span><h3>桌案已准备好</h3><p>有待处理事件时，议题会出现在这里并可直接进入处理。</p></div>}
    <div className="scene-side-section"><div className="scene-section-title"><h3>会议结构</h3><span>只读预览</span></div>
      <ul className="meeting-structure"><li><span>01</span><div><strong>待决议题</strong><small>来自事件卡与合法选项</small></div></li><li><span>02</span><div><strong>参会方</strong><small>产业关系尚未开放</small></div></li><li><span>03</span><div><strong>决策文件</strong><small>确定代价、可能收益与风险</small></div></li></ul>
    </div>
    <p className="scene-boundary-note">M4 产业关系落地前，委员会与合作区块只做结构展示，不宣称可玩。</p>
  </aside>

  return <aside className="scene-sidebar" role="region" aria-label="发行与市场信息">
    <div className="scene-side-heading"><p className="eyebrow">MARKET & RELEASE</p><h2>市场业务从这里展开</h2><p>企划承接与作品发行是两个主入口；公告板、作品墙和业绩看板共用同一场景。</p></div>
    <div className="market-entry-grid">
      <button className="button primary" onClick={() => onAction('market')}>企划承接<ArrowUpRight size={16} aria-hidden="true" /></button>
      <button className="button secondary" onClick={() => onAction('release')}>作品发行<ArrowUpRight size={16} aria-hidden="true" /></button>
    </div>
    <CashCard data={data} label="结算后公司现金" />
    <div className="scene-side-section"><div className="scene-section-title"><h3>市场企划</h3><span>{data.marketOffers.length} 个机会</span></div>
      <div className="market-offer-list">{data.marketOffers.slice(0, 3).map((offer) => <button key={offer.id} onClick={() => onAction('market')}><span><strong>{offer.title}</strong><small>{scaleNames[offer.scale]} · 热度{heatNames[offer.heat]}</small></span><b>{yuan(offer.budget)}</b></button>)}</div>
    </div>
    <dl className="scene-quick-stats market-stats"><div><dt>已交付履历</dt><dd>{data.history.length} 部</dd></div><div><dt>在制作品</dt><dd>{data.projects.length} 部</dd></div><div><dt>合作关系</dt><dd>{data.relationships.length} 组</dd></div></dl>
    <button className="button secondary scene-side-action" onClick={() => onAction('performance')}>查看业绩与历史<ArrowUpRight size={16} aria-hidden="true" /></button>
  </aside>
}

export default function PrototypeApp() {
  const data = prototypeData
  const [scene, setScene] = useState<MainScene>('office')
  const [panel, setPanel] = useState<PanelName | null>(null)
  const [projectId, setProjectId] = useState(data.projects[0].id)
  const [receiptWeek, setReceiptWeek] = useState(data.receipts[0].week)
  const project = data.projects.find((item) => item.id === projectId) ?? data.projects[0]
  const receipt = data.receipts.find((item) => item.week === receiptWeek) ?? data.receipts[0]
  const work = projectWork(project)

  const selectScene = (next: MainScene) => { setScene(next); setPanel(null) }
  const openProject = (id: string) => { setProjectId(id); setPanel('work') }
  const handleAction = (action: SceneAction) => {
    if (action === 'work') openProject(project.id)
    else setPanel(action)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPanel(null); return }
      if (panel !== null || event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('input, select, textarea, [contenteditable="true"]')) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < sceneOrder.length) setScene(sceneOrder[index])
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel])

  useEffect(() => {
    if (panel === null) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [panel])

  return <div className="proto-root prototype-shell">
    <header className="prototype-header">
      <div className="prototype-brand-row">
        <div className="prototype-brand"><p className="eyebrow">ANIME PRODUCTION COMMITTEE / 静态原型</p><h1>{data.company.name}<span className="title-period">。</span></h1></div>
        <div className="prototype-company-stats" aria-label="公司状态">
          <div><span>经营周</span><strong>{data.company.week}<small> / {data.company.totalWeeks}</small></strong></div>
          <div><span>现金</span><strong>{yuan(data.company.cash)}</strong></div>
          <div><span>声望</span><strong>{data.company.reputation}</strong></div>
          <div><span>在制</span><strong>{data.projects.length}<small> 部</small></strong></div>
        </div>
      </div>
      <nav className="scene-nav" aria-label="场景切换">{sceneOrder.map((item, index) => {
        const Icon = sceneMeta[item].icon
        return <button key={item} className={scene === item ? 'is-active' : ''} onClick={() => selectScene(item)} aria-current={scene === item ? 'page' : undefined}>
          <span className="scene-nav-index">0{index + 1}</span><Icon size={18} aria-hidden="true" /><span>{sceneMeta[item].title}</span>{item === 'meeting' && receipt.event && <i className="nav-alert">1</i>}
        </button>
      })}</nav>
    </header>

    <main className="prototype-main">
      <div className="scene-intro"><div><p className="eyebrow">{sceneMeta[scene].english} / SCENE 0{sceneOrder.indexOf(scene) + 1}</p><h2>{sceneMeta[scene].title}</h2></div><p>{sceneMeta[scene].description}</p><span className="keyboard-hint"><kbd>1</kbd>—<kbd>4</kbd> 切换场景</span></div>
      <div className="scene-layout">
        <div className={`scene-frame${scene === 'market' ? ' scene-frame-market' : ''}`}><AssetScene scene={scene} project={project} hasEvent={receipt.event !== null} onAction={handleAction} /></div>
        <SceneSidebar scene={scene} data={data} project={project} receipt={receipt} onSelectProject={setProjectId} onAction={handleAction} />
      </div>
      <section className="transaction-bar" aria-label="事务中心">
        <div className="transaction-title"><p className="eyebrow">WEEKLY DESK</p><div><h3>事务中心</h3><span className={`transaction-state state-${receipt.state}`}>{weekStateNames[receipt.state]}</span></div></div>
        <div className="transaction-weeks" role="group" aria-label="周次快照">{data.receipts.map((item) => <button key={item.week} className={item.week === receipt.week ? 'is-active' : ''} onClick={() => setReceiptWeek(item.week)} aria-label={`第 ${item.week} 周${item.event ? '，有待处理事件' : ''}`}>W{item.week}{item.event && <i />}</button>)}</div>
        <p className="transaction-summary">{receipt.event ? `${receipt.event.title} · ${receipt.mustDecide.length} 项必须决定` : receipt.nextFocus[0]}</p>
        <button className="button secondary" onClick={() => setPanel('week')}>打开周经营<ArrowUpRight size={16} aria-hidden="true" /></button>
      </section>
    </main>

    <footer className="prototype-footer"><p>本页面只展示模拟数据与信息层级，不读取后端、不触发真实周推进或存档。场景素材：2dPig Pixel Office（CC0）· Antea（Free Furniture Office Equipment Set，作者署名）· 项目既有工作室、制作人立绘与动画单帧。</p><span>{work.done} / {work.total} 工作点 · Mock fixture</span></footer>

    {panel !== null && <div className="drawer-layer">
      <div className="drawer-backdrop" onClick={() => setPanel(null)} aria-hidden="true" />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label={panelNames[panel]}>
        <header className="drawer-header"><div><p className="eyebrow">SCENE DETAIL / {sceneMeta[scene].english}</p><h2>{panelNames[panel]}</h2></div><button className="drawer-close" onClick={() => setPanel(null)} aria-label="关闭详情" autoFocus><X size={20} aria-hidden="true" /></button></header>
        <div className="drawer-content">
          {panel === 'company' && <CompanyOverview data={data} onOpen={openProject} />}
          {panel === 'work' && <WorkDetail project={project} data={data} onBack={() => setPanel(null)} />}
          {panel === 'week' && <WeeklyOperations data={data} initialWeek={receipt.week} onWeekChange={setReceiptWeek} onOpenProject={openProject} />}
          {panel === 'finance' && <FinanceArchive data={data} />}
          {panel === 'market' && <MarketOffers data={data} />}
          {panel === 'release' && <ReleaseStatus data={data} onOpen={openProject} />}
          {panel === 'archive' && <MarketArchive data={data} />}
          {panel === 'performance' && <MarketPerformance data={data} />}
        </div>
      </aside>
    </div>}
  </div>
}
