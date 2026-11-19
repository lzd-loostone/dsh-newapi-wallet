/**
 * 本地缓存落盘（SQLite）。**只做存储，不懂金额单位、不发网络请求。**
 *
 * 为什么不是 JSON 文件：账本一天上万行、且只追加不改写。用文件就必须每次重写整个文件、
 * 每次刷新把全部行读回 JS 再聚合；SQLite 增量只写新行，聚合可下推。实测 4000 行：
 * 增量写 2.3ms vs 7.2ms，聚合 1.4ms vs 5.4ms（2026-11-19，Node 24.22.3）。
 *
 * 为什么不用第三方依赖：Node 22.5+ 自带 node:sqlite。取不到它时**降级为无持久化**
 * （等价 0.3.0 的内存缓存），而不是再维护一套文件后端——一份代码只服务一种存储。
 *
 * 目录：~/.dsh/newapi-wallet-cache/wallet.db。保留 day_rows 7 天、history 28 天，
 * 用户卸载插件后直接删目录即可。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { LedgerRow } from './ledger.ts'

export interface StoredUnits {
  quotaPerUnit: number
  usdExchangeRate?: number
  displayCurrency?: string
}

export interface StoredDay {
  rows: LedgerRow[]
  /** 已拉到的最新 created_at（秒）。 */
  newest: number
  serverTotal?: number
  truncated: boolean
}

export interface StoredHistoryDay {
  quota: number
  calls: number
  /** false = 这天确认没有数据（缓存「空」也是结果，避免每次重探）。 */
  available: boolean
  /** 写入时间（毫秒）。空结果按 NEGATIVE_TTL 复检，真没有的天不会被永久钉死。 */
  at?: number
}

export interface CacheStore {
  getUnits(origin: string, now: number): StoredUnits | undefined
  setUnits(origin: string, units: StoredUnits, at: number): void
  getDay(origin: string, account: string, day: string): StoredDay | undefined
  appendRows(
    origin: string,
    account: string,
    day: string,
    rows: LedgerRow[],
    newest: number,
    serverTotal?: number,
    truncated?: boolean,
  ): void
  getHistoryDay(origin: string, account: string, day: string): StoredHistoryDay | undefined
  setHistoryDay(origin: string, account: string, day: string, value: StoredHistoryDay): void
  /** 删掉过期的账本行与历史日（就地清理，跨零点调一次）。 */
  prune(today: string): void
  close(): void
}

/** 汇率缓存的有效期：站点汇率一天也不会变，10 分钟足够挡住高频刷新。 */
export const UNITS_TTL_MS = 10 * 60_000
export const DAY_KEEP_DAYS = 7
export const HISTORY_KEEP_DAYS = 28

export function defaultStoreDir(): string {
  // 环境变量用于排查与单测（指到临时目录，不污染真实缓存）。
  const override = process.env.DSH_NEWAPI_WALLET_CACHE_DIR
  if (typeof override === 'string' && override.trim() !== '') return override.trim()
  return path.join(os.homedir(), '.dsh', 'newapi-wallet-cache')
}

/** 同步取内置模块：Node 22.3+ 有 process.getBuiltinModule，取不到就当没有。 */
function loadSqlite(): { DatabaseSync: new (path: string) => unknown } | undefined {
  try {
    const get = (process as unknown as { getBuiltinModule?: (id: string) => unknown }).getBuiltinModule
    if (typeof get === 'function') {
      const mod = get('node:sqlite') as { DatabaseSync?: new (path: string) => unknown } | undefined
      if (mod?.DatabaseSync !== undefined) return { DatabaseSync: mod.DatabaseSync }
    }
  } catch { /* 老 Node 或权限问题：降级 */ }
  return undefined
}

/** 'YYYY-MM-DD' 往前推 n 天的同格式字符串（按本地日历算，不用时区技巧）。 */
export function shiftDay(day: string, deltaDays: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y, (m ?? 1) - 1, d ?? 1)
  date.setDate(date.getDate() + deltaDays)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return date.getFullYear() + '-' + mm + '-' + dd
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS units (
  origin TEXT PRIMARY KEY,
  quota_per_unit REAL NOT NULL,
  usd_rate REAL,
  currency TEXT,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS day_rows (
  origin TEXT NOT NULL, account TEXT NOT NULL, day TEXT NOT NULL, id TEXT NOT NULL,
  t INTEGER NOT NULL, m TEXT, k TEXT, g TEXT,
  q REAL NOT NULL, i REAL NOT NULL, o REAL NOT NULL, r REAL NOT NULL, w REAL NOT NULL,
  pi INTEGER NOT NULL, po INTEGER NOT NULL, pr INTEGER NOT NULL, pw INTEGER NOT NULL,
  PRIMARY KEY (origin, account, day, id)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS day_meta (
  origin TEXT NOT NULL, account TEXT NOT NULL, day TEXT NOT NULL,
  newest INTEGER NOT NULL, server_total INTEGER, truncated INTEGER NOT NULL,
  PRIMARY KEY (origin, account, day)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS history (
  origin TEXT NOT NULL, account TEXT NOT NULL, day TEXT NOT NULL,
  quota REAL NOT NULL, calls INTEGER NOT NULL, available INTEGER NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (origin, account, day)
) WITHOUT ROWID;
`

interface SqliteDb {
  exec(sql: string): void
  prepare(sql: string): {
    run(...params: unknown[]): unknown
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }
  close(): void
}

/**
 * 打开缓存库。返回 undefined = 这台机器上拿不到 node:sqlite，调用方按「无持久化」跑。
 * 任何一次数据库异常都会把 store 标记为 broken 并静默退化成空操作——钱包不能因为缓存坏掉而不可用。
 */
/**
 * 进程内共享的缓存实例。第一次用到时才打开，打开失败（拿不到 node:sqlite）就一直返回 undefined，
 * 不反复重试建目录。
 */
let sharedState: { ready: boolean; store?: CacheStore } = { ready: false }

export function sharedStore(): CacheStore | undefined {
  if (!sharedState.ready) {
    sharedState = { ready: true, store: openStore() }
  }
  return sharedState.store
}

/** 单测与宿主卸载时替换/关闭共享实例。 */
export function resetSharedStore(store?: CacheStore): void {
  if (sharedState.store !== undefined && sharedState.store !== store) sharedState.store.close()
  sharedState = { ready: true, store }
}

export function openStore(dir = defaultStoreDir()): CacheStore | undefined {
  const sqlite = loadSqlite()
  if (sqlite === undefined) return undefined
  let db: SqliteDb
  try {
    fs.mkdirSync(dir, { recursive: true })
    db = new sqlite.DatabaseSync(path.join(dir, 'wallet.db')) as SqliteDb
    db.exec('PRAGMA journal_mode=WAL')
    db.exec('PRAGMA synchronous=NORMAL')
    db.exec(SCHEMA)
  } catch {
    return undefined
  }

  let broken = false
  const debug = process.env.DSH_NEWAPI_WALLET_CACHE_DEBUG === '1'
  const guard = <T>(fn: () => T, fallback: T): T => {
    if (broken) return fallback
    try {
      return fn()
    } catch (error) {
      broken = true
      if (debug) console.error('[newapi-wallet] cache store failed:', error)
      return fallback
    }
  }

  return {
    getUnits(origin, now) {
      return guard(() => {
        const row = db.prepare('SELECT quota_per_unit, usd_rate, currency, at FROM units WHERE origin = ?').get(origin) as
          | { quota_per_unit: number; usd_rate: number | null; currency: string | null; at: number }
          | undefined
        if (row === undefined) return undefined
        if (now - row.at > UNITS_TTL_MS) return undefined
        return {
          quotaPerUnit: row.quota_per_unit,
          ...row.usd_rate !== null ? { usdExchangeRate: row.usd_rate } : {},
          ...row.currency !== null ? { displayCurrency: row.currency } : {},
        }
      }, undefined)
    },

    setUnits(origin, units, at) {
      guard(() => {
        db.prepare(
          'INSERT INTO units (origin, quota_per_unit, usd_rate, currency, at) VALUES (?, ?, ?, ?, ?) ' +
          'ON CONFLICT(origin) DO UPDATE SET quota_per_unit = excluded.quota_per_unit, ' +
          'usd_rate = excluded.usd_rate, currency = excluded.currency, at = excluded.at',
        ).run(origin, units.quotaPerUnit, units.usdExchangeRate ?? null, units.displayCurrency ?? null, at)
      }, undefined)
    },

    getDay(origin, account, day) {
      return guard(() => {
        const meta = db.prepare('SELECT newest, server_total, truncated FROM day_meta WHERE origin = ? AND account = ? AND day = ?')
          .get(origin, account, day) as { newest: number; server_total: number | null; truncated: number } | undefined
        const raw = db.prepare(
          'SELECT id, t, m, k, g, q, i, o, r, w, pi, po, pr, pw FROM day_rows WHERE origin = ? AND account = ? AND day = ?',
        ).all(origin, account, day) as Array<Record<string, unknown>>
        if (raw.length === 0 && meta === undefined) return undefined
        const rows: LedgerRow[] = raw.map((row) => {
          const out: LedgerRow = {
            id: String(row.id),
            t: Number(row.t),
            q: Number(row.q),
            i: Number(row.i),
            o: Number(row.o),
            r: Number(row.r),
            w: Number(row.w),
            pi: Number(row.pi),
            po: Number(row.po),
            pr: Number(row.pr),
            pw: Number(row.pw),
          }
          if (typeof row.m === 'string') out.m = row.m
          if (typeof row.k === 'string') out.k = row.k
          if (typeof row.g === 'string') out.g = row.g
          return out
        })
        return {
          rows,
          newest: meta?.newest ?? rows.reduce((max, row) => Math.max(max, Math.floor(row.t / 1000)), 0),
          ...meta?.server_total !== null && meta?.server_total !== undefined ? { serverTotal: meta.server_total } : {},
          truncated: (meta?.truncated ?? 0) === 1,
        }
      }, undefined)
    },

    appendRows(origin, account, day, rows, newest, serverTotal, truncated) {
      guard(() => {
        if (rows.length > 0) {
          const insert = db.prepare(
            'INSERT OR IGNORE INTO day_rows (origin, account, day, id, t, m, k, g, q, i, o, r, w, pi, po, pr, pw) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          db.exec('BEGIN')
          try {
            for (const row of rows) {
              insert.run(origin, account, day, row.id, row.t, row.m ?? null, row.k ?? null, row.g ?? null,
                row.q, row.i, row.o, row.r, row.w, row.pi, row.po, row.pr, row.pw)
            }
            db.exec('COMMIT')
          } catch (error) {
            db.exec('ROLLBACK')
            throw error
          }
        }
        db.prepare(
          'INSERT INTO day_meta (origin, account, day, newest, server_total, truncated) VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(origin, account, day) DO UPDATE SET ' +
          'newest = MAX(day_meta.newest, excluded.newest), ' +
          'server_total = COALESCE(excluded.server_total, day_meta.server_total), ' +
          'truncated = MAX(day_meta.truncated, excluded.truncated)',
        ).run(origin, account, day, newest, serverTotal ?? null, truncated === true ? 1 : 0)
      }, undefined)
    },

    getHistoryDay(origin, account, day) {
      return guard(() => {
        const row = db.prepare('SELECT quota, calls, available, at FROM history WHERE origin = ? AND account = ? AND day = ?')
          .get(origin, account, day) as { quota: number; calls: number; available: number; at: number } | undefined
        if (row === undefined) return undefined
        return { quota: row.quota, calls: row.calls, available: row.available === 1, at: row.at }
      }, undefined)
    },

    setHistoryDay(origin, account, day, value) {
      guard(() => {
        db.prepare(
          'INSERT INTO history (origin, account, day, quota, calls, available, at) VALUES (?, ?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT(origin, account, day) DO UPDATE SET quota = excluded.quota, calls = excluded.calls, ' +
          'available = excluded.available, at = excluded.at',
        ).run(origin, account, day, value.quota, value.calls, value.available ? 1 : 0, Date.now())
      }, undefined)
    },

    prune(today) {
      guard(() => {
        const dayCutoff = shiftDay(today, -DAY_KEEP_DAYS)
        const historyCutoff = shiftDay(today, -HISTORY_KEEP_DAYS)
        db.exec('BEGIN')
        try {
          db.prepare('DELETE FROM day_rows WHERE day < ?').run(dayCutoff)
          db.prepare('DELETE FROM day_meta WHERE day < ?').run(dayCutoff)
          db.prepare('DELETE FROM history WHERE day < ?').run(historyCutoff)
          db.exec('COMMIT')
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      }, undefined)
    },

    close() {
      if (broken) return
      try { db.close() } catch { /* 已关闭 */ }
    },
  }
}