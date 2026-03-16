import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'
import {defineDocuments, defineLocations, presentationTool} from 'sanity/presentation'
import {DEFAULT_PREVIEW_MODE_ENABLE_PATH} from '@sanity/astro/visual-editing'

const branchUrl =
  (import.meta.env?.['VERCEL_BRANCH_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_BRANCH_URL : undefined)
const productionUrl =
  (import.meta.env?.['VERCEL_PROJECT_PRODUCTION_URL'] as string | undefined) ??
  (typeof process !== 'undefined' ? process.env.VERCEL_PROJECT_PRODUCTION_URL : undefined)

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
        initial: branchUrl
          ? `https://${branchUrl}`
          : productionUrl
            ? `https://${productionUrl}`
            : 'http://localhost:4321',
        preview: '/',
        previewMode: {
          enable: DEFAULT_PREVIEW_MODE_ENABLE_PATH,
        },
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
