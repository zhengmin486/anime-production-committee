import { useState } from 'react'
import { ledgerNames, scaleNames, sourceNames } from './model'
import type { LedgerCategory, PrototypeData } from './model'
import { Panel, Stat, signedYuan, yuan } from './bits'

export function FinanceArchive({ data }: { data: PrototypeData }) {
  const [week, setWeek] = useState('all')
  const [category, setCategory] = useState('all')
  const [projectId, setProjectId] = useState('all')
  const entries = data.ledger.filter((entry) =>
    (week === 'all' || entry.week === Number(week)) &&
    (category === 'all' || entry.category === category) &&
    (projectId === 'all' || entry.projectId === projectId),
  )
  const inflow = entries.filter((entry) => entry.amount > 0).reduce((sum, entry) => sum + entry.amount, 0)
  const outflow = entries.filter((entry) => entry.amount < 0).reduce((sum, entry) => sum + entry.amount, 0)
  const projectTitles = new Map([...data.projects, ...data.history].map((project) => [project.id, project.title]))
  const titleOf = (id: string | null) => id ? projectTitles.get(id) ?? '核心作品归因' : '公司统一账目'
  const weeks = [...new Set(data.ledger.map((entry) => entry.week))].sort((a, b) => b - a)

  return <div id="finance-archive" className="proto-stack finance-archive">
    <Panel eyebrow="FINANCE / 公司流水" title="公司现金流水与项目归因" marks={['confirmed']}
      note="公司始终只有一个现金池。项目归因只解释现金为何变化，不是项目独立账户；下表来自 v4 核心账本。">
      <div className="finance-filters" aria-label="流水筛选">
        <label>周次<select value={week} onChange={(event) => setWeek(event.target.value)}>
          <option value="all">全部周次</option>{weeks.map((item) => <option key={item} value={item}>第 {item} 周</option>)}
        </select></label>
        <label>类别<select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="all">全部类别</option>{(Object.keys(ledgerNames) as LedgerCategory[]).map((item) => <option key={item} value={item}>{ledgerNames[item]}</option>)}
        </select></label>
        <label>归因<select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
          <option value="all">公司与全部作品</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}{data.history.map((work) => <option key={work.id} value={work.id}>{work.title}（已归档）</option>)}
        </select></label>
      </div>
      <dl className="proto-stats proto-stats-tight">
        <Stat label="当前公司现金" value={yuan(data.company.cash)} hint="唯一可支配现金池" />
        <Stat label="筛选流入" value={signedYuan(inflow)} />
        <Stat label="筛选流出" value={signedYuan(outflow)} />
        <Stat label="筛选结余" value={signedYuan(inflow + outflow)} hint={`${entries.length} 笔核心流水`} />
      </dl>
      <div className="proto-table-wrap"><table className="proto-table finance-table" aria-label="公司现金流水">
        <thead><tr><th>周次</th><th>归因</th><th>类别与说明</th><th>金额</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={entry.id}>
          <td>第 {entry.week} 周</td>
          <td>{titleOf(entry.projectId)}</td>
          <td><strong>{ledgerNames[entry.category]}</strong><span className="cell-sub">{entry.label}</span></td>
          <td className={entry.amount < 0 ? 'cell-behind' : 'cell-ahead'}>{signedYuan(entry.amount)}</td>
        </tr>)}</tbody>
      </table></div>
      {entries.length === 0 && <p className="proto-inline-note">当前筛选没有流水。</p>}
    </Panel>

    <Panel eyebrow="ARCHIVE / 已交付作品" title="作品 Archive 与经营历史" marks={['confirmed']}
      note="只收录已经交付的作品；在制项目不会因为完成度高就提前进入 Archive。">
      <ul className="archive-list">{data.history.map((work) => <li key={work.id}>
        <div className="archive-head"><h3>{work.title}</h3><span className="archive-rating">评级 {work.rating}</span></div>
        <p className="archive-meta">{sourceNames[work.source]} · {scaleNames[work.scale]} · 第 {work.endWeek} 周交付</p>
        <dl className="portfolio-facts">
          <div><dt>质量</dt><dd>{work.quality}</dd></div>
          <div><dt>商业表现</dt><dd>{work.commercial}</dd></div>
          <div><dt>经营利润</dt><dd className={work.profit < 0 ? 'cell-behind' : 'cell-ahead'}>{signedYuan(work.profit)}</dd></div>
        </dl>
        <p>{work.note}</p>
      </li>)}</ul>
    </Panel>
  </div>
}
