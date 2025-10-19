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
  handleSteamAchievementsRequest,
} from './lib/handler.js';
import type { SuccessResponse, ErrorResponse } from './lib/types.js';
import type { Express } from 'express';

const app: Express = express();
const PORT = process.env.PORT || 4000;

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
  const steamApi = new SteamApi(steamApiKey, countryCode);
    const startTime = Date.now();

    const data = await handleSteamGamesRequest(steamUserId, steamApi, ttl);

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
  const server = app.listen(PORT, () => {
    console.clear();
    console.log('\n');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║                                               ║');
    console.log('  ║   🎮  Steam Profile API - Local Server  🎮    ║');
    console.log('  ║                                               ║');
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('\n');
    console.log(`  ✓ Server running at: \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log('\n  📌 API Endpoints:');
    console.log(`     • User Info:        \x1b[36mGET /api/steam-user\x1b[0m`);
    console.log(`     • Games Library:    \x1b[36mGET /api/steam-games\x1b[0m`);
    console.log(`     • Achievements:     \x1b[36mGET /api/steam-achievements\x1b[0m`);
    console.log(`\n  • Health check:      \x1b[36mGET /health\x1b[0m`);
    console.log('\n');
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

  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) {
      Logger.warn('Shutdown already in progress, ignoring signal');
      return;
    }

    isShuttingDown = true;
    console.log(`\n📍 收到 ${signal} 信号，正在关闭服务器...\n`);

    // 停止接收新连接
    server.close(() => {
      console.log('✓ 服务器已关闭');
      process.exit(0);
    });

    // 销毁所有活动连接
    activeConnections.forEach((socket) => {
      socket.destroy();
    });
    activeConnections.clear();

    // 如果 10 秒后还没关闭，强制退出
    const forceExitTimer = setTimeout(() => {
      console.error('✗ 强制关闭服务器（超时）');
      process.exit(1);
    }, 10000);

    // 如果正常关闭，清除强制退出定时器
    server.once('close', () => {
      clearTimeout(forceExitTimer);
    });
  };

  // 监听终止信号
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 捕获未处理的异常
  process.on('uncaughtException', (error) => {
    Logger.error('未处理的异常', error);
    process.exit(1);
  });

  // 捕获未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason, promise) => {
    Logger.error('未处理的 Promise 拒绝', reason);
  });
}

export default app;
