import type {ClientConfig} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import type {ResolvedClients} from './resolve-clients'
import {vitePluginSanityClient} from './vite-plugin-sanity-client'

type LogMode = 'dev' | 'build' | 'always' | undefined
type FakeClient = Record<string, unknown>
type VirtualClientModule = {
  sanityClient: FakeClient
  presentationClient: FakeClient
  getClient: (name: string) => FakeClient
}

const singleClient: ResolvedClients = {
  clients: {default: {projectId: 'project-id', dataset: 'dataset-name', apiVersion: 'v2023-08-24'}},
  presentationClientName: 'default',
}

function evaluateVirtualClientModule({
  resolvedClients = singleClient,
  logClientRequests,
  env,
  createClient,
  ssr = true,
}: {
  resolvedClients?: ResolvedClients
  logClientRequests: LogMode
  env: {DEV: boolean; PROD: boolean}
  createClient: (config: ClientConfig) => FakeClient
  /** Vite passes `ssr: true` for server builds and `ssr: false` for browser builds */
  ssr?: boolean
}): VirtualClientModule {
  const plugin = vitePluginSanityClient(resolvedClients, {logClientRequests})
  const pluginHooks = plugin as unknown as {
    resolveId?: (id: string) => string | undefined
    load?: (id: string, options?: {ssr?: boolean}) => string | undefined
  }

  const resolvedId = pluginHooks.resolveId?.('sanity:client')
  if (!resolvedId) {
    throw new Error('Expected sanity:client module to resolve')
  }

  const source = pluginHooks.load?.(resolvedId, {ssr})
  if (typeof source !== 'string') {
    throw new Error('Expected sanity:client virtual module source')
  }

  const executableSource = source
    .replace('import { createClient } from "@sanity/client";', 'const {createClient} = __deps;')
    .replace(/import\.meta\.env\.DEV/g, '__deps.importMeta.env.DEV')
    .replace(/import\.meta\.env\.PROD/g, '__deps.importMeta.env.PROD')
    .replace(
      'export { getClient, presentationClient, sanityClient };',
      'return { getClient, presentationClient, sanityClient };',
    )

  const factory = new Function('__deps', executableSource) as (deps: {
    createClient: (config: ClientConfig) => FakeClient
    importMeta: {env: {DEV: boolean; PROD: boolean}}
  }) => VirtualClientModule

  return factory({
    createClient,
    importMeta: {env},
  })
}

function buildVirtualClientModule(options: {
  logClientRequests: LogMode
  env: {DEV: boolean; PROD: boolean}
  createClient: (config: ClientConfig) => FakeClient
}) {
  return evaluateVirtualClientModule(options).sanityClient
}

describe('vitePluginSanityClient named clients', () => {
  const multipleClients: ResolvedClients = {
    clients: {
      default: {projectId: 'main-project', dataset: 'marketing', apiVersion: 'v2023-08-24'},
      community: {projectId: 'community-project', dataset: 'marketing', apiVersion: 'v2024-01-01'},
    },
    presentationClientName: 'community',
  }

  it('creates one client per name and exposes them through getClient', () => {
    const createClient = vi.fn((config: ClientConfig) => ({config}))

    const module = evaluateVirtualClientModule({
      resolvedClients: multipleClients,
      logClientRequests: undefined,
      env: {DEV: true, PROD: false},
      createClient,
    })

    expect(createClient).toHaveBeenCalledTimes(2)
    expect(createClient).toHaveBeenNthCalledWith(1, multipleClients.clients.default)
    expect(createClient).toHaveBeenNthCalledWith(2, multipleClients.clients.community)
    expect(module.getClient('default')).toBe(module.sanityClient)
    expect(module.getClient('community')).toEqual({config: multipleClients.clients.community})
    expect(module.getClient('community')).not.toBe(module.sanityClient)
  })

  it('exports the client marked for presentation as presentationClient', () => {
    const module = evaluateVirtualClientModule({
      resolvedClients: multipleClients,
      logClientRequests: undefined,
      env: {DEV: true, PROD: false},
      createClient: (config) => ({config}),
    })

    expect(module.presentationClient).toBe(module.getClient('community'))
  })

  it('defaults presentationClient to the default client', () => {
    const module = evaluateVirtualClientModule({
      logClientRequests: undefined,
      env: {DEV: true, PROD: false},
      createClient: (config) => ({config}),
    })

    expect(module.presentationClient).toBe(module.sanityClient)
  })

  it('throws a helpful error for unknown client names', () => {
    const module = evaluateVirtualClientModule({
      resolvedClients: multipleClients,
      logClientRequests: undefined,
      env: {DEV: true, PROD: false},
      createClient: (config) => ({config}),
    })

    expect(() => module.getClient('pioneer')).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@sanity/astro]: Unknown Sanity client "pioneer". Configured clients: "default", "community"]`,
    )
  })

  it('does not resolve prototype properties as clients', () => {
    const module = evaluateVirtualClientModule({
      logClientRequests: undefined,
      env: {DEV: true, PROD: false},
      createClient: (config) => ({config}),
    })

    expect(() => module.getClient('constructor')).toThrow(/Unknown Sanity client "constructor"/)
    expect(() => module.getClient('__proto__')).toThrow(/Unknown Sanity client "__proto__"/)
  })

  it('names the client when its config is rejected by createClient', () => {
    const createClient = vi.fn((config: ClientConfig) => {
      if (config.projectId === 'community-project') {
        throw new Error('Configuration must contain `dataset`')
      }
      return {config}
    })

    expect(() =>
      evaluateVirtualClientModule({
        resolvedClients: multipleClients,
        logClientRequests: undefined,
        env: {DEV: true, PROD: false},
        createClient,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: [@sanity/astro]: Invalid config for Sanity client "community": Configuration must contain \`dataset\`]`,
    )
  })

  describe('browser builds', () => {
    const clientsWithTokens: ResolvedClients = {
      clients: {
        default: {projectId: 'main-project', dataset: 'marketing', token: 'default-token'},
        community: {projectId: 'community-project', dataset: 'marketing'},
        admin: {projectId: 'main-project', dataset: 'marketing', token: 'admin-token'},
      },
      presentationClientName: 'admin',
    }

    it('keeps the tokens of named clients out of the browser bundle', () => {
      const createClient = vi.fn((config: ClientConfig) => ({config}))

      const module = evaluateVirtualClientModule({
        resolvedClients: clientsWithTokens,
        logClientRequests: undefined,
        env: {DEV: true, PROD: false},
        createClient,
        ssr: false,
      })

      // the default client is unchanged, as it was before named clients existed
      expect(createClient).toHaveBeenCalledTimes(2)
      expect(createClient).toHaveBeenCalledWith(clientsWithTokens.clients.default)
      expect(createClient).toHaveBeenCalledWith(clientsWithTokens.clients.community)
      expect(module.sanityClient).toEqual({config: clientsWithTokens.clients.default})
      expect(module.getClient('community')).toEqual({config: clientsWithTokens.clients.community})

      const admin = module.getClient('admin')
      expect(() => admin.fetch).toThrowErrorMatchingInlineSnapshot(
        `[Error: [@sanity/astro]: The Sanity client "admin" is configured with a token or headers and is only available in server code, not in the browser]`,
      )
      expect(() => module.presentationClient.config).toThrow(/only available in server code/)
      // not mistaken for a thenable when a module awaits the import
      expect(admin.then).toBeUndefined()
    })

    it('does not write the tokens of named clients into the browser module source', () => {
      const plugin = vitePluginSanityClient(clientsWithTokens) as unknown as {
        load: (id: string, options?: {ssr?: boolean}) => string | undefined
      }

      const browserSource = plugin.load('\0sanity:client', {ssr: false})
      // A load without options must fail closed: treating a missing `ssr` flag as a server
      // build would put named tokens in the browser bundle.
      const optionlessSource = plugin.load('\0sanity:client')
      const serverSource = plugin.load('\0sanity:client', {ssr: true})

      expect(browserSource).not.toContain('admin-token')
      expect(optionlessSource).not.toContain('admin-token')
      expect(serverSource).toContain('admin-token')
    })

    it('keeps named clients configured with headers out of the browser bundle', () => {
      const clientsWithHeaders: ResolvedClients = {
        clients: {
          default: {projectId: 'main-project', dataset: 'marketing'},
          headerAuth: {
            projectId: 'community-project',
            dataset: 'marketing',
            headers: {Authorization: 'Bearer secret-header'},
          },
        },
        presentationClientName: 'default',
      }
      const plugin = vitePluginSanityClient(clientsWithHeaders) as unknown as {
        load: (id: string, options?: {ssr?: boolean}) => string | undefined
      }

      const browserSource = plugin.load('\0sanity:client', {ssr: false})
      const optionlessSource = plugin.load('\0sanity:client')
      const serverSource = plugin.load('\0sanity:client', {ssr: true})

      expect(browserSource).not.toContain('secret-header')
      expect(optionlessSource).not.toContain('secret-header')
      expect(serverSource).toContain('secret-header')

      const createClient = vi.fn((config: ClientConfig) => ({config}))
      const module = evaluateVirtualClientModule({
        resolvedClients: clientsWithHeaders,
        logClientRequests: undefined,
        env: {DEV: true, PROD: false},
        createClient,
        ssr: false,
      })

      expect(createClient).not.toHaveBeenCalledWith(clientsWithHeaders.clients.headerAuth)
      expect(() => module.getClient('headerAuth').fetch).toThrow(
        /configured with a token or headers/,
      )
    })

    it('creates every client in server builds', () => {
      const createClient = vi.fn((config: ClientConfig) => ({config}))

      const module = evaluateVirtualClientModule({
        resolvedClients: clientsWithTokens,
        logClientRequests: undefined,
        env: {DEV: true, PROD: false},
        createClient,
        ssr: true,
      })

      expect(createClient).toHaveBeenCalledTimes(3)
      expect(module.getClient('admin')).toEqual({config: clientsWithTokens.clients.admin})
      expect(module.presentationClient).toBe(module.getClient('admin'))
    })
  })

  it('labels log lines with the client name for non-default clients', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const createClient = vi.fn(() => ({fetch: vi.fn(async () => [])}))

    const module = evaluateVirtualClientModule({
      resolvedClients: multipleClients,
      logClientRequests: 'always',
      env: {DEV: false, PROD: true},
      createClient,
    })

    await (module.getClient('community').fetch as (q: string) => Promise<unknown>)('*[]')
    await (module.sanityClient.fetch as (q: string) => Promise<unknown>)('*[]')

    expect(infoSpy).toHaveBeenCalledTimes(2)
    expect(String(infoSpy.mock.calls[0]?.[1])).toContain('[sanity:client:community]')
    expect(String(infoSpy.mock.calls[1]?.[1])).toContain('[sanity:client]')
    expect(String(infoSpy.mock.calls[1]?.[1])).not.toContain('[sanity:client:')

    infoSpy.mockRestore()
  })
})

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
      const result = await (
        sanityClient.fetch as (
          q: string,
          p: Record<string, string>,
          options: {filterResponse: boolean},
        ) => Promise<unknown>
      )(query, params, {filterResponse: false})

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
    const result = await (
      sanityClient.request as (arg: Record<string, string>) => Promise<unknown>
    )(requestArgs[0])

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
