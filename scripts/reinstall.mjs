// 一键重装：修复 node_modules 残缺 + 登记 dsh-reply-forge。
//
// 使用时机：关闭 DSH 桌面端后，双击仓库根的「重装插件.bat」，
// 或在任意终端执行 node scripts/reinstall.mjs。
//
// 它按顺序做五件事，全部有备份、失败即停并说明原因：
//  1. 备份 profile 的 package.json 与 cordis.patch.yml；
//  2. 重建 @local 下两个本地插件的链接（junction，不需要管理员权限）；
//  3. 跑 pnpm install（优先离线，走已更新的 lockfile）；
//  4. 验证关键产物是否就位；
//  5. 输出结论与后续动作。

import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, copyFileSync, mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PROFILE = process.env.DSH_PROFILE_DIR ?? 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop'
const NODE_MODULES = join(PROFILE, 'node_modules')
const LOCAL_DIR = join(NODE_MODULES, '@local')
const LINKS = [
  { name: 'dsh-free-design-preset', target: 'E:\\文档\\dsh-free-design-preset' },
  { name: 'dsh-reply-forge', target: 'E:\\文档\\dsh-reply-forge' },
]

const log = (...a) => console.log('[reinstall]', ...a)
const fail = msg => { console.error('[reinstall] 失败：' + msg); process.exit(1) }
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

// 1. 备份
log('步骤 1/5 备份配置')
const ts = stamp()
for (const f of ['package.json', 'cordis.patch.yml']) {
  const src = join(PROFILE, f)
  if (!existsSync(src)) { log('  跳过（不存在）' + f); continue }
  const dest = src + '.bak-reinstall-' + ts
  copyFileSync(src, dest)
  log('  ' + f + ' → ' + dest.split('\\').pop())
}

// 2. 链接
log('步骤 2/5 重建 @local 链接')
if (!existsSync(LOCAL_DIR)) {
  try { readdirSync(NODE_MODULES) } catch { fail('node_modules 不可读：' + NODE_MODULES) }
  try {
    mkdirSync(LOCAL_DIR, { recursive: true })
    log('  已创建 @local 目录')
  } catch (e) { fail('无法创建 @local：' + String(e?.message ?? e)) }
}
for (const link of LINKS) {
  const dest = join(LOCAL_DIR, link.name)
  if (existsSync(dest)) { log('  已存在 ' + link.name); continue }
  const r = spawnSync('cmd', ['/c', 'mklink', '/J', dest, link.target], { stdio: 'inherit' })
  if (r.status !== 0) log('  警告：' + link.name + ' 链接创建失败（pnpm 稍后会自己创建）')
  else log('  已链接 ' + link.name)
}

// 3. pnpm install
log('步骤 3/5 安装依赖（优先离线）')
const sandboxNodeDir = 'C:\\Users\\Administrator\\AppData\\Local\\Doubao\\User Data\\sandbox_runtime\\bases\\d0ace100fdff5b2d247847aca1e3d83b\\node'
const pnpmCandidates = [
  process.env.DSH_PNPM ?? '',
  // 优先同目录自带的 pnpm.exe：可被 CreateProcess 直接拉起，
  // 彻底绕开 cmd 对含空格路径（“Doubao\User Data”）的引号处理问题。
  sandboxNodeDir + '\\node_modules\\pnpm\\pnpm.exe',
  sandboxNodeDir + '\\pnpm.cmd',
  'pnpm',
].filter(Boolean)

let pnpm = null
for (const c of pnpmCandidates) {
  if (c === 'pnpm') {
    const r = spawnSync('cmd', ['/c', 'where', 'pnpm'], { stdio: 'ignore' })
    if (r.status === 0) { pnpm = 'pnpm'; break }
    continue
  }
  if (existsSync(c)) { pnpm = c; break }
}
if (pnpm === null) fail('未找到 pnpm，请在 DSH 之外的终端手动执行：cd ' + PROFILE + ' && pnpm install')

// 执行入口：
// - .exe 直接 spawn，argv 由 node 正确加引号，最稳；
// - .cmd / PATH 名走 cmd /c：整条命令外再包一层引号，cmd 会剥掉最外层一对，
//   内层路径引号才保留。务必配合 windowsVerbatimArguments，否则 node 会把
//   引号转义成 \"，cmd 直接报“不是内部或外部命令”。
const runPnpm = args => {
  const fullArgs = [...args, '--dir', PROFILE]
  if (/\.exe$/i.test(pnpm)) {
    return spawnSync(pnpm, fullArgs, { cwd: PROFILE, stdio: 'inherit' })
  }
  const cmdLine = '""' + pnpm + '" ' + args.join(' ') + ' --dir "' + PROFILE + '""'
  return spawnSync('cmd', ['/c', cmdLine], { cwd: PROFILE, stdio: 'inherit', windowsVerbatimArguments: true })
}

log('  使用 pnpm：' + pnpm)
for (const args of [['install', '--offline'], ['install', '--prefer-offline']]) {
  log('  执行 pnpm ' + args.join(' '))
  const r = runPnpm(args)
  if (r.status === 0) { log('  安装成功'); break }
  log('  该方式失败（exit ' + r.status + '），尝试下一种')
}

// 4. 验证
log('步骤 4/5 验证产物')
const checks = []
const want = [
  ['@local/dsh-reply-forge', join(LOCAL_DIR, 'dsh-reply-forge', 'package.json')],
  ['@local/dsh-free-design-preset', join(LOCAL_DIR, 'dsh-free-design-preset', 'package.json')],
  ['dsh-better-sidebar', join(NODE_MODULES, 'dsh-better-sidebar', 'package.json')],
  ['gal-view', join(NODE_MODULES, 'gal-view', 'package.json')],
  ['dsh-preset-novel-mode', join(NODE_MODULES, 'dsh-preset-novel-mode', 'package.json')],
]
for (const [label, file] of want) {
  checks.push([label, existsSync(file)])
}

// lockfile 登记
let lockOk = false
try {
  lockOk = readFileSync(join(PROFILE, 'pnpm-lock.yaml'), 'utf8').includes('reply-forge')
} catch { /* 忽略 */ }
checks.push(['lockfile 含 reply-forge', lockOk])

// 包总数（残缺时应远低于 100）
let count = 0
try { count = readdirSync(NODE_MODULES, { withFileTypes: true }).filter(e => e.isDirectory()).length } catch { /* 忽略 */ }
checks.push(['node_modules 包数 >= 90（当前 ' + count + '）', count >= 90])

// 插件产物可解析
let clientOk = false
try {
  const pkg = JSON.parse(readFileSync(join(LOCAL_DIR, 'dsh-reply-forge', 'package.json'), 'utf8'))
  const rel = pkg?.exports?.['./client']
  clientOk = typeof rel === 'string'
    && existsSync(join(LOCAL_DIR, 'dsh-reply-forge', rel.replace('./', '').split('/').join('\\')))
} catch { /* 忽略 */ }
checks.push(['client 产物可解析', clientOk])

let bad = 0
for (const [label, ok] of checks) {
  console.log('    ' + (ok ? '[OK]   ' : '[缺失] ') + label)
  if (!ok) bad += 1
}

// 5. 结论
log('步骤 5/5 结论')
if (bad === 0) {
  console.log('\n全部就位。现在可以启动 DSH 桌面端。')
  console.log('若仍启动异常，执行「关闭插件.bat」一键回滚。')
} else {
  console.log('\n有 ' + bad + ' 项未就位。常见原因与处理：')
  console.log('  - 权限不足 → 以管理员身份重新运行本脚本')
  console.log('  - 离线缓存缺包 → 联网后重跑，或在 DSH 插件管理器里点「重装」')
  console.log('  - 仍无法恢复 → 用 package.json.bak-reinstall-' + ts + ' 还原后重启 DSH')
  process.exit(1)
}
