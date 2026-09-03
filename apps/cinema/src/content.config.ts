import {sanityLoader} from '@sanity/astro/loader'
import {z} from 'astro/zod'
import {defineCollection} from 'astro:content'
import {sanityClient} from 'sanity:client'

const sanityImage = z.object({
  _type: z.literal('image').optional(),
  asset: z.object({_ref: z.string(), _type: z.literal('reference')}),
  hotspot: z
    .object({x: z.number(), y: z.number(), height: z.number(), width: z.number()})
    .optional(),
  crop: z
    .object({top: z.number(), bottom: z.number(), left: z.number(), right: z.number()})
    .optional(),
})

const portableTextBlock = z.looseObject({_key: z.string(), _type: z.string()})

const personSummary = z.object({
  _id: z.string(),
  name: z.string(),
  slug: z.string(),
  image: sanityImage.nullish(),
})

const movie = z.object({
  _id: z.string(),
  title: z.string(),
  slug: z.object({current: z.string()}),
  releaseDate: z.string(),
  popularity: z.number(),
  poster: sanityImage,
  overview: z.array(portableTextBlock),
  castMembers: z.array(
    z.object({_key: z.string(), characterName: z.string(), person: personSummary}),
  ),
})

type MovieDocument = z.infer<typeof movie>
type PersonDocument = z.infer<typeof personSummary>

const MOVIES_QUERY = /* groq */ `*[_type == "movie" && defined(slug.current) && defined(poster.asset)] | order(popularity desc) {
  _id,
  title,
  slug,
  releaseDate,
  popularity,
  poster,
  overview,
  "castMembers": castMembers[defined(person->slug.current)] {
    _key,
    characterName,
    person->{_id, name, "slug": slug.current, image}
  }
}`

const PEOPLE_QUERY = /* groq */ `*[_type == "person" && defined(slug.current)] | order(name asc) {
  _id,
  name,
  "slug": slug.current,
  image
}`

const movies = defineCollection({
  loader: sanityLoader<MovieDocument>({
    client: sanityClient,
    query: MOVIES_QUERY,
    id: (doc) => doc.slug.current,
  }),
  schema: movie,
})

const people = defineCollection({
  loader: sanityLoader<PersonDocument>({
    client: sanityClient,
    query: PEOPLE_QUERY,
    id: (doc) => doc.slug,
  }),
  schema: personSummary,
})

export const collections = {movies, people}
