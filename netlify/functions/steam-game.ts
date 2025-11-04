/**
 * Steam 单个游戏信息 API - Netlify 函数
 * GET /api/steam-game?appid=xxx
 */

import { SteamApi } from '../../lib/steam-api.js';
import { Logger } from '../../lib/utils.js';
import { validateEnvironment, getCacheTTL, handleSingleGameRequest } from '../../lib/handler.js';
import type { SuccessResponse, ErrorResponse } from '../../lib/types.js';
import {
  getCorsHeaders,
  sendSuccess,
  sendError,
  handleCorsPreFlight,
} from '../adapters/steam-handler.js';

export default async (req: Request): Promise<Response> => {
  // 处理 CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('', {
      status: 200,
      headers: getCorsHeaders(),
    });
  }

  // 只允许 GET 请求
  if (req.method !== 'GET') {
    const errorBody = JSON.stringify({
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    });
    return new Response(errorBody, {
      status: 405,
      headers: getCorsHeaders(),
    });
  }

  // 验证环境变量
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    const errorBody = JSON.stringify({
      success: false,
      error: envCheck.error || 'Environment error',
      code: 'ENV_ERROR',
    });
    return new Response(errorBody, {
      status: 500,
      headers: getCorsHeaders(),
    });
  }

  try {
    // 获取并验证 appid 参数
    const url = new URL(req.url);
    const appIdParam = url.searchParams.get('appid');
    
    if (!appIdParam) {
      const errorBody = JSON.stringify({
        success: false,
        error: 'Missing required query parameter: appid',
        code: 'MISSING_PARAM',
      });
      return new Response(errorBody, {
        status: 400,
        headers: getCorsHeaders(),
      });
    }

    const appId = parseInt(appIdParam, 10);
    if (isNaN(appId) || appId <= 0) {
      const errorBody = JSON.stringify({
        success: false,
        error: 'Invalid appid: must be a positive integer',
        code: 'INVALID_PARAM',
      });
      return new Response(errorBody, {
        status: 400,
        headers: getCorsHeaders(),
      });
    }

    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

    const countryCode = url.searchParams.get('cc') || undefined;

    Logger.log(`API request: appid=${appId}, cc=${countryCode || 'default'}`);
    const steamApi = new SteamApi(steamApiKey, countryCode);
    const startTime = Date.now();

    const data = await handleSingleGameRequest(steamUserId, appId, steamApi, ttl);

    const successResponse: SuccessResponse = {
      success: true,
      data,
      metadata: {
        cached: false,
        cachedAt: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + ttl.games).toISOString(),
        fetchDuration: `${Date.now() - startTime}ms`,
      },
    };

    return new Response(JSON.stringify(successResponse), {
      status: 200,
      headers: getCorsHeaders(),
    });
  } catch (error) {
    Logger.error('API error', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      const errorBody = JSON.stringify({
        success: false,
        error: `Game not found in user's library`,
        code: 'GAME_NOT_FOUND',
      });
      return new Response(errorBody, {
        status: 404,
        headers: getCorsHeaders(),
      });
    }
    
    const errorBody = JSON.stringify({
      success: false,
      error: 'Failed to fetch Steam game data',
      code: 'STEAM_API_ERROR',
    });
    return new Response(errorBody, {
      status: 500,
      headers: getCorsHeaders(),
    });
  }
};
