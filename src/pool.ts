/**
 * 小工具：保序并发池 + 限流退避。两者都是纯逻辑，单独成文件好离线测。
 */

/**
 * 按上限并发跑 fn，结果顺序与 items 一致。
 * 账号级并发用它：实测 5 账号 × 3 请求 串行 0.35s → 3 路 0.14s，5 路无额外收益
 * （每请求本身 25~140ms 抖动，再多并发只是把抖动叠在一起）。
 */
export async function mapPool<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  if (items.length === 0) return out
  let next = 0
  const workers = Math.max(1, Math.min(Math.floor(limit) || 1, items.length))
  await Promise.all(Array.from({ length: workers }, async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= items.length) return
      out[index] = await fn(items[index], index)
    }
  }))
  return out
}

/**
 * 429 之后等多久再试。优先听服务端的 Retry-After（秒），否则 0.4s / 1.2s / 3.6s。
 *
 * 但**不能无条件照做**：本网关限流时给的 Retry-After 实测是 99 秒，照做会把一次面板刷新
 * 挂成一分半。超过 MAX_RETRY_DELAY_MS 就当场放弃，交给下一次轮询（30s 后）重来——
 * 面板显示「限流中」，比转圈两分钟好得多。
 */
export const MAX_RETRY_DELAY_MS = 2_500

export const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

export function retryDelayMs(attempt: number, retryAfterSec?: number): number {
  if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec >= 0) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.round(retryAfterSec * 1000))
  }
  return Math.min(MAX_RETRY_DELAY_MS, 400 * 3 ** Math.max(0, Math.floor(attempt)))
}

/** 这次 429 值不值得当场重试；服务端要求等太久就直接放弃。 */
export function shouldRetryNow(attempt: number, retryAfterSec?: number, maxAttempts = 2): boolean {
  if (attempt >= maxAttempts) return false
  if (retryAfterSec !== undefined && Number.isFinite(retryAfterSec) && retryAfterSec * 1000 > MAX_RETRY_DELAY_MS) {
    return false
  }
  return true
}
