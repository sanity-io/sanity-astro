import {defineConfig} from 'sanity'
import {structureTool} from 'sanity/structure'
import {schemaTypes} from './schemaTypes'
import {presentationTool} from 'sanity/presentation'

export default defineConfig({
  name: 'default',
  title: 'sanity-astro-movies',

  projectId: '4j2qnyob',
  dataset: 'production',

  plugins: [
    presentationTool({
      previewUrl: process.env.VERCEL_BRANCH_URL
        ? `https://${process.env.VERCEL_BRANCH_URL}`
        : process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : 'http://localhost:4321',
    }),
    structureTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
