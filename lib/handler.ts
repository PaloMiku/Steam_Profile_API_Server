/**
 * 通用 API 处理器 - 支持多平台
 * 可在 Vercel, Netlify, Express 等平台使用
 */

import { SteamApi } from './steam-api.js';
import { cache, getTTL, getTTLFromHours } from './cache.js';
import { ImageBuilder, Logger, getStatusText } from './utils.js';
import { mapWithConcurrency, DEFAULT_CONCURRENCY } from './pool.js';
import type { UserResponse, GamesResponse, AchievementsResponse, SingleGameResponse } from './types.js';
import { DEFAULT_GAME_LIMIT, MAX_GAME_LIMIT } from './types.js';

/**
 * 处理器统一返回结构：业务数据 + 本次缓存的真实命中状态与时间戳
 */
export interface HandlerResult<T> {
  data: T;
  cacheHit: boolean;
  cachedAt: string;
  cacheExpiry: string;
}

/**
 * 构造 HandlerResult 的缓存元信息
 * MemoryCache 只暴露 getExpiry（= timestamp + ttl），据此反推写入时间，
 * 避免为此改动 cache.ts
 */
function buildCacheMeta(cacheKey: string, ttlMs: number, cacheHit: boolean) {
  if (cacheHit) {
    const expiry = cache.getExpiry(cacheKey);
    const expiryTime = expiry ? Date.parse(expiry) : NaN;
    if (!Number.isNaN(expiryTime)) {
      return {
        cacheHit: true,
        cachedAt: new Date(expiryTime - ttlMs).toISOString(),
        cacheExpiry: new Date(expiryTime).toISOString(),
      };
    }
  }

  const now = Date.now();
  return {
    cacheHit,
    cachedAt: new Date(now).toISOString(),
    cacheExpiry: new Date(now + ttlMs).toISOString(),
  };
}

// 验证环境变量
export function validateEnvironment(env: Record<string, string | undefined> = process.env): { valid: boolean; error?: string } {
  const steamApiKey = env.STEAM_API_KEY;
  const steamUserId = env.STEAM_USER_ID;

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
export function getCacheTTL(env: Record<string, string | undefined> = process.env) {
  const userMinutes = parseInt(env.CACHE_TTL_USER_MINUTES || '10', 10);
  const gamesHours = parseInt(env.CACHE_TTL_GAMES_HOURS || '24', 10);
  const achievementsHours = parseInt(env.CACHE_TTL_ACHIEVEMENTS_HOURS || '1', 10);

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
): Promise<HandlerResult<UserResponse>> {
  const cacheKey = `steam-user-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<UserResponse>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam user data');
    return { data: cached, ...buildCacheMeta(cacheKey, ttl.user, true) };
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

    return { data: responseData, ...buildCacheMeta(cacheKey, ttl.user, false) };
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
  ttl: ReturnType<typeof getCacheTTL>,
  limit: number = DEFAULT_GAME_LIMIT
): Promise<HandlerResult<GamesResponse>> {
  // 验证 limit 参数
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GAME_LIMIT) {
    limit = DEFAULT_GAME_LIMIT;
  }

  const cacheKey = `steam-games-${steamUserId}-limit${limit}`;

  // 检查缓存
  const cached = cache.get<GamesResponse>(cacheKey);
  if (cached) {
    Logger.debug(`Using cached Steam games data (limit=${limit})`);
    return { data: cached, ...buildCacheMeta(cacheKey, ttl.games, true) };
  }

  Logger.log('Fetching fresh Steam games data');
  const startTime = Date.now();

  try {
    // 1. 全量拉取一次：既算 totalCount，也本地排序取前 limit 个
    Logger.log('Fetching owned games (full)...');
    const [allGamesFull, recentlyPlayedResult] = await Promise.all([
      steamApi.getOwnedGames(steamUserId, true),
      steamApi.getRecentlyPlayedGames(
        steamUserId,
        10  // 固定获取最近10个游戏
      ),
    ]);
    const totalGameCount = allGamesFull.length;
    const allGames = [...allGamesFull]
      .sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0))
      .slice(0, limit);
    const recentlyPlayed = recentlyPlayedResult.games;
    const recentlyPlayedTotalCount = recentlyPlayedResult.totalCount;

    // 2. 获取最近游戏的详细信息
    const topRecentAppIds = recentlyPlayed.map(g => g.appid);
    const gameDetailsMap = await steamApi.getGameDetails(topRecentAppIds);

    // 3. 获取最近游戏和前 limit 个游戏的成就统计（仅用于显示数字，不包含详情）
    Logger.log('Fetching achievement statistics...');
    const achievementsDataMap: Record<
      number,
      Awaited<ReturnType<typeof steamApi.getPlayerAchievements>>
    > = {};

    const achievementAppIds = Array.from(new Set([...topRecentAppIds, ...allGames.map(g => g.appid)]));
    const achievementResults = await mapWithConcurrency(
      achievementAppIds,
      DEFAULT_CONCURRENCY,
      async (appId) => {
        try {
          return await steamApi.getPlayerAchievements(steamUserId, appId);
        } catch (error) {
          Logger.warn(`Failed to fetch achievements for app ${appId}`);
          return undefined;
        }
      }
    );
    achievementAppIds.forEach((appId, index) => {
      const result = achievementResults[index];
      if (result) {
        achievementsDataMap[appId] = result;
      }
    });

    // 4. 构建最近游戏列表
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

    // 5. 构建所有游戏列表（已按总时长排序）
    const allGamesList = allGames.map(game => {
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
        totalCount: totalGameCount,
        recentCount: recentlyPlayedTotalCount,
        recentGames,
        allGames: allGamesList,
      },
    };

    // 存储到缓存
    cache.set(cacheKey, gamesData, ttl.games);

    const duration = Date.now() - startTime;
    Logger.log(`Successfully fetched Steam games data in ${duration}ms (limit=${limit}, returned=${allGamesList.length} games, recent=${recentGames.length})`);

    return { data: gamesData, ...buildCacheMeta(cacheKey, ttl.games, false) };
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
): Promise<HandlerResult<AchievementsResponse>> {
  const cacheKey = `steam-achievements-${steamUserId}`;

  // 检查缓存
  const cached = cache.get<AchievementsResponse>(cacheKey);
  if (cached) {
    Logger.debug('Using cached Steam achievements data');
    return { data: cached, ...buildCacheMeta(cacheKey, ttl.achievements, true) };
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
    Logger.log('Fetching owned games (limit=50)...');
    const allGames = await steamApi.getOwnedGames(steamUserId, false, 50); // includeAppInfo = false, limit = 50
    const allGamesAppIds = allGames.map(g => g.appid);

    // 3. 获取成就详情
    Logger.log('Fetching achievement details...');
    const achievementsDataMap: Record<
      number,
      Awaited<ReturnType<typeof steamApi.getPlayerAchievements>>
    > = {};

    const achievementAppIds = Array.from(new Set([...topRecentAppIds, ...allGamesAppIds]));
    const achievementResults = await mapWithConcurrency(
      achievementAppIds,
      DEFAULT_CONCURRENCY,
      async (appId) => {
        try {
          return await steamApi.getPlayerAchievements(steamUserId, appId);
        } catch (error) {
          Logger.warn(`Failed to fetch achievements for app ${appId}`);
          return undefined;
        }
      }
    );
    achievementAppIds.forEach((appId, index) => {
      const result = achievementResults[index];
      if (result) {
        achievementsDataMap[appId] = result;
      }
    });

    // 4. 构建成就数据
    let totalAllAchievements = 0;
    let unlockedAllAchievements = 0;
    const achievementsByGame = [];

    for (const appId of achievementAppIds) {
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

    return { data: achievementsData, ...buildCacheMeta(cacheKey, ttl.achievements, false) };
  } catch (error) {
    Logger.error('Error fetching Steam achievements data', error);
    throw error;
  }
}

/**
 * 获取单个游戏的详细信息和时间统计
 * 职责：返回单个游戏的完整信息，包括时间统计、成就统计、价格等
 */
export async function handleSingleGameRequest(
  steamUserId: string,
  appId: number,
  steamApi: SteamApi,
  ttl: ReturnType<typeof getCacheTTL>
): Promise<HandlerResult<SingleGameResponse>> {
  // 验证 appId 参数
  if (!Number.isInteger(appId) || appId <= 0) {
    throw new Error('Invalid appId: must be a positive integer');
  }

  const cacheKey = `steam-game-${steamUserId}-${appId}`;

  // 检查缓存
  const cached = cache.get<SingleGameResponse>(cacheKey);
  if (cached) {
    Logger.debug(`Using cached Steam game data (appId=${appId})`);
    return { data: cached, ...buildCacheMeta(cacheKey, ttl.games, true) };
  }

  Logger.log(`Fetching fresh Steam game data for appId=${appId}`);
  const startTime = Date.now();

  try {
    // 1. 获取该游戏的信息
    const gameInfo = await steamApi.getPlayerGameInfo(steamUserId, appId);

    if (!gameInfo.game) {
      throw new Error(`Game with appId ${appId} not found in user's library`);
    }

    const game = gameInfo.game;
    const detailsRaw = gameInfo.detailsRaw;
    const details = detailsRaw?.data;
    const priceOverview = details?.price_overview;

    // 2. 构建响应数据
    const responseData: SingleGameResponse = {
      game: {
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
        achievements: gameInfo.achievements,
      },
    };

    // 存储到缓存
    cache.set(cacheKey, responseData, ttl.games);

    const duration = Date.now() - startTime;
    Logger.log(`Successfully fetched Steam game data in ${duration}ms (appId=${appId})`);

    return { data: responseData, ...buildCacheMeta(cacheKey, ttl.games, false) };
  } catch (error) {
    Logger.error(`Error fetching Steam game data (appId=${appId})`, error);
    throw error;
  }
}

/**
 * 清理游戏数据缓存
 */
export function clearGamesCache(steamUserId: string): void {
  // 清理所有不同 limit 的缓存
  for (let limit = 1; limit <= 100; limit++) {
    cache.delete(`steam-games-${steamUserId}-limit${limit}`);
  }
  Logger.log(`Cleared all games cache for user ${steamUserId}`);
}
