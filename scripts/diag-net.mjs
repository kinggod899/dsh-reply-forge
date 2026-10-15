// 网络请求探查（scripts/diag-net.mjs）：列出页面加载期间的全部资源/XHR 请求。
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(ROOT, '.diag-tmp')
import { diagPaths, requireCheckout } from './diag-paths.mjs'
const { profile: PROFILE, checkout: CHECKOUT } = diagPaths()
requireCheckout(CHECKOUT)
const require2 = createRequire(CHECKOUT + '/node_modules/.anchor.cjs')
const { boot, loadOverlayPatches } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-app-boot')).href)
const { provideCmdline } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-cmdline')).href)

const WANT = new Set(['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@local/dsh-reply-forge'])
const manifest = JSON.parse(readFileSync(PROFILE + '/package.json', 'utf8'))
const allPatches = []
for (const name of manifest.dsh?.profile?.bundles ?? []) {
  if (!WANT.has(name)) continue
  let dir = PROFILE + '/node_modules/' + name
  if (!existsSync(dir + '/package.json')) dir = CHECKOUT + '/node_modules/' + name
  const pkg = JSON.parse(readFileSync(dir + '/package.json', 'utf8'))
  const patch = pkg.dsh?.bundle?.patch
  const paths = Array.isArray(patch) ? patch : (typeof patch === 'string' ? [patch] : [])
  for (const p of paths) allPatches.push(...loadOverlayPatches('dsh', dir + '/' + p))
}
allPatches.push(...loadOverlayPatches('dsh', PROFILE + '/cordis.patch.yml'))
const prepare = hostCtx => { provideCmdline(hostCtx, { args: ['--port', '3080', '--no-open'], exit: () => {} }) }

const captured = []
const origLog = console.log
console.log = (...a) => { captured.push(a.map(String).join(' ')) }
await boot('dsh', PROFILE + '/cordis.yml', structuredClone(allPatches), prepare)
console.log = origLog
const webLine = captured.find(l => l.includes('token='))
const appUrl = webLine.replace(/^.*?(https?:\/\/\S+)$/, '$1')
console.log('[net] host ok')

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p))
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const edgeProc = spawn(edge, ['--headless=new', '--remote-debugging-port=9335', '--user-data-dir=' + join(TMP, 'edge-profile'),
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { edgeProc.kill() } catch { /* */ } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

for (let i = 0; i < 40; i += 1) { try { await fetch('http://127.0.0.1:9335/json/version'); break } catch { await sleep(250) } }
const target = await (await fetch('http://127.0.0.1:9335/json/new?url=about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()
const reqs = []
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id !== undefined && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id)
    if (m.error) rej(new Error(m.error.message)); else res(m.result)
  }
  if (m.method === 'Network.requestWillBeSent' && /api\/(session|workspace)/.test(m.params.request.url)) reqs.push({ url: m.params.request.url, method: m.params.request.method, post: m.params.request.postData ?? null, headers: m.params.request.headers })
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = (msgId += 1); pending.set(id, { res, rej })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}

await send('Runtime.enable')
await send('Network.enable')
await send('Page.enable')
await send('Page.navigate', { url: appUrl })
await sleep(9000)

console.log('\n===== session/workspace 请求详情 =====')
const seen2 = new Set()
for (const r of reqs) {
  const key = r.url + '|' + r.method
  if (seen2.has(key)) continue
  seen2.add(key)
  console.log(`  ${r.method} ${r.url}`)
  if (r.post) console.log(`    post: ${String(r.post).slice(0, 300)}`)
  const ct = Object.entries(r.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')
  const ct2 = Object.entries(r.headers ?? {}).find(([k]) => k.toLowerCase() === 'authorization')
  if (ct) console.log(`    ${ct[0]}: ${ct[1]}`)
  if (ct2) console.log(`    ${ct2[0]}: ${String(ct2[1]).slice(0, 40)}...`)
}

console.log('\n===== 全部页面请求（非静态资源） =====')
const seen = new Set()
for (const r of reqs) {
  if (/\.(js|css|png|svg|woff2?|ico|map)(\?|$)/.test(r.url)) continue
  if (seen.has(r.url)) continue
  seen.add(r.url)
  console.log(`  [${r.type}] ${r.url}`)
}
console.log('\n===== performance 资源 =====')
const perf = await evaluate(`performance.getEntriesByType('resource').map(e => e.name).filter(u => !/\\.(js|css|png|svg|woff2?|ico|map)(\\?|$)/.test(u))`)
for (const u of perf) console.log('  ' + u.slice(0, 160))

process.exit(0)
