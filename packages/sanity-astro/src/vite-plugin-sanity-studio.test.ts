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
) => unknown

const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, {recursive: true, force: true})))
})

async function generateStudioModule(
  options: StudioPluginOptions,
  studioConfigSource: string | null,
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
    {resolve: async () => (studioConfigSource === null ? null : {id: configPath})},
    'sanity:studio',
  ) as Promise<string>
}

async function evaluateStudioModule(options: StudioPluginOptions, studioConfigSource: string) {
  const code = await generateStudioModule(options, studioConfigSource)
  const dir = tempDirs[tempDirs.length - 1]
  const modulePath = path.join(dir, `studio-${Math.random().toString(36).slice(2)}.mjs`)
  await writeFile(modulePath, code)
  const studioModule = (await import(pathToFileURL(modulePath).href)) as {config: unknown}
  return studioModule.config
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
})
