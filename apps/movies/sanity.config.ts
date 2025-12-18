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
      previewUrl: {
        initial: import.meta.env.VERCEL_BRANCH_URL
          ? `https://${import.meta.env.VERCEL_BRANCH_URL}`
          : import.meta.env.VERCEL_PROJECT_PRODUCTION_URL
            ? `https://${import.meta.env.VERCEL_PROJECT_PRODUCTION_URL}`
            : 'http://localhost:4321',
        preview: '/',
        previewMode: {
          enable: '/api/draft-mode/enable',
        },
      },
    }),
    structureTool(),
  ],

  schema: {
    types: schemaTypes,
  },
})
