import { beforeEach, expect, it } from 'vitest'
import type { V4GameState } from '../types/gameV4State'
import { loadGameV4, saveGameV4 } from './saveGameV4'

const state = (week: number): V4GameState => ({
  version: 4, seed: 3,
  company: { id: 'company_01', name: '测试公司', founded_week: 0, week, status: 'running', end_reason: null, reputation: 100, reputation_log: [] },
  staff: [], recruitment: { pool: [], pity: { since_sr: 0, since_ssr: 0 }, last_scout_week: null },
  works: [], suppliers: [], contracts: [], partners: [], committees: [],
  market: { heat: {}, slots: [], custom_offer: null, proposal: null, refresh_week: null, last_competition_round: 0, competitors: [] },
  events: { pending: [], last_event_week: null, per_work: {} },
  finance: { opening_funds: 2_000_000, balance: 2_000_000, entries: [], loans: [], solvency: { state: 'normal', since_week: null, deadline_week: null, gap: 0 } },
  archive: { works: [], series: [], company_result: null },
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
