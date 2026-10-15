// 回归测试：在 DOM 桩里跑通 client.js 的完整链路。
// 覆盖三条最关键的行为，任何一条破了插件就是坏的：
//  1. apply 注入样式并接管助手消息块；
//  2. 「伪造回复」打开编辑器、保存后覆盖落库且渲染生效；
//  3. 重复接管幂等（不重复挂按钮）。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createDocument, createWindow, mk } from './dom-stub.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const CODE = readFileSync(resolve(ROOT, '.dsh-plugin', 'client.js'), 'utf8')
const PACKAGE_NAME = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).name

/** 收集式 MutationObserver 桩：测试可手动 fire() 模拟宿主 DOM 变更。 */
const observers = []
class ObserverStub {
  constructor(cb) { this.cb = cb; observers.push(this) }
  observe() {}
  disconnect() {}
  fire() { this.cb() }
}

/** 加载插件模块（走官方 __ModuleLoader__.load 契约）。 */
function loadPlugin(doc, win) {
  const mods = {}
  const loader = { load: ({ id, factory }) => { mods[id] = factory(() => { throw new Error('no require') }) } }
  win.__ModuleLoader__ = loader
  const runner = new Function('window', 'document', 'MutationObserver', 'console', CODE)
  runner(
    win,
    doc,
    ObserverStub,
    { warn: () => {}, log: () => {}, error: () => {} },
  )
  assert.ok(mods[PACKAGE_NAME], '加载器工厂 id 必须等于 package.json 的 name：' + PACKAGE_NAME + '；实际 ' + Object.keys(mods).join(','))
  return mods[PACKAGE_NAME]
}

/** 触发全部 Observer 回调 + 冲刷定时器（模拟宿主 DOM 变更后的扫描）。 */
function fireMutations(flush) {
  for (const o of observers) o.fire()
  flush()
}

/** 搭一条会话：main.conversation 锚点 + 一个助手消息块。 */
function setup(text = '这是 AI 原本输出的回复内容，长度足够触发识别阈值并且要超过最小值。') {
  const doc = createDocument()
  const storage = {}
  const { window: win, pending, flush } = createWindow({ storage })
  const conv = mk('div')
  conv.setAttribute('data-slot', 'main.conversation')
  const msg = mk('div', 'Kwoi6G_body')
  msg.append(mk('p', '', text))
  conv.append(msg)
  doc.body.append(conv)
  return { doc, win, pending, flush, conv, msg, storage }
}

const tests = []
function test(name, fn) { tests.push({ name, fn }) }

test('apply 注入样式并接管助手消息', () => {
  const { doc, win, flush, msg } = setup()
  const mod = loadPlugin(doc, win)
  assert.equal(typeof mod.apply, 'function', 'apply 必须导出')
  assert.deepEqual(mod.inject, ['slots'])
  mod.apply({ effect: () => {} })
  assert.ok(doc.querySelector('style[data-dsh-reply-forge]') !== null, '样式必须注入')
  flush()
  assert.ok(msg.hasAttribute('data-rf-taken'), '消息块必须被接管')
  assert.ok(msg.classList.contains('rf-host'), '需补定位上下文')
})

test('伪造回复 → 保存 → 覆盖落库且渲染生效', () => {
  const { doc, win, flush, msg, storage } = setup()
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  const bar = msg.children.find(c => c.classList.contains('rf-bar'))
  assert.ok(bar !== undefined, '必须有操作条')
  assert.equal(bar.children[0].textContent, '伪造回复')
  bar.children[0].click()
  const editor = msg.children.find(c => c.classList.contains('rf-editor'))
  assert.ok(editor !== undefined, '必须打开编辑器')
  const area = editor.querySelector('textarea')
  assert.ok(area.value.length > 0, '编辑器需预填原文')
  area.value = '# 伪造标题\n\n这是 **伪造** 的内容。'
  const save = editor.querySelectorAll('button').find(b => b.textContent === '保存')
  save.click()
  assert.ok(msg.textContent.includes('伪造标题'), '覆盖必须渲染出来')
  assert.equal(editor.parentElement, null, '保存后编辑器必须关闭')
  // localStorage 是包装对象，storage 字典才是真实落盘处
  assert.ok(Object.keys(storage).some(k => k.startsWith('dsh-reply-forge:')), '覆盖必须落库，实际键 ' + JSON.stringify(Object.keys(storage)))
})

test('重复扫描幂等：不重复挂操作条', () => {
  const { doc, win, flush, msg } = setup()
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  flush()
  flush()
  const bars = msg.children.filter(c => c.classList.contains('rf-bar'))
  assert.equal(bars.length, 1, '操作条只能有一个，实际 ' + bars.length)
})

test('真实 UI 结构：chat.node 槽位精确接管正文、排除思考/用户/系统/滚动壳', () => {
  // 2026-10-15 生产 DOM 实测形状（Edge + CDP）：
  //   每条消息 = div[data-slot="conversation.chat.node"]（宿主官方槽位）
  //   助手正文 = 直接子元素全是块级标签的 markdown 容器（_markdown_xxx）
  //   思考块 = 可折叠行（子元素 span/svg，无块级子元素）
  //   用户消息 = 气泡（span 文本）；系统/上下文注入 = title/source 行
  //   滚动外壳 class 含 _body 但子元素全是 div —— 旧主路径的毒药，
  //   它曾在「最外层过滤」里吞掉所有正文容器，本用例防回归。
  const doc = createDocument()
  const { window: win, flush } = createWindow()
  const conv = mk('div')
  conv.setAttribute('data-slot', 'main.conversation')

  const scrollBody = mk('div', 'wSkVaW_body')
  conv.append(scrollBody)

  const sysNode = mk('div')
  sysNode.setAttribute('data-slot', 'conversation.chat.node')
  const sysRow = mk('div', 'XrJvXW_root')
  sysRow.append(mk('span', '_title_luwio_79', '系统提示词'))
  sysRow.append(mk('span', 'XrJvXW_source', '@deepseek-ai/dsh-system-prompt'))
  sysNode.append(sysRow)
  scrollBody.append(sysNode)

  const userNode = mk('div')
  userNode.setAttribute('data-slot', 'conversation.chat.node')
  const userRow = mk('div', 'Sixlwa_userRow')
  const bubble = mk('div', 'Sixlwa_bubble')
  bubble.append(mk('span', '_plainRun_z12h9_6', '你好'))
  userRow.append(bubble)
  userNode.append(userRow)
  scrollBody.append(userNode)

  const aiNode = mk('div')
  aiNode.setAttribute('data-slot', 'conversation.chat.node')
  const aiBody = mk('div', 'hWmORq_body')
  const thinkWrap = mk('div')
  const think = mk('div', 'lcKema_root')
  const thinkRow = mk('div', '_row_luwio_16')
  thinkRow.append(mk('span', 'lcKema_leading', ''))
  thinkRow.append(mk('span', 'lcKema_label', '思考'))
  think.append(thinkRow)
  thinkWrap.append(think)
  const md = mk('div', '_markdown_kcgor_5')
  md.append(mk('p', '', '你好！我是助手，这是给你的回复正文，长度肯定够。'))
  md.append(mk('ul', '', '要点一要点二要点三'))
  aiBody.append(thinkWrap, md)
  aiNode.append(aiBody)
  scrollBody.append(aiNode)

  doc.body.append(conv)
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()

  assert.ok(md.hasAttribute('data-rf-taken'), 'markdown 正文容器必须被接管')
  assert.ok(!think.hasAttribute('data-rf-taken'), '思考块不能被接管')
  assert.ok(!bubble.hasAttribute('data-rf-taken'), '用户气泡不能被接管')
  assert.ok(!sysRow.hasAttribute('data-rf-taken'), '系统/上下文节点不能被接管')
  assert.ok(!scrollBody.hasAttribute('data-rf-taken'), '巨型滚动容器不能被接管（旧毒药回归）')
  assert.equal(doc.querySelectorAll('.rf-bar').length, 1, '只能挂一个操作条，实际 ' + doc.querySelectorAll('.rf-bar').length)
})

test('方案2：工具调用/结构化动作块不提供编辑入口；含代码的正文放行', () => {
  const doc = createDocument()
  const { window: win, flush } = createWindow()
  const conv = mk('div')
  conv.setAttribute('data-slot', 'main.conversation')

  // 纯自然语言块：应当被接管
  const natural = mk('div', 'Kwoi6G_body')
  natural.append(mk('p', '', '这是一段纯粹的自然语言回复，用来说明某个问题的成因与解决办法，长度足够。'))
  // 工具调用块：关键词命中，不应被接管
  const tool = mk('div', 'Kwoi6G_body')
  tool.append(mk('p', '', '调用工具 读取文件 C:\\Users\\test\\a.txt 完成后返回结果，长度也足够长。'))
  // 含代码块的正文：2026-10-15 起放行（编辑只动本机渲染，无记录错位风险）
  const code = mk('div', 'Kwoi6G_body')
  code.append(mk('pre', '', 'npm install'), mk('p', '', '上面是执行的命令内容，长度足够触发识别阈值。'))
  // 英文常用词里的 diff/patch 子串：不得误伤
  const english = mk('div', 'Kwoi6G_body')
  english.append(mk('p', '', 'The difference between the two approaches is difficult to see; a patched version needs another patch discussion.'))
  // 散文里的 " - yes"（旧命令行旗标正则误伤）
  const dashProse = mk('div', 'Kwoi6G_body')
  dashProse.append(mk('p', '', '结论 - yes 这个方向是对的，我们继续推进下一步工作，长度也足够通过阈值。'))
  // 短回复（低于旧 24 字符门槛）：应放行
  const short = mk('div', 'Kwoi6G_body')
  short.append(mk('p', '', '嗯，还醒着。要测什么，直接说。'))

  conv.append(natural, tool, code, english, dashProse, short)
  doc.body.append(conv)

  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()

  assert.ok(natural.hasAttribute('data-rf-taken'), '纯自然语言块必须接管')
  assert.equal(tool.hasAttribute('data-rf-taken'), false, '工具调用块不得接管')
  assert.ok(code.hasAttribute('data-rf-taken'), '含代码块的正文必须接管（2026-10-15 放行）')
  assert.ok(english.hasAttribute('data-rf-taken'), 'diff/patch 子串不得误伤英文散文')
  assert.ok(dashProse.hasAttribute('data-rf-taken'), '" - yes" 式散文不得被命令行旗标正则误伤')
  assert.ok(short.hasAttribute('data-rf-taken'), '短回复必须接管（MIN_TEXT=1）')
})

test('插件自身注入的按钮不得被自己的分类器挡回（重复扫描幂等）', () => {
  const { doc, win, flush, msg } = setup()
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  assert.ok(msg.hasAttribute('data-rf-taken'), '首轮必须接管')
  // 再扫一轮：分类器此时会在块内看到自己的 <button>，必须放行
  win.__dshReplyForge.sessionId()
  flush()
  assert.equal(msg.querySelectorAll('.rf-bar').length, 1, '重复扫描不得挂出第二个操作条')
})

test('宿主重渲染抹掉操作条后自愈重接管', () => {
  const { doc, win, flush, msg } = setup()
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  assert.equal(msg.querySelectorAll('.rf-bar').length, 1, '首轮一条操作条')
  // 模拟宿主流式更新：原地替换块内容（操作条被抹掉，但节点与标记还在）
  const p = mk('p', '', '这是宿主重渲染后的全新正文内容，长度足够通过所有识别阈值。')
  msg.children.length = 0
  msg.append(p)
  fireMutations(flush)
  assert.equal(msg.querySelectorAll('.rf-bar').length, 1, '操作条必须被重新挂上（自愈）')
  assert.ok(msg.hasAttribute('data-rf-taken'), '自愈后接管标记必须还在')
})

test('覆盖在重载后自动重新应用（自愈）', () => {
  const { doc, win, flush, msg, storage } = setup()
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  msg.children.find(c => c.classList.contains('rf-bar')).children[0].click()
  const editor = msg.children.find(c => c.classList.contains('rf-editor'))
  editor.querySelector('textarea').value = '持久化后的伪造内容'
  editor.querySelectorAll('button').find(b => b.textContent === '保存').click()

  // 模拟刷新：全新文档与全新模块实例，但共享同一份存储字典
  const store = { ...storage }
  const doc2 = createDocument()
  const { window: win2, flush: flush2 } = createWindow({ storage: store })
  const conv2 = mk('div')
  conv2.setAttribute('data-slot', 'main.conversation')
  const msg2 = mk('div', 'Kwoi6G_body')
  msg2.append(mk('p', '', '这是 AI 原本输出的回复内容，长度足够触发识别阈值并且要超过最小值。'))
  conv2.append(msg2)
  doc2.body.append(conv2)
  const mod2 = loadPlugin(doc2, win2)
  mod2.apply({ effect: () => {} })
  flush2()
  assert.ok(msg2.textContent.includes('持久化后的伪造内容'), '刷新后覆盖必须自动恢复')
})

test('偏好 enabled=false 时不提供编辑入口，setEnabled 实时开/关', () => {
  const { doc, win, flush, msg } = setup()
  win.localStorage.setItem('dsh-reply-forge:v1:prefs', JSON.stringify({ enabled: false }))
  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  assert.equal(msg.hasAttribute('data-rf-taken'), false, '停用状态下不得接管')
  assert.equal(typeof win.__dshReplyForge?.setEnabled, 'function', '调试命名空间必须暴露 setEnabled')

  win.__dshReplyForge.setEnabled(true)
  flush()
  assert.ok(msg.hasAttribute('data-rf-taken'), 'setEnabled(true) 后必须恢复接管')

  win.__dshReplyForge.setEnabled(false)
  assert.equal(msg.querySelector('.rf-bar'), null, 'setEnabled(false) 后操作条必须拆除')
  assert.equal(msg.hasAttribute('data-rf-taken'), false, 'setEnabled(false) 后接管标记必须清除')
})

test('指纹重名：同会话两条正文相同的消息共享覆盖，编辑器给警示', () => {
  const doc = createDocument()
  const { window: win, flush } = createWindow()
  const conv = mk('div')
  conv.setAttribute('data-slot', 'main.conversation')
  const text = '这是两条一模一样的回复正文，用来验证指纹重名时的共享覆盖逻辑与编辑器警示，长度足够触发阈值。'
  const a = mk('div', 'Kwoi6G_body')
  a.append(mk('p', '', text))
  const b = mk('div', 'Kwoi6G_body')
  b.append(mk('p', '', text))
  conv.append(a, b)
  doc.body.append(conv)

  const mod = loadPlugin(doc, win)
  mod.apply({ effect: () => {} })
  flush()
  assert.ok(a.hasAttribute('data-rf-taken') && b.hasAttribute('data-rf-taken'), '两条都必须接管')

  a.children.find(c => c.classList.contains('rf-bar')).children[0].click()
  const editor = a.children.find(c => c.classList.contains('rf-editor'))
  const warn = editor.querySelector('.rf-warn')
  assert.ok(warn !== null, '重名时必须出现共享覆盖警示')
  assert.ok(warn.textContent.includes('2'), '警示需说明重名条数')
})

// 执行
let failed = 0
for (const t of tests) {
  try {
    t.fn()
    console.log('  PASS  ' + t.name)
  } catch (error) {
    failed += 1
    console.log('  FAIL  ' + t.name)
    console.log('        ' + String(error?.message ?? error).split('\n')[0])
  }
}
console.log(failed === 0 ? '\n全部通过（' + tests.length + '）' : '\n失败 ' + failed + ' / ' + tests.length)
process.exit(failed === 0 ? 0 : 1)
