/**
 * 浏览器的账本读取接口。exact 路由在 RPC 信任边界外，因此自己校验回环地址。
 *   GET /api/newapi-wallet?route=&model=&token=  → 账户名单 + 选中路由的账本
 * 响应体只含脱敏提示与账本数字，访问令牌 / sk- 密钥永不进入浏览器。
 *
 * 0.2.2 起本路由**只读**：写令牌移到「插件」页里本插件的配置表单（官方 config form →
 * settings.update），所以 POST、请求体解析与 Origin 校验整条写路径都删掉了。
 * 少一条能写凭据的入口，就少一份攻击面。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { fetchBundle } from './snapshot.ts'
import type { WalletError, WalletResponse } from './shared.ts'

export const WALLET_PATH = '/api/newapi-wallet'
const LOGGER_KEY = 'loostone-newapi-wallet'

function isLoopbackAddress(address: string | undefined): boolean {
  if (typeof address !== 'string' || address === '') return false
  const bare = address.startsWith('::ffff:') ? address.slice(7) : address
  if (bare === '::1' || bare === 'localhost') return true
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(bare)
}

function hostNameOf(header: unknown): string {
  if (typeof header !== 'string' || header === '') return ''
  if (header.startsWith('[')) return header.slice(1, header.indexOf(']'))
  const colon = header.lastIndexOf(':')
  return colon === -1 ? header : header.slice(0, colon)
}

function queryValue(req: IncomingMessage, key: string): string | undefined {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const value = url.searchParams.get(key)
    return value !== null && value !== '' ? value : undefined
  } catch {
    return undefined
  }
}

/** 回环 peer + 回环 Host（防 DNS rebinding）。 */
function screenRequest(req: IncomingMessage): WalletError & { status: number } | undefined {
  const peerOk = isLoopbackAddress(req.socket?.remoteAddress)
  const hostOk = isLoopbackAddress(hostNameOf(req.headers.host))
  if (peerOk && hostOk) return undefined
  return { ok: false, error: 'forbidden', status: 403 }
}

function send(res: ServerResponse, status: number, value: WalletResponse): void {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-cache',
  })
  res.end(JSON.stringify(value))
}

function fail(res: ServerResponse, status: number, error: string, detail?: string): void {
  send(res, status, detail !== undefined ? { ok: false, error, detail } : { ok: false, error })
}

export function registerWalletRoute(ctx: Context): boolean {
  if (typeof ctx.inject !== 'function') return false
  ctx.inject(['webServer'], (scoped) => {
    const webServer = (scoped as Context & { webServer: { register: (route: {
      kind: 'exact'
      path: string
      handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
    }) => () => void } }).webServer
    scoped.effect(() => webServer.register({
      kind: 'exact',
      path: WALLET_PATH,
      handler: async (req, res) => {
        const refused = screenRequest(req)
        if (refused !== undefined) {
          fail(res, refused.status, refused.error)
          return
        }
        if (req.method !== 'GET') {
          fail(res, 405, 'method-not-allowed')
          return
        }
        // 筛选只作用于右侧「今日用量」与「最近调用」；头部实扣与热力图恒为全天口径。
        const model = queryValue(req, 'model')
        const token = queryValue(req, 'token')
        const filter = {
          ...model !== undefined ? { model } : {},
          ...token !== undefined ? { token } : {},
        }
        try {
          send(res, 200, await fetchBundle(ctx, queryValue(req, 'route'), filter))
        } catch (error) {
          ctx.logger?.(LOGGER_KEY)?.warn?.('wallet route failed: %s', error instanceof Error ? error.message : error)
          fail(res, 500, 'internal')
        }
      },
    }), 'loostone-newapi-wallet: http')
  })
  return true
}
