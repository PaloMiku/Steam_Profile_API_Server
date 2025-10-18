/**
 * Steam Web API 调用模块
 */

import axios from 'axios';
import {
  SteamUserBasicInfo,
  SteamGame,
  GameAchievementData,
  SteamAchievementSchema,
  GameDetailsResponse,
} from './types.js';

const STEAM_API_BASE = 'https://api.steampowered.com';
const STEAM_STORE_API_BASE = 'https://store.steampowered.com/api';

export class SteamApi {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Steam API Key is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * 获取玩家摘要信息
   */
  async getPlayerSummaries(steamId: string): Promise<SteamUserBasicInfo[]> {
    try {
      const response = await axios.get(`${STEAM_API_BASE}/ISteamUser/GetPlayerSummaries/v0002/`, {
        params: {
          key: this.apiKey,
          steamids: steamId,
          format: 'json',
        },
      });

      return response.data.response.players || [];
    } catch (error) {
      throw new Error(`Failed to fetch player summaries: ${error}`);
    }
  }

  /**
   * 获取玩家拥有的游戏列表
   */
  async getOwnedGames(steamId: string, includeAppInfo: boolean = true): Promise<SteamGame[]> {
    try {
      const response = await axios.get(
        `${STEAM_API_BASE}/IPlayerService/GetOwnedGames/v0001/`,
        {
          params: {
            key: this.apiKey,
            steamid: steamId,
            format: 'json',
            include_appinfo: includeAppInfo ? 1 : 0,
            include_played_free_games: 1,
          },
        }
      );

      return response.data.response.games || [];
    } catch (error) {
      throw new Error(`Failed to fetch owned games: ${error}`);
    }
  }

  /**
   * 获取最近游玩的游戏
   */
  async getRecentlyPlayedGames(steamId: string, count: number = 10): Promise<SteamGame[]> {
    try {
      const response = await axios.get(
        `${STEAM_API_BASE}/IPlayerService/GetRecentlyPlayedGames/v0001/`,
        {
          params: {
            key: this.apiKey,
            steamid: steamId,
            count,
            format: 'json',
          },
        }
      );

      return response.data.response.games || [];
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
      const playerResponse = await axios.get(
        `${STEAM_API_BASE}/ISteamUserStats/GetPlayerAchievements/v0001/`,
        {
          params: {
            key: this.apiKey,
            steamid: steamId,
            appid: appId,
            format: 'json',
          },
        }
      );

      const playerAchievements = playerResponse.data.playerstats?.achievements || [];

      // 获取游戏的成就架构
      const schemaResponse = await axios.get(
        `${STEAM_API_BASE}/ISteamUserStats/GetSchemaForGame/v2/`,
        {
          params: {
            key: this.apiKey,
            appid: appId,
            format: 'json',
          },
        }
      );

      const achievements = schemaResponse.data.game?.availableGameStats?.achievements || [];

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
      // 为了效率，我们批量请求但要遵守速率限制
      const results: GameDetailsResponse = {};

      for (const appId of appIds) {
        try {
          const response = await axios.get(`${STEAM_STORE_API_BASE}/appdetails`, {
            params: {
              appids: appId,
              cc: 'cn',
              l: 'english',
            },
            timeout: 5000,
          });

          results[appId] = response.data[appId];
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
