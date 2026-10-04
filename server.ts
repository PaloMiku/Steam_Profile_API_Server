import express from 'express';
import { fileURLToPath } from 'url';
import 'dotenv/config.js';
import { CORS_HEADERS } from './lib/app.js';
import { nodeStyle } from './lib/node-shim.js';
import { Logger } from './lib/utils.js';
import type { ErrorResponse } from './lib/types.js';
import type { Express } from 'express';

const app: Express = express();
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;

const api = nodeStyle();
// Express 5 的 path-to-regexp 8 要求通配符必须命名，裸 * 会导致启动即抛错
app.all('/api/*splat', api);

// Health check
app.get('/health', (req, res) => {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((req, res) => {
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    res.setHeader(name, value);
  }
  const errorResponse: ErrorResponse = {
    success: false,
    error: 'Not found',
    code: 'NOT_FOUND',
  };
  res.status(404).json(errorResponse);
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  Logger.error('Unhandled error', err);
  const errorResponse: ErrorResponse = {
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
  };
  res.status(500).json(errorResponse);
});

// Start server
if (fileURLToPath(import.meta.url) === process.argv[1]) {
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
    process.on('unhandledRejection', async (reason, _promise) => {
      Logger.error('未处理的 Promise 拒绝', reason);
      await gracefulShutdown('unhandledRejection');
    });

    return server;
  };

  // 启动服务器
  startServer(DEFAULT_PORT);
}

export default app;
