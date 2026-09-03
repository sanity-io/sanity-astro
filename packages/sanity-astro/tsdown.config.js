import {defineConfig} from 'tsdown'

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
