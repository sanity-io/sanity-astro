import {describe, expect, it} from 'vitest'
import {
  collectStudioChunkFiles,
  getOversizedNonStudioChunks,
  isStudioChunkRoot,
} from './vite-plugin-sanity-studio-chunk-warning'

describe('studio chunk size warning filter', () => {
  it('identifies Studio root chunks', () => {
    expect(
      isStudioChunkRoot({
        fileName: 'assets/studio-component.abcd1234.js',
      }),
    ).toBe(true)
  })

  it('does not identify non-Studio root chunks', () => {
    expect(
      isStudioChunkRoot({
        fileName: 'assets/app-client.abcd1234.js',
      }),
    ).toBe(false)
  })

  it('collects the full Studio import graph from root chunk(s)', () => {
    const chunksByFileName = new Map([
      [
        'assets/studio-component.abcd1234.js',
        {
          fileName: 'assets/studio-component.abcd1234.js',
          imports: ['assets/studio-shared.abcd1234.js'],
        },
      ],
      [
        'assets/studio-shared.abcd1234.js',
        {
          fileName: 'assets/studio-shared.abcd1234.js',
          imports: [],
          dynamicImports: ['assets/studio-video.abcd1234.js'],
        },
      ],
      [
        'assets/studio-video.abcd1234.js',
        {
          fileName: 'assets/studio-video.abcd1234.js',
        },
      ],
      [
        'assets/app-client.abcd1234.js',
        {
          fileName: 'assets/app-client.abcd1234.js',
          imports: [],
        },
      ],
    ])

    const studioChunkFiles = collectStudioChunkFiles(chunksByFileName)
    expect(studioChunkFiles).toEqual(
      new Set([
        'assets/studio-component.abcd1234.js',
        'assets/studio-shared.abcd1234.js',
        'assets/studio-video.abcd1234.js',
      ]),
    )
  })

  it('flags only oversized non-Studio chunks', () => {
    const chunksByFileName = new Map([
      [
        'assets/studio-component.abcd1234.js',
        {
          fileName: 'assets/studio-component.abcd1234.js',
          code: 'x'.repeat(1024 * 1200),
          imports: ['assets/studio-video.abcd1234.js'],
        },
      ],
      [
        'assets/studio-video.abcd1234.js',
        {
          fileName: 'assets/studio-video.abcd1234.js',
          code: 'x'.repeat(1024 * 1300),
        },
      ],
      [
        'assets/app-large.abcd1234.js',
        {
          fileName: 'assets/app-large.abcd1234.js',
          code: 'x'.repeat(1024 * 900),
        },
      ],
      [
        'assets/app-small.abcd1234.js',
        {
          fileName: 'assets/app-small.abcd1234.js',
          code: 'x'.repeat(1024 * 100),
        },
      ],
    ])

    const oversizedNonStudioChunks = getOversizedNonStudioChunks(chunksByFileName, 500)
    expect(oversizedNonStudioChunks).toEqual(['assets/app-large.abcd1234.js'])
  })
})
