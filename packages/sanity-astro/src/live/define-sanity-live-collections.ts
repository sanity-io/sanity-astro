import type {LiveLoader} from 'astro/loaders'
import type {ZodType} from 'astro/zod'
import {
  sanityLiveLoader,
  type SanityLiveCollectionFilter,
  type SanityLiveEntryFilter,
  type SanityClientInput,
  type SanityLiveLoaderOptions,
} from './sanity-live-loader'

export type SanityExplicitCollectionLoaderOptions<TData extends Record<string, unknown>> = Omit<
  SanityLiveLoaderOptions<TData>,
  'client' | 'collectionName'
> &
  Required<Pick<SanityLiveLoaderOptions<TData>, 'collectionQuery'>>

export interface SanityLiveCollectionDefinition<
  TName extends string = string,
  TSchema extends ZodType<Record<string, unknown>> = ZodType<Record<string, unknown>>,
> {
  name: TName
  schema: TSchema
  loader: SanityExplicitCollectionLoaderOptions<InferSchemaData<TSchema>>
}

export interface DefineSanityLiveCollectionsOptions<
  TCollections extends readonly SanityLiveCollectionDefinition[] = readonly SanityLiveCollectionDefinition[],
> {
  client: SanityClientInput
  collections: TCollections
}

type InferSchemaData<TSchema extends ZodType<Record<string, unknown>>> = TSchema extends ZodType<infer TData>
  ? TData extends Record<string, unknown>
    ? TData
    : Record<string, unknown>
  : Record<string, unknown>

type CollectionData<TCollection extends SanityLiveCollectionDefinition> = TCollection extends SanityLiveCollectionDefinition<
  string,
  infer TSchema
>
  ? InferSchemaData<TSchema>
  : Record<string, unknown>

export type SanityLiveCollectionRecord<TCollections extends readonly SanityLiveCollectionDefinition[]> = {
  [TCollection in TCollections[number] as TCollection['name']]: {
    loader: LiveLoader<CollectionData<TCollection>, SanityLiveEntryFilter, SanityLiveCollectionFilter>
    schema: TCollection['schema']
  }
}

export function defineSanityLiveCollections<const TCollections extends readonly SanityLiveCollectionDefinition[]>(
  options: DefineSanityLiveCollectionsOptions<TCollections>,
) {
  const collections: Record<
    string,
    {
      loader: LiveLoader<Record<string, unknown>, SanityLiveEntryFilter, SanityLiveCollectionFilter>
      schema: ZodType<Record<string, unknown>>
    }
  > = {}

  for (const definition of options.collections) {
    const collectionName = definition.name
    if (collections[collectionName]) {
      throw new Error(`Duplicate Sanity live collection name "${collectionName}"`)
    }

    collections[collectionName] = {
      loader: sanityLiveLoader({
        client: options.client,
        collectionName,
        ...definition.loader,
      }),
      schema: definition.schema,
    }
  }

  return collections as SanityLiveCollectionRecord<TCollections>
}
