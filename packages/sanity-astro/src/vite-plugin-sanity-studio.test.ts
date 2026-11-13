import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {pathToFileURL} from 'node:url'

import {afterEach, describe, expect, it, vi} from 'vitest'

import {vitePluginSanityStudio} from './vite-plugin-sanity-studio'

type StudioPluginOptions = Parameters<typeof vitePluginSanityStudio>[0]
type LoadHook = (
  this: {resolve: (id: string) => Promise<{id: string} | null>},
  id: string,
  options?: {ssr?: boolean},
) => unknown

const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})))
})

async function generateStudioModule(
  options: StudioPluginOptions,
  studioConfigSource: string | null,
  ssr?: boolean,
) {
  const plugin = vitePluginSanityStudio(options)
  const load = plugin.load as unknown as LoadHook
  const dir = await mkdtemp(path.join(tmpdir(), 'sanity-astro-studio-'))
  tempDirs.push(dir)
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
    {ssr},
  ) as Promise<string>
}

async function importStudioModule(
  options: StudioPluginOptions,
  studioConfigSource: string,
  {ssr, astroEnv = {}}: {ssr?: boolean; astroEnv?: Record<string, string>} = {},
) {
  const code = (await generateStudioModule(options, studioConfigSource, ssr)).replace(
    /import \{([^}]*)\} from "astro:env\/server";/,
    `const {$1} = ${JSON.stringify(astroEnv)};`,
  )
  const dir = tempDirs[tempDirs.length - 1]
  const modulePath = path.join(dir, `studio-${Math.random().toString(36).slice(2)}.mjs`)
  await writeFile(modulePath, code)
  return (await import(pathToFileURL(modulePath).href)) as {
    config: unknown
    runtimeConfig: unknown
  }
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

  describe('env option', () => {
    const options: StudioPluginOptions = {
      studioBasePath: '/admin',
      studioRouterHistory: 'browser',
      env: {dataset: 'SANITY_DATASET'},
    }

    it('exports the runtime values on the server', async () => {
      const studioModule = await importStudioModule(options, 'export default {dataset: "build"}', {
        ssr: true,
        astroEnv: {SANITY_DATASET: 'runtime'},
      })

      expect(studioModule.runtimeConfig).toEqual({dataset: 'runtime'})
      expect(studioModule.config).toEqual({dataset: 'build', basePath: '/admin'})
    })

    it('exports no runtime values to the browser', async () => {
      const source = 'export default {dataset: "build"}'

      expect(await generateStudioModule(options, source, false)).not.toContain('from "astro:env')
      expect((await importStudioModule(options, source)).runtimeConfig).toBeUndefined()
    })

    it('rejects a Studio with several workspaces', async () => {
      await expect(
        importStudioModule(options, 'export default [{name: "a"}, {name: "b"}]', {ssr: true}),
      ).rejects.toThrow(/supports a Studio with a single workspace/)
    })
  })
})
