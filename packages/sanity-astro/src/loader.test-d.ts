import type {Loader} from 'astro/loaders'
import {sanityClient} from 'sanity:client'
import {describe, expectTypeOf, test} from 'vitest'

import {
  sanityLoader,
  type SanityDocumentLike,
  type SanityLoaderDocument,
  type SanityLoaderOptions,
} from './loader'

type Movie = {_id: string; slug: string; title: string | null}

type BrandedQuery<Result, Params> = string & {__groqResult: Result; __groqParams: Params}

declare const moviesByGenre: BrandedQuery<Movie[], {genre: string}>

declare global {
  interface SanityQueries {
    '*[_type == "registeredMovie"]{_id, slug, title}': Movie[]
  }
}

describe('sanityLoader with a branded query', () => {
  test('types the id callback without a generic', () => {
    sanityLoader({
      client: sanityClient,
      query: moviesByGenre,
      params: {genre: 'drama'},
      id: (movie) => {
        expectTypeOf(movie).toEqualTypeOf<Movie>()
        return movie.slug
      },
    })
  })

  test('rejects params of the wrong type', () => {
    // @ts-expect-error `genre` must be a string
    sanityLoader({client: sanityClient, query: moviesByGenre, params: {genre: 1}})
  })

  test('rejects unknown params', () => {
    sanityLoader({
      client: sanityClient,
      query: moviesByGenre,
      // @ts-expect-error `year` is not a param of this query
      params: {genre: 'drama', year: 2001},
    })
  })

  test('requires every required param once params are given', () => {
    // @ts-expect-error `genre` is missing
    sanityLoader({client: sanityClient, query: moviesByGenre, params: {}})
  })

  test('returns a Loader', () => {
    expectTypeOf(sanityLoader({client: sanityClient, query: moviesByGenre})).toEqualTypeOf<Loader>()
  })

  test('SanityLoaderDocument reads the element type off the brand', () => {
    expectTypeOf<SanityLoaderDocument<typeof moviesByGenre>>().toEqualTypeOf<Movie>()
  })
})

describe('sanityLoader without a brand', () => {
  test('a plain string types documents as SanityDocumentLike', () => {
    sanityLoader({
      client: sanityClient,
      query: '*[_type == "movie"]',
      params: {anything: 'goes'},
      id: (movie) => {
        expectTypeOf(movie).toEqualTypeOf<SanityDocumentLike>()
        return movie._id
      },
    })
  })

  test('an explicit generic types documents as before', () => {
    sanityLoader<{_id: string; slug: string}>({
      client: sanityClient,
      query: '*[_type == "movie"]{_id, "slug": slug.current}',
      params: {anything: 'goes'},
      id: (movie) => {
        expectTypeOf(movie).toEqualTypeOf<{_id: string; slug: string}>()
        return movie.slug
      },
    })
  })

  test('a query registered in SanityQueries types documents like client.fetch does', () => {
    sanityLoader({
      client: sanityClient,
      query: '*[_type == "registeredMovie"]{_id, slug, title}',
      id: (movie) => {
        expectTypeOf(movie).toEqualTypeOf<Movie>()
        return movie.slug
      },
    })
  })

  test('a non-array result falls back to SanityDocumentLike', () => {
    expectTypeOf<
      SanityLoaderDocument<BrandedQuery<Movie | null, Record<string, never>>>
    >().toEqualTypeOf<SanityDocumentLike>()
  })

  test('SanityLoaderOptions keeps its one-argument form', () => {
    expectTypeOf<SanityLoaderOptions<Movie>['query']>().toEqualTypeOf<string>()
    expectTypeOf<SanityLoaderOptions<Movie>['id']>().toEqualTypeOf<
      ((document: Movie) => string) | undefined
    >()
  })
})
