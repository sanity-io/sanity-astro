import {mkdtemp, rm, writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it, vi} from 'vitest'
import {z} from 'astro/zod'
import {setSharedSanityClientConfig} from './shared-client-config'

const {createClientMock} = vi.hoisted(() => {
  return {
    createClientMock: vi.fn(),
  }
})

vi.mock('@sanity/client', () => {
  return {
    createClient: createClientMock,
  }
})

import {sanityCollectionLoader, sanityCollectionTypeLoaders} from './content-loader'

type DataEntry = {
  id: string
  data: unknown
  digest?: string
}

function createStore() {
  const entries = new Map<string, DataEntry>()
  return {
    get(key: string) {
      return entries.get(key)
    },
    set(entry: DataEntry) {
      const existing = entries.get(entry.id)
      if (existing?.digest && entry.digest && existing.digest === entry.digest) {
        return false
      }
      entries.set(entry.id, entry)
      return true
    },
    keys() {
      return Array.from(entries.keys())
    },
    delete(key: string) {
      entries.delete(key)
    },
    values() {
      return Array.from(entries.values())
    },
  }
}

function createMeta() {
  const values = new Map<string, unknown>()
  return {
    get(key: string) {
      return values.get(key)
    },
    set(key: string, value: unknown) {
      values.set(key, value)
    },
  }
}

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createLoadContext(
  store: ReturnType<typeof createStore>,
  meta: ReturnType<typeof createMeta>,
  logger: ReturnType<typeof createLogger>,
  refreshContextData: Record<string, unknown> = {},
) {
  return {
    store,
    meta,
    logger,
    refreshContextData,
    parseData: vi.fn(async ({data}) => data),
    generateDigest: vi.fn((data: unknown) => JSON.stringify(data)),
  }
}

afterEach(() => {
  vi.clearAllMocks()
  setSharedSanityClientConfig(undefined)
})

describe('sanityCollectionLoader', () => {
  it('uses digests for no-op updates and deletes stale entries in full mode', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce([
        {_id: 'movie-1', title: 'Alien'},
        {_id: 'movie-2', title: 'Aliens'},
      ])
      .mockResolvedValueOnce([{_id: 'movie-1', title: 'Alien'}])

    createClientMock.mockReturnValue({fetch: fetchMock})

    const loader = sanityCollectionLoader({
      client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
      query: '*[_type == "movie"]',
    })

    const store = createStore()
    const meta = createMeta()
    const logger = createLogger()

    const firstContext = createLoadContext(store, meta, logger)
    await loader.load(firstContext as never)

    expect(store.keys().sort()).toEqual(['movie-1', 'movie-2'])

    const secondContext = createLoadContext(store, meta, logger)
    await loader.load(secondContext as never)

    expect(store.keys()).toEqual(['movie-1'])
    expect(logger.info).toHaveBeenCalled()
    expect(logger.info.mock.calls.at(-1)?.[0]).toContain('(0 changed)')
  })

  it('stores and reuses incremental cursors via meta', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce([{_id: 'movie-1', _updatedAt: '2024-01-01T00:00:00Z'}])
      .mockResolvedValueOnce([{_id: 'movie-2', _updatedAt: '2024-01-02T00:00:00Z'}])

    createClientMock.mockReturnValue({fetch: fetchMock})

    const loader = sanityCollectionLoader({
      client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
      query: '*[_type == "movie"]',
      refresh: {
        strategy: 'incremental',
      },
    })

    const store = createStore()
    const meta = createMeta()
    const logger = createLogger()

    await loader.load(createLoadContext(store, meta, logger) as never)
    await loader.load(createLoadContext(store, meta, logger) as never)

    expect(fetchMock.mock.calls[0]?.[1]).toEqual({})
    expect(fetchMock.mock.calls[1]?.[1]).toEqual({since: '2024-01-01T00:00:00Z'})
    expect(meta.get('sanity-loader-cursor')).toBe('2024-01-02T00:00:00Z')
  })

  it('supports explicit createSchema configuration', async () => {
    createClientMock.mockReturnValue({fetch: vi.fn().mockResolvedValue([])})

    const expectedSchema = z.object({
      title: z.string(),
    })

    const loader = sanityCollectionLoader({
      client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
      query: '*[_type == "movie"]',
      schema: {
        schema: expectedSchema,
        entryType: '{title: string}',
      },
    })

    const created = await loader.createSchema?.()
    expect(created?.schema).toBe(expectedSchema)
    expect(created?.types).toContain('export type Entry = {title: string}')
  })

  it('loads schema types from typegen output and allows zod converter hook', async () => {
    createClientMock.mockReturnValue({fetch: vi.fn().mockResolvedValue([])})

    const tempDir = await mkdtemp(join(tmpdir(), 'sanity-loader-'))
    const typesPath = join(tempDir, 'sanity.types.ts')
    await writeFile(
      typesPath,
      [
        'export interface Movie {',
        '  _id: string',
        '  title?: string',
        '}',
        '',
      ].join('\n'),
    )

    try {
      const loader = sanityCollectionLoader({
        client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
        query: '*[_type == "movie"]',
        schema: {
          typegen: {
            typesPath,
            zodFromTypegen: ({inferredEntryTypeName}) => {
              expect(inferredEntryTypeName).toBe('Movie')
              return z.object({_id: z.string()})
            },
          },
        },
      })

      const created = await loader.createSchema?.()
      expect(created?.schema).toBeDefined()
      expect(created?.types).toContain('export interface Movie')
      expect(created?.types).toContain('export type Entry = Movie')
    } finally {
      await rm(tempDir, {recursive: true, force: true})
    }
  })

  it('resolves shallow references in batches', async () => {
    const fetchMock = vi.fn(async (query: string, params?: Record<string, unknown>) => {
      if (query === '*[_type == "movie"]') {
        return [{_id: 'movie-1', director: {_type: 'reference', _ref: 'person-1'}}]
      }
      if (query === '*[_id in $ids]') {
        expect(params?.ids).toEqual(['person-1'])
        return [{_id: 'person-1', name: 'Ridley Scott'}]
      }
      return []
    })

    createClientMock.mockReturnValue({fetch: fetchMock})

    const loader = sanityCollectionLoader({
      client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
      query: '*[_type == "movie"]',
      references: {
        mode: 'shallow',
      },
    })

    const store = createStore()
    const meta = createMeta()
    const logger = createLogger()
    await loader.load(createLoadContext(store, meta, logger) as never)

    const entry = store.get('movie-1')
    const entryData = entry?.data as {director: {_id: string; name: string}}
    expect(entryData.director._id).toBe('person-1')
    expect(entryData.director.name).toBe('Ridley Scott')
  })
})

describe('sanityCollectionTypeLoaders', () => {
  it('splits one shared fetch into per-type collection loaders', async () => {
    const fetchMock = vi.fn(async (query: string) => {
      if (query === '*[_type in $types]') {
        return [
          {_id: 'movie-1', _type: 'movie', title: 'Alien'},
          {_id: 'person-1', _type: 'person', name: 'Ridley Scott'},
        ]
      }
      return []
    })

    createClientMock.mockReturnValue({fetch: fetchMock})

    const loaders = sanityCollectionTypeLoaders({
      client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
      collections: {
        movies: {
          sanityType: 'movie',
          schema: {
            schema: z.object({_id: z.string(), _type: z.literal('movie'), title: z.string()}),
          },
        },
        people: {
          sanityType: 'person',
          schema: {
            schema: z.object({_id: z.string(), _type: z.literal('person'), name: z.string()}),
          },
        },
      },
    })

    const moviesStore = createStore()
    const peopleStore = createStore()
    const moviesMeta = createMeta()
    const peopleMeta = createMeta()
    const moviesLogger = createLogger()
    const peopleLogger = createLogger()

    await loaders.movies.load(createLoadContext(moviesStore, moviesMeta, moviesLogger) as never)
    await loaders.people.load(createLoadContext(peopleStore, peopleMeta, peopleLogger) as never)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(moviesStore.get('movie-1')?.data).toEqual({_id: 'movie-1', _type: 'movie', title: 'Alien'})
    expect(peopleStore.get('person-1')?.data).toEqual({
      _id: 'person-1',
      _type: 'person',
      name: 'Ridley Scott',
    })
  })

  it('uses shared integration client config when client is omitted', async () => {
    const fetchMock = vi.fn().mockResolvedValue([{_id: 'movie-1', _type: 'movie'}])
    createClientMock.mockReturnValue({fetch: fetchMock})
    setSharedSanityClientConfig({
      projectId: 'shared-project',
      dataset: 'shared-dataset',
      apiVersion: '2024-01-01',
    })

    const loaders = sanityCollectionTypeLoaders({
      collections: {
        movies: {
          sanityType: 'movie',
        },
      },
    })

    const store = createStore()
    const meta = createMeta()
    const logger = createLogger()
    await loaders.movies.load(createLoadContext(store, meta, logger) as never)

    expect(createClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'shared-project',
        dataset: 'shared-dataset',
      }),
    )
    expect(store.get('movie-1')).toBeDefined()
  })

  it('supports global typegen schema for all collections', async () => {
    const fetchMock = vi.fn().mockResolvedValue([])
    createClientMock.mockReturnValue({fetch: fetchMock})

    const tempDir = await mkdtemp(join(tmpdir(), 'sanity-loader-global-'))
    const typesPath = join(tempDir, 'sanity.types.ts')
    await writeFile(
      typesPath,
      [
        'export interface Movie {',
        '  _id: string',
        '}',
        'export interface Person {',
        '  _id: string',
        '}',
        '',
      ].join('\n'),
    )

    try {
      const loaders = sanityCollectionTypeLoaders({
        client: {projectId: 'pid', dataset: 'production', apiVersion: '2024-01-01'},
        globalTypegen: {
          typesPath,
          zodFromTypegen: () => z.object({}).passthrough(),
        },
        collections: {
          movies: {sanityType: 'movie'},
          people: {sanityType: 'person'},
        },
      })

      const movieSchema = await loaders.movies.createSchema()
      const peopleSchema = await loaders.people.createSchema()

      expect(movieSchema.types).toContain('export type Entry = Movie')
      expect(peopleSchema.types).toContain('export type Entry = Person')
    } finally {
      await rm(tempDir, {recursive: true, force: true})
    }
  })
})
