import type {LiveLoader} from 'astro/loaders'
import type {ZodType} from 'astro/zod'
import {
  sanityLiveLoader,
  type SanityLiveCollectionFilter,
  type SanityLiveEntryFilter,
  type SanityClientInput,
  type SanityLiveLoaderOptions,
} from './sanity-live-loader'

export interface SanityLiveCollectionDefinition<TData extends Record<string, unknown>> {
  schema: ZodType<TData>
  name?: string
  loader?: Omit<SanityLiveLoaderOptions<TData>, 'client' | 'type'>
}

export interface DefineSanityLiveCollectionsOptions {
  client: SanityClientInput
  types: Record<string, SanityLiveCollectionDefinition<Record<string, unknown>>>
}

export interface DefineSanityLiveCollectionsFromSchemasOptions<
  TSchemas extends Record<string, ZodType<Record<string, unknown>>>,
> {
  client: SanityClientInput
  schemas: TSchemas
  overrides?: Partial<
    Record<
      keyof TSchemas,
      {
        name?: string
        loader?: Omit<SanityLiveLoaderOptions<Record<string, unknown>>, 'client' | 'type'>
      }
    >
  >
}

export type SanityLiveCollectionRecord = Record<
  string,
  {
    loader: LiveLoader<Record<string, unknown>, SanityLiveEntryFilter, SanityLiveCollectionFilter>
    schema: ZodType<Record<string, unknown>>
  }
>

export function defineSanityLiveCollections(options: DefineSanityLiveCollectionsOptions) {
  const collections: SanityLiveCollectionRecord = {}

  for (const [typeName, definition] of Object.entries(options.types)) {
    const collectionName = definition.name ?? typeName

    collections[collectionName] = {
      loader: sanityLiveLoader({
        client: options.client,
        type: typeName,
        ...(definition.loader ?? {}),
      }),
      schema: definition.schema,
    }
  }

  return collections
}

export function defineSanityLiveCollectionsFromSchemas<
  TSchemas extends Record<string, ZodType<Record<string, unknown>>>,
>(options: DefineSanityLiveCollectionsFromSchemasOptions<TSchemas>) {
  const typedDefinitions = Object.fromEntries(
    Object.entries(options.schemas).map(([typeName, schema]) => {
      const override = options.overrides?.[typeName as keyof TSchemas]
      return [
        typeName,
        {
          schema,
          ...(override?.name ? {name: override.name} : {}),
          ...(override?.loader ? {loader: override.loader} : {}),
        },
      ]
    }),
  ) as Record<string, SanityLiveCollectionDefinition<Record<string, unknown>>>

  return defineSanityLiveCollections({
    client: options.client,
    types: typedDefinitions,
  })
}
