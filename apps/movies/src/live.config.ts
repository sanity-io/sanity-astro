import { defineLiveCollection } from 'astro:content'
import { defineSanityLiveCollections } from '@sanity/astro/live-loader'
import { sanityClient } from 'sanity:client'
import { movieSchema, personSchema, screeningSchema } from './live/sanity-live-schemas'
import {
  movieCollectionQuery,
  movieEntryQuery,
  personCollectionQuery,
  personEntryQuery,
  screeningCollectionQuery,
  screeningEntryQuery,
} from './live/sanity-live-queries.ts'

const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
const visualEditingToken = import.meta.env.SANITY_API_READ_TOKEN

const liveLoaderVisualEditing = visualEditingEnabled
  ? {
      enabled: true,
      token: visualEditingToken,
    }
  : {
      enabled: false,
    }

const sanityLiveCollectionConfigs = defineSanityLiveCollections({
  client: sanityClient,
  collections: [
    {
      name: 'movie',
      schema: movieSchema,
      loader: {
        collectionQuery: movieCollectionQuery,
        entryQuery: movieEntryQuery,
        visualEditing: liveLoaderVisualEditing,
      },
    },
    {
      name: 'person',
      schema: personSchema,
      loader: {
        collectionQuery: personCollectionQuery,
        entryQuery: personEntryQuery,
        visualEditing: liveLoaderVisualEditing,
      },
    },
    {
      name: 'screening',
      schema: screeningSchema,
      loader: {
        collectionQuery: screeningCollectionQuery,
        entryQuery: screeningEntryQuery,
        visualEditing: liveLoaderVisualEditing,
      },
    },
  ] as const,
})

export const collections = {
  movie: defineLiveCollection(sanityLiveCollectionConfigs.movie),
  person: defineLiveCollection(sanityLiveCollectionConfigs.person),
  screening: defineLiveCollection(sanityLiveCollectionConfigs.screening),
}
