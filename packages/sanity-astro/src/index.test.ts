import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import type {HookParameters} from 'astro'
import {afterEach, describe, expect, it, vi} from 'vitest'

import sanityIntegration, {type IntegrationOptions, type SanityLiveOptions} from './index'
import {SANITY_LOADER_MODULE_ID} from './vite-plugin-sanity-loader'
import {
  SANITY_MODULE_DEDUPE,
  vitePluginSanityModuleDedupe,
} from './vite-plugin-sanity-module-dedupe'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'

type SetupOptions = Pick<
  IntegrationOptions,
  'studioBasePath' | 'studioRouterHistory' | 'logClientRequests'
> & {
  output?: 'static' | 'server'
  live?: SanityLiveOptions
  command?: HookParameters<'astro:config:setup'>['command']
  root?: string
}

const fixturePath = fileURLToPath(
  new URL('./live/__fixtures__/movies-schema.json', import.meta.url),
)

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})))
})

async function runSetup({
  output = 'static',
  studioRouterHistory,
  studioBasePath = '/admin',
  logClientRequests,
  live,
  command = 'build',
  root = '/app/',
}: SetupOptions = {}) {
  const integration = sanityIntegration({
    projectId: 'project-id',
    dataset: 'dataset-name',
    studioBasePath,
    studioRouterHistory,
    logClientRequests,
    experimental_live: live,
  })
  const setup = integration.hooks['astro:config:setup']
  const injectRoute = vi.fn()
  const updateConfig = vi.fn()
  const injectScript = vi.fn()
  const logger = {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()}
  const codegenDir = await mkdtemp(join(tmpdir(), 'sanity-astro-codegen-'))
  tempDirs.push(codegenDir)
  const createCodegenDir = vi.fn(() => pathToFileURL(`${codegenDir}/`))
  const typesFile = join(codegenDir, 'sanity-loader.d.ts')
  const injectTypes = vi.fn(() => pathToFileURL(typesFile))

  await setup({
    config: {output, root: pathToFileURL(root)},
    command,
    injectRoute,
    updateConfig,
    injectScript,
    createCodegenDir,
    logger,
  } as never)
  await integration.hooks['astro:config:done']?.({injectTypes, logger} as never)

  const vitePlugins: Array<{name?: string; load?: (id: string) => unknown}> =
    updateConfig.mock.calls[0][0].vite.plugins
  const loaderPlugin = vitePlugins.find((plugin) => plugin.name === 'sanity:loader')

  return {
    integration,
    injectRoute,
    updateConfig,
    injectScript,
    injectTypes,
    logger,
    vitePlugins,
    loaderPlugin,
    typesFile,
  }
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

describe('sanity integration live loaders', () => {
  const live: SanityLiveOptions = {
    schema: fixturePath,
    loaders: {movie: {type: 'movie', projection: 'title', orderBy: ['title', 'asc']}},
  }

  it('serves the generated module from sanity:loader and injects its types', async () => {
    const {loaderPlugin, injectTypes, logger, typesFile} = await runSetup({live})

    const source = loaderPlugin?.load?.(SANITY_LOADER_MODULE_ID)
    expect(source).toContain('export const movieLoader = (options = {}) =>')
    expect(source).toContain('export const movieSchema = z.object({')
    expect(injectTypes).toHaveBeenCalledTimes(1)
    const [{filename, content}] = injectTypes.mock.calls[0] as unknown as [
      {filename: string; content: string},
    ]
    expect(filename).toBe('sanity-loader.d.ts')
    expect(content).toContain('export type Movie = {')
    expect(content).toContain('title: string | null;')
    expect(await readFile(typesFile, 'utf8')).toBe(content)
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('is off by default: no loader plugin, no live hooks, no injected types', async () => {
    const {integration, vitePlugins, loaderPlugin, injectTypes} = await runSetup()

    expect(Object.keys(integration.hooks)).toEqual(['astro:config:setup', 'astro:config:done'])
    expect(loaderPlugin).toBeUndefined()
    expect(vitePlugins.map((plugin) => plugin.name)).toEqual([
      'sanity:module-dedupe',
      'sanity:client',
      'sanity:studio',
      'sanity:studio-hash-router',
      'vite-plugin-sanity-studio-chunk-warning',
    ])
    expect(injectTypes).not.toHaveBeenCalled()
  })

  it('adds the live hooks only when experimental_live is set', async () => {
    const {integration} = await runSetup({live})

    expect(Object.keys(integration.hooks)).toEqual([
      'astro:config:setup',
      'astro:config:done',
      'astro:server:setup',
    ])
  })

  it('requires Astro 6 or later', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sanity-astro-root-'))
    tempDirs.push(root)
    const astroDir = join(root, 'node_modules', 'astro')
    await mkdir(astroDir, {recursive: true})
    await writeFile(
      join(astroDir, 'package.json'),
      JSON.stringify({name: 'astro', version: '5.11.1'}),
    )

    await expect(runSetup({live, root: `${root}/`})).rejects.toThrow(
      '[@sanity/astro] The `experimental_live` option requires Astro 6 or later (found astro 5.11.1)',
    )
  })

  it('skips the extraction for astro preview, which serves the built output', async () => {
    const {loaderPlugin, injectTypes, logger} = await runSetup({live, command: 'preview'})

    expect(loaderPlugin).toBeUndefined()
    expect(injectTypes).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
  })

  it('keeps experimental_live out of the client config', async () => {
    const {updateConfig} = await runSetup({live})
    const clientPlugin = updateConfig.mock.calls[0][0].vite.plugins.find(
      (plugin: {name?: string}) => plugin.name === 'sanity:client',
    )
    expect(clientPlugin.load('\0sanity:client')).not.toContain('loaders')
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
