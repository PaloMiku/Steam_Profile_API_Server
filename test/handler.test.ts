/**
 * lib/handler.ts 里的纯函数：环境变量校验与缓存 TTL 换算
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCacheTTL, validateEnvironment } from '../lib/handler.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const VALID_STEAM_ID = '76561198000000000'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('validateEnvironment', () => {
  it('env 为空时提示 STEAM_API_KEY', () => {
    const result = validateEnvironment({})

    expect(result.valid).toBe(false)
    expect(result.error).toContain('STEAM_API_KEY')
  })

  it('只有 STEAM_API_KEY 时提示 STEAM_USER_ID', () => {
    const result = validateEnvironment({ STEAM_API_KEY: 'k' })

    expect(result.valid).toBe(false)
    expect(result.error).toContain('STEAM_USER_ID')
  })

  it('空的 STEAM_API_KEY 视为未设置', () => {
    const result = validateEnvironment({ STEAM_API_KEY: '', STEAM_USER_ID: VALID_STEAM_ID })

    expect(result.valid).toBe(false)
    expect(result.error).toContain('STEAM_API_KEY')
  })

  it('空的 STEAM_USER_ID 视为未设置', () => {
    const result = validateEnvironment({ STEAM_API_KEY: 'k', STEAM_USER_ID: '' })

    expect(result.valid).toBe(false)
    expect(result.error).toContain('STEAM_USER_ID')
  })

  it.each([
    ['位数不足', '7656119800000000'],
    ['位数超出', '765611980000000000'],
    ['混入字母', '76561198abcdefg0'],
    ['前后空格', ' 76561198000000000'],
    ['带下划线', '76561198_000000000'],
  ])('STEAM_USER_ID %s 时不合法', (_label, steamUserId) => {
    const result = validateEnvironment({ STEAM_API_KEY: 'k', STEAM_USER_ID: steamUserId })

    expect(result.valid).toBe(false)
    expect(result.error).toBe('STEAM_USER_ID must be a 17-digit number')
  })

  it('合法的 17 位数字通过校验', () => {
    const result = validateEnvironment({ STEAM_API_KEY: 'k', STEAM_USER_ID: VALID_STEAM_ID })

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('带符号的 17 位数字也不合法', () => {
    const result = validateEnvironment({ STEAM_API_KEY: 'k', STEAM_USER_ID: '-7656119800000000' })

    expect(result.valid).toBe(false)
  })

  it('省略参数时读取 process.env', () => {
    vi.stubEnv('STEAM_API_KEY', 'k')
    vi.stubEnv('STEAM_USER_ID', VALID_STEAM_ID)

    expect(validateEnvironment().valid).toBe(true)
  })

  it('省略参数时 process.env 缺变量会失败', () => {
    vi.stubEnv('STEAM_API_KEY', 'k')
    vi.stubEnv('STEAM_USER_ID', undefined)

    const result = validateEnvironment()

    expect(result.valid).toBe(false)
    expect(result.error).toContain('STEAM_USER_ID')
  })
})

describe('getCacheTTL', () => {
  it('未配置时使用默认 10 分钟 / 24 小时 / 1 小时', () => {
    expect(getCacheTTL({})).toEqual({
      user: 10 * MINUTE,
      games: 24 * HOUR,
      achievements: 1 * HOUR,
    })
  })

  it('读取自定义的分钟与小时配置', () => {
    const ttl = getCacheTTL({
      CACHE_TTL_USER_MINUTES: '30',
      CACHE_TTL_GAMES_HOURS: '2',
      CACHE_TTL_ACHIEVEMENTS_HOURS: '6',
    })

    expect(ttl).toEqual({
      user: 30 * MINUTE,
      games: 2 * HOUR,
      achievements: 6 * HOUR,
    })
  })

  it('只覆盖部分配置时其余保持默认', () => {
    const ttl = getCacheTTL({ CACHE_TTL_GAMES_HOURS: '48' })

    expect(ttl).toEqual({
      user: 10 * MINUTE,
      games: 48 * HOUR,
      achievements: 1 * HOUR,
    })
  })

  it('数字字符串与数字等价', () => {
    expect(getCacheTTL({ CACHE_TTL_USER_MINUTES: 5 })).toEqual(
      getCacheTTL({ CACHE_TTL_USER_MINUTES: '5' })
    )
  })

  it('配置为 0 时 TTL 为 0', () => {
    const ttl = getCacheTTL({
      CACHE_TTL_USER_MINUTES: '0',
      CACHE_TTL_GAMES_HOURS: '0',
      CACHE_TTL_ACHIEVEMENTS_HOURS: '0',
    })

    expect(ttl).toEqual({ user: 0, games: 0, achievements: 0 })
  })

  it('配置为非数字时得到 NaN（当前实现不做兜底）', () => {
    const ttl = getCacheTTL({ CACHE_TTL_USER_MINUTES: 'abc' })

    expect(Number.isNaN(ttl.user)).toBe(true)
  })

  it('省略参数时读取 process.env', () => {
    vi.stubEnv('CACHE_TTL_USER_MINUTES', '15')
    vi.stubEnv('CACHE_TTL_GAMES_HOURS', '12')
    vi.stubEnv('CACHE_TTL_ACHIEVEMENTS_HOURS', '3')

    expect(getCacheTTL()).toEqual({
      user: 15 * MINUTE,
      games: 12 * HOUR,
      achievements: 3 * HOUR,
    })
  })
})
