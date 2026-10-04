/**
 * lib/steam-api.ts 的构造与语言/地区归一化
 * 只测不发网络请求的部分：构造函数、setter 与 getter
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SteamApi } from '../lib/steam-api.js'

beforeEach(() => {
  // 构造时优先读环境变量，先确保不继承宿主环境
  vi.stubEnv('STEAM_LANGUAGE', undefined)
  vi.stubEnv('STEAM_LANG', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('SteamApi 构造', () => {
  it('缺少 apiKey 时抛错', () => {
    expect(() => new SteamApi('')).toThrow('Steam API Key is required')
  })

  it('默认地区为 cn、默认语言为 schinese', () => {
    const api = new SteamApi('key')

    expect(api.getCountryCode()).toBe('cn')
    expect(api.getLanguage()).toBe('schinese')
  })

  it('地区码统一转成小写', () => {
    expect(new SteamApi('key', 'US').getCountryCode()).toBe('us')
    expect(new SteamApi('key', 'Jp').getCountryCode()).toBe('jp')
  })

  it('空语言参数不会覆盖默认语言', () => {
    expect(new SteamApi('key', undefined, '').getLanguage()).toBe('schinese')
  })

  it('语言码大小写不敏感', () => {
    expect(new SteamApi('key', 'us', 'JA').getLanguage()).toBe('japanese')
    expect(new SteamApi('key', 'us', 'English').getLanguage()).toBe('english')
  })
})

describe('SteamApi 语言映射', () => {
  it.each([
    ['en', 'english'],
    ['eng', 'english'],
    ['english', 'english'],
    ['zh', 'schinese'],
    ['zh-cn', 'schinese'],
    ['schinese', 'schinese'],
    ['zh_tw', 'tchinese'],
    ['zh-TW', 'tchinese'],
    ['zh-hk', 'tchinese'],
    ['ja', 'japanese'],
    ['jp', 'japanese'],
    ['de', 'german'],
    ['fr', 'french'],
    ['es', 'spanish'],
    ['ru', 'russian'],
    ['ko', 'koreana'],
    ['pt', 'brazilian'],
    ['pt-br', 'brazilian'],
    ['pl', 'polish'],
  ])('构造参数 %s 映射为 %s', (input, expected) => {
    expect(new SteamApi('key', 'us', input).getLanguage()).toBe(expected)
  })

  it('未收录的语言原样透传', () => {
    expect(new SteamApi('key', 'us', 'xx').getLanguage()).toBe('xx')
  })

  it('setLanguage 走同一套映射', () => {
    const api = new SteamApi('key', 'us', 'en')
    api.setLanguage('zh-TW')

    expect(api.getLanguage()).toBe('tchinese')
  })
})

describe('SteamApi 语言环境变量优先级', () => {
  it('STEAM_LANGUAGE 优先于构造参数', () => {
    vi.stubEnv('STEAM_LANGUAGE', 'japanese')

    expect(new SteamApi('key', 'us', 'english').getLanguage()).toBe('japanese')
  })

  it('STEAM_LANG 作为次选', () => {
    vi.stubEnv('STEAM_LANG', 'german')

    expect(new SteamApi('key', 'us', 'english').getLanguage()).toBe('german')
  })

  it('STEAM_LANGUAGE 优先于 STEAM_LANG', () => {
    vi.stubEnv('STEAM_LANGUAGE', 'french')
    vi.stubEnv('STEAM_LANG', 'german')

    expect(new SteamApi('key', 'us', 'english').getLanguage()).toBe('french')
  })

  it('环境变量没设置时使用构造参数', () => {
    expect(new SteamApi('key', 'us', 'korean').getLanguage()).toBe('koreana')
  })
})

describe('SteamApi 地区', () => {
  it('setCountryCode 统一转成小写', () => {
    const api = new SteamApi('key', 'us')
    api.setCountryCode('DE')

    expect(api.getCountryCode()).toBe('de')
  })
})
