import { isV4State, isV4WeekResponse, V4_METHODS } from '../prototype/v4Types'
import type { V4GameState, V4Method, V4StateResponse, V4WeekResponse, V4WorkActionResponse } from '../prototype/v4Types'

export type V4Module = Record<V4Method, (input: string) => string> & { hash_state: (input: string) => string }
export type V4ServiceErrorCode = 'LOAD_FAILED' | 'CALL_FAILED' | 'INVALID_RESPONSE' | 'INVALID_STATE' | 'INVALID_INPUT' | 'NOT_FOUND' | 'INVALID_PHASE' | 'INSUFFICIENT_FUNDS' | 'CAPACITY_EXCEEDED' | 'COMPANY_ENDED' | 'MODE_NOT_ALLOWED' | 'GATE_UNMET' | 'NOT_IMPLEMENTED' | 'INTERNAL_ERROR'

export class GameV4Error extends Error {
  constructor(public readonly code: V4ServiceErrorCode, message: string, options?: ErrorOptions) {
    super(message, { cause: options?.cause })
    this.name = 'GameV4Error'
  }
}

let modulePromise: Promise<V4Module> | undefined

export function loadGameV4(): Promise<V4Module> {
  if (!modulePromise) {
    modulePromise = (async () => {
      try {
        const url = new URL(`${import.meta.env.BASE_URL}wasm/v4.mjs`, window.location.href)
        const { default: createGameCoreV4 } = await import(/* @vite-ignore */ url.href)
        const module: V4Module = await createGameCoreV4({ locateFile: (file: string) => new URL(file, url).href })
        for (const method of [...V4_METHODS, 'hash_state'] as const) {
          if (typeof module?.[method] !== 'function') throw new Error(`缺少 ${method} 导出`)
        }
        return module
      } catch (cause) {
        throw new GameV4Error('LOAD_FAILED', 'v4 规则核心加载失败，请确认 WASM 已编译并可访问。', { cause })
      }
    })().catch((error: unknown) => {
      modulePromise = undefined
      throw error
    })
  }
  return modulePromise
}

async function call(method: V4Method | 'hash_state', input: unknown): Promise<Record<string, unknown>> {
  const module = await loadGameV4()
  let raw: string
  try {
    raw = module[method](JSON.stringify(input))
  } catch (cause) {
    throw new GameV4Error('CALL_FAILED', '规则核心调用异常，当前经营状态未改变。', { cause })
  }
  let result: unknown
  try {
    result = JSON.parse(raw)
  } catch (cause) {
    throw new GameV4Error('INVALID_RESPONSE', '规则核心返回了无效 JSON。', { cause })
  }
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new GameV4Error('INVALID_RESPONSE', '规则核心返回的数据结构无效。')
  }
  const response = result as Record<string, unknown>
  if ('error' in response) {
    const error = response.error
    if (typeof error !== 'object' || error === null || !('code' in error) || typeof error.code !== 'string' || !('message' in error) || typeof error.message !== 'string') {
      throw new GameV4Error('INVALID_RESPONSE', '规则核心返回的错误结构无效。')
    }
    const allowed: V4ServiceErrorCode[] = ['INVALID_STATE', 'INVALID_INPUT', 'NOT_FOUND', 'INVALID_PHASE', 'INSUFFICIENT_FUNDS', 'CAPACITY_EXCEEDED', 'COMPANY_ENDED', 'MODE_NOT_ALLOWED', 'GATE_UNMET', 'NOT_IMPLEMENTED', 'INTERNAL_ERROR']
    if (!allowed.includes(error.code as V4ServiceErrorCode)) throw new GameV4Error('INVALID_RESPONSE', '规则核心返回了未知错误码。')
    throw new GameV4Error(error.code as V4ServiceErrorCode, error.message)
  }
  return response
}

async function stateResponse(method: V4Method, input: unknown): Promise<V4StateResponse> {
  const response = await call(method, input)
  if (!isV4State(response.state)) throw new GameV4Error('INVALID_RESPONSE', '规则核心返回了无效 v4 状态。')
  return response as unknown as V4StateResponse
}

export function initializeGameV4(seed: number): Promise<V4StateResponse> {
  return stateResponse('initialize_game', { seed })
}

export function startWorkV4(state: V4GameState, offerId: string, mode: 'contract' | 'committee', percent = 0, committeePartnerIds: string[] = []): Promise<V4WorkActionResponse> {
  return stateResponse('start_work', { state, offer_id: offerId, mode, ...(mode === 'committee' ? { percent, committee_partner_ids: committeePartnerIds } : {}) })
}

export function lockOfferV4(state: V4GameState, offerId: string): Promise<V4StateResponse & { offer_id?: string; deposit_paid?: number }> {
  return stateResponse('lock_offer', { state, offer_id: offerId })
}

export function assignStaffV4(state: V4GameState, staffId: string, workId: string | null): Promise<V4StateResponse> {
  return stateResponse('assign_staff', { state, staff_id: staffId, work_id: workId })
}

export function setWorkPlanV4(state: V4GameState, workId: string, plan: Record<string, unknown>): Promise<V4StateResponse> {
  return stateResponse('set_work_plan', { state, work_id: workId, plan })
}

export async function advanceWeekV4(state: V4GameState): Promise<V4WeekResponse> {
  const response = await call('advance_week', { state })
  if (!isV4WeekResponse(response)) throw new GameV4Error('INVALID_RESPONSE', '规则核心返回了无效周报或状态。')
  return response as unknown as V4WeekResponse
}

export function viewEventV4(state: V4GameState, workId: string, eventId: string): Promise<V4StateResponse> {
  return stateResponse('view_event', { state, work_id: workId, event_id: eventId })
}

export function resolveEventV4(state: V4GameState, workId: string, eventId: string, optionId: string): Promise<V4StateResponse & { message?: string }> {
  return stateResponse('resolve_event', { state, work_id: workId, event_id: eventId, option_id: optionId })
}

export function createCustomOfferV4(state: V4GameState, name: string, source: 'manga' | 'light_novel' | 'game' | 'original', scale: 'ova' | 'short' | 'tv' | 'movie', style: 'normal' | 'meme' | 'ai'): Promise<V4StateResponse> {
  return stateResponse('create_custom_offer', { state, name, source, scale, style })
}

export function proposalActionV4(method: 'adopt_proposal' | 'reject_proposal', state: V4GameState): Promise<V4StateResponse> {
  return stateResponse(method, { state })
}

export async function workActionV4(method: 'deliver_work' | 'abort_work' | 'buy_tv_service' | 'request_extension' | 'end_company' | 'finalize_delivery' | 'finalize_company', state: V4GameState, workId?: string): Promise<V4WorkActionResponse> {
  const result = await stateResponse(method, { state, ...(workId === undefined ? {} : { work_id: workId }) }) as V4WorkActionResponse
  if (method === 'deliver_work' || method === 'abort_work') {
    const report = result.report ?? {}
    const work = result.state.archive.works.find((item) => item.id === report.work_id) ?? result.state.works.find((item) => item.id === report.work_id)
    const title = work ? ('offer' in work ? work.offer.name : work.name) : report.work_id ?? '作品'
    const rating = typeof report.rating === 'string' ? `评级 ${report.rating}` : '未评级'
    const revenue = typeof report.commercial_revenue === 'number' ? `商业收入 ¥${report.commercial_revenue.toLocaleString('zh-CN')}` : '无商业收入'
    const net = typeof report.net_received === 'number' ? `净到账 ¥${report.net_received.toLocaleString('zh-CN')}` : '净到账以核心流水为准'
    result.message = method === 'abort_work'
      ? `${title} 已由核心中止结算：${rating}，${net}。`
      : `${title} 已由核心交付并写入 Archive：${rating}，${revenue}，${net}。可在发行与市场 → 查看公司作品墙复核。`
  }
  return result
}

export async function hashStateV4(state: V4GameState): Promise<string> {
  const response = await call('hash_state', { state })
  if (typeof response.hash !== 'string') throw new GameV4Error('INVALID_RESPONSE', '规则核心返回了无效状态哈希。')
  return response.hash
}
