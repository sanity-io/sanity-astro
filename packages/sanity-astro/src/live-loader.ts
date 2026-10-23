import type {QueryParams, SanityClient} from '@sanity/client'
import type {LiveLoader} from 'astro/loaders'

/**
 * Flat GROQ parameters; `getLiveCollection('movies', {since: '2020'})` binds `$since`.
 * @experimental
 */
export type SanityLiveCollectionFilter = QueryParams

/**
 * `{id}` plus any extra GROQ parameters. Astro turns `getLiveEntry('movies', 'abc')` into
 * `{id: 'abc'}`, so every entry query binds `$id` whatever field it matches against.
 * @experimental
 */
export type SanityLiveEntryFilter = {id: string} & QueryParams

/** @experimental */
export interface SanityLiveLoaderOptions {
  /** Defaults to the `sanity:client` instance. Pass a draft-aware client for Draft Mode. */
  client?: SanityClient
}

/** @experimental */
export interface CreateSanityLiveLoaderConfig {
  name: string
  collectionQuery: string
  entryQuery: string
  client: SanityClient
}

interface SanityLiveEntry<TData> {
  id: string
  data: TData
  cacheHint: {tags: string[]; lastModified?: Date}
}

function lastModified(value: unknown): Date | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function toEntry<TData extends Record<string, unknown>>(
  name: string,
  document: TData,
): SanityLiveEntry<TData> | undefined {
  const id = document._id
  if (typeof id !== 'string') {
    return undefined
  }
  const modified = lastModified(document._updatedAt)
  return {
    id,
    data: document,
    cacheHint: {
      tags: [`sanity:${name}`, `sanity:${name}:${id}`],
      ...(modified ? {lastModified: modified} : {}),
    },
  }
}

function loadError(name: string, what: string, cause: unknown): {error: Error} {
  return {error: new Error(`Failed to load Sanity ${what} "${name}"`, {cause})}
}

/**
 * Builds an Astro live loader over a Sanity collection query and entry query. The generated
 * `sanity:loader` module calls this for every `experimental_live.loaders` entry.
 * @experimental Part of the opt-in live collections feature; the signature may change in minor releases.
 */
export function createSanityLiveLoader<TData extends Record<string, unknown>>(
  config: CreateSanityLiveLoaderConfig,
): LiveLoader<TData, SanityLiveEntryFilter, SanityLiveCollectionFilter> {
  const {name, collectionQuery, entryQuery, client} = config
  return {
    name: `sanity:${name}`,
    async loadCollection({filter}) {
      try {
        const {result, syncTags} = await client.fetch<TData[]>(collectionQuery, filter ?? {}, {
          filterResponse: false,
        })
        const entries: SanityLiveEntry<TData>[] = []
        for (const document of result) {
          const entry = toEntry(name, document)
          if (entry) {
            entries.push(entry)
          }
        }
        // The collection tag stays alongside Content Lake's sync tags so a purge by
        // `sanity:<name>` also drops the collection response, not only its entries.
        return {entries, cacheHint: {tags: [`sanity:${name}`, ...(syncTags ?? [])]}}
      } catch (cause) {
        return loadError(name, 'collection', cause)
      }
    },
    async loadEntry({filter}) {
      try {
        const {result} = await client.fetch<TData | null>(entryQuery, filter, {
          filterResponse: false,
        })
        return result === null ? undefined : toEntry(name, result)
      } catch (cause) {
        return loadError(name, 'entry', cause)
      }
    },
  }
}
