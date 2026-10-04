# 📖 API 参考文档

## 概述

Steam Profile API 是一个 RESTful API，用于获取配置用户的 Steam 个人资料信息，包括拥有的游戏、最近游玩游戏、成就进度等。

### 基本信息

- **HTTP 方法**: `GET`（`OPTIONS` 用于 CORS 预检，返回 200 且无响应体）
- **Content-Type**: `application/json; charset=utf-8`
- **CORS**: 已启用（允许所有来源）
- **缓存**: 两层。源站有一层进程内缓存，响应同时带 `Cache-Control: public, s-maxage=..., stale-while-revalidate=...` 交给 CDN 边缘缓存。两层用同一组环境变量控制 TTL，各端点独立

### 端点说明

| 端点 | 用途 | 返回数据 | 边缘缓存时长 |
|-----|------|--------|--------|
| `/api/steam-user` | 用户基本信息 | 用户资料、游戏数量、总游玩时长 | 10分钟 |
| `/api/steam-games` | 游戏库信息 | 所有游戏列表（支持自定义数量）、最近游戏、成就统计 | 24小时 |
| `/api/steam-game` | 单个游戏详情 | 指定游戏的完整信息、游玩时间、成就统计 | 24小时 |
| `/api/steam-achievements` | 成就详情 | 按游戏分组的详细成就列表 | 1小时 |

> 本地 Express 服务器额外提供 `GET /health`，返回 `{ "status": "ok", "timestamp": "..." }`，不请求 Steam。其余三个平台没有这个端点。

**使用场景：**

- 需要用户基本信息（名称、头像、游戏总数）：调用 `/api/steam-user` 
- 需要游戏库和最近游戏详情：调用 `/api/steam-games`（包含价格、发布日期、成就统计）
- 需要查询特定游戏的详细信息和个人游玩时间：调用 `/api/steam-game?appid=xxx`
- 需要成就详细列表：调用 `/api/steam-achievements`（包含每个成就的解锁状态）
- 优化性能：分别调用各端点，按需获取，各端点独立缓存

**端点职责分离（明确划分，避免冗余调用）**

为了保持查询快速响应，各端点职责完全分离，各自只发起必要的 Steam API 请求：

| 端点 | 调用的 Steam API | 返回数据 | 注意事项 |
|-----|-----------------|--------|--------|
| `/api/steam-user` | `GetPlayerSummaries`<br/>`GetOwnedGames` | 用户资料、游戏数量、游玩时长统计 | **不包含**游戏列表、成就数据 |
| `/api/steam-games` | `GetOwnedGames`<br/>`GetRecentlyPlayedGames`<br/>`GetGameDetails`<br/>`GetPlayerAchievements` | 游戏库（前 N 个，默认 50，可通过 limit 参数自定义，范围 1-100）、最近游戏、成就统计。游戏按总时长降序排序 | **不包含**用户资料、成就详细列表。游戏库只全量拉取一次：游戏总数和 top-N 都在本地算，不会重复请求 |
| `/api/steam-game` | `GetOwnedGames`<br/>`GetGameDetails`<br/>`GetPlayerAchievements` | 指定游戏的完整信息：游玩时间、价格、图片、简介、成就统计 | 需要 `appid` 参数，仅返回用户拥有的游戏。归属校验需要一次 `GetOwnedGames`，之后只针对这个 appid 拉商店详情和成就 |
| `/api/steam-achievements` | `GetRecentlyPlayedGames`<br/>`GetOwnedGames`<br/>`GetPlayerAchievements` | 按游戏分组的成就详细列表 | **不包含**用户资料、游戏库详情。覆盖范围固定为最近游玩的 10 个游戏 + 游戏库中游玩时长最靠前的 50 个，不随 `limit` 变化 |

**为什么这样设计？**

- ✅ 每个端点只做自己的事，避免不必要的网络请求
- ✅ 本地开发和生产环境行为完全一致（无环境相关的额外调用）
- ✅ 客户端可以按需调用，不用一次性加载所有数据
- ✅ 独立的边缘缓存 TTL（用户信息10分钟、游戏24小时、成就1小时）

**预期延迟（仅作参考）**

- 首次请求（未命中边缘缓存）：
  - `/api/steam-user`：1-2 秒（仅两个 API 调用）
  - `/api/steam-games`：见下方「游戏库耗时的实测数据」，随 `limit` 和并发上限浮动
  - `/api/steam-achievements`：约 2.6 秒（实测）
- 缓存命中：CDN 边缘命中通常 < 100ms；源站进程内缓存命中 < 10ms
- 所有 Steam 请求都带超时（Web API 8 秒、商店接口 5 秒），单个请求卡住不会拖垮整个响应
- 成就数据是并发拉取的（并发上限 16，可用 `STEAM_CONCURRENCY` 覆盖），冷启动耗时会明显低于逐个串行请求

**游戏库耗时的实测数据**

在真实 Steam 账号（约 140 个游戏）上实测冷缓存（两层缓存都未命中）耗时：

| 并发上限 | `limit` | 耗时 |
|---------|--------|------|
| 8 | 100 | 14.7 秒 |
| 16 | 100 | 7.4 ~ 9.1 秒 |
| 16 | 50（默认） | 8.1 秒 |

- 其中单次全量 `GetOwnedGames`（`include_appinfo=true`）固定占约 5 秒，100 个游戏的成就只占约 4 秒。也就是说 `/api/steam-games` 的耗时下限由这一次全量拉取决定，调小 `limit` 收益有限
- 并发 16 是实测未出现 429 限流、未超时的上限。Vercel Hobby 的函数上限是 10 秒，并发 8 + `limit=100` 会直接超时，端点在该平台上不可用
- `limit` 默认取 50 而不是上限 100，正是为了给这个 10 秒上限留余量。`?limit=100` 仍然可用，耗时在 7.4 ~ 9.1 秒之间浮动，接近上限
- 库更大或网络更差时以上数字会同步放大，上表只作为量级参考

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
# 指定返回游戏数量（1-100，默认 50）
curl -X GET "http://localhost:4000/api/steam-games?limit=30"
# 拉满 100 个（耗时明显高于默认值，接近 Vercel Hobby 的 10 秒函数上限）
curl -X GET "http://localhost:4000/api/steam-games?limit=100"
# 指定地区获取价格
curl -X GET "http://localhost:4000/api/steam-games?limit=20&cc=us"
# 清除游戏库缓存（未配置 ADMIN_TOKEN 时）
curl -X GET "http://localhost:4000/api/steam-games?clear_cache=true"
# 清除游戏库缓存（配置了 ADMIN_TOKEN 时，推荐用请求头传令牌）
curl -X GET "http://localhost:4000/api/steam-games?clear_cache=true" -H "Authorization: Bearer your_token"
# 也可以退回用查询参数传令牌
curl -X GET "http://localhost:4000/api/steam-games?clear_cache=true&admin_token=your_token"
```

**查询参数：**

| 参数 | 类型 | 默认值 | 说明 |
|-----|-----|--------|------|
| `limit` | number | 50 | 返回游戏列表中的最大数量。支持范围：1-100，超出范围或非法值（非整数、缺省）一律回退为 50。返回的游戏按总游玩时长降序排序 |
| `cc` | string | cn | 国家/地区代码，影响游戏价格和货币显示（如 `us`, `jp`, `de` 等） |
| `clear_cache` | boolean | false | 置为 `true`（或 `1`）时先清除该用户的游戏库缓存再返回数据 |
| `admin_token` | string | 无 | `clear_cache` 的鉴权令牌，**仅在服务端配置了 `ADMIN_TOKEN` 时需要**，且必须与配置值一致。等价写法是 `Authorization: Bearer <token>` 请求头 |

> 默认值取 50 而不是上限 100，是因为 100 个游戏的冷请求实测在 7.4 ~ 9.1 秒，贴着 Vercel Hobby 的 10 秒函数上限，而 `Cache-Control` 让这条慢路径每天只走一次，一次超时就会整天取不到缓存。详见「游戏库耗时的实测数据」。

**`clear_cache` 的鉴权行为：**

- 服务端**未配置** `ADMIN_TOKEN`：任何人都可以带 `clear_cache=true` 触发清缓存（向后兼容既有部署）
- 服务端**配置了** `ADMIN_TOKEN`：请求必须带上正确的令牌，否则返回 401 `UNAUTHORIZED`，且不会清缓存
- 令牌优先从 `Authorization: Bearer <token>` 请求头读取，缺失时才回退到 `?admin_token=` 查询参数。**请求头优先**：两个都带时以请求头为准，请求头带了错误值即使查询参数正确也会被拒绝
- 只有带了 `clear_cache=true` 的请求才会走鉴权，普通请求不需要令牌

**`clear_cache` 与响应缓存：**

实际执行了清缓存的这次响应会带 `Cache-Control: no-store`，不会被 CDN 边缘缓存。未带 `clear_cache` 的正常请求按该端点的 TTL 返回 `Cache-Control: public, s-maxage=...`。

> 公网部署务必配置 `ADMIN_TOKEN`，否则这个参数等价于一个无鉴权的缓存失效开关，外部可反复把请求打到源站和 Steam。

---

### GET /api/steam-game

获取指定 Steam 游戏的详细信息、个人游玩时间和成就统计。

**示例请求：**

```bash
# 获取游戏 ID 为 570 (Dota 2) 的详细信息
curl -X GET "http://localhost:4000/api/steam-game?appid=570"
# 指定地区获取价格
curl -X GET "http://localhost:4000/api/steam-game?appid=570&cc=us"
```

**请求头：**

```
GET /api/steam-game?appid=570 HTTP/1.1
Host: localhost:4000
Accept: application/json
```

**查询参数：**

| 参数 | 类型 | 必需 | 说明 |
|-----|-----|------|------|
| `appid` | number | 是 | Steam 应用 ID，必须是用户拥有的游戏 |
| `cc` | string | 否 | 国家/地区代码，影响游戏价格和货币显示（如 `us`, `jp`, `de` 等），默认为 `cn` |

**响应成功条件：**
- 用户拥有该游戏
- appid 是有效的正整数

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

**`/api/steam-game` 响应示例：**
```json
{
  "success": true,
  "data": {
    "game": {
      "appid": 570,
      "name": "Dota 2",
      "playtimeForever": 3600,
      "playtimeTwoWeeks": 120,
      "price": {
        "amount": 0,
        "currency": "CNY",
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
      "achievements": {
        "total": 14,
        "unlocked": 10,
        "percentage": 71
      }
    }
  },
  "metadata": {
    "cached": false,
    "cachedAt": "2025-10-18T12:34:56.789Z",
    "cacheExpiry": "2025-10-18T13:34:56.789Z",
    "fetchDuration": "2345ms"
  }
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

// /api/steam-game 返回
{ "game": { ... } }

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
    "allGames": [                             // 所有拥有游戏的简略信息（默认 50 个，最多 100 个）
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
| `allGames` | array | 所有拥有游戏的简略信息（数量由 `limit` 决定，默认 50，最多 100） |

**重要说明：**

- `recentCount` 表示用户在最近两周内玩过的**所有游戏总数**（由 Steam 决定）
- `recentGames` 中的游戏数量等于 `recentCount`（API 返回所有最近游戏）
- `allGames` 中的游戏最多为 limit 个（默认 50，最多 100），**按总游玩时长降序排序**
- `totalCount` 是全量游戏库的游戏总数（服务端全量拉取后本地统计），不受 `limit` 影响；`allGames` 只是其中游玩时长最靠前的 limit 个
- 没有成就系统的游戏，其 `achievements` 字段会**缺失**而不是返回全 0。实测约 140 个游戏的库里，100 个返回项中有 10 个属于这种情况。服务端会为每个这样的游戏记一条 WARN 日志，这是正常行为，不影响该端点返回 200

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

- `recentGames` 中返回的游戏与 `achievements.byGame` 中的游戏一一对应（最近游玩固定取 Steam 返回的最近 10 个）
- 每个最近游戏都包含了其成就统计信息（`total`、`unlocked`、`percentage`），但没有成就系统的游戏会缺这个字段
- `allGames` 中的前 limit 个游戏也包含成就统计信息，同样是没有成就系统的游戏会缺这个字段
- `achievements.byGame` 中提供了这些游戏所有成就的详细信息（成就列表），只包含实际拉到数据的游戏
- `achievements.totalCount` 和 `unlockedCount` 是所有这些游戏（最近 10 个 + 游戏库前 50 个）的成就总和。注意成就端点固定覆盖游戏库前 50 个，所以 `limit` 调到 100 时 `/api/steam-games` 覆盖的成就游戏会比 `/api/steam-achievements` 更多

**图片 URL 说明：**

| 图片类型 | 尺寸 | 用途 |
|--------|------|------|
| `icon` | 32x32 | 游戏列表小图标 |
| `logo` | 宽度 120px | 游戏 Logo |
| `headerImage` | 460x215 | 列表页面 Header 图 |
| `heroImage` | 1920x622 | 详情页面 Hero 图 |
| `libraryHeroImage` | 1920x622 | Steam 库 Hero 图 |

---

### 3. SingleGameInfo 对象（/api/steam-game）

单个游戏的详细信息。

```typescript
{
  "game": {
    "appid": 570,                             // Steam 应用 ID
    "name": "Dota 2",                         // 游戏名称
    "playtimeForever": 3600,                  // 总游玩时长（小时）
    "playtimeTwoWeeks": 120,                  // 两周内游玩时长（小时）
    "price": {
      "amount": 0,                            // 价格（美分）
      "currency": "CNY",                      // 货币代码
      "displayPrice": "Free to Play"          // 格式化的价格显示
    },
    "images": {
      "icon": "https://media.steampowered.com/steamcommunity/public/images/apps/570/..._icon.jpg",
      "logo": "https://media.steampowered.com/steamcommunity/public/images/apps/570/..._logo.png",
      "headerImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/header.jpg",
      "heroImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/hero.jpg",
      "libraryHeroImage": "https://cdn.cloudflare.steamstatic.com/steam/apps/570/library_hero.jpg"
    },
    "releaseDate": "2011-04-09",              // 发布日期
    "shortDescription": "Every day, millions of players...",  // 游戏简介
    "achievements": {                         // 该游戏的成就统计（可选）
      "total": 14,                            // 成就总数
      "unlocked": 10,                         // 已解锁成就数
      "percentage": 71                        // 完成百分比
    }
  }
}
```

**字段说明：**

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

> 该游戏没有成就系统时，`achievements` 字段会整个缺失（不是全 0），行为与 `/api/steam-games` 一致。

---

### 4. Achievements 对象（/api/steam-achievements）

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
| `byGame` | array | 按游戏分组的成就数据。只包含实际拉到成就数据的游戏 |

> 没有成就系统的游戏不会出现在 `byGame` 里，也不计入 `totalCount` 和 `unlockedCount`。这类游戏会为服务端记一条 WARN 日志，是正常行为，端点仍返回 200。

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

### 5. Metadata 对象（所有端点）

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
| `cached` | boolean | 源站进程内缓存是否命中。**不代表 CDN 边缘是否命中**——边缘命中时请求根本不会到达源站，这个值无从体现 |
| `cachedAt` | string | ISO 8601 格式。缓存命中时是数据写入缓存的时间，未命中时是本次响应生成时间 |
| `cacheExpiry` | string | ISO 8601 格式的缓存过期时间，等于 `cachedAt` 加上该端点的 TTL |
| `fetchDuration` | string | 本次处理耗时，形如 `1234ms`。源站缓存命中时通常是个很小的值 |

> 四个端点的信封结构完全一致：`{ success: true, data, metadata }`。`data` 里的顶级键各端点不同（见下文），`metadata` 在所有端点上都存在。

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

#### 6. 缺少必需查询参数 (仅限 /api/steam-game)

```json
{
  "success": false,
  "error": "Missing required query parameter: appid",
  "code": "MISSING_PARAM"
}
```

**状态码**: 400

**原因**: `/api/steam-game` 端点需要 `appid` 查询参数

**解决方案**: 提供有效的 `appid` 参数，例如 `/api/steam-game?appid=570`

#### 7. 无效的应用 ID (仅限 /api/steam-game)

```json
{
  "success": false,
  "error": "Invalid appid: must be a positive integer",
  "code": "INVALID_PARAM"
}
```

**状态码**: 400

**原因**: `appid` 参数不是有效的正整数

**解决方案**: 确保 `appid` 是一个正整数，例如 `?appid=570`

#### 8. 游戏不在用户库中 (仅限 /api/steam-game)

```json
{
  "success": false,
  "error": "Game not found in user's library",
  "code": "GAME_NOT_FOUND"
}
```

**状态码**: 404

**原因**: 

- 指定的游戏不在配置用户的游戏库中
- 游戏 ID 不正确

**解决方案**:

1. 确保 `appid` 值正确
2. 确保该游戏已购买或已添加到用户的库中
3. 可以先调用 `/api/steam-games` 查看用户拥有的所有游戏

#### 9. clear_cache 鉴权失败 (仅限 /api/steam-games)

```json
{
  "success": false,
  "error": "Invalid or missing admin_token",
  "code": "UNAUTHORIZED"
}
```

**状态码**: 401

**原因**: 服务端配置了 `ADMIN_TOKEN`，但请求没带令牌，或带的值与配置不一致。令牌从 `Authorization: Bearer <token>` 请求头读取，缺失时才回退到 `?admin_token=` 查询参数；两者都带时以请求头为准。

**解决方案**: 补上正确的令牌，例如 `curl "http://localhost:4000/api/steam-games?clear_cache=true" -H "Authorization: Bearer your_token"`，或 `?admin_token=your_token`。未配置 `ADMIN_TOKEN` 时不会返回这个错误，`clear_cache` 保持公开。鉴权只在带了 `clear_cache=true` 时才触发，普通请求不需要令牌。

#### 10. 内部错误 (仅限本地 Express 服务器)

```json
{
  "success": false,
  "error": "Internal server error",
  "code": "INTERNAL_ERROR"
}
```

**状态码**: 500

**原因**: Express 层的兜底错误处理被触发，说明请求没有走到 `handleRequest`，或者在写回响应时出错。Vercel / Netlify / Cloudflare Workers 不会出现这个错误码，它们统一返回 `STEAM_API_ERROR`。

### 错误码速查

| 错误码 | 状态码 | 触发条件 |
|-------|-------|---------|
| `METHOD_NOT_ALLOWED` | 405 | 非 GET / OPTIONS 请求 |
| `NOT_FOUND` | 404 | 路径不是四个端点之一 |
| `MISSING_PARAM` | 400 | `/api/steam-game` 未提供 `appid` |
| `INVALID_PARAM` | 400 | `/api/steam-game` 的 `appid` 不是正整数 |
| `UNAUTHORIZED` | 401 | `/api/steam-games` 的 `clear_cache` 鉴权失败（仅在配置了 `ADMIN_TOKEN` 且带了 `clear_cache` 时可能发生） |
| `GAME_NOT_FOUND` | 404 | `/api/steam-game` 的游戏不在用户库里 |
| `ENV_ERROR` | 500 | `STEAM_API_KEY` 或 `STEAM_USER_ID` 未配置，或 `STEAM_USER_ID` 不是 17 位数字 |
| `STEAM_API_ERROR` | 500 | 任何端点在请求 Steam 时抛出的异常（含 Steam 8 秒超时） |
| `INTERNAL_ERROR` | 500 | 仅 Express：Express 层兜底错误处理 |

所有错误响应的信封都是 `{ "success": false, "error": "...", "code": "..." }`，没有 `data` 和 `metadata`。

---


## 🌏 语言与地区设置

### 语言设置（本地化文本）

API 返回的游戏信息、描述、价格等均可本地化。**语言由环境变量控制**，不再通过 URL 查询参数设置。

- **STEAM_LANGUAGE** 或 **STEAM_LANG**：指定 Steam 商店 API 返回的语言。
  - 支持的常用值：
    - `schinese`（简体中文，默认）
    - `english`（英文）
    - `japanese`（日文）
    - `tchinese`（繁体中文）
    - `german`、`french`、`spanish`、`russian` 等
  - 例如：
    ```bash
    STEAM_LANGUAGE=english npm start
    # 或
    STEAM_LANGUAGE=schinese npm run dev
    ```
  - 未设置时，默认返回简体中文（schinese）。

### 地区设置（价格/货币）

Steam 商店价格、货币等信息由 `cc` 查询参数控制：

- `cc`：国家/地区代码（如 `cn`, `us`, `jp`, `de` 等），影响价格、货币符号等。
  - 例如：
    - `/api/steam-games?cc=us` 返回美元价格
    - `/api/steam-games?cc=jp` 返回日元价格
    - `/api/steam-games?cc=cn` 返回人民币价格

**注意：**
- 语言和地区可以独立设置。例如：你可以用 `STEAM_LANGUAGE=english` 并请求 `/api/steam-games?cc=cn`，这样会返回中文区的价格但所有文本为英文。
- 语言环境变量优先级高于任何请求参数，API 不再支持通过 `lang` 查询参数切换语言。


### 最近游戏配置

最近游戏的数量由 **Steam API** 决定，表示用户在最近两周内玩过的游戏总数。API 无法配置此数量，将返回 Steam 统计的实际数量。

**说明**:

- `games.recentCount`: 用户最近两周内玩过的游戏总数（来自 Steam API）
- `games.recentGames`: 实际返回的最近游戏列表

### 游戏库返回数量和排序

`/api/steam-games` 端点返回的 `allGames` 列表支持通过 `limit` 查询参数自定义返回的游戏数量。

**说明**:

- `limit` 参数：控制返回游戏的数量，取值范围 1-100，默认值 50
- 超出范围或非法的值（非整数、缺省）会回退为默认值 50，不会返回错误
- 返回的游戏**按总游玩时长（`playtimeForever`）降序排序**
- 示例：`/api/steam-games?limit=30` 返回按时长排序的前 30 个游戏
- 调大 `limit` 会明显拉长冷请求耗时（100 个约 7.4 ~ 9.1 秒，50 个约 8.1 秒，差距不大是因为单次全量 `GetOwnedGames` 固定占约 5 秒），默认 50 是为了给 Vercel Hobby 的 10 秒函数上限留余量

### 缓存配置

缓存分两层，两层用同一组环境变量：

1. **源站进程内缓存** —— 服务端按 TTL 缓存渲染好的响应数据，避免重复请求 Steam
2. **CDN 边缘缓存** —— 响应头声明 `Cache-Control: public, s-maxage=<秒>, stale-while-revalidate=<秒>`，边缘节点在 TTL 内直接返回副本，连源站都不回

`stale-while-revalidate` 取 `s-maxage` 和 3600 秒中的较小值：24 小时级别的端点不会挂一个同样长的 revalidate 窗口，避免过期数据滞留太久。TTL 到期后边缘会先返回旧数据，同时异步回源刷新。

| 数据类型 | 默认 TTL | 环境变量 |
|--------|---------|---------|
| 用户信息 | 10 分钟 | `CACHE_TTL_USER_MINUTES` |
| 游戏信息（游戏库、单游戏） | 24 小时 | `CACHE_TTL_GAMES_HOURS` |
| 成就信息 | 1 小时 | `CACHE_TTL_ACHIEVEMENTS_HOURS` |

### 缓存键

**CDN 边缘缓存**以完整请求 URL 为键，因此查询参数是缓存键的一部分：

- `/api/steam-games?limit=30` 和 `/api/steam-games?limit=50` 是两份独立缓存
- `/api/steam-games?cc=us` 和 `/api/steam-games?cc=jp` 也是两份独立缓存
- 带 `clear_cache` 的请求用于主动失效，不应被当作常规可缓存请求——这类响应会带 `Cache-Control: no-store`，边缘不会存它

调小 `limit` 或频繁切换 `cc` 会降低边缘命中率。

**源站进程内缓存**的键按数据类型区分：

| 端点 | 缓存键 |
|-----|--------|
| `/api/steam-user` | `steam-user-{STEAM_USER_ID}` |
| `/api/steam-games` | `steam-games-{STEAM_USER_ID}-limit{limit}` |
| `/api/steam-game` | `steam-game-{STEAM_USER_ID}-{appid}` |
| `/api/steam-achievements` | `steam-achievements-{STEAM_USER_ID}` |

进程内缓存不区分 `cc`（语言和地区由构造函数参数传入，不进缓存键），所以切换 `cc` 时源站仍可能返回上一个地区的价格；边缘缓存因为按 URL 分键，能正确隔离。

### 强制刷新缓存

`/api/steam-games` 支持 `clear_cache` 参数主动失效游戏库缓存：

```bash
# 未配置 ADMIN_TOKEN
curl "http://localhost:4000/api/steam-games?clear_cache=true"

# 配置了 ADMIN_TOKEN（推荐用请求头，查询参数会进入 CDN 缓存键和访问日志）
curl "http://localhost:4000/api/steam-games?clear_cache=true" -H "Authorization: Bearer your_token"

# 等价写法：退回查询参数
curl "http://localhost:4000/api/steam-games?clear_cache=true&admin_token=your_token"
```

其他端点没有对应的失效参数，只能等待 TTL 到期。

实际执行了清缓存的这次响应带 `Cache-Control: no-store`，不会被边缘缓存。`clear_cache` 清除的只是源站进程内缓存（`clearGamesCache` 会遍历清掉所有 limit 的游戏库缓存键），边缘缓存要等自己的 TTL 到期。

### 调整缓存策略

在 `.env` 或部署平台的环境变量中配置：

```bash
# 用户信息缓存时长（分钟）
CACHE_TTL_USER_MINUTES=10

# 游戏信息缓存时长（小时）
CACHE_TTL_GAMES_HOURS=48

# 成就信息缓存时长（小时）
CACHE_TTL_ACHIEVEMENTS_HOURS=2

# clear_cache 的鉴权令牌，强烈建议在公网部署时设置
ADMIN_TOKEN=your_admin_token
```

---

## 性能指标

### 响应时间

| 场景 | 平均时间 |
|-----|--------|
| CDN 边缘缓存命中 | < 100ms（不回源） |
| 源站进程内缓存命中 | < 10ms（不请求 Steam） |
| `/api/steam-user` 首次请求 | 1-2 秒 |
| `/api/steam-games` 首次请求（默认 limit=50） | 约 8.1 秒（实测，140 游戏库） |
| `/api/steam-games` 首次请求（`limit=100`） | 7.4 ~ 9.1 秒（实测，140 游戏库） |
| `/api/steam-achievements` 首次请求 | 约 2.6 秒（实测） |
| 单个 Steam 请求超时 | 8 秒后放弃（Steam 商店接口 5 秒） |

> `/api/steam-games` 的冷请求耗时里，单次全量 `GetOwnedGames`（`include_appinfo=true`）固定占约 5 秒，100 个游戏的成就只占约 4 秒。完整实测数据见前文「游戏库耗时的实测数据」。

### 超时与并发

- 所有对 Steam Web API 的请求都带 8 秒超时，Steam 商店（appdetails）接口是 5 秒。Steam 不可达时请求会明确失败并返回 `STEAM_API_ERROR`，不会无限挂起
- 成就数据（`GetPlayerAchievements` + `GetSchemaForGame`）按游戏并发拉取，**并发上限 16**，可用 `STEAM_CONCURRENCY` 环境变量覆盖（正整数，非法值回退为 16）
- 并发上限是实测值：并发 16 在真实 Steam 数据上未出现 429 限流、未超时。不再保留早期为躲限流加的固定 sleep，请求直接按并发窗口发出
- 单个游戏的成就请求失败不会影响整个响应，该游戏只是没有成就数据
- 没有成就系统的游戏（实测 100 个游戏里有 10 个）会记一条 WARN 日志，该游戏没有成就数据、不计入成就覆盖统计，这是正常行为不是错误
- 无对外硬并发限制
- Steam API 限制: ~1600 请求/秒

### 带宽使用

- 平均响应大小: 50-200 KB（取决于游戏数量和成就数）

---

## 常见问题

**Q: API 能查询其他用户吗？**

A: 不能。本 API 仅返回在部署时配置的单个 Steam 用户的信息。

**Q: 如何强制刷新缓存？**

A: `/api/steam-games` 支持 `clear_cache=true` 主动清除游戏库缓存。服务端配置了 `ADMIN_TOKEN` 时必须带上令牌，推荐用 `Authorization: Bearer <值>` 请求头，也兼容 `?admin_token=<值>` 查询参数，否则返回 401。其他端点（用户信息、成就）只能等缓存自然过期。这次清缓存请求的响应带 `Cache-Control: no-store`，不会被边缘缓存。

**Q: 缓存是存在服务端的吗？**

A: 两层都有。源站有一层进程内缓存，边缘还有一层 CDN 缓存。响应里的 `metadata.cached` 只反映源站那层，边缘命中时请求根本到不了源站。

**Q: 支持哪些成就？**

A: 所有有成就系统的 Steam 游戏。`/api/steam-achievements` 覆盖最近玩过的 10 个游戏加上游戏库中游玩时长最靠前的 50 个（`byGame` 里有实际返回结果的才算）。成就按游戏并发拉取（并发上限 16），单个游戏拉取失败只会让该游戏没有成就数据，不影响其他游戏。没有成就系统的游戏不会出现在 `byGame` 里，服务端会为它记一条 WARN 日志，这是正常行为。

**Q: 为什么返回的最近游戏数量很少？**

A: 因为 Steam API 返回的是用户在**最近两周内实际玩过的游戏**。如果用户最近两周只玩了 3 个游戏，API 就只会返回这 3 个游戏。这个数量由 Steam 决定，无法配置。您可以通过 `games.recentCount` 字段查看实际的最近游戏总数。

**Q: 能改变最近游戏的返回数量吗？**

A: 不能。最近游戏数量完全由 Steam API 决定，无法通过配置改变。Steam 会返回用户最近两周内玩过的所有游戏。

**Q: 能改变游戏库返回的数量吗？**

A: 可以。使用 `limit` 查询参数自定义返回的游戏数量，默认 50，支持范围 1-100。例如 `/api/steam-games?limit=30` 会返回前 30 个游戏，`?limit=100` 会拉满。超出范围或非法的值会回退为默认的 50，不会报错。调大 `limit` 会拉长冷请求耗时，Vercel Hobby 的函数上限是 10 秒，默认值 50 就是为此留的余量。

**Q: 为什么有的游戏没有 `achievements` 字段？**

A: 该游戏没有成就系统，Steam 返回的成就列表是空的。这种情况下 `achievements` 字段直接缺失（不是全 0），该游戏也不计入成就覆盖统计。实测约 140 个游戏的库里，100 个返回项中有 10 个属于这种情况。服务端会为每个这样的游戏记一条 WARN 日志，这是正常行为，端点仍返回 200。

**Q: 游戏库是按什么顺序返回的？**

A: 按总游玩时长（`playtimeForever`）降序排序。游玩时间最长的游戏会首先出现。

**Q: 如何获取单个游戏的详细信息？**

A: 使用 `/api/steam-game?appid=xxx` 端点，其中 `xxx` 是游戏的 Steam App ID。例如：`/api/steam-game?appid=570`。该端点返回单个游戏的完整信息，包括游玩时间统计、价格、成就统计等。

**Q: `/api/steam-game` 端点支持查询用户没有购买的游戏吗？**

A: 不支持。该端点仅返回用户已购买或拥有的游戏。如果查询用户没有的游戏，将返回 404 错误 `GAME_NOT_FOUND`。

**Q: 图片加载失败怎么办？**

A: 这是 Steam CDN 的临时问题。所有图片 URL 都是有效的公开 Steam CDN 链接。

**Q: 四个平台的响应会不一样吗？**

A: 不会。四个平台共用同一个请求处理核心（`lib/app.ts` 的 `handleRequest`），响应结构、错误码、查询参数完全一致。平台入口只负责把调用转成 Web 标准 `Request` 再把 `Response` 写回。

