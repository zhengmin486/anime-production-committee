import type { ReactNode } from 'react'
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, ChevronRight, Clapperboard, Coins, DoorOpen, Flag, Megaphone, MonitorPlay, PackageOpen, Users, WalletCards, X } from 'lucide-react'
import { deliveredEpisodes, projectCompletion, projectWork, weekStateNames } from './model'
import type { Project, PrototypeData, WeeklyReceipt } from './model'
import { PixelRoom } from './PixelScenes'
import { yuan } from './bits'

export type Scene = 'office' | 'studio' | 'meeting' | 'market'

export const sceneNames: Record<Scene, string> = { office: '办公室', studio: '工作室', meeting: '会议室', market: '发行与市场' }
const sceneNotes: Record<Scene, string> = {
  office: '经营中枢 · 看清全局，再决定把人和钱投向哪里',
  studio: '制作现场 · 作品 → 单集 → 六阶段 → 工作项',
  meeting: '决策空间 · 处理异常，确认新的承诺',
  market: '发行与市场 · 寻找机会，经营长期合作',
}

interface HotspotContext {
  eyebrow: string
  title: string
  description: string
  facts: { label: string; value: string }[]
  actionLabel: string
  onAction: () => void
}

interface HotspotDefinition {
  id: string
  icon: ReactNode
  label: string
  detail?: string
  className: string
  alert?: boolean
  context: HotspotContext
}

function Hotspot({ hotspot, selected, onSelect }: { hotspot: HotspotDefinition; selected: boolean; onSelect: (id: string) => void }) {
  return <button
    type="button"
    data-hotspot-id={hotspot.id}
    className={`scene-hotspot${selected ? ' is-selected' : ''}${hotspot.alert ? ' has-alert' : ''} ${hotspot.className}`}
    aria-pressed={selected}
    aria-controls="scene-context-panel"
    onClick={() => onSelect(hotspot.id)}
  >
    <span className="hotspot-pin">{hotspot.icon}{hotspot.alert && <b className="hotspot-alert">!</b>}</span>
    <span className="hotspot-label">{hotspot.label}{hotspot.detail && <small>{hotspot.detail}</small>}<ChevronRight size={14} aria-hidden="true" /></span>
  </button>
}

export function SceneStage({ scene, data, project, receipt, selectedHotspotId, onSelectHotspot, onNavigate, onOpenProject, onOpenWeekly, onSelectWeek }: {
  scene: Scene; data: PrototypeData; project: Project; receipt: WeeklyReceipt; selectedHotspotId: string | null
  onSelectHotspot: (id: string | null) => void; onNavigate: (scene: Scene) => void; onOpenProject: (id: string) => void
  onOpenWeekly: () => void; onSelectWeek: (week: number) => void
}) {
  const focus = scene === 'studio' ? project : data.projects.find((item) => item.episodes.some((episode) => episode.isFocus)) ?? data.projects[0]
  const focusEpisode = focus.episodes.find((episode) => episode.isFocus) ?? focus.episodes.find((episode) => episode.status === 'producing') ?? focus.episodes[0]
  const completion = projectCompletion(focus)
  const cash = receipt.crisis?.cashAfterSettle ?? receipt.closing?.cash ?? data.company.cash
  const activeOutsource = data.outsourcing.filter((task) => task.status !== 'delivered')
  const allocatedCount = data.allocations.filter((item) => item.projectId !== null).length
  const departureWarnings = data.staff.filter((item) => item.departureWarning).length
  const totalWork = data.projects.reduce((sum, item) => sum + projectWork(item).total, 0)
  const doneWork = data.projects.reduce((sum, item) => sum + projectWork(item).done, 0)
  const availableOffers = data.marketOffers.filter((offer) => !offer.blockedBy)
  const averageRelationship = Math.round(data.relationships.reduce((sum, item) => sum + item.strength, 0) / data.relationships.length)
  const committeeSeats = data.projects.reduce((sum, item) => sum + item.committee.length, 0)
  const historyProfit = data.history.reduce((sum, item) => sum + item.profit, 0)
  const stateClass = `window-${receipt.state}${receipt.state === 'event_pending' ? ' has-event' : ''}`
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  const scrollToContent = () => {
    const content = document.querySelector('.scene-content')
    if (content) window.scrollTo({ top: content.getBoundingClientRect().top + window.scrollY - 150, behavior: 'smooth' })
  }

  const hotspots: HotspotDefinition[] = scene === 'office' ? [
    {
      id: 'office-projects', className: 'at-projects', icon: <Clapperboard size={19} />, label: '作品看板', detail: `${data.projects.length} 部在制`,
      context: {
        eyebrow: 'PORTFOLIO / 作品看板', title: focus.title,
        description: `当前定向 ${focus.focusLabel ?? '未设置'}。作品详情区分公共制作与每集六阶段，工作项进度由实际工作点推导。`,
        facts: [
          { label: '完成度', value: `${completion}%` },
          { label: '已交付', value: `${deliveredEpisodes(focus)} / ${focus.episodeCount} 集` },
          { label: '计划差距', value: `${completion - focus.plannedCompletion >= 0 ? '+' : ''}${completion - focus.plannedCompletion} 点` },
        ],
        actionLabel: '查看作品详情', onAction: () => onOpenProject(focus.id),
      },
    },
    {
      id: 'office-finance', className: 'at-finance', icon: <WalletCards size={19} />, label: '公司账本', detail: '唯一现金池',
      context: {
        eyebrow: 'FINANCE / 公司账本', title: '公司现金与承诺',
        description: '公司只有一个现金池；项目账只解释现金归因，不形成独立钱包。周回执记录变化，不让界面自行结算。',
        facts: [
          { label: '当前现金', value: yuan(cash) },
          { label: '下周承诺', value: yuan(data.company.committedNextWeek) },
          { label: '现金覆盖', value: `${data.company.runwayWeeks} 周` },
        ],
        actionLabel: '查看公司账本', onAction: () => scrollTo('company-ledger'),
      },
    },
    {
      id: 'office-people', className: 'at-people', icon: <Users size={19} />, label: '人员分配', detail: '本周唯一归属',
      context: {
        eyebrow: 'PEOPLE / 人员分配', title: '本周人员归属',
        description: '核心员工每周只归属一个项目；切换会产生一次性磨合损失。临时人员按项目计酬，不混入长期培养口径。',
        facts: [
          { label: '员工', value: `${data.staff.length} 人` },
          { label: '已分配', value: `${allocatedCount} 人` },
          { label: '离职预警', value: `${departureWarnings} 人` },
        ],
        actionLabel: '查看人员分配', onAction: () => scrollTo('people-board'),
      },
    },
    {
      id: 'office-meeting', className: 'at-meeting', icon: <Flag size={19} />, label: receipt.event ? '处理异常事件' : '会议室', detail: receipt.event ? '有待决定事项' : 'M4 合作功能', alert: Boolean(receipt.event),
      context: {
        eyebrow: 'MEETING / 决策空间', title: receipt.event?.title ?? '会议室与长期合作',
        description: receipt.event?.description ?? '普通经营周不弹事件；制作委员会与跨作品合作关系仍可查看。',
        facts: [
          { label: '事件选项', value: `${receipt.event?.options.length ?? 0} 个` },
          { label: '处理期限', value: receipt.event ? `第 ${receipt.event.deadlineWeek} 周` : '本周无事件' },
          { label: '合作关系', value: `${data.relationships.length} 家` },
        ],
        actionLabel: '前往会议室', onAction: () => onNavigate('meeting'),
      },
    },
    {
      id: 'office-studio', className: 'at-studio', icon: <MonitorPlay size={19} />, label: '进入制作现场', detail: '查看六阶段',
      context: {
        eyebrow: 'STUDIO / 制作现场', title: '动画工作室',
        description: '作品、单集、六阶段与工作项逐层展开；桌面设备与工位只承担空间表现，不替代真实生产命令。',
        facts: [
          { label: '在制作品', value: `${data.projects.length} 部` },
          { label: '总工作量', value: `${doneWork} / ${totalWork}` },
          { label: '在制外包', value: `${activeOutsource.length} 项` },
        ],
        actionLabel: '进入制作现场', onAction: () => onNavigate('studio'),
      },
    },
    {
      id: 'office-market', className: 'at-market', icon: <Megaphone size={19} />, label: '发行与市场', detail: `${data.marketOffers.length} 个企划`,
      context: {
        eyebrow: 'MARKET / 发行与市场', title: '企划机会与发行结果',
        description: '市场企划按周期刷新；承接是一次新承诺，不会自动立项。历史作品只记录已经交付的结果。',
        facts: [
          { label: '市场企划', value: `${data.marketOffers.length} 个` },
          { label: '可承接', value: `${availableOffers.length} 个` },
          { label: '历史作品', value: `${data.history.length} 部` },
        ],
        actionLabel: '查看市场企划', onAction: () => onNavigate('market'),
      },
    },
  ] : scene === 'studio' ? [
    {
      id: 'studio-project', className: 'at-projects', icon: <Clapperboard size={19} />, label: '当前作品', detail: focus.title,
      context: {
        eyebrow: 'NOW PRODUCING / 当前作品', title: focus.title,
        description: focusEpisode?.note ?? focus.focusLabel ?? '从公共制作进入单集，再查看六阶段与工作项依赖。',
        facts: [
          { label: '完成度', value: `${completion}%` },
          { label: '定向单集', value: focusEpisode ? `第 ${focusEpisode.index} 集` : '未设置' },
          { label: '截止周', value: `第 ${focus.deadlineWeek} 周` },
        ],
        actionLabel: '查看制作详情', onAction: scrollToContent,
      },
    },
    {
      id: 'studio-resources', className: 'at-finance', icon: <PackageOpen size={19} />, label: '外包与产能', detail: `${activeOutsource.length} 项在制`,
      context: {
        eyebrow: 'RESOURCES / 外包与产能', title: '外部产能与工作项',
        description: '外包按具体工作项记录；供应商产能、可靠性和费用与公司现金池分开呈现，新增承诺必须由玩家确认。',
        facts: [
          { label: '在制任务', value: `${activeOutsource.length} 项` },
          { label: '风险任务', value: `${activeOutsource.filter((task) => task.status === 'at_risk').length} 项` },
          { label: '供应商', value: `${data.suppliers.length} 家` },
        ],
        actionLabel: '查看外包与产能', onAction: () => scrollTo('production-resources'),
      },
    },
    {
      id: 'studio-weekly', className: 'at-meeting', icon: <CalendarDays size={19} />, label: '本周回执', detail: '查看产出原因',
      context: {
        eyebrow: `WEEK ${receipt.week} / 本周回执`, title: receipt.headline,
        description: `${receipt.stateNote} 场景与周快照共享同一份模拟数据，切换不会改动样本。`,
        facts: [
          { label: '现金变化', value: yuan(receipt.cashDelta) },
          { label: '需要决定', value: `${receipt.mustDecide.length} 项` },
          { label: '经营状态', value: weekStateNames[receipt.state] },
        ],
        actionLabel: '打开每周经营', onAction: onOpenWeekly,
      },
    },
    {
      id: 'studio-office', className: 'at-market', icon: <DoorOpen size={19} />, label: '返回办公室',
      context: {
        eyebrow: 'MAIN SCENE / 返回办公室', title: '办公室是经营中枢',
        description: '回到办公室查看作品组合、公司现金与人员分配；切换场景不会推进周数。',
        facts: [
          { label: '当前现金', value: yuan(cash) },
          { label: '待处理事件', value: `${receipt.event ? 1 : 0} 件` },
          { label: '在制作品', value: `${data.projects.length} 部` },
        ],
        actionLabel: '返回办公室', onAction: () => onNavigate('office'),
      },
    },
  ] : scene === 'meeting' ? [
    {
      id: 'meeting-event', className: 'at-meeting', icon: <Flag size={19} />, label: receipt.event?.title ?? '本周没有事件', detail: receipt.event ? '需要玩家确认' : '普通经营周', alert: Boolean(receipt.event),
      context: {
        eyebrow: 'DECISION / 待决事项', title: receipt.event?.title ?? '本周没有需要处理的事件',
        description: receipt.event?.description ?? receipt.stateNote,
        facts: [
          { label: '事件选项', value: `${receipt.event?.options.length ?? 0} 个` },
          { label: '处理期限', value: receipt.event ? `第 ${receipt.event.deadlineWeek} 周` : '本周无事件' },
          { label: '经营状态', value: weekStateNames[receipt.state] },
        ],
        actionLabel: receipt.event ? '进入事件确认' : '打开每周经营', onAction: onOpenWeekly,
      },
    },
    {
      id: 'meeting-relations', className: 'at-finance', icon: <BriefcaseBusiness size={19} />, label: '长期合作关系', detail: 'M4 功能预览',
      context: {
        eyebrow: 'RELATIONSHIPS / 长期合作', title: '跨作品保留的合作关系',
        description: '制作委员会随单部作品成立与结算，成员关系留在公司；当前只预览信息结构，不开放真实投资命令。',
        facts: [
          { label: '合作方', value: `${data.relationships.length} 家` },
          { label: '平均关系', value: `${averageRelationship}` },
          { label: '委员会席位', value: `${committeeSeats} 席` },
        ],
        actionLabel: '查看合作关系', onAction: () => scrollTo('meeting-relations'),
      },
    },
    {
      id: 'meeting-office', className: 'at-market', icon: <DoorOpen size={19} />, label: '返回办公室',
      context: {
        eyebrow: 'MAIN SCENE / 返回办公室', title: '办公室是经营中枢',
        description: '回到办公室查看作品组合、公司现金与人员分配；切换场景不会推进周数。',
        facts: [
          { label: '当前现金', value: yuan(cash) },
          { label: '待处理事件', value: `${receipt.event ? 1 : 0} 件` },
          { label: '在制作品', value: `${data.projects.length} 部` },
        ],
        actionLabel: '返回办公室', onAction: () => onNavigate('office'),
      },
    },
  ] : [
    {
      id: 'market-offers', className: 'at-projects', icon: <Megaphone size={19} />, label: '企划机会', detail: `${data.marketOffers.length} 个样本`,
      context: {
        eyebrow: 'MARKET / 企划机会', title: '下一部作品，从哪里开始？',
        description: '市场企划按周期刷新；承接需要形成新承诺。声望、产能与模式门槛不满足时，入口保持禁用。',
        facts: [
          { label: '全部企划', value: `${data.marketOffers.length} 个` },
          { label: '可承接', value: `${availableOffers.length} 个` },
          { label: '正热企划', value: `${data.marketOffers.filter((offer) => offer.heat === 'hot').length} 个` },
        ],
        actionLabel: '查看全部企划', onAction: () => scrollTo('market-offers'),
      },
    },
    {
      id: 'market-finance', className: 'at-finance', icon: <Coins size={19} />, label: '现金与历史', detail: '流水 / Archive',
      context: {
        eyebrow: 'DISTRIBUTION / 经营结果', title: '发行结果与作品 Archive',
        description: '作品质量、商业表现与利润分开记录；Archive 只包含已交付作品，市场热度不等于实际回款。',
        facts: [
          { label: '历史作品', value: `${data.history.length} 部` },
          { label: '累计利润', value: yuan(historyProfit) },
          { label: '公司声望', value: `${data.company.reputation}` },
        ],
        actionLabel: '查看现金与历史', onAction: () => scrollTo('market-finance'),
      },
    },
    {
      id: 'market-office', className: 'at-market', icon: <DoorOpen size={19} />, label: '返回办公室',
      context: {
        eyebrow: 'MAIN SCENE / 返回办公室', title: '办公室是经营中枢',
        description: '回到办公室查看作品组合、公司现金与人员分配；切换场景不会推进周数。',
        facts: [
          { label: '当前现金', value: yuan(cash) },
          { label: '待处理事件', value: `${receipt.event ? 1 : 0} 件` },
          { label: '在制作品', value: `${data.projects.length} 部` },
        ],
        actionLabel: '返回办公室', onAction: () => onNavigate('office'),
      },
    },
  ]
  const selected = hotspots.find((hotspot) => hotspot.id === selectedHotspotId)

  return <>
    <section className={`scene-stage scene-${scene} ${stateClass}`} aria-label={`${sceneNames[scene]}场景`}>
      <div className="scene-art" key={scene}>
        <PixelRoom scene={scene} />
        <div className="scene-light" />
      </div>
      <div className="scene-caption"><span className="scene-number">0{{ office: 1, studio: 2, meeting: 3, market: 4 }[scene]}</span><div><p>{scene === 'office' ? 'MAIN SCENE / 主场景' : 'SUB SCENE / 副场景'}</p><h2>{sceneNames[scene]}</h2></div></div>
      <div className="scene-status"><span className={`status-dot status-${receipt.state}`} />{weekStateNames[receipt.state]}<small>场景切换不推进时间</small></div>

      {hotspots.map((hotspot) => <Hotspot key={hotspot.id} hotspot={hotspot} selected={hotspot.id === selectedHotspotId} onSelect={onSelectHotspot} />)}
      <div className="scene-bottomline"><p>{sceneNotes[scene]}</p><span><ArrowUpRight size={14} />点击发光定位点，查看设施与经营动作</span></div>
      <div className="scene-receipts" aria-label="经营窗口快照">{data.receipts.map((item) => <button key={item.week} className={item.week === receipt.week ? 'is-active' : ''} onClick={() => onSelectWeek(item.week)}><span>W{item.week}</span><span className={`status-dot status-${item.state}`} />{weekStateNames[item.state]}</button>)}</div>
      {receipt.state === 'cash_crisis' && <div className="crisis-ticker"><strong>资金危机</strong> 本周停止生产 · 不自动借款 · 自救期限第 {receipt.crisis?.deadlineWeek} 周前</div>}
      {receipt.state === 'closing' && <div className="crisis-ticker closing"><strong>关闭中</strong> 停止周推进 · 仅允许达标结清与经营总结</div>}
    </section>
    {selected && <section className="scene-context" id="scene-context-panel" aria-label={`${selected.label}情境信息`} aria-live="polite">
      <span className="context-icon">{selected.icon}</span>
      <div className="context-copy"><p className="eyebrow">{selected.context.eyebrow}</p><h3>{selected.context.title}</h3><p>{selected.context.description}</p></div>
      <dl className="context-facts">{selected.context.facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>
      <div className="context-actions"><button className="button primary" onClick={() => { selected.context.onAction(); onSelectHotspot(null) }}>{selected.context.actionLabel}<ArrowUpRight size={15} /></button><button className="icon-button" aria-label="关闭情境信息" onClick={() => onSelectHotspot(null)}><X size={18} /></button></div>
    </section>}
  </>
}

export function SceneSummary({ scene, data, project, receipt }: { scene: Scene; data: PrototypeData; project: Project; receipt: WeeklyReceipt }) {
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
    { label: '待处理事件', value: `${receipt.event ? 1 : 0} 件`, hint: receipt.event ? '推进前必须作出决定' : '本周没有待决事件' },
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
