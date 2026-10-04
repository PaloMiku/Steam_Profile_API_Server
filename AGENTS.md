# AGENTS.md

## 定位

只读的 Steam 个人资料 API。用一个服务端保存的 Steam API Key 抓取**单个固定用户**的资料、游戏库和成就，输出统一的 JSON 信封。单用户部署，不做多租户、不做鉴权（响应本身公开）。

## 怎么跑起来

```bash
pnpm install
cp .env.example .env        # 填 STEAM_API_KEY 和 STEAM_USER_ID（17 位纯数字）
pnpm run dev                # tsx watch server.ts，默认 4000 端口
```

`server.ts` 用 `dotenv/config`，**只读 `.env`，不读 `.env.local`**（那是 Next.js 的约定）。

门禁三条，与 CI 完全一致：

```bash
pnpm run typecheck   # tsc -p tsconfig.check.json，noEmit，覆盖四个平台全部入口
pnpm run lint        # ESLint 9 flat config
pnpm run test        # Vitest，7 个文件 222 个用例
```

## 技术栈

TypeScript 5.9（ESM + `module: Node16`）、Node 22+、pnpm 11（版本锁在 `packageManager` 字段，pnpm 11 的 `overrides` 放在 `pnpm-workspace.yaml` 而非 `package.json`）、Vitest 4、ESLint 9。运行时零业务依赖，Express 只服务于本地开发。

## 目录与约定

```
lib/app.ts       唯一的请求处理核心 handleRequest(request, env)
lib/handler.ts   端点业务逻辑，返回 HandlerResult（含真实缓存命中状态）
lib/steam-api.ts Steam Web API 封装，所有请求带超时
lib/pool.ts      并发受限的批量请求（成就拉取，上限 STEAM_CONCURRENCY）
api/ netlify/functions/ src/index.ts server.ts   四个平台入口，只做转发
```

- **改业务逻辑只动 `lib/`**。四个入口是薄适配层，不要往里加逻辑。
- 入口统一是 Web 标准 `Request`/`Response` 签名，不要再引入 `@vercel/node` 之类的平台 SDK。
- **相对导入必须带 `.js` 后缀**，即使源文件是 `.ts`（Node16 模块解析）。
- **测试必须完全离线**：`test/` 下要用 `vi.stubGlobal('fetch', ...)` 桩掉网络，否则会挂起而不是快速失败。
- 沙箱访问不到 Steam 时不要试图用真实请求验证，改用 `curl` 打本地服务或纯函数测试。

## 当前状态（2026-10-05）

架构重构、并发/超时/缓存调优、测试与 CI 均已完成并推送（`main` 最新 `54ae0bf`，CI 首次运行通过）。

**尚未验证**：四个平台一次都没真实部署过。`netlify.toml` 的 `functions` 路径是推理修正，没有跑过真实构建；Vercel 的 10 秒函数上限只在本地实测过（`steam-games` 冷请求约 8 秒）。Cloudflare Workers 缺 `wrangler.toml`，是唯一没有部署配置的入口。

**性能实测基线**（140 游戏库）：并发 16 下 `limit=50` 约 8.1 秒、`limit=100` 约 7.4~9.1 秒；单次全量 `GetOwnedGames` 固定约 5 秒是耗时下限。改并发或 limit 前先看这组数。
