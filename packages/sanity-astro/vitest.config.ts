import {defineConfig} from 'vitest/config'

export default defineConfig({
  // The Astro base tsconfig sets `jsx: preserve`, so the transform needs telling how to lower
  // JSX in `.test.tsx` files.
  oxc: {jsx: {runtime: 'automatic'}},
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    exclude: ['dist/**', 'node_modules/**', 'src/integration/**'],
  },
})
