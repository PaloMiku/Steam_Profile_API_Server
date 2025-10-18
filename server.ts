import express from 'express';
import 'dotenv/config.js';
import { SteamApi } from './lib/steam-api.js';
import { Logger } from './lib/utils.js';
import {
  validateEnvironment,
  getCacheTTL,
  handleSteamUserRequest,
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

    const steamApi = new SteamApi(steamApiKey);
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

// 404 handler
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
  app.listen(PORT, () => {
    console.clear();
    console.log('\n');
    console.log('  ╔═══════════════════════════════════════════════╗');
    console.log('  ║                                               ║');
    console.log('  ║   🎮  Steam Profile API - Local Server  🎮    ║');
    console.log('  ║                                               ║');
    console.log('  ╚═══════════════════════════════════════════════╝');
    console.log('\n');
    console.log(`  ✓ Server running at: \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`  ✓ API endpoint:      \x1b[36mhttp://localhost:${PORT}/api/steam-user\x1b[0m`);
    console.log(`  ✓ Health check:      \x1b[36mhttp://localhost:${PORT}/health\x1b[0m`);
    console.log('\n');
  });
}

export default app;
