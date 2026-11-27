import type { CSSProperties } from 'react'
import { Bell, BriefcaseBusiness, CalendarDays, Clapperboard, Coins, FileCheck2, FolderKanban, Handshake, Monitor, Trophy, UsersRound } from 'lucide-react'
import type { Project } from './model'
import { episodeStageShortNames, EPISODE_STAGES, projectCompletion, sumWork } from './model'

export type MainScene = 'office' | 'studio' | 'meeting' | 'market'
export type SceneAction = 'company' | 'work' | 'week' | 'finance' | 'market' | 'release' | 'archive' | 'performance'

const ANTEA = '/assets/pixel/office/antea-furniture-office-equipment/Office-Furniture-Pixel-Art/Office-Furniture-Pixel-Art'

type HotspotProps = {
  x: number
  y: number
  label: string
  icon: typeof BriefcaseBusiness
  onClick: () => void
  primary?: boolean
}

function Hotspot({ x, y, label, icon: Icon, onClick, primary = false }: HotspotProps) {
  return <button className={`scene-hotspot${primary ? ' is-primary' : ''}`} style={{ left: `${x}%`, top: `${y}%` }} onClick={onClick} aria-label={label}>
    <Icon size={17} aria-hidden="true" />
    <span>{label}</span>
  </button>
}

function OfficeScene({ onAction }: { onAction: (action: SceneAction) => void }) {
  return <div className="asset-scene scene-office">
    <img className="scene-backdrop" src="/assets/pixel/office/2dpig/LargePixelOffice.png" alt="2dPig 像素办公室，包含办公工位、员工、会客区与门禁" />
    <div className="scene-vignette" />
    <div className="scene-placard"><span>01</span><div><small>COMPANY FLOOR</small><strong>办公室</strong></div></div>
    <div className="scene-timecode">W18 · 14:20</div>
    <Hotspot x={29} y={56} label="查看员工与设施" icon={UsersRound} onClick={() => onAction('company')} />
    <Hotspot x={55} y={39} label="打开在制作品" icon={FolderKanban} onClick={() => onAction('work')} />
    <Hotspot x={82} y={30} label="查看公司现金" icon={Coins} onClick={() => onAction('finance')} />
    <div className="scene-caption"><span className="caption-dot" />核心员工正在工位上推进三部作品</div>
  </div>
}

function StudioScene({ project, onAction }: { project: Project; onAction: (action: SceneAction) => void }) {
  const focusEpisode = project.episodes.find((episode) => episode.isFocus) ?? project.episodes[0]
  return <div className="asset-scene scene-studio">
    <img className="scene-backdrop studio-blueprint-backdrop" src="/assets/pixel/studio/ProductionStudio.svg" alt="以办公室为蓝本的动画制作现场，保留原有电脑工位，并以暖木地面、分镜板和排期表区分制作空间" />
    <div className="scene-vignette scene-vignette-warm" />
    <div className="scene-placard"><span>02</span><div><small>PRODUCTION FLOOR</small><strong>制作现场</strong></div></div>
    <div className="studio-stage-strip" aria-label="当前单集六阶段">
      {EPISODE_STAGES.map((stage) => {
        const work = sumWork(focusEpisode.workItems.filter((item) => item.stage === stage))
        const percent = work.total === 0 ? 0 : Math.round(work.done / work.total * 100)
        return <div key={stage}><span>{episodeStageShortNames[stage]}</span><i style={{ '--stage-progress': `${percent}%` } as CSSProperties} /></div>
      })}
    </div>
    <Hotspot x={54} y={68} label="查看当前单集" icon={Clapperboard} onClick={() => onAction('work')} />
    <Hotspot x={19} y={43} label="查看公共制作" icon={FileCheck2} onClick={() => onAction('work')} />
    <div className="scene-caption"><span className="caption-dot" />{project.title} · 完成度 {projectCompletion(project)}%</div>
  </div>
}

function MeetingScene({ hasEvent, onAction }: { hasEvent: boolean; onAction: (action: SceneAction) => void }) {
  return <div className="asset-scene scene-meeting">
    <div className="meeting-wall" />
    <div className="meeting-window"><i /><i /><i /><i /><i /></div>
    <div className="meeting-presentation" role="img" aria-label="全景落地窗中央的投影幕布，展示柱形图、饼状图和折线图报表">
      <div className="meeting-screen-surface">
        <div className="meeting-screen-heading"><span>COMMITTEE / W19</span><strong>项目进度总览</strong></div>
        <div className="meeting-charts">
          <div className="meeting-chart">
            <div><span>柱形图</span><strong>+18%</strong></div>
            <svg viewBox="0 0 120 72" aria-hidden="true">
              <path className="chart-grid" d="M12 10V62H114M12 36H114M12 10H114" />
              <rect className="bar-muted" x="24" y="36" width="15" height="26" />
              <rect className="bar-accent" x="52" y="20" width="15" height="42" />
              <rect className="bar-muted" x="80" y="29" width="15" height="33" />
            </svg>
          </div>
          <div className="meeting-chart">
            <div><span>饼状图</span><strong>52%</strong></div>
            <div className="meeting-pie"><i>完成</i></div>
          </div>
          <div className="meeting-chart">
            <div><span>折线图</span><strong>W19</strong></div>
            <svg viewBox="0 0 120 72" aria-hidden="true">
              <path className="chart-grid" d="M12 10V62H114M12 36H114M12 62H114" />
              <path className="chart-line" d="M16 50L38 38L60 43L82 22L104 16" />
              <circle cx="16" cy="50" r="3" /><circle cx="38" cy="38" r="3" /><circle cx="60" cy="43" r="3" /><circle cx="82" cy="22" r="3" /><circle cx="104" cy="16" r="3" />
            </svg>
          </div>
        </div>
      </div>
    </div>
    <div className="meeting-floor" />
    <img className="meeting-plant" src={`${ANTEA}/Big-Plant.png`} alt="会议室绿植" />
    <img className="meeting-plant meeting-plant-small" src={`${ANTEA}/Small-Plant.png`} alt="会议室小绿植" />
    <div className="meeting-furniture-group">
      <div className="meeting-table-wrap">
        <img className="meeting-table" src={`${ANTEA}/Big-Round-Table.png`} alt="会议室圆桌" />
        <img className="meeting-papers" src={`${ANTEA}/Papers.png`} alt="会议文件" />
        <img className="meeting-folders" src={`${ANTEA}/Folders.png`} alt="会议资料夹" />
      </div>
      <img className="meeting-chair chair-north chair-north-west" src={`${ANTEA}/Boss-Chair.png`} alt="北侧西位会议座椅，朝向桌心" />
      <img className="meeting-chair chair-north chair-north-east" src={`${ANTEA}/Boss-Chair.png`} alt="北侧东位会议座椅，朝向桌心" />
      <img className="meeting-chair chair-west" src={`${ANTEA}/Chair-2.png`} alt="西侧会议座椅，朝向桌心" />
      <img className="meeting-chair chair-east" src={`${ANTEA}/Chair-2.png`} alt="东侧会议座椅，朝向桌心" />
      <img className="meeting-chair chair-south chair-south-west" src={`${ANTEA}/Boss-Chair.png`} alt="南侧西位会议座椅" />
      <img className="meeting-chair chair-south chair-south-east" src={`${ANTEA}/Boss-Chair.png`} alt="南侧东位会议座椅" />
      <div className="meeting-nameplate nameplate-north nameplate-north-west">制作人</div>
      <div className="meeting-nameplate nameplate-north nameplate-north-east">导演</div>
      <div className="meeting-nameplate nameplate-west">作画监督</div>
      <div className="meeting-nameplate nameplate-east">发行方</div>
    </div>
    <div className="scene-placard"><span>03</span><div><small>DECISION ROOM</small><strong>会议室</strong></div></div>
    <Hotspot x={51} y={62} label={hasEvent ? '处理待决议题' : '查看本期议程'} icon={CalendarDays} onClick={() => onAction('week')} />
    <Hotspot x={12} y={22} label="查看决策文件" icon={FileCheck2} onClick={() => onAction('week')} />
    <div className="scene-caption"><span className={`caption-dot${hasEvent ? ' is-alert' : ''}`} />{hasEvent ? '有 1 件需要集体决策的事项' : '本期无待决议题 · 产业关系尚未开放'}</div>
  </div>
}

function MarketScene({ onAction }: { onAction: (action: SceneAction) => void }) {
  return <div className="asset-scene scene-market">
    <img className="scene-backdrop market-blueprint-backdrop" src="/assets/pixel/market/DistributionMarket.svg" alt="单一发行与市场场景，包含业务公告板、接待柜台、作品展示墙、发行显示屏和业绩看板，五个交互对象围绕企划承接、作品发行与经营复盘协作" />
    <div className="scene-vignette scene-vignette-market" />
    <div className="scene-placard"><span>04</span><div><small>DISTRIBUTION & MARKET</small><strong>发行与市场</strong></div></div>
    <Hotspot x={16} y={25} label="查看业务公告板" icon={Bell} onClick={() => onAction('market')} />
    <Hotspot x={28} y={51} label="企划承接" icon={Handshake} onClick={() => onAction('market')} primary />
    <Hotspot x={71} y={25} label="查看业绩看板" icon={Trophy} onClick={() => onAction('performance')} />
    <Hotspot x={89} y={25} label="作品发行" icon={Monitor} onClick={() => onAction('release')} primary />
    <Hotspot x={90} y={50} label="查看公司作品墙" icon={Clapperboard} onClick={() => onAction('archive')} />
    <div className="scene-caption"><span className="caption-dot" />单一市场场景 · 从企划承接、作品发行到业绩复盘</div>
  </div>
}

export function AssetScene({ scene, project, hasEvent, onAction }: {
  scene: MainScene
  project: Project
  hasEvent: boolean
  onAction: (action: SceneAction) => void
}) {
  if (scene === 'office') return <OfficeScene onAction={onAction} />
  if (scene === 'studio') return <StudioScene project={project} onAction={onAction} />
  if (scene === 'meeting') return <MeetingScene hasEvent={hasEvent} onAction={onAction} />
  return <MarketScene onAction={onAction} />
}
