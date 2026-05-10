import {createClient, type ClientConfig, type SanityClient} from '@sanity/client'
import type {LiveLoader} from 'astro/loaders'
import type {QueryParams} from 'sanity'

export type SanityClientInput = SanityClient | ClientConfig | (() => SanityClient)

export interface SanityLiveEntryFilter {
  id?: string
  slug?: string
  params?: QueryParams
}

export interface SanityLiveCollectionFilter {
  params?: QueryParams
}

export interface SanityLiveLoaderOptions<TData extends Record<string, unknown>> {
  client: SanityClientInput
  collectionName?: string
  collectionQuery: string
  entryQuery: string
  idField?: string
  queryParams?: QueryParams
  mapData?: (document: Record<string, unknown>) => TData
  mapId?: (document: Record<string, unknown>) => string
  cacheTagPrefix?: string
  lastModifiedField?: string
}

export function resolveSanityClient(input: SanityClientInput): SanityClient {
  if (typeof input === 'function') {
    return input()
  }

  if (isSanityClient(input)) {
    return input
  }

  return createClient(input)
}

function isSanityClient(input: unknown): input is SanityClient {
  return Boolean(input) && typeof input === 'object' && typeof (input as SanityClient).fetch === 'function'
}

function coerceDate(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return undefined
}

export function sanityLiveLoader<TData extends Record<string, unknown>>(
  options: SanityLiveLoaderOptions<TData>,
): LiveLoader<TData, SanityLiveEntryFilter, SanityLiveCollectionFilter> {
  const client = resolveSanityClient(options.client)
  const collectionQuery = requireQuery(options.collectionQuery, 'collectionQuery', options.collectionName)
  const entryQuery = requireQuery(options.entryQuery, 'entryQuery', options.collectionName)
  const idField = options.idField ?? '_id'
  const loaderIdentity = options.collectionName ?? 'collection'
  const cacheTagPrefix = options.cacheTagPrefix ?? `sanity-${loaderIdentity}`
  const lastModifiedField = options.lastModifiedField ?? '_updatedAt'

  return {
    name: `sanity-live-loader:${loaderIdentity}`,
    loadCollection: async ({filter}) => {
      try {
        const params = {
          ...(options.queryParams ?? {}),
          ...(filter?.params ?? {}),
        }
        const documents = await client.fetch<Array<Record<string, unknown>>>(collectionQuery, params)

        const entries = documents
          .map((document) => mapDocument(document, options.mapData))
          .map((data): {id: string; data: TData; cacheHint: {tags: string[]; lastModified?: Date}} | undefined => {
            const id = options.mapId?.(data) ?? extractString(data[idField]) ?? extractString(data._id)
            if (!id) {
              return undefined
            }

            const tags = [cacheTagPrefix, `${cacheTagPrefix}:${id}`]
            const lastModified = coerceDate(data[lastModifiedField])

            return {
              id,
              data,
              cacheHint: {
                tags,
                ...(lastModified ? {lastModified} : {}),
              },
            }
          })
          .filter(
            (entry): entry is {id: string; data: TData; cacheHint: {tags: string[]; lastModified?: Date}} =>
              Boolean(entry),
          )

        return {
          entries,
          cacheHint: {
            tags: [cacheTagPrefix],
          },
        }
      } catch (error) {
        return {
          error: new Error(`Failed to load Sanity collection "${loaderIdentity}"`, {cause: error}),
        }
      }
    },
    loadEntry: async ({filter}) => {
      try {
        const params = {
          ...(options.queryParams ?? {}),
          ...(filter.params ?? {}),
          ...(typeof filter.id === 'string' ? {id: filter.id} : {}),
          ...(typeof filter.slug === 'string' ? {slug: filter.slug} : {}),
        }
        const document = await client.fetch<Record<string, unknown> | null>(entryQuery, params)

        if (!document) {
          return undefined
        }

        const data = mapDocument(document, options.mapData)
        const id = options.mapId?.(data) ?? extractString(data[idField]) ?? extractString(data._id)

        if (!id) {
          return {
            error: new Error(`Entry from "${loaderIdentity}" did not include a valid ID field`),
          }
        }

        const tags = [cacheTagPrefix, `${cacheTagPrefix}:${id}`]
        const lastModified = coerceDate(data[lastModifiedField])

        return {
          id,
          data,
          cacheHint: {
            tags,
            ...(lastModified ? {lastModified} : {}),
          },
        }
      } catch (error) {
        return {
          error: new Error(`Failed to load Sanity entry from "${loaderIdentity}"`, {cause: error}),
        }
      }
    },
  }
}

function requireQuery(query: string, optionName: 'collectionQuery' | 'entryQuery', collectionName?: string): string {
  const normalizedQuery = query.trim()
  if (normalizedQuery.length > 0) {
    return normalizedQuery
  }

  const identity = collectionName ?? 'collection'
  throw new Error(`Sanity live loader "${identity}" requires a non-empty "${optionName}" option.`)
}

function mapDocument<TData extends Record<string, unknown>>(
  document: Record<string, unknown>,
  mapData?: (document: Record<string, unknown>) => TData,
): TData {
  if (mapData) {
    return mapData(document)
  }

  return document as TData
}

function extractString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
