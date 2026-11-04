import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    // Les tests partagent une base de données : on les lance un par un
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
