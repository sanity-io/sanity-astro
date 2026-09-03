import type {SanityClient} from '@sanity/client'
import type {LoaderContext} from 'astro/loaders'
import {describe, expect, it, vi} from 'vitest'

import {sanityLoader} from './loader'

type StoredEntry = {id: string; data: Record<string, unknown>; digest?: string}

function createContext(): LoaderContext & {entries: Map<string, StoredEntry>} {
  const entries = new Map<string, StoredEntry>()
  const store = {
    clear: () => entries.clear(),
    set: (entry: StoredEntry) => {
      entries.set(entry.id, entry)
      return true
    },
  }
  return {
    entries,
    store,
    logger: {info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn()},
    parseData: async ({data}) => data,
    generateDigest: (data) => JSON.stringify(data),
  } as unknown as LoaderContext & {entries: Map<string, StoredEntry>}
}

function createClient(results: unknown) {
  const fetch = vi.fn().mockResolvedValue(results)
  return {client: {fetch} as unknown as SanityClient, fetch}
}

describe('sanityLoader', () => {
  it('stores every document under its _id with a content digest', async () => {
    const {client, fetch} = createClient([
      {_id: 'a', title: 'A'},
      {_id: 'b', title: 'B'},
    ])
    const context = createContext()

    await sanityLoader({client, query: '*[_type == "movie"]', params: {limit: 2}}).load(context)

    expect(fetch).toHaveBeenCalledWith('*[_type == "movie"]', {limit: 2})
    expect([...context.entries.values()]).toEqual([
      {id: 'a', data: {_id: 'a', title: 'A'}, digest: '{"_id":"a","title":"A"}'},
      {id: 'b', data: {_id: 'b', title: 'B'}, digest: '{"_id":"b","title":"B"}'},
    ])
    expect(context.logger.info).toHaveBeenCalledWith('Loaded 2 documents')
  })

  it('uses the id callback to address entries by slug', async () => {
    const {client} = createClient([{_id: 'a', slug: {current: 'walle'}}])
    const context = createContext()

    await sanityLoader<{_id: string; slug: {current: string}}>({
      client,
      query: '*',
      id: (movie) => movie.slug.current,
    }).load(context)

    expect([...context.entries.keys()]).toEqual(['walle'])
  })

  it('drops entries that disappeared from the query result', async () => {
    const context = createContext()
    context.store.set({id: 'stale', data: {_id: 'stale'}})
    const {client} = createClient([{_id: 'fresh'}])

    await sanityLoader({client, query: '*'}).load(context)

    expect([...context.entries.keys()]).toEqual(['fresh'])
  })

  it('runs documents through parseData so collection schemas apply', async () => {
    const {client} = createClient([{_id: 'a', title: 'A'}])
    const context = createContext()
    context.parseData = vi.fn(async ({data}) => ({...data, parsed: true}))

    await sanityLoader({client, query: '*'}).load(context)

    expect(context.parseData).toHaveBeenCalledWith({id: 'a', data: {_id: 'a', title: 'A'}})
    expect(context.entries.get('a')?.data).toEqual({_id: 'a', title: 'A', parsed: true})
  })

  it('rejects queries that do not return an array', async () => {
    const {client} = createClient({_id: 'single'})

    await expect(sanityLoader({client, query: '*[0]'}).load(createContext())).rejects.toThrow(
      /array of documents, got object/,
    )
  })

  it('rejects documents without a string _id', async () => {
    const {client} = createClient([{title: 'no id'}])

    await expect(sanityLoader({client, query: '*'}).load(createContext())).rejects.toThrow(
      /string `_id`/,
    )
  })
})
