import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    include: ['src/integration/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
