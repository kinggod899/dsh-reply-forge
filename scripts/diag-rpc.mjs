// 通用 RPC 探针（scripts/diag-rpc.mjs）：boot host + Edge，对页面上下文
// 调用任意 dsh RPC 方法并打印结果。用于排查「界面被 onboarding 挡住」类
// 问题时观察服务端真实状态。
//
// 用法：node scripts/diag-rpc.mjs <method> [<method>...]
//   node scripts/diag-rpc.mjs llm/listProviders llm/listConfigurableProviders
import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(ROOT, '.diag-tmp')
const CHECKOUT = 'E:/game/DSH'
const require2 = createRequire(CHECKOUT + '/node_modules/.anchor.cjs')
const { boot, loadOverlayPatches } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-app-boot')).href)
const { provideCmdline } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-cmdline')).href)

const PROFILE = 'C:/Users/Administrator/.dsh/profiles/desktop'
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
const appUrl = captured.find(l => l.includes('token=')).replace(/^.*?(https?:\/\/\S+)$/, '$1')
console.log('[rpc] host ok')

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p))
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const edgeProc = spawn(edge, ['--headless=new', '--remote-debugging-port=9338', '--user-data-dir=' + join(TMP, 'edge-profile'),
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { edgeProc.kill() } catch { /* */ } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

for (let i = 0; i < 40; i += 1) { try { await fetch('http://127.0.0.1:9338/json/version'); break } catch { await sleep(250) } }
const target = await (await fetch('http://127.0.0.1:9338/json/new?url=about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id !== undefined && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id); pending.delete(m.id)
    if (m.error) rej(new Error(m.error.message)); else res(m.result)
  }
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
await send('Page.enable')
await send('Page.navigate', { url: appUrl })
await sleep(7000)

const methods = process.argv.slice(2)
if (methods.length === 0) {
  console.log('用法: node scripts/diag-rpc.mjs <method> [...]')
  process.exit(1)
}
for (const item of methods) {
  const eq = item.indexOf('=')
  const method = eq < 0 ? item : item.slice(0, eq)
  // 默认带 _request（session/list 等要求）；显式写 method= 表示无参。
  let args = { _request: {} }
  if (eq >= 0) {
    const raw = item.slice(eq + 1)
    try { args = raw === '' ? {} : JSON.parse(raw) } catch { console.log(`参数解析失败: ${raw}`); continue }
  }
  const rpcId = crypto.randomUUID()
  const r = await evaluate(`(async () => {
    const r = await fetch('/api/${method.split('/')[0]}/${method.split('/').slice(1).join('/')}', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'client-request', rpcId: '${rpcId}', method: '${method}', payload: { args: ${JSON.stringify(args)} } })
    })
    return { status: r.status, body: (await r.text()).slice(0, 6000) }
  })()`)
  console.log(`\n===== ${method} (${r.status}) =====`)
  try { console.log(JSON.stringify(JSON.parse(r.body), null, 1).slice(0, 6000)) }
  catch { console.log(r.body) }
}
process.exit(0)
