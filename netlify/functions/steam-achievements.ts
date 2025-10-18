/**
 * Netlify 函数入口
 * netlify/functions/steam-achievements.ts
 */

import { SteamApi } from '../../lib/steam-api.js';
import { Logger } from '../../lib/utils.js';
import {
  validateEnvironment,
  getCacheTTL,
  handleSteamAchievementsRequest,
} from '../../lib/handler.js';
import type { SuccessResponse, ErrorResponse } from '../../lib/types.js';

/**
 * 添加 CORS headers
 */
function addCorsHeaders(headers: Record<string, string>) {
  return {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json; charset=utf-8',
  };
}

/**
 * Netlify 处理函数
 */
export const handler = async (event: any) => {
  const headers = addCorsHeaders({});

  // 处理 OPTIONS 请求（CORS 预检）
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  // 只允许 GET 请求
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Method not allowed',
        code: 'METHOD_NOT_ALLOWED',
      } as ErrorResponse),
    };
  }

  // 验证环境变量
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: envCheck.error || 'Environment error',
        code: 'ENV_ERROR',
      } as ErrorResponse),
    };
  }

  try {
    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

    const steamApi = new SteamApi(steamApiKey);
    const startTime = Date.now();

    const data = await handleSteamAchievementsRequest(steamUserId, steamApi, ttl);

    const successResponse: SuccessResponse = {
      success: true,
      data,
      metadata: {
        cached: true,
        cachedAt: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + ttl.achievements).toISOString(),
        fetchDuration: `${Date.now() - startTime}ms`,
      },
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(successResponse),
    };
  } catch (error) {
    Logger.error('API error', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch Steam achievements data',
        code: 'STEAM_API_ERROR',
      } as ErrorResponse),
    };
  }
};
