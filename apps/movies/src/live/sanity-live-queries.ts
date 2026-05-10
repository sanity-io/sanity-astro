/**
 * Keep live collection queries in one place so they can be reused by
 * live.config and by any typegen workflow that reads GROQ query files.
 */
import { defineQuery } from 'groq'

const movieProjection = `{
  _id,
  title,
  releaseDate
}`

export const movieCollectionQuery = defineQuery(`*[_type == "movie"] | order(_updatedAt desc) ${movieProjection}`)

export const movieEntryQuery = defineQuery(
  `*[_type == "movie" && _id == $id][0] ${movieProjection}`,
)

export const personCollectionQuery = defineQuery(`*[_type == "person"] | order(name asc) {
  ...,
}`)

export const screeningCollectionQuery = defineQuery(`*[_type == "screening"] | order(beginAt desc) {
  ...,
}`)
