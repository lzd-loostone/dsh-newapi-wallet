/**
 * 多账号合并：把每个账号单独取到的 WalletSnapshot 合成一份给浏览器看的快照。
 *
 * 口径（用户拍板，别改）：
 *   - 余额 / 累计 / 今日 / 四桶金额 / 热力图：逐项相加；
 *   - 今日按模型：按模型名相加，不区分账号（同名模型跨账号也应看成一个模型）；
 *   - 今日按令牌：按账号分开，行名「账号1 - 令牌名」，并带 account 字段；只有一个成功账号时不加前缀，
 *     保持单账号的老样子；
 *   - 最近明细：合并后按时间倒序取 30 条；
 *   - 任一账号失败不影响其它账号，失败账号单列在 accountFailures / accounts[] 里；
 *   - 全部失败才整体失败。
 *
 * 为什么在宿主侧合并：金额换算依赖站点 /api/status，账本缓存按账号隔离，客户端不该碰这些。
 */
import type {
  AccountBalance,
  CallRecord,
  DailyPoint,
  Money,
  TodayGroupRow,
  TokenBuckets,
  UsageAmounts,
  WalletError,
  WalletSnapshot,
} from './shared.ts'

/** 明细展示条数（与 ledger.ts 的 CALLS_MAX 一致）。 */
const CALLS_MAX = 30

/** 一个账号的取数结果：成功带 name + 快照，失败带 name + 错误。 */
export interface AccountPart {
  name: string
  snapshot: WalletSnapshot | WalletError
}

function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6
}

function sumDefined(values: Array<number | undefined>): number | undefined {
  let total: number | undefined
  for (const value of values) {
    if (value === undefined || !Number.isFinite(value)) continue
    total = (total ?? 0) + value
  }
  return total === undefined ? undefined : total
}

/**
 * 金额相加。字段逐个处理：某账号没给出 quota 就不凭空造 0（缺字段与 0 在界面上是两种含义）；
 * usd 只在下发的每一份都有时才相加，否则宁可不给（避免半真半假）。
 */
export function mergeMoney(list: Array<Money | undefined>): Money | undefined {
  const present = list.filter((money): money is Money => money !== undefined && money !== null)
  if (present.length === 0) return undefined
  const out: Money = {}
  if (present.some((money) => money.quota !== undefined)) {
    out.quota = round6(present.reduce((sum, money) => sum + (money.quota ?? 0), 0))
  }
  if (present.some((money) => money.display !== undefined)) {
    out.display = round6(present.reduce((sum, money) => sum + (money.display ?? 0), 0))
  }
  const currency = present.find((money) => money.currency !== undefined)?.currency
  if (currency !== undefined) out.currency = currency
  if (present.every((money) => money.usd !== undefined)) {
    out.usd = round6(present.reduce((sum, money) => sum + (money.usd ?? 0), 0))
  }
  return out
}

function mergeBuckets(list: Array<TokenBuckets | undefined>): TokenBuckets | undefined {
  const present = list.filter((buckets): buckets is TokenBuckets => buckets !== undefined)
  if (present.length === 0) return undefined
  const out: TokenBuckets = {}
  const fields: Array<keyof TokenBuckets> = ['requests', 'inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']
  for (const field of fields) {
    const total = sumDefined(present.map((buckets) => buckets[field]))
    if (total !== undefined) out[field] = total
  }
  return out
}

function mergeAmounts(list: Array<UsageAmounts | undefined>): UsageAmounts | undefined {
  const present = list.filter((amounts): amounts is UsageAmounts => amounts !== undefined)
  if (present.length === 0) return undefined
  const out: UsageAmounts = {}
  const fields: Array<keyof UsageAmounts> = ['input', 'output', 'cacheRead', 'cacheWrite', 'total']
  let any = false
  for (const field of fields) {
    const merged = mergeMoney(present.map((amounts) => amounts[field]))
    if (merged !== undefined) {
      out[field] = merged
      any = true
    }
  }
  return any ? out : undefined
}

function mergeHistory(list: Array<WalletSnapshot['dailyHistory']>): DailyPoint[] | undefined {
  const byDate = new Map<string, DailyPoint>()
  for (const history of list) {
    for (const point of history ?? []) {
      const hit = byDate.get(point.date)
      if (hit === undefined) {
        byDate.set(point.date, { ...point, ...(point.amount !== undefined ? { amount: { ...point.amount } } : {}) })
        continue
      }
      hit.quota = round6(hit.quota + point.quota)
      if (point.calls !== undefined) hit.calls = (hit.calls ?? 0) + point.calls
      // 只要有一个账号能给出这天，就当有数据：缺的账号按 0 计，不把整天标成「无数据」。
      hit.available = hit.available || point.available
      const amount = mergeMoney([hit.amount, point.amount])
      if (amount !== undefined) hit.amount = amount
    }
  }
  if (byDate.size === 0) return undefined
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

function accumulateRow(map: Map<string, TodayGroupRow>, row: TodayGroupRow): void {
  const hit = map.get(row.name)
  if (hit === undefined) {
    map.set(row.name, { ...row, ...(row.amount !== undefined ? { amount: { ...row.amount } } : {}) })
    return
  }
  hit.quota = round6(hit.quota + row.quota)
  hit.calls += row.calls
  if (row.tokens !== undefined) hit.tokens = (hit.tokens ?? 0) + row.tokens
  const amount = mergeMoney([hit.amount, row.amount])
  if (amount !== undefined) hit.amount = amount
}

/** 合并多个账号的快照。全部失败时返回错误（保留第一个错误码，细节列出每个账号）。 */
export function mergeSnapshots(parts: AccountPart[], _lowBalanceCny = 5): WalletSnapshot | WalletError {
  const okParts = parts.filter((part): part is { name: string; snapshot: WalletSnapshot } => part.snapshot.ok === true)
  const failures = parts
    .filter((part) => part.snapshot.ok !== true)
    .map((part) => ({ name: part.name, error: (part.snapshot as WalletError).error }))

  if (okParts.length === 0) {
    const first = failures[0]
    return {
      ok: false,
      error: first?.error ?? 'unauthorized',
      ...(failures.length > 1 ? { detail: failures.map((failure) => failure.name + '：' + failure.error).join('；') } : {}),
    }
  }

  // 只要配置了多个账号就给令牌行加账号前缀：某个账号失败时，剩下的行也能看出属于谁。
  const multi = parts.length > 1
  const first = okParts[0].snapshot
  const accounts: AccountBalance[] = parts.map((part) => {
    if (part.snapshot.ok !== true) return { name: part.name, error: part.snapshot.error }
    const snapshot = part.snapshot
    return {
      name: part.name,
      ...(snapshot.remaining !== undefined ? { remaining: snapshot.remaining } : {}),
      ...(snapshot.today !== undefined ? { today: snapshot.today } : {}),
      ...(snapshot.used !== undefined ? { used: snapshot.used } : {}),
    }
  })

  const todayMoney = mergeMoney(okParts.map((part) => part.snapshot.today))
  const requests = sumDefined(okParts.map((part) => part.snapshot.today?.requests))
  const today: (Money & { requests?: number }) | undefined = todayMoney === undefined
    ? undefined
    : requests === undefined ? todayMoney : { ...todayMoney, requests }

  const models = new Map<string, TodayGroupRow>()
  for (const part of okParts) {
    for (const row of part.snapshot.todayModels ?? []) accumulateRow(models, row)
  }

  const tokenRows: TodayGroupRow[] = []
  for (const part of okParts) {
    for (const row of part.snapshot.todayTokenRows ?? []) {
      tokenRows.push(multi
        ? { ...row, name: part.name + ' - ' + row.name, account: part.name }
        : row)
    }
  }

  const calls: CallRecord[] = []
  for (const part of okParts) {
    for (const call of part.snapshot.recentCalls ?? []) {
      calls.push(multi ? { ...call, account: part.name } : call)
    }
  }
  calls.sort((a, b) => b.createdAt - a.createdAt)

  const merged: WalletSnapshot = {
    ok: true,
    fetchedAt: Math.max(...okParts.map((part) => part.snapshot.fetchedAt)),
    route: first.route,
    displayName: first.displayName,
    origin: first.origin,
    ...(first.scheme !== undefined ? { scheme: first.scheme } : {}),
    ...(first.model !== undefined ? { model: first.model } : {}),
    ...(first.keyName !== undefined ? { keyName: first.keyName } : {}),
    ...(first.keyHint !== undefined ? { keyHint: first.keyHint } : {}),
    ...(mergeMoney(okParts.map((part) => part.snapshot.remaining)) !== undefined
      ? { remaining: mergeMoney(okParts.map((part) => part.snapshot.remaining)) } : {}),
    ...(mergeMoney(okParts.map((part) => part.snapshot.used)) !== undefined
      ? { used: mergeMoney(okParts.map((part) => part.snapshot.used)) } : {}),
    ...(today !== undefined ? { today } : {}),
    ...(mergeBuckets(okParts.map((part) => part.snapshot.todayTokens)) !== undefined
      ? { todayTokens: mergeBuckets(okParts.map((part) => part.snapshot.todayTokens)) } : {}),
    ...(mergeAmounts(okParts.map((part) => part.snapshot.todayAmounts)) !== undefined
      ? { todayAmounts: mergeAmounts(okParts.map((part) => part.snapshot.todayAmounts)) } : {}),
    ...(mergeHistory(okParts.map((part) => part.snapshot.dailyHistory)) !== undefined
      ? { dailyHistory: mergeHistory(okParts.map((part) => part.snapshot.dailyHistory)) } : {}),
    ...(sumDefined(okParts.map((part) => part.snapshot.todayLogRows)) !== undefined
      ? { todayLogRows: sumDefined(okParts.map((part) => part.snapshot.todayLogRows)) } : {}),
    ...(okParts.some((part) => part.snapshot.todayLogsTruncated === true) ? { todayLogsTruncated: true } : {}),
    ...(sumDefined(okParts.map((part) => part.snapshot.todayLedgerRows)) !== undefined
      ? { todayLedgerRows: sumDefined(okParts.map((part) => part.snapshot.todayLedgerRows)) } : {}),
    ...(models.size > 0 ? { todayModels: [...models.values()].sort((a, b) => b.quota - a.quota) } : {}),
    ...(tokenRows.length > 0 ? { todayTokenRows: tokenRows.sort((a, b) => b.quota - a.quota) } : {}),
    ...(calls.length > 0 ? { recentCalls: calls.slice(0, CALLS_MAX) } : {}),
    ...(!multi && first.rate !== undefined ? { rate: first.rate } : {}),
    ...(first.todayUnavailableReason !== undefined ? { todayUnavailableReason: first.todayUnavailableReason } : {}),
    todayAvailable: okParts.some((part) => part.snapshot.todayAvailable),
    accounts,
    ...(failures.length > 0 ? { accountFailures: failures } : {}),
    ...(mergeMoney(okParts.map((part) => part.snapshot.remaining))?.quota !== undefined
      ? { isAvailable: (mergeMoney(okParts.map((part) => part.snapshot.remaining))?.quota ?? 0) > 0 }
      : {}),
  }
  return merged
}
