import { create } from 'zustand'
import { callV4Core, initializeGameV4, type V4CoreMethod } from '../services/gameCoreV4'
import { loadGameV4, saveGameV4, V4_RULES_VERSION } from '../services/saveGameV4'
import { isV4WeekReport, type V4GameState, type V4WeekReport } from '../types/gameV4State'

type StateCommand = Exclude<V4CoreMethod, 'initialize_game' | 'hash_state'>

interface GameStoreV4 {
  game: V4GameState | null
  lastReport: V4WeekReport | null
  busy: boolean
  error: string | null
  notice: string | null
  rulesWarning: boolean
  saveConflict: boolean
  start: (seed?: number) => Promise<void>
  load: () => Promise<void>
  save: (overwrite?: boolean) => Promise<void>
  cancelOverwrite: () => void
  command: (method: StateCommand, input?: Record<string, unknown>) => Promise<boolean>
  clearMessage: () => void
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。'
const isSeed = (value: number): boolean => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff

function startingSeed(explicit?: number): number {
  if (explicit !== undefined) {
    if (!isSeed(explicit)) throw new Error('种子必须是 0–4294967295 的整数。')
    return explicit
  }
  const values = new URLSearchParams(window.location.search).getAll('seed')
  if (values.length > 0) {
    const value = values[0]
    if (values.length !== 1 || !/^\d+$/.test(value) || !isSeed(Number(value))) {
      throw new Error('URL seed 无效，请使用 0–4294967295 的整数。')
    }
    return Number(value)
  }
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

export const useGameStoreV4 = create<GameStoreV4>((set, get) => {
  const run = async (action: () => Promise<Partial<GameStoreV4>>) => {
    if (get().busy) return
    set({ busy: true, error: null, notice: null, saveConflict: false })
    try {
      set(await action())
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ busy: false })
    }
  }

  return {
    game: null,
    lastReport: null,
    busy: false,
    error: null,
    notice: null,
    rulesWarning: false,
    saveConflict: false,
    start: (seed) => run(async () => {
      const { state } = await initializeGameV4(startingSeed(seed))
      return { game: state, lastReport: null, rulesWarning: false }
    }),
    load: () => run(async () => {
      const loaded = await loadGameV4()
      return loaded
        ? {
            game: loaded.state,
            lastReport: null,
            rulesWarning: loaded.rulesVersion !== V4_RULES_VERSION,
            notice: loaded.rulesVersion === V4_RULES_VERSION ? '已读取本地存档。' : '规则已更新，数值可能与存档时不同。',
          }
        : { notice: '此浏览器还没有 v4 存档。' }
    }),
    save: (overwrite) => {
      const game = get().game
      if (!game) return Promise.resolve()
      return run(async () => {
        const outcome = await saveGameV4(game, overwrite === true)
        return outcome === 'saved'
          ? { notice: '已保存到此浏览器。', saveConflict: false }
          : { notice: '此浏览器已有存档，覆盖后旧存档不可恢复。', saveConflict: true }
      })
    },
    cancelOverwrite: () => {
      if (!get().busy) set({ notice: null, saveConflict: false })
    },
    command: (method, input = {}) => {
      const game = get().game
      if (!game) return Promise.resolve(false)
      return run(async () => {
        const response = await callV4Core(method, { ...input, state: game })
        if (method === 'advance_week' && !isV4WeekReport(response.report)) {
          throw new Error('周结算回执格式无效，当前经营数据未改变。')
        }
        return {
          game: response.state,
          ...(method === 'advance_week' ? { lastReport: response.report as V4WeekReport } : {}),
          notice: typeof response.message === 'string' ? response.message : null,
        }
      }).then(() => get().error === null)
    },
    clearMessage: () => {
      if (!get().busy) set({ error: null, notice: null, saveConflict: false })
    },
  }
})
