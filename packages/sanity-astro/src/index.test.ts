import {describe, expect, it, vi} from 'vitest'

import sanityIntegration, {type IntegrationOptions} from './index'
import {vitePluginSanityModuleDedupe} from './vite-plugin-sanity-module-dedupe'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'

type SetupOptions = Pick<
  IntegrationOptions,
  'studioBasePath' | 'studioRouterHistory' | 'logClientRequests' | 'visualEditingStandalone'
> & {output?: 'static' | 'server'; integrations?: Array<{name: string}>}

async function runSetup({
  output = 'static',
  studioRouterHistory,
  studioBasePath = '/admin',
  logClientRequests,
  visualEditingStandalone,
  integrations = [],
}: SetupOptions = {}) {
  const integration = sanityIntegration({
    projectId: 'project-id',
    dataset: 'dataset-name',
    studioBasePath,
    studioRouterHistory,
    logClientRequests,
    visualEditingStandalone,
  })
  const setup = integration.hooks['astro:config:setup']
  const injectRoute = vi.fn()
  const updateConfig = vi.fn()
  const injectScript = vi.fn()
  const logger = {warn: vi.fn()}

  await setup({
    config: {output, integrations},
    injectRoute,
    updateConfig,
    injectScript,
    logger,
  } as never)

  const vitePlugins: Array<{name?: string; load?: (id: string) => unknown}> =
    updateConfig.mock.calls[0][0].vite.plugins

  return {injectRoute, updateConfig, injectScript, logger, vitePlugins}
}

describe('sanity integration options', () => {
  it('does not mutate the options object passed by the caller', () => {
    const options = {
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath: '/admin',
      studioRouterHistory: 'hash' as const,
      logClientRequests: 'dev' as const,
    }
    const snapshot = structuredClone(options)

    sanityIntegration(options)

    expect(options).toEqual(snapshot)
  })

  it('rejects an absolute URL for studioBasePath', () => {
    expect(() => sanityIntegration({studioBasePath: 'https://example.com/admin'})).toThrow(
      /relative URL/,
    )
  })

  it('forwards only client config into the sanity:client virtual module', async () => {
    const {vitePlugins} = await runSetup({logClientRequests: 'build'})
    const clientPlugin = vitePlugins.find((plugin) => plugin.name === 'sanity:client')
    const source = String(clientPlugin?.load?.('\0sanity:client'))

    expect(source).toContain('"projectId":"project-id"')
    expect(source).toContain('"dataset":"dataset-name"')
    expect(source).toContain('"apiVersion":"v2023-08-24"')
    expect(source).toContain('const logClientRequests = "build"')
    expect(source).not.toContain('studioBasePath')
    expect(source).not.toContain('studioRouterHistory')
    expect(source).not.toContain('logClientRequests:')
  })

  it('exposes sanityClient on globalThis for server rendering', async () => {
    const {injectScript} = await runSetup()

    expect(injectScript).toHaveBeenCalledTimes(1)
    const [stage, script] = injectScript.mock.calls[0]
    expect(stage).toBe('page-ssr')
    expect(script).toContain('from "sanity:client"')
    expect(script).toContain('globalThis.sanityClient = sanityClient')
  })

  it('skips the studio route when studioBasePath is not set', async () => {
    const integration = sanityIntegration({projectId: 'project-id', dataset: 'dataset-name'})
    const injectRoute = vi.fn()

    await integration.hooks['astro:config:setup']!({
      config: {output: 'static'},
      injectRoute,
      updateConfig: vi.fn(),
      injectScript: vi.fn(),
    } as never)

    expect(injectRoute).not.toHaveBeenCalled()
  })

  it('normalizes studioBasePath before building the route pattern', async () => {
    const {injectRoute} = await runSetup({studioBasePath: 'cms/', output: 'server'})

    expect(injectRoute).toHaveBeenCalledWith(expect.objectContaining({pattern: '/cms/[...params]'}))
  })
})

describe('sanity integration types', () => {
  it('does not touch .astro/ types unless injectTypes is enabled', async () => {
    const integration = sanityIntegration({projectId: 'project-id', dataset: 'dataset-name'})
    const injectTypes = vi.fn()

    await integration.hooks['astro:config:done']!({injectTypes} as never)

    expect(injectTypes).not.toHaveBeenCalled()
  })

  it('injects a reference to the shipped module declarations when opted in', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      injectTypes: true,
    })
    const injectTypes = vi.fn()

    await integration.hooks['astro:config:done']!({injectTypes} as never)

    expect(injectTypes).toHaveBeenCalledWith({
      filename: 'types.d.ts',
      content: expect.stringContaining('/// <reference types="@sanity/astro/module" />'),
    })
  })

  it('keeps injectTypes out of the client config', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      injectTypes: true,
    })
    const updateConfig = vi.fn()

    await integration.hooks['astro:config:setup']!({
      config: {output: 'static'},
      injectRoute: vi.fn(),
      updateConfig,
      injectScript: vi.fn(),
    } as never)
    const clientPlugin = updateConfig.mock.calls[0][0].vite.plugins.find(
      (plugin: {name?: string}) => plugin.name === 'sanity:client',
    )
    const code = await clientPlugin.load('\0sanity:client')

    expect(code).not.toContain('injectTypes')
  })

  it('tolerates Astro versions without injectTypes when opted in', async () => {
    const integration = sanityIntegration({
      projectId: 'project-id',
      dataset: 'dataset-name',
      injectTypes: true,
    })

    expect(() => integration.hooks['astro:config:done']!({} as never)).not.toThrow()
  })
})

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
    expect((moduleDedupePlugin as {apply?: string}).apply).toBe('serve')
    expect((vitePluginSanityModuleDedupe() as {apply?: string}).apply).toBe('serve')
  })

  it('skips module dedupe plugin when SANITY_ASTRO_DISABLE_MODULE_DEDUPE is set (integration tests)', async () => {
    process.env.SANITY_ASTRO_DISABLE_MODULE_DEDUPE = '1'
    try {
      const {updateConfig} = await runSetup()
      const viteConfig = updateConfig.mock.calls[0][0].vite
      const moduleDedupePlugin = viteConfig.plugins.find(
        (plugin: {name?: string}) => plugin.name === 'sanity:module-dedupe',
      )

      expect(moduleDedupePlugin).toBeUndefined()
    } finally {
      delete process.env.SANITY_ASTRO_DISABLE_MODULE_DEDUPE
    }
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

  it('registers the visual editing standalone plugin only when opted in', async () => {
    const off = await runSetup()
    expect(off.vitePlugins.map((plugin) => plugin.name)).not.toContain(
      'sanity:visual-editing-standalone',
    )

    const {vitePlugins} = await runSetup({visualEditingStandalone: true})
    expect(vitePlugins.map((plugin) => plugin.name)).toContain('sanity:visual-editing-standalone')
  })

  it('warns when visualEditingStandalone is combined with @astrojs/react', async () => {
    const {logger} = await runSetup({
      visualEditingStandalone: true,
      integrations: [{name: '@astrojs/react'}],
    })

    expect(logger.warn).toHaveBeenCalledOnce()
  })

  it('does not warn about @astrojs/react unless visualEditingStandalone is on', async () => {
    const {logger} = await runSetup({integrations: [{name: '@astrojs/react'}]})

    expect(logger.warn).not.toHaveBeenCalled()
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
