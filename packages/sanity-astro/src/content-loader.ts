import {createClient, type ClientConfig, type QueryParams} from '@sanity/client'
import type {Loader} from 'astro/loaders'
import {z, type ZodSchema} from 'astro/zod'
import {getSharedSanityClientConfig} from './shared-client-config'

type SanityEntry = Record<string, unknown>

type RefreshContext = {
  fullSync?: boolean
  ids?: string[]
}

type ExplicitSchema =
  | unknown
  | (() => unknown | Promise<unknown>)
  | (() => Promise<{schema: unknown; types: string}>)

type TypegenSchemaOptions = {
  typesPath: string
  entryTypeName?: string
  cwd?: string
  zodFromTypegen?: (props: {
    source: string
    inferredEntryTypeName: string
  }) => unknown | Promise<unknown>
}

type LoaderSchemaOptions = {
  schema?: ExplicitSchema
  types?: string
  entryType?: string
  typegen?: TypegenSchemaOptions
}

type RefreshOptions = {
  strategy?: 'full' | 'incremental'
  cursorMetaKey?: string
  sinceParam?: string
  idsParam?: string
  getCursor?: (entries: SanityEntry[]) => string | undefined
}

type BaseReferenceOptions = {
  maxDepth?: number
  maxNodes?: number
}

type NoReferenceResolution = {
  mode?: 'none'
}

type ShallowReferenceResolution = BaseReferenceOptions & {
  mode: 'shallow'
}

type CustomReferenceResolution = {
  mode: 'custom'
  resolveEntry: (props: {
    entry: SanityEntry
    fetchByIds: (ids: string[]) => Promise<Map<string, SanityEntry>>
  }) => Promise<SanityEntry>
}

type ReferenceResolutionOptions =
  | NoReferenceResolution
  | ShallowReferenceResolution
  | CustomReferenceResolution

type LoaderWithCreateSchema = Loader & {
  createSchema: () => Promise<{schema: ZodSchema; types: string}>
}

type SharedCollectionConfig = {
  sanityType: string
  id?: string | ((entry: SanityEntry) => string)
  transform?: (entry: SanityEntry) => SanityEntry | Promise<SanityEntry>
  schema?: LoaderSchemaOptions
  references?: ReferenceResolutionOptions
}

export type SanityCollectionLoaderOptions = {
  client: ClientConfig
  query: string
  params?: QueryParams
  fetchOptions?: Record<string, unknown>
  id?: string | ((entry: SanityEntry) => string)
  transform?: (entry: SanityEntry) => SanityEntry | Promise<SanityEntry>
  schema?: LoaderSchemaOptions
  references?: ReferenceResolutionOptions
  refresh?: RefreshOptions
}

export type SanityCollectionTypeLoadersOptions = {
  client?: ClientConfig
  collections: Record<string, SharedCollectionConfig>
  query?: string
  params?: QueryParams
  fetchOptions?: Record<string, unknown>
  sharedCacheTtlMs?: number
  globalTypegen?: Omit<TypegenSchemaOptions, 'entryTypeName'> & {
    entryTypeNames?: Record<string, string>
    inferEntryTypeName?: (props: {collectionName: string; sanityType: string}) => string
  }
}

const DEFAULT_CURSOR_META_KEY = 'sanity-loader-cursor'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isSanityReference(value: unknown): value is {_type: 'reference'; _ref: string} {
  return (
    isRecord(value) &&
    value._type === 'reference' &&
    typeof value._ref === 'string' &&
    value._ref.length > 0
  )
}

function cloneEntry(entry: SanityEntry): SanityEntry {
  return structuredClone(entry)
}

function resolveEntryId(id: string | ((entry: SanityEntry) => string) | undefined, entry: SanityEntry): string {
  if (typeof id === 'function') {
    return id(entry)
  }

  const key = id ?? '_id'
  const value = entry[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(
      `[@sanity/astro]: Could not resolve an ID for a loader entry using key "${key}".`,
    )
  }
  return value
}

function collectReferenceIds(value: unknown, target: Set<string>, seen = new WeakSet<object>()) {
  if (isSanityReference(value)) {
    target.add(value._ref)
    return
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return
    }
    seen.add(value)
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectReferenceIds(item, target, seen)
    }
    return
  }

  for (const item of Object.values(value)) {
    collectReferenceIds(item, target, seen)
  }
}

function replaceReferenceNodes(
  value: unknown,
  docsById: Map<string, SanityEntry>,
  counters: {replaced: number; maxNodes: number},
  seen = new WeakSet<object>(),
): unknown {
  if (isSanityReference(value)) {
    if (counters.replaced >= counters.maxNodes) {
      return value
    }
    const replacement = docsById.get(value._ref)
    if (replacement) {
      counters.replaced += 1
      return cloneEntry(replacement)
    }
    return value
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return value
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return value
    }
    seen.add(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceReferenceNodes(item, docsById, counters, seen))
  }

  const next: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    next[key] = replaceReferenceNodes(item, docsById, counters, seen)
  }
  return next
}

async function resolveEntryReferences(
  entries: SanityEntry[],
  references: ReferenceResolutionOptions | undefined,
  fetchByIds: (ids: string[]) => Promise<Map<string, SanityEntry>>,
): Promise<SanityEntry[]> {
  if (!references || references.mode === 'none') {
    return entries
  }

  if (references.mode === 'custom') {
    const resolved: SanityEntry[] = []
    for (const entry of entries) {
      resolved.push(
        await references.resolveEntry({
          entry,
          fetchByIds,
        }),
      )
    }
    return resolved
  }

  const shallowReferences = references
  const maxDepth = shallowReferences.maxDepth ?? 1
  const maxNodes = shallowReferences.maxNodes ?? 1000
  const counters = {replaced: 0, maxNodes}
  const visitedIds = new Set<string>()
  let currentEntries = entries.map(cloneEntry)

  for (let level = 0; level < maxDepth; level += 1) {
    if (counters.replaced >= maxNodes) {
      break
    }

    const allIds = new Set<string>()
    for (const entry of currentEntries) {
      collectReferenceIds(entry, allIds)
    }

    const nextIds = Array.from(allIds).filter((id) => !visitedIds.has(id))
    if (nextIds.length === 0) {
      break
    }

    for (const id of nextIds) {
      visitedIds.add(id)
    }

    const docsById = await fetchByIds(nextIds)
    currentEntries = currentEntries.map((entry) => {
      const replaced = replaceReferenceNodes(entry, docsById, counters)
      return isRecord(replaced) ? replaced : entry
    })
  }

  return currentEntries
}

function ensureEntryTypesSource(types: string | undefined, entryType: string | undefined): string {
  if (types && /export\s+(type|interface)\s+Entry\b/.test(types)) {
    return types
  }

  if (types) {
    return `${types}\n\nexport type Entry = ${entryType ?? 'unknown'}\n`
  }

  return `export type Entry = ${entryType ?? 'unknown'}\n`
}

function inferFirstExportedTypeName(source: string): string | undefined {
  const matches = source.matchAll(/export\s+(?:type|interface)\s+([A-Za-z0-9_]+)/g)
  for (const match of matches) {
    const name = match[1]
    if (name && name !== 'Entry') {
      return name
    }
  }
  return undefined
}

function isAbsolutePath(path: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\/|\\\\)/.test(path)
}

function resolveMaybeRelativePath(path: string, cwd: string): string {
  if (isAbsolutePath(path)) {
    return path
  }

  const normalizedCwd = cwd.replace(/[\\/]+$/, '')
  const normalizedPath = path.replace(/^[.][\\/]/, '')
  return `${normalizedCwd}/${normalizedPath}`
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function getCollectionSchemaConfig(
  collectionName: string,
  collectionConfig: SharedCollectionConfig,
  globalTypegen: SanityCollectionTypeLoadersOptions['globalTypegen'],
): LoaderSchemaOptions | undefined {
  if (collectionConfig.schema) {
    return collectionConfig.schema
  }

  if (!globalTypegen) {
    return undefined
  }

  const entryTypeName =
    globalTypegen.entryTypeNames?.[collectionName] ??
    globalTypegen.inferEntryTypeName?.({
      collectionName,
      sanityType: collectionConfig.sanityType,
    }) ??
    toPascalCase(collectionConfig.sanityType)

  return {
    typegen: {
      ...globalTypegen,
      entryTypeName,
    },
  }
}

function resolveClientConfig(
  explicitClient: ClientConfig | undefined,
  loaderLabel: string,
): ClientConfig {
  const sharedClient = getSharedSanityClientConfig()
  const client = explicitClient ?? sharedClient
  if (!client) {
    throw new Error(
      `[@sanity/astro]: No Sanity client config found for ${loaderLabel}. Pass "client" to the loader or configure the "@sanity/astro" integration in astro.config.*.`,
    )
  }
  return client
}

async function readTypegenTypes(options: TypegenSchemaOptions): Promise<{
  source: string
  inferredEntryTypeName: string
}> {
  const {readFile} = await import('node:fs/promises')
  const cwd = options.cwd ?? process.cwd()
  const filePath = resolveMaybeRelativePath(options.typesPath, cwd)
  const source = await readFile(filePath, 'utf8')

  const explicitEntryName = options.entryTypeName
  const inferredEntryTypeName = explicitEntryName ?? inferFirstExportedTypeName(source) ?? 'unknown'
  const hasExportedEntry = /export\s+(type|interface)\s+Entry\b/.test(source)

  if (explicitEntryName && !new RegExp(`export\\s+(type|interface)\\s+${explicitEntryName}\\b`).test(source)) {
    throw new Error(
      `[@sanity/astro]: Could not find exported type "${explicitEntryName}" in "${options.typesPath}".`,
    )
  }

  return {
    source: hasExportedEntry ? source : `${source}\n\nexport type Entry = ${inferredEntryTypeName}\n`,
    inferredEntryTypeName,
  }
}

async function resolveSchemaConfig(
  config: LoaderSchemaOptions | undefined,
): Promise<{schema: ZodSchema; types: string}> {
  const schemaConfig = config?.schema

  if (typeof schemaConfig === 'function') {
    const resolved = await schemaConfig()
    if (isRecord(resolved) && 'schema' in resolved && 'types' in resolved) {
      return {
        schema: resolved.schema as ZodSchema,
        types: ensureEntryTypesSource(String(resolved.types), config?.entryType),
      }
    }

    return {
      schema: resolved as ZodSchema,
      types: ensureEntryTypesSource(config?.types, config?.entryType),
    }
  }

  if (schemaConfig) {
    return {
      schema: schemaConfig as ZodSchema,
      types: ensureEntryTypesSource(config?.types, config?.entryType),
    }
  }

  if (config?.typegen) {
    if (!config.typegen.zodFromTypegen) {
      throw new Error(
        '[@sanity/astro]: schema.typegen requires a zodFromTypegen callback. Provide one from your app (for example: () => z.object({}).passthrough()).',
      )
    }

    const typegen = await readTypegenTypes(config.typegen)
    const schema = await config.typegen.zodFromTypegen({
      source: typegen.source,
      inferredEntryTypeName: typegen.inferredEntryTypeName,
    })

    return {
      schema: schema as ZodSchema,
      types: ensureEntryTypesSource(typegen.source, config.entryType),
    }
  }

  return {
    schema: z.unknown(),
    types: ensureEntryTypesSource(config?.types, config?.entryType),
  }
}

function getCursorFromEntries(entries: SanityEntry[]): string | undefined {
  let nextCursor: string | undefined
  for (const entry of entries) {
    const updatedAt = entry._updatedAt
    if (typeof updatedAt !== 'string') {
      continue
    }
    if (!nextCursor || updatedAt > nextCursor) {
      nextCursor = updatedAt
    }
  }
  return nextCursor
}

function getDigestInput(value: unknown): Record<string, unknown> | string {
  if (typeof value === 'string') {
    return value
  }
  if (isRecord(value)) {
    return value
  }
  return JSON.stringify(value)
}

export function sanityCollectionLoader(options: SanityCollectionLoaderOptions): LoaderWithCreateSchema {
  const client = createClient(resolveClientConfig(options.client, 'sanityCollectionLoader'))

  return {
    name: 'sanity-astro-build-loader',
    createSchema: async () => {
      return resolveSchemaConfig(options.schema)
    },
    load: async ({store, parseData, generateDigest, meta, refreshContextData, logger}) => {
      const refresh = options.refresh ?? {}
      const params: QueryParams = {...(options.params ?? {})}
      const refreshData = (refreshContextData ?? {}) as RefreshContext
      const strategy = refresh.strategy ?? 'full'
      const cursorMetaKey = refresh.cursorMetaKey ?? DEFAULT_CURSOR_META_KEY
      const sinceParam = refresh.sinceParam ?? 'since'
      const idsParam = refresh.idsParam ?? 'ids'

      if (strategy === 'incremental' && !refreshData.fullSync) {
        const cursor = meta.get(cursorMetaKey)
        if (typeof cursor === 'string' && cursor.length > 0) {
          params[sinceParam] = cursor
        }
      }

      if (Array.isArray(refreshData.ids) && refreshData.ids.length > 0) {
        params[idsParam] = refreshData.ids
      }

      const loaded = await client.fetch<unknown>(
        options.query,
        params,
        options.fetchOptions as Record<string, unknown>,
      )

      if (!Array.isArray(loaded)) {
        throw new Error('[@sanity/astro]: Loader query must return an array of documents.')
      }

      const rawEntries: SanityEntry[] = []
      for (const item of loaded) {
        if (!isRecord(item)) {
          continue
        }
        rawEntries.push(options.transform ? await options.transform(item) : item)
      }

      const fetchByIds = async (ids: string[]) => {
        if (ids.length === 0) {
          return new Map<string, SanityEntry>()
        }

        const docs = await client.fetch<unknown>(
          '*[_id in $ids]',
          {ids},
          options.fetchOptions as Record<string, unknown>,
        )

        const byId = new Map<string, SanityEntry>()
        if (!Array.isArray(docs)) {
          return byId
        }

        for (const doc of docs) {
          if (!isRecord(doc)) {
            continue
          }
          const id = doc._id
          if (typeof id === 'string') {
            byId.set(id, doc)
          }
        }
        return byId
      }

      const entries = await resolveEntryReferences(rawEntries, options.references, fetchByIds)
      const seen = new Set<string>()
      let changedEntries = 0

      for (const entry of entries) {
        const id = resolveEntryId(options.id, entry)
        const data = await parseData({
          id,
          data: entry,
        })
        const digest = generateDigest(getDigestInput(data))
        const updated = store.set({
          id,
          data,
          digest,
        })
        seen.add(id)
        if (updated) {
          changedEntries += 1
        }
      }

      if (strategy === 'full' || refreshData.fullSync) {
        for (const key of store.keys()) {
          if (!seen.has(key)) {
            store.delete(key)
          }
        }
      }

      const nextCursor = refresh.getCursor?.(entries) ?? getCursorFromEntries(entries)
      if (nextCursor) {
        meta.set(cursorMetaKey, nextCursor)
      }
      meta.set('lastSync', new Date().toISOString())

      logger.info(
        `Loaded ${entries.length} entries for "${options.query}" (${changedEntries} changed).`,
      )
    },
  } satisfies LoaderWithCreateSchema
}

export function sanityCollectionTypeLoaders(
  options: SanityCollectionTypeLoadersOptions,
): Record<string, LoaderWithCreateSchema> {
  const client = createClient(resolveClientConfig(options.client, 'sanityCollectionTypeLoaders'))
  const query = options.query ?? '*[_type in $types]'
  const sharedCacheTtlMs = options.sharedCacheTtlMs ?? 1000
  const knownTypes = Array.from(
    new Set(Object.values(options.collections).map((collection) => collection.sanityType)),
  )

  let sharedSnapshot:
    | {
        createdAt: number
        byType: Map<string, SanityEntry[]>
        byId: Map<string, SanityEntry>
      }
    | undefined

  async function fetchSnapshot() {
    if (sharedSnapshot && Date.now() - sharedSnapshot.createdAt < sharedCacheTtlMs) {
      return sharedSnapshot
    }

    const loaded = await client.fetch<unknown>(
      query,
      {
        ...(options.params ?? {}),
        types: knownTypes,
      },
      options.fetchOptions as Record<string, unknown>,
    )

    if (!Array.isArray(loaded)) {
      throw new Error('[@sanity/astro]: Shared loader query must return an array of documents.')
    }

    const byType = new Map<string, SanityEntry[]>()
    const byId = new Map<string, SanityEntry>()

    for (const item of loaded) {
      if (!isRecord(item)) {
        continue
      }

      const sanityType = item._type
      if (typeof sanityType !== 'string') {
        continue
      }

      const current = byType.get(sanityType) ?? []
      current.push(item)
      byType.set(sanityType, current)

      if (typeof item._id === 'string') {
        byId.set(item._id, item)
      }
    }

    sharedSnapshot = {
      createdAt: Date.now(),
      byType,
      byId,
    }

    return sharedSnapshot
  }

  const loaders: Record<string, LoaderWithCreateSchema> = {}
  for (const [collectionName, collectionConfig] of Object.entries(options.collections)) {
    const schemaConfig = getCollectionSchemaConfig(
      collectionName,
      collectionConfig,
      options.globalTypegen,
    )

    loaders[collectionName] = {
      name: `sanity-astro-build-loader:${collectionName}`,
      createSchema: async () => {
        return resolveSchemaConfig(schemaConfig)
      },
      load: async ({store, parseData, generateDigest, meta, logger}) => {
        const snapshot = await fetchSnapshot()
        const sourceEntries = snapshot.byType.get(collectionConfig.sanityType) ?? []
        const transformedEntries: SanityEntry[] = []

        for (const entry of sourceEntries) {
          transformedEntries.push(
            collectionConfig.transform ? await collectionConfig.transform(entry) : entry,
          )
        }

        const fetchByIds = async (ids: string[]) => {
          const byId = new Map<string, SanityEntry>()
          const missingIds: string[] = []

          for (const id of ids) {
            const fromSnapshot = snapshot.byId.get(id)
            if (fromSnapshot) {
              byId.set(id, fromSnapshot)
              continue
            }
            missingIds.push(id)
          }

          if (missingIds.length > 0) {
            const docs = await client.fetch<unknown>(
              '*[_id in $ids]',
              {ids: missingIds},
              options.fetchOptions as Record<string, unknown>,
            )

            if (Array.isArray(docs)) {
              for (const doc of docs) {
                if (!isRecord(doc) || typeof doc._id !== 'string') {
                  continue
                }
                byId.set(doc._id, doc)
              }
            }
          }

          return byId
        }

        const entries = await resolveEntryReferences(
          transformedEntries,
          collectionConfig.references,
          fetchByIds,
        )

        const seen = new Set<string>()
        let changedEntries = 0

        for (const entry of entries) {
          const id = resolveEntryId(collectionConfig.id, entry)
          const data = await parseData({
            id,
            data: entry,
          })
          const digest = generateDigest(getDigestInput(data))
          const updated = store.set({
            id,
            data,
            digest,
          })
          seen.add(id)
          if (updated) {
            changedEntries += 1
          }
        }

        for (const key of store.keys()) {
          if (!seen.has(key)) {
            store.delete(key)
          }
        }

        meta.set('lastSync', new Date().toISOString())
        logger.info(
          `Loaded ${entries.length} entries for "${collectionName}" from type "${collectionConfig.sanityType}" (${changedEntries} changed).`,
        )
      },
    } satisfies LoaderWithCreateSchema
  }

  return loaders
}
