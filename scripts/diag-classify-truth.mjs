// 真值侧诊断（scripts/diag-classify-truth.mjs）：
// 不依赖 UI，直接对磁盘上全部真实会话的 assistant/message text 块跑
// picker/classify 的**文本侧**过滤（MIN_TEXT + classifyNaturalLanguage），
// 量化「没有按钮」的构成。
//
// 注意：DOM 形状门槛（isMarkdownContainer）与 ACTION_TAGS（code/pre/table）
// 在此无法计算——它们需要真实渲染 DOM。文本侧结论 + 真实 UI 探针互补。
import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { classifyNaturalLanguage } from '../.dsh-plugin/client/classify.mjs'
import { MIN_TEXT } from '../.dsh-plugin/client/picker.mjs'

const SESSIONS_ROOT = 'C:/Users/Administrator/.dsh/sessions'

const { readSessionEvents, assistantTextBlocks } = await import(
  new URL('../.dsh-plugin/server/session-log.mjs', import.meta.url).href
)

const files = []
for (const slug of readdirSync(SESSIONS_ROOT)) {
  const slugDir = join(SESSIONS_ROOT, slug)
  try { if (!statSync(slugDir).isDirectory()) continue } catch { continue }
  for (const name of readdirSync(slugDir)) {
    const f = join(slugDir, name, 'session.v4.jsonl.zstd')
    if (existsSync(f)) files.push({ id: name.replace(/^session-/, ''), file: f })
  }
}
files.sort()

const all = []
for (const { id, file } of files) {
  try {
    for (const b of assistantTextBlocks(readSessionEvents(file))) {
      all.push({ session: id.slice(0, 8), text: b.text })
    }
  } catch { /* 跳过坏会话 */ }
}

const strip = t => t.replace(/\s+/g, ' ').trim()

const buckets = { pass: [], short: [], actionText: [], actionTagLike: [], actionShape: [], empty: [] }
for (const b of all) {
  const t = strip(b.text)
  if (t.length === 0) { buckets.empty.push(b); continue }
  if (t.length < MIN_TEXT) { buckets.short.push(b); continue }
  const v = classifyNaturalLanguage({ textContent: b.text })
  if (v.ok) buckets.pass.push(b)
  else if (v.reason.startsWith('含结构化动作痕迹')) buckets.actionText.push({ ...b, reason: v.reason })
  else if (v.reason.startsWith('含结构性元素')) buckets.actionTagLike.push({ ...b, reason: v.reason })
  else buckets.actionShape.push({ ...b, reason: v.reason })
}

console.log(`会话数: ${files.length}  助手正文块总数: ${all.length}`)
console.log('--- 文本侧过滤结果 ---')
console.log(`  通过（UI 侧还须过 DOM 形状/ACTIONS_TAGS）: ${buckets.pass.length}`)
console.log(`  太短 (<${MIN_TEXT} 字符): ${buckets.short.length}`)
console.log(`  关键词命中（ACTION_TEXT，如 patch/批准/参数…）: ${buckets.actionText.length}`)
console.log(`  形态像命令/JSON（ACTION_SHAPE）: ${buckets.actionShape.length}`)
console.log(`  空文本: ${buckets.empty.length}`)

const needle = /`[^`]+`/ // 反引号内联代码：2026-10-15 修复后不再被拒（信息性统计）
const withInlineCode = buckets.pass.filter(b => needle.test(b.text))
console.log(`\n  通过者中含反引号内联代码（旧版会被 ACTION_TAGS 拒，现已放行）: ${withInlineCode.length}/${buckets.pass.length}`)
const withFence = buckets.pass.filter(b => /```/.test(b.text))
console.log(`  通过者中含代码围栏（旧版会被拒，现已放行）: ${withFence.length}/${buckets.pass.length}`)

const show = (label, arr, n = 8) => {
  console.log(`\n--- 样例: ${label} ---`)
  for (const b of arr.slice(0, n)) {
    console.log(`  [${b.session}] ${JSON.stringify(strip(b.text).slice(0, 100))}${b.reason ? '  ← ' + b.reason : ''}`)
  }
}
show('太短', buckets.short)
show('关键词命中', buckets.actionText)
show('形态命中', buckets.actionShape)
show('通过但含内联代码', withInlineCode, 5)

// 汇总每会话 expected-vs-pass
const perSession = new Map()
for (const b of all) perSession.set(b.session, (perSession.get(b.session) ?? 0) + 1)
const passPerSession = new Map()
for (const b of [...buckets.pass, ...buckets.short]) passPerSession.set(b.session, 0) // 占位
for (const b of buckets.pass) passPerSession.set(b.session, (passPerSession.get(b.session) ?? 0) + 1)
console.log('\n--- 每会话（总块数 → 文本侧可通过数）---')
for (const [s, n] of perSession) console.log(`  ${s}: ${n} → ${passPerSession.get(s) ?? 0}`)
