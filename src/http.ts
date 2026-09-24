/**
 * 浏览器的账本接口。exact 路由在 RPC 信任边界外，因此自己校验回环地址。
 *   GET  /api/newapi-wallet            → 账户卡片 + 选中路由的账本
 *   POST /api/newapi-wallet {accessToken, route?} → 写令牌（走官方 settings.update）
 * 响应体只含脱敏提示与账本数字，访问令牌 / sk- 密钥永不进入浏览器。
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { fetchBundle, updateAccessConfig } from './snapshot.ts'
import type { AccessPatch } from './snapshot.ts'
import type { WalletError, WalletResponse } from './shared.ts'

export const WALLET_PATH = '/api/newapi-wallet'
const LOGGER_KEY = 'loostone-newapi-wallet'
/** 令牌长度上限，够用且挡掉把请求体当上传口的用法。 */
const MAX_BODY_BYTES = 8 * 1024

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

function routeQuery(req: IncomingMessage): string | undefined {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    const route = url.searchParams.get('route')
    return route !== null && route !== '' ? route : undefined
  } catch {
    return undefined
  }
}

/** 回环 peer + 回环 Host（防 DNS rebinding）。方法不在这一层判。 */
function screenRequest(req: IncomingMessage): WalletError & { status: number } | undefined {
  const peerOk = isLoopbackAddress(req.socket?.remoteAddress)
  const hostOk = isLoopbackAddress(hostNameOf(req.headers.host))
  if (peerOk && hostOk) return undefined
  return { ok: false, error: 'forbidden', status: 403 }
}

/**
 * 写路径额外要求 Origin 也是本机：同源 fetch 会带 `Origin: http://127.0.0.1:3080`，
 * 非浏览器客户端（curl / harness）不带 Origin 也放行。带外站 Origin 一律拒绝——
 * 这条请求写的是凭据，CORS preflight 之外再加一道。
 */
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  try {
    return isLoopbackAddress(new URL(origin).hostname)
  } catch {
    return false
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY_BYTES) return undefined
    chunks.push(buf)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  } catch {
    return undefined
  }
}

/** `{accessToken}` = 全局默认；`{route, accessToken}` = 只改这条路由。 */
function accessPatchFrom(body: Record<string, unknown>): AccessPatch | undefined {
  const token = body.accessToken
  if (typeof token !== 'string') return undefined
  const route = body.route
  if (route === undefined || route === null || route === '') return { accessToken: token.trim() }
  if (typeof route !== 'string') return undefined
  return { routeAccessTokens: { [route]: token.trim() } }
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
        if (req.method === 'GET') {
          try {
            send(res, 200, await fetchBundle(ctx, routeQuery(req)))
          } catch (error) {
            ctx.logger?.(LOGGER_KEY)?.warn?.('wallet route failed: %s', error instanceof Error ? error.message : error)
            fail(res, 500, 'internal')
          }
          return
        }
        if (req.method !== 'POST') {
          fail(res, 405, 'method-not-allowed')
          return
        }
        // 跨站表单发不出 application/json；浏览器 preflight 会因为没有 CORS 头被挡掉。
        if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
          fail(res, 415, 'unsupported-media-type')
          return
        }
        if (!originAllowed(req)) {
          fail(res, 403, 'forbidden')
          return
        }
        const body = await readJsonBody(req)
        const patch = body === undefined ? undefined : accessPatchFrom(body)
        if (patch === undefined) {
          fail(res, 400, 'bad-request')
          return
        }
        const failure = await updateAccessConfig(ctx, patch)
        if (failure !== undefined) {
          fail(res, failure.error === 'no-settings' ? 503 : 500, failure.error, failure.detail)
          return
        }
        send(res, 200, { ok: true })
      },
    }), 'loostone-newapi-wallet: http')
  })
  return true
}
