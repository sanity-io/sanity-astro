import {defineConfig} from 'vitest/config'

export default defineConfig({
  test: {
    // Several files start `astro dev` in the same fixture app, and concurrent dev servers
    // race on its `.astro/` directory.
    fileParallelism: false,
    hookTimeout: 240_000,
    testTimeout: 240_000,
    include: ['src/integration/**/*.test.ts'],
    exclude: ['dist/**', 'node_modules/**'],
  },
})
