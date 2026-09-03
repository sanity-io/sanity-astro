import {defineConfig} from 'tsdown'

// `src/studio` and `src/visual-editing` ship as source: they contain `.astro` and
// React components that the consuming Astro project compiles with its own Vite.
export default defineConfig({
  entry: ['src/index.ts', 'src/loader.ts'],
  format: 'esm',
  platform: 'node',
  dts: true,
  deps: {
    neverBundle: [/^node:/, 'vite', 'astro', '@sanity/client'],
    onlyBundle: ['serialize-javascript', 'randombytes'],
  },
  copy: [
    {from: ['src/studio/**/*', '!**/*.test.*'], to: 'dist/studio'},
    {from: ['src/visual-editing/**/*', '!**/*.test.*'], to: 'dist/visual-editing'},
  ],
})
