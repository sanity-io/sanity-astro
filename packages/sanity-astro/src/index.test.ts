import {describe, expect, it, vi} from 'vitest'
import sanityIntegration from './index'

describe('sanity integration studio router history defaults', () => {
  it('defaults to hash history for static output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({config: {output: 'static'}, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route-hash.astro',
        pattern: '/admin',
        prerender: true,
      }),
    )
  })

  it('defaults to browser history for server output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({config: {output: 'server'}, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })

  it('respects explicit browser history on static output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
      studioRouterHistory: 'browser',
    })
    const setup = integration.hooks['astro:config:setup']
    const injectRoute = vi.fn()
    const updateConfig = vi.fn()
    const injectScript = vi.fn()

    await setup({config: {output: 'static'}, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })
})
