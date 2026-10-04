import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.netlify/**',
      '.vercel/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    ...js.configs.recommended,
  },
  {
    files: ['**/*.{ts,mts,cts}'],
    extends: [...tseslint.configs.recommended],
    rules: {
      // 本项目多处用 any 表达第三方库/Node 回调的动态形状
      '@typescript-eslint/no-explicit-any': 'off',
      // 未使用变量多为接口占位或日志用的 catch 绑定
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // 现有代码大量使用非空断言与环境变量兜底
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  }
)
