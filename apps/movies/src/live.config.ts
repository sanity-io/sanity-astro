import { defineLiveCollection } from 'astro:content'
import { defineSanityLiveCollectionsFromSchemas } from '@sanity/astro/live-loader'
import { sanityClient } from 'sanity:client'
import { sanityLiveSchemas } from './live/sanity-live-schemas'

const sanityLiveCollectionConfigs = defineSanityLiveCollectionsFromSchemas({
  client: sanityClient,
  schemas: sanityLiveSchemas,
  overrides: {
    person: {
      loader: {
        collectionOrder: 'name asc',
      },
    },
    screening: {
      loader: {
        collectionOrder: 'beginAt desc',
      },
    },
  },
})

export const collections = Object.fromEntries(
  Object.entries(sanityLiveCollectionConfigs).map(([name, config]) => [name, defineLiveCollection(config)]),
)
