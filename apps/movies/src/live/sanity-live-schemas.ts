import {
  sanityLiveLoadermovieCollectionQueryResultSchema,
  sanityLiveLoaderpersonCollectionQueryResultSchema,
  sanityLiveLoaderscreeningCollectionQueryResultSchema,
} from './sanity-live-schemas.generated'

export const movieSchema = sanityLiveLoadermovieCollectionQueryResultSchema.element
export const personSchema = sanityLiveLoaderpersonCollectionQueryResultSchema.element
export const screeningSchema = sanityLiveLoaderscreeningCollectionQueryResultSchema.element
