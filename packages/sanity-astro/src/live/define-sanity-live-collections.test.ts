import {describe, expect, it, vi} from 'vitest'
import type {SanityClient} from '@sanity/client'
import {z} from 'astro/zod'
import {defineSanityLiveCollections} from './define-sanity-live-collections'

function createClientMock() {
  return {
    fetch: vi.fn(async () => []),
  } as unknown as SanityClient
}

describe('defineSanityLiveCollections', () => {
  it('builds a loader and schema record by collection name', () => {
    const movieSchema = z.object({
      _id: z.string(),
      title: z.string(),
    })
    const personSchema = z.object({
      _id: z.string(),
      name: z.string(),
    })

    const collections = defineSanityLiveCollections({
      client: createClientMock(),
      collections: [
        {
          name: 'movie',
          schema: movieSchema,
          loader: {
            collectionQuery: '*[_type == "movie"]',
            entryQuery: '*[_type == "movie" && _id == $id][0]',
          },
        },
        {
          name: 'person',
          schema: personSchema,
          loader: {
            collectionQuery: '*[_type == "person"]',
            entryQuery: '*[_type == "person" && _id == $id][0]',
          },
        },
      ] as const,
    })

    expect(Object.keys(collections)).toEqual(['movie', 'person'])
    expect(collections.movie.schema).toBe(movieSchema)
    expect(collections.person.schema).toBe(personSchema)
    expect(collections.movie.loader.name).toBe('sanity-live-loader:movie')
    expect(collections.person.loader.name).toBe('sanity-live-loader:person')
  })

  it('throws when duplicate collection names are provided', () => {
    const movieSchema = z.object({
      _id: z.string(),
    })

    expect(() =>
      defineSanityLiveCollections({
        client: createClientMock(),
        collections: [
          {
            name: 'movie',
            schema: movieSchema,
            loader: {
              collectionQuery: '*[_type == "movie"]',
              entryQuery: '*[_type == "movie" && _id == $id][0]',
            },
          },
          {
            name: 'movie',
            schema: movieSchema,
            loader: {
              collectionQuery: '*[_type == "movie"]',
              entryQuery: '*[_type == "movie" && _id == $id][0]',
            },
          },
        ] as const,
      }),
    ).toThrow('Duplicate Sanity live collection name "movie"')
  })

  it('applies top-level visualEditing defaults to collection loaders', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValue({
      result: [],
      resultSourceMap: {},
    })

    const movieSchema = z.object({
      _id: z.string(),
    })

    const collections = defineSanityLiveCollections({
      client,
      visualEditing: {
        enabled: true,
        token: 'preview-token',
      },
      collections: [
        {
          name: 'movie',
          schema: movieSchema,
          loader: {
            collectionQuery: '*[_type == "movie"]',
            entryQuery: '*[_type == "movie" && _id == $id][0]',
          },
        },
      ] as const,
    })

    await collections.movie.loader.loadCollection({filter: undefined})

    expect(fetchMock).toHaveBeenCalledWith('*[_type == "movie"]', {}, {
      filterResponse: false,
      perspective: 'drafts',
      resultSourceMap: 'withKeyArraySelector',
      stega: true,
      token: 'preview-token',
      useCdn: false,
    })
  })

  it('lets per-collection visualEditing override top-level defaults', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValue({
      result: [],
      resultSourceMap: {},
    })

    const movieSchema = z.object({
      _id: z.string(),
    })

    const collections = defineSanityLiveCollections({
      client,
      visualEditing: {
        enabled: true,
        token: 'default-token',
        perspective: 'drafts',
      },
      collections: [
        {
          name: 'movie',
          schema: movieSchema,
          loader: {
            collectionQuery: '*[_type == "movie"]',
            entryQuery: '*[_type == "movie" && _id == $id][0]',
            visualEditing: {
              token: 'override-token',
              perspective: 'published',
              useCdn: true,
            },
          },
        },
      ] as const,
    })

    await collections.movie.loader.loadCollection({filter: undefined})

    expect(fetchMock).toHaveBeenCalledWith('*[_type == "movie"]', {}, {
      filterResponse: false,
      perspective: 'published',
      resultSourceMap: 'withKeyArraySelector',
      stega: true,
      token: 'override-token',
      useCdn: true,
    })
  })
})
