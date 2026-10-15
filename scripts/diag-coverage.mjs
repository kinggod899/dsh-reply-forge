// 按钮覆盖诊断（scripts/diag-coverage.mjs）。
//
// 用途：回答「为什么只有部分消息有伪造回复按钮」。对每个真实会话：
//   1. 用与 picker.mjs / classify.mjs **完全相同的源码**（读文件内联，
//      只剥 import/export 关键字）在页面里逐节点复算，报告每道门槛的
//      判定与拒绝原因；
//   2. 拉 Node half 的 /api/reply-forge/session/record 做真值对照
//      （落盘事件里 assistant/message 的 text 块数 vs UI 按钮数）。
//
// 宿主启动与 web-diag.mjs 同构（绕开 CLI 直接调 boot()）。
//
// 用法：node scripts/diag-coverage.mjs
// 产出：控制台报告 + .diag-tmp/coverage.json（原始数据）

import { createRequire } from 'node:module'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TMP = join(ROOT, '.diag-tmp')
const CHECKOUT = 'E:/game/DSH'
const require2 = createRequire(CHECKOUT + '/node_modules/.anchor.cjs')
const { boot, loadOverlayPatches } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-app-boot')).href)
const { provideCmdline } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-cmdline')).href)

// ---------- 1. 启动精简 web host，捕获带 token 的 URL ----------

// 会话按工作区（cwd）分目录存储；本机 45 个会话都在 E:\文档 工作区
// 的 slug 下，宿主启动时的 cwd 决定它认哪个工作区。切过去再 boot。
process.chdir('E:/文档')

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

const prepare = hostCtx => {
  provideCmdline(hostCtx, { args: ['--port', '3080', '--no-open'], exit: () => {} })
}

// 拦截 boot 期间的 console.log 拿 "dsh web: <url>?token=..."
const captured = []
const origLog = console.log
console.log = (...a) => { captured.push(a.map(String).join(' ')) }
const ctx = await boot('dsh', PROFILE + '/cordis.yml', structuredClone(allPatches), prepare)
console.log = origLog
const webLine = captured.find(l => l.includes('token='))
if (webLine === undefined) {
  console.error('[diag] 未捕获到 web URL，完整输出：')
  for (const l of captured) console.error('  ' + l)
  process.exit(1)
}
const appUrl = webLine.replace(/^.*?(https?:\/\/\S+)$/, '$1')
console.log('[diag] host ok, app url captured')

// ---------- 2. 起无头 Edge + CDP ----------

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  process.env.LOCALAPPDATA + '/Microsoft/Edge/Application/msedge.exe',
].filter(p => p && existsSync(p))
if (EDGE_CANDIDATES.length === 0) { console.error('[diag] 未找到 Edge'); process.exit(1) }

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
const edgeProfile = join(TMP, 'edge-profile')
const edgeProc = spawn(EDGE_CANDIDATES[0], [
  '--headless=new', '--remote-debugging-port=9333', '--user-data-dir=' + edgeProfile,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
], { stdio: 'ignore', detached: false })

const cleanup = () => { try { edgeProc.kill() } catch { /* */ } }
process.on('exit', cleanup)
process.on('SIGINT', () => { cleanup(); process.exit(130) })

const sleep = ms => new Promise(r => setTimeout(r, ms))

let version = null
for (let i = 0; i < 40; i += 1) {
  try {
    const res = await fetch('http://127.0.0.1:9333/json/version')
    version = await res.json()
    break
  } catch { await sleep(250) }
}
if (version === null) { console.error('[diag] Edge CDP 未就绪'); process.exit(1) }

const newTarget = await fetch('http://127.0.0.1:9333/json/new?url=' + encodeURIComponent(appUrl), { method: 'PUT' })
  .then(r => r.json())
  .catch(async () => (await fetch('http://127.0.0.1:9333/json/new?url=' + encodeURIComponent(appUrl))).json())
const target = newTarget
console.log('[diag] target:', JSON.stringify({ id: target.id, url: target.url, ws: Boolean(target.webSocketDebuggerUrl) }))

const ws = new WebSocket(target.webSocketDebuggerUrl)
let msgId = 0
const pending = new Map()
const consoleErrors = []
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data)
  if (m.id !== undefined && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id)
    pending.delete(m.id)
    if (m.error) rej(new Error(m.error.message)); else res(m.result)
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params?.type === 'error') {
    consoleErrors.push((m.params.args ?? []).map(a => a.value ?? a.description ?? '').join(' '))
  }
})
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = (msgId += 1)
  pending.set(id, { res, rej })
  ws.send(JSON.stringify({ id, method, params }))
})
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}
const evaluateFile = evaluate

// ---------- 3. 等应用就绪 ----------

await send('Runtime.enable')
await send('Page.enable')
console.log('[diag] navigating to app...')
await send('Page.navigate', { url: appUrl })
console.log('[diag] waiting for app...')
let ready = false
let lastState = null
for (let i = 0; i < 60; i += 1) {
  const ok = await evaluate("document.querySelector('[data-slot=\"main.conversation\"], [data-slot=\"conversation\"]') !== null")
  if (ok === true) { ready = true; break }
  if (i % 4 === 3) {
    lastState = await evaluate(`JSON.stringify({ url: location.href, title: document.title, bodyText: (document.body?.innerText ?? '').slice(0, 200), html: document.documentElement.outerHTML.length })`)
    console.log(`[diag]   t=${((i + 1) * 0.5).toFixed(1)}s state=${lastState}`)
  }
  await sleep(500)
}
if (!ready) { console.error('[diag] 应用未就绪, last=' + lastState); process.exit(1) }
await sleep(2500) // 等首屏 hero / 会话列表稳定

// ---------- 4. 侧边栏会话枚举 ----------

const sidebarItems = await evaluate(`(() => {
  const seen = new Set(); const out = []
  const all = [...document.querySelectorAll('body *')]
  for (const el of all) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.left > window.innerWidth * 0.35) continue // 只在左侧栏
    const own = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).filter(Boolean).join(' ')
    if (own === '') continue // 只要直接含文本的
    const kids = [...el.children]
    if (kids.some(k => (k.textContent ?? '').trim() !== '')) continue // 文本叶子
    if (seen.has(el)) continue
    const key = own + '|' + Math.round(r.top)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ text: own.slice(0, 40), top: Math.round(r.top), left: Math.round(r.left), tag: el.tagName.toLowerCase() })
  }
  // 同一坐标去重（保留最深层）
  return out
})()`)
console.log(`[diag] sidebar candidates: ${sidebarItems.length}`)
for (const s of sidebarItems) console.log(`   [${s.left},${s.top}] <${s.tag}> ${s.text}`)

// 过滤明显非会话项
const SKIP_TEXT = ['新对话', '新建会话', '新建', '搜索', '设置', '首页', '更多', '展开', '收起']
const sessionItems = sidebarItems.filter(s => !SKIP_TEXT.some(t => s.text === t || s.text.startsWith(t + ' ')))

// ---------- 5. 构造页面内诊断函数（picker + classify 源码内联） ----------

const pickerSrc = readFileSync(join(ROOT, '.dsh-plugin/client/picker.mjs'), 'utf8')
  .split('\n').filter(l => !l.startsWith('import ')).join('\n')
  .replace(/^export /gm, '')
const classifySrc = readFileSync(join(ROOT, '.dsh-plugin/client/classify.mjs'), 'utf8')
  .replace(/^export /gm, '')

// driver：逐节点复算 pickAssistantBlocks 的每一道门槛
const driver = `(() => {
  ${pickerSrc}
  ${classifySrc}
  const root = document.querySelector('[data-slot="main.conversation"], [data-slot="conversation"]')
  const nodes = [...document.querySelectorAll('[data-slot="conversation.chat.node"]')]
  const report = []
  for (const [i, node] of nodes.entries()) {
    const rec = { i, text: (node.textContent ?? '').replace(/\\s+/g, ' ').trim().slice(0, 90) }
    // 是否已被接管（属性在正文容器上，容器是 node 后代）
    rec.taken = node.matches('[data-rf-taken]') || node.querySelector('[data-rf-taken]') !== null
    let containers = []
    try { containers = [...node.querySelectorAll('*')].filter(isMarkdownContainer) } catch (e) { rec.err = String(e) }
    rec.containers = containers.length
    if (containers.length === 0) {
      rec.reason = 'no-md-container'
      rec.childTags = [...node.children].map(c => c.tagName.toLowerCase()).slice(0, 8)
      rec.descTags = [...node.querySelectorAll('*')].slice(0, 24).map(c => c.tagName.toLowerCase())
      report.push(rec); continue
    }
    const outer = containers.filter(el => !containers.some(o => o !== el && o.contains(el)))
    rec.outer = outer.length
    const passing = outer.filter(el => textLen(el) >= MIN_TEXT)
    if (passing.length === 0) {
      rec.reason = 'short-text'
      rec.lens = outer.map(textLen)
      report.push(rec); continue
    }
    const verdicts = passing.map(classifyNaturalLanguage)
    const okIdx = verdicts.findIndex(v => v.ok)
    if (okIdx === -1) {
      rec.reason = 'classify-rejected'
      rec.verdicts = [...new Set(verdicts.map(v => v.reason))]
      report.push(rec); continue
    }
    rec.reason = rec.taken ? 'eligible' : 'eligible-but-not-taken'
    report.push(rec)
  }
  return { url: location.hash, total: nodes.length, takenCount: nodes.filter(n => n.matches('[data-rf-taken]') || n.querySelector('[data-rf-taken]') !== null).length, report }
})()`

// ---------- 6. 逐个会话探测（Node 侧真值 + 页面侧复算） ----------

// Node 侧：枚举磁盘会话，直接读落盘事件做真值
const { readSessionEvents, assistantTextBlocks } = await import(
  pathToFileURL(join(ROOT, '.dsh-plugin/server/session-log.mjs')).href
)
const SESSIONS_ROOT = 'C:/Users/Administrator/.dsh/sessions'
const { readdirSync, statSync } = await import('node:fs')
const sessionDirs = []
for (const slug of readdirSync(SESSIONS_ROOT)) {
  const slugDir = join(SESSIONS_ROOT, slug)
  let st
  try { st = statSync(slugDir); if (!st.isDirectory()) continue } catch { continue }
  for (const name of readdirSync(slugDir)) {
    const dir = join(slugDir, name)
    try { if (!statSync(dir).isDirectory()) continue } catch { continue }
    const file = join(dir, 'session.v4.jsonl.zstd')
    try { if (!existsSync(file)) continue } catch { continue }
    sessionDirs.push({ id: name.replace(/^session-/, ''), dirId: name, file, mtime: statSync(file).mtimeMs })
  }
}
sessionDirs.sort((a, b) => b.mtime - a.mtime)
const CAP = 18
const picked = sessionDirs.slice(0, CAP)
console.log(`[diag] sessions on disk: ${sessionDirs.length}, probing latest ${picked.length}`)

const results = []
for (const [idx, s] of picked.entries()) {
  // 真值：落盘 assistant/message 的 text 块
  let truth = null
  try {
    const events = readSessionEvents(s.file)
    const blocks = assistantTextBlocks(events)
    truth = {
      assistantBlocks: blocks.length,
      lens: blocks.map(b => b.text.replace(/\s+/g, ' ').trim().length),
      firstText: blocks[0]?.text?.replace(/\s+/g, ' ').trim().slice(0, 30) ?? null,
    }
  } catch (e) { truth = { error: String(e).slice(0, 120) } }

  // 页面侧：hash 路由打开会话
  await evaluate(`(() => { location.hash = '#/session/${s.id}'; return location.hash })()`)
  let n = 0
  for (let t = 0; t < 14; t += 1) {
    await sleep(400)
    n = await evaluate("document.querySelectorAll('[data-slot=\"conversation.chat.node\"]').length")
    if (n > 0) break
  }
  if (n === 0) {
    // hash 内导航没生效：整页重载带 hash
    await send('Page.navigate', { url: appUrl + '#/session/' + s.id })
    for (let t = 0; t < 20; t += 1) {
      await sleep(400)
      n = await evaluate("document.querySelectorAll('[data-slot=\"conversation.chat.node\"]').length")
      if (n > 0) break
    }
  }
  await sleep(1500) // 等扫描器（防抖 220ms + MutationObserver）跑完
  const r = n > 0 ? await evaluate(driver) : { url: await evaluate('location.hash'), total: 0, takenCount: 0, report: [] }
  console.log(`[diag] #${idx} ${s.id.slice(0, 8)} nodes=${r.total} taken=${r.takenCount} truthBlocks=${truth?.assistantBlocks} first="${truth?.firstText ?? ''}"`)
  results.push({ s, r, truth })
}

// ---------- 7. 汇总 ----------

const hist = {}
const samples = {}
for (const { s, r } of results) {
  for (const rec of r.report) {
    if (rec.reason === 'eligible') continue
    hist[rec.reason] = (hist[rec.reason] ?? 0) + 1
    if (!samples[rec.reason]) samples[rec.reason] = []
    if (samples[rec.reason].length < 8) samples[rec.reason].push({ session: s.id.slice(0, 8), i: rec.i, text: rec.text, detail: rec.verdicts ?? rec.lens ?? rec.childTags })
  }
}
const totals = results.map(({ s, r, truth }) => ({
  session: s.id.slice(0, 8), nodes: r.total, taken: r.takenCount,
  truthBlocks: truth?.assistantBlocks ?? null,
  truthShort: truth?.lens ? truth.lens.filter(l => l < 24).length : null,
  first: truth?.firstText ?? null,
}))
writeFileSync(join(TMP, 'coverage.json'), JSON.stringify({ results, hist, samples, totals }, null, 2))

console.log('\n===== 汇总 =====')
console.log('每会话（truthBlocks=落盘助手正文块数, taken=UI 实际按钮数）:')
for (const t of totals) console.log('  ' + JSON.stringify(t))
const sumNodes = totals.reduce((a, t) => a + t.nodes, 0)
const sumTaken = totals.reduce((a, t) => a + t.taken, 0)
const sumTruth = totals.reduce((a, t) => a + (t.truthBlocks ?? 0), 0)
console.log(`合计: 消息节点 ${sumNodes}, 已接管 ${sumTaken}, 落盘助手正文块 ${sumTruth}`)
console.log('拒绝原因分布（ eligible 已省略）：')
for (const [k, v] of Object.entries(hist).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`)
console.log('样例：')
for (const [k, arr] of Object.entries(samples)) {
  console.log(`  -- ${k} --`)
  for (const s of arr) console.log(`     [${s.session}#${s.i}] ${JSON.stringify(s.text)} ${JSON.stringify(s.detail ?? '')}`)
}
console.log(`\n[diag] 原始数据: ${join(TMP, 'coverage.json')}`)
if (consoleErrors.length > 0) {
  console.log('[diag] 页面 console.error（前 5 条）:')
  for (const e of consoleErrors.slice(0, 5)) console.log('   ' + e.slice(0, 200))
}
process.exit(0)
