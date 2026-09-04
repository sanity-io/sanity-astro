import type {QueryParams, SanityClient} from '@sanity/client'
import type {LiveLoader} from 'astro/loaders'

export type SanityLiveEntryBy = 'id' | 'slug'

/** Flat GROQ parameters; `getLiveCollection('movies', {since: '2020'})` binds `$since`. */
export type SanityLiveCollectionFilter = QueryParams

/** `{id}` or `{slug}` depending on the loader's `entryBy`, plus any extra GROQ parameters. */
export type SanityLiveEntryFilter<TEntryBy extends SanityLiveEntryBy = 'id'> =
  (TEntryBy extends 'slug' ? {slug: string} : {id: string}) & QueryParams

export interface SanityLiveLoaderOptions {
  /** Defaults to the `sanity:client` instance. Pass a draft-aware client for Draft Mode. */
  client?: SanityClient
}

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
 * `TEntryBy` is a phantom parameter: the entry query already decides whether `$id` or `$slug`
 * is bound, so it only selects the filter type the generated `sanity:loader` typings expose.
 */
export function createSanityLiveLoader<
  TData extends Record<string, unknown>,
  TEntryBy extends SanityLiveEntryBy = 'id',
>(
  config: CreateSanityLiveLoaderConfig,
): LiveLoader<TData, SanityLiveEntryFilter<TEntryBy>, SanityLiveCollectionFilter> {
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
        return {entries, cacheHint: {tags: syncTags ?? [`sanity:${name}`]}}
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
