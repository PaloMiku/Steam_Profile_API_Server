/**
 * 通用 API 处理器 - 支持多平台
 * 可在 Vercel, Netlify, Express 等平台使用
 */

import { SteamApi } from './steam-api.js';
import { cache, getTTL, getTTLFromHours } from './cache.js';
import { ImageBuilder, Logger, getStatusText } from './utils.js';
import type { SuccessResponse, ErrorResponse, ResponseData } from './types.js';

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
 * 主处理函数
 */
export async function handleSteamUserRequest(
  steamUserId: string,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<ResponseData> {
  const cacheKey = `steam-user-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<ResponseData>(cacheKey);
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
    
    // 2. 根据玩家所在国家设置币种
    if (playerInfo.loccountrycode) {
      Logger.log(`Detected player country: ${playerInfo.loccountrycode}`);
      steamApi.setCountryCode(playerInfo.loccountrycode);
    }

    // 3. 获取拥有的游戏
    Logger.log('Fetching owned games...');
    const allGames = await steamApi.getOwnedGames(steamUserId, true);

    // 4. 获取最近游戏
    Logger.log('Fetching recently played games...');
    const recentlyPlayedResult = await steamApi.getRecentlyPlayedGames(
      steamUserId,
      10  // 固定获取最近10个游戏
    );
    const recentlyPlayed = recentlyPlayedResult.games;
    const recentlyPlayedTotalCount = recentlyPlayedResult.totalCount;

    // 5. 获取最近游戏的详细信息
    const topRecentAppIds = recentlyPlayed.map(g => g.appid);
    const gameDetailsMap = await steamApi.getGameDetails(topRecentAppIds);

    // 6. 获取成就信息（对最近游戏的所有游戏 + 游戏库的前50个游戏）
    Logger.log('Fetching achievements...');
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
    const allGamesAppIds = allGames.slice(0, 50).map(g => g.appid);
    for (const appId of allGamesAppIds) {
      // 如果已经获取过（在最近游戏中），跳过
      if (achievementsDataMap[appId]) {
        continue;
      }
      try {
        achievementsDataMap[appId] = await steamApi.getPlayerAchievements(steamUserId, appId);
      } catch (error) {
        Logger.warn(`Failed to fetch achievements for app ${appId}`);
      }
    }

    // 7. 构建响应数据

    // 构建最近游戏列表（对应成就信息）
    const recentGames = recentlyPlayed.map(game => {
      const details = gameDetailsMap[game.appid]?.data;
      const priceOverview = details?.price_overview;
      
      // 获取该游戏的成就统计
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
        playtimeForever: Math.floor((game.playtime_forever || 0) / 60), // 转换为小时
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

    const allGamesList = allGames.slice(0, 100).map(game => {
      // 获取该游戏的成就统计
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

    // 计算总游玩时长统计
    const totalPlaytimeForever = Math.floor(
      allGames.reduce((sum, game) => sum + (game.playtime_forever || 0), 0) / 60
    );
    const totalPlaytimeTwoWeeks = Math.floor(
      allGames.reduce((sum, game) => sum + (game.playtime_2weeks || 0), 0) / 60
    );

    // 获取所有游戏的成就总数（包括最近游戏和游戏库中的游戏）
    let totalAllAchievements = 0;
    let unlockedAllAchievements = 0;

    const achievementsByGame = [];
    
    // 构建成就数据（包括最近游戏和游戏库前50个游戏）
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

        // 查找游戏名称（可能在最近游戏中，也可能在所有游戏中）
        const gameName =
          recentlyPlayed.find(g => g.appid === appId)?.name ||
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

    const responseData: ResponseData = {
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
      games: {
        totalCount: allGames.length,
        recentCount: recentlyPlayedTotalCount, // 使用 Steam API 返回的总数
        recentGames,
        allGames: allGamesList,
      },
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
 * 获取游戏库数据（不包含成就详情，仅成就统计）
 */
export async function handleSteamGamesRequest(
  steamUserId: string,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<ResponseData['games']> {
  const cacheKey = `steam-games-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<ResponseData['games']>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam games data');
    return cached;
  }

  Logger.log('Fetching fresh Steam games data');
  const startTime = Date.now();

  try {
    // 1. 获取玩家基本信息（用于获取地区码）
    Logger.log('Fetching player summaries...');
    const playerSummaries = await steamApi.getPlayerSummaries(steamUserId);
    if (!playerSummaries || playerSummaries.length === 0) {
      throw new Error('Player not found or profile is private');
    }

    const playerInfo = playerSummaries[0];
    if (playerInfo.loccountrycode) {
      steamApi.setCountryCode(playerInfo.loccountrycode);
    }

    // 2. 获取拥有的游戏
    Logger.log('Fetching owned games...');
    const allGames = await steamApi.getOwnedGames(steamUserId, true);

    // 3. 获取最近游戏
    Logger.log('Fetching recently played games...');
    const recentlyPlayedResult = await steamApi.getRecentlyPlayedGames(
      steamUserId,
      10  // 固定获取最近10个游戏
    );
    const recentlyPlayed = recentlyPlayedResult.games;
    const recentlyPlayedTotalCount = recentlyPlayedResult.totalCount;

    // 4. 获取最近游戏的详细信息
    const topRecentAppIds = recentlyPlayed.map(g => g.appid);
    const gameDetailsMap = await steamApi.getGameDetails(topRecentAppIds);

    // 5. 获取所有游戏的成就统计（用于显示，不包含详情）
    Logger.log('Fetching game achievements summary...');
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

    // 6. 构建最近游戏列表
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

    // 7. 构建所有游戏列表
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

    const gamesData: ResponseData['games'] = {
      totalCount: allGames.length,
      recentCount: recentlyPlayedTotalCount,
      recentGames,
      allGames: allGamesList,
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
 * 获取成就数据（包含详细的成就列表）
 */
export async function handleSteamAchievementsRequest(
  steamUserId: string,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<ResponseData['achievements']> {
  const cacheKey = `steam-achievements-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<ResponseData['achievements']>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam achievements data');
    return cached;
  }

  Logger.log('Fetching fresh Steam achievements data');
  const startTime = Date.now();

  try {
    // 1. 获取最近游戏
    Logger.log('Fetching recently played games...');
    const recentlyPlayedResult = await steamApi.getRecentlyPlayedGames(
      steamUserId,
      10  // 固定获取最近10个游戏
    );
    const recentlyPlayed = recentlyPlayedResult.games;

    // 2. 获取拥有的游戏
    Logger.log('Fetching owned games...');
    const allGames = await steamApi.getOwnedGames(steamUserId, true);

    // 3. 获取成就信息
    Logger.log('Fetching achievements...');
    const topRecentAppIds = recentlyPlayed.map(g => g.appid);
    const allGamesAppIds = allGames.slice(0, 50).map(g => g.appid);

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

        const gameName =
          recentlyPlayed.find(g => g.appid === appId)?.name ||
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

    const achievementsData: ResponseData['achievements'] = {
      totalCount: totalAllAchievements,
      unlockedCount: unlockedAllAchievements,
      unlockedPercentage:
        totalAllAchievements > 0
          ? Math.round((unlockedAllAchievements / totalAllAchievements) * 100)
          : 0,
      byGame: achievementsByGame,
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
