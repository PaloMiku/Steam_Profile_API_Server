# 构建系统说明

## 统一的 API 源代码

所有 Serverless Function 的源代码都在 `api/` 目录中维护：

```
api/
├── steam-user.ts          # /api/steam-user 端点
├── steam-games.ts         # /api/steam-games 端点
└── steam-achievements.ts  # /api/steam-achievements 端点
```

## 部署平台特定配置

### Vercel
- 直接使用 `api/` 目录中的文件
- 无需额外处理，Vercel 自动将其转换为 Serverless Functions

### Netlify
- 构建时自动将 `api/` 中的文件复制到 `netlify/functions/`
- 通过 `netlify.toml` 中的 `DEPLOY_TARGET=netlify` 环境变量触发
- 导入路径自动调整（从 `../lib/` 改为 `../../lib/`）

### 构建流程

```bash
npm run prebuild  # 执行 scripts/build.ts - 平台检测和文件复制
npm run build     # tsc - TypeScript 编译
```

## 如何添加新的 API 端点

1. 在 `api/` 目录中创建新文件：
   ```bash
   # 例如：api/steam-stats.ts
   cp api/steam-user.ts api/steam-stats.ts
   ```

2. 修改文件内容，改为导入相应的 handler（如果有的话）

3. 构建时会自动：
   - ✅ Vercel：识别新文件作为新端点
   - ✅ Netlify：复制到 `netlify/functions/steam-stats.ts`

## 环境变量与构建

在本地或特定平台构建时，设置 `DEPLOY_TARGET` 环境变量：

```bash
# Vercel 构建
npm run build

# Netlify 构建（会复制文件到 netlify/functions/）
DEPLOY_TARGET=netlify npm run build

# 本地开发
npm run dev
```

## 文件结构总结

```
project/
├── api/                          # 所有 API 源代码（真实维护）
│   ├── steam-user.ts
│   ├── steam-games.ts
│   └── steam-achievements.ts
│
├── netlify/
│   └── functions/                # 构建时自动生成
│       ├── .gitkeep              # 占位符
│       └── *.ts (generated)
│
├── lib/                          # 共享库文件
│   ├── handler.ts
│   ├── steam-api.ts
│   ├── cache.ts
│   ├── types.ts
│   └── utils.ts
│
├── scripts/
│   └── build.ts                  # 构建脚本（平台检测、文件复制）
│
└── tsconfig.json                 # 编译配置
```

## 好处

✅ **单一来源**：只在 `api/` 维护 API 代码  
✅ **一致性**：所有平台使用相同的源代码  
✅ **自动化**：构建时自动处理平台差异  
✅ **易扩展**：添加新端点只需在 `api/` 中创建文件  
