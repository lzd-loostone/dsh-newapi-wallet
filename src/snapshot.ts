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
 * 计费口径（勿退回旧写法）：网关已改用**表达式计费**，每条账本行的 other 里带
 * expr_b64，解出来形如
 *   tier("base", p * 0.15 + c * 0.5625 + cr * 0.015 + cc * 0.1875)
 * 其中 p = prompt − cache_tokens − cache_creation_tokens（真正未命中的输入）、
 * c = completion、cr = 缓存命中读取、cc = 缓存写入。
 * 旧的 model_ratio / completion_ratio / cache_ratio 在新计费下**恒为 0**，
 * 拿它们拆账会让分量之和为 0，整笔金额塌进「输入」一行（输出与缓存恒记 ¥0）。
 *
 * 拆分方式：用表达式解出的单价算四个分量的相对权重，再按该行真实 quota 等比回缩——
 * 权重是真的，合计也恒等于账本金额，不引入本地估价，不请求价目接口。
 * 站点约 98% 的输入 token 是缓存，任何「tokens×标价」的本地估算都会把成本高估数倍。
 */
import type { Context } from '@deepseek-ai/cordis'
import { fingerprintOrigin } from './fingerprint.ts'
import { readLedger, aggregate } from './ledger.ts'
import { sharedStore } from './store.ts'
import { mapPool, retryDelayMs, shouldRetryNow } from './pool.ts'
import { gatewayLimit } from './limit.ts'
import { accountKeyForToken, parseAccounts } from './accounts.ts'
import type { WalletAccount } from './accounts.ts'
import { mergeSnapshots } from './merge.ts'
import type { AccountPart } from './merge.ts'
import type { LedgerFilter, LedgerTotals } from './ledger.ts'
import type {
  AccountListItem,
  CallRecord,
  DailyPoint,
  Money,
  TodayGroupRow,
  TokenBuckets,
  UsageAmounts,
  WalletBundle,
  WalletError,
  WalletSnapshot,
} from './shared.ts'

const TIMEOUT_MS = 15_000
const LOG_PAGE_SIZE = 100
/** 热力图天数：4 行 × 7 列。 */
const HEAT_DAYS = 28
/** 缺失日逐日 stat 补探上限（每次 ~80ms）；「今天」豁免预算。超出预算的日期显示「无数据」。 */
const HEAT_FILL_MAX = 12
/**
 * 「这天没有消费」的复检间隔。零消费账号的每个历史日都会探一次，网关对空日期
 * 返回的是非 success，永远落不了「有数据」——不设这个窗口，它们每次刷新都会被重探。
 */
const HISTORY_NEGATIVE_TTL_MS = 30 * 60_000
/** 账号级并发。实测 5 账号 × 3 请求：串行 0.35s → 3 路 0.14s，5 路无额外收益。 */
const ACCOUNT_CONCURRENCY = 3
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

async function getJson(
  origin: string,
  path: string,
  apiKey: string | undefined,
  params: Record<string, string | number> = {},
  attempt = 0,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const url = new URL(path, origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const headers: Record<string, string> = { accept: 'application/json' }
    if (apiKey !== undefined && apiKey !== '') headers.authorization = `Bearer ${apiKey}`
    const response = await gatewayLimit(() => fetch(url, { headers, signal: controller.signal }))
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    // 429：实测只有短时间打爆总量才会出现（约 195 请求后，60s 恢复）。
    // 退避重试两次；401 不重试——那是令牌真的错了。
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after'))
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined
      if (shouldRetryNow(attempt, wait)) {
        await sleep(retryDelayMs(attempt, wait))
        return getJson(origin, path, apiKey, params, attempt + 1)
      }
      // 服务端要等太久（实测 99s）：不在这里干等，交给下一次轮询。
    }
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

/**
 * 汇率与换算单位。站点汇率一天也不会变，所以落盘缓存 10 分钟：
 * 旧实现每个账号每次刷新都打一次匿名 /api/status，5 账号就是 5 个多余请求，
 * 而且它正是被限流时最先 429 的那一个（429 会让面板误报「不是 New API」）。
 */
async function readUnits(origin: string): Promise<QuotaUnits> {
  const store = sharedStore()
  const cached = store?.getUnits(origin, Date.now())
  if (cached !== undefined) {
    return {
      quotaPerUnit: cached.quotaPerUnit,
      usdExchangeRate: cached.usdExchangeRate ?? 1,
      displayCurrency: cached.displayCurrency === 'USD' ? 'USD' : FALLBACK_CURRENCY,
    }
  }
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
    const units: QuotaUnits = {
      quotaPerUnit: quotaPerUnit > 0 ? quotaPerUnit : 500_000,
      usdExchangeRate: usdExchangeRate > 0 ? usdExchangeRate : 1,
      displayCurrency,
    }
    store?.setUnits(origin, {
      quotaPerUnit: units.quotaPerUnit,
      ...units.usdExchangeRate !== undefined ? { usdExchangeRate: units.usdExchangeRate } : {},
      ...units.displayCurrency !== undefined ? { displayCurrency: units.displayCurrency } : {},
    }, Date.now())
    return units
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

/** 访问令牌配置（从入口模块注入，避免 snapshot → index 模块环）。0.3.0 起多账号。 */
export interface AccessConfigSource {
  get(): { accounts?: unknown; accessToken?: string; refreshMs?: number; lowBalanceCny?: number } | undefined
}

let accessConfigSource: AccessConfigSource | undefined

/** 由入口模块在启动时注入（Config 的 volatile 引用）。 */
export function setAccessConfigSource(source: AccessConfigSource | undefined): void {
  accessConfigSource = source
}

/**
 * 查账凭据（New API 访问令牌）。只认本插件配置里的 accounts / 旧 accessToken ——
 * sk- 模型密钥是 LLM 路由的凭据，永远不参与查账。
 */
function accountTokens(): WalletAccount[] {
  return parseAccounts(accessConfigSource?.get())
}

/**
 * 把合并后的筛选令牌名翻译回某个账号自己的令牌名。
 * 客户端点「账号1 - token-a」时传的是合并名；账号 2 的账本里不该出现这个名字，
 * 所以去掉前缀后照常本地筛选（自然 0 行），不会误命中账号 2 的同名令牌。
 */
function tokenNameForAccount(filterToken: string | undefined, accountName: string): string | undefined {
  if (filterToken === undefined || filterToken === '') return undefined
  const prefix = accountName + ' - '
  return filterToken.startsWith(prefix) ? filterToken.slice(prefix.length) : filterToken
}

export async function listAccounts(ctx: Context): Promise<AccountListItem[]> {
  const { accounts: detected } = await newApiAccounts(ctx)
  const current = currentAccount(detected, ctx)
  const out: AccountListItem[] = []
  for (const account of detected) {
    const apiKey = await resolveApiKey(ctx, account.apiKeyEnv)
    const hasCredential = apiKey !== undefined && apiKey !== ''
    const hasAccessKey = accountTokens().length > 0
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
  models?: TodayGroupRow[]
  rate?: { rpm?: number; tpm?: number }
  reason?: string
  /** 今日 stat 的原始值，热力图「今天」格直接复用，不再单独打一次。 */
  todayPoint?: { quota: number; calls: number }
}

/**
 * 28 天窗口的小时行。一次 /api/data/self 同时供三处用：热力图的逐日聚合、
 * 历史日「探过即永久」的落盘来源、以及今日按模型的兜底。
 * 旧实现为今日模型又单独打了一次「今日窗口」的同名接口。
 */
async function readHours28(origin: string, accessKey: string): Promise<unknown[] | undefined> {
  const now = Date.now()
  const firstDayStart = localDayStartMs(now - (HEAT_DAYS - 1) * 86_400_000)
  try {
    const aggregate = await getJson(origin, '/api/data/self', accessKey, {
      start_timestamp: Math.floor(firstDayStart / 1000),
      end_timestamp: Math.floor(now / 1000),
      default_time: 'hour',
    })
    if (!isNewApiOk(aggregate.status, aggregate.body)) return undefined
    return Array.isArray(aggregate.body.data) ? aggregate.body.data : []
  } catch {
    return undefined
  }
}

/**
 * 今日实扣 + rpm/tpm。**只打 1 个请求**（/api/log/self/stat）：
 * 按模型的兜底改由 28 天窗口那份 data/self 响应里的今日小时行算出（见 modelsFromHours），
 * 旧实现为它又单独打了一次今日窗口的 data/self——5 账号就是 5 个纯浪费的请求。
 */
async function fetchToday(
  origin: string,
  accessKey: string,
  units: QuotaUnits,
  hours: unknown[] | undefined,
): Promise<TodayOutcome> {
  const now = Date.now()
  const from = Math.floor(localDayStartMs(now) / 1000)
  const to = Math.floor(now / 1000)
  const today = localDayString(now)

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
        outcome.todayPoint = { quota, calls: num(data.count) ?? 0 }
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
  } catch { /* 站点可能关闭了用户态统计，继续用今日小时行兜底 */ }

  // 2) 今日模型兜底：复用 28 天窗口响应里属于今天的小时行。
  if (hours !== undefined) {
    const byModel = modelsFromHours(hours, today)
    if (byModel.length > 0) {
      outcome.models = byModel
        .map(row => ({ ...row, amount: quotaToMoney(row.quota, units) }))
        .sort((a, b) => b.quota - a.quota)
      let quota = 0
      let requests = 0
      let tokens: number | undefined
      for (const row of byModel) {
        quota += row.quota
        requests += row.calls
        if (row.tokens !== undefined) tokens = (tokens ?? 0) + row.tokens
      }
      if (outcome.money === undefined && quota > 0) outcome.money = quotaToMoney(quota, units)
      if (outcome.requests === undefined && requests > 0) outcome.requests = requests
      if (tokens !== undefined) outcome.tokens = { ...outcome.tokens, totalTokens: tokens }
    }
  }

  if (outcome.money === undefined) outcome.reason = 'gateway-logs-unavailable'
  return outcome
}

/**
 * 从 /api/data/self 的小时行里取「某一天」的按模型聚合。
 * 热力图与「今日模型兜底」共用同一次 28 天窗口响应——旧实现为了今日模型又单独打一次今日窗口，
 * 同一个数据两次请求，是 5 账号 73 个请求里的一整块。
 */
export function modelsFromHours(rows: unknown[], today: string): TodayGroupRow[] {
  const byModel = new Map<string, { quota: number; calls: number; tokens: number }>()
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue
    const record = row as Record<string, unknown>
    const ms = epochMs(num(record.created_at))
    if (ms === undefined || localDayString(ms) !== today) continue
    const quota = num(record.quota) ?? 0
    const rowCalls = num(record.count) ?? 0
    const requestCount = num(record.request_count) ?? 0
    const tokens = num(record.token_used) ?? 0
    const model = typeof record.model_name === 'string' && record.model_name !== ''
      ? record.model_name
      : '未知模型'
    const calls = requestCount > 0 ? requestCount : rowCalls
    const hit = byModel.get(model)
    if (hit === undefined) byModel.set(model, { quota, calls, tokens })
    else {
      hit.quota += quota
      hit.calls += calls
      hit.tokens += tokens
    }
  }
  return [...byModel.entries()]
    .map(([name, value]) => ({ name, quota: value.quota, calls: value.calls, tokens: value.tokens }))
    .sort((a, b) => b.quota - a.quota)
}

/**
 * 近 4 周逐日消费（热力图口径）。**每个历史日只探一次，结果落盘永久**。
 *
 * 数据来源优先级（这就是 5 账号 73 请求里 46 个的由来，缓存后归零）：
 *   1. 本地 history 表命中（历史日的金额永远不会再变）→ 0 请求；
 *   2. 28 天窗口的小时行按本地日期分组（一次 data/self 覆盖全部 28 天）→ 命中即落盘；
 *   3. 上面两条都没有的历史日，才逐日打一次 stat 补探（预算 HEAT_FILL_MAX）；
 *   4. 「今天」永远用今日 stat（与头部实扣同源），且**不落盘**——它还会变。
 *
 * 补探按**从新到旧**花预算：旧实现从最老的一天往后花，安装后头几次刷新永远补不到
 * 最近三天（最该显示的日子），要凑满三四轮才补齐。
 *
 * 确认「这天没有消费」也是一条结果（available=false），同样落盘，
 * 否则零消费的日子每次刷新都会被重探，预算永远被它吃掉。
 */
async function fetchDailyHistory(
  origin: string,
  accountKey: string,
  accessKey: string,
  units: QuotaUnits,
  hours: unknown[] | undefined,
  todayPoint: { quota: number; calls: number } | undefined,
): Promise<DailyPoint[] | undefined> {
  const now = Date.now()
  const todayStr = localDayString(now)
  const store = sharedStore()

  const byDay = new Map<string, { quota: number; calls: number }>()
  for (const row of hours ?? []) {
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

  /** 升序的 28 天日期。 */
  const dates: string[] = []
  const dayStarts = new Map<string, number>()
  for (let i = HEAT_DAYS - 1; i >= 0; i--) {
    const dayStart = localDayStartMs(now - i * 86_400_000)
    const date = localDayString(dayStart)
    dates.push(date)
    dayStarts.set(date, dayStart)
  }

  /** date → 已确定的数字；null = 确认这天没有消费。 */
  const resolved = new Map<string, { quota: number; calls: number } | null>()
  const pending: string[] = []

  for (const date of dates) {
    const isToday = date === todayStr
    if (isToday) {
      // 今天：优先用本次已经打过的今日 stat，省掉一次请求。
      if (todayPoint !== undefined) resolved.set(date, todayPoint)
      else pending.push(date)
      continue
    }
    const stored = store?.getHistoryDay(origin, accountKey, date)
    if (stored !== undefined && (stored.available || now - (stored.at ?? 0) < HISTORY_NEGATIVE_TTL_MS)) {
      resolved.set(date, stored.available ? { quota: stored.quota, calls: stored.calls } : null)
      continue
    }
    const fromHour = byDay.get(date)
    if (fromHour !== undefined) {
      // 历史日的小时行是完整的，直接永久落盘；今天的小时行不完整，绝不落盘。
      store?.setHistoryDay(origin, accountKey, date, { quota: fromHour.quota, calls: fromHour.calls, available: true })
      resolved.set(date, fromHour)
      continue
    }
    pending.push(date)
  }

  // 从新到旧补探（倒序遍历）。今天不受预算限制，历史日共用预算。
  // 首次安装（近 4 周几乎全空）时一次补满：否则按每轮 12 个的预算要三轮才补齐，
  // 用户看到的热力图头两分钟缺一半——而这批请求一辈子只打一次。
  const missingDays = pending.filter((date) => date !== todayStr).length
  const firstFill = missingDays > HEAT_DAYS / 2
  let fillBudget = firstFill ? HEAT_DAYS : HEAT_FILL_MAX
  for (const date of [...pending].reverse()) {
    const isToday = date === todayStr
    if (!isToday) {
      if (fillBudget <= 0) continue
      fillBudget -= 1
    }
    const dayStart = dayStarts.get(date) ?? now
    try {
      const s0 = Math.floor(dayStart / 1000)
      const s1 = Math.min(s0 + 86_400, Math.floor(now / 1000))
      const stat = await getJson(origin, '/api/log/self/stat', accessKey, {
        type: 2,
        start_timestamp: s0,
        end_timestamp: s1,
      })
      if (!isNewApiOk(stat.status, stat.body)) {
        // 非 success 多半就是「这天没有记录」（零消费账号的每个历史日都这样）。
        // 记一条带时间戳的空结果，压到 30 分钟内不再重探；到期自动重试，不会永久钉死。
        if (!isToday) store?.setHistoryDay(origin, accountKey, date, { quota: 0, calls: 0, available: false })
        continue
      }
      const data = (stat.body.data ?? {}) as Record<string, unknown>
      const q = num(data.quota)
      const point = q !== undefined ? { quota: q, calls: num(data.count) ?? 0 } : null
      resolved.set(date, point)
      if (!isToday) {
        store?.setHistoryDay(origin, accountKey, date, {
          quota: point?.quota ?? 0,
          calls: point?.calls ?? 0,
          available: point !== null,
        })
      }
    } catch { /* 单日补探失败：留空，下次再试；不落盘（失败不是「没有消费」） */ }
  }

  let resolvedAny = false
  const points: DailyPoint[] = dates.map((date) => {
    const point = resolved.get(date)
    if (point !== undefined && point !== null) {
      resolvedAny = true
      return {
        date,
        available: true,
        quota: point.quota,
        calls: point.calls,
        amount: quotaToMoney(point.quota, units) ?? { quota: point.quota, currency: FALLBACK_CURRENCY },
      }
    }
    return { date, available: false, quota: 0 }
  })

  // 一条都拿不到（没有小时行、没有缓存、补探全失败）：当作热力图不可用。
  if (!resolvedAny && hours === undefined) return undefined
  return points
}


/* ------------------------------------------------------------------ */
/* 快照主体                                                             */
/* ------------------------------------------------------------------ */

async function readNewApi(
  account: RouteAccount,
  accessKey: string,
  filter: LedgerFilter = {},
): Promise<WalletSnapshot | WalletError> {
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

  // 28 天窗口的小时行：只打一次，供今日模型兜底 + 热力图 + 历史日落盘。
  const hours = await readHours28(account.origin, accessKey)
  const today = await fetchToday(account.origin, accessKey, units, hours)
  const todayOk = today.reason === undefined && today.money !== undefined

  // 全天账单：本地缓存 + 增量追加 + 本地筛选（详见 ledger.ts）。
  // 筛选只作用于右侧「今日用量」与「最近调用」；头部实扣与热力图恒为全天口径（用户拍板）。
  const accountKey = accountKeyForToken(accessKey)
  const ledger = await readLedger(account.origin, accountKey, accessKey, filter)
  // 逐条明细要带金额：客户端对 undefined 一律渲染「—」，整个金额列就空白了。
  // 账本缓存只存 quota 点数（单位换算依赖站点 /api/status，属于本层），所以在这里换成 Money。
  const recentCalls: CallRecord[] | undefined = ledger !== undefined && ledger.calls.length > 0
    ? ledger.calls.map((call) => ({
        createdAt: call.createdAt,
        ...call.model !== undefined ? { model: call.model } : {},
        quota: round6(call.quota),
        amount: quotaToMoney(round6(call.quota), units),
        promptTokens: call.promptTokens,
        completionTokens: call.completionTokens,
        cacheTokens: call.cacheTokens,
        cacheWriteTokens: call.cacheWriteTokens,
        requestId: call.requestId,
        ...call.group !== undefined ? { group: call.group } : {},
        ...call.tokenName !== undefined ? { tokenName: call.tokenName } : {},
      }))
    : undefined

  // 近 4 周逐日消费（热力图）。实测 /api/data/self 忽略筛选参数，所以它永远是全天口径。
  const dailyHistory = await fetchDailyHistory(account.origin, accountKey, accessKey, units, hours, today.todayPoint)

  // 今日 token 桶：四桶与合计一律来自全天账本行，彼此同源 —— 四桶之和恒等于合计，
  // 不再取 /api/data/self 的小时汇总（那个口径当前小时滞后，会让合计与三行对不上，是旧缺陷）。
  // 账本拿不到时才退回 data/self 的聚合值，并在页面上按缺字段呈现，不假装精确。
  let todayTokens: TokenBuckets | undefined
  let todayAmounts: UsageAmounts | undefined
  // 左侧两个列表的兜底：账本拿不到时才退回 /api/data/self 的模型聚合（同样全天口径）。
  let todayModels: TodayGroupRow[] | undefined = today.models
  let todayTokenRows: TodayGroupRow[] | undefined
  {
    // 「账本取到手了」与「筛选后还剩行」是两件事，必须分开判。
    // 旧写法拿 ledger.rows > 0 当「账本可用」，于是「模型 × 令牌」的空交集
    // （一条调用都没有）被误判成「账本不可用」：左列两个列表整块消失、
    // todayAmounts 一起丢，而「合计 token」退回全天 /api/data/self 的值——
    // 同一张表里「请求 0」与「合计 token 7961 万」并列，两个口径被缝在一起。
    // 空交集是**合法结果**，就该如实地显示成全 0。
    const led = ledger
    // 「请求」次数必须与四桶同源：筛选后若继续用未筛选的 data/self 聚合值，
    // 会出现「请求 1931 次」但四桶只有 19 行数据的自相矛盾。
    const requests = led !== undefined ? led.rows : today.requests
    const inputTokens = led?.inputTokens
    const outputTokens = led?.outputTokens
    const cacheReadTokens = led?.cacheReadTokens
    const cacheWriteTokens = led?.cacheWriteTokens
    const total = led !== undefined
      ? led.inputTokens + led.outputTokens + led.cacheReadTokens + led.cacheWriteTokens
      : today.tokens?.totalTokens
    const hasAny = inputTokens !== undefined || outputTokens !== undefined
      || cacheReadTokens !== undefined || cacheWriteTokens !== undefined
      || total !== undefined || requests !== undefined
    if (hasAny) {
      todayTokens = {
        ...(requests !== undefined ? { requests } : {}),
        ...(inputTokens !== undefined ? { inputTokens } : {}),
        ...(outputTokens !== undefined ? { outputTokens } : {}),
        ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
        ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}),
        ...(total !== undefined ? { totalTokens: total } : {}),
      }
    }
    if (led !== undefined) {
      // 金额四桶随筛选收窄；空交集时就是四个 0，仍要下发（否则右列金额列整片空白）。
      todayAmounts = {
        input: quotaToMoney(round6(led.amountQuota.input), units),
        output: quotaToMoney(round6(led.amountQuota.output), units),
        cacheRead: quotaToMoney(round6(led.amountQuota.cacheRead), units),
        cacheWrite: quotaToMoney(round6(led.amountQuota.cacheWrite), units),
        total: quotaToMoney(round6(led.amountQuota.total), units),
      }
      // 两个列表都走**全天**聚合（led.models / tokensByName 与 filter 无关），
      // 与四桶同源所以 quota 合计恒等于 todayAmounts.total —— 但它们不随筛选收窄。
      const groupRows = (map: Map<string, { quota: number; calls: number; tokens: number }>): TodayGroupRow[] =>
        [...map.entries()]
          .map(([name, row]) => ({
            name,
            quota: round6(row.quota),
            calls: row.calls,
            tokens: row.tokens,
            amount: quotaToMoney(round6(row.quota), units),
          }))
          .sort((a, b) => b.quota - a.quota)
      if (led.models.size > 0) todayModels = groupRows(led.models)
      if (led.tokensByName.size > 0) todayTokenRows = groupRows(led.tokensByName)
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
    // 空交集时它就是 0：0 是**结果**，不是「缺字段」，必须下发，否则右列数字自相矛盾。
    ...ledger !== undefined ? { todayLogRows: ledger.rows } : {},
    ...ledger !== undefined && ledger.truncated ? { todayLogsTruncated: true } : {},
    // 「今日 N 行」这里的 N 是**服务端**当日总行数，不是本地缓存行数——
    // 截断日要用它和「已统计 M 行」对比出漏了多少，否则这行状态永远自说自话。
    ...ledger !== undefined && (ledger.serverTotal ?? ledger.allRows) > 0
      ? { todayLedgerRows: ledger.serverTotal ?? ledger.allRows }
      : {},
    ...filter.model !== undefined || filter.token !== undefined
      ? { filter: { ...filter.model !== undefined ? { model: filter.model } : {}, ...filter.token !== undefined ? { token: filter.token } : {} } }
      : {},
    ...todayModels !== undefined && todayModels.length > 0 ? { todayModels } : {},
    ...todayTokenRows !== undefined && todayTokenRows.length > 0 ? { todayTokenRows } : {},
    ...recentCalls !== undefined && recentCalls.length > 0 ? { recentCalls } : {},
    ...today.rate !== undefined ? { rate: today.rate } : {},
    scheme: 'newapi',
    isAvailable: remaining?.quota === undefined || remaining.quota > 0,
  }
}

export async function fetchWallet(
  ctx: Context,
  route?: string,
  filter: LedgerFilter = {},
): Promise<WalletSnapshot | WalletError> {
  // accountForRoute 已经按 New API 指纹筛过（结果按 origin 缓存），所以这里不再重复探测。
  const account = await accountForRoute(ctx, route)
  if ('ok' in account && account.ok === false) return account

  // 查账凭据：只认 New API 访问令牌。sk- 模型密钥绝不发往用户级路由。
  const tokens = accountTokens()
  if (tokens.length === 0) {
    return { ok: false, error: 'no-access-token', detail: account.route }
  }

  // 账号级 3 路并发（mapPool 保序）。账号内部仍然串行，账本翻页自带 12 并发；
  // 3 是实测拐点：再多并发只是把网关的抖动叠在一起，还会更快撞到限流。
  const parts = await mapPool(tokens, ACCOUNT_CONCURRENCY, async (tokenAccount): Promise<AccountPart> => {
    const scoped = filter.token !== undefined
      ? { ...filter, token: tokenNameForAccount(filter.token, tokenAccount.name) }
      : filter
    try {
      return { name: tokenAccount.name, snapshot: await readNewApi(account, tokenAccount.token, scoped) }
    } catch (error) {
      const name = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'unreachable'
      return { name: tokenAccount.name, snapshot: { ok: false, error: name, detail: account.origin } }
    }
  })

  const merged = mergeSnapshots(parts, resolveLowBalanceCny())
  if (merged.ok !== true) return merged
  // 回显筛选：客户端据此高亮当前行（多账号时 token 是合并名）。
  merged.filter = {
    ...filter.model !== undefined ? { model: filter.model } : {},
    ...filter.token !== undefined ? { token: filter.token } : {},
    ...filter.account !== undefined ? { account: filter.account } : {},
  }
  return merged
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

/**
 * 余额偏低阈值（人民币）。缺省 5 元；负数夹到 0，上限 1,000,000 免得误填一串 0 把红点永久点亮。
 * 由宿主解析后随 bundle 下发——客户端不自己读配置。
 */
export function resolveLowBalanceCny(): number {
  const raw = accessConfigSource?.get()?.lowBalanceCny
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 5
  return Math.min(1_000_000, Math.max(0, raw))
}


export async function fetchBundle(
  ctx: Context,
  route?: string,
  filter: LedgerFilter = {},
): Promise<WalletBundle> {
  const accounts = await listAccounts(ctx)
  const selected = route !== undefined && accounts.some(account => account.route === route)
    ? route
    : accounts.find(account => account.isCurrent)?.route ?? accounts[0]?.route ?? ''
  // 多账号时每次刷新要打好几倍的网关请求，轮询下限抬到 30s。
  const refreshMs = accountTokens().length > 1
    ? Math.max(30_000, resolveRefreshMs())
    : resolveRefreshMs()
  return {
    accounts,
    selected,
    refreshMs,
    lowBalanceCny: resolveLowBalanceCny(),
    wallet: await fetchWallet(ctx, selected === '' ? undefined : selected, filter),
  }
}