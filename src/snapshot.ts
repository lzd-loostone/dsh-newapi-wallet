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
 *
 * 金额拆分（今日按模型 / 输入-输出-缓存分桶）：比例取自每条账本行自带的 other
 * 字段，先算分量、再按该行真实 quota 回缩——拆分各分量之和恒等于账本金额，
 * 不引入任何本地估价，也不请求价目接口。
 */
import type { Context } from '@deepseek-ai/cordis'
import { fingerprintOrigin } from './fingerprint.ts'
import type {
  AccountListItem,
  CallRecord,
  DailyPoint,
  Money,
  TodayModelRow,
  TokenBuckets,
  UsageAmounts,
  WalletBundle,
  WalletError,
  WalletSnapshot,
} from './shared.ts'

const TIMEOUT_MS = 15_000
const LOG_PAGE_SIZE = 100
const RECENT_MAX = 30
/** 今日账本分页聚合上限（页 × 每页条数）。超出只累计最近的部分，并标记 partial。 */
const LOG_MAX_PAGES = 10
/** 热力图天数：4 行 × 7 列。 */
const HEAT_DAYS = 28
/** 缺失日逐日 stat 补探上限（每次 ~80ms）；「今天」豁免预算。超出预算的日期显示「无数据」。 */
const HEAT_FILL_MAX = 12
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

/** 本地日期 YYYY-MM-DD。 */
function localDayString(ms: number): string {
  const d = new Date(ms)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
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

/**
 * 0.1.7 起 settings 服务用 describe() 投影各条目（= profile 条目 id，如 `llm-pi-ai`）的
 * 实时值，不再有 get(ns)。拿不到就返回空表，调用方会给出 no-provider。
 */
function settingsValues(ctx: Context): Map<string, unknown> {
  const out = new Map<string, unknown>()
  const settings = ctx.get('settings') as {
    describe?: (options?: { redactSecrets?: boolean }) => Array<{ ns?: unknown; value?: unknown }>
  } | undefined
  if (settings?.describe === undefined) return out
  try {
    for (const row of settings.describe()) {
      if (row !== null && typeof row?.ns === 'string') out.set(row.ns, row.value)
    }
  } catch {
    // settings 服务不可用：当作没有可读路由。
  }
  return out
}

/**
 * 已配置且带地址的模型路由。本插件只服务 New API，所以官方 DeepSeek 之类没有 baseURL
 * 的 provider 在这里就没有 origin —— 自然被跳过，不做任何特判。
 */
export function listRouteAccounts(ctx: Context): RouteAccount[] {
  const llm = ctx.get('llm') as { listConfigurableProviders?: () => Array<{
    provider: string
    displayName?: string
    settingsNs: string
    settingsPath?: string[]
  }> } | undefined
  if (llm?.listConfigurableProviders === undefined) return []
  const values = settingsValues(ctx)

  const out: RouteAccount[] = []
  for (const entry of llm.listConfigurableProviders()) {
    let profile: unknown
    try {
      profile = readAt(values.get(entry.settingsNs), entry.settingsPath ?? [])
    } catch {
      profile = undefined
    }
    const typed = profile as { baseURL?: string; baseUrl?: string; apiKeyEnv?: string } | undefined
    const origin = originOf(typed?.baseURL ?? typed?.baseUrl)
    if (origin === undefined) continue
    const apiKeyEnv = typeof typed?.apiKeyEnv === 'string' && typed.apiKeyEnv !== '' ? typed.apiKeyEnv : undefined
    out.push({
      route: entry.provider,
      displayName: entry.displayName ?? entry.provider,
      origin,
      ...apiKeyEnv !== undefined ? { apiKeyEnv } : {},
    })
  }
  return out
}

/**
 * 只留探出来是 New API 的路由（用户已拍板：非 New API 的供应商直接隐藏）。
 * 探测按 origin 缓存，所以每次刷新只对没认过的站点发一次匿名 GET /api/status。
 * 全被滤掉时把逐条原因带出去，免得界面只会说「没有供应商」。
 */
async function newApiAccounts(ctx: Context): Promise<{ accounts: RouteAccount[]; reasons: string[] }> {
  const all = listRouteAccounts(ctx)
  const marks = await Promise.all(all.map(account => fingerprintOrigin(account.origin)))
  const accounts: RouteAccount[] = []
  const reasons: string[] = []
  all.forEach((account, index) => {
    const mark = marks[index]
    if (mark?.software === 'newapi') accounts.push(account)
    else reasons.push(`${account.displayName}（${account.origin}）：${mark?.reason ?? '不是 New API 站点'}`)
  })
  return { accounts, reasons }
}

export function currentAccount(accounts: RouteAccount[], ctx: Context): RouteAccount | undefined {
  if (accounts.length === 0) return undefined
  const defaults = settingsValues(ctx).get('agent-default-model') as { provider?: string; model?: string } | undefined
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

/** 由入口模块在启动时注入（Config 的 volatile 引用）。 */
export function setAccessConfigSource(source: AccessConfigSource | undefined): void {
  accessConfigSource = source
}

/** 本插件在 profile patch 里的条目 id 兜底值（= cordis.patch.yml 里插入的 id）。 */
const DEFAULT_ENTRY_ID = 'loostone-newapi-wallet'

/**
 * 本插件自己的 profile 条目 id。官方写法见 `@deepseek-ai/dsh-llm-pi-ai`：
 * `ctx.fiber.entry?.options.id ?? NS` —— 用户换了插入 id 也不会写错条目。
 */
function entryIdOf(ctx: Context): string {
  const fiber = (ctx as Context & { fiber?: { entry?: { options?: { id?: unknown } } } }).fiber
  const id = fiber?.entry?.options?.id
  return typeof id === 'string' && id !== '' ? id : DEFAULT_ENTRY_ID
}

export interface AccessPatch {
  /** 全局默认令牌；'' 表示清除。 */
  accessToken?: string
  /** 按路由覆盖；值 '' 表示删掉该路由的覆盖。 */
  routeAccessTokens?: Record<string, string>
}

/**
 * 写令牌的官方入口：`settings.update(本条目 id, patch)`。
 * 服务端把 volatile 表单写进 profile 的 cordis.patch.yml，并让运行中的 volatile 引用
 * 即时生效 —— 保存后无需重启，下一次 /api/newapi-wallet 读到的就是新令牌。
 * 按路由覆盖要自己先合并成完整 map（浏览器拿不到其它路由的令牌，绝不下发）。
 */
export async function updateAccessConfig(ctx: Context, patch: AccessPatch): Promise<WalletError | undefined> {
  const settings = ctx.get('settings') as {
    update?: (ns: string, value: Record<string, unknown>) => Promise<unknown>
  } | undefined
  if (settings?.update === undefined) {
    return { ok: false, error: 'no-settings', detail: 'settings 服务不可用，无法保存令牌' }
  }
  const current = accessConfigSource?.get() ?? {}
  const next: Record<string, unknown> = {}
  if (patch.accessToken !== undefined) next.accessToken = patch.accessToken
  if (patch.routeAccessTokens !== undefined) {
    const merged: Record<string, string> = { ...(current.routeAccessTokens ?? {}) }
    for (const [route, token] of Object.entries(patch.routeAccessTokens)) {
      const key = route.trim()
      if (key === '') continue
      // 删掉大小写不匹配的同名覆盖，避免残留两把令牌。
      for (const existing of Object.keys(merged)) {
        if (existing.trim().toLowerCase() === key.toLowerCase()) delete merged[existing]
      }
      if (token !== '') merged[key] = token
    }
    next.routeAccessTokens = merged
  }
  if (Object.keys(next).length === 0) return undefined
  try {
    await settings.update(entryIdOf(ctx), next)
    return undefined
  } catch (error) {
    return {
      ok: false,
      error: 'settings-write-failed',
      detail: error instanceof Error ? error.message : String(error),
    }
  }
}

function normalizedRouteKey(route: string): string {
  return route.trim().toLowerCase()
}

/**
 * 解析某条路由的查账凭据（New API 访问令牌）。
 * 顺序：routeAccessTokens[route] → accessToken。**不含** sk- 模型密钥 ——
 * sk- 密钥是 LLM 路由的凭据，永远不参与查账。
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

export async function listAccounts(ctx: Context): Promise<AccountListItem[]> {
  const { accounts: detected } = await newApiAccounts(ctx)
  const current = currentAccount(detected, ctx)
  const out: AccountListItem[] = []
  for (const account of detected) {
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

async function accountForRoute(ctx: Context, route: string | undefined): Promise<RouteAccount | WalletError> {
  const { accounts, reasons } = await newApiAccounts(ctx)
  if (accounts.length === 0) {
    // 有模型路由，但没有一条像 New API：说清是哪几条、为什么，别报成「没配供应商」。
    return reasons.length === 0
      ? { ok: false, error: 'no-provider' }
      : { ok: false, error: 'no-newapi', detail: reasons.join('；') }
  }
  const current = currentAccount(accounts, ctx)
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
      if (byModel.size > 0) {
        outcome.models = [...byModel.values()]
          .map(row => ({ ...row, amount: quotaToMoney(row.quota, units) }))
          .sort((a, b) => b.quota - a.quota)
      }
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

/**
 * 近 4 周逐日消费（热力图口径，一次 /api/data/self 覆盖全部 28 天，窗口 ≤30 天限制内）。
 * 主源：小时行按【本地日期】分组求和——实测与逐日 /api/log/self/stat 完全对账
 * （连续数日 quota 逐位数一致）。「今天」与缺口日改打逐日 stat 补探：
 * 今天强制用 stat 是为了和头部「今日实扣」同源（data/self 实时略有零头差）。
 * 补探预算（HEAT_FILL_MAX）用尽或该日超出网关统计保留范围的，available=false。
 */
async function fetchDailyHistory(
  origin: string,
  accessKey: string,
  units: QuotaUnits,
): Promise<DailyPoint[] | undefined> {
  const now = Date.now()
  const todayStr = localDayString(now)
  const firstDayStart = localDayStartMs(now - (HEAT_DAYS - 1) * 86_400_000)
  try {
    const aggregate = await getJson(origin, '/api/data/self', accessKey, {
      start_timestamp: Math.floor(firstDayStart / 1000),
      end_timestamp: Math.floor(now / 1000),
      default_time: 'hour',
    })
    if (!isNewApiOk(aggregate.status, aggregate.body)) return undefined
    const rows = Array.isArray(aggregate.body.data) ? aggregate.body.data : []
    const byDay = new Map<string, { quota: number; calls: number }>()
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue
      const record = row as Record<string, unknown>
      const ms = epochMs(num(record.created_at))
      if (ms === undefined) continue
      const key = localDayString(ms)
      const quota = num(record.quota) ?? 0
      const calls = num(record.count) ?? 0
      const hit = byDay.get(key)
      if (hit === undefined) byDay.set(key, { quota, calls })
      else { hit.quota += quota; hit.calls += calls }
    }
    let fillBudget = HEAT_FILL_MAX
    const points: DailyPoint[] = []
    for (let i = HEAT_DAYS - 1; i >= 0; i--) {
      const dayStart = localDayStartMs(now - i * 86_400_000)
      const date = localDayString(dayStart)
      const fromHour = byDay.get(date)
      let resolved: { quota: number; calls: number } | undefined = fromHour
      const mustStat = date === todayStr
      if ((resolved === undefined || mustStat) && (mustStat || fillBudget > 0)) {
        if (!mustStat) fillBudget -= 1
        try {
          const s0 = Math.floor(dayStart / 1000)
          const s1 = Math.min(s0 + 86_400, Math.floor(now / 1000))
          const stat = await getJson(origin, '/api/log/self/stat', accessKey, {
            type: 2,
            start_timestamp: s0,
            end_timestamp: s1,
          })
          if (isNewApiOk(stat.status, stat.body)) {
            const data = (stat.body.data ?? {}) as Record<string, unknown>
            const q = num(data.quota)
            if (q !== undefined) resolved = { quota: q, calls: num(data.count) ?? 0 }
          }
        } catch { /* 单日补探失败：按无数据呈现，不影响整体 */ }
      }
      if (resolved !== undefined) {
        points.push({
          date,
          available: true,
          quota: resolved.quota,
          calls: resolved.calls,
          amount: quotaToMoney(resolved.quota, units) ?? { quota: resolved.quota, currency: FALLBACK_CURRENCY },
        })
      } else {
        points.push({ date, available: false, quota: 0 })
      }
    }
    return points
  } catch {
    return undefined
  }
}

/** /api/log/self 的 `other` 字段是 JSON 字符串：cache_tokens 与该笔实际使用的计费比例（账本自带）。 */
function parseOther(value: unknown): {
  cacheTokens?: number
  modelRatio?: number
  completionRatio?: number
  cacheRatio?: number
  groupRatio?: number
} {
  if (typeof value !== 'string' || value.trim() === '') return {}
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    const cacheTokens = num(parsed.cache_tokens)
    const modelRatio = num(parsed.model_ratio)
    const completionRatio = num(parsed.completion_ratio)
    const cacheRatio = num(parsed.cache_ratio)
    const groupRatio = num(parsed.group_ratio) ?? num(parsed.user_group_ratio)
    return {
      ...(cacheTokens !== undefined ? { cacheTokens } : {}),
      ...(modelRatio !== undefined ? { modelRatio } : {}),
      ...(completionRatio !== undefined ? { completionRatio } : {}),
      ...(cacheRatio !== undefined ? { cacheRatio } : {}),
      ...(groupRatio !== undefined ? { groupRatio } : {}),
    }
  } catch {
    return {}
  }
}

/** 全天账本聚合结果。 */
interface LedgerOutcome {
  ok: boolean
  /** 展示用的最近 RECENT_MAX 条明细（最新在前）。 */
  records: CallRecord[]
  /** 今日扫描到的账本行数。 */
  rows: number
  /** 未缓存输入 token（prompt − cache）全天合计。 */
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  /** 金额分量（quota 点数）：回缩后 input+output+cacheRead 恒等于 total。 */
  amountQuota: { input: number; output: number; cacheRead: number; total: number }
  /** 服务端上报的今日总行数（data.total）。 */
  serverTotal?: number
  /** 今日行数超过分页上限，聚合只覆盖最近的部分。 */
  partial: boolean
}

/**
 * 分页拉取今日消费账本（type=2）并聚合：展示明细取最近 30 条；
 * token 桶与金额拆分对全部拉到的行求和（旧版只对最近 30 条求和，是缺陷，已修）。
 * 金额拆分对每行按账本自带比例算分量后、再按该行真实 quota 回缩，
 * 所以各分量之和与本行 quota、与全天账本合计都严格一致。
 *
 * 分页坑（实测）：本网关的翻页参数是 p，`page` 会被无视并反复返回第一页
 * （曾导致聚合膨胀 10 倍）。除改用 p 外，再按行 id 去重、整页重复即停兜底。
 */
async function fetchTodayLedger(
  origin: string,
  accessKey: string,
  units: QuotaUnits,
): Promise<LedgerOutcome> {
  const from = Math.floor(localDayStartMs() / 1000)
  const to = Math.floor(Date.now() / 1000)
  const out: LedgerOutcome = {
    ok: false,
    records: [],
    rows: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    amountQuota: { input: 0, output: 0, cacheRead: 0, total: 0 },
    partial: false,
  }
  let page = 1
  let shortPageSeen = false
  let fresh = 0
  const seenRowIds = new Set<number>()
  while (page <= LOG_MAX_PAGES) {
    let status: number
    let body: Record<string, unknown>
    try {
      const result = await getJson(origin, '/api/log/self', accessKey, {
        type: 2,
        p: page,
        page_size: LOG_PAGE_SIZE,
        start_timestamp: from,
        end_timestamp: to,
      })
      status = result.status
      body = result.body
    } catch {
      break
    }
    if (!isNewApiOk(status, body)) break
    out.ok = true
    const payload = body.data
    const rawItems = payload !== null && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : Array.isArray(payload)
        ? payload
        : []
    out.rows += rawItems.length
    if (payload !== null && typeof payload === 'object') {
      const totalFromServer = num((payload as { total?: unknown }).total)
      if (totalFromServer !== undefined) out.serverTotal = totalFromServer
    }
    fresh = 0
    for (const item of rawItems) {
      if (item === null || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      // 行 id 去重：若服务端某页与已扫内容重复（分页失效的病征），只算一次。
      const rowId = num(record.id)
      if (rowId !== undefined) {
        if (seenRowIds.has(rowId)) continue
        seenRowIds.add(rowId)
      }
      fresh += 1
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
      if (out.records.length < RECENT_MAX) {
        out.records.push({
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
      }
      // 全天聚合：token 桶 + 金额拆分。
      const billedQuota = quota ?? 0
      out.amountQuota.total += billedQuota
      const cacheTok = Math.min(other.cacheTokens ?? 0, promptTokens ?? 0)
      const uncached = Math.max((promptTokens ?? 0) - cacheTok, 0)
      out.inputTokens += uncached
      out.outputTokens += completionTokens ?? 0
      out.cacheTokens += cacheTok
      const mr = other.modelRatio ?? 1
      const cmr = other.completionRatio ?? 1
      const cr = other.cacheRatio ?? 0
      const gr = other.groupRatio ?? 1
      let qIn = uncached * mr * gr
      let qCache = cacheTok * cr * mr * gr
      let qOut = (completionTokens ?? 0) * cmr * gr
      const sum = qIn + qCache + qOut
      if (billedQuota > 0 && sum > 0) {
        const k = billedQuota / sum
        qIn *= k
        qCache *= k
        qOut *= k
      } else if (billedQuota > 0) {
        // 比例缺失拆不动：整笔计入输入，不丢合计。
        qIn = billedQuota
        qCache = 0
        qOut = 0
      } else {
        qIn = 0
        qCache = 0
        qOut = 0
      }
      out.amountQuota.input += qIn
      out.amountQuota.cacheRead += qCache
      out.amountQuota.output += qOut
    }
    if (rawItems.length < LOG_PAGE_SIZE || fresh === 0) {
      // 最后一页（或整页重复的病态）：停止。
      shortPageSeen = true
      break
    }
    page += 1
  }
  out.partial = out.ok && (out.serverTotal === undefined ? !shortPageSeen : out.rows < out.serverTotal)
  return out
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

  // 逐条明细 + 全天聚合（展示取最近 30 条，token 桶与金额拆分对全部拉到的行求和）。
  const ledger = await fetchTodayLedger(account.origin, accessKey, units)
  const recentCalls = ledger.ok ? ledger.records : undefined

  // 近 4 周逐日消费（热力图）；失败/缺字段只是不渲染该区块。
  const dailyHistory = await fetchDailyHistory(account.origin, accessKey, units)

  // 今日 token 桶：输入(未缓存)/输出/缓存来自全天账本行；合计用 data/self 聚合值。
  let todayTokens: TokenBuckets | undefined
  let todayAmounts: UsageAmounts | undefined
  {
    const hasLedger = ledger.ok && ledger.rows > 0
    const requests = today.requests
    const total = today.tokens?.totalTokens
    const inputTokens = hasLedger ? ledger.inputTokens : undefined
    const outputTokens = hasLedger ? ledger.outputTokens : undefined
    const cacheReadTokens = hasLedger ? ledger.cacheTokens : undefined
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
    if (hasLedger) {
      todayAmounts = {
        input: quotaToMoney(round6(ledger.amountQuota.input), units),
        output: quotaToMoney(round6(ledger.amountQuota.output), units),
        cacheRead: quotaToMoney(round6(ledger.amountQuota.cacheRead), units),
        total: quotaToMoney(round6(ledger.amountQuota.total), units),
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
    ...todayAmounts !== undefined ? { todayAmounts } : {},
    ...dailyHistory !== undefined ? { dailyHistory } : {},
    ...ledger.ok && ledger.rows > 0 ? { todayLogRows: ledger.rows } : {},
    ...ledger.ok && ledger.partial ? { todayLogsPartial: true } : {},
    ...today.models !== undefined && today.models.length > 0 ? { todayModels: today.models } : {},
    ...recentCalls !== undefined && recentCalls.length > 0 ? { recentCalls } : {},
    ...today.rate !== undefined ? { rate: today.rate } : {},
    scheme: 'newapi',
    isAvailable: remaining?.quota === undefined || remaining.quota > 0,
  }
}

export async function fetchWallet(ctx: Context, route?: string): Promise<WalletSnapshot | WalletError> {
  // accountForRoute 已经按 New API 指纹筛过（结果按 origin 缓存），所以这里不再重复探测。
  const account = await accountForRoute(ctx, route)
  if ('ok' in account && account.ok === false) return account

  // 查账凭据：只认 New API 访问令牌。sk- 模型密钥绝不发往用户级路由。
  const accessKey = accessKeyForRoute(account.route)
  if (accessKey === undefined) {
    return { ok: false, error: 'no-access-token', detail: account.route }
  }

  try {
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
