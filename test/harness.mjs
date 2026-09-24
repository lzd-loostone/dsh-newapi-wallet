/**
 * 离线端到端验证：不启动 DSH，用最小假 Cordis 上下文加载构建好的 lib/index.js，
 * 走完「Config（volatile）→ settings.describe() 解析路由 → 解析访问令牌 → 打真实网关
 * → 回环路由出账本」全链路。令牌只从环境变量 DSH_TEST_TOKEN 读取，绝不写盘、绝不打印。
 */
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const TOKEN = process.env.DSH_TEST_TOKEN
const ORIGIN = process.env.DSH_TEST_ORIGIN
const ROUTE = process.env.DSH_TEST_ROUTE || 'test-route'
// 站点根（去掉 /v1 之类路径）：账本接口都挂在站点根上。
const GATEWAY_ORIGIN = new URL(ORIGIN ?? 'http://127.0.0.1').origin
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

let walletHandler = null
const logs = []
const updates = []
const DEAD_ROUTE = 'not-newapi'
// 探不出 New API 的站点（端口 1 必拒连）：必须被过滤掉，不许出现在卡片列表里。
const DEAD_ORIGIN = 'http://127.0.0.1:1'
const llmProfile = {
  providers: {
    [ROUTE]: { baseURL: ORIGIN, apiKeyEnv: KEY_ENV },
    [DEAD_ROUTE]: { baseURL: DEAD_ORIGIN, apiKeyEnv: KEY_ENV },
  },
}

// 0.1.7 的 settings 服务：没有 register/get，只有 describe()，返回各 profile 条目（ns = 条目 id）
// 的实时值。插件必须靠它读到别的插件的 baseURL；写值走 update(ns, patch)。
// 本插件条目在 profile patch 里的存活值。settings.update 稀疏合并进这里：
// 官方语义见 dsh-settings 的 mergeLayers（纯对象递归合并，稀疏 patch 不会抹掉下层键），
// 假上下文照抄，断言才测的是真契约而不是自造的假设。
const ENTRY_ID = 'loostone-newapi-wallet'
const liveConfig = { [ENTRY_ID]: { accessToken: TOKEN, routeAccessTokens: { [ROUTE]: TOKEN }, refreshMs: 15000 } }
const fakeSettings = {
  describe() {
    return [
      { ns: SETTINGS_NS, value: llmProfile },
      { ns: 'agent-default-model', value: { provider: ROUTE, model: 'test-model' } },
    ]
  },
  async update(ns, patch) {
    updates.push({ ns, patch })
    const under = liveConfig[ns] ?? {}
    const merged = { ...under }
    for (const [key, value] of Object.entries(patch)) {
      const nested = value !== null && typeof value === 'object' && !Array.isArray(value)
      merged[key] = nested && typeof under[key] === 'object' && under[key] !== null
        ? { ...under[key], ...value }
        : value
    }
    liveConfig[ns] = merged
  },
}

const ctx = {
  get(name) {
    if (name === 'settings') return fakeSettings
    if (name === 'llm') return { listConfigurableProviders: () => [
      { provider: ROUTE, displayName: ROUTE, settingsNs: SETTINGS_NS, settingsPath: ['providers', ROUTE] },
      { provider: DEAD_ROUTE, displayName: DEAD_ROUTE, settingsNs: SETTINGS_NS, settingsPath: ['providers', DEAD_ROUTE] },
    ] }
    if (name === 'credentials') return { resolve: async () => FAKE_SK }
    return undefined
  },
  inject(list, cb) {
    // 真实 Cordis 的形状：inject 把名单里的服务作为属性投递进 scoped 上下文。
    const scoped = { ...ctx, effect: (fn) => { fn(); return () => {} } }
    if (Array.isArray(list) && list.includes('settings')) scoped.settings = fakeSettings
    if (Array.isArray(list) && list.includes('webServer')) scoped.webServer = { register(route) { walletHandler = route.handler; return () => {} } }
    cb(scoped)
    return () => {}
  },
  effect(fn) { try { fn() } catch { } return () => {} },
  logger(key) { return { info: (m, ...a) => logs.push(['info', key, String(m)]), warn: (m, ...a) => logs.push(['warn', key, String(m)]) } },
}

// 真运行时 apply() 收到的 volatile 字段是 Volatile 引用（读快照用 .get()），照原样喂进来。
bundle.apply(ctx, {
  accessToken: { get: () => TOKEN },
  routeAccessTokens: { get: () => ({ [ROUTE]: TOKEN }) },
  refreshMs: { get: () => 15000 },
})
// 回归断言：0.1.7 的设置页表单来自插件导出的 Config，且宿主只投影 volatile 字段
// （dsh-settings 的 volatileForm()）。少了 .volatile() → describe() 里没有本条目 →
// 设置页连填令牌的地方都没有。
{
  const json = typeof bundle.Config?.toJSON === 'function' ? bundle.Config.toJSON() : undefined
  // schemastery 的 toJSON 是 refs 表：根节点按 uid 索引，字段值是 refs 的下标。
  const refs = json?.refs ?? {}
  const root = refs[json?.uid] ?? json
  const dict = root?.dict ?? {}
  const field = (name) => { const v = dict[name]; return typeof v === 'number' ? refs[v] : v }
  const missing = ['accessToken', 'routeAccessTokens', 'refreshMs'].filter(name => field(name)?.meta?.volatile !== true)
  if (missing.length > 0) {
    console.log('  ✗ Config 缺 .volatile()：' + missing.join(', ') + ' → 设置页不会出现本条目')
    process.exit(1)
  }
  console.log('  ✓ Config 三个字段都是 volatile（设置页可编辑）')
}
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
// 卡片列表只列探出来是 New API 的路由：DEAD_ROUTE 必须被隐藏。
{
  const routes = (payload.accounts ?? []).map(a => a.route)
  if (routes.length === 1 && routes[0] === ROUTE) console.log('    ✓ 非 New API 路由已过滤（只列 ' + ROUTE + '，' + DEAD_ROUTE + ' 已隐藏）')
  else leaks.push('供应商过滤不对：' + JSON.stringify(routes) + '（期望只剩 ' + ROUTE + '）')
}
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
    const stJson = await fetch(GATEWAY_ORIGIN + '/api/log/self/stat?type=2&start_timestamp=' + s0 + '&end_timestamp=' + (s0 + 86400), { headers: { authorization: 'Bearer ' + TOKEN, accept: 'application/json' } }).then(r => r.json())
    const stQ = stJson?.data?.quota
    if (typeof stQ !== 'number') console.log('    ⓘ 昨日 stat 没返回 quota，跳过对比（热力格 quota=' + yp.quota + '）')
    else if (Math.abs(stQ - yp.quota) > 1) leaks.push('昨日热力值(' + yp.quota + ') != stat(' + stQ + ')')
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

console.log('\n  --- 写令牌：POST /api/newapi-wallet ---')
function postCall(body, headers) {
  const buf = Buffer.from(body, 'utf8')
  return call({
    method: 'POST',
    url: '/api/newapi-wallet',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: '127.0.0.1:3080', 'content-type': 'application/json', ...(headers ?? {}) },
    [Symbol.asyncIterator]: async function* () { yield buf },
  })
}
{
  const ROUTE_TOKEN = 'tok-not-a-real-token'
  const w1 = await postCall(JSON.stringify({ route: ROUTE, accessToken: ROUTE_TOKEN }))
  const u1 = updates[updates.length - 1]
  if (w1.status === 200 && JSON.parse(w1.body).ok === true
    && u1?.ns === ENTRY_ID && u1?.patch?.routeAccessTokens?.[ROUTE] === ROUTE_TOKEN
    && liveConfig[ENTRY_ID].routeAccessTokens[ROUTE] === ROUTE_TOKEN) {
    console.log('    ✓ 按路由写令牌：200，settings.update("' + ENTRY_ID + '", {routeAccessTokens:{' + ROUTE + ':…}})')
  } else leaks.push('按路由写令牌失败：status=' + w1.status + ' body=' + w1.body + ' update=' + JSON.stringify(u1) + ' live=' + JSON.stringify({ ...liveConfig[ENTRY_ID], accessToken: '…' }))

  const w2 = await postCall(JSON.stringify({ accessToken: 'global-not-a-real-token' }))
  const u2 = updates[updates.length - 1]
  // 稀疏 patch 必须只动 accessToken：已有的按路由覆盖与 refreshMs 不能被抹掉。
  if (w2.status === 200 && u2?.patch?.accessToken === 'global-not-a-real-token'
    && liveConfig[ENTRY_ID].accessToken === 'global-not-a-real-token'
    && liveConfig[ENTRY_ID].routeAccessTokens[ROUTE] === ROUTE_TOKEN
    && liveConfig[ENTRY_ID].refreshMs === 15000) {
    console.log('    ✓ 写全局默认令牌：只动 accessToken，按路由覆盖与 refreshMs 都还在')
  } else leaks.push('写全局令牌失败：' + w2.body + ' update=' + JSON.stringify(u2) + ' live=' + JSON.stringify({ ...liveConfig[ENTRY_ID], accessToken: '…' }))

  const w3 = await postCall('{}')
  if (w3.status === 400) console.log('    ✓ 空 body → 400 bad-request')
  else leaks.push('空 body 应 400，得到 ' + w3.status)

  const w4 = await postCall(JSON.stringify({ accessToken: 'x' }), { 'content-type': 'text/plain' })
  if (w4.status === 415) console.log('    ✓ 非 JSON content-type → 415 unsupported-media-type')
  else leaks.push('非 JSON content-type 应 415，得到 ' + w4.status)

  const w5 = await postCall(JSON.stringify({ accessToken: 'x' }), { origin: 'https://evil.example' })
  if (w5.status === 403) console.log('    ✓ 外站 Origin → 403 forbidden')
  else leaks.push('外站 Origin 应 403，得到 ' + w5.status)

  const w6 = await postCall(JSON.stringify({ accessToken: 'x' }), { origin: 'http://127.0.0.1:3080' })
  if (w6.status === 200) console.log('    ✓ 本机 Origin → 放行')
  else leaks.push('本机 Origin 应放行，得到 ' + w6.status)

  if ([w1, w2, w6].some(r => r.body.includes(ROUTE_TOKEN) || r.body.includes('global-not-a-real-token'))) leaks.push('写响应回显了令牌')
  else console.log('    ✓ 写响应不回显令牌')
}
if (leaks.length > 0) console.log('\n  ✗ 汇总失败项：\n    - ' + leaks.join('\n    - '))
process.exit(leaks.length ? 1 : 0)
