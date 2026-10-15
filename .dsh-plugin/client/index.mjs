/** dsh-reply-forge 浏览器 half：在会话消息上挂就地编辑入口。
 *
 * 与其它插件共存的四条纪律：
 *  1. 只注入，不注册。本插件不向任何共享槽位（conversation.view /
 *     settings.plugins.tab 等）注册条目，因此既不与他人争标签位，
 *     也不改变宿主组合树；UI 完全由 DOM 注入实现。
 *  2. 命名隔离。样式类 rf-*、属性 data-rf-*、存储键 dsh-reply-forge:*
 *     全部带前缀，不复用宿主的语义类名。
 *  3. 幂等接管。每个消息节点带 data-rf-taken 标记，重复扫描不重复挂件；
 *     宿主重渲染导致节点被替换时，标记随之消失，自然重新接管。
 *  4. 不阻断。任何一步异常都就地吞掉并记日志，绝不让宿主渲染失败。
 *
 * 契约（官方 bundle 插件 client half）：export name / inject / apply，
 * apply(ctx) 收到 client 根 ctx（提供 slots 服务）。
 */

import { CSS } from './styles.mjs'
import { CONVERSATION_SELECTOR, TAKEN_ATTR, pickAssistantBlocks, conversationRoot } from './picker.mjs'
import { renderMarkdown } from './markdown.mjs'
import { classifyNaturalLanguage } from './classify.mjs'
import {
  currentSessionId, fingerprint, loadOverrides, setOverride,
  removeOverride, clearOverrides, loadPrefs, savePrefs,
} from './store.mjs'

export const name = 'dsh-reply-forge'

/** 依赖服务：槽位系统（仅用于等待宿主就绪，不注册条目）。 */
export const inject = ['slots']

const SCAN_DEBOUNCE_MS = 220
const EDIT_ATTR = 'data-rf-edited'

/** 已接管的节点 → 覆盖指纹，供撤销时定位。 */
const taken = new WeakMap()

/** 已接管的节点 → 与它正文完全相同的消息条数（>1 时编辑器给共享覆盖警示）。 */
const dupCount = new WeakMap()

/** 编辑态：同一时刻只允许一个编辑器打开。 */
let openEditor = null

function log(...args) {
  try { console.warn('[dsh-reply-forge]', ...args) } catch { /* 忽略 */ }
}

/** 取节点的纯文本（规范化空白），用于指纹与编辑初值。 */
function nodeText(el) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** 建一个按钮。 */
function makeButton(doc, label, title, onClick, extra = {}) {
  const btn = doc.createElement('button')
  btn.type = 'button'
  btn.className = 'rf-btn'
  btn.textContent = label
  if (typeof title === 'string' && title !== '') btn.title = title
  for (const [k, v] of Object.entries(extra)) {
    if (v === true) btn.setAttribute(k, '')
    else if (v !== false && v !== null && v !== undefined) btn.setAttribute(k, String(v))
  }
  btn.addEventListener('click', event => {
    event.preventDefault()
    event.stopPropagation()
    try { onClick() } catch (error) { log('按钮回调失败', error) }
  })
  return btn
}

/** 关闭当前编辑器（有未保存改动时丢弃）。 */
function closeEditor() {
  if (openEditor === null) return
  const { wrap } = openEditor
  openEditor = null
  try { wrap.remove() } catch { /* 忽略 */ }
}

/**
 * 拆除本插件注入的全部 UI（操作条、编辑器、定位上下文），
 * 但保留监听与覆盖数据 —— 供 setEnabled(false) 实时停用后重新启用。
 */
function stripInjectedUI() {
  closeEditor()
  for (const el of [...document.querySelectorAll('[' + TAKEN_ATTR + ']')]) {
    el.removeAttribute(TAKEN_ATTR)
    el.removeAttribute(EDIT_ATTR)
    if (el.classList !== undefined && el.classList.contains('rf-host')) el.classList.remove('rf-host')
    for (const own of [...el.querySelectorAll('.rf-bar, .rf-editor')]) own.remove()
  }
}

/**
 * 打开编辑器：把一块消息就地换成 textarea。
 * @param {HTMLElement} block 消息正文容器
 * @param {string} sessionId 当前会话 id
 * @param {Object} prefs 全局偏好
 */
function openBlockEditor(block, sessionId, prefs, docOverride) {
  closeEditor()
  const doc = docOverride ?? block.ownerDocument ?? document
  const original = block.textContent ?? ''

  const wrap = doc.createElement('div')
  wrap.className = 'rf-editor'

  const label = doc.createElement('div')
  label.className = 'rf-hint'
  label.textContent = '编辑 AI 回复（仅本机渲染，不回写模型侧记录）'

  const area = doc.createElement('textarea')
  area.value = original
  area.spellcheck = false
  area.setAttribute('aria-label', '编辑 AI 回复')

  const row = doc.createElement('div')
  row.className = 'rf-row'

  const status = doc.createElement('span')
  status.className = 'rf-hint'
  status.textContent = 'Ctrl+Enter 保存 · Esc 取消'

  const cancel = makeButton(doc, '取消', '放弃改动', () => closeEditor())
  const reset = makeButton(doc, '还原原文', '删除本条覆盖', () => {
    const fp = taken.get(block)
    if (typeof fp === 'string') {
      removeOverride(sessionId, fp)
      block.removeAttribute(EDIT_ATTR)
      // 还原：把覆盖渲染回原文需要宿主重渲染，这里直接写回原文本节点
      block.textContent = ''
      renderMarkdown(block, fpOriginal(block, fp), doc)
    }
    closeEditor()
  }, { 'data-danger': true })

  const save = makeButton(doc, '保存', '应用改动（Ctrl+Enter）', () => {
    const next = area.value
    const fp = taken.get(block) ?? fingerprint(original)
    setOverride(sessionId, fp, next)
    applyOverride(block, next, prefs, doc)
    closeEditor()
  }, { 'data-rf-primary': true })

  const spacer = doc.createElement('span')
  spacer.className = 'rf-spacer'

  row.append(status, spacer, reset, cancel, save)
  // 指纹重名警示：宿主不提供稳定消息 id，正文完全相同的两条消息会共享
  // 同一条覆盖。改动会同时作用于它们，必须在编辑器里明示。
  const head = [label]
  const dup = dupCount.get(block) ?? 1
  if (dup > 1) {
    const warn = doc.createElement('div')
    warn.className = 'rf-warn'
    warn.textContent = '⚠ 检测到本会话有 ' + dup + ' 条正文完全相同的消息，它们共享同一条覆盖：改动会同时作用于全部 ' + dup + ' 条。'
    head.push(warn)
  }
  wrap.append(...head, area, row)

  block.append(wrap)
  try { area.focus() } catch { /* 忽略 */ }

  area.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); closeEditor(); return }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      save.click()
    }
  })

  openEditor = { wrap, block }
}

/** 原文缓存：指纹 → 原文，供「还原」时重建。 */
const originals = new Map()

function rememberOriginal(fp, text) {
  if (typeof fp !== 'string') return
  if (!originals.has(fp)) originals.set(fp, text)
}

function fpOriginal(block, fp) {
  return originals.get(fp) ?? nodeText(block)
}

/**
 * 把覆盖文本应用到节点：清空宿主渲染结果，换成本插件渲染的 Markdown。
 * 宿主后续重渲染会覆盖此结果，届时扫描器会用同一指纹再次应用（自愈）。
 */
function applyOverride(block, text, prefs, docOverride) {
  block.textContent = ''
  renderMarkdown(block, text, docOverride ?? block.ownerDocument)
  if (prefs.autoMark === true) block.setAttribute(EDIT_ATTR, '')
  else block.removeAttribute(EDIT_ATTR)
}

/**
 * 接管一个消息节点：挂操作条 + 应用已有覆盖。
 */
function takeBlock(block, sessionId, overrides, prefs, docOverride, dup = 1) {
  if (block.hasAttribute(TAKEN_ATTR)) return
  // 文档对象由扫描器显式传入：ownerDocument 在合成节点上可能缺失，
  // 隐式全局 document 在打包后的模块作用域里也未必可见。
  const doc = docOverride ?? block.ownerDocument ?? document

  const original = nodeText(block)
  const fp = fingerprint(original)
  rememberOriginal(fp, original)
  taken.set(block, fp)
  dupCount.set(block, dup)
  block.setAttribute(TAKEN_ATTR, '')

  // 定位上下文：只在被接管的容器上加。无条件添加——
  // 读 computed style 再判断既慢（流式重渲染时每个节点一次样式计算）
  // 又不可靠（祖先已定位时 position 未必是 static），而 .rf-host 的
  // position:relative 对宿主布局无影响。
  block.classList.add('rf-host')

  const bar = doc.createElement('div')
  bar.className = 'rf-bar'
  bar.append(
    makeButton(doc, '伪造回复', '就地编辑这条 AI 回复', () => openBlockEditor(block, sessionId, prefs, doc)),
  )
  const override = overrides[fp]
  if (override !== undefined && typeof override.text === 'string') {
    bar.append(makeButton(doc, '还原', '删除本条覆盖', () => {
      removeOverride(sessionId, fp)
      block.textContent = ''
      renderMarkdown(block, fpOriginal(block, fp), doc)
      block.removeAttribute(EDIT_ATTR)
    }, { 'data-active': true }))
    applyOverride(block, override.text, prefs, doc)
  }

  block.append(bar)
}

/** 一轮扫描：接管当前所有助手消息块。 */
function scan(sessionId, prefs, docOverride) {
  // 全局开关：停用时不提供任何编辑入口（setEnabled(false) 的实时效果）。
  if (prefs.enabled === false) return
  const doc = docOverride ?? document
  const root = conversationRoot(doc)
  if (root === null) return
  const overrides = loadOverrides(sessionId)
  // 方案2：只接管纯自然语言块，工具调用/结构化动作不提供编辑入口
  const blocks = pickAssistantBlocks(root, classifyNaturalLanguage)
  // 指纹重数统计：宿主不提供稳定消息 id，正文完全相同的两条消息会共享
  // 同一条覆盖。先数重再接管，编辑器里对重名者给出警示。
  const fps = new Map()
  const counts = new Map()
  for (const block of blocks) {
    const fp = fingerprint(nodeText(block))
    fps.set(block, fp)
    counts.set(fp, (counts.get(fp) ?? 0) + 1)
  }
  for (const block of blocks) {
    try {
      takeBlock(block, sessionId, overrides, prefs, doc, counts.get(fps.get(block)) ?? 1)
    } catch (error) {
      log('接管消息块失败', error)
    }
  }
}

/**
 * 插件入口：注入样式、启动扫描与会话级操作。
 * @param ctx - client 根上下文（提供 slots 服务）。
 */
export function apply(ctx) {
  // 幂等守卫：重复执行（HMR / loader 重跑）不重复注入。
  if (document.querySelector('style[data-dsh-reply-forge]') !== null) return

  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-dsh-reply-forge', '')
  styleEl.setAttribute('data-plugin', 'dsh-reply-forge')
  styleEl.textContent = CSS
  document.head.append(styleEl)

  let prefs = loadPrefs()
  let sessionId = currentSessionId()

  /** 扫描节流：流式输出期间宿主高频重渲染，按帧合并。 */
  let timer = null
  const scheduleScan = () => {
    if (timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      try { scan(sessionId, prefs, document) } catch (error) { log('扫描失败', error) }
    }, SCAN_DEBOUNCE_MS)
  }

  // 会话切换（SPA 路由变化）后重算会话 id 并清空编辑态
  const syncSession = () => {
    const next = currentSessionId()
    if (next === sessionId) return
    sessionId = next
    closeEditor()
    scheduleScan()
  }

  window.addEventListener('popstate', syncSession)
  window.addEventListener('hashchange', syncSession)

  // 宿主 DOM 变化驱动接管：会话区子树内的节点增删（新消息、流式定稿、
  // 标签切换重渲染）都会触发。作用域限定在会话锚点内，避免观察整棵树。
  let observedRoot = null
  let observer = null
  const attachObserver = () => {
    const root = document.querySelector(CONVERSATION_SELECTOR)
    if (root === observedRoot) return
    if (observer !== null) { observer.disconnect(); observer = null }
    observedRoot = root
    if (root === null) return
    observer = new MutationObserver(() => scheduleScan())
    observer.observe(root, { childList: true, subtree: true })
    // 锚点刚出现时立刻扫一次：此刻会话里往往已经有历史消息，
    // 而 MutationObserver 只对「之后的」变动触发，不补这一刀就会漏掉首屏。
    scheduleScan()
  }

  // 会话区还没挂载时（首屏 / 版本切换），低频重试直到锚点出现
  const bootstrap = window.setInterval(() => {
    attachObserver()
    if (observedRoot !== null) {
      window.clearInterval(bootstrap)
      scheduleScan()
    }
  }, 600)
  attachObserver()

  // 快捷键：Alt+Shift+E 编辑当前视图最后一条 AI 回复
  const onKey = event => {
    if (event.altKey !== true || event.shiftKey !== true) return
    if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'e') return
    const root = conversationRoot(document)
    const blocks = pickAssistantBlocks(root, classifyNaturalLanguage)
    const last = blocks[blocks.length - 1]
    if (last === undefined) return
    event.preventDefault()
    openBlockEditor(last, sessionId, prefs, document)
  }
  window.addEventListener('keydown', onKey)

  ctx.effect(() => () => {
    window.clearInterval(bootstrap)
    if (timer !== null) window.clearTimeout(timer)
    if (observer !== null) observer.disconnect()
    window.removeEventListener('popstate', syncSession)
    window.removeEventListener('hashchange', syncSession)
    window.removeEventListener('keydown', onKey)
    stripInjectedUI()
    styleEl.remove()
  }, 'dsh-reply-forge: teardown')

  // 调试面板不注册任何宿主槽位，只在 window 上暴露一个命名空间，
  // 供用户手动清理数据；不渲染任何常驻 UI，与其它插件零接触。
  try {
    window.__dshReplyForge = {
      version: '1.0.0',
      clearAll() {
        clearOverrides(sessionId)
        log('已清空当前会话的覆盖表')
      },
      sessionId() {
        return sessionId
      },
      // 模型侧记录探针：经宿主 Node half 的只读路由读取会话落盘事件
      // （/api/reply-forge/session/record）。与 localStorage 覆盖表对照，
      // 用于核对「本机渲染伪造」与「落盘真相」的差异。只读。
      async fetchModelRecord(id = sessionId) {
        const res = await fetch('/api/reply-forge/session/record?sessionId=' + encodeURIComponent(id))
        return res.json()
      },
      setEnabled(value) {
        prefs = { ...prefs, enabled: value === true }
        savePrefs(prefs)
        // 实时生效：停用立即拆除已注入的 UI；启用则触发一次扫描补挂。
        if (prefs.enabled) scheduleScan()
        else stripInjectedUI()
      },
    }
  } catch {
    // window 不可写时忽略
  }
}
