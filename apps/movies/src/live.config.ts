import { defineLiveCollection } from 'astro:content'
import { movieLoader, personLoader, screeningLoader } from 'sanity:loader'
import { sanityClient } from 'sanity:client'
import { movieSchema, personSchema, screeningSchema } from './live/sanity-live-schemas'

const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
const visualEditingToken = import.meta.env.SANITY_API_READ_TOKEN

const loaderVisualEditing = visualEditingEnabled
  ? {
    enabled: true,
    token: visualEditingToken,
  }
  : {
    enabled: false,
  }

const loaderOptions = {
  client: sanityClient,
  visualEditing: loaderVisualEditing,
}

export const collections = {
  movie: defineLiveCollection({
    loader: movieLoader(loaderOptions),
    schema: movieSchema,
  }),
  person: defineLiveCollection({
    loader: personLoader(loaderOptions),
    schema: personSchema,
  }),
  screening: defineLiveCollection({
    loader: screeningLoader(loaderOptions),
    schema: screeningSchema,
  }),
}
