import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {
  preBundlesWithLegacyEsbuildTarget,
  resolveStudioEntry,
  STUDIO_FIRST_LOAD_ENTRY,
  STUDIO_OPTIMIZE_DEPS_ENTRIES,
  STUDIO_OPTIMIZE_DEPS_ESBUILD_OPTIONS,
  STUDIO_OPTIMIZE_DEPS_INCLUDE,
  vitePluginSanityStudio,
} from './vite-plugin-sanity-studio'

type StudioPluginOptions = Parameters<typeof vitePluginSanityStudio>[0]
type ConfigHook = (
  this: {meta?: {viteVersion?: string}} | undefined,
  config: {root?: string},
  env: {command: 'build' | 'serve'; mode: string},
) => {optimizeDeps?: {entries?: string[]; include?: string[]; esbuildOptions?: object}} | undefined
type LoadHook = (
  this: {resolve: (id: string) => Promise<{id: string} | null>},
  id: string,
) => unknown

const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})))
})

type SanityStub = 'v6' | 'v7' | 'none'

async function createProject(sanity: SanityStub = 'v7') {
  const dir = await mkdtemp(path.join(tmpdir(), 'sanity-astro-studio-'))
  tempDirs.push(dir)
  if (sanity === 'none') {
    return dir
  }
  const sanityDir = path.join(dir, 'node_modules', 'sanity')
  await mkdir(sanityDir, {recursive: true})
  const exports: Record<string, string> = {'.': './index.js', './package.json': './package.json'}
  await writeFile(path.join(sanityDir, 'index.js'), 'export const Studio = "root"')
  if (sanity === 'v7') {
    exports[`./${STUDIO_FIRST_LOAD_ENTRY.slice('sanity/'.length)}`] = './first-load.js'
    await writeFile(path.join(sanityDir, 'first-load.js'), 'export const Studio = "first-load"')
  }
  await writeFile(
    path.join(sanityDir, 'package.json'),
    JSON.stringify({name: 'sanity', type: 'module', exports}),
  )
  return dir
}

async function generateStudioModule(
  options: StudioPluginOptions,
  studioConfigSource: string | null,
  sanity?: SanityStub,
) {
  const plugin = vitePluginSanityStudio(options)
  const load = plugin.load as unknown as LoadHook
  const dir = await createProject(sanity)
  const configResolved = plugin.configResolved as unknown as (config: {root: string}) => void
  configResolved({root: dir})
  const configPath = path.join(dir, 'sanity.config.mjs')
  if (studioConfigSource !== null) {
    await writeFile(configPath, studioConfigSource)
  }

  return load.call(
    {
      resolve: async () =>
        studioConfigSource === null ? null : {id: pathToFileURL(configPath).href},
    },
    'sanity:studio',
  ) as Promise<string>
}

async function importStudioModule(
  options: StudioPluginOptions,
  studioConfigSource: string,
  sanity?: SanityStub,
) {
  const code = await generateStudioModule(options, studioConfigSource, sanity)
  const dir = tempDirs[tempDirs.length - 1]
  const modulePath = path.join(dir, `studio-${Math.random().toString(36).slice(2)}.mjs`)
  await writeFile(modulePath, code)
  return (await import(pathToFileURL(modulePath).href)) as {config: unknown; Studio: unknown}
}

async function evaluateStudioModule(options: StudioPluginOptions, studioConfigSource: string) {
  return (await importStudioModule(options, studioConfigSource)).config
}

describe('vitePluginSanityStudio', () => {
  it('resolves only the sanity:studio id', () => {
    const plugin = vitePluginSanityStudio({studioBasePath: '/admin'})
    const resolveId = plugin.resolveId as (id: string) => string | null

    expect(resolveId('sanity:studio')).toBe('sanity:studio')
    expect(resolveId('sanity:client')).toBeNull()
  })

  it('throws when the project has no sanity.config file', async () => {
    await expect(generateStudioModule({studioBasePath: '/admin'}, null)).rejects.toThrow(
      /requires a `sanity.config.ts\|js` file/,
    )
  })

  it('throws when studioBasePath is missing or empty', async () => {
    const source = 'export default {name: "default"}'

    await expect(generateStudioModule({}, source)).rejects.toThrow(/option is required/)
    await expect(generateStudioModule({studioBasePath: '///'}, source)).rejects.toThrow(
      /cannot be empty/,
    )
  })

  it('mounts a single workspace at studioBasePath with browser history', async () => {
    const config = await evaluateStudioModule(
      {studioBasePath: '/admin', studioRouterHistory: 'browser'},
      'export default {name: "default", projectId: "abc"}',
    )

    expect(config).toEqual({name: 'default', projectId: 'abc', basePath: '/admin'})
  })

  it('mounts a single workspace at / with hash history', async () => {
    const config = await evaluateStudioModule(
      {studioBasePath: '/admin', studioRouterHistory: 'hash'},
      'export default {name: "default"}',
    )

    expect(config).toEqual({name: 'default', basePath: '/'})
  })

  it('derives workspace slugs for multiple workspaces under studioBasePath', async () => {
    const config = await evaluateStudioModule(
      {studioBasePath: '/admin', studioRouterHistory: 'browser'},
      'export default [{name: "Marketing Site"}, {name: "blog"}, {}]',
    )

    expect(config).toEqual([
      {name: 'Marketing Site', basePath: '/admin/marketing-site'},
      {name: 'blog', basePath: '/admin/blog'},
      {basePath: '/admin/workspace-3'},
    ])
  })

  it('derives root-level workspace slugs for multiple workspaces with hash history', async () => {
    const config = await evaluateStudioModule(
      {studioBasePath: '/admin', studioRouterHistory: 'hash'},
      'export default [{name: "marketing"}, {name: "blog"}]',
    )

    expect(config).toEqual([
      {name: 'marketing', basePath: '/marketing'},
      {name: 'blog', basePath: '/blog'},
    ])
  })

  it('warns when sanity.config sets a basePath the integration overrides', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const config = await evaluateStudioModule(
      {studioBasePath: '/admin', studioRouterHistory: 'browser'},
      'export default {name: "default", basePath: "/studio"}',
    )

    expect(config).toEqual({name: 'default', basePath: '/admin'})
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ignores the basePath setting'))
  })

  it('stays quiet when sanity.config basePath already matches', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await evaluateStudioModule(
      {studioBasePath: '/admin', studioRouterHistory: 'browser'},
      'export default {name: "default", basePath: "/admin"}',
    )

    expect(warn).not.toHaveBeenCalled()
  })

  it('exports Studio from the first-load entry on Sanity Studio v7', async () => {
    const {Studio} = await importStudioModule(
      {studioBasePath: '/admin'},
      'export default {name: "default"}',
      'v7',
    )

    expect(Studio).toBe('first-load')
  })

  it('exports Studio from the sanity root before Sanity Studio v7', async () => {
    const {Studio} = await importStudioModule(
      {studioBasePath: '/admin'},
      'export default {name: "default"}',
      'v6',
    )

    expect(Studio).toBe('root')
  })

  it('falls back to the sanity root when sanity is not installed', async () => {
    expect(resolveStudioEntry(await createProject('none'))).toBe('sanity')
  })

  describe('dev dependency optimization (#435)', () => {
    function runConfig(
      options: StudioPluginOptions,
      command: 'build' | 'serve',
      context?: {meta: {viteVersion: string}},
      root?: string,
    ) {
      const config = vitePluginSanityStudio(options).config as unknown as ConfigHook
      return config.call(context, {root}, {command, mode: 'development'})
    }

    it('lets the dev scan reach sanity.config and pre-bundles the Studio route imports', async () => {
      expect(
        runConfig(
          {studioBasePath: '/admin'},
          'serve',
          {meta: {viteVersion: '8.3.8'}},
          await createProject('v6'),
        ),
      ).toEqual({
        optimizeDeps: {
          entries: STUDIO_OPTIMIZE_DEPS_ENTRIES,
          include: STUDIO_OPTIMIZE_DEPS_INCLUDE,
        },
      })
    })

    it('pre-bundles the Sanity Studio v7 first-load entry', async () => {
      expect(
        runConfig(
          {studioBasePath: '/admin'},
          'serve',
          {meta: {viteVersion: '8.3.8'}},
          await createProject('v7'),
        ),
      ).toEqual({
        optimizeDeps: {
          entries: STUDIO_OPTIMIZE_DEPS_ENTRIES,
          include: [...STUDIO_OPTIMIZE_DEPS_INCLUDE, STUDIO_FIRST_LOAD_ENTRY],
        },
      })
    })

    it('allows top-level await in the pre-bundle on Vite 6 and older, which call config without a context', async () => {
      expect(
        runConfig({studioBasePath: '/admin'}, 'serve', undefined, await createProject('v6')),
      ).toEqual({
        optimizeDeps: {
          entries: STUDIO_OPTIMIZE_DEPS_ENTRIES,
          include: STUDIO_OPTIMIZE_DEPS_INCLUDE,
          esbuildOptions: STUDIO_OPTIMIZE_DEPS_ESBUILD_OPTIONS,
        },
      })
      expect(STUDIO_OPTIMIZE_DEPS_ESBUILD_OPTIONS.supported['top-level-await']).toBe(true)
    })

    it('leaves esbuildOptions alone from Vite 7 on, whose targets support top-level await', () => {
      expect(preBundlesWithLegacyEsbuildTarget(undefined)).toBe(true)
      expect(preBundlesWithLegacyEsbuildTarget('5.4.21')).toBe(true)
      expect(preBundlesWithLegacyEsbuildTarget('6.4.1')).toBe(true)
      expect(preBundlesWithLegacyEsbuildTarget('7.0.0')).toBe(false)
      expect(preBundlesWithLegacyEsbuildTarget('8.3.8')).toBe(false)
    })

    it('leaves optimizeDeps alone without an embedded Studio', () => {
      expect(runConfig({}, 'serve')).toBeUndefined()
    })

    it('leaves optimizeDeps alone in builds', () => {
      expect(runConfig({studioBasePath: '/admin'}, 'build')).toBeUndefined()
    })
  })
})
