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
  where?: string
  order?: string
  limit?: number
}

export interface SanityLiveLoaderOptions<TData extends Record<string, unknown>> {
  client: SanityClientInput
  type: string
  projection?: string
  baseFilter?: string
  collectionOrder?: string
  collectionLimit?: number
  idField?: string
  slugField?: string
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

export function buildSanityCollectionQuery(options: {
  type: string
  projection: string
  baseFilter?: string
  order?: string
  limit?: number
  where?: string
}): string {
  const filters = [`_type == $type`]

  if (options.baseFilter?.trim()) {
    filters.push(`(${options.baseFilter.trim()})`)
  }

  if (options.where?.trim()) {
    filters.push(`(${options.where.trim()})`)
  }

  const orderClause = options.order?.trim() ? ` | order(${options.order.trim()})` : ''
  const limitClause =
    typeof options.limit === 'number' && Number.isFinite(options.limit) ? `[0...${options.limit}]` : ''

  return `*[${filters.join(' && ')}]${orderClause}${limitClause}${ensureProjection(options.projection)}`
}

export function buildSanityEntryQuery(options: {
  type: string
  projection: string
  baseFilter?: string
  idField: string
  slugField: string
  useSlug: boolean
}): string {
  const filters = [`_type == $type`]

  if (options.baseFilter?.trim()) {
    filters.push(`(${options.baseFilter.trim()})`)
  }

  if (options.useSlug) {
    filters.push(`${options.slugField} == $slug`)
  } else {
    filters.push(`${options.idField} == $id`)
  }

  return `*[${filters.join(' && ')}][0]${ensureProjection(options.projection)}`
}

function ensureProjection(projection: string): string {
  const normalized = projection.trim()
  if (normalized.startsWith('{')) {
    return normalized
  }

  return `{${normalized}}`
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
  const projection = options.projection ?? '{...}'
  const idField = options.idField ?? '_id'
  const slugField = options.slugField ?? 'slug.current'
  const cacheTagPrefix = options.cacheTagPrefix ?? `sanity-${options.type}`
  const lastModifiedField = options.lastModifiedField ?? '_updatedAt'
  const collectionOrder = options.collectionOrder ?? '_updatedAt desc'

  return {
    name: `sanity-live-loader:${options.type}`,
    loadCollection: async ({filter}) => {
      try {
        const query = buildSanityCollectionQuery({
          type: options.type,
          projection,
          baseFilter: options.baseFilter,
          where: filter?.where,
          order: filter?.order ?? collectionOrder,
          limit: filter?.limit ?? options.collectionLimit,
        })
        const params = {
          type: options.type,
          ...(options.queryParams ?? {}),
          ...(filter?.params ?? {}),
        }
        const documents = await client.fetch<Array<Record<string, unknown>>>(query, params)

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
          error: new Error(`Failed to load Sanity collection "${options.type}"`, {cause: error}),
        }
      }
    },
    loadEntry: async ({filter}) => {
      try {
        const useSlug = Boolean(filter.slug && !filter.id)
        const query = buildSanityEntryQuery({
          type: options.type,
          projection,
          baseFilter: options.baseFilter,
          idField,
          slugField,
          useSlug,
        })
        const params = {
          type: options.type,
          ...(options.queryParams ?? {}),
          ...(filter.params ?? {}),
          ...(useSlug ? {slug: filter.slug} : {id: filter.id}),
        }
        const document = await client.fetch<Record<string, unknown> | null>(query, params)

        if (!document) {
          return undefined
        }

        const data = mapDocument(document, options.mapData)
        const id = options.mapId?.(data) ?? extractString(data[idField]) ?? extractString(data._id)

        if (!id) {
          return {
            error: new Error(`Entry from "${options.type}" did not include a valid ID field`),
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
          error: new Error(`Failed to load Sanity entry from "${options.type}"`, {cause: error}),
        }
      }
    },
  }
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
