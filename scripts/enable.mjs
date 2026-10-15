// 一键启用 dsh-reply-forge：把插件加回 bundles 并解除 disabled。
//
// 使用时机：任何时候。双击仓库根的「启用插件.bat」，
// 或在任意终端执行 node scripts/enable.mjs。
//
// 与「重装插件.bat」的关键区别：本脚本不跑 pnpm install。
// 启用所需的三个前提（lockfile 已登记、@local junction 在位、
// node_modules 完好）都已经满足，而 pnpm install 在 dsh 运行时
// 执行会清空 node_modules —— 正是 2026-10-14 事故的根因。
// 这里只改两个启动时读取的静态配置，且每一步都有备份。
//
// 它按顺序做四件事：
//  1. 检测 dsh 是否在运行（只警告不阻止：改静态配置不影响当前会话）；
//  2. 备份 profile 的 package.json 与 cordis.patch.yml；
//  3. bundles 追加 @local/dsh-reply-forge、移除 cordis.patch.yml 里的 disabled 条目；
//  4. 验证 junction / lockfile / client.js 产物，输出结论。
//
// 回滚：运行「关闭插件.bat」，或从备份还原两个配置文件。
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import os from 'node:os'

// dsh 家目录：DSH_HOME 覆盖，缺省 ~/.dsh；profile 目录可再用
// DSH_PROFILE_DIR 精确指定。
const DSH_HOME = process.env.DSH_HOME ?? join(os.homedir(), '.dsh')
const PROFILE = process.env.DSH_PROFILE_DIR ?? join(DSH_HOME, 'profiles', 'desktop')
const PKG_ID = '@local/dsh-reply-forge'
const LINK = join(PROFILE, 'node_modules', '@local', 'dsh-reply-forge')

const log = (...a) => console.log('[enable]', ...a)
const fail = msg => { console.error('[enable] 失败：' + msg); process.exit(1) }
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

function backup(file) {
  if (!existsSync(file)) return null
  const dest = file + '.bak-enable-' + stamp()
  copyFileSync(file, dest)
  return dest
}

// 1. dsh 运行检测：只改启动时读取的静态配置，不阻止，但必须醒目告知。
//    tasklist.exe 输出是 UTF-16LE（utf8 解码会乱码匹配不上）；个别环境
//    可能禁用该进程，此时静默跳过——检测失败绝不能中断启用流程。
function detectDshRunning() {
  try {
    const r = spawnSync('tasklist', ['/FI', 'IMAGENAME eq DeepSeek Harness.exe'], { shell: true })
    if (r.error !== undefined || r.status !== 0 || r.stdout === undefined) return false
    const buf = Buffer.from(r.stdout)
    const text = buf.toString('utf16le') + buf.toString('utf8')
    return /DeepSeek Harness\.exe/i.test(text)
  } catch {
    return false
  }
}
if (detectDshRunning()) {
  log('警告：检测到 DSH 桌面端正在运行。')
  log('      本脚本只修改启动时读取的静态配置，不影响当前会话；')
  log('      但改动要重启 DSH 后才生效，重启前请先完全退出 DSH。')
}

// 2. package.json：bundles 追加条目（dependencies 必须已包含）
log('步骤 1/3 备份并修改配置')
const pkgPath = join(PROFILE, 'package.json')
if (!existsSync(pkgPath)) fail('未找到 ' + pkgPath)
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const bundles = pkg?.dsh?.profile?.bundles
if (!Array.isArray(bundles)) fail('package.json 缺少 dsh.profile.bundles 数组')
if (typeof pkg?.dependencies?.[PKG_ID] !== 'string') {
  fail('dependencies 缺少 ' + PKG_ID + '：请先完全退出 DSH 后运行「重装插件.bat」恢复依赖')
}
if (!bundles.includes(PKG_ID)) {
  bundles.push(PKG_ID)
  const b = backup(pkgPath)
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  log('  package.json 已加入 bundles（备份 ' + b + '）')
} else {
  log('  package.json bundles 已包含本插件，跳过')
}

// 3. cordis.patch.yml：移除 id 为 dsh-reply-forge 的 disabled 条目
const patchPath = join(PROFILE, 'cordis.patch.yml')
if (existsSync(patchPath)) {
  const raw = readFileSync(patchPath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const kept = []
  let skipping = false
  let removed = 0
  for (const line of lines) {
    if (/^\s*-\s*id:\s*['"]?dsh-reply-forge['"]?\s*$/.test(line)) {
      skipping = true
      removed += 1
      continue
    }
    if (skipping && /^\s*-\s+\w/.test(line)) skipping = false
    if (!skipping) kept.push(line)
  }
  if (removed > 0) {
    const b = backup(patchPath)
    writeFileSync(patchPath, kept.join('\n'))
    log('  cordis.patch.yml 已移除 ' + removed + ' 条 disabled 条目（备份 ' + b + '）')
  } else {
    log('  cordis.patch.yml 无本插件 disabled 条目，跳过')
  }
}

// 4. 前提验证：缺任何一项都说明环境不完整，启用前必须先修复
log('步骤 2/3 验证前提条件')
const checks = []
checks.push(['@local junction 存在', existsSync(join(LINK, 'package.json'))])
let lockOk = false
try {
  lockOk = readFileSync(join(PROFILE, 'pnpm-lock.yaml'), 'utf8').includes('reply-forge')
} catch { /* 忽略 */ }
checks.push(['lockfile 已登记', lockOk])
checks.push(['client.js 产物存在', existsSync(join(LINK, '.dsh-plugin', 'client.js'))])
let bad = 0
for (const [label, ok] of checks) {
  console.log('    ' + (ok ? '[OK]   ' : '[缺失] ') + label)
  if (!ok) bad += 1
}

log('步骤 3/3 结论')
if (bad > 0) {
  fail('前提条件未满足：请先完全退出 DSH，再运行「重装插件.bat」')
}
console.log('\n启用就绪。请重启 DSH 桌面端加载插件。')
console.log('若启动异常，运行「关闭插件.bat」一键回滚（或还原 .bak-enable-* 备份）。')
