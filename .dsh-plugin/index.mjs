// dsh-reply-forge Node half：宿主侧只读地基。
//
// 分层契约：
//   - 浏览器 half（.dsh-plugin/client.js，构建产物）：UI、渲染层编辑、
//     localStorage 持久化。事件落盘记录的查看能力走本文件注册的只读路由。
//   - 本文件（Node half）：只消费宿主 webServer 服务注册只读路由，
//     不写任何会话文件——写回路径未经验证前不存在（HANDOFF §10）。
//
// 路由注册形态与邻居插件 dsh-tavern 一致：ctx.webServer.register。
// webServer 服务缺失时静默降级（插件核心能力不依赖宿主侧）。
//
// 契约：官方 bundle 插件 Node half（package.json 的 dsh.bundle +
// dsh.client；产物 build-client.mjs 只处理浏览器 half）。

import { registerRoutes } from './server/routes.mjs'

export const name = '@local/dsh-reply-forge'

export const inject = ['webServer']

export function apply(ctx) {
  try {
    registerRoutes(ctx?.webServer)
  } catch {
    // 宿主服务异常绝不影响插件加载；浏览器 half 不受影响
  }
}
