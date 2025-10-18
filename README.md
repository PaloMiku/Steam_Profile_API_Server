# Steam Profile API

一个简单的无服务器 API，用于展示你自己的 Steam 用户信息。可在 Vercel 等云平台快速部署，支持在静态博客等前端页面展示你的游戏列表、成就、游戏时长等信息，以及所有相关的图片资源链接。

## 特性

- 获取你的 Steam 用户基本信息（用户名、头像、在线状态等）
- 获取你拥有的所有游戏列表及统计信息
- 获取最近游戏和游戏时长数据
- 获取你的成就信息（已解锁/未解锁）
- 返回所有相关图片的 Steam CDN 直接链接
- 内存缓存机制，支持配置 TTL
- 支持 CORS 跨域调用（适合前端直接调用）
- 错误处理和详细日志
- 部署简单，只需配置两个必需环境变量

## 快速开始

### 前置要求

- Node.js 18+
- Steam Web API Key（获取地址：<https://steamcommunity.com/dev/apikey>
- 你的 Steam ID 64位号码（查询：<https://steamid.io>

### 最快部署（选择一个平台）

#### Vercel（推荐）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPaloMiku%2FSteam_Profile_API_Server&env=STEAM_API_KEY,STEAM_USER_ID,CACHE_TTL_USER_MINUTES,CACHE_TTL_GAMES_HOURS,CACHE_TTL_ACHIEVEMENTS_HOURS)

1. Fork 本仓库
2. 连接到 Vercel
3. 添加环境变量 STEAM_API_KEY 和 STEAM_USER_ID
4. 部署完成！

#### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/PaloMiku/Steam_Profile_API_Server)

1. Fork 本仓库
2. 连接到 Netlify
3. 添加环境变量 STEAM_API_KEY 和 STEAM_USER_ID
4. 配置构建命令: npm run build
5. 发布目录: dist

#### Cloudflare Workers

```bash
npm install -g wrangler
wrangler login
DEPLOY_TARGET=cloudflare npm run build
npm run start
```

#### 本地部署

```bash
# 1. 克隆仓库
git clone https://github.com/PaloMiku/Steam_Profile_API_Server
cd Steam_Profile_API_Server

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，添加 STEAM_API_KEY 和 STEAM_USER_ID

# 4. 开发运行
npm run dev

# 或者生产运行
npm run build
npm start
```

## API 文档

参见 [API.md](./API.md)

## 环境变量

参见 [.env.example](./.env.example)

## 常见问题

**如何获取 Steam API Key？**

访问 <https://steamcommunity.com/dev/apikey> 并按照说明操作。

**如何查询自己的 Steam ID？**

1. 访问 <https://steamid.io>
2. 输入你的 Steam 用户名或个人资料链接
3. 复制 64位 的 Steam ID

或者直接访问你的 Steam 个人资料页面，URL 中的数字就是你的 Steam ID。

**为什么 API 返回 500 错误？**

检查以下几点：
- `STEAM_API_KEY` 是否正确？
- `STEAM_USER_ID` 是否正确？
- 该 Steam 账号的资料是否公开？（需要在 Steam 隐私设置中设置为公开）

**缓存如何工作？**

API 使用内存缓存存储用户数据。缓存 TTL 可通过环境变量配置：
- 用户信息：10 分钟
- 游戏列表：24 小时
- 成就数据：1 小时

**我可以为其他 Steam 用户部署这个 API 吗？**

不，这个项目设计为单用户部署。每个用户需要 Fork 本项目并配置自己的 Steam ID 和 API Key。

## 许可

MIT

## 贡献

欢迎提交 Issue 和 Pull Request！
