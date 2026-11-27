import { beforeEach, expect, it } from 'vitest'
import type { V4GameState, V4Staff, V4WorkItem } from '../types/gameV4State'
import { loadGameV4, saveGameV4 } from './saveGameV4'

const state = (week: number): V4GameState => ({
  version: 4, seed: 3,
  company: { id: 'company_01', name: '测试公司', founded_week: 0, week, status: 'running', end_reason: null, reputation: 100, reputation_log: [] },
  staff: [], recruitment: { pool: [], free_pool: [], pity: { since_sr: 0, since_ssr: 0 }, last_scout_week: null },
  works: [], suppliers: [], contracts: [], partners: [], committees: [],
  market: { heat: {}, slots: [], custom_offer: null, proposal: null, refresh_week: null, last_competition_round: 0, competitors: [] },
  events: { pending: [], last_event_week: null, per_work: {} },
  finance: { opening_funds: 2_000_000, balance: 2_000_000, entries: [], loans: [], solvency: { state: 'normal', since_week: null, deadline_week: null, gap: 0 } },
  archive: { works: [], series: [], company_result: null },
})

const workItem = (): V4WorkItem => ({
  id: 'work_01.common.series_comp', key: 'series_comp', ability: 'planning', work_total: 100, work_done: 0,
  deliver_at: 1000, deps: [], is_gate: false, outsourceable: false, quality_weight_permille: 200, core_aesthetic: false,
  in_house_points: 0, in_house_ability_centi_sum: 0, external_points: 0, external_quality_milli_sum: 0,
  external_min_quality: 0,
  quality: { story: 0, direction: 0, drawing: 0, animation: 0, art: 0, sound: 0 }, contributors: [],
})

const stateWithWorkItem = (): V4GameState => {
  const value = state(0)
  value.works.push({
    id: 'work_01',
    offer: {
      id: 'offer_01', name: '测试项目', source: 'original', genre: '测试', scale: 'short', contract_budget: 1000,
      duration_weeks: 26, target_quality: 80, audience_base: 100, commercial_potential: 100, channel_potentials: {},
      channels_baseline: [], allowed_modes: ['contract'], committee_candidates: [], min_reputation: 0, required_works: [],
      blueprint_id: 'test_tiny', episode_count: 1, workload_scale_permille: 1000, origin: '测试', style: '测试',
      offer_source_type: 'test', deposit_basis: 100, expires_week: 26, locked_until: null, lock_used: false, deposit_paid: 0,
    },
    mode: 'contract', investment: {}, channels: [], opened_week: 0, deadline_week: 26, extension: {}, status: 'producing',
    supervisor_staff_id: null, contributor_snapshots: [], ip_id: null, committee_id: null, tv_service: null,
    common: { id: 'work_01.common', items: [workItem()] }, episodes: [],
    plan: { intensity: 'normal', focus: 'quality', outsourcing: 'none', overtime: false, target: null }, delivery: null,
  })
  return value
}

const staff = (id: string): V4Staff => ({
  id, name: '测试候选', role: 'director', employment: 'core',
  abilities: { planning: 50, direction: 50, drawing: 50, animation: 50, management: 50, postproduction: 50 },
  experience: { planning: 0, direction: 0, drawing: 0, animation: 0, management: 0, postproduction: 0 },
  potential: { planning: 50, direction: 50, drawing: 50, animation: 50, management: 50, postproduction: 50 },
  revealed_potential: { planning: false, direction: false, drawing: false, animation: false, management: false, postproduction: false },
  talent_type: 'specialist', weekly_salary: 100, signing_fee: 0, fatigue: 0, morale: 80, departure_warning: false,
  assignment_work_id: null, last_participation: null, temporary_contract: null,
})

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('anime-production-committee')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

async function rawRecord() {
  return new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open('anime-production-committee', 1)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('saves', 'readonly')
      const entry = transaction.objectStore('saves').get('current')
      transaction.oncomplete = () => { database.close(); resolve(entry.result) }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
    }
    request.onerror = () => reject(request.error)
  })
}

async function putRawRecord(value: unknown) {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('anime-production-committee', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('saves')
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('saves', 'readwrite')
      transaction.objectStore('saves').put(value, 'current')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
    }
    request.onerror = () => reject(request.error)
  })
}

it('首次保存与完整读取使用 v4 信封', async () => {
  expect(await loadGameV4()).toBeNull()
  expect(await saveGameV4(state(0))).toBe('saved')
  expect(await loadGameV4()).toEqual({ state: state(0), rulesVersion: 'v4' })
  expect(await rawRecord()).toEqual({ version: 4, savedAt: expect.any(String), rules_version: 'v4', state: state(0) })
})

it('占用时默认不覆盖，确认覆盖后返回 saved 而非 occupied', async () => {
  await saveGameV4(state(1))
  const first = await rawRecord()
  expect(await saveGameV4(state(2))).toBe('occupied')
  expect(await rawRecord()).toEqual(first)
  expect(await saveGameV4(state(2), true)).toBe('saved')
  expect(await loadGameV4()).toEqual({ state: state(2), rulesVersion: 'v4' })
})

it('拒绝覆盖旧版存档并保留原记录', async () => {
  const legacy = { version: 3, savedAt: new Date().toISOString(), state: { version: 3 } }
  await putRawRecord(legacy)
  await expect(saveGameV4(state(2), true)).rejects.toMatchObject({ code: 'SAVE_VERSION_UNSUPPORTED' })
  expect(await rawRecord()).toEqual(legacy)
})

it('真实状态校验拒绝损坏账目并保留旧档，读取损坏存档也失败', async () => {
  await saveGameV4(state(1))
  const before = await rawRecord()
  const invalid = state(2)
  invalid.finance.balance += 1
  await expect(saveGameV4(invalid, true)).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  expect(await rawRecord()).toEqual(before)

  await putRawRecord({ version: 4, savedAt: new Date().toISOString(), rules_version: 'v4', state: invalid })
  await expect(loadGameV4()).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
})

it.each([
  'outsourceable', 'quality_weight_permille', 'core_aesthetic', 'in_house_points', 'in_house_ability_centi_sum',
  'external_points', 'external_quality_milli_sum', 'external_min_quality',
])('拒绝缺少 WorkItem 新必填字段 %s 的旧 v4 存档且不静默补默认', async (field) => {
  const legacy = stateWithWorkItem()
  delete (legacy.works[0].common.items[0] as unknown as Record<string, unknown>)[field]
  const record = { version: 4, savedAt: new Date().toISOString(), rules_version: 'v4', state: legacy }
  await putRawRecord(record)
  await expect(loadGameV4()).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  await expect(saveGameV4(legacy, true)).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  expect(await rawRecord()).toEqual(record)
})

it('拒绝缺少 recruitment.free_pool 的旧 v4 存档且不静默补默认', async () => {
  const legacy = state(0)
  delete (legacy.recruitment as unknown as Record<string, unknown>).free_pool
  const record = { version: 4, savedAt: new Date().toISOString(), rules_version: 'v4', state: legacy }
  await putRawRecord(record)
  await expect(loadGameV4()).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  await expect(saveGameV4(legacy, true)).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  expect(await rawRecord()).toEqual(record)
})

it('严格校验 WorkItem 数值边界与外包贡献账本', async () => {
  const invalidStates = [
    (value: V4GameState) => { value.works[0].common.items[0].work_total = 0 },
    (value: V4GameState) => { value.works[0].common.items[0].work_done = 101 },
    (value: V4GameState) => { value.works[0].common.items[0].deliver_at = 1001 },
    (value: V4GameState) => { value.works[0].common.items[0].quality_weight_permille = 1001 },
    (value: V4GameState) => { value.works[0].common.items[0].in_house_ability_centi_sum = -1 },
    (value: V4GameState) => { value.works[0].common.items[0].external_points = 1 },
  ]
  for (const invalidate of invalidStates) {
    const value = stateWithWorkItem()
    invalidate(value)
    await expect(saveGameV4(value)).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  }
})

it('接受合法 free_pool，并拒绝候选形状、冷却周与归属非法', async () => {
  const valid = state(0)
  valid.recruitment.free_pool = [{ staff: staff('candidate_01'), expires_week: 2, origin: 'regular' }]
  expect(await saveGameV4(valid)).toBe('saved')
  expect(await loadGameV4()).toEqual({ state: valid, rulesVersion: 'v4' })

  const invalidStates = [
    (value: V4GameState) => { value.recruitment.free_pool![0].origin = 'scout' },
    (value: V4GameState) => { value.recruitment.free_pool![0].expires_week = null },
    (value: V4GameState) => { value.recruitment.free_pool![0].staff.employment = 'temporary' },
    (value: V4GameState) => { value.recruitment.free_pool![0].staff.assignment_work_id = 'work_01' },
    (value: V4GameState) => { value.recruitment.free_pool!.push({ staff: staff('candidate_01'), expires_week: 2, origin: 'regular' }) },
  ]
  for (const invalidate of invalidStates) {
    const value = state(0)
    value.recruitment.free_pool = [{ staff: staff('candidate_01'), expires_week: 2, origin: 'regular' }]
    invalidate(value)
    await expect(saveGameV4(value)).rejects.toMatchObject({ code: 'SAVE_CORRUPT' })
  }
})

it('保留并往返事件升级快照', async () => {
  const value = stateWithWorkItem()
  const abandon = { id: 'timeout', label: '放弃', kind: 'abandon', risk_hint: '超时', cost: 0, effects: [] }
  value.events.pending.push({
    event_id: 'schedule_slip', name: '进度滑坡', work_id: 'work_01', triggered_week: 0, expires_week: 1,
    cooldown_weeks: 0, once_per_project: false, viewed: true, options: [abandon], timeout_option_id: 'timeout',
    escalated: true,
    escalation: { description: '二次超时', expires_weeks: 2, triggered_week: 0, options: [abandon], timeout_option_id: 'timeout' },
  })
  expect(await saveGameV4(value)).toBe('saved')
  expect(await loadGameV4()).toEqual({ state: value, rulesVersion: 'v4' })
})

it('覆盖写入中断时拒绝并保留旧档', async () => {
  await saveGameV4(state(1))
  const before = await rawRecord()
  const put = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    const request = put.call(this, value, key)
    this.transaction.abort()
    return request
  } as typeof IDBObjectStore.prototype.put
  try {
    await expect(saveGameV4(state(2), true)).rejects.toThrow('保存失败')
  } finally {
    IDBObjectStore.prototype.put = put
  }
  expect(await rawRecord()).toEqual(before)
})
