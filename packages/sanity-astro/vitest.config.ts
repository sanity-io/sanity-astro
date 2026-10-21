import {fileURLToPath} from 'node:url'

import {defineConfig} from 'vitest/config'

export default defineConfig({
  // tsconfig inherits `jsx: preserve` from astro/tsconfigs/base for the
  // Astro compiler; Vite 8 honours it and would leave JSX untransformed.
  oxc: {
    jsx: {runtime: 'automatic'},
  },
  resolve: {
    alias: {
      'sanity:studio': fileURLToPath(
        new URL('./src/studio/sanity-studio.stub.ts', import.meta.url),
      ),
    },
  },
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    exclude: ['dist/**', 'node_modules/**', 'src/integration/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.stub.ts',
        'src/**/*.d.ts',
        'src/integration/**',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 85,
        branches: 75,
        functions: 85,
        lines: 85,
      },
    },
  },
})
