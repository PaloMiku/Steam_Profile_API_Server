/**
 * ADMIN_TOKEN 鉴权与 clear_cache 的缓存指令
 * 全程离线：fetch 被替换成必定抛错的桩
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRequest } from '../lib/app.js'
import type { Env } from '../lib/app.js'

vi.mock('../lib/handler.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/handler.js')>()
  return {
    ...actual,
    handleSteamGamesRequest: vi.fn(async () => ({
      data: { games: { totalCount: 0, recentCount: 0, recentGames: [], allGames: [] } },
      cacheHit: false,
      cachedAt: '2026-01-01T00:00:00.000Z',
      cacheExpiry: '2026-01-02T00:00:00.000Z',
    })),
  }
})

const TOKEN = 'super-secret-token'
const ORIGIN = 'https://example.com'

const ENV_WITH_TOKEN: Env = {
  STEAM_API_KEY: 'test-api-key',
  STEAM_USER_ID: '76561198000000000',
  ADMIN_TOKEN: TOKEN,
}

const ENV_WITHOUT_TOKEN: Env = {
  STEAM_API_KEY: 'test-api-key',
  STEAM_USER_ID: '76561198000000000',
}

function call(path: string, init?: RequestInit, env: Env = ENV_WITH_TOKEN) {
  return handleRequest(new Request(`${ORIGIN}${path}`, init), env)
}

async function payload(response: Response) {
  return (await response.json()) as { success: boolean; error: string; code: string }
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ADMIN_TOKEN 未配置时', () => {
  it('clear_cache 不需要鉴权，保持向后兼容', async () => {
    const response = await call('/api/steam-games?clear_cache=true', undefined, ENV_WITHOUT_TOKEN)
    const body = await payload(response)

    expect(response.status).not.toBe(401)
    expect(body.code).not.toBe('UNAUTHORIZED')
  })
})

describe('ADMIN_TOKEN 已配置时', () => {
  it('缺少 token 返回 401 UNAUTHORIZED', async () => {
    const response = await call('/api/steam-games?clear_cache=true')
    const body = await payload(response)

    expect(response.status).toBe(401)
    expect(body.success).toBe(false)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('错误的 query token 返回 401', async () => {
    const response = await call('/api/steam-games?clear_cache=1&admin_token=wrong')
    const body = await payload(response)

    expect(response.status).toBe(401)
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('正确的 query token 放行', async () => {
    const response = await call(`/api/steam-games?clear_cache=true&admin_token=${TOKEN}`)
    const body = await payload(response)

    expect(response.status).not.toBe(401)
    expect(body.code).not.toBe('UNAUTHORIZED')
  })

  it('Authorization: Bearer 头被接受', async () => {
    const response = await call('/api/steam-games?clear_cache=true', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const body = await payload(response)

    expect(response.status).not.toBe(401)
    expect(body.code).not.toBe('UNAUTHORIZED')
  })

  it('Authorization 头优先于错误的 query token', async () => {
    const response = await call('/api/steam-games?clear_cache=true&admin_token=wrong', {
      headers: { Authorization: `Bearer ${TOKEN}` },
    })
    const body = await payload(response)

    expect(response.status).not.toBe(401)
    expect(body.code).not.toBe('UNAUTHORIZED')
  })

  it('错误的 Bearer 头即使 query 正确也拒绝', async () => {
    const response = await call(`/api/steam-games?clear_cache=true&admin_token=${TOKEN}`, {
      headers: { Authorization: 'Bearer wrong' },
    })

    expect(response.status).toBe(401)
  })

  it('未带 clear_cache 时不校验 token', async () => {
    const response = await call('/api/steam-games')
    const body = await payload(response)

    expect(response.status).not.toBe(401)
    expect(body.code).not.toBe('UNAUTHORIZED')
  })
})

describe('clear_cache 响应的缓存指令', () => {
  it('实际执行清缓存的响应为 no-store', async () => {
    const response = await call(`/api/steam-games?clear_cache=true&admin_token=${TOKEN}`)

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
  })

  it('未清缓存的正常请求仍带 s-maxage', async () => {
    const response = await call('/api/steam-games')

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe(
      'public, s-maxage=86400, stale-while-revalidate=3600'
    )
  })

  it('鉴权失败的 401 不带 s-maxage', async () => {
    const response = await call('/api/steam-games?clear_cache=true&admin_token=wrong')

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBeNull()
  })
})
