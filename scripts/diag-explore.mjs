// 页面结构探查（scripts/diag-explore.mjs）：boot host + Edge，dump data-slot 树、按钮与侧边栏，找会话列表入口。
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

const manifest = JSON.parse(readFileSync(PROFILE + '/package.json', 'utf8'))
// 完整 profile：侧边栏/会话列表可能由生态 bundle（dsh-better-sidebar 等）
// 提供，精简集合起不来。fidelity 优先。
const WANT = new Set(manifest.dsh?.profile?.bundles ?? [])
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
console.log('[explore] host ok')

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p))
rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const edgeProc = spawn(edge, ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=' + join(TMP, 'edge-profile'),
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'], { stdio: 'ignore' })
process.on('exit', () => { try { edgeProc.kill() } catch { /* */ } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

for (let i = 0; i < 40; i += 1) { try { await fetch('http://127.0.0.1:9334/json/version'); break } catch { await sleep(250) } }
const target = await (await fetch('http://127.0.0.1:9334/json/new?url=about:blank', { method: 'PUT' })).json()
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
for (let i = 0; i < 60; i += 1) {
  const ok = await evaluate("document.querySelector('[data-slot]') !== null && document.body.innerText.trim().length > 50")
  if (ok === true) break
  await sleep(500)
}
await sleep(3000)

// 1. data-slot 树
const slots = await evaluate(`[...document.querySelectorAll('[data-slot]')].map(el => ({ slot: el.getAttribute('data-slot'), tag: el.tagName.toLowerCase(), text: (el.textContent ?? '').replace(/\\s+/g,' ').trim().slice(0, 60) }))`)
console.log(`\n===== data-slot 元素 (${slots.length}) =====`)
for (const s of slots) console.log(`  ${s.slot} <${s.tag}> ${JSON.stringify(s.text)}`)

// 1b. sidebar.workspaces 内部 HTML（截断）
const wsHtml = await evaluate(`document.querySelector('[data-slot="sidebar.workspaces"]')?.outerHTML.slice(0, 1500) ?? 'NONE'`)
console.log(`\n===== sidebar.workspaces HTML =====\n${wsHtml}`)

// 2. 所有按钮/可点击项
const btns = await evaluate(`[...document.querySelectorAll('button, [role="button"], [role="option"], [role="tab"], a')].map(el => ({ text: (el.textContent ?? '').replace(/\\s+/g,' ').trim().slice(0, 40), slot: el.getAttribute('data-slot') })).filter(b => b.text !== '')`)
console.log(`\n===== 可点击项 (${btns.length}) =====`)
for (const b of btns.slice(0, 60)) console.log(`  ${b.slot ? '[' + b.slot + '] ' : ''}${JSON.stringify(b.text)}`)

// 3. window.__dshReplyForge 在不在
const rf = await evaluate("typeof window.__dshReplyForge")
console.log(`\n[explore] __dshReplyForge: ${rf}`)

// 4. 点「继续」看是否解锁会话列表
const clicked = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === '继续')
  if (btn) { btn.click(); return true } return false
})()`)
console.log(`\n[explore] 点击「继续」: ${clicked}`)
await sleep(2500)
const slots2 = await evaluate(`[...document.querySelectorAll('[data-slot]')].map(el => el.getAttribute('data-slot'))`)
console.log(`[explore] 点击后 data-slot 列表: ${JSON.stringify(slots2)}`)
const nodesAfter = await evaluate("document.querySelectorAll('[data-slot=\"conversation.chat.node\"]').length")
console.log(`[explore] chat.node 数量: ${nodesAfter}`)

// 5. 页面里的 UUID 文本（会话行痕迹）
const uuids = await evaluate(`(() => {
  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g
  const html = document.documentElement.outerHTML
  const all = html.match(re) ?? []
  return [...new Set(all)].slice(0, 10)
})()`)
console.log(`[explore] 页面内 UUID: ${JSON.stringify(uuids)}`)

process.exit(0)
