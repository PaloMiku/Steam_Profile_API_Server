import express from 'express';
import { Server as HTTPServer } from 'http';
import 'dotenv/config.js';
import { SteamApi } from './lib/steam-api.js';
import { Logger } from './lib/utils.js';
import {
  validateEnvironment,
  getCacheTTL,
  handleSteamUserRequest,
  handleSteamGamesRequest,
  handleSingleGameRequest,
  handleSteamAchievementsRequest,
  clearGamesCache,
} from './lib/handler.js';
import type { SuccessResponse, ErrorResponse } from './lib/types.js';
import type { Express } from 'express';

const app: Express = express();
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Content-Type', 'application/json; charset=utf-8');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Main API endpoint
app.get('/api/steam-user', async (req, res) => {
  if (req.method !== 'GET') {
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Method not allowed',
      code: 'METHOD_NOT_ALLOWED',
    };
    return res.status(405).json(errorResponse);
  }

  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: envCheck.error || 'Environment error',
      code: 'ENV_ERROR',
    };
    return res.status(500).json(errorResponse);
  }

  try {
    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

  const countryCode = (req.query.cc as string) || undefined;
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

    res.status(200).json(successResponse);
  } catch (error) {
    Logger.error('API error', error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Failed to fetch Steam user data',
      code: 'STEAM_API_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});

// Games API endpoint
app.get('/api/steam-games', async (req, res) => {
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: envCheck.error || 'Environment error',
      code: 'ENV_ERROR',
    };
    return res.status(500).json(errorResponse);
  }

  try {
    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

    const countryCode = (req.query.cc as string) || undefined;
    const limitParam = (req.query.limit as string);
    Logger.log(`Raw limit parameter: "${limitParam}" (type: ${typeof limitParam})`);
    
    let limit = parseInt(limitParam || '100', 10);
    Logger.log(`Parsed limit: ${limit}, isNaN: ${isNaN(limit)}`);
    
    // 验证 limit 参数
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      Logger.log(`Invalid limit value: ${limit}, resetting to 100`);
      limit = 100;
    }
    
    Logger.log(`API request: limit=${limit}, cc=${countryCode || 'default'}`);
    const steamApi = new SteamApi(steamApiKey, countryCode);
    const startTime = Date.now();

    const data = await handleSteamGamesRequest(steamUserId, steamApi, ttl, limit);

    const successResponse: SuccessResponse = {
      success: true,
      data: data as any,
      metadata: {
        cached: true,
        cachedAt: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + ttl.games).toISOString(),
        fetchDuration: `${Date.now() - startTime}ms`,
      },
    };

    res.status(200).json(successResponse);
  } catch (error) {
    Logger.error('API error', error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Failed to fetch Steam games data',
      code: 'STEAM_API_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});

// Single game API endpoint
app.get('/api/steam-game', async (req, res) => {
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: envCheck.error || 'Environment error',
      code: 'ENV_ERROR',
    };
    return res.status(500).json(errorResponse);
  }

  try {
    // 获取并验证 appid 参数
    const appIdParam = req.query.appid as string;
    if (!appIdParam) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Missing required query parameter: appid',
        code: 'MISSING_PARAM',
      };
      return res.status(400).json(errorResponse);
    }

    const appId = parseInt(appIdParam, 10);
    if (isNaN(appId) || appId <= 0) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: 'Invalid appid: must be a positive integer',
        code: 'INVALID_PARAM',
      };
      return res.status(400).json(errorResponse);
    }

    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

    const countryCode = (req.query.cc as string) || undefined;

    Logger.log(`API request: appid=${appId}, cc=${countryCode || 'default'}`);
    const steamApi = new SteamApi(steamApiKey, countryCode);
    const startTime = Date.now();

    const data = await handleSingleGameRequest(steamUserId, appId, steamApi, ttl);

    const successResponse: SuccessResponse = {
      success: true,
      data: data as any,
      metadata: {
        cached: false,
        cachedAt: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + ttl.games).toISOString(),
        fetchDuration: `${Date.now() - startTime}ms`,
      },
    };

    res.status(200).json(successResponse);
  } catch (error) {
    Logger.error('API error', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      const errorResponse: ErrorResponse = {
        success: false,
        error: `Game not found in user's library`,
        code: 'GAME_NOT_FOUND',
      };
      return res.status(404).json(errorResponse);
    }
    
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Failed to fetch Steam game data',
      code: 'STEAM_API_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});

// Achievements API endpoint
app.get('/api/steam-achievements', async (req, res) => {
  const envCheck = validateEnvironment();
  if (!envCheck.valid) {
    Logger.error('Environment validation failed', envCheck.error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: envCheck.error || 'Environment error',
      code: 'ENV_ERROR',
    };
    return res.status(500).json(errorResponse);
  }

  try {
    const steamApiKey = process.env.STEAM_API_KEY!;
    const steamUserId = process.env.STEAM_USER_ID!;
    const ttl = getCacheTTL();

  const countryCode = (req.query.cc as string) || undefined;
  const steamApi = new SteamApi(steamApiKey, countryCode);
    const startTime = Date.now();

    const data = await handleSteamAchievementsRequest(steamUserId, steamApi, ttl);

    const successResponse: SuccessResponse = {
      success: true,
      data: data as any,
      metadata: {
        cached: true,
        cachedAt: new Date().toISOString(),
        cacheExpiry: new Date(Date.now() + ttl.achievements).toISOString(),
        fetchDuration: `${Date.now() - startTime}ms`,
      },
    };

    res.status(200).json(successResponse);
  } catch (error) {
    Logger.error('API error', error);
    const errorResponse: ErrorResponse = {
      success: false,
      error: 'Failed to fetch Steam achievements data',
      code: 'STEAM_API_ERROR',
    };
    res.status(500).json(errorResponse);
  }
});

app.use((req, res) => {
  const errorResponse: ErrorResponse = {
    success: false,
    error: 'Not found',
    code: 'NOT_FOUND',
  };
  res.status(404).json(errorResponse);
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  Logger.error('Unhandled error', err);
  const errorResponse: ErrorResponse = {
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  };
  res.status(500).json(errorResponse);
});

// Start server
if (import.meta.url === `file://${process.argv[1]}`) {
  const startServer = (port: number, retried: boolean = false) => {
    const server = app.listen(port, () => {
      console.clear();
      console.log('\n');
      console.log('  ╔═══════════════════════════════════════════════╗');
      console.log('  ║                                               ║');
      console.log('  ║   🎮  Steam Profile API - Local Server  🎮    ║');
      console.log('  ║                                               ║');
      console.log('  ╚═══════════════════════════════════════════════╝');
      console.log('\n');
      
      const actualPort = (server.address() as any).port;
      console.log(`  ✓ Server running at: \x1b[36mhttp://localhost:${actualPort}\x1b[0m`);
      if (retried) {
        console.log(`  ⚠️  使用随机端口，因为默认端口 ${DEFAULT_PORT} 已被占用`);
      }
      
      console.log('\n  📌 API Endpoints:');
      console.log(`     • User Info:        \x1b[36mGET /api/steam-user\x1b[0m`);
      console.log(`     • Games Library:    \x1b[36mGET /api/steam-games\x1b[0m`);
      console.log(`     • Single Game:      \x1b[36mGET /api/steam-game?appid=xxx\x1b[0m`);
      console.log(`     • Achievements:     \x1b[36mGET /api/steam-achievements\x1b[0m`);
      console.log(`\n  • Health check:      \x1b[36mGET /health\x1b[0m`);
      console.log('\n');
    }).on('error', (err: any) => {
      if (err.code === 'EADDRINUSE' && !retried) {
        console.error(`\n❌ 端口 ${port} 已被占用，正在尝试使用随机端口...\n`);
        // 当端口被占用时，使用随机端口 (0 表示让系统选择可用端口)
        // retried 标志防止无限递归
        startServer(0, true);
      } else {
        console.error('❌ 启动服务器时发生错误:', err);
        process.exit(1);
      }
    });

    // 追踪活动连接
    const activeConnections = new Set<any>();

    server.on('connection', (socket: any) => {
      activeConnections.add(socket);
      socket.on('close', () => {
        activeConnections.delete(socket);
      });
    });

    // 关闭处理
    let isShuttingDown = false;

    const gracefulShutdown = async (signal: string) => {
      if (isShuttingDown) {
        Logger.warn('Shutdown already in progress, ignoring signal');
        return;
      }

      isShuttingDown = true;
      console.log(`\n📍 收到 ${signal} 信号，正在关闭服务器...\n`);

      // 如果 10 秒后还没关闭，强制退出
      const forceExitTimer = setTimeout(() => {
        console.error('✗ 强制关闭服务器（超时）');
        process.exit(1);
      }, 10000);

      try {
        // 销毁所有活动连接
        activeConnections.forEach((socket) => {
          socket.destroy();
        });
        activeConnections.clear();
        
        // 关闭服务器并等待所有连接关闭
        await new Promise<void>((resolve) => {
          server.close(() => {
            console.log('✓ 服务器已关闭');
            resolve();
          });
          
          // 如果没有连接需要等待，则立即解析
          if (activeConnections.size === 0) {
            server.close(() => {
              console.log('✓ 服务器已关闭');
              resolve();
            });
          }
        });
        
        // 清理缓存资源
        const { cache } = await import('./lib/cache.js');
        cache.destroy();
        
        clearTimeout(forceExitTimer);
        console.log('✓ 所有服务已正确关闭');
        process.exit(0);
      } catch (error) {
        clearTimeout(forceExitTimer);
        Logger.error('关闭服务器时出错', error);
        process.exit(1);
      }
    };

    // 监听终止信号
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // 捕获未处理的异常
    process.on('uncaughtException', async (error) => {
      Logger.error('未处理的异常', error);
      await gracefulShutdown('uncaughtException');
    });

    // 捕获未处理的 Promise 拒绝
    process.on('unhandledRejection', async (reason, promise) => {
      Logger.error('未处理的 Promise 拒绝', reason);
      await gracefulShutdown('unhandledRejection');
    });

    return server;
  };

  // 启动服务器
  startServer(DEFAULT_PORT);
}

export default app;
