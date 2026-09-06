/**
 * 可复现构建：宿主半 lib/index.js + 前端半 lib/client.js(+.map)
 *
 * 用法：node scripts/build.mjs
 * 依赖：.build-deps/node_modules 下的 esbuild（`npm i --no-save --prefix .build-deps esbuild`）
 *      以及 node_modules/@deepseek-ai/{schemastery,cosmokit}（构建期需要，会被内联进 lib/index.js）
 *
 * 与上游 build.sh 的两处关键差异（都是必须的）：
 *  1. 不再用 --external:@deepseek-ai/*，只把纯类型的 cordis 与宿主提供的客户端接缝标为 external，
 *     让 @deepseek-ai/schemastery + cosmokit 打进宿主半——profile 的 node_modules 里没有它们。
 *  2. 前端 bundle 的 __ModuleLoader__ id 必须是**包名** @loostone/dsh-newapi-wallet
 *     （DSH 按 /plugins/<包名>/client.js 提供产物，见 dsh-client-modules 的 pathname.slice(9, -len)）。
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const candidates = [
  path.join(root, '.build-deps', 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe'),
  path.join(root, '.build-deps', 'node_modules', '@esbuild', 'darwin-arm64', 'bin', 'esbuild'),
  path.join(root, '.build-deps', 'node_modules', '@esbuild', 'darwin-x64', 'bin', 'esbuild'),
  path.join(root, '.build-deps', 'node_modules', '@esbuild', 'linux-x64', 'bin', 'esbuild'),
]
const esbuild = candidates.find((p) => existsSync(p))
if (esbuild === undefined) {
  console.error('esbuild 未就位：先跑 npm i --no-save --prefix .build-deps esbuild')
  process.exit(1)
}

function run(args) {
  const r = spawnSync(esbuild, args, { cwd: root, stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log(':: 构建宿主半 lib/index.js')
run([
  'src/index.ts',
  '--bundle', '--format=esm', '--platform=node', '--target=es2022',
  '--outfile=lib/index.js',
  '--external:@deepseek-ai/cordis',
  '--log-level=warning',
])

console.log(':: 构建前端半 lib/client.js')
run([
  'src/client/index.tsx',
  '--bundle', '--format=cjs', '--platform=browser', '--target=es2022',
  '--jsx=automatic', '--loader:.ts=tsx', '--loader:.tsx=tsx',
  '--outfile=lib/client.js', '--sourcemap',
  '--external:react', '--external:react/jsx-runtime',
  '--external:@deepseek-ai/cordis',
  '--external:@deepseek-ai/dsh-client-runtime/client',
  '--external:@deepseek-ai/dsh-client-ui-slots',
  '--external:@deepseek-ai/dsh-client-ui-sidebar/client',
  '--external:@deepseek-ai/dsh-client-ui-primitives',
  '--external:@deepseek-ai/dsh-client-ui-settings',
  '--define:process.env.NODE_ENV="production"',
  '--banner:js=window.__ModuleLoader__.load({ id: "@loostone/dsh-newapi-wallet", factory: (require) => { var module = { exports: {} }; var exports = module.exports;',
  '--footer:js=return module.exports; } });',
  '--log-level=warning',
])

console.log('完成。')
