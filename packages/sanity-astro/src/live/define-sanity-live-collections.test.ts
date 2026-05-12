import {describe, expect, it} from 'vitest'
import type {SanityClient} from '@sanity/client'
import {z} from 'astro/zod'
import {defineSanityLiveCollections} from './define-sanity-live-collections'

function createClientMock() {
  return {
    fetch: async () => [],
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
})
