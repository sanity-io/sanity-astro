import type {ClientParams, ClientReturn, QueryParams} from '@sanity/client'
import {defineQuery} from 'groq'
import {sanityClient} from 'sanity:client'
import {describe, expectTypeOf, test} from 'vitest'

type Post = {_id: string; title: string}

type PostBySlugParams = {slug: string; lang: string}

// The shape a `.groq` file import from `@sanity-labs/groq-content-mapper` has
type BrandedQuery<Result, Params> = string & {__groqResult: Result; __groqParams: Params}

declare const postBySlug: BrandedQuery<Post | null, PostBySlugParams>

declare global {
  interface SanityQueries {
    '*[_type == "registeredPost"]': Post[]
  }
}

describe('sanityClient.fetch with a branded query', () => {
  test('infers the result without a generic', async () => {
    const post = await sanityClient.fetch(postBySlug, {slug: 'hello', lang: 'en'})
    expectTypeOf(post).toEqualTypeOf<Post | null>()
  })

  test('rejects params of the wrong type', () => {
    // @ts-expect-error `slug` must be a string
    void sanityClient.fetch(postBySlug, {slug: 1, lang: 'en'})
  })

  test('rejects unknown params', () => {
    // @ts-expect-error `id` is not a param of this query
    void sanityClient.fetch(postBySlug, {slug: 'hello', lang: 'en', id: 'post-1'})
  })

  test('requires every required param once params are given', () => {
    // @ts-expect-error `lang` is missing
    void sanityClient.fetch(postBySlug, {slug: 'hello'})
  })

  test('infers the raw response with filterResponse: false', async () => {
    const {result} = await sanityClient.fetch(
      postBySlug,
      {slug: 'hello', lang: 'en'},
      {filterResponse: false},
    )
    expectTypeOf(result).toEqualTypeOf<Post | null>()
  })

  test('is read by ClientReturn and ClientParams', () => {
    expectTypeOf<ClientReturn<typeof postBySlug>>().toEqualTypeOf<Post | null>()
    expectTypeOf<ClientParams<typeof postBySlug>>().toEqualTypeOf<PostBySlugParams>()
  })
})

describe('sanityClient.fetch without a brand', () => {
  test('a plain string resolves to any', async () => {
    const posts = await sanityClient.fetch('*[_type == "post"]')
    expectTypeOf(posts).toBeAny()
  })

  test('an explicit generic wins', async () => {
    const posts = await sanityClient.fetch<Post[]>('*[_type == "post"]', {lang: 'en'})
    expectTypeOf(posts).toEqualTypeOf<Post[]>()
  })

  test('an explicit generic wins over a brand', async () => {
    const post = await sanityClient.fetch<{title: string}>(postBySlug, {slug: 'hello', lang: 'en'})
    expectTypeOf(post).toEqualTypeOf<{title: string}>()
  })

  test('a defineQuery query registered in SanityQueries resolves to its registered type', async () => {
    const query = defineQuery('*[_type == "registeredPost"]')
    const posts = await sanityClient.fetch(query)
    expectTypeOf(posts).toEqualTypeOf<Post[]>()
  })

  test('an unbranded query takes any QueryParams', () => {
    expectTypeOf<ClientParams<'*[_type == "post"]'>>().toEqualTypeOf<QueryParams>()
  })
})

describe('a helper that wraps sanityClient.fetch', () => {
  // The pattern the README recommends for your own wrappers
  async function loadQuery<const Q extends string>(query: Q, params?: ClientParams<Q>) {
    const result: ClientReturn<Q, unknown> = await sanityClient.fetch(query, params ?? {})
    return result
  }

  test('passes the brand through', async () => {
    const post = await loadQuery(postBySlug, {slug: 'hello', lang: 'en'})
    expectTypeOf(post).toEqualTypeOf<Post | null>()

    // @ts-expect-error `lang` is missing
    void loadQuery(postBySlug, {slug: 'hello'})
  })

  test('keeps registered and plain queries as before', async () => {
    expectTypeOf(await loadQuery('*[_type == "registeredPost"]')).toEqualTypeOf<Post[]>()
    expectTypeOf(await loadQuery('*[_type == "post"]', {lang: 'en'})).toBeUnknown()
  })
})
