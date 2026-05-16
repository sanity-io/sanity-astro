import {describe, expect, it, vi} from 'vitest'
import type {SanityClient} from '@sanity/client'
import {sanityLiveLoader} from './sanity-live-loader'

function createClientMock() {
  return {
    fetch: vi.fn(),
  } as unknown as SanityClient
}

function readCollectionLastModified(result: unknown): Date | undefined {
  return (result as {entries: Array<{cacheHint: {lastModified?: Date}}>}).entries[0].cacheHint.lastModified
}

describe('sanityLiveLoader visual editing fetch behavior', () => {
  it('uses the default fetch response when visual editing is disabled', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce([{_id: 'movie-1', _updatedAt: '2026-01-01T00:00:00.000Z', title: 'Movie'}])

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
    })

    const result = await loader.loadCollection({filter: undefined})

    expect(fetchMock).toHaveBeenCalledWith('*[_type == "movie"]', {}, undefined)
    expect(result).toMatchObject({
      entries: [{id: 'movie-1'}],
      cacheHint: {tags: ['sanity-movie']},
    })
  })

  it('requests stega-enabled preview fetch options when visual editing is enabled', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce({
      result: [{_id: 'movie-2', _updatedAt: '2026-01-01T00:00:00.000Z', title: 'Movie 2'}],
      resultSourceMap: {},
    })

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
      visualEditing: {
        enabled: true,
        token: 'preview-token',
      },
    })

    const result = await loader.loadCollection({filter: {params: {limit: 10}}})

    expect(fetchMock).toHaveBeenCalledWith('*[_type == "movie"]', {limit: 10}, {
      filterResponse: false,
      perspective: 'drafts',
      resultSourceMap: 'withKeyArraySelector',
      stega: true,
      token: 'preview-token',
      useCdn: false,
    })
    expect(result).toMatchObject({
      entries: [{id: 'movie-2'}],
    })
  })

  it('normalizes source-map response envelope for loadEntry', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce({
      result: {_id: 'movie-3', _updatedAt: '2026-01-01T00:00:00.000Z', title: 'Movie 3'},
      resultSourceMap: {},
    })

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
      visualEditing: {
        enabled: true,
        token: 'preview-token',
        perspective: 'drafts',
      },
    })

    const result = await loader.loadEntry({filter: {id: 'movie-3', params: {locale: 'en'}}})

    expect(fetchMock).toHaveBeenCalledWith('*[_type == "movie" && _id == $id][0]', {locale: 'en', id: 'movie-3'}, {
      filterResponse: false,
      perspective: 'drafts',
      resultSourceMap: 'withKeyArraySelector',
      stega: true,
      token: 'preview-token',
      useCdn: false,
    })
    expect(result).toMatchObject({
      id: 'movie-3',
      data: {title: 'Movie 3'},
    })
  })

  it('returns a descriptive error when preview token is missing', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
      visualEditing: {
        enabled: true,
      },
    })

    const result = await loader.loadCollection({filter: undefined})

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      error: expect.any(Error),
    })
    expect(result?.error?.message).toContain('Failed to load Sanity collection "movie"')
    expect((result?.error as Error).cause).toBeInstanceOf(Error)
    expect(((result?.error as Error).cause as Error).message).toContain('requires a "visualEditing.token"')
  })
})

describe('sanityLiveLoader mapping and cache behavior', () => {
  it('merges default query params with filter params', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce([{_id: 'movie-4'}])

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
      queryParams: {locale: 'en', limit: 5},
    })

    await loader.loadCollection({filter: {params: {limit: 10, sort: 'desc'}}})

    expect(fetchMock).toHaveBeenCalledWith(
      '*[_type == "movie"]',
      {locale: 'en', limit: 10, sort: 'desc'},
      undefined,
    )
  })

  it('supports mapData and mapId for collection entries', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce([
      {_id: 'movie-5', slug: 'blade-runner', title: 'Blade Runner', _updatedAt: '2026-01-01T00:00:00.000Z'},
    ])

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
      mapData: (document) => ({
        id: String(document.slug),
        title: String(document.title),
        _updatedAt: String(document._updatedAt),
      }),
      mapId: (document) => String(document.id),
    })

    const result = await loader.loadCollection({filter: undefined})

    expect(result).toMatchObject({
      entries: [
        {
          id: 'blade-runner',
          data: {title: 'Blade Runner'},
          cacheHint: {tags: ['sanity-movie', 'sanity-movie:blade-runner']},
        },
      ],
    })
    expect(readCollectionLastModified(result)).toEqual(new Date('2026-01-01T00:00:00.000Z'))
  })

  it('uses _id as the enforced fallback identifier', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce([
      {_id: 'arrival', slug: 'arrival', title: 'Arrival', _updatedAt: '2026-02-02T10:00:00.000Z'},
    ])

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
    })

    const result = await loader.loadCollection({filter: undefined})

    expect(result).toMatchObject({
      entries: [
        {
          id: 'arrival',
          cacheHint: {tags: ['sanity-movie', 'sanity-movie:arrival']},
        },
      ],
    })
    expect(readCollectionLastModified(result)).toEqual(new Date('2026-02-02T10:00:00.000Z'))
  })

  it('returns undefined for loadEntry when no document matches', async () => {
    const client = createClientMock()
    const fetchMock = vi.mocked(client.fetch)
    fetchMock.mockResolvedValueOnce(null)

    const loader = sanityLiveLoader({
      client,
      collectionName: 'movie',
      collectionQuery: '*[_type == "movie"]',
      entryQuery: '*[_type == "movie" && _id == $id][0]',
    })

    const result = await loader.loadEntry({filter: {id: 'missing'}})

    expect(fetchMock).toHaveBeenCalledWith('*[_type == "movie" && _id == $id][0]', {id: 'missing'}, undefined)
    expect(result).toBeUndefined()
  })
})
