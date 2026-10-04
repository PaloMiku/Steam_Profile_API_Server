/**
 * lib/app.ts 路由分发与环境校验
 * 全程离线：fetch 被替换成必定抛错的桩，任何业务分支都不会发出真实请求
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORS_HEADERS, handleRequest } from '../lib/app.js'
import type { Env } from '../lib/app.js'

const VALID_ENV: Env = {
  STEAM_API_KEY: 'test-api-key',
  STEAM_USER_ID: '76561198000000000',
}

const ORIGIN = 'https://example.com'

function call(path: string, init?: RequestInit, env: Env = VALID_ENV) {
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

describe('CORS 预检', () => {
  it('OPTIONS 返回 200 且带完整 CORS 头', async () => {
    const response = await call('/api/steam-user', { method: 'OPTIONS' }, {})

    expect(response.status).toBe(200)
    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })

  it('OPTIONS 预检不校验环境变量', async () => {
    const response = await call('/api/steam-user', { method: 'OPTIONS' }, {})

    expect(response.status).toBe(200)
  })
})

describe('HTTP 方法校验', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s 返回 405 METHOD_NOT_ALLOWED', async method => {
    const response = await call('/api/steam-user', { method })
    const body = await payload(response)

    expect(response.status).toBe(405)
    expect(body.success).toBe(false)
    expect(body.code).toBe('METHOD_NOT_ALLOWED')
  })

  it('方法校验早于路由匹配，未知路径上的 POST 也返回 405', async () => {
    const response = await call('/not-a-route', { method: 'POST' })

    expect(response.status).toBe(405)
  })
})

describe('路由匹配', () => {
  it.each([
    '/',
    '/api',
    '/api/',
    '/unknown',
    '/api/unknown',
    '/api/steam-users',
    '/api/steam-user/extra',
    '/steam',
  ])('%s 返回 404 NOT_FOUND', async path => {
    const response = await call(path, undefined, {})
    const body = await payload(response)

    expect(response.status).toBe(404)
    expect(body.code).toBe('NOT_FOUND')
  })

  it.each(['/api/steam-user', '/api/steam-user/', '/steam-user', '/steam-user/'])(
    '%s 归一化到同一个路由',
    async path => {
      // env 不合法时，已命中的路由会停在环境校验（ENV_ERROR），未命中的路径则是 404
      const response = await call(path, undefined, {})
      const body = await payload(response)

      expect(response.status).toBe(500)
      expect(body.code).toBe('ENV_ERROR')
    }
  )

  it.each(['/api/steam-user', '/api/steam-user/', '/steam-user', '/steam-user/'])(
    '%s 归一化后能进入业务分支',
    async path => {
      const response = await call(path)
      const body = await payload(response)

      expect(response.status).toBe(500)
      expect(body.code).toBe('STEAM_API_ERROR')
    }
  )

  it.each(['/api/steam-games', '/steam-games', '/api/steam-achievements', '/steam-achievements'])(
    '%s 是已注册路由',
    async path => {
      const response = await call(path)
      const body = await payload(response)

      expect(response.code ?? body.code).toBe('STEAM_API_ERROR')
    }
  )

  it('根挂载下 steam-game 也已注册', async () => {
    const response = await call('/steam-game?appid=730')
    const body = await payload(response)

    expect(body.code).toBe('STEAM_API_ERROR')
  })
})

describe('环境变量校验', () => {
  it('env 为空对象时返回 500 ENV_ERROR', async () => {
    const response = await call('/api/steam-user', undefined, {})
    const body = await payload(response)

    expect(response.status).toBe(500)
    expect(body.success).toBe(false)
    expect(body.code).toBe('ENV_ERROR')
    expect(body.error).toContain('STEAM_API_KEY')
  })

  it('缺少 STEAM_USER_ID 时返回 ENV_ERROR', async () => {
    const response = await call('/api/steam-user', undefined, { STEAM_API_KEY: 'k' })
    const body = await payload(response)

    expect(response.status).toBe(500)
    expect(body.error).toContain('STEAM_USER_ID')
  })

  it('空的 STEAM_API_KEY 视为未设置', async () => {
    const response = await call('/api/steam-user', undefined, {
      STEAM_API_KEY: '',
      STEAM_USER_ID: '76561198000000000',
    })
    const body = await payload(response)

    expect(response.status).toBe(500)
    expect(body.code).toBe('ENV_ERROR')
  })

  it.each([
    ['16 位', '7656119800000000'],
    ['18 位', '765611980000000000'],
    ['含字母', '76561198abcdefg0'],
    ['带空格', ' 76561198000000000'],
    ['空字符串', ''],
  ])('STEAM_USER_ID %s 时返回 ENV_ERROR', async (_label, steamUserId) => {
    const response = await call('/api/steam-user', undefined, {
      STEAM_API_KEY: 'k',
      STEAM_USER_ID: steamUserId,
    })
    const body = await payload(response)

    expect(response.status).toBe(500)
    expect(body.code).toBe('ENV_ERROR')
  })

  it('合法的 17 位 STEAM_USER_ID 通过校验', async () => {
    const response = await call('/api/steam-user')
    const body = await payload(response)

    // fetch 桩抛错说明请求已经走到业务层，环境校验放行了
    expect(body.code).toBe('STEAM_API_ERROR')
  })
})

describe('steam-game 的 appid 校验', () => {
  it.each([
    ['缺失', undefined],
    ['空值', ''],
  ])('appid %s 返回 400 MISSING_PARAM', async (_label, appid) => {
    const search = appid === undefined ? '' : `?appid=${encodeURIComponent(appid)}`
    const response = await call(`/api/steam-game${search}`)
    const body = await payload(response)

    expect(response.status).toBe(400)
    expect(body.code).toBe('MISSING_PARAM')
  })

  it.each(['0', '-5', 'abc', '   '])('appid=%s 返回 400 INVALID_PARAM', async appid => {
    const response = await call(`/api/steam-game?appid=${encodeURIComponent(appid)}`)
    const body = await payload(response)

    expect(response.status).toBe(400)
    expect(body.code).toBe('INVALID_PARAM')
  })

  it('appid 走 parseInt，开头是数字的脏值会被接受', async () => {
    // 当前实现只用 parseInt 判有效，"12abc" 会被当成 12 放行
    const response = await call('/api/steam-game?appid=12abc')
    const body = await payload(response)

    expect(body.code).toBe('STEAM_API_ERROR')
  })

  it('合法的 appid 会通过校验进入业务层', async () => {
    const response = await call('/api/steam-game?appid=730')
    const body = await payload(response)

    expect(response.status).toBe(500)
    expect(body.code).toBe('STEAM_API_ERROR')
  })

  it('appid 校验发生在环境校验之后', async () => {
    const response = await call('/api/steam-game', undefined, {})
    const body = await payload(response)

    expect(body.code).toBe('ENV_ERROR')
  })

  it('根挂载路径下的 appid 校验同样生效', async () => {
    const response = await call('/steam-game?appid=0')
    const body = await payload(response)

    expect(response.status).toBe(400)
    expect(body.code).toBe('INVALID_PARAM')
  })
})

describe('CORS 头出现在所有响应上', () => {
  const cases: Array<{ name: string; path: string; init?: RequestInit; env?: Env }> = [
    { name: 'OPTIONS 预检', path: '/api/steam-user', init: { method: 'OPTIONS' } },
    { name: '方法不允许', path: '/api/steam-user', init: { method: 'POST' } },
    { name: '路由未命中', path: '/nope' },
    { name: '环境错误', path: '/api/steam-user', env: {} },
    { name: '缺少参数', path: '/api/steam-game' },
    { name: '业务失败', path: '/api/steam-user' },
  ]

  it.each(cases)('$name', async ({ path, init, env }) => {
    const response = await call(path, init, env ?? VALID_ENV)

    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      expect(response.headers.get(name)).toBe(value)
    }
  })
})
