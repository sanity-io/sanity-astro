import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'
import {defineDocuments, defineLocations, presentationTool} from 'sanity/presentation'

const branchUrl =
  (import.meta.env?.['VERCEL_BRANCH_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_BRANCH_URL : undefined)
const deployUrl =
  (import.meta.env?.['VERCEL_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_URL : undefined)
const productionUrl =
  (import.meta.env?.['VERCEL_PROJECT_PRODUCTION_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined)
const configuredPreviewOrigin = branchUrl
  ? `https://${branchUrl}`
  : deployUrl
    ? `https://${deployUrl}`
    : productionUrl
      ? `https://${productionUrl}`
      : undefined

const locations = {
  movie: defineLocations({
    select: {
      title: 'title',
      id: '_id',
    },
    resolve: (doc) => ({
      locations: doc?.id ? [{title: doc.title ?? 'Movie', href: `/movies/${doc.id}`}] : [],
    }),
  }),
}

const mainDocuments = defineDocuments([
  {
    route: '/movies/:id',
    filter: `_type == "movie" && _id == $id`,
  },
])

export default defineConfig({
  name: 'default',
  title: 'sanity-astro-movies',

  projectId: '4j2qnyob',
  dataset: 'production',

  plugins: [
    presentationTool({
      previewUrl: {
        initial: async ({origin}) => configuredPreviewOrigin ?? origin,
        preview: '/',
      },
      resolve: {
        locations,
        mainDocuments,
      },
    }),
    structureTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
