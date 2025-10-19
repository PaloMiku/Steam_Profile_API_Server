/**
 * 工具函数
 */

/**
 * 将个性化 URL 转换为 Steam ID
 */
export function parseVanityUrl(url: string): string | null {
  // 如果已经是数字 ID，直接返回
  if (/^\d{17}$/.test(url)) {
    return url;
  }

  // 如果包含 steamid 参数，提取数字
  const steamIdMatch = url.match(/steamid=(\d{17})/);
  if (steamIdMatch) {
    return steamIdMatch[1];
  }

  // 如果是 /profiles/123456789 格式
  const profileMatch = url.match(/\/profiles\/(\d{17})/);
  if (profileMatch) {
    return profileMatch[1];
  }

  return null;
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 格式化字节为可读大小
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

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
 * 构建 Steam CDN 图片 URL
 */
export const ImageBuilder = {
  /**
   * 游戏图标
   */
  gameIcon(appId: number, iconHash: string): string {
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${iconHash}.jpg`;
  },

  /**
   * 游戏 Logo
   */
  gameLogo(appId: number, logoHash: string): string {
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${logoHash}.png`;
  },

  /**
   * 游戏头部图（460x215）
   */
  gameHeader(appId: number): string {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
  },

  /**
   * 游戏 Hero 图
   */
  gameHero(appId: number): string {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/hero.jpg`;
  },

  /**
   * 游戏库存艺术（Library Hero）
   */
  gameLibraryHero(appId: number): string {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`;
  },

  /**
   * 游戏截图
   */
  gameScreenshot(appId: number, screenshotId: string): string {
    return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/ss_${screenshotId}.jpg`;
  },

  /**
   * 成就图标（已解锁）
   */
  achievementIcon(appId: number, iconHash: string): string {
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/achievements/${iconHash}.jpg`;
  },

  /**
   * 成就图标（未解锁）
   */
  achievementIconGray(appId: number, iconHash: string): string {
    return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/achievements/${iconHash}_bw.jpg`;
  },

  /**
   * 用户头像小
   */
  userAvatarSmall(avatarHash: string): string {
    return `https://avatars.steamstatic.com/${avatarHash}_small.jpg`;
  },

  /**
   * 用户头像中
   */
  userAvatarMedium(avatarHash: string): string {
    return `https://avatars.steamstatic.com/${avatarHash}_medium.jpg`;
  },

  /**
   * 用户头像大
   */
  userAvatarLarge(avatarHash: string): string {
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
