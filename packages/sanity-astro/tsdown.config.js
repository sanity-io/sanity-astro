import {defineConfig} from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts', 'src/loader.ts'],
  format: 'esm',
  platform: 'node',
  dts: true,
  // Keep existing dist files while watch rebuilds to avoid
  // transient package entry resolution failures in consuming apps.
  clean: false,
  deps: {
    onlyBundle: ['serialize-javascript'],
  },
  copy: [
    {from: ['src/studio/**/*', '!**/*.test.*'], to: 'dist/studio'},
    {from: ['src/visual-editing/**/*', '!**/*.test.*'], to: 'dist/visual-editing'},
  ],
})
