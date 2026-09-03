import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    exclude: ['dist/**', 'node_modules/**', 'src/integration/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/integration/**'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 36,
        branches: 27,
        functions: 37,
        lines: 35,
      },
    },
  },
})
