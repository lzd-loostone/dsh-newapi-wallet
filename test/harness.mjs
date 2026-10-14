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
  // 0.2.2 砍掉了 routeAccessTokens（单网关场景下按路由覆盖永不命中），只剩两个字段。
  const missing = ['accessToken', 'refreshMs'].filter(name => field(name)?.meta?.volatile !== true)
  if (missing.length > 0) {
    console.log('  ✗ Config 缺 .volatile()：' + missing.join(', ') + ' → 配置表单不会出现本插件')
    process.exit(1)
  }
  if (field('routeAccessTokens') !== undefined) {
    console.log('  ✗ Config 仍带着已删除的 routeAccessTokens')
    process.exit(1)
  }
  console.log('  ✓ Config 只有 accessToken + refreshMs，且都是 volatile')
}
// 回归断言：accessToken 必须仍是 role('secret')。配置页依赖宿主按这个角色脱敏——
// 掉了它，令牌就会原样下发到浏览器（而且是明文显示在输入框里）。
{
  const json = typeof bundle.Config?.toJSON === 'function' ? bundle.Config.toJSON() : undefined
  const refs = json?.refs ?? {}
  const root = refs[json?.uid] ?? json
  const dict = root?.dict ?? {}
  const raw = dict['accessToken']
  const node = typeof raw === 'number' ? refs[raw] : raw
  if (node?.meta?.role !== 'secret') {
    console.log('  ✗ accessToken 不是 role(secret)：令牌会明文下发到浏览器')
    process.exit(1)
  }
  console.log('  ✓ accessToken 是 role(secret)（宿主脱敏，值不回传浏览器）')
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
// 金额与 token 拆分断言（0.1.9）：网关改用 tiered_expr 表达式计费后，other 里的
// model_ratio/completion_ratio/cache_ratio 恒为 0，旧口径会把整笔金额塌进「输入」一行，
// 输出与缓存金额恒为 0，且漏掉 cache_creation（缓存写入）整桶。下面五条盯死这四种病征。
{
  const tm = Array.isArray(w.todayModels) ? w.todayModels : []
  if (tm.length === 0) leaks.push('todayModels 为空，按模型金额无从校验')
  else if (tm.some(m => !m.amount || typeof m.amount.display !== 'number' || m.amount.currency !== 'CNY')) leaks.push('todayModels 有行缺 amount.display/CNY')
  else console.log('    ✓ 今日按模型每行都带 ¥ 金额')

  const a = w.todayAmounts
  const tk = w.todayTokens
  if (!a) leaks.push('缺 todayAmounts')
  else if (!tk) leaks.push('缺 todayTokens')
  else {
    // (1) 四桶 token 之和必须恒等于「合计 token」——漏掉 cacheWrite 桶就会在这里露馅。
    const buckets = [tk.inputTokens, tk.outputTokens, tk.cacheReadTokens, tk.cacheWriteTokens]
    if (buckets.some(x => typeof x !== 'number')) {
      leaks.push('token 四桶不全（cacheWriteTokens=' + JSON.stringify(tk.cacheWriteTokens) + '）')
    } else {
      const bSum = buckets.reduce((x, y) => x + y, 0)
      if (bSum !== tk.totalTokens) leaks.push('token 四桶之和(' + bSum + ') != 合计 token(' + tk.totalTokens + ')')
      else console.log('    ✓ 未缓存输入+输出+缓存命中+缓存写入 == 合计 token (' + bSum + ')')
    }
    // (2) 四桶金额之和必须恒等于拆分合计。
    const parts = [a.input, a.output, a.cacheRead, a.cacheWrite].map(x => typeof x?.display === 'number' ? x.display : NaN)
    const sum = parts.reduce((x, y) => x + y, 0)
    if (parts.some(Number.isNaN) || !a.total || typeof a.total.display !== 'number') leaks.push('todayAmounts 四桶金额不全（cacheWrite=' + JSON.stringify(a.cacheWrite) + '）')
    else if (Math.abs(sum - a.total.display) > 0.005) leaks.push('四桶金额之和 != 合计 (' + sum + ' vs ' + a.total.display + ')')
    else console.log('    ✓ 四桶金额之和 == 合计 (¥' + a.total.display.toFixed(2) + ')')
    // (3) 拆分不得塌陷：某桶 token 非零时，它的金额也必须非零。
    //     这正是 tiered_expr 回归的病征——旧口径下输出与缓存金额恒为 ¥0.00。
    const collapsed = []
    for (const [name, tokens, money] of [
      ['输出', tk.outputTokens, a.output],
      ['缓存命中', tk.cacheReadTokens, a.cacheRead],
      ['缓存写入', tk.cacheWriteTokens, a.cacheWrite],
    ]) {
      if (typeof tokens === 'number' && tokens > 0 && !(typeof money?.display === 'number' && money.display > 0)) {
        collapsed.push(name + '(token ' + tokens + ' 却记 ¥' + (money?.display ?? '—') + ')')
      }
    }
    if (collapsed.length > 0) leaks.push('金额拆分塌陷：' + collapsed.join('，'))
    else console.log('    ✓ 输出/缓存命中/缓存写入 三桶金额均未塌陷为 0')
    // (6) 「请求」次数必须与四桶同源。旧版取 /api/data/self 的 count，截断日会出现
    //     「请求 2037 次」但四桶只统计了 2028 行的自相矛盾。
    if (typeof tk.requests === 'number' && typeof w.todayLogRows === 'number' && tk.requests !== w.todayLogRows) {
      leaks.push('请求次数(' + tk.requests + ') != 账本扫描行数(' + w.todayLogRows + ')，两者口径应同源')
    } else console.log('    ✓ 请求次数 == 账本扫描行数 (' + tk.requests + ')')
    // (4) 按模型合计必须与账本合计同源一致（旧口径用 /api/data/self 小时汇总，当前小时滞后）。
    if (tm.length > 0 && a.total) {
      const mSum = tm.reduce((x, r) => x + (r.quota ?? 0), 0)
      const d = Math.abs(mSum - (a.total.quota ?? 0))
      if (d !== 0) leaks.push('按模型 quota 合计(' + mSum + ') != 账本合计(' + a.total.quota + ')，差 ' + d)
      else console.log('    ✓ 按模型 quota 合计 == 账本逐条合计 (' + mSum + ')')
    }
    // (5) 头部「今日实扣」与账本合计的对照。**只在未截断时才有意义**：
    //     stat 是全天真实值，账本合计只覆盖扫描到的行；截断日两者必然不等，
    //     旧版这条断言在忙碌日会假失败（曾把 1000 行截断误报成算错）。
    if (w.today && typeof w.today.quota === 'number' && typeof a.total?.quota === 'number') {
      if (w.todayLogsTruncated === true) {
        const scanned = w.todayLogRows ?? 0
        const total = w.todayLedgerRows ?? scanned
        console.log('    ⓘ 今日账本已截断（扫描 ' + scanned + '/' + total + ' 行），stat 与账本合计不做相等断言')
        if (total < scanned) leaks.push('todayLedgerRows(' + total + ') 小于 todayLogRows(' + scanned + ')，截断标记口径不对')
      } else {
        const d = Math.abs(w.today.quota - a.total.quota)
        if (d > Math.max(2000, a.total.quota * 0.01)) leaks.push('今日实扣(stat)与账本合计偏差过大：' + w.today.quota + ' vs ' + a.total.quota)
        else console.log('    ✓ 今日实扣(stat) 与账本合计一致 (quota ' + w.today.quota + ' vs ' + a.total.quota + ')')
      }
    }
  }
}
// (7)(8) 账本扫描上限与「服务端总行数」口径。用户最早的抱怨就是这里：
//     头部「今日实扣」取全天 stat（真值），而「今日用量 / 按模型」「合计」取本地账本缓存——
//     缓存只扫到上限就停，于是两者永远差一截，且差值随当天行数变化，看起来像「算错了」。
//     网关实测单日峰值 10,470 行（2026-10-12，105 页）。所以上限必须覆盖这个量级，
//     截断只能是超大日的例外，不能是日常。下面两条钉死这件事。
{
  const scanned = w.todayLogRows
  const serverRows = w.todayLedgerRows
  if (w.todayLogsTruncated === true && (typeof scanned !== 'number' || scanned < 10_000)) {
    leaks.push('今日账本只扫到 ' + (scanned ?? 0) + ' 行就被截断（扫描上限过低）：实扣与合计必然对不上')
  } else if (w.todayLogsTruncated !== true) {
    console.log('    ✓ 今日账本未截断（扫描 ' + (scanned ?? 0) + ' 行，服务端共 ' + (serverRows ?? 0) + ' 行）')
  } else {
    console.log('    ⓘ 今日账本已截断（扫描 ' + scanned + '/' + (serverRows ?? 0) + ' 行），实扣与合计按截断口径呈现')
  }
  // todayLedgerRows 必须是**服务端**当日总行数。它曾被塞进本地缓存行数，于是 footer 那句
  // 「今日 N 行」在截断日只会重复本地数字，看不出漏了多少——一个会骗人的状态行。
  if (typeof serverRows === 'number' && typeof scanned === 'number' && serverRows < scanned) {
    leaks.push('todayLedgerRows(' + serverRows + ') 小于本地已扫描行数(' + scanned + ')：服务端总行数口径不对')
  } else if (typeof serverRows === 'number') {
    console.log('    ✓ 服务端今日总行数 ' + serverRows + ' ≥ 本地已扫描 ' + scanned + ' 行')
  }
}
// (9) 逐条明细必须带金额。0.2.2 的账本缓存只压了 quota、没压 amount，而 snapshot 直接透传
//     缓存条目 → CallRecord.amount 恒为 undefined → fmtMoney(undefined) 一律渲染成「—」，
//     整个「最近调用」的金额列空白（用户看到的正是这个）。
{
  const calls = Array.isArray(w.recentCalls) ? w.recentCalls : []
  if (calls.length === 0) leaks.push('recentCalls 为空，逐条金额无从校验')
  else {
    const missing = calls.filter(c => typeof c.amount?.display !== 'number' || c.amount?.currency !== 'CNY')
    if (missing.length > 0) leaks.push('逐条明细缺 ¥ 金额：' + missing.length + '/' + calls.length + ' 条（客户端会渲染成「—」）')
    else console.log('    ✓ 最近调用 ' + calls.length + ' 条每笔都带 ¥ 金额')
    const off = calls.filter(c => typeof c.amount?.quota === 'number' && Math.abs(c.amount.quota - (c.quota ?? 0)) > 1e-6)
    if (off.length > 0) leaks.push('逐条明细金额与自身 quota 不同源：' + off.length + ' 条')
  }
}
// 增量缓存与筛选断言（0.2.2）。
// 账本一天可能上万行，旧实现每次刷新重拉 1000 行且超出部分不算——今天 2,028 行就漏掉 51%。
// 现在改为本地缓存全天 + 增量追加，并支持按模型/令牌筛选（AND）。下面盯死这四点。
{
  // (1) 第二次取数应只做增量：行数不倒退，且明显快于冷启动。
  const t1 = Date.now()
  const again = await call({ method: 'GET', url: '/api/newapi-wallet', socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3080' } })
  const ms = Date.now() - t1
  const w2 = JSON.parse(again.body).wallet
  if (w2.todayLedgerRows < (w.todayLedgerRows ?? 0)) leaks.push('增量后行数倒退：' + w.todayLedgerRows + ' → ' + w2.todayLedgerRows)
  else console.log('    ✓ 增量刷新：行数不倒退 (' + w.todayLedgerRows + ' → ' + w2.todayLedgerRows + ')，用时 ' + ms + 'ms')

  // (2) 候选列表已改由左侧两个**全天**列表承担：旧的 filterOptions / tokenOptions 必须消失。
  //     它们曾是右侧两行筛选条的燃料，筛选条随本需求删除，/api/token/ 请求也一并去掉。
  if (w.filterOptions !== undefined) leaks.push('filterOptions 应已删除（候选改由 todayModels / todayTokenRows 承担）')
  else if (w.tokenOptions !== undefined) leaks.push('tokenOptions 应已删除（/api/token/ 请求已移除）')
  else console.log('    ✓ filterOptions / tokenOptions 已移除')

  // (3) 今日按令牌：与按模型对称，全天口径、每行带 ¥ 金额、quota 合计恒等于账本合计。
  const tokenRows = Array.isArray(w.todayTokenRows) ? w.todayTokenRows : []
  if (tokenRows.length === 0) leaks.push('缺 todayTokenRows（左侧「今日按令牌」无从渲染）')
  else if (tokenRows.some(r => typeof r.name !== 'string' || r.name === ''
    || !r.amount || typeof r.amount.display !== 'number' || r.amount.currency !== 'CNY')) {
    leaks.push('todayTokenRows 有空 name 或缺 amount.display/CNY 的行')
  } else console.log('    ✓ 今日按令牌 ' + tokenRows.length + ' 行，每行带 ¥ 金额（' + tokenRows.map(r => r.name).join(' / ') + '）')
  const allAmountTotal = w.todayAmounts?.total?.quota
  if (tokenRows.length > 0 && typeof allAmountTotal === 'number') {
    const tSum = tokenRows.reduce((x, r) => x + (r.quota ?? 0), 0)
    if (Math.abs(tSum - allAmountTotal) > 1e-6) leaks.push('按令牌 quota 合计(' + tSum + ') != 账本合计(' + allAmountTotal + ')')
    else console.log('    ✓ 按令牌 quota 合计 == 账本逐条合计 (' + tSum + ')')
  }

  // (4) 按模型筛选：右侧收窄，但**左侧两个列表必须仍是全天口径**。
  //     这是本需求的核心：旧实现拿筛选后的 ledger.models 覆写 todayModels，
  //     一点左侧某行，列表自己就塌成 1 行——列表把「筛选结果」当成了「候选」。
  const modelRows = Array.isArray(w.todayModels) ? w.todayModels : []
  if (modelRows.length === 0) leaks.push('缺 todayModels（左侧「今日按模型」无从渲染）')
  else {
    const pick = modelRows[modelRows.length - 1].name
    const filtered = await call({ method: 'GET', url: '/api/newapi-wallet?model=' + encodeURIComponent(pick), socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3080' } })
    const fw = JSON.parse(filtered.body).wallet
    const models = (fw.recentCalls ?? []).map(x => x.model)
    if (fw.filter?.model !== pick) leaks.push('筛选未回显（filter=' + JSON.stringify(fw.filter) + '）')
    else if (models.some(x => x !== pick)) leaks.push('按模型筛选漏进了别的模型：' + JSON.stringify([...new Set(models)]))
    else if (fw.todayLogRows >= (w.todayLedgerRows ?? 0)) leaks.push('筛选后行数未收窄：' + fw.todayLogRows + ' vs 全量 ' + w.todayLedgerRows)
    else if (typeof fw.todayTokens?.requests === 'number' && fw.todayTokens.requests !== fw.todayLogRows) leaks.push('筛选后 requests(' + fw.todayTokens.requests + ') 与行数(' + fw.todayLogRows + ') 口径不一致')
    else if ((fw.todayModels ?? []).length !== modelRows.length) leaks.push('筛选后 todayModels 从 ' + modelRows.length + ' 行塌成 ' + (fw.todayModels ?? []).length + ' 行（左侧列表不该参与筛选）')
    else if ((fw.todayTokenRows ?? []).length !== tokenRows.length) leaks.push('筛选后 todayTokenRows 行数变了（左侧列表不该参与筛选）')
    else console.log('    ✓ 按模型筛选「' + pick + '」：右侧 ' + fw.todayLogRows + ' 行（全量 ' + w.todayLedgerRows + '），左侧两列表仍是 ' + modelRows.length + '/' + tokenRows.length + ' 行')

    // (5) AND 组合：模型 + 令牌同时生效，结果必须是交集（行数 ≤ 各自单筛）。
    //     令牌必须挑一个与 pick **真有交集**的：随便取 tokenRows[0] 常常交集为空，
    //     那时 todayLogRows 整个字段缺失，断言会对着 undefined 假装通过。
    const tok = (w.recentCalls ?? []).find(c => c.model === pick && typeof c.tokenName === 'string')?.tokenName
    if (tok === undefined) {
      console.log('    ⓘ 全量前 30 笔里没有「' + pick + '」带令牌的行，跳过 AND 组合断言')
    } else {
      const both = await call({ method: 'GET', url: '/api/newapi-wallet?model=' + encodeURIComponent(pick) + '&token=' + encodeURIComponent(tok), socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3080' } })
      const bw = JSON.parse(both.body).wallet
      const bad = (bw.recentCalls ?? []).filter(x => x.model !== pick || x.tokenName !== tok)
      if (bad.length > 0) leaks.push('组合筛选漏进了不匹配的行：' + JSON.stringify(bad.slice(0, 1)))
      else if (bw.todayLogRows > fw.todayLogRows) leaks.push('组合筛选行数(' + bw.todayLogRows + ') 大于单筛(' + fw.todayLogRows + ')，不是交集')
      else console.log('    ✓ AND 组合（模型「' + pick + '」+ 令牌「' + tok + '」）：' + bw.todayLogRows + ' 行，是交集')
    }

    // (6) 空交集：模型 × 令牌 一条调用都没有时的口径。这是用户报的缺陷：
    //     hasLedger 判的是**筛选后**的 rows，于是空交集被当成「账本不可用」——
    //     左列「今日按令牌」整块消失（todayTokenRows 没赋值），todayAmounts 也一起丢，
    //     而「合计 token」退回 /api/data/self 的**全天**值，
    //     结果同一张表里「请求 0」与「合计 token 79.6M」并列，两个口径被缝在一起。
    {
      // 候选按调用次数升序试，空交集通常第一对就命中，最多 模型数×令牌数 次。
      const cand = [...(w.todayModels ?? [])].sort((a, b) => a.calls - b.calls).map(r => r.name)
      const candTok = [...(w.todayTokenRows ?? [])].sort((a, b) => a.calls - b.calls).map(r => r.name)
      let empty = null
      for (const mm of cand) {
        for (const tt of candTok) {
          const probe = await call({ method: 'GET', url: '/api/newapi-wallet?model=' + encodeURIComponent(mm) + '&token=' + encodeURIComponent(tt), socket: { remoteAddress: '127.0.0.1' }, headers: { host: '127.0.0.1:3080' } })
          const pw = JSON.parse(probe.body).wallet
          // 两条路都要能判出「0 行」：修复前只有 requests 能看出，修复后 todayLogRows=0。
          const scanned = pw.todayLogRows ?? pw.todayTokens?.requests
          if (scanned === 0) { empty = { mm, tt, pw }; break }
        }
        if (empty !== null) break
      }
      if (empty === null) {
        console.log('    ⓘ 今日所有 模型×令牌 组合都有调用，跳过空交集断言（无法构造该场景）')
      } else {
        const { mm, tt, pw } = empty
        const four = [pw.todayTokens?.inputTokens, pw.todayTokens?.outputTokens, pw.todayTokens?.cacheReadTokens, pw.todayTokens?.cacheWriteTokens]
        if (pw.todayTokenRows === undefined) leaks.push('空交集（' + mm + ' × ' + tt + '）把「今日按令牌」整块弄没了（左列列表消失）')
        else if ((pw.todayModels ?? []).length !== (w.todayModels ?? []).length) leaks.push('空交集时左列按模型行数变了：' + (pw.todayModels ?? []).length + ' vs ' + (w.todayModels ?? []).length)
        else if ((pw.todayTokenRows ?? []).length !== (w.todayTokenRows ?? []).length) leaks.push('空交集时左列按令牌行数变了')
        else if (pw.todayAmounts === undefined) leaks.push('空交集时缺 todayAmounts（右列 ¥ 金额整列空白）')
        else if (pw.todayTokens?.requests !== 0) leaks.push('空交集时请求次数应为 0，得到 ' + JSON.stringify(pw.todayTokens?.requests))
        else if (pw.todayLogRows !== 0) leaks.push('空交集时 todayLogRows 应为 0，得到 ' + JSON.stringify(pw.todayLogRows))
        else if (pw.todayTokens?.totalTokens !== 0) leaks.push('空交集的「合计 token」混进了全天口径：' + pw.todayTokens.totalTokens + '（同一张表里请求是 0，合计却非 0）')
        else if (four.some(x => x !== 0)) leaks.push('空交集时四桶应为全 0，得到 ' + JSON.stringify(four))
        else console.log('    ✓ 空交集（' + mm + ' × ' + tt + '）：右列全 0 且口径自洽，左列两列表仍在（' + (pw.todayModels ?? []).length + '/' + (pw.todayTokenRows ?? []).length + ' 行）')
      }
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

// 写路径已从本插件的回环路由移除（0.2.2）：令牌改在「插件」页的官方配置表单里写，
// 走 settings.update。少一条能写凭据的入口就少一份攻击面——这里盯死它没有回来。
console.log('\n  --- 写路径已移除：只读路由 ---')
{
  const posts = [
    ['带 body 的 POST', { method: 'POST', body: JSON.stringify({ accessToken: 'x' }) }],
    ['PUT', { method: 'PUT' }],
    ['DELETE', { method: 'DELETE' }],
  ]
  for (const [label, spec] of posts) {
    const buf = Buffer.from(spec.body ?? '', 'utf8')
    const res = await call({
      method: spec.method,
      url: '/api/newapi-wallet',
      socket: { remoteAddress: '127.0.0.1' },
      headers: { host: '127.0.0.1:3080', 'content-type': 'application/json' },
      [Symbol.asyncIterator]: async function* () { if (spec.body !== undefined) yield buf },
    })
    if (res.status === 405) console.log('    ✓ ' + label + ' → 405 method-not-allowed')
    else leaks.push(label + ' 应 405，得到 ' + res.status + ' ' + res.body.slice(0, 80))
  }
  // 写令牌必须只走官方 config form：插件自己的 Config 里不能再出现按路由覆盖的字段。
  if (bundle.Config !== undefined) {
    const json = bundle.Config.toJSON()
    const refs = json?.refs ?? {}
    const root = refs[json?.uid] ?? json
    if ((root?.dict ?? {})['routeAccessTokens'] !== undefined) leaks.push('Config 仍有 routeAccessTokens（多令牌未砍干净）')
    else console.log('    ✓ Config 已无 routeAccessTokens（全站单一令牌）')
  }
}
// 客户端半边：0.2.2 起令牌只在「插件」页里配，所以 plugins.bundle.config 的注册
// 是唯一入口——它没注册成功，用户就彻底没地方填令牌。产物是 window.__ModuleLoader__
// 的工厂函数，这里造一个最小加载器把它取出来，再用假 ctx 跑 apply()。
console.log('\n  --- 客户端半：座位与配置页注册 ---')
{
  const fs = await import('node:fs')
  const source = fs.readFileSync(path.join(HERE, '..', 'lib', 'client.js'), 'utf8')
  let loaded
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { loaded = entry } } },
  }
  // 产物只 require react 与 react/jsx-runtime；两个都用最小替身，避免装依赖。
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
  // eslint-disable-next-line no-new-func
  new Function('window', source)(sandbox.window)
  if (loaded === undefined) {
    leaks.push('client.js 没有调用 window.__ModuleLoader__.load')
  } else {
    if (loaded.id !== '@loostone/dsh-newapi-wallet') leaks.push('前端 bundle id 不是包名：' + loaded.id)
    else console.log('    ✓ __ModuleLoader__ id == 包名（' + loaded.id + '）')
    const client = loaded.factory(require)
    if (client.inject?.includes('slots') !== true) leaks.push('客户端未声明 inject slots')
    const registered = []
    const slots = {
      inject: (name, cb) => { slots.ledger.push(name); cb(); return () => {} },
      // 组件必须一起收下：它才是配置表单本身，没有它就断言不到「能不能写」。
      register: (options, component) => { registered.push({ ...options, component }); return () => {} },
      ledger: [],
    }
    // 宿主渲染 bundle 配置槽时**只传 view，从不传 form**（plugin-manager lib/client.js:2522），
    // 所以组件拿 form 的唯一途径是自己的注册项 inject()。官方唯一占这个槽的
    // voice-input（lib/client.js:5798）正是这么写的。下面用一个假 configForms 钉死这条契约。
    const formRequests = []
    const mutations = []
    const snapshot = { status: 'ready', value: {}, revision: 3, writable: true, mode: 'host' }
    const fakeForm = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      mutate: async (ops, expectedRevision) => { mutations.push({ ops, expectedRevision }); return true },
    }
    const configForms = { get: (ns) => { formRequests.push(ns); return fakeForm } }
    // 真 shape：ctx.inject 把服务作为属性投递进 scoped 上下文。
    const clientCtx = {
      slots,
      inject: (services, cb) => {
        const scoped = { slots: clientCtx.slots, configForms: undefined }
        if (Array.isArray(services) && services.includes('configForms')) scoped.configForms = configForms
        cb(scoped)
        return () => {}
      },
    }
    try {
      client.apply(clientCtx)
    } catch (error) {
      leaks.push('客户端 apply() 抛错：' + (error instanceof Error ? error.message : String(error)))
    }
    const seat = registered.find(o => o.name === 'sidebar.footer.action')
    const cfg = registered.find(o => o.name === 'plugins.bundle.config')
    if (seat === undefined) leaks.push('未注册 sidebar.footer.action（左下角入口会消失）')
    else console.log('    ✓ 注册 sidebar.footer.action（左下角账本入口）')
    if (cfg === undefined) {
      leaks.push('未注册 plugins.bundle.config（「插件」页不会列出本插件，令牌无处可填）')
    } else if (cfg.key !== '@loostone/dsh-newapi-wallet') {
      leaks.push('plugins.bundle.config 的 key 必须是包名，得到 ' + JSON.stringify(cfg.key))
    } else {
      console.log('    ✓ 注册 plugins.bundle.config（key = 包名，「插件」页可配令牌）')
    }
    // 配置表单真的能写进去吗？这是 0.2.2 的实测缺陷：槽渲染了，但 form 恒为 undefined，
    // 页面只会说「这个部署没有暴露设置写入通道」——令牌彻底无处可填。
    // configForms 是可选依赖（用 ctx.inject 接）：硬列进 inject 会让缺少设置界面的
    // 部署连账本面板一起丢掉。所以这里断言的是「按需接上了」，不是「写进 inject」。
    if (client.inject?.includes('slots') !== true) leaks.push('客户端 inject 缺少 slots')
    if (client.inject?.includes('configForms') === true) leaks.push('configForms 不该是硬依赖（缺设置界面时整个座位会消失）')
    if (cfg === undefined) {
      // 上面已记失败，这里不再重复。
    } else if (typeof cfg.inject !== 'function') {
      leaks.push('plugins.bundle.config 注册项没有 inject()，组件拿不到 form（宿主不传 bundle 槽的 form）')
    } else {
      const face = cfg.inject()
      if (face === null || typeof face !== 'object') {
        leaks.push('配置槽的 inject() 没返回注入面')
      } else if (face.hooks?.walletConfigForm !== fakeForm) {
        // 状态必须走 hooks 座位：渲染器会把它绑成 useWalletConfigForm 并订阅宿主更新。
        leaks.push('配置槽没有把表单挂进 hooks.walletConfigForm 座位')
      } else if (typeof face.mutate !== 'function') {
        leaks.push('配置槽没有投递 mutate 写入动作')
      } else {
        console.log('    ✓ 配置槽注入真表单（hooks 座位 + mutate 动作）')
      }
      // 命名空间必须是 profile 条目 id，不是包名——用错就是一张空白表单。
      if (formRequests.length === 0) leaks.push('注册配置槽时从未调用 configForms.get()')
      else if (formRequests[0] !== ENTRY_ID) leaks.push('configForms.get() 用了 ' + JSON.stringify(formRequests[0]) + '，应为条目 id ' + JSON.stringify(ENTRY_ID))
      else console.log('    ✓ configForms.get(' + ENTRY_ID + ')：条目 id 正确')

      // 拿到表单时不许再出现「无法配置」；拿不到时才允许降级提示。
      // 最小渲染器：函数组件按 props 展开调用（假 react 的 jsx 产物是 { type, props }）。
      const textOf = (node) => {
        if (node === null || node === undefined || node === false || node === true) return ''
        if (typeof node === 'string' || typeof node === 'number') return String(node)
        if (Array.isArray(node)) return node.map(textOf).join('')
        if (typeof node !== 'object') return ''
        if (typeof node.type === 'function') return textOf(node.type(node.props ?? {}))
        return textOf(node.children) + textOf(node.props?.children)
      }
      const render = (props) => { try { return textOf(cfg.component(props)) } catch (error) { return '『渲染抛错』' + (error instanceof Error ? error.message : String(error)) } }
      const blocked = '无法在此配置'
      // 宿主渲染时只给 view；我们的注册项 inject() 补上 hook 座位与 mutate。
      const hostProps = { view: 'page', useWalletConfigForm: face.hooks?.walletConfigForm === undefined ? undefined : (select) => select(snapshot), mutate: face.mutate }
      const withForm = render(hostProps)
      const withoutForm = render({ view: 'page' })
      if (withForm.includes(blocked)) leaks.push('拿到 form 仍渲染「' + blocked + '」：令牌依然无处可填')
      else if (!withForm.includes('访问令牌')) leaks.push('配置表单没渲染出「访问令牌」输入区：' + withForm.slice(0, 80))
      else console.log('    ✓ 配置表单渲染出令牌输入区（不再谎称无法配置）')
      if (!withoutForm.includes(blocked)) leaks.push('拿不到 form 时没有降级提示（会静默显示一张死表单）')
      else console.log('    ✓ 拿不到 form 时降级提示保留')

      // 保存必须真的写进宿主表单（form.mutate → settings.update），不是自建的写接口。
      if (typeof face.mutate === 'function') {
        await face.mutate([{ op: 'set', path: ['accessToken'], value: 'x' }], snapshot.revision)
        if (mutations.length !== 1 || mutations[0].ops?.[0]?.path?.[0] !== 'accessToken') {
          leaks.push('配置表单保存没有走宿主表单写入（走的是自建接口？）')
        } else {
          console.log('    ✓ 保存经宿主表单写入（revision ' + mutations[0].expectedRevision + '）')
        }
      }
    }

    // 大数字格式：用户明确要求 K/M/B，不要「万 / 亿」（20W → 200K、1.456M、12.123B）。
    if (typeof client.fmtTokens !== 'function') {
      leaks.push('产物没有导出 fmtTokens，无法校验 K/M/B 格式')
    } else {
      const cases = [[200_000, '200K'], [1_456_000, '1.456M'], [12_123_000_000, '12.123B'], [999, '999']]
      const bad = cases.filter(([n, want]) => client.fmtTokens(n) !== want)
      if (bad.length > 0) leaks.push('fmtTokens 格式不对：' + bad.map(([n, want]) => n + '→' + JSON.stringify(client.fmtTokens(n)) + '（期望 ' + JSON.stringify(want) + '）').join('，'))
      else console.log('    ✓ 大数字用 K/M/B（200K / 1.456M / 12.123B）')
      const cjk = cases.filter(([n]) => /万|亿/.test(client.fmtTokens(n)))
      if (cjk.length > 0) leaks.push('fmtTokens 仍输出「万 / 亿」：' + cjk.map(([n]) => client.fmtTokens(n)).join('，'))
    }

    // 左侧列表行点选：nextFilter 是纯函数，同值再点 = 取消该维度，异值 = 设置并保留另一维度。
    // 筛选条已删，取消只能靠「再点同一行」与右侧清除条——这条逻辑必须锁死。
    if (typeof client.nextFilter !== 'function') {
      leaks.push('产物没有导出 nextFilter，左侧点选行为无从校验')
    } else {
      const nf = client.nextFilter
      const cases2 = [
        [{}, 'model', 'a', { model: 'a' }],
        [{ model: 'a' }, 'model', 'a', {}],
        [{ model: 'a' }, 'model', 'b', { model: 'b' }],
        [{ model: 'a' }, 'token', 't1', { model: 'a', token: 't1' }],
        [{ model: 'a', token: 't1' }, 'token', 't1', { model: 'a' }],
        [{ model: 'a' }, 'token', 't1', { model: 'a', token: 't1' }],
      ]
      const wrong = cases2.filter(([cur, dim, value, want]) => JSON.stringify(nf(cur, dim, value)) !== JSON.stringify(want))
      if (wrong.length > 0) leaks.push('nextFilter 行为不对：' + wrong.map(([cur, dim, value, want]) => JSON.stringify(cur) + '+' + dim + '=' + value + '→' + JSON.stringify(nf(cur, dim, value)) + '（期望 ' + JSON.stringify(want) + '）').join('，'))
      else console.log('    ✓ nextFilter：同值再点取消、异值设置、另一维度保留（6 例）')
    }

    // 面板正文：左侧两个列表都要在（这正是本需求加的那块），且点行会按正确的维度回调。
    // 之前只断言到「注册了什么」，从没渲染过正文——这次的缺陷恰好全在渲染层。
    if (typeof client.WalletBody !== 'function') {
      leaks.push('产物没有导出 WalletBody，面板正文（左侧两列表）无从校验')
    } else {
      // 这个块在外层作用域，拿不到上面配置页分支里的 textOf；自带一份最小渲染器。
      const textOf = (node) => {
        if (node === null || node === undefined || node === false || node === true) return ''
        if (typeof node === 'string' || typeof node === 'number') return String(node)
        if (Array.isArray(node)) return node.map(textOf).join('')
        if (typeof node !== 'object') return ''
        if (typeof node.type === 'function') return textOf(node.type(node.props ?? {}))
        return textOf(node.children) + textOf(node.props?.children)
      }
      const money = (q) => ({ quota: q, display: q / 500000, currency: 'CNY' })
      const fakeSnapshot = {
        ok: true,
        fetchedAt: Date.now(),
        route: 'local',
        displayName: 'local',
        origin: 'http://gw.example',
        scheme: 'newapi',
        todayAvailable: true,
        today: { ...money(100), requests: 3 },
        todayTokens: { requests: 3, inputTokens: 10, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 5, totalTokens: 35 },
        todayAmounts: { input: money(1), output: money(2), cacheRead: money(0), cacheWrite: money(4), total: money(7) },
        todayModels: [{ name: 'm-a', quota: 100, calls: 2, tokens: 30, amount: money(100) }, { name: 'm-b', quota: 40, calls: 1, tokens: 5, amount: money(40) }],
        todayTokenRows: [{ name: 'tk-a', quota: 100, calls: 2, tokens: 30, amount: money(100) }, { name: 'tk-b', quota: 40, calls: 1, tokens: 5, amount: money(40) }],
        recentCalls: [],
      }
      const picks = []
      let bodyText
      try {
        bodyText = textOf(client.WalletBody({ snapshot: fakeSnapshot, error: undefined, fail: undefined, loading: false, onRetry: () => {}, onPick: (dim, value) => picks.push([dim, value]) }))
      } catch (error) {
        bodyText = '『渲染抛错』' + (error instanceof Error ? error.message : String(error))
      }
      if (!bodyText.includes('今日按模型')) leaks.push('面板正文没有「今日按模型」列表：' + bodyText.slice(0, 80))
      else if (!bodyText.includes('今日按令牌')) leaks.push('面板正文没有「今日按令牌」列表（本需求新增的那块）')
      else if (!bodyText.includes('m-a') || !bodyText.includes('tk-a')) leaks.push('两个列表没有渲染出分组名')
      else if (bodyText.includes('已筛')) leaks.push('未筛选时不该出现「已筛」提示条')
      else console.log('    ✓ 面板正文同时渲染「今日按模型」与「今日按令牌」')

      // 收集所有可点选的分组行（className === 'gww_model'），按出现顺序点前两行与第三行。
      const clickables = []
      const walk = (node) => {
        if (node === null || node === undefined || typeof node !== 'object') return
        if (Array.isArray(node)) { node.forEach(walk); return }
        // 函数组件要先展开（jsx 产物是 { type, props }，子节点在 props.children 里）。
        if (typeof node.type === 'function') { walk(node.type(node.props ?? {})); return }
        if (node.props?.className === 'gww_model' && typeof node.props.onClick === 'function') clickables.push(node)
        walk(node.children)
        walk(node.props?.children)
      }
      walk(client.WalletBody({ snapshot: fakeSnapshot, error: undefined, fail: undefined, loading: false, onRetry: () => {}, onPick: (dim, value) => picks.push([dim, value]) }))
      if (clickables.length !== 4) {
        leaks.push('可点选的分组行应为 4 行（2 模型 + 2 令牌），得到 ' + clickables.length)
      } else {
        clickables[0].props.onClick()
        clickables[2].props.onClick()
        const want = JSON.stringify([['model', 'm-a'], ['token', 'tk-a']])
        if (JSON.stringify(picks) !== want) leaks.push('点选回调维度/取值不对：' + JSON.stringify(picks) + '（期望 ' + want + '）')
        else console.log('    ✓ 点左侧行按正确维度回调（模型行→model，令牌行→token）')
      }

      // 已筛提示条：筛选生效时必须出现，且点它传出原值（再点同一行 = 取消）。
      const filtered = textOf(client.WalletBody({ snapshot: { ...fakeSnapshot, filter: { model: 'm-a', token: 'tk-a' } }, error: undefined, fail: undefined, loading: false, onRetry: () => {}, onPick: (dim, value) => picks.push([dim, value]) }))
      if (!filtered.includes('已筛') || !filtered.includes('m-a') || !filtered.includes('tk-a')) leaks.push('筛选生效时没有「已筛」提示条（筛选会变成隐形状态）')
      else console.log('    ✓ 筛选生效时显示「已筛」提示条，可一键取消')

      // (12) 单条调用卡：恰好两行、每行两格。第一行「时间 input: 值 | 缓存命中率」，第二行「令牌名 output: 值 | ¥金额」。
      //      左格居左、右格居右（两行共用 1fr auto 两列，右格右边缘对齐）。命中率口径 = 缓存读取 ÷ 输入总量
      //      （prompt 含缓存），用户拍板：≥96 绿 / 80~96 黄 / <80 红；没有缓存可展示时那一格留空，不写「缓存 0」。
      if (typeof client.cacheHint !== 'function') {
        leaks.push('产物没有导出 cacheHint，单条调用的命中率口径与配色档位无从校验')
      } else {
        const cases = [
          { name: '缺字段', call: {}, want: undefined },
          { name: '零输入', call: { promptTokens: 0, cacheTokens: 0 }, want: undefined },
          { name: '无缓存', call: { promptTokens: 1000, cacheTokens: 0 }, want: undefined },
          { name: '56.6%', call: { promptTokens: 100618, cacheTokens: 56960 }, want: { text: '缓存 56.96K · 56.6%', level: 'bad' } },
          { name: '79.9%', call: { promptTokens: 1000, cacheTokens: 799 }, want: { text: '缓存 799 · 79.9%', level: 'bad' } },
          { name: '恰好 80%', call: { promptTokens: 1000, cacheTokens: 800 }, want: { text: '缓存 800 · 80%', level: 'warn' } },
          { name: '恰好 96%', call: { promptTokens: 1000, cacheTokens: 960 }, want: { text: '缓存 960 · 96%', level: 'ok' } },
          { name: '100% 不带小数', call: { promptTokens: 1000, cacheTokens: 1000 }, want: { text: '缓存 1K · 100%', level: 'ok' } },
          { name: '缓存大于输入封顶 100%', call: { promptTokens: 1000, cacheTokens: 1200 }, want: { text: '缓存 1.2K · 100%', level: 'ok' } },
        ]
        const wrong = cases.filter(({ call, want }) => JSON.stringify(client.cacheHint(call) ?? null) !== JSON.stringify(want ?? null))
        if (wrong.length > 0) {
          leaks.push('cacheHint 口径或档位不对：' + wrong.map(({ name, call }) => name + '→' + JSON.stringify(client.cacheHint(call) ?? null)).join('，'))
        } else {
          console.log('    ✓ cacheHint：口径 = 缓存 ÷ 输入，96/80 两个边界与封顶都对（' + cases.length + ' 例）')
        }
      }

      const withCalls = {
        ...fakeSnapshot,
        recentCalls: [
          { createdAt: Date.now(), model: 'gpt-6-luna', quota: 100, amount: money(100), promptTokens: 100618, completionTokens: 588, cacheTokens: 56960, cacheWriteTokens: 0, requestId: 'r1', tokenName: '公司 win new' },
          { createdAt: Date.now(), model: 'glm-5.3-flash', quota: 10, amount: money(10), promptTokens: 1200, completionTokens: 30, cacheTokens: 0, cacheWriteTokens: 0, requestId: 'r2', tokenName: 'dgx' },
          { createdAt: Date.now(), quota: 0, amount: money(0), cacheTokens: 0, cacheWriteTokens: 0, requestId: 'r3' },
        ],
      }
      const collect = (node, cls, out = []) => {
        if (node === null || node === undefined || typeof node !== 'object') return out
        if (Array.isArray(node)) { node.forEach(n => collect(n, cls, out)); return out }
        if (typeof node.type === 'function') { collect(node.type(node.props ?? {}), cls, out); return out }
        if (node.props?.className === cls) out.push(node)
        collect(node.children, cls, out)
        collect(node.props?.children, cls, out)
        return out
      }
      const tree = client.WalletBody({ snapshot: withCalls, error: undefined, fail: undefined, loading: false, onRetry: () => {}, onPick: () => {} })
      const cellsOf = (grid) => Array.isArray(grid.props?.children) ? grid.props.children : [grid.props?.children]
      const grids = collect(tree, 'gww_callGrid')
      if (grids.length !== 3) {
        leaks.push('单条调用卡每笔应有一个两行网格（共 3 个），得到 ' + grids.length)
      } else {
        // 版式契约（三笔共用一套）：4 格 = 2 行 × 2 列。
        //   第一行「时间 - 令牌名 | 模型名 ¥金额」，第二行「input: 值  output: 值 | 缓存命中率」。
        //   缺用量写 —（不摆 0，0 会被读成「真的用了 0」）；无缓存那一格留空（空 auto 列零宽）。
        const cards = [
          { name: '有缓存', head: /^\d{2}:\d{2} - 公司 win new$/, money: /^gpt-6-luna ¥/, io: ['input: 100.618K', 'output: 588'], cache: /^缓存 56\.96K · 56\.6%$/, level: 'bad' },
          { name: '无缓存', head: /^\d{2}:\d{2} - dgx$/, money: /^glm-5\.3-flash ¥/, io: ['input: 1.2K', 'output: 30'], cache: null, level: undefined },
          { name: '缺用量缺模型', head: /^\d{2}:\d{2}$/, money: /^¥/, io: ['input: —', 'output: —'], cache: null, level: undefined },
        ]
        const bad = []
        cards.forEach((want, i) => {
          const line = cellsOf(grids[i])
          if (line.length !== 4) { bad.push(want.name + '：应恰好两行两格（4 格），得到 ' + line.length + ' 格'); return }
          if (!want.head.test(textOf(line[0]))) bad.push(want.name + '：第一行左格应「时间 - 令牌名」，得到 ' + JSON.stringify(textOf(line[0])))
          // 右格 = 模型名（可缺）+ 空格 + ¥金额；缺模型时不能漏出 undefined，也不能丢掉金额。
          if (!want.money.test(textOf(line[1])) || /undefined/.test(textOf(line[1]))) {
            bad.push(want.name + '：第一行右格应是「模型名 ¥金额」，得到 ' + JSON.stringify(textOf(line[1])))
          }
          const io = cellsOf(line[2]).map(textOf)
          if (JSON.stringify(io) !== JSON.stringify(want.io)) bad.push(want.name + '：第二行左格应并排 ' + JSON.stringify(want.io) + '，得到 ' + JSON.stringify(io))
          const cache = textOf(line[3])
          if (want.cache === null) {
            if (cache !== '' || line[3].props['data-level'] !== undefined) bad.push(want.name + '：缓存格应留空且无档位，得到 ' + JSON.stringify({ text: cache, level: line[3].props['data-level'] }))
          } else if (!want.cache.test(cache) || line[3].props['data-level'] !== want.level) {
            bad.push(want.name + '：第二行右格应是 ' + want.level + ' 档缓存，得到 ' + JSON.stringify({ text: cache, level: line[3].props['data-level'] }))
          }
        })
        if (bad.length > 0) leaks.push('单条调用卡版式不对：' + bad.join('；'))
        else {
          const first = cellsOf(grids[0])
          console.log('    ✓ 恰好两行两格：第一行「' + textOf(first[0]) + ' | ' + textOf(first[1]) + '」，第二行「' + cellsOf(first[2]).map(textOf).join(' ') + ' | ' + textOf(first[3]) + '」；三笔（含缺模型）都对')
        }
      }
      // 页脚（网关地址 · 读取时间）归左列列底，不跟右列。
      const colL = collect(tree, 'gww_colL')
      const colR = collect(tree, 'gww_colR')
      if (colL.length !== 1 || colR.length !== 1) {
        leaks.push('两列骨架不对：左列 ' + colL.length + ' 个、右列 ' + colR.length + ' 个')
      } else if (collect(colL[0], 'gww_footer').length !== 1 || collect(colR[0], 'gww_footer').length !== 0) {
        leaks.push('页脚应在左列里，右列不应有：左列 ' + collect(colL[0], 'gww_footer').length + ' 个、右列 ' + collect(colR[0], 'gww_footer').length + ' 个')
      } else {
        console.log('    ✓ 页脚在左列（' + JSON.stringify(textOf(collect(colL[0], 'gww_footer')[0])) + '），右列没有')
      }
      // 上一版的「首行 + 三栏网格」必须彻底退场，不留两套结构。
      const stale = ['gww_callTop', 'gww_tokGrid', 'gww_tokLabel'].filter(cls => collect(tree, cls).length > 0)
      if (stale.length > 0) leaks.push('旧卡片结构仍在渲染：' + stale.join('，'))
      else console.log('    ✓ 旧卡片结构（首行 + 三栏网格）已完全退场')
      if (!source.includes('.gww_callGrid{display:grid;grid-template-columns:minmax(0,1fr) auto')) {
        leaks.push('两行网格没有声明 minmax(0,1fr) / auto 两列（左格居左可省略、右格居右）')
      } else if (!source.includes('.gww_callIO{display:grid;grid-template-columns:minmax(0,16ch) auto')) {
        leaks.push('input / output 的列宽不固定，output: 无法跨行对齐（应 grid + minmax(0,16ch) auto）')
      } else if (!source.includes('.gww_callModel{color:var(--dsw-alias-label-caption)')) {
        leaks.push('模型名没有比金额暗一档（.gww_callModel 缺 color 声明）')
      } else if (!source.includes('.gww_tokCache[data-level="ok"]') || !source.includes('.gww_tokCache[data-level="bad"]')) {
        leaks.push('缓存格没有按 ok / bad 档位配色')
      } else {
        console.log('    ✓ 两行网格 minmax(0,1fr)/auto，缓存格按档位配色')
      }
    }
  }
}

if (leaks.length > 0) console.log('\n  ✗ 汇总失败项：\n    - ' + leaks.join('\n    - '))
process.exit(leaks.length ? 1 : 0)
