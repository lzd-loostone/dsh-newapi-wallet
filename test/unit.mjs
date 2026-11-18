/**
 * 离线单测：不需要网关、不需要 DSH。直接加载构建产物（lib/index.js / lib/client.js），
 * 断言纯函数与产物形状。跑法：npm run build && npm run test:unit
 *
 * 为什么要有这一层：test/harness.mjs 需要真实网关与访问令牌，TDD 时没法每次都跑；
 * 多账号改造里最容易静默出错的是「合并口径」和「缓存键」，它们都是纯函数，能离线钉死。
 */
import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const bundle = await import(pathToFileURL(path.join(HERE, '..', 'lib', 'index.js')).href)

const checks = []
function check(name, fn) {
  checks.push([name, fn])
}

/* ---------------- Task 1：账号解析与旧字段迁移 ---------------- */

check('accounts 字典按配置顺序解析成账号列表', () => {
  const out = bundle.parseAccounts({
    accounts: {
      a1: { name: '账号1', token: 'tk-1' },
      a2: { name: '账号2', token: 'tk-2' },
    },
  })
  assert.deepEqual(out.map((a) => [a.key, a.name, a.token]), [
    ['a1', '账号1', 'tk-1'],
    ['a2', '账号2', 'tk-2'],
  ])
})

check('空令牌的账号被丢弃', () => {
  const out = bundle.parseAccounts({
    accounts: { a1: { name: '账号1', token: 'tk-1' }, a2: { name: '账号2', token: '   ' } },
  })
  assert.deepEqual(out.map((a) => a.key), ['a1'])
})

check('名字为空时回退成「账号N」', () => {
  const out = bundle.parseAccounts({ accounts: { a1: { token: 'tk-1' } } })
  assert.equal(out[0].name, '账号1')
})

check('同一个令牌出现两次只保留第一条', () => {
  const out = bundle.parseAccounts({
    accounts: { a1: { name: 'A', token: 'same' }, a2: { name: 'B', token: 'same' } },
  })
  assert.deepEqual(out.map((a) => a.key), ['a1'])
})

check('最多 8 个账号', () => {
  const accounts = {}
  for (let i = 1; i <= 12; i++) accounts['a' + i] = { name: '账号' + i, token: 'tk-' + i }
  assert.equal(bundle.parseAccounts({ accounts }).length, 8)
})

check('只有旧 accessToken 时迁移成一个「默认账号」', () => {
  const out = bundle.parseAccounts({ accessToken: 'legacy-token' })
  assert.deepEqual(out.map((a) => [a.key, a.name, a.token]), [['legacy', '默认账号', 'legacy-token']])
})

check('accounts 非空时忽略旧 accessToken', () => {
  const out = bundle.parseAccounts({ accessToken: 'legacy-token', accounts: { a1: { name: 'A', token: 'tk-1' } } })
  assert.deepEqual(out.map((a) => a.key), ['a1'])
})

check('accountKeyForToken 稳定且不泄露明文', () => {
  const key = bundle.accountKeyForToken('secret-token')
  assert.equal(key, bundle.accountKeyForToken('secret-token'))
  assert.notEqual(key, bundle.accountKeyForToken('other-token'))
  assert.equal(key.length, 8)
  assert.ok(!key.includes('secret'))
})

/* ---------------- Task 2：配置结构与阈值 ---------------- */

/** volatile 字段在 Config 实例里是 Volatile 引用，读值要 .get()（与 src/index.ts 的 unwrapVolatile 同义）。 */
function unwrap(value) {
  return value !== null && typeof value === 'object' && typeof value.get === 'function' ? value.get() : value
}

check('Config：accounts 的 token 标了 secret（脱敏靠它）', () => {
  const json = bundle.Config.toJSON()
  const root = json.refs[json.uid]
  const accounts = json.refs[root.dict.accounts]
  const item = json.refs[accounts.inner]
  assert.equal(item.type, 'object')
  assert.equal(json.refs[item.dict.token].meta.role, 'secret')
})

check('Config：接受账号字典并保留令牌原值', () => {
  const value = bundle.Config({ accounts: { a1: { name: '账号1', token: 'tk-1' } }, lowBalanceCny: 3 })
  assert.equal(unwrap(value.accounts).a1.token, 'tk-1')
  assert.equal(unwrap(value.lowBalanceCny), 3)
})

check('Config：阈值缺省 5', () => {
  assert.equal(unwrap(bundle.Config({}).lowBalanceCny), 5)
})

check('resolveLowBalanceCny 缺省 5、非法回退、越界夹取', () => {
  bundle.setAccessConfigSource({ get: () => ({}) })
  assert.equal(bundle.resolveLowBalanceCny(), 5)
  bundle.setAccessConfigSource({ get: () => ({ lowBalanceCny: Number.NaN }) })
  assert.equal(bundle.resolveLowBalanceCny(), 5)
  bundle.setAccessConfigSource({ get: () => ({ lowBalanceCny: -3 }) })
  assert.equal(bundle.resolveLowBalanceCny(), 0)
  bundle.setAccessConfigSource({ get: () => ({ lowBalanceCny: 12.5 }) })
  assert.equal(bundle.resolveLowBalanceCny(), 12.5)
  bundle.setAccessConfigSource(undefined)
})

/* ---------------- Task 3/4：缓存键隔离与多账号合并 ---------------- */

const money = (display, quota) => ({ display, quota, currency: 'CNY' })
const snapA = {
  ok: true,
  fetchedAt: 1,
  route: 'r',
  displayName: 'r',
  origin: 'http://gw',
  scheme: 'newapi',
  remaining: money(100, 500),
  used: money(10, 50),
  today: { ...money(5, 25), requests: 3 },
  todayTokens: { requests: 3, inputTokens: 100, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 1, totalTokens: 116 },
  todayAmounts: { input: money(1, 5), output: money(2, 10), cacheRead: money(1, 5), cacheWrite: money(1, 5), total: money(5, 25) },
  dailyHistory: [
    { date: '2026-11-17', available: true, quota: 10, calls: 1, amount: money(0.02, 10) },
    { date: '2026-11-18', available: true, quota: 25, calls: 3, amount: money(0.05, 25) },
  ],
  todayLogRows: 3,
  todayLedgerRows: 3,
  todayModels: [{ name: 'gpt', quota: 25, calls: 3, tokens: 116, amount: money(5, 25) }],
  todayTokenRows: [{ name: 'token-a', quota: 25, calls: 3, tokens: 116, amount: money(5, 25) }],
  recentCalls: [
    { createdAt: 1000, model: 'gpt', amount: money(1, 5), tokenName: 'token-a' },
    { createdAt: 998, model: 'gpt', amount: money(1, 5), tokenName: 'token-a' },
    { createdAt: 997, model: 'gpt', amount: money(1, 5), tokenName: 'token-a' },
  ],
  todayAvailable: true,
}
const snapB = {
  ok: true,
  fetchedAt: 1,
  route: 'r',
  displayName: 'r',
  origin: 'http://gw',
  scheme: 'newapi',
  remaining: money(50, 250),
  used: money(20, 100),
  today: { ...money(7, 35), requests: 4 },
  todayTokens: { requests: 4, inputTokens: 200, outputTokens: 20, cacheReadTokens: 7, cacheWriteTokens: 2, totalTokens: 229 },
  todayAmounts: { input: money(2, 10), output: money(3, 15), cacheRead: money(1, 5), cacheWrite: money(1, 5), total: money(7, 35) },
  dailyHistory: [
    { date: '2026-11-17', available: true, quota: 5, calls: 2, amount: money(0.01, 5) },
    { date: '2026-11-18', available: true, quota: 35, calls: 4, amount: money(0.07, 35) },
  ],
  todayLogRows: 4,
  todayLedgerRows: 4,
  todayModels: [{ name: 'gpt', quota: 30, calls: 2, tokens: 100, amount: money(6, 30) }, { name: 'claude', quota: 5, calls: 2, tokens: 129, amount: money(1, 5) }],
  todayTokenRows: [{ name: 'token-a', quota: 20, calls: 2, tokens: 100, amount: money(4, 20) }, { name: 'company', quota: 15, calls: 2, tokens: 129, amount: money(3, 15) }],
  recentCalls: [
    { createdAt: 1002, model: 'claude', amount: money(2, 10), tokenName: 'company' },
    { createdAt: 1001, model: 'gpt', amount: money(1, 5), tokenName: 'token-a' },
  ],
  todayAvailable: true,
}

check('账本缓存键包含账号指纹（不同账号不串账）', () => {
  const a = bundle.cacheKeyForTest('http://gw', 'aaaa1111', '2026-11-18')
  const b = bundle.cacheKeyForTest('http://gw', 'bbbb2222', '2026-11-18')
  assert.notEqual(a, b)
  assert.equal(a, bundle.cacheKeyForTest('http://gw', 'aaaa1111', '2026-11-18'))
})

check('mergeMoney：求和且不伪造缺失字段', () => {
  assert.equal(bundle.mergeMoney([undefined, undefined]), undefined)
  const only = bundle.mergeMoney([{ display: 1 }, { display: 2 }])
  assert.equal(only.display, 3)
  assert.equal(only.quota, undefined)
  const both = bundle.mergeMoney([money(1, 500), money(2, 1000)])
  assert.equal(both.display, 3)
  assert.equal(both.quota, 1500)
  assert.equal(both.currency, 'CNY')
})

check('mergeSnapshots：余额/累计/今日/四桶相加', () => {
  const merged = bundle.mergeSnapshots([
    { name: '账号1', snapshot: snapA },
    { name: '账号2', snapshot: snapB },
  ], 5)
  assert.equal(merged.remaining.display, 150)
  assert.equal(merged.remaining.quota, 750)
  assert.equal(merged.used.display, 30)
  assert.equal(merged.today.display, 12)
  assert.equal(merged.today.requests, 7)
  assert.equal(merged.todayTokens.requests, 7)
  assert.equal(merged.todayTokens.inputTokens, 300)
  assert.equal(merged.todayTokens.totalTokens, 345)
  assert.equal(merged.todayAmounts.input.display, 3)
  assert.equal(merged.todayAmounts.total.display, 12)
})

check('mergeSnapshots：按模型合并、按令牌带账号名', () => {
  const merged = bundle.mergeSnapshots([
    { name: '账号1', snapshot: snapA },
    { name: '账号2', snapshot: snapB },
  ], 5)
  const gpt = merged.todayModels.find((row) => row.name === 'gpt')
  assert.equal(gpt.quota, 55)
  assert.equal(gpt.calls, 5)
  assert.equal(gpt.tokens, 216)
  const rows = merged.todayTokenRows.map((row) => row.name).sort()
  assert.deepEqual(rows, ['账号1 - token-a', '账号2 - company', '账号2 - token-a'])
  const tagged = merged.todayTokenRows.find((row) => row.name === '账号2 - token-a')
  assert.equal(tagged.account, '账号2')
  assert.equal(tagged.quota, 20)
})

check('mergeSnapshots：热力图按日期相加、行数相加、明细按时间倒序取 30', () => {
  const merged = bundle.mergeSnapshots([
    { name: '账号1', snapshot: snapA },
    { name: '账号2', snapshot: snapB },
  ], 5)
  const day = merged.dailyHistory.find((point) => point.date === '2026-11-17')
  assert.equal(day.quota, 15)
  assert.equal(day.calls, 3)
  assert.equal(merged.todayLogRows, 7)
  assert.deepEqual(merged.recentCalls.map((call) => call.createdAt), [1002, 1001, 1000, 998, 997])
})

check('mergeSnapshots：部分失败仍合并，失败账号单列', () => {
  const merged = bundle.mergeSnapshots([
    { name: '账号1', snapshot: snapA },
    { name: '账号2', snapshot: { ok: false, error: 'unauthorized' } },
    { name: '账号3', snapshot: snapB },
  ], 5)
  assert.equal(merged.remaining.display, 150)
  assert.deepEqual(merged.accountFailures, [{ name: '账号2', error: 'unauthorized' }])
  assert.equal(merged.accounts.length, 3)
  assert.equal(merged.accounts[1].error, 'unauthorized')
  assert.equal(merged.accounts[1].remaining, undefined)
})

check('mergeSnapshots：全失败时返回错误', () => {
  const merged = bundle.mergeSnapshots([
    { name: '账号1', snapshot: { ok: false, error: 'unauthorized' } },
  ], 5)
  assert.equal(merged.ok, false)
  assert.equal(merged.error, 'unauthorized')
})

check('mergeSnapshots：账号分项带余额与今日', () => {
  const merged = bundle.mergeSnapshots([
    { name: '账号1', snapshot: snapA },
    { name: '账号2', snapshot: snapB },
  ], 5)
  assert.deepEqual(merged.accounts.map((row) => [row.name, row.remaining.display, row.today.display]), [
    ['账号1', 100, 5],
    ['账号2', 50, 7],
  ])
})

/* ---------------- Task 6：红点口径（客户端纯函数） ---------------- */

const client = await (async () => {
  const fs = await import('node:fs')
  const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
  let loaded
  const fakeReact = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    jsx: (type, props) => ({ type, props }),
    jsxs: (type, props) => ({ type, props }),
    Fragment: 'Fragment',
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {}, useLayoutEffect: () => {}, useRef: () => ({ current: null }),
  }
  const require = (name) => {
    if (name === 'react' || name === 'react/jsx-runtime') return fakeReact
    throw new Error('unexpected require: ' + name)
  }
  const sandbox = { window: { __ModuleLoader__: { load: (entry) => { loaded = entry } } } }
  new Function('window', source)(sandbox.window)
  return loaded.factory(require)
})()

check('anyAccountLow：任一账号低于阈值即亮（合计高也亮）', () => {
  const accounts = [
    { name: '账号1', remaining: { display: 500, quota: 2500, currency: 'CNY' } },
    { name: '账号2', remaining: { display: 3, quota: 15, currency: 'CNY' } },
  ]
  assert.equal(client.anyAccountLow(accounts, 5), true)
  assert.equal(client.anyAccountLow(accounts, 2), false)
  assert.equal(client.anyAccountLow(undefined, 5), false)
  assert.equal(client.anyAccountLow([], 5), false)
})

check('anyAccountLow：失败的账号（无余额）不点红点', () => {
  assert.equal(client.anyAccountLow([{ name: '账号1', error: 'unauthorized' }], 5), false)
})

/* ---------------- 运行 ---------------- */

let failed = 0
for (const [name, fn] of checks) {
  try {
    fn()
    console.log('  ✓ ' + name)
  } catch (error) {
    failed += 1
    console.log('  ✗ ' + name + '：' + (error instanceof Error ? error.message : String(error)))
  }
}
console.log(failed === 0 ? '\n全部通过（' + checks.length + ' 项）' : '\n失败 ' + failed + ' / ' + checks.length + ' 项')
process.exit(failed === 0 ? 0 : 1)