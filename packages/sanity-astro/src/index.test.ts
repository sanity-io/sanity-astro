import {describe, expect, it, vi} from 'vitest'
import sanityIntegration from './index'

function createSetupArgs() {
  return {
    createCodegenDir: vi.fn(() => new URL('file:///tmp/.astro/')),
    injectRoute: vi.fn(),
    updateConfig: vi.fn(),
    injectScript: vi.fn(),
  }
}

describe('sanity integration studio router history defaults', () => {
  it('defaults to hash history for static output', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
    })
    const setup = integration.hooks['astro:config:setup']
    const {createCodegenDir, injectRoute, updateConfig, injectScript} = createSetupArgs()

    await setup({config: {output: 'static'}, createCodegenDir, injectRoute, updateConfig, injectScript} as never)

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
    const {createCodegenDir, injectRoute, updateConfig, injectScript} = createSetupArgs()

    await setup({config: {output: 'server'}, createCodegenDir, injectRoute, updateConfig, injectScript} as never)

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
    const {createCodegenDir, injectRoute, updateConfig, injectScript} = createSetupArgs()

    await setup({config: {output: 'static'}, createCodegenDir, injectRoute, updateConfig, injectScript} as never)

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })
})

describe('sanity integration live loader virtual module types', () => {
  it('injects sanity:loader types when live loaders are configured', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      live: {
        loaders: {
          movie: {
            type: 'movie',
            projection: '_id,title',
            orderBy: ['_updatedAt', 'desc'],
          },
        },
      },
    })

    const setup = integration.hooks['astro:config:setup']
    const done = integration.hooks['astro:config:done']
    const {createCodegenDir, injectRoute, updateConfig, injectScript} = createSetupArgs()
    const injectTypes = vi.fn()

    await setup?.({
      config: {output: 'server'},
      createCodegenDir,
      injectRoute,
      updateConfig,
      injectScript,
    } as never)
    await done?.({
      injectTypes,
    } as never)

    expect(injectTypes).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'sanity-loader.d.ts',
        content: expect.stringContaining('declare module \'sanity:loader\''),
      }),
    )
    expect(String(injectTypes.mock.calls[0]?.[0]?.content)).toContain('movieLoader')
  })
})
