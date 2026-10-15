// 只读 HTTP 路由：把会话落盘记录暴露给浏览器 half 的 UI（同源 fetch）。
//
// 路由形态与邻居插件 dsh-tavern 的生产用法一致：
// { kind: 'exact', path, handler } + ctx.webServer.register(route)。
// handler 收原生 node req/res，自行回 JSON。
//
// 安全边界：本文件只读；sessionId 经 session-log 的安全字符校验，
// 任何形态的目录穿越都在 findSessionFile 入口被拦死。
//
// 写回路由（编辑落盘）在验证通过前不得加入本文件——见 HANDOFF §10。

import { assistantTextBlocks, findSessionFile, readSessionEvents, sessionsRootDefault, thinkingSignatureStats } from './session-log.mjs'

function json(res, status, body) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(body))
}

/**
 * 注册本插件的只读路由。webServer 缺失（个别 profile 无该服务）时
 * 静默跳过：本插件的核心能力在浏览器 half，宿主侧路由只是增强。
 * @param {{ register: Function } | undefined} webServer 宿主 webServer 服务
 */
export function registerRoutes(webServer) {
  if (webServer === undefined || webServer === null || typeof webServer.register !== 'function') return
  webServer.register({
    kind: 'exact',
    path: '/api/reply-forge/session/record',
    handler: (req, res) => {
      let url
      try {
        url = new URL(req.url, 'http://127.0.0.1')
      } catch {
        json(res, 400, { ok: false, error: 'bad request url' })
        return
      }
      const sessionId = url.searchParams.get('sessionId') ?? ''
      if (sessionId === '') {
        json(res, 400, { ok: false, error: 'sessionId required' })
        return
      }
      const file = findSessionFile(sessionsRootDefault(), sessionId)
      if (file === null) {
        json(res, 404, { ok: false, error: 'session log not found' })
        return
      }
      try {
        const events = readSessionEvents(file)
        const rawLimit = Number(url.searchParams.get('limit') ?? '50')
        const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 200) : 50
        const blocks = assistantTextBlocks(events)
        json(res, 200, {
          ok: true,
          sessionId,
          file: String(file),
          events: events.length,
          totalAssistantBlocks: blocks.length,
          assistantTextBlocks: blocks.slice(-limit),
          signatures: thinkingSignatureStats(events),
        })
      } catch (error) {
        json(res, 500, { ok: false, error: String(error?.message ?? error) })
      }
    },
  })
}
