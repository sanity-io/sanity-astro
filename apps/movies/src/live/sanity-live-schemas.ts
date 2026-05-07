import {createSanitySchemaMap} from '@sanity/astro/live-loader/schemas'
import {
  movieDocumentSchema,
  personDocumentSchema,
  screeningDocumentSchema,
} from './sanity-live-schemas.generated'

export const movieSchema = movieDocumentSchema
export const personSchema = personDocumentSchema
export const screeningSchema = screeningDocumentSchema

export const sanityLiveSchemas = createSanitySchemaMap({
  movie: movieSchema,
  person: personSchema,
  screening: screeningSchema,
})
