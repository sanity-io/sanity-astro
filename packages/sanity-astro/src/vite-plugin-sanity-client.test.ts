import {describe, expect, it, vi} from 'vitest'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'
import type {ClientConfig} from '@sanity/client'

type LogMode = 'dev' | 'build' | 'always' | undefined

function buildVirtualClientModule({
  logClientRequests,
  env,
  createClient,
}: {
  logClientRequests: LogMode
  env: {DEV: boolean; PROD: boolean}
  createClient: (config: ClientConfig) => Record<string, unknown>
}) {
  const plugin = vitePluginSanityClient(
    {projectId: 'project-id', dataset: 'production', apiVersion: 'v2023-08-24'},
    {logClientRequests},
  )
  const pluginHooks = plugin as unknown as {
    resolveId?: (id: string) => string | undefined
    load?: (id: string) => string | undefined
  }

  const resolvedId = pluginHooks.resolveId?.('sanity:client')
  if (!resolvedId) {
    throw new Error('Expected sanity:client module to resolve')
  }

  const source = pluginHooks.load?.(resolvedId)
  if (typeof source !== 'string') {
    throw new Error('Expected sanity:client virtual module source')
  }

  const executableSource = source
    .replace('import { createClient } from "@sanity/client";', 'const {createClient} = __deps;')
    .replace(/import\.meta\.env\.DEV/g, '__deps.importMeta.env.DEV')
    .replace(/import\.meta\.env\.PROD/g, '__deps.importMeta.env.PROD')
    .replace('export { sanityClient };', 'return { sanityClient };')

  const factory = new Function('__deps', executableSource) as (deps: {
    createClient: (config: ClientConfig) => Record<string, unknown>
    importMeta: {env: {DEV: boolean; PROD: boolean}}
  }) => {sanityClient: Record<string, unknown>}

  return factory({
    createClient,
    importMeta: {env},
  }).sanityClient
}

describe('vitePluginSanityClient request logging wrappers', () => {
  it('does not wrap methods when logClientRequests is omitted', async () => {
    const fetchImpl = vi.fn(async () => ({ok: true}))
    const requestImpl = vi.fn(async () => ({status: 200}))
    const createClient = vi.fn(() => ({fetch: fetchImpl, request: requestImpl}))

    const sanityClient = buildVirtualClientModule({
      logClientRequests: undefined,
      env: {DEV: true, PROD: false},
      createClient,
    })

    expect(sanityClient.fetch).toBe(fetchImpl)
    expect(sanityClient.request).toBe(requestImpl)
    expect(createClient).toHaveBeenCalledTimes(1)
  })

  it('wraps fetch in dev mode and preserves args + return value', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const fetchImpl = vi.fn(async () => ({title: 'Alien'}))
    const createClient = vi.fn(() => ({fetch: fetchImpl}))

    const sanityClient = buildVirtualClientModule({
      logClientRequests: 'dev',
      env: {DEV: true, PROD: false},
      createClient,
    })

    class ErrorWithSourceStack extends Error {
      stack: string

      constructor(message?: string) {
        super(message)
        this.stack = [
          'Error',
          '    at sanityClient.fetch (virtual-module.js:1:1)',
          '    at loadQuery (/Users/chrislarocque/Documents/GitHub/sanity-astro/apps/movies/src/load-query.ts:22:9)',
          '    at /Users/chrislarocque/Documents/GitHub/sanity-astro/apps/movies/src/pages/index.astro:10:3',
        ].join('\n')
      }
    }

    vi.stubGlobal('Error', ErrorWithSourceStack)

    try {
      const query = `*[_type == "movie"][0]`
      const params = {slug: 'alien'}
      const result = await (sanityClient.fetch as (
        q: string,
        p: Record<string, string>,
        options: {filterResponse: boolean},
      ) => Promise<unknown>)(query, params, {filterResponse: false})

      expect(result).toEqual({title: 'Alien'})
      expect(fetchImpl).toHaveBeenCalledWith(query, params, {filterResponse: false})
      expect(infoSpy).toHaveBeenCalledTimes(1)
      expect(String(infoSpy.mock.calls[0]?.[1])).toContain('query:')
      expect(String(infoSpy.mock.calls[0]?.[1])).toContain('params:')
      expect(String(infoSpy.mock.calls[0]?.[1])).toContain('source:')
      expect(String(infoSpy.mock.calls[0]?.[1])).toContain('apps/movies/src/pages/index.astro')
      expect(String(infoSpy.mock.calls[0]?.[1])).toContain('"slug":"alien"')
    } finally {
      vi.unstubAllGlobals()
    }

    infoSpy.mockRestore()
  })

  it('wraps request in build mode and preserves args + return value', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const requestImpl = vi.fn(async () => ({result: []}))
    const createClient = vi.fn(() => ({request: requestImpl}))

    const sanityClient = buildVirtualClientModule({
      logClientRequests: 'build',
      env: {DEV: false, PROD: true},
      createClient,
    })

    const requestArgs = [{uri: '/data/query/production', method: 'GET'}]
    const result = await (sanityClient.request as (arg: Record<string, string>) => Promise<unknown>)(
      requestArgs[0],
    )

    expect(result).toEqual({result: []})
    expect(requestImpl).toHaveBeenCalledWith(requestArgs[0])
    expect(infoSpy).toHaveBeenCalledTimes(1)

    infoSpy.mockRestore()
  })

  it('rethrows underlying errors unchanged', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failure = new Error('Network timeout')
    const fetchImpl = vi.fn(async () => {
      throw failure
    })
    const createClient = vi.fn(() => ({fetch: fetchImpl}))

    const sanityClient = buildVirtualClientModule({
      logClientRequests: 'always',
      env: {DEV: false, PROD: true},
      createClient,
    })

    await expect(
      (sanityClient.fetch as (q: string) => Promise<unknown>)(`*[_type == "movie"]`),
    ).rejects.toBe(failure)
    expect(errorSpy).toHaveBeenCalledTimes(1)

    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })
})
