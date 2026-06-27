import {describe, expect, it, vi} from 'vitest'
import sanityIntegration from './index'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'

async function runSetup({
  output = 'static',
  studioRouterHistory,
}: {
  output?: 'static' | 'server'
  studioRouterHistory?: 'browser' | 'hash'
} = {}) {
  const integration = sanityIntegration({
    projectId: 'project-id',
    dataset: 'dataset-name',
    studioBasePath: '/admin',
    studioRouterHistory,
  })
  const setup = integration.hooks['astro:config:setup']
  const injectRoute = vi.fn()
  const updateConfig = vi.fn()
  const injectScript = vi.fn()

  await setup({config: {output}, injectRoute, updateConfig, injectScript} as never)

  return {injectRoute, updateConfig, injectScript}
}

describe('sanity integration vite config', () => {
  it('dedupes and pre-bundles react packages to prevent duplicate React in dev (#406)', async () => {
    const {updateConfig} = await runSetup()

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        vite: expect.objectContaining({
          resolve: {
            dedupe: ['react', 'react-dom', 'react-dom/client'],
          },
          optimizeDeps: {
            include: [
              'react',
              'react-dom',
              'react-dom/client',
              'react-compiler-runtime',
              'react-is',
              'styled-components',
              'lodash/startCase.js',
            ],
          },
        }),
      }),
    )
  })

  it('registers the studio chunk warning plugin as build-only', async () => {
    const {updateConfig} = await runSetup()
    const viteConfig = updateConfig.mock.calls[0][0].vite
    const chunkWarningPlugin = viteConfig.plugins.find(
      (plugin: {name?: string}) => plugin.name === 'vite-plugin-sanity-studio-chunk-warning',
    ) as {apply?: string} | undefined

    expect(chunkWarningPlugin).toBeDefined()
    expect(chunkWarningPlugin?.apply).toBe('build')
    expect((vitePluginSanityStudioChunkWarning() as {apply?: string}).apply).toBe('build')
  })
})

describe('sanity integration studio router history defaults', () => {
  it('defaults to hash history for static output', async () => {
    const {injectRoute} = await runSetup({output: 'static'})

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route-hash.astro',
        pattern: '/admin',
        prerender: true,
      }),
    )
  })

  it('defaults to browser history for server output', async () => {
    const {injectRoute} = await runSetup({output: 'server'})

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })

  it('respects explicit browser history on static output', async () => {
    const {injectRoute} = await runSetup({output: 'static', studioRouterHistory: 'browser'})

    expect(injectRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        entrypoint: '@sanity/astro/studio/studio-route.astro',
        pattern: '/admin/[...params]',
        prerender: false,
      }),
    )
  })
})
