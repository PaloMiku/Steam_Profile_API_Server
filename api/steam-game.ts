/**
 * Steam 单个游戏信息 API 端点
 * GET /api/steam-game?appid=xxx
 * Vercel Serverless Function
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SteamApi } from '../lib/steam-api.js';
import { Logger } from '../lib/utils.js';
import {
  validateEnvironment,
  getCacheTTL,
  handleSingleGameRequest,
} from '../lib/handler.js';
import type { SuccessResponse, ErrorResponse } from '../lib/types.js';

/**
 * 添加 CORS headers
 */
function addCorsHeaders(response: VercelResponse) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
}

/**
 * 返回错误响应
 */
function sendError(
  response: VercelResponse,
  statusCode: number,
  message: string,
  code: string
): void {
  const errorResponse: ErrorResponse = {
    success: false,
    error: message,
    code,
  };
  response.status(statusCode).json(errorResponse);
}

/**
 * Vercel 处理函数
 */
export default async (request: VercelRequest, response: VercelResponse): Promise<void> => {
  addCorsHeaders(response);

  // 处理 OPTIONS 请求（CORS 预检）
  if (request.method === 'OPTIONS') {
    response.status(200).end();
    return;
  }

  // 只允许 GET 请求
  if (request.method !== 'GET') {
    sendError(response, 405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
    return;
  }

  // 验证环境变量
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    sendError(response, 500, envCheck.error || 'Environment error', 'ENV_ERROR');
    return;
  }

  try {
    // 获取并验证 appid 参数
    const appIdParam = request.query.appid as string;
    if (!appIdParam) {
      sendError(response, 400, 'Missing required query parameter: appid', 'MISSING_PARAM');
      return;
    }

    const appId = parseInt(appIdParam, 10);
    if (isNaN(appId) || appId <= 0) {
      sendError(response, 400, 'Invalid appid: must be a positive integer', 'INVALID_PARAM');
      return;
    }

    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

    // 可选参数：国家代码
    const countryCode = (request.query.cc as string) || undefined;

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

    response.status(200).json(successResponse);
  } catch (error) {
    Logger.error('API error', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      sendError(response, 404, `Game not found in user's library`, 'GAME_NOT_FOUND');
    } else {
      sendError(response, 500, 'Failed to fetch Steam game data', 'STEAM_API_ERROR');
    }
  }
};
