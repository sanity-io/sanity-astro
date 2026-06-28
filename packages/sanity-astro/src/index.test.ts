import {describe, expect, it, vi} from 'vitest'
import sanityIntegration from './index'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'
import {SANITY_MODULE_DEDUPE, vitePluginSanityModuleDedupe} from './vite-plugin-sanity-module-dedupe'

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
  it('registers module dedupe plugin (#406)', async () => {
    const {updateConfig} = await runSetup()

    const viteConfig = updateConfig.mock.calls[0][0].vite
    const moduleDedupePlugin = viteConfig.plugins.find(
      (plugin: {name?: string}) => plugin.name === 'sanity:module-dedupe',
    )

    expect(updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        vite: expect.objectContaining({
          plugins: expect.arrayContaining([moduleDedupePlugin]),
        }),
      }),
    )
    expect(moduleDedupePlugin).toBeDefined()
    expect((vitePluginSanityModuleDedupe() as {name?: string}).name).toBe('sanity:module-dedupe')
    expect(SANITY_MODULE_DEDUPE).toEqual([
      'react',
      'react-dom',
      'react-dom/client',
      'styled-components',
      'sanity',
      '@sanity/ui',
    ])
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
