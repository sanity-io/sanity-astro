import {defineConfig} from 'vitest/config'

export default defineConfig({
  // The Astro base tsconfig sets `jsx: preserve`, so the transform needs telling how to lower
  // JSX in `.test.tsx` files.
  oxc: {jsx: {runtime: 'automatic'}},
  plugins: [
    {
      // Makes `sanity:studio` resolvable so `vi.mock` can take over in tests.
      name: 'sanity:studio-stub',
      resolveId: (id) => (id === 'sanity:studio' ? '\0sanity:studio' : null),
      load: (id) => (id === '\0sanity:studio' ? 'export const config = {}' : null),
    },
  ],
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    exclude: ['dist/**', 'node_modules/**', 'src/integration/**'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/*.test-d.ts',
        'src/**/*.d.ts',
        'src/integration/**',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 80,
        lines: 80,
      },
    },
  },
})
