/**
 * 从当前路由对应站点拉真实余额 / 今日消费 / 逐条明细。
 * 认证模型（本公司 New API 网关，实测）：
 *   - /api/user/self、/api/log/self*、/api/data/self 需要「New API 访问令牌」
 *     （设置页填的 access token），Bearer 形式；
 *   - sk- 模型密钥（LLM 路由配置里那把）对这些用户级路由一律 401，
 *     绝不允许发往 /api/data/self、/api/user/self、/api/log/self*；
 *   - /api/status、/api/pricing 匿名可访问。
 * 金额只来自网关账本，不做任何本地 token 估价。
 *
 * 计费公式（用真实账单核对到 0.15 元误差，勿删）：
 *   quota = (未缓存输入 + cache_tokens×cache_ratio + 输出×completion_ratio)
 *           × model_ratio × group_ratio
 * 本站点约 98% 的输入 token 是缓存命中，任何「tokens×价格」的本地估算会把
 * 成本高估约 6 倍 —— 所以金额永远以服务端算好的 quota 为准。
 */
import type { Context } from '@deepseek-ai/cordis'
import { fingerprintOrigin } from './fingerprint.ts'
import type {
  AccountListItem,
  CallRecord,
  Money,
  TodayModelRow,
  TokenBuckets,
  WalletBundle,
  WalletError,
  WalletSnapshot,
} from './shared.ts'

const TIMEOUT_MS = 15_000
const LOG_PAGE_SIZE = 100
const RECENT_MAX = 30
const DEEPSEEK_ORIGIN = 'https://api.deepseek.com'
const DEEPSEEK_KEY_ENV = 'DEEPSEEK_API_KEY'
/** /api/status 读不到汇率时的兜底币种：公司网关即 CNY 展示。 */
const FALLBACK_CURRENCY = 'CNY'

/** 用户级（查账）路由。sk- 模型密钥绝不发往这些路径。 */
export const USER_SCOPED_PATHS = new Set(['/api/user/self', '/api/log/self', '/api/log/self/stat', '/api/data/self'])

export interface RouteAccount {
  route: string
  displayName: string
  origin: string
  apiKeyEnv?: string
  model?: string
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function originOf(baseUrl: unknown): string | undefined {
  if (typeof baseUrl !== 'string' || baseUrl === '') return undefined
  try {
    return new URL(baseUrl).origin
  } catch {
    return undefined
  }
}

function isOfficialDeepSeekOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname.toLowerCase() === 'api.deepseek.com'
  } catch {
    return false
  }
}

function isOfficialDeepSeekProvider(provider: string): boolean {
  return provider === 'deepseek-official' || provider === 'deepseek'
}

function readAt(section: unknown, path: readonly string[]): unknown {
  let cursor: unknown = section
  for (const key of path) {
    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[key]
  }
  return cursor
}

function maskKey(apiKey: string): string {
  const last4 = apiKey.slice(-4)
  if (apiKey.startsWith('sk-')) return `sk-••••${last4}`
  return `••••${last4}`
}

function localDayStartMs(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** /api/status 公布的换算单位（运行时读取，绝不硬编码）。 */
interface QuotaUnits {
  quotaPerUnit: number
  usdExchangeRate?: number
  displayCurrency?: string
}

/**
 * quota 点数 → Money。
 * display = quota / quota_per_unit × usd_exchange_rate（CNY 展示站点）。
 * usd 字段只在站点真的公布非 1 汇率时才给；本 fork 界面永不打印 "$"。
 */
function quotaToMoney(quota: number | undefined, units: QuotaUnits): Money | undefined {
  if (quota === undefined) return undefined
  const usd = units.quotaPerUnit > 0 ? round6(quota / units.quotaPerUnit) : undefined
  const rate = units.usdExchangeRate ?? 1
  const display = usd !== undefined ? round6(usd * rate) : undefined
  const currency = units.displayCurrency === 'USD' ? 'CNY' : units.displayCurrency ?? FALLBACK_CURRENCY
  const out: Money = { quota }
  if (display !== undefined) out.display = display
  out.currency = currency
  // 仅当站点真的给出非 1 汇率才暴露 usd，避免界面出现美元语义。
  if (usd !== undefined && rate !== 1) out.usd = usd
  return out
}

function epochMs(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return undefined
  return value > 1e12 ? value : value * 1000
}

async function getJson(
  origin: string,
  path: string,
  apiKey: string | undefined,
  params: Record<string, string | number> = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(path, origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (apiKey !== undefined && apiKey !== '') headers.authorization = `Bearer ${apiKey}`
    const response = await fetch(url, { headers, signal: controller.signal })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    return { status: response.status, body }
  } finally {
    clearTimeout(timer)
  }
}

function isNewApiOk(status: number, body: Record<string, unknown>): boolean {
  if (status < 200 || status >= 300) return false
  if (body.success === false || body.code === false) return false
  return true
}

async function readUnits(origin: string): Promise<QuotaUnits> {
  try {
    const { status, body } = await getJson(origin, '/api/status', undefined)
    const data = (body.data ?? body) as Record<string, unknown>
    if (!isNewApiOk(status, body)) return { quotaPerUnit: 500_000, displayCurrency: FALLBACK_CURRENCY }
    const quotaPerUnit = num(data.quota_per_unit) ?? 500_000
    const usdExchangeRate = num(data.usd_exchange_rate) ?? num(data.custom_currency_exchange_rate) ?? 1
    const displayType = typeof data.quota_display_type === 'string' ? data.quota_display_type : undefined
    const displayCurrency = displayType === 'CNY' || displayType === 'USD'
      ? displayType
      : FALLBACK_CURRENCY
    return {
      quotaPerUnit: quotaPerUnit > 0 ? quotaPerUnit : 500_000,
      usdExchangeRate: usdExchangeRate > 0 ? usdExchangeRate : 1,
      displayCurrency,
    }
  } catch {
    return { quotaPerUnit: 500_000, displayCurrency: FALLBACK_CURRENCY }
  }
}

function hostLabel(origin: string): string {
  try {
    const url = new URL(origin)
    return url.port === '' ? url.hostname : `${url.hostname}:${url.port}`
  } catch {
    return origin
  }
}

/* ------------------------------------------------------------------ */
/* 路由清单与凭据解析                                                    */
/* ------------------------------------------------------------------ */

export function listRouteAccounts(ctx: Context): RouteAccount[] {
  const llm = ctx.get('llm') as { listConfigurableProviders?: () => Array<{
    provider: string
    displayName?: string
    settingsNs: string
    settingsPath?: string[]
  }> } | undefined
  const settings = ctx.get('settings') as { get?: (ns: string) => unknown } | undefined
  if (llm?.listConfigurableProviders === undefined || settings?.get === undefined) return []

  const out: RouteAccount[] = []
  for (const entry of llm.listConfigurableProviders()) {
    let profile: unknown
    try {
      profile = readAt(settings.get(entry.settingsNs), entry.settingsPath ?? [])
    } catch {
      profile = undefined
    }
    const typed = profile as { baseURL?: string; baseUrl?: string; apiKeyEnv?: string } | undefined
    let origin = originOf(typed?.baseURL ?? typed?.baseUrl)
    if (origin === undefined && isOfficialDeepSeekProvider(entry.provider)) origin = DEEPSEEK_ORIGIN
    if (origin === undefined) continue
    const apiKeyEnv = typeof typed?.apiKeyEnv === 'string' && typed.apiKeyEnv !== ''
      ? typed.apiKeyEnv
      : isOfficialDeepSeekProvider(entry.provider) ? DEEPSEEK_KEY_ENV : undefined
    out.push({
      route: entry.provider,
      displayName: entry.displayName ?? entry.provider,
      origin,
      ...apiKeyEnv !== undefined ? { apiKeyEnv } : {},
    })
  }
  return out
}

export function currentAccount(ctx: Context): RouteAccount | undefined {
  const accounts = listRouteAccounts(ctx)
  if (accounts.length === 0) return undefined
  const settings = ctx.get('settings') as { get?: (ns: string) => unknown } | undefined
  const defaults = settings?.get?.('agent-default-model') as { provider?: string; model?: string } | undefined
  const hit = defaults?.provider !== undefined
    ? accounts.find(account => account.route === defaults.provider)
    : undefined
  const account = hit ?? accounts[0]
  if (account === undefined) return undefined
  return defaults?.model !== undefined ? { ...account, model: defaults.model } : account
}

async function resolveApiKey(ctx: Context, reference: string | undefined): Promise<string | undefined> {
  if (reference === undefined) return undefined
  const credentials = ctx.get('credentials') as {
    resolve?: (ref: string) => Promise<{ value?: string } | string | undefined>
  } | undefined
  if (credentials?.resolve === undefined) return undefined
  try {
    const hit = await credentials.resolve(reference)
    if (typeof hit === 'string') return hit
    return typeof hit?.value === 'string' ? hit.value : undefined
  } catch {
    return undefined
  }
}

/**
 * New API 访问令牌设置（settings 服务里 `newapi-wallet` 名字的值）。
 * 从入口模块注入，避免 snapshot → settings 模块环。
 */
export interface AccessConfigSource {
  get(): { accessToken?: string; routeAccessTokens?: Record<string, string>; refreshMs?: number } | undefined
}

let accessConfigSource: AccessConfigSource | undefined

/** 由入口模块在启动时注入（settings.register 返回的 scope.get）。 */
export function setAccessConfigSource(source: AccessConfigSource | undefined): void {
  accessConfigSource = source
}

function normalizedRouteKey(route: string): string {
  return route.trim().toLowerCase()
}

/**
 * 解析某条路由的查账凭据（New API 访问令牌）。
 * 顺序：routeAccessTokens[route] → accessToken。**不含** sk- 模型密钥。
 * sk- 密钥只允许作为指纹探针的 Authorization（见 index.ts 的 probeAuthorization）。
 */
function accessKeyForRoute(route: string): string | undefined {
  const config = accessConfigSource?.get()
  const perRoute = config?.routeAccessTokens
  if (perRoute !== undefined && perRoute !== null && typeof perRoute === 'object') {
    for (const [key, value] of Object.entries(perRoute)) {
      if (typeof value === 'string' && value.trim() !== '' && normalizedRouteKey(key) === normalizedRouteKey(route)) {
        return value.trim()
      }
    }
  }
  const globalToken = config?.accessToken
  if (typeof globalToken === 'string' && globalToken.trim() !== '') return globalToken.trim()
  return undefined
}

/** 仅供指纹探针用：访问令牌优先，缺省时用该路由的 sk- 密钥。绝不用于查账数据请求。 */
export function probeAuthorizationForRoute(ctx: Context, route: string): Promise<string | undefined> {
  const token = accessKeyForRoute(route)
  if (token !== undefined) return Promise.resolve(token)
  const account = listRouteAccounts(ctx).find(entry => entry.route === route)
  return resolveApiKey(ctx, account?.apiKeyEnv)
}

export async function listAccounts(ctx: Context): Promise<AccountListItem[]> {
  const current = currentAccount(ctx)
  const out: AccountListItem[] = []
  for (const account of listRouteAccounts(ctx)) {
    const apiKey = await resolveApiKey(ctx, account.apiKeyEnv)
    const hasCredential = apiKey !== undefined && apiKey !== ''
    const hasAccessKey = accessKeyForRoute(account.route) !== undefined
    out.push({
      route: account.route,
      displayName: account.displayName,
      origin: account.origin,
      host: hostLabel(account.origin),
      hasCredential,
      hasAccessKey,
      isCurrent: current?.route === account.route,
      // 脱敏提示只反映「配了模型密钥」；访问令牌本身永不回传浏览器。
      ...hasCredential ? { keyHint: maskKey(apiKey ?? '') } : {},
    })
  }
  return out
}

function accountForRoute(ctx: Context, route: string | undefined): RouteAccount | WalletError {
  const accounts = listRouteAccounts(ctx)
  if (accounts.length === 0) return { ok: false, error: 'no-provider' }
  const current = currentAccount(ctx)
  if (route === undefined || route === '') {
    return current ?? { ok: false, error: 'no-provider' }
  }
  const hit = accounts.find(account => account.route === route)
  if (hit === undefined) return { ok: false, error: 'unknown-account', detail: route }
  return current?.route === hit.route && current.model !== undefined
    ? { ...hit, model: current.model }
    : hit
}

/* ------------------------------------------------------------------ */
/* 今日窗口：stat → data/self 聚合；以及逐条明细                          */
/* ------------------------------------------------------------------ */

interface TodayOutcome {
  money?: Money
  requests?: number
  tokens?: TokenBuckets
  models?: TodayModelRow[]
  rate?: { rpm?: number; tpm?: number }
  reason?: string
}

async function fetchToday(
  origin: string,
  accessKey: string,
  units: QuotaUnits,
): Promise<TodayOutcome> {
  const now = Date.now()
  const from = Math.floor(localDayStartMs(now) / 1000)
  const to = Math.floor(now / 1000)

  const outcome: TodayOutcome = {}

  // 1) /api/log/self/stat：今日实扣 quota + rpm/tpm。
  try {
    const stat = await getJson(origin, '/api/log/self/stat', accessKey, {
      type: 2,
      start_timestamp: from,
      end_timestamp: to,
    })
    if (isNewApiOk(stat.status, stat.body)) {
      const data = (stat.body.data ?? {}) as Record<string, unknown>
      const quota = num(data.quota)
      if (quota !== undefined) {
        outcome.money = quotaToMoney(quota, units)
        outcome.requests = num(data.count)
      }
      const rpm = num(data.rpm)
      const tpm = num(data.tpm)
      if (rpm !== undefined || tpm !== undefined) {
        outcome.rate = {
          ...(rpm !== undefined ? { rpm } : {}),
          ...(tpm !== undefined ? { tpm } : {}),
        }
      }
    }
  } catch { /* 站点可能关闭了用户态统计，继续走 data/self */ }

  // 2) /api/data/self：按模型聚合（今日）。
  try {
    const aggregate = await getJson(origin, '/api/data/self', accessKey, {
      start_timestamp: from,
      end_timestamp: to,
      default_time: 'hour',
    })
    if (isNewApiOk(aggregate.status, aggregate.body)) {
      const rows = Array.isArray(aggregate.body.data) ? aggregate.body.data : []
      const byModel = new Map<string, TodayModelRow>()
      let quota = 0
      let requests = 0
      let tokensTotal: number | undefined
      for (const row of rows) {
        if (row === null || typeof row !== 'object') continue
        const record = row as Record<string, unknown>
        const rowQuota = num(record.quota) ?? 0
        const rowCalls = num(record.count) ?? 0
        quota += rowQuota
        const requestCount = num(record.request_count) ?? 0
        requests += requestCount > 0 ? requestCount : rowCalls
        const rowTokens = num(record.token_used)
        if (rowTokens !== undefined) tokensTotal = (tokensTotal ?? 0) + rowTokens
        const model = typeof record.model_name === 'string' && record.model_name !== ''
          ? record.model_name
          : '未知模型'
        const existing = byModel.get(model)
        if (existing === undefined) {
          byModel.set(model, { model, quota: rowQuota, calls: rowCalls, ...(rowTokens !== undefined ? { tokens: rowTokens } : {}) })
        } else {
          existing.quota += rowQuota
          existing.calls += rowCalls
          if (rowTokens !== undefined) existing.tokens = (existing.tokens ?? 0) + rowTokens
        }
      }
      if (byModel.size > 0) outcome.models = [...byModel.values()].sort((a, b) => b.quota - a.quota)
      if (outcome.money === undefined && quota > 0) outcome.money = quotaToMoney(quota, units)
      if (outcome.requests === undefined && requests > 0) outcome.requests = requests
      if (tokensTotal !== undefined) {
        outcome.tokens = { ...outcome.tokens, totalTokens: tokensTotal }
      }
    }
  } catch { /* ignore */ }

  if (outcome.money === undefined) outcome.reason = 'gateway-logs-unavailable'
  return outcome
}

/** /api/log/self 的 `other` 字段是 JSON 字符串，解析出 cache_tokens 等。 */
function parseOther(value: unknown): { cacheTokens?: number } {
  if (typeof value !== 'string' || value.trim() === '') return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const cacheTokens = num(parsed.cache_tokens)
    return { ...(cacheTokens !== undefined ? { cacheTokens } : {}) }
  } catch {
    return {}
  }
}

async function fetchRecentCalls(
  origin: string,
  accessKey: string,
  units: QuotaUnits,
): Promise<CallRecord[] | undefined> {
  try {
    const { status, body } = await getJson(origin, '/api/log/self', accessKey, {
      type: 2,
      page: 1,
      page_size: LOG_PAGE_SIZE,
      start_timestamp: Math.floor(localDayStartMs() / 1000),
      end_timestamp: Math.floor(Date.now() / 1000),
    })
    if (!isNewApiOk(status, body)) return undefined
    const payload = body.data
    const rawItems = payload !== null && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : Array.isArray(payload)
        ? payload
        : []
    const records: CallRecord[] = []
    for (const item of rawItems) {
      if (item === null || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const createdAtMs = epochMs(num(record.created_at))
      if (createdAtMs === undefined) continue
      const quota = num(record.quota)
      const promptTokens = num(record.prompt_tokens)
      const completionTokens = num(record.completion_tokens)
      const other = parseOther(record.other)
      const model = typeof record.model_name === 'string' && record.model_name !== '' ? record.model_name : undefined
      const requestId = typeof record.request_id === 'string' && record.request_id !== '' ? record.request_id : undefined
      const group = typeof record.group === 'string' && record.group !== '' ? record.group : undefined
      const tokenName = typeof record.token_name === 'string' && record.token_name !== '' ? record.token_name : undefined
      records.push({
        createdAt: createdAtMs,
        ...model !== undefined ? { model } : {},
        ...quota !== undefined ? { quota } : {},
        ...quota !== undefined ? { amount: quotaToMoney(quota, units) } : {},
        ...promptTokens !== undefined ? { promptTokens } : {},
        ...completionTokens !== undefined ? { completionTokens } : {},
        ...other.cacheTokens !== undefined ? { cacheTokens: other.cacheTokens } : {},
        ...requestId !== undefined ? { requestId } : {},
        ...group !== undefined ? { group } : {},
        ...tokenName !== undefined ? { tokenName } : {},
      })
      if (records.length >= RECENT_MAX) break
    }
    return records
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------------ */
/* 快照主体                                                             */
/* ------------------------------------------------------------------ */

async function readNewApi(account: RouteAccount, accessKey: string): Promise<WalletSnapshot | WalletError> {
  const units = await readUnits(account.origin)

  // 剩余 / 累计：/api/user/self（账户级）。
  let remaining: Money | undefined
  let used: Money | undefined
  let keyName: string | undefined
  const self = await getJson(account.origin, '/api/user/self', accessKey)
  if (isNewApiOk(self.status, self.body)) {
    const data = (self.body.data ?? {}) as Record<string, unknown>
    remaining = quotaToMoney(num(data.quota), units)
    used = quotaToMoney(num(data.used_quota), units)
    const displayName = typeof data.display_name === 'string' && data.display_name !== ''
      ? data.display_name
      : typeof data.username === 'string' && data.username !== '' ? data.username : undefined
    keyName = displayName
  }

  const today = await fetchToday(account.origin, accessKey, units)
  const todayOk = today.reason === undefined && today.money !== undefined

  // 逐条明细失败不阻塞整卡。
  const recentCalls = await fetchRecentCalls(account.origin, accessKey, units)

  // 今日 token 桶：明细里 prompt/completion/cache 求和；total 用 data/self 聚合值。
  let todayTokens: TokenBuckets | undefined
  {
    let inputTokens: number | undefined
    let outputTokens: number | undefined
    let cacheReadTokens: number | undefined
    if (recentCalls !== undefined) {
      for (const call of recentCalls) {
        if (call.promptTokens !== undefined) inputTokens = (inputTokens ?? 0) + call.promptTokens
        if (call.completionTokens !== undefined) outputTokens = (outputTokens ?? 0) + call.completionTokens
        if (call.cacheTokens !== undefined) cacheReadTokens = (cacheReadTokens ?? 0) + call.cacheTokens
      }
    }
    const requests = today.requests
    const total = today.tokens?.totalTokens
    const hasAny = inputTokens !== undefined || outputTokens !== undefined
      || cacheReadTokens !== undefined || total !== undefined || requests !== undefined
    if (hasAny) {
      todayTokens = {
        ...(requests !== undefined ? { requests } : {}),
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
        ...(total !== undefined ? { totalTokens: total } : {}),
      }
    }
  }

  return {
    ok: true,
    fetchedAt: Date.now(),
    route: account.route,
    displayName: account.displayName,
    origin: account.origin,
    ...account.model !== undefined ? { model: account.model } : {},
    ...keyName !== undefined ? { keyName } : {},
    // keyHint 缺省：访问令牌绝不回传浏览器；sk- 密钥与查账无关。
    ...remaining !== undefined ? { remaining } : {},
    ...used !== undefined ? { used } : {},
    todayAvailable: todayOk,
    ...todayOk && today.money !== undefined
      ? { today: { ...today.money, ...today.requests !== undefined ? { requests: today.requests } : {} } }
      : {},
    ...!todayOk && today.reason !== undefined ? { todayUnavailableReason: today.reason } : {},
    ...todayTokens !== undefined ? { todayTokens } : {},
    ...today.models !== undefined && today.models.length > 0 ? { todayModels: today.models } : {},
    ...recentCalls !== undefined && recentCalls.length > 0 ? { recentCalls } : {},
    ...today.rate !== undefined ? { rate: today.rate } : {},
    scheme: 'newapi',
    isAvailable: remaining?.quota === undefined || remaining.quota > 0,
  }
}

export async function fetchWallet(ctx: Context, route?: string): Promise<WalletSnapshot | WalletError> {
  const account = accountForRoute(ctx, route)
  if ('ok' in account && account.ok === false) return account

  // 查账凭据：只认 New API 访问令牌。sk- 模型密钥绝不发往用户级路由。
  const accessKey = accessKeyForRoute(account.route)
  if (accessKey === undefined) {
    return { ok: false, error: 'no-access-token', detail: account.route }
  }

  try {
    if (isOfficialDeepSeekOrigin(account.origin)) {
      return { ok: false, error: 'unsupported-official', detail: account.origin }
    }
    const finger = await fingerprintOrigin(account.origin)
    if (finger.software === 'unknown') {
      return { ok: false, error: 'unknown-software', detail: finger.reason ?? account.origin }
    }
    if (finger.software === 'sub2api') {
      return { ok: false, error: 'scheme-unsupported', detail: 'sub2api 站点不在本 fork 支持范围' }
    }
    return await readNewApi(account, accessKey)
  } catch (error) {
    const name = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable'
    return { ok: false, error: name, detail: account.origin }
  }
}

/**
 * 浏览器轮询间隔：来自设置 `newapi-wallet.refreshMs`（按请求实时读取，改完不用重启），
 * 夹到 [10s, 10min] —— 每次刷新会打 4 个网关端点，不设下限容易把自建网关打穿。
 * 设置缺失或非法时用 60s。
 */
export function resolveRefreshMs(): number {
  const raw = accessConfigSource?.get()?.refreshMs
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 60_000
  return Math.min(600_000, Math.max(10_000, Math.round(raw)))
}

export async function fetchBundle(ctx: Context, route?: string): Promise<WalletBundle> {
  const accounts = await listAccounts(ctx)
  const selected = route !== undefined && accounts.some(account => account.route === route)
    ? route
    : accounts.find(account => account.isCurrent)?.route ?? accounts[0]?.route ?? ''
  return {
    accounts,
    selected,
    refreshMs: resolveRefreshMs(),
    wallet: await fetchWallet(ctx, selected === '' ? undefined : selected),
  }
}
