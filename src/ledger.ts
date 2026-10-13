/**
 * 今日账单（/api/log/self?type=2）的本地缓存、增量追加与聚合。
 *
 * 为什么需要它：账本一天可能上万行（实测昨日 10,470 行 = 105 页 ≈ 9MB）。旧实现每次刷新
 * 都重拉 1000 行、且超过 1000 行的部分直接不算——今天 1,750 行就漏掉 42.6%（截图里
 * 「缓存命中 0」正是缓存命中全落在被截断的上午）。
 *
 * 现在的做法：
 *   - 冷启动：先取一页拿 total，按 total 自适应翻页（并发 6），封顶 LEDGER_MAX_PAGES 页。
 *     超限时置 truncated，页面明说「已统计最近 N 行」，不假装精确。
 *   - 增量：每行压成摘要存内存，以 request_id 为主键；之后只请求 created_at >= 上次最新，
 *     空闲时只回 1 行（约 1KB）。
 *   - 筛选（模型 / 令牌，AND 语义）在本地缓存上重算，切筛选零网关请求。
 *   - 缓存按 (origin, 本地日期) 键控，跨零点自然失效重建；顺手剔除其它日期条目。
 *
 * 实测依据（2026-10-13，公司 New API 网关）：
 *   - 行一旦出现即不再改写（8 次采样 11 行，0 次变动）→ 增量累加安全，无需覆盖更新。
 *   - request_id 全量 1,750 行均有且唯一 → 可作去重主键。
 *   - 行 `id` 会随查询窗口重置（全天窗口与 5 分钟窗口的首行都是 id=1），**不能**当主键。
 *   - /api/log/self 原生支持 model_name / token_name 且为 AND，但我们改在本地筛：
 *     切筛选不发请求，且不会因分页上限而漏掉早上那些行。
 */

/** 一行账单的摘要（内存缓存用）。字段名刻意短，因为一天可能存上万条。 */
export interface LedgerRow {
  /** request_id：唯一的稳定主键。 */
  id: string
  /** created_at（毫秒）。 */
  t: number
  /** 模型名。 */
  m?: string
  /** 令牌名（token_name）。 */
  k?: string
  /** 分组名。 */
  g?: string
  /** 本行实扣 quota。 */
  q: number
  /** 金额四分量（quota 点数），回缩后 q = i + o + r + w。 */
  i: number
  o: number
  r: number
  w: number
  /** token 四桶：未缓存输入 / 输出 / 缓存命中 / 缓存写入。 */
  pi: number
  po: number
  pr: number
  pw: number
}

/** 筛选条件：两者同时给出即为 AND。 */
export interface LedgerFilter {
  model?: string
  token?: string
}

/** 一行明细的展示形态（最近调用列表用）。 */
export interface LedgerCall {
  createdAt: number
  model?: string
  quota: number
  promptTokens: number
  completionTokens: number
  cacheTokens: number
  cacheWriteTokens: number
  requestId: string
  group?: string
  tokenName?: string
}

/** 聚合结果。四桶之和恒等于 total，token 四桶之和恒等于 totalTokens。 */
export interface LedgerTotals {
  /** 至少成功取到一页。 */
  ok: boolean
  /** 参与聚合的行数（已筛选后）。 */
  rows: number
  /** 未筛选的行数。 */
  allRows: number
  /** 服务端上报的今日总行数。 */
  serverTotal?: number
  /** 今日行数超过扫描上限，只统计了较新的一部分。 */
  truncated: boolean
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** 实扣 quota 四分量。 */
  amountQuota: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }
  /**
   * 按模型聚合。**全天口径，与 filter 无关** —— 它是左侧画像的候选列表，
   * 不能因为筛选而自我收窄（否则点一行就再也点不回别的）。
   */
  models: Map<string, { quota: number; calls: number; tokens: number }>
  /** 按令牌聚合。同样全天口径。 */
  tokensByName: Map<string, { quota: number; calls: number; tokens: number }>
  /** 最近若干条明细（筛选后，最新在前）。 */
  calls: LedgerCall[]
}

const PAGE_SIZE = 100
/**
 * 扫描上限（页）。**别调回 30**：那只有 3000 行，而本网关实测单日峰值 10,470 行
 * （2026-10-12，105 页），于是每天下午必然截断——头部「今日实扣」取全天 stat（真值），
 * 而「今日用量 / 按模型 / 合计」取这份被截断的账本，两者恒差一截，看起来像算错了。
 * 200 页 = 20,000 行，约为实测峰值的 2 倍；真超了仍明确标记截断，不静默失真。
 */
const MAX_PAGES = 200
/**
 * 翻页并发。实测 105 页（昨日全天）：并发 6 要 8.9s，并发 12 只要 0.7s，
 * 并发 18 是 0.15s——6 是这里的瓶颈，不是网关。取 12 留出余量。
 */
const CONCURRENCY = 12
/** 明细展示条数。 */
const CALLS_MAX = 30
const TIMEOUT_MS = 15_000

interface DayCache {
  day: string
  origin: string
  rows: Map<string, LedgerRow>
  /** 已拉到的最新 created_at（秒）。增量请求从这里起。 */
  newest: number
  serverTotal?: number
  truncated: boolean
  /** 冷启动是否已完成（拿到第一页即可算）。 */
  primed: boolean
}

const caches = new Map<string, DayCache>()

function cacheKey(origin: string, day: string): string {
  return origin + '|' + day
}

/** 本地日期 YYYY-MM-DD。 */
export function localDay(now = Date.now()): string {
  const d = new Date(now)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + mm + '-' + dd
}

function dayStartSeconds(now = Date.now()): number {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  return Math.floor(d.getTime() / 1000)
}

function num(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

/** 表达式计费解出的相对单价。 */
interface TokenPrice {
  p: number
  c: number
  cr: number
  cc: number
}

/** 解 other.expr_b64（base64 计费表达式）取四档单价系数；解不出时返回 undefined。 */
export function parsePrice(exprB64: unknown): TokenPrice | undefined {
  if (typeof exprB64 !== 'string' || exprB64 === '') return undefined
  let expression: string
  try {
    expression = Buffer.from(exprB64, 'base64').toString('utf8')
  } catch {
    return undefined
  }
  const price: TokenPrice = { p: 0, c: 0, cr: 0, cc: 0 }
  let hits = 0
  for (const match of expression.matchAll(/\b(cc|cr|p|c)\s*\*\s*([0-9.]+)/g)) {
    const value = Number(match[2])
    if (!Number.isFinite(value) || value < 0) continue
    price[match[1] as keyof TokenPrice] = value
    hits += 1
  }
  return hits === 0 ? undefined : price
}

/** 把一条服务端账单行压成摘要。返回 undefined = 这行不可用（缺 id / 时间）。 */
function toRow(record: Record<string, unknown>): LedgerRow | undefined {
  const id = typeof record.request_id === 'string' && record.request_id !== '' ? record.request_id : undefined
  const sec = num(record.created_at)
  if (id === undefined || sec === undefined || sec <= 0) return undefined
  const prompt = num(record.prompt_tokens) ?? 0
  const completion = num(record.completion_tokens) ?? 0
  let other: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(typeof record.other === 'string' ? record.other : '{}')
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) other = parsed as Record<string, unknown>
  } catch { /* other 不是合法 JSON：按缺失处理，金额整笔计入输入 */ }

  const cacheRead = Math.min(num(other.cache_tokens) ?? 0, prompt)
  // 同一笔在不同渠道下这两个键名二选一出现，实测共存时取值恒等。
  const cacheWrite = Math.min(num(other.cache_creation_tokens) ?? num(other.cache_write_tokens) ?? 0, prompt - cacheRead)
  const uncached = Math.max(prompt - cacheRead - cacheWrite, 0)
  const billed = num(record.quota) ?? 0

  // 分量权重：优先用表达式计费解出的真实单价；旧式 ratio 计费时退回旧口径。
  const price = parsePrice(other.expr_b64)
  const group = num(other.group_ratio) ?? num(other.user_group_ratio) ?? 1
  const wIn = price !== undefined ? uncached * price.p : uncached * (num(other.model_ratio) ?? 1) * group
  const wOut = price !== undefined ? completion * price.c : completion * (num(other.completion_ratio) ?? 1) * group
  const wRead = price !== undefined ? cacheRead * price.cr : cacheRead * (num(other.cache_ratio) ?? 0) * (num(other.model_ratio) ?? 1) * group
  const wWrite = price !== undefined ? cacheWrite * price.cc : 0
  const sum = wIn + wOut + wRead + wWrite
  let qi = 0, qo = 0, qr = 0, qw = 0
  if (billed > 0 && sum > 0) {
    const k = billed / sum
    qi = wIn * k; qo = wOut * k; qr = wRead * k; qw = wWrite * k
  } else if (billed > 0) {
    // 权重全为 0（既无表达式也无旧比例）：整笔计入输入，不丢合计。
    qi = billed
  }

  const model = typeof record.model_name === 'string' && record.model_name !== '' ? record.model_name : undefined
  const tokenName = typeof record.token_name === 'string' && record.token_name !== '' ? record.token_name : undefined
  const groupName = typeof record.group === 'string' && record.group !== '' ? record.group : undefined
  return {
    id,
    t: sec > 1e12 ? sec : sec * 1000,
    ...model !== undefined ? { m: model } : {},
    ...tokenName !== undefined ? { k: tokenName } : {},
    ...groupName !== undefined ? { g: groupName } : {},
    q: billed,
    i: qi, o: qo, r: qr, w: qw,
    pi: uncached, po: completion, pr: cacheRead, pw: cacheWrite,
  }
}

interface PageResult {
  ok: boolean
  items: Record<string, unknown>[]
  total?: number
}

async function fetchPage(
  origin: string,
  accessKey: string,
  params: Record<string, string | number>,
): Promise<PageResult> {
  const url = new URL('/api/log/self', origin)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', authorization: 'Bearer ' + accessKey },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => ({})) as Record<string, unknown>
    if (response.status < 200 || response.status >= 300) return { ok: false, items: [] }
    if (body.success === false || body.code === false) return { ok: false, items: [] }
    const payload = body.data
    const items = payload !== null && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items as Record<string, unknown>[]
      : Array.isArray(payload) ? payload as Record<string, unknown>[] : []
    const total = payload !== null && typeof payload === 'object'
      ? num((payload as { total?: unknown }).total)
      : undefined
    return { ok: true, items, ...total !== undefined ? { total } : {} }
  } catch {
    return { ok: false, items: [] }
  } finally {
    clearTimeout(timer)
  }
}

/** 把一批行塞进缓存。返回真正新增的行数。 */
function absorb(cache: DayCache, items: Record<string, unknown>[]): number {
  let added = 0
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue
    const row = toRow(item)
    if (row === undefined || cache.rows.has(row.id)) continue
    cache.rows.set(row.id, row)
    added += 1
    const sec = Math.floor(row.t / 1000)
    if (sec > cache.newest) cache.newest = sec
  }
  return added
}

/** 并发跑一批页号，把结果塞进缓存。 */
async function fetchPages(
  cache: DayCache,
  origin: string,
  accessKey: string,
  from: number,
  to: number,
  pages: number[],
): Promise<boolean> {
  let anyOk = false
  const queue = [...pages]
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const page = queue.shift()
      if (page === undefined) return
      const result = await fetchPage(origin, accessKey, {
        type: 2, p: page, page_size: PAGE_SIZE, start_timestamp: from, end_timestamp: to,
      })
      if (!result.ok) continue
      anyOk = true
      if (result.total !== undefined) cache.serverTotal = result.total
      absorb(cache, result.items)
    }
  })
  await Promise.all(workers)
  return anyOk
}

/**
 * 取到今日账本（必要时冷启动），返回缓存条目。失败时返回 undefined。
 * 第二次之后只做增量：请求 created_at >= 上次最新，空闲时只有 1 行。
 */
async function loadDay(origin: string, accessKey: string): Promise<DayCache | undefined> {
  const now = Date.now()
  const day = localDay(now)
  // 只保留今天的缓存：跨零点自然重建（用户确认的失效策略）。
  for (const [key, entry] of caches) {
    if (entry.day !== day) caches.delete(key)
  }
  const key = cacheKey(origin, day)
  let cache = caches.get(key)
  if (cache === undefined) {
    cache = { day, origin, rows: new Map(), newest: 0, truncated: false, primed: false }
    caches.set(key, cache)
  }

  const to = Math.floor(now / 1000)

  // 冷启动：先取第一页拿 total，决定翻几页。
  if (!cache.primed) {
    const first = await fetchPage(origin, accessKey, {
      type: 2, p: 1, page_size: PAGE_SIZE, start_timestamp: dayStartSeconds(now), end_timestamp: to,
    })
    if (!first.ok) return cache.rows.size > 0 ? cache : undefined
    cache.primed = true
    if (first.total !== undefined) cache.serverTotal = first.total
    // 行可能被同秒的新行挤到第二页，所以增量点取「本页最新 − 1 秒」。
    const before = cache.newest
    absorb(cache, first.items)
    if (before === 0 && cache.newest > 0) cache.newest = Math.max(cache.newest - 1, dayStartSeconds(now))

    const total = cache.serverTotal ?? first.items.length
    const wanted = Math.max(1, Math.ceil(total / PAGE_SIZE))
    const capped = Math.min(wanted, MAX_PAGES)
    cache.truncated = wanted > MAX_PAGES
    if (capped > 1) {
      const rest: number[] = []
      for (let page = 2; page <= capped; page++) rest.push(page)
      await fetchPages(cache, origin, accessKey, dayStartSeconds(now), to, rest)
    }
    return cache
  }

  // 增量：先补一次「全天第 1 页」拿权威的当日总行数，再取比缓存更新的行。
  //
  // 为什么不能只在冷启动记 total：那个值会随白天增长而过期。
  // 又为什么不能用增量窗口的 total：那个窗口不是全天，total 只数窗口内的行，
  // 拿它当「今日总行数」会让 footer 的「今日 N 行」在刷新后骤降到几十——
  // 比不显示更糟。所以权威总行数只能来自**全天窗口**的响应。
  const dayFrom = dayStartSeconds(now)
  const head = await fetchPage(origin, accessKey, {
    type: 2, p: 1, page_size: PAGE_SIZE, start_timestamp: dayFrom, end_timestamp: to,
  })
  if (head.ok) {
    if (head.total !== undefined) cache.serverTotal = head.total
    absorb(cache, head.items)
    // 同秒新行可能把旧行挤到第二页；增量点回退 1 秒，靠主键去重兜住重复。
    if (cache.rows.size > 0) cache.newest = Math.max(cache.newest - 1, dayFrom)
  }
  if (cache.serverTotal !== undefined) cache.truncated = cache.serverTotal > MAX_PAGES * PAGE_SIZE

  if (cache.newest > 0 && to > cache.newest) {
    let page = 1
    while (page <= MAX_PAGES) {
      const result = await fetchPage(origin, accessKey, {
        type: 2, p: page, page_size: PAGE_SIZE, start_timestamp: cache.newest, end_timestamp: to,
      })
      if (!result.ok) break
      absorb(cache, result.items)
      if (result.items.length < PAGE_SIZE) break
      page += 1
    }
  }
  return cache
}

/**
 * 聚合（带筛选）。筛选在本地做：切筛选不发任何网关请求，也不会像分页那样漏掉早上的行。
 * token 四桶与金额四分量之和都严格等于各自的合计——由加权回缩保证。
 */
export function aggregate(cache: DayCache, filter: LedgerFilter = {}): LedgerTotals {
  const wantModel = filter.model !== undefined && filter.model !== '' ? filter.model : undefined
  const wantToken = filter.token !== undefined && filter.token !== '' ? filter.token : undefined

  const out: LedgerTotals = {
    ok: true,
    rows: 0,
    allRows: cache.rows.size,
    ...cache.serverTotal !== undefined ? { serverTotal: cache.serverTotal } : {},
    truncated: cache.truncated,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    amountQuota: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    models: new Map(),
    tokensByName: new Map(),
    calls: [],
  }

  const all: LedgerRow[] = [...cache.rows.values()]
  // 明细按时间倒序；分组行稍后按金额排序。
  all.sort((a, b) => b.t - a.t)

  /** 累加一行到某个分组 Map（全天口径，不受 filter 影响）。 */
  const bump = (
    map: Map<string, { quota: number; calls: number; tokens: number }>,
    name: string,
    row: LedgerRow,
  ): void => {
    const tokens = row.pi + row.po + row.pr + row.pw
    const hit = map.get(name)
    if (hit === undefined) map.set(name, { quota: row.q, calls: 1, tokens })
    else {
      hit.quota += row.q
      hit.calls += 1
      hit.tokens += tokens
    }
  }

  for (const row of all) {
    // 分组先于筛选累加：左侧列表恒为全天画像。
    if (row.m !== undefined) bump(out.models, row.m, row)
    if (row.k !== undefined) bump(out.tokensByName, row.k, row)
    if (wantModel !== undefined && row.m !== wantModel) continue
    if (wantToken !== undefined && row.k !== wantToken) continue
    out.rows += 1
    out.inputTokens += row.pi
    out.outputTokens += row.po
    out.cacheReadTokens += row.pr
    out.cacheWriteTokens += row.pw
    out.amountQuota.input += row.i
    out.amountQuota.output += row.o
    out.amountQuota.cacheRead += row.r
    out.amountQuota.cacheWrite += row.w
    out.amountQuota.total += row.q
    if (out.calls.length < CALLS_MAX) {
      out.calls.push({
        createdAt: row.t,
        ...row.m !== undefined ? { model: row.m } : {},
        quota: row.q,
        promptTokens: row.pi + row.pr + row.pw,
        completionTokens: row.po,
        cacheTokens: row.pr,
        cacheWriteTokens: row.pw,
        requestId: row.id,
        ...row.g !== undefined ? { group: row.g } : {},
        ...row.k !== undefined ? { tokenName: row.k } : {},
      })
    }
  }
  return out
}

/** 取今日账本并聚合。取数完全失败时返回 undefined（调用方按缺数据显示）。 */
export async function readLedger(
  origin: string,
  accessKey: string,
  filter: LedgerFilter = {},
): Promise<LedgerTotals | undefined> {
  const cache = await loadDay(origin, accessKey)
  if (cache === undefined || !cache.primed) return undefined
  return aggregate(cache, filter)
}

