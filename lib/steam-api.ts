/**
 * Steam Web API 调用模块
 *
 * 已知限制（2026-10-05 实测确认，暂无解）：
 * IPlayerService/GetOwnedGames 没有服务端 appid 过滤能力。官方文档里的
 * appids_filter 参数在 v0001 上被静默忽略——传 220、传 220,730、传
 * appids_filter[]=220 三种写法返回的都是完整 140 条库数据，不会报错也不会
 * 报错提示参数无效。因此单游戏查询（getPlayerGameInfo）想同时拿到 name、
 * img_icon_url 和 playtime，只能老老实实付一次 include_appinfo=1 的全量拉取。
 * 去掉 appinfo（47KB→29KB）只省带宽不省时间（0.63~0.78s vs 0.61~0.85s），
 * 而且会丢掉图标 hash，所以「先轻量校验归属再补详情」这种两段式方案在这里
 * 没有任何收益。剩下能省的只有串行等待，已全部改成并发。
 */

import {
  SteamUserBasicInfo,
  SteamGame,
  SteamAchievementSchema,
  GameDetailsResponse,
} from './types.js';
import { mapWithConcurrency, DEFAULT_CONCURRENCY } from './pool.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_API_BASE = 'https://store.steampowered.com/api';

const DEFAULT_TIMEOUT_MS = 8000

/**
 * Steam 不可达时 fetch 会无限挂起，所有请求都必须带超时
 */
class SteamRequestTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`SteamRequestTimeoutError: request timed out after ${timeoutMs}ms: ${url}`)
    this.name = 'SteamRequestTimeoutError'
  }
}

async function fetchWithTimeout(url: string, timeoutMs: number = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } catch (error) {
    // abort() 抛出的是 AbortError，换成可识别的超时错误
    if (controller.signal.aborted) {
      throw new SteamRequestTimeoutError(url, timeoutMs)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export class SteamApi {
  private apiKey: string;
  private countryCode: string = 'cn';
  // 默认语言改为简体中文
  private language: string = 'schinese';

  constructor(apiKey: string, countryCode?: string, language?: string) {
    if (!apiKey) {
      throw new Error('Steam API Key is required');
    }
    this.apiKey = apiKey;
    if (countryCode) {
      this.countryCode = countryCode.toLowerCase();
    }

    // 优先使用环境变量 STEAM_LANGUAGE（如果存在），否则使用构造参数 language
    const envLang = process.env.STEAM_LANGUAGE || process.env.STEAM_LANG;
    if (envLang) {
      this.language = this.mapLanguage(envLang);
    } else if (language) {
      this.language = this.mapLanguage(language);
    }
  }

  /**
   * 设置地区代码，用于获取对应地区的游戏价格
   * @param countryCode 两位国家代码 (如 'cn', 'us', 'jp', 'de' 等)
   */
  setCountryCode(countryCode: string): void {
    this.countryCode = countryCode.toLowerCase();
  }

  /**
   * 
   * @param language language code or name (e.g. 'en', 'english', 'schinese', 'zh-CN')
   */
  setLanguage(language: string): void {
    this.language = this.mapLanguage(language);
  }

  getLanguage(): string {
    return this.language;
  }

  /**
   * 获取地区代码
   */
  getCountryCode(): string {
    return this.countryCode;
  }

  /**
   * Map common language identifiers to Steam store language parameter
   */
  private mapLanguage(lang: string): string {
    if (!lang) return 'english';
    const key = lang.toLowerCase();
    const map: Record<string, string> = {
      en: 'english',
      eng: 'english',
      english: 'english',
      zh: 'schinese',
      'zh-cn': 'schinese',
      'zh_tw': 'tchinese',
      'zh-tw': 'tchinese',
      'zh-hk': 'tchinese',
      schinese: 'schinese',
      tchinese: 'tchinese',
      ja: 'japanese',
      jp: 'japanese',
      japanese: 'japanese',
      de: 'german',
      german: 'german',
      fr: 'french',
      french: 'french',
      es: 'spanish',
      spanish: 'spanish',
      ru: 'russian',
      russian: 'russian',
      ko: 'koreana',
      korean: 'koreana',
      'pt-br': 'brazilian',
      pt: 'brazilian',
      pl: 'polish',
      polish: 'polish',
    };

    return map[key] || key;
  }

  /**
   * 获取玩家摘要信息
   */
  async getPlayerSummaries(steamId: string): Promise<SteamUserBasicInfo[]> {
    try {
      const url = new URL(`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/`);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('steamids', steamId);
      url.searchParams.set('format', 'json');

      const response = await fetchWithTimeout(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      return data.response.players || [];
    } catch (error) {
      throw new Error(`Failed to fetch player summaries: ${error}`);
    }
  }

  /**
   * 获取玩家拥有的游戏列表
   * @param steamId Steam ID
   * @param includeAppInfo 是否包含应用信息
   * @param limit 返回游戏的最大数量（可选，不提供则返回所有）
   *
   * limit 是拿到全量响应之后的本地截断，不会减少 Steam 返回的数据量，
   * 所以它只影响后续处理，不影响这次请求的耗时
   */
  async getOwnedGames(steamId: string, includeAppInfo: boolean = true, limit?: number): Promise<SteamGame[]> {
    try {
      const url = new URL(`${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('steamid', steamId);
      url.searchParams.set('format', 'json');
      url.searchParams.set('include_appinfo', includeAppInfo ? '1' : '0');
      url.searchParams.set('include_played_free_games', '1');

      const response = await fetchWithTimeout(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      const allGames = data.response.games || [];
      
      // 如果指定了 limit，先按游玩时长排序，然后返回前 limit 个
      if (limit && limit > 0) {
        return allGames
          .sort((a: SteamGame, b: SteamGame) => 
            (b.playtime_forever || 0) - (a.playtime_forever || 0)
          )
          .slice(0, limit);
      }
      
      return allGames;
    } catch (error) {
      throw new Error(`Failed to fetch owned games: ${error}`);
    }
  }

  /**
   * 获取最近游玩的游戏
   */
  async getRecentlyPlayedGames(
    steamId: string,
    count: number = 10
  ): Promise<{ totalCount: number; games: SteamGame[] }> {
    try {
      const url = new URL(
        `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/`
      );
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('steamid', steamId);
      url.searchParams.set('count', String(count));
      url.searchParams.set('format', 'json');

      const response = await fetchWithTimeout(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      return {
        totalCount: data.response.total_count || 0,
        games: data.response.games || [],
      };
    } catch (error) {
      throw new Error(`Failed to fetch recently played games: ${error}`);
    }
  }

  /**
   * 拉取玩家已解锁的成就；请求本身失败（超时/网络/鉴权）必须抛出，
   * 否则调用方无法区分「请求失败」和「这游戏没成就」
   */
  private async fetchPlayerAchievements(
    url: URL
  ): Promise<Array<{ apiname: string; achieved: number; unlocktime: number }>> {
    let playerResponse: Response;
    try {
      playerResponse = await fetchWithTimeout(url.toString());
    } catch (error) {
      throw new Error(`Failed to fetch player achievements: ${error}`);
    }
    if (!playerResponse.ok) {
      throw new Error(`Failed to fetch player achievements: HTTP ${playerResponse.status}`);
    }

    const playerData = await playerResponse.json() as any;
    return playerData.playerstats?.achievements || [];
  }

  /**
   * 拉取游戏的成就架构；对没有成就的游戏返回 HTTP 500，属于正常情况。
   * 任何失败都按空成就处理，永不抛出，否则会拖垮并发的另一半
   */
  private async fetchGameAchievementSchema(appId: number): Promise<SteamAchievementSchema[]> {
    const schemaUrl = new URL(
      `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`
    );
    schemaUrl.searchParams.set('key', this.apiKey);
    schemaUrl.searchParams.set('appid', String(appId));
    schemaUrl.searchParams.set('format', 'json');

    try {
      const schemaResponse = await fetchWithTimeout(schemaUrl.toString());
      if (schemaResponse.ok) {
        const schemaData = await schemaResponse.json() as any;
        return schemaData.game?.availableGameStats?.achievements || [];
      }
    } catch {
      // 该游戏没有成就架构
    }

    return [];
  }

  /**
   * 获取玩家成就列表
   */
  async getPlayerAchievements(
    steamId: string,
    appId: number
  ): Promise<{
    achievements: SteamAchievementSchema[];
    playerAchievements: Array<{
      apiname: string;
      achieved: number;
      unlocktime: number;
    }>;
  }> {
    // 获取玩家已解锁的成就
    const playerUrl = new URL(
      `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/`
    );
    playerUrl.searchParams.set('key', this.apiKey);
    playerUrl.searchParams.set('steamid', steamId);
    playerUrl.searchParams.set('appid', String(appId));
    playerUrl.searchParams.set('format', 'json');

    // 两个请求只共享 appid，彼此没有数据依赖，并发发出省掉一次往返；
    // fetchGameAchievementSchema 永不 reject，所以 Promise.all 只会因玩家成就失败而抛出
    const [playerAchievements, achievements] = await Promise.all([
      this.fetchPlayerAchievements(playerUrl),
      this.fetchGameAchievementSchema(appId),
    ]);

    return {
      achievements,
      playerAchievements,
    };
  }

  /**
   * 从 Steam 商店获取游戏详情（价格、截图等）
   */
  async getGameDetails(appIds: number[]): Promise<GameDetailsResponse> {
    try {
      // Steam 商店 API 每次只能获取一个应用，原来的 for 循环是纯串行：
      // 最近游玩的 10 个游戏要叠 10 次往返（实测单次约 0.7~1.0s）。
      // 实测 store 端点 10 并发全部 200、无 429，故改为受限并发
      const details = await mapWithConcurrency(appIds, DEFAULT_CONCURRENCY, async (appId) => {
        try {
          const url = new URL(`${STEAM_STORE_API_BASE}/appdetails`);
          url.searchParams.set('appids', String(appId));
          url.searchParams.set('cc', this.countryCode);
          url.searchParams.set('l', this.language);

          const response = await fetchWithTimeout(url.toString(), 5000);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json() as any;
          return data[appId];
        } catch (error) {
          // 某些应用可能无法获取详情
          return { success: false };
        }
      });

      // 单项失败已被上面的 catch 收敛成 { success: false }，
      // 这里只负责按 appId 还原成以 appId 为键的字典
      const results: GameDetailsResponse = {};
      appIds.forEach((appId, index) => {
        results[appId] = details[index];
      });

      return results;
    } catch (error) {
      throw new Error(`Failed to fetch game details: ${error}`);
    }
  }

  /**
   * 获取单个游戏详情
   */
  async getSingleGameDetail(appId: number): Promise<GameDetailsResponse> {
    return this.getGameDetails([appId]);
  }

  /**
   * 获取玩家拥有的特定游戏的信息
   * 包括游戏时间统计、成就统计
   *
   * 归属校验必须先拿到全量库（见文件顶部说明，Steam 不支持按 appid 过滤），
   * 且这一步不能和后面两步并发：若并发，未拥有的 appId 也会触发成就请求，
   * 那个请求一旦失败就会把本该返回的 {}（→ 404）变成 500。
   * 所以保留它作为唯一的前置请求，之后的两步再并发。
   */
  async getPlayerGameInfo(
    steamId: string,
    appId: number
  ): Promise<{
    game?: SteamGame;
    detailsRaw?: any;
    achievements?: {
      total: number;
      unlocked: number;
      percentage: number;
    };
  }> {
    try {
      // 1. 获取用户拥有的所有游戏，确认这个 appId 确实在库里
      const allGames = await this.getOwnedGames(steamId, true);
      const game = allGames.find(g => g.appid === appId);

      if (!game) {
        return {};
      }

      // 2. 商店详情和 3. 成就统计都只依赖 appId，互相无数据依赖，并发发出
      const [gameDetailsMap, achData] = await Promise.all([
        this.getGameDetails([appId]),
        this.getPlayerAchievements(steamId, appId),
      ]);
      const detailsRaw = gameDetailsMap[appId];

      const unlocked = achData.playerAchievements.filter(a => a.achieved === 1).length;
      const achievements =
        achData && achData.playerAchievements.length > 0
          ? {
              total: achData.playerAchievements.length,
              unlocked,
              percentage: Math.round(
                (unlocked / achData.playerAchievements.length) * 100
              ),
            }
          : undefined;

      return {
        game,
        detailsRaw,
        achievements,
      };
    } catch (error) {
      throw new Error(`Failed to fetch player game info: ${error}`);
    }
  }
}
