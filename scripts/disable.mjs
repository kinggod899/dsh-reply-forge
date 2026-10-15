// 一键关闭 dsh-reply-forge。崩溃后无法进 UI 时，直接双击运行或在终端执行：
//   node scripts/disable.mjs
//
// 它做三件事，全部可逆、全部有备份：
//  1. 从 profile 的 package.json 移除依赖与 bundle 条目；
//  2. 从 profile 的 cordis.patch.yml 移除本插件相关的 disabled 条目（若有）；
//  3. 删除 node_modules 里的链接。
//
// 不动覆盖数据（localStorage 里的 dsh-reply-forge:* 键），不动其它插件。
import { readFileSync, writeFileSync, existsSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const PROFILE = process.env.DSH_PROFILE_DIR ?? 'C:\\Users\\Administrator\\.dsh\\profiles\\desktop'
const PKG_ID = '@local/dsh-reply-forge'
const PATCH_ID = 'dsh-reply-forge'
const LINK = join(PROFILE, 'node_modules', '@local', 'dsh-reply-forge')

const log = (...a) => console.log('[disable]', ...a)
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-')

function backup(file) {
  if (!existsSync(file)) return null
  const dest = file + '.bak-' + stamp()
  copyFileSync(file, dest)
  return dest
}

// 1. package.json
const pkgPath = join(PROFILE, 'package.json')
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  let changed = false
  if (pkg.dependencies !== undefined && pkg.dependencies !== null && PKG_ID in pkg.dependencies) {
    delete pkg.dependencies[PKG_ID]
    changed = true
  }
  const bundles = pkg?.dsh?.profile?.bundles
  if (Array.isArray(bundles)) {
    const next = bundles.filter(b => b !== PKG_ID)
    if (next.length !== bundles.length) {
      pkg.dsh.profile.bundles = next
      changed = true
    }
  }
  if (changed) {
    const b = backup(pkgPath)
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    log('package.json 已清理' + (b === null ? '' : '（备份 ' + b + '）'))
  } else {
    log('package.json 无需改动')
  }
} else {
  log('未找到 package.json，跳过')
}

// 2. cordis.patch.yml：移除任何 id 为 dsh-reply-forge 的条目
const patchPath = join(PROFILE, 'cordis.patch.yml')
if (existsSync(patchPath)) {
  const raw = readFileSync(patchPath, 'utf8')
  const lines = raw.split(/\r?\n/)
  const kept = []
  let skipping = false
  let removed = 0
  for (const line of lines) {
    // 条目起始行："- id: dsh-reply-forge"
    if (/^\s*-\s*id:\s*['"]?dsh-reply-forge['"]?\s*$/.test(line)) {
      skipping = true
      removed += 1
      continue
    }
    // 下一个顶层条目开始则停止跳过
    if (skipping && /^\s*-\s+\w/.test(line)) skipping = false
    if (!skipping) kept.push(line)
  }
  if (removed > 0) {
    const b = backup(patchPath)
    writeFileSync(patchPath, kept.join('\n'))
    log('cordis.patch.yml 已移除 ' + removed + ' 条' + (b === null ? '' : '（备份 ' + b + '）'))
  } else {
    log('cordis.patch.yml 无本插件条目，跳过')
  }
}

// 3. node_modules 链接
if (existsSync(LINK)) {
  try {
    const st = statSync(LINK)
    rmSync(LINK, { recursive: st.isDirectory() && !st.isSymbolicLink(), force: true })
    log('已删除链接 ' + LINK)
  } catch (error) {
    // junction 在个别情况下需 cmd 处理
    log('删除链接失败：' + String(error?.message ?? error))
    log('请手动执行： rmdir "' + LINK + '"')
  }
} else {
  log('链接不存在，跳过')
}

log('完成。请重启 DSH 桌面端。')
