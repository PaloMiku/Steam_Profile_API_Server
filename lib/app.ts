/**
 * 平台中立的请求处理器
 * 全部入口（Vercel / Netlify / Cloudflare Workers / Express）都转发到这里
 *
 * 环境变量约定：
 * - STEAM_API_KEY / STEAM_USER_ID 必填，由 validateEnvironment 校验
 * - CACHE_TTL_USER_MINUTES / CACHE_TTL_GAMES_HOURS / CACHE_TTL_ACHIEVEMENTS_HOURS
 *   控制服务端内存缓存 TTL，同时也是 CDN Cache-Control 的 s-maxage 来源
 * - ADMIN_TOKEN 可选。配置后，clear_cache=1 请求必须带 ?admin_token=<token>，
 *   否则返回 401；未配置时 clear_cache 保持公开（兼容既有部署）
 */

import { SteamApi } from './steam-api.js';
import { Logger } from './utils.js';
import {
  validateEnvironment,
  getCacheTTL,
  handleSteamUserRequest,
  handleSteamGamesRequest,
  handleSingleGameRequest,
  handleSteamAchievementsRequest,
  clearGamesCache,
} from './handler.js';
import type { SuccessResponse, ErrorResponse } from './types.js';
import { MAX_GAME_LIMIT, DEFAULT_GAME_LIMIT } from './types.js';

export type Env = Record<string, string | undefined>;

export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

/**
 * 缓存层回传给平台层的命中信息，与 lib/handler.ts 的 HandlerResult 保持一致
 */
interface HandlerResult<T> {
  data: T;
  cacheHit: boolean;
  cachedAt: string; // ISO
  cacheExpiry: string; // ISO
}

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, ...extraHeaders },
  });
}

function fail(status: number, message: string, code: string): Response {
  return json(status, { success: false, error: message, code } satisfies ErrorResponse);
}

// 这些端点都是只读公开 GET，密钥和 SteamID 都不出现在响应里，可以放心交给边缘缓存
const STALE_WHILE_REVALIDATE_CAP_SECONDS = 3600;

/**
 * 由服务端缓存 TTL 推导 CDN 指令。TTL 由环境变量控制，配置多少边缘就缓存多久
 */
function cacheControl(ttlMs: number): string {
  const sMaxAge = Math.max(0, Math.floor(ttlMs / 1000));
  // 24 小时级别的端点若再挂一个等长的 revalidate 窗口，过期数据会滞留太久
  const staleWhileRevalidate = Math.min(sMaxAge, STALE_WHILE_REVALIDATE_CAP_SECONDS);
  return `public, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`;
}

interface RequestContext {
  steamApiKey: string;
  steamUserId: string;
  ttl: ReturnType<typeof getCacheTTL>;
  adminToken?: string;
  request: Request;
}

async function ok<T extends SuccessResponse['data']>(
  run: () => Promise<HandlerResult<T>>,
  ttlMs: number,
  cacheable = true
): Promise<Response> {
  const startTime = Date.now();
  const result = await run();

  return json(
    200,
    {
      success: true,
      data: result.data,
      metadata: {
        cached: result.cacheHit,
        cachedAt: result.cachedAt,
        cacheExpiry: result.cacheExpiry,
        fetchDuration: `${Date.now() - startTime}ms`,
      },
    } satisfies SuccessResponse,
    { 'Cache-Control': cacheable ? cacheControl(ttlMs) : 'no-store' }
  );
}

function countryCodeOf(url: URL): string | undefined {
  return url.searchParams.get('cc') || undefined;
}

/**
 * ADMIN_TOKEN 未配置时不做校验；配置了则 token 必须匹配，否则返回 401
 * 优先读 Authorization 头：查询参数会进入 CDN 缓存键和访问日志，头不会
 */
function authorizeAdmin(url: URL, ctx: RequestContext): Response | null {
  if (!ctx.adminToken) {
    return null;
  }

  const bearer = ctx.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const provided = bearer || url.searchParams.get('admin_token') || '';

  if (provided !== ctx.adminToken) {
    Logger.warn(`Rejected clear_cache request with invalid admin token on ${url.pathname}`);
    return fail(401, 'Invalid or missing admin_token', 'UNAUTHORIZED');
  }

  return null;
}

async function steamUser(url: URL, ctx: RequestContext): Promise<Response> {
  const steamApi = new SteamApi(ctx.steamApiKey, countryCodeOf(url));
  return ok(() => handleSteamUserRequest(ctx.steamUserId, steamApi, ctx.ttl), ctx.ttl.user);
}

async function steamGames(url: URL, ctx: RequestContext): Promise<Response> {
  const countryCode = countryCodeOf(url);
  let limit = parseInt(url.searchParams.get('limit') || String(DEFAULT_GAME_LIMIT), 10);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_GAME_LIMIT) {
    limit = DEFAULT_GAME_LIMIT;
  }

  const clearCache =
    url.searchParams.get('clear_cache') === 'true' ||
    url.searchParams.get('clear_cache') === '1';

  if (clearCache) {
    const denied = authorizeAdmin(url, ctx);
    if (denied) {
      return denied;
    }
    Logger.log('Clearing cache as requested');
    clearGamesCache(ctx.steamUserId);
  }

  Logger.log(
    `API request: limit=${limit}, cc=${countryCode || 'default'}, clearCache=${clearCache}`
  );
  const steamApi = new SteamApi(ctx.steamApiKey, countryCode);
  return ok(
    () => handleSteamGamesRequest(ctx.steamUserId, steamApi, ctx.ttl, limit),
    ctx.ttl.games,
    !clearCache
  );
}

async function steamGame(url: URL, ctx: RequestContext): Promise<Response> {
  const appIdParam = url.searchParams.get('appid');
  if (!appIdParam) {
    return fail(400, 'Missing required query parameter: appid', 'MISSING_PARAM');
  }

  const appId = parseInt(appIdParam, 10);
  if (isNaN(appId) || appId <= 0) {
    return fail(400, 'Invalid appid: must be a positive integer', 'INVALID_PARAM');
  }

  const countryCode = countryCodeOf(url);
  Logger.log(`API request: appid=${appId}, cc=${countryCode || 'default'}`);
  const steamApi = new SteamApi(ctx.steamApiKey, countryCode);

  try {
    return await ok(
      () => handleSingleGameRequest(ctx.steamUserId, appId, steamApi, ctx.ttl),
      ctx.ttl.games
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      return fail(404, `Game not found in user's library`, 'GAME_NOT_FOUND');
    }
    throw error;
  }
}

async function steamAchievements(url: URL, ctx: RequestContext): Promise<Response> {
  const steamApi = new SteamApi(ctx.steamApiKey, countryCodeOf(url));
  return ok(
    () => handleSteamAchievementsRequest(ctx.steamUserId, steamApi, ctx.ttl),
    ctx.ttl.achievements
  );
}

const ROUTES: Record<string, { run: (url: URL, ctx: RequestContext) => Promise<Response>; error: string }> = {
  'steam-user': { run: steamUser, error: 'Failed to fetch Steam user data' },
  'steam-games': { run: steamGames, error: 'Failed to fetch Steam games data' },
  'steam-game': { run: steamGame, error: 'Failed to fetch Steam game data' },
  'steam-achievements': { run: steamAchievements, error: 'Failed to fetch Steam achievements data' },
};

/**
 * 把路径归一化成路由名，命中返回路由名，未命中返回 null
 *
 * 同一个端点在各平台的挂载前缀不同：Vercel / Netlify 收 /api/steam-games，
 * Cloudflare Workers 与本地 Express 收 /steam-games，所以这里剥掉可选的
 * /api 前缀与结尾斜杠后统一查表。
 *
 * 只做前缀剥离，不做路径分段匹配：/api/steam-user/extra 归一化后是
 * "steam-user/extra"，不在 ROUTES 中，因此返回 null（而不是回退到
 * steam-user），多余的路径段仍然按未命中处理。
 *
 * @param pathname 请求 URL 的 pathname 部分（不含查询串与 hash）
 * @returns 已注册的路由名，或 null 表示 404
 */
export function routeNameOf(pathname: string): string | null {
  const normalized = pathname.replace(/\/+$/, '').replace(/^\/api(?=\/|$)/, '').replace(/^\//, '');
  return normalized in ROUTES ? normalized : null;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS });
  }

  if (request.method !== 'GET') {
    return fail(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  }

  const url = new URL(request.url);
  const routeName = routeNameOf(url.pathname);
  if (!routeName) {
    return fail(404, 'Not found', 'NOT_FOUND');
  }
  const route = ROUTES[routeName];

  const envCheck = validateEnvironment(env);
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    return fail(500, envCheck.error || 'Environment error', 'ENV_ERROR');
  }

  const ctx: RequestContext = {
    steamApiKey: env.STEAM_API_KEY!,
    steamUserId: env.STEAM_USER_ID!,
    ttl: getCacheTTL(env),
    adminToken: env.ADMIN_TOKEN,
    request,
  };

  try {
    return await route.run(url, ctx);
  } catch (error) {
    Logger.error('API error', error);
    return fail(500, route.error, 'STEAM_API_ERROR');
  }
}
