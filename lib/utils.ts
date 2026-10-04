/**
 * 工具函数
 */

/**
 * 获取状态文本
 */
export function getStatusText(personaState: number): {
  status: 'online' | 'offline' | 'away' | 'snooze' | 'busy' | 'trading' | 'playing';
  statusMessage: string;
} {
  const statusMap: Record<
    number,
    {
      status: 'online' | 'offline' | 'away' | 'snooze' | 'busy' | 'trading' | 'playing';
      statusMessage: string;
    }
  > = {
    0: { status: 'offline', statusMessage: '离线' },
    1: { status: 'online', statusMessage: '在线' },
    2: { status: 'busy', statusMessage: '忙碌' },
    3: { status: 'away', statusMessage: '离开' },
    4: { status: 'snooze', statusMessage: '打盹' },
    5: { status: 'trading', statusMessage: '交易中' },
    6: { status: 'playing', statusMessage: '游戏中' },
  };

  return statusMap[personaState] || { status: 'offline', statusMessage: '离线' };
}

/**
 * 占位图：1x1 中性灰 SVG。
 * 选 data URI 而非空字符串或第三方占位服务：空字符串前端仍可能照常发起请求，
 * 外部服务又多一层可失效的依赖，这个不依赖网络、任何环境下都能渲染。
 */
const PLACEHOLDER_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%221%22 height=%221%22%3E%3Crect width=%221%22 height=%221%22 fill=%22%23cccccc%22/%3E%3C/svg%3E';

const isValidAppId = (appId: number): boolean => Number.isFinite(appId) && appId > 0;

const hasHash = (hash: string | undefined | null): hash is string =>
  typeof hash === 'string' && hash.trim().length > 0;

/**
 * 构建 Steam CDN 图片 URL
 */
export const ImageBuilder = {
  /**
   * 游戏图标
   */
  gameIcon(appId: number, iconHash: string): string {
    if (!isValidAppId(appId) || !hasHash(iconHash)) return PLACEHOLDER_IMAGE;
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
  },

  /**
   * 游戏 Logo
   */
  gameLogo(appId: number, logoHash: string): string {
    if (!isValidAppId(appId) || !hasHash(logoHash)) return PLACEHOLDER_IMAGE;
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${logoHash}.png`;
  },

  /**
   * 游戏头部图（460x215）
   */
  gameHeader(appId: number): string {
    if (!isValidAppId(appId)) return PLACEHOLDER_IMAGE;
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
  },

  /**
   * 游戏 Hero 图
   */
  gameHero(appId: number): string {
    if (!isValidAppId(appId)) return PLACEHOLDER_IMAGE;
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/hero.jpg`;
  },

  /**
   * 游戏库存艺术（Library Hero）
   */
  gameLibraryHero(appId: number): string {
    if (!isValidAppId(appId)) return PLACEHOLDER_IMAGE;
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`;
  },

  /**
   * 游戏截图
   */
  gameScreenshot(appId: number, screenshotId: string): string {
    if (!isValidAppId(appId) || !hasHash(screenshotId)) return PLACEHOLDER_IMAGE;
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/ss_${screenshotId}.jpg`;
  },

  /**
   * 成就图标（已解锁）
   */
  achievementIcon(appId: number, iconHash: string): string {
    if (!isValidAppId(appId) || !hasHash(iconHash)) return PLACEHOLDER_IMAGE;
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/achievements/${iconHash}.jpg`;
  },

  /**
   * 成就图标（未解锁）
   */
  achievementIconGray(appId: number, iconHash: string): string {
    if (!isValidAppId(appId) || !hasHash(iconHash)) return PLACEHOLDER_IMAGE;
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/achievements/${iconHash}_bw.jpg`;
  },

  /**
   * 用户头像小
   */
  userAvatarSmall(avatarHash: string): string {
    if (!hasHash(avatarHash)) return PLACEHOLDER_IMAGE;
    return `https://avatars.steamstatic.com/${avatarHash}_small.jpg`;
  },

  /**
   * 用户头像中
   */
  userAvatarMedium(avatarHash: string): string {
    if (!hasHash(avatarHash)) return PLACEHOLDER_IMAGE;
    return `https://avatars.steamstatic.com/${avatarHash}_medium.jpg`;
  },

  /**
   * 用户头像大
   */
  userAvatarLarge(avatarHash: string): string {
    if (!hasHash(avatarHash)) return PLACEHOLDER_IMAGE;
    return `https://avatars.steamstatic.com/${avatarHash}_full.jpg`;
  },
};

/**
 * 日志工具
 */
export const Logger = {
  log: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    const logLevel = process.env.LOG_LEVEL || 'info';
    if (logLevel === 'debug' || logLevel === 'info') {
      console.log(`[${timestamp}] [INFO] ${message}`, data ? data : '');
    }
  },

  error: (message: string, error?: any) => {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] [ERROR] ${message}`, error ? error : '');
  },

  warn: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, data ? data : '');
  },

  debug: (message: string, data?: any) => {
    const timestamp = new Date().toISOString();
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[${timestamp}] [DEBUG] ${message}`, data ? data : '');
    }
  },
};
