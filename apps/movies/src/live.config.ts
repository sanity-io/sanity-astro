import {defineLiveCollection} from 'astro:content'
import {sanityClient} from 'sanity:client'
import {movieLoader, movieSchema} from 'sanity:loader'

const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
const token = import.meta.env.SANITY_API_READ_TOKEN

if (visualEditingEnabled && !token) {
  throw new Error('The `SANITY_API_READ_TOKEN` environment variable is required in Draft Mode.')
}

const client = visualEditingEnabled
  ? sanityClient.withConfig({token, perspective: 'drafts', useCdn: false, stega: true})
  : sanityClient

export const collections = {
  movies: defineLiveCollection({loader: movieLoader({client}), schema: movieSchema}),
}
