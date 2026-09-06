/**
 * @loostone/dsh-newapi-wallet Host 端。
 *
 * 读取公司自建 New API 网关（New API 程序）的站点账本：余额、今日实扣（人民币）、
 * 按模型拆分、逐条明细；可按路由切换。不改会话、不碰请求热路径。
 *
 * 认证：用户级路由需要「New API 访问令牌」（与 sk- 模型密钥是两把不同的凭据）。
 * 令牌放在 settings 服务的 `newapi-wallet` 名字里（accessToken / routeAccessTokens /
 * refreshMs），在设置页填；sk- 密钥永远不会被本插件发往用户级路由。
 */
import type { Context } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { registerWalletRoute } from './http.ts'
import { setAccessConfigSource } from './snapshot.ts'

export const name = 'loostone-newapi-wallet'

const LOGGER_KEY = 'loostone-newapi-wallet'

export interface Config {
  /** 浏览器轮询间隔提示（实际刷新由 client 控制）。 */
  refreshMs?: number
}

/**
 * 设置 schema。必须是 @deepseek-ai/schemastery 的可调用 schema
 * （settings.register 以 schema(value) 求值、schema.toJSON() 导出，
 * 传普通 JSON 对象会 TypeError: not a function）。
 * 注意：schemastery 会把未知键透传，读取方只取下面三个字段，绝不整体展开。
 */
export const walletSettingsSchema = Schema.object({
  /** New API 访问令牌（用户中心 → 生成的访问令牌，非 sk- 模型密钥）。 */
  accessToken: Schema.string().default(''),
  /** 可选：按路由覆盖令牌，键为 DSH 路由名。 */
  routeAccessTokens: Schema.dict(Schema.string()).default({}),
  /** 浏览器轮询间隔（毫秒）。 */
  refreshMs: Schema.natural().default(60_000),
})

/**
 * 注册设置命名空间并接到快照模块的运行时读取。
 *
 * 必须用 ctx.inject(['settings'], …) 而不是 ctx.get('settings')：settings 服务可能比我们晚组合，
 * apply() 那一刻 ctx.get 恒为 undefined，于是命名空间永不注册 → 宿主 describe() 里没我们 →
 * 设置页的插件卡片永不被分发（宿主那边不过滤，注册了就会被服务）。
 * 写法对齐同环境已跑通的 dsh-context：「Serve the namespace while a settings provider is
 * composed; inert otherwise.」失败要出声，不许静默吞掉；注册不成则退回 row config 的 accessToken。
 */
type SettingsLike = {
  register?: (ns: string, schema: unknown, options?: { base?: unknown; applies?: 'live' }) => {
    get: () => unknown
  }
}

function registerAccessSettings(ctx: Context, config: Config): void {
  const wire = (settings: SettingsLike | undefined): void => {
    if (settings?.register === undefined) {
      ctx.logger?.(LOGGER_KEY)?.warn?.(
        'settings service unavailable; accessToken falls back to row config (refreshMs=%s)',
        config.refreshMs ?? '(default)',
      )
      return
    }
    try {
      // 每个 fiber 只注册一次；重复注册会抛 "settings namespace ... is already registered"。
      const scope = settings.register('newapi-wallet', walletSettingsSchema, {
        base: { accessToken: '', routeAccessTokens: {}, ...(config.refreshMs !== undefined ? { refreshMs: config.refreshMs } : {}) },
        applies: 'live',
      })
      // 请求时读取（scope.get()），设置改动即时生效，无需重启 DSH。
      setAccessConfigSource({
        get: () => {
          const value = scope.get()
          if (value === undefined || value === null || typeof value !== 'object') return undefined
          const section = value as { accessToken?: unknown; routeAccessTokens?: unknown; refreshMs?: unknown }
          return {
            ...(typeof section.accessToken === 'string' ? { accessToken: section.accessToken } : {}),
            ...(section.routeAccessTokens !== undefined && section.routeAccessTokens !== null && typeof section.routeAccessTokens === 'object'
              ? { routeAccessTokens: section.routeAccessTokens as Record<string, string> }
              : {}),
            ...(typeof section.refreshMs === 'number' && Number.isFinite(section.refreshMs) ? { refreshMs: section.refreshMs } : {}),
          }
        },
      })
      ctx.logger?.(LOGGER_KEY)?.info?.('settings namespace newapi-wallet registered')
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      ctx.logger?.(LOGGER_KEY)?.warn?.('settings.register failed: %s', message)
    }
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (scoped) => {
      wire((scoped as unknown as { settings?: SettingsLike }).settings)
    })
    return
  }
  // 兜底：没有 inject 的环境（例如离线假上下文）退化为一次性读取。
  wire(ctx.get('settings') as SettingsLike | undefined)
}

export function apply(ctx: Context, config: Config = {}): void {
  const logger = ctx.logger?.(LOGGER_KEY) ?? ctx.logger
  try {
    registerAccessSettings(ctx, config)
    const served = registerWalletRoute(ctx)
    if (served) logger?.info?.('serving /api/newapi-wallet')
    else logger?.info?.('no web server; wallet overlay will not be served')
  } catch (error) {
    logger?.warn?.('could not register wallet route: %s', error instanceof Error ? error.message : error)
  }
}
