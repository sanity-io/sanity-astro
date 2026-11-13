import {defineConfig} from 'tsdown'

export default defineConfig((inlineConfig) => ({
  entry: ['src/index.ts', 'src/loader.ts'],
  format: 'esm',
  platform: 'node',
  dts: {
    // Type tests augment the global `SanityQueries` registry, which must not ship
    tsconfigRaw: {exclude: ['node_modules/*', 'dist', 'src/**/*.test-d.ts']},
  },
  // Builds start from an empty dist so stale files never ship. Watch rebuilds keep the existing
  // files to avoid transient package entry resolution failures in consuming apps.
  clean: !inlineConfig.watch,
  deps: {
    onlyBundle: ['serialize-javascript'],
  },
  copy: [
    {from: ['src/studio/**/*', '!**/*.test.*'], to: 'dist/studio'},
    {from: ['src/visual-editing/**/*', '!**/*.test.*'], to: 'dist/visual-editing'},
  ],
}))
