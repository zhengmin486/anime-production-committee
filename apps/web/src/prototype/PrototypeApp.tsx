import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BellRing, Building2, ChevronDown, ChevronUp, Clapperboard, Coins, Flag, Handshake, HeartPulse, Layers3, ScrollText, Star, Store, X } from 'lucide-react'
import { CompanyOverview } from './CompanyOverview'
import { MeetingPanels, MarketPanels } from './ScenePanels'
import { SceneStage, SceneSummary, sceneNames } from './SceneStage'
import type { Scene } from './SceneStage'
import { WeeklyOperations } from './WeeklyOperations'
import { WorkDetail } from './WorkDetail'
import { prototypeData } from './mockData'
import { projectWork, scaleNames, weekStateNames } from './model'
import { yuan } from './bits'
import './prototype.css'

const sceneIcons = { office: Building2, studio: Clapperboard, meeting: Handshake, market: Store }
const scenes: Scene[] = ['office', 'studio', 'meeting', 'market']
const stateLabels = { normal: '正常经营', event_pending: '事件待处理', cash_crisis: '限时资金危机', closing: '关闭中' }

export default function PrototypeApp() {
  const data = prototypeData
  const [scene, setScene] = useState<Scene>('office')
  const [projectId, setProjectId] = useState(data.projects[0].id)
  const [week, setWeek] = useState(data.receipts[0].week)
  const [weeklyOpen, setWeeklyOpen] = useState(false)
  const [centerOpen, setCenterOpen] = useState(false)
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null)
  const [resolvedEvents, setResolvedEvents] = useState<Set<string>>(() => new Set())
  const previousScene = useRef<Scene>('office')
  const pendingScroll = useRef(0)
  const scrollPositions = useRef<Record<Scene, number>>({ office: 0, studio: 0, meeting: 0, market: 0 })
  const project = data.projects.find((item) => item.id === projectId) ?? data.projects[0]
  const receipt = data.receipts.find((item) => item.week === week) ?? data.receipts[0]
  const eventResolved = receipt.event !== null && resolvedEvents.has(receipt.event.id)
  const activeReceipt = eventResolved ? { ...receipt, event: null, state: 'normal' as const } : receipt
  const activeState = activeReceipt.state
  const displayCash = activeReceipt.crisis?.cashAfterSettle ?? activeReceipt.closing?.cash ?? data.company.cash
  const pendingEvents = activeReceipt.event ? 1 : 0
  const totalWork = data.projects.reduce((sum, item) => sum + projectWork(item).total, 0)
  const doneWork = data.projects.reduce((sum, item) => sum + projectWork(item).done, 0)
  const solvency = activeState === 'cash_crisis' ? '需要自救' : activeState === 'closing' ? '已停止' : `${data.company.runwayWeeks} 周`

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.matches('input, select, textarea')) return
      const index = Number(event.key) - 1
      if (index >= 0 && index < scenes.length) {
        event.preventDefault()
        changeScene(scenes[index])
      }
      if (event.key === 'Escape') { setWeeklyOpen(false); setCenterOpen(false); setSelectedHotspotId(null) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  useLayoutEffect(() => {
    if (previousScene.current !== scene) {
      pendingScroll.current = scrollPositions.current[scene]
      previousScene.current = scene
      document.documentElement.scrollTop = pendingScroll.current
      document.body.scrollTop = pendingScroll.current
    }
  }, [scene])

  useEffect(() => {
    const saveScroll = () => { scrollPositions.current[scene] = window.scrollY }
    window.addEventListener('scroll', saveScroll, { passive: true })
    return () => window.removeEventListener('scroll', saveScroll)
  }, [scene])

  function changeScene(next: Scene) {
    scrollPositions.current[scene] = window.scrollY
    setScene(next)
    setCenterOpen(false)
    setSelectedHotspotId(null)
  }

  const openProject = (id: string) => {
    setProjectId(id)
    setWeeklyOpen(false)
    changeScene('studio')
  }
  const openWeekly = () => { setWeeklyOpen(true); setCenterOpen(false) }
  const selectWeek = (next: number) => setWeek(next)
  const resolveEvent = (eventId: string) => setResolvedEvents((current) => new Set([...current, eventId]))

  return <div className={`proto-root proto-game state-${activeState}`}>
    <header className="game-header">
      <button className="game-brand" onClick={() => changeScene('office')} aria-label="返回办公室">
        <span className="brand-emblem"><Clapperboard size={22} /></span><span><strong>{data.company.name}</strong><small>动画制作委员会</small></span>
      </button>
      <nav className="scene-nav" aria-label="场景切换">{scenes.map((item, index) => {
        const Icon = sceneIcons[item]
        return <button key={item} className={scene === item ? 'is-active' : ''} aria-current={scene === item ? 'page' : undefined} onClick={() => changeScene(item)}><Icon size={17} /><span>{sceneNames[item]}</span><kbd>{index + 1}</kbd>{item === 'meeting' && pendingEvents > 0 && <b className="nav-alert">{pendingEvents}</b>}</button>
      })}</nav>
      <button className="weekly-entry" onClick={openWeekly}><ScrollText size={17} />每周经营</button>
    </header>

    <section className="global-hud" aria-label="公司全局状态">
      <div><span><Layers3 size={13} />周次</span><strong>第 {activeReceipt.week} <small>/ {data.company.totalWeeks}</small></strong></div>
      <div><span><Coins size={13} />现金</span><strong>{yuan(displayCash)}</strong></div>
      <div><span><Star size={13} />声望</span><strong>{data.company.reputation}</strong></div>
      <div><span><Clapperboard size={13} />在制作品</span><strong>{data.projects.length} <small>部 / {data.projects.reduce((sum, item) => sum + item.episodeCount, 0)} 集</small></strong></div>
      <div className={pendingEvents ? 'hud-alert' : ''}><span><Flag size={13} />待处理事件</span><strong>{pendingEvents} <small>件</small></strong></div>
      <div className={activeState === 'cash_crisis' ? 'hud-danger' : ''}><span><HeartPulse size={13} />偿付能力</span><strong>{solvency}</strong></div>
    </section>

    <div className="prototype-stage-wrap">
      {scene === 'studio' && <div className="proto-switch studio-switch" aria-label="作品切换">{data.projects.map((item) => <button key={item.id} className={`switch-chip${item.id === project.id ? ' is-active' : ''}`} onClick={() => setProjectId(item.id)}>{item.title}<small>{scaleNames[item.scale]}</small></button>)}</div>}
      <SceneStage scene={scene} data={data} project={project} receipt={activeReceipt} selectedHotspotId={selectedHotspotId} onSelectHotspot={setSelectedHotspotId} onNavigate={changeScene} onOpenProject={openProject} onOpenWeekly={openWeekly} onSelectWeek={selectWeek} />
      <SceneSummary scene={scene} data={data} project={project} receipt={activeReceipt} />
    </div>

    <main className="scene-content">
      <div hidden={scene !== 'office'}><CompanyOverview data={data} onOpen={openProject} /></div>
      <div hidden={scene !== 'studio'}><WorkDetail key={project.id} project={project} data={data} onBack={() => changeScene('office')} /></div>
      <div hidden={scene !== 'meeting'}><MeetingPanels data={data} receipt={activeReceipt} onOpenWeekly={openWeekly} /></div>
      <div hidden={scene !== 'market'}><MarketPanels data={data} /></div>
    </main>

    <div className="weekly-drawer" hidden={!weeklyOpen}>
      <div className="drawer-head"><div><p className="eyebrow">WEEKLY OPERATIONS / 全局事务</p><h2>每周经营</h2></div><button className="icon-button" onClick={() => setWeeklyOpen(false)} aria-label="关闭每周经营"><X size={20} /></button></div>
      <div className="drawer-body"><WeeklyOperations data={data} onOpenProject={openProject} week={week} onWeekChange={selectWeek} onEventResolved={resolveEvent} /></div>
    </div>

    <section className={`transaction-center ${centerOpen ? 'is-open' : ''} state-${activeState}`} aria-label="经营事务中心">
      <button className="center-toggle" onClick={() => setCenterOpen((open) => !open)} aria-expanded={centerOpen}>
        <span className="center-led"><BellRing size={17} /></span><strong>经营事务中心</strong><span className="center-state">{stateLabels[activeState]}</span><span className="center-headline">{activeReceipt.headline}</span><span className="center-count">{pendingEvents > 0 ? `${pendingEvents} 件待处理` : '暂无待决事件'}</span>{centerOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
      </button>
      {centerOpen && <div className="center-content">
        <div className="center-event"><p className="eyebrow">EVENT / 事件</p><h3>{activeReceipt.event?.title ?? '本周没有需要处理的事件'}</h3><p>{activeReceipt.event?.description ?? '方针自动执行，普通周只读回执。'}</p>{activeReceipt.event && <button className="button primary" onClick={() => changeScene('meeting')}>前往会议室 <Flag size={14} /></button>}</div>
        <div className="center-receipt"><p className="eyebrow">RECEIPT / 周回执</p><h3>{activeReceipt.headline}</h3><p>现金变化 {activeReceipt.cashDelta > 0 ? '+' : ''}{yuan(activeReceipt.cashDelta)} · 需要决定 {activeReceipt.mustDecide.length} 项</p><div className="center-weeks">{data.receipts.map((item) => <button key={item.week} className={item.week === week ? 'is-active' : ''} onClick={() => selectWeek(item.week)}>第 {item.week} 周<small>{weekStateNames[item.state]}</small></button>)}</div></div>
        <div className="center-notice"><p className="eyebrow">NOTICE / 边界</p><h3>{activeState === 'cash_crisis' ? '停止生产，先恢复偿付能力' : activeState === 'closing' ? '公司进入结束流程' : '场景切换不会推进时间'}</h3><p>{activeState === 'cash_crisis' ? `不自动借款；第 ${activeReceipt.crisis?.deadlineWeek} 周前必须完成自救。` : activeState === 'closing' ? '仅允许达标结清与经营总结预览。' : '所有场景共享同一份模拟数据；切换、展开面板与确认事件均不提交真实命令。'}</p><button className="button secondary" onClick={openWeekly}>打开完整周经营</button></div>
      </div>}
    </section>

    <footer className="proto-foot">
      <p>四场景开罗式交互原型：办公室为主场景，工作室、会议室、发行与市场为副场景。像素场景负责空间与人物，现代面板负责经营信息；全部使用确定性模拟数据，不推进真实周数、不接入存档或后端。</p>
      <p className="proto-foot-meta">WP10 / F1a–F1c · 快捷键 1–4 切换场景，Esc 关闭面板 · 访问方式 <code>?view=prototype</code> · 总工作量 {doneWork} / {totalWork} 工作点</p>
    </footer>
  </div>
}
