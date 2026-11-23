import { isGameState } from '../types/gameV3'
import type { GameState, SaveRecord } from '../types/gameV3'

const databaseName = 'anime-production-committee'
const storeName = 'saves'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => {
      if (blocked) request.result.close()
      else resolve(request.result)
    }
    request.onerror = () => reject(request.error ?? new Error('无法打开本地存档'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('存档数据库被其他页面占用，请关闭旧页面后重试。'))
    }
  })
}

export type SaveOutcome = 'saved' | 'occupied'

// 单槽手动存档：槽位已被占用时默认不覆盖，存在性检查与写入在同一事务内完成。
export async function saveGame(state: GameState, overwrite = false): Promise<SaveOutcome> {
  if (!isGameState(state)) throw new Error('经营数据无效，无法保存。')
  const record = { version: 3, savedAt: new Date().toISOString(), state } satisfies SaveRecord
  const database = await openDatabase()
  try {
    return await new Promise<SaveOutcome>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      const existing = store.get('current')
      let occupied = false
      existing.onsuccess = () => {
        occupied = existing.result !== undefined
        if (occupied && !overwrite) transaction.abort()
        else store.put(record, 'current')
      }
      transaction.oncomplete = () => resolve('saved')
      transaction.onabort = () => occupied && !overwrite
        ? resolve('occupied')
        : reject(transaction.error ?? new Error('保存失败'))
      transaction.onerror = () => reject(transaction.error ?? new Error('保存失败'))
    })
  } finally {
    database.close()
  }
}

async function readSaveRecord(): Promise<unknown> {
  const database = await openDatabase()
  let record: unknown
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get('current')
      request.onsuccess = () => { record = request.result }
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => reject(transaction.error ?? new Error('读取失败'))
      transaction.onerror = () => reject(transaction.error ?? new Error('读取失败'))
    })
  } finally {
    database.close()
  }
  return record
}

export function decodeV3SaveRecord(record: unknown): GameState | null {
  if (record === undefined) return null
  if (typeof record === 'object' && record !== null && 'version' in record
    && (record.version === 1 || record.version === 2)) {
    throw new Error(`v${record.version} 存档不兼容周制经营 v3，请新开游戏；旧存档未被覆盖。`)
  }
  if (typeof record !== 'object' || record === null || Array.isArray(record) || !('version' in record) || record.version !== 3
    || !('savedAt' in record) || typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt))
    || !('state' in record) || !isGameState(record.state)) {
    throw new Error('存档损坏或版本不受支持，当前数据未改变。')
  }
  return record.state
}

export async function loadGame(): Promise<GameState | null> {
  return decodeV3SaveRecord(await readSaveRecord())
}
