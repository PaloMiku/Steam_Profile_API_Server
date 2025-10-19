/**
 * Cloudflare Worker 入口
 * src/index.ts
 */

import { SteamApi } from '../lib/steam-api.js';
import { Logger } from '../lib/utils.js';
import {
  validateEnvironment,
  getCacheTTL,
  handleSteamUserRequest,
} from '../lib/handler.js';
import type { SuccessResponse, ErrorResponse } from '../lib/types.js';

/**
 * 添加 CORS headers
 */
function addCorsHeaders(response: Response): Response {
  const newResponse = new Response(response.body, response);
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  newResponse.headers.set('Content-Type', 'application/json; charset=utf-8');
  return newResponse;
}

/**
 * Cloudflare Worker 处理函数
 */
export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // 处理 CORS 预检请求
    if (request.method === 'OPTIONS') {
      return addCorsHeaders(
        new Response('', {
          status: 200,
        })
      );
    }

    // 只允许 GET 请求
    if (request.method !== 'GET') {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
      };
      return addCorsHeaders(
        new Response(JSON.stringify(errorResponse), {
          status: 405,
        })
      );
    }

    // 验证环境变量（Cloudflare Workers 使用 env 对象）
    const steamApiKey = env.STEAM_API_KEY;
    const steamUserId = env.STEAM_USER_ID;

    if (!steamApiKey || !steamUserId) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Missing environment variables',
        code: 'ENV_ERROR',
      };
      return addCorsHeaders(
        new Response(JSON.stringify(errorResponse), {
          status: 500,
        })
      );
    }

    if (!/^\d{17}$/.test(steamUserId)) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'STEAM_USER_ID must be a 17-digit number',
        code: 'ENV_ERROR',
      };
      return addCorsHeaders(
        new Response(JSON.stringify(errorResponse), {
          status: 500,
        })
      );
    }

    try {
      // 为 Cloudflare Workers 配置环境变量
      process.env.STEAM_API_KEY = steamApiKey;
      process.env.STEAM_USER_ID = steamUserId;
      process.env.CACHE_TTL_USER_MINUTES = env.CACHE_TTL_USER_MINUTES || '5';
      process.env.CACHE_TTL_GAMES_HOURS = env.CACHE_TTL_GAMES_HOURS || '24';
      process.env.CACHE_TTL_ACHIEVEMENTS_HOURS = env.CACHE_TTL_ACHIEVEMENTS_HOURS || '1';

      const ttl = getCacheTTL();
  const urlObj = new URL(request.url);
  const countryCode = urlObj.searchParams.get('cc') || undefined;
  const steamApi = new SteamApi(steamApiKey, countryCode);
      const startTime = Date.now();

      const data = await handleSteamUserRequest(steamUserId, steamApi, ttl);

      const successResponse: SuccessResponse = {
        success: true,
        data,
        metadata: {
          cached: true,
          cachedAt: new Date().toISOString(),
          cacheExpiry: new Date(Date.now() + ttl.user).toISOString(),
          fetchDuration: `${Date.now() - startTime}ms`,
        },
      };

      return addCorsHeaders(
        new Response(JSON.stringify(successResponse), {
          status: 200,
        })
      );
    } catch (error) {
      Logger.error('API error', error);
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Failed to fetch Steam user data',
        code: 'STEAM_API_ERROR',
      };
      return addCorsHeaders(
        new Response(JSON.stringify(errorResponse), {
          status: 500,
        })
      );
    }
  },
};
