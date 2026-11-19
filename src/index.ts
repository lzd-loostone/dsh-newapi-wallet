/**
 * @loostone/dsh-newapi-wallet Host 端。
 *
 * 读取公司自建 New API 网关（New API 程序）的站点账本：余额、今日实扣（人民币）、
 * 按模型拆分、逐条明细；可按路由切换。不改会话、不碰请求热路径。
 *
 * 认证：用户级路由需要「New API 访问令牌」（与 sk- 模型密钥是两把不同的凭据）。
 * 令牌存在本插件自己的 Config 里（accessToken / refreshMs），由「插件」页里本插件的
 * 配置表单写入（走官方 config form，落 profile 的 cordis.patch.yml，volatile 引用即时生效）；
 * sk- 密钥永远不会被本插件发往用户级路由。
 *
 * 0.2.2 起令牌是**全站唯一**的：原来支持按 DSH 路由分别覆盖（routeAccessTokens），
 * 但一个 DSH 通常只连一个 New API 网关，那份 map 永远命不中，纯属负担，已删除。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { registerWalletRoute } from './http.ts'
import { setAccessConfigSource } from './snapshot.ts'

// 账号解析与指纹：纯函数，导出给离线单测（test/unit.mjs）。
export { accountKeyForToken, parseAccounts } from './accounts.ts'
export type { WalletAccount } from './accounts.ts'
export { modelsFromHours, resolveLowBalanceCny, setAccessConfigSource } from './snapshot.ts'
export { defaultStoreDir, openStore, shiftDay, UNITS_TTL_MS } from './store.ts'
export type { CacheStore, StoredDay, StoredHistoryDay, StoredUnits } from './store.ts'
export { mapPool, MAX_RETRY_DELAY_MS, retryDelayMs, shouldRetryNow } from './pool.ts'
export { createLimiter, gatewayLimit } from './limit.ts'
export { mergeMoney, mergeSnapshots } from './merge.ts'
export type { AccountPart } from './merge.ts'
export { cacheKeyForTest } from './ledger.ts'

export const name = 'loostone-newapi-wallet'

const LOGGER_KEY = 'loostone-newapi-wallet'

/**
 * 插件 Config 就是「插件」页配置表单的字段来源：settings 服务把每个插件导出的
 * Config schema 投影成表单（settings.describe()），只投影标了 .volatile() 的字段——
 * 所以下面两个字段都要 volatile，读值时用 .get() 取快照。
 * 注意：schemastery 会把未知键透传，读取方只取这两个字段，绝不整体展开。
 */
export const Config = Schema.object({
  /**
   * 多账号：稳定键 → { 名字, 令牌 }。键（如 a1）是写入路径与账本缓存键的一部分，
   * 名字是用户随时可改的显示名——改名只写 name 子路径，令牌不动。
   * 令牌标 secret，宿主的 redactSecrets 按路径逐个摘掉，浏览器只能看到键与名字。
   */
  accounts: Schema.dict(Schema.object({
    name: Schema.string().default(''),
    token: Schema.string().role('secret').default(''),
  })).default({}).volatile(),
  /** 旧版单令牌。保留一版用于迁移：accounts 为空时视为「默认账号」。 */
  accessToken: Schema.string().role('secret').default('').volatile(),
  /** 余额偏低阈值（人民币）。任一账号低于它，侧栏红点亮。 */
  lowBalanceCny: Schema.number().default(5).min(0).volatile(),
  /** 浏览器轮询间隔（毫秒）。 */
  refreshMs: Schema.natural().default(60_000).volatile(),
})

/** apply() 收到的 config：volatile 字段是 Volatile 引用，离线 harness 里是普通值。 */
type AccessConfigInput = {
  accounts?: unknown
  accessToken?: unknown
  refreshMs?: unknown
  lowBalanceCny?: unknown
}

/** volatile 字段读快照要 .get()；普通值原样返回。 */
function unwrapVolatile(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const get = (value as { get?: unknown }).get
  return typeof get === 'function' ? (get as () => unknown).call(value) : value
}

/**
 * 接到快照模块的运行时读取：每次请求现取 config，配置改动即时生效，无需重启 DSH。
 * 注册不成时静默退回空令牌——客户端会给出 no-access-token 文案，不吞错。
 */
function wireAccessConfig(config: AccessConfigInput): void {
  setAccessConfigSource({
    get: () => {
      const accounts = unwrapVolatile(config.accounts)
      const accessToken = unwrapVolatile(config.accessToken)
      const refreshMs = unwrapVolatile(config.refreshMs)
      const lowBalanceCny = unwrapVolatile(config.lowBalanceCny)
      return {
        ...(accounts !== undefined && accounts !== null && typeof accounts === 'object' ? { accounts } : {}),
        ...(typeof accessToken === 'string' ? { accessToken } : {}),
        ...(typeof refreshMs === 'number' && Number.isFinite(refreshMs) ? { refreshMs } : {}),
        ...(typeof lowBalanceCny === 'number' && Number.isFinite(lowBalanceCny) ? { lowBalanceCny } : {}),
      }
    },
  })
}

export function apply(ctx: Context, config: AccessConfigInput = {}): void {
  const logger = ctx.logger?.(LOGGER_KEY) ?? ctx.logger
  try {
    wireAccessConfig(config)
    const served = registerWalletRoute(ctx)
    if (served) logger?.info?.('serving /api/newapi-wallet')
    else logger?.info?.('no web server; wallet overlay will not be served')
  } catch (error) {
    logger?.warn?.('could not register wallet route: %s', error instanceof Error ? error.message : error)
  }
}