/**
 * 全进程共享的网关并发闸门。
 *
 * 为什么需要它：账本冷启动要翻几十页（单页并发 12），账号级又要 3 路并发，
 * 两者相乘就是 36 个在飞请求——自建网关会开始 429，重试的退避睡眠把「首次安装」
 * 拖到一分半以上（实测 101s，其中真正在请求的只有 16s）。
 *
 * 所以所有出站请求都过这一道闸：默认 8 个在飞，冷启动时自然被压平。
 * 环境变量 DSH_NEWAPI_WALLET_CONCURRENCY 可覆盖（排查用）。
 */
export type Limit = <T>(fn: () => Promise<T>) => Promise<T>

export function createLimiter(limit: number): Limit {
  const max = Math.max(1, Math.floor(limit) || 1)
  let active = 0
  const queue: Array<() => void> = []
  const pump = (): void => {
    if (active >= max) return
    const start = queue.shift()
    if (start === undefined) return
    active += 1
    start()
  }
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < max && queue.length === 0) {
      active += 1
    } else {
      await new Promise<void>((resolve) => { queue.push(resolve) })
    }
    try {
      return await fn()
    } finally {
      active -= 1
      pump()
    }
  }
}

const configured = Number(process.env.DSH_NEWAPI_WALLET_CONCURRENCY)
export const gatewayLimit: Limit = createLimiter(Number.isFinite(configured) && configured > 0 ? configured : 8)
