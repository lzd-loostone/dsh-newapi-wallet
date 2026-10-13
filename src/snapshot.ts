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

/** 访问令牌配置（从入口模块注入，避免 snapshot → index 模块环）。0.2.2 起全站唯一。 */
export interface AccessConfigSource {
  get(): { accessToken?: string; refreshMs?: number } | undefined
}

let accessConfigSource: AccessConfigSource | undefined

/** 由入口模块在启动时注入（Config 的 volatile 引用）。 */
export function setAccessConfigSource(source: AccessConfigSource | undefined): void {
  accessConfigSource = source
}

/**
 * 查账凭据（New API 访问令牌）。只认 accessToken 一个来源 ——
 * sk- 模型密钥是 LLM 路由的凭据，永远不参与查账。
 */
function accessKey(): string | undefined {
  const token = accessConfigSource?.get()?.accessToken
  return typeof token === 'string' && token.trim() !== '' ? token.trim() : undefined
}

export async function listAccounts(ctx: Context): Promise<AccountListItem[]> {
  const { accounts: detected } = await newApiAccounts(ctx)
  const current = currentAccount(detected, ctx)
  const out: AccountListItem[] = []
  for (const account of detected) {
    const apiKey = await resolveApiKey(ctx, account.apiKeyEnv)
    const hasCredential = apiKey !== undefined && apiKey !== ''
    const hasAccessKey = accessKey() !== undefined
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
      const byModel = new Map<string, TodayGroupRow>()
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
          byModel.set(model, { name: model, quota: rowQuota, calls: rowCalls, ...(rowTokens !== undefined ? { tokens: rowTokens } : {}) })
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

  const today = await fetchToday(account.origin, accessKey, units)
  const todayOk = today.reason === undefined && today.money !== undefined

  // 全天账单：本地缓存 + 增量追加 + 本地筛选（详见 ledger.ts）。
  // 筛选只作用于右侧「今日用量」与「最近调用」；头部实扣与热力图恒为全天口径（用户拍板）。
  const ledger = await readLedger(account.origin, accessKey, filter)
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
  const dailyHistory = await fetchDailyHistory(account.origin, accessKey, units)

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
  const token = accessKey()
  if (token === undefined) {
    return { ok: false, error: 'no-access-token', detail: account.route }
  }

  try {
    return await readNewApi(account, token, filter)
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


export async function fetchBundle(
  ctx: Context,
  route?: string,
  filter: LedgerFilter = {},
): Promise<WalletBundle> {
  const accounts = await listAccounts(ctx)
  const selected = route !== undefined && accounts.some(account => account.route === route)
    ? route
    : accounts.find(account => account.isCurrent)?.route ?? accounts[0]?.route ?? ''
  return {
    accounts,
    selected,
    refreshMs: resolveRefreshMs(),
    wallet: await fetchWallet(ctx, selected === '' ? undefined : selected, filter),
  }
}
