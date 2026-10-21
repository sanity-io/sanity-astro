import path from 'path'

import {defineConfig, type Plugin} from 'vite'
import dts from 'vite-plugin-dts'

const name = 'sanity-astro'

export default defineConfig(() => {
  return {
    base: '/src',
    build: {
      // Keep existing dist files while watch rebuilds to avoid
      // transient package entry resolution failures in consuming apps.
      emptyOutDir: false,
      lib: {
        entry: {
          [name]: path.resolve(__dirname, 'src/index.ts'),
          loader: path.resolve(__dirname, 'src/loader.ts'),
        },
        // Two entries rule out UMD; the `.js` build becomes CJS instead.
        formats: ['es', 'cjs'],
        fileName: (format, entryName) => (format === 'es' ? `${entryName}.mjs` : `${entryName}.js`),
      },
      rollupOptions: {
        external: [/^node:/, 'vite', 'astro', '@sanity/client'],
      },
    },
    plugins: [
      dts({
        outDir: 'dist/types',
        // Tests import helpers from `test/`, which would widen the declaration root to the
        // package directory and move `index.d.ts` out of the `types` entry point.
        exclude: ['**/*.test.*'],
      }) as unknown as Plugin,
    ],
  }
})
