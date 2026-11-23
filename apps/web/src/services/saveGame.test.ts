import { beforeEach, expect, it } from 'vitest'
import { idleState, v3IdleState, v3ProducingState, v3EventState, v3ReadyState, v3SettledState, v3EndedState } from '../test/fixtures'
import { isGameState } from '../types/gameV3'
import { decodeV3SaveRecord, loadGame, saveGame } from './saveGame'

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase('anime-production-committee')
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
})

async function rawRecord(value?: unknown): Promise<{ record: unknown; version: number }> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('anime-production-committee', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('saves')
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('saves', value === undefined ? 'readonly' : 'readwrite')
      const store = transaction.objectStore('saves')
      if (value !== undefined) store.put(value, 'current')
      const read = store.get('current')
      transaction.oncomplete = () => { database.close(); resolve({ record: read.result, version: database.version }) }
      transaction.onerror = () => { database.close(); reject(transaction.error) }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
    request.onerror = () => reject(request.error)
  })
}

it('不存在存档时返回 null', async () => {
  expect(await loadGame()).toBeNull()
})

it.each([1, 2])('读取拒绝旧 v%s 信封且不覆盖原记录', async (version) => {
  const record = { version, savedAt: '2026-11-21T00:00:00.000Z', state: idleState() }
  await rawRecord(record)
  await expect(loadGame()).rejects.toThrow(`v${version} 存档不兼容周制经营 v3，请新开游戏；旧存档未被覆盖。`)
  expect((await rawRecord()).record).toEqual(record)
})

it('读取完整恢复事件、作品与终局，DB schema 不变且没有写操作', async () => {
  for (const state of [v3IdleState(), v3ProducingState(), v3EventState(), v3ReadyState(), v3SettledState(), v3EndedState()]) {
    const record = { version: 3, savedAt: '2026-11-21T00:00:00.000Z', state }
    await rawRecord(record)
    expect(await loadGame()).toEqual(state)
    expect(await rawRecord()).toEqual({ record, version: 1 })
  }
})

it('拒绝信封/状态版本错配、缺失字段和损坏记录，原档保持不变', async () => {
  const valid = { version: 3, savedAt: '2026-11-21T00:00:00.000Z', state: v3IdleState() }
  for (const record of [null, {}, Object.assign([], valid), { ...valid, version: 99 }, { ...valid, savedAt: 'invalid' },
    { ...valid, savedAt: 42 }, { version: 3, state: valid.state }, { version: 3, savedAt: valid.savedAt },
    { ...valid, state: idleState() }, { ...valid, state: { ...valid.state, company: null } }]) {
    await rawRecord(record)
    await expect(loadGame()).rejects.toThrow('存档损坏或版本不受支持')
    expect((await rawRecord()).record).toEqual(record)
  }
  expect(decodeV3SaveRecord(undefined)).toBeNull()
})

it('IndexedDB 事务保存完整 v3 状态与 savedAt，数据库仍为 version 1', async () => {
  const state = v3ProducingState()
  expect(await saveGame(state)).toBe('saved')
  expect(await loadGame()).toEqual(state)
  const { record, version } = await rawRecord()
  expect(version).toBe(1)
  expect(record).toEqual({ version: 3, savedAt: expect.any(String), state })
  expect(Number.isFinite(Date.parse((record as { savedAt: string }).savedAt))).toBe(true)
})

it.each([1, 2])('旧 v%s 记录同样占用单槽，未确认不覆盖', async (version) => {
  const legacy = { version, savedAt: '2026-11-21T00:00:00.000Z', state: idleState() }
  await rawRecord(legacy)
  expect(await saveGame(v3ProducingState())).toBe('occupied')
  expect(await rawRecord()).toEqual({ record: legacy, version: 1 })
})

it('单槽已有存档时默认拒绝覆盖，显式确认后才替换', async () => {
  const first = v3ProducingState()
  await saveGame(first)
  const occupied = await rawRecord()
  const next = v3EventState()
  expect(await saveGame(next)).toBe('occupied')
  expect(await loadGame()).toEqual(first)
  expect(await rawRecord()).toEqual(occupied)
  expect(await saveGame(next, true)).toBe('saved')
  expect(await loadGame()).toEqual(next)
})

it('六个阶段状态保存后均可完整恢复', async () => {
  for (const state of [v3IdleState(), v3ProducingState(), v3EventState(), v3ReadyState(), v3SettledState(), v3EndedState()]) {
    expect(await saveGame(state, true)).toBe('saved')
    expect(await loadGame()).toStrictEqual(state)
  }
})

it('重复保存与读取不产生状态漂移', async () => {
  const state = v3ProducingState()
  await saveGame(state)
  const first = await loadGame()
  expect(await saveGame(first!, true)).toBe('saved')
  const second = await loadGame()
  expect(second).toStrictEqual(state)
  expect(second).toStrictEqual(first)
})

it('缺省 M2 可选字段的早期 v3 存档与携带可选字段的 v3 存档都完整往返', async () => {
  const legacy = v3IdleState()
  expect(legacy.company.scout_pity).toBeUndefined()
  expect('custom_offer' in legacy).toBe(false)
  expect('pending_proposal' in legacy).toBe(false)
  await saveGame(legacy)
  expect(await loadGame()).toStrictEqual(legacy)

  const extended = v3IdleState()
  extended.company.scout_pity = { since_sr: 3, since_ssr: 0 }
  extended.custom_offer = { ...structuredClone(extended.offers[0]), id: 'v3_custom', name: '自定企划', origin: 'custom' }
  extended.pending_proposal = { ...structuredClone(extended.offers[0]), id: 'v3_proposal', name: '员工提案', source: 'original', scale: 'movie', origin: 'proposal', allowed_modes: ['committee'] }
  expect(isGameState(extended)).toBe(true)
  await saveGame(extended, true)
  expect(await loadGame()).toStrictEqual(extended)
})

it('核心新增而契约未收录的字段原样往返，前端不丢弃也不伪造', async () => {
  const state = v3ProducingState()
  const cashLog = [{ week: 1, type: 'expense', reason: 'weekly_fixed_costs', amount: -200_000, before: 7_000_000, after: 6_800_000, project_id: null }]
  const company = state.company as unknown as Record<string, unknown>
  company.cash_log = cashLog
  await saveGame(state)
  const loaded = await loadGame()
  expect(loaded).toStrictEqual(state)
  expect((loaded!.company as unknown as Record<string, unknown>).cash_log).toEqual(cashLog)
})

it('写入事务中断时保留已有存档与数据库记录', async () => {
  const state = v3ProducingState()
  await saveGame(state, true)
  const before = await rawRecord()
  const put = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
    const request = put.call(this, value, key)
    this.transaction.abort()
    return request
  } as typeof IDBObjectStore.prototype.put
  try {
    await expect(saveGame(v3EventState(), true)).rejects.toThrow('保存失败')
  } finally {
    IDBObjectStore.prototype.put = put
  }
  expect(await rawRecord()).toEqual(before)
  expect(await loadGame()).toEqual(state)
})

it('读取事务中断时报错，存档记录与会话数据均不改变', async () => {
  const state = v3ProducingState()
  await saveGame(state, true)
  const before = await rawRecord()
  const get = IDBObjectStore.prototype.get
  IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey) {
    const request = get.call(this, query)
    this.transaction.abort()
    return request
  } as typeof IDBObjectStore.prototype.get
  try {
    await expect(loadGame()).rejects.toThrow('读取失败')
  } finally {
    IDBObjectStore.prototype.get = get
  }
  expect(await rawRecord()).toEqual(before)
})

it('保存验证深层数据，失败保留已有有效存档', async () => {
  const state = v3ProducingState()
  await saveGame(state)
  const invalid = v3ProducingState()
  invalid.company.staff[0].morale = 101
  const badWeek = v3ProducingState()
  badWeek.company.week = Number.MAX_SAFE_INTEGER + 1
  for (const value of [invalid, { ...state, company: { ...state.company, funds: -1 } }, { ...state, seed: 0x100000000 }, badWeek]) {
    await expect(saveGame(value)).rejects.toThrow('经营数据无效')
    expect(await loadGame()).toEqual(state)
  }
})

it.each([
  null, {}, { version: 99, state: {} },
  { version: 2, state: idleState() },
  { version: 2, savedAt: 'not-a-date', state: idleState() },
  { version: 2, savedAt: 42, state: idleState() },
  { version: 2, savedAt: '2026-01-01T00:00:00.000Z', state: { ...idleState(), funds: -1 } },
])('拒绝损坏/不兼容存档且不改写原记录 %j', async (record) => {
  await rawRecord(record)
  await expect(loadGame()).rejects.toThrow(/存档损坏或版本不受支持|不兼容周制经营/)
  expect((await rawRecord()).record).toEqual(record)
})
