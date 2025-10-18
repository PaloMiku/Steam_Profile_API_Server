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
| 本地 | `http://localhost:4000/api/steam-games` |
| 本地 | `http://localhost:4000/api/steam-achievements` |
| Vercel | `https://<your-project>.vercel.app/api/steam-user` |
| Vercel | `https://<your-project>.vercel.app/api/steam-games` |
| Vercel | `https://<your-project>.vercel.app/api/steam-achievements` |
| Netlify | `https://<your-site>.netlify.app/api/steam-user` |
| Netlify | `https://<your-site>.netlify.app/api/steam-games` |
| Netlify | `https://<your-site>.netlify.app/api/steam-achievements` |

### 端点说明

| 端点 | 用途 | 返回数据 | 缓存时长 |
|-----|------|--------|--------|
| `/api/steam-user` | 用户基本信息 | 用户资料、游戏统计、成就统计 | 10分钟 |
| `/api/steam-games` | 游戏库信息 | 所有游戏列表、最近游戏、成就统计 | 24小时 |
| `/api/steam-achievements` | 成就详情 | 按游戏分组的详细成就列表 | 1小时 |

**使用场景：**

- 需要用户基本信息（名称、头像、游戏总数）：调用 `/api/steam-user` 
- 需要游戏库和最近游戏详情：调用 `/api/steam-games`（包含价格、发布日期、成就统计）
- 需要成就详细列表：调用 `/api/steam-achievements`（包含每个成就的解锁状态）
- 优化性能：分别调用各端点，按需获取，各端点独立缓存

**端点职责分离（明确划分，避免冗余调用）**

为了保持查询快速响应，三个端点职责完全分离，各自只发起必要的 Steam API 请求：

| 端点 | 调用的 Steam API | 返回数据 | 注意事项 |
|-----|-----------------|--------|--------|
| `/api/steam-user` | `GetPlayerSummaries`<br/>`GetOwnedGames` | 用户资料、游戏数量、游玩时长统计 | **不包含**游戏列表、成就数据 |
| `/api/steam-games` | `GetOwnedGames`<br/>`GetRecentlyPlayedGames`<br/>`GetGameDetails`<br/>`GetPlayerAchievements` | 游戏库（前100个）、最近游戏、成就统计 | **不包含**用户资料、成就详细列表 |
| `/api/steam-achievements` | `GetRecentlyPlayedGames`<br/>`GetOwnedGames`<br/>`GetPlayerAchievements` | 按游戏分组的成就详细列表 | **不包含**用户资料、游戏库详情 |

**为什么这样设计？**

- ✅ 每个端点只做自己的事，避免不必要的网络请求
- ✅ 本地开发和生产环境行为完全一致（无环境相关的额外调用）
- ✅ 客户端可以按需调用，不用一次性加载所有数据
- ✅ 独立的缓存策略（用户信息10分钟、游戏24小时、成就1小时）

**预期延迟（仅作参考）**

- 首次请求（未命中缓存）：
  - `/api/steam-user`：1-2 秒（仅两个 API 调用）
  - `/api/steam-games`：2-4 秒（需要获取最近游戏的详情和成就）
  - `/api/steam-achievements`：3-5 秒（需要获取所有成就详情）
- 缓存命中：通常 < 10ms

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

### GET /api/steam-games

获取游戏库和最近游戏的信息。

**示例请求：**

```bash
curl -X GET "http://localhost:4000/api/steam-games"
```

**查询参数：**

无。API 直接返回游戏库数据。

---

### GET /api/steam-achievements

获取用户的成就数据（包含详细的成就列表）。

**示例请求：**

```bash
curl -X GET "http://localhost:4000/api/steam-achievements"
```

**查询参数：**

无。API 直接返回成就数据。

---

## 响应

### 成功响应 (200 OK)

**`/api/steam-user` 响应示例：**
```json
{
  "success": true,
  "data": {
    "user": {
      "steamid": "76561198123456789",
      "username": "YourUsername",
      "profileUrl": "https://steamcommunity.com/profiles/76561198123456789",
      "avatar": {
        "small": "https://avatars.steamstatic.com/...jpg",
        "medium": "https://avatars.steamstatic.com/...jpg",
        "large": "https://avatars.steamstatic.com/...jpg"
      },
      "status": "online",
      "statusMessage": "In-game",
      "currentGame": { "appid": 570, "name": "Dota 2" },
      "playtimeStats": { "totalForever": 1200, "totalTwoWeeks": 50 }
    }
  },
  "metadata": {
    "cached": true,
    "cachedAt": "2025-10-18T12:34:56.789Z",
    "cacheExpiry": "2025-10-18T12:39:56.789Z",
    "fetchDuration": "1234ms"
  }
}
```

**`/api/steam-games` 响应示例：**
```json
{
  "success": true,
  "data": {
    "games": {
      "totalCount": 150,
      "recentCount": 3,
      "recentGames": [{ "appid": 570, "name": "Dota 2", "achievements": { "total": 14, "unlocked": 10, "percentage": 71 } }],
      "allGames": [{ "appid": 570, "name": "Dota 2", "achievements": { "total": 14, "unlocked": 10, "percentage": 71 } }]
    }
  },
  "metadata": { "cached": false, "cachedAt": "2025-10-18T12:34:56.789Z", "cacheExpiry": "2025-10-18T13:34:56.789Z", "fetchDuration": "3456ms" }
}
```

**`/api/steam-achievements` 响应示例：**
```json
{
  "success": true,
  "data": {
    "achievements": {
      "totalCount": 250,
      "unlockedCount": 125,
      "unlockedPercentage": 50,
      "byGame": [
        {
          "appid": 570,
          "gameName": "Dota 2",
          "total": 100,
          "unlocked": 50,
          "percentage": 50,
          "items": [{ "name": "FIRST_BLOOD", "description": "Get a first blood", "unlocked": true, "unlockTime": 1634567890, "images": { "icon": "...", "iconGray": "..." } }]
        }
      ]
    }
  },
  "metadata": { "cached": true, "cachedAt": "2025-10-18T12:34:56.789Z", "cacheExpiry": "2025-10-18T13:34:56.789Z", "fetchDuration": "1200ms" }
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

### 端点返回的顶级结构

每个端点返回不同的数据结构，体现职责分离原则：

```typescript
// /api/steam-user 返回
{ "user": { ... } }

// /api/steam-games 返回
{ "games": { ... } }

// /api/steam-achievements 返回
{ "achievements": { ... } }
```

### 1. User 对象（/api/steam-user）

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
    },
    "playtimeStats": {                        // 用户游玩时长统计
      "totalForever": 1200,                   // 总游玩时长（小时）
      "totalTwoWeeks": 50                     // 最近两周总游玩时长（小时）
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
| `playtimeStats.totalForever` | number | 所有游戏总游玩时长（小时） |
| `playtimeStats.totalTwoWeeks` | number | 最近两周所有游戏总游玩时长（小时） |

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

### 2. Games 对象（/api/steam-games）

游戏库信息。

```typescript
{
  "games": {
    "totalCount": 150,                        // 拥有的游戏总数
    "recentCount": 3,                         // 最近两周内玩过的游戏总数（由 Steam API 决定）
    "recentGames": [                          // 最近玩过的游戏详细信息
      {
        "appid": 570,
        "name": "Dota 2",
        "playtimeForever": 3600,              // 总游玩时长（小时）
        "playtimeTwoWeeks": 120,              // 两周内游玩时长（小时）
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
        "shortDescription": "Every day, millions of players worldwide enter battle as one of over a hundred Dota heroes...",
        "achievements": {                     // 该游戏的成就统计
          "total": 14,                        // 该游戏的成就总数
          "unlocked": 10,                     // 该游戏已解锁成就数
          "percentage": 71                    // 完成百分比
        }
      }
    ],
    "allGames": [                             // 所有拥有游戏的简略信息（最多100个）
      {
        "appid": 570,
        "name": "Dota 2",
        "playtimeForever": 3600,              // 总游玩时长（小时）
        "playtimeTwoWeeks": 120,              // 两周内游玩时长（小时）
        "images": {
          "icon": "https://media.steampowered.com/steamcommunity/public/images/apps/570/..._icon.jpg",
          "headerImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg"
        },
        "achievements": {                     // 该游戏的成就统计（可选）
          "total": 14,
          "unlocked": 10,
          "percentage": 71
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
| `recentCount` | number | 最近两周内玩过的游戏总数（由 Steam API 返回） |
| `recentGames` | array | 最近玩过的游戏详细信息（数量 ≤ recentCount） |
| `allGames` | array | 所有拥有游戏的简略信息（最多100个） |

**重要说明：**

- `recentCount` 表示用户在最近两周内玩过的**所有游戏总数**（由 Steam 决定）
- `recentGames` 中的游戏数量等于 `recentCount`（API 返回所有最近游戏）
- `allGames` 中的游戏最多100个（前100个拥有的游戏）

**RecentGame 字段：**

| 字段 | 类型 | 说明 |
|-----|-----|------|
| `appid` | number | Steam 应用 ID |
| `name` | string | 游戏名称 |
| `playtimeForever` | number | 总游玩时长（小时） |
| `playtimeTwoWeeks` | number | 近两周游玩时长（小时） |
| `price.amount` | number | 价格（美分），0表示免费 |
| `price.currency` | string | 货币代码（如 USD、CNY） |
| `price.displayPrice` | string | 格式化的价格显示 |
| `images.*` | string | 游戏相关图片的 Steam CDN URL |
| `releaseDate` | string | 发布日期（YYYY-MM-DD） |
| `shortDescription` | string | 游戏简介 |
| `achievements.total` | number | 该游戏的成就总数（可选） |
| `achievements.unlocked` | number | 该游戏已解锁的成就数（可选） |
| `achievements.percentage` | number | 该游戏的成就完成百分比（可选） |

**重要说明：**

- `recentGames` 中返回的游戏与 `achievements.byGame` 中的游戏完全对应
- 每个最近游戏都包含了其成就统计信息（`total`、`unlocked`、`percentage`）
- `allGames` 中的前50个游戏也包含成就统计信息
- `achievements.byGame` 中提供了这些游戏所有成就的详细信息（成就列表）
- `achievements.totalCount` 和 `unlockedCount` 是所有这些游戏（最近游戏 + 游戏库前50个）的成就总和

**图片 URL 说明：**

| 图片类型 | 尺寸 | 用途 |
|--------|------|------|
| `icon` | 32x32 | 游戏列表小图标 |
| `logo` | 宽度 120px | 游戏 Logo |
| `headerImage` | 460x215 | 列表页面 Header 图 |
| `heroImage` | 1920x622 | 详情页面 Hero 图 |
| `libraryHeroImage` | 1920x622 | Steam 库 Hero 图 |

---

### 3. Achievements 对象（/api/steam-achievements）

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

### 4. Metadata 对象（所有端点）

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

## 配置选项

### 最近游戏配置

最近游戏的数量由 **Steam API** 决定，表示用户在最近两周内玩过的游戏总数。API 无法配置此数量，将返回 Steam 统计的实际数量。

**说明**:

- `games.recentCount`: 用户最近两周内玩过的游戏总数（来自 Steam API）
- `games.recentGames`: 实际返回的最近游戏列表

### 缓存配置

| 数据类型 | 默认 TTL | 环境变量 |
|--------|---------|---------|
| 用户信息 | 10 分钟 | `CACHE_TTL_USER_MINUTES` |
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

A: 所有有成就系统的 Steam 游戏。API 返回最近玩过的游戏的成就详情（最近两周内实际玩过的游戏）。

**Q: 为什么返回的最近游戏数量很少？**

A: 因为 Steam API 返回的是用户在**最近两周内实际玩过的游戏**。如果用户最近两周只玩了 3 个游戏，API 就只会返回这 3 个游戏。这个数量由 Steam 决定，无法配置。您可以通过 `games.recentCount` 字段查看实际的最近游戏总数。

**Q: 能改变最近游戏的返回数量吗？**

A: 不能。最近游戏数量完全由 Steam API 决定，无法通过配置改变。Steam 会返回用户最近两周内玩过的所有游戏。

**Q: 图片加载失败怎么办？**

A: 这是 Steam CDN 的临时问题。所有图片 URL 都是有效的公开 Steam CDN 链接。

---
