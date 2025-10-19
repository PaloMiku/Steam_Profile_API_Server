/**
 * 通用 API 处理器 - 支持多平台
 * 可在 Vercel, Netlify, Express 等平台使用
 */

import { SteamApi } from './steam-api.js';
import { cache, getTTL, getTTLFromHours } from './cache.js';
import { ImageBuilder, Logger, getStatusText } from './utils.js';
import type { SuccessResponse, ErrorResponse, UserResponse, GamesResponse, AchievementsResponse } from './types.js';

// 验证环境变量
export function validateEnvironment(): { valid: boolean; error?: string } {
  const steamApiKey = process.env.STEAM_API_KEY;
  const steamUserId = process.env.STEAM_USER_ID;

  if (!steamApiKey) {
    return { valid: false, error: 'STEAM_API_KEY environment variable is not set' };
  }

  if (!steamUserId) {
    return { valid: false, error: 'STEAM_USER_ID environment variable is not set' };
  }

  if (!/^\d{17}$/.test(steamUserId)) {
    return { valid: false, error: 'STEAM_USER_ID must be a 17-digit number' };
  }

  return { valid: true };
}

/**
 * 获取缓存 TTL 配置
 */
export function getCacheTTL() {
  const userMinutes = parseInt(process.env.CACHE_TTL_USER_MINUTES || '10', 10);
  const gamesHours = parseInt(process.env.CACHE_TTL_GAMES_HOURS || '24', 10);
  const achievementsHours = parseInt(process.env.CACHE_TTL_ACHIEVEMENTS_HOURS || '1', 10);

  return {
    user: getTTL(userMinutes),
    games: getTTLFromHours(gamesHours),
    achievements: getTTLFromHours(achievementsHours),
  };
}

/**
 * 获取用户基本信息和统计
 * 职责：仅返回用户资料、游戏统计、成就统计（不包含游戏详情和成就详情）
 */
export async function handleSteamUserRequest(
  steamUserId: string,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<UserResponse> {
  const cacheKey = `steam-user-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<UserResponse>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam user data');
    return cached;
  }

  Logger.log('Fetching fresh Steam user data');
  const startTime = Date.now();

  try {
    // 1. 获取玩家基本信息
    Logger.log('Fetching player summaries...');
    const playerSummaries = await steamApi.getPlayerSummaries(steamUserId);
    if (!playerSummaries || playerSummaries.length === 0) {
      throw new Error('Player not found or profile is private');
    }

    const playerInfo = playerSummaries[0];
    const statusInfo = getStatusText(playerInfo.personastate);

    // 2. 获取拥有的游戏（用于计算统计）
    Logger.log('Fetching owned games for statistics...');
    const allGames = await steamApi.getOwnedGames(steamUserId, false); // includeAppInfo = false

    // 3. 计算总游玩时长统计
    const totalPlaytimeForever = Math.floor(
      allGames.reduce((sum, game) => sum + (game.playtime_forever || 0), 0) / 60
    );
    const totalPlaytimeTwoWeeks = Math.floor(
      allGames.reduce((sum, game) => sum + (game.playtime_2weeks || 0), 0) / 60
    );

    // 4. 构建响应数据
    const responseData: UserResponse = {
      user: {
        steamid: playerInfo.steamid,
        username: playerInfo.personaname,
        profileUrl: playerInfo.profileurl,
        avatar: {
          small: ImageBuilder.userAvatarSmall(playerInfo.avatarhash || ''),
          medium: ImageBuilder.userAvatarMedium(playerInfo.avatarhash || ''),
          large: ImageBuilder.userAvatarLarge(playerInfo.avatarhash || ''),
        },
        status: statusInfo.status,
        statusMessage: statusInfo.statusMessage,
        currentGame: playerInfo.gameid && playerInfo.gameextrainfo
          ? {
              appid: parseInt(playerInfo.gameid, 10),
              name: playerInfo.gameextrainfo,
            }
          : undefined,
        playtimeStats: {
          totalForever: totalPlaytimeForever,
          totalTwoWeeks: totalPlaytimeTwoWeeks,
        },
      },
    };

    // 存储到缓存
    cache.set(cacheKey, responseData, ttl.user);

    const duration = Date.now() - startTime;
    Logger.log(`Successfully fetched Steam user data in ${duration}ms`);

    return responseData;
  } catch (error) {
    Logger.error('Error fetching Steam user data', error);
    throw error;
  }
}

/**
 * 获取游戏库和最近游戏数据
 * 职责：仅返回游戏库列表、最近游戏、成就统计（不返回用户信息、不返回成就详情）
 */
export async function handleSteamGamesRequest(
  steamUserId: string,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<GamesResponse> {
  const cacheKey = `steam-games-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<GamesResponse>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam games data');
    return cached;
  }

  Logger.log('Fetching fresh Steam games data');
  const startTime = Date.now();

  try {
    // 1. 获取拥有的游戏
    Logger.log('Fetching owned games...');
    const allGames = await steamApi.getOwnedGames(steamUserId, true);

    // 2. 获取最近游戏
    Logger.log('Fetching recently played games...');
    const recentlyPlayedResult = await steamApi.getRecentlyPlayedGames(
      steamUserId,
      10  // 固定获取最近10个游戏
    );
    const recentlyPlayed = recentlyPlayedResult.games;
    const recentlyPlayedTotalCount = recentlyPlayedResult.totalCount;

    // 3. 获取最近游戏的详细信息
    const topRecentAppIds = recentlyPlayed.map(g => g.appid);
    const gameDetailsMap = await steamApi.getGameDetails(topRecentAppIds);

    // 4. 获取最近游戏和前50个游戏的成就统计（仅用于显示数字，不包含详情）
    Logger.log('Fetching achievement statistics...');
    const achievementsDataMap: Record<
      number,
      Awaited<ReturnType<typeof steamApi.getPlayerAchievements>>
    > = {};

    // 获取最近游戏的成就统计
    for (const appId of topRecentAppIds) {
      try {
        achievementsDataMap[appId] = await steamApi.getPlayerAchievements(steamUserId, appId);
      } catch (error) {
        Logger.warn(`Failed to fetch achievements for app ${appId}`);
      }
    }

    // 获取游戏库中前50个游戏的成就统计
    const allGamesAppIds = allGames.slice(0, 50).map(g => g.appid);
    for (const appId of allGamesAppIds) {
      if (achievementsDataMap[appId]) {
        continue;
      }
      try {
        achievementsDataMap[appId] = await steamApi.getPlayerAchievements(steamUserId, appId);
      } catch (error) {
        Logger.warn(`Failed to fetch achievements for app ${appId}`);
      }
    }

    // 5. 构建最近游戏列表
    const recentGames = recentlyPlayed.map(game => {
      const details = gameDetailsMap[game.appid]?.data;
      const priceOverview = details?.price_overview;

      const achData = achievementsDataMap[game.appid];
      const achievements = achData && achData.playerAchievements.length > 0
        ? {
            total: achData.playerAchievements.length,
            unlocked: achData.playerAchievements.filter(a => a.achieved === 1).length,
            percentage: Math.round((achData.playerAchievements.filter(a => a.achieved === 1).length / achData.playerAchievements.length) * 100),
          }
        : undefined;

      return {
        appid: game.appid,
        name: game.name,
        playtimeForever: Math.floor((game.playtime_forever || 0) / 60),
        playtimeTwoWeeks: Math.floor((game.playtime_2weeks || 0) / 60),
        price: {
          amount: priceOverview?.final || 0,
          currency: priceOverview?.currency || 'CNY',
          displayPrice: priceOverview?.final_formatted || (priceOverview?.final === 0 ? 'Free' : 'N/A'),
        },
        images: {
          icon: ImageBuilder.gameIcon(game.appid, game.img_icon_url),
          logo: ImageBuilder.gameLogo(game.appid, game.img_logo_url),
          headerImage: ImageBuilder.gameHeader(game.appid),
          heroImage: ImageBuilder.gameHero(game.appid),
          libraryHeroImage: ImageBuilder.gameLibraryHero(game.appid),
        },
        releaseDate: details?.release_date?.date || 'Unknown',
        shortDescription: details?.short_description || '',
        achievements,
      };
    });

    // 6. 构建所有游戏列表
    const allGamesList = allGames.slice(0, 100).map(game => {
      const achData = achievementsDataMap[game.appid];
      const achievements = achData && achData.playerAchievements.length > 0
        ? {
            total: achData.playerAchievements.length,
            unlocked: achData.playerAchievements.filter(a => a.achieved === 1).length,
            percentage: Math.round((achData.playerAchievements.filter(a => a.achieved === 1).length / achData.playerAchievements.length) * 100),
          }
        : undefined;

      return {
        appid: game.appid,
        name: game.name,
        playtimeForever: Math.floor((game.playtime_forever || 0) / 60),
        playtimeTwoWeeks: Math.floor((game.playtime_2weeks || 0) / 60),
        images: {
          icon: ImageBuilder.gameIcon(game.appid, game.img_icon_url),
          headerImage: ImageBuilder.gameHeader(game.appid),
        },
        achievements,
      };
    });

    const gamesData: GamesResponse = {
      games: {
        totalCount: allGames.length,
        recentCount: recentlyPlayedTotalCount,
        recentGames,
        allGames: allGamesList,
      },
    };

    // 存储到缓存
    cache.set(cacheKey, gamesData, ttl.games);

    const duration = Date.now() - startTime;
    Logger.log(`Successfully fetched Steam games data in ${duration}ms`);

    return gamesData;
  } catch (error) {
    Logger.error('Error fetching Steam games data', error);
    throw error;
  }
}

/**
 * 获取成就详情数据
 * 职责：仅返回按游戏分组的成就详细列表（不返回用户信息、不返回游戏列表细节）
 */
export async function handleSteamAchievementsRequest(
  steamUserId: string,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<AchievementsResponse> {
  const cacheKey = `steam-achievements-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<AchievementsResponse>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam achievements data');
    return cached;
  }

  Logger.log('Fetching fresh Steam achievements data');
  const startTime = Date.now();

  try {
    // 1. 获取最近游戏 appIds
    Logger.log('Fetching recently played games...');
    const recentlyPlayedResult = await steamApi.getRecentlyPlayedGames(
      steamUserId,
      10  // 固定获取最近10个游戏
    );
    const topRecentAppIds = recentlyPlayedResult.games.map(g => g.appid);

    // 2. 获取游戏库中前50个游戏的 appIds
    Logger.log('Fetching owned games...');
    const allGames = await steamApi.getOwnedGames(steamUserId, false); // includeAppInfo = false
    const allGamesAppIds = allGames.slice(0, 50).map(g => g.appid);

    // 3. 获取成就详情
    Logger.log('Fetching achievement details...');
    const achievementsDataMap: Record<
      number,
      Awaited<ReturnType<typeof steamApi.getPlayerAchievements>>
    > = {};

    // 获取最近游戏的成就
    for (const appId of topRecentAppIds) {
      try {
        achievementsDataMap[appId] = await steamApi.getPlayerAchievements(steamUserId, appId);
      } catch (error) {
        Logger.warn(`Failed to fetch achievements for app ${appId}`);
      }
    }

    // 获取游戏库中前50个游戏的成就
    for (const appId of allGamesAppIds) {
      if (achievementsDataMap[appId]) {
        continue;
      }
      try {
        achievementsDataMap[appId] = await steamApi.getPlayerAchievements(steamUserId, appId);
      } catch (error) {
        Logger.warn(`Failed to fetch achievements for app ${appId}`);
      }
    }

    // 4. 构建成就数据
    let totalAllAchievements = 0;
    let unlockedAllAchievements = 0;
    const achievementsByGame = [];

    const allAchievementAppIds = Array.from(new Set([...topRecentAppIds, ...allGamesAppIds]));

    for (const appId of allAchievementAppIds) {
      const achData = achievementsDataMap[appId];
      if (achData && achData.playerAchievements.length > 0) {
        const schemaMap: Record<string, typeof achData.achievements[0]> = {};
        achData.achievements.forEach(ach => {
          schemaMap[ach.name] = ach;
        });

        const unlockedCount = achData.playerAchievements.filter(a => a.achieved === 1).length;
        totalAllAchievements += achData.playerAchievements.length;
        unlockedAllAchievements += unlockedCount;

        const achievementItems = achData.playerAchievements.map(playerAch => {
          const schema = schemaMap[playerAch.apiname];
          return {
            name: schema?.displayName || playerAch.apiname,
            description: schema?.description || '',
            unlocked: playerAch.achieved === 1,
            unlockTime: playerAch.unlocktime,
            images: {
              icon: schema
                ? ImageBuilder.achievementIcon(appId, schema.icon.split('/').pop() || '')
                : '',
              iconGray: schema
                ? ImageBuilder.achievementIconGray(appId, schema.icongray.split('/').pop() || '')
                : '',
            },
          };
        });

        // 查找游戏名称
        const gameName = recentlyPlayedResult.games.find(g => g.appid === appId)?.name ||
          allGames.find(g => g.appid === appId)?.name ||
          '';

        achievementsByGame.push({
          appid: appId,
          gameName,
          total: achData.playerAchievements.length,
          unlocked: unlockedCount,
          percentage: Math.round((unlockedCount / achData.playerAchievements.length) * 100),
          items: achievementItems,
        });
      }
    }

    const achievementsData: AchievementsResponse = {
      achievements: {
        totalCount: totalAllAchievements,
        unlockedCount: unlockedAllAchievements,
        unlockedPercentage:
          totalAllAchievements > 0
            ? Math.round((unlockedAllAchievements / totalAllAchievements) * 100)
            : 0,
        byGame: achievementsByGame,
      },
    };

    // 存储到缓存
    cache.set(cacheKey, achievementsData, ttl.achievements);

    const duration = Date.now() - startTime;
    Logger.log(`Successfully fetched Steam achievements data in ${duration}ms`);

    return achievementsData;
  } catch (error) {
    Logger.error('Error fetching Steam achievements data', error);
    throw error;
  }
}

/**
 * Create a platform-neutral handler function that accepts a platform request/response
 * For Vercel/Netlify/Cloudflare the adapters will call this with the appropriate wrappers
 */
export function createPlatformHandler(handlerFn: (steamApi: any, ttl: any, steamUserId: string) => Promise<any>) {
  return async function platformHandler(context: { steamApiKey?: string; steamUserId?: string; env?: any }) {
    const { steamApiKey, steamUserId, env } = context;

    const envKey = steamApiKey || process.env.STEAM_API_KEY;
    const userId = steamUserId || process.env.STEAM_USER_ID;

    if (!envKey || !userId) {
      throw new Error('Missing environment variables');
    }

    const steamApi = new SteamApi(envKey as string);
    const ttl = getCacheTTL();
    return await handlerFn(steamApi, ttl, userId as string);
  };
}
