import { isV4GameState, type V4GameState } from '../types/gameV4State'

export const V4_RULES_VERSION = 'v4'
const databaseName = 'anime-production-committee'
const storeName = 'saves'
const saveKey = 'current'

export interface V4SaveRecord {
  version: 4
  savedAt: string
  rules_version: string
  state: V4GameState
}

export type V4SaveErrorCode = 'SAVE_CORRUPT' | 'SAVE_VERSION_UNSUPPORTED' | 'SAVE_FAILED'

export class V4SaveError extends Error {
  constructor(public readonly code: V4SaveErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'V4SaveError'
  }
}

interface DatabaseLike {
  transaction(stores: string | string[], mode?: IDBTransactionMode): IDBTransaction
  close(): void
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const exactFields = (value: Record<string, unknown>, fields: readonly string[]) => Object.keys(value).length === fields.length
  && fields.every((field) => Object.hasOwn(value, field))

export function decodeV4SaveRecord(value: unknown): V4SaveRecord | null {
  if (value === undefined) return null
  if (!isRecord(value)) throw new V4SaveError('SAVE_CORRUPT', '存档损坏或版本不受支持。')
  if (!Number.isSafeInteger(value.version)) throw new V4SaveError('SAVE_CORRUPT', '存档损坏或版本不受支持。')
  if (value.version !== 4) {
    throw new V4SaveError('SAVE_VERSION_UNSUPPORTED', `v${String(value.version)} 存档不兼容周制经营 v4，请新开游戏；旧存档未被覆盖。`)
  }
  if (!exactFields(value, ['version', 'savedAt', 'rules_version', 'state']) || typeof value.savedAt !== 'string'
    || !Number.isFinite(Date.parse(value.savedAt)) || typeof value.rules_version !== 'string' || value.rules_version.trim().length === 0
    || !isV4GameState(value.state)) {
    throw new V4SaveError('SAVE_CORRUPT', '存档损坏或版本不受支持。')
  }
  return value as unknown as V4SaveRecord
}

function openDatabase(): Promise<DatabaseLike> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(storeName)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function loadGameV4(): Promise<{ state: V4GameState; rulesVersion: string } | null> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(storeName, 'readonly')
      const request = transaction.objectStore(storeName).get(saveKey)
      transaction.oncomplete = () => {
        database.close()
        try {
          const decoded = decodeV4SaveRecord(request.result)
          resolve(decoded ? { state: decoded.state, rulesVersion: decoded.rules_version } : null)
        } catch (error) {
          reject(error)
        }
      }
      transaction.onerror = () => {
        database.close()
        reject(new V4SaveError('SAVE_CORRUPT', '读取失败，存档记录未被改写。', { cause: transaction.error }))
      }
      transaction.onabort = () => {
        database.close()
        reject(new V4SaveError('SAVE_CORRUPT', '读取失败，存档记录未被改写。', { cause: transaction.error }))
      }
    } catch (cause) {
      database.close()
      reject(new V4SaveError('SAVE_CORRUPT', '读取失败，存档记录未被改写。', { cause }))
    }
  })
}

export async function saveGameV4(state: V4GameState, overwrite = false): Promise<'saved' | 'occupied'> {
  if (!isV4GameState(state)) throw new V4SaveError('SAVE_CORRUPT', '经营数据无效，已有存档未被覆盖。')
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    try {
      const transaction = database.transaction(storeName, 'readwrite')
      const store = transaction.objectStore(storeName)
      let occupied = false
      let written = false
      let unsupportedExistingVersion = false
      const existing = store.get(saveKey)
      existing.onsuccess = () => {
        occupied = existing.result !== undefined
        if (occupied && overwrite && (!isRecord(existing.result) || existing.result.version !== 4)) {
          unsupportedExistingVersion = true
          transaction.abort()
          return
        }
        if (!occupied || overwrite) {
          const record: V4SaveRecord = {
            version: 4,
            savedAt: new Date().toISOString(),
            rules_version: V4_RULES_VERSION,
            state,
          }
          store.put(record, saveKey)
          written = true
        }
      }
      transaction.oncomplete = () => {
        database.close()
        resolve(written ? 'saved' : 'occupied')
      }
      transaction.onerror = () => {
        database.close()
        reject(new V4SaveError('SAVE_FAILED', '保存失败，已有存档未被覆盖。', { cause: transaction.error }))
      }
      transaction.onabort = () => {
        database.close()
        reject(unsupportedExistingVersion
          ? new V4SaveError('SAVE_VERSION_UNSUPPORTED', '旧版存档不兼容多项目 v4，请新开游戏；原存档未被覆盖。')
          : new V4SaveError('SAVE_FAILED', '保存失败，已有存档未被覆盖。', { cause: transaction.error }))
      }
    } catch (cause) {
      database.close()
      reject(new V4SaveError('SAVE_FAILED', '保存失败，已有存档未被覆盖。', { cause }))
    }
  })
}
