import {sanityLoader} from '@sanity/astro/loader'
import {z} from 'astro/zod'
import {defineCollection} from 'astro:content'
import {sanityClient} from 'sanity:client'

const sanityImage = z.object({
  asset: z.object({url: z.string(), metadata: z.object({lqip: z.string().nullish()}).nullish()}),
  hotspot: z
    .object({x: z.number(), y: z.number(), height: z.number(), width: z.number()})
    .nullish(),
  crop: z
    .object({top: z.number(), bottom: z.number(), left: z.number(), right: z.number()})
    .nullish(),
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
    z.object({_key: z.string(), characterName: z.string().nullish(), person: personSummary}),
  ),
})

type MovieDocument = z.infer<typeof movie>
type PersonDocument = z.infer<typeof personSummary>

// Every required string in the Zod schemas is filtered on in GROQ because the
// Studio schema leaves it optional; one incomplete document would otherwise
// fail `parseData` and abort the build for the whole collection. Strings the
// templates can do without, like `characterName`, stay nullish instead (GROQ
// projects a missing field as null).
// Images keep their crop and hotspot and dereference the asset, so `<SanityImage>`
// gets the asset URL and, when the asset has one, the blur placeholder.
const IMAGE_FUNCTIONS = /* groq */ `
fn image::asset($asset) = $asset->{url, metadata{lqip}};
fn image::field($image) = $image{crop, hotspot, "asset": image::asset(asset)};
`

const MOVIES_QUERY = /* groq */ `${IMAGE_FUNCTIONS}
*[_type == "movie" && defined(title) && defined(slug.current) && defined(poster.asset) && defined(releaseDate)] | order(popularity desc) {
  _id,
  title,
  slug,
  releaseDate,
  "popularity": coalesce(popularity, 0),
  "poster": image::field(poster),
  "overview": coalesce(overview, []),
  "castMembers": coalesce(castMembers[defined(person->name) && defined(person->slug.current)] {
    _key,
    characterName,
    person->{_id, name, "slug": slug.current, "image": select(defined(image.asset) => image::field(image))}
  }, [])
}`

const PEOPLE_QUERY = /* groq */ `${IMAGE_FUNCTIONS}
*[_type == "person" && defined(name) && defined(slug.current)] | order(name asc) {
  _id,
  name,
  "slug": slug.current,
  // A person whose image field was opened but never uploaded carries a bare
  // {_type: "image"} without an asset; normalize those to null here so one
  // such document cannot fail the Zod schema for the whole collection.
  "image": select(defined(image.asset) => image::field(image))
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
