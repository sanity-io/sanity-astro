import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    hookTimeout: 240_000,
    testTimeout: 240_000,
    exclude: ['dist/**', 'node_modules/**', 'src/integration/**'],
  },
})
