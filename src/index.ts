/**
 * @loostone/dsh-newapi-wallet Host 端。
 *
 * 读取公司自建 New API 网关（New API 程序）的站点账本：余额、今日实扣（人民币）、
 * 按模型拆分、逐条明细；可按路由切换。不改会话、不碰请求热路径。
 *
 * 认证：用户级路由需要「New API 访问令牌」（与 sk- 模型密钥是两把不同的凭据）。
 * 令牌存在本插件自己的 Config 里（accessToken / routeAccessTokens / refreshMs），
 * 由侧边栏账本面板的「配置令牌」弹窗经 POST /api/newapi-wallet 写入
 * （走官方 settings.update，落 profile 的 cordis.patch.yml，volatile 引用即时生效）；
 * sk- 密钥永远不会被本插件发往用户级路由。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { registerWalletRoute } from './http.ts'
import { setAccessConfigSource } from './snapshot.ts'

export const name = 'loostone-newapi-wallet'

const LOGGER_KEY = 'loostone-newapi-wallet'

/**
 * 插件 Config 就是设置页表单：0.1.7 起 settings 服务不再有 register/get 命名空间，
 * 而是把每个插件导出的 Config schema 投影成表单（settings.describe()），只投影
 * 标了 .volatile() 的字段——所以这三个字段都要 volatile，读值时用 .get() 取快照。
 * 注意：schemastery 会把未知键透传，读取方只取下面三个字段，绝不整体展开。
 */
export const Config = Schema.object({
  /** New API 访问令牌（用户中心 → 生成的访问令牌，非 sk- 模型密钥）。 */
  accessToken: Schema.string().role('secret').default('').volatile(),
  /** 可选：按路由覆盖令牌，键为 DSH 路由名。 */
  routeAccessTokens: Schema.dict(Schema.string()).default({}).volatile(),
  /** 浏览器轮询间隔（毫秒）。 */
  refreshMs: Schema.natural().default(60_000).volatile(),
})

/** apply() 收到的 config：volatile 字段是 Volatile 引用，离线 harness 里是普通值。 */
type AccessConfigInput = {
  accessToken?: unknown
  routeAccessTokens?: unknown
  refreshMs?: unknown
}

/** volatile 字段读快照要 .get()；普通值原样返回。 */
function unwrapVolatile(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  const get = (value as { get?: unknown }).get
  return typeof get === 'function' ? (get as () => unknown).call(value) : value
}

/**
 * 接到快照模块的运行时读取：每次请求现取 config，设置页改动即时生效，无需重启 DSH。
 * 注册不成时静默退回空令牌——客户端会给出 no-access-token 文案，不吞错。
 */
function wireAccessConfig(config: AccessConfigInput): void {
  setAccessConfigSource({
    get: () => {
      const accessToken = unwrapVolatile(config.accessToken)
      const routeAccessTokens = unwrapVolatile(config.routeAccessTokens)
      const refreshMs = unwrapVolatile(config.refreshMs)
      return {
        ...(typeof accessToken === 'string' ? { accessToken } : {}),
        ...(routeAccessTokens !== null && typeof routeAccessTokens === 'object'
          ? { routeAccessTokens: routeAccessTokens as Record<string, string> }
          : {}),
        ...(typeof refreshMs === 'number' && Number.isFinite(refreshMs) ? { refreshMs } : {}),
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
