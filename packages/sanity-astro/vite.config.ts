import {defineConfig, type Plugin} from 'vite'
import path from 'path'
import dts from 'vite-plugin-dts'

const name = 'sanity-astro'

export default defineConfig(() => {
  return {
    base: '/src',
    build: {
      // Keep existing dist files while watch rebuilds to avoid
      // transient package entry resolution failures in consuming apps.
      emptyOutDir: false,
      rollupOptions: {
        external: ['node:fs/promises'],
        output: {
          inlineDynamicImports: true,
          chunkFileNames: '[name].mjs',
          assetFileNames: '[name][extname]',
        },
      },
      lib: {
        entry: [path.resolve(__dirname, 'src/index.ts')],
        name,
        fileName: (format) => (format === 'es' ? `${name}.mjs` : `${name}.js`),
      },
    },
    plugins: [
      dts({
        outDir: 'dist/types',
      }) as unknown as Plugin,
    ],
  }
})
