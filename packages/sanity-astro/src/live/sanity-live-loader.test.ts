import {describe, expect, it, vi} from 'vitest'
import type {SanityClient} from '@sanity/client'
import {sanityLiveLoader} from './sanity-live-loader'

function createClientMock() {
  return {
    fetch: vi.fn(),
  } as unknown as SanityClient
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
