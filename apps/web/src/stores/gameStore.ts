import { create } from 'zustand'
import { advanceWeek, applyDecision, calculateCompanyResult, calculateProjectResult, initializeGame, resolveEvent as resolveEventCore, startProject } from '../services/gameCore'
import { loadGame, saveGame } from '../services/saveGame'
import { isSeed } from '../types/gameV3'
import type { CompanyResult, Decision, GameState, WeekReport, WorkRecord } from '../types/gameV3'

interface GameStore {
  screen: 'home' | 'studio'
  game: GameState | null
  busy: boolean
  error: string | null
  notice: string | null
  report: WeekReport | null
  result: WorkRecord | null
  companyResult: CompanyResult | null
  saveConflict: boolean
  start: (seed?: number) => Promise<void>
  resume: () => void
  goHome: () => void
  startProject: (offerId: string) => Promise<void>
  decide: (decision: Decision) => Promise<void>
  advance: () => Promise<void>
  resolveEvent: (optionId: string) => Promise<void>
  settle: () => Promise<void>
  settleCompany: () => Promise<void>
  save: (overwrite?: boolean) => Promise<void>
  cancelOverwrite: () => void
  load: () => Promise<void>
}

const messageOf = (error: unknown) => error instanceof Error ? error.message : '操作失败，请重试。'

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

export const useGameStore = create<GameStore>((set, get) => {
  // 所有异步入口共用一把锁；仅在成功后整体采用核心返回的状态。
  const run = async (action: () => Promise<Partial<GameStore>>) => {
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
  const withGame = (action: (state: GameState) => Promise<Partial<GameStore>>) => run(async () => {
    const game = get().game
    return game ? action(game) : {}
  })
  return {
    screen: 'home',
    game: null,
    busy: false,
    error: null,
    notice: null,
    report: null,
    result: null,
    companyResult: null,
    saveConflict: false,
    start: (seed) => run(async () => {
      const { state } = await initializeGame(startingSeed(seed))
      return { game: state, screen: 'studio', report: null, result: null, companyResult: null }
    }),
    resume: () => {
      if (!get().busy && get().game) set({ screen: 'studio', error: null, notice: null, saveConflict: false })
    },
    goHome: () => {
      if (!get().busy) set({ screen: 'home', error: null, notice: null, saveConflict: false })
    },
    startProject: (offerId) => withGame(async (game) => {
      const { state, message } = await startProject(game, offerId)
      return { game: state, notice: message, report: null, result: null, companyResult: null }
    }),
    decide: (decision) => withGame(async (game) => {
      const { state, message } = await applyDecision(game, decision)
      return decision.type === 'return_to_market'
        ? { game: state, notice: message, result: null }
        : { game: state, notice: message }
    }),
    advance: () => withGame(async (game) => {
      const { state, report } = await advanceWeek(game)
      return { game: state, report }
    }),
    resolveEvent: (optionId) => withGame(async (game) => {
      const { state, message } = await resolveEventCore(game, optionId)
      return { game: state, notice: message }
    }),
    settle: () => withGame(async (game) => {
      const { state, result } = await calculateProjectResult(game)
      return { game: state, result }
    }),
    settleCompany: () => withGame(async (game) => {
      const { state, result } = await calculateCompanyResult(game)
      return { game: state, companyResult: result }
    }),
    save: (overwrite) => withGame(async (game) => {
      const outcome = await saveGame(game, overwrite === true)
      return outcome === 'saved'
        ? { notice: '已保存到此浏览器。', saveConflict: false }
        : { notice: '此浏览器已有存档，覆盖后旧存档不可恢复。', saveConflict: true }
    }),
    cancelOverwrite: () => {
      if (!get().busy) set({ notice: null, saveConflict: false })
    },
    load: () => run(async () => {
      const game = await loadGame()
      return game
        ? { game, report: null, result: null, companyResult: null, screen: 'studio', notice: '已读取本地存档。' }
        : { notice: '此浏览器还没有存档。' }
    }),
  }
})
