import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    // 默认 node 环境，组件测试用 @vitest-environment jsdom 单独指定
    environment: 'node',
    include: [
      'src/**/__tests__/**/*.test.{ts,tsx}',
      'api/**/__tests__/**/*.test.{ts,tsx}',
    ],
    // 允许 .tsx 组件测试走 happy-dom (更快)
    environmentMatchGlobs: [
      ['src/components/**/*.test.tsx', 'happy-dom'],
    ],
    setupFiles: ['./vitest.setup.ts'],
  },
});
