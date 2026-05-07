/**
 * This file mirrors the shape produced by Sanity typegen.
 * Regenerate from your schema with:
 * - pnpm sanity:schema:extract
 * - pnpm sanity:typegen
 */

export interface SanitySlug {
  _type: 'slug'
  current?: string
}

export interface SanityReference {
  _type: 'reference'
  _ref: string
}

export interface SanityImage {
  _type: 'image'
  asset?: SanityReference
}

export interface PersonDocument {
  _id: string
  _type: 'person'
  _createdAt?: string
  _updatedAt?: string
  name?: string
  slug?: SanitySlug
  image?: SanityImage
}

export interface MovieDocument {
  _id: string
  _type: 'movie'
  _createdAt?: string
  _updatedAt?: string
  title?: string
  slug?: SanitySlug
  releaseDate?: string
  poster?: SanityImage
}

export interface ScreeningDocument {
  _id: string
  _type: 'screening'
  _createdAt?: string
  _updatedAt?: string
  title?: string
  movie?: SanityReference
  published?: boolean
  beginAt?: string
  endAt?: string
  infoUrl?: string
}
