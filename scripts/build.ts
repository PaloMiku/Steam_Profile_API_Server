/**
 * 智能构建脚本 - 根据部署平台生成相应的入口文件
 * scripts/build.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 检测部署平台
function detectPlatform(): { platform: string; detectedBy: string } {
  // 检查显式的 DEPLOY_TARGET 环境变量
  if (process.env.DEPLOY_TARGET) {
    const validTargets = ['vercel', 'netlify', 'cloudflare', 'local'];
    const target = process.env.DEPLOY_TARGET.toLowerCase();
    if (validTargets.includes(target)) {
      return { platform: target, detectedBy: 'DEPLOY_TARGET env variable' };
    }
  }

  // 检查平台特定的环境变量
  if (process.env.VERCEL) return { platform: 'vercel', detectedBy: 'VERCEL env variable' };
  if (process.env.NETLIFY) return { platform: 'netlify', detectedBy: 'NETLIFY env variable' };
  if (process.env.CF_PAGES || process.env.CLOUDFLARE_WORKER) {
    return { platform: 'cloudflare', detectedBy: 'Cloudflare env variable' };
  }

  // 默认本地
  return { platform: 'local', detectedBy: 'default' };
}

// 生成入口文件
function generateEntryPoints(platform: string): void {
  const emojiMap: Record<string, string> = {
    vercel: '⚡',
    netlify: '🌐',
    cloudflare: '☁️',
    local: '🖥️',
  };
  const emoji = emojiMap[platform] || '🔨';

  console.log(`\n${emoji} Building for platform: ${platform.toUpperCase()}\n`);

  switch (platform) {
    case 'vercel':
      generateVercelEntry();
      break;
    case 'netlify':
      generateNetlifyEntry();
      break;
    case 'cloudflare':
      generateCloudflareEntry();
      break;
    case 'local':
      generateLocalEntry();
      break;
    default:
      console.warn(`⚠️  Unknown platform: ${platform}, defaulting to local`);
      generateLocalEntry();
  }

  console.log(`✅ Build completed for ${platform}\n`);
}

function generateVercelEntry(): void {
  // Vercel 使用 api/ 目录下的文件作为 serverless functions
  // api/steam-user.ts 已经存在，无需生成
  console.log('✓ Vercel: Using ./api/steam-user.ts');
}

function generateNetlifyEntry(): void {
  // Netlify 使用 netlify/functions/ 目录下的文件
  // 这些文件是手动维护的 TypeScript 文件，使用 Request/Response API
  console.log('✓ Netlify: Using ./netlify/functions/*.ts');
}

/**
 * 将 api/ 目录中的所有 .ts 文件复制到 netlify/functions/
 * 已弃用 - Netlify 函数现在手动维护
 */
function copyApiFilesToNetlify(): void {
  // Removed - Netlify functions are now manually maintained
}

function generateCloudflareEntry(): void {
  // Cloudflare Workers 使用 src/index.ts
  // src/index.ts 已经存在，无需生成
  console.log('✓ Cloudflare: Using ./src/index.ts');
}

function generateLocalEntry(): void {
  // 本地使用 server.ts 作为入口
  // server.ts 已经存在，无需生成
  console.log('✓ Local: Using ./server.ts');
}

// 生成 TypeScript 编译配置
function updateTsConfig(platform: string): void {
  const tsConfigPath = path.join(projectRoot, 'tsconfig.json');
  const tsConfig = JSON.parse(fs.readFileSync(tsConfigPath, 'utf-8'));

  // 根据平台调整 include 和 exclude
  switch (platform) {
    case 'vercel':
      tsConfig.include = ['api/**/*.ts', 'lib/**/*.ts'];
      tsConfig.exclude = ['node_modules', 'dist', 'netlify', 'src', 'server.ts'];
      break;
    case 'netlify':
      tsConfig.include = ['netlify/**/*.ts', 'lib/**/*.ts'];
      tsConfig.exclude = ['node_modules', 'dist', 'api', 'src', 'server.ts'];
      break;
    case 'cloudflare':
      tsConfig.include = ['src/**/*.ts', 'lib/**/*.ts'];
      tsConfig.exclude = ['node_modules', 'dist', 'api', 'netlify', 'server.ts'];
      break;
    case 'local':
      tsConfig.include = ['server.ts', 'lib/**/*.ts'];
      tsConfig.exclude = ['node_modules', 'dist', 'api', 'netlify', 'src'];
      break;
  }

  fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
  console.log(`✓ Updated tsconfig.json for ${platform}`);
}

// 创建 .env.local 文件（如果在本地运行）
function createLocalEnvFile(platform: string): void {
  if (platform === 'local') {
    const envPath = path.join(projectRoot, '.env.local');
    if (!fs.existsSync(envPath)) {
      const examplePath = path.join(projectRoot, '.env.example');
      const exampleContent = fs.readFileSync(examplePath, 'utf-8');
      fs.writeFileSync(envPath, exampleContent);
      console.log('✓ Created .env.local from .env.example');
    }
  }
}

// 主函数
function main(): void {
  const detection = detectPlatform();
  const platform = detection.platform;

  try {
    console.log('\n' + '═'.repeat(50));
    console.log('🚀 Steam Profile API - Build System');
    console.log('═'.repeat(50) + '\n');

    console.log(`📍 Platform Detection:`);
    console.log(`   Platform: ${platform.toUpperCase()}`);
    console.log(`   Detected by: ${detection.detectedBy}`);
    console.log('');

    generateEntryPoints(platform);
    updateTsConfig(platform);
    createLocalEnvFile(platform);

    console.log(`📦 Build Configuration:`);
    console.log(`   Entry point configured for ${platform}`);
    console.log(`   TypeScript config updated`);
    console.log('\n' + '═'.repeat(50));
    console.log('💡 Available environment variables:');
    console.log('   DEPLOY_TARGET=vercel    - Build for Vercel');
    console.log('   DEPLOY_TARGET=netlify   - Build for Netlify');
    console.log('   DEPLOY_TARGET=cloudflare - Build for Cloudflare');
    console.log('   DEPLOY_TARGET=local     - Build for local (default)');
    console.log('═'.repeat(50) + '\n');
  } catch (error) {
    console.error('❌ Build error:', error);
    process.exit(1);
  }
}

main();
