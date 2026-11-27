import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GameV4Error, initializeGameV4 } from '../services/gameV4'
import { isV4WeekResponse } from './v4Types'
import type { V4GameState, V4WeekReport } from './v4Types'
import { adaptReceipt, adaptV4State, refreshReceipt } from './v4Adapter'
import type { WeeklyReceipt } from './model'

type CommandResult = { state: V4GameState; report?: unknown; message?: string }

export function useV4Game() {
  const [state, setState] = useState<V4GameState | null>(null)
  const [receipts, setReceipts] = useState<WeeklyReceipt[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const lock = useRef(false)
  const started = useRef(false)
  const stateRef = useRef<V4GameState | null>(null)
  const receiptsRef = useRef<WeeklyReceipt[]>([])

  const commit = useCallback((next: V4GameState, report?: V4WeekReport) => {
    let nextReceipts = receiptsRef.current.length > 0 ? [...receiptsRef.current] : [adaptReceipt(next)]
    if (report) nextReceipts = [...nextReceipts.filter((receipt) => receipt.week !== next.company.week), adaptReceipt(next, report)]
    if (!nextReceipts.some((receipt) => receipt.week === next.company.week)) nextReceipts.push(adaptReceipt(next))
    nextReceipts = nextReceipts.map((receipt) => receipt.week === next.company.week ? refreshReceipt(next, receipt) : receipt)
    receiptsRef.current = nextReceipts
    stateRef.current = next
    setReceipts(nextReceipts)
    setState(next)
  }, [])

  const execute = useCallback(async (command: () => Promise<CommandResult>): Promise<boolean> => {
    if (lock.current || stateRef.current === null) return false
    lock.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await command()
      commit(result.state, isV4WeekResponse(result) ? result.report : undefined)
      setNotice(result.message ?? '规则核心已成功提交。')
      return true
    } catch (cause) {
      setError(cause instanceof GameV4Error ? `${cause.code}：${cause.message}` : '规则核心调用失败，当前经营状态未改变。')
      return false
    } finally {
      lock.current = false
      setBusy(false)
    }
  }, [commit])

  useEffect(() => {
    if (started.current) return
    started.current = true
    lock.current = true
    setBusy(true)
    initializeGameV4(20261127).then((result) => {
      commit(result.state)
    }).catch((cause: unknown) => {
      setError(cause instanceof GameV4Error ? `${cause.code}：${cause.message}` : '规则核心加载失败。')
    }).finally(() => {
      lock.current = false
      setBusy(false)
    })
  }, [commit])

  const data = useMemo(() => state ? adaptV4State(state, receipts) : null, [state, receipts])
  return { state, data, receipts, busy, error, notice, execute, clearError: () => setError(null), dismissNotice: () => setNotice(null) }
}
