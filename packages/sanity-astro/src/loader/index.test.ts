import type {SanityClient} from '@sanity/client'
import {describe, expect, it, vi} from 'vitest'

import {createSanityLiveLoader} from './index'

const collectionQuery = '*[_type == "movie"] {title, _id, _updatedAt}'
const entryQuery = '*[_type == "movie" && _id == $id][0] {title, _id, _updatedAt}'

type Movie = {_id: string; _updatedAt: string; title: string | null}

function fakeClient(response: unknown) {
  const fetch = vi.fn(async () =>
    response instanceof Error ? Promise.reject(response) : (response as never),
  )
  return {client: {fetch} as unknown as SanityClient, fetch}
}

function loader(response: unknown) {
  const {client, fetch} = fakeClient(response)
  return {
    loader: createSanityLiveLoader<Movie>({name: 'movie', collectionQuery, entryQuery, client}),
    fetch,
  }
}

describe('createSanityLiveLoader', () => {
  it('is named after the loader key', () => {
    expect(loader({result: []}).loader.name).toBe('sanity:movie')
  })

  it('maps documents to entries with per-entry cache hints', async () => {
    const {loader: movies, fetch} = loader({
      result: [
        {_id: 'a', _updatedAt: '2024-01-02T03:04:05Z', title: 'Alien'},
        {_id: 'b', _updatedAt: 'not a date', title: null},
        {_updatedAt: '2024-01-02T03:04:05Z', title: 'no id'},
      ],
      syncTags: ['s1:abc', 's1:def'],
    })

    const result = await movies.loadCollection({collection: 'movies'})

    expect(fetch).toHaveBeenCalledWith(collectionQuery, {}, {filterResponse: false})
    expect(result).toEqual({
      entries: [
        {
          id: 'a',
          data: {_id: 'a', _updatedAt: '2024-01-02T03:04:05Z', title: 'Alien'},
          cacheHint: {
            tags: ['sanity:movie', 'sanity:movie:a'],
            lastModified: new Date('2024-01-02T03:04:05Z'),
          },
        },
        {
          id: 'b',
          data: {_id: 'b', _updatedAt: 'not a date', title: null},
          cacheHint: {tags: ['sanity:movie', 'sanity:movie:b']},
        },
      ],
      cacheHint: {tags: ['s1:abc', 's1:def']},
    })
  })

  it('falls back to a collection tag when the API returns no syncTags', async () => {
    const {loader: movies} = loader({result: []})
    expect(await movies.loadCollection({collection: 'movies'})).toEqual({
      entries: [],
      cacheHint: {tags: ['sanity:movie']},
    })
  })

  it('forwards collection filters as GROQ params', async () => {
    const {loader: movies, fetch} = loader({result: []})
    await movies.loadCollection({collection: 'movies', filter: {since: '2020'}})
    expect(fetch).toHaveBeenCalledWith(collectionQuery, {since: '2020'}, {filterResponse: false})
  })

  it('loads a single entry with the filter as params', async () => {
    const {loader: movies, fetch} = loader({
      result: {_id: 'a', _updatedAt: '2024-01-02T03:04:05Z', title: 'Alien'},
    })

    const entry = await movies.loadEntry({collection: 'movies', filter: {id: 'a', lang: 'en'}})

    expect(fetch).toHaveBeenCalledWith(entryQuery, {id: 'a', lang: 'en'}, {filterResponse: false})
    expect(entry).toEqual({
      id: 'a',
      data: {_id: 'a', _updatedAt: '2024-01-02T03:04:05Z', title: 'Alien'},
      cacheHint: {
        tags: ['sanity:movie', 'sanity:movie:a'],
        lastModified: new Date('2024-01-02T03:04:05Z'),
      },
    })
  })

  it('forwards slug filters untouched', async () => {
    const {client, fetch} = fakeClient({result: null})
    const people = createSanityLiveLoader<Movie, 'slug'>({
      name: 'person',
      collectionQuery,
      entryQuery: '*[_type == "person" && slug.current == $slug][0] {..., _id, _updatedAt}',
      client,
    })
    await people.loadEntry({collection: 'people', filter: {slug: 'ridley-scott'}})
    expect(fetch).toHaveBeenCalledWith(
      '*[_type == "person" && slug.current == $slug][0] {..., _id, _updatedAt}',
      {slug: 'ridley-scott'},
      {filterResponse: false},
    )
  })

  it('returns undefined when the entry query yields null', async () => {
    const {loader: movies} = loader({result: null})
    expect(await movies.loadEntry({collection: 'movies', filter: {id: 'missing'}})).toBeUndefined()
  })

  it('wraps fetch failures in an error with the cause attached', async () => {
    const failure = new Error('boom')
    const {loader: movies} = loader(failure)

    const collection = await movies.loadCollection({collection: 'movies'})
    const entry = await movies.loadEntry({collection: 'movies', filter: {id: 'a'}})

    expect(collection).toMatchObject({error: expect.any(Error)})
    expect((collection as {error: Error}).error.message).toBe(
      'Failed to load Sanity collection "movie"',
    )
    expect((collection as {error: Error}).error.cause).toBe(failure)
    expect((entry as {error: Error}).error.message).toBe('Failed to load Sanity entry "movie"')
    expect((entry as {error: Error}).error.cause).toBe(failure)
  })
})
