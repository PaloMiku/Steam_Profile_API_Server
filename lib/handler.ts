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
    const recentlyPlayed = await steamApi.getRecentlyPlayedGames(steamUserId, 20);

    // 5. 获取前 5 个最近游戏的详细信息
    const topRecentAppIds = recentlyPlayed.slice(0, 5).map(g => g.appid);
    const gameDetailsMap = await steamApi.getGameDetails(topRecentAppIds);

    // 6. 获取成就信息（对最近游戏的前 5 个）
    Logger.log('Fetching achievements...');
    const achievementsDataMap: Record<
      number,
      Awaited<ReturnType<typeof steamApi.getPlayerAchievements>>
    > = {};
    let totalAchievements = 0;
    let unlockedAchievements = 0;

    for (const appId of topRecentAppIds.slice(0, 5)) {
      try {
        achievementsDataMap[appId] = await steamApi.getPlayerAchievements(steamUserId, appId);
        const playerAchs = achievementsDataMap[appId].playerAchievements;
        totalAchievements += playerAchs.length;
        unlockedAchievements += playerAchs.filter(a => a.achieved === 1).length;
      } catch (error) {
        Logger.warn(`Failed to fetch achievements for app ${appId}`);
      }
    }

    // 7. 构建响应数据

    // 6. 构建响应数据
    const recentGames = recentlyPlayed.slice(0, 10).map(game => {
      const details = gameDetailsMap[game.appid]?.data;
      const priceOverview = details?.price_overview;

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
      };
    });

    const allGamesList = allGames.slice(0, 100).map(game => ({
      appid: game.appid,
      name: game.name,
      playtimeForever: Math.floor((game.playtime_forever || 0) / 60),
      playtimeTwoWeeks: Math.floor((game.playtime_2weeks || 0) / 60),
      images: {
        icon: ImageBuilder.gameIcon(game.appid, game.img_icon_url),
        headerImage: ImageBuilder.gameHeader(game.appid),
      },
    }));

    // 计算总游玩时长统计
    const totalPlaytimeForever = Math.floor(
      allGames.reduce((sum, game) => sum + (game.playtime_forever || 0), 0) / 60
    );
    const totalPlaytimeTwoWeeks = Math.floor(
      allGames.reduce((sum, game) => sum + (game.playtime_2weeks || 0), 0) / 60
    );

    // 获取所有游戏的成就总数
    let totalAllAchievements = 0;
    let unlockedAllAchievements = 0;

    const achievementsByGame = [];
    for (const appId of topRecentAppIds.slice(0, 5)) {
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

        achievementsByGame.push({
          appid: appId,
          gameName: recentlyPlayed.find(g => g.appid === appId)?.name || '',
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
