# 📖 API 参考文档

## 概述

Steam Profile API 是一个 RESTful API，用于获取配置用户的 Steam 个人资料信息，包括拥有的游戏、最近游玩游戏、成就进度等。

### 基本信息

- **HTTP 方法**: `GET`
- **Content-Type**: `application/json; charset=utf-8`
- **CORS**: 已启用（允许所有来源）
- **缓存**: 默认启用，可通过环境变量配置

### 端点

| 环境 | 端点 |
|-----|------|
| 本地 | `http://localhost:4000/api/steam-user` |
| Vercel | `https://<your-project>.vercel.app/api/steam-user` |
| Netlify | `https://<your-site>.netlify.app/api/steam-user` |
| Cloudflare | `https://<your-worker>.workers.dev` |

---

## 请求

### GET /api/steam-user

获取配置用户的完整 Steam 信息。

**示例请求：**

```bash
curl -X GET "http://localhost:4000/api/steam-user"
```

**请求头：**

```
GET /api/steam-user HTTP/1.1
Host: localhost:4000
Accept: application/json
```

**查询参数：**

无。API 直接返回环境变量中配置的 Steam 用户信息。

---

## 响应

### 成功响应 (200 OK)

```json
{
  "success": true,
  "data": {
    "user": { ... },
    "games": { ... },
    "achievements": { ... }
  },
  "metadata": {
    "cached": true,
    "cachedAt": "2025-10-18T12:34:56.789Z",
    "cacheExpiry": "2025-10-18T12:39:56.789Z",
    "fetchDuration": "1234ms"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

---

## 响应数据结构详解

### 1. User 对象

用户基本信息和状态。

```typescript
{
  "user": {
    "steamid": "76561198123456789",           // Steam 64位ID
    "username": "YourUsername",               // 用户名
    "profileUrl": "https://steamcommunity.com/profiles/...",
    "avatar": {
      "small": "https://avatars.steamstatic.com/..._32bf.jpg",    // 32x32
      "medium": "https://avatars.steamstatic.com/..._64bf.jpg",   // 64x64
      "large": "https://avatars.steamstatic.com/..._full.jpg"     // 184x184
    },
    "status": "online",                       // online, offline, away, snooze, busy, trading, playing
    "statusMessage": "In-game",
    "currentGame": {                          // 可选：当前在玩的游戏
      "appid": 570,
      "name": "Dota 2"
    }
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `steamid` | string | Steam 64位 ID，唯一标识符 |
| `username` | string | 用户当前的昵称 |
| `profileUrl` | string | Steam 社区个人资料页面 URL |
| `avatar.small` | string | Steam CDN 上的小头像（32x32） |
| `avatar.medium` | string | Steam CDN 上的中头像（64x64） |
| `avatar.large` | string | Steam CDN 上的大头像（184x184） |
| `status` | enum | 当前在线状态 |
| `statusMessage` | string | 状态文本描述 |
| `currentGame` | object? | 正在玩的游戏（如果在游戏中） |

**状态值映射：**

| 值 | 含义 |
|---|------|
| `offline` | 离线 |
| `online` | 在线 |
| `away` | 离开 |
| `snooze` | 打盹 |
| `busy` | 忙碌 |
| `trading` | 交易中 |
| `playing` | 游戏中 |

---

### 2. Games 对象

游戏库信息。

```typescript
{
  "games": {
    "totalCount": 150,                        // 拥有的游戏总数
    "recentGames": [                          // 最近玩过的5个游戏详细信息
      {
        "appid": 570,
        "name": "Dota 2",
        "playtimeForever": 3600,              // 总游玩时长（分钟）
        "playtimeTwoWeeks": 120,              // 两周内游玩时长（分钟）
        "price": {
          "amount": 0,                        // 价格（美分）
          "currency": "USD",
          "displayPrice": "Free to Play"
        },
        "images": {
          "icon": "https://media.steampowered.com/steamcommunity/public/images/apps/570/..._icon.jpg",
          "logo": "https://media.steampowered.com/steamcommunity/public/images/apps/570/..._logo.png",
          "headerImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg",
          "heroImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/hero.jpg",
          "libraryHeroImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_hero.jpg"
        },
        "releaseDate": "2011-04-09",
        "shortDescription": "Every day, millions of players worldwide enter battle as one of over a hundred Dota heroes..."
      }
    ],
    "allGames": [                             // 所有拥有游戏的简略信息
      {
        "appid": 570,
        "name": "Dota 2",
        "playtimeForever": 3600,
        "images": {
          "icon": "https://media.steampowered.com/steamcommunity/public/images/apps/570/..._icon.jpg",
          "headerImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg"
        }
      }
    ]
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `totalCount` | number | 拥有的游戏总数 |
| `recentGames` | array | 最近玩过的游戏（最多5个）详细信息 |
| `allGames` | array | 所有拥有游戏的简略信息 |

**RecentGame 字段：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `appid` | number | Steam 应用 ID |
| `name` | string | 游戏名称 |
| `playtimeForever` | number | 总游玩时长（分钟） |
| `playtimeTwoWeeks` | number | 近两周游玩时长（分钟） |
| `price.amount` | number | 价格（美分），0表示免费 |
| `price.currency` | string | 货币代码（如 USD、CNY） |
| `price.displayPrice` | string | 格式化的价格显示 |
| `images.*` | string | 游戏相关图片的 Steam CDN URL |
| `releaseDate` | string | 发布日期（YYYY-MM-DD） |
| `shortDescription` | string | 游戏简介 |

**图片 URL 说明：**

| 图片类型 | 尺寸 | 用途 |
|--------|------|------|
| `icon` | 32x32 | 游戏列表小图标 |
| `logo` | 宽度 120px | 游戏 Logo |
| `headerImage` | 460x215 | 列表页面 Header 图 |
| `heroImage` | 1920x622 | 详情页面 Hero 图 |
| `libraryHeroImage` | 1920x622 | Steam 库 Hero 图 |

---

### 3. Achievements 对象

成就信息。

```typescript
{
  "achievements": {
    "totalCount": 250,                        // 所有成就总数
    "unlockedCount": 125,                     // 已解锁成就数
    "unlockedPercentage": 50,                 // 解锁百分比
    "byGame": [                               // 按游戏分组的成就
      {
        "appid": 570,
        "gameName": "Dota 2",
        "total": 100,
        "unlocked": 50,
        "percentage": 50,
        "items": [
          {
            "name": "FIRST_BLOOD",
            "description": "Get a first blood",
            "unlocked": true,
            "unlockTime": 1634567890,         // Unix 时间戳
            "images": {
              "icon": "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/570/achievements/..._icon.jpg",
              "iconGray": "https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/570/achievements/..._scr.jpg"
            }
          }
        ]
      }
    ]
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `totalCount` | number | 所有游戏的成就总数 |
| `unlockedCount` | number | 已解锁的成就数 |
| `unlockedPercentage` | number | 解锁百分比（0-100） |
| `byGame` | array | 按游戏分组的成就数据 |

**GameAchievements 字段：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `appid` | number | 游戏的 Steam App ID |
| `gameName` | string | 游戏名称 |
| `total` | number | 此游戏的成就总数 |
| `unlocked` | number | 此游戏已解锁的成就数 |
| `percentage` | number | 此游戏的解锁百分比 |
| `items` | array | 成就详细信息 |

**Achievement 字段：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `name` | string | 成就代号 |
| `description` | string | 成就描述 |
| `unlocked` | boolean | 是否已解锁 |
| `unlockTime` | number | 解锁时间戳（已解锁时） |
| `images.icon` | string | 成就已解锁时的图标 |
| `images.iconGray` | string | 成就未解锁时的灰色图标 |

---

### 4. Metadata 对象

响应元数据。

```typescript
{
  "metadata": {
    "cached": true,                           // 是否从缓存返回
    "cachedAt": "2025-10-18T12:34:56.789Z",  // 缓存时间
    "cacheExpiry": "2025-10-18T12:39:56.789Z",// 缓存过期时间
    "fetchDuration": "1234ms"                 // 数据获取耗时（如果非缓存）
  }
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `cached` | boolean | 此响应是否来自缓存 |
| `cachedAt` | string | ISO 8601 格式的缓存时间 |
| `cacheExpiry` | string | 缓存过期时间 |
| `fetchDuration` | string | 数据获取耗时 |

---

## 错误响应

### 常见错误

#### 1. 环境变量未配置

```json
{
  "success": false,
  "error": "STEAM_API_KEY environment variable is not set",
  "code": "ENV_ERROR"
}
```

**状态码**: 500

**原因**: `STEAM_API_KEY` 环境变量未设置

**解决方案**: 
1. 设置 `STEAM_API_KEY` 环境变量
2. 查看 `.env.example` 获取配置模板

#### 2. Steam 用户 ID 格式错误

```json
{
  "success": false,
  "error": "STEAM_USER_ID must be a 17-digit number",
  "code": "ENV_ERROR"
}
```

**状态码**: 500

**原因**: `STEAM_USER_ID` 不是 17 位数字

**解决方案**:
1. 访问 https://steamid.io
2. 输入 Steam 用户名查询正确的 64 位 ID
3. 确保 ID 是 17 位纯数字

#### 3. 用户资料是私密的

```json
{
  "success": false,
  "error": "Failed to fetch Steam user data",
  "code": "STEAM_API_ERROR"
}
```

**状态码**: 500

**原因**: 
- Steam 个人资料设为私密
- Steam API 无权访问该用户的数据

**解决方案**:
1. 打开 https://steamcommunity.com/settings/privacy
2. 将 "游戏内容" 和 "成就" 设为 "公开"
3. 稍后重试 API

#### 4. 方法不允许

```json
{
  "success": false,
  "error": "Method not allowed",
  "code": "METHOD_NOT_ALLOWED"
}
```

**状态码**: 405

**原因**: 使用了 POST、PUT 等非 GET 方法

**解决方案**: 仅使用 GET 请求

#### 5. 路径不存在

```json
{
  "success": false,
  "error": "Not found",
  "code": "NOT_FOUND"
}
```

**状态码**: 404

**原因**: 请求的路径不存在

**解决方案**: 检查 URL 是否正确，应为 `/api/steam-user`

---

## 缓存策略

API 使用分层缓存策略：

| 数据类型 | 默认 TTL | 环境变量 |
|--------|---------|---------|
| 用户信息 | 5 分钟 | `CACHE_TTL_USER_MINUTES` |
| 游戏信息 | 24 小时 | `CACHE_TTL_GAMES_HOURS` |
| 成就信息 | 1 小时 | `CACHE_TTL_ACHIEVEMENTS_HOURS` |

### 缓存键

缓存键格式: `steam-user-{STEAM_USER_ID}`

### 调整缓存策略

在 `.env` 或部署平台的环境变量中配置：

```bash
# 用户信息缓存时长（分钟）
CACHE_TTL_USER_MINUTES=10

# 游戏信息缓存时长（小时）
CACHE_TTL_GAMES_HOURS=48

# 成就信息缓存时长（小时）
CACHE_TTL_ACHIEVEMENTS_HOURS=2
```

---

## 性能指标

### 响应时间

| 场景 | 平均时间 |
|-----|--------|
| 缓存命中 | < 10ms |
| 首次请求 | 2-5秒 |
| Steam API 超时 | > 30秒 |

### 并发限制

- 无硬并发限制
- Steam API 限制: ~1600 请求/秒

### 带宽使用

- 平均响应大小: 50-200 KB（取决于游戏数量和成就数）

---

## 常见问题

**Q: API 能查询其他用户吗？**

A: 不能。本 API 仅返回在部署时配置的单个 Steam 用户的信息。

**Q: 如何强制刷新缓存？**

A: 目前不支持。请等待缓存过期或重启服务器。

**Q: 支持哪些成就？**

A: 所有有成就系统的 Steam 游戏。API 默认返回最近玩过的前 5 个游戏的成就。

**Q: 图片加载失败怎么办？**

A: 这是 Steam CDN 的临时问题。所有图片 URL 都是有效的公开 Steam CDN 链接。

---
