/**
 * 离线端到端验证：不启动 DSH，用最小假 Cordis 上下文加载构建好的 lib/index.js，
 * 走完「settings 注册 → 解析访问令牌 → 打真实网关 → 回环路由出账本」全链路。
 * 令牌只从环境变量 DSH_TEST_TOKEN 读取，绝不写盘、绝不打印。
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const TOKEN = process.env.DSH_TEST_TOKEN
const ORIGIN = process.env.DSH_TEST_ORIGIN
const ROUTE = process.env.DSH_TEST_ROUTE || 'test-route'
if (typeof TOKEN !== 'string' || TOKEN === '' || typeof ORIGIN !== 'string' || ORIGIN === '') {
  console.log('usage: DSH_TEST_TOKEN=<access token> DSH_TEST_ORIGIN=<gateway base URL> [DSH_TEST_ROUTE=<route>] node test/harness.mjs')
  process.exit(2)
}
// A clearly fake placeholder key: proves sk- credentials only reach the probe, never ledger requests.
const FAKE_SK = 'sk-test-not-a-real-key'
const KEY_ENV = 'DSH_TEST_MODEL_KEY_ENV'
const SETTINGS_NS = 'llm-test'
if (typeof TOKEN !== 'string' || TOKEN === '') { console.log('缺少 DSH_TEST_TOKEN'); process.exit(2) }
const HERE = path.dirname(new URL(import.meta.url).pathname).replace(/^\/(\w:)/, '$1')
const bundle = await import(pathToFileURL(path.join(HERE, '..', 'lib', 'index.js')).href)

const registered = {}
let walletHandler = null
const logs = []
const llmProfile = { providers: { [ROUTE]: { baseURL: ORIGIN, apiKeyEnv: KEY_ENV } } }

const fakeSettings = {
  register(ns, schema, options) {
    if (typeof schema !== 'function') throw new TypeError('schema is not a function')
    registered[ns] = { schema, options }
    return {
      get() { return schema({ ...options?.base, accessToken: TOKEN, routeAccessTokens: { [ROUTE]: TOKEN }, refreshMs: 15000 }) },
      update() { return Promise.resolve() },
      watch() { return () => {} },
    }
  },
  get(ns) { return ns === SETTINGS_NS ? llmProfile : undefined },
}

const ctx = {
  get(name) {
    if (name === 'settings') return fakeSettings
    if (name === 'llm') return { listConfigurableProviders: () => [{ provider: ROUTE, displayName: ROUTE, settingsNs: SETTINGS_NS, settingsPath: ['providers', ROUTE] }] }
    if (name === 'credentials') return { resolve: async () => FAKE_SK }
    return undefined
  },
  inject(list, cb) {
    // 真实 Cordis 的形状：inject 把名单里的服务作为属性投递进 scoped 上下文。
    // 之前这里无条件塞 webServer 又靠 ctx.get 取 settings，反而把「用 ctx.get 取服务」的时序 bug 掩盖了。
    const scoped = { ...ctx, effect: (fn) => { fn(); return () => {} } }
    if (Array.isArray(list) && list.includes('settings')) scoped.settings = fakeSettings
    if (Array.isArray(list) && list.includes('webServer')) scoped.webServer = { register(route) { walletHandler = route.handler; return () => {} } }
    cb(scoped)
    return () => {}
  },
  effect(fn) { try { fn() } catch { } return () => {} },
  logger(key) { return { info: (m, ...a) => logs.push(['info', key, String(m)]), warn: (m, ...a) => logs.push(['warn', key, String(m)]) } },
}

bundle.apply(ctx, {})
// 回归断言：命名空间必须真的注册上。宿主 settings.describe() 不过滤任何 ns，
// 注册成功就会被服务，设置页的插件卡片才会被分发；没注册上说明取服务的方式又是错的。
if (registered['newapi-wallet'] === undefined) {
  console.log('  ✗ settings 命名空间 newapi-wallet 未注册 → 设置页卡片必然不出现')
  console.log('  logger:', JSON.stringify(logs))
  process.exit(1)
}
console.log('  ✓ settings 命名空间已注册（设置页卡片可被分发）')
console.log('  apply() 后 logger 输出:')
for (const l of logs) console.log('    ', l.join(' | '))
if (!walletHandler) { console.log('  ✗ 没有捕获到路由 handler'); process.exit(1) }

function call(req) {
  return new Promise((resolve) => {
    let status = 0, body = ''
    walletHandler(req, { writeHead: (s) => { status = s }, end: (b) => { body = b; resolve({ status, body }) } })
  })
}

console.log('\n  --- 负例：非回环地址 ---')
const bad = await call({ method: 'GET', url: '/api/newapi-wallet', socket: { remoteAddress: '10.99.99.99' }, headers: { host: '127.0.0.1:3080' } })
console.log('    status =', bad.status, ' body =', bad.body)

console.log('\n  --- 正例：回环 GET /api/newapi-wallet ---')
const t0 = Date.now()
const ok = await call({ method: 'GET', url: '/api/newapi-wallet', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3080' } })
const ms = Date.now() - t0
const payload = JSON.parse(ok.body)
console.log('    status =', ok.status, ` 用时 ${ms}ms`, ' 顶层键 =', Object.keys(payload).join(', '))
const isErr = payload.ok === false
console.log('    类型 =', isErr ? 'WalletError' : 'WalletBundle(成功)')
if (isErr) { console.log('    error =', payload.error, payload.detail ?? ''); process.exit(1) }

const w = payload.wallet ?? {}
console.log('    accounts =', (payload.accounts ?? []).map(a => `${a.route}(host=${a.host} 凭据=${a.hasCredential} hint=${a.keyHint ?? '—'})`).join(', '))
console.log('    selected =', payload.selected)
console.log('    wallet 键 =', Object.keys(w).join(', '))
if (w.error) console.log('    wallet.error =', w.error, w.detail ?? '')
if (w.status) console.log('    wallet.status =', w.status)
if (w.recentCalls) console.log('    逐条 recentCalls =', w.recentCalls.length, '条，前 3 条 =', JSON.stringify(w.recentCalls.slice(0, 3)))
if (w.remaining) console.log('    remaining =', JSON.stringify(w.remaining), ' used =', JSON.stringify(w.used))
if (w.keyName) console.log('    keyName =', w.keyName, ' scheme =', w.scheme, ' isAvailable =', w.isAvailable)
if (w.todayTokens) console.log('    今日 token 桶 =', JSON.stringify(w.todayTokens))
if (w.identity) console.log('    identity =', JSON.stringify(w.identity))
if (w.account) console.log('    account =', JSON.stringify(w.account))
if (w.balance) console.log('    balance =', JSON.stringify(w.balance))
if (w.usage) console.log('    usage =', JSON.stringify(w.usage))
if (w.today) console.log('    今日 =', JSON.stringify(w.today))
if (w.todayModels) console.log('    今日按模型 =', JSON.stringify(w.todayModels))
if (w.todayAmounts) console.log('    今日金额拆分 =', JSON.stringify(w.todayAmounts), ' 扫描行数 =', w.todayLogRows, w.todayLogsPartial ? '(partial)' : '')
if (w.meter) console.log('    meter =', JSON.stringify(w.meter))
if (w.rate) console.log('    rate =', JSON.stringify(w.rate))
if (w.fingerprint) console.log('    指纹 =', JSON.stringify(w.fingerprint))
if (w.calls) console.log('    逐条 =', w.calls.length, '条，前 2 条 =', JSON.stringify(w.calls.slice(0, 2)))
if (w.observedModel) console.log('    observedModel =', JSON.stringify(w.observedModel), ' tokenName =', w.tokenName)
if (w.generatedAt) console.log('    generatedAt =', w.generatedAt)

console.log('\n  --- 安全与接线断言 ---')
const leaks = []
// refreshMs 必须由宿主按设置解析后随 payload 下发（假上下文里填的是 15000，落在 [10s,10min] 内）。
// 这条断言防的是历史上那个真缺陷：客户端用写死的 45s，设置里的 refreshMs 全链路无人读取。
if (payload.refreshMs === 15000) console.log('    ✓ 宿主按设置下发 refreshMs = 15000')
else leaks.push('refreshMs 未按设置下发（得到 ' + JSON.stringify(payload.refreshMs) + '，期望 15000）')
// 金额展示断言（0.1.7）：按模型每行必须带 ¥；分桶金额之和必须等于合计。
{
  const tm = Array.isArray(w.todayModels) ? w.todayModels : []
  if (tm.length === 0) leaks.push('todayModels 为空，按模型金额无从校验')
  else if (tm.some(m => !m.amount || typeof m.amount.display !== 'number' || m.amount.currency !== 'CNY')) leaks.push('todayModels 有行缺 amount.display/CNY')
  else console.log('    ✓ 今日按模型每行都带 ¥ 金额')
  const a = w.todayAmounts
  if (!a) leaks.push('缺 todayAmounts')
  else {
    const parts = [a.input, a.output, a.cacheRead].map(x => typeof x?.display === 'number' ? x.display : NaN)
    const sum = parts.reduce((x, y) => x + y, 0)
    if (parts.some(Number.isNaN) || !a.total || typeof a.total.display !== 'number') leaks.push('todayAmounts 分桶金额不全')
    else if (Math.abs(sum - a.total.display) > 0.005) leaks.push('分桶金额之和 != 合计 (' + sum + ' vs ' + a.total.display + ')')
    else console.log('    ✓ 输入+输出+缓存 金额之和 == 合计 (¥' + a.total.display.toFixed(2) + ')')
    if (w.today && typeof w.today.display === 'number' && a.total) {
      console.log('    ⓘ 今日实扣(stat) ¥' + w.today.display.toFixed(2) + ' vs 账本逐条合计 ¥' + a.total.display.toFixed(2))
    }
  }
}
// 热力图断言（近 4 周）：28 格齐、昨日格数值必须 == stat 昨日窗口（实测完全一致）
{
  const hist = Array.isArray(w.dailyHistory) ? w.dailyHistory : []
  if (hist.length !== 28) leaks.push('dailyHistory 不是 28 格 (' + hist.length + ')')
  const y = new Date(); y.setHours(0, 0, 0, 0); y.setDate(y.getDate() - 1)
  const yStr = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0')
  const yp = hist.find(p => p.date === yStr)
  const avail = hist.filter(p => p.available).length
  console.log('    ⓘ 热力图: ' + hist.length + ' 格, 有数据 ' + avail + ' 格, 昨日(' + yStr + ') quota=' + (yp ? yp.quota : '缺'))
  if (!yp || yp.available !== true || typeof yp.amount?.display !== 'number') leaks.push('昨日热力格无数据')
  else {
    const s0 = Math.floor(y.getTime() / 1000)
    const stJson = await fetch(ORIGIN + '/api/log/self/stat?type=2&start_timestamp=' + s0 + '&end_timestamp=' + (s0 + 86400), { headers: { authorization: 'Bearer ' + TOKEN, accept: 'application/json' } }).then(r => r.json())
    const stQ = stJson?.data?.quota
    if (typeof stQ === 'number' && Math.abs(stQ - yp.quota) > 1) leaks.push('昨日热力值(' + yp.quota + ') != stat(' + stQ + ')')
    else console.log('    ✓ 热力图昨日 == stat 昨日 (' + stQ + ')')
  }
  const tp = hist[hist.length - 1]
  if (tp && w.today && Math.abs((tp.quota ?? 0) - w.today.quota) > w.today.quota * 0.02 + 5000) leaks.push('今日热力格与头部今日实扣偏差过大')
  else console.log('    ✓ 今日热力格与头部今日实扣同源一致 (quota=' + (tp ? tp.quota : '—') + ')')
}
if (ok.body.includes(TOKEN)) leaks.push('响应体含访问令牌')
if (/"authorization"/i.test(ok.body)) leaks.push('响应体含 authorization 字段')
if (ok.body.includes(FAKE_SK)) leaks.push('响应体含模型调用密钥')
if (ok.body.length > 60000) leaks.push('响应体过大(' + ok.body.length + ')')
console.log(leaks.length ? '    ✗ ' + leaks.join('; ') : '    ✓ 响应体不含令牌 / 不含 sk- 密钥 / 无凭据头，体积 ' + ok.body.length + ' 字节')
process.exit(leaks.length ? 1 : 0)
