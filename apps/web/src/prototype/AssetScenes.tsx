
export type MainScene = 'office' | 'studio' | 'meeting' | 'market'
export type SceneAction = 'company' | 'work' | 'week' | 'finance' | 'market' | 'release' | 'archive' | 'performance'

const ANTEA = '/assets/pixel/office/antea-furniture-office-equipment/Office-Furniture-Pixel-Art/Office-Furniture-Pixel-Art'

function OfficeScene() {
  return <div className="asset-scene scene-office">
    <img className="scene-backdrop" src="/assets/pixel/office/2dpig/LargePixelOffice.png" alt="2dPig 像素办公室，包含办公工位、员工、会客区与门禁" />
  </div>
}

function StudioScene() {
  return <div className="asset-scene scene-studio">
    <img className="scene-backdrop studio-blueprint-backdrop" src="/assets/pixel/studio/ProductionStudio.svg" alt="以办公室为蓝本的动画制作现场，保留原有电脑工位，并以暖木地面、分镜板和排期表区分制作空间" />
  </div>
}

function MeetingScene() {
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
  </div>
}

function MarketScene() {
  return <div className="asset-scene scene-market">
    <img className="scene-backdrop market-blueprint-backdrop" src="/assets/pixel/market/DistributionMarket.svg" alt="单一发行与市场场景，包含业务公告板、接待柜台、作品展示墙、发行显示屏和业绩看板，五个交互对象围绕企划承接、作品发行与经营复盘协作" />
  </div>
}

export function AssetScene({ scene }: { scene: MainScene }) {
  if (scene === 'office') return <OfficeScene />
  if (scene === 'studio') return <StudioScene />
  if (scene === 'meeting') return <MeetingScene />
  return <MarketScene />
}
