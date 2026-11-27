import {
  isV4CommandErrorResponse,
  isV4CommandResponse,
  type V4CommandResponse,
  type V4GameState,
} from '../types/gameV4State'

export const V4_CORE_METHODS = [
  'initialize_game',
  'start_work',
  'set_work_plan',
  'assign_staff',
  'hire_core',
  'hire_temporary',
  'sign_outsourcing',
  'scout',
  'dismiss_staff',
  'deliver_work',
  'abort_work',
  'buy_tv_service',
  'request_extension',
  'advance_week',
  'end_company',
  'finalize_delivery',
  'finalize_company',
  'resolve_event',
  'view_event',
  'lock_offer',
  'hash_state',
] as const

export type V4CoreMethod = typeof V4_CORE_METHODS[number]
export type V4CoreModule = Record<V4CoreMethod, (input: string) => string>
export type V4ServiceErrorCode = 'LOAD_FAILED' | 'CALL_FAILED' | 'INVALID_RESPONSE' | 'CORE_ERROR'

export class V4GameCoreError extends Error {
  constructor(public readonly code: V4ServiceErrorCode | string, message: string, public readonly coreCode?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'V4GameCoreError'
  }
}

let modulePromise: Promise<V4CoreModule> | undefined
let loadAttempt = 0

export function loadGameCoreV4(): Promise<V4CoreModule> {
  if (!modulePromise) {
    const base = `${import.meta.env.BASE_URL}wasm/`
    const url = new URL(`${base}v4.mjs`, window.location.href)
    if (loadAttempt > 0) url.searchParams.set('retry', String(loadAttempt))
    const moduleUrl = url.href
    modulePromise = (async () => {
      try {
        const { default: createGameCore } = await import(/* @vite-ignore */ moduleUrl)
        const module: V4CoreModule = await createGameCore({
          locateFile: (file: string) => new URL(file, moduleUrl).href,
        })
        for (const method of V4_CORE_METHODS) {
          if (typeof module?.[method] !== 'function') throw new Error(`WASM 缺少 ${method} 导出`)
        }
        return module
      } catch (cause) {
        throw new V4GameCoreError('LOAD_FAILED', '游戏核心加载失败，请确认浏览器版 WASM 已编译并可访问，然后重试。', undefined, { cause })
      }
    })().catch((error: unknown) => {
      loadAttempt += 1
      modulePromise = undefined
      throw error
    })
  }
  return modulePromise
}

export async function callV4Core(method: V4CoreMethod, input: unknown): Promise<V4CommandResponse> {
  const module = await loadGameCoreV4()
  let raw: string
  try {
    raw = module[method](JSON.stringify(input))
  } catch (cause) {
    throw new V4GameCoreError('CALL_FAILED', 'C++ 核心调用异常，当前经营数据未改变。', undefined, { cause })
  }

  let response: unknown
  try {
    if (typeof raw !== 'string') throw new Error('核心响应不是 JSON 字符串')
    response = JSON.parse(raw)
  } catch (cause) {
    throw new V4GameCoreError('INVALID_RESPONSE', 'C++ 返回了无效 JSON。', undefined, { cause })
  }

  if (isV4CommandErrorResponse(response)) {
    throw new V4GameCoreError('CORE_ERROR', response.error.message, response.error.code)
  }
  if (!isV4CommandResponse(response)) {
    throw new V4GameCoreError('INVALID_RESPONSE', 'C++ 返回的经营数据不符合 v4 契约。')
  }
  return response
}

export function initializeGameV4(seed: number): Promise<V4CommandResponse> {
  return callV4Core('initialize_game', { seed })
}

export function validateV4State(state: unknown): state is V4GameState {
  return isV4CommandResponse({ state })
}
