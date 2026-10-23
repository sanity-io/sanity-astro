import {getClient} from 'sanity:client'
import {describe, expectTypeOf, test} from 'vitest'

type Event = {_id: string; name: string}

type EventBySlugParams = {slug: string}

// The shape a `.groq` file import from `@sanity-labs/groq-content-mapper` has
type BrandedQuery<Result, Params> = string & {__groqResult: Result; __groqParams: Params}

declare const eventBySlug: BrandedQuery<Event | null, EventBySlugParams>

declare module 'sanity:client' {
  interface SanityAstroClients {
    community: 'community-project.production'
  }
}

declare global {
  interface SanityQueriesByResource {
    'community-project.production': {
      '*[_type == "event"]': Event[]
    }
  }
}

const community = getClient('community')

describe('a typed named client with a branded query', () => {
  test('infers the result from the brand', async () => {
    const event = await community.fetch(eventBySlug, {slug: 'meetup'})
    expectTypeOf(event).toEqualTypeOf<Event | null>()
  })

  test('infers the raw response with filterResponse: false', async () => {
    const {result} = await community.fetch(eventBySlug, {slug: 'meetup'}, {filterResponse: false})
    expectTypeOf(result).toEqualTypeOf<Event | null>()
  })

  test('rejects params of the wrong type', () => {
    // @ts-expect-error `slug` must be a string
    void community.fetch(eventBySlug, {slug: 1})
  })

  test('rejects unknown params', () => {
    // @ts-expect-error `id` is not a param of this query
    void community.fetch(eventBySlug, {slug: 'meetup', id: 'event-1'})
  })

  test('an explicit generic wins over a brand', async () => {
    const event = await community.fetch<{name: string}>(eventBySlug, {slug: 'meetup'})
    expectTypeOf(event).toEqualTypeOf<{name: string}>()
  })
})

describe('a typed named client without a brand', () => {
  test('a query in the per-resource registry resolves to its registered type', async () => {
    const events = await community.fetch('*[_type == "event"]')
    expectTypeOf(events).toEqualTypeOf<Event[]>()
  })

  test('a plain string resolves to any and takes any params', async () => {
    const events = await community.fetch('*[_type == "event" && city == $city]', {city: 'Oslo'})
    expectTypeOf(events).toBeAny()
  })

  test('an explicit generic wins', async () => {
    const events = await community.fetch<Event[]>('*[_type == "event"]', {})
    expectTypeOf(events).toEqualTypeOf<Event[]>()
  })
})
