// 无头诊断启动器（scripts/web-diag.mjs）。
//
// 用途：把 dsh 的 Web 前端 + 宿主以 **web 模式** 无头拉起，用于排查
// client half 在真实 UI 里的行为（比如「插件看着启用但界面没反应」）。
// 桌面 GUI 起不来/没法看 DevTools 时，这条路能给出同样的运行时。
//
// 原理（2026-10-15 实战验证）：
//   - 桌面 profile 声明为 Electron 独占，CLI 拒绝直接启动它；
//   - 但 web profile 模板与 desktop 用的同一个 @deepseek-ai/dsh-web-app，
//     差别只在插件集合；
//   - 这里绕过 dsh CLI 的 profile 加载（dev checkout 的 app-boot 版本旧，
//     会被 dsh-preset-novel-mode 的数组形式 patch 声明卡住），改为：
//     读 desktop profile 的 package.json → 手工收集 [dsh-base,
//     dsh-web-app, @local/dsh-reply-forge] 三个 bundle 的 patch 层 →
//     直接调 app-boot 的 boot()；
//   - prepare 回调里用 dsh-cmdline 的 provideCmdline 提供
//     cmdlineArgs/appExit（web-startup 行等这两个服务来解析端口，
//     默认 3080）。
//
// 用法：
//   node scripts/web-diag.mjs
// 启动后打印带 token 的 URL，用任意浏览器打开即可看到带本插件的
// 完整 dsh Web UI。排查「按钮不出现」类问题时配合浏览器 DevTools：
//   window.__dshReplyForge        // 有值 = apply 跑过
//   document.querySelectorAll('[data-rf-taken]').length
//   document.querySelectorAll('[data-slot="conversation.chat.node"]').length
//
// 依赖：本机 dsh dev checkout（E:/game/DSH，含全套 node_modules）。
// 脚本通过 createRequire 锚定 checkout 解析 @deepseek-ai/*，与运行
// 时的工作目录无关。
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { readFileSync, existsSync } from 'node:fs'

const CHECKOUT = 'E:/game/DSH'
const require2 = createRequire(CHECKOUT + '/node_modules/.anchor.cjs')
const { boot, loadOverlayPatches } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-app-boot')).href)
const { provideCmdline } = await import(pathToFileURL(require2.resolve('@deepseek-ai/dsh-cmdline')).href)

const PROFILE = 'C:/Users/Administrator/.dsh/profiles/desktop'
// 精简集合：base + web-app 自带全套浏览器 roster（client-ui-* 都在
// dsh-web-app 的 patch 里），加本插件。其余 bundle（tavern 等）与
// 排查无关，只拖慢启动。
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

console.log('[web-diag] booting slim web host (base + web-app + reply-forge)...')
const ctx = await boot('dsh', PROFILE + '/cordis.yml', structuredClone(allPatches), prepare)
console.log('[web-diag] boot ok, fiber state:', ctx.fiber.state)
const cm = ctx.get('clientModules')
if (cm !== void 0) {
  const g = cm.graph()
  const ours = g.entries.some(e => e.id === '@local/dsh-reply-forge')
  console.log('[web-diag] client graph entries:', g.entries.length, '| reply-forge row:', ours)
}
console.log('[web-diag] 服务已就绪；URL（含 token）见上方 "dsh web:" 行')
// 保活
setInterval(() => {}, 1000)
