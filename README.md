# Steam Profile API

一个只读的 Steam 个人资料 API，用于获取你自己的 Steam 用户信息。

## 特性

- 获取你的 Steam 用户基本信息（用户名、头像、在线状态、游戏数量与总游玩时长）
- 获取你拥有的所有游戏列表及统计信息
- 获取最近游戏和游戏时长数据
- 获取你的成就信息（已解锁/未解锁）
- 返回所有相关图片的 Steam CDN 直接链接
- 成就数据并发拉取（并发上限 16，可用 `STEAM_CONCURRENCY` 覆盖），显著缩短冷启动耗时
- 所有 Steam 请求都带超时（Web API 8 秒、商店接口 5 秒），不会因 Steam 不可达而无限挂起
- 两层缓存：源站进程内缓存 + CDN 边缘缓存（`Cache-Control` + `s-maxage`），每个端点独立 TTL
- 一份核心逻辑部署到 Vercel / Netlify / Cloudflare Workers / Express 四个平台
- 支持 CORS 跨域调用（适合前端直接调用）
- 错误处理和详细日志
- 部署简单，只需配置两个必需环境变量

## 架构

项目采用「一个核心 + 薄适配层」结构，业务逻辑只有一份：

```
lib/
  app.ts        平台中立的请求处理核心，导出 handleRequest(request, env)
  handler.ts    各端点的数据获取逻辑与环境变量校验
  steam-api.ts  Steam Web API / 商店 API 封装
  node-shim.ts  Node 风格 (req, res) → Web 标准 Request/Response 的适配
  pool.ts       并发受限的批量请求工具（成就拉取）
  cache.ts      缓存存储实现
  types.ts      共享类型定义
  utils.ts      日志、图片 URL 构建等工具

api/*.ts                    Vercel 函数（4 个端点，每个只做一次转发）
netlify/functions/*.ts      Netlify 函数（4 个端点，每个只做一次转发）
src/index.ts                Cloudflare Worker 入口
server.ts                   本地 Express 服务器
test/                       Vitest 单元测试（全部离线，不发真实 Steam 请求）
```

四个入口都只做一件事：把平台自己的调用方式转成 Web 标准 `Request`，交给 `handleRequest`，再把 `Response` 写回。因此四个平台的响应结构、错误码和缓存行为完全一致，修改业务逻辑只需要改 `lib/` 下的文件。

## 性能特征

并发拉取（`lib/pool.ts`）+ 两层缓存，冷请求耗时如下（在真实 Steam 账号、约 140 个游戏的库上实测，两层缓存都未命中）：

| 场景 | 耗时 |
|------|------|
| `/api/steam-user` | 1-2 秒 |
| `/api/steam-games`（默认 `limit=50`，并发 16） | 8.1 秒 |
| `/api/steam-games`（`limit=100`，并发 16） | 7.4 ~ 9.1 秒 |
| `/api/steam-games`（`limit=100`，并发 8） | 14.7 秒 |
| `/api/steam-achievements` | 2.6 秒 |
| 源站进程内缓存命中 | < 10ms |
| CDN 边缘缓存命中 | < 100ms（不回源） |

几个由实测得出的设计取舍：

- **并发上限 16**：早期串行实现里为躲限流加的 100ms sleep 已删除，直接按并发窗口发出。并发 16 在真实数据上未出现 429 限流、未超时，可用 `STEAM_CONCURRENCY` 覆盖
- **`limit` 默认 50、上限 100**：Vercel Hobby 的函数上限是 10 秒。并发 8 + `limit=100` 的 14.7 秒会直接超时，所以默认值下调到 50 留余量；`?limit=100` 仍可用，但已经贴着上限
- **`/api/steam-games` 的耗时下限由一次全量 `GetOwnedGames` 决定**（`include_appinfo=true`，固定约 5 秒），100 个游戏的成就只占约 4 秒。所以调小 `limit` 省不下多少时间，`limit` 越接近上限反而越划算
- **没有成就系统的游戏**会缺 `achievements` 字段（不计入成就覆盖），服务端为它记一条 WARN 日志。实测 100 个游戏里有 10 个属于这种情况，是正常行为不是错误

## 快速开始

### 前置要求

- Node.js 22+
- Steam Web API Key（获取地址：<https://steamcommunity.com/dev/apikey>）
- 你的 Steam ID，17 位纯数字（查询：<https://steamid.io>）

包管理器推荐用 pnpm（仓库带 `pnpm-lock.yaml`），`npm` 同样可用。

### 最快部署（选择一个平台）

#### Vercel（推荐）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FPaloMiku%2FSteam_Profile_API_Server&env=STEAM_API_KEY,STEAM_USER_ID,CACHE_TTL_USER_MINUTES,CACHE_TTL_GAMES_HOURS,CACHE_TTL_ACHIEVEMENTS_HOURS)

1. Fork 本仓库
2. 连接到 Vercel
3. 添加环境变量 STEAM_API_KEY 和 STEAM_USER_ID
4. 部署完成！

构建命令 `npm run build:platforms` 是 `tsc --noEmit` 的纯类型检查，Vercel 自己编译 `api/` 下的函数。

#### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/PaloMiku/Steam_Profile_API_Server)

1. Fork 本仓库
2. 连接到 Netlify
3. 添加环境变量 STEAM_API_KEY 和 STEAM_USER_ID
4. 配置构建命令: `npm run build:platforms`
5. 发布目录留空即可

> `build:platforms` 是 `tsc --noEmit` 的纯类型检查，不产出 `dist/`。Netlify 自己用 esbuild 编译 `netlify/functions/` 下的 TypeScript 源文件（见 `netlify.toml` 的 `functions` 配置），发布目录实际用不到。

#### Cloudflare Workers

入口文件是 `src/index.ts`，导出 `{ fetch }`，部署时把它作为 Worker 脚本即可。构建产物和 `wrangler` 配置不在仓库内，需要自行准备。

#### 本地部署

```bash
# 1. 克隆仓库
git clone https://github.com/PaloMiku/Steam_Profile_API_Server
cd Steam_Profile_API_Server

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
# server.ts 用 dotenv/config 加载 .env（不读 .env.local，那是 Next.js 的约定）
cp .env.example .env
# 编辑 .env，添加 STEAM_API_KEY 和 STEAM_USER_ID

# 4. 开发运行（tsx watch，改动自动重启）
pnpm run dev

# 或者直接启动（不 watch）
pnpm start
```

## 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm run dev` | 启动本地 Express 服务器（`tsx watch server.ts`），默认端口 4000 |
| `pnpm run typecheck` | 对 `api/`、`lib/`、`netlify/`、`src/`、`server.ts` 做类型检查，不产出文件 |
| `pnpm run lint` | ESLint 检查 |
| `pnpm run test` | 运行 `test/` 下的单元测试（vitest，一次性） |
| `pnpm run test:watch` | vitest watch 模式 |
| `pnpm run build` | 与 `typecheck` 相同的 `tsc --noEmit` 检查，不产出文件 |
| `pnpm start` | 用 tsx 直接跑 `server.ts`（无需预编译） |

`typecheck` / `build` / `build:platforms` 都走 `tsconfig.check.json`，是 `noEmit` 的纯检查：它一次覆盖四个平台的全部入口，也不会像早年的 `prebuild` 那样在构建期改写仓库里已提交的 `tsconfig.json`。项目直接用 tsx 跑 TypeScript，没有编译产物目录。

上表用 `pnpm` 书写，用 `npm run <脚本>` 执行效果完全相同。

### CI

`.github/workflows/ci.yml` 在 push 到 `main` 和所有 PR 上运行，使用 Node.js 22 + pnpm 11（版本由 `package.json` 的 `packageManager` 字段锁定，本地与 CI 一致），依次执行 `typecheck`、`lint`、`test`。本地跑通这三条命令即可认为与 CI 一致。

## 环境变量

### 必需

| 变量 | 说明 |
|------|------|
| `STEAM_API_KEY` | Steam Web API 密钥，<https://steamcommunity.com/dev/apikey> 获取 |
| `STEAM_USER_ID` | Steam ID，必须是 17 位纯数字（`/^\d{17}$/`），<https://steamid.io> 查询 |

### 可选

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `ADMIN_TOKEN` | 未设置 | 启用 `/api/steam-games` 的 `clear_cache` 参数鉴权。设置后，清缓存请求必须带上令牌：推荐用 `Authorization: Bearer <值>` 请求头，也兼容 `?admin_token=<值>` 查询参数（请求头优先，两者都带时以请求头为准）。未设置时 `clear_cache` 保持无鉴权行为 |
| `STEAM_CONCURRENCY` | 16 | 成就等批量请求的并发上限，正整数。16 是实测未触发 Steam 429 限流的值；留空或填非正整数时回退为 16 |
| `STEAM_LANGUAGE` / `STEAM_LANG` | `schinese` | Steam 商店返回文本的语言，如 `english`、`japanese`、`tchinese` |
| `CACHE_TTL_USER_MINUTES` | 10 | `/api/steam-user` 的缓存时长（分钟） |
| `CACHE_TTL_GAMES_HOURS` | 24 | `/api/steam-games`、`/api/steam-game` 的缓存时长（小时） |
| `CACHE_TTL_ACHIEVEMENTS_HOURS` | 1 | `/api/steam-achievements` 的缓存时长（小时） |
| `LOG_LEVEL` | `info` | 只有 `debug` 和 `info` 会输出 INFO 级日志；`debug` 另外输出 DEBUG 级。`warn` / `error` 日志不受此变量影响，任何取值都会输出 |
| `PORT` | 4000 | 本地服务器端口（Vercel / Netlify 会自动注入 `PORT`） |

完整模板参见 [.env.example](./.env.example)。

> 公网部署时建议设置 `ADMIN_TOKEN`，否则任何人都能通过 `?clear_cache=true` 反复让缓存失效，把请求打到源站和 Steam 上。

## API 文档

参见 [API.md](./API.md)

## 常见问题

**如何获取 Steam API Key？**

访问 <https://steamcommunity.com/dev/apikey> 并按照说明操作。

**如何查询自己的 Steam ID？**

1. 访问 <https://steamid.io>
2. 输入你的 Steam 用户名或个人资料链接
3. 复制 17 位的 Steam ID

或者直接访问你的 Steam 个人资料页面，URL 中的数字就是你的 Steam ID。

**为什么 API 返回 500 错误？**

检查以下几点：
- `STEAM_API_KEY` 是否正确？
- `STEAM_USER_ID` 是否正确，且是 17 位纯数字？
- 该 Steam 账号的资料是否公开？（需要在 Steam 隐私设置中设置为公开）

**Windows 上 `npm run dev` 起不来 / 没有输出？**

早期版本的入口守卫用字符串拼接比较 `import.meta.url` 和 `file://${process.argv[1]}`，在 Windows 上路径分隔符和盘符格式对不上，条件永远不成立，服务器监听逻辑根本不会执行。现已改成 `fileURLToPath(import.meta.url) === process.argv[1]`，Windows 和 macOS / Linux 行为一致。

如果你仍然遇到这个问题：

1. 确认用的是 `npm run dev`（即 `tsx watch server.ts`），而不是手动去 `node` 某个编译产物——本项目直接用 tsx 跑 TypeScript，没有 `dist/` 目录
2. 端口被占用时服务器会自动回退到随机端口，实际端口会打印在启动横幅里
3. 需要看完整报错时把 `LOG_LEVEL=debug` 写进 `.env`

**缓存如何工作？**

缓存分两层，用同一组环境变量控制 TTL，各端点独立：

- 用户信息：10 分钟
- 游戏库 / 单游戏：24 小时
- 成就数据：1 小时

第一层是源站进程内缓存，避免重复请求 Steam；第二层是 CDN 边缘缓存，响应带 `Cache-Control: public, s-maxage=..., stale-while-revalidate=...`，边缘命中时连源站都不回。

需要强制刷新游戏库缓存时，请求 `/api/steam-games?clear_cache=true`；配置了 `ADMIN_TOKEN` 时还要带上令牌，优先用 `Authorization: Bearer <值>` 请求头（也兼容 `?admin_token=<值>`，两者都带时以请求头为准），否则返回 401。这个参数只清源站的进程内缓存，边缘缓存要等自己的 TTL 到期；这次清缓存的响应带 `Cache-Control: no-store`，不会被边缘缓存。

`/api/steam-games` 的 `limit` 默认 50（范围 1-100），是配合 10 秒函数上限取的默认值，详见[性能特征](#性能特征)。

**我可以为其他 Steam 用户部署这个 API 吗？**

不，这个项目设计为单用户部署。每个用户需要 Fork 本项目并配置自己的 Steam ID 和 API Key。

## 许可

MIT（见 [LICENCE](./LICENCE)）

## 贡献

欢迎提交 Issue 和 Pull Request！
