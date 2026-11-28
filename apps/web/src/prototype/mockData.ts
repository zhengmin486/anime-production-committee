import { EPISODE_STAGES, sumWork } from './model'
import type { Ability, Episode, EpisodeStage, Project, PrototypeData, WorkItem, WorkState, WorkSummary } from './model'

const ab = (planning: number, direction: number, drawing: number, animation: number, management: number, postproduction: number) => ({
  planning, direction, drawing, animation, management, postproduction,
})

/* 单集工作项模板取自 docs/blueprints/tv_standard.blueprint.json 的 episode[]，
   工作点、千分比门槛与依赖关系与 docs/BLUEPRINT_SPEC.md 一致。
   短篇与 OVA 在本样本中复用同一模板，正式模板差异属于制作蓝图范畴，不由界面决定。 */
interface ItemSpec {
  key: string
  name: string
  stage: EpisodeStage
  ability: Ability
  workTotal: number
  deliverAt: number
  isGate: boolean
  deps: string[]
}

const EPISODE_ITEM_SPECS: ItemSpec[] = [
  { key: 'script', name: '单集脚本', stage: 'content_design', ability: 'planning', workTotal: 42, deliverAt: 900, isGate: false, deps: ['common:series_composition'] },
  { key: 'episode_direction_plan', name: '演出构想', stage: 'content_design', ability: 'direction', workTotal: 18, deliverAt: 850, isGate: false, deps: ['script'] },
  { key: 'storyboard', name: '分镜', stage: 'storyboard_key_animation', ability: 'direction', workTotal: 55, deliverAt: 900, isGate: false, deps: ['episode_direction_plan'] },
  { key: 'layout', name: '构图与Layout', stage: 'storyboard_key_animation', ability: 'drawing', workTotal: 48, deliverAt: 850, isGate: false, deps: ['storyboard', 'common:character_design'] },
  { key: 'key_animation', name: '原画', stage: 'storyboard_key_animation', ability: 'drawing', workTotal: 95, deliverAt: 900, isGate: false, deps: ['layout'] },
  { key: 'inbetween', name: '动画（中割）', stage: 'animation', ability: 'animation', workTotal: 78, deliverAt: 900, isGate: false, deps: ['key_animation'] },
  { key: 'animation_check', name: '作画检查', stage: 'animation', ability: 'direction', workTotal: 34, deliverAt: 950, isGate: false, deps: ['inbetween'] },
  { key: 'background', name: '背景', stage: 'art_visual', ability: 'drawing', workTotal: 62, deliverAt: 850, isGate: false, deps: ['layout', 'common:art_setting'] },
  { key: 'art_check', name: '美术检查', stage: 'art_visual', ability: 'drawing', workTotal: 20, deliverAt: 900, isGate: false, deps: ['background', 'common:color_design'] },
  { key: 'composite', name: '摄影合成', stage: 'photography_editing', ability: 'postproduction', workTotal: 52, deliverAt: 900, isGate: false, deps: ['animation_check', 'art_check'] },
  { key: 'editing', name: '剪辑', stage: 'photography_editing', ability: 'direction', workTotal: 24, deliverAt: 950, isGate: false, deps: ['composite'] },
  { key: 'dubbing', name: '配音收录', stage: 'sound_delivery', ability: 'postproduction', workTotal: 26, deliverAt: 900, isGate: false, deps: ['editing'] },
  { key: 'sound_mix', name: '音响调整', stage: 'sound_delivery', ability: 'postproduction', workTotal: 30, deliverAt: 950, isGate: false, deps: ['dubbing', 'common:music'] },
  { key: 'delivery_master', name: '完成母版', stage: 'sound_delivery', ability: 'postproduction', workTotal: 12, deliverAt: 1000, isGate: true, deps: ['sound_mix', 'common:op_ed'] },
]

const FULL = EPISODE_ITEM_SPECS.map(() => 1000)
const EMPTY = EPISODE_ITEM_SPECS.map(() => 0)

const withStates = (items: Array<Omit<WorkItem, 'state'>>): WorkItem[] => {
  const byKey = new Map(items.map((item) => [item.key, item]))
  const stateOf = (item: Omit<WorkItem, 'state'>, visiting = new Set<string>()): WorkState => {
    if (item.deps.some((dep) => {
      if (visiting.has(dep)) return true
      const source = byKey.get(dep)
      return source !== undefined && stateOf(source, new Set([...visiting, dep])) !== 'delivered' && stateOf(source, new Set([...visiting, dep])) !== 'completed'
    })) return 'blocked'
    const reached = item.workDone * 1000 >= item.deliverAt * item.workTotal
    if (reached) return item.workDone >= item.workTotal ? 'completed' : 'delivered'
    return item.workDone > 0 ? 'active' : 'ready'
  }
  return items.map((item) => ({ ...item, state: stateOf(item) }))
}

/* rates 为每个工作项完成占 workTotal 的千分比，只用于生成样本。 */
const ep = (prefix: string, rates: number[]): WorkItem[] => withStates(EPISODE_ITEM_SPECS.map((spec, index) => ({
  key: `${prefix}:${spec.key}`,
  name: spec.name,
  stage: spec.stage,
  ability: spec.ability,
  workTotal: spec.workTotal,
  workDone: Math.round(spec.workTotal * rates[index] / 1000),
  deliverAt: spec.deliverAt,
  deliverPoints: Math.round(spec.workTotal * spec.deliverAt / 1000),
  isGate: spec.isGate,
  deps: spec.deps.map((dep) => (dep.startsWith('common:') ? dep : `${prefix}:${dep}`)),
})))

const COMMON_ITEM_SPECS: Array<{ key: string; name: string; ability: Ability; deliverAt: number; deps: string[] }> = [
  { key: 'series_composition', name: '系列构成', ability: 'planning', deliverAt: 850, deps: [] },
  { key: 'character_design', name: '角色设定', ability: 'drawing', deliverAt: 900, deps: [] },
  { key: 'art_setting', name: '美术设定', ability: 'drawing', deliverAt: 850, deps: [] },
  { key: 'color_design', name: '色彩设计', ability: 'drawing', deliverAt: 850, deps: ['common:character_design'] },
  { key: 'music', name: '音乐', ability: 'postproduction', deliverAt: 800, deps: [] },
  { key: 'op_ed', name: 'OP/ED', ability: 'postproduction', deliverAt: 800, deps: [] },
]

const common = (totals: number[], rates: number[]): WorkItem[] => withStates(COMMON_ITEM_SPECS.map((spec, index) => ({
  key: `common:${spec.key}`,
  name: spec.name,
  stage: null,
  ability: spec.ability,
  workTotal: totals[index],
  workDone: Math.round(totals[index] * rates[index] / 1000),
  deliverAt: spec.deliverAt,
  deliverPoints: Math.round(totals[index] * spec.deliverAt / 1000),
  isGate: false,
  deps: spec.deps,
})))

const doneCommon = [1000, 1000, 1000, 1000, 1000, 1000]

type EpisodeFixture = Omit<Episode, 'work' | 'stages'>
type ProjectFixture = Omit<Project, 'work' | 'commonWork' | 'completion' | 'deliveredEpisodeCount' | 'episodes'> & { episodes: EpisodeFixture[] }

const makeEpisode = (episode: EpisodeFixture): Episode => ({
  ...episode,
  work: sumWork(episode.workItems),
  stages: Object.fromEntries(EPISODE_STAGES.map((stage) => [stage, sumWork(episode.workItems.filter((item) => item.stage === stage))])) as Record<EpisodeStage, WorkSummary>,
})

const makeProject = (project: ProjectFixture): Project => {
  const episodes = project.episodes.map(makeEpisode)
  const work = sumWork([...project.commonItems, ...episodes.flatMap((episode) => episode.workItems)])
  return {
    ...project,
    episodes,
    work,
    commonWork: sumWork(project.commonItems),
    completion: work.percent,
    deliveredEpisodeCount: episodes.filter((episode) => episode.status === 'delivered').length,
  }
}

/* 全部为静态样本数值，用于验证信息层级是否读得懂，不是平衡后的正式参数。 */
export const prototypeData: PrototypeData = {
  company: {
    name: '青梧动画制作室',
    week: 18,
    totalWeeks: 520,
    cash: 980_000,
    committedNextWeek: 428_000,
    weeklyFixed: { salary: 186_000, operations: 92_000 },
    reputation: 58,
    runwayWeeks: 2,
    headline: '三部作品同时在制，作画产能吃紧；第 16 周结算已回滚，第 17 周投资到账后恢复正常经营。',
  },

  staff: [
    { id: 's1', name: '林岸', role: 'director', employment: 'core', abilities: ab(62, 78, 40, 32, 55, 30), specialty: 'direction', fatigue: 61, morale: 72, weeklySalary: 42_000, projectFee: 0, departureWarning: false, statusNote: '上周在《小满》，本周切到《雾港II》；监督人员切换产生一次性团队磨合损失' },
    { id: 's2', name: '陈砚', role: 'animation_director', employment: 'core', abilities: ab(48, 66, 82, 58, 40, 34), specialty: 'drawing', fatigue: 74, morale: 58, weeklySalary: 36_000, projectFee: 0, departureWarning: false, statusNote: '本周归属《雾港II》，第 7 集原画返工都压在他的作画检查上；《夜行电车》要他只能等下周重新分配' },
    { id: 's3', name: '苏未', role: 'key_animator', employment: 'core', abilities: ab(30, 44, 74, 62, 22, 26), specialty: 'drawing', fatigue: 69, morale: 55, weeklySalary: 28_000, projectFee: 0, departureWarning: false, statusNote: '本周加班一天，第 7 集原画仍有两张未修正' },
    { id: 's4', name: '郑桥', role: 'animator', employment: 'core', abilities: ab(24, 30, 52, 68, 20, 30), specialty: 'animation', fatigue: 58, morale: 64, weeklySalary: 24_000, projectFee: 0, departureWarning: false, statusNote: '本周归属《夜行电车》第 1 集中割；《雾港II》第 7 集的动画只能等下周' },
    { id: 's5', name: '何茵', role: 'postproduction', employment: 'core', abilities: ab(20, 34, 26, 30, 24, 76), specialty: 'postproduction', fatigue: 44, morale: 70, weeklySalary: 26_000, projectFee: 0, departureWarning: false, statusNote: '本周归属《小满》完成母版，交付后下周可重新分配' },
    { id: 's6', name: '周慕', role: 'production_manager', employment: 'core', abilities: ab(56, 38, 26, 28, 72, 30), specialty: 'management', fatigue: 66, morale: 61, weeklySalary: 30_000, projectFee: 0, departureWarning: true, statusNote: '本周只能归一个项目，另两部的排产冲突要靠玩家下周重新分配解决' },
    { id: 's7', name: '白鹭', role: 'scriptwriter', employment: 'temporary', abilities: ab(64, 46, 22, 18, 20, 16), specialty: 'planning', fatigue: 35, morale: 78, weeklySalary: 0, projectFee: 90_000, departureWarning: false, statusNote: '按项目计酬，本周归《夜行电车》；临时员工的跨项目调度属于另一套资源规则' },
  ],

  facilities: [
    { id: 'f1', name: '制作工位', kind: 'workspace', status: 'occupied', statusLabel: '使用中', detail: '12 / 16 个工位', note: '当前供三部作品共用；工位数量不是项目槽位，也不限制并行项目数。', actionLabel: '查看制作现场' },
    { id: 'f2', name: '剪辑室', kind: 'editing', status: 'available', statusLabel: '可预约', detail: '1 间 · 2 个操作位', note: '《小满》本周使用后期操作位，其他时段可预约。', actionLabel: '查看作品发行' },
    { id: 'f3', name: '会议室', kind: 'meeting', status: 'available', statusLabel: '可使用', detail: '1 间 · 6 个席位', note: '用于待决议题、企划与合作决策；没有事件时不会强制开会。', actionLabel: '进入会议室' },
    { id: 'f4', name: '资料柜', kind: 'archive', status: 'available', statusLabel: '可查阅', detail: '已交付作品 3 部', note: '只收录已经交付的作品，在制项目不进入 Archive。', actionLabel: '查看公司作品墙' },
    { id: 'f5', name: '接待柜台', kind: 'reception', status: 'occupied', statusLabel: '接待中', detail: '本周 2 个市场企划', note: '企划详情、预算与承接条件在同一处查看。', actionLabel: '查看市场企划' },
    { id: 'f6', name: '培训室', kind: 'training', status: 'locked', statusLabel: '未解锁', detail: '需要先完成 M3 人才培养', note: '当前 F1 原型不开放培训操作。', actionLabel: null, lockedReason: 'M3 人才培养阶段尚未开放' },
  ],

  allocations: [
    { staffId: 's1', projectId: 'p1', previousProjectId: 'p3', focus: 'direction' },
    { staffId: 's2', projectId: 'p1', previousProjectId: 'p1', focus: 'drawing' },
    { staffId: 's3', projectId: 'p1', previousProjectId: 'p1', focus: 'drawing' },
    { staffId: 's4', projectId: 'p2', previousProjectId: 'p1', focus: 'animation' },
    { staffId: 's5', projectId: 'p3', previousProjectId: 'p3', focus: 'postproduction' },
    { staffId: 's6', projectId: 'p1', previousProjectId: 'p2', focus: 'management' },
    { staffId: 's7', projectId: 'p2', previousProjectId: null, focus: 'planning' },
  ],

  suppliers: [
    { id: 'sp1', name: '星野线上', specialty: 'drawing', weeklyCapacity: 3, reserved: 3, unitPrice: 28_000, reliability: 74, note: '本周产能已全额承诺给两个项目' },
    { id: 'sp2', name: '藤森色彩', specialty: 'postproduction', weeklyCapacity: 2, reserved: 1, unitPrice: 22_000, reliability: 86, note: '剩一份排期，可临时加塞' },
    { id: 'sp3', name: '明石動画', specialty: 'animation', weeklyCapacity: 4, reserved: 2, unitPrice: 18_000, reliability: 62, note: '便宜但不稳定，上周返工一张' },
  ],

  outsourcing: [
    { id: 'o1', supplierId: 'sp1', projectId: 'p1', episodeIndex: 7, stage: 'storyboard_key_animation', itemKey: 'ep7:key_animation', ability: 'drawing', workTotal: 60, workDone: 42, rush: false, feePaid: 84_000, dueWeek: 21, status: 'active' },
    { id: 'o2', supplierId: 'sp1', projectId: 'p2', episodeIndex: 1, stage: 'storyboard_key_animation', itemKey: 'ep1:storyboard', ability: 'drawing', workTotal: 40, workDone: 12, rush: false, feePaid: 56_000, dueWeek: 24, status: 'at_risk' },
    { id: 'o3', supplierId: 'sp3', projectId: 'p1', episodeIndex: 6, stage: 'animation', itemKey: 'ep6:inbetween', ability: 'animation', workTotal: 50, workDone: 50, rush: false, feePaid: 45_000, dueWeek: 17, status: 'delivered' },
    { id: 'o4', supplierId: 'sp2', projectId: 'p3', episodeIndex: 1, stage: 'photography_editing', itemKey: 'ep1:composite', ability: 'postproduction', workTotal: 30, workDone: 30, rush: false, feePaid: 44_000, dueWeek: 18, status: 'delivered' },
  ],

  projects: [
    makeProject({
      id: 'p1', title: '雾港信使 II', source: 'manga', scale: 'tv', mode: 'committee', status: 'producing',
      startWeek: 8, deadlineWeek: 34, episodeCount: 12, focusLabel: '第 7 集 · 分镜与原画', plannedCompletion: 66,
      commonItems: common([60, 85, 70, 30, 45, 35], doneCommon),
      episodes: ([
        { index: 1, title: '归港的信', status: 'delivered', targetWeek: 14, isFocus: false, workItems: ep('ep1', FULL), note: '第 14 周主动交付，质量 76' },
        { index: 2, title: '潮汐表', status: 'delivered', targetWeek: 15, isFocus: false, workItems: ep('ep2', FULL), note: '第 15 周交付，中割外包一次返工' },
        { index: 3, title: '无人应答的灯塔', status: 'delivered', targetWeek: 16, isFocus: false, workItems: ep('ep3', FULL), note: '第 16 周交付，背景提前完成' },
        { index: 4, title: '盐与火药', status: 'delivered', targetWeek: 17, isFocus: false, workItems: ep('ep4', FULL), note: '第 17 周交付，演出构想改过一次' },
        { index: 5, title: '第二班渡轮', status: 'delivered', targetWeek: 18, isFocus: false, workItems: ep('ep5', FULL), note: '本周交付，作画检查一次通过' },
        { index: 6, title: '雾中的证人', status: 'min_delivered', targetWeek: 19, isFocus: false, workItems: ep('ep6', [1000, 1000, 1000, 1000, 940, 920, 1000, 880, 950, 930, 950, 940, 960, 1000]), note: '门槛项「完成母版」已达 1000‰，其余多数工作项过了最低交付但没做到 100%：等待玩家主动交付，交付后该集立即停止生产' },
        {
          index: 7, title: '夜戏', status: 'producing', targetWeek: 21, isFocus: true,
          workItems: ep('ep7', [1000, 1000, 1000, 1000, 520, 180, 0, 640, 0, 0, 0, 0, 0, 0]),
          note: '原画只做到 49 / 95，低于 900‰ 门槛；中割因此只解锁了一半，背景已并行到 40 / 62',
        },
        {
          index: 8, title: '空船位', status: 'producing', targetWeek: 23, isFocus: false,
          workItems: ep('ep8', [1000, 1000, 1000, 900, 420, 0, 0, 200, 0, 0, 0, 0, 0, 0]),
          note: 'Layout 刚过门槛，原画起步；本周没有分配作画人手的余量',
        },
        {
          index: 9, title: '旧护照', status: 'producing', targetWeek: 25, isFocus: false,
          workItems: ep('ep9', [900, 400, 200, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          note: '脚本尚未达到 900‰ 门槛，分镜被依赖卡住',
        },
        { index: 10, title: '断频', status: 'not_started', targetWeek: 27, isFocus: false, workItems: ep('ep10', EMPTY), note: '按持续方针排在第 7 集之后' },
        { index: 11, title: '岸上的灯', status: 'not_started', targetWeek: 29, isFocus: false, workItems: ep('ep11', EMPTY), note: '未开始' },
        { index: 12, title: '信使的代价', status: 'not_started', targetWeek: 31, isFocus: false, workItems: ep('ep12', EMPTY), note: '未开始，距作品截止仅 3 周缓冲' },
      ] as EpisodeFixture[]).map(makeEpisode),
      quality: 74, audienceExpectation: 71, commercialPotential: 66,
      plan: { effort: 'focused', priority: 'progress', outsource: 'gap', rush: 'conditional', sinceWeek: 15 },
      planGaps: [
        { label: '第 7 集原画', planned: '每周 12 工作点', actual: '每周 8 工作点', reason: '集中投入没有兑现，返工占掉两天' },
        { label: '外包补位', planned: '按缺口补充', actual: '已承诺但排不上', reason: '星野线上本周产能已全部承诺给两个项目' },
        { label: '演出检查', planned: '每周 1 次', actual: '两周 1 次', reason: '林岸上周在《小满》，本周才切回《雾港II》' },
      ],
      teamIds: ['s1', 's2', 's3', 's6'],
      conflicts: ['陈砚本周只能归《雾港II》，《夜行电车》第 1 集作画检查因此排不上', '第 7 集与第 8 集同时需要作画人手，定向只能保一个', '星野线上无法在本周再接新任务'],
      risks: [
        { level: 'high', label: '第 7 集原画未达门槛累积', signal: '连续两周产出低于计划（-4、-6），中割被依赖卡住', sinceWeek: 16 },
        { level: 'medium', label: '核心作画人员疲劳', signal: '陈砚疲劳 74 / 士气 58', sinceWeek: 15 },
        { level: 'low', label: '委员会催稿', signal: '玩具渠道要求第 20 周前看到角色设计定稿', sinceWeek: 17 },
      ],
      committee: [
        { id: 'c1', name: '冬青社', channel: 'publisher', investPercent: 25, since: 6 },
        { id: 'c2', name: '星野周边', channel: 'toy', investPercent: 15, since: 11 },
        { id: 'c3', name: '潮汐唱片', channel: 'music', investPercent: 10, since: 9 },
        { id: 'c4', name: '青梧动画', channel: 'bd', investPercent: 40, since: 8 },
      ],
      account: {
        contractBudget: 2_600_000, received: 1_300_000, investmentTotal: 5_200_000, companyInvestPercent: 40,
        productionCost: 1_180_000, outsourcingCost: 129_000, projectedCommercial: '按当前质量与热度区间 3.1–4.6M', balance: -9000,
      },
      series: { parentTitle: '雾港信使', relation: '续作', carried: '受众认知与合作关系继承，制作质量不继承' },
      marks: ['confirmed', 'sample'],
    }),
    makeProject({
      id: 'p2', title: '夜行电车', source: 'light_novel', scale: 'ova', mode: 'contract', status: 'producing',
      startWeek: 13, deadlineWeek: 29, episodeCount: 3, focusLabel: null, plannedCompletion: 38,
      commonItems: common([40, 60, 50, 25, 35, 25], [1000, 1000, 800, 700, 0, 0]),
      episodes: ([
        {
          index: 1, title: '末班车的乘客', status: 'producing', targetWeek: 24, isFocus: false,
          workItems: ep('ep1', [1000, 1000, 1000, 1000, 900, 600, 300, 700, 0, 0, 0, 0, 0, 0]),
          note: '原画 86 / 95 未达 900‰ 门槛；中割已并行开工，背景等美术检查',
        },
        {
          index: 2, title: '无票区间', status: 'producing', targetWeek: 26, isFocus: false,
          workItems: ep('ep2', [1000, 1000, 600, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
          note: '演出构想已达标，分镜做到 33 / 55',
        },
        { index: 3, title: '终点站不在地图上', status: 'not_started', targetWeek: 28, isFocus: false, workItems: ep('ep3', EMPTY), note: '未开始，距作品截止只有 1 周缓冲' },
      ] as EpisodeFixture[]).map(makeEpisode),
      quality: 68, audienceExpectation: 59, commercialPotential: 52,
      plan: { effort: 'standard', priority: 'progress', outsource: 'gap', rush: 'off', sinceWeek: 13 },
      planGaps: [
        { label: '分镜推进', planned: '每周 6 工作点', actual: '每周 4.5 工作点', reason: '白鹭到岗晚一周，演出人手不足' },
        { label: '赶工', planned: '关闭', actual: '关闭', reason: '承制合同违约扣罚高，暂不开启' },
      ],
      teamIds: ['s4', 's7'],
      conflicts: ['第 1 集作画检查需要陈砚，但他本周归属《雾港II》，只能等下周重新分配'],
      risks: [
        { level: 'medium', label: '分镜截止临近', signal: '第 22 周为分镜内部节点，当前落后 1 周', sinceWeek: 17 },
        { level: 'low', label: '承制结余薄', signal: '已用制作费占合同款 46%', sinceWeek: 13 },
      ],
      committee: [],
      account: {
        contractBudget: 1_450_000, received: 700_000, investmentTotal: 0, companyInvestPercent: 0,
        productionCost: 660_000, outsourcingCost: 56_000, projectedCommercial: '承制不参与非 BD 渠道分成', balance: -16_000,
      },
      series: null,
      marks: ['confirmed'],
    }),
    makeProject({
      id: 'p3', title: '小满', source: 'original', scale: 'short', mode: 'committee', status: 'producing',
      startWeek: 10, deadlineWeek: 22, episodeCount: 1, focusLabel: '第 1 集 · 声音与最终交付', plannedCompletion: 90,
      commonItems: common([25, 40, 30, 15, 30, 20], doneCommon),
      episodes: ([
        {
          index: 1, title: '小满', status: 'producing', targetWeek: 19, isFocus: true,
          workItems: ep('ep1', [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 900, 700, 600, 300, 0]),
          note: '门槛项「完成母版」0 / 12，需 1000‰；它未达标，本周交付按钮不可用',
        },
      ] as EpisodeFixture[]).map(makeEpisode),
      quality: 79, audienceExpectation: 52, commercialPotential: 45,
      plan: { effort: 'standard', priority: 'quality', outsource: 'off', rush: 'off', sinceWeek: 10 },
      planGaps: [{ label: '声音与最终交付', planned: '第 18 周完成', actual: '预计第 19 周完成', reason: '藤森色彩排期顺延一天，音响调整只做到 9 / 30' }],
      teamIds: ['s5'],
      conflicts: ['何茵若在第 19 周交付后释放，可缓解《夜行电车》的后期排队'],
      risks: [{ level: 'low', label: '原创短篇商业回收有限', signal: '受众认知低，靠口碑与奖项', sinceWeek: 10 }],
      committee: [
        { id: 'c5', name: '潮汐唱片', channel: 'music', investPercent: 20, since: 9 },
        { id: 'c6', name: '第四电视台', channel: 'tv_broadcast', investPercent: 10, since: 2 },
        { id: 'c7', name: '青梧动画', channel: 'bd', investPercent: 50, since: 10 },
      ],
      account: {
        contractBudget: 900_000, received: 900_000, investmentTotal: 1_800_000, companyInvestPercent: 50,
        productionCost: 742_000, outsourcingCost: 44_000, projectedCommercial: '短篇区间 0.6–1.1M，含奖项加成', balance: 114_000,
      },
      series: null,
      marks: ['confirmed', 'sample'],
    }),
  ],

  ledger: [
    { id: 'l1', week: 18, scope: 'company', projectId: null, category: 'salary', label: '正式员工工资（7 人）', amount: -186_000 },
    { id: 'l2', week: 18, scope: 'company', projectId: null, category: 'operations', label: '工作室运营与水电设备', amount: -92_000 },
    { id: 'l3', week: 18, scope: 'project', projectId: 'p2', category: 'contract', label: '《夜行电车》第二期合同款', amount: 350_000 },
    { id: 'l4', week: 18, scope: 'project', projectId: 'p1', category: 'production', label: '《雾港II》第 7 集原画制作费', amount: -60_000 },
    { id: 'l5', week: 18, scope: 'project', projectId: 'p1', category: 'outsourcing', label: '星野线上作画外包（第 4 批）', amount: -28_000 },
    { id: 'l6', week: 17, scope: 'project', projectId: 'p3', category: 'outsourcing', label: '藤森色彩后期收尾', amount: -22_000 },
    { id: 'l7', week: 17, scope: 'company', projectId: null, category: 'salary', label: '正式员工工资（7 人）', amount: -186_000 },
    { id: 'l8', week: 17, scope: 'project', projectId: 'p1', category: 'investment', label: '《雾港II》委员会首期投资到账', amount: 1_300_000 },
    { id: 'l9', week: 16, scope: 'company', projectId: null, category: 'operations', label: '工作室运营与水电设备', amount: -92_000 },
  ],

  receipts: [
    {
      week: 18,
      state: 'event_pending',
      stateNote: '本周结算已提交。有一张事件卡等待处理，另有 3 项属于玩家专属决定；持续方针没有打断。',
      rejected: null,
      closing: null,
      headline: '《小满》只差完成母版，第 7 集原画缺口成为本周唯一硬约束。',
      cashDelta: -16_000,
      costLines: [
        { category: 'contract', label: '《夜行电车》合同款', amount: 350_000 },
        { category: 'salary', label: '工资', amount: -186_000 },
        { category: 'operations', label: '运营', amount: -92_000 },
        { category: 'production', label: '制作费', amount: -60_000 },
        { category: 'outsourcing', label: '外包', amount: -28_000 },
      ],
      projectLines: [
        { projectId: 'p1', title: '雾港信使 II', episodeIndex: 7, stage: 'storyboard_key_animation', itemKey: 'ep7:key_animation', workDelta: 8, qualityDelta: 2, detail: '第 7 集原画 41 → 49 / 95，仍低于 900‰ 门槛', reason: '返工占掉两天；背景按依赖并行推进到 40 / 62，没有等原画' },
        { projectId: 'p1', title: '雾港信使 II', episodeIndex: 6, stage: 'sound_delivery', itemKey: 'ep6:delivery_master', workDelta: 3, qualityDelta: 1, detail: '第 6 集完成母版达标，进入「可主动交付」', reason: '系统没有自动交付，等玩家执行动作' },
        { projectId: 'p2', title: '夜行电车', episodeIndex: 1, stage: 'animation', itemKey: 'ep1:inbetween', workDelta: 6, qualityDelta: 1, detail: '第 1 集中割 41 → 47 / 78', reason: '郑桥本周归属本作；作画检查还缺陈砚' },
        { projectId: 'p3', title: '小满', episodeIndex: 1, stage: 'photography_editing', itemKey: 'ep1:composite', workDelta: 10, qualityDelta: 3, detail: '摄影合成 37 → 47 / 52', reason: '藤森色彩交付，摄影合成一次通过' },
      ],
      staffLines: [
        { staffId: 's2', name: '陈砚', fatigueDelta: 9, moraleDelta: -7, note: '本周归属《雾港II》，第 7 集返工集中在他的作画检查上' },
        { staffId: 's3', name: '苏未', fatigueDelta: 6, moraleDelta: -3, note: '加班一天，第 7 集原画仍有两张未修正' },
        { staffId: 's1', name: '林岸', fatigueDelta: 3, moraleDelta: -2, note: '上周在《小满》，本周切换产生一次性团队磨合损失' },
        { staffId: 's5', name: '何茵', fatigueDelta: -5, moraleDelta: 6, note: '《小满》收口，交付后下周可重新分配' },
      ],
      mustDecide: [
        { id: 'd1', projectId: 'p1', kind: 'reassign', label: '第 19 周把陈砚重新分配到哪一部', detail: '《雾港II》第 7 集原画缺人，《夜行电车》第 1 集作画检查也排不上。核心员工每周只能归一个项目，切换不受阶段边界限制，但要承担一次性磨合损失。', options: ['继续全部给《雾港II》第 7 集', '切到《夜行电车》，接受一次性磨合损失', '保持《雾港II》，把《夜行电车》检查交给外包'] },
        { id: 'd2', projectId: 'p1', kind: 'new_outsource', label: '是否为第 7 集原画追加外包', detail: '既有合同排期已排满，追加是一份新的花钱承诺，系统不会自动签。', options: ['追加星野线上 ¥56,000（下周起）', '改用明石動画 ¥46,000，可靠性 62', '不追加，接受进度落后'] },
        { id: 'd3', projectId: 'p3', kind: 'delivery', label: '《小满》第 1 集本周能否交付', detail: '门槛项「完成母版」0 / 12、要求 1000‰，尚未达标，交付按钮本周不可用。', options: ['等第 19 周达标后主动交付', '继续打磨；第 22 周期限届满将强制交付并按完成度扣罚'] },
      ],
      autoExecuted: [
        '三部作品的持续方针均沿用上周，未要求确认（D2）。',
        '《夜行电车》第 2 集分镜按既定方针继续推进，没有弹窗。',
        '星野线上按既有合同继续第 7 集原画外包，本周未新增承诺。',
        '市场企划本周刷新 2 条，进入机会列表而不是弹窗。',
      ],
      reportOnly: [
        '白鹭经验 +1（企划方向），临时员工不参与长期培养。',
        '明石動画可靠性 62，本周返工一张，已计入下周排期风险。',
        '公司声望 58，本周未变化。',
      ],
      nextFocus: [
        '第 19 周：《小满》完成母版达标后执行主动交付，同时重新分配何茵。',
        '第 19 周：第 6 集已可主动交付，交付后该集立即停止生产。',
        '第 21 周：星野线上产能被两部作品同时占用，需要提前排产。',
        '第 22 周：《夜行电车》分镜内部节点，当前落后 1 周。',
      ],
      event: {
        id: 'e1', scope: 'project', projectId: 'p1', tier: 'normal',
        title: '第 7 集原画返工：夜戏构图偏离演出构想',
        description: '第 7 集两张关键原画与「分镜与原画」阶段的演出构想不一致，作画监督要求返工；该集原画 49 / 95 尚未达到 900‰ 最低交付，中割已经被依赖卡住。',
        signals: ['第 7 集原画连续两周产出低于计划（-4、-6）', '陈砚疲劳 74 / 士气 58', '第 7 集是当前项目内定向目标，产能被它占用'],
        deadlineWeek: 19,
        viewed: false,
        options: [
          { id: 'o1', label: '本周返工', cost: 0, gain: '质量 +2，避免返工累积到完成母版阶段', risk: 'medium', riskNote: '第 7 集原画进度再落后约一周，第 8 集拿不到作画人手', fits: '工期压力可以承受时' },
          { id: 'o2', label: '推迟到第 21 周集中返工', cost: 12_000, gain: '保住本周产出', risk: 'high', riskNote: '返工压力累积到动画与作画检查，若届时疲劳未缓解损失更大', fits: '只在本周绝不能延期时' },
          { id: 'o3', label: '交给明石動画修正', cost: 46_000, gain: '进度与质量同时保住', risk: 'low', riskNote: '该供应商可靠性 62，可能仍需二次修正；委员会会看到外包比例上升', fits: '现金有余量时' },
        ],
        outcomes: {
          o1: '样本结果：本周返工，质量 +2；第 7 集原画顺延约一周，事件关闭。',
          o2: '样本结果：本周产出保住，确定代价 ¥12,000；返工压力延后到第 21 周。',
          o3: '样本结果：确定代价 ¥46,000，进度与质量按样本兑现；供应商仍保留二次修正风险。',
        },
      },
    },
    {
      week: 17,
      state: 'normal',
      stateNote: '正常经营周：只有 1 项需要玩家决定，其余由持续方针自动推进。',
      rejected: null,
      closing: null,
      headline: '委员会首期投资到账，恢复正常经营；第 6 集达到最低交付。',
      cashDelta: 900_000,
      costLines: [
        { category: 'investment', label: '《雾港II》委员会首期投资', amount: 1_300_000 },
        { category: 'salary', label: '工资', amount: -186_000 },
        { category: 'operations', label: '运营', amount: -92_000 },
        { category: 'temporary', label: '临时人员', amount: -34_000 },
        { category: 'production', label: '制作费', amount: -60_000 },
        { category: 'outsourcing', label: '外包', amount: -28_000 },
      ],
      projectLines: [
        { projectId: 'p1', title: '雾港信使 II', episodeIndex: 6, stage: 'sound_delivery', itemKey: 'ep6:sound_mix', workDelta: 9, qualityDelta: 1, detail: '第 6 集音响调整收口，门槛项全部达标', reason: '明石動画交付中割后解锁下游' },
        { projectId: 'p1', title: '雾港信使 II', episodeIndex: 7, stage: 'storyboard_key_animation', itemKey: 'ep7:key_animation', workDelta: 6, qualityDelta: 0, detail: '第 7 集原画 35 → 41 / 95', reason: '阶段起步第一周，主要在试做镜头' },
        { projectId: 'p2', title: '夜行电车', episodeIndex: 1, stage: 'storyboard_key_animation', itemKey: 'ep1:storyboard', workDelta: 4, qualityDelta: 0, detail: '第 1 集分镜达标，Layout 解锁', reason: '脚本返修占用演出，本周分镜几乎停住' },
        { projectId: 'p3', title: '小满', episodeIndex: 1, stage: 'animation', itemKey: 'ep1:inbetween', workDelta: 8, qualityDelta: 2, detail: '中割收口', reason: '摄影稳定推进' },
      ],
      staffLines: [
        { staffId: 's2', name: '陈砚', fatigueDelta: 7, moraleDelta: -2, note: '第 7 集原画集中投入' },
        { staffId: 's1', name: '林岸', fatigueDelta: 3, moraleDelta: 2, note: '《小满》试映反馈好于预期' },
      ],
      mustDecide: [
        { id: 'd17', projectId: 'p1', kind: 'delivery', label: '《雾港II》第 6 集是否本周交付', detail: '门槛项「完成母版」已达 1000‰；主动交付后该集立即停止生产，不再投入工作量或提升质量。', options: ['本周交付第 6 集', '继续打磨到 100% 再交付'] },
      ],
      autoExecuted: ['三部作品持续方针均沿用上周，未打断。', '《夜行电车》第 2 集脚本按方针继续，未要求确认。'],
      reportOnly: ['《小满》音乐 demo 到位，质量 +1。', '第 16 周回滚没有改变公司状态；本周刚性支出预检通过。'],
      nextFocus: ['第 7 集原画产能缺口开始成形。'],
      event: null,
    },
    {
      week: 16,
      state: 'settlement_rejected',
      stateNote: '刚性支出预检失败，本周结算已完整回滚：周数、项目、人员和现金均未改变。首版没有限时资金危机、紧急融资或负数现金。',
      rejected: {
        cash: 96_000,
        requiredNextWeek: 412_000,
        shortfall: 316_000,
        reason: '工资与运营等刚性支出无法由当前现金覆盖。',
      },
      closing: null,
      headline: '下周刚性支出比现金多 ¥316,000，本周推进未提交。',
      cashDelta: 0,
      costLines: [],
      projectLines: [],
      staffLines: [],
      mustDecide: [
        { id: 'd16', projectId: null, kind: 'new_commitment', label: '预检失败后只能调整承诺或结束经营', detail: '首版不提供紧急融资，也不允许现金为负。可以撤销未执行承诺、调整下周计划，或发起关闭流程；系统不会自动借款。', options: ['撤销尚未执行的新增项目承诺', '调整下周计划后重新预检', '发起公司关闭流程'] },
      ],
      autoExecuted: ['周推进事务已回滚，没有生成制作费、项目产出或员工状态变化。'],
      reportOnly: ['经营周仍停留在第 16 周，没有进入第 17 周。', '现金保持 ¥96,000，项目账不形成独立钱包。'],
      nextFocus: ['调整承诺后重新预检；预检再次失败将进入破产关闭流程。'],
      event: null,
    },
    {
      week: 19,
      state: 'closing',
      stateNote: '假设第 19 周发起周推进时刚性支出预检再次失败：该次推进回滚，并立即进入破产关闭流程；不存在等到期限届满才处理的危机周。',
      rejected: null,
      closing: {
        reason: 'bankrupt', cash: 96_000, pendingProjectIds: ['p1', 'p2', 'p3'],
        allowedActions: ['结清已经达到最低交付门槛的作品或单集', '生成经营总结'],
        blockedActions: ['推进经营周', '立项、招聘、签约外包或新增项目支出', '自动借款或自动追加投资'],
      },
      headline: '刚性支出预检失败，公司进入关闭流程；待交付作品进入关闭交付。',
      cashDelta: 0,
      costLines: [],
      projectLines: [],
      staffLines: [],
      mustDecide: [
        { id: 'd19', projectId: 'p1', kind: 'delivery', label: '结清《雾港信使 II》已达标单集', detail: '第 6 集达到最低交付门槛，可进入关闭交付；其余未达标项目不能伪报完成。', options: ['预览第 6 集关闭交付', '查看未达标项目的阻塞原因'] },
      ],
      autoExecuted: ['经营周不再推进，不再生成新的事件、市场报价或制作产出。'],
      reportOnly: ['现金 ¥96,000 保留在公司单一现金池，项目账不形成独立钱包。', '已交付作品仍进入 Archive，供经营总结引用。'],
      nextFocus: ['完成待交付结清后生成经营总结。'],
      event: null,
    },
  ],

  marketOffers: [
    { id: 'm1', title: '深夜食堂的季节', source: 'manga', scale: 'tv', origin: 'market', budget: 2_400_000, durationWeeks: 26, minReputation: 55, heat: 'warm', hook: '原作稳定，作画需求高，正好撞上当前的作画缺口', blockedBy: '核心作画产能不足', allowedModes: ['contract', 'committee'], committeeCandidates: ['r1', 'r2'] },
    { id: 'm2', title: '转生成路由器', source: 'light_novel', scale: 'short', origin: 'market', budget: 620_000, durationWeeks: 8, minReputation: 40, heat: 'hot', hook: '短平快，能在第 26 周前回款', blockedBy: null, allowedModes: ['contract', 'committee'], committeeCandidates: ['r3', 'r4'] },
    { id: 'm3', title: '雾港·前夜', source: 'original', scale: 'ova', origin: 'self_original', budget: 900_000, durationWeeks: 12, minReputation: 50, heat: 'warm', hook: '系列认知可继承，商业基础比新 IP 稳', blockedBy: '原创必须采用委员会模式', allowedModes: ['committee'], committeeCandidates: ['r1'] },
    { id: 'm4', title: '《夜行》番外（员工提案）', source: 'original', scale: 'short', origin: 'staff_proposal', budget: 380_000, durationWeeks: 6, minReputation: 0, heat: 'cold', hook: '周慕提出，可作为团队练手', blockedBy: '提案槽位只有一个', allowedModes: ['contract'], committeeCandidates: [] },
  ],

  relationships: [
    { id: 'r1', name: '冬青社', kind: 'publisher', since: 6, strength: 72, lastProject: 'p1', note: '《雾港》原作版权方，续作由其引荐；首版不提供紧急融资操作' },
    { id: 'r2', name: '星野周边', kind: 'toy', since: 11, strength: 55, lastProject: 'p1', note: '要求第 20 周前看到角色设计定稿' },
    { id: 'r3', name: '潮汐唱片', kind: 'music', since: 9, strength: 61, lastProject: 'p3', note: '已连续合作两部，愿意小额跟投' },
    { id: 'r4', name: '第四电视台', kind: 'tv_broadcast', since: 2, strength: 38, lastProject: 'p3', note: '首次合作，档期尚未确认' },
  ],

  history: [
    { id: 'h1', title: '雾港信使', source: 'manga', scale: 'tv', endWeek: 7, quality: 74, commercial: 68, profit: 420_000, rating: 'B', note: '第一季，系列基础与冬青社关系由此建立' },
    { id: 'h2', title: '纸飞机同盟', source: 'original', scale: 'ova', endWeek: 3, quality: 61, commercial: 44, profit: -180_000, rating: 'C', note: '首部委员会原创，投资本金亏损' },
    { id: 'h3', title: '通勤星座', source: 'light_novel', scale: 'short', endWeek: 5, quality: 70, commercial: 62, profit: 96_000, rating: 'B', note: '短篇试水，回款稳定' },
  ],
  pendingEvents: [],
}
