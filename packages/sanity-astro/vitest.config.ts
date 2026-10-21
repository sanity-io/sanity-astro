import {defineConfig} from 'vitest/config'

export default defineConfig({
  // tsconfig inherits `jsx: preserve` from astro/tsconfigs/base for the
  // Astro compiler; Vite 8 honours it and would leave JSX untransformed.
  oxc: {
    jsx: {runtime: 'automatic'},
  },
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    exclude: ['dist/**', 'node_modules/**', 'src/integration/**'],
  },
})
