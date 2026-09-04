import {mkdtemp, readFile, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {afterEach, describe, expect, it, vi} from 'vitest'

import sanityIntegration, {type SanityLiveOptions} from './index'
import {SANITY_LOADER_MODULE_ID} from './vite-plugin-sanity-loader'
import {
  SANITY_MODULE_DEDUPE,
  vitePluginSanityModuleDedupe,
} from './vite-plugin-sanity-module-dedupe'
import {vitePluginSanityStudioChunkWarning} from './vite-plugin-sanity-studio-chunk-warning'

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
  live,
}: {
  output?: 'static' | 'server'
  studioRouterHistory?: 'browser' | 'hash'
  live?: SanityLiveOptions
} = {}) {
  const integration = sanityIntegration({
    projectId: 'project-id',
    dataset: 'dataset-name',
    studioBasePath: '/admin',
    studioRouterHistory,
    live,
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
    config: {output, root: pathToFileURL('/app/')},
    command: 'build',
    injectRoute,
    updateConfig,
    injectScript,
    createCodegenDir,
    logger,
  } as never)
  await integration.hooks['astro:config:done']?.({injectTypes, logger} as never)

  const plugins: Array<{name?: string; load?: (id: string) => unknown}> =
    updateConfig.mock.calls[0][0].vite.plugins
  const loaderPlugin = plugins.find((plugin) => plugin.name === 'sanity:loader')

  return {injectRoute, updateConfig, injectScript, injectTypes, logger, loaderPlugin, typesFile}
}

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

  it('serves a throwing module when live is not configured', async () => {
    const {loaderPlugin, injectTypes} = await runSetup()

    expect(loaderPlugin?.load?.(SANITY_LOADER_MODULE_ID)).toContain(
      'throw new Error("[@sanity/astro] Import of \\"sanity:loader\\" requires the `live` option in astro.config.',
    )
    expect(injectTypes).not.toHaveBeenCalled()
  })

  it('requires createCodegenDir', async () => {
    const integration = sanityIntegration({projectId: 'p', dataset: 'd', live})
    await expect(
      integration.hooks['astro:config:setup']?.({
        config: {output: 'static', root: pathToFileURL('/app/')},
        command: 'build',
        injectRoute: vi.fn(),
        updateConfig: vi.fn(),
        injectScript: vi.fn(),
        logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()},
      } as never),
    ).rejects.toThrow('[@sanity/astro] The live option requires Astro 6 or later')
  })

  it('keeps live out of the client config', async () => {
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
    expect(SANITY_MODULE_DEDUPE).toEqual([
      'react',
      'react-dom',
      'react-dom/client',
      'styled-components',
      'sanity',
      '@sanity/ui',
    ])
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
