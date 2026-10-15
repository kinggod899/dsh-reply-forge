// 诊断脚本的路径解析：本机路径不随仓库分发。
//
// 优先级（从高到低）：
//   1. 环境变量 DSH_PROFILE / DSH_CHECKOUT / DSH_WORKSPACE / DSH_HOME；
//   2. scripts/diag.config.json（本地文件，已在 .gitignore），形如
//      { "checkout": "D:/dscheckout", "workspace": "D:/work", "profile": "..." }；
//   3. 缺省：profile 取 ~/.dsh/profiles/desktop；checkout 无缺省（必须给，
//      缺了直接报错退出——dev checkout 只有开发机有）。
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))

export function diagPaths() {
  let cfg = {}
  const cfgPath = join(HERE, 'diag.config.json')
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(readFileSync(cfgPath, 'utf8')) } catch { cfg = {} }
  }
  const dshHome = process.env.DSH_HOME ?? cfg.home ?? join(os.homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE ?? cfg.profile ?? join(dshHome, 'profiles', 'desktop')
  const checkout = process.env.DSH_CHECKOUT ?? cfg.checkout ?? ''
  const workspace = process.env.DSH_WORKSPACE ?? cfg.workspace ?? ''
  return { profile, checkout, workspace, dshHome }
}

/** dev checkout 校验：缺了给出明确指引并以非零码退出。 */
export function requireCheckout(checkout) {
  if (checkout === '' || !existsSync(checkout + '/node_modules/.anchor.cjs')) {
    console.error('[diag] 未找到 dsh dev checkout（含全套 node_modules 的源码检出）。')
    console.error('[diag] 请设置环境变量 DSH_CHECKOUT，或创建 scripts/diag.config.json：')
    console.error('[diag]   { "checkout": "D:/path/to/dsh-checkout", "workspace": "D:/path/to/workspace" }')
    process.exit(1)
  }
  return checkout
}
