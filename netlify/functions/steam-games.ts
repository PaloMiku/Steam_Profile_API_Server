/**
 * Steam 游戏库 API - Netlify 函数
 * GET /api/steam-games
 */

import { SteamApi } from '../../lib/steam-api.js';
import { Logger } from '../../lib/utils.js';
import { validateEnvironment, getCacheTTL, handleSteamGamesRequest } from '../../lib/handler.js';
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
    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

    const steamApi = new SteamApi(steamApiKey);
    const startTime = Date.now();

    const data = await handleSteamGamesRequest(steamUserId, steamApi, ttl);

    const successResponse: SuccessResponse = {
      success: true,
      data,
      metadata: {
        cached: true,
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
    const errorBody = JSON.stringify({
      success: false,
      error: 'Failed to fetch Steam games data',
      code: 'STEAM_API_ERROR',
    });
    return new Response(errorBody, {
      status: 500,
      headers: getCorsHeaders(),
    });
  }
};
