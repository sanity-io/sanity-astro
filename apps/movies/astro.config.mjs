// @ts-check
import {defineConfig} from 'astro/config'

import react from '@astrojs/react'
import vercel from '@astrojs/vercel'
import sanity from '@sanity/astro'

// https://astro.build/config
export default defineConfig({
  integrations: [
    sanity({
      projectId: '4j2qnyob',
      dataset: 'production',
      useCdn: true,
      studioBasePath: '/admin',
      studioRouterHistory: 'hash',
      logClientRequests: 'dev',
      live: {
        schema: {
          output: './src/live/sanity-live-schemas.generated.ts',
        },
        loaders: {
          movie: {
            type: 'movie',
            projection: '_id,title,releaseDate,_updatedAt',
            orderBy: ['_updatedAt', 'desc'],
          },
          person: {
            type: 'person',
            projection: '_id,name,_updatedAt',
            orderBy: ['name', 'asc'],
          },
          screening: {
            type: 'screening',
            projection: '_id,movie,screeningDate,theater,_updatedAt',
            orderBy: ['screeningDate', 'asc'],
          },
        },
      },
      stega: {
        studioUrl: {
          baseUrl: '/admin',
          workspace: 'my-workspace',
        },
      },
    }),
    react(),
  ],
  output: 'server',
  adapter: vercel(),
})
