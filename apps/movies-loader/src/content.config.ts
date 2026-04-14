import {defineCollection} from 'astro:content'
import {sanityCollectionTypeLoaders} from '@sanity/astro'
import {z} from 'astro/zod'

const loaders = sanityCollectionTypeLoaders({
  client: {
    projectId: '4j2qnyob',
    dataset: 'production',
    apiVersion: 'v2023-08-24',
    useCdn: true,
  },
  globalTypegen: {
    typesPath: './sanity.types.ts',
    zodFromTypegen: () => z.any(),
  },
  collections: {
    movies: {
      sanityType: 'movie',
      references: {mode: 'shallow'},
    },
    people: {
      sanityType: 'person',
    },
  },
})

const movies = defineCollection({loader: loaders.movies as any})
const people = defineCollection({loader: loaders.people as any})

export const collections = {movies, people}