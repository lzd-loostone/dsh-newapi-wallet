/**
 * 只认 New API：GET /api/status 是 New API 账本的公开签名（匿名可访问，不需要任何密钥）。
 * 2xx 且不是拒绝态（success/code 不为 false）即认定是 New API 站点；其余一律 unknown。
 * 不探测任何其它中转站程序，也绝不根据猜测去换算额度。
 * 只缓存认出的结果：一次网络抖动不该让整段会话都判成「不是 New API」。
 */

export interface Fingerprint {
  software: 'newapi' | 'unknown'
  /** unknown 时给出人话原因，供界面解释「为什么这条路由没出现在卡片里」。 */
  reason?: string
}

const PROBE_MS = 8_000
const PROBE_PATH = '/api/status'

const cache = new Map<string, Fingerprint>()

interface ProbeResult {
  /** HTTP 状态；0 = 传输失败。 */
  status: number
  body: Record<string, unknown>
}

async function probe(origin: string): Promise<ProbeResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_MS)
  try {
    const response = await fetch(new URL(PROBE_PATH, origin), {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    })
    const parsed: unknown = await response.json().catch(() => ({}))
    const body = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
    return { status: response.status, body }
  } catch {
    return { status: 0, body: {} }
  } finally {
    clearTimeout(timer)
  }
}

function score({ status, body }: ProbeResult): Fingerprint {
  if (status === 0) return { software: 'unknown', reason: `连不上站点（${PROBE_PATH}）` }
  if (status < 200 || status >= 300) {
    return { software: 'unknown', reason: `站点没有 New API 的 ${PROBE_PATH}（HTTP ${status}）` }
  }
  if (body.success === false || body.code === false) {
    return { software: 'unknown', reason: `站点拒绝了 ${PROBE_PATH}` }
  }
  return { software: 'newapi' }
}

/** 按 origin 探测一次并记住。不带 Authorization。 */
export async function fingerprintOrigin(origin: string): Promise<Fingerprint> {
  const cached = cache.get(origin)
  if (cached !== undefined) return cached
  const result = score(await probe(origin))
  if (result.software === 'newapi') cache.set(origin, result)
  return result
}
