import {resolve} from 'node:path'

import {defineConfig, type Plugin} from 'vite'
import dts from 'vite-plugin-dts'

const name = 'sanity-astro'

export default defineConfig(() => {
  return {
    build: {
      // Keep existing dist files while watch rebuilds to avoid
      // transient package entry resolution failures in consuming apps.
      emptyOutDir: false,
      lib: {
        entry: {
          [name]: resolve(__dirname, 'src/index.ts'),
          loader: resolve(__dirname, 'src/loader.ts'),
        },
        formats: ['es'],
        fileName: (_, entryName) => `${entryName}.mjs`,
      },
      rolldownOptions: {
        external: [/^node:/, 'vite', 'astro', '@sanity/client'],
      },
    },
    plugins: [
      dts({
        include: ['src'],
        entryRoot: 'src',
        outDir: 'dist/types',
        // Exclude tests and Playwright integration harness from published .d.ts output
        exclude: [
          'node_modules/**',
          'dist/**',
          'src/**/*.test.*',
          'src/**/*.test-d.ts',
          'src/integration/**',
        ],
      }) as unknown as Plugin,
    ],
  }
})