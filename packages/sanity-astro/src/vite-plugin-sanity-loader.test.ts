import {describe, expect, it} from 'vitest'
import {vitePluginSanityLoader} from './vite-plugin-sanity-loader'

describe('vitePluginSanityLoader', () => {
  it('resolves and loads sanity:loader virtual module', () => {
    const plugin = vitePluginSanityLoader({
      movie: {
        type: 'movie',
        projection: '_id,title',
        orderBy: ['_updatedAt', 'desc'],
      },
    })
    const pluginHooks = plugin as unknown as {
      resolveId?: (id: string) => string | undefined
      load?: (id: string) => string | undefined
    }

    const resolvedId = pluginHooks.resolveId?.('sanity:loader')
    expect(resolvedId).toBe('\0sanity:loader')

    const source = pluginHooks.load?.('\0sanity:loader')
    expect(source).toContain('sanityLiveLoader')
    expect(source).toContain('movieLoader')
    expect(source).toContain('"collectionQuery": "*[_type == \\"movie\\"]')
  })
})
