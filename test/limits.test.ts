/**
 * steam-games 的 limit 钳制逻辑与路径归一化
 *
 * 钳制发生在路由分发之后，URL 上看不到最终生效的 limit，
 * 所以这里桩掉 handleSteamGamesRequest，直接断言真正传下去的参数
 * 全程离线：fetch 被替换成必定抛错的桩，任何业务分支都不会发出真实请求
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleRequest, routeNameOf } from '../lib/app.js'
import { DEFAULT_GAME_LIMIT, MAX_GAME_LIMIT } from '../lib/types.js'
import type { Env } from '../lib/app.js'
import { handleSteamGamesRequest } from '../lib/handler.js'

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

const mockedGames = vi.mocked(handleSteamGamesRequest)

const ORIGIN = 'https://example.com'
const GAMES_ROUTE = '/api/steam-games'

const VALID_ENV: Env = {
  STEAM_API_KEY: 'test-api-key',
  STEAM_USER_ID: '76561198000000000',
}

/**
 * 请求 steam-games 并返回真正传给 handler 的 limit
 */
async function limitPassedToHandler(query?: string): Promise<number> {
  const path = query === undefined ? GAMES_ROUTE : `${GAMES_ROUTE}?${query}`
  const response = await handleRequest(new Request(`${ORIGIN}${path}`), VALID_ENV)

  expect(response.status).toBe(200)
  expect(mockedGames).toHaveBeenCalledTimes(1)
  return mockedGames.mock.calls[0][3]
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network disabled in tests'))))
  vi.clearAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('limit 常量', () => {
  it('MAX_GAME_LIMIT 锁在 100', () => {
    expect(MAX_GAME_LIMIT).toBe(100)
  })

  it('DEFAULT_GAME_LIMIT 锁在 50', () => {
    expect(DEFAULT_GAME_LIMIT).toBe(50)
  })

  it('默认值不超过上限，否则任何回退值都会被钳制再次拒绝', () => {
    expect(DEFAULT_GAME_LIMIT).toBeLessThanOrEqual(MAX_GAME_LIMIT)
  })
})

describe('limit 的合法取值', () => {
  it('不传 limit 时用默认值', async () => {
    await expect(limitPassedToHandler()).resolves.toBe(50)
  })

  it('limit=1 取下界', async () => {
    await expect(limitPassedToHandler('limit=1')).resolves.toBe(1)
  })

  it('limit=100 取上界', async () => {
    await expect(limitPassedToHandler('limit=100')).resolves.toBe(100)
  })

  it('中间值原样透传', async () => {
    await expect(limitPassedToHandler('limit=37')).resolves.toBe(37)
  })
})

describe('limit 越界与非法时回落到默认值', () => {
  // 越界不做截断（不是 clamp），一律回落到默认值
  it.each([
    ['0', 'limit=0'],
    ['101', 'limit=101'],
    ['9999', 'limit=9999'],
    ['-5', 'limit=-5'],
    ['abc', 'limit=abc'],
    ['空字符串', 'limit='],
    ['只有空格', 'limit=%20'],
    ['Infinity', 'limit=Infinity'],
  ])('limit=%s 回落 50', async (_label, query) => {
    await expect(limitPassedToHandler(query)).resolves.toBe(50)
  })
})

describe('limit 走 parseInt 的部分解析行为', () => {
  // parseInt 不是严格校验：前缀是数字就取前缀，当前的真实行为，锁住避免无意改动
  it('limit=12abc 被当作 12', async () => {
    await expect(limitPassedToHandler('limit=12abc')).resolves.toBe(12)
  })

  it('limit=50.9 取整为 50', async () => {
    await expect(limitPassedToHandler('limit=50.9')).resolves.toBe(50)
  })

  it('limit=0x10 只取到 0 后回落', async () => {
    await expect(limitPassedToHandler('limit=0x10')).resolves.toBe(50)
  })

  it('limit=1e2 只取到 1', async () => {
    await expect(limitPassedToHandler('limit=1e2')).resolves.toBe(1)
  })

  it('limit=1e999 只取到 1，不会变成 Infinity 触发回落', async () => {
    await expect(limitPassedToHandler('limit=1e999')).resolves.toBe(1)
  })

  it('前后空白被 parseInt 忽略', async () => {
    await expect(limitPassedToHandler('limit=%20%207%20')).resolves.toBe(7)
  })
})

describe('limit 钳制不干扰其他查询参数', () => {
  it('cc 与 limit 可以共存，limit 仍被钳制', async () => {
    await expect(limitPassedToHandler('limit=abc&cc=us')).resolves.toBe(50)
  })

  it('clear_cache 不改变 limit 计算', async () => {
    await expect(limitPassedToHandler('limit=200&clear_cache=1')).resolves.toBe(50)
  })
})

describe('routeNameOf 路径归一化', () => {
  it.each([
    '/api/steam-user',
    '/api/steam-user/',
    '/steam-user',
    '/steam-user/',
  ])('%s 归一化为 steam-user', pathname => {
    expect(routeNameOf(pathname)).toBe('steam-user')
  })

  it.each([
    '/api/steam-user//',
    '/api/steam-user///',
  ])('%s 的多余结尾斜杠被剥掉', pathname => {
    expect(routeNameOf(pathname)).toBe('steam-user')
  })

  it.each([
    '/api/steam-games',
    '/steam-games',
    '/api/steam-game',
    '/api/steam-achievements',
    '/steam-achievements',
  ])('%s 保留自己的路由名', pathname => {
    expect(routeNameOf(pathname)).toBe(pathname.replace(/^\/?api\//, '').replace(/^\//, ''))
  })

  it.each([
    '/',
    '/api',
    '/api/',
    '',
    '/unknown',
    '/api/unknown',
    '/api/steam-users',
    '/api/steam-user/extra',
    '/steam-user/extra',
    '/steam',
    // 大小写敏感，/API 不算前缀
    '/API/steam-user',
    // 只剥一个前导斜杠，双斜杠不匹配
    '//steam-user',
    '/api//steam-user',
    // 缺前导斜杠时 /api 前缀不匹配
    'api/steam-user',
  ])('%s 返回 null', pathname => {
    expect(routeNameOf(pathname)).toBeNull()
  })
})
