import {defineLiveCollection} from 'astro:content'
import {sanityClient} from 'sanity:client'
import {movieLoader, movieSchema} from 'sanity:loader'

const visualEditingEnabled = import.meta.env.PUBLIC_SANITY_VISUAL_EDITING_ENABLED === 'true'
const token = import.meta.env.SANITY_API_READ_TOKEN

// Without a token, Visual Editing still works on published content.
const client = visualEditingEnabled
  ? sanityClient.withConfig({
      perspective: token ? 'drafts' : 'published',
      stega: true,
      useCdn: false,
      ...(token ? {token} : {}),
    })
  : sanityClient

export const collections = {
  movies: defineLiveCollection({loader: movieLoader({client}), schema: movieSchema}),
}
