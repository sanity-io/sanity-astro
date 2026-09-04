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
          index: path.resolve(__dirname, 'src/index.ts'),
          loader: path.resolve(__dirname, 'src/loader/index.ts'),
        },
        name,
        formats: ['es'],
        fileName: (_format, entryName) =>
          entryName === 'index' ? `${name}.mjs` : `${entryName}.mjs`,
      },
      rollupOptions: {
        external: [/^node:/, 'vite', 'astro', '@sanity/client', 'groq-js'],
      },
    },
    plugins: [
      dts({
        outDir: 'dist/types',
      }) as unknown as Plugin,
    ],
  }
})
