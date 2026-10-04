/**
 * lib/utils.ts 里的纯函数：Steam CDN 图片 URL 构造与在线状态文本
 */
import { describe, expect, it } from 'vitest'
import { ImageBuilder, getStatusText } from '../lib/utils.js'

const APP_ID = 730

describe('ImageBuilder 游戏图片', () => {
  it('gameIcon 走 community 媒体域名并补 .jpg', () => {
    expect(ImageBuilder.gameIcon(APP_ID, 'abc123')).toBe(
      'https://media.steampowered.com/steamcommunity/public/images/apps/730/abc123.jpg'
    )
  })

  it('gameLogo 走 community 媒体域名并补 .png', () => {
    expect(ImageBuilder.gameLogo(APP_ID, 'logo1')).toBe(
      'https://media.steampowered.com/steamcommunity/public/images/apps/730/logo1.png'
    )
  })

  it.each([
    ['gameHeader', 'header.jpg'],
    ['gameHero', 'hero.jpg'],
    ['gameLibraryHero', 'library_hero.jpg'],
  ] as const)('%s 走 CDN 静态域名', (method, file) => {
    expect(ImageBuilder[method](APP_ID)).toBe(
      `https://cdn.cloudflare.steamstatic.com/steam/apps/730/${file}`
    )
  })

  it('gameScreenshot 拼接截图 id', () => {
    expect(ImageBuilder.gameScreenshot(APP_ID, 'abc')).toBe(
      'https://cdn.cloudflare.steamstatic.com/steam/apps/730/ss_abc.jpg'
    )
  })
})

describe('ImageBuilder 成就图标', () => {
  it('achievementIcon 使用原图', () => {
    expect(ImageBuilder.achievementIcon(APP_ID, 'ach1')).toBe(
      'https://media.steampowered.com/steamcommunity/public/images/apps/730/achievements/ach1.jpg'
    )
  })

  it('achievementIconGray 在文件名后追加 _bw', () => {
    expect(ImageBuilder.achievementIconGray(APP_ID, 'ach1')).toBe(
      'https://media.steampowered.com/steamcommunity/public/images/apps/730/achievements/ach1_bw.jpg'
    )
  })
})

describe('ImageBuilder 用户头像', () => {
  it.each([
    ['userAvatarSmall', '_small.jpg'],
    ['userAvatarMedium', '_medium.jpg'],
    ['userAvatarLarge', '_full.jpg'],
  ] as const)('%s 使用对应的尺寸后缀', (method, suffix) => {
    expect(ImageBuilder[method]('hash123')).toBe(`https://avatars.steamstatic.com/hash123${suffix}`)
  })
})

describe('ImageBuilder 占位图兜底', () => {
  const PLACEHOLDER = ImageBuilder.gameHeader(0)

  it('占位图是内联的 1x1 灰色 SVG', () => {
    expect(PLACEHOLDER.startsWith('data:image/svg+xml,')).toBe(true)
    expect(PLACEHOLDER).toContain('cccccc')
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    '非法 appId %s 时 gameHeader 返回占位图',
    appId => {
      expect(ImageBuilder.gameHeader(appId)).toBe(PLACEHOLDER)
    }
  )

  it.each([
    ['gameIcon', (hash: string) => ImageBuilder.gameIcon(APP_ID, hash)],
    ['gameLogo', (hash: string) => ImageBuilder.gameLogo(APP_ID, hash)],
    ['gameScreenshot', (hash: string) => ImageBuilder.gameScreenshot(APP_ID, hash)],
    ['achievementIcon', (hash: string) => ImageBuilder.achievementIcon(APP_ID, hash)],
    ['achievementIconGray', (hash: string) => ImageBuilder.achievementIconGray(APP_ID, hash)],
  ] as const)('%s 遇到空 hash 返回占位图', (_name, build) => {
    expect(build('')).toBe(PLACEHOLDER)
    expect(build('   ')).toBe(PLACEHOLDER)
  })

  it.each([
    ['userAvatarSmall', ImageBuilder.userAvatarSmall],
    ['userAvatarMedium', ImageBuilder.userAvatarMedium],
    ['userAvatarLarge', ImageBuilder.userAvatarLarge],
  ] as const)('%s 遇到空头像 hash 返回占位图', (_name, build) => {
    expect(build('')).toBe(PLACEHOLDER)
  })

  it('appId 非法时带 hash 也返回占位图', () => {
    expect(ImageBuilder.gameIcon(0, 'abc123')).toBe(PLACEHOLDER)
  })
})

describe('getStatusText', () => {
  it.each([
    [0, 'offline', '离线'],
    [1, 'online', '在线'],
    [2, 'busy', '忙碌'],
    [3, 'away', '离开'],
    [4, 'snooze', '打盹'],
    [5, 'trading', '交易中'],
    [6, 'playing', '游戏中'],
  ])('personaState %i 映射为 %s', (personaState, status, statusMessage) => {
    expect(getStatusText(personaState)).toEqual({ status, statusMessage })
  })

  it.each([7, 99, -1, 1.5])('未知的 personaState %s 回退为离线', personaState => {
    expect(getStatusText(personaState)).toEqual({ status: 'offline', statusMessage: '离线' })
  })

  it('NaN 回退为离线', () => {
    expect(getStatusText(NaN)).toEqual({ status: 'offline', statusMessage: '离线' })
  })
})
