/**
 * server.ts（本地 Express 入口）端到端冒烟测试
 *
 * 这层此前完全没有覆盖：Express 4 升 5 之后 `app.all('/api/*')` 在
 * path-to-regexp 8 下启动即抛 PathError，而 typecheck / lint / 其余测试全绿，
 * 因为问题只发生在「导入 server.ts」这一步。下面的用例把 server 起在随机端口上，
 * 用真实 HTTP 请求验证路由确实挂上了。
 *
 * 全程离线：fetch 被替换成必定抛错的桩，STEAM_API_KEY / STEAM_USER_ID 被覆盖成
 * 测试值，因此业务分支要么在参数校验处返回，要么走到桩并失败，不会发出真实网络请求。
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORS_HEADERS } from '../lib/app.js'
import type { Express } from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'

interface ErrorBody {
  success: boolean
  error: string
  code: string
}

interface Result {
  status: number
  headers: Headers
  body: ErrorBody | Record<string, unknown> | undefined
}

// server.ts 在被 import 时不会自动监听（入口守卫比较的是 process.argv[1]），
// 这里自己 listen(0)，端口由操作系统分配，避免和开发中的服务撞端口
let server: Server
let baseUrl: string

// fetch 桩之后测试自己发请求还要用真正的 fetch，先留住原始引用
const realFetch = globalThis.fetch
const failingFetch = vi.fn(() => Promise.reject(new Error('network disabled in tests')))

async function request(path: string, init?: RequestInit): Promise<Result> {
  const response = await realFetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(3000),
  })
  const text = await response.text()

  return {
    status: response.status,
    headers: response.headers,
    body: text ? JSON.parse(text) : undefined,
  }
}

function expectCorsHeaders(headers: Headers) {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    expect(headers.get(name)).toBe(value)
  }
}

beforeAll(async () => {
  vi.stubGlobal('fetch', failingFetch)
  // dotenv 在 import 时已经把真实密钥写进 process.env，这里换成固定的假值，
  // 让 validateEnvironment 的结果不依赖本机 .env 的内容
  vi.stubEnv('STEAM_API_KEY', 'test-api-key')
  vi.stubEnv('STEAM_USER_ID', '76561198000000000')
  vi.stubEnv('ADMIN_TOKEN', '')

  const app = (await import('../server.js')).default as Express
  server = await new Promise<Server>(resolve => {
    const listening = app.listen(0, () => resolve(listening))
  })
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

// fetch 桩是同一个 mock 实例，用例间要清零，否则「本用例没触网」的断言会被前一个用例污染
beforeEach(() => {
  failingFetch.mockClear()
})

afterAll(async () => {
  const { cache } = await import('../lib/cache.js')
  cache.destroy()

  await new Promise<void>((resolve, reject) => {
    server.close(err => (err ? reject(err) : resolve()))
  })

  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('健康检查', () => {
  it('GET /health 返回 200 与 status: ok', async () => {
    const { status, body } = await request('/health')

    expect(status).toBe(200)
    expect(body).toMatchObject({ status: 'ok' })
    expect(String((body as { timestamp: string }).timestamp)).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    )
  })

  it('/health 带 JSON Content-Type', async () => {
    const { headers } = await request('/health')

    expect(headers.get('content-type')).toBe(CORS_HEADERS['Content-Type'])
  })
})

describe('API 路由挂载', () => {
  // fetch 被桩成必定失败：能拿到各路由自己的错误文案，说明请求进到了对应 handler
  it.each([
    ['/api/steam-user', 'Failed to fetch Steam user data'],
    ['/api/steam-games', 'Failed to fetch Steam games data'],
    ['/api/steam-achievements', 'Failed to fetch Steam achievements data'],
  ])('GET %s 命中路由而不是 404 fallback', async (path, message) => {
    const { status, body } = await request(path)

    expect(status).toBe(500)
    expect(body).toMatchObject({ success: false, error: message, code: 'STEAM_API_ERROR' })
    expect(failingFetch).toHaveBeenCalled()
  })

  it('GET /api/steam-game 命中路由，缺 appid 时在业务调用前返回', async () => {
    const { status, body } = await request('/api/steam-game')

    expect(status).toBe(400)
    expect(body).toMatchObject({ code: 'MISSING_PARAM' })
    expect(failingFetch).not.toHaveBeenCalled()
  })

  it.each([
    ['/api/steam-game?appid=abc', 'INVALID_PARAM'],
    ['/api/steam-game?appid=0', 'INVALID_PARAM'],
    ['/api/steam-game?appid=-1', 'INVALID_PARAM'],
  ])('GET %s 返回 400 且不触网', async (path, code) => {
    const { status, body } = await request(path)

    expect(status).toBe(400)
    expect(body).toMatchObject({ code })
    expect(failingFetch).not.toHaveBeenCalled()
  })

  it('路由上的响应头与 CORS_HEADERS 一致', async () => {
    const { headers } = await request('/api/steam-game')

    expectCorsHeaders(headers)
  })
})

describe('通配符匹配范围', () => {
  // Express 5 的 '/api/*splat' 要求 /api/ 之后至少有一段，这两条锁住该边界
  it.each(['/api', '/api/', '/api/unknown'])('%s 落到 404 fallback', async path => {
    const { status, body } = await request(path)

    expect(status).toBe(404)
    expect(body).toMatchObject({ code: 'NOT_FOUND' })
    expect(failingFetch).not.toHaveBeenCalled()
  })

  it.each(['/unknown', '/', '/steam-user'])('%s 未挂载任何路由，返回 404', async path => {
    const { status, body } = await request(path)

    expect(status).toBe(404)
    expect(body).toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('404 fallback 与 CORS', () => {
  it('未知路径返回 404 且带完整 CORS 头', async () => {
    const { status, headers, body } = await request('/definitely-not-a-route')

    expect(status).toBe(404)
    expect(body).toMatchObject({ success: false, error: 'Not found', code: 'NOT_FOUND' })
    expectCorsHeaders(headers)
  })
})

describe('HTTP 方法与预检', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%s /api/steam-user 返回 405，说明 app.all 覆盖了全部方法',
    async method => {
      const { status, body } = await request('/api/steam-user', { method })

      expect(status).toBe(405)
      expect(body).toMatchObject({ code: 'METHOD_NOT_ALLOWED' })
    }
  )

  it('OPTIONS 预检返回 200 且带完整 CORS 头，响应体为空', async () => {
    const { status, headers, body } = await request('/api/steam-user', { method: 'OPTIONS' })

    expect(status).toBe(200)
    expect(body).toBeUndefined()
    expectCorsHeaders(headers)
    expect(headers.get('access-control-allow-methods')).toContain('GET')
  })
})
