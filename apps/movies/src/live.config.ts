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

const sanityLiveCollectionConfigs = defineSanityLiveCollections({
  client: sanityClient,
  collections: [
    {
      name: 'movie',
      schema: movieSchema,
      loader: {
        collectionQuery: movieCollectionQuery,
        entryQuery: movieEntryQuery,
      },
    },
    {
      name: 'person',
      schema: personSchema,
      loader: {
        collectionQuery: personCollectionQuery,
        entryQuery: personEntryQuery,
      },
    },
    {
      name: 'screening',
      schema: screeningSchema,
      loader: {
        collectionQuery: screeningCollectionQuery,
        entryQuery: screeningEntryQuery,
      },
    },
  ] as const,
})

export const collections = {
  movie: defineLiveCollection(sanityLiveCollectionConfigs.movie),
  person: defineLiveCollection(sanityLiveCollectionConfigs.person),
  screening: defineLiveCollection(sanityLiveCollectionConfigs.screening),
}
