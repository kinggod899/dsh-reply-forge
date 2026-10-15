window.__ModuleLoader__.load({
	id: "@local/dsh-reply-forge",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
var __meply_forge__dsh_plugin_client_styles_mjs = (function(){ 



const CSS = `
.rf-btn{
  display:inline-flex;align-items:center;gap:4px;
  height:22px;padding:0 8px;border-radius:6px;
  border:1px solid color-mix(in srgb, currentColor 22%, transparent);
  background:transparent;color:inherit;
  font:inherit;font-size:12px;line-height:1;
  cursor:pointer;opacity:.55;
  transition:opacity .12s, background-color .12s;
  white-space:nowrap;user-select:none;
}
.rf-btn:hover{opacity:1;background:color-mix(in srgb, currentColor 8%, transparent)}
.rf-btn:focus-visible{outline:2px solid color-mix(in srgb, currentColor 60%, transparent);outline-offset:1px}
.rf-btn[data-active]{opacity:1;border-color:color-mix(in srgb, #e0a34a 60%, transparent);color:#e0a34a}

/* 悬浮操作条：绝对定位于消息容器内部，不参与文档流，不改动宿主布局 */
.rf-bar{
  position:absolute;top:2px;right:6px;z-index:5;
  display:inline-flex;gap:4px;align-items:center;
  opacity:0;pointer-events:none;
  transition:opacity .14s;
}
.rf-host:hover > .rf-bar,
.rf-host:focus-within > .rf-bar,
.rf-bar:focus-within{opacity:1;pointer-events:auto}

/* 消息容器需要定位上下文：只在被接管的容器上加，宿主其余节点不受影响 */
.rf-host{position:relative}
.rf-host[data-rf-edited]{box-shadow:inset 2px 0 0 color-mix(in srgb, #e0a34a 70%, transparent)}

.rf-editor{
  display:flex;flex-direction:column;gap:8px;
  margin:6px 0;padding:10px;border-radius:10px;
  border:1px solid color-mix(in srgb, currentColor 18%, transparent);
  background:color-mix(in srgb, currentColor 4%, transparent);
}
.rf-editor textarea{
  width:100%;min-height:120px;resize:vertical;
  padding:8px 10px;border-radius:8px;
  border:1px solid color-mix(in srgb, currentColor 20%, transparent);
  background:color-mix(in srgb, currentColor 3%, transparent);
  color:inherit;font:inherit;font-size:13px;line-height:1.6;
}
.rf-editor textarea:focus-visible{outline:2px solid color-mix(in srgb, currentColor 45%, transparent);outline-offset:1px}
.rf-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.rf-spacer{flex:1 1 auto}
.rf-hint{font-size:11px;opacity:.55}
.rf-warn{font-size:11px;color:#e0a34a}
.rf-primary{
  border-color:color-mix(in srgb, #4f8cff 55%, transparent);
  background:color-mix(in srgb, #4f8cff 14%, transparent);
  color:inherit;opacity:1;
}
.rf-danger{opacity:.9}
.rf-danger:hover{border-color:color-mix(in srgb, #d9534f 60%, transparent);color:#d9534f}

/* 会话级操作：挂在会话头部槽位，尺寸贴合宿主工具栏 */
.rf-session{
  display:inline-flex;align-items:center;gap:6px;
  font-size:12px;opacity:.7;padding:0 2px;
}
`

 return { CSS: CSS } })();
var CSS = __meply_forge__dsh_plugin_client_styles_mjs.CSS;
var __meply_forge__dsh_plugin_client_picker_mjs = (function(){ 


























const CONVERSATION_SELECTOR = '[data-slot="main.conversation"], [data-slot="conversation"]'


const CHAT_NODE_SELECTOR = '[data-slot="conversation.chat.node"]'


const BLOCK_TAGS = 'p, pre, ul, ol, blockquote, h1, h2, h3, h4, h5, h6, table'


const TAKEN_ATTR = 'data-rf-taken'




const MIN_TEXT = 1
function textLen(el) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length
}








function isMarkdownContainer(el) {
  if (typeof el.matches !== 'function') return false
  const kids = [...el.children]
  if (kids.length === 0) return false
  let blocks = 0
  for (const k of kids) {
    try {
      if (k.matches(BLOCK_TAGS)) blocks += 1
    } catch {
      return false
    }
  }
  return blocks >= 1 && blocks * 2 >= kids.length
}











function pickAssistantBlocks(root, classify = null) {
  if (root === null || typeof root.querySelectorAll !== 'function') return []
  const out = []
  const seen = new Set()

  const consider = el => {
    if (el === null || seen.has(el)) return
    if (el.closest('.rf-editor, .rf-bar, textarea, input') !== null) return
    if (typeof el.hasAttribute === 'function' && el.hasAttribute(TAKEN_ATTR)) {
      
      
      
      if (el.querySelector('.rf-bar') !== null) return
      el.removeAttribute(TAKEN_ATTR)
    }
    seen.add(el)
    out.push(el)
  }

  
  let nodes = []
  try {
    nodes = [...root.querySelectorAll(CHAT_NODE_SELECTOR)]
  } catch {
    nodes = []
  }
  for (const node of nodes) {
    let containers = []
    try {
      containers = [...node.querySelectorAll('*')].filter(isMarkdownContainer)
    } catch {
      containers = []
    }
    
    
    const outermostInNode = containers.filter(el => !containers.some(o => o !== el && o.contains(el)))
    for (const el of outermostInNode) {
      if (textLen(el) < MIN_TEXT) continue
      consider(el)
    }
  }

  
  
  
  if (out.length === 0) {
    const paras = [...root.querySelectorAll('p')]
    for (const p of paras) {
      const host = p.parentElement
      if (host === null) continue
      if (textLen(host) < MIN_TEXT) continue
      consider(host)
    }
  }

  
  const outermost = out.filter(el => !out.some(other => other !== el && other.contains(el)))

  
  
  if (typeof classify !== 'function') return outermost
  return outermost.filter(el => classify(el).ok === true)
}


function conversationRoot(doc = document) {
  const hit = doc.querySelector(CONVERSATION_SELECTOR)
  if (hit !== null) return hit
  
  
  const root = doc.getElementById('root')
  return root ?? doc.body
}

 return { pickAssistantBlocks: pickAssistantBlocks, conversationRoot: conversationRoot, CONVERSATION_SELECTOR: CONVERSATION_SELECTOR, TAKEN_ATTR: TAKEN_ATTR, MIN_TEXT: MIN_TEXT } })();
var CONVERSATION_SELECTOR = __meply_forge__dsh_plugin_client_picker_mjs.CONVERSATION_SELECTOR;
var TAKEN_ATTR = __meply_forge__dsh_plugin_client_picker_mjs.TAKEN_ATTR;
var pickAssistantBlocks = __meply_forge__dsh_plugin_client_picker_mjs.pickAssistantBlocks;
var conversationRoot = __meply_forge__dsh_plugin_client_picker_mjs.conversationRoot;
var __mly_forge__dsh_plugin_client_markdown_mjs = (function(){ 








function inline(doc, text) {
  const frag = doc.createDocumentFragment()
  
  const re = /(`[^`\n]+`|\*\*[^*\n]+\*\*|~~[^~\n]+~~|\[[^\]\n]+\]\([^)\n]*\)|(?<![\w*])\*[^*\n]+\*(?![\w*]))/g
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) frag.append(text.slice(last, m.index))
    const tok = m[0]
    if (tok.startsWith('`')) {
      const code = doc.createElement('code')
      code.textContent = tok.slice(1, -1)
      frag.append(code)
    } else if (tok.startsWith('**')) {
      const strong = doc.createElement('strong')
      strong.textContent = tok.slice(2, -2)
      frag.append(strong)
    } else if (tok.startsWith('~~')) {
      const del = doc.createElement('del')
      del.textContent = tok.slice(2, -2)
      frag.append(del)
    } else if (tok.startsWith('[')) {
      const hit = /^\[([^\]]+)\]\(([^)]*)\)$/.exec(tok)
      const a = doc.createElement('a')
      if (hit !== null) {
        a.textContent = hit[1]
        const href = hit[2].trim()
        
        if (/^(https?:|mailto:|#|\/|\.)/i.test(href)) {
          a.setAttribute('href', href)
          a.setAttribute('rel', 'noreferrer noopener')
        }
      } else {
        a.textContent = tok
      }
      frag.append(a)
    } else {
      const em = doc.createElement('em')
      em.textContent = tok.slice(1, -1)
      frag.append(em)
    }
    last = m.index + tok.length
  }
  if (last < text.length) frag.append(text.slice(last))
  return frag
}


function splitRow(line) {
  const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let buf = ''
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i]
    if (ch === '\\' && inner[i + 1] === '|') { buf += '|'; i += 1; continue }
    if (ch === '|') { cells.push(buf.trim()); buf = ''; continue }
    buf += ch
  }
  cells.push(buf.trim())
  return cells
}

function isDivider(line) {
  return /^\s*\|?[\s:-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes('-')
}






function renderMarkdown(container, source, docOverride) {
  
  
  const doc = docOverride ?? container.ownerDocument ?? globalThis.document
  container.textContent = ''
  const lines = String(source ?? '').replace(/\r\n?/g, '\n').split('\n')

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    
    if (line.trim() === '') { i += 1; continue }

    
    const fence = /^\s*```([A-Za-z0-9_+-]*)\s*$/.exec(line)
    if (fence !== null) {
      const lang = fence[1] ?? ''
      const buf = []
      i += 1
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i += 1 }
      i += 1 
      const pre = doc.createElement('pre')
      const code = doc.createElement('code')
      if (lang !== '') code.setAttribute('data-language', lang)
      code.textContent = buf.join('\n')
      pre.append(code)
      container.append(pre)
      continue
    }

    
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      container.append(doc.createElement('hr'))
      i += 1
      continue
    }

    
    const head = /^\s*(#{1,6})\s+(.*)$/.exec(line)
    if (head !== null) {
      const h = doc.createElement('h' + head[1].length)
      h.append(inline(doc, head[2]))
      container.append(h)
      i += 1
      continue
    }

    
    if (line.includes('|') && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line)
      i += 2
      const bodyRows = []
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        bodyRows.push(splitRow(lines[i]))
        i += 1
      }
      const table = doc.createElement('table')
      const thead = doc.createElement('thead')
      const htr = doc.createElement('tr')
      for (const cell of header) {
        const th = doc.createElement('th')
        th.append(inline(doc, cell))
        htr.append(th)
      }
      thead.append(htr)
      table.append(thead)
      const tbody = doc.createElement('tbody')
      for (const row of bodyRows) {
        const tr = doc.createElement('tr')
        for (const cell of row) {
          const td = doc.createElement('td')
          td.append(inline(doc, cell))
          tr.append(td)
        }
        tbody.append(tr)
      }
      table.append(tbody)
      container.append(table)
      continue
    }

    
    if (/^\s*>\s?/.test(line)) {
      const buf = []
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ''))
        i += 1
      }
      const quote = doc.createElement('blockquote')
      const inner = doc.createElement('div')
      renderMarkdown(inner, buf.join('\n'))
      quote.append(inner)
      container.append(quote)
      continue
    }

    
    if (/^\s*[-*+]\s+/.test(line)) {
      const list = doc.createElement('ul')
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const li = doc.createElement('li')
        const text = lines[i].replace(/^\s*[-*+]\s+/, '')
        li.append(inline(doc, text))
        i += 1
        
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) {
          li.append(doc.createTextNode(' ' + lines[i].trim()))
          i += 1
        }
        list.append(li)
      }
      container.append(list)
      continue
    }

    
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const list = doc.createElement('ol')
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        const li = doc.createElement('li')
        li.append(inline(doc, lines[i].replace(/^\s*\d+[.)]\s+/, '')))
        i += 1
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*\d+[.)]\s+/.test(lines[i])) {
          li.append(doc.createTextNode(' ' + lines[i].trim()))
          i += 1
        }
        list.append(li)
      }
      container.append(list)
      continue
    }

    
    const buf = []
    while (
      i < lines.length
      && lines[i].trim() !== ''
      && !/^\s*```/.test(lines[i])
      && !/^\s*#{1,6}\s/.test(lines[i])
      && !/^\s*>\s?/.test(lines[i])
      && !/^\s*[-*+]\s+/.test(lines[i])
      && !/^\s*\d+[.)]\s+/.test(lines[i])
      && !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i])
    ) {
      buf.push(lines[i])
      i += 1
    }
    if (buf.length > 0) {
      const p = doc.createElement('p')
      p.append(inline(doc, buf.join('\n')))
      container.append(p)
    } else {
      i += 1
    }
  }
}

 return { renderMarkdown: renderMarkdown } })();
var renderMarkdown = __mly_forge__dsh_plugin_client_markdown_mjs.renderMarkdown;
var __mly_forge__dsh_plugin_client_classify_mjs = (function(){ 























const ACTION_TEXT = [
  'tool-call', 'tool_call', 'toolResult', 'tool-result',
  'function_call', 'functionCall',
  '运行命令', '执行命令', '调用工具', '工具调用', '工具结果',
  '写入文件', '修改文件', '创建文件', '删除文件', '读取文件',
  '已应用补丁', '应用补丁',
  'exit code', 'exitCode', 'stdout', 'stderr',
  '等待授权', '需要确认',
]


const ACTION_TAGS = new Set(['button', 'input', 'select', 'textarea', 'iframe'])


const OWN_UI_SELECTOR = '.rf-bar, .rf-editor'


const ACTION_SHAPE = [
  /^[A-Za-z]:\\/m,                       
  /^\/(?:Users|home|usr|etc|var|opt)\//m, 
  /^\s*--?[a-z][a-z0-9-]{2,}/m,          
  /^\s*[{[][\s\S]*[\]}]\s*$/,            
  /\$\s+\S+/,                            
]







function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
}






function classifyNaturalLanguage(el) {
  if (el === null || el === undefined) return { ok: false, reason: '空节点' }

  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  if (text.length === 0) return { ok: false, reason: '空文本' }

  
  const lower = stripCode(text).toLowerCase()
  for (const marker of ACTION_TEXT) {
    if (lower.includes(marker.toLowerCase())) {
      return { ok: false, reason: '含结构化动作痕迹：' + marker }
    }
  }

  
  let structural = null
  try {
    for (const tag of ACTION_TAGS) {
      const hit = el.querySelector(tag)
      if (hit !== null && hit.closest?.(OWN_UI_SELECTOR) === null) { structural = tag; break }
    }
  } catch {
    
  }
  if (structural !== null) {
    return { ok: false, reason: '含结构性元素 <' + structural + '>' }
  }

  
  for (const re of ACTION_SHAPE) {
    if (re.test(stripCode(text))) return { ok: false, reason: '形态像命令或结构化数据' }
  }

  return { ok: true, reason: '纯自然语言' }
}






function partitionEditable(blocks) {
  const editable = []
  const rejected = []
  for (const el of blocks) {
    const verdict = classifyNaturalLanguage(el)
    if (verdict.ok) editable.push(el)
    else rejected.push({ el, reason: verdict.reason })
  }
  return { editable, rejected }
}

 return { classifyNaturalLanguage: classifyNaturalLanguage, partitionEditable: partitionEditable } })();
var classifyNaturalLanguage = __mly_forge__dsh_plugin_client_classify_mjs.classifyNaturalLanguage;
var __mreply_forge__dsh_plugin_client_store_mjs = (function(){ 



const PREFIX = 'dsh-reply-forge:v1:'


function currentSessionId() {
  try {
    const path = window.location.pathname ?? ''
    const hit = /(?:^|\/)s(?:ession)?\/([A-Za-z0-9_-]+)/.exec(path)
    if (hit !== null && hit[1] !== undefined) return hit[1]
    const hash = window.location.hash ?? ''
    const hit2 = /(?:^|\/)s(?:ession)?\/([A-Za-z0-9_-]+)/.exec(hash)
    return hit2 !== null && hit2[1] !== undefined ? hit2[1] : '_global'
  } catch {
    return '_global'
  }
}


function fingerprint(text) {
  const norm = String(text ?? '').replace(/\s+/g, ' ').trim()
  const head = norm.slice(0, 80)
  const tail = norm.slice(-40)
  return head.length + ':' + head + '|' + tail
}

function keyOf(sessionId) {
  return PREFIX + String(sessionId ?? '_global')
}


function loadOverrides(sessionId) {
  try {
    const raw = window.localStorage.getItem(keyOf(sessionId))
    if (raw === null) return {}
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'object' && v !== null && typeof v.text === 'string') {
        out[k] = { text: v.text, at: typeof v.at === 'number' ? v.at : 0 }
      }
    }
    return out
  } catch {
    return {}
  }
}

function saveOverrides(sessionId, table) {
  try {
    window.localStorage.setItem(keyOf(sessionId), JSON.stringify(table))
    return true
  } catch {
    return false
  }
}


function setOverride(sessionId, fp, text) {
  const table = loadOverrides(sessionId)
  if (String(text ?? '') === '') delete table[fp]
  else table[fp] = { text: String(text), at: Date.now() }
  return saveOverrides(sessionId, table)
}

function removeOverride(sessionId, fp) {
  const table = loadOverrides(sessionId)
  if (!(fp in table)) return false
  delete table[fp]
  return saveOverrides(sessionId, table)
}


function clearOverrides(sessionId) {
  try {
    window.localStorage.removeItem(keyOf(sessionId))
    return true
  } catch {
    return false
  }
}


function loadPrefs() {
  const base = { enabled: true, autoMark: false }
  try {
    const raw = window.localStorage.getItem(PREFIX + 'prefs')
    if (raw === null) return base
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return base
    return {
      enabled: parsed.enabled !== false,
      autoMark: parsed.autoMark === true,
    }
  } catch {
    return base
  }
}

function savePrefs(prefs) {
  try {
    window.localStorage.setItem(PREFIX + 'prefs', JSON.stringify({
      enabled: prefs.enabled !== false,
      autoMark: prefs.autoMark === true,
    }))
  } catch {
    
  }
}

 return { currentSessionId: currentSessionId, fingerprint: fingerprint, loadOverrides: loadOverrides, setOverride: setOverride, removeOverride: removeOverride, clearOverrides: clearOverrides, loadPrefs: loadPrefs, savePrefs: savePrefs } })();
var currentSessionId = __mreply_forge__dsh_plugin_client_store_mjs.currentSessionId;
var fingerprint = __mreply_forge__dsh_plugin_client_store_mjs.fingerprint;
var loadOverrides = __mreply_forge__dsh_plugin_client_store_mjs.loadOverrides;
var setOverride = __mreply_forge__dsh_plugin_client_store_mjs.setOverride;
var removeOverride = __mreply_forge__dsh_plugin_client_store_mjs.removeOverride;
var clearOverrides = __mreply_forge__dsh_plugin_client_store_mjs.clearOverrides;
var loadPrefs = __mreply_forge__dsh_plugin_client_store_mjs.loadPrefs;
var savePrefs = __mreply_forge__dsh_plugin_client_store_mjs.savePrefs;






















const name = 'dsh-reply-forge'


const inject = ['slots']

const SCAN_DEBOUNCE_MS = 220
const EDIT_ATTR = 'data-rf-edited'


const taken = new WeakMap()


const dupCount = new WeakMap()


let openEditor = null

function log(...args) {
  try { console.warn('[dsh-reply-forge]', ...args) } catch {  }
}


function nodeText(el) {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim()
}


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


function closeEditor() {
  if (openEditor === null) return
  const { wrap } = openEditor
  openEditor = null
  try { wrap.remove() } catch {  }
}





function stripInjectedUI() {
  closeEditor()
  for (const el of [...document.querySelectorAll('[' + TAKEN_ATTR + ']')]) {
    el.removeAttribute(TAKEN_ATTR)
    el.removeAttribute(EDIT_ATTR)
    if (el.classList !== undefined && el.classList.contains('rf-host')) el.classList.remove('rf-host')
    for (const own of [...el.querySelectorAll('.rf-bar, .rf-editor')]) own.remove()
  }
}







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
  try { area.focus() } catch {  }

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


const originals = new Map()

function rememberOriginal(fp, text) {
  if (typeof fp !== 'string') return
  if (!originals.has(fp)) originals.set(fp, text)
}

function fpOriginal(block, fp) {
  return originals.get(fp) ?? nodeText(block)
}





function applyOverride(block, text, prefs, docOverride) {
  block.textContent = ''
  renderMarkdown(block, text, docOverride ?? block.ownerDocument)
  if (prefs.autoMark === true) block.setAttribute(EDIT_ATTR, '')
  else block.removeAttribute(EDIT_ATTR)
}




function takeBlock(block, sessionId, overrides, prefs, docOverride, dup = 1) {
  if (block.hasAttribute(TAKEN_ATTR)) return
  
  
  const doc = docOverride ?? block.ownerDocument ?? document

  const original = nodeText(block)
  const fp = fingerprint(original)
  rememberOriginal(fp, original)
  taken.set(block, fp)
  dupCount.set(block, dup)
  block.setAttribute(TAKEN_ATTR, '')

  
  
  
  
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


function scan(sessionId, prefs, docOverride) {
  
  if (prefs.enabled === false) return
  const doc = docOverride ?? document
  const root = conversationRoot(doc)
  if (root === null) return
  const overrides = loadOverrides(sessionId)
  
  const blocks = pickAssistantBlocks(root, classifyNaturalLanguage)
  
  
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





function apply(ctx) {
  
  if (document.querySelector('style[data-dsh-reply-forge]') !== null) return

  const styleEl = document.createElement('style')
  styleEl.setAttribute('data-dsh-reply-forge', '')
  styleEl.setAttribute('data-plugin', 'dsh-reply-forge')
  styleEl.textContent = CSS
  document.head.append(styleEl)

  let prefs = loadPrefs()
  let sessionId = currentSessionId()

  
  let timer = null
  const scheduleScan = () => {
    if (timer !== null) return
    timer = window.setTimeout(() => {
      timer = null
      try { scan(sessionId, prefs, document) } catch (error) { log('扫描失败', error) }
    }, SCAN_DEBOUNCE_MS)
  }

  
  const syncSession = () => {
    const next = currentSessionId()
    if (next === sessionId) return
    sessionId = next
    closeEditor()
    scheduleScan()
  }

  window.addEventListener('popstate', syncSession)
  window.addEventListener('hashchange', syncSession)

  
  
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
    
    
    scheduleScan()
  }

  
  const bootstrap = window.setInterval(() => {
    attachObserver()
    if (observedRoot !== null) {
      window.clearInterval(bootstrap)
      scheduleScan()
    }
  }, 600)
  attachObserver()

  
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
      
      
      
      async fetchModelRecord(id = sessionId) {
        const res = await fetch('/api/reply-forge/session/record?sessionId=' + encodeURIComponent(id))
        return res.json()
      },
      setEnabled(value) {
        prefs = { ...prefs, enabled: value === true }
        savePrefs(prefs)
        
        if (prefs.enabled) scheduleScan()
        else stripInjectedUI()
      },
    }
  } catch {
    
  }
}
module.exports.apply = apply;
module.exports.name = name;
module.exports.inject = inject;

		return module.exports;
	}
});
