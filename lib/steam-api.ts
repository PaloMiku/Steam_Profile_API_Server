/**
 * Steam Web API 调用模块
 */

import {
  SteamUserBasicInfo,
  SteamGame,
  SteamAchievementSchema,
  GameDetailsResponse,
} from './types.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_API_BASE = 'https://store.steampowered.com/api';

export class SteamApi {
  private apiKey: string;
  private countryCode: string = 'cn';

  constructor(apiKey: string, countryCode?: string) {
    if (!apiKey) {
      throw new Error('Steam API Key is required');
    }
    this.apiKey = apiKey;
    if (countryCode) {
      this.countryCode = countryCode.toLowerCase();
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
   * 获取地区代码
   */
  getCountryCode(): string {
    return this.countryCode;
  }

  /**
   * 将国家代码转换为币种代码
   * @param countryCode 两位国家代码
   * @returns 币种代码 (如 'CNY', 'USD', 'EUR' 等)
   */
  private mapCountryToCurrency(countryCode: string): string {
    const currencyMap: Record<string, string> = {
      // 亚洲
      cn: 'CNY', // 中国 - 人民币
      hk: 'HKD', // 香港 - 港元
      tw: 'TWD', // 台湾 - 新台币
      jp: 'JPY', // 日本 - 日元
      kr: 'KRW', // 韩国 - 韩元
      in: 'INR', // 印度 - 卢比
      th: 'THB', // 泰国 - 泰铢
      sg: 'SGD', // 新加坡 - 新加坡元
      my: 'MYR', // 马来西亚 - 林吉特
      ph: 'PHP', // 菲律宾 - 比索
      id: 'IDR', // 印度尼西亚 - 卢比
      vn: 'VND', // 越南 - 越南盾
      // 欧洲
      de: 'EUR', // 德国 - 欧元
      fr: 'EUR', // 法国 - 欧元
      gb: 'GBP', // 英国 - 英镑
      es: 'EUR', // 西班牙 - 欧元
      it: 'EUR', // 意大利 - 欧元
      nl: 'EUR', // 荷兰 - 欧元
      pl: 'EUR', // 波兰 - 欧元
      ru: 'RUB', // 俄罗斯 - 卢布
      ua: 'UAH', // 乌克兰 - 格里夫纳
      tr: 'TRY', // 土耳其 - 土耳其里拉
      ch: 'CHF', // 瑞士 - 瑞士法郎
      se: 'SEK', // 瑞典 - 瑞典克朗
      no: 'NOK', // 挪威 - 挪威克朗
      dk: 'DKK', // 丹麦 - 丹麦克朗
      // 北美洲
      us: 'USD', // 美国 - 美元
      ca: 'CAD', // 加拿大 - 加元
      mx: 'MXN', // 墨西哥 - 墨西哥比索
      // 南美洲
      br: 'BRL', // 巴西 - 巴西雷亚尔
      ar: 'ARS', // 阿根廷 - 阿根廷比索
      cl: 'CLP', // 智利 - 智利比索
      // 大洋洲
      au: 'AUD', // 澳大利亚 - 澳元
      nz: 'NZD', // 新西兰 - 新西兰元
      // 非洲
      za: 'ZAR', // 南非 - 南非兰特
      eg: 'EGP', // 埃及 - 埃及镑
      ng: 'NGN', // 尼日利亚 - 尼日利亚奈拉
    };

    return currencyMap[countryCode.toLowerCase()] || 'USD';
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

      const response = await fetch(url.toString());
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
   */
  async getOwnedGames(steamId: string, includeAppInfo: boolean = true): Promise<SteamGame[]> {
    try {
      const url = new URL(`${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('steamid', steamId);
      url.searchParams.set('format', 'json');
      url.searchParams.set('include_appinfo', includeAppInfo ? '1' : '0');
      url.searchParams.set('include_played_free_games', '1');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      return data.response.games || [];
    } catch (error) {
      throw new Error(`Failed to fetch owned games: ${error}`);
    }
  }

  /**
   * 获取最近游玩的游戏
   */
  async getRecentlyPlayedGames(steamId: string, count: number = 10): Promise<SteamGame[]> {
    try {
      const url = new URL(
        `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/`
      );
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('steamid', steamId);
      url.searchParams.set('count', String(count));
      url.searchParams.set('format', 'json');

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json() as any;
      return data.response.games || [];
    } catch (error) {
      throw new Error(`Failed to fetch recently played games: ${error}`);
    }
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
    try {
      // 获取玩家已解锁的成就
      const playerUrl = new URL(
        `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/`
      );
      playerUrl.searchParams.set('key', this.apiKey);
      playerUrl.searchParams.set('steamid', steamId);
      playerUrl.searchParams.set('appid', String(appId));
      playerUrl.searchParams.set('format', 'json');

      const playerResponse = await fetch(playerUrl.toString());
      if (!playerResponse.ok) {
        throw new Error(`HTTP ${playerResponse.status}`);
      }

      const playerData = await playerResponse.json() as any;
      const playerAchievements = playerData.playerstats?.achievements || [];

      // 获取游戏的成就架构
      const schemaUrl = new URL(
        `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`
      );
      schemaUrl.searchParams.set('key', this.apiKey);
      schemaUrl.searchParams.set('appid', String(appId));
      schemaUrl.searchParams.set('format', 'json');

      const schemaResponse = await fetch(schemaUrl.toString());
      if (!schemaResponse.ok) {
        throw new Error(`HTTP ${schemaResponse.status}`);
      }

      const schemaData = await schemaResponse.json() as any;
      const achievements = schemaData.game?.availableGameStats?.achievements || [];

      return {
        achievements,
        playerAchievements,
      };
    } catch (error) {
      // 某些游戏可能没有成就或 API 不可用
      return {
        achievements: [],
        playerAchievements: [],
      };
    }
  }

  /**
   * 从 Steam 商店获取游戏详情（价格、截图等）
   */
  async getGameDetails(appIds: number[]): Promise<GameDetailsResponse> {
    try {
      // Steam 商店 API 每次最多获取一个应用
      const results: GameDetailsResponse = {};
      const currency = this.mapCountryToCurrency(this.countryCode);

      for (const appId of appIds) {
        try {
          const url = new URL(`${STEAM_STORE_API_BASE}/appdetails`);
          url.searchParams.set('appids', String(appId));
          url.searchParams.set('cc', this.countryCode);
          url.searchParams.set('l', 'english');

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);

          const response = await fetch(url.toString(), {
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json() as any;
          const appData = data[appId];
          
          // 如果游戏数据包含价格信息，补充币种信息
          if (appData?.data?.price_overview) {
            appData.data.price_overview.currency = 
              appData.data.price_overview.currency || currency;
          }
          
          results[appId] = appData;
          // 添加延迟以避免被限流
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          // 某些应用可能无法获取详情
          results[appId] = { success: false };
        }
      }

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
}
