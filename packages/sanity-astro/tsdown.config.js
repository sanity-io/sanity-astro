import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  dts: true,
  deps: {
    onlyBundle: ['serialize-javascript'],
  },
  copy: [
    {from: ['src/studio/**/*', '!**/*.test.*'], to: 'dist/studio'},
    {from: ['src/visual-editing/**/*', '!**/*.test.*'], to: 'dist/visual-editing'},
  ],
})
