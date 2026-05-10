import {
  movieCollectionQueryResultSchema,
  personSchema as personDocumentSchema,
  screeningSchema as screeningDocumentSchema,
} from './sanity-live-schemas.generated'

export const movieSchema = movieCollectionQueryResultSchema.element
export const personSchema = personDocumentSchema
export const screeningSchema = screeningDocumentSchema
