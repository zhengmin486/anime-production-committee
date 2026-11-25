import type { ReactNode } from 'react'
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, ChevronRight, Clapperboard, Coins, DoorOpen, Flag, Megaphone, MonitorPlay, PackageOpen, Users, WalletCards } from 'lucide-react'
import { deliveredEpisodes, projectCompletion, weekStateNames } from './model'
import type { PrototypeData, WeeklyReceipt } from './model'
import { PixelRoom } from './PixelScenes'

export type Scene = 'office' | 'studio' | 'meeting' | 'market'

export const sceneNames: Record<Scene, string> = { office: '办公室', studio: '工作室', meeting: '会议室', market: '发行与市场' }
const sceneNotes: Record<Scene, string> = {
  office: '经营中枢 · 看清全局，再决定把人和钱投向哪里',
  studio: '制作现场 · 作品 → 单集 → 六阶段 → 工作项',
  meeting: '决策空间 · 处理异常，确认新的承诺',
  market: '发行与市场 · 寻找机会，经营长期合作',
}

function Hotspot({ children, icon, label, detail, className, onClick, alert = false }: { children?: ReactNode; icon: ReactNode; label: string; detail?: string; className: string; onClick: () => void; alert?: boolean }) {
  return <button className={`scene-hotspot ${alert ? 'has-alert' : ''} ${className}`} onClick={onClick}>
    {children}<span className="hotspot-pin">{icon}{alert && <b className="hotspot-alert">!</b>}</span><span className="hotspot-label">{label}{detail && <small>{detail}</small>}<ChevronRight size={14} aria-hidden="true" /></span>
  </button>
}

export function SceneStage({ scene, data, receipt, onNavigate, onOpenProject, onOpenWeekly, onSelectWeek }: {
  scene: Scene; data: PrototypeData; receipt: WeeklyReceipt; onNavigate: (scene: Scene) => void
  onOpenProject: (id: string) => void; onOpenWeekly: () => void; onSelectWeek: (week: number) => void
}) {
  const focus = data.projects.find((project) => project.episodes.some((episode) => episode.isFocus)) ?? data.projects[0]
  const stateClass = `window-${receipt.state}${receipt.state === 'event_pending' ? ' has-event' : ''}`
  return <section className={`scene-stage scene-${scene} ${stateClass}`} aria-label={`${sceneNames[scene]}场景`}>
    <div className="scene-art" key={scene}>
      <PixelRoom scene={scene} />
      <div className="scene-light" />
    </div>
    <div className="scene-caption"><span className="scene-number">0{{ office: 1, studio: 2, meeting: 3, market: 4 }[scene]}</span><div><p>{scene === 'office' ? 'MAIN SCENE / 主场景' : 'SUB SCENE / 副场景'}</p><h2>{sceneNames[scene]}</h2></div></div>
    <div className="scene-status"><span className={`status-dot status-${receipt.state}`} />{weekStateNames[receipt.state]}<small>场景切换不推进时间</small></div>

    {scene === 'office' && <>
      <Hotspot className="at-projects" icon={<Clapperboard size={19} />} label="作品看板" detail={`${data.projects.length} 部在制`} onClick={() => onOpenProject(focus.id)} />
      <Hotspot className="at-finance" icon={<WalletCards size={19} />} label="公司账本" detail="唯一现金池" onClick={() => document.getElementById('company-ledger')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      <Hotspot className="at-people" icon={<Users size={19} />} label="人员分配" detail="本周唯一归属" onClick={() => document.getElementById('people-board')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      <Hotspot className="at-meeting" icon={<Flag size={19} />} label={receipt.event ? '处理异常事件' : '会议室'} detail={receipt.event ? '有待决定事项' : 'M4 合作功能'} alert={Boolean(receipt.event)} onClick={() => onNavigate('meeting')} />
      <Hotspot className="at-studio" icon={<MonitorPlay size={19} />} label="进入制作现场" detail="查看六阶段" onClick={() => onNavigate('studio')} />
      <Hotspot className="at-market" icon={<Megaphone size={19} />} label="发行与市场" detail={`${data.marketOffers.length} 个企划`} onClick={() => onNavigate('market')} />
    </>}
    {scene === 'studio' && <>
      <Hotspot className="at-projects" icon={<Clapperboard size={19} />} label="当前作品" detail={focus.title} onClick={() => onOpenProject(focus.id)} />
      <Hotspot className="at-finance" icon={<PackageOpen size={19} />} label="外包与产能" detail={`${data.outsourcing.filter((task) => task.status !== 'delivered').length} 项在制`} onClick={() => document.getElementById('production-resources')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      <Hotspot className="at-meeting" icon={<CalendarDays size={19} />} label="本周回执" detail="查看产出原因" onClick={onOpenWeekly} />
      <Hotspot className="at-market" icon={<DoorOpen size={19} />} label="返回办公室" onClick={() => onNavigate('office')} />
    </>}
    {scene === 'meeting' && <>
      <Hotspot className="at-meeting" icon={<Flag size={19} />} label={receipt.event?.title ?? '本周没有事件'} detail={receipt.event ? '需要玩家确认' : '普通经营周'} alert={Boolean(receipt.event)} onClick={onOpenWeekly} />
      <Hotspot className="at-finance" icon={<BriefcaseBusiness size={19} />} label="长期合作关系" detail="M4 功能预览" onClick={() => document.getElementById('meeting-relations')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      <Hotspot className="at-market" icon={<DoorOpen size={19} />} label="返回办公室" onClick={() => onNavigate('office')} />
    </>}
    {scene === 'market' && <>
      <Hotspot className="at-projects" icon={<Megaphone size={19} />} label="企划机会" detail={`${data.marketOffers.length} 个样本`} onClick={() => document.getElementById('market-offers')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      <Hotspot className="at-finance" icon={<Coins size={19} />} label="现金与历史" detail="流水 / Archive" onClick={() => document.getElementById('market-finance')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
      <Hotspot className="at-market" icon={<DoorOpen size={19} />} label="返回办公室" onClick={() => onNavigate('office')} />
    </>}
    <div className="scene-bottomline"><p>{sceneNotes[scene]}</p><span><ArrowUpRight size={14} />点击设施或人物打开对应面板</span></div>
    <div className="scene-receipts" aria-label="经营窗口快照">{data.receipts.map((item) => <button key={item.week} className={item.week === receipt.week ? 'is-active' : ''} onClick={() => onSelectWeek(item.week)}><span>W{item.week}</span><span className={`status-dot status-${item.state}`} />{weekStateNames[item.state]}</button>)}</div>
    {receipt.state === 'cash_crisis' && <div className="crisis-ticker"><strong>资金危机</strong> 本周停止生产 · 不自动借款 · 自救期限第 {receipt.crisis?.deadlineWeek} 周前</div>}
    {receipt.state === 'closing' && <div className="crisis-ticker closing"><strong>关闭中</strong> 停止周推进 · 仅允许达标结清与经营总结</div>}
  </section>
}

export function SceneSummary({ scene, data, receipt }: { scene: Scene; data: PrototypeData; receipt: WeeklyReceipt }) {
  const project = data.projects[0]
  const cash = receipt.crisis?.cashAfterSettle ?? receipt.closing?.cash ?? data.company.cash
  const facts = scene === 'office' ? [
    { label: '在制作品', value: `${data.projects.length} 部`, hint: `${data.projects.reduce((sum, item) => sum + deliveredEpisodes(item), 0)} 集已交付` },
    { label: '公司现金', value: `¥${cash.toLocaleString('zh-CN')}`, hint: '全公司唯一现金池' },
    { label: '本周人员', value: `${data.staff.length} 人`, hint: '每人只归属一个项目' },
  ] : scene === 'studio' ? [
    { label: project.title, value: `${projectCompletion(project)}%`, hint: `单集 ${deliveredEpisodes(project)} / ${project.episodeCount} 已交付` },
    { label: '当前定向', value: project.focusLabel ?? '未设置', hint: '不额外花钱，有机会成本' },
    { label: '制作层级', value: '4 层', hint: '作品 → 单集 → 六阶段 → 工作项' },
  ] : scene === 'meeting' ? [
    { label: '委员会成员', value: `${project.committee.length} 位`, hint: '随作品成立与结算' },
    { label: '长期合作方', value: `${data.relationships.length} 家`, hint: '关系跨作品保留' },
    { label: '待处理事件', value: '1 件', hint: '推进前必须作出决定' },
  ] : [
    { label: '市场企划', value: `${data.marketOffers.length} 个`, hint: '声望与资源形成门槛' },
    { label: '已交付作品', value: `${data.history.length} 部`, hint: 'Archive 只记录已交付' },
    { label: '合作渠道', value: `${data.relationships.filter((item) => item.kind !== 'studio').length} 类`, hint: 'M4 扩展完整结算' },
  ]
  return <div className="scene-summary">{facts.map((fact) => <div key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong><small>{fact.hint}</small></div>)}<button onClick={() => {
    const stage = document.querySelector('.scene-stage')
    const top = stage ? stage.getBoundingClientRect().bottom + window.scrollY : 0
    window.scrollTo({ top, behavior: 'smooth' })
  }}>查看{sceneNames[scene]}详情 <ArrowUpRight size={15} /></button></div>
}
