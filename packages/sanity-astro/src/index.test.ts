import {describe, expect, it, vi} from 'vitest'

import sanityIntegration, {type IntegrationOptions} from './index'
import {vitePluginSanityModuleDedupe} from './vite-plugin-sanity-module-dedupe'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'

type SetupOptions = Pick<
  IntegrationOptions,
  'studioBasePath' | 'studioRouterHistory' | 'logClientRequests' | 'visualEditingStandalone'
> & {
  output?: 'static' | 'server'
  integrations?: Array<{name: string}>
  options?: IntegrationOptions
}

async function runSetup({
  output = 'static',
  studioRouterHistory,
  studioBasePath = '/admin',
  logClientRequests,
  visualEditingStandalone,
  integrations = [],
  options,
}: SetupOptions = {}) {
  const integration = sanityIntegration(
    options ?? {
      projectId: 'project-id',
      dataset: 'dataset-name',
      studioBasePath,
      studioRouterHistory,
      logClientRequests,
      visualEditingStandalone,
    },
  )
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

  return {integration, injectRoute, updateConfig, injectScript, logger, vitePlugins}
}

function loadVirtualClientModule(updateConfig: ReturnType<typeof vi.fn>): string {
  const viteConfig = updateConfig.mock.calls[0][0].vite
  const clientPlugin = viteConfig.plugins.find(
    (plugin: {name?: string}) => plugin.name === 'sanity:client',
  ) as {load: (id: string) => string | undefined}

  const code = clientPlugin.load('\0sanity:client')
  if (typeof code !== 'string') {
    throw new Error('Expected the sanity:client virtual module to produce code')
  }
  return code
}

async function runConfigDone(integration: ReturnType<typeof sanityIntegration>) {
  const injectTypes = vi.fn()
  const configDone = integration.hooks['astro:config:done']
  if (!configDone) {
    throw new Error('Expected the integration to register an astro:config:done hook')
  }
  await configDone({injectTypes} as never)
  return {injectTypes, configDone}
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

describe('sanity integration named clients', () => {
  it('maps top-level client options to the default client', async () => {
    const {updateConfig} = await runSetup()
    const code = loadVirtualClientModule(updateConfig)

    expect(code).toMatch(
      /\["default", createNamedClient\("default", \{[^}]*"projectId":"project-id"/,
    )
    expect(code).not.toContain('"studioBasePath"')
    expect(code).not.toContain('"studioRouterHistory"')
    expect(code).not.toContain('"logClientRequests"')
  })

  it('passes every named client to the virtual module', async () => {
    const {updateConfig} = await runSetup({
      options: {
        clients: {
          default: {projectId: 'project-id', dataset: 'marketing'},
          community: {projectId: 'community-id', dataset: 'community', presentation: true},
        },
      },
    })
    const code = loadVirtualClientModule(updateConfig)

    expect(code).toMatch(
      /\["default", createNamedClient\("default", \{[^}]*"projectId":"project-id"/,
    )
    expect(code).toMatch(
      /\["community", createNamedClient\("community", \{[^}]*"projectId":"community-id"/,
    )
    expect(code).not.toContain('"presentation"')
    expect(code).not.toContain('"clients"')
    expect(code).toContain('const presentationClient = clients.get("community")')
  })

  it('rejects invalid client configuration before Astro runs any hook', () => {
    expect(() => sanityIntegration({clients: {}})).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@sanity/astro]: \`clients.default\` is required when using the \`clients\` option, it is the client exported as \`sanityClient\`. Add it to \`clients\` or configure it with the top-level client options]`,
    )
  })

  it('injects client types with the configured client names', async () => {
    const {integration} = await runSetup({
      options: {
        clients: {
          default: {projectId: 'project-id', dataset: 'marketing'},
          community: {projectId: 'community-id', dataset: 'community', presentation: true},
        },
      },
    })
    const {injectTypes} = await runConfigDone(integration)

    expect(injectTypes).toHaveBeenCalledTimes(1)
    const [{filename, content}] = injectTypes.mock.calls[0]
    expect(filename).toBe('clients.d.ts')
    expect(content).toContain('"default": "project-id.marketing"')
    expect(content).toContain('"community": "community-id.community"')
    expect(content).toContain('name: "community"')
  })

  it('does not inject client types unless the clients option is set', async () => {
    const {integration} = await runSetup()
    const {injectTypes} = await runConfigDone(integration)

    expect(injectTypes).not.toHaveBeenCalled()
  })

  it('skips type injection on Astro versions without injectTypes', async () => {
    const {integration} = await runSetup({
      options: {
        clients: {default: {projectId: 'project-id', dataset: 'marketing'}},
      },
    })
    const configDone = integration.hooks['astro:config:done']

    expect(() => configDone?.({} as never)).not.toThrow()
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
